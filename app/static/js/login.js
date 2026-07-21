import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

const csrfToken = document
    .querySelector('meta[name="csrf-token"]')
    ?.getAttribute("content");

const firebaseApp = initializeApp(window.firebaseConfig);

const auth = getAuth(firebaseApp);

const loginForm = document.getElementById("login-form");

const loginError = document.getElementById("login-error");

const rememberMeCheckbox = document.getElementById("remember-me");

const submitButton = loginForm.querySelector("button[type='submit']");

function showError(message) {
  loginError.textContent = message;

  loginError.hidden = false;
}

function clearError() {
  loginError.textContent = "";

  loginError.hidden = true;
}

function setLoadingState(isLoading) {
  submitButton.disabled = isLoading;

  submitButton.textContent = isLoading ? "Signing in..." : "Sign In";
}

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  clearError();

  const email = document.getElementById("email").value.trim();

  const password = document.getElementById("password").value;

  const rememberMe = rememberMeCheckbox.checked;

  if (!email || !password) {
    showError("Please enter your email and password.");

    return;
  }

  setLoadingState(true);

  try {
    const persistence = rememberMe
      ? browserLocalPersistence
      : browserSessionPersistence;

    await setPersistence(auth, persistence);

    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );

    if (!userCredential.user.emailVerified) {
      window.location.href = "/verify-email";

      return;
    }

    window.location.href = "/dashboard";
  } catch (error) {
    let message = "Unable to sign in. Please try again.";

    if (error.code === "auth/invalid-credential") {
      message = "Invalid email or password.";
    }

    if (error.code === "auth/user-not-found") {
      message = "Invalid email or password.";
    }

    if (error.code === "auth/wrong-password") {
      message = "Invalid email or password.";
    }

    if (error.code === "auth/too-many-requests") {
      message = "Too many failed attempts. Please try again later.";
    }

    showError(message);
  } finally {
    setLoadingState(false);
  }
});
