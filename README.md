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

## 📅 Day 2 – Cloud-Native Architecture & CI/CD (Production Grade)

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

## 🔐 Security Best Practices
- No secrets committed to repository
- AWS credentials stored in GitHub Secrets
- HTTPS enforced using ACM
- Private ECR repository

---

## 🏗️ Final Production Architecture

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
