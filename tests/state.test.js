import test from "node:test";
import assert from "node:assert/strict";

import {
  DAYS,
  DAY_TYPES,
  assignMealDay,
  canAssignMealDay,
  countBigMealDays,
  countMealDays,
  countQuickMealDays,
  createMenuState,
  createPlanningState,
  createWeekPlan,
  getBigMealShortfall,
  getCarryoverMeals,
  getEatenMeals,
  getMealRequirementShortfall,
  getQuickMealShortfall,
  getRequiredRejectionCount,
  getScheduledWeek,
  getSelectedMeals,
  isValidMenuState,
  reopenChoices,
  setDayType,
  toggleCarryover,
  toggleRejection,
} from "../src/state.js";

function makeSuggestions(count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    categoryId: `category-${index}`,
    categoryName: `Category ${index}`,
    mealName: `Meal ${index}`,
    mealKey: `category-${index}:Meal ${index}`,
    quick: index < 4,
    bigMeal: index >= 4 && index < 8,
  }));
}

function fiveDinnerPlan() {
  let state = createPlanningState();
  state = setDayType(state, "Saturday", DAY_TYPES.LEFTOVERS);
  state = setDayType(state, "Sunday", DAY_TYPES.EATING_OUT);
  return state.weekPlan;
}

function finalize(state) {
  while (state.mode === "choosing" && state.rejectedIds.length < getRequiredRejectionCount(state)) {
    const next = state.candidates.find((candidate) => !state.rejectedIds.includes(candidate.id));
    state = toggleRejection(state, next.id);
  }
  return state;
}

test("planning state supports variable day types", () => {
  let state = createPlanningState();
  state = setDayType(state, "Tuesday", DAY_TYPES.QUICK);
  state = setDayType(state, "Thursday", DAY_TYPES.BIG);
  state = setDayType(state, "Friday", DAY_TYPES.LEFTOVERS);
  state = setDayType(state, "Saturday", DAY_TYPES.EATING_OUT);
  state = setDayType(state, "Sunday", DAY_TYPES.NO_MEAL);

  assert.equal(state.mode, "setup");
  assert.equal(countMealDays(state.weekPlan), 4);
  assert.equal(countQuickMealDays(state.weekPlan), 1);
  assert.equal(countBigMealDays(state.weekPlan), 1);
  assert.equal(isValidMenuState(state), true);
});

test("a five-dinner week finalizes after three cuts", () => {
  const plan = fiveDinnerPlan();
  let state = createMenuState(makeSuggestions(8), plan);

  assert.equal(getRequiredRejectionCount(state), 3);
  state = finalize(state);

  assert.equal(state.mode, "scheduled");
  assert.equal(getSelectedMeals(state).length, 5);
  assert.equal(getScheduledWeek(state).length, 7);
  assert.equal(getScheduledWeek(state).find((entry) => entry.day === "Saturday").type, DAY_TYPES.LEFTOVERS);
  assert.equal(getScheduledWeek(state).find((entry) => entry.day === "Sunday").type, DAY_TYPES.EATING_OUT);
});

test("quick days prevent finalization without enough quick dinners", () => {
  const plan = createWeekPlan(DAY_TYPES.NO_MEAL);
  plan.Monday = DAY_TYPES.QUICK;
  plan.Tuesday = DAY_TYPES.NORMAL;

  const suggestions = [
    { categoryId: "q", categoryName: "Quick", mealName: "Quick Meal", mealKey: "q:Quick Meal", quick: true, bigMeal: false },
    ...Array.from({ length: 4 }, (_, index) => ({
      categoryId: `slow-${index}`,
      categoryName: "Slow",
      mealName: `Slow ${index}`,
      mealKey: `slow-${index}:Slow ${index}`,
      quick: false,
      bigMeal: false,
    })),
  ];

  let state = createMenuState(suggestions, plan);
  state = toggleRejection(state, state.candidates[0].id);
  state = toggleRejection(state, state.candidates[1].id);
  state = toggleRejection(state, state.candidates[2].id);

  assert.equal(state.mode, "choosing");
  assert.equal(getQuickMealShortfall(state), 1);

  state = toggleRejection(state, state.candidates[0].id);
  state = toggleRejection(state, state.candidates[3].id);

  assert.equal(state.mode, "scheduled");
  assert.equal(getQuickMealShortfall(state), 0);
});

test("guest days prevent finalization without a big meal", () => {
  const plan = createWeekPlan(DAY_TYPES.NO_MEAL);
  plan.Saturday = DAY_TYPES.BIG;
  plan.Sunday = DAY_TYPES.NORMAL;

  const suggestions = [
    { categoryId: "b", categoryName: "Big", mealName: "Big Meal", mealKey: "b:Big Meal", quick: false, bigMeal: true },
    ...Array.from({ length: 4 }, (_, index) => ({
      categoryId: `small-${index}`,
      categoryName: "Small",
      mealName: `Small ${index}`,
      mealKey: `small-${index}:Small ${index}`,
      quick: false,
      bigMeal: false,
    })),
  ];

  let state = createMenuState(suggestions, plan);
  state = toggleRejection(state, state.candidates[0].id);
  state = toggleRejection(state, state.candidates[1].id);
  state = toggleRejection(state, state.candidates[2].id);

  assert.equal(state.mode, "choosing");
  assert.equal(getBigMealShortfall(state), 1);

  state = toggleRejection(state, state.candidates[0].id);
  state = toggleRejection(state, state.candidates[3].id);

  assert.equal(state.mode, "scheduled");
  assert.equal(getBigMealShortfall(state), 0);
  assert.equal(getScheduledWeek(state).find((entry) => entry.day === "Saturday").meal.bigMeal, true);
});

test("one quick-and-big dinner cannot fill two separate requirement days", () => {
  const plan = createWeekPlan(DAY_TYPES.NO_MEAL);
  plan.Monday = DAY_TYPES.QUICK;
  plan.Saturday = DAY_TYPES.BIG;

  const suggestions = [
    { categoryId: "both", categoryName: "Both", mealName: "Both Meal", mealKey: "both:Both Meal", quick: true, bigMeal: true },
    { categoryId: "plain", categoryName: "Plain", mealName: "Plain Meal", mealKey: "plain:Plain Meal", quick: false, bigMeal: false },
    { categoryId: "big", categoryName: "Big", mealName: "Second Big Meal", mealKey: "big:Second Big Meal", quick: false, bigMeal: true },
    { categoryId: "extra1", categoryName: "Extra", mealName: "Extra 1", mealKey: "extra1:Extra 1", quick: false, bigMeal: false },
    { categoryId: "extra2", categoryName: "Extra", mealName: "Extra 2", mealKey: "extra2:Extra 2", quick: false, bigMeal: false },
  ];

  let state = createMenuState(suggestions, plan);
  state = toggleRejection(state, state.candidates[2].id);
  state = toggleRejection(state, state.candidates[3].id);
  state = toggleRejection(state, state.candidates[4].id);

  assert.equal(state.mode, "choosing");
  assert.equal(getQuickMealShortfall(state), 0);
  assert.equal(getBigMealShortfall(state), 0);
  assert.equal(getMealRequirementShortfall(state), 1);

  state = toggleRejection(state, state.candidates[2].id);
  state = toggleRejection(state, state.candidates[1].id);

  assert.equal(state.mode, "scheduled");
  assert.equal(getMealRequirementShortfall(state), 0);
});

test("quick-day assignments cannot be broken by a manual swap", () => {
  const plan = createWeekPlan(DAY_TYPES.NO_MEAL);
  plan.Monday = DAY_TYPES.QUICK;
  plan.Tuesday = DAY_TYPES.NORMAL;

  const suggestions = [
    { categoryId: "q", categoryName: "Quick", mealName: "Quick Meal", mealKey: "q:Quick Meal", quick: true, bigMeal: false },
    { categoryId: "s", categoryName: "Slow", mealName: "Slow Meal", mealKey: "s:Slow Meal", quick: false, bigMeal: false },
    { categoryId: "x1", categoryName: "Extra", mealName: "Extra 1", mealKey: "x1:Extra 1", quick: false, bigMeal: false },
    { categoryId: "x2", categoryName: "Extra", mealName: "Extra 2", mealKey: "x2:Extra 2", quick: false, bigMeal: false },
    { categoryId: "x3", categoryName: "Extra", mealName: "Extra 3", mealKey: "x3:Extra 3", quick: false, bigMeal: false },
  ];

  let state = createMenuState(suggestions, plan);
  state = toggleRejection(state, state.candidates[2].id);
  state = toggleRejection(state, state.candidates[3].id);
  state = toggleRejection(state, state.candidates[4].id);

  const quickMeal = getScheduledWeek(state).find((entry) => entry.day === "Monday").meal;
  assert.equal(canAssignMealDay(state, quickMeal.id, "Tuesday"), false);
  assert.deepEqual(assignMealDay(state, quickMeal.id, "Tuesday"), state);
});

test("guest-day assignments cannot be broken by a manual swap", () => {
  const plan = createWeekPlan(DAY_TYPES.NO_MEAL);
  plan.Saturday = DAY_TYPES.BIG;
  plan.Sunday = DAY_TYPES.NORMAL;

  const suggestions = [
    { categoryId: "b", categoryName: "Big", mealName: "Big Meal", mealKey: "b:Big Meal", quick: false, bigMeal: true },
    { categoryId: "s", categoryName: "Small", mealName: "Small Meal", mealKey: "s:Small Meal", quick: false, bigMeal: false },
    { categoryId: "x1", categoryName: "Extra", mealName: "Extra 1", mealKey: "x1:Extra 1", quick: false, bigMeal: false },
    { categoryId: "x2", categoryName: "Extra", mealName: "Extra 2", mealKey: "x2:Extra 2", quick: false, bigMeal: false },
    { categoryId: "x3", categoryName: "Extra", mealName: "Extra 3", mealKey: "x3:Extra 3", quick: false, bigMeal: false },
  ];

  let state = createMenuState(suggestions, plan);
  state = toggleRejection(state, state.candidates[2].id);
  state = toggleRejection(state, state.candidates[3].id);
  state = toggleRejection(state, state.candidates[4].id);

  const bigMeal = getScheduledWeek(state).find((entry) => entry.day === "Saturday").meal;
  assert.equal(canAssignMealDay(state, bigMeal.id, "Sunday"), false);
  assert.deepEqual(assignMealDay(state, bigMeal.id, "Sunday"), state);
});

test("marks uneaten meals as carryovers and keeps them out of eaten history", () => {
  let state = createMenuState(makeSuggestions(10), createWeekPlan());
  state = finalize(state);
  const selected = getSelectedMeals(state);

  state = toggleCarryover(state, selected[0].id);
  state = toggleCarryover(state, selected[1].id);

  assert.equal(getCarryoverMeals(state).length, 2);
  assert.equal(getEatenMeals(state).length, 5);
});

test("reopening a scheduled menu returns to choosing", () => {
  let state = createMenuState(makeSuggestions(10), createWeekPlan());
  state = finalize(state);
  state = reopenChoices(state);

  assert.equal(state.mode, "choosing");
  assert.deepEqual(state.dayAssignments, {});
});

test("zero-cook weeks preserve pending carryovers", () => {
  const carryover = {
    categoryId: "mexican",
    categoryName: "Mexican",
    mealName: "Tacos",
    mealKey: "mexican:Tacos",
    quick: true,
    bigMeal: true,
  };
  const plan = createWeekPlan(DAY_TYPES.NO_MEAL);
  const state = createMenuState([], plan, "2026-09-29T00:00:00Z", [carryover]);

  assert.equal(state.mode, "scheduled");
  assert.equal(getCarryoverMeals(state).length, 1);
  assert.equal(getScheduledWeek(state).every((entry) => entry.meal === null), true);
  assert.equal(isValidMenuState(state), true);
});

test("validates a scheduled seven-day plan", () => {
  let state = createMenuState(makeSuggestions(10), createWeekPlan());
  state = finalize(state);

  assert.equal(isValidMenuState(state), true);
  assert.deepEqual(getScheduledWeek(state).map((entry) => entry.day), DAYS);
  assert.equal(isValidMenuState({ ...state, carryoverIds: ["missing"] }), false);
});
