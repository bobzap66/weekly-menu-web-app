import { generateMenu } from "./generator.js";

function carryoverSuggestion(meal) {
  return {
    categoryId: meal.categoryId,
    categoryName: meal.categoryName,
    mealName: meal.mealName,
    mealKey: meal.mealKey,
    carriedOver: true,
  };
}

export function buildNextWeekSuggestions(menuData, history, carryoverMeals = [], rng = Math.random) {
  if (!Array.isArray(carryoverMeals)) {
    throw new Error("Carryover meals must be an array.");
  }

  if (carryoverMeals.length > menuData.candidateCount) {
    throw new Error("Carryover meals cannot exceed the candidate count.");
  }

  const carryovers = carryoverMeals.map(carryoverSuggestion);
  const generatedCount = menuData.candidateCount - carryovers.length;
  const generated = generateMenu(menuData, rng, history, {
    candidateCount: generatedCount,
    excludeCategoryIds: carryovers.map((meal) => meal.categoryId),
  });

  return [...carryovers, ...generated];
}
