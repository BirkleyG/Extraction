# Claude branch integration · 26 October 2026

Integration baseline: published main `67f53f6` (industry automation). Preserve prototype, existing saves, Industry/Colony, 30-second reconciliation, worker catch-up and recovery safety.

| Source | Integration |
|---|---|
| `claude/a1-durable-queue` at `3ae1eb6` | Combined durable fenced event queue, per-site worker, scheduler wiring and both memory/emulator test suites. |
| `claude/a2-mine-to-buyer` at `dca73c0` (PR #18) | Combined server fleet/pads, ship policies, soil/weather, finite veins, premium/dock market, owner projection and acceptance tests. Preserved both A1 and A2 test scripts. |
| `claude/loving-ride-nnjvr0` at `b85f379` | Ported faster sandbox costs 34/45/39 and growth 1.75, stage-flow summary and route earning estimates. Existing three-line engine already implements the starter hold/speed and tiers. Did not replace current model/app wholesale, discard newer systems, bump save schema or remove recovery/worker/online features. |

## Integration fixes and verification

The server production kernel now has its own ore/vein switching. The local wrapper must explicitly identify the ore it chose; otherwise a rare vein depletes in local metadata while producing no rare ore. Fixed this without weakening the rare-ore regression. Remote prediction uses the server-embedded vein state, maps nested ore IDs and accepts unassigned hired workers. Dynamic server destination IDs remain valid in shipment records and Records names. Mixed cargo retains its per-ore lines and is labeled as mixed in Records rather than misreporting the whole shipment as its first ore. The new fleet panel uses server quotes and per-ship commands, with local countdown rendering between reconciliations.

Added browser controls for ships, pads, automatic takeoff and best/nearest/fixed routes. Old deployed servers retain the original single-hauler UI when fleet fields are absent. The new backend owner schema is **version 2, fresh worlds/accounts only**; existing production runtime is not deployed or migrated by this work. Stage it separately or at the approved month boundary before changing the live backend.

Verification so far: **70 browser-model/UI tests, 155 backend tests and 14 real Auth/Firestore emulator tests pass**. Emulator coverage includes fenced queue recovery, premium last-coin/last-slot races, rejected dispatch atomicity and duplicate settlement. Removed an exact-stock HTTP test's real-clock race by injecting a fixed test clock. Production calibration artifacts regenerate unchanged.

An actual A2 owner projection was adapted and rendered in headless Chromium at 390px, with per-ship policy commands and no JavaScript errors or page overflow. This is a browser bridge test using an in-memory service fixture; real authentication/Firestore coverage is supplied separately by the emulator suite. Production runtime remains unchanged.

## Provisional decisions

CEO approved the faster sandbox progression and prioritizing fun. The market answer is deterministic supply/demand using CES utility functions and bid offers. The current A2 fixed-tier premium and token bucket are temporary fixtures, not the approved market model or an approved amendment to Q-10. Ship price, surplus-worker/hardness interpretation and cross-owner fairness questions remain in Questions for the Boss.

With the faster profile, the exact scripted engine earns 728,507 at hour one (old profile: 130,010). Full fluid/exact evidence is regenerated in `play/sim/`; fluid and discrete results differ substantially and are not full-month balance certification. More affordable refinery entry is intentional for this local playability experiment.
