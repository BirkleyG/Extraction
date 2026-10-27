# Deploy the one online game

Firebase/Cloud Run project: `extraction-tycoon`, region `us-east1`. Existing policy: private friends test, up to ten players, $2/month hosting budget alert. The root URL is **https://birkleyg.github.io/Extraction/**. Old game paths are redirects, not alternatives.

## One-time keyless deployment setup

The existing service/secrets are already provisioned. GitHub Actions needs permission to redeploy it. Run in Google Cloud Shell with the intended project selected:

```sh
curl -fsSL https://raw.githubusercontent.com/BirkleyG/Extraction/main/backend/setup-github-deploy.sh -o /tmp/extraction-deploy-setup.sh
bash /tmp/extraction-deploy-setup.sh
```

The script creates a deployer identity restricted to this repository's `main` branch and prints two non-key configuration values. Add them under **repository Settings → Secrets and variables → Actions → Variables**:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

Never paste cloud private keys or AI keys into the repository or chat. Rerun the failed **Deploy backend** workflow after adding the variables. A backend push to `main` normally deploys automatically after unit and real emulator tests. The workflow preserves existing environment/secrets and min/max instances and sets a 120-second request timeout for bounded recovery.

## Root cutover

Deploy the shared-engine canonical endpoint before publishing the root client. The existing service URL remains in `online/config.js`; test `GET /v1/worlds/main/game` without a token returns 401, then verify sign-in/invite/game commands using the authenticated emulator/browser acceptance path. The canonical data namespace preserves older A2 records and device saves; those wallets are not imported. Publish root only when the backend is reachable. No local-only fallback is permitted.

Google and email/password sign-in and `birkleyg.github.io` must remain authorized in Firebase. Membership/invite handling remains server-verified. Firestore denies direct client access. Month closure archives, finalizes paid deliveries, burns old coin/escrow and starts the new month using server UTC.

## Existing resources and costs

The original `backend/deploy.sh` remains a bootstrap/recovery tool for the already chosen project; it is not needed on every release. It can enable APIs/create secrets and should not be used casually to change an existing deployment. Budget alerts do not hard-cap spend. Preserve min instances 0/max 2, 30-second visible-tab reconciliation, one hourly scheduler job, bounded checkpoints and ledger batch writes; measure actual usage before broader launch. No paid AI is invoked automatically.

For historical host/admin identity and earlier deployment decisions, use git history and Questions for the Boss; do not infer administrator rights from URL parameters.
