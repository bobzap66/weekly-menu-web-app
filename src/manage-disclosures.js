function makeCollapsible(section, detailsId, noteText) {
  if (!section || section.querySelector(":scope > details.admin-card-details")) return null;

  const heading = section.querySelector(":scope > .admin-section-heading");
  if (!heading) return null;

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const note = document.createElement("span");

  details.id = detailsId;
  details.className = "admin-card-details";
  summary.className = "admin-section-heading collapsible-heading";
  note.className = "disclosure-note";
  note.textContent = noteText;

  while (heading.firstChild) summary.append(heading.firstChild);
  summary.append(note);
  heading.remove();

  details.append(summary);
  while (section.firstChild) details.append(section.firstChild);
  section.append(details);
  section.classList.add("collapsible-card");

  return details;
}

const sharingDetails = makeCollapsible(
  document.querySelector("#sharing-card"),
  "sharing-details",
  "Invite or manage household editors",
);

const mealForm = document.querySelector("#meal-form");
const mealEditorDetails = makeCollapsible(
  mealForm?.closest("section[data-list-required]"),
  "meal-editor-details",
  "Add a meal or edit an existing one",
);

const mealCatalog = document.querySelector("#meal-catalog");
if (mealCatalog && mealEditorDetails) {
  mealCatalog.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button");
      if (button?.textContent.trim() === "Edit") {
        mealEditorDetails.open = true;
      }
    },
    true,
  );
}

// Expose the elements only for lightweight debugging in the browser console.
window.weeklyMenuDisclosures = {
  sharing: sharingDetails,
  mealEditor: mealEditorDetails,
};
