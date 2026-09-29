import { loadRemoteCatalog } from "./catalog.js?v=0.10.0";
import { auth } from "./firebase.js";
import {
  DEFAULT_LIST_ID,
  DEFAULT_LIST_NAME,
  getStoredActiveList,
  setStoredActiveList,
} from "./list-config.js?v=0.10.0";

const STABLE_ID_RESET_KEY = "weekly-menu:stable-id-reset:v2";
const PLANNER_LIST_KEY = "weekly-menu:planner-list:v1";

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

await auth.authStateReady();
const user = auth.currentUser;
let activeList = user
  ? getStoredActiveList()
  : { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME };
let catalogSource = "bundled";

async function loadList(list) {
  await loadRemoteCatalog(list.id);
  activeList = list;
  catalogSource = "firestore-list";
}

try {
  await loadList(activeList);
  if (user) setStoredActiveList(activeList.id, activeList.name);
} catch (error) {
  if (activeList.id !== DEFAULT_LIST_ID) {
    console.warn(`Could not load meal list ${activeList.id}; trying the public default list instead.`, error);
    try {
      await loadList({ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME });
      if (user) setStoredActiveList(DEFAULT_LIST_ID, DEFAULT_LIST_NAME);
    } catch (fallbackError) {
      console.warn("Could not load the public Firestore meal list; using bundled meals instead.", fallbackError);
      activeList = { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME };
    }
  } else {
    console.warn("Could not load the Firestore meal list; using bundled meals instead.", error);
  }
}

// During pre-alpha, changing lists starts that list with a clean local planning
// session rather than letting carryovers/history from another list leak across.
try {
  const previousPlannerList = localStorage.getItem(PLANNER_LIST_KEY);
  if (previousPlannerList !== activeList.id) {
    localStorage.removeItem("weekly-menu:v6");
    localStorage.removeItem("weekly-menu:history:v1");
    localStorage.removeItem("weekly-menu:nothing-new");
    localStorage.setItem(PLANNER_LIST_KEY, activeList.id);
  }
} catch {
  // The planner can still run when browser storage is unavailable.
}

document.documentElement.dataset.catalogSource = catalogSource;
document.documentElement.dataset.activeListId = activeList.id;
document.documentElement.dataset.activeListName = activeList.name;

const listSummary = document.querySelector("#active-list-summary");
if (listSummary) {
  listSummary.textContent = `List: ${activeList.name}`;
  listSummary.hidden = false;
}

await import("./app.js?v=0.10.0");
