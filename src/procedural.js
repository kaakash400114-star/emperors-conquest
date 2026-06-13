/**
 * procedural.js — Procedural World Generation & Fog of War for Emperor's Conquest
 * Biome generation, territory expansion, weather events, fog of war on flat map.
 */

// ── Biomes ──
export const BIOMES = {
  tropical:    { name: 'Tropical',     icon: '🌴', color: '#228B22', foodBonus: 3, woodBonus: 2, defMod: 0 },
  temperate:   { name: 'Temperate',    icon: '🌿', color: '#90EE90', foodBonus: 2, woodBonus: 1, defMod: 0 },
  arid:        { name: 'Arid',         icon: '🏜️', color: '#D2B48C', foodBonus: -1, goldBonus: 2, defMod: -1 },
  tundra:      { name: 'Tundra',       icon: '❄️', color: '#B0C4DE', foodBonus: -2, stoneBonus: 2, defMod: 1 },
  volcanic:    { name: 'Volcanic',     icon: '🌋', color: '#8B0000', ironBonus: 3, defMod: 0 },
  coastal:     { name: 'Coastal',      icon: '🏖️', color: '#87CEEB', foodBonus: 2, goldBonus: 1, defMod: 0 },
  mountainous: { name: 'Mountainous',  icon: '⛰️', color: '#696969', stoneBonus: 3, ironBonus: 2, defMod: 2 },
  swamp:       { name: 'Swamp',        icon: '🐊', color: '#556B2F', foodBonus: 1, defMod: -2 },
};

export const BIOME_KEYS = Object.keys(BIOMES);

// ── Weather system ──
export const WEATHER_TYPES = {
  clear:     { name: 'Clear',         icon: '☀️', atkMod: 0, defMod: 0, moveMod: 0, color: 'rgba(255,255,200,0.05)' },
  rain:      { name: 'Rain',          icon: '🌧️', atkMod: -1, defMod: 1, moveMod: -1, color: 'rgba(0,0,50,0.1)' },
  storm:     { name: 'Storm',         icon: '⛈️', atkMod: -2, defMod: 0, moveMod: -2, color: 'rgba(0,0,30,0.15)' },
  fog:       { name: 'Fog',           icon: '🌫️', atkMod: -1, defMod: 2, moveMod: -1, color: 'rgba(100,100,100,0.15)' },
  snow:      { name: 'Snow',          icon: '❄️', atkMod: -1, defMod: 1, moveMod: -1, color: 'rgba(200,220,255,0.1)' },
  drought:   { name: 'Drought',       icon: '🔥', atkMod: 0, defMod: -1, moveMod: 0, foodMod: -3, color: 'rgba(200,100,0,0.08)' },
  plague:    { name: 'Plague',        icon: '☠️', atkMod: -2, defMod: -2, moveMod: -1, troopLoss: 1, color: 'rgba(50,0,50,0.1)' },
  golden_age:{ name: 'Golden Age',    icon: '✨', atkMod: 1, defMod: 1, moveMod: 1, goldMod: 5, color: 'rgba(255,215,0,0.08)' },
};

export const WEATHER_KEYS = Object.keys(WEATHER_TYPES);

// ── Fog of War states ──
export const FOG_STATES = {
  hidden:     { name: 'Unexplored',  opacity: 0.85, icon: '⬛' },
  fogged:     { name: 'Fogged',      opacity: 0.5,  icon: '🌫️' },
  visible:    { name: 'Visible',     opacity: 0,    icon: '👁️' },
  previously:{ name: 'Explored',   opacity: 0.3,  icon: '👁️‍🗨️' },
};

// ── Natural disasters ──
export const DISASTERS = {
  earthquake: { name: 'Earthquake',   icon: '💥', desc: 'Destroys buildings in a territory', effect: 'destroy_buildings', chance: 0.03 },
  flood:      { name: 'Flood',         icon: '🌊', desc: 'Reduces food production', effect: 'reduce_food', chance: 0.04 },
  famine:     { name: 'Famine',        icon: '💀', desc: 'Troops starve', effect: 'troop_loss', chance: 0.03 },
  rebellion:  { name: 'Rebellion',     icon: '✊', desc: 'Troops desert', effect: 'troop_desert', chance: 0.02 },
  discovery:  { name: 'Discovery',     icon: '🏺', desc: 'Find ancient treasure!', effect: 'bonus_gold', chance: 0.05 },
  migration:  { name: 'Migration',    icon: '🚶', desc: '+2 troops arrive', effect: 'bonus_troops', chance: 0.04 },
};

export const DISASTER_KEYS = Object.keys(DISASTERS);

// ── New territory generation parameters ──
export const TERRITORY_EXPANSION = {
  maxTerritories: 50,      // max total territories on map
  expansionInterval: 10,   // turns between new territory spawns
  minSize: 30,             // min polygon area
  maxSize: 120,            // max polygon area
};

// ── Generate random territory polygon ──
export function generateTerritoryPolygon(cx, cy, radius) {
  const points = [];
  const sides = 5 + Math.floor(Math.random() * 4); // 5-8 sides
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 / sides) * i + (Math.random() - 0.5) * 0.5;
    const r = radius * (0.7 + Math.random() * 0.6);
    points.push([Math.round(cx + Math.cos(angle) * r), Math.round(cy + Math.sin(angle) * r)]);
  }
  return points;
}

// ── Generate biome for territory based on position ──
export function generateBiome(cx, cy, mapW, mapH) {
  const lat = 1 - cy / mapH; // 0=south, 1=north
  const lon = cx / mapW; // 0=west, 1=east

  if (lat > 0.85) return 'tundra';
  if (lat > 0.7 && Math.random() > 0.5) return 'mountainous';
  if (lat < 0.15) return 'tropical';
  if (lat < 0.3) return lat > 0.2 ? 'temperate' : 'tropical';
  if (Math.abs(lon - 0.5) < 0.15 && lat > 0.3 && lat < 0.6) return 'arid';
  if (Math.random() < 0.1) return 'volcanic';
  if (Math.random() < 0.1) return 'swamp';
  if (Math.random() < 0.3) return 'coastal';
  return Math.random() > 0.5 ? 'temperate' : 'tropical';
}

// ── Get random weather for a turn ──
export function rollWeather(turn) {
  // Weight towards clear most of the time
  const r = Math.random();
  if (r < 0.4) return 'clear';
  if (r < 0.6) return 'rain';
  if (r < 0.7) return 'fog';
  if (r < 0.8) return 'snow';
  if (r < 0.9) return 'storm';
  if (r < 0.95) return 'drought';
  if (turn > 10 && r < 0.98) return 'plague';
  return 'golden_age';
}

// ── Update fog of war for an empire ──
export function updateFogOfWar(fogState, empireTids, allTids) {
  const newFog = { ...fogState };
  for (const tid of allTids) {
    if (empireTids.includes(tid)) {
      newFog[tid] = 'visible';
    } else if (newFog[tid] === 'visible') {
      // Was visible, now just explored
      newFog[tid] = 'previously';
    }
    // Check adjacency to owned territories
    // (requires adjacency info from game)
  }
  return newFog;
}

// ── Draw fog overlay on canvas ──
export function drawFog(ctx, x, y, w, h, state) {
  const fogDef = FOG_STATES[state];
  if (!fogDef || fogDef.opacity === 0) return;
  ctx.fillStyle = `rgba(20, 20, 30, ${fogDef.opacity})`;
  ctx.fillRect(x, y, w, h);
  if (state === 'hidden') {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(fogDef.icon, x + w / 2, y + h / 2 + 7);
  }
}

// ── Draw weather overlay on canvas ──
export function drawWeatherOverlay(ctx, w, h, weatherType) {
  const wDef = WEATHER_TYPES[weatherType];
  if (!wDef || weatherType === 'clear') return;
  ctx.fillStyle = wDef.color;
  ctx.fillRect(0, 0, w, h);

  // Weather particles
  if (weatherType === 'rain' || weatherType === 'storm') {
    ctx.strokeStyle = 'rgba(150,150,255,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 50; i++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 2, ry + 8);
      ctx.stroke();
    }
  } else if (weatherType === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
