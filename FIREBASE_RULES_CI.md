# Automatic Firestore Rules Deployment

The repository is configured to deploy `firestore.rules` automatically from GitHub Actions whenever that file, `firebase.json`, or the deployment workflow changes on `main`.

The workflow uses GitHub OIDC + Google Cloud Workload Identity Federation. It does **not** require a long-lived service-account JSON key.

## One-time Google Cloud setup

Run these commands in Google Cloud Shell while signed into the Google account that owns the Firebase project.

```sh
export PROJECT_ID="weekly-menu-ec4f6"
export REPO="bobzap66/weekly-menu-web-app"
export POOL_ID="github-actions"
export PROVIDER_ID="weekly-menu-web-app"
export SERVICE_ACCOUNT_NAME="github-firestore-rules"
export SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Workload Identity Federation through a service account needs this API.
gcloud services enable iamcredentials.googleapis.com \
  --project="${PROJECT_ID}"

# Create the narrowly scoped deployment service account.
gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="GitHub Firestore Rules Deployer"

# Allow this service account to create and release Firebase Security Rules only.
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/firebaserules.admin"

# Create a Workload Identity pool for GitHub Actions.
gcloud iam workload-identity-pools create "${POOL_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions"

export WORKLOAD_IDENTITY_POOL_ID="$(
  gcloud iam workload-identity-pools describe "${POOL_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --format="value(name)"
)"

# Trust GitHub's OIDC issuer, but only tokens from this exact repository.
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" \
  --display-name="Weekly Menu GitHub Actions" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository == '${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Allow only this repository identity to impersonate the deployment service account.
gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${REPO}"

export WORKLOAD_IDENTITY_PROVIDER="$(
  gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --format="value(name)"
)"

printf '\nGCP_WIF_PROVIDER=%s\n' "${WORKLOAD_IDENTITY_PROVIDER}"
printf 'GCP_FIREBASE_RULES_SERVICE_ACCOUNT=%s\n' "${SERVICE_ACCOUNT_EMAIL}"
```

Google IAM changes can take a few minutes to propagate.

## Add two GitHub repository variables

In GitHub, open:

**Settings → Secrets and variables → Actions → Variables**

Create these repository variables using the two values printed by the setup commands:

- `GCP_WIF_PROVIDER`
- `GCP_FIREBASE_RULES_SERVICE_ACCOUNT`

These are identifiers, not private keys.

## First deployment

After the variables exist, open **Actions → Deploy Firestore Rules → Run workflow** and run it once manually.

After that, pushes to `main` that change any of these files deploy automatically:

- `firestore.rules`
- `firebase.json`
- `.github/workflows/deploy-firestore-rules.yml`

The workflow runs:

```sh
firebase deploy --only firestore:rules --project weekly-menu-ec4f6 --non-interactive
```

## Source of truth

Once this is enabled, treat the repository's `firestore.rules` as the source of truth. A later GitHub deployment will overwrite rule edits made only in the Firebase Console.
