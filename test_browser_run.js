import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 960, height: 640 });

    page.on('console', msg => {
        console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });

    page.on('pageerror', err => {
        console.error('[BROWSER EXCEPTION]', err);
    });

    console.log('Navigating to http://localhost:9001...');
    await page.goto('http://localhost:9001', { waitUntil: 'networkidle0' });

    console.log('Waiting for game to load...');
    await new Promise(r => setTimeout(r, 2000));

    // Read and evaluate test_buttons.js
    console.log('Loading test_buttons.js...');
    const testScriptContent = fs.readFileSync('test_buttons.js', 'utf8');
    
    console.log('Running test_buttons.js inside page...');
    await page.evaluate(testScriptContent);

    // Wait for tests to finish (check document.title for DONE)
    let summary = '';
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        summary = await page.title();
        if (summary.startsWith('DONE:')) {
            break;
        }
    }

    console.log('Test Summary:', summary);

    console.log('Closing browser.');
    await browser.close();
})().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
