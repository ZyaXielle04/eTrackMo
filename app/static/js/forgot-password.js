import {
  getAuth,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

const firebaseApp = initializeApp(window.firebaseConfig);

const auth = getAuth(firebaseApp);

const forgotPasswordForm = document.getElementById("forgot-password-form");

const message = document.getElementById("forgot-password-message");

const errorMessage = document.getElementById("forgot-password-error");

const submitButton = forgotPasswordForm.querySelector("button[type='submit']");

function showMessage(text) {
  message.textContent = text;

  message.hidden = false;
}

function clearMessage() {
  message.textContent = "";

  message.hidden = true;
}

function showError(text) {
  errorMessage.textContent = text;

  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.textContent = "";

  errorMessage.hidden = true;
}

function setLoadingState(isLoading) {
  submitButton.disabled = isLoading;

  submitButton.textContent = isLoading ? "Sending..." : "Send reset link";
}

forgotPasswordForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  clearMessage();

  clearError();

  const email = document.getElementById("email").value.trim();

  if (!email) {
    showError("Please enter your email address.");

    return;
  }

  setLoadingState(true);

  try {
    await sendPasswordResetEmail(auth, email);

    showMessage(
      "If an account exists for this email address, we've sent a password reset link.",
    );

    forgotPasswordForm.reset();
  } catch (error) {
    /*
     * Intentionally show the same message for both
     * registered and unregistered email addresses.
     *
     * This prevents account enumeration.
     */

    if (error.code === "auth/invalid-email") {
      showError("Please enter a valid email address.");
    } else {
      showMessage(
        "If an account exists for this email address, we've sent a password reset link.",
      );
    }
  } finally {
    setLoadingState(false);
  }
});
