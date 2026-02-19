const participantNames = ['Alex', 'Sam', 'Priya', 'Jordan']

function VideoGrid() {
  return (
    <section className="meeting-stage">
      <div className="main-video">
        <div className="video-badge">You</div>
        <span>Main Video Feed</span>
      </div>
      <div className="participant-grid">
        {participantNames.map((name) => (
          <article key={name} className="participant-tile">
            <div className="video-badge">{name}</div>
            <span>Camera Off</span>
          </article>
        ))}
      </div>
    </section>
  )
}

export default VideoGrid
