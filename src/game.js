/**
 * game.js — The Game Engine (Orchestrator)
 *
 * This is the brain of the game. It manages:
 *   - Game state machine (menu → empireSelect → playing → gameover)
 *   - Turn phases (income → recruit → move → attack → endTurn)
 *   - Empire data (territories, gold, troops)
 *   - AI turns with animated playback
 *   - Victory / defeat conditions
 *
 * ARCHITECTURE: This file coordinates — it doesn't draw or play sounds.
 * It tells the renderer WHAT to draw, the audio WHEN to play, and the
 * input system HOW to route clicks. Each module does one thing.
 */

import { TERRITORIES, EMPIRES, EMPIRE_IDS, STARTING_POSITIONS, NEUTRAL_TERRITORIES, getTerritory, areAdjacent, getNeighbors, getEmpire } from './map.js';
import { resolveCombat } from './combat.js';
import { AI } from './ai.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Audio } from './audio.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Canvas sizing
        this.width = 0;
        this.height = 0;
        this._resize();
        window.addEventListener('resize', () => this._resize());

        // ── Game state ──
        this.state = 'menu'; // menu | empireSelect | playing | battle | gameover | victory
        this.phase = 'selectTerritory'; // selectTerritory | selectMoveTarget | selectAttackTarget
        this.playerEmpire = null;
        this.turnNumber = 0;

        // ── Empire runtime data ──
        this.empires = {};
        this.tStates = {}; // territory states: { owner: empireId|null, troops: N }

        // ── Selection ──
        this.selectedTerritory = null;
        this.hoveredTerritory = null;

        // ── AI playback ──
        this.aiActions = [];
        this.aiActionIndex = 0;
        this.aiTimer = 0;
        this.aiDelay = 40; // frames between AI actions

        // ── Battle ──
        this.battleResult = null;

        // ── Log ──
        this.log = [];

        // ── Systems ──
        this.audio = new Audio();
        this.input = new Input(this);
        this.renderer = new Renderer(this);
    }

    // ── Resize ────────────────────────────────────────────────

    _resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    // ── Start ─────────────────────────────────────────────────

    start() {
        this.lastTime = performance.now();
        this.accumulator = 0;
        this.FIXED_STEP = 1000 / 60;
        requestAnimationFrame((t) => this._loop(t));
    }

    _loop(timestamp) {
        const delta = Math.min(timestamp - this.lastTime, 100);
        this.lastTime = timestamp;
        this.accumulator += delta;

        while (this.accumulator >= this.FIXED_STEP) {
            this._update();
            this.accumulator -= this.FIXED_STEP;
        }

        this.renderer.render();
        requestAnimationFrame((t) => this._loop(t));
    }

    // ── Update ────────────────────────────────────────────────

    _update() {
        // Update hover
        this.hoveredTerritory = this.renderer.territoryAtScreen(this.input.hoverX, this.input.hoverY);

        switch (this.state) {
            case 'menu':
                this._updateMenu();
                break;
            case 'empireSelect':
                this._updateEmpireSelect();
                break;
            case 'playing':
                this._updatePlaying();
                break;
            case 'battle':
                this._updateBattle();
                break;
            case 'gameover':
            case 'victory':
                this._updateEndScreen();
                break;
        }

        this.input.endFrame();
    }

    // ── Menu ──────────────────────────────────────────────────

    _updateMenu() {
        if (this.input.hasClick()) {
            this.input.consumeClick();
            this.state = 'empireSelect';
            this.audio.click();
        }
    }

    // ── Empire Selection ──────────────────────────────────────

    _updateEmpireSelect() {
        if (this.input.hasClick()) {
            this.input.consumeClick();
            const sx = this.input.screenX;
            const sy = this.input.screenY;

            // Check which empire card was clicked
            const cardW = Math.min(160, (this.width - 80) / 3);
            const cardH = 120;
            const startX = (this.width - cardW * 3 - 20) / 2;
            const startY = (this.height - cardH) / 2 + 40;

            for (let i = 0; i < EMPIRE_IDS.length; i++) {
                const col = i % 3;
                const row = Math.floor(i / 3);
                const x = startX + col * (cardW + 10);
                const y = startY + row * (cardH + 15);

                if (sx >= x && sx <= x + cardW && sy >= y && sy <= y + cardH) {
                    this._startGame(EMPIRE_IDS[i]);
                    return;
                }
            }
        }
    }

    // ── Start Game ────────────────────────────────────────────

    _startGame(empireId) {
        this.playerEmpire = empireId;
        this.turnNumber = 1;
        this.log = [];

        // Initialize territory states
        this.tStates = {};
        for (const t of TERRITORIES) {
            this.tStates[t.id] = { owner: null, troops: 0 };
        }

        // Place empires
        this.empires = {};
        for (const eid of EMPIRE_IDS) {
            const start = STARTING_POSITIONS[eid];
            const territories = [...start.territories];
            const troops = [...start.troops];

            this.empires[eid] = new EmpireRuntime(eid, territories, troops);
            for (let i = 0; i < territories.length; i++) {
                this.tStates[territories[i]].owner = eid;
                this.tStates[territories[i]].troops = troops[i];
            }
        }

        // Place neutrals
        for (const [tid, troops] of Object.entries(NEUTRAL_TERRITORIES)) {
            this.tStates[parseInt(tid)].troops = troops;
        }

        this.state = 'playing';
        this.phase = 'selectTerritory';
        this.selectedTerritory = null;

        this._collectIncome(this.playerEmpire);
        this.addLog(`You lead the ${getEmpire(this.playerEmpire).name}! Collect income and conquer the ancient world.`);
        this.audio.turnStart();
    }

    // ── Playing ───────────────────────────────────────────────

    _updatePlaying() {
        // Check if it's AI turn
        if (this._isAITurn()) {
            this._updateAI();
            return;
        }

        // Player turn — handle input
        if (this.input.hasClick()) {
            const sx = this.input.screenX;
            const sy = this.input.screenY;

            // Check button clicks first
            const btn = this.renderer.buttonAtScreen(sx, sy);
            if (btn) {
                this.input.consumeClick();
                btn.action();
                return;
            }

            // Check territory clicks
            const tId = this.renderer.territoryAtScreen(sx, sy);
            if (tId >= 0) {
                this.input.consumeClick();
                this._handleTerritoryClick(tId);
                return;
            }

            // Clicked empty space — deselect
            this.input.consumeClick();
            this.selectedTerritory = null;
        }
    }

    _isAITurn() {
        return this.aiActions.length > 0 || this.aiActionIndex < EMPIRE_IDS.length;
    }

    // ── Income ────────────────────────────────────────────────

    _collectIncome(empireId) {
        const empire = this.empires[empireId];
        if (!empire) return;

        let income = 2; // Base income

        // +1 gold per territory (Rome bonus)
        for (const tId of empire.territoryIds) {
            income += getTerritory(tId).goldBonus;
            if (empireId === 'rome') income += 1;
        }

        // +2 base income (Persia bonus)
        if (empireId === 'persia') income += 2;

        empire.gold += income;

        if (empireId === this.playerEmpire) {
            this.addLog(`Income: +${income} gold (now ${empire.gold})`);
            this.audio.coin();
        }
    }

    // ── Territory Click Handler ───────────────────────────────

    _handleTerritoryClick(tId) {
        const state = this.tStates[tId];
        const playerState = this.empires[this.playerEmpire];

        switch (this.phase) {
            case 'selectTerritory':
                // Select any of your territories
                if (state.owner === this.playerEmpire) {
                    this.selectedTerritory = tId;
                    this.audio.click();
                } else {
                    this.audio.error();
                }
                break;

            case 'selectMoveTarget':
                // Click on adjacent own territory to move troops
                if (tId !== this.selectedTerritory &&
                    state.owner === this.playerEmpire &&
                    areAdjacent(this.selectedTerritory, tId)) {
                    this._moveTroops(this.selectedTerritory, tId);
                } else if (state.owner === this.playerEmpire) {
                    this.selectedTerritory = tId;
                    this.audio.click();
                } else {
                    this.audio.error();
                }
                break;

            case 'selectAttackTarget':
                // Click on adjacent non-owned territory to attack
                if (tId !== this.selectedTerritory &&
                    state.owner !== this.playerEmpire &&
                    areAdjacent(this.selectedTerritory, tId)) {
                    this._attack(this.selectedTerritory, tId);
                } else if (state.owner === this.playerEmpire) {
                    this.selectedTerritory = tId;
                    this.phase = 'selectTerritory';
                    this.audio.click();
                } else {
                    this.audio.error();
                }
                break;
        }
    }

    // ── Move Troops ───────────────────────────────────────────

    _moveTroops(fromId, toId) {
        const fromState = this.tStates[fromId];
        const toState = this.tStates[toId];
        const moveCount = fromState.troops - 1; // Leave 1 behind

        if (moveCount <= 0) {
            this.audio.error();
            this.addLog('Need more than 1 troop to move!');
            return;
        }

        fromState.troops = 1;
        toState.troops += moveCount;

        const fromName = getTerritory(fromId).name;
        const toName = getTerritory(toId).name;
        this.addLog(`Moved ${moveCount} troops: ${fromName} -> ${toName}`);
        this.audio.march();

        // Spawn particles
        const fromPos = this.renderer.toScreen(getTerritory(fromId).cx, getTerritory(fromId).cy);
        const toPos = this.renderer.toScreen(getTerritory(toId).cx, getTerritory(toId).cy);
        this.renderer.spawnParticles(fromPos.x, fromPos.y, 5, getEmpire(this.playerEmpire).light);

        this.selectedTerritory = null;
        this.phase = 'selectTerritory';
    }

    // ── Attack ────────────────────────────────────────────────

    _attack(fromId, toId) {
        const atkState = this.tStates[fromId];
        const defState = this.tStates[toId];
        const atkEmpire = getEmpire(this.playerEmpire);
        const defEmpireId = defState.owner;
        const defEmpire = defEmpireId ? getEmpire(defEmpireId) : null;

        const result = resolveCombat(
            atkState.troops, defState.troops,
            atkEmpire, defEmpire, getTerritory(toId)
        );

        this.battleResult = { fromId, toId, result, attacker: this.playerEmpire, defender: defEmpireId };
        this.renderer.combatAnim = this.battleResult;
        this.renderer.shakeAmount = result.conquered ? 8 : 4;

        // Apply result
        atkState.troops = result.attackerSurvivors;

        if (result.conquered) {
            // Remove from old owner
            if (defEmpireId && this.empires[defEmpireId]) {
                this.empires[defEmpireId].removeTerritory(toId);
            }

            // Transfer ownership
            defState.owner = this.playerEmpire;
            defState.troops = result.attackerSurvivors;
            atkState.troops = 1; // Leave 1 behind
            this.empires[this.playerEmpire].addTerritory(toId);

            this.addLog(`Conquered ${getTerritory(toId).name}!`);
            this.audio.capture();

            // Check if empire eliminated
            if (defEmpireId && this.empires[defEmpireId] &&
                this.empires[defEmpireId].territoryIds.length === 0) {
                this.empires[defEmpireId].alive = false;
                this.empires[this.playerEmpire].gold += 20;
                this.addLog(`${getEmpire(defEmpireId).name} has been eliminated! +20 gold`);
                this.audio.eliminated();
            }

            // Check victory
            if (this._checkVictory()) return;
        } else {
            this.addLog(`Attack on ${getTerritory(toId).name}: lost ${result.atkLosses}, enemy lost ${result.defLosses}`);
        }

        this.audio.battle();
        this.audio.dice();
        this.state = 'battle';
        this.selectedTerritory = null;
    }

    // ── Battle Overlay ────────────────────────────────────────

    _updateBattle() {
        if (this.input.hasClick()) {
            this.input.consumeClick();
            this.renderer.combatAnim = null;
            this.state = 'playing';
            this.phase = 'selectTerritory';
        }
    }

    // ── Recruit ───────────────────────────────────────────────

    recruit() {
        const cost = this.playerEmpire === 'egypt' ? 9 : 12;
        const empire = this.empires[this.playerEmpire];

        if (this.selectedTerritory === null) {
            this.audio.error();
            this.addLog('Select a territory first!');
            return;
        }

        if (this.tStates[this.selectedTerritory].owner !== this.playerEmpire) {
            this.audio.error();
            this.addLog('Can only recruit on your territories!');
            return;
        }

        if (empire.gold < cost) {
            this.audio.error();
            this.addLog(`Not enough gold! Need ${cost}, have ${empire.gold}`);
            return;
        }

        empire.gold -= cost;
        this.tStates[this.selectedTerritory].troops++;
        this.addLog(`Recruited 1 troop at ${getTerritory(this.selectedTerritory).name} (-${cost} gold)`);
        this.audio.recruit();
    }

    // ── End Turn ──────────────────────────────────────────────

    endTurn() {
        this.selectedTerritory = null;
        this.phase = 'selectTerritory';

        // Start AI turns
        this.aiActions = [];
        this.aiActionIndex = 0;
        this.aiTimer = 0;

        // Collect income for AI empires and queue their turns
        for (const eid of EMPIRE_IDS) {
            if (eid === this.playerEmpire) continue;
            if (!this.empires[eid].alive) continue;
            this._collectIncome(eid);
        }

        this.addLog('--- AI Empires are making their moves... ---');
    }

    // ── AI Turn Execution ─────────────────────────────────────

    _updateAI() {
        this.aiTimer++;

        // Check if we need to compute next AI actions
        if (this.aiActionIndex >= EMPIRE_IDS.length) {
            // All AI turns done
            this.aiActions = [];
            this.aiActionIndex = 0;
            this.turnNumber++;
            this._collectIncome(this.playerEmpire);
            this.addLog(`--- Turn ${this.turnNumber} ---`);
            this.audio.turnStart();
            return;
        }

        const currentAI = EMPIRE_IDS[this.aiActionIndex];

        // Skip dead empires and player
        if (currentAI === this.playerEmpire || !this.empires[currentAI].alive) {
            this.aiActionIndex++;
            return;
        }

        // Compute AI actions on first frame
        if (this.aiActions.length === 0 || this.aiActions._empire !== currentAI) {
            const ai = new AI(this, currentAI);
            this.aiActions = ai.takeTurn();
            this.aiActions._empire = currentAI;
            this.aiActionTimer = 0;
        }

        // Play back actions one at a time
        if (this.aiTimer >= this.aiDelay) {
            this.aiTimer = 0;

            if (this.aiActions.length > 0) {
                const action = this.aiActions.shift();

                switch (action.type) {
                    case 'recruit':
                        this.addLog(`${getEmpire(action.empire).name} recruited at ${getTerritory(action.territory).name}`);
                        break;
                    case 'move':
                        this.addLog(`${getEmpire(action.empire).name} moved ${action.troops} troops`);
                        break;
                    case 'attack':
                        this.addLog(`${getEmpire(action.empire).name} attacked ${getTerritory(action.to).name}!`);
                        this.renderer.shakeAmount = 3;
                        this.audio.battle();

                        if (action.result.conquered) {
                            this.addLog(`${getEmpire(action.empire).name} conquered ${getTerritory(action.to).name}!`);
                            this.renderer.shakeAmount = 6;
                            this.audio.capture();

                            // Check if player was eliminated
                            if (!this.empires[this.playerEmpire].alive) {
                                this.state = 'gameover';
                                this.audio.defeat();
                                return;
                            }
                        }
                        break;
                    case 'eliminated':
                        this.addLog(`${getEmpire(action.empire).name} has been eliminated!`);
                        this.audio.eliminated();
                        break;
                }
            } else {
                // This AI's turn is done
                this.aiActionIndex++;
                this.aiActions = [];
            }
        }
    }

    // ── Victory Check ─────────────────────────────────────────

    _checkVictory() {
        // Player wins if they own all territories
        const playerTerrs = this.empires[this.playerEmpire].territoryIds.length;
        if (playerTerrs === TERRITORIES.length) {
            this.state = 'victory';
            this.audio.victory();
            return true;
        }

        // Player loses if they have no territories
        if (playerTerrs === 0) {
            this.state = 'gameover';
            this.audio.defeat();
            return true;
        }

        return false;
    }

    // ── End Screen ────────────────────────────────────────────

    _updateEndScreen() {
        if (this.input.hasClick()) {
            this.input.consumeClick();
            this.state = 'menu';
        }
    }

    // ── UI Helpers ────────────────────────────────────────────

    phaseLabel() {
        if (this._isAITurn()) return 'AI Turn';
        switch (this.phase) {
            case 'selectTerritory': return 'Select Territory';
            case 'selectMoveTarget': return 'Move Troops';
            case 'selectAttackTarget': return 'Choose Target';
            default: return '';
        }
    }

    phaseMessage() {
        if (this._isAITurn()) return 'AI empires are taking their turns...';

        switch (this.phase) {
            case 'selectTerritory':
                return this.selectedTerritory
                    ? `Selected: ${getTerritory(this.selectedTerritory).name} (${this.tStates[this.selectedTerritory].troops} troops) — Choose an action below`
                    : 'Click one of your territories to select it';
            case 'selectMoveTarget':
                return `Moving from ${getTerritory(this.selectedTerritory).name} — Click an adjacent territory you own, or press Cancel`;
            case 'selectAttackTarget':
                return `Attacking from ${getTerritory(this.selectedTerritory).name} — Click an adjacent enemy territory, or press Cancel`;
            default: return '';
        }
    }

    getButtons() {
        if (this.state !== 'playing' || this._isAITurn()) return [];

        const empire = this.empires[this.playerEmpire];
        const hasSelection = this.selectedTerritory !== null;
        const ownsSelected = hasSelection && this.tStates[this.selectedTerritory].owner === this.playerEmpire;
        const canRecruit = ownsSelected && empire.gold >= (this.playerEmpire === 'egypt' ? 9 : 12);
        const hasAdjacentEnemy = hasSelection && getTerritory(this.selectedTerritory).adj.some(
            id => this.tStates[id].owner !== this.playerEmpire
        );
        const hasAdjacentAlly = hasSelection && getTerritory(this.selectedTerritory).adj.some(
            id => this.tStates[id].owner === this.playerEmpire
        );
        const canMove = ownsSelected && this.tStates[this.selectedTerritory].troops > 1 && hasAdjacentAlly;

        const buttons = [
            {
                label: `Recruit (${this.playerEmpire === 'egypt' ? 9 : 12}g)`,
                active: canRecruit,
                action: () => this.recruit(),
            },
            {
                label: 'Move',
                active: canMove,
                action: () => {
                    this.phase = 'selectMoveTarget';
                    this.audio.click();
                },
            },
            {
                label: 'Attack',
                active: ownsSelected && hasAdjacentEnemy && this.tStates[this.selectedTerritory].troops > 1,
                action: () => {
                    this.phase = 'selectAttackTarget';
                    this.audio.click();
                },
            },
            {
                label: 'Cancel',
                active: this.phase !== 'selectTerritory',
                action: () => {
                    this.phase = 'selectTerritory';
                    this.audio.click();
                },
            },
            {
                label: 'End Turn',
                active: true,
                action: () => this.endTurn(),
            },
        ];

        return buttons;
    }

    getEmpireData(id) {
        return EMPIRES[id];
    }

    addLog(msg) {
        this.log.push(msg);
        if (this.log.length > 50) this.log.shift();
    }

    // ── Menu Render Helpers (called by renderer via game state) ──

    drawMenu(ctx, w, h) {
        // Title
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
        ctx.fillText("EMPEROR'S CONQUEST", w / 2, h * 0.25);

        ctx.fillStyle = '#c0a060';
        ctx.font = '20px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Conquer the Ancient World', w / 2, h * 0.25 + 40);

        // Sword decorations
        ctx.fillStyle = '#888';
        ctx.font = '14px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Turn-Based Strategy  |  5 Empires  |  13 Territories', w / 2, h * 0.25 + 70);

        // Rules summary
        ctx.fillStyle = '#aaa';
        ctx.font = '15px "Segoe UI", Arial, sans-serif';
        const rules = [
            'Collect gold from your territories each turn',
            'Recruit troops to strengthen your borders',
            'Move armies to prepare for invasion',
            'Attack enemy territories with dice-based combat',
            'Conquer every territory to win!',
        ];
        rules.forEach((rule, i) => {
            ctx.fillText(rule, w / 2, h * 0.45 + i * 24);
        });

        // Start prompt
        if (Math.floor(Date.now() / 600) % 2 === 0) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
            ctx.fillText('Click anywhere to begin', w / 2, h * 0.78);
        }
    }

    drawEmpireSelect(ctx, w, h) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Choose Your Empire', w / 2, h * 0.15);

        ctx.fillStyle = '#aaa';
        ctx.font = '14px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Each empire has a unique strategic bonus', w / 2, h * 0.15 + 30);

        const cardW = Math.min(160, (w - 80) / 3);
        const cardH = 120;
        const startX = (w - cardW * 3 - 20) / 2;
        const startY = (h - cardH * 2 - 25) / 2 + 40;

        for (let i = 0; i < EMPIRE_IDS.length; i++) {
            const eid = EMPIRE_IDS[i];
            const emp = EMPIRES[eid];
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = startX + col * (cardW + 10);
            const y = startY + row * (cardH + 15);

            // Card background
            ctx.fillStyle = '#222';
            ctx.strokeStyle = emp.color;
            ctx.lineWidth = 2;
            this._rendererRoundRect(ctx, x, y, cardW, cardH, 8);

            // Color bar
            ctx.fillStyle = emp.color;
            this._rendererRoundRectTop(ctx, x, y, cardW, 8, 8);

            // Name
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(emp.name, x + cardW / 2, y + 30);

            // Bonus
            ctx.fillStyle = '#ffd700';
            ctx.font = '12px "Segoe UI", Arial, sans-serif';
            ctx.fillText(emp.bonus, x + cardW / 2, y + 55);

            // Start info
            const start = STARTING_POSITIONS[eid];
            const terrNames = start.territories.map(id => getTerritory(id).name).join(', ');
            ctx.fillStyle = '#888';
            ctx.font = '11px "Segoe UI", Arial, sans-serif';
            ctx.fillText(`Starts: ${terrNames}`, x + cardW / 2, y + 80);
            ctx.fillText(`Troops: ${start.troops.join(', ')}`, x + cardW / 2, y + 100);
        }
    }

    drawGameOver(ctx, w, h) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
        ctx.fillText('DEFEAT', w / 2, h * 0.3);

        ctx.fillStyle = '#aaa';
        ctx.font = '20px "Segoe UI", Arial, sans-serif';
        ctx.fillText(`Your empire fell on turn ${this.turnNumber}`, w / 2, h * 0.3 + 40);

        const empire = this.empires[this.playerEmpire];
        ctx.fillText(`Final score: ${empire.territoryIds.length} territories`, w / 2, h * 0.3 + 70);

        if (Math.floor(Date.now() / 600) % 2 === 0) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
            ctx.fillText('Click to return to menu', w / 2, h * 0.6);
        }
    }

    drawVictory(ctx, w, h) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
        ctx.fillText('VICTORY!', w / 2, h * 0.25);

        ctx.fillStyle = '#fff';
        ctx.font = '24px "Segoe UI", Arial, sans-serif';
        ctx.fillText(`The ${getEmpire(this.playerEmpire).name} conquers all!`, w / 2, h * 0.25 + 45);

        ctx.fillStyle = '#c0a060';
        ctx.font = '18px "Segoe UI", Arial, sans-serif';
        ctx.fillText(`Completed in ${this.turnNumber} turns`, w / 2, h * 0.25 + 80);

        // Crown emoji alternative
        ctx.font = '40px "Segoe UI", Arial, sans-serif';
        ctx.fillText('\u265A', w / 2, h * 0.25 + 130); // Chess king

        if (Math.floor(Date.now() / 600) % 2 === 0) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
            ctx.fillText('Click to return to menu', w / 2, h * 0.7);
        }
    }

    _rendererRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    _rendererRoundRectTop(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
    }
}

// ── Empire Runtime Data ──────────────────────────────────────
// Tracks mutable empire state during the game.

class EmpireRuntime {
    constructor(id, territoryIds, troops) {
        this.id = id;
        this.territoryIds = [...territoryIds];
        this.gold = 5; // Starting gold
        this.alive = true;
    }

    addTerritory(id) {
        if (!this.territoryIds.includes(id)) {
            this.territoryIds.push(id);
        }
    }

    removeTerritory(id) {
        this.territoryIds = this.territoryIds.filter(t => t !== id);
        if (this.territoryIds.length === 0) {
            this.alive = false;
        }
    }

    totalTroops() {
        // Note: this needs game reference, so we do it externally
        return 0; // Placeholder
    }
}
