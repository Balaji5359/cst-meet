# CST Meet (MeetLite) - System Design Documentation

## Executive Summary

CST Meet is a cloud-native, real-time video conferencing platform built on AWS serverless architecture. The system supports secure authentication, WebRTC-based peer-to-peer communication, meeting lifecycle management, AI-powered assistance, and user data persistence.

**Production URL**: https://meetlite.skillrouteai.com

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
