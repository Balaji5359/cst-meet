import { useState } from 'react'

function NotesPanel({ open, onClose }) {
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <aside className={`notes-panel ${open ? 'open' : ''}`}>
      <div className="notes-header">
        <h3>Meeting Notes</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Write notes here..."
      />
      <button type="button" className="save-notes-btn" onClick={handleSave}>
        {saved ? 'Saved' : 'Save'}
      </button>
    </aside>
  )
}

export default NotesPanel
