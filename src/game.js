import { TERRITORIES, EMPIRES, EIDS, STARTS, NEUTRALS, T, E, adj, WEAPONS, SHOP, STRATEGIES } from './map.js';
import { COUNTRIES, buildTerritories, buildEmpires, computeAdjacency, searchCountries, getCountriesByContinent, CONTINENTS, CONTINENT_ICONS, latlngToXY } from './countries.js';
import { resolveCombat } from './combat.js';
import { SFX } from './audio.js';
import { AmbientMusic } from './audio.js';
import { Input } from './input.js';
import { Renderer3D } from './renderer3d.js';
import { AI } from './ai.js';
import { RESOURCES, RESOURCE_KEYS, TERRAIN_PRODUCTION, BUILDINGS, calcTerritoryProduction, calcEmpireProduction } from './resources.js';
import { ERAS, ERA_ORDER, TECHS, ERA_BONUSES, getTechBonuses, canResearch } from './techtree.js';
import { BLOCKS, BLOCK_KEYS, BLUEPRINTS, BLUEPRINT_KEYS, BUILDER_GRID, ISO, drawBlock } from './builder.js';
import { SIEGE_WEAPONS, FORMATIONS, SIEGE_PHASES, FORT_LEVELS, SIEGE_TERRAIN_MODS, resolveSiege } from './siege.js';
import { HEROES, HERO_KEYS, COLOR_PALETTES, FLAG_PATTERNS, TITLES, getTitle, drawFlag } from './empire-custom.js';
import { BIOMES, WEATHER_TYPES, FOG_STATES, DISASTERS, rollWeather, drawFog, drawWeatherOverlay, generateBiome } from './procedural.js';
import { ALLIANCE_TYPES, DIPLOMACY, AI_PERSONALITIES, RANK_TIERS, getRank, ACHIEVEMENTS } from './social.js';
import { loadProfile, saveProfile, addXP, xpForNextLevel, recordGameResult, XP_REWARDS, UNLOCKABLES } from './persistence.js';

export class Game {
    constructor(glCanvas, uiCanvas) {
        this.c = uiCanvas;
        this.ctx = uiCanvas.getContext('2d');
        this._glCanvas = glCanvas;
        this.W = 0; this.H = 0;
        this._resize();
        window.addEventListener('resize', () => this._resize());

        // States: menu|empireSelect|playing|attack|battle|shop|gameover|victory|help|moveDialog|territory|builder|siege|techtree|diplomacy|customize|seasons
        this.state = 'menu';
        this.phase = 'select'; // sub-phases within playing: select|move|attack
        this.player = null;
        this.turn = 0;
        this.empires = {};
        this.ts = {}; // territory states
        this.sel = null;
        this.hover = null;
        this.log = [];

        // Territory view (zoom inside)
        this._terrView = null; // { tid, zoom: 0->1, soldiers: [...], buildings: [...] }

        // AI
        this.aiQ = []; this.aiIdx = -1; this.aiTimer = 0; this.aiDelay = 3;

        // Battle
        this.battle = null;

        // Shop state
        this.shopTab = 'troops';
        this._supplyBonus = 0;

        // Move state
        this.moveFrom = null;
        this.moveTo = null;
        this.moveAmount = 0;

        // Attack target — set when entering attack phase, not reset every frame
        this._attackTarget = null;
        this.attackAmount = 0;
        this.attackFireMode = 'single'; // single | burst | full

        // Help state
        this._helpPrev = 'menu';

        // Ambient music
        this.music = new AmbientMusic();

        // Buttons (cached for click detection)
        this.btns = [];

        // Player statistics tracking
        this.stats = {
            kills: 0,
            conquered: 0,
            coinsEarned: 0,
        };

        // Online mode state
        this._gameMode = 'offline'; // 'offline' or 'online'
        this._wsConnected = false;
        this._roomCode = '';
        this._lobbyRooms = [];
        this._roomCodeInput = '';
        this._playerNameInput = '';
        this._chatScope = 'room';
        this._chatInput = '';
        this._typingChat = false;
        this._chatInputRect = null;
        this._spyCount = 0;
        this._roomCodeRect = null;
        this._playerNameRect = null;
        this._typingRoomCode = false;
        this._typingPlayerName = false;
        this._aiPlayers = 5; // default 5 AI opponents in online
        this._lobbyPlayers = []; // real players who joined the room
        this._onlineAiCount = 5;

        // Difficulty setting
        this.difficulty = 'normal';

        // ── Resource Economy ──
        this.territoryData = {}; // tid -> { terrain, biome, production }

        // ── Technology Tree ──
        this.currentEra = 'bronze';

        // ── Builder Mode ──
        this.builderState = null; // { tid, blocks:[], selectedType, gridOffX, gridOffY, cursorX, cursorY }

        // ── Siege Combat ──
        this.siegeState = null; // { attacker, defender, terrain, weapons, formation, phase, result }

        // ── Empire Customization ──
        this.empireCustom = { color: null, flag: null, title: null, hero: null };
        this.recruitedHeroes = [];

        // ── Procedural / Weather / Fog ──
        this.weather = 'clear';
        this.fogOfWar = {};

        // ── Social / Diplomacy ──
        this.alliances = {}; // eid -> { targetEid, type }
        this.aiPersonalities = {};
        this.chatMessages = [];

        // ── Persistent Progression ──
        this.profile = loadProfile();

        // ── Undo system
        this.undoStack = [];

        // Kill tracking per empire (who eliminated whom)
        this.killLog = {};

        // Random events system
        this.event = null;       // current active event { type, title, desc, icon, color, duration, timer, effects }
        this.eventHistory = [];  // past events
        this.eventCooldown = 0;  // turns until next event can fire
        this.goldenAge = false;  // double income this turn if true

        // Systems
        this.sfx = new SFX();
        this._ambientTimer = 0;
        this.input = new Input(this);
        this.renderer = new Renderer3D(this, glCanvas);
    }

    _resize() {
        this.c.width = window.innerWidth;
        this.c.height = window.innerHeight;
        this.W = this.c.width; this.H = this.c.height;
        if (this._glCanvas) {
            this._glCanvas.width = window.innerWidth;
            this._glCanvas.height = window.innerHeight;
        }
    }

    start() {
        this.lastT = performance.now();
        const loop = (t) => {
            const dt = Math.min(t - this.lastT, 100);
            this.lastT = t;
            this._update(dt);
            this.renderer.render();
            // Ambient sounds every ~8 seconds while playing
            if (this.state === 'playing') {
                this._ambientTimer += dt;
                if (this._ambientTimer > 8000) {
                    this._ambientTimer = 0;
                    this.sfx.ambient();
                }
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    _update(dt) {
        this.hover = this.renderer.terrAt(this.input.hoverX, this.input.hoverY);

        // Event timer countdown
        if (this.event) {
            this.event.timer--;
            if (this.event.timer <= 0) {
                this.event = null;
            }
        }

        // Cursor: pointer when hovering over clickable territory
        const uiEl = document.getElementById('ui');
        if (uiEl) {
            const showPointer = this.hover >= 0 && this.state === 'playing' && !this._isAI();
            uiEl.style.cursor = showPointer ? 'pointer' : 'default';
        }

        // ── Background music state tracking ──
        if (this.sound) {
            if (!this.sound.initialized) this.sound.init();
            if (this.sound.currentTrack !== this.state) {
                this.sound.resume(); // Resume audio context on user interaction
                const s = this.state;
            if (s === 'menu' || s === 'empireSelect' || s === 'difficulty' || s === 'onlineLobby' || s === 'help') {
                this.sound.playMenu();
            } else if (s === 'playing') {
                this.sound.playWorldMap();
            } else if (s === 'attack' || s === 'combat' || s === 'battle') {
                this.sound.playBattle();
            } else if (s === 'territory') {
                this.sound.playTerritory();
            } else if (s === 'gameover') {
                this.sound.playDefeat();
                this.sound.currentTrack = s; // Don't re-trigger
            } else if (s === 'victory') {
                this.sound.playVictory();
                this.sound.currentTrack = s; // Don't re-trigger
            }
            }
        }

        if (this.state === 'menu') this._upMenu();
        else {
            // ── UNIVERSAL BACK BUTTON ──
            if (this.input.hasClick() && this._backBtnRect) {
                const sx = this.input.sx, sy = this.input.sy;
                const b = this._backBtnRect;
                if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
                    this.input.consumeClick();
                    if (this.state === 'territory') { this.state = 'playing'; this.sel = null; return; }
                    else if (this.state === 'playing') { this._quitToMenu(); return; }
                    else { this.state = 'menu'; return; }
                }
            }
            if (this.state === 'empireSelect') this._upEmpire();
            else if (this.state === 'playing') this._upPlay();
            else if (this.state === 'attack') this._upAttack();
            else if (this.state === 'combat') { /* animation plays, clicks ignored */ }
            else if (this.state === 'battle') this._upBattle();
            else if (this.state === 'shop') this._upShop();
            else if (this.state === 'gameover' || this.state === 'victory') this._upEnd();
            else if (this.state === 'help') this._upHelp();
            else if (this.state === 'moveDialog') this._upMoveDialog();
            else if (this.state === 'difficulty') this._upDifficulty();
            else if (this.state === 'onlineLobby') this._upOnlineLobby();
            else if (this.state === 'territory') this._upTerritoryView();
        }

        // Process keyboard input for chat and lobby fields
        this._processKeys();

        this.input.endFrame();
    }

    // ── MENU ──────────────────────────────────────────────────
    _upMenu() {
        if (this.input.hasClick()) {
            const sx = this.input.sx, sy = this.input.sy;
            // Check Offline button
            const or = this._offlineBtnRect;
            if (or && sx >= or.x && sx <= or.x + or.w && sy >= or.y && sy <= or.y + or.h) {
                this.input.consumeClick();
                this._gameMode = 'offline';
                this.state = 'difficulty';
                this.sfx.click();
                return;
            }
            // Check Online Battle button
            const onr = this._onlineBtnRect;
            if (onr && sx >= onr.x && sx <= onr.x + onr.w && sy >= onr.y && sy <= onr.y + onr.h) {
                this.input.consumeClick();
                this._gameMode = 'online';
                this.state = 'onlineLobby';
                this.sfx.click();
                return;
            }
            // Check Help button
            const hr = this._helpBtnRect;
            if (hr && sx >= hr.x && sx <= hr.x + hr.w && sy >= hr.y && sy <= hr.y + hr.h) {
                this.input.consumeClick();
                this.showHelp();
                return;
            }
            // Check Continue button
            const cr = this._continueBtnRect;
            if (cr && sx >= cr.x && sx <= cr.x + cr.w && sy >= cr.y && sy <= cr.y + cr.h) {
                this.input.consumeClick();
                if (!this.loadGame()) {
                    this._log('No saved game found!');
                }
                return;
            }
            this.input.consumeClick();
        }
    }

    // ── ONLINE LOBBY ──────────────────────────────────────
    _processKeys() {
        const keys = this.input.getTypedKeys();
        if (!keys.length) return;
        for (const key of keys) {
            // Chat input (territory view + chat tab)
            if (this.state === 'territory' && this._terrView.sub === 'chat' && this._typingChat) {
                if (key === 'Backspace') {
                    this._chatInput = this._chatInput.slice(0, -1);
                } else if (key === 'Enter') {
                    if (this._chatInput && this.online) {
                        this.online.sendChat(this._chatInput, this._chatScope || 'room');
                        this._chatInput = '';
                    }
                } else if (key.length === 1 && this._chatInput.length < 100) {
                    this._chatInput += key;
                }
            }
            // Lobby room code input
            else if (this.state === 'onlineLobby' && this._typingRoomCode) {
                if (key === 'Backspace') {
                    this._roomCodeInput = this._roomCodeInput.slice(0, -1);
                } else if (key === 'Escape') {
                    this._typingRoomCode = false;
                } else if (key.length === 1 && this._roomCodeInput.length < 6) {
                    this._roomCodeInput += key.toUpperCase();
                }
            }
            // Lobby player name input
            else if (this.state === 'onlineLobby' && this._typingPlayerName) {
                if (key === 'Backspace') {
                    this._playerNameInput = this._playerNameInput.slice(0, -1);
                } else if (key === 'Escape') {
                    this._typingPlayerName = false;
                } else if (key === 'Enter') {
                    this._typingPlayerName = false;
                } else if (key.length === 1 && this._playerNameInput.length < 16) {
                    this._playerNameInput += key;
                }
            }
        }
    }

    _upOnlineLobby() {
        if (this.input.hasClick()) {
            const sx = this.input.sx, sy = this.input.sy;
            // Check player name input click
            const pnr = this._playerNameRect;
            if (pnr && sx >= pnr.x && sx <= pnr.x + pnr.w && sy >= pnr.y && sy <= pnr.y + pnr.h) {
                this.input.consumeClick();
                this._typingPlayerName = true;
                this._typingRoomCode = false;
                return;
            }
            // Check room code input click
            const rcr = this._roomCodeRect;
            if (rcr && sx >= rcr.x && sx <= rcr.x + rcr.w && sy >= rcr.y && sy <= rcr.y + rcr.h) {
                this.input.consumeClick();
                // Toggle typing mode
                this._typingRoomCode = !this._typingRoomCode;
                return;
            }
            for (const b of this.btns) {
                if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                    this.input.consumeClick();
                    if (b.fn) b.fn();
                    return;
                }
            }
            this.input.consumeClick();
        }
    }

    _createRoom() {
        const name = this._playerNameInput || 'Player_' + Math.floor(Math.random() * 999);
        this._gameMode = 'online';
        this._onlineAiCount = this._aiPlayers;
        this._onlineRealPlayers = [];
        this._roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        // Try connecting to server for real players, but start regardless
        if (this.online) {
            this.online.connect();
            this.online.createRoom(name);
        }
        this.state = 'difficulty';
        this.sfx.click();
    }

    _joinRoom() {
        if (this.online && this._roomCodeInput) {
            this.online.connect();
            this.online.joinRoom(this._roomCodeInput);
        } else {
            this._log('Enter a room code first');
        }
    }

    _quickMatch() {
        // Start immediately with AI opponents — no server needed for vs AI
        this._gameMode = 'online';
        this._onlineAiCount = this._aiPlayers;
        this._onlineRealPlayers = [];
        this.state = 'difficulty';
        this.sfx.click();
    }

    // ── DIFFICULTY SELECT ──────────────────────────────────────
    _upDifficulty() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }
        this.input.consumeClick();
    }

    // ── EMPIRE SELECT ─────────────────────────────────────────
    _upEmpire() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;

        // FIX: Check buttons first (Back button from renderer)
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }

        this.input.consumeClick();
        const cols = 5, cw = Math.min(160, (this.W - 50) / cols), ch = 160, gap = 6;
        const rows = Math.ceil(EIDS.length / cols);
        const totalW = cw * cols + gap * (cols - 1);
        const startX = (this.W - totalW) / 2;
        const startY = (this.H - ch * rows - gap * (rows - 1)) / 2 + 30;

        for (let i = 0; i < EIDS.length; i++) {
            const col = i % cols, row = Math.floor(i / cols);
            const x = startX + col * (cw + gap), y = startY + row * (ch + gap);
            if (sx >= x && sx <= x + cw && sy >= y && sy <= y + ch) {
                this._startGame(EIDS[i]);
                return;
            }
        }
    }

    // ── START GAME ────────────────────────────────────────────
    _startGame(eid) {
        this.player = eid;
        this.turn = 1;
        this.log = [];

        // Reset stats
        this.stats = { kills: 0, conquered: 0, coinsEarned: 0, totalTroops: 0, xp: 0, level: 1 };
        this.killLog = {};
        this._xpForLevel = (lvl) => Math.floor(50 * Math.pow(lvl, 1.3));

        // ── Initialize territory data with terrain & biome ──
        this.territoryData = {};
        for (const t of TERRITORIES) {
            this.territoryData[t.id] = {
                terrain: t.terrain,
                biome: generateBiome(t.cx, t.cy, 960, 640),
                production: calcTerritoryProduction(t.terrain),
            };
        }

        // Initialize all territories
        this.ts = {};
        for (const t of TERRITORIES) {
            this.ts[t.id] = { owner: null, troops: 0, fort: 0, weapon: WEAPONS[1][0], buildings: {},
                resources: { iron: 0, gold: 0, wood: 0, stone: 0, food: 0 },
                fortLevel: 0, builderBlocks: [] };
        }

        // Initialize empires and place starting territories
        this.empires = {};
        for (const id of EIDS) {
            const s = STARTS[id];
            if (!s) continue;
            const empDef = E(id);
            const emp = { id, tids: [...s.t], coins: 15, alive: true, weapons: new Set([1]), spy: false, alliances: {}, color: empDef.color, dark: empDef.dark, light: empDef.light, icon: empDef.icon || '\u2655', name: empDef.name,
                // ── New systems ──
                resources: { iron: 20, gold: 30, wood: 30, stone: 20, food: 30 },
                era: 'bronze', researchedTechs: [], currentResearch: null, researchProgress: 0,
                hero: null, formation: 'line',
                siegeWeapons: [],
                personality: AI_PERSONALITIES[Object.keys(AI_PERSONALITIES)[Math.floor(Math.random() * Object.keys(AI_PERSONALITIES).length)]?.name || 'aggressive'] };
            this.empires[id] = emp;
            for (let i = 0; i < s.t.length; i++) {
                this.ts[s.t[i]].owner = id;
                this.ts[s.t[i]].troops = s.troops[i];
            }
        }

        // Place neutral garrisons
        for (const [tid, troops] of Object.entries(NEUTRALS)) {
            this.ts[parseInt(tid)].troops = troops;
        }

        // ── Initialize fog of war ──
        this.fogOfWar = {};
        for (const t of TERRITORIES) {
            this.fogOfWar[t.id] = 'hidden';
        }
        // Reveal player's starting territories and adjacents
        const playerStarts = STARTS[this.player]?.t || [];
        for (const tid of playerStarts) {
            this.fogOfWar[tid] = 'visible';
            for (const adjId of TERRITORIES[tid].adj) {
                if (this.fogOfWar[adjId] === 'hidden') this.fogOfWar[adjId] = 'fogged';
            }
        }

        // ── Initialize weather ──
        this.weather = 'clear';

        // ── Initialize diplomacy ──
        this.alliances = {};

        // ── Reset customization per game ──
        this.recruitedHeroes = [];

        // Difficulty adjustments for AI starting troops
        if (this.difficulty === 'easy') {
            // AI troops -1 per starting territory (min 1)
            for (const id of EIDS) {
                if (id === this.player) continue;
                const s = STARTS[id];
                if (!s) continue;
                for (let i = 0; i < s.t.length; i++) {
                    this.ts[s.t[i]].troops = Math.max(1, s.troops[i] - 1);
                }
            }
        } else if (this.difficulty === 'hard') {
            // AI troops +2 per starting territory
            for (const id of EIDS) {
                if (id === this.player) continue;
                const s = STARTS[id];
                if (!s) continue;
                for (let i = 0; i < s.t.length; i++) {
                    this.ts[s.t[i]].troops = s.troops[i] + 2;
                }
            }
        }

        this.state = 'playing';
        this.renderer.startTransition('curtain');
        this.phase = 'select';
        this.sel = null;
        this.aiQ = []; this.aiIdx = -1; this.aiTimer = 0;
        this._income(this.player);
        this._log(`You lead the ${E(this.player).name}! Conquer all territories to win.`);
        this.sfx.turn();
    }

    // ═══════════════════════════════════════════════════════════
    //  COUNTRY MODE — 195 countries instead of 15 empires
    // ═══════════════════════════════════════════════════════════
    _startCountryGame(cid) {
        // Build territory and empire data from countries
        const territories = buildTerritories();
        const empires = buildEmpires();
        const cAdj = territories.map(t => t.adj);

        // Replace global references so T(), E(), TERRITORIES work
        this._countryMode = true;
        this._countryTerritories = territories;
        this._countryEmpires = empires;
        // Monkey-patch the global lookups
        this._origT = window._T || T;
        this._origE = window._E || E;

        this.player = cid;
        this.turn = 1;
        this.log = [];
        this.stats = { kills: 0, conquered: 0, coinsEarned: 0, totalTroops: 0, xp: 0, level: 1 };
        this.killLog = {};
        this._xpForLevel = (lvl) => Math.floor(50 * Math.pow(lvl, 1.3));

        // Initialize territory data
        this.territoryData = {};
        for (const t of territories) {
            this.territoryData[t.id] = {
                terrain: t.terrain,
                biome: generateBiome(t.cx, t.cy, 960, 640),
                production: calcTerritoryProduction(t.terrain),
            };
        }

        // Initialize all 195 territories as neutral
        this.ts = {};
        for (const t of territories) {
            this.ts[t.id] = { owner: null, troops: 0, fort: 0, weapon: WEAPONS[1][0], buildings: { command_center: 0, supply_depot: 0, watchtower: 0, armory: 0, bunker: 0, radar: 0 },
                resources: { iron: 0, gold: 0, wood: 0, stone: 0, food: 0 },
                fortLevel: 0, builderBlocks: [] };
        }

        // Initialize empires — each country starts with its own territory + troops
        this.empires = {};
        // Pick ~40 AI countries spread across continents, plus the player
        const aiCount = 40;
        const aiIds = [];
        const continentCounts = {};
        for (let i = 0; i < COUNTRIES.length; i++) {
            if (i === cid) continue;
            const cont = COUNTRIES[i].continent;
            continentCounts[cont] = (continentCounts[cont] || 0) + 1;
        }
        // Select AI proportionally by continent
        const targetPerContinent = {};
        for (const cont of Object.keys(continentCounts)) {
            targetPerContinent[cont] = Math.round(aiCount * continentCounts[cont] / (COUNTRIES.length - 1));
        }
        const selected = new Set([cid]);
        for (const cont of Object.keys(targetPerContinent)) {
            let count = 0;
            const contCountries = COUNTRIES.filter(c => c.continent === cont && c.id !== cid).map(c => c.id);
            // Shuffle
            for (let i = contCountries.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [contCountries[i], contCountries[j]] = [contCountries[j], contCountries[i]];
            }
            for (const id of contCountries) {
                if (count >= targetPerContinent[cont]) break;
                selected.add(id);
                aiIds.push(id);
                count++;
            }
        }

        // Create player empire
        const playerCountry = COUNTRIES[cid];
        this.empires[cid] = {
            id: cid, tids: [cid], coins: 20, alive: true, weapons: new Set([1]), spy: false, alliances: {},
            color: playerCountry.color, dark: playerCountry.color, light: playerCountry.color,
            icon: playerCountry.flag, name: playerCountry.name,
            resources: { iron: 20, gold: 30, wood: 30, stone: 20, food: 30 },
            era: 'bronze', researchedTechs: [], currentResearch: null, researchProgress: 0,
            hero: null, formation: 'line', siegeWeapons: [],
            personality: 'strategic'
        };
        this.ts[cid].owner = cid;
        this.ts[cid].troops = 5;

        // Create AI empires
        const personalities = Object.keys(AI_PERSONALITIES);
        for (const aid of aiIds) {
            const ac = COUNTRIES[aid];
            this.empires[aid] = {
                id: aid, tids: [aid], coins: 15, alive: true, weapons: new Set([1]), spy: false, alliances: {},
                color: ac.color, dark: ac.color, light: ac.color,
                icon: ac.flag, name: ac.name,
                resources: { iron: 15, gold: 20, wood: 20, stone: 15, food: 20 },
                era: 'bronze', researchedTechs: [], currentResearch: null, researchProgress: 0,
                hero: null, formation: 'line', siegeWeapons: [],
                personality: personalities[Math.floor(Math.random() * personalities.length)] || 'aggressive'
            };
            this.ts[aid].owner = aid;
            this.ts[aid].troops = 3 + Math.floor(Math.random() * 3);
        }

        // Place neutral garrisons on unclaimed territories
        for (const t of territories) {
            if (this.ts[t.id].owner === null) {
                this.ts[t.id].troops = 1 + Math.floor(Math.random() * 3);
            }
        }

        // No fog of war in country mode — all 195 countries visible and clickable
        this.fogOfWar = {};
        for (const t of territories) {
            this.fogOfWar[t.id] = 'visible';
        }

        this.weather = 'clear';
        this.alliances = {};
        this.recruitedHeroes = [];

        // Store territory/empire data for T() and E() lookups
        this._activeTerritories = territories;
        this._activeEIDs = [cid, ...aiIds];

        // Patch T() and E() globally so all game code works
        window._T = (id) => this._activeTerritories?.[id] || TERRITORIES[id];
        window._E = (id) => this.empires?.[id] || EMPIRES[id];

        this.state = 'playing';
        this.renderer.startTransition('curtain');
        this.phase = 'select';
        this.sel = null;
        this.aiQ = []; this.aiIdx = -1; this.aiTimer = 0;
        this._income(this.player);
        this._log(`You lead ${playerCountry.flag} ${playerCountry.name}! Conquer the world.`);
        this.sfx.turn();

        console.log(`[CountryMode] Started with ${COUNTRIES.length} territories, ${this._activeEIDs.length} empires`);
    }

    // Override T() and E() to use country data when in country mode
    _T(id) { return this._countryMode ? (this._activeTerritories?.[id] || null) : T(id); }
    _E(id) { return this._countryMode ? (this.empires?.[id] || null) : E(id); }

    // ── INCOME ────────────────────────────────────────────────
    _income(eid) {
        const emp = this.empires[eid];
        if (!emp) return;
        let inc = 3;
        const e = this._countryMode ? this.empires[eid] : E(eid);
        if (!e) { emp.coins = (emp.coins || 0) + inc; return; }
        const tLookup = (id) => (this._activeTerritories?.[id] || T(id));
        for (const tid of emp.tids) {
            inc += 1;
            if (e.bonusType === 'income') inc += 2;
            if (e.bonusType === 'desert' && tLookup(tid).terrain === 'desert') inc += 3;
            if (e.bonusType === 'bonus') inc += 2;
            if (e.bonusType === 'warMachine') inc += 3;
        }

        // ── Resource production per territory ──
        for (const tid of emp.tids) {
            const tData = this.territoryData[tid];
            if (!tData) continue;
            const prod = calcTerritoryProduction(tData.terrain, this.ts[tid]?.buildings || {});
            for (const res of RESOURCE_KEYS) {
                emp.resources[res] = (emp.resources[res] || 0) + (prod[res] || 0);
            }
        }

        // ── Era bonus to income ──
        const eraBonus = ERA_BONUSES[emp.era || 'bronze'];
        if (eraBonus) inc += eraBonus.goldPerTerritory * emp.tids.length;

        // ── Tech bonuses to income ──
        if (emp.researchedTechs?.length > 0) {
            const techBon = getTechBonuses(emp.researchedTechs);
            inc += techBon.goldPerTerritory * emp.tids.length;
        }

        // ── Weather effects ──
        const weatherDef = WEATHER_TYPES[this.weather];
        if (weatherDef?.goldMod) inc += weatherDef.goldMod * emp.tids.length;

        // ── Alliance trade bonus ──
        for (const [key, alliance] of Object.entries(this.alliances || {})) {
            if (key === eid || alliance.targetEid === eid) {
                const aType = ALLIANCE_TYPES[alliance.type];
                if (aType) inc += Math.floor(inc * aType.tradeMod * 0.1);
            }
        }

        // ── Hero bonus ──
        if (emp.hero && HEROES[emp.hero]?.special === 'armada') {
            inc += 3 * emp.tids.length;
        }

        // Difficulty modifier for AI
        if (eid !== this.player) {
            if (this.difficulty === 'easy') inc = Math.floor(inc * 0.6);
            else if (this.difficulty === 'hard') inc = Math.floor(inc * 1.4);
        }
        emp.coins += inc;
        // Apply supply wagon bonus if active
        if (eid === this.player && this._supplyBonus > 0) {
            emp.coins += this._supplyBonus;
            this.stats.coinsEarned += this._supplyBonus;
            this._log(`Supply wagon: +${this._supplyBonus} bonus coins!`);
            this._supplyBonus = 0;
        }
        if (eid === this.player) {
            this.stats.coinsEarned += inc;
            this._log(`Income: +${inc} coins (now ${emp.coins})`);
            // Resource summary
            const resSummary = RESOURCE_KEYS.map(k => `${RESOURCES[k].icon}${emp.resources[k] || 0}`).join(' ');
            this._log(`Resources: ${resSummary}`);
            // Floating income text
            if (this.renderer) {
                const hud = { x: this.W - 70, y: 50 };
                this.renderer.addFloat(`+${inc}`, hud.x, hud.y, '#ffd700', 18, 50);
            }
        }
    }

    // ── PLAYING ───────────────────────────────────────────────

    // ── NEW SYSTEM HELPERS ──────────────────────────────────

    _findTechDef(techId) {
        for (const eraTechs of Object.values(TECHS)) {
            const t = eraTechs.find(t => t.id === techId);
            if (t) return t;
        }
        return null;
    }

    _rollDisaster() {
        const disasters = Object.entries(DISASTERS);
        const [dKey, dDef] = disasters[Math.floor(Math.random() * disasters.length)];
        if (Math.random() > dDef.chance) return;
        const playerTids = this.empires[this.player]?.tids || [];
        if (playerTids.length === 0) return;
        const tid = playerTids[Math.floor(Math.random() * playerTids.length)];
        const tName = (this._activeTerritories?.[tid] || T(tid))?.name || 'Territory';
        switch (dDef.effect) {
            case 'destroy_buildings':
                this.ts[tid].buildings = {};
                this._log(`${dDef.icon} ${dDef.name}: ${tName}'s buildings destroyed!`);
                break;
            case 'reduce_food':
                this.empires[this.player].resources.food = Math.max(0, (this.empires[this.player].resources.food || 0) - 10);
                this._log(`${dDef.icon} ${dDef.name}: ${tName} food stores reduced!`);
                break;
            case 'troop_loss':
                this.ts[tid].troops = Math.max(1, this.ts[tid].troops - 2);
                this._log(`${dDef.icon} ${dDef.name}: ${tName} lost 2 troops!`);
                break;
            case 'troop_desert':
                if (this.ts[tid].troops > 1) {
                    this.ts[tid].troops--;
                    this._log(`${dDef.icon} ${dDef.name}: A troop deserted from ${tName}!`);
                }
                break;
            case 'bonus_gold':
                this.empires[this.player].coins += 20;
                this.empires[this.player].resources.gold += 10;
                this._log(`${dDef.icon} ${dDef.name}: Found ancient treasure in ${tName}! +20 coins`);
                break;
            case 'bonus_troops':
                this.ts[tid].troops += 2;
                this._log(`${dDef.icon} ${dDef.name}: 2 migrants joined ${tName}!`);
                break;
        }
    }

    // ── Build a structure in a territory ──
    _buildStructure(tid, buildingKey) {
        const emp = this.empires[this.player];
        if (!emp) return false;
        const bDef = BUILDINGS[buildingKey];
        if (!bDef) return false;
        // Check ownership
        if (this.ts[tid].owner !== this.player) return false;
        // Check resources
        for (const [res, cost] of Object.entries(bDef.cost)) {
            if ((emp.resources[res] || 0) < cost) return false;
        }
        // Deduct cost
        for (const [res, cost] of Object.entries(bDef.cost)) {
            emp.resources[res] -= cost;
        }
        // Place building
        this.ts[tid].buildings[buildingKey] = (this.ts[tid].buildings[buildingKey] || 0) + 1;
        this._log(`${bDef.icon} Built ${bDef.name} in ${(this._activeTerritories?.[tid] || T(tid))?.name || 'Territory'}`);
        addXP(this.profile, XP_REWARDS.build_structure, 'build_structure');
        this.stats.totalBuildings++;
        return true;
    }

    // ── Start researching a tech ──
    _startResearch(techId) {
        const emp = this.empires[this.player];
        if (!emp) return false;
        if (emp.currentResearch) return false;
        const techDef = this._findTechDef(techId);
        if (!techDef) return false;
        if ((emp.researchedTechs || []).includes(techId)) return false;
        if (emp.coins < techDef.cost) return false;
        emp.coins -= techDef.cost;
        emp.currentResearch = techId;
        emp.researchProgress = 0;
        this._log(`🔬 Researching ${techDef.name} (${techDef.turns} turns)`);
        return true;
    }

    // ── Recruit hero ──
    _recruitHero(heroId) {
        const emp = this.empires[this.player];
        if (!emp) return false;
        const hDef = HEROES[heroId];
        if (!hDef) return false;
        if (this.recruitedHeroes.includes(heroId)) return false;
        // Check era requirement
        const eraIdx = ERA_ORDER.indexOf(emp.era || 'bronze');
        const heroEraIdx = ERA_ORDER.indexOf(hDef.era);
        if (heroEraIdx > eraIdx) return false;
        // Check cost
        for (const [res, cost] of Object.entries(hDef.cost)) {
            if ((emp.resources[res] || 0) < cost) return false;
        }
        for (const [res, cost] of Object.entries(hDef.cost)) {
            emp.resources[res] -= cost;
        }
        this.recruitedHeroes.push(heroId);
        emp.hero = heroId;
        this._log(`${hDef.icon} ${hDef.name} has joined your empire!`);
        addXP(this.profile, XP_REWARDS.hero_recruit, 'hero_recruit');
        return true;
    }

    // ── Propose alliance ──
    _proposeAlliance(targetEid, type = 'pact') {
        const emp = this.empires[this.player];
        if (!emp || !this.empires[targetEid]?.alive) return false;
        if (this.turn < (DIPLOMACY.propose_alliance?.minTurn || 3)) return false;
        if (emp.coins < (DIPLOMACY.propose_alliance?.cost || 10)) return false;
        // AI personality determines acceptance
        const personality = this.empires[targetEid].personality;
        const acceptanceChance = type === 'full' ? 0.2 : 0.6;
        if (Math.random() < acceptanceChance) {
            emp.alliances[targetEid] = 10; // 10 turns
            this.empires[targetEid].alliances[this.player] = 10;
            this._log(`🤝 Alliance formed with ${(this.empires?.[targetEid] || E(targetEid))?.name || 'Empire'}!`);
            addXP(this.profile, XP_REWARDS.form_alliance, 'form_alliance');
            return true;
        } else {
            this._log(`${(this.empires?.[targetEid] || E(targetEid))?.name || 'Empire'} rejected your alliance proposal.`);
            return false;
        }
    }

    // ── Upgrade era ──
    _upgradeEra(newEra) {
        const emp = this.empires[this.player];
        if (!emp) return false;
        const eraDef = ERAS[newEra];
        if (!eraDef) return false;
        if (eraDef.reqEra !== emp.era) return false;
        if (emp.coins < eraDef.researchCost) return false;
        if (this.turn < eraDef.turnReq) return false;
        emp.coins -= eraDef.researchCost;
        emp.era = newEra;
        this._log(`🏛️ Advanced to ${eraDef.icon} ${eraDef.name}!`);
        // Unlock weapons for this era
        const eraIdx = ERA_ORDER.indexOf(newEra);
        if (eraIdx > 0) {
            emp.weapons.add(eraIdx + 1);
        }
        return true;
    }

    _upPlay() {
        if (this._isAI()) { this._upAI(); return; }
        // Auto-end-turn countdown: after player acts, AI plays automatically
        if (this._autoEndTurnDelay > 0) {
            this._autoEndTurnDelay--;
            if (this._autoEndTurnDelay <= 0) {
                this.endTurn();
                this.sfx.turn();
            }
            return;
        }
        // Trigger random events at start of player turn
        if (this.eventCooldown <= 0 && !this.event && this.turn > 1) {
            this._triggerEvent();
        }
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;

        // Check buttons
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }

        // Check territory click
        const tid = this.renderer.terrAt(sx, sy);
        if (tid >= 0) {
            this.input.consumeClick();
            this._clickTerr(tid);
            return;
        }
        this.input.consumeClick();
        this.sel = null;
    }

    _clickTerr(tid) {
        const s = this.ts[tid];
        // Click any territory to view it (own = full manage, enemy = scout)
        this._enterTerritoryView(tid);
        this.sfx.click();
    }

    // ── TERRITORY VIEW (Zoom Inside) ──────────────────────────
    _weaponTier(weapon) {
        if (!weapon) return 0;
        for (const [tier, weapons] of Object.entries(WEAPONS)) {
            if (weapons.includes(weapon)) return parseInt(tier);
        }
        return 0;
    }

    _enterTerritoryView(tid) {
        const t = this._activeTerritories?.[tid] || T(tid);
        const s = this.ts[tid];
        // Ensure buildings data exists
        if (!s.buildings) {
            s.buildings = { command_center: 0, supply_depot: 0, watchtower: 0, armory: 0, bunker: 0, radar: 0 };
        }
        // Generate soldiers for the interior view
        const soldiers = [];
        const count = Math.min(s.troops, 30);
        for (let i = 0; i < count; i++) {
            soldiers.push({
                x: 0.15 + Math.random() * 0.7,
                y: 0.25 + Math.random() * 0.5,
                frame: Math.random() * 100,
                speed: 0.3 + Math.random() * 0.7,
                dir: Math.random() > 0.5 ? 1 : -1,
                size: 1.5 + Math.random() * 0.8,
            });
        }
        // Generate visual building positions based on actual buildings + some defaults
        const visBuildings = [];
        const bTypes = ['outpost', 'command_center', 'supply_depot', 'watchtower', 'armory', 'bunker', 'radar'];
        const bPositions = [
            { x: 0.2, y: 0.28 }, { x: 0.5, y: 0.22 }, { x: 0.75, y: 0.30 },
            { x: 0.15, y: 0.18 }, { x: 0.6, y: 0.15 }, { x: 0.85, y: 0.20 },
            { x: 0.4, y: 0.35 },
        ];
        // Add default outpost
        visBuildings.push({ x: 0.2, y: 0.28, type: 'outpost', size: 2.0 });
        let pi = 1;
        for (const bt of bTypes) {
            for (let i = 0; i < s.buildings[bt]; i++) {
                if (pi < bPositions.length) {
                    visBuildings.push({ x: bPositions[pi].x, y: bPositions[pi].y, type: bt, size: 1.8 + Math.random() * 0.5 });
                    pi++;
                }
            }
        }
        this._terrView = {
            tid, zoom: 0, soldiers, buildings: visBuildings, time: 0,
            sub: null, // null = raw 3D scene (soldiers, emperor, buildings); explore, shop, story, build, manage, weapons, attack, battle
            weaponTier: this._weaponTier(this.ts[tid].weapon),
        };
        this.state = 'territory';
        this.sel = tid;
    }

    _exitTerritoryView() {
        this._terrView = null;
        this.state = 'playing';
        this.phase = 'select';
        this.sel = null;
        this.sfx.click();
        // Auto-trigger AI if returning from a post-battle territory view
        if (this._autoEndTurnDelay <= 0 && this.turn > 0) {
            this._autoEndTurn();
        }
    }

    _upTerritoryView() {
        if (!this._terrView) { this._exitTerritoryView(); return; }
        this._terrView.time++;
        this._terrView.zoom = Math.min(1, this._terrView.zoom + 0.04);

        // Update soldier positions (patrol animation)
        for (const s of this._terrView.soldiers) {
            s.frame += s.speed;
            s.x += s.dir * 0.0003 * s.speed;
            if (s.x > 0.85) { s.x = 0.85; s.dir = -1; }
            if (s.x < 0.15) { s.x = 0.15; s.dir = 1; }
        }

        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;
        this.input.consumeClick();

        // Chat input field click
        if (this._terrView.sub === 'chat' && this._chatInputRect) {
            const r = this._chatInputRect;
            if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
                this._typingChat = true;
                return;
            } else {
                this._typingChat = false;
            }
        }

        // Check buttons registered by renderer
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                b.fn();
                return;
            }
        }
    }

    // Building costs
    static BUILD_COSTS = { command_center: 25, supply_depot: 15, watchtower: 20, armory: 30, bunker: 20, radar: 35 };
    static BUILD_ICONS = { command_center: '🏢', supply_depot: '📦', watchtower: '🗼', armory: '🔫', bunker: '🛡️', radar: '📡' };
    static BUILD_DESCS = {
        command_center: '+1 troop/turn bonus',
        supply_depot: '+2 income/turn',
        watchtower: '+3 defense bonus',
        armory: '+3 coins/turn',
        bunker: '+2 fortification',
        radar: '+morale & intel',
    };

    _buildStructure(tid, type) {
        const cost = Game.BUILD_COSTS[type];
        const emp = this.empires[this.player];
        if (!emp || emp.coins < cost) { this.sfx.error(); this._log('Not enough coins!'); return; }
        const s = this.ts[tid];
        if (!s.buildings) s.buildings = { command_center: 0, supply_depot: 0, watchtower: 0, armory: 0, bunker: 0, radar: 0 };
        // Max 3 of each type
        if (s.buildings[type] >= 3) { this.sfx.error(); this._log('Max buildings of this type reached!'); return; }
        emp.coins -= cost;
        this.undoStack.push({ action: 'build', tid, type, buildings: { ...s.buildings }, coins: emp.coins });
        s.buildings[type]++;
        this._log(`Built ${type} at ${(this._activeTerritories?.[tid] || T(tid))?.name || 'Territory'} (-${cost} coins)`);
        this.sfx.buy();
        // Refresh buildings in territory view without resetting tab
        if (this._terrView) {
            const bTypes = ['outpost', 'command_center', 'supply_depot', 'watchtower', 'armory', 'bunker', 'radar'];
            const bPositions = [
                { x: 0.2, y: 0.28 }, { x: 0.5, y: 0.22 }, { x: 0.75, y: 0.30 },
                { x: 0.15, y: 0.18 }, { x: 0.6, y: 0.15 }, { x: 0.85, y: 0.20 },
                { x: 0.4, y: 0.35 },
            ];
            const visBuildings = [{ x: 0.2, y: 0.28, type: 'house', size: 2.0 }];
            let pi = 1;
            for (const bt of bTypes) {
                for (let i = 0; i < (s.buildings[bt] || 0); i++) {
                    if (pi < bPositions.length) {
                        visBuildings.push({ x: bPositions[pi].x, y: bPositions[pi].y, type: bt, size: 1.8 + Math.random() * 0.5 });
                        pi++;
                    }
                }
            }
            this._terrView.buildings = visBuildings;
        }
    }

    _openShop() {
        if (!this.sel && this.empires[this.player].tids.length > 0) this.sel = this.empires[this.player].tids[0];
        this.state = 'shop';
        this.sfx.click();
    }

    // ── MOVE DIALOG ───────────────────────────────────────────
    _upMoveDialog() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                if (b.fn) b.fn();
                return;
            }
        }
        this.input.consumeClick();
    }

    _moveDialogConfirm() {
        const mv = Math.min(this.moveAmount, this.ts[this.moveFrom].troops - 1);
        if (mv <= 0) { this.sfx.error(); return; }
        this.undoStack.push({ action: 'move', from: this.moveFrom, to: this.moveTo, fromTroops: this.ts[this.moveFrom].troops, toTroops: this.ts[this.moveTo].troops });
        this.ts[this.moveFrom].troops -= mv;
        this.ts[this.moveTo].troops += mv;
        this._log(`Moved ${mv} troops: ${(this._activeTerritories?.[this.moveFrom] || T(this.moveFrom))?.name || '?'} -> ${(this._activeTerritories?.[this.moveTo] || T(this.moveTo))?.name || '?'}`);
        this.sfx.march();
        this.renderer.shake = 2;
        this.state = 'playing';
        this.sel = null;
        this.phase = 'select';
        this.moveFrom = null;
        this.moveTo = null;
        this._autoEndTurn();
    }

    _moveDialogCancel() {
        this.state = 'playing';
        this.phase = 'move';
        this.moveFrom = null;
        this.moveTo = null;
        this.sfx.click();
    }

    _moveDialogAdjust(delta) {
        this.moveAmount = Math.max(1, Math.min(this.ts[this.moveFrom].troops - 1, this.moveAmount + delta));
        this.sfx.click();
    }

    // ── ATTACK SCREEN ─────────────────────────────────────────
    _upAttack() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;

        // Check buttons in attack panel
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }

        // FIX: Clicking outside buttons goes back to playing (not looping in attack state)
        this.input.consumeClick();
        this.state = 'playing';
        this.phase = 'select';
        this._attackTarget = null;
    }

    _doAttack(stratIdx, stayInView) {
        const from = this.sel, to = this._attackTarget;
        if (to == null || from == null) return;
        const atkS = this.ts[from], defS = this.ts[to];
        if (atkS.troops <= 1) { this.sfx.error(); return; }

        // Use attackAmount (emperor's order) — default to all-1 if not set
        const sendTroops = this.attackAmount > 0 ? Math.min(this.attackAmount, atkS.troops - 1) : atkS.troops - 1;
        if (sendTroops <= 0) { this.sfx.error(); return; }

        const strat = STRATEGIES[stratIdx || 0];
        const emp = this.empires[this.player];
        const weapon = this.ts[from].weapon;
        const defEmp = defS.owner ? (this.empires[defS.owner] || E(defS.owner)) : null;
        const defWeapon = this.ts[to].weapon;
        const _e = (id) => (this.empires?.[id] || E(id));
        const _t = (id) => (this._activeTerritories?.[id] || T(id));

        const res = resolveCombat(sendTroops, defS.troops, _e(this.player), defEmp, _t(to), strat, weapon, defWeapon, this.ts[to].fort);

        // Fire mode affects combat result
        if (this.attackFireMode === 'burst') {
            res.atkLeft = Math.max(1, Math.floor(res.atkLeft * 0.9));
            res.defLeft = Math.max(0, Math.floor(res.defLeft * 0.85));
        } else if (this.attackFireMode === 'full') {
            res.atkLeft = Math.max(1, Math.floor(res.atkLeft * 0.8));
            res.defLeft = Math.max(0, Math.floor(res.defLeft * 0.7));
        }

        this.battle = { from, to, res, atk: this.player, def: defS.owner };
        this.renderer.shake = res.conquered ? 10 : 5;
        this.renderer._triggerFlash(res.conquered ? 'rgb(255,215,0)' : 'rgb(255,50,50)', 0.4);
        this.sfx.battle(); this.sfx.dice();

        // Only enter combat state if not staying in territory view
        if (!stayInView) {
            this.state = 'combat';
            this.renderer.startCombatAnim(from, to, this.player, defS.owner, res.conquered);
        }

        // Apply results
        const stayedBehind = atkS.troops - sendTroops;
        atkS.troops = res.atkLeft + stayedBehind; // Survivors + those who stayed
        if (atkS.troops < 1) atkS.troops = 1;
        emp.coins += res.coins;
        this.stats.coinsEarned += res.coins;

        // FIX: Removed dead code `if (this.player === this.player)` — was always true
        this._log(`Battle! You ${res.conquered ? 'CONQUERED' : 'lost'} ${_t(to).name}. +${res.coins} coins`);

        if (res.conquered) {
            // FIX: Save defender color BEFORE changing ownership
            const defColor = defS.owner ? _e(defS.owner).color : '#444';

            // Handle defender losing territory
            if (defS.owner && this.empires[defS.owner]) {
                this.empires[defS.owner].tids = this.empires[defS.owner].tids.filter(t => t !== to);
                if (this.empires[defS.owner].tids.length === 0) {
                    this.empires[defS.owner].alive = false;
                    emp.coins += 30;
                    this.stats.coinsEarned += 30;
                    this.stats.kills++;
                    if (!this.killLog[this.player]) this.killLog[this.player] = [];
                    this.killLog[this.player].push(defS.owner);
                    this._log(`${_e(defS.owner).name} eliminated! +30 coins`);
                    this.sfx.elim();
                    this.renderer._triggerFlash('rgb(255,100,0)', 0.6);
                    this.renderer.addNotification(`EMPIRE ELIMINATED: ${_e(defS.owner).name}!`, '#ff4444', '💀', 200);
                    this._gainXP(50);
                    // Show eliminated empire's history
                    this.renderer.showEmpireStory(defS.owner);
                }
            }
            defS.owner = this.player;
            defS.troops = res.atkLeft;
            atkS.troops -= sendTroops; // Emperor keeps the rest behind
            if (atkS.troops < 1) atkS.troops = 1;
            emp.tids.push(to);
            this.stats.conquered++;
            this.sfx.capture();
            this._gainXP(20);
            // Notification popup — the addictive dopamine hit
            this.renderer.addNotification(`TERRITORY CONQUERED: ${(this._activeTerritories?.[to] || T(to))?.name || 'Territory'}!`, (this.empires?.[this.player] || EMPIRES[this.player])?.color || '#0f0', '🏴', 150);
            // Float text at territory center
            const ct = this._activeTerritories?.[to] || T(to);
            const cp = this.renderer.toScr(ct.cx, ct.cy);
            this.renderer.addFloat('CONQUERED!', cp.x, cp.y - 30, '#ffd700', 20, 70);
            this.renderer.addFloat('+30 coins', cp.x, cp.y + 5, '#ffd700', 14, 50);
            // Show territory historical fact on conquest
            this.renderer.showTerritoryStory(to);
            // Show empire story periodically (every 2nd conquest)
            if (this.stats.conquered % 2 === 0) {
                this.renderer.showEmpireStory(this.player);
            }
            this.renderer.particles.push(...this._makeParticles(to, _e(this.player).light));
            this.renderer.addCaptureAnim(to, _e(this.player).color, defColor);
            if (emp.tids.length === (this._activeTerritories || TERRITORIES).length) {
                this.state = 'victory';
                this.renderer.startTransition('zoom');
                this.sfx.victory();
                return;
            }
        } else {
            defS.troops = res.defLeft;
            // Show battle story for non-conquest battles too
            this.renderer.showTerritoryStory(to);
        }

        // state is already 'combat' (set above), animation will transition to 'battle'
        this.phase = 'select';
        this.sel = null;
        this._attackTarget = null;
    }

    _makeParticles(tid, color) {
        const _t1319 = this._activeTerritories?.[tid] || T(tid); const p = this.renderer.toScr(_t1319.cx, _t1319.cy);
        const out = [];
        for (let i = 0; i < 20; i++) {
            out.push({
                x: p.x, y: p.y,
                vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6-2,
                life: 1, decay: 0.015+Math.random()*0.02,
                color, size: 2+Math.random()*4
            });
        }
        return out;
    }

    // ── BATTLE OVERLAY ────────────────────────────────────────
    _upBattle() {
        if (!this.input.hasClick()) return;
        this.input.consumeClick();
        const bat = this.battle;
        this.battle = null;

        // Post-battle: enter the target territory so player can upgrade (only if conquered)
        if (bat && bat.to != null && bat.res && bat.res.conquered) {
            this.sel = bat.to;
            this._enterTerritoryView(bat.to);
            this._terrView.sub = 'weapons';
            return;
        }
        this.state = 'playing';
        this.phase = 'select';
        this._attackTarget = null;
        this._autoEndTurn();
    }
    _upShop() {
        if (!this.input.hasClick()) return;
        const sx = this.input.sx, sy = this.input.sy;
        for (const b of this.btns) {
            if (b.rect && sx >= b.rect.x && sx <= b.rect.x + b.rect.w && sy >= b.rect.y && sy <= b.rect.y + b.rect.h) {
                this.input.consumeClick();
                b.fn();
                return;
            }
        }
        this.input.consumeClick();
    }

    _buySoldier() {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        const cost = this.player === 'russia' ? 5 : 10;
        const emp = this.empires[this.player];
        if (emp.coins < cost) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'recruit', tid: this.sel, troops: this.ts[this.sel].troops, coins: emp.coins, stats: { ...this.stats } });
        emp.coins -= cost;        this.ts[this.sel].troops++;
        this.stats.totalTroops++;
        this._log(`Recruited soldier at ${(this._activeTerritories?.[this.sel] || T(this.sel))?.name || 'Territory'} (-${cost} coins)`);
        this.sfx.recruit();
        this._gainXP(5);
        // Float: +1 soldier at territory center
        if (this.renderer) {
            const t = this._activeTerritories?.[this.sel] || T(this.sel);
            const p = this.renderer.toScr(t.cx, t.cy);
            this.renderer.addFloat('+1', p.x, p.y - 20, '#2ecc71', 16, 45);
            this.renderer.addFloat(`-${cost}`, p.x + 20, p.y, '#e74c3c', 12, 40);
        }
    }

    // ── XP / LEVEL SYSTEM (addictive progression) ──
    _gainXP(amount) {
        this.stats.xp += amount;
        const needed = this._xpForLevel(this.stats.level);
        if (this.stats.xp >= needed) {
            this.stats.xp -= needed;
            this.stats.level++;
            const lvl = this.stats.level;
            // Level up rewards: bonus coins
            const reward = lvl * 15;
            this.empires[this.player].coins += reward;
            this.stats.coinsEarned += reward;
            this._log(`★ LEVEL UP! Now level ${lvl}! +${reward} coins bonus!`);
            this.sfx.levelUp && this.sfx.levelUp();
            if (this.renderer) {
                this.renderer.addNotification(`★ LEVEL ${lvl}! +${reward} coins!`, '#ffd700', '⭐', 180);
                this.renderer._triggerFlash('rgb(255,215,0)', 0.4);
                // Big floating text
                this.renderer.addFloat(`LEVEL ${lvl}!`, this.W / 2, this.H / 2, '#ffd700', 28, 90);
            }
        }
    }

    _buyVeteran() {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        const emp = this.empires[this.player];
        if (emp.coins < 20) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'veteran', tid: this.sel, troops: this.ts[this.sel].troops, coins: emp.coins, stats: { ...this.stats } });
        emp.coins -= 20; this.ts[this.sel].troops += 2;
        this.stats.totalTroops += 2;
        this._log(`Recruited 2 veterans at ${(this._activeTerritories?.[this.sel] || T(this.sel))?.name || 'Territory'} (-20 coins)`);
        this.sfx.recruit();
    }

    _buyFortify() {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        const emp = this.empires[this.player];
        if (emp.coins < 15) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'fortify', tid: this.sel, fort: this.ts[this.sel].fort, coins: emp.coins });
        emp.coins -= 15; this.ts[this.sel].fort += 2;
        this._log(`Fortified ${(this._activeTerritories?.[this.sel] || T(this.sel))?.name || 'Territory'} (+2 def permanently)`);
        this.sfx.buy();
    }

    _buyWeaponTier(tier) {
        const costs = { 2: 25, 3: 50, 4: 80 };
        const cost = costs[tier];
        const emp = this.empires[this.player];
        if (emp.coins < cost) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'weaponTier', tier, coins: emp.coins, weapons: new Set(emp.weapons) });
        emp.coins -= cost; emp.weapons.add(tier);
        this._log(`Unlocked Tier ${tier} weapons! (-${cost} coins)`);
        this.sfx.buy();
    }

    _equipWeapon(tier, idx) {
        if (!this.sel || this.ts[this.sel].owner !== this.player) return;
        if (!this.empires[this.player].weapons.has(tier)) { this.sfx.error(); this._log('Weapon tier locked!'); return; }
        this.undoStack.push({ action: 'equip', tid: this.sel, weapon: this.ts[this.sel].weapon });
        this.ts[this.sel].weapon = WEAPONS[tier][idx];
        this._log(`Equipped ${WEAPONS[tier][idx].name} at ${(this._activeTerritories?.[this.sel] || T(this.sel))?.name || 'Territory'}`);
        this.sfx.click();
    }

    _buySpy() {
        const emp = this.empires[this.player];
        if (emp.spy) { this.sfx.error(); this._log('Spy network already active!'); return; }
        if (emp.coins < 30) { this.sfx.error(); this._log('Not enough coins!'); return; }
        this.undoStack.push({ action: 'spy', coins: emp.coins });
        emp.coins -= 30; emp.spy = true;
        this._log('Spy network activated! Enemy troop counts revealed.');
        this.sfx.buy();
    }

    // ── END TURN ──────────────────────────────────────────────
    _autoEndTurnDelay = 0; // frames to wait before AI plays
    _autoEndTurn() {
        // Auto-trigger AI turns after player acts (no manual End Turn needed)
        this._autoEndTurnDelay = 30; // ~0.5 second cinematic pause
    }

    endTurn() {
        this.sel = null;
        this.phase = 'select';
        this._attackTarget = null;
        this.undoStack = [];

        // ── Weather change ──
        this.weather = rollWeather(this.turn);
        const wDef = WEATHER_TYPES[this.weather];
        if (this.weather !== 'clear') {
            this._log(`Weather: ${wDef.icon} ${wDef.name}`);
        }

        // ── Update fog of war ──
        const emp = this.empires[this.player];
        if (emp) {
            const terr = this._activeTerritories || TERRITORIES;
            for (const tid of emp.tids) {
                this.fogOfWar[tid] = 'visible';
                for (const adjId of terr[tid]?.adj || []) {
                    if (this.fogOfWar[adjId] === 'hidden') this.fogOfWar[adjId] = 'fogged';
                }
            }
        }

        // ── Advance research ──
        if (emp?.currentResearch) {
            emp.researchProgress++;
            const techDef = this._findTechDef(emp.currentResearch);
            if (techDef && emp.researchProgress >= techDef.turns) {
                if (!emp.researchedTechs) emp.researchedTechs = [];
                emp.researchedTechs.push(emp.currentResearch);
                this._log(`Research complete: ${techDef.name}!`);
                if (this.player === this.player) {
                    addXP(this.profile, XP_REWARDS.research_tech, 'research_tech');
                }
                emp.currentResearch = null;
                emp.researchProgress = 0;
            }
        }

        // ── Disasters ──
        if (this.turn > 3 && Math.random() < 0.08) {
            this._rollDisaster();
        }

        // ── Alliance upkeep ──
        const activeEIDs = this._activeEIDs || EIDS;
        for (const id of activeEIDs) {
            const e = this.empires[id];
            if (!e) continue;
            for (const allyId of Object.keys(e.alliances || {})) {
                e.alliances[allyId]--;
                if (e.alliances[allyId] <= 0) {
                    delete e.alliances[allyId];
                    if (id === this.player && this.empires[allyId]) this._log(`Alliance with ${this.empires[allyId].name} expired.`);
                }
            }
        }

        // Build AI queue: only alive AI empires
        this.aiQ = [];
        this.aiIdx = 0;
        this.aiTimer = 0;

        // Give income to all alive AI empires
        for (const id of activeEIDs) {
            if (id === this.player || !this.empires[id]?.alive) continue;
            this._income(id);
        }

        // Check if there are actually any AI empires to process
        const hasAI = activeEIDs.some(id => id !== this.player && this.empires[id]?.alive);
        if (!hasAI) {
            // No AI left — just advance to next turn
            this.aiQ = [];
            this.aiIdx = -1;
            this.turn++;
            const coinsBefore = this.empires[this.player].coins;
            this._income(this.player);
            if (this.goldenAge) {
                const incomeGained = this.empires[this.player].coins - coinsBefore;
                this.empires[this.player].coins += incomeGained;
                this.stats.coinsEarned += incomeGained;
                this._log('Golden Age: Double income this turn!');
                this.goldenAge = false;
            }
            this._log(`--- Turn ${this.turn} ---`);
            this.sfx.turn();
            return;
        }

        this._log('--- AI empires are moving... ---');
    }

    // ── AI ────────────────────────────────────────────────────
    _isAI() { return this.aiQ.length > 0 || this.aiIdx >= 0; }

    _upAI() {
        this.aiTimer++;
        const activeEIDs = this._activeEIDs || EIDS;

        // All AI empires processed — advance turn
        if (this.aiIdx >= activeEIDs.length) {
            this.aiQ = [];
            this.aiIdx = -1;
            this.turn++;
            const coinsBefore = this.empires[this.player].coins;
            this._income(this.player);
            if (this.goldenAge) {
                const incomeGained = this.empires[this.player].coins - coinsBefore;
                this.empires[this.player].coins += incomeGained;
                this.stats.coinsEarned += incomeGained;
                this._log('Golden Age: Double income this turn!');
                this.goldenAge = false;
            }
            this._log(`--- Turn ${this.turn} ---`);
            this.sfx.turn();
            // Show random history lesson every 5 turns
            if (this.turn % 5 === 0) {
                this.renderer.showRandomEmpireStory();
            }
            return;
        }

        const cur = activeEIDs[this.aiIdx];

        // Skip player and dead empires
        if (cur === this.player || !this.empires[cur]?.alive) {
            this.aiIdx++;
            return;
        }

        // Generate actions for this AI if not already done
        if (!this.aiQ.length || this.aiQ._eid !== cur) {
            this.aiQ = new AI(this, cur).takeTurn();
            this.aiQ._eid = cur;
        }

        // Process ALL actions for this empire after a short delay (one batch per empire)
        if (this.aiTimer >= this.aiDelay) {
            this.aiTimer = 0;

            // Process all remaining actions for this empire at once
            while (this.aiQ.length > 0) {
                const a = this.aiQ.shift();
                if (a.type === 'recruit') {
                    this._log(`${(this.empires[a.empire]?.name || '?')} recruited at ${(this._activeTerritories?.[a.territory]?.name || T(a.territory).name)}`);
                }
                else if (a.type === 'move') {
                    this._log(`${(this.empires[a.empire]?.name || '?')} moved ${a.troops} troops`);
                }
                else if (a.type === 'fortify') {
                    this._log(`${(this.empires[a.empire]?.name || '?')} fortified ${(this._activeTerritories?.[a.territory]?.name || T(a.territory).name)}`);
                }
                else if (a.type === 'attack') {
                    this._log(`${(this.empires[a.empire]?.name || '?')} attacked ${(this._activeTerritories?.[a.to]?.name || T(a.to).name)} from ${(this._activeTerritories?.[a.from]?.name || T(a.from).name)}${a.result.conquered ? ' — CONQUERED!' : ''}`);
                }
                else if (a.type === 'eliminated') {
                    this._log(`${(this.empires[a.by]?.name || '?')} eliminated ${(this.empires[a.empire]?.name || '?')}!`);
                }

                if (a.type === 'attack' && a.result.conquered) {
                    this.renderer.shake = 5;
                    // Show territory story when AI conquers
                    this.renderer.showTerritoryStory(a.to);
                    // Show attacking empire's story occasionally
                    if (Math.random() < 0.3) this.renderer.showEmpireStory(a.empire);
                    // Check if player was eliminated
                    if (!this.empires[this.player].alive) {
                        this.state = 'gameover';
                        this.renderer.startTransition('fade');
                        this.sfx.defeat();
                        this.aiQ = [];
                        this.aiIdx = -1;
                        return;
                    }
                    // Check if this AI won
                    const aiEmp = this.empires[a.empire];
                    if (aiEmp && aiEmp.alive && aiEmp.tids.length === TERRITORIES.length) {
                        this.state = 'gameover';
                        this.renderer.startTransition('fade');
                        this.sfx.defeat();
                        this.aiQ = [];
                        this.aiIdx = -1;
                        return;
                    }
                }
                if (a.type === 'eliminated') {
                    this.sfx.elim();
                    // Show eliminated empire's history
                    this.renderer.showEmpireStory(a.empire);
                }
                if (a.type === 'attack') this.sfx.battle();
            }

            // This AI's turn is done, move to next
            this.aiIdx++;
            this.aiQ = [];
        }
    }

    // ── END SCREEN ────────────────────────────────────────────
    _upEnd() {
        if (this.input.hasClick()) {
            this.input.consumeClick();
            this.state = 'menu';
        }
    }

    // ── QUIT TO MENU (full reset) ──
    _quitToMenu() {
        this.ts = {};
        this.sel = null;
        this.turn = 0;
        this.player = null;
        this.phase = 'select';
        this.aiQ = [];
        this.aiIdx = -1;
        this.aiTimer = 0;
        this.battle = null;
        this._terrView = null;
        this.state = 'menu';
    }

    // ── HELP SCREEN ───────────────────────────────────────────
    _upHelp() {
        if (this.input.hasClick()) {
            this.input.consumeClick();
            this.state = this._helpPrev;
            this.sfx.click();
        }
    }

    showHelp() {
        this._helpPrev = this.state;
        this.state = 'help';
        this.sfx.click();
    }

    // ── HELPERS ───────────────────────────────────────────────
    _log(m) { this.log.push(m); if (this.log.length > 60) this.log.shift(); }

    phaseMsg() {
        if (this._isAI()) return 'AI empires are taking their turns...';
        if (this.state === 'moveDialog') return this.moveFrom != null && this.moveTo != null ? `Move troops from ${(this._activeTerritories?.[this.moveFrom] || T(this.moveFrom))?.name || '?'} to ${(this._activeTerritories?.[this.moveTo] || T(this.moveTo))?.name || '?'}` : 'Move troops';
        return 'Click your territory to enter and command your forces';
    }

    empCoins() { return this.empires[this.player]?.coins || 0; }
    empTids() { return this.empires[this.player]?.tids || []; }

    // ── UNDO ──────────────────────────────────────────────────
    _undo() {
        if (this.undoStack.length === 0) { this.sfx.error(); this._log('Nothing to undo!'); return; }
        if (this._isAI()) { this.sfx.error(); return; }

        const snap = this.undoStack.pop();
        const emp = this.empires[this.player];

        if (snap.action === 'recruit') {
            this.ts[snap.tid].troops = snap.troops;
            emp.coins = snap.coins;
            this.stats = snap.stats;
            this._log('Undid recruit.');
        } else if (snap.action === 'veteran') {
            this.ts[snap.tid].troops = snap.troops;
            emp.coins = snap.coins;
            this.stats = snap.stats;
            this._log('Undid veteran recruit.');
        } else if (snap.action === 'fortify') {
            this.ts[snap.tid].fort = snap.fort;
            emp.coins = snap.coins;
            this._log('Undid fortify.');
        } else if (snap.action === 'weaponTier') {
            emp.coins = snap.coins;
            emp.weapons = snap.weapons;
            this._log('Undid weapon tier unlock.');
        } else if (snap.action === 'equip') {
            this.ts[snap.tid].weapon = snap.weapon;
            this._log('Undid weapon equip.');
        } else if (snap.action === 'spy') {
            emp.coins = snap.coins;
            emp.spy = false;
            this._log('Undid spy network.');
        } else if (snap.action === 'move') {
            this.ts[snap.from].troops = snap.fromTroops;
            this.ts[snap.to].troops = snap.toTroops;
            this._log('Undid move.');
        } else if (snap.action === 'build') {
            this.ts[snap.tid].buildings = { ...snap.buildings };
            this.empires[this.player].coins = snap.coins;
            this._log('Undid build.');
        }

        if (this.undoStack.length > 20) this.undoStack.shift();
        this.sfx.click();
    }

    // ── SAVE / LOAD ────────────────────────────────────────────
    saveGame() {
        const data = {
            player: this.player,
            turn: this.turn,
            empires: {},
            ts: {},
            stats: this.stats,
            killLog: this.killLog,
            difficulty: this.difficulty,
            eventHistory: this.eventHistory,
            eventCooldown: this.eventCooldown,
            goldenAge: this.goldenAge,
            supplyBonus: this._supplyBonus || 0,
        };
        for (const [id, emp] of Object.entries(this.empires)) {
            data.empires[id] = {
                id: emp.id, coins: emp.coins, alive: emp.alive,
                tids: [...emp.tids],
                weapons: [...emp.weapons],
                spy: emp.spy,
                alliances: emp.alliances || {},
                color: emp.color, dark: emp.dark, light: emp.light, icon: emp.icon, name: emp.name,
            };
        }
        for (const [tid, s] of Object.entries(this.ts)) {
            data.ts[tid] = { owner: s.owner, troops: s.troops, fort: s.fort, weapon: s.weapon ? s.weapon.name : 'Sword', buildings: s.buildings || { command_center: 0, supply_depot: 0, watchtower: 0, armory: 0, bunker: 0, radar: 0 } };
        }
        localStorage.setItem('emperorsConquest_save', JSON.stringify(data));
        this._log('Game saved!');
        this.sfx.buy();
    }

    loadGame() {
        const raw = localStorage.getItem('emperorsConquest_save');
        if (!raw) { this.sfx.error(); return false; }
        try {
            const data = JSON.parse(raw);
            this.player = data.player;
            this.turn = data.turn;
            this.difficulty = data.difficulty || 'normal';
            this.stats = data.stats || { kills:0, conquered:0, coinsEarned:0, totalTroops:0 };
            this.killLog = data.killLog || {};
            this.eventHistory = data.eventHistory || [];
            this.eventCooldown = data.eventCooldown || 0;
            this.goldenAge = data.goldenAge || false;
            this._supplyBonus = data.supplyBonus || 0;

            // Restore empires
            this.empires = {};
            for (const [id, emp] of Object.entries(data.empires)) {
                const empDef = E(id);
                this.empires[id] = {
                    id: emp.id, coins: emp.coins, alive: emp.alive,
                    tids: emp.tids,
                    weapons: new Set(emp.weapons),
                    spy: emp.spy,
                    alliances: emp.alliances || {},
                    color: emp.color || empDef.color, dark: emp.dark || empDef.dark, light: emp.light || empDef.light, icon: emp.icon || empDef.icon, name: emp.name || empDef.name,
                };
            }

            // Restore territory states — match weapon by name
            this.ts = {};
            for (const [tid, s] of Object.entries(data.ts)) {
                const weapon = this._findWeaponByName(s.weapon);
                const buildings = s.buildings || { command_center: 0, supply_depot: 0, watchtower: 0, armory: 0, bunker: 0, radar: 0 };
                this.ts[parseInt(tid)] = { owner: s.owner, troops: s.troops, fort: s.fort, weapon, buildings };
            }

            this.state = 'playing';
            this.phase = 'select';
            this.sel = null;
            this.aiQ = []; this.aiIdx = -1; this.aiTimer = 0;
            this.battle = null;
            this._attackTarget = null;
            this.undoStack = []; // FIX: Clear undo stack on load
            this._log('Game loaded! Continuing...');
            this.sfx.buy();
            return true;
        } catch(e) {
            this.sfx.error();
            return false;
        }
    }

    _findWeaponByName(name) {
        for (const [tier, weapons] of Object.entries(WEAPONS)) {
            for (const w of weapons) {
                if (w.name === name) return w;
            }
        }
        return WEAPONS[1][0]; // default to Assault Rifle
    }

    // ── RANDOM EVENTS SYSTEM ──────────────────────────────────
    static EVENT_TYPES = [
        {
            type: 'plague',
            title: 'Plague Strikes!',
            desc: 'A deadly plague sweeps through the land, decimating troops.',
            icon: '\u{1F480}',
            color: '#8B0000',
            effects: { type: 'troop_reduce', minMag: 0.30, maxMag: 0.50, targets: 'random_territory' }
        },
        {
            type: 'trade_caravan',
            title: 'Trade Caravan Arrives!',
            desc: 'Wealthy merchants pass through your lands bearing gifts.',
            icon: '\u{1F4E6}',
            color: '#DAA520',
            effects: { type: 'bonus_coins', minMag: 10, maxMag: 20, targets: 'player' }
        },
        {
            type: 'rebellion',
            title: 'Rebellion Erupts!',
            desc: 'Discontent soldiers desert their posts in droves.',
            icon: '\u{1F525}',
            color: '#E65100',
            effects: { type: 'troop_reduce', minMag: 0.20, maxMag: 0.40, targets: 'random_territory' }
        },
        {
            type: 'bounty_harvest',
            title: 'Bountiful Harvest!',
            desc: 'The gods bless your lands with a rich harvest and new recruits.',
            icon: '\u{1F33E}',
            color: '#2E7D32',
            effects: { type: 'troop_bonus_all', magnitude: 1, targets: 'player_territories' }
        },
        {
            type: 'storm',
            title: 'Terrible Storm!',
            desc: 'A violent storm batters a territory, scattering troops.',
            icon: '\u{26C8}',
            color: '#757575',
            effects: { type: 'troop_reduce', minMag: 0.15, maxMag: 0.25, targets: 'random_territory' }
        },
        {
            type: 'alliance',
            title: 'Alliance Formed!',
            desc: 'Two rival empires have forged a temporary truce.',
            icon: '\u{1F91D}',
            color: '#1565C0',
            effects: { type: 'ai_alliance', duration: 2, targets: 'ai_empires' }
        },
        {
            type: 'earthquake',
            title: 'Earthquake!',
            desc: 'The ground shakes violently, crumbling fortifications.',
            icon: '\u{26F0}',
            color: '#795548',
            effects: { type: 'fort_destroy', targets: 'random_fortified' }
        },
        {
            type: 'golden_age',
            title: 'Golden Age!',
            desc: 'Your empire enters a golden age of prosperity!',
            icon: '\u{1F451}',
            color: '#FFD700',
            effects: { type: 'double_income', targets: 'player' }
        }
    ];

    _triggerEvent() {
        // Decrement cooldown
        this.eventCooldown--;
        if (this.eventCooldown > 0) return;

        // 35% chance to fire
        if (Math.random() > 0.35) {
            this.eventCooldown = 1; // try again next turn
            return;
        }

        // Pick a random event
        const template = Game.EVENT_TYPES[Math.floor(Math.random() * Game.EVENT_TYPES.length)];

        // Create the active event with display timer
        const evt = {
            type: template.type,
            title: template.title,
            desc: template.desc,
            icon: template.icon,
            color: template.color,
            effects: { ...template.effects },
            timer: 180, // 3 seconds at 60fps
            duration: template.effects.duration || 0
        };

        // Apply effects
        this._applyEventEffects(evt);

        // Set as active event
        this.event = evt;

        // Set cooldown to 3-5 turns
        this.eventCooldown = 3 + Math.floor(Math.random() * 3);

        // Add to history
        this.eventHistory.push({ type: evt.type, turn: this.turn, title: evt.title });

        this._log(`\u26A1 EVENT: ${evt.title}`);
    }

    _applyEventEffects(evt) {
        const eff = evt.effects;

        switch (eff.type) {
            case 'troop_reduce': {
                // Pick a random territory owned by any alive empire
                const candidates = [];
                for (const tid of Object.keys(this.ts)) {
                    const s = this.ts[parseInt(tid)];
                    if (s.owner && s.troops > 1 && this.empires[s.owner]?.alive) {
                        candidates.push(parseInt(tid));
                    }
                }
                if (candidates.length === 0) return;
                const tid = candidates[Math.floor(Math.random() * candidates.length)];
                const s = this.ts[tid];
                const mag = eff.minMag + Math.random() * (eff.maxMag - eff.minMag);
                const lost = Math.max(1, Math.floor(s.troops * mag));
                s.troops = Math.max(1, s.troops - lost);
                const ownerName = this.empires[s.owner]?.name || (this.empires[s.owner] ? E(s.owner)?.name : 'Neutral');
                evt.desc = `${ownerName}'s ${(this._activeTerritories?.[tid] || T(tid))?.name || 'Territory'} lost ${lost} troops!`;
                break;
            }
            case 'bonus_coins': {
                const bonus = eff.minMag + Math.floor(Math.random() * (eff.maxMag - eff.minMag + 1));
                this.empires[this.player].coins += bonus;
                this.stats.coinsEarned += bonus;
                evt.desc = `Your treasury gains ${bonus} bonus coins!`;
                break;
            }
            case 'troop_bonus_all': {
                let count = 0;
                for (const tid of this.empires[this.player].tids) {
                    this.ts[tid].troops += eff.magnitude;
                    count++;
                }
                if (count > 0) evt.desc = `All ${count} of your territories gained +${eff.magnitude} troop!`;
                break;
            }
            case 'fort_destroy': {
                // Pick a random territory with fortification > 0
                const candidates = [];
                for (const tid of Object.keys(this.ts)) {
                    const s = this.ts[parseInt(tid)];
                    if (s.fort > 0) candidates.push(parseInt(tid));
                }
                if (candidates.length === 0) return;
                const tid = candidates[Math.floor(Math.random() * candidates.length)];
                const s = this.ts[tid];
                const ownerName = s.owner ? (this.empires[s.owner]?.name || E(s.owner).name) : 'Neutral';
                evt.desc = `${ownerName}'s ${(this._activeTerritories?.[tid] || T(tid))?.name || 'Territory'} fortifications crumbled!`;
                s.fort = 0;
                break;
            }
            case 'double_income': {
                this.goldenAge = true;
                evt.desc = 'Your empire will earn double income this turn!';
                break;
            }
            case 'ai_alliance': {
                // Pick two random alive AI empires
                const aiEmpires = EIDS.filter(id => id !== this.player && this.empires[id]?.alive);
                if (aiEmpires.length < 2) return;
                // Shuffle and pick first two
                for (let i = aiEmpires.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [aiEmpires[i], aiEmpires[j]] = [aiEmpires[j], aiEmpires[i]];
                }
                const e1 = aiEmpires[0], e2 = aiEmpires[1];
                // Store alliance on empires
                if (!this.empires[e1].alliances) this.empires[e1].alliances = {};
                if (!this.empires[e2].alliances) this.empires[e2].alliances = {};
                this.empires[e1].alliances[e2] = eff.duration;
                this.empires[e2].alliances[e1] = eff.duration;
                evt.desc = `${this.empires[e1]?.name || (this.empires[e1] ? E(e1)?.name : '?')} and ${this.empires[e2]?.name || (this.empires[e2] ? E(e2)?.name : '?')} have formed a temporary truce!`;
                break;
            }
        }
    }
}
