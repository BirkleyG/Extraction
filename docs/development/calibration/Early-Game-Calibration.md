# Early-game calibration study (C-01 / C-02 NPC bids) — provisional

Reproduce: `cd backend && node scripts/calibrate-early.mjs [--price=40 --hours=168 --unload=1500]`. Tests: `backend/test/early-game.test.js`.

**Status:** coarse steady-state study using section 03/05/10 formulas and a stage-aware greedy buyer. Not the authoritative engine, not a balance certification. Authorized by CEO (Q-08 and Phase-0 answer 5).

## Adopted provisional values (profile `C01-EARLY-01`)

| Item | Value | Why |
|---|---|---|
| NPC raw bid, nearest refinery | **40 coin per unit** (before per-ore tier factors) | First sale of 1 unit buys two dig levels (15 each); day-1 gross ≈ 2.3× the 100M benchmark; day-7 ≈ 2× |
| Minimum departure load | **1 whole unit** (partial loads allowed when ship is ready) | Ore is whole units (Phase-0 answer 3); first paid departure at ~47 s |
| NPC refinery unload rate | **1,500 units/min** (fixture) | At 30/min unload time capped fleet throughput and stalled all progression |
| Miner hire | **round(20 × 1.004^(workersOwned−5))**, one-time | Cheap early drip; ~4.4k each at 1,800 workers |
| Habitat (miner pool) | **line 50 × 1.0195^L, cap 1000; capacity 10 + 2L** | A 10-level cap (60 workers) could not staff even two full shafts; 1000 levels reach 2,010 ≥ 30 × 60 |

## Results (greedy active player, 1 Hauler start, distance 1)

| Metric | Result | Benchmark |
|---|---|---|
| First sale / first purchase | 47 s / 47 s | T01-01 (revised: first minute) |
| Purchases in first 5 min | 13 | "always something to buy" |
| Gross external earnings @1h | 148k | 100k |
| @6h | 37M | 3M (overshoot, front-loaded) |
| @24h | 235M | 100M |
| @72h / @168h | 884M / 2.28B | 225M / 1.14B |

## Findings and open issues

1. **Rulebook tension:** "first dig level pays back in <30 s" implies ~600 coin/unit; the hour-1 benchmark (100k) implies far lower. 40 coin/unit favors the benchmark; early fun comes from cheap levels, not price.
2. **Income is lumpy by design:** ship round trip at distance 1 is 4 min, and payment is at departure, so income arrives in bursts. The UI must show ore waiting in the yard and its pending value so the wait feels like progress.
3. **Planned fix needed:** the greedy buyer under-expands (≤4 shafts by day 7) because gains are bottleneck-masked; real growth after day 1 needs the full simulator (A4). Do not tune late-month values from this study.
4. **Plateau trap found:** an NPC unload fixture below ~1,000 units/min, or a pad price jump (4,000×6^(n−2)) without cheaper fleet options, stalls progression. Ship purchase price (assumed 3,000×2^(n−2) here) is unregistered and still needs an approved value.
