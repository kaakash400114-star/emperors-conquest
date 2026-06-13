/**
 * empire-custom.js — Empire Customization for Emperor's Conquest
 * Custom colors, flag patterns, named heroes with unique abilities.
 */

// ── Hero definitions ──
export const HEROES = {
  // Universal heroes
  alexander:  { name: 'Alexander the Great',    icon: '👑', era: 'bronze',    cost: { gold: 50 }, atkBonus: 3, defBonus: 1, moveBonus: 1, special: 'conquest',  specialDesc: 'Conquered territory troops start with +2' },
  sun_tzu:    { name: 'Sun Tzu',                 icon: '📜', era: 'bronze',    cost: { gold: 40 }, atkBonus: 1, defBonus: 2, moveBonus: 0, special: 'art_of_war', specialDesc: 'Always see enemy troop counts' },
  leonidas:   { name: 'King Leonidas',           icon: '🛡️', era: 'bronze',    cost: { gold: 45 }, atkBonus: 1, defBonus: 4, moveBonus: 0, special: 'last_stand', specialDesc: '+3 defense when defending last territory' },
  joan:       { name: 'Joan of Arc',              icon: '⚔️', era: 'medieval',  cost: { gold: 60 }, atkBonus: 2, defBonus: 2, moveBonus: 1, special: 'inspire',    specialDesc: 'All territories +1 defense while hero present' },
  genghis:    { name: 'Genghis Khan',             icon: '🐎', era: 'medieval',  cost: { gold: 70 }, atkBonus: 4, defBonus: 0, moveBonus: 2, special: 'horde',     specialDesc: '+1 troop per territory each turn' },
  elizabeth:  { name: 'Queen Elizabeth I',        icon: '👸', era: 'medieval',  cost: { gold: 55 }, atkBonus: 0, defBonus: 2, moveBonus: 0, special: 'armada',    specialDesc: '+3 gold per turn from all territories' },
  napoleon_h: { name: 'Napoleon Bonaparte',      icon: '🗼', era: 'gunpowder', cost: { gold: 80 }, atkBonus: 3, defBonus: 2, moveBonus: 1, special: 'grand_army', specialDesc: '+2 attack for every 5 territories owned' },
  wellington: { name: 'Duke of Wellington',        icon: '🎩', era: 'gunpowder', cost: { gold: 75 }, atkBonus: 1, defBonus: 4, moveBonus: 0, special: 'iron_duke', specialDesc: 'Cannot lose more than 50% troops in defense' },
  yamamoto:   { name: 'Admiral Yamamoto',         icon: '⚓', era: 'gunpowder', cost: { gold: 70 }, atkBonus: 2, defBonus: 1, moveBonus: 2, special: 'naval_sup', specialDesc: '+3 attack on coastal/island territories' },
  bismarck_o: { name: 'Otto von Bismarck',        icon: '🎯', era: 'industrial',cost: { gold: 100 },atkBonus: 2, defBonus: 3, moveBonus: 0, special: 'realpolitik',specialDesc: 'Alliances cannot be broken for 10 turns' },
  rommel:     { name: 'Erwin Rommel',             icon: '🏜️', era: 'industrial',cost: { gold: 110 },atkBonus: 5, defBonus: 1, moveBonus: 2, special: 'blitz',     specialDesc: 'First attack each turn gets +4 attack bonus' },
  nightingale:{ name: 'Florence Nightingale',     icon: '🏥', era: 'industrial',cost: { gold: 90 }, atkBonus: 0, defBonus: 2, moveBonus: 0, special: 'healing',   specialDesc: 'Recover 1 troop per territory each turn' },
};

export const HERO_KEYS = Object.keys(HEROES);

// ── Custom color palettes ──
export const COLOR_PALETTES = {
  crimson:  { name: 'Crimson',    primary: '#DC143C', dark: '#8B0000', light: '#FF4444' },
  royal_blue:{ name: 'Royal Blue', primary: '#4169E1', dark: '#1E3A8A', light: '#6090FF' },
  emerald:  { name: 'Emerald',    primary: '#50C878', dark: '#2E8B57', light: '#66CDAA' },
  gold:     { name: 'Gold',       primary: '#FFD700', dark: '#B8860B', light: '#FFEC8B' },
  purple:   { name: 'Purple',     primary: '#9400D3', dark: '#6A0DAD', light: '#BA55D3' },
  teal:     { name: 'Teal',       primary: '#008080', dark: '#006666', light: '#20B2AA' },
  orange:   { name: 'Orange',     primary: '#FF8C00', dark: '#CC7000', light: '#FFA500' },
  midnight: { name: 'Midnight',   primary: '#191970', dark: '#0F0F4F', light: '#333399' },
  rose:     { name: 'Rose',       primary: '#FF007F', dark: '#CC0066', light: '#FF3399' },
  obsidian: { name: 'Obsidian',   primary: '#2C2C2C', dark: '#1A1A1A', light: '#4A4A4A' },
  silver:   { name: 'Silver',     primary: '#C0C0C0', dark: '#808080', light: '#E0E0E0' },
  bronze:   { name: 'Bronze',     primary: '#CD7F32', dark: '#8B5A2B', light: '#DAA06D' },
};

export const PALETTE_KEYS = Object.keys(COLOR_PALETTES);

// ── Flag patterns ──
export const FLAG_PATTERNS = {
  solid:       { name: 'Solid',       icon: '🟩', desc: 'Single color field' },
  stripes_h:   { name: 'Horizontal',  icon: '▤', desc: 'Horizontal stripes' },
  stripes_v:   { name: 'Vertical',    icon: '▥', desc: 'Vertical stripes' },
  cross:       { name: 'Cross',       icon: '✚', desc: 'Centered cross' },
  diagonal:    { name: 'Diagonal',    icon: '╱', desc: 'Diagonal split' },
  quarters:    { name: 'Quarters',    icon: '✦', desc: 'Four quadrants' },
  chevron:     { name: 'Chevron',     icon: '▶', desc: 'Arrow pointing forward' },
  border:      { name: 'Border',      icon: '◻', desc: 'Colored border on white' },
  circle:      { name: 'Circle',      icon: '●', desc: 'Central circle emblem' },
  star:        { name: 'Star',        icon: '★', desc: 'Central star emblem' },
  sun:         { name: 'Sun',         icon: '☀', desc: 'Sun rays emblem' },
  eagle:       { name: 'Eagle',       icon: '🦅', desc: 'Eagle silhouette' },
};

export const FLAG_KEYS = Object.keys(FLAG_PATTERNS);

// ── Empire titles (unlocked by territory count) ──
export const TITLES = [
  { minTerr: 1,  title: 'Chieftain',   icon: '🏕️' },
  { minTerr: 3,  title: 'Warlord',     icon: '⚔️' },
  { minTerr: 5,  title: 'King',         icon: '👑' },
  { minTerr: 8,  title: 'High King',    icon: '🏰' },
  { minTerr: 12, title: 'Emperor',     icon: '🏛️' },
  { minTerr: 16, title: 'Grand Emperor', icon: '🌐' },
  { minTerr: 20, title: 'Supreme Ruler',  icon: '👑' },
  { minTerr: 25, title: 'World Conqueror', icon: '🌍' },
];

export function getTitle(territoryCount) {
  let title = TITLES[0];
  for (const t of TITLES) {
    if (territoryCount >= t.minTerr) title = t;
  }
  return title;
}

// ── Draw flag on canvas ──
export function drawFlag(ctx, x, y, w, h, pattern, primary, secondary = '#ffffff') {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  switch (pattern) {
    case 'solid':
      ctx.fillStyle = primary;
      ctx.fillRect(x, y, w, h);
      break;
    case 'stripes_h':
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 === 0 ? primary : secondary;
        ctx.fillRect(x, y + (h / 3) * i, w, h / 3);
      }
      break;
    case 'stripes_v':
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 === 0 ? primary : secondary;
        ctx.fillRect(x + (w / 3) * i, y, w / 3, h);
      }
      break;
    case 'cross':
      ctx.fillStyle = secondary;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = primary;
      ctx.fillRect(x + w * 0.35, y, w * 0.3, h);
      ctx.fillRect(x, y + h * 0.35, w, h * 0.3);
      break;
    case 'diagonal':
      ctx.fillStyle = primary;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    case 'quarters':
      ctx.fillStyle = primary;
      ctx.fillRect(x, y, w / 2, h / 2);
      ctx.fillRect(x + w / 2, y + h / 2, w / 2, h / 2);
      ctx.fillStyle = secondary;
      ctx.fillRect(x + w / 2, y, w / 2, h / 2);
      ctx.fillRect(x, y + h / 2, w / 2, h / 2);
      break;
    case 'chevron':
      ctx.fillStyle = secondary;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y);
      ctx.lineTo(x + w, y + h * 0.5);
      ctx.lineTo(x + w * 0.2, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    case 'border':
      ctx.fillStyle = secondary;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = primary;
      ctx.lineWidth = 4;
      ctx.strokeStyle = primary;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      break;
    case 'circle':
      ctx.fillStyle = secondary;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'star':
      ctx.fillStyle = secondary;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = primary;
      drawStar(ctx, x + w / 2, y + h / 2, 5, Math.min(w, h) * 0.3, Math.min(w, h) * 0.15);
      break;
    case 'sun':
      ctx.fillStyle = secondary;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = primary;
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 / 12) * i;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5);
        ctx.lineTo(cx + Math.cos(a) * r * 2.5, cy + Math.sin(a) * r * 2.5);
        ctx.lineWidth = 2;
        ctx.strokeStyle = primary;
        ctx.stroke();
      }
      break;
    default:
      ctx.fillStyle = primary;
      ctx.fillRect(x, y, w, h);
  }

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    ctx.lineTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r);
    rot += step;
  }
  ctx.closePath();
  ctx.fill();
}
