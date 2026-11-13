# Mineshaft Capital notes

Current version: **0.2.00** (shown in the game under the logo, top left)

## How versions work

- **+0.0.01** for a minor change: a fix, a tweak, a small addition. `npm run bump -- minor "what changed"`
- **+0.1** for a bigger change: a new feature or system. Resets the last part. `npm run bump -- big "what changed"`
- **+1** when the game is ready, or for a huge update. Resets the rest. `npm run bump -- major "what changed"`

The bump command updates `game/version.json` (what the game displays) and adds an entry below. Every change that lands should come with a bump.

## Changelog

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
