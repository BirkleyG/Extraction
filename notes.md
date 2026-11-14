# Mineshaft Capital notes

Current version: **0.5.01** (shown in the game under the logo, top left)

## How versions work

- **+0.0.01** for a minor change: a fix, a tweak, a small addition. `npm run bump -- minor "what changed"`
- **+0.1** for a bigger change: a new feature or system. Resets the last part. `npm run bump -- big "what changed"`
- **+1** when the game is ready, or for a huge update. Resets the rest. `npm run bump -- major "what changed"`

The bump command updates `game/version.json` (what the game displays) and adds an entry below. Every change that lands should come with a bump.

## Changelog

### 0.5.01 (2026-11-14)
- Retro pass: the classic pixel fonts are now bundled with the game so they always load (no more plain system-font fallback), small text is a touch bigger like the classic, and the planet map has a retro filter: chunky pixels, a small dithered palette, scanlines and pixel-font labels.

### 0.5.00 (2026-11-14)
- Monumental shafts and a painted planet. Each shaft is its own business with its own miners, gear and cart; opening one is a big purchase where you pick between two dig directions. The lift has speed, capacity and bucket upgrades. Ships upgrade per class, carry one ore each (freighters can unlock a second hold) and pick cargo fleet-wide. The planet is a shaded-relief climate map with hidden ore patches; new players land at a fair random spot, and a Map tab shows colonies and ships in flight. Separate ore piles, belts to a distant shipyard, natural tunnels, and no more recommended buys. Colonies restart.

### 0.4.00 (2026-11-13)
- Phase 3: refineries and a hidden market. Build an on-planet or orbital refinery from day 4, set an asking price per ore with a markup slider and watch how 24 AI-named buyer parties respond (each has a secret top price). New Reports tab with income, rank, leaderboard-race and price charts, plus a ledger of every coin in and out. Colonies from v0.3 carry over.

### 0.3.00 (2026-11-13)
- Phase 2.5: long shafts you can see. Each shaft is a tunnel that grows as the crew digs; ore pockets sit visibly in the rock, crews mine common ore until they strike a pocket, and a pocket too hard for your drill stops the face until you upgrade. Re-drilling is gone. Strike alerts (big ones for mythic), rare strikes in the feed, and no more safety tips that save almost nothing.

### 0.2.00 (2026-11-13)
- Phase 2: nuke your colony for Spectacle, argue with the Maker to change the galactic economy for everyone, evolutions bought with SP, mine hazards with a Safety tab, galactic events about once a week, a Galaxy bulletin, the closing bell, and a species builder from parts. The mine view now shows fill gauges, ore riding into the ships, ships in the sky, smooth zoom and pan, and miners that dig. Removed Auto-spend.

### 0.1.02 (2026-11-13)
- Removed Auto-spend: the Foreman suggests the next fix but you make every buy.

### 0.1.01 (2026-11-13)
- Rough spots: Auto-spend button (also on the welcome-back sheet), next-unlock progress bar, later panels spread over your first day, each ship class has its own price ladder so cruisers and freighters get used, exhausted veins fall back to common ore instead of stopping.

### 0.1.00 (2026-11-13)
- Phase 1: the new game. Server-run rate engine, AI-themed planets with regions and themed ores, animated mine with lift, conveyors and three ship classes, unlocking panels, guided first session, while-you-were-away summary, live ranks and Hall of Fame. The original game moved to /classic/.

### 0.0.01 (2026-11-13)
- Versioning added: the game shows its version under the logo, and this file tracks every change.
