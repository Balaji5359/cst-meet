# CST Meet (MeetLite) - System Design Documentation

## Executive Summary

CST Meet is a cloud-native, real-time video conferencing platform built on AWS serverless architecture. The system supports secure authentication, WebRTC-based peer-to-peer communication, meeting lifecycle management, AI-powered assistance, and user data persistence.

**Production URL**: https://cstmeet2.skillrouteai.com

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       ├─── HTTPS ───────────────────────────────────────┐
       │                                                  │
       ▼                                                  ▼
┌─────────────────┐                            ┌──────────────────┐
│  Route53 + ALB  │                            │  Cognito User    │
│   (HTTPS/TLS)   │                            │      Pool        │
└────────┬────────┘                            └──────────────────┘
         │                                              │
         ▼                                              │
┌─────────────────┐                                    │
│  ECS Fargate    │                                    │
│  (React SPA)    │                                    │
└────────┬────────┘                                    │
         │                                              │
         ├─── REST API ────────────────────────────────┤
         │                                              │
         ▼                                              ▼
┌──────────────────────────────────────────────────────────────┐
│              API Gateway (REST + WebSocket)                  │
└────────┬─────────────────────────────────┬───────────────────┘
         │                                  │
         ▼                                  ▼
┌─────────────────┐              ┌──────────────────┐
│  Lambda         │              │  Lambda          │
│  (Meeting APIs) │              │  (WS Signaling)  │
└────────┬────────┘              └────────┬─────────┘
         │                                 │
         ├────────────┬────────────────────┤
         │            │                    │
         ▼            ▼                    ▼
┌──────────┐   ┌──────────┐      ┌─────────────┐
│ DynamoDB │   │    S3    │      │  WebRTC P2P │
│ (Tables) │   │ (Storage)│      │ (STUN/TURN) │
└──────────┘   └──────────┘      └─────────────┘
```

### Technology Stack

**Frontend**
- React 19.2.0
- Vite (Build Tool)
- WebRTC API
- WebSocket API
- React OIDC Context

**Backend**
- AWS Lambda (Python 3.x)
- API Gateway (REST + WebSocket)
- DynamoDB
- S3
- Cognito

**Infrastructure**
- ECS Fargate
- Application Load Balancer (ALB)
- Route53
- ACM (SSL/TLS)
- ECR (Container Registry)

**CI/CD**
- GitHub Actions
- Docker

---

## System Components

### 1. Authentication Service

**Provider**: AWS Cognito User Pool

**Supported Methods**:
- Google OAuth 2.0
- Email/Password

**Flow**:
1. User initiates login via React frontend
2. Cognito handles authentication
3. JWT tokens issued (ID token, Access token, Refresh token)
4. Tokens stored in browser session
5. Tokens included in API requests for authorization

### 2. Meeting Lifecycle Service

**Endpoints**:

#### POST /meeting/create
Creates a new meeting room.

**Request**:
```json
{
  "body": "{\"userId\":\"user@example.com\"}"
}
```

**Response**:
```json
{
  "meetingId": "A3F9D2",
  "expiresAt": "2024-01-15T10:30:00Z"
}
```

**Lambda**: `meetlite_createMeeting.py`
- Generates unique 6-character meeting ID
- Sets 1-hour expiration
- Stores in DynamoDB `Meetings` table

#### POST /meeting/join
Adds participant to meeting.

**Request**:
```json
{
  "body": "{\"meetingId\":\"A3F9D2\",\"userEmail\":\"user@example.com\"}"
}
```

**Lambda**: `meetlite_joinMeeting.py`
- Validates meeting exists and is active
- Adds participant to `Participants` table
- Returns meeting metadata

#### POST /meeting/leave
Removes participant from meeting.

**Request**:
```json
{
  "body": "{\"meetingId\":\"A3F9D2\",\"userEmail\":\"user@example.com\"}"
}
```

**Lambda**: `meetlite_leaveMeeting.py`
- Removes participant record
- Cleans up WebSocket connections
- Updates meeting status if last participant

#### POST /meeting/getid
Retrieves meeting status and participants.

**Request**:
```json
{
  "body": "{\"meetingId\":\"A3F9D2\"}"
}
```

**Response**:
```json
{
  "meetingId": "A3F9D2",
  "status": "ACTIVE",
  "hostUserId": "host@example.com",
  "participants": [
    {"userEmail": "user1@example.com", "role": "PARTICIPANT"},
    {"userEmail": "user2@example.com", "role": "PARTICIPANT"}
  ]
}
```

**Lambda**: `meetlite_getMeetingStatus.py`

### 3. WebSocket Signaling Service

**WebSocket URL**: `wss://9cq8gq3ke5.execute-api.ap-south-1.amazonaws.com/dev`

**Connection**:
```
wss://[endpoint]/dev?meetingId=A3F9D2&email=user@example.com
```

**Message Types**:

#### Offer (WebRTC SDP)
```json
{
  "action": "signal",
  "type": "offer",
  "meetingId": "A3F9D2",
  "from": "user1@example.com",
  "to": "user2@example.com",
  "payload": { "type": "offer", "sdp": "..." }
}
```

#### Answer (WebRTC SDP)
```json
{
  "action": "signal",
  "type": "answer",
  "meetingId": "A3F9D2",
  "from": "user2@example.com",
  "to": "user1@example.com",
  "payload": { "type": "answer", "sdp": "..." }
}
```

#### ICE Candidate
```json
{
  "action": "signal",
  "type": "ice",
  "meetingId": "A3F9D2",
  "from": "user1@example.com",
  "to": "user2@example.com",
  "payload": { "candidate": "...", "sdpMid": "...", "sdpMLineIndex": 0 }
}
```

#### State Update
```json
{
  "action": "signal",
  "type": "state",
  "meetingId": "A3F9D2",
  "from": "user1@example.com",
  "payload": { "mute": false, "camera": true, "record": false }
}
```

**Lambda**: `message.py`
- Forwards signals between participants
- Maintains connection mapping in `MeetliteConnections` table
- Handles stale connection cleanup

### 4. WebRTC Media Service

**Configuration**:
```javascript
{
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
}
```

**Media Constraints**:
```javascript
{
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}
```

**Features**:
- Peer-to-peer video/audio streaming
- Screen sharing
- Camera/microphone controls
- Local recording (WebM format)

### 5. User Data Service

**Endpoint**: POST /meetlite-user-data

**Tasks**:

#### getmeetings
Returns user's meeting history.

**Request**:
```json
{
  "body": "{\"email\":\"user@example.com\",\"task\":\"getmeetings\"}"
}
```

#### saverecording
Saves recording to S3.

**Request**:
```json
{
  "body": "{\"email\":\"user@example.com\",\"task\":\"saverecording\",\"meetingid\":\"A3F9D2\",\"extension\":\"webm\",\"mimeType\":\"video/webm\",\"contentBase64\":\"...\"}"
}
```

**S3 Path**: `meetlite-user-recordings/{email}/{timestamp}_{meetingid}.webm`

#### getrecording
Lists user recordings.

#### getrecordingpreview
Generates presigned URL for video playback.

**Response**:
```json
{
  "url": "https://s3.amazonaws.com/...",
  "expiresIn": 3600
}
```

#### savenote
Saves meeting notes to S3.

**S3 Path**: `meetlite-user-notes/{email}/{timestamp}_{meetingid}.txt`

#### getnotes
Lists user notes.

#### getnotepreview
Returns note content.

**Lambda**: `meetlite_user_data_lambda.py`

### 6. AI Assistant Service

**Endpoint**: POST /meetlite-ai-api

**Features**:
- Meeting-related FAQ responses
- Context-aware assistance
- Formatted responses with highlights

---

## Data Models

### DynamoDB Tables

#### Meetings
```
{
  "meetingId": "A3F9D2",           // Partition Key
  "hostUserId": "user@example.com",
  "createdAt": "2024-01-15T09:30:00Z",
  "expiresAt": "2024-01-15T10:30:00Z",
  "status": "ACTIVE"               // ACTIVE | EXPIRED
}
```

#### Participants
```
{
  "meetingId": "A3F9D2",           // Partition Key
  "userEmail": "user@example.com", // Sort Key
  "joinedAt": "2024-01-15T09:35:00Z",
  "role": "PARTICIPANT"            // HOST | PARTICIPANT
}
```

#### MeetliteConnections
```
{
  "connectionId": "abc123...",     // Partition Key
  "meetingId": "A3F9D2",
  "userEmail": "user@example.com",
  "connectedAt": "2024-01-15T09:35:00Z"
}
```

### S3 Structure

```
fields-related-data-of-myapp/
├── meetlite-user-recordings/
│   └── {email}/
│       └── {timestamp}_{meetingId}.webm
└── meetlite-user-notes/
    └── {email}/
        └── {timestamp}_{meetingId}.txt
```

---

## Frontend Architecture

### Key Components

**Pages**:
- `Login.jsx` - Authentication UI
- `Dashboard.jsx` - Meeting list, recordings, notes
- `MeetingRoom.jsx` - Video conferencing interface

**Components**:
- `VideoGrid.jsx` - Video tile layout
- `ControlBar.jsx` - Meeting controls
- `NotesPanel.jsx` - Note-taking interface
- `ChatWidget.jsx` - AI assistant chat
- `Header.jsx` - Navigation header

**Services**:
- `meetApi.js` - API client wrapper
- `cognito.js` - Auth configuration
- `realtime.js` - WebRTC configuration

**Context**:
- `MeetAuthContext.jsx` - Global auth state

### State Management

Uses React hooks for local state:
- `useState` - Component state
- `useEffect` - Side effects
- `useRef` - Mutable refs (WebSocket, peer connections)
- `useMemo` - Computed values

### WebRTC Flow

1. User joins meeting → `getUserMedia()` for local stream
2. Poll `/meeting/getid` every 5s for participant list
3. For each new participant:
   - Create `RTCPeerConnection`
   - Add local tracks
   - Initiate offer/answer exchange via WebSocket
   - Exchange ICE candidates
4. On `ontrack` event → Display remote stream
5. Handle reconnection on connection failure

---

## Security

### Authentication
- Cognito-managed user pool
- JWT token validation
- Secure token storage (session)

### Network
- HTTPS/TLS encryption (ALB + ACM)
- WSS (WebSocket Secure)
- CORS configuration on API Gateway

### Data
- S3 bucket policies (user-scoped access)
- DynamoDB IAM policies
- Presigned URLs for temporary access

### WebRTC
- STUN/TURN for NAT traversal
- Encrypted media streams (DTLS-SRTP)

---

## Performance Optimizations

### Latency Reduction
- WebRTC peer-to-peer (no media server)
- ICE candidate pool size: 10
- Bundle policy: max-bundle
- Optimized media constraints (720p@30fps)
- Minimal debug logging in production

### Scalability
- Serverless Lambda (auto-scaling)
- DynamoDB on-demand capacity
- ECS Fargate auto-scaling
- CloudFront CDN (optional)

### Cost Optimization
- Lambda pay-per-invocation
- DynamoDB on-demand billing
- S3 lifecycle policies
- ECS Fargate spot instances (optional)

---

## Deployment

### CI/CD Pipeline

**Trigger**: Push to `main` branch

**Steps**:
1. GitHub Actions workflow triggered
2. Build React app (`npm run build`)
3. Build Docker image
4. Push to Amazon ECR
5. Update ECS service with new image
6. ECS performs rolling deployment

**Workflow File**: `.github/workflows/deploy.yml`

### Infrastructure

**Frontend Hosting**:
- ECS Fargate cluster
- Application Load Balancer
- Route53 DNS
- ACM SSL certificate

**Backend**:
- Lambda functions (manual deployment)
- API Gateway stages
- DynamoDB tables
- S3 buckets

---

## Cost Analysis

### Assumptions
- 10 concurrent meetings
- Average meeting duration: 30 minutes
- 2 participants per meeting
- 100 meetings per month
- 10 GB storage (recordings + notes)

### Monthly Cost Breakdown

| Service | Usage | Cost |
|---------|-------|------|
| **ECS Fargate** | 1 task (0.25 vCPU, 0.5 GB) × 730 hrs | $10.95 |
| **Application Load Balancer** | 1 ALB × 730 hrs + LCU | $18.25 |
| **Lambda** | 10,000 invocations, 512 MB, 2s avg | $0.83 |
| **API Gateway (REST)** | 10,000 requests | $0.04 |
| **API Gateway (WebSocket)** | 20,000 messages, 60 min connections | $0.26 |
| **DynamoDB** | 50,000 reads, 10,000 writes, 1 GB storage | $1.56 |
| **S3** | 10 GB storage, 1,000 requests | $0.25 |
| **Cognito** | 100 MAU (free tier) | $0.00 |
| **Route53** | 1 hosted zone | $0.50 |
| **Data Transfer** | 50 GB out | $4.50 |
| **TURN Server** | Free tier (openrelay) | $0.00 |
| **Total** | | **~$37/month** |

### Scaling Scenarios

**100 concurrent meetings** (10x scale):
- Lambda: $8.30
- API Gateway WS: $2.60
- DynamoDB: $15.60
- S3: $2.50
- Data Transfer: $45.00
- **Total: ~$110/month**

**1,000 concurrent meetings** (100x scale):
- Lambda: $83.00
- API Gateway WS: $26.00
- DynamoDB: $156.00
- S3: $25.00
- Data Transfer: $450.00
- ECS Fargate: $21.90 (2 tasks)
- **Total: ~$800/month**

### Cost Optimization Strategies
1. Use CloudFront CDN to reduce data transfer costs
2. Implement S3 lifecycle policies (move to Glacier after 90 days)
3. Use DynamoDB reserved capacity for predictable workloads
4. Implement Lambda reserved concurrency
5. Use ECS Fargate Spot for non-production environments

---

## Monitoring & Observability

### Metrics
- CloudWatch Logs (Lambda, ECS)
- API Gateway metrics (latency, errors)
- DynamoDB metrics (throttles, capacity)
- Custom metrics (meeting duration, participant count)

### Alarms
- Lambda error rate > 5%
- API Gateway 5xx errors
- DynamoDB throttling
- ECS task health checks

### Logging
- Structured JSON logs
- Request/response logging
- WebRTC connection state logging
- Error tracking

---

## Future Enhancements

1. **Recording Server**: Server-side recording for all participants
2. **Chat**: Text chat during meetings
3. **Breakout Rooms**: Split meetings into sub-rooms
4. **Waiting Room**: Host approval before joining
5. **Virtual Backgrounds**: AI-powered background replacement
6. **Transcription**: Real-time speech-to-text
7. **Analytics Dashboard**: Meeting insights and reports
8. **Mobile Apps**: Native iOS/Android apps
9. **SFU Architecture**: Selective Forwarding Unit for better scalability
10. **End-to-End Encryption**: Enhanced security

---

## API Reference

### Base URLs
- **REST API**: `https://gc4a7icjti.execute-api.ap-south-1.amazonaws.com/dev`
- **WebSocket API**: `wss://9cq8gq3ke5.execute-api.ap-south-1.amazonaws.com/dev`

### Authentication
All REST API requests require Cognito JWT token in `Authorization` header:
```
Authorization: Bearer <id_token>
```

### Error Responses
```json
{
  "error": "Error message",
  "statusCode": 400
}
```

### Rate Limits
- REST API: 10,000 requests/second (API Gateway default)
- WebSocket: 3,000 messages/second per connection

---

## Development

### Local Setup

```bash
# Clone repository
git clone <repository-url>
cd cst-meet

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your AWS credentials

# Run development server
npm run dev

# Build for production
npm run build
```

### Environment Variables

```env
VITE_COGNITO_USER_POOL_ID=ap-south-1_xxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
VITE_API_BASE_URL=https://gc4a7icjti.execute-api.ap-south-1.amazonaws.com/dev
VITE_WS_URL=wss://9cq8gq3ke5.execute-api.ap-south-1.amazonaws.com/dev
```

### Testing

```bash
# Run linter
npm run lint

# Test WebRTC locally
# Open api-test-ui/webrtc-smoke-test.html in browser
```

---

## Troubleshooting

### Common Issues

**Issue**: WebSocket connection fails
- **Solution**: Check API Gateway WebSocket route configuration
- Verify `$connect` and `$disconnect` routes are configured

**Issue**: Video not showing for remote participants
- **Solution**: Check STUN/TURN server connectivity
- Verify ICE candidates are being exchanged
- Check firewall/NAT configuration

**Issue**: High latency in video
- **Solution**: Verify peer-to-peer connection (not relaying through TURN)
- Check network bandwidth
- Reduce video resolution in `realtime.js`

**Issue**: Recording fails
- **Solution**: Check browser MediaRecorder support
- Verify S3 bucket permissions
- Check Lambda timeout (increase if needed)

---

## Support & Contact

For issues and questions:
- GitHub Issues: [Repository Issues]
- Documentation: This README
- AWS Support: For infrastructure issues

---

## License

Proprietary - All rights reserved

---

## Changelog

### v1.0.0 (Current)
- Initial production release
- Cognito authentication
- WebRTC video conferencing
- Meeting lifecycle management
- User data persistence
- AI assistant integration
- ECS Fargate deployment
- CI/CD pipeline
