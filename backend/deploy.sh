#!/usr/bin/env bash
# Deploy the Extraction game server to Cloud Run. Run in Google Cloud Shell (https://shell.cloud.google.com)
# from the backend/ directory, with the extraction-tycoon project selected. Safe to re-run.
set -euo pipefail

PROJECT="${PROJECT:-extraction-tycoon}"
REGION="${REGION:-us-east1}"
SERVICE="${SERVICE:-extraction-game}"
SA_NAME="extraction-game-sa"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
ORIGIN="${ALLOW_ORIGIN:-https://birkleyg.github.io}"
WORLD_ID="${WORLD_ID:-main}"

gcloud config set project "$PROJECT" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com

# Least-privilege identity for the server: Firestore data access only.
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SA_NAME" --display-name="Extraction game server"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" --role="roles/datastore.user" --condition=None >/dev/null
# Needed to verify Firebase ID tokens with revocation checks.
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" --role="roles/firebaseauth.viewer" --condition=None >/dev/null

# Secrets: created once, never printed. INVITE_CODE is what you share with friends.
mk_secret() { # name, value-generator
  if ! gcloud secrets describe "$1" >/dev/null 2>&1; then
    printf '%s' "$2" | gcloud secrets create "$1" --data-file=- >/dev/null
    echo "created secret $1"
  fi
  gcloud secrets add-iam-policy-binding "$1" --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor" >/dev/null
}
mk_secret extraction-world-seed "$(openssl rand -hex 32)"
mk_secret extraction-internal-token "$(openssl rand -hex 32)"
if ! gcloud secrets describe extraction-invite-code >/dev/null 2>&1; then
  read -r -p "Choose an invite code for your friends (letters/numbers, 8+ chars): " INVITE
  mk_secret extraction-invite-code "$INVITE"
fi

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --concurrency 40 --cpu 1 --memory 512Mi --timeout 30 \
  --set-env-vars "FIREBASE_PROJECT_ID=${PROJECT},ALLOW_ORIGIN=${ORIGIN},MAX_MEMBERS=10,WORLD_PLAYERS=10" \
  --set-secrets "WORLD_SEED_SECRET=extraction-world-seed:latest,INTERNAL_TOKEN=extraction-internal-token:latest,INVITE_CODE=extraction-invite-code:latest"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
TOKEN="$(gcloud secrets versions access latest --secret=extraction-internal-token)"

# Hourly tick: prepares each new month and closes finished ones (idempotent). One job stays within the free scheduler allowance.
JOB=extraction-tick
ARGS=(--location "$REGION" --schedule "5 * * * *" --time-zone "Etc/UTC" --uri "${URL}/internal/tick" --http-method POST
      --headers "Content-Type=application/json,x-internal-token=${TOKEN}" --message-body "{\"worldId\":\"${WORLD_ID}\"}")
gcloud scheduler jobs describe "$JOB" --location "$REGION" >/dev/null 2>&1 && gcloud scheduler jobs update http "$JOB" "${ARGS[@]}" || gcloud scheduler jobs create http "$JOB" "${ARGS[@]}"

echo
echo "Deployed: ${URL}"
echo "World id: ${WORLD_ID}"
echo "Put this URL in online/config.js as API_BASE."
