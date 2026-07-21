import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(window.firebaseConfig);

const auth = getAuth(firebaseApp);

const csrfToken = document
  .querySelector('meta[name="csrf-token"]')
  ?.getAttribute("content");

const accountModal = document.getElementById("account-modal");
const openAccountModalButton = document.getElementById("open-account-modal");
const closeAccountModalButton = document.getElementById("close-account-modal");
const cancelAccountButton = document.getElementById("cancel-account-button");
const accountForm = document.getElementById("account-form");
const accountFormError = document.getElementById("account-form-error");
const accountModalTitle = document.getElementById("account-modal-title");
const accountIdInput = document.getElementById("account-id");
const accountNameInput = document.getElementById("account-name");
const accountTypeInput = document.getElementById("account-type");
const accountInstitutionInput = document.getElementById("account-institution");
const accountBalanceInput = document.getElementById("account-balance");
const accountNotesInput = document.getElementById("account-notes");
const saveAccountButton = document.getElementById("save-account-button");
const deleteAccountButton = document.getElementById("delete-account-button");
const accountsList = document.getElementById("accounts-list");
const accountsLoading = document.getElementById("accounts-loading");
const accountsError = document.getElementById("accounts-error");
const accountsEmpty = document.getElementById("accounts-empty");
const accountsTotalBalance = document.getElementById("accounts-total-balance");
const accountsTotalLabel = document.getElementById("accounts-total-label");
const accountsCount = document.getElementById("accounts-count");
const largestAccount = document.getElementById("largest-account");
const largestAccountBalance = document.getElementById("largest-account-balance");

let currentUser = null;
let accounts = [];

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

function formatMoney(balance) {
  return pesoFormatter.format(Number(balance || 0));
}

function getTypeLabel(type) {
  const labels = {
    bank: "Bank",
    cash: "Cash",
    custom: "Custom",
    gcash: "GCash",
    maya: "Maya",
  };

  return labels[type] || "Custom";
}

function setLoading(isLoading) {
  accountsLoading.hidden = !isLoading;
}

function showPageError(message) {
  accountsError.textContent = message;
  accountsError.hidden = false;
}

function clearPageError() {
  accountsError.textContent = "";
  accountsError.hidden = true;
}

function showFormError(message) {
  accountFormError.textContent = message;
  accountFormError.hidden = false;
}

function clearFormError() {
  accountFormError.textContent = "";
  accountFormError.hidden = true;
}

async function getIdToken() {
  if (!currentUser) {
    throw new Error("missing-user");
  }

  return currentUser.getIdToken();
}

async function apiRequest(path, options = {}) {
  const idToken = await getIdToken();
  const headers = {
    Authorization: `Bearer ${idToken}`,
    Accept: "application/json",
    ...options.headers,
  };

  if (options.method && options.method !== "GET") {
    headers["X-CSRFToken"] = csrfToken;
  }

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers,
  });

  const data = await response.json().catch(function () {
    return {};
  });

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function resetForm() {
  accountForm.reset();
  accountIdInput.value = "";
  accountTypeInput.value = "cash";
  accountBalanceInput.value = "";
  deleteAccountButton.hidden = true;
  accountModalTitle.textContent = "Add account";
  saveAccountButton.textContent = "Save account";
  clearFormError();
}

function openModal(account = null) {
  resetForm();

  if (account) {
    accountIdInput.value = account.id;
    accountNameInput.value = account.name;
    accountTypeInput.value = account.type;
    accountInstitutionInput.value = account.institution || "";
    accountBalanceInput.value = Number(account.balance || 0).toFixed(2);
    accountNotesInput.value = account.notes || "";
    deleteAccountButton.hidden = false;
    accountModalTitle.textContent = "Edit account";
    saveAccountButton.textContent = "Save changes";
  }

  accountModal.hidden = false;
  accountNameInput.focus();
}

function closeModal() {
  accountModal.hidden = true;
  resetForm();
}

function renderSummary() {
  const totalBalance = accounts.reduce(function (sum, account) {
    return sum + Number(account.balance || 0);
  }, 0);

  const largest = accounts.reduce(function (currentLargest, account) {
    if (!currentLargest || account.balance > currentLargest.balance) {
      return account;
    }

    return currentLargest;
  }, null);

  accountsTotalBalance.textContent = formatMoney(totalBalance);
  accountsTotalLabel.textContent = `Across ${accounts.length} account${
    accounts.length === 1 ? "" : "s"
  }`;
  accountsCount.textContent = String(accounts.length);
  largestAccount.textContent = largest ? largest.name : "None";
  largestAccountBalance.textContent = largest
    ? formatMoney(largest.balance)
    : formatMoney(0);
}

function createAccountCard(account) {
  const card = document.createElement("article");
  card.className = "account-card";

  const icon = document.createElement("span");
  icon.className = "account-card-icon";
  icon.textContent = account.name.slice(0, 1).toUpperCase();

  const content = document.createElement("div");
  content.className = "account-card-content";

  const heading = document.createElement("div");
  heading.className = "account-card-heading";

  const titleWrap = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = account.name;

  const meta = document.createElement("small");
  meta.textContent = [
    getTypeLabel(account.type),
    account.institution,
  ].filter(Boolean).join(" · ");

  titleWrap.append(name, meta);

  const balance = document.createElement("b");
  balance.textContent = formatMoney(account.balance);

  heading.append(titleWrap, balance);

  const footer = document.createElement("div");
  footer.className = "account-card-footer";

  const notes = document.createElement("span");
  notes.textContent = account.notes || "No notes";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "secondary-action";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", function () {
    openModal(account);
  });

  footer.append(notes, editButton);
  content.append(heading, footer);
  card.append(icon, content);

  return card;
}

function renderAccounts() {
  accountsList.replaceChildren();
  accountsEmpty.hidden = accounts.length > 0;

  accounts.forEach(function (account) {
    accountsList.append(createAccountCard(account));
  });

  renderSummary();
}

async function loadAccounts() {
  setLoading(true);
  clearPageError();

  try {
    const data = await apiRequest("/api/accounts");
    accounts = data.accounts || [];
    renderAccounts();
  } catch (error) {
    showPageError(error.message || "Unable to load accounts.");
  } finally {
    setLoading(false);
  }
}

function getFormPayload() {
  return {
    balance: accountBalanceInput.value,
    institution: accountInstitutionInput.value,
    name: accountNameInput.value,
    notes: accountNotesInput.value,
    type: accountTypeInput.value,
  };
}

accountForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearFormError();

  const accountId = accountIdInput.value;
  const isEditing = Boolean(accountId);

  saveAccountButton.disabled = true;
  saveAccountButton.textContent = isEditing ? "Saving..." : "Creating...";

  try {
    const payload = getFormPayload();
    const data = await apiRequest(
      isEditing ? `/api/accounts/${accountId}` : "/api/accounts",
      {
        body: JSON.stringify(payload),
        method: isEditing ? "PATCH" : "POST",
      },
    );

    const savedAccount = data.account;
    const existingIndex = accounts.findIndex(function (account) {
      return account.id === savedAccount.id;
    });

    if (existingIndex >= 0) {
      accounts[existingIndex] = savedAccount;
    } else {
      accounts.push(savedAccount);
    }

    renderAccounts();
    closeModal();
  } catch (error) {
    showFormError(error.message || "Unable to save account.");
  } finally {
    saveAccountButton.disabled = false;
    saveAccountButton.textContent = isEditing ? "Save changes" : "Save account";
  }
});

deleteAccountButton.addEventListener("click", async function () {
  const accountId = accountIdInput.value;

  if (!accountId) {
    return;
  }

  deleteAccountButton.disabled = true;
  deleteAccountButton.textContent = "Deleting...";

  try {
    await apiRequest(`/api/accounts/${accountId}`, {
      method: "DELETE",
    });

    accounts = accounts.filter(function (account) {
      return account.id !== accountId;
    });

    renderAccounts();
    closeModal();
  } catch (error) {
    showFormError(error.message || "Unable to delete account.");
  } finally {
    deleteAccountButton.disabled = false;
    deleteAccountButton.textContent = "Delete";
  }
});

openAccountModalButton.addEventListener("click", function () {
  openModal();
});

document.querySelectorAll("[data-open-account-modal]").forEach(function (button) {
  button.addEventListener("click", function () {
    openModal();
  });
});

closeAccountModalButton.addEventListener("click", closeModal);
cancelAccountButton.addEventListener("click", closeModal);

accountModal.addEventListener("click", function (event) {
  if (event.target === accountModal) {
    closeModal();
  }
});

window.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !accountModal.hidden) {
    closeModal();
  }
});

onAuthStateChanged(auth, async function (user) {
  if (!user) {
    return;
  }

  await user.reload();

  if (!auth.currentUser.emailVerified) {
    return;
  }

  currentUser = auth.currentUser;

  loadAccounts();
});
