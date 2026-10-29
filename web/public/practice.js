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

  // The agent's HMRC access token. It lives in this variable only: the browser keeps the id of the
  // server-side grant, and the grant route answers the token to its owner.
  let __hmrcAccessToken = null;

  function getHmrcAccessToken() {
    return __hmrcAccessToken;
  }

  function readStored(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      // Storage is blocked: the connection then lasts only until the page navigates.
    }
  }

  function hmrcAccountName() {
    return readStored("hmrcAccount") === "synthetic" ? "synthetic" : "live";
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
    if (typeof window.hideStatus === "function") window.hideStatus();
    if (typeof window.showStatus === "function") window.showStatus(message, type);
  }

  function cognitoFetch(url, init = {}) {
    const idToken = getIdToken();
    const headers = new Headers(init.headers || {});
    if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
    return cognitoFetcher()(url, { ...init, headers });
  }

  // Every value placed in the markup passed here goes through escapeHtml first.
  function setHtml(element, html) {
    element.replaceChildren(...new DOMParser().parseFromString(html, "text/html").body.childNodes);
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

  // --- HMRC agent connection ---

  function renderConnection(connected) {
    const line = document.getElementById("hmrcConnectionLine");
    const button = document.getElementById("connectHmrcBtn");
    if (line) {
      line.textContent = connected
        ? "Connected to HMRC as an agent."
        : "Not connected to HMRC. Connect to invite clients and check their authorisation.";
    }
    if (button) button.hidden = connected;
  }

  // Reads the grant the page started, which refreshes the token near expiry. A 404 means the
  // grant expired or is gone: the page then shows as not connected and the stored id is cleared.
  async function loadConnection() {
    const grantId = readStored("practiceHmrcGrantId");
    __hmrcAccessToken = null;
    if (!grantId || !getIdToken()) {
      renderConnection(false);
      return false;
    }
    try {
      const response = await cognitoFetch(`/api/v1/mcp/hmrc-grants/${encodeURIComponent(grantId)}`, {});
      if (response.status === 404) {
        writeStored("practiceHmrcGrantId", null);
      } else if (response.ok) {
        const body = await readJsonSafely(response);
        if (body.status === "granted" && body.accessToken) __hmrcAccessToken = body.accessToken;
      }
    } catch {
      // The connection stays shown as not connected; the practice can connect again.
    }
    renderConnection(Boolean(__hmrcAccessToken));
    return Boolean(__hmrcAccessToken);
  }

  async function connectToHmrc() {
    if (!getIdToken()) {
      notify("Please log in first.", "warning");
      return;
    }
    try {
      const response = await cognitoFetch("/api/v1/mcp/hmrc-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: ["agent"], hmrcAccount: hmrcAccountName() }),
      });
      const body = await readJsonSafely(response);
      if (!response.ok || !body.url || !body.grantId) {
        notify(body.message || `Failed to start the HMRC connection (${response.status})`, "error");
        return;
      }
      writeStored("practiceHmrcGrantId", body.grantId);
      window.location.assign(body.url);
    } catch (err) {
      notify(`Failed to start the HMRC connection: ${err?.message || err}`, "error");
    }
  }

  // Before an action, so the token is fresh and an expired grant is shown as such.
  async function ensureConnection(message) {
    if (await loadConnection()) return true;
    renderClientsTable();
    notify(message, "warning");
    return false;
  }

  function renderLicence(licence) {
    const el = document.getElementById("licenceLine");
    if (!el || !licence) return;
    if (licence.held) {
      el.textContent = "Your practice holds the Resident Pro licence.";
    } else {
      setHtml(
        el,
        'Your practice does not hold the Resident Pro licence. You need it to file for clients. <a href="bundles.html">Get Resident Pro</a>',
      );
    }
    el.hidden = false;
  }

  // --- clients list ---

  async function fetchClients() {
    const idToken = getIdToken();
    const errorState = document.getElementById("clientsErrorState");
    const table = document.getElementById("clientsTable");
    const empty = document.getElementById("clientsEmptyState");

    if (!idToken) {
      errorState.style.display = "none";
      table.style.display = "none";
      empty.style.display = "none";
      return;
    }

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
    renderArnOnFile(body.arnOnFile === true);
    renderLicence(body.licence);
  }

  function renderArnOnFile(arnOnFile) {
    const el = document.getElementById("arnOnFile");
    if (el) el.hidden = !arnOnFile;
  }

  // --- archived clients ---

  async function toggleArchivedClients() {
    const section = document.getElementById("archivedClients");
    const button = document.getElementById("toggleArchivedBtn");
    if (!section.hidden) {
      section.hidden = true;
      button.textContent = "Show archived clients";
      button.setAttribute("aria-expanded", "false");
      return;
    }
    try {
      const response = await cognitoFetch("/api/v1/practice/clients?archived=true", {});
      const body = await readJsonSafely(response);
      if (!response.ok) {
        notify(body.message || `Failed to load archived clients (${response.status})`, "error");
        return;
      }
      const archived = Array.isArray(body.clients) ? body.clients : [];
      const list = document.getElementById("archivedClientsList");
      setHtml(
        list,
        archived
          .map((c) => `<li>${escapeHtml(c.displayName || c.clientId)} <span class="hint">${escapeHtml(identifiersLine(c))}</span></li>`)
          .join(""),
      );
      document.getElementById("archivedClientsEmpty").hidden = archived.length > 0;
      section.hidden = false;
      button.textContent = "Hide archived clients";
      button.setAttribute("aria-expanded", "true");
    } catch (err) {
      notify(`Failed to load archived clients: ${err?.message || err}`, "error");
    }
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
      return `<div class="auth-cell"><span class="hint">No ${escapeHtml(def.fieldLabel)} on file</span></div>`;
    }

    const auth = client.authorisations?.[def.service];
    const status = auth?.status;
    const statusLabel = status ? STATUS_LABELS[status] || status : "Not invited";
    const hasAccessToken = !!getHmrcAccessToken();
    // HMRC's status check needs the invitation, or the known fact given with it: a client never
    // invited has nothing to check, so it offers Invite only.
    const invited = Boolean(auth?.invitationId || auth?.knownFact);

    const buttons = [];
    if (status === "pending" && invited) {
      buttons.push(
        `<button type="button" class="btn-small check-status-btn" data-client-id="${clientId}" data-service="${def.service}" ${hasAccessToken ? "" : "disabled"}>Check status</button>`,
      );
      buttons.push(
        `<button type="button" class="btn-small btn-danger cancel-invite-btn" data-client-id="${clientId}" data-service="${def.service}" ${hasAccessToken ? "" : "disabled"}>Cancel invitation</button>`,
      );
    } else if (status === "authorised" && invited) {
      buttons.push(
        `<button type="button" class="btn-small check-status-btn" data-client-id="${clientId}" data-service="${def.service}" ${hasAccessToken ? "" : "disabled"}>Check status</button>`,
      );
    } else {
      buttons.push(
        `<button type="button" class="btn-small invite-toggle-btn" data-client-id="${clientId}" data-service="${def.service}" ${hasAccessToken ? "" : "disabled"}>Invite</button>`,
      );
    }

    const hint = hasAccessToken ? "" : `<p class="auth-hint">Connect to HMRC to invite or check this client.</p>`;

    return `
      <div class="auth-cell" data-client-id="${clientId}" data-service="${def.service}">
        <div class="auth-status">${escapeHtml(statusLabel)}</div>
        <div class="auth-actions">${buttons.join("")}</div>
        ${hint}
        <div class="invite-panel" hidden>
          <label class="invite-known-fact-label" for="knownFact-${clientId}-${def.service}">Known fact</label>
          <p class="hint" id="knownFactHint-${clientId}-${def.service}">The VAT registration date as DD MM YYYY, or the client's postcode.</p>
          <input type="text" class="invite-known-fact" id="knownFact-${clientId}-${def.service}" aria-describedby="knownFactHint-${clientId}-${def.service}" autocomplete="off" />
          <div class="auth-actions">
            <button type="button" class="btn-small invite-send-btn" data-client-id="${clientId}" data-service="${def.service}">Send invite</button>
            <button type="button" class="btn-small btn-secondary invite-cancel-panel-btn">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  function archiveButtonHtml(client) {
    const label = escapeHtml(client.displayName || client.clientId);
    return `<button type="button" class="btn-small btn-danger archive-client-btn" data-client-id="${client.clientId}" aria-label="Archive ${label}">Archive</button>`;
  }

  function archiveConfirmHtml(client) {
    const label = escapeHtml(client.displayName || client.clientId);
    return `
      <div class="archive-confirm" role="group" aria-label="Confirm archive of ${label}">
        <p class="archive-confirm-text">Archive ${label}? You can still see them under archived clients.</p>
        <div class="auth-actions">
          <button type="button" class="btn-small btn-danger archive-confirm-btn" data-client-id="${client.clientId}">Yes, archive</button>
          <button type="button" class="btn-small btn-secondary archive-keep-btn" data-client-id="${client.clientId}">Keep</button>
        </div>
      </div>`;
  }

  function showArchiveConfirm(clientId) {
    const client = __clients.find((c) => c.clientId === clientId);
    const cell = document.querySelector(`.archive-cell[data-client-id="${clientId}"]`);
    if (!client || !cell) return;
    setHtml(cell, archiveConfirmHtml(client));
    cell.querySelector(".archive-confirm-btn")?.focus();
  }

  function hideArchiveConfirm(clientId) {
    const client = __clients.find((c) => c.clientId === clientId);
    const cell = document.querySelector(`.archive-cell[data-client-id="${clientId}"]`);
    if (!client || !cell) return;
    setHtml(cell, archiveButtonHtml(client));
    cell.querySelector(".archive-client-btn")?.focus();
  }

  function clientRowHtml(client) {
    const name = escapeHtml(client.displayName || client.clientId);
    return `
      <tr data-client-row="${client.clientId}">
        <td>${name}</td>
        <td>${escapeHtml(identifiersLine(client))}</td>
        <td>${authCellHtml(client, SERVICES[0])}</td>
        <td>${authCellHtml(client, SERVICES[1])}</td>
        <td class="archive-cell" data-client-id="${client.clientId}">${archiveButtonHtml(client)}</td>
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

  const FIELD_ERRORS = [
    { pattern: /display ?name/i, inputId: "displayNameInput", message: "Enter the client name, up to 200 characters" },
    { pattern: /VAT registration/i, inputId: "vrnInput", message: "The VAT registration number must be 9 numbers" },
    { pattern: /National Insurance/i, inputId: "ninoInput", message: "Enter the National Insurance number like AB123456C" },
    { pattern: /Unique Taxpayer|UTR/i, inputId: "utrInput", message: "The UTR must be 10 or 13 numbers" },
    { pattern: /company number/i, inputId: "companyNumberInput", message: "The company number must be 8 characters" },
  ];

  // The API answers { message, errorMessages: [...] }. Each message that names a field marks that
  // field; the rest are shown together above the button.
  function showAddClientFailure(body, errorsEl) {
    const messages =
      Array.isArray(body.errorMessages) && body.errorMessages.length > 0 ? body.errorMessages : [body.message || "Failed to add client"];
    const fieldErrors = [];
    const otherMessages = [];
    for (const text of messages) {
      const match = FIELD_ERRORS.find((entry) => entry.pattern.test(text));
      if (match && !fieldErrors.some((e) => e.input.id === match.inputId)) {
        fieldErrors.push({ input: document.getElementById(match.inputId), message: match.message });
      } else if (!match) {
        otherMessages.push(text);
      }
    }
    if (fieldErrors.length > 0) window.formErrors.showFormErrors(fieldErrors);
    if (otherMessages.length > 0) {
      errorsEl.textContent = otherMessages.join(" ");
      errorsEl.style.display = "block";
    }
  }

  async function handleAddClientSubmit(e) {
    e.preventDefault();
    const errorsEl = document.getElementById("addClientErrors");
    const submitBtn = document.getElementById("addClientBtn");
    errorsEl.style.display = "none";
    errorsEl.textContent = "";
    window.formErrors?.clearFormErrors();

    const idToken = getIdToken();
    if (!idToken) {
      notify("Please log in first to add a client.", "warning");
      return;
    }

    if (!window.formErrors.requireFields(["displayNameInput"])) return;

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
        showAddClientFailure(body, errorsEl);
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
      const archivedSection = document.getElementById("archivedClients");
      if (archivedSection && !archivedSection.hidden) {
        archivedSection.hidden = true;
        await toggleArchivedClients();
      }
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

    if (!(await ensureConnection("Connect to HMRC before sending an invitation."))) return;
    const accessToken = getHmrcAccessToken();

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
    if (!(await ensureConnection("Connect to HMRC before checking authorisation status."))) return;
    const accessToken = getHmrcAccessToken();

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
    if (!(await ensureConnection("Connect to HMRC before cancelling an invitation."))) return;
    const accessToken = getHmrcAccessToken();

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
    if (e.target.closest("#connectHmrcBtn")) {
      connectToHmrc();
      return;
    }

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
      showArchiveConfirm(archiveBtn.getAttribute("data-client-id"));
      return;
    }

    const archiveConfirmBtn = e.target.closest(".archive-confirm-btn");
    if (archiveConfirmBtn) {
      archiveClient(archiveConfirmBtn.getAttribute("data-client-id"));
      return;
    }

    const archiveKeepBtn = e.target.closest(".archive-keep-btn");
    if (archiveKeepBtn) {
      hideArchiveConfirm(archiveKeepBtn.getAttribute("data-client-id"));
      return;
    }

    if (e.target.closest("#toggleArchivedBtn")) toggleArchivedClients();
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
    loadConnection()
      .then(fetchClients)
      .catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPage);
  } else {
    initPage();
  }
})();
