import { useEffect, useMemo, useState } from 'react'
import Header from '../components/Header'
import {
  createMeeting,
  extractErrorMessage,
  getNotePreview,
  getRecordingPreview,
  getUserMeetings,
  getUserNotes,
  getUserRecordings,
  joinMeeting,
} from '../services/meetApi'

function formatDateLabel(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function extractMeetingIdFromFileName(filename) {
  if (!filename) return ''
  const normalized = filename.replace(/\.[^/.]+$/, '')
  const parts = normalized.split('_')
  if (parts.length < 3) return ''
  return parts[1] || ''
}

function formatDisplayFileName(filename) {
  if (!filename) return '-'
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/)
  const ext = extMatch ? extMatch[1] : ''
  const meetingId = extractMeetingIdFromFileName(filename)
  if (!meetingId) return filename
  return ext ? `${meetingId}.${ext}` : meetingId
}

function Dashboard({ onNavigate, user, onSignOut }) {
  const [roomId, setRoomId] = useState('')
  const [apiError, setApiError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [createdMeetingId, setCreatedMeetingId] = useState('')
  const [showCreatedModal, setShowCreatedModal] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [meetingRows, setMeetingRows] = useState([])
  const [recordingItems, setRecordingItems] = useState([])
  const [noteItems, setNoteItems] = useState([])
  const [previewState, setPreviewState] = useState({
    open: false,
    type: '',
    title: '',
    loading: false,
    error: '',
    videoUrl: '',
    noteText: '',
    fileName: '',
  })

  const userName = user?.name || 'User'
  const userEmail = user?.email || ''
  const userId = user?.userId || ''

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

  useEffect(() => {
    let cancelled = false

    const loadMeta = async () => {
      if (!userEmail) return
      setLoadingMeta(true)

      const [meetingsRes, recordingsRes, notesRes] = await Promise.all([
        getUserMeetings(userEmail),
        getUserRecordings(userEmail),
        getUserNotes(userEmail),
      ])

      if (cancelled) return

      if (meetingsRes.ok) {
        setMeetingRows(Array.isArray(meetingsRes.data?.meetings) ? meetingsRes.data.meetings : [])
      }

      if (recordingsRes.ok) {
        setRecordingItems(Array.isArray(recordingsRes.data?.items) ? recordingsRes.data.items : [])
      }

      if (notesRes.ok) {
        setNoteItems(Array.isArray(notesRes.data?.items) ? notesRes.data.items : [])
      }

      setLoadingMeta(false)
    }

    loadMeta()
    return () => {
      cancelled = true
    }
  }, [userEmail])

  const dashboardStats = useMemo(() => {
    const meetingsToday = meetingRows.filter((meeting) => {
      const created = new Date(meeting.createdAt || 0)
      const now = new Date()
      return created.toDateString() === now.toDateString()
    }).length

    const totalMinutes = meetingRows.reduce((sum, meeting) => sum + Number(meeting.myDurationMinutes || 0), 0)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = Math.round(totalMinutes % 60)

    return {
      meetingsToday,
      totalMeetings: meetingRows.length,
      timeSpent: `${hours}h ${minutes}m`,
    }
  }, [meetingRows])

  const askAi = (question) => {
    window.dispatchEvent(new CustomEvent('meetlite-ai-ask', { detail: { question } }))
  }

  const resetPopup = () => {
    setShowCreatedModal(false)
    setCopyStatus('')
  }

  const closePreview = () => {
    setPreviewState({
      open: false,
      type: '',
      title: '',
      loading: false,
      error: '',
      videoUrl: '',
      noteText: '',
      fileName: '',
    })
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

  const handleOpenRecording = async (item) => {
    const meetingid = extractMeetingIdFromFileName(item?.filename)
    if (!meetingid) {
      setPreviewState({
        open: true,
        type: 'recording',
        title: 'Recording Preview',
        loading: false,
        error: 'Unable to detect meeting ID from file name.',
        videoUrl: '',
        noteText: '',
        fileName: item?.filename || '',
      })
      return
    }

    setPreviewState({
      open: true,
      type: 'recording',
      title: 'Recording Preview',
      loading: true,
      error: '',
      videoUrl: '',
      noteText: '',
      fileName: item?.filename || '',
    })

    const response = await getRecordingPreview({
      email: userEmail,
      meetingid,
      key: item?.key,
    })

    if (!response.ok) {
      setPreviewState((current) => ({
        ...current,
        loading: false,
        error: extractErrorMessage(response),
      }))
      return
    }

    setPreviewState((current) => ({
      ...current,
      loading: false,
      videoUrl: response.data?.previewUrl || '',
      error: response.data?.previewUrl ? '' : 'Preview URL was not returned by API.',
    }))
  }

  const handleOpenNote = async (item) => {
    const meetingid = extractMeetingIdFromFileName(item?.filename)
    if (!meetingid) {
      setPreviewState({
        open: true,
        type: 'note',
        title: 'Note Preview',
        loading: false,
        error: 'Unable to detect meeting ID from file name.',
        videoUrl: '',
        noteText: '',
        fileName: item?.filename || '',
      })
      return
    }

    setPreviewState({
      open: true,
      type: 'note',
      title: 'Note Preview',
      loading: true,
      error: '',
      videoUrl: '',
      noteText: '',
      fileName: item?.filename || '',
    })

    const response = await getNotePreview({
      email: userEmail,
      meetingid,
      key: item?.key,
    })

    if (!response.ok) {
      setPreviewState((current) => ({
        ...current,
        loading: false,
        error: extractErrorMessage(response),
      }))
      return
    }

    setPreviewState((current) => ({
      ...current,
      loading: false,
      noteText: response.data?.noteText || '',
      error: response.data?.noteText ? '' : 'Note text is empty.',
    }))
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
            {loadingMeta ? <p>Loading meetings...</p> : null}
            <ul className="list-block">
              {meetingRows.map((meeting) => (
                <li key={meeting.meetingId}>
                  <div>
                    <strong>{meeting.meetingId}</strong>
                    <span>{formatDateLabel(meeting.createdAt)}</span>
                  </div>
                  <div>
                    <span>{meeting.myDurationLabel || '-'}</span>
                    <small>{meeting.status || '-'}</small>
                  </div>
                </li>
              ))}
              {!loadingMeta && meetingRows.length === 0 ? <li>No meetings found.</li> : null}
            </ul>
          </section>

          <section className="dashboard-card side-panel">
            <h3>Recordings</h3>
            <ul className="list-block compact">
              {recordingItems.map((item) => (
                <li key={item.key || item.filename}>
                  <div>
                    <strong>{formatDisplayFileName(item.filename)}</strong>
                    <span>{formatDateLabel(item.lastModified)}</span>
                  </div>
                  <div className="list-action-wrap">
                    <button type="button" className="list-action-btn" onClick={() => handleOpenRecording(item)}>
                      View
                    </button>
                  </div>
                </li>
              ))}
              {!loadingMeta && recordingItems.length === 0 ? <li>No recordings found.</li> : null}
            </ul>
          </section>

          <section className="dashboard-card side-panel">
            <h3>Saved Notes</h3>
            <ul className="list-block compact">
              {noteItems.map((item) => (
                <li key={item.key || item.filename}>
                  <div>
                    <strong>{formatDisplayFileName(item.filename)}</strong>
                    <span>{formatDateLabel(item.lastModified)}</span>
                  </div>
                  <div className="list-action-wrap">
                    <button type="button" className="list-action-btn" onClick={() => handleOpenNote(item)}>
                      View
                    </button>
                  </div>
                </li>
              ))}
              {!loadingMeta && noteItems.length === 0 ? <li>No notes found.</li> : null}
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

      {previewState.open ? (
        <section className="modal-backdrop" role="dialog" aria-modal="true" aria-label={previewState.title}>
          <div className="modal-card preview-modal-card">
            <h3>{previewState.title}</h3>
            {previewState.fileName ? (
              <p className="preview-file-label">{formatDisplayFileName(previewState.fileName)}</p>
            ) : null}

            {previewState.loading ? <p>Loading preview...</p> : null}
            {!previewState.loading && previewState.error ? <p className="api-error">{previewState.error}</p> : null}

            {!previewState.loading && !previewState.error && previewState.type === 'recording' ? (
              <div className="preview-media-wrap">
                <video controls preload="metadata" src={previewState.videoUrl} className="preview-video" />
              </div>
            ) : null}

            {!previewState.loading && !previewState.error && previewState.type === 'note' ? (
              <pre className="preview-note-text">{previewState.noteText}</pre>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closePreview}>
                Close
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default Dashboard
