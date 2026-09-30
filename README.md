# Weekly Menu

A static GitHub Pages dinner planner with Firebase-backed editable meal lists.

## Version 0.13.0 behavior

- Keeps the planner itself on GitHub Pages; there is no custom application server.
- Supports Firebase email/password account creation, sign-in, sign-out, and password reset.
- Stores meal catalogs under Firestore `lists/{listId}/...` documents and subcollections.
- Lets signed-in users create, duplicate, switch between, and delete named meal lists they own.
- Lets list owners explicitly share a list with other signed-in accounts as editors by Firebase UID.
- Shared editors can add, edit, disable, and delete categories and meals, but cannot change sharing, ownership, or delete the parent list.
- Protects the public **Family Dinners** default list from deletion. It remains owner-only for writes unless its owner explicitly shares it.
- New empty lists start private and unshared; duplicated lists also start private and unshared.
- Remembers the active list in browser storage.
- While signed in, the planner uses the currently selected owned or shared list.
- While signed out, the planner uses the public **Family Dinners** list.
- Gives every list its own local planner state, carryovers, recency history, and **Nothing new** preference.
- Uses `stableId` as the canonical meal identity throughout generation, carryovers, planner state, and history.
- Falls back to bundled `src/data.js` meals only if the Firestore catalog cannot be read.
- Supports category creation, category weights, meal weights, Quick and Big Meal / Guests tags, descriptions, recipe links, and Active state.
- Supports **Edit week setup**, **Change choices**, carryovers, printing, and the week-level **Nothing new** option.
- Deploys Firestore Security Rules automatically from GitHub Actions when the checked-in rules change.

Each day has a base plan of **Dinner**, **Leftovers**, **Eating Out**, or **No Meal Planned**. Dinner days can independently require **Quick** and **Big Meal / Guests**; a day with both checked must receive a meal carrying both tags.

## Firebase architecture

The public site remains a static GitHub Pages application. Browser-side Firebase modules connect directly to Firebase Authentication and Cloud Firestore.

Meal catalogs are list-backed:

```text
lists/
  LIST_ID/
    name
    ownerUid
    editorUids[]
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

The original list uses the document ID `default` and is named **Family Dinners**. It remains `publicRead: true` so signed-out visitors can use the normal planner without an account. Public read access does not grant write access. Family Dinners categories and meals can be changed only by its owner or by an editor the owner explicitly adds.

Lists created or duplicated through Manage Meals use generated Firestore document IDs and default to `publicRead: false` with an empty `editorUids` array.

The previous top-level `categories` and `meals` collections remain physically present in Firestore as an inert rollback snapshot, but the current security rules grant the application no read or write access to them.

All existing Family Dinners meal documents retain their original Firestore document IDs. Each meal's `stableId` equals its document ID, so renaming or recategorizing a meal does not change its identity.

Duplicating a list preserves every category document ID, meal document ID, stable meal ID, weight, tag, description, recipe link, order value, and other stored meal/category fields inside the copy. The duplicate does not inherit the source list's owner or editors: it is a new private list owned by the account that made the copy.

## Accounts and shared lists

The Manage Meals page supports account creation, sign-in, sign-out, and password-reset email through Firebase Authentication.

A signed-in account's Firebase UID is displayed near the top of Manage Meals with a **Copy UID** button. To share a list, the owner selects it and pastes another account's UID into **Household access → Share this list**. The UID is added to that list's `editorUids` array.

Manage Meals discovers both kinds of lists available to the signed-in user:

- lists where `ownerUid` equals the user's UID;
- lists where `editorUids` contains the user's UID.

Shared lists are marked **(shared)** in the list selector. An editor may use the same catalog-management tools as the owner for categories and meals. The owner alone controls the `editorUids` list and may remove an editor at any time. Only the owner may delete the parent list. The protected `default` Family Dinners parent cannot be deleted even by its owner.

Removing an editor revokes that account's Firestore access to the list on subsequent requests. If an inaccessible shared list was the browser's saved active list, the planner falls back to the public Family Dinners list when it can no longer read the selected catalog.

Sharing currently covers the **meal-list catalog**, not the weekly planner's browser-local state. Two household members editing the same shared list see the same Firestore categories and meals, but each browser still has its own current week, carryovers, recency history, and Nothing New preference. Cloud-synced household planning can be added separately later.

## Active-list and local planner behavior

Switching the selected list updates the browser's active-list preference. Opening the planner while that user remains signed in loads the selected owned or shared list.

If the saved active list is no longer accessible, the planner tries the public Family Dinners list. Signed-out users always use Family Dinners regardless of the last private or shared list selected while signed in.

Each list has its own browser-storage namespace:

```text
weekly-menu:list:{listId}:state:v1
weekly-menu:list:{listId}:history:v2
weekly-menu:list:{listId}:nothing-new
```

A list remembers its current week setup or scheduled week, pending carryovers, meal recency history, and Nothing New setting independently from every other list in that browser. Returning to that list restores its own planner state.

Version 0.11.0 intentionally started the per-list storage clean rather than translating the old pre-alpha global planner keys. The application is still pre-alpha, so backward compatibility with those old local test-state formats is not required.

Planner state schema version 7 requires stable meal IDs. Generated meals and carryovers use `stableId` directly. Candidate `id` values remain temporary UI-instance identifiers used only for selecting, rejecting, and assigning candidates in a particular generated week.

Deleting an active non-default list resets the stored active-list preference to Family Dinners and removes that browser's local planner storage for the deleted list.

## Security rules

The repository includes `firestore.rules`.

The current access model is:

- A signed-in user may create a list only with their own UID as `ownerUid`.
- An owner may read and modify the list metadata, including `editorUids`.
- An explicit editor may read the list metadata but cannot modify it.
- An owner or explicit editor may create, edit, and delete nested categories and meals.
- Only the owner may delete a non-default parent list.
- The `default` Family Dinners parent document cannot be deleted.
- Nested categories and meals may be read without authentication only when the parent list has `publicRead: true`.
- Public read access never grants write access.
- The legacy top-level catalog and all unspecified Firestore paths are denied.

The Firebase browser configuration is intentionally present in client-side code. Those values identify the Firebase project; authorization comes from Firebase Authentication and Firestore Security Rules.

The checked-in rules are the source of truth. `.github/workflows/deploy-firestore-rules.yml` uses GitHub OIDC and Google Workload Identity Federation to deploy rules automatically when `firestore.rules`, `firebase.json`, or the deployment workflow changes on `main`. See `FIREBASE_RULES_CI.md` for the one-time identity setup.

## Catalog management

The Manage Meals page includes an Available Lists selector plus Create, Duplicate, Delete, and Household Access controls. Each list has independent categories, meal records, weights, Quick/Big Meal tags, descriptions, recipe links, and Active state.

Creating a new list produces an empty private, unshared list. Duplicating any list available to the current account creates a new private copy owned by the current account. The copied list is selected automatically after duplication.

List duplication copies documents in bounded Firestore batches so larger catalogs are not tied to a single 500-write transaction. If a copy fails after the destination list is created, the app attempts to remove any copied child documents and the incomplete destination list before reporting the failure.

List deletion also works in bounded batches. An owner must type the active list name exactly before the delete button is enabled, then confirm a final browser warning that includes the category and meal counts. Child category and meal documents are deleted first, and the parent list document is deleted last because Firestore does not cascade subcollection deletion. Shared editors cannot delete the parent list.

The catalog browser can be filtered to one category. Selecting a category exposes its current weight and meal count and allows direct editing.

## New ideas

Normal categories do not need stored placeholder meals such as `New BBQ Recipe`. Whenever a normal category is selected for an unrestricted candidate slot, there is a **10% chance** the candidate becomes **New Recipe** for that category.

**New Category** is a separate **5% chance per generation** and occupies one candidate slot when it appears. Required Quick and Big Meal / Guests slots never become new-idea prompts because those prompts do not carry qualifying tags.

The week setup screen includes **Nothing new**. When checked, both New Recipe and New Category prompts are suppressed for that week's generation and rerolls. This preference is stored independently for each meal list in that browser.

## Weekly planning

The planner always covers Monday through Sunday. Non-dinner days reduce the number of generated dinners. Dinner days may have no tag requirement, Quick only, Big Meal / Guests only, or both.

The generator reserves enough qualifying candidates to make the planned week possible. Carryovers remain automatic candidates unless explicitly removed, and their stable ID, Quick/Big tags, descriptions, and recipe links travel with them.

## Meal history weighting

A meal eaten last week uses 15% of its normal weight. Its weight then recovers to 35%, 55%, 70%, 82%, and 92% over the following five weeks. After six weeks, it returns to its normal weight.

Only the specific stable meal ID is penalized. A dinner marked for carryover is not treated as eaten and is inserted directly into the next week's candidates instead. History is stored separately for each meal list in each browser.

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
