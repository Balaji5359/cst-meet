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
  const selfUserId = user?.userId || ''
  const selfIsHost = !!hostUserId && !!selfEmail && hostUserId.toLowerCase() === selfEmail.toLowerCase()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    return () => document.documentElement.setAttribute('data-theme', 'light')
  }, [theme])

  const addOrUpdateParticipant = (nextParticipant) => {
    setParticipants((prev) => {
      const filtered = prev.filter((item) => item.id !== nextParticipant.id)
      return [...filtered, nextParticipant]
    })
  }

  const removeParticipant = (participantId) => {
    setParticipants((prev) => prev.filter((item) => item.id !== participantId))
  }

  const sendSignal = (payload) => {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(payload))
  }

  const createPeerConnection = (remoteUserId, remoteEmail = '') => {
    if (peerConnectionsRef.current[remoteUserId]) {
      return peerConnectionsRef.current[remoteUserId]
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      sendSignal({
        action: 'sendIceCandidate',
        meetingId: roomName,
        toUserId: remoteUserId,
        fromUserId: selfUserId,
        candidate: event.candidate,
      })
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (!remoteStream) return

      addOrUpdateParticipant({
        id: remoteUserId,
        label: remoteEmail || remoteUserId,
        email: remoteEmail,
        stream: remoteStream,
        cameraOn: true,
        role: 'PARTICIPANT',
        isHost: false,
      })
    }

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        removeParticipant(remoteUserId)
      }
    }

    peerConnectionsRef.current[remoteUserId] = pc
    return pc
  }

  const handleOffer = async (message) => {
    const fromUserId = message.fromUserId
    if (!fromUserId) return

    const fromEmail = message.fromEmail || ''
    const pc = createPeerConnection(fromUserId, fromEmail)

    await pc.setRemoteDescription(new RTCSessionDescription(message.offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    addOrUpdateParticipant({
      id: fromUserId,
      label: fromEmail || fromUserId,
      email: fromEmail,
      stream: null,
      cameraOn: true,
      role: 'PARTICIPANT',
      isHost: false,
    })

    sendSignal({
      action: 'sendAnswer',
      meetingId: roomName,
      toUserId: fromUserId,
      fromUserId: selfUserId,
      answer,
    })
  }

  const handleAnswer = async (message) => {
    const fromUserId = message.fromUserId
    if (!fromUserId) return

    const pc = peerConnectionsRef.current[fromUserId]
    if (!pc) return

    await pc.setRemoteDescription(new RTCSessionDescription(message.answer))
  }

  const handleIceCandidate = async (message) => {
    const fromUserId = message.fromUserId
    if (!fromUserId || !message.candidate) return

    const pc = peerConnectionsRef.current[fromUserId]
    if (!pc) return

    await pc.addIceCandidate(new RTCIceCandidate(message.candidate))
  }

  const sendOfferTo = async (targetUserId, targetEmail = '') => {
    if (!targetUserId || targetUserId === selfUserId) return

    const pc = createPeerConnection(targetUserId, targetEmail)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    addOrUpdateParticipant({
      id: targetUserId,
      label: targetEmail || targetUserId,
      email: targetEmail,
      stream: null,
      cameraOn: true,
      role: 'PARTICIPANT',
      isHost: false,
    })

    sendSignal({
      action: 'sendOffer',
      meetingId: roomName,
      toUserId: targetUserId,
      fromUserId: selfUserId,
      offer,
    })
  }

  const handleSignalMessage = async (event) => {
    let message = null
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    if (!message?.type) return

    try {
      if (message.type === 'EXISTING_PARTICIPANTS') {
        const existing = Array.isArray(message.participants) ? message.participants : []
        for (const participant of existing) {
          await sendOfferTo(participant.userId, participant.email || '')
        }
      }

      if (message.type === 'PARTICIPANT_JOINED') {
        await sendOfferTo(message.userId, message.email || '')
      }

      if (message.type === 'OFFER') {
        await handleOffer(message)
      }

      if (message.type === 'ANSWER') {
        await handleAnswer(message)
      }

      if (message.type === 'ICE_CANDIDATE') {
        await handleIceCandidate(message)
      }

      if (message.type === 'PARTICIPANT_LEFT' && message.userId) {
        const pc = peerConnectionsRef.current[message.userId]
        if (pc) {
          pc.close()
          delete peerConnectionsRef.current[message.userId]
        }
        removeParticipant(message.userId)
      }
    } catch {
      setStatusError('Realtime connection error occurred.')
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

      if (!SIGNALING_WS_URL) {
        setStatusError('Signaling WebSocket URL is not configured.')
        return
      }

      const socket = new WebSocket(SIGNALING_WS_URL)
      wsRef.current = socket

      socket.onopen = () => {
        sendSignal({
          action: 'JOIN_MEETING',
          meetingId: roomName,
          userId: selfUserId,
          email: selfEmail,
        })
      }

      socket.onmessage = handleSignalMessage

      socket.onclose = () => {
        if (!unmounted) {
          setStatusError('WebSocket disconnected. Reconnect by rejoining meeting.')
        }
      }

      socket.onerror = () => {
        setStatusError('WebSocket signaling failed.')
      }
    }

    if (roomName && selfUserId) {
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
  }, [roomName, selfUserId, selfEmail])

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

      const status = (response.data?.status || 'UNKNOWN').toUpperCase()
      setMeetingStatus(status)

      if (response.data?.hostUserId) {
        setHostUserId(response.data.hostUserId)
      }

      if (Array.isArray(response.data?.participants)) {
        const deduped = new Map()
        response.data.participants.forEach((participant) => {
          const email = (participant?.userEmail || participant?.email || '').trim()
          if (!email) return
          const key = email.toLowerCase()
          if (selfEmail && key === selfEmail.toLowerCase()) return
          if (!deduped.has(key)) {
            deduped.set(key, {
              id: participant.userId || email,
              label: email,
              email,
              stream: null,
              cameraOn: true,
              role: participant.role || 'PARTICIPANT',
              isHost: !!participant.isHost || (hostUserId && key === hostUserId.toLowerCase()),
            })
          }
        })

        setParticipants((prev) => {
          const byEmail = new Map(prev.map((item) => [item.email.toLowerCase(), item]))
          const merged = []

          deduped.forEach((incoming, key) => {
            const existing = byEmail.get(key)
            merged.push(existing ? { ...incoming, stream: existing.stream || null } : incoming)
          })

          return merged
        })
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
  }, [roomName, onNavigate, selfEmail, hostUserId])

  const handleToggle = (key) => {
    setControls((prev) => {
      const next = { ...prev, [key]: !prev[key] }

      if (key === 'theme') {
        setTheme(next.theme ? 'dark' : 'light')
      }

      if (key === 'mute' && localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = next.mute
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

    sendSignal({
      action: 'LEAVE_MEETING',
      meetingId: roomName,
      userId: selfUserId,
      email: selfEmail,
    })

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
