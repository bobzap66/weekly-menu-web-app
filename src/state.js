export const MAX_REJECTIONS = 3;

function candidateId(suggestion, index) {
  return `${index}-${suggestion.categoryId}-${suggestion.mealName}`;
}

export function createMenuState(suggestions, createdAt = new Date().toISOString()) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    throw new Error("Suggestions must contain at least one meal.");
  }

  return {
    version: 2,
    createdAt,
    candidates: suggestions.map((suggestion, index) => ({
      ...suggestion,
      id: candidateId(suggestion, index),
    })),
    rejectedIds: [],
    carryoverIds: [],
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
  return {
    ...state,
    rejectedIds,
    carryoverIds: [...carryovers],
    finalized: rejectedIds.length === maxRejections,
  };
}

export function clearRejections(state) {
  return {
    ...state,
    rejectedIds: [],
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

export function reopenChoices(state) {
  return {
    ...state,
    finalized: false,
  };
}

export function isValidMenuState(value) {
  if (
    !value ||
    value.version !== 2 ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.rejectedIds) ||
    !Array.isArray(value.carryoverIds) ||
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

  return !value.finalized || value.rejectedIds.length === MAX_REJECTIONS;
}
