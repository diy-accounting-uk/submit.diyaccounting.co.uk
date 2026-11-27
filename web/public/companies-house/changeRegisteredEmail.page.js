// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Change registered email address: companyView (with the eligibility check) -> formView ->
// reviewView -> resultView, with an authorise round trip through filingCallback.html
// whenever no usable Companies House token is already held.

const PENDING_KEY = "companiesHousePendingFiling";
const RESOURCE = "registered-email-address";

// A function, so each message is read in the chrome's language when it is shown.
const eligibilityStopMessages = () => ({
  INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS: window.siteText(
    "ch.email.no-address-yet",
    "This company has no registered email address yet. This filing changes an existing address; it does not set the first one.",
  ),
  INVALID_COMPANY_STATUS: window.siteText("ch.email.status-blocks", "This company's status blocks a registered email address change."),
  INVALID_COMPANY_TYPE: window.siteText("ch.email.type-not-covered", "This company's type is not covered by this filing."),
  COMPANY_NOT_FOUND: window.siteText("ch.email.not-on-register", "That company number is not on the register."),
});

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

// The eligibility check itself carries Companies House OAuth scopes (Track 2's
// companiesHouseRegisteredEmailEligibilityGet.js requires the user's access token), so the
// authorise round trip happens before the eligibility answer is known, not after.
async function checkEligibilityAndProceed() {
  showLoading();
  hideStatus();
  try {
    const eligibility = await window.getRegisteredEmailEligibility(filing.companyNumber);
    if (eligibility.eligibilityStatusCode !== "COMPANY_VALID_FOR_SERVICE") {
      const message =
        eligibilityStopMessages()[eligibility.eligibilityStatusCode] ||
        window.siteText("ch.email.not-eligible", "This company is not eligible for a registered email address change ({code}).", {
          code: eligibility.eligibilityStatusCode,
        });
      showStatus(message, "error");
      clearPendingFiling();
      showView("companyView");
      return;
    }

    clearPendingFiling();
    showView("formView");
  } catch (error) {
    if (error.status === 401) {
      console.log("Companies House access token was rejected during the eligibility check, re-authorising");
      window.clearCompaniesHouseToken();
      redirectToAuthorise(window.companiesHouseScope(filing.companyNumber, RESOURCE));
      return;
    }
    console.error("Failed to check registered email address eligibility:", error);
    showStatus(
      error.message || window.siteText("ch.email.eligibility-failed", "Failed to check registered email address eligibility."),
      "error",
    );
    showView("companyView");
  } finally {
    hideLoading();
  }
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);

  filing = { companyNumber };
  const scope = window.companiesHouseScope(companyNumber, RESOURCE);
  if (!window.hasUsableCompaniesHouseToken(scope)) {
    redirectToAuthorise(scope);
    return;
  }

  await checkEligibilityAndProceed();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const emailInput = document.getElementById("registeredEmailAddress");
  const errors = [];
  if (emailInput.value.trim() === "")
    errors.push({ input: emailInput, message: window.siteText("ch.email.enter-address", "Enter the new registered email address") });
  else if (!emailInput.checkValidity())
    errors.push({
      input: emailInput,
      message: window.siteText("ch.email.format", "Enter an email address in the format name@example.com"),
    });
  const acceptInput = document.getElementById("acceptEmailStatement");
  if (!acceptInput.checked)
    errors.push({
      input: acceptInput,
      message: window.siteText("ch.email.confirm-statement", "Confirm the section 88A(2) appropriate email address statement"),
    });
  if (errors.length > 0) {
    window.formErrors.showFormErrors(errors);
    return;
  }
  window.formErrors.clearFormErrors();

  filing = {
    ...filing,
    registeredEmailAddress: document.getElementById("registeredEmailAddress").value.trim(),
    acceptAppropriateEmailAddressStatement: true,
  };

  document.getElementById("reviewCompanyNumber").textContent = filing.companyNumber;
  document.getElementById("reviewEmailAddress").textContent = filing.registeredEmailAddress;
  hideStatus();
  showView("reviewView");
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
    window.showStatus(window.siteText("ct.narrate-waiting-ch", "Waiting for Companies House's answer..."), "info");
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
    title: window.siteText("ch.email.record-title", "Change of registered email address"),
    companyNumber: filing.companyNumber,
    transaction,
    details: [[window.siteText("ch.email.record-new-address", "New registered email address"), filing.registeredEmailAddress]],
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
    window.showStatus(window.siteText("ch.narrate-sending-change", "Sending the change to Companies House..."), "info");
    if (!filing.transactionId) {
      const transaction = await window.openCompaniesHouseTransaction(filing.companyNumber, "Change of registered email address");
      filing.transactionId = transaction.transactionId;
      savePendingFiling();
    }

    if (!filing.resourceAdded) {
      await window.putRegisteredEmailAddress(filing.transactionId, {
        registeredEmailAddress: filing.registeredEmailAddress,
        acceptAppropriateEmailAddressStatement: filing.acceptAppropriateEmailAddressStatement,
      });
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
  document.getElementById("emailAddressForm").reset();
  document.getElementById("validationErrors").style.display = "none";
  document.getElementById("filingRecord").replaceChildren();
  document.getElementById("startAgainBtn").style.display = "none";
  document.getElementById("checkAgainBtn").style.display = "none";
  hideStatus();
  showView("companyView");
}

// Resume a filing left pending across an OAuth authorise round trip, whenever the page
// loads with both a pending filing and a usable token. Two return points share this key:
// the eligibility check (no registeredEmailAddress saved yet) and the filing sequence
// itself (the form was already filled in), so route to whichever step redirected.
async function resumePendingFilingIfReady() {
  const pending = loadPendingFiling();
  if (!pending) return;

  filing = pending;
  const scope = window.companiesHouseScope(filing.companyNumber, RESOURCE);
  if (!window.hasUsableCompaniesHouseToken(scope)) return;

  sessionStorage.removeItem("currentActivity");

  if (filing.registeredEmailAddress) {
    runFilingSequence();
  } else {
    await checkEligibilityAndProceed();
  }
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("emailAddressForm").addEventListener("submit", handleFormSubmit);
document.getElementById("submitFilingBtn").addEventListener("click", runFilingSequence);
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
document.getElementById("checkAgainBtn").addEventListener("click", checkTransactionAgain);

if (window.__submitReady__) {
  resumePendingFilingIfReady();
} else {
  document.addEventListener("submit-ready", resumePendingFilingIfReady, { once: true });
}
