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
window.CarriedIdentifiers.bind("submissionId", document.getElementById("submissionId"));

// A cumulative tax year (2025-26 onwards) retrieves the single running total addressed
// by taxYear alone, so there is no submissionId to enter or require.
function updateSubmissionModelUI() {
  const taxYearValue = document.getElementById("taxYear").value.trim();
  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYearValue) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYearValue) === "cumulative";

  document.getElementById("cumulativeViewNote").style.display = isCumulative ? "block" : "none";
  document.getElementById("submissionIdGroup").style.display = isCumulative ? "none" : "block";
  document.getElementById("submissionId").required = !isCumulative;
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
  sessionStorage.removeItem("pendingUkPropertyPeriodViewRequest");
  window.hmrcScopeCheck.clearHmrcToken();
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("currentActivity");

  showSearchCriteria();
  document.getElementById("periodViewResults").style.display = "none";
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
    continuePeriodViewRetrieval();
  }
}

// Neither the dated nor the cumulative retrieve is stateful in the sandbox - both
// default (no Gov-Test-Scenario header) to "no data found", the same trap the BSAS
// retrieve carries (see ukPropertyAdjustments.html's retrieveSummary). A synthetic run
// with no explicit test scenario needs a named success scenario for whichever model the
// tax year resolves to; a live account must never carry a sandbox-only header.
async function fetchPeriod(nino, businessId, taxYear, submissionId, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYear) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "cumulative";
  const hmrcAccount = await window.readHmrcAccount();
  const fallbackScenario = isCumulative ? "UK_PROPERTY_FULL_EXPENSES" : "UK_PROPERTY";
  const effectiveTestScenario = window.resolveSyntheticTestScenario(testScenario, hmrcAccount, fallbackScenario);

  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (submissionId) params.append("submissionId", submissionId);
  if (effectiveTestScenario) params.append("Gov-Test-Scenario", effectiveTestScenario);
  if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

  const govClientHeaders = await getGovClientHeaders();

  const requestHeaders = {
    "x-mcp-hmrc-grant": hmrcGrantId,
    "Content-Type": "application/json",
    ...govClientHeaders,
  };

  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }

  const response = await window.authorizedFetch(`/api/v1/hmrc/itsa/uk-property/period?${params}`, {
    method: "GET",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    pollPendingMessage: siteText("widget.still-processing", "Still processing..."),
    pollSuccessMessage: siteText("itsa.period-retrieved", "Period summary retrieved."),
    pollErrorMessage: siteText("itsa.period-retrieve-failed", "Failed to retrieve the period summary."),
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      hmrcErrorMessage(result, siteText("itsa.period-retrieve-failed-fallback", "Failed to retrieve the period summary")),
    );
    error.status = response.status;
    throw error;
  }
  return result;
}

async function continuePeriodViewRetrieval() {
  try {
    const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingUkPropertyPeriodViewRequest") || "null");

    if (!pendingRequest) return;

    hideSearchCriteria();
    showLoading();
    hideStatus();
    showStatus(siteText("itsa.period-retrieving", "Retrieving period summary..."), "info");

    const result = await fetchPeriod(
      pendingRequest.nino,
      pendingRequest.businessId,
      pendingRequest.taxYear,
      pendingRequest.submissionId,
      pendingRequest.testScenario,
      pendingRequest.runFraudPreventionHeaderValidation,
      hmrcGrantId,
    );

    await displayPeriod(result, pendingRequest);
    document.getElementById("periodViewResults").style.display = "block";
    hideStatus();

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingUkPropertyPeriodViewRequest");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    if (error.status === 401) {
      window.hmrcScopeCheck.clearHmrcToken();
      showStatus(siteText("itsa.token-expired-reauth", "Access token expired. Please re-authenticate."), "error");
    } else {
      showStatus(
        siteText("itsa.period-retrieve-failed-reason", "Failed to retrieve the period summary: {reason}", { reason: error.message }),
        "error",
      );
    }
    showSearchCriteria();
    sessionStorage.removeItem("pendingUkPropertyPeriodViewRequest");
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
  const submissionId = formData.get("submissionId").trim();
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYear) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "cumulative";

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"].concat(isCumulative ? [] : ["submissionId"]))) return;

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
      const requestData = { nino, businessId, taxYear, submissionId, testScenario, runFraudPreventionHeaderValidation };

      const hmrcAccount = await window.readHmrcAccount();
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingUkPropertyPeriodViewRequest", JSON.stringify(requestData));
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
      showStatus(siteText("itsa.period-retrieving", "Retrieving period summary..."), "info");

      const result = await fetchPeriod(
        nino,
        businessId,
        taxYear,
        submissionId,
        testScenario,
        runFraudPreventionHeaderValidation,
        hmrcGrantId,
      );

      await displayPeriod(result, { nino, businessId, taxYear, submissionId });
      document.getElementById("periodViewResults").style.display = "block";
      hideStatus();
    } catch (error) {
      if (error.status === 401) {
        window.hmrcScopeCheck.clearHmrcToken();
        showStatus(siteText("itsa.token-expired-retry", "Access token expired. Please try again."), "error");
      } else {
        showStatus(
          siteText("itsa.period-retrieve-failed-reason", "Failed to retrieve the period summary: {reason}", { reason: error.message }),
          "error",
        );
      }
    } finally {
      hideLoading();
    }
  }
}

const JOURNEY_LINKS = [
  { href: "ukPropertyPeriods.html", text: siteText("itsa.link-other-periods", "See the other period summaries") },
  { href: "dashboard.html", text: siteText("itsa.link-back", "Back to Income Tax") },
];

async function displayPeriod(period, query = {}) {
  const { periodCopyHtml, mountCopy } = await import("../../lib/itsa-submission-record.js");
  mountCopy(
    document.getElementById("periodDetails"),
    periodCopyHtml({
      kind: "uk-property",
      period,
      nino: query.nino,
      businessId: query.businessId,
      taxYear: query.taxYear,
      periodId: query.submissionId,
      idLabel: siteText("itsa.submission-id", "Submission ID"),
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
  const form = document.getElementById("itsaUkPropertyPeriodViewForm");
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

document.getElementById("itsaUkPropertyPeriodViewForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  handleOAuthCallback();
});
