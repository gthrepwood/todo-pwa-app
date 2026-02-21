const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();

// SSL certificates
const SSL_DIR = path.join(__dirname, 'data');
const keyPath = path.join(SSL_DIR, 'key.pem');
const certPath = path.join(SSL_DIR, 'cert.pem');

const isHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);
let server;
if (isHttps) {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  server = https.createServer(httpsOptions, app);
  console.log('🔐 HTTPS enabled');
} else {
  server = http.createServer(app);
  console.log('⚠️ HTTPS not configured, using HTTP');
}

const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3004;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Simple in-memory session store
const sessions = new Map();

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const PASSWORDS_FILE = path.join(DATA_DIR, 'passwords.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Password management functions ---

function loadPasswords() {
  try {
    if (fs.existsSync(PASSWORDS_FILE)) {
      const raw = fs.readFileSync(PASSWORDS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading passwords.json:', err);
  }
  return {};
}

function savePasswords(passwords) {
  try {
    fs.writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing passwords.json:', err);
  }
}

function getPasswordHash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function isNewPassword(password) {
  const passwords = loadPasswords();
  const hash = getPasswordHash(password);
  return !passwords[hash];
}

function registerPassword(password) {
  const passwords = loadPasswords();
  const hash = getPasswordHash(password);
  
  if (!passwords[hash]) {
    passwords[hash] = {
      createdAt: Date.now()
    };
    savePasswords(passwords);
    
    // Create empty todo file for this password
    const todoFile = getTodoFilePath(hash);
    if (!fs.existsSync(todoFile)) {
      fs.writeFileSync(todoFile, JSON.stringify([], null, 2), 'utf8');
    }
  }
  return hash;
}

// --- Todo database path function ---

function getTodoFilePath(passwordHash) {
  return path.join(DATA_DIR, `todos_${passwordHash}.json`);
}

// --- Helper functions for file handling (per-password) ---

function loadTodos(passwordHash) {
  const todoFile = getTodoFilePath(passwordHash);
  try {
    if (fs.existsSync(todoFile)) {
      const raw = fs.readFileSync(todoFile, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading todos file:', err);
  }
  return [];
}

function saveTodos(todos, passwordHash) {
  const todoFile = getTodoFilePath(passwordHash);
  try {
    fs.writeFileSync(todoFile, JSON.stringify(todos, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing todos file:', err);
  }
}

// --- Helper to get todos for a session ---

function getSessionTodos(session) {
  if (!session || !session.passwordHash) {
    return [];
  }
  return loadTodos(session.passwordHash);
}

function saveSessionTodos(todos, session) {
  if (!session || !session.passwordHash) {
    return;
  }
  saveTodos(todos, session.passwordHash);
}

// --- Broadcast function for WebSocket ---

function broadcast(data, passwordHash = null) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// --- Load initial data (for backward compatibility) ---
// If no passwords file exists, create one with the default password
const passwords = loadPasswords();
if (Object.keys(passwords).length === 0 && fs.existsSync(path.join(DATA_DIR, 'todos.json'))) {
  // Migrate existing todos.json to password-based system
  const defaultHash = getPasswordHash('ROZSA');
  registerPassword('ROZSA');
  const existingTodos = loadTodos('');
  if (existingTodos.length > 0) {
    saveTodos(existingTodos, defaultHash);
  }
}

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
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  const passwordHash = getPasswordHash(password);
  
  // Check if this is a new password
  const isNew = isNewPassword(password);
  
  // Register the password (saves to file and creates todo database if new)
  registerPassword(password);
  
  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { 
    createdAt: Date.now(),
    passwordHash: passwordHash
  });
  
  res.json({ 
    token,
    isNewPassword: isNew,
    message: isNew ? 'New password registered with personal todo database' : 'Login successful'
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    sessions.delete(token);
  }
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/check', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    res.json({ authenticated: true, isNewPassword: false });
  } else {
    res.json({ authenticated: false });
  }
});

// --- API Endpoints (protected) ---

app.get('/api/todos', requireAuth, (req, res) => {
  const todos = getSessionTodos(req.session);
  res.json(todos);
});

app.post('/api/todos', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  let todos = getSessionTodos(req.session);
  const nextId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1;
  const todo = { id: nextId, text: text.trim(), done: false, favorite: false };
  todos.push(todo);
  saveSessionTodos(todos, req.session);
  broadcast(todos);

  res.status(201).json(todo);
});

app.put('/api/todos', requireAuth, (req, res) => {
  const newTodos = req.body;
  console.log('Received data for undo:', newTodos);
  if (!Array.isArray(newTodos)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  saveSessionTodos(newTodos, req.session);
  broadcast(newTodos);

  res.status(200).json({ message: 'Todos restored successfully' });
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { text, done, favorite } = req.body;

  let todos = getSessionTodos(req.session);
  const todo = todos.find(t => t.id === id);
  if (!todo) return res.status(404).json({ error: 'Not found' });

  if (typeof text === 'string') todo.text = text.trim();
  if (typeof done === 'boolean') todo.done = done;
  if (typeof favorite === 'boolean') todo.favorite = favorite;

  saveSessionTodos(todos, req.session);
  broadcast(todos);
  res.json(todo);
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  let todos = getSessionTodos(req.session);
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  const removed = todos.splice(index, 1)[0];
  saveSessionTodos(todos, req.session);
  broadcast(todos);

  res.json(removed);
});

// --- WebSocket Connection Handling ---
wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const connectTime = new Date().toISOString();

  console.log(`[WS] Client connected | IP: ${clientIp} | UA: ${userAgent} | Time: ${connectTime} | Total clients: ${wss.clients.size}`);

  // Send the current list of todos to the newly connected client
  // Note: WebSocket doesn't have session, so we send empty list initially
  // Client should authenticate via API first
  ws.send(JSON.stringify([]));

  ws.on('close', () => {
    const disconnectTime = new Date().toISOString();
    console.log(`[WS] Client disconnected | IP: ${clientIp} | UA: ${userAgent} | Time: ${disconnectTime} | Remaining clients: ${wss.clients.size}`);
  });
});


const PROTOCOL = isHttps ? 'https' : 'http';
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on ${PROTOCOL}://0.0.0.0:${PORT}`);
  console.log(`Passwords stored in: ${PASSWORDS_FILE}`);
  console.log(`Todo databases stored in: ${DATA_DIR}/todos_<hash>.json`);
});
