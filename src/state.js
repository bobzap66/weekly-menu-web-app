export const MAX_REJECTIONS = 3;
export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function candidateId(suggestion, index) {
  return `${index}-${suggestion.categoryId}-${suggestion.mealName}`;
}

function createDayAssignments(candidates, rejectedIds) {
  const rejected = new Set(rejectedIds);
  const selected = candidates.filter((candidate) => !rejected.has(candidate.id));

  return Object.fromEntries(selected.map((candidate, index) => [candidate.id, DAYS[index]]));
}

export function createMenuState(suggestions, createdAt = new Date().toISOString()) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    throw new Error("Suggestions must contain at least one meal.");
  }

  return {
    version: 3,
    createdAt,
    candidates: suggestions.map((suggestion, index) => ({
      ...suggestion,
      id: candidateId(suggestion, index),
    })),
    rejectedIds: [],
    carryoverIds: [],
    dayAssignments: {},
    finalized: false,
  };
}

export function toggleRejection(state, candidateIdValue, maxRejections = MAX_REJECTIONS) {
  const candidateExists = state.candidates.some((candidate) => candidate.id === candidateIdValue);
  if (!candidateExists) {
    return state;
  }

  const rejected = new Set(state.rejectedIds);
  const carryovers = new Set(state.carryoverIds);

  if (rejected.has(candidateIdValue)) {
    rejected.delete(candidateIdValue);
  } else {
    if (rejected.size >= maxRejections) {
      return state;
    }
    rejected.add(candidateIdValue);
    carryovers.delete(candidateIdValue);
  }

  const rejectedIds = [...rejected];
  const finalized = rejectedIds.length === maxRejections;

  return {
    ...state,
    rejectedIds,
    carryoverIds: [...carryovers],
    dayAssignments: finalized ? createDayAssignments(state.candidates, rejectedIds) : {},
    finalized,
  };
}

export function clearRejections(state) {
  return {
    ...state,
    rejectedIds: [],
    dayAssignments: {},
    finalized: false,
  };
}

export function getSelectedMeals(state) {
  const rejected = new Set(state.rejectedIds);
  return state.candidates.filter((candidate) => !rejected.has(candidate.id));
}

export function toggleCarryover(state, candidateIdValue) {
  if (!state.finalized) {
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
  return getSelectedMeals(state).filter((candidate) => carryovers.has(candidate.id));
}

export function getEatenMeals(state) {
  const carryovers = new Set(state.carryoverIds);
  return getSelectedMeals(state).filter((candidate) => !carryovers.has(candidate.id));
}

export function assignMealDay(state, candidateIdValue, day) {
  if (!state.finalized || !DAYS.includes(day) || !(candidateIdValue in state.dayAssignments)) {
    return state;
  }

  const assignments = { ...state.dayAssignments };
  const previousDay = assignments[candidateIdValue];
  const occupyingEntry = Object.entries(assignments).find(
    ([otherId, assignedDay]) => otherId !== candidateIdValue && assignedDay === day,
  );

  assignments[candidateIdValue] = day;
  if (occupyingEntry) {
    const [otherId] = occupyingEntry;
    assignments[otherId] = previousDay;
  }

  return {
    ...state,
    dayAssignments: assignments,
  };
}

export function getScheduledMeals(state) {
  const selected = getSelectedMeals(state);
  return DAYS.map((day) => ({
    day,
    meal: selected.find((candidate) => state.dayAssignments[candidate.id] === day),
  })).filter((entry) => entry.meal);
}

export function reopenChoices(state) {
  return {
    ...state,
    dayAssignments: {},
    finalized: false,
  };
}

export function isValidMenuState(value) {
  if (
    !value ||
    value.version !== 3 ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.rejectedIds) ||
    !Array.isArray(value.carryoverIds) ||
    !value.dayAssignments ||
    typeof value.dayAssignments !== "object" ||
    typeof value.finalized !== "boolean"
  ) {
    return false;
  }

  const candidateIds = new Set(value.candidates.map((candidate) => candidate.id));
  if (candidateIds.size !== value.candidates.length) {
    return false;
  }

  if (!value.rejectedIds.every((id) => candidateIds.has(id)) || value.rejectedIds.length > MAX_REJECTIONS) {
    return false;
  }

  const rejected = new Set(value.rejectedIds);
  if (!value.carryoverIds.every((id) => candidateIds.has(id) && !rejected.has(id))) {
    return false;
  }

  if (value.finalized) {
    if (value.rejectedIds.length !== MAX_REJECTIONS) {
      return false;
    }

    const selectedIds = value.candidates
      .filter((candidate) => !rejected.has(candidate.id))
      .map((candidate) => candidate.id);
    const assignedIds = Object.keys(value.dayAssignments);
    const assignedDays = Object.values(value.dayAssignments);

    if (
      assignedIds.length !== selectedIds.length ||
      !selectedIds.every((id) => assignedIds.includes(id)) ||
      new Set(assignedDays).size !== assignedDays.length ||
      !assignedDays.every((day) => DAYS.includes(day))
    ) {
      return false;
    }
  }

  return true;
}
