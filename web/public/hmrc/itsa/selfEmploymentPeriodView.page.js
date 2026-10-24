// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

// A cumulative tax year (2025-26 onwards) retrieves the single running total addressed
// by taxYear alone, so there is no periodId to enter or require.
function updateSubmissionModelUI() {
  const taxYearValue = document.getElementById("taxYear").value.trim();
  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYearValue) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYearValue) === "cumulative";

  document.getElementById("cumulativeViewNote").style.display = isCumulative ? "block" : "none";
  document.getElementById("periodIdGroup").style.display = isCumulative ? "none" : "block";
  document.getElementById("periodId").required = !isCumulative;
}

function hideSearchCriteria() {
  const container = document.getElementById("searchCriteriaContainer");
  const toggleBtn = document.getElementById("toggleSearchCriteriaBtn");
  const cancelBtn = document.getElementById("cancelRequestBtn");
  if (container && toggleBtn) {
    container.style.display = "none";
    toggleBtn.style.display = "inline-block";
    if (cancelBtn) cancelBtn.style.display = "inline-block";
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
  }
}

function cancelRequest() {
  sessionStorage.removeItem("pendingSelfEmploymentPeriodViewRequest");
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");

  showSearchCriteria();
  document.getElementById("periodViewResults").style.display = "none";
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
    continuePeriodViewRetrieval();
  }
}

async function fetchPeriod(nino, businessId, taxYear, periodId, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (periodId) params.append("periodId", periodId);
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
    pollSuccessMessage: "Period summary retrieved.",
    pollErrorMessage: "Failed to retrieve the period summary.",
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(hmrcErrorMessage(result, "Failed to retrieve the period summary"));
    error.status = response.status;
    throw error;
  }
  return result;
}

async function continuePeriodViewRetrieval() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingSelfEmploymentPeriodViewRequest") || "null");

    if (!pendingRequest) return;

    hideSearchCriteria();
    showLoading();
    hideStatus();
    showStatus("Retrieving period summary...", "info");

    const result = await fetchPeriod(
      pendingRequest.nino,
      pendingRequest.businessId,
      pendingRequest.taxYear,
      pendingRequest.periodId,
      pendingRequest.testScenario,
      pendingRequest.runFraudPreventionHeaderValidation,
      accessToken,
    );

    await displayPeriod(result, pendingRequest);
    document.getElementById("periodViewResults").style.display = "block";
    hideStatus();

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingSelfEmploymentPeriodViewRequest");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please re-authenticate.", "error");
    } else {
      showStatus(`Failed to retrieve the period summary: ${error.message}`, "error");
    }
    showSearchCriteria();
    sessionStorage.removeItem("pendingSelfEmploymentPeriodViewRequest");
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
  const periodId = formData.get("periodId").trim();
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYear) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "cumulative";

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"].concat(isCumulative ? [] : ["periodId"]))) return;

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
      const requestData = { nino, businessId, taxYear, periodId, testScenario, runFraudPreventionHeaderValidation };

      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingSelfEmploymentPeriodViewRequest", JSON.stringify(requestData));
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
      showStatus("Retrieving period summary...", "info");

      const result = await fetchPeriod(nino, businessId, taxYear, periodId, testScenario, runFraudPreventionHeaderValidation, accessToken);

      await displayPeriod(result, { nino, businessId, taxYear, periodId });
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
    } finally {
      hideLoading();
    }
  }
}

const JOURNEY_LINKS = [
  { href: "selfEmploymentPeriods.html", text: "See the other period summaries" },
  { href: "dashboard.html", text: "Back to Income Tax" },
];

async function displayPeriod(period, query = {}) {
  const { periodCopyHtml, mountCopy } = await import("../../lib/itsa-submission-record.js");
  mountCopy(
    document.getElementById("periodDetails"),
    periodCopyHtml({
      kind: "self-employment",
      period,
      nino: query.nino,
      businessId: query.businessId,
      taxYear: query.taxYear,
      periodId: query.periodId,
      retrievedAt: new Date().toISOString(),
      links: JOURNEY_LINKS,
    }),
  );
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", () => {
  showSearchCriteria();
});

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  cancelRequest();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("itsaSelfEmploymentPeriodViewForm");
  const resultsContainer = document.getElementById("periodViewResults");
  form.reset();
  resultsContainer.style.display = "none";
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("taxYear").addEventListener("input", updateSubmissionModelUI);

document.getElementById("itsaSelfEmploymentPeriodViewForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  handleOAuthCallback();
});
