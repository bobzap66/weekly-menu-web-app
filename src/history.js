export const HISTORY_VERSION = 2;
export const MAX_HISTORY_WEEKS = 8;

const RECENCY_MULTIPLIERS = [0.15, 0.35, 0.55, 0.7, 0.82, 0.92];

export function getStableMealId(meal) {
  if (typeof meal?.stableId !== "string" || meal.stableId.length === 0) {
    throw new Error("Meal is missing a stableId.");
  }

  return meal.stableId;
}

export function createHistory() {
  return {
    version: HISTORY_VERSION,
    weeks: [],
  };
}

export function isValidHistory(value) {
  if (!value || value.version !== HISTORY_VERSION || !Array.isArray(value.weeks)) {
    return false;
  }

  return value.weeks.every(
    (week) =>
      week &&
      typeof week.weekId === "string" &&
      typeof week.createdAt === "string" &&
      Array.isArray(week.mealIds) &&
      week.mealIds.every((id) => typeof id === "string" && id.length > 0),
  );
}

export function addWeekToHistory(history, meals, weekId, createdAt = new Date().toISOString()) {
  const base = isValidHistory(history) ? history : createHistory();
  const mealIds = [...new Set(meals.map(getStableMealId))];
  const previousWeeks = base.weeks.filter((week) => week.weekId !== weekId);

  return {
    version: HISTORY_VERSION,
    weeks: [{ weekId, createdAt, mealIds }, ...previousWeeks].slice(0, MAX_HISTORY_WEEKS),
  };
}

export function getMealRecency(stableId, history) {
  if (!isValidHistory(history)) {
    return -1;
  }

  return history.weeks.findIndex((week) => week.mealIds.includes(stableId));
}

export function getHistoryWeightMultiplier(stableId, history) {
  const weeksAgo = getMealRecency(stableId, history);

  if (weeksAgo < 0 || weeksAgo >= RECENCY_MULTIPLIERS.length) {
    return 1;
  }

  return RECENCY_MULTIPLIERS[weeksAgo];
}
