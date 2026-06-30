/**
 * ui-panels.js — Canvas-drawn UI panels for Emperor's Conquest new systems
 * Tech Tree, Builder, Siege, Diplomacy, Customize, Profile screens.
 * Each function draws a full-screen panel and registers click buttons on g.btns.
 */

import { TERRITORIES, EMPIRES, E, T, EIDS } from './map.js';
import { COUNTRIES } from './countries.js';
import { RESOURCE_KEYS, RESOURCES, TERRAIN_PRODUCTION, BUILDINGS, BUILDING_KEYS, calcTerritoryProduction } from './resources.js';
import { ERAS, ERA_ORDER, TECHS, getTechBonuses, ERA_BONUSES } from './techtree.js';
import { BLOCKS, BLOCK_KEYS, BLUEPRINTS, BLUEPRINT_KEYS, BUILDER_GRID, ISO, drawBlock } from './builder.js';
import { SIEGE_WEAPONS, FORMATIONS, FORMATION_KEYS, FORT_LEVELS, SIEGE_TERRAIN_MODS, resolveSiege } from './siege.js';
import { HEROES, COLOR_PALETTES, FLAG_PATTERNS, TITLES, getTitle, drawFlag } from './empire-custom.js';
import { WEATHER_TYPES } from './procedural.js';
import { ALLIANCE_TYPES, DIPLOMACY, AI_PERSONALITIES, RANK_TIERS, getRank, ACHIEVEMENTS } from './social.js';
import { xpForNextLevel, UNLOCKABLES, LEVEL_THRESHOLDS } from './persistence.js';

// ═══════════════════════════════════════════════════════════════
//  SHARED HELPERS
// ═══════════════════════════════════════════════════════════════

function _panel(c, g, title, icon) {
  // Full-screen dark panel
  c.fillStyle = '#0a0e14';
  c.fillRect(0, 0, g.W, g.H);
  // Header bar
  c.fillStyle = 'rgba(255,215,0,0.1)';
  c.fillRect(0, 0, g.W, 52);
  c.strokeStyle = 'rgba(255,215,0,0.3)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, 52); c.lineTo(g.W, 52); c.stroke();
  c.font = 'bold 18px Georgia, serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd700';
  c.fillText(`${icon || ''} ${title}`, g.W / 2, 26);
}

function _btn(c, g, x, y, w, h, text, color = '#ffd700', enabled = true) {
  c.fillStyle = enabled ? 'rgba(255,215,0,0.15)' : 'rgba(100,100,100,0.15)';
  c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill();
  c.strokeStyle = enabled ? color : 'rgba(100,100,100,0.4)';
  c.lineWidth = 1;
  c.beginPath(); c.roundRect(x, y, w, h, 6); c.stroke();
  c.font = `bold ${h < 30 ? 11 : 13}px "Segoe UI", sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = enabled ? color : '#666';
  c.fillText(text, x + w / 2, y + h / 2);
}

function _backBtn(c, g) {
  _btn(c, g, 12, 10, 80, 32, '← Back', '#aaa');
  g.btns.push({ label: 'Back', rect: { x: 12, y: 10, w: 80, h: 32 }, fn: () => { g.state = 'playing'; g.phase = 'select'; g.sel = null; } });
}

function _row(c, x, y, w, h, label, value, color = '#fff') {
  c.fillStyle = 'rgba(255,255,255,0.03)';
  c.fillRect(x, y, w, h);
  c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = '#aaa'; c.fillText(label, x + 8, y + h / 2);
  c.textAlign = 'right';
  c.fillStyle = color; c.fillText(String(value), x + w - 8, y + h / 2);
}

function _scrollClip(c, x, y, w, h) {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
}

function _scrollUnclip(c) {
  c.restore();
}

// ═══════════════════════════════════════════════════════════════
//  TECH TREE SCREEN
// ═══════════════════════════════════════════════════════════════
export function drawTechTree(c, g) {
  _panel(c, g, 'Technology Tree', '🔬');
  _backBtn(c, g);

  const emp = g.empires[g.player];
  if (!emp) return;
  const era = emp.era || 'bronze';
  const techBon = getTechBonuses(emp.researchedTechs || []);
  const scrollY = g._uiScrollY || 0;

  // Era tabs
  const tabW = 100, tabH = 36, tabX = (g.W - ERA_ORDER.length * (tabW + 8)) / 2, tabY = 62;
  for (let i = 0; i < ERA_ORDER.length; i++) {
    const eId = ERA_ORDER[i];
    const eDef = ERAS[eId];
    const isActive = eId === era;
    const isUnlocked = ERA_ORDER.indexOf(eId) <= ERA_ORDER.indexOf(era);
    _btn(c, g, tabX + i * (tabW + 8), tabY, tabW, tabH, `${eDef.icon} ${eDef.name}`, isUnlocked ? eDef.color : '#555', isUnlocked);
    if (isUnlocked) {
      g.btns.push({ rect: { x: tabX + i * (tabW + 8), y: tabY, w: tabW, h: tabH }, fn: () => { g._uiSelectedEra = eId; } });
    }
  }

  // Current era indicator
  const selEra = g._uiSelectedEra || era;
  c.font = '12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
  c.fillStyle = '#888';
  c.fillText(`Viewing: ${ERAS[selEra].icon} ${ERAS[selEra].name}`, g.W / 2, tabY + tabH + 6);

  // Tech bonuses summary
  const sumY = tabY + tabH + 24;
  c.fillStyle = 'rgba(0,0,0,0.4)';
  c.beginPath(); c.roundRect(20, sumY, g.W - 40, 28, 4); c.fill();
  c.font = '11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#8af';
  const bonusText = `⚔️ATK+${techBon.attackBonus} 🛡️DEF+${techBon.defenseBonus} 💰GOLD+${techBon.goldPerTerritory}/t 🏰SIEGE+${techBon.siegeAttack}`;
  c.fillText(bonusText, g.W / 2, sumY + 14);

  // Tech list for selected era
  const techs = TECHS[selEra] || [];
  const listY = sumY + 40;
  const listH = g.H - listY - 60;
  _scrollClip(c, 10, listY, g.W - 20, listH);

  for (let i = 0; i < techs.length; i++) {
    const t = techs[i];
    const researched = (emp.researchedTechs || []).includes(t.id);
    const isCurrent = emp.currentResearch === t.id;
    const canAfford = emp.coins >= t.cost;
    const cy = listY + i * 72 + scrollY;

    if (cy < listY - 72 || cy > listY + listH) continue;

    // Card background
    c.fillStyle = researched ? 'rgba(0,150,0,0.15)' : isCurrent ? 'rgba(0,100,255,0.2)' : 'rgba(255,255,255,0.04)';
    c.beginPath(); c.roundRect(20, cy, g.W - 40, 64, 8); c.fill();
    c.strokeStyle = researched ? '#0a0' : isCurrent ? '#08f' : 'rgba(255,255,255,0.1)';
    c.lineWidth = 1;
    c.beginPath(); c.roundRect(20, cy, g.W - 40, 64, 8); c.stroke();

    // Icon + name
    c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = researched ? '#0f0' : '#ffd700';
    c.fillText(`${t.icon} ${t.name}`, 32, cy + 8);

    // Status badge
    if (researched) {
      c.fillStyle = 'rgba(0,200,0,0.8)'; c.font = '10px sans-serif';
      c.fillText('✓ RESERARCHED', g.W - 160, cy + 10);
    } else if (isCurrent) {
      c.fillStyle = '#08f'; c.font = '10px sans-serif';
      const pct = Math.round((emp.researchProgress / t.turns) * 100);
      c.fillText(`⏳ ${pct}% (${emp.researchProgress}/${t.turns} turns)`, g.W - 200, cy + 10);
      // Progress bar
      c.fillStyle = 'rgba(0,100,255,0.3)';
      c.fillRect(32, cy + 50, g.W - 84, 6);
      c.fillStyle = 'rgba(0,150,255,0.7)';
      c.fillRect(32, cy + 50, (g.W - 84) * pct / 100, 6);
    }

    // Description
    c.font = '11px sans-serif'; c.fillStyle = '#aaa';
    c.fillText(t.desc, 32, cy + 28);

    // Cost + research button
    if (!researched && !isCurrent) {
      c.fillStyle = '#ffd700'; c.font = '11px sans-serif'; c.textAlign = 'right';
      c.fillText(`💰${t.cost} coins  ⏱️${t.turns} turns`, g.W - 140, cy + 48);
      c.textAlign = 'left';
      if (canAfford) {
        const bx = g.W - 100, by = cy + 38, bw = 68, bh = 22;
        _btn(c, g, bx, by, bw, bh, 'Research', '#ffd700', true);
        g.btns.push({ rect: { x: bx, y: by, w: bw, h: bh }, fn: () => { g._startResearch(t.id); } });
      }
    }
  }

  _scrollUnclip(c);

  // Current research indicator
  if (emp.currentResearch) {
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.beginPath(); c.roundRect(g.W / 2 - 150, g.H - 48, 300, 36, 6); c.fill();
    c.font = '12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#08f';
    const td = g._findTechDef(emp.currentResearch);
    if (td) c.fillText(`Researching: ${td.icon} ${td.name} — ${emp.researchProgress}/${td.turns}`, g.W / 2, g.H - 30);
  }
}

// ═══════════════════════════════════════════════════════════════
//  BUILDER SCREEN
// ═══════════════════════════════════════════════════════════════
export function drawBuilder(c, g) {
  _panel(c, g, 'Territory Builder', '🏗️');
  _backBtn(c, g);

  if (!g.sel && g.sel !== 0) {
    c.font = '16px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#888';
    c.fillText('Select a territory first on the map', g.W / 2, g.H / 2);
    return;
  }

  const tid = g.sel;
  const ts = g.ts[tid];
  const t = g._activeTerritories?.[tid] || T(tid);

  if (!ts || ts.owner !== g.player) {
    c.font = '16px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#c44';
    c.fillText(`You don't own ${t.name}!`, g.W / 2, g.H / 2);
    return;
  }

  // Isometric grid area
  const gridCx = g.W * 0.45, gridCy = g.H * 0.45;
  const bs = g._uiBuilderScale || 14;
  const gridSize = BUILDER_GRID.w;

  // Draw existing blocks
  const blocks = ts.builderBlocks || [];
  const sorted = ISO.drawOrder(blocks);
  for (const b of sorted) {
    const sc = ISO.toScreen(b.x, b.y, b.z, gridCx, gridCy, bs);
    drawBlock(c, sc.sx, sc.sy, b.type, bs);
  }

  // Grid floor hint
  c.globalAlpha = 0.08;
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const sc = ISO.toScreen(x, 0, z, gridCx, gridCy, bs);
      drawBlock(c, sc.sx, sc.sy, 'grass', bs);
    }
  }
  c.globalAlpha = 1;

  // Block palette (left side)
  const palX = 8, palY = 62;
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.roundRect(palX, palY, 58, BLOCK_KEYS.length * 32 + 30, 6); c.fill();
  c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffd700';
  c.fillText('BLOCKS', palX + 29, palY + 12);

  for (let i = 0; i < BLOCK_KEYS.length; i++) {
    const bk = BLOCK_KEYS[i];
    const bDef = BLOCKS[bk];
    const bx = palX + 4, by = palY + 24 + i * 32;
    const selected = g._uiSelectedBlock === bk;
    c.fillStyle = selected ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.05)';
    c.beginPath(); c.roundRect(bx, by, 50, 28, 4); c.fill();
    if (selected) { c.strokeStyle = '#ffd700'; c.lineWidth = 1; c.beginPath(); c.roundRect(bx, by, 50, 28, 4); c.stroke(); }
    c.font = '14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = bDef.color;
    c.fillText(bDef.icon, bx + 16, by + 14);
    c.font = '9px sans-serif'; c.fillStyle = '#ccc';
    c.fillText(bDef.name.slice(0, 5), bx + 35, by + 14);
    g.btns.push({ rect: { x: bx, y: by, w: 50, h: 28 }, fn: () => { g._uiSelectedBlock = bk; } });
  }

  // Blueprint quick-build (right side)
  const bpX = g.W - 120, bpY = 62;
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.roundRect(bpX, bpY, 112, BLUEPRINT_KEYS.length * 32 + 30, 6); c.fill();
  c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffd700';
  c.fillText('BLUEPRINTS', bpX + 56, bpY + 12);

  for (let i = 0; i < BLUEPRINT_KEYS.length; i++) {
    const bk = BLUEPRINT_KEYS[i];
    const bDef = BLUEPRINTS[bk];
    const bx = bpX + 4, by = bpY + 24 + i * 32;
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.beginPath(); c.roundRect(bx, by, 104, 28, 4); c.fill();
    c.font = '13px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`${bDef.icon} ${bDef.name}`, bx + 4, by + 14);
    c.font = '8px sans-serif'; c.fillStyle = '#888';
    c.textAlign = 'right';
    const costStr = Object.entries(bDef.cost).map(([r, v]) => `${v}${r.slice(0, 2)}`).join(' ');
    c.fillText(costStr, bx + 102, by + 14);
    g.btns.push({ rect: { x: bx, y: by, w: 104, h: 28 }, fn: () => {
      const newBlocks = BLUEPRINTS[bk].blocks.map(b => ({
        x: b.x + gridSize / 2 - 3, y: b.y, z: b.z + gridSize / 2 - 3, type: b.type
      }));
      ts.builderBlocks = [...(ts.builderBlocks || []), ...newBlocks];
      g._log(`🏗️ Placed ${bDef.name} blueprint`);
    } });
  }

  // Clear button
  const clrX = g.W - 120, clrY = g.H - 50;
  _btn(c, g, clrX, clrY, 100, 32, '🗑️ Clear All', '#c44');
  g.btns.push({ rect: { x: clrX, y: clrY, w: 100, h: 32 }, fn: () => { ts.builderBlocks = []; } });

  // Info
  c.font = '11px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#888';
  c.fillText(`${t.name} — ${blocks.length} blocks placed | Click grid to place blocks`, palX, g.H - 14);
}

// ═══════════════════════════════════════════════════════════════
//  SIEGE SCREEN
// ═══════════════════════════════════════════════════════════════
export function drawSiege(c, g) {
  _panel(c, g, 'Siege Warfare', '💣');
  _backBtn(c, g);

  const emp = g.empires[g.player];
  if (!emp) return;

  // Target territory
  const tid = g._attackTarget;
  if (tid == null || tid < 0) {
    c.font = '16px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#888';
    c.fillText('Select an enemy territory to siege', g.W / 2, g.H / 2);
    return;
  }

  const t = g._activeTerritories?.[tid] || T(tid);
  const ts = g.ts[tid];

  // Target info
  c.fillStyle = 'rgba(0,0,0,0.4)';
  c.beginPath(); c.roundRect(20, 62, g.W - 40, 60, 8); c.fill();
  c.font = 'bold 16px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText(`🏰 Siege Target: ${t.name}`, 32, 84);
  c.font = '12px sans-serif'; c.fillStyle = '#aaa';
  c.fillText(`Owner: ${ts.owner ? (g.empires?.[ts.owner] || E(ts.owner))?.name || 'Neutral' : 'Neutral'}  |  Troops: ${ts.troops}  |  Terrain: ${t?.terrain || '?'}  |  Fort Level: ${ts.fortLevel || 0}`, 32, 106);

  const terrainMod = SIEGE_TERRAIN_MODS[t.terrain] || SIEGE_TERRAIN_MODS.plains;
  c.fillStyle = '#8af'; c.fillText(`Terrain mod: ATK ${terrainMod.atkBonus >= 0 ? '+' : ''}${terrainMod.atkBonus}  DEF ${terrainMod.defBonus >= 0 ? '+' : ''}${terrainMod.defBonus}`, 32, 110);

  // Siege weapons panel (left)
  const wpX = 20, wpY = 140;
  c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText('⚔️ Siege Weapons:', wpX, wpY);
  const swKeys = Object.keys(SIEGE_WEAPONS);
  for (let i = 0; i < swKeys.length; i++) {
    const swId = swKeys[i];
    const sw = SIEGE_WEAPONS[swId];
    const equipped = (emp.siegeWeapons || []).includes(swId);
    const by = wpY + 20 + i * 42;
    c.fillStyle = equipped ? 'rgba(255,100,0,0.15)' : 'rgba(255,255,255,0.04)';
    c.beginPath(); c.roundRect(wpX, by, 260, 38, 6); c.fill();
    if (equipped) { c.strokeStyle = '#f80'; c.lineWidth = 1; c.beginPath(); c.roundRect(wpX, by, 260, 38, 6); c.stroke(); }
    c.font = '13px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#fff';
    c.fillText(`${sw.icon} ${sw.name}`, wpX + 8, by + 14);
    c.font = '10px sans-serif'; c.fillStyle = '#aaa';
    c.fillText(`ATK+${sw.atk} HP+${sw.hp} RNG+${sw.range} | ${sw.desc}`, wpX + 8, by + 30);
    if (!equipped) {
      const costStr = Object.entries(sw.cost).map(([r, v]) => `${v}${r.slice(0, 2)}`).join(' ');
      c.fillStyle = '#888'; c.textAlign = 'right';
      c.fillText(costStr, wpX + 252, by + 22);
      c.textAlign = 'left';
    }
    g.btns.push({ rect: { x: wpX, y: by, w: 260, h: 38 }, fn: () => {
      if (equipped) { emp.siegeWeapons = (emp.siegeWeapons || []).filter(w => w !== swId); }
      else { if (!emp.siegeWeapons) emp.siegeWeapons = []; emp.siegeWeapons.push(swId); }
    } });
  }

  // Formation panel (right)
  const fpX = 300, fpY = 140;
  c.font = 'bold 14px sans-serif'; c.fillStyle = '#ffd700';
  c.fillText('🛡️ Formations:', fpX, fpY);
  for (let i = 0; i < FORMATION_KEYS.length; i++) {
    const fId = FORMATION_KEYS[i];
    const f = FORMATIONS[fId];
    const selected = (emp.formation || 'line') === fId;
    const by = fpY + 20 + i * 38;
    c.fillStyle = selected ? 'rgba(0,150,255,0.2)' : 'rgba(255,255,255,0.04)';
    c.beginPath(); c.roundRect(fpX, by, 240, 34, 6); c.fill();
    if (selected) { c.strokeStyle = '#08f'; c.lineWidth = 1; c.beginPath(); c.roundRect(fpX, by, 240, 34, 6); c.stroke(); }
    c.font = '12px sans-serif'; c.fillStyle = '#fff';
    c.fillText(`${f.icon} ${f.name}`, fpX + 8, by + 14);
    c.font = '10px sans-serif'; c.fillStyle = '#aaa';
    c.fillText(`ATK×${f.atkMod} DEF×${f.defMod} — ${f.desc}`, fpX + 8, by + 28);
    g.btns.push({ rect: { x: fpX, y: by, w: 240, h: 34 }, fn: () => { emp.formation = fId; } });
  }

  // Launch siege button
  const launchY = g.H - 70;
  const adjTids = (g._activeTerritories?.[g.sel !== null ? g.sel : 0] || T(g.sel !== null ? g.sel : 0))?.adj || [];
  const canSiege = adjTids.includes(tid);
  _btn(c, g, g.W / 2 - 100, launchY, 200, 44, '💥 Launch Siege!', canSiege ? '#f80' : '#555', canSiege);
  if (canSiege) {
    g.btns.push({ rect: { x: g.W / 2 - 100, y: launchY, w: 200, h: 44 }, fn: () => {
      const result = resolveSiege(
        { troops: g.ts[g.sel !== null ? g.sel : 0].troops },
        { troops: ts.troops },
        t.terrain,
        { siegeWeapons: emp.siegeWeapons || [], formation: emp.formation || 'line' }
      );
      g._log(`⚔️ Siege ${result.won ? 'VICTORY' : 'DEFEAT'} — ATK:${result.atkPower} vs DEF:${result.defPower}`);
      if (result.won) {
        const oldOwner = ts.owner;
        if (oldOwner) { g.empires[oldOwner].tids = g.empires[oldOwner].tids.filter(t => t !== tid); }
        ts.owner = g.player;
        emp.tids.push(tid);
        ts.troops = Math.max(1, ts.troops - result.defenderLoss);
        g.stats.conquered++;
      } else {
        g.ts[g.sel !== null ? g.sel : 0].troops = Math.max(1, g.ts[g.sel !== null ? g.sel : 0].troops - result.attackerLoss);
      }
      g.state = 'playing';
    } });
  }
}

// ═══════════════════════════════════════════════════════════════
//  DIPLOMACY SCREEN
// ═══════════════════════════════════════════════════════════════
export function drawDiplomacy(c, g) {
  _panel(c, g, 'Diplomacy', '🤝');
  _backBtn(c, g);

  const emp = g.empires[g.player];
  if (!emp) return;

  // Empire list with diplomacy options
  const listX = 20, listY = 62;
  let cy = listY;

  // Your alliances
  c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText('🤝 Your Relationships:', listX, cy); cy += 24;

  for (const eid of EIDS) {
    if (eid === g.player) continue;
    const e = g.empires[eid];
    if (!e?.alive) continue;
    const eDef = g.empires?.[eid] || E(eid);
    const alliance = (emp.alliances || {})[eid];

    c.fillStyle = alliance ? 'rgba(0,150,0,0.1)' : 'rgba(255,255,255,0.03)';
    c.beginPath(); c.roundRect(listX, cy, g.W - 40, 52, 6); c.fill();

    // Empire info
    c.font = 'bold 13px sans-serif'; c.fillStyle = eDef.color;
    c.fillText(`${eDef.icon} ${eDef.name}`, listX + 10, cy + 16);
    c.font = '11px sans-serif'; c.fillStyle = '#aaa';
    const tCount = e.tids ? e.tids.length : 0;
    c.fillText(`${tCount} territories | ${e.coins || 0}💰`, listX + 10, cy + 34);

    // Alliance status
    if (alliance) {
      c.fillStyle = '#0f0'; c.textAlign = 'right';
      c.fillText(`🤝 ${alliance} turns`, g.W - 160, cy + 16);
    } else {
      c.fillStyle = '#888'; c.textAlign = 'right';
      c.fillText('No alliance', g.W - 160, cy + 16);
    }

    // Action buttons
    const btnX = g.W - 140;
    // Propose alliance
    _btn(c, g, btnX, cy + 4, 55, 20, 'Alliance', alliance ? '#555' : '#0a0', !alliance && g.turn >= 3);
    if (!alliance && g.turn >= 3) {
      g.btns.push({ rect: { x: btnX, y: cy + 4, w: 55, h: 20 }, fn: () => { g._proposeAlliance(eid, 'pact'); } });
    }
    // Declare war
    _btn(c, g, btnX + 60, cy + 4, 55, 20, 'Declare ⚔️', '#c44', !alliance);
    g.btns.push({ rect: { x: btnX + 60, y: cy + 4, w: 55, h: 20 }, fn: () => {
      g._log(`⚔️ War declared on ${eDef.name}!`);
      if (emp.alliances) delete emp.alliances[eid];
    } });

    c.textAlign = 'left';
    cy += 58;
  }
}

// ═══════════════════════════════════════════════════════════════
//  CUSTOMIZE SCREEN
// ═══════════════════════════════════════════════════════════════
export function drawCustomize(c, g) {
  _panel(c, g, 'Empire Customization', '🎨');
  _backBtn(c, g);

  const emp = g.empires[g.player];
  if (!emp) return;
  const cx = g.W / 2;

  // Empire info
  c.fillStyle = 'rgba(0,0,0,0.4)';
  c.beginPath(); c.roundRect(20, 62, g.W - 40, 50, 8); c.fill();
  const title = getTitle(emp.tids ? emp.tids.length : 0);
  c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.fillStyle = emp.color;
  c.fillText(`${emp.icon} ${emp.name} — ${title.icon} ${title.title}`, cx, 82);
  c.font = '12px sans-serif'; c.fillStyle = '#aaa';
  c.fillText(`${emp.tids?.length || 0} territories | ${emp.era || 'bronze'} era | Turn ${g.turn}`, cx, 100);

  // Flag preview
  const flagW = 120, flagH = 80;
  const flagX = 40, flagY = 130;
  c.font = 'bold 13px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText('🏴 Flag:', flagX, flagY);
  drawFlag(c, flagX + 60, flagY - 60, flagW, flagH, g.empireCustom.flag || 'solid', emp.color, '#fff');

  // Flag pattern selector
  const fKeys = Object.keys(FLAG_PATTERNS);
  for (let i = 0; i < fKeys.length; i++) {
    const fk = fKeys[i];
    const fp = FLAG_PATTERNS[fk];
    const fx = flagX + i * 65, fy = flagY + 30;
    drawFlag(c, fx, fy, 56, 38, fk, emp.color, '#fff');
    if (g.empireCustom.flag === fk) {
      c.strokeStyle = '#ffd700'; c.lineWidth = 2;
      c.strokeRect(fx - 1, fy - 1, 58, 40);
    }
    g.btns.push({ rect: { x: fx, y: fy, w: 56, h: 38 }, fn: () => { g.empireCustom.flag = fk; } });
  }

  // Heroes panel
  const heroX = g.W / 2 - 10, heroY = 130;
  c.font = 'bold 13px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText('👑 Heroes:', heroX, heroY);

  const hKeys = Object.keys(HEROES);
  for (let i = 0; i < hKeys.length; i++) {
    const hk = hKeys[i];
    const h = HEROES[hk];
    const recruited = g.recruitedHeroes.includes(hk);
    const by = heroY + 18 + i * 42;
    const canRecruit = !recruited && ERA_ORDER.indexOf(emp.era || 'bronze') >= ERA_ORDER.indexOf(h.era);

    c.fillStyle = recruited ? 'rgba(255,215,0,0.15)' : canRecruit ? 'rgba(255,255,255,0.04)' : 'rgba(50,50,50,0.3)';
    c.beginPath(); c.roundRect(heroX, by, g.W - heroX - 20, 38, 6); c.fill();

    c.font = '12px sans-serif'; c.textAlign = 'left'; c.fillStyle = recruited ? '#ffd700' : canRecruit ? '#fff' : '#555';
    c.fillText(`${h.icon} ${h.name} (${ERAS[h.era].name})`, heroX + 8, by + 14);
    c.font = '10px sans-serif'; c.fillStyle = canRecruit ? '#aaa' : '#444';
    c.fillText(`⚔️+${h.atkBonus} 🛡️+${h.defBonus} — ${h.specialDesc}`, heroX + 8, by + 30);

    if (canRecruit && !recruited) {
      const costStr = Object.entries(h.cost).map(([r, v]) => `${v}${r.slice(0, 2)}`).join(' ');
      c.textAlign = 'right'; c.fillStyle = '#ffd700';
      c.fillText(costStr, g.W - 90, by + 22);
      c.textAlign = 'left';
      g.btns.push({ rect: { x: heroX, y: by, w: g.W - heroX - 20, h: 38 }, fn: () => { g._recruitHero(hk); } });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  PROFILE / PROGRESSION SCREEN
// ═══════════════════════════════════════════════════════════════
export function drawProfile(c, g) {
  _panel(c, g, 'Commander Profile', '⭐');
  _backBtn(c, g);

  const p = g.profile;
  const xpInfo = xpForNextLevel(p.xp || 0);
  const rank = getRank(p.elo || 1000);

  // Level + XP bar
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.roundRect(20, 62, g.W - 40, 80, 8); c.fill();
  c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffd700';
  c.fillText(`⭐ Level ${p.level || 1}`, g.W / 2, 88);
  // XP bar
  c.fillStyle = 'rgba(0,100,255,0.3)';
  c.beginPath(); c.roundRect(40, 100, g.W - 80, 16, 8); c.fill();
  c.fillStyle = 'rgba(0,150,255,0.8)';
  c.beginPath(); c.roundRect(40, 100, (g.W - 80) * xpInfo.progress, 16, 8); c.fill();
  c.font = '10px sans-serif'; c.fillStyle = '#fff';
  c.fillText(`${p.xp || 0} / ${xpInfo.next} XP`, g.W / 2, 112);

  // Rank
  c.font = 'bold 14px sans-serif'; c.fillStyle = rank.color || '#fff';
  c.fillText(`${rank.icon} ${rank.name} — ELO: ${p.elo || 1000} (Peak: ${p.peakElo || 1000})`, g.W / 2, 136);

  // Stats
  const col1X = 20, col2X = g.W / 2, statY = 160;
  const stats = [
    ['Games Played', p.totalGames || 0], ['Wins', p.wins || 0], ['Losses', p.losses || 0],
    ['Territories Conquered', p.totalConquests || 0], ['Battles Fought', p.totalBattles || 0],
    ['Buildings Built', p.totalBuildings || 0], ['Techs Researched', p.totalTechResearched || 0],
    ['Sieges Won', p.totalSiegesWon || 0], ['Turns Played', p.stats?.turnsPlayed || 0],
    ['Most Territories', p.stats?.mostTerritories || 0], ['Total Kills', p.stats?.totalKills || 0],
    ['Achievements', (p.achievements || []).length + '/15'],
  ];

  for (let i = 0; i < stats.length; i++) {
    const [label, value] = stats[i];
    const col = i < 6 ? col1X : col2X;
    const row = i % 6;
    _row(c, col, statY + row * 32, g.W / 2 - 30, 28, label, value, '#ffd700');
  }

  // Achievements
  const achY = statY + 6 * 32 + 20;
  c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffd700';
  c.fillText('🏆 Achievements', g.W / 2, achY);
  const achKeys = Object.keys(ACHIEVEMENTS);
  for (let i = 0; i < achKeys.length; i++) {
    const ak = achKeys[i];
    const a = ACHIEVEMENTS[ak];
    const unlocked = (p.achievements || []).includes(ak);
    const ax = 20 + (i % 3) * (g.W / 3 - 10);
    const ay = achY + 14 + Math.floor(i / 3) * 36;
    c.fillStyle = unlocked ? 'rgba(0,200,0,0.15)' : 'rgba(255,255,255,0.03)';
    c.beginPath(); c.roundRect(ax, ay, g.W / 3 - 20, 32, 6); c.fill();
    c.font = '12px sans-serif'; c.textAlign = 'left';
    c.fillStyle = unlocked ? '#0f0' : '#555';
    c.fillText(`${a.icon} ${a.name}`, ax + 6, ay + 16);
    c.font = '9px sans-serif'; c.fillStyle = unlocked ? '#8f8' : '#444';
    c.fillText(unlocked ? '✓ Unlocked' : a.desc, ax + 6, ay + 28);
  }
}

// ═══════════════════════════════════════════════════════════════
//  TERRITORY INTERIOR VIEW (when you click a territory)
// ═══════════════════════════════════════════════════════════════
// ── Territory color themes per continent/region ──
const TERRITORY_THEMES = {
  'Asia': { headerGrad: ['#FF9933', '#FFFFFF33', '#138808'], accent: '#FF9933', bg: '#0d0a06', cardBg: 'rgba(255,153,51,0.06)', border: 'rgba(255,153,51,0.25)' },
  'Europe': { headerGrad: ['#003399', '#FFD70033'], accent: '#003399', bg: '#06080d', cardBg: 'rgba(0,51,153,0.06)', border: 'rgba(0,51,153,0.25)' },
  'Africa': { headerGrad: ['#009639', '#F77F0033'], accent: '#009639', bg: '#060d08', cardBg: 'rgba(0,150,57,0.06)', border: 'rgba(0,150,57,0.25)' },
  'North America': { headerGrad: ['#B22234', '#3C3B6E33'], accent: '#B22234', bg: '#0d0608', cardBg: 'rgba(178,34,52,0.06)', border: 'rgba(178,34,52,0.25)' },
  'South America': { headerGrad: ['#009C3B', '#FFDF0033'], accent: '#009C3B', bg: '#060d08', cardBg: 'rgba(0,156,59,0.06)', border: 'rgba(0,156,59,0.25)' },
  'Oceania': { headerGrad: ['#00008B', '#FFD70033'], accent: '#00008B', bg: '#06060d', cardBg: 'rgba(0,0,139,0.06)', border: 'rgba(0,0,139,0.25)' },
};
function _getTheme(t, country) {
  const region = country?.region || t?.region || 'Asia';
  return TERRITORY_THEMES[region] || TERRITORY_THEMES['Asia'];
}

export function drawTerritoryInterior(c, g) {
  if (!g._terrView) return;
  const tid = g._terrView.tid;
  const t = g._activeTerritories?.[tid] || T(tid);
  const ts = g.ts[tid];
  const emp = g.empires[g.player];
  if (!t || !ts || !emp) return;

  const country = g._countryMode ? COUNTRIES[tid] : null;
  const territoryName = country ? country.name : t.name;
  const territoryFlag = country ? country.flag : '';
  const tab = g._terrView.sub || null;
  const theme = _getTheme(t, country);

  // ── Themed dark background with subtle gradient ──
  const bgGr = c.createRadialGradient(g.W / 2, g.H / 2, 50, g.W / 2, g.H / 2, g.W * 0.7);
  bgGr.addColorStop(0, theme.bg);
  bgGr.addColorStop(1, '#050508');
  c.fillStyle = bgGr;
  c.fillRect(0, 0, g.W, g.H);

  // ── Themed header bar ──
  const hGr = c.createLinearGradient(0, 0, g.W, 0);
  hGr.addColorStop(0, theme.headerGrad[0] + '20');
  hGr.addColorStop(0.5, theme.headerGrad[1] || 'rgba(255,255,255,0.08)');
  hGr.addColorStop(1, theme.headerGrad[0] + '10');
  c.fillStyle = hGr;
  c.fillRect(0, 0, g.W, 56);
  c.strokeStyle = theme.accent + '50';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, 56); c.lineTo(g.W, 56); c.stroke();

  // Empire color stripe at very top
  c.fillStyle = emp.color || '#ffd700';
  c.fillRect(0, 0, g.W, 3);

  // Territory name with flag
  c.font = 'bold 20px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#fff';
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 4;
  c.fillText(`${territoryFlag} ${territoryName}`, g.W / 2, 28);
  c.restore();

  // Back button
  _btn(c, g, 12, 12, 80, 32, '← Map', theme.accent);
  g.btns.push({ label: 'Back', rect: { x: 12, y: 12, w: 80, h: 32 }, fn: () => { g._exitTerritoryView(); } });

  // ── Territory info bar ──
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.roundRect(100, 62, g.W - 200, 32, 6); c.fill();
  c.strokeStyle = theme.border; c.lineWidth = 1;
  c.beginPath(); c.roundRect(100, 62, g.W - 200, 32, 6); c.stroke();
  const ownerName = ts.owner >= 0 ? (EMPIRES[ts.owner]?.name || '?') : 'Neutral';
  const ownerCol = ts.owner >= 0 ? (EMPIRES[ts.owner]?.color || '#888') : '#888';
  c.font = '11px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = ownerCol;
  c.fillText(`${ownerName} · ${t.terrain || 'Plains'} · ⚔${ts.troops}`, 112, 78);
  c.textAlign = 'right'; c.fillStyle = '#ffd700';
  c.fillText(`💰 ${emp.coins}`, g.W - 112, 78);

  // ── Tab bar with themed colors ──
  const tabs = [
    { label: '📋 Overview', id: null, color: '#ffd700' },
    { label: '🏗️ Build', id: 'build', color: '#34d399' },
    { label: '⚔️ Soldiers', id: 'soldiers', color: '#f97316' },
    { label: '🧪 Upgrade', id: 'upgrade', color: '#a78bfa' },
    { label: '⚙️ Manage', id: 'manage', color: '#60a5fa' },
    { label: '🏰 Dungeon', id: 'dungeon', color: '#ec4899' },
  ];
  const tabW = 82, tabH = 32, tabGap = 4;
  const tabTotalW = tabs.length * (tabW + tabGap) - tabGap;
  const tabStartX = (g.W - tabTotalW) / 2;
  const tabY = 100;
  for (let i = 0; i < tabs.length; i++) {
    const tb = tabs[i];
    const tx = tabStartX + i * (tabW + tabGap);
    const active = tab === tb.id;
    c.fillStyle = active ? tb.color + '25' : 'rgba(255,255,255,0.04)';
    c.beginPath(); c.roundRect(tx, tabY, tabW, tabH, 6); c.fill();
    if (active) {
      c.strokeStyle = tb.color; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(tx, tabY, tabW, tabH, 6); c.stroke();
      // Active indicator dot
      c.beginPath(); c.arc(tx + tabW / 2, tabY + tabH - 2, 2, 0, Math.PI * 2);
      c.fillStyle = tb.color; c.fill();
    } else {
      c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1;
      c.beginPath(); c.roundRect(tx, tabY, tabW, tabH, 6); c.stroke();
    }
    c.font = '11px "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = active ? tb.color : '#666';
    c.fillText(tb.label, tx + tabW / 2, tabY + tabH / 2);
    g.btns.push({ label: tb.label, rect: { x: tx, y: tabY, w: tabW, h: tabH }, fn: () => { g._terrView.sub = tb.id; } });
  }

  // Content area with scroll
  const contentY = tabY + tabH + 10;
  const contentH = g.H - contentY - 10;
  const scrollY = g._terrView._scrollY || 0;

  _scrollClip(c, 10, contentY, g.W - 20, contentH);

  if (!tab || tab === 'overview') {
    _drawOverviewTab(c, g, tid, t, ts, emp, contentY, contentH, theme, scrollY);
  } else if (tab === 'build') {
    _drawBuildTab(c, g, tid, t, ts, emp, contentY, contentH, theme, scrollY);
  } else if (tab === 'soldiers') {
    _drawSoldiersTab(c, g, tid, t, ts, emp, contentY, contentH, theme, scrollY);
  } else if (tab === 'upgrade') {
    _drawUpgradeTab(c, g, tid, t, ts, emp, contentY, contentH, theme, scrollY);
  } else if (tab === 'manage') {
    _drawManageTab(c, g, tid, t, ts, emp, contentY, contentH, theme, scrollY);
  } else if (tab === 'dungeon') {
    _drawDungeonTab(c, g, tid, t, ts, emp, contentY, contentH, theme, scrollY);
  }

  _scrollUnclip(c);
}

function _drawDungeonTab(c, g, tid, t, ts, emp, y, h, theme, scrollY) {
  const sy = y + scrollY;
  c.font = 'bold 16px Georgia, serif'; c.textAlign = 'left'; c.fillStyle = theme.accent;
  c.fillText('🏰 Ancient Dungeon & Crypts', 20, sy + 20);

  // Show which emperor awaits as boss
  const bossIndex = tid % 20; // matches DUNGEON_BOSSES length
  const bossNames = [
    'Emperor Ashoka','Julius Caesar','Genghis Khan','Sultan Suleiman','Queen Victoria',
    'Napoleon Bonaparte','Emperor Meiji','Otto von Bismarck','Catherine the Great','Pharaoh Ramses II',
    'Qin Shi Huang','Montezuma II','King Shaka','Emperor Justinian','Cyrus the Great',
    'Alexander the Great','Attila the Hun','Charlemagne','Timur the Lame','Saladin'
  ];
  c.font = '12px Georgia, serif'; c.fillStyle = '#ff9966';
  c.fillText(`👑 Boss: ${bossNames[bossIndex]} awaits in the throne room!`, 32, sy + 38);

  // Atmospheric dungeon box
  const boxGr = c.createLinearGradient(20, sy + 48, 20, sy + 148);
  boxGr.addColorStop(0, 'rgba(120,30,80,0.12)');
  boxGr.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = boxGr;
  c.beginPath(); c.roundRect(20, sy + 48, g.W - 40, 100, 10); c.fill();
  c.strokeStyle = 'rgba(155, 89, 182,0.4)'; c.lineWidth = 1;
  c.beginPath(); c.roundRect(20, sy + 48, g.W - 40, 100, 10); c.stroke();

  c.font = '13px "Segoe UI", sans-serif'; c.fillStyle = '#ddd';
  c.fillText('Deep beneath the surface lies a non-Euclidean labyrinth of ancient chambers.', 32, sy + 72);
  c.fillStyle = '#bbb';
  c.fillText('Explore the dungeon, defeat the guards and the emperor boss, claim the treasure!', 32, sy + 92);
  c.fillStyle = '#888';
  c.font = '12px "Segoe UI", sans-serif';
  c.fillText('WASD/Arrows to move, Space/Click to attack enemies.', 32, sy + 112);

  // Stats
  let ry = sy + 166;
  c.font = 'bold 14px sans-serif'; c.fillStyle = theme.accent;
  c.fillText('Dungeon Specifications', 20, ry); ry += 20;
  _row(c, 20, ry, g.W - 40, 24, 'Dungeon Type', 'Non-Euclidean Labyrinth', '#a56'); ry += 28;
  _row(c, 20, ry, g.W - 40, 24, 'Final Boss', `${bossNames[bossIndex]}`, '#ff6600'); ry += 28;
  _row(c, 20, ry, g.W - 40, 24, 'Guards', '5–13 Hostile Units + Boss', '#e74c3c'); ry += 28;
  _row(c, 20, ry, g.W - 40, 24, 'Traps', 'Pressure Plates, Spikes, Lava', '#d35400'); ry += 28;
  _row(c, 20, ry, g.W - 40, 24, 'Player HP', '100 (enemies hit back!)', '#00ff66'); ry += 28;
  _row(c, 20, ry, g.W - 40, 24, 'Potential Loot', '30–70 Gold Coins', '#f1c40f'); ry += 40;

  const pulse = Math.sin(Date.now() * 0.005) * 0.15 + 0.85;
  const canExplore = (g.renderer && typeof g.renderer._enterInterior === 'function');
  _btn(c, g, g.W / 2 - 120, ry, 240, 42, '⚔️ EXPLORE 3D DUNGEON', '#ec4899', canExplore);
  if (canExplore) {
    c.strokeStyle = `rgba(236,72,153,${pulse})`;
    c.lineWidth = 2; c.beginPath(); c.roundRect(g.W / 2 - 120, ry, 240, 42, 6); c.stroke();
    g.btns.push({ rect: { x: g.W / 2 - 120, y: ry, w: 240, h: 42 }, fn: () => { g.renderer._enterInterior(tid); } });
  } else {
    c.font = '11px sans-serif'; c.fillStyle = '#c44'; c.textAlign = 'center';
    c.fillText('3D Renderer not active or dungeon system unavailable', g.W / 2, ry + 56);
  }
}

function _drawOverviewTab(c, g, tid, t, ts, emp, y, h, theme, scrollY) {
  const sy = y + scrollY;
  const col1X = 20, colW = (g.W - 60) / 2;

  // ── Resources ──
  c.font = 'bold 14px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.fillStyle = theme.accent;
  c.fillText('📊 Resources', col1X, sy + 16);
  const resIcons = { iron: '⛏️', gold: '💰', wood: '🪵', stone: '🪨', food: '🌾' };
  const prod = g.territoryData?.[tid] ? calcTerritoryProduction(t.terrain, ts.buildings || {}) : {};
  let ry = sy + 36;
  for (const k of (RESOURCE_KEYS || ['iron', 'gold', 'wood', 'stone', 'food'])) {
    c.fillStyle = theme.cardBg;
    c.beginPath(); c.roundRect(col1X, ry, colW, 30, 5); c.fill();
    c.strokeStyle = theme.border; c.lineWidth = 0.5;
    c.beginPath(); c.roundRect(col1X, ry, colW, 30, 5); c.stroke();
    c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = '#ccc';
    c.fillText(`${resIcons[k] || k} ${k}`, col1X + 10, ry + 15);
    c.textAlign = 'right'; c.fillStyle = '#8f8';
    c.fillText(`+${prod[k] || 0}/turn`, col1X + colW - 10, ry + 15);
    c.textAlign = 'left';
    ry += 36;
  }

  // ── Buildings ──
  const col2X = col1X + colW + 20;
  c.font = 'bold 14px "Segoe UI", sans-serif'; c.fillStyle = theme.accent;
  c.fillText('🏗️ Buildings', col2X, sy + 16);
  const bKeys = Object.keys(ts.buildings || {});
  let by = sy + 36;
  if (bKeys.length === 0) {
    c.fillStyle = 'rgba(255,255,255,0.03)';
    c.beginPath(); c.roundRect(col2X, by, colW, 30, 5); c.fill();
    c.font = '12px "Segoe UI", sans-serif'; c.fillStyle = '#555'; c.textBaseline = 'middle';
    c.fillText('No buildings yet — go to Build tab!', col2X + 10, by + 15);
    by += 36;
  }
  const buildIcons = { command_center: '🏢', supply_depot: '📦', watchtower: '🗼', armory: '🔫', bunker: '🛡️', radar: '📡', outpost: '⛺' };
  for (const bk of bKeys) {
    if (ts.buildings[bk] > 0) {
      c.fillStyle = theme.cardBg;
      c.beginPath(); c.roundRect(col2X, by, colW, 30, 5); c.fill();
      c.font = '12px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = '#ccc';
      c.fillText(`${buildIcons[bk] || '🏠'} ${bk.replace(/_/g, ' ')} ×${ts.buildings[bk]}`, col2X + 10, by + 15);
      by += 36;
    }
  }

  // Fort level
  by += 14;
  c.font = 'bold 14px "Segoe UI", sans-serif'; c.fillStyle = theme.accent;
  c.fillText('🏰 Fortification', col2X, by); by += 22;
  const fortLvl = ts.fortLevel || 0;
  const fortDef = FORT_LEVELS?.[fortLvl];
  if (fortDef) {
    c.fillStyle = theme.cardBg;
    c.beginPath(); c.roundRect(col2X, by, colW, 28, 5); c.fill();
    c.font = '12px "Segoe UI", sans-serif'; c.fillStyle = '#ccc'; c.textBaseline = 'middle';
    c.fillText(`Level ${fortLvl}: ${fortDef.name} (DEF +${fortDef.defBonus})`, col2X + 10, by + 14);
  }

  // ── Quick action buttons ──
  const actY = sy + Math.max(ry, by) + 30;
  c.fillStyle = theme.cardBg;
  c.beginPath(); c.roundRect(20, actY, g.W - 40, 50, 8); c.fill();
  c.strokeStyle = theme.border; c.lineWidth = 1;
  c.beginPath(); c.roundRect(20, actY, g.W - 40, 50, 8); c.stroke();

  _btn(c, g, 30, actY + 10, 120, 30, '🏗️ Build', '#34d399');
  g.btns.push({ rect: { x: 30, y: actY + 10, w: 120, h: 30 }, fn: () => { g._terrView.sub = 'build'; } });
  _btn(c, g, 160, actY + 10, 120, 30, '⚔️ Soldiers', '#f97316');
  g.btns.push({ rect: { x: 160, y: actY + 10, w: 120, h: 30 }, fn: () => { g._terrView.sub = 'soldiers'; } });
  _btn(c, g, g.W - 150, actY + 10, 120, 30, '← Back to Map', '#aaa');
  g.btns.push({ rect: { x: g.W - 150, y: actY + 10, w: 120, h: 30 }, fn: () => { g._exitTerritoryView(); } });
}

function _drawBuildTab(c, g, tid, t, ts, emp, y, h, theme, scrollY) {
  const sy = y + scrollY;
  c.font = 'bold 16px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.fillStyle = theme.accent;
  c.fillText('🏗️ Build Structures', 20, sy + 16);

  const buildList = [
    { key: 'command_center', icon: '🏢', name: 'Command Center', cost: 25, desc: '+1 troop/turn, +morale', color: '#34d399' },
    { key: 'supply_depot', icon: '📦', name: 'Supply Depot', cost: 15, desc: '+2 income/turn, +food', color: '#60a5fa' },
    { key: 'watchtower', icon: '🗼', name: 'Watchtower', cost: 20, desc: '+3 defense, reveals adjacent', color: '#fbbf24' },
    { key: 'armory', icon: '🔫', name: 'Armory', cost: 30, desc: '+3 coins/turn, +attack', color: '#f87171' },
    { key: 'bunker', icon: '🛡️', name: 'Bunker', cost: 20, desc: '+2 fortification', color: '#a78bfa' },
    { key: 'radar', icon: '📡', name: 'Radar Station', cost: 35, desc: '+morale & intel, +scout', color: '#38bdf8' },
    { key: 'market', icon: '🏪', name: 'Market', cost: 18, desc: '+4 gold/turn, enables trade', color: '#fcd34d' },
    { key: 'barracks', icon: '🏕️', name: 'Barracks', cost: 22, desc: '+2 troop/turn, +training', color: '#fb923c' },
    { key: 'wall', icon: '🧱', name: 'Fortified Wall', cost: 28, desc: '+4 defense, slows attackers', color: '#94a3b8' },
  ];

  let by = sy + 40;
  for (const b of buildList) {
    const count = ts.buildings?.[b.key] || 0;
    const canAfford = emp.coins >= b.cost;
    const maxed = count >= 3;

    // Card
    c.fillStyle = maxed ? 'rgba(50,50,50,0.2)' : theme.cardBg;
    c.beginPath(); c.roundRect(20, by, g.W - 40, 52, 8); c.fill();
    if (!maxed) { c.strokeStyle = canAfford ? b.color + '60' : 'rgba(255,255,255,0.08)'; c.lineWidth = 1; c.beginPath(); c.roundRect(20, by, g.W - 40, 52, 8); c.stroke(); }

    c.font = 'bold 13px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = maxed ? '#555' : '#fff';
    c.fillText(`${b.icon} ${b.name} (×${count}/3)`, 32, by + 8);
    c.font = '11px "Segoe UI", sans-serif'; c.fillStyle = maxed ? '#444' : '#aaa';
    c.fillText(b.desc, 32, by + 26);

    if (!maxed) {
      c.textAlign = 'right'; c.fillStyle = canAfford ? '#ffd700' : '#c44';
      c.fillText(`💰${b.cost}`, g.W - 100, by + 16);
      c.textAlign = 'left';
      _btn(c, g, g.W - 92, by + 10, 64, 30, 'Build', b.color, canAfford);
      if (canAfford) {
        g.btns.push({ rect: { x: g.W - 92, y: by + 10, w: 64, h: 30 }, fn: () => { g._buildStructure(tid, b.key); } });
      }
    } else {
      c.font = 'bold 11px sans-serif'; c.textAlign = 'right'; c.fillStyle = '#555';
      c.fillText('MAXED ✓', g.W - 36, by + 20);
      c.textAlign = 'left';
    }
    by += 58;
  }
}

function _drawSoldiersTab(c, g, tid, t, ts, emp, y, h, theme, scrollY) {
  const sy = y + scrollY;
  c.font = 'bold 16px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.fillStyle = theme.accent;
  c.fillText('⚔️ Military Command', 20, sy + 16);

  // Troop display card
  c.fillStyle = theme.cardBg;
  c.beginPath(); c.roundRect(20, sy + 34, g.W - 40, 68, 10); c.fill();
  c.strokeStyle = theme.border; c.lineWidth = 1;
  c.beginPath(); c.roundRect(20, sy + 34, g.W - 40, 68, 10); c.stroke();
  c.font = 'bold 28px "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd700';
  c.fillText(`⚔️ ${ts.troops} Troops`, g.W / 2, sy + 56);
  c.font = '12px "Segoe UI", sans-serif'; c.fillStyle = '#aaa';
  c.fillText(`Defense: ${t.def || 0} base + ${(ts.fortLevel || 0) * 2} fort`, g.W / 2, sy + 82);

  // Recruit
  const recruitY = sy + 118;
  _btn(c, g, 20, recruitY, g.W - 40, 40, `👤 Recruit 5 Troops (💰10)`, '#34d399', emp.coins >= 10);
  if (emp.coins >= 10) {
    g.btns.push({ rect: { x: 20, y: recruitY, w: g.W - 40, h: 40 }, fn: () => {
      emp.coins -= 10;
      ts.troops += 5;
      g._log(`Recruited 5 troops`);
      if (g.sfx && typeof g.sfx.recruit === 'function') g.sfx.recruit();
    } });
  }

  // Elite recruit
  const eliteY = recruitY + 50;
  _btn(c, g, 20, eliteY, g.W - 40, 40, `🦸 Recruit Elite (💰25, +3 ATK troops)`, '#fbbf24', emp.coins >= 25);
  if (emp.coins >= 25) {
    g.btns.push({ rect: { x: 20, y: eliteY, w: g.W - 40, h: 40 }, fn: () => {
      emp.coins -= 25;
      ts.troops += 3;
      g._log(`Recruited 3 elite troops`);
      if (g.sfx && typeof g.sfx.levelUp === 'function') g.sfx.levelUp();
      else if (g.sfx && typeof g.sfx.recruit === 'function') g.sfx.recruit();
    } });
  }

  // Fortify
  const fortY = eliteY + 50;
  const fortCost = ((ts.fortLevel || 0) + 1) * 15;
  const canFort = emp.coins >= fortCost && (ts.fortLevel || 0) < 5;
  _btn(c, g, 20, fortY, g.W - 40, 40, `🏰 Fortify Lvl ${(ts.fortLevel || 0)}→${(ts.fortLevel || 0) + 1} (💰${fortCost})`, '#60a5fa', canFort);
  if (canFort) {
    g.btns.push({ rect: { x: 20, y: fortY, w: g.W - 40, h: 40 }, fn: () => {
      emp.coins -= fortCost;
      ts.fortLevel = (ts.fortLevel || 0) + 1;
      g._log(`Fortified to level ${ts.fortLevel}`);
      if (g.sfx && typeof g.sfx.fortify === 'function') g.sfx.fortify();
    } });
  }

  // Attack button
  const adjTids = t.adj || [];
  let enemyTids = [];
  for (const adjId of adjTids) {
    const adjTs = g.ts[adjId];
    if (adjTs && adjTs.owner !== g.player) enemyTids.push(adjId);
  }
  if (enemyTids.length > 0 && ts.troops > 3) {
    const atkY = fortY + 50;
    _btn(c, g, 20, atkY, g.W - 40, 40, `⚔️ Attack Neighbor (${enemyTids.length} enemies nearby)`, '#f87171', ts.troops > 3);
    if (ts.troops > 3) {
      g.btns.push({ rect: { x: 20, y: atkY, w: g.W - 40, h: 40 }, fn: () => {
        g.state = 'playing'; g.phase = 'attack';
        g._attackTarget = enemyTids[0]; g._attackFrom = tid;
      } });
    }

    // Show enemy list
    let ey = atkY + 50;
    c.font = 'bold 13px "Segoe UI", sans-serif'; c.fillStyle = '#f87171';
    c.fillText('Nearby Enemies:', 20, ey); ey += 22;
    for (const eid of enemyTids.slice(0, 5)) {
      const eTerr = g._activeTerritories?.[eid] || T(eid);
      const eTs = g.ts[eid];
      const eName = eTerr?.name || `Territory ${eid}`;
      c.fillStyle = 'rgba(239,68,68,0.08)';
      c.beginPath(); c.roundRect(20, ey, g.W - 40, 26, 4); c.fill();
      c.font = '12px "Segoe UI", sans-serif'; c.fillStyle = '#ddd'; c.textBaseline = 'middle';
      c.fillText(`${eName} — ⚔${eTs.troops || 0} troops`, 32, ey + 13);
      ey += 30;
    }
  }
}

function _drawUpgradeTab(c, g, tid, t, ts, emp, y, h, theme, scrollY) {
  const sy = y + scrollY;
  c.font = 'bold 16px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.fillStyle = theme.accent;
  c.fillText('🧪 Upgrades & Research', 20, sy + 16);

  const upgradeList = [
    { id: 'iron_tools', icon: '⚒️', name: 'Iron Tools', desc: '+20% resource production', cost: 20, req: { iron: 10 }, color: '#94a3b8' },
    { id: 'irrigation', icon: '💧', name: 'Irrigation', desc: '+30% food production', cost: 25, req: { food: 15 }, color: '#22d3ee' },
    { id: 'fortify_walls', icon: '🧱', name: 'Stone Walls', desc: '+5 defense to territory', cost: 30, req: { stone: 10 }, color: '#a78bfa' },
    { id: 'war_training', icon: '🎯', name: 'War Training', desc: '+15% attack power', cost: 35, req: { iron: 15 }, color: '#f87171' },
    { id: 'trade_routes', icon: '🛤️', name: 'Trade Routes', desc: '+10 gold/turn', cost: 40, req: { gold: 20 }, color: '#fbbf24' },
    { id: 'medic_camp', icon: '⚕️', name: 'Medic Camp', desc: '+3 troop recovery/turn', cost: 30, req: { food: 10 }, color: '#34d399' },
    { id: 'spy_network', icon: '🕵️', name: 'Spy Network', desc: 'Reveal enemy troop counts', cost: 45, req: { gold: 25 }, color: '#818cf8' },
    { id: 'siege_workshop', icon: '💣', name: 'Siege Workshop', desc: '+25% siege damage', cost: 50, req: { iron: 20 }, color: '#fb923c' },
  ];

  const purchased = ts.upgrades || [];

  let uy = sy + 40;
  for (const u of upgradeList) {
    const owned = purchased.includes(u.id);
    const canAfford = emp.coins >= u.cost && !owned;

    c.fillStyle = owned ? 'rgba(52,211,153,0.08)' : theme.cardBg;
    c.beginPath(); c.roundRect(20, uy, g.W - 40, 52, 8); c.fill();
    if (!owned) { c.strokeStyle = canAfford ? u.color + '50' : 'rgba(255,255,255,0.06)'; c.lineWidth = 1; c.beginPath(); c.roundRect(20, uy, g.W - 40, 52, 8); c.stroke(); }

    c.font = 'bold 13px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = owned ? '#34d399' : '#fff';
    c.fillText(`${u.icon} ${u.name} ${owned ? '✓' : ''}`, 32, uy + 8);
    c.font = '11px "Segoe UI", sans-serif'; c.fillStyle = owned ? '#34d39980' : '#aaa';
    c.fillText(u.desc, 32, uy + 26);

    if (!owned) {
      c.textAlign = 'right'; c.fillStyle = canAfford ? '#ffd700' : '#c44';
      c.fillText(`💰${u.cost}`, g.W - 100, uy + 16);
      c.textAlign = 'left';
      _btn(c, g, g.W - 92, uy + 10, 64, 30, 'Buy', u.color, canAfford);
      if (canAfford) {
        g.btns.push({ rect: { x: g.W - 92, y: uy + 10, w: 64, h: 30 }, fn: () => {
          emp.coins -= u.cost;
          if (!ts.upgrades) ts.upgrades = [];
          ts.upgrades.push(u.id);
          g._log(`Researched ${u.name}!`);
          if (g.sfx && typeof g.sfx.buy === 'function') g.sfx.buy();
        } });
      }
    }
    uy += 58;
  }
}

function _drawManageTab(c, g, tid, t, ts, emp, y, h, theme, scrollY) {
  const sy = y + scrollY;
  c.font = 'bold 16px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.fillStyle = theme.accent;
  c.fillText('⚙️ Territory Management', 20, sy + 16);

  // Troop transfer
  const ownedTids = emp.tids || [];
  let my = sy + 40;
  c.font = '13px "Segoe UI", sans-serif'; c.fillStyle = '#aaa';
  c.fillText('Transfer half your troops to another territory:', 20, my); my += 26;

  for (const otherTid of ownedTids) {
    if (otherTid === tid) continue;
    const otherT = g._activeTerritories?.[otherTid] || T(otherTid);
    const otherName = otherT?.name || `Territory ${otherTid}`;
    c.fillStyle = theme.cardBg;
    c.beginPath(); c.roundRect(20, my, g.W - 40, 32, 6); c.fill();
    c.font = '12px "Segoe UI", sans-serif'; c.fillStyle = '#ccc'; c.textBaseline = 'middle';
    c.fillText(`➡️ ${otherName} (⚔${g.ts[otherTid].troops})`, 32, my + 16);
    c.textAlign = 'right'; c.fillStyle = '#60a5fa';
    c.fillText(`Send ${Math.max(1, Math.floor(ts.troops / 2))}`, g.W - 36, my + 16);
    c.textAlign = 'left';
    g.btns.push({ rect: { x: 20, y: my, w: g.W - 40, h: 32 }, fn: () => {
      const moveCount = Math.max(1, Math.floor(ts.troops / 2));
      ts.troops -= moveCount;
      g.ts[otherTid].troops += moveCount;
      g._log(`Moved ${moveCount} troops to ${otherName}`);
      if (g.sfx && typeof g.sfx.march === 'function') g.sfx.march();
    } });
    my += 38;
  }

  // Rename territory
  my += 20;
  c.font = 'bold 13px "Segoe UI", sans-serif'; c.fillStyle = theme.accent;
  c.fillText('Customize Territory', 20, my); my += 24;
  c.font = '12px "Segoe UI", sans-serif'; c.fillStyle = '#888';
  c.fillText('Set a custom name for this territory (coming soon)', 20, my);
}
