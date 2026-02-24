# ✅ Todo PWA

> A lightweight, real-time Progressive Web App for managing your tasks — accessible from any device, anywhere.

---

## ✨ Features

- 📋 **Create, complete & delete** tasks instantly
- ⭐ **Favorites** — mark tasks with ⭐, they jump to the top
- 🔄 **Real-time sync** across all connected clients via WebSocket
- ↩️ **Undo** — restore accidentally deleted tasks (10-second window)
- 👁️ **Show/hide completed** tasks from the menu
- 💾 **Save & Load DB** — export/import your todos as JSON
- 🔐 **Password-protected** — each password has its own todo database
- 📱 **PWA** — installable on mobile, works offline (service worker)
- 🌐 **Multilingual** — Unicode support (Chinese, Arabic, Hebrew, Japanese, Hindi, Urdu…)
- 🌙 **Fullscreen mode** on mobile devices
- 🍔 **Hamburger menu** with all controls in one place
- 🔢 **Auto-versioning** — version number increments with usage

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | [Node.js](https://nodejs.org) + [Express.js](https://expressjs.com) |
| Real-time | [ws](https://github.com/websockets/ws) (WebSocket) |
| Frontend | Vanilla JavaScript, CSS |
| Storage | JSON file (`backend/data/todos.json`) |
| PWA | Service Worker + Web App Manifest |

For detailed technical documentation, see [technology.md](./technology.md).

---

## 🚀 Getting Started

### Local Development

```bash
npm install
npm start
```

The server automatically detects HTTPS certificates:

**HTTPS (with SSL certificates):**
```bash
# Generate self-signed certificates (for local development with HTTPS)
node backend/data/generate-certs.js

# Start server - will use https://
npm start
```

**HTTP (without certificates):**
```bash
# Just delete or rename the certificate files
# (or don't run generate-certs.js)

# Start server - will use http://
npm start
```

Open [https://localhost:3004](https://localhost:3004) (or [http://localhost:3004](http://localhost:3004) if no certs).

---

### 🐳 Docker

**Build the image:**
```bash
docker build -t todo-pwa:latest .
```

**Run the container:**
```bash
docker run -p 3004:3004 todo-pwa:latest
```

**Check if running:**
```bash
docker ps | grep :3004
```

---

## 🌐 Hosting

This app can be hosted on [Dynu.com](https://www.dynu.com/) because it supports sub-sites (path-based routing).

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3004` | Server port |
| `SESSION_SECRET` | *(random)* | JWT session secret |

---

## 📁 Project Structure

```
todo-pwa/
├── backend/
│   ├── server.js              # Express + WebSocket server
│   └── data/
│       ├── passwords.json     # Password storage (SHA256 hashes)
│       ├── todos_<hash>.json  # Per-password todo databases
│       ├── key.pem            # SSL private key (HTTPS)
│       ├── cert.pem           # SSL certificate (HTTPS)
│       └── generate-certs.js  # Certificate generator
├── public/
│   ├── index.html             # App shell
│   ├── app.js                # Frontend logic
│   ├── style.css             # Styles
│   ├── favicon.svg           # ✅ Favicon
│   ├── manifest.webmanifest
│   └── service-worker.js     # Offline support
├── Dockerfile
└── package.json
```

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | ❌ | Login with passkey |
| `POST` | `/api/auth/logout` | ✅ | Logout |
| `GET` | `/api/todos` | ✅ | Get all todos |
| `POST` | `/api/todos` | ✅ | Create a todo |
| `PUT` | `/api/todos/:id` | ✅ | Update a todo |
| `DELETE` | `/api/todos/:id` | ✅ | Delete a todo |
| `PUT` | `/api/todos` | ✅ | Restore all todos (undo) |

---

## 🧪 Testing

Run the undo functionality test:

```bash
node test-undo.js
```

This tests Unicode support across multiple scripts: Chinese, Urdu, Japanese, Hindi, Hebrew, Arabic, and more.

---

## Push (internal)

```bash
docker build -t todo-pwa:latest .
docker tag todo-pwa:latest gthrepwood/todo-pwa:latest
docker push gthrepwood/todo-pwa:latest
 ```

 ## Add to **unraid**

```bash
docker run \
 -d \
 --name='todo' \
 --net='host' \
 --pids-limit 2048 \
 -e TZ="Europe/Budapest" \
 -e HOST_OS="Unraid" \
 -e HOST_HOSTNAME="Lugu" \
 -e HOST_CONTAINERNAME="todo" \
 -l net.unraid.docker.managed=dockerman 'gthrepwood/todo-pwa' 
```
### Compose file

```yaml
---
services:
  todo-pwa:
    image: docker.io/gthrepwood/todo-pwa:latest
    container_name: todo-pwa
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
    ports:
      - 3004:3004
    restart: unless-stopped
```
## kill running app

`Stop-Process -Id (Get-NetTCPConnection -LocalPort 3004).OwningProcess -Force


## 📄 License

[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) © 2026 Todo PWA

