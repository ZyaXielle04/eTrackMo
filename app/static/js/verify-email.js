import {
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

const firebaseApp = initializeApp(window.firebaseConfig);

const auth = getAuth(firebaseApp);

const continueButton = document.getElementById("continue-button");

const resendButton = document.getElementById("resend-button");

const message = document.getElementById("verify-email-message");

const errorMessage = document.getElementById("verify-email-error");

let currentUser = null;

function showMessage(text) {
  message.textContent = text;

  message.hidden = false;
}

function showError(text) {
  errorMessage.textContent = text;

  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.textContent = "";

  errorMessage.hidden = true;
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  button.disabled = isLoading;

  button.textContent = isLoading ? loadingText : defaultText;
}

onAuthStateChanged(auth, function (user) {
  currentUser = user;

  if (!user) {
    showMessage("Please sign in to verify your email address.");

    return;
  }

  if (user.emailVerified) {
    window.location.href = "/dashboard";
  }
});

continueButton.addEventListener("click", async function () {
  clearError();

  const user = currentUser || auth.currentUser;

  if (!user) {
    window.location.href = "/login";

    return;
  }

  setButtonLoading(
    continueButton,
    true,
    "Checking...",
    "I've verified my email",
  );

  try {
    await user.reload();

    currentUser = auth.currentUser;

    if (currentUser.emailVerified) {
      window.location.href = "/dashboard";

      return;
    }

    showError("Your email is not verified yet. Please open the link first.");
  } finally {
    setButtonLoading(
      continueButton,
      false,
      "Checking...",
      "I've verified my email",
    );
  }
});

resendButton.addEventListener("click", async function () {
  clearError();

  const user = currentUser || auth.currentUser;

  if (!user) {
    window.location.href = "/login";

    return;
  }

  setButtonLoading(
    resendButton,
    true,
    "Sending...",
    "Resend verification email",
  );

  try {
    await sendEmailVerification(user);

    showMessage("A new verification email has been sent.");
  } catch (error) {
    if (error.code === "auth/too-many-requests") {
      showError("Too many requests. Please wait before trying again.");
    } else {
      showError("Unable to resend the verification email right now.");
    }
  } finally {
    setButtonLoading(
      resendButton,
      false,
      "Sending...",
      "Resend verification email",
    );
  }
});
