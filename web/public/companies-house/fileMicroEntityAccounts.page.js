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

function renderYearTotals(current, prior) {
  const currentNetAssets = netAssetsOf(current);
  const priorNetAssets = netAssetsOf(prior);
  const mismatches = [];
  if (currentNetAssets !== current.capitalAndReserves)
    mismatches.push(
      window.siteText("ch.micro.mismatch-this-year", "this year (capital and reserves {amount})", { amount: current.capitalAndReserves }),
    );
  if (priorNetAssets !== prior.capitalAndReserves)
    mismatches.push(
      window.siteText("ch.micro.mismatch-last-year", "last year (capital and reserves {amount})", { amount: prior.capitalAndReserves }),
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
      current: currentNetAssets,
      prior: priorNetAssets,
      verdict,
    },
  );
}

function refreshYearTotals() {
  renderYearTotals(readYear("current"), readYear("prior"));
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);

  showLoading();
  hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber: profile.companyNumber, companyName: profile.companyName };
    window.accountsFormSections.fillRegisteredOffice(profile.registeredOffice);
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    showDocumentLanguageChoice(profile.jurisdiction);
    showView("formView");
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

function buildAccountsPayload() {
  const registeredOffice = window.accountsFormSections.readRegisteredOffice();
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

async function handleAccountsFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!window.formErrors.requireFormFields(form)) return;
  if (window.formErrors.reportMoneyProblems(form)) return;
  const currentYear = readYear("current");
  const priorYear = readYear("prior");
  if (netAssetsOf(currentYear) !== currentYear.capitalAndReserves || netAssetsOf(priorYear) !== priorYear.capitalAndReserves) {
    showStatus(
      window.siteText("ch.micro.must-equal", "Capital and reserves must equal net assets for both years before previewing."),
      "error",
    );
    return;
  }
  if (!window.formErrors.requireChecked(STATEMENT_MESSAGES)) return;

  showLoading();
  hideStatus();
  try {
    const accounts = buildAccountsPayload();
    const preview = await window.renderMicroEntityAccounts(accounts);
    document.getElementById("previewIxbrl").textContent = preview.ixbrl;
    document.getElementById("previewRendered").srcdoc = preview.ixbrl;
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

function showFilingResult(headline, detail) {
  const container = document.getElementById("filingResult");
  container.className = /rejected/.test(headline)
    ? "outcome outcome--error"
    : /accepted the accounts/.test(headline)
      ? "outcome outcome--ok"
      : "outcome";
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
        window.siteText("ch.accounts.checking", "Submission {number} is {status}. Checking again...", {
          number: submissionNumber,
          status: result.statusCode,
        }),
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
    const outcomeHeadlines = {
      ACCEPT: window.siteText("ch.accounts.accepted", "Companies House accepted the accounts."),
      REJECT: window.siteText("ch.accounts.rejected", "Companies House rejected the accounts."),
    };
    const settled = window.companiesHouseGatewayPoll.isSettled(outcome);
    showFilingResult(
      outcomeHeadlines[outcome.statusCode] ||
        window.siteText("ch.accounts.not-finished", "Companies House has the accounts and has not finished checking them."),
      settled
        ? window.siteText("ch.accounts.status-line", "Status: {status}. Submission number {number}.", {
            status: outcome.statusCode,
            number: outcome.submissionNumber,
          })
        : window.companiesHouseGatewayPoll.pendingNote(submission),
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
  if (!id) problems.push({ input: idInput, message: window.siteText("ch.accounts.enter-presenter-id", "Enter your presenter id") });
  if (!code)
    problems.push({
      input: codeInput,
      message: window.siteText("ch.accounts.enter-presenter-code", "Enter your presenter authentication code"),
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
    showStatus(error.message || window.siteText("ch.accounts.file-failed", "Failed to file the accounts with Companies House."), "error");
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

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("accountsForm").addEventListener("submit", handleAccountsFormSubmit);
document.getElementById("accountsForm").addEventListener("input", refreshYearTotals);
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
