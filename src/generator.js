import { getHistoryWeightMultiplier, mealHistoryKey } from "./history.js";

function assertWeightedItems(items, label) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${label} must contain at least one item.`);
  }

  for (const item of items) {
    if (!Number.isFinite(item.weight) || item.weight <= 0) {
      throw new Error(`${label} contains an invalid weight.`);
    }
  }
}

export function chooseWeighted(items, rng = Math.random) {
  assertWeightedItems(items, "Weighted selection");

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * totalWeight;

  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) {
      return item;
    }
  }

  return items.at(-1);
}

function applyModifiers(meal, rng) {
  const applied = (meal.modifiers ?? [])
    .filter((modifier) => rng() < modifier.chance)
    .map((modifier) => modifier.text);

  return [meal.name, ...applied].join(" ");
}

function mealsWithHistoryWeights(category, history) {
  return category.meals.map((meal) => {
    const mealKey = mealHistoryKey(category.id, meal.name);
    return {
      ...meal,
      mealKey,
      weight: meal.weight * getHistoryWeightMultiplier(mealKey, history),
    };
  });
}

export function generateMenu(menuData, rng = Math.random, history = null) {
  const candidateCount = menuData.candidateCount;
  const categoryPool = [...menuData.categories];

  if (!Number.isInteger(candidateCount) || candidateCount < 1) {
    throw new Error("Candidate count must be a positive integer.");
  }

  if (candidateCount > categoryPool.length) {
    throw new Error("Candidate count cannot exceed the number of categories.");
  }

  const suggestions = [];

  while (suggestions.length < candidateCount) {
    const category = chooseWeighted(categoryPool, rng);
    const categoryIndex = categoryPool.findIndex((item) => item.id === category.id);
    categoryPool.splice(categoryIndex, 1);

    if (category.result) {
      suggestions.push({
        categoryId: category.id,
        categoryName: category.name,
        mealName: category.result,
        mealKey: mealHistoryKey(category.id, category.result),
      });
      continue;
    }

    const meal = chooseWeighted(mealsWithHistoryWeights(category, history), rng);
    suggestions.push({
      categoryId: category.id,
      categoryName: category.name,
      mealName: applyModifiers(meal, rng),
      mealKey: meal.mealKey,
    });
  }

  return suggestions;
}
