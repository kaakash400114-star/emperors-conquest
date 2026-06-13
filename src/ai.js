import { T, E, adj, WEAPONS, STRATEGIES, TERRITORIES } from './map.js';
import { resolveCombat } from './combat.js';

/**
 * AI Controller — Improved intelligence for AI opponents.
 *
 * Key improvements over original:
 * - Better attack priority: prefer weaker enemies, avoid strong ones
 * - Considers weapon advantage and terrain before attacking
 * - Saves coins for weapon upgrades when cost-effective
 * - Doesn't attack if estimated odds are bad
 * - Better troop movement: reinforces threatened borders, retreats when outnumbered
 * - Can execute multiple attack waves per turn
 * - Fortifies strategic chokepoints
 * - Uses spies when affordable
 */
export class AI {
    constructor(game, eid) {
        this.g = game;
        this.eid = eid;
    }

    takeTurn() {
        const actions = [];
        const emp = this.g.empires[this.eid];
        if (!emp || !emp.alive) return actions;
        const my = emp.tids;
        if (!my.length) return actions;

        // ── Threat assessment: is any empire getting too strong? ──
        const playerTids = this.g.empires[this.g.player]?.tids?.length || 0;
        const ourTids = my.length;
        const totalTids = (this.g._activeTerritories || TERRITORIES).length;
        const playerDominant = playerTids > totalTids * 0.4; // Player has >40% of map
        const playerNearWin = playerTids > totalTids * 0.6;  // Player has >60% — emergency!

        const tLookup = (id) => (this.g._activeTerritories?.[id] || T(id));
        const borders = my.filter(id => tLookup(id).adj.some(a => this.g.ts[a]?.owner !== this.eid));
        const interior = my.filter(id => !borders.includes(id));

        // ── 1. Buy spy network if affordable and useful ──
        if (!emp.spy && emp.coins >= 30 && my.length >= 3) {
            emp.coins -= 30;
            emp.spy = true;
            actions.push({ type: 'spy', empire: this.eid });
        }

        // ── 2. Upgrade weapons if cost-effective ──
        // In late game or when player is dominant, be more aggressive with upgrades
        const upgradeReserve = (playerDominant || playerNearWin) ? 0 : 10;
        for (const tier of [2, 3, 4]) {
            const costs = { 2: 25, 3: 50, 4: 80 };
            if (emp.coins >= costs[tier] + upgradeReserve && !emp.weapons.has(tier)) {
                if (borders.length >= 1) {
                    emp.coins -= costs[tier];
                    emp.weapons.add(tier);
                    actions.push({ type: 'weaponUpgrade', empire: this.eid, tier });
                }
            }
        }

        // ── 3. Recruit troops — focus on threatened borders ──
        const cost = this.eid === 'russia' ? 5 : 10;

        // Calculate threat level for each border territory
        const borderThreat = new Map();
        for (const t of borders) {
            let threat = 0;
            for (const a of (this.g._activeTerritories?.[t] || T(t)).adj) {
                const es = this.g.ts[a];
                if (es && es.owner !== this.eid) {
                    // Prioritize threats from dominant player
                    const weight = (es.owner === this.g.player && playerDominant) ? 2.0 : 1.0;
                    threat += es.troops * weight;
                }
            }
            borderThreat.set(t, threat);
        }

        // Sort borders by threat (highest first) and recruit there
        const sortedBorders = [...borders].sort((a, b) => (borderThreat.get(b) || 0) - (borderThreat.get(a) || 0));

        let bi = 0;
        // Reserve some coins for weapons if we don't have tier 2 yet
        const reserveForWeapons = (!emp.weapons.has(2) && !playerDominant) ? 25 : 0;
        if (sortedBorders.length === 0) return actions; // FIX: no borders = no recruitment

        // When player is near winning, spend ALL coins on troops (emergency mode)
        const maxRecruitLoops = playerNearWin ? sortedBorders.length * 4 : sortedBorders.length * 2;
        while (emp.coins >= cost + reserveForWeapons) {
            const t = sortedBorders[bi % sortedBorders.length];
            this.g.ts[t].troops++;
            emp.coins -= cost;
            actions.push({ type: 'recruit', empire: this.eid, territory: t });
            bi++;
            if (bi > maxRecruitLoops) break;
        }

        // ── 4. Move interior troops to front lines ──
        for (const t of interior) {
            const tr = this.g.ts[t].troops;
            if (tr <= 1) continue;

            // Find the most threatened adjacent border
            let bestBorder = null;
            let bestThreat = -1;
            for (const b of borders) {
                if (adj(t, b)) {
                    const threat = borderThreat.get(b) || 0;
                    if (threat > bestThreat) {
                        bestThreat = threat;
                        bestBorder = b;
                    }
                }
            }

            // Strategic retreat: if this territory is isolated and we're being attacked, move out
            if (bestBorder != null) {
                const mv = tr - 1;
                this.g.ts[t].troops = 1;
                this.g.ts[bestBorder].troops += mv;
                actions.push({ type: 'move', empire: this.eid, from: t, to: bestBorder, troops: mv });
            }
        }

        // ── 5. Redistribute troops between borders — reinforce weak ones ──
        if (borders.length > 1) {
            // Find borders with excess troops (more than 1.5x average threat)
            const avgTroops = borders.reduce((s, t) => s + this.g.ts[t].troops, 0) / borders.length;
            const strongBorders = borders.filter(t => this.g.ts[t].troops > avgTroops + 2);
            const weakBorders = borders.filter(t => this.g.ts[t].troops < avgTroops - 1);

            for (const strong of strongBorders) {
                if (weakBorders.length === 0) break;
                const excess = this.g.ts[strong].troops - Math.ceil(avgTroops);
                if (excess <= 1) continue;

                // Find a reachable weak border
                for (const weak of weakBorders) {
                    if (this.g.ts[strong].troops <= 2) break;
                    // Check if there's a path through our territory
                    if (this._canReach(strong, weak)) {
                        const mv = Math.min(excess, this.g.ts[strong].troops - 2);
                        if (mv <= 0) break;
                        this.g.ts[strong].troops -= mv;
                        this.g.ts[weak].troops += mv;
                        actions.push({ type: 'move', empire: this.eid, from: strong, to: weak, troops: mv });
                        break;
                    }
                }
            }
        }

        // ── 6. Equip best weapons on borders ──
        this._equipWeapons(borders, emp);

        // ── 7. Fortify strategic territories ──
        if (emp.coins >= 15) {
            // Prioritize fortifying chokepoints (territories with many enemy adjacencies)
            const fortPriority = borders.map(t => {
                const enemyAdj = (this.g._activeTerritories?.[t] || T(t)).adj.filter(a => this.g.ts[a]?.owner !== this.eid).length;
                return { t, priority: enemyAdj, fort: this.g.ts[t].fort };
            }).sort((a, b) => b.priority - a.priority);

            for (const { t, priority } of fortPriority) {
                if (emp.coins < 15) break;
                if (this.g.ts[t].fort < 6 && priority >= 2) {
                    this.g.ts[t].fort += 2;
                    emp.coins -= 15;
                    actions.push({ type: 'fortify', empire: this.eid, territory: t });
                }
            }
        }

        // ── 8. Attack — evaluate targets carefully ──
        const attackTargets = [];
        for (const t of borders) {
            const tr = this.g.ts[t].troops;
            if (tr <= 2) continue;

            for (const a of (this.g._activeTerritories?.[t] || T(t)).adj) {
                const es = this.g.ts[a];
                if (!es || es.owner === this.eid) continue;

                // Skip attack on allied empire
                if (emp.alliances && emp.alliances[es.owner]) continue;

                // Evaluate attack viability
                const evaluation = this._evaluateAttack(t, a, tr, es.troops);
                if (evaluation.shouldAttack) {
                    attackTargets.push({
                        from: t,
                        to: a,
                        score: evaluation.score,
                        adv: tr - es.troops,
                        strategy: evaluation.strategy,
                    });
                }
            }
        }

        // Sort by score (highest first) — prefer high-value, low-risk targets
        attackTargets.sort((a, b) => b.score - a.score);

        // Execute attacks (up to 4 per turn, more when player is dominant)
        const playerTids2 = this.g.empires[this.g.player]?.tids?.length || 0;
        const playerDominant2 = playerTids2 > (this.g._activeTerritories || TERRITORIES).length * 0.4;
        let attacksExecuted = 0;
        const maxAttacks = playerDominant2 ? 6 : 4;
        for (const target of attackTargets) {
            if (attacksExecuted >= maxAttacks) break;
            const { from, to, strategy } = target;
            const src = this.g.ts[from], dst = this.g.ts[to];

            // Re-check viability (troops may have changed from previous attacks)
            if (src.troops <= 2) continue;

            const eLookup = (id) => (this.g.empires[id] || E(id));
            const res = resolveCombat(
                src.troops, dst.troops,
                eLookup(this.eid),
                dst.owner ? eLookup(dst.owner) : null,
                tLookup(to), strategy,
                src.weapon, dst.weapon, dst.fort
            );

            actions.push({ type: 'attack', empire: this.eid, from, to, result: res, strategy: strategy.id });

            src.troops = res.atkLeft;
            emp.coins += res.coins;

            if (res.conquered) {
                const defEmpColor = dst.owner ? eLookup(dst.owner).color : '#444';
                if (dst.owner && this.g.empires[dst.owner]) {
                    this.g.empires[dst.owner].tids = this.g.empires[dst.owner].tids.filter(t => t !== to);
                    if (this.g.empires[dst.owner].tids.length === 0) {
                        this.g.empires[dst.owner].alive = false;
                        emp.coins += 30;
                        actions.push({ type: 'eliminated', empire: dst.owner, by: this.eid });
                    }
                }
                dst.owner = this.eid;
                dst.troops = res.atkLeft;
                src.troops = 1;
                emp.tids.push(to);
                this.g.renderer.addCaptureAnim(to, (this.g.empires?.[this.eid] || E(this.eid))?.color || '#fff', defEmpColor);
            } else {
                dst.troops = res.defLeft;
            }

            attacksExecuted++;
        }

        return actions;
    }

    /**
     * Evaluate whether an attack is worth attempting.
     * Returns { shouldAttack, score, strategy }
     */
    _evaluateAttack(from, to, atkTroops, defTroops) {
        const src = this.g.ts[from];
        const dst = this.g.ts[to];
        const defEmpire = dst.owner ? this.g.empires[dst.owner] : null;

        // Threat-based threshold adjustment
        const playerTids = this.g.empires[this.g.player]?.tids?.length || 0;
        const totalTids = (this.g._activeTerritories || TERRITORIES).length;
        const playerDominant = playerTids > totalTids * 0.4;
        const attackingPlayer = dst.owner === this.g.player;

        let score = 0;

        // ── Troop advantage check ──
        const troopRatio = atkTroops / Math.max(1, defTroops);
        // Be more aggressive when player is dominant or attacking the dominant player
        let diffThreshold = this.g.difficulty === 'easy' ? 1.8 : (this.g.difficulty === 'hard' ? 1.0 : 1.3);
        if (playerDominant && attackingPlayer) diffThreshold *= 0.7; // 30% more aggressive vs dominant player
        if (troopRatio < diffThreshold) {
            return { shouldAttack: false, score: 0, strategy: STRATEGIES[0] };
        }

        // Higher advantage = better score
        score += (troopRatio - 1) * 10;

        // ── Consider weapon advantage ──
        const myWeaponAtk = src.weapon ? src.weapon.atk : 0;
        const theirWeaponDef = dst.weapon ? dst.weapon.def : 0;

        if (myWeaponAtk > theirWeaponDef + 2) {
            score += 5; // We have significant weapon advantage
        } else if (theirWeaponDef > myWeaponAtk + 2) {
            score -= 8; // They have significant defense advantage
        }

        // ── Consider terrain and fort ──
        const terrainDef = (this.g._activeTerritories?.[to] || T(to)).def || 0;
        const totalDef = terrainDef + dst.fort;

        if (totalDef >= 4) {
            // Heavily defended — only attack with overwhelming force or siege
            if (troopRatio < 2.0) {
                return { shouldAttack: false, score: 0, strategy: STRATEGIES[0] };
            }
            score -= 3;
        }

        // ── Consider empire bonuses ──
        const myEmp = this.g.empires[this.eid] || E(this.eid);
        const theirEmp = dst.owner ? (this.g.empires[dst.owner] || E(dst.owner)) : null;

        // We get attack bonus
        if (myEmp.bonusType === 'attack') score += 3;
        if (myEmp.bonusType === 'plains' && (this.g._activeTerritories?.[to] || T(to)).terrain === 'plains') score += 5;

        // They get defense bonus
        if (theirEmp) {
            if (theirEmp.bonusType === 'defense') score -= 3;
            if (theirEmp.bonusType === 'fortress' && (this.g._activeTerritories?.[to] || T(to)).terrain === 'mountains') score -= 3;
            if (theirEmp.bonusType === 'island' && (this.g._activeTerritories?.[to] || T(to)).terrain === 'island') score -= 4;
        }

        // ── Value of target ──
        // Prefer attacking weak empires (fewer territories)
        if (defEmpire && defEmpire.tids.length <= 2) {
            score += 8; // Almost eliminated — finish them!
        }

        // Coalition behavior: bonus for attacking the dominant player
        if (attackingPlayer && playerDominant) {
            score += 6; // Coordinate against the threat
        }

        // Prefer territories with higher strategic value (more connections)
        const connections = (this.g._activeTerritories?.[to] || T(to)).adj?.length || 0;
        score += connections * 0.5;

        // ── Don't attack if we'd leave our border too thin ──
        if (atkTroops - defTroops < 2 && troopRatio < 2) {
            score -= 5;
        }

        // ── Pick best strategy ──
        const strategy = this._pickStrategy(from, to, troopRatio);

        // Siege penalty for using it
        if (strategy.id === 'siege') score -= 1;

        // Minimum score threshold
        if (score < 3) {
            return { shouldAttack: false, score, strategy };
        }

        return { shouldAttack: true, score, strategy };
    }

    /**
     * Pick the best combat strategy for a given attack situation.
     */
    _pickStrategy(from, to, troopRatio) {
        const dst = this.g.ts[to];
        const srcTerrain = (this.g._activeTerritories?.[from] || T(from)).terrain || 'plains';
        const dstTerrain = (this.g._activeTerritories?.[to] || T(to)).terrain || 'plains';

        // Target has significant fortification — use Siege
        if (dst.fort >= 2) {
            return STRATEGIES[1]; // siege
        }

        // Target has terrain defense — consider siege
        if ((this.g._activeTerritories?.[to] || T(to)).def >= 2 && troopRatio < 2) {
            return STRATEGIES[1]; // siege
        }

        // Attacking from forest or mountains — use Ambush for +2 attack
        if (srcTerrain && STRATEGIES[3].needTerrain && STRATEGIES[3].needTerrain.includes(srcTerrain)) {
            return STRATEGIES[3]; // ambush
        }

        // Significant troop advantage — use Raid for fewer losses on win
        if (troopRatio > 2.5) {
            return STRATEGIES[2]; // raid
        }

        // Close fight — Full Assault is safest
        return STRATEGIES[0]; // assault
    }

    /**
     * Check if we can reach territory B from territory A through our own territory.
     */
    _canReach(from, to) {
        if (adj(from, to)) return true;
        // Simple BFS through our territory
        const visited = new Set([from]);
        const queue = [from];
        while (queue.length > 0) {
            const cur = queue.shift();
            for (const a of (this.g._activeTerritories?.[cur] || T(cur)).adj) {
                if (visited.has(a)) continue;
                if (a === to) return true;
                if (this.g.ts[a]?.owner === this.eid) {
                    visited.add(a);
                    queue.push(a);
                }
            }
        }
        return false;
    }

    /**
     * Equip the best available weapons on border territories.
     */
    _equipWeapons(borders, emp) {
        // Find best weapons from available tiers
        let bestAtkWeapon = null;
        let bestBalancedWeapon = null;
        let bestDefWeapon = null;

        for (const tier of [4, 3, 2, 1]) {
            if (!emp.weapons.has(tier)) continue;
            for (const w of WEAPONS[tier]) {
                if (!bestAtkWeapon || w.atk > bestAtkWeapon.atk) {
                    bestAtkWeapon = w;
                }
                if (!bestBalancedWeapon || (w.atk + w.def) > (bestBalancedWeapon.atk + bestBalancedWeapon.def)) {
                    bestBalancedWeapon = w;
                }
                if (!bestDefWeapon || w.def > bestDefWeapon.def) {
                    bestDefWeapon = w;
                }
            }
        }

        for (const t of borders) {
            const facingEnemy = (this.g._activeTerritories?.[t] || T(t)).adj.filter(a => {
                const es = this.g.ts[a];
                return es && es.owner !== this.eid;
            });

            if (facingEnemy.length === 0) continue;

            // Check if this border faces a fortified enemy
            const facingFort = facingEnemy.some(a => this.g.ts[a].fort > 0);

            // Check if this territory is under threat (outnumbered by neighbors)
            const myTroops = this.g.ts[t].troops;
            const enemyTroops = facingEnemy.reduce((s, a) => s + this.g.ts[a].troops, 0);
            const underThreat = enemyTroops > myTroops;

            if (underThreat && bestDefWeapon) {
                // Under threat — equip defensive weapon
                this.g.ts[t].weapon = bestDefWeapon;
            } else if (facingFort && bestAtkWeapon) {
                // Facing fortified enemy — equip highest ATK weapon
                this.g.ts[t].weapon = bestAtkWeapon;
            } else if (bestBalancedWeapon) {
                // Default — equip best balanced weapon
                this.g.ts[t].weapon = bestBalancedWeapon;
            }
        }
    }
}
