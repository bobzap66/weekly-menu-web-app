# Weekly Menu

A static GitHub Pages dinner planner with Firebase-backed editable meal lists.

## Version 0.10.2 behavior

- Keeps the planner itself on GitHub Pages; there is no custom application server.
- Stores meal catalogs under Firestore `lists/{listId}/...` documents and subcollections.
- Lets signed-in users create multiple named meal lists and switch between lists they own.
- Lets signed-in users duplicate the active list into a new independent private list.
- Lets signed-in users permanently delete non-default lists after typing the list name to confirm.
- Protects the public **Family Dinners** default list from deletion.
- New empty lists start private; duplicated lists also start private.
- Remembers the active list in browser storage.
- While signed in, the planner uses the currently selected owned list.
- While signed out, the planner uses the public **Family Dinners** list.
- Shows the active list name on the planner.
- Falls back to bundled `src/data.js` meals only if the Firestore catalog cannot be read.
- Provides an authenticated **Manage Meals** page for adding, editing, disabling, and deleting meals.
- Supports category creation, category weights, meal weights, Quick and Big Meal / Guests tags, descriptions, recipe links, and Active state.
- Uses stable meal IDs as the canonical identity for generated meals, carryovers, and recency history.
- Supports **Edit week setup**, **Change choices**, carryovers, printing, and the week-level **Nothing new** option.

Each day has a base plan of **Dinner**, **Leftovers**, **Eating Out**, or **No Meal Planned**. Dinner days can independently require **Quick** and **Big Meal / Guests**; a day with both checked must receive a meal carrying both tags.

## Firebase architecture

The public site remains a static GitHub Pages application. Browser-side Firebase modules connect directly to Firebase Authentication and Cloud Firestore.

Meal catalogs are list-backed:

```text
lists/
  LIST_ID/
    name
    ownerUid
    publicRead
    schemaVersion
    createdAt

    categories/
      CATEGORY_ID/
        name
        weight
        order

    meals/
      MEAL_ID/
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

The original list uses the document ID `default` and is named **Family Dinners**. It remains `publicRead: true` so signed-out visitors can use the normal planner without an account. Lists created or duplicated through Manage Meals use generated Firestore document IDs and default to `publicRead: false`.

The previous top-level `categories` and `meals` collections remain physically present in Firestore as an inert rollback snapshot, but the current security rules grant the application no read or write access to them.

All existing Family Dinners meal documents retain their original Firestore document IDs. Each meal's `stableId` equals its document ID, so renaming or recategorizing a meal does not change its identity.

Duplicating a list preserves every category document ID, meal document ID, stable meal ID, weight, tag, description, recipe link, order value, and other stored meal/category fields inside the copy. Because each copy lives under a different list document, the copied catalog can then be edited independently without affecting its source.

## Active-list behavior

Manage Meals lists all list documents owned by the signed-in Firebase user. Switching the selected list updates the browser's active-list preference. Opening the planner while that user remains signed in loads the selected list.

If the saved active list is no longer accessible, the planner tries the public Family Dinners list. Signed-out users always use Family Dinners regardless of the last private list selected while signed in.

Deleting an active non-default list resets the stored active-list preference to Family Dinners and reloads Manage Meals. If the user does not own Family Dinners, Manage Meals falls back to another owned list when one exists, while the planner can still read Family Dinners as the public fallback.

The app is still pre-alpha, so switching to a different list deliberately clears current local weekly-planning state, recency history, and the Nothing New toggle. This prevents carryovers or test history from one list leaking into another without adding a compatibility layer we do not yet need.

## Security rules

The repository includes `firestore.rules`.

The current access model is:

- A signed-in user may create a list only with their own UID as `ownerUid`.
- Only the list owner may read the list metadata document or modify it.
- A list owner may delete a list except for the protected `default` list.
- A list owner may create, edit, and delete that list's categories and meals.
- Nested categories and meals may be read without authentication only when the parent list has `publicRead: true`.
- The legacy top-level catalog and all unspecified Firestore paths are denied.

The Firebase browser configuration is intentionally present in client-side code. Those values identify the Firebase project; authorization comes from Firebase Authentication and Firestore Security Rules.

## Catalog management

The Manage Meals page includes a list selector plus Create, Duplicate, and Delete controls. Each list has independent categories, meal records, weights, Quick/Big Meal tags, descriptions, recipe links, and Active state.

Creating a new list produces an empty private list. Duplicating the active list creates a new private list containing exact copies of the source categories and meals. The copied list is selected automatically after duplication.

List duplication copies documents in bounded Firestore batches so larger catalogs are not tied to a single 500-write transaction. If a copy fails after the destination list is created, the app attempts to remove any copied child documents and the incomplete destination list before reporting the failure.

List deletion also works in bounded batches. The user must type the active list name exactly before the delete button is enabled, then confirm a final browser warning that includes the category and meal counts. Child category and meal documents are deleted first, and the parent list document is deleted last because Firestore does not cascade subcollection deletion. If a child deletion batch fails, the parent list remains so the operation can be retried.

The **Family Dinners** list cannot be deleted through the UI, and the Firestore rules also deny deletion of the `default` parent document because it is the public signed-out fallback.

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
