// Test script for edit functionality - testing that editing todo-text
// properly updates the list and respects sort order

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

async function updateTodo(id, updates) {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            ...await getAuthHeaders()
        },
        body: JSON.stringify(updates)
    });
    return await response.json();
}

async function deleteAllTodos() {
    const todos = await getTodos();
    for (const todo of todos) {
        await fetch(`${API_BASE}/${todo.id}`, {
            method: 'DELETE',
            headers: await getAuthHeaders()
        });
    }
}

async function runTests() {
    console.log('=== TODO App Edit Tests ===\n');
    
    // Login first
    console.log('0. Logging in...');
    authToken = await login('todopwa2026');
    console.log('  Logged in successfully\n');

    // Clean up any existing todos
    console.log('1. Cleaning up existing todos...');
    await deleteAllTodos();
    console.log('  Done\n');

    // Test 1: Add todos and edit one
    console.log('2. Adding test todos...');
    await addTodo('Zebra');  // Will be edited to 'Apple'
    await addTodo('Banana');
    await addTodo('Cherry');
    
    let todos = await getTodos();
    console.log('  Initial todos:');
    todos.forEach(t => console.log(`    - ${t.id}: ${t.text} (done: ${t.done}, fav: ${t.favorite})`));
    console.log('');

    // Test 2: Edit the first todo's text
    console.log('3. Editing first todo text from "Zebra" to "Apple"...');
    const todoToEdit = todos[0];
    await updateTodo(todoToEdit.id, { text: 'Apple' });
    
    todos = await getTodos();
    console.log('  After edit:');
    todos.forEach(t => console.log(`    - ${t.id}: ${t.text} (done: ${t.done}, fav: ${t.favorite})`));
    
    // Verify the text was changed
    const editedTodo = todos.find(t => t.id === todoToEdit.id);
    if (editedTodo && editedTodo.text === 'Apple') {
        console.log('  ✓ Text successfully updated to "Apple"\n');
    } else {
        console.log('  ✗ FAILED: Text was not updated correctly\n');
    }

    // Test 3: Test alphabetical sort order after edit
    console.log('4. Testing alphabetical sort order after edit...');
    // When sorted alphabetically, "Apple" should come before "Banana" and "Cherry"
    const sortedByText = [...todos].sort((a, b) => a.text.localeCompare(b.text));
    console.log('  Expected order (alphabetical):');
    sortedByText.forEach(t => console.log(`    - ${t.id}: ${t.text}`));
    
    console.log('  Actual order (from API):');
    todos.forEach(t => console.log(`    - ${t.id}: ${t.text}`));
    
    // Check if Apple is first (it should be in alphabetical order)
    if (todos[0].text === 'Apple') {
        console.log('  ✓ Edit correctly positions item at start (alphabetically)\n');
    } else {
        console.log('  ✗ FAILED: Edited item not in correct alphabetical position\n');
    }

    // Test 4: Edit a todo to change its done status
    console.log('5. Testing edit of done status...');
    const bananaTodo = todos.find(t => t.text === 'Banana');
    await updateTodo(bananaTodo.id, { done: true });
    
    todos = await getTodos();
    console.log('  After marking "Banana" as done:');
    todos.forEach(t => console.log(`    - ${t.id}: ${t.text} (done: ${t.done}, fav: ${t.favorite})`));
    
    // In the default sort, non-completed should come before completed
    const doneTodos = todos.filter(t => t.done);
    const notDoneTodos = todos.filter(t => !t.done);
    if (notDoneTodos.length > 0 && doneTodos.length > 0) {
        const notDoneIndex = todos.indexOf(notDoneTodos[0]);
        const doneIndex = todos.indexOf(doneTodos[0]);
        if (notDoneIndex < doneIndex) {
            console.log('  ✓ Non-completed items correctly appear before completed\n');
        } else {
            console.log('  ✗ FAILED: Completed items should appear after non-completed\n');
        }
    }
    console.log('');

    // Test 5: Edit todo text to empty (should be rejected by backend)
    console.log('5. Testing edit of empty text (should be rejected by backend)...');
    const cherryTodo = todos.find(t => t.text === 'Cherry');
    const originalText = cherryTodo.text;
    
    const emptyEditResponse = await fetch(`${API_BASE}/${cherryTodo.id}`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            ...await getAuthHeaders()
        },
        body: JSON.stringify({ text: '' })
    });
    
    if (emptyEditResponse.status === 400) {
        console.log('  ✓ Empty text edit correctly rejected with 400 status\n');
    } else {
        console.log('  ✗ FAILED: Empty text should be rejected with 400 status\n');
    }
    
    // Verify the original text is still unchanged
    todos = await getTodos();
    const revertedTodo = todos.find(t => t.id === cherryTodo.id);
    if (revertedTodo.text === originalText) {
        console.log('  ✓ Original text preserved after failed edit\n');
    } else {
        console.log('  ✗ FAILED: Original text should be preserved\n');
    }
    console.log('');

    console.log('=== Edit Tests Complete ===');
}

runTests().catch(console.error);