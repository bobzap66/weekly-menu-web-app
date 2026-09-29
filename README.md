# Weekly Menu

A static GitHub Pages dinner planner with a small Firebase-backed editable meal catalog.

## Version 0.7.6 behavior

- Keeps the weekly planner itself on GitHub Pages; there is no custom application server.
- Loads categories and meals from Cloud Firestore when the remote catalog is available.
- Falls back to the bundled `src/data.js` catalog if Firestore is unavailable.
- Adds an authenticated **Manage Meals** page for adding, editing, disabling, and deleting meals.
- Lets approved editors create new meal categories directly from the Manage Meals page.
- Stores optional `recipeUrl` and short `description` fields with each meal.
- Displays a meal's description in the planner whenever one exists.
- Stores meal weight, category, Quick, Big Meal / Guests, and Active settings in Firestore.
- Uses Firebase Authentication for editor sign-in.
- Uses a Firestore UID allowlist for write access rather than trusting every authenticated Firebase user.
- Continues storing the current weekly plan and recency history in browser `localStorage`.
- Lets you return from either candidate selection or the finished schedule to **Edit week setup** if a day was planned incorrectly.
- Includes the existing finished-week print workflow for a clean weekly menu printout.

Each day has a base plan of **Dinner**, **Leftovers**, **Eating Out**, or **No Meal Planned**. Dinner days can independently check **Quick** and **Big Meal / Guests**, so one day can require either tag, both tags, or neither. A day with both boxes checked must receive a meal tagged both Quick and Big Meal.

## Firebase architecture

The public site remains a static GitHub Pages application. Browser-side Firebase modules connect directly to Firebase Authentication and Cloud Firestore.

Firestore uses two collections:

- `categories` — category name, weight, order, and the two direct-result placeholder categories.
- `meals` — category ID, name, weight, `quick`, `bigMeal`, `active`, optional `recipeUrl`, optional `description`, order, and any existing modifiers.

Reads are public so the normal planner does not require a login. Writes are restricted to explicitly allowed Firebase Authentication UIDs.

The initial database migration is complete, so the production admin page now contains only ongoing catalog-management tools rather than one-time seeding or bulk-fill utilities.

To approve another editor later, manually create that user in Firebase Authentication and add their UID to the array in the Firestore rules.

## Catalog management

The Manage Meals page supports ongoing catalog maintenance without repository changes. Editors can add or edit meals, change meal weights and tags, add descriptions and recipe links, deactivate meals, delete meals, and create new categories.

New categories are stored in Firestore with their own weight and ordering value. After a category is created it is immediately available in the meal editor's category dropdown.

## Security rules

The repository includes `firestore.rules`. The intended access model is:

- Anyone may read `categories` and `meals`.
- Only UIDs explicitly listed in `isEditor()` may create, update, or delete them.
- All other Firestore paths are denied.

The Firebase browser configuration is intentionally present in client-side code. Firebase web configuration values are identifiers, not database passwords; access control comes from Authentication and Firestore Security Rules.

## Weekly planning

The planner always covers Monday through Sunday. Non-dinner days reduce the number of generated dinners. Dinner days may have no tag requirement, Quick only, Big Meal / Guests only, or both.

The generator reserves enough qualifying candidates to make the planned week possible. A combined Quick + Big day can be satisfied by one meal carrying both tags, while separate Quick and Big days still require separate dinner assignments.

The candidate and scheduled screens both include **Edit week setup**. Returning to setup keeps active carryovers but clears generated candidates and assignments so the corrected week can be generated cleanly. The scheduled screen also retains **Change choices** for revising only the selected meals without changing the week structure.

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
