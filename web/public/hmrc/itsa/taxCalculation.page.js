// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { calculationCopyHtml, mountCopy } from "../../lib/itsa-calculation-record.js";

window.CarriedIdentifiers.buildTaxYearSelect(document.getElementById("taxYear"));
window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("taxYear", document.getElementById("taxYear"));

// The calculation on screen, which HMRC Assist reports on; null until one is displayed
let hmrcAssistDraft = null;
let hmrcAssist = null;

function describeHmrcAssistDraft() {
  if (!hmrcAssistDraft) return { applicable: false, ready: false };
  const { nino, taxYear, calculationId } = hmrcAssistDraft;
  return {
    applicable: true,
    ready: true,
    key: calculationId,
    requestBody: { nino, taxYear, calculationId },
    acknowledgeIdentity: { nino },
  };
}

function initializePage() {
  hmrcAssist = window.hmrcAssistMessages.mount({
    kind: "itsa",
    container: document.getElementById("hmrcAssistCheck"),
    describeDraft: describeHmrcAssistDraft,
    unavailableText: "HMRC Assist feedback is unavailable at the moment. You can still continue to your final declaration.",
  });
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
}

async function runCalculationTrigger(calculationDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const govClientHeaders = await getGovClientHeaders();
  return await triggerCalculation(calculationDetails, accessToken, govClientHeaders, runFraudPreventionHeaderValidation, testScenario);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const TAX_BREAKDOWN_VALUE_IDS = {
  "taxCalculation.incomeTax.totalIncomeTaxDue": "incomeTaxAmount",
  "taxCalculation.nics.totalNic": "nicsAmount",
  "taxCalculation.totalTaxDeducted": "totalTaxDeductedAmount",
};

const JOURNEY_LINKS = [
  { href: "dashboard.html", text: "Back to Income Tax" },
  { href: "lossesAndClaims.html", text: "Check your losses and claims" },
];

function messageList(value) {
  return Array.isArray(value) ? value.filter((message) => message && typeof message === "object") : [];
}

function messageLine(message) {
  const id = typeof message.id === "string" && message.id.trim() ? `${message.id.trim()}: ` : "";
  const text = typeof message.text === "string" ? message.text : "";
  return { id, text };
}

function displayCalculation(calculation, nino, taxYear, calculationType) {
  const figures = document.getElementById("calculationFigures");
  const messagesContainer = document.getElementById("calculationMessages");
  const calc = calculation?.calculation;
  const messages = {
    info: messageList(calculation?.messages?.info),
    warnings: messageList(calculation?.messages?.warnings),
    errors: messageList(calculation?.messages?.errors),
  };

  const calculationId = typeof calculation?.metadata?.calculationId === "string" ? calculation.metadata.calculationId : "";
  hmrcAssistDraft = calc && calculationId ? { nino, taxYear, calculationId } : null;
  hmrcAssist.reset();

  const continueLink = document.getElementById("continueToFinalDeclaration");
  if (calc && typeof calc === "object") {
    figures.style.display = "block";
    const breakdownRows = HmrcFieldTable.taxCalculationRows(calc).map((row) => ({ ...row, valueId: TAX_BREAKDOWN_VALUE_IDS[row.field] }));
    const allowanceRows = HmrcFieldTable.allowanceRows(calc.allowancesAndDeductions);
    mountCopy(
      document.getElementById("calculationCopy"),
      calculationCopyHtml({ calculation, nino, taxYear, calculationType, breakdownRows, allowanceRows, links: JOURNEY_LINKS }),
    );
    HmrcFieldTable.mountFieldKey(document.getElementById("fieldKey"), [...breakdownRows, ...allowanceRows]);

    // Gate on the calculationType the customer requested, not HMRC's echoed metadata -
    // the sandbox's default (no Gov-Test-Scenario) retrieve response is a fixed example
    // unrelated to what was actually triggered, so its calculationType never matches.
    if (calculationType === "intent-to-finalise" && calculationId) {
      window.CarriedIdentifiers.remember("calculationId", calculationId);
      const params = new URLSearchParams({ nino, taxYear, calculationId, calculationType });
      document.getElementById("continueToFinalDeclarationLink").href = `finalDeclaration.html?${params}`;
      continueLink.style.display = "block";
    } else {
      continueLink.style.display = "none";
    }
  } else {
    figures.style.display = "none";
    continueLink.style.display = "none";
  }

  const allMessages = [
    ...messages.errors.map((m) => ({ ...m, level: "error" })),
    ...messages.warnings.map((m) => ({ ...m, level: "warning" })),
    ...messages.info.map((m) => ({ ...m, level: "info" })),
  ];
  if (allMessages.length === 0) {
    messagesContainer.replaceChildren();
  } else {
    const list = el("ul");
    list.id = "calculationMessagesList";
    allMessages.forEach((m) => {
      const { id, text } = messageLine(m);
      const item = el("li", `status-message status-${m.level}`);
      if (id) item.append(el("strong", "", id.trim()), " ");
      item.append(text);
      list.append(item);
    });
    messagesContainer.replaceChildren(el("h3", "", "Messages"), list);
  }
}

window.displayCalculation = displayCalculation;

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

async function runTrigger(calculationDetails, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  showLoading();
  hideStatus();
  showStatus("Calculating... this can take a few seconds.", "info");
  const calculation = await runCalculationTrigger(calculationDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
  displayCalculation(calculation, calculationDetails.nino, calculationDetails.taxYear, calculationDetails.calculationType);
  document.getElementById("triggerForm").style.display = "none";
  document.getElementById("calculationResults").style.display = "block";
  hideStatus();
}

async function handleTriggerFormSubmission(event) {
  event.preventDefault();
  const nino = document.getElementById("nino").value.replace(/\s+/g, "").toUpperCase();
  const taxYear = document.getElementById("taxYear").value.trim();
  const calculationType = document.getElementById("calculationType").value;
  const testScenario = document.getElementById("testScenario")?.value;
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino", "taxYear", "calculationType"])) return;

  const calculationDetails = { nino, taxYear, calculationType };

  await ensureAuthorizedThen(
    "pendingCalculationTriggerRequest",
    { calculationDetails, testScenario, runFraudPreventionHeaderValidation },
    async (accessToken) => {
      try {
        await runTrigger(calculationDetails, testScenario, runFraudPreventionHeaderValidation, accessToken);
      } catch (error) {
        showStatus(`Failed to calculate: ${error.message}`, "error");
      } finally {
        hideLoading();
      }
    },
  );
}

async function continueAfterOAuth() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pending = JSON.parse(sessionStorage.getItem("pendingCalculationTriggerRequest") || "null");
    if (!pending) return;

    document.getElementById("nino").value = pending.calculationDetails.nino;
    document.getElementById("taxYear").value = pending.calculationDetails.taxYear;
    document.getElementById("calculationType").value = pending.calculationDetails.calculationType;

    await runTrigger(pending.calculationDetails, pending.testScenario, pending.runFraudPreventionHeaderValidation, accessToken);
    sessionStorage.removeItem("pendingCalculationTriggerRequest");
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("oauth_state");
  } catch (error) {
    showStatus(`Failed: ${error.message}`, "error");
    sessionStorage.removeItem("pendingCalculationTriggerRequest");
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

document.getElementById("itsaCalculationTriggerForm").addEventListener("submit", handleTriggerFormSubmission);

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  document.getElementById("calculationResults").style.display = "none";
  document.getElementById("triggerForm").style.display = "block";
  document.getElementById("itsaCalculationTriggerForm").reset();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.addEventListener("DOMContentLoaded", function () {
  initializePage();
  handleOAuthCallback();
});
