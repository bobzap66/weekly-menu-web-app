import { loadRemoteCatalog } from "./catalog.js";

try {
  const loaded = await loadRemoteCatalog();
  document.documentElement.dataset.catalogSource = loaded ? "firestore" : "bundled";
} catch (error) {
  console.warn("Could not load the Firestore meal catalog; using bundled meals instead.", error);
  document.documentElement.dataset.catalogSource = "bundled";
}

await import("./app.js");
