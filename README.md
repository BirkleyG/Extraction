# Extraction Tycoon

**[Play Extraction Tycoon](https://birkleyg.github.io/Extraction/)**

One online game: a pixel mine that grows into refineries, stations and a colony. Hire the machines rather than micromanaging crates: upgrade your Pick, Lift and Hauler; route ore into your refinery; sell refined output or stock your station; complete buyer orders; bring infantry home by supply shuttle. The original pixel presentation remains the visual foundation.

Sign in with Google or email and enter your private invite code. Progress is saved online. The browser predicts smoothly between server updates, normally every 30 seconds; commands reconcile immediately. There is no version or offline-mode selector. Previous entry URLs redirect to the root.

Settings contains motion/sound, optional Claude/OpenAI BYOK, a progress download and recovery download for the previous device save. The Maker creates validated facility names, buyer personalities and dispatches from confirmed events; its built-in chronicler works without a key. It never decides money or outcomes.

## Status

This is a private development game for up to ten friends. Current industry, home safety and market features are playable, but full CES equilibrium, complete combat, global ranking and Release A/B certification remain open. [Single-game rollout and verification](docs/development/One-Game-Rollout.md). Earlier source and save namespaces are preserved for recovery; old balances are not silently imported as trusted money.

## Develop locally

Node 24.19.0 and Java 21 are required for the Firebase emulators.

```sh
npm --prefix backend ci
npm --prefix play test
npm --prefix backend test
npm --prefix backend run test:integration
```

For a playable emulator session, run in one terminal:

```sh
cd backend
FIREBASE_PROJECT_ID=demo-extraction E2E_SECONDS=86400 npx firebase emulators:exec --project demo-extraction --only auth,firestore "node scripts/e2e-online.mjs"
```

Serve the repository root in another terminal:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://localhost:8765/?emulator=1&api=http://127.0.0.1:8788`, create an emulator account and use invite `friends-2026`. This runs the same game against isolated test services. Production pages ignore API/emulator overrides from arbitrary URL parameters.

## Deployment and specification

[Deployment guide](docs/development/Deploy-Guide.md) · [Maintained rulebook](docs/rulebook/Extraction-Rulebook-v1.2.md) · [Questions for the Boss](docs/development/Questions-for-the-Boss.md) · [Build checklist](docs/development/Build-Checklist.md)

GitHub Pages serves the root client from `main`. The keyless backend workflow tests and deploys the existing Cloud Run service. It requires one-time Workload Identity setup and two GitHub Actions variables. Deployment uses the established Firebase project, region and private-player budget; see the guide before changing infrastructure.
