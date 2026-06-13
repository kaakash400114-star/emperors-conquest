/**
 * social.js — Social & Multiplayer Systems for Emperor's Conquest
 * Alliances, diplomacy, spectate mode, ranked seasons, achievements.
 */

// ── Alliance types ──
export const ALLIANCE_TYPES = {
  none:       { name: 'None',           icon: '',    color: null,    tradeMod: 0,   defMod: 0, atkMod: 0 },
  pact:       { name: 'Non-Aggression',  icon: '🕊️', color: '#90EE90', tradeMod: 0, defMod: 0, atkMod: 0, desc: 'Cannot attack each other' },
  trade:      { name: 'Trade Alliance',  icon: '🤝', color: '#FFD700', tradeMod: 1.5, defMod: 0, atkMod: 0, desc: '+50% trade income' },
  military:   { name: 'Military Pact',  icon: '⚔️', color: '#FF4444', tradeMod: 0.5, defMod: 1, atkMod: 1, desc: '+1 atk/def, fight together' },
  full:       { name: 'Full Alliance',  icon: '🛡️', color: '#4169E1', tradeMod: 2, defMod: 2, atkMod: 1, desc: 'Max cooperation' },
};

export const ALLIANCE_KEYS = Object.keys(ALLIANCE_TYPES);

// ── Diplomacy actions ──
export const DIPLOMACY = {
  propose_alliance:  { name: 'Propose Alliance',  icon: '🤝', cost: 10, minTurn: 3 },
  declare_war:       { name: 'Declare War',       icon: '⚔️', cost: 0, minTurn: 0 },
  demand_tribute:    { name: 'Demand Tribute',    icon: '💰', cost: 5, minTurn: 5 },
  send_aid:          { name: 'Send Aid',           icon: '🎁', cost: 20, minTurn: 2 },
  threaten:         { name: 'Threaten',           icon: '😤', cost: 0, minTurn: 4 },
  spy:               { name: 'Spy Operation',     icon: '🕵️', cost: 15, minTurn: 3 },
  sabotage:          { name: 'Sabotage',          icon: '💣', cost: 25, minTurn: 6 },
  negotiate_peace:    { name: 'Negotiate Peace',   icon: '🕊️', cost: 10, minTurn: 5 },
  form_coalition:    { name: 'Form Coalition',    icon: '🏛️', cost: 30, minTurn: 8 },
};

export const DIPLOMACY_KEYS = Object.keys(DIPLOMACY);

// ── AI personality types for diplomacy ──
export const AI_PERSONALITIES = {
  aggressive:  { name: 'Aggressive',  icon: '😡', warChance: 0.4, allianceChance: 0.1, tributeAccept: 0.2 },
  defensive:   { name: 'Defensive',   icon: '🛡️', warChance: 0.1, allianceChance: 0.4, tributeAccept: 0.6 },
  diplomatic:  { name: 'Diplomatic',  icon: '🤝', warChance: 0.15, allianceChance: 0.6, tributeAccept: 0.8 },
  treacherous: { name: 'Treacherous', icon: '🐍', warChance: 0.3, allianceChance: 0.3, tributeAccept: 0.4 },
  isolationist:{ name: 'Isolationist',icon: '🏝️', warChance: 0.05, allianceChance: 0.1, tributeAccept: 0.3 },
  trader:      { name: 'Trader',      icon: '💰', warChance: 0.1, allianceChance: 0.5, tributeAccept: 0.7 },
};

export const PERSONALITY_KEYS = Object.keys(AI_PERSONALITIES);

// ── Spectate mode ──
export const SPECTATE_MODES = {
  free:      { name: 'Free Camera',   icon: '🎥', desc: 'Pan and zoom freely' },
  follow:    { name: 'Follow Empire',  icon: '👁️', desc: 'Watch a specific empire' },
  battle:    { name: 'Battle Watch',   icon: '⚔️', desc: 'Auto-follow active battles' },
  replay:    { name: 'Replay',         icon: '⏪', desc: 'Watch previous turns' },
};

// ── Ranked season system ──
export const RANK_TIERS = [
  { name: 'Bronze',      icon: '🥉', minElo: 0,    maxElo: 999 },
  { name: 'Silver',      icon: '🥈', minElo: 1000, maxElo: 1499 },
  { name: 'Gold',        icon: '🥇', minElo: 1500, maxElo: 1999 },
  { name: 'Platinum',    icon: '💎', minElo: 2000, maxElo: 2499 },
  { name: 'Diamond',     icon: '💠', minElo: 2500, maxElo: 2999 },
  { name: 'Master',      icon: '🏆', minElo: 3000, maxElo: 3499 },
  { name: 'Grandmaster', icon: '👑', minElo: 3500, maxElo: 99999 },
];

export function getRank(elo) {
  for (const tier of [...RANK_TIERS].reverse()) {
    if (elo >= tier.minElo) return tier;
  }
  return RANK_TIERS[0];
}

export function calcEloChange(winnerElo, loserElo, k = 32) {
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  return Math.round(k * (1 - expected));
}

// ── Season rewards ──
export const SEASON_REWARDS = {
  bronze:    { coins: 50,  unlocks: [] },
  silver:    { coins: 100, unlocks: ['custom_flags'] },
  gold:      { coins: 200, unlocks: ['custom_colors', 'hero_tier2'] },
  platinum:  { coins: 500, unlocks: ['blueprint_castle', 'formation_phalanx'] },
  diamond:   { coins: 1000, unlocks: ['hero_tier3', 'siege_trebuchet'] },
  master:    { coins: 2000, unlocks: ['all_blueprints', 'formation_ambush'] },
  grandmaster:{ coins: 5000, unlocks: ['exclusive_hero', 'all_content'] },
};

// ── Achievements ──
export const ACHIEVEMENTS = {
  first_conquest:    { name: 'First Blood',        icon: '🗡️', desc: 'Conquer your first territory', reward: { coins: 10 } },
  warlord:            { name: 'Rising Warlord',      icon: '⚔️', desc: 'Own 5 territories', reward: { coins: 30 } },
  emperor:            { name: 'Emperor',             icon: '👑', desc: 'Own 10 territories', reward: { coins: 100 } },
  conqueror:          { name: 'World Conqueror',    icon: '🌍', desc: 'Own all 25 territories', reward: { coins: 500 } },
  diplomat:           { name: 'Master Diplomat',     icon: '🤝', desc: 'Form 3 alliances', reward: { coins: 50 } },
  builder:            { name: 'Master Builder',      icon: '🏗️', desc: 'Build 10 structures', reward: { coins: 40 } },
  scientist:          { name: 'Enlightened',         icon: '🔬', desc: 'Research 10 technologies', reward: { coins: 60 } },
  siege_master:        { name: 'Siege Master',       icon: '💣', desc: 'Win 5 sieges', reward: { coins: 80 } },
  survivor:           { name: 'Survivor',            icon: '💪', desc: 'Survive 50 turns', reward: { coins: 100 } },
  rich:               { name: 'Wealthy Empire',     icon: '💰', desc: 'Accumulate 500 coins', reward: { coins: 50 } },
  rapid_expansion:    { name: 'Blitzkrieg',          icon: '⚡', desc: 'Conquer 3 territories in 1 turn', reward: { coins: 75 } },
  defender:           { name: 'Iron Defense',        icon: '🛡️', desc: 'Defend 5 attacks', reward: { coins: 60 } },
  technology_leader:  { name: 'Tech Leader',          icon: '🔬', desc: 'Reach Industrial Age', reward: { coins: 150 } },
  resource_baron:     { name: 'Resource Baron',       icon: '💎', desc: 'Stockpile 100 of any resource', reward: { coins: 70 } },
  hero_legend:        { name: 'Hero Legend',          icon: '⭐', desc: 'Recruit 3 heroes', reward: { coins: 100 } },
};

export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENTS);

// ── Chat / communication ──
export const CHAT_CHANNELS = {
  global:    { name: 'Global',  icon: '🌍', desc: 'Talk to all players' },
  alliance:  { name: 'Alliance',icon: '🤝', desc: 'Talk to allies only' },
  private:   { name: 'Private', icon: '💬', desc: 'Direct message' },
  trade:     { name: 'Trade',   icon: '💰', desc: 'Propose trades' },
  taunt:     { name: 'Taunt',   icon: '😤', desc: 'Taunt enemies' },
};
