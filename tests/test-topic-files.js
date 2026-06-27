// Test script for topic metadata embedded in todos_<hash>.json

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AUTH_API = 'http://localhost:3004/api/auth';
const DATA_DIR = path.join(__dirname, '..', 'backend', 'data');

function getDataHash(topic) {
    return crypto.createHash('sha256').update(topic).digest('hex');
}

async function login(topic) {
    const response = await fetch(`${AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
    });
    const data = await response.json();
    return data;
}

function getTodoFilePath(hash) {
    return path.join(DATA_DIR, `todos_${hash}.json`);
}

function readTodoFile(hash) {
    const filePath = getTodoFilePath(hash);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

async function runTests() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Topic Metadata in todos_<hash>.json  ║');
    console.log('╚════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    // Test 1: New topic embeds topic metadata in todos_<hash>.json
    console.log('Test 1: New topic embeds metadata in todos_<hash>.json');
    try {
        const topic1 = 'test-topic-meta-' + Date.now();
        const expectedHash1 = getDataHash(topic1);
        const result1 = await login(topic1);

        if (result1.isNewTopic !== true) {
            console.log('  ✗ FAIL: Expected isNewTopic=true\n');
            failed++;
        } else {
            const content = readTodoFile(expectedHash1);
            if (!content || !content.hash || !content.topic || !content.createdAt) {
                console.log('  ✗ FAIL: todos file missing metadata fields (hash, topic, createdAt)\n');
                failed++;
            } else if (content.hash !== expectedHash1) {
                console.log('  ✗ FAIL: hash field mismatch\n');
                failed++;
            } else if (content.topic !== topic1) {
                console.log(`  ✗ FAIL: topic field mismatch (expected "${topic1}", got "${content.topic}")\n`);
                failed++;
            } else {
                console.log(`  ✓ PASS: Metadata embedded in todos file\n`);
                passed++;
            }
        }
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}\n`);
        failed++;
    }

    // Test 2: Existing topic preserves metadata on re-login
    console.log('Test 2: Existing topic preserves metadata on re-login');
    try {
        const topic2 = 'test-topic-meta-' + Date.now();
        const expectedHash2 = getDataHash(topic2);
        const result2a = await login(topic2);
        const originalContent = readTodoFile(expectedHash2);

        await new Promise(r => setTimeout(r, 1100));

        const result2b = await login(topic2);

        if (result2b.isNewTopic !== false) {
            console.log('  ✗ FAIL: Expected isNewTopic=false for existing topic\n');
            failed++;
        } else {
            const newContent = readTodoFile(expectedHash2);
            if (newContent.topic !== topic2) {
                console.log(`  ✗ FAIL: topic metadata not preserved\n`);
                failed++;
            } else if (newContent.hash !== expectedHash2) {
                console.log('  ✗ FAIL: hash metadata not preserved\n');
                failed++;
            } else {
                console.log('  ✓ PASS: Metadata preserved after re-login\n');
                passed++;
            }
        }
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}\n`);
        failed++;
    }

    // Test 3: Metadata survives todo save operations
    console.log('Test 3: Metadata survives todo save operations');
    try {
        const topic3 = 'test-topic-meta-save-' + Date.now();
        const expectedHash3 = getDataHash(topic3);
        const result3 = await login(topic3);
        
        if (result3.isNewTopic !== true) {
            console.log('  ✗ FAIL: Expected isNewTopic=true\n');
            failed++;
        } else {
            // Add a todo to trigger a save
            const authToken = result3.token;
            await fetch('http://localhost:3004/api/todos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ text: 'test metadata save' })
            });
            await new Promise(r => setTimeout(r, 500));

            const content = readTodoFile(expectedHash3);
            if (!content || !content.hash || !content.topic || !content.createdAt) {
                console.log('  ✗ FAIL: Metadata lost after todo save\n');
                failed++;
            } else if (content.topic !== topic3) {
                console.log('  ✗ FAIL: topic name lost after save\n');
                failed++;
            } else {
                console.log('  ✓ PASS: Metadata preserved after todo operations\n');
                passed++;
            }
        }
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}\n`);
        failed++;
    }

    // Summary
    console.log('╔════════════════════════════════════════╗');
    console.log('║              RESULTS                   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total:  ${passed + failed}\n`);

    if (failed > 0) {
        console.log('❌ Some tests failed.\n');
        process.exit(1);
    } else {
        console.log('🎉 All metadata tests passed!\n');
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
});
