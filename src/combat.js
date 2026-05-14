import { T, E, adj, STRATEGIES } from './map.js';

function roll(n) {
    const r = [];
    for (let i = 0; i < n; i++) r.push(Math.floor(Math.random() * 6) + 1);
    return r.sort((a, b) => b - a);
}

export function resolveCombat(atkTroops, defTroops, atkEmpire, defEmpire, defTerritory, strategy, atkWeapon, defWeapon, fortBonus=0) {
    let atkBonus = 0, defBonus = defTerritory.def + fortBonus;
    const str = strategy || STRATEGIES[0];

    // Empire bonuses
    if (atkEmpire) {
        if (atkEmpire.bonusType === 'attack') atkBonus += 1;
        if (atkEmpire.bonusType === 'plains' && defTerritory.terrain === 'plains') atkBonus += 2;
    }
    if (defEmpire) {
        if (defEmpire.bonusType === 'defense') defBonus += 1;
        if (defEmpire.bonusType === 'fortress' && defTerritory.terrain === 'mountains') defBonus += 1;
        if (defEmpire.bonusType === 'island' && (defTerritory.terrain === 'island')) defBonus += 2;
    }

    // Strategy modifiers
    atkBonus += (str.atkMod || 0);
    defBonus += (str.defMod || 0);
    if (str.ignoreDef) defBonus = 0;

    // Weapon bonuses
    if (atkWeapon) atkBonus += atkWeapon.atk;
    if (defWeapon) defBonus += defWeapon.def;

    const atkDice = Math.min(atkTroops, 3);
    const defDice = Math.min(defTroops, 2);
    const atkRolls = roll(atkDice);
    const defRolls = roll(defDice);

    let atkLoss = 0, defLoss = 0;
    const rounds = Math.min(atkDice, defDice);
    const details = [];

    for (let i = 0; i < rounds; i++) {
        const a = atkRolls[i] + atkBonus;
        const d = defRolls[i] + defBonus;
        if (a > d) {
            defLoss++;
            details.push({ atk: atkRolls[i], def: defRolls[i], a, d, winner: 'atk' });
        } else {
            atkLoss++;
            details.push({ atk: atkRolls[i], def: defRolls[i], a, d, winner: 'def' });
        }
    }

    const conquered = (defTroops - defLoss) <= 0;
    const coins = defLoss * 5 + (conquered ? 20 : 0);

    return {
        atkRolls, defRolls, atkBonus, defBonus, atkLoss, defLoss,
        details, conquered,
        atkLeft: Math.max(1, atkTroops - atkLoss),
        defLeft: Math.max(0, defTroops - defLoss),
        coins,
        strategy: str.name,
        atkWeapon: atkWeapon ? atkWeapon.name : 'Sword',
        defWeapon: defWeapon ? defWeapon.name : 'Sword',
    };
}
