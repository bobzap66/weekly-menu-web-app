import test from "node:test";
import assert from "node:assert/strict";

import { menuData } from "../src/data.js";
import { createHistory } from "../src/history.js";
import {
  DAY_TYPES,
  createPlanningState,
  createWeekPlan,
  setDayRequirement,
  setDayType,
} from "../src/state.js";
import { buildNextWeekSuggestions } from "../src/week.js";

function fiveDinnerPlan() {
  let planning = createPlanningState();
  planning = setDayType(planning, "Saturday", DAY_TYPES.LEFTOVERS);
  planning = setDayType(planning, "Sunday", DAY_TYPES.EATING_OUT);
  return planning.weekPlan;
}

function combinedSaturdayPlan() {
  let planning = createPlanningState([], createWeekPlan(DAY_TYPES.NO_MEAL));
  planning = setDayType(planning, "Saturday", DAY_TYPES.NORMAL);
  planning = setDayRequirement(planning, "Saturday", "quick", true);
  planning = setDayRequirement(planning, "Saturday", "bigMeal", true);
  return planning.weekPlan;
}

test("a five-dinner week generates eight candidates", () => {
  const suggestions = buildNextWeekSuggestions(
    menuData,
    createHistory(),
    [],
    fiveDinnerPlan(),
    () => 0.42,
  );

  assert.equal(suggestions.length, 8);
  assert.equal(new Set(suggestions.map((item) => item.categoryId)).size, 8);
});

test("carries uneaten meals into a variable candidate pool", () => {
  const carryovers = [
    {
      categoryId: "mexican",
      categoryName: "Mexican",
      mealName: "Tacos",
      mealKey: "mexican:Tacos",
      quick: true,
      bigMeal: true,
      description: "Taco night",
    },
    {
      categoryId: "bbq",
      categoryName: "BBQ",
      mealName: "Ribs",
      mealKey: "bbq:Ribs",
      quick: false,
      bigMeal: true,
    },
  ];

  const suggestions = buildNextWeekSuggestions(
    menuData,
    createHistory(),
    carryovers,
    fiveDinnerPlan(),
    () => 0.42,
  );

  assert.equal(suggestions.length, 8);
  assert.equal(suggestions[0].mealName, "Tacos");
  assert.equal(suggestions[0].description, "Taco night");
  assert.equal(suggestions[1].mealName, "Ribs");
  assert.equal(suggestions[0].carriedOver, true);
  assert.equal(suggestions[1].carriedOver, true);
});

test("combined quick and guest requirements force a both-tagged candidate", () => {
  const suggestions = buildNextWeekSuggestions(
    menuData,
    createHistory(),
    [],
    combinedSaturdayPlan(),
    () => 0.42,
  );

  assert.equal(suggestions.length, 4);
  assert.equal(suggestions[0].quick, true);
  assert.equal(suggestions[0].bigMeal, true);
});

test("a both-tagged carryover can satisfy a combined day", () => {
  const carryover = {
    categoryId: "mexican",
    categoryName: "Mexican",
    mealName: "Tacos",
    mealKey: "mexican:Tacos",
    quick: true,
    bigMeal: true,
  };

  const suggestions = buildNextWeekSuggestions(
    menuData,
    createHistory(),
    [carryover],
    combinedSaturdayPlan(),
    () => 0.42,
  );

  assert.equal(suggestions.length, 4);
  assert.equal(suggestions[0].carriedOver, true);
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
