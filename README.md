# Island Courier

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/firehorse20/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/firehorse20/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A flight campaign over the Coral Archipelago: fly contracts, earn credits, unlock better aircraft, and don't run out of fuel over the sea. Runs entirely offline in a desktop browser from its own files — no library, no network request.

## How to play

Open `game/index.html` (or serve the folder: `node serve.ts`, then http://localhost:8080).

- **W / S** — throttle up / down
- **Arrow keys / A D** — pitch and roll; the plane turns by banking
- **V** — switch chase / cockpit view
- **M** — mute the engine sound
- **P / Esc** — pause

Fly through every ring, then land on the runway at the destination island. Landings matter: touch down slow and on the strip (or the grass beside it), or the airframe is lost. Fuel drains while the throttle is open — a rescue pickup that runs dry ends in the sea.

## The campaign

Five contracts, in order of difficulty:

1. **Island Courier** — 6 rings from Coral Bay to North Field, gentle weather.
2. **Rescue Pickup** — low rings over the sea to a stranded crew, then land at North Field.
3. **Air Race** — 8 rings, beat the par time for a bonus.
4. **Ring Slalom** — 10 tight rings weaving between the islands.
5. **Storm Front** — 6 rings through a storm with gusting crosswinds.

Credits buy the **Swift** (fast) and the **Albatross** (long range), plus engine, tank and hull upgrades. The hangar keeps what you earn between contracts.

## Under the hood

Plain ES modules, no dependencies: `game/src/config.js` (aircraft, missions, tuning), `terrain.js` (the archipelago: coast, islands, mountains, runways), `world.js` (physics, rings, fuel, hull, career), `render.js` (canvas 3D with lit instruments), `input.js`, `shots.js` (scripted autopilot used for testing and screenshots), `main.js`. `main.ts` copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.
