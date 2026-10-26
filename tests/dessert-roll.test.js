import test from "node:test";
import assert from "node:assert/strict";
import { chooseDesserts } from "../src/dessert-roll.js";

const desserts = [
  { id: "cake", weight: 1, active: true },
  { id: "pie", weight: 3, active: true },
  { id: "pudding", weight: 10, active: false },
  { id: "cookies", weight: 1, active: true },
];

test("dessert roller returns distinct weighted active choices", () => {
  const result = chooseDesserts(desserts, 3, () => 0);
  assert.deepEqual(result.map((item) => item.id), ["cake", "pie", "cookies"]);
  assert.equal(new Set(result.map((item) => item.id)).size, 3);
  assert.equal(result.some((item) => item.id === "pudding"), false);
});

test("dessert roller returns every available choice when fewer than three are active", () => {
  const result = chooseDesserts(desserts.slice(0, 2), 3, () => 0.99);
  assert.equal(result.length, 2);
});

test("dessert roller returns no choices without active desserts", () => {
  assert.deepEqual(chooseDesserts([{ id: "cake", weight: 1, active: false }]), []);
});
