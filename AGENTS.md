# Mineshaft Capital development

- The game is `game/`, hosted on Railway with Postgres and server-side AI keys. See `game/README.md`, `game/DESIGN.md` (architecture contract, guild game first) and `ROADMAP.md` (phases).
- Priority is FUN. Keep changes small and playable; playtest each phase before merging.
- The server is authoritative: the guild engine (`game/shared/guild`) runs on the server; the browser counts forward from the server's rates so hidden information stays hidden. Clients send commands; they never set coin, ore or time.
- `game/public/index.html` + `game/public/guild/` is the guild game (the main game). The v2 mineshaft game lives at `game/public/mines/` (it uses `game/public/app/`), and the original artifact port at `game/public/classic/`; both stay playable.
- AI keys stay on the server. The owner picks the model; keep daily AI limits in place.
- Run `npm test` and check the real browser loop with two players before calling a change done.
- `ROADMAP.md` sets the build order. Finish and playtest a phase before starting the next.
- The earlier Extraction Tycoon attempt is archived on the `archive/legacy-tycoon` branch. It does not bind this game unless the owner brings something back.
- Every change bumps the version and adds a line to `notes.md`: `npm run bump -- minor|big|major "what changed"` (minor +0.0.01, big +0.1, major +1 when the game is ready or for a huge update). The game shows the version under its logo.
- Coding and playtest agents use Sonnet 5.5 (owner decision, 2026-11-13). Run one at a time, or two with separate files, to stay under the usage limit.
- Push feature branches; the owner decides what merges to `main`.
