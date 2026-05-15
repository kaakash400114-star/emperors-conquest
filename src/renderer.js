import { MAP_W, MAP_H, T_RADIUS, TERRITORIES, EMPIRES, EIDS, T, E, adj, WEAPONS, SHOP, STRATEGIES, TERRAIN_ICONS, TERRAIN_COLORS } from './map.js';

export class Renderer {
    constructor(game) {
        this.g = game;
        this.ctx = game.ctx;
        this.scale = 1; this.ox = 0; this.oy = 0;
        this.shake = 0;
        this.particles = [];
        this.time = 0;
    }

    _layout() {
        const { W, H } = this.g;
        // Reserve right side for scoreboard (200px) when playing
        const usableW = (this.g.state === 'playing' || this.g.state === 'attack' ||
                         this.g.state === 'battle' || this.g.state === 'shop' ||
                         this.g.state === 'moveDialog') ? W * 0.82 : W;
        const sx = (usableW * 0.9) / MAP_W, sy = (H * 0.82) / MAP_H;
        this.scale = Math.min(sx, sy);
        this.ox = (usableW - MAP_W * this.scale) / 2;
        this.oy = (H - MAP_H * this.scale) / 2 + 30;
    }

    toScr(x, y) { return { x: x * this.scale + this.ox, y: y * this.scale + this.oy }; }

    toMap(sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }

    terrAt(sx, sy) {
        const m = this.toMap(sx, sy);
        let best = -1, bestD = T_RADIUS * T_RADIUS;
        for (const t of TERRITORIES) {
            const dx = m.x - t.cx, dy = m.y - t.cy;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = t.id; }
        }
        return best;
    }

    // ── BACKGROUND ────────────────────────────────────────────
    _bg() {
        const c = this.ctx, { W, H } = this.g;
        const gr = c.createRadialGradient(W/2, H/2, 80, W/2, H/2, W*0.7);
        gr.addColorStop(0, '#1e140e'); gr.addColorStop(0.6, '#120c07'); gr.addColorStop(1, '#080503');
        c.fillStyle = gr; c.fillRect(0, 0, W, H);
        c.strokeStyle = '#3a2515'; c.lineWidth = 2; c.strokeRect(6, 6, W-12, H-12);
        c.strokeStyle = '#2a1a0e'; c.lineWidth = 1; c.strokeRect(10, 10, W-20, H-20);
    }

    // ── MENU ──────────────────────────────────────────────────
    _menu() {
        const c = this.ctx, { W, H } = this.g;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 52px Georgia, serif';
        c.fillText("EMPEROR'S CONQUEST", W/2, H*0.18);
        c.fillStyle = '#b8860b'; c.font = '22px Georgia, serif';
        c.fillText('From Ancient India to World War II', W/2, H*0.18+45);

        c.strokeStyle = '#4a3525'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W*0.25, H*0.28); c.lineTo(W*0.75, H*0.28); c.stroke();

        c.fillStyle = '#aaa'; c.font = '16px "Segoe UI", sans-serif';
        const feats = [
            '10 Empires across 3000 years of history',
            '18 Territories spanning Europe, Asia & Africa',
            '4 Combat Strategies — Assault, Siege, Raid, Ambush',
            '4 Weapon Tiers — Swords to Tanks & Bombers',
            'Coin economy — earn from kills, buy troops & weapons',
            'Fortify territories, equip weapons, choose strategies',
        ];
        feats.forEach((f, i) => {
            c.fillStyle = '#ffd700'; c.fillText('\u2726', W/2 - 180, H*0.34 + i*28);
            c.fillStyle = '#bbb'; c.textAlign = 'left'; c.fillText(f, W/2 - 160, H*0.34 + i*28);
            c.textAlign = 'center';
        });

        // Help button
        const hbW = 130, hbH = 36, hbX = 30, hbY = H*0.82 - 20;
        this.g._helpBtnRect = { x: hbX, y: hbY, w: hbW, h: hbH };
        c.fillStyle = '#1a100a';
        this._rr(c, hbX, hbY, hbW, hbH, 6); c.fill();
        c.strokeStyle = '#ffd700'; c.lineWidth = 1.5;
        this._rr(c, hbX, hbY, hbW, hbH, 6); c.stroke();
        c.fillStyle = '#ffd700'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('How to Play', hbX + hbW/2, hbY + hbH/2);

        if (Math.floor(this.time / 30) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 24px Georgia, serif';
            c.fillText('Click anywhere to begin', W/2, H*0.82);
        }

        c.fillStyle = '#444'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText('v3.0 — Turn-Based Strategy', W/2, H*0.95);
    }

    // ── EMPIRE SELECT ─────────────────────────────────────────
    _empSel() {
        const c = this.ctx, { W, H } = this.g;
        c.textAlign = 'center'; c.fillStyle = '#ffd700'; c.font = 'bold 32px Georgia, serif';
        c.fillText('Choose Your Empire', W/2, 50);
        c.fillStyle = '#888'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText('Each has a unique bonus — click to select', W/2, 78);

        const g = this.g;
        const bbW = 70, bbH = 28, bbX = 15, bbY = 15;
        const backBtn = { label: 'Back', fn: () => { g.state = 'menu'; g.sfx.click(); } };
        backBtn.rect = { x: bbX, y: bbY, w: bbW, h: bbH };
        g.btns.push(backBtn);
        c.fillStyle = '#444';
        this._rr(c, bbX, bbY, bbW, bbH, 4); c.fill();
        c.strokeStyle = '#666'; c.lineWidth = 1;
        this._rr(c, bbX, bbY, bbW, bbH, 4); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('Back', bbX + bbW/2, bbY + bbH/2);

        const cols = 5, cw = Math.min(155, (W-50)/cols), ch = 155, gap = 6;
        const rows = Math.ceil(EIDS.length / cols);
        const totalW = cw * cols + gap * (cols - 1);
        const sx = (W - totalW) / 2, sy = (H - ch*rows - gap*(rows-1))/2 + 30;

        for (let i = 0; i < EIDS.length; i++) {
            const eid = EIDS[i], em = EMPIRES[eid];
            const col = i % cols, row = Math.floor(i / cols);
            const x = sx + col*(cw+gap), y = sy + row*(ch+gap);
            const hover = this.g.input.hoverX >= x && this.g.input.hoverX <= x+cw &&
                          this.g.input.hoverY >= y && this.g.input.hoverY <= y+ch;

            c.fillStyle = hover ? '#2a1a0e' : '#1a100a';
            c.strokeStyle = em.color; c.lineWidth = hover ? 2.5 : 1.5;
            this._rr(c, x, y, cw, ch, 8); c.fill(); c.stroke();

            c.fillStyle = em.color; c.fillRect(x+1, y+1, cw-2, 5);

            c.fillStyle = em.color; c.font = '24px serif';
            c.fillText(em.icon || '?', x+cw/2, y+30);
            c.fillStyle = '#fff'; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(em.name, x+cw/2, y+55);

            c.fillStyle = '#777'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(em.era, x+cw/2, y+72);

            c.fillStyle = '#ffd700'; c.font = '10px "Segoe UI", sans-serif';
            const words = em.bonus.split(' ');
            let ly = y + 90;
            for (let wi = 0; wi < words.length; wi += 3) {
                c.fillText(words.slice(wi, wi+3).join(' '), x+cw/2, ly);
                ly += 13;
            }
        }
    }

    // ── HELP SCREEN ───────────────────────────────────────────
    _helpScreen() {
        const c = this.ctx, { W, H } = this.g;
        c.fillStyle = 'rgba(0,0,0,0.85)';
        c.fillRect(0, 0, W, H);

        const pw = 500, ph = 480, px = (W - pw)/2, py = (H - ph)/2;
        c.fillStyle = 'rgba(20,14,8,0.97)';
        this._rr(c, px, py, pw, ph, 12); c.fill();
        c.strokeStyle = '#ffd700'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 26px Georgia, serif';
        c.fillText('How to Play', px + pw/2, py + 32);

        c.strokeStyle = '#4a3525'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 30, py + 55); c.lineTo(px + pw - 30, py + 55); c.stroke();

        const sections = [
            { header: 'SELECT', color: '#3498db', text: 'Click your territory to select it' },
            { header: 'RECRUIT', color: '#2ecc71', text: 'Buy soldiers (+1) or veterans (+2) with coins' },
            { header: 'FORTIFY', color: '#3498db', text: 'Spend 15 coins for +2 permanent defense' },
            { header: 'MOVE', color: '#9b59b6', text: 'Move troops between your adjacent territories' },
            { header: 'ATTACK', color: '#e74c3c', text: 'Attack enemies with dice + bonuses' },
            { header: 'WEAPONS', color: '#f39c12', text: 'Unlock tiers in shop, equip on territories' },
            { header: 'SPY', color: '#1abc9c', text: 'Buy spy network (30c) to see enemy troops' },
            { header: 'INCOME', color: '#ffd700', text: 'Base 3 + 1/territory + empire bonus per turn' },
            { header: 'WIN', color: '#e74c3c', text: 'Control all 18 territories to win!' },
        ];

        let sy = py + 72;
        for (const sec of sections) {
            c.textAlign = 'left';
            c.fillStyle = sec.color; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(sec.header, px + 30, sy);
            c.fillStyle = '#bbb'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText(sec.text, px + 105, sy);
            sy += 28;
        }

        c.textAlign = 'center';
        c.fillStyle = '#666'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText('Click anywhere to close', px + pw/2, py + ph - 20);
    }

    // ── GAME WORLD ────────────────────────────────────────────
    _world() {
        const c = this.ctx;
        if (this.shake > 0.3) {
            c.save();
            c.translate((Math.random()-0.5)*this.shake*2, (Math.random()-0.5)*this.shake*2);
            this.shake *= 0.9;
        }
        this._connections();
        this._territories();
        this._drawParticles();
        if (this.shake > 0.3) c.restore();
    }

    _connections() {
        const c = this.ctx;
        const drawn = new Set();
        for (const t of TERRITORIES) {
            for (const a of t.adj) {
                const key = Math.min(t.id,a)+'-'+Math.max(t.id,a);
                if (drawn.has(key)) continue;
                drawn.add(key);
                const p1 = this.toScr(t.cx, t.cy), p2 = this.toScr(T(a).cx, T(a).cy);
                const s1 = this.g.ts[t.id], s2 = this.g.ts[a];
                if (s1 && s2 && s1.owner && s2.owner && s1.owner === s2.owner) {
                    c.strokeStyle = EMPIRES[s1.owner].color + '40';
                    c.lineWidth = 2 * this.scale;
                } else {
                    c.strokeStyle = 'rgba(255,255,255,0.06)';
                    c.lineWidth = 1;
                }
                c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
            }
        }
    }

    _territories() {
        const c = this.ctx, g = this.g;
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s) continue;
            const p = this.toScr(t.cx, t.cy);
            const r = T_RADIUS * this.scale;
            const em = s.owner ? EMPIRES[s.owner] : null;
            const isSel = g.sel === t.id;
            const isHov = g.hover === t.id;
            const isMoveT = g.phase === 'move' && g.sel != null && s.owner === g.player && adj(g.sel, t.id) && t.id !== g.sel;
            const isAtkT = (g.phase === 'attack' || g.state === 'attack') && g.sel != null && s.owner !== g.player && adj(g.sel, t.id);
            const isPlayerTerr = s.owner === g.player;

            // ── Pulsing animation on player territories ──
            if (isPlayerTerr && !g._isAI()) {
                const pulse = 0.08 + Math.sin(this.time * 0.04 + t.id * 0.7) * 0.05;
                c.beginPath(); c.arc(p.x, p.y, r + 8 * this.scale, 0, Math.PI * 2);
                c.fillStyle = `rgba(255,215,0,${pulse})`;
                c.fill();
            }

            // Target glows
            if (isMoveT) {
                c.beginPath(); c.arc(p.x, p.y, r+6*this.scale, 0, Math.PI*2);
                c.fillStyle = 'rgba(46,204,113,'+(0.25+Math.sin(this.time*0.08)*0.15)+')';
                c.fill();
            }
            if (isAtkT) {
                c.beginPath(); c.arc(p.x, p.y, r+6*this.scale, 0, Math.PI*2);
                c.fillStyle = 'rgba(231,76,60,'+(0.3+Math.sin(this.time*0.08)*0.15)+')';
                c.fill();
            }
            if (isSel) {
                c.beginPath(); c.arc(p.x, p.y, r+7*this.scale, 0, Math.PI*2);
                c.fillStyle = 'rgba(255,215,0,0.3)'; c.fill();
            }
            if (isHov && !isSel) {
                c.beginPath(); c.arc(p.x, p.y, r+4*this.scale, 0, Math.PI*2);
                c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill();
            }

            // ── Territory circle ──
            c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI*2);
            if (em) {
                const gr = c.createRadialGradient(p.x-r*0.3, p.y-r*0.3, 0, p.x, p.y, r);
                gr.addColorStop(0, em.light); gr.addColorStop(1, em.dark);
                c.fillStyle = gr;
            } else {
                c.fillStyle = '#444';
            }
            c.fill();

            // ── Terrain type color overlay ──
            const terrainColor = TERRAIN_COLORS[t.terrain];
            if (terrainColor) {
                c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI*2);
                c.fillStyle = terrainColor; c.fill();
            }

            c.strokeStyle = isSel ? '#ffd700' : (isHov ? '#ccc' : 'rgba(255,255,255,0.2)');
            c.lineWidth = (isSel ? 3 : 1.5) * this.scale;
            c.stroke();

            // ── Terrain icon (top-left of circle) ──
            const terrainIcon = TERRAIN_ICONS[t.terrain];
            if (terrainIcon) {
                c.fillStyle = 'rgba(255,255,255,0.35)';
                c.font = `${Math.round(9*this.scale)}px sans-serif`;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText(terrainIcon, p.x - r * 0.55, p.y - r * 0.55);
            }

            // ── Fort level with shield icons ──
            if (s.fort > 0) {
                const shields = Math.min(Math.ceil(s.fort / 2), 4);
                c.fillStyle = '#3498db'; c.font = `bold ${Math.round(10*this.scale)}px sans-serif`;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText('\u{1F6E1}' + shields, p.x + r*0.6, p.y - r*0.6);
            }

            // ── Weapon tier indicator (bottom-right of circle) ──
            if (s.weapon && s.weapon.name !== 'Sword') {
                const tierNum = this._weaponTier(s.weapon);
                if (tierNum > 0) {
                    c.fillStyle = tierNum >= 4 ? '#e74c3c' : (tierNum >= 3 ? '#f39c12' : '#3498db');
                    c.font = `bold ${Math.round(8*this.scale)}px sans-serif`;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.fillText('T' + tierNum, p.x + r*0.6, p.y + r*0.6);
                }
            }

            // ── Troops — hide enemy counts without spy ──
            c.fillStyle = em ? em.text : '#fff';
            c.font = `bold ${Math.round(17*this.scale)}px "Segoe UI", sans-serif`;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            const hideTroops = s.owner && s.owner !== g.player && !(g.empires[g.player]?.spy);
            c.fillText(hideTroops ? '?' : s.troops, p.x, p.y + r*0.15);

            // ── Name ──
            c.fillStyle = 'rgba(255,255,255,0.6)';
            c.font = `${Math.round(8*this.scale)}px "Segoe UI", sans-serif`;
            c.fillText(t.name, p.x, p.y + r + 10*this.scale);

            // ── Empire name on hover/select ──
            if (em && (isSel || isHov)) {
                c.fillStyle = em.color;
                c.font = `bold ${Math.round(9*this.scale)}px "Segoe UI", sans-serif`;
                c.fillText(em.name, p.x, p.y - r - 8*this.scale);
            }

            // ── Weapon name (above troops) ──
            if (s.weapon && s.weapon.name !== 'Sword') {
                c.fillStyle = '#ffd700'; c.font = `${Math.round(7*this.scale)}px sans-serif`;
                c.fillText(s.weapon.name.substring(0,6), p.x, p.y - r*0.15);
            }
        }
    }

    _weaponTier(weapon) {
        for (const [tier, weapons] of Object.entries(WEAPONS)) {
            if (weapons.includes(weapon)) return parseInt(tier);
        }
        return 0;
    }

    _drawParticles() {
        const c = this.ctx;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= p.decay;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
            c.globalAlpha = p.life; c.fillStyle = p.color;
            c.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
        }
        c.globalAlpha = 1;
    }

    // ── HUD ───────────────────────────────────────────────────
    _hud() {
        const c = this.ctx, g = this.g, { W } = g;
        const emp = g.empires[g.player], em = EMPIRES[g.player];
        if (!emp) return;

        // Top bar
        c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, 0, W, 50);
        c.fillStyle = em.color; c.fillRect(10, 8, 5, 34);
        c.fillStyle = '#fff'; c.font = 'bold 15px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(em.name, 22, 20);
        c.fillStyle = '#ffd700'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Coins: ${emp.coins}`, 22, 40);
        c.fillStyle = '#e74c3c';
        c.fillText(`Territories: ${emp.tids.length}/${TERRITORIES.length}`, 150, 40);
        const totalTroops = emp.tids.reduce((s,id) => s + g.ts[id].troops, 0);
        c.fillStyle = '#aaa'; c.fillText(`Troops: ${totalTroops}`, 340, 40);

        // Alive/dead empire count
        const aliveCount = EIDS.filter(id => g.empires[id]?.alive).length;
        c.textAlign = 'right';
        c.fillStyle = '#888';
        c.fillText(`Turn ${g.turn}  |  ${aliveCount} empires alive`, W - 15, 20);
        c.fillStyle = '#ffd700'; c.fillText(g._isAI() ? 'AI Turn' : 'Your Turn', W - 15, 40);

        // Phase bar
        const msg = g.phaseMsg();
        if (msg) {
            const bh = 32, by = g.H - bh - 40;
            c.fillStyle = 'rgba(0,0,0,0.55)';
            this._rr(c, 12, by, W-24, bh, 6); c.fill();
            c.fillStyle = '#ddd'; c.font = '13px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(msg, W/2, by + bh/2);
        }

        // Buttons
        g.btns = [];
        if (g._isAI()) return;

        const btnY = 55, btnH = 32, gap = 6;
        const hasSel = g.sel != null && g.ts[g.sel]?.owner === g.player;
        const hasAdjEnemy = hasSel && T(g.sel).adj.some(a => g.ts[a].owner !== g.player);
        const hasAdjAlly = hasSel && T(g.sel).adj.some(a => g.ts[a].owner === g.player && a !== g.sel);
        const canMove = hasSel && g.ts[g.sel].troops > 1 && hasAdjAlly;
        const soldierCost = g.player === 'russia' ? 5 : 10;

        const btns = [
            { label: `Soldier (${soldierCost}c)`, active: hasSel && emp.coins >= soldierCost, fn: () => g._buySoldier() },
            { label: 'Veteran (20c)', active: hasSel && emp.coins >= 20, fn: () => g._buyVeteran() },
            { label: 'Move', active: canMove, fn: () => { g.phase = 'move'; g.sfx.click(); } },
            { label: 'Attack', active: hasSel && hasAdjEnemy && g.ts[g.sel].troops > 1, fn: () => { g.phase = 'attack'; g._attackTarget = null; g.sfx.click(); } },
            { label: 'Shop', active: true, fn: () => { g.state = 'shop'; g.sfx.click(); } },
            { label: 'End Turn', active: true, fn: () => g.endTurn() },
            { label: 'Cancel', active: g.phase !== 'select', fn: () => { g.phase = 'select'; g.sfx.click(); } },
        ];

        let x = 10;
        c.textBaseline = 'middle';
        for (const b of btns) {
            c.font = 'bold 12px "Segoe UI", sans-serif';
            const tw = c.measureText(b.label).width + 18;
            b.rect = { x, y: btnY, w: tw, h: btnH };
            g.btns.push(b);

            c.fillStyle = b.active ? '#8b0000' : '#222';
            this._rr(c, x, btnY, tw, btnH, 5); c.fill();
            c.strokeStyle = b.active ? '#c0392b' : '#444'; c.lineWidth = 1;
            this._rr(c, x, btnY, tw, btnH, 5); c.stroke();
            c.fillStyle = b.active ? '#fff' : '#666'; c.textAlign = 'center';
            c.fillText(b.label, x + tw/2, btnY + btnH/2);
            x += tw + gap;
        }
    }

    // ── EMPIRE SCOREBOARD PANEL (right side) ──────────────────
    _scoreboard() {
        const c = this.ctx, g = this.g;
        const panelW = 190;
        const px = g.W - panelW - 8;
        const py = 55;
        const ph = g.H - py - 55;

        // Panel background
        c.fillStyle = 'rgba(10,6,4,0.85)';
        this._rr(c, px, py, panelW, ph, 8); c.fill();
        c.strokeStyle = '#3a2515'; c.lineWidth = 1;
        this._rr(c, px, py, panelW, ph, 8); c.stroke();

        // Title
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('EMPIRES', px + panelW/2, py + 16);

        // Divider
        c.strokeStyle = '#3a2515'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 10, py + 28); c.lineTo(px + panelW - 10, py + 28); c.stroke();

        let y = py + 42;
        c.textAlign = 'left';

        for (const eid of EIDS) {
            const em = EMPIRES[eid];
            const emp = g.empires[eid];
            const isPlayer = eid === g.player;
            const alive = emp?.alive;
            const tCount = emp ? emp.tids.length : 0;

            // Background highlight for player
            if (isPlayer) {
                c.fillStyle = 'rgba(255,215,0,0.06)';
                this._rr(c, px + 4, y - 10, panelW - 8, 30, 4); c.fill();
            }

            // Color indicator
            c.fillStyle = alive ? em.color : '#333';
            c.fillRect(px + 8, y - 5, 4, 18);

            // Empire name
            c.font = `${isPlayer ? 'bold ' : ''}11px "Segoe UI", sans-serif`;
            c.fillStyle = alive ? (isPlayer ? '#ffd700' : '#ccc') : '#555';
            c.fillText(em.name.substring(0, 15), px + 18, y + 2);

            // Status line
            c.font = '9px "Segoe UI", sans-serif';
            if (alive) {
                c.fillStyle = '#888';
                c.fillText(`${tCount} terr | ${emp.coins}c`, px + 18, y + 14);
            } else {
                c.fillStyle = '#e74c3c';
                c.fillText('ELIMINATED', px + 18, y + 14);
            }

            y += 34;
        }

        // Player stats at bottom
        y = py + ph - 70;
        c.strokeStyle = '#3a2515'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 10, y); c.lineTo(px + panelW - 10, y); c.stroke();

        const stats = g.stats;
        c.fillStyle = '#ffd700'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText('YOUR STATS', px + panelW/2, y + 14);

        c.textAlign = 'left'; c.font = '10px "Segoe UI", sans-serif';
        c.fillStyle = '#aaa';
        c.fillText(`Kills: ${stats.kills}`, px + 12, y + 30);
        c.fillText(`Conquered: ${stats.conquered}`, px + 100, y + 30);
        c.fillText(`Coins earned: ${stats.coinsEarned}`, px + 12, y + 44);
        c.fillText(`Total troops: ${stats.totalTroops}`, px + 100, y + 44);
    }

    // ── MOVE DIALOG ───────────────────────────────────────────
    _moveDialog() {
        const c = this.ctx, g = this.g;
        const fromT = T(g.moveFrom), toT = T(g.moveTo);
        const fromS = g.ts[g.moveFrom], toS = g.ts[g.moveTo];
        const available = fromS.troops - 1;

        const pw = 320, ph = 280, px = (g.W - pw)/2, py = (g.H - ph)/2;
        c.fillStyle = 'rgba(15,10,5,0.95)';
        this._rr(c, px, py, pw, ph, 10); c.fill();
        c.strokeStyle = '#2ecc71'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 10); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#2ecc71'; c.font = 'bold 20px Georgia, serif';
        c.fillText('Move Troops', px + pw/2, py + 28);

        c.fillStyle = '#ddd'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`From: ${fromT.name} (${fromS.troops} troops)`, px + pw/2, py + 58);
        c.fillText(`To: ${toT.name} (${toS.troops} troops)`, px + pw/2, py + 80);

        c.fillStyle = '#aaa'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(`Available: ${available}`, px + pw/2, py + 110);
        c.fillStyle = '#ffd700'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText(`Moving: ${g.moveAmount}`, px + pw/2, py + 132);

        g.btns = [];

        const adjBtns = [
            { label: '-5', fn: () => g.moveDialogAdjust(-5) },
            { label: '-1', fn: () => g.moveDialogAdjust(-1) },
            { label: '+1', fn: () => g.moveDialogAdjust(1) },
            { label: '+5', fn: () => g.moveDialogAdjust(5) },
        ];
        let bx = px + (pw - (adjBtns.length * 52 + (adjBtns.length - 1) * 6)) / 2;
        const aby = py + 155;
        for (const b of adjBtns) {
            const bw = 52, bh = 30;
            const btn = { label: b.label, fn: b.fn };
            btn.rect = { x: bx, y: aby, w: bw, h: bh };
            g.btns.push(btn);
            c.fillStyle = '#1a0a05';
            this._rr(c, bx, aby, bw, bh, 4); c.fill();
            c.strokeStyle = '#8b0000'; c.lineWidth = 1;
            this._rr(c, bx, aby, bw, bh, 4); c.stroke();
            c.fillStyle = '#fff'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(b.label, bx + bw/2, aby + bh/2);
            bx += bw + 6;
        }

        const maW = 80, maX = px + pw/2 - maW/2, maY = py + 195;
        const maBtn = { label: 'Move All', fn: () => g.moveDialogAdjust(9999) };
        maBtn.rect = { x: maX, y: maY, w: maW, h: 26 };
        g.btns.push(maBtn);
        c.fillStyle = '#1a0a05';
        this._rr(c, maX, maY, maW, 26, 4); c.fill();
        c.strokeStyle = '#b8860b'; c.lineWidth = 1;
        this._rr(c, maX, maY, maW, 26, 4); c.stroke();
        c.fillStyle = '#ffd700'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.fillText('Move All', maX + maW/2, maY + 13);

        const cmW = 120, cmH = 32;
        const cmX = px + pw/2 - cmW - 8, cmY = py + ph - 42;
        const cmBtn = { label: 'Confirm Move', fn: () => g.moveDialogConfirm() };
        cmBtn.rect = { x: cmX, y: cmY, w: cmW, h: cmH };
        g.btns.push(cmBtn);
        c.fillStyle = '#1a4a2a';
        this._rr(c, cmX, cmY, cmW, cmH, 5); c.fill();
        c.strokeStyle = '#2ecc71'; c.lineWidth = 1.5;
        this._rr(c, cmX, cmY, cmW, cmH, 5); c.stroke();
        c.fillStyle = '#2ecc71'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('Confirm Move', cmX + cmW/2, cmY + cmH/2);

        const caW = 80, caH = 32;
        const caX = px + pw/2 + 8, caY = py + ph - 42;
        const caBtn = { label: 'Cancel', fn: () => g.moveDialogCancel() };
        caBtn.rect = { x: caX, y: caY, w: caW, h: caH };
        g.btns.push(caBtn);
        c.fillStyle = '#4a1a1a';
        this._rr(c, caX, caY, caW, caH, 5); c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 1.5;
        this._rr(c, caX, caY, caW, caH, 5); c.stroke();
        c.fillStyle = '#e74c3c'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('Cancel', caX + caW/2, caY + caH/2);
    }

    // ── MAIN RENDER ───────────────────────────────────────────
    render() {
        this._layout();
        this.time++;
        const c = this.ctx, g = this.g;
        this._bg();

        const showWorld = g.state === 'playing' || g.state === 'moveDialog' ||
                          g.state === 'attack' || g.state === 'battle' ||
                          g.state === 'shop';
        const showHUD = showWorld;
        const showScoreboard = showWorld;

        if (g.state === 'menu') this._menu();
        else if (g.state === 'help') this._helpScreen();
        else if (g.state === 'empireSelect') this._empSel();
        else if (g.state === 'playing') {
            this._world(); this._hud(); this._scoreboard(); this._logPanel();
        }
        else if (g.state === 'moveDialog') {
            this._world(); this._hud(); this._scoreboard(); this._moveDialog(); this._logPanel();
        }
        else if (g.state === 'attack') {
            this._world(); this._hud(); this._scoreboard(); this._attackPanel(); this._logPanel();
        }
        else if (g.state === 'battle') {
            this._world(); this._hud(); this._scoreboard(); this._battleOverlay(); this._logPanel();
        }
        else if (g.state === 'shop') {
            this._world(); this._hud(); this._scoreboard(); this._shopPanel(); this._logPanel();
        }
        else if (g.state === 'gameover') this._defeat();
        else if (g.state === 'victory') this._victory();
    }

    // ── ATTACK PANEL ──────────────────────────────────────────
    _attackPanel() {
        const c = this.ctx, g = this.g;

        // FIX: Only set default attack target if it hasn't been set yet this panel open.
        // Previously this reset _attackTarget every frame, breaking manual target selection.
        if (g._attackTarget === null || g._attackTarget === undefined) {
            const targets = T(g.sel).adj.filter(a => g.ts[a].owner !== g.player);
            g._attackTarget = targets.length === 1 ? targets[0] : null;
        }

        const pw = 350, ph = 480, px = (g.W - pw)/2, py = (g.H - ph)/2;
        c.fillStyle = 'rgba(15,10,5,0.92)';
        this._rr(c, px, py, pw, ph, 10); c.fill();
        c.strokeStyle = '#c0392b'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 10); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#e74c3c'; c.font = 'bold 22px Georgia, serif';
        c.fillText('Choose Strategy', px+pw/2, py+30);

        // Show attacker and defender territory names
        const atkName = T(g.sel).name;
        const defName = g._attackTarget != null ? T(g._attackTarget).name : '???';
        c.fillStyle = EMPIRES[g.player].color; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`${atkName} (${g.ts[g.sel].troops} troops)`, px + pw/2, py + 55);
        c.fillStyle = '#e74c3c'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(`Target: ${defName}`, px + pw/2, py + 72);

        g.btns = [];
        // Back button
        const backBtn = { label: 'Back', fn: () => { g.state = 'playing'; g.phase = 'select'; g._attackTarget = null; g.sfx.click(); } };
        const btw = 70, btx = px + pw - btw - 15, bty = py + 10;
        backBtn.rect = { x: btx, y: bty, w: btw, h: 28 };
        g.btns.push(backBtn);
        c.fillStyle = '#444'; this._rr(c, btx, bty, btw, 28, 4); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.fillText('Back', btx+btw/2, bty+14);

        // Target selection
        const allTargets = T(g.sel).adj.filter(a => g.ts[a].owner !== g.player);
        let btnStartY = py + 88;
        if (allTargets.length > 1) {
            c.fillStyle = '#888'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText('Select target:', px+pw/2, btnStartY);
            btnStartY += 18;

            let tx = px + 15;
            for (const tid of allTargets) {
                const em = g.ts[tid].owner ? EMPIRES[g.ts[tid].owner] : null;
                const lbl = `${T(tid).name} (${g.ts[tid].troops})`;
                c.font = 'bold 11px "Segoe UI", sans-serif';
                const tw = c.measureText(lbl).width + 16;
                const isTarget = g._attackTarget === tid;
                const btn = { label: lbl, fn: () => { g._attackTarget = tid; g.sfx.click(); } };
                btn.rect = { x: tx, y: btnStartY, w: tw, h: 26 };
                g.btns.push(btn);
                c.fillStyle = isTarget ? '#8b0000' : '#333';
                this._rr(c, tx, btnStartY, tw, 26, 4); c.fill();
                c.strokeStyle = isTarget ? '#e74c3c' : '#555'; c.lineWidth = 1;
                this._rr(c, tx, btnStartY, tw, 26, 4); c.stroke();
                c.fillStyle = isTarget ? '#fff' : '#aaa'; c.textAlign = 'center';
                c.fillText(lbl, tx+tw/2, btnStartY+13);
                tx += tw + 6;
                if (tx > px + pw - 80) { tx = px + 15; btnStartY += 32; }
            }
            btnStartY += 35;
        }

        // Weapon equip section
        const emp = g.empires[g.player];
        c.textAlign = 'left';
        c.fillStyle = '#f39c12'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.fillText('EQUIP WEAPON:', px + 15, btnStartY);
        btnStartY += 18;

        const availableWeapons = [];
        if (WEAPONS[1]) {
            for (let wi = 0; wi < WEAPONS[1].length; wi++) {
                availableWeapons.push({ tier: 1, wi, w: WEAPONS[1][wi] });
            }
        }
        for (let tier = 2; tier <= 4; tier++) {
            if (emp.weapons.has(tier) && WEAPONS[tier]) {
                for (let wi = 0; wi < WEAPONS[tier].length; wi++) {
                    availableWeapons.push({ tier, wi, w: WEAPONS[tier][wi] });
                }
            }
        }

        let wx = px + 15;
        for (const aw of availableWeapons) {
            const lbl = aw.w.name.substring(0, 6);
            c.font = '10px "Segoe UI", sans-serif';
            const tw = c.measureText(lbl).width + 12;
            const equipped = g.sel != null && g.ts[g.sel].weapon === aw.w;
            const btn = { label: lbl, fn: () => g._equipWeapon(aw.tier, aw.wi) };
            btn.rect = { x: wx, y: btnStartY, w: tw, h: 20 };
            g.btns.push(btn);
            c.fillStyle = equipped ? '#3a2010' : '#1a0a05';
            this._rr(c, wx, btnStartY, tw, 20, 3); c.fill();
            c.strokeStyle = equipped ? '#ffd700' : '#444'; c.lineWidth = 1;
            this._rr(c, wx, btnStartY, tw, 20, 3); c.stroke();
            c.fillStyle = equipped ? '#ffd700' : '#bbb'; c.textAlign = 'center';
            c.fillText(lbl, wx + tw/2, btnStartY + 10);
            wx += tw + 4;
            if (wx > px + pw - 50) { wx = px + 15; btnStartY += 24; }
        }
        btnStartY += 30;

        // Strategy buttons
        for (let i = 0; i < STRATEGIES.length; i++) {
            const str = STRATEGIES[i];
            const by = btnStartY + i * 52;
            const canUse = !str.needTerrain || str.needTerrain.includes(T(g.sel).terrain);
            const btn = { label: str.name, fn: () => { if (g._attackTarget != null) g._doAttack(i); else g.sfx.error(); } };
            btn.rect = { x: px+15, y: by, w: pw-30, h: 44 };
            g.btns.push(btn);

            c.fillStyle = canUse ? '#1a0a05' : '#111';
            this._rr(c, px+15, by, pw-30, 44, 6); c.fill();
            c.strokeStyle = canUse ? '#8b0000' : '#333'; c.lineWidth = 1;
            this._rr(c, px+15, by, pw-30, 44, 6); c.stroke();

            c.textAlign = 'left';
            c.fillStyle = canUse ? '#e74c3c' : '#555'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText(str.name, px+25, by+16);
            c.fillStyle = canUse ? '#888' : '#444'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText(str.desc, px+25, by+34);
        }
    }

    // ── BATTLE OVERLAY ────────────────────────────────────────
    _battleOverlay() {
        const c = this.ctx, g = this.g, b = g.battle;
        if (!b) return;
        c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(0, 0, g.W, g.H);
        const cx = g.W/2, cy = g.H/2;

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#e74c3c'; c.font = 'bold 30px Georgia, serif';
        c.fillText('BATTLE RESULTS', cx, cy-130);

        // Territory names
        c.fillStyle = '#888'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(`${T(b.from).name} → ${T(b.to).name}`, cx, cy-108);

        // Attacker
        c.fillStyle = EMPIRES[b.atk].color; c.font = 'bold 18px "Segoe UI", sans-serif';
        c.fillText(EMPIRES[b.atk].name, cx-140, cy-85);
        c.fillStyle = '#888'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Weapon: ${b.res.atkWeapon}`, cx-140, cy-65);
        c.fillText(`Bonus: +${b.res.atkBonus}`, cx-140, cy-48);

        // VS
        c.fillStyle = '#ffd700'; c.font = 'bold 24px Georgia, serif';
        c.fillText('VS', cx, cy-75);

        // Defender
        const defEm = b.def ? EMPIRES[b.def] : null;
        c.fillStyle = defEm ? defEm.color : '#888'; c.font = 'bold 18px "Segoe UI", sans-serif';
        c.fillText(defEm ? defEm.name : 'Neutral', cx+140, cy-85);
        c.fillStyle = '#888'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Weapon: ${b.res.defWeapon}`, cx+140, cy-65);
        c.fillText(`Bonus: +${b.res.defBonus}`, cx+140, cy-48);

        // Strategy
        c.fillStyle = '#aaa'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText(`Strategy: ${b.res.strategy}`, cx, cy-30);

        // Dice
        const r = b.res;
        let dy = cy;
        c.font = '13px "Segoe UI", sans-serif';
        c.fillStyle = '#ccc'; c.fillText('Attack Dice', cx-130, dy);
        c.fillText('Defense Dice', cx+130, dy);
        dy += 20;
        for (let i = 0; i < Math.max(r.atkRolls.length, r.defRolls.length); i++) {
            if (i < r.atkRolls.length) {
                const won = r.details[i]?.winner === 'atk';
                const crit = r.details[i]?.atkCrit;
                const col = crit ? '#ffd700' : (won ? '#2ecc71' : '#e74c3c');
                this._die(c, cx-155+i*35, dy, 28, r.atkRolls[i], col);
                if (crit) {
                    c.fillStyle = '#ffd700'; c.font = 'bold 8px sans-serif';
                    c.fillText('CRIT!', cx-155+i*35+14, dy+34);
                }
            }
            if (i < r.defRolls.length) {
                const won = r.details[i]?.winner === 'def';
                const crit = r.details[i]?.defCrit;
                const col = crit ? '#ffd700' : (won ? '#2ecc71' : '#e74c3c');
                this._die(c, cx+85+i*35, dy, 28, r.defRolls[i], col);
                if (crit) {
                    c.fillStyle = '#ffd700'; c.font = 'bold 8px sans-serif';
                    c.fillText('CRIT!', cx+85+i*35+14, dy+34);
                }
            }
        }

        // Result
        const ry = cy + 65;
        c.font = 'bold 20px "Segoe UI", sans-serif';
        if (r.conquered) {
            c.fillStyle = '#ffd700'; c.fillText('TERRITORY CONQUERED!', cx, ry);
        } else {
            c.fillStyle = '#e74c3c'; c.fillText(`Attackers lost ${r.atkLoss} | Defenders lost ${r.defLoss}`, cx, ry);
        }
        c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText(`+${r.coins} coins`, cx, ry + 28);
        c.fillStyle = '#888'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Attacker: ${r.atkLeft} remaining | Defender: ${r.defLeft} remaining`, cx, ry + 50);

        if (Math.floor(this.time/25) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
            c.fillText('Click anywhere to continue', cx, ry + 85);
        }
    }

    _die(c, x, y, sz, val, col) {
        c.fillStyle = col; this._rr(c, x, y, sz, sz, 4); c.fill();
        c.fillStyle = '#fff'; c.font = `bold ${sz*0.5}px "Segoe UI", sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(val, x+sz/2, y+sz/2);
    }

    // ── SHOP PANEL ────────────────────────────────────────────
    _shopPanel() {
        const c = this.ctx, g = this.g, emp = g.empires[g.player];
        if (!emp) return;
        const pw = 400, ph = 480, px = (g.W-pw)/2, py = (g.H-ph)/2;
        c.fillStyle = 'rgba(15,10,5,0.93)';
        this._rr(c, px, py, pw, ph, 10); c.fill();
        c.strokeStyle = '#ffd700'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 10); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 24px Georgia, serif';
        c.fillText('Armory & Shop', px+pw/2, py+30);
        c.fillStyle = '#ffd700'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText(`Coins: ${emp.coins}`, px+pw/2, py+52);

        g.btns = [];
        const cb = { label: 'X', fn: () => { g.state = 'playing'; g.sfx.click(); } };
        cb.rect = { x: px+pw-35, y: py+10, w: 25, h: 25 };
        g.btns.push(cb);
        c.fillStyle = '#8b0000'; this._rr(c, px+pw-35, py+10, 25, 25, 4); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif'; c.fillText('X', px+pw-22, py+23);

        let y = py + 75;
        c.fillStyle = '#e74c3c'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'left';
        c.fillText('TROOPS', px+20, y); y += 22;
        const troopItems = [
            { label: `Soldier +1 troop (${g.player==='russia'?5:10}c)`, fn: () => g._buySoldier(), cost: g.player==='russia'?5:10 },
            { label: 'Veteran +2 troops (20c)', fn: () => g._buyVeteran(), cost: 20 },
            { label: 'Fortify +2 def permanent (15c)', fn: () => g._buyFortify(), cost: 15 },
        ];
        for (const it of troopItems) {
            const bw = pw-40;
            const btn = { label: it.label, fn: it.fn };
            btn.rect = { x: px+20, y, w: bw, h: 28 };
            g.btns.push(btn);
            c.fillStyle = emp.coins >= it.cost ? '#1a0a05' : '#111';
            this._rr(c, px+20, y, bw, 28, 4); c.fill();
            c.strokeStyle = emp.coins >= it.cost ? '#8b0000' : '#333'; c.lineWidth = 1;
            this._rr(c, px+20, y, bw, 28, 4); c.stroke();
            c.fillStyle = emp.coins >= it.cost ? '#ddd' : '#555'; c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(it.label, px+20+bw/2, y+14);
            y += 34;
        }

        // Spy Network
        if (emp.spy) {
            const spyLbl = 'Spy Network (Active)';
            const sbw = pw - 40;
            c.fillStyle = '#0a1a10';
            this._rr(c, px+20, y, sbw, 28, 4); c.fill();
            c.strokeStyle = '#2ecc71'; c.lineWidth = 1;
            this._rr(c, px+20, y, sbw, 28, 4); c.stroke();
            c.fillStyle = '#2ecc71'; c.font = 'bold 12px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(spyLbl, px+20+sbw/2, y+14);
        } else {
            const spyLbl = 'Spy Network - See enemy troops (30c)';
            const sbw = pw - 40;
            const spyBtn = { label: spyLbl, fn: () => g._buySpy() };
            spyBtn.rect = { x: px+20, y, w: sbw, h: 28 };
            g.btns.push(spyBtn);
            c.fillStyle = emp.coins >= 30 ? '#1a0a05' : '#111';
            this._rr(c, px+20, y, sbw, 28, 4); c.fill();
            c.strokeStyle = emp.coins >= 30 ? '#8b0000' : '#333'; c.lineWidth = 1;
            this._rr(c, px+20, y, sbw, 28, 4); c.stroke();
            c.fillStyle = emp.coins >= 30 ? '#ddd' : '#555'; c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(spyLbl, px+20+sbw/2, y+14);
        }
        y += 38;

        // Weapons
        y += 4;
        c.fillStyle = '#3498db'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'left';
        c.fillText('WEAPONS', px+20, y); y += 5;

        for (let tier = 2; tier <= 4; tier++) {
            y += 22;
            const unlocked = emp.weapons.has(tier);
            const costs = { 2:25, 3:50, 4:80 };
            const tierNames = { 2:'Medieval', 3:'Gunpowder', 4:'Modern' };
            c.fillStyle = unlocked ? '#2ecc71' : '#888'; c.font = 'bold 12px "Segoe UI", sans-serif';
            c.fillText(`Tier ${tier}: ${tierNames[tier]} ${unlocked ? '(Unlocked)' : `(${costs[tier]}c)`}`, px+20, y);

            if (unlocked) {
                y += 18;
                let wx = px + 25;
                for (let wi = 0; wi < WEAPONS[tier].length; wi++) {
                    const w = WEAPONS[tier][wi];
                    const lbl = `${w.name} +${w.atk}atk +${w.def}def`;
                    c.font = '11px "Segoe UI", sans-serif';
                    const tw = c.measureText(lbl).width + 14;
                    const btn = { label: lbl, fn: () => g._equipWeapon(tier, wi) };
                    btn.rect = { x: wx, y, w: tw, h: 22 };
                    g.btns.push(btn);
                    const equipped = g.sel != null && g.ts[g.sel].weapon === w;
                    c.fillStyle = equipped ? '#3a2010' : '#1a0a05';
                    this._rr(c, wx, y, tw, 22, 3); c.fill();
                    c.strokeStyle = equipped ? '#ffd700' : '#444'; c.lineWidth = 1;
                    this._rr(c, wx, y, tw, 22, 3); c.stroke();
                    c.fillStyle = equipped ? '#ffd700' : '#bbb'; c.textAlign = 'center';
                    c.fillText(lbl, wx+tw/2, y+11);
                    wx += tw + 5;
                    if (wx > px + pw - 60) { wx = px + 25; y += 26; }
                }
                y += 26;
            } else {
                y += 4;
                const btn = { label: `Unlock Tier ${tier} (${costs[tier]}c)`, fn: () => g._buyWeaponTier(tier) };
                btn.rect = { x: px+25, y, w: pw-50, h: 24 };
                g.btns.push(btn);
                c.fillStyle = emp.coins >= costs[tier] ? '#1a0a05' : '#111';
                this._rr(c, px+25, y, pw-50, 24, 4); c.fill();
                c.strokeStyle = emp.coins >= costs[tier] ? '#8b0000' : '#333';
                this._rr(c, px+25, y, pw-50, 24, 4); c.stroke();
                c.fillStyle = emp.coins >= costs[tier] ? '#ddd' : '#555'; c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'center';
                c.fillText(`Unlock Tier ${tier} — ${tierNames[tier]} (${costs[tier]}c)`, px+pw/2, y+12);
                y += 28;
            }
        }
    }

    // ── LOG ───────────────────────────────────────────────────
    _logPanel() {
        const c = this.ctx, g = this.g;
        if (g.log.length === 0) return;
        const lx = g.W - 15, ly = g.H - 42;
        const max = 4, start = Math.max(0, g.log.length - max);
        c.textAlign = 'right'; c.font = '11px "Segoe UI", sans-serif'; c.textBaseline = 'bottom';
        for (let i = g.log.length - 1; i >= start; i--) {
            const age = g.log.length - 1 - i;
            c.fillStyle = `rgba(255,255,255,${Math.max(0.3, 1-age*0.2)})`;
            c.fillText(g.log[i], lx, ly);
            ly -= 16;
        }
    }

    // ── DEFEAT SCREEN (with stats) ────────────────────────────
    _defeat() {
        const c = this.ctx, { W, H } = this.g;
        const stats = this.g.stats;

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#e74c3c'; c.font = 'bold 52px Georgia, serif';
        c.fillText('DEFEAT', W/2, H*0.22);
        c.fillStyle = '#aaa'; c.font = '20px "Segoe UI", sans-serif';
        c.fillText(`Your empire fell on turn ${this.g.turn}`, W/2, H*0.22+45);

        // Stats panel
        const pw = 300, ph = 200, px = (W - pw)/2, py = H*0.42;
        c.fillStyle = 'rgba(15,10,5,0.9)';
        this._rr(c, px, py, pw, ph, 10); c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 10); c.stroke();

        c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText('Final Statistics', W/2, py + 25);

        c.font = '14px "Segoe UI", sans-serif';
        const statLines = [
            { label: 'Territories Conquered', value: stats.conquered },
            { label: 'Enemies Eliminated', value: stats.kills },
            { label: 'Total Coins Earned', value: stats.coinsEarned },
            { label: 'Turns Survived', value: this.g.turn },
        ];
        let sy = py + 55;
        for (const s of statLines) {
            c.textAlign = 'left'; c.fillStyle = '#aaa';
            c.fillText(s.label, px + 20, sy);
            c.textAlign = 'right'; c.fillStyle = '#ffd700';
            c.fillText(String(s.value), px + pw - 20, sy);
            sy += 30;
        }

        if (Math.floor(this.time/30) % 2 === 0) {
            c.fillStyle = '#fff'; c.font = 'bold 18px "Segoe UI", sans-serif';
            c.textAlign = 'center';
            c.fillText('Click to return to menu', W/2, H*0.82);
        }
    }

    // ── VICTORY SCREEN (with stats) ───────────────────────────
    _victory() {
        const c = this.ctx, { W, H } = this.g;
        const stats = this.g.stats;

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 52px Georgia, serif';
        c.fillText('VICTORY!', W/2, H*0.15);
        c.fillStyle = '#fff'; c.font = '24px Georgia, serif';
        c.fillText(`${E(this.g.player).name} conquers all!`, W/2, H*0.15+50);
        c.font = '48px serif'; c.fillText('\u265A', W/2, H*0.15+110);

        // Stats panel
        const pw = 300, ph = 220, px = (W - pw)/2, py = H*0.42;
        c.fillStyle = 'rgba(15,10,5,0.9)';
        this._rr(c, px, py, pw, ph, 10); c.fill();
        c.strokeStyle = '#ffd700'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 10); c.stroke();

        c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText('Victory Statistics', W/2, py + 25);

        c.font = '14px "Segoe UI", sans-serif';
        const statLines = [
            { label: 'Territories Conquered', value: stats.conquered },
            { label: 'Enemies Eliminated', value: stats.kills },
            { label: 'Total Coins Earned', value: stats.coinsEarned },
            { label: 'Victory Turn', value: this.g.turn },
            { label: 'Total Troops Raised', value: stats.totalTroops },
        ];
        let sy = py + 55;
        for (const s of statLines) {
            c.textAlign = 'left'; c.fillStyle = '#aaa';
            c.fillText(s.label, px + 20, sy);
            c.textAlign = 'right'; c.fillStyle = '#ffd700';
            c.fillText(String(s.value), px + pw - 20, sy);
            sy += 28;
        }

        if (Math.floor(this.time/30) % 2 === 0) {
            c.fillStyle = '#fff'; c.font = 'bold 18px "Segoe UI", sans-serif';
            c.textAlign = 'center';
            c.fillText('Click to return to menu', W/2, H*0.88);
        }
    }

    // ── HELPERS ───────────────────────────────────────────────
    _rr(c, x, y, w, h, r) {
        c.beginPath(); c.moveTo(x+r,y);
        c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
        c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
        c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
        c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y);
        c.closePath();
    }
}
