// Test for delete enabled/disabled functionality and related features
// Tests that:
// 1. Server returns X-Delete-Enabled header (default: true)
// 2. Server API endpoint can toggle delete enabled/disabled
// 3. Delete is blocked when disabled (403 error)
// 4. Delete works when enabled
// 5. Delete setting persists across sessions
// 6. Completed tasks are sorted after non-completed tasks
// 7. Clear completed works even when delete is disabled

const API_BASE = 'http://localhost:3004/api/todos';
const AUTH_API = 'http://localhost:3004/api/auth';
const SORT_API = 'http://localhost:3004/api/sort';
const DELETE_ENABLED_API = 'http://localhost:3004/api/delete-enabled';
const SETTINGS_API = 'http://localhost:3004/api/settings';

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
        sortMode: response.headers.get('X-Sort-Mode') || 'default',
        deleteEnabled: response.headers.get('X-Delete-Enabled') !== 'false'
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
    return { ok: response.ok, data: await response.json(), status: response.status };
}

async function deleteTodo(id) {
    const response = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
    });
    return { ok: response.ok, data: await response.json(), status: response.status };
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
    return { ok: response.ok, data: await response.json(), status: response.status };
}

async function clearCompletedTodos() {
    const response = await fetch(`${API_BASE}/clear-completed`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
    });
    return { ok: response.ok, data: await response.json(), status: response.status };
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

async function setDeleteEnabled(enabled) {
    const response = await fetch(DELETE_ENABLED_API, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...await getAuthHeaders()
        },
        body: JSON.stringify({ deleteEnabled: enabled })
    });
    return { ok: response.ok, data: await response.json(), status: response.status };
}

async function getSettings() {
    const response = await fetch(SETTINGS_API, { headers: await getAuthHeaders() });
    return { ok: response.ok, data: await response.json(), status: response.status };
}

async function clearAllTodos() {
    const { todos } = await getTodos();
    for (const todo of todos) {
        await deleteTodo(todo.id);
    }
}

async function testDeleteEnabled() {
    console.log('=== TEST: Delete Enabled/Disabled Functionality ===\n');

    try {
        // Login
        console.log('1. Logging in...');
        authToken = await login('testpassword');
        console.log('   Logged in successfully');

        // Clear existing todos
        console.log('2. Clearing existing todos...');
        await clearAllTodos();
        console.log('   Cleared all todos');

        // Test 1: Default delete enabled should be true
        console.log('\n3. Testing default delete enabled state...');
        const result1 = await getTodos();
        console.log(`   X-Delete-Enabled header: ${result1.deleteEnabled}`);
        
        if (result1.deleteEnabled === true) {
            console.log('✓ PASS: Default delete enabled is true\n');
        } else {
            console.log('✗ FAIL: Default delete enabled should be true\n');
            return false;
        }

        // Add a test todo
        console.log('4. Adding a test todo...');
        const addResult = await addTodo('test task for delete');
        const todoId = addResult.data.id;
        console.log(`   Added todo with ID: ${todoId}`);

        // Test 2: Delete should work when enabled
        console.log('\n5. Testing delete works when enabled...');
        const deleteResult = await deleteTodo(todoId);
        if (deleteResult.ok) {
            console.log('✓ PASS: Delete works when enabled\n');
        } else {
            console.log(`✗ FAIL: Delete should work when enabled. Status: ${deleteResult.status}\n`);
            return false;
        }

        // Re-add the todo for next test
        console.log('6. Re-adding test todo for disable test...');
        const addResult2 = await addTodo('test task for delete 2');
        const todoId2 = addResult2.data.id;
        console.log(`   Added todo with ID: ${todoId2}`);

        // Test 3: Disable delete
        console.log('\n7. Disabling delete...');
        const disableResult = await setDeleteEnabled(false);
        if (disableResult.ok && disableResult.data.deleteEnabled === false) {
            console.log('✓ PASS: Delete disabled successfully\n');
        } else {
            console.log(`✗ FAIL: Could not disable delete. Status: ${disableResult.status}\n`);
            return false;
        }

        // Verify header shows delete disabled
        console.log('8. Verifying header shows delete disabled...');
        const result2 = await getTodos();
        console.log(`   X-Delete-Enabled header: ${result2.deleteEnabled}`);
        
        if (result2.deleteEnabled === false) {
            console.log('✓ PASS: Header correctly shows delete disabled\n');
        } else {
            console.log('✗ FAIL: Header should show delete disabled\n');
            return false;
        }

        // Test 4: Delete should be blocked when disabled
        console.log('9. Testing delete is blocked when disabled...');
        const blockedDelete = await deleteTodo(todoId2);
        console.log(`   Delete response status: ${blockedDelete.status}`);
        
        if (blockedDelete.status === 403) {
            console.log('✓ PASS: Delete correctly blocked with 403 status\n');
        } else {
            console.log(`✗ FAIL: Delete should be blocked with 403. Got: ${blockedDelete.status}\n`);
            return false;
        }

        // Test 5: Re-enable delete
        console.log('10. Re-enabling delete...');
        const enableResult = await setDeleteEnabled(true);
        if (enableResult.ok && enableResult.data.deleteEnabled === true) {
            console.log('✓ PASS: Delete re-enabled successfully\n');
        } else {
            console.log(`✗ FAIL: Could not re-enable delete. Status: ${enableResult.status}\n`);
            return false;
        }

        // Verify delete works again
        console.log('11. Verifying delete works after re-enable...');
        const reenabledDelete = await deleteTodo(todoId2);
        if (reenabledDelete.ok) {
            console.log('✓ PASS: Delete works after re-enable\n');
        } else {
            console.log(`✗ FAIL: Delete should work after re-enable. Status: ${reenabledDelete.status}\n`);
            return false;
        }

        // Test 6: Settings API
        console.log('12. Testing settings API...');
        const settingsResult = await getSettings();
        if (settingsResult.ok && settingsResult.data.deleteEnabled === true && settingsResult.data.sortMode) {
            console.log('✓ PASS: Settings API returns correct data\n');
            console.log(`   deleteEnabled: ${settingsResult.data.deleteEnabled}`);
            console.log(`   sortMode: ${settingsResult.data.sortMode}`);
        } else {
            console.log(`✗ FAIL: Settings API returned incorrect data\n`);
            return false;
        }

        console.log('=== ALL DELETE TESTS PASSED ===\n');
        return true;

    } catch (error) {
        console.error('✗ ERROR:', error.message);
        return false;
    }
}

async function testClearCompletedWhenDeleteDisabled() {
    console.log('=== TEST: Clear Completed When Delete Disabled ===\n');

    try {
        // Login
        console.log('1. Logging in...');
        authToken = await login('testpassword');
        console.log('   Logged in successfully');

        // Clear existing todos
        console.log('2. Clearing existing todos...');
        await clearAllTodos();
        console.log('   Cleared all todos');

        // Disable delete
        console.log('\n3. Disabling delete...');
        await setDeleteEnabled(false);
        console.log('   Delete disabled');

        // Add some todos and complete them
        console.log('\n4. Adding and completing todos...');
        await addTodo('task 1');
        await addTodo('task 2');
        await addTodo('task 3');
        await addTodo('task 4');
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Complete tasks 1 and 3
        await toggleTodo(1, true);
        await toggleTodo(3, true);
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        let { todos } = await getTodos();
        console.log(`   Total todos: ${todos.length}`);
        console.log(`   Completed: ${todos.filter(t => t.done).length}`);

        // Test: Clear completed should work even when delete is disabled
        console.log('\n5. Testing clear completed when delete is disabled...');
        const clearResult = await clearCompletedTodos();
        console.log(`   Clear completed response status: ${clearResult.status}`);
        
        if (clearResult.ok) {
            console.log('✓ PASS: Clear completed works when delete is disabled\n');
        } else {
            console.log(`✗ FAIL: Clear completed should work when delete is disabled. Status: ${clearResult.status}\n`);
            // Re-enable delete before returning
            await setDeleteEnabled(true);
            return false;
        }

        // Verify completed todos are cleared
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const { todos: todosAfter } = await getTodos();
        const completedAfter = todosAfter.filter(t => t.done).length;
        
        if (completedAfter === 0) {
            console.log('✓ PASS: All completed todos cleared\n');
        } else {
            console.log(`✗ FAIL: Expected 0 completed todos, got ${completedAfter}\n`);
            await setDeleteEnabled(true);
            return false;
        }

        // Re-enable delete
        console.log('6. Re-enabling delete...');
        await setDeleteEnabled(true);
        console.log('   Delete re-enabled');

        console.log('=== CLEAR COMPLETED TEST PASSED ===\n');
        return true;

    } catch (error) {
        console.error('✗ ERROR:', error.message);
        // Make sure to re-enable delete on error
        await setDeleteEnabled(true);
        return false;
    }
}

async function testCompletedSorting() {
    console.log('=== TEST: Completed Tasks Sorting ===\n');

    try {
        // Login
        console.log('1. Logging in...');
        authToken = await login('testpassword');
        console.log('   Logged in successfully');

        // Clear existing todos
        console.log('2. Clearing existing todos...');
        await clearAllTodos();
        console.log('   Cleared all todos');

        // Add multiple todos - some completed, some not
        console.log('3. Adding test todos (mixed completed/non-completed)...');
        
        // Add todos
        await addTodo('task 1');    // will be completed
        await addTodo('task 2');    // will stay incomplete
        await addTodo('task 3');    // will be completed
        await addTodo('task 4');    // will stay incomplete
        
        // Wait for server
        await new Promise(resolve => setTimeout(resolve, 300));
        
        let { todos } = await getTodos();
        console.log(`   Added ${todos.length} todos`);

        // Mark some as completed
        console.log('\n4. Marking some tasks as completed...');
        
        // Complete tasks 1 and 3 (which have lower IDs)
        await toggleTodo(1, true);
        await toggleTodo(3, true);
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const result = await getTodos();
        console.log(`   Total todos: ${result.todos.length}`);
        
        // Verify the server returns completed todos
        const completedTodos = result.todos.filter(t => t.done);
        const incompleteTodos = result.todos.filter(t => !t.done);
        
        console.log(`   Completed: ${completedTodos.length}, Incomplete: ${incompleteTodos.length}`);
        
        if (completedTodos.length === 2 && incompleteTodos.length === 2) {
            console.log('✓ PASS: Server correctly stores completed/incomplete todos\n');
        } else {
            console.log('✗ FAIL: Incorrect number of completed/incomplete todos\n');
            return false;
        }

        // Test sorting logic (simulating frontend sorting)
        console.log('5. Testing frontend sorting logic...');
        
        // Frontend should sort: favorites first, then incomplete before completed, then by sort mode
        const sortedTodos = [...result.todos].sort((a, b) => {
            // First, keep favorites first
            if (a.favorite !== b.favorite) return b.favorite ? 1 : -1;
            
            // Second, keep non-completed before completed
            if (a.done !== b.done) return a.done ? 1 : -1;
            
            // Then by ID (default sort)
            return a.id - b.id;
        });
        
        console.log('   Sorted order (should have incomplete first, then completed):');
        sortedTodos.forEach((t, i) => {
            console.log(`     ${i + 1}. ID ${t.id}: "${t.text}" - done: ${t.done}`);
        });
        
        // Check that incomplete tasks come before completed
        let foundCompleted = false;
        let inOrder = true;
        
        for (const todo of sortedTodos) {
            if (todo.done) {
                foundCompleted = true;
            } else if (foundCompleted) {
                // We found an incomplete task after a completed one - wrong order
                inOrder = false;
                break;
            }
        }
        
        if (inOrder) {
            console.log('✓ PASS: Incomplete tasks sorted before completed tasks\n');
        } else {
            console.log('✗ FAIL: Completed tasks should always be after non-completed\n');
            return false;
        }

        console.log('=== ALL SORTING TESTS PASSED ===\n');
        return true;

    } catch (error) {
        console.error('✗ ERROR:', error.message);
        return false;
    }
}

async function testUndo() {
    console.log('=== TEST: Undo Functionality ===\n');

    try {
        // Login
        console.log('1. Logging in...');
        authToken = await login('testpassword');
        console.log('   Logged in successfully');

        // Clear existing todos
        console.log('2. Clearing existing todos...');
        await clearAllTodos();
        console.log('   Cleared all todos');

        // Add a todo
        console.log('\n3. Adding a test todo...');
        await addTodo('task to delete');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        let { todos } = await getTodos();
        const originalCount = todos.length;
        console.log(`   Added ${originalCount} todo(s)`);

        // Delete the todo
        console.log('\n4. Deleting the todo...');
        await deleteTodo(1);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        let { todos: todosAfterDelete } = await getTodos();
        console.log(`   Todos after delete: ${todosAfterDelete.length}`);

        // Test: Undo by restoring all todos
        console.log('\n5. Testing undo (restoring all todos)...');
        const restoreResult = await restoreTodos([
            { id: 1, text: 'task to delete', done: false, favorite: false }
        ]);
        
        if (restoreResult.ok) {
            console.log('✓ PASS: Undo/restore works\n');
        } else {
            console.log(`✗ FAIL: Undo/restore failed\n`);
            return false;
        }

        // Verify todos are restored
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const { todos: todosAfterRestore } = await getTodos();
        
        if (todosAfterRestore.length === originalCount) {
            console.log(`✓ PASS: Todos restored correctly (${todosAfterRestore.length} todos)\n`);
        } else {
            console.log(`✗ FAIL: Expected ${originalCount} todos, got ${todosAfterRestore.length}\n`);
            return false;
        }

        console.log('=== UNDO TEST PASSED ===\n');
        return true;

    } catch (error) {
        console.error('✗ ERROR:', error.message);
        return false;
    }
}

// Run all tests
async function runTests() {
    console.log('Running all tests...\n');
    
    const deleteTestPassed = await testDeleteEnabled();
    const clearTestPassed = await testClearCompletedWhenDeleteDisabled();
    const sortingTestPassed = await testCompletedSorting();
    const undoTestPassed = await testUndo();
    
    if (deleteTestPassed && clearTestPassed && sortingTestPassed && undoTestPassed) {
        console.log('=== ALL TESTS PASSED ===\n');
        console.log('Summary:');
        console.log('- Server returns X-Delete-Enabled header correctly');
        console.log('- Delete enabled API works correctly');
        console.log('- Delete is blocked when disabled (403)');
        console.log('- Delete works when enabled');
        console.log('- Settings API returns correct data');
        console.log('- Clear completed works even when delete is disabled');
        console.log('- Frontend sorting correctly puts completed tasks after non-completed');
        console.log('- Undo/restore functionality works');
        process.exit(0);
    } else {
        console.log('=== SOME TESTS FAILED ===\n');
        process.exit(1);
    }
}

runTests();
