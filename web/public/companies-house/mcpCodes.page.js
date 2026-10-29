// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The page a tool's codes link opens: the user types the Companies House codes here instead of in
// the chat. The entry id in the address names what to ask for and where to store the answer.

(function () {
  const entryId = new URLSearchParams(window.location.search).get("entry");
  const entryUrl = `/api/v1/mcp/codes-entries/${encodeURIComponent(entryId || "")}`;
  const message = document.getElementById("codesMessage");
  const formView = document.getElementById("codesFormView");
  const doneView = document.getElementById("codesDoneView");
  const form = document.getElementById("codesForm");
  const personalCodeFields = document.getElementById("personalCodeFields");
  const clientCodeFields = document.getElementById("clientCodeFields");
  let entry = null;

  function say(text, isError) {
    message.textContent = text;
    message.className = isError ? "error-message" : "hint";
  }

  function directorLabel(director) {
    return `${director.forename} ${director.surname}`;
  }

  function showExpiry() {
    const expires = new Date(entry.expiresAt);
    if (Number.isNaN(expires.getTime())) return;
    const time = expires.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    document.getElementById("codesExpiry").textContent = `This link works until ${time}.`;
  }

  function clientLabel(client) {
    return client.companyNumber ? `${client.displayName} (${client.companyNumber})` : client.displayName;
  }

  function showClientRows() {
    document.getElementById("codesUse").textContent = entry.clients.length === 1 ? "this filing" : "each client's filing";
    document.getElementById("codesIntro").textContent =
      entry.clients.length === 1
        ? "Companies House filing for 1 client. Type the client's company authentication code below to let DIY Accounting Submit make the filing."
        : `Companies House filings for ${entry.clients.length} clients. Type each client's company authentication code below to let DIY Accounting Submit make the filings.`;
    const companyGroup = document.getElementById("companyAuthCodeGroup");
    companyGroup.style.display = "none";
    document.getElementById("companyAuthCode").required = false;
    entry.clients.forEach((client, index) => {
      const group = document.createElement("div");
      group.className = "form-group";
      const label = document.createElement("label");
      label.htmlFor = `clientCode${index}`;
      label.textContent = `Company authentication code for ${clientLabel(client)}`;
      const input = document.createElement("input");
      input.type = "password";
      input.id = `clientCode${index}`;
      input.name = `clientCode${index}`;
      input.required = true;
      input.minLength = 6;
      input.maxLength = 8;
      input.autocomplete = "off";
      group.append(label, input);
      clientCodeFields.append(group);
    });
    formView.style.display = "";
  }

  function showForm() {
    showExpiry();
    if (entry.clients && entry.clients.length > 0) return showClientRows();
    document.getElementById("codesIntro").textContent =
      `Companies House company ${entry.companyNumber}. Type the codes below to let DIY Accounting Submit make the filing.`;
    entry.directors.forEach((director, index) => {
      const group = document.createElement("div");
      group.className = "form-group";
      const label = document.createElement("label");
      label.htmlFor = `personalCode${index}`;
      label.textContent = `Personal code for ${directorLabel(director)}`;
      const input = document.createElement("input");
      input.type = "password";
      input.id = `personalCode${index}`;
      input.name = `personalCode${index}`;
      input.required = true;
      input.minLength = 11;
      input.maxLength = 11;
      input.autocomplete = "off";
      group.append(label, input);
      personalCodeFields.append(group);
    });
    formView.style.display = "";
  }

  async function load() {
    if (!entryId) return say("This link has no codes entry in it. Ask for a new link in your chat.", true);
    const response = await fetch(entryUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) return say("This codes link has expired or does not exist. Ask for a new link in your chat.", true);
    entry = await response.json();
    if (entry.state !== "pending") {
      doneView.style.display = "";
      return say("");
    }
    say("");
    showForm();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveCodesBtn");
    button.disabled = true;
    const payload =
      entry.clients && entry.clients.length > 0
        ? {
            clients: entry.clients.map((client, index) => ({
              clientId: client.clientId,
              companyAuthCode: document.getElementById(`clientCode${index}`).value,
            })),
          }
        : {
            companyAuthCode: document.getElementById("companyAuthCode").value,
            personalCodes: entry.directors.map((_, index) => document.getElementById(`personalCode${index}`).value),
          };
    const response = await fetch(entryUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      form.reset();
      formView.style.display = "none";
      doneView.style.display = "";
      return say("");
    }
    const answer = await response.json().catch(() => ({}));
    say(answer.message || "The codes were not saved. Ask for a new link in your chat.", true);
    button.disabled = false;
  });

  load().catch(() => say("The codes page could not be reached. Try the link again.", true));
})();
