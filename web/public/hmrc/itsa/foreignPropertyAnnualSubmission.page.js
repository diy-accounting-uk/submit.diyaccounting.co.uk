// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

const PENDING_KEY = "pendingForeignPropertyAnnualRequest";
const FHL_PREFIX = "fhl";
const ENTRY_ID_PREFIX = "fa";
const FHL_NAME = "Furnished holiday lettings in the EEA";
const MONEY_HINT = "For example, £600 or £193.54";

const JOURNEY_LINKS = [
  { href: "dashboard.html", text: "Back to Income Tax" },
  { href: "obligations.html", text: "See your obligations" },
];

const ADJUSTMENT_FIELDS = [
  { id: "balancingCharge", label: "Balancing charge" },
  {
    id: "privateUseAdjustment",
    label: "Private use adjustment",
    hint: `${MONEY_HINT}. Cannot be entered with the property income allowance; HMRC rejects the combination.`,
  },
];

const PROPERTY_INCOME_ALLOWANCE_FIELD = {
  id: "propertyIncomeAllowance",
  label: "Property income allowance",
  hint: `${MONEY_HINT}. At most £1,000.`,
};

const ENTRY_ALLOWANCE_FIELDS = [
  { id: "annualInvestmentAllowance", label: "Annual investment allowance" },
  { id: "costOfReplacingDomesticItems", label: "Cost of replacing domestic items" },
  { id: "otherCapitalAllowance", label: "Other capital allowance" },
  { id: "zeroEmissionsCarAllowance", label: "Zero emissions car allowance" },
];

// HMRC takes these two allowances for 2024-25 and before only.
const DATED_ENTRY_ALLOWANCE_FIELDS = [
  { id: "zeroEmissionsGoodsVehicleAllowance", label: "Zero emissions goods vehicle allowance" },
  { id: "electricChargePointAllowance", label: "Electric charge point allowance" },
];

const FHL_ALLOWANCE_FIELDS = [
  { id: "annualInvestmentAllowance", label: "Annual investment allowance" },
  { id: "otherCapitalAllowance", label: "Other capital allowance" },
  { id: "zeroEmissionsCarAllowance", label: "Zero emissions car allowance" },
  { id: "electricChargePointAllowance", label: "Electric charge point allowance" },
];

let loaded = { nino: "", businessId: "", taxYear: "" };
let loadedDated = false;
let loadedMode = "country";
let entries = null;
const claimRows = new Map();

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function isDated(taxYear) {
  return window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "dated";
}

const byId = (prefix, id) => document.getElementById(`${prefix}-${id}`);

function moneyGroup(prefix, field) {
  return window.selfEmploymentExpenses.moneyGroup({ id: `${prefix}-${field.id}`, label: field.label, min: 0 }, field.hint || MONEY_HINT);
}

function allowanceChoice(prefix, value, id, text, checked) {
  const radioId = `${prefix}-allowanceType${id}`;
  return el("div", { className: "choice" }, [
    el("input", { type: "radio", id: radioId, name: `${prefix}-allowanceType`, value, checked }),
    el("label", { htmlFor: radioId, textContent: text }),
  ]);
}

// Adjustments and allowances for one section: an entry (a country or a property) or the EEA
// furnished holiday lettings. HMRC takes the property income allowance or the itemised allowances,
// never both, so only the chosen set of fields is enabled.
function mountSection(container, prefix, { fhl, dated }) {
  const adjustments = ADJUSTMENT_FIELDS.map((field) => moneyGroup(prefix, field));
  if (fhl) {
    adjustments.push(
      el("div", { className: "choice" }, [
        el("input", { type: "checkbox", id: `${prefix}-periodOfGraceAdjustment`, name: `${prefix}-periodOfGraceAdjustment` }),
        el("label", { htmlFor: `${prefix}-periodOfGraceAdjustment`, textContent: "Period of grace adjustment" }),
      ]),
    );
  }
  const itemisedFields = fhl ? FHL_ALLOWANCE_FIELDS : [...ENTRY_ALLOWANCE_FIELDS, ...(dated ? DATED_ENTRY_ALLOWANCE_FIELDS : [])];
  const choices = el("fieldset", { className: "form-group" }, [
    el("legend", { textContent: "Which allowances do you claim?" }),
    allowanceChoice(prefix, "", "None", "Neither", true),
    allowanceChoice(prefix, "propertyIncome", "PropertyIncome", "Property income allowance", false),
    allowanceChoice(prefix, "itemised", "Itemised", "Itemised allowances", false),
  ]);
  const incomeBlock = el("div", { id: `${prefix}-propertyIncomeAllowanceFields` }, [moneyGroup(prefix, PROPERTY_INCOME_ALLOWANCE_FIELD)]);
  const itemisedBlock = el(
    "div",
    { id: `${prefix}-itemisedAllowanceFields` },
    itemisedFields.map((field) => moneyGroup(prefix, field)),
  );
  if (!fhl) {
    const rowsContainer = el("div", { id: `${prefix}-sbaRows` });
    itemisedBlock.append(rowsContainer);
    claimRows.set(
      prefix,
      window.structuredBuildingAllowanceRows.create(rowsContainer, {
        idPrefix: `${prefix}-sba`,
        title: "Structures and Buildings Allowance",
        intro: "One claim for each building. Cannot be used with the property income allowance.",
      }),
    );
  }
  container.replaceChildren(
    el("h3", { textContent: "Adjustments" }),
    ...adjustments,
    el("h3", { textContent: "Allowances" }),
    choices,
    incomeBlock,
    itemisedBlock,
  );
  choices.addEventListener("change", () => updateAllowanceFields(prefix));
  updateAllowanceFields(prefix);
}

function allowanceType(prefix) {
  return document.querySelector(`input[name="${prefix}-allowanceType"]:checked`)?.value || "";
}

function updateAllowanceFields(prefix) {
  const type = allowanceType(prefix);
  document.querySelectorAll(`#${prefix}-propertyIncomeAllowanceFields input`).forEach((field) => {
    field.disabled = type !== "propertyIncome";
  });
  document.querySelectorAll(`#${prefix}-itemisedAllowanceFields input`).forEach((field) => {
    field.disabled = type !== "itemised";
  });
  claimRows.get(prefix)?.setDisabled(type !== "itemised");
}

function numberOrUndefined(text) {
  if (String(text ?? "").trim() === "") return undefined;
  const value = window.parseMoneyInput(text);
  return value === 0 || value === null ? undefined : value;
}

function readFigure(prefix, id) {
  return numberOrUndefined(byId(prefix, id).value);
}

function compact(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

// One section as { adjustments, allowances }, leaving out a figure that is blank or 0.
function readSection(prefix, { fhl, dated }) {
  const adjustments = compact(Object.fromEntries(ADJUSTMENT_FIELDS.map((field) => [field.id, readFigure(prefix, field.id)])));
  if (fhl && byId(prefix, "periodOfGraceAdjustment").checked) adjustments.periodOfGraceAdjustment = true;
  const type = allowanceType(prefix);
  let allowances = {};
  if (type === "propertyIncome") {
    allowances = compact({ propertyIncomeAllowance: readFigure(prefix, "propertyIncomeAllowance") });
  } else if (type === "itemised") {
    const fields = fhl ? FHL_ALLOWANCE_FIELDS : [...ENTRY_ALLOWANCE_FIELDS, ...(dated ? DATED_ENTRY_ALLOWANCE_FIELDS : [])];
    allowances = compact(Object.fromEntries(fields.map((field) => [field.id, readFigure(prefix, field.id)])));
    const claims = claimRows.get(prefix)?.read() || [];
    if (claims.length > 0) allowances.structuredBuildingAllowance = claims;
  }
  return { adjustments, allowances };
}

function hasFigures(section) {
  return Object.keys(section.adjustments).length > 0 || Object.keys(section.allowances).length > 0;
}

// Fills one section from HMRC's loaded section.
function applySection(prefix, section, { fhl }) {
  const adjustments = section?.adjustments || {};
  const allowances = section?.allowances || {};
  ADJUSTMENT_FIELDS.forEach((field) => {
    if (adjustments[field.id] !== undefined) byId(prefix, field.id).value = adjustments[field.id];
  });
  if (fhl) byId(prefix, "periodOfGraceAdjustment").checked = adjustments.periodOfGraceAdjustment === true;
  if (allowances.propertyIncomeAllowance !== undefined) {
    byId(prefix, "allowanceTypePropertyIncome").checked = true;
    byId(prefix, "propertyIncomeAllowance").value = allowances.propertyIncomeAllowance;
  } else if (Object.keys(allowances).length > 0) {
    byId(prefix, "allowanceTypeItemised").checked = true;
    Object.entries(allowances).forEach(([key, value]) => {
      const field = byId(prefix, key);
      if (field) field.value = value;
    });
    claimRows.get(prefix)?.set(allowances.structuredBuildingAllowance);
  }
  updateAllowanceFields(prefix);
}

// Starts the page's entries again for a tax year: the FHL section up to 2024-25, then one
// fieldset for each country (up to 2025-26) or each property (2026-27 on).
function mountEntries(taxYear) {
  claimRows.clear();
  loadedDated = isDated(taxYear);
  const fhlContainer = document.getElementById("fhlAnnual");
  if (loadedDated) {
    const section = el("div");
    fhlContainer.replaceChildren(
      el("fieldset", { className: "form-group foreign-property-entry", id: "fhlEea" }, [
        el("legend", { textContent: "Furnished holiday lettings in the European Economic Area" }),
        el("p", {
          className: "hint",
          textContent:
            "Furnished holiday lettings ended on 5 April 2025. Fill this in only for a year before then, with every such letting in the EEA added together.",
        }),
        section,
      ]),
    );
    mountSection(section, FHL_PREFIX, { fhl: true, dated: true });
  } else {
    fhlContainer.replaceChildren();
  }
  const mode = window.itsaSubmissionModel.resolveForeignPropertyEntryKey(taxYear) === "propertyId" ? "property" : "country";
  loadedMode = mode;
  entries = window.foreignPropertyEntries.create(document.getElementById("annualEntries"), {
    idPrefix: ENTRY_ID_PREFIX,
    mode,
    renderBody: (body, prefix) => mountSection(body, prefix, { fhl: false, dated: loadedDated }),
  });
  return mode;
}

// The notes under the load: a tax year with no property or no submission yet, and figures HMRC
// holds for a property that is not in the list. They stay on the form until the next load.
function showLoadNotes(notes) {
  const container = document.getElementById("loadNotes");
  container.replaceChildren(
    ...notes.map(({ text, linkText }) =>
      el("p", { className: "hint" }, [
        text,
        ...(linkText ? [" ", el("a", { href: "foreignPropertyDetails.html", textContent: linkText }), "."] : []),
      ]),
    ),
  );
}

// Fills the page from HMRC's annual submission. Returns the property ids HMRC holds figures for
// that are not in the list of properties.
function applySubmission(submission, mode) {
  if (loadedDated) applySection(FHL_PREFIX, submission?.foreignFhlEea, { fhl: true });
  const unknown = [];
  const list = Array.isArray(submission?.foreignProperty) ? submission.foreignProperty : [];
  if (mode === "country") {
    list.forEach((entry) => {
      const prefix = entries.addCountry({ countryCode: entry.countryCode });
      applySection(prefix, entry, { fhl: false });
    });
  } else {
    const held = new Map(entries.entries().map((item) => [item.key, item.prefix]));
    list.forEach((entry) => {
      if (held.has(entry.propertyId)) applySection(held.get(entry.propertyId), entry, { fhl: false });
      else unknown.push(entry.propertyId);
    });
  }
  return unknown;
}

async function loadAnnual(criteria, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const mode = mountEntries(criteria.taxYear);
  loaded = { nino: criteria.nino, businessId: criteria.businessId, taxYear: criteria.taxYear };
  const notes = [];
  if (mode === "property") {
    const result = await window.getForeignPropertyDetails(
      criteria.nino,
      criteria.businessId,
      criteria.taxYear,
      accessToken,
      govClientHeaders,
      criteria.runFraudPreventionHeaderValidation,
      null,
    );
    const properties = result?.foreignPropertyDetails || [];
    entries.setProperties(properties);
    if (properties.length === 0) {
      notes.push({
        text: "HMRC holds no foreign properties for this tax year. Add one on",
        linkText: "the foreign property details page first",
      });
    }
  }
  // HMRC's retrieve answers not-found when it is sent no Gov-Test-Scenario, so a synthetic account
  // without a chosen scenario sends the named one. A live account never carries a sandbox header.
  const scenario = window.resolveSyntheticTestScenario(criteria.testScenario, sessionStorage.getItem("hmrcAccount"), "FOREIGN_PROPERTY");
  let submission = {};
  try {
    submission = await window.getForeignPropertyAnnual(
      criteria.nino,
      criteria.businessId,
      criteria.taxYear,
      accessToken,
      govClientHeaders,
      criteria.runFraudPreventionHeaderValidation,
      scenario,
    );
  } catch (error) {
    if (error.status !== 404) throw error;
    notes.push({ text: "HMRC holds no annual submission yet for this tax year. Enter the figures below." });
  }
  const unknown = applySubmission(submission, mode);
  if (unknown.length > 0) {
    notes.push({
      text: "HMRC holds figures for a property that is not in your list. Check the foreign property details page before you save, or those figures are lost.",
    });
  }
  showLoadNotes(notes);
  document.getElementById("loadCriteriaForm").style.display = "none";
  document.getElementById("annualEditForm").style.display = "block";
}

function receiptEntries(annualDetails, names) {
  const withFigures = (name, id, section) => ({ id, name, adjustments: section.adjustments, allowances: section.allowances });
  const result = [];
  if (annualDetails.foreignFhlEea) result.push(withFigures(FHL_NAME, "fhl", annualDetails.foreignFhlEea));
  annualDetails.foreignProperty.forEach((entry, index) => {
    result.push(withFigures(names[entry.countryCode ?? entry.propertyId], String(index + 1), entry));
  });
  return result;
}

async function showSavedRecord(annualDetails, names, correlationId) {
  const { annualCopyHtml, mountCopy } = await import("../../lib/itsa-submission-record.js");
  mountCopy(
    document.getElementById("annualSubmissionCopy"),
    annualCopyHtml({
      kind: "foreign-property",
      nino: annualDetails.nino,
      businessId: annualDetails.businessId,
      taxYear: annualDetails.taxYear,
      savedAt: new Date().toISOString(),
      correlationId,
      sent: { entries: receiptEntries(annualDetails, names) },
      links: JOURNEY_LINKS,
    }),
  );
  document.getElementById("annualEditForm").style.display = "none";
  document.getElementById("annualSubmissionResults").style.display = "block";
}

async function saveAnnual(request, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const { annualDetails, names, runFraudPreventionHeaderValidation } = request;
  // The scenario on the load form exists for the retrieve, whose sandbox default is not-found.
  // Create and amend does not accept those values, so a save never forwards it.
  const saved = await window.putForeignPropertyAnnual(annualDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation);
  await showSavedRecord(annualDetails, names, saved?.correlationId);
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
    testScenario: document.getElementById("testScenario")?.value || null,
    runFraudPreventionHeaderValidation: document.getElementById("runFraudPreventionHeaderValidation")?.checked || false,
  };
}

async function runRequest(request, accessToken) {
  try {
    showLoading();
    hideStatus();
    if (request.action === "load") {
      showStatus("Loading annual submission...", "info");
      await loadAnnual(request.criteria, accessToken);
      hideStatus();
    } else {
      showStatus("Saving annual submission...", "info");
      await saveAnnual(request, accessToken);
      hideStatus();
    }
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please try again.", "error");
    } else if (error.status === 403 && error.reason === "tokens_exhausted") {
      hideStatus();
      window.SubmissionCost?.refresh();
    } else {
      showStatus(
        `${request.action === "load" ? "Failed to load the annual submission" : "Failed to save the annual submission"}: ${error.message}`,
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
  if (pending.action === "load") document.getElementById("taxYear").value = pending.criteria.taxYear;
  await runRequest(pending, accessToken);
}

async function handleLoadSubmission(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;
  await ensureAuthorizedThen({ action: "load", criteria: readCriteria() });
}

// The problems that stop a save: money fields HMRC would refuse, a country not chosen, a
// Structures and Buildings Allowance claim that is not complete, and nothing to send.
function saveProblems() {
  const problems = [...entries.validate()];
  entries.entries().forEach(({ prefix }) => {
    if (allowanceType(prefix) === "itemised") problems.push(...(claimRows.get(prefix)?.validate() || []));
  });
  return problems;
}

// The name an entry carries on the saved record: the country, or "<name> (<country>)" for a property.
function entryName(prefix, key) {
  if (loadedMode === "country") return window.countryCodes.countryName(key);
  return document.querySelector(`#${prefix} > legend`).textContent;
}

function readAnnualDetails() {
  const keyName = loadedMode === "country" ? "countryCode" : "propertyId";
  const foreignProperty = [];
  const names = {};
  entries.entries().forEach(({ prefix, key }) => {
    if (!key) return;
    const section = readSection(prefix, { fhl: false, dated: loadedDated });
    if (!hasFigures(section)) return;
    foreignProperty.push({ [keyName]: key, ...section });
    names[key] = entryName(prefix, key);
  });
  const fhlSection = loadedDated ? readSection(FHL_PREFIX, { fhl: true, dated: true }) : null;
  const annualDetails = { ...loaded, foreignProperty };
  if (fhlSection && hasFigures(fhlSection)) annualDetails.foreignFhlEea = fhlSection;
  return { annualDetails, names };
}

async function handleSave() {
  if (window.formErrors.reportMoneyProblems()) return;
  const problems = saveProblems();
  if (problems.length > 0) {
    window.formErrors.showFormErrors(problems);
    return;
  }
  const { annualDetails, names } = readAnnualDetails();
  if (annualDetails.foreignProperty.length === 0 && !annualDetails.foreignFhlEea) {
    const target =
      document.getElementById(`${ENTRY_ID_PREFIX}-add`) || document.querySelector("#annualEntries input, #annualEntries select");
    window.formErrors.showFormErrors([
      { input: target || document.getElementById("annualEntries"), message: "Enter at least one adjustment or allowance" },
    ]);
    return;
  }
  const criteria = readCriteria();
  await ensureAuthorizedThen({
    action: "save",
    annualDetails,
    names,
    runFraudPreventionHeaderValidation: criteria.runFraudPreventionHeaderValidation,
  });
}

document.getElementById("itsaForeignAnnualLoadForm").addEventListener("submit", handleLoadSubmission);
document.getElementById("saveBtn").addEventListener("click", handleSave);

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("annualSubmissionResults").style.display = "none";
  document.getElementById("loadCriteriaForm").style.display = "block";
  document.getElementById("annualEditForm").style.display = "none";
  document.getElementById("itsaForeignAnnualLoadForm").reset();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  continueAfterOAuth();
});
