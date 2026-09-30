import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  arrayRemove,
  arrayUnion,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

const MANAGE_MEALS_URL = "https://bobzap66.github.io/weekly-menu-web-app/manage.html";

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

function invitationSubject(list) {
  return `You're invited to edit ${list.name} on Weekly Menu`;
}

function invitationBody(email, list) {
  const ownerEmail = normalizeEmail(auth.currentUser?.email);
  const ownerDescription = ownerEmail ? ownerEmail : "A Weekly Menu user";

  return [
    "Hi,",
    "",
    `${ownerDescription} shared the meal list “${list.name}” with you on Weekly Menu.`,
    "",
    "To access the shared list:",
    `1. Open Weekly Menu Manage Meals: ${MANAGE_MEALS_URL}`,
    `2. Sign in, or create an account, using ${email}.`,
    "3. If the account is not verified yet, use the verification email from Weekly Menu, then return to Manage Meals and click “I've verified.”",
    `4. Choose “${list.name} (shared)” under Available lists.`,
    "",
    "You can add and edit categories and meals on the shared list. Only the list owner can manage sharing or delete the list.",
    "",
    "If you weren't expecting this invitation, you can ignore this message.",
    "",
    "— Weekly Menu",
  ].join("\n");
}

function invitationText(email, list) {
  return `Subject: ${invitationSubject(list)}\n\n${invitationBody(email, list)}`;
}

function invitationMailto(email, list) {
  const subject = encodeURIComponent(invitationSubject(list));
  const body = encodeURIComponent(invitationBody(email, list));
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

async function copyInvitation(email, list, button) {
  const text = invitationText(email, list);

  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied";
    setStatus(`Invitation copied for ${email}.`);
    window.setTimeout(() => { button.textContent = original; }, 1500);
  } catch (error) {
    console.error(error);
    window.prompt("Copy this invitation:", text);
    setStatus(`Invitation ready to copy for ${email}.`);
  }
}

function createEditorRow(email, list) {
  const row = document.createElement("div");
  const code = document.createElement("code");
  const actions = document.createElement("div");
  const emailButton = document.createElement("button");
  const copyButton = document.createElement("button");
  const removeButton = document.createElement("button");

  row.className = "shared-editor-row";
  code.className = "shared-editor-uid";
  code.textContent = email;

  actions.className = "shared-editor-actions";

  emailButton.className = "action-button secondary-button compact-button";
  emailButton.type = "button";
  emailButton.textContent = "Open email";
  emailButton.addEventListener("click", () => {
    window.location.href = invitationMailto(email, list);
  });

  copyButton.className = "action-button secondary-button compact-button";
  copyButton.type = "button";
  copyButton.textContent = "Copy invite";
  copyButton.addEventListener("click", () => copyInvitation(email, list, copyButton));

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

  actions.append(emailButton, copyButton, removeButton);
  row.append(code, actions);
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
    setStatus(`Editor added for ${email}. Use Open email or Copy invite below to send the invitation instructions.`);
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
