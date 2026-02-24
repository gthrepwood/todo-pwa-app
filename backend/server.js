const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const crypto = require('crypto');

// Load version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const APP_VERSION = packageJson.version || '1.0.0';

const app = express();

// Enable GZIP compression for smaller responses
app.use(compression());

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

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const PASSWORDS_FILE = path.join(DATA_DIR, 'passwords.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple in-memory session store with file persistence
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
      return new Map(JSON.parse(raw));
    }
  } catch (err) {
    console.error('Error loading sessions:', err);
  }
  return new Map();
}

function saveSessions() {
  try {
    const sessionsArray = Array.from(sessions.entries());
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsArray, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving sessions:', err);
  }
}

const sessions = loadSessions();

// Save sessions on server shutdown
process.on('SIGINT', () => {
  saveSessions();
  process.exit();
});

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

// Clean up orphaned entries on startup
function cleanupData() {
  console.log('\n🧹 Running data cleanup...');
  
  // Load passwords
  const passwords = loadPasswords();
  const passwordHashes = Object.keys(passwords);
  
  // Load sessions as a Map
  const sessionsArray = loadSessions();
  const sessionsMap = new Map(sessionsArray);
  
  const validSessions = new Map();
  let sessionsKept = 0;
  let sessionsRemoved = 0;
  let sessionsExpired = 0;
  
  const now = Date.now();
  
  // Keep only sessions with valid password hashes and not expired
  sessionsMap.forEach((session, token) => {
    const sessionAge = now - session.createdAt;
    const isExpired = sessionAge > SESSION_MAX_AGE;
    
    if (isExpired) {
      sessionsExpired++;
      sessionsRemoved++;
    } else if (session.passwordHash && passwordHashes.includes(session.passwordHash)) {
      validSessions.set(token, session);
      sessionsKept++;
    } else {
      sessionsRemoved++;
    }
  });
  
  if (sessionsRemoved > 0) {
    // Save the cleaned sessions directly
    const sessionsArrayClean = Array.from(validSessions.entries());
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsArrayClean, null, 2), 'utf8');
    console.log(`  Removed ${sessionsExpired} expired sessions`);
    console.log(`  Removed ${sessionsRemoved - sessionsExpired} orphaned sessions`);
  }
  
  // Remove password entries without valid todo files
  let passwordsRemoved = 0;
  const validPasswords = {};
  
  passwordHashes.forEach(hash => {
    const todoFile = getTodoFilePath(hash);
    const archiveFile = path.join(DATA_DIR, 'archive', `todos_${hash}_*.json`);
    
    // Check if todo file exists (in data/ or archive/)
    const dataFileExists = fs.existsSync(todoFile);
    
    // Check for archived files
    const archiveDir = path.join(DATA_DIR, 'archive');
    let archivedFileExists = false;
    if (fs.existsSync(archiveDir)) {
      const archiveFiles = fs.readdirSync(archiveDir);
      archivedFileExists = archiveFiles.some(f => f.startsWith(`todos_${hash}_`));
    }
    
    if (dataFileExists || archivedFileExists) {
      validPasswords[hash] = passwords[hash];
    } else {
      passwordsRemoved++;
    }
  });
  
  if (passwordsRemoved > 0) {
    savePasswords(validPasswords);
    console.log(`  Removed ${passwordsRemoved} orphaned password entries`);
  }
  
  if (sessionsRemoved === 0 && passwordsRemoved === 0) {
    console.log('  No cleanup needed ✓');
  }
  console.log('');
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
      const data = JSON.parse(raw);
      // Support both old format (array) and new format (object)
      if (Array.isArray(data)) {
        return { todos: data, sortMode: 'default' };
      }
      return data;
    }
  } catch (err) {
    console.error('Error reading todos file:', err);
  }
  return { todos: [], sortMode: 'default' };
}

function saveTodos(todos, passwordHash, sortMode = 'default') {
  const todoFile = getTodoFilePath(passwordHash);
  try {
    fs.writeFileSync(todoFile, JSON.stringify({ todos, sortMode }, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing todos file:', err);
  }
}

// --- Helper to get todos for a session ---

function getSessionTodos(session) {
  if (!session || !session.passwordHash) {
    return { todos: [], sortMode: 'default' };
  }
  return loadTodos(session.passwordHash);
}

function saveSessionTodos(todos, session, sortMode) {
  if (!session || !session.passwordHash) {
    return;
  }
  saveTodos(todos, session.passwordHash, sortMode);
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
const SESSION_MAX_AGE = (process.env.SESSION_MAX_AGE_HOURS || 60) * 60 * 1000; // Default: 60 min

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const session = sessions.get(token);
  
  // Check if session is expired
  const sessionAge = Date.now() - session.createdAt;
  if (sessionAge > SESSION_MAX_AGE) {
    sessions.delete(token);
    saveSessions();
    return res.status(401).json({ error: 'Session expired' });
  }
  
  req.session = session;
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
  saveSessions();
  
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
    saveSessions();
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

app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION });
});

// --- API Endpoints (protected) ---

app.get('/api/todos', requireAuth, (req, res) => {
  const data = getSessionTodos(req.session);
  // Set headers to prevent caching and include sort mode
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('X-Sort-Mode', data.sortMode || 'default');
  res.json(data.todos);
});

app.post('/api/todos', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const data = getSessionTodos(req.session);
  let todos = data.todos;
  const sortMode = data.sortMode || 'default';
  const nextId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1;
  const todo = { 
    id: nextId, 
    text: text.trim(), 
    done: false, 
    favorite: false,
    createdAt: Date.now()
  };
  todos.push(todo);
  saveSessionTodos(todos, req.session, sortMode);
  broadcast(todos);

  res.status(201).json(todo);
});

app.put('/api/todos', requireAuth, (req, res) => {
  const newTodos = req.body;
  console.log('Received data for undo:', newTodos);
  if (!Array.isArray(newTodos)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  const data = getSessionTodos(req.session);
  saveSessionTodos(newTodos, req.session, data.sortMode);
  broadcast(newTodos);

  res.status(200).json({ message: 'Todos restored successfully' });
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { text, done, favorite } = req.body;

  const data = getSessionTodos(req.session);
  let todos = data.todos;
  const sortMode = data.sortMode || 'default';
  const todo = todos.find(t => t.id === id);
  if (!todo) return res.status(404).json({ error: 'Not found' });

  if (typeof text === 'string') todo.text = text.trim();
  if (typeof done === 'boolean') todo.done = done;
  if (typeof favorite === 'boolean') todo.favorite = favorite;

  saveSessionTodos(todos, req.session, sortMode);
  broadcast(todos);
  res.json(todo);
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const data = getSessionTodos(req.session);
  let todos = data.todos;
  const sortMode = data.sortMode || 'default';
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  const removed = todos.splice(index, 1)[0];
  saveSessionTodos(todos, req.session, sortMode);
  broadcast(todos);

  res.json(removed);
});

// --- Sort mode endpoint ---
app.put('/api/sort', requireAuth, (req, res) => {
  const { sortMode } = req.body;
  if (!sortMode || !['default', 'alpha'].includes(sortMode)) {
    return res.status(400).json({ error: 'Invalid sort mode' });
  }
  
  const data = getSessionTodos(req.session);
  saveSessionTodos(data.todos, req.session, sortMode);
  
  res.json({ sortMode });
});

// --- Archive endpoint ---
app.post('/api/archive', requireAuth, (req, res) => {
  if (!req.session || !req.session.passwordHash) {
    return res.status(400).json({ error: 'No session found' });
  }
  
  const passwordHash = req.session.passwordHash;
  const sourceFile = getTodoFilePath(passwordHash);
  
  // Create archive directory if it doesn't exist
  const archiveDir = path.join(DATA_DIR, 'archive');
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
  
  // Check if source file exists
  if (!fs.existsSync(sourceFile)) {
    return res.status(404).json({ error: 'No database found to archive' });
  }
  
  // Create archive filename with timestamp
  const timestamp = Date.now();
  const archiveFileName = `todos_${passwordHash}_${timestamp}.json`;
  const destFile = path.join(archiveDir, archiveFileName);
  
  try {
    // Move file to archive
    fs.renameSync(sourceFile, destFile);
    
    console.log(`[ARCHIVE] Database archived: ${archiveFileName}`);
    
    res.json({ 
      success: true, 
      message: 'Database archived successfully',
      archivedFile: archiveFileName
    });
  } catch (err) {
    console.error('Error archiving database:', err);
    res.status(500).json({ error: 'Failed to archive database' });
  }
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

  ws.on('close', () => {
    const disconnectTime = new Date().toISOString();
    console.log(`[WS] Client disconnected | IP: ${clientIp} | UA: ${userAgent} | Time: ${disconnectTime} | Remaining clients: ${wss.clients.size}`);
  });
});


const PROTOCOL = isHttps ? 'https' : 'http';

// Run cleanup on startup
cleanupData();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on ${PROTOCOL}://0.0.0.0:${PORT}`);
  console.log(`Passwords stored in: ${PASSWORDS_FILE}`);
  console.log(`Todo databases stored in: ${DATA_DIR}/todos_<hash>.json`);
});
