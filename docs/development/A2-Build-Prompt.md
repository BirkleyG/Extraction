# Prompt: build Release A2 (mine-to-buyer loop)

Paste into a fresh chat with the `birkleyg/extraction` repo attached.

---

You are building **Release A2 — the mine-to-buyer loop** for Extraction Tycoon in `birkleyg/extraction`. Work on a new branch `claude/a2-mine-to-buyer` from latest `main`; open a reviewable PR when done. Do not touch `/prototype/` or legacy `msc_*` saves.

**Read first (binding):** `AGENTS.md`, `docs/rulebook/Extraction-Rulebook-v1.2.md` (sections 02–05, 10, 18; tests T03, T04, T05, T10, T18-03/11), `docs/development/Buildout-Plan.md` (A2 row), `docs/development/Build-Checklist.md` (A2 list), `docs/development/Questions-for-the-Boss.md`. Approved R rules are binding; C coefficients are provisional. Never silently turn a recommendation into a rule: log unresolved decisions in Questions-for-the-Boss.md, and update the owning rulebook section plus the section 22 change log for any gameplay change.

**Already built (reuse, do not rewrite):** `backend/src/` — `ledger.js`, `commands.js`, `events.js` (kernel), `world.js` (seeded 7-ore world), `upgrades.js` (pure pricing), `production.js` + `mine-engine.js` (shafts/lift/buffers), `game-service.js` (atomic paid departure, arrival never pays twice), `npc.js`, `month-close.js`, and the new `event-queue.js` (durable queue; another session is wiring the scheduler onto it, so avoid editing it).

**Scope — implement the unchecked A2 items:**
1. Mine structure: shafts 1–30 (cost `120×2.4^(k−1)`, hard stop at 31 — T03-05), dig, lift, buffers, surface yard, pads (cap 12).
2. Shaft improvements: lights, supports, carts (utilization 0.25+0.075L), bunkhouse (capacity 10+5L).
3. Worker pool, auto-assignment, habitat capacity with "!" for wasted labor (checklist marks this ❓ — implement the minimal reading and log the question).
4. Depth→ore yield bands; rare/mythic vein depletion with 20% / 5% warnings (T04-02/03).
5. Soil and weather modifiers feeding the production formula.
6. Ships: Hauler / Cruiser / Freighter, pad loading, trip time = 2×travel + unload + dock wait via **one shared function** used by UI and sim (T05-01).
7. Ship policies (best coin/min, nearest, fixed, preferred list) and a destination table showing price, trip time, coin/min.
8. Weather grounding (wait, no loss) and dock reservation/queue.
9. Transactional upgrade-purchase endpoint over `upgrades.js` pricing: buy 1/10/100/Max with exact summed rounded prices; cap and overflow checks inside the transaction (T10-01/03/04/08).
10. NPC refineries: ≥3 per planet, market-driven offers, explicit external coin source, no unlimited premium demand (section 02 accounting).
11. Firestore adapter parity for the paid-departure transaction.

**Constraints:** clients submit intents only; the server decides money, time, outcomes and hidden truth. All money is checked integer coin through the ledger; a rejected command mutates nothing; replay and live must agree exactly. Release B/C behavior stays unavailable. No paid services or paid runtime AI. Keep the legacy purple pixel look in any UI touched.

**Tests required:** T03, T04, T05, T10 and T18-03/11 — race the last buyer coin and last storage slot, rejected dispatch mutates nothing, arrival cannot pay twice, live == catch-up, overflow and negative inputs. Run `cd backend && npm test`; Firestore emulator tests via `npm run test:integration` (needs `npm ci` and Node 24). Syntax checks alone are not acceptance.

**Process:** give each sub-task explicit files, rule/test IDs and a stop condition; use at most a small group of lighter-model agents with distinct file ownership, no recursive teams. Tick items in `Build-Checklist.md` only when tested. Never call A2 "released" or claim arithmetic checks certify balance.

**Return:** changed files, test output, PR link, and remaining gaps.
