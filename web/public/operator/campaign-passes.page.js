// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/operator/campaign-passes.page.js
// The operator's campaign pass page: a form that creates a custom-campaign pass with every term
// set per pass, the new pass's link and QR code, and the list of campaign passes with their
// redemptions so far. The list uses the pass card of lib/pass-card.js, as the bundles page does.

(function () {
  "use strict";

  const PASS_TYPE_ID = "custom-campaign";

  // The page is in English, as the operator dashboard is.
  const helpers = {
    siteText: (id, english, values) =>
      english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)),
    dateText: (date, { month = "long" } = {}) => date.toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric" }),
  };

  let catalogue = null;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, value);
    for (const child of children) {
      if (child === null || child === undefined) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function showStatus(message, type) {
    if (typeof window.showStatus === "function") window.showStatus(message, type);
  }

  function authHeaders() {
    const idToken = window.localStorage ? window.localStorage.getItem("cognitoIdToken") : null;
    return idToken ? { Authorization: "Bearer " + idToken } : {};
  }

  async function callApi(path, init = {}) {
    const fetcher = window.fetchWithIdToken || window.fetch;
    const response = await fetcher(path, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || "request-failed");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  // The bundles a campaign pass may grant: every catalogue bundle except the automatic one, the
  // operator's own and those sold by subscription, which a comp bundle grants instead.
  function grantableBundles() {
    return (catalogue?.bundles || []).filter(
      (bundle) => bundle.allocation !== "automatic" && bundle.allocation !== "on-subscription" && bundle.id !== "operator",
    );
  }

  function grantRow(index) {
    const id = (name) => `cpGrant${index}${name}`;
    const select = el("select", { id: id("Bundle"), class: "cp-grant-bundle" });
    for (const bundle of grantableBundles()) select.append(el("option", { value: bundle.id }, `${bundle.name} (${bundle.id})`));
    const field = (name, label, input) => el("div", { class: "pass-field" }, el("label", { for: id(name) }, label), input);
    return el(
      "div",
      { "class": "cp-grant", "data-grant-index": String(index) },
      field("Bundle", "Bundle", select),
      field(
        "Duration",
        "Lasts from redemption (ISO duration, e.g. P1Y)",
        el("input", { type: "text", id: id("Duration"), class: "cp-grant-duration", placeholder: "P1Y", autocomplete: "off" }),
      ),
      field(
        "Tokens",
        "Tokens added",
        el("input", { type: "number", id: id("Tokens"), class: "cp-grant-tokens", min: "1", step: "1", inputmode: "numeric" }),
      ),
      field(
        "Refresh",
        "Tokens refresh every (ISO duration, e.g. P1M)",
        el("input", { type: "text", id: id("Refresh"), class: "cp-grant-refresh", placeholder: "P1M", autocomplete: "off" }),
      ),
    );
  }

  function addGrantRow() {
    const container = document.getElementById("cpGrants");
    container.append(grantRow(container.children.length));
  }

  function grantsFromForm() {
    return Array.from(document.querySelectorAll("#cpGrants .cp-grant")).map((row) => {
      const value = (selector) => row.querySelector(selector).value.trim();
      const grant = { bundleId: value(".cp-grant-bundle") };
      if (value(".cp-grant-duration")) grant.duration = value(".cp-grant-duration");
      if (value(".cp-grant-tokens")) grant.tokens = Number(value(".cp-grant-tokens"));
      if (value(".cp-grant-refresh")) grant.tokenRefreshInterval = value(".cp-grant-refresh");
      return grant;
    });
  }

  function requestFromForm() {
    const value = (id) => document.getElementById(id).value.trim();
    const request = {
      passTypeId: PASS_TYPE_ID,
      validFrom: `${value("cpValidFrom")}T00:00:00.000Z`,
      validUntil: `${value("cpValidUntil")}T23:59:59.999Z`,
      usesPerAccount: Number(value("cpUsesPerAccount")),
      grants: grantsFromForm(),
    };
    request.maxUses = value("cpMaxUses") ? Number(value("cpMaxUses")) : null;
    if (value("cpNotes")) request.notes = value("cpNotes");
    return request;
  }

  // The email for the new pass follows the reader's language choice.
  function siteLanguageHeader() {
    return window.siteLanguage && window.siteLanguage.current() === "cy" ? { "X-Site-Language": "cy" } : {};
  }

  function passUrl(code) {
    return `${window.location.origin}/pass.html?pass=${encodeURIComponent(code)}`;
  }

  async function showNewPass(code) {
    const url = passUrl(code);
    document.getElementById("cpNewPassCode").textContent = code;
    const link = document.getElementById("cpNewPassLink");
    link.href = url;
    link.textContent = url;
    document.getElementById("cpCopyLink").dataset.passUrl = url;
    const qr = document.getElementById("cpNewPassQr");
    // qrcode.min.js declares QRCode as a global const, which is not a property of window.
    qr.src = await QRCode.toDataURL(url, { width: 250, margin: 2, errorCorrectionLevel: "M" });
    qr.hidden = false;
    document.getElementById("cpNewPass").hidden = false;
  }

  function passCardEl(pass) {
    return el(
      "div",
      { "class": "service-item bundle-row", "data-pass-code": pass.code },
      el(
        "div",
        { class: "bundle-row-line" },
        el("span", { class: "pass-code" }, pass.code),
        el("span", { class: "status-tag" }, window.passCard.typeLabel(pass, helpers)),
      ),
      pass.notes ? el("div", { class: "bundle-note" }, pass.notes) : null,
      window.passCard.termsEl(pass, catalogue, helpers),
      pass.figures ? window.passCard.figuresEl(pass.figures, "pass-figures", helpers) : null,
      el(
        "div",
        { class: "bundle-row-line" },
        el(
          "button",
          { "type": "button", "class": "btn btn-small btn-secondary pass-copy-link", "data-pass-url": passUrl(pass.code) },
          "Copy link",
        ),
      ),
    );
  }

  async function loadCampaignPasses() {
    const list = document.getElementById("cpList");
    const empty = document.getElementById("cpListEmpty");
    try {
      const { passes } = await callApi("/api/v1/pass/campaign");
      list.replaceChildren(...passes.map(passCardEl));
      empty.hidden = passes.length > 0;
    } catch (error) {
      showStatus(error.status === 403 ? "Only an operator can list campaign passes." : "Could not load the campaign passes.", "error");
    }
  }

  async function createCampaignPass(event) {
    event.preventDefault();
    const button = document.getElementById("cpCreate");
    button.disabled = true;
    try {
      const body = await callApi("/api/v1/pass/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...siteLanguageHeader() },
        body: JSON.stringify(requestFromForm()),
      });
      await showNewPass(body.code);
      showStatus(`Campaign pass ${body.code} created.`, "success");
      await loadCampaignPasses();
    } catch (error) {
      showStatus(error.message === "request-failed" ? "The pass was not created." : `The pass was not created: ${error.message}`, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function copyLink(event) {
    const button = event.target.closest("[data-pass-url]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.passUrl);
      showStatus("Link copied.", "info");
    } catch {
      showStatus(button.dataset.passUrl, "info");
    }
  }

  async function init() {
    const response = await fetch("/submit.catalogue.toml");
    catalogue = window.TOML.parse(await response.text());
    addGrantRow();
    document.getElementById("cpAddGrant").addEventListener("click", addGrantRow);
    document.getElementById("campaignPassForm").addEventListener("submit", createCampaignPass);
    document.getElementById("mainContent").addEventListener("click", copyLink);
    await loadCampaignPasses();
    document.dispatchEvent(new CustomEvent("activity-completed", { detail: "operator-campaign-passes" }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
