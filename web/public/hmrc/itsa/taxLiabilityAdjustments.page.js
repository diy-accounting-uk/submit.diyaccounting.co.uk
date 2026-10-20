// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

let loadedNino = "";
let loadedTaxYear = "";

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

function readCarryBackLossesDecrease() {
  const incomeTax = window.parseMoneyInput(document.getElementById("incomeTax").value) ?? 0;
  const class4 = window.parseMoneyInput(document.getElementById("class4").value) ?? 0;
  const capitalGainsTax = window.parseMoneyInput(document.getElementById("capitalGainsTax").value) ?? 0;
  const carryBackLossesDecrease = {};
  if (incomeTax !== 0) carryBackLossesDecrease.incomeTax = incomeTax;
  if (class4 !== 0) carryBackLossesDecrease.class4 = class4;
  if (capitalGainsTax !== 0) carryBackLossesDecrease.capitalGainsTax = capitalGainsTax;
  return carryBackLossesDecrease;
}

function populateEditForm(taxLiabilityAdjustments) {
  const carryBackLossesDecrease = taxLiabilityAdjustments?.carryBackLossesDecrease || {};
  document.getElementById("incomeTax").value = carryBackLossesDecrease.incomeTax ?? 0;
  document.getElementById("class4").value = carryBackLossesDecrease.class4 ?? 0;
  document.getElementById("capitalGainsTax").value = carryBackLossesDecrease.capitalGainsTax ?? 0;
}

async function loadAdjustments(nino, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await getTaxLiabilityAdjustments(nino, taxYear, accessToken, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

async function saveAdjustments(adjustmentsDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await putTaxLiabilityAdjustments(
    adjustmentsDetails,
    accessToken,
    govClientHeaders,
    runFraudPreventionHeaderValidation,
    testScenario,
  );
}

// Retrieves HMRC's own calculation for the year the claim decreases, so the customer has
// HMRC's figure in front of them while they enter the decrease. Nothing here is
// subtracted or computed - the page shows the figure and the customer enters their own.
async function showEarlierYearFigure() {
  const nino = loadedNino;
  const taxYear = loadedTaxYear;
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const calculationTestScenario = document.getElementById("calculationTestScenario").value || null;
  const button = document.getElementById("showEarlierYearBtn");
  const figureEl = document.getElementById("earlierYearFigure");

  try {
    button.disabled = true;
    figureEl.textContent = "Retrieving from HMRC...";
    const govClientHeaders = await getGovClientHeaders();
    const result = await triggerCalculation(
      { nino, taxYear, calculationType: "in-year" },
      accessToken,
      govClientHeaders,
      false,
      calculationTestScenario,
    );
    const totalIncomeTaxAndNicsDue = result?.calculation?.taxCalculation?.totalIncomeTaxAndNicsDue;
    figureEl.textContent = HmrcFieldTable.formatMoney(totalIncomeTaxAndNicsDue);
  } catch (error) {
    figureEl.textContent = "Could not retrieve HMRC's calculation for that year.";
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

async function continueAfterOAuth() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingLoad = JSON.parse(sessionStorage.getItem("pendingAdjustmentsLoadRequest") || "null");
    const pendingSave = JSON.parse(sessionStorage.getItem("pendingAdjustmentsSaveRequest") || "null");

    if (pendingLoad) {
      showLoading();
      showStatus("Loading tax liability adjustments...", "info");
      const result = await loadAdjustments(
        pendingLoad.nino,
        pendingLoad.taxYear,
        pendingLoad.testScenario,
        pendingLoad.runFraudPreventionHeaderValidation,
        accessToken,
      );
      loadedNino = pendingLoad.nino;
      loadedTaxYear = pendingLoad.taxYear;
      populateEditForm(result);
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("adjustmentsEditForm").style.display = "block";
      hideStatus();
      sessionStorage.removeItem("pendingAdjustmentsLoadRequest");
    } else if (pendingSave) {
      showLoading();
      showStatus("Saving tax liability adjustments...", "info");
      await saveAdjustments(
        pendingSave.adjustmentsDetails,
        pendingSave.testScenario,
        pendingSave.runFraudPreventionHeaderValidation,
        accessToken,
      );
      document.getElementById("adjustmentsEditForm").style.display = "none";
      document.getElementById("adjustmentsResults").style.display = "block";
      hideStatus();
      sessionStorage.removeItem("pendingAdjustmentsSaveRequest");
    } else {
      return;
    }
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
    sessionStorage.removeItem("pendingAdjustmentsLoadRequest");
    sessionStorage.removeItem("pendingAdjustmentsSaveRequest");
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

async function handleLoadFormSubmission(event) {
  event.preventDefault();
  const nino = document.getElementById("nino").value.replace(/\s+/g, "").toUpperCase();
  const taxYear = document.getElementById("taxYear").value.trim();
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "taxYear"])) return;

  await ensureAuthorizedThen(
    "pendingAdjustmentsLoadRequest",
    { nino, taxYear, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Loading tax liability adjustments...", "info");
        const result = await loadAdjustments(nino, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken);
        loadedNino = nino;
        loadedTaxYear = taxYear;
        populateEditForm(result);
        document.getElementById("loadCriteriaForm").style.display = "none";
        document.getElementById("adjustmentsEditForm").style.display = "block";
        hideStatus();
      } catch (error) {
        if (error.status === 404 || /not.?found/i.test(error.message)) {
          loadedNino = nino;
          loadedTaxYear = taxYear;
          populateEditForm(null);
          document.getElementById("loadCriteriaForm").style.display = "none";
          document.getElementById("adjustmentsEditForm").style.display = "block";
          showStatus("HMRC has no tax liability adjustments on file yet for this tax year.", "info");
        } else {
          showStatus(`Failed to load tax liability adjustments: ${error.message}`, "error");
        }
      } finally {
        hideLoading();
      }
    },
  );
}

async function handleSaveClick() {
  if (window.formErrors.reportMoneyProblems()) return;
  const adjustmentsDetails = {
    nino: loadedNino,
    taxYear: loadedTaxYear,
    carryBackLossesDecrease: readCarryBackLossesDecrease(),
    suspendTemporalValidations: document.getElementById("suspendTemporalValidations")?.checked || false,
  };
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  await ensureAuthorizedThen(
    "pendingAdjustmentsSaveRequest",
    { adjustmentsDetails, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Saving tax liability adjustments...", "info");
        await saveAdjustments(adjustmentsDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
        document.getElementById("adjustmentsEditForm").style.display = "none";
        document.getElementById("adjustmentsResults").style.display = "block";
        hideStatus();
      } catch (error) {
        showStatus(`Failed to save tax liability adjustments: ${error.message}`, "error");
      } finally {
        hideLoading();
      }
    },
  );
}

document.getElementById("itsaAdjustmentsLoadForm").addEventListener("submit", handleLoadFormSubmission);
document.getElementById("saveBtn").addEventListener("click", handleSaveClick);
document.getElementById("showEarlierYearBtn").addEventListener("click", showEarlierYearFigure);

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("adjustmentsResults").style.display = "none";
  document.getElementById("loadCriteriaForm").style.display = "block";
  document.getElementById("adjustmentsEditForm").style.display = "none";
  document.getElementById("itsaAdjustmentsLoadForm").reset();
  document.getElementById("earlierYearFigure").textContent = "Not yet retrieved";
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  handleOAuthCallback();
});
