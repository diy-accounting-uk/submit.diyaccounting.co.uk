// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Change registered office address: companyView -> formView -> reviewView -> resultView,
// with an authorise round trip through filingCallback.html between reviewView and the
// filing calls whenever no usable Companies House token is already held.

const PENDING_KEY = "companiesHousePendingFiling";
const RESOURCE = "registered-office-address";

// In-memory filing state. Mirrored into sessionStorage (PENDING_KEY) before any redirect,
// so the page can resume the same filing after the OAuth round trip.
let filing = null;

function views() {
  return {
    companyView: document.getElementById("companyView"),
    formView: document.getElementById("formView"),
    reviewView: document.getElementById("reviewView"),
    resultView: document.getElementById("resultView"),
  };
}

function showView(name) {
  const all = views();
  Object.keys(all).forEach((key) => {
    all[key].style.display = key === name ? "block" : "none";
  });
}

function savePendingFiling() {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(filing));
}

function loadPendingFiling() {
  const raw = sessionStorage.getItem(PENDING_KEY);
  return raw ? JSON.parse(raw) : null;
}

function clearPendingFiling() {
  sessionStorage.removeItem(PENDING_KEY);
}

function renderAddressList(target, address) {
  target.innerHTML = "";
  const fields = [
    ["Premises", address.premises],
    ["Address line 1", address.addressLine1],
    ["Address line 2", address.addressLine2],
    ["Town or city", address.locality],
    ["County", address.region],
    ["Postcode", address.postalCode],
    ["Country", address.country],
  ];
  fields.forEach(([label, value]) => {
    if (!value) return;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    target.appendChild(dt);
    target.appendChild(dd);
  });
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);

  showLoading();
  hideStatus();
  try {
    const address = await window.getRegisteredOfficeAddress(companyNumber);
    filing = { companyNumber, referenceEtag: address.etag };
    renderAddressList(document.getElementById("currentAddressList"), address);
    showView("formView");
  } catch (error) {
    console.error("Failed to read the current registered office address:", error);
    showStatus(error.message || "Failed to read the current registered office address.", "error");
  } finally {
    hideLoading();
  }
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFormFields(event.currentTarget)) return;
  if (!window.formErrors.requireChecked({ acceptOfficeStatement: "Confirm the section 86(2) appropriate address statement" })) return;

  filing = {
    ...filing,
    premises: document.getElementById("premises").value.trim(),
    addressLine1: document.getElementById("addressLine1").value.trim(),
    addressLine2: document.getElementById("addressLine2").value.trim(),
    locality: document.getElementById("locality").value.trim(),
    region: document.getElementById("region").value.trim(),
    postalCode: document.getElementById("postalCode").value.trim(),
    country: document.getElementById("country").value,
    acceptAppropriateOfficeAddressStatement: true,
  };

  document.getElementById("reviewCompanyNumber").textContent = filing.companyNumber;
  renderAddressList(document.getElementById("reviewAddress"), filing);
  hideStatus();
  showView("reviewView");
}

function newAddressFromFiling() {
  return {
    premises: filing.premises,
    addressLine1: filing.addressLine1,
    addressLine2: filing.addressLine2,
    locality: filing.locality,
    region: filing.region,
    postalCode: filing.postalCode,
    country: filing.country,
    acceptAppropriateOfficeAddressStatement: filing.acceptAppropriateOfficeAddressStatement,
    referenceEtag: filing.referenceEtag,
  };
}

async function pollTransactionUntilSettled(transactionId) {
  let transaction;
  for (let attempt = 0; attempt < 5; attempt++) {
    transaction = await window.getCompaniesHouseTransaction(transactionId);
    const stillProcessing = (transaction.filings || []).some((entry) => entry.status === "processing");
    if (!stillProcessing) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return transaction;
}

function paragraph(text, className) {
  const element = document.createElement("p");
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderFilingResult(transaction) {
  const container = document.getElementById("filingResult");
  const filings = transaction.filings || [];
  const headlineParagraph = document.createElement("p");
  headlineParagraph.className = "outcome__title";
  const strong = document.createElement("strong");
  if (filings.some((entry) => entry.status === "rejected")) {
    strong.textContent = "Companies House rejected the change.";
    container.className = "outcome outcome--error";
  } else if (filings.length > 0 && filings.every((entry) => entry.status === "accepted")) {
    strong.textContent = "Companies House accepted the change.";
    container.className = "outcome outcome--ok";
  } else {
    strong.textContent = "Companies House is still processing the change.";
    container.className = "outcome";
  }
  headlineParagraph.append(strong);
  const paragraphs = [headlineParagraph];
  filings.forEach((entry) => {
    if (entry.rejectReasons && entry.rejectReasons.length > 0) {
      paragraphs.push(paragraph(`Rejected: ${entry.rejectReasons.join(", ")}`));
    }
  });
  paragraphs.push(paragraph(`Reference: ${transaction.transactionId}`, "hint"));
  container.replaceChildren(...paragraphs);
}

function renderValidationErrors(errors) {
  const container = document.getElementById("validationErrors");
  container.style.display = "block";
  container.replaceChildren(...(errors || []).map((entry) => paragraph(`${entry.location || ""}: ${entry.error || "invalid value"}`)));
}

function redirectToAuthorise(scope) {
  const state = window.generateRandomState();
  sessionStorage.setItem("ch_oauth_state", state);
  // The Companies House token response carries no scope field, so the callback records
  // the scope this page asked for as the scope the token was granted for.
  sessionStorage.setItem("ch_oauth_scope", scope);
  sessionStorage.setItem("currentActivity", location.pathname);
  savePendingFiling();
  window.authUrlBuilder.buildCompaniesHouseAuthUrl(state, scope).then((authUrl) => {
    console.log(`Page transition initiated: Redirecting to Companies House OAuth URL ${authUrl}`);
    window.location.href = authUrl;
  });
}

async function runFilingSequence() {
  const scope = window.companiesHouseScope(filing.companyNumber, RESOURCE);

  if (!window.hasUsableCompaniesHouseToken(scope)) {
    redirectToAuthorise(scope);
    return;
  }

  showLoading();
  hideStatus();
  document.getElementById("validationErrors").style.display = "none";
  try {
    if (!filing.transactionId) {
      const transaction = await window.openCompaniesHouseTransaction(filing.companyNumber, "Change of registered office address");
      filing.transactionId = transaction.transactionId;
      savePendingFiling();
    }

    if (!filing.resourceAdded) {
      await window.putRegisteredOfficeAddress(filing.transactionId, newAddressFromFiling());
      filing.resourceAdded = true;
      savePendingFiling();
    }

    try {
      await window.closeCompaniesHouseTransaction(filing.transactionId);
    } catch (closeError) {
      // A 504 means Companies House did not answer in time; the transaction may still be processing,
      // so read it back instead of failing the filing.
      if (closeError.status !== 504) throw closeError;
    }
    const transaction = await pollTransactionUntilSettled(filing.transactionId);

    renderFilingResult(transaction);
    document.getElementById("startAgainBtn").style.display = "inline-block";
    clearPendingFiling();
    showView("resultView");
  } catch (error) {
    if (error.status === 401) {
      console.log("Companies House access token was rejected mid-filing, re-authorising");
      window.clearCompaniesHouseToken();
      redirectToAuthorise(scope);
      return;
    }
    if (error.status === 422) {
      renderValidationErrors(error.body?.errors);
      document.getElementById("startAgainBtn").style.display = "inline-block";
      savePendingFiling();
      showView("resultView");
      return;
    }
    console.error("Companies House filing failed:", error);
    showStatus(error.message || "Failed to file the change with Companies House.", "error");
  } finally {
    hideLoading();
  }
}

function startAgain() {
  clearPendingFiling();
  filing = null;
  document.getElementById("companyForm").reset();
  document.getElementById("officeAddressForm").reset();
  document.getElementById("validationErrors").style.display = "none";
  document.getElementById("startAgainBtn").style.display = "none";
  hideStatus();
  showView("companyView");
}

// Resume a filing left pending across an OAuth authorise round trip, whenever the page
// loads with both a pending filing and a usable token.
function resumePendingFilingIfReady() {
  const pending = loadPendingFiling();
  if (!pending) return;

  filing = pending;
  const scope = window.companiesHouseScope(filing.companyNumber, RESOURCE);
  if (window.hasUsableCompaniesHouseToken(scope)) {
    sessionStorage.removeItem("currentActivity");
    runFilingSequence();
  }
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("officeAddressForm").addEventListener("submit", handleFormSubmit);
document.getElementById("submitFilingBtn").addEventListener("click", runFilingSequence);
document.getElementById("startAgainBtn").addEventListener("click", startAgain);

if (window.__submitReady__) {
  resumePendingFilingIfReady();
} else {
  document.addEventListener("submit-ready", resumePendingFilingIfReady, { once: true });
}
