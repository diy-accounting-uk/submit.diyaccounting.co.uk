// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// File small company accounts: companyView -> formView -> previewView -> resultView. No
// Companies House OAuth token: the filing goes through the XML Gateway with the operator's
// presenter credentials, so only the Cognito id token is needed to reach the API.

const amendReceiptName = new URLSearchParams(window.location.search).get("amend");
// The status line ships hidden: an original shows the page's own status, and an amend address
// shows the revised accounts activity's status once startRevision has set it.
if (!amendReceiptName) document.querySelector("[data-feature-status]").hidden = false;

const PROFIT_AND_LOSS_INPUT_FIELDS = {
  1: ["turnover", "costOfSales", "administrativeExpenses", "interestReceivable", "tax"],
  2: [
    "turnover",
    "changeInStocks",
    "ownWorkCapitalised",
    "otherOperatingIncome",
    "rawMaterialsConsumables",
    "otherExternalCharges",
    "staffCosts",
    "depreciation",
    "otherOperatingExpenses",
    "interestReceivable",
    "interestPayable",
    "tax",
  ],
};
const BALANCE_SHEET_INPUT_FIELDS = [
  "fixedAssets",
  "stocks",
  "debtors",
  "cashAtBank",
  "bankLoansOverdrafts",
  "tradeCreditors",
  "corporationTax",
  "taxationSocialSecurity",
  "accruals",
  "otherCreditors",
  "creditorsAfterOneYear",
  "bankLoansAfterOneYear",
  "tradeDebtors",
  "otherDebtors",
  "amountsOwedByDirectors",
  "prepayments",
  "amountsOwedToDirectors",
  "amountsOwedToGroupUndertakings",
  "provisionsForLiabilities",
  "calledUpShareCapital",
  "profitAndLossAccount",
];
const POLICY_BOXES = [
  "goingConcernStatement",
  "revenueRecognitionPolicy",
  "tangibleFixedAssetsPolicy",
  "propertyPlantEquipmentPolicy",
  "depreciationMethodPolicy",
  "intangibleAssetsPolicy",
  "impairmentPolicy",
  "inventoriesPolicy",
  "cashCashEquivalentsPolicy",
  "financialInstrumentsPolicy",
  "financialInstrumentsClassificationPolicy",
  "employeeBenefitsPolicy",
  "definedContributionPensionsPolicy",
  "foreignCurrencyTranslationPolicy",
  "functionalPresentationCurrencyPolicy",
  "leasesPolicy",
  "taxPolicy",
  "currentIncomeTaxPolicy",
  "deferredTaxPolicy",
  "dividendPolicy",
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

const INTANGIBLE_ASSET_FIELDS = [
  "costAtStart",
  "additions",
  "disposals",
  "amortisationAtStart",
  "amortisationCharge",
  "amortisationOnDisposals",
];

let company = null;
// The revision this page is filing, or null for original accounts.
let revision = null;

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

function profitAndLossFormat() {
  return document.getElementById("profitAndLossFormat2").checked ? 2 : 1;
}

function readProfitAndLoss(prefix) {
  const format = profitAndLossFormat();
  const figures = {};
  PROFIT_AND_LOSS_INPUT_FIELDS[format].forEach((field) => {
    figures[field] = readPounds(prefix + upperFirst(field));
  });
  if (format === 2) {
    figures.operatingProfit =
      figures.turnover +
      figures.changeInStocks +
      figures.ownWorkCapitalised +
      figures.otherOperatingIncome -
      figures.rawMaterialsConsumables -
      figures.otherExternalCharges -
      figures.staffCosts -
      figures.depreciation -
      figures.otherOperatingExpenses;
    figures.profitBeforeTax = figures.operatingProfit + figures.interestReceivable - figures.interestPayable;
  } else {
    figures.grossProfit = figures.turnover - figures.costOfSales;
    figures.operatingProfit = figures.grossProfit - figures.administrativeExpenses;
    figures.profitBeforeTax = figures.operatingProfit + figures.interestReceivable;
  }
  figures.profit = figures.profitBeforeTax - figures.tax;
  return figures;
}

function applyProfitAndLossFormat() {
  const format = String(profitAndLossFormat());
  document.querySelectorAll("tr[data-profit-and-loss-format]").forEach((row) => {
    const shown = row.dataset.profitAndLossFormat === format;
    row.hidden = !shown;
    row.querySelectorAll("input").forEach((input) => {
      input.disabled = !shown;
    });
  });
}

// One advance for each row that holds something: a director owing the company money in the year.
function readDirectorsAdvances() {
  const advances = Array.from(document.querySelectorAll(".directors-advance-row"))
    .map((row) => {
      const boxes = Object.fromEntries(Array.from(row.querySelectorAll("[data-advance-field]"), (box) => [box.dataset.advanceField, box]));
      if (Object.values(boxes).every((box) => box.value.trim() === "")) return null;
      const pounds = (field) => window.parseMoneyInput(boxes[field].value, { wholePounds: true }) ?? 0;
      return {
        name: boxes.name.value.trim(),
        terms: boxes.terms.value.trim(),
        balanceAtStart: pounds("balanceAtStart"),
        advanced: pounds("advanced"),
        repaid: pounds("repaid"),
        balanceAtEnd: pounds("balanceAtEnd"),
      };
    })
    .filter(Boolean);
  return advances.length ? advances : undefined;
}

let directorsAdvanceRowsAdded = 0;

function directorsAdvanceRows() {
  return Array.from(document.querySelectorAll("#directorsAdvanceRows .directors-advance-row"));
}

// Each row states its number, and offers its removal while another row is left.
function numberDirectorsAdvanceRows() {
  const rows = directorsAdvanceRows();
  rows.forEach((row, index) => {
    row.querySelector(".directors-advance-row__title").textContent = window.siteText("ch.small.advance-number", "Advance {number}", {
      number: index + 1,
    });
    row.querySelector(".directors-advance-row__remove").hidden = rows.length === 1;
  });
}

// Taking a row away moves each later advance up one row and drops the last row, so the first row
// keeps the ids the form's checks name.
function removeDirectorsAdvanceRow(row) {
  const rows = directorsAdvanceRows();
  for (let index = rows.indexOf(row); index < rows.length - 1; index++) {
    rows[index].querySelectorAll("[data-advance-field]").forEach((box) => {
      box.value = rows[index + 1].querySelector(`[data-advance-field="${box.dataset.advanceField}"]`).value;
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  rows.at(-1).remove();
  numberDirectorsAdvanceRows();
}

// The row's heading and the button that takes the row away.
function completeDirectorsAdvanceRow(row) {
  const title = document.createElement("h4");
  title.className = "directors-advance-row__title";
  row.prepend(title);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "secondary-button directors-advance-row__remove";
  remove.textContent = window.siteText("ch.small.remove-advance", "Remove this advance");
  remove.addEventListener("click", () => removeDirectorsAdvanceRow(row));
  row.append(remove);
}

// Another advance row: a copy of the first with its own ids, empty.
function addDirectorsAdvanceRow() {
  const rows = document.getElementById("directorsAdvanceRows");
  const row = rows.querySelector(".directors-advance-row").cloneNode(true);
  row.querySelectorAll(".directors-advance-row__title, .directors-advance-row__remove").forEach((element) => element.remove());
  directorsAdvanceRowsAdded += 1;
  const suffix = `-${directorsAdvanceRowsAdded + 1}`;
  row.querySelectorAll("[id]").forEach((element) => {
    element.id += suffix;
  });
  row.querySelectorAll("[for]").forEach((label) => label.setAttribute("for", label.getAttribute("for") + suffix));
  row
    .querySelectorAll("[aria-describedby]")
    .forEach((box) => box.setAttribute("aria-describedby", box.getAttribute("aria-describedby") + suffix));
  row.querySelectorAll("input").forEach((box) => {
    box.value = "";
    box.name += suffix;
  });
  completeDirectorsAdvanceRow(row);
  rows.append(row);
  numberDirectorsAdvanceRows();
  return row;
}

completeDirectorsAdvanceRow(document.querySelector("#directorsAdvanceRows .directors-advance-row"));
numberDirectorsAdvanceRows();

function readBalanceSheet(prefix) {
  const figures = {};
  BALANCE_SHEET_INPUT_FIELDS.forEach((field) => {
    figures[field] = readPounds(prefix + upperFirst(field));
  });
  figures.capitalAndReserves = figures.calledUpShareCapital + figures.profitAndLossAccount;
  if (figures.accruals === 0) delete figures.accruals;
  return figures;
}

function netAssetsOf(figures) {
  return (
    figures.fixedAssets +
    figures.stocks +
    figures.debtors +
    figures.cashAtBank -
    figures.bankLoansOverdrafts -
    figures.tradeCreditors -
    figures.corporationTax -
    figures.taxationSocialSecurity -
    (figures.accruals ?? 0) -
    figures.otherCreditors -
    figures.creditorsAfterOneYear -
    figures.provisionsForLiabilities
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

function readIntangibleAssetNote() {
  if (!document.getElementById("includeIntangibleAssetNote").checked) return undefined;
  const note = {};
  INTANGIBLE_ASSET_FIELDS.forEach((field) => {
    note[field] = readPounds("intangibleNote" + upperFirst(field));
  });
  return note;
}

function intangibleNetBookValueOf(note) {
  return note
    ? note.costAtStart +
        note.additions -
        note.disposals -
        (note.amortisationAtStart + note.amortisationCharge - note.amortisationOnDisposals)
    : 0;
}

function comparativesIncluded() {
  return document.getElementById("includeComparatives").checked;
}

// Accounts show the prior year unless they are the company's first, which the company's profile and
// the period start show. The box follows that rule, and the line under it says which it is.
let firstAccountsRule = null;
// The terms of an advance to a director start from a common arrangement while the advance has an amount.
import("../lib/advance-terms.js").then(({ followAdvanceTerms }) => followAdvanceTerms(document));

import("../lib/first-accounts.js").then((module) => {
  firstAccountsRule = module;
  toggleSections();
});

function firstAccountsDate() {
  return firstAccountsRule?.dateOfIncorporationFor(company, document.getElementById("periodStart").value);
}

function applyFirstAccountsRule() {
  if (!firstAccountsRule) return;
  firstAccountsRule.applyComparativesRule({
    box: document.getElementById("includeComparatives"),
    line: document.getElementById("firstAccountsLine"),
    company,
    periodStart: document.getElementById("periodStart").value,
  });
}

async function renderTotals() {
  const { formatPounds } = await import("../lib/balance-sheet-check.js");
  ["current", "prior"].forEach((prefix) => {
    if (prefix === "prior" && !comparativesIncluded()) return;
    const profitAndLoss = readProfitAndLoss(prefix);
    const grossProfitText =
      profitAndLossFormat() === 1
        ? `${window.siteText("ch.small.gross-profit", "Gross profit: {amount}.", { amount: profitAndLoss.grossProfit })} `
        : "";
    const totals = document.getElementById(prefix + "ProfitAndLossTotals");
    totals.hidden = PROFIT_AND_LOSS_INPUT_FIELDS[profitAndLossFormat()].every((field) => profitAndLoss[field] === 0);
    totals.textContent =
      grossProfitText +
      window.siteText(
        "ch.small.profit-totals",
        "Operating profit: {operating}. Profit before tax: {pretax}. Profit for the year: {profit}.",
        {
          operating: profitAndLoss.operatingProfit,
          pretax: profitAndLoss.profitBeforeTax,
          profit: profitAndLoss.profit,
        },
      );
    const balanceSheet = readBalanceSheet(prefix);
    const netAssets = netAssetsOf(balanceSheet);
    const verdict =
      netAssets === balanceSheet.capitalAndReserves
        ? window.siteText("ch.small.matches-capital", "Matches share capital plus the profit and loss reserve.")
        : window.siteText(
            "ch.small.mismatch-capital",
            "Does not match share capital plus the profit and loss reserve ({amount}) - correct this before previewing.",
            { amount: formatPounds(balanceSheet.capitalAndReserves) },
          );
    document.getElementById(prefix + "BalanceSheetTotals").textContent = window.siteText(
      "ch.small.net-assets",
      "Net assets: {amount}. {verdict}",
      {
        amount: formatPounds(netAssets),
        verdict,
      },
    );
  });
  const note = readFixedAssetNote();
  const intangibleNote = readIntangibleAssetNote();
  const fixedAssets = readPounds("currentFixedAssets");
  if (note) {
    const netBookValue = netBookValueOf(note);
    const total = netBookValue + intangibleNetBookValueOf(intangibleNote);
    const verdict =
      total === fixedAssets
        ? window.siteText("ch.small.matches-fixed", "Matches fixed assets.")
        : window.siteText("ch.small.mismatch-fixed", "Does not match fixed assets ({amount}) - correct this before previewing.", {
            amount: fixedAssets,
          });
    document.getElementById("fixedAssetNoteTotals").textContent = window.siteText(
      "ch.small.net-book-value",
      "Net book value: {amount}. {verdict}",
      {
        amount: netBookValue,
        verdict,
      },
    );
  }
  if (intangibleNote) {
    const netBookValue = intangibleNetBookValueOf(intangibleNote);
    const total = netBookValue + (note ? netBookValueOf(note) : 0);
    const verdict =
      total === fixedAssets
        ? window.siteText("ch.small.matches-fixed-with-note", "With the tangible fixed assets note, matches fixed assets.")
        : window.siteText(
            "ch.small.mismatch-fixed-with-note",
            "With the tangible fixed assets note, does not match fixed assets ({amount}) - correct this before previewing.",
            { amount: fixedAssets },
          );
    document.getElementById("intangibleAssetNoteTotals").textContent = window.siteText(
      "ch.small.net-book-value",
      "Net book value: {amount}. {verdict}",
      {
        amount: netBookValue,
        verdict,
      },
    );
  }
}

function toggleSections() {
  applyProfitAndLossFormat();
  applyFirstAccountsRule();
  document.getElementById("comparativeFields").style.display = comparativesIncluded() ? "block" : "none";
  document.getElementById("fixedAssetNoteFields").style.display = document.getElementById("includeFixedAssetNote").checked
    ? "block"
    : "none";
  document.getElementById("intangibleAssetNoteFields").style.display = document.getElementById("includeIntangibleAssetNote").checked
    ? "block"
    : "none";
  window.accountsFormSections.showAccountantsReportFields();
  window.accountsFormSections.showControllingPartyFields();
  document.getElementById("shareCapitalNoteFields").hidden = !document.getElementById("includeShareCapitalNote").checked;
  renderTotals();
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);

  showLoading();
  hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    const { companyFromProfile } = await import("../lib/first-accounts.js");
    company = companyFromProfile(profile);
    window.accountsFormSections.fillRegisteredOffice(profile.registeredOffice);
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    showDocumentLanguageChoice(profile.jurisdiction);
    showView("formView");
    window.booksImport.showFilingsFor(company.companyNumber);
    window.priorYearFill.fill(company.companyNumber, "small", profile);
  } catch (error) {
    console.error("Failed to look up the company:", error);
    showStatus(error.message || window.siteText("ch.accounts.lookup-failed", "Failed to look up the company."), "error");
  } finally {
    hideLoading();
  }
}

function readPolicies() {
  const policies = {};
  POLICY_BOXES.forEach((box) => {
    const text = document.getElementById(box).value.trim();
    if (text) policies[box] = text;
  });
  return policies;
}

// Only a Welsh company (jurisdiction "wales") may deliver its accounts in Welsh, so only it sees the choice.
function showDocumentLanguageChoice(jurisdiction) {
  const welshCompany = jurisdiction === "wales";
  document.getElementById("documentLanguageSection").hidden = !welshCompany;
  if (!welshCompany) document.getElementById("documentLanguageEn").checked = true;
}

function documentLanguagePayload() {
  const welsh = !document.getElementById("documentLanguageSection").hidden && document.getElementById("documentLanguageCy").checked;
  return welsh ? { documentLanguage: "cy" } : {};
}

function buildAccountsPayload() {
  const includeComparatives = comparativesIncluded();
  const dateOfIncorporation = firstAccountsDate();
  const fixedAssetNote = readFixedAssetNote();
  const intangibleAssetNote = readIntangibleAssetNote();
  const registeredOffice = window.accountsFormSections.readRegisteredOffice();
  const accountantsReport = window.accountsFormSections.readAccountantsReport();
  const controllingParty = window.accountsFormSections.readControllingParty();
  const directorsAdvances = readDirectorsAdvances();
  const shareCapital = readShareCapitalNote();
  return {
    ...documentLanguagePayload(),
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    ...(registeredOffice ? { registeredOffice } : {}),
    ...(accountantsReport ? { accountantsReport } : {}),
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
      ...(dateOfIncorporation ? { dateOfIncorporation } : {}),
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
      profitAndLossFormat: profitAndLossFormat(),
      profitAndLoss: {
        currentYear: readProfitAndLoss("current"),
        ...(includeComparatives ? { priorYear: readProfitAndLoss("prior") } : {}),
      },
      ...(fixedAssetNote ? { fixedAssetNote } : {}),
      ...(intangibleAssetNote ? { intangibleAssetNote } : {}),
      ...readPolicies(),
      ...(controllingParty ? { controllingParty } : {}),
      ...(directorsAdvances ? { directorsAdvances } : {}),
      ...(shareCapital ? { shareCapital } : {}),
    },
    ...(revision ? { revision: revision.module.revisionRequest(revisionElements(), revision.source) } : {}),
  };
}

function formProblem() {
  const moneyProblem = window.moneyInputProblem();
  if (moneyProblem) return moneyProblem;
  const years = comparativesIncluded() ? ["current", "prior"] : ["current"];
  for (const prefix of years) {
    const balanceSheet = readBalanceSheet(prefix);
    if (netAssetsOf(balanceSheet) !== balanceSheet.capitalAndReserves) {
      return window.siteText(
        "ch.small.net-assets-must-equal",
        "Net assets must equal share capital plus the profit and loss reserve for every year before previewing.",
      );
    }
    if (balanceSheet.bankLoansAfterOneYear > balanceSheet.creditorsAfterOneYear) {
      return window.siteText(
        "ch.small.bank-loans-too-big",
        "Bank loans due after one year cannot be more than the creditors due after one year.",
      );
    }
    const debtorsSplit =
      balanceSheet.tradeDebtors + balanceSheet.otherDebtors + balanceSheet.amountsOwedByDirectors + balanceSheet.prepayments;
    if (debtorsSplit !== 0 && debtorsSplit !== balanceSheet.debtors) {
      return window.siteText(
        "ch.small.debtors-split",
        "Trade debtors, other debtors, amounts owed by directors and prepayments must add up to the debtors for every year before previewing.",
      );
    }
    const afterOneYearSplit =
      balanceSheet.bankLoansAfterOneYear + balanceSheet.amountsOwedToDirectors + balanceSheet.amountsOwedToGroupUndertakings;
    if (afterOneYearSplit > balanceSheet.creditorsAfterOneYear) {
      return window.siteText(
        "ch.small.after-one-year-split",
        "Bank loans, amounts owed to directors and amounts owed to group undertakings cannot be more than the creditors due after one year.",
      );
    }
  }
  const note = readFixedAssetNote();
  const intangibleNote = readIntangibleAssetNote();
  if (
    (note || intangibleNote) &&
    (note ? netBookValueOf(note) : 0) + intangibleNetBookValueOf(intangibleNote) !== readPounds("currentFixedAssets")
  ) {
    return window.siteText(
      "ch.small.notes-must-equal",
      "The fixed assets notes' net book value must equal the fixed assets before previewing.",
    );
  }
  return null;
}

// The share capital note, when its box is ticked.
function readShareCapitalNote() {
  if (!document.getElementById("includeShareCapitalNote").checked) return undefined;
  return {
    shareClass: document.getElementById("shareCapitalClass").value,
    nominalValue: Number(document.getElementById("shareCapitalNominalValue").value.trim()),
  };
}

// The first thing wrong with the notes on advances and share capital, by the rules the accounts
// route applies, as the sentence the page shows; null when nothing is.
async function notesProblem() {
  const check = await import("../lib/accounts-notes-check.js");
  const directorNames = document
    .getElementById("directors")
    .value.split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
  const calledUpShareCapital = readPounds("currentCalledUpShareCapital");
  const shareCapital = readShareCapitalNote();
  const owed = [readBalanceSheet("current"), ...(comparativesIncluded() ? [readBalanceSheet("prior")] : [])].map(
    (sheet) => sheet.amountsOwedByDirectors,
  );
  const findings = [
    ...(check.directorsAdvancesMissing(readDirectorsAdvances(), owed) ? [{ rule: "advances-required" }] : []),
    ...check.directorsAdvancesFindings(readDirectorsAdvances() || [], {
      directorNames,
      amountsOwedByDirectors: readBalanceSheet("current").amountsOwedByDirectors,
    }),
    ...(shareCapital ? check.shareCapitalFindings(shareCapital, calledUpShareCapital) : []),
  ];
  return findings.length ? check.noteFindingSentence(findings[0], { calledUpShareCapital }) : null;
}

const STATEMENT_MESSAGES = {
  statementSection477Exemption: window.siteText(
    "ch.accounts.confirm-477",
    "Confirm the company is entitled to exemption from audit under section 477",
  ),
  statementMembersNotRequiredAudit: window.siteText(
    "ch.accounts.confirm-members",
    "Confirm the members have not required the company to obtain an audit",
  ),
  statementDirectorsResponsibilities: window.siteText(
    "ch.accounts.confirm-directors",
    "Confirm the directors acknowledge their responsibilities",
  ),
  statementSmallCompaniesRegime: window.siteText("ch.small.confirm-regime", "Confirm the accounts follow the small companies regime"),
};

async function handleAccountsFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!window.formErrors.requireFormFields(form)) return;
  if (window.formErrors.reportMoneyProblems(form)) return;
  if (revision && reportRevisionProblems()) return;
  const approvalDateCheck = await import("../lib/approval-date-check.js");
  if (approvalDateCheck.showApprovalDateAfterToday(document.getElementById("directorDateApproved"), new Date())) return;
  const problem = formProblem() || (await notesProblem());
  if (problem) {
    showStatus(problem, "error");
    return;
  }
  if (!window.formErrors.requireChecked(STATEMENT_MESSAGES)) return;

  showLoading();
  hideStatus();
  const accountsFailure = await import("../lib/accounts-filing-failure.js");
  accountsFailure.clearAccountsFailure(document);
  try {
    const preview = await window.renderMicroEntityAccounts(buildAccountsPayload());
    document.getElementById("previewIxbrl").textContent = preview.ixbrl;
    window.accountsFormSections.showInFrame(document.getElementById("previewRendered"), preview.ixbrl);
    showView("previewView");
    document.getElementById("previewView").scrollIntoView();
    priorYearWarningShown = revisingFilletedAsFullWithoutPriorYear();
    if (priorYearWarningShown) {
      showStatus(
        window.siteText(
          "ch.revision.prior-profit-and-loss-empty",
          "The accounts filed were a filleted copy, so they hold no profit and loss account for the prior year. This full copy states the prior year's profit and loss lines as nothing: type them on the form if the company had them.",
        ),
        "warning",
      );
    }
  } catch (error) {
    console.error("Failed to render the accounts preview:", error);
    showStatus(window.siteText("ch.accounts.preview-failed", "Failed to render the accounts preview."), "error");
    accountsFailure.showAccountsFailure(document, error, accountsFailure.ACCOUNTS_FAILURE_STAGES.preview);
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

// A paragraph from a text with {name} places: each place holds its value in bold.
function paragraphWithValues(text, values) {
  const parts = text.split(/\{([a-z]+)\}/).map((part, index) => (index % 2 === 1 ? { strong: values[part] } : part));
  return paragraph(...parts.filter((part) => part !== ""));
}

function renderRejections(rejections) {
  const container = document.getElementById("rejections");
  if (!rejections || rejections.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.className = "outcome outcome--error";
  container.replaceChildren(...rejections.map((entry) => paragraph(window.companiesHouseRejections.rejectionText(entry))));
}

function showFilingCopyLink(outcome) {
  if (outcome.statusCode !== "ACCEPT" || !outcome.receiptId) return;
  const link = document.getElementById("filingCopyLink");
  const receiptName = encodeURIComponent(outcome.receiptId + ".json");
  link.href = `filings.html?receipt=${receiptName}`;
  link.style.display = "inline";
}

function pollUntilSettled(submission, extraHeaders) {
  window.narrateStage(window.siteText("ct.narrate-waiting-ch", "Waiting for Companies House's answer..."));
  const { submissionNumber } = submission;
  return window.companiesHouseGatewayPoll.pollGatewayUntilSettled({
    submissionNumber,
    pollIntervalSeconds: submission.pollInterval,
    poll: () => window.pollMicroEntityAccounts(submissionNumber, extraHeaders),
    onPending: (result) =>
      document
        .getElementById("filingResult")
        .replaceChildren(
          paragraphWithValues(
            ...window.companiesHouseGatewayPoll.pendingProgressSentence(
              window.siteText("ch.accounts.checking", "Submission {number} is {status}. Checking again..."),
              submissionNumber,
              result,
            ),
          ),
        ),
  });
}

// For a submission whose outcome is not known yet: Check again, or, when the gateway asked for no
// more polls of it, Start a new filing. Never both, so a second filing cannot start while the first
// may still be pending.
function offerNextStep(submission, checkOutcomeAgain) {
  if (window.companiesHouseGatewayPoll.mayCheckAgain(submission)) {
    const checkAgain = document.getElementById("checkAgainBtn");
    checkAgain.onclick = checkOutcomeAgain;
    checkAgain.style.display = "inline-block";
  } else {
    document.getElementById("startAgainBtn").style.display = "inline-block";
  }
}

// Polls for the outcome and shows it. Pending after the last poll, the page says so and offers Check
// again; it offers Start a new filing only once the outcome is known.
async function checkOutcome(submission, headers) {
  const checkAgain = document.getElementById("checkAgainBtn");
  const startAgainButton = document.getElementById("startAgainBtn");
  checkAgain.style.display = "none";
  checkAgain.onclick = null;
  startAgainButton.style.display = "none";
  const result = document.getElementById("filingResult");
  let outcome;
  try {
    outcome = await pollUntilSettled(submission, headers);
  } catch (error) {
    // The gateway took the submission, so a failed status check leaves its outcome unknown, not failed.
    console.error("Companies House accounts status check failed:", error);
    result.replaceChildren(
      paragraphWithValues(window.companiesHouseGatewayPoll.checkFailedNote(submission.submissionNumber, error.message), {}),
    );
    result.className = "outcome";
    offerNextStep(submission, () => checkOutcome(submission, headers));
    return;
  }
  if (!window.companiesHouseGatewayPoll.isSettled(outcome)) {
    const note = document.createElement("p");
    note.textContent = window.companiesHouseGatewayPoll.pendingNote(submission);
    result.replaceChildren(note);
    result.className = "outcome";
    offerNextStep(submission, () => checkOutcome(submission, headers));
    return;
  }
  const notReceived = window.companiesHouseRejections.notReceivedHeadline(outcome);
  result.replaceChildren(
    notReceived
      ? paragraphWithValues(`${notReceived.title} ${notReceived.detail}`, {})
      : paragraphWithValues(
          ...window.companiesHouseGatewayPoll.statusSentence(
            window.siteText("ch.small.outcome", "Submission {number} was {status}."),
            outcome.submissionNumber,
            outcome.statusCode,
          ),
        ),
  );
  const revisionHeadline = revision && !notReceived ? revisionOutcomeHeadline(outcome.statusCode) : null;
  if (revisionHeadline) result.prepend(paragraphWithValues(revisionHeadline, {}));
  result.className = outcome.statusCode === "ACCEPT" ? "outcome outcome--ok" : "outcome outcome--error";
  renderRejections(outcome.rejections);
  showFilingCopyLink(outcome);
  startAgainButton.style.display = "inline-block";
}

// The reader's language choice goes with a filing, so the receipt email of an accepted filing is in it.
function languageHeaders() {
  return window.siteLanguage && window.siteLanguage.current() === "cy" ? { "X-Site-Language": "cy" } : {};
}

async function handleSubmitFiling() {
  const companyAuthCodeInput = document.getElementById("companyAuthCode");
  const companyAuthCode = companyAuthCodeInput.value.trim();
  if (companyAuthCode.length < 6 || companyAuthCode.length > 8) {
    window.formErrors.showFormErrors([
      {
        input: companyAuthCodeInput,
        message: window.siteText("ch.accounts.enter-auth-code", "Enter the 6 to 8 character company authentication code"),
        passes: () => companyAuthCodeInput.value.trim().length >= 6 && companyAuthCodeInput.value.trim().length <= 8,
      },
    ]);
    return;
  }
  window.formErrors.clearFormErrors();

  showLoading();
  hideStatus();
  const accountsFailure = await import("../lib/accounts-filing-failure.js");
  accountsFailure.clearAccountsFailure(document);
  try {
    const filedAccounts = buildAccountsPayload();
    const accounts = { ...filedAccounts, companyAuthCode };
    const govTestScenario = document.getElementById("govTestScenario").value.trim();
    const govTestScenarioHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    window.narrateStage(window.siteText("ct.narrate-sending-accounts", "Sending the accounts to Companies House..."));
    const submission = await window.submitMicroEntityAccounts(accounts, { ...govTestScenarioHeaders, ...languageHeaders() });
    document
      .getElementById("filingResult")
      .replaceChildren(
        paragraphWithValues(
          window.siteText(
            "ch.accounts.gateway-accepted",
            "Submission {number} accepted by the gateway at {time}. Waiting for Companies House...",
          ),
          { number: submission.submissionNumber, time: submission.gatewayTimestamp },
        ),
      );
    showView("resultView");

    await checkOutcome(submission, govTestScenarioHeaders);
  } catch (error) {
    console.error("Companies House accounts filing failed:", error);
    const tokensExhausted = error.status === 403 && error.reason === "tokens_exhausted";
    // The request layer already showed its own refusal; the page's message replaces it.
    if (tokensExhausted) hideStatus();
    const { registerRefusalOfError } = await import("../lib/accounts-revision-register.js");
    showStatus(
      registerRefusalOfError(error) || window.siteText("ch.accounts.file-failed", "Failed to file the accounts with Companies House."),
      "error",
    );
    accountsFailure.showAccountsFailure(document, error, accountsFailure.ACCOUNTS_FAILURE_STAGES.filing);
    if (tokensExhausted) {
      window.dispatchEvent(new CustomEvent("bundle-changed"));
      document.getElementById("statusMessagesContainer").scrollIntoView({ block: "start" });
    }
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
  endRevision();
  company = null;
  document.getElementById("companyForm").reset();
  document.getElementById("accountsForm").reset();
  toggleSections();
  document.getElementById("rejections").style.display = "none";
  document.getElementById("checkAgainBtn").style.display = "none";
  document.getElementById("startAgainBtn").style.display = "none";
  hideStatus();
  showView("companyView");
}

document.getElementById("directorsReportConsistent").value = window.siteText("ch.accounts.not-applicable", "Not applicable");
document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("accountsForm").addEventListener("submit", handleAccountsFormSubmit);
document.getElementById("accountsForm").addEventListener("input", renderTotals);
document.getElementById("includeComparatives").addEventListener("change", toggleSections);
document.getElementById("periodStart").addEventListener("input", toggleSections);
document.getElementById("includeFixedAssetNote").addEventListener("change", toggleSections);
document.getElementById("includeIntangibleAssetNote").addEventListener("change", toggleSections);
document.getElementById("includeShareCapitalNote").addEventListener("change", toggleSections);
document.getElementById("addDirectorsAdvance").addEventListener("click", addDirectorsAdvanceRow);
document.getElementById("includeAccountantsReport").addEventListener("change", toggleSections);
document.querySelectorAll('input[name="controllingParty"]').forEach((radio) => radio.addEventListener("change", toggleSections));
document.querySelectorAll('input[name="profitAndLossFormat"]').forEach((radio) => radio.addEventListener("change", toggleSections));
document.getElementById("backToFormBtn").addEventListener("click", () => showView("formView"));
document.getElementById("submitFilingBtn").addEventListener("click", handleSubmitFiling);
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
document.getElementById("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});

applyProfitAndLossFormat();
window.booksImport.mount(document.getElementById("booksImport"), { kind: "small-company-accounts" });

// The request, the checks and the result of a revision of accounts already filed. ?amend=<receipt name>
// opens the form from the receipt of the accepted filing.
function revisionElements() {
  return {
    section: document.getElementById("revisionSection"),
    originalDate: document.getElementById("revisionOriginalDate"),
    nonCompliance: document.getElementById("revisionNonCompliance"),
    amendments: document.getElementById("revisionAmendments"),
  };
}

function revisionOutcomeHeadline(statusCode) {
  if (statusCode === "ACCEPT") return window.siteText("ch.revision.accepted", "Companies House accepted the revised accounts.");
  if (statusCode === "REJECT") return window.siteText("ch.revision.rejected", "Companies House rejected the revised accounts.");
  return null;
}

// A refusal reads as one failure: its sentence and the next step it names, as a link.
function refuseRevision(text, next) {
  window.showFailure(
    { failure: { cause: text, next } },
    window.siteText("ch.revision.refused-title", "These accounts cannot be revised here"),
  );
  showView("companyView");
}

function showRevisionLateNote() {
  const dateApproved = document.getElementById("directorDateApproved").value;
  document.getElementById("revisionLateNote").hidden = !(revision && revision.module.isPastDeliveryDays(dateApproved, new Date()));
}

// The preview's warning of empty prior-year profit and loss lines goes once one of them is typed.
let priorYearWarningShown = false;
document.getElementById("accountsForm").addEventListener("input", () => {
  if (priorYearWarningShown && !revisingFilletedAsFullWithoutPriorYear()) {
    priorYearWarningShown = false;
    hideStatus();
  }
});

// A filleted original revised as a full copy, with prior-year balance sheet figures filed and no prior-year
// profit and loss line typed (a box still holding the page's starting value counts as empty): the tax
// line fills from the filed tax note, so it does not count.
function revisingFilletedAsFullWithoutPriorYear() {
  if (!revision?.source.mapped.filleted || document.getElementById("copyFilleted").checked) return false;
  if (Object.keys(revision.source.mapped.balanceSheet.priorYear).length === 0) return false;
  return PROFIT_AND_LOSS_INPUT_FIELDS[profitAndLossFormat()]
    .filter((field) => field !== "tax")
    .map((field) => document.getElementById(`prior${field[0].toUpperCase()}${field.slice(1)}`))
    .every((box) => box.value.trim() === "" || box.value === box.defaultValue);
}

// Shows each problem with the revision beside its field; answers true when there is one.
function reportRevisionProblems() {
  return revision.module.showRevisionProblems(revisionElements(), document.getElementById("directorDateApproved"));
}

async function startRevision(receiptName) {
  showLoading();
  hideStatus();
  try {
    const module = await import("../lib/accounts-revision.js");
    const statusLine = document.querySelector("[data-feature-status]");
    // A revision not offered here leaves the page's own status line, which states where an original files.
    if (!(await module.isRevisionOfferedHere())) {
      statusLine.hidden = false;
      refuseRevision(
        window.siteText("ch.revision.not-offered", "Revised accounts cannot be filed here yet, so these accounts cannot be amended."),
        module.refusalNextStep("record", receiptName),
      );
      return;
    }
    const restoreStatus = await module.showRevisionStatus(statusLine);
    statusLine.hidden = false;
    const read = await module.readRevisionSource(receiptName, {
      fetchReceipt: (name) => window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(name)}`, {}),
      loadBundle: window.booksImport.loadBundle,
    });
    if (read.refusal) {
      refuseRevision(read.refusal, module.refusalNextStep(read.next, receiptName));
      return;
    }
    if (read.source.regime !== "small") {
      refuseRevision(
        window.siteText("ch.revision.not-small", "Those are micro-entity accounts, so they are revised on the micro-entity accounts page."),
        module.refusalNextStep("micro", receiptName),
      );
      return;
    }
    const profile = await window.getCompanyProfile(read.source.companyNumber);
    const { companyFromProfile } = await import("../lib/first-accounts.js");
    company = companyFromProfile(profile);
    window.accountsFormSections.fillFiledRegisteredOffice(read.source.registeredOffice, profile.registeredOffice);
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    showDocumentLanguageChoice(profile.jurisdiction);
    window.booksImport.fillSmallCompanyFormFromMapped(read.source.mapped);
    module.fillCarriedOver(read.source);
    toggleSections();
    renderTotals();
    revision = { module, source: read.source, restoreStatus };
    module.showRevisionSection(revisionElements(), read.source);
    import("../lib/revision-downloads.js")
      .then((downloads) => downloads.fillRevisionDownloads(read.source, { loadBundle: window.booksImport.loadBundle }))
      .catch((error) => console.error("Failed to offer the accounts being amended as a DIYA-GL book:", error));
    document.getElementById("revisionCopyNote").hidden = false;
    document.getElementById("revisionCopyFull").hidden = read.source.mapped.filleted;
    document.getElementById("revisionCopyFilleted").hidden = !read.source.mapped.filleted;
    document.getElementById("revisionBanner").hidden = false;
    document.getElementById("changeCompanyLine").hidden = true;
    showRevisionLateNote();
    showView("formView");
  } catch (error) {
    console.error("Failed to open the accounts to revise:", error);
    refuseRevision(
      window.siteText("ch.revision.load-failed", "We could not open those accounts to revise. Open the filing again from your receipts."),
      { label: window.siteText("ch.revision.next-receipts", "Back to your receipts"), href: "../hmrc/receipt/receipts.html" },
    );
  } finally {
    hideLoading();
  }
}

function endRevision() {
  if (!revision) return;
  revision.module.hideRevisionSection(revisionElements());
  revision.restoreStatus();
  revision = null;
  document.getElementById("revisionBanner").hidden = true;
  document.getElementById("revisionLateNote").hidden = true;
  document.getElementById("revisionCopyNote").hidden = true;
  document.getElementById("revisionAccountantsNote").hidden = true;
  document.getElementById("changeCompanyLine").hidden = false;
}

document.getElementById("directorDateApproved").addEventListener("input", showRevisionLateNote);

if (amendReceiptName && window.__submitReady__) {
  startRevision(amendReceiptName);
} else if (amendReceiptName) {
  document.addEventListener("submit-ready", () => startRevision(amendReceiptName), { once: true });
}
