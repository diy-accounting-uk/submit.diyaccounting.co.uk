// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// File Company Tax Return: companyView -> formView -> previewView -> resultView. The Government
// Gateway user ID and password are read from the page when the return is submitted, sent once and
// held nowhere else.

const FILED_ACCOUNTS_STORAGE_KEY = "filedSmallCompanyAccounts";
const MAX_POLLS = 60;

const COMPANY_TAX_RETURN_GUIDE_URL = "https://www.gov.uk/guidance/the-company-tax-return-guide";

// HMRC's own box names from the CT600 (2026) Version 3 form and the Company Tax Return guide.
const BOX_MEANINGS = {
  1: "Company name",
  2: "Company registration number",
  3: "Tax reference (Unique Taxpayer Reference)",
  4: "Type of company",
  30: "Start of the period covered by the return",
  35: "End of the period covered by the return",
  145: "Total turnover from trade",
  155: "Trading profits",
  160: "Trading losses brought forward set against trading profits",
  165: "Net trading profits",
  170: "Bank, building society or other interest, and profits from non-trading loan relationships",
  235: "Profits before other deductions and reliefs",
  300: "Profits before qualifying donations and group relief",
  315: "Profits chargeable to Corporation Tax",
  326: "Number of associated companies in this period",
  327: "Number of associated companies in the first financial year",
  328: "Number of associated companies in the second financial year",
  329: "Small profit rate or marginal relief entitlement",
  330: "Financial year of the first tax rate",
  335: "Amount of profit chargeable at the first rate",
  340: "First rate of tax",
  345: "Tax at the first rate",
  380: "Financial year of the second tax rate",
  385: "Amount of profit chargeable at the second rate",
  390: "Second rate of tax",
  395: "Tax at the second rate",
  430: "Corporation Tax",
  435: "Marginal relief",
  440: "Corporation Tax chargeable",
  475: "Net Corporation Tax liability",
  510: "Tax chargeable",
  515: "Income Tax deducted from gross income included in profits",
  525: "Self-assessment of tax payable before restitution tax and coronavirus support scheme overpayments",
  528: "Self-assessment of tax payable",
  595: "Tax already paid (and not already repaid)",
  600: "Tax outstanding",
  620: "Franked investment income or exempt ABGH distributions",
  690: "Annual investment allowance",
  705: "Machinery and plant, main pool: allowances",
  710: "Machinery and plant, main pool: balancing charges",
  975: "Name of the person signing the declaration",
  985: "Status of the person signing the declaration",
};

// The anchor of each box's section in the Company Tax Return guide.
const BOX_GUIDE_ANCHORS = {
  1: "company-name",
  2: "company-registration-number",
  3: "tax-reference",
  4: "type-of-company",
  30: "and-35-period-of-the-return",
  35: "and-35-period-of-the-return",
  145: "turnover",
  155: "trading-profits",
  160: "trading-losses-brought-forward-set-against-trading-profits",
  165: "net-trading-profits",
  170: "and-172-bank-building-society-or-other-interest-and-profits-from-non-trading-loan-relationships",
  235: "profits-before-other-deductions-and-reliefs-1",
  300: "profits-before-qualifying-donations-and-group-relief",
  315: "profits-chargeable-to-corporation-tax",
  326: "number-of-associated-companies-in-this-period",
  327: "and-328-number-of-associated-companies-in-the-first-and-second-financial-years",
  328: "and-328-number-of-associated-companies-in-the-first-and-second-financial-years",
  329: "small-profit-rate-or-marginal-relief-entitlement",
  330: "boxes-330-to-425",
  335: "boxes-330-to-425",
  340: "boxes-330-to-425",
  345: "boxes-330-to-425",
  380: "boxes-330-to-425",
  385: "boxes-330-to-425",
  390: "boxes-330-to-425",
  395: "boxes-330-to-425",
  430: "corporation-tax",
  435: "marginal-relief",
  440: "corporation-tax-chargeable",
  475: "net-corporation-tax-liability",
  510: "tax-chargeable",
  515: "income-tax-deducted-from-gross-income-included-in-profits",
  525: "self-assessment-of-tax-payable-before-restitution-tax-and-coronavirus-support-scheme-overpayments",
  528: "self-assessment-of-tax-payable",
  595: "tax-already-paid-and-not-already-repaid",
  600: "tax-outstanding",
  620: "franked-investment-income-or-exempt-abgh-distributions",
  690: "annual-investment-allowance",
  705: "and-710-machinery-and-plant--main-pool",
  710: "and-710-machinery-and-plant--main-pool",
  975: "declaration",
  985: "declaration",
};

const MONEY_BOXES = new Set([145, 155, 315, 440]);

// Each computation line in the order HMRC's computation prints it: a deduction shows in
// brackets, a subtotal has a rule above it and the total a double rule below it.
const COMPUTATION_LINES = [
  { field: "profitLossPerAccounts", meaning: "Profit or loss per the accounts" },
  { field: "nonTradingLoanRelationshipCredits", meaning: "Less: non-trading loan relationship credits", deduction: true },
  { field: "depreciation", meaning: "Add: depreciation" },
  { field: "amortisation", meaning: "Add: amortisation" },
  { field: "entertaining", meaning: "Add: entertaining" },
  { field: "adjustedProfitBeforeCapitalAllowances", meaning: "Adjusted profit before capital allowances", style: "subtotal" },
  { field: "totalCapitalAllowances", meaning: "Less: total capital allowances", deduction: true },
  { field: "adjustedProfit", meaning: "Adjusted profit", style: "total" },
];

const COMPUTATIONS_GUIDE_ANCHOR = "and-90-accounts-and-computations";

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

function guideLink(text, anchor) {
  const link = document.createElement("a");
  link.href = `${COMPANY_TAX_RETURN_GUIDE_URL}#${anchor}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = text;
  return link;
}

function tableRow(...cells) {
  const row = document.createElement("tr");
  for (const cell of cells) {
    const td = document.createElement("td");
    if (cell instanceof Node) {
      td.append(cell);
    } else {
      td.textContent = String(cell);
    }
    row.append(td);
  }
  return row;
}

// An amount as printed accounts show it: thousands separators, pence only when there are any,
// and brackets around a deduction or a negative amount (but not both).
function formatPounds(value, deduction = false) {
  const amount = Number(value);
  const digits = Number.isInteger(amount) ? 0 : 2;
  const text = Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return amount !== 0 && deduction !== amount < 0 ? `(${text})` : text;
}

function amountCell(row, text, style) {
  const cell = row.lastElementChild;
  cell.textContent = text;
  cell.style.textAlign = "right";
  cell.style.whiteSpace = "nowrap";
  if (style === "subtotal" || style === "total") cell.style.borderTop = "1px solid currentColor";
  if (style === "total") {
    cell.style.borderBottom = "3px double currentColor";
    cell.style.fontWeight = "bold";
  }
  return row;
}

function renderReview(preview, request) {
  const boxRows = Object.keys(preview.boxes)
    .map(Number)
    .sort((a, b) => a - b)
    .map((box) => {
      const row = tableRow(box, guideLink(BOX_MEANINGS[box], BOX_GUIDE_ANCHORS[box]), preview.boxes[box]);
      return MONEY_BOXES.has(box) ? amountCell(row, formatPounds(preview.boxes[box])) : row;
    });
  element("ct600Table")
    .querySelector("tbody")
    .replaceChildren(...boxRows);
  const lineRows = COMPUTATION_LINES.map(({ field, meaning, deduction, style }) =>
    amountCell(
      tableRow(guideLink(meaning, COMPUTATIONS_GUIDE_ANCHOR), ""),
      formatPounds(request.computationLines[field], deduction),
      style,
    ),
  );
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
