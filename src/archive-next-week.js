import { getPlannerStorageKeys } from "./planner-storage.js?v=0.17.0";
import { archiveScheduledWeek } from "./week-archive.js?v=0.21.0";

const primaryButton = document.querySelector("#primary-button");
const selectionStatus = document.querySelector("#selection-status");
const activeListSummary = document.querySelector("#active-list-summary");
let bypassNextClick = false;
let archiveInProgress = false;

function cloudHistoryApplies() {
  return activeListSummary?.textContent.includes("Household plan: cloud synced") === true;
}

function readCurrentState(listId) {
  try {
    const keys = getPlannerStorageKeys(listId);
    return JSON.parse(localStorage.getItem(keys.state));
  } catch {
    return null;
  }
}

if (primaryButton) {
  primaryButton.addEventListener(
    "click",
    async (event) => {
      if (bypassNextClick) {
        bypassNextClick = false;
        return;
      }

      if (
        archiveInProgress ||
        primaryButton.textContent.trim() !== "Start next week" ||
        !cloudHistoryApplies()
      ) {
        return;
      }

      const listId = document.documentElement.dataset.activeListId;
      const state = readCurrentState(listId);
      if (!state || state.mode !== "scheduled") return;

      event.preventDefault();
      event.stopImmediatePropagation();
      archiveInProgress = true;
      primaryButton.disabled = true;
      const previousStatus = selectionStatus?.textContent ?? "";
      if (selectionStatus) selectionStatus.textContent = "Saving this week to meal history…";

      try {
        await archiveScheduledWeek(listId, state);
        bypassNextClick = true;
        primaryButton.disabled = false;
        archiveInProgress = false;
        primaryButton.click();
      } catch (error) {
        console.error("Could not archive the completed week.", error);
        primaryButton.disabled = false;
        archiveInProgress = false;
        if (selectionStatus) {
          selectionStatus.textContent = "Could not save this week to meal history, so the week was not cleared. Try Start next week again.";
        }
        window.setTimeout(() => {
          if (selectionStatus?.textContent.startsWith("Could not save this week")) {
            selectionStatus.textContent = previousStatus;
          }
        }, 6000);
      }
    },
    true,
  );
}
