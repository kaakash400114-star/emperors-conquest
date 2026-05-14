# Emperor's Conquest

A turn-based strategy game spanning 3000 years of history. Choose from 10 legendary empires, recruit armies, forge weapons, fortify territories, and conquer the world.

## How to Play

**Desktop:** Click territories to select, recruit, move, and attack. Click the "How to Play" button on the main menu for an in-game tutorial.

### Turn Flow
1. **Income** — Collect coins from your territories (base 3 + 1 per territory + empire bonus)
2. **Select** — Click one of your territories to select it
3. **Recruit** — Buy Soldiers (+1 troop) or Veterans (+2 troops) with coins
4. **Fortify** — Spend 15 coins for +2 permanent defense on a territory
5. **Move** — Transfer troops between your connected territories (choose how many)
6. **Attack** — Invade enemy territories with dice-based combat
7. **Shop** — Unlock weapon tiers, equip weapons on territories, buy spy network
8. **End Turn** — AI empires take their turns

### Combat
Dice-based battles with strategies and weapon bonuses:
- **Assault** — Standard attack (no modifiers)
- **Siege** — Ignores enemy fortification bonus (-1 attack)
- **Raid** — +1 attack, -1 defense (fewer losses on win)
- **Ambush** — +2 attack (only from forest/mountain terrain)

Attacker rolls up to 3 dice, defender up to 2. Higher die wins each round. Ties favor the defender. Weapon bonuses, empire bonuses, terrain, and fortifications all apply.

### Weapons
- **Tier 1** — Swords (always available)
- **Tier 2** — Medieval (25c): Pikes, Crossbows, Maces
- **Tier 3** — Gunpowder (50c): Muskets, Cannons, Rifles
- **Tier 4** — Modern (80c): Tanks, Artillery, Bombers

Equip weapons on individual territories from the Shop or Attack panel.

### Spy Network
Buy a spy network (30 coins) to reveal enemy troop counts. Without it, enemy territories show "?" instead of numbers.

### Victory
Conquer all 18 territories to win. If you lose all territories, you're defeated.

## Empires

10 empires across 3000 years, each with a unique bonus:

| Empire | Era | Bonus |
|--------|-----|-------|
| Maurya | India 322 BC | +2 coins on desert territories |
| Egypt | Egypt 3100 BC | Recruit troops at -5 coins |
| Rome | Italy 27 BC | +2 coins per territory (income) |
| Mongol | Mongolia 1206 AD | +2 attack on plains |
| Ottoman | Turkey 1299 AD | +1 defense on mountains |
| British | England 1588 AD | +2 coins per territory |
| Napoleon | France 1804 AD | +2 attack on plains |
| Japan | Japan 1868 AD | +2 defense on islands |
| Germany | Germany 1939 AD | +3 coins per territory |
| Russia | USSR 1922 AD | Soldiers cost -5 coins |

## Map

18 territories spanning Europe, Asia, and Africa connected by an adjacency graph. Each territory has a terrain type (plains, forest, mountains, desert, island) that affects combat bonuses.

## Run Locally

```bash
cd emperors-conquest
python -m http.server 8000
# Open http://localhost:8000
```

## Architecture

```
src/
  main.js       — Entry point, canvas setup
  game.js       — Game engine, state machine, turn management, player actions
  map.js        — Territory definitions, empire data, adjacency graph, weapons, shop
  combat.js     — Dice-based battle resolution with strategies and weapon bonuses
  ai.js         — AI opponent: recruiting, fortifying, weapon equip, strategic attacks
  renderer.js   — All drawing (map, UI, panels, overlays, particles, help screen)
  input.js      — Mouse and touch event handling
  audio.js      — Procedural sound effects (Web Audio API)
```

## Built With

- Vanilla JavaScript (ES Modules)
- HTML5 Canvas
- Web Audio API

Zero dependencies. Zero cost. Runs in any browser.

## License

MIT
