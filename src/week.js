import { generateMenu } from "./generator.js";
import {
  DEFAULT_EXTRA_CHOICES,
  countMealDays,
  countQuickMealDays,
  isValidWeekPlan,
} from "./state.js";

function carryoverSuggestion(meal) {
  return {
    categoryId: meal.categoryId,
    categoryName: meal.categoryName,
    mealName: meal.mealName,
    mealKey: meal.mealKey,
    quick: meal.quick === true,
    carriedOver: true,
  };
}

export function buildNextWeekSuggestions(
  menuData,
  history,
  carryoverMeals = [],
  weekPlan,
  rng = Math.random,
) {
  if (!Array.isArray(carryoverMeals)) {
    throw new Error("Carryover meals must be an array.");
  }

  if (!isValidWeekPlan(weekPlan)) {
    throw new Error("Week plan is invalid.");
  }

  const targetMealCount = countMealDays(weekPlan);
  if (targetMealCount === 0) {
    return [];
  }

  const carryovers = carryoverMeals.map(carryoverSuggestion);
  const quickCarryoverCount = carryovers.filter((meal) => meal.quick).length;
  const minimumQuickGenerated = Math.max(
    0,
    countQuickMealDays(weekPlan) - quickCarryoverCount,
  );

  const candidateCount = Math.max(
    targetMealCount + DEFAULT_EXTRA_CHOICES,
    carryovers.length + minimumQuickGenerated,
  );

  const generatedCount = candidateCount - carryovers.length;
  const generated = generateMenu(menuData, rng, history, {
    candidateCount: generatedCount,
    excludeCategoryIds: carryovers.map((meal) => meal.categoryId),
    minimumQuickCount: minimumQuickGenerated,
  });

  return [...carryovers, ...generated];
}
