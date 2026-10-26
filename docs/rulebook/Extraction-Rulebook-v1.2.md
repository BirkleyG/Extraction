# Extraction — Consolidated Rulebook

**Revision 1.2 · 25 October 2026 · Prepared for owner review**

**Core rules:** payment is final at departure; money and storage are reserved atomically; pre-close departures count in that month; simulation continues on a trusted server while everyone is offline; combat follows section 23; bottlenecks are inferred visually; a mine has at most 30 shafts; nuking wipes all coin and sites; SP/evolutions last only this month.

**Reading guide:** sections 00–23 form one specification. Bold rules and the decision register identify approved behavior. Tables collect economic calibration. Values labeled C-xx remain simulation-tuning work, not certified balance. This revision is a replacement document, not an addendum to contradictory older text.

**Delivery note:** the Markdown file is the maintained specification. The accompanying v1.2 Word export is a historical snapshot and does not include the development preparation notes below. No Google Doc or gameplay code was changed by this preparation pass. Full gameplay balance has not been simulated.

**Development status · 26 October 2026:** the repository contains a playable pixel sandbox and an invite-only trusted server core. Release A is not yet accepted. See [Buildout Plan](../development/Buildout-Plan.md) and [Questions for the Boss](../development/Questions-for-the-Boss.md). Approved gameplay rules remain unchanged; implementation proposals are explicitly marked pending.

## Contents

- **00** — Master Rulebook and Game Principles
- **01** — Core Gameplay Loop and Monthly Competition
- **02** — Global Economy and Economic Laws
- **03** — Mining Operations and Production
- **04** — Ores, Resource Generation and Depletion
- **05** — Logistics, Shipping and Cargo
- **06** — Refineries and Industrial Processing
- **07** — Space Stations and Commercial Contracts
- **08** — Galactic Market, Prices and Economic Events
- **09** — Multiplayer Trading and AI Businesses
- **10** — Upgrades, Progression and Balance
- **11** — Exploration, Scouting and Expansion
- **12** — Soldiers, Combat and Base Defense
- **13** — Tribes, Diplomacy and Campaigns
- **14** — Wildlife, Monsters and Emergent Encounters
- **15** — Environmental Hazards and Space Threats
- **16** — Spectacle, The Maker and Evolutions
- **17** — Time, Offline Progression and Simulation
- **18** — Data Architecture, Persistence and Multiplayer Integrity
- **19** — AI Behavior, Procedural Generation and News
- **20** — Interface, Visuals and Player Feedback
- **21** — Testing, Validation and Acceptance Criteria
- **22** — Development Roadmap and Change Management
- **23** — Advanced Combat and AI Military Command

## 00 — Master Rulebook and Game Principles

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- This is the entry point to the specification. It defines the vision, the design pillars, the terminology, the rules that no other document may break, the document index, and the register of provisional decisions.
- Shared constants are summarized here; section 10 owns upgrade economics. Section 02 owns accounting, 08 market/intelligence, 17 time, 18 persistence, 19 generative AI, and adopted section 23 combat mechanics. Owning sections override summaries in their domains.
- A developer or AI that cannot find a rule in the numbered documents must not invent one. It takes the conservative default in Edge cases and failure handling and records the gap.
### Design principles
Extraction is a month-long competitive supply-chain game. Each player runs a mine on an alien planet, sells ore, and grows into refineries and space stations. At the end of the month the player with the most coin wins, and the whole game resets on a new planet.The Lore of the game is that the galaxy is expanding. The Maker Guild runs economic activities and sanctions the expansion of new planets at around a planet per month. Industrial guilds are given a month to test their production capabilities. At the end of the month, the Maker Guild awards exclusive extractive rights to the guild with the highest coin on hand at the closing snapshot, and gives preference to that guild for next month's planet. Guilds try to expand resources and total industrial share by capturing new planets and their total resource capabilities. The player controls a Guild General tasked with colonizing one of these planets.
Pillars
- Always something to buy. In the first hour a purchase is affordable every 10 to 60 seconds. Later, each check-in unlocks several meaningful upgrades.
- Upgrades are impactful so a player can actively play and feel like they are managing their economy.
- Upgrades can be purchased in bulk quantities (1x 10x 100x Max)
- Pace per second when active, ceiling per month. Minute-to-minute play stays engaging, but the upgrade ceiling is high enough that only the last days of the month let a player max out lines.
- Decisions are routes, prices and risks, not chores. There is no manual hauling. Players choose where to ship, what to charge, where to build and how to defend.
- Choices are light and not strategically intensive. A light way to simulate economic firm operations. Choose to upgrade this line, ship here, start a colony here. Not microchoices.
- The market has a hidden truth. True demand is hidden by default. Players infer it from offers and buyers; intelligence reveals only the information authorized by 08.
- Danger depends on location. Mines are constantly dangerous. Refineries and stations face rare, dramatic threats.
- Watching never changes the result. Live play and offline play use the same simulation.
- Stories come from rules. Fights, disasters and market shocks produce memorable events that the AI can narrate but does not decide.
### Definitive rules
Non-negotiable rules
1. Coin is conserved. Coin enters the game only at the sources listed in document 02, leaves only at the sinks listed there, and every other movement is an exact transfer.
2. The simulation is deterministic. The same saved state, the same elapsed time and the same seed always give the same outcome. Watching the game cannot change results.
3. Clients submit commands only for their own records. Trusted server transactions apply authorized cross-owner effects through immutable records with unique IDs; no record can be applied twice.
4. The AI writes words. The engine decides numbers, outcomes and prices. AI output is validated and clamped before use.
5. Hidden values stay hidden in the interface. The UI never shows true numbers beyond the player's intelligence level.
6. A player cannot be eliminated from the month. The home mine cannot be overrun or fully besieged. Combat may cause bounded temporary production losses, but home operations remain recoverable (12).
7. At the month end, coin, Spectacle Points, evolutions, mines, refineries and stations are all wiped. Only all-time statistics and the Hall of Fame persist month to month
8. Every displayed trip time uses the formula 2 x travel time + unload time, and every player-facing estimate uses the same function as the real simulation.
9. Rules change only through the procedure in document 22.
Glossary
- Coin: the single currency. Winning is decided by coin on hand at month end.
- Unit: one measure of ore, raw or refined.
- Raw ore: ore as mined. Cannot be sold on the galactic market. Refined ore: raw ore after a refinery, can be sold on the galactic market
- Price for ore (raw and refined) is set by global market demand.
- Mine, shaft: a mine is one landing site with its infrastructure. A shaft is one tunnel level in a mine, with its own miners and upgrades. Shafts extend to the left and right of the Mine Tunnel
- Outpost: any mine after the first.
- Refinery, station: a refinery buys raw ore and sells refined ore. A station purchases refined goods from players and computer-run refineries and sells them to galactic buyers.
- True price: the hidden galactic price of a unit for refined ore at a moment.
- Offer: a buying or selling price published by a player or by a computer-run business.
- Computer-run business: a refinery or station owned by the game, always present, that guarantees a buyer exists.
- Contract: a large purchase made at a station by a visiting buyer.
- Spectacle, SP: the score from destroying your colony, and the points the Maker awards for it.
- Maker: the AI character who negotiates galaxy changes after a colony is destroyed. Head of the Maker Guild
- Garrison: soldiers assigned to defend a specific location.
Document index and authority
- 01 Core Gameplay Loop and Monthly Competition: the player journey and month lifecycle.
- 02 Global Economy and Economic Laws: coin movement. This document has final authority on money.
- 03 Mining Operations and Production: shafts, miners, lifts, production.
- 04 Ores, Resource Generation and Depletion: the seven ores, including mythic ore, and veins.
- 05 Logistics, Shipping and Cargo: ships, trips, routing.
- 06 Refineries and Industrial Processing: refinery construction and operation.
- 07 Space Stations and Commercial Contracts: stations, buyers, contracts.
- 08 Galactic Market, Prices and Economic Events: demand, events, information.
- 09 Multiplayer Trading and AI Businesses: trade between players and computer-run businesses.
- 10 Upgrades, Progression and Balance: level costs, upgrade curves, income targets.
- 11 Exploration, Scouting and Expansion: sites, scouts, outposts.
- 12 Soldiers, Combat and Base Defense: garrisons and combat resolution.
- 13 Tribes, Diplomacy and Campaigns: tribes and extermination campaigns.
- 14 Wildlife, Monsters and Emergent Encounters: creatures and incidents.
- 15 Environmental Hazards and Space Threats: weather, underground hazards, pirates, cosmic events.
- 16 Spectacle, The Maker and Evolutions: destruction, negotiation, SP.
- 17 Time, Offline Progression and Simulation: time authority. 18 Data Architecture: storage authority. 19 AI Behavior: AI authority.
- 20 Interface and Feedback.
- 21 Testing and Acceptance.
- 22 Roadmap and Change Management.
Precedence
- Documents 02, 17, 18 and 19 override every other document inside their own domain: money, time, data and AI.
- Documents 03 to 16 govern their own systems subject to the domain authorities above. Section 23 is adopted and overrides older combat/equipment mechanics in 12; 13 owns diplomacy and 14 ecology. Document 20 presents rules and never changes them.
- If two documents conflict, the higher authority wins and the conflict is logged as a defect against the lower document.
### Progression and balancing
Shared constants. Other documents cite these and do not redefine them.
- Month length: one calendar month in UTC. Reset at 00:00 UTC on the first day.
- Ores per planet: exactly 7 — two common, four rare, and one mythic.
- Price of raw ore and Refined ore is dependant on galactic demand
- Trip time: 2 x travel time + unload time.
- Offline earning window: infinite.
- Upgrade level cap: 1000 for most upgrade lines (C-01).
- Target cumulative gross external earnings: E(d) = 100,000,000 × 1.5^(d−1) at the end of day d after day 1. This is about 12.78 trillion in a 30-day month; final coin on hand is lower after spending. Section 10 owns the complete calibration.
### Interactions with other systems
- This document constrains every other document. Each numbered document must cite document 00 for shared constants and must list any provisional values it uses by their C-number in the single register.
### Edge cases and failure handling
- Missing rule: the engine does nothing for that case, logs the gap with the state that triggered it, and the next revision of the owning document must define it.
- Conflicting rules: follow the precedence order above.
- A provisional value that is invalid at runtime falls back to the value in this document's register.
### UI and feedback
- The game has a Rules page for players that shows the player-facing summary of each system. The page is generated from the documents and never contradicts them.
### Implementation and acceptance tests
- Every document ends with acceptance tests whose IDs have the form T<doc>-<n>, for example T05-03. The suite in document 21 must pass in full before any release.
- T00-01: every rule above is covered by at least one automated invariant test.
- T00-02: no document contains a tuning value that also appears, with a different number, in another document.
### Open questions

### Decision and calibration register
- R-01 — APPROVED: unlimited offline progression; UTC calendar-month boundary; authoritative server time.
- R-02 — APPROVED: paid departure is the commercial settlement event. Reserve money, receiving storage and quantities atomically. No arrival-time payment or paid rerouting.
- R-03 — APPROVED: departures timestamped strictly before closing count in the closing month. Close paid delivery obligations before old-month inventory is discarded; never reverse or pay again.
- R-04 — APPROVED: protected recoverable home mine; hard maximum of 30 shafts per mine; first outpost target is week 2.
- R-05 — APPROVED: visual bottleneck inference, no explicit bottleneck label or automatic best-upgrade recommendation.
- R-06 — APPROVED: adopt section 23; branch-wide equipment research and deterministic functional combat; cartoonish, reasonably graphic presentation.
- R-07 — APPROVED: nuke all sites and coin, including available escrow, while preserving existing evolutions and unspent SP within this month. Eligibility uses current-run earnings; Spectacle uses this month’s total external earnings and then the multiplier. Section 16 specifies anti-repeat treatment.
- R-08 — APPROVED: AI can propose structured economic causes; engine validation/scoring decides acceptance, numeric effects and market recalculation. No direct benchmark-price override.
- R-09 — APPROVED: server-run economy and settlement continue without connected players. Clients submit authorized commands, not authoritative outcomes.
- R-10 — APPROVED: stable language slots, deterministic translation snapshots and server-only canonical meanings. Translation upgrades have no stage gate.
- C-01 — PROVISIONAL CALIBRATION: section 10 cost/effect coefficients, affordability targets and active/idle balance need seeded month simulations; arithmetic checks are not a gameplay balance certification. The CEO authorized engineering to tune provisional production/lift formulas and missing production base values through simulations and report evidence (25 October 2026, Q-08). Document adopted coefficients and preserve approved caps, accounting and principles.
- C-02 — PROVISIONAL CALIBRATION: faction budgets, CES elasticities, supply curves, solver tolerances, market cadence and intelligence costs (08).
- C-03 — PROVISIONAL CALIBRATION: vein sizes, ore distribution, scouting confidence, outpost base price and drone cost/time curves (04/11).
- C-04 — PROVISIONAL CALIBRATION: troop costs, branch unlocks, HQ coefficients, encounter parameters, home loss bounds and campaign results (12/13/23).
- C-05 — PROVISIONAL CALIBRATION: ecology populations, migration/reproduction rates, hazard frequencies and repair costs (14/15).
- C-06 — PROVISIONAL CALIBRATION: Maker effect bounds, creativity rubric, evolution costs and SP conversion coefficient (16/19).
- C-07 — PROVISIONAL CALIBRATION: deployment throughput, storage/rate limits, simulation performance budget and retention (17/18/21).
- C-08 — PROVISIONAL CALIBRATION: model selection and whether the $2–3 monthly AI budget is per world or account (19).
- C-09 — PROVISIONAL DESIGN: remote military retrofit deliveries, advanced-ore recipes, and any additional creature materials require a separate approved amendment. Default: instant standardized branch research; no creature-farming economy.
- Legacy P-number references are retired. This register is the single decision index; sections cite the applicable R/C IDs rather than maintaining duplicate registers.
- T00-03: every R/C reference resolves to this register; no retired P-number remains in normative text.
- 23 Advanced Combat and AI Military Command is part of the document index and is adopted, not an optional proposal.

## 01 — Core Gameplay Loop and Monthly Competition

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines what a player does from first login to month end, the three business stages, victory conditions, leaderboards, all-time statistics and the monthly lifecycle.
- Mechanics of each stage live in documents 03 to 09. This document defines how they connect.
### Design principles
- The first five minutes must teach the loop by doing: mine, ship, sell, upgrade.
- Each stage unlocks a new way to earn more per unit of ore, at the cost of new risk and new decisions.
- A player who logs in once a day should always have a meaningful batch of decisions waiting. A player who stays for an hour should never run out of things to do.
- Competition is about coin on hand, so players must decide when to invest and when to hold.
### Definitive rules
The player journey
1. Landing. The player picks a species name and look, talks to the Maker Guild to build out their own species, lands on a starting site, and receives a basic mine: one shaft, a few miners, one ship, one launch pad.
2. Stage 1, the mine. Miners produce raw ore. Ships carry it to a refinery of the player's choice. The player sells raw ore only. Soldiers guard the base. There is no hunting and no porter work.
3. Stage 2, the refinery. A player may buy a refinery for lots of coins. A refinery turns raw ore into refined ore and sells it to stations.
4. Stage 3, the space station. A player may buy a station for lots of coins. A station sells refined ore to galactic buyers through contracts.
5. Expansion. At any stage the player may scout and build outposts at new sites to reach new ores and escape depleted veins. Players may choose to forgo refineries or space stations to pursue horizontal rather than vertical integration
6. Spectacle. A player may destroy the whole colony for Spectacle Points and a change to the galaxy.
Unlock conditions
- Refinery: takes about 5 days of active play to earn enough coin to purchase
- Space station: takes about 15 days of active play total to earn enough coin to purchase. Provisional.
- Outposts: available from the start, but scouting and the first outpost are priced so that they become affordable during days 8–14 (week 2), including scouting prerequisites
Victory
- The monthly winner is the player with the highest coin on hand at the month-end snapshot.
- Coin on hand includes budgets held in escrow for purchases. It excludes the value of buildings, cargo and stored ore.
- The winner writes the prompt for the next planet. If no prompt arrives within 24 hours, the Maker improvises one.
Leaderboards and statistics
- Monthly board: coin on hand, live, with a column for coin per minute.
- All-time board: total coin across all months, average coin per month, months won, best month.
- Hall of Fame: one entry per month with the planet name, the winner and the final coin.
Monthly lifecycle
1. Day 1, 00:00 UTC: the new planet is active. Initial economic conditions and the new planetary supply source are announced. Starting sites are generated.
2. Days 1 to 14: growth. Players reach stage 2 and begin scouting.
3. Day 18ish (the middle of the month): faction-driven economic conditions may shift; there is no mandatory arbitrary price shock.
4. Final 48 hours: end-game. A countdown appears. Players decide whether to keep investing.
5. 00:00 UTC on the first of the next month: closing bell, snapshot, winner, reset.
### Progression and balancing
- Cumulative coin targets for an active player: 100 thousand after the first hour, 3 million after 6 hours, 100 million after day 1, then about 1.5 times per day in cumulative gross external earnings, using section 10’s definition. Document 10 owns the cost curves that produce this.
- A player who logs in once a day and plays 5 minutes should land within 60-70 percent of the income of an active player on the same day. Checking in matters; it should not be mandatory.
### Interactions with other systems
- Reads from 02 (coin rules), 10 (targets), 16 (destruction), 17 (month boundary).
- Writes to the all-time statistics record in 18.
### Edge cases and failure handling
- Tie in final coin: the player who reached that coin amount first wins.
- A player joins mid-month: they receive the same starting mine and a catch-up grant equal to 20 percent of the current month's median cumulative earnings of all players, so late arrivals can still take part.
- No players are active at month end: the Maker improvises the next planet.
- A player destroys their colony in the last hour: allowed. Coin is lost (R-07).
- Cargo already paid for at departure follows guaranteed delivery. Its month-boundary inventory treatment is governed by the closing policy in 17 and 18 (R-03).
### UI and feedback
- A persistent header shows coin, coin per minute and time left. Infer constraints from queues, buffers, idle actors and “!” markers; do not name the bottleneck or recommend a best upgrade.
- The first session shows a short guided sequence for mine, ship, sell and upgrade.
- A month-end screen shows the final board, the winner, and the player's all-time statistics.
### Implementation and acceptance tests
- T01-01: a new player can complete the first purchase within 30 seconds of landing.
- T01-03: at the boundary, the snapshot is taken once, even if several clients run the rollover at the same time.
- T01-04: the all-time statistics after a rollover equal the sum of the monthly results.

## 02 — Global Economy and Economic Laws

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Final authority for coin ownership, transfers, sinks, escrow, fees and month-boundary accounting. Section 18 specifies trusted execution.
### Design principles
- Every movement is exact, authorized, replayable and idempotent. No negative balances. Storage reservations and payment are committed together.
### Definitive rules
Accounts and amounts
- Store whole coin using checked integer arithmetic. MAX_COIN = 2^53−1 for each account, ledger amount and aggregate used by a transaction; intermediate arithmetic must not silently lose precision. Reject overflow before mutation, never silently cap one side of a transfer.
- An owner’s coin on hand is spendable coin plus owner-funded escrow. Escrow is a subaccount, not extra money. Monthly ranking sums the subaccounts once. Cargo, buildings and inventory are not coin.
- Each ledger transaction has immutable ID, authoritative timestamp, month ID, reason, debit/credit postings and referenced command/shipment/contract. Balanced transfers net to zero; creation and destruction have explicit external source/sink postings.
Allowed sources
- START_GRANT and CATCH_UP_GRANT.
- NPC_RAW_PURCHASE, NPC_REFINED_PURCHASE and GALACTIC_CONTRACT_SALE, backed by explicit external accounts. Exhaustible NPC premium budgets cannot become unlimited premium demand.
- Maker awards SP only. No creature, narration or self-transfer creates coin.
Allowed sinks
- SYSTEM_PURCHASE: upgrades, worker hires, recruitment, shafts, ships, sites, drones, facilities and research.
- PROCESSING_COST where defined by refinery operation; NPC_INVENTORY_PURCHASE when a player buys goods from a system-owned supplier; SYSTEM_TAX; REPAIR; TRIBUTE or RANSOM to non-player entities.
- CONTRACT_DEFAULT_FEE, collateral forfeiture and any authorized debt repayment. Apply a fee once; do not charge collateral and the same fee twice.
- NUKE_COIN_BURN and MONTH_CLOSE_BURN. These explicitly remove remaining spendable coin and available escrow at the applicable boundary.
- ROUNDING_REMAINDER only where an explicitly defined fractional calculation requires it. Integer transfers round the payable amount once and debit/credit the same amount; do not invent an unrepresentable fractional coin sink.
Transfers and escrow
- PLAYER_RAW_PURCHASE and PLAYER_REFINED_PURCHASE move equal integer amounts from buyer escrow/spendable coin to seller spendable coin. No player-to-player tax or direct gifts.
- ESCROW_FUND/RELEASE transfers between an owner’s subaccounts. Refund of an unspent purchasing budget is an internal transfer, not a source.
- SELF_INVENTORY_TRANSFER moves goods only, with zero coin revenue. Internal transfer prices cannot inflate earnings or prestige eligibility.
Commercial departure transaction
1. Validate ownership, cargo, origin stock, offer version, unit price, buyer funds, daily purchase limit, destination status and free receiving storage after existing reservations.
2. In one authoritative atomic transaction, reserve receiving capacity and purchased quantity, consume buyer funds, credit seller, remove origin stock, transfer cargo title and create the immutable paid shipment and event.
3. Failure changes nothing. Candidate routing can choose a different offer before departure; after success price, destination and payment are final.
4. Reservation is not spendable twice. Committed cargo belongs to the buyer in transit; reserved capacity becomes physical stock at delivery without a second payment. Loading a ship alone is not a paid departure.
5. Own-facility movements reserve capacity and stock identically but make no coin payment. All dispatched inventory commitments follow delivery guarantees.
Contracts and default
- A galactic contract pays on verified completion, or on explicitly allowed partial completion. It is not the same operation as a seller’s paid shipment to a station. Reserve buyer budget and seller stock/collateral as required; pay each fulfilled unit once.
- Spot stock is reserved immediately; forward quantities are production commitments, not fictitious existing stock. Terms fix quantity, deadline, collateral and default fee before acceptance.
- Default first consumes pledged collateral up to the fee, then available spendable coin. Record any remainder as nonnegative contract liability, not a negative balance. While in arrears, block new forward contracts and discretionary withdrawals; new income repays debt before becoming spendable.
- Repeated default can forfeit a station under disclosed contract terms and thresholds. Transfer facility title to the Maker Guild, burn available pledged collateral as above, release unused purchasing escrow, and preserve all paid inbound/outbound obligations. No implicit refund for buildings. Unpaid liabilities persist within the month until settled or explicitly discharged by a closing sink policy.
Nuke and closure
- A nuke cannot cancel paid cargo or erase obligations. Freeze new dispatches, finalize existing paid deliveries in an ordered closure step, then destroy the owner’s sites and burn available coin/escrow. Do not accelerate processing, sales or production in that closure step. Outstanding contract liabilities persist; forward commitments default normally if destruction prevents fulfillment.
- At month close, process events strictly before the UTC boundary, snapshot final coin including escrow, then finalize old-month paid delivery commitments without extra payment, production or sales. Archive inventory and contracts, release remaining old-month escrow, apply MONTH_CLOSE_BURN and create the new month’s starting accounts.
- Open contract unfulfilled portions are canceled at closing without a new penalty; already incurred default liabilities and completed payments remain in the archived ledger. No old-month balance, debt, inventory or reservation enters the new economy.
Earnings definitions
- Gross external earnings count actual payments from other owners/NPCs/galactic buyers, excluding grants, refunds, self-transfers, escrow moves and SP. Track current-run and month-to-date totals separately. Repeated reciprocal trades must pass anti-wash-trading validation before contributing to prestige; ledger cash movements still remain exact.
### Edge cases and failure handling
- Duplicate ID returns the original result. Insufficient funds, capacity or version mismatch rejects before departure. A post-departure facility closure waits for committed deliveries to finalize.
### UI and feedback
- Records shows source, sink, transfer, escrow and liability entries separately, with total owned coin and spendable coin clearly distinguished.
### Implementation and acceptance tests
- T02-01: owned coin including escrow equals sources minus sinks, without double counting.
- T02-02: replay reconstructs accounts, escrow and liabilities.
- T02-03: duplicate or concurrent departures cause exactly one payment and reservation.
- T02-04: no account is negative and overflow rejects atomically.
- T02-05: fee/collateral/default/forfeiture postings apply exactly once.
- T02-06: nuke and closing burn exactly the remaining owned coin while preserving committed payments.
Open calibration
- C-01: economic coefficients. C-07: transaction throughput. Contract default thresholds must be disclosed and calibrated before forward contracts launch.

## 03 — Mining Operations and Production

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

- Defines the mine, shafts, miners, upgrades, lifts and the production formulas, and how the visual scene reflects production.
- Does not define ore values (04), shipping (05) or threats (12 to 15).
### Design principles
- Production is a formula that is easy to read: every number on screen comes from rates the player can see.
- The slowest stage limits income, and the game does not directly tell the player which stage that is. It can be inferred visually on the map with a “!”
- The scene shows production without simulating it. The pixel miners, ships, and icons are an illustration of the rate, not the source of it.
### Definitive rules
Structure of a mine
- A mine is one site. It has up to 30 shafts, one lift, one surface storage yard, a habitat for miners, a barracks and launch pads.
- Shafts are unlocked in order. Each shaft digs in one depth band, which determines which ore it yields (document 04) and which creatures can reach it (document 14).
- A shaft has: miner capacity, dig level, and improvements: bunkhouse, lights, supports and carts.
Miners
- Miners are a hired pool for the mine (R-05). Miners are Auto assigned to shafts, which spreads miners to where the value is highest.
- A shaft's miner capacity is 10 plus 5 per Bunkhouse level. The mine's total miner capacity is set by the habitat level.
Production formula
- Units per minute for one shaft: miners assigned x dig rate at the shaft's level at the material being mined in shaft  x soil modifier x weather modifier x utilization x buffs.
- Dig rate at level L: base x (1 + 0.04 x L). The base rises 2.2 times for each deeper shaft.
- Utilization: 10 levels, increases with cart purchase, starts at 0.25 and reaches 1 with automated rails.
- No milestone multipliers apply. Production bonuses come only from explicitly defined upgrades and conditions.
Improvements
- Lights: 10 levels. Diminishes the chance for miners to develop insanity. Insanity causes the miner to turn against other miners and attack them and reduce the chance of some creature spawns.
- Supports: 10 levels. Cave-in chance per shaft per day is multiplied by 1.0, and 0.01 at the lowest.
- Carts: the levels in the utilization list above.
Lift and surface
- The lift moves units from all shafts to the surface. Lift throughput is units per minute. If shafts produce more than the lift moves, the surplus waits in each shaft's buffer. A full buffer stops that shaft.
- Surface storage holds mined units until a ship is loaded. A full yard stops the lift.
- Launch pads: ships load at pads. A pad loads at its loading rate. Pads are an upgrade line.
Bottlenecks
- The engine computes production, lift, buffer occupancy and loading constraints for simulation and validation; it never names the lowest stage in the player interface. A balanced maximum configuration avoids preventable idle time but does not eliminate finite transport or processing time. The balanced-maximum acceptance test is defined in 10; arbitrary uneven configurations and evolutions can still produce local flow constraints.
### Progression and balancing
- Shaft k unlock cost: 120 x 2.4^(k-1). Shaft k base dig rate: 2.2^(k-1) times the shaft 1 rate.
- Dig level costs use section 10: next level from current L costs round(15 × 1.021^L), cap 1000.
- Starting mine: shaft 1 at level 1, 5 miners, lift level 1, one pad, one ship.
- Early target: the first shaft level costs about 15 coin and pays itself back in under 30 seconds. Later levels pay back in 1 to 20 minutes, and top levels in days.
### Interactions with other systems
- Reads site soil, ore and depletion (04, 11), weather and hazards (15), buffs from SP (16).
- Writes units to storage, which document 05 loads onto ships.
- Garrisons and incidents (12, 14) can reduce a shaft's output while it is under attack.
### Edge cases and failure handling
- Vein depleted: the shaft keeps producing the common ore of its band (document 04).
- Cave-in: the shaft stops for a repair time of 20 to 90 minutes; its miners are not lost unless a creature or gas also hits (document 15).
- Miners assigned above capacity: the extra miners are ignored until capacity grows. “!” to denote wasted labor
- Home defense failure can temporarily reduce production in affected shafts but cannot fully stop all home production or destroy the home mine (12).
### UI and feedback
- The scene draws at most about 12 miners per shaft with a label such as x400. Cart and lift animation speeds follow real rates.
- A shaft card shows the production per minute, the miner count, and the improvements.
- Show rate cards, accumulating ore, full buffers, waiting ships and idle equipment. Use “!” for full storage, idle labor or blocked flow, without a named bottleneck, ranked diagnosis, cheapest-fix hint or automatic best-purchase recommendation.
### Implementation and acceptance tests
- T03-01: production per minute from the formula matches 10 minutes of fast-forwarded simulation within 0.1 percent.
- T03-02: the drawn miner count never changes the production number.
- T03-03: lowering a shaft's miners to 0 stops its production within one tick.
- T03-04: queue occupancy, blocked-flow markers and animation states match the authoritative flow; no UI text names the bottleneck or recommends a best purchase. T03-05: buying shaft 31 always fails without charging coin.
### Open questions
- **HARD CAP: 30 shafts per mine. Shaft 30 is intentionally a very late, difficult investment; costs never permit shaft 31.**
- Should miners cost upkeep, or only a one-time hire cost? Only one time hires

### C-01 production study implementation · 25 October 2026
- Added validated pure shaft/lift rate helpers and a one-second finite-buffer flow model with bounded catch-up. The same tick function is used in the study’s stepped and catch-up runs; explicit assigned workers are checked against per-shaft capacity and shaft 31 is rejected.
- Current benchmark coefficients and candidate interpretation live in section 10 under C01-LIFT-02. No worker-pool allocation, habitat progression, UI, depletion, shipping or sale behavior is introduced by the study.
- T03-01/02/03/05 have partial helper/fixture evidence only: formula checks, zero-worker output, rendering-independent calculations, cap validation, 600-step replay and ore conservation. No purchase endpoint exists for these helpers, so concurrent purchases and full gameplay acceptance remain pending.

### Local sandbox mining profile · 26 October 2026

**Scope: new local mines only (`sandbox-rebuild-v1`); authoritative server mining is unchanged.** Each shaft includes ten miners. A single global Pick line affects every shaft, including later purchases; shaft depth multiplies base digging by `2.05^(k−1)`. Shared economy data drives the model, machine tier labels and studies. Rare-vein size is `round(richness × 900 × 3^(k−1))` (mythic ×3.3); the pick must reach the matching hardness tier. Veins remain finite and deterministic. New sites always receive at least two distinct rare types in the fallback generation path.

Each shaft buffer holds about ten seconds of lift flow; yard capacity is the greater of twenty seconds of lift flow, two holds or twenty units. All ore movement remains conserved. These are experimental sandbox capacities, not new authoritative storage upgrade rules. The original prototype and existing browser mines remain available with their own economics.

### A2 authoritative mine structure · 26 October 2026 (server only; the local sandbox is unchanged)
- **Per-shaft improvements.** Lights and supports are per-shaft lines like carts and bunkhouse (cap 10, section 10 curves), not mine-wide lines. Their *effects* (insanity, cave-in factor `100^(−L/10)`) stay with documents 14/15; A2 only stores and prices the levels.
- **Worker pool (Q-12 reading).** Hiring is limited by habitat capacity only. Miners above total shaft capacity are hired but not seated; the owner view reports the surplus as wasted labor and shows "!". Auto-assignment seats miners in shafts by highest per-worker rate first, shaft number breaking ties. Buying bunkhouse levels seats waiting miners.
- **Soil and weather modifiers (C-03 provisional).** Soil modifier = soil type (loam 1.10 … obsidian 0.85) × `1 − 0.01 × (hardness − 5)`; weather is constant within a UTC hour and seeded per site (modifiers clear 1.0, dust 0.9, storm 0.7, ash 0.85, cold 0.8). Both multiply the production formula; the simulation cuts catch-up at hour boundaries so live play and offline catch-up agree.
- Tests: A2 acceptance suite (`backend/test/a2-mine-to-buyer.test.js`), T03-05 and shaft/pad cap checks.

## 04 — Ores, Resource Generation and Depletion

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines the seven ores of a planet, how they are generated, how they are distributed across sites, and when they run out.
- Does not define demand or prices over time (document 08).
### Design principles
- Each ore must be easy to tell apart by its name, color, use and value.
- Common ore keeps every player earning. Rare ore creates the reason to expand.
- A rare vein running out is an event the player prepares for, not a surprise.
### Definitive rules
The seven ores
- Each planet has 7 ores in three tiers. Common: 2 ores. Rare: 4 ores. Mythic: 1
- Ore value arises from galactic demand and competing supply (08). Raw-ore buying offers derive from expected refined sale proceeds, refinery yield, processing cost, logistics and margin (06), rather than a fixed rarity multiplier.
- The engine assigns tiers and values. The AI names each ore, describes it, picks its color and gives it one galactic use that justifies demand (document 19).
- Each ore has a hardness. Common hardness 1 to 2, rare 5 to 6. Mythic 9-10. A mine's tools must break that hardness. Mythic may take the purchase of specialized equipment to mine.
Where ores occur
- Different planetary regions contain different deposits.
- Common ores are exclusive. Either one or the other. They do not both exist in the same region.
- Rare ores are randomly distributed around the planet. They may or may not overlap. Mines may contain up to all four types of ores. One ore covers roughly 37% of a planet. Meaning distribution across all sites is approximately:
*
- Mythic ore is contained in only approx 5% of sites, and only in regions where the ground is naturally tough
- Shafts yield ores by depth: shallow shafts mostly common, middle shafts add rare, deep shafts add rare. Only deepest has mythic
Depletion
- Common ore is infinite.
- Each rare and mythic vein at a site has a finite size in units: size = richness x tier constant (C-03).
- Initial tuning: a rare vein at a typical starting shaft lasts 4 hours to 2 days at the production a median player is expected to reach. Shafts can contain multiple veins. Shafts are not guaranteed to contain veins regardless of depth. Vein chance and size increase with depth.
- As a vein falls below 20 percent, the player sees a warning. Below 5 percent, output of that ore falls in proportion.
- When a vein is empty, the shaft continues on the common ore of its band.
- Ore does not replenish.
### Progression and balancing
- A new site's veins are revealed to the player by scouting (document 11), with accuracy and metrics by drone level.
- Ore tiers increase geological scarcity and tool requirements, not guaranteed sale prices. Galactic prices reflect utility, budgets, inventory, external supply and planetary production. A site without any rare ore can still win if its production is high enough.
### Interactions with other systems
- Reads site generation (11), tools (10), soil (15).
- Writes unit counts to shafts (03) and values to the market (08).
### Edge cases and failure handling
- Two players mining the same planet do not compete for the same vein, because veins belong to sites, and sites are different locations.
- If the AI returns a duplicate ore name, the engine adds a suffix and regenerates the description.
### UI and feedback
- Each ore has a card with its name, color, tier, use, hardness and the player's remaining vein.
- Vein bars show remaining quantity at each shaft. A pickaxe icon shows where tools are too weak.
### Implementation and acceptance tests
- T04-01: every planet has exactly seven ores.
- T04-02: depleting a vein reduces output to the common ore of that band and never produces negative units.
- T04-03: the sum of mined units from a vein never exceeds its size.
### Open questions
- Should uncommon ore replenish slowly, or never? Never
- Should veins be shareable between neighboring outposts of the same player? Nope

### A2 authoritative depth bands and veins · 26 October 2026 (C-03 provisional)
- **Depth bands:** shafts 1–4 shallow (common only), 5–12 middle, 13–20 deep (rare veins possible), 21–30 deepest (mythic possible). A shaft holds at most one vein; shafts are not guaranteed a vein. Vein shaft choice is seeded and weighted toward depth; vein size = planet vein units × `(1 + 0.05 × (shaft − 5))`.
- **Depletion:** a shaft digs its vein ore until the vein is empty, then the common ore of its band; a shaft changes ore only when its buffer is empty. Output tapers in proportion below 5% of the vein, with a 2% floor so a vein finishes in finite time. The owner view shows the remaining share and the 20% (LOW) and 5% (CRITICAL) warnings for dug shafts only; undug veins, exact planet veins and the weather seed never leave the server.
- Tool hardness gating and mythic-specific equipment are **not** implemented in A2 (Q-12).

## 05 — Logistics, Shipping and Cargo

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines ships, pads, travel time, loading, unloading, destination choice, routing, rerouting and shipping cost.
- Does not define what destinations pay (documents 06 to 09).
### Design principles
- The choice of destination is the main decision of the early game. The game shows the real earning rate of every option.
- Ships do their own routing. The player sets a policy, not a click for each trip.
- A trip's duration is always known in advance from one formula.
### Definitive rules
Locations and distance
- The system map has coordinates for the planet surface, orbit, refineries and stations. Distance is Euclidean in system units.
- Leaving or entering a planet's surface adds 8 units.
- On-planet destinations are 1 to 8  units away. Off-planet destinations are 10 to 60 units away.
The shipping time formula
- Trip time = 2 x travel time + unload time.
- Travel time = distance / ship speed. Unload time = units / the destination's unload rate, plus any wait for a free dock.
- The displayed estimate includes the expected dock wait, which is computed from the dock queue at the time of departure.
Ships and pads
- Ship classes: Hauler (default), Cruiser (3 times the speed, 35 percent of the cargo), Freighter (60 percent of the speed, 3 times the cargo). (Freighter should be approximately 1.8x expensive as other craft)
- A ship has cargo capacity, speed, and a loading rate that depends on the pad.
- A pad holds one ship at a time. A mine has 1 to 12 pads. Ships without a pad wait in orbit.
- Starting values: Hauler capacity 150 units, speed .5 units per minute, one pad.
Choosing destinations
- Each ship has a policy: Best earning rate (default), Nearest, Fixed destination, or Preferred list.
- Best earning rate: coin per minute = (cargo value at the destination's offer) / trip time. The ship chooses the destination with the highest rate among those that can pay.
- The destination list shows price, tax, trip time and coin per minute for each option.
Payment
- Payment occurs at take off (document 02). If no player will pay, a computer refinery or station is always available.
### Progression and balancing
- **First trip target: approximately 5–35 minutes round trip to an on-planet NPC refinery, depending on distance and unloading. At distance 1 and speed 0.5 units/minute, travel alone takes 4 minutes round trip. First payment occurs at paid departure as soon as the first load is ready; it never waits for the ship’s return.**
- At starting speed 0.5 units/minute and effective one-way distance 10–60, off-planet travel alone takes 40–240 minutes round trip, plus unload/queue time. Upgrades can reduce this substantially; use the same formula for display and simulation.
- Pad n costs round(4,000 × 6^(n−2)), for n=2…12. Ship speed, capacity and loading rate use section 10’s calibrated 1000-level curves. Loading time is separate from the defined trip duration but must be included when comparing full-cycle earnings throughput.
### Interactions with other systems
- Reads stored units (03), destinations and offers (06, 07, 09), prices (08), weather and pirates (15).
- Writes shipment records for settlement (18) and ledger entries (02).
### Edge cases and failure handling
- Once paid and launched, a shipment is guaranteed to arrive at its original destination; in-flight destination removal is deferred until delivery settles.
- Weather prevents takeoff: the ship waits, and the delay is shown. It does not lose cargo.
- Paid outbound shipments cannot be attacked. Empty ships on return legs may be targeted by pirates or flying beasts; air coverage mitigates the risk (12/15), without reversing sales.
- **A paid departure timestamped strictly before closing contributes its payment to the closing month. Finalize its delivery in old-month closure before inventory is archived; do not reverse payment, pay again, or carry stock into the new month. Departures at the boundary belong to the new month and cannot use old-month cargo.**
### UI and feedback
- A fleet panel lists each ship, its state, cargo, destination, ETA and expected coin.
- A destination table shows the coin per minute of every option and highlights the best.
- A return-leg incident shows a notice about fleet availability, repair or replacement. Paid outbound deliveries are never rerouted.
### Implementation and acceptance tests
- T05-01: the displayed trip time equals the simulated trip time.
- T05-02: a shipment cannot be paid twice, even if two clients process its arrival.
- T05-03: a paid shipment cannot change destination or suffer cargo loss after departure.
- T05-04: ships never leave a pad without cargo unless the player orders it.
### Open questions
- Should ships have maintenance or crew costs in addition to fuel? No
- Should the player be able to split one load between two destinations? No

### Departure reservations and trip estimates
- Use the atomic departure transaction in 02/18. Receiving capacity, daily limits and budget are checked/reserved before takeoff, never again for payment on arrival.
- Effective route distance includes each applicable surface transition exactly once. The listed 10–60 off-planet range is effective distance including those transition penalties.
- Destination dock slots are scheduled or reserved at departure to support the displayed planned trip time. Clearly distinguish planned ETA from later delay due to an explicitly permitted interruption; cargo remains guaranteed.
- Return-leg attacks may change actual empty-ship return time or availability. They do not alter the delivery commitment, sale or original disclosed estimate retroactively.
- T05-05: first sale credits coin at departure while the ship is still outbound. T05-06: a pre-boundary departure is included exactly once in final coin even if its ETA follows closing.

### Hauler and buyer rules update (Q-10) · 25 October 2026
- **Supersedes** the finite-budget wording for computer-run buyers in 02, 06, 08 and 09 for raw ore: NPC buyers pay `units × bid` at takeoff with no budget or receiving-capacity limit (the coin remains an explicit external source, `NPC_RAW_PURCHASE`; fixed bids are C-02 provisional). Player-owned refineries and stations keep budgets, capacity reservations and daily limits (Release B).
- **Takeoff:** a hauler leaves automatically when its hold is full (or, when the yard is smaller than the hold, when the yard is completely full). "Launch now" forces takeoff with the whole units on the yard (up to the hold). Both are the same paid departure; payment is at takeoff and never on arrival. Auto can be turned off; a pinned buyer overrides "best coin per minute". The trusted server evaluates automatic takeoffs at their exact second, so live play, catch-up and offline play agree (T17-01).
- **Units:** one unit = one standard crate of ore. The interface explains units, coin, yard, hold, AU and takeoff payment with hover/tap tips.
- Server yard base capacity is 300 units (two starting holds) so a hauler can fill while it is away. `/play/` still uses its own sandbox yard and loads ore onto the hauler continuously.

### Local sandbox shipping profile · 26 October 2026

**Scope: new local sandbox mines only.** Landing supplies ten units of common ore in kind, zero coin. Automatic takeoff sells a whole hold when ready; Launch now sends available whole crates. Base hold is ten crates, speed twelve AU/min, and fixed unload times are two/three/four seconds for the three published NPC buyers. Base bids are 10/18/50 coin per unit before ore modifiers. Apply ore modifiers and round the unit price first, then multiply by quantity for the actual integer payment and the UI preview.

Fractional high-value residue cannot block loading whole crates of another available ore. A discontinued ore with only fractional residue left cannot strand a partially filled hauler indefinitely. The launch preview chooses the same cargo and rounds the same prices as the actual departure.

The unupgraded nearest-buyer trip is twelve seconds (`ceil(2 × distance/speed × 60 + unloadSeconds)`). Payment is final at takeoff, never repeated on arrival. Hold capacity grows ×1.4 per Hauler level (whole crates); speed grows ×1.04. Sandbox pad loading can move a hold per second. The trusted online server keeps its existing shipping formula, independent upgrade lines and coefficients.

### A2 fleet, trips, docks and NPC refineries · 26 October 2026
- **One trip function:** `tripPlan` (backend `ships.js`) computes trip time = 2 × travel + unload + dock wait, plus the separate pad loading time; the destination table, the dispatch plan and the simulation call this one function (T05-01).
- **Fleet:** Hauler / Cruiser / Freighter (Cruiser ×3 speed and ×0.35 hold, Freighter ×0.6 speed and ×3 hold). Additional ship price is C-02 provisional: 3,000 coin for Hauler/Cruiser and 5,400 for Freighter (≈1.8×); fleet cap 24 hulls; ship-speed/capacity/loading lines are mine-wide. A pad loads one ship at a time; ships beyond free pads wait in orbit (pad schedule). Pads 2–12 use the section 10 price.
- **Policies per ship:** best coin per minute (default), nearest, fixed, preferred list (best of the list, else best overall). Ties break by id; coin per minute compares exactly (integer cross-multiplication).
- **Weather grounding:** storm hours ground takeoffs, never two consecutive hours. An automatic takeoff waits for the first clear second and records `weatherDelaySeconds`; a forced launch while grounded is rejected without change. Cargo is never lost.
- **Dock queue:** each refinery has finite berths; a departure reserves an interval for its unloading and the estimate shown is the dock wait for that reservation. Reservations are intervals, so a catch-up departure dated in the past is only delayed by berths that are really busy in its own window; only the latest 64 reservations are kept (C-02).
- **Mixed cargo:** a hold carries one line per ore (most valuable tier first); payment is the sum of the lines at one destination.
- **NPC refineries (≥3 per planet) and the premium (Q-10 reading, see Q-13):** the base bid is unchanged and unlimited. Rare and mythic ore additionally earn a market-driven *premium* — `base × (tierReference − 1) × demand` with tier references 1/3/8 and `demand = 1 − storageUsed / storageCapacity` — paid only while the refinery's finite premium funds (token bucket) and premium storage allow; both refill/drain with time. When exhausted the cargo still sells at the base bid, so there is no unlimited premium demand. All coin is the explicit external source `NPC_RAW_PURCHASE`; funds and storage are server truth and are never projected.

## 06 — Refineries and Industrial Processing

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines refinery construction, location, ore purchasing, buying budgets, refining lines, storage, processing costs and refined products.
- Stage 1 players sell raw ore to computer-run refineries. Stage 2 is when a player builds one.
- Does not define how refined goods are sold (07) or global prices (08).
### Design principles
- A refinery is a business with a margin the owner sets and a risk the owner takes: a buying budget that can run dry.
- A well-run refinery may outperform outsourcing; ownership is not guaranteed to dominate specialization. Margin, capital, utilization and competitive alternatives determine profitability.
- The refinery panel is the second most important screen in the game, so every control must show its effect on profit.
### Definitive rules
Types and location
- Computer-run refineries exist on every planet and in space. They always pay, with a lower price and a higher fee (C-02).
- A player refinery is built on the planet (cheap, short trips) or off planet at a station site (expensive, high capacity). Each location has a build cost, a distance and an exposure to hazards.
- Players may build several refineries. Each additional one costs more (C-01).
Buying ore
- Each refinery has one row per ore on its buy panel with: Buy (yes or no), markup, and a daily limit.
- Offer to sellers = expected refined output value minus processing cost minus target margin. Specifically, maximum sustainable raw price = expected refined-unit selling price × expected refining yield − variable processing and logistics costs − desired margin. Higher markup lowers the offer and raises the owner's margin.
- Markup range is 0 to 100 percent.
- The refinery owner's own ships skip the markup.
Budget
- The owner funds a purchasing budget from coin. The refinery pays sellers from this budget at takeoff from origin port.
- If the budget cannot pay a full shipment, the shipment is not shipped to the refinery (document 05).
- Budget can be refilled manually or by an auto-refill rule that tops up to a target each day or as a percentage of total income at day start.
Refining
- Refining lines convert raw ore to refined goods. Each ore has a line. A line has a speed in units per minute and a yield (the fraction of raw units that become refined units).
- Base yield is 70 percent and rises with upgrades to 95 percent. Refined units only can be sold at international markets.
- Input storage holds raw ore. Output storage holds refined goods. A full input stops purchasing for that ore. A full output stops refining.
Products
- Each ore has one refined product. Refined goods go to the player's stations (07) or are sold to other stations.
- Refineries cannot sell directly to the galactic end market. Refined goods may be sold to player-owned or NPC stations, including those owned by other players.
### Progression and balancing
- Upgrade lines: input storage, output storage, processing speed per ore, yield, buying budget limit, dock count and unload rate. Output dock counts, refinery fleet size, refinery fleets, etc. Cap and cost follow section 10; numeric rate/storage lines cap at 1000, dock counts have separate physical caps.
### Interactions with other systems
- Reads ore deliveries (05), reference values (08), taxes and fees (02).
- Writes refined goods to stations (07) and ledger entries (02).
- Hazards and threats apply to refineries (15). Defense is by garrison (12).
### Edge cases and failure handling
- Budget empty: the refinery shows "Cannot pay" and cargo orders are not made.
- Two concurrent departures compete for funds/storage: authoritative timestamp then event ID determines order. Commit the first valid transaction atomically; reject the second before departure if capacity or funds are insufficient. No paid shipment reroutes or pays on arrival.
- Owner offline: the refinery keeps running with its saved settings.
- Closing/destroying a refinery freezes purchases and finalizes its paid commitments before destruction. Stored goods are then lost; unused purchasing escrow is released to its owner as an internal transfer. A whole-colony nuke subsequently burns that owner’s available coin under 02.
### UI and feedback
- A refinery card shows budget, stored ore and refined goods, current offers by ore, the profit per hour and the limiting stage.
- A markup slider shows the new offer, the expected incoming shipments and the profit per hour before it is applied.
### Implementation and acceptance tests
- T06-01: coin paid to sellers equals the offer x units, every time.
- T06-02: refined units out never exceed raw units in x yield.
- T06-03: the owner's own ship never pays markup.
- T06-04: a budget of 0 never produces a negative balance.
### Open questions
- Should refineries have a minimum markup to prevent a race to zero profit? No.
- Should players be able to hire AI managers to run the buy panel (C-01)? Maybe… sounds interesting
Other Thoughts
Players can reserve docks for their own shipments to ensure that their shipments always arrive without delay. These docks do not sit empty, they just cannot be booked by other players during the expected landing and unloading time of the players own ships.

### Playable local refinery preview · 26 October 2026

**Scope: new-economy local sandbox; online business state is unchanged.** One refinery costs 25,000 test coin. Shared input and output capacities start at 1,000 units; each ore line processes up to 120 raw units/minute. Yield starts at 70% and rises by `0.25 × L/1000` to 95%. Speed uses `120 × (1 + 0.04L)`; storage uses `1000 × (1 + 0.04L)`. Speed/yield prices are `round(100 × 1.019^L)`; storage prices `round(50 × 1.0195^L)`, caps 1000.

Yard → own refinery is an instant local transfer with no coin or revenue; optional automatic routing feeds available whole crates into free input storage. Processing consumes real raw units, records yield loss and stops at full output. Refined goods can be sold to an NPC station at 80% of its current published reference quote or transferred into the owner's station. No raw ore reaches the galactic end market. Budget funding/release, where exercised, remains an internal escrow movement, not earnings. Cross-owner purchasing and full facility logistics are not implemented in this preview.

### Local refinery output policies · 26 October 2026

Choose Hold/manual, Sell to NPC, or Fill own station. Automatic exports run every 30 simulated seconds using existing whole output and the same checked inventory/ledger commands as manual orders. NPC exports are the explicit `NPC_REFINED_PURCHASE` source; station fill is a zero-revenue own-inventory transfer. Full wallets or silos keep goods waiting. Missing policies in existing saves mean Hold/manual. These local operations use the instant-transfer fixture disclosed above; they are not shared server-side industry or canonical facility shipping.

## 07 — Space Stations and Commercial Contracts

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines station construction, silos, docks, buyers, contracts, markup, revenue and upgrades.
- A station is how refined goods become coin from the global market (Stage 3).
- Does not define market demand (08) or player-to-player trading (09).
### Design principles
- A station is a sales floor. The player is guessing the best price while the market hides the truth.
- Contracts make big sales feel like events, not a stream of tiny numbers.
- Small buy orders are the majority, however, large contracts can also come in. The player must decide to accept or reject large contracts for the asking price, may negotiate.
- The player can set a minimum order quantity to auto process contracts above a minimum ppu (price per unit). Contracts may be negotiated, and buyers may ask for less than the set price.
- Intelligence is bought, not given. Better intel upgrades reveal more of the hidden demand.
### Definitive rules
Construction
- A station is built in orbit or at a space site. It has silos (one per refined product), docks, loading/unloading, advertising / amenities, a contract board and an intel level.
- Stations receive refined goods from the owner's refineries and from other players (09).
Silos and docks
- Each silo has a capacity in units. A full silo stops receiving that product.
- Docks hold visiting buyer ships and incoming cargo ships. Each dock handles one ship at a time. More docks mean more simultaneous contracts.
Buyers and contracts
- Computer-run buyers visit the station on a schedule set by the market (08). Each visit offers a contract: a product, a quantity, a delivery time and a payment.
- Each buyer has a secret maximum price per unit. The player never sees it, but a contract above it is rejected.
- Contract states: Offered, Accepted, Filling, Complete, Failed, CanceledAtClose. Spot acceptance reserves existing silo stock; forward acceptance reserves production commitments and collateral, never nonexistent inventory.
- Contract offers can also be Buy Orders for ore that has not been mined yet. Failure to produce product results in defaulting on the contract and large fees (set in the contract as Default Multiplier).
- The player sets a station markup for each product. The buyer's visible offer is the station's asking price. A buyer accepts if asking price is at or below their secret maximum. A buyer may offer a contract below the asking price.
- Higher asking prices mean fewer buyers accept but more profit per unit. Optimize expected profit per unit time under demand, costs, inventory, timing and buyer budgets; the highest accepted unit price is not necessarily the most profitable policy.
- If a station defaults on enough payments they may be forced to forfeit ownership of the station to the Makers Guild
Revenue
- Revenue from galactic end buyers is paid when a contract completes (all units delivered). This does not delay payments already received by upstream sellers at commercial departure. Partial fills pay pro rata if the buyer allows partials, which each contract states.
Intelligence
- Section 08 is the sole authority for intelligence tiers 0–5, visibility, forecasts and price recommendations. Do not duplicate tier definitions or promise a fixed 10% price hint here.
### Progression and balancing
- Station and refinery construction prices follow 10’s affordability calibration, not a fixed cost ratio or guaranteed profit multiplier. Profit depends on capital, throughput, demand and utilization.
- Upgrades: silo size, dock count, intel level, contract board size, unload rate, advertising and amenities. Section 10 owns caps: numeric storage/rate lines cap at 1000; intelligence caps at 5 and physical counts use their own explicit limits.
### Interactions with other systems
- Reads refined goods (06), hidden demand (08), taxes (02).
- Writes completed contracts to the ledger (02) and score data (01).
- Exposed to pirates and space events (15), defended by garrison (12).
### Edge cases and failure handling
- A station with no stock may not accept a spot contract. It may accept a forward contract for future production, subject to deadline, collateral and default terms.
- Two stations compete for one buyer: apply 08’s effective delivered offer comparison; ties use posting timestamp then offer ID.
- Month end: open contracts are voided with no payment and no penalty (R-03).
### UI and feedback
- A contract board lists offers with product, quantity, asking price and a clock. A price dial shows the player's markup and the hint if intel allows.
- Completed contracts show the profit and a summary line from the AI news voice (19).
### Implementation and acceptance tests
- T07-01: a contract is paid exactly once.
- T07-02: a buyer never pays more than the secret maximum.
- T07-03: reserved stock cannot be sold to another contract.
- T07-04: station information follows 08’s tier permissions; recommendations satisfy T08-07 rather than a fixed price-distance guarantee.
### Open questions
- Should buyers have personalities, such as bargain hunters and premium buyers? Yes. Each planet has approximately 24 different parties (species, guilds, factions, etc) indexed from 1-24. When the game decides to see if a buyer would like to come to the station, it picks a random index. If that index is not generated, it creates that party's personality, background, and demand.
- Should the player be allowed to counteroffer on a contract? Yes
Other Thoughts
Players can reserve docks for their own shipments to ensure that their shipments always arrive without delay. These docks do not sit empty, they just cannot be booked by other players during the expected landing and unloading time of the players own ships.

### Default and foreclosure accounting
- Default fees, collateral, liabilities and station forfeiture follow 02. Thresholds and terms must be displayed before acceptance; a station cannot be seized under undisclosed rules. Forfeiture does not cancel paid cargo commitments.
- Buyer selection follows 08’s effective delivered price and preferences, with deterministic time/ID tie-breaks; lowest nominal ask alone does not override freight or service costs.

### Playable local station preview · 26 October 2026

One local station costs 250,000 test coin and stores 2,000 refined units per product. Silo level L provides `2000 × (1 + 0.04L)` capacity; next-level price is `round(50 × 1.0195^L)`, cap 1000. Own-refinery → own-station transfers are immediate and create no payment. Hourly published spot contracts require existing refined silo stock; completion removes that quantity and posts `GALACTIC_CONTRACT_SALE` once. Repeated or expired contract IDs cannot pay again. Completed IDs are bounded to the current offer hour; expired offers cannot be resurrected. Forward contracts, negotiation and full intelligence tiers remain outside this local slice.

## 08 — Galactic Market, Prices and Economic Events

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
Document 08 owns faction demand, outside supply, benchmark prices, buyer inventories and budgets, economic events, market intelligence and station pricing recommendations. It does not control ownership transfer or settlement (02), shipping (05), production (03/06), or contract fulfillment (07).

### Design principles
Prices arise from economic fundamentals rather than arbitrary gold-rush and shock multipliers. The new planet is a lower-cost supply entrant into an established galactic market; established off-planet suppliers and outside purchasing options always exist. Players may specialize in mining or integrate into refining and retailing. Galactic commodity markets are competitive; local refineries and stations compete on offered price, distance, supply availability and service. Economic calculations are deterministic and run independently of AI-generated narrative.

### Definitive rules — Commodity structure
Each planet has exactly seven ores: two common, four rare and one mythic. Each ore has a use, galactic reference price, outside supply curve, planetary supply potential and buyer demand profile. Rarity is geological scarcity, not an automatic price multiplier. Common ores have relatively deep external markets and normally weak planetary price influence; rare ores may materially affect galactic supply; mythic ores may become strategically important if planetary output is large relative to outside supply. Exact elasticities and market-share targets are provisional balancing data, not fixed laws.

### Definitive rules — Buyer categories and parties
The economy generates approximately 24 persistent buying parties per month. Each belongs to one of six categories: Industrial Manufacturers, Military, Research, Traders, Political Organizations or Fringe Buyers. Parties may represent species, guilds, governments, colonies, cults, religious organizations, ancient civilizations or other organizations; category determines broad economic motives while species and background add variation. Each party has a deterministic identity, activity profile, daily procurement budget, inventories, consumption targets for all seven ores (possibly near zero for some), spending priorities, relevant substitutes, storage limits, external supplier access, geographic location, and contract preferences. Political organization consumption may depend on the population it serves. Traders primarily arbitrage and stockpile, rather than consuming ore industrially.

### Definitive rules — Nested CES demand
Each buying party chooses a best affordable bundle of materials and an outside numeraire good. The numeraire has normalized price 1 and represents all other galactic goods and expenditure opportunities; it is not mineable and is not sold by player businesses. At the top nest, expenditure is allocated between materials and the numeraire. A middle nest allocates material spending among uses, such as construction, propulsion, energy and specialized applications. A bottom CES nest allocates spending among suitable substitutable ores. Ores required for unrelated purposes must not be treated as perfect substitutes. For a CES nest, U = (sum_i alpha_i * x_i^rho)^(1/rho), with sigma = 1/(1-rho), nonnegative quantities, positive weights for applicable inputs and budget sum_i(p_i*x_i) <= B. The engine uses a numerically stable calibrated implementation; zero weights are allowed for non-applicable ores. Faction budget and production requirements constrain purchases. Additional desired stockpiling depends on price, available warehouse capacity and stock targets, rather than being counted as immediate consumption. Missing input needs, substitution elasticities, weights and budget shares are generated and validated with fixed seeds.

### Definitive rules — Requirements, inventories and demand
Each party has daily industrial consumption requirements and stocks by ore. Consumption removes inventory based on activity and available inputs. Desired purchases depend on target consumption, expected replenishment, current inventory, warehouse space, budgets, accessible substitute materials and effective delivered prices. Unfilled requirements may create backlog or reduce faction output according to its activity rules; backlog cannot grow without a defined limit. A trader's demand is primarily inventory and resale driven. Demand is expressed in units per day, distinct from quantity actually purchased. No party can make an economically unlimited premium purchase merely because the market is short.

### Definitive rules — Outside market and price formation
An established galactic economy has external supplier stocks and upward-sloping supply curves per ore. Galactic benchmark prices and quantities emerge from aggregate buyer demand and available external plus planetary supply; outside supply is not unlimited at a fixed price. The newly opened planet begins as an entrant from relative autarky with potentially lower extraction and refining costs, making its goods competitively attractive. The relevant comparison is effective delivered price = seller offer + buyer-specific freight, timing and service costs. Buyers can choose external suppliers when planetary offers are too expensive, unreliable or inconvenient. A price-clearing solver must enforce nonnegative quantities, finite budgets and inventory limits, feasible supply and deterministic tie-breaking. If equilibrium cannot be solved, retain the last valid benchmark and log an error; never invent a random price. Buyer purchases and actual completed sales feed inventory and supply accounting without double counting. Reference prices are hidden internal economic data, not a universal public quote.

### Definitive rules — Local pricing and trade
Player refineries publish raw-ore buying offers; player stations publish refined-goods purchasing offers and selling prices. NPC stations and refineries supply guaranteed basic liquidity but not premium prices. Galactic buyers select offers using effective delivered price, available volume, reputation/service preferences where modeled, and contract rules. Local firms may set markups or discounts, subject to budgets, stock limits, cost and contract constraints. Raw ore does not sell directly to galactic end buyers; refined goods reach buyers through stations. Players may own every stage or specialize; vertical integration is not guaranteed to dominate specialized firms. A station owner may price below, at or above benchmark, with buyers responding to competitive alternatives.

### Definitive rules — Market cycles
There is no mandatory starting gold-rush ore and no fixed mid-month shock multiplier. The month seed establishes initial faction projects, populations, procurement budgets, inventories, external supply, industrial conditions and the timing of possible activity changes. Events such as construction booms, wars, discoveries, recessions, rituals, technological changes and external supply disruptions modify real budgets, requirements, available supply, substitutions and inventories. Prices respond endogenously. Faction plans may be seeded, while economic consequences still depend on realized market conditions. The AI may narrate the events but may not determine their numeric effects.

### Definitive rules — Economic tick and timing
Provisional scheduling: faction production planning and budget replenishment daily; galactic market clearing and buyer order publication hourly; contract and shipment checks at transaction time. All timestamps use UTC and the same event ordering and deterministic simulation in live and offline operation (17). Market clearing is independent of whether any player is online. Spot orders reserve current stock; forward contracts may commit future production with disclosed default conditions (07). Shipments that successfully depart are paid once at departure and guaranteed to arrive without interception, rerouting or destruction (02/05).

### Definitive rules — Intelligence
Station intelligence costs rise sharply, with level 5 intended as a major late-game strategic investment. Level 0: station's own offers, responses, inventory and completed sales. Level 1: broad trend direction by ore. Level 2: estimated galactic benchmark price ranges and historical signals. Level 3: estimated quantities demanded, buyer-category mix and market outlook. Level 4: party-level reports covering estimated budgets, inventories, purchasing preferences and projects. Level 5: detailed faction intelligence, market forecasts, competitor comparisons and recommended asking prices that optimize expected profit per unit time under inventory, cost, demand and buyer-acceptance constraints. Levels 1–4 may show bounded uncertainty; level 5 can reveal highly accurate current state but not guaranteed future outcomes. Do not transmit hidden fields to the client beyond the player's permitted intelligence tier.

### Progression and balancing
Document 10 owns economic affordability targets, including refinery around day 5 and station around day 15. Initial generated markets must support viable common-ore earnings, usable refinery margins, sufficient station purchasers and reasonable competitiveness in low-population worlds. Proposed calibration only: common planetary share of relevant galactic supply 0.1–2%, rare 5–25%, mythic 30–70%; tune from multi-seed simulation. CES substitution, budgets, baseline demand, price response, inventory limits and intelligence costs remain provisional. Test whether specialization and vertical integration can each be competitive. The benchmark should not be artificially held above a floor solely to reward players; viability comes from world-generation constraints and outside-market economics.

### Interactions with other systems
Reads seven-ore definitions and depletion (04), production volumes (03/06), shipping and station location (05/07), ownership and transactions (02/09), time authority (17) and world seed and records (18). Writes deterministic buyer order and market records. Document 07 determines contract lifecycle, document 02 determines coin treatment, document 19 generates names and narratives and document 20 enforces visibility.

### Edge cases and failure handling
A buyer unable to afford a desired bundle reduces purchasing or uses outside options; never goes below zero budget. A buyer with full warehouses cannot stockpile beyond capacity. If planetary sellers provide no inventory, buyers use external suppliers or defer purchasing. If no active players exist, outside supply and faction economic cycles still run. Identical effective offers follow deterministic time and ID tie-breakers. Failed market optimization reuses the last valid state and records a diagnostic. Month-end open contracts follow document 07, and shipments already paid retain guaranteed-delivery settlement semantics until rollover rules apply.

### UI and feedback
A station owner can inspect sales conversion, offers, price changes allowed by intelligence and faction reports at advanced levels. The level 5 report can show current galactic demand, faction estimates, outside competition, projected sell-through and a profit-maximizing suggested ask with an explanation of assumptions. The UI must label model forecasts as estimates, not certainties. Low-intel mine owners do not receive private station benchmark data.

### Implementation and acceptance tests
T08-01: all parties satisfy budget non-negativity and stock conservation under every market tick.
T08-02: an increase in outside supply with unchanged demand cannot produce an unexplained positive price jump.
T08-03: identical seeds, events, offers and elapsed time reproduce buyer decisions and benchmark prices.
T08-04: a buyer selects an outside supplier when its effective delivered price dominates an equivalent local offer and there are no compensating constraints.
T08-05: an event changes underlying faction variables rather than applying an arbitrary global multiplier.
T08-06: level 0 through 4 clients cannot retrieve level 5 faction parameters or pricing recommendations.
T08-07: a level 5 recommendation maximizes expected profit over tested feasible price points and respects budgets and inventory.
T08-08: zero players and multiple player counts maintain a functioning background economy.
T08-09: finite inventories, budgets and outside supply are not double counted.
T08-10: for fixed budgets, an increase in all local prices can shift spending toward the numeraire.

#### Open questions / provisional tuning
Set nested CES elasticities and calibrated weights by buyer category, external supply elasticity, faction population-to-demand conversion, budget renewal rules, stockpile horizons, solver convergence tolerance, hourly versus alternative clearing frequency, intelligence cost curve and forecasting error bounds. These are parameters to simulate, not numbers for AI to invent.

### Simulated hourly market preview · 26 October 2026

The local industry's published initial refined quotes are 120/138/126/108/180/276/480 coin across the seven canonical ores. Seeded outside supply/demand and actual player refined sales influence each hourly clear. Relative supply pressure changes quotes by no more than ±10% per clear; invalid input preserves the last valid quote. Offer quantities are deterministic whole quantities of 20–100 per ore and expire at the next simulated market hour. Lifetime refined sales are accounted separately from current-hour supplied quantity.

**This is a responsive local market experiment, not the accepted nested CES solver, a shared multiplayer economy or a disclosure of hidden global demand.** The UI shows published offers only. Canonical Release B market requirements and section 21 certification remain binding.

### CEO market direction confirmed · 26 October 2026

**Q-13: deterministic supply and demand using CES utility functions and bid offers.** Section 08’s nested CES demand and deterministic market clearing are the required economic model. Published bids reflect buyer requirements, substitution, inventories, budgets and delivered costs; raw-ore refinery bids derive from refined output economics under section 06. Geological rarity is not an automatic fixed price multiplier.

The A2 fixed-tier premium/token-bucket implementation and the local sandbox’s hourly pressure rule remain temporary fixtures, not accepted substitutes for CES or approved pricing laws. The earlier NPC liquidity guarantee must be reconciled explicitly with this model; this answer does not approve either an unlimited fixed premium or the current finite-premium formula. Preserve checked settlement and last-valid equilibrium fallback while implementing and testing the actual model.

## 09 — Multiplayer Trading and AI Businesses

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines how players trade with each other, how computer-run buyers and sellers behave, and how payments and failures are settled.
- Covers few-player behavior, offline players and insufficient funds.
- Does not define prices (08) or ledger storage (18).
### Design principles
- Other players are the best customers and the best competition. The game should make player-to-player trade the more profitable path whenever it is available.
- A month with 3 players must feel as alive as a month with 30. Computer-run businesses fill the gaps.
- A trade never depends on both sides being online.
### Definitive rules
Player to player trade
- Player-to-player trade happens through shipments. A player ships ore or refined goods to another player's refinery or station, and is paid by the destination at takeoff from origin port.
- A destination appears on the sender's list only if its owner has set Buy to yes for that product (06, 07).
- There is no direct coin transfer between players and no free gifts. Coin moves only through authorized shipment, contract and system ledger operations (R-02).
Computer-run businesses
- Computer-run refineries and buyers always exist. Their count scales with the planet size and number of active players so there are at least 3 computer-run refineries and 4 buyers per planet.
- Computer-run businesses provide guaranteed basic purchase access backed by explicit external coin sources, but their bid prices respond to market conditions, and they cannot guarantee premium prices or unlimited premium demand.
- They follow rules, not AI judgment. The AI only names them and writes their lines.
Payment and settlement
- Every purchase is recorded in the ledger with a unique ID, buyer, seller, product, units, price and time (document 18).
- Payment happens when the ship takes off. Seller and buyer records are changed together in one atomic step.
- If the player buyer cannot pay the full amount, the ship does not take off to that destination (document 05).
Offline players
- Offline players' refineries and stations keep buying, selling and refining with their saved settings (document 17).
- Offline owners are not charged for missed events, but they are exposed to the same hazards and threats as online owners.
### Progression and balancing
- Player-run businesses may outperform NPC bids through price, location, supply and service, but no fixed percentage advantage is guaranteed.
### Interactions with other systems
- Reads destinations and budgets (06, 07), prices (08), identity and roster (18).
- Writes shipments (05) and ledger entries (02).
### Edge cases and failure handling
- A paid shipment cannot be intercepted, destroyed or rerouted after departure; any destination closure occurs after its committed deliveries settle (05).
- The buyer's budget changes between departure and arrival: payment is checked at departure only.
- Only one player in a month: all trade is with computer-run businesses and the leaderboard still works.
### UI and feedback
- Exchange board lists offers and shows the sender's profit per hour for each option.
- A shipment shows its buyer, agreed departure payment and guaranteed arrival time. A rejected pre-departure order shows why no shipment launched.
### Implementation and acceptance tests
- T09-01: a paid shipment changes both players' coin by the same integer amount in opposite directions; player-to-player tax is zero.
- T09-02: a shipment cannot be paid twice by any sequence of retries.
- T09-03: with one active player the game still produces buyers and contracts.
- T09-04: offline players' buy panels settle ships correctly.
### Open questions
- Should players be able to form alliances with shared dock access? No

## 10 — Upgrades, Progression and Balance

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and authority
- This section owns costs, caps and affordability targets. The following is an explicit initial calibration, not a claim that full-month gameplay balance has already been simulated (C-01).
### Design principles
- Bulk Buy 1/10/100/Max; independent upgrade lines; no milestone multipliers. Facilities unlock through ownership/purchase, not elapsed-day locks. Defense branches unlock through Military Strategy as specified by 12/23.
Earnings and month targets
- Count cumulative gross external earnings as defined in 02, not current wallet balance, grants or self-trade turnover. Keep separate current-run and month-to-date counters.
- Active benchmark: 100,000 after hour 1; 3,000,000 after hour 6; 100,000,000 after day 1. For d≥1, E(d)=100,000,000 × 1.5^(d−1). Use elapsed 24-hour days from month start for calibration; do not truncate 28/29/30/31-day months.
- End-of-day reference table: day 5 ≈506.25M; day 7 ≈1.139B; day 14 ≈19.462B; day 15 ≈29.193B; day 21 ≈332.526B; day 28 ≈5.682T; day 30 ≈12.783T; day 31 ≈19.175T.
- These are earnings, not guaranteed savings. Actual coin and investments depend on expenses, losses, strategy and market conditions. An idle daily-check-in profile should earn roughly 60–70% of a comparable active profile.
Cost indexing and arithmetic
- A newly purchasable line starts at L=0. Buying the next level costs max(1, round(base × growth^L)); its new level is L+1. A supplied starting level, such as starting dig level 1, is granted rather than charged.
- Total bulk price is the sum of individually rounded level prices. The geometric sum may find a candidate Max count, but exact summed prices determine the actual transaction. Use positive round-half-up consistently. Check funds, cap and safe-integer limits atomically before charging.
- MAX_COIN=2^53−1. No purchase is silently capped to bypass overflow. Never reset a cost curve at a technology skin or create invisible milestone boosts.
Calibrated line families
| Family | Base next-level cost at L=0 | Growth | Cap | Approximate total cost L0→cap |
| Mine dig | 15 | 1.0210 | 1000 | 757.904B |
| Lift throughput / shaft-buffer capacity | 25 | 1.0205 | 1000 | 792.858B |
| Ship speed / capacity / pad loading rate | 30 | 1.0200 | 1000 | 597.397B |
| Surface / refinery input-output / station silo capacity | 50 | 1.0195 | 1000 | 625.411B |
| Refinery processing speed / budget-limit capacity | 100 | 1.0190 | 1000 | 786.014B |
| Military/HQ/research rate lines, unless specifically capped | 250 | 1.0180 | 1000 | 777.044B |
- Each separately purchased line uses its own cost schedule; the table is not a fee charged once for the entire family. New line families require a registered curve and affordability test before implementation.
- Those totals are per line, not an assertion that every shaft and every facility can be maxed in one month. Reaching level 1000 should require late-month specialization. Target most actively used core lines above 80% at month-end; optional/unused lines and every line on every outpost are excluded.
- The first week prioritizes cheap levels and operational growth; the final third funds expensive high levels. Remove the former rigid “first 250 in week 1, remaining 750 only in final third” rule. Measure actual progression against scripted-player simulations.
Effects and throughput
- Dig effect remains baseRate × (1+0.04L). Shipping, loading and numeric capacity lines retain the initial baseStat × (1+0.04L) comparison calibration. The original linear lift effect is retained as a historical reference; the current C-01 lift benchmark candidate is defined below. These coefficients remain provisional; ship speed units remain units/minute.
- Refinery yield caps at 95%: 70% + 25% × min(L/1000,1), using the processing family’s base/growth. Its yield upgrade cannot create more than that output fraction.
- Calibrate lift base throughput and storage so a fully upgraded balanced 30-shaft configuration is not permanently lift-bound. This is a throughput acceptance test, not a promise that arbitrary worker counts or evolution combinations cannot constrain it.
### C-01 production benchmark candidate C01-LIFT-02

**Status: experimental benchmark for further pipeline calibration; not certified economic balance or a universal production default.** The CEO authorized this tuning in Q-08. No deployed browser gameplay changed.

| Parameter | Explicit benchmark input / result |
|---|---|
| Shaft 1 base dig rate | 1 unit per assigned worker per minute; study input only |
| Shaft depth / dig / cart effects | Existing 2.2 per shaft depth; 1+0.04L dig; 0.25+0.075×cartLevel utilization |
| Candidate lift throughput | **2 × 1.0316^L units/minute**, L=0…1000; smooth growth, no milestones |
| Lift cost and cap | Existing base 25, cost growth 1.0205, cap 1000; unchanged |
| Maximum shaft benchmark | 30 shafts, 60 assigned workers each, dig 1000, carts 10; neutral modifiers: approximately 38.409T units/minute |
| Candidate maximum lift | Approximately 64.918T units/minute |
| Selected analytical modifier envelope | Soil 1.25, weather 1.25, buffs 1: approximately 60.014T units/minute; **study envelope only, not world limits** |
| Envelope lift headroom | Approximately **8.17%**; neutral and both seeded comparison scenarios also pass the rate comparison |

- The earlier growth 1.0311 candidate reaches approximately 39.978T units/minute. It passes the neutral comparison but fails both positive-modifier seeded fixtures and the selected analytical envelope; it is retained only as a comparison profile in the report and small flow fixtures.
- Evidence and exact deterministic inputs: [Production calibration study](../development/calibration/Production-Calibration.md) and its [JSON results](../development/calibration/Production-Calibration.json). All 1001 reachable lift levels per exponential candidate were checked for finite rates below MAX_COIN magnitude; ore rates are fractional quantities, not integer coin postings.
- The flow model is a bounded one-second study with explicit workforce assignment, finite shaft buffers, one shared lift, finite surface yard and a synthetic downstream drain. The drain is not a shipment, sale, ledger source or market. Material/habitat/automatic allocation, depletion, weather generation and the mine-to-market pipeline remain unimplemented in this model.
- Passing these rate comparisons is **partial structural evidence only**, not completion of T10-11 or section 21. Storage, loading, fleets, buyer budgets, prices, strategy, payback and 28/29/30/31-day full simulations still require calibration. Do not infer storage bases from a one-second burst artifact or silently apply this study’s bases to every material/world.
- Coin remains exact whole-integer accounting. The floating-point ore-unit study reports its residual and per-ore numerical tolerance separately; it cannot certify commercial inventory settlement precision.

Specific caps and physical counts
- Shafts: hard cap 30. Shaft k costs round(120 × 2.4^(k−1)); shaft 1 is supplied. Shaft 30 is intentionally extremely expensive relative to month earnings. No shaft 31 exists.
- Lights, supports, carts and bunkhouse: cap 10; initial cost base 150/200/400/100 respectively, growth 1.8 per level. Utilization = 0.25+0.075×cartLevel (cap 1). Supports hazard factor = 100^(−supportLevel/10). Lights affect insanity and eligible encounter detection/rates under 14/15, never universal immunity. Shaft worker capacity = 10+5×bunkhouseLevel.
- Mine pads: physical cap 12. Pad n=2…12 costs round(4,000×6^(n−2)). Loading-rate upgrades are separate and cap at 1000.
- Refinery and station docks: initial physical cap 24; extra dock n costs round(20,000,000×1.6^(n−2)). Dock scheduling remains finite. Counts are not 1000-level rate upgrades.
- Intelligence cap 5: successive level costs 100M, 1B, 10B, 100B, 1T. Section 08 owns information revealed.
- Vocabulary cap 100: base 10,000, growth 1.10. Accuracy cap 75: base 20,000, growth 1.12. Languages cap equals available distinct world languages: base 5,000,000, growth 1.35. For a finite registry, validate every reachable language-slot price against the integer limit during world generation. These short-track exceptions replace the old blanket 1.06–1.18 growth range.
- Other short physical caps require explicit definition; “1000 for most lines” never overrides a listed cap.
Facility and expansion affordability
- First on-planet refinery: initial construction price 250M (about 49% of day-5 gross target). First station: 10B (about 34% of day-15 gross target). Fit-out, stock, fleets, defenses and operating escrow consume additional capital. These initial prices must be tuned if simulations permit sustainable operation much earlier than the day-5/day-15 targets; do not add hidden date gates.
- First outpost: initial site price 2B; subsequent outpost site price multiplies by 2.5. Add scouting, equipment and minimum garrison costs. Target sustainable first outpost during days 8–14; price alone is not the full expansion investment.
- Facility timing targets are the median active scripted profile with reinvestment, not the earliest possible cash-only purchase. Horizontal specialization remains valid and vertical ownership is not automatically superior.
- Recruitment and HQ-specific bases, branch unlock levels, worker-habitat costs and evolution prices remain C-04/C-06 calibration requirements; no implementation may guess an omitted coefficient. Use the defined family curves only after a line has an explicit base effect/cap.
### Validation and acceptance
- T10-01: prices are monotonic, nonnegative integers. T10-02: seeded active/idle/aggressive/specialist simulations measure target earnings and stage dates; report failures rather than force results with rewards.
- T10-03: caps hold under concurrent bulk buys. T10-04: no milestone multiplier exists.
- T10-08: every listed level-1000 family’s highest and cumulative price fits MAX_COIN; verify exact rounded bulk sums.
- T10-09: run 28-, 29-, 30- and 31-day scenarios; report used-line level distribution, investments and closing wallet separately.
- T10-10: verify most used core lines can exceed 80% by closing for the target profile without claiming every optional line is affordable.
- T10-11: a balanced maximum mine meets the lift test; the UI still gives visual inference only.
### Translation research

Three independent purchasable lines: Vocabulary (initial 0, cap 100, +1 percentage point recognition per level); Accuracy (initial 0, cap 75, reduces conditional word-confusion chance from 75% to 0%, -1 point per level); Languages (initial 0, +1 distinct active language slot per level, no predetermined language list). Languages is intentionally expensive relative to the other two; use the initial calibrated base cost and growth listed above, and show its actual next price before purchase. Use the standard cost(level L)=round(baseCost × growth^L), with the explicit short-track curves listed above and Buy 1/10/100/Max limited by remaining levels, funds and caps. The Languages cap is a provisional world-language-count limit, not automatically 1000: it cannot exceed the number of distinct supported language IDs. No stage gate or milestone bonus is introduced. The player's comprehension is not a fourth purchasable statistic: effective correct-token probability = (Vocabulary/100) × (1 - max(0,75-Accuracy)/100). Coin charges are atomic and idempotent (02/18). T10-05 costs rise monotonically; T10-06 each Languages purchase adds exactly one assignable slot; T10-07 capped tracks cannot be overbought.

### Early-game profile C01-EARLY-01 · 25 October 2026 (provisional)
- CEO confirmed: starting coin 0; late-join grant 20% of median cumulative earnings; ore in whole units; engineering may tune missing coefficients. Adopted for development: NPC nearest-refinery bid 40 coin/unit, 1-unit minimum paid departure, NPC unload fixture 1,500 units/min, miner hire round(20×1.004^(owned−5)), habitat line 50×1.0195^L (cap 1000, capacity 10+2L). Evidence and caveats: [Early-game calibration](../development/calibration/Early-Game-Calibration.md). Not certified balance; the 10-level habitat cap implied elsewhere cannot staff 30 shafts and is superseded by this proposal pending review.
- Same-timestamp event priority (engineering call): month close → hazards/ecology/combat → production → arrivals → departures/commands → contract deadlines → hourly market clear → news.
- **C01-EARLY-02 (provisional):** landing grants 5 whole units of common ore on the yard, in kind (not coin, not earnings), so the first paid departure happens within seconds. A ship keeps loading while at least one whole unit waits and the hold has room, then departs; paid departure still happens at takeoff.

### Sandbox pacing profile C01-SANDBOX-01 · 26 October 2026 (provisional)

**The CEO supplied a separate economy/pacing rebuild and authorized engineering judgment.** Adopt it as a local playability experiment, retaining the purple pixel interface. It does not replace the authoritative level-1000 curves above.

| Sandbox line | First next-level price | Price growth | Effect per level |
|---|---:|---:|---|
| Global Pick | 680 | 1.8 | ×1.4 ore/min per miner |
| Global Lift | 900 | 1.8 | ×1.4 throughput, starting at 100 ore/min |
| Hauler | 780 | 1.8 | ×1.4 hold; ×1.04 speed |

Bulk buys sum individually rounded level prices and buy the affordable quantity up to the requested count. Shaft k costs `round(190 × 4.1^(k−2))`; ten miners are included. Nominal local line ceiling is 400 and mine ceiling is 30 shafts, but safe-integer prices become unaffordable/unavailable well before all these nominal ceilings. This is an unresolved experimental progression limit, not a claim that every line or shaft is reachable in a month. Full-wallet takeoff waits without overflowing.

The supplied costs 34/45/39 and growth 1.75 produced 22.6M at hour one and 4.09Qa at day thirty in the fluid study. A bounded comparison selected the higher bases/growth above: actual one-second scripted play earns **100 coin at second one; shaft two is affordable at second thirteen; 130,010 gross at hour one**, with no test grants. The fluid approximation earns 184,358 at hour one, 62.4B at day seven and 3.013T at day thirty; corresponding targets are 100K, 1.139B and 12.783T. Daily-check-in fluid earnings are about 63% of active at day thirty. **Intermediate pacing still diverges substantially; neither this experiment nor the earlier profile certifies full-month balance.**

Reproducible scripts, complete tables, policy assumptions and exact-model evidence: [Sandbox economy evidence](../../play/sim/README.md). Finite storage, discrete shipments and rare ores make the exact engine different from the fluid approximation.

### Ported fast sandbox profile C01-SANDBOX-02 · 26 October 2026 (provisional)

The newer Claude sandbox branch uses next-level bases Pick 34, Lift 45, Hauler 39 and cost growth 1.75; the ×1.4 effects, depth/shaft curves and named tiers are unchanged. Ported this local profile while retaining industry, home safety, worker catch-up, checked accounting and existing saves. It supersedes the **local** C01-SANDBOX-01 prices; server prices/caps are unchanged. CEO approved this faster progression and prioritizing fun on 26 October 2026. Coefficients remain tunable, not balance-certified. Exact scripted first-hour earnings are 728,507 versus the 100K benchmark; fluid evidence remains an approximation. No claim of full-month balance is made.

## 11 — Exploration, Scouting and Expansion

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines the planet's regions, starting sites, site generation, scout drones, reports, outposts, abandonment and destruction.
- Does not define combat (12) or hazards (15).
### Design principles
- Expansion is a bet on incomplete information. Scouting reduces uncertainty at a cost.
- All starting sites are fair. Every site later has a personality.
- Every outpost is a promise to defend something far away.
### Definitive rules
Sites
- A planet has about 6 to 12 regions per active player. Sites can be set up anywhere in a region as long as it is not in too close proximity to another site.
- Regions vary with ore distribution, common ore type, weather, temperature, soil hardness, topography, and wildlife.
- Each site has: ore richness for each ore from grade 0%-100%, which common ore, quantity of each vein, soil type, tribe presence, wildlife, weather pattern and distance to other sites and destinations.
- Starting sites are chosen about 1 standard deviation above the average and are equal in expected value for every player (C-03).
Scouting
- A scout drone takes days to report on a site. Upgrades shorten this to hours.
- A report shows part of the site: each aspect has a confidence from 0 to 100 percent that depends on the drone level. Reports can be wrong within their stated confidence. Reports should CI. Starter reports show only Overall Ore density (without any Mythic Ore information), Soil hardness, and common ore. Final reports should show narrow estimates on total quantity for each ore type (total veins, vein size), soil roughness exactly, local wildlife and danger levels, weather patterns and disturbance estimates, tribal relations and tribe strength, etc.
- A player can send several drones at once. They can build up their drone fleet (just like their ship fleet, however, drones are incredibly expensive). Drones can be lost to wildlife or weather with a small chance.
Outposts
- An outpost is an additional mine at a scouted site. The cost of the nth outpost rises (C-03).
- An outpost needs a minimum garrison. Losing all defenders may disrupt operations, but only a qualifying hostile-tribe assault or terrifying monster attack can fully overrun and destroy an outpost (12).
- Abandoning an outpost is allowed. The player is warned that an abandoned outpost calls a missile strike that destroys the site (R-04).
Expansion triggers
- Rare veins run out (document 04). The game shows depletion warnings so that players can scout early.
- A depleted starting site remains useful for common ore.
### Progression and balancing
- First outposts are expected in the second week.
- Drone base time: 3 days. Max upgrades bring it to 2 hours.
### Interactions with other systems
- Reads ore generation (04), tribes (13), wildlife (14), weather (15).
- Writes new mines to production (03) and garrison needs (12).
### Edge cases and failure handling
- A scout drone arrives at a site that has changed (depleted, taken): the report shows the current state and is marked stale.
- Two players want the same site: the first to complete purchase gets it. The other is refunded.
- The home mine cannot be destroyed or fully besieged by combat. If all outposts are lost, the home mine remains available and may suffer temporary production disruption (12).
### UI and feedback
- A planet map shows regions, known sites with confidence bars, drones in flight and outposts.
- A report uses fuzzy values like "about 40,000 units" when confidence is low.
### Implementation and acceptance tests
- T11-01: starting sites are within 5 percent of equal expected value.
- T11-02: report values are within their confidence bounds at least 95 percent of the time.
- T11-03: abandoning an outpost triggers exactly one missile event.
### Open questions
- Should players be able to sell scout reports to others? No
- Should the missile strike be avoidable by paying a fee? No

### Timing and research access
- Sustainable first outpost target: days 8–14. Scouting is accessible before station ownership and is not Stage-3-gated. Section 10 owns site prices; first construction requires a completed valid survey and planned minimum garrison.
- Translation research is available without a stage gate. Exploration/intelligence is a UI grouping, not a requirement to own a station.

## 12 — Soldiers, Combat and Base Defense

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
Defines army divisions, recruiting and supply shuttles, defense assignments, automated patrols, planning upgrades, combat outcomes, casualties, reinforcement, and location security. It controls combat resolution; documents 13–15 control opponents and hazards. Soldiers primarily defend sites and transport routes. Offensive tribal campaigns, where permitted, are governed by 13.

### Design principles
Manage formations and priorities, not individual soldiers. Defending production and protecting miners is as important as defeating an enemy. Different divisions should have complementary uses, creating meaningful tradeoffs without equipment micromanagement. Combat is deterministic in outcome from saved state, elapsed time and seed, and live animation cannot affect the result. The starting home mine remains playable and cannot be fully besieged.

### Definitive rules — Division structure
Four division types exist: Infantry, Armored, Specialist and Air. A division is a deployable formation with a troop count, location, assignment, readiness, morale, experience (if enabled), weapons level and armor level. Troops are purchased in batches for a division; individual members are not managed as separate UI units. Division-specific upgrades apply to all eligible troops in the formation. Each site may have multiple divisions, with limits governed by barracks, hangars and military strategy upgrades.
Infantry: balanced default ground force with useful endurance, affordable cost and moderate response speed; suitable for routine mine defense and patrols.
Armored: expensive, slow-moving heavy force with high power and endurance; effective against large monsters and major surface assaults but often arrives too late to prevent miners being disrupted. It is not the best default shaft patrol.
Specialist: highly mobile rapid-response ground force with good interception, rescue and shaft coverage; effective at reducing miner exposure and restoring operations but less effective against major armored or massive threats.
Air: mobile aerial/orbital coverage used against flying creatures, pirate activity, station/refinery raids and vulnerable return voyages. Air requires appropriate facilities and does not replace underground ground defenses.
Exact damage, durability, speeds and type advantages are provisional tuning owned by this document and 10. No fifth permanent troop category is active in this version.

### Definitive rules — Unlocks and upgrades
Infantry is unlocked at the start. Military Strategy is the common progression line that unlocks Specialist, Armored and Air in that order by provisional strategy thresholds. Each branch purchases troop strength and the branch-wide research lines defined by adopted 23. Weapons and armor are capability groups, not a restriction to two purchasable lines. No individual kits, per-soldier inventories, ammunition purchases or squad-specific loadouts. Security Planning is a separate strategic upgrade that improves automated patrol coverage, sector assignment, response coordination and the chance an incursion is intercepted before reaching miners. Barracks and air facilities determine formation and troop capacity; document 10 sets costs and level curves. Fixed numerical unlock thresholds remain provisional until balance tests.

### Definitive rules — Recruitment and arrival
Recruits are purchased into an incoming reinforcement order. They do not spontaneously appear at the barracks. A supply shuttle transports personnel to the destination site and then the troops join their assigned division when unloading finishes. Orders have a departure timestamp, ETA, size, cost and destination. Recruitment and delivery time use the shared deterministic event queue. Weather or landing-pad availability may delay shuttle departure or arrival; after successful dispatch, ordinary reinforcement transport is a scheduled delivery. Until arrival the recruits do not count as present defenders. Barracks capacity must be available before the order can be completed. A division may remain understrength while replacements are en route. The supply shuttle is distinct from commercial paid shipments.

### Definitive rules — Garrisons, patrols and security planning
Ground divisions are allocated to a site, with optional priority sectors such as upper shafts, deep shafts, lift, miners' habitat, surface yard and access points. Infantry and Specialists automatically patrol their eligible shaft sectors based on saved patrol policy; patrols are a background allocation and response calculation, not individual walker simulation. Armored divisions normally hold major defensive sectors unless specifically assigned elsewhere. Air maintains coverage zones for suitable surface, orbital and route assets.
Patrol coverage depends on assigned troop count, route burden, shaft count/depth, readiness and Security Planning. Raising Security Planning improves effective coverage and reaction efficiency without creating troops or guaranteed immunity. The player chooses broad defense priorities (miners first, balanced, infrastructure first), not individual waypoints. Every shaft can receive patrol coverage where physically accessible, but finite troops mean some sectors may be uncovered. A sector's response time and protection are computed from the same function used by the simulation and user-visible estimates.

### Definitive rules — Threat and encounters
Threat is hidden by default and is not a permanent number on the ordinary defense panel. Scouting (11) reveals site-level threat estimates, threat sources and confidence according to drone quality; more advanced intelligence may refine estimates. Threat evolves with shaft depth and new creature habitats (14), nearby tribal interactions and hostility (13), and environmental conditions (15). Home starting sites contain no hostile tribes and no terrifying boss-class monsters capable of taking over the site. Ordinary creatures may still interrupt shafts or cause limited production losses. Threat is an input to encounter probabilities and enemy strength, not a direct guarantee of a fight.

### Definitive rules — Combat and outcomes
An encounter first checks whether an assigned patrol detects and intercepts it before contact with workers or key infrastructure. Response time, coverage, sector priority and attacking creature behavior determine the time before defenders engage. Combat uses adopted 23’s detection, targeting, hit, location, protection/penetration, impact/stress, functional-state and morale event sequence, with stable seeded variation. Summary strength/durability displays are estimates, not a second resolver. Division types have meaningful strengths but no automatic win conditions. Casualties and downtime follow the resolved encounter, not animation. A slower successful defense can still cause avoidable miner evacuation or reduced production. Specialist rapid response may prevent damage even if its direct combat power is lower. Armored forces excel when a large threat must be contained. Air handles flying and return-route threats and assists station/refinery defense. Defenders do not pursue targets beyond an assignment without a rule from document 13.
A division may become wounded, disrupted, retreat or require replenishment; the engine records surviving strength and recovery time. Morale and readiness are aggregated at division level, not computed through individual soldiers. A defeated garrison may lose control of a sector, reducing production or forcing temporary site shutdown where rules permit.

### Definitive rules — Home mine and outpost loss
A home mine cannot be captured, fully besieged, permanently erased or forced into complete production stoppage by combat. It has no hostile local tribe and no terrifying boss-class monster encounter. If ground defenders fail, affected shafts or surface functions may suffer bounded temporary production reductions until recovery; the player can always recruit and rebuild. A zero-defender home mine may suffer attacks but cannot be eliminated. Outposts can be fully overrun or destroyed only by qualifying hostile tribal forces or rare terrifying monsters defined in 13 and 14. Ordinary wildlife, routine raids and ordinary hazards may disrupt an outpost but do not automatically destroy it. Outpost destruction and its economic consequences follow 11 and the accounting of 02/18.

### Definitive rules — Air escort and transport exposure
Successfully paid outbound cargo deliveries are irrevocable and cannot be intercepted, destroyed or rerouted (02/05). After cargo is delivered, an empty commercial ship on its return leg may be attacked by pirates or flying beasts. Air cover reduces the likelihood and consequence of such return-leg attacks; facility air defense also protects stations and refineries. If an empty return ship is disabled or lost, no previously paid sale, delivered inventory or coin transfer is reversed. Replacement/repair and fleet availability consequences are tracked in 05/15. A vehicle that takes on cargo for a new paid outbound delivery is protected again after departure. Air is not an excuse to reintroduce hazards to committed cargo deliveries.

### Progression and balancing
Infantry handles routine early-game threats. Strategy unlocks Specialist, then Armored, then Air; all four become meaningful at appropriate colony stages. Security Planning should reduce production losses through better coverage and faster response, independently of raw combat strength. Defense spending competes with growth spending, but routine starting-home defense must not bankrupt or eliminate a player. Armor, weapons, strategy and planning have visible effects and prices owned by document 10. Simulate low, median and late-game troop sizes to keep outcomes proportional.

### Interactions with other systems
Reads sites and reports from 11, enemy activity from 13–14, environmental and space events from 15, time from 17, and accounting from 02. Writes division rosters, patrol assignments, battle event records, casualties, sector disruption and recovery events to 18. Document 19 decides whether a battle merits narrative treatment; document 20 controls threat visibility. Ship return exposure follows 05.

### Edge cases and failure handling
If there are no defenders, home shafts may take bounded temporary disruption but the home mine remains operational. An unprotected outpost can fall only to a qualifying takeover threat. Reinforcements still in transit cannot retroactively defend a completed engagement. Simultaneous attacks on different sites are resolved separately and deterministically. One division assigned to multiple sectors cannot be counted at full strength in all sectors simultaneously. Off-line combat uses saved policies and matches live-play resolution. A returning empty ship attacked while air cover is unavailable follows the seeded risk rules of 15 without reversing an outbound transaction.

### UI and feedback
The Army screen shows four division cards with troop counts, status, weapon level, armor level, role, assignment and reinforcement ETA. A Security Planning panel shows patrol distribution, expected response and exposed areas without revealing undiscovered threat values. Broad priority presets replace manual deployment of individual soldiers. Scout reports show threat estimates with confidence; ordinary dashboards hide precise threat. All encounters create an objective log with losses and production effects; only significant fights receive AI-written narratives. A battle is significant when its casualties, division strength lost, production hours disrupted or infrastructure damage exceeds a configurable threshold measured against that player's current military strength, income and colony scale; apply the same threshold function to early and late players. A supply shuttle visually arrives with recruits rather than troops spawning inside the barracks.

### Implementation and acceptance tests
T12-01: identical saved state, timestamp and seed yield identical division-level combat outcomes.
T12-02: division casualties cannot exceed troops present and reinforcements do not fight before shuttle arrival.
T12-03: improved Security Planning increases eligible coverage or reduces response delay under a fixed staffing scenario.
T12-04: a home mine never enters a full siege, suffers permanent capture or reaches complete combat-caused production shutdown.
T12-05: only hostile tribes or terrifying monsters can fully overrun an outpost.
T12-06: specialists generally respond faster than armored formations at equal conditions; armored formations outperform against qualifying massive threats under calibrated conditions.
T12-07: a paid outbound cargo trip is never attacked; an empty return leg may be and air protection affects its risk.
T12-08: hidden threat values are inaccessible without the proper scouting/intelligence entitlement.
T12-09: only battles that satisfy the progress-relative significance threshold produce AI summary stories; every battle still has a factual log.
- T12-10: purchased branch research matches 23; upgrades apply to all eligible formations and new recruits, with no per-soldier equipment inventory.

#### Open questions and provisional tuning
Military Strategy unlock level thresholds; division capacity and unit costs; role multipliers and speeds; patrol sector allocation algorithm; recruit supply-shuttle capacity and ETA; acceptable home-mine temporary loss bounds; return-trip risk and air mitigation; and relative battle-story significance thresholds. No named-hero or manual per-soldier control system is planned.

### Authority and purchased equipment
- Section 23 is adopted for combat, command HQ and branch equipment research. Infantry: close defense, rapid fire, precision, area denial. Armored: heavy weapon, armor, mobility, targeting. Specialist: rescue, environmental suits, reconnaissance, adaptive tools. Air: interception, escort, sensors, propulsion.
- Each branch also has explicit shared protection/armor progression and aggregate troop readiness; a named line such as Armored armor is that branch’s protection line, not a duplicate purchase. For other branches the protection line is additional to the four specialty lines. Costs and exact effects must be registered in 10 before release.
- HQ lines and Military Strategy/Security Planning are distinct from equipment. All eligible units receive branch research; remote retrofit delay is off by default (C-09).

### Local home-safety slice · 26 October 2026

A 250-coin local supply order brings ten infantry after 60 simulated seconds; ordered troops provide no coverage in transit. Seeded home incidents are gas, small cave-ins and pests, with no casualties, capture or cargo losses. Unassisted response reduces production to 75% for at most 30 seconds; deployed infantry response keeps 90% for ten seconds. Incidents recur 180–360 seconds apart and always recover. These are provisional local coefficients, not the full section 23 functional combat resolver. Paid outbound commitments are unaffected.

## 13 — Tribes, Diplomacy and Campaigns

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines tribal identity, languages, hostility, raids, negotiation, tribute, ceasefires, mining rights, extermination campaigns and their consequences.
- Tribes are hostile by default. The player can change that, at a cost.
### Design principles
- Tribes are the main reason a site has a personality. Each has a face, a script and a temper.
- The player's choices must have lasting effects within the month.
- Negotiation should feel like a puzzle, not a lottery. The AI writes the dialogue, but the engine decides the outcome.
### Definitive rules
Tribe identity
- Each tribe has: name, script, temperament (aggressive, wary, greedy, proud), size, strength, territory and a hostility score from 0 to 100.
- Scripts are drawn from real writing systems (for example Han characters, Latin, Cyrillic, Arabic or Mongolian) and used for names and signs. The engine picks the script, the AI creates the words, and the interface applies the translation technology rules below; there is no free translation reveal.
Hostility and raids
- Hostility rises over time while a tribe's territory contains the player's mine and falls with tribute and success in negotiation.
- At high hostility the tribe raids. Raid size and frequency rise with hostility and fall with garrison strength (12).
- Raids target mine sites and eligible outposts. Paid outbound cargo deliveries cannot be intercepted; empty return legs may face applicable pirate or flying-beast threats (05, 12, 15).
Negotiation
- The player can open a negotiation. A round has an offer (tribute, goods, mining rights, a hostage) and a stance (respect, trade, threat).
- The engine scores the offer against what the tribe wants. The result is accepted, countered or refused. A tribe's temperament changes what it values.
- Up to 3 rounds. Failure raises hostility (C-04).
Tribute, ceasefire and rights
- Tribute is a regular payment of coin or goods. A ceasefire lasts a set time. Mining rights allow safe work in a zone for a fee.
- Breaking an agreement (late tribute) ends it and raises hostility sharply.
Extermination campaigns
- A campaign is a series of attacks planned by the player against a tribe's territory. The player chooses soldiers to commit and a target.
- Campaigns use the combat system (12). They take real time (hours to days) and risk losses.
- If the player wins, the tribe is removed and a share of its people become forced workers (C-04). They add mining capacity but have low morale and may revolt.
- If the player loses, the soldiers are lost and the tribe's hostility to all of the player's sites rises.
### Progression and balancing
- Tribes are dispersed around the regions in a way that makes social and ecological sense. Tribes vary from nomadic tribes to large empires (like Aztecs). Players can gauge tribe strength through Drones and Scouting reports. Drones can also locate tribe headquarters and villages. This is helpful information for campaigns.
- A campaign should vary on price depending on tribe strength. More soldiers, weaponry, and forces are needed to fight longer campaigns.
- Tribes can have different technological systems all related to their reliance on nature. This could include burrowing tools or abilities to attack tunnels, flying beasts, or wings, traps, etc. Players have numbers and weaponry, tribesmen have natural mastery. Players fighting campaigns fight wars of attrition. They will lose men and resources, the question is whether or not they are able to exterminate tribes before they lose enough men to obliterate the campaigne.
### Interactions with other systems
- Reads sites (11) and garrisons (12), writes raids to combat (12) and reports (19).
- Forced workers feed mining capacity (03).
### Edge cases and failure handling
- Two players share a tribe's attention: hostility is tracked per player, per tribe.
- A tribe is already exterminated by another player: new sites there are free of that tribe.
- Dialogue generation fails: the engine uses a built-in template.
### UI and feedback
- A tribe card shows identity, script, temperament, hostility, last raid and agreements. Translation uses the three tracks and persistent language slots specified below.
- Negotiation shows the offer, the likely mood and the result after each round.
### Implementation and acceptance tests
- T13-01: negotiation outcomes are decided only by engine scores.
- T13-02: hostility stays within 0 to 100.
- T13-03: an exterminated tribe never raids again.
- T13-04: every AI dialogue passes validation before display (19).
### Open questions
- Should tribes have relationships with each other? Yeah thatd be cool, and can work in player negotiations.
- Should forced workers be a moral choice with consequences, such as a Maker penalty? Nah

### Translation technology

Translation is a player-owned upgrade system with three independent tracks: Vocabulary, Accuracy, Languages. The engine computes all comprehension and negotiation results; AI may only render text consistent with those results.
Vocabulary: level 0–100, starting at 0. Each level increases the probability that an eligible spoken or written word token is recognized by one percentage point, so at level V each token has V% recognition probability. Unrecognized tokens display as original tribal words or an unknown marker, not as correctly translated English. Proper names and fixed interface labels are excluded from token rolls; meaningful dialogue tokens use a canonical tokenizer and stable seeded rolls.
Accuracy: level 0–75, starting at level 0 with a 75% confusion probability on recognized tokens. At level A, confusion probability is max(0,75-A) percent. Confused tokens display a plausible but incorrect word drawn from a validated, context-appropriate confusion table; never silently change the underlying diplomatic offer or its deterministic resolution. At Accuracy 75, confusion is zero. Unrecognized tokens are not additionally confused. The probability a random eligible token is correctly understood is (V/100) × (1 - (75-A)/100). For example V=60 and A=25 yields 30% correctly understood, 30% confused and 40% unknown.
Languages: level L equals the maximum number of distinct tribal languages that may be actively translated; starting level 0 means zero languages supported. Each purchased level adds exactly one language slot, with a relatively expensive cost specified in 10. At the start of a conversation with a tribe using a previously unsupported language, if a free slot exists the player chooses whether to assign that language to a slot. If all slots are occupied, the player must purchase another Languages level before translating the new language. A language is a stable language ID shared by all tribes speaking it, not one slot per tribe. Language assignments persist between conversations and saves. No free language swaps or silent replacement of assignments; future respec mechanics require separate approval. If the player declines to assign a slot, the dialogue remains untranslated. Reopening a conversation does not reroll an assigned language.
Language selection is offered each time a player talks to a tribe whose language has not yet been assigned; previously assigned languages are reused automatically. Vocabulary and Accuracy levels apply globally to all assigned languages, rather than requiring duplicate research per language. Translation is applied to the displayed dialogue, not to the underlying offer terms or outcome engine. At zero Vocabulary, no eligible tokens are understood even if a language slot exists. At Vocabulary 100 and Accuracy 75, all eligible tokens translate correctly for assigned languages.
Dialogue generation must first create or retrieve the tribe's stable language ID, canonical intended meaning and original-language text; then the deterministic translation filter chooses recognized, confused or unknown token presentation. The engine never uses mistranslated display text as an authoritative diplomatic command. The player selects structured offers and stances, so confusion affects the player's understanding of intentions and counteroffers, not the literal amount of coin deducted. UI must visibly distinguish confirmed translations, uncertain translations and untranslated words without revealing the correct meaning of confused tokens prematurely.
Acceptance tests: T13-05 initial V=0,A=0,L=0 yields 0% recognition, 75% conditional confusion, and zero language slots. T13-06 V=100,A=75 yields perfect translation of eligible tokens in assigned languages. T13-07 L=2 allows exactly two unique language IDs, even if ten tribes speak them. T13-08 repeated conversations and offline replay reproduce identical rendered translations for a given dialogue event and upgrade snapshot. T13-09 purchasing upgrades never retroactively changes the recorded outcome of a completed negotiation; replayed historic dialogue retains its original snapshot. T13-10 unassigned languages cannot be translated and no purchase bypasses coin checks.

## 14 — Wildlife, Monsters and Emergent Encounters

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Generate persistent alien ecosystems with regional species populations, planetary mythic species, combinable behavior traits, and deterministic ecology. Species generation is numerical and seeded; optional narrative AI only names and describes the resulting facts. This is not a random monster reroll at every encounter.
### Design principles
- Classification describes ecological significance, not a behavioral script. Traits cause observable actions and persistent changes to the world; physical statistics determine capability. The same species behaves consistently across sightings while individual members can vary within bounded ranges.
- Regional ecology evolves through reproduction, migration, disturbance, predation and military intervention. Danger is influenced by depth, habitat, equipment and local populations, not a fixed depth multiplier alone. The game must remain computationally scalable and compatible with watched/offline simulation.
### Definitive rules
Species classifications and distribution
- Each region is initialized with 1–3 Pest species, 2–3 Standard species, and 1–2 Apex Predator species. Each planet additionally generates 1–2 Mythic species shared across the planet, NOT 1–2 mythics per region. These are generation targets, not guaranteed simultaneously active encounters.
- Regional species pools may share species across adjacent regions if the planet ecology rules permit it; a shared species has one canonical species ID and coherent population records, not duplicate identities. Initial count of region-associated non-mythic species is 4–8.
- Mythic species may traverse several regions. Region count, habitat area, biome compatibility and starting-home protections constrain placement; regenerate invalid candidates deterministically.
- Pest: common, usually low individual threat, frequent nuisance, interference with equipment, stores or miners. Their economic impact is repeated disruption and defense overhead, not necessarily casualties.
- Standard: ordinary local wildlife with variable hostility and manageable encounters.
- Apex: uncommon dominant regional predators with substantial disruption potential, territorial influence and high-response military requirements.
- Mythic: exceptionally rare planet-level species whose individuals may travel between regions; confronting one normally requires a prepared multi-unit campaign. Mythic means species rarity and strategic importance, not magical immunity or automatic destruction.
- A planet may have 1–2 mythic species but zero current sightings in a given region.
Species identity and generation
- At world generation, use planet seed + region ID + species slot to determine classification, habitat, 1–3 compatible behavioral traits (occasionally 4 if valid), physical-stat distributions, population parameters, diet/prey preference, activity cycle, sensory channels, preferred depths, territory size, reproduction, threat response and visual morphology constraints.
- For mythics, use planet-scoped IDs and movement ranges instead of region-only IDs. Generate one persistent species record and bounded individual variation; do not regenerate traits after loading, scouting or a battle. Names, descriptions and artwork prompts derive from already-finalized data and cannot change numeric parameters.
Behavioral traits (starter set)
- Swarm: groups aggregate and move as a coordinated mass; individuals regroup when separated; encounter pressure depends on numbers and cohesion.
- Nesting: establishes a persistent home/nest, breeds there, defends it and may found nearby colonies when carrying capacity permits.
- Trapper: modifies a tile/route or leaves a persistent lure/trap; records trap placement, discovery, triggering and removal.
- Stalker: shadows perceived prey over time and waits for isolation or advantage; loses track if perception fails.
- Burrower: can traverse subterranean terrain and open persistent or temporary tunnel connections where geology allows, affecting patrol routes and mine access.
- Flyer: uses aerial movement and may cross surface obstacles, hunt on the surface or threaten eligible empty-return transports; cannot intercept guaranteed loaded outbound deliveries.
- Toxic: emits environmental contamination or hazardous residue that persists for a bounded time and interacts with ventilation, suits and cleanup.
- Ambusher: waits concealed at a suitable location and responds to proximity or disturbance with a short burst of activity.
- Scavenger: approaches waste, abandoned equipment or post-encounter sites; does not automatically initiate predation.
- Territorial: establishes patrol boundaries, issues warning/escalation responses to intruders and usually stops pursuit outside its range.
- Parasite: requires a suitable host/resource lifecycle; alters host behavior or population health abstractly, with explicit transmission constraints and no arbitrary instant spread.
- Migratory: moves along seasonal, food or habitat routes between areas; schedules regional arrival/departure events. Predator is a diet/ecological-role attribute, not a redundant universal attack trait; solitary versus social is derived from group tendency and compatible traits.
Trait interactions and exclusions
- Swarm + Nesting yields colony defense and group emergence from nests. Trapper + Ambusher yields placed hazards followed by concealed waiting. Burrower + Nesting yields expanding side tunnels and new entrances. Flyer + Territorial yields airspace patrol and boundary responses.
- Toxic + Nesting yields localized contaminated colony zones. Migratory + Apex yields periodic regional threat spikes rather than permanent occupation. Trapper requires a manipulable environment and sufficient cognition/instinct; Flyer requires valid aerial habitat; Burrower requires diggable terrain; Parasite requires compatible hosts.
- Nesting and Migratory can coexist only with seasonal breeding sites. Swarm and solitary preference conflict unless explicitly modeled as seasonal grouping. Do not silently generate impossible combinations; reroll using seeded weighted tables.
Physical and combat statistics
- Keep physical variables separate from behavior: mass/size class, movement speed by medium, acceleration, perception range and channel, camouflage, toughness/protection by attack class, stress tolerance, vulnerable-area exposure, impact capability, reach, attack interval, endurance and environmental resistance.
- Replace the old universal health/damage numbers in this tab with the functional-state and protection/penetration resolver defined by 23; if legacy UI requires a summary bar, it is a display approximation, not the authoritative simulation. Classification shifts statistical distributions and population sizes, but never hardcodes a single combat result.
- Mythics may have multiple functional phases or large protection profiles without becoming invulnerable.
Populations, ecology and persistence
- Each species has a persistent population record per occupied region, including estimated abundance, occupied habitat, breeding capacity, nests, territory, pressure from prey and predators, and last simulation tick. Do not persist thousands of independent pest agents: resolve populations in cohorts and instantiate temporary visible individuals during encounters.
- Growth is bounded by carrying capacity and habitat; losses reduce local abundance; migration transfers population rather than duplicating it. Apex predation may suppress pests or standards, and removing an apex can cause a pest increase when food and habitat permit.
- Military clearing can remove nests or lower populations, but recolonization remains possible unless habitat access is blocked. Extinction is possible if all populations and viable reproductive sources reach zero; recovery requires a grounded migration/reintroduction mechanism, never spontaneous respawn of an extinct species.
Spawning and encounters
- Encounters arise from actual regional populations, accessible habitat, activity, shaft depth, disturbances, patrol coverage, light, weather and nest proximity. Preserve deterministic seeded event generation (17). The 1–3 mid-depth and 4–8 deep daily attacks are provisional balancing benchmarks only, not unconditional spawn guarantees; no population means no species-specific encounter.
- Detection and response use 11/12/23. Miners remain economic worker pools with representative on-screen actors (03). Encounters can cause bounded downtime, evacuation, casualties, equipment damage, nest breaches, blocked tunnels and scouting discoveries; no automatic destruction from ordinary pests.
- Existing rescue and notable-event logging rules remain, using factual event records before narrative generation (19).
Mythic creatures and campaigns
- A mythic species receives a planet-wide territory/range and a very small bounded number of individuals. Individual identity, current region, travel schedule, last known position and encounter history persist. Reports may contain sightings and uncertain tracks; a sighting does not reveal exact position without sufficient scouting.
- Direct confrontation is a military campaign objective with reconnaissance, deployment, containment/evacuation, engagement and recovery phases using 23; players may instead avoid, monitor or redirect operations. Mythics cannot permanently capture or erase the protected home mine (12).
- Eligible non-home outposts may be overrun under the existing qualifying-threat rules. Replace the old automatic depth-milestone boss and coin/item reward rule with optional seeded rare encounters and campaign outcomes; no guaranteed loot payout or creature farming.
- Any rewards require separate approval in 10/02.
Regional survey and player knowledge
- Scouting (11) may progressively reveal presence, approximate species count, tracks, nest sites, behavior traits, likely classification, population confidence, protection estimates and migration warnings. Unknown species are displayed as unidentified contacts until observed.
- The UI distinguishes confirmed observations from probabilistic estimates; hidden world data is not leaked by the robot General (23). Players can learn countermeasures from repeated encounters without changing the species' underlying traits.
### Interactions with other systems
- 03: creature activity modifies shaft accessibility, utilization, evacuation and worker-pool outcomes. 10: optional detection, environmental protection, nest clearance and creature-specific defense research follow existing upgrade economics.
- 11: species scouting, confidence and movement reports. 12 and 23: patrol response, troop capabilities, physical combat and campaigns. 15: weather/hazards affect movement, nesting and toxic persistence. 17: deterministic ecology ticks and offline equivalence.
- 18: save species registry, regional cohorts, nests, territories, migration, encounter seeds and event logs. 19: generated names and narratives describe recorded facts only. 20: region species encyclopedia, uncertainty indicators, nest map, mythic sighting reports and ecology events.
- 22: version and unresolved balancing decisions.
### Edge cases and failure handling
- Do not spawn mythics in prohibited starting-home encounters. Species with no valid habitat are regenerated before the world is committed. Cross-region migration is atomic: subtract at origin, add at destination. Nest destruction does not instantly delete every roaming individual.
- A zero-population species cannot attack unless an already-scheduled surviving individual or migrant is recorded. If the player is offline, run the same seeded ecology and encounter events and aggregate reports without changing outcomes. Large populations use cohort calculations and representative rendering, not persistent individual agents.
- Paid loaded outbound ore/refined-ore shipments between player facilities remain guaranteed and cannot be intercepted, damaged, destroyed or diverted; only eligible empty return legs may be attacked, as governed by 05/12/23.
### UI and feedback
- The regional wildlife panel shows known species, class, discovered traits, confidence, habitat, nest alerts, recent sightings and estimated disruption risk. A planetary mythic tracker shows last confirmed sighting and age of information, not omniscient live location.
- Watched encounters visualize trait-caused behaviors such as swarming, tunneling, nesting, traps and flight. Every visible action must correspond to the deterministic event state.
### Implementation and acceptance tests
- T14-04: each valid region has 1–3 pest, 2–3 standard and 1–2 apex species slots at generation.
- T14-05: each planet has 1–2 mythic species IDs globally, with no regional duplication.
- T14-06: same seed reproduces species identities, traits, stats, cohorts and migration.
- T14-07: traits cause the documented actions and invalid trait/habitat combinations never generate.
- T14-08: destroying a nest halts that nest's reproduction without deleting existing roaming creatures.
- T14-09: removing an apex can change prey populations only through explicit ecological rules.
- T14-10: no attacks originate from extinct species without a recorded surviving source or migrant.
- T14-11: watched and offline runs yield identical population, encounter and economic outcomes.
- T14-12: scouting reveals confidence-limited information, not hidden true stats.
- T14-13: no mythic encounter can permanently destroy the protected home mine.
- T14-14: guaranteed loaded outbound shipments are never affected by creature encounters.
- T14-15: all narrative descriptions are consistent with the saved species and encounter records.
Open questions and provisional tuning
- Set exact class population ranges, reproduction/carrying-capacity curves, species overlap between neighboring regions, mythic individual counts, migration intervals, habitat trait weights, species discovery progression, ecological tick frequency and regional performance budgets after simulation tests.
- Decide whether trap structures can damage infrastructure and whether creature-derived materials are ever collectible; default is no hunting economy. The specified species counts and behavioral semantics are approved design targets; numerical combat and economy coefficients remain provisional.

### Rescues and factual incident records
- A rescue is a deterministic encounter with a deadline, trapped worker-pool count, access routes and assigned forces. Success releases the recorded survivors; failure applies bounded recorded casualties and downtime. Home protection remains mandatory.
- Log last stands, narrow escapes and major losses before narration. No creature kill creates coin, SP or saleable loot. Any future reward requires an explicit economy-rule amendment.
- T14-01: encounter counts and outcomes reproduce from seed and events. T14-02: every narrated fact exists before narration. T14-03: zero defenders changes encounter losses according to the resolver, without overriding home protection.

## 15 — Environmental Hazards and Space Threats

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines underground conditions, weather, ship restrictions, pirates, asteroids, solar events and the defenses against them.
- Mines face constant danger (14, 15). Refineries, stations and ships face rare, dramatic danger (C-05).
### Design principles
- Hazards give the player a reason to invest in prevention, not just production.
- Space threats are rarer than planetary threats, but each one matters.
- A hazard must be readable: a warning, a cause and a clear defense.
### Definitive rules
Underground hazards
- Cave-in: chance per shaft per day, reduced by supports (03). Stops the shaft for a repair time.
- Toxic gas: appears at depth. Reduces miner output and kills miners unless ventilation is upgraded.
- Flood: rare, at the deepest shafts. Stops the shaft until pumps clear it.
- Fire: caused by gas and lightning. Spreads between shafts unless firebreaks exist.
- Earthquake: causes multiple cave-ins at once, rarer
Weather
- Each site has a weather pattern drawn from: clear, dust, storm, ash, cold. Weather changes daily from a seeded table, and depends on planetary region.
- Weather modifies production (03), grounds ships in storms and raises lightning risk for stations on the planet.
- A sensor can be bought in the Technology tab that allows for forecasting.
Ship restrictions
- Ships cannot take off in a storm. They wait (05).
- Ships in flight are exposed to space threats on off-planet routes only.
Pirates
- Pirates may raid facilities and attack empty commercial ships on their return legs; paid outbound cargo deliveries remain protected from interception, destruction or diversion.
- Paid outbound cargo cannot be lost to piracy. Air divisions protect facilities and empty returning vessels, which may be disabled or lost without reversing an already completed sale (12).
- Pirates can raid stations and refineries rarely. Same as a tribe raid.
Asteroids and cosmic events
- Asteroid showers damage off-planet buildings and temporarily restrict departures but never destroy shipments in flight.
- Solar flares disable ship travel and station intel for a few hours.
- Events are seeded and announced with a short warning (30 to 120 minutes).
Defenses
- Defense lines: ventilation, pumps, firebreaks, shields. They are ordinary upgrade lines (10).
- Air escorts are part of military command
### Progression and balancing
- Expected frequency per site per day: cave-in risk 1 to 5 percent per shaft. Gas, flood and fire are rarer. Space events: a few per week across the whole map.
- Losses from space events should be about 5 to 15 percent of a day's income unless the player has no defenses.
### Interactions with other systems
- Reads weather and depth (03), routes (05).
- Writes losses to the ledger (02) and reports (19, 20).
### Edge cases and failure handling
- Two hazards at once at a shaft: effects stack, with each resolved in order of start time.
- A hazard hits an offline player: it is resolved as normal, and recovery starts automatically if the player has the coin.
- Ships carrying paid outbound cargo cannot be destroyed. Empty return vessels may face pirate or flying-beast attacks; facility hazards and takeoff delays still apply.
### UI and feedback
- A hazard banner shows type, location, warning time and the defense that applies.
- A risk panel shows the daily chance of each hazard at each site.
### Implementation and acceptance tests
- T15-01: hazard events are reproducible from the seed.
- T15-02: supports at the top level reduce cave-in chance as documented.
- T15-03: no space event applies to on-planet routes.
### Open questions
- Should pirates be a persistent faction that the player can bribe or fight? Yes. They should be like Space Tribes
- Should hazards ever be able to destroy a whole station? No

## 16 — Spectacle, The Maker and Evolutions

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Optional whole-colony prestige. Destroy all owned sites, fleets and available coin; retain evolutions and unspent SP only within the current month. No single-outpost prestige.
### Definitive rules
Eligibility and earnings
- Eligibility requires at least 20,000,000 gross external coin earned since the last nuke (or first landing). Grants, escrow moves, refunds, self-transfers and rejected wash trades do not qualify.
- Define TC as this player’s cumulative gross external earnings in the current UTC month. TC does not reset at a nuke and never includes prior months. Keep a separate current-run counter for eligibility; it resets to zero at a nuke.
- No fixed 72-hour cooldown. The run-earnings requirement, destruction cost and reward high-water mark prevent free repeated awards. No artificial limit on accepted galaxy changes per player or period.
Spectacle and SP
- Base Spectacle = TC^(1/7.5). Apply the evolution multiplier AFTER that calculation: S = TC^(1/7.5) × spectacleMultiplier. This is not a 0–100 capped score. Buildings, people and visual blast size do not add independent scoring terms.
- To prevent re-awarding the same month’s accumulated score, track awardedSpectacleHighWater. New SP = floor(K × max(0, S − awardedSpectacleHighWater)); then high-water becomes max(oldHighWater,S), atomically. Initial K=1 is C-06 calibration; fractional entitlement can be retained as fixed-point remainder, never duplicated through rounding.
- New spectacle multipliers affect the next eligible nuke’s S, including its month-to-date earnings. They do not retroactively revise previous ledger/SP entries. Existing SP and evolutions survive the nuke; all are reset at month end.
- This incremental-award rule is a documented design default to prevent repeated payout of the same earnings. Balance-test evolution prices and K before release.
Destruction and commitments
- Two-step confirmation states exactly which sites, fleets, inventory, coin and escrow will be destroyed and what survives.
- Freeze new orders, finalize all already-dispatched paid and self-owned inventory commitments under 02/18, then destroy sites and burn available coin/escrow. No extra refining or sale can occur during closure. Contracts and liabilities follow 02; a nuke cannot erase a default obligation.
- Rebuild through a guaranteed basic starter mine/equipment/worker grant in kind, not coin income; otherwise a zero-coin nuke could strand the player. Record the in-kind grant as inventory, not a coin source or prestige earnings.
Maker negotiation
- Up to 3 rounds. The player gives a creative economic reason. AI proposes a structured cause affecting faction demand, procurement budgets/projects, substitutions, inventories or external supply; it cannot set a price directly.
- The engine validates the proposal against 08/19, computes deterministic creativity/consistency score N in [0,1], and applies a bounded effect envelope with 90% contribution from normalized Spectacle and 10% from N. The normalization and per-input change bounds must be registered as C-06 coefficients before implementation; mixed raw units are forbidden.
- Engine acceptance/counter/refusal is final. AI writes dialogue only after the decision or submits a proposal for engine evaluation. Cached validated proposals and engine decisions are authoritative replay inputs.
- Accepted changes are durable events in underlying economic state, not timed global price multipliers. The market solver recomputes prices. No fixed expiration or active-change cap; ordinary inventories, consumption, later events and new months can change the resulting state.
- Opposing requests apply in authoritative event order when each is independently valid. Neither bypasses budget, nonnegative stock or market feasibility constraints.
Evolutions
- Buy independent stat lines with SP, including mining/refining/ship capability and the spectacle multiplier. Any sell-price evolution changes a disclosed offer/cost/service mechanic subject to actual buyer acceptance; it cannot force buyers to pay or override equilibrium prices.
- Evolution costs/effects are C-06 calibration. No coin is created by SP spending.
### Acceptance tests
- T16-01: same TC, multiplier and event inputs reproduce S and SP.
- T16-02: Maker effects stay inside the registered envelope and change fundamentals, never assign benchmark prices.
- T16-03: SP, evolutions, TC and high-water marks reset monthly; all-time statistics remain.
- T16-04: refused proposal changes no economic state.
- T16-05: no second SP award can claim an already-awarded spectacle increment; a new run must re-earn eligibility.
- T16-06: multiplying after TC^(1/7.5) produces the documented result; prior-month earnings never contribute.
- T16-07: nuke closes paid commitments once, burns available owned coin and supplies a recoverable starter mine.

## 17 — Time, Offline Progression and Simulation

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines the clock, production while offline, scheduled events, shipment arrivals, simulation catch-up and caps.
- Ensures watching the game does not change outcomes.
### Design principles
- One simulation, many viewers. Live play and offline play use the same code and give the same results.
- Time passing is the main source of progress, so it must be exact and safe.
- A player who returns after a day should see a short, readable summary.
### Definitive rules
The clock
- Game time equals authoritative real time. A month is a UTC calendar month, closing at 00:00 UTC on its successor’s first day.
- All timestamps are stored as UTC milliseconds. Events fire at exact timestamps.
The simulation
- The simulation advances in fixed steps of 1 second of game time. Each step uses a seeded generator keyed by site and step number.
- A scheduled event queue holds all pending events: shipment arrivals, drone arrivals, contract deadlines, hazards, market events and campaigns.
Catch-up
- When a player (or the server) loads state after a gap, the simulation catches up from the last saved timestamp to now, step by step, in order of event time.
- Catch-up may use larger steps for pure production math, provided the result is identical to the 1-second step (verified by test).
Offline progression
- Offline, the colony continues: mining, shipping, refining and selling run with saved settings. Hazards and threats are resolved.
- Offline progression is unlimited and operates at the same rate as live play, using deterministic catch-up and safe chunking.
Fairness of time
- A client's local clock is never used. The authoritative time comes from the shared data store (18).
- Fast-forward tools exist only in the test harness.
### Progression and balancing
- Intended check-in rhythm is daily. A player who is gone for 3 days should lose little. A player who plays for 3 hours should feel the benefits of control.
### Interactions with other systems
- Provides timing to all documents. Reads seeds and state (18).
### Edge cases and failure handling
- Clock skew between clients: ignored, because the store time rules.
- An event is processed twice after a crash: events carry unique IDs and are idempotent.
- A catch-up takes too long: it runs in chunks across calls, and the state shows "catching up".
### UI and feedback
- A "while you were away" screen summarizes income, shipments, fights, losses and events in order.
- A live indicator shows when the colony is simulated in real time.
### Implementation and acceptance tests
- T17-01: a 10-minute live run and a 10-minute catch-up produce identical state.
- T17-02: processing an event twice has the same result as once.
- T17-03: tabs left open overnight produce the same outcome as a closed tab.
### Open questions
- Should the offline cap vary by upgrade? Nope. No cap
- What time zone defines the month boundary? UTC

### Translation event timing

#### Continuous offline authority
- A trusted server-side scheduler advances shared economics, private businesses, ecology and settlement even with zero connected clients. It may execute due events in bounded batches, but logical timestamps and ordering are unchanged. Catch-up is a recovery optimization, not dependence on a player opening a page.
- Clients never hold exclusive settlement responsibility. The server owns market clearing, dispatch commits, deadlines, production and month-close jobs. Commands submitted offline take effect only when received and validated; they are never backdated.
Month-end ordering
1. Close the month to departures at boundary B; process all authoritative events with timestamp < B in timestamp/priority/ID order. An accepted departure at B belongs to the new month and cannot consume old-month stock.
2. Snapshot old-month coin on hand, including escrow once. Paid departures before B already count; arrivals create no additional payment.
3. Finalize remaining old-month dispatched inventory commitments without generating extra production, sales or clock advancement. Archive the goods, ships, reservations and logs. Unfilled contract portions cancel without a fresh penalty; already posted payments/defaults remain archived.
4. Archive statistics, burn old balances, clear month-scoped data and create the new world atomically through a resumable idempotent closing state machine. New tasks never observe a half-reset month.
- T17-05: closing after an outage yields the same ranking and archived ledger as continuous execution. T17-06: equal timestamps at B use the new-month rule. T17-07: a pre-B dispatch with post-B ETA pays once in the old snapshot, finalizes once, and creates no new-month stock.

### A1 deterministic event foundation · 25 October 2026
- Added a pure, schema-versioned server event kernel. Batches use explicit timestamp/priority/ID order, immutable input snapshots, replay fingerprints, a monotonic ordering cursor and seeded per-site/per-second random streams with saved draw cursors.
- A required exclusive horizon prevents execution at or after the old month’s UTC boundary. Old-month event records with post-boundary ETAs remain pending for the future obligation-closing implementation; this utility neither finalizes obligations nor moves inventory into the next month.
- Event priorities and domain handlers are explicit trusted inputs. A canonical cross-system priority table, automatic production tick generation, durable queue/checkpoint transactions, scheduled workers, retention and C-07 performance limits remain outstanding.
- **T17-01/02 foundation evidence only:** 600 explicit fixture ticks yield identical checkpoints in one batch versus 600 one-event batches; duplicates, conflicting IDs, RNG continuation, handler rollback, ordering and boundary behavior are tested. These are not live/offline mining/economy acceptance results.

### Bounded private-world worker · 26 October 2026

- The trusted scheduler entry point performs month preparation/closure first, then settles the current month's enrolled mines with no browser connected. It reads one roster, capped at the approved 10-player private test size, and attempts one bounded transaction per owner. Ledger postings and owner simulation checkpoints commit atomically.
- A partial or failed owner remains incomplete and resumes on the next tick; retries cannot pay a departure twice. Other owners may still advance. The existing internal authentication secret is required. This is a private-world checkpoint implementation, not the general durable indexed event queue or a guarantee of immediate catch-up for arbitrary backlogs.
- Backend deployment and production cost/timeout measurements remain separate from committing this implementation. Existing month-close batches retain their own limits.

### Responsive browser runtime · 26 October 2026

The CEO requests browser-first responsiveness and approximately 30-second synchronization. The local sandbox runs its deterministic engine in the browser; heavy catch-up uses bounded module-worker batches, with validated state results, request IDs, timeout/disposal and a main-thread fallback. Online rendering predicts visible mining locally while trusted commands retain authority over shared money, takeoffs, hidden truth and settlement. Watching still cannot change authoritative outcomes.

Passive online reconciliation runs every 30 seconds without departure-triggered early polling; commands, joining/sign-in and returning/focusing the tab can refresh immediately. Requests coalesce and stale responses cannot overwrite newer optimistic commands. Hidden tabs do not passively poll. This does not add a server broadcast for every other player's presence change or turn local browser saves into shared records.

## 18 — Data Architecture, Persistence and Multiplayer Integrity

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines the authoritative game state, shared and private data, the ledger, unique IDs, concurrency, locks, save integrity and duplicate-payment protection.
- The game should be playable by multiple devices around the globe by multiple concurrent users.
### Design principles
- Every coin has a paper trail. Any balance can be rebuilt from the ledger.
- Clients command only their own assets. Trusted handlers perform cross-owner settlement; clients never edit other owners or create authoritative payments.
- Anything that can happen twice must be safe if it happens twice.
### Definitive rules
Records
- World record: month, seed, planet, ores, galaxy conditions, reference prices, event schedule.
- Player record: coin, SP, stage, sites, buildings, upgrade levels, garrisons, settings. Written only by its owner or by the settlement process on the owner's behalf.
- Shipment record: ID, owner, cargo, origin, destination, departure and arrival times, state.
- Ledger entry: unique ID, time, type, from, to, amount, reference (shipment or contract ID), tax. Append-only.
- Inbox record: messages from other players or the system, such as "payment received", each with a unique ID.
Writes and ownership
- Clients submit commands for their own records only. Trusted server handlers verify authority and commit immutable ledger entries and derived account changes. A client cannot create arbitrary payments or directly mutate another owner’s balance.
- Balance = starting coin + sum of ledger entries for the player. Cached balances are refreshed from the ledger and checked in tests.
Unique IDs and idempotency
- Every shipment, contract, payment and event has a unique ID built from owner, type, time and counter.
- Applying an ID twice has no further effect. A processed-IDs set is kept per player.
Concurrency
- A trusted server transaction settles every dispatch immediately at authoritative departure. A unique departure ID, compare-and-set version and atomic funds/stock/storage reservation ensure exactly one result. Scheduled arrival only converts committed in-transit inventory into received inventory; no destination-owner login or payment check is involved.
- Contention is resolved by the lowest timestamp, then the lowest ID.
Locks
- A short-lived lock key protects settlement of one shipment. A lock expires after 60 seconds. An expired lock can be taken over, and the idempotency rule keeps a repeated settlement safe.
Save integrity
- Each save carries a version number. A save with an older version than stored is rejected and merged.
- Large state is split into chunks with a checksum. A load that finds a bad checksum falls back to the last good version and replays the ledger.
Month rollover
- At month end the system takes a snapshot of final coin and ranks players. It writes the leaderboard and all-time stats, archives the month, and creates the new world record with a new seed.
### Progression and balancing
- Storage size per player should stay within the platform's limits (C-07). Old ledger entries are summarized after the month ends.
### Interactions with other systems
- Every document that moves coin or goods writes through the rules here. Time comes from document 17.
### Edge cases and failure handling
- Ledger postings, stock/title changes, reservations and shipment/event creation are one atomic commit. A crash cannot leave a paid-but-unreserved or unpaid-but-dispatched shipment. Cached read models are rebuilt from committed records; never expose a partially committed ledger as authoritative.
- Two clients of the same player: version checks reject the older write.
- Data lost for one player: the player restarts from the ledger and the last snapshot, or from a starter state for the month (C-07).
### UI and feedback
- A Records screen lists ledger entries with filters. A banner shows when the game is repairing state.
### Implementation and acceptance tests
- T18-01: balance rebuilt from the ledger equals the cached balance.
- T18-02: replaying any ledger entry twice changes nothing.
- T18-03: two simultaneous settlements of one shipment result in one payment.
- T18-04: a corrupted chunk is detected and recovered.
### Open questions
- Should ledger summaries be public for transparency? Nah

### Translation state

### Trusted backend and private information
- Deploy authenticated command endpoints plus a trusted scheduled simulation/settlement service; use server credentials unavailable to clients. Firebase client-only access rules are insufficient for authoritative hidden state and cross-owner settlement. Deployment must include the backend before multiplayer economy is considered complete.
- Split server-only simulation state from tier-filtered read models. Hidden prices, faction parameters, true threat, world seeds capable of reconstructing secrets, canonical dialogue meanings, token-to-meaning alignment, confusion truth labels and deterministic secret translation seeds never reach unauthorized clients.
- For dialogue, persist full canonical/source/token/snapshot data server-side. Send only original text, rendered permitted translation, uncertainty markers and authorized structured transaction terms. A history API returns the original filtered event, not its canonical meaning. Signed or opaque references cannot serve as lookup keys for unrestricted private data.
- Language assignment and upgrade transactions are authoritative compare-and-set commands; concurrent devices cannot overassign slots or charge twice.
- Mark all research, language assignments, inventories, formations, market events, private read models and prestige counters with month ID. At reset only explicitly listed all-time statistics and Hall of Fame remain active; archives are historical read-only and cannot act in the new month.
- T18-08: zero clients still process departures, arrivals, deadlines and hourly market events.
- T18-09: direct API reads and network payload inspection cannot recover hidden meanings, token mappings, true threat or unauthorized market fields.
- T18-10: injected client ledger/payment/seed fields are rejected. T18-11: simultaneous dispatches cannot overspend money, daily limits or receiving capacity.
- T18-12: after a crash at any closing phase, replay produces one snapshot, one commitment finalization and one reset.

### A1 accounting foundation · 25 October 2026
- Added a separate server-side library under `backend/` for checked whole-coin ledger postings, owner escrow funding/release, trusted-configured starter grants, command versioning and idempotent retries. Grant fixtures are not approved starting balances; no grant amount is configured for production.
- Command identity, active month and receipt time are trusted server context, never accepted as player-controlled outcome fields. A future authenticated transport must verify identity before constructing that context. Owner wallet results use an explicit field allowlist.
- The current transaction adapter is **in-memory, process-local and test-only**. Serialization and rollback tests do not certify durable storage, crash recovery, deployed authentication, Firestore authorization or distributed concurrency.
- T18-13: repeated/concurrent commands apply once; a changed action/amount under the same request ID rejects; a retry returns the original result even after the wallet version advances.
- T18-14: unauthenticated, cross-owner, stale-month and injected authoritative-field requests reject without mutation. Production identity verification and direct database access tests remain pending.
- T02-01/02/04 and T18-01/02 have partial foundation coverage for grants and owner escrow only. Liabilities, commercial departure, storage reservations, tax/sinks, scheduler, closing and all other release tests remain outstanding. This library is not connected to the legacy browser game.

### A1 persistence and authentication · 25 October 2026
- Added a Firebase Admin Firestore repository and authenticated local HTTP transport. Bounded owner/month records persist balances, immutable ledger entries, command receipts, versions and the one-time grant marker in one transaction. No complete-ledger scan is required per command.
- World membership, world status and current UTC month are checked in the transaction on every retry. Token identity is verified with revocation checking before trusted context is constructed. Only the owner wallet field allowlist is returned; malformed stored receipts fail closed.
- The isolated backend emulator rules deny direct client database access, including authenticated users. Legacy prototype rules/configuration remain unchanged. Paid deployment, broader game projections, enrollment/admin endpoints and production credentials are not included.
- T18-13/14 have local HTTP/emulator coverage for retry/identity/ownership guards. Cross-instance transaction tests and service recreation demonstrate durable wallet/receipt behavior. They do not certify whole-world recovery, cross-owner shipments, scheduler or monthly closing.
- **Local evidence: 19 fast tests and 3 real Auth/Firestore emulator tests pass; the authenticated local demo passes.** Runtime dependency audit reports no known vulnerabilities. Full Release A acceptance remains pending.

## 19 — AI Behavior, Procedural Generation and News

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines what the AI may generate, how it creates names, descriptions, events, news and encounter reports, and which outputs must follow fixed rules.
- Defines validation of AI output.
### Design principles
- The AI writes words and ideas. The engine decides numbers, outcomes and prices.
- If the AI fails or misbehaves, the game continues with built-in fallback content.
- AI content is flavor with a factual spine: every story starts from an event record.
- AI can propose creative world-changing economic causes through the structured proposal contract below. Only validated engine decisions become authoritative events.
### Definitive rules
What the AI may generate
- Names and descriptions: planets, ores, creatures, tribes, outposts, buyers, ships.
- Tribe scripts and phrases (13), with translations.
- News: headlines and short articles for the initial market conditions, faction-driven economic events, contracts, big fights and notable incidents.
- Combat and incident narratives from verified event records (12/14), but only for large fights relative to the player's current progression. Every smaller encounter receives a factual log, not an AI story.
- The Maker's lines (16) and AI-run posts such as exchange chatter.
What the AI may not decide
- Prices, quantities, probabilities, damage, casualties, success or failure, rankings, coin awards, anything stored as a number.
- AI cannot enact events or choose final numeric outcomes. It may propose structured economic causes for engine validation and scoring; approved events become immutable simulation inputs.
Inputs
- Each request carries a structured record of facts (type, names, numbers, results) and a style guide. The AI must state only those facts.
Validation
- Outputs are checked: length limits, forbidden content, required fields, no numbers that do not match the record, no invented participants.
- A failed check triggers one retry. A second failure uses a fallback template.
- Names are checked for uniqueness within the world and for length.
Fallbacks
- Every AI use has a template with blanks filled from the record. Fallbacks are written to read acceptably.
Cost and timing
- AI calls are made only for significant events, not every fight and not on every page view. Battle significance scales relative to current player military strength, colony scale and economic impact (12). Results are stored in the world record so that every player sees the same text.
- A rate budget limits AI use per hour (C-08).
Safety
- Generated content uses fictional dark comedy and cartoonish, reasonably graphic violence under the presentation standard below. Real people and real brands are never used.
### Progression and balancing
- The amount of AI content scales with active players. Posts are limited to a few per hour per planet.
### Interactions with other systems
- Reads event records from 08, 11, 12, 13, 14, 15, 16. Writes text to the world record (18) and the interface (20).
### Edge cases and failure handling
- The AI is slow or offline: the fallback is used and the real text is added if it arrives within the hour.
- Two players trigger the same event: one request is made and the result shared.
### UI and feedback
- News ticker and an events log. AI-generated items are labeled as written by the colony's chronicler.
### Implementation and acceptance tests
- T19-01: every AI output passes validation before display.
- T19-02: removing the AI entirely leaves the game fully playable with fallbacks.
- T19-03: the numbers in any story match the event record.
### Open questions
- Which model and budget should be used for each type of content? Choice of model. Limit of around $2-3 per month
- Should players be able to rename their own sites and ships? Yeah! They should have a species design and picker at the start of the month.

### Translation content contract

### Structured economic proposal contract
- Input includes player request, permitted economic facts, Spectacle envelope and a versioned list of allowed operations. AI output fields: proposal ID, causal explanation, affected faction/ore references, operation type, qualitative direction, requested normalized intensity, and narrative. No arbitrary code, raw database paths, direct benchmark prices, money awards or hidden client-facing facts.
- Allowed operation types modify faction consumption/project requirements, procurement-budget allocation, stock targets, substitutions, or external supply conditions. The engine derives concrete bounded numbers and verifies feasibility, accounting sources/sinks, stable entity references, nonnegative stocks/budgets and 16’s envelope.
- Grade creativity/causal consistency with a versioned deterministic rubric over the structured proposal. Cache the proposal, rubric version, score, approval and concrete event. Never ask a fresh model call to decide replay or an already settled negotiation.
- Proposal generation may vary before acceptance; identical saved accepted proposals/events must replay identically. Numeric validation and acceptance cannot depend on fresh model randomness. On timeout/invalid response, use a valid deterministic template proposal and the same validator.
- Apply accepted input changes in event order, then run 08’s solver. On solver failure roll back the attempted economic-state change atomically or retain it pending validation; do not publish inconsistent prices and never choose a random replacement.
- T19-06: direct price assignments and out-of-envelope changes are rejected. T19-07: replay of an accepted proposal reproduces scores, economic inputs and market results. T19-08: fallback proposal uses identical accounting/validation paths.
### Presentation standard
- Cartoonish, reasonably graphic violence is permitted: stylized blood, injury and exaggerated combat effects. Tone remains fictional and darkly comic. This standard replaces conflicting “non-graphic” wording; factual event constraints and user motion settings remain mandatory.

### Connected Maker presentation · 26 October 2026

The existing Claude/OpenAI BYOK connection now supports validated facility names, buyer personalities and colony dispatches in addition to planet design. Calls occur only on explicit player action. Credentials remain in browser AI settings and are excluded from economic save exports and prompts. Prompts use projected planet/lore identities and recorded facts only. Names/personality/headline output is constrained; factual news bodies must match the engine input. Malformed output gets at most one validation retry, then a deterministic built-in fallback; provider calls have a hard timeout and sanitized errors. No AI response can create buildings, coin, rates, prices, combat results or new engine events. No-key mode remains fully playable.

## 20 — Interface, Visuals and Player Feedback

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines the interface structure, the pixel-art scene, animation rules, dashboards, notifications, charts and information visibility.
- Does not define the rules behind the information.
### Design principles
- The scene is a living picture of the colony. The panels are the control room.
- Every number on screen is explained by one click.
- Show activity, quantities and observable constraints so players infer what limits income. Do not identify a best next purchase or name a bottleneck.
### Definitive rules
Structure
- Main screens: Colony (scene), Fleet, Market, Refinery, Station, Defense, Map, Reports, Evolutions (after a blast) and Records.
- A persistent top bar shows coin, income per minute, day of the month, rank and alerts.
The scene
- The scene is a side view of the mine with shafts, a lift, a surface yard, pads and ships, in pixel art.
- Miners, carts and ships are drawn in proportion to real numbers, capped at a legible count with a label for the true count.
- The scene never decides anything. Animation speed follows the real rates.
Dashboards
- Income per minute, queues/buffers, rate cards, ship status, budgets and tier-authorized reports. Use visual “!” markers without named bottlenecks, ranked purchase recommendations or undiscovered threat values.
- Charts: income over time, price history, hazards by day, and rank over the month.
Notifications
- Priority levels: critical (siege, loss), important (galactic event, hazard warning), routine (purchase, arrival). Critical stays until acknowledged. Critical and important are pop ups, routine are just topbar.
- Rate-limited so that no more than a few appear at once. A history list holds the rest.
Information visibility
- The UI shows only what the player's intel level allows. Hidden values are never in the data sent to the screen.
- A glossary tooltip explains each term on hover or tap.
Accessibility and devices
- The game works on phone width and on desktop. Colors are chosen for contrast, and meaning is never carried by color alone.
- Motion can be reduced in settings.
### Progression and balancing
- New panels appear as stages unlock, to avoid overwhelming new players. The first screen has only the mine and one button.
### Interactions with other systems
- Displays the state from all documents and sends commands to the engine. It does not compute rules (R-05).
### Edge cases and failure handling
- A very large number: shown in a compact form (1.2M) with the exact value on hover.
- A slow device: the scene lowers detail first, the panels never.
- Data not loaded: skeleton panels, not blank ones.
### UI and feedback
- Every purchase gives a short sound and visual response. Major purchases and unlocks have a larger effect.
### Implementation and acceptance tests
- T20-01: panel numbers equal the engine's numbers.
- T20-02: hidden values never appear in the client data.
- T20-03: the page does not scroll sideways at 400 px width.
- T20-04: reduced motion mode disables nonessential animation.
### Open questions
- Should there be a desktop mode with multiple panels at once? Nah
- Should the sound be on by default? Yeah

### Visual inference and information boundary
- Full piles, waiting ships, blocked lifts, idle worker markers and occupied docks visualize authoritative conditions. Clicking explains that object’s own rate, stock or status, never a global best-upgrade recommendation.
- Combat panels show researched branches and HQ lines from 23. A reasonably graphic cartoon style is used consistently; reduced-motion suppresses nonessential visual effects without changing simulation.
- Show spendable coin and escrow separately while ranking total owned coin once. Show departure payment confirmation independently of arrival and empty-return status.
- T20-05: no screen names a bottleneck or prescribes the cheapest/best next upgrade. T20-06: queued/full/idle markers match saved state. T20-07: translation tooltips and history never expose hidden canonical meanings.

### Legacy presentation and local-save safety · 26 October 2026

- Keep the purple pixel side view, animated miners, lift, yard, ship, minimap, planet map and tabbed controls. New global machine cards show cost, current → next effect, technology progress and Buy 1/10/100/Max. Tiers change presentation only; they never add hidden economic multipliers. Show ore waiting and capacity visually without naming the best upgrade.
- New local mines use the experimental three-line profile. Existing local mines retain their economics until the player explicitly chooses Tools → Try new economy → Back up & start fresh. Preserve the previous wrapper and expose a download. Never import local coin into online accounts.
- Preserve an unreadable save's exact raw text before replacing it. If recovery storage fails or already holds different data, block autosaving over the original and explain that the session is temporary until an explicit reset. Provide the recovery text for download.
- First-session guidance is dismissible; reduced-motion and sound controls remain available. Desktop and 320–390px phone-width layouts must remain usable.
- For new local mines, retain the latest 64 ledger details and 32 shipment details plus any active commitments. Retired rows enter explicit source/sink and paid-ore aggregate archives shown in Records; totals, coin and inventory do not change. Online and original-profile histories are unchanged. This bounds exact catch-up work without introducing a different offline economy.

## 21 — Testing, Validation and Acceptance Criteria

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines the invariants, edge-case tests, balance tests, offline tests, settlement tests, rollover tests and exploit checks, and the conditions for calling a feature complete.
- Each numbered document lists its own tests (T-numbers). This document defines how they are run and what must pass overall.
### Design principles
- If a rule cannot be tested, it is not yet a rule.
- Economy bugs are the most expensive bugs, so they get the most tests.
- A feature is done when its tests pass, its numbers hit the targets and its failure modes are handled.
### Definitive rules
Global invariants
1. Coin is conserved: sources minus sinks equals the change in total coin across all players, to the unit.
2. No negative balances, quantities, health or storage.
3. Every payment appears exactly once in the ledger.
4. The same seed and inputs give the same state.
5. Live play and catch-up give identical results.
6. Hidden values never appear in client-visible data.
7. At rollover, coin, SP, evolutions and sites are reset and all-time stats are kept.
Simulation tests
- A headless harness runs the engine at high speed with scripted players: idle, active, aggressive, passive, and exploit-seeking.
- A full month is simulated for 3, 10 and 30 players and compared with the balance targets in document 10.
Balance tests
- Targets: the median active player can afford a refinery around day 5 and a station around day 15, and ends the month with most lines above 80 percent. The top player is no more than 5 times the median (C-01).
- No single strategy beats all others by more than 30 percent over a simulated month.
Settlement and multiplayer tests
- Two clients settle the same shipment: one payment.
- A destination cannot invalidate a paid outbound shipment after departure; insufficient budget prevents departure, and delivery is guaranteed. An empty ship returning after delivery may be damaged or lost without reversing the payment.
- A large number of simultaneous arrivals do not exceed the platform's rate limits (C-07).
Exploit prevention
- Wash trading, clock changes, repeated reloads, duplicate tabs, negative inputs, overflow, and tampering with client data are all tested.
- Any exploit found is added as a test before it is fixed.
AI tests
- Every AI use is tested with the AI disabled, slow, and returning bad content.
Acceptance of a feature
- A feature is accepted when: its documented tests pass, no invariant fails in a 30-day simulation, its UI meets document 20, and the document was updated if the rule changed.
### Progression and balancing
- Balance tests are rerun after every change to a number in document 10. A change that moves a target by more than 10 percent needs review.
### Interactions with other systems
- Reads every document's test list. Writes pass or fail status to the roadmap (22).
### Edge cases and failure handling
- A test depends on randomness: it uses a fixed seed, and a second seed is run for confidence.
- A test is flaky: it is treated as a failure until the cause is found.
### UI and feedback
- A debug panel (not shown to players) shows the invariants, the ledger totals and the seed.
### Implementation and acceptance tests
- T21-01: the harness runs a 30-day, 10-player simulation in under the time budget and reports all invariants.
- T21-02: removing any one safeguard in document 18 makes at least one test fail.

### Revision 1.2 acceptance coverage
- Include T23 and all added reservation, closing, translation-security, visual-inference and prestige tests in the release suite.
- Benchmark affordability against 10’s gross-earnings definition; report wallet, escrow, liability, invested capital and used-line levels separately. Do not count self-transfers, grants or refunds as earnings.
- Test closure at B−1 ms, B, B+1 ms; concurrent last-budget/last-storage dispatches; server outage through closing; no connected clients; nuke with inbound/outbound commitments; contract defaults/forfeiture; hidden translation payload access.
- Test both 28/29/30/31-day months and multiple seeds for every scripted population size. Passing arithmetic cost checks does not establish economic equilibrium, achievable income or strategy balance.
- A release fails if calibration prevents used-line targets, private information reaches clients, paid shipments reverse, or presentation changes deterministic results.

## 22 — Development Roadmap and Change Management

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose and scope
- Defines release dependencies, build order, feature flags, compatibility, migrations, deprecations and the procedure for changing a rule safely.
- The owner has authorized repository assessment, release planning and game buildout. Approved R-numbered decisions govern implementation; unresolved design or spending decisions are tracked in [Questions for the Boss](../development/Questions-for-the-Boss.md). R-06 governs combat adoption, not general approval.
### Design principles
- Build the fun core first, then the market, then the world.
- Every release must be playable on its own.
- A rule is changed in the document first, then in the game.
### Definitive rules
Release plan (C-07)
- Release A: the tycoon core and market. Mine, miners, raw ore shipping to computer-run refineries, independent upgrades without milestones, coin leaderboard, month lifecycle, offline progress, ledger, basic news. Soldiers defend only.
- Release B: refineries, stations and trading. Player refineries and buy panels, stations and contracts, hidden faction demand, intelligence, endogenous economic events, player-to-player trade and pre-departure routing. No paid in-flight rerouting, mandatory gold rush or fixed mid-month shock.
- Release C: expansion, tribes and hazards. Scouting, outposts, depletion, tribes and negotiation, campaigns, deadlier monsters, space threats, the Maker and evolutions.
Dependencies
- A needs 00–05, 10, 12/23 (minimum defense), 17/18’s trusted server, scheduler, ledger and private read models, 20 and fallback-capable 19. Shipments reserve money/storage at departure; offline authority is required from A.
- B needs 06 to 09 on top of A.
- C needs 11, 13–16 and expanded 23 on top of B: persistent ecology, campaign command, translation research, outposts and Maker proposals/evolutions. Adopt 23’s resolver from A; expand content without changing live/offline semantics.
Feature flags
- Each system has a flag. A flag can be turned off without data loss. A disabled system keeps its data inert.
Compatibility and migrations
- Saved data has a schema version. A migration moves old data to the new version, and is tested on copies of real data.
- A migration never runs in the middle of a month unless it is required for correctness.
Deprecations
- A rule or field is deprecated for one month before removal, except for exploit fixes.
Changing a rule
1. Raise the change in the owning section with a reason. Use the next R-number for an approved rule or C-number for unresolved design/calibration in the single section 00 register; do not create a second register.
2. List every other document it touches and update them in the same change.
3. Update tests and the balance targets.
4. Choose when it applies: immediately, or at the next month.
5. Record it in the change log at the end of this document.
### Progression and balancing
- Balance changes are applied at month boundaries unless fixing a bug that breaks the economy.
### Interactions with other systems
- Reads test status from document 21 and provisional decisions from document 00.
### Edge cases and failure handling
- A rule conflict between two documents: document 10 wins on numbers, document 02 wins on money, document 00 wins on principles.
- A change breaks old data: roll back the flag, fix, migrate, retry.
### UI and feedback
- Patch notes are shown to players at login, with the changes that apply now and those that apply next month.
### Implementation and acceptance tests
- T22-01: every R/C reference resolves to the single register in 00; no duplicate register, obsolete normative P reference or conflicting live rule remains.
- T22-02: a migration followed by a rollback restores the original data.
- T22-03: turning off any flag leaves the game playable.
### Change log
- Draft 0.1: first full draft of all documents for review.

### Revision 1.2 change log
- Applied owner decisions: recalibrated level curves/caps; departure payment and atomic capacity/budget reservations; paid pre-close departure accounting; adopted 23; structured AI economic proposals; complete sinks/escrow/default accounting; revised trip target; visual bottleneck inference; hard cap 30 shafts; week-2 outposts; intelligence authority in 08; updated releases; month-only earnings then Spectacle multiplier; server offline authority; private translation payloads; consolidated register; reasonably graphic cartoon style.
- Removed superseded ecology/boss generation and automatic translation rules. Resolved documents 12/23 by explicitly adopting branch-wide equipment and functional combat.
- Added explicit defaults needed to make requested rules executable: incremental SP high-water awards, current-run re-eligibility, in-kind post-nuke starter mine, and old-month obligation closure before reset. These defaults are disclosed in 16/17 and remain subject to owner revision.
- Arithmetic calibration has been checked; full seeded month simulations, backend implementation and Google Doc publication are not performed by this document revision.

### Development preparation · 25 October 2026
- **Assessment complete; Release A not accepted.** Existing code implements a browser prototype called Mineshaft Capital. It has no trusted scheduler, authoritative command service, immutable accounting ledger or private simulation/read-model split.
- **Critical gaps:** return-time shipping payments, a 48-hour approximate offline cap, browser-controlled time/state, client-writable world records, 10-shaft limit, legacy upgrade/combat systems and incomplete monthly reset differ from this specification. These are implementation defects, not amendments to approved rules.
- Added a release-by-release [Buildout Plan](../development/Buildout-Plan.md), an evidence-based baseline, acceptance gates and a budget-conscious agent workflow. A0 is preparation; A1–A4 are internal milestones, not independently certified public releases. Releases A/B/C retain their scope above.
- Added [Questions for the Boss](../development/Questions-for-the-Boss.md) as the development decision tab. Recommendations remain pending unless authorized in the conversation; answers must be copied into the owning rule section/register before dependent behavior changes.
- **CEO direction recorded:** conserve Pro weekly usage; delegate platform choice with free operation preferred and a setup README required; use fresh authoritative saves while preserving the prototype. Paid infrastructure is not authorized. These are delivery decisions, not changes to R-01–R-10 gameplay.
- Corrected the retired change-tag procedure and the incorrect R-06 approval cross-reference. No economic coefficients or gameplay decisions changed.
- **Validation:** JavaScript syntax checks pass for all three existing script files. Runtime, multiplayer, security, determinism and month simulations are not certified. The legacy DOCX and arithmetic JSON remain historical v1.2 artifacts.

### A1 implementation change log · 25 October 2026
- Began A1 with the isolated accounting/command foundation and local transaction harness; added automated invariant checks and setup guidance in `backend/README.md`. No third-party runtime packages, paid infrastructure or changes to prototype saves are required.
- Added a GitHub Actions workflow for backend tests and existing browser-script syntax checks. **Local verification: 17 foundation tests pass**, including retry/conflicts, isolation, safe inputs, escrow, replay, concurrency, rollback and immutable snapshot checks. Hosted CI status is tracked separately in the implementation PR.
- Added T18-13/14 for command retry/conflict and ownership/input rejection behavior. Existing acceptance requirements remain in force; A1 and Release A are not complete.
- Recorded CEO launch scope: **private friends test, up to 10 players**. Required section 21 simulations at larger populations are unchanged.

### A1 persistence/authentication change log · 25 October 2026
- Added Firestore transaction persistence, verified Firebase token transport, current-world/month/member guards and isolated local emulator configuration. Commands now support asynchronous transaction repositories while preserving existing retry and accounting behavior.
- Added local bootstrap/demo scripts, locked dependencies, emulator CI checks and setup documentation. No prototype save, production resource or gameplay coefficient changed.
- Recorded hosting direction: Firebase Blaze, with a budget still to agree before deployment. No paid deployment is authorized by that preference.

### A1 deterministic event change log · 25 October 2026
- Added pure event-batch and seeded RNG utilities, version-1 checkpoint validation and fixture tests; no production/hiring/storage base values or event-class priorities were invented.
- **Local fast suite: 30 tests pass** after this slice. The existing 3 Auth/Firestore emulator tests remain required regressions; hosted checks run on the implementation PR.
- Logged the C-01 production/lift calibration conflict in Q-08. The CEO subsequently approved tuning provisional formulas and reporting evidence; the authorization is recorded in the single C-01 register. Adopted changes require documented profiles and measured results.

### C-01 production calibration change log · 25 October 2026
- Recorded CEO approval for provisional formula/base-value calibration and evidence reporting. Added benchmark candidate C01-LIFT-02 in section 10: explicit study bases, smooth exponential lift growth 1.0316 and unchanged cost/cap. Earlier linear and 1.0311 lift profiles remain comparison references; no universal production default is silently changed.
- Added pure production/flow helpers, bounded one-second catch-up, a reproducible seeded fixture study, JSON/Markdown evidence and CI report-regeneration checks. **Local fast suite: 37 tests pass.** Auth/Firestore emulator regressions remain required.
- Positive-modifier fixtures disproved the neutral-only 1.0311 candidate; the selected 1.0316 benchmark clears the stated analytical fixture envelope by approximately 8.17%. This is not economic, fleet/storage, deployment or full-month certification. No coin, price, grant, hard cap or deployed prototype behavior changed.

### Browser-playable development preview · 25 October 2026
- **CEO direction:** use additional lighter-model agents in parallel to deliver faster while controlling cost; preserve distinct ownership and focused checks. Provide an immediately playable Pages build. Added a noncompetitive single-player sandbox at `/play/` and preserved the original prototype at `/prototype/`. Root opens the new playtest. Sandbox state uses its own browser save key; legacy saves are unchanged.
- **Test-harness scope:** the shared shaft/lift/finite-buffer production model is rendered in the browser. Hiring, upgrade purchases, shaft expansion, local loading/paid departure/arrival, buyer funds/capacity, local records and time/grant/reset controls can be exercised without a Firebase account or AI key. This does not deploy the trusted multiplayer service or satisfy Release A.
- Starting coin, hiring/habitat costs, fixed test offers/budgets and omitted systems are explicitly sandbox fixtures. Test grants and fast-forward exist only in this noncompetitive harness; they are not authorized commands in the competitive economy. No month ranking/reset is simulated in the preview.
- The local shipping model removes surface stock through a new explicit external-transfer helper while preserving production totals. Loading is unpaid; the local sale commits at departure and arrival does not pay again. Trusted cross-owner commercial settlement remains unimplemented; local records cannot enter server leaderboards or prestige earnings.
- Fixed a long-run floating-ore conservation false positive. The ore-only numerical allowance now uses a conservative accumulated-operation bound `max(128×epsilon, n×epsilon/(1−n×epsilon)) × max(1, |accounted|, |physical|)`, with n=256×(elapsedSeconds+1), checked per ore. A precision-budget overflow rejects; no tolerance is used for coin or future contractual settlement. Added one-hour and real-withdrawal regressions and regenerated the study's disclosed tolerance.
- **Validation:** 9 sandbox model tests, 39 backend fast tests and 3 Auth/Firestore emulator tests pass locally. Chromium desktop/mobile checks cover first sale, purchases, shaft/hire/routing, one-hour fast-forward, save/pending-catch-up reload, reset isolation and corrupt-save recovery with no JavaScript errors. Fixed a stranded-ore loading stall and fractional dispatch residue; old paid shipments remain unchanged.
- Pages publishes **main/root**. Development/specification branch merges alone do not publish. The playable integration includes the reviewed foundation work and targets the actual Pages branch. Billing, paid hosting and production Firebase configuration remain unchanged.

### Sandbox common ore and rare veins · 25 October 2026
- **Implements existing approved rules, not new ones:** section 04 (one exclusive common ore per region, infinite; rare veins finite, hidden in shafts and not guaranteed; mythic only in tough regions at deep shafts; hardness 1-2 / 5-6 / 9-10 against the mine's tool) and section 03 (a depleted vein returns the shaft to the common ore of its band). The earlier `/play/` fixture that cycled all seven ores across shafts did not follow this and is replaced.
- **Sandbox model (`play/model.js`):** a site has one common ore (ferrite or cobalt) and a seeded rare-ore set. Each shaft generates its own veins on opening (chance rises with depth; shaft 3 always holds one rare vein so a first vein appears early). A tunnel face advances only from common digging; when it reaches a vein and the pick is hard enough, the shaft yields the vein ore until the vein is exhausted. Exact accounting caps the last second so mined vein units never exceed vein size (T04-03) and never go negative (T04-02). A pick too weak leaves the vein intact and flags it.
- **Provisional, C-03:** vein size = richness 0.6-1.5 x tier constant (rare 900, mythic 3000) x (1 + 0.15 x (shaft-1)); tool hardness by pick tier 2/4/6/8/10; tunnel-face distance 40 x log2(1 + units/4), capped. The below-20-percent warning is implemented; the proportional taper below 5 percent is **not** implemented in the sandbox. These are sandbox fixtures, not certified balance.
- A shaft changing ore flushes any old-ore buffer to the surface yard when room allows, otherwise digging holds until the lift clears it. Tests added for T04-02, T04-03, tool hardness, determinism and one common ore per site. Presentation (tunnel digging, deposits, miners reaching and mining veins) illustrates this state and never changes it (T03-02).

### Private-world settlement checkpoint · 26 October 2026

- Added bounded zero-client owner settlement to the trusted scheduler route; preserved ledger/checkpoint atomicity, internal authentication, month-boundary order and resumable retries. Tests cover duplicate ticks, payment rollback, roster limits and per-owner failure isolation.
- Runtime deployment is not included in this source checkpoint. Full Release A acceptance, production cost evidence and the general event queue remain outstanding.

### Playability integration checkpoint · 26 October 2026

- **CEO direction:** retain the legacy interface and pixel scene; prioritize an enjoyable mine → ship → sell → upgrade loop. Make engineering judgment calls, test changes and save frequent reviewable PRs without waiting for answers during this work session.
- Two user-supplied files propose a separate **sandbox** economy: global Pick/Lift/Hauler ladders, stronger per-level effects, shorter trips and a fluid pacing simulator. They are implementation inputs, not certified balance or an amendment to the authoritative multiplayer caps. Section 10 owns adopted coefficient records; section 21 still owns acceptance.
- Existing prototype, browser saves and server accounts must remain intact. Online clients continue to use trusted server commands. Presentation reuse must not make the browser authoritative.
- Work and verification are tracked in [Playability progress](../development/Overnight-Progress.md). Release A remains incomplete.

### Playable economy and recovery batch · 26 October 2026

- Integrated the supplied sandbox economy/pacing study, calibrated a provisional three-line profile and retained independent trusted-server economics. Added exact one-second pacing evidence and bounded history archives. Owning sections 03/05/10 document every adopted coefficient and limitation.
- Preserved the legacy pixel UI; added machine effect previews, bulk controls, onboarding, reduced motion, explicit old-save migration backups and corruption recovery. Section 20 owns these presentation/save requirements.
- Existing prototype saves and online accounts are preserved. Browser and invariant verification is tracked in [Playability progress](../development/Overnight-Progress.md); incomplete Release A systems remain incomplete.

### Published playability checkpoint · 26 October 2026

- PRs #12–#14 are merged; Pages successfully published the new sandbox from `73ee0bd`. Public browser checks verified the ten-unit starter shipment, upgrades, fast-forward, mobile layout, preserved prototype and online sign-in. The rulebook remains the maintained source; this does not certify Release A or full-month balance.
- Acceptance evidence for this batch: 27 sandbox tests, 86 backend tests and 10 real Auth/Firestore emulator tests passed. An authenticated browser loop on local emulators verified server-backed sale, single/bulk purchase and reload persistence. Complete results and remaining runtime/deployment limits: [Playability progress](../development/Overnight-Progress.md).

### Industry, home operations and client-runtime batch · 26 October 2026

Added the local refinery → refined goods → station/spot buyer loop, simulated hourly offers, bounded home-safety incidents and delayed infantry reinforcement, explicit-action Maker names/factual dispatches, 30-second online reconciliation and a browser worker for heavy local catch-up. Owning sections 06/07/08/12/17/19 document scope and coefficients. Existing saves initialize new systems at the current second; no old progress is replayed into invented earnings.

The legacy pixel interface remains the visual contract. Industry and Colony tabs expose actual inventory, processing, contracts and safety status; no controls claim unimplemented shared industry or full combat. [Implementation and acceptance evidence](../development/Industry-Release.md) tracks this batch. Release A/B remain unaccepted pending their full gates.

### Public industry playtest and automation follow-up · 26 October 2026

PR #16 is merged and publicly verified: refinery/stock/sale/contract, infantry arrival, no-key Maker and mobile/save behavior all passed. Added optional automatic refinery exports after playtesting identified repeated manual selling as a chore. Minimap thumbnails refresh with paused/reduced-motion view changes. Follow-up invariant coverage includes automatic revenue, self-transfer, full-wallet waits and escrow archive reconciliation; 68 local tests pass. Exact worker catch-up/reload and approximately 30-second online polling were browser-verified. Live paid AI execution and full Release A/B acceptance are not claimed. [Detailed evidence and scope](../development/Industry-Release.md).

### Release A2 mine-to-buyer loop change log · 26 October 2026

- Implemented, server-side only: shafts 1–30 with per-shaft lights/supports/carts/bunkhouse, pads 2–12, ships (three classes) with per-ship policies, depth bands and finite veins with 20%/5% warnings, soil/weather modifiers, weather grounding, dock reservation queue, ≥3 seeded NPC refineries per planet with a finite premium, and `buyPad`/`buyShip` commands beside the transactional `buyUpgrade`. Owner documents are schema version 2 (fresh saves; no migration).
- New coefficients are C-02/C-03 provisional and listed in sections 03/05 above; none is certified balance. Arithmetic and unit tests do not certify economy balance.
- Interpretations logged as questions rather than rules: Q-11 (ship price), Q-12 (worker surplus reading and unimplemented hardness gating), Q-13 (premium vs the Q-10 "unlimited buyer" ruling), Q-14 (dock/premium order dependence).
- Evidence: A2 acceptance suite, environment and NPC-market unit suites, and Firestore emulator parity tests (premium last-coin and last-slot races, rejected-dispatch no-mutation, duplicate settlement). Release A is still not accepted; A3/A4 items remain open.

### Claude branch integration checkpoint · 26 October 2026

Combined the fenced durable event queue/worker with A2 fleet, pads, routing, seeded environment, veins and refinery premium/dock state. Preserved both acceptance suites and fixed the shared production kernel's incompatibility with local rare veins. Added backward-compatible online fleet controls and nested ore/destination projection handling; retained local industry and save/runtime safety while porting the newer fast sandbox prices. Existing source branches remain traceable.

Evidence: 70 local tests, 155 backend tests, 14 Auth/Firestore emulator tests and an A2 projection browser bridge pass. [Branch integration details](../development/Branch-Integration.md). The owner-v2 backend requires fresh staging/month-boundary saves; this source integration does not deploy or migrate the live runtime. Premium fairness and Q-10 interpretation remain pending; Release A is not yet accepted.

### CEO pacing and CES decision record · 26 October 2026

Confirmed the already-published fast sandbox progression (34/45/39 base upgrade prices, growth 1.75). Recorded the CEO’s CES supply/demand and bid-offer requirement in section 08 and Q-13. Existing premium and hourly-pressure formulas remain fixtures until replaced by the required economic model. No runtime pricing, accounting or deployment changes are made by this decision-record batch.

## 23 — Advanced Combat and AI Military Command

**Status: consolidated revision 1.2.** Approved rules use the register in 00; C-numbered coefficients remain calibration work.

### Purpose And Governance
Defines military hierarchy, deterministic autonomous combat, equipment research, robotic AI General HQ, and offscreen campaigns. This adopted section governs combat mechanics and equipment research and replaces conflicting older rules in 12; 13 owns diplomacy and campaign outcomes, 14 species, 10 upgrade economics, 17 simulation time, 18 persistence, 19 narrative generation, 20 UI. Adoption is recorded in 22. The combat presentation is cartoonish and reasonably graphic under 19; the simulation remains abstract and deterministic.

### Non-Negotiables
One seeded simulation determines both watched and unwatched engagements. Soldiers are interchangeable, while squads/divisions retain aggregate morale, training and readiness. Four branches only: Infantry, Armored, Specialist, Air. Player manages budgets, doctrines, deployment priorities and army-wide upgrades, never individual soldier equipment. Home mine remains operational and cannot be captured or permanently destroyed. Paid outbound shipments are guaranteed; only empty return ships face eligible attacks. Reinforcements are not present until their shuttle arrives. Displayed miners represent production rates, not one-to-one persistent agents.

### Command Chain
Player -> AI General at home Military HQ -> regional/site commander -> squad leader -> temporary soldier agents. Player sets budgets, troop targets, garrison minima, reserves and priorities (worker safety, infrastructure, production, casualty avoidance, balanced). AI General periodically scores site demand using estimated threat, asset value, travel delay and minimum garrison; allocates available forces without teleportation. Commanders allocate patrol sectors and response squads. Squad leaders coordinate engagement, rescue, cover and withdrawal. Individuals observe only locally; reports arrive through sensors, witnesses, alarms and communications. No unit knows true hidden threat values.

### Robot Ai General — Visible Hq
General is a fictional robot/software entity, not a real generative model: no inference tokens or external AI API calls. HQ evolves visually from a wheezing family PC on a folding desk to a workstation, server rack, operations bunker, planetary datacenter, distributed supercomputer and futuristic command nexus. Purchases add screens, cooling, antennae, robots and maps; these visuals never cause combat outcomes. General's competence depends on upgrades, not a magical omniscient intelligence score.
Independent upgrade lines (each proposed cap 1000): Compute Capacity (sites simultaneously considered and planning frequency); Sensor Intake (report freshness and confidence); Decision Algorithms (allocation efficiency); Communications (order latency); Logistics Forecasting (shuttle scheduling and reserves); Strategic Memory (quality of learned species/threat estimates); HQ Resilience (degradation during disruptions); General Training (doctrine compliance and coordination). Military Strategy remains branch-unlock progression and Security Planning remains patrol coverage. All use cost = round(baseCost × growth^currentLevel) with the calibrated line-family curves in 10 and 1/10/100/Max purchase buttons; document 10 owns actual bases and growth. Proposed illustrative formulas, not finalized: planning slots = 1 + floor(ComputeLevel/20); order latency seconds = max(2, 60/(1+0.025×CommunicationsLevel)); allocation waste fraction = max(0.03, 0.35/(1+0.015×AlgorithmsLevel)). Sensor upgrades improve information, never actual hidden world state. General training is purchasable in batches rather than real-time model training.

### Army, Recruitment And Progression
Recruit 1/10/100/Max troops per division, limited by coin, barracks, hangars, unit capacity and shuttle transit. A division has troop count, site, assignment, readiness, morale, aggregate training, weapons tier, armor tier and reinforcement ETA. Casualties reduce actual troop count; replacement costs compete with mine upgrades. Soldiers have no unique lifetime skills or personality. Army-wide branch research applies to every eligible unit of that branch and new recruits. Whether remote divisions need retrofit deliveries is a provisional design choice; default instant standardized upgrade avoids micromanagement. Separate armor and weapon progression per branch; no per-squad loadouts.
Weapon design uses many purchase levels, not 1000 bespoke weapon models. Six visual technology eras: improvised, industrial, ballistic, electromagnetic, energy/plasma, exotic sci-fi. Four independent lines per branch: Infantry—close defense, rapid fire, precision, area denial; Armored—heavy weapon, armor, mobility, targeting; Specialist—rescue, environmental suits, reconnaissance, adaptive tools; Air—interception, escort, sensors, propulsion. Each line has up to 1000 incremental levels and distinct tier skins. Within a branch, active equipment is standardized automatically from unlocked technology and doctrine; older technologies may remain situationally useful. Weapon statistics: effective range, accuracy, precision, penetration, impact, firing interval, reload, mobility, target compatibility, power draw, operating cost. Armor changes protection profiles, not an invulnerability flag. Advanced technology can require rare ore inputs subject to the existing economy; exact ore recipes and upkeep are provisional and require 04/10 approval.

### Deterministic Physical Combat
Combatants have position/sector, movement mode, perception, protection profile, accumulated stress, functional state (operational, impaired, severely impaired, incapacitated), and weapon capability. Resolve each attack: detection -> target selection -> hit check -> location class -> protection/penetration -> impact/stress -> functional outcome -> morale/AI response. Critical outcomes are conditional on successful hit, vulnerable-area selection, protection and disabling effect, not arbitrary critical-damage multipliers. Nonpenetrating impacts may cause stagger or accumulated impairment; penetrating attacks can change functional condition. Large threats can be resistant but not absolutely immune. Precision weapons trade attack frequency for better vulnerable-area probability; short-range weapons trade reach for frequency or impact. No single visible HP pool required. Simulation damage is abstract; presentation may include cartoonish, reasonably graphic injury effects alongside impacts, recoil, knockback, damaged equipment, alarms and retreats. Visual intensity never changes outcomes.
All randomness is seeded from event ID, entity ID and simulation tick. Fixed event order and fixed-point or stable deterministic arithmetic preserve replay. Store actual outcomes before generating any narration. Combat is not affected by render frame rate, camera, or whether the player is online.

### Autonomous Behavior And Scaling
Each squad evaluates finite candidate actions: patrol, observe, investigate, intercept, defend, engage, reposition, protect miners, rescue, retreat, request backup. Scores depend on orders, perceived danger, equipment range, cover, route accessibility, ally cohesion and expected arrival time. AI cannot act on unseen creatures. Squads respond to gunfire, alarms and witness reports after propagation delay. In watched battles, draw representative soldiers and monsters with consistent action states; distant or large battles resolve using sector/squad event simulation. Detail changes presentation and CPU cost, never seeded results. Patrols are represented as coverage and response-time calculations at baseline; detailed walking agents are an optional visualization of the same allocation.

### Creatures And Environment
Species use 14’s adopted persistent ecology, classifications, physical profiles and combinable traits. Legacy archetypes are descriptive examples, not a separate generation system. Replace legacy health/damage balancing with toughness/protection, stress tolerance, mobility, vulnerable-area profile and attack capabilities. Creature AI reacts to obstacles, alarms, injuries and fleeing workers. Tunnels constrain vehicles, sight, movement and reinforcement; gas, cave-ins, flood and weather change accessibility and performance. A nest is a continuing spawn source until resolved. Bosses remain rare and can overrun eligible outposts, never home. A miner evacuation reduces utilization or worker availability according to 03 rather than independently simulating hundreds of persistent miners.

### Tribes And Campaigns
Tribes are organized opponents with commanders, cohesion, territorial familiarity, communications, supply and political goals, not monster AI. Defensive raids use the same combat resolver as garrisons. Offsite campaigns advance through strategic phases: intelligence collection, force deployment, contact, territorial contest, stabilization or withdrawal. Outcomes depend on local knowledge, imperfect scouting, logistics, morale, technology, mobility and command competence; technological superiority does not guarantee territorial control. Regional control and diplomacy may be more valuable than destructive conquest. Preserve 13 negotiation, tribute, ceasefire and mining rights. Section 13 owns approved campaign consequences and worker outcomes; section 23 does not expand or replace them. Exact coefficients remain C-04 calibration. General reports provide objectives, confidence, losses, delays, territory status and economic consequences; narrative AI may only paraphrase logged facts.

### Economic Integration
Security has opportunity cost: coin spent on recruits, HQ compute, branch research, repairs, facilities and replacement troops cannot buy shafts, lift, ships or refineries. Site protection affects expected lost production hours, worker losses and asset damage; evaluate defense investment by expected avoided loss and coverage. Threat remains hidden except estimates from 11. Rare ores can support advanced equipment if recipes are adopted, preserving supply scarcity. Do not add ship fuel/crew costs or overturn existing one-time miner hire rules without amending 05/03. No invisible milestone multipliers or stage gates. Use document 10 cost curves and document 02 ledger semantics.

### Persistence, Ui And Reports
Store per-site assignments, per-division counts/readiness, HQ line levels, equipment line levels, doctrine, patrol coverage, threat estimates with confidence, command queue, transit ETAs, encounter seed and event log. HQ screen shows the growing robot General installation and separate upgrade cards with cost, marginal effect and Buy 1/10/100/Max. Army screen shows four branches, strength, coverage, equipment era, readiness and reinforcement ETA. In-mine ant-farm view shows representative patrols, alarms and action states; offsite view shows regional campaign map and general's factual briefings. Narrative text cannot invent events or alter outcome.

### Acceptance Tests
T23-01 same saved state, seed and tick produce identical results in watched/offline mode. T23-02 soldier count cannot go negative and reinforcements fight only after arrival. T23-03 upgraded command capacity reduces planning bottlenecks without revealing true hidden threat. T23-04 branch-wide upgrade reaches all eligible formations and new recruits. T23-05 one formation cannot defend multiple sectors at full strength simultaneously. T23-06 home mine never reaches permanent capture or total combat shutdown. T23-07 paid outbound shipments cannot be lost or diverted. T23-08 equipment ranges change preferred engagement behavior. T23-09 combat event log reconstructs casualty, impairment and production effects. T23-10 a thousand visual soldiers do not require a thousand persistent simulation entities.

### Cross-document adoption
- 12 and 14 now use this resolver. 10 defines cost families; 18 stores command queues and event outcomes; 19 controls narration; 21 includes the T23 suite. Numerical HQ examples remain C-04 calibration, not required finalized coefficients.
- **Each branch has its four specialty lines plus a shared protection line; where a specialty is already named armor, that line supplies protection and is not charged twice. No individual loadouts.**
- T23-11: visible combat effects meet the reasonably graphic cartoon style while combat facts are identical with rendering disabled.
