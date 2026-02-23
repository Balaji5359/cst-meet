function ControlBar({ controls, onToggle, onLeave, leaveLabel = 'Leave' }) {
  const items = [
    { key: 'camera', label: controls.camera ? 'Camera On' : 'Camera Off' },
    { key: 'mute', label: controls.mute ? 'Unmute' : 'Mute' },
    { key: 'record', label: controls.record ? 'Recording' : 'Record' },
    { key: 'notes', label: controls.notes ? 'Close Notes' : 'Notes' },
    { key: 'screenshare', label: controls.screenshare ? 'Stop Share' : 'Share' },
    { key: 'theme', label: controls.theme ? 'Light' : 'Dark' },
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
