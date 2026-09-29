# Weekly Menu

A dependency-free static web app that recreates and extends the behavior of the original
TableMaster `WeeklyMenu.tbl` file.

## Version 0.3 behavior

- Generates ten weighted dinner suggestions from ten distinct categories.
- Lets you tap three candidates to remove them from consideration.
- Automatically promotes the remaining seven dinners to **This Week's Menu**.
- Saves the current candidates, rejected meals, and final menu in browser `localStorage`.
- Restores the current week when the page is reopened or refreshed.
- Lets you reopen the final menu to change your choices.
- Starts a fresh set of ten candidates only when you explicitly roll again or start next week.
- Records the seven selected meals when you start the next week.
- Makes recently selected meals less likely to repeat, then gradually restores their normal weight over six weeks.
- Keeps meal history entirely in the browser; no server or account is required.
- Preserves the original weighted categories, weighted meals, and 25% conditional modifiers.
- Cleans up obvious spelling errors in meal names while preserving intentional names such as Hawgbacks.

## Meal history weighting

A meal selected last week uses 15% of its normal weight. Its weight then recovers to 35%, 55%, 70%, 82%, and 92% over the following five weeks. After six weeks, it returns to its normal weight.

Only the specific meal is penalized; its category keeps its original weight.

## Run locally

Serve the directory with any static web server. For example:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Test

With a current version of Node.js installed:

```sh
npm test
```

No package installation is required.
