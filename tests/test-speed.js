// Speed/Performance test for Todo PWA

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
    return response.ok;
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
    return response.ok;
}

async function toggleTodo(id, done) {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...await getAuthHeaders()
        },
        body: JSON.stringify({ done })
    });
    return response.ok;
}

async function logout() {
    await fetch(`${AUTH_API}/logout`, {
        method: 'POST',
        headers: await getAuthHeaders()
    });
    authToken = null;
}

async function archiveDatabase() {
    const response = await fetch(`${API_BASE.replace('/api/todos', '')}/api/archive`, {
        method: 'POST',
        headers: await getAuthHeaders()
    });
    return response.ok ? await response.json() : null;
}

function measureTime(name, fn) {
    const start = Date.now();
    return fn().then(result => {
        const elapsed = Date.now() - start;
        console.log(`  ${name}: ${elapsed}ms`);
        return { result, elapsed };
    });
}

async function runSpeedTest() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║    TODO PWA Speed/Performance Test    ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    const testPassword = 'test-speed-' + Date.now();
    console.log(`Using test password: ${testPassword}\n`);
    
    // Login
    console.log('Step 0: Logging in...');
    authToken = await login(testPassword);
    console.log('  Logged in\n');
    
    // Step 1: Add 300 test items - measure first vs last
    console.log('Step 1: Adding 300 test items (first vs last)...');
    
    // Measure first item
    const firstStart = Date.now();
    await addTodo('First Item');
    const firstTime = Date.now() - firstStart;
    console.log(`  First item: ${firstTime}ms`);
    
    // Add 298 more items
    const middlePromises = [];
    for (let i = 2; i <= 299; i++) {
        middlePromises.push(addTodo(`Speed Test Item ${i}`));
    }
    await Promise.all(middlePromises);
    
    // Measure last item
    const lastStart = Date.now();
    await addTodo('Last Item');
    const lastTime = Date.now() - lastStart;
    console.log(`  Last item:  ${lastTime}ms`);
    
    console.log(`  Difference: ${Math.abs(lastTime - firstTime)}ms\n`);
    
    let todos = await getTodos();
    console.log(`  Current count: ${todos.length} todos\n`);
    
    // Step 2: Mark 250 as done - measure per item
    console.log('Step 2: Marking 250 items as done (measuring per item)...');
    let totalToggleTime = 0;
    for (let i = 0; i < 250; i++) {
        const start = Date.now();
        await toggleTodo(todos[i].id, true);
        totalToggleTime += Date.now() - start;
    }
    const avgToggleTime = (totalToggleTime / 250).toFixed(2);
    console.log(`  Total: ${totalToggleTime}ms, Average per item: ${avgToggleTime}ms\n`);
    
    todos = await getTodos();
    const doneCount = todos.filter(t => t.done).length;
    console.log(`  Done items: ${doneCount}\n`);
    
    // Step 3: Delete every 5th item - measure per item
    console.log('Step 3: Deleting every 5th item (measuring per item)...');
    const deleteIds = [];
    for (let i = 0; i < todos.length; i += 5) {
        deleteIds.push(todos[i].id);
    }
    let totalDeleteTime = 0;
    for (const id of deleteIds) {
        const start = Date.now();
        await deleteTodo(id);
        totalDeleteTime += Date.now() - start;
    }
    const avgDeleteTime = (totalDeleteTime / deleteIds.length).toFixed(2);
    console.log(`  Total: ${totalDeleteTime}ms, Average per item: ${avgDeleteTime}ms\n`);
    
    todos = await getTodos();
    console.log(`  Remaining count: ${todos.length} todos\n`);
    
    // Step 4: Add 20 new items - measure per item
    console.log('Step 4: Adding 20 new items (measuring per item)...');
    let totalNewTime = 0;
    for (let i = 1; i <= 20; i++) {
        const start = Date.now();
        await addTodo(`New Item ${i}`);
        totalNewTime += Date.now() - start;
    }
    const avgNewTime = (totalNewTime / 20).toFixed(2);
    console.log(`  Total: ${totalNewTime}ms, Average per item: ${avgNewTime}ms\n`);
    
    todos = await getTodos();
    console.log(`  Final count: ${todos.length} todos\n`);
    
    // Summary
    console.log('╔════════════════════════════════════════╗');
    console.log('║           PERFORMANCE SUMMARY         ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`  Add first item:  ${firstTime}ms`);
    console.log(`  Add last item:   ${lastTime}ms`);
    console.log(`  Toggle 1 item:   ${avgToggleTime}ms (average)`);
    console.log(`  Delete 1 item:   ${avgDeleteTime}ms (average)`);
    console.log(`  ───────────────────────────────────────`);
    console.log(`  Total time:     ${firstTime + lastTime + totalToggleTime + totalDeleteTime + totalNewTime}ms\n`);
    
    // Cleanup
    console.log('Cleaning up...');
    const archiveResult = await archiveDatabase();
    if (archiveResult && archiveResult.success) {
        console.log(`  Database archived: ${archiveResult.archivedFile}`);
    }
    await logout();
    console.log('Done!\n');
    
    process.exit(0);
}

runSpeedTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
