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

const transactionForm = document.getElementById("transaction-form");
const transactionKindInputs = document.querySelectorAll(
  "input[name='transaction-kind']",
);
const transactionAccount = document.getElementById("transaction-account");
const transactionToAccount = document.getElementById("transaction-to-account");
const transactionToAccountLabel = document.getElementById(
  "transaction-to-account-label",
);
const transactionAmount = document.getElementById("transaction-amount");
const transactionDate = document.getElementById("transaction-date");
const transactionDescription = document.getElementById(
  "transaction-description",
);
const transactionCategory = document.getElementById("transaction-category");
const transactionFormError = document.getElementById("transaction-form-error");
const saveTransactionButton = document.getElementById("save-transaction-button");
const transactionsLoading = document.getElementById("transactions-loading");
const transactionsError = document.getElementById("transactions-error");
const transactionsEmpty = document.getElementById("transactions-empty");
const transactionsList = document.getElementById("transactions-list");

let currentUser = null;
let accounts = [];
let transactions = [];

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getSelectedKind() {
  return (
    Array.from(transactionKindInputs).find(function (input) {
      return input.checked;
    })?.value || "expense"
  );
}

function formatMoney(amount) {
  return pesoFormatter.format(Number(amount || 0));
}

function setLoading(isLoading) {
  transactionsLoading.hidden = !isLoading;
}

function showFormError(message) {
  transactionFormError.textContent = message;
  transactionFormError.hidden = false;
}

function clearFormError() {
  transactionFormError.textContent = "";
  transactionFormError.hidden = true;
}

function showPageError(message) {
  transactionsError.textContent = message;
  transactionsError.hidden = false;
}

function clearPageError() {
  transactionsError.textContent = "";
  transactionsError.hidden = true;
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
    Accept: "application/json",
    Authorization: `Bearer ${idToken}`,
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

function renderAccountOptions() {
  const accountOptions = accounts.map(function (account) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.name} (${formatMoney(account.balance)})`;

    return option;
  });

  transactionAccount.replaceChildren(...accountOptions);
  transactionToAccount.replaceChildren(
    ...accountOptions.map(function (option) {
      return option.cloneNode(true);
    }),
  );
}

function renderTransactions() {
  transactionsList.replaceChildren();
  transactionsEmpty.hidden = transactions.length > 0;

  transactions.forEach(function (transaction) {
    const item = document.createElement("article");
    item.className = "transaction-item";

    const marker = document.createElement("span");
    marker.className = `transaction-marker ${transaction.kind}`;
    marker.textContent = transaction.kind.slice(0, 1).toUpperCase();

    const body = document.createElement("div");
    body.className = "transaction-item-body";

    const title = document.createElement("strong");
    title.textContent = transaction.description;

    const meta = document.createElement("small");
    meta.textContent = [
      transaction.accountName,
      transaction.category,
      transaction.occurredAt,
    ].filter(Boolean).join(" - ");

    body.append(title, meta);

    const amount = document.createElement("b");
    amount.className = transaction.amountCents >= 0 ? "positive" : "negative";
    amount.textContent = formatMoney(transaction.amount);

    item.append(marker, body, amount);
    transactionsList.append(item);
  });
}

function updateKindUi() {
  const kind = getSelectedKind();
  const isTransfer = kind === "transfer";

  transactionToAccountLabel.hidden = !isTransfer;
  transactionToAccount.required = isTransfer;

  if (kind === "income") {
    transactionDescription.placeholder = "Salary, sale, refund";
    transactionCategory.placeholder = "Salary, Income, Refund";
  } else if (kind === "transfer") {
    transactionDescription.placeholder = "Move money to another account";
    transactionCategory.placeholder = "Savings, Transfer";
  } else {
    transactionDescription.placeholder = "Groceries, rent, bills";
    transactionCategory.placeholder = "Food, Bills, Transport";
  }
}

function validateLocalForm() {
  if (!accounts.length) {
    return "Create an account before recording transactions.";
  }

  if (!transactionAccount.value) {
    return "Please choose an account.";
  }

  if (getSelectedKind() === "transfer") {
    if (!transactionToAccount.value) {
      return "Please choose a destination account.";
    }

    if (transactionToAccount.value === transactionAccount.value) {
      return "Choose a different destination account.";
    }
  }

  if (Number(transactionAmount.value) <= 0) {
    return "Please enter a valid amount.";
  }

  return "";
}

function getPayload() {
  return {
    accountId: transactionAccount.value,
    amount: transactionAmount.value,
    category: transactionCategory.value,
    description: transactionDescription.value,
    kind: getSelectedKind(),
    occurredAt: transactionDate.value,
    toAccountId: transactionToAccount.value,
  };
}

async function loadData() {
  setLoading(true);
  clearPageError();

  try {
    const [accountsData, transactionsData] = await Promise.all([
      apiRequest("/api/accounts"),
      apiRequest("/api/transactions"),
    ]);

    accounts = accountsData.accounts || [];
    transactions = transactionsData.transactions || [];

    renderAccountOptions();
    renderTransactions();
  } catch (error) {
    showPageError(error.message || "Unable to load transactions.");
  } finally {
    setLoading(false);
  }
}

transactionKindInputs.forEach(function (input) {
  input.addEventListener("change", updateKindUi);
});

transactionForm.addEventListener("reset", function () {
  window.setTimeout(function () {
    transactionDate.value = today();
    clearFormError();
    updateKindUi();
  }, 0);
});

transactionForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearFormError();

  const validationError = validateLocalForm();

  if (validationError) {
    showFormError(validationError);

    return;
  }

  saveTransactionButton.disabled = true;
  saveTransactionButton.textContent = "Recording...";

  try {
    await apiRequest("/api/transactions", {
      body: JSON.stringify(getPayload()),
      method: "POST",
    });

    transactionForm.reset();
    await loadData();
  } catch (error) {
    showFormError(error.message || "Unable to record transaction.");
  } finally {
    saveTransactionButton.disabled = false;
    saveTransactionButton.textContent = "Record transaction";
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
  transactionDate.value = today();
  updateKindUi();
  loadData();
});
