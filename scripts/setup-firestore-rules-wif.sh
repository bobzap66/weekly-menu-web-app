#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="weekly-menu-ec4f6"
REPO="bobzap66/weekly-menu-web-app"
POOL_ID="github-actions"
PROVIDER_ID="weekly-menu-web-app"
SERVICE_ACCOUNT_NAME="github-firestore-rules"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
RETRY_ATTEMPTS=18
RETRY_DELAY_SECONDS=5

printf 'Configuring keyless GitHub Actions access for %s...\n' "${PROJECT_ID}"

gcloud config set project "${PROJECT_ID}" >/dev/null

gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
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

# Firebase CLI checks whether required APIs are enabled before deploying rules.
# This read-only role allows that service-state check without allowing API changes.
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/serviceusage.serviceUsageViewer" \
  --quiet >/dev/null

get_pool_name() {
  gcloud iam workload-identity-pools describe "${POOL_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --format="value(name)" 2>/dev/null || true
}

WORKLOAD_IDENTITY_POOL_ID="$(get_pool_name)"
if [[ -z "${WORKLOAD_IDENTITY_POOL_ID}" ]]; then
  # Newly-created Workload Identity resources can take several seconds to become
  # readable through the API. Do not treat that propagation delay as failure.
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --display-name="GitHub Actions" || true

  for attempt in $(seq 1 "${RETRY_ATTEMPTS}"); do
    WORKLOAD_IDENTITY_POOL_ID="$(get_pool_name)"
    if [[ -n "${WORKLOAD_IDENTITY_POOL_ID}" ]]; then
      break
    fi
    printf 'Waiting for Workload Identity Pool to propagate (%s/%s)...\n' \
      "${attempt}" "${RETRY_ATTEMPTS}" >&2
    sleep "${RETRY_DELAY_SECONDS}"
  done
fi

if [[ -z "${WORKLOAD_IDENTITY_POOL_ID}" ]]; then
  echo "The Workload Identity Pool still is not readable after waiting. Re-run this script in a minute." >&2
  exit 1
fi

provider_exists() {
  gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1
}

if ! provider_exists; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="Weekly Menu GitHub Actions" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository == '${REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com" || true

  for attempt in $(seq 1 "${RETRY_ATTEMPTS}"); do
    if provider_exists; then
      break
    fi
    printf 'Waiting for Workload Identity Provider to propagate (%s/%s)...\n' \
      "${attempt}" "${RETRY_ATTEMPTS}" >&2
    sleep "${RETRY_DELAY_SECONDS}"
  done
fi

if ! provider_exists; then
  echo "The Workload Identity Provider still is not readable after waiting. Re-run this script in a minute." >&2
  exit 1
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
