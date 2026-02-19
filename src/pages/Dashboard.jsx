import { useState } from 'react'
import Header from '../components/Header'

function Dashboard({ onNavigate }) {
  const [roomId, setRoomId] = useState('')

  const goToMeeting = () => {
    onNavigate('/meeting/demo-room')
  }

  const joinRoom = () => {
    const cleanedRoom = roomId.trim() || 'demo-room'
    onNavigate(`/meeting/${cleanedRoom}`)
  }

  return (
    <main className="dashboard-page">
      <Header
        title="MeetLite"
        subtitle="Create or join a meeting room"
        rightSlot={<div className="avatar-placeholder">U</div>}
      />
      <section className="dashboard-card">
        <label htmlFor="room-id">Room ID</label>
        <input
          id="room-id"
          type="text"
          value={roomId}
          placeholder="Enter room id"
          onChange={(event) => setRoomId(event.target.value)}
        />
        <div className="dashboard-actions">
          <button type="button" onClick={goToMeeting}>
            Create Meeting
          </button>
          <button type="button" onClick={joinRoom}>
            Join Meeting
          </button>
        </div>
      </section>
    </main>
  )
}

export default Dashboard
