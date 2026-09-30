function catalogMealStableId(category, meal) {
  if (typeof meal?.stableId === "string" && meal.stableId.length > 0) {
    return meal.stableId;
  }

  return `bundled:${category.id}:${meal.name}`;
}

export function mealMatchesDayPlan(meal, dayPlan) {
  if (!meal || dayPlan?.type !== "normal") return false;
  if (dayPlan.quick === true && meal.quick !== true) return false;
  if (dayPlan.bigMeal === true && meal.bigMeal !== true) return false;
  return true;
}

function catalogMealToSuggestion(category, meal) {
  return {
    stableId: catalogMealStableId(category, meal),
    categoryId: category.id,
    categoryName: category.name,
    mealName: meal.name,
    quick: meal.quick === true,
    bigMeal: meal.bigMeal === true,
    recipeUrl: typeof meal.recipeUrl === "string" ? meal.recipeUrl : "",
    description: typeof meal.description === "string" ? meal.description : "",
  };
}

export function getManualMealGroups(menuData, dayPlan) {
  const categories = Array.isArray(menuData?.categories) ? menuData.categories : [];

  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      meals: (Array.isArray(category.meals) ? category.meals : [])
        .filter((meal) => mealMatchesDayPlan(meal, dayPlan))
        .map((meal) => catalogMealToSuggestion(category, meal)),
    }))
    .filter((category) => category.meals.length > 0);
}

export function filterManualMealGroups(groups, query) {
  const source = Array.isArray(groups) ? groups : [];
  const normalizedQuery = typeof query === "string" ? query.trim().toLocaleLowerCase() : "";

  if (!normalizedQuery) {
    return source.map((group) => ({ ...group, meals: [...group.meals] }));
  }

  return source
    .map((group) => {
      const categoryMatches = String(group.name ?? "").toLocaleLowerCase().includes(normalizedQuery);
      const meals = categoryMatches
        ? [...group.meals]
        : group.meals.filter((meal) => {
          const searchableText = [
            meal.mealName,
            meal.categoryName,
            meal.description,
          ]
            .filter((value) => typeof value === "string")
            .join(" ")
            .toLocaleLowerCase();
          return searchableText.includes(normalizedQuery);
        });

      return { ...group, meals };
    })
    .filter((group) => group.meals.length > 0);
}

export function replaceScheduledMeal(state, candidateIdValue, replacementMeal) {
  if (
    state?.mode !== "scheduled" ||
    typeof candidateIdValue !== "string" ||
    typeof replacementMeal?.stableId !== "string" ||
    replacementMeal.stableId.length === 0
  ) {
    return state;
  }

  const assignedDay = state.dayAssignments?.[candidateIdValue];
  const dayPlan = assignedDay ? state.weekPlan?.[assignedDay] : null;
  if (!assignedDay || !mealMatchesDayPlan(replacementMeal, dayPlan)) return state;

  const currentCandidate = state.candidates.find((candidate) => candidate.id === candidateIdValue);
  if (!currentCandidate) return state;

  const pinnedDay = typeof currentCandidate.pinnedDay === "string" ? currentCandidate.pinnedDay : null;
  const replacement = {
    ...replacementMeal,
    id: currentCandidate.id,
    ...(pinnedDay ? { pinnedDay } : {}),
  };
  const pinnedMeals = state.pinnedMeals && typeof state.pinnedMeals === "object"
    ? { ...state.pinnedMeals }
    : {};

  if (pinnedDay) {
    pinnedMeals[pinnedDay] = { ...replacementMeal };
  }

  return {
    ...state,
    candidates: state.candidates.map((candidate) =>
      candidate.id === candidateIdValue ? replacement : candidate,
    ),
    pinnedMeals,
    carryoverIds: state.carryoverIds.filter((id) => id !== candidateIdValue),
  };
}
