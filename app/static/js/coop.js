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

const createCoopForm = document.getElementById("create-coop-form");
const coopName = document.getElementById("coop-name");
const coopDescription = document.getElementById("coop-description");
const createCoopButton = document.getElementById("create-coop-button");
const createCoopError = document.getElementById("create-coop-error");
const joinCoopForm = document.getElementById("join-coop-form");
const coopInviteCode = document.getElementById("coop-invite-code");
const joinShareAccounts = document.getElementById("join-share-accounts");
const joinShareBalances = document.getElementById("join-share-balances");
const joinShareTransactions = document.getElementById("join-share-transactions");
const joinCoopButton = document.getElementById("join-coop-button");
const joinCoopError = document.getElementById("join-coop-error");
const joinCoopSuccess = document.getElementById("join-coop-success");
const coopsLoading = document.getElementById("coops-loading");
const coopsError = document.getElementById("coops-error");
const coopsEmpty = document.getElementById("coops-empty");
const coopsList = document.getElementById("coops-list");
const coopDirectoryView = document.getElementById("coop-directory-view");
const coopDetailView = document.getElementById("coop-detail-view");
const pageKicker = document.querySelector(".page-kicker");
const pageTitle = document.querySelector(".topbar h1");

let currentUser = null;
let coops = [];
let activeCoop = null;

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatMoney(amount) {
  return pesoFormatter.format(Number(amount || 0));
}

function getInitials(value) {
  return cleanText(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(function (part) {
      return part.charAt(0).toUpperCase();
    })
    .join("") || "M";
}

function getJoinPermissions() {
  return {
    shareAccounts: joinShareAccounts.checked,
    shareBalances: joinShareBalances.checked,
    shareTransactions: joinShareTransactions.checked,
  };
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearError(element) {
  element.textContent = "";
  element.hidden = true;
}

function showStatus(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearStatus(element) {
  element.textContent = "";
  element.hidden = true;
}

function setLoading(isLoading) {
  coopsLoading.hidden = !isLoading;
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

function renderPermissionPills(permissions) {
  const labels = [
    ["shareAccounts", "Accounts"],
    ["shareBalances", "Balances"],
    ["shareTransactions", "Transactions"],
  ];

  const wrap = document.createElement("div");
  wrap.className = "permission-pills";

  labels.forEach(function ([key, label]) {
    const pill = document.createElement("span");
    pill.className = permissions?.[key] ? "enabled" : "disabled";
    pill.textContent = permissions?.[key] ? label : `No ${label}`;
    wrap.append(pill);
  });

  return wrap;
}

function createPermissionToggles(coop) {
  const form = document.createElement("form");
  form.className = "permission-toggle-form";

  [
    ["shareAccounts", "Share account names"],
    ["shareBalances", "Share balances"],
    ["shareTransactions", "Share transactions"],
  ].forEach(function ([key, label]) {
    const field = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");

    input.type = "checkbox";
    input.checked = Boolean(coop.permissions?.[key]);
    input.dataset.permission = key;
    text.textContent = label;
    field.append(input, text);
    form.append(field);
  });

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "secondary-action";
  button.textContent = "Save permissions";
  form.append(button);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearError(coopsError);
    button.disabled = true;
    button.textContent = "Saving...";

    const permissions = {};

    form.querySelectorAll("input[data-permission]").forEach(function (input) {
      permissions[input.dataset.permission] = input.checked;
    });

    try {
      const data = await apiRequest(`/api/coops/${coop.id}/permissions`, {
        body: JSON.stringify({ permissions }),
        method: "PATCH",
      });

      coop.permissions = data.permissions;
      await openCoop(coop.id);
      await loadCoops({ preserveDetail: true });
    } catch (error) {
      showError(coopsError, error.message || "Unable to save permissions.");
    } finally {
      button.disabled = false;
      button.textContent = "Save permissions";
    }
  });

  return form;
}

function renderJoinRequest(coop, request) {
  const row = document.createElement("div");
  row.className = "coop-request-row";

  const body = document.createElement("div");
  const title = document.createElement("strong");
  const meta = document.createElement("small");

  title.textContent = request.displayName;
  meta.textContent = request.email || "No email";
  body.append(title, meta, renderPermissionPills(request.permissions));

  const actions = document.createElement("div");
  actions.className = "coop-request-actions";

  ["approve", "deny"].forEach(function (decision) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = decision === "approve" ? "primary-action" : "danger-action";
    button.textContent = decision === "approve" ? "Approve" : "Deny";
    button.addEventListener("click", async function () {
      button.disabled = true;

      try {
        await apiRequest(
          `/api/coops/${coop.id}/join-requests/${request.id}/${decision}`,
          { method: "POST" },
        );
        await openCoop(coop.id);
        await loadCoops({ preserveDetail: true });
      } catch (error) {
        showError(coopsError, error.message || "Unable to update request.");
      }
    });
    actions.append(button);
  });

  row.append(body, actions);

  return row;
}

function renderCoopCard(coop) {
  const card = document.createElement("article");
  card.className = "coop-card";

  const header = document.createElement("div");
  header.className = "coop-card-header";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  const description = document.createElement("p");

  title.textContent = coop.name;
  description.textContent = coop.description || "Private shared finance group.";
  titleWrap.append(title, description);

  const role = document.createElement("span");
  role.className = "coop-role";
  role.textContent = coop.role === "owner" ? "Owner" : "Member";

  const stats = document.createElement("div");
  stats.className = "coop-stats";

  [
    [String(coop.memberCount), "members"],
    [String(coop.pendingCount), "pending"],
    [coop.inviteCode, "invite code"],
  ].forEach(function ([value, label]) {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    const text = document.createTextNode(` ${label}`);

    strong.textContent = value;
    item.append(strong, text);
    stats.append(item);
  });

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "secondary-action coop-open-action";
  openButton.textContent = "Open Coop";
  openButton.addEventListener("click", function () {
    openCoop(coop.id);
  });

  header.append(titleWrap, stats, role, openButton);
  card.append(header);

  return card;
}

function renderCoopDetail(coop) {
  coopDetailView.replaceChildren();

  const shell = document.createElement("div");
  shell.className = "coop-detail-shell";

  const hero = document.createElement("section");
  hero.className = "panel coop-detail-hero";

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "secondary-action";
  backButton.textContent = "Back to all Coops";
  backButton.addEventListener("click", showDirectory);

  const heading = document.createElement("div");
  const kicker = document.createElement("span");
  const title = document.createElement("h2");
  const description = document.createElement("p");

  kicker.className = "page-kicker";
  kicker.textContent = coop.role === "owner" ? "Owner workspace" : "Member workspace";
  title.textContent = coop.name;
  description.textContent = coop.description || "Private shared finance group.";
  heading.append(kicker, title, description);

  const stats = document.createElement("div");
  stats.className = "coop-detail-stats";

  [
    [String(coop.memberCount), "Members"],
    [String(coop.pendingCount), "Pending requests"],
    [coop.inviteCode, "Invite code"],
  ].forEach(function ([value, label]) {
    const item = document.createElement("div");
    const strong = document.createElement("strong");
    const span = document.createElement("span");

    strong.textContent = value;
    span.textContent = label;
    item.append(strong, span);
    stats.append(item);
  });

  hero.append(backButton, heading, stats);
  shell.append(hero);

  const grid = document.createElement("section");
  grid.className = "coop-detail-grid";

  grid.append(renderSharedData(coop));
  grid.append(renderMembersPanel(coop));
  grid.append(renderPermissionsPanel(coop));

  if (coop.role === "owner") {
    grid.append(renderRequestsPanel(coop));
  }

  shell.append(grid);
  coopDetailView.append(shell);
}

function renderMembersPanel(coop) {
  const panel = document.createElement("article");
  panel.className = "panel coop-section";
  const title = document.createElement("strong");
  const memberList = document.createElement("div");

  title.textContent = "Members";
  memberList.className = "coop-member-list";

  (coop.members || []).forEach(function (member) {
    const row = document.createElement("div");
    row.className = "coop-member-row";
    const avatar = document.createElement("span");
    const body = document.createElement("div");
    const name = document.createElement("strong");
    const role = document.createElement("small");

    avatar.textContent = getInitials(member.displayName);
    name.textContent = member.displayName;
    role.textContent = member.role;
    body.append(name, role);
    row.append(avatar, body, renderPermissionPills(member.permissions));
    memberList.append(row);
  });

  panel.append(title, memberList);

  return panel;
}

function renderPermissionsPanel(coop) {
  const panel = document.createElement("article");
  panel.className = "panel coop-section";
  const title = document.createElement("strong");
  const description = document.createElement("small");

  title.textContent = "Your sharing permissions";
  description.textContent = "These controls decide what this Coop can see from your finance data.";
  panel.append(title, description, createPermissionToggles(coop));

  return panel;
}

function renderRequestsPanel(coop) {
  const panel = document.createElement("article");
  panel.className = "panel coop-section";
  const title = document.createElement("strong");
  const requestList = document.createElement("div");

  title.textContent = "Pending requests";
  requestList.className = "coop-request-list";

  if ((coop.joinRequests || []).length) {
    coop.joinRequests.forEach(function (request) {
      requestList.append(renderJoinRequest(coop, request));
    });
  } else {
    const empty = document.createElement("small");
    empty.textContent = "No pending requests.";
    requestList.append(empty);
  }

  panel.append(title, requestList);

  return panel;
}

function renderSharedData(coop) {
  const section = document.createElement("article");
  section.className = "panel coop-section coop-shared-section";
  const title = document.createElement("strong");
  const description = document.createElement("small");
  const list = document.createElement("div");

  title.textContent = "Shared finance data";
  description.textContent = "Only accounts, balances, and transactions allowed by each member are shown here.";
  list.className = "coop-shared-list";

  (coop.members || []).forEach(function (member) {
    const sharedData = coop.sharedData?.[member.uid] || {};
    list.append(renderSharedMemberData(member, sharedData));
  });

  section.append(title, description, list);

  return section;
}

function renderSharedMemberData(member, sharedData) {
  const card = document.createElement("article");
  card.className = "coop-shared-member";
  const heading = document.createElement("div");
  heading.className = "coop-shared-heading";
  const avatar = document.createElement("span");
  const body = document.createElement("div");
  const title = document.createElement("strong");
  const meta = document.createElement("small");

  avatar.className = "coop-shared-avatar";
  avatar.textContent = getInitials(member.displayName);
  title.textContent = member.displayName;
  meta.textContent = "Visible based on this member's permissions";
  body.append(title, meta, renderPermissionPills(member.permissions));
  heading.append(avatar, body);
  card.append(heading);

  if (member.permissions?.shareAccounts) {
    card.append(renderSharedAccounts(sharedData.accounts || [], member.permissions));
  } else {
    card.append(renderSharedEmpty("Accounts are not shared."));
  }

  if (member.permissions?.shareTransactions) {
    card.append(renderSharedTransactions(sharedData.transactions || []));
  } else {
    card.append(renderSharedEmpty("Transactions are not shared."));
  }

  return card;
}

function renderSharedAccounts(accounts, permissions) {
  const section = document.createElement("div");
  section.className = "coop-shared-block";
  const title = document.createElement("b");
  const list = document.createElement("div");

  title.textContent = "Accounts";
  list.className = "coop-shared-grid";

  if (!accounts.length) {
    list.append(renderSharedEmpty("No shared accounts yet."));
  }

  accounts.forEach(function (account) {
    const row = document.createElement("div");
    row.className = "coop-shared-row";
    const name = document.createElement("span");
    const detail = document.createElement("strong");

    name.textContent = account.name;
    detail.textContent = permissions.shareBalances
      ? formatMoney(account.balance)
      : "Balance hidden";
    row.append(name, detail);
    list.append(row);
  });

  section.append(title, list);

  return section;
}

function renderSharedTransactions(transactions) {
  const section = document.createElement("div");
  section.className = "coop-shared-block";
  const title = document.createElement("b");
  const list = document.createElement("div");

  title.textContent = "Transactions";
  list.className = "coop-shared-grid";

  if (!transactions.length) {
    list.append(renderSharedEmpty("No shared transactions yet."));
  }

  transactions.slice(0, 8).forEach(function (transaction) {
    const row = document.createElement("div");
    row.className = "coop-shared-row";
    const body = document.createElement("span");
    const amount = document.createElement("strong");

    body.textContent = [
      transaction.description,
      transaction.accountName,
      transaction.occurredAt,
    ].filter(Boolean).join(" - ");
    amount.textContent = formatMoney(transaction.amount);
    amount.className = transaction.amountCents >= 0 ? "positive" : "negative";
    row.append(body, amount);
    list.append(row);
  });

  section.append(title, list);

  return section;
}

function renderSharedEmpty(message) {
  const empty = document.createElement("small");
  empty.className = "coop-shared-empty";
  empty.textContent = message;

  return empty;
}

async function loadCoopDetails(coopId) {
  const data = await apiRequest(`/api/coops/${coopId}`);

  return data.coop;
}

async function openCoop(coopId) {
  clearError(coopsError);
  coopDetailView.replaceChildren();
  coopDetailView.append(renderSharedEmpty("Opening Coop workspace..."));
  coopDirectoryView.hidden = true;
  coopDetailView.hidden = false;

  try {
    activeCoop = await loadCoopDetails(coopId);
    renderCoopDetail(activeCoop);
    pageKicker.textContent = "Coop workspace";
    pageTitle.textContent = activeCoop.name;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showDirectory();
    showError(coopsError, error.message || "Unable to open Coop.");
  }
}

function showDirectory() {
  activeCoop = null;
  coopDetailView.hidden = true;
  coopDetailView.replaceChildren();
  coopDirectoryView.hidden = false;
  pageKicker.textContent = "Shared finance";
  pageTitle.textContent = "Coop";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCoops() {
  coopsList.replaceChildren();
  coopsEmpty.hidden = coops.length > 0;

  coops.forEach(function (coop) {
    coopsList.append(renderCoopCard(coop));
  });
}

async function loadCoops(options = {}) {
  setLoading(true);
  clearError(coopsError);

  try {
    const data = await apiRequest("/api/coops");
    coops = data.coops || [];
    renderCoops();

    if (!options.preserveDetail) {
      showDirectory();
    }
  } catch (error) {
    showError(coopsError, error.message || "Unable to load Coops.");
  } finally {
    setLoading(false);
  }
}

createCoopForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearError(createCoopError);

  const name = cleanText(coopName.value);

  if (name.length < 2 || name.length > 60) {
    showError(createCoopError, "Please enter a valid Coop name.");

    return;
  }

  createCoopButton.disabled = true;
  createCoopButton.textContent = "Creating...";

  try {
    await apiRequest("/api/coops", {
      body: JSON.stringify({
        description: coopDescription.value,
        name,
      }),
      method: "POST",
    });
    createCoopForm.reset();
    await loadCoops();
  } catch (error) {
    showError(createCoopError, error.message || "Unable to create Coop.");
  } finally {
    createCoopButton.disabled = false;
    createCoopButton.textContent = "Create Coop";
  }
});

joinCoopForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearError(joinCoopError);
  clearStatus(joinCoopSuccess);

  const inviteCode = cleanText(coopInviteCode.value).toUpperCase();

  if (inviteCode.length < 6 || inviteCode.length > 12) {
    showError(joinCoopError, "Please enter a valid invite code.");

    return;
  }

  joinCoopButton.disabled = true;
  joinCoopButton.textContent = "Requesting...";

  try {
    await apiRequest("/api/coops/join-requests", {
      body: JSON.stringify({
        inviteCode,
        permissions: getJoinPermissions(),
      }),
      method: "POST",
    });
    joinCoopForm.reset();
    showStatus(joinCoopSuccess, "Join request sent. The Coop owner can approve it.");
    await loadCoops();
  } catch (error) {
    showError(joinCoopError, error.message || "Unable to request access.");
  } finally {
    joinCoopButton.disabled = false;
    joinCoopButton.textContent = "Request to join";
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
  loadCoops();
});
