import { useMemo } from 'react'

function ParticipantTile({ participant }) {
  const hasStream = !!participant.stream
  const roleLabel = participant.isHost ? 'ADMIN' : participant.role

  return (
    <article className="participant-tile">
      {hasStream ? (
        <video
          className="participant-video"
          ref={(node) => {
            if (!node || !participant.stream) return
            if (node.srcObject !== participant.stream) {
              node.srcObject = participant.stream
            }
          }}
          autoPlay
          playsInline
        />
      ) : null}

      <div className="video-badge">{participant.label}</div>
      {roleLabel ? <div className={`role-pill ${participant.isHost ? 'admin' : ''}`}>{roleLabel}</div> : null}
      {!hasStream ? <span>{participant.cameraOn === false ? 'Camera Off' : 'Waiting for video...'}</span> : null}
    </article>
  )
}

function VideoGrid({ selfName = 'You', selfIsHost = false, localStream = null, participants = [] }) {
  const orderedParticipants = useMemo(
    () => [...participants].sort((a, b) => Number(b.isHost) - Number(a.isHost)),
    [participants],
  )

  return (
    <section className="meeting-stage">
      <div className="main-video">
        {localStream ? (
          <video
            className="main-video-element"
            ref={(node) => {
              if (!node || !localStream) return
              if (node.srcObject !== localStream) {
                node.srcObject = localStream
              }
            }}
            autoPlay
            muted
            playsInline
          />
        ) : null}

        <div className="video-badge">{selfName}</div>
        {selfIsHost ? <div className="role-pill admin">ADMIN</div> : null}
        {!localStream ? <span>Main Video Feed</span> : null}
      </div>

      <div className="participant-grid">
        {orderedParticipants.length === 0 ? (
          <article className="participant-tile">
            <div className="video-badge">Participants</div>
            <span>No participants joined yet</span>
          </article>
        ) : (
          orderedParticipants.map((participant) => (
            <ParticipantTile key={participant.id} participant={participant} />
          ))
        )}
      </div>
    </section>
  )
}

export default VideoGrid
