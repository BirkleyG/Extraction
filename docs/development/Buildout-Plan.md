# Extraction Tycoon — Buildout Plan

**Prepared: 25 October 2026 · A0 preparation complete · A1 in progress · Release A not accepted**

[Rulebook](../rulebook/Extraction-Rulebook-v1.2.md) · [Questions for the Boss](Questions-for-the-Boss.md)

## Product understanding

Extraction Tycoon is a competitive supply-chain game lasting one UTC calendar month. A Guild General lands a species on an alien planet, mines raw ore, ships to refineries, reinvests in independent upgrades and may expand into refineries, stations and outposts. Highest coin on hand, including escrow once, wins the closing snapshot. Assets and cargo do not count. The winner proposes the next planet; only listed all-time statistics and Hall of Fame persist.

**The engine owns outcomes.** Server simulation continues with zero connected players. Watching and offline progression must agree. Trade pays at departure through atomic funds/quantity/receiving-capacity reservations; arrival never pays again. Hidden market, threat and language truth remain server-only. AI narrates facts or proposes validated causes; it does not decide numeric outcomes. Home mines remain recoverable. There are exactly seven ores and no more than 30 shafts per mine. SP and evolutions reset each month.

## Repository baseline

Assessment source: rulebook branch `docs/rulebook-v1.2-download` at `c1551cc7ac4333eb6b77bb59c895c753618e944b`; prototype code matches `fb846d6b75462ead3998c70612979ed096bf3b9c`. Default branch is currently `claude/gallant-mayer-qls5b9`; `main` contains the same prototype commit. Do not assume the default branch is main.

| Area | Evidence in current source | Assessment against v1.2 |
|---|---|---|
| Browser game | `index.html`, `css/style.css`, `js/game.js` | Substantial mine/map visuals and playable local loop; reusable presentation, not accepted simulation. |
| Mining/upgrades | `game.js` NLV at line 109; throughput at 421; purchase helpers at 407–415 | Ten-shaft ceiling, legacy tiers, porter work and heuristic throughput diverge from sections 03/10. |
| Shipping | `launchShip` at 655, landing credit at 675 | Payment on return; no buyer-budget/capacity transaction or immutable ledger. Violates R-02. |
| Offline | `catchUp` at 1008 | 48-hour cap and 85% throughput approximation; separate live/offline paths. Violates R-01/R-09. |
| Trust | `backend.js` client SDK and `firestore.rules` | Owner can write full colony; authenticated clients can write shared world/locks. No trusted command service or private projections. |
| Month close | `checkRollover` at 1797, `resetForWorld` at 1795 | Client-run ranking/reset; no durable ordered close or obligation finalization. Month-only progression reset needs replacement. |
| Combat | live unit fights and offline abstract fights; `armyTab` at 1521 | Legacy health/damage system, not section 23 deterministic functional combat. |
| AI/translation | `askJSON` at 1662, `sendChat` at 1716 | Optional browser BYOK and client-held meanings; not the required private validated shared-content architecture. |
| Deployment | `SETUP.md`, `firebase.json`, empty `js/config.js` | Static prototype hosting/emulator configuration only. No production project credentials or trusted scheduler configured. |
| Verification | Existing calibration JSON | Arithmetic checks only; no automated runtime/invariant suite or seeded month harness found. |

Baseline verification performed: `node --check` passes for `js/game.js`, `js/backend.js`, and `js/config.js` using Node 24.19.0. Python 3.12.14 is available for tooling. **No browser playtest, emulator test, balance simulation or production deployment was performed.** No dependencies were installed and no paid resources enabled.

## Architecture proposal — provisional provider choice

Keep the static browser presentation and provisionally retain Firebase Auth/Firestore, under the CEO’s delegated platform choice, subject to a cost/transaction spike. Separate a pure deterministic engine, trusted command handlers, durable event workers and filtered read models. Use a current supported Node LTS runtime; pin its version with the first backend implementation. Browser rendering receives snapshots/events and submits commands, never authoritative balances or outcomes.

- A command includes authenticated actor, month, unique request ID, expected state version and validated payload. The server assigns authoritative receipt time. Reject injected outcomes, stale months and unauthorized ownership.
- A transaction commits ledger entries, balances, title/stock changes, reservations, shipment and scheduled event together. Deduplicate by immutable command/departure ID; derive caches from committed records.
- A durable worker advances one-second seeded simulation and ordered events in bounded batches with leases, compare-and-set checkpoints and replay-safe effects. Every private business advances without clients. Prove larger production steps equivalent before optimizing.
- Public/owner/intelligence-tier projections have explicit allowlisted fields. Keep secret seeds, true prices/threat and canonical language data out of client-readable records. Deny direct writes to authoritative state. Admin roles are server-verified, never inferred from `#admin`.
- Month closing is a resumable state machine implementing sections 02/17/18: reject old-month departures at B, process pre-B events, snapshot coin plus escrow once, finalize commitments without new payments, archive/burn/reset, then expose the next month. Finalize event priority ordering before implementation; record unresolved cases rather than invent gameplay.
- Use isolated emulator/test data. Do not apply production database rules, overwrite saves or provision billed services during preparation. Backend choice must prove transaction contention, restart recovery and scheduler costs before deployment.

## Release sequence and acceptance gates

Internal A milestones below are integration checkpoints. **Only complete Release A is a public release candidate.** Milestones do not waive section 21 or remove features from A.

| Milestone | Deliverable and bounded task | Required evidence / exit gate |
|---|---|---|
| A0 — Preparation | Audit, rulebook links/change log, CEO question tab, team workflow and dependency plan. | This document and reviewed repository evidence; syntax baseline. Complete, with decisions pending. |
| A1 — Authoritative foundation | Schema/contracts, pure deterministic engine, command authentication, atomic ledger, private projections, durable scheduler, emulator harness. First coding task: starter ledger + idempotent command transaction + replay tests; no rendering refactor in that task. | T18-01/02/08/09/10; T17-01/02/03; concurrent duplicate commands, zero clients and restart recovery. Prove authority and secrecy before wiring UI. |
| A2 — Mine-to-buyer loop | Seven-ore world, starter mine, independent upgrades/bulk buy, up to 30 shafts, storage/lift/fleet, NPC refinery offers/budgets, exact trip estimates and paid dispatch. | T03/T04/T05 and section 10 relevant tests; T18-03/11. Race last buyer coin and last storage slot; rejected dispatch mutates nothing; replay/arrival cannot pay twice. NPC accounting follows section 02; no heuristic income minting. |
| A3 — Complete Release A behavior | UTC closing, archive/statistics/leaderboard, home defense using section 23, filtered browser UI, records, visual inference and fallback news. Keep B/C behavior unavailable in authoritative A. | T17-05/06/07; T18-12; applicable T12/T23, T19-01/02/03, T20 and reset tests. B−1/B/B+1 ms, pre-B departure/post-B ETA, outage during every close phase; protected home and no hidden payload leaks. |
| A4 — Certification and private launch | Balance harness, migration/recovery drill, authorization review, full acceptance report and deployment runbook with measured cost. | Section 21 suite; seeded 28/29/30/31-day months with 3/10/30 players and idle/active/aggressive/passive/exploit profiles. Report target affordability, used-line levels, coin/escrow/liabilities/investment and strategy spread. Validate second seed, flag-off, rollback and performance against agreed C-07 budget. All unresolved launch blockers closed. |
| B — Industry and trade | Player refineries, stations/contracts, hidden faction demand, intelligence, endogenous economic events, player trade and routing before departure. | All A regressions plus T06–T09, relevant economic proposal validation and security tests. Resolve contract defaults/forfeiture and closing liability policy before forward contracts. C-02 solver failure must roll back or stay pending atomically. |
| C — Living world and Maker | Scouting/outposts/depletion, ecology, hazards, tribes/translation, campaigns, expanded military, nuking/SP/evolutions and Maker proposals. | T11/T13–T16, expanded T23, R-07/R-10, relevant T18/T19. Week-2 outpost calibration; translation payload secrecy/CAS; no repeat-SP farming; paid commitments survive nuke correctly; month scopes and home protection preserved. |

**Release status:** A1 accounting foundation is in progress; B and C remain blocked on prior releases. C-01–C-09 remain provisional. No elapsed-time promises or balance certification are implied by arithmetic prices.

## Agent organization and credit control

The lead owns rule interpretation, architecture, integration and release acceptance. Two bounded lighter-model agents completed the initial code/spec and dependency audits. Subsequent coding uses one lighter-model implementer per scoped task by default, with a separate focused review for money, concurrency, security and closing changes. No recursively spawned teams or duplicated full-repository reviews.

Each task specifies files owned, rule/test IDs, expected output, commands to verify and a stop condition. Agents return diffs, test evidence and remaining gaps. Integrate one task before issuing dependent work. Reuse the same agents/context where useful. The CEO uses Pro and requests conservative weekly usage; no numeric ceiling or remaining allowance is visible. Use one lighter coding agent at a time. Model selection alone does not guarantee a spend amount.

Calibration ownership: lead coordinates C-01 progression and C-02 economy; implementation agents build reusable seeded simulations; CEO decides design ambiguities, paid budgets and launch scope. Record evidence before proposing coefficient changes. Apply economic changes at month boundaries unless correcting an exploit.

## Operating and release checklist

1. Resolve only the decisions required by the next task; continue independent local work while others remain open.
2. Branch from the latest approved specification/code integration point. Update the owning rule sections, section 22 change log and relevant question answers with gameplay changes.
3. Run targeted tests, then the required integration/month suite for the release. Keep failed/untested requirements visible; never equate a green syntax check with gameplay acceptance.
4. Push a reviewable branch and PR. Preserve the historical prototype and archives. The CEO approved fresh saves with the prototype preserved (Q-03). Never migrate legacy browser balances into authoritative accounts.
5. Deploy only after provider/project, verified service costs within an authorized ceiling, credentials/roles and release gates are established. Measure zero-client progress, checkpoint recovery, scheduler lag, transaction retries, ledger reconciliation and read/write/AI costs. Keep engine-critical progress running if optional AI is disabled.
6. Publish patch notes, effective month, migration/rollback procedure and acceptance evidence. Regenerate the historical Word export only if a new export is requested; identify its revision clearly.

## Remaining specification work

- Define a complete same-timestamp event priority table within section 17 before the scheduler is finalized.
- Specify schemas and intelligence-tier projection allowlists in section 18; prove unauthorized API reads cannot reconstruct secrets.
- Quantify C-07 throughput, batch/checkpoint, retention and recovery targets from the chosen host workload; proposed values require evidence.
- Before B contracts, resolve outstanding liability discharge/default/forfeiture details in section 02 consistently with sections 07/17. No old debt may silently become new-month debt.
- Define feature-flag behavior for in-flight obligations: disable new actions while preserving required settlement and archives; prove compatibility with monthly reset and rollback.

## CEO direction · 25 October 2026

Conserve Pro weekly usage with small tasks and one lighter coding agent at a time. The platform is delegated to engineering, with free operation preferred and a complete setup README required. Retain Firebase provisionally, but verify whether scheduled trusted workers require billing; do not promise free production authority. Fresh authoritative saves are approved; preserve the legacy prototype and existing save keys. Paid infrastructure remains unauthorized.

## A1 progress · 25 October 2026

First implementation slice complete: dependency-free server-side accounting and idempotent wallet commands, with a serialized in-memory transaction adapter for local verification. The prototype remains unchanged. This is partial A1 progress: durable Firebase storage, verified transport identity, scheduler, production and commercial settlement are not yet implemented. Initial launch audience is approved as a private friends test for up to 10 players; section 21 simulation populations remain unchanged.

Verification for the first A1 slice: 17 automated tests pass locally, including command retry/conflicts, owner/month isolation, exact escrow conservation, safe-input rejection, serialized concurrency, replay validation, rollback, immutable snapshots and ID edge cases. Browser script syntax and documentation links also pass. Next task: durable transactional storage and verified authentication integration, followed by deterministic engine/scheduler work. No deployed security or crash-recovery claim is made.
