import { useEffect, useState } from 'react'

function NotesPanel({ open, onClose, initialValue = '', onSave }) {
  const [notes, setNotes] = useState(initialValue)
  const [saveStatus, setSaveStatus] = useState('idle')

  useEffect(() => {
    setNotes(initialValue || '')
  }, [initialValue, open])

  const handleSave = async () => {
    if (!onSave) return

    setSaveStatus('saving')
    const ok = await onSave(notes)
    setSaveStatus(ok ? 'saved' : 'error')
    setTimeout(() => setSaveStatus('idle'), 1400)
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
      <button type="button" className="save-notes-btn" onClick={handleSave} disabled={saveStatus === 'saving'}>
        {saveStatus === 'saving'
          ? 'Saving...'
          : saveStatus === 'saved'
            ? 'Saved'
            : saveStatus === 'error'
              ? 'Retry Save'
              : 'Save'}
      </button>
    </aside>
  )
}

export default NotesPanel
