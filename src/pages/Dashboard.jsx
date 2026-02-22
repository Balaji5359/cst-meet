import { useState } from 'react'
import Header from '../components/Header'
import { createMeeting, extractErrorMessage, joinMeeting } from '../services/meetApi'

function Dashboard({ onNavigate, user, onSignOut }) {
  const [roomId, setRoomId] = useState('')
  const [apiError, setApiError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [createdMeetingId, setCreatedMeetingId] = useState('')
  const [showCreatedModal, setShowCreatedModal] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')

  const userName = user?.name || 'User'
  const userEmail = user?.email || ''
  const userId = user?.userId || ''

  const resetPopup = () => {
    setShowCreatedModal(false)
    setCopyStatus('')
  }

  const copyToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Copy failed')
    }
  }

  const handleCreateMeeting = async () => {
    setApiError('')
    setCopyStatus('')

    if (!userEmail && !userId) {
      setApiError('User identity is missing. Please login again.')
      return
    }

    setIsCreating(true)
    const response = await createMeeting(userEmail || userId)
    setIsCreating(false)

    if (!response.ok) {
      setApiError(extractErrorMessage(response))
      return
    }

    const meetingId = response.data?.meetingId
    if (!meetingId) {
      setApiError('Create meeting succeeded but no meetingId was returned.')
      return
    }

    setCreatedMeetingId(meetingId)
    setShowCreatedModal(true)
  }

  const handleJoinMeeting = async () => {
    setApiError('')

    const cleanMeetingId = roomId.trim()
    if (!cleanMeetingId) {
      setApiError('Meeting ID is required to join.')
      return
    }

    if (!userEmail) {
      setApiError('User email is missing from token. Please login again.')
      return
    }

    setIsJoining(true)
    const response = await joinMeeting(cleanMeetingId, userEmail)
    setIsJoining(false)

    if (!response.ok) {
      setApiError(extractErrorMessage(response))
      return
    }

    onNavigate(`/meeting/${cleanMeetingId}`)
  }

  const meetingLink = createdMeetingId
    ? `${window.location.origin}/meeting/${createdMeetingId}`
    : ''

  return (
    <main className="dashboard-page">
      <Header
        title="MeetLite"
        subtitle="Create or join a meeting"
        rightSlot={
          <div className="header-actions">
            <div className="avatar-placeholder">{userName[0]?.toUpperCase()}</div>
            <button type="button" className="signout-btn" onClick={onSignOut}>
              Logout
            </button>
          </div>
        }
      />

      <section className="dashboard-card user-card">
        <h2>Logged in user</h2>
        <p>
          <strong>Name:</strong> {userName}
        </p>
        <p>
          <strong>Email:</strong> {userEmail || 'Not available'}
        </p>
      </section>

      <section className="dashboard-card">
        <label htmlFor="room-id">Meeting ID</label>
        <input
          id="room-id"
          type="text"
          value={roomId}
          placeholder="Enter meeting ID"
          onChange={(event) => setRoomId(event.target.value)}
        />
        <div className="dashboard-actions">
          <button type="button" onClick={handleCreateMeeting} disabled={isCreating || isJoining}>
            {isCreating ? 'Generating ID...' : 'Create Meeting'}
          </button>
          <button type="button" onClick={handleJoinMeeting} disabled={isCreating || isJoining}>
            {isJoining ? 'Joining...' : 'Join Meeting'}
          </button>
        </div>
        {apiError ? <p className="api-error">{apiError}</p> : null}
      </section>

      {showCreatedModal ? (
        <section className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Meeting created">
          <div className="modal-card">
            <h3>Meeting ID Generated</h3>
            <p>Copy this ID or link and share with participants.</p>
            <div className="copy-box">{createdMeetingId}</div>
            <div className="copy-box">{meetingLink}</div>
            <div className="modal-actions">
              <button type="button" onClick={() => copyToClipboard(createdMeetingId)}>
                Copy ID
              </button>
              <button type="button" onClick={() => copyToClipboard(meetingLink)}>
                Copy Link
              </button>
              <button type="button" className="secondary" onClick={resetPopup}>
                Close
              </button>
            </div>
            {copyStatus ? <p className="copy-status">{copyStatus}</p> : null}
            <p className="hint-text">To join, paste the meeting ID into the box and click Join Meeting.</p>
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default Dashboard
