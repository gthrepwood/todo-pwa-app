const API_BASE = '/api/todos';
const AUTH_API = '/api/auth';

// Check for token in localStorage first (backward compatibility)
let authToken = localStorage.getItem('authToken');

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const showDoneToggle = document.getElementById('show-done-toggle');
const undoBtn = document.getElementById('undo-btn');

let allTodos = [];
let currentSortMode = 'default'; // 'default' = by added time, 'alpha' = alphabetically
let deleteEnabled = true; // Whether delete is enabled (from server)
let appVersion = '1.0.0'; // Default, will be updated from server

// Load "show completed" state from localStorage
const savedShowCompleted = localStorage.getItem('showCompleted');
if (savedShowCompleted !== null) {
  showDoneToggle.checked = savedShowCompleted === 'true';
}

// Load font size from localStorage
let currentFontSize = localStorage.getItem('fontSize') || 'normal';
document.body.classList.add(`font-${currentFontSize}`);

/**
 * Sets the font size and persists it to localStorage.
 * @param {string} size - 'small', 'normal', or 'large'
 */
function setFontSize(size) {
  // Remove all font size classes
  document.body.classList.remove('font-small', 'font-normal', 'font-large');
  // Add the new font size class
  document.body.classList.add(`font-${size}`);
  // Save to localStorage
  localStorage.setItem('fontSize', size);
  currentFontSize = size;
}

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

// Don't render immediately - wait for sort mode to be loaded from server
// renderTodos() will be called after loadTodos() completes

// Focus the input field on page load
input.focus();

// --- Authentication ---
/**
 * Returns authentication headers if a token is available.
 * @returns {object} - Headers object for API requests.
 */
function getAuthHeaders() {
  return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

/**
 * Shows the login screen and hides the main application content.
 */
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

/**
 * Shows the main application screen and hides the login screen.
 */
function showMainScreen() {
  document.getElementById('todo-form').classList.remove('hidden');
  // Don't show todo-list yet - wait for sort mode to be loaded first
  document.getElementById('login-screen').classList.add('hidden');
  // Update menu: hide Login, show Logout
  const loginLink = document.querySelector('[data-menu="login"]');
  const logoutLink = document.querySelector('[data-menu="logout"]');
  if (loginLink) loginLink.style.display = 'none';
  if (logoutLink) logoutLink.style.display = '';
}

/**
 * Shows the todo list.
 */
function showTodoList() {
  // Show the todo list after sort mode is loaded
  document.getElementById('todo-list').classList.remove('hidden');
}

/**
 * Wrapper for fetch to log API requests and responses.
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options.
 * @returns {Promise<Response>} - The fetch response.
 */
async function fetchWithLogging(url, options) {
  const method = options?.method || 'GET';
  console.log(`[API] ==> ${method} ${url}`);
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include' // Include cookies in all requests
    });
    console.log(`[API] <== ${method} ${url} - ${response.status} ${response.statusText}`);
    return response;
  } catch (error) {
    console.error(`[API] <== FAILED ${method} ${url}`, error);
    throw error;
  }
}

/**
 * Updates the local todos array and caches it to localStorage.
 * @param {Array} newTodos - The new array of todos.
 */
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

/**
 * Logs in the user with a password.
 * @param {string} password - The user's password.
 * @returns {Promise<{success: boolean, error?: string}>} - Whether the login was successful.
 */
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

/**
 * Logs out the user.
 */
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
  localStorage.removeItem('showCompleted');
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
/**
 * Loads todos from the server.
 */
async function loadTodos() {
  try {
    const response = await fetchWithLogging(API_BASE, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });
    if (response.status === 401) {
      authToken = null;
      localStorage.removeItem('authToken');
      localStorage.removeItem('cachedTodos');
      showLoginScreen();
      return;
    }
    // Get sort mode and delete enabled from response headers
    const sortMode = response.headers.get('X-Sort-Mode') || 'default';
    currentSortMode = sortMode;
    
    const deleteEnabledHeader = response.headers.get('X-Delete-Enabled');
    deleteEnabled = deleteEnabledHeader !== 'false';
    
    const newTodos = await response.json();
    updateAndCacheTodos(newTodos);
    
    // Update menu labels after loading settings
    updateMenuLabels();
    
    // Show todo list only after sort mode is loaded
    showTodoList();
  } catch (error) {
    console.error('Error loading todos:', error);
    showLoginScreen();
  }
}

/**
 * Updates menu labels based on current settings.
 */
function updateMenuLabels() {
  // Update "show completed" label
  const toggleDoneLink = document.querySelector('[data-menu="toggle-done"]');
  if (toggleDoneLink) {
    toggleDoneLink.textContent = showDoneToggle.checked ? '🙈 Hide completed' : '👁️ Show completed';
  }
  
  // Update sort mode labels
  const sortDefaultLink = document.querySelector('[data-menu="sort-default"]');
  const sortAlphaLink = document.querySelector('[data-menu="sort-alpha"]');
  if (sortDefaultLink) {
    sortDefaultLink.textContent = currentSortMode === 'default' ? '✓ Sort by added' : 'Sort by added';
  }
  if (sortAlphaLink) {
    sortAlphaLink.textContent = currentSortMode === 'alpha' ? '✓ A-Z Sort alphabetically' : 'A-Z Sort alphabetically';
  }
  
  // Update delete enabled label
  const toggleDeleteLink = document.querySelector('[data-menu="toggle-delete"]');
  if (toggleDeleteLink) {
    toggleDeleteLink.textContent = deleteEnabled ? '✓ Delete enabled' : '🙈 Delete disabled';
  }
}

// Check if logged in on startup
// Handle OAuth callback first
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('oauth_complete')) {
  // OAuth completed - token is in cookie
  const oauthNew = urlParams.get('oauth_new');
  const provider = urlParams.get('provider');
  const error = urlParams.get('error');
  
  if (error) {
    loginError.textContent = `OAuth error: ${error}`;
    loginError.classList.remove('hidden');
  } else {
    // Token should be in cookie - fetch it
    fetch(`${AUTH_API}/check`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          // Show success message for new users
          if (oauthNew === 'true') {
            showMessage(`Welcome! Your ${provider} account is now linked to your todo list.`);
          }
          loadTodos();
        }
      });
  }
  // Clean URL
  window.history.replaceState({}, document.title, '/');
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

/**
 * Converts URLs in text to clickable anchor tags.
 * @param {string} text - The text that may contain URLs.
 * @returns {string} - The text with URLs converted to anchor tags.
 */
function convertUrlsToLinks(text) {
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

/**
 * Renders the todo list to the DOM.
 */
function renderTodos() {
  console.log(`[RENDER] Starting render with ${allTodos.length} total todos in memory.`);
  const showDone = showDoneToggle.checked;
  let todosToRender = showDone ? allTodos : allTodos.filter(t => !t.done);

  // Sort based on current sort mode
  // Apply the selected sort mode (alpha or by id), then keep favorites and done status
  todosToRender = [...todosToRender].sort((a, b) => {
    // First apply the selected sort mode
    if (currentSortMode === 'alpha') {
      const alphaCompare = a.text.localeCompare(b.text);
      if (alphaCompare !== 0) return alphaCompare;
    } else {
      // default: sort by added time (id represents creation order)
      if (a.id !== b.id) return a.id - b.id;
    }
    
    // Then keep favorites first
    if (a.favorite !== b.favorite) return b.favorite ? 1 : -1;
    
    // Then keep non-completed before completed
    if (a.done !== b.done) return a.done ? 1 : -1;
    
    return 0;
  });

  // Clear existing list before rendering
  list.innerHTML = '';
  
  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  console.log(`[RENDER] Rendering ${todosToRender.length} todo items to the DOM.`);
  todosToRender.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');
    li.dataset.id = todo.id;
    
    // Hide delete button if delete is disabled
    const deleteButton = deleteEnabled ? '<button class="del-btn">🚮</button>' : '';
    
    // Use innerHTML for simpler and faster element creation
    li.innerHTML = `
      <button class="toggle-btn">${todo.done ? '↩' : '❏'}</button>
      <button class="fav-btn">${todo.favorite ? '⭐' : '☆'}</button>
      <span class="todo-text">${convertUrlsToLinks(todo.text)}</span>
      ${deleteButton}
    `;

    fragment.appendChild(li);
  });
  // Single DOM reflow instead of multiple
  list.appendChild(fragment);
}

/**
 * Shows the undo button for a short period.
 */
function showUndoButton() {
  undoBtn.classList.remove('hidden');
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    hideUndoButton();
  }, 10000);
}

/**
 * Hides the undo button and clears the undo stack.
 */
function hideUndoButton() {
  undoBtn.classList.add('hidden');
  undoStack = [];
  clearTimeout(undoTimeout);
}

/**
 * Adds a new todo item.
 * @param {string} text - The text of the todo item.
 */
async function addTodo(text) {
  hideUndoButton();
  
  // Check if there's an existing completed todo with the same text
  const existingDoneTodo = allTodos.find(t => t.done && t.text === text);
  if (existingDoneTodo) {
    // Toggle the existing completed todo back to uncompleted
    undoStack.push(JSON.parse(JSON.stringify(allTodos)));
    const response = await fetchWithLogging(`${API_BASE}/${existingDoneTodo.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ done: false })
    });
    if (response.status === 401) {
      showLoginScreen();
    } else {
      existingDoneTodo.done = false;
      renderTodos();
      showUndoButton();
    }
    return;
  }
  
  // Optimistic update: add to local array immediately for correct sorting
  const tempId = Date.now(); // Temporary negative ID for optimistic insert
  const newTodo = { 
    id: tempId, 
    text: text, 
    done: false, 
    favorite: false 
  };
  allTodos.push(newTodo);
  renderTodos();
  
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

/**
 * Toggles the 'done' state of a todo item.
 * @param {object} todo - The todo item to toggle.
 */
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
    // Update local state immediately for responsive UI
    todo.done = !todo.done;
    renderTodos();
    showUndoButton();
  }
}

/**
 * Toggles the 'favorite' state of a todo item.
 * @param {object} todo - The todo item to toggle.
 */
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
    // Update local state immediately for responsive UI
    todo.favorite = !todo.favorite;
    renderTodos();
    showUndoButton();
  }
}

/**
 * Deletes a todo item.
 * @param {object} todo - The todo item to delete.
 */
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

/**
 * Clears all 'done' todo items.
 */
async function clearDoneTodos() {
  const doneTodos = allTodos.filter(t => t.done);
  if (doneTodos.length === 0) return;

  console.log('Clearing done todos:', doneTodos.length);
  undoStack.push(JSON.parse(JSON.stringify(allTodos)));

  // Use the bulk clear endpoint (bypasses deleteEnabled check)
  const response = await fetchWithLogging(`${API_BASE}/clear-completed`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  if (response.status === 401) {
    showLoginScreen();
  } else {
    // Update local state immediately for responsive UI
    allTodos = allTodos.filter(t => !t.done);
    renderTodos();
    showUndoButton();
  }
}

/**
 * Undoes the last action.
 */
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
    // Update local state immediately for responsive UI
    allTodos = originalState;
    renderTodos();
  } catch (error) {
    console.error('Undo error:', error);
  }
  hideUndoButton();
  input.focus();
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addTodo(text);
  input.value = '';
});

showDoneToggle.addEventListener('change', () => {
  // Save "show completed" state to localStorage
  localStorage.setItem('showCompleted', showDoneToggle.checked);
  renderTodos();
});
undoBtn.addEventListener('click', undo);

// --- Event Delegation for Todo List ---
list.addEventListener('click', e => {
  const target = e.target;
  const li = target.closest('li.todo-item');
  if (!li) return;

  const id = Number(li.dataset.id);
  const todo = allTodos.find(t => t.id === id);
  if (!todo) return;

  // Handle button clicks
  if (target.matches('.fav-btn')) {
    toggleFavorite(todo);
  } else if (target.matches('.toggle-btn')) {
    toggleTodo(todo);
  } else if (target.matches('.del-btn')) {
    deleteTodo(todo);
  } else if (target.matches('.todo-text')) {
    // Handle click on text for editing
    const span = target;
    if (span.querySelector('input')) return; // Already editing

    const currentText = todo.text;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.style.cssText = 'width: 100%; padding: 2px 4px; font: inherit;';

    const finishEdit = async () => {
      // Store reference to input before potential DOM removal
      const inputValue = input.value;
      const newText = inputValue.trim();
      if (newText && newText !== currentText) {
        // Save to server
        await fetchWithLogging(`${API_BASE}/${todo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ text: newText })
        });
        // Update local state immediately
        todo.text = newText;
        // Force immediate re-render
        renderTodos();
      } else {
        // Revert display if no change or empty - just re-render to be safe
        renderTodos();
      }
    };

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        span.innerHTML = convertUrlsToLinks(currentText); // Revert and don't save
      }
    });

    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl+Z for undo
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    undo();
  }
});

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

/**
 * Loads the available OAuth providers from the server.
 */
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

/**
 * Initiates the OAuth login process for a given provider.
 * @param {string} provider - The OAuth provider (e.g., 'google', 'microsoft').
 */
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

/**
 * Handles the OAuth callback.
 */
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

  // Don't close menu for dropdown toggle - toggle dropdown instead
  if (link.classList.contains('menu-dropdown-toggle')) {
    const dropdown = link.closest('.menu-dropdown');
    const content = dropdown?.querySelector('.menu-dropdown-content');
    if (content) {
      content.classList.toggle('hidden');
    }
    return;
  }

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
      // Save "show completed" state to localStorage
      localStorage.setItem('showCompleted', showDoneToggle.checked);
      // Update menu label
      link.textContent = showDoneToggle.checked ? '🙈 Hide completed' : '👁️ Show completed';
      renderTodos();
      break;
    case 'sort-alpha':
      currentSortMode = 'alpha';
      updateMenuLabels();
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
      updateMenuLabels();
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
    case 'toggle-delete':
      deleteEnabled = !deleteEnabled;
      // Save to server
      fetchWithLogging('/api/delete-enabled', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ deleteEnabled })
      });
      // Update menu label
      link.textContent = deleteEnabled ? '✓ Delete enabled' : '🙈 Delete disabled';
      renderTodos();
      break;
    case 'font-small':
      setFontSize('small');
      break;
    case 'font-normal':
      setFontSize('normal');
      break;
    case 'font-large':
      setFontSize('large');
      break;
    case 'save-db':
      saveDb();
      break;
    case 'add-multi':
      showMultiAddPopup();
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

/**
 * Saves the current todos to a JSON file.
 */
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

/**
 * Loads todos from a JSON file.
 */
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

// --- Multi-add popup ---
const multiAddPopup = document.getElementById('multi-add-popup');
const multiAddText = document.getElementById('multi-add-text');
const multiAddCancel = document.getElementById('multi-add-cancel');
const multiAddOk = document.getElementById('multi-add-ok');

function showMultiAddPopup() {
  multiAddPopup.classList.remove('hidden');
  multiAddText.value = '';
  multiAddText.focus();
}

function hideMultiAddPopup() {
  multiAddPopup.classList.add('hidden');
}

async function addMultipleTodos() {
  const text = multiAddText.value;
  if (!text.trim()) {
    hideMultiAddPopup();
    return;
  }
  
  // Split by newlines and trim trailing spaces
  const lines = text.split('\n').map(line => line.trimEnd().trim());
  
  // Filter out empty lines
  const validLines = lines.filter(line => line.trim().length > 0);
  
  if (validLines.length === 0) {
    hideMultiAddPopup();
    return;
  }
  
  // Add each valid line as a todo
  for (const line of validLines) {
    await addTodo(line);
  }
  
  hideMultiAddPopup();
}

multiAddCancel.addEventListener('click', hideMultiAddPopup);
multiAddOk.addEventListener('click', addMultipleTodos);

multiAddPopup.addEventListener('click', (e) => {
  if (e.target === multiAddPopup) {
    hideMultiAddPopup();
  }
});

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
