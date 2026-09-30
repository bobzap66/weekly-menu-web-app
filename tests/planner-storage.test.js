import test from "node:test";
import assert from "node:assert/strict";

import { getPlannerStorageKeys } from "../src/planner-storage.js";

test("planner storage keys are isolated by list ID", () => {
  const family = getPlannerStorageKeys("default");
  const other = getPlannerStorageKeys("abc123");

  assert.deepEqual(family, {
    state: "weekly-menu:list:default:state:v1",
    history: "weekly-menu:list:default:history:v2",
    nothingNew: "weekly-menu:list:default:nothing-new",
  });
  assert.notEqual(family.state, other.state);
  assert.notEqual(family.history, other.history);
  assert.notEqual(family.nothingNew, other.nothingNew);
});

test("planner storage keys require a list ID", () => {
  assert.throws(() => getPlannerStorageKeys(""), /active list ID/);
  assert.throws(() => getPlannerStorageKeys(null), /active list ID/);
});
