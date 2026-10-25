# Playability work · 26 October 2026

**Goal:** make the mine enjoyable to watch and grow while retaining the legacy purple pixel interface. This is development work, not Release A acceptance.

## Recorded direction

The CEO supplied two files in chat: a pure sandbox economy module and a fluid pacing study. These are a different rebuild from the previously merged Claude branches. Engineering may integrate and tune the provisional sandbox profile, make routine judgment calls, test it, and save reviewable batches to GitHub without waiting for answers. Preserve the prototype, server balances, existing saves and the original visual character. The existing $2/month hosting budget remains the ceiling; this work does not require new billed resources or paid AI.

## Batches

| Batch | Scope | Status |
|---|---|---|
| 1 | Record the supplied economy profile and integration boundaries | Saved and merged in PR #12 |
| 2 | Shared sandbox arithmetic, three global upgrade ladders, short shipping cadence, pacing evidence and safe saves | Implemented; model and browser verification passed |
| 3 | Legacy UI polish, visible machine progression, first-session guidance, desktop/mobile browser tests | Implemented; model and browser verification passed |
| 4 | Bounded background settlement for the existing trusted scheduler, retry/invariant tests | Implemented; unit/regression and 10 real emulator tests passed; runtime not deployed |

The supplied study is a fluid approximation. Its milestone table cannot certify the discrete game, offline equality, full-month balance or multiplayer security. Compare it with the actual model and report limitations before adopting coefficients elsewhere.

## Publishing and recovery

Create small reviewable PRs and GitHub checkpoints as meaningful batches become ready. Publish the playable batch only after tests and browser checks pass. Keep online and sandbox economics clearly distinct. Do not deploy backend runtime changes without credentials and verification. Preserve earlier unfinished local work on its existing branch/worktree; it is not the new integration baseline.

## Checkpoints

- [PR #12](https://github.com/BirkleyG/Extraction/pull/12): direction and integration boundaries saved to GitHub.
- Worker checkpoint: 26 game-service/month-close/worker tests passed, plus HTTP authentication/dispatch checks. 10 real Auth/Firestore emulator tests passed, including duplicate background ticks across service instances. [PR #13](https://github.com/BirkleyG/Extraction/pull/13) saves this source batch; Cloud Run is not redeployed.

## Playable batch verification

- 25 sandbox/compatibility tests pass, including whole-crate paid departures, no arrival double-pay, failed-purchase atomicity, exact live/catch-up equality, safe prices, profile isolation, history archive conservation and reload.
- Actual-engine greedy study: first sale 100 coin at second one; second shaft affordable at second thirteen; 130,010 gross after one hour. Fluid study and its substantial intermediate/month target deviations are published alongside it. This is provisional local tuning.
- Browser checks passed at desktop 1440px and mobile 320/360/390/768px: tabs, upgrade purchases, automatic shipping, saved reload, 120-second offline recovery, map switch/pan/zoom, online signed-out overlay, explicit old-profile migration and downloaded backup, raw corrupt-save recovery (empty/occupied/failing storage), and history archive display. No unresolved browser errors or page overflow were found.
- Profile history retains 32 recent shipments and 64 recent ledger rows plus active commitments, with explicit archive totals. Exact eight-hour fresh-state catch-up measured 6.46 seconds on the development runner; actual browser batches yield to rendering. This measurement is not a production latency guarantee.
- Backend CI for PR #13 passed 86 tests and 10 Auth/Firestore emulator tests. The playable PR also regenerates both pacing evidence files in CI to detect drift.

**Remaining:** production deployment of the worker source requires Cloud Run credentials (not attached here). Full Release A defense/hazards, general durable event queue, complete month simulation/balance certification and production cost measurement remain open. Online economics are intentionally unchanged during this local tuning experiment.
