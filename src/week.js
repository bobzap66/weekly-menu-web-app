import { generateMenu } from "./generator.js?v=0.11.0";
import {
  DEFAULT_EXTRA_CHOICES,
  DAYS,
  countMealDays,
  isMealDayType,
  isValidWeekPlan,
} from "./state.js?v=0.17.0";

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

function pinnedSuggestion(day, meal, carriedOver = false) {
  return {
    stableId: meal.stableId,
    categoryId: meal.categoryId,
    categoryName: meal.categoryName,
    mealName: meal.mealName,
    quick: meal.quick === true,
    bigMeal: meal.bigMeal === true,
    recipeUrl: typeof meal.recipeUrl === "string" ? meal.recipeUrl : "",
    description: typeof meal.description === "string" ? meal.description : "",
    pinnedDay: day,
    ...(carriedOver ? { carriedOver: true } : {}),
  };
}

function mealMatchesDayPlan(meal, dayPlan) {
  if (!meal || !dayPlan || !isMealDayType(dayPlan.type)) return false;
  if (dayPlan.quick && meal.quick !== true) return false;
  if (dayPlan.bigMeal && meal.bigMeal !== true) return false;
  return true;
}

function getPinnedEntries(pinnedMeals, weekPlan) {
  if (pinnedMeals == null) return [];
  if (typeof pinnedMeals !== "object" || Array.isArray(pinnedMeals)) {
    throw new Error("Pinned meals must be keyed by day.");
  }

  return Object.entries(pinnedMeals).map(([day, meal]) => {
    if (
      !DAYS.includes(day) ||
      typeof meal?.stableId !== "string" ||
      meal.stableId.length === 0 ||
      !mealMatchesDayPlan(meal, weekPlan[day])
    ) {
      throw new Error("Pinned meals must have stable IDs and match their planned dinner days.");
    }
    return [day, meal];
  });
}

function getRequirementCounts(weekPlan, excludedDays = new Set()) {
  let both = 0;
  let quickOnly = 0;
  let bigOnly = 0;

  for (const day of DAYS) {
    if (excludedDays.has(day)) continue;
    const plan = weekPlan[day];
    if (!isMealDayType(plan.type)) continue;
    if (plan.quick && plan.bigMeal) both += 1;
    else if (plan.quick) quickOnly += 1;
    else if (plan.bigMeal) bigOnly += 1;
  }

  return { both, quickOnly, bigOnly };
}

function remainingRequirementsAfterCarryovers(carryovers, weekPlan, pinnedDays = new Set()) {
  const requirements = getRequirementCounts(weekPlan, pinnedDays);
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

function countAvailableCategories(menuData, excludedCategoryIds) {
  return (Array.isArray(menuData?.categories) ? menuData.categories : []).filter(
    (category) =>
      !excludedCategoryIds.has(category.id) &&
      Array.isArray(category.meals) &&
      category.meals.length > 0,
  ).length;
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

  const pinnedEntries = getPinnedEntries(options.pinnedMeals ?? {}, weekPlan);
  const pinnedDays = new Set(pinnedEntries.map(([day]) => day));
  const pinnedStableIds = new Set(pinnedEntries.map(([, meal]) => meal.stableId));
  const carryoverStableIds = new Set(carryoverMeals.map((meal) => meal.stableId));
  const pinned = pinnedEntries.map(([day, meal]) =>
    pinnedSuggestion(day, meal, carryoverStableIds.has(meal.stableId)),
  );
  const carryovers = carryoverMeals
    .filter((meal) => !pinnedStableIds.has(meal.stableId))
    .map(carryoverSuggestion);
  const openMealCount = targetMealCount - pinned.length;

  if (openMealCount < 0) {
    throw new Error("Pinned meals cannot exceed the planned dinner days.");
  }

  if (openMealCount === 0) return pinned;

  const { bothRemaining, quickRemaining, bigRemaining } = remainingRequirementsAfterCarryovers(
    carryovers,
    weekPlan,
    pinnedDays,
  );

  const requiredGenerated = bothRemaining + quickRemaining + bigRemaining;
  const minimumGenerated = Math.max(
    requiredGenerated,
    openMealCount - carryovers.length,
    0,
  );
  const desiredGenerated = Math.max(
    minimumGenerated,
    openMealCount + DEFAULT_EXTRA_CHOICES - carryovers.length,
  );
  const excludedCategoryIds = new Set([
    ...pinned.map((meal) => meal.categoryId),
    ...carryovers.map((meal) => meal.categoryId),
  ]);
  const availableCategoryCount = countAvailableCategories(menuData, excludedCategoryIds);
  const generatedCount = Math.min(desiredGenerated, availableCategoryCount);

  if (generatedCount < minimumGenerated) {
    throw new Error("Not enough available meal categories remain after fixed meals and carryovers to fill the planned week.");
  }

  const generated = generateMenu(menuData, rng, history, {
    candidateCount: generatedCount,
    excludeCategoryIds: [...excludedCategoryIds],
    minimumBothCount: bothRemaining,
    minimumQuickCount: quickRemaining,
    minimumBigMealCount: bigRemaining,
    allowNew: options.nothingNew !== true,
  });

  return [...pinned, ...carryovers, ...generated];
}
