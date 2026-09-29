import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import { descriptionKey, mealDescriptions } from "./meal-descriptions.js";

const card = document.querySelector("#description-fill-card");
const button = document.querySelector("#description-fill-button");
const status = document.querySelector("#description-fill-status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

async function getFillableMeals() {
  const snapshot = await getDocs(collection(db, "meals"));
  return snapshot.docs
    .map((mealDoc) => ({ id: mealDoc.id, ...mealDoc.data() }))
    .filter((meal) => {
      const current = typeof meal.description === "string" ? meal.description.trim() : "";
      const suggested = mealDescriptions[descriptionKey(meal.categoryId, meal.name)];
      return !current && typeof suggested === "string" && suggested.trim().length > 0;
    });
}

async function refreshCount() {
  if (!auth.currentUser) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  button.disabled = true;
  setStatus("Checking for blank descriptions…");

  try {
    const fillable = await getFillableMeals();
    if (fillable.length === 0) {
      button.textContent = "No missing descriptions";
      setStatus("Every matching meal already has a description.");
      return;
    }

    button.textContent = `Fill ${fillable.length} missing descriptions`;
    button.disabled = false;
    setStatus("Only blank descriptions will be filled. Existing descriptions will not be changed.");
  } catch (error) {
    console.error(error);
    setStatus("Could not check the meal descriptions.", true);
  }
}

async function fillMissingDescriptions() {
  if (!auth.currentUser) return;

  button.disabled = true;
  setStatus("Filling blank descriptions…");

  try {
    const fillable = await getFillableMeals();
    if (fillable.length === 0) {
      await refreshCount();
      return;
    }

    const batch = writeBatch(db);
    for (const meal of fillable) {
      const description = mealDescriptions[descriptionKey(meal.categoryId, meal.name)];
      batch.update(doc(db, "meals", meal.id), { description });
    }

    await batch.commit();
    setStatus(`Added ${fillable.length} descriptions. Refreshing the catalog…`);
    window.setTimeout(() => window.location.reload(), 650);
  } catch (error) {
    console.error(error);
    button.disabled = false;
    setStatus("Could not fill the descriptions. Check the Firestore security rules and try again.", true);
  }
}

button.addEventListener("click", fillMissingDescriptions);
onAuthStateChanged(auth, refreshCount);
