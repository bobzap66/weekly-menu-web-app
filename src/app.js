import { menuData } from "./data.js";
import { generateMenu } from "./generator.js";

const menuList = document.querySelector("#menu-list");
const generateButton = document.querySelector("#generate-button");

function renderMenu() {
  const suggestions = generateMenu(menuData);
  const fragment = document.createDocumentFragment();

  for (const suggestion of suggestions) {
    const item = document.createElement("li");
    const mealName = document.createElement("span");
    const categoryName = document.createElement("span");

    item.className = "menu-item";
    mealName.className = "meal-name";
    categoryName.className = "category-name";
    mealName.textContent = suggestion.mealName;
    categoryName.textContent = suggestion.categoryName;

    item.append(mealName, categoryName);
    fragment.append(item);
  }

  menuList.replaceChildren(fragment);
}

generateButton.addEventListener("click", renderMenu);
renderMenu();

