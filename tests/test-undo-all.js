// Test: Delete multiple items and undo ALL at once

const API_BASE = 'http://localhost:3004/api/todos';
const AUTH_API = 'http://localhost:3004/api/auth';

let authToken = null;

async function login(password) {
    const response = await fetch(`${AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    const data = await response.json();
    return data.token;
}

async function getAuthHeaders() {
    return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

async function getTodos() {
    const response = await fetch(API_BASE, { headers: await getAuthHeaders() });
    return await response.json();
}

async function deleteTodo(id) {
    const response = await fetch(`${API_BASE}/${id}`, { 
        method: 'DELETE',
        headers: await getAuthHeaders()
    });
    return await response.json();
}

async function restoreTodos(todos) {
    const response = await fetch(API_BASE, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            ...await getAuthHeaders()
        },
        body: JSON.stringify(todos)
    });
    return await response.json();
}

async function addTodo(text) {
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            ...await getAuthHeaders()
        },
        body: JSON.stringify({ text })
    });
    return await response.json();
}

async function runTest() {
    console.log('=== Test: Multiple Delete + Undo ALL at Once ===\n');
    
    // Login first
    console.log('0. Logging in...');
    authToken = await login('todopwa2026');
    console.log('  Logged in successfully\n');

    // Step 1: Create items 1, 2, 3, 4
    console.log('1. Creating items: 1, 2, 3, 4');
    await addTodo('1');
    await addTodo('2');
    await addTodo('3');
    await addTodo('4');

    let todos = await getTodos();
    console.log('Current todos:', todos.map(t => t.text).join(', '));
    console.log('');

    // Step 2: Delete items 1, 2, 3
    console.log('2. Deleting items: 1, 2, 3');
    const id1 = todos.find(t => t.text === '1').id;
    const id2 = todos.find(t => t.text === '2').id;
    const id3 = todos.find(t => t.text === '3').id;

    await deleteTodo(id1);
    await deleteTodo(id2);
    await deleteTodo(id3);

    todos = await getTodos();
    console.log('After deletion:', todos.map(t => t.text).join(', '));
    console.log('(Only item 4 should remain)');
    console.log('');

    // Step 3: Simulate undo - restore to ORIGINAL state (all 4 items)
    console.log('3. Pressing UNDO button - should restore ALL deleted items at once!');
    const originalState = [
        { id: id1, text: '1', done: false },
        { id: id2, text: '2', done: false },
        { id: id3, text: '3', done: false },
        { id: todos[0].id, text: '4', done: false }
    ];

    await restoreTodos(originalState);
    todos = await getTodos();
    console.log('After UNDO:', todos.map(t => t.text).join(', '));
    console.log('(All items 1, 2, 3, 4 should be restored!)');
    console.log('');

    // Verify
    const hasAll = ['1', '2', '3', '4'].every(t => todos.map(x => x.text).includes(t));
    console.log('=== Test Result:', hasAll ? '✅ SUCCESS' : '❌ FAILED', '===');
}

runTest().catch(console.error);
