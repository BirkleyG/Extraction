# Mineshaft Capital development

- The game is `game/`, hosted on Railway with Postgres and server-side AI keys. See `game/README.md`, `game/DESIGN.md` (architecture contract) and `ROADMAP.md` (phases).
- Priority is FUN. Keep changes small and playable; playtest each phase before merging.
- The server is authoritative: the shared rate engine (`game/shared/engine`) runs on the server and predicts in the browser. Clients send commands; they never set coin, ore or time.
- `game/public/index.html` + `game/public/app/` is the v2 client. The original artifact port lives at `game/public/classic/` and stays playable.
- AI keys stay on the server. The owner picks the model; keep daily AI limits in place.
- Run `npm test` and check the real browser loop with two players before calling a change done.
- `ROADMAP.md` sets the build order. Finish and playtest a phase before starting the next.
- The earlier Extraction Tycoon attempt is archived on the `archive/legacy-tycoon` branch. It does not bind this game unless the owner brings something back.
- Every change bumps the version and adds a line to `notes.md`: `npm run bump -- minor|big|major "what changed"` (minor +0.0.01, big +0.1, major +1 when the game is ready or for a huge update). The game shows the version under its logo.
- Push feature branches; the owner decides what merges to `main`.
