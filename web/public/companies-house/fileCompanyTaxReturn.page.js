// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// File Company Tax Return: companyView -> formView -> previewView -> resultView. The Government
// Gateway user ID and password are read from the page when the return is submitted, sent once and
// held nowhere else.

const FILED_ACCOUNTS_STORAGE_KEY = "filedSmallCompanyAccounts";
const MAX_POLLS = 60;

const BOX_MEANINGS = {
  1: "Company name",
  2: "Company registration number",
  3: "Unique Taxpayer Reference",
  30: "Start of the accounting period",
  35: "End of the accounting period",
  145: "Turnover",
  155: "Trading profits",
  315: "Profits chargeable to Corporation Tax",
  440: "Corporation Tax",
  975: "Name of the person signing",
  985: "Status of the person signing",
};

const COMPUTATION_LINE_MEANINGS = {
  profitLossPerAccounts: "Profit or loss per the accounts",
  nonTradingLoanRelationshipCredits: "Non-trading loan relationship credits",
  depreciation: "Depreciation",
  amortisation: "Amortisation",
  entertaining: "Entertaining",
  adjustedProfitBeforeCapitalAllowances: "Adjusted profit before capital allowances",
  totalCapitalAllowances: "Total capital allowances",
  adjustedProfit: "Adjusted profit",
};

let company = null;
let previewRequest = null;

function element(id) {
  return document.getElementById(id);
}

function showView(name) {
  for (const id of ["companyView", "formView", "previewView", "resultView"]) {
    element(id).style.display = id === name ? "block" : "none";
  }
}

function paragraph(...parts) {
  const node = document.createElement("p");
  for (const part of parts) {
    if (typeof part === "string") {
      node.append(part);
    } else {
      const strong = document.createElement("strong");
      strong.textContent = String(part.strong);
      node.append(strong);
    }
  }
  return node;
}

function readFiledAccounts() {
  try {
    const stored = sessionStorage.getItem(FILED_ACCOUNTS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function offerFiledAccounts() {
  const filed = readFiledAccounts();
  if (!filed) return;
  element("filedAccountsCompany").textContent = `${filed.companyName} (${filed.companyNumber})`;
  element("accountsSourceFiledGroup").style.display = "block";
}

function filedAccountsSelected() {
  return element("accountsSourceFiled").checked;
}

function loanOverdrawn() {
  return element("loanOverdrawnYes").checked;
}

function renderLoanStop() {
  element("loanOverdrawnStop").style.display = loanOverdrawn() ? "block" : "none";
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  const companyNumber = window.normaliseCompanyNumber(element("companyNumber").value);
  if (!companyNumber) {
    window.showStatus("Please enter a company number.", "error");
    return;
  }

  window.showLoading();
  window.hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber: profile.companyNumber, companyName: profile.companyName };
    element("formCompanyName").textContent = company.companyName;
    element("formCompanyNumber").textContent = company.companyNumber;
    showView("formView");
  } catch (error) {
    console.error("Failed to look up the company:", error);
    window.showStatus(error.message || "Failed to look up the company.", "error");
  } finally {
    window.hideLoading();
  }
}

async function handleBookExportFile() {
  const file = element("bookExportFile").files[0];
  if (file) element("bookExport").value = await file.text();
}

function parseBookExport() {
  let parsed;
  try {
    parsed = JSON.parse(element("bookExport").value);
  } catch {
    return { problem: "The book export is not valid JSON." };
  }
  if (!parsed?.boxes || !parsed?.computationLines || !parsed?.tradeName) {
    return { problem: "The book export needs boxes, computationLines and tradeName." };
  }
  if (!filedAccountsSelected() && !parsed.smallCompany) {
    return { problem: "The book export has no accounts. Choose the accounts from the Companies House filing, or use a fuller export." };
  }
  return { parsed };
}

function accountsFrom(exported) {
  if (filedAccountsSelected()) {
    const filed = readFiledAccounts();
    return {
      periodStart: filed.periodStart,
      periodEnd: filed.periodEnd,
      averageEmployees: filed.averageEmployees,
      director: filed.director,
      smallCompany: { ...filed.smallCompany, filleted: false },
    };
  }
  return {
    periodStart: exported.periodStart,
    periodEnd: exported.periodEnd,
    averageEmployees: exported.averageEmployees,
    director: exported.director,
    smallCompany: { ...exported.smallCompany, filleted: false },
  };
}

function buildReturnRequest(exported) {
  return {
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    ...accountsFrom(exported),
    statementsAccepted: {
      section477Exemption: element("statementSection477Exemption").checked,
      membersNotRequiredAudit: element("statementMembersNotRequiredAudit").checked,
      directorsResponsibilities: element("statementDirectorsResponsibilities").checked,
      smallCompaniesRegime: element("statementSmallCompaniesRegime").checked,
    },
    tradeName: exported.tradeName,
    boxes: exported.boxes,
    computationLines: exported.computationLines,
    utr: element("utr").value.trim(),
    declarant: { name: element("declarantName").value.trim(), status: element("declarantStatus").value.trim() },
    directorsLoanOverdrawn: false,
    declarationAccepted: element("declarationAccepted").checked,
  };
}

function formProblem() {
  if (loanOverdrawn()) {
    return "A director's loan account overdrawn at the end of the period needs supplementary page CT600A, which this service does not file.";
  }
  const accepted = [
    "statementSection477Exemption",
    "statementMembersNotRequiredAudit",
    "statementDirectorsResponsibilities",
    "statementSmallCompaniesRegime",
  ].every((id) => element(id).checked);
  if (!accepted) return "All four statements must be accepted before previewing.";
  if (!element("declarationAccepted").checked) return "The declaration must be accepted before previewing.";
  return null;
}

function tableRow(...cells) {
  const row = document.createElement("tr");
  for (const cell of cells) {
    const td = document.createElement("td");
    td.textContent = String(cell);
    row.append(td);
  }
  return row;
}

function renderReview(preview, request) {
  const boxRows = Object.keys(preview.boxes)
    .map(Number)
    .sort((a, b) => a - b)
    .map((box) => tableRow(box, BOX_MEANINGS[box] ?? "", preview.boxes[box]));
  element("ct600Table")
    .querySelector("tbody")
    .replaceChildren(...boxRows);
  const lineRows = Object.entries(COMPUTATION_LINE_MEANINGS).map(([field, meaning]) => tableRow(meaning, request.computationLines[field]));
  element("computationsTable")
    .querySelector("tbody")
    .replaceChildren(...lineRows);
  element("previewIxbrl").textContent = preview.computationsIxbrl;
}

async function handleReturnFormSubmit(event) {
  event.preventDefault();
  const problem = formProblem();
  if (problem) {
    window.showStatus(problem, "error");
    return;
  }
  const { parsed, problem: exportProblem } = parseBookExport();
  if (exportProblem) {
    window.showStatus(exportProblem, "error");
    return;
  }

  window.showLoading();
  window.hideStatus();
  try {
    previewRequest = buildReturnRequest(parsed);
    const preview = await window.previewCtReturn(previewRequest);
    renderReview(preview, previewRequest);
    showView("previewView");
  } catch (error) {
    console.error("Failed to preview the Company Tax Return:", error);
    window.showStatus(error.message || "Failed to preview the Company Tax Return.", "error");
  } finally {
    window.hideLoading();
  }
}

function renderErrors(outcome) {
  const container = element("returnErrors");
  const entries = [...(outcome.errors ?? []), ...(outcome.businessErrors ?? [])];
  if (entries.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.replaceChildren(...entries.map((entry) => paragraph(`${entry.number}: ${entry.text}`)));
}

function waitSeconds(seconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(seconds, 1) * 1000));
}

async function pollUntilSettled(correlationId, firstWaitSeconds, extraHeaders) {
  let waitFor = firstWaitSeconds;
  let result;
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await waitSeconds(waitFor);
    result = await window.pollCtReturn(correlationId, extraHeaders);
    if (result.statusCode === "ACCEPT" || result.statusCode === "REJECT") return result;
    element("returnResult").replaceChildren(
      paragraph("Return ", { strong: correlationId }, " is ", { strong: result.statusCode }, ". Checking again..."),
    );
    waitFor = result.pollIntervalSeconds;
  }
  return result;
}

function showOutcome(outcome) {
  element("returnErrors").style.display = "none";
  element("returnIrmark").style.display = "none";
  element("tryAgainBtn").style.display = "none";
  element("startAgainBtn").style.display = "none";
  if (outcome.statusCode === "ACCEPT") {
    element("returnResult").replaceChildren(paragraph("HMRC ", { strong: "ACCEPTED" }, " the Company Tax Return."));
    element("returnIrmark").replaceChildren(paragraph("IRmark: ", { strong: outcome.irmark }));
    element("returnIrmark").style.display = "block";
    element("startAgainBtn").style.display = "inline-block";
    return;
  }
  if (outcome.statusCode === "REJECT") {
    element("returnResult").replaceChildren(paragraph("HMRC ", { strong: "REJECTED" }, " the Company Tax Return."));
    renderErrors(outcome);
    element("tryAgainBtn").style.display = "inline-block";
    return;
  }
  element("returnResult").replaceChildren(
    paragraph(
      "HMRC has not settled the return yet. Return ",
      { strong: outcome.correlationId },
      " is still ",
      { strong: outcome.statusCode },
      ".",
    ),
  );
}

async function handleSubmitReturn() {
  const gatewayUserId = element("gatewayUserId").value.trim();
  const gatewayPassword = element("gatewayPassword").value;
  if (!gatewayUserId || !gatewayPassword) {
    window.showStatus("Enter the Government Gateway user ID and password.", "error");
    return;
  }

  window.showLoading();
  window.hideStatus();
  try {
    const scenario = element("govTestScenario").value.trim();
    const scenarioHeaders = scenario ? { "Gov-Test-Scenario": scenario } : {};
    const submission = await window.submitCtReturn({ ...previewRequest, gatewayUserId, gatewayPassword }, scenarioHeaders);
    element("gatewayPassword").value = "";
    element("returnResult").replaceChildren(
      paragraph("Return ", { strong: submission.correlationId }, " accepted by the gateway. Waiting for HMRC..."),
    );
    element("returnErrors").style.display = "none";
    element("returnIrmark").style.display = "none";
    element("tryAgainBtn").style.display = "none";
    showView("resultView");
    const outcome = await pollUntilSettled(submission.correlationId, submission.pollIntervalSeconds, scenarioHeaders);
    showOutcome(outcome);
  } catch (error) {
    console.error("Company Tax Return submission failed:", error);
    window.showStatus(error.message || "Failed to file the Company Tax Return with HMRC.", "error");
  } finally {
    window.hideLoading();
  }
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  element("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

function startAgain() {
  company = null;
  previewRequest = null;
  element("companyForm").reset();
  element("returnForm").reset();
  element("gatewayUserId").value = "";
  element("gatewayPassword").value = "";
  element("declarationAccepted").checked = false;
  renderLoanStop();
  window.hideStatus();
  showView("companyView");
}

offerFiledAccounts();
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);

element("companyForm").addEventListener("submit", handleCompanySubmit);
element("returnForm").addEventListener("submit", handleReturnFormSubmit);
element("bookExportFile").addEventListener("change", handleBookExportFile);
element("loanOverdrawnYes").addEventListener("change", renderLoanStop);
element("loanOverdrawnNo").addEventListener("change", renderLoanStop);
element("backToFormBtn").addEventListener("click", () => showView("formView"));
element("submitReturnBtn").addEventListener("click", handleSubmitReturn);
element("tryAgainBtn").addEventListener("click", () => showView("previewView"));
element("startAgainBtn").addEventListener("click", startAgain);
element("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});
