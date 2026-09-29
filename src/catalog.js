import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { menuData } from "./data.js";
import { db } from "./firebase.js";

function sortByOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

function mealFromDocument(docSnapshot) {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    stableId: data.stableId,
    categoryId: data.categoryId,
    name: data.name,
    weight: Number(data.weight) || 1,
    quick: data.quick === true,
    bigMeal: data.bigMeal === true,
    active: data.active !== false,
    recipeUrl: typeof data.recipeUrl === "string" ? data.recipeUrl : "",
    description: typeof data.description === "string" ? data.description : "",
    order: Number.isFinite(data.order) ? data.order : 0,
    ...(Array.isArray(data.modifiers) ? { modifiers: data.modifiers } : {}),
  };
}

function categoryFromDocument(docSnapshot) {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    name: data.name,
    weight: Number(data.weight) || 1,
    order: Number.isFinite(data.order) ? data.order : 0,
  };
}

export async function loadRemoteCatalog() {
  const [categorySnapshot, mealSnapshot] = await Promise.all([
    getDocs(collection(db, "categories")),
    getDocs(collection(db, "meals")),
  ]);

  if (categorySnapshot.empty) {
    return false;
  }

  const categories = categorySnapshot.docs.map(categoryFromDocument).sort(sortByOrder);
  const meals = mealSnapshot.docs.map(mealFromDocument).filter((meal) => meal.active).sort(sortByOrder);
  const invalidStableIds = meals.filter(
    (meal) => typeof meal.stableId !== "string" || meal.stableId.length === 0,
  );

  if (invalidStableIds.length > 0) {
    throw new Error(`${invalidStableIds.length} active meal documents are missing stableId.`);
  }

  const mealsByCategory = new Map();

  for (const meal of meals) {
    if (!mealsByCategory.has(meal.categoryId)) {
      mealsByCategory.set(meal.categoryId, []);
    }
    mealsByCategory.get(meal.categoryId).push(meal);
  }

  const remoteCategories = categories
    .map((category) => {
      const categoryMeals = mealsByCategory.get(category.id) ?? [];
      if (categoryMeals.length === 0) {
        return null;
      }

      return {
        id: category.id,
        name: category.name,
        weight: category.weight,
        meals: categoryMeals.map((meal) => ({
          stableId: meal.stableId,
          name: meal.name,
          weight: meal.weight,
          quick: meal.quick,
          bigMeal: meal.bigMeal,
          recipeUrl: meal.recipeUrl,
          description: meal.description,
          ...(meal.modifiers ? { modifiers: meal.modifiers } : {}),
        })),
      };
    })
    .filter(Boolean);

  if (remoteCategories.length === 0) {
    return false;
  }

  menuData.categories.splice(0, menuData.categories.length, ...remoteCategories);
  return true;
}
