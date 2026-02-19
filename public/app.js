const API_BASE = '/api/todos';

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const showDoneToggle = document.getElementById('show-done-toggle');
const undoBtn = document.getElementById('undo-btn');

let allTodos = [];
let previousState = null;
let undoTimeout = null;

// --- WebSocket Setup ---
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

ws.onmessage = (event) => {
  allTodos = JSON.parse(event.data);
  renderTodos();
};

ws.onopen = () => {
  console.log('WebSocket connection established');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

function renderTodos() {
  const showDone = showDoneToggle.checked;
  const todosToRender = showDone ? allTodos : allTodos.filter(t => !t.done);

  list.innerHTML = '';
  todosToRender.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');
    li.dataset.id = todo.id;

    const span = document.createElement('span');
    span.textContent = todo.text;

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = todo.done ? 'Vissza' : 'Kész';
    toggleBtn.addEventListener('click', () => toggleTodo(todo));

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Törlés';
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
    }, 5000);
}

function hideUndoButton() {
    undoBtn.classList.add('hidden');
    previousState = null;
    clearTimeout(undoTimeout);
}

async function addTodo(text) {
  hideUndoButton();
  await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}

async function toggleTodo(todo) {
  previousState = JSON.parse(JSON.stringify(allTodos));
  await fetch(`${API_BASE}/${todo.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: !todo.done })
  });
  showUndoButton();
}

async function deleteTodo(todo) {
  previousState = JSON.parse(JSON.stringify(allTodos));
  await fetch(`${API_BASE}/${todo.id}`, {
    method: 'DELETE'
  });
  showUndoButton();
}

async function undo() {
    console.log('Undoing with state:', previousState);
    if (!previousState) return;
    await fetch(API_BASE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previousState)
    });
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