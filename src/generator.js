import { getHistoryWeightMultiplier, mealHistoryKey } from "./history.js";

const NEW_RECIPE_CHANCE = 0.10;
const NEW_CATEGORY_CHANCE = 0.05;
const LEGACY_PLACEHOLDER_CATEGORY_IDS = new Set(["new-recipe", "new-category"]);
const LEGACY_NEW_RECIPE_MEALS = new Set([
  "New Meat and Sides Recipe",
  "New BBQ Recipe",
  "New Skillet Meal Recipe",
  "Misc New Casseroles",
  "New Fast Food Recipe",
  "New Seafood Recipe",
]);

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
    if (roll < 0) return item;
  }

  return items.at(-1);
}

function applyModifiers(meal, rng) {
  const applied = (meal.modifiers ?? [])
    .filter((modifier) => rng() < modifier.chance)
    .map((modifier) => modifier.text);

  return [meal.name, ...applied].join(" ");
}

function itemMatchesTags(item, requiredTags = []) {
  return requiredTags.every((tag) => item[tag] === true);
}

function isRealMeal(meal) {
  return !LEGACY_NEW_RECIPE_MEALS.has(meal.name);
}

function mealsWithHistoryWeights(category, history, requiredTags = []) {
  return category.meals
    .filter((meal) => isRealMeal(meal) && itemMatchesTags(meal, requiredTags))
    .map((meal) => {
      const mealKey = mealHistoryKey(category.id, meal.name);
      return {
        ...meal,
        mealKey,
        weight: meal.weight * getHistoryWeightMultiplier(mealKey, history),
      };
    });
}

function categoryCanProduceTags(category, tags) {
  return Array.isArray(category.meals) && category.meals.some(
    (meal) => isRealMeal(meal) && itemMatchesTags(meal, tags),
  );
}

function removeCategory(categoryPool, categoryId) {
  const index = categoryPool.findIndex((category) => category.id === categoryId);
  if (index >= 0) categoryPool.splice(index, 1);
}

function createNewRecipeSuggestion(category) {
  return {
    categoryId: category.id,
    categoryName: category.name,
    mealName: "New Recipe",
    mealKey: `${category.id}:__new-recipe`,
    quick: false,
    bigMeal: false,
    recipeUrl: "",
    description: `Try a new ${category.name} recipe.`,
    newIdea: true,
  };
}

function createNewCategorySuggestion() {
  return {
    categoryId: "__new-category",
    categoryName: "New Category",
    mealName: "New Category",
    mealKey: "__new-category:__new-category",
    quick: false,
    bigMeal: false,
    recipeUrl: "",
    description: "Try something from a category that is not already in the rotation.",
    newIdea: true,
  };
}

function createSuggestion(category, history, rng, requiredTags = [], allowNewRecipe = true) {
  if (
    allowNewRecipe &&
    requiredTags.length === 0 &&
    rng() < NEW_RECIPE_CHANCE
  ) {
    return createNewRecipeSuggestion(category);
  }

  const meal = chooseWeighted(mealsWithHistoryWeights(category, history, requiredTags), rng);
  return {
    categoryId: category.id,
    categoryName: category.name,
    mealName: applyModifiers(meal, rng),
    mealKey: meal.mealKey,
    quick: meal.quick === true,
    bigMeal: meal.bigMeal === true,
    recipeUrl: typeof meal.recipeUrl === "string" ? meal.recipeUrl : "",
    description: typeof meal.description === "string" ? meal.description : "",
  };
}

function takeRequiredSuggestion(categoryPool, history, rng, requiredTags, avoidTags = []) {
  const capable = categoryPool.filter((category) => categoryCanProduceTags(category, requiredTags));
  if (capable.length === 0) {
    throw new Error(`Not enough available categories can satisfy ${requiredTags.join(" + ")} meal requirements.`);
  }

  const preferred = avoidTags.length > 0
    ? capable.filter((category) => avoidTags.every((tag) => !categoryCanProduceTags(category, [tag])))
    : capable;
  const pool = preferred.length > 0 ? preferred : capable;
  const category = chooseWeighted(pool, rng);
  removeCategory(categoryPool, category.id);
  return createSuggestion(category, history, rng, requiredTags, false);
}

export function generateMenu(menuData, rng = Math.random, history = null, options = {}) {
  const candidateCount = options.candidateCount ?? menuData.candidateCount;
  const minimumBothCount = options.minimumBothCount ?? 0;
  const minimumQuickCount = options.minimumQuickCount ?? 0;
  const minimumBigMealCount = options.minimumBigMealCount ?? 0;
  const allowNew = options.allowNew !== false;
  const excludedCategoryIds = new Set(options.excludeCategoryIds ?? []);
  const categoryPool = menuData.categories.filter(
    (category) =>
      !excludedCategoryIds.has(category.id) &&
      !LEGACY_PLACEHOLDER_CATEGORY_IDS.has(category.id) &&
      Array.isArray(category.meals) &&
      category.meals.some(isRealMeal),
  );

  for (const [label, value] of [
    ["Candidate count", candidateCount],
    ["Minimum both count", minimumBothCount],
    ["Minimum quick count", minimumQuickCount],
    ["Minimum big meal count", minimumBigMealCount],
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer.`);
    }
  }

  if (candidateCount > categoryPool.length) {
    throw new Error("Candidate count cannot exceed the number of available meal categories.");
  }

  if (minimumBothCount + minimumQuickCount + minimumBigMealCount > candidateCount) {
    throw new Error("Required meal slots cannot exceed the candidate count.");
  }

  const suggestions = [];

  for (let index = 0; index < minimumBothCount; index += 1) {
    suggestions.push(takeRequiredSuggestion(categoryPool, history, rng, ["quick", "bigMeal"]));
  }

  for (let index = 0; index < minimumQuickCount; index += 1) {
    suggestions.push(takeRequiredSuggestion(categoryPool, history, rng, ["quick"], ["bigMeal"]));
  }

  for (let index = 0; index < minimumBigMealCount; index += 1) {
    suggestions.push(takeRequiredSuggestion(categoryPool, history, rng, ["bigMeal"], ["quick"]));
  }

  if (allowNew && suggestions.length < candidateCount && rng() < NEW_CATEGORY_CHANCE) {
    suggestions.push(createNewCategorySuggestion());
  }

  while (suggestions.length < candidateCount) {
    const category = chooseWeighted(categoryPool, rng);
    removeCategory(categoryPool, category.id);
    suggestions.push(createSuggestion(category, history, rng, [], allowNew));
  }

  return suggestions;
}
