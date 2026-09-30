import { DAY_TYPE_LABELS, getScheduledWeek } from "./state.js";

export const WEEK_ARCHIVE_SCHEMA_VERSION = 1;

function twoDigits(value) {
  return String(value).padStart(2, "0");
}

export function weekStartFromCreatedAt(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (localDate.getDay() + 6) % 7;
  localDate.setDate(localDate.getDate() - daysSinceMonday);

  return `${localDate.getFullYear()}-${twoDigits(localDate.getMonth() + 1)}-${twoDigits(localDate.getDate())}`;
}

export function weekArchiveDocumentId(createdAt) {
  const raw = typeof createdAt === "string" && createdAt.length > 0
    ? createdAt
    : new Date().toISOString();
  return `week-${raw.replace(/[^0-9A-Za-z._-]/g, "-")}`;
}

function snapshotMeal(meal, carriedOver) {
  return {
    stableId: meal.stableId,
    mealName: meal.mealName,
    categoryId: meal.categoryId ?? "",
    categoryName: meal.categoryName ?? "",
    quick: meal.quick === true,
    bigMeal: meal.bigMeal === true,
    recipeUrl: typeof meal.recipeUrl === "string" ? meal.recipeUrl : "",
    description: typeof meal.description === "string" ? meal.description : "",
    carriedOver,
  };
}

export function buildWeekArchive(state) {
  if (!state || state.mode !== "scheduled" || typeof state.createdAt !== "string") {
    return null;
  }

  const carryoverIds = new Set(Array.isArray(state.carryoverIds) ? state.carryoverIds : []);
  const days = {};
  let scheduledDinnerCount = 0;

  for (const { day, type, quickRequired, bigMealRequired, meal } of getScheduledWeek(state)) {
    const daySnapshot = {
      type,
      typeLabel: DAY_TYPE_LABELS[type] ?? type,
      quickRequired: quickRequired === true,
      bigMealRequired: bigMealRequired === true,
      meal: null,
    };

    if (meal) {
      daySnapshot.meal = snapshotMeal(meal, carryoverIds.has(meal.id));
      scheduledDinnerCount += 1;
    }

    days[day] = daySnapshot;
  }

  return {
    schemaVersion: WEEK_ARCHIVE_SCHEMA_VERSION,
    weekStart: weekStartFromCreatedAt(state.createdAt),
    plannedAt: state.createdAt,
    scheduledDinnerCount,
    days,
  };
}
