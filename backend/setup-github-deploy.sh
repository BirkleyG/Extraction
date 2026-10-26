#!/usr/bin/env bash
# One-time: let GitHub Actions deploy the backend without a stored key (Workload Identity Federation).
# Run in Google Cloud Shell with the extraction-tycoon project selected. Safe to re-run.
set -euo pipefail
step() { echo; echo "==> $*"; }

PROJECT="${PROJECT:-extraction-tycoon}"
REPO="${REPO:-BirkleyG/Extraction}"
POOL=github
PROVIDER=github-actions
DEPLOY_SA_NAME=github-deployer
DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
RUNTIME_SA="extraction-game-sa@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT" >/dev/null
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"

step "1/4 APIs"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

step "2/4 Deployer service account (can ship code, cannot read data or secrets)"
gcloud iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$DEPLOY_SA_NAME" --display-name="GitHub Actions deployer"
for role in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/storage.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${DEPLOY_SA}" --role="$role" --condition=None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member="serviceAccount:${DEPLOY_SA}" --role=roles/iam.serviceAccountUser >/dev/null
# Cloud Build source deploys run as the default compute service account.
COMPUTE_SA="${NUMBER}-compute@developer.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" --member="serviceAccount:${DEPLOY_SA}" --role=roles/iam.serviceAccountUser >/dev/null

step "3/4 Workload identity pool restricted to ${REPO}"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${REPO}' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" >/dev/null

step "4/4 Done. Add these two GitHub repository VARIABLES (Settings > Secrets and variables > Actions > Variables):"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "GCP_DEPLOY_SERVICE_ACCOUNT     = ${DEPLOY_SA}"
