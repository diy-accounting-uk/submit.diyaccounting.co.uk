// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

const PENDING_KEY = "pendingForeignPropertyPeriodRequest";

const figures = window.foreignPropertyPeriodForm.create({
  fhlContainer: document.getElementById("fhlFields"),
  entriesContainer: document.getElementById("foreignEntries"),
});

function isCumulative(taxYear) {
  return (
    window.itsaSubmissionModel.isValidTaxYear(taxYear) && window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "cumulative"
  );
}

function isPropertyYear(taxYear) {
  return (
    window.itsaSubmissionModel.isValidTaxYear(taxYear) &&
    window.itsaSubmissionModel.resolveForeignPropertyEntryKey(taxYear) === "propertyId"
  );
}

// From 2025-26 the money fields hold a running total for the year so far, the period dates are
// optional and the current total is worth loading. From 2026-27 the entries are the properties
// HMRC holds. Up to 2024-25 every period has dates and the FHL section is on the page.
function updateSubmissionModelUI() {
  const taxYear = document.getElementById("taxYear").value.trim();
  const cumulative = isCumulative(taxYear);
  figures.setTaxYear(taxYear);
  document.getElementById("fromDate").required = !cumulative;
  document.getElementById("toDate").required = !cumulative;
  document.getElementById("periodDates-hint").textContent = cumulative
    ? "Leave both dates blank if this business reports annually. Fill them in only if you are reporting a quarter."
    : "HMRC identifies this quarter by its start and end date.";
  document.getElementById("cumulativeMoneyNote").style.display = cumulative ? "block" : "none";
  document.getElementById("loadCurrentTotalGroup").style.display = cumulative ? "block" : "none";
  document.getElementById("loadPropertiesGroup").style.display = isPropertyYear(taxYear) ? "block" : "none";
}

function hideSearchCriteria() {
  document.getElementById("searchCriteriaContainer").style.display = "none";
  document.getElementById("toggleSearchCriteriaBtn").style.display = "inline-block";
  document.getElementById("cancelRequestBtn").style.display = "inline-block";
}

function hideRequestForm() {
  document.getElementById("foreignPropertyPeriodForm").style.display = "none";
}

function showSearchCriteria() {
  document.getElementById("foreignPropertyPeriodForm").style.display = "";
  document.getElementById("searchCriteriaContainer").style.display = "block";
  document.getElementById("toggleSearchCriteriaBtn").style.display = "none";
  document.getElementById("cancelRequestBtn").style.display = "none";
}

function clearSession() {
  sessionStorage.removeItem(PENDING_KEY);
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");
}

function initializePage() {
  if (sessionStorage.getItem("hmrcAccount") === "synthetic") {
    document.getElementById("syntheticIndicator")?.classList.add("visible");
    document.getElementById("testDataLink")?.classList.add("visible");
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
  const properties = result?.propertyDetails || [];
  figures.setProperties(properties);
  return properties;
}

// HMRC's retrieve is not stateful in the sandbox: with no Gov-Test-Scenario it answers not-found.
// A synthetic account without a chosen scenario sends the named one for the tax year's model.
async function loadCurrentTotal(criteria, accessToken) {
  if (isPropertyYear(criteria.taxYear) && !figures.hasEntries()) await loadProperties(criteria, accessToken);
  const govClientHeaders = await getGovClientHeaders();
  const scenario = window.resolveSyntheticTestScenario(
    criteria.testScenario,
    sessionStorage.getItem("hmrcAccount"),
    "FOREIGN_PROPERTY_FULL_EXPENSES",
  );
  const summary = await window.getForeignPropertyPeriod(
    criteria,
    accessToken,
    govClientHeaders,
    criteria.runFraudPreventionHeaderValidation,
    scenario,
  );
  return figures.apply(summary);
}

async function sendPeriod(request, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  const { criteria, period } = request;
  const send = isCumulative(criteria.taxYear) ? window.putForeignPropertyPeriod : window.postForeignPropertyPeriod;
  return (await send(period, accessToken, govClientHeaders, criteria.runFraudPreventionHeaderValidation, criteria.testScenario)) || {};
}

function displayResult(result) {
  // HMRC's cumulative model answers 204 with no submission ID: the year's running total is the one resource.
  const hasSubmissionId = Boolean(result?.submissionId);
  document.getElementById("submissionIdLabel").textContent = hasSubmissionId ? "Submission ID" : "Reporting";
  document.getElementById("submissionIdResult").textContent = hasSubmissionId ? result.submissionId : "Year to date";
}

async function runRequest(request, accessToken) {
  try {
    showLoading();
    hideStatus();
    if (request.action === "loadProperties") {
      showStatus("Loading your foreign properties...", "info");
      const properties = await loadProperties(request.criteria, accessToken);
      if (properties.length === 0) {
        showStatus("HMRC holds no foreign properties for this tax year. Add one on the foreign property details page first.", "info");
      } else {
        showStatus("Loaded your properties from HMRC. Enter the figures for each one.", "info");
      }
    } else if (request.action === "loadTotal") {
      showStatus("Loading the current total...", "info");
      const unknown = await loadCurrentTotal(request.criteria, accessToken);
      showStatus(
        unknown.length > 0
          ? "Loaded the current total. HMRC holds figures for a property that is not in your list; check the foreign property details page."
          : "Loaded your current year-to-date total from HMRC. Edit the figures below to the new total.",
        "info",
      );
    } else {
      hideSearchCriteria();
      showStatus("Filing quarterly update...", "info");
      const result = await sendPeriod(request, accessToken);
      displayResult(result);
      document.getElementById("foreignPropertyPeriodResults").style.display = "block";
      hideRequestForm();
      hideStatus();
      window.dispatchEvent(new CustomEvent("bundle-changed"));
    }
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please try again.", "error");
    } else if (error.status === 404 && request.action === "loadTotal") {
      showStatus("HMRC has no total on file yet for this tax year. Enter the figures for the year so far.", "info");
    } else if (error.status === 403 && error.reason === "tokens_exhausted") {
      hideStatus();
      window.SubmissionCost?.refresh();
    } else {
      showStatus(`Failed: ${error.message}`, "error");
    }
    if (request.action === "submit") showSearchCriteria();
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
  await runRequest(pending, accessToken);
}

function loadProblems() {
  return window.formErrors.requireFields(["nino", "businessId", "taxYear"]);
}

async function handleLoadProperties() {
  if (!loadProblems()) return;
  await ensureAuthorizedThen({ action: "loadProperties", criteria: readCriteria() });
}

async function handleLoadCurrentTotal() {
  if (!loadProblems()) return;
  await ensureAuthorizedThen({ action: "loadTotal", criteria: readCriteria() });
}

async function handleFormSubmission(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["nino", "businessId", "taxYear"])) return;
  const criteria = readCriteria();
  const cumulative = isCumulative(criteria.taxYear);
  if (!cumulative && !window.formErrors.requireFields(["fromDate", "toDate"])) return;
  if (window.formErrors.reportMoneyProblems()) return;

  const { problems, foreignFhlEea, entries } = figures.read(criteria.taxYear);
  if (problems.length > 0) {
    window.formErrors.showFormErrors(problems);
    return;
  }
  const period = {
    nino: criteria.nino,
    businessId: criteria.businessId,
    taxYear: criteria.taxYear,
    fromDate: document.getElementById("fromDate").value || undefined,
    toDate: document.getElementById("toDate").value || undefined,
  };
  if (cumulative) period.foreignProperty = entries;
  else {
    if (foreignFhlEea) period.foreignFhlEea = foreignFhlEea;
    if (entries.length > 0) period.foreignNonFhlProperty = entries;
  }
  await ensureAuthorizedThen({ action: "submit", criteria, period });
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", showSearchCriteria);

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  clearSession();
  showSearchCriteria();
  document.getElementById("foreignPropertyPeriodResults").style.display = "none";
  hideStatus();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("itsaForeignPropertyPeriodForm").reset();
  figures.reset();
  document.getElementById("foreignPropertyPeriodResults").style.display = "none";
  updateSubmissionModelUI();
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("taxYear").addEventListener("input", updateSubmissionModelUI);
document.getElementById("loadPropertiesBtn").addEventListener("click", handleLoadProperties);
document.getElementById("loadCurrentTotalBtn").addEventListener("click", handleLoadCurrentTotal);
document.getElementById("itsaForeignPropertyPeriodForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  continueAfterOAuth();
});

document.getElementById("addTestDataLink").addEventListener("click", (event) => {
  event.preventDefault();
  window.testDataGenerator.populateForeignPropertyPeriodForm();
  updateSubmissionModelUI();
});
