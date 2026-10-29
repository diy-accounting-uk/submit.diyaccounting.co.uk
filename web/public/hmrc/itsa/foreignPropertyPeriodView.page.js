// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("submissionId", document.getElementById("submissionId"));

const PENDING_KEY = "pendingForeignPropertyPeriodViewRequest";

const JOURNEY_LINKS = [
  { href: "foreignPropertyPeriods.html", text: "See the other period summaries" },
  { href: "dashboard.html", text: "Back to Income Tax" },
];

function isCumulativeTaxYear(taxYear) {
  return (
    window.itsaSubmissionModel.isValidTaxYear(taxYear) && window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "cumulative"
  );
}

// A cumulative tax year (2025-26 onwards) retrieves the single running total addressed by taxYear
// alone, so there is no submissionId to enter or require.
function updateSubmissionModelUI() {
  const cumulative = isCumulativeTaxYear(document.getElementById("taxYear").value.trim());
  document.getElementById("cumulativeViewNote").style.display = cumulative ? "block" : "none";
  document.getElementById("submissionIdGroup").style.display = cumulative ? "none" : "block";
  document.getElementById("submissionId").required = !cumulative;
}

function hideSearchCriteria() {
  document.getElementById("searchCriteriaContainer").style.display = "none";
  document.getElementById("toggleSearchCriteriaBtn").style.display = "inline-block";
  document.getElementById("cancelRequestBtn").style.display = "inline-block";
}

function showSearchCriteria() {
  document.getElementById("searchCriteriaContainer").style.display = "block";
  document.getElementById("toggleSearchCriteriaBtn").style.display = "none";
  document.getElementById("cancelRequestBtn").style.display = "none";
}

function initializePage() {
  if (sessionStorage.getItem("hmrcAccount") === "synthetic") {
    document.getElementById("syntheticIndicator")?.classList.add("visible");
  }
  const devSection = document.getElementById("developerSection");
  function updateDeveloperSectionVisibility() {
    const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
    if (devSection) devSection.style.display = developerModeEnabled ? "block" : "none";
  }
  updateDeveloperSectionVisibility();
  window.addEventListener("developer-mode-changed", updateDeveloperSectionVisibility);
}

function readCriteria() {
  return {
    nino: document.getElementById("nino").value.replace(/\s+/g, "").toUpperCase(),
    businessId: document.getElementById("businessId").value.trim(),
    taxYear: document.getElementById("taxYear").value.trim(),
    submissionId: document.getElementById("submissionId").value.trim() || undefined,
    testScenario: document.getElementById("testScenario")?.value || null,
    runFraudPreventionHeaderValidation: document.getElementById("runFraudPreventionHeaderValidation")?.checked || false,
  };
}

// Neither the dated nor the cumulative retrieve is stateful in the sandbox: both answer not-found
// with no Gov-Test-Scenario. A synthetic account without a chosen scenario sends the named one for
// the tax year's model; a live account sends none.
async function fetchPeriod(criteria, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const scenario = window.resolveSyntheticTestScenario(
    criteria.testScenario,
    sessionStorage.getItem("hmrcAccount"),
    isCumulativeTaxYear(criteria.taxYear) ? "FOREIGN_PROPERTY_FULL_EXPENSES" : "FOREIGN_PROPERTY",
  );
  return window.getForeignPropertyPeriod(criteria, accessToken, govClientHeaders, criteria.runFraudPreventionHeaderValidation, scenario);
}

async function displayPeriod(period, query = {}) {
  const { periodCopyHtml, mountCopy } = await import("../../lib/itsa-submission-record.js");
  mountCopy(
    document.getElementById("periodDetails"),
    periodCopyHtml({
      kind: "foreign-property",
      period,
      nino: query.nino,
      businessId: query.businessId,
      taxYear: query.taxYear,
      periodId: query.submissionId,
      idLabel: "Submission ID",
      retrievedAt: new Date().toISOString(),
      links: JOURNEY_LINKS,
    }),
  );
}

async function runRequest(criteria, accessToken) {
  try {
    showLoading();
    hideStatus();
    showStatus("Retrieving period summary...", "info");
    const result = await fetchPeriod(criteria, accessToken);
    await displayPeriod(result, criteria);
    document.getElementById("periodViewResults").style.display = "block";
    hideStatus();
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please try again.", "error");
    } else {
      showStatus(`Failed to retrieve the period summary: ${error.message}`, "error");
    }
    showSearchCriteria();
  } finally {
    hideLoading();
  }
}

async function continueAfterOAuth() {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
  if (!accessToken || !pending) return;
  sessionStorage.removeItem(PENDING_KEY);
  sessionStorage.removeItem("currentActivity");
  sessionStorage.removeItem("oauth_state");
  hideSearchCriteria();
  await runRequest(pending, accessToken);
}

async function handleFormSubmission(event) {
  event.preventDefault();
  const cumulative = isCumulativeTaxYear(document.getElementById("taxYear").value.trim());
  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"].concat(cumulative ? [] : ["submissionId"]))) return;
  const criteria = readCriteria();

  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;
  if (scopeSufficient) {
    await runRequest(criteria, accessToken);
    return;
  }
  if (accessToken && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
  try {
    showLoading();
    showStatus("Initiating HMRC authentication...", "info");
    const state = generateRandomState();
    sessionStorage.setItem("oauth_state", state);
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(criteria));
    sessionStorage.setItem("currentActivity", `${location.pathname}`);
    const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:self-assessment";
    const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(
      state,
      oauthScope,
      sessionStorage.getItem("hmrcAccount") || "live",
    );
    try {
      window.__correlation?.prepareRedirect?.();
    } catch {}
    window.location.href = authResponseUrl;
  } catch (error) {
    showStatus(`Authentication failed: ${error.message}`, "error");
    hideLoading();
  }
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", showSearchCriteria);

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  sessionStorage.removeItem(PENDING_KEY);
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");
  showSearchCriteria();
  document.getElementById("periodViewResults").style.display = "none";
  hideStatus();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("itsaForeignPropertyPeriodViewForm").reset();
  document.getElementById("periodViewResults").style.display = "none";
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("taxYear").addEventListener("input", updateSubmissionModelUI);
document.getElementById("itsaForeignPropertyPeriodViewForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  continueAfterOAuth();
});
