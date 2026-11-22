// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Change the accounting reference date: companyView -> formView -> reviewView -> resultView. The
// form changes the company's current accounting period or the one before it, so the page reads both
// from the register and the reader chooses one and gives its new end date. A link from the company
// lookup names the period in ?currentPeriodEnd= and the page chooses it. After Companies House
// accepts the filing the page reads the profile again and shows the period the register now holds.

const FORM_KIND = "accounting-reference-date";
const ADMINISTRATION = "administration";
const SECRETARY_OF_STATE = "secretary-of-state-approval";

let company = null;
let periods = [];
let filing = null;

function showView(name) {
  // A message belongs to the view it was shown on: a refusal fixed on the form is not shown above the review.
  window.hideStatus?.();
  ["companyView", "formView", "reviewView", "resultView"].forEach((id) => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}

function showError(text) {
  // One refusal at a time: the answer just refused replaces the one refused before.
  window.hideStatus?.();
  if (window.showStatus) window.showStatus(text, "error");
}

const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);

function periodText(start, end) {
  return window.siteText("ch.ard.period", "{start} to {end}", { start: formatDate(start), end: formatDate(end) });
}

// Today's date in the United Kingdom, as YYYY-MM-DD.
function todayInTheUnitedKingdom() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

const isoOf = (date) => date.toISOString().slice(0, 10);

function dayAfter(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return isoOf(date);
}

// The end of the 12-month period after one that ends on periodEnd: the accounting reference date a
// year on, or the month's last day where the month has no such day.
function nextReferenceDate(periodEnd, accountingReferenceDate) {
  const [year, month, day] = periodEnd.split("-").map(Number);
  const refMonth = Number(accountingReferenceDate?.month) || month;
  const refDay = Number(accountingReferenceDate?.day) || day;
  const lastDay = new Date(Date.UTC(year + 1, refMonth, 0)).getUTCDate();
  return isoOf(new Date(Date.UTC(year + 1, refMonth - 1, Math.min(refDay, lastDay))));
}

function periodChoice(start, end, current) {
  return {
    start,
    end,
    label: current
      ? window.siteText("ch.ard.current-period", "{period} (the current period)", { period: periodText(start, end) })
      : window.siteText("ch.ard.previous-period", "{period} (the previous period)", { period: periodText(start, end) }),
  };
}

// The two periods the form can change, as AA01 defines them: the current period, which has not
// yet ended, and the immediately previous one. The register's next accounts are for the earliest
// period not yet filed: the current period while it runs, or, once it has ended, the previous one,
// with the current period after it to the next reference date. While the accounts are overdue no
// period can be changed.
function periodsOf(profile, today = todayInTheUnitedKingdom()) {
  const nextStart = profile.accountsNextPeriodStart;
  const nextEnd = profile.accountsNextPeriodEnd;
  if (!nextStart || !nextEnd) return [];
  if (profile.accountsNextDue && profile.accountsNextDue < today) return [];
  if (nextEnd >= today) {
    const found = [periodChoice(nextStart, nextEnd, true)];
    if (profile.accountsLastPeriodStart && profile.accountsLastPeriodEnd) {
      found.push(periodChoice(profile.accountsLastPeriodStart, profile.accountsLastPeriodEnd, false));
    }
    return found;
  }
  const currentStart = dayAfter(nextEnd);
  return [
    periodChoice(currentStart, nextReferenceDate(nextEnd, profile.accountingReferenceDate), true),
    periodChoice(nextStart, nextEnd, false),
  ];
}

const accountsOverdue = (profile, today = todayInTheUnitedKingdom()) => Boolean(profile.accountsNextDue && profile.accountsNextDue < today);

function renderPeriodChoices(chosenEnd) {
  const holder = document.getElementById("periodChoices");
  holder.replaceChildren();
  document.getElementById("noPeriods").style.display = periods.length === 0 ? "block" : "none";
  document.getElementById("continueBtn").disabled = periods.length === 0;
  periods.forEach((period, index) => {
    const choice = document.createElement("div");
    choice.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "period";
    input.id = `period-${index}`;
    input.value = String(index);
    input.checked = chosenEnd ? period.end === chosenEnd : index === 0;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = period.label;
    choice.append(input, label);
    holder.appendChild(choice);
  });
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  showLoading();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber, companyName: profile.companyName };
    periods = periodsOf(profile);
    document.getElementById("accountsOverdue").style.display = accountsOverdue(profile) ? "block" : "none";
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    renderPeriodChoices(new URLSearchParams(window.location.search).get("currentPeriodEnd"));
    if (accountsOverdue(profile)) document.getElementById("noPeriods").style.display = "none";
    showView("formView");
  } catch (error) {
    console.error("Could not read the company's accounting periods:", error);
    showError(window.siteText("ch.ard.lookup-failed", "Could not read this company's accounting periods from Companies House."));
  } finally {
    hideLoading();
  }
}

function chosenPeriod() {
  const chosen = document.querySelector('#periodChoices input[name="period"]:checked');
  return chosen ? periods[Number(chosen.value)] : null;
}

function updateExtensionGround() {
  const extendedBefore = document.getElementById("extendedBefore").checked;
  document.getElementById("extensionGroundGroup").style.display = extendedBefore ? "block" : "none";
  const reason = document.getElementById("fiveYearExtensionReason").value;
  document.getElementById("extensionAuthorisedCodeGroup").style.display =
    extendedBefore && reason === SECRETARY_OF_STATE ? "block" : "none";
}

function groundText(reason) {
  const option = document.querySelector(`#fiveYearExtensionReason option[value="${reason}"]`);
  return option ? option.textContent.trim().replace(/\s+/g, " ") : "";
}

async function handleChangeSubmit(event) {
  event.preventDefault();
  const period = chosenPeriod();
  if (!period) {
    showError(window.siteText("ch.ard.choose-period", "Choose the accounting period to change."));
    return;
  }
  if (!window.formErrors.requireFields(["newPeriodEnd", "companyAuthCode"])) return;
  const newPeriodEnd = document.getElementById("newPeriodEnd").value;
  if (newPeriodEnd === period.end) {
    showError(window.siteText("ch.ard.same-date", "The new end date is the date the period already ends on."));
    return;
  }
  if (newPeriodEnd <= period.start) {
    showError(window.siteText("ch.ard.before-start", "The new end date must be after the date the period starts."));
    return;
  }
  const extended = newPeriodEnd > period.end;
  const extendedBefore = document.getElementById("extendedBefore").checked;
  const reason = extendedBefore ? document.getElementById("fiveYearExtensionReason").value : "";
  if (extendedBefore && !extended) {
    showError(
      window.siteText(
        "ch.ard.ground-only-extended",
        "A shortened period needs no ground. Untick the box about extending in the last five years.",
      ),
    );
    return;
  }
  if (extendedBefore && !reason) {
    showError(window.siteText("ch.ard.choose-ground", "Choose why the company may extend again."));
    return;
  }
  const code = reason === SECRETARY_OF_STATE ? document.getElementById("extensionAuthorisedCode").value.trim() : "";
  if (code && code.length !== 4) {
    showError(window.siteText("ch.ard.code-length", "The approval code is 4 characters."));
    return;
  }
  const { longerThanEighteenMonths } = await import("../lib/accounting-reference-period.js");
  filing = {
    period,
    extended,
    reason,
    tooLong: extended && reason !== ADMINISTRATION && longerThanEighteenMonths(period.start, newPeriodEnd),
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: document.getElementById("companyAuthCode").value.trim(),
      dateSigned: new Date().toISOString().slice(0, 10),
      currentPeriodEnd: period.end,
      newPeriodEnd,
      ...(reason ? { fiveYearExtensionReason: reason } : {}),
      ...(code ? { extensionAuthorisedCode: code } : {}),
    },
  };
  renderReview();
  showView("reviewView");
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const rows = [
    [window.siteText("ch.ard.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.ard.review-period", "Accounting period to change"), periodText(filing.period.start, filing.period.end)],
    [
      window.siteText("ch.ard.review-change", "Change"),
      filing.extended
        ? window.siteText("ch.ard.extended-to", "Extended so as to end on {date}", { date: formatDate(filing.form.newPeriodEnd) })
        : window.siteText("ch.ard.shortened-to", "Shortened so as to end on {date}", { date: formatDate(filing.form.newPeriodEnd) }),
    ],
    [window.siteText("ch.ard.review-new-period", "The period after the change"), periodText(filing.period.start, filing.form.newPeriodEnd)],
  ];
  if (filing.reason) {
    rows.push([window.siteText("ch.ard.review-ground", "Ground for extending again within five years"), groundText(filing.reason)]);
  }
  if (filing.form.extensionAuthorisedCode) {
    rows.push([window.siteText("ch.ard.review-code", "Approval code"), filing.form.extensionAuthorisedCode]);
  }
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  });
  const warning = document.getElementById("tooLongWarning");
  warning.style.display = filing.tooLong ? "block" : "none";
  warning.textContent = filing.tooLong
    ? window.siteText(
        "ch.ard.too-long",
        "This makes the period longer than 18 months. Companies House says you cannot extend a period beyond 18 months unless the company is in administration, so expect it to reject this filing.",
      )
    : "";
}

// After an accepted change, the period the register holds now, read again from the profile.
async function showRegisterNow() {
  const note = document.getElementById("registerNow");
  const companyLink = document.createElement("a");
  companyLink.href = `companySearch.html?companyNumber=${encodeURIComponent(company.companyNumber)}`;
  companyLink.textContent = window.siteText("ch.ard.see-company", "See the company on the register");
  let text;
  try {
    const profile = await window.getCompanyProfile(company.companyNumber);
    const now = periodsOf(profile).find((period) => period.start === filing.period.start);
    text =
      now && now.end === filing.form.newPeriodEnd
        ? profile.accountsNextDue && profile.accountsNextPeriodEnd === now.end
          ? window.siteText(
              "ch.ard.register-now-due",
              "The register now shows the accounting period {period}, with its accounts due by {due}.",
              {
                period: periodText(now.start, now.end),
                due: formatDate(profile.accountsNextDue),
              },
            )
          : window.siteText("ch.ard.register-now", "The register now shows the accounting period {period}.", {
              period: periodText(now.start, now.end),
            })
        : window.siteText(
            "ch.ard.register-not-yet",
            "The register does not show the new date yet. Companies House sends no letter to confirm the change, so look at the company again later.",
          );
  } catch (error) {
    console.error("Could not read the company profile after the change:", error);
    text = window.siteText("ch.ard.register-unread", "Could not read the register again to show the new period.");
  }
  note.replaceChildren(text, " ", companyLink);
  note.style.display = "block";
}

async function handleFile() {
  const scenario = document.getElementById("govTestScenario").value.trim();
  const headers = scenario ? { "Gov-Test-Scenario": scenario } : {};
  document.getElementById("registerNow").style.display = "none";
  showView("resultView");
  showLoading();
  try {
    const outcome = await window.companiesHouseFormPage.fileAndShowOutcome({
      kind: FORM_KIND,
      form: filing.form,
      result: document.getElementById("filingResult"),
      headers,
    });
    if (outcome?.statusCode === "ACCEPT") await showRegisterNow();
  } finally {
    hideLoading();
  }
}

function startAgain() {
  company = null;
  periods = [];
  filing = null;
  document.getElementById("changeForm").reset();
  updateExtensionGround();
  document.getElementById("filingResult").replaceChildren();
  document.getElementById("registerNow").style.display = "none";
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("changeForm").addEventListener("submit", handleChangeSubmit);
document.getElementById("extendedBefore").addEventListener("change", updateExtensionGround);
document.getElementById("fiveYearExtensionReason").addEventListener("change", updateExtensionGround);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
