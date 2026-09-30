import {
  createUserWithEmailAndPassword,
  getIdToken,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { auth } from "./firebase.js";

const loginHeading = document.querySelector("#login-heading");
const loginForm = document.querySelector("#login-form");
const loginEmail = document.querySelector("#login-email");
const signupForm = document.querySelector("#signup-form");
const signupEmail = document.querySelector("#signup-email");
const signupPassword = document.querySelector("#signup-password");
const signupPasswordConfirm = document.querySelector("#signup-password-confirm");
const resetForm = document.querySelector("#reset-form");
const resetEmail = document.querySelector("#reset-email");
const showLoginButton = document.querySelector("#show-login-button");
const showSignupButton = document.querySelector("#show-signup-button");
const showResetButton = document.querySelector("#show-reset-button");
const cancelResetButton = document.querySelector("#cancel-reset-button");
const loginStatus = document.querySelector("#login-status");
const accountVerificationLabel = document.querySelector("#account-verification-label");
const verificationPanel = document.querySelector("#email-verification-panel");
const resendVerificationButton = document.querySelector("#resend-verification-button");
const refreshVerificationButton = document.querySelector("#refresh-verification-button");
const verificationStatus = document.querySelector("#verification-status");

function setStatus(message, isError = false) {
  loginStatus.textContent = message;
  loginStatus.classList.toggle("is-error", isError);
}

function setVerificationStatus(message, isError = false) {
  if (!verificationStatus) return;
  verificationStatus.textContent = message;
  verificationStatus.classList.toggle("is-error", isError);
}

function setMode(mode, { clearStatus = true } = {}) {
  const signingIn = mode === "signin";
  const signingUp = mode === "signup";
  const resetting = mode === "reset";

  loginForm.hidden = !signingIn;
  signupForm.hidden = !signingUp;
  resetForm.hidden = !resetting;
  showLoginButton.setAttribute("aria-pressed", String(signingIn));
  showSignupButton.setAttribute("aria-pressed", String(signingUp));

  if (signingUp) loginHeading.textContent = "Create account";
  else if (resetting) loginHeading.textContent = "Reset password";
  else loginHeading.textContent = "Sign in";

  if (clearStatus) setStatus("");
}

function signupErrorMessage(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "An account already exists for that email. Sign in instead, or reset the password.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "That password does not meet the account password requirements.";
    case "auth/operation-not-allowed":
      return "Account creation is not enabled for this site.";
    case "auth/too-many-requests":
      return "Too many attempts were made. Wait a little while and try again.";
    default:
      return "Could not create the account. Try again.";
  }
}

function renderVerification(user) {
  if (!accountVerificationLabel || !verificationPanel) return;

  if (!user) {
    accountVerificationLabel.textContent = "";
    verificationPanel.hidden = true;
    setVerificationStatus("");
    return;
  }

  accountVerificationLabel.textContent = user.emailVerified ? "Verified" : "Not verified";
  verificationPanel.hidden = user.emailVerified;

  if (!user.emailVerified && !verificationStatus.textContent) {
    setVerificationStatus("Verify this email before another household can share a meal list with it.");
  }
}

async function sendVerification(user) {
  await sendEmailVerification(user);
  setVerificationStatus(`Verification email sent to ${user.email}. Open the link in that message, then return here and click “I've verified”.`);
}

showLoginButton.addEventListener("click", () => setMode("signin"));
showSignupButton.addEventListener("click", () => setMode("signup"));

showResetButton.addEventListener("click", () => {
  resetEmail.value = loginEmail.value.trim();
  setMode("reset");
  resetEmail.focus();
});

cancelResetButton.addEventListener("click", () => {
  if (resetEmail.value.trim()) loginEmail.value = resetEmail.value.trim();
  setMode("signin");
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = signupEmail.value.trim();
  const password = signupPassword.value;
  const confirmation = signupPasswordConfirm.value;

  if (password !== confirmation) {
    setStatus("The two passwords do not match.", true);
    signupPasswordConfirm.focus();
    return;
  }

  setStatus("Creating account…");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    signupForm.reset();
    setStatus("Account created. You are signed in.");
    try {
      await sendVerification(credential.user);
    } catch (verificationError) {
      console.error(verificationError);
      setVerificationStatus("The account was created, but the verification email could not be sent. Use Resend verification email below.", true);
    }
  } catch (error) {
    console.error(error);
    setStatus(signupErrorMessage(error), true);
  }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = resetEmail.value.trim();
  if (!email) {
    setStatus("Enter the email address for the account.", true);
    return;
  }

  setStatus("Sending password-reset email…");
  try {
    await sendPasswordResetEmail(auth, email);
    loginEmail.value = email;
    setMode("signin", { clearStatus: false });
    setStatus("If an account exists for that email, a password-reset message has been sent.");
  } catch (error) {
    console.error(error);
    if (error?.code === "auth/invalid-email") {
      setStatus("Enter a valid email address.", true);
    } else if (error?.code === "auth/too-many-requests") {
      setStatus("Too many reset requests were made. Wait a little while and try again.", true);
    } else {
      setStatus("Could not send the password-reset email. Try again.", true);
    }
  }
});

resendVerificationButton?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user || user.emailVerified) return;

  resendVerificationButton.disabled = true;
  setVerificationStatus("Sending verification email…");
  try {
    await sendVerification(user);
  } catch (error) {
    console.error(error);
    setVerificationStatus(
      error?.code === "auth/too-many-requests"
        ? "Too many verification emails were requested. Wait a little while and try again."
        : "Could not send the verification email. Try again.",
      true,
    );
  } finally {
    resendVerificationButton.disabled = false;
  }
});

refreshVerificationButton?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  refreshVerificationButton.disabled = true;
  setVerificationStatus("Checking verification status…");
  try {
    await reload(user);
    const refreshedUser = auth.currentUser;
    if (!refreshedUser?.emailVerified) {
      setVerificationStatus("That email is not verified yet. Open the verification link from Firebase, then check again.", true);
      return;
    }

    await getIdToken(refreshedUser, true);
    renderVerification(refreshedUser);
    setVerificationStatus("Email verified. Reloading your shared lists…");
    window.location.reload();
  } catch (error) {
    console.error(error);
    setVerificationStatus("Could not refresh verification status. Try again.", true);
  } finally {
    refreshVerificationButton.disabled = false;
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) setMode("signin");
  renderVerification(user);
});

setMode("signin");
