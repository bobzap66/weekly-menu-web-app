import test from "node:test";
import assert from "node:assert/strict";

import {
  addWeekToHistory,
  createHistory,
  getHistoryWeightMultiplier,
  getMealRecency,
  isValidHistory,
} from "../src/history.js";

test("records a finalized week once", () => {
  const meals = [
    { categoryId: "mexican", mealName: "Tacos", mealKey: "mexican:Tacos" },
    { categoryId: "bbq", mealName: "Ribs", mealKey: "bbq:Ribs" },
  ];

  let history = addWeekToHistory(createHistory(), meals, "week-1", "2026-09-29T00:00:00Z");
  history = addWeekToHistory(history, meals, "week-1", "2026-09-29T00:00:00Z");

  assert.equal(history.weeks.length, 1);
  assert.deepEqual(history.weeks[0].mealKeys, ["mexican:Tacos", "bbq:Ribs"]);
  assert.equal(isValidHistory(history), true);
});

test("recent meals recover toward normal weight over six weeks", () => {
  const key = "mexican:Tacos";
  const history = {
    version: 1,
    weeks: [
      { weekId: "0", createdAt: "", mealKeys: [key] },
      { weekId: "1", createdAt: "", mealKeys: [] },
      { weekId: "2", createdAt: "", mealKeys: [] },
      { weekId: "3", createdAt: "", mealKeys: [] },
      { weekId: "4", createdAt: "", mealKeys: [] },
      { weekId: "5", createdAt: "", mealKeys: [] },
    ],
  };

  assert.equal(getMealRecency(key, history), 0);
  assert.equal(getHistoryWeightMultiplier(key, history), 0.15);

  const sixWeeksOld = {
    ...history,
    weeks: [
      { weekId: "new", createdAt: "", mealKeys: [] },
      ...history.weeks,
    ],
  };

  assert.equal(getMealRecency(key, sixWeeksOld), 1);
  assert.equal(getHistoryWeightMultiplier(key, sixWeeksOld), 0.35);

  const oldHistory = {
    version: 1,
    weeks: Array.from({ length: 7 }, (_, index) => ({
      weekId: String(index),
      createdAt: "",
      mealKeys: index === 6 ? [key] : [],
    })),
  };

  assert.equal(getHistoryWeightMultiplier(key, oldHistory), 1);
});
