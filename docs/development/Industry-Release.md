# Industry and responsive client · 26 October 2026

**Goal:** extend the legacy pixel game into a playable supply chain while keeping local interaction responsive. This is a development slice, not full Release A/B acceptance.

## Playable scope

| Feature | Implemented scope |
|---|---|
| Refineries | One local refinery: 25,000 coin build, pooled 1,000-unit input/output, seven ore lines at 120 raw/min each, 70% initial yield rising to 95% over 1,000 yield levels. Input/output/speed/yield upgrades; actual yard transfers; optional automatic routing. |
| Stations | One local orbital station: 250,000 coin build, 2,000 refined units per product, silo upgrades, stock transfers and published hourly spot contracts paid once. |
| Market | Deterministic simulated market: hourly published bids, local supplied quantity influences clearing, seeded outside supply/demand, bounded ±10% quote adjustment and last-valid quote fallback. Lifetime sold goods reconcile with inventory and refining loss. **Not the full nested CES/global multiplayer market.** |
| Home safety | Supply shuttle brings ten infantry after 60 seconds for 250 coin. Seeded gas/cave-in/pest incidents every 180–360 seconds; home production stays at least 75%, recovering within 30 seconds. Deployed patrol reduces disruption to 10% for ten seconds. **Not the full section 23 combat resolver.** |
| Maker | Explicit-action Claude/OpenAI BYOK planet design plus validated facility names, buyer personalities and factual dispatches. No-key/network/validation failure uses deterministic built-in prose. AI cannot set prices, coin, events or outcomes. |
| Client runtime | Local sandbox engine and browser prediction between online snapshots. Passive online reconciliation every 30 seconds, immediate after commands/sign-in/return/focus, coalesced requests and stale-response rejection. Hidden tabs do not passively poll. Heavy local catch-up uses a module worker with bounded batches and fallback. |

Refinery and station transfers are instant local preview transfers, disclosed in the interface. Delayed facility shipping, cross-player purchasing, forward contracts, complete market intelligence and true multiplayer industry remain future work. These early build costs are local playtest coefficients, not the canonical day-five/day-fifteen affordability targets.

## Accounting and saves

Own-facility inventory movement never creates revenue. Refining explicitly records material loss. NPC refined sales and completed galactic spot contracts are distinct external ledger sources. Purchases are sinks. Refinery budget fund/release is an internal spendable/escrow move, with total owned coin conserved; the budget is not used for fabricated NPC/player purchases. Automatic routing withdraws only existing whole crates and cannot round fractional dust into new ore.

New modules attach to existing new-economy saves at their current simulated second, without retroactive processing, earnings or incidents. Original-profile saves, prototype saves and server accounts retain their previous behavior. No credentials are included in save exports.

## Verification and delivery

PR #16 passed 63 local engine/AI/runtime tests, 86 backend tests and 10 real Auth/Firestore emulator tests, and was published from main merge `8801e567439cd903f861c4a77932ad605fd72436`. Public browser testing passed the full industry sale/contract loop, infantry arrival, no-key factual Maker, exact paused reload and 390px layout with no JavaScript errors. No paid infrastructure or AI request is needed for this batch. Trusted backend runtime deployment remains separate.

## Outstanding release gates

Release A still needs the complete durable event pipeline, accepted defense resolver, leaderboard/onboarding/accessibility coverage, comprehensive month simulations, recovery/performance/cost evidence and formal acceptance. Refineries/stations are Release B systems in the maintained roadmap; this local preview lets the CEO play them early without calling B complete. Online industry must use server validation and private projections before sharing economic outcomes.

## Automation and responsiveness follow-up

Refinery output has an explicit policy: **Hold/manual**, **Sell to NPC**, or **Fill own station**. Every 30 simulated seconds the latter policies move only existing whole refined units, using the same checked commands and ledger as manual actions. Full output silos or full wallets leave goods waiting; no inventory or money is discarded. Automatic station fill creates no revenue. Existing industry saves default to Hold/manual and are not reset. This is a local operations policy; automatic NPC exports use the same disclosed instant-transfer fixture as manual exports.

Follow-up unit coverage: **68 local tests pass**, including automated sale sources, whole-material accounting, station self-transfer without revenue, exact replay/catch-up and full-wallet behavior; escrow archive rows preserve owned-coin conservation.

Browser timing verified one passive refresh at about 31 seconds over a 35-second observation, even when takeoff ETA was one second; commands/focus trigger immediate reconciliation. A real module worker completed a one-hour catch-up while 97 animation frames and 157 ten-millisecond heartbeat callbacks ran. Reload during a persisted intermediate worker checkpoint resumed exactly to the same one-hour state, with no duplicate sales, output or incidents. These are development measurements, not production latency guarantees.

**AI verification:** schema, timeout, retry and deterministic fallback paths are tested with mocked providers. No live paid AI request was made; real provider content requires the player's configured key and an explicit request. The public no-key path is verified.

The minimap now renders on paused/reduced-motion startup and refreshes when switching view or planet, even when the visual clock is frozen.
