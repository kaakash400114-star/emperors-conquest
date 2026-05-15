/**
 * map.js — All game data: territories, empires, weapons, shop items.
 * Pure data, no logic. Add new content here.
 */

export const MAP_W = 960, MAP_H = 640, T_RADIUS = 0;

export const TERRITORIES = [
  // East Asia (right side)
  { id:0,  name:'Indus Valley',   cx:680, cy:340, terrain:'desert',      def:0, adj:[1,2,4],
    poly:[[640,310],[710,310],[720,340],[710,375],[660,380],[630,360]] },
  { id:1,  name:'Ganges',         cx:790, cy:380, terrain:'plains',      def:0, adj:[0,2],
    poly:[[750,345],[830,345],[840,385],[830,420],[760,420],[740,385]] },
  { id:2,  name:'Persia',         cx:600, cy:280, terrain:'desert',      def:1, adj:[0,1,3,4,6],
    poly:[[545,250],[660,250],[660,305],[630,330],[570,330],[535,300]] },
  { id:3,  name:'Mesopotamia',    cx:555, cy:340, terrain:'plains',      def:0, adj:[2,4,6,10],
    poly:[[520,310],[590,310],[600,345],[590,375],[530,380],[510,350]] },
  { id:4,  name:'Arabia',         cx:570, cy:430, terrain:'desert',      def:1, adj:[0,2,3,5],
    poly:[[530,390],[620,390],[630,435],[610,470],[540,475],[520,440]] },
  { id:5,  name:'Egypt',          cx:480, cy:460, terrain:'desert',      def:0, adj:[4,7,16],
    poly:[[445,430],[520,430],[525,470],[510,500],[450,505],[435,470]] },
  // Mediterranean & Europe (center)
  { id:6,  name:'Anatolia',       cx:520, cy:240, terrain:'mountains',   def:2, adj:[2,3,7,8,10,15],
    poly:[[475,210],[570,210],[575,255],[560,275],[490,280],[470,255]] },
  { id:7,  name:'Greece',         cx:470, cy:300, terrain:'coast',       def:1, adj:[5,6,8,15],
    poly:[[445,270],[500,270],[505,310],[490,335],[450,340],[435,310]] },
  { id:8,  name:'Italia',         cx:420, cy:340, terrain:'coast',       def:0, adj:[6,7,9,10],
    poly:[[395,310],[450,310],[455,350],[445,380],[405,385],[390,355]] },
  { id:9,  name:'Gaul',           cx:340, cy:230, terrain:'plains',      def:0, adj:[8,10,11,12,15],
    poly:[[295,200],[390,200],[395,245],[385,270],[310,275],[290,245]] },
  { id:10, name:'Hispania',       cx:310, cy:380, terrain:'peninsula',   def:1, adj:[3,6,8,9,16],
    poly:[[270,345],[355,345],[360,390],[345,425],[280,430],[265,395]] },
  // Northern Europe (top center)
  { id:11, name:'Britannia',      cx:280, cy:120, terrain:'island',      def:1, adj:[9,12,13],
    poly:[[250,85],[315,85],[320,125],[310,160],[260,165],[245,130]] },
  { id:12, name:'Germania',       cx:390, cy:160, terrain:'forest',      def:2, adj:[9,11,13,14,15],
    poly:[[350,130],[435,130],[440,175],[430,200],[360,205],[345,175]] },
  { id:13, name:'Scandinavia',    cx:360, cy:60,  terrain:'mountains',   def:2, adj:[11,12,14,17],
    poly:[[325,30],[400,30],[405,75],[395,105],[340,110],[320,75]] },
  { id:14, name:'Eastern Europe', cx:490, cy:160, terrain:'plains',      def:0, adj:[12,13,15,17],
    poly:[[455,130],[530,130],[535,175],[525,200],[465,205],[450,175]] },
  { id:15, name:'Balkans',        cx:440, cy:260, terrain:'mountains',   def:1, adj:[6,7,9,12,14],
    poly:[[405,230],[480,230],[485,265],[475,290],[415,295],[400,265]] },
  // Africa (bottom left)
  { id:16, name:'North Africa',   cx:350, cy:490, terrain:'coast',       def:1, adj:[5,10],
    poly:[[300,460],[405,460],[410,500],[395,535],[315,540],[295,505]] },
  // Far East (far right)
  { id:17, name:'Japan',          cx:880, cy:220, terrain:'island',      def:1, adj:[14,13],
    poly:[[850,185],[915,185],[920,225],[910,260],[855,265],[845,230]] },
];

// Background map polygons — ocean + land masses for ancient world look
export const MAP_BG = {
  ocean: [[0,0],[960,0],[960,640],[0,640]],
  // Major land masses (drawn on top of ocean)
  lands: [
    // Europe mainland
    [[240,25],[540,25],[545,210],[575,210],[575,275],[505,340],[490,340],[490,380],[455,385],[445,430],[525,430],[530,475],[410,475],[410,540],[300,540],[300,460],[265,460],[265,395],[270,345],[295,200],[295,200],[240,85],[240,25]],
    // British Isles
    [[245,30],[325,30],[330,170],[240,170]],
    // Arabian Peninsula
    [[520,380],[640,380],[645,480],[520,480]],
    // Indian Subcontinent
    [[630,300],[850,300],[855,430],[630,430]],
    // Far East / Japan
    [[840,170],[930,170],[935,270],[840,270]],
  ],
};

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
  germany: { id:'germany', name:'Nazi Germany',        era:'Germany 1939 AD',         color:'#444444', dark:'#222222', light:'#666666', text:'#fff',
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
  desert:    'rgba(244,164,96,0.25)',
  plains:    'rgba(144,238,144,0.2)',
  mountains: 'rgba(169,169,169,0.25)',
  coast:     'rgba(100,149,237,0.2)',
  island:    'rgba(100,149,237,0.25)',
  forest:    'rgba(34,139,34,0.25)',
  peninsula: 'rgba(210,180,140,0.2)',
};

export const T = (id) => TERRITORIES[id];
export const E = (id) => EMPIRES[id];
export const adj = (a,b) => TERRITORIES[a].adj.includes(b);
