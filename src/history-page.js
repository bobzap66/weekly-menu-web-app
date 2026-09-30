import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import { getStoredActiveList } from "./list-config.js?v=0.17.0";

const signedOutCard = document.querySelector("#signed-out-card");
const historyPanel = document.querySelector("#history-panel");
const listSelect = document.querySelector("#history-list-select");
const categoryFilter = document.querySelector("#history-category-filter");
const searchInput = document.querySelector("#history-search");
const historyStatus = document.querySelector("#history-status");
const historyWeeks = document.querySelector("#history-weeks");

let availableLists = [];
let weeks = [];
let activeListId = "";
let activeListName = "";

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isOwnedByUser(list, user) {
  return list?.ownerUid === user?.uid;
}

async function loadAccessibleLists(user) {
  const ownedQuery = query(collection(db, "lists"), where("ownerUid", "==", user.uid));
  const ownedSnapshot = await getDocs(ownedQuery);
  const byId = new Map(
    ownedSnapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }]),
  );

  if (user.emailVerified && user.email) {
    const sharedQuery = query(
      collection(db, "lists"),
      where("editorEmails", "array-contains", normalizeEmail(user.email)),
    );
    const sharedSnapshot = await getDocs(sharedQuery);
    for (const item of sharedSnapshot.docs) {
      byId.set(item.id, { id: item.id, ...item.data() });
    }
  }

  availableLists = [...byId.values()].sort((a, b) => {
    const ownerOrder = Number(!isOwnedByUser(a, user)) - Number(!isOwnedByUser(b, user));
    return ownerOrder || String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

function populateListSelect(user) {
  listSelect.replaceChildren();

  for (const list of availableLists) {
    const option = document.createElement("option");
    option.value = list.id;
    option.textContent = isOwnedByUser(list, user) ? list.name : `${list.name} (shared)`;
    listSelect.append(option);
  }

  const stored = getStoredActiveList();
  const selected =
    availableLists.find((list) => list.id === stored.id) ??
    availableLists[0] ??
    null;

  activeListId = selected?.id ?? "";
  activeListName = selected?.name ?? "";
  listSelect.value = activeListId;
}

function weekMeals(week) {
  return Object.values(week.days ?? {})
    .map((day) => day?.meal)
    .filter(Boolean);
}

function populateCategoryFilter() {
  const selected = categoryFilter.value;
  const categories = [...new Set(
    weeks.flatMap((week) => weekMeals(week).map((meal) => meal.categoryName).filter(Boolean)),
  )].sort((a, b) => a.localeCompare(b));

  categoryFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  categoryFilter.append(allOption);

  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.append(option);
  }

  categoryFilter.value = categories.includes(selected) ? selected : "";
}

function formatWeekStart(week) {
  const date = new Date(`${week.weekStart}T00:00:00`);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  const fallback = new Date(week.plannedAt);
  return Number.isNaN(fallback.getTime())
    ? "Unknown date"
    : fallback.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function matchingWeeks() {
  const search = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  if (!search && !category) return weeks;

  return weeks.filter((week) =>
    weekMeals(week).some((meal) => {
      if (category && meal.categoryName !== category) return false;
      if (!search) return true;
      return `${meal.mealName ?? ""} ${meal.categoryName ?? ""} ${meal.description ?? ""}`
        .toLowerCase()
        .includes(search);
    }),
  );
}

function createDayRow(dayName, day) {
  const item = document.createElement("li");
  const label = document.createElement("span");
  item.className = "history-day";
  label.className = "history-day-name";
  label.textContent = dayName;
  item.append(label);

  if (!day?.meal) {
    const note = document.createElement("p");
    note.className = "history-nonmeal";
    note.textContent = day?.typeLabel ?? "No meal planned";
    item.append(note);
    return item;
  }

  const mealName = document.createElement("span");
  const meta = document.createElement("p");
  const parts = [day.meal.categoryName].filter(Boolean);
  if (day.meal.quick) parts.push("Quick");
  if (day.meal.bigMeal) parts.push("Big Meal");

  mealName.className = "history-meal-name";
  mealName.textContent = day.meal.mealName;
  meta.className = "history-meal-meta";
  meta.textContent = parts.join(" · ");

  if (day.meal.carriedOver) {
    const carried = document.createElement("span");
    carried.className = "history-carryover";
    carried.textContent = "Carried over";
    meta.append(carried);
  }

  item.append(mealName, meta);
  return item;
}

function renderWeeks() {
  const filtered = matchingWeeks();
  historyWeeks.replaceChildren();

  if (weeks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.innerHTML = "<h2>No archived weeks yet</h2><p>The first history record will be created the next time this household presses <strong>Start next week</strong> on a completed plan.</p>";
    historyWeeks.append(empty);
    historyStatus.textContent = `No archived weeks in ${activeListName}.`;
    return;
  }

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.innerHTML = "<h2>No matching weeks</h2><p>Try a different meal name or category.</p>";
    historyWeeks.append(empty);
  } else {
    for (const week of filtered) {
      const card = document.createElement("article");
      const heading = document.createElement("div");
      const title = document.createElement("h2");
      const count = document.createElement("p");
      const days = document.createElement("ol");

      card.className = "history-week-card";
      heading.className = "history-week-heading";
      title.textContent = `Week of ${formatWeekStart(week)}`;
      count.className = "history-week-count";
      count.textContent = `${week.scheduledDinnerCount ?? weekMeals(week).length} scheduled dinners`;
      heading.append(title, count);

      days.className = "history-day-list";
      for (const [dayName, day] of Object.entries(week.days ?? {})) {
        days.append(createDayRow(dayName, day));
      }

      card.append(heading, days);
      historyWeeks.append(card);
    }
  }

  const mealCount = filtered.reduce((total, week) => total + weekMeals(week).length, 0);
  historyStatus.textContent = `${filtered.length} of ${weeks.length} archived weeks shown · ${mealCount} scheduled dinners in the results.`;
}

async function loadHistory(listId) {
  activeListId = listId;
  activeListName = availableLists.find((list) => list.id === listId)?.name ?? "Meal List";
  weeks = [];
  historyWeeks.replaceChildren();
  historyStatus.textContent = `Loading ${activeListName} history…`;

  const snapshot = await getDocs(
    query(collection(db, "lists", listId, "history"), orderBy("weekStart", "desc")),
  );
  weeks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  populateCategoryFilter();
  renderWeeks();
}

listSelect.addEventListener("change", async () => {
  searchInput.value = "";
  categoryFilter.value = "";
  try {
    await loadHistory(listSelect.value);
  } catch (error) {
    console.error(error);
    historyStatus.textContent = "Could not load meal history for that list.";
  }
});

categoryFilter.addEventListener("change", renderWeeks);
searchInput.addEventListener("input", renderWeeks);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    signedOutCard.hidden = false;
    historyPanel.hidden = true;
    return;
  }

  signedOutCard.hidden = true;
  historyPanel.hidden = false;
  historyStatus.textContent = "Loading your meal lists…";

  try {
    await loadAccessibleLists(user);
    populateListSelect(user);

    if (!activeListId) {
      listSelect.disabled = true;
      historyStatus.textContent = "No owned or shared meal lists are available to this account.";
      return;
    }

    await loadHistory(activeListId);
  } catch (error) {
    console.error(error);
    historyStatus.textContent = "Could not load meal history. Check your connection and list access.";
  }
});
