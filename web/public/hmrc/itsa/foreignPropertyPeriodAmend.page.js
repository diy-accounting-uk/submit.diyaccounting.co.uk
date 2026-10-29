// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("submissionId", document.getElementById("submissionId"));

const PENDING_KEY = "pendingForeignPropertyPeriodAmendRequest";

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

// From 2025-26 there is no submission ID to address, because the amendment replaces the year's
// running total. From 2026-27 the entries are the properties HMRC holds. Up to 2024-25 the FHL
// section is on the page.
function updateSubmissionModelUI() {
  const taxYear = document.getElementById("taxYear").value.trim();
  const cumulative = isCumulative(taxYear);
  figures.setTaxYear(taxYear);
  document.getElementById("submissionIdGroup").style.display = cumulative ? "none" : "block";
  document.getElementById("submissionId").required = !cumulative;
  document.getElementById("cumulativeMoneyNote").style.display = cumulative ? "block" : "none";
  document.getElementById("loadHint").textContent = cumulative
    ? "Load the current total HMRC holds for the year, then change the figures below."
    : "Load the period HMRC holds for this submission ID, then change the figures below.";
}

function hideSearchCriteria() {
  document.getElementById("searchCriteriaContainer").style.display = "none";
  document.getElementById("toggleSearchCriteriaBtn").style.display = "inline-block";
  document.getElementById("cancelRequestBtn").style.display = "inline-block";
}

function hideRequestForm() {
  document.getElementById("periodAmendForm").style.display = "none";
}

function showSearchCriteria() {
  document.getElementById("periodAmendForm").style.display = "";
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
    submissionId: document.getElementById("submissionId").value.trim() || undefined,
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
  figures.setProperties(result?.foreignPropertyDetails || []);
}

// HMRC's retrieve is not stateful in the sandbox: with no Gov-Test-Scenario it answers not-found.
// A synthetic account without a chosen scenario sends the named one for the tax year's model.
// In a property year the property list comes first, because the entries are the properties.
async function loadFromHmrc(criteria, accessToken) {
  if (isPropertyYear(criteria.taxYear) && !figures.hasEntries()) await loadProperties(criteria, accessToken);
  const govClientHeaders = await getGovClientHeaders();
  const scenario = window.resolveSyntheticTestScenario(
    criteria.testScenario,
    sessionStorage.getItem("hmrcAccount"),
    isCumulative(criteria.taxYear) ? "FOREIGN_PROPERTY_FULL_EXPENSES" : "FOREIGN_PROPERTY",
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
  return window.putForeignPropertyPeriod(
    period,
    accessToken,
    govClientHeaders,
    criteria.runFraudPreventionHeaderValidation,
    criteria.testScenario,
  );
}

async function runRequest(request, accessToken) {
  try {
    showLoading();
    hideStatus();
    if (request.action === "load") {
      showStatus("Loading the period summary...", "info");
      const unknown = await loadFromHmrc(request.criteria, accessToken);
      showStatus(
        unknown.length > 0
          ? "Loaded the period. HMRC holds figures for a property that is not in your list; check the foreign property details page."
          : "Loaded the period HMRC holds. Edit the figures below.",
        "info",
      );
    } else {
      hideSearchCriteria();
      showStatus("Amending period summary...", "info");
      await sendPeriod(request, accessToken);
      document.getElementById("periodAmendResults").style.display = "block";
      hideRequestForm();
      hideStatus();
      window.dispatchEvent(new CustomEvent("bundle-changed"));
    }
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please try again.", "error");
    } else if (error.status === 404 && request.action === "load") {
      showStatus("HMRC holds no period summary for these details.", "info");
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

function requiredFields() {
  const cumulative = isCumulative(document.getElementById("taxYear").value.trim());
  return ["nino", "businessId", "taxYear"].concat(cumulative ? [] : ["submissionId"]);
}

async function handleLoad() {
  if (!window.formErrors.requireFields(requiredFields())) return;
  await ensureAuthorizedThen({ action: "load", criteria: readCriteria() });
}

async function handleFormSubmission(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(requiredFields())) return;
  if (window.formErrors.reportMoneyProblems()) return;

  const criteria = readCriteria();
  const { problems, foreignFhlEea, entries } = figures.read(criteria.taxYear);
  if (problems.length > 0) {
    window.formErrors.showFormErrors(problems);
    return;
  }
  const period = { nino: criteria.nino, businessId: criteria.businessId, taxYear: criteria.taxYear };
  if (isCumulative(criteria.taxYear)) period.foreignProperty = entries;
  else {
    period.submissionId = criteria.submissionId;
    if (foreignFhlEea) period.foreignFhlEea = foreignFhlEea;
    if (entries.length > 0) period.foreignNonFhlProperty = entries;
  }
  await ensureAuthorizedThen({ action: "submit", criteria, period });
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", showSearchCriteria);

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  clearSession();
  showSearchCriteria();
  document.getElementById("periodAmendResults").style.display = "none";
  hideStatus();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("itsaForeignPropertyPeriodAmendForm").reset();
  figures.reset();
  document.getElementById("periodAmendResults").style.display = "none";
  updateSubmissionModelUI();
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("taxYear").addEventListener("input", updateSubmissionModelUI);
document.getElementById("loadBtn").addEventListener("click", handleLoad);
document.getElementById("itsaForeignPropertyPeriodAmendForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  updateSubmissionModelUI();
  continueAfterOAuth();
});
