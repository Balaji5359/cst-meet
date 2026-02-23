import { useMemo } from 'react'

function ParticipantTile({ participant }) {
  const hasStream = !!participant.stream
  const roleLabel = participant.isHost ? 'ADMIN' : participant.role
  const isMuted = !!participant.isMuted
  const isRecording = !!participant.isRecording
  const isCameraOff = participant.cameraOn === false

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
      {isRecording ? <div className="role-pill recording">REC</div> : null}
      {isMuted ? <div className="mute-indicator" title="Muted">Muted</div> : null}
      {!hasStream ? <span>{isCameraOff ? 'Camera Off' : 'Waiting for video...'}</span> : null}
    </article>
  )
}

function VideoGrid({
  selfName = 'You',
  selfIsHost = false,
  selfIsScreenSharing = false,
  selfIsMuted = false,
  selfIsRecording = false,
  selfCameraOn = true,
  localStream = null,
  participants = [],
  onParticipantsContainerReady,
  participantsScroll = { canPrev: false, canNext: false },
  onParticipantsScroll,
}) {
  const orderedParticipants = useMemo(
    () => [...participants].sort((a, b) => Number(b.isHost) - Number(a.isHost)),
    [participants],
  )

  return (
    <section className="meeting-stage">
      <div className="main-video">
        {localStream && selfCameraOn ? (
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
        {selfIsScreenSharing ? <div className="role-pill sharing">SHARING</div> : null}
        {selfIsRecording ? <div className="role-pill recording">REC</div> : null}
        {selfIsMuted ? <div className="mute-indicator" title="Muted">Muted</div> : null}
        {!localStream || !selfCameraOn ? <span>{selfCameraOn ? 'Main Video Feed' : 'Camera Off'}</span> : null}
      </div>

      <div
        className="participant-grid"
        aria-label="Participants"
        ref={(node) => {
          if (onParticipantsContainerReady) onParticipantsContainerReady(node)
        }}
      >
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

      {onParticipantsScroll ? (
        <div className="participants-scroll-controls" aria-label="Participants navigation">
          <button
            type="button"
            className="scroll-fab"
            onClick={() => onParticipantsScroll(-1)}
            disabled={!participantsScroll.canPrev}
            aria-label="Previous participants"
          >
            Prev
          </button>
          <button
            type="button"
            className="scroll-fab"
            onClick={() => onParticipantsScroll(1)}
            disabled={!participantsScroll.canNext}
            aria-label="Next participants"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  )
}

export default VideoGrid

