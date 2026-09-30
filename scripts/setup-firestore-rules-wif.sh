#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="weekly-menu-ec4f6"
REPO="bobzap66/weekly-menu-web-app"
POOL_ID="github-actions"
PROVIDER_ID="weekly-menu-web-app"
SERVICE_ACCOUNT_NAME="github-firestore-rules"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

printf 'Configuring keyless GitHub Actions access for %s...\n' "${PROJECT_ID}"

gcloud config set project "${PROJECT_ID}" >/dev/null

gcloud services enable iamcredentials.googleapis.com \
  --project="${PROJECT_ID}" >/dev/null

if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --project="${PROJECT_ID}" \
    --display-name="GitHub Firestore Rules Deployer"
fi

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/firebaserules.admin" \
  --quiet >/dev/null

if ! gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --display-name="GitHub Actions"
fi

WORKLOAD_IDENTITY_POOL_ID="$(
  gcloud iam workload-identity-pools describe "${POOL_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --format="value(name)"
)"

if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="Weekly Menu GitHub Actions" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository == '${REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
fi

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${REPO}" \
  --quiet >/dev/null

WORKLOAD_IDENTITY_PROVIDER="$(
  gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --format="value(name)"
)"

cat <<EOF

Google Cloud setup is complete.

Create these GitHub repository variables under:
Settings -> Secrets and variables -> Actions -> Variables

GCP_WIF_PROVIDER=${WORKLOAD_IDENTITY_PROVIDER}
GCP_FIREBASE_RULES_SERVICE_ACCOUNT=${SERVICE_ACCOUNT_EMAIL}

Then run the "Deploy Firestore Rules" workflow once from the GitHub Actions tab.
EOF
