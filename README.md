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
```text
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
