# Extraction Tycoon backend foundation

**Internal A1 milestone; not a deployed game server.** This package develops authoritative accounting independently from the preserved browser prototype. It uses the Firebase Admin SDK and does not require production Firebase credentials, an AI key or paid services for local emulator tests. Production deployment is separate.

## Local setup

1. Install Node.js 24.19.0 (the repository runtime pin) and Java 21 for the Firestore emulator.
2. From the repository root, run `cd backend` and `npm ci` to install locked dependencies.
3. Run `npm test` for fast accounting/HTTP tests.
4. Run `npm run test:integration` for the real local Auth/Firestore emulator suite.
5. Run `npm run demo` for a complete local authenticated grant → escrow → retry demonstration. It prints HTTP statuses and wallet totals, never the token. The 100-coin grant is a test fixture, not an approved gameplay default.

The emulator commands use the isolated `backend/firebase.json`, project `demo-extraction`, Auth on port 9099 and Firestore on 8080. They stop their emulators afterward. They require loopback endpoints and a demo project and do not read/write a production database. Initial emulator downloads need internet access. A metadata lookup warning can appear in this sandbox while all local tests still pass.

The browser prototype still runs separately: from the repository root, run `python3 -m http.server 8000` and visit http://localhost:8000. The browser does not call this new library and its existing saves remain unchanged.

## Library API

`src/index.js` exports `MemoryLedgerRepository`, `LedgerCommandService`, `replayLedger` and `LedgerError`.

- Construct the service with a repository and trusted `{ starterGrantAmount }`. No production default is supplied.
- `grantStarter(command, context)`, `fundEscrow(command, context)` and `releaseEscrow(command, context)` accept `{ monthId, requestId, expectedVersion }`; escrow commands also require a positive integer `amount`.
- Trusted context is `{ auth: { uid }, activeMonthId, now }`. The memory repository is isolated per world; the Firestore adapter uses the trusted world context to select its namespace. The transport assigns verified receipt time; the Firestore transaction validates current membership/month/status.
- `wallet(ownerId, monthId, context)` returns only `ownerId`, `monthId`, `spendable`, `escrow`, `totalOwned` and `version`; cross-owner reads reject.
- Retrying the same request ID/action/amount returns the original wallet result. Expected version and receipt time are excluded from the retry fingerprint, so later state changes do not turn a successful retry into another operation. Use a fresh ID for a different action or amount.
- `snapshot()` and `reconcile()` are server/test diagnostics. `replayLedger(entries)` rebuilds balances and ignores identical duplicate entries while rejecting conflicting duplicate contents, malformed postings and unsupported reasons. It does not restore command receipts or versions into a running repository.

Only `START_GRANT`, `ESCROW_FUND` and `ESCROW_RELEASE` are implemented. External grant contra accounts are scoped per transaction, so unrelated wallets do not share an artificial account ceiling. All computed balances and wallet aggregates remain checked safe integers. Future multi-owner transactions must check every aggregate they compute.

Escrow here is an owner wallet subaccount only; it has no contract or shipment reservations yet. Do not connect the release command to committed purchasing budgets until reservation/obligation checks are implemented.

## Trust boundary

The HTTP transport verifies Firebase ID tokens through the Admin SDK with revocation/disabled-user checking, then constructs trusted UID, world and clock context. A caller-provided user ID is never authentication. Never mount arbitrary JSON context or ledger posting methods as a public API. Grant amounts come from trusted configuration, not player requests. Test amounts are fixtures, not approved starting balances.

`MemoryLedgerRepository` remains process-local for fast tests. `FirestoreLedgerRepository` persists bounded owner/month account, version, receipt, grant-marker and ledger documents atomically in Firestore transactions. It never loads the complete world ledger for each command. Fresh service instances read the same records and recover idempotent receipts. Tests prove service recreation and transaction contention, not disaster recovery or arbitrary corruption repair.

World status, current UTC month and membership are reread inside every transaction attempt. Closed worlds, stale months and revoked memberships reject, including retries. Historical command receipt lookup after month close is not implemented. Stored malformed balances/receipts fail closed. The raw Firestore paths under `worlds/` are server-only; `backend/firestore.rules` denies all direct client reads/writes, including authenticated clients. Do not replace the legacy prototype’s rules with this isolated development rules file.

## Required before deployment

- Production project/credentials and HTTPS hosting, enrollment/host administration and abuse limits. Verified identity, membership guards and bounded JSON transport are implemented and emulator-tested; production configuration is not deployed.
- Cross-owner commercial transactions, inventory/capacity reservations and committed escrow checks. The current durable adapter supports only owner-wallet transactions.
- Server scheduler, deterministic engine/checkpoints and resumable UTC closing.
- Broader intelligence-filtered gameplay projections. Current wallet fields and direct database denial are emulator-tested; no market/threat/translation API exists yet.
- Measured hosting/read/write/scheduler costs and a complete provider deployment guide. Production is not promised to fit a free tier.

See the [buildout plan](../docs/development/Buildout-Plan.md), [rulebook](../docs/rulebook/Extraction-Rulebook-v1.2.md) and [Questions for the Boss](../docs/development/Questions-for-the-Boss.md).

## Run the local API manually

From `backend/`, start the isolated emulators in terminal 1:

```sh
npx firebase emulators:start --project demo-extraction --only auth,firestore
```

In terminal 2, set these values for this local development session:

```sh
export FIREBASE_PROJECT_ID=demo-extraction
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export STARTER_GRANT_AMOUNT=100
npm start
```

The API listens on `127.0.0.1:8787` by default. `STARTER_GRANT_AMOUNT=100` is only an explicit local fixture; there is no production default. Use `PORT` to change the API port. All commands require `Authorization: Bearer <Firebase ID token>` and JSON content type. Production requires TLS termination and configured Application Default Credentials; do not expose the plain local listener publicly.

| Route | Body / behavior |
|---|---|
| `GET /v1/worlds/<world>/wallet` | Current authenticated member’s wallet; no owner parameter. |
| `POST /v1/worlds/<world>/grant` | `requestId`, `expectedVersion`, optional `monthId`; server-configured grant only. |
| `POST /v1/worlds/<world>/fund` | Same fields plus positive whole-coin `amount`. |
| `POST /v1/worlds/<world>/release` | Same fields plus positive whole-coin `amount`. |

The server derives the current UTC month when omitted and validates any supplied month. Extra authoritative fields reject. Request bodies are limited to 8192 bytes. Invalid identity returns 401; nonmembership 403; command conflicts 409; unexpected internal failures return a generic response. No browser CORS access is enabled; frontend integration is future work.

A user must exist in the Auth emulator and have server-provisioned world membership. To create the first local world for a known emulator UID, run in a terminal with the emulator environment above:

```sh
npm run bootstrap:world -- friends-world <emulator-uid> <current-UTC-YYYY-MM>
```

Bootstrap is Admin-only and emulator-only; it refuses to overwrite an existing world. This milestone has no public enrollment or admin endpoint. The runnable demo automates local user/world creation when a manual token flow is unnecessary.

## Production hosting decision

The CEO selected Firebase Blaze in principle, with a small budget to agree before deployment. **No numeric spending ceiling, production project, billing activation or deployment is authorized yet.** Firebase Functions deployment requires Blaze; local emulation does not. See [official setup](https://firebase.google.com/docs/functions/get-started) and [scheduled-function pricing](https://firebase.google.com/docs/functions/schedule-functions). Free allowances are not a zero-cost guarantee. This branch contains a local API, not a Functions deployment package.

## Deterministic event kernel

`src/events.js` exports `createEventState`, `runEventBatch`, `createStepRng` and `EventKernelError`. This is a pure server-side foundation, not an automatic scheduler or a mining simulation.

- `createEventState({ monthId, seed, data, pendingEvents, ... })` creates a validated immutable version-1 checkpoint. It contains a processed-event fingerprint journal, the last ordering cursor and RNG draw cursors.
- Events have exactly `id`, `monthId`, `atMs`, `priority`, `type`, `siteId` and JSON `payload`. Priorities are explicit caller inputs: this module does not invent a cross-system priority table.
- `runEventBatch({ state, handlers, maxEvents, beforeMs })` applies at most the requested number of pending records with `atMs < beforeMs`, ordered by timestamp, priority and deterministic code-unit ID. The horizon cannot exceed that month’s UTC boundary. Same-month obligations with later ETAs stay pending for the future closing process; the kernel never carries their inventory into a new month.
- Synchronous trusted handlers receive an isolated data copy, an immutable event and RNG. They must use only those inputs; they must not read wall time, call external APIs or write to a database. Returned JSON data becomes the new checkpoint. Any failure returns no partial batch and leaves the caller’s inputs unchanged.
- RNG is versioned and keyed by world seed, site, absolute one-second step and draw index. Draw cursors preserve the sequence across batch boundaries and multiple events in the same second.
- Exact duplicate events do nothing; conflicting duplicates, late new events, unknown handlers, invalid JSON, unsupported schema versions and unsafe timestamps fail closed. Never send the checkpoint’s seed or private data to a client.

**Scope limits:** fixture tests demonstrate deterministic ordering/chunking with 600 explicit one-second events. They do not certify actual production, live/offline economic equivalence, zero-client scheduling or month closing. The kernel does not generate production ticks automatically. Event application is budgeted, but checkpoint validation still scans the pending queue/journal; this representation is not a certified large-world storage layout. Do not store a month’s full queue/journal in one Firestore document. A durable paginated queue, atomic checkpoint/effect commit and measured retention/performance limits remain to implement.

## Production calibration study

Run `npm run calibrate:production` from `backend/` to regenerate the committed [Markdown study](../docs/development/calibration/Production-Calibration.md) and [JSON evidence](../docs/development/calibration/Production-Calibration.json). CI checks that regeneration matches the committed reports.

`src/production.js` exports `shaftRatePerMinute`, `liftRatePerMinute`, `createProductionState`, `tickProductionSecond`, `advanceProductionSeconds`, `withdrawSurfaceUnits` and `ProductionError`. Inputs are explicit study configurations; there is no universal default profile. The one-second fixture order is dig → lift by ascending shaft number → synthetic drain by ore ID. That order is a reproducible study convention, not a finalized gameplay scheduling/allocation policy. Catch-up returns all remaining seconds beyond its step budget.

The CEO authorized provisional C-01 tuning. Candidate **C01-LIFT-02** uses lift throughput `2 × 1.0316^L` for the next pipeline benchmark, with existing cap/cost unchanged. It passes the stated neutral, seeded and analytical-envelope rate comparisons; growth 1.0311 passes only the neutral one. The study envelope is not a weather/world limit. See rulebook section 10 for the named inputs and limitations.

This flow model cannot dispatch shipments, create money or change a player’s live colony. Habitat pools, automatic worker assignment, depletion, hazards, loading/fleet behavior, buyer budgets, prices, upgrade purchases and economic balance are still separate work. Floating ore quantities are checked with a documented numerical tolerance; coin accounting remains exact. The month-length rows execute only 60 preview ticks and retain the remaining duration; they are not completed month simulations.

The browser sandbox uses `withdrawSurfaceUnits` for real surface-to-ship transfers, preserving cumulative production and recording external transfers separately from the synthetic study drain. Long-running ore fixtures use an accumulated-operation roundoff bound; exact coin settlement never uses that allowance.

## Game server (A2/A3 slice)

`src/game-server.js` serves the mine → NPC buyer loop:

- `GET  /v1/worlds/:world/state` – filtered owner read model (allowlisted fields only).
- `POST /v1/worlds/:world/commands/{enroll|buyUpgrade|hire|buyShaft|dispatch}` – JSON commands with `requestId` + `expectedVersion`. The server sets the month and clock; unknown fields are rejected.

Run against the local emulators (never production): start Auth/Firestore emulators, create the world and owner membership documents with `npm run bootstrap:world -- <world> <uid> <YYYY-MM>`, then `WORLD_ID=<world> npm run start:game` with the same emulator environment variables as the ledger server. Closing a month is `new MonthCloser(repository).close({ worldId, monthId, nowMs })` after the boundary (a scheduled trigger is still to be wired; see the build checklist). NPC bids/budgets in `src/npc.js` are provisional (C-02).

## Scheduled progress checkpoint · 26 October 2026

`POST /internal/tick` now runs `WorldAdmin.tick`: prepare/close months, read the current month's enrolled roster, then persist one bounded automatic-shipping settlement transaction per owner (up to 10). Each owner checkpoint and its payments commit together. Retries and concurrent ticks cannot pay the same departure twice. Partial or failed owners return `done: false` and resume from their last committed checkpoint on a later tick; other owners can still advance. No collection scan or per-player scheduler job is added. The internal shared-secret header remains required.

The existing hourly scheduler can invoke this path after the updated backend is deployed. **Committing this code does not update Cloud Run.** This session does not provision infrastructure or deploy the runtime. Month-close processing retains its existing workload and still needs production timeout/cost measurement; this is not a general durable event queue or Release A certification.
