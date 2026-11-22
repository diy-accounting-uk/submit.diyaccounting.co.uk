// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives the text in the reader's language; without it (in a unit test) the English stands.
const siteText = (id, english, values) =>
  window.siteText
    ? window.siteText(id, english, values)
    : english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

let searchCriteriaHidden = false;

// A cumulative tax year (2025-26 onwards) has no list of submissions to enumerate - it
// holds one running total - so this page shows that total instead of a list.
function isCumulativeTaxYear(taxYearValue) {
  return (
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYearValue) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYearValue) === "cumulative"
  );
}

function updateSubmissionModelUI() {
  const taxYearValue = document.getElementById("taxYear").value.trim();
  const isCumulative = isCumulativeTaxYear(taxYearValue);
  document.getElementById("cumulativeListNote").style.display = isCumulative ? "block" : "none";
  document.getElementById("retrieveBtn").textContent = isCumulative
    ? siteText("itsa.show-current-total", "Show current total")
    : siteText("itsa.list-period-summaries", "List period summaries");
}

function hideSearchCriteria() {
  const container = document.getElementById("searchCriteriaContainer");
  const toggleBtn = document.getElementById("toggleSearchCriteriaBtn");
  const cancelBtn = document.getElementById("cancelRequestBtn");
  if (container && toggleBtn) {
    container.style.display = "none";
    toggleBtn.style.display = "inline-block";
    if (cancelBtn) cancelBtn.style.display = "inline-block";
    searchCriteriaHidden = true;
  }
}

function showSearchCriteria() {
  const container = document.getElementById("searchCriteriaContainer");
  const toggleBtn = document.getElementById("toggleSearchCriteriaBtn");
  const cancelBtn = document.getElementById("cancelRequestBtn");
  if (container && toggleBtn) {
    container.style.display = "block";
    toggleBtn.style.display = "none";
    if (cancelBtn) cancelBtn.style.display = "none";
    searchCriteriaHidden = false;
  }
}

function cancelRequest() {
  sessionStorage.removeItem("pendingSelfEmploymentPeriodsRequest");
  window.hmrcScopeCheck.clearHmrcToken();
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("currentActivity");

  showSearchCriteria();
  document.getElementById("periodsResults").style.display = "none";
  hideStatus();
}

function initializePage() {
  window.showHmrcStatusForService(
    siteText(
      "itsa.status-sandbox-text",
      "This runs against HMRC's sandbox. Nothing you send reaches your real HMRC record. Production waits on HMRC's recognition of our software after its 2027 update.",
    ),
  );
  window.showSyntheticIndicatorForAccount();

  const devSection = document.getElementById("developerSection");

  function updateDeveloperSectionVisibility() {
    const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
    if (devSection) {
      devSection.style.display = developerModeEnabled ? "block" : "none";
    }
  }

  updateDeveloperSectionVisibility();
  window.addEventListener("developer-mode-changed", updateDeveloperSectionVisibility);
}

function handleOAuthCallback() {
  const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
  if (hmrcGrantId) {
    continuePeriodsRetrieval();
  }
}

async function fetchPeriods(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

  const govClientHeaders = await getGovClientHeaders();

  const requestHeaders = {
    "x-mcp-hmrc-grant": hmrcGrantId,
    "Content-Type": "application/json",
    ...govClientHeaders,
  };

  const hmrcAccount = await window.readHmrcAccount();
  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }

  const response = await window.authorizedFetch(`/api/v1/hmrc/itsa/self-employment/periods?${params}`, {
    method: "GET",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    pollPendingMessage: siteText("widget.still-processing", "Still processing..."),
    pollSuccessMessage: siteText("itsa.periods-retrieved", "Period summaries retrieved."),
    pollErrorMessage: siteText("itsa.periods-retrieve-failed", "Failed to retrieve period summaries."),
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      hmrcErrorMessage(result, siteText("itsa.periods-retrieve-failed-fallback", "Failed to retrieve period summaries")),
    );
    error.status = response.status;
    throw error;
  }
  return result;
}

// A cumulative tax year retrieves the single running total from the same endpoint the
// period pages use, rather than listing submissions that do not exist as a set.
async function fetchCurrentTotal(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

  const govClientHeaders = await getGovClientHeaders();

  const requestHeaders = {
    "x-mcp-hmrc-grant": hmrcGrantId,
    "Content-Type": "application/json",
    ...govClientHeaders,
  };
  const hmrcAccount = await window.readHmrcAccount();
  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }

  const response = await window.authorizedFetch(`/api/v1/hmrc/itsa/self-employment/period?${params}`, {
    method: "GET",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    pollPendingMessage: siteText("widget.still-processing", "Still processing..."),
    pollSuccessMessage: siteText("itsa.current-total-retrieved", "Current total retrieved."),
    pollErrorMessage: siteText("itsa.current-total-retrieve-failed", "Failed to retrieve the current total."),
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      hmrcErrorMessage(result, siteText("itsa.current-total-retrieve-failed-fallback", "Failed to retrieve the current total")),
    );
    error.status = response.status;
    throw error;
  }
  return result;
}

async function continuePeriodsRetrieval() {
  try {
    const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingSelfEmploymentPeriodsRequest") || "null");

    if (!pendingRequest) return;

    hideSearchCriteria();
    showLoading();
    hideStatus();
    showStatus(siteText("itsa.periods-retrieving", "Retrieving period summaries..."), "info");

    if (isCumulativeTaxYear(pendingRequest.taxYear)) {
      const result = await fetchCurrentTotal(
        pendingRequest.nino,
        pendingRequest.businessId,
        pendingRequest.taxYear,
        pendingRequest.testScenario,
        pendingRequest.runFraudPreventionHeaderValidation,
        hmrcGrantId,
      );
      displayCurrentTotal(result);
    } else {
      const result = await fetchPeriods(
        pendingRequest.nino,
        pendingRequest.businessId,
        pendingRequest.taxYear,
        pendingRequest.testScenario,
        pendingRequest.runFraudPreventionHeaderValidation,
        hmrcGrantId,
      );
      displayPeriods(result.periods || []);
    }
    document.getElementById("periodsResults").style.display = "block";
    hideStatus();

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingSelfEmploymentPeriodsRequest");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    if (error.status === 401) {
      window.hmrcScopeCheck.clearHmrcToken();
      showStatus(siteText("itsa.token-expired-reauth", "Access token expired. Please re-authenticate."), "error");
    } else {
      showStatus(
        siteText("itsa.periods-retrieve-failed-reason", "Failed to retrieve period summaries: {reason}", { reason: error.message }),
        "error",
      );
    }
    showSearchCriteria();
    sessionStorage.removeItem("pendingSelfEmploymentPeriodsRequest");
    window.hmrcScopeCheck.clearHmrcToken();
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("currentActivity");
  } finally {
    hideLoading();
  }
}

async function handleFormSubmission(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const nino = formData.get("nino").replace(/\s+/g, "").toUpperCase();
  const businessId = formData.get("businessId").trim();
  const taxYear = formData.get("taxYear").trim();
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;

  const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
  const scopeSufficient = hmrcGrantId && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!hmrcGrantId;

  if (!scopeSufficient) {
    if (hmrcGrantId) {
      if (window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    }
    try {
      showLoading();
      showStatus(siteText("widget.hmrc-auth-starting", "Initiating HMRC authentication..."), "info");

      const state = generateRandomState();
      const requestData = { nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation };

      const hmrcAccount = await window.readHmrcAccount();
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingSelfEmploymentPeriodsRequest", JSON.stringify(requestData));
      sessionStorage.setItem("currentActivity", currentActivity);

      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:self-assessment";

      const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");

      showStatus(
        siteText("widget.hmrc-auth-redirecting", "Redirecting to HMRC for authentication at {url}...", { url: authResponseUrl }),
        "info",
      );

      try {
        window.__correlation?.prepareRedirect?.();
      } catch {}
      window.location.href = authResponseUrl;
    } catch (error) {
      showStatus(siteText("widget.hmrc-auth-failed", "Authentication failed: {reason}", { reason: error.message }), "error");
      hideLoading();
    }
  } else {
    try {
      showLoading();
      hideStatus();
      showStatus(siteText("itsa.periods-retrieving", "Retrieving period summaries..."), "info");

      if (isCumulativeTaxYear(taxYear)) {
        const result = await fetchCurrentTotal(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId);
        displayCurrentTotal(result);
      } else {
        const result = await fetchPeriods(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId);
        displayPeriods(result.periods || []);
      }
      document.getElementById("periodsResults").style.display = "block";
      hideStatus();
    } catch (error) {
      if (error.status === 401) {
        window.hmrcScopeCheck.clearHmrcToken();
        showStatus(siteText("itsa.token-expired-retry", "Access token expired. Please try again."), "error");
      } else if (error.status === 404 && isCumulativeTaxYear(taxYear)) {
        displayCurrentTotal(null);
        document.getElementById("periodsResults").style.display = "block";
      } else {
        showStatus(
          siteText("itsa.periods-retrieve-failed-reason", "Failed to retrieve period summaries: {reason}", { reason: error.message }),
          "error",
        );
      }
    } finally {
      hideLoading();
    }
  }
}

// Remembers the chosen period so the view and amend pages open with its Period ID filled in.
function usePeriod(periodId) {
  window.CarriedIdentifiers.remember("periodId", periodId);
  document.getElementById("periodNextSteps").hidden = false;
  showStatus(
    siteText("itsa.period-chosen", "Period {id} is chosen. View it or amend it with the links below the list.", { id: periodId }),
    "info",
  );
}

function noDataLine(text) {
  const line = document.createElement("p");
  line.className = "no-data";
  line.textContent = text;
  return line;
}

function displayPeriods(periods) {
  const tableContainer = document.getElementById("periodsTable");
  if (!periods || periods.length === 0) {
    tableContainer.replaceChildren(
      noDataLine(siteText("itsa.periods-none", "No period summaries found for the specified business and tax year.")),
    );
    return;
  }

  window.HmrcFieldTable.mountResultsTable(
    tableContainer,
    [
      { label: siteText("itsa.period-id", "Period ID") },
      { label: siteText("itsa.start-date", "Start date") },
      { label: siteText("itsa.end-date", "End date") },
      { label: siteText("itsa.next-step", "Next step"), kind: "action" },
    ],
    periods.map((period) => [
      period.periodId,
      period.periodStartDate,
      period.periodEndDate,
      { label: siteText("itsa.use-this-period", "Use this period"), onClick: () => usePeriod(period.periodId) },
    ]),
  );
}

function displayCurrentTotal(periodSummary) {
  const tableContainer = document.getElementById("periodsTable");
  const dates = periodSummary?.periodDates || {};
  const income = periodSummary?.periodIncome || {};
  const expenses = periodSummary?.periodExpenses || {};

  if (!periodSummary) {
    tableContainer.replaceChildren(
      noDataLine(siteText("itsa-se-amend.current-total-none", "HMRC has no total on file yet for this tax year.")),
    );
    return;
  }

  window.HmrcFieldTable.mountResultsTable(
    tableContainer,
    [
      { label: siteText("itsa.reported-to", "Reported to") },
      { label: siteText("itsa.turnover-ytd", "Turnover (year to date)"), kind: "money" },
      { label: siteText("itsa.other-income-ytd", "Other income (year to date)"), kind: "money" },
      { label: siteText("itsa.cost-of-goods-ytd", "Cost of goods (year to date)"), kind: "money" },
    ],
    [[dates.periodEndDate, income.turnover, income.other, expenses.costOfGoods]],
  );
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", () => {
  showSearchCriteria();
});

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  cancelRequest();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("itsaSelfEmploymentPeriodsForm");
  const resultsContainer = document.getElementById("periodsResults");
  form.reset();
  resultsContainer.style.display = "none";
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("taxYear").addEventListener("input", updateSubmissionModelUI);

document.getElementById("itsaSelfEmploymentPeriodsForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  handleOAuthCallback();
});
