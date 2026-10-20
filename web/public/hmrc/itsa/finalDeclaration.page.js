// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

let retrievedCalculation = null;
let retrievedNino = "";
let retrievedTaxYear = "";
let retrievedCalculationId = "";
let requestedCalculationType = "";

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

  // Carry nino/taxYear/calculationId over from the Tax Calculation page's "Continue to
  // Final Declaration" link, so what the customer confirmed there is what loads here.
  const params = new URLSearchParams(window.location.search);
  if (params.get("nino")) document.getElementById("nino").value = params.get("nino").toUpperCase();
  if (params.get("taxYear")) document.getElementById("taxYear").value = params.get("taxYear");
  if (params.get("calculationId")) document.getElementById("calculationId").value = params.get("calculationId");
  // Carried from the Tax Calculation page, which already confirmed intent-to-finalise -
  // HMRC's sandbox retrieve response is a fixed example unrelated to what was actually
  // triggered, so its own calculationType can't be trusted for a calculation reached this
  // way. A calculationId typed in directly carries no such confirmation, so this stays
  // empty and the check below falls back to HMRC's retrieved metadata.
  requestedCalculationType = params.get("calculationType") || "";

  document.getElementById("declarationTick").addEventListener("change", updateSubmitEnabled);
}

// The submit button stays disabled until the declaration is ticked - what the customer
// agreed to on screen and what gets sent to HMRC must be the same thing.
function updateSubmitEnabled() {
  const ticked = document.getElementById("declarationTick").checked;
  const isFinaliseType = (requestedCalculationType || retrievedCalculation?.metadata?.calculationType) === "intent-to-finalise";
  document.getElementById("submitDeclarationBtn").disabled = !(ticked && isFinaliseType);
}

async function runRetrieveCalculation(nino, taxYear, calculationId, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await getCalculation(
    nino,
    taxYear,
    calculationId,
    accessToken,
    govClientHeaders,
    runFraudPreventionHeaderValidation,
    testScenario,
  );
}

async function runSubmitDeclaration(declarationDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await postFinalDeclaration(declarationDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

const TAX_BREAKDOWN_VALUE_IDS = {
  "taxCalculation.incomeTax.totalIncomeTaxDue": "incomeTaxAmount",
  "taxCalculation.nics.totalNic": "nicsAmount",
  "taxCalculation.totalTaxDeducted": "totalTaxDeductedAmount",
};

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function displayCalculation(calculation) {
  retrievedCalculation = calculation;
  const calc = calculation?.calculation || {};
  const taxCalculation = calc.taxCalculation || {};
  document.getElementById("totalIncomeTaxAndNicsDue").textContent = HmrcFieldTable.formatMoney(taxCalculation.totalIncomeTaxAndNicsDue);
  const breakdownRows = HmrcFieldTable.taxCalculationRows(calc).map((row) => ({
    ...row,
    valueId: TAX_BREAKDOWN_VALUE_IDS[row.field],
  }));
  HmrcFieldTable.mountFieldTable(document.getElementById("taxBreakdown"), breakdownRows, {
    caption: "Income Tax and National Insurance",
  });
  HmrcFieldTable.mountFieldTable(
    document.getElementById("allowancesAndDeductions"),
    HmrcFieldTable.allowanceRows(calc.allowancesAndDeductions),
    { caption: "Allowances and deductions", emptyText: "HMRC's calculation carries no allowances or deductions." },
  );

  document.getElementById("calculationIdDisplay").textContent = `Calculation ID: ${calculation.metadata?.calculationId || "-"}`;
  document.getElementById("hmrcAssistUnacknowledged").hidden = !window.hmrcAssistMessages.unacknowledgedFor(
    "itsa",
    calculation.metadata?.calculationId,
  );

  // The final declaration only ever confirms an intent-to-finalise calculation - anything
  // else (an in-year estimate, say) is refused here rather than sent to HMRC. Prefer the
  // type carried from the Tax Calculation page (see initializePage) over HMRC's own
  // retrieved metadata, which the sandbox's default scenario echoes as a fixed example.
  const effectiveCalculationType = requestedCalculationType || calculation.metadata?.calculationType;
  const notReady = document.getElementById("notReadyForDeclaration");
  const declarationSection = document.getElementById("declarationSection");
  if (effectiveCalculationType !== "intent-to-finalise") {
    notReady.textContent = `This calculation is a ${effectiveCalculationType || "different"} calculation, not an intent to finalise. Trigger an intent to finalise calculation before declaring.`;
    notReady.style.display = "block";
    declarationSection.style.display = "none";
  } else {
    notReady.style.display = "none";
    declarationSection.style.display = "block";
  }
  updateSubmitEnabled();
}

// A 404 from the losses and claims retrieve means HMRC holds no claim for this business
// and tax year - the absence this page checks for, not an error the customer needs to
// see. Any other failure is swallowed the same way: a business list is worth showing even
// if one business's loss position could not be read.
async function fetchClaims(nino, businessId, taxYear, accessToken) {
  try {
    const govClientHeaders = await getGovClientHeaders();
    const result = await getLossesAndClaims(nino, businessId, taxYear, accessToken, govClientHeaders, false, null);
    return result?.claims || null;
  } catch (error) {
    return null;
  }
}

async function fetchTaxLiabilityAdjustments(nino, taxYear, accessToken) {
  try {
    const govClientHeaders = await getGovClientHeaders();
    const result = await getTaxLiabilityAdjustments(nino, taxYear, accessToken, govClientHeaders, false, null);
    return result?.carryBackLossesDecrease ? result : null;
  } catch (error) {
    return null;
  }
}

function describeClaims(claims) {
  if (!claims) return "No claim recorded";
  const parts = [];
  if (claims.carryForward) parts.push("carry forward");
  if (claims.carrySideways) parts.push("carry sideways");
  if (claims.carryBack) parts.push("carry back");
  return parts.length > 0 ? `Claimed: ${parts.join(", ")}` : "No claim recorded";
}

// Lists every business HMRC counted in this calculation - the gap this page exists to
// catch is a business the customer has that HMRC did not count, so the list comes from
// HMRC's own inputs, never from a page the customer visited earlier. Against each business
// it shows what the losses and claims retrieve answered, so a business whose calculation
// shows a loss with no claim recorded is visible before the tick, not after.
async function displayBusinessesAndLossPositions(calculation, nino, taxYear, accessToken) {
  const container = document.getElementById("businessesList");
  const businesses = calculation?.inputs?.incomeSources?.businessIncomeSources || [];

  if (businesses.length === 0) {
    container.innerHTML = '<p class="no-data">HMRC counted no businesses in this calculation.</p>';
    document.getElementById("taxLiabilityAdjustmentLine").textContent = "";
    document.getElementById("unclaimedLossWarning").style.display = "none";
    return;
  }

  container.innerHTML = '<p class="hint">Loading the loss position for each business...</p>';

  const profitAndLossByBusiness = {};
  (calculation?.calculation?.businessProfitAndLoss || []).forEach((entry) => {
    profitAndLossByBusiness[entry.incomeSourceId] = entry;
  });

  const rows = await Promise.all(
    businesses.map(async (business) => {
      const profitAndLoss = profitAndLossByBusiness[business.incomeSourceId] || {};
      const hasLoss = Number(profitAndLoss.netLoss || 0) > 0 || Number(profitAndLoss.adjustedIncomeTaxLoss || 0) > 0;
      const claims = await fetchClaims(nino, business.incomeSourceId, taxYear, accessToken);
      return { business, hasLoss, claims };
    }),
  );

  const anyUnclaimedLoss = rows.some((row) => row.hasLoss && !row.claims);

  container.innerHTML = `
    <table class="results-table">
      <thead>
        <tr>
          <th>Business</th>
          <th>Latest period end date</th>
          <th>Loss position</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(({ business, hasLoss, claims }) => {
            const claimText = describeClaims(claims);
            const cellText = hasLoss && !claims ? "Loss shown, no claim recorded" : claimText;
            return `
              <tr>
                <td>${escapeHtml(business.incomeSourceType)} (${escapeHtml(business.incomeSourceId)})</td>
                <td>${escapeHtml(business.latestPeriodEndDate || "-")}</td>
                <td>${hasLoss && !claims ? `<strong>${escapeHtml(cellText)}</strong>` : escapeHtml(cellText)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  document.getElementById("unclaimedLossWarning").style.display = anyUnclaimedLoss ? "block" : "none";

  const taxLiabilityAdjustments = await fetchTaxLiabilityAdjustments(nino, taxYear, accessToken);
  document.getElementById("taxLiabilityAdjustmentLine").textContent = taxLiabilityAdjustments
    ? "A tax liability adjustment is recorded for this tax year."
    : "No tax liability adjustment is recorded for this tax year.";
}

async function ensureAuthorizedThen(pendingKey, pendingValue, scope, run) {
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
    const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : scope;
    const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");
    try {
      window.__correlation?.prepareRedirect?.();
    } catch {}
    window.location.href = authResponseUrl;
    return;
  }
  await run(accessToken);
}

async function handleRetrieveFormSubmission(event) {
  event.preventDefault();
  const nino = document.getElementById("nino").value.replace(/\s+/g, "").toUpperCase();
  const taxYear = document.getElementById("taxYear").value.trim();
  const calculationId = document.getElementById("calculationId").value.trim();
  const calculationTestScenario = document.getElementById("calculationTestScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "taxYear", "calculationId"])) return;

  await ensureAuthorizedThen(
    "pendingFinalDeclarationRetrieveRequest",
    { nino, taxYear, calculationId, calculationTestScenario, runFraudPreventionHeaderValidation },
    "read:self-assessment",
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Retrieving calculation...", "info");
        const calculation = await runRetrieveCalculation(
          nino,
          taxYear,
          calculationId,
          calculationTestScenario,
          runFraudPreventionHeaderValidation,
          accessToken,
        );
        retrievedCalculation = calculation;
        retrievedNino = nino;
        retrievedTaxYear = taxYear;
        retrievedCalculationId = calculationId;
        displayCalculation(calculation);
        document.getElementById("retrieveForm").style.display = "none";
        document.getElementById("declarationContainer").style.display = "block";
        hideStatus();
        await displayBusinessesAndLossPositions(calculation, nino, taxYear, accessToken);
      } catch (error) {
        showStatus(`Failed to retrieve the calculation: ${error.message}`, "error");
      } finally {
        hideLoading();
      }
    },
  );
}

async function handleSubmitDeclaration() {
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;
  const totalIncomeTaxAndNicsDue = retrievedCalculation?.calculation?.taxCalculation?.totalIncomeTaxAndNicsDue;

  const declarationDetails = {
    nino: retrievedNino,
    taxYear: retrievedTaxYear,
    calculationId: retrievedCalculationId,
    calculationType: "final-declaration",
    totalIncomeTaxAndNicsDue,
  };

  await ensureAuthorizedThen(
    "pendingFinalDeclarationSubmitRequest",
    { declarationDetails, testScenario, runFraudPreventionHeaderValidation },
    "write:self-assessment",
    async (accessToken) => {
      try {
        showLoading();
        hideStatus();
        showStatus("Submitting final declaration...", "info");
        await runSubmitDeclaration(declarationDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
        document.getElementById("declarationContainer").style.display = "none";
        document.getElementById("finalDeclarationResults").style.display = "block";
        hideStatus();
        window.dispatchEvent(new CustomEvent("bundle-changed"));
      } catch (error) {
        // A figure changed since the calculation the customer confirmed - the fix is a
        // fresh calculation, not a retry of this same submission.
        if (
          String(error.message || "").includes("RULE_RECENT_SUBMISSIONS_EXIST") ||
          String(error.message || "").includes("More recent submissions exist")
        ) {
          document.getElementById("recentSubmissionsChanged").style.display = "block";
          hideStatus();
        } else if (error.status === 403 && error.reason === "tokens_exhausted") {
          hideStatus();
          window.SubmissionCost?.refresh();
        } else {
          showStatus(`Failed to submit the final declaration: ${error.message}`, "error");
        }
      } finally {
        hideLoading();
      }
    },
  );
}

async function continueAfterOAuth() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRetrieve = JSON.parse(sessionStorage.getItem("pendingFinalDeclarationRetrieveRequest") || "null");
    const pendingSubmit = JSON.parse(sessionStorage.getItem("pendingFinalDeclarationSubmitRequest") || "null");

    if (pendingRetrieve) {
      showLoading();
      showStatus("Retrieving calculation...", "info");
      const calculation = await runRetrieveCalculation(
        pendingRetrieve.nino,
        pendingRetrieve.taxYear,
        pendingRetrieve.calculationId,
        pendingRetrieve.calculationTestScenario,
        pendingRetrieve.runFraudPreventionHeaderValidation,
        accessToken,
      );
      retrievedCalculation = calculation;
      retrievedNino = pendingRetrieve.nino;
      retrievedTaxYear = pendingRetrieve.taxYear;
      retrievedCalculationId = pendingRetrieve.calculationId;
      displayCalculation(calculation);
      document.getElementById("retrieveForm").style.display = "none";
      document.getElementById("declarationContainer").style.display = "block";
      hideStatus();
      await displayBusinessesAndLossPositions(calculation, pendingRetrieve.nino, pendingRetrieve.taxYear, accessToken);
      sessionStorage.removeItem("pendingFinalDeclarationRetrieveRequest");
    } else if (pendingSubmit) {
      showLoading();
      showStatus("Submitting final declaration...", "info");
      await runSubmitDeclaration(
        pendingSubmit.declarationDetails,
        pendingSubmit.testScenario,
        pendingSubmit.runFraudPreventionHeaderValidation,
        accessToken,
      );
      document.getElementById("declarationContainer").style.display = "none";
      document.getElementById("finalDeclarationResults").style.display = "block";
      hideStatus();
      window.dispatchEvent(new CustomEvent("bundle-changed"));
      sessionStorage.removeItem("pendingFinalDeclarationSubmitRequest");
    } else {
      return;
    }
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    if (error.status === 403 && error.reason === "tokens_exhausted") {
      hideStatus();
      window.SubmissionCost?.refresh();
    } else {
      showStatus(`Failed: ${error.message}`, "error");
    }
    sessionStorage.removeItem("pendingFinalDeclarationRetrieveRequest");
    sessionStorage.removeItem("pendingFinalDeclarationSubmitRequest");
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

document.getElementById("itsaFinalDeclarationRetrieveForm").addEventListener("submit", handleRetrieveFormSubmission);
document.getElementById("submitDeclarationBtn").addEventListener("click", handleSubmitDeclaration);

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("finalDeclarationResults").style.display = "none";
  document.getElementById("retrieveForm").style.display = "block";
  document.getElementById("itsaFinalDeclarationRetrieveForm").reset();
  document.getElementById("declarationTick").checked = false;
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  handleOAuthCallback();
});
