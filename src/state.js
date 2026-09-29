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
  LEFTOVERS: "leftovers",
  EATING_OUT: "eating-out",
  NO_MEAL: "no-meal",
};

export const DAY_TYPE_LABELS = {
  [DAY_TYPES.NORMAL]: "Dinner",
  [DAY_TYPES.LEFTOVERS]: "Leftovers",
  [DAY_TYPES.EATING_OUT]: "Eating Out",
  [DAY_TYPES.NO_MEAL]: "No Meal Planned",
};

export const DEFAULT_EXTRA_CHOICES = 3;

const VALID_MODES = new Set(["setup", "choosing", "scheduled"]);
const VALID_DAY_TYPES = new Set(Object.values(DAY_TYPES));
const VALID_REQUIREMENTS = new Set(["quick", "bigMeal"]);

function candidateId(suggestion, index) {
  return `${index}-${suggestion.categoryId}-${suggestion.mealName}`;
}

export function isMealDayType(type) {
  return type === DAY_TYPES.NORMAL;
}

function createDayPlan(type = DAY_TYPES.NORMAL) {
  return {
    type,
    quick: false,
    bigMeal: false,
  };
}

function cloneWeekPlan(weekPlan) {
  return Object.fromEntries(DAYS.map((day) => [day, { ...weekPlan[day] }]));
}

export function createWeekPlan(defaultType = DAY_TYPES.NORMAL) {
  if (!VALID_DAY_TYPES.has(defaultType)) {
    throw new Error("Invalid default day type.");
  }

  return Object.fromEntries(DAYS.map((day) => [day, createDayPlan(defaultType)]));
}

function isValidDayPlan(dayPlan) {
  if (
    !dayPlan ||
    typeof dayPlan !== "object" ||
    !VALID_DAY_TYPES.has(dayPlan.type) ||
    typeof dayPlan.quick !== "boolean" ||
    typeof dayPlan.bigMeal !== "boolean"
  ) {
    return false;
  }

  return isMealDayType(dayPlan.type) || (!dayPlan.quick && !dayPlan.bigMeal);
}

export function isValidWeekPlan(weekPlan) {
  return Boolean(
    weekPlan &&
      typeof weekPlan === "object" &&
      DAYS.every((day) => isValidDayPlan(weekPlan[day])),
  );
}

export function countMealDays(weekPlan) {
  if (!isValidWeekPlan(weekPlan)) {
    return 0;
  }

  return DAYS.filter((day) => isMealDayType(weekPlan[day].type)).length;
}

export function countQuickMealDays(weekPlan) {
  if (!isValidWeekPlan(weekPlan)) {
    return 0;
  }

  return DAYS.filter((day) => isMealDayType(weekPlan[day].type) && weekPlan[day].quick).length;
}

export function countBigMealDays(weekPlan) {
  if (!isValidWeekPlan(weekPlan)) {
    return 0;
  }

  return DAYS.filter((day) => isMealDayType(weekPlan[day].type) && weekPlan[day].bigMeal).length;
}

export function countCombinedMealDays(weekPlan) {
  if (!isValidWeekPlan(weekPlan)) {
    return 0;
  }

  return DAYS.filter(
    (day) => isMealDayType(weekPlan[day].type) && weekPlan[day].quick && weekPlan[day].bigMeal,
  ).length;
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
    version: 6,
    mode: "setup",
    createdAt,
    weekPlan: cloneWeekPlan(weekPlan),
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

  const current = state.weekPlan[day];
  const next = isMealDayType(type)
    ? { type, quick: current.quick === true, bigMeal: current.bigMeal === true }
    : createDayPlan(type);

  return {
    ...state,
    weekPlan: {
      ...state.weekPlan,
      [day]: next,
    },
  };
}

export function setDayRequirement(state, day, requirement, enabled) {
  if (
    state.mode !== "setup" ||
    !DAYS.includes(day) ||
    !VALID_REQUIREMENTS.has(requirement) ||
    !isMealDayType(state.weekPlan[day]?.type)
  ) {
    return state;
  }

  return {
    ...state,
    weekPlan: {
      ...state.weekPlan,
      [day]: {
        ...state.weekPlan[day],
        [requirement]: Boolean(enabled),
      },
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

function getRequirementDayCounts(weekPlan) {
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

function requirementShortfallForMeals(meals, weekPlan) {
  const requirements = getRequirementDayCounts(weekPlan);
  const available = splitMealsByRequirement(meals);
  const missingBoth = Math.max(0, requirements.both - available.both.length);
  const remainingBoth = Math.max(0, available.both.length - requirements.both);
  const quickDeficit = Math.max(0, requirements.quickOnly - available.quickOnly.length);
  const bigDeficit = Math.max(0, requirements.bigOnly - available.bigOnly.length);

  return missingBoth + Math.max(0, quickDeficit + bigDeficit - remainingBoth);
}

function createDayAssignments(candidates, rejectedIds, weekPlan) {
  const rejected = new Set(rejectedIds);
  const selected = candidates.filter((candidate) => !rejected.has(candidate.id));

  if (requirementShortfallForMeals(selected, weekPlan) > 0) {
    return {};
  }

  const assignments = {};
  const usedIds = new Set();
  const bothDays = DAYS.filter(
    (day) => isMealDayType(weekPlan[day].type) && weekPlan[day].quick && weekPlan[day].bigMeal,
  );
  const quickDays = DAYS.filter(
    (day) => isMealDayType(weekPlan[day].type) && weekPlan[day].quick && !weekPlan[day].bigMeal,
  );
  const bigDays = DAYS.filter(
    (day) => isMealDayType(weekPlan[day].type) && !weekPlan[day].quick && weekPlan[day].bigMeal,
  );
  const normalDays = DAYS.filter(
    (day) => isMealDayType(weekPlan[day].type) && !weekPlan[day].quick && !weekPlan[day].bigMeal,
  );
  const { quickOnly, bigOnly, both } = splitMealsByRequirement(selected);
  const remainingBoth = [...both];

  for (const day of bothDays) {
    const meal = remainingBoth.shift();
    if (!meal) return {};
    assignments[meal.id] = day;
    usedIds.add(meal.id);
  }

  for (const day of quickDays) {
    const meal = quickOnly.shift() ?? remainingBoth.shift();
    if (!meal) return {};
    assignments[meal.id] = day;
    usedIds.add(meal.id);
  }

  for (const day of bigDays) {
    const meal = bigOnly.shift() ?? remainingBoth.shift();
    if (!meal) return {};
    assignments[meal.id] = day;
    usedIds.add(meal.id);
  }

  const remainingMeals = selected.filter((candidate) => !usedIds.has(candidate.id));
  for (let index = 0; index < normalDays.length; index += 1) {
    const meal = remainingMeals[index];
    if (!meal) return {};
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
    version: 6,
    mode: targetMealCount === 0 ? "scheduled" : "choosing",
    createdAt,
    weekPlan: cloneWeekPlan(weekPlan),
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

export function getCombinedMealShortfall(state) {
  const bothNeeded = countCombinedMealDays(state.weekPlan);
  const selectedBoth = getSelectedMeals(state).filter(
    (candidate) => candidate.quick === true && candidate.bigMeal === true,
  ).length;
  return Math.max(0, bothNeeded - selectedBoth);
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
  if (state.mode !== "choosing") return state;

  const candidateExists = state.candidates.some((candidate) => candidate.id === candidateIdValue);
  if (!candidateExists) return state;

  const rejected = new Set(state.rejectedIds);
  const carryovers = new Set(state.carryoverIds);

  if (rejected.has(candidateIdValue)) {
    rejected.delete(candidateIdValue);
  } else {
    if (rejected.size >= getRequiredRejectionCount(state)) return state;
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
  if (state.mode !== "choosing") return state;

  return {
    ...state,
    rejectedIds: [],
    dayAssignments: {},
  };
}

export function toggleCarryover(state, candidateIdValue) {
  if (state.mode !== "scheduled") return state;

  const selected = new Set(getSelectedMeals(state).map((candidate) => candidate.id));
  if (!selected.has(candidateIdValue)) return state;

  const carryovers = new Set(state.carryoverIds);
  if (carryovers.has(candidateIdValue)) carryovers.delete(candidateIdValue);
  else carryovers.add(candidateIdValue);

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

function mealMeetsDayPlan(meal, dayPlan) {
  if (!meal || !isMealDayType(dayPlan.type)) return false;
  if (dayPlan.quick && meal.quick !== true) return false;
  if (dayPlan.bigMeal && meal.bigMeal !== true) return false;
  return true;
}

function assignmentsMeetRequirements(state, assignments) {
  const candidateById = new Map(state.candidates.map((candidate) => [candidate.id, candidate]));

  return DAYS.every((day) => {
    const dayPlan = state.weekPlan[day];
    if (!isMealDayType(dayPlan.type)) return true;

    const mealId = Object.entries(assignments).find(([, assignedDay]) => assignedDay === day)?.[0];
    return mealId ? mealMeetsDayPlan(candidateById.get(mealId), dayPlan) : false;
  });
}

export function canAssignMealDay(state, candidateIdValue, day) {
  if (
    state.mode !== "scheduled" ||
    !isMealDayType(state.weekPlan[day]?.type) ||
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
  if (occupyingEntry) assignments[occupyingEntry[0]] = previousDay;

  return assignmentsMeetRequirements(state, assignments);
}

export function assignMealDay(state, candidateIdValue, day) {
  if (!canAssignMealDay(state, candidateIdValue, day)) return state;

  const assignments = { ...state.dayAssignments };
  const previousDay = assignments[candidateIdValue];
  const occupyingEntry = Object.entries(assignments).find(
    ([otherId, assignedDay]) => otherId !== candidateIdValue && assignedDay === day,
  );

  assignments[candidateIdValue] = day;
  if (occupyingEntry) assignments[occupyingEntry[0]] = previousDay;

  return {
    ...state,
    dayAssignments: assignments,
  };
}

export function getScheduledWeek(state) {
  const selected = getSelectedMeals(state);

  return DAYS.map((day) => ({
    day,
    type: state.weekPlan[day].type,
    quickRequired: state.weekPlan[day].quick,
    bigMealRequired: state.weekPlan[day].bigMeal,
    meal: isMealDayType(state.weekPlan[day].type)
      ? selected.find((candidate) => state.dayAssignments[candidate.id] === day)
      : null,
  }));
}

export function reopenChoices(state) {
  if (state.mode !== "scheduled" || countMealDays(state.weekPlan) === 0) return state;

  return {
    ...state,
    mode: "choosing",
    dayAssignments: {},
  };
}

export function reopenWeekSetup(state) {
  if (state.mode === "setup") return state;

  const rejected = new Set(state.rejectedIds);
  const marked = new Set(state.carryoverIds);
  const carryovers = [
    ...state.pendingCarryovers,
    ...state.candidates.filter(
      (candidate) =>
        !rejected.has(candidate.id) &&
        (candidate.carriedOver === true || marked.has(candidate.id)),
    ),
  ];
  const seen = new Set();
  const uniqueCarryovers = carryovers.filter((meal) => {
    const key = meal.mealKey ?? `${meal.categoryId}:${meal.mealName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return createPlanningState(uniqueCarryovers, state.weekPlan, state.createdAt);
}

export function isValidMenuState(value) {
  if (
    !value ||
    value.version !== 6 ||
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
  if (candidateIds.size !== value.candidates.length) return false;

  const requiredRejections = getRequiredRejectionCount(value);
  if (
    !value.rejectedIds.every((id) => candidateIds.has(id)) ||
    value.rejectedIds.length > requiredRejections
  ) {
    return false;
  }

  const rejected = new Set(value.rejectedIds);
  if (!value.carryoverIds.every((id) => candidateIds.has(id) && !rejected.has(id))) return false;

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
  const plannedMealDays = DAYS.filter((day) => isMealDayType(value.weekPlan[day].type));

  return (
    assignedIds.length === selectedIds.length &&
    selectedIds.every((id) => assignedIds.includes(id)) &&
    new Set(assignedDays).size === assignedDays.length &&
    assignedDays.every((day) => plannedMealDays.includes(day)) &&
    assignmentsMeetRequirements(value, value.dayAssignments)
  );
}
