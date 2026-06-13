/**
 * builder.js — Territory Builder Mode for Emperor's Conquest
 * Isometric voxel construction within territory views.
 * Build structures block-by-block in an isometric grid.
 */

// ── Block types (voxel palette) ──
export const BLOCKS = {
  grass:      { name: 'Grass',     icon: '🟩', color: '#4CAF50', top: '#66BB6A', side: '#388E3C', cost: {} },
  dirt:       { name: 'Dirt',      icon: '🟫', color: '#795548', top: '#8D6E63', side: '#5D4037', cost: {} },
  stone:      { name: 'Stone',    icon: '⬜', color: '#9E9E9E', top: '#BDBDBD', side: '#757575', cost: { stone: 1 } },
  wood:       { name: 'Wood',     icon: '🟧', color: '#8B4513', top: '#A0522D', side: '#6B3410', cost: { wood: 1 } },
  sand:       { name: 'Sand',      icon: '🟨', color: '#F4A460', top: '#F0C080', side: '#D08030', cost: {} },
  water:      { name: 'Water',    icon: '🟦', color: '#2196F3', top: '#42A5F5', side: '#1976D2', cost: {} },
  iron:       { name: 'Iron Ore', icon: '⛏️', color: '#607D8B', top: '#78909C', side: '#455A64', cost: { iron: 1 } },
  gold:       { name: 'Gold',     icon: '🟡', color: '#FFC107', top: '#FFD54F', side: '#FF8F00', cost: { gold: 2 } },
  brick:      { name: 'Brick',    icon: '🧱', color: '#B71C1C', top: '#D32F2F', side: '#8B0000', cost: { stone: 2, wood: 1 } },
  glass:      { name: 'Glass',    icon: '🔲', color: '#B3E5FC', top: '#E1F5FE', side: '#81D4FA', cost: { stone: 1 } },
  snow:       { name: 'Snow',     icon: '⬜', color: '#FAFAFA', top: '#FFFFFF', side: '#E0E0E0', cost: {} },
  lava:       { name: 'Lava',     icon: '🟥', color: '#FF5722', top: '#FF7043', side: '#BF360C', cost: {} },
  obsidian:   { name: 'Obsidian', icon: '⬛', color: '#212121', top: '#424242', side: '#121212', cost: { stone: 3, iron: 1 } },
};

export const BLOCK_KEYS = Object.keys(BLOCKS);

// ── Grid size for each territory's build area ──
export const BUILDER_GRID = { w: 16, h: 16, maxH: 12 };

// ── Isometric projection helpers ──
export const ISO = {
  // World (x,y,z) → Screen (sx, sy)
  toScreen(x, y, z, cx, cy, scale = 1) {
    return {
      sx: cx + (x - z) * scale * 0.866,
      sy: cy + (x + z) * scale * 0.5 - y * scale,
    };
  },
  // Get block drawing order (painter's algorithm — sort by depth)
  drawOrder(blocks) {
    return [...blocks].sort((a, b) => {
      const da = a.x + a.z - a.y;
      const db = b.x + b.z - b.y;
      return da - db;
    });
  },
};

// ── Pre-built structure templates (blueprints) ──
export const BLUEPRINTS = {
  house: {
    name: 'House', icon: '🏠', cost: { wood: 8, stone: 4 },
    blocks: [
      // floor
      ...Array.from({ length: 5 }, (_, x) => Array.from({ length: 4 }, (_, z) => ({ x, y: 0, z, type: 'wood' }))).flat(),
      // walls
      ...Array.from({ length: 5 }, (_, x) => ({ x, y: 1, z: 0, type: 'wood' })),
      ...Array.from({ length: 5 }, (_, x) => ({ x, y: 1, z: 3, type: 'wood' })),
      ...Array.from({ length: 4 }, (_, z) => ({ x: 0, y: 1, z, type: 'wood' })),
      ...Array.from({ length: 4 }, (_, z) => ({ x: 4, y: 1, z, type: 'wood' })),
      // roof
      ...Array.from({ length: 5 }, (_, x) => Array.from({ length: 4 }, (_, z) => ({ x, y: 2, z, type: 'brick' }))).flat(),
      // door
      { x: 2, y: 1, z: 0, type: 'glass' },
    ],
  },
  tower: {
    name: 'Tower', icon: '🗼', cost: { stone: 12, iron: 2 },
    blocks: [
      ...Array.from({ length: 3 }, (_, x) => Array.from({ length: 3 }, (_, z) => ({ x, y: 0, z, type: 'stone' }))).flat(),
      ...Array.from({ length: 3 }, (_, x) => Array.from({ length: 3 }, (_, z) => ({ x, y: 1, z, type: 'stone' }))).flat(),
      // pillar
      { x: 1, y: 2, z: 1, type: 'stone' },
      { x: 1, y: 3, z: 1, type: 'stone' },
      { x: 1, y: 4, z: 1, type: 'stone' },
      // top
      ...Array.from({ length: 3 }, (_, x) => Array.from({ length: 3 }, (_, z) => ({ x, y: 5, z, type: 'brick' }))).flat(),
    ],
  },
  wall: {
    name: 'Wall', icon: '🧱', cost: { stone: 10 },
    blocks: Array.from({ length: 10 }, (_, x) => [
      { x, y: 0, z: 0, type: 'stone' },
      { x, y: 1, z: 0, type: 'stone' },
    ]).flat(),
  },
  bridge: {
    name: 'Bridge', icon: '🌉', cost: { wood: 12, stone: 4 },
    blocks: Array.from({ length: 8 }, (_, x) => [
      { x, y: 0, z: 0, type: 'wood' },
      { x, y: 0, z: 1, type: 'wood' },
    ]).flat(),
  },
  castle: {
    name: 'Castle', icon: '🏰', cost: { stone: 30, iron: 5, gold: 5 },
    blocks: [
      // base 8x8
      ...Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, z) => ({ x, y: 0, z, type: 'stone' }))).flat(),
      // walls perimeter y=1-3
      ...Array.from({ length: 8 }, (_, x) => ({ x, y: 1, z: 0, type: 'brick' })),
      ...Array.from({ length: 8 }, (_, x) => ({ x, y: 2, z: 0, type: 'brick' })),
      ...Array.from({ length: 8 }, (_, x) => ({ x, y: 3, z: 0, type: 'brick' })),
      ...Array.from({ length: 8 }, (_, x) => ({ x, y: 1, z: 7, type: 'brick' })),
      ...Array.from({ length: 8 }, (_, x) => ({ x, y: 2, z: 7, type: 'brick' })),
      ...Array.from({ length: 8 }, (_, x) => ({ x, y: 3, z: 7, type: 'brick' })),
      ...Array.from({ length: 6 }, (_, z) => ({ x: 0, y: 1, z: z + 1, type: 'brick' })),
      ...Array.from({ length: 6 }, (_, z) => ({ x: 0, y: 2, z: z + 1, type: 'brick' })),
      ...Array.from({ length: 6 }, (_, z) => ({ x: 7, y: 1, z: z + 1, type: 'brick' })),
      ...Array.from({ length: 6 }, (_, z) => ({ x: 7, y: 2, z: z + 1, type: 'brick' })),
      // 4 corner towers
      ...Array.from({ length: 2 }, (_, dx) => Array.from({ length: 2 }, (_, dz) => ({ x: dx, y: 4, z: dz, type: 'stone' }))).flat(),
      ...Array.from({ length: 2 }, (_, dx) => Array.from({ length: 2 }, (_, dz) => ({ x: dx + 6, y: 4, z: dz, type: 'stone' }))).flat(),
      ...Array.from({ length: 2 }, (_, dx) => Array.from({ length: 2 }, (_, dz) => ({ x: dx, y: 4, z: dz + 6, type: 'stone' }))).flat(),
      ...Array.from({ length: 2 }, (_, dx) => Array.from({ length: 2 }, (_, dz) => ({ x: dx + 6, y: 4, z: dz + 6, type: 'stone' }))).flat(),
      // gate
      { x: 3, y: 1, z: 0, type: 'glass' },
      { x: 4, y: 1, z: 0, type: 'glass' },
    ],
  },
  farm_plot: {
    name: 'Farm', icon: '🌾', cost: { wood: 6, food: 2 },
    blocks: Array.from({ length: 6 }, (_, x) => Array.from({ length: 4 }, (_, z) => ({ x, y: 0, z, type: 'grass' }))).flat(),
  },
  mine_shaft: {
    name: 'Mine', icon: '⛏️', cost: { stone: 8, wood: 4 },
    blocks: [
      ...Array.from({ length: 4 }, (_, x) => Array.from({ length: 3 }, (_, z) => ({ x, y: 0, z, type: 'stone' }))).flat(),
      { x: 1, y: -1, z: 1, type: 'iron' },
      { x: 2, y: -1, z: 1, type: 'iron' },
      { x: 1, y: -2, z: 1, type: 'gold' },
    ],
  },
  temple: {
    name: 'Temple', icon: '🏛️', cost: { stone: 20, gold: 10 },
    blocks: [
      // base 6x4
      ...Array.from({ length: 6 }, (_, x) => Array.from({ length: 4 }, (_, z) => ({ x, y: 0, z, type: 'stone' }))).flat(),
      // columns
      ...Array.from({ length: 4 }, (_, z) => ({ x: 0, y: 1, z, type: 'stone' })),
      ...Array.from({ length: 4 }, (_, z) => ({ x: 5, y: 1, z, type: 'stone' })),
      ...Array.from({ length: 4 }, (_, z) => ({ x: 0, y: 2, z, type: 'stone' })),
      ...Array.from({ length: 4 }, (_, z) => ({ x: 5, y: 2, z, type: 'stone' })),
      // roof
      ...Array.from({ length: 6 }, (_, x) => Array.from({ length: 4 }, (_, z) => ({ x, y: 3, z, type: 'gold' }))).flat(),
    ],
  },
};

export const BLUEPRINT_KEYS = Object.keys(BLUEPRINTS);

// ── Place blueprint at position ──
export function placeBlueprint(blueprint, offsetX = 0, offsetY = 0, offsetZ = 0) {
  return BLUEPRINTS[blueprint].blocks.map(b => ({
    x: b.x + offsetX, y: b.y + offsetY, z: b.z + offsetZ, type: b.type
  }));
}

// ── Draw isometric block on canvas ──
export function drawBlock(ctx, sx, sy, blockType, size = 16) {
  const b = BLOCKS[blockType] || BLOCKS.grass;
  const hw = size * 0.866;
  const hh = size * 0.5;
  const h = size * 0.7;

  // Top face
  ctx.fillStyle = b.top;
  ctx.beginPath();
  ctx.moveTo(sx, sy - h);
  ctx.lineTo(sx + hw, sy - h + hh);
  ctx.lineTo(sx, sy - h + hh * 2);
  ctx.lineTo(sx - hw, sy - h + hh);
  ctx.closePath();
  ctx.fill();

  // Left face
  ctx.fillStyle = b.side;
  ctx.beginPath();
  ctx.moveTo(sx - hw, sy - h + hh);
  ctx.lineTo(sx, sy - h + hh * 2);
  ctx.lineTo(sx, sy + h - h + hh * 2);
  ctx.lineTo(sx - hw, sy + h - h + hh);
  ctx.closePath();
  ctx.fill();

  // Right face
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(sx + hw, sy - h + hh);
  ctx.lineTo(sx, sy - h + hh * 2);
  ctx.lineTo(sx, sy + h - h + hh * 2);
  ctx.lineTo(sx + hw, sy + h - h + hh);
  ctx.closePath();
  ctx.fill();

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - h);
  ctx.lineTo(sx + hw, sy - h + hh);
  ctx.lineTo(sx, sy - h + hh * 2);
  ctx.lineTo(sx - hw, sy - h + hh);
  ctx.closePath();
  ctx.stroke();
}
