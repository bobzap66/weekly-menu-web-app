import test from "node:test";
import assert from "node:assert/strict";

import { menuData } from "../src/data.js";
import { createHistory } from "../src/history.js";
import { buildNextWeekSuggestions } from "../src/week.js";

test("carries uneaten meals into the next ten candidates", () => {
  const carryovers = [
    {
      categoryId: "mexican",
      categoryName: "Mexican",
      mealName: "Tacos",
      mealKey: "mexican:Tacos",
    },
    {
      categoryId: "bbq",
      categoryName: "BBQ",
      mealName: "Ribs",
      mealKey: "bbq:Ribs",
    },
  ];

  const suggestions = buildNextWeekSuggestions(menuData, createHistory(), carryovers, () => 0.42);

  assert.equal(suggestions.length, 10);
  assert.equal(suggestions[0].mealName, "Tacos");
  assert.equal(suggestions[1].mealName, "Ribs");
  assert.equal(suggestions[0].carriedOver, true);
  assert.equal(suggestions[1].carriedOver, true);
  assert.equal(suggestions.filter((item) => item.categoryId === "mexican").length, 1);
  assert.equal(suggestions.filter((item) => item.categoryId === "bbq").length, 1);
});
