// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/practice.js
//
// The practice page: a signed-in practice's client list, each client's HMRC authorisation
// state, adding a client, inviting a client, and archiving a client. Every API error - a 400
// validation failure, the 403 a practice without the licence sees, or a 500 - is rendered as
// the API's own message text, never as raw HTML.

(function () {
  "use strict";

  const SERVICES = [
    { service: "MTD-VAT", field: "vrn", label: "VAT authorisation", fieldLabel: "VAT registration number" },
    { service: "MTD-IT", field: "nino", label: "ITSA authorisation", fieldLabel: "National Insurance number" },
  ];

  const STATUS_LABELS = {
    pending: "Pending",
    authorised: "Authorised",
    unauthorised: "Not authorised",
    cancelled: "Cancelled",
    rejected: "Rejected",
    expired: "Expired",
  };

  let __clients = [];

  function getIdToken() {
    try {
      return localStorage.getItem("cognitoIdToken");
    } catch {
      return null;
    }
  }

  function getHmrcAccessToken() {
    try {
      return sessionStorage.getItem("hmrcAccessToken");
    } catch {
      return null;
    }
  }

  // window.fetchWithIdToken and window.authorizedFetch are set by submit.js, a deferred module
  // that has not necessarily run yet the first time a page script needs to fetch. Falling back
  // to the plain fetch, with the same Authorization header added by hand, matches how every
  // other page here (e.g. web/public/operator/dashboard.html) tolerates that ordering.
  function cognitoFetcher() {
    return window.fetchWithIdToken || window.fetch;
  }

  function hmrcFetcher() {
    return window.authorizedFetch || window.fetch;
  }

  function notify(message, type) {
    if (typeof window.showStatus === "function") window.showStatus(message, type);
  }

  function cognitoFetch(url, init = {}) {
    const idToken = getIdToken();
    const headers = new Headers(init.headers || {});
    if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
    return cognitoFetcher()(url, { ...init, headers });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  async function readJsonSafely(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  // --- clients list ---

  async function fetchClients() {
    const idToken = getIdToken();
    const unauthHint = document.getElementById("unauthenticatedHint");
    const errorState = document.getElementById("clientsErrorState");
    const table = document.getElementById("clientsTable");
    const empty = document.getElementById("clientsEmptyState");

    if (!idToken) {
      unauthHint.style.display = "block";
      errorState.style.display = "none";
      table.style.display = "none";
      empty.style.display = "none";
      return;
    }
    unauthHint.style.display = "none";

    let response;
    try {
      response = await cognitoFetch("/api/v1/practice/clients", {});
    } catch (err) {
      errorState.textContent = `Failed to load clients: ${err?.message || err}`;
      errorState.style.display = "block";
      table.style.display = "none";
      empty.style.display = "none";
      return;
    }

    const body = await readJsonSafely(response);
    if (!response.ok) {
      errorState.textContent = body.message || `Failed to load clients (${response.status})`;
      errorState.style.display = "block";
      table.style.display = "none";
      empty.style.display = "none";
      return;
    }

    errorState.style.display = "none";
    __clients = Array.isArray(body.clients) ? body.clients : [];
    renderClientsTable();
  }

  function identifiersLine(client) {
    const parts = [];
    if (client.identifiers?.vrn) parts.push(`VRN ${client.identifiers.vrn}`);
    if (client.identifiers?.nino) parts.push(`NINO ${client.identifiers.nino}`);
    if (client.identifiers?.utr) parts.push(`UTR ${client.identifiers.utr}`);
    if (client.identifiers?.companyNumber) parts.push(`Company ${client.identifiers.companyNumber}`);
    return parts.length > 0 ? parts.join(", ") : "No identifiers on file";
  }

  function authCellHtml(client, def) {
    const identifier = client.identifiers?.[def.field];
    const clientId = client.clientId;

    if (!identifier) {
      return `<div class="auth-cell"><span style="color:#888">No ${escapeHtml(def.fieldLabel)} on file</span></div>`;
    }

    const auth = client.authorisations?.[def.service];
    const status = auth?.status;
    const statusLabel = status ? STATUS_LABELS[status] || status : "Not invited";
    const hasAccessToken = !!getHmrcAccessToken();

    const buttons = [];
    if (status === "pending") {
      buttons.push(
        `<button type="button" class="btn-small check-status-btn" data-client-id="${clientId}" data-service="${def.service}" ${hasAccessToken ? "" : "disabled"}>Check status</button>`,
      );
      buttons.push(
        `<button type="button" class="btn-small cancel-invite-btn" data-client-id="${clientId}" data-service="${def.service}" style="background-color:#dc3545" ${hasAccessToken ? "" : "disabled"}>Cancel invitation</button>`,
      );
    } else if (status === "authorised") {
      buttons.push(
        `<button type="button" class="btn-small check-status-btn" data-client-id="${clientId}" data-service="${def.service}" ${hasAccessToken ? "" : "disabled"}>Check status</button>`,
      );
    } else {
      buttons.push(
        `<button type="button" class="btn-small invite-toggle-btn" data-client-id="${clientId}" data-service="${def.service}" ${hasAccessToken ? "" : "disabled"}>Invite</button>`,
      );
    }

    const hint = hasAccessToken
      ? ""
      : `<p style="font-size:0.8em; color:#856404; margin:0.25em 0 0">Connect to HMRC to invite or check this client.</p>`;

    return `
      <div class="auth-cell" data-client-id="${clientId}" data-service="${def.service}">
        <div class="auth-status">${escapeHtml(statusLabel)}</div>
        <div class="auth-actions" style="margin-top:0.25em; display:flex; gap:0.4em; flex-wrap:wrap">${buttons.join("")}</div>
        ${hint}
        <div class="invite-panel" style="display:none; margin-top:0.5em">
          <input type="text" class="invite-known-fact" placeholder="Known fact (VAT registration date or postcode)" autocomplete="off" />
          <div style="margin-top:0.4em; display:flex; gap:0.4em">
            <button type="button" class="btn-small invite-send-btn" data-client-id="${clientId}" data-service="${def.service}">Send invite</button>
            <button type="button" class="btn-small invite-cancel-panel-btn" style="background-color:#6c757d">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  function clientRowHtml(client) {
    const name = escapeHtml(client.displayName || client.clientId);
    return `
      <tr data-client-row="${client.clientId}">
        <td>${name}</td>
        <td>${escapeHtml(identifiersLine(client))}</td>
        <td>${authCellHtml(client, SERVICES[0])}</td>
        <td>${authCellHtml(client, SERVICES[1])}</td>
        <td><button type="button" class="btn-small archive-client-btn" data-client-id="${client.clientId}" style="background-color:#dc3545">Archive</button></td>
      </tr>`;
  }

  function renderClientsTable() {
    const table = document.getElementById("clientsTable");
    const tbody = document.getElementById("clientsTableBody");
    const empty = document.getElementById("clientsEmptyState");

    if (__clients.length === 0) {
      table.style.display = "none";
      empty.style.display = "block";
      tbody.innerHTML = "";
      return;
    }

    empty.style.display = "none";
    table.style.display = "table";
    tbody.innerHTML = __clients.map(clientRowHtml).join("");
  }

  function updateClientLocally(updatedClient) {
    if (!updatedClient || !updatedClient.clientId) return;
    const index = __clients.findIndex((c) => c.clientId === updatedClient.clientId);
    if (index === -1) {
      __clients.push(updatedClient);
    } else {
      __clients[index] = updatedClient;
    }
  }

  // --- add client ---

  function readAddClientForm() {
    return {
      displayName: document.getElementById("displayNameInput").value.trim(),
      vrn: document.getElementById("vrnInput").value.trim() || undefined,
      nino: document.getElementById("ninoInput").value.trim() || undefined,
      utr: document.getElementById("utrInput").value.trim() || undefined,
      companyNumber: document.getElementById("companyNumberInput").value.trim() || undefined,
    };
  }

  async function handleAddClientSubmit(e) {
    e.preventDefault();
    const errorsEl = document.getElementById("addClientErrors");
    const submitBtn = document.getElementById("addClientBtn");
    errorsEl.style.display = "none";
    errorsEl.textContent = "";

    const idToken = getIdToken();
    if (!idToken) {
      notify("Please log in first to add a client.", "warning");
      return;
    }

    const fields = readAddClientForm();
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding...";

    try {
      const response = await cognitoFetch("/api/v1/practice/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const body = await readJsonSafely(response);

      if (!response.ok) {
        const messages = Array.isArray(body.error?.errorMessages) ? body.error.errorMessages : [body.message || "Failed to add client"];
        errorsEl.textContent = messages.join(" ");
        errorsEl.style.display = "block";
        return;
      }

      updateClientLocally(body.client);
      renderClientsTable();
      document.getElementById("addClientForm").reset();
      notify(`Client "${body.client.displayName}" added.`, "success");
    } catch (err) {
      errorsEl.textContent = `Failed to add client: ${err?.message || err}`;
      errorsEl.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add client";
    }
  }

  // --- archive ---

  async function archiveClient(clientId) {
    const idToken = getIdToken();
    if (!idToken) {
      notify("Please log in first.", "warning");
      return;
    }
    try {
      const response = await cognitoFetch(`/api/v1/practice/clients/${encodeURIComponent(clientId)}`, {
        method: "DELETE",
      });
      const body = await readJsonSafely(response);
      if (!response.ok) {
        notify(body.message || `Failed to archive client (${response.status})`, "error");
        return;
      }
      __clients = __clients.filter((c) => c.clientId !== clientId);
      renderClientsTable();
      notify("Client archived.", "success");
    } catch (err) {
      notify(`Failed to archive client: ${err?.message || err}`, "error");
    }
  }

  // --- invite ---

  function toggleInvitePanel(clientId, service, show) {
    const cell = document.querySelector(`.auth-cell[data-client-id="${clientId}"][data-service="${service}"]`);
    if (!cell) return;
    const panel = cell.querySelector(".invite-panel");
    if (panel) panel.style.display = show ? "block" : "none";
  }

  async function sendInvite(clientId, service) {
    const idToken = getIdToken();
    if (!idToken) {
      notify("Please log in first.", "warning");
      return;
    }

    const accessToken = getHmrcAccessToken();
    if (!accessToken) {
      notify("Connect to HMRC before sending an invitation.", "warning");
      return;
    }

    const cell = document.querySelector(`.auth-cell[data-client-id="${clientId}"][data-service="${service}"]`);
    const knownFact = cell?.querySelector(".invite-known-fact")?.value.trim();
    if (!knownFact) {
      notify("Enter the known fact (VAT registration date or postcode) before sending an invitation.", "warning");
      return;
    }

    const arn = document.getElementById("arnInput").value.trim() || undefined;

    try {
      const response = await cognitoFetch(`/api/v1/practice/clients/${encodeURIComponent(clientId)}/authorisation/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, knownFact, accessToken, arn }),
      });
      const body = await readJsonSafely(response);

      if (!response.ok) {
        notify(body.message || `Failed to send invitation (${response.status})`, "error");
        return;
      }

      updateClientLocally(body.client);
      renderClientsTable();
      notify(`Invitation sent (${body.status}).`, "success");
    } catch (err) {
      notify(`Failed to send invitation: ${err?.message || err}`, "error");
    }
  }

  async function checkStatus(clientId, service) {
    const accessToken = getHmrcAccessToken();
    if (!accessToken) {
      notify("Connect to HMRC before checking authorisation status.", "warning");
      return;
    }

    try {
      const response = await hmrcFetcher()(
        `/api/v1/practice/clients/${encodeURIComponent(clientId)}/authorisation?service=${encodeURIComponent(service)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const body = await readJsonSafely(response);

      if (!response.ok) {
        notify(body.message || `Failed to check status (${response.status})`, "error");
        return;
      }

      updateClientLocally(body.client);
      renderClientsTable();
      notify(`Status: ${body.status}.`, "success");
    } catch (err) {
      notify(`Failed to check status: ${err?.message || err}`, "error");
    }
  }

  async function cancelInvitation(clientId, service) {
    const accessToken = getHmrcAccessToken();
    if (!accessToken) {
      notify("Connect to HMRC before cancelling an invitation.", "warning");
      return;
    }

    try {
      const response = await hmrcFetcher()(
        `/api/v1/practice/clients/${encodeURIComponent(clientId)}/authorisation/invitations?service=${encodeURIComponent(service)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const body = await readJsonSafely(response);

      if (!response.ok) {
        notify(body.message || `Failed to cancel invitation (${response.status})`, "error");
        return;
      }

      updateClientLocally(body.client);
      renderClientsTable();
      notify("Invitation cancelled.", "success");
    } catch (err) {
      notify(`Failed to cancel invitation: ${err?.message || err}`, "error");
    }
  }

  // --- event delegation ---

  document.addEventListener("click", (e) => {
    const inviteToggle = e.target.closest(".invite-toggle-btn");
    if (inviteToggle) {
      toggleInvitePanel(inviteToggle.getAttribute("data-client-id"), inviteToggle.getAttribute("data-service"), true);
      return;
    }

    const invitePanelCancel = e.target.closest(".invite-cancel-panel-btn");
    if (invitePanelCancel) {
      const cell = invitePanelCancel.closest(".auth-cell");
      if (cell) {
        const panel = cell.querySelector(".invite-panel");
        if (panel) panel.style.display = "none";
      }
      return;
    }

    const inviteSend = e.target.closest(".invite-send-btn");
    if (inviteSend) {
      sendInvite(inviteSend.getAttribute("data-client-id"), inviteSend.getAttribute("data-service"));
      return;
    }

    const checkStatusBtn = e.target.closest(".check-status-btn");
    if (checkStatusBtn) {
      checkStatus(checkStatusBtn.getAttribute("data-client-id"), checkStatusBtn.getAttribute("data-service"));
      return;
    }

    const cancelInviteBtn = e.target.closest(".cancel-invite-btn");
    if (cancelInviteBtn) {
      cancelInvitation(cancelInviteBtn.getAttribute("data-client-id"), cancelInviteBtn.getAttribute("data-service"));
      return;
    }

    const archiveBtn = e.target.closest(".archive-client-btn");
    if (archiveBtn) {
      archiveClient(archiveBtn.getAttribute("data-client-id"));
    }
  });

  document.getElementById("addClientForm")?.addEventListener("submit", handleAddClientSubmit);

  // --- page init ---
  // Does not wait for submit.js's "submit-ready" event: that event is only for the parts of the
  // page (the login/token display in the header) that submit.js itself owns. The client list
  // needs only localStorage and a fetcher, both available as soon as the DOM is, so it inits on
  // DOMContentLoaded like web/public/operator/dashboard.html rather than gating on a module that
  // may load after it in a stripped-down test page.
  function initPage() {
    if (typeof window.checkAuthStatus === "function") window.checkAuthStatus();
    fetchClients();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPage);
  } else {
    initPage();
  }
})();
