const express = require('express');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

// Load version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const APP_VERSION = packageJson.version || '1.0.0';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false
}));

// Enable GZIP compression for smaller responses
// Enhanced compression for JS and CSS files
app.use(compression({
  level: 6, // Compression level 0-9, 6 is good balance
  threshold: 512, // Compress responses larger than 512 bytes
  filter: (req, res) => {
    // Don't compress if client doesn't support gzip
    if (req.headers['accept-encoding'] === undefined) {
      return false;
    }
    // Don't compress if the response has its own encoding
    if (res.getHeader('Content-Encoding')) {
      return false;
    }
    // Use default filter for other responses (compresses HTML, JS, CSS, JSON)
    return compression.filter(req, res);
  }
}));

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

// OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || `${BASE_URL}/api/auth/oauth/callback`;

// OAuth state storage for CSRF protection
const oauthStateStore = new Map(); // state -> { provider, createdAt }
const OAUTH_STATE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Generate OAuth state with CSRF protection.
 * @param {string} provider - The OAuth provider name.
 * @returns {string} The generated state.
 */
function generateOAuthState(provider) {
  const state = crypto.randomBytes(32).toString('hex');
  oauthStateStore.set(state, { provider, createdAt: Date.now() });
  // Clean up old states periodically
  if (oauthStateStore.size > 100) {
    const now = Date.now();
    for (const [key, value] of oauthStateStore) {
      if (now - value.createdAt > OAUTH_STATE_TTL) {
        oauthStateStore.delete(key);
      }
    }
  }
  return state;
}

/**
 * Validate OAuth state.
 * @param {string} state - The state to validate.
 * @returns {string|null} The provider name if valid, otherwise null.
 */
function validateOAuthState(state) {
  const stateData = oauthStateStore.get(state);
  if (!stateData) return null;
  if (Date.now() - stateData.createdAt > OAUTH_STATE_TTL) {
    oauthStateStore.delete(state);
    return null;
  }
  oauthStateStore.delete(state);
  return stateData.provider;
}

/**
 * Get Google OAuth authorization URL.
 * @returns {string} The Google OAuth URL.
 */
function getGoogleAuthUrl() {
  const scopes = ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];
  const state = generateOAuthState('google');
  return `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes.join(' '))}` +
    `&access_type=offline` +
    `&state=${state}`;
}

/**
 * Get Microsoft OAuth authorization URL.
 * @returns {string} The Microsoft OAuth URL.
 */
function getMicrosoftAuthUrl() {
  const scopes = ['User.Read'];
  const state = generateOAuthState('microsoft');
  return `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${MICROSOFT_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes.join(' '))}` +
    `&state=${state}`;
}

/**
 * Exchange Google authorization code for tokens.
 * @param {string} code - The authorization code.
 * @returns {Promise<object>} The tokens.
 */
async function exchangeGoogleCode(code) {
  const response = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: OAUTH_REDIRECT_URI
  });
  return response.data;
}

/**
 * Exchange Microsoft authorization code for tokens.
 * @param {string} code - The authorization code.
 * @returns {Promise<object>} The tokens.
 */
async function exchangeMicrosoftCode(code) {
  const response = await axios.post(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: 'User.Read'
  });
  return response.data;
}

/**
 * Get user info from Google.
 * @param {string} accessToken - The access token.
 * @returns {Promise<object>} The user info.
 */
async function getGoogleUserInfo(accessToken) {
  const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.data;
}

/**
 * Get user info from Microsoft.
 * @param {string} accessToken - The access token.
 * @returns {Promise<object>} The user info.
 */
async function getMicrosoftUserInfo(accessToken) {
  const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.data;
}

/**
 * Generate a unique ID for an OAuth user.
 * @param {string} provider - The OAuth provider.
 * @param {string} providerId - The user's ID from the provider.
 * @returns {string} The unique user ID.
 */
function getOAuthUserId(provider, providerId) {
  return `${provider}:${providerId}`;
}

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const PASSWORDS_FILE = path.join(DATA_DIR, 'passwords.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple in-memory session store with file persistence
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

/**
 * Load sessions from file.
 * @returns {Map<string, object>} The sessions.
 */
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

/**
 * Save sessions to file.
 */
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
  // Flush all pending async writes
  pendingWrites.forEach((timeoutId, passwordHash) => {
    clearTimeout(timeoutId);
    const cached = writeCache.get(passwordHash);
    if (cached) {
      saveTodosSync(cached.todos, passwordHash, cached.sortMode);
    }
  });
  saveSessions();
  process.exit();
});

// --- Password management functions ---

/**
 * Load passwords from file.
 * @returns {object} The passwords.
 */
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

/**
 * Clean up orphaned data on startup.
 */
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

/**
 * Save passwords to file.
 * @param {object} passwords - The passwords to save.
 */
function savePasswords(passwords) {
  try {
    fs.writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing passwords.json:', err);
  }
}

// Password hashing with bcrypt
const BCRYPT_ROUNDS = 12;

/**
 * Hash a password with bcrypt.
 * @param {string} password - The password to hash.
 * @returns {Promise<string>} The hashed password.
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash.
 * @param {string} password - The password to verify.
 * @param {string} hash - The hash to verify against.
 * @returns {Promise<boolean>} Whether the password is valid.
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Legacy hash function for backward compatibility (used for file paths).
 * @param {string} password - The password to hash.
 * @returns {string} The hashed password.
 */
function getDataHash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Check if a password is new.
 * @param {string} password - The password to check.
 * @returns {boolean} Whether the password is new.
 */
function isNewPassword(password) {
  const passwords = loadPasswords();
  // Check if any stored hash matches
  for (const [storedHash, data] of Object.entries(passwords)) {
    if (data.bcryptHash) {
      // New bcrypt format
      return false; // Not new if we find any bcrypt hash
    }
  }
  return Object.keys(passwords).length === 0;
}

/**
 * Register a new password.
 * @param {string} password - The password to register.
 * @returns {Promise<string>} The data hash of the password.
 */
async function registerPassword(password) {
  const passwords = loadPasswords();
  const dataHash = getDataHash(password);
  
  // Check if already registered
  if (passwords[dataHash]) {
    return dataHash;
  }
  
  // Create bcrypt hash
  const bcryptHash = await hashPassword(password);
  
  passwords[dataHash] = {
    createdAt: Date.now(),
    bcryptHash: bcryptHash
  };
  savePasswords(passwords);
  
  // Create empty todo file for this password
  const todoFile = getTodoFilePath(dataHash);
  if (!fs.existsSync(todoFile)) {
    fs.writeFileSync(todoFile, JSON.stringify([], null, 2), 'utf8');
  }
  return dataHash;
}

/**
 * Verify a password and register it if new.
 * @param {string} password - The password to verify.
 * @returns {Promise<{hash: string, isNew: boolean}>} The data hash and whether the password was new.
 */
async function verifyAndRegisterPassword(password) {
  const passwords = loadPasswords();
  const dataHash = getDataHash(password);
  
  if (passwords[dataHash]) {
    // User exists - verify password
    if (passwords[dataHash].bcryptHash) {
      const valid = await verifyPassword(password, passwords[dataHash].bcryptHash);
      if (!valid) {
        throw new Error('Invalid password');
      }
    }
    return { hash: dataHash, isNew: false };
  }
  
  // New user - create bcrypt hash
  const bcryptHash = await hashPassword(password);
  passwords[dataHash] = {
    createdAt: Date.now(),
    bcryptHash: bcryptHash
  };
  savePasswords(passwords);
  
  // Create empty todo file
  const todoFile = getTodoFilePath(dataHash);
  if (!fs.existsSync(todoFile)) {
    fs.writeFileSync(todoFile, JSON.stringify([], null, 2), 'utf8');
  }
  
  return { hash: dataHash, isNew: true };
}

/**
 * Register an OAuth user.
 * @param {string} passwordHash - The data hash of the user.
 * @param {string} provider - The OAuth provider.
 * @param {object} userInfo - The user's info from the provider.
 */
function registerOAuthUser(passwordHash, provider, userInfo) {
  const passwords = loadPasswords();
  
  // Store OAuth user with their data hash (not bcrypt for OAuth IDs)
  passwords[passwordHash] = {
    createdAt: Date.now(),
    oauthProvider: provider,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture
  };
  savePasswords(passwords);
  
  // Create empty todo file for this OAuth user
  const todoFile = getTodoFilePath(passwordHash);
  if (!fs.existsSync(todoFile)) {
    fs.writeFileSync(todoFile, JSON.stringify([], null, 2), 'utf8');
  }
}

// --- Todo database path function ---

/**
 * Get the file path for a user's todos.
 * @param {string} passwordHash - The user's data hash.
 * @returns {string} The file path.
 */
function getTodoFilePath(passwordHash) {
  return path.join(DATA_DIR, `todos_${passwordHash}.json`);
}

// --- Helper functions for file handling (per-password) ---

// Debounce cache for pending writes (per password hash)
// Configurable debounce time (default 100ms for faster response, can be increased via env)
const DB_WRITE_DEBOUNCE_MS = parseInt(process.env.DB_WRITE_DEBOUNCE_MS) || 100;
const writeCache = new Map();
const pendingWrites = new Map(); // passwordHash -> setTimeout ID

/**
 * Load todos for a user.
 * @param {string} passwordHash - The user's data hash.
 * @returns {{todos: Array, sortMode: string}} The user's todos and sort mode.
 */
function loadTodos(passwordHash) {
  // First check cache for latest data
  const cached = writeCache.get(passwordHash);
  if (cached) {
    return cached;
  }
  
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

/**
 * Asynchronously save todos for a user with debouncing.
 * @param {string} passwordHash - The user's data hash.
 * @param {Array} todos - The user's todos.
 * @param {string} [sortMode='default'] - The user's sort mode.
 */
function saveTodosAsync(passwordHash, todos, sortMode = 'default') {
  // Update cache immediately for reads
  const data = { todos, sortMode };
  writeCache.set(passwordHash, data);
  
  // Clear existing pending write
  if (pendingWrites.has(passwordHash)) {
    clearTimeout(pendingWrites.get(passwordHash));
  }
  
  // Schedule async write with debounce
  const timeoutId = setTimeout(() => {
    const todoFile = getTodoFilePath(passwordHash);
    const cached = writeCache.get(passwordHash);
    const dataToWrite = JSON.stringify({ todos: cached?.todos || todos, sortMode: cached?.sortMode || sortMode }, null, 2);
    
    fs.writeFile(todoFile, dataToWrite, 'utf8', (err) => {
      if (err) {
        console.error('Error writing todos file:', err);
      } else {
        console.log(`[DB] Async write completed for ${passwordHash.substring(0, 8)}...`);
      }
    });
    
    pendingWrites.delete(passwordHash);
  }, DB_WRITE_DEBOUNCE_MS);
  
  pendingWrites.set(passwordHash, timeoutId);
}

/**
 * Synchronously save todos for a user.
 * @param {Array} todos - The user's todos.
 * @param {string} passwordHash - The user's data hash.
 * @param {string} [sortMode='default'] - The user's sort mode.
 */
function saveTodosSync(todos, passwordHash, sortMode = 'default') {
  const todoFile = getTodoFilePath(passwordHash);
  try {
    fs.writeFileSync(todoFile, JSON.stringify({ todos, sortMode }, null, 2), 'utf8');
    // Clear from cache after sync write
    writeCache.delete(passwordHash);
  } catch (err) {
    console.error('Error writing todos file:', err);
  }
}

/**
 * Save todos for a user (backward compatibility).
 * @param {Array} todos - The user's todos.
 * @param {string} passwordHash - The user's data hash.
 * @param {string} [sortMode='default'] - The user's sort mode.
 */
function saveTodos(todos, passwordHash, sortMode = 'default') {
  return saveTodosAsync(passwordHash, todos, sortMode);
}

// --- Helper to get todos for a session ---

/**
 * Get todos for a session.
 * @param {object} session - The session object.
 * @returns {{todos: Array, sortMode: string}} The user's todos and sort mode.
 */
function getSessionTodos(session) {
  if (!session || !session.passwordHash) {
    return { todos: [], sortMode: 'default' };
  }
  return loadTodos(session.passwordHash);
}

/**
 * Save todos for a session.
 * @param {Array} todos - The user's todos.
 * @param {object} session - The session object.
 * @param {string} sortMode - The user's sort mode.
 */
function saveSessionTodos(todos, session, sortMode) {
  if (!session || !session.passwordHash) {
    return;
  }
  saveTodos(todos, session.passwordHash, sortMode);
}

// --- Broadcast function for WebSocket ---

/**
 * Broadcast data to all WebSocket clients.
 * @param {object} data - The data to broadcast.
 * @param {string|null} [passwordHash=null] - The password hash to broadcast to (not used).
 */
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
  const defaultHash = getDataHash('ROZSA');
  registerPassword('ROZSA');
  const existingTodos = loadTodos('');
  if (existingTodos.length > 0) {
    saveTodos(existingTodos, defaultHash);
  }
}

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- Authentication Middleware ---
const SESSION_MAX_AGE = (process.env.SESSION_MAX_AGE_HOURS || 60) * 60 * 1000; // Default: 60 min

/**
 * Middleware to require authentication.
 * @param {import('express').Request} req - The request object.
 * @param {import('express').Response} res - The response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 */
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
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with a password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Authentication failed
 */
app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  try {
    // Verify password and register if new (async with bcrypt)
    const { hash: passwordHash, isNew } = await verifyAndRegisterPassword(password);
    
    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { 
      createdAt: Date.now(),
      passwordHash: passwordHash
    });
    saveSessions();
    
    // Set HTTP-only cookie for token
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: !isHttps,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE
    });
    
    res.json({ 
      token, // Kept for backward compatibility, but cookie is preferred
      isNewPassword: isNew,
      message: isNew ? 'New password registered with personal todo database' : 'Login successful'
    });
  } catch (err) {
    res.status(401).json({ error: err.message || 'Authentication failed' });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout
 *     responses:
 *       200:
 *         description: Logged out
 */
app.post('/api/auth/logout', (req, res) => {
  // Try to get token from cookie first, then from header
  const token = req.cookies?.authToken || req.headers.authorization?.split(' ')[1];
  if (token) {
    sessions.delete(token);
    saveSessions();
    // Clear cookie
    res.clearCookie('authToken');
  }
  res.json({ message: 'Logged out' });
});

/**
 * @swagger
 * /api/auth/check:
 *   get:
 *     summary: Check authentication status
 *     responses:
 *       200:
 *         description: Authentication status
 */
app.get('/api/auth/check', (req, res) => {
  const token = req.cookies?.authToken || req.headers.authorization?.split(' ')[1];
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    res.json({ authenticated: true, isNewPassword: false });
  } else {
    res.json({ authenticated: false });
  }
});

// --- OAuth Endpoints ---

/**
 * @swagger
 * /api/auth/oauth/providers:
 *   get:
 *     summary: Get available OAuth providers
 *     responses:
 *       200:
 *         description: OAuth providers
 */
app.get('/api/auth/oauth/providers', (req, res) => {
  res.json({
    google: !!GOOGLE_CLIENT_ID,
    microsoft: !!MICROSOFT_CLIENT_ID
  });
});

/**
 * @swagger
 * /api/auth/oauth/google:
 *   get:
 *     summary: Initiate Google OAuth
 *     responses:
 *       200:
 *         description: Google OAuth URL
 */
app.get('/api/auth/oauth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(501).json({ error: 'Google OAuth not configured' });
  }
  res.json({ authUrl: getGoogleAuthUrl() });
});

/**
 * @swagger
 * /api/auth/oauth/microsoft:
 *   get:
 *     summary: Initiate Microsoft OAuth
 *     responses:
 *       200:
 *         description: Microsoft OAuth URL
 */
app.get('/api/auth/oauth/microsoft', (req, res) => {
  if (!MICROSOFT_CLIENT_ID) {
    return res.status(501).json({ error: 'Microsoft OAuth not configured' });
  }
  res.json({ authUrl: getMicrosoftAuthUrl() });
});

/**
 * @swagger
 * /api/auth/oauth/callback:
 *   get:
 *     summary: OAuth callback
 *     responses:
 *       302:
 *         description: Redirect to app
 */
app.get('/api/auth/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || !state) {
    return res.redirect('/?error=oauth_failed');
  }
  
  // Validate state for CSRF protection
  const provider = validateOAuthState(state);
  if (!provider) {
    console.error('OAuth state validation failed - invalid or expired state');
    return res.redirect('/?error=oauth_invalid_state');
  }
  
  try {
    let userInfo, accessToken;
    
    if (provider === 'google') {
      const tokens = await exchangeGoogleCode(code);
      accessToken = tokens.access_token;
      userInfo = await getGoogleUserInfo(accessToken);
    } else if (provider === 'microsoft') {
      const tokens = await exchangeMicrosoftCode(code);
      accessToken = tokens.access_token;
      userInfo = await getMicrosoftUserInfo(accessToken);
    } else {
      return res.redirect('/?error=invalid_provider');
    }
    
    // Log OAuth user info
    console.log(`\n🔐 OAuth ${provider} login successful!`);
    console.log('📋 User info received:', JSON.stringify(userInfo, null, 2));
    
    // Create or get OAuth user
    const oauthId = getOAuthUserId(provider, userInfo.id || userInfo.email);
    const passwordHash = getDataHash(oauthId);
    
    // Check if new user
    const passwords = loadPasswords();
    const isNew = !passwords[passwordHash];
    
    // Register OAuth user
    if (isNew) {
      registerOAuthUser(passwordHash, provider, userInfo);
    }
    
    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      createdAt: Date.now(),
      passwordHash: passwordHash,
      oauthProvider: provider,
      email: userInfo.email
    });
    saveSessions();
    
    // Set token as HTTP-only cookie for security (instead of URL)
    res.cookie('oauth_token', token, {
      httpOnly: true,
      secure: !isHttps, // secure in production (HTTPS)
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE
    });
    
    // Redirect to app without token in URL
    res.redirect(`/?oauth_complete=true&oauth_new=${isNew}&provider=${provider}`);
    
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect('/?error=oauth_failed');
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
  broadcast(todos, req.session.passwordHash);

  res.status(201).json(todo);
});

app.put('/api/todos', requireAuth, (req, res) => {
  const newTodos = req.body;
  if (!Array.isArray(newTodos)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  const data = getSessionTodos(req.session);
  saveSessionTodos(newTodos, req.session, data.sortMode);
  broadcast(newTodos, req.session.passwordHash);

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
  broadcast(todos, req.session.passwordHash);
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
  broadcast(todos, req.session.passwordHash);

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

/**
 * Associates a WebSocket connection with a password hash using a session token.
 * @param {WebSocket} ws - The WebSocket client.
 * @param {string} token - The session token.
 */
function authenticateWebSocket(ws, token) {
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    const sessionAge = Date.now() - session.createdAt;

    if (sessionAge <= SESSION_MAX_AGE) {
      ws.passwordHash = session.passwordHash;
      console.log(`[WS] Authenticated connection for hash ${ws.passwordHash.substring(0, 8)}...`);
    } else {
      delete ws.passwordHash; // Session expired
    }
  } else {
    delete ws.passwordHash; // Invalid token
  }
}

// --- WebSocket Connection Handling ---
wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const connectTime = new Date().toISOString();

  console.log(`[WS] Client connected | IP: ${clientIp} | UA: ${userAgent} | Time: ${connectTime} | Total clients: ${wss.clients.size}`);

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      // Client sends auth token to associate the connection with a session
      if (data.type === 'auth' && data.token) {
        authenticateWebSocket(ws, data.token);
      }
    } catch (e) {
      console.warn('[WS] Received invalid message:', message);
    }
  });

  ws.on('close', () => {
    const disconnectTime = new Date().toISOString();
    console.log(`[WS] Client disconnected | IP: ${clientIp} | UA: ${userAgent} | Time: ${disconnectTime} | Remaining clients: ${wss.clients.size}`);
  });
});

/**
 * Broadcast data to clients associated with a specific passwordHash.
 * @param {object} data - The data to broadcast.
 * @param {string} passwordHash - The password hash to broadcast to.
 */
function broadcast(data, passwordHash) {
  if (!passwordHash) {
    console.warn('[WS] Broadcast called without a passwordHash. Not broadcasting.');
    return;
  }
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.passwordHash === passwordHash && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

const PROTOCOL = isHttps ? 'https' : 'http';

// Run cleanup on startup
cleanupData();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on ${PROTOCOL}://0.0.0.0:${PORT}`);
  console.log(`Passwords stored in: ${PASSWORDS_FILE}`);
  console.log(`Todo databases stored in: ${DATA_DIR}/todos_<hash>.json`);
});
