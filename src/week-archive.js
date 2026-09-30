import {
  doc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import { buildWeekArchive, weekArchiveDocumentId } from "./week-archive-model.js?v=0.21.0";

export async function archiveScheduledWeek(listId, state) {
  const user = auth.currentUser;
  if (!user) return { archived: false, reason: "signed-out" };
  if (typeof listId !== "string" || listId.length === 0) {
    throw new Error("Archiving a week requires an active list ID.");
  }

  const archive = buildWeekArchive(state);
  if (!archive) {
    throw new Error("Only a scheduled week can be archived.");
  }

  const archiveId = weekArchiveDocumentId(state.createdAt);
  const archiveRef = doc(db, "lists", listId, "history", archiveId);
  let created = false;

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(archiveRef);
    if (existing.exists()) return;

    transaction.set(archiveRef, {
      ...archive,
      archivedAt: serverTimestamp(),
      archivedByUid: user.uid,
    });
    created = true;
  });

  return { archived: created, id: archiveId };
}
