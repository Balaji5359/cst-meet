import { useEffect, useMemo, useState } from 'react'
import Header from '../components/Header'
import VideoGrid from '../components/VideoGrid'
import ControlBar from '../components/ControlBar'
import NotesPanel from '../components/NotesPanel'

const initialControls = {
  camera: true,
  mute: false,
  record: false,
  notes: false,
  theme: false,
}

function MeetingRoom({ onNavigate, roomPath }) {
  const [controls, setControls] = useState(initialControls)
  const [theme, setTheme] = useState('light')

  const roomName = useMemo(() => roomPath.split('/').at(-1) || 'demo-room', [roomPath])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    return () => document.documentElement.setAttribute('data-theme', 'light')
  }, [theme])

  const handleToggle = (key) => {
    setControls((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (key === 'theme') {
        setTheme(next.theme ? 'dark' : 'light')
      }
      return next
    })
  }

  const leaveMeeting = () => onNavigate('/dashboard')

  return (
    <main className="meeting-page">
      <Header title={`Room: ${roomName}`} subtitle="Meeting in progress" />
      <VideoGrid />
      <ControlBar controls={controls} onToggle={handleToggle} onLeave={leaveMeeting} />
      <NotesPanel open={controls.notes} onClose={() => handleToggle('notes')} />
    </main>
  )
}

export default MeetingRoom
