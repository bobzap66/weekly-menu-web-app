import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

export const CLOUD_PLANNER_SCHEMA_VERSION = 1;

function plannerDoc(listId) {
  if (typeof listId !== "string" || listId.length === 0) {
    throw new Error("Cloud planner sync requires an active list ID.");
  }

  return doc(db, "lists", listId, "planner", "current");
}

export function canUseCloudPlanner() {
  return Boolean(auth.currentUser);
}

export async function loadCloudPlanner(listId) {
  if (!auth.currentUser) return null;

  const snapshot = await getDoc(plannerDoc(listId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveCloudPlanner(listId, { state, history, nothingNew }) {
  const user = auth.currentUser;
  if (!user) return;

  await setDoc(plannerDoc(listId), {
    schemaVersion: CLOUD_PLANNER_SCHEMA_VERSION,
    state,
    history,
    nothingNew: Boolean(nothingNew),
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
  });
}

export function subscribeCloudPlanner(listId, onChange, onError = console.error) {
  if (!auth.currentUser) return () => {};

  return onSnapshot(
    plannerDoc(listId),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) return;
      onChange(snapshot.data(), snapshot.metadata);
    },
    onError,
  );
}
