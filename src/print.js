const printButton = document.querySelector("#print-button");
const menuList = document.querySelector("#menu-list");

function syncPrintButton() {
  printButton.hidden = !menuList.classList.contains("week-schedule-list");
}

printButton.addEventListener("click", () => {
  window.print();
});

new MutationObserver(syncPrintButton).observe(menuList, {
  attributes: true,
  attributeFilter: ["class"],
});

syncPrintButton();
