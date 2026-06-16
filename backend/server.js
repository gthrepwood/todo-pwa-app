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
const TOPICS_FILE = path.join(DATA_DIR, 'topics.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Default app settings ---
const DEFAULT_SETTINGS = {
  deleteEnabled: true,
  sortMode: 'default'
};

/**
 * Load app settings from file.
 * @returns {object} The settings object.
 */
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('Error reading settings file:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save app settings to file.
 * @param {object} settings - The settings to save.
 */
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing settings file:', err);
  }
}

// Load app settings at startup
const appSettings = loadSettings();

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
  pendingWrites.forEach((timeoutId, topicHash) => {
    clearTimeout(timeoutId);
    const cached = writeCache.get(topicHash);
    if (cached) {
      saveTodosSync(cached.todos, topicHash, cached.sortMode, cached.deleteEnabled);
    }
  });
  saveSessions();
  process.exit();
});

// --- Topic management functions ---

/**
 * Load topics from file.
 * @returns {object} The topics.
 */
function loadTopics() {
  try {
    if (fs.existsSync(TOPICS_FILE)) {
      const raw = fs.readFileSync(TOPICS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading topics.json:', err);
  }
  return {};
}

/**
 * Clean up orphaned data on startup.
 */
function cleanupData() {
  console.log('\n🧹 Running data cleanup...');
  
  // Load topics
  const topics = loadTopics();
  const topicHashes = Object.keys(topics);
  
  // Load sessions as a Map
  const sessionsArray = loadSessions();
  const sessionsMap = new Map(sessionsArray);
  
  const validSessions = new Map();
  let sessionsKept = 0;
  let sessionsRemoved = 0;
  let sessionsExpired = 0;
  
  const now = Date.now();
  
  // Keep only sessions with valid topic hashes and not expired
  sessionsMap.forEach((session, token) => {
    const sessionAge = now - session.createdAt;
    const isExpired = sessionAge > SESSION_MAX_AGE;
    
    if (isExpired) {
      sessionsExpired++;
      sessionsRemoved++;
    } else if (session.topicHash && topicHashes.includes(session.topicHash)) {
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
  
  // Remove topic entries without valid todo files
  let topicsRemoved = 0;
  const validTopics = {};
  
  topicHashes.forEach(hash => {
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
      validTopics[hash] = topics[hash];
    } else {
      topicsRemoved++;
    }
  });
  
  if (topicsRemoved > 0) {
    saveTopics(validTopics);
    console.log(`  Removed ${topicsRemoved} orphaned topic entries`);
  }
  
  if (sessionsRemoved === 0 && topicsRemoved === 0) {
    console.log('  No cleanup needed ✓');
  }
  console.log('');
}

/**
 * Save topics to file.
 * @param {object} topics - The topics to save.
 */
function saveTopics(topics) {
  try {
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing topics.json:', err);
  }
}

// Topic hashing with bcrypt
const BCRYPT_ROUNDS = 12;

/**
 * Hash a topic with bcrypt.
 * @param {string} topic - The topic to hash.
 * @returns {Promise<string>} The hashed topic.
 */
async function hashTopic(topic) {
  return await bcrypt.hash(topic, BCRYPT_ROUNDS);
}

/**
 * Verify a topic against a bcrypt hash.
 * @param {string} topic - The topic to verify.
 * @param {string} hash - The hash to verify against.
 * @returns {Promise<boolean>} Whether the topic is valid.
 */
async function verifyTopic(topic, hash) {
  return await bcrypt.compare(topic, hash);
}

/**
 * Legacy hash function for backward compatibility (used for file paths).
 * @param {string} topic - The topic to hash.
 * @returns {string} The hashed topic.
 */
function getDataHash(topic) {
  return crypto.createHash('sha256').update(topic).digest('hex');
}

/**
 * Check if a topic is new.
 * @param {string} topic - The topic to check.
 * @returns {boolean} Whether the topic is new.
 */
function isNewTopic(topic) {
  const topics = loadTopics();
  // Check if any stored hash matches
  for (const [storedHash, data] of Object.entries(topics)) {
    if (data.bcryptHash) {
      // New bcrypt format
      return false; // Not new if we find any bcrypt hash
    }
  }
  return Object.keys(topics).length === 0;
}

/**
 * Register a new topic.
 * @param {string} topic - The topic to register.
 * @returns {Promise<string>} The data hash of the topic.
 */
async function registerTopic(topic) {
  const topics = loadTopics();
  const dataHash = getDataHash(topic);
  
  // Check if already registered
  if (topics[dataHash]) {
    return dataHash;
  }
  
  // Create bcrypt hash
  const bcryptHash = await hashTopic(topic);
  
  topics[dataHash] = {
    createdAt: Date.now(),
    bcryptHash: bcryptHash
  };
  saveTopics(topics);
  
  // Create empty todo file for this topic
  const todoFile = getTodoFilePath(dataHash);
  if (!fs.existsSync(todoFile)) {
    fs.writeFileSync(todoFile, JSON.stringify([], null, 2), 'utf8');
  }
  return dataHash;
}

/**
 * Verify a topic and register it if new.
 * @param {string} topic - The topic to verify.
 * @returns {Promise<{hash: string, isNew: boolean}>} The data hash and whether the topic was new.
 */
async function verifyAndRegisterTopic(topic) {
  const topics = loadTopics();
  const dataHash = getDataHash(topic);
  
  if (topics[dataHash]) {
    // User exists - verify topic
    if (topics[dataHash].bcryptHash) {
      const valid = await verifyTopic(topic, topics[dataHash].bcryptHash);
      if (!valid) {
        throw new Error('Invalid topic');
      }
    }
    return { hash: dataHash, isNew: false };
  }
  
  // New user - create bcrypt hash
  const bcryptHash = await hashTopic(topic);
  topics[dataHash] = {
    createdAt: Date.now(),
    bcryptHash: bcryptHash
  };
  saveTopics(topics);
  
  // Create empty todo file
  const todoFile = getTodoFilePath(dataHash);
  if (!fs.existsSync(todoFile)) {
    fs.writeFileSync(todoFile, JSON.stringify([], null, 2), 'utf8');
  }
  
  return { hash: dataHash, isNew: true };
}

/**
 * Register an OAuth user.
 * @param {string} topicHash - The data hash of the user.
 * @param {string} provider - The OAuth provider.
 * @param {object} userInfo - The user's info from the provider.
 */
function registerOAuthUser(topicHash, provider, userInfo) {
  const topics = loadTopics();
  
  // Store OAuth user with their data hash (not bcrypt for OAuth IDs)
  topics[topicHash] = {
    createdAt: Date.now(),
    oauthProvider: provider,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture
  };
  saveTopics(topics);
  
  // Create empty todo file for this OAuth user
  const todoFile = getTodoFilePath(topicHash);
  if (!fs.existsSync(todoFile)) {
    fs.writeFileSync(todoFile, JSON.stringify([], null, 2), 'utf8');
  }
}

// --- Todo database path function ---

/**
 * Get the file path for a user's todos.
 * @param {string} topicHash - The user's data hash.
 * @returns {string} The file path.
 */
function getTodoFilePath(topicHash) {
  return path.join(DATA_DIR, `todos_${topicHash}.json`);
}

// --- Helper functions for file handling (per-topic) ---

// Debounce cache for pending writes (per topic hash)
// Configurable debounce time (default 100ms for faster response, can be increased via env)
const DB_WRITE_DEBOUNCE_MS = parseInt(process.env.DB_WRITE_DEBOUNCE_MS) || 100;
const writeCache = new Map();
const pendingWrites = new Map(); // topicHash -> setTimeout ID

/**
 * Load todos for a user.
 * @param {string} topicHash - The user's data hash.
 * @returns {{todos: Array, sortMode: string}} The user's todos and sort mode.
 */
function loadTodos(topicHash) {
  // First check cache for latest data
  const cached = writeCache.get(topicHash);
  if (cached) {
    return cached;
  }
  
  const todoFile = getTodoFilePath(topicHash);
  try {
    if (fs.existsSync(todoFile)) {
      const raw = fs.readFileSync(todoFile, 'utf8');
      const data = JSON.parse(raw);
      // Support both old format (array) and new format (object)
      if (Array.isArray(data)) {
        return { todos: data, sortMode: 'default', deleteEnabled: true };
      }
      // Ensure deleteEnabled exists (default to true for backward compatibility)
      if (data.deleteEnabled === undefined) {
        data.deleteEnabled = true;
      }
      return data;
    }
  } catch (err) {
    console.error('Error reading todos file:', err);
  }
  return { todos: [], sortMode: 'default', deleteEnabled: true };
}

/**
 * Asynchronously save todos for a user with debouncing.
 * @param {string} topicHash - The user's data hash.
 * @param {Array} todos - The user's todos.
 * @param {string} [sortMode='default'] - The user's sort mode.
 * @param {boolean} [deleteEnabled=true] - Whether delete is enabled.
 */
function saveTodosAsync(topicHash, todos, sortMode = 'default', deleteEnabled = true) {
  // Update cache immediately for reads
  const data = { todos, sortMode, deleteEnabled };
  writeCache.set(topicHash, data);
  
  // Clear existing pending write
  if (pendingWrites.has(topicHash)) {
    clearTimeout(pendingWrites.get(topicHash));
  }
  
  // Schedule async write with debounce
  const timeoutId = setTimeout(() => {
    const todoFile = getTodoFilePath(topicHash);
    const cached = writeCache.get(topicHash);
    const dataToWrite = JSON.stringify({ 
      todos: cached?.todos || todos, 
      sortMode: cached?.sortMode || sortMode,
      deleteEnabled: cached?.deleteEnabled ?? deleteEnabled
    }, null, 2);
    
    fs.writeFile(todoFile, dataToWrite, 'utf8', (err) => {
      if (err) {
        console.error('Error writing todos file:', err);
      } else {
        console.log(`[DB] Async write completed for ${topicHash.substring(0, 8)}...`);
      }
    });
    
    pendingWrites.delete(topicHash);
  }, DB_WRITE_DEBOUNCE_MS);
  
  pendingWrites.set(topicHash, timeoutId);
}

/**
 * Synchronously save todos for a user.
 * @param {Array} todos - The user's todos.
 * @param {string} topicHash - The user's data hash.
 * @param {string} [sortMode='default'] - The user's sort mode.
 * @param {boolean} [deleteEnabled=true] - Whether delete is enabled.
 */
function saveTodosSync(todos, topicHash, sortMode = 'default', deleteEnabled = true) {
  const todoFile = getTodoFilePath(topicHash);
  try {
    fs.writeFileSync(todoFile, JSON.stringify({ todos, sortMode, deleteEnabled }, null, 2), 'utf8');
    // Clear from cache after sync write
    writeCache.delete(topicHash);
  } catch (err) {
    console.error('Error writing todos file:', err);
  }
}

/**
 * Save todos for a user (backward compatibility).
 * @param {Array} todos - The user's todos.
 * @param {string} topicHash - The user's data hash.
 * @param {string} [sortMode='default'] - The user's sort mode.
 * @param {boolean} [deleteEnabled=true] - Whether delete is enabled.
 */
function saveTodos(todos, topicHash, sortMode = 'default', deleteEnabled = true) {
  return saveTodosAsync(topicHash, todos, sortMode, deleteEnabled);
}

// --- Helper to get todos for a session ---

/**
 * Get todos for a session.
 * @param {object} session - The session object.
 * @returns {{todos: Array, sortMode: string}} The user's todos and sort mode.
 */
function getSessionTodos(session) {
  if (!session || !session.topicHash) {
    return { todos: [], sortMode: 'default', deleteEnabled: true };
  }
  return loadTodos(session.topicHash);
}

/**
 * Save todos for a session.
 * @param {Array} todos - The user's todos.
 * @param {object} session - The session object.
 * @param {string} sortMode - The user's sort mode.
 * @param {boolean} deleteEnabled - Whether delete is enabled.
 */
function saveSessionTodos(todos, session, sortMode, deleteEnabled) {
  const topicHash = session.topicHash;
  if (!topicHash) {
    return;
  }
  saveTodos(todos, topicHash, sortMode, deleteEnabled);
}

// --- Broadcast function for WebSocket ---

/**
 * Broadcast data to all WebSocket clients.
 * @param {object} data - The data to broadcast.
 * @param {string|null} [topicHash=null] - The topic hash to broadcast to (not used).
 */
function broadcast(data, topicHash = null) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// --- Load initial data (for backward compatibility) ---
// If no topics file exists, create one with the default topic
const topics = loadTopics();
if (Object.keys(topics).length === 0 && fs.existsSync(path.join(DATA_DIR, 'todos.json'))) {
  // Migrate existing todos.json to topic-based system
  const defaultHash = getDataHash('ROZSA');
  registerTopic('ROZSA');
  const existingTodos = loadTodos('');
  if (existingTodos.length > 0) {
    saveTodos(existingTodos, defaultHash);
  }
}

app.use(cors());
app.use(cookieParser());
app.use(express.json());

const SENSITIVE_LOG_KEYS = new Set(['pa$$word', 'topic', 'topic', 'token', 'authtoken', 'oauth_token']);

function sanitizeLogValue(value, maxLength = 2000) {
  if (value === undefined || value === null) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    value = value.toString('utf8');
  }

  if (typeof value === 'string') {
    try {
      return sanitizeLogValue(JSON.parse(value), maxLength);
    } catch (err) {
      return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
    }
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogValue(item, maxLength));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    Object.entries(value).forEach(([key, nestedValue]) => {
      sanitized[key] = SENSITIVE_LOG_KEYS.has(key.toLowerCase())
        ? '[redacted]'
        : sanitizeLogValue(nestedValue, maxLength);
    });

    const serialized = JSON.stringify(sanitized);
    if (!serialized) {
      return sanitized;
    }
    if (serialized.length > maxLength) {
      return `${serialized.slice(0, maxLength)}...`;
    }
    return sanitized;
  }

  return value;
}

app.use((req, res, next) => {
  const requestStartedAt = Date.now();
  const originalEnd = res.end.bind(res);
  let responseBody;

  res.end = (chunk, encoding, callback) => {
    if (chunk !== undefined) {
      responseBody = chunk;
    }

    const logResponse = () => {
      console.log(JSON.stringify({
        timestamp: new Date(requestStartedAt).toISOString(),
        url: req.originalUrl || req.url,
        request: {
          method: req.method,
          body: sanitizeLogValue(req.body) ?? null
        },
        response: {
          statusCode: res.statusCode,
          body: sanitizeLogValue(responseBody) ?? null
        }
      }));
    };

    res.once('finish', logResponse);
    return originalEnd(chunk, encoding, callback);
  };

  next();
});

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
 *     summary: Login with a topic
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Authentication failed
 */
app.post('/api/auth/login', async (req, res) => {
  const topic = req.body.topic || req.body.topic;
  
  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }
  
  try {
    // Verify topic and register if new (async with bcrypt)
    const { hash: topicHash, isNew } = await verifyAndRegisterTopic(topic);
    
    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { 
      createdAt: Date.now(),
      topicHash: topicHash
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
      isNewTopic: isNew,
      message: isNew ? 'New topic registered with personal todo database' : 'Login successful'
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
    res.json({ authenticated: true, isNewTopic: false });
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
    const topicHash = getDataHash(oauthId);
    
    // Check if new user
    const topics = loadTopics();
    const isNew = !topics[topicHash];
    
    // Register OAuth user
    if (isNew) {
      registerOAuthUser(topicHash, provider, userInfo);
    }
    
    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      createdAt: Date.now(),
      topicHash: topicHash,
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
  // Set headers to prevent caching and include sort mode and delete setting
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('X-Sort-Mode', data.sortMode || 'default');
  res.set('X-Delete-Enabled', data.deleteEnabled === false ? 'false' : 'true');
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
  const deleteEnabled = data.deleteEnabled;
  const nextId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1;
  const todo = { 
    id: nextId, 
    text: text.trim(), 
    done: false, 
    favorite: false,
    createdAt: Date.now()
  };
  todos.push(todo);
  saveSessionTodos(todos, req.session, sortMode, deleteEnabled);
  broadcast(todos, req.session.topicHash);

  res.status(201).json(todo);
});

app.put('/api/todos', requireAuth, (req, res) => {
  const newTodos = req.body;
  if (!Array.isArray(newTodos)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  const data = getSessionTodos(req.session);
  saveSessionTodos(newTodos, req.session, data.sortMode, data.deleteEnabled);
  broadcast(newTodos, req.session.topicHash);

  res.status(200).json({ message: 'Todos restored successfully' });
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { text, done, favorite } = req.body;

  const data = getSessionTodos(req.session);
  let todos = data.todos;
  const sortMode = data.sortMode || 'default';
  const deleteEnabled = data.deleteEnabled;
  const todo = todos.find(t => t.id === id);
  if (!todo) return res.status(404).json({ error: 'Not found' });

  if (typeof text === 'string') {
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      return res.status(400).json({ error: 'Text cannot be empty' });
    }
    todo.text = trimmedText;
  }
  if (typeof done === 'boolean') todo.done = done;
  if (typeof favorite === 'boolean') todo.favorite = favorite;

  saveSessionTodos(todos, req.session, sortMode, deleteEnabled);
  broadcast(todos, req.session.topicHash);
  res.json(todo);
});

app.delete('/api/todos/clear-completed', requireAuth, (req, res) => {
  const data = getSessionTodos(req.session);
  let todos = data.todos;
  const sortMode = data.sortMode || 'default';
  const deleteEnabled = data.deleteEnabled;
  
  // Filter out completed todos
  const completedTodos = todos.filter(t => t.done);
  const remainingTodos = todos.filter(t => !t.done);
  
  if (completedTodos.length === 0) {
    return res.json({ message: 'No completed todos to clear', deleted: 0 });
  }
  
  saveSessionTodos(remainingTodos, req.session, sortMode, deleteEnabled);
  broadcast(remainingTodos, req.session.topicHash);

  res.json({ message: 'Cleared completed todos', deleted: completedTodos.length });
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const data = getSessionTodos(req.session);
  
  // Check if delete is disabled
  if (data.deleteEnabled === false) {
    return res.status(403).json({ error: 'Delete is disabled' });
  }
  
  let todos = data.todos;
  const sortMode = data.sortMode || 'default';
  const deleteEnabled = data.deleteEnabled;
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  const removed = todos.splice(index, 1)[0];
  saveSessionTodos(todos, req.session, sortMode, deleteEnabled);
  broadcast(todos, req.session.topicHash);

  res.json(removed);
});

// --- Sort mode endpoint ---
app.put('/api/sort', requireAuth, (req, res) => {
  const { sortMode } = req.body;
  if (!sortMode || !['default', 'alpha'].includes(sortMode)) {
    return res.status(400).json({ error: 'Invalid sort mode' });
  }
  
  const data = getSessionTodos(req.session);
  saveSessionTodos(data.todos, req.session, sortMode, data.deleteEnabled);
  
  res.json({ sortMode });
});

// --- Delete enabled endpoint ---
app.put('/api/delete-enabled', requireAuth, (req, res) => {
  const { deleteEnabled } = req.body;
  
  // Accept boolean or string 'true'/'false'
  let enabled;
  if (typeof deleteEnabled === 'boolean') {
    enabled = deleteEnabled;
  } else if (typeof deleteEnabled === 'string') {
    enabled = deleteEnabled === 'true';
  } else {
    return res.status(400).json({ error: 'Invalid deleteEnabled value' });
  }
  
  const data = getSessionTodos(req.session);
  saveSessionTodos(data.todos, req.session, data.sortMode, enabled);
  
  res.json({ deleteEnabled: enabled });
});

// --- Get settings endpoint ---
app.get('/api/settings', requireAuth, (req, res) => {
  const data = getSessionTodos(req.session);
  res.json({
    sortMode: data.sortMode || 'default',
    deleteEnabled: data.deleteEnabled !== false
  });
});

// --- Archive endpoint ---
app.post('/api/archive', requireAuth, (req, res) => {
  if (!req.session || !req.session.topicHash) {
    return res.status(400).json({ error: 'No session found' });
  }
  
  const topicHash = req.session.topicHash;
  const sourceFile = getTodoFilePath(topicHash);
  
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
  const archiveFileName = `todos_${topicHash}_${timestamp}.json`;
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
 * Associates a WebSocket connection with a topic hash using a session token.
 * @param {WebSocket} ws - The WebSocket client.
 * @param {string} token - The session token.
 */
function authenticateWebSocket(ws, token) {
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    const sessionAge = Date.now() - session.createdAt;

    if (sessionAge <= SESSION_MAX_AGE) {
      ws.topicHash = session.topicHash;
      console.log(`[WS] Authenticated connection for hash ${ws.topicHash.substring(0, 8)}...`);
    } else {
      delete ws.topicHash; // Session expired
    }
  } else {
    delete ws.topicHash; // Invalid token
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
 * Broadcast data to clients associated with a specific topicHash.
 * @param {object} data - The data to broadcast.
 * @param {string} topicHash - The topic hash to broadcast to.
 */
function broadcast(data, topicHash) {
  if (!topicHash) {
    console.warn('[WS] Broadcast called without a topicHash. Not broadcasting.');
    return;
  }
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.topicHash === topicHash && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

const PROTOCOL = isHttps ? 'https' : 'http';

// Run cleanup on startup
cleanupData();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on ${PROTOCOL}://0.0.0.0:${PORT}`);
  console.log(`Topics stored in: ${TOPICS_FILE}`);
  console.log(`Todo databases stored in: ${DATA_DIR}/todos_<hash>.json`);
});
