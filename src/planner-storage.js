export function getPlannerStorageKeys(listId) {
  if (typeof listId !== "string" || listId.length === 0) {
    throw new Error("Planner storage requires an active list ID.");
  }

  const prefix = `weekly-menu:list:${listId}`;
  return {
    state: `${prefix}:state:v1`,
    history: `${prefix}:history:v2`,
    nothingNew: `${prefix}:nothing-new`,
  };
}
