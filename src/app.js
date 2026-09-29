import { menuData } from "./data.js";
import {
  addWeekToHistory,
  createHistory,
  isValidHistory,
} from "./history.js";
import {
  DAYS,
  MAX_REJECTIONS,
  assignMealDay,
  clearRejections,
  createMenuState,
  getCarryoverMeals,
  getEatenMeals,
  getScheduledMeals,
  isValidMenuState,
  reopenChoices,
  toggleCarryover,
  toggleRejection,
} from "./state.js";
import { buildNextWeekSuggestions } from "./week.js";

const STORAGE_KEY = "weekly-menu:v3";
const HISTORY_STORAGE_KEY = "weekly-menu:history:v1";

const menuList = document.querySelector("#menu-list");
const stepLabel = document.querySelector("#step-label");
const menuHeading = document.querySelector("#menu-heading");
const selectionStatus = document.querySelector("#selection-status");
const primaryButton = document.querySelector("#primary-button");
const secondaryButton = document.querySelector("#secondary-button");

function createFreshState(carryoverMeals = []) {
  return createMenuState(buildNextWeekSuggestions(menuData, history, carryoverMeals));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidMenuState(saved) && saved.candidates.length === menuData.candidateCount) {
      return saved;
    }
  } catch {
    // Ignore unavailable storage or malformed saved data and generate a fresh week.
  }

  return null;
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY));
    if (isValidHistory(saved)) {
      return saved;
    }
  } catch {
    // Ignore unavailable storage or malformed history and start clean.
  }

  return createHistory();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The app still works without persistence if storage is unavailable.
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // The app still works without history if storage is unavailable.
  }
}

function currentCarryoverCandidates() {
  const rejected = new Set(state.rejectedIds);
  const marked = new Set(state.carryoverIds);
  return state.candidates.filter(
    (candidate) => (candidate.carriedOver || marked.has(candidate.id)) && !rejected.has(candidate.id),
  );
}

function startFreshWeek() {
  let carryovers = [];

  if (state.finalized) {
    carryovers = getCarryoverMeals(state);
    history = addWeekToHistory(history, getEatenMeals(state), state.createdAt);
    saveHistory();
  } else {
    carryovers = currentCarryoverCandidates();
  }

  state = createFreshState(carryovers);
  saveState();
  render();
}

function createMealContent(meal) {
  const mealName = document.createElement("span");
  const categoryName = document.createElement("span");

  mealName.className = "meal-name";
  categoryName.className = "category-name";
  mealName.textContent = meal.mealName;
  categoryName.textContent = meal.categoryName;

  return { mealName, categoryName };
}

function createCarriedOverLabel() {
  const label = document.createElement("span");
  label.className = "carried-over-label";
  label.textContent = "Carried over";
  return label;
}

function renderCandidates() {
  const rejected = new Set(state.rejectedIds);
  const fragment = document.createDocumentFragment();

  stepLabel.textContent = "This week’s candidates";
  menuHeading.textContent = "Choose seven dinners";

  const rejectedCount = state.rejectedIds.length;
  const remaining = MAX_REJECTIONS - rejectedCount;
  const carryoverCount = currentCarryoverCandidates().length;

  if (rejectedCount === 0) {
    selectionStatus.textContent = carryoverCount > 0
      ? `${carryoverCount} ${carryoverCount === 1 ? "dinner was" : "dinners were"} carried over from last week. Tap three meals you do not want this week.`
      : "Tap three meals you do not want this week. Recent dinners are less likely to repeat.";
  } else {
    selectionStatus.textContent = `${rejectedCount} of ${MAX_REJECTIONS} removed — choose ${remaining} more.`;
  }

  for (const candidate of state.candidates) {
    const item = document.createElement("li");
    const choice = document.createElement("button");
    const content = createMealContent(candidate);
    const isRejected = rejected.has(candidate.id);
    const isCarriedOver = candidate.carriedOver || state.carryoverIds.includes(candidate.id);

    item.className = `menu-item${isRejected ? " is-rejected" : ""}${isCarriedOver ? " is-carried-over" : ""}`;
    choice.className = "meal-choice";
    choice.type = "button";
    choice.setAttribute("aria-pressed", String(isRejected));
    choice.setAttribute(
      "aria-label",
      `${isRejected ? "Restore" : "Remove"} ${candidate.mealName}, ${candidate.categoryName}`,
    );

    choice.append(content.mealName, content.categoryName);

    if (isCarriedOver && !isRejected) {
      choice.append(createCarriedOverLabel());
    }

    if (isRejected) {
      const removedLabel = document.createElement("span");
      removedLabel.className = "removed-label";
      removedLabel.textContent = "Removed";
      choice.append(removedLabel);
    }

    choice.addEventListener("click", () => {
      state = toggleRejection(state, candidate.id);
      saveState();
      render();
    });

    item.append(choice);
    fragment.append(item);
  }

  menuList.replaceChildren(fragment);
  primaryButton.textContent = carryoverCount > 0 ? "Reroll other ideas" : "Roll 10 new ideas";
  secondaryButton.textContent = "Clear removals";
  secondaryButton.hidden = rejectedCount === 0;
}

function createDaySelect(meal, currentDay) {
  const select = document.createElement("select");
  select.className = "day-select";
  select.setAttribute("aria-label", `Day for ${meal.mealName}`);

  for (const day of DAYS) {
    const option = document.createElement("option");
    option.value = day;
    option.textContent = day;
    option.selected = day === currentDay;
    select.append(option);
  }

  select.addEventListener("change", () => {
    state = assignMealDay(state, meal.id, select.value);
    saveState();
    render();
  });

  return select;
}

function createCarryoverToggle(meal) {
  const marked = state.carryoverIds.includes(meal.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `carryover-toggle${marked ? " is-marked" : ""}`;
  button.setAttribute("aria-pressed", String(marked));
  button.textContent = marked ? "Carrying to next week" : "Didn’t eat — carry over";

  button.addEventListener("click", () => {
    state = toggleCarryover(state, meal.id);
    saveState();
    render();
  });

  return button;
}

function renderFinalMenu() {
  const fragment = document.createDocumentFragment();
  const carryoverCount = state.carryoverIds.length;

  stepLabel.textContent = "This week’s menu";
  menuHeading.textContent = "Seven dinners, scheduled";
  selectionStatus.textContent = carryoverCount > 0
    ? `${carryoverCount} ${carryoverCount === 1 ? "dinner is" : "dinners are"} marked to carry into next week. Change days anytime.`
    : "Assign each dinner to a day. If you do not get to one, mark it to carry into next week.";

  for (const { day, meal } of getScheduledMeals(state)) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const topRow = document.createElement("div");
    const mealContent = createMealContent(meal);

    item.className = "menu-item final-item";
    content.className = "meal-content scheduled-content";
    topRow.className = "scheduled-top-row";
    topRow.append(createDaySelect(meal, day));

    const nameGroup = document.createElement("div");
    nameGroup.className = "meal-name-group";
    nameGroup.append(mealContent.mealName, mealContent.categoryName);

    content.append(topRow, nameGroup, createCarryoverToggle(meal));
    item.append(content);
    fragment.append(item);
  }

  menuList.replaceChildren(fragment);
  primaryButton.textContent = "Start next week";
  secondaryButton.textContent = "Change choices";
  secondaryButton.hidden = false;
}

function render() {
  if (state.finalized) {
    renderFinalMenu();
  } else {
    renderCandidates();
  }
}

primaryButton.addEventListener("click", startFreshWeek);
secondaryButton.addEventListener("click", () => {
  state = state.finalized ? reopenChoices(state) : clearRejections(state);
  saveState();
  render();
});

let history = loadHistory();
let state = loadState();
if (!state) {
  state = createFreshState();
  saveState();
}
render();
