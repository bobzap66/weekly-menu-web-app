import test from "node:test";
import assert from "node:assert/strict";

import {
  DAYS,
  DAY_TYPES,
  assignMealDay,
  canAssignMealDay,
  countBigMealDays,
  countCombinedMealDays,
  countMealDays,
  countQuickMealDays,
  createMenuState,
  createPlanningState,
  createWeekPlan,
  getBigMealShortfall,
  getCarryoverMeals,
  getCombinedMealShortfall,
  getEatenMeals,
  getMealRequirementShortfall,
  getQuickMealShortfall,
  getRequiredRejectionCount,
  getScheduledWeek,
  getSelectedMeals,
  isValidMenuState,
  reopenChoices,
  setDayRequirement,
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
    bigMeal: index >= 2 && index < 8,
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

test("planning state supports non-meal types plus independent quick and big requirements", () => {
  let state = createPlanningState();
  state = setDayRequirement(state, "Tuesday", "quick", true);
  state = setDayRequirement(state, "Tuesday", "bigMeal", true);
  state = setDayType(state, "Friday", DAY_TYPES.LEFTOVERS);
  state = setDayType(state, "Saturday", DAY_TYPES.EATING_OUT);
  state = setDayType(state, "Sunday", DAY_TYPES.NO_MEAL);

  assert.equal(state.mode, "setup");
  assert.equal(countMealDays(state.weekPlan), 4);
  assert.equal(countQuickMealDays(state.weekPlan), 1);
  assert.equal(countBigMealDays(state.weekPlan), 1);
  assert.equal(countCombinedMealDays(state.weekPlan), 1);
  assert.equal(state.weekPlan.Tuesday.quick, true);
  assert.equal(state.weekPlan.Tuesday.bigMeal, true);
  assert.equal(isValidMenuState(state), true);
});

test("switching a dinner to a non-meal day clears meal requirements", () => {
  let state = createPlanningState();
  state = setDayRequirement(state, "Saturday", "quick", true);
  state = setDayRequirement(state, "Saturday", "bigMeal", true);
  state = setDayType(state, "Saturday", DAY_TYPES.LEFTOVERS);

  assert.deepEqual(state.weekPlan.Saturday, {
    type: DAY_TYPES.LEFTOVERS,
    quick: false,
    bigMeal: false,
  });
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

test("a day checked quick and big requires one meal carrying both tags", () => {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  planning = setDayType(planning, "Saturday", DAY_TYPES.NORMAL);
  planning = setDayRequirement(planning, "Saturday", "quick", true);
  planning = setDayRequirement(planning, "Saturday", "bigMeal", true);
  const plan = planning.weekPlan;

  const suggestions = [
    { categoryId: "both", categoryName: "Both", mealName: "Both Meal", mealKey: "both:Both Meal", quick: true, bigMeal: true },
    { categoryId: "quick", categoryName: "Quick", mealName: "Quick Meal", mealKey: "quick:Quick Meal", quick: true, bigMeal: false },
    { categoryId: "big", categoryName: "Big", mealName: "Big Meal", mealKey: "big:Big Meal", quick: false, bigMeal: true },
    { categoryId: "plain1", categoryName: "Plain", mealName: "Plain 1", mealKey: "plain1:Plain 1", quick: false, bigMeal: false },
  ];

  let state = createMenuState(suggestions, plan);
  state = toggleRejection(state, state.candidates[0].id);
  state = toggleRejection(state, state.candidates[3].id);
  state = toggleRejection(state, state.candidates[2].id);

  assert.equal(state.mode, "choosing");
  assert.equal(getQuickMealShortfall(state), 0);
  assert.equal(getBigMealShortfall(state), 1);
  assert.equal(getCombinedMealShortfall(state), 1);
  assert.equal(getMealRequirementShortfall(state), 1);

  state = toggleRejection(state, state.candidates[0].id);
  state = toggleRejection(state, state.candidates[1].id);

  assert.equal(state.mode, "scheduled");
  const saturday = getScheduledWeek(state).find((entry) => entry.day === "Saturday");
  assert.equal(saturday.meal.quick, true);
  assert.equal(saturday.meal.bigMeal, true);
  assert.equal(saturday.quickRequired, true);
  assert.equal(saturday.bigMealRequired, true);
});

test("separate quick and guest days still require separate qualifying meals", () => {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  planning = setDayType(planning, "Monday", DAY_TYPES.NORMAL);
  planning = setDayType(planning, "Saturday", DAY_TYPES.NORMAL);
  planning = setDayRequirement(planning, "Monday", "quick", true);
  planning = setDayRequirement(planning, "Saturday", "bigMeal", true);
  const plan = planning.weekPlan;

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
  assert.equal(getMealRequirementShortfall(state), 1);

  state = toggleRejection(state, state.candidates[2].id);
  state = toggleRejection(state, state.candidates[1].id);
  assert.equal(state.mode, "scheduled");
});

test("manual swaps cannot break a combined quick-and-big day", () => {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  planning = setDayType(planning, "Saturday", DAY_TYPES.NORMAL);
  planning = setDayType(planning, "Sunday", DAY_TYPES.NORMAL);
  planning = setDayRequirement(planning, "Saturday", "quick", true);
  planning = setDayRequirement(planning, "Saturday", "bigMeal", true);
  const plan = planning.weekPlan;

  const suggestions = [
    { categoryId: "both", categoryName: "Both", mealName: "Both Meal", mealKey: "both:Both Meal", quick: true, bigMeal: true },
    { categoryId: "plain", categoryName: "Plain", mealName: "Plain Meal", mealKey: "plain:Plain Meal", quick: false, bigMeal: false },
    { categoryId: "x1", categoryName: "Extra", mealName: "Extra 1", mealKey: "x1:Extra 1", quick: false, bigMeal: false },
    { categoryId: "x2", categoryName: "Extra", mealName: "Extra 2", mealKey: "x2:Extra 2", quick: false, bigMeal: false },
    { categoryId: "x3", categoryName: "Extra", mealName: "Extra 3", mealKey: "x3:Extra 3", quick: false, bigMeal: false },
  ];

  let state = createMenuState(suggestions, plan);
  state = toggleRejection(state, state.candidates[2].id);
  state = toggleRejection(state, state.candidates[3].id);
  state = toggleRejection(state, state.candidates[4].id);

  const bothMeal = getScheduledWeek(state).find((entry) => entry.day === "Saturday").meal;
  assert.equal(canAssignMealDay(state, bothMeal.id, "Sunday"), false);
  assert.deepEqual(assignMealDay(state, bothMeal.id, "Sunday"), state);
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
