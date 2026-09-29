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
            modifiers: [{ text: "with a modifier", chance: 1 }],
          },
        ],
      },
    ],
  };

  assert.equal(generateMenu(fixture, () => 0)[0].mealName, "Dinner with a modifier");
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
          { name: "Recent Dinner", weight: 1 },
          { name: "Other Dinner", weight: 1 },
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
