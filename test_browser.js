import puppeteer from 'puppeteer';

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set viewport to standard 960x640
    await page.setViewport({ width: 960, height: 640 });

    page.on('console', msg => {
        console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });

    page.on('pageerror', err => {
        console.error('[BROWSER EXCEPTION]', err);
    });

    console.log('Navigating to http://localhost:9001...');
    await page.goto('http://localhost:9001', { waitUntil: 'networkidle0' });

    console.log('Waiting 2 seconds for menu to settle...');
    await new Promise(r => setTimeout(r, 2000));

    // 1. Click "Start" on main menu
    console.log('Clicking "Start" button...');
    await page.mouse.click(394, 559);
    await new Promise(r => setTimeout(r, 800));

    // 2. Click "Classic Empire" card on modeSelect screen
    // Classic Empire card is at left: startX is around 180, Y is around 280. Click (320, 400).
    console.log('Clicking "Classic Empire" mode...');
    await page.mouse.click(320, 400);
    await new Promise(r => setTimeout(r, 800));

    // 3. Click "Normal" difficulty card on selectDifficulty screen
    // Easy is left, Normal is center, Hard is right. Click center (480, 400).
    console.log('Clicking "Normal" difficulty...');
    await page.mouse.click(480, 400);
    await new Promise(r => setTimeout(r, 800));

    // 4. Click first empire (Maurya) on empireSelect screen
    // First card center is at x: 148, y: 267. Click there.
    console.log('Selecting first empire...');
    await page.mouse.click(148, 267);
    await new Promise(r => setTimeout(r, 2000)); // wait for curtain transition

    // 5. We are now in gameplay!
    // Let's click on a territory center.
    // Anatolia is at cx: 520, cy: 240. Let's click it.
    console.log('Clicking Anatolia at (520, 240)...');
    await page.mouse.click(520, 240);

    // Wait to capture error logs
    await new Promise(r => setTimeout(r, 2000));

    console.log('Closing browser.');
    await browser.close();
})().catch(err => {
    console.error('Test script failed:', err);
});
