/**
 * persistence.js — Persistent Progression for Emperor's Conquest
 * Cross-game unlocks, XP system, achievements storage, cosmetic rewards.
 * Data saved to localStorage.
 */

const STORAGE_KEY = 'emperors_conquest_progress';

// ── XP & Level system ──
export const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3800,
  4700, 5700, 6800, 8000, 9500, 11000, 13000, 15000, 17500, 20000,
  25000, 30000, 40000, 50000, 75000, 100000,
];

export function getLevel(xp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function xpForNextLevel(xp) {
  const lvl = getLevel(xp);
  const current = LEVEL_THRESHOLDS[lvl - 1] || 0;
  const next = LEVEL_THRESHOLDS[lvl] || current + 1000;
  return { current, next, remaining: next - xp, progress: (xp - current) / (next - current) };
}

// ── XP rewards per action ──
export const XP_REWARDS = {
  win_game:         500,
  conquer_territory: 20,
  win_battle:       15,
  lose_battle:       5,
  build_structure:   10,
  research_tech:     25,
  form_alliance:    30,
  survive_turn:      3,
  hero_recruit:      50,
  achievement:       75,
  rank_promotion:   100,
  siege_win:         35,
  trade_deal:        15,
  disaster_survive:  20,
};

// ── Unlockable cosmetics ──
export const UNLOCKABLES = {
  // Flag patterns
  flag_zigzag:    { type: 'flag',   name: 'Zigzag Flag',       icon: 'zech', cost: 500,  level: 3 },
  flag_sunburst:  { type: 'flag',   name: 'Sunburst Flag',     icon: 'sunburst', cost: 500, level: 3 },
  flag_tricolor:  { type: 'flag',   name: 'Tricolor Flag',     icon: 'tricolor', cost: 600, level: 5 },
  flag_crest:     { type: 'flag',   name: 'Crest Flag',        icon: 'crest', cost: 800, level: 7 },

  // Color palettes
  color_neon:      { type: 'color',  name: 'Neon Pack',          icons: ['neon_green','neon_pink','neon_blue'], cost: 1000, level: 5 },
  color_pastel:    { type: 'color',  name: 'Pastel Pack',        icons: ['pastel_pink','pastel_blue','pastel_lavender'], cost: 800, level: 3 },
  color_dark:      { type: 'color',  name: 'Dark Pack',          icons: ['charcoal','midnight_blue','blood_red'], cost: 1200, level: 8 },
  color_precious:  { type: 'color',  name: 'Precious Pack',      icons: ['ruby','sapphire','emerald_g'], cost: 2000, level: 12 },

  // Builder blocks
  block_marble:    { type: 'block',  name: 'Marble Block',       cost: 300, level: 2 },
  block_crystal:   { type: 'block',  name: 'Crystal Block',      cost: 500, level: 4 },
  block_magma:     { type: 'block',  name: 'Magma Block',        cost: 400, level: 3 },
  block_ice:       { type: 'block',  name: 'Ice Block',           cost: 350, level: 3 },
  block_golden:    { type: 'block',  name: 'Golden Block',       cost: 800, level: 6 },

  // Titles
  title_veteran:   { type: 'title', name: 'Veteran',             cost: 200, level: 2 },
  title_conqueror: { type: 'title', name: 'The Conqueror',       cost: 1500, level: 10 },
  title_legend:   { type: 'title', name: 'Legend',              cost: 3000, level: 15 },
  title_immortal: { type: 'title', name: 'The Immortal',        cost: 5000, level: 20 },

  // Special abilities
  ability_double_time: { type: 'ability', name: 'Double Time',     desc: 'Two turns in one', cost: 2000, level: 8, uses: 1 },
  ability_divine_shield:{ type: 'ability', name: 'Divine Shield',   desc: 'Invincible for 1 turn', cost: 3000, level: 12, uses: 1 },
  ability_resource_rush:{ type: 'ability', name: 'Resource Rush',    desc: '+50 all resources', cost: 1500, level: 6, uses: 1 },
  ability_instant_build:{ type: 'ability', name: 'Instant Build',   desc: 'Complete current building', cost: 1000, level: 4, uses: 1 },
};

export const UNLOCK_KEYS = Object.keys(UNLOCKABLES);

// ── Default player profile ──
export function createDefaultProfile() {
  return {
    xp: 0,
    level: 1,
    totalGames: 0,
    wins: 0,
    losses: 0,
    totalConquests: 0,
    totalBattles: 0,
    totalBuildings: 0,
    totalTechResearched: 0,
    totalSiegesWon: 0,
    elo: 1000,
    peakElo: 1000,
    currentSeason: 1,
    seasonHighRank: 'bronze',
    achievements: [],
    unlocks: ['flag_solid', 'flag_stripes_h'], // starting unlocks
    cosmetics: { color: null, flag: null, title: null },
    stats: {
      turnsPlayed: 0,
      favoriteEmpire: null,
      longestGame: 0,
      fastestWin: Infinity,
      mostTerritories: 0,
      mostCoins: 0,
      totalKills: 0,
    },
    history: [], // last 20 game summaries
    settings: {
      autoSave: true,
      notifications: true,
      musicVolume: 0.5,
      sfxVolume: 0.8,
    },
  };
}

// ── Save/Load from localStorage ──
export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function loadProfile() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return { ...createDefaultProfile(), ...JSON.parse(data) };
  } catch {}
  return createDefaultProfile();
}

// ── Add XP and handle level ups ──
export function addXP(profile, amount, action) {
  profile.xp += amount;
  const oldLevel = profile.level;
  profile.level = getLevel(profile.xp);
  const leveledUp = profile.level > oldLevel;

  // Check unlocks at new level
  const newUnlocks = [];
  for (const [key, unlock] of Object.entries(UNLOCKABLES)) {
    if (unlock.level <= profile.level && !profile.unlocks.includes(key)) {
      // Auto-unlock at level threshold
      if (unlock.cost === 0 || unlock.level === profile.level) {
        profile.unlocks.push(key);
        newUnlocks.push(unlock);
      }
    }
  }

  return { leveledUp, newLevel: profile.level, newUnlocks };
}

// ── Purchase unlock ──
export function purchaseUnlock(profile, key) {
  const unlock = UNLOCKABLES[key];
  if (!unlock) return { success: false, reason: 'Not found' };
  if (profile.unlocks.includes(key)) return { success: false, reason: 'Already owned' };
  if (profile.xp < unlock.cost) return { success: false, reason: 'Not enough XP' };
  if (profile.level < unlock.level) return { success: false, reason: 'Level too low' };

  profile.xp -= unlock.cost;
  profile.unlocks.push(key);
  saveProfile(profile);
  return { success: true, unlock };
}

// ── Record game result ──
export function recordGameResult(profile, result) {
  profile.totalGames++;
  if (result.won) {
    profile.wins++;
    addXP(profile, XP_REWARDS.win_game, 'win_game');
  } else {
    profile.losses++;
  }
  profile.totalConquests += result.conquests || 0;
  profile.totalBattles += result.battles || 0;
  profile.totalBuildings += result.buildings || 0;
  profile.totalTechResearched += result.techs || 0;
  profile.totalSiegesWon += result.sieges || 0;
  profile.stats.turnsPlayed += result.turns || 0;
  if (result.territories > profile.stats.mostTerritories) {
    profile.stats.mostTerritories = result.territories;
  }
  if (result.maxCoins > profile.stats.mostCoins) {
    profile.stats.mostCoins = result.maxCoins;
  }
  profile.stats.totalKills += result.kills || 0;
  if (result.turns > profile.stats.longestGame) {
    profile.stats.longestGame = result.turns;
  }
  if (result.won && result.turns < profile.stats.fastestWin) {
    profile.stats.fastestWin = result.turns;
  }

  // ELO update
  if (result.eloChange) {
    profile.elo += result.eloChange;
    if (profile.elo > profile.peakElo) profile.peakElo = profile.elo;
  }

  // History
  profile.history.unshift({
    date: Date.now(),
    empire: result.empire,
    won: result.won,
    turns: result.turns,
    territories: result.territories,
    difficulty: result.difficulty,
  });
  if (profile.history.length > 20) profile.history.pop();

  saveProfile(profile);
  return profile;
}
