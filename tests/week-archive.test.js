import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWeekArchive,
  weekArchiveDocumentId,
  weekStartFromCreatedAt,
} from "../src/week-archive-model.js";
import { createWeekPlan } from "../src/state.js";

function scheduledState() {
  const weekPlan = createWeekPlan();
  weekPlan.Tuesday = { type: "leftovers", quick: false, bigMeal: false };
  weekPlan.Wednesday = { type: "eating-out", quick: false, bigMeal: false };
  weekPlan.Thursday = { type: "no-meal", quick: false, bigMeal: false };

  const taco = {
    id: "0:tacos",
    stableId: "tacos",
    categoryId: "mexican",
    categoryName: "Mexican",
    mealName: "Tacos",
    quick: true,
    bigMeal: false,
    description: "Weeknight tacos",
  };
  const pizza = {
    id: "1:pizza",
    stableId: "pizza",
    categoryId: "pizza",
    categoryName: "Pizza",
    mealName: "Homemade Pizza",
    quick: false,
    bigMeal: true,
  };

  return {
    version: 7,
    mode: "scheduled",
    createdAt: "2026-09-30T12:00:00.000Z",
    weekPlan,
    pinnedMeals: {},
    pendingCarryovers: [],
    candidates: [taco, pizza],
    rejectedIds: [],
    carryoverIds: ["1:pizza"],
    dayAssignments: {
      "0:tacos": "Monday",
      "1:pizza": "Friday",
    },
  };
}

test("week start is the Monday containing the planned date", () => {
  assert.equal(weekStartFromCreatedAt("2026-09-30T12:00:00.000Z"), "2026-09-28");
});

test("archive snapshot preserves scheduled meal identity and carryover status", () => {
  const archive = buildWeekArchive(scheduledState());

  assert.equal(archive.schemaVersion, 1);
  assert.equal(archive.weekStart, "2026-09-28");
  assert.equal(archive.scheduledDinnerCount, 2);
  assert.equal(archive.days.Monday.meal.stableId, "tacos");
  assert.equal(archive.days.Monday.meal.mealName, "Tacos");
  assert.equal(archive.days.Monday.meal.categoryName, "Mexican");
  assert.equal(archive.days.Monday.meal.carriedOver, false);
  assert.equal(archive.days.Friday.meal.carriedOver, true);
  assert.equal(archive.days.Tuesday.typeLabel, "Leftovers");
  assert.equal(archive.days.Wednesday.typeLabel, "Eating Out");
  assert.equal(archive.days.Thursday.typeLabel, "No Meal Planned");
});

test("archive document IDs are deterministic for a planned week", () => {
  assert.equal(
    weekArchiveDocumentId("2026-09-30T12:00:00.000Z"),
    "week-2026-09-30T12-00-00.000Z",
  );
});
