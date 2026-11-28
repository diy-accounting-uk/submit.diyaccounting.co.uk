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
    intro: siteText("itsa-uk-annual.sba-intro", "One claim for each building. Cannot be used with the property income allowance."),
  },
);
const enhancedStructuredBuildingAllowance = window.structuredBuildingAllowanceRows.create(
  document.getElementById("enhancedStructuredBuildingAllowanceRows"),
  {
    idPrefix: "esba",
    title: siteText("itsa.field-freeport-structures-and-buildings-allowance", "Freeport Structures and Buildings Allowance"),
    intro: siteText(
      "itsa-uk-annual.esba-intro",
      "One claim for each building in a freeport or investment zone. Cannot be used with the property income allowance.",
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

// The property income and itemised allowance forms are mutually exclusive - only one set
// of fields is enabled at a time, so a customer can never fill in both and have HMRC
// reject the submission with RULE_BOTH_ALLOWANCES_SUPPLIED.
function updateAllowanceFieldsEnabled() {
  const allowanceType = document.querySelector('input[name="allowanceType"]:checked')?.value || "";
  const propertyIncomeFields = document.querySelectorAll("#propertyIncomeAllowanceFields input");
  const itemisedFields = document.querySelectorAll("#itemisedAllowanceFields input");
  propertyIncomeFields.forEach((field) => (field.disabled = allowanceType !== "propertyIncome"));
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
    const sba = structuredBuildingAllowance.read();
    const enhancedSba = enhancedStructuredBuildingAllowance.read();
    return {
      ...(sba.length > 0 && { structuredBuildingAllowance: sba }),
      ...(enhancedSba.length > 0 && { enhancedStructuredBuildingAllowance: enhancedSba }),
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
    structuredBuildingAllowance.set(allowances.structuredBuildingAllowance);
    enhancedStructuredBuildingAllowance.set(allowances.enhancedStructuredBuildingAllowance);
  } else {
    structuredBuildingAllowance.set([]);
    enhancedStructuredBuildingAllowance.set([]);
    document.getElementById("allowanceTypeNone").checked = true;
  }
  updateAllowanceFieldsEnabled();
}

async function loadAnnualSubmission(nino, businessId, taxYear, testScenario, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const govClientHeaders = await getGovClientHeaders();
  return await getUkPropertyAnnual(
    nino,
    businessId,
    taxYear,
    hmrcGrantId,
    govClientHeaders,
    runFraudPreventionHeaderValidation,
    testScenario,
  );
}

async function saveAnnualSubmission(annualDetails, runFraudPreventionHeaderValidation, hmrcGrantId) {
  const govClientHeaders = await getGovClientHeaders();
  // The scenario above exists for the retrieve, whose sandbox default is not-found. Create
  // and amend does not accept those values and answers "The supplied Gov-Test-Scenario is
  // not valid", so a save that forwarded it could never succeed.
  return await putUkPropertyAnnual(annualDetails, hmrcGrantId, govClientHeaders, runFraudPreventionHeaderValidation);
}

// The stage the save shows while it sends, and the failure panel's first two lines.
function annualFilingWords() {
  return {
    sending: siteText("itsa.uk-narrate-sending-annual", "Sending the UK property annual submission to HMRC..."),
    notSent: siteText("itsa.uk-failure-not-sent-annual", "HMRC has not got the UK property annual submission."),
    answers: siteText("itsa.uk-failure-answers-form", "Your figures are still in the form."),
  };
}

// Saves through the HMRC write helper, marking a failure the helper's panel already shows.
async function saveWithStages(annualDetails, runFraudPreventionHeaderValidation, hmrcGrantId) {
  try {
    return await window.fileWithHmrc(annualFilingWords(), () =>
      saveAnnualSubmission(annualDetails, runFraudPreventionHeaderValidation, hmrcGrantId),
    );
  } catch (error) {
    error.shownInPanel = true;
    throw error;
  }
}

async function continueAfterOAuth() {
  try {
    const hmrcGrantId = window.hmrcScopeCheck.storedGrantId();
    const pendingLoad = JSON.parse(sessionStorage.getItem("pendingUkPropertyAnnualLoadRequest") || "null");
    const pendingSave = JSON.parse(sessionStorage.getItem("pendingUkPropertyAnnualSaveRequest") || "null");

    if ((pendingLoad || pendingSave) && (await window.EntitlementStatus?.activityBundleHeld()) === false) {
      sessionStorage.removeItem("pendingUkPropertyAnnualLoadRequest");
      sessionStorage.removeItem("pendingUkPropertyAnnualSaveRequest");
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
      hideStatus();
      sessionStorage.removeItem("pendingUkPropertyAnnualLoadRequest");
    } else if (pendingSave) {
      showLoading();
      const saved = await saveWithStages(pendingSave.annualDetails, pendingSave.runFraudPreventionHeaderValidation, hmrcGrantId);
      await showSavedRecord("uk-property", pendingSave.annualDetails, saved?.correlationId);
      hideStatus();
      sessionStorage.removeItem("pendingUkPropertyAnnualSaveRequest");
    } else {
      return;
    }
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    const refusedForNoPass = window.EntitlementStatus?.isBundleRefusal(error);
    if (refusedForNoPass) window.EntitlementStatus.showPassNeeded("hmrc");
    else if (error.shownInPanel) hideStatus();
    else showStatus(siteText("itsa.failed", "Failed: {reason}", { reason: error.message }), "error");
    sessionStorage.removeItem("pendingUkPropertyAnnualLoadRequest");
    sessionStorage.removeItem("pendingUkPropertyAnnualSaveRequest");
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
    "pendingUkPropertyAnnualLoadRequest",
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
  };
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  await ensureAuthorizedThen(
    "pendingUkPropertyAnnualSaveRequest",
    { annualDetails, testScenario, runFraudPreventionHeaderValidation },
    async (hmrcGrantId) => {
      try {
        showLoading();
        hideStatus();
        const saved = await saveWithStages(annualDetails, runFraudPreventionHeaderValidation, hmrcGrantId);
        await showSavedRecord("uk-property", annualDetails, saved?.correlationId);
        hideStatus();
      } catch (error) {
        if (window.EntitlementStatus?.isBundleRefusal(error)) window.EntitlementStatus.showPassNeeded("hmrc");
        else if (error.shownInPanel) hideStatus();
        else {
          showStatus(
            siteText("itsa.annual-save-failed", "Failed to save the annual submission: {reason}", { reason: error.message }),
            "error",
          );
        }
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

const BOOK_ADJUSTMENT_IDS = ["balancingCharge", "privateUseAdjustment", "businessPremisesRenovationAllowanceBalancingCharges"];

function setBookFigure(id, value) {
  const field = document.getElementById(id);
  field.value = String(value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

// Fills the adjustments and the itemised allowances. The property income allowance election, the
// non-resident landlord box and the rent a room box stay as the customer set them; itemised
// allowances from the book do not fill while the customer has chosen the property income allowance.
function fillFromBooks(figures) {
  const unmapped = [];
  let imported = 0;
  Object.entries(figures.adjustments).forEach(([key, value]) => {
    if (typeof value === "number" && BOOK_ADJUSTMENT_IDS.includes(key)) {
      setBookFigure(key, value);
      imported += 1;
    } else {
      unmapped.push(`adjustments.${key}`);
    }
  });
  const choseIncomeAllowance = document.getElementById("allowanceTypePropertyIncome").checked;
  if (choseIncomeAllowance) {
    Object.keys(figures.allowances).forEach((key) => unmapped.push(`allowances.${key}`));
    return { imported, unmapped };
  }
  Object.entries(figures.allowances).forEach(([key, value]) => {
    if (typeof value === "number" && document.getElementById(key)) {
      document.getElementById("allowanceTypeItemised").checked = true;
      updateAllowanceFieldsEnabled();
      setBookFigure(key, value);
      imported += 1;
    } else {
      unmapped.push(`allowances.${key}`);
    }
  });
  return { imported, unmapped };
}

window.booksImport.mount(document.getElementById("booksImport"), {
  kind: "uk-property-annual",
  taxYear: () => loadedTaxYear,
  fill: fillFromBooks,
});
