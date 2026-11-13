# Mineshaft Capital roadmap

Goal: **fun first.** Every phase ends with something playable that's more fun than before, plus one playtest question to answer before moving on. Later phases can change based on what playtests show.

Planning rules:

- **The month is the game.** Unlocks arrive over the month as Guild licenses (by day *and* by coin earned), so day 1, day 10 and the closing bell feel different. Each month's planet, ores and buyers make it play differently.
- **Rates, not agents.** The economy runs on rates (ore/min, cargo/min, coin/min) computed by the server. Miners, carts and ships on screen show what's happening; they don't decide it. This gives exact offline progress, no cheating, and makes trading between players possible.
- **Simple on the surface, deep underneath.** Players see prices, trip times and coin/min. The demand math (hidden buyer maximums, CES, market power) stays in the engine and is revealed through intel, never through rules text.
- **Each system gets one decision that matters.** If a feature doesn't create a choice, it waits.

## Decisions so far (owner, 2026-11-12)

- The artifact's tribes, army, hunting, species archetypes and skill tree are **hidden** from Phase 1 and rebuilt in their own phases.
- The species skill tree and archetypes are **replaced**: evolutions (bought with nuke SP) replace the tree; species are rebuilt with the modular builder in Phase 2.
- **Pacing:** players check in a few times a day. A strong player can first nuke (20M earned) around day 3–4.
- **Months** stay calendar-length; no shortened test months.
- **Players:** plan for 3–10 per month.
- **AI spend:** the current cap (300 calls a day, 60 per player) is fine.

---

## Phase 1: The core loop feels great

*Mine → lift → yard → ship → sell, on rates, with a clear first session.*

Mine
- Side-view pixel mine: a main tunnel with up to 30 shafts. Deeper shafts reach rarer ore and are more dangerous (danger comes in Phase 2).
- Hire miners once, no upkeep; they're auto-assigned to the best shafts.
- Shaft upgrades shown in the shaft itself: bunkhouses (more miners) and carts/rails (throughput). Lights and supports come with hazards in Phase 2.
- **Conveyor belts replace porters.** The lift carries ore to the surface yard; conveyors feed the launch pads.
- A **"!"** marks bottlenecks and wasted labor, with a bottleneck line naming the cheapest upgrade that would help.

Ores
- Seven ores per planet: 2 common, 4 rare, 1 mythic. The AI invents each ore from the planet's theme and its galactic use: name, color palette, crystal shape and description (a candy world might mine "gumdrop quartz" used in starship insulation). Ore sprites are drawn from those choices.
- Hardness: rarer ore needs better drills. Mythic needs special equipment (a later license).
- Common ore never runs out. Rare and mythic veins deplete, with vein bars and warnings at 20% and 5%, which pushes you to open deeper shafts.

Shipping and selling
- Three ship classes: Hauler, Cruiser (fast, small), Freighter (slow, huge).
- Routing policy per ship: best earnings, nearest, or fixed destination.
- Destination table: price, trip time and coin/min, with the best option highlighted. Trip times are always known in advance.
- No fuel, crew or maintenance costs. Paid cargo always arrives.
- **Simple market:** a few computer-run buyers that always buy. Each ore's price falls as the planet sells more of it and recovers over time. Common ores barely move (price takers); mythic swings hard (price maker). This is the visible core of the full economy model.

The planet's look (AI-built, from the archived Tycoon sandbox)
- Each month the AI picks one central theme (e.g. a candy world, a haunted bone-yard, a dead neon city), then builds the sky, moons, rock layers and ore colors to match.
- A ring of 5–7 regions, each a distinct landscape with its own skyline, ground details, biome colors and always-on weather effect. Bring back the 39 landscapes from `play/planet.js` and `play/terrains.js` on `archive/legacy-tycoon`: 27 earthlike (mesa, dunes, glacier, volcanic, jungle, redwoods and more) and 12 alien (crystal spires, fungal forest, floating islands, neon ruins and more). They don't have to be copied exactly.
- The AI reads a summary of earlier months' planets so each one feels new. With no AI, the game improvises from built-in themes.
- Your mine sits in your region and looks like it. The planet map shows every region.

Month and players
- Lore: the Maker Guild grants extraction rights, and you are a Guild General. At month start you name your species and pick a color; the full species builder arrives in Phase 2.
- Top bar: coin, coin/min, day of the month, rank, alerts.
- Live monthly leaderboard (coin and coin/min).
- Bulk buy: 1x, 10x, 100x, Max. Every upgrade shows its cost and next effect.
- Rename your sites and ships.
- Unlimited offline progress at the live rate, with a "while you were away" summary.
- Mid-month joiners get a catch-up grant.
- First screen is just the mine and one button. New panels appear as you unlock them. A guided first session: mine, ship, sell, upgrade.
- Works on phones, reduced-motion mode, sound on by default.

Engineering under the hood: move the economy to a server-side rate engine. The existing pixel-art renderer stays and animates from the rates. The artifact's tribes, army, hunting, archetypes and skill tree are hidden.

> **Playtest:** Is the first 30 minutes fun? Do people come back the next day to spend what they earned offline? Does each month's planet feel like a new place?

---

## Phase 2: The month has a shape (prestige + stakes)

*The nuke and the Maker are the signature hook, so they come early.*

Prestige
- Nuke the whole colony (2 confirmations, needs 20M total coin earned). Ships in flight settle paid cargo and are removed. Restart from a starter mine; evolutions carry over.
- Spectacle = total coin earned^(1/7.5). It's the SP you earn and sets how big a galaxy change the Maker can grant.
- Cinematic blast and score screen.
- **The Maker negotiation:** ask for one economic change and give a reason; up to 3 rounds of accept, counter or refuse. The AI writes the Maker's lines, the engine decides the outcome (85% Spectacle + 15% negotiation quality, scored by the AI). Allowed changes: demand for an ore, outside supply of an ore, global prices, which factions are buying. Changes apply to everyone and last all month. Fallback lines if the AI fails.
- Galaxy bulletin listing every active change and who caused it.
- Evolutions bought with SP: mine speed, refine speed, ship speed, sell price, Spectacle multiplier. Rising costs, lasting all month.

Species builder (with the Maker Guild, at month start)
- Pixel species assembled from a parts library: heads, bodies, arms and legs, eyes, mouths, skin patterns, accessories and color palettes. Enough combinations that no two colonies look alike.
- Describe your species in a sentence; the AI picks the parts, colors, name and a one-line tagline from the library. You can reroll or swap any part by hand.
- The look appears everywhere your colony does: miners, the leaderboard, the feed and the Hall of Fame.
- Purely cosmetic in this phase; no stat perks.

Stakes and rhythm
- Closing-bell countdown to the final 48 hours.
- Hall of Fame entry each month (planet, winner, final coin).
- All-time leaderboard: total coin, months won, best month, average per month.
- Month-end wipe: coin, SP, evolutions and galaxy changes reset; all-time stats and the Hall of Fame stay.
- Richer AI planet generation: colors, look, topography, environment, moons, lore and story.
- News ticker from the "colony chronicler."
- Galactic events (wars, booms, recessions, discoveries, rituals) about once a week, each shifting demand for 1–3 days.

Underground hazards (gives lights and supports a purpose)
- Lights prevent miner insanity (miners attacking each other). Supports reduce cave-ins.
- Cave-ins, toxic gas, floods, fire, earthquakes; defense upgrades: ventilation, pumps, firebreaks.
- Miner rescues, narrow escapes and last stands as feed moments.

> **Playtest:** Does someone nuke? Does the Maker conversation feel huge and strange? Does the leaderboard change hands in the last 48 hours?

---

## Phase 2.5: Long shafts you can see (owner request, 2026-11-13)

*Mining should match what's drawn in the rock.*

- Each shaft is a long tunnel the crew digs sideways through the rock; its face advances as ore is mined, and the tunnel gets visibly longer over the month.
- Ore pockets sit at fixed, visible positions in the rock (pre-rolled per site, richer in deeper shafts). The crew mines the endless common ore by default; when the face reaches a pocket, they mine that ore until the pocket is dug out, then return to common.
- A pocket harder than the drill stops the face; the crew keeps mining common ore from the walls (income continues) and the shaft shows "needs drill N".
- Replaces re-drilling: tunnels keep going and find the next pocket. Vein bars become "next pocket in N m" and "pocket remaining" readouts.
- The mine view draws the same pockets the engine uses, so what you see is what you'll mine.

> **Playtest:** Is it satisfying to watch a tunnel break into a rare pocket? Does it pull players to dig deeper and longer?

## Phase 3.5: Monumental shafts and a real planet (owner request, 2026-11-13)

*Buying a shaft should feel like opening a new business; where you dig should matter.*

Mine
- Shafts are AdVenture-Capitalist-style categories: very expensive, each with its **own miners** (no transfers), **gear** (mining speed and the hardest ore it can cut) and **cart** (hauls ore from the face to the shaft entrance). You start with shaft 1.
- Buying a shaft offers exactly 2 **dig directions** with different (fuzzy) ore prospects, so you choose better or worse ore.
- The lift has three upgrades: **speed** (trips per minute), **capacity** (per bucket) and **buckets** (how many run at once).
- No recommended buys anywhere. The bottleneck diagnosis stays as plain information.

Planet layout (full spec; weather, wildlife, tribes and scouting land in Phase 5)
- 12–18 regions, each with one of the planet's 2 common ores (common-ore zones never overlap), soil hardness, topography, weather and temperature.
- Sites are specific spots in a region, not too close together. Each has richness per ore (0–100%) and vein sizes, soil, weather pattern, tribes/wildlife, and distances.
- Distances: on-planet destinations 1–8 units, off-planet 10–60, plus 8 to leave or enter the surface.
- Every player gets an equally good start, about one standard deviation above an average site, with no hostile tribes or boss monsters.
- Rare ores (4) each appear at ~37% of sites independently (0 rares ~16%, 1 ~37%, 2 ~33%, 3 ~13%, 4 ~2%). Mythic (1) at ~5% of sites, only on naturally tough ground, hardness 9–10, needing special equipment.
- Depth bands: shallow (mostly common, safe), middle (rare appears, moderate creatures), deep (more rare, toxic gas), deepest (the only place mythic appears, floods, worst creatures). Vein chance and size grow with depth; no shaft is guaranteed a vein.
- A rare vein lasts ~4 hours to 2 days at a median player's pace; shafts often hit several. Warnings at 20%; below 5% output tapers; a dry vein falls back to common until the next.
- Creature danger roughly doubles every 5 shafts. Soil hardness modifies mining speed.
- Phase 5 adds: five weather types (clear, dust, storm, ash, cold) changing daily per region (production, storms ground ships, lightning); per-region wildlife (1–3 pests, 2–3 standard, 1–2 apex; neighbours share; 1–2 planet-roaming mythic creatures; traits fit terrain); tribes placed where it makes sense, from nomads to empires with villages and HQs; scouting from early reports (ore density without mythic, soil, common ore) to full reports (vein counts and sizes, soil, wildlife, danger, weather, tribe strength and relations).

Look and feel
- More space: separate ore piles per ore, ore visibly travelling on belts and pipes, the shipyard set well away from the piles.
- Tunnels look natural (no grey bands); the ore chunks in the rock are the actual veins.

## Phase 3: Refineries and a real market (Stage 2)

- Refinery license unlocks mid-month. Build on-planet (cheap, close) or off-planet (expensive, big).
- Per-ore buy panel: buy yes/no, markup slider. Yield upgrades. Reserve docks for your own ships.
- About 24 AI-named buyer parties per month across six types (Industrial, Military, Research, Traders, Political, Fringe), each with personality, budget and needs.
- Hidden buyer maximums: you sell only if your ask ≤ their max. True prices stay hidden.
- Full demand model in the engine: nested CES (materials vs. numeraire, across uses, across ores within a use), outside suppliers with rising supply curves, planet market share by tier (common 0.1–2%, rare 5–25%, mythic 30–70%). Events shift budgets, needs and inventories; prices respond on their own.
- Computer-run refineries and stations still guarantee a buyer.
- Charts: income, price history, rank over the month. Ledger of where every coin came from.

> **Playtest:** Do players experiment with price? Does owning a refinery change how they play versus pure mining?

---

## Phase 4: Space stations and player trading (Stage 3)

- Station license late in the month: silos, docks, contract board, advertising, amenities.
- Visiting buyers bring contracts from small orders to big events. Set your asking price; each buyer has a secret maximum. Accept, reject or counteroffer. Auto-accept above a minimum price per unit.
- Forward contracts for ore not yet mined, with heavy default penalties. Default too often and the Guild takes your station.
- Intel levels 0–5 gradually reveal the hidden demand curve; level 5 suggests the optimal price.
- Competing stations: the buyer takes the lowest acceptable ask. Edges are distance, reliability and service.
- Player trading: ship ore to other players' refineries and stations, even while they're offline. An exchange board shows profit per hour for each option. No gifting coin, no alliances.
- Grow vertically (refinery, station) or horizontally (outposts, Phase 5).

> **Playtest:** Do players trade with each other, and does it create rivalry rather than chores?

---

## Phase 5: The planet fights back (exploration, wildlife, tribes)

Exploration and outposts
- Planet map with regions, sites and drones in flight.
- Scout drones take days at first, hours once upgraded. Reports carry confidence levels and fuzzy values that sharpen with upgrades. Build a drone fleet (expensive); drones can be lost.
- Outposts open extra mines at new sites. Abandoning one triggers a missile strike on it.

Wildlife
- Each region has pests, standard creatures and apex predators; 1–2 mythic creatures roam the planet and need full campaigns.
- Combinable traits: Swarm, Nesting, Trapper, Stalker, Burrower, Flyer, Toxic, Ambusher, Scavenger, Territorial, Parasite, Migratory.
- Living ecology: populations breed, migrate and can go extinct. Nests spawn until destroyed.
- Wildlife encyclopedia and mythic sighting tracker.

Tribes and diplomacy
- AI-named tribes with real-world scripts and temperaments (aggressive, wary, greedy, proud), from nomadic bands to Aztec-style empires. Tribes have relationships with each other.
- Hostility rises over time and leads to raids.
- Negotiate with offers (tribute, goods, mining rights, hostages) and stances (respect, trade, threat): tribute, ceasefires, mining-rights deals.
- Translation tech with three tracks: Vocabulary, Accuracy, Languages.
- Nature-based tribal tech: burrowing, flying beasts, traps.
- Extermination campaigns; winning gives forced workers.

Surface hazards
- Weather: clear, dust, storm, ash, cold. Storms ground ships. Weather-forecasting sensor.
- Asteroid showers and solar flares with advance warnings; shields.

> **Playtest:** Do threats create interesting decisions, or just tax income?

---

## Phase 6: The Robot General (military)

- Four divisions: Infantry, Specialist (rapid response), Armored (heavy), Air. Military Strategy unlocks the other three in order.
- Each division has two equipment upgrades (Weapons, Armor) and four tech lines (e.g. Specialists: rescue, suits, recon, tools). Weapon tech moves through visual eras, from improvised to exotic sci-fi.
- Recruits arrive by supply shuttle.
- You set broad priorities ("miners first", "infrastructure first"); a robot General at HQ runs the soldiers. Security Planning improves patrol coverage.
- HQ evolves visually from a wheezing family PC to a futuristic command nexus. HQ upgrades: Compute, Sensors, Algorithms, Communications, Logistics, Memory, Resilience, Training.
- Air cover protects stations, refineries and returning ships. Only empty ships heading home can be attacked.
- Pirates as "space tribes" you can bribe or fight.
- Your home mine can never be destroyed; outposts can fall.
- "Ant-farm" view of patrols and alarms inside the mine. AI battle stories for big fights only.

> **Playtest:** Is military a satisfying layer to tune, or busywork? Cut or simplify based on the answer.

---

## Phase 7: Polish and teaching

- Screens settle into: Colony, Fleet, Market, Refinery, Station, Defense, Map, Reports, Evolutions, Records.
- Rules page and glossary tooltips.
- Patch notes shown at login.
- Balance pass on pacing, Spectacle formula and the nuke threshold using real month data, against the targets above (a few check-ins a day, first nuke around day 3–4).
