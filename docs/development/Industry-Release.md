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

Model and browser verification is in progress. Publish only after engine, transaction/replay, worker and browser checks pass; record exact results below. No paid infrastructure or AI request is needed for this batch. Trusted backend runtime deployment remains separate.

## Outstanding release gates

Release A still needs the complete durable event pipeline, accepted defense resolver, leaderboard/onboarding/accessibility coverage, comprehensive month simulations, recovery/performance/cost evidence and formal acceptance. Refineries/stations are Release B systems in the maintained roadmap; this local preview lets the CEO play them early without calling B complete. Online industry must use server validation and private projections before sharing economic outcomes.
