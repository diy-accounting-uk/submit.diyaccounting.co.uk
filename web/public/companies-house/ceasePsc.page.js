// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Tell Companies House a PSC has ceased: companyView -> formView -> reviewView -> resultView. The
// form names one of the company's current persons with significant control as the register shows
// them, so the page reads the register's list and the reader chooses; a link from the company
// lookup's PSC view names the PSC in ?pscName= and the page chooses it.

const FORM_KIND = "psc-cessation";
// The register's kinds of PSC this form names, as the PSC route answers them.
const INDIVIDUAL = "individual-person-with-significant-control";
const CESSATION_KINDS = [INDIVIDUAL, "corporate-entity-person-with-significant-control", "legal-person-person-with-significant-control"];

let company = null;
let pscs = [];
let filing = null;

function showView(name) {
  ["companyView", "formView", "reviewView", "resultView"].forEach((id) => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}

function showError(text) {
  if (window.showStatus) window.showStatus(text, "error");
}

// A current PSC this form can name: one the register lists as not ceased, of a kind the form has,
// with the particulars the form needs (an individual's surname, an entity's name).
function nameable(psc) {
  if (psc.ceasedOn || !CESSATION_KINDS.includes(psc.kind)) return false;
  return psc.kind === INDIVIDUAL ? Boolean(psc.nameElements?.surname) : Boolean(psc.name);
}

function kindText(kind) {
  return kind === INDIVIDUAL
    ? window.siteText("ch.cease.kind-individual", "Individual")
    : window.siteText("ch.cease.kind-entity", "Legal entity or other registrable person");
}

function renderPscChoices(chosenName) {
  const holder = document.getElementById("pscChoices");
  holder.replaceChildren();
  const current = pscs.filter(nameable);
  // A name the link gives chooses its PSC only when no other current PSC has that name.
  const named = current.filter((psc) => psc.name === chosenName);
  document.getElementById("noPscs").style.display = current.length === 0 ? "block" : "none";
  document.getElementById("continueBtn").disabled = current.length === 0;
  current.forEach((psc, index) => {
    const choice = document.createElement("div");
    choice.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "psc";
    input.id = `psc-${index}`;
    input.value = String(pscs.indexOf(psc));
    input.checked = chosenName ? named.length === 1 && named[0] === psc : current.length === 1;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = `${psc.name} (${kindText(psc.kind)})`;
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
    const answer = await window.getPscs(companyNumber);
    company = { companyNumber, companyName: profile.companyName };
    pscs = answer.pscs || [];
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    renderPscChoices(new URLSearchParams(window.location.search).get("pscName"));
    showView("formView");
  } catch (error) {
    console.error("Could not read the company's persons with significant control:", error);
    showError(
      window.siteText("ch.cease.lookup-failed", "Could not read this company's persons with significant control from Companies House."),
    );
  } finally {
    hideLoading();
  }
}

function chosenPsc() {
  const chosen = document.querySelector('#pscChoices input[name="psc"]:checked');
  return chosen ? pscs[Number(chosen.value)] : null;
}

// The form's own fields for one PSC, as the filing route reads them.
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

function handleCessationSubmit(event) {
  event.preventDefault();
  const psc = chosenPsc();
  if (!psc) {
    showError(window.siteText("ch.cease.choose-psc", "Choose the person with significant control who has ceased to be one."));
    return;
  }
  if (!window.formErrors.requireFields(["cessationDate", "confirmationDate", "companyAuthCode"])) return;
  const cessationDate = document.getElementById("cessationDate").value;
  const confirmationDate = document.getElementById("confirmationDate").value;
  if (confirmationDate < cessationDate) {
    showError(
      window.siteText("ch.cease.confirmation-before", "The date of confirmation cannot be before the date the person ceased to be a PSC."),
    );
    return;
  }
  filing = {
    psc,
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: document.getElementById("companyAuthCode").value.trim(),
      dateSigned: new Date().toISOString().slice(0, 10),
      ...pscFields(psc),
      cessationDate,
      confirmationDate,
    },
  };
  renderReview();
  showView("reviewView");
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  [
    [window.siteText("ch.cease.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.cease.review-psc", "Person with significant control"), `${filing.psc.name} (${kindText(filing.psc.kind)})`],
    [window.siteText("ch.cease.review-ceased", "Date ceased to be a PSC"), formatDate(filing.form.cessationDate)],
    [window.siteText("ch.cease.review-confirmed", "Date of confirmation"), formatDate(filing.form.confirmationDate)],
  ].forEach(([label, value]) => {
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
      kind: FORM_KIND,
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
  document.getElementById("cessationForm").reset();
  document.getElementById("filingResult").replaceChildren();
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("cessationForm").addEventListener("submit", handleCessationSubmit);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
