/**
 * combat.js — Battle Resolution
 *
 * Combat is dice-based, inspired by Risk. It's simple to understand
 * but has strategic depth because of terrain bonuses and empire perks.
 *
 * How it works:
 *   Attacker commits troops (must leave 1 behind).
 *   Both sides roll dice — attacker up to 3, defender up to 2.
 *   Dice are sorted descending. Each pair is compared:
 *     Higher roll wins. Ties go to the DEFENDER.
 *   Winner of each comparison: opponent loses 1 troop.
 *
 * Why ties go to defender: In real warfare, the defender has
 * fortifications, high ground, and prepared positions. This
 * creates an asymmetry that rewards strategic thinking — you
 * need a real advantage before attacking.
 */

/**
 * Roll n six-sided dice and return sorted descending.
 */
function rollDice(n) {
    const rolls = [];
    for (let i = 0; i < n; i++) {
        rolls.push(Math.floor(Math.random() * 6) + 1);
    }
    return rolls.sort((a, b) => b - a);
}

/**
 * Resolve a battle between attacker and defender.
 *
 * @param {number} atkTroops - Total troops attacking
 * @param {number} defTroops - Total troops defending
 * @param {object} atkEmpire - Attacker empire data (for bonuses)
 * @param {object} defEmpire - Defender empire data (for bonuses)
 * @param {object} defTerritory - Defender territory data (for terrain)
 * @returns {object} Battle result
 */
export function resolveCombat(atkTroops, defTroops, atkEmpire, defEmpire, defTerritory) {
    // Calculate bonuses
    let atkBonus = 0;
    let defBonus = defTerritory.defBonus; // Terrain defense bonus

    if (atkEmpire && atkEmpire.bonusType === 'attack') atkBonus += 1;
    if (defEmpire && defEmpire.bonusType === 'defense') defBonus += 1;

    // Number of dice each side rolls
    const atkDice = Math.min(atkTroops, 3);  // Attacker: up to 3 dice
    const defDice = Math.min(defTroops, 2);   // Defender: up to 2 dice

    // Roll the dice
    const atkRolls = rollDice(atkDice);
    const defRolls = rollDice(defDice);

    // Compare dice pair by pair
    let atkLosses = 0;
    let defLosses = 0;
    const rounds = Math.min(atkDice, defDice);

    const roundResults = [];
    for (let i = 0; i < rounds; i++) {
        const a = atkRolls[i] + atkBonus;
        const d = defRolls[i] + defBonus;
        if (a > d) {
            defLosses++;
            roundResults.push({ atk: atkRolls[i], def: defRolls[i], atkBonus, defBonus, winner: 'attacker' });
        } else {
            atkLosses++;
            roundResults.push({ atk: atkRolls[i], def: defRolls[i], atkBonus, defBonus, winner: 'defender' });
        }
    }

    const defenderDestroyed = (defTroops - defLosses) <= 0;
    const attackerRetreats = (atkTroops - atkLosses) <= 1; // Must keep 1 troop

    return {
        atkRolls,
        defRolls,
        atkBonus,
        defBonus,
        atkLosses,
        defLosses,
        roundResults,
        attackerSurvivors: atkTroops - atkLosses,
        defenderSurvivors: Math.max(0, defTroops - defLosses),
        conquered: defenderDestroyed,
    };
}
