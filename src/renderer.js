import { MAP_W, MAP_H, T_RADIUS, TERRITORIES, EMPIRES, EIDS, T, E, adj, WEAPONS, SHOP, STRATEGIES, TERRAIN_ICONS, TERRAIN_COLORS, MAP_BG, EMPIRE_STORIES, TERRITORY_STORIES } from './map.js';

export class Renderer {
    constructor(game) {
        this.g = game;
        this.ctx = game.ctx;
        this.scale = 1; this.ox = 0; this.oy = 0;
        this.shake = 0;
        this.flash = { alpha: 0, color: '#fff' }; // Screen flash effect
        this.particles = [];
        this.captureAnims = [];
        this.notifications = []; // Floating notification popups
        this.floats = []; // Floating text (+10 gold, -5 troops etc)
        this.combatAnim = null;
        this.marchingAnims = []; // Marching soldier animations
        this.smokeParticles = []; // Battle smoke/debris
        this.time = 0;
        // Story system
        this.story = { text: '', empire: null, timer: 0, maxTimer: 0, alpha: 0, shown: new Set() };
        // Screen transition system
        this.transition = { active: false, phase: 'none', alpha: 0, speed: 0.15, callback: null, type: 'fade' };
        this._prevState = '';
        // ── PRODUCTION: Sprite & Texture Cache System ──
        this._spriteCache = new Map();    // empire-id -> offscreen canvas (pre-rendered soldier)
        this._texCache = new Map();        // texture-name -> offscreen canvas (tileable patterns)
        this._texCacheSize = 0;
        this._groundTex = null;            // cached battlefield ground texture
        this._groundTexKey = '';
        // FPS tracking
        this._fpsFrames = 0;
        this._fpsTime = 0;
        this._fps = 60;
        // World map background image (real world map, CC0 public domain)
        this.mapImg = new Image();
        this.mapImgLoaded = false;
        this._loadMapImage();
    }

    _loadMapImage() {
        // Load PNG world map image (CC0 public domain, CIA World Factbook)
        this.mapImg = new Image();
        this.mapImg.onload = () => { this.mapImgLoaded = true; };
        this.mapImg.onerror = () => { console.warn('Map image load failed, using polygon fallback'); };
        this.mapImg.src = 'assets/worldmap.jpg';
    }

    // ── PRODUCTION: Procedural Texture Generator ──────────
    _genTexture(w, h, fn) {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        fn(cx, w, h);
        return cv;
    }

    _getGroundTexture(W, H) {
        const key = `${W}x${H}`;
        if (this._groundTex && this._groundTexKey === key) return this._groundTex;
        this._groundTex = this._genTexture(W, H, (c, w, h) => {
            // Base dirt gradient
            const gr = c.createLinearGradient(0, 0, 0, h);
            gr.addColorStop(0, '#7a6a3a');
            gr.addColorStop(0.15, '#6a5a2a');
            gr.addColorStop(0.5, '#5a4a1a');
            gr.addColorStop(1, '#3a2a10');
            c.fillStyle = gr;
            c.fillRect(0, 0, w, h);
            // Gravel noise layer
            const imgData = c.getImageData(0, 0, w, h);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const n = (Math.random() - 0.5) * 25;
                d[i]   = Math.max(0, Math.min(255, d[i] + n));
                d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
                d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
            }
            c.putImageData(imgData, 0, 0);
            // Dirt clumps
            c.globalAlpha = 0.12;
            for (let i = 0; i < 200; i++) {
                const x = Math.random() * w, y = Math.random() * h;
                const r = 2 + Math.random() * 8;
                const shade = Math.random() > 0.5 ? '#4a3a1a' : '#8a7a5a';
                c.fillStyle = shade;
                c.beginPath(); c.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2); c.fill();
            }
            // Small pebbles
            c.globalAlpha = 0.2;
            c.fillStyle = '#9a8a6a';
            for (let i = 0; i < 150; i++) {
                const x = Math.random() * w, y = Math.random() * h;
                c.beginPath(); c.arc(x, y, 0.5 + Math.random() * 1.5, 0, Math.PI * 2); c.fill();
            }
            // Tire tracks / vehicle marks
            c.globalAlpha = 0.06;
            c.strokeStyle = '#2a1a0a'; c.lineWidth = 8;
            for (let i = 0; i < 5; i++) {
                const sx = Math.random() * w, sy = Math.random() * h;
                c.beginPath();
                c.moveTo(sx, sy);
                c.quadraticCurveTo(sx + 60 + Math.random() * 80, sy + (Math.random()-0.5)*20, sx + 120 + Math.random()*100, sy + (Math.random()-0.5)*30);
                c.stroke();
            }
            // Scorch marks
            c.globalAlpha = 0.08;
            for (let i = 0; i < 4; i++) {
                const sx = Math.random() * w, sy = Math.random() * h;
                const sr = 10 + Math.random() * 25;
                const sg = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
                sg.addColorStop(0, '#1a1005');
                sg.addColorStop(1, 'rgba(26,16,5,0)');
                c.fillStyle = sg;
                c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
            }
            c.globalAlpha = 1;
        });
        this._groundTexKey = key;
        return this._groundTex;
    }

    _getSprite(empId, size) {
        const key = `${empId}_${size}`;
        if (this._spriteCache.has(key)) return this._spriteCache.get(key);
        const em = EMPIRES[empId];
        if (!em) return null;
        const s = size;
        const cv = document.createElement('canvas');
        cv.width = s * 3; cv.height = s * 5;
        const c = cv.getContext('2d');
        c.translate(s * 1.5, s * 2.5);
        // Shadow
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.beginPath(); c.ellipse(0, s * 1.3, s * 0.5, s * 0.15, 0, 0, Math.PI * 2); c.fill();
        // Boots
        c.fillStyle = '#1a1a15';
        c.fillRect(-s*0.3, s*0.8, s*0.22, s*0.35);
        c.fillRect(s*0.08, s*0.8, s*0.22, s*0.35);
        // Pants
        c.fillStyle = em.dark + 'cc';
        c.fillRect(-s*0.3, s*0.15, s*0.22, s*0.7);
        c.fillRect(s*0.08, s*0.15, s*0.22, s*0.7);
        // Tactical vest
        const vg = c.createLinearGradient(-s*0.4, -s*0.6, s*0.4, s*0.2);
        vg.addColorStop(0, em.light); vg.addColorStop(1, em.dark);
        c.fillStyle = vg;
        c.fillRect(-s*0.4, -s*0.6, s*0.8, s*0.85);
        // Vest pouches
        c.fillStyle = em.dark;
        c.fillRect(-s*0.38, -s*0.1, s*0.15, s*0.12);
        c.fillRect(s*0.23, -s*0.1, s*0.15, s*0.12);
        // Belt
        c.fillStyle = '#2a2a20';
        c.fillRect(-s*0.4, s*0.05, s*0.8, s*0.12);
        // Helmet
        c.fillStyle = '#4a4a40';
        c.beginPath(); c.arc(0, -s*0.9, s*0.35, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#3a3a32';
        c.beginPath(); c.arc(0, -s*0.88, s*0.38, Math.PI, 0);
        c.lineTo(s*0.38, -s*0.78); c.lineTo(-s*0.38, -s*0.78); c.closePath(); c.fill();
        // Goggles
        c.fillStyle = 'rgba(30,40,50,0.6)';
        c.fillRect(-s*0.18, -s*0.94, s*0.36, s*0.08);
        // Rifle
        c.save(); c.translate(s*0.3, -s*0.2); c.rotate(-0.15);
        c.fillStyle = '#2a2a2a';
        c.fillRect(-s*0.1, -s*0.06, s*1.1, s*0.12);
        c.fillStyle = '#1a1a1a';
        c.fillRect(s*0.9, -s*0.04, s*0.5, s*0.06);
        c.fillStyle = '#333';
        c.fillRect(s*0.2, s*0.06, s*0.1, s*0.18);
        c.restore();
        this._spriteCache.set(key, cv);
        return cv;
    }

    // ── PRODUCTION: Smooth bezier polygon path ──────────
    _smoothPolyPath(c, poly, tension) {
        tension = tension || 0.3;
        const pts = poly.map(p => this.toScr(p[0], p[1]));
        if (pts.length < 3) return;
        c.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length; i++) {
            const p0 = pts[(i - 1 + pts.length) % pts.length];
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length];
            const p3 = pts[(i + 2) % pts.length];
            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = p1.y + (p2.y - p0.y) * tension;
            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = p2.y - (p3.y - p1.y) * tension;
            c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        c.closePath();
    }

    _layout() {
        const { W, H } = this.g;
        // Full-screen map — match the real world map image aspect ratio (1280x650)
        const mapAspect = 1280 / 650;
        const sx = (W * 0.96) / MAP_W;
        const sy = (W * 0.96) / (MAP_H * mapAspect);
        this.scale = Math.min(sx, sy);
        this.ox = (W - MAP_W * this.scale) / 2;
        this.oy = (H - MAP_H * this.scale) / 2;
        // Invalidate map bg cache on resize
        if (this._lastW !== W || this._lastH !== H) {
            this._mapBgCache = null;
            this._lastW = W;
            this._lastH = H;
        }
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
            const polys = t.polys || (t.poly ? [t.poly] : []);
            for (const p of polys) {
                if (this._pointInPoly(m.x, m.y, p)) return t.id;
            }
        }
        return -1;
    }

    // ── BACKGROUND — Ancient parchment / aged map texture ──
    _bg() {
        const c = this.ctx, { W, H } = this.g;
        const t = this.time;

        // 1. Parchment base gradient
        const gr = c.createLinearGradient(0, 0, W * 0.2, H);
        gr.addColorStop(0, '#f5e6c8');
        gr.addColorStop(0.3, '#eed9b6');
        gr.addColorStop(0.6, '#e8d0a8');
        gr.addColorStop(0.85, '#dfc498');
        gr.addColorStop(1, '#d4b88a');
        c.fillStyle = gr; c.fillRect(0, 0, W, H);

        // 2. Parchment texture overlay (lightweight — no pixel manipulation)
        c.save();
        c.globalAlpha = 0.03;
        for (let i = 0; i < 3000; i++) {
            const nx = Math.sin(i * 127.1) * 0.5 * W + W * 0.5;
            const ny = Math.cos(i * 269.5) * 0.5 * H + H * 0.5;
            c.fillStyle = i % 3 === 0 ? '#6b4a20' : '#a08050';
            c.fillRect(nx % W, ny % H, 2, 2);
        }
        c.restore();

        // 3. Sepia vignette (darker at edges)
        const vigR = Math.max(W, H) * 0.75;
        const vig = c.createRadialGradient(W/2, H/2, vigR * 0.3, W/2, H/2, vigR);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(0.6, 'rgba(60,30,10,0.05)');
        vig.addColorStop(0.85, 'rgba(60,30,10,0.15)');
        vig.addColorStop(1, 'rgba(40,20,5,0.4)');
        c.fillStyle = vig; c.fillRect(0, 0, W, H);

        // 4. Subtle warm age spots (stains)
        c.save();
        c.globalAlpha = 0.04;
        for (let i = 0; i < 8; i++) {
            const sx = (Math.sin(i * 97.3 + 12) * 0.4 + 0.5) * W;
            const sy = (Math.sin(i * 53.7 + 28) * 0.4 + 0.5) * H;
            const sr = 30 + i * 15;
            const stGr = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
            stGr.addColorStop(0, '#8B6914');
            stGr.addColorStop(1, 'rgba(139,105,20,0)');
            c.fillStyle = stGr;
            c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
        }
        c.restore();

        // 5. Faint golden dust particles (ancient feel)
        c.save();
        for (let i = 0; i < 15; i++) {
            const px = (Math.sin(t * 0.002 + i * 3.1) * 0.5 + 0.5) * W;
            const py = (Math.cos(t * 0.0015 + i * 2.7) * 0.5 + 0.5) * H;
            const pulse = Math.sin(t * 0.01 + i * 1.7) * 0.5 + 0.5;
            c.fillStyle = `rgba(180, 140, 60, ${0.06 + pulse * 0.06})`;
            c.beginPath(); c.arc(px, py, 1 + pulse * 1.5, 0, Math.PI * 2); c.fill();
        }
        c.restore();

        // 6. Ornate ancient border (dark brown)
        c.strokeStyle = '#5a3a1a';
        c.lineWidth = 3;
        c.strokeRect(3, 3, W - 6, H - 6);
        c.strokeStyle = '#8B6914';
        c.lineWidth = 1;
        c.strokeRect(7, 7, W - 14, H - 14);

        // 7. Corner decorations (golden filigree)
        this._drawCornerDeco(c, 15, 15, 1, 1);
        this._drawCornerDeco(c, W - 15, 15, -1, 1);
        this._drawCornerDeco(c, 15, H - 15, 1, -1);
        this._drawCornerDeco(c, W - 15, H - 15, -1, -1);
    }

    _drawCornerDeco(c, x, y, dx, dy) {
        c.save();
        c.strokeStyle = 'rgba(255, 200, 100, 0.4)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, y + dy * 30);
        c.quadraticCurveTo(x, y, x + dx * 30, y);
        c.stroke();
        c.fillStyle = 'rgba(255, 200, 100, 0.35)';
        c.beginPath();
        c.moveTo(x + dx * 5, y + dy * 5);
        c.lineTo(x + dx * 10, y);
        c.lineTo(x + dx * 5, y - dy * 5);
        c.lineTo(x, y);
        c.closePath();
        c.fill();
        c.restore();
    }

    // ── MAP BACKGROUND — Real World Map Image ──────────────
    _drawMapBg() {
        const c = this.ctx, g = this.g;

        // Use cached static background if available
        if (this._mapBgCache) {
            c.drawImage(this._mapBgCache, 0, 0);
            this._drawMapDynamicEffects(c, g);
            return;
        }

        // Build cache on first call (or after resize)
        if (!this._mapBgCanvas) {
            this._mapBgCanvas = document.createElement('canvas');
        }
        this._mapBgCanvas.width = g.W;
        this._mapBgCanvas.height = g.H;
        const bc = this._mapBgCanvas.getContext('2d');

        // ── 1. Parchment base for world map ──
        const parchGr = bc.createRadialGradient(
            this.toScr(480, 300).x, this.toScr(300, 300).y, MAP_W * this.scale * 0.08,
            this.toScr(480, 300).x, this.toScr(300, 300).y, MAP_W * this.scale * 0.75
        );
        parchGr.addColorStop(0, '#f0dbb8');
        parchGr.addColorStop(0.3, '#e8cfA0');
        parchGr.addColorStop(0.6, '#dfc490');
        parchGr.addColorStop(1, '#c9a870');
        bc.fillStyle = parchGr;
        bc.fillRect(0, 0, g.W, g.H);

        // ── 1b. Parchment texture dots (lightweight) ──
        bc.save();
        bc.globalAlpha = 0.02;
        for (let i = 0; i < 2000; i++) {
            const nx = Math.sin(i * 127.1) * 0.5 * g.W + g.W * 0.5;
            const ny = Math.cos(i * 269.5) * 0.5 * g.H + g.H * 0.5;
            bc.fillStyle = i % 3 === 0 ? '#6b4a20' : '#a08050';
            bc.fillRect(nx % g.W, ny % g.H, 2, 2);
        }
        bc.restore();

        // ── 1c. Subtle cartographic grid on parchment ──
        bc.save();
        bc.globalAlpha = 0.06;
        bc.strokeStyle = '#8B6914';
        bc.lineWidth = 0.5;
        const gridSpacing = 60 * this.scale;
        for (let x = this.ox % gridSpacing; x < g.W; x += gridSpacing) {
            bc.beginPath(); bc.moveTo(x, 0); bc.lineTo(x, g.H); bc.stroke();
        }
        for (let y = this.oy % gridSpacing; y < g.H; y += gridSpacing) {
            bc.beginPath(); bc.moveTo(0, y); bc.lineTo(g.W, y); bc.stroke();
        }
        bc.globalAlpha = 1;
        bc.restore();

        // ── 2. Sepia vignette overlay ──
        const vigR = Math.max(g.W, g.H) * 0.7;
        const vig = bc.createRadialGradient(g.W/2, g.H/2, vigR * 0.3, g.W/2, g.H/2, vigR);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(0.7, 'rgba(50,25,5,0.08)');
        vig.addColorStop(1, 'rgba(40,20,5,0.3)');
        bc.fillStyle = vig;
        bc.fillRect(0, 0, g.W, g.H);

        // ── 3. Draw world map land polygons with ancient map colors ──
        if (this.mapImgLoaded) {
            bc.save();
            bc.imageSmoothingEnabled = true;
            bc.imageSmoothingQuality = 'high';
            bc.filter = 'sepia(0.6) contrast(0.9) brightness(1.05) saturate(0.5)';
            const iw = this.mapImg.naturalWidth;
            const ih = this.mapImg.naturalHeight;
            const dx = this.ox;
            const dy = this.oy;
            const dw = MAP_W * this.scale;
            const dh = MAP_H * this.scale;
            bc.drawImage(this.mapImg, 0, 0, iw, ih, dx, dy, dw, dh);
            bc.filter = 'none';
            bc.restore();
        } else {
            // Ancient map polygon fallback — muted earth tones
            const drawLand = (polys, fillA, fillB, strokeColor) => {
                for (const poly of polys) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const pt of poly) {
                        const sp = this.toScr(pt[0], pt[1]);
                        if (sp.x < minX) minX = sp.x;
                        if (sp.y < minY) minY = sp.y;
                        if (sp.x > maxX) maxX = sp.x;
                        if (sp.y > maxY) maxY = sp.y;
                    }
                    const gr = bc.createLinearGradient(minX, minY, maxX, maxY);
                    gr.addColorStop(0, fillA);
                    gr.addColorStop(1, fillB);
                    bc.fillStyle = gr;
                    bc.strokeStyle = strokeColor;
                    bc.lineWidth = 0.6 * this.scale;
                    bc.beginPath();
                    for (let i = 0; i < poly.length; i++) {
                        const sp = this.toScr(poly[i][0], poly[i][1]);
                        if (i === 0) bc.moveTo(sp.x, sp.y);
                        else bc.lineTo(sp.x, sp.y);
                    }
                    bc.closePath();
                    bc.fill();
                    bc.stroke();
                }
            };
            // Land — muted parchment green
            drawLand(MAP_BG.lands, '#b8c498', '#9aaa78', '#7a8a58');
            // Islands
            drawLand(MAP_BG.islands, '#aab890', '#8a9a6a', '#7a8a58');
            // Deserts — warm sand
            drawLand(MAP_BG.deserts, '#d4c498', '#bfaa78', '#9a8a5a');
            // Forests — deep olive
            drawLand(MAP_BG.forests, '#8aaa68', '#6a8a48', '#5a7038');
            // Mountains — rocky brown
            drawLand(MAP_BG.mountains, '#b0a088', '#958070', '#7a6a5a');
        }

        // ── 4. Latitude lines — subtle cartographic grid ──
        bc.save();
        bc.globalAlpha = 0.07;
        bc.strokeStyle = '#5a3a1a';
        bc.lineWidth = 0.5;
        // Horizontal latitude lines
        for (let lat = 0; lat <= MAP_H; lat += 80) {
            const p1 = this.toScr(0, lat);
            const p2 = this.toScr(MAP_W, lat);
            bc.beginPath(); bc.moveTo(p1.x, p1.y); bc.lineTo(p2.x, p2.y); bc.stroke();
        }
        // Vertical longitude lines
        for (let lon = 0; lon <= MAP_W; lon += 120) {
            const p1 = this.toScr(lon, 0);
            const p2 = this.toScr(lon, MAP_H);
            bc.beginPath(); bc.moveTo(p1.x, p1.y); bc.lineTo(p2.x, p2.y); bc.stroke();
        }
        bc.globalAlpha = 1;
        bc.restore();

        // ── 5. Continent labels — subtle ancient watermark text ──
        bc.save();
        bc.globalAlpha = 0.1;
        bc.fillStyle = '#5a3a1a';
        bc.font = `bold ${Math.round(14 * this.scale)}px "Georgia", serif`;
        bc.textAlign = 'center';
        bc.textBaseline = 'middle';
        const labels = [
            ['NORTH AMERICA', 180, 170], ['SOUTH AMERICA', 250, 430],
            ['EUROPE', 350, 180], ['AFRICA', 380, 420],
            ['ASIA', 580, 200], ['OCEANIA', 720, 430]
        ];
        for (const [text, mx, my] of labels) {
            const p = this.toScr(mx, my);
            bc.fillText(text, p.x, p.y);
        }
        bc.globalAlpha = 1;
        bc.restore();

        // ── 6. Warm sepia vignette ──
        const vigGr = bc.createRadialGradient(
            this.toScr(480, 320).x, this.toScr(320, 320).y, MAP_W * this.scale * 0.25,
            this.toScr(480, 320).x, this.toScr(320, 320).y, MAP_W * this.scale * 0.62
        );
        vigGr.addColorStop(0, 'rgba(0,0,0,0)');
        vigGr.addColorStop(0.7, 'rgba(40,20,5,0.08)');
        vigGr.addColorStop(1, 'rgba(30,15,0,0.35)');
        bc.fillStyle = vigGr;
        bc.fillRect(0, 0, g.W, g.H);

        // ── 7. Warm aged tint ──
        bc.save();
        bc.globalAlpha = 0.05;
        bc.fillStyle = '#c4940a';
        bc.fillRect(0, 0, g.W, g.H);
        bc.globalAlpha = 1;
        bc.restore();

        // Cache and draw
        this._mapBgCache = this._mapBgCanvas;
        c.drawImage(this._mapBgCache, 0, 0);
        this._drawMapDynamicEffects(c, g);
    }

    // Dynamic animated effects on the map (drawn every frame, not cached)
    _drawMapDynamicEffects(c, g) {
        const t = this.time;

        // ── Animated cloud shadows drifting across the map ──
        if (!this._cloudShadows) {
            this._cloudShadows = [];
            for (let i = 0; i < 5; i++) {
                this._cloudShadows.push({
                    x: Math.random() * g.W,
                    y: Math.random() * g.H,
                    w: 120 + Math.random() * 200,
                    h: 40 + Math.random() * 80,
                    speed: 0.15 + Math.random() * 0.2,
                    alpha: 0.015 + Math.random() * 0.02,
                });
            }
        }
        c.save();
        for (const cloud of this._cloudShadows) {
            cloud.x += cloud.speed;
            if (cloud.x > g.W + cloud.w) { cloud.x = -cloud.w; cloud.y = Math.random() * g.H; }
            c.globalAlpha = cloud.alpha;
            const gr = c.createRadialGradient(cloud.x + cloud.w/2, cloud.y + cloud.h/2, cloud.w * 0.1,
                                               cloud.x + cloud.w/2, cloud.y + cloud.h/2, cloud.w * 0.5);
            gr.addColorStop(0, 'rgba(0,0,0,0.15)');
            gr.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = gr;
            c.beginPath();
            c.ellipse(cloud.x + cloud.w/2, cloud.y + cloud.h/2, cloud.w * 0.5, cloud.h * 0.5, 0, 0, Math.PI * 2);
            c.fill();
        }
        c.globalAlpha = 1;
        c.restore();

        // ── Animated trade route pulse lines ──
        if (MAP_BG.rivers) {
            c.save();
            c.globalAlpha = 0.12;
            c.strokeStyle = '#c49a30';
            c.lineWidth = 1.5 * this.scale;
            c.setLineDash([4 * this.scale, 8 * this.scale]);
            c.lineDashOffset = -t * 0.3;
            // Draw select rivers as "trade routes" with golden dash
            for (const river of MAP_BG.rivers.slice(0, 5)) {
                if (!river.pts || river.pts.length < 2) continue;
                c.beginPath();
                const first = this.toScr(river.pts[0][0], river.pts[0][1]);
                c.moveTo(first.x, first.y);
                for (let i = 1; i < river.pts.length; i++) {
                    const p = this.toScr(river.pts[i][0], river.pts[i][1]);
                    c.lineTo(p.x, p.y);
                }
                c.stroke();
            }
            c.setLineDash([]);
            c.globalAlpha = 1;
            c.restore();
        }

        // ── Compass Rose (bottom-right corner) ──
        this._drawCompassRose(c, g);

        // ── Subtle golden shimmer (ancient dust motes) ──
        c.save();
        c.globalAlpha = 0.03;
        c.fillStyle = '#c49a30';
        const shimmerCount = 10;
        for (let i = 0; i < shimmerCount; i++) {
            const phase = (i / shimmerCount) * Math.PI * 2;
            const sx = (Math.sin(t * 0.006 + phase) * 0.5 + 0.5) * g.W;
            const sy = (Math.cos(t * 0.004 + phase * 1.3) * 0.5 + 0.5) * g.H;
            const sr = 25 + Math.sin(t * 0.008 + phase) * 12;
            const gr = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
            gr.addColorStop(0, 'rgba(196,154,48,0.25)');
            gr.addColorStop(1, 'rgba(196,154,48,0)');
            c.fillStyle = gr;
            c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
        }
        c.globalAlpha = 1;
        c.restore();

        // ── Floating ambient particles (dust/clouds) ──
        if (!this._mapParticles) {
            this._mapParticles = [];
            for (let i = 0; i < 30; i++) {
                this._mapParticles.push({
                    x: Math.random() * g.W,
                    y: Math.random() * g.H,
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: (Math.random() - 0.5) * 0.05,
                    size: Math.random() * 2 + 0.5,
                    alpha: Math.random() * 0.15 + 0.03,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
        c.save();
        for (const p of this._mapParticles) {
            p.x += p.vx;
            p.y += p.vy + Math.sin(t * 0.005 + p.phase) * 0.05;
            if (p.x < -10) p.x = g.W + 10;
            if (p.x > g.W + 10) p.x = -10;
            if (p.y < -10) p.y = g.H + 10;
            if (p.y > g.H + 10) p.y = -10;
            const flicker = 0.7 + Math.sin(t * 0.02 + p.phase) * 0.3;
            c.globalAlpha = p.alpha * flicker;
            c.fillStyle = '#d4b878';
            c.beginPath();
            c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            c.fill();
        }
        c.globalAlpha = 1;
        c.restore();

        // ── Animated selection glow pulse on selected territory ──
        if (g.sel != null && g.ts[g.sel]) {
            const tData = TERRITORIES[g.sel];
            const tState = g.ts[g.sel];
            const empire = tState.owner ? EMPIRES[tState.owner] : null;
            const center = this.toScr(tData.cx, tData.cy);
            const pulseR = 20 + Math.sin(t * 0.06) * 8;
            const glowColor = empire ? empire.color : '#ffd700';
            // Multi-layer glow
            for (let layer = 3; layer >= 0; layer--) {
                const r = (pulseR + layer * 6) * this.scale;
                const alpha = 0.15 - layer * 0.03;
                const gr = c.createRadialGradient(center.x, center.y, 0, center.x, center.y, r);
                gr.addColorStop(0, glowColor + '30');
                gr.addColorStop(0.5, glowColor + '18');
                gr.addColorStop(1, glowColor + '00');
                c.fillStyle = gr;
                c.globalAlpha = alpha;
                c.beginPath();
                c.arc(center.x, center.y, r, 0, Math.PI * 2);
                c.fill();
            }
            // Pulsing ring
            c.globalAlpha = 0.2 + Math.sin(t * 0.06) * 0.1;
            c.strokeStyle = glowColor;
            c.lineWidth = 1.5;
            c.beginPath();
            c.arc(center.x, center.y, pulseR * this.scale * 1.3, 0, Math.PI * 2);
            c.stroke();
            c.globalAlpha = 1;
        }
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

    _drawCompassRose(c, g) {
        const size = 35 * this.scale;
        const cx = g.W - size - 20;
        const cy = g.H - size - 20;
        c.save();
        c.translate(cx, cy);
        c.globalAlpha = 0.18;

        // Outer ring
        c.strokeStyle = '#8B6914';
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(0, 0, size, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(0, 0, size * 0.85, 0, Math.PI * 2);
        c.stroke();

        // Cardinal points
        const dirs = [
            { label: 'N', angle: -Math.PI/2, color: '#c0392b' },
            { label: 'E', angle: 0, color: '#8B6914' },
            { label: 'S', angle: Math.PI/2, color: '#8B6914' },
            { label: 'W', angle: Math.PI, color: '#8B6914' },
        ];
        for (const d of dirs) {
            c.save();
            c.rotate(d.angle);
            // Main pointer
            c.fillStyle = d.color;
            c.beginPath();
            c.moveTo(0, -size * 0.8);
            c.lineTo(size * 0.08, -size * 0.15);
            c.lineTo(-size * 0.08, -size * 0.15);
            c.closePath();
            c.fill();
            // Secondary pointer (lighter)
            c.fillStyle = 'rgba(180,150,80,0.5)';
            c.beginPath();
            c.moveTo(0, size * 0.6);
            c.lineTo(size * 0.06, size * 0.15);
            c.lineTo(-size * 0.06, size * 0.15);
            c.closePath();
            c.fill();
            c.restore();
        }

        // Intercardinal lines (NE, SE, SW, NW)
        c.strokeStyle = 'rgba(139,105,20,0.5)';
        c.lineWidth = 0.8;
        for (let i = 0; i < 4; i++) {
            const angle = -Math.PI/4 + i * Math.PI/2;
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(Math.cos(angle) * size * 0.5, Math.sin(angle) * size * 0.5);
            c.stroke();
        }

        // Labels
        c.globalAlpha = 0.35;
        c.fillStyle = '#5a3a1a';
        c.font = `bold ${Math.round(8 * this.scale)}px "Georgia", serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (const d of dirs) {
            const lx = Math.cos(d.angle) * (size + 10);
            const ly = Math.sin(d.angle) * (size + 10);
            c.fillText(d.label, lx, ly);
        }

        // Center dot
        c.globalAlpha = 0.3;
        c.fillStyle = '#8B6914';
        c.beginPath();
        c.arc(0, 0, 2.5, 0, Math.PI * 2);
        c.fill();

        // Animated needle glow
        c.globalAlpha = 0.06 + Math.sin(this.time * 0.02) * 0.03;
        c.fillStyle = '#c49a30';
        c.beginPath();
        c.arc(0, 0, size * 0.15, 0, Math.PI * 2);
        c.fill();

        c.globalAlpha = 1;
        c.restore();
    }

    // ── STORY DISPLAY SYSTEM ─────────────────────────────────
    showStory(text, empireId) {
        this.story.text = text;
        this.story.empire = empireId;
        this.story.timer = 0;
        this.story.maxTimer = 400; // ~6.7 seconds at 60fps
        this.story.alpha = 0;
        this.story.type = empireId ? 'empire' : 'territory';
        // Voice narration via Web Speech API
        this._narrate(text);
    }

    // ── Voice Narration System ──
    _narrate(text) {
        if (!('speechSynthesis' in window)) return;
        // Cancel any ongoing narration
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.9;   // Slightly slower for dramatic effect
        utter.pitch = 0.9;  // Deeper voice
        utter.volume = 0.8;
        // Try to pick a good English voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Male'))
            || voices.find(v => v.lang.startsWith('en') && !v.localService)
            || voices.find(v => v.lang.startsWith('en'));
        if (preferred) utter.voice = preferred;
        window.speechSynthesis.speak(utter);
    }

    stopNarration() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    showTerritoryStory(territoryId) {
        const fact = TERRITORY_STORIES[territoryId];
        if (fact && !this.story.shown.has('t' + territoryId)) {
            this.story.shown.add('t' + territoryId);
            this.showStory(fact, null);
        }
    }

    showEmpireStory(empireId) {
        const stories = EMPIRE_STORIES[empireId];
        if (!stories) return;
        // Find an unshown story
        const unshown = [];
        for (let i = 0; i < stories.length; i++) {
            if (!this.story.shown.has(empireId + '_' + i)) unshown.push(i);
        }
        if (unshown.length === 0) {
            // Reset if all shown (cycle through)
            for (let i = 0; i < stories.length; i++) this.story.shown.delete(empireId + '_' + i);
            this.showEmpireStory(empireId);
            return;
        }
        const idx = unshown[Math.floor(Math.random() * unshown.length)];
        this.story.shown.add(empireId + '_' + idx);
        this.showStory(stories[idx], empireId);
    }

    showRandomEmpireStory() {
        // Pick a random active empire and show a story
        const activeEmpires = EIDS.filter(eid => {
            for (const t of TERRITORIES) {
                if (this.g.ts[t.id] && this.g.ts[t.id].owner === eid) return true;
            }
            return false;
        });
        if (activeEmpires.length > 0) {
            const eid = activeEmpires[Math.floor(Math.random() * activeEmpires.length)];
            this.showEmpireStory(eid);
        }
    }

    // ── BATTLE STORY GENERATOR ─────────────────────────────────
    _generateBattleStory(b) {
        const r = b.res;
        if (!r) return null;
        const atkName = EMPIRES[b.atk] ? EMPIRES[b.atk].name : 'Attacker';
        const defName = b.def && EMPIRES[b.def] ? EMPIRES[b.def].name : 'Defenders';
        const fromName = T(b.from) ? T(b.from).name : 'the territory';
        const toName = T(b.to) ? T(b.to).name : 'the territory';
        const conquered = r.conquered;

        const attackVerbs = ['launched a fierce assault', 'marched boldly into', 'stormed the gates of', 'unleashed hell upon', 'charged headlong into'];
        const defVerbs = ['stood their ground', 'fought back valiantly', 'held the line', 'defended with honor', 'repelled with fury'];
        const resultConquer = [
            `${atkName} overwhelmed ${defName} and seized ${toName}. The banners of ${defName} fell as a new era began.`,
            `After a brutal clash, ${atkName} conquered ${toName}. ${defName}'s forces crumbled under the relentless onslaught.`,
            `${toName} now belongs to ${atkName}. ${defName} was driven back, their soldiers scattered across the battlefield.`,
            `Victory! ${atkName} captured ${toName} after fierce fighting. The land echoes with the cries of the fallen.`,
            `${defName}'s defense shattered. ${atkName} claimed ${toName}, raising their flag over the conquered territory.`
        ];
        const resultRepel = [
            `${defName} held ${toName} against ${atkName}'s assault. The attackers retreated, bloodied but unbowed.`,
            `${atkName} ${attackVerbs[Math.floor(Math.random() * attackVerbs.length)]} ${toName}, but ${defName} ${defVerbs[Math.floor(Math.random() * defVerbs.length)]}.`,
            `The walls of ${toName} held firm. ${defName} repelled ${atkName}'s attack at great cost to both sides.`,
            `${atkName} failed to take ${toName}. ${defName}'s defenders proved too strong, sending the attackers fleeing.`,
            `A costly stalemate at ${toName}. ${atkName} lost ${r.atkLoss} troops, but ${defName} kept their territory.`
        ];

        if (conquered) {
            return resultConquer[Math.floor(Math.random() * resultConquer.length)];
        } else {
            return resultRepel[Math.floor(Math.random() * resultRepel.length)];
        }
    }

    _wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    }

    // ── EVENT OVERLAY ──────────────────────────────────────────
    _drawEventOverlay() {
        const evt = this.g.event;
        if (!evt) return;
        const c = this.ctx, g = this.g;
        const { W } = g;

        // Fade in for first 30 frames, hold, fade out for last 50 frames
        let alpha;
        const totalTimer = 180;
        const elapsed = totalTimer - evt.timer;
        if (elapsed < 30) {
            alpha = elapsed / 30;
        } else if (evt.timer < 50) {
            alpha = evt.timer / 50;
        } else {
            alpha = 1;
        }
        if (alpha <= 0) return;

        // Banner dimensions
        const bannerH = 100;
        const bannerY = 10;
        const bannerX = 20;
        const bannerW = W - 40;

        c.save();
        c.globalAlpha = alpha;

        // Pulsing glow on border
        const pulse = Math.sin(this.time * 0.08) * 0.3 + 0.7;
        c.shadowColor = evt.color;
        c.shadowBlur = 8 + pulse * 12;

        // Dark backdrop with gradient
        const bgGr = c.createLinearGradient(bannerX, bannerY, bannerX, bannerY + bannerH);
        bgGr.addColorStop(0, 'rgba(15,8,5,0.92)');
        bgGr.addColorStop(0.5, 'rgba(25,12,8,0.95)');
        bgGr.addColorStop(1, 'rgba(15,8,5,0.92)');
        this._rr(c, bannerX, bannerY, bannerW, bannerH, 14);
        c.fillStyle = bgGr;
        c.fill();

        // Colored border
        c.strokeStyle = evt.color;
        c.lineWidth = 3;
        this._rr(c, bannerX, bannerY, bannerW, bannerH, 14);
        c.stroke();

        // Reset shadow for inner elements
        c.shadowColor = 'transparent';
        c.shadowBlur = 0;

        // Inner glow border
        c.strokeStyle = evt.color + '30';
        c.lineWidth = 1;
        this._rr(c, bannerX + 5, bannerY + 5, bannerW - 10, bannerH - 10, 10);
        c.stroke();

        // Decorative corner accents
        const accentLen = 20;
        c.strokeStyle = evt.color + 'AA';
        c.lineWidth = 2;
        // Top-left
        c.beginPath(); c.moveTo(bannerX + 8, bannerY + accentLen); c.lineTo(bannerX + 8, bannerY + 8); c.lineTo(bannerX + accentLen, bannerY + 8); c.stroke();
        // Top-right
        c.beginPath(); c.moveTo(bannerX + bannerW - accentLen, bannerY + 8); c.lineTo(bannerX + bannerW - 8, bannerY + 8); c.lineTo(bannerX + bannerW - 8, bannerY + accentLen); c.stroke();
        // Bottom-left
        c.beginPath(); c.moveTo(bannerX + 8, bannerY + bannerH - accentLen); c.lineTo(bannerX + 8, bannerY + bannerH - 8); c.lineTo(bannerX + accentLen, bannerY + bannerH - 8); c.stroke();
        // Bottom-right
        c.beginPath(); c.moveTo(bannerX + bannerW - accentLen, bannerY + bannerH - 8); c.lineTo(bannerX + bannerW - 8, bannerY + bannerH - 8); c.lineTo(bannerX + bannerW - 8, bannerY + bannerH - accentLen); c.stroke();

        // Event icon (large emoji)
        c.font = '42px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(evt.icon, bannerX + 50, bannerY + bannerH / 2);

        // Event title
        c.fillStyle = '#FFFFFF';
        c.font = 'bold 20px Georgia, serif';
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.fillText(evt.title, bannerX + 90, bannerY + 16);

        // Event description
        c.fillStyle = '#D4C5A9';
        c.font = '14px Georgia, serif';
        const maxTextW = bannerW - 120;
        const words = evt.desc.split(' ');
        let line = '';
        let lineY = bannerY + 44;
        const maxLines = 2;
        let lineCount = 0;
        for (const word of words) {
            const testLine = line + word + ' ';
            if (c.measureText(testLine).width > maxTextW) {
                if (lineCount >= maxLines - 1) {
                    line += '...';
                    break;
                }
                c.fillText(line, bannerX + 90, lineY);
                line = word + ' ';
                lineY += 20;
                lineCount++;
            } else {
                line = testLine;
            }
        }
        c.fillText(line, bannerX + 90, lineY);

        // "RANDOM EVENT" label
        c.fillStyle = evt.color + 'CC';
        c.font = 'bold 10px "Segoe UI", sans-serif';
        c.textAlign = 'right';
        c.textBaseline = 'top';
        c.fillText('\u26A1 RANDOM EVENT \u26A1', bannerX + bannerW - 16, bannerY + 10);

        // Progress bar
        const progW = bannerW - 40;
        const progH = 3;
        const progX = bannerX + 20;
        const progY = bannerY + bannerH - 12;
        const progress = elapsed / totalTimer;
        c.fillStyle = 'rgba(255,255,255,0.1)';
        this._rr(c, progX, progY, progW, progH, 1.5);
        c.fill();
        c.fillStyle = evt.color;
        this._rr(c, progX, progY, Math.max(3, progW * (1 - progress)), progH, 1.5);
        c.fill();

        c.restore();
    }

    _drawStoryOverlay() {
        if (!this.story.text || this.story.maxTimer <= 0) return;
        const c = this.ctx, g = this.g;
        this.story.timer++;

        // Fade in for first 40 frames, hold, fade out for last 60 frames
        if (this.story.timer < 40) {
            this.story.alpha = this.story.timer / 40;
        } else if (this.story.timer > this.story.maxTimer - 60) {
            this.story.alpha = (this.story.maxTimer - this.story.timer) / 60;
        } else {
            this.story.alpha = 1;
        }

        if (this.story.alpha <= 0) {
            this.story.text = '';
            this.story.maxTimer = 0;
            return;
        }

        const alpha = this.story.alpha;
        const { W, H } = g;

        // Semi-transparent dark backdrop at bottom
        const bannerH = 90;
        const bannerY = H - bannerH - 10;
        c.save();
        c.globalAlpha = alpha * 0.85;

        // Backdrop with gradient
        const bgGr = c.createLinearGradient(0, bannerY, 0, bannerY + bannerH);
        bgGr.addColorStop(0, 'rgba(10,5,20,0.7)');
        bgGr.addColorStop(0.5, 'rgba(20,10,40,0.85)');
        bgGr.addColorStop(1, 'rgba(10,5,20,0.7)');
        this._rr(c, 20, bannerY, W - 40, bannerH, 12);
        c.fillStyle = bgGr;
        c.fill();

        // Border
        const borderColor = this.story.empire ? EMPIRES[this.story.empire].color : '#ffd700';
        c.strokeStyle = borderColor;
        c.lineWidth = 2;
        this._rr(c, 20, bannerY, W - 40, bannerH, 12);
        c.stroke();

        // Inner glow border
        c.strokeStyle = borderColor + '40';
        c.lineWidth = 1;
        this._rr(c, 24, bannerY + 4, W - 48, bannerH - 8, 10);
        c.stroke();

        // Empire icon and name
        const em = this.story.empire ? EMPIRES[this.story.empire] : null;
        c.textAlign = 'left';
        c.textBaseline = 'top';

        // "DID YOU KNOW?" label
        c.fillStyle = '#ffd700';
        c.font = 'bold 11px "Segoe UI", sans-serif';
        const labelX = 40;
        const labelY = bannerY + 10;
        c.fillText('\uD83D\uDCDA HISTORY LESSON \uD83D\uDCDA', labelX, labelY);

        // Empire name tag
        if (em) {
            const tagX = labelX + 200;
            c.fillStyle = em.color + '30';
            const tagW = c.measureText(em.name).width + 20;
            this._rr(c, tagX, labelY - 2, tagW, 18, 4);
            c.fill();
            c.fillStyle = em.color;
            c.font = 'bold 10px "Segoe UI", sans-serif';
            c.fillText(em.icon + ' ' + em.name, tagX + 10, labelY);
        }

        // Story text with word wrap
        c.fillStyle = '#f0e8d8';
        c.font = '13px Georgia, serif';
        c.textAlign = 'left';
        c.textBaseline = 'top';
        const maxTextW = W - 100;
        const words = this.story.text.split(' ');
        let line = '';
        let lineY = bannerY + 32;
        const maxLines = 3;
        let lineCount = 0;

        for (const word of words) {
            const testLine = line + word + ' ';
            if (c.measureText(testLine).width > maxTextW) {
                if (lineCount >= maxLines - 1) {
                    line += '...';
                    break;
                }
                c.fillText(line, 40, lineY);
                line = word + ' ';
                lineY += 18;
                lineCount++;
            } else {
                line = testLine;
            }
        }
        c.fillText(line, 40, lineY);

        // Progress bar (how much time left)
        const progW = W - 80;
        const progH = 3;
        const progX = 40;
        const progY = bannerY + bannerH - 10;
        const progress = this.story.timer / this.story.maxTimer;
        c.fillStyle = 'rgba(255,255,255,0.1)';
        this._rr(c, progX, progY, progW, progH, 1.5);
        c.fill();
        c.fillStyle = borderColor;
        this._rr(c, progX, progY, progW * (1 - progress), progH, 1.5);
        c.fill();

        c.restore();
    }

    // ── MENU ──────────────────────────────────────────────────
    _menu() {
        const c = this.ctx, g = this.g, { W, H } = g;

        // ── BRIGHT COLORFUL BACKGROUND ──
        const bgGr = c.createRadialGradient(W/2, H*0.3, 50, W/2, H/2, W*0.9);
        bgGr.addColorStop(0, '#FFF8E1');    // warm cream center
        bgGr.addColorStop(0.3, '#FFE0B2');  // peach
        bgGr.addColorStop(0.6, '#FFCCBC');  // light salmon
        bgGr.addColorStop(1, '#F8BBD0');    // pink edge
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        // Soft rainbow aurora bands
        for (let band = 0; band < 4; band++) {
            c.save();
            c.globalAlpha = 0.08 + band * 0.02;
            c.beginPath();
            const baseY = H * (0.05 + band * 0.06);
            c.moveTo(0, baseY);
            for (let x = 0; x <= W; x += 15) {
                const y = baseY + Math.sin(x * 0.004 + this.time * 0.008 + band * 0.5) * 25;
                c.lineTo(x, y);
            }
            c.lineTo(W, baseY + H * 0.08);
            c.lineTo(0, baseY + H * 0.08);
            c.closePath();
            const auroraColors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF'];
            c.fillStyle = auroraColors[band];
            c.fill();
            c.restore();
        }

        // Animated colorful particles
        for (let i = 0; i < 50; i++) {
            const px = (Math.sin(this.time * 0.01 + i * 1.7) * 0.5 + 0.5) * W;
            const py = (Math.cos(this.time * 0.008 + i * 2.3) * 0.5 + 0.5) * H;
            const sz = 1 + Math.sin(this.time * 0.03 + i) * 0.8;
            const alpha = 0.15 + Math.sin(this.time * 0.02 + i * 0.5) * 0.1;
            const pColors = ['rgba(255,107,107,', 'rgba(255,217,61,', 'rgba(107,203,119,'];
            c.fillStyle = pColors[i % 3] + alpha + ')';
            c.beginPath(); c.arc(px, py, sz, 0, Math.PI*2); c.fill();
        }

        // ── GRAND IMPERIAL BANNER ──
        const bx = W*0.05, by = H*0.04, bw = W*0.9, bh = H*0.92;
        const bannerGr = c.createLinearGradient(bx, by, bx+bw, by+bh);
        bannerGr.addColorStop(0, 'rgba(255, 248, 225, 0.92)');
        bannerGr.addColorStop(0.3, 'rgba(255, 243, 224, 0.88)');
        bannerGr.addColorStop(0.7, 'rgba(255, 243, 224, 0.88)');
        bannerGr.addColorStop(1, 'rgba(255, 248, 225, 0.92)');
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

        // ── TITLE WITH ANIMATED GLOW ──
        c.save();
        const titlePulse = 18 + Math.sin(this.time * 0.04) * 8;
        c.shadowColor = 'rgba(255,100,50,0.5)';
        c.shadowBlur = titlePulse;
        c.fillStyle = '#D32F2F'; c.font = 'bold 52px Georgia, serif';
        c.fillText("EMPEROR'S CONQUEST", W/2, H*0.19);
        c.restore();

        // Subtitle
        c.fillStyle = '#5D4037'; c.font = 'italic 18px Georgia, serif';
        c.fillText('Conquer the Ancient World — From India to Rome', W/2, H*0.19+42);

        // ── SOUND STATUS INDICATOR ──
        if (g.sfx._ready) {
            c.fillStyle = '#27ae60'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText('🔊 Sound ON', W/2, H*0.19 + 65);
        } else {
            c.fillStyle = '#888'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText('🔊 Sound starting...', W/2, H*0.19 + 65);
        }

        // ── ORNATE DIVIDER with crossed swords ──
        const divY = H*0.27;
        c.strokeStyle = '#E65100'; c.lineWidth = 2;
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
        c.fillStyle = '#D32F2F'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('CHOOSE YOUR DYNASTY', W/2, showcaseY);

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
            c.fillStyle = '#5D4037'; c.font = '9px "Segoe UI", sans-serif';
            c.fillText(em.name, ex, empireRow + 22);
        }

        // ── FEATURES LIST with icons ──
        const featsY = H * 0.44;
        c.fillStyle = '#D32F2F'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('GAME FEATURES', W/2, featsY);

        const feats = [
            ['🌍', '30 Territories across every continent on Earth', '#3498db'],
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
            c.fillStyle = '#4E342E';
            c.fillText(text, W*0.29, fy);
            fy += 28;
        }

        // ── SOLDIER PARADE at bottom ──
        const paradeY = H * 0.76;
        for (let i = 0; i < 8; i++) {
            const sx = W * 0.15 + i * (W * 0.7 / 7);
            const bobble = Math.sin(this.time * 0.05 + i * 1.2) * 3;
            this._drawSoldier(c, sx, paradeY + bobble, '#5D4037', false, this.time, i * 1.2, 'roman');
        }

        // ── DECORATIVE EMPEROR SILHOUETTES on sides ──
        this._drawEmperorSilhouette(c, W*0.06, H*0.45, 1.2);
        this._drawEmperorSilhouette(c, W*0.94, H*0.45, -1.2);

        // ── Crossed swords under title ──
        this._drawCrossedSwords(c, W/2, divY + 16, 1.5);

        // ── Shield decorations ──
        this._drawShield(c, W*0.10, H*0.6, '#8b0000');
        this._drawShield(c, W*0.90, H*0.6, '#1a5276');

        // ── BUTTONS: Mode Selection ──
        const btnY = H * 0.84;
        const btnW = 160, btnH = 44, btnGap = 12;
        const totalW = btnW * 3 + btnGap * 2;
        const startX = W/2 - totalW/2;

        // Offline button
        const offX = startX, offY = btnY;
        this.g._offlineBtnRect = { x: offX, y: offY, w: btnW, h: btnH };
        const offGr = c.createLinearGradient(offX, offY, offX, offY+btnH);
        offGr.addColorStop(0, '#E53935'); offGr.addColorStop(1, '#C62828');
        this._rr(c, offX, offY, btnW, btnH, 10); c.fillStyle = offGr; c.fill();
        c.strokeStyle = '#EF5350'; c.lineWidth = 2;
        this._rr(c, offX, offY, btnW, btnH, 10); c.stroke();
        c.fillStyle = '#FFFFFF'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('\u{1F3DB} Offline', offX + btnW/2, offY + btnH/2);

        // Online Battle button
        const onX = startX + btnW + btnGap, onY = btnY;
        this.g._onlineBtnRect = { x: onX, y: onY, w: btnW, h: btnH };
        const onGr = c.createLinearGradient(onX, onY, onX, onY+btnH);
        onGr.addColorStop(0, '#1E88E5'); onGr.addColorStop(1, '#1565C0');
        this._rr(c, onX, onY, btnW, btnH, 10); c.fillStyle = onGr; c.fill();
        c.strokeStyle = '#42A5F5'; c.lineWidth = 2;
        this._rr(c, onX, onY, btnW, btnH, 10); c.stroke();
        c.fillStyle = '#FFFFFF'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('\u{1F310} Online', onX + btnW/2, onY + btnH/2);
        // Online badge
        c.fillStyle = '#4CAF50'; c.font = 'bold 9px "Segoe UI", sans-serif';
        c.fillText('LIVE', onX + btnW - 18, onY + 12);

        // How to Play button
        const hpX = startX + (btnW + btnGap) * 2, hpY = btnY;
        this.g._helpBtnRect = { x: hpX, y: hpY, w: btnW, h: btnH };
        const hpGr = c.createLinearGradient(hpX, hpY, hpX, hpY+btnH);
        hpGr.addColorStop(0, 'rgba(33,150,243,0.3)'); hpGr.addColorStop(1, 'rgba(33,150,243,0.15)');
        this._rr(c, hpX, hpY, btnW, btnH, 10); c.fillStyle = hpGr; c.fill();
        c.strokeStyle = '#1976D2'; c.lineWidth = 2;
        this._rr(c, hpX, hpY, btnW, btnH, 10); c.stroke();
        c.fillStyle = '#1565C0'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('\u{1F4D6} How to Play', hpX + btnW/2, hpY + btnH/2);

        // Continue button (if save exists)
        const hasSave = !!localStorage.getItem('emperorsConquest_save');
        this.g._continueBtnRect = null;
        if (hasSave) {
            const ctW = 160, ctH = 40, ctX = W/2 - ctW/2, ctY = btnY + 52;
            this.g._continueBtnRect = { x: ctX, y: ctY, w: ctW, h: ctH };
            const ctGr = c.createLinearGradient(ctX, ctY, ctX, ctY+ctH);
            ctGr.addColorStop(0, '#43A047'); ctGr.addColorStop(1, '#2E7D32');
            this._rr(c, ctX, ctY, ctW, ctH, 10); c.fillStyle = ctGr; c.fill();
            c.strokeStyle = '#66BB6A'; c.lineWidth = 2;
            this._rr(c, ctX, ctY, ctW, ctH, 10); c.stroke();
            c.fillStyle = '#FFFFFF'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('\u25B6 Continue Save', ctX + ctW/2, ctY + ctH/2);
        }

        // Pulsing hint
        if (Math.floor(this.time / 25) % 2 === 0) {
            c.fillStyle = '#E65100'; c.font = 'bold 16px Georgia, serif';
            c.textAlign = 'center';
            c.shadowColor = 'rgba(230,81,0,0.3)'; c.shadowBlur = 8;
            c.fillText('Choose Offline or Online to begin', W/2, H*0.95);
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
        c.fillStyle = 'rgba(80,80,70,0.12)';
        // Modern helmet (FAST type)
        c.beginPath(); c.arc(0, -30, 12, Math.PI, 0); c.fill();
        c.fillRect(-14, -30, 28, 4);
        // NVG mount
        c.fillRect(-3, -36, 6, 4);
        // Head (balaclava)
        c.beginPath(); c.arc(0, -20, 8, 0, Math.PI*2); c.fill();
        // Body — plate carrier vest
        c.fillRect(-11, -12, 22, 28);
        // Vest outline
        c.strokeStyle = 'rgba(80,80,70,0.08)'; c.lineWidth = 0.8;
        c.strokeRect(-11, -12, 22, 28);
        // Assault rifle
        c.fillStyle = 'rgba(60,60,60,0.12)';
        c.fillRect(8, -8, 22, 4);
        c.fillRect(6, -10, 6, 8);
        // Arms
        c.fillStyle = 'rgba(80,80,70,0.12)';
        c.fillRect(-17, -8, 8, 18);
        c.fillRect(9, -8, 8, 18);
        // Legs (tactical pants)
        c.fillRect(-10, 16, 8, 18);
        c.fillRect(2, 16, 8, 18);
        // Combat boots
        c.fillRect(-11, 32, 10, 5);
        c.fillRect(1, 32, 10, 5);
        // Backpack
        c.fillRect(-4, -14, 8, 16);
        c.restore();
    }

    // ── EMPIRE SELECT ─────────────────────────────────────────
    _empSel() {
        const c = this.ctx, { W, H } = this.g;
        const g = this.g;
        if (!this._empSelHover) this._empSelHover = -1;
        let curHover = -1;

        // ═══════════════════════════════════════════════════
        // CINEMATIC EMPEROR SELECTION — AAA Game Quality
        // ═══════════════════════════════════════════════════

        // ── DARK ATMOSPHERIC BACKGROUND with moving clouds ──
        const bgGr = c.createLinearGradient(0, 0, 0, H);
        bgGr.addColorStop(0, '#0a0604');
        bgGr.addColorStop(0.3, '#1a0f08');
        bgGr.addColorStop(0.7, '#120a05');
        bgGr.addColorStop(1, '#050302');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        // Animated ember/fire particles floating up
        for (let i = 0; i < 60; i++) {
            const px = (Math.sin(this.time * 0.005 + i * 2.7) * 0.5 + 0.5) * W;
            const py = H - ((this.time * 0.3 + i * 47) % H);
            const sz = 1 + Math.sin(this.time * 0.02 + i) * 0.8;
            const alpha = 0.1 + Math.sin(this.time * 0.01 + i * 0.7) * 0.08;
            const colors = ['rgba(255,100,30,', 'rgba(255,180,50,', 'rgba(255,60,20,', 'rgba(255,215,0,'];
            c.fillStyle = colors[i % 4] + alpha + ')';
            c.beginPath(); c.arc(px, py, sz, 0, Math.PI * 2); c.fill();
        }

        // Smoke wisps
        c.save();
        for (let s = 0; s < 5; s++) {
            c.globalAlpha = 0.03 + s * 0.005;
            const smokeX = W * (0.2 + s * 0.15) + Math.sin(this.time * 0.003 + s) * 30;
            const smokeY = H * 0.3 + Math.cos(this.time * 0.002 + s * 2) * 20;
            const smokeGr = c.createRadialGradient(smokeX, smokeY, 10, smokeX, smokeY, 120);
            smokeGr.addColorStop(0, 'rgba(180,140,80,0.15)');
            smokeGr.addColorStop(1, 'rgba(180,140,80,0)');
            c.fillStyle = smokeGr;
            c.fillRect(smokeX - 120, smokeY - 120, 240, 240);
        }
        c.restore();

        // ── GRAND TITLE with cinematic animation ──
        c.textAlign = 'center'; c.textBaseline = 'middle';

        // Title glow pulse
        const titleGlow = 12 + Math.sin(this.time * 0.03) * 6;
        c.save();
        c.shadowColor = 'rgba(255,180,50,0.6)';
        c.shadowBlur = titleGlow;
        c.fillStyle = '#ffd700';
        c.font = 'bold 36px Georgia, serif';
        c.fillText('CHOOSE YOUR EMPEROR', W / 2, 32);
        c.restore();

        // Ornate subtitle
        c.fillStyle = '#b89a6a'; c.font = 'italic 13px Georgia, serif';
        c.fillText('Each emperor commands unique tactics. Hover to reveal their secrets.', W / 2, 58);

        // Gold divider with animated shimmer
        const divY = 72;
        const shimmerX = (this.time * 2) % (W * 0.6);
        c.strokeStyle = 'rgba(184,154,106,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W * 0.15, divY); c.lineTo(W * 0.85, divY); c.stroke();
        // Shimmer highlight
        c.save();
        const shimGr = c.createLinearGradient(W * 0.15 + shimmerX - 40, 0, W * 0.15 + shimmerX + 40, 0);
        shimGr.addColorStop(0, 'rgba(255,215,0,0)');
        shimGr.addColorStop(0.5, 'rgba(255,215,0,0.6)');
        shimGr.addColorStop(1, 'rgba(255,215,0,0)');
        c.strokeStyle = shimGr; c.lineWidth = 2;
        c.beginPath(); c.moveTo(W * 0.15, divY); c.lineTo(W * 0.85, divY); c.stroke();
        c.restore();
        // Center diamond
        c.fillStyle = '#ffd700';
        c.beginPath();
        c.moveTo(W / 2, divY - 5); c.lineTo(W / 2 + 5, divY);
        c.lineTo(W / 2, divY + 5); c.lineTo(W / 2 - 5, divY);
        c.closePath(); c.fill();

        // ── BACK BUTTON ──
        g.btns = [];
        const bbW = 80, bbH = 30, bbX = 15, bbY = 15;
        const backBtn = { label: 'Back', fn: () => { g.state = 'difficulty'; g.sfx.click(); } };
        backBtn.rect = { x: bbX, y: bbY, w: bbW, h: bbH };
        g.btns.push(backBtn);
        this._rr(c, bbX, bbY, bbW, bbH, 8); c.fillStyle = 'rgba(184,154,106,0.15)'; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 1.5;
        this._rr(c, bbX, bbY, bbW, bbH, 8); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('\u2B05 Back', bbX + bbW / 2, bbY + bbH / 2);

        // ── EMPIRE CARDS — 5x2 Grid with Cinematic Hover ──
        const cols = 5, cw = Math.min(160, (W - 50) / cols), ch = 160, gap = 6;
        const rows = Math.ceil(EIDS.length / cols);
        const totalW = cw * cols + gap * (cols - 1);
        const sx = (W - totalW) / 2, sy = (H - ch * rows - gap * (rows - 1)) / 2 + 30;

        for (let i = 0; i < EIDS.length; i++) {
            const eid = EIDS[i], em = EMPIRES[eid];
            const stories = EMPIRE_STORIES[eid];
            const col = i % cols, row = Math.floor(i / cols);
            const x = sx + col * (cw + gap), y = sy + row * (ch + gap);
            const hover = g.input.hoverX >= x && g.input.hoverX <= x + cw &&
                          g.input.hoverY >= y && g.input.hoverY <= y + ch;
            if (hover) curHover = i;

            // Card shadow
            c.save();
            c.shadowColor = 'rgba(0,0,0,0.5)';
            c.shadowBlur = hover ? 20 : 8;
            c.shadowOffsetY = hover ? 4 : 2;

            // Card background — parchment texture feel
            const cardGr = c.createLinearGradient(x, y, x + cw, y + ch);
            if (hover) {
                cardGr.addColorStop(0, 'rgba(70,42,24,0.97)');
                cardGr.addColorStop(0.5, 'rgba(60,35,20,0.97)');
                cardGr.addColorStop(1, 'rgba(50,28,16,0.97)');
            } else {
                cardGr.addColorStop(0, 'rgba(40,24,14,0.92)');
                cardGr.addColorStop(0.5, 'rgba(35,20,12,0.92)');
                cardGr.addColorStop(1, 'rgba(30,18,10,0.92)');
            }
            this._rr(c, x, y, cw, ch, 12); c.fillStyle = cardGr; c.fill();
            c.restore();

            // Empire color top bar with gradient
            const topGr = c.createLinearGradient(x, y, x + cw, y);
            topGr.addColorStop(0, em.dark);
            topGr.addColorStop(0.5, em.color);
            topGr.addColorStop(1, em.dark);
            c.fillStyle = topGr;
            c.save();
            c.beginPath();
            c.moveTo(x + 12, y);
            c.lineTo(x + cw - 12, y);
            c.arcTo(x + cw, y, x + cw, y + 12, 12);
            c.lineTo(x + cw, y + 6);
            c.lineTo(x, y + 6);
            c.lineTo(x, y + 12);
            c.arcTo(x, y, x + 12, y, 12);
            c.closePath();
            c.fill();
            c.restore();

            // Ornate border
            c.strokeStyle = hover ? '#ffd700' : em.color + '60';
            c.lineWidth = hover ? 2.5 : 1.5;
            this._rr(c, x, y, cw, ch, 12); c.stroke();

            // Animated hover glow
            if (hover) {
                const glowPulse = 8 + Math.sin(this.time * 0.06) * 4;
                c.save();
                c.shadowColor = em.color;
                c.shadowBlur = glowPulse;
                this._rr(c, x, y, cw, ch, 12); c.stroke();
                c.restore();
            }

            // ── EMPEROR PORTRAIT (drawn, not emoji) ──
            this._drawEmperorPortrait(c, x + cw / 2, y + 35, eid, em, this.time, hover);

            // Empire name
            c.fillStyle = '#f5e6c8'; c.font = 'bold 12px "Segoe UI", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(em.name, x + cw / 2, y + 68);

            // Era with subtle styling
            c.fillStyle = em.color + 'cc'; c.font = '9px Georgia, serif';
            c.fillText(em.era, x + cw / 2, y + 82);

            // Bonus with icon
            c.fillStyle = '#E65100'; c.font = 'bold 9px "Segoe UI", sans-serif';
            c.fillText('\u26A1 ' + em.bonus, x + cw / 2, y + 98);

            // Empire icon bottom-right
            c.fillStyle = em.color + '40'; c.font = '20px serif';
            c.textAlign = 'right';
            c.fillText(em.icon || '?', x + cw - 8, y + ch - 10);

            // Hover: show first story fact
            if (hover && stories && stories.length > 0) {
                c.save();
                // Tooltip background
                const tipW = 320, tipH = 52;
                let tipX = x + cw / 2 - tipW / 2;
                let tipY = y - tipH - 8;
                if (tipY < 5) tipY = y + ch + 5;
                if (tipX < 5) tipX = 5;
                if (tipX + tipW > W - 5) tipX = W - tipW - 5;

                c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 12;
                const tipGr = c.createLinearGradient(tipX, tipY, tipX + tipW, tipY + tipH);
                tipGr.addColorStop(0, 'rgba(30,18,10,0.97)');
                tipGr.addColorStop(1, 'rgba(50,28,16,0.97)');
                this._rr(c, tipX, tipY, tipW, tipH, 10); c.fillStyle = tipGr; c.fill();
                c.restore();
                c.strokeStyle = em.color + '80'; c.lineWidth = 1.5;
                this._rr(c, tipX, tipY, tipW, tipH, 10); c.stroke();

                // Story text
                c.fillStyle = '#f5e6c8'; c.font = '10px "Segoe UI", sans-serif';
                c.textAlign = 'center'; c.textBaseline = 'middle';
                const fact = stories[Math.floor(this.time / 120) % stories.length];
                // Word wrap
                const maxChars = 58;
                const line1 = fact.length > maxChars ? fact.substring(0, maxChars) + '...' : fact;
                const line2 = fact.length > maxChars ? '...' + fact.substring(maxChars, maxChars * 2 - 3) + '...' : '';
                c.fillText(line1, tipX + tipW / 2, tipY + 18);
                if (line2) c.fillText(line2, tipX + tipW / 2, tipY + 36);

                // "Click to command!" prompt
                c.fillStyle = em.color; c.font = 'bold 9px Georgia, serif';
                c.fillText('\u2694 Click to Command \u2694', tipX + tipW / 2, tipY + tipH - 6);
            }
        }

        this._empSelHover = curHover;

        // ── BOTTOM INSTRUCTION ──
        const pulse = 0.5 + Math.sin(this.time * 0.04) * 0.3;
        c.save();
        c.globalAlpha = pulse;
        c.fillStyle = '#ffd700'; c.font = 'bold 14px Georgia, serif';
        c.textAlign = 'center';
        c.fillText('Hover over an emperor to learn their story. Click to begin your conquest.', W / 2, H - 18);
        c.restore();
    }

    // ── DETAILED EMPEROR PORTRAITS ──────────────────────────────
    _drawEmperorPortrait(c, cx, cy, eid, em, time, hover) {
        c.save();
        c.translate(cx, cy);
        const s = hover ? 1.1 : 0.95;
        c.scale(s, s);

        // Background circle with empire color
        const bgGr = c.createRadialGradient(0, 0, 5, 0, 0, 22);
        bgGr.addColorStop(0, em.color + '40');
        bgGr.addColorStop(1, em.color + '10');
        c.fillStyle = bgGr;
        c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill();

        // Empire-colored ring
        c.strokeStyle = em.color + (hover ? 'cc' : '60');
        c.lineWidth = hover ? 2.5 : 1.5;
        c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.stroke();

        // Draw specific emperor based on empire id
        switch (eid) {
            case 'maurya': this._drawMauryaEmperor(c, time); break;
            case 'roman': this._drawRomanEmperor(c, time); break;
            case 'mongol': this._drawMongolKhan(c, time); break;
            case 'ottoman': this._drawOttomanSultan(c, time); break;
            case 'british': this._drawBritishMonarch(c, time); break;
            case 'napoleon': this._drawNapoleon(c, time); break;
            case 'japan': this._drawJapaneseShogun(c, time); break;
            case 'germany': this._drawGermanCommander(c, time); break;
            case 'russia': this._drawRussianCzar(c, time); break;
            case 'egypt': this._drawEgyptianPharaoh(c, time); break;
            default: c.fillStyle = '#888'; c.font = '18px serif'; c.fillText('?', 0, 4);
        }
        c.restore();
    }

    _drawMauryaEmperor(c, t) {
        // Chandragupta Maurya — golden armor, Indian crown
        // Crown (Mukuta)
        c.fillStyle = '#ffd700';
        c.beginPath();
        c.moveTo(-8, -18); c.lineTo(-12, -26); c.lineTo(-6, -22); c.lineTo(0, -28);
        c.lineTo(6, -22); c.lineTo(12, -26); c.lineTo(8, -18);
        c.closePath(); c.fill();
        c.fillStyle = '#e67e22';
        c.beginPath(); c.arc(0, -19, 3, 0, Math.PI * 2); c.fill();
        // Head
        c.fillStyle = '#8d5524';
        c.beginPath(); c.arc(0, -11, 7, 0, Math.PI * 2); c.fill();
        // Eyes
        c.fillStyle = '#1a1a1a';
        c.fillRect(-3, -12, 2, 1.5); c.fillRect(1, -12, 2, 1.5);
        // Armor body
        c.fillStyle = '#e67e22';
        c.fillRect(-8, -4, 16, 14);
        // Gold overlay
        c.fillStyle = '#ffd700';
        c.fillRect(-6, -2, 12, 3);
        // Necklace
        c.fillStyle = '#ffd700';
        c.beginPath(); c.arc(0, -4, 5, 0.2, Math.PI - 0.2); c.lineWidth = 1.5; c.strokeStyle = '#ffd700'; c.stroke();
        // Sword (Khanda)
        c.strokeStyle = '#c0c0c0'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(10, -2); c.lineTo(16, -18); c.stroke();
        c.fillStyle = '#ffd700';
        c.fillRect(8, -3, 5, 3);
    }

    _drawRomanEmperor(c, t) {
        // Caesar — laurel wreath, red cape, armor
        // Laurel wreath
        c.strokeStyle = '#27ae60'; c.lineWidth = 2;
        c.beginPath(); c.arc(0, -14, 10, Math.PI + 0.3, -0.3); c.stroke();
        c.fillStyle = '#2ecc71';
        for (let a = Math.PI + 0.5; a < -0.3; a -= 0.5) {
            c.beginPath();
            c.arc(Math.cos(a) * 10, -14 + Math.sin(a) * 10, 2, 0, Math.PI * 2); c.fill();
        }
        // Head
        c.fillStyle = '#f0c8a0';
        c.beginPath(); c.arc(0, -10, 7, 0, Math.PI * 2); c.fill();
        // Eyes (stern)
        c.fillStyle = '#2c3e50';
        c.fillRect(-3, -11, 2, 2); c.fillRect(1, -11, 2, 2);
        // Roman armor (Lorica Segmentata)
        c.fillStyle = '#c0392b';
        c.fillRect(-9, -3, 18, 15);
        // Metal strips
        c.fillStyle = '#95a5a6';
        for (let s = -7; s <= 7; s += 3.5) {
            c.fillRect(s, -2, 2.5, 12);
        }
        // Red cape
        c.fillStyle = '#c0392b';
        c.beginPath();
        c.moveTo(-9, -3); c.lineTo(-14, 12); c.lineTo(-10, 12); c.lineTo(-7, -1);
        c.closePath(); c.fill();
        // Gladius sword
        c.strokeStyle = '#bdc3c7'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(11, 0); c.lineTo(18, -16); c.stroke();
        c.fillStyle = '#f1c40f';
        c.fillRect(9, -1, 5, 3);
    }

    _drawMongolKhan(c, t) {
        // Genghis Khan — fur hat, leather armor, bow
        // Fur hat
        c.fillStyle = '#5d4037';
        c.beginPath(); c.arc(0, -16, 9, Math.PI, 0); c.fill();
        c.fillRect(-10, -16, 20, 4);
        c.fillStyle = '#795548';
        c.beginPath(); c.arc(0, -16, 9, Math.PI, 0); c.lineWidth = 2; c.strokeStyle = '#795548'; c.stroke();
        // Red top
        c.fillStyle = '#c0392b';
        c.beginPath(); c.moveTo(-4, -25); c.lineTo(0, -30); c.lineTo(4, -25); c.closePath(); c.fill();
        // Head
        c.fillStyle = '#d4a574';
        c.beginPath(); c.arc(0, -10, 7, 0, Math.PI * 2); c.fill();
        // Eyes (narrow, fierce)
        c.fillStyle = '#1a1a1a';
        c.fillRect(-3, -11, 2.5, 1); c.fillRect(0.5, -11, 2.5, 1);
        // Leather armor
        c.fillStyle = '#5d4037';
        c.fillRect(-9, -3, 18, 15);
        // Leather straps
        c.strokeStyle = '#795548'; c.lineWidth = 1;
        for (let s = -6; s <= 6; s += 4) {
            c.beginPath(); c.moveTo(s, -2); c.lineTo(s, 11); c.stroke();
        }
        // Bow
        c.strokeStyle = '#8d6e63'; c.lineWidth = 2;
        c.beginPath(); c.arc(14, -5, 14, -0.8, 0.8); c.stroke();
        c.strokeStyle = '#d7ccc8'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(14 + Math.cos(-0.8) * 14, -5 + Math.sin(-0.8) * 14);
        c.lineTo(14 + Math.cos(0.8) * 14, -5 + Math.sin(0.8) * 14); c.stroke();
    }

    _drawOttomanSultan(c, t) {
        // Suleiman the Magnificent — turban, jewel robes
        // Turban
        c.fillStyle = '#f1c40f';
        c.beginPath(); c.arc(0, -18, 10, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#e74c3c';
        c.beginPath(); c.arc(0, -22, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f1c40f';
        c.beginPath(); c.arc(0, -24, 3, 0, Math.PI * 2); c.fill();
        // Jewel on turban
        c.fillStyle = '#2ecc71';
        c.beginPath(); c.arc(0, -18, 2, 0, Math.PI * 2); c.fill();
        // Head
        c.fillStyle = '#d4a574';
        c.beginPath(); c.arc(0, -9, 7, 0, Math.PI * 2); c.fill();
        // Eyes
        c.fillStyle = '#1a1a1a';
        c.fillRect(-3, -10, 2, 1.5); c.fillRect(1, -10, 2, 1.5);
        // Beard
        c.fillStyle = '#1a1a1a';
        c.beginPath(); c.moveTo(-3, -4); c.lineTo(0, 3); c.lineTo(3, -4); c.closePath(); c.fill();
        // Jewel-encrusted robe
        c.fillStyle = '#16a085';
        c.fillRect(-9, -2, 18, 15);
        // Gold embroidery
        c.strokeStyle = '#f1c40f'; c.lineWidth = 1;
        c.strokeRect(-7, 0, 14, 11);
        // Scepter
        c.strokeStyle = '#f1c40f'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(12, -1); c.lineTo(16, -16); c.stroke();
        c.fillStyle = '#2ecc71';
        c.beginPath(); c.arc(16, -18, 3, 0, Math.PI * 2); c.fill();
    }

    _drawBritishMonarch(c, t) {
        // British monarch — crown, red robe, scepter
        // Crown
        c.fillStyle = '#f1c40f';
        c.beginPath();
        c.moveTo(-9, -18); c.lineTo(-11, -27); c.lineTo(-5, -22); c.lineTo(0, -29);
        c.lineTo(5, -22); c.lineTo(11, -27); c.lineTo(9, -18);
        c.closePath(); c.fill();
        // Crown jewels
        c.fillStyle = '#e74c3c'; c.beginPath(); c.arc(-5, -23, 1.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#3498db'; c.beginPath(); c.arc(0, -26, 1.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#2ecc71'; c.beginPath(); c.arc(5, -23, 1.5, 0, Math.PI * 2); c.fill();
        // Crown base
        c.fillStyle = '#c0392b';
        c.fillRect(-9, -19, 18, 3);
        // Head
        c.fillStyle = '#f0c8a0';
        c.beginPath(); c.arc(0, -11, 7, 0, Math.PI * 2); c.fill();
        // Eyes
        c.fillStyle = '#2c3e50';
        c.fillRect(-3, -12, 2, 1.5); c.fillRect(1, -12, 2, 1.5);
        // Red royal robe
        c.fillStyle = '#c0392b';
        c.fillRect(-10, -4, 20, 16);
        // Ermine trim
        c.fillStyle = '#ecf0f1';
        c.fillRect(-10, -4, 20, 3);
        // Gold chain
        c.strokeStyle = '#f1c40f'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(0, -3, 5, 0.3, Math.PI - 0.3); c.stroke();
        // Scepter
        c.strokeStyle = '#f1c40f'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(12, -2); c.lineTo(16, -18); c.stroke();
        c.fillStyle = '#f1c40f';
        c.beginPath(); c.arc(16, -18, 2.5, 0, Math.PI * 2); c.fill();
    }

    _drawNapoleon(c, t) {
        // Napoleon — bicorne hat, blue uniform, hand in coat
        // Bicorne hat
        c.fillStyle = '#1a1a2e';
        c.beginPath();
        c.moveTo(-14, -14); c.lineTo(-10, -20); c.lineTo(0, -18);
        c.lineTo(10, -20); c.lineTo(14, -14);
        c.closePath(); c.fill();
        // Hat brim
        c.fillStyle = '#1a1a2e';
        c.fillRect(-14, -15, 28, 4);
        // Head
        c.fillStyle = '#f0c8a0';
        c.beginPath(); c.arc(0, -8, 7, 0, Math.PI * 2); c.fill();
        // Eyes (intense)
        c.fillStyle = '#2c3e50';
        c.fillRect(-3, -9, 2, 2); c.fillRect(1, -9, 2, 2);
        // Blue uniform
        c.fillStyle = '#2980b9';
        c.fillRect(-9, -1, 18, 14);
        // Red epaulettes
        c.fillStyle = '#e74c3c';
        c.fillRect(-10, -1, 3, 4); c.fillRect(7, -1, 3, 4);
        // Gold buttons
        c.fillStyle = '#f1c40f';
        for (let b = -6; b <= 6; b += 4) {
            c.beginPath(); c.arc(b, 4, 1, 0, Math.PI * 2); c.fill();
        }
        // Hand tucked in coat (Napoleon's signature pose)
        c.fillStyle = '#f0c8a0';
        c.beginPath(); c.arc(-3, 6, 3, 0, Math.PI * 2); c.fill();
        // Sword
        c.strokeStyle = '#bdc3c7'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(11, 2); c.lineTo(17, -14); c.stroke();
        c.fillStyle = '#f1c40f'; c.fillRect(9, 0, 5, 3);
    }

    _drawJapaneseShogun(c, t) {
        // Japanese shogun — kabuto helmet, armor, katana
        // Kabuto helmet
        c.fillStyle = '#1a1a2e';
        c.beginPath(); c.arc(0, -16, 10, Math.PI, 0); c.fill();
        // Crest (maedate)
        c.fillStyle = '#f1c40f';
        c.beginPath(); c.moveTo(0, -26); c.lineTo(-3, -18); c.lineTo(3, -18); c.closePath(); c.fill();
        // Face guard
        c.fillStyle = '#c0392b';
        c.fillRect(-8, -16, 16, 3);
        // Head
        c.fillStyle = '#f0c8a0';
        c.beginPath(); c.arc(0, -9, 7, 0, Math.PI * 2); c.fill();
        // Eyes (focused)
        c.fillStyle = '#1a1a1a';
        c.fillRect(-3, -10, 2, 1); c.fillRect(1, -10, 2, 1);
        // Armor (O-yoroi)
        c.fillStyle = '#c0392b';
        c.fillRect(-9, -2, 18, 15);
        // Gold lattice
        c.strokeStyle = '#f1c40f'; c.lineWidth = 0.8;
        for (let a = -7; a <= 7; a += 3) {
            c.beginPath(); c.moveTo(a, -1); c.lineTo(a, 12); c.stroke();
        }
        // Katana
        c.strokeStyle = '#bdc3c7'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(12, 0); c.lineTo(19, -20); c.stroke();
        // Tsuba (guard)
        c.fillStyle = '#f1c40f';
        c.fillRect(10, -1, 5, 2);
        // Handle
        c.strokeStyle = '#5d4037'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(10, 0); c.lineTo(7, 10); c.stroke();
    }

    _drawGermanCommander(c, t) {
        // German commander — stahlhelm, field gray uniform, iron cross
        // Stahlhelm helmet
        c.fillStyle = '#444';
        c.beginPath();
        c.moveTo(-10, -14); c.lineTo(-12, -10); c.lineTo(-8, -20);
        c.lineTo(0, -22); c.lineTo(8, -20); c.lineTo(12, -10);
        c.lineTo(10, -14);
        c.closePath(); c.fill();
        // Helmet ridge
        c.fillStyle = '#555';
        c.fillRect(-2, -22, 4, 10);
        // Head
        c.fillStyle = '#f0c8a0';
        c.beginPath(); c.arc(0, -8, 7, 0, Math.PI * 2); c.fill();
        // Eyes
        c.fillStyle = '#2c3e50';
        c.fillRect(-3, -9, 2, 1.5); c.fillRect(1, -9, 2, 1.5);
        // Field gray uniform
        c.fillStyle = '#556b2f';
        c.fillRect(-9, -1, 18, 14);
        // Collar tabs
        c.fillStyle = '#c0392b';
        c.fillRect(-9, -1, 4, 3); c.fillRect(5, -1, 4, 3);
        // Iron cross
        c.strokeStyle = '#1a1a1a'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-2, 3); c.lineTo(2, 3); c.stroke();
        c.beginPath(); c.moveTo(0, 1); c.lineTo(0, 5); c.stroke();
        c.strokeStyle = '#f0c8a0'; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-1.5, 3); c.lineTo(1.5, 3); c.stroke();
        c.beginPath(); c.moveTo(0, 1.5); c.lineTo(0, 4.5); c.stroke();
    }

    _drawRussianCzar(c, t) {
        // Russian Czar — ushanka fur hat, greatcoat, medal
        // Ushanka hat
        c.fillStyle = '#5d4037';
        c.beginPath(); c.arc(0, -14, 10, 0, Math.PI * 2); c.fill();
        // Fur flaps
        c.fillStyle = '#795548';
        c.beginPath(); c.arc(-9, -8, 5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(9, -8, 5, 0, Math.PI * 2); c.fill();
        // Red star on hat
        c.fillStyle = '#cc0000';
        c.beginPath(); c.arc(0, -14, 3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffd700';
        c.beginPath(); c.arc(0, -14, 1.5, 0, Math.PI * 2); c.fill();
        // Head
        c.fillStyle = '#f0c8a0';
        c.beginPath(); c.arc(0, -6, 7, 0, Math.PI * 2); c.fill();
        // Eyes
        c.fillStyle = '#2c3e50';
        c.fillRect(-3, -7, 2, 1.5); c.fillRect(1, -7, 2, 1.5);
        // Greatcoat
        c.fillStyle = '#2c3e50';
        c.fillRect(-10, 1, 20, 14);
        // Collar
        c.fillStyle = '#5d4037';
        c.fillRect(-10, 1, 20, 4);
        // Medal
        c.fillStyle = '#cc0000';
        c.beginPath(); c.arc(0, 7, 2.5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#ffd700'; c.lineWidth = 0.8;
        c.beginPath(); c.arc(0, 7, 2.5, 0, Math.PI * 2); c.stroke();
        // Epaulettes
        c.fillStyle = '#ffd700';
        c.fillRect(-11, 1, 3, 5); c.fillRect(8, 1, 3, 5);
    }

    _drawEgyptianPharaoh(c, t) {
        // Pharaoh — nemes headdress, gold collar, crook
        // Nemes headdress
        c.fillStyle = '#1a5276';
        c.beginPath();
        c.moveTo(-12, -8); c.lineTo(-8, -20); c.lineTo(0, -24);
        c.lineTo(8, -20); c.lineTo(12, -8);
        c.closePath(); c.fill();
        // Gold stripes
        c.strokeStyle = '#f1c40f'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-5, -20); c.lineTo(-8, -8); c.stroke();
        c.beginPath(); c.moveTo(5, -20); c.lineTo(8, -8); c.stroke();
        // Uraeus (cobra)
        c.fillStyle = '#f1c40f';
        c.beginPath(); c.arc(0, -24, 3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#e74c3c';
        c.beginPath(); c.arc(0, -24, 1.5, 0, Math.PI * 2); c.fill();
        // Side flaps
        c.fillStyle = '#1a5276';
        c.fillRect(-12, -8, 4, 16); c.fillRect(8, -8, 4, 16);
        // Gold stripes on flaps
        c.strokeStyle = '#f1c40f'; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-11, -6); c.lineTo(-11, 7); c.stroke();
        c.beginPath(); c.moveTo(9, -6); c.lineTo(9, 7); c.stroke();
        // Head
        c.fillStyle = '#d4a574';
        c.beginPath(); c.arc(0, -6, 6, 0, Math.PI * 2); c.fill();
        // Eyes (kohl-lined)
        c.fillStyle = '#1a1a1a';
        c.fillRect(-3, -7, 3, 1); c.fillRect(0, -7, 3, 1);
        // Gold collar (Usekh)
        c.fillStyle = '#f1c40f';
        c.beginPath();
        c.moveTo(-8, 0); c.lineTo(0, -2); c.lineTo(8, 0);
        c.lineTo(10, 4); c.lineTo(-10, 4);
        c.closePath(); c.fill();
        // Collar details
        c.fillStyle = '#e74c3c';
        c.beginPath(); c.arc(-4, 2, 1, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#3498db';
        c.beginPath(); c.arc(0, 1, 1, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#2ecc71';
        c.beginPath(); c.arc(4, 2, 1, 0, Math.PI * 2); c.fill();
        // White kilt
        c.fillStyle = '#ecf0f1';
        c.fillRect(-7, 4, 14, 10);
        // Crook and flail
        c.strokeStyle = '#f1c40f'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(10, 0); c.lineTo(14, -16); c.stroke();
        c.beginPath(); c.moveTo(14, -16); c.lineTo(16, -19); c.stroke();
        c.strokeStyle = '#8d6e63'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-10, 0); c.lineTo(-14, -14); c.stroke();
        c.fillStyle = '#8d6e63';
        c.fillRect(-16, -17, 4, 5);
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
        panelGr.addColorStop(0, '#FFFFFF'); panelGr.addColorStop(1, '#FFF8E1');
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
            { header: 'WIN', color: '#ffd700', text: 'Control all 30 territories to win!' },
        ];

        let sy = py + 78;
        for (const sec of sections) {
            c.textAlign = 'left';
            c.fillStyle = sec.color; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(sec.header, px + 30, sy);
            c.fillStyle = '#4E342E'; c.font = '12px "Segoe UI", sans-serif';
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
            c.font = 'bold 24px Georgia, serif'; c.fillStyle = '#ffd700';
            c.fillText(d.label, bx + btnW/2, by + 80);
            // Description
            c.font = '12px "Segoe UI", sans-serif'; c.fillStyle = '#e0d0b8';
            c.fillText(d.desc, bx + btnW/2, by + 108);
            // Detail
            c.font = '11px "Segoe UI", sans-serif'; c.fillStyle = '#c0b098';
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
            c.fillStyle = '#e67e22'; c.font = 'bold 18px Georgia, serif';
            c.textAlign = 'center';
            c.fillText('Click a difficulty to continue', W/2, H*0.82);
        }
    }

    // ── ONLINE LOBBY SCREEN ──────────────────────────────────
    _onlineLobbyScreen() {
        const c = this.ctx, g = this.g, { W, H } = g;
        g.btns = []; // Reset buttons each frame

        // Background
        const bgGr = c.createRadialGradient(W/2, H*0.3, 50, W/2, H/2, W*0.9);
        bgGr.addColorStop(0, '#0d1b2a');
        bgGr.addColorStop(0.5, '#1b2838');
        bgGr.addColorStop(1, '#0d1b2a');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        // Animated grid
        c.save();
        c.strokeStyle = 'rgba(30,136,229,0.08)'; c.lineWidth = 0.5;
        for (let x = 0; x < W; x += 40) {
            c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
        }
        for (let y = 0; y < H; y += 40) {
            c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
        }
        c.restore();

        // Floating particles
        for (let i = 0; i < 30; i++) {
            const px = (Math.sin(this.time * 0.008 + i * 2.1) * 0.5 + 0.5) * W;
            const py = (Math.cos(this.time * 0.006 + i * 1.7) * 0.5 + 0.5) * H;
            const alpha = 0.1 + Math.sin(this.time * 0.02 + i) * 0.08;
            c.fillStyle = `rgba(30,136,229,${alpha})`;
            c.beginPath(); c.arc(px, py, 2, 0, Math.PI*2); c.fill();
        }

        // Title
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.save();
        c.shadowColor = 'rgba(30,136,229,0.5)'; c.shadowBlur = 20;
        c.fillStyle = '#42A5F5'; c.font = 'bold 36px Georgia, serif';
        c.fillText('\u{1F310} ONLINE BATTLE', W/2, H*0.08);
        c.restore();
        c.fillStyle = 'rgba(144,164,174,0.8)'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText('Real-time multiplayer conquest', W/2, H*0.08 + 30);

        // Server status
        const serverUp = g._wsConnected;
        const statusColor = serverUp ? '#4CAF50' : '#FF5722';
        const statusText = serverUp ? 'CONNECTED' : 'OFFLINE';
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.beginPath(); c.roundRect(W/2 - 80, H*0.13, 160, 24, 12); c.fill();
        c.fillStyle = statusColor; c.beginPath(); c.arc(W/2 - 55, H*0.13 + 12, 5, 0, Math.PI*2); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.fillText(statusText, W/2 + 5, H*0.13 + 12);

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
        c.fillText('\u2B05 Back', bbX + bbW/2, bbY + bbH/2);

        // ── LEFT PANEL: Create / Join ──
        const panelX = W * 0.04, panelY = H * 0.19, panelW = W * 0.42, panelH = H * 0.74;
        c.fillStyle = 'rgba(13,27,42,0.85)';
        c.beginPath(); c.roundRect(panelX, panelY, panelW, panelH, 12); c.fill();
        c.strokeStyle = 'rgba(30,136,229,0.3)'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(panelX, panelY, panelW, panelH, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#90CAF9'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText('GAME ROOMS', panelX + panelW/2, panelY + 20);

        // Room code input area
        const codeY = panelY + 50;
        c.fillStyle = 'rgba(255,255,255,0.05)';
        c.beginPath(); c.roundRect(panelX + 15, codeY, panelW - 30, 36, 8); c.fill();
        c.strokeStyle = 'rgba(30,136,229,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(panelX + 15, codeY, panelW - 30, 36, 8); c.stroke();
        c.fillStyle = g._roomCodeInput ? '#fff' : 'rgba(255,255,255,0.3)';
        c.font = '14px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText(g._roomCodeInput || 'Enter room code...', panelX + panelW/2, codeY + 18);
        // Blinking cursor when typing
        if (g._roomCodeInput !== undefined && Math.floor(this.time / 30) % 2 === 0) {
            const cursorText = g._roomCodeInput || '';
            const cursorX = panelX + panelW/2 + c.measureText(cursorText).width / 2 + 3;
            c.fillStyle = '#42A5F5'; c.fillRect(cursorX, codeY + 8, 2, 20);
        }
        // Store rect for click-to-type
        g._roomCodeRect = { x: panelX + 15, y: codeY, w: panelW - 30, h: 36 };

        // Player name input
        const nameY = codeY - 45;
        c.fillStyle = '#78909C'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.textAlign = 'left';
        c.fillText('YOUR NAME:', panelX + 15, nameY);
        c.fillStyle = 'rgba(255,255,255,0.05)';
        c.beginPath(); c.roundRect(panelX + 15, nameY + 5, panelW - 30, 30, 6); c.fill();
        c.strokeStyle = 'rgba(30,136,229,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(panelX + 15, nameY + 5, panelW - 30, 30, 6); c.stroke();
        c.fillStyle = g._playerNameInput ? '#fff' : 'rgba(255,255,255,0.3)';
        c.font = '13px "Segoe UI", sans-serif'; c.textAlign = 'center';
        c.fillText(g._playerNameInput || 'Enter your name...', panelX + panelW/2, nameY + 22);
        g._playerNameRect = { x: panelX + 15, y: nameY + 5, w: panelW - 30, h: 30 };

        // Create Room button
        const crW = panelW - 30, crH = 38, crX = panelX + 15, crY = codeY + 50;
        const crBtn = { label: 'Create Room', fn: () => { g._createRoom(); g.sfx.click(); } };
        crBtn.rect = { x: crX, y: crY, w: crW, h: crH };
        g.btns.push(crBtn);
        const crGr = c.createLinearGradient(crX, crY, crX + crW, crY);
        crGr.addColorStop(0, '#1E88E5'); crGr.addColorStop(1, '#1565C0');
        c.beginPath(); c.roundRect(crX, crY, crW, crH, 8); c.fillStyle = crGr; c.fill();
        c.strokeStyle = '#42A5F5'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(crX, crY, crW, crH, 8); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('\u{2795} Create Room', crX + crW/2, crY + crH/2);

        // Join Room button
        const jrY = crY + 48;
        const jrBtn = { label: 'Join Room', fn: () => { g._joinRoom(); g.sfx.click(); } };
        jrBtn.rect = { x: crX, y: jrY, w: crW, h: crH };
        g.btns.push(jrBtn);
        const jrGr = c.createLinearGradient(crX, jrY, crX + crW, jrY);
        jrGr.addColorStop(0, '#43A047'); jrGr.addColorStop(1, '#2E7D32');
        c.beginPath(); c.roundRect(crX, jrY, crW, crH, 8); c.fillStyle = jrGr; c.fill();
        c.strokeStyle = '#66BB6A'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(crX, jrY, crW, crH, 8); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('\u{1F517} Join Room', crX + crW/2, jrY + crH/2);

        // Quick Match button
        const qmY = jrY + 48;
        const qmBtn = { label: 'Quick Match', fn: () => { g._quickMatch(); g.sfx.click(); } };
        qmBtn.rect = { x: crX, y: qmY, w: crW, h: crH };
        g.btns.push(qmBtn);
        const qmGr = c.createLinearGradient(crX, qmY, crX + crW, qmY);
        qmGr.addColorStop(0, '#FF9800'); qmGr.addColorStop(1, '#F57C00');
        c.beginPath(); c.roundRect(crX, qmY, crW, crH, 8); c.fillStyle = qmGr; c.fill();
        c.strokeStyle = '#FFB74D'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(crX, qmY, crW, crH, 8); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('\u{26A1} Quick Match', crX + crW/2, qmY + crH/2);

        // ── AI PLAYERS SELECTOR ──
        const aiY = qmY + 52;
        c.fillStyle = '#78909C'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'left';
        c.fillText('AI OPPONENTS:', panelX + 15, aiY);

        // Minus button
        const mnW = 28, mnH = 26, mnX = panelX + panelW - 130, mnBtnY = aiY - 13;
        c.fillStyle = 'rgba(229,57,53,0.15)';
        c.beginPath(); c.roundRect(mnX, mnBtnY, mnW, mnH, 5); c.fill();
        c.strokeStyle = '#EF5350'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(mnX, mnBtnY, mnW, mnH, 5); c.stroke();
        c.fillStyle = '#EF5350'; c.font = 'bold 16px "Segoe UI", sans-serif'; c.textAlign = 'center';
        c.fillText('-', mnX + mnW/2, mnBtnY + mnH/2 + 1);
        g.btns.push({ label: 'aiMinus', fn: () => { g._aiPlayers = Math.max(1, g._aiPlayers - 1); g.sfx.click(); } });
        g.btns[g.btns.length - 1].rect = { x: mnX, y: mnBtnY, w: mnW, h: mnH };

        // Count display
        c.fillStyle = '#fff'; c.font = 'bold 18px Georgia, serif';
        c.fillText(g._aiPlayers + '', panelX + panelW - 85, aiY);

        // Plus button
        const plX = panelX + panelW - 60;
        c.fillStyle = 'rgba(76,175,80,0.15)';
        c.beginPath(); c.roundRect(plX, mnBtnY, mnW, mnH, 5); c.fill();
        c.strokeStyle = '#66BB6A'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(plX, mnBtnY, mnW, mnH, 5); c.stroke();
        c.fillStyle = '#66BB6A'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText('+', plX + mnW/2, mnBtnY + mnH/2 + 1);
        g.btns.push({ label: 'aiPlus', fn: () => { g._aiPlayers = Math.min(9, g._aiPlayers + 1); g.sfx.click(); } });
        g.btns[g.btns.length - 1].rect = { x: plX, y: mnBtnY, w: mnW, h: mnH };

        // Player summary: You + AI + real
        const realCount = g._lobbyPlayers ? g._lobbyPlayers.length : 0;
        const totalPlayers = 1 + realCount + g._aiPlayers;
        const sumY = aiY + 22;
        c.fillStyle = 'rgba(255,255,255,0.04)';
        c.beginPath(); c.roundRect(panelX + 10, sumY - 5, panelW - 20, 28, 6); c.fill();
        c.font = '11px "Segoe UI", sans-serif'; c.textAlign = 'center';
        c.fillStyle = '#42A5F5';
        c.fillText('You(1)  +  Real Players(' + realCount + ')  +  AI(' + g._aiPlayers + ')  =  ' + totalPlayers + '/10 empires', panelX + panelW/2, sumY + 10);

        // Active rooms list
        const roomsY = sumY + 35;
        c.fillStyle = '#78909C'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'left';
        c.fillText('ACTIVE ROOMS:', panelX + 15, roomsY);
        c.textAlign = 'center';
        const rooms = g._lobbyRooms || [];
        if (rooms.length === 0) {
            c.fillStyle = 'rgba(255,255,255,0.2)'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText('No active rooms. Create one!', panelX + panelW/2, roomsY + 25);
        } else {
            for (let i = 0; i < Math.min(rooms.length, 5); i++) {
                const r = rooms[i];
                const ry = roomsY + 18 + i * 30;
                const rBtn = { label: r.code, fn: () => { g._roomCode = r.code; g._joinRoom(); g.sfx.click(); } };
                rBtn.rect = { x: panelX + 10, y: ry, w: panelW - 20, h: 26 };
                g.btns.push(rBtn);
                c.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)';
                c.beginPath(); c.roundRect(panelX + 10, ry, panelW - 20, 26, 5); c.fill();
                c.fillStyle = '#B0BEC5'; c.font = 'bold 12px "Segoe UI", sans-serif';
                c.textAlign = 'left';
                c.fillText(r.code + ' - ' + r.name, panelX + 20, ry + 13);
                c.fillStyle = r.players >= 10 ? '#FF5722' : '#4CAF50';
                c.font = '11px "Segoe UI", sans-serif';
                c.textAlign = 'right';
                c.fillText(r.players + '/10', panelX + panelW - 20, ry + 13);
                c.textAlign = 'center';
            }
        }

        // ── RIGHT PANEL: Connected Players + Features ──
        const rpX = W * 0.52, rpY = H * 0.19, rpW = W * 0.44, rpH = H * 0.74;
        c.fillStyle = 'rgba(13,27,42,0.85)';
        c.beginPath(); c.roundRect(rpX, rpY, rpW, rpH, 12); c.fill();
        c.strokeStyle = 'rgba(30,136,229,0.3)'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(rpX, rpY, rpW, rpH, 12); c.stroke();

        c.fillStyle = '#FFD54F'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('\u{1F465} PLAYERS IN ROOM', rpX + rpW/2, rpY + 20);

        // Connected players list
        let py = rpY + 42;
        const allEmpires = ['roman','mongol','british','napoleon','japan','germany','russia','ottoman','maurya','egypt'];
        const lobbyPlayers = g._lobbyPlayers || [];
        const myName = g._playerNameInput || 'You';

        // You (host)
        c.fillStyle = 'rgba(30,136,229,0.1)';
        c.beginPath(); c.roundRect(rpX + 10, py - 8, rpW - 20, 24, 5); c.fill();
        c.fillStyle = '#42A5F5'; c.beginPath(); c.arc(rpX + 24, py + 4, 5, 0, Math.PI*2); c.fill();
        c.fillStyle = '#E3F2FD'; c.font = 'bold 11px "Segoe UI", sans-serif'; c.textAlign = 'left';
        c.fillText('\u{1F3AE} ' + myName + ' (Host)', rpX + 36, py + 6);
        c.fillStyle = '#42A5F5'; c.font = '10px "Segoe UI", sans-serif'; c.textAlign = 'right';
        c.fillText('REAL', rpX + rpW - 18, py + 6);
        py += 28;

        // Real players
        for (const p of lobbyPlayers.slice(0, 8)) {
            c.fillStyle = 'rgba(76,175,80,0.08)';
            c.beginPath(); c.roundRect(rpX + 10, py - 8, rpW - 20, 24, 5); c.fill();
            c.fillStyle = '#66BB6A'; c.beginPath(); c.arc(rpX + 24, py + 4, 5, 0, Math.PI*2); c.fill();
            c.fillStyle = '#C8E6C9'; c.font = '11px "Segoe UI", sans-serif'; c.textAlign = 'left';
            c.fillText('\u{1F464} ' + p.name, rpX + 36, py + 6);
            c.fillStyle = '#66BB6A'; c.font = '10px "Segoe UI", sans-serif'; c.textAlign = 'right';
            c.fillText('REAL', rpX + rpW - 18, py + 6);
            py += 28;
        }

        // AI players
        for (let i = 0; i < g._aiPlayers; i++) {
            c.fillStyle = 'rgba(255,255,255,0.02)';
            c.beginPath(); c.roundRect(rpX + 10, py - 8, rpW - 20, 24, 5); c.fill();
            c.fillStyle = '#78909C'; c.beginPath(); c.arc(rpX + 24, py + 4, 5, 0, Math.PI*2); c.fill();
            c.fillStyle = '#90A4AE'; c.font = '11px "Segoe UI", sans-serif'; c.textAlign = 'left';
            c.fillText('\u{1F916} AI ' + (i + 1), rpX + 36, py + 6);
            c.fillStyle = '#FF9800'; c.font = '10px "Segoe UI", sans-serif'; c.textAlign = 'right';
            c.fillText('AI', rpX + rpW - 18, py + 6);
            py += 28;
        }

        // Empty slots
        const empty = 10 - 1 - lobbyPlayers.length - g._aiPlayers;
        if (empty > 0) {
            c.fillStyle = 'rgba(255,255,255,0.2)'; c.font = '10px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(empty + ' open slot' + (empty > 1 ? 's' : '') + ' for real players', rpX + rpW/2, py + 8);
            py += 22;
        }

        // Start Game button
        py += 5;
        const sgW = rpW - 20, sgH = 34, sgX = rpX + 10;
        const canStart = totalPlayers >= 2;
        const sgGr = c.createLinearGradient(sgX, py, sgX + sgW, py);
        if (canStart) {
            sgGr.addColorStop(0, '#43A047'); sgGr.addColorStop(1, '#2E7D32');
        } else {
            sgGr.addColorStop(0, '#546E7A'); sgGr.addColorStop(1, '#37474F');
        }
        c.beginPath(); c.roundRect(sgX, py, sgW, sgH, 8); c.fillStyle = sgGr; c.fill();
        c.strokeStyle = canStart ? '#66BB6A' : '#78909C'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(sgX, py, sgW, sgH, 8); c.stroke();
        c.fillStyle = canStart ? '#fff' : '#90A4AE'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'center';
        c.fillText('\u{25B6} START GAME  (' + totalPlayers + ' players)', sgX + sgW/2, py + sgH/2);
        g.btns.push({ label: 'startGame', fn: () => {
            if (canStart) {
                g._gameMode = 'online';
                g.state = 'difficulty';
                g._onlineAiCount = g._aiPlayers;
                g._onlineRealPlayers = lobbyPlayers;
                g.sfx.click();
            } else {
                g.sfx.error();
            }
        }});
        g.btns[g.btns.length - 1].rect = { x: sgX, y: py, w: sgW, h: sgH };

        // Online features (compact, below player list)
        py += 48;
        c.fillStyle = '#FFD54F'; c.font = 'bold 11px "Segoe UI", sans-serif'; c.textAlign = 'center';
        c.fillText('ONLINE EXCLUSIVE FEATURES', rpX + rpW/2, py);
        py += 16;

        const features = [
            ['\u{1F4AC} Chat', '\u{1F91D} Alliance', '\u{1F4E6} Trade'],
            ['\u{1F575} Spy', '\u{1F3AF} Diplomacy', '\u{1F3C6} Leaderboard'],
        ];
        for (const row of features) {
            let fx = rpX + 15;
            for (const feat of row) {
                c.fillStyle = 'rgba(30,136,229,0.08)';
                c.beginPath(); c.roundRect(fx, py, (rpW - 40) / 3, 22, 4); c.fill();
                c.fillStyle = '#90CAF9'; c.font = '10px "Segoe UI", sans-serif'; c.textAlign = 'center';
                c.fillText(feat, fx + (rpW - 40) / 6, py + 14);
                fx += (rpW - 40) / 3 + 5;
            }
            py += 28;
        }

        // Online vs Offline comparison at bottom
        const cmpY = rpY + rpH - 55;
        c.fillStyle = 'rgba(255,255,255,0.03)';
        c.beginPath(); c.roundRect(rpX + 10, cmpY, rpW - 20, 45, 6); c.fill();
        c.fillStyle = '#90CAF9'; c.font = 'bold 10px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText('OFFLINE: Single player vs AI  |  ONLINE: Real players + all features', rpX + rpW/2, cmpY + 15);
        c.fillStyle = 'rgba(255,255,255,0.3)'; c.font = '10px "Segoe UI", sans-serif';
        c.fillText('Online mode includes everything in Offline + 8 exclusive features', rpX + rpW/2, cmpY + 33);

        // ── LEADERBOARD PANEL (right side) ──
        const lbX = rpX + rpW + 20, lbY = 80, lbW = W - lbX - 20, lbH = H - 100;
        c.fillStyle = 'rgba(13,27,42,0.85)';
        c.beginPath(); c.roundRect(lbX, lbY, lbW, lbH, 10); c.fill();
        c.strokeStyle = 'rgba(255,215,0,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(lbX, lbY, lbW, lbH, 10); c.stroke();

        // Title
        c.fillStyle = '#FFD700'; c.font = 'bold 15px Georgia, serif'; c.textAlign = 'center';
        c.fillText('\uD83C\uDFC6 GLOBAL LEADERBOARD', lbX + lbW/2, lbY + 22);
        c.strokeStyle = 'rgba(255,215,0,0.2)'; c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(lbX + 15, lbY + 35); c.lineTo(lbX + lbW - 15, lbY + 35); c.stroke();

        // Leaderboard entries (sample data for now, server populates real data)
        const leaderboard = g.online?.leaderboard || [
            { rank: 1, name: 'Emperor_Khan', empire: 'mongol', wins: 142, score: 9850, medals: '\uD83E\uDD47' },
            { rank: 2, name: 'Caesar_Maximus', empire: 'roman', wins: 128, score: 9200, medals: '\uD83E\uDD48' },
            { rank: 3, name: 'SunTzu_Master', empire: 'maurya', wins: 115, score: 8700, medals: '\uD83E\uDD49' },
            { rank: 4, name: 'Viking_Raider', empire: 'napoleon', wins: 98, score: 7800, medals: '4' },
            { rank: 5, name: 'Pharaoh_Rex', empire: 'egypt', wins: 87, score: 7100, medals: '5' },
            { rank: 6, name: 'Samurai_Lord', empire: 'japan', wins: 76, score: 6500, medals: '6' },
            { rank: 7, name: 'Queen_Victoria', empire: 'british', wins: 65, score: 5900, medals: '7' },
            { rank: 8, name: 'Sultan_Osman', empire: 'ottoman', wins: 54, score: 5300, medals: '8' },
        ];

        let ly = lbY + 50;
        // Header
        c.fillStyle = 'rgba(255,215,0,0.1)';
        c.beginPath(); c.roundRect(lbX + 8, ly - 8, lbW - 16, 18, 4); c.fill();
        c.font = 'bold 9px "Segoe UI", sans-serif'; c.textAlign = 'left';
        c.fillStyle = '#FFD54F';
        c.fillText('#', lbX + 14, ly + 2);
        c.fillText('PLAYER', lbX + 35, ly + 2);
        c.fillText('WINS', lbX + lbW - 80, ly + 2);
        c.fillText('SCORE', lbX + lbW - 20, ly + 2);
        ly += 22;

        for (const entry of leaderboard) {
            const isTop3 = entry.rank <= 3;
            c.fillStyle = isTop3 ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.02)';
            c.beginPath(); c.roundRect(lbX + 8, ly - 6, lbW - 16, 22, 3); c.fill();

            // Rank
            c.font = 'bold 11px "Segoe UI", sans-serif';
            c.fillStyle = isTop3 ? '#FFD700' : '#78909C'; c.textAlign = 'left';
            c.fillText(entry.medals, lbX + 14, ly + 7);

            // Player name
            c.fillStyle = isTop3 ? '#FFF8E1' : '#B0BEC5'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(entry.name, lbX + 38, ly + 7);

            // Empire color dot
            const eColor = EMPIRES[entry.empire]?.color || '#888888';
            c.fillStyle = eColor;
            c.beginPath(); c.arc(lbX + 38 + c.measureText(entry.name).width + 8, ly + 4, 3, 0, Math.PI * 2); c.fill();

            // Wins
            c.fillStyle = '#90CAF9'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(entry.wins + '', lbX + lbW - 80, ly + 7);

            // Score
            c.fillStyle = '#FFD54F'; c.font = 'bold 10px "Segoe UI", sans-serif';
            c.fillText(entry.score.toLocaleString(), lbX + lbW - 20, ly + 7);

            ly += 26;
        }

        // ── ACHIEVEMENTS PANEL (bottom of lobby) ──
        const achY = rpY + rpH + 15, achW = W - 40, achH = 65;
        c.fillStyle = 'rgba(13,27,42,0.85)';
        c.beginPath(); c.roundRect(20, achY, achW, achH, 8); c.fill();
        c.strokeStyle = 'rgba(171,71,188,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(20, achY, achW, achH, 8); c.stroke();

        c.fillStyle = '#AB47BC'; c.font = 'bold 12px Georgia, serif'; c.textAlign = 'left';
        c.fillText('\uD83C\uDF1F ACHIEVEMENTS', 35, achY + 16);

        const achievements = [
            { icon: '\uD83C\uDF1F', name: 'First Conquest', done: true },
            { icon: '\uD83D\uDCA5', name: '10 Battles Won', done: true },
            { icon: '\uD83C\uDFC6', name: 'World Conqueror', done: false },
            { icon: '\uD83E\uDD1D', name: 'Master Alliance', done: false },
            { icon: '\uD83D\uDD75\uFE0F', name: 'Master Spy', done: false },
            { icon: '\uD83C\uDFAF', name: 'Diplomat', done: false },
        ];
        let ax = 35;
        for (const ach of achievements) {
            const aW = 110, aH = 30;
            c.fillStyle = ach.done ? 'rgba(171,71,188,0.15)' : 'rgba(255,255,255,0.03)';
            c.beginPath(); c.roundRect(ax, achY + 28, aW, aH, 5); c.fill();
            if (ach.done) { c.strokeStyle = '#AB47BC'; c.lineWidth = 0.5; c.beginPath(); c.roundRect(ax, achY + 28, aW, aH, 5); c.stroke(); }
            c.font = '14px serif'; c.textAlign = 'left';
            c.fillStyle = ach.done ? '#CE93D8' : 'rgba(255,255,255,0.15)';
            c.fillText(ach.icon, ax + 5, achY + 48);
            c.font = '9px "Segoe UI", sans-serif';
            c.fillStyle = ach.done ? '#E1BEE7' : 'rgba(255,255,255,0.2)';
            c.fillText(ach.name, ax + 24, achY + 48);
            ax += aW + 8;
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
        this._drawFogOfWar();
        this._drawParticles();
        this._drawAmbientEffects();
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
                const soldierCount = Math.min(Math.floor(s.troops / 2), 5);
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const dirX = dx / dist, dirY = dy / dist;
                // Perpendicular direction for formation spread
                const perpX = -dirY, perpY = dirX;

                for (let i = 0; i < soldierCount; i++) {
                    const speed = 0.006 + i * 0.002;
                    const offset = (this.time * speed + i * 0.2 + t.id * 0.17) % 1;
                    // Formation offset (soldiers march in a line)
                    const formOffset = (i - (soldierCount - 1) / 2) * 8;
                    const sx = p1.x + dx * offset + perpX * formOffset;
                    const sy = p1.y + dy * offset + perpY * formOffset;
                    // Running bounce animation
                    const runCycle = Math.sin(this.time * 0.18 + i * 1.8 + t.id) * 3;
                    const leanForward = 2; // lean in direction of movement
                    const sz = Math.max(7, 9 * this.scale);

                    // Dust trail behind soldier
                    if (offset > 0.1) {
                        const dustAlpha = 0.15 * (1 - offset);
                        c.fillStyle = `rgba(180,160,120,${dustAlpha})`;
                        for (let d = 0; d < 3; d++) {
                            const dustX = sx - dirX * (8 + d * 6) + (Math.sin(this.time * 0.1 + d + i) * 3);
                            const dustY = sy - dirY * (8 + d * 6) + runCycle * 0.5 + (Math.cos(this.time * 0.08 + d) * 2);
                            c.beginPath();
                            c.arc(dustX, dustY, 1.5 + d * 0.5, 0, Math.PI * 2);
                            c.fill();
                        }
                    }

                    // Shadow
                    c.fillStyle = 'rgba(180,140,80,0.18)';
                    c.beginPath();
                    c.ellipse(sx, sy + sz * 1.1, sz * 0.5, sz * 0.15, 0, 0, Math.PI * 2);
                    c.fill();

                    // Legs with running animation
                    const legSwing = Math.sin(this.time * 0.2 + i * 1.5 + t.id) * 6;
                    c.fillStyle = em.dark + 'bb';
                    c.save();
                    c.translate(sx, sy + runCycle * 0.5);
                    // Left leg
                    c.fillRect(-sz * 0.25 + legSwing * 0.3, sz * 0.1, sz * 0.2, sz * 0.55);
                    // Right leg
                    c.fillRect(sz * 0.05 - legSwing * 0.3, sz * 0.1, sz * 0.2, sz * 0.55);

                    // Body with armor gradient
                    const bodyGr = c.createLinearGradient(-sz * 0.4, -sz * 0.5, sz * 0.4, sz * 0.2);
                    bodyGr.addColorStop(0, em.light);
                    bodyGr.addColorStop(1, em.dark);
                    c.fillStyle = bodyGr;
                    c.fillRect(-sz * 0.4, -sz * 0.5, sz * 0.8, sz * 0.7);

                    // Tactical belt
                    c.fillStyle = '#2a2a20';
                    c.fillRect(-sz * 0.4, -sz * 0.0, sz * 0.8, sz * 0.12);

                    // Tactical backpack
                    c.fillStyle = em.dark || '#444';
                    c.beginPath();
                    c.roundRect(-sz * 0.45, -sz * 0.25, sz * 0.2, sz * 0.4, 2);
                    c.fill();

                    // Head with modern helmet
                    c.fillStyle = g.camo || '#555';
                    c.beginPath();
                    c.arc(0, -sz * 0.8, sz * 0.32, 0, Math.PI * 2);
                    c.fill();
                    // Helmet rim
                    c.fillStyle = 'rgba(40,40,35,0.8)';
                    c.beginPath();
                    c.arc(0, -sz * 0.78, sz * 0.35, Math.PI, 0);
                    c.lineTo(sz * 0.35, -sz * 0.7);
                    c.lineTo(-sz * 0.35, -sz * 0.7);
                    c.closePath(); c.fill();
                    // Goggles
                    c.fillStyle = 'rgba(30,40,50,0.5)';
                    c.fillRect(-sz * 0.15, -sz * 0.82, sz * 0.3, sz * 0.08);

                    // Rifle (carried while running)
                    c.fillStyle = '#2a2a2a';
                    c.save();
                    c.translate(sz * 0.25, -sz * 0.15);
                    c.rotate(-0.15);
                    c.fillRect(-sz * 0.1, -sz * 0.08, sz * 1.2, sz * 0.12);
                    // Barrel
                    c.fillStyle = '#1a1a1a';
                    c.fillRect(sz * 1.0, -sz * 0.06, sz * 0.6, sz * 0.06);
                    // Magazine
                    c.fillStyle = '#333';
                    c.fillRect(sz * 0.2, sz * 0.04, sz * 0.12, sz * 0.2);
                    c.restore();

                    c.restore();
                }
            }
        }
    }

    // ── COMBAT ANIMATION (soldiers march & fight) ─────────────
    startCombatAnim(fromTid, toTid, atkEmpire, defEmpire, conquered) {
        const p1 = this.toScr(T(fromTid).cx, T(fromTid).cy);
        const p2 = this.toScr(T(toTid).cx, T(toTid).cy);
        const atkColor = EMPIRES[atkEmpire].color;
        const defColor = defEmpire ? EMPIRES[defEmpire].color : '#888888';
        // Generate soldier positions for march phase
        const atkSoldiers = [];
        for (let i = 0; i < 6; i++) {
            atkSoldiers.push({
                offsetX: (Math.random() - 0.5) * 30,
                offsetY: (Math.random() - 0.5) * 20,
                phase: Math.random() * Math.PI * 2,
                speed: 0.7 + Math.random() * 0.6,
                alive: true,
                retreatStart: 40 + Math.random() * 30,
            });
        }
        const defSoldiers = [];
        for (let i = 0; i < 5; i++) {
            defSoldiers.push({
                offsetX: (Math.random() - 0.5) * 30,
                offsetY: (Math.random() - 0.5) * 20,
                phase: Math.random() * Math.PI * 2,
                speed: 0.7 + Math.random() * 0.6,
                alive: true,
                retreatStart: 50 + Math.random() * 25,
            });
        }
        this.combatAnim = {
            fromTid, toTid, atkEmpire, defEmpire, conquered,
            p1, p2, atkColor, defColor,
            atkSoldiers, defSoldiers,
            sparks: [],
            timer: 0,
            phase: 'march', // march -> clash -> result
            clashTimer: 0,
            maxMarchFrames: 40,
            maxClashFrames: 50,
        };
    }

    _drawCombatAnim() {
        const c = this.ctx, a = this.combatAnim;
        if (!a) return;
        a.timer++;

        // Initialize particles if not present
        if (!a.particles) a.particles = [];
        if (!a.dustClouds) a.dustClouds = [];
        if (!a.shockwaves) a.shockwaves = [];

        if (a.phase === 'march') {
            // ═══════════════════════════════════════════════════
            // PHASE 1: EPIC MARCH — Dramatic approach with drums
            // ═══════════════════════════════════════════════════
            const progress = Math.min(a.timer / a.maxMarchFrames, 1);
            const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            // March dust trail
            if (a.timer % 6 === 0 && progress > 0.1) {
                for (let i = 0; i < 3; i++) {
                    const dustX = a.p1.x + (a.p2.x - a.p1.x) * ease * (0.3 + Math.random() * 0.2);
                    const dustY = a.p1.y + (a.p2.y - a.p1.y) * ease * (0.3 + Math.random() * 0.2);
                    a.dustClouds.push({
                        x: dustX + (Math.random() - 0.5) * 30,
                        y: dustY + (Math.random() - 0.5) * 20,
                        size: 8 + Math.random() * 12,
                        life: 40 + Math.random() * 20,
                        maxLife: 60,
                        alpha: 0.15 + Math.random() * 0.1,
                    });
                }
            }

            // Draw dust clouds
            for (let i = a.dustClouds.length - 1; i >= 0; i--) {
                const d = a.dustClouds[i];
                d.size += 0.5; d.y -= 0.3; d.x += (Math.random() - 0.5) * 0.5; d.life--;
                if (d.life <= 0) { a.dustClouds.splice(i, 1); continue; }
                const fade = d.life / d.maxLife;
                c.fillStyle = `rgba(180,160,120,${d.alpha * fade})`;
                c.beginPath(); c.arc(d.x, d.y, d.size, 0, Math.PI * 2); c.fill();
            }

            // March line — animated dashes with glow
            c.save();
            c.strokeStyle = a.atkColor + '80';
            c.lineWidth = 3;
            c.shadowColor = a.atkColor; c.shadowBlur = 6;
            c.setLineDash([10, 8]);
            c.lineDashOffset = -a.timer * 2;
            c.beginPath();
            c.moveTo(a.p1.x, a.p1.y);
            const midX = a.p1.x + (a.p2.x - a.p1.x) * ease;
            const midY = a.p1.y + (a.p2.y - a.p1.y) * ease;
            c.lineTo(midX, midY);
            c.stroke();
            c.setLineDash([]);
            c.restore();

            // Arrow head at march front
            const angle = Math.atan2(a.p2.y - a.p1.y, a.p2.x - a.p1.x);
            c.save();
            c.translate(midX, midY);
            c.rotate(angle);
            c.fillStyle = a.atkColor;
            c.beginPath();
            c.moveTo(12, 0); c.lineTo(-6, -8); c.lineTo(-6, 8);
            c.closePath(); c.fill();
            c.restore();

            // Marching attacker soldiers — with formation (facing toward target)
            for (let si = 0; si < a.atkSoldiers.length; si++) {
                const s = a.atkSoldiers[si];
                if (!s.alive) continue;
                const marchEase = Math.max(0, Math.min(1, (ease - si * 0.03) / 0.7));
                const sx = a.p1.x + (a.p2.x - a.p1.x) * marchEase * s.speed + s.offsetX * (1 - marchEase);
                const sy = a.p1.y + (a.p2.y - a.p1.y) * marchEase * s.speed + s.offsetY * (1 - marchEase);
                const bob = Math.sin(a.timer * 0.18 + s.phase) * 3;
                this._drawSoldier(c, sx, sy + bob, a.atkColor, true, a.timer, s.phase, a.atkEmpire);
            }

            // Defender soldiers waiting — flipped to face the oncoming attackers
            for (const s of a.defSoldiers) {
                if (!s.alive) continue;
                const sx = a.p2.x + s.offsetX;
                const sy = a.p2.y + s.offsetY;
                const bob = Math.sin(a.timer * 0.08 + s.phase) * 1.5;
                c.save();
                c.translate(sx, sy + bob);
                c.scale(-1, 1);
                c.translate(-sx, -(sy + bob));
                this._drawSoldier(c, sx, sy + bob, a.defColor, false, a.timer, s.phase, a.defEmpire);
                c.restore();
            }

            // Dramatic "ATTACKING!" banner
            c.save();
            const bannerAlpha = Math.min(1, progress * 3);
            c.globalAlpha = bannerAlpha;
            const txtX = (a.p1.x + a.p2.x) / 2, txtY = (a.p1.y + a.p2.y) / 2 - 35;
            // Banner background
            c.fillStyle = 'rgba(20,10,5,0.7)';
            const bw = 180, bh = 30;
            this._rr(c, txtX - bw / 2, txtY - bh / 2, bw, bh, 6); c.fill();
            c.strokeStyle = a.atkColor + '80'; c.lineWidth = 1;
            this._rr(c, txtX - bw / 2, txtY - bh / 2, bw, bh, 6); c.stroke();
            // Text
            c.shadowColor = a.atkColor; c.shadowBlur = 10;
            c.fillStyle = a.atkColor;
            c.font = 'bold 20px Georgia, serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('\U0001F3AF FIREFIGHT \U0001F3AF', txtX, txtY);
            c.restore();

            // Tension meter — builds up as troops approach
            const tension = progress;
            const meterW = 120, meterH = 6;
            const meterX = this.g.W - meterW - 20, meterY = 80;
            c.fillStyle = 'rgba(0,0,0,0.5)';
            this._rr(c, meterX - 2, meterY - 2, meterW + 4, meterH + 4, 3); c.fill();
            const tensGr = c.createLinearGradient(meterX, 0, meterX + meterW, 0);
            tensGr.addColorStop(0, '#27ae60'); tensGr.addColorStop(0.5, '#f39c12'); tensGr.addColorStop(1, '#e74c3c');
            c.fillStyle = tensGr;
            this._rr(c, meterX, meterY, meterW * tension, meterH, 2); c.fill();
            c.fillStyle = '#f5e6c8'; c.font = '9px "Segoe UI", sans-serif';
            c.textAlign = 'right';
            c.fillText('TENSION', meterX - 6, meterY + 5);

            if (a.timer >= a.maxMarchFrames) {
                a.phase = 'clash';
                a.clashTimer = 0;
                // Trigger screen shake
                this.shake = 15;
                // Initial shockwave
                a.shockwaves.push({ x: a.p2.x, y: a.p2.y, radius: 5, maxRadius: 80, alpha: 0.6 });
                // Burst of particles at impact
                for (let i = 0; i < 20; i++) {
                    a.particles.push({
                        x: a.p2.x, y: a.p2.y,
                        vx: (Math.random() - 0.5) * 12,
                        vy: (Math.random() - 0.5) * 8 - 3,
                        life: 30 + Math.random() * 30,
                        maxLife: 60,
                        color: ['#ffd700', '#ff6b35', '#ff4444', '#ffaa00'][Math.floor(Math.random() * 4)],
                        size: 2 + Math.random() * 5,
                        type: 'spark',
                    });
                }
            }

        } else if (a.phase === 'clash') {
            // ═══════════════════════════════════════════════════
            // PHASE 2: EPIC CLASH — Full battle with particles
            // ═══════════════════════════════════════════════════
            a.clashTimer++;
            const clashProgress = a.clashTimer / a.maxClashFrames;

            // Dramatic impact flash
            if (a.clashTimer < 20) {
                const flashAlpha = 0.4 * (1 - a.clashTimer / 20);
                c.fillStyle = `rgba(255,200,100,${flashAlpha})`;
                c.fillRect(0, 0, this.g.W, this.g.H);
            }

            // Vignette during combat (dramatic focus)
            const vigGr = c.createRadialGradient(this.g.W / 2, this.g.H / 2, this.g.W * 0.25, this.g.W / 2, this.g.H / 2, this.g.W * 0.6);
            vigGr.addColorStop(0, 'rgba(0,0,0,0)');
            vigGr.addColorStop(1, `rgba(80,0,0,${0.2 + Math.sin(a.clashTimer * 0.1) * 0.1})`);
            c.fillStyle = vigGr; c.fillRect(0, 0, this.g.W, this.g.H);

            // Shockwaves
            for (let i = a.shockwaves.length - 1; i >= 0; i--) {
                const sw = a.shockwaves[i];
                sw.radius += 3; sw.alpha -= 0.02;
                if (sw.alpha <= 0) { a.shockwaves.splice(i, 1); continue; }
                c.strokeStyle = `rgba(255,200,100,${sw.alpha})`;
                c.lineWidth = 3;
                c.beginPath(); c.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2); c.stroke();
            }

            // Periodic shockwaves during clash
            if (a.clashTimer % 30 === 15) {
                a.shockwaves.push({ x: a.p2.x, y: a.p2.y, radius: 5, maxRadius: 50, alpha: 0.3 });
                this.shake = Math.max(this.shake, 5);
            }

            // Continuous spark/blood particle spawning
            if (a.clashTimer % 3 === 0) {
                const count = clashProgress > 0.5 ? 8 : 4;
                for (let i = 0; i < count; i++) {
                    const isBlood = Math.random() > 0.6;
                    a.particles.push({
                        x: a.p2.x + (Math.random() - 0.5) * 50,
                        y: a.p2.y + (Math.random() - 0.5) * 30,
                        vx: (Math.random() - 0.5) * 10,
                        vy: (Math.random() - 0.5) * 6 - 2,
                        life: 20 + Math.random() * 25,
                        maxLife: 45,
                        color: isBlood ? '#cc0000' : ['#ffd700', '#ff6b35', '#ffaa00'][Math.floor(Math.random() * 3)],
                        size: isBlood ? 1 + Math.random() * 2 : 2 + Math.random() * 4,
                        type: isBlood ? 'blood' : 'spark',
                    });
                }
            }

            // Smoke during battle
            if (a.clashTimer % 10 === 0) {
                a.dustClouds.push({
                    x: a.p2.x + (Math.random() - 0.5) * 40,
                    y: a.p2.y + (Math.random() - 0.5) * 20,
                    size: 10 + Math.random() * 15,
                    life: 50 + Math.random() * 30,
                    maxLife: 80,
                    alpha: 0.08 + Math.random() * 0.06,
                });
            }

            // Particles are drawn below (after muzzle flash / tracer spawning)
            c.globalAlpha = 1;

            // Draw dust/smoke clouds
            for (let i = a.dustClouds.length - 1; i >= 0; i--) {
                const d = a.dustClouds[i];
                d.size += 0.4; d.y -= 0.2; d.x += (Math.random() - 0.5) * 0.3; d.life--;
                if (d.life <= 0) { a.dustClouds.splice(i, 1); continue; }
                const fade = d.life / d.maxLife;
                c.fillStyle = `rgba(160,140,100,${d.alpha * fade})`;
                c.beginPath(); c.arc(d.x, d.y, d.size, 0, Math.PI * 2); c.fill();
            }

            // ── Muzzle flash and bullet tracers (gunfire visuals) ──
            if (a.clashTimer % 5 === 0) {
                // Spawn muzzle flash particles from random soldiers
                for (let side = 0; side < 2; side++) {
                    const soldiers = side === 0 ? a.atkSoldiers : a.defSoldiers;
                    const alive = soldiers.filter(s => s.alive);
                    if (alive.length === 0) continue;
                    const shooter = alive[Math.floor(Math.random() * alive.length)];
                    const ox = side === 0 ? 8 : -8;
                    // Muzzle flash
                    a.particles.push({
                        x: a.p2.x + shooter.offsetX + ox,
                        y: a.p2.y + shooter.offsetY - 5,
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2 - 1,
                        life: 4 + Math.random() * 4,
                        maxLife: 8,
                        color: ['#ffff80', '#ffcc00', '#ff8800'][Math.floor(Math.random() * 3)],
                        size: 4 + Math.random() * 5,
                        type: 'muzzle',
                    });
                    // Bullet tracer
                    const dir = side === 0 ? 1 : -1;
                    a.particles.push({
                        x: a.p2.x + shooter.offsetX + ox,
                        y: a.p2.y + shooter.offsetY - 5,
                        vx: dir * (15 + Math.random() * 10),
                        vy: (Math.random() - 0.5) * 3,
                        life: 6 + Math.random() * 4,
                        maxLife: 10,
                        color: '#ffee88',
                        size: 1.5,
                        type: 'tracer',
                    });
                }
            }

            // Draw particles with special handling for muzzle flash and tracers
            for (let i = a.particles.length - 1; i >= 0; i--) {
                const p = a.particles[i];
                p.x += p.vx; p.y += p.vy;
                p.life--;
                if (p.type === 'tracer') {
                    p.vy += 0.05; // slight gravity
                } else if (p.type === 'muzzle') {
                    p.vx *= 0.8; p.vy *= 0.8; // decelerate fast
                    p.size *= 0.85; // shrink fast
                } else {
                    p.vy += 0.15; // gravity for sparks/blood
                }
                if (p.life <= 0) { a.particles.splice(i, 1); continue; }
                const fade = Math.min(1, p.life / (p.maxLife * 0.4));
                c.save();
                c.globalAlpha = fade;
                if (p.type === 'tracer') {
                    // Tracer: bright line
                    c.strokeStyle = p.color;
                    c.lineWidth = p.size;
                    c.lineCap = 'round';
                    c.beginPath();
                    c.moveTo(p.x, p.y);
                    c.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
                    c.stroke();
                    // Tracer glow
                    c.shadowColor = '#ffcc00';
                    c.shadowBlur = 6;
                    c.strokeStyle = '#fff';
                    c.lineWidth = p.size * 0.5;
                    c.beginPath();
                    c.moveTo(p.x, p.y);
                    c.lineTo(p.x - p.vx * 0.8, p.y - p.vy * 0.8);
                    c.stroke();
                } else if (p.type === 'muzzle') {
                    // Muzzle flash: bright radial glow
                    const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                    gr.addColorStop(0, '#ffffff');
                    gr.addColorStop(0.3, p.color);
                    gr.addColorStop(1, 'transparent');
                    c.fillStyle = gr;
                    c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
                } else if (p.type === 'spark') {
                    c.fillStyle = p.color;
                    c.beginPath(); c.arc(p.x, p.y, p.size * fade, 0, Math.PI * 2); c.fill();
                } else if (p.type === 'blood') {
                    c.fillStyle = p.color;
                    c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
                }
                c.restore();
            }
            c.globalAlpha = 1;

            // Attacking soldiers — chaotic firefight
            for (const s of a.atkSoldiers) {
                if (!s.alive) continue;
                const sx = a.p2.x + s.offsetX + Math.sin(a.clashTimer * 0.25 + s.phase) * 10;
                const sy = a.p2.y + s.offsetY + Math.sin(a.clashTimer * 0.35 + s.phase) * 5;
                const swinging = Math.sin(a.clashTimer * 0.3 + s.phase) > 0;
                this._drawSoldier(c, sx, sy, a.atkColor, swinging, a.timer, s.phase, a.atkEmpire);
            }

            // Defender soldiers fighting back (flipped to face attackers head-on)
            for (const s of a.defSoldiers) {
                if (!s.alive) continue;
                const sx = a.p2.x + s.offsetX - 18 + Math.sin(a.clashTimer * 0.22 + s.phase) * 8;
                const sy = a.p2.y + s.offsetY + Math.cos(a.clashTimer * 0.28 + s.phase) * 5;
                const swinging = Math.sin(a.clashTimer * 0.26 + s.phase + 1) > 0;
                c.save();
                c.translate(sx, sy);
                c.scale(-1, 1);
                c.translate(-sx, -sy);
                this._drawSoldier(c, sx, sy, a.defColor, swinging, a.timer, s.phase, a.defEmpire);
                c.restore();
            }

            // "CLASH!" text with dramatic shake
            c.save();
            c.shadowColor = '#ff4444'; c.shadowBlur = 20;
            c.fillStyle = '#ff4444';
            c.font = 'bold 30px Georgia, serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            const shakeX = (Math.random() - 0.5) * 6;
            const shakeY = (Math.random() - 0.5) * 6;
            c.fillText('\U0001F525 FIREFIGHT! \U0001F525', a.p2.x + shakeX, a.p2.y - 45 + shakeY);
            c.restore();

            // Damage numbers floating up
            if (!a.damageNums) a.damageNums = [];
            if (a.clashTimer % 15 === 5 && a.damageNums.length < 12) {
                a.damageNums.push({
                    x: a.p2.x + (Math.random() - 0.5) * 40,
                    y: a.p2.y - 10,
                    vy: -1.5,
                    text: '-' + (1 + Math.floor(Math.random() * 3)),
                    color: '#ff4444',
                    life: 40,
                });
            }
            for (let i = a.damageNums.length - 1; i >= 0; i--) {
                const dn = a.damageNums[i];
                dn.y += dn.vy; dn.life--;
                if (dn.life <= 0) { a.damageNums.splice(i, 1); continue; }
                c.save();
                c.globalAlpha = Math.min(1, dn.life / 20);
                c.fillStyle = dn.color;
                c.font = 'bold 14px Georgia, serif';
                c.textAlign = 'center';
                c.fillText(dn.text, dn.x, dn.y);
                c.restore();
            }

            // Show conquered or repulsed — CINEMATIC REVEAL
            if (clashProgress > 0.65) {
                const fadeIn = Math.min(1, (clashProgress - 0.65) / 0.2);
                c.save();
                c.globalAlpha = fadeIn;

                // Full-screen overlay
                c.fillStyle = a.conquered ? 'rgba(0,20,0,0.3)' : 'rgba(30,0,0,0.3)';
                c.fillRect(0, 0, this.g.W, this.g.H);

                // Result text with glow
                c.shadowColor = a.conquered ? '#ffd700' : '#ff4444';
                c.shadowBlur = 30;
                c.fillStyle = a.conquered ? '#ffd700' : '#ff4444';
                c.font = 'bold 42px Georgia, serif';
                c.textAlign = 'center'; c.textBaseline = 'middle';

                const resultText = a.conquered ? '\uD83C\uDFC6 TERRITORY CONQUERED!' : '\uD83D\uDEAB ATTACK REPULSED!';
                c.fillText(resultText, this.g.W / 2, this.g.H / 2 - 15);

                // Subtitle
                c.shadowBlur = 10;
                c.font = '18px Georgia, serif';
                c.fillStyle = a.conquered ? '#90ee90' : '#ff9999';
                c.fillText(a.conquered ? 'Your empire grows stronger!' : 'Regroup and try again.', this.g.W / 2, this.g.H / 2 + 25);

                c.restore();
            }

            if (a.clashTimer >= a.maxClashFrames) {
                a.phase = 'done';
                this.g.state = 'battle';
            }
        }
    }

    _drawSoldier(c, x, y, color, swinging, time, phase, empireId, szOverride) {
        const sz = szOverride || 12;
        // Modern military gear per empire — each has distinct camo + accent
        const GEAR = {
            maurya:  { camo:'#3a5a2a', dark:'#2a4a1a', vest:'#4a4a3a', helmet:'#3a5a2a', boots:'#2a3a1a', gloves:'#3a3a2a', accent:'#ffd700', visor:'#1a3a2a', weapon:'rifle' },
            roman:   { camo:'#4a5a4a', dark:'#3a4a3a', vest:'#5a5a4a', helmet:'#4a5a4a', boots:'#2a2a20', gloves:'#4a4a3a', accent:'#cc3333', visor:'#1a2a1a', weapon:'rifle' },
            mongol:  { camo:'#6a6a5a', dark:'#5a5a4a', vest:'#7a7a6a', helmet:'#6a6a5a', boots:'#3a3a2a', gloves:'#5a5a4a', accent:'#c0c0c0', visor:'#2a2a1a', weapon:'rifle' },
            ottoman: { camo:'#3a5a5a', dark:'#2a4a4a', vest:'#4a6a6a', helmet:'#3a5a5a', boots:'#1a3a3a', gloves:'#3a4a4a', accent:'#cc0000', visor:'#1a3a3a', weapon:'rifle' },
            british: { camo:'#5a6a5a', dark:'#4a5a4a', vest:'#6a7a6a', helmet:'#5a6a5a', boots:'#2a2a1a', gloves:'#4a5a4a', accent:'#cc0000', visor:'#2a3a2a', weapon:'rifle' },
            napoleon:{ camo:'#4a5a6a', dark:'#3a4a5a', vest:'#5a6a7a', helmet:'#4a5a6a', boots:'#2a2a3a', gloves:'#4a5a6a', accent:'#ffd700', visor:'#1a2a3a', weapon:'rifle' },
            japan:   { camo:'#5a5a4a', dark:'#4a4a3a', vest:'#6a6a5a', helmet:'#5a5a4a', boots:'#2a2a1a', gloves:'#4a4a3a', accent:'#ff0000', visor:'#1a2a1a', weapon:'rifle' },
            germany: { camo:'#4a4a3a', dark:'#3a3a2a', vest:'#5a5a4a', helmet:'#3a3a2a', boots:'#1a1a10', gloves:'#3a3a2a', accent:'#cc0000', visor:'#1a1a10', weapon:'rifle' },
            russia:  { camo:'#5a5a3a', dark:'#4a4a2a', vest:'#6a6a4a', helmet:'#4a4a2a', boots:'#2a2a10', gloves:'#4a4a2a', accent:'#cc0000', visor:'#2a2a10', weapon:'rifle' },
            egypt:   { camo:'#7a6a4a', dark:'#6a5a3a', vest:'#8a7a5a', helmet:'#7a6a4a', boots:'#3a2a10', gloves:'#5a4a2a', accent:'#ffd700', visor:'#3a2a10', weapon:'rifle' },
        };
        const g = GEAR[empireId] || { camo: color, dark: '#333', vest: '#444', helmet: '#3a5a2a', boots: '#222', gloves: '#333', accent: '#ffd700', visor: '#1a1a1a', weapon: 'rifle' };
        const lp = Math.sin(time * 0.15 + phase) * 2;

        // ── Shadow ──
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.beginPath();
        c.ellipse(x, y + sz * 1.4, sz * 0.7, sz * 0.2, 0, 0, Math.PI * 2);
        c.fill();

        // ── Tactical backpack ──
        c.fillStyle = g.dark;
        c.beginPath();
        c.roundRect(x - sz * 0.15, y - sz * 0.55, sz * 0.35, sz * 0.8, 2);
        c.fill();
        // Backpack straps
        c.strokeStyle = g.camo; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x - sz * 0.05, y - sz * 0.65); c.lineTo(x - sz * 0.1, y - sz * 0.4); c.stroke();
        c.beginPath(); c.moveTo(x + sz * 0.15, y - sz * 0.65); c.lineTo(x + sz * 0.2, y - sz * 0.4); c.stroke();

        // ── Legs with tactical pants ──
        c.fillStyle = g.camo;
        // Left leg
        c.beginPath();
        c.moveTo(x - sz * 0.25 + lp, y + sz * 0.15);
        c.lineTo(x - sz * 0.28 + lp, y + sz * 0.85);
        c.lineTo(x - sz * 0.08 + lp, y + sz * 0.85);
        c.lineTo(x - sz * 0.05 + lp, y + sz * 0.15);
        c.closePath(); c.fill();
        // Right leg
        c.beginPath();
        c.moveTo(x + sz * 0.05 - lp, y + sz * 0.15);
        c.lineTo(x + sz * 0.08 - lp, y + sz * 0.85);
        c.lineTo(x + sz * 0.28 - lp, y + sz * 0.85);
        c.lineTo(x + sz * 0.25 - lp, y + sz * 0.15);
        c.closePath(); c.fill();
        // Knee pads
        c.fillStyle = g.vest;
        c.beginPath(); c.ellipse(x - sz * 0.18 + lp, y + sz * 0.55, sz * 0.08, sz * 0.06, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(x + sz * 0.18 - lp, y + sz * 0.55, sz * 0.08, sz * 0.06, 0, 0, Math.PI * 2); c.fill();

        // ── Combat boots ──
        c.fillStyle = g.boots;
        c.beginPath();
        c.roundRect(x - sz * 0.32 + lp, y + sz * 0.78, sz * 0.28, sz * 0.18, [0, 0, 3, 3]);
        c.fill();
        c.beginPath();
        c.roundRect(x + sz * 0.04 - lp, y + sz * 0.78, sz * 0.28, sz * 0.18, [0, 0, 3, 3]);
        c.fill();
        // Boot soles
        c.fillStyle = '#111';
        c.fillRect(x - sz * 0.32 + lp, y + sz * 0.92, sz * 0.3, sz * 0.04);
        c.fillRect(x + sz * 0.04 - lp, y + sz * 0.92, sz * 0.3, sz * 0.04);

        // ── Body — tactical plate carrier vest ──
        const bodyGr = c.createLinearGradient(x - sz * 0.5, y - sz * 0.75, x + sz * 0.5, y + sz * 0.2);
        bodyGr.addColorStop(0, g.vest);
        bodyGr.addColorStop(0.4, g.camo);
        bodyGr.addColorStop(0.8, g.camo);
        bodyGr.addColorStop(1, g.dark);
        c.fillStyle = bodyGr;
        c.beginPath();
        c.roundRect(x - sz * 0.45, y - sz * 0.7, sz * 0.9, sz * 0.9, 3);
        c.fill();
        // Plate carrier outline
        c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.8;
        c.stroke();
        // Front plate pocket
        c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 0.5;
        c.strokeRect(x - sz * 0.3, y - sz * 0.55, sz * 0.6, sz * 0.5);
        // MOLLE webbing lines
        c.strokeStyle = 'rgba(0,0,0,0.1)'; c.lineWidth = 0.4;
        for (let i = 0; i < 5; i++) {
            c.beginPath(); c.moveTo(x - sz * 0.3, y - sz * 0.45 + i * sz * 0.1);
            c.lineTo(x + sz * 0.3, y - sz * 0.45 + i * sz * 0.1); c.stroke();
        }
        // Empire accent patch on chest
        c.fillStyle = g.accent;
        c.globalAlpha = 0.7;
        c.beginPath();
        c.roundRect(x + sz * 0.15, y - sz * 0.5, sz * 0.15, sz * 0.12, 1);
        c.fill();
        c.globalAlpha = 1;
        // Pouches on vest
        c.fillStyle = g.dark;
        c.fillRect(x - sz * 0.35, y - sz * 0.1, sz * 0.12, sz * 0.15);
        c.fillRect(x + sz * 0.23, y - sz * 0.1, sz * 0.12, sz * 0.15);
        // Admin pouch top left
        c.fillRect(x - sz * 0.35, y - sz * 0.55, sz * 0.2, sz * 0.12);

        // ── Tactical belt with pouches ──
        c.fillStyle = '#2a2a20';
        c.fillRect(x - sz * 0.5, y + sz * 0.02, sz, sz * 0.14);
        // Magazine pouches
        c.fillStyle = g.dark;
        c.fillRect(x + sz * 0.05, y - sz * 0.02, sz * 0.1, sz * 0.16);
        c.fillRect(x + sz * 0.18, y - sz * 0.02, sz * 0.1, sz * 0.16);
        // Belt buckle
        c.fillStyle = '#888';
        c.fillRect(x - sz * 0.04, y + sz * 0.02, sz * 0.08, sz * 0.08);

        // ── Neck (balaclava / collar) ──
        c.fillStyle = g.dark;
        c.beginPath();
        c.roundRect(x - sz * 0.12, y - sz * 0.88, sz * 0.24, sz * 0.22, 2);
        c.fill();

        // ── Head with balaclava ──
        c.fillStyle = g.camo;
        c.beginPath(); c.arc(x, y - sz * 1.05, sz * 0.32, 0, Math.PI * 2); c.fill();

        // ── Modern helmet (FAST / MICH type) ──
        c.fillStyle = g.helmet;
        c.beginPath(); c.arc(x, y - sz * 1.12, sz * 0.35, Math.PI, 0); c.fill();
        // Helmet rim
        c.fillStyle = g.dark;
        c.fillRect(x - sz * 0.38, y - sz * 1.12, sz * 0.76, sz * 0.06);
        // NVG mount on front
        c.fillStyle = '#333';
        c.fillRect(x - sz * 0.08, y - sz * 1.3, sz * 0.16, sz * 0.1);
        // NVG (small rectangle on mount)
        c.fillStyle = '#555';
        c.fillRect(x - sz * 0.06, y - sz * 1.22, sz * 0.12, sz * 0.06);
        // Helmet velcro patch (empire accent)
        c.fillStyle = g.accent;
        c.globalAlpha = 0.6;
        c.fillRect(x + sz * 0.1, y - sz * 1.3, sz * 0.1, sz * 0.08);
        c.globalAlpha = 1;

        // ── Eyes (visible through balaclava slit) ──
        c.fillStyle = '#1a1a1a';
        c.beginPath();
        c.roundRect(x - sz * 0.18, y - sz * 1.1, sz * 0.36, sz * 0.08, 2);
        c.fill();
        // Eye whites
        c.fillStyle = '#f0f0e8';
        c.beginPath(); c.ellipse(x - sz * 0.09, y - sz * 1.06, sz * 0.05, sz * 0.025, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(x + sz * 0.09, y - sz * 1.06, sz * 0.05, sz * 0.025, 0, 0, Math.PI * 2); c.fill();
        // Pupils
        c.fillStyle = '#1a1a1a';
        c.beginPath(); c.arc(x - sz * 0.08, y - sz * 1.06, sz * 0.025, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + sz * 0.1, y - sz * 1.06, sz * 0.025, 0, Math.PI * 2); c.fill();

        // ── Tactical gloves (hands) ──
        c.fillStyle = g.gloves;
        c.beginPath(); c.arc(x - sz * 0.35 + lp * 0.5, y + sz * 0.1, sz * 0.06, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + sz * 0.35 - lp * 0.5, y + sz * 0.1, sz * 0.06, 0, Math.PI * 2); c.fill();

        // ── Modern assault rifle (always rifle now) ──
        const gunSwing = swinging ? Math.sin(time * 0.4 + phase) * sz * 0.15 : 0;
        c.save();
        c.translate(x + sz * 0.2, y - sz * 0.2);
        c.rotate(gunSwing * 0.03);
        // Rifle body (M4/AR-15 style)
        c.fillStyle = '#2a2a2a';
        c.fillRect(0, -sz * 0.03, sz * 0.65, sz * 0.06);
        // Barrel
        c.fillStyle = '#333';
        c.fillRect(sz * 0.55, -sz * 0.015, sz * 0.35, sz * 0.03);
        // Handguard (quad rail)
        c.fillStyle = '#3a3a3a';
        c.fillRect(sz * 0.2, -sz * 0.04, sz * 0.35, sz * 0.08);
        // Rail lines
        c.strokeStyle = '#2a2a2a'; c.lineWidth = 0.5;
        for (let i = 0; i < 4; i++) {
            c.beginPath(); c.moveTo(sz * 0.22 + i * sz * 0.08, -sz * 0.04);
            c.lineTo(sz * 0.22 + i * sz * 0.08, sz * 0.04); c.stroke();
        }
        // Stock
        c.fillStyle = '#3a3a3a';
        c.fillRect(-sz * 0.25, -sz * 0.025, sz * 0.28, sz * 0.05);
        // Magazine
        c.fillStyle = '#222';
        c.fillRect(sz * 0.15, sz * 0.03, sz * 0.08, sz * 0.12);
        // Grip
        c.fillStyle = '#2a2a2a';
        c.fillRect(sz * 0.08, sz * 0.03, sz * 0.05, sz * 0.1);
        // Red dot sight
        c.fillStyle = '#444';
        c.fillRect(sz * 0.25, -sz * 0.06, sz * 0.06, sz * 0.03);
        // Laser pointer dot
        c.fillStyle = '#ff0000';
        c.beginPath(); c.arc(sz * 0.28, -sz * 0.06, 1, 0, Math.PI * 2); c.fill();
        c.restore();

        // ── Comms headset on ear ──
        c.fillStyle = '#333';
        c.beginPath();
        c.arc(x + sz * 0.3, y - sz * 1.0, sz * 0.08, 0, Math.PI * 2);
        c.fill();
        // Mic boom
        c.strokeStyle = '#444'; c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x + sz * 0.28, y - sz * 0.95);
        c.quadraticCurveTo(x + sz * 0.15, y - sz * 0.95, x + sz * 0.05, y - sz * 1.0);
        c.stroke();
        // Mic tip
        c.fillStyle = '#555';
        c.beginPath(); c.arc(x + sz * 0.05, y - sz * 1.0, sz * 0.02, 0, Math.PI * 2); c.fill();
    }

    _drawBattleHelmet(c, x, y, sz, co) {
        switch (co.helmetStyle) {
            case 'galea': // Roman
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.32, Math.PI, 0); c.fill();
                c.fillRect(x - sz * 0.32, y - sz * 1.15, sz * 0.64, sz * 0.1);
                // Crest
                c.fillStyle = co.crest;
                c.fillRect(x - sz * 0.03, y - sz * 1.55, sz * 0.06, sz * 0.45);
                // Visor
                c.fillStyle = '#444444';
                c.fillRect(x - sz * 0.2, y - sz * 1.1, sz * 0.4, sz * 0.06);
                break;
            case 'kabuto': // Japanese
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.2, sz * 0.35, Math.PI, 0); c.fill();
                // Face guard
                c.fillRect(x - sz * 0.25, y - sz * 1.05, sz * 0.5, sz * 0.08);
                // Crest (maedate)
                c.fillStyle = co.crest;
                c.beginPath(); c.moveTo(x, y - sz * 1.55); c.lineTo(x - sz * 0.3, y - sz * 1.2); c.lineTo(x + sz * 0.3, y - sz * 1.2); c.closePath(); c.fill();
                break;
            case 'turban': // Maurya, Ottoman
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.33, 0, Math.PI * 2); c.fill();
                // Turban jewel
                c.fillStyle = co.crest;
                c.beginPath(); c.arc(x, y - sz * 1.4, sz * 0.08, 0, Math.PI * 2); c.fill();
                break;
            case 'furhat': // Mongol
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.3, Math.PI, 0); c.fill();
                // Fur trim
                c.fillStyle = co.crest;
                c.fillRect(x - sz * 0.35, y - sz * 1.15, sz * 0.7, sz * 0.1);
                // Ear flaps
                c.fillRect(x - sz * 0.35, y - sz * 1.15, sz * 0.1, sz * 0.25);
                c.fillRect(x + sz * 0.25, y - sz * 1.15, sz * 0.1, sz * 0.25);
                break;
            case 'tricorn': // British
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.3, Math.PI, 0); c.fill();
                // Hat brim
                c.fillStyle = '#1a1a2e';
                c.fillRect(x - sz * 0.45, y - sz * 1.12, sz * 0.9, sz * 0.08);
                // Cockade
                c.fillStyle = co.crest;
                c.beginPath(); c.arc(x + sz * 0.2, y - sz * 1.15, sz * 0.06, 0, Math.PI * 2); c.fill();
                break;
            case 'bicorn': // Napoleon
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.3, Math.PI, 0); c.fill();
                // Bicorn shape
                c.fillStyle = '#1a1a2e';
                c.beginPath();
                c.moveTo(x - sz * 0.4, y - sz * 1.1); c.lineTo(x, y - sz * 1.5); c.lineTo(x + sz * 0.4, y - sz * 1.1);
                c.closePath(); c.fill();
                break;
            case 'stahlhelm': // Germany
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.34, Math.PI * 1.1, Math.PI * 1.9); c.fill();
                c.fillRect(x - sz * 0.34, y - sz * 1.15, sz * 0.68, sz * 0.12);
                break;
            case 'ushanka': // Russia
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.32, 0, Math.PI * 2); c.fill();
                // Fur ear flaps
                c.fillStyle = '#666666';
                c.fillRect(x - sz * 0.38, y - sz * 1.0, sz * 0.15, sz * 0.3);
                c.fillRect(x + sz * 0.23, y - sz * 1.0, sz * 0.15, sz * 0.3);
                // Star
                c.fillStyle = co.crest;
                c.beginPath(); c.arc(x, y - sz * 1.35, sz * 0.06, 0, Math.PI * 2); c.fill();
                break;
            case 'nemes': // Egypt
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.3, Math.PI, 0); c.fill();
                // Nemes stripes
                c.fillStyle = co.crest;
                c.fillRect(x - sz * 0.03, y - sz * 1.15, sz * 0.06, sz * 0.35);
                // Side flaps
                c.fillRect(x - sz * 0.3, y - sz * 1.1, sz * 0.12, sz * 0.3);
                c.fillRect(x + sz * 0.18, y - sz * 1.1, sz * 0.12, sz * 0.3);
                break;
            default:
                c.fillStyle = co.helmet;
                c.beginPath(); c.arc(x, y - sz * 1.15, sz * 0.3, Math.PI, 0); c.fill();
        }
    }

    _drawBattleWeapon(c, x, y, sz, co, swinging, time, phase) {
        const swingAngle = swinging ? Math.sin(time * 0.3 + phase) * 0.8 : 0;
        switch (co.weapon) {
            case 'gladius': { // Roman short sword — detailed with fuller, pommel
                c.save(); c.translate(x + sz * 0.5, y - sz * 0.4); c.rotate(swingAngle - 0.5);
                // Blade with fuller (blood groove)
                const bladeGr = c.createLinearGradient(-sz * 0.06, 0, sz * 0.06, 0);
                bladeGr.addColorStop(0, '#a8a8a8'); bladeGr.addColorStop(0.3, '#e8e8e8');
                bladeGr.addColorStop(0.5, '#d0d0d0'); bladeGr.addColorStop(0.7, '#e8e8e8'); bladeGr.addColorStop(1, '#a0a0a0');
                c.fillStyle = bladeGr;
                c.beginPath();
                c.moveTo(-sz * 0.06, 0); c.lineTo(-sz * 0.04, -sz * 1.15);
                c.lineTo(0, -sz * 1.3); c.lineTo(sz * 0.04, -sz * 1.15);
                c.lineTo(sz * 0.06, 0); c.closePath(); c.fill();
                // Fuller groove
                c.strokeStyle = '#888888'; c.lineWidth = 0.8;
                c.beginPath(); c.moveTo(0, -sz * 0.1); c.lineTo(0, -sz * 1.0); c.stroke();
                // Edge highlight
                c.strokeStyle = '#ffffff'; c.lineWidth = 0.4;
                c.beginPath(); c.moveTo(-sz * 0.04, -sz * 1.15); c.lineTo(0, -sz * 1.3); c.stroke();
                // Crossguard
                const guardGr = c.createLinearGradient(0, -sz * 0.05, 0, sz * 0.03);
                guardGr.addColorStop(0, '#ffd700'); guardGr.addColorStop(1, '#b8860b');
                c.fillStyle = guardGr;
                this._rr(c, -sz * 0.18, -sz * 0.05, sz * 0.36, sz * 0.08, 2); c.fill();
                // Guard orb ends
                c.fillStyle = '#ffd700';
                c.beginPath(); c.arc(-sz * 0.18, -sz * 0.01, sz * 0.04, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.arc(sz * 0.18, -sz * 0.01, sz * 0.04, 0, Math.PI * 2); c.fill();
                // Grip with leather wrapping
                c.fillStyle = '#6b3a1f';
                this._rr(c, -sz * 0.05, sz * 0.03, sz * 0.1, sz * 0.22, 2); c.fill();
                c.strokeStyle = '#4a2510'; c.lineWidth = 0.6;
                for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-sz * 0.05, sz * 0.06 + i * sz * 0.05); c.lineTo(sz * 0.05, sz * 0.06 + i * sz * 0.05); c.stroke(); }
                // Pommel
                const pGr = c.createRadialGradient(0, sz * 0.27, 0, 0, sz * 0.27, sz * 0.06);
                pGr.addColorStop(0, '#ffe44d'); pGr.addColorStop(1, '#b8860b');
                c.fillStyle = pGr;
                c.beginPath(); c.arc(0, sz * 0.27, sz * 0.06, 0, Math.PI * 2); c.fill();
                c.restore(); break;
            }
            case 'katana': { // Japanese katana — curved, with hamon pattern
                c.save(); c.translate(x + sz * 0.5, y - sz * 0.4); c.rotate(swingAngle - 0.3);
                // Blade with curve
                const kGr = c.createLinearGradient(-sz * 0.05, 0, sz * 0.05, 0);
                kGr.addColorStop(0, '#c0c0c0'); kGr.addColorStop(0.3, '#f0f0f0');
                kGr.addColorStop(0.5, '#e0e0e0'); kGr.addColorStop(1, '#b0b0b0');
                c.fillStyle = kGr;
                c.beginPath();
                c.moveTo(-sz * 0.05, sz * 0.2);
                c.quadraticCurveTo(-sz * 0.06, -sz * 0.5, -sz * 0.02, -sz * 1.0);
                c.quadraticCurveTo(sz * 0.01, -sz * 1.3, sz * 0.02, -sz * 1.45);
                c.lineTo(sz * 0.01, -sz * 1.4);
                c.quadraticCurveTo(0, -sz * 1.2, sz * 0.02, -sz * 0.9);
                c.quadraticCurveTo(sz * 0.04, -sz * 0.4, sz * 0.04, sz * 0.2);
                c.closePath(); c.fill();
                // Hamon (temper line)
                c.strokeStyle = '#ffffff'; c.lineWidth = 0.6; c.globalAlpha = 0.6;
                c.beginPath();
                c.moveTo(-sz * 0.03, sz * 0.1);
                c.quadraticCurveTo(-sz * 0.04, -sz * 0.4, -sz * 0.01, -sz * 0.8);
                c.quadraticCurveTo(sz * 0.01, -sz * 1.1, sz * 0.02, -sz * 1.3);
                c.stroke(); c.globalAlpha = 1;
                // Edge highlight
                c.strokeStyle = '#ffffff'; c.lineWidth = 0.3;
                c.beginPath(); c.moveTo(sz * 0.02, -sz * 1.45); c.lineTo(sz * 0.01, -sz * 1.4); c.stroke();
                // Tsuba (guard) — ornate oval
                c.fillStyle = '#8B6914';
                c.beginPath();
                c.ellipse(0, sz * 0.15, sz * 0.14, sz * 0.06, 0, 0, Math.PI * 2); c.fill();
                c.strokeStyle = '#ffd700'; c.lineWidth = 0.8;
                c.beginPath(); c.ellipse(0, sz * 0.15, sz * 0.12, sz * 0.04, 0, 0, Math.PI * 2); c.stroke();
                // Tsuka (grip) with rayskin + ito wrap
                c.fillStyle = '#2a1506';
                this._rr(c, -sz * 0.04, sz * 0.2, sz * 0.08, sz * 0.28, 2); c.fill();
                c.strokeStyle = co.crest; c.lineWidth = 0.8;
                for (let i = 0; i < 6; i++) {
                    const yy = sz * 0.23 + i * sz * 0.04;
                    c.beginPath(); c.moveTo(-sz * 0.04, yy); c.lineTo(sz * 0.04, yy + sz * 0.02); c.stroke();
                }
                // Menuki (grip ornament)
                c.fillStyle = co.crest;
                c.beginPath(); c.arc(0, sz * 0.32, sz * 0.025, 0, Math.PI * 2); c.fill();
                // Kashira (pommel)
                c.fillStyle = '#2a1506';
                this._rr(c, -sz * 0.05, sz * 0.47, sz * 0.1, sz * 0.06, 2); c.fill();
                c.restore(); break;
            }
            case 'bow': { // Mongol composite bow — recurve design
                c.save(); c.translate(x + sz * 0.3, y - sz * 0.5);
                // Upper limb (recurve)
                c.strokeStyle = '#6b3a1f'; c.lineWidth = 2.5;
                c.beginPath();
                c.moveTo(0, sz * 0.2);
                c.quadraticCurveTo(-sz * 0.15, -sz * 0.2, -sz * 0.05, -sz * 0.8);
                c.quadraticCurveTo(sz * 0.05, -sz * 1.1, sz * 0.08, -sz * 1.2);
                c.stroke();
                // Lower limb
                c.beginPath();
                c.moveTo(0, sz * 0.2);
                c.quadraticCurveTo(-sz * 0.1, sz * 0.6, 0, sz * 0.9);
                c.quadraticCurveTo(sz * 0.05, sz * 1.1, sz * 0.06, sz * 1.15);
                c.stroke();
                // String
                c.strokeStyle = '#d4c5a0'; c.lineWidth = 0.7;
                c.beginPath();
                c.moveTo(sz * 0.08, -sz * 1.2);
                c.lineTo(0, sz * 0.15);
                c.lineTo(sz * 0.06, sz * 1.15);
                c.stroke();
                // Arrow nocked (when not swinging)
                if (!swinging) {
                    c.strokeStyle = '#5a3a1a'; c.lineWidth = 1.2;
                    c.beginPath(); c.moveTo(0, sz * 0.15); c.lineTo(sz * 1.2, sz * 0.12); c.stroke();
                    // Arrowhead
                    c.fillStyle = '#c0c0c0';
                    c.beginPath();
                    c.moveTo(sz * 1.2, sz * 0.12);
                    c.lineTo(sz * 1.1, sz * 0.08); c.lineTo(sz * 1.1, sz * 0.16);
                    c.closePath(); c.fill();
                    // Fletching
                    c.fillStyle = '#cc3333';
                    c.beginPath(); c.moveTo(sz * 0.05, sz * 0.15); c.lineTo(sz * 0.2, sz * 0.1); c.lineTo(sz * 0.2, sz * 0.2); c.closePath(); c.fill();
                }
                // Grip wrap
                c.fillStyle = '#3a1f0a';
                c.beginPath(); c.arc(0, sz * 0.2, sz * 0.05, 0, Math.PI * 2); c.fill();
                c.restore(); break;
            }
            case 'scimitar': { // Ottoman scimitar — dramatic curve with damascus pattern
                c.save(); c.translate(x + sz * 0.5, y - sz * 0.3); c.rotate(swingAngle - 0.4);
                // Blade — wide dramatic curve
                const scGr = c.createLinearGradient(-sz * 0.08, 0, sz * 0.08, 0);
                scGr.addColorStop(0, '#909090'); scGr.addColorStop(0.2, '#d0d0d0');
                scGr.addColorStop(0.4, '#a0a0a0'); scGr.addColorStop(0.6, '#d0d0d0');
                scGr.addColorStop(0.8, '#a0a0a0'); scGr.addColorStop(1, '#909090');
                c.fillStyle = scGr;
                c.beginPath();
                c.moveTo(-sz * 0.06, 0);
                c.quadraticCurveTo(sz * 0.1, -sz * 0.4, sz * 0.25, -sz * 0.8);
                c.quadraticCurveTo(sz * 0.3, -sz * 1.1, sz * 0.15, -sz * 1.3);
                c.lineTo(sz * 0.08, -sz * 1.25);
                c.quadraticCurveTo(sz * 0.2, -sz * 1.0, sz * 0.15, -sz * 0.7);
                c.quadraticCurveTo(sz * 0.05, -sz * 0.3, sz * 0.06, 0);
                c.closePath(); c.fill();
                // Damascus pattern (wavy lines)
                c.strokeStyle = '#777777'; c.lineWidth = 0.3; c.globalAlpha = 0.4;
                for (let i = 0; i < 5; i++) {
                    c.beginPath();
                    c.moveTo(-sz * 0.03, -sz * (0.1 + i * 0.2));
                    c.quadraticCurveTo(sz * 0.1, -sz * (0.2 + i * 0.2), sz * 0.12, -sz * (0.3 + i * 0.2));
                    c.stroke();
                }
                c.globalAlpha = 1;
                // Edge
                c.strokeStyle = '#e0e0e0'; c.lineWidth = 0.5;
                c.beginPath();
                c.moveTo(sz * 0.15, -sz * 1.3);
                c.quadraticCurveTo(sz * 0.3, -sz * 1.1, sz * 0.25, -sz * 0.8);
                c.stroke();
                // Crossguard — curved
                c.fillStyle = '#b8860b';
                c.beginPath();
                c.ellipse(0, -sz * 0.02, sz * 0.15, sz * 0.04, -0.2, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = '#ffd700'; c.lineWidth = 0.5;
                c.beginPath(); c.ellipse(0, -sz * 0.02, sz * 0.13, sz * 0.03, -0.2, 0, Math.PI * 2); c.stroke();
                // Grip with leather
                c.fillStyle = '#4a2510';
                this._rr(c, -sz * 0.04, sz * 0.02, sz * 0.08, sz * 0.22, 2); c.fill();
                c.strokeStyle = '#2a1506'; c.lineWidth = 0.6;
                for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-sz * 0.04, sz * 0.05 + i * sz * 0.06); c.lineTo(sz * 0.04, sz * 0.05 + i * sz * 0.06); c.stroke(); }
                // Pommel
                c.fillStyle = '#b8860b';
                c.beginPath(); c.arc(0, sz * 0.26, sz * 0.05, 0, Math.PI * 2); c.fill();
                c.restore(); break;
            }
            case 'musket': { // British Brown Bess musket — detailed flintlock
                c.save(); c.translate(x + sz * 0.3, y - sz * 0.2); c.rotate(-0.3 + swingAngle * 0.3);
                // Stock (wooden)
                const stkGr = c.createLinearGradient(-sz * 0.06, 0, sz * 0.06, 0);
                stkGr.addColorStop(0, '#4a2510'); stkGr.addColorStop(0.4, '#6b3a1f');
                stkGr.addColorStop(0.6, '#5a3018'); stkGr.addColorStop(1, '#3a1a0a');
                c.fillStyle = stkGr;
                c.beginPath();
                c.moveTo(-sz * 0.05, sz * 0.3);
                c.lineTo(-sz * 0.06, -sz * 0.2);
                c.lineTo(-sz * 0.04, -sz * 0.6);
                c.lineTo(sz * 0.04, -sz * 0.6);
                c.lineTo(sz * 0.06, -sz * 0.2);
                c.lineTo(sz * 0.05, sz * 0.3);
                c.closePath(); c.fill();
                // Barrel
                const bGr = c.createLinearGradient(-sz * 0.03, 0, sz * 0.03, 0);
                bGr.addColorStop(0, '#555555'); bGr.addColorStop(0.3, '#999999');
                bGr.addColorStop(0.5, '#aaaaaa'); bGr.addColorStop(0.7, '#999999'); bGr.addColorStop(1, '#555555');
                c.fillStyle = bGr;
                c.fillRect(-sz * 0.03, -sz * 1.6, sz * 0.06, sz * 1.05);
                // Barrel rings
                c.strokeStyle = '#666666'; c.lineWidth = 0.8;
                for (const ry of [-sz * 0.7, -sz * 1.0, -sz * 1.3]) {
                    c.beginPath(); c.moveTo(-sz * 0.035, ry); c.lineTo(sz * 0.035, ry); c.stroke();
                }
                // Bayonet lug
                c.fillStyle = '#888888';
                c.fillRect(-sz * 0.02, -sz * 1.6, sz * 0.04, sz * 0.06);
                // Flintlock mechanism
                c.fillStyle = '#444444';
                c.fillRect(sz * 0.04, -sz * 0.55, sz * 0.08, sz * 0.12);
                // Frizzen (flash pan cover)
                c.fillStyle = '#777777';
                c.fillRect(sz * 0.04, -sz * 0.62, sz * 0.06, sz * 0.07);
                // Trigger guard
                c.strokeStyle = '#555555'; c.lineWidth = 1;
                c.beginPath();
                c.arc(sz * 0.02, sz * 0.05, sz * 0.06, 0, Math.PI); c.stroke();
                // Trigger
                c.fillStyle = '#444444';
                c.fillRect(sz * 0.01, sz * 0.0, sz * 0.02, sz * 0.08);
                // Butt plate
                c.fillStyle = '#666666';
                this._rr(c, -sz * 0.06, sz * 0.25, sz * 0.12, sz * 0.06, 2); c.fill();
                c.restore(); break;
            }
            case 'rapier': { // Napoleon-era rapier — elegant with cup hilt
                c.save(); c.translate(x + sz * 0.4, y - sz * 0.3); c.rotate(swingAngle - 0.4);
                // Blade — long thin with taper
                const rGr = c.createLinearGradient(-sz * 0.02, 0, sz * 0.02, 0);
                rGr.addColorStop(0, '#b0b0b0'); rGr.addColorStop(0.4, '#e8e8e8');
                rGr.addColorStop(0.6, '#e0e0e0'); rGr.addColorStop(1, '#b0b0b0');
                c.fillStyle = rGr;
                c.beginPath();
                c.moveTo(-sz * 0.025, 0);
                c.lineTo(-sz * 0.015, -sz * 1.5);
                c.lineTo(0, -sz * 1.8);
                c.lineTo(sz * 0.015, -sz * 1.5);
                c.lineTo(sz * 0.025, 0);
                c.closePath(); c.fill();
                // Central ridge
                c.strokeStyle = '#dddddd'; c.lineWidth = 0.4;
                c.beginPath(); c.moveTo(0, -sz * 0.1); c.lineTo(0, -sz * 1.7); c.stroke();
                // Cup hilt — elegant wire bowl
                c.strokeStyle = '#ffd700'; c.lineWidth = 0.8;
                c.beginPath(); c.arc(0, -sz * 0.08, sz * 0.12, -Math.PI * 0.8, Math.PI * 0.1); c.stroke();
                // Crossguard
                c.strokeStyle = '#ffd700'; c.lineWidth = 1.5;
                c.beginPath(); c.moveTo(-sz * 0.14, -sz * 0.08); c.lineTo(sz * 0.14, -sz * 0.08); c.stroke();
                // Quillon ends
                c.fillStyle = '#ffd700';
                c.beginPath(); c.arc(-sz * 0.14, -sz * 0.08, sz * 0.02, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.arc(sz * 0.14, -sz * 0.08, sz * 0.02, 0, Math.PI * 2); c.fill();
                // Wire basket fill
                c.strokeStyle = '#daa520'; c.lineWidth = 0.3;
                for (let i = 0; i < 4; i++) {
                    const r = sz * (0.04 + i * 0.025);
                    c.beginPath(); c.arc(0, -sz * 0.06, r, -Math.PI * 0.6, Math.PI * 0.05); c.stroke();
                }
                // Grip — wire-wrapped
                c.fillStyle = '#1a0a00';
                this._rr(c, -sz * 0.025, sz * 0.0, sz * 0.05, sz * 0.22, 1); c.fill();
                c.strokeStyle = '#ffd700'; c.lineWidth = 0.4;
                for (let i = 0; i < 6; i++) {
                    c.beginPath(); c.moveTo(-sz * 0.025, sz * 0.02 + i * sz * 0.035);
                    c.lineTo(sz * 0.025, sz * 0.02 + i * sz * 0.035); c.stroke();
                }
                // Pommel
                const rpGr = c.createRadialGradient(0, sz * 0.24, 0, 0, sz * 0.24, sz * 0.04);
                rpGr.addColorStop(0, '#ffe44d'); rpGr.addColorStop(1, '#b8860b');
                c.fillStyle = rpGr;
                c.beginPath(); c.arc(0, sz * 0.24, sz * 0.04, 0, Math.PI * 2); c.fill();
                c.restore(); break;
            }
            case 'chakra': { // Maurya chakram — throwing disc with ornate edges
                c.save(); c.translate(x + sz * 0.4, y - sz * 0.5);
                const spin = swinging ? time * 0.15 : 0;
                c.rotate(spin);
                // Outer ring with gradient
                const chGr = c.createRadialGradient(0, 0, sz * 0.18, 0, 0, sz * 0.35);
                chGr.addColorStop(0, co.crest); chGr.addColorStop(0.5, '#d4a017'); chGr.addColorStop(1, co.crest);
                c.fillStyle = chGr;
                c.beginPath(); c.arc(0, 0, sz * 0.35, 0, Math.PI * 2);
                c.beginPath(); c.arc(0, 0, sz * 0.35, 0, Math.PI * 2); c.fill();
                // Inner hole
                c.fillStyle = '#1a1a2e';
                c.beginPath(); c.arc(0, 0, sz * 0.15, 0, Math.PI * 2); c.fill();
                // Edge serrations
                c.strokeStyle = '#ffd700'; c.lineWidth = 0.8;
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2;
                    const r1 = sz * 0.32, r2 = sz * 0.38;
                    c.beginPath();
                    c.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
                    c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
                    c.stroke();
                }
                // Concentric decorative rings
                c.strokeStyle = '#ffd700'; c.lineWidth = 0.5;
                c.beginPath(); c.arc(0, 0, sz * 0.25, 0, Math.PI * 2); c.stroke();
                c.beginPath(); c.arc(0, 0, sz * 0.2, 0, Math.PI * 2); c.stroke();
                // Center ornament
                c.fillStyle = '#ffd700';
                c.beginPath(); c.arc(0, 0, sz * 0.04, 0, Math.PI * 2); c.fill();
                c.restore(); break;
            }
            case 'rifle': { // German Kar98k rifle — bolt-action with scope option
                c.save(); c.translate(x + sz * 0.3, y - sz * 0.2); c.rotate(-0.3 + swingAngle * 0.2);
                // Stock
                const gGr = c.createLinearGradient(-sz * 0.06, 0, sz * 0.06, 0);
                gGr.addColorStop(0, '#3a1a0a'); gGr.addColorStop(0.4, '#5a3018');
                gGr.addColorStop(1, '#3a1a0a');
                c.fillStyle = gGr;
                c.beginPath();
                c.moveTo(-sz * 0.05, sz * 0.25);
                c.lineTo(-sz * 0.05, -sz * 0.3);
                c.lineTo(-sz * 0.03, -sz * 0.6);
                c.lineTo(sz * 0.03, -sz * 0.6);
                c.lineTo(sz * 0.05, -sz * 0.3);
                c.lineTo(sz * 0.05, sz * 0.25);
                c.closePath(); c.fill();
                // Barrel — longer than musket
                const kGr = c.createLinearGradient(-sz * 0.025, 0, sz * 0.025, 0);
                kGr.addColorStop(0, '#444444'); kGr.addColorStop(0.3, '#888888');
                kGr.addColorStop(0.5, '#999999'); kGr.addColorStop(1, '#444444');
                c.fillStyle = kGr;
                c.fillRect(-sz * 0.025, -sz * 1.7, sz * 0.05, sz * 1.15);
                // Barrel bands
                c.strokeStyle = '#555555'; c.lineWidth = 1;
                for (const ry of [-sz * 0.6, -sz * 0.9, -sz * 1.2]) {
                    c.beginPath(); c.moveTo(-sz * 0.03, ry); c.lineTo(sz * 0.03, ry); c.stroke();
                }
                // Front sight
                c.fillStyle = '#666666';
                c.beginPath(); c.moveTo(0, -sz * 1.7); c.lineTo(-sz * 0.015, -sz * 1.75); c.lineTo(sz * 0.015, -sz * 1.75); c.closePath(); c.fill();
                // Bolt handle
                c.strokeStyle = '#555555'; c.lineWidth = 1.5;
                c.beginPath();
                c.moveTo(sz * 0.03, -sz * 0.4);
                c.quadraticCurveTo(sz * 0.1, -sz * 0.35, sz * 0.08, -sz * 0.28);
                c.stroke();
                // Trigger
                c.fillStyle = '#444444';
                c.fillRect(-sz * 0.01, sz * 0.02, sz * 0.02, sz * 0.06);
                // Magazine
                c.fillStyle = '#555555';
                this._rr(c, -sz * 0.02, sz * 0.08, sz * 0.04, sz * 0.1, 1); c.fill();
                c.restore(); break;
            }
            case 'ppsh': { // Soviet PPSh-41 — submachine gun with drum magazine
                c.save(); c.translate(x + sz * 0.3, y - sz * 0.2); c.rotate(-0.2 + swingAngle * 0.2);
                // Stock — wooden
                const pGr = c.createLinearGradient(-sz * 0.05, 0, sz * 0.05, 0);
                pGr.addColorStop(0, '#4a2510'); pGr.addColorStop(0.5, '#6b3a1f'); pGr.addColorStop(1, '#4a2510');
                c.fillStyle = pGr;
                c.beginPath();
                c.moveTo(-sz * 0.04, sz * 0.3);
                c.lineTo(-sz * 0.04, -sz * 0.1);
                c.lineTo(sz * 0.04, -sz * 0.1);
                c.lineTo(sz * 0.04, sz * 0.3);
                c.closePath(); c.fill();
                // Receiver
                c.fillStyle = '#555555';
                c.fillRect(-sz * 0.04, -sz * 0.6, sz * 0.08, sz * 0.55);
                // Barrel
                const ppGr = c.createLinearGradient(-sz * 0.02, 0, sz * 0.02, 0);
                ppGr.addColorStop(0, '#444444'); ppGr.addColorStop(0.5, '#888888'); ppGr.addColorStop(1, '#444444');
                c.fillStyle = ppGr;
                c.fillRect(-sz * 0.02, -sz * 1.3, sz * 0.04, sz * 0.75);
                // Barrel shroud (heat shield)
                c.strokeStyle = '#555555'; c.lineWidth = 0.6;
                for (let i = 0; i < 5; i++) {
                    const ry = -sz * (0.7 + i * 0.1);
                    c.beginPath(); c.moveTo(-sz * 0.025, ry); c.lineTo(sz * 0.025, ry); c.stroke();
                }
                // Muzzle brake
                c.fillStyle = '#444444';
                c.fillRect(-sz * 0.025, -sz * 1.35, sz * 0.05, sz * 0.06);
                // Drum magazine — iconic round mag
                c.strokeStyle = '#555555'; c.lineWidth = 1;
                c.beginPath(); c.arc(0, sz * 0.05, sz * 0.1, 0, Math.PI * 2); c.stroke();
                c.fillStyle = '#4a4a4a';
                c.beginPath(); c.arc(0, sz * 0.05, sz * 0.09, 0, Math.PI * 2); c.fill();
                // Magazine spring visible
                c.strokeStyle = '#666666'; c.lineWidth = 0.4;
                c.beginPath(); c.arc(0, sz * 0.05, sz * 0.06, 0, Math.PI * 2); c.stroke();
                // Trigger
                c.fillStyle = '#333333';
                c.fillRect(-sz * 0.01, -sz * 0.15, sz * 0.02, sz * 0.06);
                // Bolt
                c.fillStyle = '#666666';
                c.fillRect(-sz * 0.035, -sz * 0.55, sz * 0.07, sz * 0.04);
                c.restore(); break;
            }
            case 'khopesh': { // Egyptian khopesh — sickle sword with ornate handle
                c.save(); c.translate(x + sz * 0.5, y - sz * 0.3); c.rotate(swingAngle - 0.5);
                // Blade — distinctive hook shape
                const khGr = c.createLinearGradient(-sz * 0.04, 0, sz * 0.08, 0);
                khGr.addColorStop(0, '#b8860b'); khGr.addColorStop(0.3, '#ffd700');
                khGr.addColorStop(0.5, '#e6c200'); khGr.addColorStop(0.7, '#ffd700'); khGr.addColorStop(1, '#b8860b');
                c.fillStyle = khGr;
                c.beginPath();
                c.moveTo(-sz * 0.04, sz * 0.05);
                c.lineTo(-sz * 0.04, -sz * 0.3);
                c.quadraticCurveTo(-sz * 0.02, -sz * 0.6, sz * 0.1, -sz * 0.8);
                c.quadraticCurveTo(sz * 0.25, -sz * 0.95, sz * 0.3, -sz * 0.8);
                c.quadraticCurveTo(sz * 0.35, -sz * 0.6, sz * 0.2, -sz * 0.5);
                c.lineTo(sz * 0.08, -sz * 0.35);
                c.lineTo(sz * 0.04, sz * 0.05);
                c.closePath(); c.fill();
                // Inner edge highlight
                c.strokeStyle = '#ffe44d'; c.lineWidth = 0.6;
                c.beginPath();
                c.moveTo(sz * 0.08, -sz * 0.35);
                c.lineTo(sz * 0.2, -sz * 0.5);
                c.quadraticCurveTo(sz * 0.35, -sz * 0.6, sz * 0.3, -sz * 0.8);
                c.stroke();
                // Cutting edge
                c.strokeStyle = '#ffffff'; c.lineWidth = 0.4;
                c.beginPath();
                c.moveTo(-sz * 0.04, -sz * 0.3);
                c.quadraticCurveTo(-sz * 0.02, -sz * 0.6, sz * 0.1, -sz * 0.8);
                c.quadraticCurveTo(sz * 0.25, -sz * 0.95, sz * 0.3, -sz * 0.8);
                c.stroke();
                // Handle with Egyptian decorations
                c.fillStyle = '#2a1506';
                this._rr(c, -sz * 0.05, sz * 0.05, sz * 0.1, sz * 0.2, 2); c.fill();
                // Gold bands on handle
                c.fillStyle = '#ffd700';
                c.fillRect(-sz * 0.05, sz * 0.08, sz * 0.1, sz * 0.02);
                c.fillRect(-sz * 0.05, sz * 0.18, sz * 0.1, sz * 0.02);
                // Eye of Horus pommel
                c.fillStyle = '#ffd700';
                c.beginPath(); c.arc(0, sz * 0.28, sz * 0.05, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#1a0a00';
                c.beginPath(); c.arc(0, sz * 0.28, sz * 0.02, 0, Math.PI * 2); c.fill();
                c.restore(); break;
            }
            default: { // Generic sword — simple but clean
                c.save(); c.translate(x + sz * 0.5, y - sz * 0.3); c.rotate(swingAngle - 0.5);
                const dGr = c.createLinearGradient(-sz * 0.03, 0, sz * 0.03, 0);
                dGr.addColorStop(0, '#a0a0a0'); dGr.addColorStop(0.4, '#e0e0e0');
                dGr.addColorStop(0.6, '#e0e0e0'); dGr.addColorStop(1, '#a0a0a0');
                c.fillStyle = dGr;
                c.beginPath();
                c.moveTo(-sz * 0.04, 0);
                c.lineTo(-sz * 0.03, -sz * 1.1);
                c.lineTo(0, -sz * 1.3);
                c.lineTo(sz * 0.03, -sz * 1.1);
                c.lineTo(sz * 0.04, 0);
                c.closePath(); c.fill();
                c.fillStyle = '#ffd700';
                c.fillRect(-sz * 0.12, -sz * 0.04, sz * 0.24, sz * 0.06);
                c.fillStyle = '#4a2510';
                this._rr(c, -sz * 0.04, sz * 0.02, sz * 0.08, sz * 0.18, 2); c.fill();
                c.restore();
            }
        }
    }

    _territories() {
        const c = this.ctx, g = this.g;

        // ── PASS 1: Territory fills with semi-transparent ancient map style ──
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s) continue;
            const em = s.owner ? EMPIRES[s.owner] : null;
            const polys = t.polys || (t.poly ? [t.poly] : []);
            const isSel = g.sel === t.id;
            const isHov = g.hover === t.id;
            const p = this.toScr(t.cx, t.cy);
            for (const poly of polys) {
                c.beginPath();
                this._smoothPolyPath(c, poly, 0.25);
                if (em) {
                    // Semi-transparent empire fill (0.6 opacity) over parchment
                    c.save();
                    c.globalAlpha = 0.6;
                    c.fillStyle = em.color;
                    c.fill();
                    c.restore();
                } else {
                    // Neutral territory — subtle terrain tint at 0.5 opacity
                    const terrainFills = {
                        forest:    '#3a6a3a',
                        mountains: '#7a6a5a',
                        desert:    '#c8a855',
                        plains:    '#6a8a4a',
                        island:    '#5a7a8a',
                        coast:     '#5a8a7a',
                        peninsula: '#9a8a6a',
                    };
                    c.save();
                    c.globalAlpha = 0.5;
                    c.fillStyle = terrainFills[t.terrain] || '#7a7a6a';
                    c.fill();
                    c.restore();
                }
                // ── Ancient map-style dark brown border ──
                c.strokeStyle = '#3a2510';
                c.lineWidth = 1.8;
                c.stroke();
                // Selection/hover highlight — warm gold outline
                if (isSel) {
                    c.strokeStyle = '#c49a30';
                    c.lineWidth = 3;
                    c.stroke();
                } else if (isHov) {
                    c.strokeStyle = 'rgba(196,154,48,0.6)';
                    c.lineWidth = 2.5;
                    c.stroke();
                }
            }
        }

        // ── PASS 2: Territory borders — draw borders between adjacent territories with different owners ──
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s) continue;
            const isSel = g.sel === t.id;
            const isHov = g.hover === t.id;
            const isOwn = s.owner === g.player;

            // Draw territory polygon border for hover/selection indicators
            if (isHov && isOwn || isSel) {
                const drawTPoly = () => {
                    const polys = t.polys || (t.poly ? [t.poly] : []);
                    for (const poly of polys) {
                        c.beginPath();
                        this._smoothPolyPath(c, poly, 0.25);
                    }
                };

                if (isSel) {
                    c.save();
                    c.shadowColor = '#ffd700';
                    c.shadowBlur = 15 + Math.sin(this.time * 0.05) * 5;
                    drawTPoly();
                    c.strokeStyle = '#ffd700';
                    c.lineWidth = 3 * this.scale;
                    c.stroke();
                    c.restore();
                    // Animated dash
                    c.save();
                    drawTPoly();
                    c.setLineDash([10, 5]);
                    c.lineDashOffset = -this.time * 0.7;
                    c.strokeStyle = 'rgba(255,255,200,0.6)';
                    c.lineWidth = 1.5 * this.scale;
                    c.stroke();
                    c.restore();
                }
                if (isHov && isOwn && !isSel) {
                    const pulse = 0.15 + Math.sin(this.time * 0.08) * 0.1;
                    drawTPoly();
                    c.fillStyle = `rgba(255,215,0,${pulse})`;
                    c.fill();
                    drawTPoly();
                    c.strokeStyle = '#ffd700';
                    c.lineWidth = 2.5 * this.scale;
                    c.stroke();
                }
            }

            // ── FRONTLINE GLOW: player territories bordering enemies pulse orange ──
            if (s.owner === g.player) {
                const hasEnemy = t.adj.some(aid => { const ns = g.ts[aid]; return ns && ns.owner && ns.owner !== g.player; });
                if (hasEnemy) {
                    const flDraw = () => {
                        const polys = t.polys || (t.poly ? [t.poly] : []);
                        for (const poly of polys) {
                            c.beginPath();
                            this._smoothPolyPath(c, poly, 0.25);
                        }
                    };
                    const fp = 0.15 + Math.sin(this.time * 0.04 + t.id * 0.5) * 0.1;
                    flDraw();
                    c.strokeStyle = `rgba(255,100,50,${fp})`;
                    c.lineWidth = 2.5 * this.scale;
                    c.stroke();
                }
            }
        }

        // ── PASS 2.5: Empire boundary lines between territories with different owners ──
        const drawn = new Set();
        c.lineCap = 'round';
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s || !s.owner) continue;
            const p1 = this.toScr(t.cx, t.cy);
            for (const aId of t.adj) {
                const aS = g.ts[aId];
                if (!aS || !aS.owner || aS.owner === s.owner) continue;
                const key = Math.min(t.id, aId) + '-' + Math.max(t.id, aId);
                if (drawn.has(key)) continue;
                drawn.add(key);
                const aT = TERRITORIES[aId];
                const p2 = this.toScr(aT.cx, aT.cy);
                // Draw thick boundary line between territory centers
                c.save();
                c.strokeStyle = 'rgba(90,58,26,0.6)';
                c.lineWidth = 2.5 * this.scale;
                c.setLineDash([6, 4]);
                c.lineDashOffset = -this.time * 0.3;
                c.beginPath();
                c.moveTo(p1.x, p1.y);
                c.lineTo(p2.x, p2.y);
                c.stroke();
                c.restore();
                // Glow line
                c.save();
                c.strokeStyle = 'rgba(196,154,48,0.15)';
                c.lineWidth = 6 * this.scale;
                c.beginPath();
                c.moveTo(p1.x, p1.y);
                c.lineTo(p2.x, p2.y);
                c.stroke();
                c.restore();
            }
        }
        c.lineCap = 'butt';

        // ── PASS 3: Territory labels with ancient serif typography ──
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s) continue;
            const em = s.owner ? EMPIRES[s.owner] : null;
            const isSel = g.sel === t.id;
            const isHov = g.hover === t.id;
            const lp = t.label || [t.cx, t.cy];
            const p = this.toScr(lp[0], lp[1]);

            // ── Terrain icon (subtle) ──
            const terrainIcon = TERRAIN_ICONS[t.terrain];
            if (terrainIcon) {
                c.fillStyle = 'rgba(90,58,26,0.4)';
                c.font = `${Math.round(10*this.scale)}px serif`;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText(terrainIcon, p.x + 18*this.scale, p.y - 20*this.scale);
            }

            // ── Fort level ──
            if (s.fort > 0) {
                const shields = Math.min(Math.ceil(s.fort / 2), 4);
                c.fillStyle = '#5a3a1a'; c.font = `bold ${Math.round(8*this.scale)}px "Georgia", serif`;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText('\u{1F6E1}' + shields, p.x + 22*this.scale, p.y - 8*this.scale);
            }

            // ── Weapon tier indicator ──
            if (s.weapon && s.weapon.name !== 'Assault Rifle') {
                const tierNum = this._weaponTier(s.weapon);
                if (tierNum > 0) {
                    c.fillStyle = tierNum >= 4 ? '#8b1a1a' : (tierNum >= 3 ? '#8b6914' : '#3a5a3a');
                    c.font = `bold ${Math.round(8*this.scale)}px "Georgia", serif`;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    c.fillText('T' + tierNum, p.x + 22*this.scale, p.y + 14*this.scale);
                }
            }

            // ── Troops number — medieval shield badge ──
            const hideTroops = s.owner && s.owner !== g.player && !(g.empires[g.player]?.spy);
            const troopText = String(hideTroops ? '?' : s.troops);
            c.font = `bold ${Math.round(22*this.scale)}px "Georgia", serif`;
            const tw = c.measureText(troopText).width;
            c.save();
            const shieldW = tw + 16 * this.scale, shieldH = 30 * this.scale;
            const shieldX = p.x - shieldW/2, shieldY = p.y - shieldH/2 - 4*this.scale;
            // Shadow
            c.fillStyle = 'rgba(40,20,5,0.5)';
            c.beginPath();
            c.roundRect(shieldX + 2, shieldY + 2, shieldW, shieldH, 6*this.scale);
            c.fill();
            // Shield body — parchment tone
            if (em) {
                const shieldGr = c.createLinearGradient(shieldX, shieldY, shieldX, shieldY + shieldH);
                shieldGr.addColorStop(0, em.color);
                shieldGr.addColorStop(1, em.dark || em.color);
                c.fillStyle = shieldGr;
            } else {
                c.fillStyle = 'rgba(80,60,40,0.8)';
            }
            c.beginPath();
            c.roundRect(shieldX, shieldY, shieldW, shieldH, 6*this.scale);
            c.fill();
            // Parchment highlight
            c.fillStyle = 'rgba(255,240,200,0.15)';
            c.beginPath();
            c.roundRect(shieldX, shieldY, shieldW, shieldH * 0.4, [6*this.scale, 6*this.scale, 0, 0]);
            c.fill();
            // Dark brown border
            c.strokeStyle = 'rgba(60,30,10,0.6)'; c.lineWidth = 1.2 * this.scale;
            c.beginPath(); c.roundRect(shieldX, shieldY, shieldW, shieldH, 6*this.scale); c.stroke();
            c.restore();
            // Troop number — dark text on light background, white on colored
            c.fillStyle = em ? '#fff' : '#f5e6c8';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.shadowColor = 'rgba(30,15,0,0.8)';
            c.shadowBlur = 4;
            c.fillText(troopText, p.x, p.y - 2*this.scale);
            c.shadowColor = 'transparent';
            c.shadowBlur = 0;

            // ── Territory name — bold serif on parchment ribbon ──
            c.font = `bold ${Math.round(12*this.scale)}px "Georgia", "Times New Roman", serif`;
            const nameW = c.measureText(t.name).width;
            c.save();
            const nameH = 16 * this.scale;
            const nameX = p.x - nameW/2 - 5*this.scale;
            const nameY = p.y + 14*this.scale;
            // Parchment ribbon background
            const ribbonGr = c.createLinearGradient(nameX, nameY, nameX, nameY + nameH);
            ribbonGr.addColorStop(0, 'rgba(60,35,12,0.7)');
            ribbonGr.addColorStop(1, 'rgba(50,28,8,0.8)');
            c.fillStyle = ribbonGr;
            c.beginPath(); c.roundRect(nameX, nameY, nameW + 10*this.scale, nameH, 3*this.scale); c.fill();
            // Empire color accent stripe on left
            if (em) {
                c.fillStyle = em.color + '88';
                c.beginPath(); c.roundRect(nameX, nameY, 3*this.scale, nameH, [3*this.scale, 0, 0, 3*this.scale]); c.fill();
            }
            c.restore();
            // Name text — warm cream
            c.fillStyle = '#f0e0c0';
            c.shadowColor = 'rgba(30,15,0,0.8)';
            c.shadowBlur = 3;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(t.name, p.x, nameY + nameH/2);
            c.shadowColor = 'transparent';
            c.shadowBlur = 0;

            // ── Animated empire flag ──
            if (em && s.troops > 0) {
                this._drawFlag(c, p.x - 22 * this.scale, p.y - 18 * this.scale, em.color, em.light, this.scale);
            }

            // ── Emperor name in italic serif below territory name ──
            if (em && em.emperor) {
                c.fillStyle = em.color;
                c.font = `italic ${Math.round(9*this.scale)}px "Georgia", "Times New Roman", serif`;
                c.shadowColor = 'rgba(30,15,0,0.7)'; c.shadowBlur = 2;
                c.fillText(em.emperor, p.x, p.y + 36*this.scale);
                c.shadowColor = 'transparent'; c.shadowBlur = 0;
            }

            // ── Emperor name highlight on hover/select ──
            if (em && (isSel || isHov)) {
                c.fillStyle = '#c49a30';
                c.font = `bold italic ${Math.round(10*this.scale)}px "Georgia", "Times New Roman", serif`;
                c.shadowColor = 'rgba(60,30,10,0.5)';
                c.shadowBlur = 3;
                c.fillText(em.emperor || em.name, p.x, p.y - 26*this.scale);
                c.shadowColor = 'transparent'; c.shadowBlur = 0;
            }

            // ── Weapon name ──
            if (s.weapon && s.weapon.name !== 'Assault Rifle') {
                c.fillStyle = '#c49a30'; c.font = `bold ${Math.round(7*this.scale)}px "Georgia", serif`;
                c.fillText(s.weapon.name.substring(0,6), p.x, p.y - 8*this.scale);
            }
        }

        // ── PASS 4: Large empire banner at centroid of each empire's territories ──
        const empireTerrs = {};
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s || !s.owner) continue;
            if (!empireTerrs[s.owner]) empireTerrs[s.owner] = [];
            empireTerrs[s.owner].push(t);
        }
        for (const [eid, tList] of Object.entries(empireTerrs)) {
            const em = EMPIRES[eid];
            if (!em || tList.length < 2) continue;
            let cx = 0, cy = 0;
            for (const t of tList) { cx += t.cx; cy += t.cy; }
            cx /= tList.length; cy /= tList.length;
            const p = this.toScr(cx, cy);
            // Ancient parchment banner background
            c.save();
            c.font = `bold ${Math.round(13*this.scale)}px "Georgia", "Times New Roman", serif`;
            const label = (em.emperor || em.name).toUpperCase();
            const lw = c.measureText(label).width;
            const bannerH = 20 * this.scale;
            const bannerY = p.y - 46*this.scale;
            // Banner body
            const bannerGr = c.createLinearGradient(p.x - lw/2, bannerY, p.x - lw/2, bannerY + bannerH);
            bannerGr.addColorStop(0, 'rgba(50,28,8,0.75)');
            bannerGr.addColorStop(1, 'rgba(40,20,5,0.85)');
            c.fillStyle = bannerGr;
            c.beginPath();
            c.roundRect(p.x - lw/2 - 8*this.scale, bannerY, lw + 16*this.scale, bannerH, 5*this.scale);
            c.fill();
            // Empire color stripe
            c.fillStyle = em.color + 'aa';
            c.beginPath();
            c.roundRect(p.x - lw/2 - 8*this.scale, bannerY, lw + 16*this.scale, 3*this.scale, [5*this.scale, 5*this.scale, 0, 0]);
            c.fill();
            c.restore();
            // Emperor name text — warm gold
            c.fillStyle = '#e8d0a0';
            c.font = `bold ${Math.round(13*this.scale)}px "Georgia", "Times New Roman", serif`;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.shadowColor = 'rgba(30,15,0,0.8)'; c.shadowBlur = 4;
            c.fillText(label, p.x, bannerY + bannerH/2);
            c.shadowColor = 'transparent'; c.shadowBlur = 0;
        }
    }

    _weaponTier(weapon) {
        for (const [tier, weapons] of Object.entries(WEAPONS)) {
            if (weapons.includes(weapon)) return parseInt(tier);
        }
        return 0;
    }

    // ── ANIMATED FLAG ──────────────────────────────────────
    _drawFlag(c, x, y, color, light, sc) {
        const flagW = 14 * sc, flagH = 9 * sc;
        const poleH = 20 * sc;
        const wave = Math.sin(this.time * 0.06) * 2 * sc;

        // Pole
        c.strokeStyle = '#8B7355';
        c.lineWidth = 1.5 * sc;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + poleH);
        c.stroke();

        // Flag cloth with wave animation
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + flagW * 0.5, y + wave, x + flagW, y + wave * 0.5);
        c.lineTo(x + flagW, y + flagH + wave * 0.5);
        c.quadraticCurveTo(x + flagW * 0.5, y + flagH + wave * 0.3, x, y + flagH);
        c.closePath();
        c.fill();

        // Flag shine
        c.fillStyle = light + '44';
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + flagW * 0.3, y + wave * 0.6, x + flagW * 0.5, y + wave * 0.3);
        c.lineTo(x + flagW * 0.5, y + flagH * 0.5 + wave * 0.2);
        c.quadraticCurveTo(x + flagW * 0.3, y + flagH * 0.5 + wave * 0.15, x, y + flagH);
        c.closePath();
        c.fill();

        // Pole cap (gold ball)
        c.fillStyle = '#ffd700';
        c.beginPath();
        c.arc(x, y - 1.5 * sc, 2 * sc, 0, Math.PI * 2);
        c.fill();
    }

    // ── FOG OF WAR ──────────────────────────────────────────
    _drawFogOfWar() {
        const c = this.ctx, g = this.g;
        if (!g.ts || g.state !== 'playing') return;

        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s) continue;
            // Fog covers territories not adjacent to player's territories
            const isAdjacent = g.player && TERRITORIES.some(pt => {
                const ps = g.ts[pt.id];
                return ps && ps.owner === g.player && pt.adj.includes(t.id);
            });
            const isPlayerOwned = s.owner === g.player;

            if (!isPlayerOwned && !isAdjacent) {
                // Dense fog
                const p = this.toScr(t.cx, t.cy);
                const fogAlpha = 0.35 + Math.sin(this.time * 0.01 + t.id * 0.9) * 0.08;
                c.fillStyle = `rgba(40,35,50,${fogAlpha})`;

                // Draw fog as polygon
                const fogPolys = t.polys || (t.poly ? [t.poly] : []);
                for (const fPoly of fogPolys) {
                    c.beginPath();
                    const first = this.toScr(fPoly[0][0], fPoly[0][1]);
                    c.moveTo(first.x, first.y);
                    for (let i = 1; i < fPoly.length; i++) {
                        const pp = this.toScr(fPoly[i][0], fPoly[i][1]);
                        c.lineTo(pp.x, pp.y);
                    }
                    c.closePath();
                    c.fill();
                }

                // Fog wisps
                if (Math.random() < 0.02) {
                    this.particles.push({
                        x: p.x + (Math.random() - 0.5) * 30 * this.scale,
                        y: p.y + (Math.random() - 0.5) * 20 * this.scale,
                        vx: (Math.random() - 0.5) * 0.4,
                        vy: -0.1 - Math.random() * 0.2,
                        life: 1,
                        decay: 0.005,
                        size: 4 + Math.random() * 6,
                        color: 'rgba(80,75,100,0.15)',
                        type: 'smoke',
                        gravity: -0.01,
                        drag: 0.99,
                        phase: Math.random() * 6,
                    });
                }
            }
        }
    }

    _drawParticles() {
        const c = this.ctx;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += (p.gravity || 0.1); p.life -= p.decay;
            p.vx *= (p.drag || 1);
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
            const alpha = Math.min(1, p.life);
            c.globalAlpha = alpha;

            switch (p.type) {
                case 'fire': {
                    const flicker = 0.7 + Math.sin(this.time * 0.3 + p.x) * 0.3;
                    const sz = p.size * alpha * flicker;
                    const fireGr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz);
                    fireGr.addColorStop(0, '#ffff00');
                    fireGr.addColorStop(0.4, p.color || '#ff6600');
                    fireGr.addColorStop(1, 'rgba(255,0,0,0)');
                    c.fillStyle = fireGr;
                    c.beginPath(); c.arc(p.x, p.y, sz, 0, Math.PI * 2); c.fill();
                    break;
                }
                case 'smoke': {
                    const sz = p.size * (2 - alpha);
                    c.fillStyle = p.color || 'rgba(100,90,80,0.3)';
                    c.beginPath(); c.arc(p.x, p.y, sz, 0, Math.PI * 2); c.fill();
                    break;
                }
                case 'spark': {
                    c.fillStyle = p.color || '#ffd700';
                    c.beginPath(); c.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); c.fill();
                    c.strokeStyle = p.color || '#ffd700'; c.lineWidth = 1;
                    c.beginPath();
                    c.moveTo(p.x, p.y);
                    c.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
                    c.stroke();
                    break;
                }
                case 'blood': {
                    c.fillStyle = p.color || '#cc0000';
                    c.beginPath(); c.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); c.fill();
                    break;
                }
                case 'explosion': {
                    const sz = p.size * (1.5 - alpha * 0.5);
                    const expGr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz);
                    expGr.addColorStop(0, '#ffffff');
                    expGr.addColorStop(0.3, p.color || '#ff8800');
                    expGr.addColorStop(1, 'rgba(255,50,0,0)');
                    c.fillStyle = expGr;
                    c.beginPath(); c.arc(p.x, p.y, sz, 0, Math.PI * 2); c.fill();
                    break;
                }
                case 'ember': {
                    const glow = 0.5 + Math.sin(this.time * 0.1 + p.phase) * 0.5;
                    c.fillStyle = p.color || '#ff6600';
                    c.globalAlpha = alpha * glow;
                    c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
                    c.globalAlpha = alpha * glow * 0.3;
                    c.beginPath(); c.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); c.fill();
                    break;
                }
                case 'dust': {
                    c.fillStyle = p.color || 'rgba(180,160,120,0.2)';
                    c.beginPath(); c.arc(p.x, p.y, p.size * (2 - alpha), 0, Math.PI * 2); c.fill();
                    break;
                }
                case 'confetti': {
                    c.save();
                    c.translate(p.x, p.y);
                    c.rotate(p.phase + (p.rotSpeed || 0) * this.time);
                    c.fillStyle = p.color || '#ffd700';
                    c.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
                    c.restore();
                    break;
                }
                default:
                    c.fillStyle = p.color || '#fff';
                    c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
        }
        c.globalAlpha = 1;
    }

    // Spawn particle burst at screen position
    _spawnBurst(x, y, type, count, color, opts = {}) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const speed = (opts.speed || 3) + Math.random() * (opts.speedVar || 3);
            this.particles.push({
                x: x + (Math.random() - 0.5) * (opts.spread || 10),
                y: y + (Math.random() - 0.5) * (opts.spread || 10),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed + (opts.upward || 0),
                life: 1,
                decay: (opts.decay || 0.02) + Math.random() * (opts.decayVar || 0.01),
                size: (opts.size || 3) + Math.random() * (opts.sizeVar || 2),
                color: color || '#ffd700',
                type: type,
                gravity: opts.gravity !== undefined ? opts.gravity : 0.08,
                drag: opts.drag || 1,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    // Ambient map effects — fires on territories, floating embers
    _drawAmbientEffects() {
        const c = this.ctx, g = this.g;
        if (g.state !== 'playing' && g.state !== 'attack' && g.state !== 'battle' && g.state !== 'moveDialog') return;

        // Campfires on player territories (warm glow)
        for (const t of TERRITORIES) {
            const s = g.ts[t.id];
            if (!s || !s.owner) continue;
            const p = this.toScr(t.cx, t.cy);

            // Subtle territory glow (empire color pulse)
            const em = EMPIRES[s.owner];
            if (em && s.owner === g.player) {
                const glowPulse = 0.03 + Math.sin(this.time * 0.02 + t.id * 0.7) * 0.015;
                const glowGr = c.createRadialGradient(p.x, p.y, 5, p.x, p.y, 40 * this.scale);
                glowGr.addColorStop(0, em.color.slice(0, 7) + Math.floor(glowPulse * 255).toString(16).padStart(2, '0'));
                glowGr.addColorStop(1, 'rgba(0,0,0,0)');
                c.fillStyle = glowGr;
                c.beginPath(); c.arc(p.x, p.y, 40 * this.scale, 0, Math.PI * 2); c.fill();
            }

            // Campfire particles on territories with troops
            if (s.troops > 3 && Math.random() < 0.15) {
                this.particles.push({
                    x: p.x + (Math.random() - 0.5) * 20 * this.scale,
                    y: p.y + 5 * this.scale,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: -0.5 - Math.random() * 0.8,
                    life: 1,
                    decay: 0.025 + Math.random() * 0.015,
                    size: 1.5 + Math.random() * 2,
                    color: Math.random() > 0.5 ? '#ff6600' : '#ffaa00',
                    type: 'ember',
                    gravity: -0.02,
                    drag: 0.99,
                    phase: Math.random() * 6,
                });
            }
        }

        // Ambient floating dust motes
        if (Math.random() < 0.08) {
            this.particles.push({
                x: Math.random() * this.g.W,
                y: this.g.H + 5,
                vx: (Math.random() - 0.5) * 0.3,
                vy: -0.2 - Math.random() * 0.3,
                life: 1,
                decay: 0.003,
                size: 1 + Math.random(),
                color: 'rgba(200,180,140,0.15)',
                type: 'dust',
                gravity: -0.005,
                drag: 1,
                phase: Math.random() * 6,
            });
        }
    }

    addCaptureAnim(tid, newColor, oldColor) {
        const p = this.toScr(T(tid).cx, T(tid).cy);
        this.captureAnims.push({
            tid, x: p.x, y: p.y,
            newColor, oldColor,
            progress: 0,
            speed: 0.08,
        });
        // Conquest particle explosion
        this._spawnBurst(p.x, p.y, 'explosion', 12, newColor, { speed: 4, speedVar: 4, decay: 0.025, size: 6, sizeVar: 4, gravity: 0.05 });
        this._spawnBurst(p.x, p.y, 'spark', 20, '#ffd700', { speed: 5, speedVar: 4, decay: 0.02, size: 2, sizeVar: 2, upward: -2 });
        this._spawnBurst(p.x, p.y, 'smoke', 6, 'rgba(100,80,60,0.3)', { speed: 1, speedVar: 1, decay: 0.008, size: 8, sizeVar: 5, gravity: -0.05, drag: 0.98 });
        // Confetti burst (addictive celebration effect)
        const confettiColors = ['#ffd700', '#ff4444', '#44ff44', '#4488ff', '#ff44ff', '#ffaa00', '#00ffcc'];
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            this.particles.push({
                x: p.x, y: p.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 3,
                life: 1,
                decay: 0.008 + Math.random() * 0.008,
                size: 3 + Math.random() * 4,
                color: confettiColors[i % confettiColors.length],
                type: 'confetti',
                gravity: 0.06,
                drag: 0.99,
                phase: Math.random() * 6,
                rotSpeed: (Math.random() - 0.5) * 0.3,
            });
        }
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
            c.fillStyle = i === 0 ? '#E65100' : (i === 1 ? '#757575' : '#424242');
            c.font = i === 0 ? 'bold 14px "Segoe UI", sans-serif' : '12px "Segoe UI", sans-serif';
            c.fillText(lines[i], tx + pad, ty + pad + i * lineH);
        }
    }

    // ── WORLD MAP MINI HUD (minimal overlay, no buttons) ──
    _worldMiniHUD() {
        const c = this.ctx, g = this.g;
        const emp = g.empires[g.player];
        const em = EMPIRES[g.player];
        if (!emp) return;

        // Initialize buttons for world map
        g.btns = [];

        // ══ CONQUEST PROGRESS BAR (top of screen) ══
        const totalT = TERRITORIES.length;
        const playerT = emp.tids.length;
        const pct = playerT / totalT;
        const barH = 6, barY = 0;
        // Background
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(0, barY, g.W, barH);
        // Player progress
        const progGr = c.createLinearGradient(0, barY, g.W * pct, barY);
        progGr.addColorStop(0, em.dark);
        progGr.addColorStop(1, em.color);
        c.fillStyle = progGr;
        c.fillRect(0, barY, g.W * pct, barH);
        // Glow on leading edge
        const glowX = g.W * pct;
        c.fillStyle = em.light;
        c.fillRect(glowX - 2, barY, 4, barH);
        // Percentage text
        c.fillStyle = '#fff'; c.font = 'bold 9px "Segoe UI", sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'bottom';
        c.fillText(`${Math.round(pct * 100)}% CONQUERED`, 6, barY + barH - 1);

        // Top-left: empire name + turn (semi-transparent, small)
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.45)';
        this._rr(c, 8, 12, 200, 52, 8); c.fill();
        c.strokeStyle = em.color + '80'; c.lineWidth = 1;
        this._rr(c, 8, 12, 200, 52, 8); c.stroke();

        c.fillStyle = em.color; c.font = 'bold 14px Georgia, serif';
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillText(em.icon + ' ' + em.name, 16, 18);
        c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = '11px "Segoe UI", sans-serif';
        c.fillText(`Turn ${g.turn}  |  Coins: ${emp.coins}  |  Lands: ${playerT}/${totalT}`, 16, 40);
        // Level + XP bar
        if (g.stats.level) {
            const lvl = g.stats.level;
            const xpNeeded = g._xpForLevel(lvl);
            const xpPct = Math.min(g.stats.xp / xpNeeded, 1);
            c.fillStyle = '#ffd700'; c.font = 'bold 11px "Segoe UI", sans-serif';
            c.fillText(`⭐ Lv.${lvl}`, 16, 54);
            // XP bar background
            const xpBarX = 70, xpBarW = 130, xpBarH2 = 8, xpBarY2 = 57;
            c.fillStyle = 'rgba(0,0,0,0.5)';
            c.beginPath(); c.roundRect(xpBarX, xpBarY2, xpBarW, xpBarH2, 4); c.fill();
            // XP fill
            const xpGr = c.createLinearGradient(xpBarX, 0, xpBarX + xpBarW, 0);
            xpGr.addColorStop(0, '#f39c12'); xpGr.addColorStop(1, '#ffd700');
            c.fillStyle = xpGr;
            c.beginPath(); c.roundRect(xpBarX, xpBarY2, xpBarW * xpPct, xpBarH2, 4); c.fill();
            // XP text
            c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = '8px "Segoe UI", sans-serif';
            c.fillText(`${g.stats.xp}/${xpNeeded} XP`, xpBarX + 3, xpBarY2 + xpBarH2 - 1);
        }
        c.restore();

        // Bottom-center: phase hint or navigation hint
        const aliveCount = EIDS.filter(id => g.empires[id]?.alive).length;
        c.save();
        let hintMsg = `${aliveCount} empires alive  |  Click your territory to manage`;
        let hintColor = 'rgba(255,255,255,0.6)';
        if (g.phase === 'attack') {
            hintMsg = '\u2694 ATTACK MODE — Click an adjacent enemy territory';
            hintColor = 'rgba(255,100,100,0.9)';
        } else if (g.phase === 'move') {
            hintMsg = '\uD83D\uDCCC MOVE MODE — Click an adjacent friendly territory';
            hintColor = 'rgba(100,200,255,0.9)';
        }
        const hintW = 360, hintH = 32;
        const hintX = (g.W - hintW) / 2, hintY = g.H - hintH - 10;
        c.fillStyle = 'rgba(0,0,0,0.5)';
        this._rr(c, hintX, hintY, hintW, hintH, 8); c.fill();
        if (g.phase !== 'select') {
            c.strokeStyle = g.phase === 'attack' ? 'rgba(255,80,80,0.7)' : 'rgba(80,180,255,0.7)';
            c.lineWidth = 2;
            this._rr(c, hintX, hintY, hintW, hintH, 8); c.stroke();
        }
        c.fillStyle = hintColor; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(hintMsg, g.W / 2, hintY + hintH / 2);

        // Cancel button for attack/move mode
        if (g.phase !== 'select') {
            const cancelW = 80, cancelH = 28;
            const cancelX = hintX + hintW + 8, cancelY = hintY + 2;
            this._rr(c, cancelX, cancelY, cancelW, cancelH, 6);
            c.fillStyle = 'rgba(180,60,60,0.8)'; c.fill();
            c.fillStyle = '#fff'; c.font = 'bold 12px "Segoe UI", sans-serif';
            c.fillText('\u2716 Cancel', cancelX + cancelW / 2, cancelY + cancelH / 2);
            g.btns.push({ rect: { x: cancelX, y: cancelY, w: cancelW, h: cancelH }, fn: () => { g.phase = 'select'; g.sfx.click(); } });
        }
        c.restore();

    }

    // ── HUD (kept for attack/move/combat overlays) ───
    _hud() {
        const c = this.ctx, g = this.g, { W } = g;
        const emp = g.empires[g.player], em = EMPIRES[g.player];
        if (!emp) return;

        // ── 3D raised button helper ──
        const draw3DBtn = (bx, by, bw, bh, baseR, baseG, baseB, isActive) => {
            const r = 8;
            // Shadow (3px below)
            c.fillStyle = 'rgba(200,180,150,0.4)';
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

        // ── Top bar (65px) - bright with colorful accents ──
        const TOP_H = 65;
        const hudGr = c.createLinearGradient(0, 0, 0, TOP_H);
        hudGr.addColorStop(0, 'rgba(255, 248, 225, 0.95)');
        hudGr.addColorStop(1, 'rgba(255, 243, 224, 0.92)');
        c.fillStyle = hudGr; c.fillRect(0, 0, W, TOP_H);
        c.fillStyle = '#E65100'; c.fillRect(0, TOP_H - 2, W, 2);

        // Empire color bar and name
        c.fillStyle = em.color; c.fillRect(10, 8, 6, 49);
        c.fillStyle = '#D32F2F'; c.font = 'bold 18px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(em.name, 24, 22);

        // Stats row
        c.font = '14px "Segoe UI", sans-serif';
        c.fillStyle = '#E65100';
        c.fillText(`Coins: ${emp.coins}`, 24, 48);
        c.fillStyle = '#5D4037';
        c.fillText(`Territories: ${emp.tids.length}/${TERRITORIES.length}`, 155, 48);

        // Conquest progress bar (wider)
        const progW = 120, progH = 10, progX = 340, progY = 42;
        c.fillStyle = 'rgba(200,200,200,0.3)'; this._rr(c, progX, progY, progW, progH, 5); c.fill();
        const progFill = emp.tids.length / TERRITORIES.length;
        if (progFill > 0) {
            const progGr = c.createLinearGradient(progX, 0, progX + progW, 0);
            progGr.addColorStop(0, '#e74c3c'); progGr.addColorStop(0.5, '#f39c12'); progGr.addColorStop(1, '#27ae60');
            c.fillStyle = progGr;
            this._rr(c, progX, progY, Math.max(5, progW * progFill), progH, 5); c.fill();
        }
        c.strokeStyle = '#E65100'; c.lineWidth = 1; this._rr(c, progX, progY, progW, progH, 5); c.stroke();

        const totalTroops = emp.tids.reduce((s, id) => s + g.ts[id].troops, 0);
        c.fillStyle = '#5D4037'; c.fillText(`Troops: ${totalTroops}`, 470, 48);

        // Alive/dead empire count
        const aliveCount = EIDS.filter(id => g.empires[id]?.alive).length;
        c.textAlign = 'right';
        c.fillStyle = '#5D4037';
        c.fillText(`Turn ${g.turn}  |  ${aliveCount} empires alive`, W - 15, 22);
        c.fillStyle = '#D32F2F'; c.fillText(g._isAI() ? 'AI Turn' : 'Your Turn', W - 15, 48);

        // Phase bar
        const msg = g.phaseMsg();
        if (msg) {
            const bh = 32, by = g.H - bh - 40;
            c.fillStyle = 'rgba(255, 248, 225, 0.88)';
            this._rr(c, 12, by, W - 24, bh, 8); c.fill();
            c.strokeStyle = '#E65100'; c.lineWidth = 1;
            this._rr(c, 12, by, W - 24, bh, 8); c.stroke();
            c.fillStyle = '#4E342E'; c.font = '13px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText(msg, W / 2, by + bh / 2);
        }

        // ── Buttons (don't clear — render() already clears at frame start) ──
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

    // Quit Empire / Change Empire button
    const quitLabel = '🏳️ Quit Empire';
    const quitW = Math.max(smBtnMinW, c.measureText(quitLabel).width + 28);
    const hudQuitBtnX = hudSaveBtnX - smBtnGap - quitW;
    const hudQuitBtn = { label: 'quitEmpire', fn: () => {
        g.state = 'menu';
        g.player = null;
        g.turn = 0;
        g.phase = 'select';
        g.sel = null;
        g.hover = null;
        g.ts = {};
        g.log = [];
        g.sfx.click();
    }};
    hudQuitBtn.rect = { x: hudQuitBtnX, y: smBtnY, w: quitW, h: smBtnH };
    g.btns.push(hudQuitBtn);
    draw3DBtn(hudQuitBtnX, smBtnY, quitW, smBtnH, 180, 60, 60, true);
    c.fillStyle = '#f5e6c8'; c.font = 'bold 13px "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(quitLabel, hudQuitBtnX + quitW / 2, smBtnY + smBtnH / 2);

    // Sound mute/unmute button
    const soundLabel = g.sound?.muted ? '🔇 Muted' : '🔊 Sound';
    const soundW = Math.max(smBtnMinW, c.measureText(soundLabel).width + 28);
    const hudSoundBtnX = hudQuitBtnX - smBtnGap - soundW;
    const hudSoundBtn = { label: 'toggleSound', fn: () => {
        if (g.sound) {
            if (!g.sound.initialized) g.sound.init();
            g.sound.toggleMute();
            g.sfx.click();
        }
    }};
    hudSoundBtn.rect = { x: hudSoundBtnX, y: smBtnY, w: soundW, h: smBtnH };
    g.btns.push(hudSoundBtn);
    draw3DBtn(hudSoundBtnX, smBtnY, soundW, smBtnH, g.sound?.muted ? 120 : 60, g.sound?.muted ? 60 : 120, 60, true);
    c.fillStyle = '#f5e6c8'; c.font = 'bold 13px "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(soundLabel, hudSoundBtnX + soundW / 2, smBtnY + smBtnH / 2);

    // Switch Mode button (toggle online/offline)
    const switchLabel = g._gameMode === 'online' ? '\u{1F310} Online' : '\u{1F3DB} Offline';
    const switchColor = g._gameMode === 'online' ? [30, 136, 229] : [198, 40, 40];
    const switchW = Math.max(smBtnMinW, c.measureText(switchLabel).width + 28);
    const hudSwitchBtnX = hudSoundBtnX - smBtnGap - switchW;
    const hudSwitchBtn = { label: 'switchMode', fn: () => {
        g._gameMode = g._gameMode === 'online' ? 'offline' : 'online';
        g.sfx.click();
        g._log('Switched to ' + g._gameMode.toUpperCase() + ' mode');
    }};
    hudSwitchBtn.rect = { x: hudSwitchBtnX, y: smBtnY, w: switchW, h: smBtnH };
    g.btns.push(hudSwitchBtn);
    draw3DBtn(hudSwitchBtnX, smBtnY, switchW, smBtnH, switchColor[0], switchColor[1], switchColor[2], true);
    c.fillStyle = '#f5e6c8'; c.font = 'bold 13px "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(switchLabel, hudSwitchBtnX + switchW / 2, smBtnY + smBtnH / 2);

        // ── Action buttons (48px tall, min 120px wide, 3D raised) ──
        const btnH = 48, btnGap = 8, btnMinW = 120, btnFont = 'bold 16px "Segoe UI", sans-serif';
        const row1Y = TOP_H + 7;  // 72
        const row2Y = row1Y + btnH + btnGap + 3;  // 131

        const btns = [
            { label: '🛒 Shop', active: true, fn: () => { if (!g.sel && g.empires[g.player].tids.length > 0) g.sel = g.empires[g.player].tids[0]; g.state = 'shop'; g.sfx.click(); } },
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
                c.fillStyle = b.active ? '#4E342E' : '#9E9E9E';
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

        c.fillStyle = 'rgba(200,180,150,0.3)';
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

        // Bright panel background
        const panelGr = c.createLinearGradient(px, py, px + panelW, py);
        panelGr.addColorStop(0, 'rgba(255, 248, 225, 0.93)');
        panelGr.addColorStop(1, 'rgba(255, 243, 224, 0.90)');
        this._rr(c, px, py, panelW, ph, 10); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#E65100'; c.lineWidth = 1.5;
        this._rr(c, px, py, panelW, ph, 10); c.stroke();

        // Title
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#D32F2F'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('EMPIRES', px + panelW/2, py + 16);

        // Divider
        c.strokeStyle = 'rgba(230,81,0,0.3)'; c.lineWidth = 1;
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
                c.fillStyle = 'rgba(211,47,47,0.12)'; c.fill();
            }

            // Color indicator
            c.fillStyle = alive ? em.color : '#BDBDBD';
            c.fillRect(px + 8, y - 5, 4, 18);

            // Empire name
            c.font = `${isPlayer ? 'bold ' : ''}11px "Segoe UI", sans-serif`;
            c.fillStyle = alive ? (isPlayer ? '#D32F2F' : '#4E342E') : '#BDBDBD';
            c.fillText(em.name.substring(0, 15), px + 18, y + 2);

            // Status line
            c.font = '9px "Segoe UI", sans-serif';
            if (alive) {
                c.fillStyle = '#795548';
                c.fillText(`${tCount} terr | ${emp.coins}c`, px + 18, y + 14);
            } else {
                c.fillStyle = '#D32F2F';
                c.fillText('ELIMINATED', px + 18, y + 14);
            }

            y += 34;
        }

        // Player stats at bottom
        y = py + ph - 70;
        c.strokeStyle = 'rgba(230,81,0,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 10, y); c.lineTo(px + panelW - 10, y); c.stroke();

        const stats = g.stats;
        c.fillStyle = '#D32F2F'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText('YOUR STATS', px + panelW/2, y + 14);

        c.textAlign = 'left'; c.font = '10px "Segoe UI", sans-serif';
        c.fillStyle = '#795548';
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
        c.fillStyle = 'rgba(180,150,100,0.25)';
        this._rr(c, px + 5, py + 5, pw, ph, 14); c.fill();

        // Dark panel
        const panelGr = c.createLinearGradient(px, py, px, py+ph);
        panelGr.addColorStop(0, '#FFFFFF'); panelGr.addColorStop(1, '#FFF8E1');
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

        c.fillStyle = '#4E342E'; c.font = '15px "Segoe UI", sans-serif';
        c.fillText('From: ' + fromT.name + ' (' + fromS.troops + ' troops)', px + pw/2, py + 65);
        c.fillText('To: ' + toT.name + ' (' + toS.troops + ' troops)', px + pw/2, py + 90);

        c.fillStyle = '#b89a6a'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText('Available: ' + available, px + pw/2, py + 120);
        c.fillStyle = '#E65100'; c.font = 'bold 20px "Segoe UI", sans-serif';
        c.fillText('Moving: ' + g.moveAmount, px + pw/2, py + 150);

        g.btns = [];

        // 3D button helper
        const d3 = (bx, by, bw, bh, topR, topG, topB, botR, botG, botB) => {
            c.fillStyle = 'rgba(180,150,100,0.2)'; this._rr(c, bx + 2, by + 2, bw, bh, 7); c.fill();
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
            c.fillStyle = '#D32F2F'; c.font = 'bold 18px "Segoe UI", sans-serif';
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
        c.fillStyle = '#4E342E'; c.font = 'bold 14px "Segoe UI", sans-serif';
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
        try {
        // FPS tracking
        this._fpsFrames++;
        const now = performance.now();
        if (now - this._fpsTime > 1000) {
            this._fps = this._fpsFrames;
            this._fpsFrames = 0;
            this._fpsTime = now;
        }
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
        else if (g.state === 'onlineLobby') this._onlineLobbyScreen();
        else if (g.state === 'empireSelect') this._empSel();
        else if (g.state === 'playing') {
            this._world(); this._worldMiniHUD();
        }
        else if (g.state === 'moveDialog') {
            this._world(); this._moveDialog();
        }
        else if (g.state === 'attack') {
            this._world(); this._attackPanel();
        }
        else if (g.state === 'combat') {
            this._world(); this._drawCombatAnim();
        }
        else if (g.state === 'battle') {
            this._world(); this._battleOverlay();
        }
        else if (g.state === 'shop') {
            this._world(); this._shopPanel();
        }
        else if (g.state === 'territory') this._drawTerritoryView();
        else if (g.state === 'gameover') this._defeat();
        else if (g.state === 'victory') this._victory();

        // Screen transitions — drawn on top of everything
        this._drawTransition();

        // Notification popups (drawn on top of everything)
        this._drawNotifications();
        // Floating text (+10 gold etc)
        this._drawFloats();

        // Screen flash effect (explosions, captures)
        if (this.flash.alpha > 0) {
            c.fillStyle = this.flash.color.replace(')', `,${this.flash.alpha})`).replace('rgb', 'rgba');
            c.fillRect(0, 0, g.W, g.H);
            this.flash.alpha -= 0.03;
        }

        // AI turn indicator — show when AI is about to play
        if (g.state === 'playing' && !g._isAI() && g._autoEndTurnDelay > 0) {
            this._drawAITurnIndicator();
        }

        // ── UNIVERSAL BACK BUTTON on every non-menu screen ──
        if (g.state !== 'menu' && g.state !== 'combat') {
            this._drawBackButton();
        }

        // ── FPS counter (production debug) ──
        c.save();
        c.globalAlpha = 0.4;
        c.fillStyle = '#0f0';
        c.font = '10px monospace';
        c.textAlign = 'right';
        c.fillText(this._fps + ' FPS', g.W - 8, g.H - 8);
        c.restore();
        } catch(e) { console.error('RENDER ERROR:', e.message, e.stack); window.__renderErr = e.message + '\n' + e.stack; }
    }

    // ── UNIVERSAL BACK BUTTON ──
    _drawBackButton() {
        const c = this.ctx, g = this.g;
        const bw = 70, bh = 28;
        const hasHUD = (g.state === 'playing' || g.state === 'attack' || g.state === 'moveDialog');
        const bx = 10, by = hasHUD ? 66 : 10;
        g._backBtnRect = { x: bx, y: by, w: bw, h: bh };
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.5)';
        this._rr(c, bx, by, bw, bh, 6); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.3)';
        c.lineWidth = 1;
        this._rr(c, bx, by, bw, bh, 6); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('\u2190 Back', bx + bw/2, by + bh/2);
        c.restore();
    }

    // ── SCREEN TRANSITION SYSTEM ────────────────────────────────
    startTransition(type, callback) {
        this.transition = { active: true, phase: 'out', alpha: 0, speed: 0.15, callback, type: type || 'fade' };
    }

    _drawTransition() {
        const t = this.transition;
        if (!t.active) return;
        const c = this.ctx, { W, H } = this.g;

        if (t.phase === 'out') {
            t.alpha = Math.min(1, t.alpha + t.speed);
            if (t.alpha >= 1) {
                t.phase = 'in';
                if (t.callback) t.callback();
                t.callback = null;
            }
        } else if (t.phase === 'in') {
            t.alpha = Math.max(0, t.alpha - t.speed);
            if (t.alpha <= 0) {
                t.active = false;
                t.phase = 'none';
            }
        }

        if (t.alpha <= 0) return;

        switch (t.type) {
            case 'fade':
                c.fillStyle = `rgba(0,0,0,${t.alpha})`;
                c.fillRect(0, 0, W, H);
                break;
            case 'wipe-right': {
                const wipeX = W * (1 - t.alpha);
                c.fillStyle = '#000';
                c.fillRect(wipeX, 0, W - wipeX, H);
                // Edge glow
                const edgeGr = c.createLinearGradient(wipeX - 30, 0, wipeX + 10, 0);
                edgeGr.addColorStop(0, 'rgba(255,215,0,0)');
                edgeGr.addColorStop(0.8, `rgba(255,215,0,${t.alpha * 0.3})`);
                edgeGr.addColorStop(1, 'rgba(255,215,0,0)');
                c.fillStyle = edgeGr;
                c.fillRect(wipeX - 30, 0, 40, H);
                break;
            }
            case 'wipe-down': {
                const wipeY = H * (1 - t.alpha);
                c.fillStyle = '#000';
                c.fillRect(0, wipeY, W, H - wipeY);
                break;
            }
            case 'zoom': {
                // Zoom from center
                const zoomScale = 1 + t.alpha * 0.5;
                c.save();
                c.translate(W / 2, H / 2);
                c.scale(zoomScale, zoomScale);
                c.fillStyle = `rgba(0,0,0,${t.alpha * 0.8})`;
                c.fillRect(-W / 2, -H / 2, W, H);
                c.restore();
                // Vignette
                const vigGr = c.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.5);
                vigGr.addColorStop(0, 'rgba(0,0,0,0)');
                vigGr.addColorStop(1, `rgba(0,0,0,${t.alpha})`);
                c.fillStyle = vigGr;
                c.fillRect(0, 0, W, H);
                break;
            }
            case 'curtain': {
                // Two curtains closing from sides
                const curtainW = (W / 2) * t.alpha;
                const leftGr = c.createLinearGradient(0, 0, curtainW + 20, 0);
                leftGr.addColorStop(0, '#1a0a05');
                leftGr.addColorStop(0.8, '#0d0503');
                leftGr.addColorStop(1, 'rgba(13,5,3,0.8)');
                c.fillStyle = leftGr;
                c.fillRect(0, 0, curtainW + 20, H);
                const rightGr = c.createLinearGradient(W, 0, W - curtainW - 20, 0);
                rightGr.addColorStop(0, '#1a0a05');
                rightGr.addColorStop(0.8, '#0d0503');
                rightGr.addColorStop(1, 'rgba(13,5,3,0.8)');
                c.fillStyle = rightGr;
                c.fillRect(W - curtainW - 20, 0, curtainW + 20, H);
                // Gold trim
                c.fillStyle = `rgba(255,215,0,${t.alpha * 0.5})`;
                c.fillRect(curtainW, 0, 3, H);
                c.fillRect(W - curtainW - 3, 0, 3, H);
                break;
            }
            default:
                c.fillStyle = `rgba(0,0,0,${t.alpha})`;
                c.fillRect(0, 0, W, H);
        }
    }

    // ── ATTACK PANEL ──────────────────────────────────────────
    _attackPanel() {
        const c = this.ctx, g = this.g;

        if (g._attackTarget === null || g._attackTarget === undefined) {
            // Show panel with no target selected — user must click a target button
        }

        const pw = 380, ph = 500, px = (g.W - pw)/2, py = (g.H - ph)/2;

        // 3D shadow behind panel
        c.fillStyle = 'rgba(180,150,100,0.25)';
        this._rr(c, px + 5, py + 5, pw, ph, 14); c.fill();

        // Warm cream panel (matching shop/move style)
        const panelGr = c.createLinearGradient(px, py, px, py+ph);
        panelGr.addColorStop(0, '#FFFFFF'); panelGr.addColorStop(1, '#FFF8E1');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 2.5;
        this._rr(c, px, py, pw, ph, 14); c.stroke();
        // Inner border highlight
        c.strokeStyle = 'rgba(231,76,60,0.2)'; c.lineWidth = 1;
        this._rr(c, px + 4, py + 4, pw - 8, ph - 8, 11); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(231,76,60,0.4)'; c.shadowBlur = 10;
        c.fillStyle = '#e74c3c'; c.font = 'bold 22px Georgia, serif';
        c.fillText('\u2694 Choose Strategy \u2694', px+pw/2, py+30);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;

        // Show attacker and defender territory names
        const atkName = g.sel != null && g.ts[g.sel] ? T(g.sel).name : '???';
        const defName = g._attackTarget != null ? T(g._attackTarget).name : '???';
        c.fillStyle = EMPIRES[g.player].color; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`${atkName} (${g.sel != null && g.ts[g.sel] ? g.ts[g.sel].troops : '?'}) troops)`, px + pw/2, py + 55);
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
        c.fillStyle = '#b7950b'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.fillText('\u2B05 Back', btx+btw/2, bty+14);

        // Target selection
        const allTargets = g.sel != null && g.ts[g.sel] ? T(g.sel).adj.filter(a => g.ts[a].owner !== g.player) : [];
        let btnStartY = py + 88;
        if (allTargets.length > 1) {
            c.fillStyle = '#5D4037'; c.font = '12px "Segoe UI", sans-serif';
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
                c.fillStyle = isTarget ? '#E65100' : '#5D4037'; c.textAlign = 'center';
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
            c.strokeStyle = equipped ? '#E65100' : '#FF9800'; c.lineWidth = 1;
            this._rr(c, wx, btnStartY, tw, 20, 4); c.stroke();
            c.fillStyle = equipped ? '#E65100' : '#5D4037'; c.textAlign = 'center';
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
            const canUse = !str.needTerrain || (g.sel != null && g.ts[g.sel] && str.needTerrain.includes(T(g.sel).terrain));
            const btn = { label: str.name, fn: () => { if (g._attackTarget != null) g._doAttack(i); else g.sfx.error(); } };
            btn.rect = { x: px+15, y: by, w: pw-30, h: 44 };
            g.btns.push(btn);

            const cardGr = c.createLinearGradient(px+15, by, px+15, by+44);
            cardGr.addColorStop(0, canUse ? 'rgba(231,76,60,0.08)' : 'rgba(150,150,150,0.08)');
            cardGr.addColorStop(1, canUse ? 'rgba(231,76,60,0.04)' : 'rgba(150,150,150,0.04)');
            this._rr(c, px+15, by, pw-30, 44, 8); c.fillStyle = cardGr; c.fill();
            c.strokeStyle = canUse ? '#e74c3c' : '#bdbdbd'; c.lineWidth = 1.5;
            this._rr(c, px+15, by, pw-30, 44, 8); c.stroke();

            c.textAlign = 'left';
            // Icon
            c.fillStyle = canUse ? '#e74c3c' : '#bdbdbd'; c.font = '18px serif';
            c.fillText(stratIcons[i] || '\u2694', px+22, by+22);
            // Name
            c.fillStyle = canUse ? '#c0392b' : '#9e9e9e'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText(str.name, px+46, by+16);
            c.fillStyle = canUse ? '#5D4037' : '#9e9e9e'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText(str.desc, px+46, by+34);
        }
    }

    // ── BATTLE OVERLAY ────────────────────────────────────────
    _battleOverlay() {
        const c = this.ctx, g = this.g, b = g.battle;
        if (!b) return;
        c.fillStyle = 'rgba(200,180,160,0.35)'; c.fillRect(0, 0, g.W, g.H);
        const cx = g.W/2, cy = g.H/2;

        // Battle panel background
        const pw = 440, ph = 380, px = cx - pw/2, py = cy - ph/2 + 20;

        // 3D shadow
        c.fillStyle = 'rgba(180,150,100,0.25)';
        this._rr(c, px + 5, py + 5, pw, ph, 14); c.fill();

        const panelGr = c.createLinearGradient(px, py, px, py+ph);
        panelGr.addColorStop(0, '#FFFFFF'); panelGr.addColorStop(1, '#FFF8E1');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 2.5;
        this._rr(c, px, py, pw, ph, 14); c.stroke();
        c.strokeStyle = 'rgba(231,76,60,0.2)'; c.lineWidth = 1;
        this._rr(c, px + 4, py + 4, pw - 8, ph - 8, 11); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = 'rgba(231,76,60,0.5)'; c.shadowBlur = 15;
        c.fillStyle = '#e74c3c'; c.font = 'bold 30px Georgia, serif';
        c.fillText('\u2694 BATTLE RESULTS \u2694', cx, cy-130);
        c.shadowColor = 'transparent'; c.shadowBlur = 0;

        // Territory names
        c.fillStyle = '#5D4037'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(T(b.from).name + ' \u2192 ' + T(b.to).name, cx, cy-108);

        // Attacker
        c.fillStyle = EMPIRES[b.atk].color; c.font = 'bold 18px "Segoe UI", sans-serif';
        c.fillText(EMPIRES[b.atk].name, cx-140, cy-85);
        c.fillStyle = '#5D4037'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Weapon: ${b.res.atkWeapon}`, cx-140, cy-65);
        c.fillText(`Bonus: +${b.res.atkBonus}`, cx-140, cy-48);

        // VS
        c.fillStyle = '#ffd700'; c.font = 'bold 24px Georgia, serif';
        c.fillText('VS', cx, cy-75);

        // Defender
        const defEm = b.def ? EMPIRES[b.def] : null;
        c.fillStyle = defEm ? defEm.color : '#5D4037'; c.font = 'bold 18px "Segoe UI", sans-serif';
        c.fillText(defEm ? defEm.name : 'Neutral', cx+140, cy-85);
        c.fillStyle = '#5D4037'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Weapon: ${b.res.defWeapon}`, cx+140, cy-65);
        c.fillText(`Bonus: +${b.res.defBonus}`, cx+140, cy-48);

        // Strategy
        c.fillStyle = '#4E342E'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText(`Strategy: ${b.res.strategy}`, cx, cy-30);

        // Dice
        const r = b.res;
        let dy = cy;
        c.font = '13px "Segoe UI", sans-serif';
        c.fillStyle = '#5D4037'; c.fillText('Attack Dice', cx-130, dy);
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
            c.fillStyle = '#4E342E'; c.fillText('Attackers lost ' + r.atkLoss + ' | Defenders lost ' + r.defLoss, cx, ry);
        }
        c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.fillText(`+${r.coins} coins`, cx, ry + 28);

        // Battle story narrative
        const story = this._generateBattleStory(b);
        let storyLineCount = 0;
        if (story) {
            c.fillStyle = '#5D4037'; c.font = 'italic 12px Georgia, serif';
            c.textAlign = 'center';
            const storyLines = this._wrapText(c, story, pw - 40);
            storyLineCount = storyLines.length;
            for (let i = 0; i < storyLines.length; i++) {
                c.fillText(storyLines[i], cx, ry + 52 + i * 16);
            }
        }

        const remainY = ry + 52 + storyLineCount * 16 + 6;
        c.fillStyle = '#5D4037'; c.font = '13px "Segoe UI", sans-serif';
        c.fillText(`Attacker: ${r.atkLeft} remaining | Defender: ${r.defLeft} remaining`, cx, remainY);

        // Narrate battle story once when overlay first appears
        if (story && !b._storyNarrated) {
            b._storyNarrated = true;
            this._narrate(story);
        }

        if (Math.floor(this.time/25) % 2 === 0) {
            c.fillStyle = '#ffd700'; c.font = 'bold 16px "Segoe UI", sans-serif';
            c.fillText('Click anywhere to continue', cx, ry + 85);
        }
    }

    _die(c, x, y, sz, val, col) {
        c.fillStyle = col; this._rr(c, x, y, sz, sz, 4); c.fill();
        c.fillStyle = '#FFFFFF'; c.font = `bold ${sz*0.5}px "Segoe UI", sans-serif`;
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
        c.fillStyle = 'rgba(180,150,100,0.3)';
        this._rr(c, px + 6, py + 6, pw, ph, 16); c.fill();

        // Panel body with rich gradient
        const panelGr = c.createLinearGradient(px, py, px, py + ph);
        panelGr.addColorStop(0, '#FFFFFF'); panelGr.addColorStop(0.5, '#FFF8E1'); panelGr.addColorStop(1, '#FFF3E0');
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
        c.fillStyle = 'rgba(180,150,100,0.2)'; this._rr(c, cbx + 2, cby + 2, cbw, cbh, 8); c.fill();
        const cbGr = c.createLinearGradient(cbx, cby, cbx, cby + cbh);
        cbGr.addColorStop(0, '#c0392b'); cbGr.addColorStop(1, '#922b21');
        this._rr(c, cbx, cby, cbw, cbh, 8); c.fillStyle = cbGr; c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 1; this._rr(c, cbx, cby, cbw, cbh, 8); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 18px sans-serif'; c.fillText('\u2715', cbx + cbw / 2, cby + cbh / 2);
        const closeBtn = { label: '\u2715', fn: () => { g.state = 'playing'; g.sfx.click(); } };
        closeBtn.rect = { x: cbx, y: cby, w: cbw, h: cbh }; g.btns.push(closeBtn);

        // ── TERRITORY SELECTOR ──
        let y = py + 82;
        c.fillStyle = '#5D4037'; c.font = 'bold 13px "Segoe UI", sans-serif'; c.textAlign = 'left';
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
            c.fillStyle = 'rgba(180,150,100,0.2)'; this._rr(c, chipX + 2, y + 2, chipW, chipH, 6); c.fill();
            const chipGr = c.createLinearGradient(chipX, y, chipX, y + chipH);
            chipGr.addColorStop(0, isSel ? '#E65100' : '#FFF3E0');
            chipGr.addColorStop(1, isSel ? '#8b6914' : '#EF9A9A');
            this._rr(c, chipX, y, chipW, chipH, 6); c.fillStyle = chipGr; c.fill();
            c.strokeStyle = isSel ? '#ffd700' : 'rgba(184,154,106,0.4)'; c.lineWidth = isSel ? 2 : 1;
            this._rr(c, chipX, y, chipW, chipH, 6); c.stroke();

            c.fillStyle = isSel ? '#D32F2F' : '#5D4037'; c.textAlign = 'center';
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
            c.fillStyle = 'rgba(200,180,150,0.15)'; this._rr(c, px + 18, y + 2, pw - 36, 32, 6); c.fill();
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
            { id: 'weapons', label: '\u{1F52B} WEAPONS', color: '#3498db' },
            { id: 'spy', label: '\U0001F575\uFE0F SPY', color: '#27ae60' },
        ];
        const tabW = 150, tabH = 38, tabGap = 8;
        const tabStartX = px + (pw - (tabs.length * tabW + (tabs.length - 1) * tabGap)) / 2;
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const tx = tabStartX + i * (tabW + tabGap), ty = y;
            const isActive = g._shopTab === tab.id;

            // 3D tab
            c.fillStyle = 'rgba(180,150,100,0.2)'; this._rr(c, tx + 2, ty + 2, tabW, tabH, 8); c.fill();
            const tabGr = c.createLinearGradient(tx, ty, tx, ty + tabH);
            if (isActive) {
                tabGr.addColorStop(0, tab.color); tabGr.addColorStop(1, tab.color + 'aa');
            } else {
                tabGr.addColorStop(0, '#FFF3E0'); tabGr.addColorStop(1, '#FFE0B2');
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
            c.fillStyle = 'rgba(180,150,100,0.2)'; this._rr(c, cx + 3, cy + 3, cw, ch, 10); c.fill();
            // Card body
            const cardGr = c.createLinearGradient(cx, cy, cx, cy + ch);
            cardGr.addColorStop(0, canBuy ? '#FFF8E1' : '#F5F5F5');
            cardGr.addColorStop(1, canBuy ? '#FFF3E0' : '#EEEEEE');
            this._rr(c, cx, cy, cw, ch, 10); c.fillStyle = cardGr; c.fill();
            // Border with glow
            if (canBuy && glowColor) {
                const pulse = 0.5 + Math.sin(this.time * 0.06) * 0.3;
                c.shadowColor = glowColor; c.shadowBlur = 8 * pulse;
            }
            c.strokeStyle = canBuy ? (glowColor || '#b7950b') : '#E0E0E0'; c.lineWidth = canBuy ? 2 : 1;
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
                c.fillStyle = canBuy ? '#ffd700' : '#9e9e9e';
                c.fillText(item.icon, px + 55, y + 29);
                // Name
                c.textAlign = 'left'; c.fillStyle = canBuy ? '#4E342E' : '#9e9e9e'; c.font = 'bold 15px "Segoe UI", sans-serif';
                c.fillText(item.name, px + 85, y + 22);
                // Description
                c.fillStyle = canBuy ? '#5D4037' : '#bdbdbd'; c.font = '12px "Segoe UI", sans-serif';
                c.fillText(item.desc, px + 85, y + 42);
                // Cost badge
                const costW = 90, costH = 28, costX = px + pw - 20 - costW, costY = y + 15;
                const costGr = c.createLinearGradient(costX, costY, costX, costY + costH);
                costGr.addColorStop(0, canBuy ? '#196f3d' : '#EF9A9A');
                costGr.addColorStop(1, canBuy ? '#145a32' : '#E57373');
                this._rr(c, costX, costY, costW, costH, 6); c.fillStyle = costGr; c.fill();
                c.strokeStyle = canBuy ? '#27ae60' : '#E0E0E0'; c.lineWidth = 1;
                this._rr(c, costX, costY, costW, costH, 6); c.stroke();
                c.fillStyle = canBuy ? '#2ecc71' : '#9e9e9e'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'center';
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
                c.fillStyle = unlocked ? tierColors[tier] : (canAfford ? '#b7950b' : '#9e9e9e');
                c.fillText(tierNames[tier].split(' ')[0], px + 55, y + 28);
                // Tier name
                c.textAlign = 'left'; c.font = 'bold 15px "Segoe UI", sans-serif';
                c.fillStyle = unlocked ? '#4E342E' : (canAfford ? '#b7950b' : '#9e9e9e');
                c.fillText(tierNames[tier].split(' ').slice(1).join(' '), px + 80, y + 20);
                // Description
                c.font = '12px "Segoe UI", sans-serif';
                c.fillStyle = unlocked ? '#5D4037' : '#9e9e9e';
                c.fillText(tierDescs[tier], px + 80, y + 38);
                // Status
                if (unlocked) {
                    c.fillStyle = '#2ecc71'; c.font = 'bold 13px "Segoe UI", sans-serif';
                    c.fillText('\u2713 UNLOCKED', px + 80, y + 56);
                } else {
                    // Unlock cost badge
                    const costW = 110, costH = 28, costX = px + pw - 20 - costW, costY = y + 21;
                    const costGr = c.createLinearGradient(costX, costY, costX, costY + costH);
                    costGr.addColorStop(0, canAfford ? tierColors[tier] : '#EF9A9A');
                    costGr.addColorStop(1, canAfford ? tierColors[tier] + 'aa' : '#EF9A9A');
                    this._rr(c, costX, costY, costW, costH, 6); c.fillStyle = costGr; c.fill();
                    c.strokeStyle = canAfford ? '#ffd700' : '#E0E0E0'; c.lineWidth = 1;
                    this._rr(c, costX, costY, costW, costH, 6); c.stroke();
                    c.fillStyle = canAfford ? '#ffd700' : '#9e9e9e'; c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'center';
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
                        c.fillStyle = 'rgba(180,150,100,0.15)'; this._rr(c, wx + 1, y + 1, tw, 28, 5); c.fill();
                        const wGr = c.createLinearGradient(wx, y, wx, y + 28);
                        wGr.addColorStop(0, equipped ? '#E65100' : '#FFF3E0');
                        wGr.addColorStop(1, equipped ? '#8b6914' : '#EF9A9A');
                        this._rr(c, wx, y, tw, 28, 5); c.fillStyle = wGr; c.fill();
                        c.strokeStyle = equipped ? '#ffd700' : 'rgba(184,154,106,0.4)'; c.lineWidth = equipped ? 2 : 1;
                        this._rr(c, wx, y, tw, 28, 5); c.stroke();
                        c.fillStyle = equipped ? '#D32F2F' : '#5D4037'; c.textAlign = 'center';
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
                c.fillStyle = canBuy ? '#ffd700' : '#9e9e9e'; c.fillText('\U0001F575\uFE0F', px + 60, y + 30);
                c.textAlign = 'left'; c.fillStyle = canBuy ? '#4E342E' : '#9e9e9e'; c.font = 'bold 16px "Segoe UI", sans-serif';
                c.fillText('Spy Network', px + 90, y + 24);
                c.fillStyle = canBuy ? '#5D4037' : '#bdbdbd'; c.font = '13px "Segoe UI", sans-serif';
                c.fillText('Reveal all enemy troop counts on the map', px + 90, y + 46);
                // Cost badge
                const costW = 100, costH = 30, costX = px + pw - 20 - costW, costY = y + 20;
                const costGr = c.createLinearGradient(costX, costY, costX, costY + costH);
                costGr.addColorStop(0, canBuy ? '#196f3d' : '#EF9A9A');
                costGr.addColorStop(1, canBuy ? '#145a32' : '#E57373');
                this._rr(c, costX, costY, costW, costH, 6); c.fillStyle = costGr; c.fill();
                c.strokeStyle = canBuy ? '#27ae60' : '#E0E0E0'; c.lineWidth = 1;
                this._rr(c, costX, costY, costW, costH, 6); c.stroke();
                c.fillStyle = canBuy ? '#2ecc71' : '#9e9e9e'; c.font = 'bold 15px "Segoe UI", sans-serif'; c.textAlign = 'center';
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
            c.fillStyle = 'rgba(180,150,100,0.35)';
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

        // Warm background with red aurora
        const bgGr = c.createRadialGradient(W/2, H*0.3, 50, W/2, H/2, W*0.9);
        bgGr.addColorStop(0, '#FFEBEE');
        bgGr.addColorStop(0.4, '#FFCDD2');
        bgGr.addColorStop(1, '#F8BBD0');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        // Red aurora bands
        for (let band = 0; band < 3; band++) {
            c.save();
            c.globalAlpha = 0.1 + band * 0.03;
            c.beginPath();
            const baseY = H * (0.05 + band * 0.07);
            c.moveTo(0, baseY);
            for (let x = 0; x <= W; x += 20) {
                const y = baseY + Math.sin(x * 0.005 + this.time * 0.008 + band) * 20;
                c.lineTo(x, y);
            }
            c.lineTo(W, baseY + H * 0.06);
            c.lineTo(0, baseY + H * 0.06);
            c.closePath();
            c.fillStyle = ['#EF5350', '#E53935', '#D32F2F'][band];
            c.fill();
            c.restore();
        }

        // Floating particles
        for (let i = 0; i < 30; i++) {
            const seed = i * 97.3;
            const px = ((seed * 5.1 + this.time * (0.2 + (i % 4) * 0.08)) % W);
            const py = ((seed * 2.3 + this.time * (0.4 + (i % 3) * 0.15)) % H);
            const sz = 1 + Math.sin(this.time * 0.03 + i) * 0.5;
            const alpha = 0.15 + Math.sin(this.time * 0.02 + i * 0.3) * 0.08;
            c.fillStyle = `rgba(231,76,60,${alpha})`;
            c.beginPath(); c.arc(px, py, sz, 0, Math.PI*2); c.fill();
        }

        c.textAlign = 'center'; c.textBaseline = 'middle';

        // Skull with glow
        c.save();
        c.shadowColor = 'rgba(231,76,60,0.7)';
        c.shadowBlur = 25 + Math.sin(this.time * 0.04) * 8;
        c.font = '72px serif';
        c.fillText('☠️', W/2, H*0.08);
        c.restore();

        // DEFEAT title with animated red glow
        c.save();
        const defeatGlow = 18 + Math.sin(this.time * 0.05) * 6;
        c.shadowColor = 'rgba(146,43,33,0.6)';
        c.shadowBlur = defeatGlow;
        c.fillStyle = '#e74c3c'; c.font = 'bold 60px Georgia, serif';
        c.fillText('DEFEAT', W/2, H*0.18);
        c.restore();

        c.fillStyle = '#795548'; c.font = '18px "Segoe UI", sans-serif';
        c.fillText(`Your empire fell on turn ${this.g.turn}`, W/2, H*0.18+42);

        // Stats panel
        const pw = 360, ph = 240, px = (W - pw)/2, py = H*0.38;
        c.save();
        c.shadowColor = 'rgba(180,150,100,0.2)'; c.shadowBlur = 15;
        const panelGr = c.createLinearGradient(px, py, px+pw, py+ph);
        panelGr.addColorStop(0, '#FFFFFF'); panelGr.addColorStop(1, '#FFF8E1');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.restore();
        c.strokeStyle = '#D32F2F'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 14); c.stroke();
        c.strokeStyle = 'rgba(211,47,47,0.15)'; c.lineWidth = 1;
        this._rr(c, px+5, py+5, pw-10, ph-10, 11); c.stroke();

        c.fillStyle = '#D32F2F'; c.font = 'bold 16px "Segoe UI", sans-serif';
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
            c.textAlign = 'left'; c.fillStyle = '#5D4037';
            c.fillText(s.label, px + 20, sy);
            c.textAlign = 'right'; c.fillStyle = '#D32F2F'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText(String(s.value), px + pw - 20, sy);
            c.font = '14px "Segoe UI", sans-serif';
            if (s !== statLines[statLines.length - 1]) {
                c.strokeStyle = 'rgba(211,47,47,0.15)'; c.lineWidth = 1;
                c.beginPath(); c.moveTo(px + 15, sy + 14); c.lineTo(px + pw - 15, sy + 14); c.stroke();
            }
            sy += 32;
        }

        // Pulsing return button
        const btnAlpha = 0.5 + Math.sin(this.time * 0.05) * 0.3;
        c.fillStyle = `rgba(211,47,47,${btnAlpha})`;
        c.font = 'bold 18px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText('Click to return to menu', W/2, H*0.82);

        this._drawSoldier(c, W*0.15, H*0.70, '#5D4037', false, this.time, 0, 'roman');
        this._drawSoldier(c, W*0.85, H*0.70, '#c0392b', false, this.time, 3, 'roman');
        this._drawShield(c, W*0.25, H*0.85, '#8b0000');
    }

    // ── VICTORY SCREEN (with stats) ───────────────────────────
    _victory() {
        const c = this.ctx, { W, H } = this.g;
        const stats = this.g.stats;

        // Bright golden background with aurora
        const bgGr = c.createRadialGradient(W/2, H*0.3, 50, W/2, H/2, W*0.9);
        bgGr.addColorStop(0, '#FFF8E1');
        bgGr.addColorStop(0.3, '#FFECB3');
        bgGr.addColorStop(0.7, '#FFE0B2');
        bgGr.addColorStop(1, '#FFCCBC');
        c.fillStyle = bgGr; c.fillRect(0, 0, W, H);

        // Aurora bands
        for (let band = 0; band < 3; band++) {
            c.save();
            c.globalAlpha = 0.08 + band * 0.02;
            c.beginPath();
            c.moveTo(0, H * (0.1 + band * 0.08));
            for (let x = 0; x <= W; x += 20) {
                const y = H * (0.1 + band * 0.08) + Math.sin(x * 0.005 + this.time * 0.01 + band) * 30;
                c.lineTo(x, y);
            }
            c.lineTo(W, H * (0.2 + band * 0.08));
            c.lineTo(0, H * (0.2 + band * 0.08));
            c.closePath();
            const auroraColors = ['#ffd700', '#ff6b35', '#ff4444'];
            c.fillStyle = auroraColors[band];
            c.fill();
            c.restore();
        }

        // Golden particle rain
        for (let i = 0; i < 50; i++) {
            const seed = i * 137.5;
            const px2 = ((seed * 7.3 + this.time * (0.3 + (i % 5) * 0.1)) % W);
            const py2 = ((seed * 3.7 + this.time * (0.5 + (i % 3) * 0.2)) % H);
            const sz = 1 + Math.sin(this.time * 0.04 + i) * 0.8;
            const alpha = 0.1 + Math.sin(this.time * 0.03 + i * 0.5) * 0.08;
            const colors = ['rgba(255,215,0,', 'rgba(255,180,0,', 'rgba(255,100,50,'];
            c.fillStyle = colors[i % 3] + alpha + ')';
            c.beginPath(); c.arc(px2, py2, sz, 0, Math.PI*2); c.fill();
        }

        // Firework bursts (periodic)
        for (let fw = 0; fw < 5; fw++) {
            const phase = (this.time * 0.02 + fw * 1.3) % 3;
            if (phase < 1.5) {
                const fwx = W * (0.15 + (fw * 0.175));
                const fwy = H * (0.1 + fw * 0.05);
                const burst = phase * 60;
                const sparkAlpha = Math.max(0, 0.6 - phase * 0.4);
                const fwColors = ['#ffd700', '#ff6b35', '#00ff88', '#4488ff', '#ff44aa'];
                for (let sp = 0; sp < 12; sp++) {
                    const angle = (sp / 12) * Math.PI * 2 + this.time * 0.01;
                    const sx = fwx + Math.cos(angle) * burst;
                    const sy = fwy + Math.sin(angle) * burst;
                    c.fillStyle = fwColors[(fw + sp) % fwColors.length];
                    c.globalAlpha = sparkAlpha;
                    c.beginPath(); c.arc(sx, sy, 2, 0, Math.PI*2); c.fill();
                }
                c.globalAlpha = 1;
            }
        }

        c.textAlign = 'center'; c.textBaseline = 'middle';

        // Crown with glow
        c.save();
        c.shadowColor = 'rgba(255,215,0,0.8)';
        c.shadowBlur = 30 + Math.sin(this.time * 0.05) * 10;
        c.font = '72px serif';
        c.fillText('👑', W/2, H*0.08);
        c.restore();

        // TITLE with animated glow
        c.save();
        const titleGlow = 20 + Math.sin(this.time * 0.04) * 8;
        c.shadowColor = 'rgba(255,215,0,0.7)';
        c.shadowBlur = titleGlow;
        c.fillStyle = '#ffd700'; c.font = 'bold 60px Georgia, serif';
        c.fillText('VICTORY!', W/2, H*0.18);
        c.restore();

        // Subtitle
        c.fillStyle = '#795548'; c.font = '24px Georgia, serif';
        c.fillText(`${E(this.g.player).name} conquers all!`, W/2, H*0.18 + 48);

        // Empire icon large
        c.font = '56px serif';
        c.fillText(E(this.g.player).icon || '', W/2, H*0.18 + 110);

        // Stats panel with bright background
        const pw = 380, ph = 280, px = (W - pw)/2, py = H*0.45;
        c.save();
        c.shadowColor = 'rgba(180,150,100,0.2)';
        c.shadowBlur = 20;
        c.shadowOffsetY = 5;
        const panelGr = c.createLinearGradient(px, py, px+pw, py+ph);
        panelGr.addColorStop(0, 'rgba(255,248,225,0.97)');
        panelGr.addColorStop(1, 'rgba(255,243,224,0.97)');
        this._rr(c, px, py, pw, ph, 14); c.fillStyle = panelGr; c.fill();
        c.restore();

        // Colorful border
        c.save();
        c.shadowColor = 'rgba(255,152,0,0.3)';
        c.shadowBlur = 10;
        c.strokeStyle = '#FF9800'; c.lineWidth = 2;
        this._rr(c, px, py, pw, ph, 14); c.stroke();
        c.restore();
        c.strokeStyle = 'rgba(255,152,0,0.2)'; c.lineWidth = 1;
        this._rr(c, px+5, py+5, pw-10, ph-10, 11); c.stroke();

        c.fillStyle = '#E65100'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.textAlign = 'center';
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
            c.textAlign = 'left'; c.fillStyle = '#5D4037';
            c.fillText(s.label, px + 20, sy);
            c.textAlign = 'right'; c.fillStyle = '#E65100'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText(String(s.value), px + pw - 20, sy);
            c.font = '14px "Segoe UI", sans-serif';
            // Divider line
            if (s !== statLines[statLines.length - 1]) {
                c.strokeStyle = 'rgba(255,152,0,0.2)'; c.lineWidth = 1;
                c.beginPath(); c.moveTo(px + 15, sy + 14); c.lineTo(px + pw - 15, sy + 14); c.stroke();
            }
            sy += 32;
        }

        // Pulsing "Click to return"
        const btnAlpha = 0.5 + Math.sin(this.time * 0.05) * 0.3;
        c.fillStyle = `rgba(255,215,0,${btnAlpha})`;
        c.font = 'bold 18px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText('Click to return to menu', W/2, H*0.92);

        this._drawEmperorSilhouette(c, W*0.5, H*0.40, 1.5);
        this._drawCrossedSwords(c, W*0.3, H*0.88, 1.0);
        this._drawCrossedSwords(c, W*0.7, H*0.88, 1.0);
    }

    // ── TERRITORY INTERIOR VIEW ───────────────────────────────
    _drawTerritoryView() {
        const c = this.ctx, g = this.g, W = g.W, H = g.H;
        const tv = g._terrView;
        if (!tv) { g.state = 'playing'; return; }
        const tid = tv.tid;
        const t = T(tid), s = g.ts[tid];
        const emp = g.empires[s.owner];
        const myEmp = g.empires[g.player];

        g.btns = [];

        // ── Entrance animation (zoom + fade) ──
        if (!this._tvAnim) this._tvAnim = { t: 0 };
        this._tvAnim.t = Math.min(60, this._tvAnim.t + 1);
        const tvProgress = this._tvAnim.t / 60;
        const tvEase = 1 - Math.pow(1 - tvProgress, 3); // ease-out cubic
        if (tvProgress < 1) {
            c.save();
            c.globalAlpha = tvEase;
            const sc = 0.85 + tvEase * 0.15;
            c.translate(W / 2, H / 2);
            c.scale(sc, sc);
            c.translate(-W / 2, -H / 2);
        }

        // ── Full-screen terrain background ──
        this._drawTerrainScene(c, t, s, W, H, tv);

        // ── TOP HUD BAR ──
        c.fillStyle = 'rgba(10,5,0,0.9)';
        c.fillRect(0, 0, W, 54);
        c.strokeStyle = 'rgba(255,215,0,0.6)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, 54); c.lineTo(W, 54); c.stroke();

        // BACK button (top-left, very prominent)
        const backW = 80, backH = 36, backX = 8, backY = 9;
        this._rr(c, backX, backY, backW, backH, 8);
        c.fillStyle = 'rgba(200,60,60,0.9)'; c.fill();
        c.strokeStyle = '#ff6b6b'; c.lineWidth = 2;
        this._rr(c, backX, backY, backW, backH, 8); c.stroke();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#fff'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('\u2B05 BACK', backX + backW/2, backY + backH/2);
        g.btns.push({ rect: { x: backX, y: backY, w: backW, h: backH }, fn: () => { g._exitTerritoryView(); g.sfx.click(); } });

        // Territory name + empire (after back button)
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 18px Georgia, serif';
        c.fillText(t.name, 100, 27);
        c.fillStyle = emp ? emp.color : '#ccc'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText(emp ? E(s.owner).name : 'Neutral', 100 + c.measureText(t.name).width + 10, 27);

        // Stats in top bar
        c.textAlign = 'right'; c.font = '12px "Segoe UI", sans-serif';
        c.fillStyle = '#e0d0b0';
        c.fillText(`Troops: ${s.troops} | Fort: ${s.fort} | Coins: ${myEmp.coins} | Turn: ${g.turn || 1}`, W - 12, 25);

        // ── BOTTOM ACTION BAR (always visible) ──
        const barH = 64;
        const barY = H - barH;
        c.fillStyle = 'rgba(10,5,0,0.9)';
        c.fillRect(0, barY, W, barH);
        c.strokeStyle = 'rgba(255,215,0,0.6)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, barY); c.lineTo(W, barY); c.stroke();

        // Bottom buttons - everything stays inside territory
        const btnH2 = 42;
        const botBtns = [
            { label: '\uD83D\uDC82 Recruit', w: 95, color: 'rgba(52,152,219,0.8)', border: '#3498db', fn: () => { g.sel = tid; g._buySoldier(); g._autoEndTurn(); } },
            { label: '\uD83D\uDEE1 Fortify', w: 95, color: 'rgba(155,89,182,0.8)', border: '#9b59b6', fn: () => { g.sel = tid; g._buyFortify(); g._autoEndTurn(); } },
            { label: '\uD83D\uDCA5 Attack', w: 95, color: 'rgba(231,76,60,0.8)', border: '#e74c3c', fn: () => { tv.sub = 'attack'; g.sfx.click(); } },
            { label: '\uD83C\uDFAE Battle', w: 95, color: 'rgba(46,204,113,0.9)', border: '#2ecc71', fn: () => { tv.sub = 'battle'; g.sfx.click(); } },
        ];
        const gap = 6, totalBW = botBtns.reduce((a, b) => a + b.w, 0) + gap * (botBtns.length - 1);
        const scaleX = Math.min(1, (W - 20) / totalBW);
        let bx = (W - totalBW * scaleX) / 2;
        for (const btn of botBtns) {
            const bw = btn.w * scaleX;
            const by = barY + (barH - btnH2) / 2;
            this._rr(c, bx, by, bw, btnH2, 10);
            c.fillStyle = btn.color; c.fill();
            c.strokeStyle = btn.border; c.lineWidth = 2;
            this._rr(c, bx, by, bw, btnH2, 10); c.stroke();
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = '#fff'; c.font = `bold ${Math.max(11, 14 * scaleX)}px "Segoe UI", sans-serif`;
            c.fillText(btn.label, bx + bw / 2, by + btnH2 / 2);
            g.btns.push({ rect: { x: bx, y: by, w: bw, h: btnH2 }, fn: btn.fn });
            bx += bw + gap;
        }

        // ── Navigation tabs ──
        this._drawTerritoryTabs(c, g, W, H, tv);

        // ── Sub-view content ──
        if (!tv.sub) {
            // Raw 3D scene — no overlay. Just draw a small floating info badge.
            const emp = g.empires[g.player];
            const info = `${T(tv.tid).name} — ${g.ts[tv.tid].troops} troops`;
            c.save();
            c.font = 'bold 13px "Segoe UI", sans-serif';
            const tw = c.measureText(info).width;
            const bx = W/2 - tw/2 - 12, by = H - barH - 52;
            this._rr(c, bx, by, tw + 24, 30, 8);
            c.fillStyle = 'rgba(0,0,0,0.6)'; c.fill();
            c.strokeStyle = 'rgba(255,215,0,0.4)'; c.lineWidth = 1;
            this._rr(c, bx, by, tw + 24, 30, 8); c.stroke();
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = '#ffd700';
            c.fillText(info, W/2, by + 15);
            c.restore();
        }
        else if (tv.sub === 'explore') this._drawExploreView(c, g, W, H, tv);
        else if (tv.sub === 'build') this._drawBuildView(c, g, W, H, tv);
        else if (tv.sub === 'story') this._drawStoryView(c, g, W, H, tv);
        else if (tv.sub === 'shop') this._drawTerrShopView(c, g, W, H, tv);
        else if (tv.sub === 'chat') this._drawOnlineChat(c, g, W, H, tv);
        else if (tv.sub === 'alliance') this._drawAlliancePanel(c, g, W, H, tv);
        else if (tv.sub === 'trade') this._drawTradePanel(c, g, W, H, tv);
        else if (tv.sub === 'spy') this._drawSpyPanel(c, g, W, H, tv);
        else if (tv.sub === 'diplomacy') this._drawDiplomacyPanel(c, g, W, H, tv);
        else if (tv.sub === 'manage') this._drawManageView(c, g, W, H, tv);
        else if (tv.sub === 'weapons') this._drawWeaponsView(c, g, W, H, tv);
        else if (tv.sub === 'attack') this._drawAttackFromTerritory(c, g, W, H, tv);
        else if (tv.sub === 'battle') this._drawBattleInTerritory(c, g, W, H, tv);

        // ── Log panel ──
        this._logPanel();

        // Close entrance animation transform
        if (tvProgress < 1) c.restore();
    }

    // Terrain background scene — 3D perspective world
    _drawTerrainScene(c, t, s, W, H, tv) {
        const terrain = t.terrain || 'plains';
        const time = tv.time;
        const horizon = H * 0.38;
        let skyTop, skyBot, groundFar, groundNear, groundMid;
        let fogColor = 'rgba(180,170,150,0.15)';

        switch (terrain) {
            case 'desert':
                skyTop = '#1a0a00'; skyBot = '#4a2800';
                groundFar = '#c2956a'; groundNear = '#a07040'; groundMid = '#b08050';
                fogColor = 'rgba(200,160,80,0.2)';
                break;
            case 'mountains':
                skyTop = '#0a1020'; skyBot = '#2a3a5a';
                groundFar = '#5a6a4a'; groundNear = '#3a4a2a'; groundMid = '#4a5a3a';
                fogColor = 'rgba(150,160,180,0.2)';
                break;
            case 'coast':
                skyTop = '#0a1530'; skyBot = '#1a3050';
                groundFar = '#c2b280'; groundNear = '#a09060'; groundMid = '#b0a070';
                break;
            case 'forest':
                skyTop = '#0a150a'; skyBot = '#1a3a1a';
                groundFar = '#3a5a2a'; groundNear = '#1a3a0a'; groundMid = '#2a4a1a';
                fogColor = 'rgba(100,150,80,0.15)';
                break;
            case 'island':
                skyTop = '#0a1535'; skyBot = '#1a3555';
                groundFar = '#4a9a5a'; groundNear = '#2a6a3a'; groundMid = '#3a8a4a';
                break;
            case 'peninsula':
                skyTop = '#100a20'; skyBot = '#2a1a40';
                groundFar = '#8a7a5a'; groundNear = '#6a5a3a'; groundMid = '#7a6a4a';
                break;
            default: // plains
                skyTop = '#0a0a20'; skyBot = '#1a2a4a';
                groundFar = '#5a8a4a'; groundNear = '#3a6a2a'; groundMid = '#4a7a3a';
                fogColor = 'rgba(150,170,130,0.12)';
        }

        // ── Sky with depth ──
        const skyGr = c.createLinearGradient(0, 0, 0, horizon);
        skyGr.addColorStop(0, skyTop); skyGr.addColorStop(1, skyBot);
        c.fillStyle = skyGr; c.fillRect(0, 0, W, horizon);

        // Stars with twinkling
        c.fillStyle = 'rgba(255,255,200,0.5)';
        for (let i = 0; i < 40; i++) {
            const sx = (Math.sin(i * 47.3) * 0.5 + 0.5) * W;
            const sy = (Math.cos(i * 31.7) * 0.5 + 0.5) * horizon * 0.8;
            const twinkle = 0.3 + Math.sin(time * 0.03 + i * 2) * 0.3;
            c.globalAlpha = twinkle;
            c.beginPath(); c.arc(sx, sy, 1 + Math.sin(i) * 0.5, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;

        // Moon with glow
        const moonX = W * 0.82, moonY = H * 0.10;
        const moonGlow = c.createRadialGradient(moonX, moonY, 10, moonX, moonY, 60);
        moonGlow.addColorStop(0, 'rgba(255,250,220,0.25)'); moonGlow.addColorStop(1, 'rgba(255,250,220,0)');
        c.fillStyle = moonGlow; c.fillRect(moonX - 60, moonY - 60, 120, 120);
        c.fillStyle = 'rgba(255,250,220,0.8)'; c.beginPath(); c.arc(moonX, moonY, 18, 0, Math.PI * 2); c.fill();
        c.fillStyle = skyTop; c.beginPath(); c.arc(moonX + 6, moonY - 4, 15, 0, Math.PI * 2); c.fill();

        // ── 3D Perspective Ground ──
        // Draw ground with converging lines for depth
        const vpX = W * 0.5, vpY = horizon; // vanishing point
        const groundGr = c.createLinearGradient(0, horizon, 0, H);
        groundGr.addColorStop(0, groundFar); groundGr.addColorStop(0.5, groundMid); groundGr.addColorStop(1, groundNear);
        c.fillStyle = groundGr; c.fillRect(0, horizon, W, H - horizon);

        // Perspective grid lines (road/field lines going to vanishing point)
        c.strokeStyle = 'rgba(0,0,0,0.06)'; c.lineWidth = 1;
        for (let i = -5; i <= 5; i++) {
            const bx = vpX + i * 120;
            c.beginPath(); c.moveTo(vpX, vpY); c.lineTo(bx, H); c.stroke();
        }
        // Horizontal depth lines
        for (let i = 1; i <= 6; i++) {
            const ly = horizon + (H - horizon) * (i / 6) * (i / 6);
            c.beginPath(); c.moveTo(0, ly); c.lineTo(W, ly); c.stroke();
        }

        // ── Horizon atmospheric fog ──
        const fogGr = c.createLinearGradient(0, horizon - 20, 0, horizon + 40);
        fogGr.addColorStop(0, fogColor); fogGr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = fogGr; c.fillRect(0, horizon - 20, W, 60);

        // ── Terrain-specific 3D decorations ──
        if (terrain === 'desert') this._drawDesertDecor3D(c, W, H, horizon, time);
        else if (terrain === 'mountains') this._drawMountainDecor3D(c, W, H, horizon, time);
        else if (terrain === 'coast' || terrain === 'island') this._drawCoastDecor3D(c, W, H, horizon, time);
        else if (terrain === 'forest') this._drawForestDecor3D(c, W, H, horizon, time);
        else this._drawPlainsDecor3D(c, W, H, horizon, time);

        // Draw buildings (with 3D perspective)
        this._drawTerritoryBuildings3D(c, W, H, tv, horizon);

        // Draw soldiers (realistic 3D-like)
        this._drawTerritorySoldiers3D(c, W, H, tv, horizon);

        // Draw player avatar
        this._drawPlayerAvatar(c, W, H, tv, horizon);

        // Vignette overlay for cinematic feel
        const vigGr = c.createRadialGradient(W/2, H/2, W*0.3, W/2, H/2, W*0.75);
        vigGr.addColorStop(0, 'rgba(0,0,0,0)'); vigGr.addColorStop(1, 'rgba(0,0,0,0.35)');
        c.fillStyle = vigGr; c.fillRect(0, 0, W, H);
    }

    // ── 3D Desert ──
    _drawDesertDecor3D(c, W, H, horizon, time) {
        const vpX = W * 0.5;
        // Sand dunes with 3D shading
        for (let i = 0; i < 5; i++) {
            const dx = W * (0.05 + i * 0.22);
            const dy = horizon + (H - horizon) * (0.15 + i * 0.08);
            const size = 60 + i * 20;
            // Shadow side
            c.fillStyle = `rgba(120,80,30,${0.2 + i * 0.03})`;
            c.beginPath(); c.moveTo(dx - size, dy + size*0.4);
            c.quadraticCurveTo(dx, dy - size*0.3 - Math.sin(time*0.01+i)*5, dx + size, dy + size*0.4); c.fill();
            // Highlight side
            c.fillStyle = `rgba(200,160,80,${0.15 + i * 0.02})`;
            c.beginPath(); c.moveTo(dx - size*0.5, dy + size*0.3);
            c.quadraticCurveTo(dx + size*0.2, dy - size*0.25, dx + size, dy + size*0.4); c.fill();
        }
        // Pyramids in background (3D with shading)
        const pyr = [{x:0.65,s:1},{x:0.78,s:0.7},{x:0.88,s:0.5}];
        for (const p of pyr) {
            const px = W * p.x, ps = p.s;
            const baseY = horizon + 10, topY = horizon - 50*ps;
            // Dark face
            c.fillStyle = 'rgba(100,70,30,0.5)';
            c.beginPath(); c.moveTo(px, topY); c.lineTo(px + 40*ps, baseY); c.lineTo(px, baseY); c.fill();
            // Light face
            c.fillStyle = 'rgba(170,130,60,0.5)';
            c.beginPath(); c.moveTo(px, topY); c.lineTo(px - 40*ps, baseY); c.lineTo(px, baseY); c.fill();
        }
    }

    // ── 3D Mountains ──
    _drawMountainDecor3D(c, W, H, horizon, time) {
        const peaks = [
            {x:0.08,h:0.28,w:80},{x:0.25,h:0.35,w:100},{x:0.45,h:0.22,w:70},
            {x:0.65,h:0.32,w:95},{x:0.82,h:0.26,w:85},{x:0.95,h:0.20,w:60}
        ];
        for (const p of peaks) {
            const px = W*p.x, baseY = horizon + 5, topY = horizon - H*p.h;
            // Dark face (right)
            c.fillStyle = 'rgba(50,50,40,0.6)';
            c.beginPath(); c.moveTo(px, topY); c.lineTo(px + p.w, baseY); c.lineTo(px, baseY); c.fill();
            // Light face (left)
            c.fillStyle = 'rgba(90,90,70,0.6)';
            c.beginPath(); c.moveTo(px, topY); c.lineTo(px - p.w, baseY); c.lineTo(px, baseY); c.fill();
            // Snow cap
            c.fillStyle = 'rgba(220,220,240,0.5)';
            c.beginPath(); c.moveTo(px, topY); c.lineTo(px - p.w*0.2, topY + p.h*H*0.08);
            c.lineTo(px, topY + p.h*H*0.12); c.lineTo(px + p.w*0.2, topY + p.h*H*0.08); c.fill();
        }
        // Drifting clouds
        c.fillStyle = 'rgba(200,210,220,0.06)';
        for (let i = 0; i < 3; i++) {
            const cx = ((time * 0.15 + i * 250) % (W + 200)) - 100;
            const cy = horizon * 0.4 + i * 20;
            c.beginPath(); c.ellipse(cx, cy, 70, 18, 0, 0, Math.PI * 2); c.fill();
        }
    }

    // ── 3D Coast ──
    _drawCoastDecor3D(c, W, H, horizon, time) {
        const waveY = H * 0.78;
        for (let row = 0; row < 4; row++) {
            c.fillStyle = `rgba(20,${60+row*20},${100+row*20},${0.2 + row*0.08})`;
            c.beginPath(); c.moveTo(0, H);
            for (let x = 0; x <= W; x += 8) {
                const y = waveY + row*25 + Math.sin(x*0.015 + time*0.025 + row*1.2)*10;
                c.lineTo(x, y);
            }
            c.lineTo(W, H); c.fill();
        }
        // Ship on horizon
        const shipX = W * 0.3 + Math.sin(time * 0.008) * 30;
        const shipY = horizon + 15;
        c.fillStyle = 'rgba(80,60,40,0.4)';
        c.beginPath(); c.moveTo(shipX-15, shipY); c.lineTo(shipX+15, shipY);
        c.lineTo(shipX+10, shipY-12); c.lineTo(shipX-10, shipY-12); c.fill();
        c.fillStyle = 'rgba(200,200,200,0.3)';
        c.beginPath(); c.moveTo(shipX, shipY-12); c.lineTo(shipX, shipY-30); c.lineTo(shipX+8, shipY-18); c.fill();
    }

    // ── 3D Forest ──
    _drawForestDecor3D(c, W, H, horizon, time) {
        const trees = [
            {x:0.05,d:0.3,s:1.2},{x:0.15,d:0.2,s:1},{x:0.28,d:0.4,s:0.9},
            {x:0.42,d:0.15,s:1.3},{x:0.55,d:0.35,s:1.1},{x:0.68,d:0.25,s:1},
            {x:0.78,d:0.45,s:0.8},{x:0.88,d:0.18,s:1.2},{x:0.95,d:0.38,s:0.9}
        ];
        // Sort by depth (far first)
        trees.sort((a, b) => b.d - a.d);
        for (const tr of trees) {
            const tx = W * tr.x;
            const ty = horizon + (H - horizon) * (0.2 + tr.d * 0.5);
            const sz = tr.s * (1 - tr.d * 0.4) * 50;
            const sway = Math.sin(time * 0.015 + tr.x * 10) * 2;
            // Trunk
            c.fillStyle = 'rgba(60,40,20,0.6)';
            c.fillRect(tx - 3*tr.s, ty - sz*0.3, 6*tr.s, sz*0.4);
            // Canopy layers
            for (let l = 0; l < 3; l++) {
                const ly = ty - sz*0.3 - l*sz*0.25;
                const lw = sz*0.5 - l*sz*0.1;
                c.fillStyle = `rgba(${30+l*15},${80+l*20},${20+l*10},${0.5 - tr.d*0.15})`;
                c.beginPath(); c.moveTo(tx + sway*(1+l*0.3), ly - sz*0.2);
                c.lineTo(tx - lw + sway*l*0.2, ly); c.lineTo(tx + lw + sway*l*0.2, ly); c.fill();
            }
        }
    }

    // ── 3D Plains ──
    _drawPlainsDecor3D(c, W, H, horizon, time) {
        // Rolling hills in background
        for (let i = 0; i < 3; i++) {
            const hy = horizon + 20 + i * 30;
            const alpha = 0.08 - i * 0.02;
            c.fillStyle = `rgba(80,120,50,${alpha})`;
            c.beginPath(); c.moveTo(0, hy);
            for (let x = 0; x <= W; x += 20) {
                c.lineTo(x, hy + Math.sin(x*0.005 + i*2) * 15 + Math.sin(x*0.012 + i) * 8);
            }
            c.lineTo(W, H); c.lineTo(0, H); c.fill();
        }
        // Grass blades in foreground
        c.strokeStyle = 'rgba(60,100,30,0.3)'; c.lineWidth = 1.5;
        for (let i = 0; i < 20; i++) {
            const gx = (i / 20) * W + Math.sin(i * 7) * 30;
            const gy = H - 20 - Math.sin(i * 3) * 40;
            const sway = Math.sin(time * 0.02 + i * 1.5) * 4;
            c.beginPath(); c.moveTo(gx, gy); c.quadraticCurveTo(gx + sway, gy - 12, gx + sway*1.5, gy - 18); c.stroke();
        }
    }

    _drawDesertDecor(c, W, H, time) {
        // Sand dunes
        c.fillStyle = 'rgba(180,140,80,0.3)';
        for (let i = 0; i < 4; i++) {
            c.beginPath();
            const dx = W * (0.1 + i * 0.25);
            const dy = H * 0.5 + i * 20;
            c.moveTo(dx - 80, dy + 30);
            c.quadraticCurveTo(dx, dy - 20 - Math.sin(time * 0.01 + i) * 5, dx + 80, dy + 30);
            c.fill();
        }
        // Pyramids in background
        c.fillStyle = 'rgba(160,120,60,0.4)';
        c.beginPath(); c.moveTo(W * 0.7, H * 0.42); c.lineTo(W * 0.75, H * 0.32); c.lineTo(W * 0.8, H * 0.42); c.fill();
        c.fillStyle = 'rgba(140,100,50,0.3)';
        c.beginPath(); c.moveTo(W * 0.8, H * 0.42); c.lineTo(W * 0.84, H * 0.35); c.lineTo(W * 0.88, H * 0.42); c.fill();
        // Tumbleweeds
        c.strokeStyle = 'rgba(120,90,40,0.4)'; c.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
            const tx = ((time * 0.5 + i * 400) % (W + 100)) - 50;
            const ty = H * 0.7 + i * 30 + Math.sin(time * 0.02 + i) * 10;
            c.beginPath(); c.arc(tx, ty, 5, 0, Math.PI * 2); c.stroke();
            c.beginPath(); c.moveTo(tx - 4, ty); c.lineTo(tx + 4, ty); c.stroke();
            c.beginPath(); c.moveTo(tx, ty - 4); c.lineTo(tx, ty + 4); c.stroke();
        }
    }

    _drawMountainDecor(c, W, H, time) {
        // Mountain peaks
        const peaks = [
            { x: 0.15, h: 0.22 }, { x: 0.35, h: 0.28 }, { x: 0.55, h: 0.18 },
            { x: 0.75, h: 0.25 }, { x: 0.9, h: 0.20 }
        ];
        for (const p of peaks) {
            const px = W * p.x, baseY = H * 0.43, topY = H * (0.43 - p.h);
            c.fillStyle = 'rgba(80,80,60,0.5)';
            c.beginPath(); c.moveTo(px - 60, baseY); c.lineTo(px, topY); c.lineTo(px + 60, baseY); c.fill();
            // Snow cap
            c.fillStyle = 'rgba(220,220,240,0.4)';
            c.beginPath(); c.moveTo(px - 15, topY + 20); c.lineTo(px, topY); c.lineTo(px + 15, topY + 20); c.fill();
        }
        // Clouds near peaks
        c.fillStyle = 'rgba(200,210,220,0.08)';
        for (let i = 0; i < 3; i++) {
            const cx = ((time * 0.2 + i * 200) % (W + 100)) - 50;
            const cy = H * 0.2 + i * 15;
            c.beginPath(); c.ellipse(cx, cy, 50, 15, 0, 0, Math.PI * 2); c.fill();
        }
    }

    _drawCoastDecor(c, W, H, time) {
        // Ocean waves at bottom
        const waveY = H * 0.82;
        for (let row = 0; row < 3; row++) {
            c.fillStyle = `rgba(30,80,120,${0.15 + row * 0.1})`;
            c.beginPath(); c.moveTo(0, H);
            for (let x = 0; x <= W; x += 10) {
                const y = waveY + row * 20 + Math.sin(x * 0.02 + time * 0.03 + row) * 8;
                c.lineTo(x, y);
            }
            c.lineTo(W, H); c.fill();
        }
        // Distant ships
        c.strokeStyle = 'rgba(60,40,20,0.3)'; c.lineWidth = 1;
        const shipX = ((time * 0.15) % (W + 100)) - 50;
        const shipY = waveY - 5 + Math.sin(time * 0.03) * 3;
        c.beginPath(); c.moveTo(shipX - 12, shipY); c.lineTo(shipX, shipY - 10); c.lineTo(shipX + 12, shipY); c.stroke();
        c.beginPath(); c.moveTo(shipX, shipY - 10); c.lineTo(shipX, shipY - 25); c.stroke();
        // Palm trees
        this._drawPalmTree(c, W * 0.1, H * 0.5, time);
        this._drawPalmTree(c, W * 0.88, H * 0.48, time + 1);
    }

    _drawPalmTree(c, x, y, time) {
        // Trunk
        c.strokeStyle = 'rgba(100,70,30,0.6)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 3, y - 30, x + 1, y - 55); c.stroke();
        // Leaves
        c.strokeStyle = 'rgba(40,100,30,0.5)'; c.lineWidth = 2;
        const sway = Math.sin(time * 0.02) * 3;
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 + sway * 0.05;
            c.beginPath(); c.moveTo(x + 1, y - 55);
            c.quadraticCurveTo(x + Math.cos(angle) * 15, y - 65, x + Math.cos(angle) * 25, y - 50 + Math.sin(angle) * 5);
            c.stroke();
        }
    }

    _drawForestDecor(c, W, H, time) {
        // Background trees
        for (let i = 0; i < 12; i++) {
            const tx = W * (0.05 + (i / 12) * 0.9);
            const ty = H * 0.44 + Math.sin(i * 3.7) * 10;
            const th = 30 + Math.sin(i * 2.1) * 15;
            // Trunk
            c.fillStyle = 'rgba(60,40,20,0.4)';
            c.fillRect(tx - 2, ty, 4, th);
            // Canopy
            c.fillStyle = `rgba(${20 + i * 5},${60 + i * 8},${15 + i * 3},0.4)`;
            c.beginPath(); c.arc(tx, ty - 5, 12 + Math.sin(i) * 4, 0, Math.PI * 2); c.fill();
        }
        // Fireflies
        for (let i = 0; i < 8; i++) {
            const fx = W * 0.1 + Math.sin(time * 0.01 + i * 1.7) * W * 0.4;
            const fy = H * 0.5 + Math.cos(time * 0.008 + i * 2.3) * H * 0.15;
            const glow = 0.2 + Math.sin(time * 0.05 + i * 3) * 0.2;
            c.fillStyle = `rgba(200,255,100,${glow})`;
            c.beginPath(); c.arc(fx, fy, 2, 0, Math.PI * 2); c.fill();
        }
    }

    _drawPlainsDecor(c, W, H, time) {
        // Rolling hills
        c.fillStyle = 'rgba(60,100,40,0.2)';
        c.beginPath(); c.moveTo(0, H * 0.45);
        for (let x = 0; x <= W; x += 20) {
            c.lineTo(x, H * 0.45 + Math.sin(x * 0.005 + 1) * 15 + Math.sin(x * 0.012) * 8);
        }
        c.lineTo(W, H); c.lineTo(0, H); c.fill();
        // Grass tufts
        c.strokeStyle = 'rgba(50,90,30,0.3)'; c.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            const gx = (Math.sin(i * 73.1) * 0.5 + 0.5) * W;
            const gy = H * 0.55 + (Math.cos(i * 47.3) * 0.5 + 0.5) * H * 0.3;
            const sway = Math.sin(time * 0.02 + i) * 2;
            c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + sway - 3, gy - 8); c.stroke();
            c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + sway + 3, gy - 8); c.stroke();
        }
        // Flowers
        const flowerColors = ['#e74c3c', '#f1c40f', '#e67e22', '#9b59b6'];
        for (let i = 0; i < 10; i++) {
            const fx = (Math.sin(i * 53.7 + 10) * 0.5 + 0.5) * W;
            const fy = H * 0.6 + (Math.cos(i * 37.1 + 10) * 0.5 + 0.5) * H * 0.25;
            c.fillStyle = flowerColors[i % flowerColors.length];
            c.globalAlpha = 0.4;
            c.beginPath(); c.arc(fx, fy, 2, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
    }

    // Draw buildings in the interior view
    // ── 3D Buildings with perspective ──
    _drawTerritoryBuildings3D(c, W, H, tv, horizon) {
        const blds = tv.buildings || [];
        // Sort by y-position (far first for painter's algorithm)
        const sorted = [...blds].sort((a, b) => a.y - b.y);
        for (const b of sorted) {
            const bx = b.x * W, by = horizon + b.y * (H - horizon) * 0.7;
            const depth = b.y; // 0=far, 1=near
            const scale = (1.2 + depth * 1.5) * (b.size || 1);
            this._drawBuilding3D(c, bx, by, b.type, scale, tv.time);
        }
    }

    _drawBuilding3D(c, x, y, type, scale, time) {
        const s = scale * 30;
        c.save(); c.translate(x, y);

        // Shadow on ground
        c.fillStyle = 'rgba(0,0,0,0.15)';
        c.beginPath(); c.ellipse(s*0.5, s*0.3, s*1.2, s*0.3, 0, 0, Math.PI*2); c.fill();

        switch (type) {
            case 'outpost': {
                // Small forward operating base — concrete structure with sandbags
                // Front face (concrete)
                c.fillStyle = 'rgba(120,125,115,0.9)';
                c.fillRect(-s*0.8, -s*0.5, s*1.6, s*1);
                // Side face (3D depth)
                c.fillStyle = 'rgba(95,100,90,0.75)';
                c.beginPath(); c.moveTo(s*0.8, -s*0.5); c.lineTo(s*1.2, -s*0.8);
                c.lineTo(s*1.2, s*0.5); c.lineTo(s*0.8, s*0.5); c.fill();
                // Flat roof with equipment
                c.fillStyle = 'rgba(80,85,78,0.85)';
                c.fillRect(-s*0.9, -s*0.55, s*2, s*0.12);
                // AC unit on roof
                c.fillStyle = 'rgba(160,160,160,0.7)';
                c.fillRect(s*0.2, -s*0.72, s*0.3, s*0.2);
                c.fillStyle = 'rgba(100,100,100,0.5)';
                c.fillRect(s*0.25, -s*0.67, s*0.2, s*0.05);
                // Armored door
                c.fillStyle = 'rgba(50,55,50,0.95)';
                c.fillRect(-s*0.15, -s*0.05, s*0.35, s*0.55);
                c.fillStyle = 'rgba(180,180,180,0.6)';
                c.fillRect(s*0.1, s*0.15, s*0.05, s*0.1); // door handle
                // Reinforced window (left)
                c.fillStyle = 'rgba(40,60,80,0.7)';
                c.fillRect(-s*0.6, -s*0.35, s*0.3, s*0.2);
                c.strokeStyle = 'rgba(80,80,80,0.6)'; c.lineWidth = 1;
                c.strokeRect(-s*0.6, -s*0.35, s*0.3, s*0.2);
                // Cross bars on window
                c.beginPath(); c.moveTo(-s*0.45, -s*0.35); c.lineTo(-s*0.45, -s*0.15); c.stroke();
                c.beginPath(); c.moveTo(-s*0.6, -s*0.25); c.lineTo(-s*0.3, -s*0.25); c.stroke();
                // Status light (blinking)
                const blink = Math.sin(time * 0.06) > 0;
                c.fillStyle = blink ? 'rgba(50,255,50,0.8)' : 'rgba(50,255,50,0.2)';
                c.beginPath(); c.arc(s*0.5, -s*0.48, s*0.06, 0, Math.PI*2); c.fill();
                // Sandbag wall at base
                c.fillStyle = 'rgba(140,120,80,0.7)';
                for (let i = 0; i < 5; i++) {
                    c.beginPath();
                    c.arc(-s*0.7 + i*s*0.35, s*0.4, s*0.12, 0, Math.PI*2);
                    c.fill();
                }
                break;
            }
            case 'command_center': {
                // Large HQ building with communications array
                // Main building front (concrete & steel)
                c.fillStyle = 'rgba(90,95,100,0.9)';
                c.fillRect(-s*1.2, -s*0.7, s*2.4, s*1.2);
                // Side face (3D)
                c.fillStyle = 'rgba(70,75,80,0.75)';
                c.beginPath(); c.moveTo(s*1.2, -s*0.7); c.lineTo(s*1.7, -s*1.0);
                c.lineTo(s*1.7, s*0.5); c.lineTo(s*1.2, s*0.5); c.fill();
                // Top section (upper floor)
                c.fillStyle = 'rgba(75,80,85,0.85)';
                c.fillRect(-s*1.0, -s*1.2, s*2.0, s*0.55);
                // Side of upper floor
                c.fillStyle = 'rgba(60,65,70,0.7)';
                c.beginPath(); c.moveTo(s*1.0, -s*1.2); c.lineTo(s*1.4, -s*1.45);
                c.lineTo(s*1.4, -s*0.65); c.lineTo(s*1.0, -s*0.65); c.fill();
                // Communications mast
                c.strokeStyle = 'rgba(160,160,160,0.7)'; c.lineWidth = 1.5;
                c.beginPath(); c.moveTo(0, -s*1.2); c.lineTo(0, -s*2.2); c.stroke();
                // Antenna dishes
                c.fillStyle = 'rgba(180,180,180,0.6)';
                c.beginPath(); c.ellipse(s*0.3, -s*1.9, s*0.2, s*0.08, -0.3, 0, Math.PI*2); c.fill();
                c.beginPath(); c.ellipse(-s*0.2, -s*2.0, s*0.15, s*0.06, 0.4, 0, Math.PI*2); c.fill();
                // Blinking red light on mast
                const rl = Math.sin(time * 0.04) > 0;
                c.fillStyle = rl ? 'rgba(255,30,30,0.9)' : 'rgba(255,30,30,0.2)';
                c.beginPath(); c.arc(0, -s*2.2, s*0.05, 0, Math.PI*2); c.fill();
                // Large windows (surveillance room)
                c.fillStyle = 'rgba(30,50,70,0.6)';
                for (let i = 0; i < 4; i++) {
                    c.fillRect(-s*0.9 + i*s*0.5, -s*1.1, s*0.35, s*0.25);
                }
                // Screen glow from windows
                const screenGlow = 0.3 + Math.sin(time * 0.02) * 0.15;
                c.fillStyle = `rgba(80,150,220,${screenGlow})`;
                for (let i = 0; i < 4; i++) {
                    c.fillRect(-s*0.85 + i*s*0.5, -s*1.05, s*0.25, s*0.15);
                }
                // Blast door
                c.fillStyle = 'rgba(45,50,48,0.95)';
                c.fillRect(-s*0.25, -s*0.15, s*0.5, s*0.65);
                c.strokeStyle = 'rgba(100,100,100,0.4)'; c.lineWidth = 1;
                c.strokeRect(-s*0.25, -s*0.15, s*0.5, s*0.65);
                // Door bolts
                c.fillStyle = 'rgba(160,160,160,0.5)';
                c.fillRect(-s*0.22, -s*0.05, s*0.06, s*0.06);
                c.fillRect(s*0.16, -s*0.05, s*0.06, s*0.06);
                // Star insignia
                c.fillStyle = 'rgba(200,180,50,0.5)';
                c.beginPath(); c.arc(-s*0.7, -s*0.5, s*0.12, 0, Math.PI*2); c.fill();
                break;
            }
            case 'supply_depot': {
                // Military supply area with shipping containers
                // Ground pad (concrete)
                c.fillStyle = 'rgba(100,100,95,0.6)';
                c.fillRect(-s*1.3, s*0.2, s*2.8, s*0.3);
                // Container 1 (olive drab)
                c.fillStyle = 'rgba(80,95,55,0.9)';
                c.fillRect(-s*1.0, -s*0.4, s*1.2, s*0.65);
                // Container ridges
                c.strokeStyle = 'rgba(60,75,40,0.5)'; c.lineWidth = 0.8;
                for (let i = 1; i < 5; i++) {
                    c.beginPath(); c.moveTo(-s*1.0 + i*s*0.24, -s*0.4);
                    c.lineTo(-s*1.0 + i*s*0.24, s*0.25); c.stroke();
                }
                // Container 2 (blue, stacked)
                c.fillStyle = 'rgba(50,70,110,0.9)';
                c.fillRect(-s*0.8, -s*0.95, s*1.0, s*0.55);
                // Container ridges
                c.strokeStyle = 'rgba(40,55,85,0.5)';
                for (let i = 1; i < 4; i++) {
                    c.beginPath(); c.moveTo(-s*0.8 + i*s*0.25, -s*0.95);
                    c.lineTo(-s*0.8 + i*s*0.25, -s*0.4); c.stroke();
                }
                // Container 3 (tan, side)
                c.fillStyle = 'rgba(160,145,100,0.85)';
                c.fillRect(s*0.3, -s*0.35, s*0.8, s*0.6);
                // 3D side of container 1
                c.fillStyle = 'rgba(65,78,42,0.75)';
                c.beginPath(); c.moveTo(s*0.2, -s*0.4); c.lineTo(s*0.5, -s*0.65);
                c.lineTo(s*0.5, s*0.0); c.lineTo(s*0.2, s*0.25); c.fill();
                // 3D top of container 2
                c.fillStyle = 'rgba(60,80,120,0.7)';
                c.beginPath(); c.moveTo(-s*0.8, -s*0.95); c.lineTo(-s*0.5, -s*1.15);
                c.lineTo(s*0.5, -s*1.15); c.lineTo(s*0.2, -s*0.95); c.fill();
                // Pallet with crates
                c.fillStyle = 'rgba(140,110,60,0.7)';
                c.fillRect(s*0.6, s*0.0, s*0.35, s*0.25);
                c.strokeStyle = 'rgba(100,75,35,0.5)'; c.lineWidth = 0.8;
                c.beginPath(); c.moveTo(s*0.6, s*0.12); c.lineTo(s*0.95, s*0.12); c.stroke();
                c.beginPath(); c.moveTo(s*0.77, s*0.0); c.lineTo(s*0.77, s*0.25); c.stroke();
                // Forklift (small)
                c.fillStyle = 'rgba(200,180,30,0.7)';
                c.fillRect(-s*1.1, s*0.15, s*0.3, s*0.2);
                c.fillStyle = 'rgba(50,50,50,0.7)';
                c.beginPath(); c.arc(-s*1.0, s*0.4, s*0.08, 0, Math.PI*2); c.fill();
                c.beginPath(); c.arc(-s*0.9, s*0.4, s*0.08, 0, Math.PI*2); c.fill();
                break;
            }
            case 'watchtower': {
                // Military surveillance watchtower
                // Support legs (X-brace)
                c.strokeStyle = 'rgba(100,100,95,0.8)'; c.lineWidth = 2;
                c.beginPath(); c.moveTo(-s*0.3, s*0.5); c.lineTo(-s*0.15, -s*1.0); c.stroke();
                c.beginPath(); c.moveTo(s*0.3, s*0.5); c.lineTo(s*0.15, -s*1.0); c.stroke();
                c.beginPath(); c.moveTo(-s*0.25, s*0.0); c.lineTo(s*0.25, s*0.0); c.stroke();
                c.beginPath(); c.moveTo(-s*0.22, -s*0.4); c.lineTo(s*0.22, -s*0.4); c.stroke();
                // Observation platform
                c.fillStyle = 'rgba(80,85,80,0.85)';
                c.fillRect(-s*0.5, -s*1.2, s*1.0, s*0.2);
                // Railing
                c.strokeStyle = 'rgba(120,120,115,0.7)'; c.lineWidth = 1;
                c.strokeRect(-s*0.5, -s*1.55, s*1.0, s*0.35);
                // Railing bars
                for (let i = 0; i < 4; i++) {
                    c.beginPath(); c.moveTo(-s*0.4 + i*s*0.27, -s*1.2);
                    c.lineTo(-s*0.4 + i*s*0.27, -s*1.55); c.stroke();
                }
                // Camouflage net on top
                c.fillStyle = 'rgba(80,100,60,0.4)';
                c.beginPath(); c.moveTo(-s*0.6, -s*1.55); c.lineTo(0, -s*1.8);
                c.lineTo(s*0.6, -s*1.55); c.fill();
                // Spotlight
                c.fillStyle = 'rgba(60,60,55,0.8)';
                c.beginPath(); c.arc(s*0.35, -s*1.4, s*0.1, 0, Math.PI*2); c.fill();
                // Spotlight beam (subtle, animated)
                const beamAngle = Math.sin(time * 0.015) * 0.4;
                c.save(); c.translate(s*0.35, -s*1.4); c.rotate(beamAngle);
                const beam = c.createLinearGradient(0, 0, 0, s*2);
                beam.addColorStop(0, 'rgba(255,255,200,0.15)');
                beam.addColorStop(1, 'rgba(255,255,200,0)');
                c.fillStyle = beam;
                c.beginPath(); c.moveTo(-s*0.08, 0); c.lineTo(-s*0.4, s*2);
                c.lineTo(s*0.4, s*2); c.lineTo(s*0.08, 0); c.fill();
                c.restore();
                // Communications antenna on top
                c.strokeStyle = 'rgba(150,150,145,0.6)'; c.lineWidth = 1;
                c.beginPath(); c.moveTo(-s*0.2, -s*1.55); c.lineTo(-s*0.2, -s*2.0); c.stroke();
                c.fillStyle = 'rgba(200,50,50,0.6)';
                c.beginPath(); c.arc(-s*0.2, -s*2.0, s*0.04, 0, Math.PI*2); c.fill();
                break;
            }
            case 'armory': {
                // Weapons armory with reinforced walls
                // Main structure (thick concrete)
                c.fillStyle = 'rgba(85,90,88,0.92)';
                c.fillRect(-s*1.1, -s*0.65, s*2.2, s*1.15);
                // Side face (3D)
                c.fillStyle = 'rgba(65,70,68,0.78)';
                c.beginPath(); c.moveTo(s*1.1, -s*0.65); c.lineTo(s*1.5, -s*0.9);
                c.lineTo(s*1.5, s*0.5); c.lineTo(s*1.1, s*0.5); c.fill();
                // Reinforced roof
                c.fillStyle = 'rgba(70,75,72,0.88)';
                c.fillRect(-s*1.2, -s*0.72, s*2.5, s*0.12);
                // Steel blast door (thick, segmented)
                c.fillStyle = 'rgba(50,55,52,0.95)';
                c.fillRect(-s*0.2, -s*0.1, s*0.45, s*0.6);
                // Door segments (horizontal)
                c.strokeStyle = 'rgba(80,85,82,0.5)'; c.lineWidth = 0.8;
                for (let i = 1; i < 5; i++) {
                    c.beginPath(); c.moveTo(-s*0.2, -s*0.1 + i*s*0.12);
                    c.lineTo(s*0.25, -s*0.1 + i*s*0.12); c.stroke();
                }
                // Locking wheel
                c.strokeStyle = 'rgba(150,150,145,0.6)'; c.lineWidth = 1.5;
                c.beginPath(); c.arc(s*0.15, s*0.15, s*0.06, 0, Math.PI*2); c.stroke();
                // Small barred window
                c.fillStyle = 'rgba(30,40,50,0.7)';
                c.fillRect(-s*0.8, -s*0.45, s*0.25, s*0.2);
                c.strokeStyle = 'rgba(130,130,125,0.5)'; c.lineWidth = 0.8;
                for (let i = 0; i < 3; i++) {
                    c.beginPath(); c.moveTo(-s*0.72 + i*s*0.08, -s*0.45);
                    c.lineTo(-s*0.72 + i*s*0.08, -s*0.25); c.stroke();
                }
                // Weapons rack silhouette through window
                c.fillStyle = 'rgba(60,60,60,0.4)';
                c.fillRect(-s*0.77, -s*0.38, s*0.03, s*0.12);
                c.fillRect(-s*0.72, -s*0.38, s*0.03, s*0.12);
                c.fillRect(-s*0.67, -s*0.38, s*0.03, s*0.12);
                // Ammo crates outside
                c.fillStyle = 'rgba(60,80,50,0.7)';
                c.fillRect(s*0.4, s*0.15, s*0.25, s*0.2);
                c.strokeStyle = 'rgba(40,60,30,0.4)'; c.lineWidth = 0.6;
                c.strokeRect(s*0.4, s*0.15, s*0.25, s*0.2);
                // Crate stencil "AMMO"
                c.fillStyle = 'rgba(200,200,190,0.4)'; c.font = `${s*0.08}px sans-serif`;
                c.fillText('AMMO', s*0.42, s*0.27);
                break;
            }
            case 'bunker': {
                // Reinforced concrete military bunker
                // Main bunker body (rounded top)
                c.fillStyle = 'rgba(100,105,100,0.92)';
                c.beginPath();
                c.moveTo(-s*1.0, s*0.5);
                c.lineTo(-s*1.0, -s*0.2);
                c.quadraticCurveTo(-s*1.0, -s*0.8, 0, -s*0.9);
                c.quadraticCurveTo(s*1.0, -s*0.8, s*1.0, -s*0.2);
                c.lineTo(s*1.0, s*0.5);
                c.closePath(); c.fill();
                // Side face (3D depth)
                c.fillStyle = 'rgba(80,85,80,0.78)';
                c.beginPath(); c.moveTo(s*1.0, -s*0.2); c.lineTo(s*1.4, -s*0.5);
                c.quadraticCurveTo(s*1.4, -s*0.9, s*0.4, -s*1.0);
                c.quadraticCurveTo(s*1.0, -s*0.9, s*1.0, -s*0.2);
                c.lineTo(s*1.4, -s*0.5); c.lineTo(s*1.4, s*0.3); c.lineTo(s*1.0, s*0.5);
                c.closePath(); c.fill();
                // Firing slit
                c.fillStyle = 'rgba(20,20,20,0.9)';
                c.fillRect(-s*0.6, -s*0.5, s*1.2, s*0.08);
                // Secondary slit
                c.fillRect(-s*0.4, -s*0.25, s*0.8, s*0.06);
                // Concrete texture lines
                c.strokeStyle = 'rgba(70,75,70,0.3)'; c.lineWidth = 0.5;
                for (let i = 0; i < 5; i++) {
                    const ly = -s*0.6 + i*s*0.2;
                    c.beginPath(); c.moveTo(-s*0.95, ly); c.lineTo(s*0.95, ly); c.stroke();
                }
                // Steel door
                c.fillStyle = 'rgba(55,58,55,0.95)';
                c.fillRect(-s*0.25, -s*0.1, s*0.5, s*0.6);
                // Door hinges
                c.fillStyle = 'rgba(140,140,135,0.6)';
                c.fillRect(-s*0.25, -s*0.05, s*0.06, s*0.1);
                c.fillRect(-s*0.25, s*0.2, s*0.06, s*0.1);
                // Sandbag reinforcement at base
                c.fillStyle = 'rgba(130,115,75,0.7)';
                for (let row = 0; row < 2; row++) {
                    for (let i = 0; i < 6; i++) {
                        const offset = row % 2 === 0 ? 0 : s*0.15;
                        c.beginPath();
                        c.arc(-s*0.9 + i*s*0.35 + offset, s*0.35 + row*s*0.15, s*0.1, 0, Math.PI*2);
                        c.fill();
                    }
                }
                // Camo net draped on top
                c.fillStyle = 'rgba(70,90,50,0.3)';
                c.beginPath(); c.moveTo(-s*1.1, -s*0.7);
                c.quadraticCurveTo(-s*0.5, -s*1.1, 0, -s*0.85);
                c.quadraticCurveTo(s*0.5, -s*1.1, s*1.1, -s*0.7);
                c.fill();
                break;
            }
            case 'radar': {
                // Radar installation with rotating dish
                // Base building (equipment shelter)
                c.fillStyle = 'rgba(95,100,105,0.88)';
                c.fillRect(-s*0.6, -s*0.3, s*1.2, s*0.8);
                // Side face
                c.fillStyle = 'rgba(75,80,85,0.72)';
                c.beginPath(); c.moveTo(s*0.6, -s*0.3); c.lineTo(s*0.9, -s*0.5);
                c.lineTo(s*0.9, s*0.5); c.lineTo(s*0.6, s*0.5); c.fill();
                // Equipment door
                c.fillStyle = 'rgba(55,60,58,0.9)';
                c.fillRect(-s*0.15, s*0.0, s*0.35, s*0.5);
                // Generator exhaust vent
                c.fillStyle = 'rgba(50,50,50,0.6)';
                c.fillRect(-s*0.4, -s*0.2, s*0.2, s*0.15);
                // Support column for radar
                c.fillStyle = 'rgba(130,130,125,0.8)';
                c.fillRect(-s*0.08, -s*1.5, s*0.16, s*1.2);
                // Rotating radar dish
                const radarAngle = time * 0.02;
                c.save(); c.translate(0, -s*1.5); c.rotate(radarAngle);
                // Dish
                c.fillStyle = 'rgba(180,185,190,0.8)';
                c.beginPath();
                c.ellipse(0, 0, s*0.6, s*0.2, 0, 0, Math.PI); c.fill();
                // Dish rim
                c.strokeStyle = 'rgba(150,155,160,0.6)'; c.lineWidth = 1.5;
                c.beginPath();
                c.ellipse(0, 0, s*0.6, s*0.2, 0, 0, Math.PI); c.stroke();
                // Feed horn
                c.fillStyle = 'rgba(100,105,110,0.8)';
                c.fillRect(-s*0.03, -s*0.25, s*0.06, s*0.25);
                c.beginPath(); c.arc(0, -s*0.25, s*0.05, 0, Math.PI*2); c.fill();
                c.restore();
                // Radar sweep glow
                const sweepAngle = radarAngle;
                c.save(); c.translate(0, -s*1.5);
                c.strokeStyle = `rgba(0,200,100,${0.1 + Math.sin(time * 0.03) * 0.05})`;
                c.lineWidth = 1;
                c.beginPath(); c.moveTo(0, 0);
                c.lineTo(Math.cos(sweepAngle) * s*1.5, Math.sin(sweepAngle) * s*1.5);
                c.stroke();
                c.restore();
                // Cable from building to radar
                c.strokeStyle = 'rgba(60,60,55,0.5)'; c.lineWidth = 1;
                c.beginPath(); c.moveTo(s*0.3, -s*0.3);
                c.quadraticCurveTo(s*0.5, -s*0.9, s*0.08, -s*1.3);
                c.stroke();
                // Status LEDs
                c.fillStyle = Math.sin(time * 0.08) > 0 ? 'rgba(0,255,100,0.7)' : 'rgba(0,100,40,0.3)';
                c.beginPath(); c.arc(-s*0.35, -s*0.15, s*0.04, 0, Math.PI*2); c.fill();
                c.fillStyle = 'rgba(255,200,0,0.5)';
                c.beginPath(); c.arc(-s*0.25, -s*0.15, s*0.04, 0, Math.PI*2); c.fill();
                break;
            }
        }
        c.restore();
    }

    // ── 3D Empire-Specific Soldiers ──
    _drawTerritorySoldiers3D(c, W, H, tv, horizon) {
        const soldiers = tv.soldiers || [];
        const emp = this.g.empires[this.g.ts[tv.tid]?.owner];
        const eid = emp ? emp.id : '';
        const empireColor = emp ? emp.color : '#888';

        // Modern military costume definitions: armor, helmet, skin, legs, pouch, weapon, details
        const COSTUMES = {
            maurya:  { armor:'#4a6a3a', helmet:'#3a5a2a', skin:'#8B6914', legs:'#2a3a20', pouch:'#5a7a4a', helmetStyle:'mich', weapon:'ak47', accentColor:'#ffa500', visor:'dark' },
            roman:   { armor:'#6a3a2a', helmet:'#5a2a1a', skin:'#D4A574', legs:'#3a2015', pouch:'#7a4a3a', helmetStyle:'mich', weapon:'m4', accentColor:'#c0a060', visor:'tinted' },
            mongol:  { armor:'#5a5a5a', helmet:'#4a4a4a', skin:'#C4956A', legs:'#2a2a2a', pouch:'#6a6a6a', helmetStyle:'beret', weapon:'ak47', accentColor:'#90b060', visor:'dark' },
            ottoman: { armor:'#2a5a5a', helmet:'#1a4a4a', skin:'#C4956A', legs:'#1a3a3a', pouch:'#3a6a6a', helmetStyle:'beret', weapon:'g36', accentColor:'#e04040', visor:'tinted' },
            british: { armor:'#3a4a5a', helmet:'#2a3a4a', skin:'#D4B896', legs:'#1a2530', pouch:'#4a5a6a', helmetStyle:'mich', weapon:'sa80', accentColor:'#d0a040', visor:'dark' },
            napoleon:{ armor:'#3a4a7a', helmet:'#2a3a6a', skin:'#D4A574', legs:'#1a2a5a', pouch:'#4a5a8a', helmetStyle:'beret', weapon:'famas', accentColor:'#e0c040', visor:'tinted' },
            japan:   { armor:'#4a3a3a', helmet:'#3a2a2a', skin:'#F5D5B8', legs:'#1a1010', pouch:'#5a4a4a', helmetStyle:'jgsdf', weapon:'type89', accentColor:'#ff6060', visor:'dark' },
            germany: { armor:'#3a3a3a', helmet:'#2a2a2a', skin:'#D4A574', legs:'#1a1a1a', pouch:'#4a4a4a', helmetStyle:'mich', weapon:'g36', accentColor:'#cc2020', visor:'tinted' },
            russia:  { armor:'#5a2a2a', helmet:'#4a1a1a', skin:'#D4A574', legs:'#2a0a0a', pouch:'#6a3a3a', helmetStyle:'ssh68', weapon:'ak74', accentColor:'#ffd700', visor:'dark' },
            egypt:   { armor:'#6a6a3a', helmet:'#5a5a2a', skin:'#8B6914', legs:'#3a3a1a', pouch:'#7a7a4a', helmetStyle:'mich', weapon:'m4', accentColor:'#f0e060', visor:'tinted' },
        };
        const cost = COSTUMES[eid] || COSTUMES.roman;

        const sorted = [...soldiers].sort((a, b) => a.y - b.y);
        for (const s of sorted) {
            const sx = s.x * W;
            const sy = horizon + s.y * (H - horizon) * 0.65;
            const depth = s.y;
            const sc = (1.8 + depth * 2.5) * (s.size || 1);
            const flip = s.dir || 1;
            const lp = Math.sin(s.frame * 0.1) * 2;
            const br = Math.sin(s.frame * 0.05) * 0.5;

            c.save(); c.translate(sx, sy); c.scale(flip, 1);

            // Shadow
            c.fillStyle = 'rgba(0,0,0,0.15)';
            c.beginPath(); c.ellipse(2*sc, sc*5, sc*3.5, sc*1.2, 0, 0, Math.PI*2); c.fill();

            // Legs (tactical pants)
            c.strokeStyle = cost.legs; c.lineWidth = 2.8*sc;
            c.beginPath(); c.moveTo(-1.5*sc, sc*2); c.lineTo(-1.5*sc+lp*sc, sc*5); c.stroke();
            c.beginPath(); c.moveTo(1.5*sc, sc*2); c.lineTo(1.5*sc-lp*sc, sc*5); c.stroke();
            // Knee pads
            c.fillStyle = cost.legs;
            c.beginPath(); c.arc(-1.5*sc+lp*sc*0.5, sc*3.2, sc*0.8, 0, Math.PI*2); c.fill();
            c.beginPath(); c.arc(1.5*sc-lp*sc*0.5, sc*3.2, sc*0.8, 0, Math.PI*2); c.fill();
            // Combat boots
            c.fillStyle = '#1a1a1a';
            c.fillRect(-2.8*sc+lp*sc, sc*4.3, 3.2*sc, sc*1.0);
            c.fillRect(0.3*sc-lp*sc, sc*4.3, 3.2*sc, sc*1.0);
            // Boot soles
            c.fillStyle = '#111';
            c.fillRect(-3.0*sc+lp*sc, sc*5.0, 3.5*sc, sc*0.3);
            c.fillRect(0.1*sc-lp*sc, sc*5.0, 3.5*sc, sc*0.3);

            // Body — tactical vest (empire-specific camo color)
            c.fillStyle = cost.armor; c.globalAlpha = 0.9;
            c.fillRect(-3.5*sc, -sc*2+br, 7*sc, sc*4.2);
            // Vest plate carrier (darker center)
            c.fillStyle = 'rgba(30,30,30,0.4)';
            c.fillRect(-2*sc, -sc*1.5+br, 4*sc, sc*3.2);
            // MOLLE webbing detail
            c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 0.4*sc;
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 3; col++) {
                    c.strokeRect(-2.5*sc + col*sc*1.8, -sc*1.5+br + row*sc*0.8, sc*1.2, sc*0.5);
                }
            }
            c.globalAlpha = 1;
            // Tactical belt
            c.fillStyle = 'rgba(40,40,35,0.95)';
            c.fillRect(-4*sc, sc*1, 8*sc, sc*0.6);
            // Belt buckle
            c.fillStyle = '#888';
            c.fillRect(-0.6*sc, sc*0.8, 1.2*sc, sc*0.9);
            // Magazine pouch on belt
            c.fillStyle = cost.pouch;
            c.fillRect(2*sc, sc*0.5, sc*1.5, sc*1.2);
            // Grenade pouch
            c.fillStyle = '#3a5a30';
            c.fillRect(-4.5*sc, sc*0.5, sc*1.0, sc*1.0);

            // Empire-specific modern weapon (rifle)
            this._drawEmpireWeapon(c, cost.weapon, sc, br, cost);

            // Neck
            c.fillStyle = cost.skin;
            c.fillRect(-1*sc, -sc*2.5+br, 2*sc, sc*0.8);

            // Head
            c.fillStyle = cost.skin;
            c.beginPath(); c.arc(0, -sc*3.2+br, sc*2, 0, Math.PI*2); c.fill();

            // Modern combat helmet
            this._drawEmpireHelmet(c, cost.helmetStyle, sc, br, cost);

            // Weapon tier upgrades (shoulder patches, NVG)
            const wt = tv.weaponTier || 1;
            if (wt >= 3) {
                // Shoulder rank patches
                c.fillStyle = cost.accentColor; c.globalAlpha = 0.6;
                c.fillRect(-3.8*sc, -sc*2.2+br, sc*1.0, sc*0.6);
                c.fillRect(2.8*sc, -sc*2.2+br, sc*1.0, sc*0.6);
                c.globalAlpha = 1;
            }
            if (wt >= 4) {
                // NVG mount on helmet
                c.fillStyle = '#333';
                c.fillRect(-sc*0.4, -sc*4.8+br, sc*0.8, sc*0.5);
                c.fillStyle = '#555';
                c.beginPath(); c.arc(0, -sc*5.2+br, sc*0.4, 0, Math.PI*2); c.fill();
            }

            c.restore();
        }
    }

    // Draw empire-specific modern weapon (assault rifle)
    _drawEmpireWeapon(c, weapon, sc, br, cost) {
        // Common rifle drawing: stock + receiver + barrel + magazine
        const drawRifle = (barrelLen, magSize, hasScope, stockLen) => {
            // Stock
            c.fillStyle = '#3a3020';
            c.fillRect(-1*sc, -sc*0.5+br, (stockLen || 2.5)*sc, sc*1.0);
            // Receiver/body
            c.fillStyle = '#2a2a2a';
            c.fillRect(0, -sc*1.0+br, 3.5*sc, sc*1.5);
            // Barrel
            c.fillStyle = '#1a1a1a';
            c.fillRect(3*sc, -sc*0.8+br, (barrelLen || 4)*sc, sc*0.5);
            // Barrel tip / flash hider
            c.fillStyle = '#333';
            c.fillRect((3+barrelLen-0.5)*sc, -sc*0.85+br, sc*0.8, sc*0.6);
            // Magazine
            c.fillStyle = '#222';
            c.fillRect(1*sc, sc*0.3+br, sc*1.0, (magSize || 2.0)*sc);
            // Pistol grip
            c.fillStyle = '#1a1a1a';
            c.fillRect(2.5*sc, sc*0.2+br, sc*0.8, sc*1.5);
            // Handguard
            c.fillStyle = '#333';
            c.fillRect(2*sc, -sc*0.9+br, 2*sc, sc*0.7);
            // Iron sights
            c.fillStyle = '#444';
            c.fillRect(1*sc, -sc*1.2+br, sc*0.3, sc*0.3);
            c.fillRect((3+barrelLen-1)*sc, -sc*1.1+br, sc*0.3, sc*0.3);
            // Scope (if applicable)
            if (hasScope) {
                c.fillStyle = '#1a1a2a';
                c.fillRect(1.5*sc, -sc*1.6+br, 2.5*sc, sc*0.5);
                c.fillStyle = '#2a3a4a';
                c.beginPath(); c.arc(1.5*sc, -sc*1.35+br, sc*0.25, 0, Math.PI*2); c.fill();
                c.beginPath(); c.arc(4*sc, -sc*1.35+br, sc*0.25, 0, Math.PI*2); c.fill();
            }
            // Forward grip
            c.fillStyle = '#2a2520';
            c.fillRect(4*sc, sc*0.0+br, sc*0.4, sc*1.2);
        };

        switch (weapon) {
            case 'ak47': // Maurya, Mongol — AK-47
                drawRifle(4.5, 2.5, false, 2.8);
                // Curved magazine
                c.fillStyle = '#8B4513';
                c.fillRect(1*sc, sc*0.3+br, sc*1.0, sc*2.5);
                // Gas tube
                c.strokeStyle = '#444'; c.lineWidth = 0.4*sc;
                c.beginPath(); c.moveTo(3*sc, -sc*1.0+br); c.lineTo(6.5*sc, -sc*1.0+br); c.stroke();
                // Wooden handguard
                c.fillStyle = '#5a3a1a';
                c.fillRect(2*sc, -sc*0.9+br, 2.5*sc, sc*0.7);
                break;
            case 'm4': // Roman, Egypt — M4 Carbine
                drawRifle(4, 2, true, 2);
                // Rails on handguard
                c.strokeStyle = '#555'; c.lineWidth = 0.3*sc;
                for (let i = 0; i < 3; i++) {
                    c.beginPath(); c.moveTo(2.5*sc+i*sc*0.5, -sc*1.0+br);
                    c.lineTo(2.5*sc+i*sc*0.5, -sc*0.2+br); c.stroke();
                }
                // Collapsible stock detail
                c.strokeStyle = '#444'; c.lineWidth = 0.3*sc;
                c.beginPath(); c.moveTo(-0.5*sc, -sc*0.3+br); c.lineTo(1.5*sc, -sc*0.3+br); c.stroke();
                break;
            case 'g36': // Ottoman, Germany — G36
                drawRifle(4.2, 2, true, 2.5);
                // Integrated carry handle / optic
                c.fillStyle = '#2a2a2a';
                c.fillRect(1*sc, -sc*1.8+br, 3*sc, sc*0.5);
                c.fillStyle = '#3a5a3a';
                c.fillRect(1.5*sc, -sc*1.7+br, 2*sc, sc*0.3);
                // Translucent magazine
                c.fillStyle = 'rgba(100,150,100,0.5)';
                c.fillRect(1*sc, sc*0.3+br, sc*0.8, sc*2);
                break;
            case 'sa80': // British — SA80
                drawRifle(4.5, 2.5, true, 2.2);
                // Bullpup-style body (extended receiver)
                c.fillStyle = '#2a2a28';
                c.fillRect(-1*sc, -sc*1.0+br, 5*sc, sc*1.5);
                // SUSAT scope
                c.fillStyle = '#1a1a2a';
                c.fillRect(1*sc, -sc*1.8+br, 2*sc, sc*0.5);
                break;
            case 'famas': // Napoleon — FAMAS
                drawRifle(3.8, 2, false, 2.5);
                // Bullpup design — magazine behind grip
                c.fillStyle = '#222';
                c.fillRect(-0.5*sc, sc*0.2+br, sc*1.5, sc*2.2);
                // Carry handle
                c.fillStyle = '#333';
                c.fillRect(1*sc, -sc*1.6+br, 2*sc, sc*0.5);
                // Bipod (folded)
                c.strokeStyle = '#444'; c.lineWidth = 0.4*sc;
                c.beginPath(); c.moveTo(4*sc, sc*0.5+br); c.lineTo(4.5*sc, sc*1.5+br); c.stroke();
                break;
            case 'type89': // Japan — Type 89
                drawRifle(4, 2, true, 2.5);
                // Folding stock
                c.strokeStyle = '#444'; c.lineWidth = 0.5*sc;
                c.beginPath(); c.moveTo(-0.5*sc, -sc*0.3+br); c.lineTo(-0.5*sc, sc*0.8+br); c.stroke();
                // Rail system
                c.fillStyle = '#3a3a3a';
                c.fillRect(2*sc, -sc*1.1+br, 2.5*sc, sc*0.15);
                break;
            case 'ak74': // Russia — AK-74
                drawRifle(4.5, 2.2, false, 2.8);
                // Polymer magazine (orange/bakelite)
                c.fillStyle = '#8B4513';
                c.fillRect(1*sc, sc*0.3+br, sc*0.9, sc*2.2);
                // Muzzle brake
                c.fillStyle = '#444';
                c.fillRect(7*sc, -sc*0.9+br, sc*0.5, sc*0.7);
                // Sling
                c.strokeStyle = '#5a4a3a'; c.lineWidth = 0.4*sc;
                c.beginPath(); c.moveTo(-0.5*sc, -sc*0.3+br);
                c.quadraticCurveTo(2*sc, sc*1.5+br, 5*sc, sc*0.5+br); c.stroke();
                break;
            default: // Generic assault rifle
                drawRifle(4, 2, false, 2.5);
        }
    }

    // Draw modern combat helmet
    _drawEmpireHelmet(c, style, sc, br, cost) {
        switch (style) {
            case 'mich': // MICH/ACH helmet (US-style) — Roman, Maurya, Germany, Egypt, British
                c.fillStyle = cost.helmet;
                c.beginPath();
                c.arc(0, -sc*3.5+br, sc*2.3, Math.PI, 0);
                c.lineTo(sc*2.5, -sc*2.8+br);
                c.lineTo(-sc*2.5, -sc*2.8+br);
                c.closePath(); c.fill();
                // NVG shroud
                c.fillStyle = '#333';
                c.fillRect(-sc*0.3, -sc*5.2+br, sc*0.6, sc*0.4);
                // Ear covers
                c.fillStyle = cost.helmet;
                c.beginPath(); c.arc(-sc*2.2, -sc*2.8+br, sc*0.6, 0, Math.PI*2); c.fill();
                c.beginPath(); c.arc(sc*2.2, -sc*2.8+br, sc*0.6, 0, Math.PI*2); c.fill();
                break;
            case 'beret': // Military beret — Mongol, Ottoman, Napoleon
                c.fillStyle = cost.helmet;
                // Beret base
                c.beginPath(); c.arc(0, -sc*3.5+br, sc*2.2, Math.PI*0.8, -Math.PI*0.2); c.fill();
                // Beret top (floppy)
                c.beginPath();
                c.moveTo(-sc*2.2, -sc*3.5+br);
                c.quadraticCurveTo(-sc*1, -sc*5.5+br, sc*0.5, -sc*5+br);
                c.quadraticCurveTo(sc*2, -sc*4.5+br, sc*2.2, -sc*3.5+br);
                c.fill();
                // Beret cap
                c.beginPath(); c.arc(sc*0.5, -sc*5+br, sc*0.4, 0, Math.PI*2); c.fill();
                break;
            case 'ssh68': // Russian SSH-68 steel helmet
                c.fillStyle = cost.helmet;
                c.beginPath();
                c.arc(0, -sc*3.5+br, sc*2.3, Math.PI, 0);
                c.lineTo(sc*2.6, -sc*2.6+br);
                c.lineTo(-sc*2.6, -sc*2.6+br);
                c.closePath(); c.fill();
                // Rim
                c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.6*sc;
                c.beginPath();
                c.arc(0, -sc*3.5+br, sc*2.4, Math.PI*0.85, -Math.PI*0.15); c.stroke();
                // Liner straps
                c.strokeStyle = 'rgba(100,80,60,0.5)'; c.lineWidth = 0.4*sc;
                c.beginPath(); c.moveTo(-sc*2.4, -sc*2.6+br); c.lineTo(-sc*1.5, -sc*1.5+br); c.stroke();
                c.beginPath(); c.moveTo(sc*2.4, -sc*2.6+br); c.lineTo(sc*1.5, -sc*1.5+br); c.stroke();
                break;
            case 'jgsdf': // Japan JGSDF-style helmet
                c.fillStyle = cost.helmet;
                c.beginPath();
                c.arc(0, -sc*3.5+br, sc*2.3, Math.PI, 0);
                c.lineTo(sc*2.4, -sc*2.8+br);
                c.lineTo(-sc*2.4, -sc*2.8+br);
                c.closePath(); c.fill();
                // Cloth cover texture
                c.strokeStyle = 'rgba(0,0,0,0.1)'; c.lineWidth = 0.3*sc;
                for (let i = -2; i <= 2; i++) {
                    c.beginPath(); c.moveTo(i*sc*0.8, -sc*5+br); c.lineTo(i*sc*0.8, -sc*2.8+br); c.stroke();
                }
                // Star insignia
                c.fillStyle = cost.accentColor; c.globalAlpha = 0.7;
                c.font = `bold ${Math.round(sc*1.5)}px sans-serif`;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText('\u2605', 0, -sc*3.5+br);
                c.globalAlpha = 1;
                break;
            default: // Generic modern helmet (MICH-style)
                c.fillStyle = cost.helmet;
                c.beginPath();
                c.arc(0, -sc*3.5+br, sc*2.2, Math.PI, 0);
                c.lineTo(sc*2.4, -sc*2.8+br);
                c.lineTo(-sc*2.4, -sc*2.8+br);
                c.closePath(); c.fill();
        }
        // Eye protection goggles / glasses
        c.fillStyle = cost.visor === 'tinted' ? 'rgba(40,60,80,0.6)' : 'rgba(20,20,30,0.4)';
        c.fillRect(-sc*1.3, -sc*3.4+br, sc*2.6, sc*0.4);
        // Goggle strap
        c.strokeStyle = 'rgba(40,40,40,0.4)'; c.lineWidth = 0.4*sc;
        c.beginPath(); c.arc(0, -sc*3.5+br, sc*2.5, Math.PI*0.8, -Math.PI*0.2); c.stroke();
    }

    // ── Player Avatar (the user's head/character) ──
    _drawPlayerAvatar(c, W, H, tv, horizon) {
        const tid = tv.tid;
        const s = this.g.ts[tid];
        if (!s || s.owner !== this.g.player) return; // Only show for owned territories

        const emp = this.g.empires[this.g.player];
        const time = tv.time;

        // Position: bottom-left area, standing prominently
        const ax = W * 0.12, ay = horizon + (H - horizon) * 0.78;
        const scale = 2.2;

        // Ground shadow
        c.fillStyle = 'rgba(0,0,0,0.2)';
        c.beginPath(); c.ellipse(ax, ay + scale*8, scale*10, scale*2.5, 0, 0, Math.PI*2); c.fill();

        // Nameplate glow
        const nameGr = c.createRadialGradient(ax, ay - scale*15, 0, ax, ay - scale*15, scale*30);
        nameGr.addColorStop(0, emp.color + '30'); nameGr.addColorStop(1, emp.color + '00');
        c.fillStyle = nameGr; c.beginPath(); c.arc(ax, ay - scale*15, scale*30, 0, Math.PI*2); c.fill();

        // Legs
        const legP = Math.sin(time * 0.04) * 1.5;
        c.strokeStyle = 'rgba(40,40,50,0.9)'; c.lineWidth = 3*scale;
        c.beginPath(); c.moveTo(ax-2*scale, ay+scale*2); c.lineTo(ax-2*scale+legP, ay+scale*8); c.stroke();
        c.beginPath(); c.moveTo(ax+2*scale, ay+scale*2); c.lineTo(ax+2*scale-legP, ay+scale*8); c.stroke();
        // Boots
        c.fillStyle = 'rgba(50,30,15,0.9)';
        c.fillRect(ax-3.5*scale+legP, ay+scale*7, 3.5*scale, scale*1.2);
        c.fillRect(ax+0.5*scale-legP, ay+scale*7, 3.5*scale, scale*1.2);

        // Body (empire armor)
        c.fillStyle = emp.color;
        c.globalAlpha = 0.9;
        c.fillRect(ax-4*scale, ay-scale*6, 8*scale, scale*9);
        // Armor details
        c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = scale*0.5;
        c.strokeRect(ax-3.5*scale, ay-scale*5, 7*scale, scale*7);
        // Empire emblem on chest
        c.fillStyle = 'rgba(255,215,0,0.5)'; c.font = `bold ${Math.round(scale*5)}px serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(emp.icon || '\u2655', ax, ay-scale*2);
        c.globalAlpha = 1;

        // Belt
        c.fillStyle = 'rgba(100,70,30,0.9)';
        c.fillRect(ax-4.5*scale, ay+scale*1.5, 9*scale, scale*0.8);
        // Belt buckle
        c.fillStyle = 'rgba(255,215,0,0.7)';
        c.fillRect(ax-1*scale, ay+scale*1.3, 2*scale, scale*1.2);

        // Left arm (tactical vest sleeve)
        c.fillStyle = emp.dark; c.globalAlpha = 0.9;
        c.beginPath(); c.ellipse(ax-5*scale, ay-scale*2, scale*3, scale*3.5, -0.15, 0, Math.PI*2); c.fill();
        c.globalAlpha = 1;

        // Right arm (rifle)
        c.strokeStyle = '#2a2a2a'; c.lineWidth = scale*1.5;
        c.beginPath(); c.moveTo(ax+5*scale, ay-scale*4); c.lineTo(ax+8*scale, ay-scale*10); c.stroke();
        // Barrel
        c.strokeStyle = '#1a1a1a'; c.lineWidth = scale*1;
        c.beginPath(); c.moveTo(ax+8*scale, ay-scale*10); c.lineTo(ax+12*scale, ay-scale*13); c.stroke();
        // Magazine
        c.fillStyle = '#333';
        c.fillRect(ax+6*scale, ay-scale*6, scale*1.5, scale*2.5);

        // Neck
        c.fillStyle = 'rgba(210,180,140,0.9)';
        c.fillRect(ax-1.2*scale, ay-scale*7.5, 2.4*scale, scale*2);

        // Head (player face)
        c.fillStyle = 'rgba(220,190,150,0.95)';
        c.beginPath(); c.arc(ax, ay-scale*10, scale*3, 0, Math.PI*2); c.fill();

        // Crown/helmet
        c.fillStyle = emp.color;
        c.beginPath();
        c.moveTo(ax-scale*3, ay-scale*10);
        c.lineTo(ax-scale*2.5, ay-scale*14);
        c.lineTo(ax-scale*1.5, ay-scale*12);
        c.lineTo(ax-scale*0.5, ay-scale*15);
        c.lineTo(ax, ay-scale*13);
        c.lineTo(ax+scale*0.5, ay-scale*15);
        c.lineTo(ax+scale*1.5, ay-scale*12);
        c.lineTo(ax+scale*2.5, ay-scale*14);
        c.lineTo(ax+scale*3, ay-scale*10);
        c.fill();
        // Crown gems
        c.fillStyle = 'rgba(255,50,50,0.8)';
        c.beginPath(); c.arc(ax, ay-scale*14.5, scale*0.5, 0, Math.PI*2); c.fill();
        c.fillStyle = 'rgba(50,100,255,0.8)';
        c.beginPath(); c.arc(ax-scale*2, ay-scale*13.5, scale*0.4, 0, Math.PI*2); c.fill();
        c.beginPath(); c.arc(ax+scale*2, ay-scale*13.5, scale*0.4, 0, Math.PI*2); c.fill();

        // Eyes
        c.fillStyle = 'rgba(40,40,50,0.9)';
        c.beginPath(); c.arc(ax-scale*1, ay-scale*10.5, scale*0.5, 0, Math.PI*2); c.fill();
        c.beginPath(); c.arc(ax+scale*1, ay-scale*10.5, scale*0.5, 0, Math.PI*2); c.fill();
        // Eye shine
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.beginPath(); c.arc(ax-scale*0.8, ay-scale*10.7, scale*0.2, 0, Math.PI*2); c.fill();
        c.beginPath(); c.arc(ax+scale*1.2, ay-scale*10.7, scale*0.2, 0, Math.PI*2); c.fill();
        // Mouth
        c.strokeStyle = 'rgba(150,100,80,0.6)'; c.lineWidth = scale*0.4;
        c.beginPath(); c.arc(ax, ay-scale*8.5, scale*0.8, 0.2, Math.PI-0.2); c.stroke();

        // Floating name tag
        const nameY = ay - scale*18;
        c.font = `bold ${Math.round(scale*3.5)}px Georgia, serif`;
        c.textAlign = 'center'; c.textBaseline = 'bottom';
        const nameW = c.measureText(emp.name).width + 16;
        // Tag background
        c.fillStyle = 'rgba(0,0,0,0.6)';
        this._rr(c, ax - nameW/2, nameY - scale*3.5, nameW, scale*4, 4); c.fill();
        c.strokeStyle = emp.color + '80'; c.lineWidth = 1;
        this._rr(c, ax - nameW/2, nameY - scale*3.5, nameW, scale*4, 4); c.stroke();
        // Tag text
        c.fillStyle = '#ffd700';
        c.fillText(emp.name, ax, nameY - scale*0.5);
        // "YOU" indicator
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.font = `${Math.round(scale*2)}px "Segoe UI", sans-serif`;
        c.fillText('\u25BC YOU', ax, nameY - scale*4);
    }

    // Draw navigation tabs
    _drawTerritoryTabs(c, g, W, H, tv) {
        const baseTabs = [
            { id: null, icon: '\uD83C\uDFD9\uFE0F', label: 'Scene' },
            { id: 'explore', icon: '\uD83D\uDD0D', label: 'Explore' },
            { id: 'build', icon: '\uD83C\uDFD7\uFE0F', label: 'Build' },
            { id: 'shop', icon: '\uD83D\uDED2', label: 'Shop' },
            { id: 'weapons', icon: '\u2694', label: 'Weapons' },
            { id: 'attack', icon: '\uD83D\uDCA5', label: 'Battle' },
            { id: 'story', icon: '\uD83D\uDCDC', label: 'Story' },
            { id: 'manage', icon: '\u2699\uFE0F', label: 'Manage' },
        ];
        // Add online-only tabs when in online mode
        const isOnline = g._gameMode === 'online';
        if (isOnline) {
            baseTabs.push(
                { id: 'chat', icon: '\uD83D\uDCAC', label: 'Chat', online: true },
                { id: 'alliance', icon: '\uD83E\uDD1D', label: 'Alliance', online: true },
                { id: 'trade', icon: '\uD83D\uDCE6', label: 'Trade', online: true },
                { id: 'spy', icon: '\uD83D\uDD75\uFE0F', label: 'Spy', online: true },
                { id: 'diplomacy', icon: '\uD83C\uDFAF', label: 'Diplo', online: true },
            );
        }
        const tabs = baseTabs;
        const tabW = tabs.length > 7 ? 75 : 90, tabH = 36, tabY = 62, gap = 4;
        const totalW = tabs.length * tabW + (tabs.length - 1) * gap;
        const startX = (W - totalW) / 2;

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const tx = startX + i * (tabW + gap);
            const isActive = tv.sub === tab.id;

            // Tab background
            this._rr(c, tx, tabY, tabW, tabH, 8);
            if (isActive) {
                c.fillStyle = tab.online ? 'rgba(30,136,229,0.3)' : 'rgba(255,215,0,0.3)'; c.fill();
                c.strokeStyle = tab.online ? '#42A5F5' : '#ffd700'; c.lineWidth = 2;
            } else {
                c.fillStyle = 'rgba(20,15,10,0.6)'; c.fill();
                c.strokeStyle = tab.online ? 'rgba(30,136,229,0.3)' : 'rgba(255,215,0,0.3)'; c.lineWidth = 1;
            }
            this._rr(c, tx, tabY, tabW, tabH, 8); c.stroke();

            // Online badge
            if (tab.online && !isActive) {
                c.fillStyle = '#1E88E5';
                c.beginPath(); c.arc(tx + tabW - 8, tabY + 8, 4, 0, Math.PI * 2); c.fill();
            }

            // Tab text
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = isActive ? (tab.online ? '#42A5F5' : '#ffd700') : '#c0b090';
            c.font = `${isActive ? 'bold ' : ''}${tabW < 80 ? 11 : 13}px "Segoe UI", sans-serif`;
            c.fillText(tabW < 80 ? tab.label : `${tab.icon} ${tab.label}`, tx + tabW / 2, tabY + tabH / 2);

            // Register click
            g.btns.push({ rect: { x: tx, y: tabY, w: tabW, h: tabH }, fn: () => { tv.sub = tab.id; g.sfx.click(); } });
        }
    }

    // BUILD sub-view: construct buildings
    _drawBuildView(c, g, W, H, tv) {
        const tid = tv.tid, t = T(tid), s = g.ts[tid];
        const emp = g.empires[g.player];
        const panelW = 380, panelH = 340;
        const px = (W - panelW) / 2, py = 100;

        // Panel background
        c.fillStyle = 'rgba(10,5,0,0.8)';
        this._rr(c, px, py, panelW, panelH, 14); c.fill();
        c.strokeStyle = 'rgba(255,215,0,0.5)'; c.lineWidth = 2;
        this._rr(c, px, py, panelW, panelH, 14); c.stroke();

        // Title
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = '#ffd700'; c.font = 'bold 20px Georgia, serif';
        c.fillText('\uD83C\uDFD7\uFE0F Construct Buildings', px + panelW / 2, py + 12);

        // Coins display
        c.fillStyle = '#f1c40f'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText(`\uD83E\uDE99 ${emp.coins} Coins`, px + panelW / 2, py + 38);

        // Building options
        const bTypes = ['command_center', 'supply_depot', 'watchtower', 'armory', 'bunker', 'radar'];
        const icons = { command_center: '🏢', supply_depot: '📦', watchtower: '🗼', armory: '🔫', bunker: '🛡️', radar: '📡' };
        const costs = { command_center: 25, supply_depot: 15, watchtower: 20, armory: 30, bunker: 20, radar: 35 };
        const descs = { command_center: '+1 troop/turn', supply_depot: '+2 income/turn', watchtower: '+3 defense', armory: '+3 coins/turn', bunker: '+2 fort', radar: '+intel' };
        const bld = s.buildings || {};

        const itemH = 42, startY = py + 62;
        for (let i = 0; i < bTypes.length; i++) {
            const bt = bTypes[i];
            const iy = startY + i * itemH;
            const count = bld[bt] || 0;
            const cost = costs[bt];
            const canAfford = emp.coins >= cost;
            const maxed = count >= 3;

            // Row background
            this._rr(c, px + 10, iy, panelW - 20, itemH - 4, 8);
            c.fillStyle = maxed ? 'rgba(40,40,40,0.6)' : canAfford ? 'rgba(30,50,30,0.5)' : 'rgba(50,30,30,0.5)';
            c.fill();

            // Icon
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.font = '20px "Segoe UI", sans-serif';
            c.fillText(icons[bt] || '\uD83C\uDFE0', px + 20, iy + itemH / 2 - 2);

            // Name + description
            c.fillStyle = maxed ? '#666' : '#e0d0b0'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText(bt.charAt(0).toUpperCase() + bt.slice(1), px + 50, iy + 14);
            c.fillStyle = maxed ? '#555' : '#a09080'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText(descs[bt] || '', px + 50, iy + 30);

            // Count
            c.textAlign = 'center'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillStyle = count > 0 ? '#2ecc71' : '#666';
            c.fillText(`${count}/3`, px + panelW - 120, iy + itemH / 2 - 2);

            // Build button
            if (!maxed) {
                const bbW = 65, bbH = 28, bbX = px + panelW - 65, bbY = iy + 5;
                this._rr(c, bbX, bbY, bbW, bbH, 6);
                c.fillStyle = canAfford ? 'rgba(46,204,113,0.7)' : 'rgba(100,100,100,0.5)';
                c.fill();
                c.fillStyle = canAfford ? '#fff' : '#888'; c.font = 'bold 12px "Segoe UI", sans-serif';
                c.fillText(`${cost}c`, bbX + bbW / 2, bbY + bbH / 2);
                if (canAfford) {
                    g.btns.push({ rect: { x: bbX, y: bbY, w: bbW, h: bbH }, fn: () => {
                        g._buildStructure(tid, bt);
                    }});
                }
            } else {
                c.textAlign = 'center'; c.fillStyle = '#666'; c.font = '11px "Segoe UI", sans-serif';
                c.fillText('MAX', px + panelW - 40, iy + itemH / 2 - 2);
            }
        }
    }

    // SHOP sub-view: local territory shop
    _drawTerrShopView(c, g, W, H, tv) {
        const tid = tv.tid, t = T(tid), s = g.ts[tid];
        const emp = g.empires[g.player];
        const panelW = 420, panelH = 360;
        const px = (W - panelW) / 2, py = 100;

        // Shop panel
        c.fillStyle = 'rgba(10,5,0,0.82)';
        this._rr(c, px, py, panelW, panelH, 14); c.fill();
        c.strokeStyle = 'rgba(255,215,0,0.5)'; c.lineWidth = 2;
        this._rr(c, px, py, panelW, panelH, 14); c.stroke();

        // Title
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = '#ffd700'; c.font = 'bold 20px Georgia, serif';
        c.fillText('\uD83D\uDED2 Territory Shop', px + panelW / 2, py + 12);

        // Coins
        c.fillStyle = '#f1c40f'; c.font = '14px "Segoe UI", sans-serif';
        c.fillText(`\uD83E\uDE99 ${emp.coins} Coins`, px + panelW / 2, py + 38);

        // Shop items
        const items = [
            { id: 'soldier', icon: '\uD83D\uDC82', name: 'Recruit Soldier', cost: 10, desc: '+1 troop to this territory' },
            { id: 'veteran', icon: '\uD83D\uDEE1\uFE0F', name: 'Hire Veteran', cost: 20, desc: '+2 elite troops' },
            { id: 'fortify', icon: '\uD83D\uDEE1', name: 'Fortify Walls', cost: 15, desc: '+2 permanent defense' },
            { id: 'scout', icon: '\uD83D\uDD0D', name: 'Send Scout', cost: 8, desc: 'Reveal neighbor troop counts' },
            { id: 'heal', icon: '\uD83C\uDFE5', name: 'Field Hospital', cost: 12, desc: '+3 troops (wounded recover)' },
            { id: 'supply', icon: '\uD83D\uDCE6', name: 'Supply Wagon', cost: 10, desc: '+5 coins next income' },
        ];

        const itemH = 48, startY = py + 62;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const iy = startY + i * itemH;
            const canAfford = emp.coins >= item.cost;

            // Row
            this._rr(c, px + 10, iy, panelW - 20, itemH - 4, 8);
            c.fillStyle = canAfford ? 'rgba(30,40,20,0.5)' : 'rgba(40,20,20,0.5)';
            c.fill();

            // Icon
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.font = '22px "Segoe UI", sans-serif';
            c.fillText(item.icon, px + 20, iy + itemH / 2 - 2);

            // Name + desc
            c.fillStyle = canAfford ? '#e0d0b0' : '#777'; c.font = 'bold 14px "Segoe UI", sans-serif';
            c.fillText(item.name, px + 52, iy + 14);
            c.fillStyle = canAfford ? '#a09080' : '#555'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText(item.desc, px + 52, iy + 32);

            // Buy button
            const bbW = 55, bbH = 26, bbX = px + panelW - 68, bbY = iy + 9;
            this._rr(c, bbX, bbY, bbW, bbH, 6);
            c.fillStyle = canAfford ? 'rgba(241,196,15,0.7)' : 'rgba(80,80,80,0.5)';
            c.fill();
            c.textAlign = 'center'; c.fillStyle = canAfford ? '#1a1a2e' : '#666'; c.font = 'bold 12px "Segoe UI", sans-serif';
            c.fillText(`${item.cost}c`, bbX + bbW / 2, bbY + bbH / 2);

            if (canAfford) {
                g.btns.push({ rect: { x: bbX, y: bbY, w: bbW, h: bbH }, fn: () => {
                    if (s.owner !== g.player) { g.sfx.error(); g._log('Not your territory!'); return; }
                    emp.coins -= item.cost;
                    switch (item.id) {
                        case 'soldier': s.troops++; g._log(`Recruited 1 soldier at ${t.name}`); g.sfx.recruit(); break;
                        case 'veteran': s.troops += 2; g._log(`Hired 2 veterans at ${t.name}`); g.sfx.recruit(); break;
                        case 'fortify': s.fort += 2; g._log(`Fortified ${t.name} (+2 def)`); break;
                        case 'scout':
                            for (const a of t.adj) {
                                const aOwner = g.ts[a].owner;
                                g._log(`Scout: ${T(a).name} has ${g.ts[a].troops} troops (${aOwner ? E(aOwner).name : 'Neutral'})`);
                            }
                            break;
                        case 'heal': s.troops += 3; g._log(`Field hospital healed 3 troops at ${t.name}`); break;
                        case 'supply': g._supplyBonus = (g._supplyBonus || 0) + 5; g._log(`Supply wagon incoming! +5 coins next turn`); break;
                    }
                    if (item.id !== 'soldier' && item.id !== 'veteran') g.sfx.buy();
                }});
            }
        }
    }

    // STORY sub-view: territory history and lore
    _drawStoryView(c, g, W, H, tv) {
        const tid = tv.tid, t = T(tid), s = g.ts[tid];
        const panelW = 500, panelH = 380;
        const px = (W - panelW) / 2, py = 100;

        // Parchment-style panel
        const parchGr = c.createLinearGradient(px, py, px, py + panelH);
        parchGr.addColorStop(0, '#f5e6c8'); parchGr.addColorStop(1, '#e8d5a8');
        this._rr(c, px, py, panelW, panelH, 14); c.fillStyle = parchGr; c.fill();
        // Double border
        c.strokeStyle = '#8b7355'; c.lineWidth = 2;
        this._rr(c, px, py, panelW, panelH, 14); c.stroke();
        c.strokeStyle = 'rgba(139,115,85,0.3)'; c.lineWidth = 1;
        this._rr(c, px + 6, py + 6, panelW - 12, panelH - 12, 10); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'top';

        // Decorative title with scroll ornament
        c.fillStyle = '#4a3520'; c.font = 'bold 22px Georgia, serif';
        c.fillText(`\uD83D\uDCDC History of ${t.name}`, px + panelW / 2, py + 18);

        // Ornamental line
        c.strokeStyle = 'rgba(139,115,85,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 40, py + 48); c.lineTo(px + panelW - 40, py + 48); c.stroke();
        // Diamond ornament
        c.fillStyle = '#8b7355';
        c.beginPath(); c.moveTo(px + panelW / 2, py + 44); c.lineTo(px + panelW / 2 + 6, py + 48);
        c.lineTo(px + panelW / 2, py + 52); c.lineTo(px + panelW / 2 - 6, py + 48); c.fill();

        // Territory story
        const story = TERRITORY_STORIES[tid];
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillStyle = '#3a2a15'; c.font = 'italic 14px Georgia, serif';
        if (story) {
            // Word-wrap the story text
            const maxW = panelW - 50;
            const words = story.split(' ');
            let line = '', ly = py + 65;
            for (const word of words) {
                const test = line + word + ' ';
                if (c.measureText(test).width > maxW && line) {
                    c.fillText(line.trim(), px + 25, ly);
                    line = word + ' '; ly += 20;
                } else {
                    line = test;
                }
            }
            if (line) c.fillText(line.trim(), px + 25, ly);
        } else {
            c.fillText('No historical records found for this territory.', px + 25, py + 65);
        }

        // Empire story (if owned)
        const empireId = s.owner;
        const empStory = EMPIRE_STORIES[empireId];
        if (empStory) {
            const storyStartY = py + 180;
            c.strokeStyle = 'rgba(139,115,85,0.3)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(px + 40, storyStartY - 8); c.lineTo(px + panelW - 40, storyStartY - 8); c.stroke();

            c.fillStyle = '#4a3520'; c.font = 'bold 16px Georgia, serif';
            c.textAlign = 'center';
            c.fillText(`The ${E(empireId).name}`, px + panelW / 2, storyStartY);

            c.textAlign = 'left'; c.font = 'italic 13px Georgia, serif';
            c.fillStyle = '#3a2a15';
            const maxW2 = panelW - 50;
            const storyText = Array.isArray(empStory) ? empStory.join(' ') : String(empStory);
            const words2 = storyText.split(' ');
            let line2 = '', ly2 = storyStartY + 25;
            for (const word of words2) {
                const test = line2 + word + ' ';
                if (c.measureText(test).width > maxW2 && line2) {
                    c.fillText(line2.trim(), px + 25, ly2);
                    line2 = word + ' '; ly2 += 18;
                } else {
                    line2 = test;
                }
            }
            if (line2) c.fillText(line2.trim(), px + 25, ly2);
        }

        // Decorative corner flourish
        c.strokeStyle = 'rgba(139,115,85,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 15, py + 15); c.lineTo(px + 30, py + 15); c.stroke();
        c.beginPath(); c.moveTo(px + 15, py + 15); c.lineTo(px + 15, py + 30); c.stroke();
        c.beginPath(); c.moveTo(px + panelW - 15, py + 15); c.lineTo(px + panelW - 30, py + 15); c.stroke();
        c.beginPath(); c.moveTo(px + panelW - 15, py + 15); c.lineTo(px + panelW - 15, py + 30); c.stroke();
        c.beginPath(); c.moveTo(px + 15, py + panelH - 15); c.lineTo(px + 30, py + panelH - 15); c.stroke();
        c.beginPath(); c.moveTo(px + 15, py + panelH - 15); c.lineTo(px + 15, py + panelH - 30); c.stroke();
    }

    // ── ONLINE: CHAT PANEL ──────────────────────────────────
    _drawOnlineChat(c, g, W, H, tv) {
        const px = W * 0.05, py = H * 0.18, pw = W * 0.9, ph = H * 0.72;
        c.fillStyle = 'rgba(13,27,42,0.92)';
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.fill();
        c.strokeStyle = 'rgba(30,136,229,0.4)'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#42A5F5'; c.font = 'bold 18px Georgia, serif';
        c.fillText('\uD83D\uDCAC LIVE CHAT', px + pw / 2, py + 25);

        // Room / Global toggle
        const tW = 90, tH = 28, tY = py + 48;
        const scope = g._chatScope || 'room';
        ['room', 'global'].forEach((s, i) => {
            const tx = px + pw / 2 - tW - 5 + i * (tW + 10);
            const active = scope === s;
            c.fillStyle = active ? 'rgba(30,136,229,0.3)' : 'rgba(255,255,255,0.05)';
            c.beginPath(); c.roundRect(tx, tY, tW, tH, 6); c.fill();
            if (active) { c.strokeStyle = '#42A5F5'; c.lineWidth = 1; c.beginPath(); c.roundRect(tx, tY, tW, tH, 6); c.stroke(); }
            c.fillStyle = active ? '#42A5F5' : '#78909C'; c.font = 'bold 11px "Segoe UI", sans-serif';
            c.textAlign = 'center';
            c.fillText(s === 'room' ? '\uD83D\uDCAC Room' : '\uD83C\uDF0D Global', tx + tW / 2, tY + tH / 2);
            g.btns.push({ rect: { x: tx, y: tY, w: tW, h: tH }, fn: () => { g._chatScope = s; g.sfx.click(); } });
        });

        // Messages area
        const msgY = tY + 40, msgH = ph - 130;
        c.fillStyle = 'rgba(0,0,0,0.2)';
        c.beginPath(); c.roundRect(px + 10, msgY, pw - 20, msgH, 8); c.fill();
        const msgs = scope === 'global' ? (g.online?.globalMessages || []) : (g.online?.messages || []);
        const visible = msgs.slice(-(Math.floor(msgH / 22)));
        visible.forEach((m, i) => {
            const my = msgY + 10 + i * 22;
            if (my > msgY + msgH - 10) return;
            c.textAlign = 'left';
            c.fillStyle = '#90CAF9'; c.font = 'bold 11px "Segoe UI", sans-serif';
            c.fillText(m.from + ':', px + 20, my);
            c.fillStyle = '#CFD8DC'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText(m.text, px + 20 + c.measureText(m.from + ': ').width, my);
        });
        if (msgs.length === 0) {
            c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.2)'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText('No messages yet. Start chatting!', px + pw / 2, msgY + msgH / 2);
        }

        // Input area
        const inpY = msgY + msgH + 8, inpW = pw - 90, inpH = 32;
        c.fillStyle = g._typingChat ? 'rgba(30,136,229,0.15)' : 'rgba(255,255,255,0.05)';
        c.beginPath(); c.roundRect(px + 10, inpY, inpW, inpH, 6); c.fill();
        c.strokeStyle = 'rgba(30,136,229,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(px + 10, inpY, inpW, inpH, 6); c.stroke();
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillStyle = g._chatInput ? '#fff' : 'rgba(255,255,255,0.3)';
        c.font = '12px "Segoe UI", sans-serif';
        const displayText = g._chatInput || 'Type a message...';
        c.fillText(displayText.length > 60 ? displayText.slice(-55) + '...' : displayText, px + 20, inpY + inpH / 2);
        g._chatInputRect = { x: px + 10, y: inpY, w: inpW, h: inpH };

        // Send button
        const sbX = px + pw - 72, sbW = 60, sbH = inpH;
        const sbGr = c.createLinearGradient(sbX, inpY, sbX + sbW, inpY);
        sbGr.addColorStop(0, '#1E88E5'); sbGr.addColorStop(1, '#1565C0');
        c.beginPath(); c.roundRect(sbX, inpY, sbW, sbH, 6); c.fillStyle = sbGr; c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 12px "Segoe UI", sans-serif'; c.textAlign = 'center';
        c.fillText('Send', sbX + sbW / 2, inpY + sbH / 2);
        g.btns.push({ rect: { x: sbX, y: inpY, w: sbW, h: sbH }, fn: () => {
            if (g._chatInput && g.online) {
                g.online.sendChat(g._chatInput, g._chatScope || 'room');
                g._chatInput = '';
            }
            g.sfx.click();
        }});
    }

    // ── ONLINE: ALLIANCE PANEL ──────────────────────────────
    _drawAlliancePanel(c, g, W, H, tv) {
        const px = W * 0.05, py = H * 0.18, pw = W * 0.9, ph = H * 0.72;
        c.fillStyle = 'rgba(13,27,42,0.92)';
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.fill();
        c.strokeStyle = 'rgba(76,175,80,0.4)'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#66BB6A'; c.font = 'bold 18px Georgia, serif';
        c.fillText('\uD83E\uDD1D ALLIANCES', px + pw / 2, py + 25);
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText('Form alliances to share defense and coordinate attacks', px + pw / 2, py + 48);

        let ay = py + 70;
        c.textAlign = 'left'; c.fillStyle = '#A5D6A7'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('PENDING REQUESTS:', px + 20, ay); ay += 25;
        const alliances = g.online?.pendingRequests?.filter(r => r.type === 'alliance') || [];
        if (alliances.length === 0) {
            c.fillStyle = 'rgba(255,255,255,0.2)'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText('No pending alliance requests', px + 20, ay);
        }
        for (const req of alliances) {
            c.fillStyle = 'rgba(76,175,80,0.1)';
            c.beginPath(); c.roundRect(px + 15, ay - 12, pw - 30, 36, 6); c.fill();
            c.fillStyle = '#C8E6C9'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText(req.fromName + ' wants to ally!', px + 25, ay + 5);
            const abX = px + pw - 150, abW = 55, abH = 26;
            c.fillStyle = '#43A047'; c.beginPath(); c.roundRect(abX, ay - 8, abW, abH, 4); c.fill();
            c.fillStyle = '#fff'; c.font = 'bold 11px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText('Accept', abX + abW / 2, ay + 5);
            g.btns.push({ rect: { x: abX, y: ay - 8, w: abW, h: abH }, fn: () => {
                if (g.online) { g.online.respondAlliance(req.from, true); g.sfx.buy(); }
            }});
            const rbX = abX + abW + 8;
            c.fillStyle = '#E53935'; c.beginPath(); c.roundRect(rbX, ay - 8, abW, abH, 4); c.fill();
            c.fillStyle = '#fff'; c.fillText('Reject', rbX + abW / 2, ay + 5);
            g.btns.push({ rect: { x: rbX, y: ay - 8, w: abW, h: abH }, fn: () => {
                if (g.online) { g.online.respondAlliance(req.from, false); g.sfx.click(); }
            }});
            c.textAlign = 'left'; ay += 45;
        }

        // Alliance benefits
        const bY = py + ph - 70;
        c.fillStyle = 'rgba(255,255,255,0.05)';
        c.beginPath(); c.roundRect(px + 10, bY, pw - 20, 50, 8); c.fill();
        c.textAlign = 'center'; c.fillStyle = '#FFD54F'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.fillText('ALLIANCE BENEFITS', px + pw / 2, bY + 15);
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = '10px "Segoe UI", sans-serif';
        c.fillText('Shared defense (+20%) | Cannot attack allies | Coordinated turns', px + pw / 2, bY + 35);
    }

    // ── ONLINE: TRADE PANEL ─────────────────────────────────
    _drawTradePanel(c, g, W, H, tv) {
        const px = W * 0.05, py = H * 0.18, pw = W * 0.9, ph = H * 0.72;
        c.fillStyle = 'rgba(13,27,42,0.92)';
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.fill();
        c.strokeStyle = 'rgba(255,183,77,0.4)'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#FFB74D'; c.font = 'bold 18px Georgia, serif';
        c.fillText('\uD83D\uDCE6 TRADE', px + pw / 2, py + 25);
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText('Exchange troops, coins, and weapons with other players', px + pw / 2, py + 48);

        let ry = py + 75;
        // Your resources
        c.fillStyle = 'rgba(255,183,77,0.08)';
        c.beginPath(); c.roundRect(px + 10, ry, pw / 2 - 20, 80, 8); c.fill();
        c.fillStyle = '#FFB74D'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('YOUR OFFER', px + pw * 0.25, ry + 18);
        c.fillStyle = '#CFD8DC'; c.font = '11px "Segoe UI", sans-serif';
        const myEmp = g.empires[g.player];
        c.fillText('\uD83D\uDCAA Troops available: ' + (myEmp?.troops || 0), px + pw * 0.25, ry + 40);
        c.fillText('\uD83D\uDCB0 Coins: ' + (myEmp?.coins || 0), px + pw * 0.25, ry + 60);

        // Request
        c.fillStyle = 'rgba(100,181,246,0.08)';
        c.beginPath(); c.roundRect(px + pw / 2 + 10, ry, pw / 2 - 20, 80, 8); c.fill();
        c.fillStyle = '#90CAF9'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('YOUR REQUEST', px + pw * 0.75, ry + 18);
        c.fillStyle = '#CFD8DC'; c.font = '11px "Segoe UI", sans-serif';
        c.fillText('Select what you want', px + pw * 0.75, ry + 40);

        // Propose button
        const stY = ry + 100, stW = 160, stH = 36, stX = px + pw / 2 - stW / 2;
        const stGr = c.createLinearGradient(stX, stY, stX + stW, stY);
        stGr.addColorStop(0, '#FF9800'); stGr.addColorStop(1, '#F57C00');
        c.beginPath(); c.roundRect(stX, stY, stW, stH, 8); c.fillStyle = stGr; c.fill();
        c.strokeStyle = '#FFB74D'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(stX, stY, stW, stH, 8); c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('\uD83D\uDCE6 Propose Trade', stX + stW / 2, stY + stH / 2);
        g.btns.push({ rect: { x: stX, y: stY, w: stW, h: stH }, fn: () => {
            if (g.online) { g.online.requestTrade('target', { troops: 5 }, { coins: 100 }); g.sfx.buy(); }
        }});

        // Incoming
        ry = stY + 50;
        c.textAlign = 'left'; c.fillStyle = '#FFB74D'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('INCOMING TRADES:', px + 20, ry); ry += 20;
        c.fillStyle = 'rgba(255,255,255,0.2)'; c.font = '11px "Segoe UI", sans-serif';
        c.fillText('No pending trade requests', px + 20, ry);
    }

    // ── ONLINE: SPY PANEL ───────────────────────────────────
    _drawSpyPanel(c, g, W, H, tv) {
        const px = W * 0.05, py = H * 0.18, pw = W * 0.9, ph = H * 0.72;
        c.fillStyle = 'rgba(13,27,42,0.92)';
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.fill();
        c.strokeStyle = 'rgba(229,57,53,0.4)'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#EF5350'; c.font = 'bold 18px Georgia, serif';
        c.fillText('\uD83D\uDD75\uFE0F SPY NETWORK', px + pw / 2, py + 25);
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText('Send spies to gather intel (70% success rate)', px + pw / 2, py + 48);

        let sy = py + 80;
        c.fillStyle = 'rgba(229,57,53,0.08)';
        c.beginPath(); c.roundRect(px + 10, sy, pw - 20, 55, 8); c.fill();
        c.fillStyle = '#EF9A9A'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('SPIES SENT: ' + (g._spyCount || 0), px + pw / 2, sy + 18);
        c.fillStyle = '#CFD8DC'; c.font = '11px "Segoe UI", sans-serif';
        c.fillText('Success: ~' + Math.floor((g._spyCount || 0) * 0.7) + '  |  Failed: ~' + Math.ceil((g._spyCount || 0) * 0.3), px + pw / 2, sy + 38);

        sy += 70;
        c.textAlign = 'left'; c.fillStyle = '#EF5350'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('SEND A SPY:', px + 20, sy); sy += 25;

        const enemies = [];
        for (const tid in g.ts) {
            const t = g.ts[tid];
            if (t.owner && t.owner !== g.player) {
                enemies.push({ tid: parseInt(tid), owner: t.owner, troops: t.troops, name: T(tid)?.name || '?' });
            }
        }
        for (const e of enemies.slice(0, 6)) {
            c.fillStyle = 'rgba(229,57,53,0.06)';
            c.beginPath(); c.roundRect(px + 15, sy - 10, pw - 30, 30, 6); c.fill();
            const eName = g.empires[e.owner]?.name || 'Enemy';
            const eColor = g.empires[e.owner]?.color || '#888888';
            c.fillStyle = eColor; c.beginPath(); c.arc(px + 28, sy + 4, 5, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#CFD8DC'; c.font = '11px "Segoe UI", sans-serif'; c.textAlign = 'left';
            c.fillText(e.name + ' (' + eName + ') ~' + e.troops + ' troops', px + 40, sy + 5);
            const spW = 45, spH = 22, spX = px + pw - 70;
            c.fillStyle = 'rgba(229,57,53,0.2)';
            c.beginPath(); c.roundRect(spX, sy - 6, spW, spH, 4); c.fill();
            c.strokeStyle = '#EF5350'; c.lineWidth = 1;
            c.beginPath(); c.roundRect(spX, sy - 6, spW, spH, 4); c.stroke();
            c.fillStyle = '#EF5350'; c.font = 'bold 10px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText('Spy', spX + spW / 2, sy + 4);
            g.btns.push({ rect: { x: spX, y: sy - 6, w: spW, h: spH }, fn: () => {
                if (g.online) { g.online.sendSpy(e.owner, e.tid); g._spyCount = (g._spyCount || 0) + 1; g._log('Spy sent to ' + e.name + '!'); g.sfx.click(); }
            }});
            sy += 35;
        }
        if (enemies.length === 0) {
            c.fillStyle = 'rgba(255,255,255,0.2)'; c.font = '12px "Segoe UI", sans-serif';
            c.fillText('No enemy territories to spy on', px + 20, sy);
        }
    }

    // ── ONLINE: DIPLOMACY PANEL ─────────────────────────────
    _drawDiplomacyPanel(c, g, W, H, tv) {
        const px = W * 0.05, py = H * 0.18, pw = W * 0.9, ph = H * 0.72;
        c.fillStyle = 'rgba(13,27,42,0.92)';
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.fill();
        c.strokeStyle = 'rgba(206,147,216,0.4)'; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.stroke();

        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#CE93D8'; c.font = 'bold 18px Georgia, serif';
        c.fillText('\uD83C\uDFAF DIPLOMACY', px + pw / 2, py + 25);
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.font = '12px "Segoe UI", sans-serif';
        c.fillText('Negotiate peace, war, ultimatums, or non-aggression pacts', px + pw / 2, py + 48);

        const actions = [
            { id: 'peace', icon: '\u2696', label: 'Peace Treaty', desc: 'End hostilities', color: '#66BB6A' },
            { id: 'war', icon: '\uD83D\uDCA5', label: 'Declare War', desc: 'Officially declare war', color: '#EF5350' },
            { id: 'ultimatum', icon: '\u26A0', label: 'Ultimatum', desc: 'Surrender or face consequences', color: '#FF9800' },
            { id: 'pact', icon: '\uD83D\uDCDD', label: 'Non-Aggression', desc: 'Agree not to attack', color: '#42A5F5' },
        ];

        let dy = py + 75;
        for (const action of actions) {
            c.fillStyle = 'rgba(255,255,255,0.03)';
            c.beginPath(); c.roundRect(px + 15, dy, pw - 30, 45, 8); c.fill();
            c.font = '20px serif'; c.textAlign = 'left';
            c.fillText(action.icon, px + 25, dy + 20);
            c.fillStyle = action.color; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(action.label, px + 55, dy + 16);
            c.fillStyle = 'rgba(255,255,255,0.4)'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(action.desc, px + 55, dy + 33);
            const aW = 60, aH = 24, aX = px + pw - 85;
            c.fillStyle = action.color + '33';
            c.beginPath(); c.roundRect(aX, dy + 10, aW, aH, 4); c.fill();
            c.strokeStyle = action.color; c.lineWidth = 1;
            c.beginPath(); c.roundRect(aX, dy + 10, aW, aH, 4); c.stroke();
            c.fillStyle = action.color; c.font = 'bold 10px "Segoe UI", sans-serif'; c.textAlign = 'center';
            c.fillText('Send', aX + aW / 2, dy + 22);
            g.btns.push({ rect: { x: aX, y: dy + 10, w: aW, h: aH }, fn: () => {
                if (g.online) { g.online.sendDiplomacy('target', action.id, action.label); g._log('Diplomatic ' + action.label + ' sent!'); g.sfx.click(); }
            }});
            dy += 52;
        }

        // Active treaties
        dy += 10;
        c.textAlign = 'left'; c.fillStyle = '#CE93D8'; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('ACTIVE TREATIES:', px + 20, dy); dy += 20;
        c.fillStyle = 'rgba(255,255,255,0.2)'; c.font = '11px "Segoe UI", sans-serif';
        c.fillText('No active treaties', px + 20, dy);
    }

    // MANAGE sub-view: troop management and territory details
    _drawManageView(c, g, W, H, tv) {
        const tid = tv.tid, t = T(tid), s = g.ts[tid];
        const emp = g.empires[g.player];
        const panelW = 380, panelH = 540;
        const px = (W - panelW) / 2, py = 100;

        // Panel
        c.fillStyle = 'rgba(10,5,0,0.8)';
        this._rr(c, px, py, panelW, panelH, 14); c.fill();
        c.strokeStyle = 'rgba(255,215,0,0.5)'; c.lineWidth = 2;
        this._rr(c, px, py, panelW, panelH, 14); c.stroke();

        // Title
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = '#ffd700'; c.font = 'bold 20px Georgia, serif';
        c.fillText('\u2699\uFE0F Manage Territory', px + panelW / 2, py + 12);

        // Territory stats card
        const cardY = py + 45;
        this._rr(c, px + 15, cardY, panelW - 30, 80, 10);
        c.fillStyle = 'rgba(30,25,20,0.6)'; c.fill();

        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillStyle = '#ffd700'; c.font = 'bold 16px Georgia, serif';
        c.fillText(t.name, px + 25, cardY + 10);

        // Stat bars
        const barX = px + 25, barW = panelW - 60, barH = 14;
        // Troops bar
        c.fillStyle = '#a09080'; c.font = '11px "Segoe UI", sans-serif';
        c.fillText(`Troops: ${s.troops}`, barX, cardY + 35);
        const troopsW = Math.min((s.troops / 30) * barW, barW);
        this._rr(c, barX + 70, cardY + 36, barW - 70, barH, 3);
        c.fillStyle = 'rgba(60,60,60,0.5)'; c.fill();
        this._rr(c, barX + 70, cardY + 36, troopsW, barH, 3);
        c.fillStyle = 'rgba(231,76,60,0.7)'; c.fill();

        // Fort bar
        c.fillStyle = '#a09080'; c.fillText(`Fort: ${s.fort}`, barX, cardY + 56);
        const fortW = Math.min((s.fort / 20) * barW, barW);
        this._rr(c, barX + 70, cardY + 57, barW - 70, barH, 3);
        c.fillStyle = 'rgba(60,60,60,0.5)'; c.fill();
        this._rr(c, barX + 70, cardY + 57, fortW, barH, 3);
        c.fillStyle = 'rgba(52,152,219,0.7)'; c.fill();

        // Action buttons
        const actions = [
            { label: '\uD83D\uDCAA Train Troops', desc: '+1 troop (10c)', cost: 10, fn: () => {
                g.sel = tid; g._buySoldier();
            }},
            { label: '\uD83D\uDEE1\uFE0F Repair Fort', desc: '+2 fortification (15c)', cost: 15, fn: () => {
                g.sel = tid; g._buyFortify();
            }},
            { label: '\uD83D\uDCBB Upgrade Weapon', desc: 'Open weapons panel', cost: 0, fn: () => {
                tv.sub = 'weapons'; g.sfx.click();
            }},
            { label: '\uD83D\uDCA0 Demolish Building', desc: 'Remove last building', cost: 0, fn: () => {
                if (s.owner !== g.player) { g.sfx.error(); g._log('Not your territory!'); return; }
                const bld = s.buildings || {};
                const types = ['radar', 'bunker', 'armory', 'watchtower', 'supply_depot', 'command_center'];
                for (const bt of types) {
                    if (bld[bt] > 0) { bld[bt]--; g._log(`Demolished ${bt} at ${t.name}`); g.sfx.click(); return; }
                }
                g.sfx.error(); g._log('No buildings to demolish!');
            }},
        ];

        // ── Global game actions ──
        const globalActions = [
            { label: '\uD83D\uDCCC Move Troops', desc: 'Send troops to adjacent territory', fn: () => {
                const hasAdjAlly = t.adj.some(a => g.ts[a].owner === g.player && a !== tid);
                if (!hasAdjAlly || s.troops <= 1) { g.sfx.error(); g._log('No adjacent allies or need more troops!'); return; }
                g._exitTerritoryView(); g.phase = 'move'; g.sel = tid; g.sfx.click();
            }},
            { label: '\uD83D\uDCBE Save Game', desc: 'Save progress to browser', fn: () => { g.saveGame(); }},
            { label: '\u21A9\uFE0F Undo Last Action', desc: `${g.undoStack.length} actions available`, fn: () => { g._undo(); }},
            { label: '\uD83C\uDFE0 Main Menu', desc: 'Return to main menu', fn: () => { g.state = 'menu'; g.sfx.click(); }},
        ];

        const btnH = 40, startY = py + 140;
        for (let i = 0; i < actions.length; i++) {
            const act = actions[i];
            const ay = startY + i * btnH;
            const canAfford = !act.cost || emp.coins >= act.cost;

            this._rr(c, px + 15, ay, panelW - 30, btnH - 4, 8);
            c.fillStyle = canAfford ? 'rgba(40,35,25,0.6)' : 'rgba(40,20,20,0.5)';
            c.fill();

            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillStyle = canAfford ? '#e0d0b0' : '#666'; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(act.label, px + 25, ay + 13);
            c.fillStyle = canAfford ? '#a09080' : '#555'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(act.desc, px + 25, ay + 28);

            if (canAfford) {
                g.btns.push({ rect: { x: px + 15, y: ay, w: panelW - 30, h: btnH - 4 }, fn: act.fn });
            }
        }

        // Divider
        const divY = startY + actions.length * btnH + 4;
        c.strokeStyle = 'rgba(255,215,0,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 15, divY); c.lineTo(px + panelW - 15, divY); c.stroke();
        c.fillStyle = '#a09080'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.fillText('GAME ACTIONS', px + panelW / 2, divY + 14);

        // Global action buttons
        const gStartY = divY + 24;
        const gBtnH = 36;
        for (let i = 0; i < globalActions.length; i++) {
            const act = globalActions[i];
            const ay = gStartY + i * gBtnH;

            this._rr(c, px + 15, ay, panelW - 30, gBtnH - 3, 6);
            c.fillStyle = 'rgba(30,50,30,0.5)'; c.fill();

            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillStyle = '#c0e0c0'; c.font = 'bold 12px "Segoe UI", sans-serif';
            c.fillText(act.label, px + 25, ay + gBtnH / 2 - 5);
            c.fillStyle = '#80a080'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(act.desc, px + 25, ay + gBtnH / 2 + 8);

            g.btns.push({ rect: { x: px + 15, y: ay, w: panelW - 30, h: gBtnH - 3 }, fn: act.fn });
        }

        // Resize panel to fit
        const totalH = gStartY + globalActions.length * gBtnH + 10;
        // (panel already drawn, just ensure it's tall enough visually)
    }

    // EXPLORE sub-view: territory overview panel
    _drawExploreView(c, g, W, H, tv) {
        const tid = tv.tid, t = T(tid), s = g.ts[tid];
        const emp = g.empires[s.owner];
        const myEmp = g.empires[g.player];

        // ── Historical map style overlay ──
        // Parchment background
        const parchGr = c.createLinearGradient(0, 60, 0, H - 64);
        parchGr.addColorStop(0, '#F5ECD7');
        parchGr.addColorStop(0.5, '#EDE0C8');
        parchGr.addColorStop(1, '#E5D8BE');
        c.fillStyle = parchGr;
        c.fillRect(0, 60, W, H - 124);

        // Parchment texture (subtle noise)
        c.fillStyle = 'rgba(160,140,100,0.03)';
        for (let i = 0; i < 60; i++) {
            const nx = (Math.sin(i * 127.1) * 0.5 + 0.5) * W;
            const ny = (Math.cos(i * 311.7) * 0.5 + 0.5) * (H - 124) + 60;
            c.fillRect(nx, ny, 40 + i % 30, 2 + i % 3);
        }

        // ── Draw mini-map of empire territories ──
        const mapPad = 20;
        const mapX = mapPad, mapY = 75;
        const mapW = W * 0.6, mapH = H - 160;

        // Sea area
        c.fillStyle = '#C9DFF0';
        this._rr(c, mapX, mapY, mapW, mapH, 6); c.fill();
        c.strokeStyle = '#8B7355'; c.lineWidth = 2;
        this._rr(c, mapX, mapY, mapW, mapH, 6); c.stroke();

        // Scale territories to fit mini-map
        const allTerrs = Object.values(g.ts);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const tt of allTerrs) {
            const td = T(allTerrs.indexOf(tt));
            minX = Math.min(minX, td.cx); maxX = Math.max(maxX, td.cx);
            minY = Math.min(minY, td.cy); maxY = Math.max(maxY, td.cy);
        }
        const scaleX = (mapW - 20) / (maxX - minX || 1);
        const scaleY = (mapH - 20) / (maxY - minY || 1);
        const sc = Math.min(scaleX, scaleY);
        const offX = mapX + (mapW - (maxX - minX) * sc) / 2 - minX * sc;
        const offY = mapY + (mapH - (maxY - minY) * sc) / 2 - minY * sc;

        // Draw all territories as colored regions
        for (let i = 0; i < 30; i++) {
            const td = T(i);
            const ts = g.ts[i];
            const ownerEmp = ts.owner !== undefined ? g.empires[ts.owner] : null;
            // Muted historical colors for each empire
            const HIST_COLORS = {
                maurya: '#E6C4A7', roman: '#D8A7B1', mongol: '#C8A2D6',
                ottoman: '#A8C4A8', british: '#B8C8D8', napoleon: '#A8BFA8',
                japan: '#D8BFA7', germany: '#C8B2D6', russia: '#A8B8C8',
                egypt: '#E6D6A8'
            };
            const col = ownerEmp ? (HIST_COLORS[ownerEmp.id] || '#D0C8B8') : '#E0D8C8';

            // Draw territory polygons scaled to mini-map
            const mmPolys = td.polys || (td.poly ? [td.poly] : []);
            for (const mp of mmPolys) {
                if (mp && mp.length > 2) {
                    c.beginPath();
                    c.moveTo(mp[0][0] * sc + offX, mp[0][1] * sc + offY);
                    for (let j = 1; j < mp.length; j++) {
                        c.lineTo(mp[j][0] * sc + offX, mp[j][1] * sc + offY);
                    }
                    c.closePath();
                    c.fillStyle = col; c.fill();
                    c.strokeStyle = '#5C4A32'; c.lineWidth = 1.2; c.stroke();
                }
            }

            // Highlight current territory
            if (i === tid) {
                c.strokeStyle = '#8B0000'; c.lineWidth = 3;
                for (const mp of mmPolys) {
                    if (mp && mp.length > 2) {
                        c.beginPath();
                        c.moveTo(mp[0][0] * sc + offX, mp[0][1] * sc + offY);
                        for (let j = 1; j < mp.length; j++) {
                            c.lineTo(mp[j][0] * sc + offX, mp[j][1] * sc + offY);
                        }
                        c.closePath(); c.stroke();
                    }
                }
            }

            // Territory name labels
            if (td.polys || td.poly) {
                const lx = td.cx * sc + offX;
                const ly = td.cy * sc + offY;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillStyle = '#3C2F1E';
                c.font = `${i === tid ? 'bold ' : ''}${Math.max(8, Math.min(11, sc * 0.7))}px Georgia, serif`;
                // Shorten long names
                const shortName = td.name.length > 10 ? td.name.substring(0, 9) + '.' : td.name;
                c.fillText(shortName, lx, ly);
            }
        }

        // Compass rose (top-right of map)
        const compX = mapX + mapW - 35, compY = mapY + 30;
        c.fillStyle = '#3C2F1E'; c.font = 'bold 14px Georgia, serif';
        c.textAlign = 'center';
        c.fillText('N', compX, compY - 18);
        c.fillText('S', compX, compY + 22);
        c.fillText('E', compX + 18, compY + 2);
        c.fillText('W', compX - 18, compY + 2);
        c.strokeStyle = '#3C2F1E'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(compX, compY - 12); c.lineTo(compX, compY + 16); c.stroke();
        c.beginPath(); c.moveTo(compX - 14, compY + 2); c.lineTo(compX + 14, compY + 2); c.stroke();

        // ── Legend panel (right side) ──
        const legX = W * 0.62 + 10, legY = mapY, legW = W * 0.36 - 20, legH = mapH;

        // Legend background
        c.fillStyle = '#FAF5E8';
        c.strokeStyle = '#8B7355'; c.lineWidth = 2;
        this._rr(c, legX, legY, legW, legH, 8); c.fill();
        this._rr(c, legX, legY, legW, legH, 8); c.stroke();

        // Legend title
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = '#3C2F1E'; c.font = 'bold 16px Georgia, serif';
        c.fillText('Empire Territories', legX + legW / 2, legY + 10);

        // Divider
        c.strokeStyle = '#8B7355'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(legX + 10, legY + 32); c.lineTo(legX + legW - 10, legY + 32); c.stroke();

        // Territory info
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillStyle = '#3C2F1E'; c.font = 'bold 14px Georgia, serif';
        c.fillText(t.name, legX + 12, legY + 40);

        c.fillStyle = emp ? emp.color : '#888'; c.font = '13px Georgia, serif';
        c.fillText(`Ruled by: ${emp ? E(s.owner).name : 'Neutral'}`, legX + 12, legY + 60);

        // Terrain
        const terrainIcons = {
            desert: 'Desert', mountains: 'Mountains', forest: 'Forest',
            island: 'Island', plains: 'Plains'
        };
        c.fillStyle = '#5C4A32'; c.font = '12px Georgia, serif';
        c.fillText(`Terrain: ${terrainIcons[t.terrain] || t.terrain}`, legX + 12, legY + 82);

        // Divider
        c.beginPath(); c.moveTo(legX + 10, legY + 100); c.lineTo(legX + legW - 10, legY + 100); c.stroke();

        // Stats
        c.font = '12px Georgia, serif';
        const statsData = [
            { label: 'Troops:', value: String(s.troops), color: '#8B0000' },
            { label: 'Fortification:', value: String(s.fort), color: '#2F4F4F' },
            { label: 'Weapon:', value: s.weapon ? s.weapon.name : 'Sword', color: '#8B6914' },
            { label: 'Buildings:', value: String(s.buildings ? Object.values(s.buildings).reduce((a, b) => a + b, 0) : 0), color: '#2E8B57' },
        ];
        for (let i = 0; i < statsData.length; i++) {
            const st = statsData[i];
            c.fillStyle = '#5C4A32';
            c.fillText(st.label, legX + 12, legY + 110 + i * 22);
            c.fillStyle = st.color; c.font = 'bold 13px Georgia, serif';
            c.fillText(st.value, legX + 110, legY + 110 + i * 22);
            c.font = '12px Georgia, serif';
        }

        // Divider
        c.fillStyle = '#5C4A32';
        c.beginPath(); c.moveTo(legX + 10, legY + 200); c.lineTo(legX + legW - 10, legY + 200); c.stroke();

        // Neighbors
        c.fillStyle = '#3C2F1E'; c.font = 'bold 12px Georgia, serif';
        c.fillText('Neighboring Territories:', legX + 12, legY + 208);
        c.fillStyle = '#5C4A32'; c.font = '11px Georgia, serif';
        let ny = legY + 226;
        for (const a of t.adj) {
            const at = T(a), as = g.ts[a];
            const ownerName = (as.owner !== undefined && E(as.owner)) ? E(as.owner).name : 'Neutral';
            c.fillText(`${at.name} (${ownerName})`, legX + 15, ny);
            ny += 16;
        }

        // Empire color legend at bottom
        const legendY = legY + legH - 130;
        c.beginPath(); c.moveTo(legX + 10, legendY); c.lineTo(legX + legW - 10, legendY); c.stroke();
        c.fillStyle = '#3C2F1E'; c.font = 'bold 12px Georgia, serif';
        c.fillText('Empires:', legX + 12, legendY + 8);

        const HIST = {
            maurya: '#E6C4A7', roman: '#D8A7B1', mongol: '#C8A2D6',
            ottoman: '#A8C4A8', british: '#B8C8D8', napoleon: '#A8BFA8',
            japan: '#D8BFA7', germany: '#C8B2D6', russia: '#A8B8C8',
            egypt: '#E6D6A8'
        };
        let ly = legendY + 26;
        for (const [eid, ecol] of Object.entries(HIST)) {
            c.fillStyle = ecol;
            c.fillRect(legX + 15, ly, 12, 10);
            c.strokeStyle = '#5C4A32'; c.lineWidth = 0.5;
            c.strokeRect(legX + 15, ly, 12, 10);
            c.fillStyle = '#3C2F1E'; c.font = '10px Georgia, serif';
            c.fillText(E(eid).name, legX + 32, ly + 1);
            ly += 14;
        }
    }

    // Draw soldiers in the interior view (modern military)
    _drawTerritorySoldiers(c, W, H, tv) {
        const soldiers = tv.soldiers || [];
        const emp = this.g.empires[this.g.ts[tv.tid]?.owner];
        const eid = emp ? emp.id : '';
        const armorColor = emp ? emp.color : '#666';
        for (const s of soldiers) {
            const sx = s.x * W, sy = s.y * H;
            const sz = (s.size || 1) * 6;
            const flip = s.dir || 1;
            c.save();
            c.translate(sx, sy);
            c.scale(flip, 1);
            // Legs (tactical pants)
            const legPhase = Math.sin(s.frame * 0.1) * 2;
            c.strokeStyle = 'rgba(40,40,35,0.7)'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(-1, sz * 0.3); c.lineTo(-1 + legPhase, sz * 0.7); c.stroke();
            c.beginPath(); c.moveTo(1, sz * 0.3); c.lineTo(1 - legPhase, sz * 0.7); c.stroke();
            // Combat boots
            c.fillStyle = 'rgba(20,20,20,0.7)';
            c.fillRect(-2 + legPhase, sz * 0.6, 2.5, 1.5);
            c.fillRect(0.5 - legPhase, sz * 0.6, 2.5, 1.5);
            // Body (tactical vest)
            c.fillStyle = armorColor; c.globalAlpha = 0.75;
            c.fillRect(-2.5, -sz * 0.35, 5, sz * 0.7);
            // Plate carrier
            c.fillStyle = 'rgba(30,30,30,0.4)';
            c.fillRect(-1.5, -sz * 0.25, 3, sz * 0.5);
            c.globalAlpha = 1;
            // Rifle
            c.fillStyle = 'rgba(30,30,30,0.7)';
            c.fillRect(2, -sz * 0.5, 5, 1.2);
            c.fillStyle = 'rgba(20,20,20,0.6)';
            c.fillRect(6, -sz * 0.55, 2, 0.6);
            // Head
            c.fillStyle = 'rgba(200,170,130,0.7)';
            c.beginPath(); c.arc(0, -sz * 0.55, 2.5, 0, Math.PI * 2); c.fill();
            // Modern combat helmet
            c.fillStyle = 'rgba(60,65,55,0.7)';
            c.beginPath();
            c.arc(0, -sz * 0.6, 3, Math.PI, 0);
            c.lineTo(3, -sz * 0.45);
            c.lineTo(-3, -sz * 0.45);
            c.closePath(); c.fill();
            // Goggles
            c.fillStyle = 'rgba(30,40,50,0.5)';
            c.fillRect(-1.5, -sz * 0.58, 3, 0.6);
            c.restore();
        }
    }

    // ── PROCEDURAL WEAPON ART — draw beautiful weapon shapes on canvas ──
    _drawWeaponArt(c, x, y, size, weaponName, color) {
        c.save();
        const s = size;
        const glow = c.createRadialGradient(x, y, 0, x, y, s);
        glow.addColorStop(0, color || 'rgba(255,215,0,0.3)');
        glow.addColorStop(1, 'transparent');
        c.fillStyle = glow;
        c.fillRect(x - s, y - s, s * 2, s * 2);

        const nm = weaponName.toLowerCase();
        c.lineWidth = 2;
        c.lineCap = 'round';
        c.lineJoin = 'round';

        if (nm.includes('assault') || nm.includes('smg') || nm.includes('rifle') || nm.includes('minigun') || nm.includes('lmg') || nm.includes('marksman')) {
            // Modern firearm — rifle shape
            const isAuto = nm.includes('minigun') || nm.includes('lmg');
            const isSniper = nm.includes('sniper') || nm.includes('marksman');
            // Barrel
            c.strokeStyle = '#3a3a3a'; c.lineWidth = isAuto ? 5 : 3;
            const barrelLen = isSniper ? s*0.9 : s*0.7;
            c.beginPath(); c.moveTo(x - s*0.5, y + 2); c.lineTo(x + barrelLen, y); c.stroke();
            // Scope (sniper/marksman)
            if (isSniper) {
                c.strokeStyle = '#555'; c.lineWidth = 2;
                c.beginPath(); c.moveTo(x - s*0.1, y - 3); c.lineTo(x + s*0.35, y - 8); c.stroke();
                c.fillStyle = '#44aaff';
                c.beginPath(); c.arc(x + s*0.35, y - 9, 3, 0, Math.PI * 2); c.fill();
            }
            // Stock
            c.strokeStyle = '#5a3a1a'; c.lineWidth = 4;
            c.beginPath(); c.moveTo(x - s*0.5, y + 2); c.lineTo(x - s*0.75, y + 6); c.stroke();
            // Magazine
            c.fillStyle = '#333';
            const magH = isAuto ? 14 : 10;
            c.fillRect(x - s*0.15, y + 3, 6, magH);
            // Muzzle
            c.strokeStyle = '#2a2a2a'; c.lineWidth = isAuto ? 5 : 4;
            c.beginPath(); c.moveTo(x + barrelLen, y); c.lineTo(x + barrelLen + s*0.1, y); c.stroke();
            // Minigun barrels
            if (nm.includes('minigun')) {
                c.strokeStyle = '#444'; c.lineWidth = 2;
                for (let i = 0; i < 4; i++) {
                    const ang = (Math.PI / 6) * (i - 1.5);
                    c.beginPath(); c.moveTo(x + barrelLen, y);
                    c.lineTo(x + barrelLen + 12*Math.cos(ang), y + 12*Math.sin(ang)); c.stroke();
                }
            }
            // Muzzle flash glow
            if (isAuto) {
                c.fillStyle = 'rgba(255,200,50,0.3)';
                c.beginPath(); c.arc(x + barrelLen + s*0.12, y, 8, 0, Math.PI * 2); c.fill();
            }
        } else if (nm.includes('shield') || nm.includes('riot')) {
            // Riot shield
            c.fillStyle = 'rgba(80,100,180,0.6)';
            c.beginPath();
            c.moveTo(x, y - s*0.7);
            c.quadraticCurveTo(x + s*0.5, y - s*0.5, x + s*0.5, y);
            c.quadraticCurveTo(x + s*0.5, y + s*0.5, x, y + s*0.8);
            c.quadraticCurveTo(x - s*0.5, y + s*0.5, x - s*0.5, y);
            c.quadraticCurveTo(x - s*0.5, y - s*0.5, x, y - s*0.7);
            c.fill();
            c.strokeStyle = '#b0b0c0'; c.lineWidth = 2; c.stroke();
            // Viewport
            c.fillStyle = 'rgba(100,180,255,0.3)';
            c.beginPath(); c.ellipse(x, y - s*0.1, s*0.2, s*0.15, 0, 0, Math.PI * 2); c.fill();
            // POLICE text
            c.fillStyle = '#fff'; c.font = `bold ${Math.floor(s*0.18)}px sans-serif`;
            c.textAlign = 'center'; c.fillText('POLICE', x, y + s*0.3);
        } else if (nm.includes('grenade') || nm.includes('mortar') || nm.includes('launcher')) {
            // Tube weapon (grenade launcher / mortar)
            const isMortar = nm.includes('mortar');
            c.strokeStyle = '#4a4a4a'; c.lineWidth = isMortar ? 6 : 4;
            if (isMortar) {
                // Mortar tube — angled up
                c.beginPath(); c.moveTo(x - s*0.2, y + s*0.3); c.lineTo(x + s*0.3, y - s*0.6); c.stroke();
                // Base plate
                c.fillStyle = '#555';
                c.fillRect(x - s*0.5, y + s*0.25, s*0.6, 4);
                // Bipod legs
                c.strokeStyle = '#666'; c.lineWidth = 1.5;
                c.beginPath(); c.moveTo(x - s*0.1, y + s*0.1); c.lineTo(x - s*0.4, y + s*0.5); c.stroke();
                c.beginPath(); c.moveTo(x + s*0.05, y + s*0.1); c.lineTo(x + s*0.15, y + s*0.5); c.stroke();
            } else {
                // Grenade launcher — underbarrel style
                c.beginPath(); c.moveTo(x - s*0.4, y + 4); c.lineTo(x + s*0.5, y + 2); c.stroke();
                // Rifle body above
                c.strokeStyle = '#3a3a3a'; c.lineWidth = 3;
                c.beginPath(); c.moveTo(x - s*0.5, y - 2); c.lineTo(x + s*0.6, y - 3); c.stroke();
                // Grenade round
                c.fillStyle = '#556b2f';
                c.beginPath(); c.arc(x + s*0.45, y + 1, 4, 0, Math.PI * 2); c.fill();
            }
        } else if (nm.includes('apc')) {
            // Armored Personnel Carrier
            c.fillStyle = '#5a6a4a';
            c.fillRect(x - s*0.6, y - 6, s*1.2, 16);
            // Top turret
            c.fillStyle = '#4a5a3a';
            c.beginPath(); c.ellipse(x + s*0.1, y - 8, 12, 6, 0, Math.PI, 0); c.fill();
            // Gun barrel
            c.strokeStyle = '#333'; c.lineWidth = 3;
            c.beginPath(); c.moveTo(x + s*0.15, y - 10); c.lineTo(x + s*0.6, y - 14); c.stroke();
            // Tracks
            c.strokeStyle = '#2a2a2a'; c.lineWidth = 4;
            c.beginPath(); c.moveTo(x - s*0.65, y + 10); c.lineTo(x + s*0.65, y + 10); c.stroke();
            // Wheels
            c.fillStyle = '#333';
            for (let i = 0; i < 6; i++) {
                c.beginPath(); c.arc(x - s*0.5 + i * s*0.2, y + 10, 3, 0, Math.PI * 2); c.fill();
            }
            // Slit windows
            c.fillStyle = 'rgba(100,180,255,0.3)';
            c.fillRect(x - s*0.4, y - 2, 8, 4);
            c.fillRect(x + s*0.1, y - 2, 8, 4);
        } else if (nm.includes('tank')) {
            // Main Battle Tank
            c.fillStyle = '#4a5a3a';
            c.fillRect(x - s*0.5, y - 4, s*1.1, 14);
            // Turret
            c.fillStyle = '#3a4a2a';
            c.beginPath(); c.ellipse(x, y - 6, 16, 8, 0, Math.PI, 0); c.fill();
            // Barrel
            c.strokeStyle = '#333'; c.lineWidth = 4;
            c.beginPath(); c.moveTo(x + 5, y - 8); c.lineTo(x + s*0.7, y - 12); c.stroke();
            // Muzzle brake
            c.fillStyle = '#444';
            c.fillRect(x + s*0.65, y - 15, 6, 6);
            // Tracks
            c.strokeStyle = '#2a2a2a'; c.lineWidth = 3;
            c.beginPath(); c.moveTo(x - s*0.55, y + 10); c.lineTo(x + s*0.55, y + 10); c.stroke();
            // Wheels
            c.fillStyle = '#333';
            for (let i = 0; i < 5; i++) {
                c.beginPath(); c.arc(x - s*0.4 + i * 14, y + 10, 4, 0, Math.PI * 2); c.fill();
            }
            // ERA blocks
            c.fillStyle = 'rgba(200,200,100,0.4)';
            c.fillRect(x - s*0.35, y - 10, 5, 5);
            c.fillRect(x - s*0.2, y - 10, 5, 5);
            c.fillRect(x + s*0.05, y - 10, 5, 5);
        } else if (nm.includes('helicopter') || nm.includes('bomber') || nm.includes('plane')) {
            // Attack Helicopter
            c.fillStyle = '#4a5a3a';
            // Body
            c.beginPath(); c.ellipse(x, y, s*0.4, 7, 0, 0, Math.PI * 2); c.fill();
            // Cockpit
            c.fillStyle = 'rgba(100,180,255,0.4)';
            c.beginPath(); c.ellipse(x + s*0.25, y, 8, 5, 0.2, 0, Math.PI * 2); c.fill();
            // Tail boom
            c.fillStyle = '#3a4a2a';
            c.fillRect(x - s*0.7, y - 2, s*0.4, 4);
            // Tail rotor
            c.strokeStyle = '#666'; c.lineWidth = 1.5;
            const trA = this.time * 0.8;
            c.beginPath(); c.moveTo(x - s*0.7, y + 6*Math.cos(trA));
            c.lineTo(x - s*0.7, y - 6*Math.cos(trA)); c.stroke();
            // Main rotor mast
            c.strokeStyle = '#555'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x, y - 12); c.stroke();
            // Main rotor blades (spinning)
            c.strokeStyle = 'rgba(200,200,200,0.6)'; c.lineWidth = 2;
            const rA = this.time * 1.2;
            c.beginPath(); c.moveTo(x + s*0.6*Math.cos(rA), y - 12 + s*0.05*Math.sin(rA));
            c.lineTo(x - s*0.6*Math.cos(rA), y - 12 - s*0.05*Math.sin(rA)); c.stroke();
            // Skids
            c.strokeStyle = '#444'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(x - s*0.25, y + 7); c.lineTo(x + s*0.3, y + 7); c.stroke();
            // Missile pods
            c.fillStyle = '#555';
            c.fillRect(x - s*0.15, y + 2, 12, 3);
            c.fillRect(x + s*0.05, y + 2, 12, 3);
        }
        c.restore();
    }

    // ── WEAPONS sub-view: upgrade weapons with beautiful art ──
    _drawWeaponsView(c, g, W, H, tv) {
        const tid = tv.tid, t = T(tid), s = g.ts[tid];
        const emp = g.empires[g.player];
        const panelW = 480, panelH = 440;
        const px = (W - panelW) / 2, py = 60;

        // Panel with gradient bg
        const bg = c.createLinearGradient(px, py, px, py + panelH);
        bg.addColorStop(0, 'rgba(15,10,5,0.92)');
        bg.addColorStop(1, 'rgba(25,18,8,0.95)');
        c.fillStyle = bg;
        this._rr(c, px, py, panelW, panelH, 16); c.fill();
        // Gold border
        const borderGrad = c.createLinearGradient(px, py, px + panelW, py);
        borderGrad.addColorStop(0, 'rgba(255,215,0,0.3)');
        borderGrad.addColorStop(0.5, 'rgba(255,215,0,0.7)');
        borderGrad.addColorStop(1, 'rgba(255,215,0,0.3)');
        c.strokeStyle = borderGrad; c.lineWidth = 2;
        this._rr(c, px, py, panelW, panelH, 16); c.stroke();

        // Title with glow
        c.save();
        c.shadowColor = '#ffd700'; c.shadowBlur = 15;
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = '#ffd700'; c.font = 'bold 22px Georgia, serif';
        c.fillText('\u2694 Weapons Arsenal \u2694', px + panelW / 2, py + 12);
        c.restore();
        c.fillStyle = '#f1c40f'; c.font = '13px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText(`\uD83E\uDE99 ${emp.coins} Coins  |  ${t.name}`, px + panelW / 2, py + 40);

        // Current weapon display
        const curW = s.weapon || WEAPONS[1][0];
        const curBoxW = panelW - 40, curBoxH = 55;
        const curBoxX = px + 20, curBoxY = py + 60;
        const curBg = c.createLinearGradient(curBoxX, curBoxY, curBoxX + curBoxW, curBoxY);
        curBg.addColorStop(0, 'rgba(40,60,40,0.6)');
        curBg.addColorStop(1, 'rgba(30,50,30,0.4)');
        c.fillStyle = curBg;
        this._rr(c, curBoxX, curBoxY, curBoxW, curBoxH, 10); c.fill();
        c.strokeStyle = 'rgba(46,204,113,0.5)'; c.lineWidth = 1;
        this._rr(c, curBoxX, curBoxY, curBoxW, curBoxH, 10); c.stroke();
        // Current weapon art
        this._drawWeaponArt(c, curBoxX + 35, curBoxY + curBoxH / 2, 22, curW.name, 'rgba(46,204,113,0.3)');
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillStyle = '#2ecc71'; c.font = 'bold 15px Georgia, serif';
        c.fillText(`Equipped: ${curW.name}`, curBoxX + 70, curBoxY + 18);
        // Stat bars
        this._drawStatBar(c, curBoxX + 70, curBoxY + 34, 120, 8, curW.atk, 6, '#e74c3c', 'ATK');
        this._drawStatBar(c, curBoxX + 210, curBoxY + 34, 120, 8, curW.def, 6, '#3498db', 'DEF');

        // All weapon tiers — cards
        const startY = py + 130;
        const cardW = panelW - 40, cardH = 60;
        let cy = startY;
        for (const [tier, weapons] of Object.entries(WEAPONS)) {
            const tierNum = parseInt(tier);
            const tierLabel = ['','\u2694 Ancient','\u{1F5FA} Medieval','\u{1F4A3} Gunpowder','\u26A1 Modern'][tierNum];
            const tierColor = ['','#c0c0c0','#b8860b','#cd853f','#00bfff'][tierNum];
            // Tier header
            c.textAlign = 'left'; c.fillStyle = tierColor; c.font = 'bold 12px "Segoe UI", sans-serif';
            c.fillText(`TIER ${tierNum}: ${tierLabel}`, px + 20, cy);
            cy += 16;
            for (const wp of weapons) {
                const isOwned = curW.name === wp.name;
                const isNext = tierNum === (g._weaponTier(curW) + 1);
                const canBuy = !isOwned && emp.coins >= (wp.cost || 0) && isNext;
                const cardX = px + 20;

                // Card background
                const cardBg = c.createLinearGradient(cardX, cy, cardX + cardW, cy + cardH);
                if (isOwned) {
                    cardBg.addColorStop(0, 'rgba(30,80,30,0.5)');
                    cardBg.addColorStop(1, 'rgba(20,60,20,0.3)');
                } else if (canBuy) {
                    cardBg.addColorStop(0, 'rgba(60,50,20,0.5)');
                    cardBg.addColorStop(1, 'rgba(40,35,15,0.3)');
                } else {
                    cardBg.addColorStop(0, 'rgba(30,25,20,0.4)');
                    cardBg.addColorStop(1, 'rgba(20,18,15,0.3)');
                }
                c.fillStyle = cardBg;
                this._rr(c, cardX, cy, cardW, cardH, 8); c.fill();

                // Card border
                if (isOwned) {
                    c.strokeStyle = 'rgba(46,204,113,0.6)';
                } else if (canBuy) {
                    c.strokeStyle = 'rgba(241,196,15,0.5)';
                } else {
                    c.strokeStyle = 'rgba(100,80,60,0.3)';
                }
                c.lineWidth = 1;
                this._rr(c, cardX, cy, cardW, cardH, 8); c.stroke();

                // Weapon art
                this._drawWeaponArt(c, cardX + 30, cy + cardH / 2, 20, wp.name,
                    isOwned ? 'rgba(46,204,113,0.3)' : canBuy ? 'rgba(241,196,15,0.3)' : 'rgba(100,80,60,0.2)');

                // Weapon name
                c.textAlign = 'left'; c.textBaseline = 'middle';
                c.fillStyle = isOwned ? '#2ecc71' : canBuy ? '#e0d0b0' : '#666';
                c.font = 'bold 13px Georgia, serif';
                c.fillText(wp.name, cardX + 60, cy + 16);

                // Stat bars
                this._drawStatBar(c, cardX + 60, cy + 28, 90, 6, wp.atk, 6, '#e74c3c', 'ATK');
                this._drawStatBar(c, cardX + 165, cy + 28, 90, 6, wp.def, 6, '#3498db', 'DEF');

                // Cost / Status
                c.textAlign = 'right'; c.textBaseline = 'middle';
                if (isOwned) {
                    c.fillStyle = '#2ecc71'; c.font = 'bold 12px "Segoe UI", sans-serif';
                    c.fillText('\u2713 EQUIPPED', cardX + cardW - 15, cy + cardH / 2);
                } else if (canBuy) {
                    const bbW = 65, bbH = 30, bbX = cardX + cardW - 80, bbY = cy + (cardH - bbH) / 2;
                    const btnBg = c.createLinearGradient(bbX, bbY, bbX + bbW, bbY + bbH);
                    btnBg.addColorStop(0, 'rgba(241,196,15,0.8)');
                    btnBg.addColorStop(1, 'rgba(243,156,18,0.8)');
                    c.fillStyle = btnBg;
                    this._rr(c, bbX, bbY, bbW, bbH, 6); c.fill();
                    c.textAlign = 'center'; c.fillStyle = '#1a1a2e'; c.font = 'bold 12px "Segoe UI", sans-serif';
                    c.fillText(`${wp.cost}c \u2192`, bbX + bbW / 2, bbY + bbH / 2);
                    g.btns.push({ rect: { x: bbX, y: bbY, w: bbW, h: bbH }, fn: () => {
                        if (s.owner !== g.player) { g.sfx.error(); return; }
                        emp.coins -= wp.cost;
                        s.weapon = wp;
                        g._log(`Upgraded ${t.name} to ${wp.name}!`);
                        g.sfx.buy();
                        g._gainXP(15);
                    }});
                } else if (!isNext) {
                    c.fillStyle = '#555'; c.font = '11px "Segoe UI", sans-serif';
                    c.fillText('\uD83D\uDD12 Locked', cardX + cardW - 15, cy + cardH / 2);
                } else {
                    c.fillStyle = '#e74c3c'; c.font = '11px "Segoe UI", sans-serif';
                    c.fillText('Need ' + wp.cost + 'c', cardX + cardW - 15, cy + cardH / 2);
                }
                cy += cardH + 5;
            }
        }
    }

    // ── STAT BAR helper — beautiful gradient stat bar ──
    _drawStatBar(c, x, y, w, h, value, maxVal, color, label) {
        const pct = Math.min(value / maxVal, 1);
        // Background
        c.fillStyle = 'rgba(255,255,255,0.1)';
        this._rr(c, x, y, w, h, 3); c.fill();
        // Fill
        if (pct > 0) {
            const grad = c.createLinearGradient(x, y, x + w * pct, y);
            grad.addColorStop(0, color);
            grad.addColorStop(1, color + 'aa');
            c.fillStyle = grad;
            this._rr(c, x, y, w * pct, h, 3); c.fill();
        }
        // Label
        c.fillStyle = '#ccc'; c.font = '9px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(`${label} +${value}`, x + 3, y + h / 2 + 1);
    }

    // ── ATTACK sub-view: attack neighbors from inside territory ──
    _drawAttackFromTerritory(c, g, W, H, tv) {
        const tid = tv.tid, t = T(tid), s = g.ts[tid];
        const panelW = 420, panelH = 500;
        const px = (W - panelW) / 2, py = 100;

        // Panel
        c.fillStyle = 'rgba(30,5,5,0.85)';
        this._rr(c, px, py, panelW, panelH, 14); c.fill();
        c.strokeStyle = 'rgba(231,76,60,0.5)'; c.lineWidth = 2;
        this._rr(c, px, py, panelW, panelH, 14); c.stroke();

        // Title
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = '#e74c3c'; c.font = 'bold 20px Georgia, serif';
        c.fillText('\uD83D\uDCA5 Attack Neighbors', px + panelW / 2, py + 12);

        // Your forces
        c.fillStyle = 'rgba(30,25,20,0.6)';
        this._rr(c, px + 15, py + 40, panelW - 30, 40, 8); c.fill();
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillStyle = '#ffd700'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText(`Your forces at ${t.name}:`, px + 25, py + 52);
        c.fillStyle = '#e74c3c'; c.font = 'bold 18px "Segoe UI", sans-serif';
        c.fillText(`${s.troops} troops`, px + panelW - 80, py + 52);
        c.fillStyle = '#a09080'; c.font = '11px "Segoe UI", sans-serif';
        c.fillText(`Fort: ${s.fort} | Weapon: ${s.weapon ? s.weapon.name : 'Sword'}`, px + 25, py + 70);

        // ── TROOP SELECTOR: Emperor decides how many to send ──
        let selY = py + 88;
        c.fillStyle = 'rgba(30,25,20,0.6)';
        this._rr(c, px + 15, selY, panelW - 30, 38, 8); c.fill();
        c.fillStyle = '#ffd700'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'left';
        c.fillText('Troops to send:', px + 25, selY + 12);

        // Initialize attackAmount if not set or out of range
        const maxSend = s.troops - 1;
        if (g.attackAmount <= 0 || g.attackAmount > maxSend) g.attackAmount = maxSend;

        // Minus button
        const minusX = px + 155, btnSize = 28;
        this._rr(c, minusX, selY + 5, btnSize, btnSize, 5);
        c.fillStyle = 'rgba(231,76,60,0.6)'; c.fill();
        c.strokeStyle = '#e74c3c'; c.lineWidth = 1;
        this._rr(c, minusX, selY + 5, btnSize, btnSize, 5); c.stroke();
        c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = 'bold 16px sans-serif';
        c.fillText('-', minusX + btnSize / 2, selY + 5 + btnSize / 2);
        g.btns.push({ rect: { x: minusX, y: selY + 5, w: btnSize, h: btnSize }, fn: () => {
            g.attackAmount = Math.max(1, g.attackAmount - 1);
            g.sfx.click();
        }});

        // Amount display
        c.fillStyle = '#fff'; c.font = 'bold 16px "Segoe UI", sans-serif';
        c.textAlign = 'center';
        c.fillText(`${g.attackAmount} / ${maxSend}`, px + panelW / 2 + 10, selY + 19);

        // Plus button
        const plusX = px + panelW / 2 + 55;
        this._rr(c, plusX, selY + 5, btnSize, btnSize, 5);
        c.fillStyle = 'rgba(46,204,113,0.6)'; c.fill();
        c.strokeStyle = '#2ecc71'; c.lineWidth = 1;
        this._rr(c, plusX, selY + 5, btnSize, btnSize, 5); c.stroke();
        c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = 'bold 16px sans-serif';
        c.fillText('+', plusX + btnSize / 2, selY + 5 + btnSize / 2);
        g.btns.push({ rect: { x: plusX, y: selY + 5, w: btnSize, h: btnSize }, fn: () => {
            g.attackAmount = Math.min(maxSend, g.attackAmount + 1);
            g.sfx.click();
        }});

        // ── FIRE MODE SELECTOR ──
        selY += 46;
        c.fillStyle = 'rgba(30,25,20,0.6)';
        this._rr(c, px + 15, selY, panelW - 30, 34, 8); c.fill();
        c.fillStyle = '#f39c12'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'left';
        c.fillText('Fire mode:', px + 25, selY + 12);

        const fireModes = [
            { id: 'single', label: 'Single', desc: 'Standard attack' },
            { id: 'burst', label: 'Burst', desc: '-10% atk, -15% def' },
            { id: 'full', label: 'Full Auto', desc: '-20% atk, -30% def' },
        ];
        let fmx = px + 120;
        for (const fm of fireModes) {
            const isActive = g.attackFireMode === fm.id;
            const fmW = 80, fmH = 26;
            this._rr(c, fmx, selY + 4, fmW, fmH, 5);
            c.fillStyle = isActive ? 'rgba(231,76,60,0.7)' : 'rgba(60,50,40,0.5)'; c.fill();
            c.strokeStyle = isActive ? '#e74c3c' : '#555'; c.lineWidth = 1;
            this._rr(c, fmx, selY + 4, fmW, fmH, 5); c.stroke();
            c.textAlign = 'center'; c.fillStyle = isActive ? '#fff' : '#aaa'; c.font = 'bold 11px "Segoe UI", sans-serif';
            c.fillText(fm.label, fmx + fmW / 2, selY + 17);
            g.btns.push({ rect: { x: fmx, y: selY + 4, w: fmW, h: fmH }, fn: () => {
                g.attackFireMode = fm.id;
                g.sfx.click();
            }});
            fmx += fmW + 6;
        }

        // ── WEAPON SWITCH ──
        selY += 42;
        c.fillStyle = 'rgba(30,25,20,0.6)';
        this._rr(c, px + 15, selY, panelW - 30, 34, 8); c.fill();
        c.fillStyle = '#f39c12'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'left';
        c.fillText('Equip:', px + 25, selY + 12);

        const emp = g.empires[g.player];
        const availableWeapons = [];
        // Always have tier 1 weapons
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

        let wx = px + 80;
        for (const aw of availableWeapons) {
            const lbl = aw.w.name.substring(0, 7);
            c.font = '10px "Segoe UI", sans-serif';
            const tw = c.measureText(lbl).width + 14;
            const equipped = g.sel != null && g.ts[g.sel].weapon === aw.w;
            this._rr(c, wx, selY + 4, tw, 26, 4);
            c.fillStyle = equipped ? 'rgba(244,164,96,0.7)' : 'rgba(60,50,40,0.5)'; c.fill();
            c.strokeStyle = equipped ? '#E65100' : '#555'; c.lineWidth = 1;
            this._rr(c, wx, selY + 4, tw, 26, 4); c.stroke();
            c.textAlign = 'center'; c.fillStyle = equipped ? '#fff' : '#aaa'; c.font = '10px "Segoe UI", sans-serif';
            c.fillText(lbl, wx + tw / 2, selY + 17);
            g.btns.push({ rect: { x: wx, y: selY + 4, w: tw, h: 26 }, fn: () => g._equipWeapon(aw.tier, aw.wi) });
            wx += tw + 4;
            if (wx > px + panelW - 20) break;
        }

        // Adjacent territories list
        c.fillStyle = '#a09080'; c.font = 'bold 14px "Segoe UI", sans-serif';
        c.textAlign = 'left';
        c.fillText('Select target:', px + 15, selY + 52);

        const adj = t.adj;
        const itemH = 42, startY = selY + 70;
        for (let i = 0; i < adj.length; i++) {
            const aId = adj[i];
            const at = T(aId), as = g.ts[aId];
            const aEmp = g.empires[as.owner];
            const isOwn = as.owner === g.player;
            const canAttack = !isOwn && s.troops > 1;

            const iy = startY + i * itemH;

            this._rr(c, px + 10, iy, panelW - 20, itemH - 4, 8);
            c.fillStyle = canAttack ? 'rgba(50,20,20,0.5)' : 'rgba(30,30,30,0.4)';
            c.fill();

            // Territory name
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillStyle = canAttack ? '#e0d0b0' : '#666'; c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(at.name, px + 20, iy + 14);
            // Owner + troops
            c.fillStyle = canAttack ? '#a09080' : '#555'; c.font = '11px "Segoe UI", sans-serif';
            c.fillText(`${aEmp ? E(as.owner).name : 'Neutral'} | ~${as.troops} troops | Fort: ${as.fort}`, px + 20, iy + 30);

            // Attack button
            if (canAttack) {
                const bbW = 65, bbH = 28, bbX = px + panelW - 80, bbY = iy + 6;
                this._rr(c, bbX, bbY, bbW, bbH, 6);
                c.fillStyle = 'rgba(231,76,60,0.8)'; c.fill();
                c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = 'bold 12px "Segoe UI", sans-serif';
                c.fillText('\u2694 Attack', bbX + bbW / 2, bbY + bbH / 2);
                g.btns.push({ rect: { x: bbX, y: bbY, w: bbW, h: bbH }, fn: () => {
                    g._attackTarget = aId;
                    // Stay in territory view — switch to battle sub-view
                    tv.sub = 'battle';
                    tv._battle = null; // Reset battle state for new target
                    g.sfx.click();
                }});
            } else if (isOwn) {
                c.textAlign = 'center'; c.fillStyle = '#3498db'; c.font = '11px "Segoe UI", sans-serif';
                c.fillText('Yours', px + panelW - 55, iy + itemH / 2 - 2);
            } else {
                c.textAlign = 'center'; c.fillStyle = '#e74c3c'; c.font = '11px "Segoe UI", sans-serif';
                c.fillText('Need troops', px + panelW - 60, iy + itemH / 2 - 2);
            }
        }
    }

    _drawBattleInTerritory(c, g, W, H, tv) {
        const tid = tv.tid, t = T(tid), s = g.ts[tid];
        const myEmp = g.empires[g.player];

        // Find enemy to battle
        const enemyAdj = t.adj.filter(a => g.ts[a].owner !== undefined && g.ts[a].owner !== g.player);
        const enemyTid = (g._attackTarget !== null && enemyAdj.includes(g._attackTarget))
            ? g._attackTarget
            : (enemyAdj.length > 0 ? enemyAdj[0] : null);
        const enemyEmpId = enemyTid !== null ? g.ts[enemyTid].owner : null;
        const enemyEmp = enemyEmpId !== null ? g.empires[enemyEmpId] : null;
        const enemyT = enemyTid !== null ? T(enemyTid) : null;
        const enemyS = enemyTid !== null ? g.ts[enemyTid] : null;

        if (!enemyTid) {
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = '#a09080'; c.font = 'bold 18px Georgia, serif';
            c.fillText('No enemy neighbors to battle!', W / 2, H * 0.40);
            c.font = '14px "Segoe UI", sans-serif';
            c.fillStyle = '#8a7a6a';
            c.fillText('Click a territory next to an enemy empire', W / 2, H * 0.46);
            c.fillText('then open Battle tab', W / 2, H * 0.50);
            // Auto-find a territory with enemies
            const myTids = Object.keys(g.ts).filter(id => g.ts[id].owner === g.player);
            let foundTid = null;
            for (const id of myTids) {
                const t = T(parseInt(id));
                if (t && t.adj) {
                    for (const aId of t.adj) {
                        if (g.ts[aId] && g.ts[aId].owner !== undefined && g.ts[aId].owner !== g.player) {
                            foundTid = parseInt(id);
                            break;
                        }
                    }
                }
                if (foundTid !== null) break;
            }
            if (foundTid !== null) {
                const btnW = 180, btnH = 40, btnX = (W - btnW) / 2, btnY = H * 0.56;
                const bGr = c.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
                bGr.addColorStop(0, '#e67e22'); bGr.addColorStop(1, '#d35400');
                this._rr(c, btnX, btnY, btnW, btnH, 10); c.fillStyle = bGr; c.fill();
                c.strokeStyle = '#ffd700'; c.lineWidth = 2;
                this._rr(c, btnX, btnY, btnW, btnH, 10); c.stroke();
                c.fillStyle = '#ffffff'; c.font = 'bold 14px Georgia, serif';
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText('Go to ' + T(foundTid).name, W / 2, btnY + btnH / 2);
                g.btns.push({ rect: { x: btnX, y: btnY, w: btnW, h: btnH }, fn: () => {
                    g.sel = foundTid;
                    g._enterTerritoryView(foundTid);
                    g._terrView.sub = 'battle';
                    g.sfx.click();
                }});
            }
            return;
        }

        // Enemy banner
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillStyle = enemyEmp ? enemyEmp.color : '#888888';
        c.font = 'bold 14px "Segoe UI", sans-serif';
        c.fillText('Battling: ' + enemyT.name + (enemyEmp ? ' (' + E(enemyEmpId).name + ')' : ' (Neutral)'), W / 2, H * 0.30);

        // Initialize battle state
        if (!tv._battle) {
            const enemyCount = Math.max(2, Math.min(6, enemyS ? enemyS.troops : 2));
            const myCount = Math.max(3, Math.min(8, s.troops || 3));
            tv._battle = {
                phase: 'ready', // ready | manual | fighting | victory | defeat
                timer: 0,
                fightTimer: 0,
                enemies: [],
                mySoldiers: [],
                particles: [],
                bullets: [],         // player bullets
                enemyBullets: [],   // enemy bullets
                grassBlades: [],
                buildings: [],
                weaponTier: s.weapon || 0,
                // Manual control state (Free Fire style)
                mode: 'manual',     // manual | auto
                emperor: {
                    x: W * 0.15,
                    y: H * 0.58,
                    hp: 150,
                    maxHp: 150,
                    speed: 2.5,
                    shootCooldown: 0,
                    facingRight: true,
                    hit: 0,
                    alive: true,
                },
                // Virtual joystick state
                joy: { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0, touchId: null },
                // Fire button state
                fire: { active: false, cooldown: 0 },
                // Kill counter
                kills: 0,
                totalEnemies: Math.max(2, Math.min(6, enemyS ? enemyS.troops : 2)),
            };
            const b = tv._battle;

            // Generate grass blades
            for (let i = 0; i < 80; i++) {
                b.grassBlades.push({
                    x: Math.random() * W,
                    y: H * 0.52 + Math.random() * H * 0.22,
                    h: 8 + Math.random() * 18,
                    w: 1.5 + Math.random() * 2,
                    sway: Math.random() * Math.PI * 2,
                    color: Math.random() > 0.5 ? '#4a7c3f' : (Math.random() > 0.5 ? '#3d6b34' : '#5a8f4a'),
                });
            }

            // Generate background military structures
            const bldgCount = 2 + Math.floor(Math.random() * 3);
            const milTypes = ['bunker', 'command', 'watchtower', 'radar', 'barracks', 'supply'];
            for (let i = 0; i < bldgCount; i++) {
                b.buildings.push({
                    x: W * 0.1 + (i / bldgCount) * W * 0.8 + (Math.random() - 0.5) * 60,
                    w: 30 + Math.random() * 50,
                    h: 40 + Math.random() * 60,
                    damaged: Math.random() > 0.4,
                    type: milTypes[Math.floor(Math.random() * milTypes.length)],
                });
            }

            // Create enemy soldiers
            for (let i = 0; i < enemyCount; i++) {
                b.enemies.push({
                    x: W * 0.68 + Math.random() * W * 0.18,
                    y: H * 0.42 + (i / Math.max(1, enemyCount - 1)) * H * 0.25,
                    baseX: 0, baseY: 0,
                    alive: true,
                    hp: 80,
                    maxHp: 80,
                    hit: 0,
                    attackTimer: 0,
                    state: 'idle', // idle | attacking | dying | dead
                    deathTimer: 0,
                    idx: i,
                });
                b.enemies[i].baseX = b.enemies[i].x;
                b.enemies[i].baseY = b.enemies[i].y;
            }

            // Create my soldiers
            for (let i = 0; i < myCount; i++) {
                b.mySoldiers.push({
                    x: W * 0.12 + Math.random() * W * 0.15,
                    y: H * 0.40 + (i / Math.max(1, myCount - 1)) * H * 0.28,
                    baseX: 0, baseY: 0,
                    alive: true,
                    hp: 80,
                    maxHp: 80,
                    hit: 0,
                    attackTimer: 0,
                    state: 'idle',
                    deathTimer: 0,
                    target: null,
                    idx: i,
                });
                b.mySoldiers[i].baseX = b.mySoldiers[i].x;
                b.mySoldiers[i].baseY = b.mySoldiers[i].y;
            }
        }

        const b = tv._battle;
        b.timer++;
        const BF_TOP = H * 0.33, BF_BOT = H * 0.78;

        // ── SKY (daytime) ──
        const skyGr = c.createLinearGradient(0, BF_TOP, 0, BF_TOP + 40);
        skyGr.addColorStop(0, '#4a90d9');
        skyGr.addColorStop(1, '#87ceeb');
        c.fillStyle = skyGr;
        c.fillRect(0, BF_TOP, W, 40);
        // Sun
        c.fillStyle = '#ffd700';
        c.beginPath(); c.arc(W * 0.82, BF_TOP + 18, 14, 0, Math.PI * 2); c.fill();
        c.save(); c.globalAlpha = 0.3;
        const sunGr = c.createRadialGradient(W * 0.82, BF_TOP + 18, 14, W * 0.82, BF_TOP + 18, 35);
        sunGr.addColorStop(0, '#ffd700'); sunGr.addColorStop(1, 'rgba(255,215,0,0)');
        c.fillStyle = sunGr;
        c.fillRect(W * 0.82 - 35, BF_TOP + 18 - 35, 70, 70);
        c.restore();
        // Clouds
        c.save(); c.globalAlpha = 0.5; c.fillStyle = '#ffffff';
        const cx1 = (b.timer * 0.3) % (W + 100) - 50;
        c.beginPath(); c.arc(cx1, BF_TOP + 12, 12, 0, Math.PI * 2); c.arc(cx1 + 15, BF_TOP + 8, 15, 0, Math.PI * 2); c.arc(cx1 + 30, BF_TOP + 12, 10, 0, Math.PI * 2); c.fill();
        const cx2 = (b.timer * 0.2 + 300) % (W + 100) - 50;
        c.beginPath(); c.arc(cx2, BF_TOP + 22, 10, 0, Math.PI * 2); c.arc(cx2 + 12, BF_TOP + 18, 13, 0, Math.PI * 2); c.arc(cx2 + 24, BF_TOP + 22, 9, 0, Math.PI * 2); c.fill();
        c.restore();

        // ── BATTLEFIELD GROUND (procedural textured) ──
        const groundTex = this._getGroundTexture(Math.round(W), Math.round(BF_BOT - BF_TOP - 30));
        c.drawImage(groundTex, 0, BF_TOP + 30, W, BF_BOT - BF_TOP - 30);
        // Perspective overlay (darker at bottom)
        const perspGr = c.createLinearGradient(0, BF_TOP + 30, 0, BF_BOT);
        perspGr.addColorStop(0, 'rgba(0,0,0,0)');
        perspGr.addColorStop(0.6, 'rgba(0,0,0,0.05)');
        perspGr.addColorStop(1, 'rgba(0,0,0,0.15)');
        c.fillStyle = perspGr;
        c.fillRect(0, BF_TOP + 30, W, BF_BOT - BF_TOP - 30);

        // ── MODERN MILITARY STRUCTURES IN BACKGROUND ──
        for (const bldg of b.buildings) {
            c.save();
            const bx = bldg.x, by = BF_TOP + 30 - bldg.h * 0.3;
            c.globalAlpha = 0.55;
            const bw = bldg.w, bh = bldg.h;

            if (bldg.type === 'bunker') {
                // Concrete bunker — low, thick-walled
                const bGr = c.createLinearGradient(bx - bw * 0.5, by, bx + bw * 0.5, by);
                bGr.addColorStop(0, '#5a5a55');
                bGr.addColorStop(0.5, '#6a6a65');
                bGr.addColorStop(1, '#4a4a45');
                c.fillStyle = bGr;
                c.fillRect(bx - bw * 0.5, by + bh * 0.3, bw, bh * 0.4);
                // Flat reinforced roof
                c.fillStyle = '#505048';
                c.fillRect(bx - bw * 0.55, by + bh * 0.25, bw * 1.1, bh * 0.08);
                // Gun slit
                c.fillStyle = '#1a1a18';
                c.fillRect(bx - bw * 0.35, by + bh * 0.4, bw * 0.7, bh * 0.06);
                // Camo net on top
                c.strokeStyle = '#4a5a3a'; c.lineWidth = 1;
                for (let j = 0; j < 4; j++) {
                    c.beginPath();
                    c.moveTo(bx - bw * 0.5 + j * bw * 0.25, by + bh * 0.2);
                    c.quadraticCurveTo(bx - bw * 0.3 + j * bw * 0.2, by + bh * 0.1, bx - bw * 0.4 + j * bw * 0.3, by);
                    c.stroke();
                }
            } else if (bldg.type === 'command') {
                // Command center — larger building with antennas
                c.fillStyle = '#4a5560';
                c.fillRect(bx - bw * 0.45, by + bh * 0.1, bw * 0.9, bh * 0.6);
                // Flat roof
                c.fillStyle = '#3a4550';
                c.fillRect(bx - bw * 0.5, by + bh * 0.05, bw, bh * 0.08);
                // Windows
                c.fillStyle = '#1a2a3a';
                for (let j = 0; j < 3; j++) {
                    c.fillRect(bx - bw * 0.3 + j * bw * 0.25, by + bh * 0.25, bw * 0.12, bh * 0.1);
                }
                // Antenna
                c.strokeStyle = '#777'; c.lineWidth = 1.5;
                c.beginPath(); c.moveTo(bx, by + bh * 0.05); c.lineTo(bx, by - bh * 0.1); c.stroke();
                // Blinking light
                c.fillStyle = b.timer % 60 < 30 ? '#ff3333' : '#660000';
                c.beginPath(); c.arc(bx, by - bh * 0.1, 2, 0, Math.PI * 2); c.fill();
                // Satellite dish
                c.fillStyle = '#888';
                c.beginPath(); c.ellipse(bx + bw * 0.2, by + bh * 0.05, 5, 3, -0.4, 0, Math.PI * 2); c.fill();
                c.strokeStyle = '#666'; c.lineWidth = 1;
                c.beginPath(); c.moveTo(bx + bw * 0.2, by + bh * 0.05); c.lineTo(bx + bw * 0.2, by - bh * 0.05); c.stroke();
            } else if (bldg.type === 'watchtower') {
                // Metal watchtower — tall, open-frame
                c.strokeStyle = '#5a5a55'; c.lineWidth = 2;
                // Legs
                c.beginPath(); c.moveTo(bx - bw * 0.2, by + bh * 0.7); c.lineTo(bx - bw * 0.15, by - bh * 0.2); c.stroke();
                c.beginPath(); c.moveTo(bx + bw * 0.2, by + bh * 0.7); c.lineTo(bx + bw * 0.15, by - bh * 0.2); c.stroke();
                // Cross braces
                c.lineWidth = 0.8;
                c.beginPath(); c.moveTo(bx - bw * 0.18, by + bh * 0.2); c.lineTo(bx + bw * 0.18, by + bh * 0.5); c.stroke();
                c.beginPath(); c.moveTo(bx + bw * 0.18, by + bh * 0.2); c.lineTo(bx - bw * 0.18, by + bh * 0.5); c.stroke();
                // Platform at top
                c.fillStyle = '#4a4a45';
                c.fillRect(bx - bw * 0.25, by - bh * 0.25, bw * 0.5, bh * 0.08);
                // Railing
                c.strokeStyle = '#5a5a55'; c.lineWidth = 1;
                c.strokeRect(bx - bw * 0.25, by - bh * 0.38, bw * 0.5, bh * 0.14);
                // Spotlight
                c.fillStyle = '#aaa';
                c.fillRect(bx - 3, by - bh * 0.38, 6, 4);
                // Light beam
                c.save();
                c.globalAlpha = 0.06;
                c.fillStyle = '#ffffaa';
                c.beginPath(); c.moveTo(bx, by - bh * 0.38); c.lineTo(bx + 25, by + bh * 0.5); c.lineTo(bx - 25, by + bh * 0.5); c.closePath(); c.fill();
                c.restore();
            } else if (bldg.type === 'radar') {
                // Radar dish on base
                // Base structure
                c.fillStyle = '#5a6060';
                c.fillRect(bx - bw * 0.2, by + bh * 0.3, bw * 0.4, bh * 0.4);
                // Radar dish (rotating)
                c.save();
                c.translate(bx, by + bh * 0.15);
                c.rotate(Math.sin(b.timer * 0.02) * 0.3);
                c.fillStyle = '#7a8080';
                c.beginPath(); c.ellipse(0, 0, bw * 0.3, bw * 0.12, 0, Math.PI, 0); c.fill();
                c.fillStyle = '#5a6060';
                c.fillRect(-1, -bh * 0.1, 2, bh * 0.15);
                c.restore();
                // Support pillar
                c.fillStyle = '#6a6a65';
                c.fillRect(bx - 2, by + bh * 0.15, 4, bh * 0.2);
            } else if (bldg.type === 'barracks') {
                // Long barracks building
                c.fillStyle = '#5a5548';
                c.fillRect(bx - bw * 0.5, by + bh * 0.15, bw, bh * 0.55);
                // Roof (slight angle)
                c.fillStyle = '#3a3830';
                c.beginPath();
                c.moveTo(bx - bw * 0.55, by + bh * 0.15);
                c.lineTo(bx - bw * 0.5, by + bh * 0.08);
                c.lineTo(bx + bw * 0.5, by + bh * 0.08);
                c.lineTo(bx + bw * 0.55, by + bh * 0.15);
                c.closePath(); c.fill();
                // Door
                c.fillStyle = '#2a2820';
                c.fillRect(bx - bw * 0.08, by + bh * 0.4, bw * 0.16, bh * 0.3);
                // Windows
                c.fillStyle = '#2a3540';
                for (let j = 0; j < 4; j++) {
                    c.fillRect(bx - bw * 0.4 + j * bw * 0.22, by + bh * 0.25, bw * 0.1, bh * 0.1);
                }
                // Red cross (medical)
                c.fillStyle = '#cc3333';
                c.fillRect(bx - 1, by + bh * 0.05, 2, bh * 0.08);
                c.fillRect(bx - bw * 0.04, by + bh * 0.07, bw * 0.08, 2);
            } else {
                // Supply depot — containers and crates
                // Shipping container
                c.fillStyle = '#3a6a4a';
                c.fillRect(bx - bw * 0.4, by + bh * 0.3, bw * 0.5, bh * 0.35);
                c.strokeStyle = '#2a5a3a'; c.lineWidth = 0.5;
                c.strokeRect(bx - bw * 0.4, by + bh * 0.3, bw * 0.5, bh * 0.35);
                // Ridges on container
                c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 0.5;
                for (let j = 1; j < 4; j++) {
                    c.beginPath(); c.moveTo(bx - bw * 0.4 + j * bw * 0.125, by + bh * 0.3);
                    c.lineTo(bx - bw * 0.4 + j * bw * 0.125, by + bh * 0.65); c.stroke();
                }
                // Second container (blue)
                c.fillStyle = '#3a4a6a';
                c.fillRect(bx + bw * 0.1, by + bh * 0.35, bw * 0.35, bh * 0.3);
                // Stacked crates
                c.fillStyle = '#7a6a50';
                c.fillRect(bx - bw * 0.15, by + bh * 0.15, bw * 0.15, bh * 0.15);
                c.fillRect(bx, by + bh * 0.2, bw * 0.12, bh * 0.1);
                // Forklift silhouette
                c.fillStyle = '#cc8800';
                c.fillRect(bx + bw * 0.3, by + bh * 0.6, bw * 0.15, bh * 0.12);
            }

            // Damage effects
            if (bldg.damaged) {
                // Scorch marks
                c.fillStyle = 'rgba(30,20,10,0.3)';
                c.beginPath(); c.ellipse(bx + 5, by + bh * 0.5, bw * 0.15, bh * 0.08, 0.3, 0, Math.PI * 2); c.fill();
                // Crack lines
                c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
                c.beginPath(); c.moveTo(bx - 5, by + bh * 0.2); c.lineTo(bx + 3, by + bh * 0.35); c.lineTo(bx - 8, by + bh * 0.5); c.stroke();
                // Rubble
                c.fillStyle = 'rgba(80,70,60,0.4)';
                for (let j = 0; j < 3; j++) {
                    c.fillRect(bx - bw * 0.3 + j * bw * 0.2 + Math.sin(j * 5) * 5, by + bh * 0.65, 4 + j * 2, 3 + j);
                }
            }
            c.restore();
        }

        // ── GRASS BLADES ──
        for (const gr of b.grassBlades) {
            const sway = Math.sin(b.timer * 0.04 + gr.sway) * 4;
            c.strokeStyle = gr.color;
            c.lineWidth = gr.w;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(gr.x, gr.y);
            c.quadraticCurveTo(gr.x + sway * 0.5, gr.y - gr.h * 0.6, gr.x + sway, gr.y - gr.h);
            c.stroke();
        }

        // ── FIRE EFFECTS ──
        for (let i = b.fireEffects.length - 1; i >= 0; i--) {
            const f = b.fireEffects[i];
            f.life -= 0.025;
            if (f.life <= 0) { b.fireEffects.splice(i, 1); continue; }
            f.x += f.vx; f.y += f.vy; f.vy -= 0.15;
            const alpha = f.life;
            const sz = f.size * (0.5 + f.life * 0.5);
            // Outer glow
            const fg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, sz * 2);
            fg.addColorStop(0, 'rgba(255,200,50,' + (alpha * 0.5) + ')');
            fg.addColorStop(0.5, 'rgba(255,100,20,' + (alpha * 0.3) + ')');
            fg.addColorStop(1, 'rgba(255,50,0,0)');
            c.fillStyle = fg;
            c.fillRect(f.x - sz * 2, f.y - sz * 2, sz * 4, sz * 4);
            // Core
            c.fillStyle = 'rgba(255,255,200,' + alpha + ')';
            c.beginPath(); c.arc(f.x, f.y, sz * 0.4, 0, Math.PI * 2); c.fill();
        }

        // ── PARTICLES (sparks, blood, debris) — capped at 200 for performance ──
        if (b.particles.length > 200) b.particles.splice(0, b.particles.length - 200);
        for (let i = b.particles.length - 1; i >= 0; i--) {
            const p = b.particles[i];
            p.life -= p.decay;
            if (p.life <= 0) { b.particles.splice(i, 1); continue; }
            p.x += p.vx; p.y += p.vy; p.vy += 0.12;
            c.globalAlpha = Math.max(0, p.life);
            if (p.type === 'spark') {
                c.fillStyle = p.color;
                c.fillRect(p.x - 1, p.y - 1, 3, 3);
                // Spark trail
                c.strokeStyle = p.color; c.lineWidth = 0.5;
                c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); c.stroke();
            } else if (p.type === 'blood') {
                c.fillStyle = p.color;
                c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
            } else if (p.type === 'debris') {
                c.fillStyle = p.color;
                c.save(); c.translate(p.x, p.y); c.rotate(p.life * 5);
                c.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
                c.restore();
            } else if (p.type === 'muzzle') {
                const mg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * p.life * 2);
                mg.addColorStop(0, 'rgba(255,255,200,' + p.life + ')');
                mg.addColorStop(0.5, 'rgba(255,180,50,' + (p.life * 0.6) + ')');
                mg.addColorStop(1, 'rgba(255,100,0,0)');
                c.fillStyle = mg;
                c.fillRect(p.x - p.size * 2, p.y - p.size * 2, p.size * 4, p.size * 4);
            } else if (p.type === 'tracer') {
                // Bullet tracer — bright line trail
                c.strokeStyle = p.color; c.lineWidth = 2 * p.life;
                c.beginPath();
                c.moveTo(p.x, p.y);
                c.lineTo(p.x - p.vx * 4, p.y - p.vy * 4);
                c.stroke();
                // Bright core
                c.fillStyle = '#fff'; c.globalAlpha = p.life * 0.8;
                c.beginPath(); c.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); c.fill();
                c.globalAlpha = p.life;
            }
            c.globalAlpha = 1;
        }

        // ── FIGHTING LOGIC ──
        if (b.phase === 'fighting') {
            b.fightTimer++;
            const weaponBonus = 1 + (b.weaponTier || 0) * 0.15;

            // My soldiers attack
            for (const ms of b.mySoldiers) {
                if (!ms.alive || ms.state === 'dying' || ms.state === 'dead') continue;
                ms.attackTimer--;
                // Always march toward enemy side
                ms.x += (W * 0.55 - ms.x) * 0.04;
                if (ms.attackTimer <= 0) {
                    // Pick a random alive enemy (spread damage, not focus fire)
                    const aliveEnemies = b.enemies.filter(e => e.alive && e.state !== 'dying' && e.state !== 'dead');
                    const closest = aliveEnemies.length > 0 ? aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)] : null;
                    const closestDist = closest ? Math.hypot(ms.x - closest.x, ms.y - closest.y) : Infinity;
                    if (closest && closestDist < 300) {
                        ms.target = closest;
                        ms.state = 'attacking';
                        ms.attackTimer = 8 + Math.floor(Math.random() * 8);
                        // Lunge toward enemy
                        ms.x += (closest.x - 40 - ms.x) * 0.15;
                        ms.y += (closest.y - ms.y) * 0.06;
                        // Clamp to left side
                        ms.x = Math.min(ms.x, W * 0.55);
                        // Deal damage
                        const dmg = (12 + Math.random() * 8) * weaponBonus;
                        closest.hp -= dmg;
                        closest.hit = 8;
                        // Hit effects
                        const hx = closest.x - 15, hy = closest.y - 10;
                        // Sparks
                        for (let j = 0; j < 5; j++) {
                            b.particles.push({ x: hx, y: hy, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 4 - 1, life: 1, decay: 0.04 + Math.random() * 0.03, color: '#ffd700', size: 2, type: 'spark' });
                        }
                        // Blood
                        for (let j = 0; j < 3; j++) {
                            b.particles.push({ x: hx, y: hy, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 1, decay: 0.02, color: '#cc3333', size: 2 + Math.random() * 2, type: 'blood' });
                        }
                        // Fire on hit (weapon tier 1+)
                        if (b.weaponTier >= 1) {
                            b.fireEffects.push({ x: hx, y: hy, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2, life: 0.6 + Math.random() * 0.4, size: 6 + Math.random() * 6 });
                        }
                        // Modern rifle — always muzzle flash + bullet tracer
                        b.particles.push({ x: ms.x + 15, y: ms.y - 15, vx: 0, vy: 0, life: 1, decay: 0.15, color: '#ffaa00', size: 10, type: 'muzzle' });
                        // Bullet tracer from shooter to target
                        b.particles.push({ x: ms.x + 15, y: ms.y - 15, vx: (hx - ms.x - 15) * 0.15, vy: (hy - ms.y + 15) * 0.15, life: 1, decay: 0.12, color: '#ffee55', size: 2, type: 'tracer' });
                        // Gun sound effect (throttled)
                        if (!b._lastGunSound || b.fightTimer - b._lastGunSound > 8) { g.sfx.gun(); b._lastGunSound = b.fightTimer; }
                        if (b.weaponTier >= 3) {
                            // Heavy weapon explosion for high tier
                            if (!b._lastBoom || b.fightTimer - b._lastBoom > 15) { g.sfx.explosion(); b._lastBoom = b.fightTimer; }
                        }
                        if (closest.hp <= 0) {
                            closest.state = 'dying';
                            closest.deathTimer = 30;
                        }
                    } else {
                        // March forward aggressively
                        ms.x += 1.5;
                    }
                } else {
                    // Keep marching forward between attacks
                    ms.x += 0.5;
                    ms.state = 'idle';
                }
            }

            // Enemy soldiers attack
            for (const en of b.enemies) {
                if (!en.alive || en.state === 'dying' || en.state === 'dead') continue;
                en.attackTimer--;
                // Always march toward player side
                en.x += (W * 0.45 - en.x) * 0.04;
                if (en.attackTimer <= 0) {
                    // Pick a random alive player soldier
                    const aliveMine = b.mySoldiers.filter(s => s.alive && s.state !== 'dying' && s.state !== 'dead');
                    const closest = aliveMine.length > 0 ? aliveMine[Math.floor(Math.random() * aliveMine.length)] : null;
                    const closestDist = closest ? Math.hypot(en.x - closest.x, en.y - closest.y) : Infinity;
                    if (closest && closestDist < 300) {
                        en.state = 'attacking';
                        en.attackTimer = 10 + Math.floor(Math.random() * 8);
                        en.x += (closest.x + 40 - en.x) * 0.12;
                        en.y += (closest.y - en.y) * 0.06;
                        en.x = Math.max(en.x, W * 0.45);
                        const dmg = 10 + Math.random() * 6;
                        closest.hp -= dmg;
                        closest.hit = 8;
                        const hx = closest.x + 15, hy = closest.y - 10;
                        // Enemy muzzle flash + tracer
                        b.particles.push({ x: en.x - 15, y: en.y - 15, vx: 0, vy: 0, life: 1, decay: 0.15, color: '#ffaa00', size: 10, type: 'muzzle' });
                        b.particles.push({ x: en.x - 15, y: en.y - 15, vx: (hx - en.x + 15) * 0.15, vy: (hy - en.y + 15) * 0.15, life: 1, decay: 0.12, color: '#ffee55', size: 2, type: 'tracer' });
                        // Blood on hit
                        for (let j = 0; j < 3; j++) {
                            b.particles.push({ x: hx, y: hy, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3, life: 1, decay: 0.03, color: '#cc3333', size: 2, type: 'blood' });
                        }
                        if (closest.hp <= 0) {
                            closest.state = 'dying';
                            closest.deathTimer = 30;
                        }
                    } else {
                        en.x -= 1.5;
                        en.state = 'idle';
                    }
                } else {
                    en.x -= 0.5;
                    en.state = 'idle';
                }
            }

            // Process dying soldiers
            const processDying = (soldiers) => {
                for (const s of soldiers) {
                    if (s.state === 'dying') {
                        s.deathTimer--;
                        if (s.deathTimer <= 0) { s.state = 'dead'; s.alive = false; }
                    }
                }
            };
            processDying(b.mySoldiers);
            processDying(b.enemies);

            // Check win/lose
            const aliveEnemies = b.enemies.filter(e => e.alive).length;
            const aliveMine = b.mySoldiers.filter(s => s.alive).length;
            if (aliveEnemies === 0) {
                b.phase = 'victory';
                g.sfx.victory();
                // Victory fireworks
                for (let i = 0; i < 30; i++) {
                    b.particles.push({ x: W * 0.3 + Math.random() * W * 0.4, y: H * 0.5, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 8 - 2, life: 1, decay: 0.015, color: ['#ffd700', '#ff6b6b', '#2ecc71', '#3498db', '#f1c40f'][i % 5], size: 3, type: 'spark' });
                }
                for (let i = 0; i < 10; i++) {
                    b.fireEffects.push({ x: W * 0.3 + Math.random() * W * 0.4, y: H * 0.6, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3, life: 0.8 + Math.random() * 0.5, size: 8 + Math.random() * 8 });
                }
            } else if (aliveMine === 0) {
                b.phase = 'defeat';
                g.sfx.defeat();
            }
        }

        // ── DRAW ENEMY SOLDIERS (flipped to face left toward player) ──
        for (const en of b.enemies) {
            if (en.state === 'dead') continue;
            const dying = en.state === 'dying';
            c.save();
            // Flip horizontally so enemy faces left (toward player)
            c.translate(en.x, en.y);
            c.scale(-1, 1);
            c.translate(-en.x, -en.y);
            if (dying) {
                c.globalAlpha = en.deathTimer / 30;
                c.translate(en.x, en.y); c.rotate(Math.PI / 2 * (1 - en.deathTimer / 30));
                c.translate(-en.x, -en.y);
            }
            if (en.hit > 0) { en.hit--; c.globalAlpha *= 0.5 + Math.sin(en.hit * 0.8) * 0.5; }
            // Use cached sprite for non-attacking idle soldiers (perf optimization)
            const attacking = en.state === 'attacking' && en.attackTimer > 20;
            const spr = this._getSprite(enemyEmpId || 0, 28);
            if (spr && !attacking && !dying) {
                c.drawImage(spr, en.x - spr.width/2, en.y - spr.height/2);
            } else {
                this._drawSoldier(c, en.x, en.y, enemyEmpId ? g.empires[enemyEmpId].color : '#888888', attacking, b.timer, en.idx * 1.3, enemyEmpId, 28);
            }
            c.globalAlpha = 1;
            c.restore(); // Restore the horizontal flip
            // HP bar (drawn outside flip so it stays readable)
            if (!dying) {
                const barW = 44, barH = 5, barX = en.x - barW / 2, barY = en.y - 40;
                c.fillStyle = 'rgba(0,0,0,0.6)';
                this._rr(c, barX - 1, barY - 1, barW + 2, barH + 2, 3); c.fill();
                const hpPct = Math.max(0, en.hp / en.maxHp);
                const hpColor = hpPct > 0.5 ? '#2ecc71' : (hpPct > 0.25 ? '#f1c40f' : '#e74c3c');
                c.fillStyle = hpColor;
                this._rr(c, barX, barY, barW * hpPct, barH, 2); c.fill();
            }
        }

        // ── DRAW MY SOLDIERS (sprite-cached) ──
        for (const ms of b.mySoldiers) {
            if (ms.state === 'dead') continue;
            const dying = ms.state === 'dying';
            if (dying) {
                c.save(); c.globalAlpha = ms.deathTimer / 30;
                c.translate(ms.x, ms.y); c.rotate(-Math.PI / 2 * (1 - ms.deathTimer / 30));
                c.translate(-ms.x, -ms.y);
            }
            if (ms.hit > 0) { ms.hit--; c.globalAlpha *= 0.5 + Math.sin(ms.hit * 0.8) * 0.5; }
            const attacking = ms.state === 'attacking' && ms.attackTimer > 15;
            const spr = this._getSprite(g.player, 28);
            if (spr && !attacking && !dying) {
                c.drawImage(spr, ms.x - spr.width/2, ms.y - spr.height/2);
            } else {
                this._drawSoldier(c, ms.x, ms.y, myEmp.color, attacking, b.timer, ms.idx * 1.1, g.player, 28);
            }
            // Weapon tier glow + enchantment trail
            if (b.weaponTier >= 1 && !dying) {
                const tierColors = ['', '#cd7f32', '#c0c0c0', '#ffd700', '#00e5ff'];
                const tierNames2 = ['', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];
                const tc = tierColors[b.weaponTier] || '#ffd700';
                // Pulsing weapon glow
                const pulse = 0.25 + Math.sin(b.timer * 0.12 + ms.idx) * 0.15;
                c.save(); c.globalAlpha = pulse;
                const glow = c.createRadialGradient(ms.x + 14, ms.y - 18, 2, ms.x + 14, ms.y - 18, 22 + b.weaponTier * 4);
                glow.addColorStop(0, tc); glow.addColorStop(1, tc.slice(0, 7) + '00');
                c.fillStyle = glow;
                c.fillRect(ms.x - 10, ms.y - 42, 48, 48);
                c.restore();
                // Enchantment sparkle particles (tier 2+)
                if (b.weaponTier >= 2 && b.timer % 4 === ms.idx % 4) {
                    b.particles.push({
                        x: ms.x + 10 + (Math.random() - 0.5) * 20,
                        y: ms.y - 20 + (Math.random() - 0.5) * 20,
                        vx: (Math.random() - 0.5) * 0.5, vy: -0.5 - Math.random() * 0.5,
                        life: 1, decay: 0.05, color: tc, size: 2 + Math.random() * 2, type: 'spark'
                    });
                }
            }
            c.globalAlpha = 1;
            // HP bar
            if (!dying) {
                const barW = 44, barH = 5, barX = ms.x - barW / 2, barY = ms.y - 40;
                c.fillStyle = 'rgba(0,0,0,0.6)';
                this._rr(c, barX - 1, barY - 1, barW + 2, barH + 2, 3); c.fill();
                const hpPct = Math.max(0, ms.hp / ms.maxHp);
                const hpColor = hpPct > 0.5 ? '#2ecc71' : (hpPct > 0.25 ? '#f1c40f' : '#e74c3c');
                c.fillStyle = hpColor;
                this._rr(c, barX, barY, barW * hpPct, barH, 2); c.fill();
            }
            if (dying) c.restore();
        }

        // ── COMMANDER (non-fighting, watches from behind) ──
        const cmdX = W * 0.08, cmdY = H * 0.52;
        // Commander glow
        const cmdGr = c.createRadialGradient(cmdX, cmdY, 5, cmdX, cmdY, 35);
        cmdGr.addColorStop(0, myEmp.color + '30');
        cmdGr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = cmdGr;
        c.fillRect(cmdX - 35, cmdY - 35, 70, 70);
        this._drawSoldier(c, cmdX, cmdY, myEmp.color, false, b.timer, 0, g.player, 32);
        // Crown
        c.fillStyle = '#ffd700';
        c.beginPath();
        c.moveTo(cmdX - 12, cmdY - 42);
        c.lineTo(cmdX - 9, cmdY - 58);
        c.lineTo(cmdX - 3, cmdY - 47);
        c.lineTo(cmdX + 3, cmdY - 60);
        c.lineTo(cmdX + 9, cmdY - 47);
        c.lineTo(cmdX + 12, cmdY - 42);
        c.closePath(); c.fill();
        c.textAlign = 'center'; c.fillStyle = '#ffd700'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.fillText('CMDR', cmdX, cmdY - 66);

        // ── ARMY COUNT DISPLAY ──
        const myAlive = b.mySoldiers.filter(s => s.alive).length;
        const enAlive = b.enemies.filter(e => e.alive).length;
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillStyle = myEmp.color; c.font = 'bold 13px "Segoe UI", sans-serif';
        c.fillText('\u2694 Your Army: ' + myAlive + '/' + b.mySoldiers.length, 10, BF_TOP + 5);
        c.textAlign = 'right';
        c.fillStyle = enemyEmp ? enemyEmp.color : '#888888';
        c.fillText('Enemy: ' + enAlive + '/' + b.enemies.length + ' \u2694', W - 10, BF_TOP + 5);

        // ── WEAPON TIER DISPLAY ──
        const tierNames = ['Basic', 'Bronze', 'Silver', 'Gold', 'Diamond'];
        c.textAlign = 'center';
        c.fillStyle = '#ffd700'; c.font = 'bold 11px "Segoe UI", sans-serif';
        c.fillText('Weapon: ' + (tierNames[b.weaponTier] || 'Basic'), W / 2, BF_TOP + 5);

        // ── READY PHASE — choose Auto or Manual ──
        if (b.phase === 'ready') {
            if (b.timer > 150) {
                // Default to manual after timeout
                b.phase = 'manual';
                b.fightTimer = 0;
                try { g.sfx.battle(); } catch(e) {}
            }
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = '#ffd700'; c.font = 'bold 15px Georgia, serif';
            c.fillText('Choose your battle style!', W / 2, H * 0.82);
            // MANUAL button (left, highlighted)
            const mbW = 170, mbH = 48, mbX = W * 0.5 - mbW - 10, mbY = H * 0.86;
            const mbGr = c.createLinearGradient(mbX, mbY, mbX, mbY + mbH);
            mbGr.addColorStop(0, '#e67e22'); mbGr.addColorStop(1, '#d35400');
            this._rr(c, mbX, mbY, mbW, mbH, 10); c.fillStyle = mbGr; c.fill();
            c.strokeStyle = '#ffd700'; c.lineWidth = 2;
            this._rr(c, mbX, mbY, mbW, mbH, 10); c.stroke();
            c.fillStyle = '#ffffff'; c.font = 'bold 16px Georgia, serif';
            c.fillText('\uD83C\uDFAE MANUAL', mbX + mbW / 2, mbY + mbH / 2 - 7);
            c.font = '10px "Segoe UI", sans-serif'; c.fillStyle = '#ffd0a0';
            c.fillText('Joystick + Fire', mbX + mbW / 2, mbY + mbH / 2 + 10);
            // Star badge
            c.fillStyle = '#ffd700'; c.font = 'bold 10px sans-serif';
            c.fillText('\u2605 FREE FIRE STYLE \u2605', mbX + mbW / 2, mbY - 10);
            g.btns.push({ rect: { x: mbX, y: mbY, w: mbW, h: mbH }, fn: () => {
                b.phase = 'manual';
                b.fightTimer = 0;
                g.sfx.battle();
            }});
            // AUTO button (right)
            const abW = 130, abH = 48, abX = W * 0.5 + 10, abY = H * 0.86;
            const abGr = c.createLinearGradient(abX, abY, abX, abY + abH);
            abGr.addColorStop(0, '#2ecc71'); abGr.addColorStop(1, '#27ae60');
            this._rr(c, abX, abY, abW, abH, 10); c.fillStyle = abGr; c.fill();
            c.strokeStyle = '#ffffff'; c.lineWidth = 1;
            this._rr(c, abX, abY, abW, abH, 10); c.stroke();
            c.fillStyle = '#ffffff'; c.font = 'bold 16px Georgia, serif';
            c.fillText('\u2694 AUTO', abX + abW / 2, abY + abH / 2 - 5);
            c.font = '10px "Segoe UI", sans-serif'; c.fillStyle = '#d5f5e3';
            c.fillText('Watch AI fight', abX + abW / 2, abY + abH / 2 + 10);
            g.btns.push({ rect: { x: abX, y: abY, w: abW, h: abH }, fn: () => {
                b.phase = 'fighting';
                b.fightTimer = 0;
                g.sfx.battle();
            }});
        }

        // ── MANUAL CONTROL PHASE (Free Fire style) ──
        if (b.phase === 'manual') {
            this._updateManualBattle(c, g, W, H, b, BF_TOP, BF_BOT);
        }

        // ── RESULT DISPLAY ──
        if (b.phase === 'victory' || b.phase === 'defeat') {
            c.fillStyle = 'rgba(0,0,0,0.5)';
            c.fillRect(0, H * 0.35, W, H * 0.25);
            c.textAlign = 'center'; c.textBaseline = 'middle';
            if (b.phase === 'victory') {
                c.fillStyle = '#ffd700'; c.font = 'bold 30px Georgia, serif';
                c.fillText('\uD83C\uDFC6 VICTORY! Territory conquered!', W / 2, H * 0.40);
                // Show kills if manual mode
                if (b.kills > 0) {
                    c.fillStyle = '#ff6b6b'; c.font = 'bold 14px "Segoe UI", sans-serif';
                    c.fillText('\uD83C\uDFA5 Kills: ' + b.kills + '/' + b.totalEnemies + '  |  Emperor HP: ' + Math.ceil(b.emperor.hp) + '/' + b.emperor.maxHp, W / 2, H * 0.46);
                }
                c.fillStyle = '#f5e6c8'; c.font = '14px "Segoe UI", sans-serif';
                c.fillText('Your army proved superior on the battlefield', W / 2, H * 0.51);
            } else {
                c.fillStyle = '#e74c3c'; c.font = 'bold 30px Georgia, serif';
                c.fillText('\uD83D\uDC80 DEFEAT! Your army was destroyed.', W / 2, H * 0.40);
                if (b.kills > 0) {
                    c.fillStyle = '#f5e6c8'; c.font = '14px "Segoe UI", sans-serif';
                    c.fillText('\uD83C\uDFA5 Kills: ' + b.kills + '/' + b.totalEnemies + ' before falling', W / 2, H * 0.46);
                }
                c.fillStyle = '#f5e6c8'; c.font = '14px "Segoe UI", sans-serif';
                c.fillText('Upgrade your weapons and try again', W / 2, H * 0.51);
            }
            const cbW = 150, cbH = 38, cbX = (W - cbW) / 2, cbY = H * 0.55;
            this._rr(c, cbX, cbY, cbW, cbH, 8);
            c.fillStyle = b.phase === 'victory' ? 'rgba(46,204,113,0.9)' : 'rgba(200,60,60,0.9)'; c.fill();
            c.strokeStyle = '#ffffff'; c.lineWidth = 2;
            this._rr(c, cbX, cbY, cbW, cbH, 8); c.stroke();
            c.fillStyle = '#ffffff'; c.font = 'bold 15px "Segoe UI", sans-serif';
            c.fillText('Continue', W / 2, cbY + cbH / 2);
            g.btns.push({ rect: { x: cbX, y: cbY, w: cbW, h: cbH }, fn: () => {
                if (b.phase === 'victory' && enemyTid !== null) {
                    g.sel = tid;
                    g._attackTarget = enemyTid;
                    g._doAttack(0, true);
                }
                tv.sub = 'explore';
                tv._battle = null;
            }});
        }
    }

    // ── MANUAL BATTLE (Free Fire style joystick + fire) ──
    _updateManualBattle(c, g, W, H, b, BF_TOP, BF_BOT) {
        b.fightTimer++;
        const inp = g.input;
        const emp = b.emperor;
        const weaponBonus = 1 + (b.weaponTier || 0) * 0.15;
        const JOY_R = 55;   // joystick outer radius
        const JOY_K = 22;   // joystick knob max displacement
        const FIRE_R = 42;  // fire button radius
        const JOY_CX = 85, JOY_CY = H * 0.75;   // joystick center
        const FIRE_CX = W - 85, FIRE_CY = H * 0.75; // fire button center

        // ── INPUT: Joystick ──
        b.joy.active = false;
        b.joy.dx = 0; b.joy.dy = 0;
        if (inp.isDown) {
            const dx = inp.curX - JOY_CX;
            const dy = inp.curY - JOY_CY;
            if (dx * dx + dy * dy < (JOY_R + 30) * (JOY_R + 30)) {
                b.joy.active = true;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    const clamp = Math.min(dist, JOY_K);
                    b.joy.dx = (dx / dist) * clamp;
                    b.joy.dy = (dy / dist) * clamp;
                }
            }
        }

        // ── INPUT: Fire button ──
        b.fire.active = false;
        if (inp.isDown) {
            const fdx = inp.curX - FIRE_CX;
            const fdy = inp.curY - FIRE_CY;
            if (fdx * fdx + fdy * fdy < FIRE_R * FIRE_R) {
                b.fire.active = true;
            }
        }

        // ── MOVE EMPEROR ──
        if (emp.alive) {
            emp.x += b.joy.dx * emp.speed;
            emp.y += b.joy.dy * emp.speed;
            // Clamp to battlefield
            emp.x = Math.max(20, Math.min(W - 20, emp.x));
            emp.y = Math.max(BF_TOP + 25, Math.min(BF_BOT - 10, emp.y));
            // Face direction
            if (b.joy.dx > 2) emp.facingRight = true;
            if (b.joy.dx < -2) emp.facingRight = false;

            // ── SHOOT ──
            if (emp.shootCooldown > 0) emp.shootCooldown--;
            if (b.fire.active && emp.shootCooldown <= 0) {
                emp.shootCooldown = 10;
                // Auto-aim at nearest alive enemy
                let nearest = null, nearDist = Infinity;
                for (const en of b.enemies) {
                    if (!en.alive || en.state === 'dying' || en.state === 'dead') continue;
                    const d = Math.hypot(emp.x - en.x, emp.y - en.y);
                    if (d < nearDist) { nearDist = d; nearest = en; }
                }
                if (nearest) {
                    const angle = Math.atan2(nearest.y - emp.y, nearest.x - emp.x);
                    const bspd = 8;
                    b.bullets.push({
                        x: emp.x + (emp.facingRight ? 15 : -15),
                        y: emp.y - 10,
                        vx: Math.cos(angle) * bspd,
                        vy: Math.sin(angle) * bspd,
                        dmg: (15 + Math.random() * 10) * weaponBonus,
                        life: 60,
                    });
                    // Muzzle flash
                    b.particles.push({ x: emp.x + (emp.facingRight ? 18 : -18), y: emp.y - 12, vx: 0, vy: 0, life: 1, decay: 0.2, color: '#ffaa00', size: 12, type: 'muzzle' });
                    // Tracer
                    b.particles.push({ x: emp.x + 18, y: emp.y - 12, vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5, life: 1, decay: 0.15, color: '#ffee55', size: 2, type: 'tracer' });
                    // Sound (throttled)
                    if (!b._lastGunSound || b.fightTimer - b._lastGunSound > 6) { try { g.sfx.gun(); } catch(e) {} b._lastGunSound = b.fightTimer; }
                    if (b.weaponTier >= 3) {
                        if (!b._lastBoom || b.fightTimer - b._lastBoom > 15) { try { g.sfx.explosion(); } catch(e) {} b._lastBoom = b.fightTimer; }
                    }
                }
            }
        }

        // ── UPDATE PLAYER BULLETS ──
        for (let i = b.bullets.length - 1; i >= 0; i--) {
            const bl = b.bullets[i];
            bl.x += bl.vx; bl.y += bl.vy; bl.life--;
            if (bl.life <= 0 || bl.x < 0 || bl.x > W || bl.y < BF_TOP || bl.y > BF_BOT) {
                b.bullets.splice(i, 1); continue;
            }
            // Hit enemy?
            for (const en of b.enemies) {
                if (!en.alive || en.state === 'dying' || en.state === 'dead') continue;
                if (Math.abs(bl.x - en.x) < 18 && Math.abs(bl.y - en.y) < 22) {
                    en.hp -= bl.dmg;
                    en.hit = 8;
                    b.bullets.splice(i, 1);
                    // Sparks + blood
                    for (let j = 0; j < 4; j++) {
                        b.particles.push({ x: bl.x, y: bl.y, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1, life: 1, decay: 0.04, color: '#ffd700', size: 2, type: 'spark' });
                    }
                    for (let j = 0; j < 2; j++) {
                        b.particles.push({ x: bl.x, y: bl.y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 1, decay: 0.03, color: '#cc3333', size: 2, type: 'blood' });
                    }
                    if (b.weaponTier >= 1) {
                        b.fireEffects.push({ x: bl.x, y: bl.y, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2, life: 0.5 + Math.random() * 0.3, size: 5 + Math.random() * 5 });
                    }
                    if (en.hp <= 0) {
                        en.state = 'dying'; en.deathTimer = 30;
                        b.kills++;
                    }
                    break;
                }
            }
        }

        // ── ENEMY AI: enemies shoot at emperor ──
        for (const en of b.enemies) {
            if (!en.alive || en.state === 'dying' || en.state === 'dead') continue;
            en.attackTimer--;
            if (en.attackTimer <= 0) {
                en.attackTimer = 25 + Math.floor(Math.random() * 20);
                if (emp.alive) {
                    const angle = Math.atan2(emp.y - en.y, emp.x - en.x);
                    const espd = 4 + Math.random() * 2;
                    b.enemyBullets.push({
                        x: en.x + (en.x > W * 0.5 ? -15 : 15),
                        y: en.y - 10,
                        vx: Math.cos(angle) * espd,
                        vy: Math.sin(angle) * espd,
                        dmg: 6 + Math.random() * 6,
                        life: 50,
                    });
                    // Enemy muzzle flash
                    b.particles.push({ x: en.x, y: en.y - 12, vx: 0, vy: 0, life: 1, decay: 0.2, color: '#ff6600', size: 8, type: 'muzzle' });
                }
            }
        }

        // ── UPDATE ENEMY BULLETS ──
        for (let i = b.enemyBullets.length - 1; i >= 0; i--) {
            const bl = b.enemyBullets[i];
            bl.x += bl.vx; bl.y += bl.vy; bl.life--;
            if (bl.life <= 0 || bl.x < 0 || bl.x > W || bl.y < BF_TOP || bl.y > BF_BOT) {
                b.enemyBullets.splice(i, 1); continue;
            }
            // Hit emperor?
            if (emp.alive && Math.abs(bl.x - emp.x) < 16 && Math.abs(bl.y - emp.y) < 20) {
                emp.hp -= bl.dmg;
                emp.hit = 10;
                b.enemyBullets.splice(i, 1);
                for (let j = 0; j < 3; j++) {
                    b.particles.push({ x: bl.x, y: bl.y, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3, life: 1, decay: 0.03, color: '#cc3333', size: 2, type: 'blood' });
                }
                if (emp.hp <= 0) {
                    emp.alive = false;
                    b.phase = 'defeat';
                    try { g.sfx.defeat(); } catch(e) {}
                }
            }
        }

        // ── PROCESS DYING ENEMIES ──
        for (const en of b.enemies) {
            if (en.state === 'dying') {
                en.deathTimer--;
                if (en.deathTimer <= 0) { en.state = 'dead'; en.alive = false; }
            }
            if (en.hit > 0) en.hit--;
        }

        // ── CHECK WIN ──
        const aliveEnemies = b.enemies.filter(e => e.alive).length;
        if (aliveEnemies === 0 && b.phase === 'manual') {
            b.phase = 'victory';
            try { g.sfx.victory(); } catch(e) {}
            for (let i = 0; i < 30; i++) {
                b.particles.push({ x: W * 0.3 + Math.random() * W * 0.4, y: H * 0.5, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 8 - 2, life: 1, decay: 0.015, color: ['#ffd700', '#ff6b6b', '#2ecc71', '#3498db', '#f1c40f'][i % 5], size: 3, type: 'spark' });
            }
        }

        // ── DRAW BULLETS (player) ──
        for (const bl of b.bullets) {
            c.save();
            c.fillStyle = '#ffee44';
            c.shadowColor = '#ffaa00'; c.shadowBlur = 6;
            c.beginPath();
            c.arc(bl.x, bl.y, 3, 0, Math.PI * 2);
            c.fill();
            // Bullet trail
            c.strokeStyle = 'rgba(255,238,68,0.4)'; c.lineWidth = 2;
            c.beginPath();
            c.moveTo(bl.x, bl.y);
            c.lineTo(bl.x - bl.vx * 2, bl.y - bl.vy * 2);
            c.stroke();
            c.restore();
        }

        // ── DRAW BULLETS (enemy) ──
        for (const bl of b.enemyBullets) {
            c.save();
            c.fillStyle = '#ff4444';
            c.shadowColor = '#ff0000'; c.shadowBlur = 4;
            c.beginPath();
            c.arc(bl.x, bl.y, 2.5, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = 'rgba(255,68,68,0.3)'; c.lineWidth = 2;
            c.beginPath();
            c.moveTo(bl.x, bl.y);
            c.lineTo(bl.x - bl.vx * 2, bl.y - bl.vy * 2);
            c.stroke();
            c.restore();
        }

        // ── DRAW EMPEROR ──
        if (emp.alive) {
            // Emperor glow
            const empGr = c.createRadialGradient(emp.x, emp.y, 5, emp.x, emp.y, 40);
            const empColor = g.empires[g.player] ? g.empires[g.player].color : '#ffcc00';
            empGr.addColorStop(0, empColor + '40');
            empGr.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = empGr;
            c.fillRect(emp.x - 40, emp.y - 40, 80, 80);

            // Draw emperor soldier (larger, 36px)
            c.save();
            if (emp.hit > 0) {
                emp.hit--;
                c.globalAlpha = 0.5 + Math.sin(emp.hit * 0.8) * 0.5;
            }
            if (!emp.facingRight) {
                c.translate(emp.x, emp.y);
                c.scale(-1, 1);
                c.translate(-emp.x, -emp.y);
            }
            this._drawSoldier(c, emp.x, emp.y, empColor, b.fire.active && emp.shootCooldown > 7, b.timer, 0, g.player, 36);
            c.restore();

            // Crown on emperor
            c.save();
            c.fillStyle = '#ffd700';
            c.beginPath();
            c.moveTo(emp.x - 14, emp.y - 48);
            c.lineTo(emp.x - 10, emp.y - 65);
            c.lineTo(emp.x - 4, emp.y - 53);
            c.lineTo(emp.x + 4, emp.y - 67);
            c.lineTo(emp.x + 10, emp.y - 53);
            c.lineTo(emp.x + 14, emp.y - 48);
            c.closePath(); c.fill();
            // Crown gems
            c.fillStyle = '#e74c3c';
            c.beginPath(); c.arc(emp.x, emp.y - 54, 2.5, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#3498db';
            c.beginPath(); c.arc(emp.x - 7, emp.y - 52, 2, 0, Math.PI * 2); c.fill();
            c.beginPath(); c.arc(emp.x + 7, emp.y - 52, 2, 0, Math.PI * 2); c.fill();
            c.restore();

            // Emperor HP bar
            const hpW = 50, hpH = 6, hpX = emp.x - hpW / 2, hpY = emp.y - 72;
            c.fillStyle = 'rgba(0,0,0,0.7)';
            this._rr(c, hpX - 1, hpY - 1, hpW + 2, hpH + 2, 3); c.fill();
            const hpPct = Math.max(0, emp.hp / emp.maxHp);
            const hpCol = hpPct > 0.5 ? '#2ecc71' : (hpPct > 0.25 ? '#f1c40f' : '#e74c3c');
            c.fillStyle = hpCol;
            this._rr(c, hpX, hpY, hpW * hpPct, hpH, 2); c.fill();
            // HP text
            c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.font = 'bold 9px "Segoe UI", sans-serif';
            c.fillText(Math.ceil(emp.hp) + '/' + emp.maxHp, emp.x, hpY - 3);
            // EMPEROR label (always visible)
            c.fillStyle = '#ffd700'; c.font = 'bold 11px Georgia, serif';
            c.textAlign = 'center'; c.textBaseline = 'bottom';
            c.fillText('EMPEROR', emp.x, emp.y + 24);
        }

        // ── DRAW JOYSTICK ──
        c.save(); c.globalAlpha = 0.7;
        // Outer ring
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3;
        c.beginPath(); c.arc(JOY_CX, JOY_CY, JOY_R, 0, Math.PI * 2); c.stroke();
        // Inner fill
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.beginPath(); c.arc(JOY_CX, JOY_CY, JOY_R, 0, Math.PI * 2); c.fill();
        c.restore();
        // Knob
        const knobX = JOY_CX + b.joy.dx;
        const knobY = JOY_CY + b.joy.dy;
        const knobGr = c.createRadialGradient(knobX, knobY, 2, knobX, knobY, 24);
        knobGr.addColorStop(0, 'rgba(255,255,255,0.9)');
        knobGr.addColorStop(1, 'rgba(255,255,255,0.3)');
        c.fillStyle = knobGr;
        c.beginPath(); c.arc(knobX, knobY, 24, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
        c.beginPath(); c.arc(knobX, knobY, 24, 0, Math.PI * 2); c.stroke();
        // Label
        c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.6)'; c.font = 'bold 10px "Segoe UI", sans-serif';
        c.fillText('MOVE', JOY_CX, JOY_CY + JOY_R + 14);

        // ── DRAW FIRE BUTTON ──
        const firePulse = b.fire.active ? 1 : 0.85 + Math.sin(b.timer * 0.08) * 0.15;
        c.save(); c.globalAlpha = firePulse;
        // Outer glow
        if (b.fire.active) {
            const fireGlow = c.createRadialGradient(FIRE_CX, FIRE_CY, FIRE_R - 5, FIRE_CX, FIRE_CY, FIRE_R + 12);
            fireGlow.addColorStop(0, 'rgba(231,76,60,0.4)');
            fireGlow.addColorStop(1, 'rgba(231,76,60,0)');
            c.fillStyle = fireGlow;
            c.beginPath(); c.arc(FIRE_CX, FIRE_CY, FIRE_R + 12, 0, Math.PI * 2); c.fill();
        }
        const fbGr = c.createRadialGradient(FIRE_CX - 8, FIRE_CY - 8, 2, FIRE_CX, FIRE_CY, FIRE_R);
        fbGr.addColorStop(0, b.fire.active ? '#ff6b6b' : '#e74c3c');
        fbGr.addColorStop(1, b.fire.active ? '#c0392b' : '#a93226');
        c.fillStyle = fbGr;
        c.beginPath(); c.arc(FIRE_CX, FIRE_CY, FIRE_R, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2;
        c.beginPath(); c.arc(FIRE_CX, FIRE_CY, FIRE_R, 0, Math.PI * 2); c.stroke();
        // Crosshair icon
        c.strokeStyle = '#ffffff'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(FIRE_CX, FIRE_CY, 12, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        c.moveTo(FIRE_CX - 18, FIRE_CY); c.lineTo(FIRE_CX + 18, FIRE_CY);
        c.moveTo(FIRE_CX, FIRE_CY - 18); c.lineTo(FIRE_CX, FIRE_CY + 18);
        c.stroke();
        c.restore();
        // Label
        c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.fillText('FIRE', FIRE_CX, FIRE_CY + FIRE_R + 14);

        // ── MANUAL HUD ──
        // Kill counter
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillStyle = 'rgba(0,0,0,0.5)';
        this._rr(c, 5, BF_TOP + 20, 90, 28, 6); c.fill();
        c.fillStyle = '#ff6b6b'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.fillText('\uD83C\uDFA5 Kills: ' + b.kills + '/' + b.totalEnemies, 12, BF_TOP + 28);

        // Enemies remaining
        c.textAlign = 'right';
        c.fillStyle = 'rgba(0,0,0,0.5)';
        this._rr(c, W - 95, BF_TOP + 20, 90, 28, 6); c.fill();
        c.fillStyle = '#ff6b6b'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.fillText('Enemy: ' + aliveEnemies, W - 12, BF_TOP + 28);

        // Auto-aim indicator line (subtle)
        if (emp.alive) {
            let nearest = null, nearDist = Infinity;
            for (const en of b.enemies) {
                if (!en.alive || en.state === 'dying' || en.state === 'dead') continue;
                const d = Math.hypot(emp.x - en.x, emp.y - en.y);
                if (d < nearDist) { nearDist = d; nearest = en; }
            }
            if (nearest && nearDist < 350) {
                c.save();
                c.strokeStyle = 'rgba(255,100,100,0.2)';
                c.lineWidth = 1;
                c.setLineDash([4, 4]);
                c.beginPath();
                c.moveTo(emp.x + (emp.facingRight ? 15 : -15), emp.y - 10);
                c.lineTo(nearest.x, nearest.y);
                c.stroke();
                c.setLineDash([]);
                // Target reticle on enemy
                c.strokeStyle = 'rgba(255,50,50,0.5)'; c.lineWidth = 1.5;
                c.beginPath(); c.arc(nearest.x, nearest.y, 20, 0, Math.PI * 2); c.stroke();
                c.restore();
            }
        }
    }

    _getCostume(empireId) {
        // All empires now use modern rifles
        return { weapon: 'rifle' };
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

    // ── SCREEN FLASH ──
    _triggerFlash(color = 'rgb(255,200,100)', alpha = 0.5) {
        this.flash.color = color;
        this.flash.alpha = alpha;
    }

    // ── NOTIFICATION POPUP SYSTEM (addictive feedback) ──
    addNotification(text, color = '#ffd700', icon = '⚔', duration = 120) {
        this.notifications.push({
            text, color, icon, duration,
            timer: 0,
            maxTimer: duration,
            y: 70 + this.notifications.length * 50,
        });
    }

    _drawNotifications() {
        const c = this.ctx, { W } = this.g;
        for (let i = this.notifications.length - 1; i >= 0; i--) {
            const n = this.notifications[i];
            n.timer++;
            // Slide in from right for first 15 frames
            let slideOffset = 0;
            if (n.timer < 15) slideOffset = (1 - n.timer / 15) * 300;
            // Slide out in last 20 frames
            if (n.timer > n.maxTimer - 20) slideOffset = -((n.timer - (n.maxTimer - 20)) / 20) * 300;
            // Remove when done
            if (n.timer >= n.maxTimer) { this.notifications.splice(i, 1); continue; }
            const x = W - 290 + slideOffset;
            const w = 270, h = 40;
            c.save();
            // Background with glow
            c.shadowColor = n.color;
            c.shadowBlur = 8;
            c.fillStyle = 'rgba(0,0,0,0.7)';
            c.beginPath(); c.roundRect(x, n.y, w, h, 8); c.fill();
            c.shadowBlur = 0;
            // Left color bar
            c.fillStyle = n.color;
            c.beginPath(); c.roundRect(x, n.y, 4, h, [8, 0, 0, 8]); c.fill();
            // Icon
            c.font = '18px sans-serif';
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillText(n.icon, x + 12, n.y + h/2);
            // Text
            c.fillStyle = '#fff';
            c.font = 'bold 13px "Segoe UI", sans-serif';
            c.fillText(n.text, x + 36, n.y + h/2);
            c.restore();
        }
    }

    // ── FLOATING TEXT SYSTEM (dopamine: +10 gold, -5 troops floating up) ──
    addFloat(text, x, y, color = '#ffd700', size = 16, duration = 60) {
        this.floats.push({ text, x, y, oy: y, color, size, timer: 0, maxTimer: duration });
    }

    _drawFloats() {
        const c = this.ctx;
        for (let i = this.floats.length - 1; i >= 0; i--) {
            const f = this.floats[i];
            f.timer++;
            if (f.timer >= f.maxTimer) { this.floats.splice(i, 1); continue; }
            const progress = f.timer / f.maxTimer;
            // Float upward, fade out, slight scale
            f.y = f.oy - progress * 40;
            const alpha = 1 - progress;
            const scale = 1 + progress * 0.3;
            c.save();
            c.globalAlpha = alpha;
            c.font = `bold ${Math.round(f.size * scale)}px "Segoe UI", sans-serif`;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            // Shadow for readability
            c.shadowColor = f.color;
            c.shadowBlur = 6;
            c.fillStyle = f.color;
            c.fillText(f.text, f.x, f.y);
            c.restore();
        }
    }

    // ── AI TURN INDICATOR ──
    _drawAITurnIndicator() {
        const c = this.ctx, g = this.g;
        const progress = 1 - (g._autoEndTurnDelay / 30);
        const barW = 200, barH = 8;
        const barX = (g.W - barW) / 2, barY = g.H - 30;

        c.save();
        // Pulsing background
        const pulse = 0.5 + Math.sin(this.time * 0.15) * 0.3;
        c.fillStyle = `rgba(0,0,0,${0.4 + pulse * 0.2})`;
        this._rr(c, barX - 15, barY - 18, barW + 30, 35, 8);
        c.fill();

        // Text
        c.fillStyle = `rgba(255,255,255,${0.6 + pulse * 0.3})`;
        c.font = '10px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('ENEMY FORCES MOVING...', g.W / 2, barY - 6);

        // Progress bar
        c.fillStyle = 'rgba(50,50,50,0.8)';
        this._rr(c, barX, barY, barW, barH, 4); c.fill();

        const gr = c.createLinearGradient(barX, 0, barX + barW, 0);
        gr.addColorStop(0, '#e74c3c'); gr.addColorStop(1, '#f39c12');
        c.fillStyle = gr;
        this._rr(c, barX, barY, barW * progress, barH, 4); c.fill();

        // Glowing edge
        c.shadowColor = '#f39c12'; c.shadowBlur = 8;
        c.strokeStyle = 'rgba(243,156,18,0.6)'; c.lineWidth = 1;
        this._rr(c, barX, barY, barW, barH, 4); c.stroke();
        c.restore();
    }
}
