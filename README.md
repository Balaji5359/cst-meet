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
- Amazon Bedrock (Nova Micro)
- Bedrock Knowledge Base (RAG)

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

### 6. AI Assistant Service (Bedrock RAG)

**Endpoint**: `https://gc4a7icjti.execute-api.ap-south-1.amazonaws.com/dev/meetlite-ai-api`

**Architecture**: Amazon Bedrock Agent with RAG (Retrieval-Augmented Generation)

#### Overview

The AI Assistant is an intelligent chatbot powered by AWS Bedrock, providing context-aware help for MeetLite users. It uses a RAG model connected to 10+ documentation files stored in S3, enabling accurate responses based on actual product documentation.

#### Architecture Components

**1. Knowledge Base (S3)**
- **Bucket**: `fields-related-data-of-myapp`
- **Path**: `cstmeet-ai-docs/`
- **Format**: Markdown (.md) files
- **Total Files**: 11 documentation files

**Documentation Structure**:
```
s3://fields-related-data-of-myapp/cstmeet-ai-docs/
├── 01_overview.md              # App overview and capabilities
├── 02_signup_login.md          # Authentication guide
├── 03_dashboard.md             # Dashboard features
├── 04_create_meeting.md        # Meeting creation flow
├── 05_join_meeting.md          # Joining meetings guide
├── 06_meeting_room_ui.md       # Meeting interface details
├── 07_audio_video_controls.md  # Media controls documentation
├── 08_common_issues.md         # Troubleshooting guide
├── 09_mobile_usage.md          # Mobile device support
├── 10_security_privacy.md      # Security features
└── 11_new_features.md          # Latest updates
```

**2. Bedrock Agent**
- **Model**: Amazon Nova Micro
- **Type**: Foundation Model (FM)
- **Configuration**: RAG-enabled with S3 knowledge base
- **Region**: ap-south-1 (Mumbai)

**3. Lambda Integration**
- **Function**: AI API Handler
- **Runtime**: Python 3.x
- **Trigger**: API Gateway POST request
- **Role**: Bedrock Agent invocation permissions

**4. Frontend Widget**
- **Component**: `ChatWidget.jsx`
- **Features**:
  - Floating chat button on all pages
  - Quick action buttons for common questions
  - Rich text formatting with keyword highlighting
  - Session management for conversation context
  - Response sanitization (removes source tags, duplicates)

#### API Specification

**Request**:
```json
POST /meetlite-ai-api
{
  "body": {
    "message": "How do I create a meeting?",
    "sessionId": "optional-session-id"
  }
}
```

**Response**:
```json
{
  "statusCode": 200,
  "body": {
    "reply": "To create a meeting:\n1. Login to Dashboard\n2. Click Create Meeting button\n3. Copy the generated Meeting ID\n4. Share ID with participants",
    "sessionId": "session-abc123"
  }
}
```

#### Agent System Prompt

```
You are CST Meet AI Assistant.

Your job is to help users understand and use CST Meet.
Always give step-by-step instructions.
Use simple language.
Do not guess.
Answer only from the provided documentation.
If the user is confused, guide them calmly.
If a feature does not exist, say so clearly.
```

#### Features

**1. Context-Aware Responses**
- Retrieves relevant documentation from S3 via RAG
- Provides accurate, documentation-based answers
- Maintains conversation context via session IDs

**2. Quick Actions**
- "How do I create and share a meeting?"
- "How do I join using meeting ID?"
- "Why does it show waiting for video?"
- "How do Camera and Mute buttons work?"
- "How do I use notes in a meeting?"

**3. Smart Formatting**
- Keyword highlighting: Meeting ID, Dashboard, Camera, Mute, Notes, Record
- Ordered lists for step-by-step instructions
- Bullet points for feature lists
- Paragraph formatting for explanations

**4. Fallback Handling**
- Local fallback responses if API fails
- Authentication-aware suggestions
- Network error handling

**5. Response Sanitization**
- Removes RAG source tags (`<sources>`, `<source>`)
- Filters duplicate FAQ questions
- Cleans helper text artifacts
- Formats inline numbering to proper lists

#### User Experience

**Chat Widget Behavior**:
1. Floating button labeled "MeetLite AI" on all pages
2. Click to open chat panel
3. Welcome message: "Hi, I am MeetLite AI. Ask me how to use any feature."
4. Quick action buttons for common questions
5. Type custom questions or click quick actions
6. Receive formatted, highlighted responses
7. Clear conversation or close panel

**Integration Points**:
- Available on Login page (pre-authentication)
- Available on Dashboard (post-authentication)
- Available in Meeting Room (offset positioning)
- Event-driven: Can be triggered programmatically via `meetlite-ai-ask` event

#### Cost Analysis

**Amazon Nova Micro Model Pricing** (ap-south-1 region):

| Metric | Price | Unit |
|--------|-------|------|
| Input Tokens | $0.035 | per 1M tokens |
| Output Tokens | $0.14 | per 1M tokens |

**Token Estimation**:

**Per Request**:
- Average user question: ~20 tokens
- System prompt: ~50 tokens
- Retrieved context (RAG): ~500 tokens
- **Total Input**: ~570 tokens
- Average response: ~150 tokens
- **Total Output**: ~150 tokens

**Cost Per Request**:
- Input cost: (570 / 1,000,000) × $0.035 = $0.00001995
- Output cost: (150 / 1,000,000) × $0.14 = $0.000021
- **Total per request**: ~$0.00004095 (~$0.00004)

**Monthly Cost Projections**:

| Users/Day | Requests/User | Total Requests/Month | Monthly Cost |
|-----------|---------------|----------------------|-------------|
| 10 | 3 | 900 | $0.04 |
| 50 | 3 | 4,500 | $0.18 |
| 100 | 3 | 9,000 | $0.37 |
| 500 | 3 | 45,000 | $1.84 |
| 1,000 | 3 | 90,000 | $3.69 |
| 5,000 | 3 | 450,000 | $18.43 |
| 10,000 | 3 | 900,000 | $36.86 |

**Additional AWS Costs**:

| Service | Usage | Monthly Cost (Estimated) |
|---------|-------|-------------------------|
| S3 Storage | 11 files (~50 KB total) | $0.001 |
| S3 GET Requests | RAG retrievals | $0.01 - $0.05 |
| Lambda Invocations | API handler | $0.02 - $0.10 |
| API Gateway | REST API calls | $0.035 per 10K requests |
| Bedrock Knowledge Base | RAG indexing | $0.00 (one-time) |

**Total Monthly Cost Example** (1,000 users):
- Nova Micro tokens: $3.69
- S3 + Lambda + API Gateway: ~$0.15
- **Total**: ~$3.84/month

**Cost Optimization**:
1. **Nova Micro** is the most cost-effective Bedrock model
2. **Small documentation files** reduce RAG retrieval tokens
3. **Session management** reduces redundant context loading
4. **Client-side fallbacks** reduce unnecessary API calls
5. **Response caching** (future): Cache common questions

**Comparison with Alternatives**:

| Model | Input (per 1M) | Output (per 1M) | Cost per Request |
|-------|----------------|-----------------|------------------|
| Nova Micro | $0.035 | $0.14 | $0.00004 |
| Nova Lite | $0.06 | $0.24 | $0.00007 |
| Claude 3 Haiku | $0.25 | $1.25 | $0.00033 |
| GPT-3.5 Turbo | $0.50 | $1.50 | $0.00051 |

**Nova Micro provides 8-12x cost savings** compared to other models while maintaining quality for FAQ/documentation tasks.

#### Benefits of RAG Architecture

1. **Accuracy**: Responses based on actual documentation, not hallucinations
2. **Maintainability**: Update docs in S3 without retraining
3. **Scalability**: Bedrock handles scaling automatically
4. **Cost-Effective**: Pay only for tokens used
5. **Low Latency**: Nova Micro optimized for speed
6. **Version Control**: Documentation files tracked in Git
7. **Easy Updates**: Upload new .md files to S3 to expand knowledge

#### Future Enhancements

- **Feedback Loop**: User ratings on AI responses
- **Analytics**: Track common questions to improve docs
- **Multi-language**: Support for regional languages
- **Voice Input**: Speech-to-text integration
- **Proactive Help**: Context-aware suggestions based on user actions
- **Response Caching**: Cache frequent questions to reduce costs

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
├── meetlite-user-notes/
│   └── {email}/
│       └── {timestamp}_{meetingId}.txt
└── cstmeet-ai-docs/
    ├── 01_overview.md
    ├── 02_signup_login.md
    ├── 03_dashboard.md
    ├── 04_create_meeting.md
    ├── 05_join_meeting.md
    ├── 06_meeting_room_ui.md
    ├── 07_audio_video_controls.md
    ├── 08_common_issues.md
    ├── 09_mobile_usage.md
    ├── 10_security_privacy.md
    └── 11_new_features.md
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
- `webrtc.js` - WebRTC manager service
- `cognito.js` - Auth configuration

**Context**:
- `MeetAuthContext.jsx` - Global auth state

### WebRTC Implementation

The WebRTC service (`webrtc.js`) is a clean implementation based on the working HTML test file, providing:

**WebRTCManager Class**:
- Direct WebSocket connection management
- Peer connection lifecycle handling
- ICE candidate queuing and flushing
- Offer/answer negotiation
- Stream management

**Key Features**:
- Simple API: `startMedia()`, `connectWebSocket()`, `sendOfferTo()`
- Event callbacks: `onTrack()`, `onConnectionState()`
- Automatic cleanup on disconnect
- No React state overhead in WebRTC operations

**Configuration**:
```javascript
const ICE_SERVERS = [
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
]
```

### State Management

Uses React hooks for local state:
- `useState` - Component state
- `useEffect` - Side effects
- `useRef` - Mutable refs (WebSocket, peer connections)
- `useMemo` - Computed values

### WebRTC Flow

**Using WebRTCManager Service**:

1. Initialize manager: `new WebRTCManager(meetingId, userEmail)`
2. Start media: `await manager.startMedia()` → Gets local camera/mic stream
3. Connect WebSocket: `manager.connectWebSocket()` → Opens signaling channel
4. Poll participants: `/meeting/getid` every 5s
5. For each new participant:
   - Call `manager.sendOfferTo(email)` if should initiate
   - Manager handles offer/answer exchange automatically
   - Manager queues ICE candidates until remote description is set
6. On remote track: `manager.onTrack((email, stream) => ...)` → Display video
7. On disconnect: `manager.cleanup()` → Closes all connections

**Advantages**:
- Clean separation: WebRTC logic in service, React handles UI only
- No state overhead: Direct peer connection management
- Fast performance: Matches HTML test file speed
- Easy debugging: Simple, linear flow

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
