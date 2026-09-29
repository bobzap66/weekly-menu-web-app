export const HISTORY_VERSION = 1;
export const MAX_HISTORY_WEEKS = 8;

const RECENCY_MULTIPLIERS = [0.15, 0.35, 0.55, 0.7, 0.82, 0.92];

const LEGACY_MEAL_NAMES = new Map([
  ["Brocoli Chicken", "Broccoli Chicken"],
  ["General Tsou", "General Tso's Chicken"],
  ["Eggrolls (Buffalo Chicken, Cheeseburger, etc)", "Egg Rolls (Buffalo Chicken, Cheeseburger, etc.)"],
  ["Chicken Parmesean", "Chicken Parmesan"],
  ["Turkey And Rice", "Turkey and Rice"],
  ["Salsbury Steak", "Salisbury Steak"],
  ["New Meat and Sides recipe", "New Meat and Sides Recipe"],
  ["Shishkababs", "Shish Kebabs"],
  ["Brautwurst Thing", "Bratwurst Thing"],
  ["New skillet meal recipe", "New Skillet Meal Recipe"],
  ["Cajan Pasta Salad", "Cajun Pasta Salad"],
  ["Misc new Casseroles", "Misc New Casseroles"],
  ["New seafood recipe", "New Seafood Recipe"],
]);

export function mealHistoryKey(categoryId, mealName) {
  return `${categoryId}:${mealName}`;
}

function legacyBaseMealName(mealName) {
  const baseName = mealName.replace(/ \(gourmet\)$/, "").replace(/ with Hawgbacks$/, "");
  return LEGACY_MEAL_NAMES.get(baseName) ?? baseName;
}

export function getMealHistoryKey(meal) {
  if (typeof meal.mealKey === "string" && meal.mealKey.length > 0) {
    return meal.mealKey;
  }

  return mealHistoryKey(meal.categoryId, legacyBaseMealName(meal.mealName));
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
