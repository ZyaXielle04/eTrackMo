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

const historySearch = document.getElementById("history-search");
const historyKind = document.getElementById("history-kind");
const historyAccount = document.getElementById("history-account");
const historyFrom = document.getElementById("history-from");
const historyTo = document.getElementById("history-to");
const historyFilters = document.getElementById("history-filters");
const historyLoading = document.getElementById("history-loading");
const historyError = document.getElementById("history-error");
const historyEmpty = document.getElementById("history-empty");
const historyList = document.getElementById("history-list");
const historyNetTotal = document.getElementById("history-net-total");
const historyNetLabel = document.getElementById("history-net-label");
const historyIncomeTotal = document.getElementById("history-income-total");
const historyOutflowTotal = document.getElementById("history-outflow-total");

let currentUser = null;
let accounts = [];
let transactions = [];

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

const categoryLabels = {
  account_transfer: "Account transfer",
  allowance: "Allowance",
  bills: "Bills",
  bonus: "Bonus",
  business: "Business",
  cash_in: "Cash in",
  cash_out: "Cash out",
  debt: "Debt",
  donation: "Donation",
  education: "Education",
  entertainment: "Entertainment",
  family: "Family",
  food: "Food",
  freelance: "Freelance",
  health: "Health",
  other_expense: "Other expense",
  other_income: "Other income",
  other_send: "Other send",
  other_transfer: "Other transfer",
  payment: "Payment",
  refund: "Refund",
  remittance: "Remittance",
  salary: "Salary",
  savings: "Savings",
  shopping: "Shopping",
  transportation: "Transportation",
};

const kindLabels = {
  expense: "Expense",
  external_transfer: "Send",
  income: "Income",
  transfer: "Transfer",
};

function formatMoney(amount) {
  return pesoFormatter.format(Number(amount || 0));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDateTime(transaction) {
  const occurredAt = transaction.occurredAt || "";

  if (occurredAt.includes("T")) {
    const [datePart, timePart] = occurredAt.split("T");

    return `${datePart} ${timePart}`;
  }

  return occurredAt || "No date";
}

function setLoading(isLoading) {
  historyLoading.hidden = !isLoading;
}

function showError(message) {
  historyError.textContent = message;
  historyError.hidden = false;
}

function clearError() {
  historyError.textContent = "";
  historyError.hidden = true;
}

async function getIdToken() {
  if (!currentUser) {
    throw new Error("missing-user");
  }

  return currentUser.getIdToken();
}

async function apiRequest(path) {
  const idToken = await getIdToken();
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await response.json().catch(function () {
    return {};
  });

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function renderAccountFilter() {
  const options = [
    ["all", "All accounts"],
    ...accounts.map(function (account) {
      return [account.id, account.name];
    }),
  ].map(function ([value, label]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;

    return option;
  });

  historyAccount.replaceChildren(...options);
}

function matchesFilters(transaction) {
  const searchTerm = normalizeText(historySearch.value);
  const selectedKind = historyKind.value;
  const selectedAccount = historyAccount.value;
  const fromDate = historyFrom.value;
  const toDate = historyTo.value;
  const transactionDate = transaction.occurredDate ||
    String(transaction.occurredAt || "").slice(0, 10);

  if (selectedKind !== "all" && transaction.kind !== selectedKind) {
    return false;
  }

  if (selectedAccount !== "all" && transaction.accountId !== selectedAccount) {
    return false;
  }

  if (fromDate && transactionDate < fromDate) {
    return false;
  }

  if (toDate && transactionDate > toDate) {
    return false;
  }

  if (!searchTerm) {
    return true;
  }

  return [
    transaction.description,
    transaction.accountName,
    transaction.recipient,
    categoryLabels[transaction.category] || transaction.category,
    kindLabels[transaction.kind] || transaction.kind,
  ].some(function (value) {
    return normalizeText(value).includes(searchTerm);
  });
}

function getFilteredTransactions() {
  return transactions.filter(matchesFilters);
}

function renderSummary(filteredTransactions) {
  const incomeCents = filteredTransactions.reduce(function (total, transaction) {
    return total + Math.max(0, Number(transaction.amountCents || 0));
  }, 0);
  const outflowCents = filteredTransactions.reduce(function (total, transaction) {
    const amountCents = Number(transaction.amountCents || 0);
    const feeCents = Number(transaction.feeCents || 0);

    return total + Math.abs(Math.min(0, amountCents)) + feeCents;
  }, 0);
  const netCents = incomeCents - outflowCents;

  historyIncomeTotal.textContent = formatMoney(incomeCents / 100);
  historyOutflowTotal.textContent = formatMoney(outflowCents / 100);
  historyNetTotal.textContent = formatMoney(netCents / 100);
  historyNetLabel.textContent = `Across ${filteredTransactions.length} transaction${
    filteredTransactions.length === 1 ? "" : "s"
  }`;
}

function createHistoryItem(transaction) {
  const item = document.createElement("article");
  item.className = "history-item";

  const marker = document.createElement("span");
  marker.className = `transaction-marker ${transaction.kind}`;
  marker.textContent = (kindLabels[transaction.kind] || "T").slice(0, 1);

  const body = document.createElement("div");
  body.className = "history-item-body";

  const title = document.createElement("strong");
  title.textContent = transaction.description || "Transaction";

  const meta = document.createElement("small");
  meta.textContent = [
    kindLabels[transaction.kind] || transaction.kind,
    transaction.accountName,
    transaction.recipient,
    categoryLabels[transaction.category] || transaction.category,
    formatDateTime(transaction),
    transaction.feeCents ? `Fee ${formatMoney(transaction.fee)}` : "",
  ].filter(Boolean).join(" - ");

  body.append(title, meta);

  const amount = document.createElement("b");
  amount.className = transaction.amountCents >= 0 ? "positive" : "negative";
  amount.textContent = formatMoney(transaction.amount);

  item.append(marker, body, amount);

  return item;
}

function renderHistory() {
  const filteredTransactions = getFilteredTransactions();

  historyList.replaceChildren();
  historyEmpty.hidden = filteredTransactions.length > 0;

  filteredTransactions.forEach(function (transaction) {
    historyList.append(createHistoryItem(transaction));
  });

  renderSummary(filteredTransactions);
}

async function loadHistory() {
  setLoading(true);
  clearError();

  try {
    const [accountsData, transactionsData] = await Promise.all([
      apiRequest("/api/accounts"),
      apiRequest("/api/transactions"),
    ]);

    accounts = accountsData.accounts || [];
    transactions = transactionsData.transactions || [];

    renderAccountFilter();
    renderHistory();
  } catch (error) {
    showError(error.message || "Unable to load transaction history.");
  } finally {
    setLoading(false);
  }
}

[
  historySearch,
  historyKind,
  historyAccount,
  historyFrom,
  historyTo,
].forEach(function (input) {
  input.addEventListener("input", renderHistory);
  input.addEventListener("change", renderHistory);
});

historyFilters.addEventListener("reset", function () {
  window.setTimeout(renderHistory, 0);
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
  loadHistory();
});
