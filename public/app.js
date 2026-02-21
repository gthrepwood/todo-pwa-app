const API_BASE = '/api/todos';
const AUTH_API = '/api/auth';

let authToken = localStorage.getItem('authToken');

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const showDoneToggle = document.getElementById('show-done-toggle');
const undoBtn = document.getElementById('undo-btn');

let allTodos = [];
let undoStack = [];
let undoTimeout = null;

// --- Authentication ---
function getAuthHeaders() {
  return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

function showLoginScreen() {
  document.getElementById('todo-form').classList.add('hidden');
  document.getElementById('todo-list').classList.add('hidden');
  document.getElementById('undo-btn').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
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

async function login(password) {
  try {
    const response = await fetch(`${AUTH_API}/login`, {
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
    await fetch(`${AUTH_API}/logout`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (e) { }
  authToken = null;
  localStorage.removeItem('authToken');
  showLoginScreen();
}

// --- WebSocket Setup ---
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

ws.onmessage = (event) => {
  if (!authToken) return; // Don't update if not logged in
  allTodos = JSON.parse(event.data);
  renderTodos();
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
    const response = await fetch(API_BASE, {
      headers: getAuthHeaders()
    });
    if (response.status === 401) {
      authToken = null;
      localStorage.removeItem('authToken');
      showLoginScreen();
      return;
    }
    allTodos = await response.json();
    renderTodos();
    showMainScreen();
  } catch (error) {
    console.error('Error loading todos:', error);
    showLoginScreen();
  }
}

// Check if logged in on startup
showLoginScreen();
if (authToken) {
  loadTodos();
}

function renderTodos() {
  const showDone = showDoneToggle.checked;
  let todosToRender = showDone ? allTodos : allTodos.filter(t => !t.done);

  // Sort: favorites first, then by id
  todosToRender = [...todosToRender].sort((a, b) => {
    if (a.favorite !== b.favorite) return b.favorite ? 1 : -1;
    return a.id - b.id;
  });

  list.innerHTML = '';
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
  const response = await fetch(API_BASE, {
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
  const response = await fetch(`${API_BASE}/${todo.id}`, {
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
  const response = await fetch(`${API_BASE}/${todo.id}`, {
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
  const response = await fetch(`${API_BASE}/${todo.id}`, {
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
    fetch(`${API_BASE}/${todo.id}`, {
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
    const response = await fetch(API_BASE, {
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
      alert('Todo PWA v1.0 — A simple task manager built with PWA technology.');
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
      const response = await fetch(API_BASE, {
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

// Auto-increment version on feature usage
const versionKey = 'todo_pwa_version';
let currentVersion = localStorage.getItem(versionKey) || '1.0.0';

function incrementVersion() {
  const versionEl = document.getElementById('version');
  if (!versionEl) return;
  
  const parts = currentVersion.split('.').map(Number);
  parts[2]++; // Increment patch
  if (parts[2] >= 10) {
    parts[2] = 0;
    parts[1]++;
  }
  if (parts[1] >= 10) {
    parts[1] = 0;
    parts[0]++;
  }
  currentVersion = parts.join('.');
  localStorage.setItem(versionKey, currentVersion);
  versionEl.textContent = currentVersion;
}

// Initialize version display
document.addEventListener('DOMContentLoaded', () => {
  const versionEl = document.getElementById('version');
  if (versionEl) {
    versionEl.textContent = currentVersion;
  }
});

// Auto-increment on favorite toggle
const originalToggleFavorite = toggleFavorite;
toggleFavorite = async function(todo) {
  await originalToggleFavorite(todo);
  incrementVersion();
};
