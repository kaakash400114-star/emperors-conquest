/**
 * resources.js — Multi-resource economy for Emperor's Conquest
 * Each territory produces resources per turn based on terrain type.
 * Resources: iron, gold, wood, stone, food
 */

// ── Resource definitions ──
export const RESOURCES = {
  iron:  { name: 'Iron',  icon: '⛏️', color: '#8B8B8B', desc: 'Used for weapons and armor' },
  gold:  { name: 'Gold',  icon: '💰', color: '#FFD700', desc: 'Currency for trading and upgrades' },
  wood:  { name: 'Wood',  icon: '🪵', color: '#8B4513', desc: 'Used for buildings and siege weapons' },
  stone: { name: 'Stone', icon: '🪨', color: '#A0A0A0', desc: 'Used for fortifications and castles' },
  food:  { name: 'Food',  icon: '🌾', color: '#DAA520', desc: 'Required to maintain armies' },
};

export const RESOURCE_KEYS = Object.keys(RESOURCES);

// ── Base production per terrain type (per turn, before modifiers) ──
export const TERRAIN_PRODUCTION = {
  desert:    { iron: 0, gold: 2, wood: 0, stone: 1, food: 1 },
  plains:    { iron: 1, gold: 1, wood: 1, stone: 1, food: 4 },
  mountains: { iron: 3, gold: 0, wood: 0, stone: 3, food: 1 },
  coast:     { iron: 0, gold: 1, wood: 2, stone: 0, food: 3 },
  island:    { iron: 1, gold: 1, wood: 1, stone: 0, food: 2 },
  forest:    { iron: 0, gold: 0, wood: 4, stone: 0, food: 2 },
  peninsula: { iron: 1, gold: 1, wood: 2, stone: 1, food: 3 },
};

// ── Building definitions (cost resources, provide bonuses) ──
export const BUILDINGS = {
  mine:      { name: 'Mine',          icon: '⛏️', cost: { wood: 3, stone: 2 }, bonus: { iron: '+2' }, desc: '+2 iron production' },
  mint:      { name: 'Mint',          icon: '🏦', cost: { stone: 3, iron: 2 }, bonus: { gold: '+3' }, desc: '+3 gold production' },
  lumber:    { name: 'Lumber Mill',   icon: '🪓', cost: { stone: 1, gold: 2 }, bonus: { wood: '+3' }, desc: '+3 wood production' },
  quarry:    { name: 'Quarry',         icon: '🪨', cost: { wood: 2, iron: 1 }, bonus: { stone: '+3' }, desc: '+3 stone production' },
  farm:      { name: 'Farm',           icon: '🌾', cost: { wood: 2, gold: 1 }, bonus: { food: '+4' }, desc: '+4 food production' },
  market:    { name: 'Market',         icon: '🏪', cost: { wood: 3, stone: 2, gold: 2 }, bonus: { gold: '+2', food: '+2' }, desc: '+2 gold, +2 food' },
  blacksmith:{ name: 'Blacksmith',     icon: '🔨', cost: { iron: 3, stone: 2 }, bonus: { iron: '+2' }, desc: '+2 iron, +1 attack' },
  fortress:  { name: 'Fortress',       icon: '🏰', cost: { stone: 5, iron: 2, wood: 2 }, bonus: { stone: '+2' }, desc: '+2 defense' },
  barracks:  { name: 'Barracks',       icon: '⛺', cost: { wood: 4, stone: 3, iron: 1 }, bonus: { food: '+1' }, desc: '+2 troops per turn' },
  warehouse: { name: 'Warehouse',       icon: '🏢', cost: { wood: 5, stone: 2 }, bonus: {}, desc: 'Store 50% more resources' },
  library:   { name: 'Library',         icon: '📚', cost: { wood: 3, stone: 3, gold: 3 }, bonus: { gold: '+1' }, desc: '+10% research speed' },
  harbor:    { name: 'Harbor',          icon: '⚓', cost: { wood: 5, stone: 2, iron: 1 }, bonus: { gold: '+3', food: '+2' }, desc: '+3 gold, +2 food (coast/island only)' },
};

export const BUILDING_KEYS = Object.keys(BUILDINGS);

// ── Trade rates (resource → resource, how many you get for 1) ──
export const TRADE_RATES = {
  iron:  { gold: 2, wood: 1, stone: 1, food: 2 },
  gold:  { iron: 0.5, wood: 2, stone: 2, food: 3 },
  wood:  { iron: 1, gold: 0.5, stone: 0.5, food: 0.5 },
  stone: { iron: 1, gold: 0.5, wood: 2, food: 1 },
  food:  { iron: 0.5, gold: 0.33, wood: 2, stone: 1 },
};

// ── Calculate territory production including buildings ──
export function calcTerritoryProduction(terrain, buildings = {}) {
  const base = { ...TERRAIN_PRODUCTION[terrain] };
  // Apply building bonuses
  for (const [bName, count] of Object.entries(buildings)) {
    if (count > 0 && BUILDINGS[bName]) {
      const b = BUILDINGS[bName];
      for (const [res, val] of Object.entries(b.bonus)) {
        if (typeof val === 'string' && val.startsWith('+')) {
          base[res] = (base[res] || 0) + parseInt(val.slice(1)) * count;
        }
      }
    }
  }
  return base;
}

// ── Calculate total empire production ──
export function calcEmpireProduction(game, eid) {
  const emp = game.empires[eid];
  if (!emp) return RESOURCE_KEYS.reduce((a, k) => ({ ...a, [k]: 0 }), {});
  const total = RESOURCE_KEYS.reduce((a, k) => ({ ...a, [k]: 0 }), {});
  for (const tid of emp.tids) {
    const t = game.ts[tid];
    const terrain = game.territoryData[tid]?.terrain || 'plains';
    const prod = calcTerritoryProduction(terrain, t.buildings);
    for (const k of RESOURCE_KEYS) {
      total[k] += prod[k];
    }
  }
  return total;
}

// ── Can afford a building? ──
export function canAffordBuilding(empResources, buildingKey) {
  const b = BUILDINGS[buildingKey];
  if (!b) return false;
  for (const [res, cost] of Object.entries(b.cost)) {
    if ((empResources[res] || 0) < cost) return false;
  }
  return true;
}

// ── Deduct building cost ──
export function deductBuildingCost(empResources, buildingKey) {
  const b = BUILDINGS[buildingKey];
  for (const [res, cost] of Object.entries(b.cost)) {
    empResources[res] -= cost;
  }
  return empResources;
}
