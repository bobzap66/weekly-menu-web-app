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
export const STATE_VERSION = 7;

const VALID_MODES = new Set(["setup", "choosing", "scheduled"]);
const VALID_DAY_TYPES = new Set(Object.values(DAY_TYPES));
const VALID_REQUIREMENTS = new Set(["quick", "bigMeal"]);

function hasStableMealId(meal) {
  return typeof meal?.stableId === "string" && meal.stableId.length > 0;
}

function candidateId(suggestion, index) {
  if (!hasStableMealId(suggestion)) {
    throw new Error("Suggestion is missing a stableId.");
  }

  return `${index}:${suggestion.stableId}`;
}

export function isMealDayType(type) {
  return type === DAY_TYPES.NORMAL;
}

function mealMeetsDayPlan(meal, dayPlan) {
  if (!meal || !dayPlan || !isMealDayType(dayPlan.type)) return false;
  if (dayPlan.quick && meal.quick !== true) return false;
  if (dayPlan.bigMeal && meal.bigMeal !== true) return false;
  return true;
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

function clonePinnedMeals(pinnedMeals = {}) {
  return Object.fromEntries(
    Object.entries(pinnedMeals).map(([day, meal]) => [day, { ...meal }]),
  );
}

function getPinnedMeals(state) {
  return state?.pinnedMeals && typeof state.pinnedMeals === "object" && !Array.isArray(state.pinnedMeals)
    ? state.pinnedMeals
    : {};
}

function isValidPinnedMeals(pinnedMeals, weekPlan) {
  if (pinnedMeals === undefined) return true;
  if (!pinnedMeals || typeof pinnedMeals !== "object" || Array.isArray(pinnedMeals)) return false;

  return Object.entries(pinnedMeals).every(
    ([day, meal]) => DAYS.includes(day) && hasStableMealId(meal) && mealMeetsDayPlan(meal, weekPlan[day]),
  );
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
  pinnedMeals = {},
) {
  if (!Array.isArray(carryoverMeals)) {
    throw new Error("Carryover meals must be an array.");
  }

  if (carryoverMeals.some((meal) => !hasStableMealId(meal))) {
    throw new Error("Carryover meals must have stable IDs.");
  }

  if (!isValidWeekPlan(weekPlan)) {
    throw new Error("Week plan is invalid.");
  }

  if (!isValidPinnedMeals(pinnedMeals, weekPlan)) {
    throw new Error("Pinned meals must match their planned dinner days.");
  }

  return {
    version: STATE_VERSION,
    mode: "setup",
    createdAt,
    weekPlan: cloneWeekPlan(weekPlan),
    pinnedMeals: clonePinnedMeals(pinnedMeals),
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
  const pinnedMeals = { ...getPinnedMeals(state) };

  if (pinnedMeals[day] && !mealMeetsDayPlan(pinnedMeals[day], next)) {
    delete pinnedMeals[day];
  }

  return {
    ...state,
    weekPlan: {
      ...state.weekPlan,
      [day]: next,
    },
    pinnedMeals,
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

  const nextDayPlan = {
    ...state.weekPlan[day],
    [requirement]: Boolean(enabled),
  };
  const pinnedMeals = { ...getPinnedMeals(state) };

  if (pinnedMeals[day] && !mealMeetsDayPlan(pinnedMeals[day], nextDayPlan)) {
    delete pinnedMeals[day];
  }

  return {
    ...state,
    weekPlan: {
      ...state.weekPlan,
      [day]: nextDayPlan,
    },
    pinnedMeals,
  };
}

export function setPinnedMeal(state, day, meal) {
  if (state.mode !== "setup" || !DAYS.includes(day) || !isMealDayType(state.weekPlan[day]?.type)) {
    return state;
  }

  const pinnedMeals = { ...getPinnedMeals(state) };

  if (meal == null) {
    delete pinnedMeals[day];
  } else {
    if (!hasStableMealId(meal) || !mealMeetsDayPlan(meal, state.weekPlan[day])) return state;
    pinnedMeals[day] = { ...meal };
  }

  return {
    ...state,
    pinnedMeals,
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

function getRequirementDayCounts(weekPlan, excludedDays = new Set()) {
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

function getOpenMealContext(meals, weekPlan) {
  const pinnedDays = new Set();
  const openMeals = [];

  for (const meal of meals) {
    if (typeof meal.pinnedDay === "string") {
      if (
        pinnedDays.has(meal.pinnedDay) ||
        !DAYS.includes(meal.pinnedDay) ||
        !mealMeetsDayPlan(meal, weekPlan[meal.pinnedDay])
      ) {
        return { valid: false, pinnedDays, openMeals };
      }
      pinnedDays.add(meal.pinnedDay);
    } else {
      openMeals.push(meal);
    }
  }

  return { valid: true, pinnedDays, openMeals };
}

function requirementShortfallForMeals(meals, weekPlan) {
  const context = getOpenMealContext(meals, weekPlan);
  if (!context.valid) return Number.POSITIVE_INFINITY;

  const requirements = getRequirementDayCounts(weekPlan, context.pinnedDays);
  const available = splitMealsByRequirement(context.openMeals);
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
  const pinnedDays = new Set();

  for (const meal of selected) {
    if (typeof meal.pinnedDay !== "string") continue;
    if (
      pinnedDays.has(meal.pinnedDay) ||
      !DAYS.includes(meal.pinnedDay) ||
      !mealMeetsDayPlan(meal, weekPlan[meal.pinnedDay])
    ) {
      return {};
    }
    assignments[meal.id] = meal.pinnedDay;
    usedIds.add(meal.id);
    pinnedDays.add(meal.pinnedDay);
  }

  const bothDays = DAYS.filter(
    (day) => !pinnedDays.has(day) && isMealDayType(weekPlan[day].type) && weekPlan[day].quick && weekPlan[day].bigMeal,
  );
  const quickDays = DAYS.filter(
    (day) => !pinnedDays.has(day) && isMealDayType(weekPlan[day].type) && weekPlan[day].quick && !weekPlan[day].bigMeal,
  );
  const bigDays = DAYS.filter(
    (day) => !pinnedDays.has(day) && isMealDayType(weekPlan[day].type) && !weekPlan[day].quick && weekPlan[day].bigMeal,
  );
  const normalDays = DAYS.filter(
    (day) => !pinnedDays.has(day) && isMealDayType(weekPlan[day].type) && !weekPlan[day].quick && !weekPlan[day].bigMeal,
  );
  const unassignedMeals = selected.filter((candidate) => !usedIds.has(candidate.id));
  const { quickOnly, bigOnly, both } = splitMealsByRequirement(unassignedMeals);
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
  pinnedMeals = {},
) {
  if (!Array.isArray(suggestions)) {
    throw new Error("Suggestions must be an array.");
  }

  if (suggestions.some((meal) => !hasStableMealId(meal))) {
    throw new Error("Suggestions must have stable IDs.");
  }

  if (!Array.isArray(deferredCarryovers)) {
    throw new Error("Deferred carryovers must be an array.");
  }

  if (deferredCarryovers.some((meal) => !hasStableMealId(meal))) {
    throw new Error("Deferred carryovers must have stable IDs.");
  }

  if (!isValidWeekPlan(weekPlan)) {
    throw new Error("Week plan is invalid.");
  }

  if (!isValidPinnedMeals(pinnedMeals, weekPlan)) {
    throw new Error("Pinned meals must match their planned dinner days.");
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
    version: STATE_VERSION,
    mode: targetMealCount === 0 ? "scheduled" : "choosing",
    createdAt,
    weekPlan: cloneWeekPlan(weekPlan),
    pinnedMeals: clonePinnedMeals(pinnedMeals),
    pendingCarryovers: deferredCarryovers.map((meal) => ({ ...meal })),
    candidates,
    rejectedIds: [],
    carryoverIds: [],
    dayAssignments: {},
  };

  if (targetMealCount > 0 && getRequiredRejectionCount(state) === 0 && getMealRequirementShortfall(state) === 0) {
    const assignments = createDayAssignments(candidates, [], weekPlan);
    if (Object.keys(assignments).length === targetMealCount) {
      state.mode = "scheduled";
      state.dayAssignments = assignments;
    }
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

function getOpenSelectedMealContext(state) {
  const context = getOpenMealContext(getSelectedMeals(state), state.weekPlan);
  return context.valid ? context : { pinnedDays: new Set(), openMeals: [] };
}

export function getQuickMealShortfall(state) {
  const { pinnedDays, openMeals } = getOpenSelectedMealContext(state);
  const quickNeeded = DAYS.filter(
    (day) => !pinnedDays.has(day) && isMealDayType(state.weekPlan[day].type) && state.weekPlan[day].quick,
  ).length;
  const selectedQuick = openMeals.filter((candidate) => candidate.quick === true).length;
  return Math.max(0, quickNeeded - selectedQuick);
}

export function getBigMealShortfall(state) {
  const { pinnedDays, openMeals } = getOpenSelectedMealContext(state);
  const bigNeeded = DAYS.filter(
    (day) => !pinnedDays.has(day) && isMealDayType(state.weekPlan[day].type) && state.weekPlan[day].bigMeal,
  ).length;
  const selectedBig = openMeals.filter((candidate) => candidate.bigMeal === true).length;
  return Math.max(0, bigNeeded - selectedBig);
}

export function getCombinedMealShortfall(state) {
  const { pinnedDays, openMeals } = getOpenSelectedMealContext(state);
  const bothNeeded = DAYS.filter(
    (day) =>
      !pinnedDays.has(day) &&
      isMealDayType(state.weekPlan[day].type) &&
      state.weekPlan[day].quick &&
      state.weekPlan[day].bigMeal,
  ).length;
  const selectedBoth = openMeals.filter(
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

  const assignments = createDayAssignments(state.candidates, state.rejectedIds, state.weekPlan);
  if (Object.keys(assignments).length !== getSelectedMeals(state).length) {
    return {
      ...state,
      mode: "choosing",
      dayAssignments: {},
    };
  }

  return {
    ...state,
    mode: "scheduled",
    dayAssignments: assignments,
  };
}

export function toggleRejection(state, candidateIdValue) {
  if (state.mode !== "choosing") return state;

  const candidate = state.candidates.find((item) => item.id === candidateIdValue);
  if (!candidate) return state;

  const rejected = new Set(state.rejectedIds);
  const carryovers = new Set(state.carryoverIds);

  if (rejected.has(candidateIdValue)) {
    rejected.delete(candidateIdValue);
  } else {
    if (typeof candidate.pinnedDay === "string") return state;
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
    if (seen.has(meal.stableId)) return false;
    seen.add(meal.stableId);
    return true;
  });

  return createPlanningState(
    uniqueCarryovers,
    state.weekPlan,
    state.createdAt,
    getPinnedMeals(state),
  );
}

function pinsMatchCandidates(value) {
  const pins = getPinnedMeals(value);
  const pinnedCandidates = value.candidates.filter((candidate) => typeof candidate.pinnedDay === "string");
  const pinEntries = Object.entries(pins);

  if (pinnedCandidates.length !== pinEntries.length) return false;

  return pinEntries.every(([day, meal]) =>
    pinnedCandidates.some(
      (candidate) => candidate.pinnedDay === day && candidate.stableId === meal.stableId,
    ),
  );
}

export function isValidMenuState(value) {
  if (
    !value ||
    value.version !== STATE_VERSION ||
    !VALID_MODES.has(value.mode) ||
    typeof value.createdAt !== "string" ||
    !isValidWeekPlan(value.weekPlan) ||
    !isValidPinnedMeals(value.pinnedMeals, value.weekPlan) ||
    !Array.isArray(value.pendingCarryovers) ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.rejectedIds) ||
    !Array.isArray(value.carryoverIds) ||
    !value.dayAssignments ||
    typeof value.dayAssignments !== "object"
  ) {
    return false;
  }

  if (
    !value.pendingCarryovers.every(hasStableMealId) ||
    !value.candidates.every(hasStableMealId)
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

  if (!value.candidates.every((candidate) => typeof candidate.id === "string" && candidate.id.length > 0)) {
    return false;
  }

  if (!pinsMatchCandidates(value)) return false;

  const candidateIds = new Set(value.candidates.map((candidate) => candidate.id));
  if (candidateIds.size !== value.candidates.length) return false;

  const candidateById = new Map(value.candidates.map((candidate) => [candidate.id, candidate]));
  const requiredRejections = getRequiredRejectionCount(value);
  if (
    !value.rejectedIds.every((id) => candidateIds.has(id)) ||
    value.rejectedIds.some((id) => typeof candidateById.get(id)?.pinnedDay === "string") ||
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
