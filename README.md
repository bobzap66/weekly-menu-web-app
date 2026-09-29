# Weekly Menu

A static GitHub Pages dinner planner with a small Firebase-backed editable meal catalog.

## Version 0.7.1 behavior

- Keeps the weekly planner itself on GitHub Pages; there is no custom application server.
- Loads categories and meals from Cloud Firestore when the remote catalog is available.
- Falls back to the bundled `src/data.js` catalog if Firestore is empty or unavailable.
- Adds an authenticated **Manage Meals** page for adding, editing, disabling, and deleting meals.
- Stores optional `recipeUrl` and short `description` fields with each meal.
- Displays a meal's description in the planner whenever one exists.
- Stores meal weight, category, Quick, Big Meal / Guests, and Active settings in Firestore.
- Provides a one-click first-run migration that seeds the current bundled catalog into Firestore.
- Uses Firebase Authentication for editor sign-in.
- Uses a Firestore UID allowlist for write access rather than trusting every authenticated Firebase user.
- Continues storing the current weekly plan and recency history in browser `localStorage`.

Each day now has a base plan of **Dinner**, **Leftovers**, **Eating Out**, or **No Meal Planned**. Dinner days can independently check **Quick** and **Big Meal / Guests**, so one day can require either tag, both tags, or neither. A day with both boxes checked must receive a meal tagged both Quick and Big Meal.

## Firebase architecture

The public site remains a static GitHub Pages application. Browser-side Firebase modules connect directly to Firebase Authentication and Cloud Firestore.

Firestore uses two collections:

- `categories` — category name, weight, order, and the two direct-result placeholder categories.
- `meals` — category ID, name, weight, `quick`, `bigMeal`, `active`, optional `recipeUrl`, optional `description`, order, and any existing modifiers.

Reads are public so the normal planner does not require a login. Writes are restricted to explicitly allowed Firebase Authentication UIDs.

## Firebase setup

1. Enable Email/Password Authentication and manually create approved users in Firebase Authentication.
2. Add `bobzap66.github.io` to Firebase Authentication's authorized domains if it is not already present.
3. Create the Firestore database in Production mode.
4. Publish the repository's `firestore.rules` contents in Firebase Console → Firestore Database → Rules.
5. Open `/manage.html`, sign in, and use **Seed current meal catalog** only if the database has not already been seeded.

After the seed finishes, the regular planner loads its meal catalog from Firestore. Future meal edits take effect without changing the repository.

To approve another editor later, manually create that user in Firebase Authentication and add their UID to the array in the Firestore rules.

## Security rules

The repository includes `firestore.rules`. The intended access model is:

- Anyone may read `categories` and `meals`.
- Only UIDs explicitly listed in `isEditor()` may create, update, or delete them.
- All other Firestore paths are denied.

The Firebase browser configuration is intentionally present in client-side code. Firebase web configuration values are identifiers, not database passwords; access control comes from Authentication and Firestore Security Rules.

## Weekly planning

The planner always covers Monday through Sunday. Non-dinner days reduce the number of generated dinners. Dinner days may have no tag requirement, Quick only, Big Meal / Guests only, or both.

The generator reserves enough qualifying candidates to make the planned week possible. A combined Quick + Big day can be satisfied by one meal carrying both tags, while separate Quick and Big days still require separate dinner assignments.

Carryovers remain automatic candidates unless explicitly removed, and their Quick/Big tags, descriptions, and recipe links travel with them.

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
