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
const transactionRecipient = document.getElementById("transaction-recipient");
const transactionRecipientLabel = document.getElementById(
  "transaction-recipient-label",
);
const transactionAmount = document.getElementById("transaction-amount");
const transactionDate = document.getElementById("transaction-date");
const transactionTime = document.getElementById("transaction-time");
const transactionFee = document.getElementById("transaction-fee");
const transactionFeeLabel = document.getElementById("transaction-fee-label");
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

const categoryOptions = {
  expense: [
    ["food", "Food"],
    ["transportation", "Transportation"],
    ["bills", "Bills"],
    ["shopping", "Shopping"],
    ["health", "Health"],
    ["education", "Education"],
    ["entertainment", "Entertainment"],
    ["family", "Family"],
    ["debt", "Debt"],
    ["other_expense", "Other expense"],
  ],
  income: [
    ["salary", "Salary"],
    ["business", "Business"],
    ["freelance", "Freelance"],
    ["allowance", "Allowance"],
    ["refund", "Refund"],
    ["bonus", "Bonus"],
    ["other_income", "Other income"],
  ],
  transfer: [
    ["savings", "Savings"],
    ["cash_in", "Cash in"],
    ["cash_out", "Cash out"],
    ["account_transfer", "Account transfer"],
    ["other_transfer", "Other transfer"],
  ],
  external_transfer: [
    ["family", "Family"],
    ["remittance", "Remittance"],
    ["payment", "Payment"],
    ["debt", "Debt"],
    ["donation", "Donation"],
    ["other_send", "Other send"],
  ],
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
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

function isNormalText(value, minLength, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const pattern = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/_:+#-]*$/;

  return (
    text.length >= minLength &&
    text.length <= maxLength &&
    pattern.test(text)
  );
}

function isValidMoney(value, options = {}) {
  const number = Number(value);
  const minimum = options.minimum ?? 0.01;
  const maximum = options.maximum ?? 999999999.99;

  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    return false;
  }

  return /^\d+(\.\d{1,2})?$/.test(String(value).trim());
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function isFutureDateTime(dateValue, timeValue) {
  const selected = new Date(`${dateValue}T${timeValue}`);

  return Number.isNaN(selected.getTime()) || selected > new Date();
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

function renderCategoryOptions(kind) {
  const options = [
    ["", "Choose category"],
    ...(categoryOptions[kind] || []),
  ].map(function ([value, label]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;

    return option;
  });

  transactionCategory.replaceChildren(...options);
}

function getCategoryLabel(kind, category) {
  return (
    (categoryOptions[kind] || []).find(function ([value]) {
      return value === category;
    })?.[1] || category
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
      transaction.recipient,
      getCategoryLabel(transaction.kind, transaction.category),
      transaction.occurredAt,
      transaction.feeCents ? `Fee ${formatMoney(transaction.fee)}` : "",
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
  const isExternalTransfer = kind === "external_transfer";

  transactionToAccountLabel.hidden = !isTransfer;
  transactionToAccount.required = isTransfer;
  transactionRecipientLabel.hidden = !isExternalTransfer;
  transactionRecipient.required = isExternalTransfer;
  transactionFeeLabel.hidden = !(isTransfer || isExternalTransfer);

  if (!isTransfer) {
    transactionToAccount.value = "";
  }

  if (!isExternalTransfer) {
    transactionRecipient.value = "";
  }

  if (!isTransfer && !isExternalTransfer) {
    transactionFee.value = "";
  }

  renderCategoryOptions(kind);

  if (kind === "income") {
    transactionDescription.placeholder = "Salary, sale, refund";
  } else if (kind === "transfer") {
    transactionDescription.placeholder = "Move money to another account";
  } else if (kind === "external_transfer") {
    transactionDescription.placeholder = "Send money outside eTrackMo";
  } else {
    transactionDescription.placeholder = "Groceries, rent, bills";
  }
}

function validateLocalForm() {
  const kind = getSelectedKind();

  if (!accounts.length) {
    return "Create an account before recording transactions.";
  }

  if (!transactionAccount.value) {
    return "Please choose an account.";
  }

  if (kind === "transfer") {
    if (!transactionToAccount.value) {
      return "Please choose a destination account.";
    }

    if (transactionToAccount.value === transactionAccount.value) {
      return "Choose a different destination account.";
    }
  }

  if (
    kind === "external_transfer" &&
    !isNormalText(transactionRecipient.value, 2, 80)
  ) {
    return "Use normal letters, numbers, and punctuation for the recipient.";
  }

  if (!isValidMoney(transactionAmount.value)) {
    return "Please enter a valid amount.";
  }

  if (
    transactionFee.value &&
    !isValidMoney(transactionFee.value, {
      maximum: 100000,
      minimum: 0,
    })
  ) {
    return "Please enter a valid transaction fee.";
  }

  if (
    (kind === "income" || kind === "expense") &&
    Number(transactionFee.value || 0) > 0
  ) {
    return "Transaction fees are only available for transfers.";
  }

  if (!isNormalText(transactionDescription.value, 2, 120)) {
    return "Use normal letters, numbers, and punctuation for the description.";
  }

  if (!transactionCategory.value) {
    return "Please choose a category.";
  }

  if (!transactionDate.value || transactionDate.value > today()) {
    return "Please choose a date that is not in the future.";
  }

  if (!isValidTime(transactionTime.value)) {
    return "Please choose a valid time.";
  }

  if (isFutureDateTime(transactionDate.value, transactionTime.value)) {
    return "Please choose a date and time that are not in the future.";
  }

  return "";
}

function getPayload() {
  return {
    accountId: transactionAccount.value,
    amount: transactionAmount.value,
    category: transactionCategory.value,
    description: transactionDescription.value,
    fee: transactionFee.value,
    kind: getSelectedKind(),
    occurredAt: transactionDate.value,
    occurredTime: transactionTime.value,
    recipient: transactionRecipient.value,
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
    transactionTime.value = currentTime();
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
  transactionTime.value = currentTime();
  updateKindUi();
  loadData();
});
