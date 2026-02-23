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
  screenshare: false,
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
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [canScrollTop, setCanScrollTop] = useState(false)
  const [canScrollBottom, setCanScrollBottom] = useState(false)
  const [participantsScroll, setParticipantsScroll] = useState({ canPrev: false, canNext: false })

  const wsRef = useRef(null)
  const wsReadyRef = useRef(false)
  const peerConnectionsRef = useRef({})
  const localStreamRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const pendingIceCandidatesRef = useRef({})
  const pendingSignalsRef = useRef([])
  const reconnectTimersRef = useRef({})
  const wsReconnectTimerRef = useRef(null)
  const isLeavingRef = useRef(false)
  const participantsScrollRef = useRef(null)

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

  useEffect(() => {
    const onScroll = () => {
      const top = window.scrollY
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      setCanScrollTop(top > 120)
      setCanScrollBottom(maxScroll - top > 120)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

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

  const sendParticipantState = (nextControls) => {
    sendSignal({
      action: 'signal',
      type: 'state',
      meetingId: roomName,
      from: selfEmail,
      payload: {
        mute: !!nextControls.mute,
        camera: !!nextControls.camera,
        record: !!nextControls.record,
      },
    })
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

  const replaceOutgoingVideoTrack = async (newTrack) => {
    const peerConnections = Object.values(peerConnectionsRef.current)

    for (const pc of peerConnections) {
      const sender = pc
        .getSenders()
        .find((currentSender) => currentSender.track && currentSender.track.kind === 'video')

      if (sender) {
        // eslint-disable-next-line no-await-in-loop
        await sender.replaceTrack(newTrack)
      }
    }
  }

  const stopScreenShare = async () => {
    if (!isScreenSharing) return

    const displayStream = screenStreamRef.current
    if (displayStream) {
      displayStream.getTracks().forEach((track) => track.stop())
    }
    screenStreamRef.current = null

    const cameraStream = cameraStreamRef.current
    const cameraTrack = cameraStream?.getVideoTracks()?.[0] || null

    if (cameraTrack) {
      cameraTrack.enabled = controls.camera
      try {
        await replaceOutgoingVideoTrack(cameraTrack)
      } catch (error) {
        console.error('[WebRTC] Failed to restore camera track', error)
      }

      localStreamRef.current = cameraStream
      setLocalStream(cameraStream)
    }

    setIsScreenSharing(false)
    setControls((prev) => ({ ...prev, screenshare: false }))
  }

  const startScreenShare = async () => {
    if (!cameraStreamRef.current) {
      setStatusError('Camera stream is not ready yet.')
      return
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const displayTrack = displayStream.getVideoTracks()[0]
      if (!displayTrack) return

      displayTrack.onended = () => {
        stopScreenShare().catch(() => {})
      }

      await replaceOutgoingVideoTrack(displayTrack)

      const previewTracks = [displayTrack]
      const audioTrack = cameraStreamRef.current.getAudioTracks()[0]
      if (audioTrack) previewTracks.push(audioTrack)

      const previewStream = new MediaStream(previewTracks)
      localStreamRef.current = previewStream
      setLocalStream(previewStream)
      screenStreamRef.current = displayStream
      setIsScreenSharing(true)
      setControls((prev) => ({ ...prev, screenshare: true }))
      setStatusError('')
    } catch {
      setStatusError('Screen share was cancelled or blocked.')
    }
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
    if (!['offer', 'answer', 'ice', 'state'].includes(type)) return

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

        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        await flushPendingIceCandidates(remoteKey, pc)

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

        const answer = message.payload || message.data || message.answer
        if (!answer) return

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

        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }

      if (type === 'state') {
        const next = message.payload || message.data || {}

        setParticipants((prev) =>
          prev.map((item) => {
            const currentKey = safeId(item.email || item.id)
            if (currentKey !== remoteKey) return item
            return {
              ...item,
              isMuted: !!next.mute,
              cameraOn: next.camera !== false,
              isRecording: !!next.record,
            }
          }),
        )
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

      const socket = new WebSocket(wsUrl)
      wsRef.current = socket
      wsReadyRef.current = false

      socket.onopen = () => {
        wsReadyRef.current = true
        setStatusError('')
        flushPendingSignals()
        sendParticipantState(controls)
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

        cameraStreamRef.current = stream
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

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      screenStreamRef.current = null

      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      cameraStreamRef.current = null

      localStreamRef.current = null
      pendingIceCandidatesRef.current = {}
      pendingSignalsRef.current = []
      Object.values(reconnectTimersRef.current).forEach((timerId) => window.clearTimeout(timerId))
      reconnectTimersRef.current = {}
      setLocalStream(null)
      setParticipants([])
      setIsScreenSharing(false)
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

  const handleScreenShareToggle = async () => {
    if (isScreenSharing) {
      await stopScreenShare()
      return
    }

    await startScreenShare()
  }

  const handleToggle = (key) => {
    if (key === 'screenshare') {
      handleScreenShareToggle().catch((error) => {
        console.error('[WebRTC] Screen share toggle failed', error)
        setStatusError('Unable to toggle screen share.')
      })
      return
    }

    setControls((prev) => {
      const next = { ...prev, [key]: !prev[key] }

      if (key === 'theme') {
        setTheme(next.theme ? 'dark' : 'light')
      }

      if (key === 'mute' && cameraStreamRef.current) {
        cameraStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next.mute
        })
      }

      if (key === 'camera' && cameraStreamRef.current) {
        cameraStreamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = next.camera
        })
      }

      if (key === 'mute' || key === 'camera' || key === 'record') {
        sendParticipantState(next)
      }

      return next
    })
  }

  const handleLeaveMeeting = async () => {
    const confirmed = window.confirm('Are you sure you want to leave this meeting?')
    if (!confirmed) return

    setIsLeaving(true)
    isLeavingRef.current = true

    await stopScreenShare()

    Object.keys(peerConnectionsRef.current).forEach((key) => clearPeerConnection(key))
    peerConnectionsRef.current = {}

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    cameraStreamRef.current = null

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

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleScrollBottom = () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const updateParticipantsScroll = () => {
    const node = participantsScrollRef.current
    if (!node) return

    const horizontal = node.scrollWidth > node.clientWidth + 4
    const next = horizontal
      ? {
          canPrev: node.scrollLeft > 8,
          canNext: node.scrollLeft + node.clientWidth < node.scrollWidth - 8,
        }
      : {
          canPrev: node.scrollTop > 8,
          canNext: node.scrollTop + node.clientHeight < node.scrollHeight - 8,
        }

    setParticipantsScroll((prev) =>
      prev.canPrev === next.canPrev && prev.canNext === next.canNext ? prev : next,
    )
  }

  const registerParticipantsScroller = (node) => {
    if (participantsScrollRef.current === node) return
    participantsScrollRef.current = node
  }

  const handleParticipantsScroll = (direction) => {
    const node = participantsScrollRef.current
    if (!node) return

    const horizontal = node.scrollWidth > node.clientWidth + 4
    const amount = horizontal ? Math.round(node.clientWidth * 0.86) : Math.round(node.clientHeight * 0.72)

    if (horizontal) {
      node.scrollBy({ left: direction > 0 ? amount : -amount, behavior: 'smooth' })
    } else {
      node.scrollBy({ top: direction > 0 ? amount : -amount, behavior: 'smooth' })
    }
    window.setTimeout(updateParticipantsScroll, 220)
  }

  useEffect(() => {
    const node = participantsScrollRef.current
    if (!node) return undefined

    const onScroll = () => updateParticipantsScroll()
    node.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()

    return () => {
      node.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [participants.length])

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
        selfIsScreenSharing={isScreenSharing}
        selfIsMuted={controls.mute}
        selfIsRecording={controls.record}
        selfCameraOn={controls.camera}
        localStream={localStream}
        participants={participants}
        onParticipantsContainerReady={registerParticipantsScroller}
        participantsScroll={participantsScroll}
        onParticipantsScroll={handleParticipantsScroll}
      />

      <ControlBar controls={controls}
        onToggle={handleToggle}
        onLeave={handleLeaveMeeting}
        leaveLabel={isLeaving ? 'Leaving...' : 'Leave'}
      />

      <NotesPanel open={controls.notes} onClose={() => handleToggle('notes')} />

      <div className="scroll-fabs">
        <button
          type="button"
          className="scroll-fab"
          onClick={handleScrollTop}
          aria-label="Scroll to top"
          disabled={!canScrollTop}
        >
          Top
        </button>
        <button
          type="button"
          className="scroll-fab"
          onClick={handleScrollBottom}
          aria-label="Scroll to bottom"
          disabled={!canScrollBottom}
        >
          Down
        </button>
      </div>
    </main>
  )
}

export default MeetingRoom
















