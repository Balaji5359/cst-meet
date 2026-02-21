import { useState } from 'react'
import Header from '../components/Header'

function Dashboard({ onNavigate, user, onSignOut }) {
  const [roomId, setRoomId] = useState('')

  const goToMeeting = () => {
    onNavigate('/meeting/demo-room')
  }

  const joinRoom = () => {
    const cleanedRoom = roomId.trim() || 'demo-room'
    onNavigate(`/meeting/${cleanedRoom}`)
  }

  const userName = user?.name || user?.given_name || 'User'
  const userEmail = user?.email || 'No email available'

  return (
    <main className="dashboard-page">
      <Header
        title="MeetLite"
        subtitle="Create or join a meeting room"
        rightSlot={
          <div className="header-actions">
            <div className="avatar-placeholder">{userName[0]?.toUpperCase()}</div>
            <button type="button" className="signout-btn" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        }
      />

      <section className="dashboard-card user-card">
        <h2>Login successful</h2>
        <p>
          <strong>Name:</strong> {userName}
        </p>
        <p>
          <strong>Email:</strong> {userEmail}
        </p>
      </section>

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
