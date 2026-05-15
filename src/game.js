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

        // States: menu|empireSelect|playing|attack|battle|shop|gameover|victory|help|moveDialog
        this.state = 'menu';
        this.phase = 'select'; // sub-phases within playing: select|move|attack
        this.player = null;
        this.turn = 0;
        this.empires = {};
        this.ts = {}; // territory states
        this.sel = null;
        this.hover = null;
        this.log = [];

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

        if (this.state === 'menu') this._upMenu();
        else if (this.state === 'empireSelect') this._upEmpire();
        else if (this.state === 'playing') this._upPlay();
        else if (this.state === 'attack') this._upAttack();
        else if (this.state === 'battle') this._upBattle();
        else if (this.state === 'shop') this._upShop();
        else if (this.state === 'gameover' || this.state === 'victory') this._upEnd();
        else if (this.state === 'help') this._upHelp();
        else if (this.state === 'moveDialog') this._upMoveDialog();

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
            this.input.consumeClick();
            this.state = 'empireSelect';
            this.sfx.click();
        }
    }

    // ── EMPIRE SELECT ─────────────────────────────────────────
    _upEmpire() {
        if (!this.input.hasClick()) return;
        this.input.consumeClick();
        const sx = this.input.sx, sy = this.input.sy;
        const cols = 5, cw = Math.min(155, (this.W - 50) / cols), ch = 155, gap = 6;
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
            const t = T(tid);
            inc += 1;
            if (e.bonusType === 'income') inc += 2;
            if (e.bonusType === 'desert' && t.terrain === 'desert') inc += 3;
            if (e.bonusType === 'bonus') inc += 2;
            if (e.bonusType === 'warMachine') inc += 3;
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
            if (s.owner === this.player) { this.sel = tid; this.sfx.click(); }
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

        // Apply results
        atkS.troops = res.atkLeft;
        emp.coins += res.coins;
        this.stats.coinsEarned += res.coins;

        // FIX: Removed dead code `if (this.player === this.player)` — was always true
        this._log(`Battle! You ${res.conquered ? 'CONQUERED' : 'lost'} ${T(to).name}. +${res.coins} coins`);

        if (res.conquered) {
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
                }
            }
            defS.owner = this.player;
            defS.troops = res.atkLeft;
            atkS.troops = 1;
            emp.tids.push(to);
            this.stats.conquered++;
            this.sfx.capture();
            this.renderer.particles.push(...this._makeParticles(to, E(this.player).light));
            if (emp.tids.length === TERRITORIES.length) {
                this.state = 'victory';
                this.sfx.victory();
                return;
            }
        } else {
            defS.troops = res.defLeft;
        }

        this.state = 'battle';
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
        emp.coins -= cost; this.ts[this.sel].troops++;
        this.stats.totalTroops++;
        this._log(`Recruited soldier at ${T(this.sel).name} (-${cost} coins)`);
        this.sfx.recruit();
    }

    _buyVeteran() {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        const emp = this.empires[this.player];
        if (emp.coins < 20) { this.sfx.error(); this._log('Not enough coins!'); return; }
        emp.coins -= 20; this.ts[this.sel].troops += 2;
        this.stats.totalTroops += 2;
        this._log(`Recruited 2 veterans at ${T(this.sel).name} (-20 coins)`);
        this.sfx.recruit();
    }

    _buyFortify() {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        const emp = this.empires[this.player];
        if (emp.coins < 15) { this.sfx.error(); this._log('Not enough coins!'); return; }
        emp.coins -= 15; this.ts[this.sel].fort += 2;
        this._log(`Fortified ${T(this.sel).name} (+2 def permanently)`);
        this.sfx.buy();
    }

    _buyWeaponTier(tier) {
        const costs = { 2: 25, 3: 50, 4: 80 };
        const cost = costs[tier];
        const emp = this.empires[this.player];
        if (emp.coins < cost) { this.sfx.error(); this._log('Not enough coins!'); return; }
        emp.coins -= cost; emp.weapons.add(tier);
        this._log(`Unlocked Tier ${tier} weapons! (-${cost} coins)`);
        this.sfx.buy();
    }

    _equipWeapon(tier, idx) {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        if (!this.empires[this.player].weapons.has(tier)) { this.sfx.error(); this._log('Weapon tier locked!'); return; }
        this.ts[this.sel].weapon = WEAPONS[tier][idx];
        this._log(`Equipped ${WEAPONS[tier][idx].name} at ${T(this.sel).name}`);
        this.sfx.click();
    }

    _buySpy() {
        const emp = this.empires[this.player];
        if (emp.spy) { this.sfx.error(); this._log('Spy network already active!'); return; }
        if (emp.coins < 30) { this.sfx.error(); this._log('Not enough coins!'); return; }
        emp.coins -= 30; emp.spy = true;
        this._log('Spy network activated! Enemy troop counts revealed.');
        this.sfx.buy();
    }

    // ── END TURN ──────────────────────────────────────────────
    endTurn() {
        this.sel = null;
        this.phase = 'select';
        this._attackTarget = null;

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
                if (a.type === 'eliminated') this.sfx.elim();
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
        if (this.state === 'moveDialog') return `Move troops from ${T(this.moveFrom).name} to ${T(this.moveTo).name}`;
        if (this.phase === 'select') return this.sel ? `Selected: ${T(this.sel).name} (${this.ts[this.sel].troops} troops)` : 'Click your territory to select it';
        if (this.phase === 'move') return `Moving from ${T(this.sel).name} — click a green territory`;
        if (this.phase === 'attack') return `Attack from ${T(this.sel).name} — click a red enemy territory`;
        return '';
    }

    empCoins() { return this.empires[this.player]?.coins || 0; }
    empTids() { return this.empires[this.player]?.tids || []; }
}
