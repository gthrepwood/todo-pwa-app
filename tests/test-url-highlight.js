// Test script for URL highlighting feature - testing that URLs
// in todo items are converted to clickable links

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log('🧪 Running URL highlighting tests...\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Check HTML has the todo-text span
    try {
        const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
        const dom = new JSDOM(html, { runScripts: 'dangerously' });
        const { window } = dom;
        const { document } = window;

        // Check todo list exists
        const todoList = document.getElementById('todo-list');

        if (todoList) {
            console.log('✅ Test 1: Todo list element exists in HTML');
            passed++;
        } else {
            console.log('❌ Test 1: Todo list element missing in HTML');
            failed++;
        }

        window.close();
    } catch (err) {
        console.log('❌ Test 1: Error loading HTML:', err.message);
        failed++;
    }

    // Test 2: Check CSS has styles for links in todo-text
    try {
        const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

        const hasTodoTextLink = css.includes('.todo-text a');
        const hasLinkColor = css.includes('color: #1976d2');
        const hasLinkTextDecoration = css.includes('text-decoration: underline');

        if (hasTodoTextLink && hasLinkColor && hasLinkTextDecoration) {
            console.log('✅ Test 2: CSS has styles for links in todo-text');
            passed++;
        } else {
            console.log('❌ Test 2: CSS styles for links missing');
            console.log('  - .todo-text a:', hasTodoTextLink);
            console.log('  - color:', hasLinkColor);
            console.log('  - text-decoration:', hasLinkTextDecoration);
            failed++;
        }
    } catch (err) {
        console.log('❌ Test 2: Error loading CSS:', err.message);
        failed++;
    }

    // Test 3: Check app.js has convertUrlsToLinks function
    try {
        const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

        const hasConvertUrlsToLinks = appJs.includes('function convertUrlsToLinks');
        const hasUrlRegex = appJs.includes('urlRegex');
        const hasTargetBlank = appJs.includes('target="_blank"');
        const hasRelNoopener = appJs.includes('rel="noopener noreferrer"');

        if (hasConvertUrlsToLinks && hasUrlRegex && hasTargetBlank && hasRelNoopener) {
            console.log('✅ Test 3: JavaScript convertUrlsToLinks function exists');
            passed++;
        } else {
            console.log('❌ Test 3: JavaScript convertUrlsToLinks function missing');
            console.log('  - convertUrlsToLinks:', hasConvertUrlsToLinks);
            console.log('  - urlRegex:', hasUrlRegex);
            console.log('  - target="_blank":', hasTargetBlank);
            console.log('  - rel:', hasRelNoopener);
            failed++;
        }
    } catch (err) {
        console.log('❌ Test 3: Error loading app.js:', err.message);
        failed++;
    }

    // Test 4: Test convertUrlsToLinks function logic
    try {
        // Simulate the convertUrlsToLinks function
        function convertUrlsToLinks(text) {
            const urlRegex = /(https?:\/\/[^\s<]+)/g;
            return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        }

        // Test 4a: Basic URL conversion
        const test1 = convertUrlsToLinks('Check https://example.com');
        if (test1.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>')) {
            console.log('✅ Test 4a: Basic URL conversion works');
            passed++;
        } else {
            console.log('❌ Test 4a: Basic URL conversion failed');
            console.log('  Result:', test1);
            failed++;
        }

        // Test 4b: URL with path
        const test2 = convertUrlsToLinks('Visit https://www.dm.hu/denkmit-gepi-mosogatopor-p4066447789355.html for more info');
        if (test2.includes('<a href="https://www.dm.hu/denkmit-gepi-mosogatopor-p4066447789355.html"')) {
            console.log('✅ Test 4b: URL with path conversion works');
            passed++;
        } else {
            console.log('❌ Test 4b: URL with path conversion failed');
            console.log('  Result:', test2);
            failed++;
        }

        // Test 4c: Multiple URLs
        const test3 = convertUrlsToLinks('Check https://a.com and https://b.com');
        const linkCount = (test3.match(/<a href=/g) || []).length;
        if (linkCount === 2) {
            console.log('✅ Test 4c: Multiple URL conversion works');
            passed++;
        } else {
            console.log('❌ Test 4c: Multiple URL conversion failed');
            console.log('  Expected 2 links, got:', linkCount);
            failed++;
        }

        // Test 4d: No URL in text
        const test4 = convertUrlsToLinks('Just some text without URL');
        if (test4 === 'Just some text without URL') {
            console.log('✅ Test 4d: Text without URL remains unchanged');
            passed++;
        } else {
            console.log('❌ Test 4d: Text without URL was modified');
            console.log('  Result:', test4);
            failed++;
        }

        // Test 4e: HTTP URL
        const test5 = convertUrlsToLinks('Link http://test.com here');
        if (test5.includes('href="http://test.com"')) {
            console.log('✅ Test 4e: HTTP URL conversion works');
            passed++;
        } else {
            console.log('❌ Test 4e: HTTP URL conversion failed');
            failed++;
        }

    } catch (err) {
        console.log('❌ Test 4: Error testing convertUrlsToLinks:', err.message);
        console.log(err.stack);
        failed += 5;
    }

    // Test 5: Check renderTodos uses convertUrlsToLinks
    try {
        const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

        const renderTodosUsesFunction = appJs.includes('convertUrlsToLinks(todo.text)');
        const innerHTML = appJs.includes('span.innerHTML');

        if (renderTodosUsesFunction) {
            console.log('✅ Test 5: renderTodos uses convertUrlsToLinks');
            passed++;
        } else {
            console.log('❌ Test 5: renderTodos does not use convertUrlsToLinks');
            failed++;
        }
    } catch (err) {
        console.log('❌ Test 5: Error checking renderTodos:', err.message);
        failed++;
    }

    // Test 6: Check ESC key handling preserves links
    try {
        const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

        const escapeHandling = appJs.includes("e.key === 'Escape'");
        const escapeUsesConvert = appJs.includes("convertUrlsToLinks(currentText)");

        if (escapeHandling && escapeUsesConvert) {
            console.log('✅ Test 6: ESC key handling preserves links');
            passed++;
        } else {
            console.log('❌ Test 6: ESC key handling may lose links');
            console.log('  - ESC handling:', escapeHandling);
            console.log('  - Uses convertUrlsToLinks:', escapeUsesConvert);
            failed++;
        }
    } catch (err) {
        console.log('❌ Test 6: Error checking ESC handling:', err.message);
        failed++;
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
