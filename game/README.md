# Mineshaft Capital on Railway

A faithful copy of the **Mineshaft Capital** Claude artifact, hosted on Railway with Postgres and server-side AI keys (Claude and ChatGPT).

- `public/index.html` is the artifact's game, nearly unchanged. It still simulates each player's colony in the browser.
- `public/net.js` provides the same small API the artifact runtime did (shared documents, live updates, player identity, AI calls), backed by this server.
- `server.js` serves the game, stores everything in Postgres, pushes live updates over WebSocket and enforces who can write what.
- `ai.js` calls Claude (`ANTHROPIC_API_KEY`) or ChatGPT (`OPENAI_API_KEY`). Players never see the keys.

## How multiplayer works

Everyone who opens the link joins the same planet. Each player's colony is saved to the server about every 20 seconds, and every other player sees it live (leaderboard, feed, "Watch" a colony). At the end of each calendar month, the richest colony wins and writes the prompt for next month's planet, which the AI builds.

**AI model:** the owner picks it in the game's Settings → Server model. The list comes live from each provider you've added a key for, and the choice applies to everyone. Daily limits cap how many AI calls the server makes.

Sign-in is a name plus the invite code. Settings in the game shows a **device code** for signing in on a second device with the same name.

Players can only write their own colony. The shared world and feed are coordinated by the game itself, as they were in the artifact. Colonies are still simulated in each browser, so a determined player could cheat. That's fine for friends and can be made server-authoritative later.

## Deploy on Railway

1. In Railway: **New Project → Deploy from GitHub repo →** choose this repository. `railway.json` in the repo root configures the build, start command and health check.
2. In the same project: **+ New → Database → PostgreSQL**.
3. Open the game service → **Variables** and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the Postgres service) |
   | `ANTHROPIC_API_KEY` | your Claude API key (optional if you only use ChatGPT) |
   | `OPENAI_API_KEY` | your OpenAI API key (optional if you only use Claude) |
   | `GAME_CODE` | invite code friends type to join (leave unset for an open game) |
   | `ADMIN_CODE` | your private code; joining with it makes you the owner (owner tools in Settings) |
   | `AI_MODEL` | optional starting model before you pick one in Settings, default `claude-opus-5-5` |
   | `AI_DAILY_LIMIT` | optional, AI calls per day for the whole server, default 300 |
   | `AI_PLAYER_DAILY_LIMIT` | optional, AI calls per player per day, default 60 |

4. Game service → **Settings → Networking → Generate Domain**. That URL is the game.
5. Recommended: set a usage limit under Railway's billing settings and monthly spend limits on your Anthropic and OpenAI accounts.
6. Open the game, join with your `ADMIN_CODE` as the invite code, then pick the AI model in Settings.

The server creates its database tables on first start.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000. Without `DATABASE_URL` the server keeps everything in memory (lost on restart). Without an AI key the game uses its built-in planets and species instead.

## Tests

```bash
npm test
```

Set `TEST_DATABASE_URL` to an empty Postgres database to run the same tests against Postgres. The tests drop and recreate the tables, so never point it at the live database.
