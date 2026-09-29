import { loadRemoteCatalog } from "./catalog.js?v=0.9.0";

const STABLE_ID_RESET_KEY = "weekly-menu:stable-id-reset:v1";

try {
  if (localStorage.getItem(STABLE_ID_RESET_KEY) !== "done") {
    localStorage.removeItem("weekly-menu:v6");
    localStorage.removeItem("weekly-menu:history:v1");
    localStorage.setItem(STABLE_ID_RESET_KEY, "done");
  }
} catch {
  // The planner can still run when browser storage is unavailable.
}

try {
  const loaded = await loadRemoteCatalog();
  document.documentElement.dataset.catalogSource = loaded ? "firestore" : "bundled";
} catch (error) {
  console.warn("Could not load the Firestore meal catalog; using bundled meals instead.", error);
  document.documentElement.dataset.catalogSource = "bundled";
}

await import("./app.js?v=0.9.0");
