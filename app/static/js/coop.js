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

let currentUser = null;
let coops = [];

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
    pill.className = permissions[key] ? "enabled" : "disabled";
    pill.textContent = permissions[key] ? label : `No ${label}`;
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
      renderCoops();
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
        await loadCoops();
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

  header.append(titleWrap, role);

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

  const permissions = document.createElement("div");
  permissions.className = "coop-section";
  const permissionsTitle = document.createElement("strong");
  permissionsTitle.textContent = "Your sharing permissions";
  permissions.append(permissionsTitle, createPermissionToggles(coop));

  const members = document.createElement("div");
  members.className = "coop-section";
  const memberTitle = document.createElement("strong");
  memberTitle.textContent = "Members";
  const memberList = document.createElement("div");
  memberList.className = "coop-member-list";

  (coop.members || []).forEach(function (member) {
    const row = document.createElement("div");
    row.className = "coop-member-row";
    const avatar = document.createElement("span");
    const body = document.createElement("div");
    const name = document.createElement("strong");
    const role = document.createElement("small");

    avatar.textContent = member.displayName.slice(0, 2).toUpperCase();
    name.textContent = member.displayName;
    role.textContent = member.role;
    body.append(name, role);
    row.append(avatar, body);
    row.append(renderPermissionPills(member.permissions));
    memberList.append(row);
  });
  members.append(memberTitle, memberList);

  card.append(header, stats, permissions, members);

  if (coop.role === "owner") {
    const requests = document.createElement("div");
    requests.className = "coop-section";
    const requestTitle = document.createElement("strong");
    requestTitle.textContent = "Pending requests";
    const requestList = document.createElement("div");
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

    requests.append(requestTitle, requestList);
    card.append(requests);
  }

  return card;
}

async function loadCoopDetails(coop) {
  const data = await apiRequest(`/api/coops/${coop.id}`);

  return data.coop;
}

async function renderCoops() {
  coopsList.replaceChildren();
  coopsEmpty.hidden = coops.length > 0;

  const detailedCoops = await Promise.all(coops.map(loadCoopDetails));

  detailedCoops.forEach(function (coop) {
    coopsList.append(renderCoopCard(coop));
  });
}

async function loadCoops() {
  setLoading(true);
  clearError(coopsError);

  try {
    const data = await apiRequest("/api/coops");
    coops = data.coops || [];
    await renderCoops();
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
