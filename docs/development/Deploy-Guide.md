# Deploying the Extraction online server (Firebase project `extraction-tycoon`)

Prerequisites already done: project created, Blaze + $2 budget alert, Google and Email/Password sign-in enabled, Firestore (us-east1, production mode) with `backend/firestore.rules` published, web app registered, `birkleyg.github.io` authorized.

1. Open https://shell.cloud.google.com with the `extraction-tycoon` project selected.
2. `git clone https://github.com/BirkleyG/Extraction.git && cd Extraction && git checkout claude/trusting-hopper-b4kqj9 && cd backend` (use `main` once merged).
3. `./deploy.sh` — it enables APIs, creates a least-privilege service account, creates three secrets (world seed and internal token are random; it asks you for the **invite code** to hand to friends), deploys to Cloud Run (`us-east1`, min 0 / max 2 instances), and creates an hourly Cloud Scheduler job.
4. Copy the printed service URL into `online/config.js` (`API_BASE`) and commit; Pages serves `/online/` from `main`.
5. Open `https://birkleyg.github.io/Extraction/online/`, sign in, enter the invite code, and play. The first join creates the world `main` and the month's planet.
6. After a day, check cost: Billing → Reports, Firestore → Usage, Cloud Run → Metrics.

Cost guards: min instances 0, max instances 2, 10-member cap, state polls every 20 s only while the tab is visible. Budget alerts do not stop spending; if reads climb, raise the poll interval in `online/app.js`.

## Playing online
The good-graphics game at `/play/` has an **online mode**: press **Play online ↗** in the header (or open `/play/?mode=online`). The offline sandbox stays the default; the choice is remembered in the browser, and the header button switches back. `/online/` just redirects to `/play/?mode=online`.

Host UID (recorded for future admin-only actions; none exist yet): `Dx84cY8Kz5hFImL0thIhbMc544C2`.

## Automatic redeploys
`.github/workflows/deploy-backend.yml` redeploys Cloud Run on every push to `main` that touches `backend/**` (or run it by hand from the Actions tab). It runs `npm test` first, deploys with `gcloud run deploy --source .` (env vars, secrets and the scheduler job persist from the first `deploy.sh`), then checks the service answers 401.

One-time setup, in Cloud Shell: `cd backend && ./setup-github-deploy.sh`. It creates a deployer service account and a workload-identity pool limited to `BirkleyG/Extraction` on `main` (no key files), then prints two values to save as GitHub repository **variables**: `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT`.

Caveat: owner schema v2 (A2) needs a fresh world or a month boundary; deploying it over a world with v1 owners is not migrated.
