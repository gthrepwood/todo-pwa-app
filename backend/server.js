const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3004;
const PASSWORD = process.env.PASSWORD || 'todopwa2026';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Simple in-memory session store
const sessions = new Map();

const DATA_FILE = path.join(__dirname, 'data', 'todos.json');

// --- Helper functions for file handling ---

function loadTodos() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading todos.json:', err);
    return [];
  }
}

function saveTodos(todos) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to todos.json:', err);
  }
}

// --- Broadcast function for WebSocket ---
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// --- Load initial data ---
let todos = loadTodos();
let nextId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Authentication Middleware ---
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.session = sessions.get(token);
  next();
}

// --- Auth Endpoints ---
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  res.json({ token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    sessions.delete(token);
  }
  res.json({ message: 'Logged out' });
});

// --- API Endpoints (protected) ---

app.get('/api/todos', requireAuth, (req, res) => {
  res.json(todos);
});

app.post('/api/todos', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  nextId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1;
  const todo = { id: nextId++, text: text.trim(), done: false };
  todos.push(todo);
  saveTodos(todos);
  broadcast(todos); // Broadcast updated list

  res.status(201).json(todo);
});

app.put('/api/todos', requireAuth, (req, res) => {
  const newTodos = req.body;
  console.log('Received data for undo:', newTodos);
  if (!Array.isArray(newTodos)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  todos = newTodos;
  saveTodos(todos);
  broadcast(todos); // Broadcast the full updated list

  res.status(200).json({ message: 'Todos restored successfully' });
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { text, done } = req.body;

  const todo = todos.find(t => t.id === id);
  if (!todo) return res.status(404).json({ error: 'Not found' });

  if (typeof text === 'string') todo.text = text.trim();
  if (typeof done === 'boolean') todo.done = done;

  saveTodos(todos);
  broadcast(todos); // Broadcast updated list
  res.json(todo);
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  const removed = todos.splice(index, 1)[0];
  saveTodos(todos);
  broadcast(todos); // Broadcast updated list

  res.json(removed);
});

// --- WebSocket Connection Handling ---
wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const connectTime = new Date().toISOString();

  console.log(`[WS] Client connected | IP: ${clientIp} | UA: ${userAgent} | Time: ${connectTime} | Total clients: ${wss.clients.size}`);

  // Send the current list of todos to the newly connected client
  ws.send(JSON.stringify(todos));

  ws.on('close', () => {
    const disconnectTime = new Date().toISOString();
    console.log(`[WS] Client disconnected | IP: ${clientIp} | UA: ${userAgent} | Time: ${disconnectTime} | Remaining clients: ${wss.clients.size}`);
  });
});


server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

