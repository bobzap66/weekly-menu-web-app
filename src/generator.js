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

function mealsWithHistoryWeights(category, history, quickOnly = false) {
  return category.meals
    .filter((meal) => !quickOnly || meal.quick === true)
    .map((meal) => {
      const mealKey = mealHistoryKey(category.id, meal.name);
      return {
        ...meal,
        mealKey,
        weight: meal.weight * getHistoryWeightMultiplier(mealKey, history),
      };
    });
}

function categoryCanProduceQuickMeal(category) {
  if (category.result) {
    return category.quick === true;
  }

  return category.meals.some((meal) => meal.quick === true);
}

function removeCategory(categoryPool, categoryId) {
  const index = categoryPool.findIndex((category) => category.id === categoryId);
  if (index >= 0) {
    categoryPool.splice(index, 1);
  }
}

function createSuggestion(category, history, rng, quickOnly = false) {
  if (category.result) {
    if (quickOnly && category.quick !== true) {
      throw new Error(`${category.name} cannot produce a quick meal.`);
    }

    return {
      categoryId: category.id,
      categoryName: category.name,
      mealName: category.result,
      mealKey: mealHistoryKey(category.id, category.result),
      quick: category.quick === true,
    };
  }

  const meal = chooseWeighted(mealsWithHistoryWeights(category, history, quickOnly), rng);
  return {
    categoryId: category.id,
    categoryName: category.name,
    mealName: applyModifiers(meal, rng),
    mealKey: meal.mealKey,
    quick: meal.quick === true,
  };
}

export function generateMenu(menuData, rng = Math.random, history = null, options = {}) {
  const candidateCount = options.candidateCount ?? menuData.candidateCount;
  const minimumQuickCount = options.minimumQuickCount ?? 0;
  const excludedCategoryIds = new Set(options.excludeCategoryIds ?? []);
  const categoryPool = menuData.categories.filter((category) => !excludedCategoryIds.has(category.id));

  if (!Number.isInteger(candidateCount) || candidateCount < 0) {
    throw new Error("Candidate count must be a non-negative integer.");
  }

  if (!Number.isInteger(minimumQuickCount) || minimumQuickCount < 0) {
    throw new Error("Minimum quick count must be a non-negative integer.");
  }

  if (candidateCount > categoryPool.length) {
    throw new Error("Candidate count cannot exceed the number of available categories.");
  }

  if (minimumQuickCount > candidateCount) {
    throw new Error("Minimum quick count cannot exceed the candidate count.");
  }

  const quickCapableCount = categoryPool.filter(categoryCanProduceQuickMeal).length;
  if (minimumQuickCount > quickCapableCount) {
    throw new Error("Not enough available categories can produce quick meals.");
  }

  const suggestions = [];

  while (suggestions.length < minimumQuickCount) {
    const quickCategories = categoryPool.filter(categoryCanProduceQuickMeal);
    const category = chooseWeighted(quickCategories, rng);
    removeCategory(categoryPool, category.id);
    suggestions.push(createSuggestion(category, history, rng, true));
  }

  while (suggestions.length < candidateCount) {
    const category = chooseWeighted(categoryPool, rng);
    removeCategory(categoryPool, category.id);
    suggestions.push(createSuggestion(category, history, rng));
  }

  return suggestions;
}
