import { loadRemoteCatalog } from "./catalog.js?v=0.9.2";

const STABLE_ID_RESET_KEY = "weekly-menu:stable-id-reset:v2";

try {
  if (localStorage.getItem(STABLE_ID_RESET_KEY) !== "done") {
    localStorage.removeItem("weekly-menu:v6");
    localStorage.removeItem("weekly-menu:history:v1");
    localStorage.removeItem("weekly-menu:nothing-new");
    localStorage.setItem(STABLE_ID_RESET_KEY, "done");
  }
} catch {
  // The planner can still run when browser storage is unavailable.
}

try {
  const loaded = await loadRemoteCatalog();
  document.documentElement.dataset.catalogSource = loaded ? "firestore-list" : "bundled";
} catch (error) {
  console.warn("Could not load the Firestore meal list; using bundled meals instead.", error);
  document.documentElement.dataset.catalogSource = "bundled";
}

await import("./app.js?v=0.9.2");
