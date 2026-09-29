import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_REJECTIONS,
  clearRejections,
  createMenuState,
  getSelectedMeals,
  isValidMenuState,
  reopenChoices,
  toggleRejection,
} from "../src/state.js";

const suggestions = Array.from({ length: 10 }, (_, index) => ({
  categoryId: `category-${index}`,
  categoryName: `Category ${index}`,
  mealName: `Meal ${index}`,
}));

test("creates a persistent menu state from generated suggestions", () => {
  const state = createMenuState(suggestions, "2026-09-29T00:00:00.000Z");

  assert.equal(state.candidates.length, 10);
  assert.equal(state.rejectedIds.length, 0);
  assert.equal(state.finalized, false);
  assert.equal(state.createdAt, "2026-09-29T00:00:00.000Z");
  assert.equal(new Set(state.candidates.map((candidate) => candidate.id)).size, 10);
});

test("finalizes automatically after three rejected meals", () => {
  let state = createMenuState(suggestions);

  for (let index = 0; index < MAX_REJECTIONS; index += 1) {
    state = toggleRejection(state, state.candidates[index].id);
  }

  assert.equal(state.rejectedIds.length, 3);
  assert.equal(state.finalized, true);
  assert.equal(getSelectedMeals(state).length, 7);
});

test("does not allow more than three rejected meals", () => {
  let state = createMenuState(suggestions);

  for (let index = 0; index < MAX_REJECTIONS; index += 1) {
    state = toggleRejection(state, state.candidates[index].id);
  }

  const unchanged = toggleRejection(state, state.candidates[4].id);
  assert.deepEqual(unchanged, state);
});

test("reopening a finalized menu allows a rejected meal to be restored", () => {
  let state = createMenuState(suggestions);
  for (let index = 0; index < MAX_REJECTIONS; index += 1) {
    state = toggleRejection(state, state.candidates[index].id);
  }

  state = reopenChoices(state);
  state = toggleRejection(state, state.candidates[0].id);

  assert.equal(state.finalized, false);
  assert.equal(state.rejectedIds.length, 2);
});

test("clears all rejected meals", () => {
  let state = createMenuState(suggestions);
  state = toggleRejection(state, state.candidates[0].id);
  state = toggleRejection(state, state.candidates[1].id);
  state = clearRejections(state);

  assert.equal(state.rejectedIds.length, 0);
  assert.equal(state.finalized, false);
});

test("validates persisted menu state", () => {
  const state = createMenuState(suggestions);
  assert.equal(isValidMenuState(state), true);
  assert.equal(isValidMenuState({ ...state, rejectedIds: ["missing"] }), false);
});
