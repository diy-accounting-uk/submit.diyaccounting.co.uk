// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

window.selfEmploymentExpenses.mountFields(document.getElementById("expenseFields"));

// Global variables
let searchCriteriaHidden = false;

// In a cumulative year (2025-26 onwards) the money fields hold a running total for the
// year so far rather than one quarter's figures, the period dates are optional, and
// there is a current total worth loading before the customer edits it. Below the
// boundary every field behaves as it always has.
function updateSubmissionModelUI() {
  const taxYearValue = document.getElementById("taxYear").value.trim();
  const periodStartDateInput = document.getElementById("periodStartDate");
  const periodEndDateInput = document.getElementById("periodEndDate");
  const periodDatesHint = document.getElementById("periodDates-hint");
  const cumulativeMoneyNote = document.getElementById("cumulativeMoneyNote");
  const turnoverHint = document.getElementById("turnover-hint");
  const loadCurrentTotalGroup = document.getElementById("loadCurrentTotalGroup");

  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYearValue) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYearValue) === "cumulative";

  periodStartDateInput.required = !isCumulative;
  periodEndDateInput.required = !isCumulative;
  periodDatesHint.textContent = isCumulative
    ? "Leave both dates blank if this business reports annually. Fill them in only if you are reporting a quarter."
    : "HMRC identifies this quarter by its start and end date.";

  cumulativeMoneyNote.style.display = isCumulative ? "block" : "none";
  ["turnover", "otherIncome", ...window.selfEmploymentExpenses.EXPENSE_IDS, ...window.selfEmploymentExpenses.DISALLOWABLE_IDS].forEach(
    (fieldId) => {
      const label = document.querySelector(`label[for="${fieldId}"]`);
      if (!label) return;
      const baseText = label.dataset.baseLabel || label.textContent;
      label.dataset.baseLabel = baseText;
      label.textContent = isCumulative ? `${baseText} (year to date)` : baseText;
    },
  );
  turnoverHint.textContent = isCumulative
    ? "The total turnover for the tax year so far, up to the period end date above. Enter 0 if none yet."
    : "The takings, fees, sales or money earned by the business for this period. Enter 0 if none.";

  loadCurrentTotalGroup.style.display = isCumulative ? "block" : "none";
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
  sessionStorage.removeItem("pendingSelfEmploymentPeriodRequest");
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");

  showSearchCriteria();
  document.getElementById("selfEmploymentPeriodResults").style.display = "none";
  hideStatus();
  console.log("Request cancelled, session data cleared");
}

function initializePage() {
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");

  if (hmrcAccount === "synthetic") {
    const syntheticIndicator = document.getElementById("syntheticIndicator");
    if (syntheticIndicator) {
      syntheticIndicator.classList.add("visible");
    }
    const testDataLink = document.getElementById("testDataLink");
    if (testDataLink) {
      testDataLink.classList.add("visible");
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
  if (!accessToken) {
    console.log("OAuth callback handler (no accessToken found)");
    return;
  }
  if (sessionStorage.getItem("pendingSelfEmploymentLoadTotalRequest")) {
    console.log("OAuth callback handler (resuming load current total)");
    continueLoadCurrentTotal();
  } else {
    console.log("OAuth callback handler (accessToken found)");
    continuePeriodSubmission();
  }
}

// Fetches the cumulative model's single running total for the tax year, the starting
// point a customer edits to reach the new total, rather than a blank quarter's form.
async function fetchCurrentTotal(nino, businessId, taxYear, accessToken) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
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
    pollSuccessMessage: "Current total loaded.",
    pollErrorMessage: "Failed to load the current total.",
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(hmrcErrorMessage(result, "Failed to load the current total"));
    error.status = response.status;
    throw error;
  }
  return result;
}

function applyCurrentTotal(periodSummary) {
  const income = periodSummary?.periodIncome || {};
  const expenses = periodSummary?.periodExpenses || {};
  const disallowable = periodSummary?.periodDisallowableExpenses || {};
  if (income.turnover !== undefined) document.getElementById("turnover").value = income.turnover;
  if (income.other !== undefined) document.getElementById("otherIncome").value = income.other;
  window.selfEmploymentExpenses.EXPENSE_IDS.forEach((id) => {
    if (expenses[id] !== undefined) document.getElementById(id).value = expenses[id];
  });
  window.selfEmploymentExpenses.DISALLOWABLE_IDS.forEach((id) => {
    if (disallowable[id] !== undefined) document.getElementById(id).value = disallowable[id];
  });
  showStatus("Loaded your current year-to-date total from HMRC. Edit the figures below to the new total.", "info");
}

async function continueLoadCurrentTotal() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingSelfEmploymentLoadTotalRequest") || "null");
    if (!pendingRequest) return;

    showLoading();
    hideStatus();

    const result = await fetchCurrentTotal(pendingRequest.nino, pendingRequest.businessId, pendingRequest.taxYear, accessToken);
    applyCurrentTotal(result);

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingSelfEmploymentLoadTotalRequest");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    if (error.status === 404) {
      showStatus("HMRC has no total on file yet for this tax year. Enter the figures for the year so far.", "info");
    } else if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please try loading the total again.", "error");
    } else {
      showStatus(`Failed to load the current total: ${error.message}`, "error");
    }
    sessionStorage.removeItem("pendingSelfEmploymentLoadTotalRequest");
    sessionStorage.removeItem("oauth_state");
  } finally {
    hideLoading();
  }
}

async function handleLoadCurrentTotal() {
  const nino = document.getElementById("nino").value.replace(/\s+/g, "").toUpperCase();
  const businessId = document.getElementById("businessId").value.trim();
  const taxYear = document.getElementById("taxYear").value.trim();

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;

  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;

  if (!scopeSufficient) {
    if (accessToken && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    try {
      showLoading();
      showStatus("Initiating HMRC authentication...", "info");

      const state = generateRandomState();
      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingSelfEmploymentLoadTotalRequest", JSON.stringify({ nino, businessId, taxYear }));
      sessionStorage.setItem("currentActivity", `${location.pathname}`);

      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:self-assessment";
      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
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
      const result = await fetchCurrentTotal(nino, businessId, taxYear, accessToken);
      applyCurrentTotal(result);
    } catch (error) {
      if (error.status === 404) {
        showStatus("HMRC has no total on file yet for this tax year. Enter the figures for the year so far.", "info");
      } else {
        showStatus(`Failed to load the current total: ${error.message}`, "error");
      }
    } finally {
      hideLoading();
    }
  }
}

function readPeriodData(source) {
  const expenses = window.selfEmploymentExpenses.buildPeriodExpenses((id) => source[id], window.parseMoneyInput);
  if (expenses.problem) throw new Error(expenses.problem);
  return {
    nino: (source.nino || "").replace(/\s+/g, "").toUpperCase(),
    businessId: (source.businessId || "").trim(),
    taxYear: (source.taxYear || "").trim(),
    periodStartDate: source.periodStartDate || undefined,
    periodEndDate: source.periodEndDate || undefined,
    periodIncome: {
      turnover: window.parseMoneyInput(source.turnover) ?? 0,
      other: window.parseMoneyInput(source.otherIncome) ?? 0,
    },
    periodExpenses: expenses.periodExpenses,
    periodDisallowableExpenses: expenses.periodDisallowableExpenses,
  };
}

async function submitPeriod(periodData, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();

  const requestHeaders = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...govClientHeaders,
  };
  // Gov-Test-Scenario is a real HTTP header on every write endpoint (see submitVat's
  // shape), never a query parameter - it becomes the header HMRC itself reads.
  if (testScenario) requestHeaders["Gov-Test-Scenario"] = testScenario;

  const hmrcAccount = sessionStorage.getItem("hmrcAccount");
  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }

  const response = await window.authorizedFetch("/api/v1/hmrc/itsa/self-employment/period", {
    method: "POST",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    body: JSON.stringify({ ...periodData, runFraudPreventionHeaderValidation }),
    pollPendingMessage: "Still processing...",
    pollSuccessMessage: "Quarterly update filed.",
    pollErrorMessage: "Failed to file the quarterly update.",
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(hmrcErrorMessage(result, "Failed to file the quarterly update"));
    error.status = response.status;
    error.reason = result.reason;
    throw error;
  }
  return result;
}

async function continuePeriodSubmission() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingSelfEmploymentPeriodRequest") || "null");

    if (!pendingRequest) {
      console.log("No pending self-employment period request found");
      return;
    }

    hideSearchCriteria();
    showLoading();
    hideStatus();
    showStatus("Filing quarterly update...", "info");

    const result = await submitPeriod(
      pendingRequest.periodData,
      pendingRequest.testScenario,
      pendingRequest.runFraudPreventionHeaderValidation,
      accessToken,
    );

    displayResult(result);
    document.getElementById("selfEmploymentPeriodResults").style.display = "block";
    hideStatus();
    window.dispatchEvent(new CustomEvent("bundle-changed"));

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingSelfEmploymentPeriodRequest");
    sessionStorage.removeItem("oauth_state");
    console.log("Quarterly update filed successfully");
  } catch (error) {
    console.error("Error filing quarterly update:", error);
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please re-authenticate.", "error");
    } else if (error.status === 403 && error.reason === "tokens_exhausted") {
      hideStatus();
      window.SubmissionCost?.refresh();
    } else {
      showStatus(`Failed to file the quarterly update: ${error.message}`, "error");
    }
    showSearchCriteria();
    sessionStorage.removeItem("pendingSelfEmploymentPeriodRequest");
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

  if (window.formErrors.reportMoneyProblems()) return;

  const formData = new FormData(event.target);
  let periodData;
  try {
    periodData = readPeriodData({
      nino: formData.get("nino").replace(/\s+/g, "").toUpperCase(),
      businessId: formData.get("businessId"),
      taxYear: formData.get("taxYear"),
      periodStartDate: formData.get("periodStartDate"),
      periodEndDate: formData.get("periodEndDate"),
      turnover: formData.get("turnover"),
      otherIncome: formData.get("otherIncome"),
      ...Object.fromEntries(
        [...window.selfEmploymentExpenses.EXPENSE_IDS, ...window.selfEmploymentExpenses.DISALLOWABLE_IDS].map((id) => [
          id,
          formData.get(id),
        ]),
      ),
    });
  } catch (error) {
    showStatus(error.message, "error");
    return;
  }
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;

  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(periodData.taxYear) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(periodData.taxYear) === "cumulative";

  if (!window.formErrors.requireFields(isCumulative ? ["turnover"] : ["periodStartDate", "periodEndDate", "turnover"])) return;

  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;

  if (!scopeSufficient) {
    if (accessToken) {
      console.log("HMRC access token exists but scope insufficient, clearing and re-authorizing");
      if (window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    }
    try {
      showLoading();
      showStatus("Initiating HMRC authentication...", "info");

      const state = generateRandomState();
      const requestData = { periodData, testScenario, runFraudPreventionHeaderValidation };

      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingSelfEmploymentPeriodRequest", JSON.stringify(requestData));
      sessionStorage.setItem("currentActivity", currentActivity);

      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "write:self-assessment";

      const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");

      showStatus(`Redirecting to HMRC for authentication at ${authResponseUrl}...`, "info");

      try {
        window.__correlation?.prepareRedirect?.();
      } catch {}
      window.location.href = authResponseUrl;
    } catch (error) {
      console.error("Authentication error:", error);
      showStatus(`Authentication failed: ${error.message}`, "error");
      hideLoading();
    }
  } else {
    try {
      showLoading();
      hideStatus();
      showStatus("Filing quarterly update...", "info");

      const result = await submitPeriod(periodData, testScenario, runFraudPreventionHeaderValidation, accessToken);

      displayResult(result);
      document.getElementById("selfEmploymentPeriodResults").style.display = "block";
      hideStatus();
      window.dispatchEvent(new CustomEvent("bundle-changed"));
    } catch (error) {
      console.error("Error filing quarterly update:", error);
      if (error.status === 401) {
        sessionStorage.removeItem("hmrcAccessToken");
        sessionStorage.removeItem("hmrcTokenScope");
        showStatus("Access token expired. Please try again.", "error");
      } else if (error.status === 403 && error.reason === "tokens_exhausted") {
        hideStatus();
        window.SubmissionCost?.refresh();
      } else {
        showStatus(`Failed to file the quarterly update: ${error.message}`, "error");
      }
    } finally {
      hideLoading();
    }
  }
}

function displayResult(result) {
  const periodIdResult = document.getElementById("periodIdResult");
  periodIdResult.textContent = result?.periodId || "-";
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", () => {
  showSearchCriteria();
});

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  cancelRequest();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("itsaSelfEmploymentPeriodForm");
  const resultsContainer = document.getElementById("selfEmploymentPeriodResults");
  form.reset();
  resultsContainer.style.display = "none";
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("taxYear").addEventListener("input", updateSubmissionModelUI);

document.getElementById("loadCurrentTotalBtn")?.addEventListener("click", handleLoadCurrentTotal);

document.getElementById("itsaSelfEmploymentPeriodForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  console.log("JS block started loading: DOMContentLoaded event handler");
  initializePage();
  updateSubmissionModelUI();
  handleOAuthCallback();
  console.log("JS block finished loading: DOMContentLoaded event handler");
});

console.log("JS block finished loading.");

window.booksImport.mount(document.getElementById("booksImport"), { kind: "itsa-quarterly" });

document.getElementById("addTestDataLink").addEventListener("click", (event) => {
  event.preventDefault();
  window.testDataGenerator.populateSelfEmploymentPeriodForm();
});
