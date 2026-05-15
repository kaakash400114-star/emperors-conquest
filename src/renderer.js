import { MAP_W, MAP_H, T_RADIUS, TERRITORIES, EMPIRES, EIDS, T, E, adj, WEAPONS, SHOP, STRATEGIES, TERRAIN_ICONS, TERRAIN_COLORS, MAP_BG } from './map.js';

export class Renderer {
    constructor(game) {
        this.g = game;
        this.ctx = game.ctx;
        this.scale = 1; this.ox = 0; this.oy = 0;
        this.shake = 0;
        this.particles = [];
        this.captureAnims = [];
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

    // ── POINT-IN-POLYGON (ray casting) ─────────────────────
    _pointInPoly(px, py, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1];
            const xj = poly[j][0], yj = poly[j][1];
            if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    terrAt(sx, sy) {
        const m = this.toMap(sx, sy);
        for (const t of TERRITORIES) {
            if (this._pointInPoly(m.x, m.y, t.poly)) return t.id;
        }
        return -1;
    }

    // ── BACKGROUND — Colorful ocean gradient ────────────────
    _bg() {
        const c = this.ctx, { W, H } = this.g;
        const gr = c.createRadialGradient(W/2, H/2, 80, W/2, H/2, W*0.8);
        gr.addColorStop(0, '#2980b9');
        gr.addColorStop(0.5, '#1a5276');
        gr.addColorStop(1, '#0e3d5c');
        c.fillStyle = gr; c.fillRect(0, 0, W, H);

        // Subtle border
        c.strokeStyle = '#154360'; c.lineWidth = 3; c.strokeRect(2, 2, W-4, H-4);
    }

    // ── MAP BACKGROUND — Landmasses on ocean ────────────────
    _drawMapBg() {
        const c = this.ctx;

        // Draw land masses
        for (const land of MAP_BG.lands) {
            c.beginPath();
            const first = this.toScr(land[0][0], land[0][1]);
            c.moveTo(first.x, first.y);
            for (let i = 1; i < land.length; i++) {
                const p = this.toScr(land[i][0], land[i][1]);
                c.lineTo(p.x, p.y);
            }
            c.closePath();

            // Land gradient fill
            const gr = c.createLinearGradient(0, 0, 0, this.g.H);
            gr.addColorStop(0, '#c9b896');
            gr.addColorStop(0.3, '#d4c4a0');
            gr.addColorStop(0.6, '#c4a67a');
            gr.addColorStop(1, '#b89a6a');
            c.fillStyle = gr;
            c.fill();

            // Land border
            c.strokeStyle = '#a08060';
            c.lineWidth = 1.5;
            c.stroke();
        }

        // Draw subtle grid lines for map feel
        c.strokeStyle = 'rgba(100,80,60,0.08)';
        c.lineWidth = 0.5;
        for (let x = 0; x <= MAP_W; x += 60) {
            const p1 = this.toScr(x, 0), p2 = this.toScr(x, MAP_H);
            c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
        }
        for (let y = 0; y <= MAP_H; y += 60) {
            const p1 = this.toScr(0, y), p2 = this.toScr(MAP_W, y);
            c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
        }

        // Compass rose decoration (bottom-right corner)
        const cx = this.toScr(MAP_W - 40, MAP_H - 40);
        c.save();
        c.translate(cx.x, cx.y);
        c.strokeStyle = 'rgba(139,105,20,0.5)';
        c.lineWidth = 1;
        c.beginPath(); c.arc(0, 0, 18, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(139,105,20,0.6)';
        c.font = 'bold 10px Georgia, serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('N', 0, -12);
        c.fillText('S', 0, 12);
        c.fillText('E', 12, 0);
        c.fillText('W', -12, 0);
        // Cross lines
        c.beginPath();
        c.moveTo(0, -8); c.lineTo(0, 8);
        c.moveTo(-8, 0); c.lineTo(8, 0);
        c.stroke();
        c.restore();
    }

    // ── MENU ──────────────────────────────────────────────────
    _menu() {
        const c = this.ctx, { W, H } = this.g;

        // Decorative parchment banner background
        const bannerGr = c.createLinearGradient(0, H*0.05, 0, H*0.88);
        bannerGr.addColorStop(0, 'rgba(245,230,200,0.95)');
        bannerGr.addColorStop(0.5, 'rgba(240,220,190,0.9)');
        bannerGr.addColorStop(1, 'rgba(245,230,200,0.95)');
        const bx = W*0.1, by = H*0.05, bw = W*0.8, bh = H*0.83;
        this._rr(c, bx, by, bw, bh, 16); c.fillStyle = bannerGr; c.fill();
        c.strokeStyle = '#8b6914'; c.lineWidth = 3;
        this._rr(c, bx, by, bw, bh, 16); c.stroke();
        // Inner border
        c.strokeStyle = '#b89a6a'; c.lineWidth = 1;
        this._rr(c, bx+6, by+6, bw-12, bh-12, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        // Title shadow
        c.fillStyle = '#8b6914'; c.font = 'bold 50px Georgia, serif';
        c.fillText("EMPEROR'S CONQUEST", W/2 + 2, H*0.16 + 2);
        // Title
        c.fillStyle = '#8b0000'; c.font = 'bold 50px Georgia, serif';
        c.fillText("EMPEROR'S CONQUEST", W/2, H*0.16);

        c.fillStyle = '#6b4f10'; c.font = '20px Georgia, serif';
        c.fillText('From Ancient India to World War II', W/2, H*0.16+42);

        // Gold divider
        c.strokeStyle = '#b89a6a'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(W*0.25, H*0.26); c.lineTo(W*0.75, H*0.26); c.stroke();
        // Diamond decorations
        c.fillStyle = '#b89a6a';
        c.beginPath(); c.arc(W*0.25, H*0.26, 4, 0, Math.PI*2); c.fill();
        c.beginPath(); c.arc(W*0.75, H*0.26, 4, 0, Math.PI*2); c.fill();

        c.fillStyle = '#3a2415'; c.font = '15px "Segoe UI", sans-serif';
        const feats = [
            '10 Empires across 3000 years of history',
            '18 Territories spanning Europe, Asia & Africa',
            '4 Combat Strategies - Assault, Siege, Raid, Ambush',
            '4 Weapon Tiers - Swords to Tanks & Bombers',
            'Coin economy - earn from kills, buy troops & weapons',
            'Fortify territories, equip weapons, choose strategies',
        ];
        feats.forEach((f, i) => {
            c.fillStyle = '#b89a6a'; c.fillText('\u2726', W/2 - 180, H*0.32 + i*28);
            c.fillStyle = '#3a2415'; c.textAlign = 'left'; c.fillText(f, W/2 - 160, H*0.32 + i*28);
            c.textAlign = 'center';
        });

        // Help button
        const hbW = 130, hbH = 36, hbX = 30, hbY = H*0.82 - 20;
        this.g._helpBtnRect = { x: hbX, y: hbY, w: hbW, h: hbH };
        this._rr(c, hbX, hbY, hbW, hbH, 8); c.fillStyle = '#e8d5b0'; c.fill();
        c.strokeStyle = '#8b6914'; c.lineWidth = 2;
        this._rr(c, hbX, hbY, hbW, hbH, 8); c.stroke();
        c.fillStyle = '#3a2415'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('How to Play', hbX + hbW/2, hbY + hbH/2);

        // Continue button (if save exists)
        const hasSave = !!localStorage.getItem('emperorsConquest_save');
        if (hasSave) {
            const ctW = 130, ctH = 36, ctX = W - 30 - ctW, ctY = H*0.82 - 20;
            this.g._continueBtnRect = { x: ctX, y: ctY, w: ctW, h: ctH };
            this._rr(c, ctX, ctY, ctW, ctH, 8); c.fillStyle = '#d4edda'; c.fill();
            c.strokeStyle = '#28a745'; c.lineWidth = 2;
            this._rr(c, ctX, ctY, ctW, ctH, 8); c.stroke();
            c.fillStyle = '#155724'; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('Continue', ctX + ctW/2, ctY + ctH/2);
        } else {
            this.g._continueBtnRect = null;
        }

        if (Math.floor(this.time / 30) % 2 === 0) {
            c.fillStyle = '#8b0000'; c.font = 'bold 22px Georgia, serif';
            c.textAlign = 'center';
            c.fillText('Click anywhere to begin', W/2, H*0.82);
        }

        c.fillStyle = '#6b5040'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText('v3.2 - Ancient World Map Edition', W/2, H*0.93);
    }

    // ── EMPIRE SELECT ─────────────────────────────────────────
    _empSel() {
        const c = this.ctx, { W, H } = this.g;

        // Background parchment
        c.fillStyle = 'rgba(245,230,200,0.92)';
        c.fillRect(0, 0, W, H);

        c.textAlign = 'center'; c.fillStyle = '#8b0000'; c.font = 'bold 32px Georgia, serif';
        c.fillText('Choose Your Empire', W/2, 50);
        c.fillStyle = '#6b4f10'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText('Each has a unique bonus - click to select', W/2, 78);

        const g = this.g;
        const bbW = 70, bbH = 28, bbX = 15, bbY = 15;
        const backBtn = { label: 'Back', fn: () => { g.state = 'menu'; g.sfx.click(); } };
        backBtn.rect = { x: bbX, y: bbY, w: bbW, h: bbH };
        g.btns.push(backBtn);
        this._rr(c, bbX, bbY, bbW, bbH, 6); c.fillStyle = '#e8d5b0'; c.fill();
        c.strokeStyle = '#8b6914'; c.lineWidth = 1.5;
        this._rr(c, bbX, bbY, bbW, bbH, 6); c.stroke();
        c.fillStyle = '#3a2415'; c.font = 'bold 12px "Segoe UI", sans-serif';
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

            c.fillStyle = hover ? '#f5e6c8' : '#e8d5b0';
            this._rr(c, x, y, cw, ch, 10); c.fill();
            c.strokeStyle = em.color; c.lineWidth = hover ? 3 : 2;
            this._rr(c, x, y, cw, ch, 10); c.stroke();

            c.fillStyle = em.color; c.fillRect(x+1, y+1, cw-2, 5);

            c.fillStyle = em.color; c.font = '24px serif';
            c.fillText(em.icon || '?', x+cw/2, y+30);
            c.fillStyle = '#2c1810'; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(em.name, x+cw/2, y+55);

            c.fillStyle = '#6b5040'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(em.era, x+cw/2, y+72);

            c.fillStyle = '#8b0000'; c.font = '10px "Segoe UI", sans-serif';
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
        c.fillStyle = 'rgba(44,24,16,0.7)';
        c.fillRect(0, 0, W, H);

        const pw = 520, ph = 500, px = (W - pw)/2, py = (H - ph)/2;
        c.fillStyle = '#f5e6c8';
        this._rr(c, px, py, pw, ph, 14); c.fill();
        c.strokeStyle = '#8b6914'; c.lineWidth = 3;
        this._rr(c, px, py, pw, ph, 14); c.stroke();
        // Inner border
        c.strokeStyle = '#b89a6a'; c.lineWidth = 1;
        this._rr(c, px+5, py+5, pw-10, ph-10, 10); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#8b0000'; c.font = 'bold 26px Georgia, serif';
        c.fillText('How to Play', px + pw/2, py + 32);

        c.strokeStyle = '#b89a6a'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 30, py + 55); c.lineTo(px + pw - 30, py + 55); c.stroke();

        const sections = [
            { header: 'SELECT', color: '#1a5276', text: 'Click your territory to select it' },
            { header: 'RECRUIT', color: '#196f3d', text: 'Buy soldiers (+1) or veterans (+2) with coins' },
            { header: 'FORTIFY', color: '#1a5276', text: 'Spend 15 coins for +2 permanent defense' },
            { header: 'MOVE', color: '#6c3483', text: 'Move troops between your adjacent territories' },
            { header: 'ATTACK', color: '#922b21', text: 'Attack enemies with dice + bonuses' },
            { header: 'WEAPONS', color: '#b7950b', text: 'Unlock tiers in shop, equip on territories' },
            { header: 'SPY', color: '#0e6655', text: 'Buy spy network (30c) to see enemy troops' },
            { header: 'INCOME', color: '#8b0000', text: 'Base 3 + 1/territory + empire bonus per turn' },
            { header: 'WIN', color: '#922b21', text: 'Control all 18 territories to win!' },
        ];

        let sy = py + 72;
        for (const sec of sections) {
            c.textAlign = 'left';
            c.fillStyle = sec.color; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(sec.header, px + 30, sy);
            c.fillStyle = '#3a2415'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText(sec.text, px + 105, sy);
            sy += 28;
        }

        c.textAlign = 'center';
        c.fillStyle = '#6b5040'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText('Click anywhere to close', px + pw/2, py + ph - 20);
    }

    // ── DIFFICULTY SCREEN ──────────────────────────────────────
    _difficultyScreen() {
        const c = this.ctx, { W, H } = this.g;
        const g = this.g;

        // Parchment background
        c.fillStyle = 'rgba(245,230,200,0.92)';
        c.fillRect(0, 0, W, H);

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#8b0000'; c.font = 'bold 38px Georgia, serif';
        c.fillText('Select Difficulty', W/2, H*0.18);
        c.fillStyle = '#6b4f10'; c.font = '18px Georgia, serif';
        c.fillText('Choose your challenge level', W/2, H*0.18 + 40);

        c.strokeStyle = '#b89a6a'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(W*0.3, H*0.27); c.lineTo(W*0.7, H*0.27); c.stroke();

        g.btns = [];

        const diffs = [
            {
                label: 'Easy', color: '#196f3d', border: '#28a745', bg: '#d4edda',
                desc: 'AI earns 60% income, attacks cautiously',
                detail: 'AI starts with fewer troops. Good for learning.',
                icon: '\u2694',
            },
            {
                label: 'Normal', color: '#8b6914', border: '#b89a6a', bg: '#f5e6c8',
                desc: 'Balanced gameplay',
                detail: 'Standard experience. AI plays fairly.',
                icon: '\u265A',
            },
            {
                label: 'Hard', color: '#922b21', border: '#c0392b', bg: '#f8d7da',
                desc: 'AI earns 140% income, attacks aggressively',
                detail: 'AI starts with extra troops. For veterans only.',
                icon: '\u2620',
            },
        ];

        const btnW = 220, btnH = 180, gap = 30;
        const totalW = btnW * 3 + gap * 2;
        const startX = (W - totalW) / 2;
        const startY = H * 0.33;

        for (let i = 0; i < diffs.length; i++) {
            const d = diffs[i];
            const bx = startX + i * (btnW + gap);
            const by = startY;
            const hover = g.input.hoverX >= bx && g.input.hoverX <= bx + btnW &&
                          g.input.hoverY >= by && g.input.hoverY <= by + btnH;

            // Button background
            c.fillStyle = hover ? '#fff' : d.bg;
            this._rr(c, bx, by, btnW, btnH, 12); c.fill();
            c.strokeStyle = d.color; c.lineWidth = hover ? 3 : 2;
            this._rr(c, bx, by, btnW, btnH, 12); c.stroke();

            // Top color bar
            c.fillStyle = d.color;
            c.fillRect(bx + 1, by + 1, btnW - 2, 5);

            // Icon
            c.font = '36px serif';
            c.fillStyle = d.color;
            c.fillText(d.icon, bx + btnW/2, by + 40);

            // Label
            c.font = 'bold 22px Georgia, serif';
            c.fillStyle = d.color;
            c.fillText(d.label, bx + btnW/2, by + 72);

            // Description
            c.font = '12px "Segoe UI", sans-serif';
            c.fillStyle = '#3a2415';
            c.fillText(d.desc, bx + btnW/2, by + 100);

            // Detail
            c.font = '11px "Segoe UI", sans-serif';
            c.fillStyle = '#6b5040';
            c.fillText(d.detail, bx + btnW/2, by + 120);

            // Register button
            const diffKey = d.label.toLowerCase();
            const btn = { label: d.label, fn: () => {
                g.difficulty = diffKey;
                g.state = 'empireSelect';
                g.sfx.click();
            }};
            btn.rect = { x: bx, y: by, w: btnW, h: btnH };
            g.btns.push(btn);
        }

        // Back button
        const bbW = 70, bbH = 28, bbX = 15, bbY = 15;
        const backBtn = { label: 'Back', fn: () => { g.state = 'menu'; g.sfx.click(); } };
        backBtn.rect = { x: bbX, y: bbY, w: bbW, h: bbH };
        g.btns.push(backBtn);
        this._rr(c, bbX, bbY, bbW, bbH, 6); c.fillStyle = '#e8d5b0'; c.fill();
        c.strokeStyle = '#8b6914'; c.lineWidth = 1.5;
        this._rr(c, bbX, bbY, bbW, bbH, 6); c.stroke();
        c.fillStyle = '#3a2415'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('Back', bbX + bbW/2, bbY + bbH/2);

        if (Math.floor(this.time / 30) % 2 === 0) {
            c.fillStyle = '#8b0000'; c.font = 'bold 18px Georgia, serif';
            c.textAlign = 'center';
            c.fillText('Click a difficulty to continue', W/2, H*0.82);
        }
    }

    // ── GAME WORLD ────────────────────────────────────────────
    _world() {
        const c = this.ctx;
        if (this.shake > 0.3) {
            c.save();
            c.translate((Math.random()-0.5)*this.shake*2, (Math.random()-0.5)*this.shake*2);
            this.shake *= 0.9;
        }
        this._drawMapBg();
        this._connections();
        this._territories();
        this._drawParticles();
        this._drawCaptureAnims();
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
                    c.strokeStyle = EMPIRES[s1.owner].color + '60';
                    c.lineWidth = 2.5 * this.scale;
                    c.setLineDash([]);
                } else {
                    c.strokeStyle = 'rgba(60,40,20,0.2)';
                    c.lineWidth = 1;
                    c.setLineDash([4, 4]);
                }
                c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
            }
        }
        c.setLineDash([]);
    }

    _territories() {
        const c = this.ctx, g = this.g;
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s) continue;
            const em = s.owner ? EMPIRES[s.owner] : null;
            const isSel = g.sel === t.id;
            const isHov = g.hover === t.id;
            const isMoveT = g.phase === 'move' && g.sel != null && s.owner === g.player && adj(g.sel, t.id) && t.id !== g.sel;
            const isAtkT = (g.phase === 'attack' || g.state === 'attack') && g.sel != null && s.owner !== g.player && adj(g.sel, t.id);
            const isPlayerTerr = s.owner === g.player;
            const p = this.toScr(t.cx, t.cy);

            // Build polygon path helper
            const drawPoly = () => {
                c.beginPath();
                const first = this.toScr(t.poly[0][0], t.poly[0][1]);
                c.moveTo(first.x, first.y);
                for (let i = 1; i < t.poly.length; i++) {
                    const pp = this.toScr(t.poly[i][0], t.poly[i][1]);
                    c.lineTo(pp.x, pp.y);
                }
                c.closePath();
            };

            // ── Selection/Target glow (drawn first, behind territory) ──
            if (isPlayerTerr && !g._isAI()) {
                const pulse = 0.15 + Math.sin(this.time * 0.04 + t.id * 0.7) * 0.08;
                drawPoly();
                c.fillStyle = `rgba(255,215,0,${pulse})`;
                c.fill();
            }

            if (isMoveT) {
                drawPoly();
                c.fillStyle = 'rgba(46,204,113,'+(0.3+Math.sin(this.time*0.08)*0.15)+')';
                c.fill();
            }
            if (isAtkT) {
                drawPoly();
                c.fillStyle = 'rgba(231,76,60,'+(0.35+Math.sin(this.time*0.08)*0.15)+')';
                c.fill();
            }
            if (isSel) {
                drawPoly();
                c.fillStyle = 'rgba(255,215,0,0.35)'; c.fill();
            }
            if (isHov && !isSel) {
                drawPoly();
                c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
            }

            // ── Territory polygon fill ──
            drawPoly();
            if (em) {
                // Empire color with gradient
                const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 60 * this.scale);
                gr.addColorStop(0, em.light + 'cc');
                gr.addColorStop(1, em.dark + 'cc');
                c.fillStyle = gr;
            } else {
                // Neutral - gray
                c.fillStyle = 'rgba(160,140,120,0.6)';
            }
            c.fill();

            // ── Terrain color overlay ──
            const terrainColor = TERRAIN_COLORS[t.terrain];
            if (terrainColor) {
                drawPoly();
                c.fillStyle = terrainColor;
                c.fill();
            }

            // ── Border ──
            drawPoly();
            c.strokeStyle = isSel ? '#ffd700' : (isHov ? '#ffd700' : (em ? em.color + 'aa' : 'rgba(100,80,60,0.5)'));
            c.lineWidth = (isSel ? 3 : (isHov ? 2.5 : 1.5)) * this.scale;
            c.stroke();

            // ── Terrain icon ──
            const terrainIcon = TERRAIN_ICONS[t.terrain];
            if (terrainIcon) {
                c.fillStyle = 'rgba(255,255,255,0.5)';
                c.font = `${Math.round(11*this.scale)}px sans-serif`;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText(terrainIcon, p.x, p.y - 16*this.scale);
            }

            // ── Fort level ──
            if (s.fort > 0) {
                const shields = Math.min(Math.ceil(s.fort / 2), 4);
                c.fillStyle = '#1a5276'; c.font = `bold ${Math.round(9*this.scale)}px sans-serif`;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText('\u{1F6E1}' + shields, p.x + 28*this.scale, p.y - 18*this.scale);
            }

            // ── Weapon tier indicator ──
            if (s.weapon && s.weapon.name !== 'Sword') {
                const tierNum = this._weaponTier(s.weapon);
                if (tierNum > 0) {
                    c.fillStyle = tierNum >= 4 ? '#922b21' : (tierNum >= 3 ? '#b7950b' : '#1a5276');
                    c.font = `bold ${Math.round(8*this.scale)}px sans-serif`;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.fillText('T' + tierNum, p.x + 28*this.scale, p.y + 16*this.scale);
                }
            }

            // ── Troops number ──
            c.fillStyle = '#fff';
            c.font = `bold ${Math.round(18*this.scale)}px "Segoe UI", sans-serif`;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            // Add text shadow for readability
            c.shadowColor = 'rgba(0,0,0,0.7)';
            c.shadowBlur = 4;
            c.shadowOffsetX = 1;
            c.shadowOffsetY = 1;
            const hideTroops = s.owner && s.owner !== g.player && !(g.empires[g.player]?.spy);
            c.fillText(hideTroops ? '?' : s.troops, p.x, p.y + 2);
            c.shadowColor = 'transparent';
            c.shadowBlur = 0;
            c.shadowOffsetX = 0;
            c.shadowOffsetY = 0;

            // ── Territory name below ──
            c.fillStyle = '#fff';
            c.font = `bold ${Math.round(9*this.scale)}px "Segoe UI", sans-serif`;
            c.shadowColor = 'rgba(0,0,0,0.8)';
            c.shadowBlur = 3;
            c.fillText(t.name, p.x, p.y + 20*this.scale);
            c.shadowColor = 'transparent';
            c.shadowBlur = 0;

            // ── Empire name on hover/select ──
            if (em && (isSel || isHov)) {
                c.fillStyle = '#ffd700';
                c.font = `bold ${Math.round(10*this.scale)}px "Segoe UI", sans-serif`;
                c.shadowColor = 'rgba(0,0,0,0.8)';
                c.shadowBlur = 3;
                c.fillText(em.name, p.x, p.y - 28*this.scale);
                c.shadowColor = 'transparent';
                c.shadowBlur = 0;
            }

            // ── Weapon name ──
            if (s.weapon && s.weapon.name !== 'Sword') {
                c.fillStyle = '#ffd700'; c.font = `bold ${Math.round(7*this.scale)}px sans-serif`;
                c.fillText(s.weapon.name.substring(0,6), p.x, p.y - 8*this.scale);
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

    addCaptureAnim(tid, newColor, oldColor) {
        const p = this.toScr(T(tid).cx, T(tid).cy);
        this.captureAnims.push({
            tid, x: p.x, y: p.y,
            newColor, oldColor,
            progress: 0,
            speed: 0.03,
        });
    }

    _drawCaptureAnims() {
        const c = this.ctx;
        for (let i = this.captureAnims.length - 1; i >= 0; i--) {
            const a = this.captureAnims[i];
            a.progress += a.speed;
            const baseR = 50 * this.scale;

            // Phase 1: Expanding ring pulse (0 to 0.5)
            if (a.progress < 0.5) {
                const t = a.progress / 0.5;
                const ringR = baseR * (1 + t * 1.8);
                const alpha = 0.7 * (1 - t);
                c.beginPath();
                c.arc(a.x, a.y, ringR, 0, Math.PI * 2);
                c.strokeStyle = a.newColor;
                c.globalAlpha = alpha;
                c.lineWidth = 4 * this.scale;
                c.stroke();
                c.globalAlpha = 1;
            }

            // Phase 2: Converging rings (0.3 to 0.8)
            if (a.progress > 0.3 && a.progress < 0.8) {
                const t = (a.progress - 0.3) / 0.5;
                const ringR = baseR * (2.5 - t * 1.5);
                const alpha = 0.4 * (1 - t);
                c.beginPath();
                c.arc(a.x, a.y, ringR, 0, Math.PI * 2);
                c.strokeStyle = a.newColor;
                c.globalAlpha = alpha;
                c.lineWidth = 2 * this.scale;
                c.stroke();
                c.globalAlpha = 1;
            }

            // Phase 3: Flash overlay (0.5 to 0.7)
            if (a.progress > 0.5 && a.progress < 0.7) {
                const t = (a.progress - 0.5) / 0.2;
                const alpha = 0.3 * (1 - t);
                c.beginPath();
                c.arc(a.x, a.y, baseR, 0, Math.PI * 2);
                c.fillStyle = a.newColor;
                c.globalAlpha = alpha;
                c.fill();
                c.globalAlpha = 1;
            }

            if (a.progress >= 1) {
                this.captureAnims.splice(i, 1);
            }
        }
    }

    // ── HUD ───────────────────────────────────────────────────
    _hud() {
        const c = this.ctx, g = this.g, { W } = g;
        const emp = g.empires[g.player], em = EMPIRES[g.player];
        if (!emp) return;

        // Top bar - brown with gold accents
        const hudGr = c.createLinearGradient(0, 0, 0, 50);
        hudGr.addColorStop(0, 'rgba(44,24,16,0.92)');
        hudGr.addColorStop(1, 'rgba(60,35,20,0.88)');
        c.fillStyle = hudGr; c.fillRect(0, 0, W, 50);
        c.fillStyle = '#b89a6a'; c.fillRect(0, 48, W, 2);

        c.fillStyle = em.color; c.fillRect(10, 8, 5, 34);
        c.fillStyle = '#f5e6c8'; c.font = 'bold 15px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(em.name, 22, 20);
        c.fillStyle = '#ffd700'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Coins: ${emp.coins}`, 22, 40);
        c.fillStyle = '#e8d5b0';
        c.fillText(`Territories: ${emp.tids.length}/${TERRITORIES.length}`, 150, 40);
        const totalTroops = emp.tids.reduce((s,id) => s + g.ts[id].troops, 0);
        c.fillStyle = '#b89a6a'; c.fillText(`Troops: ${totalTroops}`, 340, 40);

        // Alive/dead empire count
        const aliveCount = EIDS.filter(id => g.empires[id]?.alive).length;
        c.textAlign = 'right';
        c.fillStyle = '#b89a6a';
        c.fillText(`Turn ${g.turn}  |  ${aliveCount} empires alive`, W - 15, 20);
        c.fillStyle = '#ffd700'; c.fillText(g._isAI() ? 'AI Turn' : 'Your Turn', W - 15, 40);

        // Phase bar
        const msg = g.phaseMsg();
        if (msg) {
            const bh = 32, by = g.H - bh - 40;
            c.fillStyle = 'rgba(44,24,16,0.75)';
            this._rr(c, 12, by, W-24, bh, 8); c.fill();
            c.strokeStyle = '#8b6914'; c.lineWidth = 1;
            this._rr(c, 12, by, W-24, bh, 8); c.stroke();
            c.fillStyle = '#f5e6c8'; c.font = '13px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(msg, W/2, by + bh/2);
        }

        // Buttons
        g.btns = [];
        if (g._isAI()) return;

        // Save and Menu buttons in top bar
        const smBtnW = 50, smBtnH = 22, smBtnY = 4;
        const hudMenuBtnX = W - 15 - smBtnW;
        const hudSaveBtnX = hudMenuBtnX - smBtnW - 6;
        const hudMenuBtn = { label: 'Menu', fn: () => { g.state = 'menu'; g.sfx.click(); } };
        hudMenuBtn.rect = { x: hudMenuBtnX, y: smBtnY, w: smBtnW, h: smBtnH };
        g.btns.push(hudMenuBtn);
        this._rr(c, hudMenuBtnX, smBtnY, smBtnW, smBtnH, 5); c.fillStyle = '#8b6914'; c.fill();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('Menu', hudMenuBtnX + smBtnW/2, smBtnY + smBtnH/2);
        const hudSaveBtn = { label: 'Save', fn: () => g.saveGame() };
        hudSaveBtn.rect = { x: hudSaveBtnX, y: smBtnY, w: smBtnW, h: smBtnH };
        g.btns.push(hudSaveBtn);
        this._rr(c, hudSaveBtnX, smBtnY, smBtnW, smBtnH, 5); c.fillStyle = '#196f3d'; c.fill();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('Save', hudSaveBtnX + smBtnW/2, smBtnY + smBtnH/2);

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
            { label: `Undo (${g.undoStack.length})`, active: g.undoStack.length > 0 && !g._isAI(), fn: () => g._undo() },
        ];

        let x = 10;
        c.textBaseline = 'middle';
        for (const b of btns) {
            c.font = 'bold 12px "Segoe UI", sans-serif';
            const tw = c.measureText(b.label).width + 18;
            b.rect = { x, y: btnY, w: tw, h: btnH };
            g.btns.push(b);

            if (b.active) {
                this._rr(c, x, btnY, tw, btnH, 6); c.fillStyle = '#8b6914'; c.fill();
                c.strokeStyle = '#b89a6a'; c.lineWidth = 1;
                this._rr(c, x, btnY, tw, btnH, 6); c.stroke();
                c.fillStyle = '#f5e6c8';
            } else {
                this._rr(c, x, btnY, tw, btnH, 6); c.fillStyle = '#6b5040'; c.fill();
                c.fillStyle = '#a08860';
            }
            c.textAlign = 'center';
            c.fillText(b.label, x + tw/2, btnY + btnH/2);
            x += tw + gap;
        }
    }

    // ── PROGRESS BAR ──────────────────────────────────────────
    _progressBar() {
        const c = this.ctx, g = this.g;
        const emp = g.empires[g.player];
        if (!emp) return;

        const barX = 10, barY = 49, barW = g.W * 0.45, barH = 5;
        const pct = emp.tids.length / TERRITORIES.length;

        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(barX, barY, barW, barH);

        if (pct > 0) {
            const fillW = Math.max(barH, barW * pct);
            const gr = c.createLinearGradient(barX, 0, barX + fillW, 0);
            gr.addColorStop(0, '#922b21');
            gr.addColorStop(0.5, '#ffd700');
            gr.addColorStop(1, '#196f3d');
            c.fillStyle = gr;
            c.fillRect(barX, barY, fillW, barH);
        }

        c.fillStyle = '#b89a6a';
        c.font = '9px "Segoe UI", sans-serif';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(`${emp.tids.length}/${TERRITORIES.length} (${Math.round(pct * 100)}%)`, barX + barW + 8, barY + barH / 2);
    }

    // ── EMPIRE SCOREBOARD PANEL (right side) ──────────────────
    _scoreboard() {
        const c = this.ctx, g = this.g;
        const panelW = 190;
        const px = g.W - panelW - 8;
        const py = 55;
        const ph = g.H - py - 55;

        // Panel background - parchment
        const panelGr = c.createLinearGradient(px, py, px + panelW, py);
        panelGr.addColorStop(0, 'rgba(240,220,190,0.95)');
        panelGr.addColorStop(1, 'rgba(245,230,200,0.92)');
        this._rr(c, px, py, panelW, ph, 10); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#8b6914'; c.lineWidth = 2;
        this._rr(c, px, py, panelW, ph, 10); c.stroke();

        // Title
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#8b0000'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('EMPIRES', px + panelW/2, py + 16);

        // Divider
        c.strokeStyle = '#b89a6a'; c.lineWidth = 1;
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
                this._rr(c, px + 4, y - 10, panelW - 8, 30, 4);
                c.fillStyle = 'rgba(255,215,0,0.2)'; c.fill();
            }

            // Color indicator
            c.fillStyle = alive ? em.color : '#a08860';
            c.fillRect(px + 8, y - 5, 4, 18);

            // Empire name
            c.font = `${isPlayer ? 'bold ' : ''}11px "Segoe UI", sans-serif`;
            c.fillStyle = alive ? (isPlayer ? '#8b0000' : '#2c1810') : '#a08860';
            c.fillText(em.name.substring(0, 15), px + 18, y + 2);

            // Status line
            c.font = '9px "Segoe UI", sans-serif';
            if (alive) {
                c.fillStyle = '#6b5040';
                c.fillText(`${tCount} terr | ${emp.coins}c`, px + 18, y + 14);
            } else {
                c.fillStyle = '#922b21';
                c.fillText('ELIMINATED', px + 18, y + 14);
            }

            y += 34;
        }

        // Player stats at bottom
        y = py + ph - 70;
        c.strokeStyle = '#b89a6a'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 10, y); c.lineTo(px + panelW - 10, y); c.stroke();

        const stats = g.stats;
        c.fillStyle = '#8b0000'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText('YOUR STATS', px + panelW/2, y + 14);

        c.textAlign = 'left'; c.font = '10px "Segoe UI", sans-serif';
        c.fillStyle = '#3a2415';
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

        const pw = 340, ph = 300, px = (g.W - pw)/2, py = (g.H - ph)/2;
        this._rr(c, px, py, pw, ph, 12); c.fillStyle = '#f5e6c8'; c.fill();
        c.strokeStyle = '#196f3d'; c.lineWidth = 3;
        this._rr(c, px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#196f3d'; c.font = 'bold 20px Georgia, serif';
        c.fillText('Move Troops', px + pw/2, py + 28);

        c.fillStyle = '#2c1810'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`From: ${fromT.name} (${fromS.troops} troops)`, px + pw/2, py + 58);
        c.fillText(`To: ${toT.name} (${toS.troops} troops)`, px + pw/2, py + 80);

        c.fillStyle = '#6b5040'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(`Available: ${available}`, px + pw/2, py + 110);
        c.fillStyle = '#8b0000'; c.font = 'bold 14px "Segoe UI", sans-serif';
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
            this._rr(c, bx, aby, bw, bh, 6); c.fillStyle = '#e8d5b0'; c.fill();
            c.strokeStyle = '#8b6914'; c.lineWidth = 1.5;
            this._rr(c, bx, aby, bw, bh, 6); c.stroke();
            c.fillStyle = '#2c1810'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(b.label, bx + bw/2, aby + bh/2);
            bx += bw + 6;
        }

        const maW = 80, maX = px + pw/2 - maW/2, maY = py + 195;
        const maBtn = { label: 'Move All', fn: () => g.moveDialogAdjust(9999) };
        maBtn.rect = { x: maX, y: maY, w: maW, h: 26 };
        g.btns.push(maBtn);
        this._rr(c, maX, maY, maW, 26, 6); c.fillStyle = '#b7950b'; c.fill();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.fillText('Move All', maX + maW/2, maY + 13);

        const cmW = 120, cmH = 32;
        const cmX = px + pw/2 - cmW - 8, cmY = py + ph - 42;
        const cmBtn = { label: 'Confirm Move', fn: () => g.moveDialogConfirm() };
        cmBtn.rect = { x: cmX, y: cmY, w: cmW, h: cmH };
        g.btns.push(cmBtn);
        this._rr(c, cmX, cmY, cmW, cmH, 6); c.fillStyle = '#196f3d'; c.fill();
        c.strokeStyle = '#28a745'; c.lineWidth = 1.5;
        this._rr(c, cmX, cmY, cmW, cmH, 6); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('Confirm Move', cmX + cmW/2, cmY + cmH/2);

        const caW = 80, caH = 32;
        const caX = px + pw/2 + 8, caY = py + ph - 42;
        const caBtn = { label: 'Cancel', fn: () => g.moveDialogCancel() };
        caBtn.rect = { x: caX, y: caY, w: caW, h: caH };
        g.btns.push(caBtn);
        this._rr(c, caX, caY, caW, caH, 6); c.fillStyle = '#922b21'; c.fill();
        c.strokeStyle = '#c0392b'; c.lineWidth = 1.5;
        this._rr(c, caX, caY, caW, caH, 6); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 13px "Segoe UI", sans-serif';
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
        else if (g.state === 'difficulty') this._difficultyScreen();
        else if (g.state === 'empireSelect') this._empSel();
        else if (g.state === 'playing') {
            this._world(); this._hud(); this._progressBar(); this._scoreboard(); this._logPanel();
        }
        else if (g.state === 'moveDialog') {
            this._world(); this._hud(); this._progressBar(); this._scoreboard(); this._moveDialog(); this._logPanel();
        }
        else if (g.state === 'attack') {
            this._world(); this._hud(); this._progressBar(); this._scoreboard(); this._attackPanel(); this._logPanel();
        }
        else if (g.state === 'battle') {
            this._world(); this._hud(); this._progressBar(); this._scoreboard(); this._battleOverlay(); this._logPanel();
        }
        else if (g.state === 'shop') {
            this._world(); this._hud(); this._progressBar(); this._scoreboard(); this._shopPanel(); this._logPanel();
        }
        else if (g.state === 'gameover') this._defeat();
        else if (g.state === 'victory') this._victory();
    }

    // ── ATTACK PANEL ──────────────────────────────────────────
    _attackPanel() {
        const c = this.ctx, g = this.g;

        if (g._attackTarget === null || g._attackTarget === undefined) {
            const targets = T(g.sel).adj.filter(a => g.ts[a].owner !== g.player);
            g._attackTarget = targets.length === 1 ? targets[0] : null;
        }

        const pw = 360, ph = 500, px = (g.W - pw)/2, py = (g.H - ph)/2;
        this._rr(c, px, py, pw, ph, 12); c.fillStyle = '#f5e6c8'; c.fill();
        c.strokeStyle = '#922b21'; c.lineWidth = 3;
        this._rr(c, px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#922b21'; c.font = 'bold 22px Georgia, serif';
        c.fillText('Choose Strategy', px+pw/2, py+30);

        // Show attacker and defender territory names
        const atkName = T(g.sel).name;
        const defName = g._attackTarget != null ? T(g._attackTarget).name : '???';
        c.fillStyle = EMPIRES[g.player].color; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`${atkName} (${g.ts[g.sel].troops} troops)`, px + pw/2, py + 55);
        c.fillStyle = '#922b21'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(`Target: ${defName}`, px + pw/2, py + 72);

        g.btns = [];
        // Back button
        const backBtn = { label: 'Back', fn: () => { g.state = 'playing'; g.phase = 'select'; g._attackTarget = null; g.sfx.click(); } };
        const btw = 70, btx = px + pw - btw - 15, bty = py + 10;
        backBtn.rect = { x: btx, y: bty, w: btw, h: 28 };
        g.btns.push(backBtn);
        this._rr(c, btx, bty, btw, 28, 6); c.fillStyle = '#8b6914'; c.fill();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.fillText('Back', btx+btw/2, bty+14);

        // Target selection
        const allTargets = T(g.sel).adj.filter(a => g.ts[a].owner !== g.player);
        let btnStartY = py + 88;
        if (allTargets.length > 1) {
            c.fillStyle = '#3a2415'; c.font = '12px "Segoe UI", sans-serif';
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
                this._rr(c, tx, btnStartY, tw, 26, 5); c.fillStyle = isTarget ? '#922b21' : '#e8d5b0'; c.fill();
                c.strokeStyle = isTarget ? '#c0392b' : '#8b6914'; c.lineWidth = 1;
                this._rr(c, tx, btnStartY, tw, 26, 5); c.stroke();
                c.fillStyle = isTarget ? '#f5e6c8' : '#2c1810'; c.textAlign = 'center';
                c.fillText(lbl, tx+tw/2, btnStartY+13);
                tx += tw + 6;
                if (tx > px + pw - 80) { tx = px + 15; btnStartY += 32; }
            }
            btnStartY += 35;
        }

        // Weapon equip section
        const emp = g.empires[g.player];
        c.textAlign = 'left';
        c.fillStyle = '#b7950b'; c.font = 'bold 12px "Segoe UI", sans-serif';
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
            this._rr(c, wx, btnStartY, tw, 20, 4); c.fillStyle = equipped ? '#b7950b' : '#e8d5b0'; c.fill();
            c.strokeStyle = equipped ? '#ffd700' : '#8b6914'; c.lineWidth = 1;
            this._rr(c, wx, btnStartY, tw, 20, 4); c.stroke();
            c.fillStyle = equipped ? '#f5e6c8' : '#2c1810'; c.textAlign = 'center';
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

            this._rr(c, px+15, by, pw-30, 44, 8); c.fillStyle = canUse ? '#e8d5b0' : '#d4c4a0'; c.fill();
            c.strokeStyle = canUse ? '#922b21' : '#a08860'; c.lineWidth = 1.5;
            this._rr(c, px+15, by, pw-30, 44, 8); c.stroke();

            c.textAlign = 'left';
            c.fillStyle = canUse ? '#922b21' : '#6b5040'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText(str.name, px+25, by+16);
            c.fillStyle = canUse ? '#3a2415' : '#6b5040'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText(str.desc, px+25, by+34);
        }
    }

    // ── BATTLE OVERLAY ────────────────────────────────────────
    _battleOverlay() {
        const c = this.ctx, g = this.g, b = g.battle;
        if (!b) return;
        c.fillStyle = 'rgba(44,24,16,0.75)'; c.fillRect(0, 0, g.W, g.H);
        const cx = g.W/2, cy = g.H/2;

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#922b21'; c.font = 'bold 30px Georgia, serif';
        c.fillText('BATTLE RESULTS', cx, cy-130);

        // Territory names
        c.fillStyle = '#b89a6a'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(`${T(b.from).name} \u2192 ${T(b.to).name}`, cx, cy-108);

        // Attacker
        c.fillStyle = EMPIRES[b.atk].color; c.font = 'bold 18px "Segoe UI", sans-serif';
        c.fillText(EMPIRES[b.atk].name, cx-140, cy-85);
        c.fillStyle = '#b89a6a'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Weapon: ${b.res.atkWeapon}`, cx-140, cy-65);
        c.fillText(`Bonus: +${b.res.atkBonus}`, cx-140, cy-48);

        // VS
        c.fillStyle = '#ffd700'; c.font = 'bold 24px Georgia, serif';
        c.fillText('VS', cx, cy-75);

        // Defender
        const defEm = b.def ? EMPIRES[b.def] : null;
        c.fillStyle = defEm ? defEm.color : '#b89a6a'; c.font = 'bold 18px "Segoe UI", sans-serif';
        c.fillText(defEm ? defEm.name : 'Neutral', cx+140, cy-85);
        c.fillStyle = '#b89a6a'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Weapon: ${b.res.defWeapon}`, cx+140, cy-65);
        c.fillText(`Bonus: +${b.res.defBonus}`, cx+140, cy-48);

        // Strategy
        c.fillStyle = '#f5e6c8'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText(`Strategy: ${b.res.strategy}`, cx, cy-30);

        // Dice
        const r = b.res;
        let dy = cy;
        c.font = '13px "Segoe UI", sans-serif';
        c.fillStyle = '#f5e6c8'; c.fillText('Attack Dice', cx-130, dy);
        c.fillText('Defense Dice', cx+130, dy);
        dy += 20;
        for (let i = 0; i < Math.max(r.atkRolls.length, r.defRolls.length); i++) {
            if (i < r.atkRolls.length) {
                const won = r.details[i]?.winner === 'atk';
                const crit = r.details[i]?.atkCrit;
                const col = crit ? '#ffd700' : (won ? '#196f3d' : '#922b21');
                this._die(c, cx-155+i*35, dy, 28, r.atkRolls[i], col);
                if (crit) {
                    c.fillStyle = '#ffd700'; c.font = 'bold 8px sans-serif';
                    c.fillText('CRIT!', cx-155+i*35+14, dy+34);
                }
            }
            if (i < r.defRolls.length) {
                const won = r.details[i]?.winner === 'def';
                const crit = r.details[i]?.defCrit;
                const col = crit ? '#ffd700' : (won ? '#196f3d' : '#922b21');
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
            c.fillStyle = '#e8d5b0'; c.fillText(`Attackers lost ${r.atkLoss} | Defenders lost ${r.defLoss}`, cx, ry);
        }
        c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText(`+${r.coins} coins`, cx, ry + 28);
        c.fillStyle = '#b89a6a'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Attacker: ${r.atkLeft} remaining | Defender: ${r.defLeft} remaining`, cx, ry + 50);

        if (Math.floor(this.time/25) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
            c.fillText('Click anywhere to continue', cx, ry + 85);
        }
    }

    _die(c, x, y, sz, val, col) {
        c.fillStyle = col; this._rr(c, x, y, sz, sz, 4); c.fill();
        c.fillStyle = '#f5e6c8'; c.font = `bold ${sz*0.5}px "Segoe UI", sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(val, x+sz/2, y+sz/2);
    }

    // ── SHOP PANEL ────────────────────────────────────────────
    _shopPanel() {
        const c = this.ctx, g = this.g, emp = g.empires[g.player];
        if (!emp) return;
        const pw = 420, ph = 500, px = (g.W-pw)/2, py = (g.H-ph)/2;
        this._rr(c, px, py, pw, ph, 12); c.fillStyle = '#f5e6c8'; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 3;
        this._rr(c, px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#8b0000'; c.font = 'bold 24px Georgia, serif';
        c.fillText('Armory & Shop', px+pw/2, py+30);
        c.fillStyle = '#b7950b'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText(`Coins: ${emp.coins}`, px+pw/2, py+52);

        g.btns = [];
        const cb = { label: 'X', fn: () => { g.state = 'playing'; g.sfx.click(); } };
        cb.rect = { x: px+pw-35, y: py+10, w: 25, h: 25 };
        g.btns.push(cb);
        this._rr(c, px+pw-35, py+10, 25, 25, 5); c.fillStyle = '#922b21'; c.fill();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 14px sans-serif'; c.fillText('X', px+pw-22, py+23);

        let y = py + 75;
        c.fillStyle = '#922b21'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'left';
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
            const canAfford = emp.coins >= it.cost;
            this._rr(c, px+20, y, bw, 28, 6); c.fillStyle = canAfford ? '#e8d5b0' : '#d4c4a0'; c.fill();
            c.strokeStyle = canAfford ? '#8b6914' : '#a08860'; c.lineWidth = 1;
            this._rr(c, px+20, y, bw, 28, 6); c.stroke();
            c.fillStyle = canAfford ? '#2c1810' : '#a08860'; c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(it.label, px+20+bw/2, y+14);
            y += 34;
        }

        // Spy Network
        if (emp.spy) {
            const spyLbl = 'Spy Network (Active)';
            const sbw = pw - 40;
            this._rr(c, px+20, y, sbw, 28, 6); c.fillStyle = '#d4edda'; c.fill();
            c.strokeStyle = '#196f3d'; c.lineWidth = 1;
            this._rr(c, px+20, y, sbw, 28, 6); c.stroke();
            c.fillStyle = '#155724'; c.font = 'bold 12px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(spyLbl, px+20+sbw/2, y+14);
        } else {
            const spyLbl = 'Spy Network - See enemy troops (30c)';
            const sbw = pw - 40;
            const spyBtn = { label: spyLbl, fn: () => g._buySpy() };
            spyBtn.rect = { x: px+20, y, w: sbw, h: 28 };
            g.btns.push(spyBtn);
            this._rr(c, px+20, y, sbw, 28, 6); c.fillStyle = emp.coins >= 30 ? '#e8d5b0' : '#d4c4a0'; c.fill();
            c.strokeStyle = emp.coins >= 30 ? '#8b6914' : '#a08860'; c.lineWidth = 1;
            this._rr(c, px+20, y, sbw, 28, 6); c.stroke();
            c.fillStyle = emp.coins >= 30 ? '#2c1810' : '#a08860'; c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(spyLbl, px+20+sbw/2, y+14);
        }
        y += 38;

        // Weapons
        y += 4;
        c.fillStyle = '#1a5276'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'left';
        c.fillText('WEAPONS', px+20, y); y += 5;

        for (let tier = 2; tier <= 4; tier++) {
            y += 22;
            const unlocked = emp.weapons.has(tier);
            const costs = { 2:25, 3:50, 4:80 };
            const tierNames = { 2:'Medieval', 3:'Gunpowder', 4:'Modern' };
            c.fillStyle = unlocked ? '#196f3d' : '#6b5040'; c.font = 'bold 12px "Segoe UI", sans-serif';
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
                    this._rr(c, wx, y, tw, 22, 4); c.fillStyle = equipped ? '#b7950b' : '#e8d5b0'; c.fill();
                    c.strokeStyle = equipped ? '#ffd700' : '#8b6914'; c.lineWidth = 1;
                    this._rr(c, wx, y, tw, 22, 4); c.stroke();
                    c.fillStyle = equipped ? '#f5e6c8' : '#2c1810'; c.textAlign = 'center';
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
                this._rr(c, px+25, y, pw-50, 24, 5); c.fillStyle = emp.coins >= costs[tier] ? '#e8d5b0' : '#d4c4a0'; c.fill();
                c.strokeStyle = emp.coins >= costs[tier] ? '#8b6914' : '#a08860'; c.lineWidth = 1;
                this._rr(c, px+25, y, pw-50, 24, 5); c.stroke();
                c.fillStyle = emp.coins >= costs[tier] ? '#2c1810' : '#a08860'; c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'center';
                c.fillText(`Unlock Tier ${tier} \u2014 ${tierNames[tier]} (${costs[tier]}c)`, px+pw/2, y+12);
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
            // Shadow for readability
            c.fillStyle = 'rgba(0,0,0,0.6)';
            c.fillText(g.log[i], lx + 1, ly + 1);
            c.fillStyle = `rgba(245,230,200,${Math.max(0.5, 1-age*0.15)})`;
            c.fillText(g.log[i], lx, ly);
            ly -= 16;
        }
    }

    // ── DEFEAT SCREEN (with stats) ────────────────────────────
    _defeat() {
        const c = this.ctx, { W, H } = this.g;
        const stats = this.g.stats;

        // Dark overlay
        c.fillStyle = 'rgba(44,24,16,0.8)';
        c.fillRect(0, 0, W, H);

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#922b21'; c.font = 'bold 52px Georgia, serif';
        c.fillText('DEFEAT', W/2, H*0.22);
        c.fillStyle = '#b89a6a'; c.font = '20px "Segoe UI", sans-serif';
        c.fillText(`Your empire fell on turn ${this.g.turn}`, W/2, H*0.22+45);

        // Stats panel
        const pw = 320, ph = 220, px = (W - pw)/2, py = H*0.42;
        this._rr(c, px, py, pw, ph, 12); c.fillStyle = '#f5e6c8'; c.fill();
        c.strokeStyle = '#922b21'; c.lineWidth = 3;
        this._rr(c, px, py, pw, ph, 12); c.stroke();

        c.fillStyle = '#8b0000'; c.font = 'bold 16px "Segoe UI", sans-serif';
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
            c.textAlign = 'left'; c.fillStyle = '#3a2415';
            c.fillText(s.label, px + 20, sy);
            c.textAlign = 'right'; c.fillStyle = '#8b0000';
            c.fillText(String(s.value), px + pw - 20, sy);
            sy += 30;
        }

        if (Math.floor(this.time/30) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 18px "Segoe UI", sans-serif';
            c.textAlign = 'center';
            c.fillText('Click to return to menu', W/2, H*0.82);
        }
    }

    // ── VICTORY SCREEN (with stats) ───────────────────────────
    _victory() {
        const c = this.ctx, { W, H } = this.g;
        const stats = this.g.stats;

        // Dark overlay
        c.fillStyle = 'rgba(44,24,16,0.8)';
        c.fillRect(0, 0, W, H);

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 52px Georgia, serif';
        c.fillText('VICTORY!', W/2, H*0.15);
        c.fillStyle = '#f5e6c8'; c.font = '24px Georgia, serif';
        c.fillText(`${E(this.g.player).name} conquers all!`, W/2, H*0.15+50);
        c.font = '48px serif'; c.fillText('\u265A', W/2, H*0.15+110);

        // Stats panel
        const pw = 320, ph = 240, px = (W - pw)/2, py = H*0.42;
        this._rr(c, px, py, pw, ph, 12); c.fillStyle = '#f5e6c8'; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 3;
        this._rr(c, px, py, pw, ph, 12); c.stroke();

        c.fillStyle = '#8b0000'; c.font = 'bold 16px "Segoe UI", sans-serif';
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
            c.textAlign = 'left'; c.fillStyle = '#3a2415';
            c.fillText(s.label, px + 20, sy);
            c.textAlign = 'right'; c.fillStyle = '#8b0000';
            c.fillText(String(s.value), px + pw - 20, sy);
            sy += 28;
        }

        if (Math.floor(this.time/30) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 18px "Segoe UI", sans-serif';
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
