# Weekly Menu

A dependency-free static web app that recreates and extends the behavior of the original
TableMaster `WeeklyMenu.tbl` file.

## Version 0.6 behavior

- Starts each week by planning Monday through Sunday as **Normal Dinner**, **Quick Meal**, **Big Meal / Guests**, **Leftovers**, **Eating Out**, or **No Meal Planned**.
- Generates only as many dinner selections as the planned cooking days require, plus three extra candidates to cut.
- Keeps the original weighted category and meal selection rules, including 25% conditional modifiers.
- Tags every meal with explicit `quick` and `bigMeal` booleans.
- Treats **Quick Meal** as a real requirement: the final schedule must place a quick-tagged dinner on every Quick Meal day.
- Treats **Big Meal / Guests** as a real requirement: the final schedule must place a guest-friendly, easily scalable dinner on every Guests day.
- Reserves distinct qualifying dinners when Quick and Guests are planned on different days, even when some meals qualify for both tags.
- Automatically assigns qualifying meals to Quick and Guests days, then fills Normal Dinner days with the remaining selections.
- Shows Leftovers, Eating Out, and No Meal Planned directly in the final Monday-through-Sunday schedule.
- Lets scheduled dinners swap days while preventing a swap that would violate a Quick or Guests requirement.
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

Meals carry an explicit `quick: true` or `quick: false` tag in `src/data.js`. Quick currently means the family's normal version can generally reach the table in about 30 minutes or less.

Quick Meal days are treated as requirements rather than suggestions. The candidate generator reserves enough quick-qualified options, and the final schedule will not place a non-quick dinner on a Quick Meal day.

## Big meals / guests

Meals also carry an explicit `bigMeal: true` or `bigMeal: false` tag. A Big Meal is a practical choice when extra people are coming over: either naturally batch-sized or easy to scale up without turning dinner into a production.

Big Meal / Guests days work the same way as Quick Meal days. The candidate generator reserves enough guest-friendly options, the chooser will not finalize an impossible selection, and manual day swaps cannot put a non-big meal on a Guests day.

If a week contains both Quick and Guests requirements, the planner treats them as separate calendar slots. A dinner tagged both Quick and Big can fill either requirement, but it cannot satisfy two different days at once.

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
