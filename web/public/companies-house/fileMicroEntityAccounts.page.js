// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// File micro-entity accounts: companyView -> formView -> previewView -> resultView. No
// Companies House OAuth token: the filing goes through the XML Gateway with the operator's
// presenter credentials, so only the Cognito id token is needed to reach the API.

const BALANCE_SHEET_FIELDS = [
  "fixedAssets",
  "currentAssets",
  "creditorsWithinOneYear",
  "creditorsAfterOneYear",
  "calledUpShareCapital",
  "profitAndLossAccount",
  "capitalAndReserves",
];

let company = null;

function views() {
  return {
    companyView: document.getElementById("companyView"),
    formView: document.getElementById("formView"),
    previewView: document.getElementById("previewView"),
    resultView: document.getElementById("resultView"),
  };
}

function showView(name) {
  const all = views();
  Object.keys(all).forEach((key) => {
    all[key].style.display = key === name ? "block" : "none";
  });
}

function readYear(prefix) {
  const year = {};
  BALANCE_SHEET_FIELDS.forEach((field) => {
    const inputId = prefix + field.charAt(0).toUpperCase() + field.slice(1);
    year[field] = window.parseMoneyInput(document.getElementById(inputId).value, { wholePounds: true }) ?? 0;
  });
  return year;
}

function netAssetsOf(year) {
  const netCurrentAssets = year.currentAssets - year.creditorsWithinOneYear;
  const totalAssetsLessCurrentLiabilities = year.fixedAssets + netCurrentAssets;
  return totalAssetsLessCurrentLiabilities - year.creditorsAfterOneYear;
}

function renderYearTotals(elementId, year) {
  const netAssets = netAssetsOf(year);
  const element = document.getElementById(elementId);
  element.textContent = `Net assets: ${netAssets}. ${
    netAssets === year.capitalAndReserves
      ? "Matches capital and reserves."
      : `Does not match capital and reserves (${year.capitalAndReserves}) - correct this before previewing.`
  }`;
}

function refreshYearTotals() {
  renderYearTotals("currentYearTotals", readYear("current"));
  renderYearTotals("priorYearTotals", readYear("prior"));
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  if (!companyNumber) {
    showStatus("Please enter a company number.", "error");
    return;
  }

  showLoading();
  hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber: profile.companyNumber, companyName: profile.companyName };
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    showView("formView");
  } catch (error) {
    console.error("Failed to look up the company:", error);
    showStatus(error.message || "Failed to look up the company.", "error");
  } finally {
    hideLoading();
  }
}

const SECTION_477_STATEMENT_TEXT = document.getElementById("statementSection477ExemptionLabel").textContent.trim();
const SECTION_480_STATEMENT_TEXT =
  "The company is entitled to exemption from audit under section 480 of the Companies Act 2006 relating to dormant companies.";

function toggleDormantFields() {
  const dormant = document.getElementById("dormant").checked;
  document.getElementById("dormantFields").style.display = dormant ? "block" : "none";
  document.getElementById("statementSection477ExemptionLabel").textContent = dormant
    ? SECTION_480_STATEMENT_TEXT
    : SECTION_477_STATEMENT_TEXT;
}

function dormantPayload() {
  if (!document.getElementById("dormant").checked) return {};
  return {
    dormant: true,
    dormantTradingStatus: document.getElementById("dormantTradingStatus").value,
    shareClass: document.getElementById("shareClass").value,
    nominalValue: Number(document.getElementById("nominalValue").value),
  };
}

function buildAccountsPayload() {
  return {
    ...dormantPayload(),
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    periodStart: document.getElementById("periodStart").value,
    periodEnd: document.getElementById("periodEnd").value,
    balanceSheet: {
      currentYear: readYear("current"),
      priorYear: readYear("prior"),
    },
    averageEmployees: Number(document.getElementById("averageEmployees").value),
    director: {
      name: document.getElementById("directorName").value.trim(),
      dateApproved: document.getElementById("directorDateApproved").value,
    },
    statementsAccepted: {
      section477Exemption: document.getElementById("statementSection477Exemption").checked,
      membersNotRequiredAudit: document.getElementById("statementMembersNotRequiredAudit").checked,
      directorsResponsibilities: document.getElementById("statementDirectorsResponsibilities").checked,
      microEntityProvisions: document.getElementById("statementMicroEntityProvisions").checked,
    },
  };
}

async function handleAccountsFormSubmit(event) {
  event.preventDefault();
  const moneyProblem = window.moneyInputProblem();
  if (moneyProblem) {
    showStatus(moneyProblem, "error");
    return;
  }
  const currentYear = readYear("current");
  const priorYear = readYear("prior");
  if (netAssetsOf(currentYear) !== currentYear.capitalAndReserves || netAssetsOf(priorYear) !== priorYear.capitalAndReserves) {
    showStatus("Capital and reserves must equal net assets for both years before previewing.", "error");
    return;
  }

  const accepted = [
    "statementSection477Exemption",
    "statementMembersNotRequiredAudit",
    "statementDirectorsResponsibilities",
    "statementMicroEntityProvisions",
  ].every((id) => document.getElementById(id).checked);
  if (!accepted) {
    showStatus("All four statements must be accepted before previewing.", "error");
    return;
  }

  showLoading();
  hideStatus();
  try {
    const accounts = buildAccountsPayload();
    const preview = await window.renderMicroEntityAccounts(accounts);
    document.getElementById("previewIxbrl").textContent = preview.ixbrl;
    document.getElementById("previewRendered").srcdoc = preview.ixbrl;
    showView("previewView");
  } catch (error) {
    console.error("Failed to render the accounts preview:", error);
    showStatus(error.message || "Failed to render the accounts preview.", "error");
  } finally {
    hideLoading();
  }
}

function renderRejections(rejections) {
  const container = document.getElementById("rejections");
  if (!rejections || rejections.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.replaceChildren(
    ...rejections.map((entry) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = `${entry.rejectCode}: ${entry.description}`;
      return paragraph;
    }),
  );
}

function showFilingResult(headline, detail) {
  const container = document.getElementById("filingResult");
  const headlineParagraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = headline;
  headlineParagraph.append(strong);
  container.replaceChildren(headlineParagraph);
  if (detail) {
    const detailParagraph = document.createElement("p");
    detailParagraph.className = "hint";
    detailParagraph.textContent = detail;
    container.append(detailParagraph);
  }
}

function showFilingCopyLink(outcome) {
  if (outcome.statusCode !== "ACCEPT" || !outcome.receiptId) return;
  const link = document.getElementById("filingCopyLink");
  const receiptName = encodeURIComponent(outcome.receiptId + ".json");
  link.href = `filings.html?receipt=${receiptName}`;
  link.style.display = "inline";
}

async function pollUntilSettled(submissionNumber, extraHeaders = {}) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await window.pollMicroEntityAccounts(submissionNumber, extraHeaders);
    if (result.statusCode === "ACCEPT" || result.statusCode === "REJECT") {
      return result;
    }
    showFilingResult(`Submission ${submissionNumber} is ${result.statusCode}. Checking again...`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return window.pollMicroEntityAccounts(submissionNumber, extraHeaders);
}

async function handleSubmitFiling() {
  const companyAuthCode = document.getElementById("companyAuthCode").value.trim();
  if (companyAuthCode.length < 6 || companyAuthCode.length > 8) {
    showStatus("Enter the 6 to 8 character company authentication code.", "error");
    return;
  }

  showLoading();
  hideStatus();
  let submission;
  let govTestScenarioHeaders;
  try {
    const accounts = { ...buildAccountsPayload(), companyAuthCode };
    const govTestScenario = document.getElementById("govTestScenario").value.trim();
    govTestScenarioHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    submission = await window.submitMicroEntityAccounts(accounts, govTestScenarioHeaders);
  } catch (error) {
    console.error("Companies House accounts filing failed:", error);
    showStatus(error.message || "Failed to file the accounts with Companies House.", "error");
    hideLoading();
    return;
  }

  showFilingResult(
    `Submission ${submission.submissionNumber} accepted by the gateway at ${submission.gatewayTimestamp}. Waiting for Companies House...`,
  );
  showView("resultView");
  try {
    const outcome = await pollUntilSettled(submission.submissionNumber, govTestScenarioHeaders);
    const outcomeHeadlines = {
      ACCEPT: "Companies House accepted the accounts.",
      REJECT: "Companies House rejected the accounts.",
    };
    showFilingResult(
      outcomeHeadlines[outcome.statusCode] || "Companies House has the accounts and has not finished checking them.",
      `Status: ${outcome.statusCode}. Submission number ${outcome.submissionNumber}.`,
    );
    renderRejections(outcome.rejections);
    showFilingCopyLink(outcome);
  } catch (error) {
    console.error("Companies House accounts status check failed:", error);
    showFilingResult(
      "Your accounts were submitted. Companies House has not confirmed the outcome yet.",
      `Submission number ${submission.submissionNumber}. The status check failed: ${error.message || "unknown error"}.`,
    );
  } finally {
    document.getElementById("startAgainBtn").style.display = "inline-block";
    hideLoading();
  }
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);

function startAgain() {
  company = null;
  document.getElementById("companyForm").reset();
  document.getElementById("accountsForm").reset();
  toggleDormantFields();
  document.getElementById("rejections").style.display = "none";
  document.getElementById("startAgainBtn").style.display = "none";
  hideStatus();
  showView("companyView");
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("accountsForm").addEventListener("submit", handleAccountsFormSubmit);
document.getElementById("accountsForm").addEventListener("input", refreshYearTotals);
document.getElementById("dormant").addEventListener("change", toggleDormantFields);
document.getElementById("backToFormBtn").addEventListener("click", () => showView("formView"));
document.getElementById("submitFilingBtn").addEventListener("click", handleSubmitFiling);
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
document.getElementById("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});

window.booksImport.mount(document.getElementById("booksImport"), { kind: "micro-entity-accounts" });
