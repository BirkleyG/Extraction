# Extraction Tycoon — Build-Out Checklist

**Prepared 25 October 2026 from Rulebook v1.2 + `main` (28f0d88).** Companion to the [Buildout Plan](Buildout-Plan.md) (strategy/gates) — this file is the working task list.

Legend: ✅ built and tested · 🟡 partial / sandbox-only · ⬜ not started · ❓ blocked on a decision from you

## Where things stand

| Piece | State |
|---|---|
| Rulebook v1.2 (sections 00–23) | Complete spec. Coefficients marked C-xx are still provisional. |
| `backend/` (Node, Firebase Admin) | Checked-integer ledger, idempotent wallet/escrow commands, Firestore persistence, verified-token HTTP, deterministic event kernel, production/lift flow model. ~39 fast tests + 3 emulator tests. **Owner-wallet operations only.** |
| `play/` | Single-player local sandbox: mine view, hire, upgrades, shafts, local shipping. Not authoritative, no market, no month. |
| `prototype/` + `js/game.js` | Legacy Mineshaft Capital. Kept for reference/saves; not a base for the new rules (10-shaft cap, pays on return, 48h offline cap, client-side time). |

**Baseline note:** the table above records the initial assessment; the progress log and latest checkpoint below supersede its implementation counts.

**The core problem Codex hit:** the rules need a trusted server that owns time, money and hidden state. The legacy game is a client-side sim. So the build is a backend-first job; the browser is a thin renderer on top. Build in the order below — each phase unblocks the next.

---

## Phase 0 — Decisions (answered 25 Oct 2026)

- [x] **Starting coin = 0.** Catch-up grant for mid-month joiners = 20% of the current month's median player cumulative earnings (source `CATCH_UP_GRANT`; never counts as earnings). ⚠ See tension note below.
- [x] **Same-timestamp event priority (engineering call, provisional until the scheduler is built):** 1 month-close boundary → 2 hazard/ecology/combat events → 3 production tick → 4 arrivals → 5 departures/commands → 6 contract deadlines → 7 hourly market clear → 8 news/AI. Ties then break by timestamp, then event ID.
- [x] **Ore is whole units** (integers) at the yard, in ships, in reservations and in settlement. Fractional accumulation stays inside the production model; only whole units leave it.
- [x] **Hosting budget: $2/month on Firebase Blaze, US East.** ⚠ Google budgets only send alerts; they do not cap spend. Design the scheduler for a small fixed number of jobs and measure reads/writes per tick before deploying.
- [x] **Engineering may propose and simulate missing coefficients** (hire/habitat cost, NPC offer formula, buyer budgets), documented with evidence like C01-LIFT-02.
- [x] **`main` is the GitHub Pages branch.** AI budget (Q-05) deferred; AI stays off. Q-06 admin identity still open (needs your Firebase project/UID when we deploy).

**Tension to resolve (simple fix proposed):** with 0 coin, the first upgrade (15 coin) needs a first sale, and a 150-unit Hauler at ~5 units/min takes ~30 min to fill. T01-01 ("first purchase within 30 seconds") can't hold. Proposed: allow a partial-load paid departure so the first sale happens within ~1 minute, and tune the first NPC offer so that sale covers the first upgrade. Needs your OK because it changes the "5-minute first session" feel.

---

## Release A — Tycoon core (mine → NPC buyer → coin → month)

Scope per section 22: mine, miners, raw-ore shipping to NPC refineries, independent upgrades, leaderboard, month lifecycle, offline progress, ledger, basic news, minimal defense. **Only complete Release A is shippable.**

### A1 — Authoritative foundation (mostly done)
- [x] ✅ Checked-integer ledger, MAX_COIN, escrow subaccount, replay (T02-01/02/04, T18-01/02 partial)
- [x] ✅ Idempotent commands, version CAS, receipts (T18-13/14)
- [x] ✅ Firestore transactions + verified ID tokens + deny-all client rules
- [x] ✅ Event kernel: ordering, dedupe, seeded RNG per site/second, horizon (T17-01/02 foundation)
- [x] ✅ Pure production model: shafts, lift (C01-LIFT-02), finite buffers, 1s catch-up (T03 partial)
- [x] 🟡 **Durable event queue** (`backend/src/event-queue.js`) — one record per event, ordered page claims, fenced leases, CAS checkpoints, atomic state docs with commit. Memory store tested (9 tests); Firestore store + emulator test written but not yet run. Still to do: wire the kernel handlers and scheduler onto it (next item)
- [x] 🟡 **Zero-client scheduler/worker** (`backend/src/event-worker.js`, hooked into `WorldAdmin.tick`) — claims fenced pages, applies pure handlers with the seeded per-site/second RNG to one small state doc per site, commits state + checkpoint atomically; live == catch-up proven across page sizes. Owner settlement already advanced with nobody online; **no real game event type is migrated onto the queue yet** (handler registry is empty), and the Firestore path has no emulator run
- [ ] ⬜ Server-side world record: month ID, seed, state machine (`open → closing → closed`)
- [ ] ⬜ Player enrollment + admin/host endpoints (server-verified roles, never `#admin`)
- [ ] ⬜ Private read-model projections with explicit field allowlists (T18-09, T20-02)
- [ ] ⬜ Replace in-memory/test adapters in the path to production; abuse/rate limits

### A2 — Mine-to-buyer loop
Rules: 03, 04, 05, 10, 02 (commercial departure). Tests: T03, T04, T05, T10, T18-03/11.
- [x] ✅ **World generation (seeded, `backend/src/world.js`):** 7 ores (2 common / 4 rare / 1 mythic), regions, home-site generation, equal-EV starts (T04-01, T11-01)
- [x] 🟡 **Upgrade engine** (pure pricing done: `backend/src/upgrades.js`; transactional purchase endpoint still to do) — one registered cost-curve table (section 10 families); buy 1/10/100/Max with exact summed rounded prices, cap + overflow checks inside the transaction (T10-01/03/04/08)
- [ ] ⬜ Mine structure: shafts 1–30 (cost `120×2.4^(k−1)`, hard stop at 31 — T03-05), dig, lift, buffers, surface yard, pads (cap 12)
- [ ] ⬜ Shaft improvements: lights, supports, carts (utilization 0.25+0.075L), bunkhouse (capacity 10+5L)
- [ ] ❓ Worker pool + auto-assignment + habitat capacity ("!" for wasted labor)
- [ ] ⬜ Depth→ore yield bands; rare/mythic vein depletion with 20%/5% warnings (T04-02/03)
- [ ] ⬜ Soil + weather modifiers (feeds production formula)
- [ ] ⬜ Ships: Hauler/Cruiser/Freighter, pad loading, trip time = 2×travel + unload + dock wait (one shared function for UI and sim — T05-01)
- [x] ✅ **Atomic paid departure** (`game-service.js`, memory repo; Firestore adapter still to do) (the heart of the game): validate → reserve receiving capacity + quantity → debit buyer → credit seller → remove stock → shipment + arrival event, all in one transaction; failure mutates nothing (T02-03, T05-02/05, T18-03/11)
- [x] ✅ Arrival converts reserved capacity → stock, **never pays again** (T05-02/03)
- [x] 🟡 NPC refineries (token-bucket funds/capacity, fixed bids; ≥3/planet + market-driven offers still to do): offer formula, buyer budgets that run dry, explicit external coin source (no unlimited premium demand)
- [ ] ⬜ Ship policies: best coin/min, nearest, fixed, preferred list; destination table showing price, trip time, coin/min
- [ ] ⬜ Weather grounding (wait, no loss); dock reservation/queue

### A3 — Month lifecycle, defense, browser UI
- [x] ✅ **Resumable month-close state machine** (`month-close.js`; Memory + Firestore emulator tests) (T17-05/06/07, T18-12): reject departures ≥ B → process events < B → snapshot coin+escrow once → finalize pre-B shipments without extra pay → archive/burn/reset → create next world. Crash-safe at every phase.
- [x] 🟡 Snapshot ranking, tie-break (first to reach peak), all-time stats, Hall of Fame record (T01-03/04). Live leaderboard + coin/min UI still to do
- [ ] ⬜ Mid-month join + catch-up grant (T01 edge cases)
- [ ] ⬜ Winner writes next planet prompt (24h timeout → fallback)
- [ ] ⬜ Offline "while you were away" summary (unlimited offline, T17-03)
- [ ] ⬜ **Minimum defense (section 23 resolver):** Infantry only, home mine can never be captured or fully shut down (T12-04, T23-06), deterministic combat from event ID + entity ID + tick (T12-01, T23-01), recruit via supply shuttle (reinforcements absent until arrival — T12-02)
- [ ] ⬜ Ecology/hazards minimum for A: pests, cave-ins (supports, T15-02), seeded & reproducible
- [ ] ⬜ Fallback news/templates (AI fully off — T19-02); validation layer in place for later AI
- [ ] ⬜ **Browser client rebuilt as renderer:** submits commands, renders filtered snapshots; side-view mine, fleet panel, records (source/sink/escrow separate), top bar, "!" markers, **no bottleneck names or best-upgrade hints** (T20-05)
- [ ] ⬜ Onboarding: first purchase <30s (T01-01), guided mine→ship→sell→upgrade
- [ ] ⬜ Species name/look picker + Maker Guild intro
- [ ] ⬜ Phone-width layout (T20-03), reduced motion (T20-04), compact numbers with exact on hover, skeleton loaders, sound on by default
- [ ] ⬜ Notification tiers (critical/important/routine), rate-limited

### A4 — Certification and private launch (up to 10 friends)
- [ ] ⬜ **Headless month simulator** with scripted players: idle / active / aggressive / passive / exploit-seeking; 28/29/30/31-day months; 3/10/30 players; ≥2 seeds (section 21)
- [ ] ⬜ Balance report: refinery ~day 5 (250M), station ~day 15 (10B), E(d)=100M×1.5^(d−1), idle ≈ 60–70% of active, most core lines >80%, top ≤ 5× median, no strategy > +30% (C-01)
- [ ] ⬜ Invariant suite: coin conservation, no negatives, no double payment, live == catch-up, hidden data never in payloads, reset correctness (T21-01/02)
- [ ] ⬜ Exploit tests: duplicate tabs, reloads, clock changes, negative/overflow inputs, tampered client data
- [ ] ⬜ Outage/recovery drills; B−1ms / B / B+1ms; crash in each closing phase
- [ ] ⬜ Deployment runbook, measured Firebase cost, feature flags, rollback, patch notes (T22-02/03)
- [ ] ⬜ Fresh saves; legacy `msc_*` saves untouched (Q-03)

---

## Release B — Industry and trade (Sections 06–09, 08)

- [ ] ⬜ Player refineries: buy panel per ore (buy/markup 0–100%/daily limit), budget + auto-refill, lines (speed, yield 70→95%), input/output storage, owner-ship markup waiver (T06)
- [ ] ⬜ Refinery location choice (on-planet vs off-planet), escalating cost for additional ones
- [ ] ⬜ Stations: silos, docks (cap 24), contract board, markup per product, intel level (T07)
- [ ] ⬜ Buyer parties: ~24/month, six categories, lazily generated personalities, secret max prices
- [ ] ⬜ Contracts: spot vs forward, counteroffers, partial fills, collateral, default fee, liability, station forfeiture to Maker Guild (T02-05, T07-01…04) — **thresholds must be disclosed before acceptance**
- [ ] ⬜ **Nested CES market engine** + deterministic solver with last-valid-state fallback (T08-01…10)
- [ ] ⬜ Outside supply curves, hourly clearing, endogenous events (no gold rush, no fixed shock)
- [ ] ⬜ Intelligence tiers 0–5 server-filtered (T08-06/07); level-5 profit-maximizing ask recommendation
- [ ] ⬜ Player-to-player trade via paid shipments, zero tax, anti-wash-trading for prestige (T09)
- [ ] ⬜ Dock reservation for own shipments
- [ ] ⬜ NPC scaling (≥3 refineries, ≥4 buyers; works with 1 player — T09-03)
- [ ] ⬜ Exchange board UI with profit/hour per option
- [ ] ❓ Optional AI refinery manager ("maybe… sounds interesting")

---

## Release C — Living world and Maker (Sections 11, 13–16, 23 expanded)

- [ ] ⬜ Scouting drones (3 days → 2 hours), confidence-limited reports, stale reports (T11-02)
- [ ] ⬜ Outposts: site price 2B ×2.5 each, survey + minimum garrison required, abandonment missile strike (T11-03), first one reachable days 8–14
- [ ] ⬜ Persistent ecology: classes, traits, cohorts, migration, nests, mythics (planet-scoped), extinction rules (T14)
- [ ] ⬜ Full hazards: gas, flood, fire, earthquake, weather forecast sensor, asteroids/solar flares, pirates as a space tribe (T15)
- [ ] ⬜ Tribes: identity, hostility 0–100, raids, 3-round negotiation, tribute/ceasefire/rights, tribe-to-tribe relations, extermination campaigns, forced workers (T13-01…04)
- [ ] ⬜ **Translation system:** Vocabulary / Accuracy / Languages, language slots, deterministic token rolls, **canonical meanings server-only** (T13-05…10, T18-09, T20-07)
- [ ] ⬜ Full military: Armored/Specialist/Air, Military Strategy unlocks, Security Planning, robot-General HQ with 8 upgrade lines, 4 branch equipment lines + protection, 6 visual eras (T23)
- [ ] ⬜ Return-leg ambushes only (paid outbound never touched — T12-07, T23-07)
- [ ] ⬜ Spectacle/nuke: eligibility 20M current-run, `S = TC^(1/7.5) × multiplier`, incremental high-water SP, freeze → finalize paid commitments → burn coin → in-kind starter mine (T16)
- [ ] ⬜ Maker negotiation: AI structured proposals → engine scoring/envelope → durable economic events; fallback templates (T16-02/04, T19-06/07/08)
- [ ] ⬜ Evolutions (SP-bought lines), reset monthly
- [ ] ⬜ Optional AI layer (BYOK or budgeted): names, news, significant-battle narratives; all output validated, 1 retry then template (T19)
- [ ] ⬜ Cartoon-graphic combat presentation that never affects outcomes (T23-11)

---

## Rulebook items to clarify (found while reading)

1. Section 03 shows the original linear lift line; section 10's C01-LIFT-02 (2×1.0316^L) supersedes it — update section 03 text so they don't disagree.
2. Section 15 mentions a "Technology tab" sensor, but section 20's screen list has no Technology tab.
3. Section 06 says player refinery owners "may outperform" NPCs with no guarantee, while section 09 says player trade should be *the more profitable path* — pick one framing for balance targets.
4. Section 12 says "Security Planning/Strategy thresholds provisional" and section 23 gives HQ cost curves "to be registered in 10" — need base costs before any military purchase can be built (C-04).
5. Release A ships Infantry only but needs the full section 23 resolver (adopt "from A") — confirm that the resolver is built once, with other branches simply switched off by flag.

## Suggested order of attack (smallest next steps)

1. Phase 0 answers (even a one-line "go with your recommendation").
2. Durable event queue + scheduler worker (A1).
3. World generation + upgrade engine (A2, pure code, easy to test).
4. **Atomic paid departure** + NPC refinery buyer (the most failure-prone piece — do it before UI).
5. Month-close state machine.
6. Rewire `play/` to call the server instead of the local model.
7. Minimum defense, then simulator + balance pass (A3/A4).
8. Release B, then C — each gated on the previous.

## Progress log
- 25 Oct: `upgrades.js` (registered curves, exact bulk pricing, Max, shaft/pad/dock/outpost prices; T10-01/03/07/08 covered) and `calibrate-early.mjs` + `C01-EARLY-01` profile (see [Early-Game-Calibration](calibration/Early-Game-Calibration.md)). 48 fast tests pass.
- 25 Oct: `world.js` seeded planet generation (7 ores, exclusive common ore per region, ~37% rare coverage, ~5% mythic in tough ground, equal-value start sites; T04-01, T11-01). 56 fast tests pass. Next: shaft/mine state + transactional purchase command, then the atomic paid-departure transaction.
- 25 Oct: `mine-engine.js` + `game-service.js`: enroll, buyUpgrade (1/10/100/max), hire, buyShaft, atomic paid dispatch with NPC token-bucket budget/capacity, idempotent receipts, ledger types SYSTEM_PURCHASE / NPC_RAW_PURCHASE (T02-01/03, T05-02/03/05, T18-10/11 covered on the in-memory repository). 66 fast tests. **Next:** Firestore repository `getDoc/putDoc`, durable scheduler/offline advance, month-close state machine.
- 25 Oct: `firestore-game-repository.js` — GameService now runs on real Firestore transactions (emulator-tested: idempotent retry across instances, restart recovery, two owners racing one NPC buyer budget). 5 integration tests pass. **Next:** scheduler/offline advance, month-close state machine, HTTP routes for game commands, then rewire the browser.
- 25 Oct: `/play/` sandbox now runs the C01-EARLY profile (0 coin start, 40/unit bid, 5-unit starter cargo, habitat line, graduated hire cost). Browser-verified: first sale (200 coin) at ~5 s, no JS errors. Sandbox save key bumped to `extraction_playtest_v2` (old v1 saves ignored, not deleted).
- 25 Oct: steady-state extrapolating catch-up (`advanceProductionFast`; 31 days in ~25 ms, equals 1-second loop within tolerance) and `month-close.js` (drain → single snapshot → burn once per owner → stats/hall; crash at every phase resumes identically; commands ≥ B rejected as `MONTH_CLOSED`). 71 fast tests + 6 emulator tests pass. **Next:** HTTP routes for game commands + per-owner read model, NPC buyer refresh/daily budgets, minimal defense, browser client wired to the server.
- 25 Oct: `projection.js` (allowlisted owner read model), `game-http.js` (GET state, POST commands, verified identity, server month/clock), `npc.js` (provisional NPC buyers), `game-server.js` (+ `prepareMonth`). 73 fast tests. **Next:** wire browser to the server (Firebase Auth in browser), scheduled month-close trigger, minimal defense, depth bands/rare ores.
- 25 Oct: emulator end-to-end test of the HTTP game API with real emulator-issued ID tokens (enroll → sell → upgrade → busy ship 409). 6 integration tests + 73 fast tests pass.
- 25 Oct: **Online client** (`online/`): Firebase sign-in (Google + email/password), invite-code join, enroll, 20 s polling with local ore extrapolation, sell / build / records tabs, bulk-buy modes. Verified in headless Chromium against the Auth + Firestore emulators and the real game server (sign up → wrong invite → join → sell 5 units for 200 → buy Max dig). Server additions: `world-admin.js` (invite-only join, month prepare + rollover + close), `/internal/tick` (shared-secret), `Dockerfile`, `backend/deploy.sh` (Cloud Run + Secret Manager + hourly Cloud Scheduler). **Next:** you run `deploy.sh` in Cloud Shell, set `API_BASE`, merge to `main`.
- 25 Oct (Q-10): NPC buyers unlimited; hauler auto-takeoff when full + `Launch now`/`setPolicy` on server and sandbox; plain-language unit glossary and hover tips in `/play/` and `/online/`; automatic takeoffs are ledgered at their own second and settle in committed batches (offline == live, T17-01); month close settles takeoffs before B. 79 fast + 9 emulator tests pass. `/play/` remains the default site; `/online/` is opt-in.
- 25 Oct: **Online mode inside the pixel game** (`play/online.js`): Firebase sign-in + invite join overlay, server view adapted into the renderer's state, optimistic local actions turned into server commands (diff of state), 15 s polling plus a poll at the predicted automatic takeoff, auto-takeoff toasts. Offline sandbox remains the default. Verified in headless Chromium against the emulators.

## Latest playable checkpoint · 26 October 2026

- ✅ Published pixel sandbox now includes real local refining, finite stock/loss accounting, NPC refined sales, station spot contracts, bounded hourly simulated offers, delayed infantry, reversible home incidents and validated Maker presentation.
- ✅ Heavy catch-up runs in a local browser worker; online passive reconciliation is 30 seconds with immediate command/return refresh and stale-response protection.
- ✅ Refineries have optional automatic NPC selling or own-station fill; existing saves default to manual output.
- 🟡 These industry/home-safety systems are local previews. Full CES, cross-owner industry, facility logistics/forward contracts, section 23 combat, comprehensive month certification and production cost evidence remain open. A and B are not accepted releases.
- Evidence: [Industry and responsive client](Industry-Release.md). The earlier checkboxes remain historical and must not be read as a claim that preview implementations satisfy every canonical acceptance test.
