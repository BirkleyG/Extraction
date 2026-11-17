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
- 2026-11-16 (after playing v1.0): **Zoom out to plan, zoom in to play.** The map stays simple; every operation opens into a living inside view. Upgrades cost coin, not waiting (only travel takes time). No hand-holding: no "what this site needs" lines or advice banners; players discover problems by looking (a full pile, a "!" over a cart). Workers are bought off-planet, die often and funnily, and are topped up automatically from a labor pool so offline play is safe. Two ways to win emerge from what you build and research (no charters): specialize in one link of the chain, or own the whole chain. Refiners always buy ore outright (no toll refining). Territory is fully open; only cost grows with distance. Research becomes a skill tree whose branches are unlocked by research hubs in different regions. Everything AI-generated follows the planet's theme. No late-join bonus: join next month. Balance across the whole spending mix is a hard requirement.

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

## Guild 2: the living operations (built, v1.1)

*Zoom out to plan, zoom in to play. The map is the strategy layer; every operation is a little world you can open, watch and tune.*

The map
- Simple at a glance: operation icons, routes as ships with ore-coloured cargo, a "!" where something is wrong. No advice text, no "short on workers", no "pile growing" banners. Players find out by clicking in.
- Click a ship in flight and the camera follows it over the changing terrain: cargo, ETA, the regions it passes.
- Click into other guilds' operations to watch them work (look, don't touch).

Inside every operation (one shared mechanic, different looks)
- Opening any operation shows a side-view "anthill" scene: mines (shafts, miners, carts, lift, ore piles), refineries (landing pad → silo → conveyors → vats → export yard), the command hub (main office, shuttle pad with workers arriving and leaving, analytics and reports), air stations (hangars, fuel), research hubs, the Galactic Exchange.
- **Parts instead of one "Expand" button.** Each operation has parts you buy and see: mines get shafts, drill rigs, bunkhouses, carts and lift, lights and supports; refineries get pads, silos, pipelines, vats, holds; the hub gets bunks, shuttle pads, an office; and so on. Parts cost coin and go in right away; travel is the only thing you wait for. Stockpile bars and "!" markers show what is full or stuck.
- **Shift orders** for mines (and the equivalent elsewhere): Relaxed (less output, morale up), Normal, Overtime (more now, tired crews), Blast (a burst of ore, cave-in risk). A real edge for active players, never a big one; offline guilds run on the standing order.
- **Incidents as small choices** with dark jokes ("6 miners trapped: pay for the rescue, or seal it and keep digging"). Offline, a default policy decides.

Workers
- Ordered from an off-planet labor company (themed to the planet), shuttled to the hub, sent to operations. Staffing drives output.
- They die, get hurt, tire and occasionally unionize. Frequent and funny, kept simple: wages and safety as broad levers, a fixed going rate for labor (no labor market).
- **Labor pool:** set how many spares to keep and a replacement budget at the hub; dead workers are replaced automatically so you never come back to an empty mine.

Specialize or integrate (emerges from what you build and research)
- **Mining:** post a gate price at a mine; other guilds' ships can buy ore there.
- **Shipping:** freight contracts. Haul another guild's ore from their mine to a refinery for a rate per tonne. A pure shipping guild can win without owning a mine.
- **Refining:** refiners always buy ore outright (as now). No toll refining.
- **Trading:** the Galactic Exchange and its buyers are the global market.
- **Later:** fighting and hunting as hired services (escorts, clearing nests) with Guild 3.
- **NPC customers** for every service (freight jobs, gate buyers, ore sellers) so a specialist always has work, even with three players.

Open territory
- Build anywhere. Cost grows with distance from your hubs and air stations (supplies fly in); nothing else is forbidden. Guilds can build fairly close to each other and race for rich ground and good shipping hubs. Air stations become trade infrastructure, not fences.

Research as a skill tree
- A Forager-style skill tree you explore and unlock node by node, replacing the flat list.
- Branches unlock by **where** your research hubs stand: a hub in a volcanic region opens one branch, a glacier another. Spreading research hubs across the planet opens broader research.

Theme everything
- The month's AI build themes contractor refineries, the labor company, workers, incidents and buyers' lines to the planet (a candy planet gets a candy crushery). Themed fallbacks when the AI is off.

Also in this phase
- No late-join bonus: join next month.
- Balance pass across the whole spending mix (parts, workers, ships, buildings, research) with the pacing bot, so no single purchase dominates the way shafts did in v0.5.
- Buyer conversations voiced by the AI (within the daily limits), with the engine still deciding the deal; market intel as discovery (price history, "what if I flood it").

Built in v1.1: inside views for every operation (and watching rivals'), parts instead of expand-and-wait, workers shipped in by a themed labor company with an auto-replacing labor pool, shift orders and Blast, cave-in and strike decisions with standing orders for offline play, open territory, prospector camps, Guild freight jobs, mine gates, a regional skill tree, themed contractors and camps, ship following, no late-join bonus, Guild 1 guilds migrated. Not yet: AI-voiced buyer conversations, "what if I flood it" intel (price history and market share are in, behind Market Analysts).

> **Playtest:** Do players open their operations just to watch? Do they notice a full pile without being told? Does anyone specialize (all shipping, all refining) and still compete with an integrated guild? Does a 5-minute player still keep up? Is any one purchase obviously the best?

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
