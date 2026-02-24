// Test script for undo functionality with Unicode, emojis and special characters

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

async function runTests() {
    console.log('=== TODO App Undo Tests (Unicode, Emojis, Special Characters) ===\n');
    
    // Login first
    console.log('0. Logging in...');
    authToken = await login('todopwa2026');
    console.log('  Logged in successfully\n');

    // Test 1: Add todos with Unicode, emojis and special characters
    console.log('1. Adding test todos with special characters...');
    await addTodo('🎉 Birthday 🎂');
    await addTodo('🐱 Cat 🐱');
    await addTodo('Accents: áéíóúüőű');
    await addTodo('Special: @#$%^&*()');
    await addTodo('Emoji: 😀😂🥰🔥💯');
    // Multilingual tests
    await addTodo('Chinese: 你好世界 🇨🇳');          // Chinese: Hello World
    await addTodo('Urdu: ہیلو دنیا 🇵🇰');            // Urdu: Hello World
    await addTodo('Japanese: こんにちは世界 🇯🇵');    // Japanese: Hello World
    await addTodo('Hindi: नमस्ते दुनिया 🇮🇳');       // Hindi: Hello World
    await addTodo('Hebrew: שלום עולם 🇮🇱');          // Hebrew: Hello World
    await addTodo('Arabic: مرحبا بالعالم 🇸🇦');      // Arabic: Hello World

    let todos = await getTodos();
    console.log('Current todos:', todos.length);
    todos.forEach(t => console.log(`  - ${t.id}: ${t.text}`));
    console.log('');

    // Test 2: Delete two todos
    console.log('2. Deleting two todos...');
    const idToDelete1 = todos[0].id;
    const idToDelete2 = todos[1].id;
    console.log(`  Deleting id=${idToDelete1} and id=${idToDelete2}`);

    await deleteTodo(idToDelete1);
    await deleteTodo(idToDelete2);

    todos = await getTodos();
    console.log('After deletion:', todos.length, 'todos');
    console.log('');

    // Test 3: First undo (should restore the second deleted item)
    console.log('3. First undo - restoring last deleted item...');
    const stateAfterFirstDelete = [
        ...todos,
        { id: idToDelete2, text: todos[0]?.text || '🎉 Birthday 🎂', done: false }
    ];

    await restoreTodos(stateAfterFirstDelete);
    todos = await getTodos();
    console.log('After first undo:', todos.length, 'todos');
    console.log('');

    // Test 4: Second undo (should restore the first deleted item)
    console.log('4. Second undo - restoring first deleted item...');
    const stateBeforeAnyDelete = [
        ...todos,
        { id: idToDelete1, text: '🎉 Birthday 🎂', done: false }
    ];

    await restoreTodos(stateBeforeAnyDelete);
    todos = await getTodos();
    console.log('After second undo (all restored):', todos.length, 'todos');
    console.log('');

    // Test 5: Toggle todo and undo
    console.log('5. Toggle test (mark as done and undo)...');
    const todoToToggle = todos.find(t => t.text.includes('Macska'));
    if (todoToToggle) {
        console.log(`  Toggling id=${todoToToggle.id}: ${todoToToggle.text}`);
        await fetch(`${API_BASE}/${todoToToggle.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ done: true })
        });

        let toggledTodos = await getTodos();
        const toggled = toggledTodos.find(t => t.id === todoToToggle.id);
        console.log(`  After toggle: done=${toggled.done}`);

        // Undo toggle
        await restoreTodos(toggledTodos.map(t =>
            t.id === todoToToggle.id ? { ...t, done: false } : t
        ));

        toggledTodos = await getTodos();
        const restored = toggledTodos.find(t => t.id === todoToToggle.id);
        console.log(`  After undo: done=${restored.done}`);
    }
    console.log('');

    console.log('=== Tests Complete ===');
}

runTests().catch(console.error);
