export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DAY_TYPES = {
  NORMAL: "normal",
  QUICK: "quick",
  BIG: "big",
  LEFTOVERS: "leftovers",
  EATING_OUT: "eating-out",
  NO_MEAL: "no-meal",
};

export const DAY_TYPE_LABELS = {
  [DAY_TYPES.NORMAL]: "Normal Dinner",
  [DAY_TYPES.QUICK]: "Quick Meal",
  [DAY_TYPES.BIG]: "Big Meal / Guests",
  [DAY_TYPES.LEFTOVERS]: "Leftovers",
  [DAY_TYPES.EATING_OUT]: "Eating Out",
  [DAY_TYPES.NO_MEAL]: "No Meal Planned",
};

export const DEFAULT_EXTRA_CHOICES = 3;

const VALID_MODES = new Set(["setup", "choosing", "scheduled"]);
const VALID_DAY_TYPES = new Set(Object.values(DAY_TYPES));

function candidateId(suggestion, index) {
  return `${index}-${suggestion.categoryId}-${suggestion.mealName}`;
}

export function isMealDayType(type) {
  return type === DAY_TYPES.NORMAL || type === DAY_TYPES.QUICK || type === DAY_TYPES.BIG;
}

export function createWeekPlan(defaultType = DAY_TYPES.NORMAL) {
  if (!VALID_DAY_TYPES.has(defaultType)) {
    throw new Error("Invalid default day type.");
  }

  return Object.fromEntries(DAYS.map((day) => [day, defaultType]));
}

export function isValidWeekPlan(weekPlan) {
  return Boolean(
    weekPlan &&
      typeof weekPlan === "object" &&
      DAYS.every((day) => VALID_DAY_TYPES.has(weekPlan[day])),
  );
}

export function countMealDays(weekPlan) {
  if (!isValidWeekPlan(weekPlan)) {
    return 0;
  }

  return DAYS.filter((day) => isMealDayType(weekPlan[day])).length;
}

export function countQuickMealDays(weekPlan) {
  if (!isValidWeekPlan(weekPlan)) {
    return 0;
  }

  return DAYS.filter((day) => weekPlan[day] === DAY_TYPES.QUICK).length;
}

export function countBigMealDays(weekPlan) {
  if (!isValidWeekPlan(weekPlan)) {
    return 0;
  }

  return DAYS.filter((day) => weekPlan[day] === DAY_TYPES.BIG).length;
}

export function createPlanningState(
  carryoverMeals = [],
  weekPlan = createWeekPlan(),
  createdAt = new Date().toISOString(),
) {
  if (!Array.isArray(carryoverMeals)) {
    throw new Error("Carryover meals must be an array.");
  }

  if (!isValidWeekPlan(weekPlan)) {
    throw new Error("Week plan is invalid.");
  }

  return {
    version: 5,
    mode: "setup",
    createdAt,
    weekPlan: { ...weekPlan },
    pendingCarryovers: carryoverMeals.map((meal) => ({ ...meal })),
    candidates: [],
    rejectedIds: [],
    carryoverIds: [],
    dayAssignments: {},
  };
}

export function setDayType(state, day, type) {
  if (state.mode !== "setup" || !DAYS.includes(day) || !VALID_DAY_TYPES.has(type)) {
    return state;
  }

  return {
    ...state,
    weekPlan: {
      ...state.weekPlan,
      [day]: type,
    },
  };
}

function splitMealsByRequirement(meals) {
  return {
    quickOnly: meals.filter((meal) => meal.quick === true && meal.bigMeal !== true),
    bigOnly: meals.filter((meal) => meal.quick !== true && meal.bigMeal === true),
    both: meals.filter((meal) => meal.quick === true && meal.bigMeal === true),
    neither: meals.filter((meal) => meal.quick !== true && meal.bigMeal !== true),
  };
}

function requirementShortfallForMeals(meals, weekPlan) {
  const { quickOnly, bigOnly, both } = splitMealsByRequirement(meals);
  const quickNeedsBoth = Math.max(0, countQuickMealDays(weekPlan) - quickOnly.length);
  const bigNeedsBoth = Math.max(0, countBigMealDays(weekPlan) - bigOnly.length);
  return Math.max(0, quickNeedsBoth + bigNeedsBoth - both.length);
}

function createDayAssignments(candidates, rejectedIds, weekPlan) {
  const rejected = new Set(rejectedIds);
  const selected = candidates.filter((candidate) => !rejected.has(candidate.id));

  if (requirementShortfallForMeals(selected, weekPlan) > 0) {
    return {};
  }

  const assignments = {};
  const usedIds = new Set();
  const quickDays = DAYS.filter((day) => weekPlan[day] === DAY_TYPES.QUICK);
  const bigDays = DAYS.filter((day) => weekPlan[day] === DAY_TYPES.BIG);
  const normalDays = DAYS.filter((day) => weekPlan[day] === DAY_TYPES.NORMAL);
  const { quickOnly, bigOnly, both } = splitMealsByRequirement(selected);
  const remainingBoth = [...both];

  for (const day of quickDays) {
    const meal = quickOnly.shift() ?? remainingBoth.shift();
    if (!meal) {
      return {};
    }
    assignments[meal.id] = day;
    usedIds.add(meal.id);
  }

  for (const day of bigDays) {
    const meal = bigOnly.shift() ?? remainingBoth.shift();
    if (!meal) {
      return {};
    }
    assignments[meal.id] = day;
    usedIds.add(meal.id);
  }

  const remainingMeals = selected.filter((candidate) => !usedIds.has(candidate.id));
  for (let index = 0; index < normalDays.length; index += 1) {
    const meal = remainingMeals[index];
    if (!meal) {
      return {};
    }
    assignments[meal.id] = normalDays[index];
  }

  return assignments;
}

export function createMenuState(
  suggestions,
  weekPlan,
  createdAt = new Date().toISOString(),
  deferredCarryovers = [],
) {
  if (!Array.isArray(suggestions)) {
    throw new Error("Suggestions must be an array.");
  }

  if (!Array.isArray(deferredCarryovers)) {
    throw new Error("Deferred carryovers must be an array.");
  }

  if (!isValidWeekPlan(weekPlan)) {
    throw new Error("Week plan is invalid.");
  }

  const targetMealCount = countMealDays(weekPlan);
  if (suggestions.length < targetMealCount) {
    throw new Error("Suggestions cannot be fewer than the planned meal days.");
  }

  const candidates = suggestions.map((suggestion, index) => ({
    ...suggestion,
    id: candidateId(suggestion, index),
  }));

  const state = {
    version: 5,
    mode: targetMealCount === 0 ? "scheduled" : "choosing",
    createdAt,
    weekPlan: { ...weekPlan },
    pendingCarryovers: targetMealCount === 0
      ? deferredCarryovers.map((meal) => ({ ...meal }))
      : [],
    candidates,
    rejectedIds: [],
    carryoverIds: [],
    dayAssignments: {},
  };

  if (targetMealCount > 0 && getRequiredRejectionCount(state) === 0 && getMealRequirementShortfall(state) === 0) {
    state.mode = "scheduled";
    state.dayAssignments = createDayAssignments(candidates, [], weekPlan);
  }

  return state;
}

export function getSelectedMeals(state) {
  const rejected = new Set(state.rejectedIds);
  return state.candidates.filter((candidate) => !rejected.has(candidate.id));
}

export function getRequiredRejectionCount(state) {
  return Math.max(0, state.candidates.length - countMealDays(state.weekPlan));
}

export function getQuickMealShortfall(state) {
  const quickNeeded = countQuickMealDays(state.weekPlan);
  const selectedQuick = getSelectedMeals(state).filter((candidate) => candidate.quick === true).length;
  return Math.max(0, quickNeeded - selectedQuick);
}

export function getBigMealShortfall(state) {
  const bigNeeded = countBigMealDays(state.weekPlan);
  const selectedBig = getSelectedMeals(state).filter((candidate) => candidate.bigMeal === true).length;
  return Math.max(0, bigNeeded - selectedBig);
}

export function getMealRequirementShortfall(state) {
  return requirementShortfallForMeals(getSelectedMeals(state), state.weekPlan);
}

function finalizeIfReady(state) {
  if (
    state.rejectedIds.length !== getRequiredRejectionCount(state) ||
    getMealRequirementShortfall(state) > 0
  ) {
    return {
      ...state,
      mode: "choosing",
      dayAssignments: {},
    };
  }

  return {
    ...state,
    mode: "scheduled",
    dayAssignments: createDayAssignments(state.candidates, state.rejectedIds, state.weekPlan),
  };
}

export function toggleRejection(state, candidateIdValue) {
  if (state.mode !== "choosing") {
    return state;
  }

  const candidateExists = state.candidates.some((candidate) => candidate.id === candidateIdValue);
  if (!candidateExists) {
    return state;
  }

  const rejected = new Set(state.rejectedIds);
  const carryovers = new Set(state.carryoverIds);

  if (rejected.has(candidateIdValue)) {
    rejected.delete(candidateIdValue);
  } else {
    if (rejected.size >= getRequiredRejectionCount(state)) {
      return state;
    }
    rejected.add(candidateIdValue);
    carryovers.delete(candidateIdValue);
  }

  return finalizeIfReady({
    ...state,
    rejectedIds: [...rejected],
    carryoverIds: [...carryovers],
  });
}

export function clearRejections(state) {
  if (state.mode !== "choosing") {
    return state;
  }

  return {
    ...state,
    rejectedIds: [],
    dayAssignments: {},
  };
}

export function toggleCarryover(state, candidateIdValue) {
  if (state.mode !== "scheduled") {
    return state;
  }

  const selected = new Set(getSelectedMeals(state).map((candidate) => candidate.id));
  if (!selected.has(candidateIdValue)) {
    return state;
  }

  const carryovers = new Set(state.carryoverIds);
  if (carryovers.has(candidateIdValue)) {
    carryovers.delete(candidateIdValue);
  } else {
    carryovers.add(candidateIdValue);
  }

  return {
    ...state,
    carryoverIds: [...carryovers],
  };
}

export function getCarryoverMeals(state) {
  const carryovers = new Set(state.carryoverIds);
  const markedMeals = getSelectedMeals(state).filter((candidate) => carryovers.has(candidate.id));
  return [...state.pendingCarryovers, ...markedMeals];
}

export function getEatenMeals(state) {
  const carryovers = new Set(state.carryoverIds);
  return getSelectedMeals(state).filter((candidate) => !carryovers.has(candidate.id));
}

function assignmentsMeetRequirements(state, assignments) {
  const candidateById = new Map(state.candidates.map((candidate) => [candidate.id, candidate]));

  return DAYS.every((day) => {
    const type = state.weekPlan[day];
    if (type !== DAY_TYPES.QUICK && type !== DAY_TYPES.BIG) {
      return true;
    }

    const mealId = Object.entries(assignments).find(([, assignedDay]) => assignedDay === day)?.[0];
    if (!mealId) {
      return false;
    }

    const meal = candidateById.get(mealId);
    return type === DAY_TYPES.QUICK ? meal?.quick === true : meal?.bigMeal === true;
  });
}

export function canAssignMealDay(state, candidateIdValue, day) {
  if (
    state.mode !== "scheduled" ||
    !isMealDayType(state.weekPlan[day]) ||
    !(candidateIdValue in state.dayAssignments)
  ) {
    return false;
  }

  const assignments = { ...state.dayAssignments };
  const previousDay = assignments[candidateIdValue];
  const occupyingEntry = Object.entries(assignments).find(
    ([otherId, assignedDay]) => otherId !== candidateIdValue && assignedDay === day,
  );

  assignments[candidateIdValue] = day;
  if (occupyingEntry) {
    assignments[occupyingEntry[0]] = previousDay;
  }

  return assignmentsMeetRequirements(state, assignments);
}

export function assignMealDay(state, candidateIdValue, day) {
  if (!canAssignMealDay(state, candidateIdValue, day)) {
    return state;
  }

  const assignments = { ...state.dayAssignments };
  const previousDay = assignments[candidateIdValue];
  const occupyingEntry = Object.entries(assignments).find(
    ([otherId, assignedDay]) => otherId !== candidateIdValue && assignedDay === day,
  );

  assignments[candidateIdValue] = day;
  if (occupyingEntry) {
    assignments[occupyingEntry[0]] = previousDay;
  }

  return {
    ...state,
    dayAssignments: assignments,
  };
}

export function getScheduledWeek(state) {
  const selected = getSelectedMeals(state);

  return DAYS.map((day) => ({
    day,
    type: state.weekPlan[day],
    meal: isMealDayType(state.weekPlan[day])
      ? selected.find((candidate) => state.dayAssignments[candidate.id] === day)
      : null,
  }));
}

export function reopenChoices(state) {
  if (state.mode !== "scheduled" || countMealDays(state.weekPlan) === 0) {
    return state;
  }

  return {
    ...state,
    mode: "choosing",
    dayAssignments: {},
  };
}

export function isValidMenuState(value) {
  if (
    !value ||
    value.version !== 5 ||
    !VALID_MODES.has(value.mode) ||
    typeof value.createdAt !== "string" ||
    !isValidWeekPlan(value.weekPlan) ||
    !Array.isArray(value.pendingCarryovers) ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.rejectedIds) ||
    !Array.isArray(value.carryoverIds) ||
    !value.dayAssignments ||
    typeof value.dayAssignments !== "object"
  ) {
    return false;
  }

  if (value.mode === "setup") {
    return (
      value.candidates.length === 0 &&
      value.rejectedIds.length === 0 &&
      value.carryoverIds.length === 0 &&
      Object.keys(value.dayAssignments).length === 0
    );
  }

  const candidateIds = new Set(value.candidates.map((candidate) => candidate.id));
  if (candidateIds.size !== value.candidates.length) {
    return false;
  }

  const requiredRejections = getRequiredRejectionCount(value);
  if (
    !value.rejectedIds.every((id) => candidateIds.has(id)) ||
    value.rejectedIds.length > requiredRejections
  ) {
    return false;
  }

  const rejected = new Set(value.rejectedIds);
  if (!value.carryoverIds.every((id) => candidateIds.has(id) && !rejected.has(id))) {
    return false;
  }

  if (value.mode === "choosing") {
    return Object.keys(value.dayAssignments).length === 0;
  }

  if (
    value.rejectedIds.length !== requiredRejections ||
    getSelectedMeals(value).length !== countMealDays(value.weekPlan) ||
    getMealRequirementShortfall(value) > 0
  ) {
    return false;
  }

  const selectedIds = getSelectedMeals(value).map((candidate) => candidate.id);
  const assignedIds = Object.keys(value.dayAssignments);
  const assignedDays = Object.values(value.dayAssignments);
  const plannedMealDays = DAYS.filter((day) => isMealDayType(value.weekPlan[day]));

  return (
    assignedIds.length === selectedIds.length &&
    selectedIds.every((id) => assignedIds.includes(id)) &&
    new Set(assignedDays).size === assignedDays.length &&
    assignedDays.every((day) => plannedMealDays.includes(day)) &&
    assignmentsMeetRequirements(value, value.dayAssignments)
  );
}
