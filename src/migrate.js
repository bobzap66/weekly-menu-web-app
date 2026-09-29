import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

const previewButton = document.querySelector("#migration-preview-button");
const applyButton = document.querySelector("#migration-apply-button");
const migrationStatus = document.querySelector("#migration-status");
const migrationReport = document.querySelector("#migration-report");

let lastPreview = null;

function setStatus(message, isError = false) {
  migrationStatus.textContent = message;
  migrationStatus.classList.toggle("is-error", isError);
}

function duplicateStableIds(records) {
  const byStableId = new Map();

  for (const record of records) {
    const stableId = typeof record.stableId === "string" ? record.stableId.trim() : "";
    if (!stableId) continue;
    if (!byStableId.has(stableId)) byStableId.set(stableId, []);
    byStableId.get(stableId).push(record.id);
  }

  return [...byStableId.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([stableId, ids]) => ({ stableId, ids }));
}

async function scanStableIds() {
  if (!auth.currentUser) {
    throw new Error("Sign in before running a migration preview.");
  }

  const snapshot = await getDocs(collection(db, "meals"));
  const records = snapshot.docs.map((mealDoc) => ({
    id: mealDoc.id,
    ...mealDoc.data(),
  }));

  const missing = records.filter((record) => {
    const stableId = typeof record.stableId === "string" ? record.stableId.trim() : "";
    return !stableId;
  });
  const conflicts = records.filter((record) => {
    const stableId = typeof record.stableId === "string" ? record.stableId.trim() : "";
    return stableId && stableId !== record.id;
  });
  const duplicates = duplicateStableIds(records);
  const correct = records.filter((record) => record.stableId === record.id);

  return {
    total: records.length,
    correct,
    missing,
    conflicts,
    duplicates,
  };
}

function appendReportLine(label, value, className = "") {
  const item = document.createElement("li");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  item.append(strong, document.createTextNode(String(value)));
  if (className) item.className = className;
  migrationReport.append(item);
}

function renderPreview(preview) {
  migrationReport.replaceChildren();
  appendReportLine("Meal documents scanned", preview.total);
  appendReportLine("Already using document ID as stableId", preview.correct.length);
  appendReportLine("Missing stableId and safe to update", preview.missing.length);
  appendReportLine("Conflicting stableId values", preview.conflicts.length, preview.conflicts.length ? "migration-warning" : "");
  appendReportLine("Duplicate stableId values", preview.duplicates.length, preview.duplicates.length ? "migration-warning" : "");

  if (preview.conflicts.length > 0) {
    const details = document.createElement("li");
    details.className = "migration-detail migration-warning";
    details.textContent = `Conflicts: ${preview.conflicts.map((record) => `${record.id} → ${record.stableId}`).join(", ")}`;
    migrationReport.append(details);
  }

  if (preview.duplicates.length > 0) {
    const details = document.createElement("li");
    details.className = "migration-detail migration-warning";
    details.textContent = `Duplicates: ${preview.duplicates.map((entry) => `${entry.stableId} (${entry.ids.join(", ")})`).join("; ")}`;
    migrationReport.append(details);
  }

  const safe = preview.conflicts.length === 0 && preview.duplicates.length === 0;
  applyButton.hidden = !(safe && preview.missing.length > 0);
  applyButton.disabled = !safe || preview.missing.length === 0;

  if (!safe) {
    setStatus("Preview found identity conflicts. Nothing has been changed, and Apply is disabled.", true);
  } else if (preview.missing.length === 0) {
    setStatus("All meals already have stable IDs. No migration write is needed.");
  } else {
    setStatus(`Preview complete. Applying will add stableId to ${preview.missing.length} meal documents and will not rename, move, or delete anything.`);
  }
}

async function previewMigration() {
  previewButton.disabled = true;
  applyButton.hidden = true;
  setStatus("Scanning meal documents…");
  migrationReport.replaceChildren();

  try {
    lastPreview = await scanStableIds();
    renderPreview(lastPreview);
  } catch (error) {
    console.error(error);
    lastPreview = null;
    setStatus(error.message || "Could not scan the meal collection.", true);
  } finally {
    previewButton.disabled = false;
  }
}

async function applyMigration() {
  if (!lastPreview || lastPreview.missing.length === 0) return;

  applyButton.disabled = true;
  previewButton.disabled = true;
  setStatus("Rechecking the live data before writing…");

  try {
    const current = await scanStableIds();
    if (current.conflicts.length > 0 || current.duplicates.length > 0) {
      lastPreview = current;
      renderPreview(current);
      setStatus("The live data now contains an identity conflict. Nothing was changed.", true);
      return;
    }

    const expectedIds = [...lastPreview.missing.map((record) => record.id)].sort();
    const currentIds = [...current.missing.map((record) => record.id)].sort();
    if (expectedIds.join("\n") !== currentIds.join("\n")) {
      lastPreview = current;
      renderPreview(current);
      setStatus("The meal collection changed after the preview. Review the refreshed preview before applying.", true);
      return;
    }

    if (!window.confirm(`Add stable IDs to ${current.missing.length} meal documents? This only adds a stableId field equal to each document's existing Firestore ID.`)) {
      setStatus("Migration cancelled. Nothing was changed.");
      return;
    }

    setStatus(`Writing stable IDs to ${current.missing.length} meals…`);

    const chunkSize = 400;
    for (let start = 0; start < current.missing.length; start += chunkSize) {
      const batch = writeBatch(db);
      for (const meal of current.missing.slice(start, start + chunkSize)) {
        batch.update(doc(db, "meals", meal.id), { stableId: meal.id });
      }
      await batch.commit();
    }

    lastPreview = await scanStableIds();
    renderPreview(lastPreview);
    setStatus(`Migration complete. ${current.missing.length} meal documents received stable IDs.`);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "The migration could not be completed.", true);
  } finally {
    previewButton.disabled = false;
    if (lastPreview) {
      const safe = lastPreview.conflicts.length === 0 && lastPreview.duplicates.length === 0;
      applyButton.disabled = !safe || lastPreview.missing.length === 0;
    }
  }
}

previewButton.addEventListener("click", previewMigration);
applyButton.addEventListener("click", applyMigration);
