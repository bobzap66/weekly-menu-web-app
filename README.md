# Weekly Menu

A static GitHub Pages dinner planner with a small Firebase-backed editable meal catalog.

## Version 0.7 behavior

- Keeps the weekly planner itself on GitHub Pages; there is no custom application server.
- Loads categories and meals from Cloud Firestore when the remote catalog is available.
- Falls back to the bundled `src/data.js` catalog if Firestore is empty or unavailable.
- Adds an authenticated **Manage Meals** page for adding, editing, disabling, and deleting meals.
- Stores optional `recipeUrl` and short `description` fields with each meal.
- Stores meal weight, category, Quick, Big Meal / Guests, and Active settings in Firestore.
- Provides a one-click first-run migration that seeds the current bundled catalog into Firestore.
- Uses Firebase Authentication for editor sign-in.
- Uses a Firestore UID allowlist for write access rather than trusting every authenticated Firebase user.
- Continues storing the current weekly plan and recency history in browser `localStorage`.

The existing planner still supports **Normal Dinner**, **Quick Meal**, **Big Meal / Guests**, **Leftovers**, **Eating Out**, and **No Meal Planned** days. Quick and Guests days are real scheduling requirements, and the generator reserves distinct qualifying meals for them.

## Firebase architecture

The public site remains a static GitHub Pages application. Browser-side Firebase modules connect directly to Firebase Authentication and Cloud Firestore.

Firestore uses two collections:

- `categories` — category name, weight, order, and the two direct-result placeholder categories.
- `meals` — category ID, name, weight, `quick`, `bigMeal`, `active`, optional `recipeUrl`, optional `description`, order, and any existing modifiers.

Reads are public so the normal planner does not require a login. Writes are restricted to explicitly allowed Firebase Authentication UIDs.

## First-time Firebase setup

1. Enable Email/Password Authentication and manually create an approved user in Firebase Authentication.
2. Add `bobzap66.github.io` to Firebase Authentication's authorized domains if it is not already present.
3. Create the Firestore database in Production mode.
4. Open `/manage.html` on the deployed site and sign in.
5. Copy the UID displayed on the page.
6. In Firebase Console → Firestore Database → Rules, copy the contents of `firestore.rules`, replace `REPLACE_WITH_YOUR_FIREBASE_UID` with that UID, and publish the rules.
7. Refresh `/manage.html`, sign in if necessary, and click **Seed current meal catalog**.

After the seed finishes, the regular planner will load its meal catalog from Firestore. Future meal edits take effect without changing the repository.

To approve another editor later, manually create that user in Firebase Authentication and add their UID to the array in the Firestore rules.

## Security rules

The repository includes `firestore.rules`. The intended access model is:

- Anyone may read `categories` and `meals`.
- Only UIDs explicitly listed in `isEditor()` may create, update, or delete them.
- All other Firestore paths are denied.

The Firebase browser configuration is intentionally present in client-side code. Firebase web configuration values are identifiers, not database passwords; access control comes from Authentication and Firestore Security Rules.

## Meal history weighting

A meal eaten last week uses 15% of its normal weight. Its weight then recovers to 35%, 55%, 70%, 82%, and 92% over the following five weeks. After six weeks, it returns to its normal weight.

Only the specific meal is penalized. A dinner marked for carryover is not treated as eaten and is inserted directly into the next week's candidates instead.

## Run locally

Serve the directory with any static web server. For example:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

The Firebase integration uses Firebase's browser-module CDN, so local development requires internet access.

## Test

With a current version of Node.js installed:

```sh
npm test
```

No package installation is required for the existing pure-JavaScript unit tests.
