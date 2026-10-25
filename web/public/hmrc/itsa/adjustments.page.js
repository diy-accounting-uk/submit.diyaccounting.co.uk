// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

let triggeredNino = "";
let triggeredTaxYear = "";
let triggeredCalculationId = "";

// HMRC computes the triggered summary asynchronously, the same way it computes a tax
// calculation: retrieving it too soon answers 404 MATCHING_RESOURCE_NOT_FOUND rather than
// the summary. Wait, then retry a bounded number of times, the way
// triggerAndAwaitItsaCalculation does server-side for the final declaration's calculation.
const BSAS_RETRIEVE_MIN_WAIT_MS = 5000;
const BSAS_RETRIEVE_MAX_ATTEMPTS = 5;
const BSAS_RETRIEVE_RETRY_DELAY_MS = 3000;

// HMRC's BSAS sandbox retrieve endpoint does not read back what the trigger endpoint just
// created - unlike trigger and list, retrieve is not stateful, and its documented default
// (no Gov-Test-Scenario header) is "no data found". A synthetic run that picked no explicit
// test scenario for the trigger needs one of the named success scenarios on the retrieve
// call, or every retry answers the same 404 forever.
const BSAS_RETRIEVE_DEFAULT_SYNTHETIC_TEST_SCENARIO = "SELF_EMPLOYMENT_PROFIT";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
async function checkOpenObligations(nino, businessId, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const result = await getObligations(nino, accessToken, govClientHeaders, false, null, {
    typeOfBusiness: "self-employment",
    businessId,
    status: "open",
  });
  const openObligations = (result?.obligations || []).filter((o) => o.status === "open" || o.status === "O");
  return openObligations;
}

async function triggerSummary(triggerDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await triggerBsas(triggerDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

async function retrieveSummary(
  nino,
  calculationId,
  taxYear,
  accessToken,
  testScenario,
  minWaitMs = BSAS_RETRIEVE_MIN_WAIT_MS,
  retryDelayMs = BSAS_RETRIEVE_RETRY_DELAY_MS,
) {
  const govClientHeaders = await getGovClientHeaders();
  let hmrcAccount;
  try {
    hmrcAccount = sessionStorage.getItem("hmrcAccount");
  } catch (error) {
    console.warn("Failed to read hmrcAccount from sessionStorage:", error.message);
  }
  const retrieveTestScenario = testScenario || (hmrcAccount === "synthetic" ? BSAS_RETRIEVE_DEFAULT_SYNTHETIC_TEST_SCENARIO : null);
  await sleep(minWaitMs);
  for (let attempt = 1; attempt <= BSAS_RETRIEVE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await getBsasSelfEmployment(nino, calculationId, taxYear, accessToken, govClientHeaders, false, retrieveTestScenario);
    } catch (error) {
      const notReadyYet = error.status === 404 && attempt < BSAS_RETRIEVE_MAX_ATTEMPTS;
      if (!notReadyYet) throw error;
      await sleep(retryDelayMs);
    }
  }
}

async function submitAdjustment(adjustDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await adjustBsasSelfEmployment(adjustDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

function displaySummary(bsas) {
  HmrcFieldTable.mountFieldTable(
    document.getElementById("summaryDetails"),
    HmrcFieldTable.selfEmploymentSummaryRows(bsas?.adjustableSummaryCalculation),
    { caption: "Year-end summary" },
  );
}

async function ensureAuthorizedThen(pendingKey, pendingValue, run) {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;

  if (!scopeSufficient) {
    if (accessToken && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
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
  await run(accessToken);
}

async function runTriggerAndRetrieve(triggerDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  showLoading();
  hideStatus();
  showStatus("Requesting the year-end summary...", "info");
  const triggerResult = await triggerSummary(triggerDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
  triggeredNino = triggerDetails.nino;
  triggeredTaxYear = document.getElementById("taxYear").value.trim();
  triggeredCalculationId = triggerResult.calculationId;

  showStatus("Retrieving year-end summary...", "info");
  const bsas = await retrieveSummary(triggeredNino, triggeredCalculationId, triggeredTaxYear, accessToken, testScenario);
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
    typeOfBusiness: "self-employment",
  };

  try {
    const accessTokenForCheck = sessionStorage.getItem("hmrcAccessToken");
    if (accessTokenForCheck) {
      const openObligations = await checkOpenObligations(nino, businessId, accessTokenForCheck);
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
    "pendingBsasTriggerRequest",
    { triggerDetails, taxYear, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        await runTriggerAndRetrieve(triggerDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
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
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingTrigger = JSON.parse(sessionStorage.getItem("pendingBsasTriggerRequest") || "null");
    const pendingAdjust = JSON.parse(sessionStorage.getItem("pendingBsasAdjustRequest") || "null");

    if (pendingTrigger) {
      document.getElementById("taxYear").value = pendingTrigger.taxYear;
      await runTriggerAndRetrieve(
        pendingTrigger.triggerDetails,
        pendingTrigger.testScenario,
        pendingTrigger.runFraudPreventionHeaderValidation,
        accessToken,
      );
      sessionStorage.removeItem("pendingBsasTriggerRequest");
    } else if (pendingAdjust) {
      showLoading();
      showStatus("Submitting adjustment...", "info");
      await submitAdjustment(
        pendingAdjust.adjustDetails,
        pendingAdjust.testScenario,
        pendingAdjust.runFraudPreventionHeaderValidation,
        accessToken,
      );
      document.getElementById("summaryContainer").style.display = "none";
      document.getElementById("adjustmentResults").style.display = "block";
      hideStatus();
      sessionStorage.removeItem("pendingBsasAdjustRequest");
    } else {
      return;
    }
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
    sessionStorage.removeItem("pendingBsasTriggerRequest");
    sessionStorage.removeItem("pendingBsasAdjustRequest");
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcTokenScope");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("currentActivity");
  } finally {
    hideLoading();
  }
}

function handleOAuthCallback() {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  if (accessToken) continueAfterOAuth();
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
    const turnover = window.parseMoneyInput(document.getElementById("adjustTurnover").value);
    const costOfGoods = window.parseMoneyInput(document.getElementById("adjustCostOfGoods").value);
    if (turnover !== null) adjustDetails.income = { turnover };
    if (costOfGoods !== null) adjustDetails.expenses = { costOfGoods };
  }

  await ensureAuthorizedThen(
    "pendingBsasAdjustRequest",
    { adjustDetails, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Submitting adjustment...", "info");
        await submitAdjustment(adjustDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
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
