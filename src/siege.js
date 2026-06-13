/**
 * siege.js — Real-Time Siege Combat for Emperor's Conquest
 * Tactical battle view with formations, siege weapons, and phased combat.
 */

// ── Siege weapons ──
export const SIEGE_WEAPONS = {
  battering_ram: { name: 'Battering Ram',  icon: '🪵', cost: { wood: 8, iron: 2 }, hp: 60, atk: 8, range: 1, desc: 'Breaks down fortress gates' },
  catapult:       { name: 'Catapult',        icon: '🪨', cost: { wood: 6, stone: 4, iron: 2 }, hp: 40, atk: 12, range: 3, desc: 'Hurls stones at walls' },
  trebuchet:     { name: 'Trebuchet',       icon: '⚖️', cost: { wood: 10, stone: 6, iron: 4 }, hp: 35, atk: 18, range: 5, desc: 'Devastating long-range damage' },
  siege_tower:   { name: 'Siege Tower',     icon: '🗼', cost: { wood: 15, iron: 3 }, hp: 80, def: 5, range: 1, desc: 'Deploys troops over walls' },
  cannon:        { name: 'Siege Cannon',    icon: '💣', cost: { iron: 8, stone: 4, gold: 6 }, hp: 50, atk: 22, range: 4, desc: 'Requires Gunpowder Age' },
};

export const SIEGE_KEYS = Object.keys(SIEGE_WEAPONS);

// ── Formations ──
export const FORMATIONS = {
  line:      { name: 'Line Formation',      icon: '➖', atkMod: 1,   defMod: 1,   desc: 'Balanced attack and defense' },
  wedge:     { name: 'Wedge Formation',     icon: '▶️', atkMod: 1.5, defMod: 0.7, desc: 'High attack, lower defense' },
  shield_wall:{ name: 'Shield Wall',         icon: '🛡️', atkMod: 0.6, defMod: 1.8, desc: 'Strong defense, low attack' },
  skirmish:  { name: 'Skirmish Line',       icon: '💨', atkMod: 1.3, defMod: 0.5, desc: 'Fast attack, very exposed' },
  phalanx:   { name: 'Phalanx',             icon: '🔱', atkMod: 0.8, defMod: 2.0, desc: 'Ultimate defense, slow' },
  ambush:    { name: 'Ambush',               icon: '🌲', atkMod: 2.0, defMod: 0.3, desc: 'Devastating surprise attack' },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);

// ── Siege phases ──
export const SIEGE_PHASES = {
  approach: { name: 'Approach',   order: 0, desc: 'Move forces toward the target' },
  bombard:  { name: 'Bombardment', order: 1, desc: 'Siege weapons attack fortifications' },
  assault:  { name: 'Assault',    order: 2, desc: 'Troops breach walls and fight' },
  rout:     { name: 'Rout',       order: 3, desc: 'Pursue fleeing enemies' },
};

// ── Terrain siege modifiers ──
export const SIEGE_TERRAIN_MODS = {
  desert:    { defBonus: -1, atkBonus: 0, desc: 'No cover, defenders suffer' },
  plains:    { defBonus: 0,  atkBonus: 1, desc: 'Open field, attackers favored' },
  mountains: { defBonus: 3,  atkBonus: -2, desc: 'High ground, defenders favored' },
  coast:     { defBonus: 1,  atkBonus: 0, desc: 'Sea breeze, slight defense' },
  island:    { defBonus: 2,  atkBonus: -1, desc: 'Natural moat, defenders favored' },
  forest:    { defBonus: 1,  atkBonus: 1,  desc: 'Trees provide cover for both' },
  peninsula: { defBonus: 1,  atkBonus: 0, desc: 'Bottleneck, easier defense' },
};

// ── Fortification levels ──
export const FORT_LEVELS = {
  0: { name: 'None',             icon: '',    defBonus: 0,  hpBonus: 0 },
  1: { name: 'Wooden Palisade',  icon: '🪵', defBonus: 1,  hpBonus: 10 },
  2: { name: 'Stone Wall',        icon: '🧱', defBonus: 2,  hpBonus: 30 },
  3: { name: 'Fortified Wall',    icon: '🏰', defBonus: 3,  hpBonus: 60 },
  4: { name: 'Citadel',           icon: '🏯', defBonus: 5,  hpBonus: 100 },
  5: { name: 'Impenetrable',      icon: '🏛️', defBonus: 8,  hpBonus: 200 },
};

// ── Resolve siege combat ──
export function resolveSiege(attacker, defender, terrain, options = {}) {
  const siegeWeapons = options.siegeWeapons || [];
  const formation = options.formation || 'line';
  const defFormation = options.defFormation || 'shield_wall';
  const fortLevel = options.fortLevel || 0;

  const formAtk = FORMATIONS[formation]?.atkMod || 1;
  const formDef = FORMATIONS[defFormation]?.defMod || 1;
  const terrainMod = SIEGE_TERRAIN_MODS[terrain] || SIEGE_TERRAIN_MODS.plains;
  const fort = FORT_LEVELS[fortLevel] || FORT_LEVELS[0];

  // Siege weapon bonus
  let siegeAtk = 0;
  for (const sw of siegeWeapons) {
    const def = SIEGE_WEAPONS[sw];
    if (def) siegeAtk += def.atk;
  }

  // Attacker power
  const atkPower = attacker.troops * formAtk * (1 + (terrainMod.atkBonus * 0.1)) + siegeAtk;
  // Defender power (includes fortification)
  const defPower = defender.troops * formDef * (1 + (terrainMod.defBonus + fort.defBonus) * 0.1);

  // Morale factor (random ±20%)
  const morale = 0.8 + Math.random() * 0.4;
  const result = atkPower * morale > defPower;

  // Casualties
  const totalPower = atkPower + defPower;
  const atkLossRatio = result ? 0.2 + Math.random() * 0.15 : 0.5 + Math.random() * 0.2;
  const defLossRatio = result ? 0.6 + Math.random() * 0.2 : 0.1 + Math.random() * 0.1;

  return {
    won: result,
    attackerLoss: Math.ceil(attacker.troops * atkLossRatio),
    defenderLoss: Math.ceil(defender.troops * defLossRatio),
    siegeDamage: result ? fortLevel - 1 : fortLevel, // reduce fort by 1 on win
    phase: 'complete',
    atkPower: Math.round(atkPower),
    defPower: Math.round(defPower),
    formation,
    defFormation,
  };
}
