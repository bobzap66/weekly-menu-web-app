# Weekly Menu

A static GitHub Pages dinner planner with Firebase-backed meal lists and household planning.

## Version 0.16.0 behavior

- Keeps the application on GitHub Pages with no custom application server and no Cloud Functions.
- Runs on the Firebase Spark plan using browser-side Firebase Authentication and Cloud Firestore.
- Supports email/password account creation, sign-in, sign-out, password reset, and email verification.
- Stores meal catalogs under Firestore `lists/{listId}/...` documents and subcollections.
- Lets signed-in users create, duplicate, switch between, and delete named meal lists they own.
- Lets list owners share a list with verified household editors by email address.
- Shared editors can add, edit, disable, and delete categories and meals, but cannot change sharing, ownership, or delete the parent list.
- Shares the active weekly planner state between a list owner and its verified household editors.
- Syncs week setup, generated candidates, scheduled dinners, manual meal replacements, carryovers, meal recency history, and the **Nothing new** preference through Firestore.
- Lets any scheduled dinner be replaced manually with an exact saved meal from the active list while preserving Quick and Big Meal / Guests requirements.
- Keeps browser-local planner storage as a cache and fallback if cloud planner access is unavailable.
- Keeps signed-out planning browser-local even for the public **Family Dinners** catalog; the household planner itself is never public.
- Protects the public **Family Dinners** default list from deletion.
- Uses `stableId` as the canonical meal identity throughout generation, carryovers, planner state, and history.
- Supports **Edit week setup**, **Change choices**, carryovers, printing, and the week-level **Nothing new** option.
- Deploys Firestore Security Rules automatically from GitHub Actions when the checked-in rules change.

Each day has a base plan of **Dinner**, **Leftovers**, **Eating Out**, or **No Meal Planned**. Dinner days can independently require **Quick** and **Big Meal / Guests**; a day with both checked must receive a meal carrying both tags.

## Firebase architecture

The public site is a static GitHub Pages application. Browser-side Firebase modules connect directly to Firebase Authentication and Cloud Firestore. No Blaze-only services are required.

Meal catalogs and household planner data are list-backed:

```text
lists/
  LIST_ID/
    name
    ownerUid
    editorEmails[]
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

    planner/
      current/
        schemaVersion
        state
        history
        nothingNew
        updatedAt
        updatedByUid
```

The original list uses the document ID `default` and is named **Family Dinners**. It remains `publicRead: true` so signed-out visitors can use the normal meal catalog without an account. Public catalog access does not expose `planner/current` and never grants write access.

Lists created or duplicated through Manage Meals use generated Firestore document IDs and default to `publicRead: false` with an empty `editorEmails` array.

The previous top-level `categories` and `meals` collections remain physically present in Firestore as an inert rollback snapshot, but the current security rules grant the application no read or write access to them.

All existing Family Dinners meal documents retain their original Firestore document IDs. Each meal's `stableId` equals its document ID, so renaming or recategorizing a meal does not change its identity.

## Accounts and shared lists

The Manage Meals page supports account creation, sign-in, sign-out, password-reset email, and email verification through Firebase Authentication.

New email/password accounts receive a Firebase verification email after signup. An account may own and manage its own lists before verification, but it must verify its email before it can receive editor access to another household's list. On startup, the app refreshes verified Firebase authentication tokens so Firestore sees the current `email_verified` claim.

To share a list, the owner selects it and enters another person's email under **Household access → Share this list**. The email is normalized to lowercase and added to that list's `editorEmails` array. The recipient does not need to exist yet: once an account signs in with that email and verifies it, the shared list becomes available.

Invitation delivery remains manual so the project can stay on the Spark plan. Each shared editor row provides **Open email**, which opens the owner's mail application with a prefilled invitation, and **Copy invite**, which copies the same invitation text for another messaging method.

Manage Meals discovers both lists owned by the current UID and, for a verified account, lists whose `editorEmails` array contains the account email. Shared lists are marked **(shared)** in the selector.

The owner alone controls `editorEmails` and may remove an editor at any time. Only the owner may delete the parent list. The protected `default` Family Dinners parent cannot be deleted even by its owner.

## Cloud-synced household planning

A signed-in owner and every verified editor of a list share one planner document at `lists/{listId}/planner/current`.

The shared document contains the complete planner state needed to continue the same household week on another browser or account:

- current week setup and day types;
- Quick and Big Meal / Guests requirements;
- generated meal candidates and removals;
- final scheduled week, manual day assignments, and manually selected meals;
- carryovers into the next week;
- meal recency history used by weighting;
- the week-level **Nothing new** setting.

When a signed-in user opens a list, the app first checks Firestore for a valid household planner. If one exists, the cloud copy wins and replaces the browser cache. If none exists yet, the browser's current valid planner state seeds `planner/current`. This gives existing users a straightforward pre-alpha migration without maintaining two independent sources of truth.

After startup, the planner subscribes to the Firestore document. Changes made by another signed-in household member are applied to the open planner without requiring a page reload. Local storage remains a cache and a fallback if cloud access is temporarily unavailable.

Signed-out users never read or write the cloud household planner. They use the public Family Dinners catalog with browser-local planner state only. This keeps weekly household information private even though the default meal catalog is public.

Version 0.16 uses whole-document synchronization. If two household members make conflicting planner changes at nearly the same time, the most recently completed write wins. More granular conflict resolution can be added later if simultaneous editing becomes common.

## Active-list and local cache behavior

Switching the selected list updates the browser's active-list preference. Opening the planner while that user remains signed in loads the selected owned or shared list and its household planner.

If the saved active list is no longer accessible, the planner tries the public Family Dinners list. Signed-out users always use Family Dinners regardless of the last private or shared list selected while signed in.

Each list still has a browser-storage cache namespace:

```text
weekly-menu:list:{listId}:state:v1
weekly-menu:list:{listId}:history:v2
weekly-menu:list:{listId}:nothing-new
```

For signed-in accessible lists, Firestore is the shared source of truth and these keys are the local cache/fallback. For signed-out planning, the local keys remain the only planner persistence.

Planner state schema version 7 requires stable meal IDs. Generated meals and carryovers use `stableId` directly. Candidate `id` values remain temporary UI-instance identifiers used only for selecting, rejecting, and assigning candidates in a particular generated week.

## List duplication and deletion

Duplicating a list preserves every category document ID, meal document ID, stable meal ID, weight, tag, description, recipe link, order value, and other stored meal/category fields inside the copy. The duplicate does not inherit the source list's owner, editors, or household planner. It starts as a new private list with its own planning state.

List duplication copies catalog documents in bounded Firestore batches. If a copy fails after the destination list is created, the app attempts to remove copied child documents and the incomplete destination list.

List deletion also works in bounded batches. An owner must type the active list name exactly and confirm a final warning. Categories, meals, and `planner/current` are deleted before the parent document because Firestore does not cascade subcollection deletion. Shared editors cannot delete the parent list.

## Security rules

The repository includes `firestore.rules`, which is the source of truth for access control.

The current model is:

- A signed-in user may create a list only with their own UID as `ownerUid`.
- An owner may read and modify list metadata, including `editorEmails`.
- A verified-email editor may read list metadata when the lowercased authenticated email appears in `editorEmails`.
- An owner or verified-email editor may create, edit, and delete nested categories and meals.
- An owner or verified-email editor may read and update `planner/current`.
- Only the owner may delete `planner/current` or a non-default parent list.
- The `default` Family Dinners parent document cannot be deleted.
- Nested categories and meals may be read without authentication only when the parent list has `publicRead: true`.
- `planner/current` is never exposed by `publicRead`.
- Public catalog access never grants write access.
- The legacy top-level catalog and all unspecified Firestore paths are denied.

The Firebase browser configuration is intentionally present in client-side code. Those values identify the Firebase project; authorization comes from Firebase Authentication and Firestore Security Rules.

`.github/workflows/deploy-firestore-rules.yml` uses GitHub OIDC and Google Workload Identity Federation to deploy rules automatically when `firestore.rules`, `firebase.json`, or the deployment workflow changes on `main`. See `FIREBASE_RULES_CI.md` for the one-time identity setup.

## Catalog management

The Manage Meals page includes an Available Lists selector plus Create, Duplicate, Delete, and Household Access controls. Each list has independent categories, meal records, weights, Quick/Big Meal tags, descriptions, recipe links, and Active state.

The catalog browser can be filtered to one category. Selecting a category exposes its current weight and meal count and allows direct editing.

## New ideas

Normal categories do not need stored placeholder meals such as `New BBQ Recipe`. Whenever a normal category is selected for an unrestricted candidate slot, there is a **10% chance** the candidate becomes **New Recipe** for that category.

**New Category** is a separate **5% chance per generation** and occupies one candidate slot when it appears. Required Quick and Big Meal / Guests slots never become new-idea prompts because those prompts do not carry qualifying tags.

The week setup screen includes **Nothing new**. When checked, both New Recipe and New Category prompts are suppressed for that week's generation and rerolls. For signed-in households this preference is cloud-synced with the rest of the planner.

## Weekly planning

The planner always covers Monday through Sunday. Non-dinner days reduce the number of generated dinners. Dinner days may have no tag requirement, Quick only, Big Meal / Guests only, or both.

The generator reserves enough qualifying candidates to make the planned week possible. Carryovers remain automatic candidates unless explicitly removed, and their stable ID, Quick/Big tags, descriptions, and recipe links travel with them.

Once the week is scheduled, each dinner day has a **Set meal** picker grouped by category. It can replace the generated dinner with any active saved meal that satisfies that day's Quick and Big Meal / Guests requirements. The replacement keeps the same scheduled day, is saved into the normal planner state, and therefore syncs to other signed-in household members. Replacing a dinner clears that slot's carryover marker because the carryover belongs to the previous meal.

The **Print week** feature remains available for scheduled weeks.

## Meal history weighting

A meal eaten last week uses 15% of its normal weight. Its weight then recovers to 35%, 55%, 70%, 82%, and 92% over the following five weeks. After six weeks, it returns to its normal weight.

Only the specific stable meal ID is penalized. A dinner marked for carryover is not treated as eaten and is inserted directly into the next week's candidates instead. For signed-in households this history is shared through the cloud planner so all editors generate from the same recency data.

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
