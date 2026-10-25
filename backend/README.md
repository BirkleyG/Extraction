# Extraction Tycoon backend foundation

**Internal A1 milestone; not a deployed game server.** This package develops authoritative accounting independently from the preserved browser prototype. It has no third-party runtime dependencies and does not require Firebase credentials, an AI key or paid services for local tests.

## Local setup

1. Install Node.js 24.19.0 (the repository runtime pin).
2. From the repository root, run `cd backend` then `npm test`.
3. Tests use Node’s built-in test runner. There is no dependency install or database setup in this milestone.

The browser prototype still runs separately: from the repository root, run `python3 -m http.server 8000` and visit http://localhost:8000. The browser does not call this new library and its existing saves remain unchanged.

## Library API

`src/index.js` exports `MemoryLedgerRepository`, `LedgerCommandService`, `replayLedger` and `LedgerError`.

- Construct the service with a repository and trusted `{ starterGrantAmount }`. No production default is supplied.
- `grantStarter(command, context)`, `fundEscrow(command, context)` and `releaseEscrow(command, context)` accept `{ monthId, requestId, expectedVersion }`; escrow commands also require a positive integer `amount`.
- Trusted context is `{ auth: { uid }, activeMonthId, now }`. Use one repository per isolated world. Membership, open-month status and verified receipt time must come from the eventual server transport/world service.
- `wallet(ownerId, monthId, context)` returns only `ownerId`, `monthId`, `spendable`, `escrow`, `totalOwned` and `version`; cross-owner reads reject.
- Retrying the same request ID/action/amount returns the original wallet result. Expected version and receipt time are excluded from the retry fingerprint, so later state changes do not turn a successful retry into another operation. Use a fresh ID for a different action or amount.
- `snapshot()` and `reconcile()` are server/test diagnostics. `replayLedger(entries)` rebuilds balances and ignores identical duplicate entries while rejecting conflicting duplicate contents, malformed postings and unsupported reasons. It does not restore command receipts or versions into a running repository.

Only `START_GRANT`, `ESCROW_FUND` and `ESCROW_RELEASE` are implemented. External grant contra accounts are scoped per transaction, so unrelated wallets do not share an artificial account ceiling. All computed balances and wallet aggregates remain checked safe integers. Future multi-owner transactions must check every aggregate they compute.

Escrow here is an owner wallet subaccount only; it has no contract or shipment reservations yet. Do not connect the release command to committed purchasing budgets until reservation/obligation checks are implemented.

## Trust boundary

The command service is a server-side library. A future authenticated transport must verify identity and construct trusted context; a caller-provided user ID is not authentication. Never mount arbitrary JSON context or ledger posting methods as a public API. Grant amounts come from trusted configuration, not player requests. Test amounts are fixtures, not approved starting balances.

The current repository implementation is in memory. It provides serialized transactions and rollback for local invariant tests; **it is not durable, multi-process or crash-safe production storage**. Starting a fresh repository loses its records. Firebase transactions, rules and emulator integration remain separate work. No existing Firestore rules or deployed resources are changed here.

## Required before deployment

- Verified Firebase Auth identity, room/world membership and host roles, strict transport validation and abuse limits.
- Durable transaction adapter with immutable ledger/command IDs, version checks, atomic cross-owner inventory and funds/capacity reservations.
- Server scheduler, deterministic engine/checkpoints and resumable UTC closing.
- Client-read rules and intelligence-filtered projections tested against unauthorized direct access.
- Measured hosting/read/write/scheduler costs and a complete provider deployment guide. Production is not promised to fit a free tier.

See the [buildout plan](../docs/development/Buildout-Plan.md), [rulebook](../docs/rulebook/Extraction-Rulebook-v1.2.md) and [Questions for the Boss](../docs/development/Questions-for-the-Boss.md).
