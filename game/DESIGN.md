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

## Phase 2 contract (prestige, hazards, galaxy changes, species)

**World changes** (`world.changes`, written by the server: Maker deals and galactic events). Engine applies them in `marketPrice`:
```js
{ id, kind: 'demand'|'supply'|'global'|'buyer', oreId?, buyerId?, mult, by (uid|null), source: 'maker'|'event', title, reason, at, until? }
```
- `demand`: ore price × mult at every buyer. `supply`: more outside supply → price ÷ mult. `global`: all ores × mult. `buyer`: that buyer's prices × mult.
- Changes with `until` expire (galactic events); Maker changes last the month. Multipliers stack multiplicatively; the engine clamps the combined effect to 0.2–5×.

**Prestige** (engine commands):
- `nuke { confirm: 'NUKE' }`: needs `runEarned` (coin earned since the last nuke, grant excluded) ≥ `T.nukeMin` (20M). Spectacle = runEarned^(1/7.5) × spectacle evolution bonus. Paid cargo on ships already flying is settled now; all ships, sites, buildings and coin are removed; the colony restarts as a fresh starter mine. Kept: `sp`, `evo`, `nukes`, `monthEarned` (total earned this month across runs), `lastNuke: { at, spectacle, runEarned, makerUsed: false }`, name, species, siteRegion, unlocked panels/licenses. Emits a `nuke` event.
- `evolve { kind, n }`: spend SP. Kinds: `mine` (ore/min), `ship` (ship speed), `sell` (sale price), `spectacle` (next nuke's Spectacle). Rising costs; effects last the month through later nukes.

**Hazards** (engine): deeper shafts are more dangerous. Per-shaft upgrades `lights` (prevent miner insanity) and `supports` (prevent cave-ins) via `upgradeShaft { kind }`; colony-wide `upgradeSafety { kind: 'ventilation'|'pumps'|'firebreaks' }` against gas, floods and fire. Hazard times are pre-rolled from the seeded RNG so `advance` stays step-invariant. Hazard events carry short story text (rescues, narrow escapes, last stands).

**Server Phase 2 API**
```
POST /api/v2/maker   { action: 'open'|'argue'|'accept'|'leave', ask?: { kind, oreId?, buyerId?, direction: 'up'|'down' }, reason? }
                     -> { session: { rounds, ask, offer?: { mult, title }, lines: [{ who: 'maker'|'you', text }], status } }
POST /api/v2/species { description } -> { species }   // AI picks parts from the shared species library
GET  /api/v2/bulletin -> { changes: [...active world changes with who/why...] }
```
Maker outcome: strength = 0.85 × spectacle score + 0.15 × negotiation quality (0–1, judged by the AI; heuristic fallback). The AI writes the Maker's lines only; the server decides accept / counter / refuse. One Maker session per nuke, up to 3 rounds.

## Phase 3 contract (refineries, buyer parties, ledger, charts)

**Buyer parties** (`world.parties`, built by the server at month start; pure generator in `game/shared/market/parties.js`):
```js
{ id, name, type: 'industrial'|'military'|'research'|'traders'|'political'|'fringe', blurb, personality,
  wants: { [oreId]: weight 0..1 },     // what they buy refined goods of
  demand: number,                      // units/min they'd buy at their reference price on day 1 (grows with the month)
  ref: number,                         // reference price multiple of the ore's refined base value (0.8..1.6)
  sigma: number,                       // price elasticity (1.5 traders/industrial .. 4 fringe); higher = more price-sensitive
  cap: number }                        // hidden maximum: they never pay above ref × cap (1.2..2.5)
```
About 24 per month, 4 of each type. Names, blurbs and personalities come from the AI (fallback word banks). Numbers are seeded and never trusted from the AI.

**Demand curve** (engine, hidden from players): party k buys refined `ore` at ask p (as a multiple of that product's base value) at
`q_k(p) = demand_k × growth(day) × wants_k[ore] × (p / ref_k)^(-sigma_k)` when `p ≤ ref_k × cap_k`, else 0.
Total sales/min = min(stock flow, Σ_k q_k). The player chooses p with a markup slider and discovers the curve through results. World changes of kind `buyer` (id = party id) and `demand`/`global` also scale these curves.

**Refineries** (engine): one licence (`refinery`, day ≥ 4 and 20M earned).
- `buildRefinery { site: 'planet'|'orbital' }`. On-planet: cheap, fed straight from the yard by its own belt, smaller. Orbital: expensive, bigger and better yield, fed by ships routed to it (a destination with a short trip). A colony may own one of each.
- `upgradeRefinery { site, kind: 'throughput'|'yield'|'storage'|'docks', n }`. Docks reserve pads/slots for your ships at the orbital refinery.
- `setRefine { site, oreId, on: bool, markup: 0.5..3 }`: per-ore buy panel. Refine this ore yes/no, and the asking price as a markup on the product's base value.
- Refined product value: about 3–5× the raw ore value per refined unit, times yield. Refined goods are sold from refinery storage to parties continuously per the demand curve (no ships needed). Unsold goods fill storage, and when storage is full the refinery stops taking raw ore.
- `rates()` adds `refinery: { [site]: { inPerMin, outPerMin, soldPerMin, coinPerMin, stock, cap, byOre: { [oreId]: { ask, soldPerMin, coinPerMin, vsRaw } } } }`.

**Ledger** (engine): `colony.ledger = { month: { in: { raw, refined, nukeCargo, grant }, out: { miners, shafts, lift, ships, refinery, safety, ... } }, run: {...} }`. Every coin in or out is tagged.

**History for charts** (server): an hourly snapshot per colony in `hist2/<uid>` (`[[t, coin, coinPerMin, rank], ...]`, max 744 points), and per-ore market price index history in `phist2/current`. `GET /api/v2/history` → `{ me: [...], prices: { [oreId]: [[t, index], ...] }, board: [{id, points}] }`.

## Phase 3.5 contract (sites, monumental shafts, lift)

**Hardness is now 1–10.** Commons 1–3, rares 3–7, mythic 9–10. Gear levels match: gear ≥ hardness cuts that ore. Gear above 8 needs the `mythicDrill` licence.

**Planet** (`game/shared/planet`, generated once per month):
```js
planet.regions: 12–18 × { id, name, terrain, biomes, blurb, weather, x, y,
  common: oreId,              // exactly one of the 2 commons; each common covers a contiguous zone of regions
  soil: 0.75..1.35,           // hardness multiplier: higher = slower digging
  tough: bool,                // naturally tough ground; only here can mythic occur
  temperature: -1..1 }
planet.sites: ~3–6 per region × { id, regionId, name, x, y,
  soil,                       // region soil ± a little
  richness: { [oreId]: 0..1 },// common of its region = 1; each rare present independently at ~37% (0.2..1 when present); mythic only on tough regions, ~5% of all sites
  veinSize: { [oreId]: 0.6..1.6 },
  start: bool,                // eligible starting site: score ≈ +1 SD above the mean, no hostile tribe/boss flags
  score }                     // overall quality, for balancing starts
planet.buyers[].units         // trip distance in units: on-planet 1–8, off-planet 10–60 (+8 to leave the surface); keep `distance` labels too
```
Sites keep a minimum spacing. `planetFromAI` keeps AI flavor (names, colors, terrains) but all of the above numbers are seeded.

**Colony site:** `newColony({ ..., site })` receives the chosen site object. The server gives each player a distinct `start` site (players pick one in onboarding). The colony stores `site` (id, regionId, soil, richness, veinSize, common).

**Shafts** (engine; replaces global miners, bunks, drill and per-shaft carts/bunks):
```js
shaft: { id, idx, name, dir, band: 'shallow'|'middle'|'deep'|'deepest',
         miners, gear, cart, face, pk[], ... }        // keeps pockets from Phase 2.5, plus hazard fields
```
- `surveyShaft` (via `quote({type:'buyShaft'})` or a dedicated export `shaftOptions(colony, world)`) returns exactly 2 direction options for the next shaft (e.g. left or right of the main tunnel): `{ dir, label, prospects: { [oreId]: 'none'|'low'|'fair'|'good' } (fuzzy), cost }`. Each option has its own pocket seed and site-richness weighting, so some are better than others.
- `buyShaft { dir }`. Costs are monumental and rise steeply (tune so a strong player opens about 6–12 shafts in a month). Each new shaft starts with 0 miners, gear 1 and cart 1.
- Per-shaft commands: `hireMiners { shaftId, n }` (cost rises per shaft and scales with depth), `upgradeGear { shaftId, n }` (mining speed + hardness), `upgradeCart { shaftId, n }` (ore/min the cart can haul from face to entrance; the shaft is capped by its cart).
- Production per shaft = miners × perMiner(gear) × depth richness × (1 / soil), then capped by the cart. Ore mined = the common of the site, or the current pocket's ore. Pocket odds and sizes rise with depth band and site richness, and use only ores present at the site. Mythic appears only in the deepest band at mythic sites.
- Veins: sized so a rare pocket lasts ~4 hours to 2 days at a median player's pace. Events at 20% left; output tapers below 5%; then back to common until the next pocket.
- Hazard danger ×2 every 5 shafts.

**Lift:** `upgradeLift { kind: 'speed'|'capacity'|'buckets', n }`. Throughput = buckets × capacity × trips/min (speed, slowed by the depth of the deepest active shaft). The old single lift upgrade goes away.

**UI rule:** no recommended buys. `bottleneck()` keeps `stage` and `message` (a diagnosis) but the client shows no buy suggestion.

### Painted planet (supersedes `planet.sites` lists)
- `planet.field`: seeds and parameters only (no rasters stored). Pure functions in `game/shared/planet` sample it anywhere on the map (x, y in 0..1000):
  - `sampleSpot(planet, x, y)` returns `{ x, y, regionId, height, temperature, moisture, climate, terrain, soil, tough, common, richness: {oreId: 0..1}, veinSize: {oreId}, score }`.
  - `startSpot(planet, takenPoints, seed)` returns a random spot near +1 SD of score, at least `MIN_SITE_GAP` from taken points, with no mythic.
  - `renderPlanetMap(...)` lives in the client pixel kit, not shared.
- The server stores the colony's `site` from `sampleSpot` (id = `s<x>_<y>`, plus the sampled numbers). The engine reads only `colony.site`.
- The client map never draws ore or territory fields.
