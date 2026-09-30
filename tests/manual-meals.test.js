import test from "node:test";
import assert from "node:assert/strict";

import {
  getManualMealGroups,
  replaceScheduledMeal,
} from "../src/manual-meals.js";

const menuData = {
  categories: [
    {
      id: "weeknight",
      name: "Weeknight",
      meals: [
        { stableId: "tacos", name: "Tacos", quick: true, bigMeal: false },
        { stableId: "stew", name: "Stew", quick: false, bigMeal: true },
        { stableId: "pizza", name: "Pizza", quick: true, bigMeal: true },
      ],
    },
    {
      id: "pasta",
      name: "Pasta",
      meals: [
        { stableId: "lasagna", name: "Lasagna", quick: false, bigMeal: true },
      ],
    },
  ],
};

function scheduledState(dayPlan = { type: "normal", quick: false, bigMeal: false }) {
  return {
    version: 7,
    mode: "scheduled",
    createdAt: "2026-09-30T00:00:00Z",
    weekPlan: {
      Monday: dayPlan,
    },
    pendingCarryovers: [],
    candidates: [
      {
        id: "0:old-meal",
        stableId: "old-meal",
        categoryId: "old",
        categoryName: "Old",
        mealName: "Old Meal",
        quick: true,
        bigMeal: true,
      },
    ],
    rejectedIds: [],
    carryoverIds: ["0:old-meal"],
    dayAssignments: {
      "0:old-meal": "Monday",
    },
  };
}

test("manual meal groups only include meals that satisfy the day's requirements", () => {
  const groups = getManualMealGroups(menuData, {
    type: "normal",
    quick: true,
    bigMeal: true,
  });

  assert.deepEqual(groups.map((group) => group.name), ["Weeknight"]);
  assert.deepEqual(groups[0].meals.map((meal) => meal.mealName), ["Pizza"]);
});

test("manual meal replacement keeps the scheduled slot and clears carryover status", () => {
  const state = scheduledState();
  const replacement = getManualMealGroups(menuData, state.weekPlan.Monday)[0].meals[0];
  const next = replaceScheduledMeal(state, "0:old-meal", replacement);

  assert.equal(next.dayAssignments["0:old-meal"], "Monday");
  assert.equal(next.candidates[0].id, "0:old-meal");
  assert.equal(next.candidates[0].stableId, "tacos");
  assert.equal(next.candidates[0].mealName, "Tacos");
  assert.deepEqual(next.carryoverIds, []);
});

test("manual meal replacement refuses a meal that breaks Quick or Big Meal requirements", () => {
  const state = scheduledState({ type: "normal", quick: true, bigMeal: true });
  const incompatible = {
    stableId: "tacos",
    categoryId: "weeknight",
    categoryName: "Weeknight",
    mealName: "Tacos",
    quick: true,
    bigMeal: false,
  };

  assert.equal(replaceScheduledMeal(state, "0:old-meal", incompatible), state);
});
