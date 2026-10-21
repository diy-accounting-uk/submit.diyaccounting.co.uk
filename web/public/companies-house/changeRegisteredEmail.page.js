// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Change registered email address: companyView (with the eligibility check) -> formView ->
// reviewView -> resultView, with an authorise round trip through filingCallback.html
// whenever no usable Companies House token is already held.

const PENDING_KEY = "companiesHousePendingFiling";
const RESOURCE = "registered-email-address";

const ELIGIBILITY_STOP_MESSAGES = {
  INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS:
    "This company has no registered email address yet. This filing changes an existing address; it does not set the first one.",
  INVALID_COMPANY_STATUS: "This company's status blocks a registered email address change.",
  INVALID_COMPANY_TYPE: "This company's type is not covered by this filing.",
  COMPANY_NOT_FOUND: "That company number is not on the register.",
};

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
        ELIGIBILITY_STOP_MESSAGES[eligibility.eligibilityStatusCode] ||
        `This company is not eligible for a registered email address change (${eligibility.eligibilityStatusCode}).`;
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
    showStatus(error.message || "Failed to check registered email address eligibility.", "error");
    showView("companyView");
  } finally {
    hideLoading();
  }
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  if (!companyNumber) {
    showStatus("Please enter a company number.", "error");
    return;
  }

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
  const accepted = document.getElementById("acceptEmailStatement").checked;
  if (!accepted) {
    showStatus("You must confirm the section 88A(2) appropriate email address statement to continue.", "error");
    return;
  }

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
  const strong = document.createElement("strong");
  if (filings.some((entry) => entry.status === "rejected")) {
    strong.textContent = "Companies House rejected the change.";
  } else if (filings.length > 0 && filings.every((entry) => entry.status === "accepted")) {
    strong.textContent = "Companies House accepted the change.";
  } else {
    strong.textContent = "Companies House is still processing the change.";
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
  document.getElementById("emailAddressForm").reset();
  document.getElementById("validationErrors").style.display = "none";
  document.getElementById("startAgainBtn").style.display = "none";
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

if (window.__submitReady__) {
  resumePendingFilingIfReady();
} else {
  document.addEventListener("submit-ready", resumePendingFilingIfReady, { once: true });
}
