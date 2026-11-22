// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// File micro-entity accounts: companyView -> formView -> previewView -> resultView. No
// Companies House OAuth token: the filing goes through the XML Gateway with the operator's
// presenter credentials, so only the Cognito id token is needed to reach the API.

const amendReceiptName = new URLSearchParams(window.location.search).get("amend");
// The status line ships hidden: an original shows the page's own status, and an amend address
// shows the revised accounts activity's status once startRevision has set it.
if (!amendReceiptName) document.querySelector("[data-feature-status]").hidden = false;

const BALANCE_SHEET_FIELDS = [
  "fixedAssets",
  "currentAssets",
  "creditorsWithinOneYear",
  "creditorsAfterOneYear",
  "calledUpShareCapital",
  "profitAndLossAccount",
  "capitalAndReserves",
];

// Statutory headings left blank unless the company has the figure.
const OPTIONAL_BALANCE_SHEET_FIELDS = [
  "calledUpShareCapitalNotPaid",
  "prepaymentsAccruedIncome",
  "provisionsForLiabilities",
  "accrualsDeferredIncome",
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

function readYear(prefix) {
  const year = {};
  BALANCE_SHEET_FIELDS.forEach((field) => {
    const inputId = prefix + field.charAt(0).toUpperCase() + field.slice(1);
    year[field] = window.parseMoneyInput(document.getElementById(inputId).value, { wholePounds: true }) ?? 0;
  });
  OPTIONAL_BALANCE_SHEET_FIELDS.forEach((field) => {
    const inputId = prefix + field.charAt(0).toUpperCase() + field.slice(1);
    const value = window.parseMoneyInput(document.getElementById(inputId).value, { wholePounds: true });
    if (value !== null && value !== undefined) year[field] = value;
  });
  return year;
}

function netAssetsOf(year) {
  const netCurrentAssets = year.currentAssets + (year.prepaymentsAccruedIncome ?? 0) - year.creditorsWithinOneYear;
  const totalAssetsLessCurrentLiabilities = (year.calledUpShareCapitalNotPaid ?? 0) + year.fixedAssets + netCurrentAssets;
  return (
    totalAssetsLessCurrentLiabilities -
    year.creditorsAfterOneYear -
    (year.provisionsForLiabilities ?? 0) -
    (year.accrualsDeferredIncome ?? 0)
  );
}

// Each render awaits the formatter's import, so only the latest one writes the line: an earlier
// render that resolves later holds figures the form no longer shows.
let latestYearTotals = 0;

// Micro-entity accounts show the prior year unless they are the company's first, which the
// company's profile and the period start show. The prior year column follows that rule, and the
// line above the balance sheet says which it is.
let firstAccountsRule = null;
import("../lib/first-accounts.js").then((module) => {
  firstAccountsRule = module;
  applyFirstAccountsRule();
});

function isFirstAccounts() {
  return Boolean(firstAccountsRule?.isFirstAccountsPeriod?.(company ?? {}, document.getElementById("periodStart").value));
}

function applyFirstAccountsRule() {
  if (!firstAccountsRule?.isFirstAccountsPeriod) return;
  const first = isFirstAccounts();
  document.getElementById("balanceSheetLedger").classList.toggle("ledger--one-year", first);
  document.querySelectorAll("#balanceSheetLedger .ledger__prior input").forEach((input) => {
    input.disabled = first;
  });
  document.getElementById("firstAccountsLine").textContent = first
    ? window.siteText(
        "ch.micro.first-accounts",
        "These are the company's first accounts: the period starts on the day it was incorporated, {date}, so there is no prior year.",
        { date: window.HmrcDisplayFormat.dateText(new Date(`${company.dateOfCreation}T00:00:00Z`), { utc: true }) },
      )
    : window.siteText(
        "ch.micro.not-first-accounts",
        "These are not the company's first accounts, so the balance sheet shows the prior year beside this year.",
      );
  refreshYearTotals();
}

// The company, with the facts of its profile that say whether a period is its first.
function companyFromProfile(profile) {
  return {
    companyNumber: profile.companyNumber,
    companyName: profile.companyName,
    dateOfCreation: profile.dateOfCreation,
    accountsLastPeriodEnd: profile.accountsLastPeriodEnd,
  };
}

async function renderOneYearTotals(current) {
  const render = ++latestYearTotals;
  const { formatPounds } = await import("../lib/balance-sheet-check.js");
  if (render !== latestYearTotals) return;
  const currentNetAssets = netAssetsOf(current);
  const verdict =
    currentNetAssets === current.capitalAndReserves
      ? window.siteText("ch.micro.matches", "Matches capital and reserves.")
      : window.siteText("ch.micro.mismatch", "Does not match capital and reserves for {years} - correct this before previewing.", {
          years: window.siteText("ch.micro.mismatch-this-year", "this year (capital and reserves {amount})", {
            amount: formatPounds(current.capitalAndReserves),
          }),
        });
  document.getElementById("yearTotals").textContent = window.siteText(
    "ch.micro.net-assets-one-year",
    "Net assets: {current} this year. {verdict}",
    {
      current: formatPounds(currentNetAssets),
      verdict,
    },
  );
}

async function renderYearTotals(current, prior) {
  const render = ++latestYearTotals;
  const { formatPounds } = await import("../lib/balance-sheet-check.js");
  if (render !== latestYearTotals) return;
  const currentNetAssets = netAssetsOf(current);
  const priorNetAssets = netAssetsOf(prior);
  const mismatches = [];
  if (currentNetAssets !== current.capitalAndReserves)
    mismatches.push(
      window.siteText("ch.micro.mismatch-this-year", "this year (capital and reserves {amount})", {
        amount: formatPounds(current.capitalAndReserves),
      }),
    );
  if (priorNetAssets !== prior.capitalAndReserves)
    mismatches.push(
      window.siteText("ch.micro.mismatch-last-year", "last year (capital and reserves {amount})", {
        amount: formatPounds(prior.capitalAndReserves),
      }),
    );
  const verdict = mismatches.length
    ? window.siteText("ch.micro.mismatch", "Does not match capital and reserves for {years} - correct this before previewing.", {
        years: mismatches.join("; "),
      })
    : window.siteText("ch.micro.matches", "Matches capital and reserves.");
  document.getElementById("yearTotals").textContent = window.siteText(
    "ch.micro.net-assets",
    "Net assets: {current} this year, {prior} last year. {verdict}",
    {
      current: formatPounds(currentNetAssets),
      prior: formatPounds(priorNetAssets),
      verdict,
    },
  );
}

function refreshYearTotals() {
  if (isFirstAccounts()) renderOneYearTotals(readYear("current"));
  else renderYearTotals(readYear("current"), readYear("prior"));
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);

  showLoading();
  hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = companyFromProfile(profile);
    applyFirstAccountsRule();
    window.accountsFormSections.fillRegisteredOffice(profile.registeredOffice);
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    showDocumentLanguageChoice(profile.jurisdiction);
    showView("formView");
    window.priorYearFill.fill(company.companyNumber, "micro", profile);
  } catch (error) {
    console.error("Failed to look up the company:", error);
    showStatus(error.message || window.siteText("ch.accounts.lookup-failed", "Failed to look up the company."), "error");
  } finally {
    hideLoading();
  }
}

const SECTION_477_STATEMENT_TEXT = document.getElementById("statementSection477ExemptionLabel").textContent.trim();
const SECTION_480_STATEMENT_TEXT = window.siteText(
  "ch.micro.section-480",
  "The company is entitled to exemption from audit under section 480 of the Companies Act 2006 relating to dormant companies.",
);

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

// The advance to the director approving the accounts, when any of its boxes holds something.
function readDirectorsAdvances() {
  const terms = document.getElementById("directorsAdvanceTerms").value.trim();
  const boxes = ["directorsAdvanceAtStart", "directorsAdvanceMade", "directorsAdvanceRepaid", "directorsAdvanceAtEnd"];
  if (!terms && boxes.every((id) => document.getElementById(id).value.trim() === "")) return undefined;
  const [balanceAtStart, advanced, repaid, balanceAtEnd] = boxes.map(
    (id) => window.parseMoneyInput(document.getElementById(id).value, { wholePounds: true }) ?? 0,
  );
  return [{ name: document.getElementById("directorName").value.trim(), terms, balanceAtStart, advanced, repaid, balanceAtEnd }];
}

// The first thing wrong with the advance to the director, by the rules the accounts route applies,
// as the sentence the page shows; null when nothing is.
async function notesProblem() {
  const advances = readDirectorsAdvances();
  if (!advances) return null;
  const check = await import("../lib/accounts-notes-check.js");
  const findings = check.directorsAdvancesFindings(advances, { signerName: document.getElementById("directorName").value.trim() });
  return findings.length ? check.noteFindingSentence(findings[0]) : null;
}

function buildAccountsPayload() {
  const registeredOffice = window.accountsFormSections.readRegisteredOffice();
  const directorsAdvances = readDirectorsAdvances();
  const accountantsReport = window.accountsFormSections.readAccountantsReport();
  return {
    ...dormantPayload(),
    ...documentLanguagePayload(),
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    ...(registeredOffice ? { registeredOffice } : {}),
    ...(accountantsReport ? { accountantsReport } : {}),
    periodStart: document.getElementById("periodStart").value,
    periodEnd: document.getElementById("periodEnd").value,
    ...(isFirstAccounts() ? { dateOfIncorporation: company.dateOfCreation } : {}),
    balanceSheet: {
      currentYear: readYear("current"),
      ...(isFirstAccounts() ? {} : { priorYear: readYear("prior") }),
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
    ...(directorsAdvances ? { directorsAdvances } : {}),
    ...(revision ? { revision: revision.module.revisionRequest(revisionElements(), revision.source) } : {}),
  };
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
  statementMicroEntityProvisions: window.siteText("ch.micro.confirm-provisions", "Confirm the accounts follow the micro-entity provisions"),
};

// Capital and reserves equal called up share capital plus the profit and loss account in each year,
// the rule the accounts route also applies.
async function capitalAndReservesProblem(currentYear, priorYear) {
  const check = await import("../lib/balance-sheet-check.js");
  const years = [
    [window.siteText("ch.micro.the-current-year", "the current year"), currentYear],
    ...(priorYear ? [[window.siteText("ch.micro.the-prior-year", "the prior year"), priorYear]] : []),
  ];
  for (const [yearName, year] of years) {
    const mismatch = check.capitalAndReservesMismatch(year);
    if (mismatch) {
      return check.capitalAndReservesMessage(
        mismatch,
        yearName,
        window.siteText(
          "ch.micro.capital-and-reserves-mismatch",
          "Capital and reserves of {capital} for {year} do not equal called up share capital plus the profit and loss account, which add up to {sum}.",
        ),
      );
    }
  }
  return null;
}

async function handleAccountsFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!window.formErrors.requireFormFields(form)) return;
  if (window.formErrors.reportMoneyProblems(form)) return;
  if (revision && reportRevisionProblems()) return;
  const approvalDateCheck = await import("../lib/approval-date-check.js");
  if (approvalDateCheck.showApprovalDateAfterToday(document.getElementById("directorDateApproved"), new Date())) return;
  const currentYear = readYear("current");
  const priorYear = isFirstAccounts() ? null : readYear("prior");
  if (
    netAssetsOf(currentYear) !== currentYear.capitalAndReserves ||
    (priorYear && netAssetsOf(priorYear) !== priorYear.capitalAndReserves)
  ) {
    showStatus(
      priorYear
        ? window.siteText("ch.micro.must-equal", "Capital and reserves must equal net assets for both years before previewing.")
        : window.siteText("ch.micro.must-equal-one-year", "Capital and reserves must equal net assets before previewing."),
      "error",
    );
    return;
  }
  const capitalProblem = (await capitalAndReservesProblem(currentYear, priorYear)) || (await notesProblem());
  if (capitalProblem) {
    showStatus(capitalProblem, "error");
    return;
  }
  if (!window.formErrors.requireChecked(STATEMENT_MESSAGES)) return;

  showLoading();
  hideStatus();
  try {
    const accounts = buildAccountsPayload();
    const preview = await window.renderMicroEntityAccounts(accounts);
    document.getElementById("previewIxbrl").textContent = preview.ixbrl;
    document.getElementById("previewRendered").srcdoc = window.accountsFormSections.documentForFrame(preview.ixbrl);
    showView("previewView");
    document.getElementById("previewView").scrollIntoView();
  } catch (error) {
    console.error("Failed to render the accounts preview:", error);
    showStatus(error.message || window.siteText("ch.accounts.preview-failed", "Failed to render the accounts preview."), "error");
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
  container.className = "outcome outcome--error";
  container.replaceChildren(
    ...rejections.map((entry) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = window.companiesHouseRejections.rejectionText(entry);
      return paragraph;
    }),
  );
}

// tone is "ok" for an accepted filing, "error" for one that was not filed, or empty while it is open.
function showFilingResult(headline, detail, tone = "") {
  const container = document.getElementById("filingResult");
  container.className = tone ? `outcome outcome--${tone}` : "outcome";
  const headlineParagraph = document.createElement("p");
  headlineParagraph.className = "outcome__title";
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

function pollUntilSettled(submission, extraHeaders) {
  const { submissionNumber } = submission;
  return window.companiesHouseGatewayPoll.pollGatewayUntilSettled({
    submissionNumber,
    pollIntervalSeconds: submission.pollInterval,
    poll: () => window.pollMicroEntityAccounts(submissionNumber, extraHeaders),
    onPending: (result) =>
      showFilingResult(
        window.companiesHouseGatewayPoll.statusText(
          window.siteText("ch.accounts.checking", "Submission {number} is {status}. Checking again..."),
          submissionNumber,
          result.statusCode,
        ),
      ),
  });
}

// Polls for the outcome and shows it. Pending after the last poll, the page says so and offers Check again.
async function checkOutcome(submission, headers) {
  const checkAgain = document.getElementById("checkAgainBtn");
  checkAgain.style.display = "none";
  checkAgain.onclick = null;
  try {
    const outcome = await pollUntilSettled(submission, headers);
    const outcomeHeadlines = revision
      ? {
          ACCEPT: window.siteText("ch.revision.accepted", "Companies House accepted the revised accounts."),
          REJECT: window.siteText("ch.revision.rejected", "Companies House rejected the revised accounts."),
        }
      : {
          ACCEPT: window.siteText("ch.accounts.accepted", "Companies House accepted the accounts."),
          REJECT: window.siteText("ch.accounts.rejected", "Companies House rejected the accounts."),
        };
    const settled = window.companiesHouseGatewayPoll.isSettled(outcome);
    const notReceived = window.companiesHouseRejections.notReceivedHeadline(outcome);
    showFilingResult(
      notReceived?.title ||
        outcomeHeadlines[outcome.statusCode] ||
        window.siteText("ch.accounts.not-finished", "Companies House has the accounts and has not finished checking them."),
      notReceived?.detail ||
        (settled
          ? window.companiesHouseGatewayPoll.statusText(
              window.siteText("ch.accounts.status-line", "Status: {status}. Submission number {number}."),
              outcome.submissionNumber,
              outcome.statusCode,
            )
          : window.companiesHouseGatewayPoll.pendingNote(submission)),
      { ACCEPT: "ok", REJECT: "error" }[outcome.statusCode] || "",
    );
    renderRejections(outcome.rejections);
    showFilingCopyLink(outcome);
    if (!settled && window.companiesHouseGatewayPoll.mayCheckAgain(submission)) {
      checkAgain.onclick = () => checkOutcome(submission, headers);
      checkAgain.style.display = "inline-block";
    }
  } catch (error) {
    console.error("Companies House accounts status check failed:", error);
    showFilingResult(
      window.siteText("ch.accounts.not-confirmed", "Your accounts were submitted. Companies House has not confirmed the outcome yet."),
      window.siteText("ch.accounts.check-failed", "Submission number {number}. The status check failed: {message}.", {
        number: submission.submissionNumber,
        message: error.message || window.siteText("ch.accounts.unknown-error", "unknown error"),
      }),
    );
  }
}

function syncOwnPresenterFields() {
  document.getElementById("ownPresenterFields").hidden = !document.getElementById("useOwnPresenter").checked;
}

// The customer's own presenter, held in this call only: {id, code}, null when the option is off,
// or {problems} when it is on and a part is blank.
function readOwnPresenterInputs() {
  if (!document.getElementById("useOwnPresenter").checked) return { presenter: null };
  const idInput = document.getElementById("ownPresenterId");
  const codeInput = document.getElementById("ownPresenterCode");
  const id = idInput.value.trim();
  const code = codeInput.value.trim();
  const problems = [];
  if (!id)
    problems.push({
      input: idInput,
      message: window.siteText("ch.accounts.enter-presenter-id", "Enter your presenter id"),
      passes: () => idInput.value.trim() !== "",
    });
  if (!code)
    problems.push({
      input: codeInput,
      message: window.siteText("ch.accounts.enter-presenter-code", "Enter your presenter authentication code"),
      passes: () => codeInput.value.trim() !== "",
    });
  return problems.length > 0 ? { problems } : { presenter: { id, code } };
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
  const ownPresenterInputs = readOwnPresenterInputs();
  if (ownPresenterInputs.problems) {
    window.formErrors.showFormErrors(ownPresenterInputs.problems);
    return;
  }
  const ownPresenter = ownPresenterInputs.presenter;
  window.formErrors.clearFormErrors();

  showLoading();
  hideStatus();
  let submission;
  let govTestScenarioHeaders;
  try {
    const accounts = { ...buildAccountsPayload(), companyAuthCode, ...(ownPresenter ? { ownPresenter } : {}) };
    const govTestScenario = document.getElementById("govTestScenario").value.trim();
    govTestScenarioHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    submission = await window.submitMicroEntityAccounts(accounts, { ...govTestScenarioHeaders, ...languageHeaders() });
  } catch (error) {
    console.error("Companies House accounts filing failed:", error);
    const tokensExhausted = error.status === 403 && error.reason === "tokens_exhausted";
    // The request layer already showed its own refusal; the page's message replaces it.
    if (tokensExhausted) hideStatus();
    const { registerRefusalOfError } = await import("../lib/accounts-revision-register.js");
    showStatus(
      registerRefusalOfError(error) ||
        error.message ||
        window.siteText("ch.accounts.file-failed", "Failed to file the accounts with Companies House."),
      "error",
    );
    if (tokensExhausted) {
      window.dispatchEvent(new CustomEvent("bundle-changed"));
      document.getElementById("statusMessagesContainer").scrollIntoView({ block: "start" });
    }
    hideLoading();
    return;
  }

  showFilingResult(
    window.siteText(
      "ch.accounts.gateway-accepted",
      "Submission {number} accepted by the gateway at {time}. Waiting for Companies House...",
      {
        number: submission.submissionNumber,
        time: submission.gatewayTimestamp,
      },
    ),
  );
  showView("resultView");
  try {
    const presenterHeaders = ownPresenter ? { "X-Presenter-Id": ownPresenter.id, "X-Presenter-Code": ownPresenter.code } : {};
    await checkOutcome(submission, { ...govTestScenarioHeaders, ...presenterHeaders });
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
  endRevision();
  company = null;
  document.getElementById("companyForm").reset();
  document.getElementById("accountsForm").reset();
  document.getElementById("useOwnPresenter").checked = false;
  syncOwnPresenterFields();
  toggleDormantFields();
  window.accountsFormSections.showAccountantsReportFields();
  document.getElementById("rejections").style.display = "none";
  document.getElementById("startAgainBtn").style.display = "none";
  document.getElementById("checkAgainBtn").style.display = "none";
  hideStatus();
  showView("companyView");
}

document.getElementById("directorsReportConsistent").value = window.siteText("ch.accounts.not-applicable", "Not applicable");
document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("accountsForm").addEventListener("submit", handleAccountsFormSubmit);
document.getElementById("accountsForm").addEventListener("input", refreshYearTotals);
document.getElementById("periodStart").addEventListener("input", applyFirstAccountsRule);
document.getElementById("dormant").addEventListener("change", toggleDormantFields);
document.getElementById("includeAccountantsReport").addEventListener("change", window.accountsFormSections.showAccountantsReportFields);
document.getElementById("useOwnPresenter").addEventListener("change", syncOwnPresenterFields);
document.getElementById("backToFormBtn").addEventListener("click", () => showView("formView"));
document.getElementById("submitFilingBtn").addEventListener("click", handleSubmitFiling);
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
document.getElementById("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});

window.booksImport.mount(document.getElementById("booksImport"), { kind: "micro-entity-accounts" });

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
    const restoreStatus = await module.showRevisionStatus(statusLine);
    statusLine.hidden = false;
    if (!(await module.isRevisionOfferedHere())) {
      refuseRevision(
        window.siteText("ch.revision.not-offered", "Revised accounts cannot be filed here yet, so these accounts cannot be amended."),
        module.refusalNextStep("record", receiptName),
      );
      return;
    }
    const read = await module.readRevisionSource(receiptName, {
      fetchReceipt: (name) => window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(name)}`, {}),
      loadBundle: window.booksImport.loadBundle,
    });
    if (read.refusal) {
      refuseRevision(read.refusal, module.refusalNextStep(read.next, receiptName));
      return;
    }
    if (read.source.regime !== "micro") {
      refuseRevision(
        window.siteText(
          "ch.revision.not-micro",
          "Those are small company accounts, so they are revised on the small company accounts page.",
        ),
        module.refusalNextStep("small", receiptName),
      );
      return;
    }
    const profile = await window.getCompanyProfile(read.source.companyNumber);
    company = companyFromProfile(profile);
    window.accountsFormSections.fillFiledRegisteredOffice(read.source.registeredOffice, profile.registeredOffice);
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    showDocumentLanguageChoice(profile.jurisdiction);
    window.booksImport.fillMicroEntityFormFromMapped(read.source.mapped);
    module.fillCarriedOver(read.source);
    applyFirstAccountsRule();
    revision = { module, source: read.source, restoreStatus };
    module.showRevisionSection(revisionElements(), read.source);
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
  document.getElementById("revisionAccountantsNote").hidden = true;
  document.getElementById("changeCompanyLine").hidden = false;
}

document.getElementById("directorDateApproved").addEventListener("input", showRevisionLateNote);

if (amendReceiptName && window.__submitReady__) {
  startRevision(amendReceiptName);
} else if (amendReceiptName) {
  document.addEventListener("submit-ready", () => startRevision(amendReceiptName), { once: true });
}
