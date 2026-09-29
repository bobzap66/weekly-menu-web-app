export const HISTORY_VERSION = 1;
export const MAX_HISTORY_WEEKS = 8;

const RECENCY_MULTIPLIERS = [0.15, 0.35, 0.55, 0.7, 0.82, 0.92];

export function mealHistoryKey(categoryId, mealName) {
  return `${categoryId}:${mealName}`;
}

export function getMealHistoryKey(meal) {
  if (typeof meal.mealKey === "string" && meal.mealKey.length > 0) {
    return meal.mealKey;
  }

  return mealHistoryKey(meal.categoryId, meal.mealName);
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
      Array.isArray(week.mealKeys) &&
      week.mealKeys.every((key) => typeof key === "string"),
  );
}

export function addWeekToHistory(history, meals, weekId, createdAt = new Date().toISOString()) {
  const base = isValidHistory(history) ? history : createHistory();
  const mealKeys = [...new Set(meals.map(getMealHistoryKey))];
  const previousWeeks = base.weeks.filter((week) => week.weekId !== weekId);

  return {
    version: HISTORY_VERSION,
    weeks: [{ weekId, createdAt, mealKeys }, ...previousWeeks].slice(0, MAX_HISTORY_WEEKS),
  };
}

export function getMealRecency(mealKey, history) {
  if (!isValidHistory(history)) {
    return -1;
  }

  return history.weeks.findIndex((week) => week.mealKeys.includes(mealKey));
}

export function getHistoryWeightMultiplier(mealKey, history) {
  const weeksAgo = getMealRecency(mealKey, history);

  if (weeksAgo < 0 || weeksAgo >= RECENCY_MULTIPLIERS.length) {
    return 1;
  }

  return RECENCY_MULTIPLIERS[weeksAgo];
}
