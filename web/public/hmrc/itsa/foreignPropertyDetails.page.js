// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

const PENDING_KEY = "pendingForeignPropertyDetailsRequest";
const END_REASON_TEXT = { "disposal": "Sold or given away", "no-longer-letting": "No longer let" };
const PROPERTY_NAME_MAX_LENGTH = 105;

let loaded = { nino: "", businessId: "", taxYear: "" };
let properties = [];
let editingPropertyId = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
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

  const country = document.getElementById("propertyCountry");
  country.append(el("option", "", "Choose the country or territory"));
  country.firstChild.value = "";
  window.countryCodes.countriesByName().forEach(({ code, name }) => {
    const option = el("option", "", name);
    option.value = code;
    country.append(option);
  });
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

// Property details exist from the first tax year HMRC keys foreign property entries by property.
function taxYearProblem(taxYear) {
  const input = document.getElementById("taxYear");
  if (window.itsaSubmissionModel.resolveForeignPropertyEntryKey(taxYear) !== "propertyId") {
    return { input, message: "Property details start with the 2026-27 tax year. Choose 2026-27 or later." };
  }
  return null;
}

function statusText(property) {
  if (!property.endDate) return "Letting";
  const reason = END_REASON_TEXT[property.endReason] || property.endReason;
  return reason ? `Ended on ${property.endDate} (${reason})` : `Ended on ${property.endDate}`;
}

function showPropertyList() {
  document.getElementById("propertiesTaxYear").textContent = loaded.taxYear;
  const container = document.getElementById("propertiesTable");
  if (properties.length === 0) {
    container.replaceChildren(el("p", "no-data", "HMRC holds no foreign properties for this tax year. Add one to report its income."));
  } else {
    const head = document.createElement("tr");
    ["Property", "Country or territory", "Status", ""].forEach((heading) => {
      const th = el("th", "", heading);
      th.scope = "col";
      head.append(th);
    });
    const thead = document.createElement("thead");
    thead.append(head);
    const tbody = document.createElement("tbody");
    properties.forEach((property) => {
      const change = el("button", "secondary-button", "Change");
      change.type = "button";
      change.setAttribute("aria-label", `Change ${property.propertyName}`);
      change.addEventListener("click", () => openPropertyForm(property));
      const status = statusText(property);
      const cells = [
        ["Property", property.propertyName],
        ["Country or territory", window.countryCodes.countryName(property.countryCode)],
        ["Status", status],
      ].map(([label, text]) => {
        const td = el("td", "", text);
        td.dataset.label = label;
        return td;
      });
      const action = el("td", "action-column");
      action.append(change);
      const row = document.createElement("tr");
      row.append(...cells, action);
      tbody.append(row);
    });
    const table = el("table", "results-table");
    table.append(thead, tbody);
    container.replaceChildren(table);
  }
  document.getElementById("loadCriteriaForm").style.display = "none";
  document.getElementById("propertiesPanel").style.display = "block";
}

function closePropertyForm() {
  document.getElementById("propertyForm").style.display = "none";
  window.formErrors.clearFormErrors();
}

function setEndFieldsVisible(visible) {
  document.getElementById("propertyEndFields").hidden = !visible;
}

// property is a listed property to change; without it the form adds a new one.
function openPropertyForm(property) {
  window.formErrors.clearFormErrors();
  editingPropertyId = property ? property.propertyId : null;
  document.getElementById("propertyFormTitle").textContent = property ? `Change ${property.propertyName}` : "Add a property";
  document.getElementById("propertyName").value = property?.propertyName || "";
  const country = document.getElementById("propertyCountry");
  country.value = property?.countryCode || "";
  country.disabled = Boolean(property);
  document.getElementById("propertyEnded").checked = Boolean(property?.endDate);
  document.getElementById("propertyEndDate").value = property?.endDate || "";
  document.getElementById("propertyEndReason").value = property?.endReason || "";
  setEndFieldsVisible(Boolean(property?.endDate));
  const form = document.getElementById("propertyForm");
  form.style.display = "block";
  document.getElementById("propertyFormTitle").focus();
}

async function loadProperties(criteria, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const result = await window.getForeignPropertyDetails(
    criteria.nino,
    criteria.businessId,
    criteria.taxYear,
    accessToken,
    govClientHeaders,
    criteria.runFraudPreventionHeaderValidation,
    criteria.testScenario,
  );
  loaded = { nino: criteria.nino, businessId: criteria.businessId, taxYear: criteria.taxYear };
  properties = result?.propertyDetails || [];
  showPropertyList();
  closePropertyForm();
}

async function saveProperty(request, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const { criteria, property } = request;
  if (request.propertyId) {
    await window.putForeignPropertyDetails(
      { nino: criteria.nino, taxYear: criteria.taxYear, propertyId: request.propertyId, ...property },
      accessToken,
      govClientHeaders,
      criteria.runFraudPreventionHeaderValidation,
      criteria.testScenario,
    );
  } else {
    await window.postForeignPropertyDetails(
      { nino: criteria.nino, businessId: criteria.businessId, taxYear: criteria.taxYear, ...property },
      accessToken,
      govClientHeaders,
      criteria.runFraudPreventionHeaderValidation,
      criteria.testScenario,
    );
  }
  await loadProperties(criteria, accessToken);
}

async function runRequest(request, accessToken) {
  try {
    showLoading();
    hideStatus();
    if (request.action === "save") {
      showStatus("Saving the property...", "info");
      await saveProperty(request, accessToken);
      showStatus("Property saved.", "success");
    } else {
      showStatus("Loading your foreign properties...", "info");
      await loadProperties(request.criteria, accessToken);
      hideStatus();
    }
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
  } finally {
    hideLoading();
  }
}

async function ensureAuthorizedThen(request) {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;

  if (!scopeSufficient) {
    if (accessToken && window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    showLoading();
    showStatus("Initiating HMRC authentication...", "info");
    const state = generateRandomState();
    const hmrcAccount = sessionStorage.getItem("hmrcAccount");
    sessionStorage.setItem("oauth_state", state);
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(request));
    sessionStorage.setItem("currentActivity", `${location.pathname}`);
    const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "write:self-assessment";
    const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");
    try {
      window.__correlation?.prepareRedirect?.();
    } catch {}
    window.location.href = authResponseUrl;
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
  await runRequest(pending, accessToken);
}

async function handleLoadSubmission(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;
  const criteria = readCriteria();
  const problem = taxYearProblem(criteria.taxYear);
  if (problem) {
    window.formErrors.showFormErrors([problem]);
    return;
  }
  await ensureAuthorizedThen({ action: "load", criteria });
}

// The problems with the add or change form: [{ input, message }].
function propertyFormProblems() {
  const problems = [];
  const name = document.getElementById("propertyName");
  const trimmed = name.value.trim();
  if (trimmed === "") problems.push({ input: name, message: "Enter the property name" });
  else if (trimmed.length > PROPERTY_NAME_MAX_LENGTH) {
    problems.push({ input: name, message: `The property name must be ${PROPERTY_NAME_MAX_LENGTH} characters or fewer` });
  }
  const country = document.getElementById("propertyCountry");
  if (!editingPropertyId && country.value === "") problems.push({ input: country, message: "Choose the country or territory" });
  if (document.getElementById("propertyEnded").checked) {
    const date = document.getElementById("propertyEndDate");
    const reason = document.getElementById("propertyEndReason");
    if (date.value === "") problems.push({ input: date, message: "Enter the date you stopped letting the property" });
    if (reason.value === "") problems.push({ input: reason, message: "Choose why you stopped letting the property" });
  }
  return problems;
}

async function handlePropertySubmission(event) {
  event.preventDefault();
  const problems = propertyFormProblems();
  if (problems.length > 0) {
    window.formErrors.showFormErrors(problems);
    return;
  }
  const ended = document.getElementById("propertyEnded").checked;
  const property = {
    propertyName: document.getElementById("propertyName").value.trim(),
    ...(editingPropertyId ? {} : { countryCode: document.getElementById("propertyCountry").value }),
    ...(ended && {
      endDate: document.getElementById("propertyEndDate").value,
      endReason: document.getElementById("propertyEndReason").value,
    }),
  };
  const criteria = { ...readCriteria(), ...loaded };
  await ensureAuthorizedThen({ action: "save", criteria, propertyId: editingPropertyId, property });
}

document.getElementById("foreignPropertyLoadForm").addEventListener("submit", handleLoadSubmission);
document.getElementById("propertyForm").addEventListener("submit", handlePropertySubmission);
document.getElementById("addPropertyBtn").addEventListener("click", () => openPropertyForm(null));
document.getElementById("cancelPropertyBtn").addEventListener("click", closePropertyForm);
document.getElementById("propertyEnded").addEventListener("change", (event) => setEndFieldsVisible(event.target.checked));

document.getElementById("newSearchBtn").addEventListener("click", () => {
  document.getElementById("propertiesPanel").style.display = "none";
  document.getElementById("loadCriteriaForm").style.display = "block";
  closePropertyForm();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  continueAfterOAuth();
});
