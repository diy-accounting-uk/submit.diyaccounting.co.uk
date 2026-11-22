// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Change a director's or secretary's details: companyView -> formView -> reviewView -> resultView.
// The form finds one of the company's current directors or secretaries as the register holds them,
// so the page reads the register's officers and the reader chooses; a link from the company
// lookup's officers view names the officer in ?officerName=, with the role and the appointment date
// that tell two officers of one name apart, and the page chooses it. The reader then
// ticks what has changed and gives only the new details, as Companies House's online CH01, CH02,
// CH03 or CH04 asks.
//
// The register answers a person's name as "SURNAME, Forenames" (with a title after a second comma,
// where it holds one) and a date of birth as month and year only. The form finds a person by
// surname, forename and other forenames, and a director who is a person by the full date of birth,
// so the page splits the name for the reader to check and asks for the day of birth. The date of
// birth and any home address go in the filing request's body only.

const FORM_KIND = "officer-change";

// The register's officer roles this form changes, as the officers route answers them: the
// appointment each is (director or secretary), and whether the officer is a company rather than a person.
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

// The countries Companies House's address takes as a code, in its schema's order. Any other country
// is sent by name. The names are the appointment form's.
const COUNTRIES = [
  ["GB-ENG", window.siteText("ch.appoint-officer.country-gb-eng", "England")],
  ["GB-WLS", window.siteText("ch.appoint-officer.country-gb-wls", "Wales")],
  ["GB-SCT", window.siteText("ch.appoint-officer.country-gb-sct", "Scotland")],
  ["GB-NIR", window.siteText("ch.appoint-officer.country-gb-nir", "Northern Ireland")],
  ["GBR", window.siteText("ch.appoint-officer.country-gbr", "United Kingdom")],
  ["USA", window.siteText("ch.appoint-officer.country-usa", "United States")],
  ["IRL", window.siteText("ch.appoint-officer.country-irl", "Ireland")],
  ["DEU", window.siteText("ch.appoint-officer.country-deu", "Germany")],
  ["FRA", window.siteText("ch.appoint-officer.country-fra", "France")],
  ["ITA", window.siteText("ch.appoint-officer.country-ita", "Italy")],
  ["ESP", window.siteText("ch.appoint-officer.country-esp", "Spain")],
  ["PRT", window.siteText("ch.appoint-officer.country-prt", "Portugal")],
  ["NLD", window.siteText("ch.appoint-officer.country-nld", "Netherlands")],
  ["POL", window.siteText("ch.appoint-officer.country-pol", "Poland")],
  ["BEL", window.siteText("ch.appoint-officer.country-bel", "Belgium")],
  ["NOR", window.siteText("ch.appoint-officer.country-nor", "Norway")],
  ["SWE", window.siteText("ch.appoint-officer.country-swe", "Sweden")],
  ["DNK", window.siteText("ch.appoint-officer.country-dnk", "Denmark")],
  ["AUS", window.siteText("ch.appoint-officer.country-aus", "Australia")],
  ["NZL", window.siteText("ch.appoint-officer.country-nzl", "New Zealand")],
  ["CAN", window.siteText("ch.appoint-officer.country-can", "Canada")],
  ["ZAF", window.siteText("ch.appoint-officer.country-zaf", "South Africa")],
  ["AUT", window.siteText("ch.appoint-officer.country-aut", "Austria")],
  ["HRV", window.siteText("ch.appoint-officer.country-hrv", "Croatia")],
  ["CYP", window.siteText("ch.appoint-officer.country-cyp", "Cyprus")],
  ["CZE", window.siteText("ch.appoint-officer.country-cze", "Czech Republic")],
  ["EST", window.siteText("ch.appoint-officer.country-est", "Estonia")],
  ["HUN", window.siteText("ch.appoint-officer.country-hun", "Hungary")],
  ["GRC", window.siteText("ch.appoint-officer.country-grc", "Greece")],
  ["LTU", window.siteText("ch.appoint-officer.country-ltu", "Lithuania")],
];
const OTHER_COUNTRY = "other";

const ADDRESS_PREFIXES = ["service", "residential", "corporate"];

// Each "what has changed" box and the fields it shows.
const CHANGE_FIELDS = {
  changeName: "newNameFields",
  changeService: "newServiceFields",
  changeResidential: "newResidentialFields",
  changeNationality: "newNationalityFields",
  changeResidence: "newResidenceFields",
  changeCorporateName: "newCorporateNameFields",
  changeCorporateAddress: "newCorporateAddressFields",
  changeLegal: "newLegalFields",
};
const PERSON_CHANGES = ["changeName", "changeService"];
const DIRECTOR_CHANGES = ["changeResidential", "changeNationality", "changeResidence"];
const CORPORATE_CHANGES = ["changeCorporateName", "changeCorporateAddress", "changeLegal"];

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

const show = (id, shown) => {
  document.getElementById(id).style.display = shown ? "block" : "none";
};

const fieldValue = (id) => document.getElementById(id).value.trim();

const checked = (id) => document.getElementById(id).checked;

const changeable = (officer) => !officer.resignedOn && Boolean(ROLES[officer.officerRole]) && Boolean(officer.name);

function roleText(officer) {
  const { role, corporate } = ROLES[officer.officerRole];
  if (role === "director") {
    return corporate
      ? window.siteText("ch.change-officer.role-corporate-director", "Corporate director")
      : window.siteText("ch.change-officer.role-director", "Director");
  }
  return corporate
    ? window.siteText("ch.change-officer.role-corporate-secretary", "Corporate secretary")
    : window.siteText("ch.change-officer.role-secretary", "Secretary");
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

function chosenOfficer() {
  const chosen = document.querySelector('#officerChoices input[name="officer"]:checked');
  return chosen ? officers[Number(chosen.value)] : null;
}

function chosenKind() {
  const officer = chosenOfficer();
  return officer ? ROLES[officer.officerRole] : null;
}

function fillCountrySelects() {
  ADDRESS_PREFIXES.forEach((prefix) => {
    const select = document.getElementById(`${prefix}Country`);
    const blank = new Option(window.siteText("ch.appoint-officer.country-choose", "Choose a country"), "");
    const other = new Option(window.siteText("ch.appoint-officer.country-other", "Another country"), OTHER_COUNTRY);
    select.replaceChildren(blank, ...COUNTRIES.map(([code, name]) => new Option(name, code)), other);
    select.addEventListener("change", showFieldsForChoice);
  });
}

// Shows the fields the chosen officer and the ticked changes need and hides the rest, so the
// required-field check sees only the visible ones.
function showFieldsForChoice() {
  const kind = chosenKind();
  const person = Boolean(kind) && !kind.corporate;
  const director = person && kind.role === "director";
  const corporate = Boolean(kind?.corporate);
  show("personFields", person);
  show("corporateFields", corporate);
  show("dobFields", director);
  show("personChanges", person);
  show("directorChanges", director);
  show("corporateChanges", corporate);
  const offered = [...(person ? PERSON_CHANGES : []), ...(director ? DIRECTOR_CHANGES : []), ...(corporate ? CORPORATE_CHANGES : [])];
  Object.entries(CHANGE_FIELDS).forEach(([box, fields]) => show(fields, offered.includes(box) && checked(box)));
  show("serviceAddressFields", !checked("serviceSameAsOffice"));
  show("residentialUnchangedGroup", director && !checked("changeResidential"));
  show("residentialAddressFields", !checked("residentialSameAsService"));
  const uk = document.getElementById("corporateUkYes").checked;
  show("ukRegistrationFields", uk);
  show("nonUkFields", !uk);
  ADDRESS_PREFIXES.forEach((prefix) => show(`${prefix}OtherCountryGroup`, fieldValue(`${prefix}Country`) === OTHER_COUNTRY));
}

// The chosen officer's fields, filled in from the register: a person's name parts, or a corporate
// officer's name; for a director who is a person, the month and year of birth the register shows.
function fillOfficerFields() {
  const officer = chosenOfficer();
  const kind = chosenKind();
  const setValue = (id, value) => {
    document.getElementById(id).value = value ?? "";
  };
  showFieldsForChoice();
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

// Whether an officer is the one a link named: the name, and the role and appointment date where the
// link gives them, so two officers of one name, or one person who is both director and secretary, stay apart.
function namedBy(officer, named) {
  return (
    officer.name === named.name &&
    (!named.role || officer.officerRole === named.role) &&
    (!named.appointedOn || officer.appointedOn === named.appointedOn)
  );
}

// An officer as the choice and the review name them: the name, the appointment, and what tells them
// apart from another current officer of the same name.
function officerText(officer) {
  return window.companiesHouseNamesakes.namedApart(officer, officers.filter(changeable), roleText(officer));
}

function renderOfficerChoices(named) {
  const holder = document.getElementById("officerChoices");
  holder.replaceChildren();
  const current = officers.filter(changeable);
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
    input.addEventListener("change", fillOfficerFields);
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = officerText(officer);
    choice.append(input, label);
    holder.appendChild(choice);
  });
  fillOfficerFields();
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
      window.siteText("ch.change-officer.lookup-failed", "Could not read this company's directors and secretaries from Companies House."),
    );
  } finally {
    hideLoading();
  }
}

// The full date of birth from its three parts, as YYYY-MM-DD, or null when they are not a real date.
function dateOfBirthFromParts() {
  const day = Number(fieldValue("dobDay"));
  const month = Number(fieldValue("dobMonth"));
  const year = Number(fieldValue("dobYear"));
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year) || year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// An address block's fields as the filing route reads them.
function addressFields(prefix) {
  const country = fieldValue(`${prefix}Country`);
  return {
    premise: fieldValue(`${prefix}Premise`),
    street: fieldValue(`${prefix}Street`) || undefined,
    postTown: fieldValue(`${prefix}PostTown`),
    county: fieldValue(`${prefix}County`) || undefined,
    country: country === OTHER_COUNTRY ? undefined : country,
    otherForeignCountry: country === OTHER_COUNTRY ? fieldValue(`${prefix}OtherCountry`) : undefined,
    postcode: fieldValue(`${prefix}Postcode`) || undefined,
  };
}

function corporateChangeFields() {
  if (!CORPORATE_CHANGES.some(checked)) {
    showError(window.siteText("ch.change-officer.nothing-changed", "Choose at least one detail that has changed."));
    return null;
  }
  const uk = document.getElementById("corporateUkYes").checked;
  return {
    corporateName: fieldValue("corporateName"),
    newCorporateName: checked("changeCorporateName") ? fieldValue("newCorporateName") : undefined,
    address: checked("changeCorporateAddress") ? addressFields("corporate") : undefined,
    companyIdentification: !checked("changeLegal")
      ? undefined
      : uk
        ? { uk: { registrationNumber: fieldValue("ukRegistrationNumber") } }
        : {
            nonUk: {
              placeRegistered: fieldValue("placeRegistered") || undefined,
              registrationNumber: fieldValue("nonUkRegistrationNumber") || undefined,
              lawGoverned: fieldValue("lawGoverned"),
              legalForm: fieldValue("legalForm"),
            },
          },
  };
}

// A director's new home address and the confirmation that goes with a new service address, or null
// after showing what is wrong.
function directorAddressFields() {
  const changeService = checked("changeService");
  const changeResidential = checked("changeResidential");
  if (changeService && !changeResidential) {
    const unchangedMessage = window.siteText(
      "ch.change-officer.residential-unconfirmed",
      "Confirm the director's home address has not changed, or choose their home address as a detail that has changed.",
    );
    if (!window.formErrors.requireChecked({ residentialUnchanged: unchangedMessage })) return null;
    return { residentialAddressUnchanged: true };
  }
  if (!changeResidential) return {};
  if (checked("residentialSameAsService") && changeService && checked("serviceSameAsOffice")) {
    showError(
      window.siteText(
        "ch.change-officer.residential-office",
        "The home address cannot be the same as a service address that is the registered office. Enter the home address in full.",
      ),
    );
    return null;
  }
  return {
    residentialAddress: checked("residentialSameAsService") ? { sameAsServiceAddress: true } : { address: addressFields("residential") },
  };
}

// A person's fields, or null after showing what is wrong. A director's include the date of birth
// that finds them and the changes only a director's record carries.
function personChangeFields(role, dateOfChange) {
  const director = role === "director";
  const offered = director ? [...PERSON_CHANGES, ...DIRECTOR_CHANGES] : PERSON_CHANGES;
  if (!offered.some(checked)) {
    showError(window.siteText("ch.change-officer.nothing-changed", "Choose at least one detail that has changed."));
    return null;
  }
  const fields = {
    title: fieldValue("officerTitle") || undefined,
    forename: fieldValue("officerForename") || undefined,
    otherForenames: fieldValue("officerOtherForenames") || undefined,
    surname: fieldValue("officerSurname"),
    newName: checked("changeName")
      ? {
          title: fieldValue("newTitle") || undefined,
          forename: fieldValue("newForename") || undefined,
          otherForenames: fieldValue("newOtherForenames") || undefined,
          surname: fieldValue("newSurname"),
        }
      : undefined,
    serviceAddress: !checked("changeService")
      ? undefined
      : checked("serviceSameAsOffice")
        ? { sameAsRegisteredOffice: true }
        : { address: addressFields("service") },
  };
  if (!director) return fields;
  const dateOfBirth = dateOfBirthFromParts();
  if (!dateOfBirth) {
    showError(window.siteText("ch.change-officer.dob-invalid", "Enter the director's date of birth as a day, month and year."));
    return null;
  }
  if (dateOfBirth >= dateOfChange) {
    showError(window.siteText("ch.change-officer.dob-after", "The date of birth must be before the date the details changed."));
    return null;
  }
  const addresses = directorAddressFields();
  if (!addresses) return null;
  return {
    ...fields,
    dateOfBirth,
    ...addresses,
    nationality: checked("changeNationality") ? fieldValue("nationality") : undefined,
    countryOfResidence: checked("changeResidence") ? fieldValue("countryOfResidence") : undefined,
  };
}

function handleChangeSubmit(event) {
  event.preventDefault();
  const officer = chosenOfficer();
  if (!officer) {
    showError(window.siteText("ch.change-officer.choose", "Choose the director or secretary whose details have changed."));
    return;
  }
  showFieldsForChoice();
  if (!window.formErrors.requireFormFields(document.getElementById("changeForm"))) return;
  const { role, corporate } = ROLES[officer.officerRole];
  const dateOfChange = document.getElementById("dateOfChange").value;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  if (dateOfChange > today) {
    showError(window.siteText("ch.change-officer.date-future", "The date the details changed cannot be in the future."));
    return;
  }
  if (officer.appointedOn && dateOfChange < officer.appointedOn) {
    showError(
      window.siteText(
        "ch.change-officer.date-before-appointment",
        "The date the details changed cannot be before {date}, when the register shows they were appointed.",
        { date: window.companiesHouseLabels.formatCompanyDate(officer.appointedOn) },
      ),
    );
    return;
  }
  const fields = corporate ? corporateChangeFields() : personChangeFields(role, dateOfChange);
  if (!fields) return;
  filing = {
    officer,
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: fieldValue("companyAuthCode"),
      dateSigned: today,
      officerRole: role,
      corporate,
      dateOfChange,
      ...fields,
    },
  };
  renderReview();
  showView("reviewView");
}

function addressText(address) {
  const country = address.country ? COUNTRIES.find(([code]) => code === address.country)[1] : address.otherForeignCountry;
  return [address.premise, address.street, address.postTown, address.county, address.postcode, country].filter(Boolean).join(", ");
}

const personName = (name) => [name.title, name.forename, name.otherForenames, name.surname].filter(Boolean).join(" ");

function corporateReviewRows(form) {
  const rows = [[window.siteText("ch.change-officer.review-corporate-name", "Name on the register"), form.corporateName]];
  if (form.newCorporateName) rows.push([window.siteText("ch.change-officer.review-new-name", "New name"), form.newCorporateName]);
  if (form.address)
    rows.push([window.siteText("ch.change-officer.review-principal-office", "New principal office address"), addressText(form.address)]);
  const { uk, nonUk } = form.companyIdentification || {};
  if (uk)
    rows.push([window.siteText("ch.change-officer.review-registration-number", "New company registration number"), uk.registrationNumber]);
  if (nonUk) {
    rows.push([window.siteText("ch.change-officer.review-legal-form", "New legal form"), nonUk.legalForm]);
    rows.push([window.siteText("ch.change-officer.review-law-governed", "New governing law"), nonUk.lawGoverned]);
    if (nonUk.placeRegistered) rows.push([window.siteText("ch.change-officer.review-register", "New register"), nonUk.placeRegistered]);
    if (nonUk.registrationNumber)
      rows.push([window.siteText("ch.change-officer.review-register-number", "New number in that register"), nonUk.registrationNumber]);
  }
  return rows;
}

function personReviewRows(form) {
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  const rows = [[window.siteText("ch.change-officer.review-name", "Name on the register"), personName(form)]];
  if (form.dateOfBirth) rows.push([window.siteText("ch.change-officer.review-dob", "Date of birth"), formatDate(form.dateOfBirth)]);
  if (form.newName) rows.push([window.siteText("ch.change-officer.review-new-name", "New name"), personName(form.newName)]);
  if (form.serviceAddress)
    rows.push([
      window.siteText("ch.change-officer.review-service-address", "New service address"),
      form.serviceAddress.sameAsRegisteredOffice
        ? window.siteText("ch.change-officer.review-registered-office", "The company's registered office")
        : addressText(form.serviceAddress.address),
    ]);
  if (form.residentialAddressUnchanged)
    rows.push([
      window.siteText("ch.change-officer.review-home-address", "Home address"),
      window.siteText("ch.change-officer.review-home-unchanged", "Not changed"),
    ]);
  if (form.residentialAddress)
    rows.push([
      window.siteText("ch.change-officer.review-new-home-address", "New home address"),
      form.residentialAddress.sameAsServiceAddress
        ? window.siteText("ch.change-officer.review-same-as-service", "The same as the service address")
        : addressText(form.residentialAddress.address),
    ]);
  if (form.nationality) rows.push([window.siteText("ch.change-officer.review-nationality", "New nationality"), form.nationality]);
  if (form.countryOfResidence)
    rows.push([window.siteText("ch.change-officer.review-residence", "New country where they usually live"), form.countryOfResidence]);
  return rows;
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const form = filing.form;
  const rows = [
    [window.siteText("ch.change-officer.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.change-officer.review-officer", "Officer"), officerText(filing.officer)],
    [
      window.siteText("ch.change-officer.review-date", "Date the details changed"),
      window.companiesHouseLabels.formatCompanyDate(form.dateOfChange),
    ],
    ...(form.corporate ? corporateReviewRows(form) : personReviewRows(form)),
  ];
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
    hideLoading();
  }
}

function startAgain() {
  company = null;
  officers = [];
  filing = null;
  document.getElementById("changeForm").reset();
  document.getElementById("filingResult").replaceChildren();
  showFieldsForChoice();
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

fillCountrySelects();
document.querySelectorAll('input[name="corporateUk"]').forEach((input) => input.addEventListener("change", showFieldsForChoice));
[...Object.keys(CHANGE_FIELDS), "serviceSameAsOffice", "residentialSameAsService"].forEach((id) =>
  document.getElementById(id).addEventListener("change", showFieldsForChoice),
);
document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("changeForm").addEventListener("submit", handleChangeSubmit);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
showFieldsForChoice();
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
