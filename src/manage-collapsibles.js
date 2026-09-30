const mealEditorDetails = document.querySelector("#meal-editor-details");
const mealCatalog = document.querySelector("#meal-catalog");

if (mealEditorDetails && mealCatalog) {
  mealCatalog.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button");
      if (!button || !button.closest(".admin-meal-actions")) return;
      if (button.textContent.trim() !== "Edit") return;

      mealEditorDetails.open = true;
    },
    { capture: true },
  );
}
