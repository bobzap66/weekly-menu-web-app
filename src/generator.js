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

function itemMatchesTag(item, requiredTag) {
  return !requiredTag || item[requiredTag] === true;
}

function mealsWithHistoryWeights(category, history, requiredTag = null) {
  return category.meals
    .filter((meal) => itemMatchesTag(meal, requiredTag))
    .map((meal) => {
      const mealKey = mealHistoryKey(category.id, meal.name);
      return {
        ...meal,
        mealKey,
        weight: meal.weight * getHistoryWeightMultiplier(mealKey, history),
      };
    });
}

function categoryCanProduceTag(category, tag) {
  if (category.result) {
    return category[tag] === true;
  }

  return category.meals.some((meal) => meal[tag] === true);
}

function removeCategory(categoryPool, categoryId) {
  const index = categoryPool.findIndex((category) => category.id === categoryId);
  if (index >= 0) {
    categoryPool.splice(index, 1);
  }
}

function createSuggestion(category, history, rng, requiredTag = null) {
  if (category.result) {
    if (!itemMatchesTag(category, requiredTag)) {
      throw new Error(`${category.name} cannot satisfy the required meal tag.`);
    }

    return {
      categoryId: category.id,
      categoryName: category.name,
      mealName: category.result,
      mealKey: mealHistoryKey(category.id, category.result),
      quick: category.quick === true,
      bigMeal: category.bigMeal === true,
    };
  }

  const meal = chooseWeighted(mealsWithHistoryWeights(category, history, requiredTag), rng);
  return {
    categoryId: category.id,
    categoryName: category.name,
    mealName: applyModifiers(meal, rng),
    mealKey: meal.mealKey,
    quick: meal.quick === true,
    bigMeal: meal.bigMeal === true,
  };
}

function takeRequiredSuggestion(categoryPool, history, rng, tag, preserveTag = null) {
  const capable = categoryPool.filter((category) => categoryCanProduceTag(category, tag));
  if (capable.length === 0) {
    throw new Error(`Not enough available categories can produce ${tag} meals.`);
  }

  const preferred = preserveTag
    ? capable.filter((category) => !categoryCanProduceTag(category, preserveTag))
    : capable;
  const pool = preferred.length > 0 ? preferred : capable;
  const category = chooseWeighted(pool, rng);
  removeCategory(categoryPool, category.id);
  return createSuggestion(category, history, rng, tag);
}

export function generateMenu(menuData, rng = Math.random, history = null, options = {}) {
  const candidateCount = options.candidateCount ?? menuData.candidateCount;
  const minimumQuickCount = options.minimumQuickCount ?? 0;
  const minimumBigMealCount = options.minimumBigMealCount ?? 0;
  const excludedCategoryIds = new Set(options.excludeCategoryIds ?? []);
  const categoryPool = menuData.categories.filter((category) => !excludedCategoryIds.has(category.id));

  if (!Number.isInteger(candidateCount) || candidateCount < 0) {
    throw new Error("Candidate count must be a non-negative integer.");
  }

  if (!Number.isInteger(minimumQuickCount) || minimumQuickCount < 0) {
    throw new Error("Minimum quick count must be a non-negative integer.");
  }

  if (!Number.isInteger(minimumBigMealCount) || minimumBigMealCount < 0) {
    throw new Error("Minimum big meal count must be a non-negative integer.");
  }

  if (candidateCount > categoryPool.length) {
    throw new Error("Candidate count cannot exceed the number of available categories.");
  }

  if (minimumQuickCount + minimumBigMealCount > candidateCount) {
    throw new Error("Required quick and big meal slots cannot exceed the candidate count.");
  }

  const quickOnlyCount = categoryPool.filter(
    (category) => categoryCanProduceTag(category, "quick") && !categoryCanProduceTag(category, "bigMeal"),
  ).length;
  const bothCount = categoryPool.filter(
    (category) => categoryCanProduceTag(category, "quick") && categoryCanProduceTag(category, "bigMeal"),
  ).length;
  const bigOnlyCount = categoryPool.filter(
    (category) => !categoryCanProduceTag(category, "quick") && categoryCanProduceTag(category, "bigMeal"),
  ).length;
  const bothNeededForQuick = Math.max(0, minimumQuickCount - quickOnlyCount);
  const remainingBigCapacity = bigOnlyCount + bothCount - bothNeededForQuick;

  if (minimumQuickCount > quickOnlyCount + bothCount) {
    throw new Error("Not enough available categories can produce quick meals.");
  }

  if (minimumBigMealCount > remainingBigCapacity) {
    throw new Error("Not enough available categories can produce big meals alongside the quick meal requirements.");
  }

  const suggestions = [];

  for (let index = 0; index < minimumQuickCount; index += 1) {
    suggestions.push(
      takeRequiredSuggestion(categoryPool, history, rng, "quick", "bigMeal"),
    );
  }

  for (let index = 0; index < minimumBigMealCount; index += 1) {
    suggestions.push(takeRequiredSuggestion(categoryPool, history, rng, "bigMeal"));
  }

  while (suggestions.length < candidateCount) {
    const category = chooseWeighted(categoryPool, rng);
    removeCategory(categoryPool, category.id);
    suggestions.push(createSuggestion(category, history, rng));
  }

  return suggestions;
}
