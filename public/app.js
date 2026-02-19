const API_BASE = '/api/todos';
const AUTH_API = '/api/auth';

let authToken = localStorage.getItem('authToken');

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const showDoneToggle = document.getElementById('show-done-toggle');
const undoBtn = document.getElementById('undo-btn');
const clearDoneBtn = document.getElementById('clear-done-btn');

let allTodos = [];
let undoStack = [];
let undoTimeout = null;

// --- Authentication ---
function getAuthHeaders() {
  return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

function showLoginScreen() {
  document.getElementById('todo-form').classList.add('hidden');
  document.querySelector('.toggle-container').classList.add('hidden');
  document.getElementById('todo-list').classList.add('hidden');
  document.getElementById('undo-btn').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
}

function showMainScreen() {
  document.getElementById('todo-form').classList.remove('hidden');
  document.querySelector('.toggle-container').classList.remove('hidden');
  document.getElementById('todo-list').classList.remove('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');
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
  const todosToRender = showDone ? allTodos : allTodos.filter(t => !t.done);

  // Show/hide clear-done button based on toggle and if there are done items
  const hasDoneItems = allTodos.some(t => t.done);
  clearDoneBtn.style.display = (showDone && hasDoneItems) ? 'inline-block' : 'none';

  list.innerHTML = '';
  todosToRender.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');
    li.dataset.id = todo.id;

    const span = document.createElement('span');
    span.textContent = todo.text;

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = todo.done ? 'Vissza' : '🆗 Kész';
    toggleBtn.addEventListener('click', () => toggleTodo(todo));

    const delBtn = document.createElement('button');
    delBtn.textContent = '🚮 Törlés';
    delBtn.addEventListener('click', () => deleteTodo(todo));

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
clearDoneBtn.addEventListener('click', clearDoneTodos);

// Login form handling
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginPassword = document.getElementById('login-password');

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const password = loginPassword.value;
  const result = await login(password);
  if (!result.success) {
    loginError.textContent = result.error || 'Hiba bejelentkezéskor';
    loginError.classList.remove('hidden');
  }
});

// Logout button
const logoutBtn = document.getElementById('logout-btn');
logoutBtn.addEventListener('click', logout);
