export const DEFAULT_LIST_ID = "default";
export const DEFAULT_LIST_NAME = "Family Dinners";
export const ACTIVE_LIST_STORAGE_KEY = "weekly-menu:active-list:v1";

export function getStoredActiveList() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_LIST_STORAGE_KEY));
    if (
      saved &&
      typeof saved.id === "string" &&
      saved.id.length > 0 &&
      typeof saved.name === "string" &&
      saved.name.length > 0
    ) {
      return saved;
    }
  } catch {
    // Fall through to the public default when storage is unavailable or malformed.
  }

  return { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME };
}

export function setStoredActiveList(id, name) {
  if (typeof id !== "string" || id.length === 0) return;

  const safeName = typeof name === "string" && name.trim().length > 0
    ? name.trim()
    : id;

  try {
    localStorage.setItem(ACTIVE_LIST_STORAGE_KEY, JSON.stringify({ id, name: safeName }));
  } catch {
    // List switching still works for the current page even if storage is unavailable.
  }
}
