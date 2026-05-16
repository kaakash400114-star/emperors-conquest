import { TERRITORIES, EMPIRES, EIDS, STARTS, NEUTRALS, T, E, adj, WEAPONS, SHOP, STRATEGIES } from './map.js';
import { resolveCombat } from './combat.js';
import { SFX } from './audio.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { AI } from './ai.js';

export class Game {
    constructor(canvas) {
        this.c = canvas;
        this.ctx = canvas.getContext('2d');
        this.W = 0; this.H = 0;
        this._resize();
        window.addEventListener('resize', () => this._resize());

        // States: menu|empireSelect|playing|attack|battle|shop|gameover|victory|help|moveDialog|territory
        this.state = 'menu';
        this.phase = 'select'; // sub-phases within playing: select|move|attack
        this.player = null;
        this.turn = 0;
        this.empires = {};
        this.ts = {}; // territory states
        this.sel = null;
        this.hover = null;
        this.log = [];

        // Territory view (zoom inside)
        this._terrView = null; // { tid, zoom: 0->1, soldiers: [...], buildings: [...] }

        // AI
        this.aiQ = []; this.aiIdx = -1; this.aiTimer = 0; this.aiDelay = 15;

        // Battle
        this.battle = null;

        // Shop state
        this.shopTab = 'troops';

        // Move state
        this.moveFrom = null;
        this.moveTo = null;
        this.moveAmount = 0;

        // Attack target — set when entering attack phase, not reset every frame
        this._attackTarget = null;

        // Help state
        this._helpPrev = 'menu';

        // Buttons (cached for click detection)
        this.btns = [];

        // Player statistics tracking
        this.stats = {
            kills: 0,
            conquered: 0,
            coinsEarned: 0,
            totalTroops: 0,
        };

        // Difficulty setting
        this.difficulty = 'normal';

        // Undo system
        this.undoStack = [];

        // Kill tracking per empire (who eliminated whom)
        this.killLog = {};

        // Systems
        this.sfx = new SFX();
        this.input = new Input(this);
        this.renderer = new Renderer(this);
    }

    _resize() {
        this.c.width = window.innerWidth;
        this.c.height = window.innerHeight;
        this.W = this.c.width; this.H = this.c.height;
    }

    start() {
        this.lastT = performance.now();
        const loop = (t) => {
            const dt = Math.min(t - this.lastT, 100);
            this.lastT = t;
            this._update(dt);
            this.renderer.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    _update(dt) {
        this.hover = this.renderer.terrAt(this.input.hoverX, this.input.hoverY);

        // Cursor: pointer when hovering over clickable territory
        const canvas = document.getElementById('gc');
        if (canvas) {
            const showPointer = this.hover >= 0 && this.state === 'playing' && !this._isAI();
            canvas.style.cursor = showPointer ? 'pointer' : 'default';
        }

        if (this.state === 'menu') this._upMenu();
        else if (this.state === 'empireSelect') this._upEmpire();
        else if (this.state === 'playing') this._upPlay();
        else if (this.state === 'attack') this._upAttack();
        else if (this.state === 'combat') { /* animation plays, clicks ignored */ }
        else if (this.state === 'battle') this._upBattle();
        else if (this.state === 'shop') this._upShop();
        else if (this.state === 'gameover' || this.state === 'victory') this._upEnd();
        else if (this.state === 'help') this._upHelp();
        else if (this.state === 'moveDialog') this._upMoveDialog();
        else if (this.state === 'difficulty') this._upDifficulty();
        else if (this.state === 'territory') this._upTerritoryView();

        this.input.endFrame();
    }

    // ── MENU ──────────────────────────────────────────────────
    _upMenu() {
        if (this.input.hasClick()) {
            const sx = this.input.sx, sy = this.input.sy;
            const hr = this._helpBtnRect;
            if (hr && sx >= hr.x && sx <= hr.x + hr.w && sy >= hr.y && sy <= hr.y + hr.h) {
                this.input.consumeClick();
                this.showHelp();
                return;
            }
            // Check Continue button
            const cr = this._continueBtnRect;
            if (cr && sx >= cr.x && sx <= cr.x + cr.w && sy >= cr.y && sy <= cr.y + cr.h) {
                this.input.consumeClick();
                if (!this.loadGame()) {
                    this._log('No saved game found!');
                }
                return;
            }
            this.input.consumeClick();
            this.state = 'difficulty';
            this.sfx.click();
        }
    }

    // ── DIFFICULTY SELECT ──────────────────────────────────────
    _upDifficulty() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }
        this.input.consumeClick();
    }

    // ── EMPIRE SELECT ─────────────────────────────────────────
    _upEmpire() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;

        // FIX: Check buttons first (Back button from renderer)
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }

        this.input.consumeClick();
        const cols = 5, cw = Math.min(160, (this.W - 50) / cols), ch = 160, gap = 6;
        const rows = Math.ceil(EIDS.length / cols);
        const totalW = cw * cols + gap * (cols - 1);
        const startX = (this.W - totalW) / 2;
        const startY = (this.H - ch * rows - gap * (rows - 1)) / 2 + 30;

        for (let i = 0; i < EIDS.length; i++) {
            const col = i % cols, row = Math.floor(i / cols);
            const x = startX + col * (cw + gap), y = startY + row * (ch + gap);
            if (sx >= x && sx <= x + cw && sy >= y && sy <= y + ch) {
                this._startGame(EIDS[i]);
                return;
            }
        }
    }

    // ── START GAME ────────────────────────────────────────────
    _startGame(eid) {
        this.player = eid;
        this.turn = 1;
        this.log = [];

        // Reset stats
        this.stats = { kills: 0, conquered: 0, coinsEarned: 0, totalTroops: 0 };
        this.killLog = {};

        // Initialize all territories
        this.ts = {};
        for (const t of TERRITORIES) {
            this.ts[t.id] = { owner: null, troops: 0, fort: 0, weapon: WEAPONS[1][0] };
        }

        // Initialize empires and place starting territories
        this.empires = {};
        for (const id of EIDS) {
            const s = STARTS[id];
            if (!s) continue;
            const emp = { id, tids: [...s.t], coins: 15, alive: true, weapons: new Set([1]), spy: false };
            this.empires[id] = emp;
            for (let i = 0; i < s.t.length; i++) {
                this.ts[s.t[i]].owner = id;
                this.ts[s.t[i]].troops = s.troops[i];
            }
        }

        // Place neutral garrisons
        for (const [tid, troops] of Object.entries(NEUTRALS)) {
            this.ts[parseInt(tid)].troops = troops;
        }

        // Difficulty adjustments for AI starting troops
        if (this.difficulty === 'easy') {
            // AI troops -1 per starting territory (min 1)
            for (const id of EIDS) {
                if (id === this.player) continue;
                const s = STARTS[id];
                if (!s) continue;
                for (let i = 0; i < s.t.length; i++) {
                    this.ts[s.t[i]].troops = Math.max(1, s.troops[i] - 1);
                }
            }
        } else if (this.difficulty === 'hard') {
            // AI troops +2 per starting territory
            for (const id of EIDS) {
                if (id === this.player) continue;
                const s = STARTS[id];
                if (!s) continue;
                for (let i = 0; i < s.t.length; i++) {
                    this.ts[s.t[i]].troops = s.troops[i] + 2;
                }
            }
        }

        this.state = 'playing';
        this.phase = 'select';
        this.sel = null;
        this.aiQ = []; this.aiIdx = -1; this.aiTimer = 0;
        this._income(this.player);
        this._log(`You lead the ${E(this.player).name}! Conquer all territories to win.`);
        this.sfx.turn();
    }

    // ── INCOME ────────────────────────────────────────────────
    _income(eid) {
        const emp = this.empires[eid];
        if (!emp) return;
        let inc = 3;
        const e = E(eid);
        for (const tid of emp.tids) {
            inc += 1;
            if (e.bonusType === 'income') inc += 2;
            if (e.bonusType === 'desert' && T(tid).terrain === 'desert') inc += 3;
            if (e.bonusType === 'bonus') inc += 2;
            if (e.bonusType === 'warMachine') inc += 3;
        }
        // Difficulty modifier for AI
        if (eid !== this.player) {
            if (this.difficulty === 'easy') inc = Math.floor(inc * 0.6);
            else if (this.difficulty === 'hard') inc = Math.floor(inc * 1.4);
        }
        emp.coins += inc;
        if (eid === this.player) {
            this.stats.coinsEarned += inc;
            this._log(`Income: +${inc} coins (now ${emp.coins})`);
        }
    }

    // ── PLAYING ───────────────────────────────────────────────
    _upPlay() {
        if (this._isAI()) { this._upAI(); return; }
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;

        // Check buttons
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }

        // Check territory click
        const tid = this.renderer.terrAt(sx, sy);
        if (tid >= 0) {
            this.input.consumeClick();
            this._clickTerr(tid);
            return;
        }
        this.input.consumeClick();
        this.sel = null;
    }

    _clickTerr(tid) {
        const s = this.ts[tid];
        if (this.phase === 'select') {
            if (s.owner === this.player) {
                // Zoom into territory view
                this._enterTerritoryView(tid);
                this.sfx.click();
            }
            else this.sfx.error();
        } else if (this.phase === 'move') {
            if (tid !== this.sel && s.owner === this.player && adj(this.sel, tid)) {
                this.moveFrom = this.sel;
                this.moveTo = tid;
                this.moveAmount = this.ts[this.sel].troops - 1;
                this.state = 'moveDialog';
            } else if (s.owner === this.player) {
                this.sel = tid; this.sfx.click();
            } else this.sfx.error();
        } else if (this.phase === 'attack') {
            if (tid !== this.sel && s.owner !== this.player && adj(this.sel, tid)) {
                this._attackTarget = tid;
                this.state = 'attack';
                this.sfx.click();
            } else if (s.owner === this.player) {
                this.sel = tid;
                this.phase = 'select';
                this._attackTarget = null;
                this.sfx.click();
            } else this.sfx.error();
        }
    }

    // ── TERRITORY VIEW (Zoom Inside) ──────────────────────────
    _enterTerritoryView(tid) {
        const t = T(tid);
        const s = this.ts[tid];
        // Generate soldiers for the interior view
        const soldiers = [];
        const count = Math.min(s.troops, 30); // max 30 visible soldiers
        for (let i = 0; i < count; i++) {
            soldiers.push({
                x: 0.15 + Math.random() * 0.7,
                y: 0.25 + Math.random() * 0.5,
                frame: Math.random() * 100,
                speed: 0.3 + Math.random() * 0.7,
                dir: Math.random() > 0.5 ? 1 : -1,
                size: 0.6 + Math.random() * 0.5,
            });
        }
        // Generate buildings
        const buildings = [];
        const bCount = Math.min(Math.floor(s.troops / 3) + 1, 6);
        for (let i = 0; i < bCount; i++) {
            buildings.push({
                x: 0.1 + Math.random() * 0.8,
                y: 0.1 + Math.random() * 0.35,
                type: ['house','tower','barracks','farm','market','wall'][i % 6],
                size: 0.8 + Math.random() * 0.6,
            });
        }
        this._terrView = { tid, zoom: 0, soldiers, buildings, time: 0 };
        this.state = 'territory';
        this.sel = tid;
    }

    _exitTerritoryView() {
        this._terrView = null;
        this.state = 'playing';
        this.phase = 'select';
        this.sel = null;
        this.sfx.click();
    }

    _upTerritoryView() {
        if (!this._terrView) { this._exitTerritoryView(); return; }
        this._terrView.time++;
        this._terrView.zoom = Math.min(1, this._terrView.zoom + 0.04);

        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;
        this.input.consumeClick();

        // Check back button (top-left)
        if (sx < 120 && sy < 45) {
            this._exitTerritoryView();
            return;
        }

        // Check action buttons at bottom
        const W = this.W, H = this.H;
        const btnW = 130, btnH = 40, btnY = H - 60, gap = 15;
        const btns = [
            { label: 'ATTACK', x: W/2 - btnW*1.5 - gap, fn: () => { this.state = 'playing'; this.phase = 'attack'; } },
            { label: 'MOVE', x: W/2 - btnW/2, fn: () => { this.state = 'playing'; this.phase = 'move'; } },
            { label: 'SHOP', x: W/2 + btnW/2 + gap, fn: () => { this.state = 'playing'; this.phase = 'select'; this._openShop(); } },
            { label: 'BACK', x: W/2 + btnW*1.5 + gap*2, fn: () => this._exitTerritoryView() },
        ];
        for (const b of btns) {
            if (sx >= b.x && sx <= b.x + btnW && sy >= btnY && sy <= btnY + btnH) {
                b.fn();
                return;
            }
        }
    }

    // ── MOVE DIALOG ───────────────────────────────────────────
    _upMoveDialog() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                if (b.fn) b.fn();
                return;
            }
        }
        this.input.consumeClick();
    }

    _moveDialogConfirm() {
        const mv = Math.min(this.moveAmount, this.ts[this.moveFrom].troops - 1);
        if (mv <= 0) { this.sfx.error(); return; }
        this.undoStack.push({ action: 'move', from: this.moveFrom, to: this.moveTo, fromTroops: this.ts[this.moveFrom].troops, toTroops: this.ts[this.moveTo].troops });
        this.ts[this.moveFrom].troops -= mv;
        this.ts[this.moveTo].troops += mv;
        this._log(`Moved ${mv} troops: ${T(this.moveFrom).name} -> ${T(this.moveTo).name}`);
        this.sfx.march();
        this.renderer.shake = 2;
        this.state = 'playing';
        this.sel = null;
        this.phase = 'select';
        this.moveFrom = null;
        this.moveTo = null;
    }

    _moveDialogCancel() {
        this.state = 'playing';
        this.phase = 'move';
        this.moveFrom = null;
        this.moveTo = null;
        this.sfx.click();
    }

    _moveDialogAdjust(delta) {
        this.moveAmount = Math.max(1, Math.min(this.ts[this.moveFrom].troops - 1, this.moveAmount + delta));
        this.sfx.click();
    }

    // ── ATTACK SCREEN ─────────────────────────────────────────
    _upAttack() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;

        // Check buttons in attack panel
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }

        // FIX: Clicking outside buttons goes back to playing (not looping in attack state)
        this.input.consumeClick();
        this.state = 'playing';
        this.phase = 'select';
        this._attackTarget = null;
    }

    _doAttack(stratIdx) {
        const from = this.sel, to = this._attackTarget;
        if (to == null || from == null) return;
        const atkS = this.ts[from], defS = this.ts[to];
        if (atkS.troops <= 1) { this.sfx.error(); return; }

        const strat = STRATEGIES[stratIdx || 0];
        const emp = this.empires[this.player];
        const weapon = this.ts[from].weapon;
        const defEmp = defS.owner ? E(defS.owner) : null;
        const defWeapon = this.ts[to].weapon;

        const res = resolveCombat(atkS.troops, defS.troops, E(this.player), defEmp, T(to), strat, weapon, defWeapon, this.ts[to].fort);

        this.battle = { from, to, res, atk: this.player, def: defS.owner };
        this.renderer.shake = res.conquered ? 10 : 5;
        this.sfx.battle(); this.sfx.dice();

        // Start combat animation instead of showing results immediately
        this.state = 'combat';
        this.renderer.startCombatAnim(from, to, this.player, defS.owner, res.conquered);

        // Apply results
        atkS.troops = res.atkLeft;
        emp.coins += res.coins;
        this.stats.coinsEarned += res.coins;

        // FIX: Removed dead code `if (this.player === this.player)` — was always true
        this._log(`Battle! You ${res.conquered ? 'CONQUERED' : 'lost'} ${T(to).name}. +${res.coins} coins`);

        if (res.conquered) {
            // FIX: Save defender color BEFORE changing ownership
            const defColor = defS.owner ? E(defS.owner).color : '#444';

            // Handle defender losing territory
            if (defS.owner && this.empires[defS.owner]) {
                this.empires[defS.owner].tids = this.empires[defS.owner].tids.filter(t => t !== to);
                if (this.empires[defS.owner].tids.length === 0) {
                    this.empires[defS.owner].alive = false;
                    emp.coins += 30;
                    this.stats.coinsEarned += 30;
                    this.stats.kills++;
                    if (!this.killLog[this.player]) this.killLog[this.player] = [];
                    this.killLog[this.player].push(defS.owner);
                    this._log(`${E(defS.owner).name} eliminated! +30 coins`);
                    this.sfx.elim();
                    // Show eliminated empire's history
                    this.renderer.showEmpireStory(defS.owner);
                }
            }
            defS.owner = this.player;
            defS.troops = res.atkLeft;
            atkS.troops = 1;
            emp.tids.push(to);
            this.stats.conquered++;
            this.sfx.capture();
            // Show territory historical fact on conquest
            this.renderer.showTerritoryStory(to);
            // Show empire story periodically (every 2nd conquest)
            if (this.stats.conquered % 2 === 0) {
                this.renderer.showEmpireStory(this.player);
            }
            this.renderer.particles.push(...this._makeParticles(to, E(this.player).light));
            this.renderer.addCaptureAnim(to, E(this.player).color, defColor);
            if (emp.tids.length === TERRITORIES.length) {
                this.state = 'victory';
                this.sfx.victory();
                return;
            }
        } else {
            defS.troops = res.defLeft;
        }

        // state is already 'combat' (set above), animation will transition to 'battle'
        this.phase = 'select';
        this.sel = null;
        this._attackTarget = null;
    }

    _makeParticles(tid, color) {
        const p = this.renderer.toScr(T(tid).cx, T(tid).cy);
        const out = [];
        for (let i = 0; i < 20; i++) {
            out.push({
                x: p.x, y: p.y,
                vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6-2,
                life: 1, decay: 0.015+Math.random()*0.02,
                color, size: 2+Math.random()*4
            });
        }
        return out;
    }

    // ── BATTLE OVERLAY ────────────────────────────────────────
    _upBattle() {
        if (!this.input.hasClick()) return;
        this.input.consumeClick();
        this.battle = null;
        this.state = 'playing';
        this.phase = 'select';
        this._attackTarget = null;
    }

    // ── SHOP ──────────────────────────────────────────────────
    _upShop() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }
        this.input.consumeClick();
    }

    _buySoldier() {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        const cost = this.player === 'russia' ? 5 : 10;
        const emp = this.empires[this.player];
        if (emp.coins < cost) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'recruit', tid: this.sel, troops: this.ts[this.sel].troops, coins: emp.coins, stats: { ...this.stats } });
        emp.coins -= cost; this.ts[this.sel].troops++;
        this.stats.totalTroops++;
        this._log(`Recruited soldier at ${T(this.sel).name} (-${cost} coins)`);
        this.sfx.recruit();
    }

    _buyVeteran() {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        const emp = this.empires[this.player];
        if (emp.coins < 20) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'veteran', tid: this.sel, troops: this.ts[this.sel].troops, coins: emp.coins, stats: { ...this.stats } });
        emp.coins -= 20; this.ts[this.sel].troops += 2;
        this.stats.totalTroops += 2;
        this._log(`Recruited 2 veterans at ${T(this.sel).name} (-20 coins)`);
        this.sfx.recruit();
    }

    _buyFortify() {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        const emp = this.empires[this.player];
        if (emp.coins < 15) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'fortify', tid: this.sel, fort: this.ts[this.sel].fort, coins: emp.coins });
        emp.coins -= 15; this.ts[this.sel].fort += 2;
        this._log(`Fortified ${T(this.sel).name} (+2 def permanently)`);
        this.sfx.buy();
    }

    _buyWeaponTier(tier) {
        const costs = { 2: 25, 3: 50, 4: 80 };
        const cost = costs[tier];
        const emp = this.empires[this.player];
        if (emp.coins < cost) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'weaponTier', tier, coins: emp.coins, weapons: new Set(emp.weapons) });
        emp.coins -= cost; emp.weapons.add(tier);
        this._log(`Unlocked Tier ${tier} weapons! (-${cost} coins)`);
        this.sfx.buy();
    }

    _equipWeapon(tier, idx) {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        if (!this.empires[this.player].weapons.has(tier)) { this.sfx.error(); this._log('Weapon tier locked!'); return; }
        this.undoStack.push({ action: 'equip', tid: this.sel, weapon: this.ts[this.sel].weapon });
        this.ts[this.sel].weapon = WEAPONS[tier][idx];
        this._log(`Equipped ${WEAPONS[tier][idx].name} at ${T(this.sel).name}`);
        this.sfx.click();
    }

    _buySpy() {
        const emp = this.empires[this.player];
        if (emp.spy) { this.sfx.error(); this._log('Spy network already active!'); return; }
        if (emp.coins < 30) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'spy', coins: emp.coins });
        emp.coins -= 30; emp.spy = true;
        this._log('Spy network activated! Enemy troop counts revealed.');
        this.sfx.buy();
    }

    // ── END TURN ──────────────────────────────────────────────
    endTurn() {
        this.sel = null;
        this.phase = 'select';
        this._attackTarget = null;
        this.undoStack = [];

        // Build AI queue: only alive AI empires
        this.aiQ = [];
        this.aiIdx = 0;
        this.aiTimer = 0;

        // Give income to all alive AI empires
        for (const id of EIDS) {
            if (id === this.player || !this.empires[id]?.alive) continue;
            this._income(id);
        }

        // Check if there are actually any AI empires to process
        const hasAI = EIDS.some(id => id !== this.player && this.empires[id]?.alive);
        if (!hasAI) {
            // No AI left — just advance to next turn
            this.aiQ = [];
            this.aiIdx = -1;
            this.turn++;
            this._income(this.player);
            this._log(`--- Turn ${this.turn} ---`);
            this.sfx.turn();
            return;
        }

        this._log('--- AI empires are moving... ---');
    }

    // ── AI ────────────────────────────────────────────────────
    _isAI() { return this.aiQ.length > 0 || this.aiIdx >= 0; }

    _upAI() {
        this.aiTimer++;

        // All AI empires processed — advance turn
        if (this.aiIdx >= EIDS.length) {
            this.aiQ = [];
            this.aiIdx = -1;
            this.turn++;
            this._income(this.player);
            this._log(`--- Turn ${this.turn} ---`);
            this.sfx.turn();
            // Show random history lesson every 5 turns
            if (this.turn % 5 === 0) {
                this.renderer.showRandomEmpireStory();
            }
            return;
        }

        const cur = EIDS[this.aiIdx];

        // Skip player and dead empires
        if (cur === this.player || !this.empires[cur]?.alive) {
            this.aiIdx++;
            return;
        }

        // Generate actions for this AI if not already done
        if (!this.aiQ.length || this.aiQ._eid !== cur) {
            this.aiQ = new AI(this, cur).takeTurn();
            this.aiQ._eid = cur;
        }

        // Process ALL actions for this empire after a short delay (one batch per empire)
        if (this.aiTimer >= this.aiDelay) {
            this.aiTimer = 0;

            // Process all remaining actions for this empire at once
            while (this.aiQ.length > 0) {
                const a = this.aiQ.shift();
                if (a.type === 'recruit') {
                    this._log(`${E(a.empire).name} recruited at ${T(a.territory).name}`);
                }
                else if (a.type === 'move') {
                    this._log(`${E(a.empire).name} moved ${a.troops} troops`);
                }
                else if (a.type === 'fortify') {
                    this._log(`${E(a.empire).name} fortified ${T(a.territory).name}`);
                }
                else if (a.type === 'attack') {
                    this._log(`${E(a.empire).name} attacked ${T(a.to).name} from ${T(a.from).name}${a.result.conquered ? ' — CONQUERED!' : ''}`);
                }
                else if (a.type === 'eliminated') {
                    this._log(`${E(a.by).name} eliminated ${E(a.empire).name}!`);
                }

                if (a.type === 'attack' && a.result.conquered) {
                    this.renderer.shake = 5;
                    // Show territory story when AI conquers
                    this.renderer.showTerritoryStory(a.to);
                    // Show attacking empire's story occasionally
                    if (Math.random() < 0.3) this.renderer.showEmpireStory(a.empire);
                    // Check if player was eliminated
                    if (!this.empires[this.player].alive) {
                        this.state = 'gameover';
                        this.sfx.defeat();
                        this.aiQ = [];
                        this.aiIdx = -1;
                        return;
                    }
                    // Check if this AI won
                    const aiEmp = this.empires[a.empire];
                    if (aiEmp && aiEmp.alive && aiEmp.tids.length === TERRITORIES.length) {
                        this.state = 'gameover';
                        this.sfx.defeat();
                        this.aiQ = [];
                        this.aiIdx = -1;
                        return;
                    }
                }
                if (a.type === 'eliminated') {
                    this.sfx.elim();
                    // Show eliminated empire's history
                    this.renderer.showEmpireStory(a.empire);
                }
                if (a.type === 'attack') this.sfx.battle();
            }

            // This AI's turn is done, move to next
            this.aiIdx++;
            this.aiQ = [];
        }
    }

    // ── END SCREEN ────────────────────────────────────────────
    _upEnd() {
        if (this.input.hasClick()) {
            this.input.consumeClick();
            this.state = 'menu';
        }
    }

    // ── HELP SCREEN ───────────────────────────────────────────
    _upHelp() {
        if (this.input.hasClick()) {
            this.input.consumeClick();
            this.state = this._helpPrev;
            this.sfx.click();
        }
    }

    showHelp() {
        this._helpPrev = this.state;
        this.state = 'help';
        this.sfx.click();
    }

    // ── HELPERS ───────────────────────────────────────────────
    _log(m) { this.log.push(m); if (this.log.length > 60) this.log.shift(); }

    phaseMsg() {
        if (this._isAI()) return 'AI empires are taking their turns...';
        if (this.state === 'moveDialog') return this.moveFrom != null && this.moveTo != null ? `Move troops from ${T(this.moveFrom).name} to ${T(this.moveTo).name}` : 'Move troops';
        if (this.phase === 'select') return this.sel != null ? `Selected: ${T(this.sel).name} (${this.ts[this.sel].troops} troops)` : 'Click your territory to select it';
        if (this.phase === 'move') return this.sel != null ? `Moving from ${T(this.sel).name} — click a green territory` : 'Select a territory first';
        if (this.phase === 'attack') return this.sel != null ? `Attack from ${T(this.sel).name} — click a red enemy territory` : 'Select a territory first';
        return '';
    }

    empCoins() { return this.empires[this.player]?.coins || 0; }
    empTids() { return this.empires[this.player]?.tids || []; }

    // ── UNDO ──────────────────────────────────────────────────
    _undo() {
        if (this.undoStack.length === 0) { this.sfx.error(); this._log('Nothing to undo!'); return; }
        if (this._isAI()) { this.sfx.error(); return; }

        const snap = this.undoStack.pop();
        const emp = this.empires[this.player];

        if (snap.action === 'recruit') {
            this.ts[snap.tid].troops = snap.troops;
            emp.coins = snap.coins;
            this.stats = snap.stats;
            this._log('Undid recruit.');
        } else if (snap.action === 'veteran') {
            this.ts[snap.tid].troops = snap.troops;
            emp.coins = snap.coins;
            this.stats = snap.stats;
            this._log('Undid veteran recruit.');
        } else if (snap.action === 'fortify') {
            this.ts[snap.tid].fort = snap.fort;
            emp.coins = snap.coins;
            this._log('Undid fortify.');
        } else if (snap.action === 'weaponTier') {
            emp.coins = snap.coins;
            emp.weapons = snap.weapons;
            this._log('Undid weapon tier unlock.');
        } else if (snap.action === 'equip') {
            this.ts[snap.tid].weapon = snap.weapon;
            this._log('Undid weapon equip.');
        } else if (snap.action === 'spy') {
            emp.coins = snap.coins;
            emp.spy = false;
            this._log('Undid spy network.');
        } else if (snap.action === 'move') {
            this.ts[snap.from].troops = snap.fromTroops;
            this.ts[snap.to].troops = snap.toTroops;
            this._log('Undid move.');
        }

        if (this.undoStack.length > 20) this.undoStack.shift();
        this.sfx.click();
    }

    // ── SAVE / LOAD ────────────────────────────────────────────
    saveGame() {
        const data = {
            player: this.player,
            turn: this.turn,
            empires: {},
            ts: {},
            stats: this.stats,
            killLog: this.killLog,
            difficulty: this.difficulty,
        };
        for (const [id, emp] of Object.entries(this.empires)) {
            data.empires[id] = {
                id: emp.id, coins: emp.coins, alive: emp.alive,
                tids: [...emp.tids],
                weapons: [...emp.weapons],
                spy: emp.spy,
            };
        }
        for (const [tid, s] of Object.entries(this.ts)) {
            data.ts[tid] = { owner: s.owner, troops: s.troops, fort: s.fort, weapon: s.weapon ? s.weapon.name : 'Sword' };
        }
        localStorage.setItem('emperorsConquest_save', JSON.stringify(data));
        this._log('Game saved!');
        this.sfx.buy();
    }

    loadGame() {
        const raw = localStorage.getItem('emperorsConquest_save');
        if (!raw) { this.sfx.error(); return false; }
        try {
            const data = JSON.parse(raw);
            this.player = data.player;
            this.turn = data.turn;
            this.difficulty = data.difficulty || 'normal';
            this.stats = data.stats || { kills:0, conquered:0, coinsEarned:0, totalTroops:0 };
            this.killLog = data.killLog || {};

            // Restore empires
            this.empires = {};
            for (const [id, emp] of Object.entries(data.empires)) {
                this.empires[id] = {
                    id: emp.id, coins: emp.coins, alive: emp.alive,
                    tids: emp.tids,
                    weapons: new Set(emp.weapons),
                    spy: emp.spy,
                };
            }

            // Restore territory states — match weapon by name
            this.ts = {};
            for (const [tid, s] of Object.entries(data.ts)) {
                const weapon = this._findWeaponByName(s.weapon);
                this.ts[parseInt(tid)] = { owner: s.owner, troops: s.troops, fort: s.fort, weapon };
            }

            this.state = 'playing';
            this.phase = 'select';
            this.sel = null;
            this.aiQ = []; this.aiIdx = -1; this.aiTimer = 0;
            this.battle = null;
            this._attackTarget = null;
            this.undoStack = []; // FIX: Clear undo stack on load
            this._log('Game loaded! Continuing...');
            this.sfx.buy();
            return true;
        } catch(e) {
            this.sfx.error();
            return false;
        }
    }

    _findWeaponByName(name) {
        for (const [tier, weapons] of Object.entries(WEAPONS)) {
            for (const w of weapons) {
                if (w.name === name) return w;
            }
        }
        return WEAPONS[1][0]; // default to Sword
    }
}
