function normalizeSearchText(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function optionData(option) {
  return {
    value: option.value,
    text: option.textContent ?? "",
    disabled: option.disabled,
  };
}

export function filterMealChooserModel(model, query, selectedValue = "") {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return model.map((item) =>
      item.type === "group"
        ? { ...item, options: item.options.map((option) => ({ ...option })) }
        : { ...item, option: { ...item.option } },
    );
  }

  return model.flatMap((item) => {
    if (item.type === "option") {
      return [{ ...item, option: { ...item.option } }];
    }

    const categoryMatches = normalizeSearchText(item.label).includes(normalizedQuery);
    const options = item.options.filter(
      (option) =>
        categoryMatches ||
        normalizeSearchText(option.text).includes(normalizedQuery) ||
        option.value === selectedValue,
    );

    return options.length > 0
      ? [{ ...item, options: options.map((option) => ({ ...option })) }]
      : [];
  });
}

function readSelectModel(select) {
  return [...select.children].map((child) => {
    if (child.tagName === "OPTGROUP") {
      return {
        type: "group",
        label: child.label,
        options: [...child.children].map(optionData),
      };
    }

    return {
      type: "option",
      option: optionData(child),
    };
  });
}

let pickerSequence = 0;

function createMealOption(option, categoryName, select, search, listbox, id) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const name = document.createElement("span");
  const category = document.createElement("span");

  item.setAttribute("role", "presentation");
  button.type = "button";
  button.className = "manual-meal-result";
  button.id = id;
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", String(option.value === select.value));
  button.tabIndex = -1;
  button.disabled = option.disabled;
  name.className = "manual-meal-result-name";
  name.textContent = option.text;
  category.className = "manual-meal-result-category";
  category.textContent = categoryName;
  button.append(name, category);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    search.value = "";
    listbox.hidden = true;
    search.setAttribute("aria-expanded", "false");
    search.removeAttribute("aria-activedescendant");
  });
  item.append(button);
  return item;
}

function enhanceMealChooser(control) {
  if (control.dataset.searchEnhanced === "true") return;

  const select = control.querySelector(".manual-meal-select");
  if (!select) return;

  control.dataset.searchEnhanced = "true";
  const model = readSelectModel(select);
  const picker = document.createElement("div");
  const search = document.createElement("input");
  const listbox = document.createElement("ul");
  const pickerId = `meal-picker-${++pickerSequence}`;
  let activeOptionIndex = -1;

  picker.className = "manual-meal-picker";
  search.type = "search";
  search.className = "manual-meal-search";
  search.placeholder = "Type a meal or category…";
  search.autocomplete = "off";
  search.disabled = select.disabled;
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-autocomplete", "list");
  search.setAttribute("aria-expanded", "false");
  search.setAttribute("aria-controls", pickerId);
  listbox.id = pickerId;
  listbox.className = "manual-meal-results";
  listbox.setAttribute("role", "listbox");
  listbox.hidden = true;
  select.hidden = true;

  const selectLabel = select.getAttribute("aria-label");
  search.setAttribute(
    "aria-label",
    selectLabel ? `Search ${selectLabel.toLocaleLowerCase()}` : "Search saved meals",
  );

  const renderResults = () => {
    const filtered = filterMealChooserModel(model, search.value, select.value);
    const fragment = document.createDocumentFragment();
    let resultCount = 0;
    activeOptionIndex = -1;
    search.removeAttribute("aria-activedescendant");

    for (const item of filtered) {
      if (item.type === "option") {
        fragment.append(createMealOption(item.option, "", select, search, listbox, `${pickerId}-option-${resultCount}`));
        resultCount += 1;
        continue;
      }

      const group = document.createElement("li");
      const groupLabel = document.createElement("div");
      group.className = "manual-meal-result-group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", item.label);
      groupLabel.className = "manual-meal-result-group-label";
      groupLabel.textContent = item.label;
      group.append(groupLabel);
      for (const option of item.options) {
        group.append(createMealOption(option, item.label, select, search, listbox, `${pickerId}-option-${resultCount}`));
        resultCount += 1;
      }
      fragment.append(group);
    }

    if (resultCount === 0) {
      const empty = document.createElement("li");
      empty.className = "manual-meal-no-results";
      empty.setAttribute("role", "presentation");
      empty.textContent = "No matching meals";
      fragment.append(empty);
    }

    listbox.replaceChildren(fragment);
  };

  const openResults = () => {
    renderResults();
    listbox.hidden = false;
    search.setAttribute("aria-expanded", "true");
  };

  search.addEventListener("focus", openResults);
  search.addEventListener("input", openResults);
  search.addEventListener("keydown", (event) => {
    const options = [...listbox.querySelectorAll('[role="option"]:not(:disabled)')];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!listbox.hidden && options.length > 0) {
        activeOptionIndex = Math.max(0, Math.min(options.length - 1, activeOptionIndex + (event.key === "ArrowDown" ? 1 : -1)));
        search.setAttribute("aria-activedescendant", options[activeOptionIndex].id);
      }
    } else if (event.key === "Escape") {
      listbox.hidden = true;
      search.setAttribute("aria-expanded", "false");
    } else if (event.key === "Enter" && options.length > 0) {
      event.preventDefault();
      (activeOptionIndex >= 0 ? options[activeOptionIndex] : options[0]).click();
    }
  });
  control.addEventListener("focusout", (event) => {
    if (control.contains(event.relatedTarget) || picker.contains(event.relatedTarget)) return;
    window.setTimeout(() => {
      if (document.activeElement !== search && !listbox.contains(document.activeElement)) {
        listbox.hidden = true;
        search.setAttribute("aria-expanded", "false");
      }
    }, 0);
  });

  picker.append(search, listbox);
  control.append(picker);
}

function enhanceAllMealChoosers() {
  for (const control of document.querySelectorAll(".manual-meal-control")) {
    enhanceMealChooser(control);
  }
}

if (typeof document !== "undefined") {
  const menuList = document.querySelector("#menu-list");
  enhanceAllMealChoosers();

  if (menuList) {
    const observer = new MutationObserver(() => enhanceAllMealChoosers());
    observer.observe(menuList, { childList: true, subtree: true });
  }
}

