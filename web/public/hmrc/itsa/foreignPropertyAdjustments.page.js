// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

const PENDING_KEY = "pendingForeignPropertyBsasRequest";
const MONEY_HINT = "For example, £600 or £193.54";

// The figures HMRC lets a person adjust in one entry: the same names as the UK property adjustment,
// with the premium for a lease grant, the other expense lines and one total for all expenses.
const INCOME_FIELDS = [
  { id: "totalRentsReceived", label: "Total rents received" },
  { id: "premiumsOfLeaseGrant", label: "Premiums for the grant of a lease" },
  { id: "otherPropertyIncome", label: "Other property income" },
];

const ITEMISED_EXPENSE_FIELDS = [
  { id: "premisesRunningCosts", label: "Rent, rates, insurance and ground rents" },
  { id: "repairsAndMaintenance", label: "Repairs and maintenance" },
  { id: "financialCosts", label: "Loan interest and other financial costs" },
  { id: "professionalFees", label: "Legal, management and other professional fees" },
  { id: "costOfServices", label: "Costs of services provided, including wages" },
  { id: "travelCosts", label: "Travel costs" },
  { id: "other", label: "Other property expenses" },
  { id: "residentialFinancialCost", label: "Residential property finance costs" },
];

const CONSOLIDATED_FIELD = { id: "consolidatedExpenses", label: "Expenses as one total" };

let triggered = { nino: "", taxYear: "", calculationId: "" };
let adjustableEntries = [];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function initializePage() {
  if (sessionStorage.getItem("hmrcAccount") === "synthetic") {
    document.getElementById("syntheticIndicator")?.classList.add("visible");
  }
  const devSection = document.getElementById("developerSection");
  function updateDeveloperSectionVisibility() {
    const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
    if (devSection) devSection.style.display = developerModeEnabled ? "block" : "none";
  }
  updateDeveloperSectionVisibility();
  window.addEventListener("developer-mode-changed", updateDeveloperSectionVisibility);
}

function readCriteria() {
  return {
    nino: document.getElementById("nino").value.replace(/\s+/g, "").toUpperCase(),
    businessId: document.getElementById("businessId").value.trim(),
    taxYear: document.getElementById("taxYear").value.trim(),
    accountingPeriodStartDate: document.getElementById("accountingPeriodStartDate").value,
    accountingPeriodEndDate: document.getElementById("accountingPeriodEndDate").value,
    testScenario: document.getElementById("testScenario")?.value || null,
    runFraudPreventionHeaderValidation: document.getElementById("runFraudPreventionHeaderValidation")?.checked || false,
  };
}

function entryKeyName(taxYear) {
  return window.itsaSubmissionModel.resolveForeignPropertyEntryKey(taxYear);
}

// The entries of the summary that the adjustment can change: one for each country up to 2025-26, one
// for each property from 2026-27. Each is { key, name, detail } where detail is HMRC's figures.
function adjustableEntriesOf(bsas, taxYear) {
  const countries = bsas?.adjustableSummaryCalculation?.countryLevelDetail || [];
  if (entryKeyName(taxYear) === "countryCode") {
    return countries.map((detail) => ({ key: detail.countryCode, name: window.countryCodes.countryName(detail.countryCode), detail }));
  }
  return countries.flatMap((country) =>
    (country.propertyLevelDetail || []).map((detail) => ({
      key: detail.propertyId,
      name: `Property ${detail.propertyId} (${window.countryCodes.countryName(country.countryCode)})`,
      detail,
    })),
  );
}

// A trigger is refused while any quarterly obligation for the business is still open: HMRC would
// reject it with RULE_OBLIGATIONS_NOT_MET, so the page checks and explains before it calls.
async function checkOpenObligations(nino, businessId, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const result = await getObligations(nino, accessToken, govClientHeaders, false, null, {
    typeOfBusiness: "foreign-property",
    businessId,
    status: "open",
  });
  return (result?.obligations || []).filter((o) => o.status === "open" || o.status === "O");
}

// HMRC's retrieve is not stateful in the sandbox: with no Gov-Test-Scenario it answers no data
// found. A synthetic account without a chosen scenario sends a named one; a live account never
// carries a sandbox-only header.
async function retrieveSummary(criteria, calculationId, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const scenario = window.resolveSyntheticTestScenario(
    criteria.testScenario,
    sessionStorage.getItem("hmrcAccount"),
    "FOREIGN_PROPERTY_PROFIT",
  );
  return window.getBsasForeignProperty(criteria.nino, calculationId, criteria.taxYear, accessToken, govClientHeaders, false, scenario);
}

function moneyGroup(prefix, field) {
  return window.selfEmploymentExpenses.moneyGroup({ id: `${prefix}-${field.id}`, label: field.label }, MONEY_HINT);
}

function mountAdjustmentFields() {
  const container = document.getElementById("adjustEntries");
  if (adjustableEntries.length === 0) {
    container.replaceChildren(
      el("p", {
        className: "no-data",
        textContent: "HMRC returned no country or property to adjust. Choose Nothing to adjust to confirm the summary as it stands.",
      }),
    );
    return;
  }
  container.replaceChildren(
    ...adjustableEntries.map((entry, index) => {
      const prefix = `adjust-${index + 1}`;
      return el("fieldset", { className: "form-group foreign-property-entry", id: prefix }, [
        el("legend", { textContent: entry.name }),
        el("h4", { textContent: "Income" }),
        ...INCOME_FIELDS.map((field) => moneyGroup(prefix, field)),
        el("details", { className: "field-group", id: `${prefix}-expenses` }, [
          el("summary", { textContent: "Expenses" }),
          el("p", { className: "hint", textContent: "Enter the itemised expenses or one total, not both." }),
          ...ITEMISED_EXPENSE_FIELDS.map((field) => moneyGroup(prefix, field)),
          moneyGroup(prefix, CONSOLIDATED_FIELD),
        ]),
      ]);
    }),
  );
}

function displaySummary(bsas, taxYear) {
  const calculation = bsas?.adjustableSummaryCalculation;
  HmrcFieldTable.mountFieldTable(document.getElementById("summaryDetails"), HmrcFieldTable.foreignPropertySummaryRows(calculation), {
    caption: "Year-end summary",
  });
  adjustableEntries = adjustableEntriesOf(bsas, taxYear);
  document.getElementById("summaryEntries").replaceChildren(
    ...adjustableEntries.map((entry, index) => {
      const tableContainer = el("div", { id: `summary-entry-${index + 1}` });
      HmrcFieldTable.mountFieldTable(
        tableContainer,
        HmrcFieldTable.foreignPropertySummaryRows(entry.detail).map((row) => ({ ...row, definition: undefined, source: undefined })),
        {
          caption: `Year-end summary for ${entry.name}`,
        },
      );
      return el("section", { className: "foreign-summary-entry" }, [el("h4", { textContent: entry.name }), tableContainer]);
    }),
  );
  mountAdjustmentFields();
}

async function runTriggerAndRetrieve(criteria, accessToken) {
  showStatus("Requesting the year-end summary...", "info");
  const govClientHeaders = await getGovClientHeaders();
  const triggerResult = await triggerBsas(
    {
      nino: criteria.nino,
      businessId: criteria.businessId,
      accountingPeriodStartDate: criteria.accountingPeriodStartDate,
      accountingPeriodEndDate: criteria.accountingPeriodEndDate,
      typeOfBusiness: "foreign-property",
    },
    accessToken,
    govClientHeaders,
    criteria.runFraudPreventionHeaderValidation,
    criteria.testScenario,
  );
  triggered = { nino: criteria.nino, taxYear: criteria.taxYear, calculationId: triggerResult.calculationId };
  showStatus("Retrieving year-end summary...", "info");
  const bsas = await retrieveSummary(criteria, triggered.calculationId, accessToken);
  displaySummary(bsas, criteria.taxYear);
  document.getElementById("triggerForm").style.display = "none";
  document.getElementById("summaryContainer").style.display = "block";
  hideStatus();
}

async function sendAdjustment(request, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const { adjustDetails, testScenario, runFraudPreventionHeaderValidation } = request;
  await window.adjustBsasForeignProperty(adjustDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
  document.getElementById("summaryContainer").style.display = "none";
  document.getElementById("adjustmentResults").style.display = "block";
}

async function runRequest(request, accessToken) {
  try {
    showLoading();
    hideStatus();
    if (request.action === "trigger") {
      await runTriggerAndRetrieve(request.criteria, accessToken);
    } else {
      showStatus("Submitting adjustment...", "info");
      await sendAdjustment(request, accessToken);
      hideStatus();
    }
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please try again.", "error");
    } else {
      showStatus(
        `${request.action === "trigger" ? "Failed to request the year-end summary" : "Failed to submit the adjustment"}: ${error.message}`,
        "error",
      );
    }
  } finally {
    hideLoading();
  }
}

async function ensureAuthorizedThen(request) {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;

  if (!scopeSufficient) {
    if (accessToken && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    try {
      showLoading();
      showStatus("Initiating HMRC authentication...", "info");
      const state = generateRandomState();
      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(request));
      sessionStorage.setItem("currentActivity", `${location.pathname}`);
      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "write:self-assessment";
      const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(
        state,
        oauthScope,
        sessionStorage.getItem("hmrcAccount") || "live",
      );
      try {
        window.__correlation?.prepareRedirect?.();
      } catch {}
      window.location.href = authResponseUrl;
    } catch (error) {
      showStatus(`Authentication failed: ${error.message}`, "error");
      hideLoading();
    }
    return;
  }
  await runRequest(request, accessToken);
}

async function continueAfterOAuth() {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
  if (!accessToken || !pending) return;
  sessionStorage.removeItem(PENDING_KEY);
  sessionStorage.removeItem("currentActivity");
  sessionStorage.removeItem("oauth_state");
  if (pending.action === "trigger") document.getElementById("taxYear").value = pending.criteria.taxYear;
  await runRequest(pending, accessToken);
}

async function handleTriggerFormSubmission(event) {
  event.preventDefault();
  const required = ["nino", "businessId", "taxYear", "accountingPeriodStartDate", "accountingPeriodEndDate"];
  if (!window.formErrors.requireFields(required)) return;
  const criteria = readCriteria();

  try {
    const accessTokenForCheck = sessionStorage.getItem("hmrcAccessToken");
    if (accessTokenForCheck) {
      const openObligations = await checkOpenObligations(criteria.nino, criteria.businessId, accessTokenForCheck);
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

  await ensureAuthorizedThen({ action: "trigger", criteria });
}

// One entry's figures as { income, expenses }, leaving out a field that is blank.
function readEntryFigures(prefix) {
  const read = (field) => {
    const text = document.getElementById(`${prefix}-${field.id}`).value;
    return String(text).trim() === "" ? undefined : window.parseMoneyInput(text);
  };
  const collect = (fields) =>
    Object.fromEntries(fields.map((field) => [field.id, read(field)]).filter(([, value]) => value !== undefined && value !== null));
  return { income: collect(INCOME_FIELDS), expenses: collect([...ITEMISED_EXPENSE_FIELDS, CONSOLIDATED_FIELD]) };
}

// The problems that stop an adjustment: an entry with one total and itemised expenses together.
function adjustmentProblems(figuresByEntry) {
  return figuresByEntry
    .map((figures, index) => ({ figures, entry: adjustableEntries[index], prefix: `adjust-${index + 1}` }))
    .filter(({ figures }) => figures.expenses.consolidatedExpenses !== undefined && Object.keys(figures.expenses).length > 1)
    .map(({ entry, prefix }) => ({
      input: document.getElementById(`${prefix}-${CONSOLIDATED_FIELD.id}`),
      message: `${entry.name}: enter either the total expenses or the itemised expenses, not both`,
    }));
}

function buildForeignProperty(figuresByEntry) {
  const keyName = entryKeyName(triggered.taxYear);
  return figuresByEntry
    .map((figures, index) => {
      const entry = { [keyName]: adjustableEntries[index].key };
      if (Object.keys(figures.income).length > 0) entry.income = figures.income;
      if (Object.keys(figures.expenses).length > 0) entry.expenses = figures.expenses;
      return entry;
    })
    .filter((entry) => entry.income || entry.expenses);
}

async function handleAdjustmentSubmit(zeroAdjustments) {
  const adjustDetails = { nino: triggered.nino, calculationId: triggered.calculationId, taxYear: triggered.taxYear, zeroAdjustments };
  if (!zeroAdjustments) {
    if (window.formErrors.reportMoneyProblems()) return;
    const figuresByEntry = adjustableEntries.map((_, index) => readEntryFigures(`adjust-${index + 1}`));
    const problems = adjustmentProblems(figuresByEntry);
    if (problems.length > 0) {
      window.formErrors.showFormErrors(problems);
      return;
    }
    const foreignProperty = buildForeignProperty(figuresByEntry);
    if (foreignProperty.length === 0) {
      window.formErrors.showFormErrors([
        {
          input: document.querySelector("#adjustEntries input") || document.getElementById("adjustEntries"),
          message: "Enter at least one adjustment, or choose Nothing to adjust",
        },
      ]);
      return;
    }
    adjustDetails.foreignProperty = foreignProperty;
  }
  const criteria = readCriteria();
  await ensureAuthorizedThen({
    action: "adjust",
    adjustDetails,
    testScenario: criteria.testScenario,
    runFraudPreventionHeaderValidation: criteria.runFraudPreventionHeaderValidation,
  });
}

document.getElementById("itsaForeignBsasTriggerForm").addEventListener("submit", handleTriggerFormSubmission);
document.getElementById("submitAdjustmentBtn").addEventListener("click", () => handleAdjustmentSubmit(false));
document.getElementById("zeroAdjustmentsBtn").addEventListener("click", () => handleAdjustmentSubmit(true));

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("adjustmentResults").style.display = "none";
  document.getElementById("triggerForm").style.display = "block";
  document.getElementById("itsaForeignBsasTriggerForm").reset();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  continueAfterOAuth();
});
