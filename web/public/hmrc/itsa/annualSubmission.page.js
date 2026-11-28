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

let loadedNino = "";
let loadedBusinessId = "";
let loadedTaxYear = "";

const JOURNEY_LINKS = [
  { href: "dashboard.html", text: siteText("itsa.link-back", "Back to Income Tax") },
  { href: "obligations.html", text: siteText("itsa.link-obligations", "See your obligations") },
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
    title: siteText("itsa.field-structures-and-buildings-allowance", "Structures and Buildings Allowance"),
    intro: siteText("itsa-annual.sba-intro", "One claim for each building. Cannot be used with the trading income allowance."),
  },
);
const enhancedStructuredBuildingAllowance = window.structuredBuildingAllowanceRows.create(
  document.getElementById("enhancedStructuredBuildingAllowanceRows"),
  {
    idPrefix: "esba",
    title: siteText("itsa.field-freeport-structures-and-buildings-allowance", "Freeport Structures and Buildings Allowance"),
    intro: siteText(
      "itsa-annual.esba-intro",
      "One claim for each building in a freeport or investment zone. Cannot be used with the trading income allowance.",
    ),
  },
);

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

async function loadAnnualSubmission(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const govClientHeaders = await getGovClientHeaders();
  return await getSelfEmploymentAnnual(
    nino,
    businessId,
    taxYear,
    hmrcGrantId,
    govClientHeaders,
    runFraudPreventionHeaderValidation,
    testScenario,
  );
}

async function saveAnnualSubmission(annualDetails, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const govClientHeaders = await getGovClientHeaders();
  return await putSelfEmploymentAnnual(annualDetails, hmrcGrantId, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

async function continueAfterOAuth() {
  try {
    const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
    const pendingLoad = JSON.parse(sessionStorage.getItem("pendingAnnualLoadRequest") || "null");
    const pendingSave = JSON.parse(sessionStorage.getItem("pendingAnnualSaveRequest") || "null");

    if ((pendingLoad || pendingSave) && (await window.EntitlementStatus?.activityBundleHeld()) === false) {
      sessionStorage.removeItem("pendingAnnualLoadRequest");
      sessionStorage.removeItem("pendingAnnualSaveRequest");
      window.EntitlementStatus.showPassNeeded("hmrc");
      return;
    }

    if (pendingLoad) {
      showLoading();
      showStatus(siteText("itsa.annual-loading", "Loading annual submission..."), "info");
      const result = await loadAnnualSubmission(
        pendingLoad.nino,
        pendingLoad.businessId,
        pendingLoad.taxYear,
        pendingLoad.testScenario,
        pendingLoad.runFraudPreventionHeaderValidation,
        hmrcGrantId,
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
      showStatus(siteText("itsa.annual-saving", "Saving annual submission..."), "info");
      const saved = await saveAnnualSubmission(
        pendingSave.annualDetails,
        pendingSave.testScenario,
        pendingSave.runFraudPreventionHeaderValidation,
        hmrcGrantId,
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
    const refusedForNoPass = window.EntitlementStatus?.isBundleRefusal(error);
    if (refusedForNoPass) window.EntitlementStatus.showPassNeeded("hmrc");
    else showStatus(siteText("itsa.failed", "Failed: {reason}", { reason: error.message }), "error");
    sessionStorage.removeItem("pendingAnnualLoadRequest");
    sessionStorage.removeItem("pendingAnnualSaveRequest");
    if (!refusedForNoPass) {
      window.hmrcScopeCheck.clearHmrcToken();
      sessionStorage.removeItem("hmrcTokenScope");
    }
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

async function ensureAuthorizedThen(pendingKey, pendingValue, run) {
  if ((await window.EntitlementStatus?.activityBundleHeld()) === false) {
    window.EntitlementStatus.showPassNeeded("hmrc");
    return;
  }
  const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
  const scopeSufficient = hmrcGrantId && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!hmrcGrantId;

  if (!scopeSufficient) {
    if (hmrcGrantId && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    showLoading();
    showStatus(siteText("widget.hmrc-auth-starting", "Initiating HMRC authentication..."), "info");
    const state = generateRandomState();
    const hmrcAccount = await window.readHmrcAccount();
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
    async (hmrcGrantId) => {
      try {
        showLoading();
        hideStatus();
        showStatus(siteText("itsa.annual-loading", "Loading annual submission..."), "info");
        const result = await loadAnnualSubmission(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId);
        loadedNino = nino;
        loadedBusinessId = businessId;
        loadedTaxYear = taxYear;
        populateEditForm(result);
        document.getElementById("loadCriteriaForm").style.display = "none";
        document.getElementById("annualEditForm").style.display = "block";
        window.booksImport.applyPendingHandoff();
        hideStatus();
      } catch (error) {
        if (window.EntitlementStatus?.isBundleRefusal(error)) window.EntitlementStatus.showPassNeeded("hmrc");
        else
          showStatus(
            siteText("itsa.annual-load-failed", "Failed to load the annual submission: {reason}", { reason: error.message }),
            "error",
          );
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
    async (hmrcGrantId) => {
      try {
        showLoading();
        hideStatus();
        showStatus(siteText("itsa.annual-saving", "Saving annual submission..."), "info");
        const saved = await saveAnnualSubmission(annualDetails, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId);
        await showSavedRecord("self-employment", annualDetails, saved?.correlationId);
        hideStatus();
      } catch (error) {
        if (window.EntitlementStatus?.isBundleRefusal(error)) window.EntitlementStatus.showPassNeeded("hmrc");
        else
          showStatus(
            siteText("itsa.annual-save-failed", "Failed to save the annual submission: {reason}", { reason: error.message }),
            "error",
          );
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
