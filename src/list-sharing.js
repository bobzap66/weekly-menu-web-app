import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  arrayRemove,
  arrayUnion,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

const listSelect = document.querySelector("#list-select");
const sharingOwnerControls = document.querySelector("#sharing-owner-controls");
const sharingReadonlyNote = document.querySelector("#sharing-readonly-note");
const shareListForm = document.querySelector("#share-list-form");
const shareEditorUid = document.querySelector("#share-editor-uid");
const sharedEditorList = document.querySelector("#shared-editor-list");
const sharingSummary = document.querySelector("#sharing-summary");
const sharingStatus = document.querySelector("#sharing-status");

function setStatus(message, isError = false) {
  sharingStatus.textContent = message;
  sharingStatus.classList.toggle("is-error", isError);
}

function parseEditors(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((uid) => typeof uid === "string" && uid.length > 0) : [];
  } catch {
    return [];
  }
}

function selectedList() {
  const option = listSelect.options[listSelect.selectedIndex];
  if (!option || !listSelect.value) return null;

  return {
    id: listSelect.value,
    name: option.dataset.listName || option.textContent.trim(),
    ownerUid: option.dataset.ownerUid || "",
    editorUids: parseEditors(option.dataset.editorUids),
    option,
  };
}

function updateSelectedEditorData(editorUids) {
  const selected = selectedList();
  if (!selected) return;
  selected.option.dataset.editorUids = JSON.stringify(editorUids);
}

function createEditorRow(uid, list) {
  const row = document.createElement("div");
  const code = document.createElement("code");
  const removeButton = document.createElement("button");

  row.className = "shared-editor-row";
  code.className = "shared-editor-uid";
  code.textContent = uid;
  removeButton.className = "action-button secondary-button compact-button danger-button";
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", async () => {
    if (!window.confirm(`Remove editor access for ${uid} from “${list.name}”?`)) return;

    removeButton.disabled = true;
    setStatus("Removing editor access…");
    try {
      await updateDoc(doc(db, "lists", list.id), { editorUids: arrayRemove(uid) });
      updateSelectedEditorData(list.editorUids.filter((editorUid) => editorUid !== uid));
      setStatus("Editor access removed.");
      renderSharing();
    } catch (error) {
      console.error(error);
      setStatus("Could not remove that editor. Only the list owner can change sharing.", true);
      removeButton.disabled = false;
    }
  });

  row.append(code, removeButton);
  return row;
}

function renderSharing() {
  const user = auth.currentUser;
  const list = selectedList();
  sharedEditorList.replaceChildren();

  if (!user || !list) {
    sharingOwnerControls.hidden = true;
    sharingReadonlyNote.hidden = true;
    sharingSummary.textContent = "Choose a list to manage sharing.";
    return;
  }

  const isOwner = list.ownerUid === user.uid;
  sharingOwnerControls.hidden = !isOwner;
  sharingReadonlyNote.hidden = isOwner;

  if (!isOwner) {
    sharingReadonlyNote.textContent = `“${list.name}” is shared with you as an editor. You can edit its categories and meals, but only its owner can add or remove editors.`;
    sharingSummary.textContent = "Editor access is controlled by the list owner.";
    return;
  }

  sharingSummary.textContent = list.editorUids.length === 0
    ? `${list.name} is not shared with any editors.`
    : `${list.name} has ${list.editorUids.length} ${list.editorUids.length === 1 ? "editor" : "editors"}.`;

  if (list.editorUids.length === 0) {
    const empty = document.createElement("p");
    empty.className = "sharing-empty";
    empty.textContent = "No editors added yet.";
    sharedEditorList.append(empty);
    return;
  }

  for (const uid of list.editorUids) {
    sharedEditorList.append(createEditorRow(uid, list));
  }
}

shareListForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  const list = selectedList();
  const uid = shareEditorUid.value.trim();

  if (!user || !list) {
    setStatus("Choose a list first.", true);
    return;
  }
  if (list.ownerUid !== user.uid) {
    setStatus("Only the list owner can add editors.", true);
    return;
  }
  if (!uid) {
    setStatus("Paste the other account's UID.", true);
    return;
  }
  if (uid === user.uid) {
    setStatus("You already own this list; you do not need editor access.", true);
    return;
  }
  if (list.editorUids.includes(uid)) {
    setStatus("That UID already has editor access.", true);
    return;
  }

  const button = shareListForm.querySelector("button[type='submit']");
  button.disabled = true;
  setStatus("Adding editor…");

  try {
    await updateDoc(doc(db, "lists", list.id), { editorUids: arrayUnion(uid) });
    updateSelectedEditorData([...list.editorUids, uid]);
    shareListForm.reset();
    setStatus("Editor added. That account will see this list the next time Manage Meals loads while signed in.");
    renderSharing();
  } catch (error) {
    console.error(error);
    setStatus("Could not add that editor. Only the list owner can change sharing.", true);
  } finally {
    button.disabled = false;
  }
});

listSelect.addEventListener("change", () => {
  setStatus("");
  renderSharing();
});

new MutationObserver(renderSharing).observe(listSelect, {
  childList: true,
  subtree: true,
});

onAuthStateChanged(auth, renderSharing);
renderSharing();
