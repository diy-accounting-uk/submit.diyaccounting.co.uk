// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

const PENDING_KEY = "pendingForeignPropertyPeriodsRequest";

// A cumulative tax year (2025-26 onwards) holds one running total, so this page shows that total
// instead of a list of submissions.
function isCumulativeTaxYear(taxYear) {
  return (
    window.itsaSubmissionModel.isValidTaxYear(taxYear) && window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "cumulative"
  );
}

function updateSubmissionModelUI() {
  const cumulative = isCumulativeTaxYear(document.getElementById("taxYear").value.trim());
  document.getElementById("cumulativeListNote").style.display = cumulative ? "block" : "none";
  document.getElementById("retrieveBtn").textContent = cumulative ? "Show current total" : "List period summaries";
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
    testScenario: document.getElementById("testScenario")?.value || null,
    runFraudPreventionHeaderValidation: document.getElementById("runFraudPreventionHeaderValidation")?.checked || false,
  };
}

// HMRC's cumulative retrieve is not stateful in the sandbox: with no Gov-Test-Scenario it answers
// not-found. A synthetic account without a chosen scenario sends the named one; a live account sends none.
async function fetchResult(criteria, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  if (isCumulativeTaxYear(criteria.taxYear)) {
    const scenario = window.resolveSyntheticTestScenario(
      criteria.testScenario,
      sessionStorage.getItem("hmrcAccount"),
      "FOREIGN_PROPERTY_FULL_EXPENSES",
    );
    return window.getForeignPropertyPeriod(criteria, accessToken, govClientHeaders, criteria.runFraudPreventionHeaderValidation, scenario);
  }
  return window.getPropertyPeriods(
    criteria.nino,
    criteria.businessId,
    criteria.taxYear,
    accessToken,
    govClientHeaders,
    criteria.runFraudPreventionHeaderValidation,
    criteria.testScenario,
  );
}

async function runRequest(criteria, accessToken) {
  try {
    showLoading();
    hideStatus();
    showStatus("Retrieving period summaries...", "info");
    const result = await fetchResult(criteria, accessToken);
    if (isCumulativeTaxYear(criteria.taxYear)) displayCurrentTotal(result);
    else displayPeriods(result.periods || []);
    document.getElementById("periodsResults").style.display = "block";
    hideStatus();
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please try again.", "error");
    } else if (error.status === 404 && isCumulativeTaxYear(criteria.taxYear)) {
      displayCurrentTotal(null);
      document.getElementById("periodsResults").style.display = "block";
      hideStatus();
    } else {
      showStatus(`Failed to retrieve period summaries: ${error.message}`, "error");
    }
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
  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;
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

// Remembers the chosen period so the view and amend pages open with its Submission ID filled in.
function usePeriod(submissionId) {
  window.CarriedIdentifiers.remember("submissionId", submissionId);
  document.getElementById("periodNextSteps").hidden = false;
  showStatus(`Period ${submissionId} is chosen. View it or amend it with the links below the list.`, "info");
}

function displayPeriods(periods) {
  const tableContainer = document.getElementById("periodsTable");
  if (!periods || periods.length === 0) {
    tableContainer.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "no-data",
        textContent: "No period summaries found for the specified business and tax year.",
      }),
    );
    return;
  }
  window.HmrcFieldTable.mountResultsTable(
    tableContainer,
    [{ label: "Submission ID" }, { label: "Start date" }, { label: "End date" }, { label: "Next step", kind: "action" }],
    periods.map((period) => [
      period.submissionId,
      period.fromDate,
      period.toDate,
      { label: "Use this period", onClick: () => usePeriod(period.submissionId) },
    ]),
  );
}

function expensesTotal(expenses) {
  if (typeof expenses?.consolidatedExpenses === "number") return expenses.consolidatedExpenses;
  const amounts = Object.values(expenses || {}).filter((value) => typeof value === "number");
  return amounts.length > 0 ? amounts.reduce((sum, value) => sum + value, 0) : undefined;
}

function entryName(entry) {
  if (entry.countryCode) return window.countryCodes.countryName(entry.countryCode);
  return entry.propertyId ? `Property ${entry.propertyId}` : undefined;
}

function displayCurrentTotal(periodSummary) {
  const tableContainer = document.getElementById("periodsTable");
  const entries = periodSummary?.foreignProperty || [];
  if (!periodSummary || entries.length === 0) {
    tableContainer.replaceChildren(
      Object.assign(document.createElement("p"), { className: "no-data", textContent: "HMRC has no total on file yet for this tax year." }),
    );
    return;
  }
  window.HmrcFieldTable.mountResultsTable(
    tableContainer,
    [
      { label: "Country or property" },
      { label: "Reported to" },
      { label: "Rental income (year to date)", kind: "money" },
      { label: "Other income (year to date)", kind: "money" },
      { label: "Expenses (year to date)", kind: "money" },
    ],
    entries.map((entry) => [
      entryName(entry),
      periodSummary.toDate,
      entry.income?.rentIncome?.rentAmount,
      entry.income?.otherPropertyIncome,
      expensesTotal(entry.expenses),
    ]),
  );
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
  document.getElementById("periodsResults").style.display = "none";
  hideStatus();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("itsaForeignPropertyPeriodsForm").reset();
  document.getElementById("periodsResults").style.display = "none";
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("taxYear").addEventListener("input", updateSubmissionModelUI);
document.getElementById("itsaForeignPropertyPeriodsForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  continueAfterOAuth();
});
