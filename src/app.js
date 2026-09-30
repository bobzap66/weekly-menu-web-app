import { menuData } from "./data.js?v=0.15.0";
import {
  addWeekToHistory,
  createHistory,
  isValidHistory,
} from "./history.js?v=0.15.0";
import {
  DAYS,
  DAY_TYPE_LABELS,
  assignMealDay,
  canAssignMealDay,
  clearRejections,
  countBigMealDays,
  countCombinedMealDays,
  countMealDays,
  countQuickMealDays,
  createMenuState,
  createPlanningState,
  getBigMealShortfall,
  getCarryoverMeals,
  getCombinedMealShortfall,
  getEatenMeals,
  getMealRequirementShortfall,
  getQuickMealShortfall,
  getRequiredRejectionCount,
  getScheduledWeek,
  isMealDayType,
  isValidMenuState,
  reopenChoices,
  reopenWeekSetup,
  setDayRequirement,
  setDayType,
  toggleCarryover,
  toggleRejection,
} from "./state.js?v=0.15.0";
import { getPlannerStorageKeys } from "./planner-storage.js?v=0.15.0";
import {
  CLOUD_PLANNER_SCHEMA_VERSION,
  canUseCloudPlanner,
  loadCloudPlanner,
  saveCloudPlanner,
  subscribeCloudPlanner,
} from "./planner-sync.js?v=0.15.0";
import { buildNextWeekSuggestions } from "./week.js?v=0.15.0";

const activeListId = document.documentElement.dataset.activeListId;
const activeListName = document.documentElement.dataset.activeListName || "Meal List";
const plannerStorageKeys = getPlannerStorageKeys(activeListId);
const STORAGE_KEY = plannerStorageKeys.state;
const HISTORY_STORAGE_KEY = plannerStorageKeys.history;
const NOTHING_NEW_STORAGE_KEY = plannerStorageKeys.nothingNew;

const menuList = document.querySelector("#menu-list");
const stepLabel = document.querySelector("#step-label");
const menuHeading = document.querySelector("#menu-heading");
const selectionStatus = document.querySelector("#selection-status");
const primaryButton = document.querySelector("#primary-button");
const secondaryButton = document.querySelector("#secondary-button");
const tertiaryButton = document.querySelector("#tertiary-button");
const activeListSummary = document.querySelector("#active-list-summary");

const cloudPlanningRequested = canUseCloudPlanner();
let cloudPlanningActive = false;
let cloudSaveTimer = null;
let cloudWritePending = false;
let unsubscribeCloudPlanner = null;

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidMenuState(saved)) return saved;
  } catch {
    // Ignore unavailable storage or malformed saved data and start a fresh planner.
  }

  return null;
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY));
    if (isValidHistory(saved)) return saved;
  } catch {
    // Ignore unavailable storage or malformed history and start clean.
  }

  return createHistory();
}

function loadNothingNew() {
  try {
    return localStorage.getItem(NOTHING_NEW_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function cacheState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The app still works without a local cache if storage is unavailable.
  }
}

function cacheHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // The app still works without a local cache if storage is unavailable.
  }
}

function cacheNothingNew() {
  try {
    localStorage.setItem(NOTHING_NEW_STORAGE_KEY, String(nothingNew));
  } catch {
    // The app still works without a local cache if storage is unavailable.
  }
}

function plannerSnapshot() {
  return { state, history, nothingNew };
}

function isValidCloudPlanner(value) {
  return Boolean(
    value &&
    value.schemaVersion === CLOUD_PLANNER_SCHEMA_VERSION &&
    isValidMenuState(value.state) &&
    isValidHistory(value.history) &&
    typeof value.nothingNew === "boolean"
  );
}

function samePlannerSnapshot(value) {
  if (!isValidCloudPlanner(value)) return false;
  return JSON.stringify(value.state) === JSON.stringify(state)
    && JSON.stringify(value.history) === JSON.stringify(history)
    && value.nothingNew === nothingNew;
}

function updatePersistenceSummary() {
  if (!activeListSummary) return;

  const persistenceText = cloudPlanningActive
    ? "Household plan: cloud synced"
    : cloudPlanningRequested
      ? "Household plan: local fallback"
      : "Plan saved on this browser";

  activeListSummary.textContent = `List: ${activeListName} · ${persistenceText}`;
  activeListSummary.hidden = false;
}

function queueCloudSave() {
  if (!cloudPlanningActive) return;

  cloudWritePending = true;
  if (cloudSaveTimer) window.clearTimeout(cloudSaveTimer);

  cloudSaveTimer = window.setTimeout(async () => {
    cloudSaveTimer = null;
    try {
      await saveCloudPlanner(activeListId, plannerSnapshot());
    } catch (error) {
      console.warn("Could not sync the household planner to Firestore. Local changes are still cached in this browser.", error);
    } finally {
      cloudWritePending = false;
    }
  }, 150);
}

function saveState() {
  cacheState();
  queueCloudSave();
}

function saveHistory() {
  cacheHistory();
  queueCloudSave();
}

function saveNothingNew() {
  cacheNothingNew();
  queueCloudSave();
}

function applyCloudPlanner(value) {
  if (!isValidCloudPlanner(value)) return false;

  state = value.state;
  history = value.history;
  nothingNew = value.nothingNew;
  cacheState();
  cacheHistory();
  cacheNothingNew();
  return true;
}

function currentCarryoverCandidates() {
  const rejected = new Set(state.rejectedIds);
  const marked = new Set(state.carryoverIds);

  return state.candidates.filter(
    (candidate) => (candidate.carriedOver || marked.has(candidate.id)) && !rejected.has(candidate.id),
  );
}

function beginPlannedWeek() {
  const suggestions = buildNextWeekSuggestions(
    menuData,
    history,
    state.pendingCarryovers,
    state.weekPlan,
    Math.random,
    { nothingNew },
  );
  const deferredCarryovers = countMealDays(state.weekPlan) === 0 ? state.pendingCarryovers : [];

  state = createMenuState(suggestions, state.weekPlan, state.createdAt, deferredCarryovers);
  saveState();
  render();
}

function rerollIdeas() {
  const carryovers = currentCarryoverCandidates();
  const suggestions = buildNextWeekSuggestions(
    menuData,
    history,
    carryovers,
    state.weekPlan,
    Math.random,
    { nothingNew },
  );

  state = createMenuState(suggestions, state.weekPlan, state.createdAt);
  saveState();
  render();
}

function startNextWeek() {
  const carryovers = getCarryoverMeals(state);
  history = addWeekToHistory(history, getEatenMeals(state), state.createdAt);
  saveHistory();

  nothingNew = false;
  saveNothingNew();
  state = createPlanningState(carryovers);
  saveState();
  render();
}

function createTagLabel(text, className) {
  const label = document.createElement("span");
  label.className = className;
  label.textContent = text;
  return label;
}

function createMealContent(meal) {
  const wrapper = document.createElement("div");
  const mealName = document.createElement("span");
  const categoryRow = document.createElement("div");
  const categoryName = document.createElement("span");

  wrapper.className = "meal-name-group";
  mealName.className = "meal-name";
  categoryRow.className = "meal-meta-row";
  categoryName.className = "category-name";
  mealName.textContent = meal.mealName;
  categoryName.textContent = meal.categoryName;

  categoryRow.append(categoryName);
  if (meal.quick) categoryRow.append(createTagLabel("Quick", "quick-label"));
  if (meal.bigMeal) categoryRow.append(createTagLabel("Big Meal", "big-meal-label"));

  wrapper.append(mealName, categoryRow);

  const description = typeof meal.description === "string" ? meal.description.trim() : "";
  if (description) {
    const descriptionElement = document.createElement("p");
    descriptionElement.className = "meal-description";
    descriptionElement.textContent = description;
    wrapper.append(descriptionElement);
  }

  return wrapper;
}

function createCarriedOverLabel() {
  return createTagLabel("Carried over", "carried-over-label");
}

function createDayTypeSelect(day) {
  const select = document.createElement("select");
  select.className = "day-type-select";
  select.setAttribute("aria-label", `Plan for ${day}`);

  for (const [value, label] of Object.entries(DAY_TYPE_LABELS)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = state.weekPlan[day].type === value;
    select.append(option);
  }

  select.addEventListener("change", () => {
    state = setDayType(state, day, select.value);
    saveState();
    render();
  });

  return select;
}

function createRequirementCheckbox(day, requirement, labelText) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const text = document.createElement("span");

  label.className = `requirement-check requirement-${requirement}`;
  input.type = "checkbox";
  input.checked = state.weekPlan[day][requirement] === true;
  input.setAttribute("aria-label", `${labelText} for ${day}`);
  text.textContent = labelText;

  input.addEventListener("change", () => {
    state = setDayRequirement(state, day, requirement, input.checked);
    saveState();
    render();
  });

  label.append(input, text);
  return label;
}

function createDayPlanControls(day) {
  const wrapper = document.createElement("div");
  wrapper.className = "day-plan-controls";
  wrapper.append(createDayTypeSelect(day));

  if (isMealDayType(state.weekPlan[day].type)) {
    const requirements = document.createElement("div");
    requirements.className = "day-requirements";
    requirements.append(
      createRequirementCheckbox(day, "quick", "Quick"),
      createRequirementCheckbox(day, "bigMeal", "Big Meal / Guests"),
    );
    wrapper.append(requirements);
  }

  return wrapper;
}

function createNothingNewControl() {
  const item = document.createElement("li");
  const text = document.createElement("div");
  const title = document.createElement("span");
  const note = document.createElement("span");
  const label = document.createElement("label");
  const input = document.createElement("input");

  item.className = "setup-week-option-item";
  text.className = "setup-week-option-text";
  title.className = "setup-day-name";
  title.textContent = "Nothing new";
  note.className = "setup-week-option-note";
  note.textContent = "Skip new-recipe and new-category suggestions for this week.";
  label.className = "requirement-check nothing-new-check";
  input.type = "checkbox";
  input.checked = nothingNew;
  input.setAttribute("aria-label", "Nothing new this week");

  input.addEventListener("change", () => {
    nothingNew = input.checked;
    saveNothingNew();
    render();
  });

  label.append(input, document.createTextNode("Nothing new"));
  text.append(title, note);
  item.append(text, label);
  return item;
}

function renderSetup() {
  const fragment = document.createDocumentFragment();
  const mealCount = countMealDays(state.weekPlan);
  const quickCount = countQuickMealDays(state.weekPlan);
  const bigCount = countBigMealDays(state.weekPlan);
  const combinedCount = countCombinedMealDays(state.weekPlan);
  const carryoverCount = state.pendingCarryovers.length;

  stepLabel.textContent = "Plan the week";
  menuHeading.textContent = "What does each day need?";

  const requirements = [];
  if (quickCount > 0) requirements.push(`${quickCount} quick`);
  if (bigCount > 0) requirements.push(`${bigCount} for guests`);

  const mealSummary = mealCount === 0
    ? "No cooked dinners are planned yet."
    : `${mealCount} ${plural(mealCount, "dinner")} planned${requirements.length > 0 ? `, including ${requirements.join(" and ")}` : ""}${combinedCount > 0 ? ` (${combinedCount} ${plural(combinedCount, "day")} need both)` : ""}.`;
  const carryoverSummary = carryoverCount > 0
    ? ` ${carryoverCount} ${plural(carryoverCount, "carryover")} will be included automatically.`
    : "";
  const newIdeaSummary = nothingNew ? " New ideas are turned off for this week." : "";
  selectionStatus.textContent = `${mealSummary}${carryoverSummary}${newIdeaSummary}`;

  menuList.className = "week-setup-list";
  fragment.append(createNothingNewControl());

  for (const day of DAYS) {
    const item = document.createElement("li");
    const dayName = document.createElement("span");

    item.className = "setup-day-item";
    dayName.className = "setup-day-name";
    dayName.textContent = day;
    item.append(dayName, createDayPlanControls(day));
    fragment.append(item);
  }

  menuList.replaceChildren(fragment);
  primaryButton.textContent = mealCount === 0 ? "Use this week structure" : "Generate dinner ideas";
  secondaryButton.hidden = true;
  tertiaryButton.hidden = true;
}

function requirementProblemText() {
  const combinedShortfall = getCombinedMealShortfall(state);
  const quickShortfall = getQuickMealShortfall(state);
  const bigShortfall = getBigMealShortfall(state);
  const totalShortfall = getMealRequirementShortfall(state);

  if (combinedShortfall > 0) {
    return `A day marked both Quick and Big Meal still needs ${combinedShortfall} more ${plural(combinedShortfall, "dinner")} tagged both Quick and Big Meal. Restore one, then remove another option.`;
  }

  if (quickShortfall > 0 && bigShortfall > 0) {
    return `Your plan still needs ${quickShortfall} quick ${plural(quickShortfall, "dinner")} and ${bigShortfall} guest-friendly ${plural(bigShortfall, "dinner")}. Restore qualifying meals, then remove other options.`;
  }

  if (quickShortfall > 0) {
    return `Your Quick requirements still need ${quickShortfall} more quick ${plural(quickShortfall, "dinner")}. Restore a quick meal, then remove another option.`;
  }

  if (bigShortfall > 0) {
    return `Your Big Meal / Guests requirements still need ${bigShortfall} more guest-friendly ${plural(bigShortfall, "dinner")}. Restore a Big Meal, then remove another option.`;
  }

  return `Your checked meal requirements need ${totalShortfall} more compatible ${plural(totalShortfall, "dinner")}. Restore a tagged meal, then remove another option.`;
}

function renderCandidates() {
  const rejected = new Set(state.rejectedIds);
  const fragment = document.createDocumentFragment();
  const mealCount = countMealDays(state.weekPlan);
  const quickCount = countQuickMealDays(state.weekPlan);
  const bigCount = countBigMealDays(state.weekPlan);
  const requiredRejections = getRequiredRejectionCount(state);
  const rejectedCount = state.rejectedIds.length;
  const remaining = requiredRejections - rejectedCount;
  const requirementShortfall = getMealRequirementShortfall(state);
  const carryoverCount = currentCarryoverCandidates().length;

  stepLabel.textContent = "This week’s candidates";
  menuHeading.textContent = `Choose ${mealCount} ${plural(mealCount, "dinner")}`;
  menuList.className = "menu-list";

  if (rejectedCount === requiredRejections && requirementShortfall > 0) {
    selectionStatus.textContent = requirementProblemText();
  } else {
    const requirements = [];
    if (quickCount > 0) requirements.push(`${quickCount} quick`);
    if (bigCount > 0) requirements.push(`${bigCount} for guests`);
    const requirementSummary = requirements.length > 0
      ? ` The final menu needs ${requirements.join(" and ")}.`
      : "";
    const carryoverSummary = carryoverCount > 0
      ? ` ${carryoverCount} ${plural(carryoverCount, "dinner")} carried over automatically.`
      : "";
    selectionStatus.textContent = remaining > 0
      ? `Remove ${remaining} more ${plural(remaining, "meal")}.${requirementSummary}${carryoverSummary}`
      : `Your selections are ready.${requirementSummary}${carryoverSummary}`;
  }

  for (const candidate of state.candidates) {
    const item = document.createElement("li");
    const choice = document.createElement("button");
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

    choice.append(createMealContent(candidate));

    if (isCarriedOver && !isRejected) choice.append(createCarriedOverLabel());

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
  primaryButton.textContent = carryoverCount > 0 ? "Reroll other ideas" : "Roll new ideas";
  secondaryButton.textContent = "Clear removals";
  secondaryButton.hidden = rejectedCount === 0;
  tertiaryButton.textContent = "Edit week setup";
  tertiaryButton.hidden = false;
}

function createDaySelect(meal, currentDay) {
  const select = document.createElement("select");
  select.className = "day-select";
  select.setAttribute("aria-label", `Day for ${meal.mealName}`);

  for (const day of DAYS.filter((candidateDay) => isMealDayType(state.weekPlan[candidateDay].type))) {
    const option = document.createElement("option");
    option.value = day;
    option.textContent = day;
    option.selected = day === currentDay;
    option.disabled = day !== currentDay && !canAssignMealDay(state, meal.id, day);
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

function appendScheduleBadges(container, type, quickRequired, bigMealRequired) {
  container.append(createTagLabel(DAY_TYPE_LABELS[type], `day-type-badge day-type-${type}`));
  if (isMealDayType(type) && quickRequired) {
    container.append(createTagLabel("Quick", "day-type-badge day-type-quick"));
  }
  if (isMealDayType(type) && bigMealRequired) {
    container.append(createTagLabel("Big Meal / Guests", "day-type-badge day-type-big"));
  }
}

function renderScheduledWeek() {
  const fragment = document.createDocumentFragment();
  const mealCount = countMealDays(state.weekPlan);
  const carryoverCount = getCarryoverMeals(state).length;

  stepLabel.textContent = "This week’s plan";
  menuHeading.textContent = mealCount > 0
    ? `${mealCount} ${plural(mealCount, "dinner")}, scheduled`
    : "Week planned";
  selectionStatus.textContent = carryoverCount > 0
    ? `${carryoverCount} ${plural(carryoverCount, "dinner")} marked to carry forward. Checked Quick and Guests requirements remain locked to qualifying dinners.`
    : mealCount > 0
      ? "Quick and Big Meal / Guests requirements are matched to qualifying dinners. Move meals between compatible days anytime."
      : "No cooked dinners are scheduled this week.";

  menuList.className = "week-schedule-list";

  for (const { day, type, quickRequired, bigMealRequired, meal } of getScheduledWeek(state)) {
    const item = document.createElement("li");
    const heading = document.createElement("div");
    const dayName = document.createElement("span");
    const badges = document.createElement("div");

    item.className = `schedule-day-item${meal ? "" : " nonmeal-day"}`;
    heading.className = "schedule-day-heading";
    dayName.className = "schedule-day-name";
    dayName.textContent = day;
    badges.className = "schedule-day-badges";
    appendScheduleBadges(badges, type, quickRequired, bigMealRequired);
    heading.append(dayName, badges);
    item.append(heading);

    if (meal) {
      const mealRow = document.createElement("div");
      const controls = document.createElement("div");

      mealRow.className = "scheduled-meal-row";
      controls.className = "scheduled-controls";
      mealRow.append(createMealContent(meal));
      controls.append(createDaySelect(meal, day), createCarryoverToggle(meal));
      item.append(mealRow, controls);
    } else {
      const note = document.createElement("p");
      note.className = "nonmeal-note";
      note.textContent = DAY_TYPE_LABELS[type];
      item.append(note);
    }

    fragment.append(item);
  }

  menuList.replaceChildren(fragment);
  primaryButton.textContent = "Start next week";
  secondaryButton.textContent = "Change choices";
  secondaryButton.hidden = mealCount === 0;
  tertiaryButton.textContent = "Edit week setup";
  tertiaryButton.hidden = false;
}

function render() {
  if (state.mode === "setup") renderSetup();
  else if (state.mode === "choosing") renderCandidates();
  else renderScheduledWeek();
}

primaryButton.addEventListener("click", () => {
  if (state.mode === "setup") beginPlannedWeek();
  else if (state.mode === "choosing") rerollIdeas();
  else startNextWeek();
});

secondaryButton.addEventListener("click", () => {
  if (state.mode === "choosing") state = clearRejections(state);
  else if (state.mode === "scheduled") state = reopenChoices(state);

  saveState();
  render();
});

tertiaryButton.addEventListener("click", () => {
  state = reopenWeekSetup(state);
  saveState();
  render();
});

let history = loadHistory();
let nothingNew = loadNothingNew();
let state = loadState();
if (!state) {
  state = createPlanningState();
  cacheState();
}

if (cloudPlanningRequested) {
  try {
    const remotePlanner = await loadCloudPlanner(activeListId);
    if (isValidCloudPlanner(remotePlanner)) {
      applyCloudPlanner(remotePlanner);
    } else {
      await saveCloudPlanner(activeListId, plannerSnapshot());
    }
    cloudPlanningActive = true;
  } catch (error) {
    console.warn("Cloud household planning is unavailable for this list; using this browser's local planner state instead.", error);
  }
}

updatePersistenceSummary();
render();

if (cloudPlanningActive) {
  unsubscribeCloudPlanner = subscribeCloudPlanner(
    activeListId,
    (remotePlanner, metadata) => {
      if (metadata.hasPendingWrites || cloudWritePending || !isValidCloudPlanner(remotePlanner)) return;
      if (samePlannerSnapshot(remotePlanner)) return;

      applyCloudPlanner(remotePlanner);
      render();
    },
    (error) => {
      console.warn("Household planner live sync was interrupted.", error);
    },
  );
}

window.addEventListener("beforeunload", () => {
  if (cloudSaveTimer) window.clearTimeout(cloudSaveTimer);
  if (unsubscribeCloudPlanner) unsubscribeCloudPlanner();
});
