# ✅ Todo PWA

> A lightweight, real-time Progressive Web App for managing your tasks — accessible from any device, anywhere.

---

## ✨ Features

- 📋 **Create, complete & delete** tasks instantly
- 🔄 **Real-time sync** across all connected clients via WebSocket
- ↩️ **Undo** — restore accidentally deleted tasks (10-second window)
- 👁️ **Show/hide completed** tasks from the menu
- 💾 **Save & Load DB** — export/import your todos as JSON
- 🔐 **Password-protected** — simple token-based authentication
- 📱 **PWA** — installable on mobile, works offline (service worker)
- 🌐 **Multilingual** — Unicode support (Chinese, Arabic, Hebrew, Japanese, Hindi, Urdu…)
- 🌙 **Fullscreen mode** on mobile devices
- 🍔 **Hamburger menu** with all controls in one place

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | [Node.js](https://nodejs.org) + [Express.js](https://expressjs.com) |
| Real-time | [ws](https://github.com/websockets/ws) (WebSocket) |
| Frontend | Vanilla JavaScript, CSS |
| Storage | JSON file (`backend/data/todos.json`) |
| PWA | Service Worker + Web App Manifest |

---

## 🚀 Getting Started

### Local Development

```bash
npm install
npm start
```

Open [http://localhost:3004](http://localhost:3004) in your browser.

Default password: `todopwa2026`

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

**With custom password:**
```bash
docker run -p 3004:3004 -e PASSWORD=mysecret todo-pwa:latest
```

**Check if running:**
```bash
docker ps | grep :3004
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3004` | Server port |
| `PASSWORD` | `todopwa2026` | Login password |
| `SESSION_SECRET` | *(random)* | JWT session secret |

---

## 📁 Project Structure

```
todo-pwa/
├── backend/
│   ├── server.js          # Express + WebSocket server
│   └── data/
│       └── todos.json     # Persistent todo storage
├── public/
│   ├── index.html         # App shell
│   ├── app.js             # Frontend logic
│   ├── style.css          # Styles
│   ├── favicon.svg        # ✅ Favicon
│   ├── manifest.webmanifest
│   └── service-worker.js  # Offline support
├── Dockerfile
└── package.json
```

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | ❌ | Login with password |
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
 docker push gthrepwood/todo-pwa:latest
 ```

## 📄 License

[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) © 2026 Todo PWA
