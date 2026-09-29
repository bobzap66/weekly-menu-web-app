import test from "node:test";
import assert from "node:assert/strict";

import {
  addWeekToHistory,
  createHistory,
  getHistoryWeightMultiplier,
  getMealRecency,
  isValidHistory,
} from "../src/history.js";

test("records a finalized week once by stable meal ID", () => {
  const meals = [
    { stableId: "meal-tacos" },
    { stableId: "meal-ribs" },
  ];

  let history = addWeekToHistory(createHistory(), meals, "week-1", "2026-09-29T00:00:00Z");
  history = addWeekToHistory(history, meals, "week-1", "2026-09-29T00:00:00Z");

  assert.equal(history.weeks.length, 1);
  assert.deepEqual(history.weeks[0].mealIds, ["meal-tacos", "meal-ribs"]);
  assert.equal(isValidHistory(history), true);
});

test("recent meals recover toward normal weight over six weeks", () => {
  const stableId = "meal-tacos";
  const history = {
    version: 2,
    weeks: [
      { weekId: "0", createdAt: "", mealIds: [stableId] },
      { weekId: "1", createdAt: "", mealIds: [] },
      { weekId: "2", createdAt: "", mealIds: [] },
      { weekId: "3", createdAt: "", mealIds: [] },
      { weekId: "4", createdAt: "", mealIds: [] },
      { weekId: "5", createdAt: "", mealIds: [] },
    ],
  };

  assert.equal(getMealRecency(stableId, history), 0);
  assert.equal(getHistoryWeightMultiplier(stableId, history), 0.15);

  const oneWeekOlder = {
    ...history,
    weeks: [
      { weekId: "new", createdAt: "", mealIds: [] },
      ...history.weeks,
    ],
  };

  assert.equal(getMealRecency(stableId, oneWeekOlder), 1);
  assert.equal(getHistoryWeightMultiplier(stableId, oneWeekOlder), 0.35);

  const oldHistory = {
    version: 2,
    weeks: Array.from({ length: 7 }, (_, index) => ({
      weekId: String(index),
      createdAt: "",
      mealIds: index === 6 ? [stableId] : [],
    })),
  };

  assert.equal(getHistoryWeightMultiplier(stableId, oldHistory), 1);
});

test("old name-based history is deliberately rejected", () => {
  const oldHistory = {
    version: 1,
    weeks: [
      {
        weekId: "old",
        createdAt: "2026-09-22T00:00:00Z",
        mealKeys: ["mexican:Tacos"],
      },
    ],
  };

  assert.equal(isValidHistory(oldHistory), false);
});
