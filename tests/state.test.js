import test from "node:test";
import assert from "node:assert/strict";

import {
  DAYS,
  MAX_REJECTIONS,
  assignMealDay,
  clearRejections,
  createMenuState,
  getCarryoverMeals,
  getEatenMeals,
  getScheduledMeals,
  getSelectedMeals,
  isValidMenuState,
  reopenChoices,
  toggleCarryover,
  toggleRejection,
} from "../src/state.js";

const suggestions = Array.from({ length: 10 }, (_, index) => ({
  categoryId: `category-${index}`,
  categoryName: `Category ${index}`,
  mealName: `Meal ${index}`,
  mealKey: `category-${index}:Meal ${index}`,
}));

function finalizedState() {
  let state = createMenuState(suggestions, "2026-09-29T00:00:00.000Z");
  for (let index = 0; index < MAX_REJECTIONS; index += 1) {
    state = toggleRejection(state, state.candidates[index].id);
  }
  return state;
}

test("creates a persistent menu state from generated suggestions", () => {
  const state = createMenuState(suggestions, "2026-09-29T00:00:00.000Z");

  assert.equal(state.version, 3);
  assert.equal(state.candidates.length, 10);
  assert.equal(state.rejectedIds.length, 0);
  assert.equal(state.finalized, false);
  assert.equal(state.createdAt, "2026-09-29T00:00:00.000Z");
  assert.equal(new Set(state.candidates.map((candidate) => candidate.id)).size, 10);
});

test("finalizes automatically after three rejected meals and assigns seven days", () => {
  const state = finalizedState();

  assert.equal(state.rejectedIds.length, 3);
  assert.equal(state.finalized, true);
  assert.equal(getSelectedMeals(state).length, 7);
  assert.deepEqual(getScheduledMeals(state).map((entry) => entry.day), DAYS);
});

test("does not allow more than three rejected meals", () => {
  const state = finalizedState();
  const unchanged = toggleRejection(state, state.candidates[4].id);
  assert.deepEqual(unchanged, state);
});

test("reopening a finalized menu allows a rejected meal to be restored", () => {
  let state = finalizedState();
  state = reopenChoices(state);
  state = toggleRejection(state, state.candidates[0].id);

  assert.equal(state.finalized, false);
  assert.equal(state.rejectedIds.length, 2);
  assert.deepEqual(state.dayAssignments, {});
});

test("clears all rejected meals", () => {
  let state = createMenuState(suggestions);
  state = toggleRejection(state, state.candidates[0].id);
  state = toggleRejection(state, state.candidates[1].id);
  state = clearRejections(state);

  assert.equal(state.rejectedIds.length, 0);
  assert.equal(state.finalized, false);
});

test("marks uneaten meals as carryovers and keeps them out of eaten history", () => {
  let state = finalizedState();
  const selected = getSelectedMeals(state);

  state = toggleCarryover(state, selected[0].id);
  state = toggleCarryover(state, selected[1].id);

  assert.equal(getCarryoverMeals(state).length, 2);
  assert.equal(getEatenMeals(state).length, 5);
});

test("assigning a meal to an occupied day swaps the two meals", () => {
  let state = finalizedState();
  const schedule = getScheduledMeals(state);
  const mondayMeal = schedule[0].meal;
  const tuesdayMeal = schedule[1].meal;

  state = assignMealDay(state, mondayMeal.id, "Tuesday");

  assert.equal(state.dayAssignments[mondayMeal.id], "Tuesday");
  assert.equal(state.dayAssignments[tuesdayMeal.id], "Monday");
  assert.equal(new Set(Object.values(state.dayAssignments)).size, 7);
});

test("validates persisted menu state", () => {
  const state = finalizedState();
  assert.equal(isValidMenuState(state), true);
  assert.equal(isValidMenuState({ ...state, carryoverIds: ["missing"] }), false);
  assert.equal(
    isValidMenuState({
      ...state,
      dayAssignments: {
        ...state.dayAssignments,
        [getSelectedMeals(state)[0].id]: "Notaday",
      },
    }),
    false,
  );
});
