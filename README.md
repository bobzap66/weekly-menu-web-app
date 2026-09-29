# Weekly Menu

A dependency-free static web app that recreates and extends the behavior of the original
TableMaster `WeeklyMenu.tbl` file.

## Version 0.5 behavior

- Starts each week by planning Monday through Sunday as **Normal Dinner**, **Quick Meal**, **Leftovers**, **Eating Out**, or **No Meal Planned**.
- Generates only as many dinner selections as the planned cooking days require, plus three extra candidates to cut.
- Keeps the original weighted category and meal selection rules, including 25% conditional modifiers.
- Tags every meal as quick or not quick. Quick currently means the family's normal version can generally reach the table in about 30 minutes or less.
- Ensures the candidate pool contains enough quick-tagged dinners for the week's **Quick Meal** days.
- Will not finalize a menu if the selected dinners cannot satisfy all planned Quick Meal days.
- Automatically assigns quick-tagged dinners to Quick Meal days when the menu is finalized.
- Assigns the remaining selected dinners to Normal Dinner days.
- Shows Leftovers, Eating Out, and No Meal Planned directly in the final Monday-through-Sunday schedule.
- Lets scheduled dinners swap days, while preventing a swap that would put a non-quick dinner on a Quick Meal day.
- Lets you mark a dinner **Didn't eat — carry over** at the end of the week.
- Carries uneaten dinners into the next week's candidate pool as automatic selections unless you explicitly remove them.
- Preserves carried-over dinners when rerolling the other candidates.
- Preserves carryovers through a week with no cooked dinners.
- Does not record carried-over dinners as eaten in meal history.
- Makes recently eaten meals less likely to repeat, then gradually restores their normal weight over six weeks.
- Saves the current week structure, candidates, rejected meals, schedule, and carryover choices in browser `localStorage`.
- Keeps all planning and history data entirely in the browser; no server or account is required.
- Cleans up obvious spelling errors in meal names while preserving intentional names such as Hawgbacks.

## Variable week structure

The planner always covers Monday through Sunday, but not every day needs a generated dinner. A five-dinner week, for example, generates eight candidates and asks you to remove three. Non-cooking days remain visible in the final weekly schedule.

If carryovers create more candidates than the normal three-extra cushion, the app asks for enough removals to reach the number of planned dinner days rather than dropping carryovers silently.

## Quick meals

Meals carry an explicit `quick: true` or `quick: false` tag in `src/data.js`. The generator uses those tags whenever one or more days are planned as **Quick Meal**. Quick Meal days are treated as requirements rather than suggestions: the finalized schedule must place a quick-tagged dinner on each of them.

## Meal history weighting

A meal eaten last week uses 15% of its normal weight. Its weight then recovers to 35%, 55%, 70%, 82%, and 92% over the following five weeks. After six weeks, it returns to its normal weight.

Only the specific meal is penalized; its category keeps its original weight. A dinner marked for carryover is not treated as eaten and is inserted directly into the next week's candidates instead.

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
