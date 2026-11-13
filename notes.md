# Mineshaft Capital notes

Current version: **0.0.01** (shown in the game under the logo, top left)

## How versions work

- **+0.0.01** for a minor change: a fix, a tweak, a small addition. `npm run bump -- minor "what changed"`
- **+0.1** for a bigger change: a new feature or system. Resets the last part. `npm run bump -- big "what changed"`
- **+1** when the game is ready, or for a huge update. Resets the rest. `npm run bump -- major "what changed"`

The bump command updates `game/version.json` (what the game displays) and adds an entry below. Every change that lands should come with a bump.

## Changelog

### 0.0.01 (2026-11-13)
- Versioning added: the game shows its version under the logo, and this file tracks every change.
