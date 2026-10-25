# Questions for the Boss

**Updated: 25 October 2026 · Status: initial CEO answers recorded; remaining questions open**

[Rulebook](../rulebook/Extraction-Rulebook-v1.2.md) · [Buildout Plan](Buildout-Plan.md)

This is the development questions tab. Approved R-01–R-10 decisions remain in force. Recommendations below are not approved gameplay rules. Record answers and their date here, then update the owning specification and section 00 register if gameplay changes.

| ID | Decision needed | Recommendation | Blocks | Answer |
|---|---|---|---|---|
| Q-01 | Development credit ceiling per release, and acceptable hosting spend? | One bounded lighter coding agent at a time; targeted review at integration. Do not enable paid infrastructure until a cost ceiling is known. | Paid deployment; local planning and implementation continue. | CEO uses Pro and wants to conserve weekly allowance. No numeric ceiling known. Use one lighter coding agent at a time; allowance/rate limits are not visible to this team. No paid infrastructure authorized. |
| Q-02 | Keep Firebase for trusted backend, or choose another platform? | Retain Firebase Auth/Firestore provisionally; add trusted command handlers and scheduled workers. Confirm billing/scheduler availability before choosing deployment services. | Deployment service/cost verification. | CEO delegates provider choice, knows Firebase and prefers free operation where feasible; requires setup README. Firebase is the provisional engineering choice, subject to trusted worker/scheduler capability and verified costs. |
| Q-03 | Fresh authoritative saves or migration of existing progress? | Preserve the legacy prototype and start fresh at a month boundary. Never silently overwrite existing browser saves or shared rooms. | Launch implementation. | APPROVED: fresh saves; preserve prototype. No migration of legacy progress into authoritative balances. |
| Q-04 | Private friend-group test first, or public competitive launch? | Private test first; retain secure server authority from the beginning. Confirm initial player count and expected concurrency. | Hosting capacity and release test workload. | APPROVED: private friends test, up to 10 players. Section 21’s larger simulation populations remain required acceptance coverage. |
| Q-05 | Is the rulebook’s $2–3 monthly AI cap per world or per account (C-08)? | Per world, centrally enforced; begin with deterministic templates and AI disabled. Development credits are a separate budget. | Paid AI integration in A/C; engine work continues. | Pending |
| Q-06 | Who is the initial host/admin, and which Firebase project/region should production use? | Use isolated development/emulator resources; grant host actions through server authorization. A URL hash must never grant authority. | Production credentials, roles and deployment. | Pending |

## Hosting checkpoint · 25 October 2026

**Q-07 — Deployment route (answered):** Firebase Cloud Functions deployment requires a Blaze project. Local Auth/Firestore emulators remain available without enabling billing. Choose local-only development until a demo, a billing-enabled Firebase project with a budget agreed before deployment, or an existing always-on server. **CEO answer:** plan for Firebase Blaze with a small budget to agree before deployment. Provider direction is approved; no numeric spending ceiling, production project or paid deployment is authorized yet.

Sources checked: [Functions getting started](https://firebase.google.com/docs/functions/get-started) and [Scheduled functions](https://firebase.google.com/docs/functions/schedule-functions). Scheduler currently lists $0.10 per job/month with three jobs per Google account at no charge; function, database and network usage have separate pricing. These allowances do not establish a zero-cost production guarantee.

## Answer history

- 25 October 2026: CEO answered Q-01–Q-03 in chat. No numeric Pro allowance is known; platform selection delegated with setup documentation required; fresh saves approved and prototype preserved.
- Authorization to organize agents, prepare the buildout, update documentation and push changes to GitHub is supplied in the task; it is not a pending question.

- 25 October 2026: CEO answered Q-04: private friends test, up to 10 players.

- 25 October 2026: CEO answered Q-07: Firebase Blaze, with a small budget to agree before deployment. Continue emulator development; do not enable billing or deploy yet.
