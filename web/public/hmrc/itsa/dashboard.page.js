// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));

// The picked business travels as a businessId/typeOfBusiness pair, stored under this
// sessionStorage key, so every page a numbered step links to can read the same pick
// without the customer re-selecting it. Nothing here is guessed - the type always comes
// from what HMRC's own Business Details answer said for that businessId.
const PICKED_BUSINESS_KEY = "itsaPickedBusiness";

// A quarterly update, its amendment and the final declaration are the only writes that
// spend a token (D6/D8 in the plan). One quarterly update costs 1 token, HMRC issues four
// obligations a year per business, and one final declaration covers the whole return
// regardless of how many businesses it carries.
const TOKENS_PER_BUSINESS_YEAR = 4;
const FINAL_DECLARATION_TOKENS = 1;

function initializePage() {
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");

  if (hmrcAccount === "synthetic") {
    const syntheticIndicator = document.getElementById("syntheticIndicator");
    if (syntheticIndicator) {
      syntheticIndicator.classList.add("visible");
    }
  }

  // Restore a business picked earlier in this session, so returning to the dashboard
  // does not lose the pick or reset every step link back to self-employment.
  const stored = readPickedBusiness();
  if (stored) {
    applyPickedBusinessToLinks(stored);
  }
}

function readPickedBusiness() {
  try {
    return JSON.parse(sessionStorage.getItem(PICKED_BUSINESS_KEY) || "null");
  } catch {
    return null;
  }
}

// The dated and cumulative self-employment models share one page family; the UK property
// models share their own. Foreign property and any other HMRC business type have no page
// family here, so a pick of that type hides the step 3 to 8 links and shows the diversion
// note instead of routing to either family.
const STEP_LINK_IDS = ["step3Link", "step4Link", "step5Link", "step6Link", "step7Link", "step8Link"];

function listedBusinessNeedsDiversion() {
  return Array.from(document.querySelectorAll('#businessPickerList input[name="pickedBusiness"]')).some(
    (radio) => radio.dataset.typeOfBusiness !== "self-employment" && radio.dataset.typeOfBusiness !== "uk-property",
  );
}

function applyPickedBusinessToLinks(business) {
  const typeOfBusiness = business && business.typeOfBusiness;
  const isUkProperty = typeOfBusiness === "uk-property";
  const pickedNeedsDiversion = !!typeOfBusiness && typeOfBusiness !== "self-employment" && !isUkProperty;

  STEP_LINK_IDS.forEach((id) => {
    document.getElementById(id).closest(".dashboard-step").style.display = pickedNeedsDiversion ? "none" : "";
  });
  document.getElementById("foreignPropertyDiversionNote").style.display =
    pickedNeedsDiversion || listedBusinessNeedsDiversion() ? "block" : "none";

  if (pickedNeedsDiversion) return;

  document.getElementById("step3Link").href = isUkProperty ? "ukPropertyPeriod.html" : "selfEmploymentPeriod.html";
  document.getElementById("step4Link").href = isUkProperty ? "ukPropertyPeriods.html" : "selfEmploymentPeriods.html";
  document.getElementById("step5Link").href = isUkProperty ? "ukPropertyPeriodView.html" : "selfEmploymentPeriodView.html";
  document.getElementById("step6Link").href = isUkProperty ? "ukPropertyPeriodAmend.html" : "selfEmploymentPeriodAmend.html";
  document.getElementById("step7Link").href = isUkProperty ? "ukPropertyAnnualSubmission.html" : "annualSubmission.html";
  document.getElementById("step8Link").href = isUkProperty ? "ukPropertyAdjustments.html" : "adjustments.html";
}

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// The year's token cost is counted from the businesses HMRC listed, before the customer
// spends anything: each business's four quarterly updates, plus one final declaration for
// the whole return. The annual submission, the adjustable summary, losses and claims and
// tax liability adjustments are all free (D1/D8), so they add nothing here.
function displayBusinessPicker(businesses) {
  const list = document.getElementById("businessPickerList");
  const costLine = document.getElementById("yearTokenCost");

  if (!businesses || businesses.length === 0) {
    list.innerHTML = '<p class="no-data">No businesses found for the specified National Insurance number.</p>';
    costLine.textContent = "";
    document.getElementById("businessPickerResults").style.display = "block";
    return;
  }

  const stored = readPickedBusiness();
  list.innerHTML = businesses
    .map((business, index) => {
      const checked = stored && stored.businessId === business.businessId ? "checked" : index === 0 && !stored ? "checked" : "";
      const label = `${escapeHtml(business.tradingName || business.typeOfBusiness)} (${escapeHtml(business.typeOfBusiness)}, ${escapeHtml(business.businessId)})`;
      return `
        <div class="business-picker-option">
          <input type="radio" name="pickedBusiness" id="business-${index}" value="${escapeHtml(business.businessId)}"
            data-type-of-business="${escapeHtml(business.typeOfBusiness)}" ${checked} />
          <label for="business-${index}">${label}</label>
        </div>
      `;
    })
    .join("");

  const yearTokens = businesses.length * TOKENS_PER_BUSINESS_YEAR + FINAL_DECLARATION_TOKENS;
  costLine.textContent = `This year costs ${yearTokens} tokens for the ${businesses.length} business${businesses.length === 1 ? "" : "es"} HMRC listed: ${TOKENS_PER_BUSINESS_YEAR} per business for the quarterly updates, plus ${FINAL_DECLARATION_TOKENS} for the final declaration.`;

  // usage.html carries the same figures beside the running total it already shows (D6),
  // so they travel together rather than being computed twice.
  sessionStorage.setItem("itsaYearTokenCost", JSON.stringify({ yearTokens, businessCount: businesses.length }));

  list.querySelectorAll('input[name="pickedBusiness"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      const picked = { businessId: event.target.value, typeOfBusiness: event.target.dataset.typeOfBusiness };
      sessionStorage.setItem(PICKED_BUSINESS_KEY, JSON.stringify(picked));
      applyPickedBusinessToLinks(picked);
    });
  });

  // Persist the pre-checked default (first business, or the one already stored) so the
  // step links are correct even before the customer touches a radio button.
  const preChecked = list.querySelector('input[name="pickedBusiness"]:checked');
  if (preChecked) {
    const picked = { businessId: preChecked.value, typeOfBusiness: preChecked.dataset.typeOfBusiness };
    sessionStorage.setItem(PICKED_BUSINESS_KEY, JSON.stringify(picked));
    applyPickedBusinessToLinks(picked);
  }

  document.getElementById("businessPickerResults").style.display = "block";
}

async function runFindBusinesses(nino, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await getBusinessDetails(nino, accessToken, govClientHeaders, false, null);
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
    const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:self-assessment";
    const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");
    try {
      window.__correlation?.prepareRedirect?.();
    } catch {}
    window.location.href = authResponseUrl;
    return;
  }
  await run(accessToken);
}

async function handleFindBusinessesSubmission(event) {
  event.preventDefault();
  const nino = document.getElementById("nino").value.replace(/\s+/g, "").toUpperCase();

  if (!window.formErrors.requireFields(["nino"])) return;

  await ensureAuthorizedThen("pendingDashboardBusinessPickerRequest", { nino }, async (accessToken) => {
    try {
      showLoading();
      hideStatus();
      showStatus("Finding your businesses...", "info");
      const result = await runFindBusinesses(nino, accessToken);
      displayBusinessPicker(result.listOfBusinesses || []);
      hideStatus();
    } catch (error) {
      showStatus(`Failed to find your businesses: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  });
}

async function continueAfterOAuth() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pending = JSON.parse(sessionStorage.getItem("pendingDashboardBusinessPickerRequest") || "null");
    if (!pending) return;

    document.getElementById("nino").value = pending.nino;
    showLoading();
    showStatus("Finding your businesses...", "info");
    const result = await runFindBusinesses(pending.nino, accessToken);
    displayBusinessPicker(result.listOfBusinesses || []);
    hideStatus();
    sessionStorage.removeItem("pendingDashboardBusinessPickerRequest");
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
    sessionStorage.removeItem("pendingDashboardBusinessPickerRequest");
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

document.getElementById("businessPickerForm").addEventListener("submit", handleFindBusinessesSubmission);

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  handleOAuthCallback();
});
