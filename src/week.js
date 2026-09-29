import { generateMenu } from "./generator.js";
import {
  DEFAULT_EXTRA_CHOICES,
  countBigMealDays,
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
    bigMeal: meal.bigMeal === true,
    carriedOver: true,
  };
}

function remainingRequirementsAfterCarryovers(carryovers, weekPlan) {
  const quickOnly = carryovers.filter((meal) => meal.quick && !meal.bigMeal).length;
  const bigOnly = carryovers.filter((meal) => !meal.quick && meal.bigMeal).length;
  let both = carryovers.filter((meal) => meal.quick && meal.bigMeal).length;

  let quickRemaining = Math.max(0, countQuickMealDays(weekPlan) - quickOnly);
  let bigRemaining = Math.max(0, countBigMealDays(weekPlan) - bigOnly);

  const bothForQuick = Math.min(both, quickRemaining);
  quickRemaining -= bothForQuick;
  both -= bothForQuick;

  const bothForBig = Math.min(both, bigRemaining);
  bigRemaining -= bothForBig;

  return {
    quickRemaining,
    bigRemaining,
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
  const { quickRemaining, bigRemaining } = remainingRequirementsAfterCarryovers(carryovers, weekPlan);

  const candidateCount = Math.max(
    targetMealCount + DEFAULT_EXTRA_CHOICES,
    carryovers.length + quickRemaining + bigRemaining,
  );

  const generatedCount = candidateCount - carryovers.length;
  const generated = generateMenu(menuData, rng, history, {
    candidateCount: generatedCount,
    excludeCategoryIds: carryovers.map((meal) => meal.categoryId),
    minimumQuickCount: quickRemaining,
    minimumBigMealCount: bigRemaining,
  });

  return [...carryovers, ...generated];
}
