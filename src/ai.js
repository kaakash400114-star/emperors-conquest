/**
 * ai.js — AI Opponent
 *
 * The AI controls rival empires. It makes the same decisions a human
 * player would: recruit troops, move armies to the front lines, and
 * attack when it has an advantage.
 *
 * AI Strategy (priority order):
 *   1. Recruit troops on border territories (front lines need strength)
 *   2. Move interior troops toward borders
 *   3. Attack weak neighbors (when we have 2+ troop advantage)
 *   4. Recruit on any remaining territories if gold remains
 *
 * The AI isn't perfect — it doesn't plan multiple turns ahead or
 * form alliances. But it's aggressive enough to be a real threat.
 * This is deliberate: an unbeatable AI isn't fun.
 */

import { getTerritory, areAdjacent } from './map.js';
import { resolveCombat } from './combat.js';

export class AI {
    constructor(game, empireId) {
        this.game = game;
        this.empireId = empireId;
    }

    /** Execute one full AI turn. Returns array of action descriptions. */
    takeTurn() {
        const actions = [];
        const empire = this.game.empires[this.empireId];
        if (!empire || !empire.alive) return actions;

        const myTerritories = empire.territoryIds;
        if (myTerritories.length === 0) return actions;

        // 1. Identify border territories (adjacent to non-owned territory)
        const borders = myTerritories.filter(id =>
            getTerritory(id).adj.some(adj => this.game.tStates[adj].owner !== this.empireId)
        );

        const interior = myTerritories.filter(id => !borders.includes(id));

        // 2. Recruit on borders first
        const recruitCost = this.empireId === 'egypt' ? 9 : 12;
        for (const tId of borders) {
            while (empire.gold >= recruitCost) {
                this.game.tStates[tId].troops++;
                empire.gold -= recruitCost;
                actions.push({ type: 'recruit', territory: tId, empire: this.empireId });
            }
        }

        // 3. Move interior troops to borders
        for (const tId of interior) {
            const troops = this.game.tStates[tId].troops;
            if (troops <= 1) continue; // Leave at least 1

            // Find closest border territory to reinforce
            let bestBorder = null;
            let bestDist = Infinity;
            for (const bId of borders) {
                if (areAdjacent(tId, bId)) {
                    bestBorder = bId;
                    bestDist = 0;
                    break;
                }
            }

            if (bestBorder !== null) {
                const moveCount = troops - 1; // Leave 1 behind
                this.game.tStates[tId].troops = 1;
                this.game.tStates[bestBorder].troops += moveCount;
                actions.push({ type: 'move', from: tId, to: bestBorder, troops: moveCount, empire: this.empireId });
            }
        }

        // 4. Recruit on interior with remaining gold
        for (const tId of interior) {
            while (empire.gold >= recruitCost) {
                this.game.tStates[tId].troops++;
                empire.gold -= recruitCost;
                actions.push({ type: 'recruit', territory: tId, empire: this.empireId });
            }
        }

        // 5. Attack weak neighbors
        const attackTargets = [];
        for (const tId of borders) {
            const myTroops = this.game.tStates[tId].troops;
            if (myTroops <= 2) continue; // Need at least 3 to attack (leave 1)

            for (const adjId of getTerritory(tId).adj) {
                const enemyTroops = this.game.tStates[adjId].troops;
                if (this.game.tStates[adjId].owner === this.empireId) continue;
                if (myTroops > enemyTroops + 1) { // Need clear advantage
                    attackTargets.push({ from: tId, to: adjId, advantage: myTroops - enemyTroops });
                }
            }
        }

        // Sort by advantage (attack weakest first)
        attackTargets.sort((a, b) => b.advantage - a.advantage);

        // Execute top attacks (limit to prevent runaway snowballing)
        const maxAttacks = Math.min(2, attackTargets.length);
        for (let i = 0; i < maxAttacks; i++) {
            const atk = attackTargets[i];
            const srcState = this.game.tStates[atk.from];
            const dstState = this.game.tStates[atk.to];

            if (srcState.troops <= 1) continue; // Re-check after previous attacks

            const atkEmpire = this.game.getEmpireData(this.empireId);
            const defEmpireId = dstState.owner;
            const defEmpire = defEmpireId ? this.game.getEmpireData(defEmpireId) : null;

            const result = resolveCombat(
                srcState.troops, dstState.troops,
                atkEmpire, defEmpire, getTerritory(atk.to)
            );

            actions.push({
                type: 'attack',
                from: atk.from,
                to: atk.to,
                result,
                empire: this.empireId,
            });

            // Apply result
            srcState.troops = result.attackerSurvivors;
            if (result.conquered) {
                // Conquer territory
                if (defEmpireId && this.game.empires[defEmpireId]) {
                    this.game.empires[defEmpireId].removeTerritory(atk.to);
                }
                dstState.owner = this.empireId;
                dstState.troops = result.attackerSurvivors;
                srcState.troops = 1; // Left 1 behind
                empire.addTerritory(atk.to);

                // Check if defender eliminated
                if (defEmpireId && this.game.empires[defEmpireId] &&
                    this.game.empires[defEmpireId].territoryIds.length === 0) {
                    this.game.empires[defEmpireId].alive = false;
                    actions.push({ type: 'eliminated', empire: defEmpireId, by: this.empireId });
                    empire.gold += 20; // Conquest bonus
                }
            }
        }

        return actions;
    }
}
