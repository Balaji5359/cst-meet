import { useEffect, useRef, useState } from 'react'
import Header from '../components/Header'
import VideoGrid from '../components/VideoGrid'
import ControlBar from '../components/ControlBar'
import NotesPanel from '../components/NotesPanel'
import { getMeetingStatus, leaveMeeting, saveUserNote, saveUserRecording, extractErrorMessage } from '../services/meetApi'
import { WebRTCManager } from '../services/webrtc'

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

function MeetingRoom({ onNavigate, roomPath, user }) {
  const [controls, setControls] = useState(initialControls)
  const [theme, setTheme] = useState('light')
  const [meetingStatus, setMeetingStatus] = useState('Checking...')
  const [statusError, setStatusError] = useState('')
  const [isLeaving, setIsLeaving] = useState(false)
  const [participants, setParticipants] = useState([])
  const [localStream, setLocalStream] = useState(null)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingStatus, setRecordingStatus] = useState('')
  const [isRecordingBusy, setIsRecordingBusy] = useState(false)

  const webrtcRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordingChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const statusPollTimerRef = useRef(null)

  const roomName = roomPath.split('/').at(-1) || ''
  const selfEmail = user?.email || ''
  const selfName = user?.name || user?.email || 'You'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    return () => document.documentElement.setAttribute('data-theme', 'light')
  }, [theme])

  useEffect(() => {
    if (!roomName || !selfEmail) return

    const manager = new WebRTCManager(roomName, selfEmail)
    webrtcRef.current = manager

    manager.onTrack((email, stream) => {
      setParticipants((prev) => {
        const filtered = prev.filter((p) => safeId(p.email) !== safeId(email))
        return [...filtered, { id: email, email, label: email, stream, cameraOn: true }]
      })
    })

    manager.onConnectionState((email, state) => {
      if (state === 'failed' || state === 'closed') {
        setParticipants((prev) => prev.filter((p) => safeId(p.email) !== safeId(email)))
      }
    })

    const init = async () => {
      try {
        const stream = await manager.startMedia()
        setLocalStream(stream)
        manager.connectWebSocket()
        await syncParticipants()
        startStatusPolling()
      } catch (err) {
        setStatusError('Camera or microphone permission denied.')
      }
    }

    init()

    return () => {
      if (statusPollTimerRef.current) clearInterval(statusPollTimerRef.current)
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      manager.cleanup()
    }
  }, [roomName, selfEmail])

  const syncParticipants = async () => {
    if (!roomName) return

    const response = await getMeetingStatus(roomName)
    if (!response.ok) {
      setStatusError(extractErrorMessage(response))
      return
    }

    const data = response.data || {}
    setMeetingStatus((data.status || 'UNKNOWN').toUpperCase())

    const participantsFromApi = Array.isArray(data.participants) ? data.participants : []
    
    for (const p of participantsFromApi) {
      const email = (p.userEmail || p.email || '').trim().toLowerCase()
      if (!email || email === selfEmail.toLowerCase()) continue
      
      const manager = webrtcRef.current
      if (manager && !manager.peerConnections[safeId(email)]) {
        await manager.sendOfferTo(email)
      }
    }

    if (data.status === 'EXPIRED') {
      setTimeout(() => onNavigate('/dashboard'), 1200)
    }
  }

  const startStatusPolling = () => {
    if (statusPollTimerRef.current) clearInterval(statusPollTimerRef.current)
    statusPollTimerRef.current = setInterval(syncParticipants, 5000)
  }

  const handleToggle = (key) => {
    if (key === 'record') {
      if (controls.record) {
        stopRecording()
      } else {
        startRecording()
      }
      return
    }

    setControls((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (key === 'theme') setTheme(next.theme ? 'dark' : 'light')
      
      if (key === 'mute' && localStream) {
        localStream.getAudioTracks().forEach((track) => { track.enabled = !next.mute })
      }
      
      if (key === 'camera' && localStream) {
        localStream.getVideoTracks().forEach((track) => { track.enabled = next.camera })
      }
      
      return next
    })
  }

  const startRecording = () => {
    if (isRecordingBusy || controls.record || !localStream) return

    const approved = window.confirm('Start recording now?')
    if (!approved) return

    try {
      recordingChunksRef.current = []
      const recorder = new MediaRecorder(localStream, { mimeType: 'video/webm' })

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data)
        }
      }

      recorder.start(1000)
      mediaRecorderRef.current = recorder
      setControls((prev) => ({ ...prev, record: true }))
      setRecordingSeconds(0)
      setRecordingStatus('Recording...')
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch {
      setStatusError('Failed to start recording.')
    }
  }

  const stopRecording = async () => {
    if (!controls.record || isRecordingBusy) return

    const recorder = mediaRecorderRef.current
    if (!recorder) {
      setControls((prev) => ({ ...prev, record: false }))
      return
    }

    setIsRecordingBusy(true)

    const stoppedBlob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(recordingChunksRef.current, { type: 'video/webm' }))
      }
      recorder.stop()
    })

    mediaRecorderRef.current = null
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    setControls((prev) => ({ ...prev, record: false }))
    setRecordingStatus('')

    const shouldSave = window.confirm('Save this recording?')
    if (shouldSave) {
      try {
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = String(reader.result || '').split(',')[1]
          const response = await saveUserRecording({
            email: selfEmail,
            meetingid: roomName,
            extension: 'webm',
            mimeType: 'video/webm',
            contentBase64: base64,
          })

          if (!response.ok) {
            setStatusError(extractErrorMessage(response))
          } else {
            setRecordingStatus('Recording saved.')
            setTimeout(() => setRecordingStatus(''), 2200)
          }
        }
        reader.readAsDataURL(stoppedBlob)
      } catch {
        setStatusError('Recording save failed.')
      }
    }

    setRecordingSeconds(0)
    setIsRecordingBusy(false)
  }

  const handleSaveNote = async (text) => {
    const response = await saveUserNote({ email: selfEmail, meetingid: roomName, noteText: text })
    if (!response.ok) {
      setStatusError(extractErrorMessage(response))
      return false
    }
    setStatusError('')
    return true
  }

  const handleLeaveMeeting = async () => {
    const confirmed = window.confirm('Are you sure you want to leave this meeting?')
    if (!confirmed) return

    if (controls.record) await stopRecording()

    setIsLeaving(true)

    if (webrtcRef.current) {
      webrtcRef.current.cleanup()
    }

    const response = await leaveMeeting(roomName, selfEmail)
    setIsLeaving(false)

    if (!response.ok) {
      setStatusError(extractErrorMessage(response))
      return
    }

    onNavigate('/dashboard')
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return (
    <main className="meeting-page">
      <Header title={`Meeting: ${roomName}`} subtitle={`Status: ${meetingStatus}`} />

      {statusError && <p className="api-error">{statusError}</p>}
      {recordingStatus && <p className="api-error">{recordingStatus}</p>}
      {controls.record && <p className="recording-banner">Recording {formatTime(recordingSeconds)}</p>}
      {meetingStatus === 'EXPIRED' && <p className="api-error">Meeting expired. Redirecting...</p>}

      <VideoGrid
        selfName={selfName}
        selfIsHost={false}
        selfIsScreenSharing={false}
        selfIsMuted={controls.mute}
        selfIsRecording={controls.record}
        selfCameraOn={controls.camera}
        localStream={localStream}
        participants={participants}
      />

      <ControlBar
        controls={controls}
        onToggle={handleToggle}
        onLeave={handleLeaveMeeting}
        leaveLabel={isLeaving ? 'Leaving...' : 'Leave'}
      />

      <NotesPanel
        open={controls.notes}
        onClose={() => handleToggle('notes')}
        initialValue=""
        onSave={handleSaveNote}
      />
    </main>
  )
}

export default MeetingRoom
