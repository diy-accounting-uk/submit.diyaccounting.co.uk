// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
  document.getElementById("retrieveBtn").textContent = isCumulative ? "Show current total" : "List period summaries";
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
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");

  showSearchCriteria();
  document.getElementById("periodsResults").style.display = "none";
  hideStatus();
}

function initializePage() {
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");

  if (hmrcAccount === "synthetic") {
    const syntheticIndicator = document.getElementById("syntheticIndicator");
    if (syntheticIndicator) {
      syntheticIndicator.classList.add("visible");
    }
  }

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
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  if (accessToken) {
    continuePeriodsRetrieval();
  }
}

async function fetchPeriods(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

  const govClientHeaders = await getGovClientHeaders();

  const requestHeaders = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
  };

  const hmrcAccount = sessionStorage.getItem("hmrcAccount");
  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }

  const response = await window.authorizedFetch(`/api/v1/hmrc/itsa/self-employment/periods?${params}`, {
    method: "GET",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    pollPendingMessage: "Still processing...",
    pollSuccessMessage: "Period summaries retrieved.",
    pollErrorMessage: "Failed to retrieve period summaries.",
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(hmrcErrorMessage(result, "Failed to retrieve period summaries"));
    error.status = response.status;
    throw error;
  }
  return result;
}

// A cumulative tax year retrieves the single running total from the same endpoint the
// period pages use, rather than listing submissions that do not exist as a set.
async function fetchCurrentTotal(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

  const govClientHeaders = await getGovClientHeaders();

  const requestHeaders = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
  };
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");
  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }

  const response = await window.authorizedFetch(`/api/v1/hmrc/itsa/self-employment/period?${params}`, {
    method: "GET",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    pollPendingMessage: "Still processing...",
    pollSuccessMessage: "Current total retrieved.",
    pollErrorMessage: "Failed to retrieve the current total.",
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(hmrcErrorMessage(result, "Failed to retrieve the current total"));
    error.status = response.status;
    throw error;
  }
  return result;
}

async function continuePeriodsRetrieval() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingSelfEmploymentPeriodsRequest") || "null");

    if (!pendingRequest) return;

    hideSearchCriteria();
    showLoading();
    hideStatus();
    showStatus("Retrieving period summaries...", "info");

    if (isCumulativeTaxYear(pendingRequest.taxYear)) {
      const result = await fetchCurrentTotal(
        pendingRequest.nino,
        pendingRequest.businessId,
        pendingRequest.taxYear,
        pendingRequest.testScenario,
        pendingRequest.runFraudPreventionHeaderValidation,
        accessToken,
      );
      displayCurrentTotal(result);
    } else {
      const result = await fetchPeriods(
        pendingRequest.nino,
        pendingRequest.businessId,
        pendingRequest.taxYear,
        pendingRequest.testScenario,
        pendingRequest.runFraudPreventionHeaderValidation,
        accessToken,
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
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please re-authenticate.", "error");
    } else {
      showStatus(`Failed to retrieve period summaries: ${error.message}`, "error");
    }
    showSearchCriteria();
    sessionStorage.removeItem("pendingSelfEmploymentPeriodsRequest");
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcTokenScope");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("hmrcAccount");
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

  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;

  if (!scopeSufficient) {
    if (accessToken) {
      if (window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    }
    try {
      showLoading();
      showStatus("Initiating HMRC authentication...", "info");

      const state = generateRandomState();
      const requestData = { nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation };

      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingSelfEmploymentPeriodsRequest", JSON.stringify(requestData));
      sessionStorage.setItem("currentActivity", currentActivity);

      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:self-assessment";

      const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");

      showStatus(`Redirecting to HMRC for authentication at ${authResponseUrl}...`, "info");

      try {
        window.__correlation?.prepareRedirect?.();
      } catch {}
      window.location.href = authResponseUrl;
    } catch (error) {
      showStatus(`Authentication failed: ${error.message}`, "error");
      hideLoading();
    }
  } else {
    try {
      showLoading();
      hideStatus();
      showStatus("Retrieving period summaries...", "info");

      if (isCumulativeTaxYear(taxYear)) {
        const result = await fetchCurrentTotal(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken);
        displayCurrentTotal(result);
      } else {
        const result = await fetchPeriods(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken);
        displayPeriods(result.periods || []);
      }
      document.getElementById("periodsResults").style.display = "block";
      hideStatus();
    } catch (error) {
      if (error.status === 401) {
        sessionStorage.removeItem("hmrcAccessToken");
        sessionStorage.removeItem("hmrcTokenScope");
        showStatus("Access token expired. Please try again.", "error");
      } else if (error.status === 404 && isCumulativeTaxYear(taxYear)) {
        displayCurrentTotal(null);
        document.getElementById("periodsResults").style.display = "block";
      } else {
        showStatus(`Failed to retrieve period summaries: ${error.message}`, "error");
      }
    } finally {
      hideLoading();
    }
  }
}

function displayPeriods(periods) {
  const tableContainer = document.getElementById("periodsTable");
  if (!periods || periods.length === 0) {
    tableContainer.innerHTML = '<p class="no-data">No period summaries found for the specified business and tax year.</p>';
    return;
  }

  window.HmrcFieldTable.mountResultsTable(
    tableContainer,
    [{ label: "Period ID" }, { label: "Start date" }, { label: "End date" }],
    periods.map((period) => [period.periodId, period.periodStartDate, period.periodEndDate]),
  );
}

function displayCurrentTotal(periodSummary) {
  const tableContainer = document.getElementById("periodsTable");
  const dates = periodSummary?.periodDates || {};
  const income = periodSummary?.periodIncome || {};
  const expenses = periodSummary?.periodExpenses || {};

  if (!periodSummary) {
    tableContainer.innerHTML = '<p class="no-data">HMRC has no total on file yet for this tax year.</p>';
    return;
  }

  window.HmrcFieldTable.mountResultsTable(
    tableContainer,
    [
      { label: "Reported to" },
      { label: "Turnover (year to date)", kind: "money" },
      { label: "Other income (year to date)", kind: "money" },
      { label: "Cost of goods (year to date)", kind: "money" },
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
