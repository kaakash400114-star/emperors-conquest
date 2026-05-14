/**
 * renderer.js — The Visual Layer
 *
 * Draws everything the player sees. This file is the BIGGEST because
 * there's a lot to render: map, territories, troops, UI panels, combat
 * animations, fog of war for unexplored areas, etc.
 *
 * Key principle: The renderer NEVER modifies game state. It only reads.
 * This is called "read-only rendering" and it prevents entire categories
 * of bugs where drawing code accidentally changes game data.
 */

import { MAP_WIDTH, MAP_HEIGHT, TERRITORY_RADIUS, TERRITORIES, EMPIRES, getTerritory } from './map.js';

export class Renderer {
    constructor(game) {
        this.game = game;
        this.ctx = game.canvas.getContext('2d');
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Animation state
        this.flashTimer = 0;
        this.shakeAmount = 0;
        this.combatAnim = null; // { rounds, timer, attacker, defender }
        this.particles = [];

        // Pre-computed background
        this._bgCanvas = null;
    }

    // ── Coordinate transforms (virtual map → screen) ──────────

    _recalcLayout() {
        const { width, height } = this.game;
        const scaleX = (width * 0.92) / MAP_WIDTH;
        const scaleY = (height * 0.88) / MAP_HEIGHT;
        this.scale = Math.min(scaleX, scaleY);
        this.offsetX = (width - MAP_WIDTH * this.scale) / 2;
        this.offsetY = (height - MAP_HEIGHT * this.scale) / 2 + 10;
    }

    toScreen(x, y) {
        return {
            x: x * this.scale + this.offsetX,
            y: y * this.scale + this.offsetY,
        };
    }

    toMap(sx, sy) {
        return {
            x: (sx - this.offsetX) / this.scale,
            y: (sy - this.offsetY) / this.scale,
        };
    }

    // ── Main render ───────────────────────────────────────────

    render() {
        this._recalcLayout();
        const { ctx } = this;

        // Screen shake
        if (this.shakeAmount > 0.5) {
            ctx.save();
            ctx.translate(
                (Math.random() - 0.5) * this.shakeAmount * 2,
                (Math.random() - 0.5) * this.shakeAmount * 2
            );
            this.shakeAmount *= 0.88;
        }

        this._drawBackground();
        this._drawConnections();
        this._drawTerritories();
        this._drawParticles();

        if (this.shakeAmount > 0.5) {
            ctx.restore();
        }

        this._drawUI();
        this._drawCombatOverlay();
        this._drawLog();
    }

    // ── Background ────────────────────────────────────────────

    _drawBackground() {
        const { ctx, game } = this;
        const { width, height } = game;

        // Parchment-like gradient
        const grad = ctx.createRadialGradient(width / 2, height / 2, 100, width / 2, height / 2, width * 0.7);
        grad.addColorStop(0, '#2c1810');
        grad.addColorStop(0.5, '#1f120b');
        grad.addColorStop(1, '#0f0a06');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Decorative border
        const borderColor = '#4a3525';
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(8, 8, width - 16, height - 16);
        ctx.strokeStyle = '#3a2515';
        ctx.lineWidth = 1;
        ctx.strokeRect(12, 12, width - 24, height - 24);
    }

    // ── Territory Connections (lines between adjacent territories) ──

    _drawConnections() {
        const { ctx, game } = this;

        for (const t of TERRITORIES) {
            const from = this.toScreen(t.cx, t.cy);
            for (const adjId of t.adj) {
                if (adjId <= t.id) continue; // Draw each line once
                const adj = TERRITORIES[adjId];
                const to = this.toScreen(adj.cx, adj.cy);

                // Both owned by same empire? Draw stronger line.
                const state = game.tStates[t.id];
                const adjState = game.tStates[adjId];

                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);

                if (state.owner && state.owner === adjState.owner) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                    ctx.lineWidth = 3 * this.scale;
                } else {
                    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                    ctx.lineWidth = 1.5 * this.scale;
                }
                ctx.stroke();
            }
        }
    }

    // ── Territories ───────────────────────────────────────────

    _drawTerritories() {
        const { ctx, game } = this;
        const selected = game.selectedTerritory;
        const hovered = game.hoveredTerritory;
        const phase = game.phase;

        for (const t of TERRITORIES) {
            const state = game.tStates[t.id];
            const pos = this.toScreen(t.cx, t.cy);
            const r = TERRITORY_RADIUS * this.scale;
            const empire = state.owner ? EMPIRES[state.owner] : null;
            const isSelected = selected === t.id;
            const isHovered = hovered === t.id;
            const isTarget = phase === 'selectAttackTarget' && selected !== null &&
                game.tStates[selected].owner !== null &&
                getTerritory(selected).adj.includes(t.id) && state.owner !== game.playerEmpire;

            // Glow for selected
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, r + 6 * this.scale, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
                ctx.fill();
            }

            // Attack target highlight
            if (isTarget) {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, r + 5 * this.scale, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(231, 76, 60, 0.3 + Math.sin(Date.now() * 0.005) * 0.15)';
                ctx.fill();
            }

            // Hover highlight
            if (isHovered && !isSelected) {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, r + 4 * this.scale, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fill();
            }

            // Territory circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);

            if (empire) {
                // Owned territory — fill with empire color
                const grad = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, 0, pos.x, pos.y, r);
                grad.addColorStop(0, empire.light);
                grad.addColorStop(1, empire.dark);
                ctx.fillStyle = grad;
            } else {
                // Neutral — grey
                ctx.fillStyle = '#555';
            }
            ctx.fill();

            // Border
            ctx.strokeStyle = isSelected ? '#ffd700' : (isHovered ? '#ccc' : 'rgba(255,255,255,0.25)');
            ctx.lineWidth = (isSelected ? 3 : 1.5) * this.scale;
            ctx.stroke();

            // Terrain icon (small symbol)
            this._drawTerrainIcon(ctx, pos.x, pos.y - r * 0.15, t.terrain, r);

            // Troop count
            ctx.fillStyle = empire ? empire.text : '#fff';
            ctx.font = `bold ${Math.round(18 * this.scale)}px "Segoe UI", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(state.troops.toString(), pos.x, pos.y + r * 0.35);

            // Territory name (small, below)
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = `${Math.round(9 * this.scale)}px "Segoe UI", Arial, sans-serif`;
            ctx.fillText(t.name, pos.x, pos.y + r + 10 * this.scale);

            // Empire name tag (above, if owned)
            if (empire && (isSelected || isHovered)) {
                ctx.fillStyle = empire.color;
                ctx.font = `bold ${Math.round(10 * this.scale)}px "Segoe UI", Arial, sans-serif`;
                ctx.fillText(empire.name, pos.x, pos.y - r - 8 * this.scale);
            }
        }
    }

    _drawTerrainIcon(ctx, x, y, terrain, r) {
        const s = r * 0.3;
        ctx.save();
        ctx.globalAlpha = 0.3;
        switch (terrain) {
            case 'mountains':
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(x - s, y + s * 0.5);
                ctx.lineTo(x, y - s);
                ctx.lineTo(x + s, y + s * 0.5);
                ctx.closePath();
                ctx.fill();
                break;
            case 'desert':
                ctx.fillStyle = '#f4d03f';
                ctx.fillRect(x - s * 0.5, y - s * 0.3, s, s * 0.6);
                break;
            case 'forest':
                ctx.fillStyle = '#2ecc71';
                ctx.beginPath();
                ctx.arc(x, y - s * 0.2, s * 0.6, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'island':
            case 'coast':
            case 'peninsula':
            case 'mediterranean':
                ctx.strokeStyle = '#3498db';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
                ctx.stroke();
                break;
            default:
                ctx.fillStyle = '#27ae60';
                ctx.fillRect(x - s * 0.3, y, s * 0.6, s * 0.4);
        }
        ctx.restore();
    }

    // ── UI Panel ──────────────────────────────────────────────

    _drawUI() {
        const { ctx, game } = this;
        const { width } = game;

        // Top bar — empire info
        this._drawTopBar(ctx, width);

        // Phase instructions
        this._drawPhaseInfo(ctx, width);

        // Action buttons
        this._drawButtons(ctx, width);
    }

    _drawTopBar(ctx, width) {
        const { game } = this;
        const empire = game.empires[game.playerEmpire];
        const empireData = EMPIRES[game.playerEmpire];

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, width, 52);

        // Empire name + color
        ctx.fillStyle = empireData.color;
        ctx.fillRect(12, 8, 6, 36);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(empireData.name, 26, 20);

        // Stats
        ctx.font = '13px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`Gold: ${empire.gold}`, 26, 40);
        ctx.fillStyle = '#e74c3c';
        ctx.fillText(`Territories: ${empire.territoryIds.length}`, 140, 40);
        ctx.fillStyle = '#aaa';
        ctx.fillText(`Troops: ${empire.totalTroops()}`, 300, 40);

        // Turn number
        ctx.textAlign = 'right';
        ctx.fillStyle = '#888';
        ctx.font = '13px "Segoe UI", Arial, sans-serif';
        ctx.fillText(`Turn ${game.turnNumber}`, width - 16, 20);

        // Phase indicator
        ctx.fillStyle = '#ffd700';
        ctx.fillText(game.phaseLabel(), width - 16, 40);
    }

    _drawPhaseInfo(ctx, width) {
        const { game } = this;
        const msg = game.phaseMessage();

        if (!msg) return;

        // Bottom instruction bar
        const barH = 36;
        const barY = game.height - barH - 8;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this._roundRect(ctx, 16, barY, width - 32, barH, 6);
        ctx.fill();

        ctx.fillStyle = '#ddd';
        ctx.font = '14px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(msg, width / 2, barY + barH / 2);
    }

    _drawButtons(ctx, width) {
        const { game } = this;
        const buttons = game.getButtons();

        const btnY = 60;
        const btnH = 34;
        const startX = 16;
        const gap = 10;

        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let x = startX;
        for (const btn of buttons) {
            const textW = ctx.measureText(btn.label).width + 24;
            btn._rect = { x, y: btnY, w: textW, h: btnH };

            // Button background
            ctx.fillStyle = btn.active ? '#c0392b' : '#333';
            this._roundRect(ctx, x, btnY, textW, btnH, 5);
            ctx.fill();

            ctx.strokeStyle = btn.active ? '#e74c3c' : '#555';
            ctx.lineWidth = 1;
            this._roundRect(ctx, x, btnY, textW, btnH, 5);
            ctx.stroke();

            // Label
            ctx.fillStyle = btn.active ? '#fff' : '#aaa';
            ctx.fillText(btn.label, x + textW / 2, btnY + btnH / 2);

            x += textW + gap;
        }
    }

    // ── Combat Overlay ────────────────────────────────────────

    _drawCombatOverlay() {
        const { ctx, game } = this;
        const anim = this.combatAnim;
        if (!anim) return;

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, game.width, game.height);

        const cx = game.width / 2;
        const cy = game.height / 2;

        // Battle title
        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BATTLE', cx, cy - 100);

        // Attacker info
        const atkEmpire = EMPIRES[anim.attacker];
        ctx.fillStyle = atkEmpire.color;
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.fillText(atkEmpire.name, cx - 120, cy - 60);

        // VS
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
        ctx.fillText('VS', cx, cy - 55);

        // Defender info
        const defEmpire = anim.defender ? EMPIRES[anim.defender] : null;
        ctx.fillStyle = defEmpire ? defEmpire.color : '#888';
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.fillText(defEmpire ? defEmpire.name : 'Neutral', cx + 120, cy - 60);

        // Dice results
        const result = anim.result;
        if (result) {
            // Attacker dice
            ctx.font = '16px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#aaa';
            ctx.fillText('Attack Dice', cx - 120, cy - 20);

            let diceY = cy + 5;
            for (let i = 0; i < result.atkRolls.length; i++) {
                const roundResult = result.roundResults[i];
                const won = roundResult && roundResult.winner === 'attacker';
                this._drawDie(ctx, cx - 155 + i * 35, diceY, 28, result.atkRolls[i], won ? '#2ecc71' : '#e74c3c');
            }

            // Defender dice
            ctx.fillStyle = '#aaa';
            ctx.fillText('Defense Dice', cx + 120, cy - 20);

            for (let i = 0; i < result.defRolls.length; i++) {
                const roundResult = result.roundResults[i];
                const won = roundResult && roundResult.winner === 'defender';
                this._drawDie(ctx, cx + 85 + i * 35, diceY, 28, result.defRolls[i], won ? '#2ecc71' : '#e74c3c');
            }

            // Result text
            const resultY = cy + 60;
            ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
            if (result.conquered) {
                ctx.fillStyle = '#ffd700';
                ctx.fillText('TERRITORY CONQUERED!', cx, resultY);
            } else {
                ctx.fillStyle = '#e74c3c';
                ctx.fillText(`Attackers lost ${result.atkLosses} | Defenders lost ${result.defLosses}`, cx, resultY);
            }

            // Losses detail
            ctx.font = '14px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#aaa';
            ctx.fillText(`Attacker: ${result.attackerSurvivors} remaining | Defender: ${result.defenderSurvivors} remaining`, cx, resultY + 28);
        }
    }

    _drawDie(ctx, x, y, size, value, color) {
        ctx.fillStyle = color;
        this._roundRect(ctx, x, y, size, size, 4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${size * 0.55}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toString(), x + size / 2, y + size / 2);
    }

    // ── Game Log ──────────────────────────────────────────────

    _drawLog() {
        const { ctx, game } = this;
        const log = game.log;
        if (log.length === 0) return;

        const x = game.width - 16;
        let y = game.height - 56;
        const maxLines = 5;
        const start = Math.max(0, log.length - maxLines);

        ctx.textAlign = 'right';
        ctx.font = '12px "Segoe UI", Arial, sans-serif';

        for (let i = log.length - 1; i >= start; i--) {
            const entry = log[i];
            const age = log.length - 1 - i;
            const alpha = Math.max(0.2, 1 - age * 0.2);
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillText(entry, x, y);
            y -= 18;
        }
    }

    // ── Particles ─────────────────────────────────────────────

    spawnParticles(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4 - 2,
                size: 2 + Math.random() * 3,
                life: 1,
                decay: 0.02 + Math.random() * 0.02,
                color,
            });
        }
    }

    _drawParticles() {
        const { ctx } = this;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            p.life -= p.decay;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }

            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    }

    // ── Helpers ───────────────────────────────────────────────

    _roundRect(ctx, x, y, w, h, r) {
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
    }

    /** Get territory at screen position, or -1 */
    territoryAtScreen(sx, sy) {
        const map = this.toMap(sx, sy);
        for (const t of TERRITORIES) {
            const dx = map.x - t.cx;
            const dy = map.y - t.cy;
            if (dx * dx + dy * dy < TERRITORY_RADIUS * TERRITORY_RADIUS) {
                return t.id;
            }
        }
        return -1;
    }

    /** Get clicked button, or null */
    buttonAtScreen(sx, sy) {
        const buttons = this.game.getButtons();
        for (const btn of buttons) {
            if (!btn._rect) continue;
            const r = btn._rect;
            if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
                return btn;
            }
        }
        return null;
    }
}
