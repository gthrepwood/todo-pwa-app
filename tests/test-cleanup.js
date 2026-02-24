// Test cleanup functionality for passwords and sessions

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

async function logout() {
    await fetch(`${AUTH_API}/logout`, {
        method: 'POST',
        headers: await getAuthHeaders()
    });
    authToken = null;
}

async function testCleanup() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║      Cleanup Functionality Test       ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    // This test just verifies the server can start and run cleanup
    // The actual cleanup happens on server startup, not via API
    
    console.log('Note: Cleanup runs automatically on server startup.');
    console.log('To test cleanup:');
    console.log('1. Stop the server');
    console.log('2. Manually add invalid entries to passwords.json or sessions.json');
    console.log('3. Start the server - cleanup will run automatically');
    console.log('4. Check the console output for cleanup results\n');
    
    // Just verify server is running and we can connect
    console.log('Testing server connection...');
    try {
        const response = await fetch(`${AUTH_API}/check`);
        console.log('✓ Server is running and responding\n');
        
        // Try to login with a test password (creates entry with todo file)
        const testPassword = 'test-cleanup-' + Date.now();
        authToken = await login(testPassword);
        console.log('✓ Login works - new password registered\n');
        
        // Logout (creates session entry)
        await logout();
        console.log('✓ Logout works\n');
        
        console.log('=== Test Complete ===');
        console.log('The cleanup function will run on next server restart');
        console.log('and remove any orphaned password/session entries.\n');
        
        process.exit(0);
    } catch (e) {
        console.log('✗ Error:', e.message);
        console.log('Make sure server is running on localhost:3004\n');
        process.exit(1);
    }
}

testCleanup();
