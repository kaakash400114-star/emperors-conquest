/**
 * map.js — The Ancient World
 *
 * Defines every territory on the map, which territories border each other,
 * and the starting empires. The map is a graph: territories are nodes,
 * adjacency lists are edges.
 *
 * Why store map data separately? Because the map is pure DATA — it doesn't
 * contain any logic. Separating data from logic is a core principle.
 * If you want to add a new territory, you just add it here.
 *
 * Coordinate system: 900 x 620 virtual pixels.
 * The renderer scales this to fit the screen.
 */

export const MAP_WIDTH = 900;
export const MAP_HEIGHT = 620;
export const TERRITORY_RADIUS = 38;

// ── Territory Definitions ────────────────────────────────────
// Each territory is a node in the game graph.

export const TERRITORIES = [
    { id: 0,  name: 'Britannia',   cx: 80,  cy: 90,  terrain: 'island',        goldBonus: 1, defBonus: 1, adj: [1] },
    { id: 1,  name: 'Gaul',        cx: 210, cy: 185, terrain: 'plains',         goldBonus: 2, defBonus: 0, adj: [0, 2, 3, 4] },
    { id: 2,  name: 'Hispania',    cx: 105, cy: 350, terrain: 'peninsula',      goldBonus: 1, defBonus: 1, adj: [1, 5] },
    { id: 3,  name: 'Germania',    cx: 335, cy: 95,  terrain: 'forest',         goldBonus: 1, defBonus: 2, adj: [1, 4, 6, 10] },
    { id: 4,  name: 'Italia',      cx: 315, cy: 265, terrain: 'mediterranean',  goldBonus: 3, defBonus: 0, adj: [1, 3, 5, 6] },
    { id: 5,  name: 'Carthago',    cx: 225, cy: 445, terrain: 'coast',          goldBonus: 2, defBonus: 1, adj: [2, 4, 7] },
    { id: 6,  name: 'Hellas',      cx: 445, cy: 280, terrain: 'coast',          goldBonus: 2, defBonus: 1, adj: [3, 4, 7, 8] },
    { id: 7,  name: 'Aegyptus',    cx: 415, cy: 455, terrain: 'desert',         goldBonus: 3, defBonus: 0, adj: [5, 6, 8, 11] },
    { id: 8,  name: 'Asia Minor',  cx: 540, cy: 215, terrain: 'mountains',      goldBonus: 2, defBonus: 2, adj: [6, 7, 9, 10] },
    { id: 9,  name: 'Persia',      cx: 680, cy: 300, terrain: 'desert',         goldBonus: 3, defBonus: 1, adj: [8, 10, 11, 12] },
    { id: 10, name: 'Scythia',     cx: 500, cy: 95,  terrain: 'steppe',         goldBonus: 1, defBonus: 0, adj: [3, 8, 9] },
    { id: 11, name: 'Arabia',      cx: 530, cy: 480, terrain: 'desert',         goldBonus: 2, defBonus: 1, adj: [7, 9, 12] },
    { id: 12, name: 'India',       cx: 760, cy: 450, terrain: 'plains',         goldBonus: 3, defBonus: 0, adj: [9, 11] },
];

// ── Empire Definitions ───────────────────────────────────────
// Each empire has a unique color and strategic bonus.

export const EMPIRES = {
    rome: {
        id: 'rome', name: 'Roman Empire',
        color: '#c0392b', dark: '#922b21', light: '#e74c3c', text: '#fff',
        bonus: '+1 gold per territory per turn',
        bonusType: 'gold',
    },
    carthage: {
        id: 'carthage', name: 'Carthaginian Republic',
        color: '#16a085', dark: '#0e6655', light: '#1abc9c', text: '#fff',
        bonus: '+1 defense on all territories',
        bonusType: 'defense',
    },
    egypt: {
        id: 'egypt', name: 'Egyptian Empire',
        color: '#d4a017', dark: '#b8860b', light: '#f1c40f', text: '#1a1a2e',
        bonus: 'Recruit troops at -3 gold cost',
        bonusType: 'recruit',
    },
    greece: {
        id: 'greece', name: 'Greek City-States',
        color: '#2980b9', dark: '#1f618d', light: '#3498db', text: '#fff',
        bonus: '+1 attack in combat',
        bonusType: 'attack',
    },
    persia: {
        id: 'persia', name: 'Persian Empire',
        color: '#8e44ad', dark: '#6c3483', light: '#9b59b6', text: '#fff',
        bonus: '+2 base gold income per turn',
        bonusType: 'income',
    },
};

export const EMPIRE_IDS = Object.keys(EMPIRES);

// ── Starting Positions ───────────────────────────────────────
// Which territories each empire controls at game start.
// Neutrals get small garrisons to make early expansion non-trivial.

export const STARTING_POSITIONS = {
    rome:     { territories: [4, 1], troops: [6, 4] },
    carthage: { territories: [5, 2], troops: [5, 3] },
    egypt:    { territories: [7],    troops: [6] },
    greece:   { territories: [6],    troops: [5] },
    persia:   { territories: [9, 8], troops: [5, 3] },
};

// Neutral territories and their garrisons
export const NEUTRAL_TERRITORIES = {
    0: 3,   // Britannia
    3: 3,   // Germania
    10: 3,  // Scythia
    11: 3,  // Arabia
    12: 3,  // India
};

// ── Helpers ──────────────────────────────────────────────────

/** Get territory data by id */
export function getTerritory(id) {
    return TERRITORIES[id];
}

/** Get empire data by id */
export function getEmpire(id) {
    return EMPIRES[id];
}

/** Are two territories adjacent? */
export function areAdjacent(a, b) {
    return TERRITORIES[a].adj.includes(b);
}

/** Get all territories adjacent to a given one */
export function getNeighbors(id) {
    return TERRITORIES[id].adj;
}
