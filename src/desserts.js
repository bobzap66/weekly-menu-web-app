import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import { chooseDesserts } from "./dessert-roll.js?v=0.27.0";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME, getStoredActiveList, setStoredActiveList } from "./list-config.js?v=0.26.0";

const listSummary = document.querySelector("#dessert-list-summary");
const rollButton = document.querySelector("#roll-dessert-button");
const rollStatus = document.querySelector("#dessert-roll-status");
const options = document.querySelector("#dessert-options");
const editorCard = document.querySelector("#dessert-editor-card");
const form = document.querySelector("#dessert-form");
const dessertId = document.querySelector("#dessert-id");
const dessertName = document.querySelector("#dessert-name");
const dessertWeight = document.querySelector("#dessert-weight");
const dessertRecipeUrl = document.querySelector("#dessert-recipe-url");
const dessertDescription = document.querySelector("#dessert-description");
const dessertActive = document.querySelector("#dessert-active");
const cancelEdit = document.querySelector("#cancel-dessert-edit");
const editorStatus = document.querySelector("#dessert-editor-status");
const search = document.querySelector("#dessert-search");
const status = document.querySelector("#dessert-status");
const catalog = document.querySelector("#dessert-catalog");

let activeList = { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME };
let desserts = [];
let canEdit = false;

const dessertsCollection = () => collection(db, "lists", activeList.id, "desserts");
const dessertDocument = (id) => doc(db, "lists", activeList.id, "desserts", id);

function resetForm() {
  form.reset();
  dessertId.value = "";
  dessertWeight.value = "1";
  dessertActive.checked = true;
  cancelEdit.hidden = true;
  editorStatus.textContent = "";
  editorStatus.classList.remove("is-error");
}

function editDessert(dessert) {
  dessertId.value = dessert.id;
  dessertName.value = dessert.name;
  dessertWeight.value = String(dessert.weight);
  dessertRecipeUrl.value = dessert.recipeUrl;
  dessertDescription.value = dessert.description;
  dessertActive.checked = dessert.active;
  cancelEdit.hidden = false;
  editorStatus.textContent = `Editing ${dessert.name}.`;
  editorCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addRecipeLink(container, dessert) {
  if (!dessert.recipeUrl) return;
  const link = document.createElement("a");
  link.className = "recipe-link";
  link.href = dessert.recipeUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Recipe ↗";
  link.addEventListener("click", (event) => event.stopPropagation());
  container.append(link);
}

function renderRoll(choices) {
  const fragment = document.createDocumentFragment();
  for (const dessert of choices) {
    const choice = document.createElement("button");
    const heading = document.createElement("h3");
    const description = document.createElement("p");
    choice.type = "button";
    choice.className = "dessert-option";
    heading.textContent = dessert.name;
    description.textContent = dessert.description || "A sweet possibility.";
    choice.append(heading, description);
    addRecipeLink(choice, dessert);
    choice.addEventListener("click", () => {
      for (const item of options.querySelectorAll(".dessert-option")) item.classList.remove("is-selected");
      choice.classList.add("is-selected");
      rollStatus.textContent = `${dessert.name} selected. Dessert is decided.`;
    });
    fragment.append(choice);
  }
  options.replaceChildren(fragment);
}

function renderCatalog() {
  const queryText = search.value.trim().toLocaleLowerCase();
  const filtered = desserts.filter((dessert) =>
    !queryText || `${dessert.name} ${dessert.description}`.toLocaleLowerCase().includes(queryText),
  );
  const fragment = document.createDocumentFragment();

  for (const dessert of filtered) {
    const card = document.createElement("article");
    const main = document.createElement("div");
    const title = document.createElement("h3");
    const meta = document.createElement("div");
    card.className = `admin-meal-card${dessert.active ? "" : " is-inactive"}`;
    main.className = "admin-meal-main";
    title.textContent = dessert.name;
    meta.className = "meal-meta-row";
    meta.textContent = `Weight ${dessert.weight}${dessert.active ? "" : " · Inactive"}`;
    main.append(title, meta);

    if (dessert.description) {
      const description = document.createElement("p");
      description.className = "admin-meal-description";
      description.textContent = dessert.description;
      main.append(description);
    }
    addRecipeLink(main, dessert);
    card.append(main);

    if (canEdit) {
      const actions = document.createElement("div");
      const edit = document.createElement("button");
      const remove = document.createElement("button");
      actions.className = "admin-meal-actions";
      edit.className = "action-button secondary-button compact-button";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => editDessert(dessert));
      remove.className = "action-button secondary-button compact-button danger-button";
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete ${dessert.name}? This cannot be undone.`)) return;
        try {
          await deleteDoc(dessertDocument(dessert.id));
          await loadDesserts();
        } catch (error) {
          console.error(error);
          status.textContent = "Could not delete that dessert.";
          status.classList.add("is-error");
        }
      });
      actions.append(edit, remove);
      card.append(actions);
    }
    fragment.append(card);
  }

  catalog.replaceChildren(fragment);
  status.textContent = `${filtered.length} of ${desserts.length} desserts shown in ${activeList.name}.`;
}

async function loadDesserts() {
  const snapshot = await getDocs(dessertsCollection());
  desserts = snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      name: String(data.name ?? "").trim(),
      weight: Number(data.weight) || 1,
      active: data.active !== false,
      recipeUrl: typeof data.recipeUrl === "string" ? data.recipeUrl : "",
      description: typeof data.description === "string" ? data.description : "",
    };
  }).filter((dessert) => dessert.name).sort((a, b) => a.name.localeCompare(b.name));

  const activeCount = desserts.filter((dessert) => dessert.active).length;
  listSummary.textContent = `List: ${activeList.name} · ${activeCount} active ${activeCount === 1 ? "dessert" : "desserts"}`;
  rollButton.disabled = activeCount === 0;
  rollStatus.textContent = activeCount === 0
    ? "Add at least one active dessert to begin."
    : activeCount < 3
      ? `Roll the ${activeCount} available ${activeCount === 1 ? "dessert" : "desserts"}.`
      : "Roll three weighted choices, then pick one.";
  renderCatalog();
}

rollButton.addEventListener("click", () => {
  const choices = chooseDesserts(desserts, 3);
  renderRoll(choices);
  rollStatus.textContent = choices.length === 1 ? "One active dessert is available." : "Pick your favorite of these choices.";
});

search.addEventListener("input", renderCatalog);
cancelEdit.addEventListener("click", resetForm);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = dessertName.value.trim();
  const weight = Number(dessertWeight.value);
  if (!name || !Number.isFinite(weight) || weight <= 0) return;
  const values = {
    name,
    weight,
    active: dessertActive.checked,
    recipeUrl: dessertRecipeUrl.value.trim(),
    description: dessertDescription.value.trim(),
  };

  try {
    if (dessertId.value) {
      await updateDoc(dessertDocument(dessertId.value), values);
    } else {
      await addDoc(dessertsCollection(), values);
    }
    await loadDesserts();
    resetForm();
  } catch (error) {
    console.error(error);
    editorStatus.textContent = "Could not save that dessert. Check your access to this list.";
    editorStatus.classList.add("is-error");
  }
});

await auth.authStateReady();
const user = auth.currentUser;
activeList = user ? getStoredActiveList() : { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME };
canEdit = Boolean(user);
editorCard.hidden = !canEdit;

try {
  await loadDesserts();
  if (user) setStoredActiveList(activeList.id, activeList.name);
} catch (error) {
  if (activeList.id !== DEFAULT_LIST_ID) {
    activeList = { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME };
    canEdit = false;
    editorCard.hidden = true;
    try {
      await loadDesserts();
    } catch (fallbackError) {
      console.error(fallbackError);
      listSummary.textContent = "Could not load the dessert list.";
    }
  } else {
    console.error(error);
    listSummary.textContent = "Could not load the dessert list.";
  }
}
