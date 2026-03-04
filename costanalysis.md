# CST Meet – AWS Cost Estimation Report

## Overview

This document provides a detailed AWS cost estimation for **CST Meet**, based on the current cloud architecture and light usage assumptions.

### Assumptions
- Light testing and demo usage
- 2–10 active users
- Few meetings per day
- No meeting recordings enabled
- WebRTC media traffic is peer-to-peer (P2P)

---

## Services Included in Cost Estimation

### Frontend & Infrastructure
- ECS Fargate (1 task running 24×7)
- Application Load Balancer (ALB)
- ACM SSL Certificate (Free)
- Amazon Route 53
- Amazon ECR
- CloudFront (low usage)

### Backend & Data Layer
- API Gateway (REST + WebSocket)
- AWS Lambda
- Amazon DynamoDB (On-Demand)
- Amazon Cognito
- Amazon S3 (minimal usage)

### AI Services
- Amazon Bedrock (Nova Micro model)
- Bedrock Knowledge Base (RAG)
- S3 (AI documentation storage)

---

## ECS Fargate Cost (Primary Fixed Cost)

**Configuration**
- 0.5 vCPU
- 1 GB Memory
- 1 task running continuously
- Region: ap-south-1 (Mumbai)

| Resource | Cost (USD/hour) |
|--------|-----------------|
| vCPU | ~$0.020 |
| Memory | ~$0.004 |
| **Total** | **~$0.024** |

**Estimated Cost**
- **1 Day:** ~$0.58
- **1 Month:** ~$17.40

---

## Application Load Balancer (ALB)

- Low traffic
- Minimal LCU usage

| Duration | Cost |
|--------|------|
| 1 Day | ~$0.75 |
| 1 Month | ~$22 – $25 |

---

## API Gateway

Includes REST APIs and WebSocket signaling.

| Duration | Cost |
|--------|------|
| 1 Day | ~$0.05 |
| 1 Month | ~$1.50 |

---

## AWS Lambda

- Short executions
- Low invocation count
- Mostly covered under free tier

| Duration | Cost |
|--------|------|
| 1 Day | $0.00 |
| 1 Month | $0.20 – $0.50 |

---

## DynamoDB (On-Demand)

Tables:
- Users
- Meetings
- Participants

| Duration | Cost |
|--------|------|
| 1 Day | ~$0.02 |
| 1 Month | ~$0.50 – $1 |

---

## Amazon Cognito

- First 50,000 MAUs are free

| Duration | Cost |
|--------|------|
| 1 Day | $0 |
| 1 Month | $0 |

---

## Amazon ECR

- Single Docker image
- < 1 GB storage

| Duration | Cost |
|--------|------|
| 1 Month | $0.10 – $0.20 |

---

## Amazon Bedrock (Nova Micro) - AI Assistant

**Model**: Nova Micro (Foundation Model with RAG)

**Pricing (ap-south-1)**:
- Input tokens: $0.035 per 1M tokens
- Output tokens: $0.14 per 1M tokens

**Usage Assumptions (10 users)**:
- 3 AI requests per user per day
- Average input: ~570 tokens (question + system prompt + RAG context)
- Average output: ~150 tokens

| Duration | Requests | Input Cost | Output Cost | Total |
|----------|----------|------------|-------------|-------|
| 1 Day | 30 | $0.0006 | $0.0004 | $0.001 |
| 1 Month | 900 | $0.018 | $0.019 | $0.04 |

**S3 Storage (AI Docs)**: 11 MD files (~50 KB) = $0.001/month

---

## Route 53

- Hosted Zone: $0.50/month
- DNS queries negligible

---

## CloudFront (Low Usage)

| Duration | Cost |
|--------|------|
| 1 Day | ~$0.02 |
| 1 Month | ~$0.50 – $1 |

---

## Final Cost Summary

### 1-Day Estimate (10 Users)

| Service | Cost |
|-------|------|
| ECS Fargate | $0.58 |
| ALB | $0.75 |
| API Gateway | $0.05 |
| DynamoDB | $0.02 |
| CloudFront | $0.02 |
| **Bedrock AI (Nova Micro)** | **$0.01** |
| **Total** | **≈ $1.43 (~₹120)** |

**AI Cost Breakdown (10 users, 3 requests/user/day)**:
- Total requests: 30
- Input tokens: ~570 per request
- Output tokens: ~150 per request
- Cost: (30 × 570 / 1M × $0.035) + (30 × 150 / 1M × $0.14) = $0.0006 + $0.00042 ≈ $0.001

---

### 1-Month Estimate (10 Users)

| Service | Cost |
|-------|------|
| ECS Fargate | $17.40 |
| ALB | $23.00 |
| API Gateway | $1.50 |
| Lambda | $0.30 |
| DynamoDB | $1.00 |
| Cognito | $0 |
| ECR | $0.20 |
| Route 53 | $0.50 |
| CloudFront | $0.75 |
| **Bedrock AI (Nova Micro)** | **$0.04** |
| **S3 (AI Docs Storage)** | **$0.001** |
| **Total** | **≈ $44.70 (~₹3,750)** |

**AI Cost Breakdown (10 users, 3 requests/user/day, 30 days)**:
- Total requests: 900
- Input cost: (900 × 570 / 1M × $0.035) = $0.018
- Output cost: (900 × 150 / 1M × $0.14) = $0.019
- S3 storage: 11 files (~50 KB) = $0.001
- **Total AI cost: $0.038 ≈ $0.04**

---

## Cost Optimization Strategies

- Stop ECS service when not demoing
- Reduce ALB idle time in development
- Use Fargate Spot for non-production workloads
- Add TURN servers only if required
- Separate development and production environments