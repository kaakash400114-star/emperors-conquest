import { T, E, adj, STRATEGIES } from './map.js';

/**
 * Roll n d6 dice, return sorted descending.
 */
function roll(n) {
    const r = [];
    for (let i = 0; i < n; i++) r.push(Math.floor(Math.random() * 6) + 1);
    return r.sort((a, b) => b - a);
}

/**
 * Resolve a combat engagement between attacker and defender.
 *
 * Key balance changes vs original:
 *  - Weapon bonuses are DIMINISHING: effective_bonus = base / (1 + base * 0.15)
 *    This prevents high-tier weapons from making combat trivially one-sided.
 *  - Total bonuses (empire + strategy + weapon) are CAPPED at +4 for each side.
 *  - Critical hits: rolling a natural 6 on any die gives +2 bonus to that die.
 *  - Siege strategy now ignores terrain defense AND halves fort bonus instead
 *    of zeroing all defense.
 *
 * @returns {Object} Combat result with rolls, losses, conquered flag, coins, etc.
 */
export function resolveCombat(atkTroops, defTroops, atkEmpire, defEmpire, defTerritory, strategy, atkWeapon, defWeapon, fortBonus = 0) {
    let atkBonus = 0, defBonus = defTerritory.def + fortBonus;
    const str = strategy || STRATEGIES[0];

    // ── Empire bonuses ──
    if (atkEmpire) {
        if (atkEmpire.bonusType === 'attack') atkBonus += 1;
        if (atkEmpire.bonusType === 'plains' && defTerritory.terrain === 'plains') atkBonus += 2;
    }
    if (defEmpire) {
        if (defEmpire.bonusType === 'defense') defBonus += 1;
        if (defEmpire.bonusType === 'fortress' && defTerritory.terrain === 'mountains') defBonus += 1;
        if (defEmpire.bonusType === 'island' && defTerritory.terrain === 'island') defBonus += 2;
    }

    // ── Strategy modifiers ──
    atkBonus += (str.atkMod || 0);
    defBonus += (str.defMod || 0);

    // ── Weapon bonuses (with diminishing returns) ──
    // effective = raw / (1 + raw * 0.15) — soft cap prevents weapons from dominating
    function effectiveBonus(raw) {
        if (!raw || raw <= 0) return 0;
        return raw / (1 + raw * 0.15);
    }

    // ── Siege: ignore terrain defense, halve fort bonus, keep empire/weapon/strategy bonuses ──
    if (str.ignoreDef) {
        // Strip terrain defense from defBonus, keep empire + strategy bonuses
        defBonus = defBonus - defTerritory.def + Math.floor(fortBonus * 0.5);
        if (defWeapon) defBonus += effectiveBonus(defWeapon.def);
        if (atkWeapon) atkBonus += effectiveBonus(atkWeapon.atk);
    } else {
        if (atkWeapon) atkBonus += effectiveBonus(atkWeapon.atk);
        if (defWeapon) defBonus += effectiveBonus(defWeapon.def);
    }

    // ── Cap total bonuses at +4 per side ──
    atkBonus = Math.min(atkBonus, 4);
    defBonus = Math.min(defBonus, 4);

    // ── Roll dice ──
    const atkDice = Math.min(atkTroops, 3);
    const defDice = Math.min(defTroops, 2);
    const atkRolls = roll(atkDice);
    const defRolls = roll(defDice);

    let atkLoss = 0, defLoss = 0;
    const rounds = Math.min(atkDice, defDice);
    const details = [];

    for (let i = 0; i < rounds; i++) {
        let aRaw = atkRolls[i];
        let dRaw = defRolls[i];

        // Critical hit: natural 6 gives +2
        const atkCrit = aRaw === 6;
        const defCrit = dRaw === 6;

        const a = aRaw + Math.floor(atkBonus) + (atkCrit ? 2 : 0);
        const d = dRaw + Math.floor(defBonus) + (defCrit ? 2 : 0);

        if (a > d) {
            defLoss++;
            details.push({ atk: aRaw, def: dRaw, a, d, winner: 'atk', atkCrit, defCrit });
        } else {
            atkLoss++;
            details.push({ atk: aRaw, def: dRaw, a, d, winner: 'def', atkCrit, defCrit });
        }
    }

    const conquered = (defTroops - defLoss) <= 0;
    const coins = defLoss * 5 + (conquered ? 20 : 0);

    return {
        atkRolls, defRolls, atkBonus: Math.floor(atkBonus), defBonus: Math.floor(defBonus),
        atkLoss, defLoss, details, conquered,
        atkLeft: Math.max(1, atkTroops - atkLoss),
        defLeft: Math.max(0, defTroops - defLoss),
        coins,
        strategy: str.name,
        atkWeapon: atkWeapon ? atkWeapon.name : 'Sword',
        defWeapon: defWeapon ? defWeapon.name : 'Sword',
    };
}
