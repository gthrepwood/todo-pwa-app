const API_BASE = '/api/todos';
const AUTH_API = '/api/auth';

let authToken = localStorage.getItem('authToken');

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const showDoneToggle = document.getElementById('show-done-toggle');
const undoBtn = document.getElementById('undo-btn');

let allTodos = [];
let currentSortMode = 'default'; // 'default' = by added time, 'alpha' = alphabetically
let appVersion = '1.0.0'; // Default, will be updated from server
try {
  const cachedTodos = localStorage.getItem('cachedTodos');
  if (cachedTodos) {
    allTodos = JSON.parse(cachedTodos);
    console.log(`[CACHE] Loaded ${allTodos.length} todos from localStorage.`);
  } else {
    console.log('[CACHE] No cached todos found in localStorage.');
  }
} catch (e) {
  console.error('Error loading cached todos', e);
  localStorage.removeItem('cachedTodos');
}

let undoStack = [];
let undoTimeout = null;

// Initial render from cache
renderTodos();

// --- Authentication ---
function getAuthHeaders() {
  return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

function showLoginScreen() {
  document.getElementById('todo-form').classList.add('hidden');
  document.getElementById('todo-list').classList.add('hidden');
  document.getElementById('undo-btn').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  
  // Load OAuth providers for this server
  loadOAuthProviders();
  
  // Update menu: show Login, hide Logout
  const loginLink = document.querySelector('[data-menu="login"]');
  const logoutLink = document.querySelector('[data-menu="logout"]');
  if (loginLink) loginLink.style.display = '';
  if (logoutLink) logoutLink.style.display = 'none';
}

function showMainScreen() {
  document.getElementById('todo-form').classList.remove('hidden');
  document.getElementById('todo-list').classList.remove('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  // Update menu: hide Login, show Logout
  const loginLink = document.querySelector('[data-menu="login"]');
  const logoutLink = document.querySelector('[data-menu="logout"]');
  if (loginLink) loginLink.style.display = 'none';
  if (logoutLink) logoutLink.style.display = '';
}

async function fetchWithLogging(url, options) {
  const method = options?.method || 'GET';
  console.log(`[API] ==> ${method} ${url}`);
  try {
    const response = await fetch(url, options);
    console.log(`[API] <== ${method} ${url} - ${response.status} ${response.statusText}`);
    return response;
  } catch (error) {
    console.error(`[API] <== FAILED ${method} ${url}`, error);
    throw error;
  }
}

function updateAndCacheTodos(newTodos) {
  console.log(`[CACHE] Updating with ${newTodos.length} todos.`);
  allTodos = newTodos;
  try {
    localStorage.setItem('cachedTodos', JSON.stringify(allTodos));
  } catch (e) {
    console.error('Error caching todos', e);
  }
  renderTodos();
}

async function login(password) {
  try {
    const response = await fetchWithLogging(`${AUTH_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error };
    }

    const data = await response.json();
    authToken = data.token;
    localStorage.setItem('authToken', authToken);
    showMainScreen();
    loadTodos();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function logout() {
  try {
    await fetchWithLogging(`${AUTH_API}/logout`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (e) { }
  authToken = null;
  console.log('[CACHE] Clearing all cached data on logout.');
  localStorage.removeItem('authToken');
  localStorage.removeItem('cachedTodos');
  showLoginScreen();
}

// --- WebSocket Setup ---
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

ws.onmessage = (event) => {
  if (!authToken) return; // Don't update if not logged in
  updateAndCacheTodos(JSON.parse(event.data));
};

ws.onopen = () => {
  console.log('WebSocket connection established');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// --- Load initial data ---
async function loadTodos() {
  try {
    const response = await fetchWithLogging(API_BASE, {
      headers: getAuthHeaders()
    });
    if (response.status === 401) {
      authToken = null;
      localStorage.removeItem('authToken');
      localStorage.removeItem('cachedTodos');
      showLoginScreen();
      return;
    }
    // Get sort mode from response header
    const sortMode = response.headers.get('X-Sort-Mode') || 'default';
    currentSortMode = sortMode;
    
    const newTodos = await response.json();
    updateAndCacheTodos(newTodos);
  } catch (error) {
    console.error('Error loading todos:', error);
    showLoginScreen();
  }
}

// Check if logged in on startup
// Handle OAuth callback first
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('oauth_token')) {
  handleOAuthCallback();
} else if (authToken) {
  // Validate session first, assume we are logged in until proven otherwise
  showMainScreen();
  fetchWithLogging('/api/auth/check', { headers: getAuthHeaders() })
    .then(res => {
      if (res.ok) {
        loadTodos();
      } else {
        // Session invalid, clear token and show login
        authToken = null;
        localStorage.removeItem('authToken');
        showLoginScreen();
      }
    })
    .catch(() => {
      // Network error, clear token and show login
      authToken = null;
      localStorage.removeItem('authToken');
      showLoginScreen();
    });
} else {
  // No token, show login screen immediately
  showLoginScreen();
}

function renderTodos() {
  console.log(`[RENDER] Starting render with ${allTodos.length} total todos in memory.`);
  const showDone = showDoneToggle.checked;
  let todosToRender = showDone ? allTodos : allTodos.filter(t => !t.done);

  // Sort based on current sort mode
  todosToRender = [...todosToRender].sort((a, b) => {
    // Always keep favorites first
    if (a.favorite !== b.favorite) return b.favorite ? 1 : -1;
    
    // Then apply the selected sort mode
    if (currentSortMode === 'alpha') {
      return a.text.localeCompare(b.text);
    }
    // default: sort by added time (id represents creation order)
    return a.id - b.id;
  });

  list.innerHTML = '';
  console.log(`[RENDER] Rendering ${todosToRender.length} todo items to the DOM.`);
  todosToRender.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');
    li.dataset.id = todo.id;

    const favBtn = document.createElement('button');
    favBtn.textContent = todo.favorite ? '⭐' : '☆';
    favBtn.className = 'fav-btn';
    favBtn.addEventListener('click', () => toggleFavorite(todo));

    const span = document.createElement('span');
    span.textContent = todo.text;
    // Make todo text editable on click
    span.addEventListener('click', () => {
      if (span.querySelector('input')) return; // Already editing
      const input = document.createElement('input');
      input.type = 'text';
      input.value = todo.text;
      input.style.cssText = 'width: 100%; padding: 2px 4px; font: inherit;';
      
      const finishEdit = async () => {
        const newText = input.value.trim();
        if (newText && newText !== todo.text) {
          // Save to server
          await fetchWithLogging(`${API_BASE}/${todo.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ text: newText })
          });
        } else {
          span.textContent = todo.text; // Revert display
        }
      };
      
      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { input.blur(); }
        if (e.key === 'Escape') { span.textContent = todo.text; }
      });
      
      span.textContent = '';
      span.appendChild(input);
      input.focus();
      input.select();
    });

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = todo.done ? '↩' : '🆗';
    toggleBtn.addEventListener('click', () => toggleTodo(todo));

    const delBtn = document.createElement('button');
    delBtn.textContent = '🚮';
    delBtn.addEventListener('click', () => deleteTodo(todo));

    li.appendChild(favBtn);
    li.appendChild(span);
    li.appendChild(toggleBtn);
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}

function showUndoButton() {
  undoBtn.classList.remove('hidden');
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    hideUndoButton();
  }, 10000);
}

function hideUndoButton() {
  undoBtn.classList.add('hidden');
  undoStack = [];
  clearTimeout(undoTimeout);
}

async function addTodo(text) {
  hideUndoButton();
  const response = await fetchWithLogging(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ text })
  });
  if (response.status === 401) {
    showLoginScreen();
  }
}

async function toggleTodo(todo) {
  undoStack.push(JSON.parse(JSON.stringify(allTodos)));
  const response = await fetchWithLogging(`${API_BASE}/${todo.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ done: !todo.done })
  });
  if (response.status === 401) {
    showLoginScreen();
  } else {
    showUndoButton();
  }
}

async function toggleFavorite(todo) {
  undoStack.push(JSON.parse(JSON.stringify(allTodos)));
  const response = await fetchWithLogging(`${API_BASE}/${todo.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ favorite: !todo.favorite })
  });
  if (response.status === 401) {
    showLoginScreen();
  } else {
    showUndoButton();
  }
}

async function deleteTodo(todo) {
  console.log('Deleting todo:', todo);
  undoStack.push(JSON.parse(JSON.stringify(allTodos)));
  console.log('Saved state with', undoStack[undoStack.length - 1].length, 'items');
  const response = await fetchWithLogging(`${API_BASE}/${todo.id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (response.status === 401) {
    showLoginScreen();
  } else {
    showUndoButton();
  }
}

async function clearDoneTodos() {
  const doneTodos = allTodos.filter(t => t.done);
  if (doneTodos.length === 0) return;

  console.log('Clearing done todos:', doneTodos.length);
  undoStack.push(JSON.parse(JSON.stringify(allTodos)));

  // Delete all done todos
  const deletePromises = doneTodos.map(todo =>
    fetchWithLogging(`${API_BASE}/${todo.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    })
  );
  const responses = await Promise.all(deletePromises);
  if (responses.some(r => r.status === 401)) {
    showLoginScreen();
  } else {
    showUndoButton();
  }
}

async function undo() {
  if (undoStack.length === 0) {
    console.log('No actions to undo');
    return;
  }
  // Restore to the ORIGINAL state (first item in stack) - this restores ALL deleted items at once
  const originalState = undoStack[0];
  console.log('Undoing ALL actions, restoring to original state with', originalState.length, 'items');
  try {
    const response = await fetchWithLogging(API_BASE, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(originalState)
    });
    if (!response.ok) {
      throw new Error('Undo failed: ' + response.status);
    }
    console.log('Undo successful - all items restored');
  } catch (error) {
    console.error('Undo error:', error);
  }
  hideUndoButton();
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addTodo(text);
  input.value = '';
});

showDoneToggle.addEventListener('change', renderTodos);
undoBtn.addEventListener('click', undo);

// Login form handling
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginPassword = document.getElementById('login-password');

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const password = loginPassword.value;
  const result = await login(password);
  if (!result.success) {
    loginError.textContent = result.error || 'Login error';
    loginError.classList.remove('hidden');
  }
});

// OAuth Login
let oauthProviders = { google: false, microsoft: false };

async function loadOAuthProviders() {
  try {
    const response = await fetch(`${AUTH_API}/oauth/providers`);
    oauthProviders = await response.json();
    
    // Show/hide OAuth buttons based on configuration
    const googleBtn = document.getElementById('oauth-google-btn');
    const microsoftBtn = document.getElementById('oauth-microsoft-btn');
    const oauthSection = document.querySelector('.oauth-buttons');
    
    const hasAnyProvider = oauthProviders.google || oauthProviders.microsoft;
    
    if (oauthSection) oauthSection.classList.toggle('hidden', !hasAnyProvider);
    if (googleBtn) googleBtn.classList.toggle('hidden', !oauthProviders.google);
    if (microsoftBtn) microsoftBtn.classList.toggle('hidden', !oauthProviders.microsoft);
  } catch (err) {
    console.error('Failed to load OAuth providers:', err);
    // Hide OAuth section if API fails
    const oauthSection = document.querySelector('.oauth-buttons');
    if (oauthSection) oauthSection.classList.add('hidden');
  }
}

async function oauthLogin(provider) {
  try {
    const response = await fetch(`${AUTH_API}/oauth/${provider}`);
    const data = await response.json();
    
    if (data.authUrl) {
      // Redirect to OAuth provider
      window.location.href = data.authUrl;
    } else if (data.error) {
      loginError.textContent = data.error;
      loginError.classList.remove('hidden');
    }
  } catch (err) {
    loginError.textContent = `Failed to initiate ${provider} login`;
    loginError.classList.remove('hidden');
  }
}

// Handle OAuth callback
function handleOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const oauthToken = urlParams.get('oauth_token');
  const oauthNew = urlParams.get('oauth_new');
  const provider = urlParams.get('provider');
  const error = urlParams.get('error');
  
  if (error) {
    loginError.textContent = `OAuth error: ${error}`;
    loginError.classList.remove('hidden');
    // Clean URL
    window.history.replaceState({}, document.title, '/');
    return;
  }
  
  if (oauthToken) {
    // Store token and login
    authToken = oauthToken;
    localStorage.setItem('authToken', authToken);
    
    // Clean URL
    window.history.replaceState({}, document.title, '/');
    
    // Show success message for new users
    if (oauthNew === 'true') {
      showMessage(`Welcome! Your ${provider} account is now linked to your todo list.`);
    }
    
    // Load todos
    loadTodos();
  }
}

// Add OAuth button listeners
document.getElementById('oauth-google-btn')?.addEventListener('click', () => oauthLogin('google'));
document.getElementById('oauth-microsoft-btn')?.addEventListener('click', () => oauthLogin('microsoft'));

// --- Menu Toggle ---
const menuToggle = document.getElementById('menu-toggle');
const mainMenu = document.getElementById('main-menu');

menuToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  mainMenu.classList.toggle('hidden');
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  if (!mainMenu.contains(e.target) && e.target !== menuToggle) {
    mainMenu.classList.add('hidden');
  }
});

// Menu item handlers
mainMenu.addEventListener('click', (e) => {
  const link = e.target.closest('[data-menu]');
  if (!link) return;
  e.preventDefault();
  mainMenu.classList.add('hidden');

  const action = link.dataset.menu;
  switch (action) {
    case 'home':
      window.location.hash = '';
      break;
    case 'about':
      alert(`Todo PWA v${appVersion} — A simple task manager built with PWA technology.`);
      break;
    case 'contact':
      const u = ['g','t','h','r','e','p','w','o','o','d'].join('');
      const d = ['g','m','a','i','l','.','c','o','m'].join('');
      alert('Contact: ' + u + '\u0040' + d);
      break;
    case 'toggle-done':
      showDoneToggle.checked = !showDoneToggle.checked;
      // Update menu label
      link.textContent = showDoneToggle.checked ? '🙈 Hide completed' : '👁️ Show completed';
      renderTodos();
      break;
    case 'sort-alpha':
      currentSortMode = 'alpha';
      link.textContent = '✓ A-Z Sort alphabetically';
      // Save sort mode to server
      fetchWithLogging('/api/sort', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ sortMode: 'alpha' })
      });
      renderTodos();
      break;
    case 'sort-default':
      currentSortMode = 'default';
      link.textContent = '✓ Sort by added';
      // Save sort mode to server
      fetchWithLogging('/api/sort', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ sortMode: 'default' })
      });
      renderTodos();
      break;
    case 'clear-done':
      clearDoneTodos();
      break;
    case 'save-db':
      saveDb();
      break;
    case 'load-db':
      loadDb();
      break;
    case 'login':
      showLoginScreen();
      break;
    case 'logout':
      logout();
      break;
  }
});

// Save DB - download todos as JSON
function saveDb() {
  const data = JSON.stringify(allTodos, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'todos-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Load DB - upload todos from JSON file
function loadDb() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        alert('Invalid file format!');
        return;
      }
      // Save undo state
      undoStack.push(JSON.parse(JSON.stringify(allTodos)));
      // Upload to server
      const response = await fetchWithLogging(API_BASE, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        alert('Database loaded successfully!');
      } else if (response.status === 401) {
        showLoginScreen();
      } else {
        alert('Error loading database!');
      }
    } catch (err) {
      alert('Error reading file: ' + err.message);
    }
  });
  input.click();
}

// Fullscreen toggle
const fullscreenBtn = document.getElementById('fullscreen-btn');
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error('Fullscreen request failed:', err);
    });
  } else {
    document.exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement ? '⛶' : '⛶';
  fullscreenBtn.title = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
});

// Version display - fetch from server
fetchWithLogging('/api/version')
  .then(res => res.json())
  .then(data => {
    const versionEl = document.getElementById('version');
    if (versionEl && data.version) {
      versionEl.textContent = data.version;
      appVersion = data.version;
    }
  })
  .catch(() => {});
