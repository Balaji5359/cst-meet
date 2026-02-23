import { useMemo, useState } from 'react'
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

  const dashboardStats = useMemo(
    () => ({
      meetingsToday: 4,
      totalMeetings: 18,
      timeSpent: '6h 20m',
    }),
    [],
  )

  const previousMeetings = useMemo(
    () => [
      { id: 'C9D34F', date: 'Today', duration: '52m', role: 'Host' },
      { id: 'EC55E8', date: 'Today', duration: '34m', role: 'Participant' },
      { id: '19850A', date: 'Yesterday', duration: '1h 12m', role: 'Host' },
      { id: 'FE6B83', date: 'Yesterday', duration: '27m', role: 'Participant' },
    ],
    [],
  )

  const recordingItems = useMemo(
    () => [
      { name: 'C9D34F - Design Review', time: 'Today, 6:30 PM' },
      { name: '19850A - Sprint Planning', time: 'Yesterday, 2:10 PM' },
    ],
    [],
  )

  const noteItems = useMemo(
    () => [
      { title: 'Backend tasks', preview: 'Connect meeting list API and analytics API.' },
      { title: 'UI follow-up', preview: 'Finalize mobile tile spacing and AI chat API.' },
      { title: 'Release notes', preview: 'Prepare change log for next deployment.' },
    ],
    [],
  )

  const faqs = useMemo(
    () => [
      'How to create and share a new meeting?',
      'How to join using a meeting ID?',
      'Why does it show waiting for video?',
      'How to use mute, camera, and notes controls?',
      'How to switch theme and use screen share?',
    ],
    [],
  )

  const askAi = (question) => {
    window.dispatchEvent(new CustomEvent('meetlite-ai-ask', { detail: { question } }))
  }

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

  return (
    <main className="dashboard-page">
      <Header
        title="MeetLite"
        subtitle="Create or join a meeting"
        rightSlot={
          <div className="header-actions">
            <button type="button" className="signout-btn" onClick={onSignOut}>
              Logout here
            </button>
          </div>
        }
      />

      <section className="dashboard-layout">
        <div className="dashboard-main-col">
          <section className="dashboard-card user-card">
            <h2>Logged User</h2>
            <p>
              <strong>Name:</strong> {userName}
            </p>
            <p>
              <strong>Email:</strong> {userEmail || 'Not available'}
            </p>
          </section>

          <section className="dashboard-card meeting-action-card">
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

          <section className="dashboard-card faq-card">
            <h3>Need help?</h3>
            <p>If you have any queries, ask with MeetLite AI.</p>
            <ul className="faq-list">
              {faqs.map((item) => (
                <li key={item}>
                  <span>{item}</span>
                  <button type="button" className="ask-ai-btn" onClick={() => askAi(item)}>
                    Ask AI
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="dashboard-side-col">
          <section className="dashboard-card side-panel stats-panel">
            <h3>Meeting Insights</h3>
            <div className="stats-grid">
              <article>
                <span>Today</span>
                <strong>{dashboardStats.meetingsToday}</strong>
              </article>
              <article>
                <span>Total</span>
                <strong>{dashboardStats.totalMeetings}</strong>
              </article>
              <article>
                <span>Time Spent</span>
                <strong>{dashboardStats.timeSpent}</strong>
              </article>
            </div>
          </section>

          <section className="dashboard-card side-panel">
            <h3>Meeting List</h3>
            <ul className="list-block">
              {previousMeetings.map((meeting) => (
                <li key={meeting.id}>
                  <div>
                    <strong>{meeting.id}</strong>
                    <span>{meeting.date}</span>
                  </div>
                  <div>
                    <span>{meeting.duration}</span>
                    <small>{meeting.role}</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="dashboard-card side-panel">
            <h3>Recordings</h3>
            <ul className="list-block compact">
              {recordingItems.map((item) => (
                <li key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.time}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="dashboard-card side-panel">
            <h3>Saved Notes</h3>
            <ul className="list-block compact">
              {noteItems.map((item) => (
                <li key={item.title}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.preview}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </section>

      {showCreatedModal ? (
        <section className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Meeting created">
          <div className="modal-card">
            <h3>Meeting ID Generated</h3>
            <p>Copy this ID and share with participants to join meeting.</p>
            <div className="copy-box">{createdMeetingId}</div>
            <div className="modal-actions">
              <button type="button" onClick={() => copyToClipboard(createdMeetingId)}>
                Copy ID
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
