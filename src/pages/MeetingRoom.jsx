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

function MeetingRoom({ onNavigate, roomPath, user }) {
  const [controls, setControls] = useState(initialControls)
  const [theme, setTheme] = useState('light')
  const [meetingStatus, setMeetingStatus] = useState('Checking...')
  const [statusError, setStatusError] = useState('')
  const [isLeaving, setIsLeaving] = useState(false)
  const [hostUserId, setHostUserId] = useState('')
  const [participants, setParticipants] = useState([])
  const [localStream, setLocalStream] = useState(null)

  const wsRef = useRef(null)
  const peerConnectionsRef = useRef({})
  const localStreamRef = useRef(null)

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
  }

  const sendSignal = (payload) => {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(payload))
  }

  const createPeerConnection = (remoteEmail) => {
    const remoteKey = safeId(remoteEmail)
    if (!remoteKey || remoteKey === selfEmailKey) return null

    if (peerConnectionsRef.current[remoteKey]) {
      return peerConnectionsRef.current[remoteKey]
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return

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

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        removeParticipant(remoteEmail)
      }
    }

    peerConnectionsRef.current[remoteKey] = pc
    return pc
  }

  const sendOfferTo = async (targetEmail) => {
    const targetKey = safeId(targetEmail)
    if (!targetKey || targetKey === selfEmailKey) return

    const pc = createPeerConnection(targetEmail)
    if (!pc) return

    if (pc.signalingState !== 'stable') return

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    sendSignal({
      action: 'signal',
      type: 'offer',
      meetingId: roomName,
      from: selfEmail,
      to: targetEmail,
      payload: offer,
    })
  }

  const handleSignalMessage = async (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    const type = (message?.type || '').toLowerCase()
    if (!['offer', 'answer', 'ice', 'candidate'].includes(type)) return

    const fromEmail = (message.from || message.fromEmail || '').trim()
    const toEmail = (message.to || message.toEmail || '').trim()

    if (!fromEmail) return
    if (toEmail && safeId(toEmail) !== selfEmailKey) return

    const remoteKey = safeId(fromEmail)

    try {
      if (type === 'offer') {
        const pc = createPeerConnection(fromEmail)
        if (!pc) return

        const offer = message.payload || message.offer
        if (!offer) return

        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

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
        const answer = message.payload || message.answer
        if (!answer) return
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      }

      if (type === 'ice' || type === 'candidate') {
        const pc = peerConnectionsRef.current[remoteKey]
        if (!pc) return
        const candidate = message.payload || message.candidate
        if (!candidate) return
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch {
      setStatusError('Realtime signaling failed during WebRTC negotiation.')
    }
  }

  useEffect(() => {
    let unmounted = false

    const startMediaAndSignaling = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (unmounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        localStreamRef.current = stream
        setLocalStream(stream)
      } catch {
        setStatusError('Camera or microphone permission denied.')
        return
      }

      const wsUrl = normalizeWsUrl(SIGNALING_WS_URL, roomName, selfEmail)
      if (!wsUrl) {
        setStatusError('Signaling WebSocket URL is not configured.')
        return
      }

      const socket = new WebSocket(wsUrl)
      wsRef.current = socket

      socket.onmessage = handleSignalMessage

      socket.onclose = () => {
        if (!unmounted) {
          setStatusError('WebSocket disconnected. Rejoin meeting to reconnect.')
        }
      }

      socket.onerror = () => {
        setStatusError('WebSocket signaling failed.')
      }
    }

    if (roomName && selfEmail) {
      startMediaAndSignaling()
    }

    return () => {
      unmounted = true

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null

      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close())
      peerConnectionsRef.current = {}

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      localStreamRef.current = null
      setLocalStream(null)
      setParticipants([])
    }
  }, [roomName, selfEmail])

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

      // Initiate offers to participants we know but don't have peer connection for yet.
      for (const participant of deduped.values()) {
        const key = safeId(participant.email)
        if (!peerConnectionsRef.current[key]) {
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

    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close())
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
      setStatusError(extractErrorMessage(response))
      return
    }

    onNavigate('/dashboard')
  }

  return (
    <main className="meeting-page">
      <Header title={`Meeting: ${roomName}`} subtitle={`Status: ${meetingStatus}`} />

      {statusError ? <p className="api-error">{statusError}</p> : null}
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
