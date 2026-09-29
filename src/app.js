import { menuData } from "./data.js";
import { generateMenu } from "./generator.js";
import {
  MAX_REJECTIONS,
  clearRejections,
  createMenuState,
  getSelectedMeals,
  isValidMenuState,
  reopenChoices,
  toggleRejection,
} from "./state.js";

const STORAGE_KEY = "weekly-menu:v1";

const menuList = document.querySelector("#menu-list");
const stepLabel = document.querySelector("#step-label");
const menuHeading = document.querySelector("#menu-heading");
const selectionStatus = document.querySelector("#selection-status");
const primaryButton = document.querySelector("#primary-button");
const secondaryButton = document.querySelector("#secondary-button");

function createFreshState() {
  return createMenuState(generateMenu(menuData));
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

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The app still works without persistence if storage is unavailable.
  }
}

function startFreshWeek() {
  state = createFreshState();
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

function renderCandidates() {
  const rejected = new Set(state.rejectedIds);
  const fragment = document.createDocumentFragment();

  stepLabel.textContent = "This week’s candidates";
  menuHeading.textContent = "Choose seven dinners";

  const rejectedCount = state.rejectedIds.length;
  const remaining = MAX_REJECTIONS - rejectedCount;
  selectionStatus.textContent =
    rejectedCount === 0
      ? "Tap three meals you do not want this week."
      : `${rejectedCount} of ${MAX_REJECTIONS} removed — choose ${remaining} more.`;

  for (const candidate of state.candidates) {
    const item = document.createElement("li");
    const choice = document.createElement("button");
    const content = createMealContent(candidate);
    const isRejected = rejected.has(candidate.id);

    item.className = `menu-item${isRejected ? " is-rejected" : ""}`;
    choice.className = "meal-choice";
    choice.type = "button";
    choice.setAttribute("aria-pressed", String(isRejected));
    choice.setAttribute(
      "aria-label",
      `${isRejected ? "Restore" : "Remove"} ${candidate.mealName}, ${candidate.categoryName}`,
    );

    choice.append(content.mealName, content.categoryName);

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
  primaryButton.textContent = "Roll 10 new ideas";
  secondaryButton.textContent = "Clear removals";
  secondaryButton.hidden = rejectedCount === 0;
}

function renderFinalMenu() {
  const fragment = document.createDocumentFragment();

  stepLabel.textContent = "This week’s menu";
  menuHeading.textContent = "Seven dinners, decided";
  selectionStatus.textContent = "Saved on this device — this menu will still be here when you come back.";

  for (const meal of getSelectedMeals(state)) {
    const item = document.createElement("li");
    const content = document.createElement("div");
    const mealContent = createMealContent(meal);

    item.className = "menu-item final-item";
    content.className = "meal-content";
    content.append(mealContent.mealName, mealContent.categoryName);
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

let state = loadState();
if (!state) {
  state = createFreshState();
  saveState();
}
render();
