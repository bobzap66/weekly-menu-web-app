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
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

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

let categories = [];
let meals = [];

function sortByOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function populateCategorySelect(selectedId = "") {
  mealCategory.replaceChildren();

  for (const category of categories.filter((category) => !category.result).sort(sortByOrder)) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    option.selected = category.id === selectedId;
    mealCategory.append(option);
  }
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
  if (!meal) return;

  if (!window.confirm(`Delete ${meal.name}? This cannot be undone.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "meals", id));
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
  const query = mealSearch.value.trim().toLowerCase();
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const filtered = meals
    .filter((meal) => {
      if (!query) return true;
      const categoryName = categoryById.get(meal.categoryId)?.name ?? "";
      return `${meal.name} ${categoryName} ${meal.description ?? ""}`.toLowerCase().includes(query);
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
    meta.append(category);

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
  catalogStatus.textContent = `${filtered.length} of ${meals.length} meals shown.`;
}

async function loadCatalog() {
  try {
    setStatus(catalogStatus, "Loading meals…");
    const [categorySnapshot, mealSnapshot] = await Promise.all([
      getDocs(collection(db, "categories")),
      getDocs(collection(db, "meals")),
    ]);

    categories = categorySnapshot.docs
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
      .sort(sortByOrder);
    meals = mealSnapshot.docs
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
      .sort(sortByOrder);

    populateCategorySelect(mealCategory.value);
    renderMeals();
  } catch (error) {
    console.error(error);
    categories = [];
    meals = [];
    mealCatalog.replaceChildren();
    setStatus(catalogStatus, "Could not read Firestore. Check the connection and security rules.", true);
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
    window.setTimeout(() => {
      copyUidButton.textContent = "Copy UID";
    }, 1500);
  } catch {
    setStatus(editorStatus, "Could not copy automatically. Select the UID text and copy it manually.", true);
  }
});

cancelEditButton.addEventListener("click", resetMealForm);
mealSearch.addEventListener("input", renderMeals);

mealForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const categoryId = mealCategory.value;
  const name = mealName.value.trim();
  const weight = Number(mealWeight.value);

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
      await updateDoc(doc(db, "meals", mealId.value), values);
      setStatus(editorStatus, `${name} updated.`);
    } else {
      const maxOrder = meals
        .filter((meal) => meal.categoryId === categoryId)
        .reduce((max, meal) => Math.max(max, Number(meal.order) || 0), -1);
      await addDoc(collection(db, "meals"), { ...values, order: maxOrder + 1 });
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
    return;
  }

  loginPanel.hidden = true;
  adminPanel.hidden = false;
  accountEmail.textContent = user.email ?? "Signed-in user";
  accountUid.textContent = user.uid;
  await loadCatalog();
  resetMealForm();
});
