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
const shareEditorEmail = document.querySelector("#share-editor-email");
const sharedEditorList = document.querySelector("#shared-editor-list");
const sharingSummary = document.querySelector("#sharing-summary");
const sharingStatus = document.querySelector("#sharing-status");

function setStatus(message, isError = false) {
  sharingStatus.textContent = message;
  sharingStatus.classList.toggle("is-error", isError);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseEditors(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.map(normalizeEmail).filter(Boolean)
      : [];
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
    editorEmails: parseEditors(option.dataset.editorEmails),
    option,
  };
}

function updateSelectedEditorData(editorEmails) {
  const selected = selectedList();
  if (!selected) return;
  selected.option.dataset.editorEmails = JSON.stringify(editorEmails);
}

function createEditorRow(email, list) {
  const row = document.createElement("div");
  const code = document.createElement("code");
  const removeButton = document.createElement("button");

  row.className = "shared-editor-row";
  code.className = "shared-editor-uid";
  code.textContent = email;
  removeButton.className = "action-button secondary-button compact-button danger-button";
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", async () => {
    if (!window.confirm(`Remove editor access for ${email} from “${list.name}”?`)) return;

    removeButton.disabled = true;
    setStatus("Removing editor access…");
    try {
      await updateDoc(doc(db, "lists", list.id), { editorEmails: arrayRemove(email) });
      updateSelectedEditorData(list.editorEmails.filter((editorEmail) => editorEmail !== email));
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
    sharingReadonlyNote.textContent = `“${list.name}” is shared with your verified email address. You can edit its categories and meals, but only its owner can add or remove editors.`;
    sharingSummary.textContent = "Editor access is controlled by the list owner.";
    return;
  }

  sharingSummary.textContent = list.editorEmails.length === 0
    ? `${list.name} is not shared with any editors.`
    : `${list.name} has ${list.editorEmails.length} ${list.editorEmails.length === 1 ? "editor" : "editors"}.`;

  if (list.editorEmails.length === 0) {
    const empty = document.createElement("p");
    empty.className = "sharing-empty";
    empty.textContent = "No editors added yet.";
    sharedEditorList.append(empty);
    return;
  }

  for (const email of list.editorEmails) {
    sharedEditorList.append(createEditorRow(email, list));
  }
}

shareListForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  const list = selectedList();
  const email = normalizeEmail(shareEditorEmail.value);

  if (!user || !list) {
    setStatus("Choose a list first.", true);
    return;
  }
  if (list.ownerUid !== user.uid) {
    setStatus("Only the list owner can add editors.", true);
    return;
  }
  if (!email || !shareEditorEmail.validity.valid) {
    setStatus("Enter a valid email address.", true);
    return;
  }
  if (email === normalizeEmail(user.email)) {
    setStatus("You already own this list; you do not need editor access.", true);
    return;
  }
  if (list.editorEmails.includes(email)) {
    setStatus("That email already has editor access.", true);
    return;
  }

  const button = shareListForm.querySelector("button[type='submit']");
  button.disabled = true;
  setStatus("Adding editor…");

  try {
    await updateDoc(doc(db, "lists", list.id), { editorEmails: arrayUnion(email) });
    updateSelectedEditorData([...list.editorEmails, email]);
    shareListForm.reset();
    setStatus(`Editor added for ${email}. Access becomes active when that person signs in with that email and verifies it.`);
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
