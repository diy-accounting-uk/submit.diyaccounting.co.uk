// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

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

// The address's parts with their labels, in the chrome's language.
function addressFields(address) {
  return [
    [window.siteText("ch.address.premises", "Premises"), address.premises],
    [window.siteText("ch.address.line-1", "Address line 1"), address.addressLine1],
    [window.siteText("ch.address.line-2", "Address line 2"), address.addressLine2],
    [window.siteText("ch.address.town", "Town or city"), address.locality],
    [window.siteText("ch.address.county", "County"), address.region],
    [window.siteText("ch.address.postcode", "Postcode"), address.postalCode],
    [window.siteText("ch.address.country", "Country"), address.country],
  ];
}

function renderAddressList(target, address) {
  target.innerHTML = "";
  const fields = addressFields(address);
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
    showStatus(error.message || window.siteText("ch.office.read-failed", "Failed to read the current registered office address."), "error");
  } finally {
    hideLoading();
  }
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFormFields(event.currentTarget)) return;
  if (
    !window.formErrors.requireChecked({
      acceptOfficeStatement: window.siteText("ch.office.confirm-statement", "Confirm the section 86(2) appropriate address statement"),
    })
  )
    return;

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

// Each poll reads the transaction from Companies House's filing API, so polls are two seconds apart.
const TRANSACTION_POLL_MS = 2000;

async function pollTransactionUntilSettled(transactionId) {
  let transaction;
  for (let attempt = 0; attempt < 5; attempt++) {
    transaction = await window.getCompaniesHouseTransaction(transactionId);
    const stillProcessing = (transaction.filings || []).some((entry) => entry.status === "processing");
    if (!stillProcessing) break;
    await new Promise((resolve) => setTimeout(resolve, TRANSACTION_POLL_MS));
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
    strong.textContent = window.siteText("ch.change.rejected", "Companies House rejected the change.");
    container.className = "outcome outcome--error";
  } else if (filings.length > 0 && filings.every((entry) => entry.status === "accepted")) {
    strong.textContent = window.siteText("ch.change.accepted", "Companies House accepted the change.");
    container.className = "outcome outcome--ok";
  } else {
    strong.textContent = window.siteText("ch.change.processing", "Companies House is still processing the change.");
    container.className = "outcome";
  }
  headlineParagraph.append(strong);
  const paragraphs = [headlineParagraph];
  filings.forEach((entry) => {
    if (entry.rejectReasons && entry.rejectReasons.length > 0) {
      paragraphs.push(
        paragraph(window.siteText("ch.change.rejected-reasons", "Rejected: {reasons}", { reasons: entry.rejectReasons.join(", ") })),
      );
    }
  });
  paragraphs.push(
    paragraph(window.siteText("ch.change.reference", "Reference: {reference}", { reference: transaction.transactionId }), "hint"),
  );
  container.replaceChildren(...paragraphs);
}

// Whether Companies House has decided every filing in the transaction: one rejected, or all accepted.
function transactionDecided(transaction) {
  const filings = transaction.filings || [];
  return (
    filings.some((entry) => entry.status === "rejected") || (filings.length > 0 && filings.every((entry) => entry.status === "accepted"))
  );
}

// Reads the closed transaction back and shows its outcome. Start a new filing waits until Companies
// House has decided the change, so a second change cannot start while the first may still be with
// Companies House; a change still with Companies House, or a failed read, gets Check again. A
// rejected access token goes to the caller, which authorises again.
async function showTransactionOutcome() {
  const container = document.getElementById("filingResult");
  const checkAgain = document.getElementById("checkAgainBtn");
  const startAgainButton = document.getElementById("startAgainBtn");
  checkAgain.style.display = "none";
  startAgainButton.style.display = "none";
  let transaction;
  try {
    window.narrateStage(window.siteText("ct.narrate-waiting-ch", "Waiting for Companies House's answer..."));
    transaction = await pollTransactionUntilSettled(filing.transactionId);
  } catch (error) {
    if (error.status === 401) throw error;
    console.error("Companies House transaction status check failed:", error);
    container.className = "outcome";
    container.replaceChildren(
      paragraph(
        window.siteText(
          "ch.change.check-failed",
          "The change was sent to Companies House, and its outcome is not known yet: the status check failed ({message}). Choose Check again to ask for the outcome.",
          { message: error.message },
        ),
      ),
    );
    checkAgain.style.display = "inline-block";
    showView("resultView");
    return;
  }
  renderFilingResult(transaction);
  await renderFilingRecord(transaction);
  if (transactionDecided(transaction)) {
    startAgainButton.style.display = "inline-block";
  } else {
    container.append(
      paragraph(
        window.siteText(
          "ch.change.still-processing",
          "The change is still with Companies House. Choose Check again to ask for the outcome.",
        ),
        "hint",
      ),
    );
    checkAgain.style.display = "inline-block";
  }
  showView("resultView");
}

async function checkTransactionAgain() {
  showLoading();
  try {
    await showTransactionOutcome();
  } catch (error) {
    console.error("Companies House transaction status check failed:", error);
    showStatus(error.message, "error");
  } finally {
    hideLoading();
  }
}

async function renderFilingRecord(transaction) {
  const { registeredChangeCopyHtml, todayText } = await import("../lib/filing-result-record.js");
  const html = registeredChangeCopyHtml({
    title: window.siteText("ch.office.record-title", "Change of registered office address"),
    companyNumber: filing.companyNumber,
    transaction,
    details: addressFields(filing),
    dateText: todayText(),
  });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.getElementById("filingRecord").replaceChildren(...parsed.body.childNodes);
}

function renderValidationErrors(errors) {
  const container = document.getElementById("validationErrors");
  container.style.display = "block";
  container.replaceChildren(
    ...(errors || []).map((entry) =>
      paragraph(`${entry.location || ""}: ${entry.error || window.siteText("ch.change.invalid-value", "invalid value")}`),
    ),
  );
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
    window.narrateStage(window.siteText("ch.narrate-sending-change", "Sending the change to Companies House..."));
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
    await showTransactionOutcome();
    clearPendingFiling();
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
    showStatus(error.message || window.siteText("ch.change.file-failed", "Failed to file the change with Companies House."), "error");
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
  document.getElementById("filingRecord").replaceChildren();
  document.getElementById("startAgainBtn").style.display = "none";
  document.getElementById("checkAgainBtn").style.display = "none";
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
document.getElementById("checkAgainBtn").addEventListener("click", checkTransactionAgain);

if (window.__submitReady__) {
  resumePendingFilingIfReady();
} else {
  document.addEventListener("submit-ready", resumePendingFilingIfReady, { once: true });
}
