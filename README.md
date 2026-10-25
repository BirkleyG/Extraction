# Extraction Tycoon

**[Play the development sandbox](https://birkleyg.github.io/Extraction/play/)** · [Original prototype](https://birkleyg.github.io/Extraction/prototype/)

Mine ore, hire crews, open shafts, upgrade the lift, and ship to test buyers. Sales pay at departure. The animated mine runs immediately; no Firebase project, account or API key is needed to try it.

The current Pages build is a **single-player development sandbox with browser-local saves**. It uses the new production flow model and provisional C-01 lift curve. It is not the authoritative multiplayer release. The original prototype and its separate browser saves remain available at `/prototype/`.

The scene reuses the original game's pixel sprites and look. Each planet (a built-in one, an improvised one, or one dreamed up by your own Claude/OpenAI key under **Tools**) picks its own sky, moons, rock layers, ore names/colours and a ring of regions with distinct topography (mesa, dunes, glacier, volcanic, swamp, crystal, fungal, canyon, salt flats). Planets are presentation only in this sandbox; they do not change rates, prices or the ledger.

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
