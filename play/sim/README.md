# Sandbox economy evidence · 26 October 2026

These studies apply only to the local `sandbox-rebuild-v1` profile. They do not change authoritative server coefficients, caps or accounting. Old local saves retain their original profile; the interface backs them up before starting a new mine.

The supplied three-line economy is the starting point. The adopted provisional compromise keeps each purchase's ×1.4 effect, automatic ten miners per shaft, depth 2.05, shaft cost 190×4.1^(k−2), and hauler base hold/speed 10/12. It changes cost growth from 1.75 to 1.8 and line bases from pick/lift/hauler 34/45/39 to 680/900/780. No milestone effect multipliers are added.

| Active fluid study | 1 hour gross | 30 days gross |
| --- | ---: | ---: |
| Supplied profile | 22.6 million | 4.09 quadrillion |
| Adopted compromise | 184,358 | 3.013 trillion |
| Rulebook benchmark | 100,000 | 12.783 trillion |

A bounded sweep compared costGrowth 2.0–3.0 and line-base multipliers 3–25. Increasing growth alone suppressed the month tail too strongly; 1.8 with bases×20 retained a visible progression ladder and put hour one within 1.85× the benchmark and month 30 within a factor of 4.25. Intermediate targets still differ considerably (day seven: 62.4 billion versus 1.139 billion), so this is a playable provisional compromise, not balance certification.

`node play/sim/pacing.mjs all > play/sim/pacing-evidence.txt` regenerates the fluid table: active, eight-hour visits and daily visits, with best-buyer fluid throughput and two-step greedy purchases. It approximates continuous flow, precredits the starter ore, omits finite buffers, discrete loading, integer crates and rare-ore premiums. Only snapshots at or before the requested horizon are produced, plus a final horizon row when needed. Cost options above the safe integer limit are excluded.

`node play/sim/engine-pacing.mjs > play/sim/engine-pacing-evidence.json` regenerates the exact-engine evidence through the actual one-second model, whole-crate shipments, finite storage and a similar greedy policy with no grants. On the deterministic default site it earns 100 at second one, 500 by minute one, 2,820 by five minutes, 11,440 by fifteen minutes and 130,010 by one hour. Shaft two is affordable after the second departure at second 13; the greedy policy has it working before minute one. The hour checkpoint has five shafts and level six on each line. Buyers are selected using expected sustainable throughput; this is one scripted policy, not a claim of optimality.

Live ticking and catch-up use the same function and have exact-state regression coverage. The conservation check counts initial stock plus mined ore against buffers, yard, onboard cargo and all paid shipments. Arrival never pays again. Integer-safe prices become unavailable gracefully before the nominal level400 ceiling; full-wallet takeoff blocks without crashing the simulation. Those reachable limits are arithmetic constraints, not new authoritative game caps.

History is bounded for the new local profile: the latest 32 shipment details and 64 ledger entries remain, plus any still-active shipment that cannot yet retire. `historyArchive` records retired shipment count, paid coin and ore units by ore, and retired ledger count, net owner/external deltas and gross amounts by source/sink type. Retiring details never changes coin, production conservation totals or in-flight payment state. The Records screen exposes the aggregate archive. Legacy and remote histories are not compacted. Regression coverage crosses the trim boundary and a JSON save/reload. Measured on the development runner: exact fresh-profile one hour took 0.884 seconds (previously 5.779); eight hours took 6.463 seconds. Browser catch-up remains bounded into batches so it can yield to rendering.
