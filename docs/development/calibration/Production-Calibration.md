# Production C-01 calibration fixture study

Status: **experimental fixture calibration**. These values are not approved universal production defaults and do not certify economic balance.

## Inputs

The study uses a fixture shaft-one base of **1 unit per worker per minute** and a fixture lift base of **2 units per minute**. Shaft depth growth is 2.2, dig output uses the existing 1 + 0.04 × level formula, cart utilization uses 0.25 + 0.075 × cart level, and max workers are 10 + 5 × bunkhouse level. Catch-up calls the same explicit one-second tick function in this fixture. A 600-second chunk and 600 one-second fixture calls produce the same state; this does not establish production/live equivalence. Soil, weather, and buffs are direct inputs; seeded soil/weather modifiers come from deterministic study labels.

The exponential lift candidates are compared with the legacy linear reference 2 × (1 + 0.04 × lift level). Maximal shaft output assumes 30 shafts, 60 assigned workers each, dig 1000, carts 10, neutral soil/weather/buffs. This is a structural throughput fixture, not a strategy or affordability simulation. The small flow fixtures retain lift growth 1.0311 as the earlier neutral-only candidate for comparison.

## Balanced maximum lift comparison

| Lift curve | Lift at level 1000 (units/min) | Max shaft output (units/min) | Lift / shaft | Lift headroom |
|---|---:|---:|---:|---:|
| Legacy linear reference | 82 | 38.409T | 0.00000 | -100.00% |
| Exponential growth 1.03 | 13.748T | 38.409T | 0.35795 | -64.21% |
| Exponential growth 1.0311 | 39.978T | 38.409T | 1.04084 | 4.08% |
| Exponential growth 1.0316 | 64.918T | 38.409T | 1.69017 | 69.02% |
| Exponential growth 1.032 | 95.659T | 38.409T | 2.49054 | 149.05% |

For the 1.0311 candidate, maximal neutral shaft output is 38.409T units/min and level-1000 lift is 39.978T units/min, or 4.08% structural headroom. All 1001 lift levels from 0 through 1000 were checked for finite, safe-integer magnitude for each exponential candidate.

## Lift pass ratios by scenario

The analytical envelope is soil 1.25 × weather 1.25 × buffs 1. This is the selected generator-fixture ceiling only, not a game-world limit. Seeded scenarios A/B are individual deterministic fixtures.

| Lift profile | Shaft-output scenario | Shaft output | Lift at level 1000 | Lift / shaft | Passes structural throughput |
|---|---|---:|---:|---:|---|
| Legacy linear reference | Neutral fixture | 38.409T | 82 | 0.00000 | false |
| Legacy linear reference | Seeded soil/weather fixture A | 56.828T | 82 | 0.00000 | false |
| Legacy linear reference | Seeded soil/weather fixture B | 43.845T | 82 | 0.00000 | false |
| Legacy linear reference | Analytical input-envelope ceiling (study fixture only) | 60.014T | 82 | 0.00000 | false |
| Exponential growth 1.03 | Neutral fixture | 38.409T | 13.748T | 0.35795 | false |
| Exponential growth 1.03 | Seeded soil/weather fixture A | 56.828T | 13.748T | 0.24193 | false |
| Exponential growth 1.03 | Seeded soil/weather fixture B | 43.845T | 13.748T | 0.31357 | false |
| Exponential growth 1.03 | Analytical input-envelope ceiling (study fixture only) | 60.014T | 13.748T | 0.22909 | false |
| Exponential growth 1.0311 | Neutral fixture | 38.409T | 39.978T | 1.04084 | true |
| Exponential growth 1.0311 | Seeded soil/weather fixture A | 56.828T | 39.978T | 0.70348 | false |
| Exponential growth 1.0311 | Seeded soil/weather fixture B | 43.845T | 39.978T | 0.91179 | false |
| Exponential growth 1.0311 | Analytical input-envelope ceiling (study fixture only) | 60.014T | 39.978T | 0.66614 | false |
| Exponential growth 1.0316 | Neutral fixture | 38.409T | 64.918T | 1.69017 | true |
| Exponential growth 1.0316 | Seeded soil/weather fixture A | 56.828T | 64.918T | 1.14235 | true |
| Exponential growth 1.0316 | Seeded soil/weather fixture B | 43.845T | 64.918T | 1.48060 | true |
| Exponential growth 1.0316 | Analytical input-envelope ceiling (study fixture only) | 60.014T | 64.918T | 1.08171 | true |
| Exponential growth 1.032 | Neutral fixture | 38.409T | 95.659T | 2.49054 | true |
| Exponential growth 1.032 | Seeded soil/weather fixture A | 56.828T | 95.659T | 1.68331 | true |
| Exponential growth 1.032 | Seeded soil/weather fixture B | 43.845T | 95.659T | 2.18174 | true |
| Exponential growth 1.032 | Analytical input-envelope ceiling (study fixture only) | 60.014T | 95.659T | 1.59394 | true |

The 1.0311 profile passes only the neutral case; its lift rate is 39.978T units/min against the 60.014T units/min analytical envelope. Growth 1.0316 produces 64.918T units/min and has 1.08171 lift/shaft ratio over that envelope (passes). This recommends 1.0316 only as the provisional benchmark candidate for the next pipeline calibration, not as a certified global default.

### Optional shaft-depth sensitivity

| Label | Depth growth | Maximal shaft output (units/min) |
|---|---:|---:|
| Rulebook shaft-depth factor | 2.2 | 38.409T |
| Sensitivity only: gentler shaft-depth factor | 2 | 2.641T |

The depth-growth 2.0 row is a sensitivity only; 2.2 remains the documented study reference.

## Rate sweep

| Level | Shaft-one dig factor | Linear lift | Lift 1.03 | Lift 1.0311 | Lift 1.0316 | Lift 1.032 |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.04 | 2.08 | 2.06 | 2.0622 | 2.0632 | 2.064 |
| 10 | 1.40 | 2.8 | 2.687833 | 2.716676 | 2.729879 | 2.740482 |
| 100 | 5.00 | 10 | 38.437264 | 42.76699 | 44.89142 | 46.665908 |
| 250 | 11.00 | 22 | 3.238K | 4.229K | 4.774K | 5.260K |
| 500 | 21.00 | 42 | 5.244M | 8.942M | 11.395M | 13.832M |
| 800 | 33.00 | 66 | 37.223B | 87.430B | 128.854B | 175.707B |
| 1000 | 41.00 | 82 | 13.748T | 39.978T | 64.918T | 95.659T |

## Seeded soil and weather fixtures

| Scenario | Soil modifier | Weather modifier | Early shaft output (units/min) | Max shaft output (units/min) |
|---|---:|---:|---:|---:|
| Neutral fixture | 1.0000 | 1.0000 | 1.3000 | 38.409T |
| Seeded soil/weather fixture A | 1.2271 | 1.2058 | 1.9234 | 56.828T |
| Seeded soil/weather fixture B | 1.1932 | 0.9567 | 1.4840 | 43.845T |

Each scenario also runs a 600-second shaft/lift/yard fixture with an explicit synthetic drain of 0.01 units/sec:

| Scenario | Mined | Buffer | Surface yard | Drain | Accounted | Physical | Residual |
|---|---:|---:|---:|---:|---:|---:|---:|
| Neutral fixture | 13 | 0 | 7 | 6 | 13 | 13 | 2.31e-14 |
| Seeded soil/weather fixture A | 19.234147 | 0 | 13.234147 | 6 | 19.234147 | 19.234147 | 4.26e-14 |
| Seeded soil/weather fixture B | 14.839983 | 0 | 8.839983 | 6 | 14.839983 | 14.839983 | 1.42e-14 |

The seeded modifiers are deterministic sensitivity inputs, not a weather generator or probability calibration.

## Flow fixtures

The early fixture has one shaft at dig level 1, five assigned workers, cart level 0, and a 10-minute horizon. With the study inputs its shaft formula rate is 1.3000 units/min. The synthetic drain changes only how many units remain in the surface yard; it does not create a shipment or payment.

| Early 10-minute case | Mined | Buffer | Surface yard | Synthetic drain |
|---|---:|---:|---:|---:|
| No drain | 13 | 0 | 13 | 0 |
| Drain at 0.01 units/sec | 13 | 0 | 7 | 6 |

| Flow case | Mined | Buffer | Surface yard | Synthetic drain |
|---|---:|---:|---:|---:|
| lowLiftBuffering | 11.966667 | 9.966667 | 2 | 0 |
| fullYard | 0 | 2 | 100 | 0 |
| highLiftMultiOre | 640.152B | 0 | 640.152B | 0 |

The low-lift case shows shaft-buffer accumulation; the full-yard case blocks lift movement even at high lift level; the high-lift case uses all 30 explicitly assigned shafts and seven ore IDs. Buffer size, surface capacity, loading, fleet capacity, and synthetic drain rates are fixture values. In particular, no storage base is inferred from requiring the entire one-second production burst to fit in a buffer.

The largest observed floating-point mass residual across the summarized flow fixtures is 4.263e-14 units. The helper checks each ore using the tolerance max(128 * EPSILON, gamma_n) * max(1, absolute accounted units, absolute physical units), where gamma_n = n*EPSILON/(1-n*EPSILON), n=256*(elapsedSeconds+1), checked independently per ore. This is only a tiny floating-point residual in ore-unit fixtures; no coin is simulated, and coin remains subject to exact integer ledger accounting.

## Month horizon bookkeeping

| Month days | Horizon seconds | Preview ticks executed | Seconds remaining | Complete simulation |
|---:|---:|---:|---:|---|
| 28 | 2419200 | 60 | 2419140 | false |
| 29 | 2505600 | 60 | 2505540 | false |
| 30 | 2592000 | 60 | 2591940 | false |
| 31 | 2678400 | 60 | 2678340 | false |

Only 60 ticks are executed for each horizon row. The remaining duration is carried forward; these rows are not completed month simulations.

## Interpretation and limits

The 1.0316 exponential lift curve is the **provisional benchmark candidate for the next pipeline calibration** because it clears the neutral, seeded and selected analytical-envelope comparisons. The earlier 1.0311 candidate clears only the neutral comparison. Neither result certifies economic balance or the complete pipeline. Linear surface storage, shaft buffers, loading rates, fleet limits, shipment timing, buyer budgets, prices, affordability targets, investment, and player strategies still need their own C-01 calibration. Worker counts are assigned explicitly; the habitat-wide miner pool, automatic worker allocation, and production UI are not integrated. No production values here create coin.

The JSON companion contains the full deterministic inputs and numeric results. No current time, stochastic process, production configuration write, or external service is used by the generator.
