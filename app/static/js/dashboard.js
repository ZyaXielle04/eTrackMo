import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getDatabase,
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const firebaseApp = initializeApp(window.firebaseConfig);

const auth = getAuth(firebaseApp);

const database = getDatabase(firebaseApp);

const authGate = document.getElementById("auth-gate");

const dashboardApp = document.getElementById("dashboard-app");

const userName = document.getElementById("user-name");

const userInitials = document.getElementById("user-initials");

const sidebarUserName = document.getElementById("sidebar-user-name");

const logoutButton = document.getElementById("logout-button");

const sidebar = document.getElementById("sidebar");

const sidebarToggle = document.getElementById("sidebar-toggle");

const sidebarClose = document.getElementById("sidebar-close");

const sidebarOverlay = document.getElementById("sidebar-overlay");

const sidebarLinks = document.querySelectorAll(".sidebar-nav a");

function getInitials(nameOrEmail) {
  const cleanValue = (nameOrEmail || "eTrackMo").trim();

  const parts = cleanValue
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "ET";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return parts.map((part) => part[0]).join("").toUpperCase();
}

function showDashboard() {
  authGate.hidden = true;

  dashboardApp.hidden = false;
}

function setSidebarOpen(isOpen) {
  dashboardApp.classList.toggle("sidebar-open", isOpen);

  sidebarToggle.setAttribute("aria-expanded", String(isOpen));

  sidebarOverlay.hidden = !isOpen;
}

function closeSidebar() {
  setSidebarOpen(false);
}

async function loadProfile(user) {
  let displayName = user.displayName || user.email || "there";

  try {
    const snapshot = await get(ref(database, `users/${user.uid}/profile`));

    if (snapshot.exists()) {
      const profile = snapshot.val();

      displayName = profile.displayName || displayName;
    }
  } catch (error) {
    displayName = user.displayName || user.email || "there";
  }

  if (userName) {
    userName.textContent = displayName.split(" ")[0] || "there";
  }

  userInitials.textContent = getInitials(displayName);

  sidebarUserName.textContent = displayName;
}

function applyFallbackProfile(user) {
  const displayName = user.displayName || user.email || "there";

  if (userName) {
    userName.textContent = displayName.split(" ")[0] || "there";
  }

  userInitials.textContent = getInitials(displayName);

  sidebarUserName.textContent = displayName;
}

onAuthStateChanged(auth, async function (user) {
  if (!user) {
    window.location.href = "/login";

    return;
  }

  await user.reload();

  if (!auth.currentUser.emailVerified) {
    window.location.href = "/verify-email";

    return;
  }

  applyFallbackProfile(auth.currentUser);

  showDashboard();

  loadProfile(auth.currentUser);
});

logoutButton.addEventListener("click", async function () {
  logoutButton.disabled = true;

  logoutButton.textContent = "Signing out...";

  try {
    await signOut(auth);

    window.location.href = "/login";
  } finally {
    logoutButton.disabled = false;

    logoutButton.textContent = "Sign out";
  }
});

sidebarToggle.addEventListener("click", function () {
  setSidebarOpen(!dashboardApp.classList.contains("sidebar-open"));
});

sidebarClose.addEventListener("click", closeSidebar);

sidebarOverlay.addEventListener("click", closeSidebar);

sidebarLinks.forEach(function (link) {
  link.addEventListener("click", closeSidebar);
});

window.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeSidebar();
  }
});

window.addEventListener("resize", function () {
  if (window.innerWidth > 980) {
    closeSidebar();
  }
});
