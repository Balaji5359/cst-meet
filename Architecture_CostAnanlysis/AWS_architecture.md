## Architecture Diagram – CST Meet (End-to-End AWS Cloud Architecture)

---

### High-Level System Architecture

```text
+----------------------+
|   User Browser       |
| (Laptop / Mobile)    |
+----------+-----------+
           |
           | HTTPS (443)
           v
+----------------------+
|  Route 53 (DNS)      |
|  cstmeet2.skillroute |
+----------+-----------+
           |
           v
+----------------------+
| Application Load     |
| Balancer (ALB)       |
| HTTPS (ACM SSL)      |
+----------+-----------+
           |
           v
+----------------------+
| Amazon ECS (Fargate) |
| MeetLite Frontend    |
| React + WebRTC UI    |
+----------+-----------+
           |
           | REST APIs (HTTPS)
           v
+----------------------+
| API Gateway (REST)   |
+----------+-----------+
           |
           v
+----------------------+
| AWS Lambda           |
| (Meeting APIs)       |
+----------+-----------+
           |
           v
+----------------------+
| DynamoDB             |
| - MeetLiteUsers      |
| - Meetings           |
| - Participants       |
+----------------------+

-----------------------------------------------------

+----------------------+
| User Browser A       |
| User Browser B       |
+----------+-----------+
           |
           | WebSocket (WSS)
           v
+----------------------+
| API Gateway          |
| WebSocket API        |
| meetlite-signaling   |
+----------+-----------+
           |
           v
+----------------------+
| AWS Lambda           |
| WebSocket Handlers   |
| - $connect           |
| - $default           |
| - $disconnect        |
+----------+-----------+
           |
           v
+----------------------+
| DynamoDB             |
| WebSocketConnections |
+----------------------+

-----------------------------------------------------

+==================================================+
|   Direct Peer-to-Peer Media Flow (WebRTC)        |
|                                                  |
|   Browser A  <====== Video/Audio ======> Browser B|
|                                                  |
|   (No media flows through AWS services)           |
+==================================================+
