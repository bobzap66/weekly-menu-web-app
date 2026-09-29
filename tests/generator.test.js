import test from "node:test";
import assert from "node:assert/strict";

import { menuData } from "../src/data.js";
import { chooseWeighted, generateMenu } from "../src/generator.js";

test("generates ten suggestions from ten distinct categories", () => {
  const results = generateMenu(menuData, () => 0.42);
  const categoryIds = results.map((result) => result.categoryId);

  assert.equal(results.length, 10);
  assert.equal(new Set(categoryIds).size, 10);
});

test("every menu result declares whether it is a quick meal", () => {
  for (const category of menuData.categories) {
    if (category.meals) {
      for (const meal of category.meals) {
        assert.equal(
          typeof meal.quick,
          "boolean",
          `${category.name} / ${meal.name} must declare quick: true or false`,
        );
      }
    } else {
      assert.equal(
        typeof category.quick,
        "boolean",
        `${category.name} must declare quick: true or false`,
      );
    }
  }
});

test("can require a minimum number of quick candidates", () => {
  const results = generateMenu(menuData, () => 0.42, null, {
    candidateCount: 6,
    minimumQuickCount: 3,
  });

  assert.equal(results.length, 6);
  assert.equal(results.filter((result) => result.quick).length >= 3, true);
});

test("weighted selection respects item boundaries", () => {
  const items = [
    { name: "one", weight: 1 },
    { name: "three", weight: 3 },
  ];

  assert.equal(chooseWeighted(items, () => 0).name, "one");
  assert.equal(chooseWeighted(items, () => 0.26).name, "three");
});

test("applies a guaranteed modifier", () => {
  const fixture = {
    candidateCount: 1,
    categories: [
      {
        id: "test",
        name: "Test",
        weight: 1,
        meals: [
          {
            name: "Dinner",
            weight: 1,
            quick: true,
            modifiers: [{ text: "with a modifier", chance: 1 }],
          },
        ],
      },
    ],
  };

  const result = generateMenu(fixture, () => 0)[0];
  assert.equal(result.mealName, "Dinner with a modifier");
  assert.equal(result.quick, true);
});

test("recent meal history makes a repeated meal less likely", () => {
  const fixture = {
    candidateCount: 1,
    categories: [
      {
        id: "test",
        name: "Test",
        weight: 1,
        meals: [
          { name: "Recent Dinner", weight: 1, quick: true },
          { name: "Other Dinner", weight: 1, quick: true },
        ],
      },
    ],
  };
  const history = {
    version: 1,
    weeks: [
      {
        weekId: "last-week",
        createdAt: "2026-09-22T00:00:00Z",
        mealKeys: ["test:Recent Dinner"],
      },
    ],
  };
  const rolls = [0, 0.4];
  const rng = () => rolls.shift() ?? 0;

  assert.equal(generateMenu(fixture, rng, history)[0].mealName, "Other Dinner");
});
