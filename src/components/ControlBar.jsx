function ControlBar({ controls, onToggle, onLeave, leaveLabel = 'Leave' }) {
  const items = [
    { key: 'camera', label: 'Camera' },
    { key: 'mute', label: 'Mute' },
    { key: 'record', label: 'Record' },
    { key: 'notes', label: 'Notes' },
    { key: 'theme', label: 'Theme' },
  ]

  return (
    <footer className="control-bar">
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={`control-btn ${controls[item.key] ? 'active' : ''}`}
          onClick={() => onToggle(item.key)}
        >
          <span>{item.label}</span>
        </button>
      ))}
      <button type="button" className="control-btn leave-btn" onClick={onLeave}>
        <span>{leaveLabel}</span>
      </button>
    </footer>
  )
}

export default ControlBar
