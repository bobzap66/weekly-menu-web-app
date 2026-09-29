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
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import {
  DEFAULT_LIST_ID,
  DEFAULT_LIST_NAME,
  getStoredActiveList,
  setStoredActiveList,
} from "./list-config.js?v=0.10.0";

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

let ownedLists = [];
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

function setListRequiredVisibility(hasList) {
  for (const section of listRequiredSections) section.hidden = !hasList;
}

function renderListControls() {
  listSelect.replaceChildren();

  if (ownedLists.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No lists yet";
    listSelect.append(option);
    listSelect.disabled = true;
    listNameDisplay.textContent = "None";
    setListRequiredVisibility(false);
    return;
  }

  listSelect.disabled = false;
  for (const list of ownedLists) {
    const option = document.createElement("option");
    option.value = list.id;
    option.textContent = list.name;
    option.selected = list.id === activeListId;
    listSelect.append(option);
  }

  listSelect.value = activeListId ?? ownedLists[0].id;
  listNameDisplay.textContent = activeListName || "None";
  setListRequiredVisibility(Boolean(activeListId));
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
  setStatus(catalogStatus, activeListId ? "This list has no meals yet." : "Create a list to begin.");
}

async function loadOwnedLists(user, preferredId = null) {
  const listQuery = query(collection(db, "lists"), where("ownerUid", "==", user.uid));
  const snapshot = await getDocs(listQuery);
  ownedLists = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  const stored = getStoredActiveList();
  const desiredId = preferredId ?? stored.id;
  const selected =
    ownedLists.find((list) => list.id === desiredId) ??
    ownedLists.find((list) => list.id === DEFAULT_LIST_ID) ??
    ownedLists[0] ??
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
    setStatus(listStatus, "You do not have a meal list yet. Create one below.");
  }
}

async function switchToList(id) {
  const selected = ownedLists.find((list) => list.id === id);
  if (!selected) return;

  activeListId = selected.id;
  activeListName = selected.name;
  setStoredActiveList(selected.id, selected.name);
  listNameDisplay.textContent = selected.name;
  setListRequiredVisibility(true);
  resetMealForm();
  categoryFilter.value = "";
  mealSearch.value = "";
  await loadCatalog();
  setStatus(listStatus, `Now editing ${selected.name}. The planner will use this list while you are signed in.`);
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
    setStatus(editorStatus, "Could not delete that meal. Check the Firestore security rules.", true);
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
    setStatus(catalogStatus, "Could not read this meal list. Check the connection and Firestore security rules.", true);
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
  if (ownedLists.some((list) => String(list.name ?? "").trim().toLowerCase() === name.toLowerCase())) {
    setStatus(listStatus, `You already have a list named ${name}.`, true);
    return;
  }

  try {
    setStatus(listStatus, `Creating ${name}…`);
    const listRef = await addDoc(collection(db, "lists"), {
      name,
      ownerUid: user.uid,
      publicRead: false,
      schemaVersion: 1,
      createdAt: serverTimestamp(),
    });
    createListForm.reset();
    await loadOwnedLists(user, listRef.id);
    setStatus(listStatus, `${name} created. New lists start empty and private.`);
  } catch (error) {
    console.error(error);
    setStatus(listStatus, "Could not create the list. Check the Firestore security rules.", true);
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
    setStatus(categoryStatus, "Could not add the category. Check the Firestore security rules.", true);
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
    setStatus(categoryEditStatus, "Could not update the category. Check the Firestore security rules.", true);
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
    setStatus(editorStatus, "Could not save the meal. Check the Firestore security rules.", true);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginPanel.hidden = false;
    adminPanel.hidden = true;
    accountEmail.textContent = "";
    accountUid.textContent = "";
    ownedLists = [];
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
    await loadOwnedLists(user);
    if (activeListId) {
      setStatus(listStatus, `Editing ${activeListName}.`);
    }
  } catch (error) {
    console.error(error);
    ownedLists = [];
    activeListId = null;
    activeListName = "";
    renderListControls();
    clearCatalogUi();
    setStatus(listStatus, "Could not load your meal lists. Check the Firestore security rules.", true);
  }
});
