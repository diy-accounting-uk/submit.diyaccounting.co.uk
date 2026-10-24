// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

let loadedNino = "";
let loadedBusinessId = "";
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

  document.querySelectorAll('input[name="allowanceType"]').forEach((radio) => {
    radio.addEventListener("change", updateAllowanceFieldsEnabled);
  });
  updateAllowanceFieldsEnabled();
}

// The property income and itemised allowance forms are mutually exclusive - only one set
// of fields is enabled at a time, so a customer can never fill in both and have HMRC
// reject the submission with RULE_BOTH_ALLOWANCES_SUPPLIED.
function updateAllowanceFieldsEnabled() {
  const allowanceType = document.querySelector('input[name="allowanceType"]:checked')?.value || "";
  const propertyIncomeFields = document.querySelectorAll("#propertyIncomeAllowanceFields input");
  const itemisedFields = document.querySelectorAll("#itemisedAllowanceFields input");
  propertyIncomeFields.forEach((field) => (field.disabled = allowanceType !== "propertyIncome"));
  itemisedFields.forEach((field) => (field.disabled = allowanceType !== "itemised"));
}

function numberOrUndefined(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const num = window.parseMoneyInput(value);
  return num === 0 ? undefined : num;
}

function readAdjustments() {
  return {
    balancingCharge: numberOrUndefined(document.getElementById("balancingCharge").value),
    privateUseAdjustment: numberOrUndefined(document.getElementById("privateUseAdjustment").value),
    businessPremisesRenovationAllowanceBalancingCharges: numberOrUndefined(
      document.getElementById("businessPremisesRenovationAllowanceBalancingCharges").value,
    ),
    nonResidentLandlord: document.getElementById("nonResidentLandlord").checked,
    rentARoom: { jointlyLet: document.getElementById("rentARoomJointlyLet").checked },
  };
}

function readAllowances() {
  const allowanceType = document.querySelector('input[name="allowanceType"]:checked')?.value || "";
  if (allowanceType === "propertyIncome") {
    return { propertyIncomeAllowance: numberOrUndefined(document.getElementById("propertyIncomeAllowance").value) };
  }
  if (allowanceType === "itemised") {
    return {
      annualInvestmentAllowance: numberOrUndefined(document.getElementById("annualInvestmentAllowance").value),
      businessPremisesRenovationAllowance: numberOrUndefined(document.getElementById("businessPremisesRenovationAllowance").value),
      otherCapitalAllowance: numberOrUndefined(document.getElementById("otherCapitalAllowance").value),
      costOfReplacingDomesticItems: numberOrUndefined(document.getElementById("costOfReplacingDomesticItems").value),
      zeroEmissionsCarAllowance: numberOrUndefined(document.getElementById("zeroEmissionsCarAllowance").value),
    };
  }
  return {};
}

function populateEditForm(annualSubmission) {
  // A figure the last load filled in must not stay behind when this load has none, or the
  // customer would save another business's figure.
  document.querySelectorAll("#annualEditForm input:not([type=radio]):not([type=checkbox]), #annualEditForm select").forEach((field) => {
    field.value = "";
  });
  const ukProperty = annualSubmission?.ukProperty || {};
  const adjustments = ukProperty.adjustments || {};
  const allowances = ukProperty.allowances || {};

  ["balancingCharge", "privateUseAdjustment", "businessPremisesRenovationAllowanceBalancingCharges"].forEach((key) => {
    const field = document.getElementById(key);
    if (field && adjustments[key] !== undefined) field.value = adjustments[key];
  });
  document.getElementById("nonResidentLandlord").checked = adjustments.nonResidentLandlord === true;
  document.getElementById("rentARoomJointlyLet").checked = adjustments.rentARoom?.jointlyLet === true;

  if (allowances.propertyIncomeAllowance !== undefined) {
    document.getElementById("allowanceTypePropertyIncome").checked = true;
    document.getElementById("propertyIncomeAllowance").value = allowances.propertyIncomeAllowance;
  } else if (Object.keys(allowances).length > 0) {
    document.getElementById("allowanceTypeItemised").checked = true;
    Object.keys(allowances).forEach((key) => {
      const field = document.getElementById(key);
      if (field) field.value = allowances[key];
    });
  } else {
    document.getElementById("allowanceTypeNone").checked = true;
  }
  updateAllowanceFieldsEnabled();
}

async function loadAnnualSubmission(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await getUkPropertyAnnual(
    nino,
    businessId,
    taxYear,
    accessToken,
    govClientHeaders,
    runFraudPreventionHeaderValidation,
    testScenario,
  );
}

async function saveAnnualSubmission(annualDetails, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  // The scenario above exists for the retrieve, whose sandbox default is not-found. Create
  // and amend does not accept those values and answers "The supplied Gov-Test-Scenario is
  // not valid", so a save that forwarded it could never succeed.
  return await putUkPropertyAnnual(annualDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation);
}

async function continueAfterOAuth() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingLoad = JSON.parse(sessionStorage.getItem("pendingUkPropertyAnnualLoadRequest") || "null");
    const pendingSave = JSON.parse(sessionStorage.getItem("pendingUkPropertyAnnualSaveRequest") || "null");

    if (pendingLoad) {
      showLoading();
      showStatus("Loading annual submission...", "info");
      const result = await loadAnnualSubmission(
        pendingLoad.nino,
        pendingLoad.businessId,
        pendingLoad.taxYear,
        pendingLoad.testScenario,
        pendingLoad.runFraudPreventionHeaderValidation,
        accessToken,
      );
      loadedNino = pendingLoad.nino;
      loadedBusinessId = pendingLoad.businessId;
      loadedTaxYear = pendingLoad.taxYear;
      populateEditForm(result);
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("annualEditForm").style.display = "block";
      hideStatus();
      sessionStorage.removeItem("pendingUkPropertyAnnualLoadRequest");
    } else if (pendingSave) {
      showLoading();
      showStatus("Saving annual submission...", "info");
      await saveAnnualSubmission(pendingSave.annualDetails, pendingSave.runFraudPreventionHeaderValidation, accessToken);
      document.getElementById("annualEditForm").style.display = "none";
      document.getElementById("annualSubmissionResults").style.display = "block";
      hideStatus();
      sessionStorage.removeItem("pendingUkPropertyAnnualSaveRequest");
    } else {
      return;
    }
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
    sessionStorage.removeItem("pendingUkPropertyAnnualLoadRequest");
    sessionStorage.removeItem("pendingUkPropertyAnnualSaveRequest");
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
  const businessId = document.getElementById("businessId").value.trim();
  const taxYear = document.getElementById("taxYear").value.trim();
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;

  await ensureAuthorizedThen(
    "pendingUkPropertyAnnualLoadRequest",
    { nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Loading annual submission...", "info");
        const result = await loadAnnualSubmission(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken);
        loadedNino = nino;
        loadedBusinessId = businessId;
        loadedTaxYear = taxYear;
        populateEditForm(result);
        document.getElementById("loadCriteriaForm").style.display = "none";
        document.getElementById("annualEditForm").style.display = "block";
        hideStatus();
      } catch (error) {
        showStatus(`Failed to load the annual submission: ${error.message}`, "error");
      } finally {
        hideLoading();
      }
    },
  );
}

async function handleSaveClick() {
  if (window.formErrors.reportMoneyProblems()) return;
  const annualDetails = {
    nino: loadedNino,
    businessId: loadedBusinessId,
    taxYear: loadedTaxYear,
    adjustments: readAdjustments(),
    allowances: readAllowances(),
  };
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  await ensureAuthorizedThen(
    "pendingUkPropertyAnnualSaveRequest",
    { annualDetails, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Saving annual submission...", "info");
        await saveAnnualSubmission(annualDetails, runFraudPreventionHeaderValidation, accessToken);
        document.getElementById("annualEditForm").style.display = "none";
        document.getElementById("annualSubmissionResults").style.display = "block";
        hideStatus();
      } catch (error) {
        showStatus(`Failed to save the annual submission: ${error.message}`, "error");
      } finally {
        hideLoading();
      }
    },
  );
}

document.getElementById("itsaAnnualLoadForm").addEventListener("submit", handleLoadFormSubmission);
document.getElementById("saveBtn").addEventListener("click", handleSaveClick);

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("annualSubmissionResults").style.display = "none";
  document.getElementById("loadCriteriaForm").style.display = "block";
  document.getElementById("annualEditForm").style.display = "none";
  document.getElementById("itsaAnnualLoadForm").reset();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  handleOAuthCallback();
});
