import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { auth, db } from "./firebase.js";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "./list-config.js";

const previewButton = document.querySelector("#list-migration-preview-button");
const applyButton = document.querySelector("#list-migration-apply-button");
const status = document.querySelector("#list-migration-status");
const report = document.querySelector("#list-migration-report");

let lastPreviewFingerprint = null;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalized(item)]),
    );
  }
  return value;
}

function sameData(a, b) {
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}

function snapshotMap(snapshot) {
  return new Map(snapshot.docs.map((item) => [item.id, item.data()]));
}

function compareCollections(source, target) {
  const matching = [];
  const missing = [];
  const conflicting = [];

  for (const [id, data] of source) {
    if (!target.has(id)) {
      missing.push(id);
      continue;
    }

    if (sameData(data, target.get(id))) matching.push(id);
    else conflicting.push(id);
  }

  const targetOnly = [...target.keys()].filter((id) => !source.has(id));
  return { matching, missing, conflicting, targetOnly };
}

function buildFingerprint(scan) {
  return JSON.stringify({
    listExists: scan.listExists,
    listOwnerUid: scan.listOwnerUid,
    categories: [...scan.sourceCategories.entries()].map(([id, data]) => [id, normalized(data)]),
    meals: [...scan.sourceMeals.entries()].map(([id, data]) => [id, normalized(data)]),
    targetCategories: [...scan.targetCategories.entries()].map(([id, data]) => [id, normalized(data)]),
    targetMeals: [...scan.targetMeals.entries()].map(([id, data]) => [id, normalized(data)]),
  });
}

async function scanMigration() {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in before previewing the migration.");

  const listRef = doc(db, "lists", DEFAULT_LIST_ID);
  const [listSnapshot, sourceCategorySnapshot, sourceMealSnapshot, targetCategorySnapshot, targetMealSnapshot] =
    await Promise.all([
      getDoc(listRef),
      getDocs(collection(db, "categories")),
      getDocs(collection(db, "meals")),
      getDocs(collection(db, "lists", DEFAULT_LIST_ID, "categories")),
      getDocs(collection(db, "lists", DEFAULT_LIST_ID, "meals")),
    ]);

  const sourceCategories = snapshotMap(sourceCategorySnapshot);
  const sourceMeals = snapshotMap(sourceMealSnapshot);
  const targetCategories = snapshotMap(targetCategorySnapshot);
  const targetMeals = snapshotMap(targetMealSnapshot);
  const categoryComparison = compareCollections(sourceCategories, targetCategories);
  const mealComparison = compareCollections(sourceMeals, targetMeals);
  const invalidStableIds = [...sourceMeals.entries()]
    .filter(([id, data]) => data.stableId !== id)
    .map(([id]) => id);
  const listData = listSnapshot.exists() ? listSnapshot.data() : null;
  const listOwnerUid = typeof listData?.ownerUid === "string" ? listData.ownerUid : null;
  const listOwnerConflict = listSnapshot.exists() && listOwnerUid !== user.uid;
  const safe =
    !listOwnerConflict &&
    invalidStableIds.length === 0 &&
    categoryComparison.conflicting.length === 0 &&
    mealComparison.conflicting.length === 0 &&
    categoryComparison.targetOnly.length === 0 &&
    mealComparison.targetOnly.length === 0;

  const scan = {
    user,
    listRef,
    listExists: listSnapshot.exists(),
    listOwnerUid,
    listOwnerConflict,
    sourceCategories,
    sourceMeals,
    targetCategories,
    targetMeals,
    categoryComparison,
    mealComparison,
    invalidStableIds,
    safe,
  };

  scan.fingerprint = buildFingerprint(scan);
  return scan;
}

function addReportLine(text, warning = false) {
  const item = document.createElement("li");
  item.textContent = text;
  if (warning) item.className = "migration-warning";
  report.append(item);
}

function renderScan(scan) {
  report.replaceChildren();
  addReportLine(`Target list: ${DEFAULT_LIST_NAME} (${DEFAULT_LIST_ID})`);
  addReportLine(`Legacy categories scanned: ${scan.sourceCategories.size}`);
  addReportLine(`Legacy meals scanned: ${scan.sourceMeals.size}`);
  addReportLine(`Categories already copied exactly: ${scan.categoryComparison.matching.length}`);
  addReportLine(`Categories safe to copy: ${scan.categoryComparison.missing.length}`);
  addReportLine(`Meals already copied exactly: ${scan.mealComparison.matching.length}`);
  addReportLine(`Meals safe to copy: ${scan.mealComparison.missing.length}`);
  addReportLine(`Meals with invalid stableId: ${scan.invalidStableIds.length}`, scan.invalidStableIds.length > 0);
  addReportLine(
    `Conflicting target category documents: ${scan.categoryComparison.conflicting.length}`,
    scan.categoryComparison.conflicting.length > 0,
  );
  addReportLine(
    `Conflicting target meal documents: ${scan.mealComparison.conflicting.length}`,
    scan.mealComparison.conflicting.length > 0,
  );
  addReportLine(
    `Unexpected target-only documents: ${scan.categoryComparison.targetOnly.length + scan.mealComparison.targetOnly.length}`,
    scan.categoryComparison.targetOnly.length + scan.mealComparison.targetOnly.length > 0,
  );
  addReportLine(`List ownership conflict: ${scan.listOwnerConflict ? "yes" : "no"}`, scan.listOwnerConflict);

  const writesNeeded =
    (scan.listExists ? 0 : 1) +
    scan.categoryComparison.missing.length +
    scan.mealComparison.missing.length;

  if (!scan.safe) {
    addReportLine("Migration is blocked until the conflicts above are resolved.", true);
    applyButton.hidden = true;
    setStatus("Preview found a conflict. Nothing has been written.", true);
    return;
  }

  if (writesNeeded === 0) {
    applyButton.hidden = true;
    setStatus("The list copy is already complete. No migration write is needed.");
    return;
  }

  applyButton.hidden = false;
  setStatus(`Preview complete. Applying will create/copy ${writesNeeded} documents without deleting the legacy catalog.`);
}

async function previewMigration() {
  previewButton.disabled = true;
  applyButton.hidden = true;
  setStatus("Scanning legacy and list collections…");

  try {
    const scan = await scanMigration();
    lastPreviewFingerprint = scan.fingerprint;
    renderScan(scan);
  } catch (error) {
    console.error(error);
    lastPreviewFingerprint = null;
    report.replaceChildren();
    const permissionHint = error?.code === "permission-denied"
      ? " Publish the updated Firestore rules first, then try again."
      : "";
    setStatus(`Could not preview the list migration.${permissionHint}`, true);
  } finally {
    previewButton.disabled = false;
  }
}

async function applyMigration() {
  if (!lastPreviewFingerprint) {
    setStatus("Run Preview migration immediately before applying.", true);
    return;
  }

  previewButton.disabled = true;
  applyButton.disabled = true;
  setStatus("Rechecking the live database before writing…");

  try {
    const scan = await scanMigration();
    if (!scan.safe) {
      throw new Error("The live database is no longer safe to migrate. Run Preview again.");
    }
    if (scan.fingerprint !== lastPreviewFingerprint) {
      throw new Error("The database changed after the preview. Run Preview again before applying.");
    }

    if (!scan.listExists) {
      await setDoc(scan.listRef, {
        name: DEFAULT_LIST_NAME,
        ownerUid: scan.user.uid,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
      });
    }

    const batch = writeBatch(db);
    let writes = 0;

    for (const id of scan.categoryComparison.missing) {
      batch.set(doc(db, "lists", DEFAULT_LIST_ID, "categories", id), scan.sourceCategories.get(id));
      writes += 1;
    }

    for (const id of scan.mealComparison.missing) {
      batch.set(doc(db, "lists", DEFAULT_LIST_ID, "meals", id), scan.sourceMeals.get(id));
      writes += 1;
    }

    if (writes > 0) await batch.commit();

    lastPreviewFingerprint = null;
    const verification = await scanMigration();
    renderScan(verification);

    if (
      verification.safe &&
      verification.categoryComparison.missing.length === 0 &&
      verification.mealComparison.missing.length === 0
    ) {
      setStatus(
        `List migration complete: ${verification.sourceCategories.size} categories and ${verification.sourceMeals.size} meals are copied under lists/${DEFAULT_LIST_ID}. The legacy collections are still untouched.`,
      );
    } else {
      setStatus("The write completed, but verification is not clean. Do not switch the app yet.", true);
    }
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Could not apply the list migration.", true);
  } finally {
    previewButton.disabled = false;
    applyButton.disabled = false;
  }
}

previewButton.addEventListener("click", previewMigration);
applyButton.addEventListener("click", applyMigration);

onAuthStateChanged(auth, (user) => {
  lastPreviewFingerprint = null;
  report.replaceChildren();
  applyButton.hidden = true;
  previewButton.disabled = !user;
  setStatus(user ? "Preview the migration before applying it." : "Sign in to prepare the list migration.");
});
