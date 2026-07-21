import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseApp = initializeApp(window.firebaseConfig);

const auth = getAuth(firebaseApp);

const csrfToken = document
  .querySelector('meta[name="csrf-token"]')
  .getAttribute("content");

const registerForm = document.getElementById("register-form");

const registerError = document.getElementById("register-error");

const submitButton = registerForm.querySelector("button[type='submit']");

const passwordInput = document.getElementById("password");

const confirmPasswordInput = document.getElementById("confirm-password");

const termsInput = document.getElementById("terms");

function normalizeDisplayName(displayName) {
  return displayName.replace(/\s+/g, " ").trim();
}

function showError(message) {
  registerError.textContent = message;

  registerError.hidden = false;
}

function clearError() {
  registerError.textContent = "";

  registerError.hidden = true;
}

function setLoadingState(isLoading) {
  submitButton.disabled = isLoading;

  submitButton.textContent = isLoading
    ? "Creating account..."
    : "Create Account";
}

function validatePassword(password) {
  const hasMinimumLength = password.length >= 8;

  const hasMaximumLength = password.length <= 32;

  const hasUppercase = /[A-Z]/.test(password);

  const hasLowercase = /[a-z]/.test(password);

  const hasNumber = /[0-9]/.test(password);

  return (
    hasMinimumLength &&
    hasMaximumLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumber
  );
}

async function createBackendProfile(user, displayName) {
  const idToken = await user.getIdToken(true);
  const response = await fetch("/api/auth/register-profile", {
    body: JSON.stringify({
      displayName: displayName,
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
    },
    method: "POST",
  });

  const data = await response.json().catch(function () {
    return {};
  });

  if (!response.ok) {
    throw new Error(data.error || "Unable to save your profile.");
  }
}

const passwordToggleButtons = document.querySelectorAll(".password-toggle");

passwordToggleButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    const targetId = button.dataset.passwordTarget;

    const targetInput = document.getElementById(targetId);

    const isPasswordHidden = targetInput.type === "password";

    targetInput.type = isPasswordHidden ? "text" : "password";

    button.textContent = isPasswordHidden ? "Hide" : "Show";

    button.setAttribute(
      "aria-label",
      isPasswordHidden ? "Hide password" : "Show password",
    );
  });
});

registerForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  clearError();

  const displayName = normalizeDisplayName(
    document.getElementById("display-name").value,
  );

  const email = document.getElementById("email").value.trim();

  const password = passwordInput.value;

  const confirmPassword = confirmPasswordInput.value;

  if (!displayName || !email || !password || !confirmPassword) {
    showError("Please complete all required fields.");

    return;
  }

  if (displayName.length < 2 || displayName.length > 80) {
    showError("Please enter a valid full name.");

    return;
  }

  if (!validatePassword(password)) {
    showError(
      "Password must be 8–32 characters and include uppercase, lowercase, and numeric characters.",
    );

    return;
  }

  if (password !== confirmPassword) {
    showError("Passwords do not match.");

    return;
  }

  if (!termsInput.checked) {
    showError("Please agree to the Terms of Service and Privacy Policy.");

    return;
  }

  setLoadingState(true);

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );

    const user = userCredential.user;

    await updateProfile(user, {
      displayName: displayName,
    });

    await sendEmailVerification(user);

    await createBackendProfile(user, displayName);

    window.location.href = "/verify-email";
  } catch (error) {
    let message = "Unable to create your account. Please try again.";

    if (error.code === "auth/email-already-in-use") {
      message =
        "Unable to create your account. Please sign in or use another email address.";
    }

    if (error.code === "auth/invalid-email") {
      message = "Please enter a valid email address.";
    }

    if (error.code === "auth/weak-password") {
      message = "Your password does not meet the security requirements.";
    }

    if (error.code === "PERMISSION_DENIED") {
      message =
        "Your account was created, but your profile could not be saved. Please contact support.";
    }

    showError(message);
  } finally {
    setLoadingState(false);
  }
});
