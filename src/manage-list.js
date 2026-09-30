import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import {
  DEFAULT_LIST_ID,
  DEFAULT_LIST_NAME,
  getStoredActiveList,
  setStoredActiveList,
} from "./list-config.js?v=0.14.0";

const loginPanel = document.querySelector("#login-panel");
const adminPanel = document.querySelector("#admin-panel");
const loginForm = document.querySelector("#login-form");
const loginEmail = document.querySelector("#login-email");
const loginPassword = document.querySelector("#login-password");
const loginStatus = document.querySelector("#login-status");
const accountEmail = document.querySelector("#account-email");
const accountUid = document.querySelector("#account-uid");
const copyUidButton = document.querySelector("#copy-uid-button");
const signOutButton = document.querySelector("#sign-out-button");
const listSelect = document.querySelector("#list-select");
const createListForm = document.querySelector("#create-list-form");
const newListName = document.querySelector("#new-list-name");
const duplicateListForm = document.querySelector("#duplicate-list-form");
const duplicateListName = document.querySelector("#duplicate-list-name");
const duplicateListButton = document.querySelector("#duplicate-list-button");
const listStatus = document.querySelector("#list-status");
const listNameDisplay = document.querySelector("#active-list-name");
const listRequiredSections = [...document.querySelectorAll("[data-list-required]")];
const categoryForm = document.querySelector("#category-form");
const categoryName = document.querySelector("#category-name");
const categoryWeight = document.querySelector("#category-weight");
const categoryStatus = document.querySelector("#category-status");
const categoryFilter = document.querySelector("#category-filter");
const categoryEditForm = document.querySelector("#category-edit-form");
const categoryEditId = document.querySelector("#category-edit-id");
const categoryEditName = document.querySelector("#category-edit-name");
const categoryEditWeight = document.querySelector("#category-edit-weight");
const categoryEditStatus = document.querySelector("#category-edit-status");
const categoryMealCount = document.querySelector("#category-meal-count");
const mealForm = document.querySelector("#meal-form");
const mealId = document.querySelector("#meal-id");
const mealName = document.querySelector("#meal-name");
const mealCategory = document.querySelector("#meal-category");
const mealWeight = document.querySelector("#meal-weight");
const mealRecipeUrl = document.querySelector("#meal-recipe-url");
const mealDescription = document.querySelector("#meal-description");
const mealQuick = document.querySelector("#meal-quick");
const mealBig = document.querySelector("#meal-big");
const mealActive = document.querySelector("#meal-active");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const editorStatus = document.querySelector("#editor-status");
const catalogStatus = document.querySelector("#catalog-status");
const mealCatalog = document.querySelector("#meal-catalog");
const mealSearch = document.querySelector("#meal-search");

const COPY_BATCH_SIZE = 400;

let availableLists = [];
let activeListId = null;
let activeListName = "";
let categories = [];
let meals = [];

function activeListRequired() {
  if (!activeListId) throw new Error("Choose or create a meal list first.");
  return activeListId;
}

const categoriesCollection = () => collection(db, "lists", activeListRequired(), "categories");
const mealsCollection = () => collection(db, "lists", activeListRequired(), "meals");
const categoryDoc = (id) => doc(db, "lists", activeListRequired(), "categories", id);
const mealDoc = (id) => doc(db, "lists", activeListRequired(), "meals", id);

function sortByOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function setListRequiredVisibility(hasList) {
  for (const section of listRequiredSections) section.hidden = !hasList;
}

function isOwnedByCurrentUser(list) {
  return Boolean(auth.currentUser && list?.ownerUid === auth.currentUser.uid);
}

function listNameExists(name) {
  const normalized = name.trim().toLowerCase();
  return availableLists.some((list) => String(list.name ?? "").trim().toLowerCase() === normalized);
}

function nextDuplicateName(name) {
  const base = `${name || "Meal List"} Copy`;
  let candidate = base;
  let suffix = 2;

  while (listNameExists(candidate)) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function refreshDuplicateControls() {
  const hasList = Boolean(activeListId);
  duplicateListName.disabled = !hasList;
  duplicateListButton.disabled = !hasList;
  duplicateListName.value = hasList ? nextDuplicateName(activeListName) : "";
}

function renderListControls() {
  listSelect.replaceChildren();

  if (availableLists.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No lists yet";
    listSelect.append(option);
    listSelect.disabled = true;
    listNameDisplay.textContent = "None";
    setListRequiredVisibility(false);
    refreshDuplicateControls();
    return;
  }

  listSelect.disabled = false;
  for (const list of availableLists) {
    const owned = isOwnedByCurrentUser(list);
    const option = document.createElement("option");
    option.value = list.id;
    option.textContent = owned ? list.name : `${list.name} (shared)`;
    option.dataset.listName = list.name;
    option.dataset.ownerUid = list.ownerUid ?? "";
    option.dataset.editorEmails = JSON.stringify(Array.isArray(list.editorEmails) ? list.editorEmails : []);
    option.selected = list.id === activeListId;
    listSelect.append(option);
  }

  listSelect.value = activeListId ?? availableLists[0].id;
  const activeList = availableLists.find((list) => list.id === activeListId);
  listNameDisplay.textContent = activeList
    ? `${activeList.name}${isOwnedByCurrentUser(activeList) ? "" : " (shared)"}`
    : "None";
  setListRequiredVisibility(Boolean(activeListId));
  refreshDuplicateControls();
}

function clearCatalogUi() {
  categories = [];
  meals = [];
  mealCatalog.replaceChildren();
  categoryFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  categoryFilter.append(allOption);
  categoryEditForm.hidden = true;
  populateCategorySelect();
  setStatus(catalogStatus, activeListId ? "This list has no meals yet." : "Create or receive a shared list to begin.");
}

async function loadAccessibleLists(user, preferredId = null) {
  const ownedQuery = query(collection(db, "lists"), where("ownerUid", "==", user.uid));
  const ownedSnapshot = await getDocs(ownedQuery);

  let sharedSnapshot = null;
  const verifiedEmail = user.emailVerified ? normalizeEmail(user.email) : "";
  if (verifiedEmail) {
    const sharedQuery = query(collection(db, "lists"), where("editorEmails", "array-contains", verifiedEmail));
    try {
      sharedSnapshot = await getDocs(sharedQuery);
    } catch (error) {
      // During a rules deployment there can be a brief window where the new shared
      // query is not authorized yet. Owned lists should remain usable meanwhile.
      console.warn("Could not load shared meal lists yet.", error);
    }
  }

  const byId = new Map();
  for (const item of ownedSnapshot.docs) byId.set(item.id, { id: item.id, ...item.data() });
  if (sharedSnapshot) {
    for (const item of sharedSnapshot.docs) byId.set(item.id, { id: item.id, ...item.data() });
  }

  availableLists = [...byId.values()]
    .map((list) => ({
      ...list,
      editorEmails: Array.isArray(list.editorEmails) ? list.editorEmails.map(normalizeEmail).filter(Boolean) : [],
    }))
    .sort((a, b) => {
      const ownerOrder = Number(!isOwnedByCurrentUser(a)) - Number(!isOwnedByCurrentUser(b));
      return ownerOrder || String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });

  const stored = getStoredActiveList();
  const desiredId = preferredId ?? stored.id;
  const selected =
    availableLists.find((list) => list.id === desiredId) ??
    availableLists.find((list) => list.id === DEFAULT_LIST_ID) ??
    availableLists[0] ??
    null;

  activeListId = selected?.id ?? null;
  activeListName = selected?.name ?? "";

  if (selected) setStoredActiveList(selected.id, selected.name);
  renderListControls();

  if (selected) {
    await loadCatalog();
    resetMealForm();
  } else {
    clearCatalogUi();
    setStatus(
      listStatus,
      user.emailVerified
        ? "You do not own or share any meal lists yet. Create one below, or ask another list owner to add your email address."
        : "You do not own any meal lists yet. Verify your email before shared household lists can appear, or create your own list below.",
    );
  }
}

async function switchToList(id) {
  const selected = availableLists.find((list) => list.id === id);
  if (!selected) return;

  activeListId = selected.id;
  activeListName = selected.name;
  setStoredActiveList(selected.id, selected.name);
  listNameDisplay.textContent = `${selected.name}${isOwnedByCurrentUser(selected) ? "" : " (shared)"}`;
  setListRequiredVisibility(true);
  refreshDuplicateControls();
  resetMealForm();
  categoryFilter.value = "";
  mealSearch.value = "";
  await loadCatalog();
  setStatus(
    listStatus,
    isOwnedByCurrentUser(selected)
      ? `Now editing ${selected.name}. The planner will use this list while you are signed in.`
      : `Now editing ${selected.name}, shared with you. The planner will use this list while you are signed in.`,
  );
}

async function copySnapshotDocuments(destinationListId, categorySnapshot, mealSnapshot) {
  const writes = [
    ...categorySnapshot.docs.map((item) => ({ subcollection: "categories", item })),
    ...mealSnapshot.docs.map((item) => ({ subcollection: "meals", item })),
  ];

  for (let start = 0; start < writes.length; start += COPY_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const { subcollection, item } of writes.slice(start, start + COPY_BATCH_SIZE)) {
      batch.set(doc(db, "lists", destinationListId, subcollection, item.id), item.data());
    }
    await batch.commit();
  }
}

async function removeSnapshotDocuments(destinationListId, categorySnapshot, mealSnapshot) {
  const writes = [
    ...categorySnapshot.docs.map((item) => ({ subcollection: "categories", id: item.id })),
    ...mealSnapshot.docs.map((item) => ({ subcollection: "meals", id: item.id })),
  ];

  for (let start = 0; start < writes.length; start += COPY_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const { subcollection, id } of writes.slice(start, start + COPY_BATCH_SIZE)) {
      batch.delete(doc(db, "lists", destinationListId, subcollection, id));
    }
    await batch.commit();
  }
}

function editableCategories() {
  return categories.filter((category) => !category.result).sort(sortByOrder);
}

function populateCategorySelect(selectedId = "") {
  mealCategory.replaceChildren();
  const editable = editableCategories();

  if (editable.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add a category first";
    mealCategory.append(option);
    return;
  }

  for (const category of editable) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    option.selected = category.id === selectedId;
    mealCategory.append(option);
  }
}

function populateCategoryFilter(selectedId = "") {
  categoryFilter.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  categoryFilter.append(allOption);

  const validIds = new Set();
  for (const category of editableCategories()) {
    validIds.add(category.id);
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = `${category.name} (weight ${category.weight})`;
    categoryFilter.append(option);
  }

  categoryFilter.value = validIds.has(selectedId) ? selectedId : "";
}

function renderCategoryEditor() {
  const id = categoryFilter.value;
  const category = categories.find((item) => item.id === id && !item.result);

  if (!category) {
    categoryEditForm.hidden = true;
    categoryEditId.value = "";
    setStatus(categoryEditStatus, "");
    return;
  }

  const count = meals.filter((meal) => meal.categoryId === category.id).length;
  categoryEditForm.hidden = false;
  categoryEditId.value = category.id;
  categoryEditName.value = category.name;
  categoryEditWeight.value = String(category.weight);
  categoryMealCount.textContent = `${count} ${count === 1 ? "meal" : "meals"} in this category`;
  setStatus(categoryEditStatus, "");
}

function resetMealForm() {
  mealForm.reset();
  mealId.value = "";
  mealWeight.value = "1";
  mealActive.checked = true;
  cancelEditButton.hidden = true;
  populateCategorySelect();
  setStatus(editorStatus, "");
}

function editMeal(id) {
  const meal = meals.find((item) => item.id === id);
  if (!meal) return;

  mealId.value = meal.id;
  mealName.value = meal.name;
  populateCategorySelect(meal.categoryId);
  mealWeight.value = String(meal.weight);
  mealRecipeUrl.value = meal.recipeUrl ?? "";
  mealDescription.value = meal.description ?? "";
  mealQuick.checked = meal.quick === true;
  mealBig.checked = meal.bigMeal === true;
  mealActive.checked = meal.active !== false;
  cancelEditButton.hidden = false;
  setStatus(editorStatus, `Editing ${meal.name}.`);
  mealForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function removeMeal(id) {
  const meal = meals.find((item) => item.id === id);
  if (!meal || !window.confirm(`Delete ${meal.name}? This cannot be undone.`)) return;

  try {
    await deleteDoc(mealDoc(id));
    await loadCatalog();
    if (mealId.value === id) resetMealForm();
    setStatus(editorStatus, `${meal.name} deleted.`);
  } catch (error) {
    console.error(error);
    setStatus(editorStatus, "Could not delete that meal. Check your access to this list.", true);
  }
}

function createTag(text, className) {
  const tag = document.createElement("span");
  tag.className = className;
  tag.textContent = text;
  return tag;
}

function renderMeals() {
  const searchText = mealSearch.value.trim().toLowerCase();
  const selectedCategoryId = categoryFilter.value;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const filtered = meals
    .filter((meal) => {
      if (selectedCategoryId && meal.categoryId !== selectedCategoryId) return false;
      if (!searchText) return true;
      const categoryNameValue = categoryById.get(meal.categoryId)?.name ?? "";
      return `${meal.name} ${categoryNameValue} ${meal.description ?? ""}`.toLowerCase().includes(searchText);
    })
    .sort((a, b) => {
      const categoryOrderA = categoryById.get(a.categoryId)?.order ?? 0;
      const categoryOrderB = categoryById.get(b.categoryId)?.order ?? 0;
      return categoryOrderA - categoryOrderB || sortByOrder(a, b);
    });

  const fragment = document.createDocumentFragment();
  for (const meal of filtered) {
    const card = document.createElement("article");
    const main = document.createElement("div");
    const title = document.createElement("h3");
    const meta = document.createElement("div");
    const category = document.createElement("span");
    const actions = document.createElement("div");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    card.className = `admin-meal-card${meal.active === false ? " is-inactive" : ""}`;
    main.className = "admin-meal-main";
    title.textContent = meal.name;
    meta.className = "meal-meta-row";
    category.className = "category-name";
    category.textContent = categoryById.get(meal.categoryId)?.name ?? meal.categoryId;
    meta.append(category, createTag(`Weight ${meal.weight}`, "weight-label"));
    if (meal.quick) meta.append(createTag("Quick", "quick-label"));
    if (meal.bigMeal) meta.append(createTag("Big Meal", "big-meal-label"));
    if (meal.active === false) meta.append(createTag("Inactive", "inactive-label"));
    main.append(title, meta);

    if (meal.description) {
      const description = document.createElement("p");
      description.className = "admin-meal-description";
      description.textContent = meal.description;
      main.append(description);
    }

    if (meal.recipeUrl) {
      const recipe = document.createElement("a");
      recipe.className = "recipe-link";
      recipe.href = meal.recipeUrl;
      recipe.target = "_blank";
      recipe.rel = "noopener noreferrer";
      recipe.textContent = "Recipe ↗";
      main.append(recipe);
    }

    actions.className = "admin-meal-actions";
    editButton.className = "action-button secondary-button compact-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => editMeal(meal.id));
    deleteButton.className = "action-button secondary-button compact-button danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => removeMeal(meal.id));
    actions.append(editButton, deleteButton);
    card.append(main, actions);
    fragment.append(card);
  }

  mealCatalog.replaceChildren(fragment);
  const category = categories.find((item) => item.id === selectedCategoryId);
  const scope = category ? ` in ${category.name}` : "";
  catalogStatus.textContent = `${filtered.length} of ${meals.length} meals shown${scope} in ${activeListName}.`;
}

async function loadCatalog() {
  if (!activeListId) {
    clearCatalogUi();
    return;
  }

  const selectedCategoryId = categoryFilter.value;
  try {
    setStatus(catalogStatus, `Loading ${activeListName}…`);
    const [categorySnapshot, mealSnapshot] = await Promise.all([
      getDocs(categoriesCollection()),
      getDocs(mealsCollection()),
    ]);

    categories = categorySnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })).sort(sortByOrder);
    meals = mealSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })).sort(sortByOrder);
    populateCategorySelect(mealCategory.value);
    populateCategoryFilter(selectedCategoryId);
    renderCategoryEditor();
    renderMeals();
  } catch (error) {
    console.error(error);
    clearCatalogUi();
    setStatus(catalogStatus, "Could not read this meal list. Check the connection and your list access.", true);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(loginStatus, "Signing in…");
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
    loginForm.reset();
    setStatus(loginStatus, "");
  } catch (error) {
    console.error(error);
    setStatus(loginStatus, "Sign-in failed. Check the email and password.", true);
  }
});

signOutButton.addEventListener("click", async () => {
  await signOut(auth);
});

copyUidButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(accountUid.textContent);
    copyUidButton.textContent = "Copied";
    window.setTimeout(() => { copyUidButton.textContent = "Copy UID"; }, 1500);
  } catch {
    setStatus(editorStatus, "Could not copy automatically. Select the UID text and copy it manually.", true);
  }
});

listSelect.addEventListener("change", async () => {
  await switchToList(listSelect.value);
});

createListForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  const name = newListName.value.trim();

  if (!user) {
    setStatus(listStatus, "Sign in before creating a list.", true);
    return;
  }
  if (!name) {
    setStatus(listStatus, "Enter a list name.", true);
    return;
  }
  if (listNameExists(name)) {
    setStatus(listStatus, `A list named ${name} is already available to you.`, true);
    return;
  }

  try {
    setStatus(listStatus, `Creating ${name}…`);
    const listRef = await addDoc(collection(db, "lists"), {
      name,
      ownerUid: user.uid,
      editorEmails: [],
      publicRead: false,
      schemaVersion: 1,
      createdAt: serverTimestamp(),
    });
    createListForm.reset();
    await loadAccessibleLists(user, listRef.id);
    setStatus(listStatus, `${name} created. New lists start private and unshared.`);
  } catch (error) {
    console.error(error);
    setStatus(listStatus, "Could not create the list. Check the Firestore security rules.", true);
  }
});

duplicateListForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  const source = availableLists.find((list) => list.id === activeListId);
  const name = duplicateListName.value.trim();

  if (!user || !source) {
    setStatus(listStatus, "Choose a list to duplicate first.", true);
    return;
  }
  if (!name) {
    setStatus(listStatus, "Enter a name for the copied list.", true);
    return;
  }
  if (listNameExists(name)) {
    setStatus(listStatus, `A list named ${name} is already available to you.`, true);
    return;
  }

  let destinationListId = null;
  let sourceCategorySnapshot = null;
  let sourceMealSnapshot = null;
  duplicateListButton.disabled = true;

  try {
    setStatus(listStatus, `Reading ${source.name} before copying…`);
    [sourceCategorySnapshot, sourceMealSnapshot] = await Promise.all([
      getDocs(collection(db, "lists", source.id, "categories")),
      getDocs(collection(db, "lists", source.id, "meals")),
    ]);

    setStatus(listStatus, `Creating ${name}…`);
    const listRef = await addDoc(collection(db, "lists"), {
      name,
      ownerUid: user.uid,
      editorEmails: [],
      publicRead: false,
      schemaVersion: Number(source.schemaVersion) || 1,
      createdAt: serverTimestamp(),
    });
    destinationListId = listRef.id;

    await copySnapshotDocuments(destinationListId, sourceCategorySnapshot, sourceMealSnapshot);
    await loadAccessibleLists(user, destinationListId);
    setStatus(
      listStatus,
      `${name} created as your private copy of ${source.name}: ${sourceCategorySnapshot.size} categories and ${sourceMealSnapshot.size} meals copied.`,
    );
  } catch (error) {
    console.error(error);

    if (destinationListId && sourceCategorySnapshot && sourceMealSnapshot) {
      try {
        await removeSnapshotDocuments(destinationListId, sourceCategorySnapshot, sourceMealSnapshot);
        await deleteDoc(doc(db, "lists", destinationListId));
      } catch (cleanupError) {
        console.error("Could not fully roll back the failed list copy.", cleanupError);
      }
    }

    setStatus(listStatus, "Could not duplicate the list. No completed copy was selected.", true);
  } finally {
    duplicateListButton.disabled = !activeListId;
  }
});

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = categoryName.value.trim();
  const weight = Number(categoryWeight.value);

  if (!activeListId) {
    setStatus(categoryStatus, "Choose or create a meal list first.", true);
    return;
  }
  if (!name || !Number.isFinite(weight) || weight <= 0) {
    setStatus(categoryStatus, "Category name and a positive weight are required.", true);
    return;
  }
  if (categories.some((category) => String(category.name ?? "").trim().toLowerCase() === name.toLowerCase())) {
    setStatus(categoryStatus, `A category named ${name} already exists.`, true);
    return;
  }

  const maxOrder = categories.reduce((max, category) => Math.max(max, Number(category.order) || 0), -1);
  try {
    const categoryRef = await addDoc(categoriesCollection(), { name, weight, order: maxOrder + 1 });
    categoryForm.reset();
    categoryWeight.value = "1";
    await loadCatalog();
    populateCategorySelect(categoryRef.id);
    categoryFilter.value = categoryRef.id;
    renderCategoryEditor();
    renderMeals();
    setStatus(categoryStatus, `${name} added and selected in ${activeListName}.`);
  } catch (error) {
    console.error(error);
    setStatus(categoryStatus, "Could not add the category. Check your access to this list.", true);
  }
});

categoryEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = categoryEditId.value;
  const name = categoryEditName.value.trim();
  const weight = Number(categoryEditWeight.value);

  if (!id || !name || !Number.isFinite(weight) || weight <= 0) {
    setStatus(categoryEditStatus, "Category name and a positive weight are required.", true);
    return;
  }
  if (categories.some((category) => category.id !== id && String(category.name ?? "").trim().toLowerCase() === name.toLowerCase())) {
    setStatus(categoryEditStatus, `A category named ${name} already exists.`, true);
    return;
  }

  try {
    await updateDoc(categoryDoc(id), { name, weight });
    await loadCatalog();
    categoryFilter.value = id;
    renderCategoryEditor();
    renderMeals();
    setStatus(categoryEditStatus, `${name} updated.`);
  } catch (error) {
    console.error(error);
    setStatus(categoryEditStatus, "Could not update the category. Check your access to this list.", true);
  }
});

categoryFilter.addEventListener("change", () => {
  renderCategoryEditor();
  renderMeals();
});
cancelEditButton.addEventListener("click", resetMealForm);
mealSearch.addEventListener("input", renderMeals);

mealForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const categoryId = mealCategory.value;
  const name = mealName.value.trim();
  const weight = Number(mealWeight.value);

  if (!activeListId) {
    setStatus(editorStatus, "Choose or create a meal list first.", true);
    return;
  }
  if (!categoryId || !name || !Number.isFinite(weight) || weight <= 0) {
    setStatus(editorStatus, "Meal name, category, and a positive weight are required.", true);
    return;
  }

  const values = {
    categoryId,
    name,
    weight,
    quick: mealQuick.checked,
    bigMeal: mealBig.checked,
    active: mealActive.checked,
    recipeUrl: mealRecipeUrl.value.trim(),
    description: mealDescription.value.trim(),
  };

  try {
    if (mealId.value) {
      await updateDoc(mealDoc(mealId.value), values);
      setStatus(editorStatus, `${name} updated.`);
    } else {
      const maxOrder = meals.filter((meal) => meal.categoryId === categoryId)
        .reduce((max, meal) => Math.max(max, Number(meal.order) || 0), -1);
      const mealRef = await addDoc(mealsCollection(), { ...values, order: maxOrder + 1 });
      await updateDoc(mealRef, { stableId: mealRef.id });
      setStatus(editorStatus, `${name} added.`);
    }
    await loadCatalog();
    resetMealForm();
  } catch (error) {
    console.error(error);
    setStatus(editorStatus, "Could not save the meal. Check your access to this list.", true);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginPanel.hidden = false;
    adminPanel.hidden = true;
    accountEmail.textContent = "";
    accountUid.textContent = "";
    availableLists = [];
    activeListId = null;
    activeListName = "";
    return;
  }

  loginPanel.hidden = true;
  adminPanel.hidden = false;
  accountEmail.textContent = user.email ?? "Signed-in user";
  accountUid.textContent = user.uid;

  try {
    setStatus(listStatus, "Loading your meal lists…");
    await loadAccessibleLists(user);
    if (activeListId) {
      const active = availableLists.find((list) => list.id === activeListId);
      setStatus(
        listStatus,
        active && !isOwnedByCurrentUser(active)
          ? `Editing ${activeListName}, shared with you.`
          : `Editing ${activeListName}.`,
      );
    }
  } catch (error) {
    console.error(error);
    availableLists = [];
    activeListId = null;
    activeListName = "";
    renderListControls();
    clearCatalogUi();
    setStatus(listStatus, "Could not load your meal lists. Check the Firestore security rules.", true);
  }
});
