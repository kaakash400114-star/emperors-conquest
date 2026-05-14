import { T, E, adj, WEAPONS, STRATEGIES } from './map.js';
import { resolveCombat } from './combat.js';

export class AI {
    constructor(game, eid) {
        this.g = game; this.eid = eid;
    }

    takeTurn() {
        const actions = [];
        const emp = this.g.empires[this.eid];
        if (!emp || !emp.alive) return actions;
        const my = emp.tids;
        if (!my.length) return actions;

        const borders = my.filter(id => T(id).adj.some(a => this.g.ts[a]?.owner !== this.eid));
        const interior = my.filter(id => !borders.includes(id));

        // Recruit — spread across borders
        const cost = this.eid === 'russia' ? 5 : 10;
        let bi = 0;
        while (emp.coins >= cost && borders.length) {
            const t = borders[bi % borders.length];
            this.g.ts[t].troops++; emp.coins -= cost;
            actions.push({ type: 'recruit', empire: this.eid, territory: t });
            bi++;
        }

        // Move interior to borders
        for (const t of interior) {
            const tr = this.g.ts[t].troops;
            if (tr <= 1) continue;
            const adjBorder = borders.find(b => adj(t, b));
            if (adjBorder != null) {
                const mv = tr - 1;
                this.g.ts[t].troops = 1;
                this.g.ts[adjBorder].troops += mv;
                actions.push({ type: 'move', empire: this.eid, from: t, to: adjBorder, troops: mv });
            }
        }

        // Upgrade weapons if possible
        for (const tier of [2, 3, 4]) {
            const costs = { 2: 25, 3: 50, 4: 80 };
            if (emp.coins >= costs[tier] && !emp.weapons.has(tier)) {
                emp.coins -= costs[tier]; emp.weapons.add(tier);
            }
        }

        // Equip best weapon on borders — smart weapon selection
        // Pick best ATK weapon and best balanced weapon from available tiers
        let bestAtkWeapon = null;
        let bestBalancedWeapon = null;
        for (const tier of [4, 3, 2]) {
            if (!emp.weapons.has(tier)) continue;
            for (const w of WEAPONS[tier]) {
                // Track highest raw ATK weapon
                if (!bestAtkWeapon || w.atk > bestAtkWeapon.atk) {
                    bestAtkWeapon = w;
                }
                // Track best balanced weapon (high atk + def combined, with some def)
                if (!bestBalancedWeapon || (w.atk + w.def) > (bestBalancedWeapon.atk + bestBalancedWeapon.def)) {
                    bestBalancedWeapon = w;
                }
            }
        }

        for (const t of borders) {
            // Check if this border territory faces an enemy with fort
            const facingFort = T(t).adj.some(a => {
                const es = this.g.ts[a];
                return es && es.owner !== this.eid && es.fort > 0;
            });

            if (facingFort && bestAtkWeapon) {
                // Facing fortified enemy — equip highest ATK weapon for siege
                this.g.ts[t].weapon = bestAtkWeapon;
            } else if (bestBalancedWeapon) {
                // Default — equip best balanced weapon
                this.g.ts[t].weapon = bestBalancedWeapon;
            } else {
                // Fallback: equip highest available tier weapon
                for (const tier of [4, 3, 2]) {
                    if (emp.weapons.has(tier)) {
                        this.g.ts[t].weapon = WEAPONS[tier][0];
                        break;
                    }
                }
            }
        }

        // Fortify border territories
        if (emp.coins >= 15) {
            for (const t of borders) {
                if (emp.coins < 15) break;
                if (this.g.ts[t].fort < 4) {  // cap at +8 total fort
                    this.g.ts[t].fort += 2;
                    emp.coins -= 15;
                    actions.push({ type: 'fortify', empire: this.eid, territory: t });
                }
            }
        }

        // Attack — gather targets
        const targets = [];
        for (const t of borders) {
            const tr = this.g.ts[t].troops;
            if (tr <= 2) continue;
            for (const a of T(t).adj) {
                const es = this.g.ts[a];
                if (!es || es.owner === this.eid) continue;
                if (tr > es.troops + 1) targets.push({ from: t, to: a, adv: tr - es.troops });
            }
        }
        targets.sort((a, b) => b.adv - a.adv);

        // Execute attacks (up to 3 per turn for more aggression)
        for (let i = 0; i < Math.min(3, targets.length); i++) {
            const { from, to, adv } = targets[i];
            const src = this.g.ts[from], dst = this.g.ts[to];
            if (src.troops <= 1) continue;

            // Choose strategy based on situation
            const strategy = this.pickStrategy(from, to, adv);

            const res = resolveCombat(src.troops, dst.troops, E(this.eid),
                dst.owner ? E(dst.owner) : null, T(to), strategy, src.weapon, dst.weapon, dst.fort);

            actions.push({ type: 'attack', empire: this.eid, from, to, result: res, strategy: strategy.id });

            src.troops = res.atkLeft;
            emp.coins += res.coins;

            if (res.conquered) {
                if (dst.owner && this.g.empires[dst.owner]) {
                    this.g.empires[dst.owner].tids = this.g.empires[dst.owner].tids.filter(t => t !== to);
                    if (this.g.empires[dst.owner].tids.length === 0) {
                        this.g.empires[dst.owner].alive = false;
                        emp.coins += 30;
                        actions.push({ type: 'eliminated', empire: dst.owner, by: this.eid });
                    }
                }
                dst.owner = this.eid; dst.troops = res.atkLeft; src.troops = 1;
                emp.tids.push(to);
            } else {
                dst.troops = res.defLeft;
            }
        }

        return actions;
    }

    /**
     * Pick the best combat strategy for a given attack situation.
     * @param {number} from - Source territory id
     * @param {number} to   - Target territory id
     * @param {number} adv  - Troop advantage (attacker - defender)
     * @returns strategy object from STRATEGIES array
     */
    pickStrategy(from, to, adv) {
        const dst = this.g.ts[to];
        const srcTerrain = T(from).terrain;

        // Target has fortification — use Siege to ignore defense
        if (dst.fort > 0) {
            return STRATEGIES[1]; // siege
        }

        // Attacking from forest or mountains — use Ambush for +2 attack
        if (srcTerrain && STRATEGIES[3].needTerrain.includes(srcTerrain)) {
            return STRATEGIES[3]; // ambush
        }

        // Significant troop advantage — use Raid for fewer losses on win
        if (adv > 3) {
            return STRATEGIES[2]; // raid
        }

        // Default: Full Assault
        return STRATEGIES[0]; // assault
    }
}
