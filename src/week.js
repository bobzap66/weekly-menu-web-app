import { generateMenu } from "./generator.js?v=0.11.0";
import {
  DEFAULT_EXTRA_CHOICES,
  DAYS,
  countMealDays,
  isMealDayType,
  isValidWeekPlan,
} from "./state.js?v=0.11.0";

function carryoverSuggestion(meal) {
  return {
    stableId: meal.stableId,
    categoryId: meal.categoryId,
    categoryName: meal.categoryName,
    mealName: meal.mealName,
    quick: meal.quick === true,
    bigMeal: meal.bigMeal === true,
    recipeUrl: typeof meal.recipeUrl === "string" ? meal.recipeUrl : "",
    description: typeof meal.description === "string" ? meal.description : "",
    carriedOver: true,
  };
}

function getRequirementCounts(weekPlan) {
  let both = 0;
  let quickOnly = 0;
  let bigOnly = 0;

  for (const day of DAYS) {
    const plan = weekPlan[day];
    if (!isMealDayType(plan.type)) continue;
    if (plan.quick && plan.bigMeal) both += 1;
    else if (plan.quick) quickOnly += 1;
    else if (plan.bigMeal) bigOnly += 1;
  }

  return { both, quickOnly, bigOnly };
}

function remainingRequirementsAfterCarryovers(carryovers, weekPlan) {
  const requirements = getRequirementCounts(weekPlan);
  const quickOnlyMeals = carryovers.filter((meal) => meal.quick && !meal.bigMeal).length;
  const bigOnlyMeals = carryovers.filter((meal) => !meal.quick && meal.bigMeal).length;
  let bothMeals = carryovers.filter((meal) => meal.quick && meal.bigMeal).length;

  const bothCovered = Math.min(requirements.both, bothMeals);
  const bothRemaining = requirements.both - bothCovered;
  bothMeals -= bothCovered;

  let quickRemaining = Math.max(0, requirements.quickOnly - quickOnlyMeals);
  let bigRemaining = Math.max(0, requirements.bigOnly - bigOnlyMeals);

  const bothForQuick = Math.min(bothMeals, quickRemaining);
  quickRemaining -= bothForQuick;
  bothMeals -= bothForQuick;

  const bothForBig = Math.min(bothMeals, bigRemaining);
  bigRemaining -= bothForBig;

  return { bothRemaining, quickRemaining, bigRemaining };
}

export function buildNextWeekSuggestions(
  menuData,
  history,
  carryoverMeals = [],
  weekPlan,
  rng = Math.random,
  options = {},
) {
  if (!Array.isArray(carryoverMeals)) {
    throw new Error("Carryover meals must be an array.");
  }

  if (!isValidWeekPlan(weekPlan)) {
    throw new Error("Week plan is invalid.");
  }

  if (carryoverMeals.some((meal) => typeof meal.stableId !== "string" || meal.stableId.length === 0)) {
    throw new Error("Carryover meals must have stable IDs.");
  }

  const targetMealCount = countMealDays(weekPlan);
  if (targetMealCount === 0) return [];

  const carryovers = carryoverMeals.map(carryoverSuggestion);
  const { bothRemaining, quickRemaining, bigRemaining } = remainingRequirementsAfterCarryovers(
    carryovers,
    weekPlan,
  );

  const requiredGenerated = bothRemaining + quickRemaining + bigRemaining;
  const candidateCount = Math.max(
    targetMealCount + DEFAULT_EXTRA_CHOICES,
    carryovers.length + requiredGenerated,
  );

  const generatedCount = candidateCount - carryovers.length;
  const generated = generateMenu(menuData, rng, history, {
    candidateCount: generatedCount,
    excludeCategoryIds: carryovers.map((meal) => meal.categoryId),
    minimumBothCount: bothRemaining,
    minimumQuickCount: quickRemaining,
    minimumBigMealCount: bigRemaining,
    allowNew: options.nothingNew !== true,
  });

  return [...carryovers, ...generated];
}
