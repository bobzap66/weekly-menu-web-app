# Weekly Menu

A dependency-free static web app that recreates the behavior of the original
TableMaster `WeeklyMenu.tbl` file.

## MVP behavior

- Generates ten dinner suggestions.
- Selects categories and meals according to the original weights.
- Prevents a category from appearing more than once in a generated menu.
- Preserves the original 25% conditional modifiers.
- Generates a fresh menu when **Roll a new menu** is selected.

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

