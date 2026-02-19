const API_BASE = '/api/todos';

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');

async function fetchTodos() {
  const res = await fetch(API_BASE);
  const data = await res.json();
  renderTodos(data);
}

function renderTodos(todos) {
  list.innerHTML = '';
  todos.forEach(todo => {
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

async function addTodo(text) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  await res.json();
  fetchTodos();
}

async function toggleTodo(todo) {
  await fetch(`${API_BASE}/${todo.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: !todo.done })
  });
  fetchTodos();
}

async function deleteTodo(todo) {
  await fetch(`${API_BASE}/${todo.id}`, {
    method: 'DELETE'
  });
  fetchTodos();
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addTodo(text);
  input.value = '';
});

fetchTodos();