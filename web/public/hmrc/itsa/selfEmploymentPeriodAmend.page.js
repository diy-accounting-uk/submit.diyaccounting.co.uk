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
window.CarriedIdentifiers.bind("periodId", document.getElementById("periodId"));

// In a cumulative year (2025-26 onwards) there is no periodId to address - the PUT
// amends the year's one running total - so the field is hidden and not required, the
// money labels read as totals, and there is a current total worth loading first. Below
// the boundary every field behaves as it always has.
function updateSubmissionModelUI() {
  const taxYearValue = document.getElementById("taxYear").value.trim();
  const periodIdGroup = document.getElementById("periodIdGroup");
  const periodIdInput = document.getElementById("periodId");
  const cumulativeMoneyNote = document.getElementById("cumulativeMoneyNote");
  const turnoverHint = document.getElementById("turnover-hint");
  const loadCurrentTotalGroup = document.getElementById("loadCurrentTotalGroup");

  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(taxYearValue) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYearValue) === "cumulative";

  periodIdGroup.style.display = isCumulative ? "none" : "block";
  periodIdInput.required = !isCumulative;

  cumulativeMoneyNote.style.display = isCumulative ? "block" : "none";
  ["turnover", "otherIncome", "taxTakenOffTradingIncome", "costOfGoods", "otherExpenses"].forEach((fieldId) => {
    const label = document.querySelector(`label[for="${fieldId}"]`);
    if (!label) return;
    const baseText = label.dataset.baseLabel || label.textContent;
    label.dataset.baseLabel = baseText;
    label.textContent = isCumulative ? siteText("itsa.year-to-date-label", "{label} (year to date)", { label: baseText }) : baseText;
  });
  turnoverHint.textContent = isCumulative
    ? siteText("itsa-se-amend.turnover-hint-cumulative", "The corrected total turnover for the tax year so far.")
    : siteText("itsa-se-amend.turnover-hint", "The corrected takings, fees, sales or money earned by the business for this period.");

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
  sessionStorage.removeItem("pendingSelfEmploymentPeriodAmendRequest");
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
  if (sessionStorage.getItem("pendingSelfEmploymentLoadTotalRequest")) {
    continueLoadCurrentTotal();
  } else {
    continuePeriodAmend();
  }
}

// Fetches the cumulative model's single running total for the tax year, the starting
// point a customer edits to reach the new total, rather than a blank amend form.
async function fetchCurrentTotal(nino, businessId, taxYear, hmrcGrantId) {
  const params = new URLSearchParams({ nino, businessId, taxYear });
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
  const income = periodSummary?.periodIncome || {};
  const expenses = periodSummary?.periodExpenses || {};
  if (income.turnover !== undefined) document.getElementById("turnover").value = income.turnover;
  if (income.other !== undefined) document.getElementById("otherIncome").value = income.other;
  if (income.taxTakenOffTradingIncome !== undefined) {
    document.getElementById("taxTakenOffTradingIncome").value = income.taxTakenOffTradingIncome;
  }
  if (expenses.costOfGoods !== undefined) document.getElementById("costOfGoods").value = expenses.costOfGoods;
  if (expenses.otherExpenses !== undefined) document.getElementById("otherExpenses").value = expenses.otherExpenses;
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
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingSelfEmploymentLoadTotalRequest") || "null");
    if (!pendingRequest) return;

    if ((await window.EntitlementStatus?.activityBundleHeld()) === false) {
      sessionStorage.removeItem("pendingSelfEmploymentLoadTotalRequest");
      window.EntitlementStatus.showPassNeeded("hmrc");
      return;
    }

    showLoading();
    hideStatus();

    const result = await fetchCurrentTotal(pendingRequest.nino, pendingRequest.businessId, pendingRequest.taxYear, hmrcGrantId);
    applyCurrentTotal(result);

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingSelfEmploymentLoadTotalRequest");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    if (window.EntitlementStatus?.isBundleRefusal(error)) {
      window.EntitlementStatus.showPassNeeded("hmrc");
    } else if (error.status === 404) {
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

  if ((await window.EntitlementStatus?.activityBundleHeld()) === false) {
    window.EntitlementStatus.showPassNeeded("hmrc");
    return;
  }

  const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
  const scopeSufficient = hmrcGrantId && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!hmrcGrantId;

  if (!scopeSufficient) {
    if (hmrcGrantId && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    try {
      showLoading();
      showStatus(siteText("widget.hmrc-auth-starting", "Initiating HMRC authentication..."), "info");

      const state = generateRandomState();
      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingSelfEmploymentLoadTotalRequest", JSON.stringify({ nino, businessId, taxYear }));
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
      if (window.EntitlementStatus?.isBundleRefusal(error)) {
        window.EntitlementStatus.showPassNeeded("hmrc");
      } else if (error.status === 404) {
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
  const periodIncome = {};
  if (window.parseMoneyInput(source.turnover) !== null) periodIncome.turnover = window.parseMoneyInput(source.turnover);
  if (window.parseMoneyInput(source.otherIncome) !== null) periodIncome.other = window.parseMoneyInput(source.otherIncome);
  if (window.parseMoneyInput(source.taxTakenOffTradingIncome) !== null) {
    periodIncome.taxTakenOffTradingIncome = window.parseMoneyInput(source.taxTakenOffTradingIncome);
  }

  const periodExpenses = {};
  if (window.parseMoneyInput(source.costOfGoods) !== null) periodExpenses.costOfGoods = window.parseMoneyInput(source.costOfGoods);
  if (window.parseMoneyInput(source.otherExpenses) !== null) periodExpenses.otherExpenses = window.parseMoneyInput(source.otherExpenses);

  return {
    nino: (source.nino || "").replace(/\s+/g, "").toUpperCase(),
    businessId: (source.businessId || "").trim(),
    taxYear: (source.taxYear || "").trim(),
    periodId: (source.periodId || "").trim() || undefined,
    periodIncome,
    periodExpenses,
  };
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

  const response = await window.authorizedFetch("/api/v1/hmrc/itsa/self-employment/period", {
    method: "PUT",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    body: JSON.stringify({ ...amendData, runFraudPreventionHeaderValidation }),
    pollPendingMessage: siteText("widget.still-processing", "Still processing..."),
    pollSuccessMessage: siteText("itsa.period-amended", "Period summary amended."),
    pollErrorMessage: siteText("itsa.period-amend-failed", "Failed to amend the period summary."),
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(hmrcErrorMessage(result, siteText("itsa.period-amend-failed-fallback", "Failed to amend the period summary")));
    error.status = response.status;
    error.reason = result.reason || result.error?.code;
    throw error;
  }
  return result;
}

async function continuePeriodAmend() {
  try {
    const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingSelfEmploymentPeriodAmendRequest") || "null");

    if (!pendingRequest) return;

    if ((await window.EntitlementStatus?.activityBundleHeld()) === false) {
      sessionStorage.removeItem("pendingSelfEmploymentPeriodAmendRequest");
      window.EntitlementStatus.showPassNeeded("hmrc");
      return;
    }

    hideSearchCriteria();
    showLoading();
    hideStatus();
    showStatus(siteText("itsa.period-amending", "Amending period summary..."), "info");

    await amendPeriod(
      pendingRequest.amendData,
      pendingRequest.testScenario,
      pendingRequest.runFraudPreventionHeaderValidation,
      hmrcGrantId,
    );

    document.getElementById("periodAmendResults").style.display = "block";
    hideStatus();
    window.dispatchEvent(new CustomEvent("bundle-changed"));

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingSelfEmploymentPeriodAmendRequest");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    const refusedForNoPass = window.EntitlementStatus?.isBundleRefusal(error);
    if (refusedForNoPass) {
      hideStatus();
      window.EntitlementStatus.showPassNeeded("hmrc");
    } else if (error.status === 401) {
      window.hmrcScopeCheck.clearHmrcToken();
      showStatus(siteText("itsa.token-expired-reauth", "Access token expired. Please re-authenticate."), "error");
    } else if (error.status === 403 && error.reason === "tokens_exhausted") {
      hideStatus();
      window.SubmissionCost?.refresh();
    } else {
      showStatus(
        siteText("itsa.period-amend-failed-reason", "Failed to amend the period summary: {reason}", { reason: error.message }),
        "error",
      );
    }
    showSearchCriteria();
    sessionStorage.removeItem("pendingSelfEmploymentPeriodAmendRequest");
    // A refusal by our own entitlement check leaves the HMRC grant good for the retry after a pass.
    if (!refusedForNoPass) window.hmrcScopeCheck.clearHmrcToken();
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
    periodId: formData.get("periodId"),
    turnover: formData.get("turnover"),
    otherIncome: formData.get("otherIncome"),
    taxTakenOffTradingIncome: formData.get("taxTakenOffTradingIncome"),
    costOfGoods: formData.get("costOfGoods"),
    otherExpenses: formData.get("otherExpenses"),
  });
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;

  const isCumulative =
    window.itsaSubmissionModel &&
    window.itsaSubmissionModel.isValidTaxYear(amendData.taxYear) &&
    window.itsaSubmissionModel.resolveItsaSubmissionModel(amendData.taxYear) === "cumulative";

  if (!isCumulative && !window.formErrors.requireFields(["periodId"])) return;

  if ((await window.EntitlementStatus?.activityBundleHeld()) === false) {
    window.EntitlementStatus.showPassNeeded("hmrc");
    return;
  }

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
      sessionStorage.setItem("pendingSelfEmploymentPeriodAmendRequest", JSON.stringify(requestData));
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
      showStatus(siteText("itsa.period-amending", "Amending period summary..."), "info");

      await amendPeriod(amendData, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId);

      document.getElementById("periodAmendResults").style.display = "block";
      hideStatus();
      window.dispatchEvent(new CustomEvent("bundle-changed"));
    } catch (error) {
      if (window.EntitlementStatus?.isBundleRefusal(error)) {
        hideStatus();
        window.EntitlementStatus.showPassNeeded("hmrc");
      } else if (error.status === 401) {
        window.hmrcScopeCheck.clearHmrcToken();
        showStatus(siteText("itsa.token-expired-retry", "Access token expired. Please try again."), "error");
      } else if (error.status === 403 && error.reason === "tokens_exhausted") {
        hideStatus();
        window.SubmissionCost?.refresh();
      } else {
        showStatus(
          siteText("itsa.period-amend-failed-reason", "Failed to amend the period summary: {reason}", { reason: error.message }),
          "error",
        );
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
  const form = document.getElementById("itsaSelfEmploymentPeriodAmendForm");
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

document.getElementById("itsaSelfEmploymentPeriodAmendForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  handleOAuthCallback();
});
