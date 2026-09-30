import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import {
  DEFAULT_LIST_ID,
  DEFAULT_LIST_NAME,
  setStoredActiveList,
} from "./list-config.js?v=0.15.0";
import { getPlannerStorageKeys } from "./planner-storage.js?v=0.15.0";

const DELETE_BATCH_SIZE = 400;

const listSelect = document.querySelector("#list-select");
const deleteListForm = document.querySelector("#delete-list-form");
const deleteListConfirm = document.querySelector("#delete-list-confirm");
const deleteListButton = document.querySelector("#delete-list-button");
const deleteListHelp = document.querySelector("#delete-list-help");
const listStatus = document.querySelector("#list-status");

function setListStatus(message, isError = false) {
  listStatus.textContent = message;
  listStatus.classList.toggle("is-error", isError);
}

function selectedList() {
  const option = listSelect.options[listSelect.selectedIndex];
  if (!option || !listSelect.value) return null;
  return {
    id: listSelect.value,
    name: option.dataset.listName || option.textContent.trim(),
    ownerUid: option.dataset.ownerUid || "",
  };
}

function refreshDeleteControls() {
  const user = auth.currentUser;
  const selected = selectedList();
  const protectedDefault = selected?.id === DEFAULT_LIST_ID;
  const ownedByUser = Boolean(user && selected && selected.ownerUid === user.uid);
  const enabled = Boolean(selected) && ownedByUser && !protectedDefault;

  deleteListConfirm.disabled = !enabled;
  deleteListConfirm.placeholder = protectedDefault
    ? `${DEFAULT_LIST_NAME} cannot be deleted`
    : selected && !ownedByUser
      ? "Only the owner can delete this shared list"
      : selected
        ? `Type ${selected.name}`
        : "Choose a list first";

  if (!enabled) deleteListConfirm.value = "";

  deleteListButton.disabled =
    !enabled || deleteListConfirm.value.trim() !== selected.name;

  if (protectedDefault) {
    deleteListHelp.textContent = `${DEFAULT_LIST_NAME} is protected because the signed-out planner uses it as the public default.`;
  } else if (selected && !ownedByUser) {
    deleteListHelp.textContent = `“${selected.name}” is shared with you. Only its owner can permanently delete the list.`;
  } else if (selected) {
    deleteListHelp.textContent = `Type “${selected.name}” exactly to enable permanent deletion.`;
  } else {
    deleteListHelp.textContent = "Choose a list before deleting.";
  }
}

async function deleteSnapshotDocuments(listId, categorySnapshot, mealSnapshot, historySnapshot) {
  const deletes = [
    ...categorySnapshot.docs.map((item) => ({ subcollection: "categories", id: item.id })),
    ...mealSnapshot.docs.map((item) => ({ subcollection: "meals", id: item.id })),
    ...historySnapshot.docs.map((item) => ({ subcollection: "history", id: item.id })),
    { subcollection: "planner", id: "current" },
  ];

  for (let start = 0; start < deletes.length; start += DELETE_BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const { subcollection, id } of deletes.slice(start, start + DELETE_BATCH_SIZE)) {
      batch.delete(doc(db, "lists", listId, subcollection, id));
    }
    await batch.commit();
  }
}

function removeLocalPlannerStorage(listId) {
  try {
    const keys = getPlannerStorageKeys(listId);
    for (const key of Object.values(keys)) localStorage.removeItem(key);
  } catch {
    // Firestore deletion should still succeed if browser storage is unavailable.
  }
}

listSelect.addEventListener("change", refreshDeleteControls);
deleteListConfirm.addEventListener("input", refreshDeleteControls);

new MutationObserver(refreshDeleteControls).observe(listSelect, {
  childList: true,
  subtree: true,
});

deleteListForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const user = auth.currentUser;
  const selected = selectedList();

  if (!user || !selected) {
    setListStatus("Choose a list to delete first.", true);
    return;
  }

  if (selected.ownerUid !== user.uid) {
    setListStatus(`Only the owner can delete ${selected.name}.`, true);
    refreshDeleteControls();
    return;
  }

  if (selected.id === DEFAULT_LIST_ID) {
    setListStatus(`${DEFAULT_LIST_NAME} is the protected public default and cannot be deleted.`, true);
    refreshDeleteControls();
    return;
  }

  if (deleteListConfirm.value.trim() !== selected.name) {
    setListStatus(`Type ${selected.name} exactly before deleting it.`, true);
    refreshDeleteControls();
    return;
  }

  deleteListButton.disabled = true;
  deleteListConfirm.disabled = true;

  try {
    setListStatus(`Checking ${selected.name} before deletion…`);
    const [categorySnapshot, mealSnapshot, historySnapshot] = await Promise.all([
      getDocs(collection(db, "lists", selected.id, "categories")),
      getDocs(collection(db, "lists", selected.id, "meals")),
      getDocs(collection(db, "lists", selected.id, "history")),
    ]);

    const confirmed = window.confirm(
      `Permanently delete “${selected.name}” with ${categorySnapshot.size} categories, ${mealSnapshot.size} meals, and ${historySnapshot.size} archived weeks? This also removes its shared household plan, access for every shared editor, and cannot be undone.`,
    );

    if (!confirmed) {
      setListStatus(`Deletion of ${selected.name} cancelled.`);
      return;
    }

    setListStatus(`Deleting ${selected.name}…`);
    await deleteSnapshotDocuments(selected.id, categorySnapshot, mealSnapshot, historySnapshot);

    // Delete the parent last. Firestore does not cascade subcollection deletes,
    // and the child-write rules depend on the parent list still existing.
    await deleteDoc(doc(db, "lists", selected.id));
    removeLocalPlannerStorage(selected.id);

    setStoredActiveList(DEFAULT_LIST_ID, DEFAULT_LIST_NAME);
    setListStatus(`${selected.name} deleted. Reloading your remaining lists…`);
    window.setTimeout(() => window.location.reload(), 350);
  } catch (error) {
    console.error(error);
    setListStatus(
      "Could not finish deleting the list. The parent list is left in place when child deletion fails, so you can retry the deletion.",
      true,
    );
  } finally {
    refreshDeleteControls();
  }
});

onAuthStateChanged(auth, refreshDeleteControls);
refreshDeleteControls();
