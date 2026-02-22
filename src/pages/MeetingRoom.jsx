import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '../components/Header'
import VideoGrid from '../components/VideoGrid'
import ControlBar from '../components/ControlBar'
import NotesPanel from '../components/NotesPanel'
import { extractErrorMessage, getMeetingStatus, leaveMeeting } from '../services/meetApi'
import { ICE_SERVERS, SIGNALING_WS_URL } from '../config/realtime'

const initialControls = {
  camera: true,
  mute: false,
  record: false,
  notes: false,
  theme: false,
}

function safeId(value = '') {
  return String(value).trim().toLowerCase()
}

function normalizeWsUrl(baseUrl, meetingId, email) {
  if (!baseUrl) return ''
  const trimmed = baseUrl.trim()
  const separator = trimmed.includes('?') ? '&' : '?'
  return `${trimmed}${separator}meetingId=${encodeURIComponent(meetingId)}&email=${encodeURIComponent(email)}`
}

function shouldInitiateOffer(selfEmail, targetEmail) {
  return safeId(selfEmail) < safeId(targetEmail)
}

function MeetingRoom({ onNavigate, roomPath, user }) {
  const [controls, setControls] = useState(initialControls)
  const [theme, setTheme] = useState('light')
  const [meetingStatus, setMeetingStatus] = useState('Checking...')
  const [statusError, setStatusError] = useState('')
  const [isLeaving, setIsLeaving] = useState(false)
  const [mediaBlocked, setMediaBlocked] = useState(false)
  const [mediaRetryTick, setMediaRetryTick] = useState(0)
  const [hostUserId, setHostUserId] = useState('')
  const [participants, setParticipants] = useState([])
  const [localStream, setLocalStream] = useState(null)

  const wsRef = useRef(null)
  const wsReadyRef = useRef(false)
  const peerConnectionsRef = useRef({})
  const localStreamRef = useRef(null)
  const pendingIceCandidatesRef = useRef({})
  const pendingSignalsRef = useRef([])
  const reconnectTimersRef = useRef({})
  const wsReconnectTimerRef = useRef(null)
  const isLeavingRef = useRef(false)

  const roomName = useMemo(() => roomPath.split('/').at(-1) || '', [roomPath])
  const selfName = user?.name || user?.email || 'You'
  const selfEmail = user?.email || ''
  const selfEmailKey = safeId(selfEmail)
  const selfUserId = user?.userId || ''
  const selfIsHost =
    !!hostUserId &&
    !!selfEmail &&
    (safeId(hostUserId) === selfEmailKey || safeId(hostUserId) === safeId(selfUserId))

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    return () => document.documentElement.setAttribute('data-theme', 'light')
  }, [theme])

  const addOrUpdateParticipant = (nextParticipant) => {
    const key = safeId(nextParticipant.email || nextParticipant.id)
    if (!key || key === selfEmailKey) return

    setParticipants((prev) => {
      const filtered = prev.filter((item) => safeId(item.email || item.id) !== key)
      return [...filtered, nextParticipant]
    })
  }

  const removeParticipant = (participantKey) => {
    const key = safeId(participantKey)
    if (!key) return
    setParticipants((prev) => prev.filter((item) => safeId(item.email || item.id) !== key))
    delete pendingIceCandidatesRef.current[key]
  }

  const clearReconnectTimer = (participantKey) => {
    const key = safeId(participantKey)
    if (!key) return

    const timer = reconnectTimersRef.current[key]
    if (timer) {
      window.clearTimeout(timer)
      delete reconnectTimersRef.current[key]
    }
  }

  const clearPeerConnection = (participantKey) => {
    const key = safeId(participantKey)
    if (!key) return

    const existing = peerConnectionsRef.current[key]
    if (existing) {
      try {
        existing.onicecandidate = null
        existing.ontrack = null
        existing.onconnectionstatechange = null
        existing.oniceconnectionstatechange = null
        existing.close()
      } catch {
        // ignore close errors
      }
      delete peerConnectionsRef.current[key]
    }

    delete pendingIceCandidatesRef.current[key]
    clearReconnectTimer(key)
  }

  const flushPendingSignals = () => {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    const queued = pendingSignalsRef.current
    pendingSignalsRef.current = []

    queued.forEach((payload) => {
      socket.send(JSON.stringify(payload))
    })
  }

  const sendSignal = (payload) => {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      pendingSignalsRef.current.push(payload)
      return
    }
    socket.send(JSON.stringify(payload))
  }

  const flushPendingIceCandidates = async (remoteKey, pc) => {
    const queued = pendingIceCandidatesRef.current[remoteKey] || []
    if (!queued.length) return

    pendingIceCandidatesRef.current[remoteKey] = []

    for (const candidate of queued) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        console.error('[WebRTC] Failed to flush ICE candidate', error)
      }
    }
  }

  const queueIceCandidate = (remoteKey, candidate) => {
    if (!pendingIceCandidatesRef.current[remoteKey]) {
      pendingIceCandidatesRef.current[remoteKey] = []
    }
    pendingIceCandidatesRef.current[remoteKey].push(candidate)
  }

  const sendOfferTo = async (targetEmail) => {
    const targetKey = safeId(targetEmail)
    if (!targetKey || targetKey === selfEmailKey) return
    if (!shouldInitiateOffer(selfEmail, targetEmail)) return
    if (!wsReadyRef.current) return

    const pc = createPeerConnection(targetEmail)
    if (!pc) return

    if (pc.signalingState !== 'stable') {
      if (pc.signalingState === 'have-local-offer') {
        try {
          await pc.setLocalDescription({ type: 'rollback' })
        } catch (error) {
          console.error('[WebRTC] Failed to rollback stale offer for', targetEmail, error)
          return
        }
      } else {
        return
      }
    }

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      console.log('[WebRTC] Sending offer to', targetEmail)

      sendSignal({
        action: 'signal',
        type: 'offer',
        meetingId: roomName,
        from: selfEmail,
        to: targetEmail,
        payload: offer,
      })
    } catch (error) {
      console.error('[WebRTC] Failed to send offer', error)
    }
  }

  const createPeerConnection = (remoteEmail) => {
    const remoteKey = safeId(remoteEmail)
    if (!remoteKey || remoteKey === selfEmailKey) return null

    if (peerConnectionsRef.current[remoteKey]) {
      return peerConnectionsRef.current[remoteKey]
    }

    clearReconnectTimer(remoteKey)

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return

      console.log('[WebRTC] Sending ICE candidate to', remoteEmail)

      sendSignal({
        action: 'signal',
        type: 'ice',
        meetingId: roomName,
        from: selfEmail,
        to: remoteEmail,
        payload: event.candidate,
      })
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (!remoteStream) return

      console.log('[WebRTC] Remote track received from', remoteEmail)

      addOrUpdateParticipant({
        id: remoteEmail,
        label: remoteEmail,
        email: remoteEmail,
        stream: remoteStream,
        cameraOn: true,
        role: 'PARTICIPANT',
        isHost:
          !!hostUserId &&
          (safeId(hostUserId) === remoteKey || safeId(hostUserId) === safeId(remoteEmail)),
      })
    }

    const schedulePeerReconnect = (delayMs = 1200) => {
      const retryKey = safeId(remoteEmail)
      clearReconnectTimer(retryKey)
      reconnectTimersRef.current[retryKey] = window.setTimeout(() => {
        delete reconnectTimersRef.current[retryKey]
        clearPeerConnection(remoteEmail)
        removeParticipant(remoteEmail)
        if (wsReadyRef.current) {
          sendOfferTo(remoteEmail)
        }
      }, delayMs)
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearReconnectTimer(remoteEmail)
        return
      }

      if (pc.connectionState === 'disconnected') {
        schedulePeerReconnect(3500)
        return
      }

      if (pc.connectionState === 'failed') {
        console.log('[WebRTC] Connection state failed for', remoteEmail)
        schedulePeerReconnect(800)
        return
      }

      if (pc.connectionState === 'closed') {
        clearPeerConnection(remoteEmail)
        removeParticipant(remoteEmail)
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        console.log('[WebRTC] ICE state failed for', remoteEmail)
        schedulePeerReconnect(600)
      }
    }

    peerConnectionsRef.current[remoteKey] = pc
    return pc
  }

  const handleSignalMessage = async (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    const type = (message?.type || '').toLowerCase()
    if (!['offer', 'answer', 'ice'].includes(type)) return

    const fromEmail = (message.from || message.fromEmail || '').trim()
    const toEmail = (message.to || message.toEmail || '').trim()

    if (!fromEmail) return
    if (toEmail && safeId(toEmail) !== selfEmailKey) return

    const remoteKey = safeId(fromEmail)

    try {
      if (type === 'offer') {
        const pc = createPeerConnection(fromEmail)
        if (!pc) return

        const offer = message.payload || message.data || message.offer
        if (!offer) return

        if (pc.signalingState !== 'stable') {
          await pc.setLocalDescription({ type: 'rollback' })
        }

        console.log('[WebRTC] Received offer from', fromEmail)
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        await flushPendingIceCandidates(remoteKey, pc)

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        console.log('[WebRTC] Sending answer to', fromEmail)

        sendSignal({
          action: 'signal',
          type: 'answer',
          meetingId: roomName,
          from: selfEmail,
          to: fromEmail,
          payload: answer,
        })

        addOrUpdateParticipant({
          id: fromEmail,
          label: fromEmail,
          email: fromEmail,
          stream: null,
          cameraOn: true,
          role: 'PARTICIPANT',
          isHost:
            !!hostUserId &&
            (safeId(hostUserId) === remoteKey || safeId(hostUserId) === safeId(fromEmail)),
        })
      }

      if (type === 'answer') {
        const pc = peerConnectionsRef.current[remoteKey]
        if (!pc) return

        const answer = message.payload || message.data || message.answer
        if (!answer) return

        console.log('[WebRTC] Received answer from', fromEmail)
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        await flushPendingIceCandidates(remoteKey, pc)
      }

      if (type === 'ice') {
        const candidate = message.payload || message.data || message.candidate
        if (!candidate) return

        const pc = peerConnectionsRef.current[remoteKey]
        if (!pc || !pc.remoteDescription) {
          queueIceCandidate(remoteKey, candidate)
          return
        }

        console.log('[WebRTC] Received ICE from', fromEmail)
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch (error) {
      console.error('[WebRTC] Negotiation error', error)
      setStatusError('Realtime signaling failed during WebRTC negotiation.')
    }
  }

  useEffect(() => {
    let unmounted = false

    const connectWebSocket = () => {
      const wsUrl = normalizeWsUrl(SIGNALING_WS_URL, roomName, selfEmail)
      if (!wsUrl) {
        setStatusError('Signaling WebSocket URL is not configured.')
        return
      }

      console.log('[WebSocket] Connecting:', wsUrl)
      const socket = new WebSocket(wsUrl)
      wsRef.current = socket
      wsReadyRef.current = false

      socket.onopen = () => {
        console.log('[WebSocket] Connected')
        wsReadyRef.current = true
        setStatusError('')
        flushPendingSignals()
      }

      socket.onmessage = handleSignalMessage

      socket.onclose = () => {
        wsReadyRef.current = false
        if (!unmounted && !isLeavingRef.current) {
          setStatusError('Realtime disconnected. Reconnecting...')
          if (!wsReconnectTimerRef.current) {
            wsReconnectTimerRef.current = window.setTimeout(() => {
              wsReconnectTimerRef.current = null
              connectWebSocket()
            }, 1500)
          }
        }
      }

      socket.onerror = () => {
        wsReadyRef.current = false
        if (!unmounted && !isLeavingRef.current) {
          setStatusError('WebSocket signaling failed. Reconnecting...')
        }
      }
    }

    const startMediaAndSignaling = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (unmounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        localStreamRef.current = stream
        setLocalStream(stream)
        setMediaBlocked(false)
      } catch {
        setMediaBlocked(true)
        setStatusError('Camera or microphone permission denied.')
        return
      }

      connectWebSocket()
    }

    if (roomName && selfEmail) {
      startMediaAndSignaling()
    }

    return () => {
      unmounted = true

      if (wsReconnectTimerRef.current) {
        window.clearTimeout(wsReconnectTimerRef.current)
        wsReconnectTimerRef.current = null
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null
      wsReadyRef.current = false

      Object.keys(peerConnectionsRef.current).forEach((key) => clearPeerConnection(key))
      peerConnectionsRef.current = {}

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      localStreamRef.current = null
      pendingIceCandidatesRef.current = {}
      pendingSignalsRef.current = []
      Object.values(reconnectTimersRef.current).forEach((timerId) => window.clearTimeout(timerId))
      reconnectTimersRef.current = {}
      setLocalStream(null)
      setParticipants([])
    }
  }, [roomName, selfEmail, mediaRetryTick])

  useEffect(() => {
    let cancelled = false

    const syncMeetingStatus = async () => {
      if (!roomName) return

      const response = await getMeetingStatus(roomName)
      if (cancelled) return

      if (!response.ok) {
        setStatusError(extractErrorMessage(response))
        return
      }

      const data = response.data || {}
      const status = (data.status || 'UNKNOWN').toUpperCase()
      setMeetingStatus(status)

      const hostId = (data.hostUserId || '').trim()
      setHostUserId(hostId)

      const participantsFromApi = Array.isArray(data.participants) ? data.participants : []
      const deduped = new Map()

      participantsFromApi.forEach((participant) => {
        const email = (participant?.userEmail || participant?.email || '').trim()
        if (!email) return

        const key = safeId(email)
        if (!key || key === selfEmailKey || deduped.has(key)) return

        deduped.set(key, {
          id: email,
          label: email,
          email,
          stream: null,
          cameraOn: true,
          role: participant?.role || 'PARTICIPANT',
          isHost: !!participant?.isHost || (!!hostId && safeId(hostId) === key),
        })
      })

      setParticipants((prev) => {
        const prevByKey = new Map(prev.map((item) => [safeId(item.email || item.id), item]))
        const merged = []

        deduped.forEach((incoming, key) => {
          const existing = prevByKey.get(key)
          merged.push(existing ? { ...incoming, stream: existing.stream || null } : incoming)
        })

        return merged
      })

      for (const participant of deduped.values()) {
        const key = safeId(participant.email)
        if (!peerConnectionsRef.current[key] && wsReadyRef.current) {
          // eslint-disable-next-line no-await-in-loop
          await sendOfferTo(participant.email)
        }
      }

      if (status === 'EXPIRED') {
        window.setTimeout(() => onNavigate('/dashboard'), 1200)
      }
    }

    syncMeetingStatus()
    const timerId = window.setInterval(syncMeetingStatus, 30000)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [roomName, onNavigate, selfEmailKey])

  const handleToggle = (key) => {
    setControls((prev) => {
      const next = { ...prev, [key]: !prev[key] }

      if (key === 'theme') {
        setTheme(next.theme ? 'dark' : 'light')
      }

      if (key === 'mute' && localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next.mute
        })
      }

      if (key === 'camera' && localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = next.camera
        })
      }

      return next
    })
  }

  const handleLeaveMeeting = async () => {
    const confirmed = window.confirm('Are you sure you want to leave this meeting?')
    if (!confirmed) return

    setIsLeaving(true)
    isLeavingRef.current = true

    Object.keys(peerConnectionsRef.current).forEach((key) => clearPeerConnection(key))
    peerConnectionsRef.current = {}

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    localStreamRef.current = null
    setLocalStream(null)

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    const response = await leaveMeeting(roomName, selfEmail)
    setIsLeaving(false)

    if (!response.ok) {
      isLeavingRef.current = false
      setStatusError(extractErrorMessage(response))
      return
    }

    onNavigate('/dashboard')
  }


  const handleEnableMedia = () => {
    setStatusError('')
    setMediaRetryTick((value) => value + 1)
  }
  return (
    <main className="meeting-page">
      <Header title={`Meeting: ${roomName}`} subtitle={`Status: ${meetingStatus}`} />

      {statusError ? <p className="api-error">{statusError}</p> : null}
      {mediaBlocked && !localStream ? (
        <button className="control-btn active" onClick={handleEnableMedia}>
          Enable Camera & Mic
        </button>
      ) : null}
      {meetingStatus === 'EXPIRED' ? (
        <p className="api-error">Meeting expired. Redirecting to dashboard...</p>
      ) : null}

      <VideoGrid
        selfName={selfName}
        selfIsHost={selfIsHost}
        localStream={localStream}
        participants={participants}
      />

      <ControlBar
        controls={controls}
        onToggle={handleToggle}
        onLeave={handleLeaveMeeting}
        leaveLabel={isLeaving ? 'Leaving...' : 'Leave'}
      />

      <NotesPanel open={controls.notes} onClose={() => handleToggle('notes')} />
    </main>
  )
}

export default MeetingRoom
