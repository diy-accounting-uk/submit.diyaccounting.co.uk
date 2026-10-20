// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

let loadedNino = "";
let loadedBusinessId = "";
let loadedTaxYear = "";
let loadedTypeOfBusiness = "self-employment";

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

  restoreSuspendTemporalValidations();
}

// Load needs a wider HMRC scope than a plain read, so ticking this checkbox before Load
// can be followed by HMRC's own reauthorisation redirect, which reloads the page and
// resets the checkbox (it's plain DOM state, not sessionStorage). Persisting the tick
// into the same carrier the save retry after reauth already uses lets it survive that
// reload and still be set when Save reads it.
function persistSuspendTemporalValidations() {
  const checkbox = document.getElementById("suspendTemporalValidations");
  if (!checkbox?.checked) return;
  const pendingSave = JSON.parse(sessionStorage.getItem("pendingLossesSaveRequest") || "null") || {};
  pendingSave.lossesDetails = { ...(pendingSave.lossesDetails || {}), suspendTemporalValidations: true };
  sessionStorage.setItem("pendingLossesSaveRequest", JSON.stringify(pendingSave));
}

function restoreSuspendTemporalValidations() {
  const pendingSave = JSON.parse(sessionStorage.getItem("pendingLossesSaveRequest") || "null");
  if (pendingSave?.lossesDetails?.suspendTemporalValidations) {
    document.getElementById("suspendTemporalValidations").checked = true;
  }
}

// Carry-back is refused server-side for anything but a sole trade (the sandbox's
// CARRY_BACK_CLAIM scenario), so the page hides the section entirely for a property
// business rather than letting the customer fill it in and be turned away.
function updateCarryBackVisibility() {
  const typeOfBusiness = document.getElementById("typeOfBusiness").value;
  const isSelfEmployment = typeOfBusiness === "self-employment";
  document.getElementById("carryBackSection").style.display = isSelfEmployment ? "block" : "none";
  if (!isSelfEmployment) {
    document.getElementById("previousYearGeneralIncome").value = 0;
    document.getElementById("earlyYearLosses").value = 0;
    document.getElementById("terminalLosses").value = 0;
  }
  updateClaimSummary();
}

function hasEntry(...values) {
  return values.some((v) => (window.parseMoneyInput(v) ?? 0) !== 0);
}

// States plainly which claim is about to be made, before the customer saves - the
// sentence the plan calls for, so a customer never sends a claim they did not mean to.
function updateClaimSummary() {
  const carryForward = hasEntry(document.getElementById("currentYearLosses").value, document.getElementById("previousYearsLosses").value);
  const carrySideways = hasEntry(document.getElementById("currentYearGeneralIncome").value);
  const carryBack = hasEntry(
    document.getElementById("previousYearGeneralIncome").value,
    document.getElementById("earlyYearLosses").value,
    document.getElementById("terminalLosses").value,
  );

  const preferenceOrderSection = document.getElementById("preferenceOrderSection");
  preferenceOrderSection.style.display = carrySideways && carryBack ? "block" : "none";
  if (!(carrySideways && carryBack)) document.getElementById("applyFirst").value = "";

  const claims = [];
  if (carryForward) claims.push("carry the loss forward");
  if (carrySideways) claims.push("set it sideways against this year's other income");
  if (carryBack) claims.push("carry it back to an earlier year");

  const summary = document.getElementById("claimSummary");
  summary.textContent = claims.length > 0 ? `This save will ${claims.join(", ")}.` : "No claim is entered yet.";
}

function readLosses() {
  const broughtForwardLosses = window.parseMoneyInput(document.getElementById("broughtForwardLosses").value) ?? 0;
  return broughtForwardLosses !== 0 ? { broughtForwardLosses } : {};
}

function readClaims() {
  const claims = {};

  const currentYearLosses = window.parseMoneyInput(document.getElementById("currentYearLosses").value) ?? 0;
  const previousYearsLosses = window.parseMoneyInput(document.getElementById("previousYearsLosses").value) ?? 0;
  if (currentYearLosses !== 0 || previousYearsLosses !== 0) {
    claims.carryForward = {};
    if (currentYearLosses !== 0) claims.carryForward.currentYearLosses = currentYearLosses;
    if (previousYearsLosses !== 0) claims.carryForward.previousYearsLosses = previousYearsLosses;
  }

  const currentYearGeneralIncome = window.parseMoneyInput(document.getElementById("currentYearGeneralIncome").value) ?? 0;
  if (currentYearGeneralIncome !== 0) {
    claims.carrySideways = { currentYearGeneralIncome };
  }

  if (document.getElementById("typeOfBusiness").value === "self-employment") {
    const previousYearGeneralIncome = window.parseMoneyInput(document.getElementById("previousYearGeneralIncome").value) ?? 0;
    const earlyYearLosses = window.parseMoneyInput(document.getElementById("earlyYearLosses").value) ?? 0;
    const terminalLosses = window.parseMoneyInput(document.getElementById("terminalLosses").value) ?? 0;
    if (previousYearGeneralIncome !== 0 || earlyYearLosses !== 0 || terminalLosses !== 0) {
      claims.carryBack = {};
      if (previousYearGeneralIncome !== 0) claims.carryBack.previousYearGeneralIncome = previousYearGeneralIncome;
      if (earlyYearLosses !== 0) claims.carryBack.earlyYearLosses = earlyYearLosses;
      if (terminalLosses !== 0) claims.carryBack.terminalLosses = terminalLosses;
    }
  }

  const applyFirst = document.getElementById("applyFirst").value;
  if (applyFirst && claims.carrySideways && claims.carryBack) {
    claims.preferenceOrder = { applyFirst };
  }

  return claims;
}

function populateEditForm(lossesAndClaims) {
  const losses = lossesAndClaims?.losses || {};
  const claims = lossesAndClaims?.claims || {};

  document.getElementById("broughtForwardLosses").value = losses.broughtForwardLosses ?? 0;
  document.getElementById("currentYearLosses").value = claims.carryForward?.currentYearLosses ?? 0;
  document.getElementById("previousYearsLosses").value = claims.carryForward?.previousYearsLosses ?? 0;
  document.getElementById("currentYearGeneralIncome").value = claims.carrySideways?.currentYearGeneralIncome ?? 0;
  document.getElementById("previousYearGeneralIncome").value = claims.carryBack?.previousYearGeneralIncome ?? 0;
  document.getElementById("earlyYearLosses").value = claims.carryBack?.earlyYearLosses ?? 0;
  document.getElementById("terminalLosses").value = claims.carryBack?.terminalLosses ?? 0;
  document.getElementById("applyFirst").value = claims.preferenceOrder?.applyFirst || "";

  updateCarryBackVisibility();
}

async function loadLossesAndClaims(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await getLossesAndClaims(
    nino,
    businessId,
    taxYear,
    accessToken,
    govClientHeaders,
    runFraudPreventionHeaderValidation,
    testScenario,
  );
}

async function saveLossesAndClaims(lossesDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await putLossesAndClaims(lossesDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

async function continueAfterOAuth() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingLoad = JSON.parse(sessionStorage.getItem("pendingLossesLoadRequest") || "null");
    const pendingSave = JSON.parse(sessionStorage.getItem("pendingLossesSaveRequest") || "null");

    if (pendingLoad) {
      showLoading();
      showStatus("Loading losses and claims...", "info");
      const result = await loadLossesAndClaims(
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
      loadedTypeOfBusiness = pendingLoad.typeOfBusiness;
      populateEditForm(result);
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("lossesEditForm").style.display = "block";
      hideStatus();
      sessionStorage.removeItem("pendingLossesLoadRequest");
    } else if (pendingSave) {
      showLoading();
      showStatus("Saving losses and claims...", "info");
      await saveLossesAndClaims(
        pendingSave.lossesDetails,
        pendingSave.testScenario,
        pendingSave.runFraudPreventionHeaderValidation,
        accessToken,
      );
      document.getElementById("lossesEditForm").style.display = "none";
      document.getElementById("lossesResults").style.display = "block";
      hideStatus();
      sessionStorage.removeItem("pendingLossesSaveRequest");
    } else {
      return;
    }
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
    sessionStorage.removeItem("pendingLossesLoadRequest");
    sessionStorage.removeItem("pendingLossesSaveRequest");
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
    persistSuspendTemporalValidations();
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
  const typeOfBusiness = document.getElementById("typeOfBusiness").value;
  const taxYear = document.getElementById("taxYear").value.trim();
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;

  await ensureAuthorizedThen(
    "pendingLossesLoadRequest",
    { nino, businessId, taxYear, typeOfBusiness, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Loading losses and claims...", "info");
        const result = await loadLossesAndClaims(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken);
        loadedNino = nino;
        loadedBusinessId = businessId;
        loadedTaxYear = taxYear;
        loadedTypeOfBusiness = typeOfBusiness;
        populateEditForm(result);
        document.getElementById("loadCriteriaForm").style.display = "none";
        document.getElementById("lossesEditForm").style.display = "block";
        hideStatus();
      } catch (error) {
        if (error.status === 404 || /not.?found/i.test(error.message)) {
          loadedNino = nino;
          loadedBusinessId = businessId;
          loadedTaxYear = taxYear;
          loadedTypeOfBusiness = typeOfBusiness;
          populateEditForm(null);
          document.getElementById("loadCriteriaForm").style.display = "none";
          document.getElementById("lossesEditForm").style.display = "block";
          showStatus("HMRC has no losses or claims on file yet for this business and tax year.", "info");
        } else {
          showStatus(`Failed to load losses and claims: ${error.message}`, "error");
        }
      } finally {
        hideLoading();
      }
    },
  );
}

async function handleSaveClick() {
  if (window.formErrors.reportMoneyProblems()) return;
  const lossesDetails = {
    nino: loadedNino,
    businessId: loadedBusinessId,
    taxYear: loadedTaxYear,
    typeOfBusiness: loadedTypeOfBusiness,
    losses: readLosses(),
    claims: readClaims(),
    suspendTemporalValidations: document.getElementById("suspendTemporalValidations")?.checked || false,
  };
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  await ensureAuthorizedThen(
    "pendingLossesSaveRequest",
    { lossesDetails, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Saving losses and claims...", "info");
        await saveLossesAndClaims(lossesDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
        document.getElementById("lossesEditForm").style.display = "none";
        document.getElementById("lossesResults").style.display = "block";
        hideStatus();
      } catch (error) {
        showStatus(`Failed to save losses and claims: ${error.message}`, "error");
      } finally {
        hideLoading();
      }
    },
  );
}

document.getElementById("itsaLossesLoadForm").addEventListener("submit", handleLoadFormSubmission);
document.getElementById("saveBtn").addEventListener("click", handleSaveClick);
document.getElementById("typeOfBusiness").addEventListener("change", updateCarryBackVisibility);

["broughtForwardLosses", "currentYearLosses", "previousYearsLosses", "currentYearGeneralIncome"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateClaimSummary);
});
["previousYearGeneralIncome", "earlyYearLosses", "terminalLosses"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateClaimSummary);
});
document.getElementById("applyFirst").addEventListener("change", updateClaimSummary);

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("lossesResults").style.display = "none";
  document.getElementById("loadCriteriaForm").style.display = "block";
  document.getElementById("lossesEditForm").style.display = "none";
  document.getElementById("itsaLossesLoadForm").reset();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  handleOAuthCallback();
});
