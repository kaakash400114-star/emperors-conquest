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
  g.btns.push({ rect: { x: 12, y: 10, w: 80, h: 32 }, fn: () => { g.state = 'playing'; g.phase = 'select'; g.sel = null; } });
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
export function drawTerritoryInterior(c, g) {
  if (!g._terrView) return;
  const tid = g._terrView.tid;
  const t = g._activeTerritories?.[tid] || T(tid);
  const ts = g.ts[tid];
  const emp = g.empires[g.player];
  if (!t || !ts || !emp) return;

  // Country data for flag/name
  const country = g._countryMode ? COUNTRIES[tid] : null;
  const territoryName = country ? country.name : t.name;
  const territoryFlag = country ? country.flag : '';

  const tab = g._terrView.sub || null; // null=overview, 'build', 'soldiers', 'manage'

  // Dark background
  c.fillStyle = '#0a0e14';
  c.fillRect(0, 0, g.W, g.H);

  // Header
  c.fillStyle = 'rgba(255,215,0,0.1)';
  c.fillRect(0, 0, g.W, 52);
  c.strokeStyle = 'rgba(255,215,0,0.3)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, 52); c.lineTo(g.W, 52); c.stroke();
  c.font = 'bold 18px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd700';
  c.fillText(`${territoryFlag} ${territoryName}`, g.W / 2, 26);

  // Back button
  _btn(c, g, 12, 10, 80, 32, '← Map', '#aaa');
  g.btns.push({ rect: { x: 12, y: 10, w: 80, h: 32 }, fn: () => { g._exitTerritoryView(); } });

  // Territory info bar (below header)
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.roundRect(100, 58, g.W - 200, 30, 4); c.fill();
  const ownerName = ts.owner >= 0 ? (EMPIRES[ts.owner]?.name || '?') : 'Neutral';
  const ownerCol = ts.owner >= 0 ? (EMPIRES[ts.owner]?.color || '#888') : '#888';
  c.font = '11px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = ownerCol;
  c.fillText(`${ownerName} | Terrain: ${t.terrain} | Troops: ${ts.troops} | 💰${emp.coins}`, 112, 73);

  // Tab buttons
  const tabs = [
    { label: '📋 Overview', id: null, color: '#ffd700' },
    { label: '🏗️ Build', id: 'build', color: '#0a0' },
    { label: '⚔️ Soldiers', id: 'soldiers', color: '#f80' },
    { label: '⚙️ Manage', id: 'manage', color: '#08f' },
  ];
  const tabW = 90, tabH = 30, tabGap = 4;
  const tabTotalW = tabs.length * (tabW + tabGap) - tabGap;
  const tabStartX = (g.W - tabTotalW) / 2;
  const tabY = 94;
  for (let i = 0; i < tabs.length; i++) {
    const tb = tabs[i];
    const tx = tabStartX + i * (tabW + tabGap);
    const active = tab === tb.id;
    c.fillStyle = active ? tb.color + '33' : 'rgba(255,255,255,0.05)';
    c.beginPath(); c.roundRect(tx, tabY, tabW, tabH, 4); c.fill();
    if (active) { c.strokeStyle = tb.color; c.lineWidth = 1; c.beginPath(); c.roundRect(tx, tabY, tabW, tabH, 4); c.stroke(); }
    c.font = '11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = active ? tb.color : '#888';
    c.fillText(tb.label, tx + tabW / 2, tabY + tabH / 2);
    g.btns.push({ rect: { x: tx, y: tabY, w: tabW, h: tabH }, fn: () => { g._terrView.sub = tb.id; } });
  }

  // Content area
  const contentY = tabY + tabH + 10;
  const contentH = g.H - contentY - 10;

  if (!tab || tab === 'overview') {
    _drawOverviewTab(c, g, tid, t, ts, emp, contentY, contentH);
  } else if (tab === 'build') {
    _drawBuildTab(c, g, tid, t, ts, emp, contentY, contentH);
  } else if (tab === 'soldiers') {
    _drawSoldiersTab(c, g, tid, t, ts, emp, contentY, contentH);
  } else if (tab === 'manage') {
    _drawManageTab(c, g, tid, t, ts, emp, contentY, contentH);
  }
}

function _drawOverviewTab(c, g, tid, t, ts, emp, y, h) {
  const col1X = 20, colW = (g.W - 60) / 2;

  // Left column: Resources
  c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText('Resources', col1X, y + 16);
  const resIcons = { iron: '⛏️', gold: '💰', wood: '🪵', stone: '🪨', food: '🌾' };
  const prod = g.territoryData?.[tid] ? calcTerritoryProduction(t.terrain, ts.buildings || {}) : {};
  let ry = y + 32;
  for (const k of (RESOURCE_KEYS || ['iron', 'gold', 'wood', 'stone', 'food'])) {
    c.fillStyle = 'rgba(255,255,255,0.03)';
    c.beginPath(); c.roundRect(col1X, ry, colW, 28, 4); c.fill();
    c.font = '12px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = '#ccc';
    c.fillText(`${resIcons[k] || k} ${k}`, col1X + 8, ry + 14);
    c.textAlign = 'right'; c.fillStyle = '#8f8';
    c.fillText(`+${prod[k] || 0}/turn`, col1X + colW - 8, ry + 14);
    c.textAlign = 'left';
    ry += 32;
  }

  // Right column: Buildings
  const col2X = col1X + colW + 20;
  c.font = 'bold 14px sans-serif'; c.fillStyle = '#ffd700';
  c.fillText('Buildings', col2X, y + 16);
  const bKeys = Object.keys(ts.buildings || {});
  let by = y + 32;
  if (bKeys.length === 0) {
    c.font = '12px sans-serif'; c.fillStyle = '#555';
    c.fillText('No buildings yet', col2X + 8, by + 14);
    by += 32;
  }
  const buildIcons = { command_center: '🏢', supply_depot: '📦', watchtower: '🗼', armory: '🔫', bunker: '🛡️', radar: '📡', outpost: '⛺' };
  for (const bk of bKeys) {
    if (ts.buildings[bk] > 0) {
      c.fillStyle = 'rgba(255,255,255,0.03)';
      c.beginPath(); c.roundRect(col2X, by, colW, 28, 4); c.fill();
      c.font = '12px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = '#ccc';
      c.fillText(`${buildIcons[bk] || '🏠'} ${bk.replace(/_/g, ' ')} ×${ts.buildings[bk]}`, col2X + 8, by + 14);
      by += 32;
    }
  }

  // Fort level
  by += 10;
  c.font = 'bold 14px sans-serif'; c.fillStyle = '#ffd700';
  c.fillText('Fortification', col2X, by); by += 20;
  const fortLvl = ts.fortLevel || 0;
  const fortDef = FORT_LEVELS[fortLvl];
  if (fortDef) {
    c.font = '12px sans-serif'; c.fillStyle = '#ccc';
    c.fillText(`🏰 Level ${fortLvl}: ${fortDef.name} (DEF +${fortDef.defBonus})`, col2X + 8, by);
  }

  // Bottom: Action buttons
  const actY = y + h - 50;
  _btn(c, g, g.W / 2 - 130, actY, 120, 36, '🏗️ Go to Build', '#0a0');
  g.btns.push({ rect: { x: g.W / 2 - 130, y: actY, w: 120, h: 36 }, fn: () => { g._terrView.sub = 'build'; } });
  _btn(c, g, g.W / 2 + 10, actY, 120, 36, '← Back to Map', '#aaa');
  g.btns.push({ rect: { x: g.W / 2 + 10, y: actY, w: 120, h: 36 }, fn: () => { g._exitTerritoryView(); } });
}

function _drawBuildTab(c, g, tid, t, ts, emp, y, h) {
  c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText('Build Structures', 20, y + 16);

  const buildList = [
    { key: 'command_center', icon: '🏢', name: 'Command Center', cost: 25, desc: '+1 troop/turn' },
    { key: 'supply_depot', icon: '📦', name: 'Supply Depot', cost: 15, desc: '+2 income/turn' },
    { key: 'watchtower', icon: '🗼', name: 'Watchtower', cost: 20, desc: '+3 defense' },
    { key: 'armory', icon: '🔫', name: 'Armory', cost: 30, desc: '+3 coins/turn' },
    { key: 'bunker', icon: '🛡️', name: 'Bunker', cost: 20, desc: '+2 fortification' },
    { key: 'radar', icon: '📡', name: 'Radar', cost: 35, desc: '+morale & intel' },
  ];

  let by = y + 34;
  for (const b of buildList) {
    const count = ts.buildings?.[b.key] || 0;
    const canAfford = emp.coins >= b.cost;
    const maxed = count >= 3;

    c.fillStyle = maxed ? 'rgba(50,50,50,0.3)' : 'rgba(255,255,255,0.04)';
    c.beginPath(); c.roundRect(20, by, g.W - 40, 48, 6); c.fill();
    if (!maxed) { c.strokeStyle = canAfford ? '#ffd700' : '#555'; c.lineWidth = 1; c.beginPath(); c.roundRect(20, by, g.W - 40, 48, 6); c.stroke(); }

    c.font = 'bold 13px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = maxed ? '#555' : '#fff';
    c.fillText(`${b.icon} ${b.name} (×${count}/3)`, 32, by + 6);
    c.font = '11px sans-serif'; c.fillStyle = '#aaa';
    c.fillText(b.desc, 32, by + 24);

    if (!maxed) {
      c.textAlign = 'right'; c.fillStyle = canAfford ? '#ffd700' : '#c44';
      c.fillText(`💰${b.cost}`, g.W - 100, by + 16);
      c.textAlign = 'left';
      _btn(c, g, g.W - 90, by + 8, 60, 28, 'Build', canAfford ? '#ffd700' : '#555', canAfford);
      if (canAfford) {
        g.btns.push({ rect: { x: g.W - 90, y: by + 8, w: 60, h: 28 }, fn: () => { g._buildStructure(tid, b.key); } });
      }
    } else {
      c.font = '11px sans-serif'; c.textAlign = 'right'; c.fillStyle = '#555';
      c.fillText('MAXED', g.W - 40, by + 20);
      c.textAlign = 'left';
    }

    by += 54;
  }
}

function _drawSoldiersTab(c, g, tid, t, ts, emp, y, h) {
  c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText('Military', 20, y + 16);

  // Troop display
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.roundRect(20, y + 34, g.W - 40, 60, 8); c.fill();
  c.font = 'bold 24px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd700';
  c.fillText(`⚔️ ${ts.troops} Troops`, g.W / 2, y + 54);
  c.font = '12px sans-serif'; c.fillStyle = '#aaa';
  c.fillText(`Defense: ${t.def} base + ${(ts.fortLevel || 0) * 2} fort`, g.W / 2, y + 78);

  // Recruit button
  const recruitY = y + 110;
  _btn(c, g, g.W / 2 - 100, recruitY, 200, 36, `👤 Recruit (+5 troops, 10💰)`, '#0a0', emp.coins >= 10);
  if (emp.coins >= 10) {
    g.btns.push({ rect: { x: g.W / 2 - 100, y: recruitY, w: 200, h: 36 }, fn: () => {
      emp.coins -= 10;
      ts.troops += 5;
      g._log(`Recruited 5 troops at ${territoryName}`);
    } });
  }

  // Attack button (if adjacent to enemy)
  const adjTids = t.adj || [];
  let hasEnemy = false;
  for (const adjId of adjTids) {
    const adjTs = g.ts[adjId];
    if (adjTs && adjTs.owner !== g.player) { hasEnemy = true; break; }
  }
  if (hasEnemy) {
    const atkY = recruitY + 50;
    _btn(c, g, g.W / 2 - 100, atkY, 200, 36, '⚔️ Attack Neighbor', '#c44', ts.troops > 3);
    if (ts.troops > 3) {
      g.btns.push({ rect: { x: g.W / 2 - 100, y: atkY, w: 200, h: 36 }, fn: () => {
        g.state = 'playing';
        g._attackTarget = adjTids.find(id => g.ts[id]?.owner !== g.player);
        g._attackFrom = tid;
      } });
    }
  }

  // Fortify button
  const fortY = recruitY + (hasEnemy ? 100 : 50);
  const fortCost = (ts.fortLevel || 0) + 1 * 15;
  const canFort = emp.coins >= fortCost && (ts.fortLevel || 0) < 5;
  _btn(c, g, g.W / 2 - 100, fortY, 200, 36, `🏰 Fortify (Level ${ts.fortLevel || 0}→${(ts.fortLevel || 0) + 1}, ${fortCost}💰)`, '#08f', canFort);
  if (canFort) {
    g.btns.push({ rect: { x: g.W / 2 - 100, y: fortY, w: 200, h: 36 }, fn: () => {
      emp.coins -= fortCost;
      ts.fortLevel = (ts.fortLevel || 0) + 1;
      g._log(`Fortified ${territoryName} to level ${ts.fortLevel}`);
    } });
  }
}

function _drawManageTab(c, g, tid, t, ts, emp, y, h) {
  c.font = 'bold 14px sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffd700';
  c.fillText('Territory Management', 20, y + 16);

  // Troop transfer
  const ownedTids = emp.tids || [];
  let my = y + 40;
  c.font = '12px sans-serif'; c.fillStyle = '#aaa';
  c.fillText('Transfer troops to another territory:', 20, my); my += 24;

  for (const otherTid of ownedTids) {
    if (otherTid === tid) continue;
    const otherT = g._activeTerritories?.[otherTid] || T(otherTid);
    _btn(c, g, 20, my, g.W - 40, 26, `Send troops to ${otherT.name} (has ${g.ts[otherTid].troops})`, '#08f', ts.troops > 1);
    g.btns.push({ rect: { x: 20, y: my, w: g.W - 40, h: 26 }, fn: () => {
      const moveCount = Math.max(1, Math.floor(ts.troops / 2));
      ts.troops -= moveCount;
      g.ts[otherTid].troops += moveCount;
      g._log(`Moved ${moveCount} troops to ${otherT.name}`);
    } });
    my += 32;
  }
}
