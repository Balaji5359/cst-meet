# CST Meet – Day 1 Deployment

## Project Overview
**CST Meet** is a web-based meeting and collaboration platform designed for students and academic use.  
This repository contains the frontend application and its **production deployment on AWS infrastructure**.

---

## Tech Stack (Day 1)
- **Frontend**: Vite + HTML, CSS, JavaScript
- **Web Server**: NGINX
- **Cloud**: AWS EC2 (Ubuntu)
- **Domain & SSL**: Custom domain with HTTPS (Certbot)
- **Version Control**: Git & GitHub

---

## Infrastructure Setup
- **EC2 Instance**: Ubuntu Server
- **Static Public IP**: Elastic IP
- **Domain**: https://cstmeet.skillrouteai.com
- **Web Server**: NGINX (configured using server blocks)
- **SSL Certificate**: configured Encrypt 

---

## Deployment Architecture
text
User Browser
     |
     v
Custom Domain (HTTPS)
     |
     v
NGINX (Static Hosting & Reverse Proxy)
     |
     v
Vite Production Build (dist/)




---

## Day 2 – Cloud-Native Architecture & CI/CD (Production Grade)

### Goals Achieved
- Dockerized frontend application
- Migrated from EC2 to ECS (Fargate)
- Enabled HTTPS via ALB + ACM
- Implemented full CI/CD pipeline
- Automatic deployment on every GitHub push

---

### Containerization
- Created Dockerfile with multi-stage build
- NGINX used as production web server
- Docker image built and tested locally
- Image pushed to **Amazon ECR (private repository)**

---

### AWS ECS Deployment
- ECS Cluster: `meetlite-ui`
- Task Definition: `meetlite-task`
- Service: `meetlite-service`
- Launch Type: **Fargate**
- Desired Tasks: 1
- Networking:
  - Public subnets
  - Auto-assigned public IP

---

### Load Balancer & HTTPS
- Application Load Balancer (internet-facing)
- HTTPS Listener (443)
- SSL Certificate from AWS ACM
- Target Group:
  - Type: IP
  - Port: 80
  - Health Check: `/`

---

### Custom Domain
- Route 53 Alias record → ALB
- Secure domain: https://cstmeet2.skillrouteai.com
---

### CI/CD Pipeline (GitHub Actions)

A fully automated CI/CD pipeline was implemented.

#### Workflow Trigger
- On every push to `main` branch

#### CI/CD Steps
1. Checkout source code
2. Configure AWS credentials securely using GitHub Secrets
3. Build Docker image
4. Push image to Amazon ECR
5. Force new ECS service deployment
6. Application updates live automatically

#### Result
- Any UI change committed to GitHub is deployed live within minutes 🚀

---

## Security Best Practices
- No secrets committed to repository
- AWS credentials stored in GitHub Secrets
- HTTPS enforced using ACM
- Private ECR repository

---

## Final Production Architecture

Developer (VS Code)
↓
GitHub Repository
↓
GitHub Actions (CI/CD)
↓
Amazon ECR
↓
Amazon ECS (Fargate)
↓
Application Load Balancer (HTTPS)
↓
Custom Domain (Route 53)
↓
User Browser


# CST Meet – Day 3 Media Scaling & Production Readiness

## Project Overview
Day 3 focused on extending **CST Meet** into a **real-time video meeting platform** by integrating authentication, backend APIs, WebSocket-based signaling, and WebRTC media streaming using AWS serverless architecture.

---

## Tech Stack (Day 3)
- **Frontend**: Vite + React + WebRTC
- **Authentication**: Amazon Cognito (Google + Email)
- **Backend**: AWS Lambda (Python)
- **Database**: Amazon DynamoDB
- **APIs**:
  - REST API Gateway (meeting lifecycle)
  - WebSocket API Gateway (real-time signaling)
- **Deployment**: AWS ECS (Fargate)
- **Security**: IAM, HTTPS (ALB + ACM)

---

## Authentication & User Management
- Implemented **Amazon Cognito User Pool**
- Enabled:
  - Google OAuth
  - Email & Password login
- Used Cognito Hosted UI
- OAuth 2.0 Authorization Code Flow
- Extracted user identity from ID token
- Stored authenticated user details in DynamoDB

---

## Backend Architecture
- Fully **serverless backend**
- Business logic handled via AWS Lambda
- Data persistence using DynamoDB
- API Gateway used for:
  - REST APIs
  - WebSocket signaling

---

## DynamoDB Tables
- **MeetLiteUsers**
  - userId
  - email
  - name
  - signup_method
  - created_at

- **Meetings**
  - meetingId
  - hostUserId
  - createdAt
  - expiresAt
  - status (ACTIVE / EXPIRED)

- **Participants**
  - meetingId
  - userEmail
  - role (ADMIN / PARTICIPANT)
  - joinedAt

- **WebSocketConnections**
  - connectionId
  - meetingId
  - userEmail
  - connectedAt

---

## REST APIs Implemented
- **Create Meeting**
  - Generates meeting ID
  - Assigns host as ADMIN
  - Stores meeting metadata

- **Join Meeting**
  - Validates meeting status
  - Adds participant
  - Prevents duplicate joins

- **Leave Meeting**
  - Handles participant exit
  - Updates meeting status if expired

- **Get Meeting Status**
  - Returns meeting status
  - Returns host details
  - Returns normalized participant list

- **MeetLite-AI-API**
  - API to connect to Bedrock Agent(KB)
  - To handle user queries
---

## Real-Time Signaling (WebSocket)
- Created **API Gateway WebSocket API**
- Route selection expression:
  - `$request.body.action`

### WebSocket Routes
- `$connect`
- `$disconnect`
- `$default`

### WebSocket Lambda Functions
- **meetlite-ws-connect**
  - Registers WebSocket connection
  - Maps user to meeting

- **meetlite-ws-message**
  - Relays WebRTC signaling messages
  - Handles offer, answer, ICE candidates

- **meetlite-ws-disconnect**
  - Cleans up disconnected users

---

## WebRTC Media Integration
- Enabled camera & microphone using `getUserMedia`
- Implemented peer-to-peer media streaming
- Used `RTCPeerConnection`
- Integrated:
  - Offer / Answer exchange
  - ICE candidate handling
- Media flows directly between browsers (P2P)

---

## UI Enhancements
- Dashboard → Create / Join meeting
- Meeting Room UI
- Video grid layout
- ADMIN badge for host
- Participant role handling
- Leave meeting confirmation
- Mute / Camera toggle controls
- Duplicate participant prevention

---

## Deployment & Testing
- Frontend deployed via **ECS Fargate**
- Backend deployed via **AWS Lambda**
- Tested with:
  - Multiple Google accounts
  - Multiple browsers
  - Multiple devices
- Verified:
  - Authentication flow
  - Meeting lifecycle
  - WebSocket connections
  - Local video rendering

---

## Current Status
- Authentication:  Completed
- Backend APIs:  Stable
- WebSocket signaling:  Integrated
- WebRTC media:  In progress (ICE/TURN optimization)
- Production readiness:  Ongoing

---
