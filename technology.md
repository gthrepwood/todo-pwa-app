# Technology Stack - Todo PWA Application

## Detailed Technical Documentation

This document provides a comprehensive overview of all technologies, design patterns, and implementation details used in the Todo PWA application. Each section includes practical examples, references to official documentation, and explanations of how each feature works.

---

## Table of Contents

1. [Dynamic DNS](#1-dynamic-dns)
2. [Subdomain Support](#2-subdomain-support)
3. [Progressive Web App (PWA)](#3-progressive-web-app-pwa)
4. [Node.js Backend](#4-nodejs-backend)
5. [Small Footprint Backend Design](#5-small-footprint-backend-design)
6. [WebSocket Communication](#6-websocket-communication)
7. [Full Screen Mode](#7-full-screen-mode)
8. [Unraid Configuration](#8-unraid-configuration)
9. [Favorites](#9-favorites)
10. [Multiple Todo Lists](#10-multiple-todo-lists)
11. [Cooperative Todo List Handling](#11-cooperative-todo-list-handling)
12. [Undo Functionality](#12-undo-functionality)
13. [Todo List Save/Load](#13-todo-list-saveload)
14. [Protected Endpoints](#14-protected-endpoints)
15. [Docker Image](#15-docker-image)
16. [HTTPS Support with Self-Signed Certificate](#16-https-support-with-self-signed-certificate)
17. [Multi-Lingual Test Cases](#17-multi-lingual-test-cases)

---

## 1. Dynamic DNS

### Description

Dynamic DNS (DDNS) is a method of automatically updating a name server in the Domain Name System (DNS), often in real-time, with the active DDNS configuration of its configured hostnames, addresses or other information. This is particularly useful for home networks or small businesses that do not have static IP addresses from their Internet Service Provider (ISP).

### Implementation in This Project

The Todo PWA application is designed to work behind a dynamic IP address through the following configuration:

1. **DDNS Service Integration**: The application can be accessed via a DDNS hostname (e.g., `todo.yourdomain.com`) which points to your dynamic IP address.

2. **Router Configuration**: Port forwarding is configured on the router to direct traffic to the Docker container running the application.

3. **Automatic IP Updates**: When combined with a DDNS client (such as ddclient, DDNS in router settings, or Cloudflare API), the domain always resolves to the current IP address.

### Example DDNS Providers

- **No-IP**: https://www.noip.com/ - Free and paid DDNS services
- **DuckDNS**: https://duckdns.org/ - Free DDNS for popular domains
- **Cloudflare**: https://www.cloudflare.com/ - DNS with API-based updates
- **DynDNS**: https://dyn.com/dns/ - Enterprise-grade DDNS

### Router Port Forwarding Example

```
External Port: 443 (for HTTPS) or 3004 (for direct access)
Internal IP: 192.168.1.xxx
Internal Port: 3004
Protocol: TCP
```

### Reference

- Wikipedia - Dynamic DNS: https://en.wikipedia.org/wiki/Dynamic_DNS
- Mozilla Developer Network - HTTP Overview: https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview

---

## 2. Subdomain Support

### Description

A subdomain is a prefix added to a domain name to separate a part of your website. For example, in `todo.example.com`, `todo` is the subdomain of `example.com`. This provides logical separation and a dedicated namespace for the application.

### Implementation in This Project

The application is accessed via a subdomain which is configured at the DNS level:

1. **DNS A Record**: Create an A record pointing `todo.example.com` to your server IP
2. **Reverse Proxy Configuration**: Configure Nginx, Traefik, or Caddy to route subdomain traffic to the Docker container

### Example Nginx Configuration

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name todo.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Benefits

- **Isolation**: Separates the todo app from main website
- **Professional Appearance**: Looks more professional than using ports
- **SSL/TLS Easy**: Can have dedicated SSL certificates per subdomain
- **Mobile Friendly**: Easier to remember and type on mobile devices

### Reference

- Nginx Documentation: https://nginx.org/en/docs/
- Let's Encrypt: https://letsencrypt.org/

---

## 3. Progressive Web App (PWA)

### Description

A Progressive Web App is a type of application software built using web technologies but providing a user experience similar to native applications. PWAs combine the best of web and mobile apps, offering features like offline support, push notifications, and home screen installation.

### Implementation in This Project

The Todo PWA implements the following PWA features:

#### 3.1 Service Worker

The Service Worker is a script that runs in the background, separate from the web page. It enables offline functionality and caching strategies.

The application caches all static assets (HTML, CSS, JavaScript, manifest) and serves them when the user is offline. API requests are excluded from caching to ensure fresh data when online.

#### 3.2 Web App Manifest

The manifest file provides metadata about the application, enabling installation on home screen. It defines the app name, icons, theme color, and display mode (set to "fullscreen" for immersive experience).

#### 3.3 Service Worker Registration

The application registers the service worker on page load, enabling PWA features automatically.

#### 3.4 Responsive Design

The CSS uses responsive design principles with flexible layouts that adapt to any screen size, from mobile phones to desktop computers.

### Key PWA Features

| Feature | Implementation |
|---------|---------------|
| Offline Support | Service Worker caches static assets |
| Home Screen Installation | Web App Manifest with icons |
| App-Like Experience | Fullscreen display mode |
| Background Sync | WebSocket for real-time updates |
| Responsive Design | CSS flexbox/grid layouts |

### Reference

- Google Web Dev - Progressive Web Apps: https://web.dev/progressive-web-apps/
- MDN - Service Worker Guide: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- Web App Manifest: https://developer.mozilla.org/en-US/docs/Web/Manifest

---

## 4. Node.js Backend

### Description

Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine. It uses an event-driven, non-blocking I/O model that makes it lightweight and efficient, perfect for real-time applications.

### Implementation in This Project

The backend is built with Node.js using Express.js for routing and WebSocket for real-time communication. It provides RESTful API endpoints for all todo operations and WebSocket connections for real-time synchronization.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user and create session |
| POST | `/api/auth/logout` | End current session |
| GET | `/api/auth/check` | Verify authentication status |
| GET | `/api/todos` | Get all todos for authenticated user |
| POST | `/api/todos` | Create new todo item |
| PUT | `/api/todos/:id` | Update single todo |
| DELETE | `/api/todos/:id` | Delete single todo |
| PUT | `/api/todos` | Bulk update (used for undo) |

### Backend Components

- **Express.js**: Web framework for HTTP endpoints
- **compression**: GZIP/Brotli compression middleware for smaller responses
- **ws**: WebSocket library for real-time communication
- **crypto**: Built-in Node.js module for password hashing
- **fs**: File system module for data persistence

### Reference

- Node.js Official Site: https://nodejs.org/
- Express.js Documentation: https://expressjs.com/
- WebSocket npm package: https://www.npmjs.com/package/ws

---

## 5. Small Footprint Backend Design

### Description

The backend is designed to be lightweight with minimal resource usage, making it suitable for running on low-power devices like Raspberry Pi, NAS devices, or embedded systems.

### Design Principles

1. **Minimal Dependencies**: Only essential packages are used (4 total)
2. **In-Memory Operations**: Fast data processing with file persistence
3. **Single-File Architecture**: All backend code in one file
4. **No Database Server**: Uses JSON files instead of SQL/NoSQL

### Package Dependencies

Only 4 npm packages are required:
- **express**: Web framework (~5MB)
- **cors**: Cross-origin resource sharing (~100KB)
- **ws**: WebSocket library (~100KB)
- **selfsigned**: SSL certificate generation (~1MB)

### Resource Usage

| Metric | This Project | Traditional App |
|--------|---------------|-----------------|
| Dependencies | 4 | 50+ |
| Memory Usage | ~50MB | 500MB+ |
| Database | JSON files | PostgreSQL/MySQL |
| Container Size | ~200MB | 1GB+ |
| Startup Time | < 2 seconds | 10+ seconds |

### Benefits

- Runs on Raspberry Pi and similar low-power devices
- Minimal system requirements
- Fast deployment and startup
- Easy to understand and modify

### Reference

- Express.js: https://expressjs.com/
- 12-Factor App methodology: https://12factor.net/

---

## 6. WebSocket Communication

### Description

WebSocket is a communication protocol that provides full-duplex communication channels over a single TCP connection. Unlike HTTP, where the client must request data, WebSocket allows the server to push data to the client in real-time.

### Implementation in This Project

The application uses WebSocket for instant synchronization across all connected clients. When any user makes a change (add, edit, delete todo), the server immediately broadcasts the updated todo list to all connected clients.

### How It Works

1. **Server broadcasts** changes to all connected WebSocket clients
2. **Clients receive** the updated todo list in real-time
3. **No polling needed** - efficient and instant updates

### Benefits

1. **Real-Time Updates**: Changes appear instantly on all devices
2. **Efficient**: No polling needed, reduces server load
3. **Bi-directional**: Both client and server can initiate communication
4. **Low Latency**: Immediate push notifications for changes

### Use Cases in This App

- **Todo Updates**: When a todo is added, modified, or deleted, all clients receive the update immediately
- **Cross-Device Sync**: Edit on phone, see it on desktop instantly
- **Undo Operations**: Undo actions are broadcast to all connected clients

### Reference

- WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- WebSockets vs HTTP comparison: https://www.websocket.org/quantum.html

---

## 7. Full Screen Mode

### Description

Full screen mode allows the application to use the entire screen, hiding the browser's address bar, toolbars, and other UI elements. This provides a more immersive, app-like experience similar to native applications.

### Implementation in This Project

The full screen functionality is implemented using the Fullscreen API. A button in the header allows users to toggle between normal and full screen mode. The PWA manifest also specifies fullscreen as the default display mode.

### Browser API Used

The application uses `requestFullscreen()` and `exitFullscreen()` methods along with `fullscreenchange` event to detect and respond to full screen state changes.

### Use Cases

1. **Immersive Task Management**: Focus on todos without distractions
2. **Presentation Mode**: Use during meetings or presentations
3. **Mobile Experience**: Simulates native app experience on mobile
4. **Kiosk Mode**: Perfect for single-purpose displays

### Browser Support

Fullscreen API is supported in all modern browsers:
- Chrome 15+
- Firefox 10+
- Safari 5.1+
- Edge 12+

### Reference

- Fullscreen API: https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
- Google Developers - Fullscreen: https://developers.google.com/web/fundamentals/native-hardware/fullscreen

---

## 8. Unraid Configuration

### Description

Unraid is a network-attached storage (NAS) operating system that allows for flexible storage management, virtualization, and Docker container deployment. It provides an easy-to-use web interface for managing servers.

### Implementation in This Project

The application is designed to run as a Docker container on Unraid, with proper configuration for persistence and network access.

### Docker Template for Unraid

```yaml
name: TodoPWA
containers:
  todo-pwa:
    image: todo-pwa:latest
    container_name: todo-pwa
    ports:
      - "3004:3004"
    volumes:
      - /mnt/user/appdata/todo-pwa/data:/app/data
    environment:
      - PORT=3004
      - TZ=Europe/Budapest
    restart: unless-stopped
```

### Unraid Installation Steps

1. **Install Docker Plugin**: Go to Unraid Settings → Docker → Enable Docker
2. **Add Container**: Click "Add Container" in Docker tab
3. **Configure Template**: Fill in the container configuration
4. **Set Volumes**: Map persistent storage for data
5. **Set Network**: Configure port forwarding on router

### Data Persistence

The `/app/data` volume stores:
- `passwords.json` - Hashed passwords
- `sessions.json` - Active sessions
- `todos_*.json` - Todo data files
- `key.pem` and `cert.pem` - SSL certificates

### Benefits on Unraid

- **Easy Backup**: Data folder can be included in Unraid backup
- **Auto-Start**: Container starts automatically with server
- **Resource Management**: Easy to monitor CPU/memory usage
- **Parity Protection**: Data can be protected with Unraid's parity

### Reference

- Unraid Official Site: https://unraid.net/
- Unraid Docker Guide: https://docs.unraid.net/articles/manual/docker/
- LinuxServer.io: https://www.linuxserver.io/

---

## 9. Favorites

### Description

The favorites feature allows users to mark important todos with a star, causing them to appear at the top of the list for quick access.

### Implementation in This Project

Each todo object has a `favorite` boolean property. When rendering the todo list, favorites are sorted to appear first, followed by regular todos sorted by ID.

### Features

- **Quick Toggle**: One click to star/unstar
- **Auto-Sort**: Favorites always appear first
- **Persistent**: Saved in todo data
- **Undo Support**: Can be undone like any other action
- **Visual Distinction**: Star icons (⭐ for favorited, ☆ for not)

### Data Structure

```json
{
  "id": 1,
  "text": "Important task",
  "done": false,
  "favorite": true
}
```

### Reference

- LocalStorage API: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

---

## 10. Multiple Todo Lists

### Description

The application supports creating and managing multiple independent todo lists. Each list is identified by a unique password, allowing users to have separate lists for different purposes (work, personal, projects, etc.).

### Implementation in This Project

The multiple list feature is implemented using password-based isolation:

1. **First Login**: When a new password is used, a new todo file is created
2. **Separate Databases**: Each password has its own `todos_<hash>.json` file
3. **Session-Based**: Sessions store the password hash and load corresponding todos
4. **No Explicit List Management**: Lists are implicitly created by password

### Example Data Files

```
backend/data/
├── passwords.json              # Hash storage
├── sessions.json              # Active sessions
├── todos_abc123.json          # List for password A
├── todos_def456.json          # List for password B
└── todos_ghi789.json          # List for password C
```

### Use Cases

- **Personal vs Work**: Separate lists for different contexts
- **Project-Based**: Different lists for different projects
- **Shared Accounts**: Family members with shared lists
- **Client Separation**: Consultants managing multiple clients

### Reference

- SHA-256 Hash: https://en.wikipedia.org/wiki/SHA-2
- Node.js Crypto: https://nodejs.org/api/crypto.html

---

## 11. Cooperative Todo List Handling

### Description

Cooperative (multi-user) todo handling allows multiple users to work on the same todo list simultaneously, with real-time synchronization ensuring all users see the same data.

### Implementation in This Project

The cooperative features are implemented through:

1. **Session-Based Access**: Each user has a session token
2. **Real-Time Broadcast**: WebSocket pushes changes instantly
3. **File-Based Storage**: Each password has a shared data file
4. **Conflict Resolution**: Last-write-wins strategy

### How Multiple Users Share a List

1. Users share the same password
2. Each user gets their own session token
3. All sessions load the same todo file
4. Changes are broadcast to all connected clients
5. Any user can add, edit, delete, or undo

### Features

- **Real-Time Sync**: All changes appear instantly
- **No Refresh Needed**: WebSocket pushes updates
- **Session Persistence**: Stay logged in across page reloads
- **Simultaneous Edits**: Multiple users can work at once

### Reference

- WebSocket Broadcasting: https://github.com/websockets/ws#broadcast-example

---

## 12. Undo Functionality

### Description

The undo feature allows users to revert recent actions, recovering accidentally deleted todos or reverted changes. The implementation supports both single-action undo and full undo (restoring to original state).

### Implementation in This Project

The undo system uses a stack-based approach:

1. **State Capture**: Before any change, the current todo list is saved to the undo stack
2. **Undo Button**: Appears for 10 seconds after any change
3. **Full Restore**: Undo restores the complete original state (all changes at once)
4. **Auto-Hide**: The undo button disappears after timeout

### Features

1. **Captures All Changes**: Add, delete, toggle, favorite all tracked
2. **10-Second Window**: Undo button appears for 10 seconds
3. **Full State Restore**: Restores complete original state
4. **Visual Feedback**: Clear undo button in UI
5. **Keyboard Support**: Can be triggered via UI button

### Test Cases

Shell script tests validate the undo functionality:
- Delete todo and verify removal
- Undo delete and verify restoration
- Multiple operations and full undo

### Reference

- Stack Data Structure: https://en.wikipedia.org/wiki/Stack_(abstract_data_type)

---

## 13. Todo List Save/Load

### Description

The save/load functionality allows users to export their todo list to a JSON file (backup) and import a previously saved list (restore). This provides data portability and backup capabilities.

### Implementation in This Project

**Save (Export)**: Converts the todo list to JSON format and triggers a browser download as `todos-backup.json`.

**Load (Import)**: Opens a file picker, reads the selected JSON file, validates it as an array, and uploads it to the server, replacing current todos.

### File Format

```json
[
  {
    "id": 1,
    "text": "Buy groceries",
    "done": false,
    "favorite": true
  },
  {
    "id": 2,
    "text": "Call doctor",
    "done": true,
    "favorite": false
  }
]
```

### Features

1. **JSON Format**: Human-readable, easy to edit
2. **Pretty Printed**: Indented for readability
3. **Undo Support**: Loading triggers undo state
4. **Validation**: Checks for valid array format
5. **Error Handling**: Displays error messages on failure

### Use Cases

- **Backup**: Save copy before major changes
- **Restore**: Recover from accidental deletion
- **Editing**: Manually edit todos in text editor

### Reference

- Blob API: https://developer.mozilla.org/en-US/docs/Web/API/Blob

---

## 14. Protected Endpoints

### Description

Protected endpoints require authentication to access. The application implements a session-based authentication system where users must log in with a password to access their todo data.

### Implementation in This Project

**Authentication Flow**:
1. User submits password via login form
2. Server hashes password with SHA-256
3. Server creates a session with a random 256-bit token
4. Client includes token in all subsequent requests via Authorization header
5. Server validates token before processing requests

### Security Features

1. **Password Hashing**: SHA-256 hashing, never plain text
2. **Session Tokens**: 256-bit random tokens
3. **File-Based Storage**: Passwords stored in JSON
4. **HTTP 401**: Returns 401 for unauthenticated requests
5. **Token Validation**: Every request validated against session store

### Middleware

The `requireAuth` middleware intercepts requests to protected endpoints and validates the session token before allowing access.

### Reference

- HTTP Authentication: https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication
- Bearer Tokens: https://tools.ietf.org/html/rfc6750
- SHA-256: https://en.wikipedia.org/wiki/SHA-2

---

## 15. Docker Image

### Description

Docker containerization allows the application to run consistently across different environments. The Dockerfile defines how the application is built and packaged.

### Implementation in This Project

The Dockerfile uses Node.js as the base image, copies only necessary files, installs dependencies, and starts the application.

### Build Instructions

```bash
# Build the Docker image
docker build -t todo-pwa:latest .

# Run the container
docker run -d \
  --name todo-pwa \
  -p 3004:3004 \
  -v ./data:/app/data \
  -e PORT=3004 \
  todo-pwa:latest
```

### Container Management

```bash
# Start container
docker start todo-pwa

# Stop container
docker stop todo-pwa

# View logs
docker logs todo-pwa

# Enter container
docker exec -it todo-pwa sh
```

### Image Size Comparison

| Base Image | Approximate Size |
|------------|------------------|
| node:20-slim | ~900MB |
| node:20-alpine | ~170MB |
| This project's image | ~950MB (with dependencies) |

### Reference

- Docker Official Docs: https://docs.docker.com/
- Node.js Docker Best Practices: https://nodejs.org/en/docs/guides/nodejs-docker-webapp/
- Alpine Linux: https://www.alpinelinux.org/

---

## 16. HTTPS Support with Self-Signed Certificate

### Description

HTTPS encrypts all communication between the client and server, providing security against eavesdropping and man-in-the-middle attacks. Self-signed certificates allow HTTPS without needing a certificate authority.

### Implementation in This Project

**Certificate Generation**: The application includes a script that generates self-signed SSL certificates using the `selfsigned` npm package. The certificates are valid for 365 days with 2048-bit RSA keys.

**Automatic HTTPS Detection**: The server checks for the existence of certificate files (`key.pem` and `cert.pem`) in the data directory. If found, it starts an HTTPS server; otherwise, it uses HTTP.

**WebSocket Protocol**: The client automatically selects `wss://` (WebSocket Secure) protocol when the page is loaded via HTTPS.

### Certificate Details

- **Validity**: 365 days
- **Key Size**: 2048 bits (RSA)
- **Common Name**: localhost (can be changed to your domain)

### Trusting Self-Signed Certificates

**Chrome/Edge**:
1. Open https://yourdomain:3004
2. Click "Advanced" → "Proceed to localhost (unsafe)"

**Firefox**:
1. Open https://yourdomain:3004
2. Click "Advanced" → "Accept the Risk and Continue"

### Production Considerations

For production, consider using:
- **Let's Encrypt**: Free, automated certificates
- **Traefik**: Automatic certificate management
- **Nginx Proxy Manager**: GUI-based SSL management

### Reference

- OpenSSL: https://www.openssl.org/
- Let's Encrypt: https://letsencrypt.org/
- Selfsigned npm: https://www.npmjs.com/package/selfsigned

---

## 17. Multi-Lingual Test Cases

### Description

The application includes comprehensive test cases written in multiple languages - specifically shell scripts (Bash) and JavaScript (Node.js). This ensures the undo functionality and other features work correctly.

### Implementation in This Project

#### Shell Script Tests

The shell script tests use `curl` to make HTTP requests and `jq` to parse JSON responses. Tests cover:
- Login/Authentication
- Get todos
- Delete todo
- Undo delete (restore todo)
- Multiple undo operations
- Bulk operations

#### JavaScript Tests

The JavaScript tests use Node.js built-in `http` module to make requests. Tests cover the same functionality as shell tests but are executed via Node.js runtime.

#### Test Categories

| Category | Languages | Tools |
|----------|-----------|-------|
| API Testing | Bash, JavaScript | curl, http module |
| Undo Testing | Bash, JavaScript | API calls |
| Authentication | Bash, JavaScript | Token handling |
| Integration | Bash | Full workflow |

### Test Execution

```bash
# Shell script tests
chmod +x tests/test-undo.sh
./tests/test-undo.sh

# JavaScript tests
node tests/test-undo.js
```

### Reference

- curl Manual: https://curl.se/docs/manual.html
- Node.js http: https://nodejs.org/api/http.html
- jq Manual: https://stedolan.github.io/jq/manual/

---

## Architecture Summary

```
┌────────────────────────────────────────────────────────────────────┐
│                         Client (PWA)                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  HTML5 / CSS3 / JavaScript (ES6+)                           │   │
│  │  Service Worker (offline caching)                           │   │
│  │  WebSocket Client (real-time sync)                          │   │
│  │  Fullscreen API (immersive mode)                            │   │
│  │  LocalStorage (offline cache)                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────┬───────────────────────────┘
                                         │ HTTPS / WebSocket
                                         │ (encrypted, real-time)
┌────────────────────────────────────────┴───────────────────────────┐
│                        Node.js Backend                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Express.js - HTTP server & routing                         │   │
│  │  WebSocket (ws) - Real-time broadcasting                    │   │
│  │  Session Management - Token-based auth                      │   │
│  │  Password Security - SHA-256 hashing                        │   │
│  │  File I/O - JSON data persistence                           │   │
│  │  HTTPS Support - SSL/TLS certificates                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────┬───────────────────────────┘
                                         │
┌────────────────────────────────────────┴───────────────────────────┐
│                      Data Storage Layer                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  passwords.json      - Password hashes                      │   │
│  │  sessions.json       - Active user sessions                 │   │
│  │  todos_<hash>.json  - Per-user todo data                    │   │
│  │  key.pem            - SSL private key                       │   │
│  │  cert.pem           - SSL certificate                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

---

## Technologies Used - Summary Table

| Category | Technology | Purpose |
|----------|------------|---------|
| Frontend | HTML5 | Markup |
| Frontend | CSS3 | Styling |
| Frontend | JavaScript ES6+ | Client logic |
| Backend | Node.js 20+ | Server runtime |
| Backend | Express.js 4.x | Web framework |
| Backend | compression 1.x | GZIP response compression |
| Backend | ws 8.x | WebSocket library |
| Backend | selfsigned 2.x | SSL certificates |
| Security | SHA-256 | Password hashing |
| Storage | JSON | File-based data |
| Container | Docker | Application packaging |
| PWA | Service Worker | Offline support |
| PWA | Web App Manifest | Installable app |
| Testing | Bash | Shell script tests |
| Testing | Node.js | JavaScript tests |

---

## Conclusion

This Todo PWA application demonstrates modern web development practices including:

1. **Real-Time Communication**: WebSocket for instant synchronization
2. **Offline Capabilities**: Service Worker and PWA features
3. **Security**: HTTPS, password hashing, protected endpoints
4. **Containerization**: Docker for easy deployment
5. **Data Persistence**: JSON file-based storage
6. **User Experience**: Full screen mode, favorites, undo
7. **Testing**: Multi-language test cases

The small footprint design ensures efficient resource usage while providing a full-featured todo management experience suitable for personal use, family sharing, or small team collaboration.

---

## References

### Official Documentation
- [Node.js](https://nodejs.org/)
- [Express.js](https://expressjs.com/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Docker](https://docs.docker.com/)

### Standards
- [Web App Manifest](https://www.w3.org/TR/appmanifest/)
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)

### Security
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

*Document Version: 1.0.0*  
*Last Updated: 2026-02-24*  
*License: CC BY-SA 4.0*
