export const MAX_REJECTIONS = 3;

function candidateId(suggestion, index) {
  return `${index}-${suggestion.categoryId}-${suggestion.mealName}`;
}

export function createMenuState(suggestions, createdAt = new Date().toISOString()) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    throw new Error("Suggestions must contain at least one meal.");
  }

  return {
    version: 1,
    createdAt,
    candidates: suggestions.map((suggestion, index) => ({
      ...suggestion,
      id: candidateId(suggestion, index),
    })),
    rejectedIds: [],
    finalized: false,
  };
}

export function toggleRejection(state, candidateIdValue, maxRejections = MAX_REJECTIONS) {
  const candidateExists = state.candidates.some((candidate) => candidate.id === candidateIdValue);
  if (!candidateExists) {
    return state;
  }

  const rejected = new Set(state.rejectedIds);

  if (rejected.has(candidateIdValue)) {
    rejected.delete(candidateIdValue);
  } else {
    if (rejected.size >= maxRejections) {
      return state;
    }
    rejected.add(candidateIdValue);
  }

  const rejectedIds = [...rejected];
  return {
    ...state,
    rejectedIds,
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

export function reopenChoices(state) {
  return {
    ...state,
    finalized: false,
  };
}

export function isValidMenuState(value) {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.rejectedIds) ||
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

  return !value.finalized || value.rejectedIds.length === MAX_REJECTIONS;
}
