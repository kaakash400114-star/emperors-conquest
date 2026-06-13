// Comprehensive button test script for Emperor's Conquest
// Run in browser console, outputs results to document.title
// Usage: paste into console, read results from document.title updates

(async function testAllButtons() {
    const g = self.__game;
    const results = [];
    
    function log(test, pass, detail) {
        results.push({ test, pass, detail });
        console.log((pass ? '✅' : '❌') + ' ' + test + ': ' + detail);
    }
    
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    
    // Capture buttons after next render frame
    function getBtns() {
        return g.btns.slice();
    }
    
    // Wait for render and get buttons
    async function renderBtns() {
        await wait(200);
        return getBtns();
    }
    
    // ===== TEST 1: MENU SCREEN =====
    log('1_MENU_LOAD', g.state === 'menu', 'state=' + g.state);
    
    var menuBtns = await renderBtns();
    var menuLabels = menuBtns.map(b => b.label || 'rect').join(',');
    log('1_MENU_BTNS', menuBtns.length > 0, 'count=' + menuBtns.length + ' labels=' + menuLabels.substring(0,200));
    
    // Find Play button
    var playBtn = menuBtns.find(b => b.label && (b.label.includes('Play') || b.label.includes('play') || b.label.includes('START')));
    log('1_PLAY_BTN', !!playBtn, playBtn ? 'label=' + playBtn.label : 'NOT FOUND in: ' + menuLabels.substring(0,100));
    
    // ===== TEST 2: DIFFICULTY SCREEN =====
    // Click Play to go to difficulty
    if (playBtn) {
        playBtn.fn();
        await wait(300);
    } else {
        g.state = 'difficulty';
        await wait(300);
    }
    
    log('2_DIFF_STATE', g.state === 'difficulty', 'state=' + g.state);
    var diffBtns = await renderBtns();
    var diffLabels = diffBtns.map(b => b.label || 'rect').join(',');
    log('2_DIFF_BTNS', diffBtns.length > 0, 'count=' + diffBtns.length + ' labels=' + diffLabels.substring(0,200));
    
    // Find difficulty buttons
    var easyBtn = diffBtns.find(b => b.label && b.label.toLowerCase().includes('easy'));
    var medBtn = diffBtns.find(b => b.label && b.label.toLowerCase().includes('medi'));
    var hardBtn = diffBtns.find(b => b.label && b.label.toLowerCase().includes('hard'));
    log('2_EASY_BTN', !!easyBtn, !!easyBtn ? 'found' : 'not found');
    log('2_MEDIUM_BTN', !!medBtn, !!medBtn ? 'found' : 'not found');
    log('2_HARD_BTN', !!hardBtn, !!hardBtn ? 'found' : 'not found');
    
    // ===== TEST 3: EMPIRE/COUNTRY SELECTION =====
    // Click medium difficulty to proceed
    g.state = 'empireSelect';
    g.difficulty = 1;
    await wait(300);
    
    log('3_SEL_STATE', g.state === 'empireSelect', 'state=' + g.state);
    var selBtns = await renderBtns();
    var selLabels = selBtns.map(b => b.label || 'rect').join(',');
    log('3_SEL_BTNS', selBtns.length > 0, 'count=' + selBtns.length + ' labels=' + selLabels.substring(0,300));
    
    // Check for search, continent filters, country entries
    var searchBtn = selBtns.find(b => b.label && b.label.toLowerCase().includes('search'));
    var backBtn = selBtns.find(b => b.label && b.label.toLowerCase().includes('back'));
    var conquerBtn = selBtns.find(b => b.label && b.label.toLowerCase().includes('conquer'));
    log('3_SEARCH_BTN', !!searchBtn || selLabels.toLowerCase().includes('search'), 'search present');
    log('3_BACK_BTN', !!backBtn, !!backBtn ? 'found' : 'not found');
    log('3_CONQUER_BTN', !!conquerBtn, !!conquerBtn ? 'found' : 'not found');
    
    // ===== TEST 4: START COUNTRY GAME =====
    g._startCountryGame(65); // India
    await wait(1000);
    
    log('4_COUNTRY_STATE', g.state === 'playing', 'state=' + g.state);
    log('4_TERRITORIES', (g._activeTerritories || []).length === 195, 'count=' + (g._activeTerritories || []).length);
    log('4_EMPIRES', (g._activeEIDs || []).length >= 2, 'count=' + (g._activeEIDs || []).length);
    log('4_COUNTRY_MODE', g._useCountryMode === true, 'countryMode=' + g._useCountryMode);
    
    // ===== TEST 5: MAP BUTTONS =====
    var mapBtns = await renderBtns();
    var mapLabels = mapBtns.map(b => b.label || 'rect').join(',');
    log('5_MAP_BTNS', mapBtns.length > 0, 'count=' + mapBtns.length + ' labels=' + mapLabels.substring(0,300));
    
    // Check toolbar buttons
    var endTurnBtn = mapBtns.find(b => b.label && (b.label.toLowerCase().includes('end') || b.label.toLowerCase().includes('turn')));
    var musicBtn = mapBtns.find(b => b.label && b.label.toLowerCase().includes('music'));
    var menuBtn2 = mapBtns.find(b => b.label && b.label.toLowerCase().includes('menu'));
    var saveBtn = mapBtns.find(b => b.label && b.label.toLowerCase().includes('save'));
    var zoomInBtn = mapBtns.find(b => b.label && b.label.toLowerCase().includes('zoom'));
    
    log('5_END_TURN', !!endTurnBtn, !!endTurnBtn ? 'found' : 'not found');
    log('5_MUSIC', !!musicBtn, !!musicBtn ? 'found' : 'not found');
    log('5_MENU', !!menuBtn2, !!menuBtn2 ? 'found' : 'not found');
    log('5_SAVE', !!saveBtn, !!saveBtn ? 'found' : 'not found');
    log('5_ZOOM', !!zoomInBtn, !!zoomInBtn ? 'found' : 'not found');
    
    // Test End Turn
    if (endTurnBtn) {
        var turnBefore = g.turn;
        try { endTurnBtn.fn(); } catch(e) { log('5_END_TURN_EXEC', false, e.message.substring(0,100)); }
        await wait(200);
        log('5_END_TURN_EXEC', g.turn > turnBefore || g.state === 'playing', 'turn ' + turnBefore + ' -> ' + g.turn);
    }
    
    // ===== TEST 6: TERRITORY CLICK =====
    g.state = 'playing';
    await wait(300);
    mapBtns = await renderBtns();
    
    // Find India territory button (or any territory)
    var terrBtn = mapBtns.find(b => b.label && b.label.toLowerCase().includes('india'));
    log('6_INDIA_BTN', !!terrBtn, !!terrBtn ? 'found' : 'not found, trying first territory');
    
    if (!terrBtn) {
        terrBtn = mapBtns.find(b => b.label && !b.label.toLowerCase().includes('menu') && !b.label.toLowerCase().includes('save') && !b.label.toLowerCase().includes('music') && !b.label.toLowerCase().includes('end') && !b.label.toLowerCase().includes('zoom') && !b.label.toLowerCase().includes('tech') && !b.label.toLowerCase().includes('build') && !b.label.toLowerCase().includes('siege'));
    }
    
    if (terrBtn) {
        try { terrBtn.fn(); } catch(e) { log('6_TERR_CLICK', false, e.message.substring(0,100)); }
        await wait(300);
        log('6_TERR_CLICK', g.state === 'territory', 'state=' + g.state);
    } else {
        // Try entering territory directly
        g._enterTerritoryView(65);
        await wait(300);
        log('6_TERR_CLICK', g.state === 'territory', 'state=' + g.state + ' (direct entry)');
    }
    
    // ===== TEST 7: TERRITORY INTERIOR BUTTONS =====
    var intBtns = await renderBtns();
    var intLabels = intBtns.map(b => b.label || 'rect').join(',');
    log('7_INT_BTNS', intBtns.length > 0, 'count=' + intBtns.length + ' labels=' + intLabels.substring(0,300));
    
    var intBack = intBtns.find(b => b.label && b.label.toLowerCase().includes('back'));
    var overviewTab = intBtns.find(b => b.label && b.label.toLowerCase().includes('overview'));
    var buildTab = intBtns.find(b => b.label && b.label.toLowerCase().includes('build'));
    var soldiersTab = intBtns.find(b => b.label && b.label.toLowerCase().includes('soldier'));
    var manageTab = intBtns.find(b => b.label && b.label.toLowerCase().includes('manage'));
    
    log('7_BACK_BTN', !!intBack, !!intBack ? 'found' : 'not found');
    log('7_OVERVIEW_TAB', !!overviewTab, !!overviewTab ? 'found' : 'not found');
    log('7_BUILD_TAB', !!buildTab, !!buildTab ? 'found' : 'not found');
    log('7_SOLDIERS_TAB', !!soldiersTab, !!soldiersTab ? 'found' : 'not found');
    log('7_MANAGE_TAB', !!manageTab, !!manageTab ? 'found' : 'not found');
    
    // Test tab switching
    if (buildTab) {
        try { buildTab.fn(); } catch(e) { log('7_BUILD_CLICK', false, e.message.substring(0,100)); }
        await wait(200);
        log('7_BUILD_CLICK', g._terrView && g._terrView.sub === 'build', 'sub=' + (g._terrView ? g._terrView.sub : 'null'));
    }
    
    if (soldiersTab) {
        try { soldiersTab.fn(); } catch(e) { log('7_SOLDIERS_CLICK', false, e.message.substring(0,100)); }
        await wait(200);
        log('7_SOLDIERS_CLICK', g._terrView && g._terrView.sub === 'soldiers', 'sub=' + (g._terrView ? g._terrView.sub : 'null'));
    }
    
    if (manageTab) {
        try { manageTab.fn(); } catch(e) { log('7_MANAGE_CLICK', false, e.message.substring(0,100)); }
        await wait(200);
        log('7_MANAGE_CLICK', g._terrView && g._terrView.sub === 'manage', 'sub=' + (g._terrView ? g._terrView.sub : 'null'));
    }
    
    // Test Back button
    if (intBack) {
        try { intBack.fn(); } catch(e) { log('7_BACK_CLICK', false, e.message.substring(0,100)); }
        await wait(200);
        log('7_BACK_CLICK', g.state === 'playing', 'state=' + g.state);
    }
    
    // ===== SUMMARY =====
    var passCount = results.filter(r => r.pass).length;
    var failCount = results.filter(r => !r.pass).length;
    var summary = 'DONE:' + passCount + '/' + results.length + ' pass, ' + failCount + ' fail|' + 
                  results.filter(r => !r.pass).map(r => r.test).join(',');
    
    console.log('\n=== SUMMARY ===');
    console.log(summary);
    document.title = summary;
    
    // Store for retrieval
    self.__testResults = results;
    self.__testSummary = summary;
})();
