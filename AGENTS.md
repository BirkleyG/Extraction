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

## Playable publishing

- GitHub Pages publishes `main`, root. Development/specification branch merges alone do not update the live game.
- Keep `/play/` runnable as the local browser test harness and preserve `/prototype/` with legacy save keys. State clearly that the sandbox is single-player/local and not the authoritative multiplayer release.
- Validate the actual browser loop and publish reviewed playable changes when the user asks to play; do not deliver only backend PRs in response.
