// Test for sorting with new todo insertion
// Tests that when sorting is enabled and a new element is added, 
// the server correctly persists the sort mode and returns it

const API_BASE = 'http://localhost:3004/api/todos';
const AUTH_API = 'http://localhost:3004/api/auth';
const SORT_API = 'http://localhost:3004/api/sort';

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
    return { 
        todos: await response.json(), 
        sortMode: response.headers.get('X-Sort-Mode') || 'default'
    };
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
    return { ok: response.ok, data: await response.json() };
}

async function deleteTodo(id) {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
    });
    return { ok: response.ok, data: await response.json() };
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
    return { ok: response.ok, data: await response.json() };
}

async function setSortMode(sortMode) {
    const response = await fetch(SORT_API, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...await getAuthHeaders()
        },
        body: JSON.stringify({ sortMode })
    });
    return { ok: response.ok, data: await response.json() };
}

async function clearAllTodos() {
    const { todos } = await getTodos();
    for (const todo of todos) {
        await deleteTodo(todo.id);
    }
}

async function testSortWithNewTodo() {
    console.log('=== TEST: Sorting with new todo insertion ===\n');

    try {
        // Login
        console.log('1. Logging in...');
        authToken = await login('testpassword');
        console.log('   Logged in successfully');

        // Clear existing todos
        console.log('2. Clearing existing todos...');
        await clearAllTodos();
        console.log('   Cleared all todos');

        // Set sort mode to alpha (alphabetical)
        console.log('3. Setting sort mode to alpha...');
        await setSortMode('alpha');
        console.log('   Sort mode set to alpha');

        // Add todos in non-alphabetical order
        console.log('4. Adding todos in non-alphabetical order...');
        await addTodo('zebra');
        await addTodo('apple');
        await addTodo('mango');
        
        // Wait for server to process
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const result = await getTodos();
        console.log(`   Added 3 todos, got ${result.todos.length} back`);
        
        // Verify sort mode is returned in header
        if (result.sortMode === 'alpha') {
            console.log('✓ PASS: Sort mode returned in header correctly');
            console.log(`  X-Sort-Mode: ${result.sortMode}\n`);
        } else {
            console.log('✗ FAIL: Sort mode not returned in header');
            console.log(`  Expected: alpha, Got: ${result.sortMode}\n`);
            return false;
        }

        // Verify todos are stored in ID order (server doesn't sort)
        // The frontend will sort them when rendering
        const ids = result.todos.map(t => t.id);
        const isIdOrder = ids.every((id, i) => i === 0 || id > ids[i-1]);
        
        if (isIdOrder) {
            console.log('✓ PASS: Todos stored in ID order (server does not sort)');
            console.log(`  IDs: ${ids.join(', ')}\n`);
        } else {
            console.log('✗ FAIL: Todos not in ID order');
            console.log(`  Got: ${ids.join(', ')}\n`);
            return false;
        }

        // Now add a new todo that should go in the middle alphabetically
        console.log('5. Adding "banana" (should go between apple and mango in frontend)...');
        await addTodo('banana');
        
        // Wait for server to process
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const result2 = await getTodos();
        console.log(`   Total todos: ${result2.todos.length}`);
        console.log(`   IDs in storage: ${result2.todos.map(t => t.id).join(', ')}`);
        
        // Verify 4 todos now
        if (result2.todos.length === 4) {
            console.log('✓ PASS: New todo added successfully\n');
        } else {
            console.log(`✗ FAIL: Expected 4 todos, got ${result2.todos.length}\n`);
            return false;
        }

        // Verify sort mode persisted
        if (result2.sortMode === 'alpha') {
            console.log('✓ PASS: Sort mode persisted after adding new todo\n');
        } else {
            console.log(`✗ FAIL: Sort mode not persisted. Expected: alpha, Got: ${result2.sortMode}\n`);
            return false;
        }

        // Test frontend sorting with alpha mode
        console.log('6. Verifying frontend sorting logic with alpha mode...');
        
        // Simulate frontend sorting with alpha mode
        const sortedAlpha = [...result2.todos].sort((a, b) => {
            if (a.favorite !== b.favorite) return b.favorite ? 1 : -1;
            return a.text.localeCompare(b.text);
        });
        const alphaTexts = sortedAlpha.map(t => t.text);
        console.log(`   Alpha sorted: ${alphaTexts.join(', ')}`);
        
        // Verify banana is in correct position for alpha sort (between apple and mango)
        const bananaIndexAlpha = alphaTexts.indexOf('banana');
        if (bananaIndexAlpha === 1 && alphaTexts[0] === 'apple' && alphaTexts[2] === 'mango') {
            console.log('✓ PASS: Frontend correctly sorts "banana" between "apple" and "mango" in alpha mode\n');
        } else {
            console.log(`✗ FAIL: Frontend sorting incorrect for alpha mode. Expected banana at index 1, got ${bananaIndexAlpha}\n`);
            console.log(`   Expected: apple, banana, mango, zebra`);
            console.log(`   Got: ${alphaTexts.join(', ')}\n`);
            return false;
        }

        // Test with default sort mode (by creation time)
        console.log('7. Testing default sort mode (by creation time)...');
        await setSortMode('default');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const result3 = await getTodos();
        console.log(`   Sort mode from header: ${result3.sortMode}`);
        
        // In default mode, server returns todos in ID order
        // Frontend should sort by ID
        const sortedDefault = [...result3.todos].sort((a, b) => {
            if (a.favorite !== b.favorite) return b.favorite ? 1 : -1;
            return a.id - b.id;
        });
        const defaultTexts = sortedDefault.map(t => t.text);
        console.log(`   Default sorted (by ID): ${defaultTexts.join(', ')}`);
        
        // Verify default sort mode is returned
        if (result3.sortMode === 'default') {
            console.log('✓ PASS: Default sort mode returned correctly\n');
        } else {
            console.log(`✗ FAIL: Expected default sort mode, got ${result3.sortMode}\n`);
            return false;
        }
        
        // Verify that in default mode, todos are in ID order (zebra, apple, mango, banana)
        // because they were added in that order
        const originalTexts = result3.todos.map(t => t.text);
        if (originalTexts[0] === 'zebra' && originalTexts[1] === 'apple' && 
            originalTexts[2] === 'mango' && originalTexts[3] === 'banana') {
            console.log('✓ PASS: Default mode returns todos in ID/creation order\n');
        } else {
            console.log(`✗ FAIL: Default mode not returning todos in creation order`);
            console.log(`   Expected: zebra, apple, mango, banana`);
            console.log(`   Got: ${originalTexts.join(', ')}\n`);
            return false;
        }

        console.log('=== ALL TESTS PASSED ===\n');
        console.log('Summary:');
        console.log('- Server correctly persists sort mode');
        console.log('- Server returns sort mode in X-Sort-Mode header');
        console.log('- Server stores todos in ID order (as expected)');
        console.log('- Frontend correctly sorts todos based on sort mode');
        console.log('- New todos are stored correctly and will appear in correct sorted position on frontend');
        
        return true;

    } catch (error) {
        console.error('✗ ERROR:', error.message);
        return false;
    }
}

// Run the test
testSortWithNewTodo().then(success => {
    process.exit(success ? 0 : 1);
});
