# Emperor's Conquest

A turn-based strategy game set in the ancient world. Build your empire, recruit armies, conquer territories, and crush your rivals.

## How to Play

**Desktop:** Click territories to select, recruit, move, and attack.
**Mobile:** Tap to interact — same controls, touch-friendly.

### Turn Flow
1. **Income** — Collect gold from your territories
2. **Recruit** — Spend gold to train troops
3. **Move** — Shift armies between your connected territories
4. **Attack** — Invade enemy or neutral territories
5. **End Turn** — AI empires take their turns

### Combat
Dice-based battles. Attacker rolls up to 3 dice, defender up to 2.
Higher die wins each round. Ties favor the defender.
Terrain bonuses apply (mountains = +1 defense).

### Victory
Conquer every territory on the map. If you lose all territories, you're defeated.

## Empires
Each empire has a unique bonus:
- **Rome** — +1 gold per territory
- **Carthage** — +1 defense on all territories
- **Egypt** — Recruit troops at reduced cost
- **Greece** — +1 attack in combat
- **Persia** — +2 base gold income per turn

## Run Locally

```bash
python -m http.server 8000
# Open http://localhost:8000
```

## Architecture

```
src/
  main.js       — Entry point
  game.js       — Game engine, state machine, turn management
  map.js        — Territory definitions, empire data, adjacency graph
  combat.js     — Dice-based battle resolution
  ai.js         — AI opponent decision making
  renderer.js   — All drawing (map, UI, animations, overlays)
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
