// ========================================================================
// renderer3d.js — Emperor's Conquest VOXEL GLOBE + DUNGEON Engine
// Accurate modern world map from TopoJSON, interior dungeon system,
// 3D soldiers, destruction physics, gold coins, commander vision.
// Extends the 2D Renderer for UI overlay.
// ========================================================================

const {
    Scene, PerspectiveCamera, WebGLRenderer, DirectionalLight, HemisphereLight,
    Mesh, Group, InstancedMesh, Sprite, SpriteMaterial, Object3D,
    BoxGeometry, SphereGeometry, PlaneGeometry, RingGeometry, CylinderGeometry, CircleGeometry,
    BufferGeometry, Line, LineBasicMaterial, MeshStandardMaterial, MeshBasicMaterial,
    Color, Vector2, Vector3, Raycaster, Matrix4, Float32BufferAttribute,
    ACESFilmicToneMapping, SRGBColorSpace, BackSide, DoubleSide,
    FogExp2, CanvasTexture, MOUSE, MathUtils, PointsMaterial,
    Points, PointLight, AmbientLight
} = THREE;

import { Renderer } from './renderer.js';
import { MAP_W, MAP_H, TERRITORIES, EMPIRES } from './map.js';
import { COUNTRY_DB } from './country-db.js';
import { RESOURCE_KEYS, RESOURCES } from './resources.js';
import { ERAS } from './techtree.js';
import { WEATHER_TYPES } from './procedural.js';
import { drawTechTree, drawBuilder, drawSiege, drawDiplomacy, drawCustomize, drawProfile, drawTerritoryInterior } from './ui-panels.js';
import { COUNTRIES, CONTINENTS, CONTINENT_ICONS, searchCountries, getCountriesByContinent } from './countries.js';

// ── Globe constants ──
const GLOBE_R = 8;
const VOX = 0.17;          // smaller voxels for more detail
const VOX_RES = 1;          // 1 pixel = 1 voxel (max detail, ~16K land voxels)
const TOPO_W = 360, TOPO_H = 180;

// ── Canvas size for territory lookup ──
const CW = 960, CH = 640;

// ── Per-country color palette from COUNTRY_DB ──
function _countryColor(ci, geoToISO) {
    if (geoToISO && geoToISO[ci]) {
        const entry = COUNTRY_DB[geoToISO[ci]];
        if (entry) {
            const hex = entry.c;
            return [(hex >> 16 & 0xFF) / 255, (hex >> 8 & 0xFF) / 255, (hex & 0xFF) / 255];
        }
    }
    // Fallback: hash-based earthy color
    const rng = _prng(ci * 7919 + 1);
    const h = 0.08 + rng() * 0.35;
    const s = 0.25 + rng() * 0.45;
    const l = 0.30 + rng() * 0.30;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 1/6)      { r = c; g = x; }
    else if (h < 2/6)  { r = x; g = c; }
    else if (h < 3/6)  { g = c; b = x; }
    else if (h < 4/6)  { g = x; b = c; }
    else if (h < 5/6)  { r = x; b = c; }
    else               { r = c; b = x; }
    return [r + m, g + m, b + m];
}

// ── Terrain voxel colors ──
const T_VOX = {
    plains:    [0.42, 0.62, 0.28],
    desert:    [0.86, 0.72, 0.45],
    mountains: [0.55, 0.50, 0.48],
    coast:     [0.60, 0.70, 0.52],
    island:    [0.55, 0.65, 0.40],
    forest:    [0.20, 0.42, 0.16],
    peninsula: [0.72, 0.68, 0.45],
};

// ── Room types for dungeon ──
const ROOM_TYPES = ['throne', 'barracks', 'academy', 'vault', 'armory', 'chamber', 'crypt', 'forge'];
const ROOM_COLORS = {
    throne:   0xffd700, barracks: 0x8b7355, academy: 0x4169e1,
    vault:    0xdaa520, armory:    0x696969, chamber: 0x8a7560,
    crypt:    0x3a3a3a, forge:     0xcc4400,
};
const ENEMY_TYPES = ['grunt', 'archer', 'knight', 'mage', 'boss'];
const ENEMY_COLORS = { grunt: 0xcc3333, archer: 0x339933, knight: 0x6666cc, mage: 0x9933cc, boss: 0xff6600 };

// ═══════════════════════════════════════════════════════════════════
//  SEED PRNG
// ═══════════════════════════════════════════════════════════════════
function _prng(a) {
    return () => {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ═══════════════════════════════════════════════════════════════════
//  AUTONOMOUS AGENT SYSTEM
//  Self-governing AI bureaucrats that trade, defend, hunt, optimize
// ═══════════════════════════════════════════════════════════════════
const _AgentSystem = {
    agents: [],
    _tickTimer: 0,
    _tickInterval: 180,     // frames between agent decisions (~3s at 60fps)
    _logQueue: [],
    _notifications: [],    // {text, color, timer} for HUD display
    _extractionTimer: 0,
    _extractionInterval: 600, // frames between extractions (~10s)

    init(game) {
        this._game = game;
        this.agents = [];
        this._logQueue = [];
        this._notifications = [];
        // Create one agent per non-player empire
        const eids = Object.keys(EMPIRES);
        eids.forEach((eid, idx) => {
            this.agents.push({
                eid: eid,
                empire: EMPIRES[eid],
                personality: ['aggressive', 'defensive', 'economic', 'balanced'][idx % 4],
                treasury: 100 + idx * 20,
                tradePartners: new Set(),
                lastAction: '',
                actionCooldown: 0,
                threatLevel: 0,
                efficiency: 0.5 + _prng(idx * 31337)() * 0.5,
            });
        });
        console.log('[AgentSystem] Initialized', this.agents.length, 'autonomous agents');
    },

    // Main tick — called every frame from _update3D
    tick() {
        if (!this._game || this._game.state !== 'playing') return;

        // Process notification timers
        for (let i = this._notifications.length - 1; i >= 0; i--) {
            this._notifications[i].timer--;
            if (this._notifications[i].timer <= 0) this._notifications.splice(i, 1);
        }

        // Agent decision tick
        this._tickTimer++;
        if (this._tickTimer >= this._tickInterval) {
            this._tickTimer = 0;
            this._runAgentDecisions();
        }

        // Auto-extraction tick
        this._extractionTimer++;
        if (this._extractionTimer >= this._extractionInterval) {
            this._extractionTimer = 0;
            this._runExtraction();
        }
    },

    _runAgentDecisions() {
        const g = this._game;
        const ts = g.ts;
        if (!ts) return;

        for (const agent of this.agents) {
            if (agent.actionCooldown > 0) { agent.actionCooldown--; continue; }

            // Find territories owned by this agent's empire
            const myTerrs = [];
            for (let i = 0; i < TERRITORIES.length; i++) {
                if (ts[i] && ts[i].owner === agent.eid) myTerrs.push(i);
            }
            if (myTerrs.length === 0) continue;

            // Choose action based on personality
            const roll = _prng(agent.eid.charCodeAt(0) * 7919 + g.turn)();
            let action = null;

            switch (agent.personality) {
                case 'aggressive':
                    action = roll < 0.5 ? this._actionAttack(agent, myTerrs) :
                             roll < 0.8 ? this._actionFortify(agent, myTerrs) :
                             this._actionTrade(agent, myTerrs);
                    break;
                case 'defensive':
                    action = roll < 0.4 ? this._actionFortify(agent, myTerrs) :
                             roll < 0.7 ? this._actionTrade(agent, myTerrs) :
                             this._actionOptimize(agent, myTerrs);
                    break;
                case 'economic':
                    action = roll < 0.5 ? this._actionTrade(agent, myTerrs) :
                             roll < 0.8 ? this._actionOptimize(agent, myTerrs) :
                             this._actionFortify(agent, myTerrs);
                    break;
                case 'balanced':
                    action = roll < 0.3 ? this._actionAttack(agent, myTerrs) :
                             roll < 0.5 ? this._actionDefend(agent, myTerrs) :
                             roll < 0.7 ? this._actionTrade(agent, myTerrs) :
                             this._actionOptimize(agent, myTerrs);
                    break;
            }

            if (action) {
                agent.lastAction = action.type;
                agent.actionCooldown = action.cooldown || 3;
                this._logQueue.push(action.log);
                this._notifications.push({
                    text: action.log,
                    color: action.color || '#8af',
                    timer: 180,
                });
            }
        }

        // Flush log to game
        while (this._logQueue.length > 0 && g.log.length < 50) {
            g.log.push({ t: this._logQueue.shift(), empire: 'agent' });
        }
    },

    // ── AGENT ACTION: ATTACK ──
    _actionAttack(agent, myTerrs) {
        const g = this._game;
        const ts = g.ts;
        // Find weakest adjacent enemy territory
        let bestTarget = null, bestScore = Infinity;
        for (const tid of myTerrs) {
            const t = TERRITORIES[tid];
            for (const adjId of (t.adj || [])) {
                if (ts[adjId] && ts[adjId].owner !== agent.eid) {
                    const troops = ts[adjId].troops || 0;
                    const score = troops - (ts[tid].troops || 0);
                    if (score < bestScore) { bestScore = score; bestTarget = adjId; }
                }
            }
        }
        if (bestTarget !== null && bestScore < 5) {
            const from = myTerrs[Math.floor(_prng(bestTarget * 13)() * myTerrs.length)];
            if (ts[from].troops > 3) {
                const send = Math.min(Math.floor(ts[from].troops * 0.3), ts[from].troops - 1);
                ts[from].troops -= send;
                // Simulate combat resolution
                const atkPower = send * 1.2;
                const defPower = (ts[bestTarget].troops || 0) * 1.0;
                if (atkPower > defPower) {
                    const prevOwner = ts[bestTarget].owner;
                    ts[bestTarget].owner = agent.eid;
                    ts[bestTarget].troops = Math.max(1, Math.floor(send - defPower * 0.5));
                    if (g.renderer && g.renderer.queueAttack) {
                        g.renderer.queueAttack(bestTarget, agent.eid, EMPIRES[agent.eid] ? EMPIRES[agent.eid].color : '#f44');
                    }
                    if (g.renderer && g.renderer.triggerVictory) {
                        g.renderer.triggerVictory(bestTarget, 0xffd700);
                    }
                    return {
                        type: 'attack',
                        log: `[${agent.empire.emperor}] conquered ${TERRITORIES[bestTarget].name}!`,
                        color: '#f44',
                        cooldown: 5,
                    };
                } else {
                    ts[bestTarget].troops = Math.max(1, Math.floor(ts[bestTarget].troops - send * 0.4));
                    ts[from].troops += Math.floor(send * 0.3); // survivors retreat
                    return {
                        type: 'attack',
                        log: `[${agent.empire.emperor}] failed to take ${TERRITORIES[bestTarget].name}`,
                        color: '#f84',
                        cooldown: 4,
                    };
                }
            }
        }
        return null;
    },

    // ── AGENT ACTION: DEFEND ──
    _actionDefend(agent, myTerrs) {
        const g = this._game;
        const ts = g.ts;
        // Find most threatened territory (adjacent to most enemies)
        let mostThreatened = myTerrs[0], maxThreat = 0;
        for (const tid of myTerrs) {
            let threat = 0;
            for (const adjId of (TERRITORIES[tid].adj || [])) {
                if (ts[adjId] && ts[adjId].owner !== agent.eid) threat += (ts[adjId].troops || 0);
            }
            if (threat > maxThreat) { maxThreat = threat; mostThreatened = tid; }
        }
        // Fortify with nearby troops
        for (const adjId of (TERRITORIES[mostThreatened].adj || [])) {
            if (ts[adjId] && ts[adjId].owner === agent.eid && ts[adjId].troops > 3) {
                const move = Math.floor(ts[adjId].troops * 0.2);
                ts[adjId].troops -= move;
                ts[mostThreatened].troops += move;
                break;
            }
        }
        agent.treasury += 5;
        return {
            type: 'defend',
            log: `[${agent.empire.emperor}] fortified ${TERRITORIES[mostThreatened].name}`,
            color: '#4f8',
            cooldown: 3,
        };
    },

    // ── AGENT ACTION: FORTIFY (build troops) ──
    _actionFortify(agent, myTerrs) {
        const g = this._game;
        const ts = g.ts;
        const weakest = myTerrs.reduce((a, b) => (ts[a].troops || 0) < (ts[b].troops || 0) ? a : b);
        const bonus = Math.ceil(agent.efficiency * 2);
        ts[weakest].troops = (ts[weakest].troops || 0) + bonus;
        return {
            type: 'fortify',
            log: `[${agent.empire.emperor}] reinforced ${TERRITORIES[weakest].name} +${bonus}`,
            color: '#6b8',
            cooldown: 4,
        };
    },

    // ── AGENT ACTION: TRADE ──
    _actionTrade(agent, myTerrs) {
        const g = this._game;
        const ts = g.ts;
        // Find adjacent territory with a different owner to trade with
        for (const tid of myTerrs) {
            for (const adjId of (TERRITORIES[tid].adj || [])) {
                if (ts[adjId] && ts[adjId].owner !== agent.eid && ts[adjId].owner != null) {
                    const partnerEid = ts[adjId].owner;
                    if (!agent.tradePartners.has(partnerEid)) {
                        agent.tradePartners.add(partnerEid);
                        agent.treasury += 10 * agent.efficiency;
                        // Both sides gain a small troop bonus
                        ts[tid].troops = (ts[tid].troops || 0) + 1;
                        if (ts[adjId].owner) ts[adjId].troops = (ts[adjId].troops || 0) + 1;
                        return {
                            type: 'trade',
                            log: `[${agent.empire.emperor}] opened trade route to ${TERRITORIES[adjId].name}`,
                            color: '#8cf',
                            cooldown: 6,
                        };
                    }
                }
            }
        }
        return this._actionFortify(agent, myTerrs); // fallback
    },

    // ── AGENT ACTION: OPTIMIZE ──
    _actionOptimize(agent, myTerrs) {
        const g = this._game;
        const ts = g.ts;
        // Redistribute troops evenly across owned territories
        const totalTroops = myTerrs.reduce((s, tid) => s + (ts[tid].troops || 0), 0);
        const avg = Math.floor(totalTroops / myTerrs.length);
        myTerrs.forEach(tid => { ts[tid].troops = avg + (_prng(tid * 71)() > 0.5 ? 1 : 0); });
        agent.efficiency = Math.min(1.0, agent.efficiency + 0.02);
        agent.treasury += Math.floor(myTerrs.length * 1.5 * agent.efficiency);
        return {
            type: 'optimize',
            log: `[${agent.empire.emperor}] optimized logistics (${myTerrs.length} territories)`,
            color: '#ad8',
            cooldown: 5,
        };
    },

    // ── AUTO-EXTRACTION: mining assets, computing taxes ──
    _runExtraction() {
        const g = this._game;
        const ts = g.ts;
        if (!ts) return;

        let totalYield = 0;
        let totalTax = 0;
        const terrainValues = {
            plains: 3, desert: 2, mountains: 4, coast: 3,
            island: 2, forest: 5, peninsula: 3,
        };

        for (let i = 0; i < TERRITORIES.length; i++) {
            if (ts[i] && ts[i].owner != null) {
                const terrain = TERRITORIES[i].terrain;
                const base = terrainValues[terrain] || 2;
                const yield_ = Math.floor(base * (0.8 + Math.random() * 0.4));
                totalYield += yield_;
                const tax = Math.floor(yield_ * 0.15);
                totalTax += tax;
                ts[i].troops = (ts[i].troops || 0) + Math.ceil(yield_ * 0.1);
            }
        }

        // Award extraction to all active agents
        for (const agent of this.agents) {
            const ownedCount = TERRITORIES.filter((_, i) => ts[i] && ts[i].owner === agent.eid).length;
            if (ownedCount > 0) {
                agent.treasury += Math.floor(ownedCount * 2.5 * agent.efficiency);
            }
        }

        this._notifications.push({
            text: `[EXTRACTION] +${totalYield} assets mined | +${totalTax} tax collected`,
            color: '#fd4',
            timer: 240,
        });
    },

    // Get notifications for HUD rendering
    getNotifications() { return this._notifications; },

    // Get agent treasury summary
    getTreasurySummary() {
        return this.agents.map(a => ({
            eid: a.eid,
            name: a.empire.emperor,
            treasury: Math.floor(a.treasury),
            personality: a.personality,
            efficiency: a.efficiency.toFixed(2),
            territories: 0, // filled dynamically
            lastAction: a.lastAction,
        }));
    },
};

// ═══════════════════════════════════════════════════════════════════
//  TERRAIN MOVEMENT PHYSICS
//  Physics-based movement costs, environmental hazards
// ═══════════════════════════════════════════════════════════════════
const _TerrainPhysics = {
    // Movement cost multiplier per terrain type
    moveCost: {
        plains: 1.0,
        desert: 1.5,      // heat exhaustion
        mountains: 2.5,   // steep, rocky
        coast: 0.8,        // sea breeze, flat
        island: 1.2,       // limited supply lines
        forest: 1.3,       // dense, slow
        peninsula: 1.1,    // narrow supply
    },

    // Environmental hazard chance per terrain
    hazardChance: {
        plains: 0.02,
        desert: 0.12,      // sandstorm, heatstroke
        mountains: 0.15,   // avalanche, rockslide
        coast: 0.05,        // storm surge
        island: 0.08,       // tsunami
        forest: 0.10,       // wildfire
        peninsula: 0.06,    // erosion
    },

    // Get movement cost between two territories
    getMoveCost(fromTid, toTid) {
        const terrain = TERRITORIES[toTid].terrain;
        return this.moveCost[terrain] || 1.0;
    },

    // Check for environmental hazard
    checkHazard(tid) {
        const terrain = TERRITORIES[tid].terrain;
        const chance = this.hazardChance[terrain] || 0.02;
        return Math.random() < chance;
    },

    // Generate hazard event
    generateHazard(tid) {
        const terrain = TERRITORIES[tid].terrain;
        const hazards = {
            desert:    ['Sandstorm', 'Heatstroke', 'Mirage Deception'],
            mountains: ['Avalanche', 'Rockslide', 'Thin Air'],
            coast:     ['Storm Surge', 'Fog Bank', 'Riptide'],
            island:    ['Tidal Wave', 'Volcanic Eruption', 'Cyclone'],
            forest:    ['Wildfire', 'Poisonous Flora', 'Ambush'],
            peninsula: ['Coastal Erosion', 'Landslide', 'Flood'],
            plains:    ['Flash Flood', 'Locust Swarm', 'Tornado'],
        };
        const options = hazards[terrain] || hazards.plains;
        const name = options[Math.floor(Math.random() * options.length)];
        const damage = Math.floor(1 + Math.random() * 3);
        return { name, damage, terrain };
    },

    // Vertical traversal multiplier (altitude factor)
    altitudeFactor(fromTid, toTid) {
        const fromDef = TERRITORIES[fromTid].def || 0;
        const toDef = TERRITORIES[toTid].def || 0;
        const diff = Math.abs(toDef - fromDef);
        return 1.0 + diff * 0.3; // climbing costs more
    },
};

// ═══════════════════════════════════════════════════════════════════
//  POINT IN POLYGON
// ═══════════════════════════════════════════════════════════════════
function _pip(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

function _findTerritory(mx, my) {
    for (let i = 0; i < TERRITORIES.length; i++) {
        if (_pip(mx, my, TERRITORIES[i].poly)) return i;
    }
    return -1;
}

// ═══════════════════════════════════════════════════════════════════
//  BUILD TERRITORY LOOKUP CANVAS (960x640 → Emperor territory IDs)
// ═══════════════════════════════════════════════════════════════════
function _buildTerritoryCanvas() {
    const cvs = document.createElement('canvas');
    cvs.width = CW; cvs.height = CH;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CW, CH);
    for (let i = 0; i < TERRITORIES.length; i++) {
        const t = TERRITORIES[i];
        const r = (i + 1);
        ctx.fillStyle = `rgb(${r},0,0)`;
        ctx.beginPath();
        const poly = t.poly;
        ctx.moveTo(poly[0][0], poly[0][1]);
        for (let j = 1; j < poly.length; j++) ctx.lineTo(poly[j][0], poly[j][1]);
        ctx.closePath();
        ctx.fill();
    }
    return ctx.getImageData(0, 0, CW, CH);
}

// ═══════════════════════════════════════════════════════════════════
//  LAT/LNG → MAP COORDINATE (Equirectangular, matching 960x640 territory space)
// ═══════════════════════════════════════════════════════════════════
function _latlngToMap(lat, lng) {
    const mx = (lng + 180) / 360 * CW;
    const my = (90 - lat) / 180 * CH;
    return { mx, my };
}

// ═══════════════════════════════════════════════════════════════════
//  MAP COORD → GLOBE POSITION
// ═══════════════════════════════════════════════════════════════════
function _mapToGlobe(mx, my) {
    const lng = (mx / CW) * 360 - 180;
    const lat = 90 - (my / CH) * 180;
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new Vector3(
        GLOBE_R * Math.sin(phi) * Math.cos(theta),
        GLOBE_R * Math.cos(phi),
        GLOBE_R * Math.sin(phi) * Math.sin(theta)
    );
}

// ═══════════════════════════════════════════════════════════════════
//  TERRITORY CENTER → GLOBE POSITION
// ═══════════════════════════════════════════════════════════════════
function _terrCenter(tid) {
    const t = TERRITORIES[tid];
    return _mapToGlobe(t.cx, t.cy);
}

// ═══════════════════════════════════════════════════════════════════
//  STRUCTURE TYPES
// ═══════════════════════════════════════════════════════════════════
const STRUCT_TYPES = [
    { name: 'Tower',    hBlocks: 3, baseR: 0.4, wallColor: 0x888888 },
    { name: 'Castle',   hBlocks: 5, baseR: 0.6, wallColor: 0x666666 },
    { name: 'Fortress', hBlocks: 7, baseR: 0.8, wallColor: 0x555555 },
];

function _structType(troops) {
    if (troops >= 100) return 2;
    if (troops >= 50) return 1;
    return 0;
}

// ═══════════════════════════════════════════════════════════════════
//  VOXEL GLOBE DATA (built once from TopoJSON)
// ═══════════════════════════════════════════════════════════════════
let _voxelData = null;   // { tid, pos: Vector3, normal: Vector3 }[]
let _terrCenters = [];   // Vector3 per territory
let _terrVoxCount = [];  // voxel count per territory
let _geoToISO = [];      // geometry index → ISO numeric code string (for COUNTRY_DB)
let _terrLookupData = null; // ImageData for Emperor territory lookup
let _globeBuilt = false;

function _buildVoxelDataFromTopology(topoData) {
    // Extract country polygons from TopoJSON
    const countries = topoData.objects.countries;
    const topoArcs = topoData.arcs;
    const topoTransform = topoData.transform;

    // Build territory lookup canvas (Emperor territory polys on 960x640)
    _terrLookupData = _buildTerritoryCanvas();
    const lookupPixels = _terrLookupData.data;

    // Paint each country on a hidden canvas for voxel sampling
    const cvs = document.createElement('canvas');
    cvs.width = TOPO_W; cvs.height = TOPO_H;
    const ctx = cvs.getContext('2d');

    // Helper: decode arc points
    function decodeArc(arc) {
        const pts = [];
        let x = 0, y = 0;
        for (let i = 0; i < arc.length; i++) {
            x += arc[i][0]; y += arc[i][1];
            pts.push([x, y]);
        }
        return pts;
    }

    // Convert topo delta-encoded coords to pixel coordinates on TOPO canvas (360x180)
    function topoToPixel(x, y) {
        const lng = x * topoTransform.scale[0] + topoTransform.translate[0];
        const lat = y * topoTransform.scale[1] + topoTransform.translate[1];
        const px = lng + 180;          // -180..180 → 0..360
        const py = 90 - lat;           // 90..-85 → 5..175
        return [px, py];
    }

    // Helper: draw a single arc as a path
    function drawArcPath(ctx, arcIdx, isCW) {
        const arc = topoArcs[arcIdx < 0 ? ~arcIdx : arcIdx];
        const pts = decodeArc(arc);
        if (arcIdx < 0) pts.reverse();
        const first = topoToPixel(pts[0][0], pts[0][1]);
        ctx.moveTo(first[0], first[1]);
        for (let i = 1; i < pts.length; i++) {
            const p = topoToPixel(pts[i][0], pts[i][1]);
            ctx.lineTo(p[0], p[1]);
        }
    }

    // Paint each country polygon with a unique color
    // Use country index as both the R channel and for later color lookup
    // Also build geometry-index → ISO numeric ID mapping for COUNTRY_DB lookup
    _geoToISO = [];
    for (let ci = 0; ci < countries.geometries.length; ci++) {
        const geom = countries.geometries[ci];
        const id = geom.id || ci;
        _geoToISO[ci] = String(id); // store ISO numeric code
        const cr = (ci + 1) % 256, cg = 0, cb = 0;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.beginPath();

        // Collect all polygon rings to draw
        const polygons = geom.type === 'MultiPolygon' ? geom.arcs : [geom.arcs];
        for (const polygon of polygons) {
            for (let ai = 0; ai < polygon.length; ai++) {
                const ring = polygon[ai];
                if (typeof ring[0] === 'number') {
                    for (let ri = 0; ri < ring.length; ri++) {
                        drawArcPath(ctx, ring[ri], false);
                    }
                } else if (Array.isArray(ring[0])) {
                    for (let ri = 0; ri < ring.length; ri++) {
                        drawArcPath(ctx, ring[ri][0], false);
                    }
                } else if (typeof ring === 'number') {
                    drawArcPath(ctx, ring, false);
                }
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    const imgData = ctx.getImageData(0, 0, TOPO_W, TOPO_H);
    const data = imgData.data;

    // Sample voxels - show ALL land, map to Emperor territories where they overlap
    const voxels = [];
    const counts = new Array(TERRITORIES.length).fill(0);
    const cx = new Array(TERRITORIES.length).fill(0);
    const cy = new Array(TERRITORIES.length).fill(0);
    const cz = new Array(TERRITORIES.length).fill(0);

    for (let py = 0; py < TOPO_H; py += VOX_RES) {
        for (let px = 0; px < TOPO_W; px += VOX_RES) {
            const ci = (py * TOPO_W + px) * 4;
            // Check if pixel is land (R channel > 0)
            if (data[ci] === 0) continue;
            const countryIdx = data[ci] - 1; // R channel = country index + 1

            // Convert TOPO pixel to lat/lng
            const lng = (px / TOPO_W) * 360 - 180;
            const lat = 90 - (py / TOPO_H) * 180;

            // Compute globe position directly from lat/lng
            const phi = (90 - lat) * Math.PI / 180;
            const theta = (lng + 180) * Math.PI / 180;
            const r = GLOBE_R;
            const gx = -r * Math.sin(phi) * Math.cos(theta);
            const gy = r * Math.cos(phi);
            const gz = r * Math.sin(phi) * Math.sin(theta);
            const pos = new Vector3(gx, gy, gz);
            const normal = pos.clone().normalize();

            // Try to map to Emperor territory
            let tid = -1; // -1 = unclaimed land
            const mapCoord = _latlngToMap(lat, lng);
            const mx = Math.round(mapCoord.mx);
            const my = Math.round(mapCoord.my);
            if (mx >= 0 && mx < CW && my >= 0 && my < CH) {
                const li = (my * CW + mx) * 4;
                const t = lookupPixels[li] - 1; // R channel = tid + 1
                if (t >= 0 && t < TERRITORIES.length) {
                    tid = t;
                    counts[tid]++;
                    cx[tid] += pos.x; cy[tid] += pos.y; cz[tid] += pos.z;
                }
            }

            voxels.push({ tid, countryIdx, pos, normal });
        }
    }

    _voxelData = voxels;
    _terrVoxCount = counts;

    // Compute territory centers on globe
    _terrCenters = TERRITORIES.map((t, i) => {
        if (counts[i] === 0) return _mapToGlobe(t.cx, t.cy);
        return new Vector3(cx[i] / counts[i], cy[i] / counts[i], cz[i] / counts[i]);
    });

    console.log('[VoxelGlobe] Built', voxels.length, 'voxels from TopoJSON across', TERRITORIES.length, 'territories');
    _globeBuilt = true;
}

// ═══════════════════════════════════════════════════════════════════
//  BUILD GLOBE INSTANCED MESH
// ═══════════════════════════════════════════════════════════════════
function _buildGlobeMesh() {
    if (_voxelData === null) return null;
    const voxels = _voxelData;
    if (voxels.length === 0) return null;
    const geo = new BoxGeometry(VOX, VOX, VOX);
    const mat = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.6 });
    const mesh = new InstancedMesh(geo, mat, voxels.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dm = new Object3D();
    const col = new Color();

    for (let i = 0; i < voxels.length; i++) {
        const v = voxels[i];
        dm.position.copy(v.pos);
        dm.lookAt(0, 0, 0);
        dm.updateMatrix();
        mesh.setMatrixAt(i, dm.matrix);

        // Color: per-country palette from COUNTRY_DB for all land, empire tint for owned territories
        const cRGB = _countryColor(v.countryIdx, _geoToISO);
        if (v.tid >= 0 && v.tid < TERRITORIES.length) {
            const ts = null; // checked during updateTerritoryColor
            const tRGB = T_VOX[TERRITORIES[v.tid].terrain] || T_VOX.plains;
            // Blend country color with terrain color for owned territories
            col.setRGB(
                cRGB[0] * 0.5 + tRGB[0] * 0.5,
                cRGB[1] * 0.5 + tRGB[1] * 0.5,
                cRGB[2] * 0.5 + tRGB[2] * 0.5
            );
        } else {
            // Unclaimed land: full per-country color
            col.setRGB(cRGB[0], cRGB[1], cRGB[2]);
        }
        mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    mesh.userData = { terrIds: voxels.map(v => v.tid) };
    return mesh;
}

// ═══════════════════════════════════════════════════════════════════
//  BUILD STRUCTURE (DESTRUCTIBLE VOXEL BUILDING)
// ═══════════════════════════════════════════════════════════════════
function _buildStructure(tid, troops) {
    const center = _terrCenters[tid];
    const normal = center.clone().normalize();
    const st = STRUCT_TYPES[_structType(troops)];
    const rng = _prng(tid * 7919);

    const group = new Group();
    const blockGeo = new BoxGeometry(VOX * 0.9, VOX * 0.9, VOX * 0.9);
    const baseMat = new MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 });
    const blocks = [];

    const r = st.baseR;
    for (let y = 0; y < st.hBlocks; y++) {
        const lr = y === st.hBlocks - 1 ? r * 0.5 : (y === 0 ? r * 1.2 : r);
        const steps = Math.max(4, Math.floor(lr / VOX * 4));
        for (let a = 0; a < steps; a++) {
            const angle = (a / steps) * Math.PI * 2;
            const bx = Math.cos(angle) * lr;
            const bz = Math.sin(angle) * lr;

            const tangent = new Vector3(normal.z, 0, -normal.x).normalize();
            const bitangent = new Vector3().crossVectors(normal, tangent).normalize();

            const pos = center.clone()
                .add(tangent.multiplyScalar(bx))
                .add(bitangent.multiplyScalar(bz))
                .add(normal.clone().multiplyScalar(VOX * (y + 1)));

            const mat = baseMat.clone();
            mat.color.set(st.wallColor);
            mat.color.multiplyScalar(0.7 + y * 0.05);

            const block = new Mesh(blockGeo, mat);
            block.position.copy(pos);
            block.lookAt(0, 0, 0);
            block.castShadow = true;
            block.userData = { isBlock: true, hp: 100, tid, originalPos: pos.clone() };
            blocks.push(block);
            group.add(block);
        }
    }

    // Gate
    const gatePos = center.clone().add(normal.clone().multiplyScalar(VOX * 1.5));
    const gateMat = new MeshStandardMaterial({ color: 0x886644, emissive: 0x886644, emissiveIntensity: 0.2 });
    const gate = new Mesh(blockGeo, gateMat);
    gate.position.copy(gatePos);
    gate.lookAt(0, 0, 0);
    gate.userData = { isGate: true, tid };
    group.add(gate);

    group.userData = { tid, type: st.name, blocks, gate, hp: 100, maxHp: 100 };
    return group;
}

// ═══════════════════════════════════════════════════════════════════
//  DEBRIS SYSTEM
// ═══════════════════════════════════════════════════════════════════
class _DebrisSystem {
    constructor(scene) {
        this.scene = scene;
        this.pieces = [];
        this.group = new Group();
        scene.add(this.group);
    }

    spawn(pos, color, count = 8) {
        const geo = new BoxGeometry(VOX * 0.4, VOX * 0.4, VOX * 0.4);
        for (let i = 0; i < count; i++) {
            const mat = new MeshStandardMaterial({ color, roughness: 0.7, transparent: true });
            const m = new Mesh(geo, mat);
            m.position.copy(pos);
            m.userData = {
                vel: new Vector3(
                    (Math.random() - 0.5) * 0.15,
                    Math.random() * 0.1 + 0.05,
                    (Math.random() - 0.5) * 0.15
                ),
                rot: new Vector3(Math.random() * 0.2, Math.random() * 0.2, Math.random() * 0.2),
                life: 60 + Math.random() * 40,
                maxLife: 100
            };
            this.pieces.push(m);
            this.group.add(m);
        }
    }

    update() {
        for (let i = this.pieces.length - 1; i >= 0; i--) {
            const p = this.pieces[i];
            const d = p.userData;
            d.life--;
            if (d.life <= 0) {
                this.group.remove(p);
                p.geometry.dispose();
                p.material.dispose();
                this.pieces.splice(i, 1);
                continue;
            }
            p.position.add(d.vel);
            d.vel.y -= 0.003;
            p.rotation.x += d.rot.x;
            p.rotation.z += d.rot.z;
            p.material.opacity = Math.max(0, d.life / d.maxLife);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  DUST PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════════
class _DustSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.group = new Group();
        scene.add(this.group);
    }

    spawn(pos, count = 6) {
        const geo = new SphereGeometry(VOX * 0.15, 4, 4);
        for (let i = 0; i < count; i++) {
            const mat = new MeshBasicMaterial({ color: 0x998866, transparent: true, opacity: 0.6 });
            const m = new Mesh(geo, mat);
            m.position.copy(pos);
            m.userData = {
                vel: new Vector3(
                    (Math.random() - 0.5) * 0.03,
                    0.02 + Math.random() * 0.03,
                    (Math.random() - 0.5) * 0.03
                ),
                life: 40 + Math.random() * 20,
                maxLife: 60
            };
            this.particles.push(m);
            this.group.add(m);
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const d = p.userData;
            d.life--;
            if (d.life <= 0) {
                this.group.remove(p);
                p.geometry.dispose();
                p.material.dispose();
                this.particles.splice(i, 1);
                continue;
            }
            p.position.add(d.vel);
            d.vel.y -= 0.0005; // slow drift
            p.material.opacity = Math.max(0, (d.life / d.maxLife) * 0.6);
            p.scale.multiplyScalar(1.01); // expand
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  GOLD COIN SYSTEM
// ═══════════════════════════════════════════════════════════════════
class _CoinSystem {
    constructor(scene) {
        this.scene = scene;
        this.coins = [];
        this.group = new Group();
        scene.add(this.group);
    }

    spawn(pos, count) {
        count = count || (3 + Math.floor(Math.random() * 4)); // 3-6 coins
        const geo = new CylinderGeometry(VOX * 0.25, VOX * 0.25, VOX * 0.08, 8);
        for (let i = 0; i < count; i++) {
            const mat = new MeshStandardMaterial({
                color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.3,
                roughness: 0.2, metalness: 0.9, transparent: true
            });
            const m = new Mesh(geo, mat);
            m.position.copy(pos);
            m.rotation.x = Math.PI * 0.5;
            m.userData = {
                vel: new Vector3(
                    (Math.random() - 0.5) * 0.06,
                    0.08 + Math.random() * 0.06,
                    (Math.random() - 0.5) * 0.06
                ),
                spinVel: (Math.random() - 0.5) * 0.2,
                bounces: 0,
                maxBounces: 3,
                bounceEnergy: 0.5,
                floorY: pos.y - 0.5,
                life: 120 + Math.random() * 60, // 2-3 seconds at 60fps
                maxLife: 180
            };
            this.coins.push(m);
            this.group.add(m);
        }
    }

    update() {
        for (let i = this.coins.length - 1; i >= 0; i--) {
            const coin = this.coins[i];
            const d = coin.userData;
            d.life--;
            if (d.life <= 0) {
                this.group.remove(coin);
                coin.geometry.dispose();
                coin.material.dispose();
                this.coins.splice(i, 1);
                continue;
            }
            // Gravity
            d.vel.y -= 0.004;
            coin.position.add(d.vel);
            // Spin
            coin.rotation.y += d.spinVel;
            // Bounce off floor
            if (coin.position.y < d.floorY && d.vel.y < 0) {
                coin.position.y = d.floorY;
                d.vel.y = -d.vel.y * d.bounceEnergy;
                d.bounces++;
                if (d.bounces >= d.maxBounces) {
                    d.vel.y = 0;
                    d.vel.x *= 0.3;
                    d.vel.z *= 0.3;
                }
            }
            // Fade near end
            const fadeStart = d.maxLife * 0.6;
            if (d.life < fadeStart) {
                coin.material.opacity = Math.max(0, d.life / fadeStart);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  VICTORY PARTICLES
// ═══════════════════════════════════════════════════════════════════
class _VictoryParticles {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.group = new Group();
        scene.add(this.group);
        this.active = false;
    }

    burst(center, color, count = 30) {
        this.active = true;
        const geo = new BoxGeometry(VOX * 0.3, VOX * 0.3, VOX * 0.3);
        for (let i = 0; i < count; i++) {
            const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 1 });
            const m = new Mesh(geo, mat);
            m.position.copy(center);
            const dir = center.clone().normalize();
            m.userData = {
                vel: dir.multiplyScalar(0.05 + Math.random() * 0.1).add(
                    new Vector3((Math.random() - 0.5) * 0.08, Math.random() * 0.08, (Math.random() - 0.5) * 0.08)
                ),
                life: 40 + Math.random() * 30,
                maxLife: 70
            };
            this.particles.push(m);
            this.group.add(m);
        }
    }

    update() {
        if (this.particles.length === 0) { this.active = false; return; }
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const d = p.userData;
            d.life--;
            if (d.life <= 0) {
                this.group.remove(p);
                p.geometry.dispose();
                p.material.dispose();
                this.particles.splice(i, 1);
                continue;
            }
            p.position.add(d.vel);
            p.material.opacity = d.life / d.maxLife;
            p.scale.multiplyScalar(0.98);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  NON-EUCLIDEAN INTERIOR DUNGEON GENERATOR
//  Impossible geometry, portal rooms, shifting corridors
// ═══════════════════════════════════════════════════════════════════
function _generateDungeon(tid) {
    const rng = _prng(tid * 1301 + 7);
    const GRID = 12;
    const grid = new Array(GRID * GRID).fill(0); // 0=empty
    const rooms = [];
    const connections = [];
    const portals = [];      // non-euclidean portal pairs
    const traps = [];        // environmental traps

    // ── BSP-style room placement with scaling ──
    const depth = Math.floor(3 + rng() * 3); // 3-5 depth levels = scaling factor
    const numRooms = 5 + Math.floor(rng() * 5) + Math.min(depth, 3); // 5-13 rooms
    let attempts = 0;
    while (rooms.length < numRooms && attempts < 300) {
        attempts++;
        const rw = 2 + Math.floor(rng() * 4); // 2-5
        const rh = 2 + Math.floor(rng() * 4);
        const rx = Math.floor(rng() * (GRID - rw));
        const ry = Math.floor(rng() * (GRID - rh));

        let overlap = false;
        for (const room of rooms) {
            if (rx < room.x + room.w + 1 && rx + rw + 1 > room.x &&
                ry < room.y + room.h + 1 && ry + rh + 1 > room.y) {
                overlap = true;
                break;
            }
        }
        if (overlap) continue;

        // Assign special room types
        let type = ROOM_TYPES[rooms.length % ROOM_TYPES.length];
        const roomIdx = rooms.length;

        // First room = entrance, last = throne/boss
        if (roomIdx === 0) type = 'chamber';
        if (roomIdx === numRooms - 1) type = 'throne';

        // 20% chance of vault (treasure), 15% chance of crypt (dangerous)
        if (roomIdx > 0 && roomIdx < numRooms - 1) {
            const r = rng();
            if (r < 0.20) type = 'vault';
            else if (r < 0.35) type = 'crypt';
        }

        rooms.push({
            x: rx, y: ry, w: rw, h: rh, type,
            centerWorld: { x: (rx + rw / 2) * 4, z: (ry + rh / 2) * 4 },
            depth: roomIdx,  // depth level for scaling
            isPortalRoom: false,
            portalTarget: -1,
            shifting: false, // corridor shift flag
            shiftPhase: 0,
        });

        for (let gy = ry; gy < ry + rh; gy++) {
            for (let gx = rx; gx < rx + rw; gx++) {
                grid[gy * GRID + gx] = rooms.length;
            }
        }
    }

    // ── Connect rooms with L-shaped corridors ──
    for (let i = 1; i < rooms.length; i++) {
        const a = rooms[i - 1], b = rooms[i];
        const ax = Math.floor(a.x + a.w / 2), ay = Math.floor(a.y + a.h / 2);
        const bx = Math.floor(b.x + b.w / 2), by = Math.floor(b.y + b.h / 2);
        connections.push({ from: i - 1, to: i, type: 'normal' });

        let cx = ax, cy = ay;
        while (cx !== bx) {
            cx += cx < bx ? 1 : -1;
            if (grid[cy * GRID + cx] === 0) grid[cy * GRID + cx] = -1;
        }
        while (cy !== by) {
            cy += cy < by ? 1 : -1;
            if (grid[cy * GRID + bx] === 0) grid[cy * GRID + bx] = -1;
        }
    }

    // ── NON-EUCLIDEAN: Portal connections between distant rooms ──
    if (rooms.length >= 5) {
        const portalCount = 1 + Math.floor(rng() * 2); // 1-2 portal pairs
        for (let p = 0; p < portalCount; p++) {
            const a = Math.floor(rng() * (rooms.length - 2)) + 1;
            let b = Math.floor(rng() * (rooms.length - 2)) + 1;
            while (b === a) b = Math.floor(rng() * (rooms.length - 2)) + 1;
            rooms[a].isPortalRoom = true;
            rooms[a].portalTarget = b;
            rooms[b].isPortalRoom = true;
            rooms[b].portalTarget = a;
            connections.push({ from: a, to: b, type: 'portal' });
            portals.push({ a, b });
        }
    }

    // ── SHIFTING CORRIDORS: some corridors oscillate ──
    if (connections.length > 3) {
        const shiftCount = Math.floor(rng() * 2) + 1;
        for (let s = 0; s < shiftCount; s++) {
            const ci = Math.floor(rng() * connections.length);
            if (connections[ci].type === 'normal') {
                connections[ci].type = 'shifting';
                connections[ci].shiftPhase = rng() * Math.PI * 2;
            }
        }
    }

    // ── ENVIRONMENTAL TRAPS per room type ──
    const trapTypes = {
        throne:   { name: 'Pressure Plates', damage: 5 },
        barracks: { name: 'Arrow Trap', damage: 3 },
        academy:  { name: 'Spell Trap', damage: 4 },
        vault:    { name: 'Poison Gas', damage: 6 },
        armory:   { name: 'Spike Floor', damage: 5 },
        chamber:  { name: 'Tripwire', damage: 2 },
        crypt:    { name: 'Cursed Ground', damage: 8 },
        forge:    { name: 'Lava Pit', damage: 7 },
    };
    for (let ri = 0; ri < rooms.length; ri++) {
        if (rng() < 0.3) { // 30% chance of trap
            traps.push({
                roomIdx: ri,
                ...trapTypes[rooms[ri].type],
                x: (rooms[ri].x + 0.5 + rng() * (rooms[ri].w - 1)) * 4,
                z: (rooms[ri].y + 0.5 + rng() * (rooms[ri].h - 1)) * 4,
                triggered: false,
                cooldown: 0,
            });
        }
    }

    // ── Generate enemies for each room (scales with depth) ──
    const enemies = [];
    for (let ri = 0; ri < rooms.length; ri++) {
        const room = rooms[ri];
        const depthMult = 1 + room.depth * 0.15; // deeper = harder
        const numEnemies = Math.ceil((1 + rng() * 3) * depthMult);
        for (let ei = 0; ei < numEnemies; ei++) {
            const etype = ri === 0 ? 'grunt' : ri === rooms.length - 1 ? 'boss' :
                          ENEMY_TYPES[Math.floor(rng() * 4)];
            const ex = (room.x + 0.5 + rng() * (room.w - 1)) * 4;
            const ez = (room.y + 0.5 + rng() * (room.h - 1)) * 4;
            const isBoss = etype === 'boss';
            const hpMult = isBoss ? 3 : depthMult;
            enemies.push({
                type: etype,
                x: ex, y: 0.35, z: ez,
                hp: Math.floor((isBoss ? 100 : etype === 'knight' ? 50 : etype === 'mage' ? 30 : etype === 'archer' ? 25 : 20) * hpMult),
                maxHp: Math.floor((isBoss ? 100 : etype === 'knight' ? 50 : etype === 'mage' ? 30 : etype === 'archer' ? 25 : 20) * hpMult),
                color: ENEMY_COLORS[etype],
                size: isBoss ? 0.6 : 0.35,
                isBoss: isBoss,
                bobOffset: rng() * Math.PI * 2,
                dead: false,
                roomIdx: ri
            });
        }
    }

    return { grid, GRID, rooms, connections, enemies, portals, traps, depth };
}

// ═══════════════════════════════════════════════════════════════════
//  BUILD 3D DUNGEON MESH
// ═══════════════════════════════════════════════════════════════════
function _buildDungeon3D(dungeon) {
    const group = new Group();
    const { grid, GRID, rooms, connections, enemies } = dungeon;
    const WALL_H = 3, CELL = 4;

    const wallMat = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
    const floorMat = new MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 });
    const ceilMat = new MeshStandardMaterial({ roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0.7 });

    // Build walls, floor, ceiling for each cell
    const wallGeo = new BoxGeometry(CELL, WALL_H, CELL);
    const floorGeo = new PlaneGeometry(CELL, CELL);

    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const val = grid[gy * GRID + gx];
            if (val === 0) continue;

            const wx = gx * CELL + CELL / 2;
            const wz = gy * CELL + CELL / 2;

            // Floor
            const floor = new Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(wx, 0, wz);
            floor.receiveShadow = true;
            group.add(floor);

            // Ceiling
            const ceil = new Mesh(floorGeo, ceilMat);
            ceil.rotation.x = Math.PI / 2;
            ceil.position.set(wx, WALL_H, wz);
            group.add(ceil);

            // Walls on edges adjacent to empty cells
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dx, dy] of dirs) {
                const nx = gx + dx, ny = gy + dy;
                if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID || grid[ny * GRID + nx] === 0) {
                    // Wall on this side
                    let wallColor;
                    if (val > 0) {
                        wallColor = ROOM_COLORS[rooms[val - 1].type] || 0x696969;
                    } else {
                        wallColor = 0x555555;
                    }
                    const wMat = wallMat.clone();
                    wMat.color.set(wallColor);

                    let wGeo, wPos;
                    if (dx !== 0) {
                        wGeo = new PlaneGeometry(CELL, WALL_H);
                        wPos = new Vector3(wx + dx * CELL / 2, WALL_H / 2, wz);
                    } else {
                        wGeo = new PlaneGeometry(CELL, WALL_H);
                        wPos = new Vector3(wx, WALL_H / 2, wz + dy * CELL / 2);
                    }
                    const wall = new Mesh(wGeo, wMat);
                    wall.position.copy(wPos);
                    if (dx === 1) wall.rotation.y = Math.PI;
                    else if (dy === 1) wall.rotation.y = Math.PI / 2;
                    else if (dy === -1) wall.rotation.y = -Math.PI / 2;
                    wall.receiveShadow = true;
                    group.add(wall);
                }
            }

            // Torch lights in rooms
            if (val > 0 && gx % 2 === 0 && gy % 2 === 0) {
                const torch = new PointLight(0xff8833, 1.5, 10);
                torch.position.set(wx, WALL_H * 0.8, wz);
                group.add(torch);
            }
        }
    }

    // Ambient light
    const amb = new AmbientLight(0x222233, 0.5);
    group.add(amb);

    // ── PORTAL VISUALS (non-euclidean teleporters) ──
    if (dungeon.portals) {
        for (const portal of dungeon.portals) {
            const roomA = rooms[portal.a];
            const roomB = rooms[portal.b];
            if (!roomA || !roomB) continue;

            // Glowing ring at each portal room center
            const portalGeo = new RingGeometry(0.6, 1.2, 16);
            const portalMat = new MeshBasicMaterial({
                color: 0x8800ff, side: DoubleSide,
                transparent: true, opacity: 0.7,
            });

            const ringA = new Mesh(portalGeo, portalMat);
            ringA.rotation.x = -Math.PI / 2;
            ringA.position.set(roomA.centerWorld.x, 0.1, roomA.centerWorld.z);
            ringA.userData.isPortal = true;
            ringA.userData.portalTarget = portal.b;
            group.add(ringA);

            const ringB = new Mesh(portalGeo, portalMat.clone());
            ringB.rotation.x = -Math.PI / 2;
            ringB.position.set(roomB.centerWorld.x, 0.1, roomB.centerWorld.z);
            ringB.userData.isPortal = true;
            ringB.userData.portalTarget = portal.a;
            group.add(ringB);

            // Portal point lights
            const portalLightA = new PointLight(0x8800ff, 2, 8);
            portalLightA.position.set(roomA.centerWorld.x, 1.5, roomA.centerWorld.z);
            group.add(portalLightA);

            const portalLightB = new PointLight(0x8800ff, 2, 8);
            portalLightB.position.set(roomB.centerWorld.x, 1.5, roomB.centerWorld.z);
            group.add(portalLightB);
        }
    }

    // ── TRAP MARKERS (danger indicators) ──
    if (dungeon.traps) {
        for (const trap of dungeon.traps) {
            // Red glow on the floor
            const trapGeo = new CircleGeometry(0.4, 8);
            const trapMat = new MeshBasicMaterial({
                color: 0xff2200, transparent: true, opacity: 0.4,
            });
            const trapMarker = new Mesh(trapGeo, trapMat);
            trapMarker.rotation.x = -Math.PI / 2;
            trapMarker.position.set(trap.x, 0.05, trap.z);
            trapMarker.userData.isTrap = true;
            trapMarker.userData.trapIdx = dungeon.traps.indexOf(trap);
            group.add(trapMarker);

            // Subtle red point light
            const trapLight = new PointLight(0xff2200, 0.5, 3);
            trapLight.position.set(trap.x, 0.5, trap.z);
            group.add(trapLight);
        }
    }

    // ── SHIFTING CORRIDOR VISUAL INDICATORS ──
    if (dungeon.connections) {
        for (const conn of dungeon.connections) {
            if (conn.type === 'shifting') {
                const roomA = rooms[conn.from];
                const roomB = rooms[conn.to];
                if (!roomA || !roomB) continue;
                // Yellow warning line between shifting corridor rooms
                const midX = (roomA.centerWorld.x + roomB.centerWorld.x) / 2;
                const midZ = (roomA.centerWorld.z + roomB.centerWorld.z) / 2;
                const shiftLight = new PointLight(0xffaa00, 0.8, 6);
                shiftLight.position.set(midX, 1, midZ);
                shiftLight.userData.isShiftLight = true;
                group.add(shiftLight);
            }
        }
    }

    return group;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN RENDERER3D CLASS
// ═══════════════════════════════════════════════════════════════════
export class Renderer3D extends Renderer {
    constructor(game, glCanvas) {
        console.log('[VoxelGlobe3D] Constructor start');
        super(game);
        this._glCanvas = glCanvas;
        this._3dReady = false;
        this._loading = true;
        this._cmdVision = false;
        this._cmdVisionScan = 0;
        this._structures = [];
        this._debris = null;
        this._dust = null;
        this._coins = null;
        this._victoryParts = null;
        this._stars = null;
        this._likedTerritories = new Set();

        // Interior dungeon state
        this._view = 'globe'; // 'globe' or 'interior'
        this._interiorGroup = null;
        this._dungeonData = null;
        this._player = null; // player 3D mesh
        this._enemyMeshes = [];
        this._transition = { active: false, alpha: 0, phase: 'none', target: null };
        this._playerPos = { x: 0, z: 0 };
        this._playerDir = { x: 0, z: 1 };
        this._keys = {};

        // Flat 2D map state
        this._flatMapImg = new Image();
        this._flatMapLoaded = false;
        this._flatMapZoom = 1;
        this._flatMapOffX = 0;
        this._flatMapOffY = 0;
        this._flatMapDrag = false;
        this._flatMapDragStartX = 0;
        this._flatMapDragStartY = 0;
        this._flatMapDragOffX = 0;
        this._flatMapDragOffY = 0;
        this._loadFlatMap();

        try {
            this._initThree();
            this._buildStars();
            this._debris = new _DebrisSystem(this._scene);
            this._dust = new _DustSystem(this._scene);
            this._coins = new _CoinSystem(this._scene);
            this._victoryParts = new _VictoryParticles(this._scene);
            this._initKeys();
            this._loadLiked();
            _AgentSystem.init(this.g);
            // Async globe build
            this.buildGlobe();
            console.log('[VoxelGlobe3D] Scene initialized, loading globe...');
        } catch (e) {
            console.error('[VoxelGlobe3D] INIT FAILED:', e.message, e.stack);
            this._loading = false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  INIT THREE.JS
    // ═══════════════════════════════════════════════════════════
    _initThree() {
        const cv = this._glCanvas;
        const g = this.g;

        this._renderer = new WebGLRenderer({
            canvas: cv, antialias: true, alpha: false,
            powerPreference: 'high-performance'
        });
        this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this._renderer.setSize(g.W, g.H);
        this._renderer.toneMapping = ACESFilmicToneMapping;
        this._renderer.toneMappingExposure = 1.6;
        this._renderer.outputColorSpace = SRGBColorSpace;
        this._renderer.shadowMap.enabled = true;
        this._renderer.shadowMap.type = 2; // PCFSoftShadowMap

        this._scene = new Scene();
        this._scene.background = new Color(0x1a5276);
        this._scene.fog = new FogExp2(0x1a5276, 0.004);

        this._camera = new PerspectiveCamera(50, g.W / g.H, 0.1, 300);
        this._camera.position.set(0, 3, 18);

        this._controls = this._createOrbitControls(cv);
        this._controls.target.set(0, 0, 0);

        // Lights — boosted for clear visibility
        const hemi = new HemisphereLight(0x88aacc, 0x445566, 0.6);
        this._scene.add(hemi);

        this._sun = new DirectionalLight(0xfff5e0, 1.4);
        this._sun.position.set(8, 12, 10);
        this._sun.castShadow = true;
        this._sun.shadow.mapSize.set(1024, 1024);
        this._sun.shadow.camera.near = 0.5;
        this._sun.shadow.camera.far = 50;
        this._sun.shadow.camera.left = -15;
        this._sun.shadow.camera.right = 15;
        this._sun.shadow.camera.top = 15;
        this._sun.shadow.camera.bottom = -15;
        this._scene.add(this._sun);

        const fill = new DirectionalLight(0x88aacc, 0.5);
        fill.position.set(-10, 5, -8);
        this._scene.add(fill);

        const ambient = new AmbientLight(0x445566, 0.5);
        this._scene.add(ambient);

        this._raycaster = new Raycaster();
        this._mouse = new Vector2();

        this._onResize = () => {
            const w = window.innerWidth, h = window.innerHeight;
            this._camera.aspect = w / h;
            this._camera.updateProjectionMatrix();
            this._renderer.setSize(w, h);
        };
        window.addEventListener('resize', this._onResize);
    }

    // ═══════════════════════════════════════════════════════════
    //  ORBIT CONTROLS (manual, plain object target)
    // ═══════════════════════════════════════════════════════════
    _createOrbitControls(element) {
        const self = this;
        const ctrl = {
            enabled: true,
            dampingFactor: 0.08,
            minDistance: 10,
            maxDistance: 40,
            minPolarAngle: 0.15,
            maxPolarAngle: Math.PI * 0.85,
            theta: 0,
            phi: Math.PI * 0.35,
            radius: 18,
            targetX: 0, targetY: 0, targetZ: 0,
            _isDown: false,
            _button: 0,
            _prevX: 0,
            _prevY: 0
        };

        element.addEventListener('contextmenu', e => e.preventDefault());

        element.addEventListener('wheel', e => {
            if (!ctrl.enabled) return;
            e.preventDefault();
            const d = e.deltaY * 0.01;
            ctrl.radius = Math.max(ctrl.minDistance, Math.min(ctrl.maxDistance, ctrl.radius + ctrl.radius * d));
        }, { passive: false });

        // Left-click drag to orbit
        element.addEventListener('pointerdown', e => {
            if (e.button === 0) {
                ctrl._isDown = true;
                ctrl._button = e.button;
                ctrl._prevX = e.clientX;
                ctrl._prevY = e.clientY;
            }
        });

        window.addEventListener('pointermove', e => {
            if (!ctrl._isDown) return;
            const dx = (e.clientX - ctrl._prevX) * 0.005;
            const dy = (e.clientY - ctrl._prevY) * 0.005;
            ctrl._prevX = e.clientX;
            ctrl._prevY = e.clientY;
            ctrl.theta -= dx;
            ctrl.phi = Math.max(ctrl.minPolarAngle, Math.min(ctrl.maxPolarAngle, ctrl.phi - dy));
        });

        window.addEventListener('pointerup', e => {
            if (e.button === ctrl._button) ctrl._isDown = false;
        });

        ctrl.update = () => {
            const sinPhi = Math.sin(ctrl.phi);
            const cosPhi = Math.cos(ctrl.phi);
            const sinTheta = Math.sin(ctrl.theta);
            const cosTheta = Math.cos(ctrl.theta);
            self._camera.position.set(
                ctrl.targetX + ctrl.radius * sinPhi * cosTheta,
                ctrl.targetY + ctrl.radius * cosPhi,
                ctrl.targetZ + ctrl.radius * sinPhi * sinTheta
            );
            self._camera.lookAt(ctrl.targetX, ctrl.targetY, ctrl.targetZ);
        };

        ctrl.target = {
            x: 0, y: 0, z: 0,
            lerp(target, alpha) {
                ctrl.targetX += (target.x - ctrl.targetX) * alpha;
                ctrl.targetY += (target.y - ctrl.targetY) * alpha;
                ctrl.targetZ += (target.z - ctrl.targetZ) * alpha;
            },
            copy(v) {
                ctrl.targetX = v.x; ctrl.targetY = v.y; ctrl.targetZ = v.z;
            },
            set(x, y, z) {
                ctrl.targetX = x; ctrl.targetY = y; ctrl.targetZ = z;
            }
        };

        // Initialize from camera position
        const pos = self._camera.position;
        ctrl.radius = Math.max(ctrl.minDistance, Math.min(ctrl.maxDistance, pos.length()));
        ctrl.phi = Math.max(ctrl.minPolarAngle, Math.min(ctrl.maxPolarAngle,
            Math.acos(Math.min(1, Math.max(-1, pos.y / ctrl.radius)))));
        ctrl.theta = Math.atan2(pos.z, pos.x);

        return ctrl;
    }

    // ═══════════════════════════════════════════════════════════
    //  ASYNC GLOBE BUILD (fetch TopoJSON)
    // ═══════════════════════════════════════════════════════════
    async buildGlobe() {
        try {
            // ── Load world map texture ──
            const mapTex = await new Promise((resolve, reject) => {
                const loader = new (THREE.TextureLoader)();
                loader.load('assets/world-map.jpg', resolve, undefined, reject);
            });
            mapTex.colorSpace = SRGBColorSpace;
            mapTex.wrapS = THREE.RepeatWrapping;
            this._mapTexture = mapTex;

            const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
            const topoData = await resp.json();
            _buildVoxelDataFromTopology(topoData);

            this._globeGroup = new Group();

            // ── Textured inner sphere (map image) ──
            const mapGeo = new SphereGeometry(GLOBE_R * 0.98, 128, 64);
            const mapMat = new MeshBasicMaterial({ map: mapTex });
            this._mapSphere = new Mesh(mapGeo, mapMat);
            this._globeGroup.add(this._mapSphere);

            const mesh = _buildGlobeMesh();
            if (mesh) {
                this._globeMesh = mesh;
                this._globeGroup.add(mesh);

                // Atmosphere glow
                const atmosGeo = new SphereGeometry(GLOBE_R * 1.03, 48, 24);
                const atmosMat = new MeshBasicMaterial({
                    color: 0x55aadd, transparent: true, opacity: 0.12, side: BackSide
                });
                const atmos = new Mesh(atmosGeo, atmosMat);
                this._globeGroup.add(atmos);
                this._atmosphere = atmos;

                this._scene.add(this._globeGroup);
                this._buildLabels();
                this._buildStructures();
                this._buildSelectionRing();
            }
            this._3dReady = true;
            this._loading = false;
            console.log('[VoxelGlobe3D] Globe built from TopoJSON + map texture');
        } catch (e) {
            console.warn('[VoxelGlobe3D] TopoJSON fetch failed, using fallback:', e.message);
            this._buildFallbackGlobe();
        }
    }

    // Fallback: build from Emperor territory polygons only
    _buildFallbackGlobe() {
        // Build territory canvas and sample voxels directly
        const imgData = _buildTerritoryCanvas();
        const data = imgData.data;
        const voxels = [];
        const counts = new Array(TERRITORIES.length).fill(0);
        const cx = new Array(TERRITORIES.length).fill(0);
        const cy = new Array(TERRITORIES.length).fill(0);
        const cz = new Array(TERRITORIES.length).fill(0);

        for (let py = 0; py < CH; py += VOX_RES) {
            for (let px = 0; px < CW; px += VOX_RES) {
                const ci = data[((py * CW + px) * 4)];
                if (ci === 0) continue;
                const tid = ci - 1;
                if (tid < 0 || tid >= TERRITORIES.length) continue;
                const pos = _mapToGlobe(px, py);
                const normal = pos.clone().normalize();
                voxels.push({ tid, pos, normal });
                counts[tid]++;
                cx[tid] += pos.x; cy[tid] += pos.y; cz[tid] += pos.z;
            }
        }

        _voxelData = voxels;
        _terrVoxCount = counts;
        _terrCenters = TERRITORIES.map((t, i) => {
            if (counts[i] === 0) return _mapToGlobe(t.cx, t.cy);
            return new Vector3(cx[i] / counts[i], cy[i] / counts[i], cz[i] / counts[i]);
        });
        _globeBuilt = true;

        const mesh = _buildGlobeMesh();
        if (mesh) {
            this._globeMesh = mesh;
            this._globeGroup = new Group();
            this._globeGroup.add(mesh);

            const atmosGeo = new SphereGeometry(GLOBE_R * 1.02, 48, 24);
            const atmosMat = new MeshBasicMaterial({
                color: 0x4488cc, transparent: true, opacity: 0.05, side: BackSide
            });
            this._globeGroup.add(new Mesh(atmosGeo, atmosMat));
            this._scene.add(this._globeGroup);

            this._buildLabels();
            this._buildStructures();
            this._buildSelectionRing();
        }
        this._3dReady = true;
        this._loading = false;
    }

    // ═══════════════════════════════════════════════════════════
    //  BUILD STARS
    // ═══════════════════════════════════════════════════════════
    _buildStars() {
        const geo = new BufferGeometry();
        const positions = new Float32Array(3000 * 3);
        for (let i = 0; i < 3000; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 200;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
        }
        geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
        this._stars = new Points(geo, new PointsMaterial({
            color: 0xffffff, size: 0.15, sizeAttenuation: true
        }));
        this._scene.add(this._stars);
    }

    // ═══════════════════════════════════════════════════════════
    //  BUILD LABELS
    // ═══════════════════════════════════════════════════════════
    _buildLabels() {
        this._terrLabels = [];
        for (let i = 0; i < TERRITORIES.length; i++) {
            if (!_terrCenters[i]) continue;
            const center = _terrCenters[i];
            const cvs = document.createElement('canvas');
            cvs.width = 256; cvs.height = 64;
            const tex = new CanvasTexture(cvs);
            const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: false });
            const sprite = new Sprite(mat);
            sprite.position.copy(center.clone().normalize().multiplyScalar(GLOBE_R + 0.8));
            sprite.scale.set(8, 2, 1);
            this._globeGroup.add(sprite);
            this._terrLabels[i] = { sprite, canvas: cvs, tex };
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  BUILD SELECTION RING
    // ═══════════════════════════════════════════════════════════
    _buildSelectionRing() {
        const ringGeo = new RingGeometry(GLOBE_R + 0.15, GLOBE_R + 0.3, 32);
        const ringMat = new MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.5, side: DoubleSide });
        this._selectRing = new Mesh(ringGeo, ringMat);
        this._selectRing.visible = false;
        this._scene.add(this._selectRing);
    }

    // ═══════════════════════════════════════════════════════════
    //  BUILD STRUCTURES
    // ═══════════════════════════════════════════════════════════
    _buildStructures() {
        const g = this.g;
        this._structures = [];
        this._structGroup = new Group();
        this._scene.add(this._structGroup);

        for (let i = 0; i < TERRITORIES.length; i++) {
            if (!_terrCenters[i]) continue;
            const ts = g.ts ? g.ts[i] : null;
            const troops = ts ? (ts.troops || 30) : 30;
            const struct = _buildStructure(i, troops);
            struct.visible = false;
            this._structGroup.add(struct);
            this._structures[i] = struct;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  KEYBOARD INPUT (for dungeon)
    // ═══════════════════════════════════════════════════════════
    _initKeys() {
        window.addEventListener('keydown', e => { this._keys[e.code] = true; });
        window.addEventListener('keyup', e => { this._keys[e.code] = false; });
    }

    // ═══════════════════════════════════════════════════════════
    //  COMMANDER VISION TOGGLE
    // ═══════════════════════════════════════════════════════════
    toggleCommanderVision() {
        this._cmdVision = !this._cmdVision;
        if (this._cmdVision) {
            this._savedRadius = this._controls.radius;
            this._controls.radius = 12;
            for (const s of this._structures) {
                if (!s) continue;
                s.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.userData._origMat = child.material;
                        child.material = child.material.clone();
                        child.material.wireframe = true;
                        child.material.transparent = true;
                        child.material.opacity = 0.55;
                    }
                });
                s.visible = true;
            }
        } else {
            if (this._savedRadius) this._controls.radius = this._savedRadius;
            for (const s of this._structures) {
                if (!s) continue;
                s.traverse(child => {
                    if (child.isMesh && child.userData._origMat) {
                        child.material.dispose();
                        child.material = child.userData._origMat;
                        delete child.userData._origMat;
                    }
                });
                this._updateStructureVisibility();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  ENTER INTERIOR DUNGEON
    // ═══════════════════════════════════════════════════════════
    _enterInterior(tid) {
        if (!tid && tid !== 0) return;
        this._dungeonData = _generateDungeon(tid);
        this._interiorGroup = _buildDungeon3D(this._dungeonData);
        this._scene.add(this._interiorGroup);

        // Hide globe
        if (this._globeGroup) this._globeGroup.visible = false;
        if (this._structGroup) this._structGroup.visible = false;

        // Create player
        const pGeo = new BoxGeometry(0.35, 0.35, 0.35);
        const pMat = new MeshStandardMaterial({
            color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 0.3,
            roughness: 0.3, metalness: 0.5
        });
        this._player = new Mesh(pGeo, pMat);
        const firstRoom = this._dungeonData.rooms[0];
        if (firstRoom) {
            this._playerPos.x = firstRoom.centerWorld.x;
            this._playerPos.z = firstRoom.centerWorld.z;
        }
        this._player.position.set(this._playerPos.x, 0.35, this._playerPos.z);
        this._interiorGroup.add(this._player);

        // Create enemy meshes
        this._enemyMeshes = [];
        for (const enemy of this._dungeonData.enemies) {
            const eGeo = new BoxGeometry(enemy.size, enemy.size, enemy.size);
            const eMat = new MeshStandardMaterial({
                color: enemy.color, roughness: 0.5, metalness: 0.3
            });
            const eMesh = new Mesh(eGeo, eMat);
            eMesh.position.set(enemy.x, enemy.y, enemy.z);
            this._interiorGroup.add(eMesh);
            this._enemyMeshes.push({ mesh: eMesh, data: enemy });

            // HP bar above enemy
            const hpGeo = new PlaneGeometry(0.6, 0.08);
            const hpMat = new MeshBasicMaterial({ color: 0x00ff00, side: DoubleSide });
            const hpBar = new Mesh(hpGeo, hpMat);
            hpBar.position.set(enemy.x, enemy.y + enemy.size + 0.15, enemy.z);
            this._interiorGroup.add(hpBar);
            eMesh.userData.hpBar = hpBar;
        }

        // Position camera for interior
        this._controls.target.set(this._playerPos.x, 1.5, this._playerPos.z);
        this._controls.radius = 8;
        this._controls.phi = Math.PI * 0.3;

        this._view = 'interior';

        // Transition: fade out
        this._transition = { active: true, alpha: 0, phase: 'in', target: 'interior' };
    }

    // ═══════════════════════════════════════════════════════════
    //  EXIT INTERIOR DUNGEON
    // ═══════════════════════════════════════════════════════════
    _exitInterior() {
        // Fade out, then switch
        this._transition = { active: true, alpha: 0, phase: 'out', target: 'globe' };
    }

    _finishExitInterior() {
        if (this._interiorGroup) {
            this._scene.remove(this._interiorGroup);
            this._interiorGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this._interiorGroup = null;
        }
        this._dungeonData = null;
        this._player = null;
        this._enemyMeshes = [];

        if (this._globeGroup) this._globeGroup.visible = true;
        if (this._structGroup) this._structGroup.visible = true;

        this._view = 'globe';
        this._controls.radius = 18;
        this._controls.target.set(0, 0, 0);

        // Set state back to playing
        this.g.state = 'playing';
    }

    // ═══════════════════════════════════════════════════════════
    //  UPDATE INTERIOR
    // ═══════════════════════════════════════════════════════════
    _updateInterior(dt) {
        const speed = 0.08;
        let moved = false;
        if (this._keys['KeyW'] || this._keys['ArrowUp']) { this._playerPos.z -= speed; moved = true; }
        if (this._keys['KeyS'] || this._keys['ArrowDown']) { this._playerPos.z += speed; moved = true; }
        if (this._keys['KeyA'] || this._keys['ArrowLeft']) { this._playerPos.x -= speed; moved = true; }
        if (this._keys['KeyD'] || this._keys['ArrowRight']) { this._playerPos.x += speed; moved = true; }

        if (moved && this._player) {
            this._player.position.set(this._playerPos.x, 0.35, this._playerPos.z);
            // Camera follow
            this._controls.target.lerp(
                { x: this._playerPos.x, y: 1.5, z: this._playerPos.z }, 0.05
            );

            // ── PORTAL TELEPORTATION (non-euclidean) ──
            if (this._dungeonData && this._dungeonData.portals) {
                for (const portal of this._dungeonData.portals) {
                    const roomA = this._dungeonData.rooms[portal.a];
                    const roomB = this._dungeonData.rooms[portal.b];
                    const distA = Math.hypot(this._playerPos.x - roomA.centerWorld.x, this._playerPos.z - roomA.centerWorld.z);
                    const distB = Math.hypot(this._playerPos.x - roomB.centerWorld.x, this._playerPos.z - roomB.centerWorld.z);

                    if (distA < 1.2) {
                        // Teleport to portal B
                        this._playerPos.x = roomB.centerWorld.x;
                        this._playerPos.z = roomB.centerWorld.z;
                        this._player.position.set(this._playerPos.x, 0.35, this._playerPos.z);
                        this._controls.target.set(this._playerPos.x, 1.5, this._playerPos.z);
                        this._debris.spawn(new Vector3(roomB.centerWorld.x, 0.5, roomB.centerWorld.z), new Color(0x8800ff), 10);
                        _AgentSystem._notifications.push({
                            text: '[PORTAL] Warped through non-Euclidean space!',
                            color: '#c6f', timer: 150,
                        });
                        break;
                    } else if (distB < 1.2) {
                        this._playerPos.x = roomA.centerWorld.x;
                        this._playerPos.z = roomA.centerWorld.z;
                        this._player.position.set(this._playerPos.x, 0.35, this._playerPos.z);
                        this._controls.target.set(this._playerPos.x, 1.5, this._playerPos.z);
                        this._debris.spawn(new Vector3(roomA.centerWorld.x, 0.5, roomA.centerWorld.z), new Color(0x8800ff), 10);
                        _AgentSystem._notifications.push({
                            text: '[PORTAL] Warped through non-Euclidean space!',
                            color: '#c6f', timer: 150,
                        });
                        break;
                    }
                }
            }

            // ── TRAP ACTIVATION ──
            if (this._dungeonData && this._dungeonData.traps) {
                for (const trap of this._dungeonData.traps) {
                    if (trap.triggered && trap.cooldown > 0) { trap.cooldown--; continue; }
                    const dist = Math.hypot(this._playerPos.x - trap.x, this._playerPos.z - trap.z);
                    if (dist < 0.6 && !trap.triggered) {
                        trap.triggered = true;
                        trap.cooldown = 120; // 2s cooldown before re-trigger
                        _AgentSystem._notifications.push({
                            text: `[TRAP] ${trap.name}! -${trap.damage} HP`,
                            color: '#f22', timer: 120,
                        });
                        this._debris.spawn(new Vector3(trap.x, 0.5, trap.z), new Color(0xff2200), 6);
                        this._dust.spawn(new Vector3(trap.x, 0.3, trap.z), 4);
                    } else if (dist >= 1.0 && trap.triggered) {
                        trap.triggered = false; // reset when player walks away
                    }
                }
            }
        }

        // Attack enemy on click or key press
        if (this._keys['Space']) {
            this._keys['Space'] = false;
            this._attackNearestEnemy();
        }

        // Player glow pulse
        if (this._player) {
            const pulse = Math.sin(this.time * 0.08) * 0.15 + 0.3;
            this._player.material.emissiveIntensity = pulse;
        }

        // Enemy idle bobbing
        for (const em of this._enemyMeshes) {
            if (em.data.dead) continue;
            const bob = Math.sin(this.time * 0.05 + em.data.bobOffset) * 0.05;
            em.mesh.position.y = em.data.y + bob;
        }
    }

    _attackNearestEnemy() {
        if (!this._enemyMeshes.length) return;
        let nearest = null, minDist = 2.5;
        for (const em of this._enemyMeshes) {
            if (em.data.dead) continue;
            const dx = em.data.x - this._playerPos.x;
            const dz = em.data.z - this._playerPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                nearest = em;
            }
        }
        if (!nearest) return;

        const e = nearest.data;
        e.hp -= 15; // base attack damage

        if (e.hp <= 0) {
            e.dead = true;
            // Destruction physics
            const pos = new Vector3(nearest.mesh.position.x, nearest.mesh.position.y, nearest.mesh.position.z);
            this._debris.spawn(pos, nearest.mesh.material.color, 8);
            this._dust.spawn(pos, 6);

            // Gold coin fountain
            this._coins.spawn(pos);
            this.g.stats.kills = (this.g.stats.kills || 0) + 1;

            // Remove mesh
            if (nearest.mesh.parent) nearest.mesh.parent.remove(nearest.mesh);
            if (nearest.mesh.userData.hpBar && nearest.mesh.userData.hpBar.parent) {
                nearest.mesh.userData.hpBar.parent.remove(nearest.mesh.userData.hpBar);
            }

            // Check if all enemies dead
            if (this._enemyMeshes.every(em => em.data.dead)) {
                setTimeout(() => this._exitInterior(), 1500);
            }
        } else {
            // Update HP bar
            const hpBar = nearest.mesh.userData.hpBar;
            if (hpBar) {
                hpBar.material.color.setHex(e.hp / e.maxHp > 0.5 ? 0x00ff00 : (e.hp / e.maxHp > 0.25 ? 0xffff00 : 0xff0000));
                hpBar.scale.x = Math.max(0.1, e.hp / e.maxHp);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DRAW MINIMAP (2D overlay)
    // ═══════════════════════════════════════════════════════════
    _drawMinimap() {
        if (!this._dungeonData) return;
        const c = this.ctx;
        const { grid, GRID, rooms, enemies } = this._dungeonData;
        const cellSize = 5;
        const mmW = GRID * cellSize;
        const mmH = GRID * cellSize;
        const mmX = this.g.W - mmW - 15;
        const mmY = 15;

        // Background
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.75)';
        c.fillRect(mmX - 3, mmY - 3, mmW + 6, mmH + 6);
        c.strokeStyle = 'rgba(128,128,128,0.5)';
        c.lineWidth = 1;
        c.strokeRect(mmX - 3, mmY - 3, mmW + 6, mmH + 6);

        // Draw cells
        for (let gy = 0; gy < GRID; gy++) {
            for (let gx = 0; gx < GRID; gx++) {
                const val = grid[gy * GRID + gx];
                if (val === 0) continue;
                if (val > 0) {
                    c.fillStyle = ROOM_COLORS[rooms[val - 1].type] ?
                        '#' + ROOM_COLORS[rooms[val - 1].type].toString(16).padStart(6, '0') : '#666';
                } else {
                    c.fillStyle = '#444';
                }
                c.fillRect(mmX + gx * cellSize, mmY + gy * cellSize, cellSize - 1, cellSize - 1);
            }
        }

        // Draw enemies (red dots)
        for (const e of enemies) {
            if (e.dead) continue;
            const ex = mmX + (e.x / 4) * cellSize;
            const ey = mmY + (e.z / 4) * cellSize;
            c.fillStyle = e.isBoss ? '#ff6600' : '#ff3333';
            c.beginPath();
            c.arc(ex, ey, e.isBoss ? 3 : 2, 0, Math.PI * 2);
            c.fill();
        }

        // Draw player (green dot)
        const px = mmX + (this._playerPos.x / 4) * cellSize;
        const py = mmY + (this._playerPos.z / 4) * cellSize;
        c.fillStyle = '#00ff66';
        c.beginPath();
        c.arc(px, py, 3, 0, Math.PI * 2);
        c.fill();

        // Room labels
        c.fillStyle = '#fff';
        c.font = '8px monospace';
        c.textAlign = 'center';
        for (let ri = 0; ri < rooms.length; ri++) {
            const room = rooms[ri];
            const rx = mmX + (room.x + room.w / 2) * cellSize;
            const ry = mmY + (room.y + room.h / 2) * cellSize;
            c.fillText(room.type, rx, ry + 3);
        }

        c.restore();

        // Room info
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(mmX - 3, mmY + mmH + 8, mmW + 6, 20);
        c.fillStyle = '#0f0';
        c.font = '10px monospace';
        c.textAlign = 'left';
        const alive = enemies.filter(e => !e.dead).length;
        c.fillText(`Enemies: ${alive}  |  WASD move  |  SPACE attack  |  ESC exit`, mmX, mmY + mmH + 22);
        c.restore();
    }

    // ═══════════════════════════════════════════════════════════
    //  DRAW TRANSITION (3D-specific crossfade)
    // ═══════════════════════════════════════════════════════════
    _draw3DTransition() {
        const t = this._transition;
        if (!t.active) return;
        const c = this.ctx;
        const { W, H } = this.g;

        if (t.phase === 'in') {
            t.alpha = Math.min(1, t.alpha + 0.04);
            if (t.alpha >= 1) {
                t.active = false;
                t.phase = 'none';
            }
        } else if (t.phase === 'out') {
            t.alpha = Math.min(1, t.alpha + 0.04);
            if (t.alpha >= 1) {
                t.phase = 'in';
                if (t.target === 'globe') this._finishExitInterior();
            }
        }

        if (t.alpha > 0) {
            c.fillStyle = `rgba(0,0,0,${t.alpha})`;
            c.fillRect(0, 0, W, H);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DRAW LIKE BUTTON
    // ═══════════════════════════════════════════════════════════
    _drawLikeButton() {
        const c = this.ctx;
        const g = this.g;
        const bx = g.W - 55, by = g.H - 55;
        const bs = 36;
        const tid = g.sel;
        if (tid == null) return;

        c.save();
        const liked = this._likedTerritories.has(tid);
        c.fillStyle = liked ? 'rgba(255,0,80,0.8)' : 'rgba(255,255,255,0.2)';
        c.strokeStyle = liked ? '#ff0050' : 'rgba(255,255,255,0.4)';
        c.lineWidth = 2;

        // Heart shape
        c.beginPath();
        c.moveTo(bx, by + bs * 0.3);
        c.bezierCurveTo(bx, by, bx - bs * 0.5, by, bx - bs * 0.5, by + bs * 0.25);
        c.bezierCurveTo(bx - bs * 0.5, by + bs * 0.55, bx, by + bs * 0.7, bx, by + bs * 0.85);
        c.bezierCurveTo(bx, by + bs * 0.7, bx + bs * 0.5, by + bs * 0.55, bx + bs * 0.5, by + bs * 0.25);
        c.bezierCurveTo(bx + bs * 0.5, by, bx, by, bx, by + bs * 0.3);
        c.fill();
        c.stroke();

        g._likeBtnRect = { x: bx - bs * 0.5, y: by, w: bs, h: bs };
        c.restore();
    }

    _toggleLike(tid) {
        if (this._likedTerritories.has(tid)) {
            this._likedTerritories.delete(tid);
        } else {
            this._likedTerritories.add(tid);
        }
        try {
            localStorage.setItem('ec_liked', JSON.stringify([...this._likedTerritories]));
        } catch (e) {}
    }

    _loadLiked() {
        try {
            const data = localStorage.getItem('ec_liked');
            if (data) this._likedTerritories = new Set(JSON.parse(data));
        } catch (e) {}
    }

    // ═══════════════════════════════════════════════════════════
    //  UPDATE OWNERSHIP COLORS ON GLOBE
    // ═══════════════════════════════════════════════════════════
    _updateOwnershipColors() {
        const g = this.g;
        if (!this._globeMesh || !_voxelData) return;
        const colAttr = this._globeMesh.instanceColor;
        if (!colAttr) return;

        const empRGB = {};
        for (const eid in EMPIRES) {
            const c = new Color(EMPIRES[eid].color);
            empRGB[eid] = [c.r, c.g, c.b];
        }

        const col = new Color();
        for (let i = 0; i < _voxelData.length; i++) {
            const v = _voxelData[i];
            if (v.tid < 0 || v.tid >= TERRITORIES.length) {
                // Unclaimed land - keep neutral
                col.setRGB(0.35, 0.40, 0.32);
                colAttr.setXYZ(i, col.r, col.g, col.b);
                continue;
            }
            const ts = g.ts ? g.ts[v.tid] : null;
            if (ts && ts.owner != null && empRGB[ts.owner]) {
                const eRGB = empRGB[ts.owner];
                const tRGB = T_VOX[TERRITORIES[v.tid].terrain] || T_VOX.plains;
                const blend = 0.4;
                col.setRGB(
                    tRGB[0] * (1 - blend) + eRGB[0] * blend,
                    tRGB[1] * (1 - blend) + eRGB[1] * blend,
                    tRGB[2] * (1 - blend) + eRGB[2] * blend
                );
                colAttr.setXYZ(i, col.r, col.g, col.b);
            } else {
                const tRGB = T_VOX[TERRITORIES[v.tid].terrain] || T_VOX.plains;
                col.setRGB(tRGB[0], tRGB[1], tRGB[2]);
                colAttr.setXYZ(i, col.r, col.g, col.b);
            }
        }
        colAttr.needsUpdate = true;
    }

    // ═══════════════════════════════════════════════════════════
    //  UPDATE LABELS
    // ═══════════════════════════════════════════════════════════
    _updateLabels() {
        const g = this.g;
        for (let i = 0; i < TERRITORIES.length; i++) {
            const label = this._terrLabels[i];
            if (!label) continue;
            const ts = g.ts ? g.ts[i] : null;
            const t = TERRITORIES[i];
            const ctx = label.canvas.getContext('2d');
            ctx.clearRect(0, 0, 256, 64);
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 4;
            ctx.font = 'bold 22px Georgia, serif';
            ctx.fillStyle = '#f0e0c0';
            ctx.textAlign = 'center';
            ctx.fillText(t.name, 128, 22);

            if (ts && ts.owner != null) {
                const emp = EMPIRES[ts.owner];
                if (emp && emp.emperor) {
                    ctx.font = 'italic 14px Georgia, serif';
                    ctx.fillStyle = emp.color || '#ccc';
                    ctx.fillText(emp.emperor, 128, 40);
                }
            }
            if (ts) {
                ctx.font = 'bold 12px Georgia, serif';
                ctx.fillStyle = '#ffd700';
                ctx.fillText((ts.troops || 0) + '', 128, 56);
            }
            ctx.shadowBlur = 0;
            label.tex.needsUpdate = true;

            const isSel = g.sel === i, isHov = g.hover === i;
            const sc = isSel ? 1.5 : isHov ? 1.2 : 1.0;
            label.sprite.scale.set(8 * sc, 2 * sc, 1);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  UPDATE SELECTION RING
    // ═══════════════════════════════════════════════════════════
    _updateSelectionRing() {
        const g = this.g;
        if (g.sel != null && _terrCenters[g.sel]) {
            const center = _terrCenters[g.sel];
            const normal = center.clone().normalize();
            this._selectRing.position.copy(normal.clone().multiplyScalar(GLOBE_R + 0.05));
            this._selectRing.lookAt(0, 0, 0);
            this._selectRing.visible = true;
            this._selectRing.material.opacity = 0.3 + Math.sin(this.time * 0.1) * 0.2;
        } else {
            this._selectRing.visible = false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  RAYCASTING
    // ═══════════════════════════════════════════════════════════
    _raycastTerritory(screenX, screenY) {
        if (!this._3dReady || !this._globeMesh) return -1;
        const rect = this._glCanvas.getBoundingClientRect();
        this._mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;
        this._raycaster.setFromCamera(this._mouse, this._camera);

        const structHits = this._raycaster.intersectObjects(this._structGroup.children, true);
        if (structHits.length > 0) {
            let obj = structHits[0].object;
            while (obj && obj.userData.tid === undefined) obj = obj.parent;
            if (obj && obj.userData.tid !== undefined) return obj.userData.tid;
        }

        const hits = this._raycaster.intersectObject(this._globeMesh, false);
        if (hits.length > 0) {
            const face = hits[0].face;
            if (face) {
                const idx = face.a;
                const tid = this._globeMesh.userData.terrIds[idx];
                return tid >= 0 ? tid : -1;
            }
        }
        return -1;
    }

    // ═══════════════════════════════════════════════════════════
    //  ATTACK QUEUE
    // ═══════════════════════════════════════════════════════════
    _attackQueue = [];

    queueAttack(fromTid, toTid, color) {
        const struct = this._structures[toTid];
        if (!struct) return;
        const blocks = struct.userData.blocks;
        const liveBlocks = blocks.filter(b => b !== null);
        const toDestroy = Math.min(3, liveBlocks.length);

        for (let i = 0; i < toDestroy; i++) {
            this._attackQueue.push({
                tid: toTid,
                delay: i * 8 + Math.random() * 4,
                color: color || 0xff4444
            });
        }
    }

    _processAttackQueue() {
        for (let i = this._attackQueue.length - 1; i >= 0; i--) {
            const atk = this._attackQueue[i];
            atk.delay--;
            if (atk.delay <= 0) {
                const struct = this._structures[atk.tid];
                if (struct) {
                    const blocks = struct.userData.blocks;
                    for (let j = 0; j < blocks.length; j++) {
                        if (blocks[j] !== null) {
                            this.destroyBlock(atk.tid, j);
                            break;
                        }
                    }
                }
                this._attackQueue.splice(i, 1);
            }
        }
    }

    destroyBlock(tid, blockIndex) {
        const struct = this._structures[tid];
        if (!struct || !struct.userData.blocks) return;
        const blocks = struct.userData.blocks;
        if (blockIndex >= blocks.length) return;
        const block = blocks[blockIndex];
        if (!block || !block.parent) return;

        const pos = block.position.clone();
        const color = block.material.color.clone();

        struct.remove(block);
        block.geometry.dispose();
        block.material.dispose();
        blocks[blockIndex] = null;

        this._debris.spawn(pos, color, 6);
        this._dust.spawn(pos, 4);
    }

    triggerVictory(tid, color) {
        const center = _terrCenters[tid];
        if (center) this._victoryParts.burst(center, color || 0xffd700, 40);
    }

    _rebuildStructure(tid) {
        const old = this._structures[tid];
        if (old) {
            this._structGroup.remove(old);
            old.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        const g = this.g;
        const ts = g.ts ? g.ts[tid] : null;
        const troops = ts ? (ts.troops || 30) : 30;
        const struct = _buildStructure(tid, troops);

        if (ts && ts.owner != null && EMPIRES[ts.owner]) {
            const empColor = new Color(EMPIRES[ts.owner].color);
            struct.traverse(child => {
                if (child.isMesh && child.userData.isBlock) {
                    child.material.color.copy(empColor).multiplyScalar(0.6);
                    child.material.emissive = empColor;
                    child.material.emissiveIntensity = 0.1;
                }
            });
        }

        this._structGroup.add(struct);
        this._structures[tid] = struct;
    }

    _updateStructureVisibility() {
        const g = this.g;
        for (let i = 0; i < TERRITORIES.length; i++) {
            const s = this._structures[i];
            if (!s) continue;
            const ts = g.ts ? g.ts[i] : null;
            s.visible = ts && ts.owner != null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  PER-FRAME 3D UPDATE
    // ═══════════════════════════════════════════════════════════
    _update3D() {
        if (!this._3dReady) return;
        const g = this.g;

        // Update particle systems
        if (this._debris) this._debris.update();
        if (this._dust) this._dust.update();
        if (this._coins) this._coins.update();
        if (this._victoryParts) this._victoryParts.update();
        this._processAttackQueue();
        _AgentSystem.tick(); // autonomous agents + extraction

        if (this._view === 'globe') {
            // No auto-rotation — globe stays still
            // Update ownership colors (throttled)
            if (this.time % 30 === 0) {
                this._updateOwnershipColors();
                this._updateStructureVisibility();
            }
            if (this.time % 60 === 0) {
                this._updateLabels();
            }
            this._updateSelectionRing();

            // Camera follow for territory view
            if (g._terrView != null && g.state === 'territory') {
                const tc = _terrCenters[g._terrView.tid];
                if (tc) {
                    this._controls.target.lerp(tc.clone().normalize().multiplyScalar(GLOBE_R + 5), 0.05);
                }
            }
        } else if (this._view === 'interior') {
            this._updateInterior();
        }

        this._cmdVisionScan = (this._cmdVisionScan || 0) + 1;
        this._controls.update();
    }

    // ═══════════════════════════════════════════════════════════
    //  OVERRIDE: toScr (3D projection for floating text)
    // ═══════════════════════════════════════════════════════════
    toScr(x, y) {
        if (this._3dReady && _terrCenters[x]) {
            const vec = _terrCenters[x].clone().add(new Vector3(0, 1, 0));
            vec.project(this._camera);
            return {
                x: (vec.x * 0.5 + 0.5) * this.g.W,
                y: (-vec.y * 0.5 + 0.5) * this.g.H
            };
        }
        return super.toScr(x, y);
    }

    // ═══════════════════════════════════════════════════════════
    //  OVERRIDE: terrAt (flat map or 3D raycast)
    // ═══════════════════════════════════════════════════════════
    terrAt(sx, sy) {
        if (this.g.state === 'playing' && this._flatMapLoaded) {
            return this._flatMapTerrAt(sx, sy);
        }
        if (this._3dReady && this._view === 'globe' &&
            (this.g.state === 'territory')) {
            return this._raycastTerritory(sx, sy);
        }
        return super.terrAt(sx, sy);
    }

    // ═══════════════════════════════════════════════════════════
    //  FLAT 2D MAP — Zoomable/Pannable map view
    // ═══════════════════════════════════════════════════════════
    _loadFlatMap() {
        const img = this._flatMapImg;
        img.onload = () => { this._flatMapLoaded = true; console.log('[FlatMap] Map loaded:', img.width, 'x', img.height); };
        img.onerror = () => { console.warn('[FlatMap] Failed to load map image'); };
        img.src = 'assets/world-map.jpg';
    }

    _initFlatMapEvents() {
        if (this._flatMapEventsInit) return;
        this._flatMapEventsInit = true;
        const cv = this._glCanvas || this.g._glCanvas;

        // Zoom with mouse wheel
        cv.addEventListener('wheel', (e) => {
            e.preventDefault();
            const g = this.g;
            if (g.state !== 'playing') return;
            const oldZoom = this._flatMapZoom;
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this._flatMapZoom = Math.max(0.5, Math.min(8, this._flatMapZoom * delta));
            // Zoom toward cursor position
            const mx = e.offsetX, my = e.offsetY;
            const mapW = this._getFlatMapW(), mapH = this._getFlatMapH();
            const baseScale = Math.min(g.W / mapW, g.H / mapH);
            const scale = baseScale * this._flatMapZoom;
            // Adjust offset so point under cursor stays fixed
            this._flatMapOffX = mx - (mx - this._flatMapOffX) * (this._flatMapZoom / oldZoom);
            this._flatMapOffY = my - (my - this._flatMapOffY) * (this._flatMapZoom / oldZoom);
        }, { passive: false });

        // Pan with drag (right click or middle click)
        cv.addEventListener('mousedown', (e) => {
            if (e.button === 1 || e.button === 2) {
                const g = this.g;
                if (g.state !== 'playing') return;
                this._flatMapDrag = true;
                this._flatMapDragStartX = e.clientX;
                this._flatMapDragStartY = e.clientY;
                this._flatMapDragOffX = this._flatMapOffX;
                this._flatMapDragOffY = this._flatMapOffY;
                e.preventDefault();
            }
        });
        window.addEventListener('mousemove', (e) => {
            if (this._flatMapDrag) {
                this._flatMapOffX = this._flatMapDragOffX + (e.clientX - this._flatMapDragStartX);
                this._flatMapOffY = this._flatMapDragOffY + (e.clientY - this._flatMapDragStartY);
            }
            // Hover tracking for territory tooltip
            const g = this.g;
            if (g.state === 'playing' && this._flatMapLoaded) {
                const rect = cv.getBoundingClientRect();
                this._flatMapHoverTerr = this._flatMapTerrAt(e.clientX - rect.left, e.clientY - rect.top);
            }
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 1 || e.button === 2) this._flatMapDrag = false;
        });

        // Touch pinch zoom
        let lastPinchDist = 0;
        cv.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            } else if (e.touches.length === 1) {
                this._flatMapDrag = true;
                this._flatMapDragStartX = e.touches[0].clientX;
                this._flatMapDragStartY = e.touches[0].clientY;
                this._flatMapDragOffX = this._flatMapOffX;
                this._flatMapDragOffY = this._flatMapOffY;
            }
        }, { passive: true });
        cv.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (lastPinchDist > 0) {
                    const oldZoom = this._flatMapZoom;
                    this._flatMapZoom = Math.max(0.5, Math.min(8, this._flatMapZoom * (dist / lastPinchDist)));
                    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    this._flatMapOffX = cx - (cx - this._flatMapOffX) * (this._flatMapZoom / oldZoom);
                    this._flatMapOffY = cy - (cy - this._flatMapOffY) * (this._flatMapZoom / oldZoom);
                }
                lastPinchDist = dist;
            } else if (e.touches.length === 1 && this._flatMapDrag) {
                this._flatMapOffX = this._flatMapDragOffX + (e.touches[0].clientX - this._flatMapDragStartX);
                this._flatMapOffY = this._flatMapDragOffY + (e.touches[0].clientY - this._flatMapDragStartY);
            }
        }, { passive: false });
        cv.addEventListener('touchend', () => { this._flatMapDrag = false; lastPinchDist = 0; });
    }

    _getFlatMapW() { return this._flatMapImg.width || 1024; }
    _getFlatMapH() { return this._flatMapImg.height || 558; }

    _getFlatMapTransform() {
        const g = this.g;
        const mapW = this._getFlatMapW(), mapH = this._getFlatMapH();
        const baseScale = Math.min(g.W / mapW, g.H / mapH) * 0.95;
        const scale = baseScale * this._flatMapZoom;
        const drawW = mapW * scale, drawH = mapH * scale;
        const drawX = (g.W - drawW) / 2 + this._flatMapOffX;
        const drawY = (g.H - drawH) / 2 + this._flatMapOffY;
        return { scale, drawX, drawY, drawW, drawH, mapW, mapH, baseScale };
    }

    _screenToMap(sx, sy) {
        const { drawX, drawY, scale } = this._getFlatMapTransform();
        return { mx: (sx - drawX) / scale, my: (sy - drawY) / scale };
    }

    _drawFlatMap() {
        const c = this.ctx, g = this.g;

        // ── Deep dark background with subtle gradient ──
        const bgGr = c.createRadialGradient(g.W / 2, g.H / 2, 100, g.W / 2, g.H / 2, g.W);
        bgGr.addColorStop(0, '#0c1018');
        bgGr.addColorStop(1, '#050810');
        c.fillStyle = bgGr;
        c.fillRect(0, 0, g.W, g.H);

        if (!this._flatMapLoaded) {
            // Elegant loading screen
            c.fillStyle = 'rgba(255,215,0,0.8)';
            c.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('Loading Map...', g.W / 2, g.H / 2);
            return;
        }

        const { scale, drawX, drawY, drawW, drawH, mapW, mapH } = this._getFlatMapTransform();

        // ── Map shadow + image ──
        c.save();
        c.shadowColor = 'rgba(0,0,0,0.6)';
        c.shadowBlur = 30;
        c.shadowOffsetX = 0;
        c.shadowOffsetY = 4;
        c.fillStyle = '#000';
        c.fillRect(drawX, drawY, drawW, drawH);
        c.restore();

        // Draw map image
        c.drawImage(this._flatMapImg, drawX, drawY, drawW, drawH);

        // ── Subtle vignette on map ──
        const vigGr = c.createRadialGradient(
            drawX + drawW / 2, drawY + drawH / 2, Math.min(drawW, drawH) * 0.3,
            drawX + drawW / 2, drawY + drawH / 2, Math.max(drawW, drawH) * 0.7
        );
        vigGr.addColorStop(0, 'rgba(0,0,0,0)');
        vigGr.addColorStop(1, 'rgba(0,0,0,0.15)');
        c.fillStyle = vigGr;
        c.fillRect(drawX, drawY, drawW, drawH);

        // ── Invisible click targets + hover highlight ──
        const activeTerr = g._activeTerritories || TERRITORIES;
        const sx = mapW / 960, sy = mapH / 640;
        const hoverTerr = this._flatMapHoverTerr || -1;
        for (let i = 0; i < activeTerr.length; i++) {
            const t = activeTerr[i];
            const ts = g.ts[i];
            if (!ts) continue;
            const cx = drawX + t.cx * sx * scale;
            const cy = drawY + t.cy * sy * scale;
            const hitR = Math.max(20, 30 * this._flatMapZoom);
            g.btns.push({
                rect: { x: cx - hitR, y: cy - hitR, w: hitR * 2, h: hitR * 2 },
                fn: () => { g._clickTerr(i); }
            });
        }

        // ── Hover tooltip (drawn AFTER all buttons so it's on top) ──
        if (hoverTerr >= 0 && hoverTerr < activeTerr.length && g.ts[hoverTerr]) {
            const ht = activeTerr[hoverTerr];
            const hx = drawX + ht.cx * sx * scale;
            const hy = drawY + ht.cy * sy * scale;
            const ownerEmp = g.empires[ht.emp];
            const ownerColor = ownerEmp?.color || '#fff';
            const ownerName = ownerEmp?.name || 'Neutral';

            // Pin dot
            c.beginPath();
            c.arc(hx, hy, 5, 0, Math.PI * 2);
            c.fillStyle = ownerColor;
            c.fill();
            c.strokeStyle = '#fff';
            c.lineWidth = 1.5;
            c.stroke();

            // Pulse ring
            const pulseR = 8 + Math.sin(this.time * 0.08) * 3;
            c.beginPath();
            c.arc(hx, hy, pulseR, 0, Math.PI * 2);
            c.strokeStyle = ownerColor.replace(')', ',0.4)').replace('rgb(', 'rgba(');
            c.lineWidth = 1.5;
            c.stroke();

            // Tooltip
            const tooltipText = `${ht.name}  (${ownerName})`;
            c.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
            const tw = c.measureText(tooltipText).width + 16;
            const th = 24;
            let tx = hx - tw / 2;
            let ty = hy - 24;
            // Keep tooltip on screen
            if (tx < 4) tx = 4;
            if (tx + tw > g.W - 4) tx = g.W - tw - 4;
            if (ty < 4) ty = hy + 10;

            // Frosted glass tooltip
            c.fillStyle = 'rgba(10,15,25,0.85)';
            c.beginPath(); c.roundRect(tx, ty, tw, th, 4); c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.15)';
            c.lineWidth = 1;
            c.beginPath(); c.roundRect(tx, ty, tw, th, 4); c.stroke();

            c.fillStyle = '#fff';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(tooltipText, tx + tw / 2, ty + th / 2);
        }

        // ── Weather overlay (subtle) ──
        if (g.weather && g.weather !== 'clear') {
            const wDef = WEATHER_TYPES[g.weather];
            if (wDef) {
                c.fillStyle = wDef.color;
                c.fillRect(0, 0, g.W, g.H);
                if (g.weather === 'rain' || g.weather === 'storm') {
                    c.strokeStyle = 'rgba(150,150,255,0.2)';
                    c.lineWidth = 1;
                    const count = g.weather === 'storm' ? 80 : 40;
                    for (let i = 0; i < count; i++) {
                        const rx = Math.random() * g.W, ry = Math.random() * g.H;
                        c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx - 3, ry + 10); c.stroke();
                    }
                } else if (g.weather === 'snow') {
                    c.fillStyle = 'rgba(255,255,255,0.4)';
                    for (let i = 0; i < 30; i++) {
                        c.beginPath(); c.arc(Math.random() * g.W, Math.random() * g.H, 2, 0, Math.PI * 2); c.fill();
                    }
                }
            }
        }

        // ── Zoom controls (bottom-right) ──
        this._drawZoomControls();
    }

    _drawZoomControls() {
        const c = this.ctx, g = this.g;
        const btnSize = 32, pad = 8, radius = 6;
        const bx = g.W - btnSize - 16;
        const by = g.H - 130 - btnSize * 3 - pad * 2;

        const btns = [
            { label: '+', action: 'zoomIn' },
            { label: '−', action: 'zoomOut' },
            { label: '⌂', action: 'zoomReset', font: '11px sans-serif' },
        ];

        for (let i = 0; i < btns.length; i++) {
            const b = btns[i];
            const x = bx, y = by + i * (btnSize + pad);

            // Frosted glass button
            c.fillStyle = 'rgba(8,12,20,0.7)';
            c.beginPath(); c.roundRect(x, y, btnSize, btnSize, radius); c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.12)';
            c.lineWidth = 1;
            c.beginPath(); c.roundRect(x, y, btnSize, btnSize, radius); c.stroke();

            c.fillStyle = 'rgba(255,255,255,0.7)';
            c.font = b.font || 'bold 18px "Segoe UI", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(b.label, x + btnSize / 2, y + btnSize / 2);

            g.btns.push({
                rect: { x, y, w: btnSize, h: btnSize },
                fn: () => this.handleFlatMapZoomAction(b.action)
            });
        }

        // Zoom level
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.font = '9px monospace';
        c.textAlign = 'right';
        c.fillText(`${Math.round(this._flatMapZoom * 100)}%`, bx - 4, by + btnSize * 1.5 + pad);
    }

    _flatMapTerrAt(sx, sy) {
        if (!this._flatMapLoaded) return -1;
        const { drawX, drawY, scale } = this._getFlatMapTransform();
        const mapW = this._getFlatMapW(), mapH = this._getFlatMapH();
        const sx2 = mapW / 960, sy2 = mapH / 640;

        const activeTerr = this.g._activeTerritories || TERRITORIES;

        // Point-in-polygon for old territories (have poly), or nearest-center for countries
        if (activeTerr.length <= 30 && activeTerr[0]?.poly) {
            // Old mode: point-in-polygon
            for (let i = activeTerr.length - 1; i >= 0; i--) {
                const t = activeTerr[i];
                if (!this.g.ts[i]) continue;
                let inside = false;
                const px = (sx - drawX) / scale / sx2;
                const py = (sy - drawY) / scale / sy2;
                const poly = t.poly;
                if (!poly) continue;
                for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
                    const xi = poly[j][0], yi = poly[j][1];
                    const xk = poly[k][0], yk = poly[k][1];
                    if (((yi > py) !== (yk > py)) && (px < (xk - xi) * (py - yi) / (yk - yi) + xi)) {
                        inside = !inside;
                    }
                }
                if (inside) return i;
            }
        } else {
            // Country mode: nearest center within click radius
            let bestDist = Infinity, bestId = -1;
            const clickRadius = 45 * scale; // pixels on screen (larger for 195 countries)
            for (let i = 0; i < activeTerr.length; i++) {
                const t = activeTerr[i];
                if (!this.g.ts[i]) continue;
                const cx = drawX + t.cx * sx2 * scale;
                const cy = drawY + t.cy * sy2 * scale;
                const dx = sx - cx, dy = sy - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < clickRadius && dist < bestDist) {
                    bestDist = dist;
                    bestId = i;
                }
            }
            return bestId;
        }
        return -1;
    }

    handleFlatMapZoomAction(action) {
        if (action === 'zoomIn') {
            this._flatMapZoom = Math.min(8, this._flatMapZoom * 1.3);
        } else if (action === 'zoomOut') {
            this._flatMapZoom = Math.max(0.5, this._flatMapZoom * 0.7);
        } else if (action === 'zoomReset') {
            this._flatMapZoom = 1;
            this._flatMapOffX = 0;
            this._flatMapOffY = 0;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  FLAT MAP TOOLBAR — action buttons for new systems
    // ═══════════════════════════════════════════════════════════
    _drawFlatMapToolbar() {
        const c = this.ctx, g = this.g;

        // ═══════════════════════════════════════════════════════════
        //  TOP BAR — Clean frosted glass
        // ═══════════════════════════════════════════════════════════
        // Progress bar at very top (2px)
        const em = g.empires[g.player];
        if (em) {
            const totalTerr = (g._activeTerritories || TERRITORIES).length;
            const pct = totalTerr > 0 ? em.tids.length / totalTerr : 0;
            c.fillStyle = 'rgba(0,0,0,0.5)';
            c.fillRect(0, 0, g.W, 3);
            const progGr = c.createLinearGradient(0, 0, g.W * pct, 0);
            progGr.addColorStop(0, em.color || '#ffd700');
            progGr.addColorStop(1, em.light || em.color || '#ffd700');
            c.fillStyle = progGr;
            c.fillRect(0, 0, g.W * pct, 3);
        }

        // Main top HUD bar — resources left, info center, controls right
        const topY = 8;
        c.fillStyle = 'rgba(8,12,20,0.8)';
        c.beginPath(); c.roundRect(8, topY, g.W - 16, 36, 8); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.06)';
        c.lineWidth = 1;
        c.beginPath(); c.roundRect(8, topY, g.W - 16, 36, 8); c.stroke();

        // Left: Resources
        if (em) {
            const resList = RESOURCE_KEYS || ['iron', 'gold', 'wood', 'stone', 'food'];
            const resIcons = { iron: '⛏️', gold: '💰', wood: '🪵', stone: '🪨', food: '🌾' };
            let rx = 20;
            for (const k of resList.slice(0, 5)) {
                const val = em.resources?.[k] || 0;
                c.font = '12px "Segoe UI", system-ui, sans-serif';
                c.textAlign = 'left'; c.textBaseline = 'middle';
                c.fillStyle = 'rgba(255,215,0,0.9)';
                c.fillText(`${resIcons[k] || k}${val}`, rx, topY + 18);
                rx += 56;
            }
        }

        // Center: Empire name + Turn
        if (em) {
            c.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = em.color || '#ffd700';
            c.fillText(`${em.flag || '⚔️'} ${em.name || 'Unknown'}`, g.W / 2, topY + 12);
            c.font = '10px "Segoe UI", system-ui, sans-serif';
            c.fillStyle = 'rgba(255,255,255,0.5)';
            c.fillText(`Turn ${g.turn}  ·  💰 ${em.coins || 0}`, g.W / 2, topY + 28);
        }

        // Right: Era + Weather
        if (em) {
            const eraDef = ERAS[em.era] || ERAS.bronze;
            const wDef = WEATHER_TYPES[g.weather] || WEATHER_TYPES.clear;
            c.font = '11px "Segoe UI", system-ui, sans-serif';
            c.textAlign = 'right'; c.textBaseline = 'middle';
            c.fillStyle = eraDef.color || '#fff';
            c.fillText(`${eraDef.icon} ${eraDef.name}`, g.W - 24, topY + 12);
            c.fillStyle = 'rgba(255,255,255,0.5)';
            c.fillText(`${wDef.icon} ${wDef.name}`, g.W - 24, topY + 28);
        }

        // Right side: Menu + Save buttons
        if (!g._isAI()) {
            c.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
            const menuLabel = '☰ Menu';
            const saveLabel = '💾 Save';
            const menuW = Math.max(68, c.measureText(menuLabel).width + 20);
            const saveW = Math.max(68, c.measureText(saveLabel).width + 20);
            const saveX = g.W - 16 - saveW;
            const menuX = saveX - 6 - menuW;
            const btnY = topY + 4, btnH = 28;

            // Save button
            c.fillStyle = 'rgba(34,197,94,0.15)';
            c.beginPath(); c.roundRect(saveX, btnY, saveW, btnH, 5); c.fill();
            c.strokeStyle = 'rgba(34,197,94,0.4)'; c.lineWidth = 1;
            c.beginPath(); c.roundRect(saveX, btnY, saveW, btnH, 5); c.stroke();
            c.fillStyle = 'rgba(134,239,172,0.9)'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(saveLabel, saveX + saveW / 2, btnY + btnH / 2);
            g.btns.push({ rect: { x: saveX, y: btnY, w: saveW, h: btnH }, fn: () => g.saveGame() });

            // Menu button
            c.fillStyle = 'rgba(255,255,255,0.08)';
            c.beginPath(); c.roundRect(menuX, btnY, menuW, btnH, 5); c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1;
            c.beginPath(); c.roundRect(menuX, btnY, menuW, btnH, 5); c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.8)'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(menuLabel, menuX + menuW / 2, btnY + btnH / 2);
            g.btns.push({ rect: { x: menuX, y: btnY, w: menuW, h: btnH }, fn: () => { g.state = 'menu'; g.sfx?.click(); } });
        }

        // ═══════════════════════════════════════════════════════════
        //  BOTTOM BAR — Frosted glass toolbar
        // ═══════════════════════════════════════════════════════════
        const barH = 44, barY = g.H - barH - 8;

        // Full-width frosted bar
        c.fillStyle = 'rgba(8,12,20,0.85)';
        c.beginPath(); c.roundRect(8, barY, g.W - 16, barH, 10); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.08)';
        c.lineWidth = 1;
        c.beginPath(); c.roundRect(8, barY, g.W - 16, barH, 10); c.stroke();

        // Panel buttons
        const buttons = [
            { label: '🔬 Tech', state: 'techtree', color: '#fbbf24' },
            { label: '🏗️ Build', state: 'builder', color: '#34d399' },
            { label: '💣 Siege', state: 'siege', color: '#fb923c' },
            { label: '🤝 Diplo', state: 'diplomacy', color: '#60a5fa' },
            { label: '🎨 Custom', state: 'customize', color: '#c084fc' },
            { label: '⭐ Profile', state: 'profile', color: '#94a3b8' },
        ];
        const bw = 76, bh = 30, gap = 8;
        const totalBtnW = buttons.length * (bw + gap) - gap;
        const startX = (g.W - totalBtnW) / 2;
        const by = barY + (barH - bh) / 2;

        for (let i = 0; i < buttons.length; i++) {
            const b = buttons[i];
            const bx = startX + i * (bw + gap);
            // Subtle button
            c.fillStyle = 'rgba(255,255,255,0.05)';
            c.beginPath(); c.roundRect(bx, by, bw, bh, 6); c.fill();
            c.strokeStyle = b.color + '40'; // 25% opacity hex
            c.lineWidth = 1;
            c.beginPath(); c.roundRect(bx, by, bw, bh, 6); c.stroke();
            c.font = '10px "Segoe UI", system-ui, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = b.color;
            c.fillText(b.label, bx + bw / 2, by + bh / 2);
            g.btns.push({ rect: { x: bx, y: by, w: bw, h: bh }, fn: () => { g.state = b.state; } });
        }

        // Music toggle — far left in bottom bar
        const musicOn = g.music && g.music._playing;
        const mBtnX = 20, mBtnY = by;
        c.fillStyle = musicOn ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)';
        c.beginPath(); c.roundRect(mBtnX, mBtnY, 38, bh, 6); c.fill();
        c.strokeStyle = musicOn ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)';
        c.lineWidth = 1;
        c.beginPath(); c.roundRect(mBtnX, mBtnY, 38, bh, 6); c.stroke();
        c.font = '16px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(musicOn ? '🎵' : '🔇', mBtnX + 19, mBtnY + bh / 2);
        g.btns.push({ rect: { x: mBtnX, y: mBtnY, w: 38, h: bh }, fn: () => {
            if (g.music) {
                if (g.music._playing) g.music.stop();
                else { g.music.init(g.sfx?.ctx); g.music.setRegion('map'); }
            }
        }});

        // End Turn button — far right in bottom bar
        const etX = g.W - 20 - 80, etY = by, etW = 80;
        c.fillStyle = 'rgba(239,68,68,0.2)';
        c.beginPath(); c.roundRect(etX, etY, etW, bh, 6); c.fill();
        c.strokeStyle = 'rgba(239,68,68,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.roundRect(etX, etY, etW, bh, 6); c.stroke();
        c.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = 'rgba(255,200,200,0.95)';
        c.fillText('⏭ End Turn', etX + etW / 2, etY + bh / 2);
        g.btns.push({ rect: { x: etX, y: etY, w: etW, h: bh }, fn: () => { g.endTurn(); } });

        // ── Research progress bar (above bottom bar) ──
        if (em?.currentResearch) {
            const techDef = this.g._findTechDef?.(em.currentResearch);
            if (techDef) {
                const rpW = 200, rpH = 20;
                const rpX = g.W / 2 - rpW / 2, rpY = barY - 28;
                c.fillStyle = 'rgba(8,12,20,0.85)';
                c.beginPath(); c.roundRect(rpX, rpY, rpW, rpH, 4); c.fill();
                const pct = Math.min(1, em.researchProgress / techDef.turns);
                // Progress fill
                const rpGr = c.createLinearGradient(rpX, 0, rpX + rpW * pct, 0);
                rpGr.addColorStop(0, 'rgba(59,130,246,0.6)');
                rpGr.addColorStop(1, 'rgba(96,165,250,0.6)');
                c.fillStyle = rpGr;
                c.beginPath(); c.roundRect(rpX + 2, rpY + 2, (rpW - 4) * pct, rpH - 4, 3); c.fill();
                c.font = '10px "Segoe UI", system-ui, sans-serif';
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillStyle = '#fff';
                c.fillText(`🔬 ${techDef.name} ${Math.round(pct * 100)}%`, rpX + rpW / 2, rpY + rpH / 2);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  OVERRIDE: Country Selection Screen — 195 searchable countries
    // ═══════════════════════════════════════════════════════════
    _empSel() {
        const c = this.ctx, g = this.g;
        const { W, H } = g;

        // Initialize scroll/selection state
        if (!this._cs) this._cs = { filter: '', cont: 'All', scroll: 0, hover: -1, selCid: -1 };
        const cs = this._cs;

        // Dark cinematic background
        const bgGr = c.createLinearGradient(0, 0, 0, H);
        bgGr.addColorStop(0, '#0a0604');
        bgGr.addColorStop(0.3, '#1a0f08');
        bgGr.addColorStop(1, '#050302');
        c.fillStyle = bgGr;
        c.fillRect(0, 0, W, H);

        // Ember particles
        for (let i = 0; i < 30; i++) {
            const px = (Math.sin(this.time * 0.005 + i * 2.7) * 0.5 + 0.5) * W;
            const py = H - ((this.time * 0.3 + i * 47) % H);
            const sz = 1 + Math.sin(this.time * 0.02 + i) * 0.5;
            c.fillStyle = `rgba(255,${100 + i * 3},30,${0.08 + Math.sin(this.time * 0.01 + i * 0.7) * 0.04})`;
            c.beginPath(); c.arc(px, py, sz, 0, Math.PI * 2); c.fill();
        }

        // btns cleared at start of render loop, not here

        // ── TITLE ──
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.save();
        c.shadowColor = 'rgba(255,180,50,0.6)';
        c.shadowBlur = 10 + Math.sin(this.time * 0.03) * 4;
        c.fillStyle = '#ffd700';
        c.font = 'bold 32px Georgia, serif';
        c.fillText('CHOOSE YOUR COUNTRY', W / 2, 28);
        c.restore();

        c.fillStyle = '#b89a6a'; c.font = 'italic 12px Georgia, serif';
        c.fillText('195 nations await your command. Search or browse by continent.', W / 2, 52);

        // Gold divider
        c.strokeStyle = 'rgba(184,154,106,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W * 0.1, 64); c.lineTo(W * 0.9, 64); c.stroke();

        // ── SEARCH BAR ──
        const searchX = W / 2 - 200, searchY = 74, searchW = 300, searchH = 32;
        this._rr(c, searchX, searchY, searchW, searchH, 6);
        c.fillStyle = 'rgba(30,20,10,0.8)'; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 1;
        this._rr(c, searchX, searchY, searchW, searchH, 6); c.stroke();
        c.fillStyle = cs.filter ? '#f5e6c8' : '#8a7a5a';
        c.font = '13px "Segoe UI", sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(cs.filter || 'Search country...', searchX + 10, searchY + searchH / 2);
        if (!cs.filter) {
            // Show cursor blink
            if (Math.floor(this.time / 30) % 2 === 0) {
                c.fillStyle = '#ffd700';
                c.fillRect(searchX + 10 + c.measureText('Search country...').width + 2, searchY + 8, 1, searchH - 16);
            }
        }
        // Search input button (captures clicks for typing)
        g.btns.push({
            rect: { x: searchX, y: searchY, w: searchW, h: searchH },
            label: 'search',
            fn: () => { this._cs._typing = true; this._cs._cursor = cs.filter.length; }
        });

        // ── CONTINENT TABS ──
        const allConts = ['All', ...CONTINENTS];
        const tabW = Math.min(100, (W - 40) / allConts.length);
        const tabStartX = (W - tabW * allConts.length) / 2;
        for (let i = 0; i < allConts.length; i++) {
            const tx = tabStartX + i * tabW, ty = 112, tw = tabW - 3, th = 26;
            const active = cs.cont === allConts[i];
            this._rr(c, tx, ty, tw, th, 5);
            c.fillStyle = active ? 'rgba(255,215,0,0.2)' : 'rgba(30,20,10,0.6)';
            c.fill();
            c.strokeStyle = active ? '#ffd700' : 'rgba(184,154,106,0.3)'; c.lineWidth = 1;
            this._rr(c, tx, ty, tw, th, 5); c.stroke();
            c.fillStyle = active ? '#ffd700' : '#8a7a5a';
            c.font = `${active ? 'bold ' : ''}11px "Segoe UI", sans-serif`;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            const label = allConts[i] === 'All' ? 'All' : `${(CONTINENT_ICONS[allConts[i]] || '')} ${allConts[i]}`;
            c.fillText(label, tx + tw / 2, ty + th / 2);
            g.btns.push({
                rect: { x: tx, y: ty, w: tw, h: th },
                label: allConts[i],
                fn: () => { cs.cont = allConts[i]; cs.scroll = 0; g.sfx.click(); }
            });
        }

        // ── COUNTRY LIST (scrollable) ──
        const listX = 30, listY = 145, listW = W - 60, listH = H - 180;
        // Clip region
        c.save();
        this._rr(c, listX, listY, listW, listH, 8);
        c.clip();

        // Get filtered countries
        let filtered;
        if (cs.filter) {
            filtered = searchCountries(cs.filter);
            if (cs.cont !== 'All') filtered = filtered.filter(co => co.continent === cs.cont);
        } else {
            filtered = getCountriesByContinent(cs.cont);
        }

        const rowH = 36;
        const maxScroll = Math.max(0, filtered.length * rowH - listH);
        cs.scroll = Math.min(cs.scroll, maxScroll);

        // Draw rows
        let newHover = -1;
        for (let i = 0; i < filtered.length; i++) {
            const co = filtered[i];
            const ry = listY + i * rowH - cs.scroll;
            if (ry < listY - rowH || ry > listY + listH) continue;

            const isHover = (cs.hover === co.id);
            const isSelected = (cs.selCid === co.id);

            // Row background
            if (isSelected) {
                c.fillStyle = 'rgba(255,215,0,0.15)';
                c.fillRect(listX, ry, listW, rowH - 2);
            } else if (isHover) {
                c.fillStyle = 'rgba(184,154,106,0.1)';
                c.fillRect(listX, ry, listW, rowH - 2);
            }

            // Alternating subtle stripe
            if (i % 2 === 0 && !isSelected && !isHover) {
                c.fillStyle = 'rgba(255,255,255,0.015)';
                c.fillRect(listX, ry, listW, rowH - 2);
            }

            // Separator line
            c.strokeStyle = 'rgba(184,154,106,0.1)'; c.lineWidth = 0.5;
            c.beginPath(); c.moveTo(listX + 10, ry + rowH - 2); c.lineTo(listX + listW - 10, ry + rowH - 2); c.stroke();

            // Flag emoji (large)
            c.font = '20px sans-serif';
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillText(co.flag, listX + 12, ry + rowH / 2 - 1);

            // Country name
            c.fillStyle = isSelected ? '#ffd700' : (isHover ? '#f5e6c8' : '#d4c4a0');
            c.font = `${isSelected ? 'bold ' : ''}14px "Segoe UI", sans-serif`;
            c.fillText(co.name, listX + 52, ry + rowH / 2 - 5);

            // Continent + code
            c.fillStyle = '#7a6a4a';
            c.font = '10px "Segoe UI", sans-serif';
            c.fillText(`${co.continent}  ${co.code}`, listX + 52, ry + rowH / 2 + 10);

            // Selected checkmark
            if (isSelected) {
                c.fillStyle = '#ffd700';
                c.font = 'bold 16px sans-serif';
                c.textAlign = 'right';
                c.fillText('✓', listX + listW - 15, ry + rowH / 2);
            }

            // Clickable row
            g.btns.push({
                rect: { x: listX, y: ry, w: listW, h: rowH - 2 },
                label: co.id,
                fn: () => {
                    cs.selCid = co.id;
                    g.sfx.click();
                }
            });

            // Track hover
            if (isHover) newHover = co.id;
        }
        c.restore();

        // ── SCROLL INDICATORS ──
        if (maxScroll > 0) {
            // Scrollbar track
            const sbX = listX + listW - 8, sbH = listH - 10;
            c.fillStyle = 'rgba(184,154,106,0.1)';
            this._rr(c, sbX, listY + 5, 5, sbH, 3); c.fill();
            // Thumb
            const thumbH = Math.max(30, sbH * (listH / (filtered.length * rowH)));
            const thumbY = listY + 5 + (cs.scroll / maxScroll) * (sbH - thumbH);
            c.fillStyle = 'rgba(255,215,0,0.4)';
            this._rr(c, sbX, thumbY, 5, thumbH, 3); c.fill();
        }

        // Results count
        c.fillStyle = '#7a6a4a'; c.font = '11px "Segoe UI", sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillText(`${filtered.length} countries`, listX + 10, listY + listH + 5);

        // ── BACK BUTTON ──
        const bbW = 80, bbH = 30, bbX = 15, bbY = H - 38;
        this._rr(c, bbX, bbY, bbW, bbH, 8);
        c.fillStyle = 'rgba(184,154,106,0.15)'; c.fill();
        c.strokeStyle = '#b7950b'; c.lineWidth = 1.5;
        this._rr(c, bbX, bbY, bbW, bbH, 8); c.stroke();
        c.fillStyle = '#f5e6c8'; c.font = 'bold 12px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('◀ Back', bbX + bbW / 2, bbY + bbH / 2);
        g.btns.push({
            rect: { x: bbX, y: bbY, w: bbW, h: bbH },
            label: 'Back',
            fn: () => { g.state = 'difficulty'; g.sfx.click(); }
        });

        // ── START BUTTON ──
        const startEnabled = cs.selCid >= 0;
        const stW = 140, stH = 36, stX = W - stW - 20, stY = H - 42;
        this._rr(c, stX, stY, stW, stH, 8);
        c.fillStyle = startEnabled ? 'rgba(255,215,0,0.25)' : 'rgba(60,50,30,0.4)';
        c.fill();
        c.strokeStyle = startEnabled ? '#ffd700' : 'rgba(184,154,106,0.3)'; c.lineWidth = startEnabled ? 2 : 1;
        this._rr(c, stX, stY, stW, stH, 8); c.stroke();
        c.fillStyle = startEnabled ? '#ffd700' : '#5a4a2a';
        c.font = 'bold 14px "Segoe UI", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('⚔ Conquer', stX + stW / 2, stY + stH / 2);
        if (startEnabled) {
            g.btns.push({
                rect: { x: stX, y: stY, w: stW, h: stH },
                label: 'start',
                fn: () => { g._startCountryGame(cs.selCid); g.sfx.click(); }
            });
        }

        // ── MINI MAP PREVIEW when a country is selected ──
        if (cs.selCid >= 0) {
            const selCo = COUNTRIES[cs.selCid];
            const mpW = 120, mpH = 70;
            const mpX = W - mpW - 20, mpY = 74;

            this._rr(c, mpX, mpY, mpW, mpH, 6);
            c.fillStyle = 'rgba(20,15,8,0.8)'; c.fill();
            c.strokeStyle = 'rgba(255,215,0,0.4)'; c.lineWidth = 1;
            this._rr(c, mpX, mpY, mpW, mpH, 6); c.stroke();

            // Show dot at country position
            const dotX = mpX + (selCo.cx / 960) * mpW;
            const dotY = mpY + (selCo.cy / 640) * mpH;
            c.fillStyle = selCo.color;
            c.beginPath(); c.arc(dotX, dotY, 4, 0, Math.PI * 2); c.fill();
            // Pulsing ring
            const pulse = 4 + Math.sin(this.time * 0.05) * 2;
            c.strokeStyle = selCo.color; c.lineWidth = 1;
            c.beginPath(); c.arc(dotX, dotY, pulse, 0, Math.PI * 2); c.stroke();

            // Label
            c.fillStyle = '#ffd700'; c.font = 'bold 10px "Segoe UI", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'bottom';
            c.fillText(selCo.flag + ' ' + selCo.name, mpX + mpW / 2, mpY - 3);
        }

        cs.hover = newHover;
    }

    // ── Keyboard handler for country search ──
    _empSelKey(e) {
        if (!this._cs) return;
        const cs = this._cs;
        if (!cs._typing) return;
        if (e.key === 'Backspace') {
            cs.filter = cs.filter.slice(0, -1);
            cs.scroll = 0;
            e.preventDefault();
        } else if (e.key === 'Escape') {
            cs._typing = false;
        } else if (e.key === 'Enter') {
            cs._typing = false;
            if (cs.selCid >= 0) this.g._startCountryGame(cs.selCid);
        } else if (e.key.length === 1 && cs.filter.length < 30) {
            cs.filter += e.key;
            cs.scroll = 0;
            e.preventDefault();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  OVERRIDE: _bg (clear 2D canvas when showing 3D)
    // ═══════════════════════════════════════════════════════════
    _bg() {
        const show3D = this.g.state === 'moveDialog' ||
                       this.g.state === 'attack' || this.g.state === 'battle' ||
                       this.g.state === 'shop' || this.g.state === 'territory' ||
                       this.g.state === 'combat' || this._view === 'interior';
        if (show3D) {
            this.ctx.clearRect(0, 0, this.g.W, this.g.H);
        } else {
            super._bg();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  AGENT HUD OVERLAY (autonomous agent activity feed)
    // ═══════════════════════════════════════════════════════════
    _drawAgentHUD() {
        const c = this.ctx;
        const g = this.g;
        const notifs = _AgentSystem.getNotifications();
        if (notifs.length === 0) return;

        c.save();
        const maxShow = 5;
        const shown = notifs.slice(-maxShow);
        let y = g.H - 80;
        for (let i = shown.length - 1; i >= 0; i--) {
            const n = shown[i];
            const alpha = Math.min(1, n.timer / 30);
            c.globalAlpha = alpha * 0.85;
            c.fillStyle = 'rgba(0,0,0,0.6)';
            c.fillRect(8, y - 14, g.W - 16, 18);
            c.fillStyle = n.color || '#8af';
            c.font = '11px monospace';
            c.textAlign = 'left';
            c.fillText(n.text, 12, y);
            y -= 20;
        }
        c.restore();
    }

    // ═══════════════════════════════════════════════════════════
    //  OVERRIDE: _worldMiniHUD — safe for country mode (no E()/T() crash)
    // ═══════════════════════════════════════════════════════════
    _worldMiniHUD() {
        // MiniHUD functionality moved into _drawFlatMapToolbar
        // This override kept to prevent base class crash in country mode
    }

    // ═══════════════════════════════════════════════════════════
    //  OVERRIDE: MAIN RENDER LOOP
    // ═══════════════════════════════════════════════════════════
    render() {
        try {
            this._layout();
            this.time++;
            const g = this.g;
            const c = this.ctx;

            // Clear button list at start of each frame
            g.btns = [];

            // Update ambient music based on game state and territory continent
            if (g.music && g.music._ready === false && g.sfx && g.sfx.ctx) {
                g.music.init(g.sfx.ctx);
            }
            if (g.music && g.music._ready) {
                const terr = g._terrView ? (g._activeTerritories?.[g._terrView.tid]) : null;
                const continent = terr ? terr.continent : null;
                if (g.state === 'menu') g.music.setRegion('menu');
                else if (g.state === 'empireSelect') g.music.setRegion('select');
                else if (g.state === 'territory') g.music.setRegion('territory', continent);
                else if (g.state === 'battle' || g.state === 'combat') g.music.setRegion('battle');
                else if (g.state === 'victory') g.music.setRegion('victory');
                else if (g.state === 'playing') g.music.setRegion('map', continent);
            }

            // Interior view always shows 3D
            if (this._view === 'interior' && this._3dReady) {
                c.clearRect(0, 0, g.W, g.H);
                this._update3D();
                this._renderer.render(this._scene, this._camera);
                this._drawMinimap();
                this._draw3DTransition();
                this._drawNotifications();
                this._drawFloats();
                this._drawBackButton();
                // FPS
                c.save();
                c.globalAlpha = 0.4;
                c.fillStyle = '#0f0';
                c.font = '10px monospace';
                c.textAlign = 'right';
                c.fillText(this._fps + ' FPS', g.W - 8, g.H - 8);
                c.restore();
                return;
            }

            const show3D = g.state === 'moveDialog' ||
                           g.state === 'attack' || g.state === 'battle' ||
                           g.state === 'shop' || g.state === 'territory' ||
                           g.state === 'combat';

            if (g.state === 'playing') {
                // ── FLAT 2D MAP VIEW ──
                this._initFlatMapEvents();
                c.clearRect(0, 0, g.W, g.H);
                this._drawFlatMap();
                this._drawFlatMapToolbar();
                this._worldMiniHUD();
                this._drawLikeButton();
            } else if (g.state === 'territory') {
                // ── 2D TERRITORY INTERIOR VIEW ──
                c.clearRect(0, 0, g.W, g.H);
                drawTerritoryInterior(c, g);
            } else if (show3D) {
                if (!this._3dReady) {
                    // Loading screen
                    c.clearRect(0, 0, g.W, g.H);
                    c.fillStyle = '#0a0a1a';
                    c.fillRect(0, 0, g.W, g.H);
                    c.fillStyle = '#ffd700';
                    c.font = 'bold 24px Georgia, serif';
                    c.textAlign = 'center';
                    c.fillText('Loading World Map...', g.W / 2, g.H / 2 - 20);
                    // Spinning indicator
                    const angle = this.time * 0.05;
                    c.save();
                    c.translate(g.W / 2, g.H / 2 + 20);
                    c.strokeStyle = '#ffd700';
                    c.lineWidth = 3;
                    c.beginPath();
                    c.arc(0, 0, 15, angle, angle + Math.PI * 1.5);
                    c.stroke();
                    c.restore();
                } else {
                    c.clearRect(0, 0, g.W, g.H);
                    this._update3D();
                    this._renderer.render(this._scene, this._camera);

                    if (g.state === 'playing') this._worldMiniHUD();
                    else if (g.state === 'moveDialog') this._moveDialog();
                    else if (g.state === 'attack') this._attackPanel();
                    else if (g.state === 'combat') this._drawCombatAnim();
                    else if (g.state === 'battle') this._battleOverlay();
                    else if (g.state === 'shop') this._shopPanel();
                    else if (g.state === 'territory') this._drawTerritoryView();

                    if (this._cmdVision && show3D) this._drawCmdVisionOverlay();
                    this._drawLikeButton();
                }
            } else {
                this._bg();
                if (g.state === 'menu') this._menu();
                else if (g.state === 'help') this._helpScreen();
                else if (g.state === 'difficulty') this._difficultyScreen();
                else if (g.state === 'onlineLobby') this._onlineLobbyScreen();
                else if (g.state === 'empireSelect') this._empSel();
                else if (g.state === 'gameover') this._defeat();
                else if (g.state === 'victory') this._victory();
                else if (g.state === 'techtree') drawTechTree(this.ctx, g);
                else if (g.state === 'builder') drawBuilder(this.ctx, g);
                else if (g.state === 'siege') drawSiege(this.ctx, g);
                else if (g.state === 'diplomacy') drawDiplomacy(this.ctx, g);
                else if (g.state === 'customize') drawCustomize(this.ctx, g);
                else if (g.state === 'profile') drawProfile(this.ctx, g);
            }

            // Universal overlays
            this._drawTransition();
            this._drawNotifications();
            this._drawAgentHUD(); // autonomous agent feed
            this._drawFloats();

            if (this.flash.alpha > 0) {
                c.fillStyle = this.flash.color.replace(')', `,${this.flash.alpha})`).replace('rgb', 'rgba');
                c.fillRect(0, 0, g.W, g.H);
                this.flash.alpha -= 0.03;
            }

            if (g.state === 'playing' && !g._isAI() && g._autoEndTurnDelay > 0) {
                this._drawAITurnIndicator();
            }

            if (g.state !== 'menu' && g.state !== 'combat' && this._view !== 'interior') {
                this._drawBackButton();
            }

            // FPS
            c.save();
            c.globalAlpha = 0.4;
            c.fillStyle = '#0f0';
            c.font = '10px monospace';
            c.textAlign = 'right';
            c.fillText(this._fps + ' FPS (Voxel 3D)', g.W - 8, g.H - 8);
            c.restore();

        } catch (e) {
            console.error('RENDER3D ERROR:', e.message, e.stack);
            // Draw error on canvas so we can see it
            try {
                const c = this.ctx, g = this.g;
                c.fillStyle = '#300'; c.fillRect(0, 0, g.W, g.H);
                c.fillStyle = '#f00'; c.font = '16px monospace'; c.textAlign = 'left';
                const lines = ['RENDER ERROR:', e.message, '', e.stack?.substring(0, 300) || ''];
                lines.forEach((l, i) => c.fillText(l.substring(0, 80), 10, 30 + i * 20));
            } catch (e2) { /* ignore */ }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  COMMANDER VISION OVERLAY
    // ═══════════════════════════════════════════════════════════
    _drawCmdVisionOverlay() {
        const c = this.ctx;
        const g = this.g;

        // Scanline
        const scanY = ((this._cmdVisionScan * 2) % g.H);
        const grad = c.createLinearGradient(0, scanY - 30, 0, scanY + 30);
        grad.addColorStop(0, 'rgba(128,0,255,0)');
        grad.addColorStop(0.5, 'rgba(128,0,255,0.15)');
        grad.addColorStop(1, 'rgba(128,0,255,0)');
        c.fillStyle = grad;
        c.fillRect(0, scanY - 30, g.W, 60);

        // Border glow
        c.strokeStyle = 'rgba(128,0,255,0.4)';
        c.lineWidth = 3;
        c.strokeRect(5, 5, g.W - 10, g.H - 10);

        // Label
        c.fillStyle = 'rgba(128,0,255,0.8)';
        c.font = 'bold 14px monospace';
        c.textAlign = 'left';
        c.fillText('COMMANDER VISION', 15, 25);

        // Territory info
        if (g.sel != null) {
            const t = TERRITORIES[g.sel];
            const ts = g.ts[g.sel];
            c.fillStyle = 'rgba(0,255,128,0.7)';
            c.font = 'bold 12px monospace';
            c.fillText(`${t.name} | ${t.terrain.toUpperCase()} | DEF:${t.def}`, 15, 45);
            if (ts) {
                const ownerName = ts.owner != null && EMPIRES[ts.owner] ? EMPIRES[ts.owner].name : 'Neutral';
                c.fillText(`Troops: ${ts.troops} | Owner: ${ownerName}`, 15, 62);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  CAMERA FOCUS
    // ═══════════════════════════════════════════════════════════
    focusTerritory(tid) {
        const tc = _terrCenters[tid];
        if (!tc) return;
        const target = tc.clone().normalize().multiplyScalar(GLOBE_R + 5);
        this._controls.target.copy(target);
    }

    // ═══════════════════════════════════════════════════════════
    //  OVERRIDE: addCaptureAnim
    // ═══════════════════════════════════════════════════════════
    addCaptureAnim(tid, newColor, oldColor) {
        this._rebuildStructure(tid);
        if (newColor) {
            const c = new Color(newColor);
            this._victoryParts.burst(_terrCenters[tid], c, 35);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  OVERRIDE: startCombatAnim
    // ═══════════════════════════════════════════════════════════
    startCombatAnim(fromTid, toTid, atkEmpire, defEmpire, conquered) {
        const color = atkEmpire != null && EMPIRES[atkEmpire] ? new Color(EMPIRES[atkEmpire].color).getHex() : 0xff4444;
        this.queueAttack(fromTid, toTid, color);
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC: Commander Vision getter
    // ═══════════════════════════════════════════════════════════
    get cmdVision() { return this._cmdVision; }
}
