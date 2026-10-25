# Extraction Tycoon

**[Play the development sandbox](https://birkleyg.github.io/Extraction/play/)** · [Original prototype](https://birkleyg.github.io/Extraction/prototype/)

Mine ore, hire crews, open shafts, upgrade the lift, and ship to test buyers. Sales pay at departure. The animated mine runs immediately; no Firebase project, account or API key is needed to try it.

The current Pages build is a **single-player development sandbox with browser-local saves**. It uses the new production flow model and provisional C-01 lift curve. It is not the authoritative multiplayer release. The original prototype and its separate browser saves remain available at `/prototype/`.

The scene reuses the original game's pixel sprites and look. Each planet is built around one central theme (for example a candy world, a haunted bone-yard, a dead neon city) and picks its own sky, moons, rock layers, ore names/colours and a ring of 5-7 regions. There are 39 region landscapes: 27 earthlike (mesa, dunes, glacier, volcanic, swamp, canyon, salt flats, temperate forest, jungle, savanna, tundra, taiga, prairie, alpine peaks, island chain, sea cliffs, lake country, hoodoo badlands, moor, autumn woodland, scrubland, red-rock arches, waterfall cliffs, geyser basin, palm oasis, rice terraces, redwoods) and 12 alien or sci-fi (crystal spires, fungal forest, floating islands, bone forest, neon ruins, tendril jungle, mirror desert, hive towers, black monoliths, reality rifts, scrap titans, watcher fields).

AI is the default way to make a planet: under **Tools** add your own Claude or OpenAI key, then **Planet → Ask the Maker**. The prompt makes the AI choose a theme first and read a summary of earlier planets (kept in this browser) so each one is new. With no key the Maker improvises from one of twelve built-in themes instead, avoiding recently used ones. Planets are presentation only in this sandbox; they do not change rates, prices or the ledger.

Controls: mouse wheel or pinch to zoom, drag to pan, `+` `-` `0` keys or the corner buttons to zoom and fit, and the top-left thumbnail (or `M`) flips between your mine and the whole-planet map, where you can click a region and move your mine there. Upgrades are named machines (Hand Winch → Rope Hoist → Steam Lift ...) that change how the lift, pick, yard and hauler look as you tier up.

Mining follows the rulebook (section 04): each region's site has one endless common ore, and shafts hide finite rare veins (and, in tough regions, a mythic one). Tunnels are dug out as the crew mines, veins sit in the rock ahead, and a vein only yields once the tunnel reaches it *and* the pick is hard enough. Opening a mine in a different region, or building a new planet, starts a fresh mine because ore and veins belong to the site.

Open **Local developer tools** to fast-forward, add explicit test coins or reset only the sandbox save. Prices, buyer budgets, starting coin and incomplete upgrade lines in this build are test fixtures, not certified game balance. No month competition is active.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000
```

Visit http://localhost:8000/play/ for the sandbox or http://localhost:8000/prototype/ for the original prototype. Serve the repository root so the shared production ES module can load.

## Development and tests

Node 24.19.0 is pinned in `.nvmrc`.

```sh
npm --prefix play test
npm --prefix backend ci
npm --prefix backend test
npm --prefix backend run test:integration
```

The Firebase emulator tests additionally require Java 21. See [backend setup](backend/README.md) for the authenticated local API/demo and [SETUP.md](SETUP.md) for the original prototype's Firebase guide. Production Firebase deployment and its spending ceiling remain separate decisions.

## Specification and progress

- [Maintained rulebook](docs/rulebook/Extraction-Rulebook-v1.2.md)
- [Buildout plan](docs/development/Buildout-Plan.md)
- [Questions for the Boss](docs/development/Questions-for-the-Boss.md)
- [Production calibration evidence](docs/development/calibration/Production-Calibration.md)

GitHub Pages publishes `main`, root directory. Publishing changes must reach `main`; merging into a development/specification branch alone does not update the playable site. Future playable changes should target that published integration branch and pass the model/backend checks before deployment.
