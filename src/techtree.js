/**
 * techtree.js — Technology tree for Emperor's Conquest
 * 4 eras: Bronze Age → Medieval → Gunpowder → Industrial
 * Each era unlocks units, buildings, and combat bonuses
 */

export const ERAS = {
  bronze:    { id: 'bronze',    name: 'Bronze Age',    icon: '🏺', color: '#CD853F', reqEra: null,   researchCost: 0,  turnReq: 0 },
  medieval:  { id: 'medieval',  name: 'Medieval Age',   icon: '⚔️', color: '#808080', reqEra: 'bronze', researchCost: 100, turnReq: 5 },
  gunpowder: { id: 'gunpowder', name: 'Gunpowder Age',  icon: '💣', color: '#2F4F4F', reqEra: 'medieval', researchCost: 250, turnReq: 15 },
  industrial:{ id: 'industrial', name: 'Industrial Age', icon: '🏭', color: '#4682B4', reqEra: 'gunpowder', researchCost: 500, turnReq: 30 },
};

export const ERA_ORDER = ['bronze', 'medieval', 'gunpowder', 'industrial'];

// ── Technologies within each era ──
export const TECHS = {
  // Bronze Age (free starting techs)
  bronze: [
    { id: 'writing',       name: 'Writing',         icon: '📝', cost: 20,  turns: 3, desc: '+1 gold per territory', effect: { goldPerTerritory: 1 } },
    { id: 'agriculture',   name: 'Agriculture',     icon: '🌾', cost: 15,  turns: 2, desc: '+2 food per farm', effect: { foodFarmBonus: 2 } },
    { id: 'bronze_weapons',name: 'Bronze Weapons',   icon: '🗡️', cost: 25,  turns: 3, desc: '+1 attack in combat', effect: { attackBonus: 1 } },
    { id: 'stone_walls',   name: 'Stone Walls',      icon: '🧱', cost: 20,  turns: 2, desc: '+1 defense per territory', effect: { defenseBonus: 1 } },
    { id: 'trade_route',   name: 'Trade Routes',     icon: '🐪', cost: 30,  turns: 3, desc: '+2 gold from trade', effect: { tradeGold: 2 } },
  ],
  // Medieval Age
  medieval: [
    { id: 'iron_working',  name: 'Iron Working',     icon: '⚒️', cost: 60,  turns: 5, desc: '+2 iron per mine', effect: { ironMineBonus: 2 } },
    { id: 'catapult',      name: 'Catapult',          icon: '🏹', cost: 80,  turns: 6, desc: '+2 attack on siege', effect: { siegeAttack: 2 } },
    { id: 'castle',        name: 'Castle Architecture', icon: '🏰', cost: 100, turns: 7, desc: 'Fortress gives +4 def', effect: { fortressDef: 4 } },
    { id: 'chivalry',      name: 'Chivalry',          icon: '🐎', cost: 70,  turns: 5, desc: '+1 move range', effect: { moveRange: 1 } },
    { id: 'medicine',      name: 'Medicine',          icon: '💊', cost: 50,  turns: 4, desc: 'Troops cost -20%', effect: { troopCostMod: 0.8 } },
  ],
  // Gunpowder Age
  gunpowder: [
    { id: 'musketry',      name: 'Musketry',          icon: '🔫', cost: 150, turns: 8, desc: '+3 attack in combat', effect: { attackBonus: 3 } },
    { id: 'fortification', name: 'Fortification',      icon: '🧱', cost: 200, turns: 9, desc: '+3 defense all territories', effect: { defenseBonus: 3 } },
    { id: 'cannon_tech',   name: 'Cannon Technology', icon: '💣', cost: 180, turns: 8, desc: '+4 attack on siege', effect: { siegeAttack: 4 } },
    { id: 'economics',      name: 'Economics',           icon: '📊', cost: 120, turns: 6, desc: '+3 gold per territory', effect: { goldPerTerritory: 3 } },
    { id: 'navigation',     name: 'Navigation',          icon: '🧭', cost: 140, turns: 7, desc: '+2 move for coastal', effect: { coastalMove: 2 } },
  ],
  // Industrial Age
  industrial: [
    { id: 'mechanized',     name: 'Mechanized Warfare', icon: '⚙️', cost: 400, turns: 12, desc: '+5 attack in combat', effect: { attackBonus: 5 } },
    { id: 'artillery',      name: 'Artillery',           icon: '🎯', cost: 450, turns: 13, desc: '+6 attack on siege', effect: { siegeAttack: 6 } },
    { id: 'industry',       name: 'Industrialization',  icon: '🏭', cost: 350, turns: 10, desc: '+5 gold per territory', effect: { goldPerTerritory: 5 } },
    { id: 'medicine_adv',    name: 'Modern Medicine',     icon: '🩺', cost: 300, turns: 9, desc: 'Troops cost -40%', effect: { troopCostMod: 0.6 } },
    { id: 'engineering',    name: 'Engineering',          icon: '🔧', cost: 380, turns: 11, desc: 'Buildings cost -30%', effect: { buildCostMod: 0.7 } },
  ],
};

// ── Era unlock bonuses ──
export const ERA_BONUSES = {
  bronze:    { attackBonus: 0, defenseBonus: 0, goldPerTerritory: 0 },
  medieval:  { attackBonus: 1, defenseBonus: 1, goldPerTerritory: 1 },
  gunpowder: { attackBonus: 2, defenseBonus: 2, goldPerTerritory: 2 },
  industrial:{ attackBonus: 3, defenseBonus: 3, goldPerTerritory: 3 },
};

// ── Get effective bonuses from researched techs ──
export function getTechBonuses(researchedTechs) {
  const bonuses = { attackBonus: 0, defenseBonus: 0, goldPerTerritory: 0, siegeAttack: 0, moveRange: 0, troopCostMod: 1, buildCostMod: 1, foodFarmBonus: 0, ironMineBonus: 0, tradeGold: 0, fortressDef: 0, coastalMove: 0 };
  for (const techId of researchedTechs) {
    for (const eraTechs of Object.values(TECHS)) {
      const tech = eraTechs.find(t => t.id === techId);
      if (tech) {
        for (const [k, v] of Object.entries(tech.effect)) {
          if (typeof v === 'number' && k.includes('Mod')) {
            bonuses[k] *= v; // multiplicative
          } else {
            bonuses[k] = (bonuses[k] || 0) + v;
          }
        }
      }
    }
  }
  return bonuses;
}

// ── Can research a tech? ──
export function canResearch(game, eid, techId) {
  const emp = game.empires[eid];
  if (!emp) return false;
  // Check not already researched
  if (emp.researchedTechs?.includes(techId)) return false;
  // Find tech definition
  for (const eraTechs of Object.values(TECHS)) {
    const tech = eraTechs.find(t => t.id === techId);
    if (tech) {
      // Check if empire has enough coins
      return emp.coins >= tech.cost && emp.gold >= tech.cost;
    }
  }
  return false;
}
