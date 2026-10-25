# Mineshaft Capital

> **Extraction Tycoon development:** this guide describes the legacy browser prototype. It does not deploy the v1.2 trusted simulation or satisfy competitive multiplayer acceptance. See the [current rulebook](docs/rulebook/Extraction-Rulebook-v1.2.md), [Buildout Plan](docs/development/Buildout-Plan.md), and [Questions for the Boss](docs/development/Questions-for-the-Boss.md).

A darkly funny, pixel-art mining empire you play with your friends. Everyone colonises the same procedurally generated planet,
digs shafts, hires crews, ships ore, trades, fights monsters, talks to alien tribes, and races for the most coin before the
month ends. The month's winner dreams up next month's planet.

**Play it:** open `index.html` for single-player, or follow [SETUP.md](SETUP.md) to host it for you and your friends (about 10 minutes, free).

## Features

- Zoomable pixel-art cutaway of your mine and a top-down planet map with regions, herds, weather and tribes
- Crews, refineries, cargo ships, a species skill tree with six archetypes
- Real-time shared world: leaderboard, event feed, watch other players' colonies
- Monthly seasons; the winner prompts the next planet
- **Optional AI, bring your own key** (Claude or OpenAI): tribe diplomacy, species design, planet generation. Keys never leave your browser.

## Project layout

```
index.html          page shell
css/style.css       all styling
js/game.js          the game (state, simulation, rendering, UI, AI layer)
js/backend.js       multiplayer adapter (Firebase Firestore + anonymous auth) with the interface the game expects
js/config.js        your Firebase web config (empty = single-player)
firestore.rules     database security rules (paste into the Firebase console)
firebase.json       local emulator config for development
SETUP.md            hosting + Firebase + BYOK guide
```

There is no build step and no dependencies to install. Firebase's SDK is loaded from Google's CDN only when `js/config.js` is filled in.

## Credits

Originally built as a Claude artifact; moved to a standalone GitHub Pages site.

## Authoritative backend development

The first A1 accounting foundation is developed separately from the browser prototype. See [backend/README.md](backend/README.md) for local setup and tests. It is not yet a deployed server or connected to gameplay.
