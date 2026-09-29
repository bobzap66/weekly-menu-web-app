import test from "node:test";
import assert from "node:assert/strict";

import { menuData } from "../src/data.js";
import { createHistory } from "../src/history.js";
import {
  DAY_TYPES,
  createWeekPlan,
} from "../src/state.js";
import { buildNextWeekSuggestions } from "../src/week.js";

test("a five-dinner week generates eight candidates", () => {
  const plan = createWeekPlan();
  plan.Saturday = DAY_TYPES.LEFTOVERS;
  plan.Sunday = DAY_TYPES.EATING_OUT;

  const suggestions = buildNextWeekSuggestions(
    menuData,
    createHistory(),
    [],
    plan,
    () => 0.42,
  );

  assert.equal(suggestions.length, 8);
  assert.equal(new Set(suggestions.map((item) => item.categoryId)).size, 8);
});

test("carries uneaten meals into a variable candidate pool", () => {
  const plan = createWeekPlan();
  plan.Sunday = DAY_TYPES.LEFTOVERS;

  const carryovers = [
    {
      categoryId: "mexican",
      categoryName: "Mexican",
      mealName: "Tacos",
      mealKey: "mexican:Tacos",
      quick: true,
    },
    {
      categoryId: "bbq",
      categoryName: "BBQ",
      mealName: "Ribs",
      mealKey: "bbq:Ribs",
      quick: false,
    },
  ];

  const suggestions = buildNextWeekSuggestions(
    menuData,
    createHistory(),
    carryovers,
    plan,
    () => 0.42,
  );

  assert.equal(suggestions.length, 9);
  assert.equal(suggestions[0].mealName, "Tacos");
  assert.equal(suggestions[1].mealName, "Ribs");
  assert.equal(suggestions[0].carriedOver, true);
  assert.equal(suggestions[1].carriedOver, true);
  assert.equal(suggestions.filter((item) => item.categoryId === "mexican").length, 1);
  assert.equal(suggestions.filter((item) => item.categoryId === "bbq").length, 1);
});

test("quick meal days force enough quick candidates to be generated", () => {
  const plan = createWeekPlan(DAY_TYPES.NO_MEAL);
  plan.Monday = DAY_TYPES.QUICK;
  plan.Tuesday = DAY_TYPES.QUICK;
  plan.Wednesday = DAY_TYPES.NORMAL;

  const suggestions = buildNextWeekSuggestions(
    menuData,
    createHistory(),
    [],
    plan,
    () => 0.42,
  );

  assert.equal(suggestions.length, 6);
  assert.equal(suggestions.filter((item) => item.quick).length >= 2, true);
});

test("a no-cook week does not generate dinner candidates", () => {
  const plan = createWeekPlan(DAY_TYPES.NO_MEAL);
  const suggestions = buildNextWeekSuggestions(
    menuData,
    createHistory(),
    [],
    plan,
    () => 0.42,
  );

  assert.deepEqual(suggestions, []);
});
