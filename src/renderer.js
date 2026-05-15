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

    // ── BACKGROUND — Rich dark ocean gradient ────────────────
    _bg() {
        const c = this.ctx, { W, H } = this.g;
        const gr = c.createRadialGradient(W/2, H/2, 80, W/2, H/2, W*0.8);
        gr.addColorStop(0, '#1a4a6e');
        gr.addColorStop(0.4, '#0e3350');
        gr.addColorStop(1, '#071a2e');
        c.fillStyle = gr; c.fillRect(0, 0, W, H);

        // Animated wave pattern
        c.strokeStyle = 'rgba(100,180,255,0.05)';
        c.lineWidth = 1;
        for (let w = 0; w < 6; w++) {
            c.beginPath();
            for (let x = 0; x < W; x += 3) {
                const y = H - 40 - w * 12 + Math.sin(x * 0.01 + this.time * 0.02 + w) * 6;
                if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
            }
            c.stroke();
        }

        // Subtle floating particles
        for (let i = 0; i < 12; i++) {
            const px = (Math.sin(this.time * 0.005 + i * 3.1) * 0.5 + 0.5) * W;
            const py = (Math.cos(this.time * 0.004 + i * 2.7) * 0.5 + 0.5) * H;
            const alpha = 0.03 + Math.sin(this.time * 0.02 + i) * 0.02;
            c.fillStyle = `rgba(100,180,255,${alpha})`;
            c.beginPath(); c.arc(px, py, 2, 0, Math.PI*2); c.fill();
        }

        // Corner decorations
        this._drawCornerDeco(c, 15, 15, 1, 1);
        this._drawCornerDeco(c, W - 15, 15, -1, 1);
        this._drawCornerDeco(c, 15, H - 15, 1, -1);
        this._drawCornerDeco(c, W - 15, H - 15, -1, -1);

        // Subtle border
        c.strokeStyle = '#0a2640'; c.lineWidth = 3; c.strokeRect(2, 2, W-4, H-4);
    }

    _drawCornerDeco(c, x, y, dx, dy) {
        c.save();
        c.strokeStyle = 'rgba(184,154,106,0.3)';
        c.lineWidth = 1.5;
        // Small ornamental bracket
        c.beginPath();
        c.moveTo(x, y + dy * 30);
        c.quadraticCurveTo(x, y, x + dx * 30, y);
        c.stroke();
        // Small diamond
        c.fillStyle = 'rgba(184,154,106,0.3)';
        c.beginPath();
        c.moveTo(x + dx * 5, y + dy * 5);
        c.lineTo(x + dx * 10, y);
        c.lineTo(x + dx * 5, y - dy * 5);
        c.lineTo(x, y);
        c.closePath();
        c.fill();
        c.restore();
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

        // Decorative war banners on the map edges
        this._drawMapBanner(c, this.toScr(30, 20), 'rgba(139,0,0,0.15)', 0.7);
        this._drawMapBanner(c, this.toScr(MAP_W - 30, 20), 'rgba(26,82,118,0.15)', -0.7);

        // Small ship on ocean
        const shipX = this.toScr(180, MAP_H - 50);
        c.save();
        c.translate(shipX.x, shipX.y);
        c.strokeStyle = 'rgba(139,105,20,0.2)';
        c.fillStyle = 'rgba(139,105,20,0.1)';
        c.lineWidth = 1;
        // Hull
        c.beginPath();
        c.moveTo(-12, 2); c.quadraticCurveTo(-15, 8, -8, 10);
        c.lineTo(8, 10); c.quadraticCurveTo(15, 8, 12, 2);
        c.closePath(); c.fill(); c.stroke();
        // Mast
        c.beginPath(); c.moveTo(0, 2); c.lineTo(0, -12); c.stroke();
        // Sail
        c.beginPath(); c.moveTo(0, -10); c.lineTo(8, -3); c.lineTo(0, 0); c.closePath();
        c.fillStyle = 'rgba(245,230,200,0.15)'; c.fill();
        c.restore();
    }

    _drawMapBanner(c, pos, color, scale) {
        c.save();
        c.translate(pos.x, pos.y);
        c.scale(scale, scale);
        // Pole
        c.strokeStyle = 'rgba(139,105,20,0.2)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, -20); c.lineTo(0, 30); c.stroke();
        // Flag waving
        const wave = Math.sin(this.time * 0.03) * 3;
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(0, -18); c.lineTo(20 + wave, -14);
        c.lineTo(18 + wave * 0.5, -4); c.lineTo(0, -6);
        c.closePath(); c.fill();
        c.restore();
    }

    // ── MENU ──────────────────────────────────────────────────
    _menu() {
        const c = this.ctx, { W, H } = this.g;

        // ── EPIC DARK BACKGROUND with animated gradient ──
        const bgGr = c.createRadialGradient(W/2, H*0.3, 50, W/2, H/2, W*0.9);
        bgGr.addColorStop(0, '#1a0a00');
        bgGr.addColorStop(0.4, '#0d0805');
        bgGr.addColorStop(1, '#050302');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        // Animated golden particles in background
        for (let i = 0; i < 30; i++) {
            const px = (Math.sin(this.time * 0.01 + i * 1.7) * 0.5 + 0.5) * W;
            const py = (Math.cos(this.time * 0.008 + i * 2.3) * 0.5 + 0.5) * H;
            const sz = 1 + Math.sin(this.time * 0.03 + i) * 0.8;
            const alpha = 0.1 + Math.sin(this.time * 0.02 + i * 0.5) * 0.08;
            c.fillStyle = `rgba(255,215,0,${alpha})`;
            c.beginPath(); c.arc(px, py, sz, 0, Math.PI*2); c.fill();
        }

        // ── GRAND IMPERIAL BANNER ──
        const bx = W*0.05, by = H*0.04, bw = W*0.9, bh = H*0.92;
        const bannerGr = c.createLinearGradient(bx, by, bx+bw, by+bh);
        bannerGr.addColorStop(0, 'rgba(44,24,16,0.95)');
        bannerGr.addColorStop(0.3, 'rgba(60,35,20,0.9)');
        bannerGr.addColorStop(0.7, 'rgba(60,35,20,0.9)');
        bannerGr.addColorStop(1, 'rgba(44,24,16,0.95)');
        this._rr(c, bx, by, bw, bh, 18); c.fillStyle = bannerGr; c.fill();

        // Triple gold border
        c.strokeStyle = '#ffd700'; c.lineWidth = 3;
        this._rr(c, bx, by, bw, bh, 18); c.stroke();
        c.strokeStyle = 'rgba(255,215,0,0.3)'; c.lineWidth = 1;
        this._rr(c, bx+6, by+6, bw-12, bh-12, 14); c.stroke();
        c.strokeStyle = 'rgba(184,154,106,0.2)'; c.lineWidth = 1;
        this._rr(c, bx+10, by+10, bw-20, bh-20, 12); c.stroke();

        // ── CORNER DECORATIONS ──
        const cornerSize = 30;
        [[bx+14, by+14], [bx+bw-14, by+14], [bx+14, by+bh-14], [bx+bw-14, by+bh-14]].forEach(([cx, cy]) => {
            c.fillStyle = 'rgba(255,215,0,0.15)';
            c.beginPath(); c.arc(cx, cy, cornerSize/2, 0, Math.PI*2); c.fill();
            c.fillStyle = 'rgba(255,215,0,0.3)';
            c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI*2); c.fill();
        });

        c.textAlign = 'center'; c.textBaseline = 'middle';

        // ── CROWN ICON ──
        c.font = '60px serif';
        c.fillText('👑', W/2, H*0.10);

        // ── TITLE WITH GLOW ──
        c.shadowColor = 'rgba(255,215,0,0.5)'; c.shadowBlur = 20;
        c.fillStyle = '#ffd700'; c.font = 'bold 52px Georgia, serif';
        c.fillText("EMPEROR'S CONQUEST", W/2 + 2, H*0.19 + 2);
        c.fillStyle = '#ffd700';
        c.fillText("EMPEROR'S CONQUEST", W/2, H*0.19);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;

        // Subtitle
        c.fillStyle = '#b89a6a'; c.font = 'italic 18px Georgia, serif';
        c.fillText('Conquer the Ancient World — From India to Rome', W/2, H*0.19+42);

        // ── ORNATE DIVIDER with crossed swords ──
        const divY = H*0.27;
        c.strokeStyle = '#b7950b'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(W*0.15, divY); c.lineTo(W*0.42, divY); c.stroke();
        c.beginPath(); c.moveTo(W*0.58, divY); c.lineTo(W*0.85, divY); c.stroke();
        // Center diamond
        c.fillStyle = '#ffd700';
        c.beginPath();
        c.moveTo(W/2, divY-6); c.lineTo(W/2+6, divY); c.lineTo(W/2, divY+6); c.lineTo(W/2-6, divY);
        c.closePath(); c.fill();
        // Side dots
        c.beginPath(); c.arc(W*0.15, divY, 3, 0, Math.PI*2); c.fill();
        c.beginPath(); c.arc(W*0.85, divY, 3, 0, Math.PI*2); c.fill();

        // ── EMPIRE SHOWCASE — Kings & Icons Row ──
        const showcaseY = H * 0.32;
        c.fillStyle = '#ffd700'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('👑  CHOOSE YOUR DYNASTY  👑', W/2, showcaseY);

        const empireRow = showcaseY + 25;
        const eSpacing = Math.min(80, (W * 0.7) / EIDS.length);
        const eStartX = W/2 - (EIDS.length * eSpacing) / 2 + eSpacing/2;
        for (let i = 0; i < EIDS.length; i++) {
            const em = EMPIRES[EIDS[i]];
            const ex = eStartX + i * eSpacing;
            // Pulsing glow under each empire icon
            const pulse = 0.2 + Math.sin(this.time * 0.04 + i * 0.8) * 0.1;
            c.fillStyle = em.color + '30';
            c.beginPath(); c.arc(ex, empireRow + 12, 20, 0, Math.PI*2); c.fill();
            // Empire icon
            c.font = '32px serif';
            c.fillText(em.icon || '?', ex, empireRow);
            // Empire name
            c.fillStyle = '#b89a6a'; c.font = '9px "Segoe UI", sans-serif';
            c.fillText(em.name, ex, empireRow + 22);
        }

        // ── FEATURES LIST with icons ──
        const featsY = H * 0.44;
        c.fillStyle = '#ffd700'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('📜  GAME FEATURES  📜', W/2, featsY);

        const feats = [
            ['🌍', '18 Territories across Europe, Asia & Africa', '#3498db'],
            ['👑', '10 Empires spanning 3000 years of history', '#ffd700'],
            ['⚔', '4 Combat Strategies: Assault, Siege, Raid, Ambush', '#e74c3c'],
            ['🏸', '4 Weapon Tiers: Swords to Tanks & Bombers', '#b7950b'],
            ['🪙', 'Coin Economy — earn, recruit, fortify, equip', '#27ae60'],
            ['🛡', 'Fortify territories & equip weapons', '#1a5276'],
        ];
        let fy = featsY + 22;
        for (const [icon, text, color] of feats) {
            // Feature row background
            const rowGr = c.createLinearGradient(W*0.2, fy-12, W*0.8, fy-12);
            rowGr.addColorStop(0, 'rgba(184,154,106,0.0)');
            rowGr.addColorStop(0.5, 'rgba(184,154,106,0.08)');
            rowGr.addColorStop(1, 'rgba(184,154,106,0.0)');
            c.fillStyle = rowGr;
            c.fillRect(W*0.2, fy-12, W*0.6, 24);

            c.font = '18px serif'; c.textAlign = 'center';
            c.fillStyle = color;
            c.fillText(icon, W*0.25, fy);
            c.font = '14px "Segoe UI", sans-serif'; c.textAlign = 'left';
            c.fillStyle = '#f5e6c8';
            c.fillText(text, W*0.29, fy);
            fy += 28;
        }

        // ── SOLDIER PARADE at bottom ──
        const paradeY = H * 0.76;
        for (let i = 0; i < 8; i++) {
            const sx = W * 0.15 + i * (W * 0.7 / 7);
            const bobble = Math.sin(this.time * 0.05 + i * 1.2) * 3;
            this._drawSoldier(c, sx, paradeY + bobble, 0.5 + Math.sin(i)*0.1);
        }

        // ── DECORATIVE EMPEROR SILHOUETTES on sides ──
        this._drawEmperorSilhouette(c, W*0.06, H*0.45, 1.2);
        this._drawEmperorSilhouette(c, W*0.94, H*0.45, -1.2);

        // ── Crossed swords under title ──
        this._drawCrossedSwords(c, W/2, divY + 16, 1.5);

        // ── Shield decorations ──
        this._drawShield(c, W*0.10, H*0.6, '#8b0000');
        this._drawShield(c, W*0.90, H*0.6, '#1a5276');

        // ── BUTTONS ──
        const btnY = H * 0.84;
        // Help button
        const hbW = 140, hbH = 40, hbX = W/2 - hbW - 15, hbY = btnY;
        this.g._helpBtnRect = { x: hbX, y: hbY, w: hbW, h: hbH };
        const helpGr = c.createLinearGradient(hbX, hbY, hbX, hbY+hbH);
        helpGr.addColorStop(0, 'rgba(184,154,106,0.2)'); helpGr.addColorStop(1, 'rgba(184,154,106,0.1)');
        this._rr(c, hbX, hbY, hbW, hbH, 10); c.fillStyle = helpGr; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 2;
        this._rr(c, hbX, hbY, hbW, hbH, 10); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('📜 How to Play', hbX + hbW/2, hbY + hbH/2);

        // Play button (big and prominent)
        const pbW = 140, pbH = 40, pbX = W/2 + 15, pbY = btnY;
        const hasSave = !!localStorage.getItem('emperorsConquest_save');
        this.g._continueBtnRect = null;
        const playGr = c.createLinearGradient(pbX, pbY, pbX, pbY+pbH);
        playGr.addColorStop(0, '#c0392b'); playGr.addColorStop(1, '#922b21');
        this._rr(c, pbX, pbY, pbW, pbH, 10); c.fillStyle = playGr; c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 2;
        this._rr(c, pbX, pbY, pbW, pbH, 10); c.stroke();
        c.fillStyle = '#ffd700'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('⚔ New Game', pbX + pbW/2, pbY + pbH/2);

        // Continue button (if save exists)
        if (hasSave) {
            const ctW = 140, ctH = 40, ctX = W/2 - ctW/2, ctY = btnY + 48;
            this.g._continueBtnRect = { x: ctX, y: ctY, w: ctW, h: ctH };
            const ctGr = c.createLinearGradient(ctX, ctY, ctX, ctY+ctH);
            ctGr.addColorStop(0, '#196f3d'); ctGr.addColorStop(1, '#145a32');
            this._rr(c, ctX, ctY, ctW, ctH, 10); c.fillStyle = ctGr; c.fill();
            c.strokeStyle = '#27ae60'; c.lineWidth = 2;
            this._rr(c, ctX, ctY, ctW, ctH, 10); c.stroke();
            c.fillStyle = '#2ecc71'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText('🏆 Continue', ctX + ctW/2, ctY + ctH/2);
        }

        // Pulsing "Click to begin" text
        if (Math.floor(this.time / 25) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 18px Georgia, serif';
            c.textAlign = 'center';
            c.shadowColor = 'rgba(255,215,0,0.4)'; c.shadowBlur = 8;
            c.fillText('✨ Click New Game to begin your conquest ✨', W/2, H*0.94);
            c.shadowColor = 'transparent'; c.shadowBlur = 0;
        }
    }

    // ── DECORATIVE DRAWING HELPERS ──────────────────────────

    _drawEmperorSilhouette(c, x, y, scale) {
        c.save();
        c.translate(x, y);
        c.scale(scale, scale);
        c.fillStyle = 'rgba(139,105,20,0.15)';
        // Crown
        c.beginPath();
        c.moveTo(-20, -40); c.lineTo(-25, -55); c.lineTo(-15, -48);
        c.lineTo(-8, -58); c.lineTo(0, -45); c.lineTo(8, -58);
        c.lineTo(15, -48); c.lineTo(25, -55); c.lineTo(20, -40);
        c.closePath(); c.fill();
        // Head
        c.beginPath(); c.arc(0, -25, 18, 0, Math.PI*2); c.fill();
        // Body/cloak
        c.beginPath();
        c.moveTo(-25, -10); c.lineTo(-35, 40); c.lineTo(-20, 45);
        c.lineTo(-5, 10); c.lineTo(5, 10); c.lineTo(20, 45);
        c.lineTo(35, 40); c.lineTo(25, -10);
        c.closePath(); c.fill();
        // Scepter
        c.strokeStyle = 'rgba(139,105,20,0.2)';
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(30, -30); c.lineTo(30, 40); c.stroke();
        c.fillStyle = 'rgba(255,215,0,0.2)';
        c.beginPath(); c.arc(30, -33, 5, 0, Math.PI*2); c.fill();
        c.restore();
    }

    _drawCrossedSwords(c, x, y, scale) {
        c.save();
        c.translate(x, y);
        c.scale(scale, scale);
        c.strokeStyle = 'rgba(139,105,20,0.25)';
        c.lineWidth = 2.5;
        // Left sword
        c.beginPath(); c.moveTo(-18, -18); c.lineTo(18, 18); c.stroke();
        c.beginPath(); c.moveTo(-22, -12); c.lineTo(-14, -14); c.stroke();
        // Right sword
        c.beginPath(); c.moveTo(18, -18); c.lineTo(-18, 18); c.stroke();
        c.beginPath(); c.moveTo(22, -12); c.lineTo(14, -14); c.stroke();
        // Center gem
        c.fillStyle = 'rgba(139,0,0,0.3)';
        c.beginPath(); c.arc(0, 0, 4, 0, Math.PI*2); c.fill();
        c.restore();
    }

    _drawShield(c, x, y, color) {
        c.save();
        c.translate(x, y);
        c.fillStyle = color + '20';
        c.strokeStyle = color + '40';
        c.lineWidth = 2;
        // Shield shape
        c.beginPath();
        c.moveTo(0, -25); c.lineTo(20, -18); c.lineTo(22, 5);
        c.quadraticCurveTo(15, 28, 0, 32);
        c.quadraticCurveTo(-15, 28, -22, 5);
        c.lineTo(-20, -18); c.closePath();
        c.fill(); c.stroke();
        // Cross on shield
        c.strokeStyle = color + '30';
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(0, -18); c.lineTo(0, 25); c.stroke();
        c.beginPath(); c.moveTo(-15, 0); c.lineTo(15, 0); c.stroke();
        c.restore();
    }

    _drawSoldier(c, x, y, scale) {
        c.save();
        c.translate(x, y);
        c.scale(scale, scale);
        c.fillStyle = 'rgba(139,105,20,0.12)';
        // Helmet
        c.beginPath(); c.arc(0, -30, 12, Math.PI, 0); c.fill();
        c.fillRect(-14, -30, 28, 4);
        // Head
        c.beginPath(); c.arc(0, -20, 8, 0, Math.PI*2); c.fill();
        // Body armor
        c.fillRect(-12, -12, 24, 30);
        // Shield arm
        c.fillRect(-20, -8, 10, 20);
        // Sword arm
        c.strokeStyle = 'rgba(139,105,20,0.15)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(12, -5); c.lineTo(25, -25); c.stroke();
        // Legs
        c.fillRect(-10, 18, 8, 18);
        c.fillRect(2, 18, 8, 18);
        // Spear
        c.strokeStyle = 'rgba(139,105,20,0.15)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(-18, -15); c.lineTo(-18, -55); c.stroke();
        c.restore();
    }

    // ── EMPIRE SELECT ─────────────────────────────────────────
    _empSel() {
        const c = this.ctx, { W, H } = this.g;

        // Dark imperial background
        const bgGr = c.createRadialGradient(W/2, H/2, 50, W/2, H/2, W*0.8);
        bgGr.addColorStop(0, '#1a0f08'); bgGr.addColorStop(1, '#080402');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        // Title with glow
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(255,215,0,0.4)'; c.shadowBlur = 15;
        c.fillStyle = '#ffd700'; c.font = 'bold 34px Georgia, serif';
        c.fillText('👑 Choose Your Empire 👑', W/2, 40);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;
        c.fillStyle = '#b89a6a'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText('Each empire has a unique bonus — click to select', W/2, 68);

        const g = this.g;
        g.btns = [];
        const bbW = 80, bbH = 30, bbX = 15, bbY = 15;
        const backBtn = { label: 'Back', fn: () => { g.state = 'menu'; g.sfx.click(); } };
        backBtn.rect = { x: bbX, y: bbY, w: bbW, h: bbH };
        g.btns.push(backBtn);
        this._rr(c, bbX, bbY, bbW, bbH, 8); c.fillStyle = 'rgba(184,154,106,0.15)'; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 1.5;
        this._rr(c, bbX, bbY, bbW, bbH, 8); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('⬅ Back', bbX + bbW/2, bbY + bbH/2);

        const cols = 5, cw = Math.min(160, (W-50)/cols), ch = 160, gap = 6;
        const rows = Math.ceil(EIDS.length / cols);
        const totalW = cw * cols + gap * (cols - 1);
        const sx = (W - totalW) / 2, sy = (H - ch*rows - gap*(rows-1))/2 + 30;

        for (let i = 0; i < EIDS.length; i++) {
            const eid = EIDS[i], em = EMPIRES[eid];
            const col = i % cols, row = Math.floor(i / cols);
            const x = sx + col*(cw+gap), y = sy + row*(ch+gap);
            const hover = this.g.input.hoverX >= x && this.g.input.hoverX <= x+cw &&
                          this.g.input.hoverY >= y && this.g.input.hoverY <= y+ch;

            // Card background with gradient
            const cardGr = c.createLinearGradient(x, y, x, y+ch);
            cardGr.addColorStop(0, hover ? 'rgba(60,35,20,0.95)' : 'rgba(40,24,14,0.9)');
            cardGr.addColorStop(1, hover ? 'rgba(50,28,16,0.95)' : 'rgba(30,18,10,0.9)');
            this._rr(c, x, y, cw, ch, 12); c.fillStyle = cardGr; c.fill();
            // Empire color top bar
            c.fillStyle = em.color; c.fillRect(x+1, y+1, cw-2, 5);
            // Border
            c.strokeStyle = hover ? '#ffd700' : em.color + '80'; c.lineWidth = hover ? 2.5 : 1.5;
            this._rr(c, x, y, cw, ch, 12); c.stroke();

            // Glow effect on hover
            if (hover) {
                c.shadowColor = em.color; c.shadowBlur = 15;
                this._rr(c, x, y, cw, ch, 12); c.stroke();
                c.shadowColor = 'transparent'; c.shadowBlur = 0;
            }

            // Empire icon
            c.fillStyle = em.color; c.font = '28px serif';
            c.fillText(em.icon || '?', x+cw/2, y+32);
            // Name
            c.fillStyle = '#f5e6c8'; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(em.name, x+cw/2, y+58);
            // Era
            c.fillStyle = '#b89a6a'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(em.era, x+cw/2, y+75);
            // Bonus text
            c.fillStyle = '#ffd700'; c.font = '10px "Segoe UI", sans-serif';
            const words = em.bonus.split(' ');
            let ly = y + 95;
            for (let wi = 0; wi < words.length; wi += 3) {
                c.fillText(words.slice(wi, wi+3).join(' '), x+cw/2, ly);
                ly += 13;
            }
        }
    }

    // ── HELP SCREEN ───────────────────────────────────────────
    _helpScreen() {
        const c = this.ctx, { W, H } = this.g;
        // Dark overlay
        c.fillStyle = 'rgba(10,6,3,0.85)';
        c.fillRect(0, 0, W, H);

        const pw = 540, ph = 520, px = (W - pw)/2, py = (H - ph)/2;
        // Panel background
        const panelGr = c.createLinearGradient(px, py, px+pw, py+ph);
        panelGr.addColorStop(0, '#2c1810'); panelGr.addColorStop(1, '#3d2b1f');
        this._rr(c, px, py, pw, ph, 16); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 16); c.stroke();
        c.strokeStyle = 'rgba(184,154,106,0.3)'; c.lineWidth = 1;
        this._rr(c, px+5, py+5, pw-10, ph-10, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(255,215,0,0.3)'; c.shadowBlur = 10;
        c.fillStyle = '#ffd700'; c.font = 'bold 28px Georgia, serif';
        c.fillText('📜 How to Play 📜', px + pw/2, py + 34);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;

        c.strokeStyle = 'rgba(184,154,106,0.4)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 30, py + 58); c.lineTo(px + pw - 30, py + 58); c.stroke();

        const sections = [
            { header: 'SELECT', color: '#3498db', text: 'Click your territory to select it' },
            { header: 'RECRUIT', color: '#27ae60', text: 'Buy soldiers (+1) or veterans (+2) with coins' },
            { header: 'FORTIFY', color: '#1a5276', text: 'Spend 15 coins for +2 permanent defense' },
            { header: 'MOVE', color: '#9b59b6', text: 'Move troops between your adjacent territories' },
            { header: 'ATTACK', color: '#e74c3c', text: 'Attack enemies with dice + bonuses' },
            { header: 'WEAPONS', color: '#f39c12', text: 'Unlock tiers in shop, equip on territories' },
            { header: 'SPY', color: '#16a085', text: 'Buy spy network (30c) to see enemy troops' },
            { header: 'INCOME', color: '#e74c3c', text: 'Base 3 + 1/territory + empire bonus per turn' },
            { header: 'WIN', color: '#ffd700', text: 'Control all 18 territories to win!' },
        ];

        let sy = py + 78;
        for (const sec of sections) {
            c.textAlign = 'left';
            c.fillStyle = sec.color; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(sec.header, px + 30, sy);
            c.fillStyle = '#f5e6c8'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText(sec.text, px + 105, sy);
            sy += 28;
        }

        c.textAlign = 'center';
        c.fillStyle = '#b89a6a'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText('Click anywhere to close', px + pw/2, py + ph - 20);
    }

    // ── DIFFICULTY SCREEN ──────────────────────────────────────
    _difficultyScreen() {
        const c = this.ctx, { W, H } = this.g;
        const g = this.g;

        // Dark background
        const bgGr = c.createRadialGradient(W/2, H/2, 50, W/2, H/2, W*0.8);
        bgGr.addColorStop(0, '#1a0f08'); bgGr.addColorStop(1, '#080402');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(255,215,0,0.4)'; c.shadowBlur = 15;
        c.fillStyle = '#ffd700'; c.font = 'bold 38px Georgia, serif';
        c.fillText('⚔ Select Difficulty ⚔', W/2, H*0.15);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;
        c.fillStyle = '#b89a6a'; c.font = '16px Georgia, serif';
        c.fillText('Choose your challenge level', W/2, H*0.15 + 38);

        // Gold divider
        c.strokeStyle = 'rgba(184,154,106,0.4)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W*0.3, H*0.24); c.lineTo(W*0.7, H*0.24); c.stroke();

        g.btns = [];

        const diffs = [
            {
                label: 'Easy', color: '#27ae60', border: '#2ecc71',
                desc: 'AI earns 60% income, attacks cautiously',
                detail: 'AI starts with fewer troops. Good for learning.',
                icon: '⭐',
            },
            {
                label: 'Normal', color: '#f39c12', border: '#f1c40f',
                desc: 'Balanced gameplay',
                detail: 'Standard experience. AI plays fairly.',
                icon: '⚔',
            },
            {
                label: 'Hard', color: '#e74c3c', border: '#c0392b',
                desc: 'AI earns 140% income, attacks aggressively',
                detail: 'AI starts with extra troops. For veterans only.',
                icon: '☠',
            },
        ];

        const btnW = 220, btnH = 180, gap = 30;
        const totalW = btnW * 3 + gap * 2;
        const startX = (W - totalW) / 2;
        const startY = H * 0.30;

        for (let i = 0; i < diffs.length; i++) {
            const d = diffs[i];
            const bx = startX + i * (btnW + gap);
            const by = startY;
            const hover = g.input.hoverX >= bx && g.input.hoverX <= bx + btnW &&
                          g.input.hoverY >= by && g.input.hoverY <= by + btnH;

            // Card background
            const cardGr = c.createLinearGradient(bx, by, bx, by+btnH);
            cardGr.addColorStop(0, hover ? 'rgba(60,35,20,0.95)' : 'rgba(40,24,14,0.9)');
            cardGr.addColorStop(1, hover ? 'rgba(50,28,16,0.95)' : 'rgba(30,18,10,0.9)');
            this._rr(c, bx, by, btnW, btnH, 14); c.fillStyle = cardGr; c.fill();
            // Top color bar
            c.fillStyle = d.color;
            this._rr(c, bx, by, btnW, 6, 14); c.fill();
            // Border
            c.strokeStyle = hover ? '#ffd700' : d.color + '80'; c.lineWidth = hover ? 2.5 : 1.5;
            this._rr(c, bx, by, btnW, btnH, 14); c.stroke();
            if (hover) { c.shadowColor = d.color; c.shadowBlur = 12; this._rr(c, bx, by, btnW, btnH, 14); c.stroke(); c.shadowColor = 'transparent'; c.shadowBlur = 0; }

            // Icon
            c.font = '42px serif'; c.fillStyle = d.color;
            c.fillText(d.icon, bx + btnW/2, by + 45);
            // Label
            c.font = 'bold 24px Georgia, serif'; c.fillStyle = '#f5e6c8';
            c.fillText(d.label, bx + btnW/2, by + 80);
            // Description
            c.font = '12px "Segoe UI", sans-serif'; c.fillStyle = '#b89a6a';
            c.fillText(d.desc, bx + btnW/2, by + 108);
            // Detail
            c.font = '11px "Segoe UI", sans-serif'; c.fillStyle = '#8a7a6a';
            c.fillText(d.detail, bx + btnW/2, by + 130);

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
        const bbW = 80, bbH = 30, bbX = 15, bbY = 15;
        const backBtn = { label: 'Back', fn: () => { g.state = 'menu'; g.sfx.click(); } };
        backBtn.rect = { x: bbX, y: bbY, w: bbW, h: bbH };
        g.btns.push(backBtn);
        this._rr(c, bbX, bbY, bbW, bbH, 8); c.fillStyle = 'rgba(184,154,106,0.15)'; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 1.5;
        this._rr(c, bbX, bbY, bbW, bbH, 8); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('⬅ Back', bbX + bbW/2, bbY + bbH/2);

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
        this._drawMarchingSoldiers();
        this._territories();
        this._drawParticles();
        this._drawCaptureAnims();
        this._drawTooltip();
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

    // ── MARCHING SOLDIERS between friendly territories ────────
    _drawMarchingSoldiers() {
        const c = this.ctx, g = this.g;
        const drawn = new Set();
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s || !s.owner || s.troops < 2) continue;
            for (const a of t.adj) {
                const key = Math.min(t.id, a) + '-' + Math.max(t.id, a);
                if (drawn.has(key)) continue;
                const s2 = g.ts[a];
                if (!s2 || !s2.owner || s2.owner !== s.owner) continue;
                drawn.add(key);

                const p1 = this.toScr(t.cx, t.cy), p2 = this.toScr(T(a).cx, T(a).cy);
                const em = EMPIRES[s.owner];
                const soldierCount = Math.min(Math.floor(s.troops / 3), 3);
                for (let i = 0; i < soldierCount; i++) {
                    const speed = 0.008 + i * 0.003;
                    const offset = (this.time * speed + i * 0.33 + t.id * 0.17) % 1;
                    const sx = p1.x + (p2.x - p1.x) * offset;
                    const sy = p1.y + (p2.y - p1.y) * offset;
                    // Bob up and down
                    const bob = Math.sin(this.time * 0.1 + i * 2 + t.id) * 2;
                    const sz = Math.max(6, 8 * this.scale);

                    c.fillStyle = em.color + '80';
                    // Body
                    c.fillRect(sx - sz * 0.4, sy - sz + bob, sz * 0.8, sz);
                    // Head
                    c.beginPath(); c.arc(sx, sy - sz * 1.2 + bob, sz * 0.35, 0, Math.PI * 2); c.fill();
                    // Weapon (spear line)
                    c.strokeStyle = em.color + '60'; c.lineWidth = 1;
                    c.beginPath(); c.moveTo(sx + sz * 0.4, sy - sz * 0.5 + bob);
                    c.lineTo(sx + sz * 0.4, sy - sz * 2 + bob); c.stroke();
                    // Legs animation
                    const legPhase = Math.sin(this.time * 0.15 + i * 1.5);
                    c.fillStyle = em.color + '60';
                    c.fillRect(sx - sz * 0.3 + legPhase * 2, sy + bob, sz * 0.25, sz * 0.5);
                    c.fillRect(sx + sz * 0.05 - legPhase * 2, sy + bob, sz * 0.25, sz * 0.5);
                }
            }
        }
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

            // ── 3D Shadow under territory ──
            c.save();
            c.translate(3, 4);
            drawPoly();
            c.fillStyle = 'rgba(0,0,0,0.25)';
            c.fill();
            c.restore();

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
            const borderColor = isSel ? '#ffd700' : (isHov ? '#ffd700' : (em ? em.color + 'cc' : 'rgba(100,80,60,0.5)'));
            c.strokeStyle = borderColor;
            c.lineWidth = (isSel ? 3 : (isHov ? 2.5 : 1.5)) * this.scale;
            c.stroke();

            // ── Glow effect for selected/hovered ──
            if (isSel || isHov) {
                c.save();
                c.shadowColor = isSel ? '#ffd700' : 'rgba(255,215,0,0.5)';
                c.shadowBlur = 12 * this.scale;
                drawPoly();
                c.strokeStyle = 'transparent';
                c.lineWidth = 0;
                c.stroke();
                c.restore();
            }

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
                c.fillText('\U0001F6E1' + shields, p.x + 28*this.scale, p.y - 18*this.scale);
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
            c.font = `bold ${Math.round(22*this.scale)}px "Segoe UI", sans-serif`;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            // Add text shadow for readability
            c.shadowColor = 'rgba(0,0,0,0.8)';
            c.shadowBlur = 6;
            c.shadowOffsetX = 1;
            c.shadowOffsetY = 2;
            const hideTroops = s.owner && s.owner !== g.player && !(g.empires[g.player]?.spy);
            c.fillText(hideTroops ? '?' : s.troops, p.x, p.y + 2);
            c.shadowColor = 'transparent';
            c.shadowBlur = 0;
            c.shadowOffsetX = 0;
            c.shadowOffsetY = 0;

            // ── Territory name below ──
            c.fillStyle = '#fff';
            c.font = `bold ${Math.round(11*this.scale)}px "Segoe UI", sans-serif`;
            c.shadowColor = 'rgba(0,0,0,0.8)';
            c.shadowBlur = 4;
            c.fillText(t.name, p.x, p.y + 22*this.scale);
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

    // ── TOOLTIP ──────────────────────────────────────────────
    _drawTooltip() {
        const c = this.ctx, g = this.g;
        if (g.hover == null || g.hover < 0) return;
        if (g.state !== 'playing' && g.state !== 'attack' && g.state !== 'shop' && g.state !== 'moveDialog') return;

        const t = T(g.hover);
        const s = g.ts[g.hover];
        if (!s) return;

        const em = s.owner ? EMPIRES[s.owner] : null;
        const hasSpy = g.empires[g.player]?.spy;
        const isOwn = s.owner === g.player;

        // Build tooltip lines
        const lines = [t.name];
        lines.push(`${TERRAIN_ICONS[t.terrain] || ''} ${t.terrain.charAt(0).toUpperCase() + t.terrain.slice(1)} (def +${t.def})`);

        if (em) {
            lines.push(`${em.icon} ${em.name}`);
            lines.push(`Troops: ${isOwn || hasSpy ? s.troops : '???'}`);
            if (s.fort > 0) lines.push(`Fort: +${s.fort} def`);
            if (s.weapon && s.weapon.name !== 'Sword') lines.push(`${s.weapon.icon} ${s.weapon.name} (A+${s.weapon.atk} D+${s.weapon.def})`);
        } else {
            lines.push(`Neutral garrison: ${s.troops}`);
        }

        // Position tooltip near cursor
        const mx = g.input.hoverX;
        const my = g.input.hoverY;
        const pad = 10, lineH = 18;
        c.font = '13px "Segoe UI", sans-serif';
        const maxW = Math.max(...lines.map(l => c.measureText(l).width));
        const tw = maxW + pad * 2;
        const th = lines.length * lineH + pad * 2;

        let tx = mx + 15, ty = my - th - 10;
        if (tx + tw > g.W - 10) tx = mx - tw - 15;
        if (ty < 10) ty = my + 15;

        // Draw tooltip background
        c.fillStyle = 'rgba(20, 15, 10, 0.9)';
        c.strokeStyle = em ? em.color : '#888';
        c.lineWidth = 1.5;
        this._rr(c, tx, ty, tw, th, 6);
        c.fill(); c.stroke();

        // Draw tooltip text
        c.textAlign = 'left'; c.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
            c.fillStyle = i === 0 ? '#ffd700' : (i === 1 ? '#ccc' : '#fff');
            c.font = i === 0 ? 'bold 14px "Segoe UI", sans-serif' : '12px "Segoe UI", sans-serif';
            c.fillText(lines[i], tx + pad, ty + pad + i * lineH);
        }
    }

    // ── HUD ───────────────────────────────────────────────────
    _hud() {
        const c = this.ctx, g = this.g, { W } = g;
        const emp = g.empires[g.player], em = EMPIRES[g.player];
        if (!emp) return;

        // ── 3D raised button helper ──
        const draw3DBtn = (bx, by, bw, bh, baseR, baseG, baseB, isActive) => {
            const r = 8;
            // Shadow (3px below)
            c.fillStyle = 'rgba(0,0,0,0.45)';
            this._rr(c, bx + 2, by + 3, bw, bh, r); c.fill();
            // Main button body with gradient
            if (isActive) {
                const btnGr = c.createLinearGradient(bx, by, bx, by + bh);
                const lr = Math.min(255, baseR + 50), lg = Math.min(255, baseG + 50), lb = Math.min(255, baseB + 50);
                const dr = Math.max(0, baseR - 30), dg = Math.max(0, baseG - 30), db = Math.max(0, baseB - 30);
                btnGr.addColorStop(0, `rgb(${lr},${lg},${lb})`);
                btnGr.addColorStop(1, `rgb(${dr},${dg},${db})`);
                this._rr(c, bx, by, bw, bh, r); c.fillStyle = btnGr; c.fill();
                // Border
                c.strokeStyle = `rgb(${lr},${lg},${lb})`; c.lineWidth = 1.5;
                this._rr(c, bx, by, bw, bh, r); c.stroke();
                // Top highlight line
                c.strokeStyle = `rgba(255,255,255,0.35)`; c.lineWidth = 1;
                c.beginPath(); c.moveTo(bx + r, by + 1); c.lineTo(bx + bw - r, by + 1); c.stroke();
            } else {
                const btnGr = c.createLinearGradient(bx, by, bx, by + bh);
                btnGr.addColorStop(0, 'rgba(90,70,50,0.85)');
                btnGr.addColorStop(1, 'rgba(55,40,28,0.85)');
                this._rr(c, bx, by, bw, bh, r); c.fillStyle = btnGr; c.fill();
                c.strokeStyle = 'rgba(100,80,60,0.4)'; c.lineWidth = 1;
                this._rr(c, bx, by, bw, bh, r); c.stroke();
            }
        };

        // ── Top bar (65px) - brown with gold accents ──
        const TOP_H = 65;
        const hudGr = c.createLinearGradient(0, 0, 0, TOP_H);
        hudGr.addColorStop(0, 'rgba(44,24,16,0.94)');
        hudGr.addColorStop(1, 'rgba(60,35,20,0.90)');
        c.fillStyle = hudGr; c.fillRect(0, 0, W, TOP_H);
        c.fillStyle = '#b89a6a'; c.fillRect(0, TOP_H - 2, W, 2);

        // Empire color bar and name
        c.fillStyle = em.color; c.fillRect(10, 8, 6, 49);
        c.fillStyle = '#f5e6c8'; c.font = 'bold 18px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(em.name, 24, 22);

        // Stats row
        c.font = '14px "Segoe UI", sans-serif';
        c.fillStyle = '#ffd700';
        c.fillText(`Coins: ${emp.coins}`, 24, 48);
        c.fillStyle = '#e8d5b0';
        c.fillText(`Territories: ${emp.tids.length}/${TERRITORIES.length}`, 155, 48);

        // Conquest progress bar (wider)
        const progW = 120, progH = 10, progX = 340, progY = 42;
        c.fillStyle = 'rgba(0,0,0,0.4)'; this._rr(c, progX, progY, progW, progH, 5); c.fill();
        const progFill = emp.tids.length / TERRITORIES.length;
        if (progFill > 0) {
            const progGr = c.createLinearGradient(progX, 0, progX + progW, 0);
            progGr.addColorStop(0, '#e74c3c'); progGr.addColorStop(0.5, '#f39c12'); progGr.addColorStop(1, '#27ae60');
            c.fillStyle = progGr;
            this._rr(c, progX, progY, Math.max(5, progW * progFill), progH, 5); c.fill();
        }
        c.strokeStyle = '#b89a6a'; c.lineWidth = 1; this._rr(c, progX, progY, progW, progH, 5); c.stroke();

        const totalTroops = emp.tids.reduce((s, id) => s + g.ts[id].troops, 0);
        c.fillStyle = '#b89a6a'; c.fillText(`Troops: ${totalTroops}`, 470, 48);

        // Alive/dead empire count
        const aliveCount = EIDS.filter(id => g.empires[id]?.alive).length;
        c.textAlign = 'right';
        c.fillStyle = '#b89a6a';
        c.fillText(`Turn ${g.turn}  |  ${aliveCount} empires alive`, W - 15, 22);
        c.fillStyle = '#ffd700'; c.fillText(g._isAI() ? 'AI Turn' : 'Your Turn', W - 15, 48);

        // Phase bar
        const msg = g.phaseMsg();
        if (msg) {
            const bh = 32, by = g.H - bh - 40;
            c.fillStyle = 'rgba(44,24,16,0.75)';
            this._rr(c, 12, by, W - 24, bh, 8); c.fill();
            c.strokeStyle = '#8b6914'; c.lineWidth = 1;
            this._rr(c, 12, by, W - 24, bh, 8); c.stroke();
            c.fillStyle = '#f5e6c8'; c.font = '13px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(msg, W / 2, by + bh / 2);
        }

        // ── Buttons ──
        g.btns = [];
        if (g._isAI()) return;

        // Save and Menu buttons in top bar (36px tall, 3D)
        const smBtnH = 36, smBtnGap = 8, smBtnMinW = 100;
        const smBtnY = Math.round((TOP_H - smBtnH) / 2);
        c.font = 'bold 13px "Segoe UI", sans-serif';
        const menuLabel = '🏠 Menu', saveLabel = '💾 Save';
        const menuW = Math.max(smBtnMinW, c.measureText(menuLabel).width + 28);
        const saveW = Math.max(smBtnMinW, c.measureText(saveLabel).width + 28);
        const hudMenuBtnX = W - 12 - menuW;
        const hudSaveBtnX = hudMenuBtnX - smBtnGap - saveW;

        const hudMenuBtn = { label: menuLabel, fn: () => { g.state = 'menu'; g.sfx.click(); } };
        hudMenuBtn.rect = { x: hudMenuBtnX, y: smBtnY, w: menuW, h: smBtnH };
        g.btns.push(hudMenuBtn);
        draw3DBtn(hudMenuBtnX, smBtnY, menuW, smBtnH, 139, 105, 20, true);
        c.fillStyle = '#f5e6c8'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(menuLabel, hudMenuBtnX + menuW / 2, smBtnY + smBtnH / 2);

        const hudSaveBtn = { label: saveLabel, fn: () => g.saveGame() };
        hudSaveBtn.rect = { x: hudSaveBtnX, y: smBtnY, w: saveW, h: smBtnH };
        g.btns.push(hudSaveBtn);
        draw3DBtn(hudSaveBtnX, smBtnY, saveW, smBtnH, 25, 111, 61, true);
        c.fillStyle = '#f5e6c8'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(saveLabel, hudSaveBtnX + saveW / 2, smBtnY + smBtnH / 2);

        // ── Action buttons (48px tall, min 120px wide, 3D raised) ──
        const btnH = 48, btnGap = 8, btnMinW = 120, btnFont = 'bold 16px "Segoe UI", sans-serif';
        const row1Y = TOP_H + 7;  // 72
        const row2Y = row1Y + btnH + btnGap + 3;  // 131

        const hasSel = g.sel != null && g.ts[g.sel]?.owner === g.player;
        const hasAdjEnemy = hasSel && T(g.sel).adj.some(a => g.ts[a].owner !== g.player);
        const hasAdjAlly = hasSel && T(g.sel).adj.some(a => g.ts[a].owner === g.player && a !== g.sel);
        const canMove = hasSel && g.ts[g.sel].troops > 1 && hasAdjAlly;
        const soldierCost = g.player === 'russia' ? 5 : 10;

        const btns = [
            { label: `🛡 Recruit (${soldierCost}c)`, active: hasSel && emp.coins >= soldierCost, fn: () => g._buySoldier() },
            { label: '⚔ Veteran (20c)', active: hasSel && emp.coins >= 20, fn: () => g._buyVeteran() },
            { label: '🏃 Move', active: canMove, fn: () => { g.phase = 'move'; g.sfx.click(); } },
            { label: '⚔️ Attack', active: hasSel && hasAdjEnemy && g.ts[g.sel].troops > 1, fn: () => { g.phase = 'attack'; g._attackTarget = null; g.sfx.click(); } },
            { label: '🛒 Shop', active: true, fn: () => { if (!g.sel && g.empires[g.player].tids.length > 0) g.sel = g.empires[g.player].tids[0]; g.state = 'shop'; g.sfx.click(); } },
            { label: '⏭ End Turn', active: true, fn: () => g.endTurn() },
            { label: '❌ Cancel', active: g.phase !== 'select', fn: () => { g.phase = 'select'; g.sfx.click(); } },
            { label: `↩ Undo (${g.undoStack.length})`, active: g.undoStack.length > 0 && !g._isAI(), fn: () => g._undo() },
        ];

        // Measure button widths
        c.font = btnFont;
        for (const b of btns) {
            b._w = Math.max(btnMinW, c.measureText(b.label).width + 28);
        }

        // Determine if we need 2 rows: try fitting all in one row first
        const totalW = btns.reduce((s, b) => s + b._w, 0) + (btns.length - 1) * btnGap;
        const useTwoRows = totalW > W - 20;

        c.textBaseline = 'middle';
        let row1Btns, row2Btns;
        if (useTwoRows) {
            // Split: first 4 in row 1, last 4 in row 2
            row1Btns = btns.slice(0, 4);
            row2Btns = btns.slice(4);
        } else {
            row1Btns = btns;
            row2Btns = [];
        }

        const drawBtnRow = (row, by) => {
            let x = 10;
            for (const b of row) {
                b.rect = { x, y: by, w: b._w, h: btnH };
                g.btns.push(b);
                draw3DBtn(x, by, b._w, btnH, 160, 120, 24, b.active);
                c.font = btnFont;
                c.textAlign = 'center';
                c.fillStyle = b.active ? '#f5e6c8' : '#7a6a5a';
                c.fillText(b.label, x + b._w / 2, by + btnH / 2);
                x += b._w + btnGap;
            }
        };

        drawBtnRow(row1Btns, row1Y);
        if (row2Btns.length > 0) {
            drawBtnRow(row2Btns, row2Y);
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

        // Dark panel background
        const panelGr = c.createLinearGradient(px, py, px + panelW, py);
        panelGr.addColorStop(0, 'rgba(30,18,10,0.92)');
        panelGr.addColorStop(1, 'rgba(40,24,14,0.88)');
        this._rr(c, px, py, panelW, ph, 10); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 1.5;
        this._rr(c, px, py, panelW, ph, 10); c.stroke();

        // Title
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('\U0001F3DB EMPIRES', px + panelW/2, py + 16);

        // Divider
        c.strokeStyle = 'rgba(184,154,106,0.3)'; c.lineWidth = 1;
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
                c.fillStyle = 'rgba(255,215,0,0.15)'; c.fill();
            }

            // Color indicator
            c.fillStyle = alive ? em.color : '#5a4030';
            c.fillRect(px + 8, y - 5, 4, 18);

            // Empire name
            c.font = `${isPlayer ? 'bold ' : ''}11px "Segoe UI", sans-serif`;
            c.fillStyle = alive ? (isPlayer ? '#ffd700' : '#f5e6c8') : '#5a4030';
            c.fillText(em.name.substring(0, 15), px + 18, y + 2);

            // Status line
            c.font = '9px "Segoe UI", sans-serif';
            if (alive) {
                c.fillStyle = '#b89a6a';
                c.fillText(`${tCount} terr | ${emp.coins}c`, px + 18, y + 14);
            } else {
                c.fillStyle = '#922b21';
                c.fillText('ELIMINATED', px + 18, y + 14);
            }

            y += 34;
        }

        // Player stats at bottom
        y = py + ph - 70;
        c.strokeStyle = 'rgba(184,154,106,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 10, y); c.lineTo(px + panelW - 10, y); c.stroke();

        const stats = g.stats;
        c.fillStyle = '#ffd700'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText('\U0001F4CA YOUR STATS', px + panelW/2, y + 14);

        c.textAlign = 'left'; c.font = '10px "Segoe UI", sans-serif';
        c.fillStyle = '#b89a6a';
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

        const pw = 400, ph = 360, px = (g.W - pw)/2, py = (g.H - ph)/2;

        // 3D shadow behind panel
        c.fillStyle = 'rgba(0,0,0,0.4)';
        this._rr(c, px + 5, py + 5, pw, ph, 14); c.fill();

        // Dark panel
        const panelGr = c.createLinearGradient(px, py, px, py+ph);
        panelGr.addColorStop(0, '#2c1810'); panelGr.addColorStop(1, '#1e1008');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#27ae60'; c.lineWidth = 2.5;
        this._rr(c, px, py, pw, ph, 14); c.stroke();
        // Inner border highlight
        c.strokeStyle = 'rgba(39,174,96,0.2)'; c.lineWidth = 1;
        this._rr(c, px + 4, py + 4, pw - 8, ph - 8, 11); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(39,174,96,0.4)'; c.shadowBlur = 10;
        c.fillStyle = '#27ae60'; c.font = 'bold 24px Georgia, serif';
        c.fillText('\uD83C\uDFC3 Move Troops', px + pw/2, py + 32);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;

        c.fillStyle = '#f5e6c8'; c.font = '15px "Segoe UI", sans-serif';
        c.fillText('From: ' + fromT.name + ' (' + fromS.troops + ' troops)', px + pw/2, py + 65);
        c.fillText('To: ' + toT.name + ' (' + toS.troops + ' troops)', px + pw/2, py + 90);

        c.fillStyle = '#b89a6a'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText('Available: ' + available, px + pw/2, py + 120);
        c.fillStyle = '#ffd700'; c.font = 'bold 20px "Segoe UI", sans-serif';
        c.fillText('Moving: ' + g.moveAmount, px + pw/2, py + 150);

        g.btns = [];

        // 3D button helper
        const d3 = (bx, by, bw, bh, topR, topG, topB, botR, botG, botB) => {
            c.fillStyle = 'rgba(0,0,0,0.25)'; this._rr(c, bx + 2, by + 2, bw, bh, 7); c.fill();
            const gr = c.createLinearGradient(bx, by, bx, by + bh);
            gr.addColorStop(0, `rgb(${topR},${topG},${topB})`);
            gr.addColorStop(1, `rgb(${botR},${botG},${botB})`);
            this._rr(c, bx, by, bw, bh, 7); c.fillStyle = gr; c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(bx + 8, by + 1); c.lineTo(bx + bw - 8, by + 1); c.stroke();
        };

        const adjBtns = [
            { label: '-5', fn: () => g.moveDialogAdjust(-5) },
            { label: '-1', fn: () => g.moveDialogAdjust(-1) },
            { label: '+1', fn: () => g.moveDialogAdjust(1) },
            { label: '+5', fn: () => g.moveDialogAdjust(5) },
        ];
        const bw = 68, bh = 42, bgap = 8;
        let bx = px + (pw - (adjBtns.length * bw + (adjBtns.length - 1) * bgap)) / 2;
        const aby = py + 175;
        for (const b of adjBtns) {
            const btn = { label: b.label, fn: b.fn };
            btn.rect = { x: bx, y: aby, w: bw, h: bh };
            g.btns.push(btn);
            d3(bx, aby, bw, bh, 232, 213, 176, 200, 180, 140);
            c.strokeStyle = '#8b6914'; c.lineWidth = 1.5;
            this._rr(c, bx, aby, bw, bh, 7); c.stroke();
            c.fillStyle = '#2c1810'; c.font = 'bold 18px "Segoe UI", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(b.label, bx + bw/2, aby + bh/2);
            bx += bw + bgap;
        }

        // Move All button
        const maW = 120, maH = 36, maX = px + pw/2 - maW/2, maY = py + 228;
        const maBtn = { label: '\u23E9 Move All', fn: () => g.moveDialogAdjust(9999) };
        maBtn.rect = { x: maX, y: maY, w: maW, h: maH };
        g.btns.push(maBtn);
        d3(maX, maY, maW, maH, 184, 149, 11, 139, 105, 20);
        c.strokeStyle = '#b7950b'; c.lineWidth = 1.5;
        this._rr(c, maX, maY, maW, maH, 7); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('\u23E9 Move All', maX + maW/2, maY + maH/2);

        // Confirm button
        const cmW = 150, cmH = 44;
        const cmX = px + pw/2 - cmW - 10, cmY = py + ph - 56;
        const cmBtn = { label: '\u2705 Confirm', fn: () => g.moveDialogConfirm() };
        cmBtn.rect = { x: cmX, y: cmY, w: cmW, h: cmH };
        g.btns.push(cmBtn);
        d3(cmX, cmY, cmW, cmH, 40, 167, 69, 25, 111, 61);
        c.strokeStyle = '#28a745'; c.lineWidth = 2;
        this._rr(c, cmX, cmY, cmW, cmH, 7); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText('\u2705 Confirm Move', cmX + cmW/2, cmY + cmH/2);

        // Cancel button
        const caW = 120, caH = 44;
        const caX = px + pw/2 + 10, caY = py + ph - 56;
        const caBtn = { label: '\u274C Cancel', fn: () => g.moveDialogCancel() };
        caBtn.rect = { x: caX, y: caY, w: caW, h: caH };
        g.btns.push(caBtn);
        d3(caX, caY, caW, caH, 192, 57, 43, 146, 43, 33);
        c.strokeStyle = '#c0392b'; c.lineWidth = 2;
        this._rr(c, caX, caY, caW, caH, 7); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText('\u274C Cancel', caX + caW/2, caY + caH/2);
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
            // Show panel with no target selected — user must click a target button
        }

        const pw = 380, ph = 500, px = (g.W - pw)/2, py = (g.H - ph)/2;
        // Dark panel
        const panelGr = c.createLinearGradient(px, py, px+pw, py+ph);
        panelGr.addColorStop(0, '#2c1010'); panelGr.addColorStop(1, '#3d1a1a');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 14); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(231,76,60,0.4)'; c.shadowBlur = 12;
        c.fillStyle = '#e74c3c'; c.font = 'bold 22px Georgia, serif';
        c.fillText('\u2694 Choose Strategy \u2694', px+pw/2, py+30);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;

        // Show attacker and defender territory names
        const atkName = T(g.sel).name;
        const defName = g._attackTarget != null ? T(g._attackTarget).name : '???';
        c.fillStyle = EMPIRES[g.player].color; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`${atkName} (${g.ts[g.sel].troops} troops)`, px + pw/2, py + 55);
        c.fillStyle = '#e74c3c'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(`\U0001F3AF Target: ${defName}`, px + pw/2, py + 72);

        g.btns = [];
        // Back button with icon
        const backBtn = { label: '\u2B05 Back', fn: () => { g.state = 'playing'; g.phase = 'select'; g._attackTarget = null; g.sfx.click(); } };
        const btw = 80, btx = px + pw - btw - 15, bty = py + 10;
        backBtn.rect = { x: btx, y: bty, w: btw, h: 28 };
        g.btns.push(backBtn);
        this._rr(c, btx, bty, btw, 28, 6); c.fillStyle = 'rgba(184,154,106,0.2)'; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 1;
        this._rr(c, btx, bty, btw, 28, 6); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.fillText('\u2B05 Back', btx+btw/2, bty+14);

        // Target selection
        const allTargets = T(g.sel).adj.filter(a => g.ts[a].owner !== g.player);
        let btnStartY = py + 88;
        if (allTargets.length > 1) {
            c.fillStyle = '#b89a6a'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText('\U0001F3AF Select target:', px+pw/2, btnStartY);
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
                this._rr(c, tx, btnStartY, tw, 26, 5);
                c.fillStyle = isTarget ? '#922b21' : 'rgba(184,154,106,0.15)'; c.fill();
                c.strokeStyle = isTarget ? '#e74c3c' : '#b7950b'; c.lineWidth = 1;
                this._rr(c, tx, btnStartY, tw, 26, 5); c.stroke();
                c.fillStyle = isTarget ? '#ffd700' : '#b89a6a'; c.textAlign = 'center';
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
        c.fillText('\u2692 EQUIP WEAPON:', px + 15, btnStartY);
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
            this._rr(c, wx, btnStartY, tw, 20, 4);
            c.fillStyle = equipped ? '#b7950b' : 'rgba(184,154,106,0.15)'; c.fill();
            c.strokeStyle = equipped ? '#ffd700' : '#b7950b'; c.lineWidth = 1;
            this._rr(c, wx, btnStartY, tw, 20, 4); c.stroke();
            c.fillStyle = equipped ? '#ffd700' : '#b89a6a'; c.textAlign = 'center';
            c.fillText(lbl, wx + tw/2, btnStartY + 10);
            wx += tw + 4;
            if (wx > px + pw - 50) { wx = px + 15; btnStartY += 24; }
        }
        btnStartY += 30;

        // Strategy buttons with icons
        const stratIcons = ['\u2694', '\U0001F3F0', '\U0001F4A3', '\u{1FA96}'];
        for (let i = 0; i < STRATEGIES.length; i++) {
            const str = STRATEGIES[i];
            const by = btnStartY + i * 52;
            const canUse = !str.needTerrain || str.needTerrain.includes(T(g.sel).terrain);
            const btn = { label: str.name, fn: () => { if (g._attackTarget != null) g._doAttack(i); else g.sfx.error(); } };
            btn.rect = { x: px+15, y: by, w: pw-30, h: 44 };
            g.btns.push(btn);

            const cardGr = c.createLinearGradient(px+15, by, px+15, by+44);
            cardGr.addColorStop(0, canUse ? 'rgba(60,25,25,0.95)' : 'rgba(40,20,20,0.7)');
            cardGr.addColorStop(1, canUse ? 'rgba(50,20,20,0.95)' : 'rgba(35,18,18,0.7)');
            this._rr(c, px+15, by, pw-30, 44, 8); c.fillStyle = cardGr; c.fill();
            c.strokeStyle = canUse ? '#e74c3c' : '#5a3030'; c.lineWidth = 1.5;
            this._rr(c, px+15, by, pw-30, 44, 8); c.stroke();

            c.textAlign = 'left';
            // Icon
            c.fillStyle = canUse ? '#e74c3c' : '#5a3030'; c.font = '18px serif';
            c.fillText(stratIcons[i] || '\u2694', px+22, by+22);
            // Name
            c.fillStyle = canUse ? '#f5e6c8' : '#6b5040'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText(str.name, px+46, by+16);
            c.fillStyle = canUse ? '#b89a6a' : '#5a4030'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText(str.desc, px+46, by+34);
        }
    }

    // ── BATTLE OVERLAY ────────────────────────────────────────
    _battleOverlay() {
        const c = this.ctx, g = this.g, b = g.battle;
        if (!b) return;
        c.fillStyle = 'rgba(20,12,8,0.8)'; c.fillRect(0, 0, g.W, g.H);
        const cx = g.W/2, cy = g.H/2;

        // Battle panel background
        const pw = 440, ph = 320, px = cx - pw/2, py = cy - ph/2 + 20;
        const panelGr = c.createLinearGradient(px, py, px+pw, py+ph);
        panelGr.addColorStop(0, '#2c1010'); panelGr.addColorStop(1, '#3d1a1a');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 14); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(231,76,60,0.5)'; c.shadowBlur = 15;
        c.fillStyle = '#e74c3c'; c.font = 'bold 30px Georgia, serif';
        c.fillText('\u2694 BATTLE RESULTS \u2694', cx, cy-130);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;

        // Territory names
        c.fillStyle = '#b89a6a'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(T(b.from).name + ' \u2192 ' + T(b.to).name, cx, cy-108);

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
            c.fillStyle = '#f5e6c8'; c.fillText('Attackers lost ' + r.atkLoss + ' | Defenders lost ' + r.defLoss, cx, ry);
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

    // ── SHOP PANEL (3D Premium Design) ────────────────────────
    _shopPanel() {
        const c = this.ctx, g = this.g, emp = g.empires[g.player];
        if (!emp) return;

        // Initialize shop tab if not set
        if (!g._shopTab) g._shopTab = 'troops';

        // Dark overlay with blur effect
        c.fillStyle = 'rgba(8,4,2,0.75)'; c.fillRect(0, 0, g.W, g.H);

        const pw = 560, ph = 640, px = (g.W - pw) / 2, py = (g.H - ph) / 2;

        // 3D shadow behind panel
        c.fillStyle = 'rgba(0,0,0,0.5)';
        this._rr(c, px + 6, py + 6, pw, ph, 16); c.fill();

        // Panel body with rich gradient
        const panelGr = c.createLinearGradient(px, py, px, py + ph);
        panelGr.addColorStop(0, '#3a2218'); panelGr.addColorStop(0.5, '#2c1810'); panelGr.addColorStop(1, '#1e0f08');
        this._rr(c, px, py, pw, ph, 16); c.fillStyle = panelGr; c.fill();

        // Gold border (double)
        c.strokeStyle = '#ffd700'; c.lineWidth = 3;
        this._rr(c, px, py, pw, ph, 16); c.stroke();
        c.strokeStyle = 'rgba(255,215,0,0.25)'; c.lineWidth = 1;
        this._rr(c, px + 5, py + 5, pw - 10, ph - 10, 12); c.stroke();

        // Highlight line at top (3D effect)
        c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 20, py + 1); c.lineTo(px + pw - 20, py + 1); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';

        // Title with glow
        c.shadowColor = 'rgba(255,215,0,0.5)'; c.shadowBlur = 15;
        c.fillStyle = '#ffd700'; c.font = 'bold 28px Georgia, serif';
        c.fillText('\u2694 ARMORY & SHOP \u2694', px + pw / 2, py + 32);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;

        // Coin display with sparkle
        const coinX = px + pw / 2, coinY = py + 58;
        const sparkle = 0.7 + Math.sin(this.time * 0.08) * 0.3;
        c.fillStyle = `rgba(255,215,0,${sparkle * 0.15})`;
        c.beginPath(); c.arc(coinX - 60, coinY, 20, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffd700'; c.font = 'bold 18px "Segoe UI", sans-serif';
        c.fillText('\U0001FA99 ' + emp.coins + ' Coins', coinX, coinY);

        g.btns = [];

        // Close button (3D)
        const cbx = px + pw - 42, cby = py + 10, cbw = 32, cbh = 32;
        c.fillStyle = 'rgba(0,0,0,0.3)'; this._rr(c, cbx + 2, cby + 2, cbw, cbh, 8); c.fill();
        const cbGr = c.createLinearGradient(cbx, cby, cbx, cby + cbh);
        cbGr.addColorStop(0, '#c0392b'); cbGr.addColorStop(1, '#922b21');
        this._rr(c, cbx, cby, cbw, cbh, 8); c.fillStyle = cbGr; c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 1; this._rr(c, cbx, cby, cbw, cbh, 8); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 18px sans-serif'; c.fillText('\u2715', cbx + cbw / 2, cby + cbh / 2);
        const closeBtn = { label: '\u2715', fn: () => { g.state = 'playing'; g.sfx.click(); } };
        closeBtn.rect = { x: cbx, y: cby, w: cbw, h: cbh }; g.btns.push(closeBtn);

        // ── TERRITORY SELECTOR ──
        let y = py + 82;
        c.fillStyle = '#b89a6a'; c.font = 'bold 13px "Segoe UI", sans-serif'; c.textAlign = 'left';
        c.fillText('\U0001F4CD SELECT TERRITORY:', px + 20, y);
        y += 10;

        if (g.sel == null || !emp.tids.includes(g.sel)) {
            if (emp.tids.length > 0) g.sel = emp.tids[0];
        }

        y += 6;
        const chipH = 30, chipGap = 5;
        let chipX = px + 20;
        for (let i = 0; i < emp.tids.length; i++) {
            const tid = emp.tids[i];
            const t = T(tid), s = g.ts[tid];
            const isSel = g.sel === tid;
            c.font = 'bold 11px "Segoe UI", sans-serif';
            const chipW = Math.max(80, c.measureText(t.name + ' (' + s.troops + ')').width + 24);
            if (chipX + chipW > px + pw - 20) { chipX = px + 20; y += chipH + chipGap; }

            // 3D chip
            c.fillStyle = 'rgba(0,0,0,0.25)'; this._rr(c, chipX + 2, y + 2, chipW, chipH, 6); c.fill();
            const chipGr = c.createLinearGradient(chipX, y, chipX, y + chipH);
            chipGr.addColorStop(0, isSel ? '#b7950b' : '#3d2b1f');
            chipGr.addColorStop(1, isSel ? '#8b6914' : '#2a1f18');
            this._rr(c, chipX, y, chipW, chipH, 6); c.fillStyle = chipGr; c.fill();
            c.strokeStyle = isSel ? '#ffd700' : 'rgba(184,154,106,0.4)'; c.lineWidth = isSel ? 2 : 1;
            this._rr(c, chipX, y, chipW, chipH, 6); c.stroke();

            c.fillStyle = isSel ? '#1a1a2e' : '#f5e6c8'; c.textAlign = 'center';
            c.fillText(t.name + ' (' + s.troops + ')', chipX + chipW / 2, y + chipH / 2);

            const btn = { label: t.name, fn: () => { g.sel = tid; g.sfx.click(); } };
            btn.rect = { x: chipX, y: y, w: chipW, h: chipH }; g.btns.push(btn);
            chipX += chipW + chipGap;
        }

        // Selected territory info banner
        y += chipH + 14;
        if (g.sel != null && g.ts[g.sel]) {
            const s = g.ts[g.sel], t = T(g.sel);
            // 3D banner
            c.fillStyle = 'rgba(0,0,0,0.2)'; this._rr(c, px + 18, y + 2, pw - 36, 32, 6); c.fill();
            const infoGr = c.createLinearGradient(px + 18, y, px + pw - 18, y);
            infoGr.addColorStop(0, 'rgba(255,215,0,0.15)'); infoGr.addColorStop(1, 'rgba(255,215,0,0.05)');
            this._rr(c, px + 18, y, pw - 36, 32, 6); c.fillStyle = infoGr; c.fill();
            c.strokeStyle = 'rgba(255,215,0,0.4)'; c.lineWidth = 1;
            this._rr(c, px + 18, y, pw - 36, 32, 6); c.stroke();
            c.fillStyle = '#ffd700'; c.font = 'bold 13px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(t.name + '  |  \U0001F6E1 ' + s.troops + ' troops  |  Fort: +' + s.fort + '  |  ' + s.weapon.icon + ' ' + s.weapon.name, px + pw / 2, y + 16);
        }
        y += 42;

        // Divider
        c.strokeStyle = 'rgba(184,154,106,0.4)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 20, y); c.lineTo(px + pw - 20, y); c.stroke();
        y += 10;

        // ── TABS ──
        const tabs = [
            { id: 'troops', label: '\U0001F6E1 TROOPS', color: '#b7950b' },
            { id: 'weapons', label: '\u2694 WEAPONS', color: '#3498db' },
            { id: 'spy', label: '\U0001F575\uFE0F SPY', color: '#27ae60' },
        ];
        const tabW = 150, tabH = 38, tabGap = 8;
        const tabStartX = px + (pw - (tabs.length * tabW + (tabs.length - 1) * tabGap)) / 2;
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const tx = tabStartX + i * (tabW + tabGap), ty = y;
            const isActive = g._shopTab === tab.id;

            // 3D tab
            c.fillStyle = 'rgba(0,0,0,0.3)'; this._rr(c, tx + 2, ty + 2, tabW, tabH, 8); c.fill();
            const tabGr = c.createLinearGradient(tx, ty, tx, ty + tabH);
            if (isActive) {
                tabGr.addColorStop(0, tab.color); tabGr.addColorStop(1, tab.color + 'aa');
            } else {
                tabGr.addColorStop(0, '#3d2b1f'); tabGr.addColorStop(1, '#2a1f18');
            }
            this._rr(c, tx, ty, tabW, tabH, 8); c.fillStyle = tabGr; c.fill();
            c.strokeStyle = isActive ? '#ffd700' : 'rgba(184,154,106,0.3)'; c.lineWidth = isActive ? 2 : 1;
            this._rr(c, tx, ty, tabW, tabH, 8); c.stroke();
            // Top highlight
            if (isActive) {
                c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1;
                c.beginPath(); c.moveTo(tx + 10, ty + 1); c.lineTo(tx + tabW - 10, ty + 1); c.stroke();
            }

            c.fillStyle = isActive ? '#fff' : '#b89a6a'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(tab.label, tx + tabW / 2, ty + tabH / 2);

            const tabBtn = { label: tab.id, fn: () => { g._shopTab = tab.id; g.sfx.click(); } };
            tabBtn.rect = { x: tx, y: ty, w: tabW, h: tabH }; g.btns.push(tabBtn);
        }
        y += tabH + 16;

        // ── TAB CONTENT ──
        const soldierCost = g.player === 'russia' ? 5 : 10;
        const hasSel = g.sel != null && g.ts[g.sel]?.owner === g.player;

        // Helper: draw 3D card
        const drawCard = (cx, cy, cw, ch, canBuy, glowColor) => {
            // Shadow
            c.fillStyle = 'rgba(0,0,0,0.35)'; this._rr(c, cx + 3, cy + 3, cw, ch, 10); c.fill();
            // Card body
            const cardGr = c.createLinearGradient(cx, cy, cx, cy + ch);
            cardGr.addColorStop(0, canBuy ? '#3d2b1f' : '#1e1410');
            cardGr.addColorStop(1, canBuy ? '#2a1a10' : '#14100c');
            this._rr(c, cx, cy, cw, ch, 10); c.fillStyle = cardGr; c.fill();
            // Border with glow
            if (canBuy && glowColor) {
                const pulse = 0.5 + Math.sin(this.time * 0.06) * 0.3;
                c.shadowColor = glowColor; c.shadowBlur = 8 * pulse;
            }
            c.strokeStyle = canBuy ? (glowColor || '#b7950b') : '#3a2a1a'; c.lineWidth = canBuy ? 2 : 1;
            this._rr(c, cx, cy, cw, ch, 10); c.stroke();
            c.shadowColor = 'transparent'; c.shadowBlur = 0;
            // Top highlight
            c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(cx + 12, cy + 1); c.lineTo(cx + cw - 12, cy + 1); c.stroke();
        };

        if (g._shopTab === 'troops') {
            const troops = [
                { icon: '\U0001F6E1', name: 'Recruit Soldier', desc: '+1 troop to territory', cost: soldierCost, fn: () => g._buySoldier() },
                { icon: '\u2694', name: 'Hire Veteran', desc: '+2 elite troops', cost: 20, fn: () => g._buyVeteran() },
                { icon: '\U0001F3F0', name: 'Fortify Walls', desc: '+2 defense bonus', cost: 15, fn: () => g._buyFortify() },
            ];
            for (const item of troops) {
                const canBuy = emp.coins >= item.cost && hasSel;
                drawCard(px + 20, y, pw - 40, 58, canBuy, '#b7950b');
                // Icon
                c.font = '28px sans-serif'; c.textAlign = 'center';
                c.fillStyle = canBuy ? '#ffd700' : '#4a3a2a';
                c.fillText(item.icon, px + 55, y + 29);
                // Name
                c.textAlign = 'left'; c.fillStyle = canBuy ? '#f5e6c8' : '#4a3a2a'; c.font = 'bold 15px "Segoe UI", sans-serif';
                c.fillText(item.name, px + 85, y + 22);
                // Description
                c.fillStyle = canBuy ? '#b89a6a' : '#3a2a1a'; c.font = '12px "Segoe UI", sans-serif';
                c.fillText(item.desc, px + 85, y + 42);
                // Cost badge
                const costW = 90, costH = 28, costX = px + pw - 20 - costW, costY = y + 15;
                const costGr = c.createLinearGradient(costX, costY, costX, costY + costH);
                costGr.addColorStop(0, canBuy ? '#196f3d' : '#2a1f18');
                costGr.addColorStop(1, canBuy ? '#145a32' : '#1e1410');
                this._rr(c, costX, costY, costW, costH, 6); c.fillStyle = costGr; c.fill();
                c.strokeStyle = canBuy ? '#27ae60' : '#3a2a1a'; c.lineWidth = 1;
                this._rr(c, costX, costY, costW, costH, 6); c.stroke();
                c.fillStyle = canBuy ? '#2ecc71' : '#4a3a2a'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'center';
                c.fillText('\U0001FA99 ' + item.cost, costX + costW / 2, costY + costH / 2);

                const btn = { label: item.name, fn: canBuy ? item.fn : () => { g.sfx.error(); g._log('Select a territory first!'); } };
                btn.rect = { x: px + 20, y: y, w: pw - 40, h: 58 }; g.btns.push(btn);
                y += 66;
            }
        } else if (g._shopTab === 'weapons') {
            const costs = { 2: 25, 3: 50, 4: 80 };
            const tierNames = { 2: '\U0001F5FA Medieval', 3: '\U0001F4A3 Gunpowder', 4: '\u2708 Modern' };
            const tierColors = { 2: '#196f3d', 3: '#b7950b', 4: '#922b21' };
            const tierDescs = { 2: 'Swords, Spears, Bows', 3: 'Muskets, Cannons, Rifles', 4: 'Tanks, Planes, Bombers' };

            for (let tier = 2; tier <= 4; tier++) {
                const unlocked = emp.weapons.has(tier);
                const canAfford = emp.coins >= costs[tier];
                drawCard(px + 20, y, pw - 40, 70, unlocked || canAfford, tierColors[tier]);

                // Tier icon
                c.font = '30px sans-serif'; c.textAlign = 'center';
                c.fillStyle = unlocked ? tierColors[tier] : (canAfford ? '#ffd700' : '#4a3a2a');
                c.fillText(tierNames[tier].split(' ')[0], px + 55, y + 28);
                // Tier name
                c.textAlign = 'left'; c.font = 'bold 15px "Segoe UI", sans-serif';
                c.fillStyle = unlocked ? '#f5e6c8' : (canAfford ? '#ffd700' : '#4a3a2a');
                c.fillText(tierNames[tier].split(' ').slice(1).join(' '), px + 80, y + 20);
                // Description
                c.font = '12px "Segoe UI", sans-serif';
                c.fillStyle = unlocked ? '#b89a6a' : '#4a3a2a';
                c.fillText(tierDescs[tier], px + 80, y + 38);
                // Status
                if (unlocked) {
                    c.fillStyle = '#2ecc71'; c.font = 'bold 13px "Segoe UI", sans-serif';
                    c.fillText('\u2713 UNLOCKED', px + 80, y + 56);
                } else {
                    // Unlock cost badge
                    const costW = 110, costH = 28, costX = px + pw - 20 - costW, costY = y + 21;
                    const costGr = c.createLinearGradient(costX, costY, costX, costY + costH);
                    costGr.addColorStop(0, canAfford ? tierColors[tier] : '#2a1f18');
                    costGr.addColorStop(1, canAfford ? tierColors[tier] + 'aa' : '#1e1410');
                    this._rr(c, costX, costY, costW, costH, 6); c.fillStyle = costGr; c.fill();
                    c.strokeStyle = canAfford ? '#ffd700' : '#3a2a1a'; c.lineWidth = 1;
                    this._rr(c, costX, costY, costW, costH, 6); c.stroke();
                    c.fillStyle = canAfford ? '#ffd700' : '#4a3a2a'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'center';
                    c.fillText('\U0001F512 ' + costs[tier] + ' coins', costX + costW / 2, costY + costH / 2);

                    const btn = { label: 'Unlock' + tier, fn: canAfford ? () => g._buyWeaponTier(tier) : () => { g.sfx.error(); g._log('Not enough coins!'); } };
                    btn.rect = { x: px + 20, y: y, w: pw - 40, h: 70 }; g.btns.push(btn);
                }

                // Show equippable weapons if unlocked
                if (unlocked) {
                    y += 76;
                    let wx = px + 30;
                    for (let wi = 0; wi < WEAPONS[tier].length; wi++) {
                        const w = WEAPONS[tier][wi];
                        const equipped = hasSel && g.ts[g.sel].weapon === w;
                        c.font = 'bold 12px "Segoe UI", sans-serif';
                        const lbl = w.icon + ' ' + w.name + ' +' + w.atk + 'A +' + w.def + 'D';
                        const tw = c.measureText(lbl).width + 24;
                        if (wx + tw > px + pw - 20) { wx = px + 30; y += 34; }

                        // 3D weapon chip
                        c.fillStyle = 'rgba(0,0,0,0.2)'; this._rr(c, wx + 1, y + 1, tw, 28, 5); c.fill();
                        const wGr = c.createLinearGradient(wx, y, wx, y + 28);
                        wGr.addColorStop(0, equipped ? '#b7950b' : '#3d2b1f');
                        wGr.addColorStop(1, equipped ? '#8b6914' : '#2a1f18');
                        this._rr(c, wx, y, tw, 28, 5); c.fillStyle = wGr; c.fill();
                        c.strokeStyle = equipped ? '#ffd700' : 'rgba(184,154,106,0.4)'; c.lineWidth = equipped ? 2 : 1;
                        this._rr(c, wx, y, tw, 28, 5); c.stroke();
                        c.fillStyle = equipped ? '#1a1a2e' : '#f5e6c8'; c.textAlign = 'center';
                        c.font = (equipped ? 'bold ' : '') + '12px "Segoe UI", sans-serif';
                        c.fillText(lbl, wx + tw / 2, y + 14);

                        const btn = { label: lbl, fn: hasSel ? () => g._equipWeapon(tier, wi) : () => { g.sfx.error(); g._log('Select a territory first!'); } };
                        btn.rect = { x: wx, y: y, w: tw, h: 28 }; g.btns.push(btn);
                        wx += tw + 5;
                    }
                    y += 38;
                } else {
                    y += 76;
                }
            }
        } else if (g._shopTab === 'spy') {
            if (emp.spy) {
                // Active spy card
                drawCard(px + 20, y, pw - 40, 70, false, '#27ae60');
                c.font = '36px sans-serif'; c.textAlign = 'center';
                c.fillStyle = '#2ecc71'; c.fillText('\U0001F575\uFE0F', px + 60, y + 35);
                c.textAlign = 'left'; c.fillStyle = '#2ecc71'; c.font = 'bold 18px "Segoe UI", sans-serif';
                c.fillText('Spy Network ACTIVE', px + 90, y + 28);
                c.fillStyle = '#b89a6a'; c.font = '14px "Segoe UI", sans-serif';
                c.fillText('You can see all enemy troop counts', px + 90, y + 50);
            } else {
                const canBuy = emp.coins >= 30;
                drawCard(px + 20, y, pw - 40, 70, canBuy, '#27ae60');
                c.font = '36px sans-serif'; c.textAlign = 'center';
                c.fillStyle = canBuy ? '#ffd700' : '#4a3a2a'; c.fillText('\U0001F575\uFE0F', px + 60, y + 30);
                c.textAlign = 'left'; c.fillStyle = canBuy ? '#f5e6c8' : '#4a3a2a'; c.font = 'bold 16px "Segoe UI", sans-serif';
                c.fillText('Spy Network', px + 90, y + 24);
                c.fillStyle = canBuy ? '#b89a6a' : '#3a2a1a'; c.font = '13px "Segoe UI", sans-serif';
                c.fillText('Reveal all enemy troop counts on the map', px + 90, y + 46);
                // Cost badge
                const costW = 100, costH = 30, costX = px + pw - 20 - costW, costY = y + 20;
                const costGr = c.createLinearGradient(costX, costY, costX, costY + costH);
                costGr.addColorStop(0, canBuy ? '#196f3d' : '#2a1f18');
                costGr.addColorStop(1, canBuy ? '#145a32' : '#1e1410');
                this._rr(c, costX, costY, costW, costH, 6); c.fillStyle = costGr; c.fill();
                c.strokeStyle = canBuy ? '#27ae60' : '#3a2a1a'; c.lineWidth = 1;
                this._rr(c, costX, costY, costW, costH, 6); c.stroke();
                c.fillStyle = canBuy ? '#2ecc71' : '#4a3a2a'; c.font = 'bold 15px "Segoe UI", sans-serif'; c.textAlign = 'center';
                c.fillText('\U0001FA99 30', costX + costW / 2, costY + costH / 2);

                const btn = { label: 'Spy', fn: canBuy ? () => g._buySpy() : () => { g.sfx.error(); g._log('Not enough coins!'); } };
                btn.rect = { x: px + 20, y: y, w: pw - 40, h: 70 }; g.btns.push(btn);
            }
        }
    }

    _logPanel() {
        const c = this.ctx, g = this.g;
        if (g.log.length === 0) return;
        let lx = g.W - 15, ly = g.H - 42;
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

        // Dark background with red tint
        const bgGr = c.createRadialGradient(W/2, H/2, 50, W/2, H/2, W*0.8);
        bgGr.addColorStop(0, '#1a0505'); bgGr.addColorStop(1, '#050202');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(146,43,33,0.5)'; c.shadowBlur = 20;
        c.fillStyle = '#e74c3c'; c.font = 'bold 56px Georgia, serif';
        c.fillText('☠ DEFEAT ☠', W/2, H*0.18);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;
        c.fillStyle = '#b89a6a'; c.font = '18px "Segoe UI", sans-serif';
        c.fillText(`Your empire fell on turn ${this.g.turn}`, W/2, H*0.18+42);

        // Stats panel - dark style
        const pw = 340, ph = 220, px = (W - pw)/2, py = H*0.38;
        const panelGr = c.createLinearGradient(px, py, px+pw, py+ph);
        panelGr.addColorStop(0, '#2c1810'); panelGr.addColorStop(1, '#3d2b1f');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#922b21'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 14); c.stroke();

        c.fillStyle = '#e74c3c'; c.font = 'bold 16px "Segoe UI", sans-serif';
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
            c.textAlign = 'left'; c.fillStyle = '#b89a6a';
            c.fillText(s.label, px + 20, sy);
            c.textAlign = 'right'; c.fillStyle = '#e74c3c';
            c.fillText(String(s.value), px + pw - 20, sy);
            sy += 30;
        }

        if (Math.floor(this.time/30) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 18px "Segoe UI", sans-serif';
            c.textAlign = 'center';
            c.fillText('Click to return to menu', W/2, H*0.80);
        }

        this._drawSoldier(c, W*0.15, H*0.70, -0.5);
        this._drawSoldier(c, W*0.85, H*0.70, 0.5);
        this._drawShield(c, W*0.25, H*0.85, '#8b0000');
    }

    // ── VICTORY SCREEN (with stats) ───────────────────────────
    _victory() {
        const c = this.ctx, { W, H } = this.g;
        const stats = this.g.stats;

        // Dark background with golden tint
        const bgGr = c.createRadialGradient(W/2, H/2, 50, W/2, H/2, W*0.8);
        bgGr.addColorStop(0, '#1a1200'); bgGr.addColorStop(1, '#080600');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        // Golden particles
        for (let i = 0; i < 20; i++) {
            const px2 = (Math.sin(this.time * 0.015 + i * 2.1) * 0.5 + 0.5) * W;
            const py2 = (Math.cos(this.time * 0.01 + i * 1.7) * 0.5 + 0.5) * H;
            const sz = 1.5 + Math.sin(this.time * 0.04 + i) * 1;
            c.fillStyle = `rgba(255,215,0,${0.15 + Math.sin(this.time*0.03+i)*0.1})`;
            c.beginPath(); c.arc(px2, py2, sz, 0, Math.PI*2); c.fill();
        }

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(255,215,0,0.6)'; c.shadowBlur = 25;
        c.fillStyle = '#ffd700'; c.font = 'bold 56px Georgia, serif';
        c.fillText('🏆 VICTORY! 🏆', W/2, H*0.14);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;
        c.fillStyle = '#f5e6c8'; c.font = '24px Georgia, serif';
        c.fillText(`${E(this.g.player).name} conquers all!`, W/2, H*0.14+48);
        c.font = '48px serif'; c.fillText('👑', W/2, H*0.14+105);

        // Stats panel - dark with gold border
        const pw = 340, ph = 260, px = (W - pw)/2, py = H*0.42;
        const panelGr = c.createLinearGradient(px, py, px+pw, py+ph);
        panelGr.addColorStop(0, '#2c1810'); panelGr.addColorStop(1, '#3d2b1f');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#ffd700'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 14); c.stroke();

        c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText('✨ Victory Statistics ✨', W/2, py + 25);

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
            c.textAlign = 'left'; c.fillStyle = '#b89a6a';
            c.fillText(s.label, px + 20, sy);
            c.textAlign = 'right'; c.fillStyle = '#ffd700';
            c.fillText(String(s.value), px + pw - 20, sy);
            sy += 30;
        }

        if (Math.floor(this.time/30) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 18px "Segoe UI", sans-serif';
            c.textAlign = 'center';
            c.fillText('Click to return to menu', W/2, H*0.88);
        }

        this._drawEmperorSilhouette(c, W*0.5, H*0.38, 1.5);
        this._drawCrossedSwords(c, W*0.3, H*0.85, 1.0);
        this._drawCrossedSwords(c, W*0.7, H*0.85, 1.0);
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
