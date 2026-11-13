# Mineshaft Capital development

- The game is `game/`: a faithful copy of the Mineshaft Capital artifact, hosted on Railway with Postgres and server-side AI keys. See `game/README.md`.
- Get the copy playable and multiplayer first; expand the game only after that. Keep changes small and playable.
- `game/public/index.html` is the artifact's game. Change it surgically; `game/public/net.js` adapts it to the server.
- AI keys stay on the server. The owner picks the model; keep daily AI limits in place.
- Run `npm test` and check the real browser loop with two players before calling a change done.
- The earlier Extraction Tycoon attempt is archived on the `archive/legacy-tycoon` branch. It does not bind this game unless the owner brings something back.
- Every change bumps the version and adds a line to `notes.md`: `npm run bump -- minor|big|major "what changed"` (minor +0.0.01, big +0.1, major +1 when the game is ready or for a huge update). The game shows the version under its logo.
- Push feature branches; the owner decides what merges to `main`.
