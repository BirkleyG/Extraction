# One online Extraction Tycoon · 27 October 2026

**CEO direction:** one game at the root URL, online, retaining the legacy pixel feel and the newer features. Earlier separate entry points are superseded, not offered as modes.

## Deployment order

1. Deploy the shared-engine server first. `/v1/worlds/:world/game` owns progress, commands, receipts and immutable ledger checkpoints. Existing private Firebase membership/invites remain in force. Earlier saves are preserved in their original namespaces; no untrusted local wallet is imported.
2. Verify the deployed canonical endpoint and authenticated emulator/browser loop.
3. Publish the actual pixel game at `/`. Old `/play/`, `/online/` and `/prototype/` URLs redirect to `/`, discard old mode choices, and never start another economy. Remove version switches, developer grants, fast-forward and local resets from the product.

## One engine and save

`backend/src/gameplay/` is the shared pure model. The trusted server advances it and applies allowed commands atomically; the browser predicts the same mine for smooth rendering and reconciles about every 30 seconds. Industry, home safety and Maker dispatches use authenticated server commands. Connection failure/catch-up is explicit; no silent offline game is started. Existing save exports remain available for recovery without migrating their coin.

Both state and logical ledger rows are checked. Each immutable checkpoint batch retains individually hashed entries, lowering Firestore writes versus a document per fast ship trip. Monthly snapshots/burn/reset use server UTC, finalize paid cargo without paying twice and preserve archived history. Equal starts use one world/month seed; mutable owner records remain separate.

## Acceptance and limits

Verification includes authentication, membership revocation, duplicated/lost requests, injected coin/time rejection, live-vs-catch-up, industry/escrow/contracts, saved factual Maker prose, hashed ledger collision rollback, monthly paid-delivery finalization and one-time burn, existing-save preservation and old-link redirects. Full CES equilibrium, full combat and global competitive ranking remain unaccepted features; this rollout unifies the current feature set, not a claim of complete Release A/B.

Backend tests and emulator verification precede publication. The root client must not be published against a missing canonical endpoint. If cloud deployment credentials/configuration are unavailable, keep the frontend reviewable and report the exact setup dependency rather than labeling a local fallback online.

## Verified client and deployment checkpoint

- PR #22 merged the shared-engine backend and deployment workflow. **165 backend tests and 15 Auth/Firestore emulator tests passed.** Immutable batch-ledger collisions, duplicate commands, revocation, industry/escrow, factual Maker validation, month snapshot/finalization/burn/reset and scheduler catch-up are covered.
- **78 browser-model/transport/entry tests pass.** Strict-TLS Chromium on real Auth/Firestore emulators verified sign-up/invite/root play, fast upgrade persistence, refinery automatic sales, station stock and exact paid spot completion, delayed troop arrival, saved Maker text, 390px layout and prior local-save preservation. An old offline preference/fake saved wallet was ignored. All three old URL paths redirect to root and discard mode parameters.
- Production deployment run `40507303725` stopped at Google authentication: required Workload Identity inputs were empty. The workspace cannot configure Google Cloud or read/write repository variables. The root client must remain unmerged until the existing service receives the canonical endpoint. See [deployment setup](Deploy-Guide.md).
- No paid AI requests or live test accounts were created. Historical prototype HTML is stored as inert text in `docs/archive/`; old device and server records remain untouched.
