const { initializeApp } = require("firebase-admin/app");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { Resend } = require("resend");

initializeApp();

const resendApiKey = defineSecret("RESEND_API_KEY");
const inviteFromEmail = defineSecret("INVITE_FROM_EMAIL");
const manageMealsUrl = "https://bobzap66.github.io/weekly-menu-web-app/manage.html";

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function editorEmails(data) {
  return Array.isArray(data?.editorEmails)
    ? data.editorEmails.map(normalizeEmail).filter(Boolean)
    : [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function subjectFor(listName) {
  return `You're invited to edit ${listName} on Weekly Menu`;
}

function textFor(email, listName) {
  return [
    "Hi,",
    "",
    `The owner of the meal list “${listName}” shared it with you on Weekly Menu.`,
    "",
    "To access the shared list:",
    `1. Open Weekly Menu Manage Meals: ${manageMealsUrl}`,
    `2. Sign in, or create an account, using ${email}.`,
    "3. If needed, verify that email using the verification message from Weekly Menu, then return to Manage Meals.",
    `4. Choose “${listName} (shared)” under Available lists.`,
    "",
    "You can edit categories and meals. Only the list owner can manage sharing or delete the list.",
    "",
    "If you weren't expecting this invitation, you can ignore this message.",
    "",
    "— Weekly Menu",
  ].join("\n");
}

function htmlFor(email, listName) {
  const safeEmail = escapeHtml(email);
  const safeListName = escapeHtml(listName);
  return [
    "<p>Hi,</p>",
    `<p>The owner of the meal list <strong>“${safeListName}”</strong> shared it with you on Weekly Menu.</p>`,
    "<p>To access the shared list:</p>",
    "<ol>",
    `<li><a href="${manageMealsUrl}">Open Weekly Menu Manage Meals</a>.</li>`,
    `<li>Sign in, or create an account, using <strong>${safeEmail}</strong>.</li>`,
    "<li>If needed, verify that email using the verification message from Weekly Menu, then return to Manage Meals.</li>",
    `<li>Choose <strong>“${safeListName} (shared)”</strong> under Available lists.</li>`,
    "</ol>",
    "<p>You can edit categories and meals. Only the list owner can manage sharing or delete the list.</p>",
    "<p>If you weren't expecting this invitation, you can ignore this message.</p>",
    "<p>— Weekly Menu</p>",
  ].join("");
}

exports.sendSharedListInvitations = onDocumentUpdated(
  {
    document: "lists/{listId}",
    region: "us-central1",
    secrets: [resendApiKey, inviteFromEmail],
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const previous = new Set(editorEmails(before));
    const added = editorEmails(after).filter((email) => !previous.has(email));
    if (added.length === 0) return;

    const listName = String(after.name ?? "Shared Meal List").trim() || "Shared Meal List";
    const resend = new Resend(resendApiKey.value());
    const from = inviteFromEmail.value();

    for (const email of added) {
      const { data, error } = await resend.emails.send({
        from,
        to: [email],
        subject: subjectFor(listName),
        text: textFor(email, listName),
        html: htmlFor(email, listName),
      });

      if (error) {
        logger.error("Shared-list invitation failed.", {
          listId: event.params.listId,
          recipient: email,
          error: error.message ?? String(error),
        });
        continue;
      }

      logger.info("Shared-list invitation sent.", {
        listId: event.params.listId,
        recipient: email,
        messageId: data?.id ?? null,
      });
    }
  },
);
