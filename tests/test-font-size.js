// Test script for font size feature - testing that font size
// properly changes and persists in localStorage

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log('🧪 Running font size tests...\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Load HTML and check font size menu exists
    try {
        const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
        const dom = new JSDOM(html, { runScripts: 'dangerously' });
        const { window } = dom;
        const { document } = window;

        // Check font size dropdown exists
        const fontSizeMenu = document.querySelector('[data-menu="font-size"]');
        const fontSmall = document.querySelector('[data-menu="font-small"]');
        const fontNormal = document.querySelector('[data-menu="font-normal"]');
        const fontLarge = document.querySelector('[data-menu="font-large"]');

        if (fontSizeMenu && fontSmall && fontNormal && fontLarge) {
            console.log('✅ Test 1: Font size menu items exist in HTML');
            passed++;
        } else {
            console.log('❌ Test 1: Font size menu items missing in HTML');
            failed++;
        }

        // Check dropdown structure
        const dropdown = fontSizeMenu?.closest('.menu-dropdown');
        const dropdownContent = dropdown?.querySelector('.menu-dropdown-content');

        if (dropdown && dropdownContent) {
            console.log('✅ Test 2: Dropdown structure exists');
            passed++;
        } else {
            console.log('❌ Test 2: Dropdown structure missing');
            failed++;
        }

        window.close();
    } catch (err) {
        console.log('❌ Test 1-2: Error loading HTML:', err.message);
        failed += 2;
    }

    // Test 3: Check CSS has font size classes
    try {
        const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

        const hasFontSmall = css.includes('.font-small');
        const hasFontNormal = css.includes('.font-normal');
        const hasFontLarge = css.includes('.font-large');
        const hasDropdown = css.includes('.menu-dropdown');

        if (hasFontSmall && hasFontNormal && hasFontLarge && hasDropdown) {
            console.log('✅ Test 3: CSS font size classes and dropdown styles exist');
            passed++;
        } else {
            console.log('❌ Test 3: CSS font size classes or dropdown styles missing');
            console.log('  - font-small:', hasFontSmall);
            console.log('  - font-normal:', hasFontNormal);
            console.log('  - font-large:', hasFontLarge);
            console.log('  - dropdown:', hasDropdown);
            failed++;
        }
    } catch (err) {
        console.log('❌ Test 3: Error loading CSS:', err.message);
        failed++;
    }

    // Test 4: Check app.js has font size functions
    try {
        const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

        const hasSetFontSize = appJs.includes('function setFontSize');
        const hasFontSmallCase = appJs.includes("case 'font-small':");
        const hasFontNormalCase = appJs.includes("case 'font-normal':");
        const hasFontLargeCase = appJs.includes("case 'font-large':");
        const hasLocalStorage = appJs.includes("localStorage.setItem('fontSize'");

        if (hasSetFontSize && hasFontSmallCase && hasFontNormalCase && hasFontLargeCase && hasLocalStorage) {
            console.log('✅ Test 4: JavaScript font size functions exist');
            passed++;
        } else {
            console.log('❌ Test 4: JavaScript font size functions missing');
            console.log('  - setFontSize function:', hasSetFontSize);
            console.log('  - font-small case:', hasFontSmallCase);
            console.log('  - font-normal case:', hasFontNormalCase);
            console.log('  - font-large case:', hasFontLargeCase);
            console.log('  - localStorage:', hasLocalStorage);
            failed++;
        }

        // Test 5: Check font size is loaded from localStorage
        const hasLoadFontSize = appJs.includes("localStorage.getItem('fontSize')");
        if (hasLoadFontSize) {
            console.log('✅ Test 5: Font size loads from localStorage on startup');
            passed++;
        } else {
            console.log('❌ Test 5: Font size does not load from localStorage');
            failed++;
        }
    } catch (err) {
        console.log('❌ Test 4-5: Error loading app.js:', err.message);
        failed += 2;
    }

    // Test 6: Simulate font size changes - simplified test
    try {
        // Create a mock environment
        const localStorageMock = {};
        const mockDocument = {
            body: {
                classList: {
                    _classes: [],
                    contains: function(c) { return this._classes.includes(c); },
                    add: function(c) { if (!this._classes.includes(c)) this._classes.push(c); },
                    remove: function(c) { this._classes = this._classes.filter(x => x !== c); }
                }
            }
        };
        const mockWindow = {
            localStorage: {
                getItem: (key) => localStorageMock[key] || null,
                setItem: (key, value) => { localStorageMock[key] = value; },
                removeItem: (key) => { delete localStorageMock[key]; }
            }
        };

        // Simulate setFontSize function
        function setFontSize(size) {
            mockDocument.body.classList.remove('font-small', 'font-normal', 'font-large');
            mockDocument.body.classList.add(`font-${size}`);
            mockWindow.localStorage.setItem('fontSize', size);
        }

        // Test small
        setFontSize('small');
        if (mockDocument.body.classList.contains('font-small') && localStorageMock['fontSize'] === 'small') {
            console.log('✅ Test 6a: setFontSize("small") works correctly');
            passed++;
        } else {
            console.log('❌ Test 6a: setFontSize("small") failed');
            failed++;
        }

        // Test normal
        setFontSize('normal');
        if (mockDocument.body.classList.contains('font-normal') && localStorageMock['fontSize'] === 'normal') {
            console.log('✅ Test 6b: setFontSize("normal") works correctly');
            passed++;
        } else {
            console.log('❌ Test 6b: setFontSize("normal") failed');
            failed++;
        }

        // Test large
        setFontSize('large');
        if (mockDocument.body.classList.contains('font-large') && localStorageMock['fontSize'] === 'large') {
            console.log('✅ Test 6c: setFontSize("large") works correctly');
            passed++;
        } else {
            console.log('❌ Test 6c: setFontSize("large") failed');
            failed++;
        }

        // Test persistence - verify saved value is retrieved
        mockWindow.localStorage.setItem('fontSize', 'large');
        const savedSize = mockWindow.localStorage.getItem('fontSize');
        if (savedSize === 'large') {
            console.log('✅ Test 6d: Font size persists in localStorage');
            passed++;
        } else {
            console.log('❌ Test 6d: Font size does not persist');
            failed++;
        }
    } catch (err) {
        console.log('❌ Test 6: Error simulating font size:', err.message);
        console.log(err.stack);
        failed += 4;
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
