# Mineshaft Capital v2: architecture contract

This is the contract every builder works to. `ROADMAP.md` says *what* and *why*; this says *how the pieces fit*. **Fun first**: when a detail here fights fun, change the detail and note it in your report.

## Shape

```
game/
  shared/            pure ES modules, no I/O, no DOM. Imported by the server AND served to the browser at /shared/
    engine/          rate engine: data model, costs, rates, advance(), commands, market, bottleneck
    planet/          planet + ore + region generation (procedural fallback, AI prompt + validation)
  server.js          HTTP + WebSocket (v1 routes for /classic stay untouched)
  v2/                server-only: colony service, world lifecycle, AI prompts that call ai.js
  public/
    index.html       the v2 game (new)
    app/             v2 client modules (renderer, UI, net)
    shared -> served from game/shared at /shared/
    classic/         the original artifact port (index.html + net.js), kept playable
  test/              node:test suites
```

No build step. Browser loads ES modules directly. Node 22+, `"type": "module"` in `game/package.json`.

## Principles

1. **Server is authoritative.** Clients send *commands*; the server advances the colony to `now`, applies the command, saves, and returns the new colony. Clients never write money, ore or time.
2. **Rates, not agents.** All economics are rates. Miners, carts, conveyors and ships on screen are animated from rates and ship schedules; they never decide outcomes.
3. **One engine, two places.** `game/shared/engine` runs on the server (truth) and in the browser (smooth prediction between syncs). Same code, deterministic given the same inputs.
4. **Lazy settlement.** A colony is advanced only when touched (command, read, or a periodic server sweep every ~60s for leaderboard freshness). `advance()` must give the same result whether called once for 3 days or many times in small steps (within 0.5%).
5. **Time comes from the server.** Commands carry no timestamps. `now` is `Date.now()` on the server.

## Engine API (`game/shared/engine/index.js`)

```js
export const ENGINE_VERSION;                       // bump when colony shape changes; server migrates or resets
export function newColony({ id, uid, name, species, planet, siteRegion, now, grant }) -> colony
export function advance(colony, world, now) -> { colony, events }   // pure; returns new objects, never mutates input
export function applyCommand(colony, world, cmd, now) -> { colony, events, error? }   // calls advance first
export function quote(colony, world, cmd) -> { cost, effect, canAfford, n }   // for UI: price + "next effect" text
export function rates(colony, world) -> { orePerMin: {oreId: n}, liftPerMin, conveyorPerMin, shipPerMin, coinPerMin, ... }
export function bottleneck(colony, world) -> { stage, wastedPerMin, message, suggestion: { cmd, cost, label } } | null
export function destinations(colony, world, shipClass) -> [{ id, name, price per ore, tripSecs, coinPerMin, best }]
export function marketPrice(world, oreId, destId, now) -> number
export function recordSales(world, sales, now) -> world        // market reacts to planet-wide selling
export function unlocks(colony, world, now) -> { panels: [...], licenses: [...] }  // what UI to show
```

- `world` = the month's shared state: `{ month, planet, market: { [oreId]: { index, lastT } }, startedAt, endsAt, events: [], changes: [] }`.
- `events` are small facts for the feed and UI toasts: `{ type, text, at, data }` (e.g. vein at 20%, ship sold cargo, new license).
- Commands are `{ type, ...args }`. Phase 1 set: `hire`, `buyShaft`, `upgradeShaft {shaftId, kind, n}`, `upgradeLift {n}`, `upgradeConveyor {n}`, `upgradeYard {n}`, `buyPad`, `buyShip {cls}`, `upgradeShip {shipId, n}`, `setRoute {shipId, policy, destId?}`, `rename {target, id, name}`, `tutorial {step}`. `n` may be a number or `'max'`.
- Numbers: plain JS numbers (coin can reach 1e15+). Never NaN. Format on the client.
- Everything random comes from seeded RNG (`seed` on colony/world), never `Math.random()`.

## Planet API (`game/shared/planet/index.js`)

```js
export function improvisePlanet(seed, { history }) -> planet          // no AI
export function planetPrompt({ request, history }) -> string          // prompt for the AI
export function planetFromAI(raw, seed) -> planet                     // validate + fill gaps; never trust raw
export function oreSpriteSpec(ore) -> { palette, shape, sparkle }     // client draws ore from this
```

`planet` = `{ id, name, theme, tagline, story, sky: [top, horizon], moons: [...], layers: [5 rock layers], regions: [5-7 { id, name, terrain, biome colors, blurb, weather, x, y }], ores: [7 { id, name, tier: 'common'|'rare'|'mythic', color, palette, shape, use, description, hardness, depthMin }], buyers: [destinations { id, name, blurb, distance, likes } ] }`. Ores are themed from the planet's theme *and* their galactic use.

## Server v2 API (all JSON, Bearer token from the existing join flow)

```
GET  /api/v2/state            -> { me, colony, world, board, serverNow }      // advances my colony first
POST /api/v2/command  {cmd}   -> { colony, events, serverNow } | 4xx { error }
POST /api/v2/start   {species, siteRegion} -> { colony }                        // start my colony this month
GET  /api/v2/board            -> { month: [ {id, name, species, coin, coinPerMin} ], allTime: [...], hall: [...] }
WS   /ws  op:'sub' coll:'board2' | 'world2' | 'feed2'   (server pushes summaries, never other players' full colonies)
```

Storage uses the existing `docs` table via `store.js` with **server-only** collections: `world2/current`, `col2/<uid>`, `feed2/<id>`, `hall2/<month>`, `stats2/<uid>`. These are NOT in the client-writable `COLLS` set.

Month lifecycle runs on the server: a minute timer takes the `world` lock, rolls the month at the calendar boundary (UTC), records the Hall of Fame, and builds the next planet (AI when a key exists, else improvised; the winner's prompt if they gave one).

## Client (`game/public/app/`)

- `main.js` boot: sign in (reuse the join overlay from `classic/net.js`), fetch state, start render loop.
- Predict locally with the shared engine; resync from server responses and every ~30s. Server wins on conflict.
- Renderer: port the archived pixel renderer (`archive/legacy-tycoon:play/sprites.js`, `scene.js`, `terrains.js`, `planet.js`) for the side-view mine and region landscapes; draw ores from `oreSpriteSpec`.
- Layout: persistent top bar (coin, coin/min, day N of month, rank, alerts) + mine canvas + panel tabs that appear as `unlocks()` reveals them. First screen: the mine and one button.
- Mobile-friendly, reduced-motion toggle, sound on by default (small WebAudio blips, no assets).

## Testing

- `npm test` runs everything under `game/test/`. Engine tests cover: determinism, advance step-invariance, offline catch-up, every command, no negative coin/ore, vein depletion warnings, market recovery.
- Browser checks use Playwright (preinstalled; `require('playwright')`, `chromium.launch()`).
