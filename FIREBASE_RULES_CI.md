# Automatic Firestore Rules Deployment

The repository deploys `firestore.rules` automatically from GitHub Actions whenever that file, `firebase.json`, or the deployment workflow changes on `main`.

The workflow uses GitHub OIDC + Google Cloud Workload Identity Federation. It does **not** require a long-lived service-account JSON key.

## One-time Google Cloud setup

Open Google Cloud Shell while signed into the Google account that owns the Firebase project, then run:

```sh
curl -fsSL https://raw.githubusercontent.com/bobzap66/weekly-menu-web-app/main/scripts/setup-firestore-rules-wif.sh | bash
```

The setup script is idempotent and can be rerun. It:

- selects the `weekly-menu-ec4f6` project;
- enables the IAM Credentials and Security Token Service APIs used by Workload Identity Federation;
- creates or reuses the `github-firestore-rules` service account;
- grants `roles/firebaserules.admin` so that account can create and release Firebase Security Rules;
- grants the read-only `roles/serviceusage.serviceUsageViewer` role because Firebase CLI checks whether required APIs such as Firestore are enabled before deployment;
- creates or reuses the `github-actions` Workload Identity Pool and `weekly-menu-web-app` OIDC provider;
- restricts the provider to the exact repository `bobzap66/weekly-menu-web-app`;
- grants that repository identity permission to impersonate the deployment service account;
- waits and retries when newly created IAM resources are still propagating.

At the end it prints two identifiers:

```text
GCP_WIF_PROVIDER=projects/.../locations/global/workloadIdentityPools/.../providers/...
GCP_FIREBASE_RULES_SERVICE_ACCOUNT=github-firestore-rules@weekly-menu-ec4f6.iam.gserviceaccount.com
```

These are identifiers, not private keys.

## GitHub repository variables

In GitHub, open:

**Settings → Secrets and variables → Actions → Variables**

Create these repository variables using the values printed by the setup script:

- `GCP_WIF_PROVIDER`
- `GCP_FIREBASE_RULES_SERVICE_ACCOUNT`

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

Treat the repository's `firestore.rules` as the source of truth. A later GitHub deployment will overwrite rule edits made only in the Firebase Console.
