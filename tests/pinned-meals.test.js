import test from "node:test";
import assert from "node:assert/strict";

import { createHistory } from "../src/history.js";
import {
  DAY_TYPES,
  createMenuState,
  createPlanningState,
  createWeekPlan,
  getMealRequirementShortfall,
  getRequiredRejectionCount,
  getScheduledWeek,
  setDayRequirement,
  setDayType,
  setPinnedMeal,
  toggleRejection,
} from "../src/state.js";
import { replaceScheduledMeal } from "../src/manual-meals.js";
import { buildNextWeekSuggestions } from "../src/week.js";

function meal(index, overrides = {}) {
  return {
    stableId: `meal-${index}`,
    name: `Meal ${index}`,
    weight: 1,
    quick: false,
    bigMeal: false,
    ...overrides,
  };
}

const testMenuData = {
  candidateCount: 10,
  categories: Array.from({ length: 10 }, (_, index) => ({
    id: `category-${index}`,
    name: `Category ${index}`,
    weight: 1,
    meals: [meal(index)],
  })),
};

function suggestion(index, overrides = {}) {
  return {
    stableId: `meal-${index}`,
    categoryId: `category-${index}`,
    categoryName: `Category ${index}`,
    mealName: `Meal ${index}`,
    quick: false,
    bigMeal: false,
    ...overrides,
  };
}

test("setup can pin a saved meal and clears it if later requirements make it incompatible", () => {
  let state = createPlanningState();
  const tacos = suggestion(1, { quick: false, bigMeal: false });

  state = setPinnedMeal(state, "Tuesday", tacos);
  assert.equal(state.pinnedMeals.Tuesday.stableId, "meal-1");

  state = setDayRequirement(state, "Tuesday", "quick", true);
  assert.equal("Tuesday" in state.pinnedMeals, false);
});

test("generation keeps a pinned meal fixed and rolls only the remaining dinners plus extras", () => {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
    planning = setDayType(planning, day, DAY_TYPES.NORMAL);
  }

  const pinned = suggestion(0);
  planning = setPinnedMeal(planning, "Tuesday", pinned);

  const suggestions = buildNextWeekSuggestions(
    testMenuData,
    createHistory(),
    [],
    planning.weekPlan,
    () => 0.42,
    { pinnedMeals: planning.pinnedMeals, nothingNew: true },
  );

  assert.equal(suggestions.length, 8);
  assert.equal(suggestions[0].stableId, "meal-0");
  assert.equal(suggestions[0].pinnedDay, "Tuesday");
  assert.equal(suggestions.slice(1).some((item) => item.categoryId === "category-0"), false);
});

test("a pinned candidate cannot be removed and is assigned to its pinned day", () => {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  planning = setDayType(planning, "Monday", DAY_TYPES.NORMAL);
  planning = setDayType(planning, "Tuesday", DAY_TYPES.NORMAL);
  planning = setPinnedMeal(planning, "Monday", suggestion(0));

  let state = createMenuState(
    [
      { ...suggestion(0), pinnedDay: "Monday" },
      suggestion(1),
      suggestion(2),
      suggestion(3),
      suggestion(4),
    ],
    planning.weekPlan,
    "2026-09-30T00:00:00Z",
    [],
    planning.pinnedMeals,
  );

  const pinnedCandidate = state.candidates[0];
  assert.equal(toggleRejection(state, pinnedCandidate.id), state);

  while (state.mode === "choosing" && state.rejectedIds.length < getRequiredRejectionCount(state)) {
    const next = state.candidates.find(
      (candidate) => !candidate.pinnedDay && !state.rejectedIds.includes(candidate.id),
    );
    state = toggleRejection(state, next.id);
  }

  assert.equal(state.mode, "scheduled");
  assert.equal(getScheduledWeek(state).find((entry) => entry.day === "Monday").meal.stableId, "meal-0");
});

test("a pinned meal on an unrestricted day cannot satisfy another day's combined requirement", () => {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  planning = setDayType(planning, "Monday", DAY_TYPES.NORMAL);
  planning = setDayType(planning, "Saturday", DAY_TYPES.NORMAL);
  planning = setDayRequirement(planning, "Saturday", "quick", true);
  planning = setDayRequirement(planning, "Saturday", "bigMeal", true);
  const pinnedBoth = suggestion(0, { quick: true, bigMeal: true });
  planning = setPinnedMeal(planning, "Monday", pinnedBoth);

  const state = createMenuState(
    [
      { ...pinnedBoth, pinnedDay: "Monday" },
      suggestion(1, { quick: true, bigMeal: false }),
      suggestion(2),
      suggestion(3),
      suggestion(4),
    ],
    planning.weekPlan,
    "2026-09-30T00:00:00Z",
    [],
    planning.pinnedMeals,
  );

  assert.equal(getMealRequirementShortfall(state) > 0, true);
});

test("replacing a scheduled pinned meal updates the remembered setup pin", () => {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  planning = setDayType(planning, "Monday", DAY_TYPES.NORMAL);
  planning = setPinnedMeal(planning, "Monday", suggestion(0));

  const state = createMenuState(
    [{ ...suggestion(0), pinnedDay: "Monday" }],
    planning.weekPlan,
    "2026-09-30T00:00:00Z",
    [],
    planning.pinnedMeals,
  );
  const replacement = suggestion(9);
  const next = replaceScheduledMeal(state, state.candidates[0].id, replacement);

  assert.equal(next.candidates[0].stableId, "meal-9");
  assert.equal(next.candidates[0].pinnedDay, "Monday");
  assert.equal(next.pinnedMeals.Monday.stableId, "meal-9");
});
