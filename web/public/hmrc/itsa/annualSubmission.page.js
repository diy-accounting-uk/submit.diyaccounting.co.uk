// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

let loadedNino = "";
let loadedBusinessId = "";
let loadedTaxYear = "";

const JOURNEY_LINKS = [
  { href: "dashboard.html", text: "Back to Income Tax" },
  { href: "obligations.html", text: "See your obligations" },
];

async function showSavedRecord(kind, annualDetails, correlationId) {
  const { annualCopyHtml, mountCopy } = await import("../../lib/itsa-submission-record.js");
  mountCopy(
    document.getElementById("annualSubmissionCopy"),
    annualCopyHtml({
      kind,
      nino: annualDetails.nino,
      businessId: annualDetails.businessId,
      taxYear: annualDetails.taxYear,
      savedAt: new Date().toISOString(),
      correlationId,
      sent: { adjustments: annualDetails.adjustments, allowances: annualDetails.allowances, nonFinancials: annualDetails.nonFinancials },
      links: JOURNEY_LINKS,
    }),
  );
  document.getElementById("annualEditForm").style.display = "none";
  document.getElementById("annualSubmissionResults").style.display = "block";
}

const structuredBuildingAllowance = window.structuredBuildingAllowanceRows.create(
  document.getElementById("structuredBuildingAllowanceRows"),
  {
    idPrefix: "sba",
    title: "Structures and Buildings Allowance",
    intro: "One claim for each building. Cannot be used with the trading income allowance.",
  },
);
const enhancedStructuredBuildingAllowance = window.structuredBuildingAllowanceRows.create(
  document.getElementById("enhancedStructuredBuildingAllowanceRows"),
  {
    idPrefix: "esba",
    title: "Freeport Structures and Buildings Allowance",
    intro: "One claim for each building in a freeport or investment zone. Cannot be used with the trading income allowance.",
  },
);

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

// The trading and itemised allowance forms are mutually exclusive - only one set of
// fields is enabled at a time, so a customer can never fill in both and have HMRC
// reject the submission with RULE_BOTH_ALLOWANCES_SUPPLIED.
function updateAllowanceFieldsEnabled() {
  const allowanceType = document.querySelector('input[name="allowanceType"]:checked')?.value || "";
  const tradingFields = document.querySelectorAll("#tradingAllowanceFields input");
  const itemisedFields = document.querySelectorAll("#itemisedAllowanceFields input");
  tradingFields.forEach((field) => (field.disabled = allowanceType !== "trading"));
  itemisedFields.forEach((field) => (field.disabled = allowanceType !== "itemised"));
  structuredBuildingAllowance.setDisabled(allowanceType !== "itemised");
  enhancedStructuredBuildingAllowance.setDisabled(allowanceType !== "itemised");
}

function numberOrUndefined(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const num = window.parseMoneyInput(value);
  return num === 0 ? undefined : num;
}

function readAdjustments() {
  return {
    includedNonTaxableProfits: numberOrUndefined(document.getElementById("includedNonTaxableProfits").value),
    basisAdjustment: numberOrUndefined(document.getElementById("basisAdjustment").value),
    accountingAdjustment: numberOrUndefined(document.getElementById("accountingAdjustment").value),
    outstandingBusinessIncome: numberOrUndefined(document.getElementById("outstandingBusinessIncome").value),
    balancingChargeBpra: numberOrUndefined(document.getElementById("balancingChargeBpra").value),
    balancingChargeOther: numberOrUndefined(document.getElementById("balancingChargeOther").value),
    goodsAndServicesOwnUse: numberOrUndefined(document.getElementById("goodsAndServicesOwnUse").value),
    transitionProfitAmount: numberOrUndefined(document.getElementById("transitionProfitAmount").value),
    transitionProfitAccelerationAmount: numberOrUndefined(document.getElementById("transitionProfitAccelerationAmount").value),
  };
}

function readAllowances() {
  const allowanceType = document.querySelector('input[name="allowanceType"]:checked')?.value || "";
  if (allowanceType === "trading") {
    return { tradingIncomeAllowance: numberOrUndefined(document.getElementById("tradingIncomeAllowance").value) };
  }
  if (allowanceType === "itemised") {
    const sba = structuredBuildingAllowance.read();
    const enhancedSba = enhancedStructuredBuildingAllowance.read();
    return {
      ...(sba.length > 0 && { structuredBuildingAllowance: sba }),
      ...(enhancedSba.length > 0 && { enhancedStructuredBuildingAllowance: enhancedSba }),
      annualInvestmentAllowance: numberOrUndefined(document.getElementById("annualInvestmentAllowance").value),
      capitalAllowanceMainPool: numberOrUndefined(document.getElementById("capitalAllowanceMainPool").value),
      capitalAllowanceSpecialRatePool: numberOrUndefined(document.getElementById("capitalAllowanceSpecialRatePool").value),
      businessPremisesRenovationAllowance: numberOrUndefined(document.getElementById("businessPremisesRenovationAllowance").value),
      enhancedCapitalAllowance: numberOrUndefined(document.getElementById("enhancedCapitalAllowance").value),
      allowanceOnSales: numberOrUndefined(document.getElementById("allowanceOnSales").value),
      capitalAllowanceSingleAssetPool: numberOrUndefined(document.getElementById("capitalAllowanceSingleAssetPool").value),
      zeroEmissionsCarAllowance: numberOrUndefined(document.getElementById("zeroEmissionsCarAllowance").value),
    };
  }
  return {};
}

function readNonFinancials() {
  const class4NicsExemptionReason = document.getElementById("class4NicsExemptionReason").value;
  return class4NicsExemptionReason ? { class4NicsExemptionReason } : {};
}

function populateEditForm(annualSubmission) {
  // A figure the last load filled in must not stay behind when this load has none, or the
  // customer would save another business's figure.
  document.querySelectorAll("#annualEditForm input:not([type=radio]):not([type=checkbox]), #annualEditForm select").forEach((field) => {
    field.value = "";
  });
  const adjustments = annualSubmission?.adjustments || {};
  const allowances = annualSubmission?.allowances || {};
  const nonFinancials = annualSubmission?.nonFinancials || {};

  Object.keys(adjustments).forEach((key) => {
    const field = document.getElementById(key);
    if (field) field.value = adjustments[key];
  });

  if (allowances.tradingIncomeAllowance !== undefined) {
    document.getElementById("allowanceTypeTrading").checked = true;
    document.getElementById("tradingIncomeAllowance").value = allowances.tradingIncomeAllowance;
  } else if (Object.keys(allowances).length > 0) {
    document.getElementById("allowanceTypeItemised").checked = true;
    Object.keys(allowances).forEach((key) => {
      const field = document.getElementById(key);
      if (field) field.value = allowances[key];
    });
    structuredBuildingAllowance.set(allowances.structuredBuildingAllowance);
    enhancedStructuredBuildingAllowance.set(allowances.enhancedStructuredBuildingAllowance);
  } else {
    structuredBuildingAllowance.set([]);
    enhancedStructuredBuildingAllowance.set([]);
    document.getElementById("allowanceTypeNone").checked = true;
  }
  updateAllowanceFieldsEnabled();

  document.getElementById("class4NicsExemptionReason").value = nonFinancials.class4NicsExemptionReason || "";
}

async function loadAnnualSubmission(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await getSelfEmploymentAnnual(
    nino,
    businessId,
    taxYear,
    accessToken,
    govClientHeaders,
    runFraudPreventionHeaderValidation,
    testScenario,
  );
}

async function saveAnnualSubmission(annualDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await putSelfEmploymentAnnual(annualDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

async function continueAfterOAuth() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingLoad = JSON.parse(sessionStorage.getItem("pendingAnnualLoadRequest") || "null");
    const pendingSave = JSON.parse(sessionStorage.getItem("pendingAnnualSaveRequest") || "null");

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
      window.booksImport.applyPendingHandoff();
      hideStatus();
      sessionStorage.removeItem("pendingAnnualLoadRequest");
    } else if (pendingSave) {
      showLoading();
      showStatus("Saving annual submission...", "info");
      const saved = await saveAnnualSubmission(
        pendingSave.annualDetails,
        pendingSave.testScenario,
        pendingSave.runFraudPreventionHeaderValidation,
        accessToken,
      );
      await showSavedRecord("self-employment", pendingSave.annualDetails, saved?.correlationId);
      hideStatus();
      sessionStorage.removeItem("pendingAnnualSaveRequest");
    } else {
      return;
    }
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
    sessionStorage.removeItem("pendingAnnualLoadRequest");
    sessionStorage.removeItem("pendingAnnualSaveRequest");
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
    "pendingAnnualLoadRequest",
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
        window.booksImport.applyPendingHandoff();
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
  const claimErrors = [...structuredBuildingAllowance.validate(), ...enhancedStructuredBuildingAllowance.validate()];
  if (claimErrors.length > 0 && document.querySelector('input[name="allowanceType"]:checked')?.value === "itemised") {
    window.formErrors.showFormErrors(claimErrors);
    return;
  }
  const annualDetails = {
    nino: loadedNino,
    businessId: loadedBusinessId,
    taxYear: loadedTaxYear,
    adjustments: readAdjustments(),
    allowances: readAllowances(),
    nonFinancials: readNonFinancials(),
  };
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  await ensureAuthorizedThen(
    "pendingAnnualSaveRequest",
    { annualDetails, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Saving annual submission...", "info");
        const saved = await saveAnnualSubmission(annualDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
        await showSavedRecord("self-employment", annualDetails, saved?.correlationId);
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

window.booksImport.mount(document.getElementById("booksImport"), {
  kind: "itsa-annual",
  taxYear: () => loadedTaxYear,
  fill: (figures) => {
    const unmapped = [];
    let imported = 0;
    Object.entries({ allowances: figures.allowances, adjustments: figures.adjustments }).forEach(([group, values]) => {
      Object.keys(values).forEach((key) => {
        if (Array.isArray(values[key]) && document.getElementById(`${key}Rows`)) imported += values[key].length;
        else if (typeof values[key] === "number" && document.getElementById(key)) imported += 1;
        else unmapped.push(`${group}.${key}`);
      });
    });
    populateEditForm({ allowances: figures.allowances, adjustments: figures.adjustments, nonFinancials: readNonFinancials() });
    return { imported, unmapped };
  },
});
