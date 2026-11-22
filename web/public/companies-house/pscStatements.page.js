// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Give or withdraw a PSC statement: companyView -> formView -> reviewView -> resultView. The reader
// chooses to give a statement (PSC08, filed as psc-statement-notification) or to say one on the
// register is no longer true (PSC09, filed as psc-statement-withdrawal), then the statement. A
// statement that a PSC failed to comply with a section 790E or 790EA notice names the PSC, chosen
// from the register; a withdrawn restrictions notice says how it ended.

const KINDS = { notify: "psc-statement-notification", withdraw: "psc-statement-withdrawal" };
const LINKED = "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS";
const RESTRICTIONS = "RESTRICTIONS_NOTICE_ISSUED_TO_PSC";
const NO_PSC = "NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL";
// The register's kinds of PSC a linked statement names, as the PSC route answers them.
const INDIVIDUAL = "individual-person-with-significant-control";
const NAMEABLE_KINDS = [INDIVIDUAL, "corporate-entity-person-with-significant-control", "legal-person-person-with-significant-control"];

let company = null;
let pscs = [];
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

const checkedValue = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || null;
const chosenAction = () => checkedValue("action");
const chosenStatement = () => {
  const action = chosenAction();
  return action ? checkedValue(action === "notify" ? "notifyStatement" : "withdrawStatement") : null;
};

function nameable(psc) {
  if (psc.ceasedOn || !NAMEABLE_KINDS.includes(psc.kind)) return false;
  return psc.kind === INDIVIDUAL ? Boolean(psc.nameElements?.surname) : Boolean(psc.name);
}

function kindText(kind) {
  return kind === INDIVIDUAL
    ? window.siteText("ch.psc-statements.kind-individual", "Individual")
    : window.siteText("ch.psc-statements.kind-entity", "Legal entity or other registrable person");
}

// A PSC as the page names it, told apart from another current PSC of the same name.
function pscLabel(psc) {
  return window.companiesHouseNamesakes.namedApartBefore(psc, pscs.filter(nameable), kindText(psc.kind));
}

function renderPscChoices() {
  const holder = document.getElementById("pscChoices");
  holder.replaceChildren();
  const current = pscs.filter(nameable);
  document.getElementById("noPscs").style.display = current.length === 0 ? "block" : "none";
  current.forEach((psc, index) => {
    const choice = document.createElement("div");
    choice.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "psc";
    input.id = `psc-${index}`;
    input.value = String(pscs.indexOf(psc));
    input.checked = current.length === 1;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = pscLabel(psc);
    choice.append(input, label);
    holder.appendChild(choice);
  });
}

// Show the statements for the chosen action, and the PSC and the reason where the statement needs them.
function showSections() {
  const action = chosenAction();
  const statement = chosenStatement();
  const show = (id, shown) => {
    document.getElementById(id).style.display = shown ? "block" : "none";
  };
  show("notifySection", action === "notify");
  show("withdrawSection", action === "withdraw");
  show("pscSection", statement === LINKED);
  show("reasonSection", action === "withdraw" && statement === RESTRICTIONS);
  show("notifyDateHint", action !== "withdraw");
  show("withdrawDateHint", action === "withdraw");
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  showLoading();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    const answer = await window.getPscs(companyNumber);
    company = { companyNumber, companyName: profile.companyName };
    pscs = answer.pscs || [];
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    renderPscChoices();
    showSections();
    showView("formView");
  } catch (error) {
    console.error("Could not read the company from Companies House:", error);
    showError(window.siteText("ch.psc-statements.lookup-failed", "Could not read this company from Companies House."));
  } finally {
    hideLoading();
  }
}

// The form's own fields for the PSC a linked statement names, as the filing route reads them.
function pscFields(psc) {
  if (psc.kind !== INDIVIDUAL) return { pscKind: psc.kind, name: psc.name };
  const parts = psc.nameElements;
  return {
    pscKind: psc.kind,
    title: parts.title,
    forename: parts.forename,
    otherForenames: parts.middleName,
    surname: parts.surname,
    dobMonth: psc.dateOfBirth?.month,
    dobYear: psc.dateOfBirth?.year,
  };
}

function chosenPsc() {
  const value = checkedValue("psc");
  return value === null ? null : pscs[Number(value)];
}

// The reason the form cannot go on, in the reader's words, or null.
function formProblem(action, statement) {
  if (!action)
    return window.siteText("ch.psc-statements.choose-action", "Choose whether you are giving a statement or saying one is no longer true.");
  if (!statement) return window.siteText("ch.psc-statements.choose-statement", "Choose the statement.");
  // A company that states it has no PSC has none on the register: one who has not ceased is told to
  // Companies House as ceased first.
  const current = pscs.filter((psc) => !psc.ceasedOn);
  if (action === "notify" && statement === NO_PSC && current.length > 0) {
    return window.siteText(
      "ch.psc-statements.no-psc-but-current",
      "The register shows a person with significant control who has not ceased: {names}. Tell Companies House they have ceased before you state that the company has none.",
      { names: current.map((psc) => psc.name).join("; ") },
    );
  }
  if (statement === LINKED && !chosenPsc()) {
    return window.siteText("ch.psc-statements.choose-psc", "Choose the person with significant control the notice was given to.");
  }
  if (action === "withdraw" && statement === RESTRICTIONS && !checkedValue("restrictionsReason")) {
    return window.siteText("ch.psc-statements.choose-reason", "Choose how the restrictions ended.");
  }
  return null;
}

function handleStatementSubmit(event) {
  event.preventDefault();
  const action = chosenAction();
  const statement = chosenStatement();
  const problem = formProblem(action, statement);
  if (problem) {
    showError(problem);
    return;
  }
  if (!window.formErrors.requireFields(["relevantDate", "companyAuthCode"])) return;
  const date = document.getElementById("relevantDate").value;
  if (date > window.companiesHouseLabels.todayInTheUnitedKingdom()) {
    showError(window.siteText("ch.psc-statements.date-after-today", "The relevant date cannot be after today."));
    return;
  }
  const psc = statement === LINKED ? chosenPsc() : null;
  filing = {
    action,
    psc,
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: document.getElementById("companyAuthCode").value.trim(),
      dateSigned: new Date().toISOString().slice(0, 10),
      statement,
      ...(psc ? pscFields(psc) : {}),
      ...(action === "notify" ? { relevantDate: date } : { withdrawalDate: date }),
      ...(action === "withdraw" && statement === RESTRICTIONS ? { restrictionsWithdrawalReason: checkedValue("restrictionsReason") } : {}),
    },
  };
  renderReview();
  showView("reviewView");
}

// A choice's label as the page shows it, in the page's language.
const labelOf = (id) => document.querySelector(`label[for="${id}"]`).textContent.trim();
const checkedLabel = (name) => labelOf(document.querySelector(`input[name="${name}"]:checked`).id);

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  const { form, action, psc } = filing;
  const rows = [
    [window.siteText("ch.psc-statements.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [
      labelOf("action-" + action).replace(/\s+/g, " "),
      checkedLabel(action === "notify" ? "notifyStatement" : "withdrawStatement").replace(/\s+/g, " "),
    ],
  ];
  if (psc) rows.push([window.siteText("ch.psc-statements.review-psc", "Person with significant control"), pscLabel(psc)]);
  if (form.restrictionsWithdrawalReason) {
    rows.push([
      window.siteText("ch.psc-statements.review-reason", "How the restrictions ended"),
      checkedLabel("restrictionsReason").replace(/\s+/g, " "),
    ]);
  }
  rows.push([window.siteText("ch.psc-statements.review-date", "Relevant date"), formatDate(form.relevantDate || form.withdrawalDate)]);
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  });
}

async function handleFile() {
  const scenario = document.getElementById("govTestScenario").value.trim();
  const headers = scenario ? { "Gov-Test-Scenario": scenario } : {};
  showView("resultView");
  showLoading();
  try {
    await window.companiesHouseFormPage.fileAndShowOutcome({
      kind: KINDS[filing.action],
      form: filing.form,
      result: document.getElementById("filingResult"),
      headers,
    });
  } finally {
    hideLoading();
  }
}

function startAgain() {
  company = null;
  pscs = [];
  filing = null;
  document.getElementById("statementForm").reset();
  showSections();
  document.getElementById("filingResult").replaceChildren();
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("statementForm").addEventListener("submit", handleStatementSubmit);
document.getElementById("statementForm").addEventListener("change", showSections);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
