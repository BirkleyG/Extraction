# Sandbox pacing study (C-coefficients, provisional)

Reproduce: `cd play && node sim/pacing.mjs report`. Tests: `play/test/model.test.mjs` (pacing and engine-agreement tests).

**Status:** fluid approximation of the `/play/` sandbox economy (`play/economy.js`) with a greedy best-payback player. A scripted bot on the real one-second engine tracks it (about 16M earned after one hour), and a unit test holds engine income within 40% of this model. It is **not** balance certification, not the authoritative engine and not a section 21 acceptance run. Authorized direction: CEO, Q-11.

**Coefficients (`TUNE`):** `{"growth":1.4,"costGrowth":1.75,"pickCost":34,"lift":100,"liftCost":45,"haulCost":39,"depth":2.05,"shaftBase":190,"shaftGrowth":4.1,"orePerMiner":6,"holdBase":10,"speedBase":12,"speedGrowth":1.04,"veinGrowth":3,"veinBase":900}`

The "benchmark" column is the earlier section 10 estimate of cumulative earnings. It is shown for reference only: the CEO asked for larger, Qa-scale late-game numbers, so the sandbox intentionally exceeds it after the first hours. Coin accounting stays exact below 2^53−1 (about 9 Qa).

## active (always playing)

```
when      earned     benchmark  income/s   shafts pick lift haul buys  buyer
10 sec         223                    17      1    2    0    2    4  Frontier Refinery
1 min        1.49K                    39      1    4    3    5   12  Outer Station
5 min        34.8K                   321      3    9    9   10   30  Frontier Refinery
15 min      547.9K                 1.59K      6   14   13   15   47  Outer Station
1 hour       22.6M     100.0K      14.6K      8   21   20   21   69  Outer Station
6 hours      3.82B      3.00M     605.0K     12   30   29   31  101  Outer Station
1 day       219.1B     100.0M      7.76M     15   37   37   38  126  Outer Station
5 days       23.7T     506.3M     146.4M     18   46   45   46  154  Outer Station
7 days       62.6T      1.14B     303.9M     19   47   47   48  160  Outer Station
14 days     463.2T      19.5B      1.32B     20   51   50   52  172  Outer Station
21 days     1.44Qa     332.5B      2.78B     21   53   52   54  179  Outer Station
28 days     3.41Qa      5.68T      3.89B     22   54   54   55  184  Outer Station
30 days     4.09Qa      12.8T      3.89B     22   55   54   55  185  Outer Station
```

## casual (visits every 8 hours)

```
when      earned     benchmark  income/s   shafts pick lift haul buys  buyer
10 sec         217                    12      1    1    0    1    2  Frontier Refinery
1 min          800                    12      1    1    0    1    2  Frontier Refinery
5 min        3.60K                    12      1    1    0    1    2  Frontier Refinery
15 min       10.6K                    12      1    1    0    1    2  Frontier Refinery
1 hour       42.1K     100.0K         12      1    1    0    1    2  Frontier Refinery
6 hours     252.1K      3.00M         12      1    1    0    1    2  Frontier Refinery
1 day       659.9M     100.0M      21.6K      9   22   21   22   73  Outer Station
5 days       7.29T     506.3M      70.8M     17   43   42   44  145  Outer Station
7 days       24.4T      1.14B     104.6M     18   46   45   45  153  Outer Station
14 days     258.1T      19.5B     632.8M     20   50   49   50  168  Outer Station
21 days     878.8T     332.5B      1.32B     21   52   52   52  176  Outer Station
28 days     1.89Qa      5.68T      1.85B     21   54   53   53  180  Outer Station
30 days     2.37Qa      12.8T      2.78B     21   54   54   54  182  Outer Station
```

## idle (visits every 24 hours)

```
when      earned     benchmark  income/s   shafts pick lift haul buys  buyer
10 sec         217                    12      1    1    0    1    2  Frontier Refinery
1 min          800                    12      1    1    0    1    2  Frontier Refinery
5 min        3.60K                    12      1    1    0    1    2  Frontier Refinery
15 min       10.6K                    12      1    1    0    1    2  Frontier Refinery
1 hour       42.1K     100.0K         12      1    1    0    1    2  Frontier Refinery
6 hours     252.1K      3.00M         12      1    1    0    1    2  Frontier Refinery
1 day        1.01M     100.0M         12      1    1    0    1    2  Frontier Refinery
5 days      282.9B     506.3M      2.60M     14   35   35   35  118  Outer Station
7 days       2.39T      1.14B      16.7M     16   40   40   40  135  Outer Station
14 days     104.4T      19.5B     303.9M     19   48   47   48  161  Outer Station
21 days     569.5T     332.5B      1.32B     20   51   50   52  172  Outer Station
28 days     1.51Qa      5.68T      1.85B     21   53   53   53  179  Outer Station
30 days     1.91Qa      12.8T      2.78B     21   53   53   54  180  Outer Station
```

Reading the table: income/s is coin per second at that moment from the best buyer; shafts/pick/lift/haul are the levels bought; buys is the purchase count. "casual" and "idle" buy only when they visit, so their rows stay flat between visits.

