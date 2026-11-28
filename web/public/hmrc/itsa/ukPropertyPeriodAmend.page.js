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
window.ukPropertyPeriodFields.mount({
  incomeContainer: document.getElementById("incomeFields"),
  expenseContainer: document.getElementById("expenseFields"),
  periodAmountRequired: false,
});

// In a cumulative year (2025-26 onwards) there is no submissionId to address - the PUT
// amends the year's one running total - furnished holiday lettings no longer exist as a
// property type, and there is a current total worth loading first. Below the boundary
// every field behaves as it always has.
function updateSubmissionModelUI() {
  const taxYearValue = document.getElementById("taxYear").value.trim();
  const submissionIdGroup = document.getElementById("submissionIdGroup");
  const submissionIdInput = document.getElementById("submissionId");
  const propertyTypeGroup = document.getElementById("propertyTypeGroup");
  const cumulativeMoneyNote = document.getElementById("cumulativeMoneyNote");
  const periodAmountHint = document.getElementById("periodAmount-money-hint");
  const loadCurrentTotalGroup = document.getElementById("loadCurrentTotalGroup");

  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYearValue) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYearValue) === "cumulative";

  submissionIdGroup.style.display = isCumulative ? "none" : "block";
  submissionIdInput.required = !isCumulative;
  propertyTypeGroup.style.display = isCumulative ? "none" : "block";

  cumulativeMoneyNote.style.display = isCumulative ? "block" : "none";
  window.ukPropertyPeriodFields.MONEY_IDS.forEach((fieldId) => {
    const label = document.querySelector(`label[for="${fieldId}"]`);
    if (!label) return;
    const baseText = label.dataset.baseLabel || label.textContent;
    label.dataset.baseLabel = baseText;
    label.textContent = isCumulative ? siteText("itsa.year-to-date-label", "{label} (year to date)", { label: baseText }) : baseText;
  });
  periodAmountHint.textContent = isCumulative
    ? siteText("itsa-uk-amend.income-hint-cumulative", "The corrected total rent and other income for the tax year so far.")
    : siteText("itsa-uk-amend.income-hint", "The corrected rent and other income received for this period.");

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
  sessionStorage.removeItem("pendingUkPropertyPeriodAmendRequest");
  window.hmrcScopeCheck.clearHmrcToken();
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("currentActivity");

  showSearchCriteria();
  document.getElementById("periodAmendResults").style.display = "none";
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
  if (!hmrcGrantId) return;
  if (sessionStorage.getItem("pendingUkPropertyLoadTotalRequest")) {
    continueLoadCurrentTotal();
  } else {
    continuePeriodAmend();
  }
}

// Fetches the cumulative model's single running total for the tax year, the starting
// point a customer edits to reach the new total, rather than a blank amend form.
//
// This retrieve is not stateful in the sandbox - its documented default (no
// Gov-Test-Scenario header) is "no data found", the same trap the BSAS retrieve carries
// (see ukPropertyAdjustments.html's retrieveSummary). A synthetic run with no explicit
// test scenario needs a named success scenario; a live account must never carry one. This
// button only shows for a cumulative tax year, so no isCumulative check is needed here.
async function fetchCurrentTotal(nino, businessId, taxYear, hmrcGrantId) {
  const hmrcAccount = await window.readHmrcAccount();
  const testScenario = window.resolveSyntheticTestScenario(null, hmrcAccount, "UK_PROPERTY_FULL_EXPENSES");
  const params = new URLSearchParams({ nino, businessId, taxYear });
  if (testScenario) params.append("Gov-Test-Scenario", testScenario);
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
    pollPendingMessage: window.hmrcWaitingMessage(),
    pollSuccessMessage: siteText("itsa.current-total-loaded", "Current total loaded."),
    pollErrorMessage: siteText("itsa.current-total-failed", "Failed to load the current total."),
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(hmrcErrorMessage(result, siteText("itsa.current-total-failed-fallback", "Failed to load the current total")));
    error.status = response.status;
    throw error;
  }
  return result;
}

function applyCurrentTotal(periodSummary) {
  const property = periodSummary?.ukProperty || {};
  window.ukPropertyPeriodFields.applyLoaded(property);
  showStatus(
    siteText(
      "itsa-se-amend.current-total-applied",
      "Loaded the current year-to-date total from HMRC. Edit the figures below to the new total.",
    ),
    "info",
  );
}

async function continueLoadCurrentTotal() {
  try {
    const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingUkPropertyLoadTotalRequest") || "null");
    if (!pendingRequest) return;

    showLoading();
    hideStatus();

    const result = await fetchCurrentTotal(pendingRequest.nino, pendingRequest.businessId, pendingRequest.taxYear, hmrcGrantId);
    applyCurrentTotal(result);

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingUkPropertyLoadTotalRequest");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    if (error.status === 404) {
      showStatus(siteText("itsa-se-amend.current-total-none", "HMRC has no total on file yet for this tax year."), "info");
    } else if (error.status === 401) {
      window.hmrcScopeCheck.clearHmrcToken();
      showStatus(siteText("itsa.current-total-token-expired", "Access token expired. Please try loading the total again."), "error");
    } else {
      showStatus(
        siteText("itsa.current-total-failed-reason", "Failed to load the current total: {reason}", { reason: error.message }),
        "error",
      );
    }
    sessionStorage.removeItem("pendingUkPropertyLoadTotalRequest");
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

  const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
  const scopeSufficient = hmrcGrantId && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!hmrcGrantId;

  if (!scopeSufficient) {
    if (hmrcGrantId && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    try {
      showLoading();
      showStatus(siteText("widget.hmrc-auth-starting", "Initiating HMRC authentication..."), "info");

      const state = generateRandomState();
      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingUkPropertyLoadTotalRequest", JSON.stringify({ nino, businessId, taxYear }));
      sessionStorage.setItem("currentActivity", `${location.pathname}`);

      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:self-assessment";
      const hmrcAccount = await window.readHmrcAccount();
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
      const result = await fetchCurrentTotal(nino, businessId, taxYear, hmrcGrantId);
      applyCurrentTotal(result);
    } catch (error) {
      if (error.status === 404) {
        showStatus(siteText("itsa-se-amend.current-total-none", "HMRC has no total on file yet for this tax year."), "info");
      } else {
        showStatus(
          siteText("itsa.current-total-failed-reason", "Failed to load the current total: {reason}", { reason: error.message }),
          "error",
        );
      }
    } finally {
      hideLoading();
    }
  }
}

function readAmendData(source) {
  const taxYear = (source.taxYear || "").trim();
  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYear) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "cumulative";

  const { income, expenses } = window.ukPropertyPeriodFields.readFigures({ sendZeros: false });

  const amendData = {
    nino: (source.nino || "").replace(/\s+/g, "").toUpperCase(),
    businessId: (source.businessId || "").trim(),
    taxYear,
    submissionId: (source.submissionId || "").trim() || undefined,
  };

  // Furnished holiday lettings ended 5 April 2025, so the cumulative model (2025-26
  // onwards) carries one flat income/expenses pair rather than the dated model's
  // ukFhlProperty/ukNonFhlProperty split by the customer's chosen property type.
  if (isCumulative) {
    amendData.income = income;
    amendData.expenses = expenses;
  } else {
    amendData[source.propertyType] = { income, expenses };
  }
  return amendData;
}

async function amendPeriod(amendData, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const govClientHeaders = await getGovClientHeaders();

  const requestHeaders = {
    "x-mcp-hmrc-grant": hmrcGrantId,
    "Content-Type": "application/json",
    ...govClientHeaders,
  };
  if (testScenario) requestHeaders["Gov-Test-Scenario"] = testScenario;

  const hmrcAccount = await window.readHmrcAccount();
  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }

  const response = await window.authorizedFetch("/api/v1/hmrc/itsa/uk-property/period", {
    method: "PUT",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    body: JSON.stringify({ ...amendData, runFraudPreventionHeaderValidation }),
    ...window.hmrcWritePollOptions(),
    pollSuccessMessage: siteText("itsa.period-amended", "Period summary amended."),
    pollErrorMessage: siteText("itsa.period-amend-failed", "Failed to amend the period summary."),
  });

  const result = await response.json();
  if (!response.ok) {
    throw window.hmrcRequestFailure(
      hmrcErrorMessage(result, siteText("itsa.period-amend-failed-fallback", "Failed to amend the period summary")),
      response,
      result,
    );
  }
  return result;
}

// The stage the amendment shows while it sends, and the failure panel's first two lines.
function amendFilingWords() {
  return {
    sending: siteText("itsa.uk-narrate-sending-amend", "Sending the amended UK property update to HMRC..."),
    notSent: siteText("itsa.uk-failure-not-sent-amend", "HMRC has not got the amended UK property update."),
    answers: siteText("itsa.uk-failure-answers-form", "Your figures are still in the form."),
  };
}

async function continuePeriodAmend() {
  try {
    const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingUkPropertyPeriodAmendRequest") || "null");

    if (!pendingRequest) return;

    hideSearchCriteria();
    showLoading();
    hideStatus();

    await window.fileWithHmrc(amendFilingWords(), () =>
      amendPeriod(pendingRequest.amendData, pendingRequest.testScenario, pendingRequest.runFraudPreventionHeaderValidation, hmrcGrantId),
    );

    document.getElementById("periodAmendResults").style.display = "block";
    hideStatus();
    window.dispatchEvent(new CustomEvent("bundle-changed"));

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingUkPropertyPeriodAmendRequest");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    if (error.status === 401) {
      window.hmrcScopeCheck.clearHmrcToken();
      showStatus(siteText("itsa.token-expired-reauth", "Access token expired. Please re-authenticate."), "error");
    } else if (error.status === 403 && error.reason === "tokens_exhausted") {
      hideStatus();
      window.SubmissionCost?.refresh();
    } else {
      hideStatus();
    }
    showSearchCriteria();
    sessionStorage.removeItem("pendingUkPropertyPeriodAmendRequest");
    window.hmrcScopeCheck.clearHmrcToken();
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("currentActivity");
  } finally {
    hideLoading();
  }
}

async function handleFormSubmission(event) {
  event.preventDefault();

  if (window.formErrors.reportMoneyProblems()) return;

  const formData = new FormData(event.target);
  const amendData = readAmendData({
    nino: formData.get("nino").replace(/\s+/g, "").toUpperCase(),
    businessId: formData.get("businessId"),
    taxYear: formData.get("taxYear"),
    submissionId: formData.get("submissionId"),
    propertyType: formData.get("propertyType"),
  });
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;

  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(amendData.taxYear) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(amendData.taxYear) === "cumulative";

  if (!isCumulative && !window.formErrors.requireFields(["submissionId"])) return;

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
      const requestData = { amendData, testScenario, runFraudPreventionHeaderValidation };

      const hmrcAccount = await window.readHmrcAccount();
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingUkPropertyPeriodAmendRequest", JSON.stringify(requestData));
      sessionStorage.setItem("currentActivity", currentActivity);

      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "write:self-assessment";

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

      await window.fileWithHmrc(amendFilingWords(), () =>
        amendPeriod(amendData, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId),
      );

      document.getElementById("periodAmendResults").style.display = "block";
      hideStatus();
      window.dispatchEvent(new CustomEvent("bundle-changed"));
    } catch (error) {
      if (error.status === 401) {
        window.hmrcScopeCheck.clearHmrcToken();
        showStatus(siteText("itsa.token-expired-retry", "Access token expired. Please try again."), "error");
      } else if (error.status === 403 && error.reason === "tokens_exhausted") {
        hideStatus();
        window.SubmissionCost?.refresh();
      } else {
        hideStatus();
      }
    } finally {
      hideLoading();
    }
  }
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", () => {
  showSearchCriteria();
});

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  cancelRequest();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("itsaUkPropertyPeriodAmendForm");
  const resultsContainer = document.getElementById("periodAmendResults");
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

document.getElementById("itsaUkPropertyPeriodAmendForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  handleOAuthCallback();
});
