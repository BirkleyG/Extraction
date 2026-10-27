# Extraction Tycoon development

## Source of truth

- Read `docs/rulebook/Extraction-Rulebook-v1.2.md` and `docs/development/Buildout-Plan.md` before changing gameplay.
- Markdown is maintained; the accompanying v1.2 DOCX and calibration JSON are historical snapshots.
- Approved R rules are binding. C coefficients are provisional, not certified balance. Update the owning rule section and section 22 change log with every gameplay change.
- Track unresolved developmental decisions in `docs/development/Questions-for-the-Boss.md`; never silently turn a recommendation into an approved rule.

## Budget and ownership

- Use lighter coding models for bounded implementation tasks. The lead owns architecture, integration and acceptance.
- The CEO authorizes faster parallel work: use a small group of lighter-model agents for independent implementation, focused review and browser QA. Give each agent distinct file ownership; do not spawn recursive teams or duplicate broad audits. Prefer bounded tasks and reuse existing agents/context.
- Give each task explicit files, rule/test IDs and a stop condition. Return changed files, verification and remaining gaps.
- Do not enable paid services or paid runtime AI without an established spending ceiling.

## Delivery

- Preserve the legacy prototype and existing saves until the migration decision is recorded.
- Implement trusted commands, ledger, deterministic engine and scheduler before calling multiplayer authoritative.
- Clients render filtered read models; they cannot decide money, time, hidden truth, outcomes or admin permissions.
- Run relevant invariant/security/replay tests as those systems are added. Syntax checks alone are not release acceptance.
- Push feature branches and open reviewable pull requests. Never label incomplete milestones as released or claim arithmetic checks certify balance.

## One online game and publishing

- GitHub Pages publishes `main`, root. The product runs at `/`; `/play/`, `/online/` and `/prototype/` redirect there. Do not reintroduce mode/version selectors or a browser-only economy.
- Preserve the original pixel presentation. Shared pure gameplay lives in `backend/src/gameplay/`; browser import wrappers re-export it. Trusted canonical commands persist progress; local simulation is prediction, never an uploaded wallet.
- Preserve older save keys and server namespaces for recovery without silently migrating untrusted money. Historical prototype source is an inert archive, not another playable entry point.
- Deploy and verify the canonical backend before publishing a root client that requires it. Never hide missing backend support behind an offline fallback. The existing private Firebase/Cloud Run budget remains binding.
- Validate authenticated browser play, industry/colony/Maker persistence, old-link redirects, connection failure and mobile layout. Push reviewable PRs; incomplete CES/combat/ranking gates remain explicit.
