# Weekly Menu

A static GitHub Pages dinner planner with a small Firebase-backed editable meal catalog.

## Version 0.8.2 behavior

- Keeps the weekly planner itself on GitHub Pages; there is no custom application server.
- Loads categories and meals from Cloud Firestore when the remote catalog is available.
- Falls back to the bundled `src/data.js` catalog if Firestore is unavailable.
- Adds an authenticated **Manage Meals** page for adding, editing, disabling, and deleting meals.
- Lets approved editors create categories, browse meals by category, and edit category names and weights.
- Shows each meal's weight while browsing a category.
- Stores optional `recipeUrl` and short `description` fields with each meal.
- Displays a meal's description in the planner whenever one exists.
- Stores meal weight, category, Quick, Big Meal / Guests, and Active settings in Firestore.
- Uses Firebase Authentication for editor sign-in.
- Uses a Firestore UID allowlist for write access rather than trusting every authenticated Firebase user.
- Continues storing the current weekly plan and recency history in browser `localStorage`.
- Lets you return from either candidate selection or the finished schedule to **Edit week setup** if a day was planned incorrectly.
- Includes the finished-week print workflow for a clean weekly menu printout.
- Adds a week-level **Nothing new** option.
- Includes a temporary authenticated migration utility for preparing stable meal IDs.

Each day has a base plan of **Dinner**, **Leftovers**, **Eating Out**, or **No Meal Planned**. Dinner days can independently check **Quick** and **Big Meal / Guests**, so one day can require either tag, both tags, or neither. A day with both boxes checked must receive a meal tagged both Quick and Big Meal.

## Firebase architecture

The public site remains a static GitHub Pages application. Browser-side Firebase modules connect directly to Firebase Authentication and Cloud Firestore.

Firestore uses two collections:

- `categories` — category name, weight, and ordering value.
- `meals` — category ID, name, weight, `quick`, `bigMeal`, `active`, optional `recipeUrl`, optional `description`, order, optional `stableId`, and any existing modifiers.

Reads are public so the normal planner does not require a login. Writes are restricted to explicitly allowed Firebase Authentication UIDs.

New-recipe and new-category prompts are generator behavior rather than catalog records. Legacy `new-recipe` or `new-category` category documents are ignored by the generator if they still exist.

To approve another editor later, manually create that user in Firebase Authentication and add their UID to the array in the Firestore rules.

## Stable meal ID migration

Manage Meals temporarily includes a two-step migration tool. **Preview migration** scans every meal document and reports meals that already use their Firestore document ID as `stableId`, meals missing `stableId`, conflicting values, and duplicate values. Preview never writes data.

**Apply stable IDs** is enabled only after a conflict-free preview. Before writing, it rescans the live collection and refuses to continue if the data changed or identity conflicts appeared. It then adds `stableId` only to meals where it is missing, using the meal document's existing Firestore document ID. It does not rename, move, or delete documents and does not overwrite a conflicting existing ID.

New meals created through Manage Meals automatically receive `stableId` equal to their new Firestore document ID. The migration panel is intended to be removed after the existing catalog has been migrated and verified.

## Catalog management

The Manage Meals page supports ongoing catalog maintenance without repository changes. Editors can add or edit meals, change meal weights and tags, add descriptions and recipe links, deactivate meals, delete meals, create new categories, and adjust category weights.

The catalog browser can be filtered to a single category. When a category is selected, its current weight and meal count are shown, the category name or weight can be edited directly, and each meal in the category displays its own weight.

New categories are stored in Firestore with their own weight and ordering value. After a category is created it is immediately available in the meal editor and category browser.

## New ideas

Normal categories no longer need stored placeholder meals such as `New BBQ Recipe`. Whenever a normal category is selected for an unrestricted candidate slot, there is a **10% chance** that the result will instead be **New Recipe** for that category.

**New Category** is a separate **5% chance per generation** and occupies one candidate slot when it appears. Required Quick and Big Meal / Guests slots never become new-recipe or new-category prompts because those prompts do not carry qualifying tags.

The week setup screen includes **Nothing new**. When checked, both New Recipe and New Category prompts are suppressed for that week's generation and rerolls. Starting the next week resets the toggle to off.

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
