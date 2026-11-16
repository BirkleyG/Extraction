# Mineshaft Capital roadmap

Goal: **fun first.** You are a Guild General, not a mineshaft overlord. Every month the Maker Guild opens a new planet; rival guilds get one month to prove what they can pull out of it, and the guild holding the most coin at the end wins exclusive rights. Play is **macro**: operations, routes, prices and policies across a living planet. Never micromanaging miners.

Planning rules:

- **Choices, not clicks.** Every system exists to create a decision whose best answer you can't look up. The game never recommends a buy or a route.
- **Five minutes or an hour.** A casual check-in (sign the contract, send a drone, expand a mine) and a long session (read survey reports, compare contractors, haggle with buyers, plan an air corridor) should both win games. Reading is optional and should feel like browsing, never homework.
- **The planet is the board.** Regions, climate, hidden ore fields and (later) tribes, creatures and pollution make each month different.
- **Prices come from the model.** The nested CES market sets every price; events and the Maker shift budgets, needs and outside supply, never prices directly.
- **Profit wins.** Coin at month's end, so spending, saving and timing all matter. Running costs are real.
- **Dark, satirical humor.** Extraction capitalism at galactic scale: incidents, buyers, contractors and the Maker all get a voice.
- Rates, not agents: the server computes flows; ships and drones on the map show what is happening and never decide it.

## Decisions so far (owner)

- 2026-11-12: Pacing is a few check-ins a day; months stay calendar-length; plan for 3–10 players; AI cap 300 calls a day, 60 per player.
- 2026-11-16: **The guild game replaces the mineshaft game.** Macro over micro. Winner = most coin (profit). Buyers are discovered, not listed. Galactic exchanges come later in the month: mines sell to refineries, refineries to exchanges, exchanges to galactic buyers. Keep the nuke, SP and the Maker. The side-view mine comes back later as something you click into to watch. The old mineshaft game stays at `/mines/`, the original artifact at `/classic/`.

---

## Guild 1: the macro game (built, v1.0)

- **Command hub** at a fair landing spot: airstrip, command center and the Landing Pit (a level-1 mine). Hub levels raise claim reach, hangar space, construction crews and research.
- **Operations** founded anywhere inside your claim: mines, refineries, air stations (extend your claim, add hangars, refuel ships), research hubs. Construction takes hours, a few crews at a time.
- **Mines** have macro levels (Pit → Works → Complex → Megaworks → Planetary Wound), an intensity (Gentle / Standard / Brutal: more ore vs. running costs and accidents) and an optional ore focus. Rare and mythic veins run out; commons never do. Ore harder than your drills stays in the ground until you research better ones.
- **Surveys:** drones fly out (hours) and bring back fuzzy reports that sharpen with research. Building blind is allowed.
- **Routes:** pick a mine, pick a refinery on the map. Haulers, clippers and leviathans (research) cycle on it; air stations let long routes refuel. No "best route" hint anywhere.
- **Guild contractor refineries** (computer-run, dark-humored) post what they pay for raw ore. Different cuts, different tastes, different distances.
- **Your refineries** keep more of the value and can **buy ore from other guilds** at a share of the galactic price you set. Other players see them on the map and can route to them, even while you sleep.
- **Galactic Exchange** (from day 5, needs a refinery): refined goods go to orbit, sell spot or fill **contracts**. Galactic buyers call with offers. Casual players press Sign; curious ones talk, haggle (each buyer has a hidden top price and a temper) and slowly learn each buyer's backstory, tastes and tells.
- **The market:** nested CES demand (materials vs. everything, across uses, across ores within a use) from 24 galactic buyers, outside suppliers with rising supply curves, planet supply from real sales. Commons are price takers; rares have influence; mythic is OPEC.
- **Research:** RP from the hub and research hubs. Extraction, Logistics, Refining, Survey, Commerce and Safety tracks.
- **Incidents** at mines, worse when you push Brutal: halts, compensation and grim jokes.
- **Prestige:** nuke everything (after 250K earned) for Spectacle; keep surveys, buyer contacts and SP; argue with the Maker to bend the galactic market for everyone; evolutions.
- Galactic events about once a week shift budgets, needs and supply. Leaderboard, Hall of Fame, chronicle, planet news.

> **Playtest:** Is the first check-in clear without reading anything? Does a 5-minute player stay competitive with an hour-a-day player? Do players route to each other's refineries? Does anyone haggle? Does a mythic find feel like a jackpot? Is it ever obvious what the best move is (if so, change it)?

## Guild 2: tune and deepen (next)

- Balance from real month data: income curve, running costs, contract sizes, exchange timing, nuke threshold.
- Buyer conversations voiced by the AI (within the daily limits), with the engine still deciding the deal.
- Market intel as discovery: price history charts, "what if I flood it" estimates (the engine has `priceAt`), share of each market.
- Click into a mine to watch the side-view crew dig (the old renderer), with macro upgrades shown in it.
- Contracts between players (sell refined goods to another guild's exchange).

## Guild 3: the planet fights back

- Weather per region (dust, storms that ground ships, ash, cold).
- Wildlife territories painted on the hidden field: pests, standard creatures, apex predators, 1–2 roaming mythic beasts.
- Tribes, from nomads to empires, with territories, relations and temperaments. Diplomacy (tribute, trade, threats), mining-rights deals, raids.
- Military as policy, not micromanagement: garrisons at operations, campaigns against nests or tribes, a robot General that runs the soldiers.

## Guild 4: pollution and climate

- Every operation pollutes; Brutal pollutes more. Pollution spreads through the climate field and raises disaster odds (floods, storms, quakes, angry wildlife).
- Cleanup and mitigation policies; a planet that visibly changes over the month.
- Satire: carbon-credit style Guild offsets, greenwashing contractors, the Maker's opinion on the state of the planet.

## Later

- Species builder upgrades and perks, richer AI planets and lore, rules page and glossary, patch notes at login.
