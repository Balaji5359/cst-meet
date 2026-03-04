const API_BASE = 'https://gc4a7icjti.execute-api.ap-south-1.amazonaws.com/dev'
const WS_BASE = 'wss://9cq8gq3ke5.execute-api.ap-south-1.amazonaws.com/dev'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

function safe(v) {
  return String(v || '').trim().toLowerCase()
}

function normalizeWsUrl(base, meetingId, email) {
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}meetingId=${encodeURIComponent(meetingId)}&email=${encodeURIComponent(email)}`
}

function shouldOffer(selfEmail, targetEmail) {
  return safe(selfEmail) < safe(targetEmail)
}

export class WebRTCManager {
  constructor(meetingId, userEmail) {
    this.meetingId = meetingId
    this.userEmail = userEmail
    this.localStream = null
    this.ws = null
    this.wsReady = false
    this.peerConnections = {}
    this.pendingIce = {}
    this.pendingSignals = []
    this.onTrackCallback = null
    this.onConnectionStateCallback = null
  }

  async startMedia() {
    if (this.localStream) return this.localStream
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    return this.localStream
  }

  connectWebSocket() {
    const wsUrl = normalizeWsUrl(WS_BASE, this.meetingId, this.userEmail)
    
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.ws = new WebSocket(wsUrl)
    this.wsReady = false

    this.ws.onopen = () => {
      this.wsReady = true
      this.flushPendingSignals()
    }

    this.ws.onmessage = (evt) => this.handleSignal(evt)
    this.ws.onclose = () => { this.wsReady = false }
    this.ws.onerror = () => { this.wsReady = false }
  }

  flushPendingSignals() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const queue = this.pendingSignals
    this.pendingSignals = []
    queue.forEach((msg) => this.ws.send(JSON.stringify(msg)))
  }

  sendSignal(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.wsReady) {
      this.pendingSignals.push(msg)
      return
    }
    this.ws.send(JSON.stringify(msg))
  }

  createPeer(email) {
    const key = safe(email)
    if (!key || key === safe(this.userEmail)) return null
    if (this.peerConnections[key]) return this.peerConnections[key]

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => pc.addTrack(t, this.localStream))
    }

    pc.onicecandidate = (evt) => {
      if (!evt.candidate) return
      this.sendSignal({
        action: 'signal',
        type: 'ice',
        meetingId: this.meetingId,
        from: this.userEmail,
        to: email,
        payload: evt.candidate,
      })
    }

    pc.ontrack = (evt) => {
      const [stream] = evt.streams
      if (!stream) return
      if (this.onTrackCallback) {
        this.onTrackCallback(email, stream)
      }
    }

    pc.onconnectionstatechange = () => {
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(email, pc.connectionState)
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.clearPeer(email)
      }
    }

    this.peerConnections[key] = pc
    return pc
  }

  async sendOfferTo(email) {
    if (!shouldOffer(this.userEmail, email)) return
    if (!this.wsReady) return

    const pc = this.createPeer(email)
    if (!pc) return

    if (pc.signalingState !== 'stable') {
      if (pc.signalingState === 'have-local-offer') {
        try { await pc.setLocalDescription({ type: 'rollback' }) } catch { return }
      } else {
        return
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    this.sendSignal({
      action: 'signal',
      type: 'offer',
      meetingId: this.meetingId,
      from: this.userEmail,
      to: email,
      payload: offer,
    })
  }

  async flushPendingIce(email, pc) {
    const key = safe(email)
    const queue = this.pendingIce[key] || []
    this.pendingIce[key] = []
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch (e) { console.error('ICE error', e) }
    }
  }

  async handleSignal(evt) {
    let msg
    try { msg = JSON.parse(evt.data) } catch { return }

    const type = String(msg?.type || '').toLowerCase()
    if (!['offer', 'answer', 'ice'].includes(type)) return

    const from = String(msg.from || '').trim().toLowerCase()
    const to = String(msg.to || '').trim().toLowerCase()
    if (!from) return
    if (to && to !== safe(this.userEmail)) return

    const key = safe(from)
    const candidateOrSdp = msg.payload || msg.data || msg.candidate || msg.offer || msg.answer

    try {
      if (type === 'offer') {
        const pc = this.createPeer(from)
        if (!pc || !candidateOrSdp) return

        if (pc.signalingState !== 'stable') {
          await pc.setLocalDescription({ type: 'rollback' })
        }

        await pc.setRemoteDescription(new RTCSessionDescription(candidateOrSdp))
        await this.flushPendingIce(from, pc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        this.sendSignal({
          action: 'signal',
          type: 'answer',
          meetingId: this.meetingId,
          from: this.userEmail,
          to: from,
          payload: answer,
        })
      }

      if (type === 'answer') {
        const pc = this.peerConnections[key]
        if (!pc || !candidateOrSdp) return
        await pc.setRemoteDescription(new RTCSessionDescription(candidateOrSdp))
        await this.flushPendingIce(from, pc)
      }

      if (type === 'ice') {
        if (!candidateOrSdp) return
        const pc = this.peerConnections[key]
        if (!pc || !pc.remoteDescription) {
          this.pendingIce[key] = this.pendingIce[key] || []
          this.pendingIce[key].push(candidateOrSdp)
          return
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidateOrSdp))
      }
    } catch (err) {
      console.error('Signal error', err)
    }
  }

  clearPeer(email) {
    const key = safe(email)
    const pc = this.peerConnections[key]
    if (pc) {
      try { pc.close() } catch {}
      delete this.peerConnections[key]
    }
    delete this.pendingIce[key]
  }

  cleanup() {
    Object.keys(this.peerConnections).forEach((k) => this.clearPeer(k))
    
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close()
    }
    this.ws = null
    this.wsReady = false
    this.pendingSignals = []
  }

  onTrack(callback) {
    this.onTrackCallback = callback
  }

  onConnectionState(callback) {
    this.onConnectionStateCallback = callback
  }
}

export { API_BASE }
