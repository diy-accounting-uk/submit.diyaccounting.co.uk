// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// File small company accounts: companyView -> formView -> previewView -> resultView. No
// Companies House OAuth token: the filing goes through the XML Gateway with the operator's
// presenter credentials, so only the Cognito id token is needed to reach the API.

const PROFIT_AND_LOSS_INPUT_FIELDS = ["turnover", "costOfSales", "administrativeExpenses", "interestReceivable", "tax"];
const BALANCE_SHEET_INPUT_FIELDS = [
  "fixedAssets",
  "stocks",
  "debtors",
  "cashAtBank",
  "tradeCreditors",
  "corporationTax",
  "otherCreditors",
  "creditorsAfterOneYear",
  "calledUpShareCapital",
  "profitAndLossAccount",
];
const FIXED_ASSET_CLASSES = ["landBuildings", "plantMachinery", "furnitureFittings", "computerEquipment", "motorVehicles"];
const FIXED_ASSET_FIELDS = [
  "costAtStart",
  "additions",
  "disposals",
  "depreciationAtStart",
  "depreciationCharge",
  "depreciationOnDisposals",
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

function upperFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function readPounds(inputId) {
  return window.parseMoneyInput(document.getElementById(inputId).value, { wholePounds: true }) ?? 0;
}

function readProfitAndLoss(prefix) {
  const figures = {};
  PROFIT_AND_LOSS_INPUT_FIELDS.forEach((field) => {
    figures[field] = readPounds(prefix + upperFirst(field));
  });
  figures.grossProfit = figures.turnover - figures.costOfSales;
  figures.operatingProfit = figures.grossProfit - figures.administrativeExpenses;
  figures.profitBeforeTax = figures.operatingProfit + figures.interestReceivable;
  figures.profit = figures.profitBeforeTax - figures.tax;
  return figures;
}

function readBalanceSheet(prefix) {
  const figures = {};
  BALANCE_SHEET_INPUT_FIELDS.forEach((field) => {
    figures[field] = readPounds(prefix + upperFirst(field));
  });
  figures.capitalAndReserves = figures.calledUpShareCapital + figures.profitAndLossAccount;
  return figures;
}

function netAssetsOf(figures) {
  return (
    figures.fixedAssets +
    figures.stocks +
    figures.debtors +
    figures.cashAtBank -
    figures.tradeCreditors -
    figures.corporationTax -
    figures.otherCreditors -
    figures.creditorsAfterOneYear
  );
}

function readFixedAssetNote() {
  if (!document.getElementById("includeFixedAssetNote").checked) return undefined;
  const note = {};
  FIXED_ASSET_CLASSES.forEach((className) => {
    const figures = {};
    FIXED_ASSET_FIELDS.forEach((field) => {
      figures[field] = readPounds("note" + upperFirst(className) + upperFirst(field));
    });
    if (Object.values(figures).some((value) => value !== 0)) note[className] = figures;
  });
  return note;
}

function netBookValueOf(note) {
  return Object.values(note).reduce(
    (total, figures) =>
      total +
      (figures.costAtStart + figures.additions - figures.disposals) -
      (figures.depreciationAtStart + figures.depreciationCharge - figures.depreciationOnDisposals),
    0,
  );
}

function comparativesIncluded() {
  return document.getElementById("includeComparatives").checked;
}

function renderTotals() {
  ["current", "prior"].forEach((prefix) => {
    if (prefix === "prior" && !comparativesIncluded()) return;
    const profitAndLoss = readProfitAndLoss(prefix);
    document.getElementById(prefix + "ProfitAndLossTotals").textContent =
      `Gross profit: ${profitAndLoss.grossProfit}. Operating profit: ${profitAndLoss.operatingProfit}. ` +
      `Profit before tax: ${profitAndLoss.profitBeforeTax}. Profit for the year: ${profitAndLoss.profit}.`;
    const balanceSheet = readBalanceSheet(prefix);
    const netAssets = netAssetsOf(balanceSheet);
    document.getElementById(prefix + "BalanceSheetTotals").textContent = `Net assets: ${netAssets}. ${
      netAssets === balanceSheet.capitalAndReserves
        ? "Matches share capital plus the profit and loss reserve."
        : `Does not match share capital plus the profit and loss reserve (${balanceSheet.capitalAndReserves}) - correct this before previewing.`
    }`;
  });
  const note = readFixedAssetNote();
  if (note) {
    const netBookValue = netBookValueOf(note);
    const fixedAssets = readPounds("currentFixedAssets");
    document.getElementById("fixedAssetNoteTotals").textContent = `Net book value: ${netBookValue}. ${
      netBookValue === fixedAssets
        ? "Matches fixed assets."
        : `Does not match fixed assets (${fixedAssets}) - correct this before previewing.`
    }`;
  }
}

function toggleSections() {
  document.getElementById("comparativeFields").style.display = comparativesIncluded() ? "block" : "none";
  document.getElementById("fixedAssetNoteFields").style.display = document.getElementById("includeFixedAssetNote").checked
    ? "block"
    : "none";
  renderTotals();
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

function buildAccountsPayload() {
  const includeComparatives = comparativesIncluded();
  const fixedAssetNote = readFixedAssetNote();
  return {
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    periodStart: document.getElementById("periodStart").value,
    periodEnd: document.getElementById("periodEnd").value,
    averageEmployees: Number(document.getElementById("averageEmployees").value),
    director: {
      name: document.getElementById("directorName").value.trim(),
      dateApproved: document.getElementById("directorDateApproved").value,
    },
    statementsAccepted: {
      section477Exemption: document.getElementById("statementSection477Exemption").checked,
      membersNotRequiredAudit: document.getElementById("statementMembersNotRequiredAudit").checked,
      directorsResponsibilities: document.getElementById("statementDirectorsResponsibilities").checked,
      smallCompaniesRegime: document.getElementById("statementSmallCompaniesRegime").checked,
    },
    smallCompany: {
      filleted: document.getElementById("copyFilleted").checked,
      principalActivity: document.getElementById("principalActivity").value.trim(),
      accountingPolicies: document.getElementById("accountingPolicies").value.trim(),
      directors: document
        .getElementById("directors")
        .value.split("\n")
        .map((name) => name.trim())
        .filter((name) => name),
      balanceSheet: {
        currentYear: readBalanceSheet("current"),
        ...(includeComparatives ? { priorYear: readBalanceSheet("prior") } : {}),
      },
      profitAndLoss: {
        currentYear: readProfitAndLoss("current"),
        ...(includeComparatives ? { priorYear: readProfitAndLoss("prior") } : {}),
      },
      ...(fixedAssetNote ? { fixedAssetNote } : {}),
    },
  };
}

function formProblem() {
  const moneyProblem = window.moneyInputProblem();
  if (moneyProblem) return moneyProblem;
  const years = comparativesIncluded() ? ["current", "prior"] : ["current"];
  for (const prefix of years) {
    const balanceSheet = readBalanceSheet(prefix);
    if (netAssetsOf(balanceSheet) !== balanceSheet.capitalAndReserves) {
      return "Net assets must equal share capital plus the profit and loss reserve for every year before previewing.";
    }
  }
  const note = readFixedAssetNote();
  if (note && netBookValueOf(note) !== readPounds("currentFixedAssets")) {
    return "The tangible fixed assets note's net book value must equal the fixed assets before previewing.";
  }
  const accepted = [
    "statementSection477Exemption",
    "statementMembersNotRequiredAudit",
    "statementDirectorsResponsibilities",
    "statementSmallCompaniesRegime",
  ].every((id) => document.getElementById(id).checked);
  if (!accepted) return "All four statements must be accepted before previewing.";
  return null;
}

async function handleAccountsFormSubmit(event) {
  event.preventDefault();
  const problem = formProblem();
  if (problem) {
    showStatus(problem, "error");
    return;
  }

  showLoading();
  hideStatus();
  try {
    const preview = await window.renderMicroEntityAccounts(buildAccountsPayload());
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

function paragraph(...parts) {
  const element = document.createElement("p");
  for (const part of parts) {
    if (typeof part === "string") {
      element.append(part);
    } else {
      const strong = document.createElement("strong");
      strong.textContent = String(part.strong);
      element.append(strong);
    }
  }
  return element;
}

function renderRejections(rejections) {
  const container = document.getElementById("rejections");
  if (!rejections || rejections.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.replaceChildren(...rejections.map((entry) => paragraph(`${entry.rejectCode}: ${entry.description}`)));
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
    document
      .getElementById("filingResult")
      .replaceChildren(
        paragraph("Submission ", { strong: submissionNumber }, " is ", { strong: result.statusCode }, ". Checking again..."),
      );
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
  try {
    const filedAccounts = buildAccountsPayload();
    const accounts = { ...filedAccounts, companyAuthCode };
    const govTestScenario = document.getElementById("govTestScenario").value.trim();
    const govTestScenarioHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    const submission = await window.submitMicroEntityAccounts(accounts, govTestScenarioHeaders);
    document
      .getElementById("filingResult")
      .replaceChildren(
        paragraph(
          "Submission ",
          { strong: submission.submissionNumber },
          ` accepted by the gateway at ${submission.gatewayTimestamp}. Waiting for Companies House...`,
        ),
      );
    showView("resultView");

    const outcome = await pollUntilSettled(submission.submissionNumber, govTestScenarioHeaders);
    document
      .getElementById("filingResult")
      .replaceChildren(paragraph("Submission ", { strong: outcome.submissionNumber }, " was ", { strong: outcome.statusCode }, "."));
    renderRejections(outcome.rejections);
    showFilingCopyLink(outcome);
    if (outcome.statusCode === "ACCEPT") {
      sessionStorage.setItem("filedSmallCompanyAccounts", JSON.stringify(filedAccounts));
      document.getElementById("taxReturnPrompt").style.display = "block";
    }
    document.getElementById("startAgainBtn").style.display = "inline-block";
  } catch (error) {
    console.error("Companies House accounts filing failed:", error);
    showStatus(error.message || "Failed to file the accounts with Companies House.", "error");
  } finally {
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
  toggleSections();
  document.getElementById("rejections").style.display = "none";
  document.getElementById("taxReturnPrompt").style.display = "none";
  document.getElementById("startAgainBtn").style.display = "none";
  hideStatus();
  showView("companyView");
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("accountsForm").addEventListener("submit", handleAccountsFormSubmit);
document.getElementById("accountsForm").addEventListener("input", renderTotals);
document.getElementById("includeComparatives").addEventListener("change", toggleSections);
document.getElementById("includeFixedAssetNote").addEventListener("change", toggleSections);
document.getElementById("backToFormBtn").addEventListener("click", () => showView("formView"));
document.getElementById("submitFilingBtn").addEventListener("click", handleSubmitFiling);
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
document.getElementById("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});

window.booksImport.mount(document.getElementById("booksImport"), { kind: "small-company-accounts" });
