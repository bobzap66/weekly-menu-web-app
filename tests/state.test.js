import test from "node:test";
import assert from "node:assert/strict";

import {
  DAYS,
  DAY_TYPES,
  STATE_VERSION,
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
  reopenWeekSetup,
  resumeWeekSetup,
  setDayRequirement,
  setDayType,
  toggleCarryover,
  toggleKeepOnReroll,
  toggleRejection,
} from "../src/state.js";

function makeSuggestions(count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    stableId: `meal-${index}`,
    categoryId: `category-${index}`,
    categoryName: `Category ${index}`,
    mealName: `Meal ${index}`,
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

  assert.equal(state.version, STATE_VERSION);
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

test("marking a meal to keep on reroll toggles and rejecting it clears the mark", () => {
  let state = createMenuState(makeSuggestions(8), createWeekPlan());
  const candidateId = state.candidates[0].id;
  state = toggleKeepOnReroll(state, candidateId);
  assert.deepEqual(state.keepOnRerollIds, [candidateId]);
  state = toggleRejection(state, candidateId);
  assert.deepEqual(state.keepOnRerollIds, []);
});

test("pinned, rejected, and carryover candidates cannot be marked to keep on reroll", () => {
  let state = createMenuState(makeSuggestions(8), createWeekPlan());
  const candidateId = state.candidates[0].id;
  state = { ...state, rejectedIds: [candidateId] };
  assert.equal(toggleKeepOnReroll(state, candidateId), state);
  state = { ...state, rejectedIds: [], carryoverIds: [candidateId] };
  assert.equal(toggleKeepOnReroll(state, candidateId), state);
  const pinnedState = createMenuState(
    [{ ...makeSuggestions(1)[0], pinnedDay: "Monday" }, ...makeSuggestions(7).slice(1)],
    createWeekPlan(),
  );
  assert.equal(toggleKeepOnReroll(pinnedState, pinnedState.candidates[0].id), pinnedState);
});

test("a day checked quick and big requires one meal carrying both tags", () => {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  planning = setDayType(planning, "Saturday", DAY_TYPES.NORMAL);
  planning = setDayRequirement(planning, "Saturday", "quick", true);
  planning = setDayRequirement(planning, "Saturday", "bigMeal", true);
  const plan = planning.weekPlan;

  const suggestions = [
    { stableId: "both-meal", categoryId: "both", categoryName: "Both", mealName: "Both Meal", quick: true, bigMeal: true },
    { stableId: "quick-meal", categoryId: "quick", categoryName: "Quick", mealName: "Quick Meal", quick: true, bigMeal: false },
    { stableId: "big-meal", categoryId: "big", categoryName: "Big", mealName: "Big Meal", quick: false, bigMeal: true },
    { stableId: "plain-1", categoryId: "plain1", categoryName: "Plain", mealName: "Plain 1", quick: false, bigMeal: false },
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
    { stableId: "both-meal", categoryId: "both", categoryName: "Both", mealName: "Both Meal", quick: true, bigMeal: true },
    { stableId: "plain-meal", categoryId: "plain", categoryName: "Plain", mealName: "Plain Meal", quick: false, bigMeal: false },
    { stableId: "second-big", categoryId: "big", categoryName: "Big", mealName: "Second Big Meal", quick: false, bigMeal: true },
    { stableId: "extra-1", categoryId: "extra1", categoryName: "Extra", mealName: "Extra 1", quick: false, bigMeal: false },
    { stableId: "extra-2", categoryId: "extra2", categoryName: "Extra", mealName: "Extra 2", quick: false, bigMeal: false },
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
    { stableId: "both-meal", categoryId: "both", categoryName: "Both", mealName: "Both Meal", quick: true, bigMeal: true },
    { stableId: "plain-meal", categoryId: "plain", categoryName: "Plain", mealName: "Plain Meal", quick: false, bigMeal: false },
    { stableId: "extra-1", categoryId: "x1", categoryName: "Extra", mealName: "Extra 1", quick: false, bigMeal: false },
    { stableId: "extra-2", categoryId: "x2", categoryName: "Extra", mealName: "Extra 2", quick: false, bigMeal: false },
    { stableId: "extra-3", categoryId: "x3", categoryName: "Extra", mealName: "Extra 3", quick: false, bigMeal: false },
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

test("reopening week setup preserves choices, rejections, carryovers, and assigned days", () => {
  const suggestions = makeSuggestions(10);
  suggestions[0] = {
    ...suggestions[0],
    carriedOver: true,
    description: "Previous week's dinner",
  };

  let state = createMenuState(suggestions, createWeekPlan());
  state = finalize(state);
  const extraCarryover = getSelectedMeals(state)[1];
  state = toggleCarryover(state, extraCarryover.id);
  const candidateIds = state.candidates.map((candidate) => candidate.id);
  const rejectedIds = [...state.rejectedIds];
  const assignments = { ...state.dayAssignments };
  state = reopenWeekSetup(state);

  assert.equal(state.mode, "setup");
  assert.equal(state.candidates.length, suggestions.length);
  assert.deepEqual(state.candidates.map((candidate) => candidate.id), candidateIds);
  assert.deepEqual(state.rejectedIds, rejectedIds);
  assert.deepEqual(state.candidates.filter((candidate) => candidate.pinnedDay).map((candidate) => candidate.pinnedDay).sort(), Object.values(assignments).sort());
  assert.equal(Object.keys(state.dayAssignments).length, 0);
  assert.equal(state.pendingCarryovers.length, 0);
  assert.equal(state.carryoverIds.includes(extraCarryover.id), true);
  assert.equal(isValidMenuState(state), true);
});

test("editing a dinner day unpins its choice and returning keeps prior narrowing work", () => {
  let state = createMenuState(makeSuggestions(10), fiveDinnerPlan());
  state = finalize(state);
  const preservedRejected = [...state.rejectedIds];
  const changedDay = state.dayAssignments[state.candidates.find((candidate) => !state.rejectedIds.includes(candidate.id)).id];
  state = reopenWeekSetup(state);
  state = setDayType(state, changedDay, DAY_TYPES.EATING_OUT);

  const unpinned = state.candidates.find((candidate) => candidate.pinnedDay !== undefined && candidate.pinnedDay === changedDay);
  assert.equal(unpinned, undefined);
  assert.equal(state.candidates.some((candidate) => candidate.pinnedDay === undefined && !preservedRejected.includes(candidate.id)), true);

  state = resumeWeekSetup(state);
  assert.equal(state.weekPlan[changedDay].type, DAY_TYPES.EATING_OUT);
  assert.equal(state.candidates.length, 10);
  assert.equal(state.rejectedIds.length, 5);
  assert.equal(state.mode, "choosing");
  assert.equal(isValidMenuState(state), true);
});

test("adding a dinner slot accepts only the incremental candidate and preserves removals", () => {
  let state = createMenuState(makeSuggestions(10), fiveDinnerPlan());
  state = finalize(state);
  const rejected = [...state.rejectedIds];
  state = reopenWeekSetup(state);
  state = setDayType(state, "Saturday", DAY_TYPES.NORMAL);
  const additional = { ...makeSuggestions(11)[10], stableId: "new-meal", categoryId: "new-category" };
  state = resumeWeekSetup(state, [additional]);

  assert.equal(state.candidates.length, 11);
  assert.deepEqual(state.rejectedIds, rejected);
  assert.equal(state.weekPlan.Saturday.type, DAY_TYPES.NORMAL);
  assert.equal(getRequiredRejectionCount(state), 5);
  assert.equal(state.mode, "scheduled");
  assert.equal(Object.keys(state.dayAssignments).length, 6);
  assert.equal(isValidMenuState(state), true);
});

test("zero-cook weeks preserve pending carryovers", () => {
  const carryover = {
    stableId: "meal-tacos",
    categoryId: "mexican",
    categoryName: "Mexican",
    mealName: "Tacos",
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

test("planner state rejects meals without stable IDs", () => {
  assert.throws(
    () => createPlanningState([{ categoryId: "mexican", mealName: "Tacos" }]),
    /stable IDs/,
  );
  assert.throws(
    () => createMenuState([{ categoryId: "mexican", mealName: "Tacos" }], createWeekPlan()),
    /stable IDs/,
  );
});

test("validates a scheduled seven-day plan", () => {
  let state = createMenuState(makeSuggestions(10), createWeekPlan());
  state = finalize(state);

  assert.equal(isValidMenuState(state), true);
  assert.deepEqual(getScheduledWeek(state).map((entry) => entry.day), DAYS);
  assert.equal(isValidMenuState({ ...state, carryoverIds: ["missing"] }), false);
  assert.equal(isValidMenuState({ ...state, version: STATE_VERSION - 1 }), false);
});


