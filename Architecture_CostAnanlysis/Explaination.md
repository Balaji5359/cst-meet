# CST Meet – Architecture Explanation

## Overview

CST Meet is a cloud-native video meeting platform built using AWS managed services.  
The architecture focuses on scalability, security, and cost efficiency by leveraging serverless components and peer-to-peer media streaming.

---

## Frontend Layer

- React application built with Vite
- Hosted on ECS Fargate
- Traffic routed through Application Load Balancer
- HTTPS enforced using ACM certificates

---

## Authentication Layer

Authentication is handled by Amazon Cognito.

### Supported Methods
- Google OAuth
- Email and password login

### Security
- JWT tokens managed securely on the frontend
- No credentials stored in the backend

---

## Meeting Lifecycle Management

- REST APIs exposed via API Gateway
- AWS Lambda handles:
  - Meeting creation
  - Joining and leaving meetings
  - Meeting status updates
- DynamoDB stores meeting and participant data

---

## Real-Time Signaling

- WebSocket API Gateway used for signaling
- AWS Lambda relays:
  - WebRTC offers
  - Answers
  - ICE candidates
- Active connections tracked in DynamoDB

---

## Media Streaming

- WebRTC used for real-time audio and video
- Media flows directly between browsers
- AWS does not handle media transport

> This design significantly reduces bandwidth and infrastructure costs.

---

## Key Design Principles

- Fully cloud-native backend
- Serverless and managed services
- Secure authentication and authorization
- Horizontal scalability
- Clear separation of concerns:
  - UI
  - Authentication
  - APIs
  - Signaling
  - Media streaming

---

## Production Readiness

- End-to-end HTTPS
- IAM-based least-privilege access
- CI/CD using GitHub Actions
- Stateless Lambda functions
- Ready for future enhancements:
  - TURN/STUN servers
  - Meeting recording
  - Analytics and monitoring

---

## Architecture Diagram

> The complete AWS architecture diagram is provided as an **image** for clarity and professional documentation.
