import test from "node:test";
import assert from "node:assert/strict";

import { filterMealChooserModel } from "../src/meal-chooser-search.js";

const model = [
  {
    type: "option",
    option: { value: "", text: "Choose automatically", disabled: false },
  },
  {
    type: "group",
    label: "Mexican",
    options: [
      { value: "tacos", text: "Tacos", disabled: false },
      { value: "enchiladas", text: "Enchiladas", disabled: false },
    ],
  },
  {
    type: "group",
    label: "Pasta",
    options: [
      { value: "lasagna", text: "Lasagna", disabled: false },
      { value: "spaghetti", text: "Spaghetti and Meatballs", disabled: false },
    ],
  },
];

test("meal chooser search matches meal names case-insensitively", () => {
  const filtered = filterMealChooserModel(model, "TACO");

  assert.equal(filtered.length, 2);
  assert.equal(filtered[1].label, "Mexican");
  assert.deepEqual(filtered[1].options.map((option) => option.value), ["tacos"]);
});

test("meal chooser search matches category names and keeps all meals in that category", () => {
  const filtered = filterMealChooserModel(model, "pasta");

  assert.equal(filtered.length, 2);
  assert.equal(filtered[1].label, "Pasta");
  assert.deepEqual(
    filtered[1].options.map((option) => option.value),
    ["lasagna", "spaghetti"],
  );
});

test("meal chooser search preserves the currently selected meal while filtering", () => {
  const filtered = filterMealChooserModel(model, "tacos", "lasagna");
  const groups = filtered.filter((item) => item.type === "group");

  assert.deepEqual(groups.map((group) => group.label), ["Mexican", "Pasta"]);
  assert.deepEqual(groups[0].options.map((option) => option.value), ["tacos"]);
  assert.deepEqual(groups[1].options.map((option) => option.value), ["lasagna"]);
});
