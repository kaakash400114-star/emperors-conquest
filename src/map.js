/**
 * map.js — All game data: territories, empires, weapons, shop items.
 * Pure data, no logic. Add new content here.
 */

export const MAP_W = 960, MAP_H = 640, T_RADIUS = 28;

export const TERRITORIES = [
  // East Asia (right side)
  { id:0,  name:'Indus Valley',   cx:680, cy:340, terrain:'desert',      def:0, adj:[1,2,4] },
  { id:1,  name:'Ganges',         cx:790, cy:380, terrain:'plains',      def:0, adj:[0,2] },
  { id:2,  name:'Persia',         cx:600, cy:280, terrain:'desert',      def:1, adj:[0,1,3,4,6] },
  { id:3,  name:'Mesopotamia',    cx:555, cy:340, terrain:'plains',      def:0, adj:[2,4,6,10] },
  { id:4,  name:'Arabia',         cx:570, cy:430, terrain:'desert',      def:1, adj:[0,2,3,5] },
  { id:5,  name:'Egypt',          cx:480, cy:460, terrain:'desert',      def:0, adj:[4,7,16] },
  // Mediterranean & Europe (center)
  { id:6,  name:'Anatolia',       cx:520, cy:240, terrain:'mountains',   def:2, adj:[2,3,7,8,10,15] },
  { id:7,  name:'Greece',         cx:470, cy:300, terrain:'coast',       def:1, adj:[5,6,8,15] },
  { id:8,  name:'Italia',         cx:420, cy:340, terrain:'coast',       def:0, adj:[6,7,9,10] },
  { id:9,  name:'Gaul',           cx:340, cy:230, terrain:'plains',      def:0, adj:[8,10,11,12,15] },
  { id:10, name:'Hispania',       cx:310, cy:380, terrain:'peninsula',   def:1, adj:[3,6,8,9,16] },
  // Northern Europe (top center)
  { id:11, name:'Britannia',      cx:280, cy:120, terrain:'island',      def:1, adj:[9,12,13] },
  { id:12, name:'Germania',       cx:390, cy:160, terrain:'forest',      def:2, adj:[9,11,13,14,15] },
  { id:13, name:'Scandinavia',    cx:360, cy:60,  terrain:'mountains',   def:2, adj:[11,12,14,17] },
  { id:14, name:'Eastern Europe', cx:490, cy:160, terrain:'plains',      def:0, adj:[12,13,15,17] },
  { id:15, name:'Balkans',        cx:440, cy:260, terrain:'mountains',   def:1, adj:[6,7,9,12,14] },
  // Africa (bottom left)
  { id:16, name:'North Africa',   cx:350, cy:490, terrain:'coast',       def:1, adj:[5,10] },
  // Far East (far right)
  { id:17, name:'Japan',          cx:880, cy:220, terrain:'island',      def:1, adj:[14,13] },
];

export const EMPIRES = {
  maurya:  { id:'maurya',  name:'Maurya Empire',       era:'Ancient India 322 BC',   color:'#e67e22', dark:'#d35400', light:'#f39c12', text:'#fff',
             bonus:'+2 coins per territory', bonusType:'income', icon:'\u2694' },
  roman:   { id:'roman',   name:'Roman Empire',        era:'Ancient Rome 27 BC',      color:'#c0392b', dark:'#922b21', light:'#e74c3c', text:'#fff',
             bonus:'+1 defense all territories',       bonusType:'defense', icon:'\u265E' },
  mongol:  { id:'mongol',  name:'Mongol Empire',       era:'Mongolia 1206 AD',        color:'#7f8c8d', dark:'#5d6d7e', light:'#95a5a6', text:'#fff',
             bonus:'+1 attack in combat',              bonusType:'attack', icon:'\u2694' },
  ottoman: { id:'ottoman', name:'Ottoman Empire',      era:'Turkey 1299 AD',          color:'#16a085', dark:'#0e6655', light:'#1abc9c', text:'#fff',
             bonus:'+1 defense mountains',             bonusType:'fortress', icon:'\u2626' },
  british: { id:'british', name:'British Empire',      era:'England 1588 AD',         color:'#2c3e50', dark:'#1a252f', light:'#34495e', text:'#fff',
             bonus:'+2 coins per territory',            bonusType:'bonus', icon:'\u2693' },
  napoleon:{ id:'napoleon',name:"Napoleon's France",   era:'France 1804 AD',          color:'#2980b9', dark:'#1f618d', light:'#3498db', text:'#fff',
             bonus:'+2 attack on plains',              bonusType:'plains', icon:'\u2660' },
  japan:   { id:'japan',   name:'Imperial Japan',      era:'Japan 1868 AD',           color:'#e74c3c', dark:'#c0392b', light:'#ff6b6b', text:'#fff',
             bonus:'+2 defense on islands',            bonusType:'island', icon:'\u265B' },
  germany: { id:'germany', name:'Nazi Germany',        era:'Germany 1939 AD',         color:'#444',    dark:'#222',    light:'#666',    text:'#fff',
             bonus:'+3 coins per territory',          bonusType:'warMachine', icon:'\u2620' },
  russia:  { id:'russia',  name:'Soviet Russia',      era:'USSR 1922 AD',            color:'#cc0000', dark:'#990000', light:'#ff3333', text:'#fff',
             bonus:'Soldiers cost -5 coins',           bonusType:'cheap', icon:'\u2603' },
  egypt:   { id:'egypt',   name:'Egyptian Empire',     era:'Egypt 3100 BC',           color:'#f1c40f', dark:'#d4a017', light:'#f7dc6f', text:'#1a1a2e',
             bonus:'+3 coins from desert territories',  bonusType:'desert', icon:'\u2600' },
};

export const EIDS = Object.keys(EMPIRES);

// FIX: Mongolia now starts at territory 3 (Mesopotamia) instead of 14 (Eastern Europe)
// to avoid conflict with Russia which starts at [13,14].
// Japan [17] now connects to both [14] and [13] (Scandinavia) for better reachability.
export const STARTS = {
  maurya:  { t:[0,1],       troops:[6,4] },
  roman:   { t:[8],         troops:[7] },
  mongol:  { t:[3],         troops:[6] },
  ottoman: { t:[6,15],      troops:[5,3] },
  british: { t:[11],        troops:[6] },
  napoleon:{ t:[9],         troops:[6] },
  japan:   { t:[17],        troops:[5] },
  germany: { t:[12],        troops:[6] },
  russia:  { t:[13,14],     troops:[4,5] },
  egypt:   { t:[5],         troops:[6] },
};

// Neutrals: territories with no owner at start, but some troops guarding them
// Territory 14 is no longer neutral since Russia starts there
export const NEUTRALS = { 2:3, 4:3, 7:3, 10:3, 16:3 };

// Weapons: tier → name, atk bonus, def bonus, cost to unlock
// Tier 1 weapons are free. Higher tiers must be unlocked.
// Weapon bonuses are now capped in combat.js to prevent trivialization.
export const WEAPONS = {
  1: [
    { name:'Sword',     atk:1, def:0, cost:0,  icon:'\u2694' },
    { name:'Spear',     atk:0, def:1, cost:0,  icon:'\u265E' },
    { name:'Bow',       atk:2, def:0, cost:0,  icon:'\u{1F3F9}' },
  ],
  2: [
    { name:'Musket',    atk:2, def:0, cost:30, icon:'\u{1F52B}' },
    { name:'Knight',    atk:1, def:2, cost:35, icon:'\u265E' },
    { name:'Cannon',    atk:3, def:0, cost:40, icon:'\u{1F4A3}' },
  ],
  3: [
    { name:'Rifle',     atk:3, def:0, cost:60, icon:'\u{1F52B}' },
    { name:'Artillery', atk:4, def:0, cost:70, icon:'\u{1F4A3}' },
    { name:'Cavalry',   atk:2, def:2, cost:55, icon:'\u{1F40E}' },
  ],
  4: [
    { name:'Machine Gun',atk:4, def:0, cost:100,icon:'\u{1F52B}' },
    { name:'Tank',       atk:5, def:3, cost:120,icon:'\u{1F3FB}' },
    { name:'Bomber',     atk:6, def:0, cost:150,icon:'\u2708' },
  ],
};

// Shop items
export const SHOP = {
  soldier:   { name:'Soldier',       cost:10, desc:'+1 troop' },
  veteran:   { name:'Veteran',       cost:20, desc:'+2 troops' },
  fortify:   { name:'Fortify',       cost:15, desc:'+2 defense (permanent)' },
  weaponT2:  { name:'Medieval Arms', cost:25, desc:'Unlock Tier 2 weapons' },
  weaponT3:  { name:'Gunpowder Age', cost:50, desc:'Unlock Tier 3 weapons' },
  weaponT4:  { name:'Modern Warfare',cost:80, desc:'Unlock Tier 4 weapons' },
  spy:       { name:'Spy Network',   cost:30, desc:'See enemy troop counts' },
};

// Combat strategies
export const STRATEGIES = [
  { id:'assault', name:'Full Assault', desc:'All troops attack — high risk, high reward', atkMod:0, defMod:0 },
  { id:'siege',   name:'Siege',        desc:'Ignore enemy terrain defense bonus',       atkMod:-1, defMod:0, ignoreDef:true },
  { id:'raid',    name:'Raid',         desc:'Quick strike — fewer losses on win',       atkMod:1, defMod:-1 },
  { id:'ambush',  name:'Ambush',       desc:'+2 attack from forests & mountains',       atkMod:2, defMod:0, needTerrain:['forest','mountains'] },
];

// Terrain icons for visual indicators
export const TERRAIN_ICONS = {
  desert:    '\u2600',
  plains:    '\u{1F33E}',
  mountains: '\u26F0',
  coast:     '\u{1F30A}',
  island:    '\u{1F3DD}',
  forest:    '\u{1F332}',
  peninsula: '\u{1F3D4}',
};

// Terrain display colors (subtle overlay tint)
export const TERRAIN_COLORS = {
  desert:    'rgba(244,164,96,0.15)',
  plains:    'rgba(144,238,144,0.12)',
  mountains: 'rgba(169,169,169,0.18)',
  coast:     'rgba(100,149,237,0.12)',
  island:    'rgba(100,149,237,0.15)',
  forest:    'rgba(34,139,34,0.15)',
  peninsula: 'rgba(210,180,140,0.12)',
};

export const T = (id) => TERRITORIES[id];
export const E = (id) => EMPIRES[id];
export const adj = (a,b) => TERRITORIES[a].adj.includes(b);
