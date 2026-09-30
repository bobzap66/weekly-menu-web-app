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
    if (child instanceof HTMLOptGroupElement) {
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

function createOption(data, selectedValue) {
  const option = document.createElement("option");
  option.value = data.value;
  option.textContent = data.text;
  option.disabled = data.disabled;
  option.selected = data.value === selectedValue;
  return option;
}

function renderSelectModel(select, model, selectedValue) {
  const fragment = document.createDocumentFragment();

  for (const item of model) {
    if (item.type === "option") {
      fragment.append(createOption(item.option, selectedValue));
      continue;
    }

    const group = document.createElement("optgroup");
    group.label = item.label;
    for (const option of item.options) {
      group.append(createOption(option, selectedValue));
    }
    fragment.append(group);
  }

  select.replaceChildren(fragment);
}

function enhanceMealChooser(control) {
  if (control.dataset.searchEnhanced === "true") return;

  const select = control.querySelector(".manual-meal-select");
  if (!select) return;

  control.dataset.searchEnhanced = "true";
  const model = readSelectModel(select);
  const wrapper = document.createElement("div");
  const searchControl = document.createElement("div");
  const search = document.createElement("input");

  wrapper.className = `searchable-meal-control${control.classList.contains("setup-manual-meal-control") ? " setup-searchable-meal-control" : ""}`;
  searchControl.className = "manual-meal-search-control";
  search.type = "search";
  search.className = "manual-meal-search";
  search.placeholder = "Search meals…";
  search.autocomplete = "off";
  search.disabled = select.disabled;

  const selectLabel = select.getAttribute("aria-label");
  search.setAttribute(
    "aria-label",
    selectLabel ? `Search ${selectLabel.toLocaleLowerCase()}` : "Search saved meals",
  );

  search.addEventListener("input", () => {
    const selectedValue = select.value;
    const filtered = filterMealChooserModel(model, search.value, selectedValue);
    renderSelectModel(select, filtered, selectedValue);
  });

  searchControl.append(search);
  control.before(wrapper);
  wrapper.append(searchControl, control);
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
