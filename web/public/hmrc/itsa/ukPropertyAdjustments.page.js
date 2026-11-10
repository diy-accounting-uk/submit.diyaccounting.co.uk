// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

let triggeredNino = "";
let triggeredTaxYear = "";
let triggeredCalculationId = "";

function initializePage() {
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");
  if (hmrcAccount === "synthetic") {
    const syntheticIndicator = document.getElementById("syntheticIndicator");
    if (syntheticIndicator) syntheticIndicator.classList.add("visible");
  }

  const devSection = document.getElementById("developerSection");
  function updateDeveloperSectionVisibility() {
    const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
    if (devSection) devSection.style.display = developerModeEnabled ? "block" : "none";
  }
  updateDeveloperSectionVisibility();
  window.addEventListener("developer-mode-changed", updateDeveloperSectionVisibility);
}

// The trigger is refused while any quarterly obligation for the business is still open -
// HMRC would reject it with RULE_OBLIGATIONS_NOT_MET, so this is checked and explained
// before the call is made rather than after HMRC says no.
async function checkOpenObligations(nino, businessId, hmrcGrantId) {
  const govClientHeaders = await getGovClientHeaders();
  const result = await getObligations(nino, hmrcGrantId, govClientHeaders, false, null, {
    typeOfBusiness: "uk-property",
    businessId,
    status: "open",
  });
  const openObligations = (result?.obligations || []).filter((o) => o.status === "open" || o.status === "O");
  return openObligations;
}

async function triggerSummary(triggerDetails, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const govClientHeaders = await getGovClientHeaders();
  return await triggerBsas(triggerDetails, hmrcGrantId, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

// HMRC's BSAS retrieve endpoint is not stateful in the sandbox - it does not read back what
// the trigger endpoint just created, and its documented default (no Gov-Test-Scenario
// header) is "no data found". A synthetic run with no explicit test scenario needs a named
// success scenario; a live account must never carry a sandbox-only header.
async function retrieveSummary(nino, calculationId, taxYear, hmrcGrantId, testScenario) {
  const govClientHeaders = await getGovClientHeaders();
  let hmrcAccount;
  try {
    hmrcAccount = sessionStorage.getItem("hmrcAccount");
  } catch (error) {
    console.warn("Failed to read hmrcAccount from sessionStorage:", error.message);
  }
  const retrieveTestScenario = testScenario || (hmrcAccount === "synthetic" ? "UK_PROPERTY_PROFIT" : null);
  return await getBsasUkProperty(nino, calculationId, taxYear, hmrcGrantId, govClientHeaders, false, retrieveTestScenario);
}

async function submitAdjustment(adjustDetails, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const govClientHeaders = await getGovClientHeaders();
  return await adjustBsasUkProperty(adjustDetails, hmrcGrantId, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

function displaySummary(bsas) {
  HmrcFieldTable.mountFieldTable(
    document.getElementById("summaryDetails"),
    HmrcFieldTable.ukPropertySummaryRows(bsas?.adjustableSummaryCalculation),
    { caption: "Year-end summary" },
  );
}

async function ensureAuthorizedThen(pendingKey, pendingValue, run) {
  const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
  const scopeSufficient = hmrcGrantId && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!hmrcGrantId;

  if (!scopeSufficient) {
    if (hmrcGrantId && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    showLoading();
    showStatus("Initiating HMRC authentication...", "info");
    const state = generateRandomState();
    const hmrcAccount = sessionStorage.getItem("hmrcAccount");
    sessionStorage.setItem("oauth_state", state);
    sessionStorage.setItem(pendingKey, JSON.stringify(pendingValue));
    sessionStorage.setItem("currentActivity", `${location.pathname}`);
    const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "write:self-assessment";
    const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");
    try {
      window.__correlation?.prepareRedirect?.();
    } catch {}
    window.location.href = authResponseUrl;
    return;
  }
  await run(hmrcGrantId);
}

async function runTriggerAndRetrieve(triggerDetails, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  showLoading();
  hideStatus();
  showStatus("Requesting the year-end summary...", "info");
  const triggerResult = await triggerSummary(triggerDetails, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId);
  triggeredNino = triggerDetails.nino;
  triggeredTaxYear = document.getElementById("taxYear").value.trim();
  triggeredCalculationId = triggerResult.calculationId;

  showStatus("Retrieving year-end summary...", "info");
  const bsas = await retrieveSummary(triggeredNino, triggeredCalculationId, triggeredTaxYear, hmrcGrantId, testScenario);
  displaySummary(bsas);
  document.getElementById("triggerForm").style.display = "none";
  document.getElementById("summaryContainer").style.display = "block";
  hideStatus();
}

async function handleTriggerFormSubmission(event) {
  event.preventDefault();
  const nino = document.getElementById("nino").value.replace(/\s+/g, "").toUpperCase();
  const businessId = document.getElementById("businessId").value.trim();
  const taxYear = document.getElementById("taxYear").value.trim();
  const accountingPeriodStartDate = document.getElementById("accountingPeriodStartDate").value;
  const accountingPeriodEndDate = document.getElementById("accountingPeriodEndDate").value;
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear", "accountingPeriodStartDate", "accountingPeriodEndDate"])) return;

  const triggerDetails = {
    nino,
    businessId,
    accountingPeriodStartDate,
    accountingPeriodEndDate,
    typeOfBusiness: "uk-property",
  };

  try {
    const hmrcGrantIdForCheck = window.hmrcScopeCheck.storedGrantId();
    if (hmrcGrantIdForCheck) {
      const openObligations = await checkOpenObligations(nino, businessId, hmrcGrantIdForCheck);
      const warning = document.getElementById("obligationsWarning");
      if (openObligations.length > 0) {
        warning.textContent = `${openObligations.length} quarterly obligation(s) for this business are still open. File every quarterly update for the year before requesting the year-end summary.`;
        warning.style.display = "block";
        return;
      }
      warning.style.display = "none";
    }
  } catch (error) {
    console.warn("Could not check obligations before requesting the year-end summary:", error.message);
  }

  await ensureAuthorizedThen(
    "pendingUkPropertyBsasTriggerRequest",
    { triggerDetails, taxYear, testScenario, runFraudPreventionHeaderValidation },
    async (hmrcGrantId) => {
      try {
        await runTriggerAndRetrieve(triggerDetails, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId);
      } catch (error) {
        showStatus(`Failed to request the year-end summary: ${error.message}`, "error");
      } finally {
        hideLoading();
      }
    },
  );
}

async function continueAfterOAuth() {
  try {
    const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
    const pendingTrigger = JSON.parse(sessionStorage.getItem("pendingUkPropertyBsasTriggerRequest") || "null");
    const pendingAdjust = JSON.parse(sessionStorage.getItem("pendingUkPropertyBsasAdjustRequest") || "null");

    if (pendingTrigger) {
      document.getElementById("taxYear").value = pendingTrigger.taxYear;
      await runTriggerAndRetrieve(
        pendingTrigger.triggerDetails,
        pendingTrigger.testScenario,
        pendingTrigger.runFraudPreventionHeaderValidation,
        hmrcGrantId,
      );
      sessionStorage.removeItem("pendingUkPropertyBsasTriggerRequest");
    } else if (pendingAdjust) {
      showLoading();
      showStatus("Submitting adjustment...", "info");
      await submitAdjustment(
        pendingAdjust.adjustDetails,
        pendingAdjust.testScenario,
        pendingAdjust.runFraudPreventionHeaderValidation,
        hmrcGrantId,
      );
      document.getElementById("summaryContainer").style.display = "none";
      document.getElementById("adjustmentResults").style.display = "block";
      hideStatus();
      sessionStorage.removeItem("pendingUkPropertyBsasAdjustRequest");
    } else {
      return;
    }
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
    sessionStorage.removeItem("pendingUkPropertyBsasTriggerRequest");
    sessionStorage.removeItem("pendingUkPropertyBsasAdjustRequest");
    window.hmrcScopeCheck.clearHmrcToken();
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("currentActivity");
  } finally {
    hideLoading();
  }
}

function handleOAuthCallback() {
  const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
  if (hmrcGrantId) continueAfterOAuth();
}

async function handleAdjustmentSubmit(zeroAdjustments) {
  if (!zeroAdjustments) {
    if (window.formErrors.reportMoneyProblems()) return;
  }
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  const adjustDetails = {
    nino: triggeredNino,
    calculationId: triggeredCalculationId,
    taxYear: triggeredTaxYear,
    zeroAdjustments,
  };
  if (!zeroAdjustments) {
    const totalRentsReceived = window.parseMoneyInput(document.getElementById("adjustTotalRentsReceived").value);
    const repairsAndMaintenance = window.parseMoneyInput(document.getElementById("adjustRepairsAndMaintenance").value);
    if (totalRentsReceived !== null) adjustDetails.income = { totalRentsReceived };
    if (repairsAndMaintenance !== null) adjustDetails.expenses = { repairsAndMaintenance };
  }

  await ensureAuthorizedThen(
    "pendingUkPropertyBsasAdjustRequest",
    { adjustDetails, testScenario, runFraudPreventionHeaderValidation },
    async (hmrcGrantId) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Submitting adjustment...", "info");
        await submitAdjustment(adjustDetails, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId);
        document.getElementById("summaryContainer").style.display = "none";
        document.getElementById("adjustmentResults").style.display = "block";
        hideStatus();
      } catch (error) {
        showStatus(`Failed to submit the adjustment: ${error.message}`, "error");
      } finally {
        hideLoading();
      }
    },
  );
}

document.getElementById("itsaBsasTriggerForm").addEventListener("submit", handleTriggerFormSubmission);
document.getElementById("submitAdjustmentBtn").addEventListener("click", () => handleAdjustmentSubmit(false));
document.getElementById("zeroAdjustmentsBtn").addEventListener("click", () => handleAdjustmentSubmit(true));

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("adjustmentResults").style.display = "none";
  document.getElementById("triggerForm").style.display = "block";
  document.getElementById("itsaBsasTriggerForm").reset();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  handleOAuthCallback();
});
