# Questions for the Boss

**Updated: 25 October 2026 · Status: initial CEO answers recorded; remaining questions open**

[Rulebook](../rulebook/Extraction-Rulebook-v1.2.md) · [Buildout Plan](Buildout-Plan.md)

This is the development questions tab. Approved R-01–R-10 decisions remain in force. Recommendations below are not approved gameplay rules. Record answers and their date here, then update the owning specification and section 00 register if gameplay changes.

| ID | Decision needed | Recommendation | Blocks | Answer |
|---|---|---|---|---|
| Q-01 | Development credit ceiling per release, and acceptable hosting spend? | One bounded lighter coding agent at a time; targeted review at integration. Do not enable paid infrastructure until a cost ceiling is known. | Paid deployment; local planning and implementation continue. | CEO uses Pro and wants to conserve weekly allowance. No numeric ceiling known. Updated direction: use a small parallel group of lighter-model agents to deliver faster; allowance/rate limits are not visible to this team. No paid infrastructure authorized. |
| Q-02 | Keep Firebase for trusted backend, or choose another platform? | Retain Firebase Auth/Firestore provisionally; add trusted command handlers and scheduled workers. Confirm billing/scheduler availability before choosing deployment services. | Deployment service/cost verification. | CEO delegates provider choice, knows Firebase and prefers free operation where feasible; requires setup README. Firebase is the provisional engineering choice, subject to trusted worker/scheduler capability and verified costs. |
| Q-03 | Fresh authoritative saves or migration of existing progress? | Preserve the legacy prototype and start fresh at a month boundary. Never silently overwrite existing browser saves or shared rooms. | Launch implementation. | APPROVED: fresh saves; preserve prototype. No migration of legacy progress into authoritative balances. |
| Q-04 | Private friend-group test first, or public competitive launch? | Private test first; retain secure server authority from the beginning. Confirm initial player count and expected concurrency. | Hosting capacity and release test workload. | APPROVED: private friends test, up to 10 players. Section 21’s larger simulation populations remain required acceptance coverage. |
| Q-05 | Is the rulebook’s $2–3 monthly AI cap per world or per account (C-08)? | Per world, centrally enforced; begin with deterministic templates and AI disabled. Development credits are a separate budget. | Paid AI integration in A/C; engine work continues. | Pending |
| Q-06 | Who is the initial host/admin, and which Firebase project/region should production use? | Use isolated development/emulator resources; grant host actions through server authorization. A URL hash must never grant authority. | Production credentials, roles and deployment. | Pending |

## Hosting checkpoint · 25 October 2026

**Q-07 — Deployment route (answered):** Firebase Cloud Functions deployment requires a Blaze project. Local Auth/Firestore emulators remain available without enabling billing. Choose local-only development until a demo, a billing-enabled Firebase project with a budget agreed before deployment, or an existing always-on server. **CEO answer:** plan for Firebase Blaze with a small budget to agree before deployment. Provider direction is approved; no numeric spending ceiling, production project or paid deployment is authorized yet.

Sources checked: [Functions getting started](https://firebase.google.com/docs/functions/get-started) and [Scheduled functions](https://firebase.google.com/docs/functions/schedule-functions). Scheduler currently lists $0.10 per job/month with three jobs per Google account at no charge; function, database and network usage have separate pricing. These allowances do not establish a zero-cost production guarantee.

## Production calibration checkpoint · 25 October 2026

**Q-08 — Calibration authority (answered):** **APPROVED: tune provisional values and report evidence.** Engineering may revise provisional C-01 rate formulas and missing production base values through simulations, document every adopted change in the owning rule sections, and report results. Approved caps, accounting and gameplay principles remain binding. This authorizes calibration work, not an automatic balance-certification claim.

**Evidence:** sections 03/10 give shaft base output a factor of 2.2 per deeper shaft, so shaft 30 has about 8.52 billion times shaft 1’s base. A capped linear lift line multiplies its starting rate by only `1 + 0.04 × 1000 = 41`. For a balanced maximum mine with the same workers/modifiers per shaft, lift base throughput would need to be very large compared with early mine output. This conflicts with the intended useful early lift progression and late balanced-lift target. A fixed base value alone cannot resolve the progression shape. Actual balanced-max calculations and seeded affordability tests are still required. Every experimental profile and adopted coefficient must be named and documented; the CEO approval does not make untested coefficients certified balance.

## Sandbox veins checkpoint · 25 October 2026

**Q-09 — Vein tuning (open):** The `/play/` sandbox now follows section 04 with provisional C-03 values: rare vein size 900 (mythic 3000) times richness 0.6-1.5 and a depth factor, a guaranteed rare vein at shaft 3, pick hardness by tier, and no proportional taper below 5 percent yet. **Recommendation:** treat all of these as fixtures until the economy calibration run (document 10), then tune against the 4-hour to 2-day rare-vein lifetime target. **Answer:** Pending.

## Answer history

- 25 October 2026: CEO answered Q-01–Q-03 in chat. No numeric Pro allowance is known; platform selection delegated with setup documentation required; fresh saves approved and prototype preserved.
- Authorization to organize agents, prepare the buildout, update documentation and push changes to GitHub is supplied in the task; it is not a pending question.

- 25 October 2026: CEO answered Q-04: private friends test, up to 10 players.

- 25 October 2026: CEO answered Q-07: Firebase Blaze, with a small budget to agree before deployment. Continue emulator development; do not enable billing or deploy yet.

- 25 October 2026: CEO answered Q-08: “Yes—tune provisional values and report evidence.” C-01 calibration work is authorized within approved caps/accounting/principles.

- 25 October 2026: CEO authorizes more parallel subagents for faster progress, using cheaper models where practical. Separate implementation, focused model review and browser QA; avoid duplicate broad work.

- 25 October 2026: CEO answered Phase 0 (see Build-Checklist): starting coin 0; catch-up grant 20% of median cumulative earnings; ore in whole units; hosting budget $2/month on Firebase Blaze (US East); engineering may tune missing coefficients; Pages branch is main; AI budget Q-05 deferred. Event priority table delegated to engineering (recorded in checklist; to be copied into section 17 when implemented).

- 25 October 2026 — **Q-10 (answered, CEO):** computer-run raw-ore buyers have **no coin budget and no receiving limit**; they spend without limit at their fixed bid. Hauler behavior: it **takes off automatically when the hold is full**, and a **"Launch now" button forces takeoff**. Units must be explained in plain language with hover tips. Online play stays opt-in at `/online/`; `/play/` remains the default.

## Autonomous playability session · 26 October 2026

**CEO direction:** integrate the two supplied economy/pacing files, retain the legacy game's feel, use judgment, test playability and save frequent GitHub PRs. The CEO is unavailable during this session: do not block routine development on questions. Keep unresolved future design choices recorded as provisional; no new paid services or paid AI are needed.

## Industry and browser-runtime direction · 26 October 2026

The CEO asks for refineries, stations, global economies, all Release A features, responsive browser execution, approximately 30-second state polling, playtesting and connected dynamic AI. Engineering is implementing this in reviewable slices without blocking on questions. Local industry/home-safety previews and browser simulation are permitted; shared coin/trades remain server-validated. Existing paid-service ceilings remain in effect; BYOK AI uses explicit requests and no-key fallbacks. Full Release A/B acceptance is not inferred from adding preview tabs.
