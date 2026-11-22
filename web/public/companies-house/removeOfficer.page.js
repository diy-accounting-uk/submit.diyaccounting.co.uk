// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Remove a director or secretary: companyView -> formView -> reviewView -> resultView. The form
// names one of the company's current directors or secretaries as the register shows them, so the
// page reads the register's officers and the reader chooses; a link from the company lookup's
// officers view names the officer in ?officerName=, with the role and the appointment date that tell
// two appointments of one name apart, and the page chooses it.
//
// The register answers a person's name as "SURNAME, Forenames" (with a title after a second comma,
// where it holds one) and a date of birth as month and year only. The form names a person by
// surname, forename and other forenames, and a director who is a person by the full date of birth,
// so the page splits the name for the reader to check and asks for the day of birth.

const FORM_KIND = "officer-resignation";

// The register's officer roles this form ends, as the officers route answers them: the appointment
// each is (director or secretary), and whether the officer is a company rather than a person.
const ROLES = {
  "director": { role: "director", corporate: false },
  "nominee-director": { role: "director", corporate: false },
  "corporate-director": { role: "director", corporate: true },
  "corporate-nominee-director": { role: "director", corporate: true },
  "secretary": { role: "secretary", corporate: false },
  "nominee-secretary": { role: "secretary", corporate: false },
  "corporate-secretary": { role: "secretary", corporate: true },
  "corporate-nominee-secretary": { role: "secretary", corporate: true },
};

let company = null;
let officers = [];
let filing = null;

function showView(name) {
  // A message belongs to the view it was shown on: a refusal fixed on the form is not shown above the review.
  window.hideStatus?.();
  ["companyView", "formView", "reviewView", "resultView"].forEach((id) => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}

function showError(text) {
  if (window.showStatus) window.showStatus(text, "error");
}

const removable = (officer) => !officer.resignedOn && Boolean(ROLES[officer.officerRole]) && Boolean(officer.name);

function roleText(officer) {
  const { role, corporate } = ROLES[officer.officerRole];
  if (role === "director") {
    return corporate
      ? window.siteText("ch.remove-officer.role-corporate-director", "Corporate director")
      : window.siteText("ch.remove-officer.role-director", "Director");
  }
  return corporate
    ? window.siteText("ch.remove-officer.role-corporate-secretary", "Corporate secretary")
    : window.siteText("ch.remove-officer.role-secretary", "Secretary");
}

/**
 * A person's name as the register answers it, "SURNAME, Forenames[, Title]", in the form's parts.
 * @param {string} name
 * @returns {{surname: string, forename: string, otherForenames: string, title: string}}
 */
function splitRegisterName(name) {
  const [surname = "", forenames = "", title = ""] = name.split(",").map((part) => part.trim());
  const [forename = "", ...others] = forenames.split(/\s+/).filter(Boolean);
  return { surname, forename, otherForenames: others.join(" "), title };
}

// Whether an officer is the one a link named: the name, and the role and appointment date where the
// link gives them, so a person who is both a director and the secretary is one or the other.
function namedBy(officer, named) {
  return (
    officer.name === named.name &&
    (!named.role || officer.officerRole === named.role) &&
    (!named.appointedOn || officer.appointedOn === named.appointedOn)
  );
}

function renderOfficerChoices(named) {
  const holder = document.getElementById("officerChoices");
  holder.replaceChildren();
  const current = officers.filter(removable);
  document.getElementById("noOfficers").style.display = current.length === 0 ? "block" : "none";
  document.getElementById("continueBtn").disabled = current.length === 0;
  current.forEach((officer, index) => {
    const choice = document.createElement("div");
    choice.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "officer";
    input.id = `officer-${index}`;
    input.value = String(officers.indexOf(officer));
    input.checked = named.name ? current.find((candidate) => namedBy(candidate, named)) === officer : current.length === 1;
    input.addEventListener("change", showOfficerFields);
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = `${officer.name} (${roleText(officer)})`;
    choice.append(input, label);
    holder.appendChild(choice);
  });
  showOfficerFields();
}

function chosenOfficer() {
  const chosen = document.querySelector('#officerChoices input[name="officer"]:checked');
  return chosen ? officers[Number(chosen.value)] : null;
}

// The chosen officer's fields, filled in from the register: a person's name parts, or a corporate
// officer's name; for a director who is a person, the month and year of birth the register shows.
function showOfficerFields() {
  const officer = chosenOfficer();
  const kind = officer ? ROLES[officer.officerRole] : null;
  const setValue = (id, value) => {
    document.getElementById(id).value = value ?? "";
  };
  document.getElementById("personFields").style.display = kind && !kind.corporate ? "block" : "none";
  document.getElementById("corporateFields").style.display = kind?.corporate ? "block" : "none";
  document.getElementById("dobFields").style.display = kind && !kind.corporate && kind.role === "director" ? "block" : "none";
  if (!kind) return;
  if (kind.corporate) {
    setValue("corporateName", officer.name);
    return;
  }
  const parts = splitRegisterName(officer.name);
  setValue("officerTitle", parts.title);
  setValue("officerForename", parts.forename);
  setValue("officerOtherForenames", parts.otherForenames);
  setValue("officerSurname", parts.surname);
  setValue("dobDay", "");
  setValue("dobMonth", officer.dateOfBirth?.month);
  setValue("dobYear", officer.dateOfBirth?.year);
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  showLoading();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    const answer = await window.getOfficers(companyNumber);
    company = { companyNumber, companyName: profile.companyName };
    officers = answer.officers || [];
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    const address = new URLSearchParams(window.location.search);
    renderOfficerChoices({ name: address.get("officerName"), role: address.get("officerRole"), appointedOn: address.get("appointedOn") });
    showView("formView");
  } catch (error) {
    console.error("Could not read the company's officers:", error);
    showError(
      window.siteText("ch.remove-officer.lookup-failed", "Could not read this company's directors and secretaries from Companies House."),
    );
  } finally {
    hideLoading();
  }
}

// The full date of birth from its three parts, as YYYY-MM-DD, or null when they are not a real date.
function dateOfBirthFromParts() {
  const day = Number(document.getElementById("dobDay").value.trim());
  const month = Number(document.getElementById("dobMonth").value.trim());
  const year = Number(document.getElementById("dobYear").value.trim());
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year) || year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

const fieldValue = (id) => document.getElementById(id).value.trim();

// Today's date in the United Kingdom, as YYYY-MM-DD.
const todayInTheUk = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

// The form's own fields for the chosen officer, as the filing route reads them, or null after
// showing what is wrong.
function officerFields(officer, resignationDate) {
  const { role, corporate } = ROLES[officer.officerRole];
  if (corporate) {
    if (!window.formErrors.requireFields(["corporateName"])) return null;
    return { officerRole: role, corporate: true, corporateName: fieldValue("corporateName") };
  }
  if (!window.formErrors.requireFields(["officerSurname"])) return null;
  const fields = {
    officerRole: role,
    corporate: false,
    title: fieldValue("officerTitle") || undefined,
    forename: fieldValue("officerForename") || undefined,
    otherForenames: fieldValue("officerOtherForenames") || undefined,
    surname: fieldValue("officerSurname"),
  };
  if (role !== "director") return fields;
  const dateOfBirth = dateOfBirthFromParts();
  if (!dateOfBirth) {
    showError(window.siteText("ch.remove-officer.dob-invalid", "Enter the director's date of birth as a day, month and year."));
    return null;
  }
  if (dateOfBirth >= resignationDate) {
    showError(window.siteText("ch.remove-officer.dob-after", "The date of birth must be before the date the appointment ended."));
    return null;
  }
  return { ...fields, dateOfBirth };
}

function handleResignationSubmit(event) {
  event.preventDefault();
  const officer = chosenOfficer();
  if (!officer) {
    showError(window.siteText("ch.remove-officer.choose", "Choose the director or secretary who is leaving."));
    return;
  }
  if (!window.formErrors.requireFields(["resignationDate", "companyAuthCode"])) return;
  const resignationDate = document.getElementById("resignationDate").value;
  if (resignationDate > todayInTheUk()) {
    showError(window.siteText("ch.remove-officer.ended-in-future", "The date the appointment ended cannot be in the future."));
    return;
  }
  if (officer.appointedOn && resignationDate < officer.appointedOn) {
    showError(
      window.siteText("ch.remove-officer.ended-before-appointed", "The appointment cannot end before the date it began, {date}.", {
        date: window.companiesHouseLabels.formatCompanyDate(officer.appointedOn),
      }),
    );
    return;
  }
  const fields = officerFields(officer, resignationDate);
  if (!fields) return;
  filing = {
    officer,
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: document.getElementById("companyAuthCode").value.trim(),
      dateSigned: new Date().toISOString().slice(0, 10),
      ...fields,
      resignationDate,
    },
  };
  renderReview();
  showView("reviewView");
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  const form = filing.form;
  const rows = [
    [window.siteText("ch.remove-officer.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.remove-officer.review-appointment", "Appointment"), roleText(filing.officer)],
  ];
  if (form.corporate) {
    rows.push([window.siteText("ch.remove-officer.review-corporate-name", "Corporate name"), form.corporateName]);
  } else {
    if (form.title) rows.push([window.siteText("ch.remove-officer.review-title", "Title"), form.title]);
    if (form.forename) rows.push([window.siteText("ch.remove-officer.review-forename", "First forename"), form.forename]);
    if (form.otherForenames)
      rows.push([window.siteText("ch.remove-officer.review-other-forenames", "Other forenames"), form.otherForenames]);
    rows.push([window.siteText("ch.remove-officer.review-surname", "Surname"), form.surname]);
    if (form.dateOfBirth) rows.push([window.siteText("ch.remove-officer.review-dob", "Date of birth"), formatDate(form.dateOfBirth)]);
  }
  rows.push([window.siteText("ch.remove-officer.review-ended", "Date the appointment ended"), formatDate(form.resignationDate)]);
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
      kind: FORM_KIND,
      form: filing.form,
      result: document.getElementById("filingResult"),
      headers,
    });
  } finally {
    forgetOfficer();
    hideLoading();
  }
}

// Once the filing is sent the page keeps nothing of the officer: the day of birth the reader typed,
// the name parts and the review all go, so none of it stays in the page behind the result.
function forgetOfficer() {
  filing = null;
  document.getElementById("reviewList").replaceChildren();
  ["dobDay", "dobMonth", "dobYear", "officerTitle", "officerForename", "officerOtherForenames", "officerSurname", "corporateName"].forEach(
    (id) => {
      document.getElementById(id).value = "";
    },
  );
}

function startAgain() {
  company = null;
  officers = [];
  filing = null;
  document.getElementById("resignationForm").reset();
  document.getElementById("filingResult").replaceChildren();
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("resignationForm").addEventListener("submit", handleResignationSubmit);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
