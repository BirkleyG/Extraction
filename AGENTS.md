# Extraction Tycoon development

## Source of truth

- Read `docs/rulebook/Extraction-Rulebook-v1.2.md` and `docs/development/Buildout-Plan.md` before changing gameplay.
- Markdown is maintained; the accompanying v1.2 DOCX and calibration JSON are historical snapshots.
- Approved R rules are binding. C coefficients are provisional, not certified balance. Update the owning rule section and section 22 change log with every gameplay change.
- Track unresolved developmental decisions in `docs/development/Questions-for-the-Boss.md`; never silently turn a recommendation into an approved rule.

## Budget and ownership

- Use lighter coding models for bounded implementation tasks. The lead owns architecture, integration and acceptance.
- Default to one implementation agent at a time; add a bounded independent reviewer only where concurrency, security or accounting warrants it. Do not spawn recursive teams or repeat broad audits.
- Give each task explicit files, rule/test IDs and a stop condition. Return changed files, verification and remaining gaps.
- Do not enable paid services or paid runtime AI without an established spending ceiling.

## Delivery

- Preserve the legacy prototype and existing saves until the migration decision is recorded.
- Implement trusted commands, ledger, deterministic engine and scheduler before calling multiplayer authoritative.
- Clients render filtered read models; they cannot decide money, time, hidden truth, outcomes or admin permissions.
- Run relevant invariant/security/replay tests as those systems are added. Syntax checks alone are not release acceptance.
- Push feature branches and open reviewable pull requests. Never label incomplete milestones as released or claim arithmetic checks certify balance.
