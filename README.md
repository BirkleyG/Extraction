# Mineshaft Capital

A multiplayer pixel-art alien mining game: dig, haul, ship, evolve your species, and be the richest colony when the month ends. The winner describes next month's planet and the AI builds it.

The game lives in [`game/`](game/README.md) and runs on Railway with Postgres. Claude or ChatGPT (picked by the owner in Settings) writes species, tribe conversations and new planets.

```bash
npm install
npm start      # http://localhost:3000
npm test
```

See [game/README.md](game/README.md) for how it works and how to deploy it.

The earlier Extraction Tycoon attempt (rulebook, sandbox, Firebase/Cloud Run backend) is preserved on the [`archive/legacy-tycoon`](https://github.com/BirkleyG/Extraction/tree/archive/legacy-tycoon) branch.
