# Weekly Menu

A dependency-free static web app that recreates and extends the behavior of the original
TableMaster `WeeklyMenu.tbl` file.

## Version 0.2 behavior

- Generates ten weighted dinner suggestions from ten distinct categories.
- Lets you tap three candidates to remove them from consideration.
- Automatically promotes the remaining seven dinners to **This Week's Menu**.
- Saves the current candidates, rejected meals, and final menu in browser `localStorage`.
- Restores the current week when the page is reopened or refreshed.
- Lets you reopen the final menu to change your choices.
- Starts a fresh set of ten candidates only when you explicitly roll again or start next week.
- Preserves the original weighted categories, weighted meals, and 25% conditional modifiers.

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
