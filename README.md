# CST Meet - Deployment and Feature Progress

## Project Overview
CST Meet (MeetLite) is a web-based real-time meeting platform with Cognito authentication, meeting lifecycle APIs, WebSocket signaling, WebRTC media, and a responsive React UI.

---

## Day 1 - Initial Deployment

### Scope Completed
- Built and deployed frontend app
- Hosted using NGINX on EC2
- Configured domain and HTTPS

### Stack
- Frontend: Vite + React
- Web Server: NGINX
- Infra: AWS EC2
- Domain/SSL: Route + Certbot style SSL setup

### Architecture
User Browser -> Custom Domain (HTTPS) -> NGINX -> Vite `dist/`

---

## Day 2 - Cloud-Native Migration and CI/CD

### Scope Completed
- Dockerized frontend
- Migrated hosting from EC2 to ECS Fargate
- Added ALB + ACM HTTPS
- Enabled GitHub Actions CI/CD

### Deployment Flow
Developer -> GitHub -> GitHub Actions -> Amazon ECR -> ECS Fargate -> ALB (HTTPS) -> Route53 Domain

### Production Domain
- https://cstmeet2.skillrouteai.com

---

## Day 3 - Realtime Meeting Core

### Scope Completed
- Cognito login (Google + Email)
- Meeting REST APIs with Lambda + DynamoDB
- WebSocket signaling API with Lambda
- Initial WebRTC integration for live media

### Core AWS Services
- Cognito User Pool
- API Gateway (REST + WebSocket)
- Lambda (Python)
- DynamoDB (Meetings, Participants, connection mapping)
- ECS Fargate (frontend)

### REST APIs (Day 3)
- `POST /meeting/create`
- `POST /meeting/join`
- `POST /meeting/leave` (plus fallback handling)
- `POST /meeting/getid`
- `POST /meetlite-ai-api`

---

## Day 4 - UX Stabilization, AI Chat Polish, User Data APIs

### Scope Completed Today
- Stabilized dashboard metadata panels
- Added user recordings and notes listing UI
- Added recording preview modal (video player)
- Added note preview modal (text viewer)
- Added response cleanup and formatting for MeetLite AI chatbot:
  - Renders assistant answers in readable paragraph/list form
  - Highlights key terms for better readability
  - Quick FAQ buttons after first user interaction
---

## API Section (Updated with User Data API)

### Base URL
- `https://######.execute-api.ap-south-1.amazonaws.com/dev`

### Meeting APIs
- `POST /meeting/create`
- `POST /meeting/join`
- `POST /meeting/leave`
- `POST /meeting/getid`

### AI API
- `POST /meetlite-ai-api`

### User Data API
- `POST /meetlite-user-data`
- Request wrapper used by frontend:
```json
{
  "body": "{\"email\":\"user@example.com\",\"task\":\"getmeetings\"}"
}
```

### User Data Tasks Implemented
1. `getmeetings`
- Returns user meeting history and metadata (status, duration, timestamps)

2. `saverecording`
- Saves recording content to S3 under user folder

3. `getrecording`
- Lists user recordings from S3

4. `getrecordingpreview`
- Returns short-lived signed URL for video preview in UI

5. `savenote`
- Saves note text as `.txt` in S3

6. `getnotes`
- Lists saved notes from S3

7. `getnotepreview`
- Returns note text content for popup preview

---

## Data Stores

### DynamoDB
- `Meetings`
- `Participants`
- `MeetliteConnections` (WebSocket connections)

### S3
- Bucket: `fields-related-data-of-myapp`
- Prefix: `meetlite-user-data/`
- Recordings: `meetlite-user-recordings/<email>/...`
- Notes: `meetlite-user-notes/<email>/...`

---

## IAM Notes (User Data Lambda)
Required permissions for `/meetlite-user-data` Lambda role:
- DynamoDB: `GetItem`, `Scan` on `Meetings`, `Participants`
- S3: `ListBucket`, `GetObject`, `PutObject` on `fields-related-data-of-myapp` and `meetlite-user-data/*`
- CloudWatch Logs: standard create/write permissions

---

## Current Status
- Auth: Stable
- Meeting lifecycle APIs: Stable
- WebSocket signaling: Stable
- WebRTC media: Working, network-dependent edge cases under observation
- Dashboard metadata + preview UX: Completed (Day 4)
- AI chatbot response formatting: Completed (Day 4)

---

## Important Deployment Note
If UI shows:
- `Unsupported task: getrecordingpreview`
- `Unsupported task: getnotepreview`

Then API Gateway is still using an old Lambda deployment. Re-deploy Lambda code and re-deploy API stage.
