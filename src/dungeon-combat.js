// dungeon-combat.js — Enemy attack-back, boss encounters, dungeon HUD
// Lazy-loaded by renderer3d.js when entering interior to reduce parse budget.

import { Vector3, Color } from 'three';

const _AgentSystem = window.__agentSystem || { _notifications: [] };

/**
 * Update enemy attacks on player — call each frame in _updateInterior
 * @param {object} ctx - { playerPos, playerHP, playerMaxHP, playerDead, playerInvuln,
 *                         enemyMeshes, player mesh, _debris, g, sfx }
 * @returns {{ playerHP, playerDead, playerInvuln, bossEncountered, bossAlive }}
 */
export function updateEnemyCombat(ctx) {
    const { playerPos, playerHP, playerMaxHP, playerDead, playerInvuln,
            enemyMeshes, player, _debris, g, dungeonData,
            bossEncountered, bossAlive } = ctx;

    let hp = playerHP;
    let inv = playerInvuln;
    let dead = playerDead;
    let encountered = bossEncountered;
    let alive = bossAlive;

    if (inv > 0) inv--;
    if (!dead && inv <= 0 && enemyMeshes.length) {
        for (const em of enemyMeshes) {
            if (em.data.dead) continue;
            const dx = em.data.x - playerPos.x;
            const dz = em.data.z - playerPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const atkRange = em.data.isBoss ? 2.0 : 1.2;
            if (dist < atkRange && !em._atkCooldown) {
                em._atkCooldown = 120;
                const dmg = em.data.atk || 2;
                hp = Math.max(0, hp - dmg);
                inv = 30;
                _debris.spawn(new Vector3(playerPos.x, 0.5, playerPos.z), new Color(0xff0000), 4);
                _AgentSystem._notifications.push({
                    text: em.data.isBoss
                        ? `[${em.data.name}] strikes! -${dmg} HP`
                        : `[${em.data.type}] hits you! -${dmg} HP`,
                    color: '#ff4444', timer: 90,
                });
                if (g.sfx && typeof g.sfx.hit === 'function') g.sfx.hit();
                if (player) {
                    player.material.emissive.setHex(0xff0000);
                    setTimeout(() => { if (player) player.material.emissive.setHex(0x00ff66); }, 150);
                }
            }
            if (hp <= 0 && !dead) {
                dead = true;
                _AgentSystem._notifications.push({ text: 'YOU DIED! Dungeon failed...', color: '#ff0000', timer: 200 });
                setTimeout(() => ctx._exitInterior(), 2500);
            }
        }
    }

    // Tick cooldowns
    for (const em of enemyMeshes) { if (em._atkCooldown > 0) em._atkCooldown--; }

    // Boss encounter announcement
    if (!encountered && dungeonData && dungeonData.bossEmperor) {
        const boss = dungeonData.bossEmperor;
        const dx = boss.x - playerPos.x;
        const dz = boss.z - playerPos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 6.0) {
            encountered = true;
            _AgentSystem._notifications.push({
                text: `⚔️ BOSS ENCOUNTER: ${boss.name}, "${boss.title}" — ${boss.era}`,
                color: '#ffd700', timer: 240,
            });
            _AgentSystem._notifications.push({
                text: `"${boss.quote}"`,
                color: '#ff6600', timer: 240,
            });
        }
    }

    return { playerHP: hp, playerDead: dead, playerInvuln: inv, bossEncountered: encountered, bossAlive: alive };
}

/**
 * Draw the dungeon HUD overlay — player HP bar, boss info, enemy counter
 */
export function drawDungeonHUD(ctx2d, g, dungeonData, playerHP, playerMaxHP, playerDead) {
    if (!dungeonData) return;
    const c = ctx2d;
    const W = g.W, H = g.H;

    // ── Player HP Bar (bottom center) ──
    const hpBarW = 220, hpBarH = 20;
    const hpX = W / 2 - hpBarW / 2, hpY = H - 50;
    const hpFrac = Math.max(0, playerHP / playerMaxHP);
    const hpColor = hpFrac > 0.5 ? '#00ff66' : (hpFrac > 0.25 ? '#ffff00' : '#ff0000');

    c.save();
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.beginPath(); c.roundRect(hpX - 4, hpY - 20, hpBarW + 8, hpBarH + 28, 6); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1;
    c.beginPath(); c.roundRect(hpX - 4, hpY - 20, hpBarW + 8, hpBarH + 28, 6); c.stroke();

    c.fillStyle = '#fff'; c.font = 'bold 12px "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText('PLAYER', hpX + hpBarW / 2, hpY - 4);

    c.fillStyle = '#333';
    c.beginPath(); c.roundRect(hpX, hpY, hpBarW, hpBarH, 4); c.fill();
    c.fillStyle = hpColor;
    c.beginPath(); c.roundRect(hpX, hpY, hpBarW * hpFrac, hpBarH, 4); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 11px "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${playerHP} / ${playerMaxHP}`, hpX + hpBarW / 2, hpY + hpBarH / 2);

    if (playerDead) {
        c.fillStyle = 'rgba(255,0,0,0.3)';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#ff0000'; c.font = 'bold 48px Georgia, serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('YOU DIED', W / 2, H / 2);
        c.font = '16px "Segoe UI", sans-serif'; c.fillStyle = '#fcc';
        c.fillText('Retreating from dungeon...', W / 2, H / 2 + 40);
    }
    c.restore();

    // ── Boss Info Panel (top-left, below back button) ──
    const boss = dungeonData.bossEmperor;
    if (boss) {
        const bx = 12, by = 55;
        const bw = 280, bh = boss.isBoss && !boss.dead ? 72 : 28;
        c.save();
        c.fillStyle = boss.dead ? 'rgba(0,0,0,0.5)' : 'rgba(80,0,0,0.7)';
        c.beginPath(); c.roundRect(bx, by, bw, bh, 6); c.fill();
        c.strokeStyle = boss.dead ? 'rgba(100,100,100,0.4)' : 'rgba(255,100,0,0.6)';
        c.lineWidth = 1;
        c.beginPath(); c.roundRect(bx, by, bw, bh, 6); c.stroke();
        c.textAlign = 'left'; c.textBaseline = 'top';
        if (boss.dead) {
            c.fillStyle = '#888'; c.font = '13px "Segoe UI", sans-serif';
            c.fillText(`✝ ${boss.name} — Defeated`, bx + 10, by + 7);
        } else {
            c.fillStyle = '#ffd700'; c.font = 'bold 15px Georgia, serif';
            c.fillText(`${boss.name}`, bx + 10, by + 6);
            c.fillStyle = '#ff9966'; c.font = 'italic 11px Georgia, serif';
            c.fillText(`"${boss.title}" — ${boss.era}`, bx + 10, by + 24);
            const bFrac = boss.hp / boss.maxHp;
            const bBarW = bw - 20, bBarH = 12, bBarX = bx + 10, bBarY = by + 42;
            c.fillStyle = '#333';
            c.beginPath(); c.roundRect(bBarX, bBarY, bBarW, bBarH, 3); c.fill();
            c.fillStyle = bFrac > 0.5 ? '#ff6600' : (bFrac > 0.25 ? '#ff3300' : '#cc0000');
            c.beginPath(); c.roundRect(bBarX, bBarY, bBarW * bFrac, bBarH, 3); c.fill();
            c.fillStyle = '#fff'; c.font = 'bold 9px monospace';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(`${boss.hp} / ${boss.maxHp}`, bBarX + bBarW / 2, bBarY + bBarH / 2);
        }
        c.restore();
    }

    // ── Enemy counter (top center) ──
    const aliveCount = dungeonData.enemies.filter(e => !e.dead).length;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.beginPath(); c.roundRect(W / 2 - 50, 6, 100, 22, 6); c.fill();
    c.fillStyle = aliveCount > 0 ? '#ff4444' : '#00ff66';
    c.font = 'bold 11px "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`Enemies: ${aliveCount}`, W / 2, 17);
    c.restore();
}
