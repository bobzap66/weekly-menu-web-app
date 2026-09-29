# Weekly Menu

A static GitHub Pages dinner planner with a Firebase-backed editable meal catalog.

## Version 0.9.3 behavior

- Keeps the planner itself on GitHub Pages; there is no custom application server.
- Loads the active catalog from Cloud Firestore under `lists/default/...`.
- Falls back to the bundled `src/data.js` catalog if the remote catalog cannot be loaded.
- Provides an authenticated **Manage Meals** page for adding, editing, disabling, and deleting meals.
- Supports category creation, category weights, meal weights, Quick and Big Meal / Guests tags, descriptions, recipe links, and Active state.
- Uses stable meal IDs as the canonical identity for generated meals, carryovers, and recency history.
- Stores the current weekly plan and recency history in browser `localStorage`.
- Supports **Edit week setup**, **Change choices**, carryovers, printing, and the week-level **Nothing new** option.

Each day has a base plan of **Dinner**, **Leftovers**, **Eating Out**, or **No Meal Planned**. Dinner days can independently require **Quick** and **Big Meal / Guests**; a day with both checked must receive a meal carrying both tags.

## Firebase architecture

The public site remains a static GitHub Pages application. Browser-side Firebase modules connect directly to Firebase Authentication and Cloud Firestore.

The active catalog is now list-backed:

```text
lists/
  default/
    name: "Family Dinners"
    ownerUid: <owner Firebase UID>
    publicRead: true
    schemaVersion: 1

    categories/
      <category document ID>
        name
        weight
        order

    meals/
      <meal document ID>
        stableId
        categoryId
        name
        weight
        quick
        bigMeal
        active
        recipeUrl
        description
        order
```

The `default` list is currently named **Family Dinners**. Its nested categories and meals are public-readable so the normal planner does not require a login. Writes require the authenticated user to own the list.

The previous top-level `categories` and `meals` collections remain physically present in Firestore as an inert rollback snapshot, but the current security rules grant the application no read or write access to them.

All existing meal documents were migrated with their original Firestore document IDs preserved. Each meal's `stableId` equals that document ID, so renaming or recategorizing a meal does not change its identity.

## Security rules

The repository includes `firestore.rules`.

The current access model is:

- A signed-in user may create a list only with their own UID as `ownerUid`.
- Only the list owner may read the list metadata document or modify/delete the list.
- A list owner may create, edit, and delete that list's categories and meals.
- Nested categories and meals may be read without authentication only when the parent list has `publicRead: true`.
- The legacy top-level catalog and all unspecified Firestore paths are denied.

The Firebase browser configuration is intentionally present in client-side code. Those values identify the Firebase project; authorization comes from Firebase Authentication and Firestore Security Rules.

## Pre-alpha data policy

The app is still pre-alpha. Schema and state changes prioritize the target architecture over backward compatibility with test data.

Version 0.9.0 reset old local weekly/history test state and moved recency tracking to stable meal IDs. Versions 0.9.1–0.9.3 migrated the catalog into the first list, switched the planner and admin page to the new paths, and removed the temporary migration utilities and legacy admin code.

## Catalog management

The Manage Meals page currently operates on the **Family Dinners** list. Editors can add or edit meals, change weights and tags, add descriptions and recipe links, deactivate or delete meals, create categories, and adjust category names and weights.

The catalog browser can be filtered to one category. Selecting a category exposes its current weight and meal count and allows direct editing.

## New ideas

Normal categories do not need stored placeholder meals such as `New BBQ Recipe`. Whenever a normal category is selected for an unrestricted candidate slot, there is a **10% chance** the candidate becomes **New Recipe** for that category.

**New Category** is a separate **5% chance per generation** and occupies one candidate slot when it appears. Required Quick and Big Meal / Guests slots never become new-idea prompts because those prompts do not carry qualifying tags.

The week setup screen includes **Nothing new**. When checked, both New Recipe and New Category prompts are suppressed for that week's generation and rerolls.

## Weekly planning

The planner always covers Monday through Sunday. Non-dinner days reduce the number of generated dinners. Dinner days may have no tag requirement, Quick only, Big Meal / Guests only, or both.

The generator reserves enough qualifying candidates to make the planned week possible. Carryovers remain automatic candidates unless explicitly removed, and their stable ID, Quick/Big tags, descriptions, and recipe links travel with them.

## Meal history weighting

A meal eaten last week uses 15% of its normal weight. Its weight then recovers to 35%, 55%, 70%, 82%, and 92% over the following five weeks. After six weeks, it returns to its normal weight.

Only the specific stable meal ID is penalized. A dinner marked for carryover is not treated as eaten and is inserted directly into the next week's candidates instead.

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
