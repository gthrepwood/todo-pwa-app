# ✅ Todo PWA

> A lightweight, real-time Progressive Web App for managing your tasks — accessible from any device, anywhere.

*This project was created with the help of **Kilo Code** and **Gemini**.*

---

## ✨ Features

- 📋 **Create, complete & delete** tasks instantly
- ⭐ **Favorites** — mark tasks with ⭐, they jump to the top
- 🔄 **Real-time sync** across all connected clients via WebSocket
- ↩️ **Undo** — restore accidentally deleted tasks (10-second window)
- 👁️ **Show/hide completed** tasks from the menu (persists in localStorage)
- 🚮 **Delete toggle** — enable/disable delete button from menu
- 💾 **Save & Load DB** — export/import your todos as JSON
- 🔐 **Password-protected** — each password has its own todo database
- 📱 **PWA** — installable on mobile, works offline (service worker)
- 🌐 **Multilingual** — Unicode support (Chinese, Arabic, Hebrew, Japanese, Hindi, Urdu…)
- 🌙 **Fullscreen mode** on mobile devices
- 🍔 **Hamburger menu** with all controls in one place
- 🔢 **Auto-versioning** — version number increments with usage

---

## 🛠️ Tech Stack

| Layer     | Technology                                                          |
| --------- | ------------------------------------------------------------------- |
| Backend   | [Node.js](https://nodejs.org) + [Express.js](https://expressjs.com) |
| Real-time | [ws](https://github.com/websockets/ws) (WebSocket)                  |
| Frontend  | Vanilla JavaScript, CSS                                             |
| Storage   | JSON file (`backend/data/todos.json`)                               |
| PWA       | Service Worker + Web App Manifest                                   |

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

**API Documentation:**

```bash
# Swagger UI - Interactive API documentation
http://localhost:3004/api-docs
```

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

| Variable                | Default    | Description                               |
| ----------------------- | ---------- | ----------------------------------------- |
| `PORT`                  | `3004`     | Server port                               |
| `SESSION_MAX_AGE_HOURS` | `60`       | Session timeout in mins (default: 60 min) |
| `BASE_URL`              | *(auto)*   | Base URL for OAuth callback               |
| `GOOGLE_CLIENT_ID`      | *(none)*   | Google OAuth2 Client ID                   |
| `GOOGLE_CLIENT_SECRET`  | *(none)*   | Google OAuth2 Client Secret               |
| `MICROSOFT_CLIENT_ID`  | *(none)*   | Microsoft OAuth2 Client ID                |
| `MICROSOFT_CLIENT_SECRET` | *(none)* | Microsoft OAuth2 Client Secret            |
| `MICROSOFT_TENANT_ID`  | `common`   | Microsoft Tenant ID (common, organizations, or tenant ID) |

---

## 🔐 OAuth Setup

### Google OAuth2

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Go to **APIs & Services** → **OAuth consent screen**
4. Configure consent screen (External)
5. Add scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`
6. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
7. Set Application type to **Web**
8. Add authorized redirect URI: `https://your-domain.com/api/auth/oauth/callback`
9. Copy **Client ID** and **Client Secret** to your environment

### Microsoft OAuth2

1. Go to [Azure Portal](https://portal.azure.com/)
2. Go to **App registrations** → **New registration**
3. Set redirect URI: Web, `https://your-domain.com/api/auth/oauth/callback`
4. Go to **Certificates & secrets** → **New client secret**
5. Go to **API permissions** → **Microsoft Graph** → **Delegated permissions** → **User.Read**
6. Copy **Application (client) ID** and create/collect **Client Secret**

### Running with OAuth

```bash
# With both providers
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx \
MICROSOFT_CLIENT_ID=xxx MICROSOFT_CLIENT_SECRET=xxx \
BASE_URL=https://your-domain.com npm start
```

---

## 🔌 API Endpoints

### Authentication

| Method   | Endpoint                    | Auth | Description                    |
| -------- | -------------------------- | ---- | ------------------------------ |
| `POST`   | `/api/auth/login`           | ❌   | Login with passkey              |
| `POST`   | `/api/auth/logout`          | ✅   | Logout                          |
| `GET`    | `/api/auth/check`           | ❌   | Check authentication status      |
| `GET`    | `/api/auth/oauth/providers` | ❌   | Get OAuth providers info        |
| `GET`    | `/api/auth/oauth/google`    | ❌   | Initiate Google OAuth           |
| `GET`    | `/api/auth/oauth/microsoft` | ❌   | Initiate Microsoft OAuth        |
| `GET`    | `/api/auth/oauth/callback`   | ❌   | OAuth callback handler          |

### Todos

| Method   | Endpoint                  | Auth | Description                         |
| -------- | ------------------------ | ---- | ----------------------------------- |
| `GET`    | `/api/todos`             | ✅   | Get all todos                       |
| `POST`   | `/api/todos`             | ✅   | Create a new todo                   |
| `PUT`    | `/api/todos`             | ✅   | Restore all todos (undo)            |
| `PUT`    | `/api/todos/:id`        | ✅   | Update a specific todo              |
| `DELETE` | `/api/todos/:id`        | ✅   | Delete a specific todo              |
| `DELETE` | `/api/todos/clear-completed` | ✅   | Clear all completed todos           |

### Other

| Method   | Endpoint              | Auth | Description                         |
| -------- | --------------------- | ---- | ----------------------------------- |
| `GET`    | `/api/version`        | ❌   | Get app version                    |
| `GET`    | `/api/settings`       | ✅   | Get current settings                |
| `PUT`    | `/api/sort`          | ✅   | Update sort mode (default/alpha)   |
| `PUT`    | `/api/delete-enabled` | ✅   | Toggle delete button on/off        |
| `POST`   | `/api/archive`       | ✅   | Archive completed todos            |

---

## 🧪 Testing

Run all tests:

```bash
npm test
```

Run specific test:

```bash
node tests/test-delete-enabled.js
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
      - GOOGLE_CLIENT_ID=XXXXXX
      - GOOGLE_CLIENT_SECRET=XXXXXX
      - BASE_URL=https://XXXXXX
    ports:      
    ports:
      - 3004:3004
    restart: unless-stopped
```

## Kill running app

```
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3004).OwningProcess -Force
```

## 📄 License

[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) © 2026 Todo PWA
