// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Appoint a director or secretary: companyView -> formView -> reviewView -> resultView. The reader
// chooses the appointment (a director or a secretary, a person or a corporate body) and the page
// shows the fields Companies House's online AP01, AP02, AP03 or AP04 asks for. A director who is a
// person also needs the Companies House personal code they received after verifying their identity.
// The personal code and the date of birth go in the filing request's body only.

const FORM_KIND = "officer-appointment";

// The appointment each choice makes, and whether the officer is a corporate body rather than a person.
const KINDS = {
  "director": { role: "director", corporate: false },
  "corporate-director": { role: "director", corporate: true },
  "secretary": { role: "secretary", corporate: false },
  "corporate-secretary": { role: "secretary", corporate: true },
};

// The countries Companies House's address takes as a code, in its schema's order. Any other country
// is sent by name.
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

// The schema's reasons a verified name can differ from the name filed, as the reader sees them.
const NAME_MISMATCH_TEXT = {
  PREFERRED_NAME: window.siteText("ch.appoint-officer.mismatch-preferred", "Preferred name"),
  LEGALLY_CHANGED: window.siteText(
    "ch.appoint-officer.mismatch-legally-changed",
    "Legally changed name (for example, marriage or divorce)",
  ),
  TRANSLATION_OR_DIFF_CONV: window.siteText("ch.appoint-officer.mismatch-translation", "Translation or a different naming convention"),
  REGISTER_ERROR: window.siteText("ch.appoint-officer.mismatch-register-error", "Error on the public register"),
  NOT_SAY: window.siteText("ch.appoint-officer.mismatch-not-say", "Prefer not to say"),
};

// The shape of a Companies House personal code, as the filing route checks it: 5 or 6 letters, then
// 6 or 5 digits, sent without the hyphens the reader may type.
const PERSONAL_CODE = /^(?=[A-Z0-9]{11}$)[A-Z]{5,6}\d{5,6}$/;

const ADDRESS_PREFIXES = ["service", "residential", "corporate"];

let company = null;
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

const show = (id, shown) => {
  document.getElementById(id).style.display = shown ? "block" : "none";
};

const fieldValue = (id) => document.getElementById(id).value.trim();

const checked = (id) => document.getElementById(id).checked;

function chosenKind() {
  const chosen = document.querySelector('input[name="officerKind"]:checked');
  return KINDS[chosen ? chosen.value : "director"];
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

// Shows the fields the chosen appointment needs and hides the rest, so the required-field check
// sees only the visible ones.
function showFieldsForChoice() {
  const { role, corporate } = chosenKind();
  show("personFields", !corporate);
  show("corporateFields", corporate);
  show("directorFields", !corporate && role === "director");
  show("serviceAddressFields", !checked("serviceSameAsOffice"));
  show("residentialAddressFields", !checked("residentialSameAsService"));
  const uk = document.getElementById("corporateUkYes").checked;
  show("ukRegistrationFields", uk);
  show("nonUkFields", !uk);
  ADDRESS_PREFIXES.forEach((prefix) => show(`${prefix}OtherCountryGroup`, fieldValue(`${prefix}Country`) === OTHER_COUNTRY));
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  showLoading();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber, companyName: profile.companyName };
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    showFieldsForChoice();
    showView("formView");
  } catch (error) {
    console.error("Could not read the company:", error);
    showError(window.siteText("ch.appoint-officer.lookup-failed", "Could not read this company from Companies House."));
  } finally {
    hideLoading();
  }
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

function corporateFields() {
  const uk = document.getElementById("corporateUkYes").checked;
  return {
    corporateName: fieldValue("corporateName"),
    address: addressFields("corporate"),
    companyIdentification: uk
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

// A person's fields, or null after showing what is wrong. A director's include the date of birth,
// nationality, home address and the personal code.
function personFields(role, appointmentDate) {
  const formerSurname = fieldValue("formerSurname");
  const fields = {
    title: fieldValue("officerTitle") || undefined,
    forename: fieldValue("officerForename") || undefined,
    otherForenames: fieldValue("officerOtherForenames") || undefined,
    surname: fieldValue("officerSurname"),
    serviceAddress: checked("serviceSameAsOffice") ? { sameAsRegisteredOffice: true } : { address: addressFields("service") },
    previousNames: formerSurname ? [{ forename: fieldValue("formerForename") || undefined, surname: formerSurname }] : [],
  };
  if (!formerSurname && fieldValue("formerForename")) {
    showError(window.siteText("ch.appoint-officer.former-surname", "Enter the former surname, or leave the former name blank."));
    return null;
  }
  if (role !== "director") return fields;
  const dateOfBirth = document.getElementById("dateOfBirth").value;
  if (dateOfBirth >= appointmentDate) {
    showError(window.siteText("ch.appoint-officer.dob-after", "The date of birth must be before the date of appointment."));
    return null;
  }
  const personalCode = fieldValue("personalCode").toUpperCase().replace(/-/g, "");
  if (!PERSONAL_CODE.test(personalCode)) {
    showError(
      window.siteText(
        "ch.appoint-officer.personal-code-invalid",
        "Enter the director's Companies House personal code: 11 characters, letters then numbers.",
      ),
    );
    return null;
  }
  const verifiedMessage = window.siteText(
    "ch.appoint-officer.identity-unconfirmed",
    "Confirm the director has verified their identity with Companies House.",
  );
  if (!window.formErrors.requireChecked({ identityVerified: verifiedMessage })) return null;
  return {
    ...fields,
    dateOfBirth,
    nationality: fieldValue("nationality"),
    countryOfResidence: fieldValue("countryOfResidence") || undefined,
    residentialAddress: checked("residentialSameAsService") ? { sameAsServiceAddress: true } : { address: addressFields("residential") },
    personalCode,
    identityVerified: true,
    nameMismatchReason: fieldValue("nameMismatchReason") || undefined,
  };
}

function handleAppointmentSubmit(event) {
  event.preventDefault();
  // A refusal belongs to the answers it refused: each Continue checks them afresh.
  window.hideStatus?.();
  showFieldsForChoice();
  if (!window.formErrors.requireFormFields(document.getElementById("appointmentForm"))) return;
  const { role, corporate } = chosenKind();
  const appointmentDate = document.getElementById("appointmentDate").value;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  if (appointmentDate > today) {
    showError(window.siteText("ch.appoint-officer.date-future", "The date of appointment cannot be in the future."));
    return;
  }
  const fields = corporate ? corporateFields() : personFields(role, appointmentDate);
  if (!fields) return;
  const consentMessage = window.siteText(
    "ch.appoint-officer.consent-missing",
    "Confirm the company has the officer's consent to act in this appointment.",
  );
  if (!window.formErrors.requireChecked({ consentToAct: consentMessage })) return;
  filing = {
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: fieldValue("companyAuthCode"),
      dateSigned: today,
      officerRole: role,
      corporate,
      appointmentDate,
      consentToAct: true,
      ...fields,
    },
  };
  renderReview();
  showView("reviewView");
}

function appointmentText({ officerRole, corporate }) {
  if (officerRole === "director") {
    return corporate
      ? window.siteText("ch.appoint-officer.kind-corporate-director", "Corporate director")
      : window.siteText("ch.appoint-officer.kind-director", "Director");
  }
  return corporate
    ? window.siteText("ch.appoint-officer.kind-corporate-secretary", "Corporate secretary")
    : window.siteText("ch.appoint-officer.kind-secretary", "Secretary");
}

function addressText(address) {
  const country = address.country ? COUNTRIES.find(([code]) => code === address.country)[1] : address.otherForeignCountry;
  return [address.premise, address.street, address.postTown, address.county, address.postcode, country].filter(Boolean).join(", ");
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  const form = filing.form;
  const rows = [
    [window.siteText("ch.appoint-officer.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.appoint-officer.review-appointment", "Appointment"), appointmentText(form)],
    [window.siteText("ch.appoint-officer.review-date", "Date of appointment"), formatDate(form.appointmentDate)],
  ];
  if (form.corporate) {
    rows.push([window.siteText("ch.appoint-officer.review-corporate-name", "Name"), form.corporateName]);
    rows.push([window.siteText("ch.appoint-officer.review-principal-office", "Principal office address"), addressText(form.address)]);
    const { uk, nonUk } = form.companyIdentification;
    if (uk)
      rows.push([window.siteText("ch.appoint-officer.review-registration-number", "Company registration number"), uk.registrationNumber]);
    else {
      rows.push([window.siteText("ch.appoint-officer.review-legal-form", "Legal form"), nonUk.legalForm]);
      rows.push([window.siteText("ch.appoint-officer.review-law-governed", "Governing law"), nonUk.lawGoverned]);
      if (nonUk.placeRegistered) rows.push([window.siteText("ch.appoint-officer.review-register", "Register"), nonUk.placeRegistered]);
      if (nonUk.registrationNumber)
        rows.push([window.siteText("ch.appoint-officer.review-register-number", "Number in that register"), nonUk.registrationNumber]);
    }
  } else {
    const name = window.companiesHouseLabels.personName(form);
    rows.push([window.siteText("ch.appoint-officer.review-name", "Name"), name]);
    if (form.previousNames.length > 0) {
      const former = form.previousNames.map((previous) => window.companiesHouseLabels.personName(previous)).join("; ");
      rows.push([window.siteText("ch.appoint-officer.review-former-name", "Former name"), former]);
    }
    rows.push([
      window.siteText("ch.appoint-officer.review-service-address", "Service address"),
      form.serviceAddress.sameAsRegisteredOffice
        ? window.siteText("ch.appoint-officer.review-registered-office", "The company's registered office")
        : addressText(form.serviceAddress.address),
    ]);
    if (form.officerRole === "director") {
      rows.push([window.siteText("ch.appoint-officer.review-dob", "Date of birth"), formatDate(form.dateOfBirth)]);
      rows.push([window.siteText("ch.appoint-officer.review-nationality", "Nationality"), form.nationality]);
      if (form.countryOfResidence)
        rows.push([window.siteText("ch.appoint-officer.review-residence", "Country where they usually live"), form.countryOfResidence]);
      rows.push([
        window.siteText("ch.appoint-officer.review-home-address", "Home address"),
        form.residentialAddress.sameAsServiceAddress
          ? window.siteText("ch.appoint-officer.review-same-as-service", "The same as the service address")
          : addressText(form.residentialAddress.address),
      ]);
      rows.push([window.siteText("ch.appoint-officer.review-personal-code", "Companies House personal code"), form.personalCode]);
      rows.push([
        window.siteText("ch.appoint-officer.review-identity", "Identity verified"),
        window.siteText("ch.appoint-officer.review-identity-yes", "Yes"),
      ]);
      if (form.nameMismatchReason)
        rows.push([
          window.siteText("ch.appoint-officer.review-mismatch", "Why the verified name differs"),
          NAME_MISMATCH_TEXT[form.nameMismatchReason],
        ]);
    }
  }
  rows.push([
    window.siteText("ch.appoint-officer.review-consent", "Consent to act"),
    window.siteText("ch.appoint-officer.review-consent-yes", "Confirmed"),
  ]);
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
  filing = null;
  document.getElementById("appointmentForm").reset();
  document.getElementById("filingResult").replaceChildren();
  showFieldsForChoice();
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

fillCountrySelects();
document.querySelectorAll('input[name="officerKind"], input[name="corporateUk"]').forEach((input) => {
  input.addEventListener("change", showFieldsForChoice);
});
["serviceSameAsOffice", "residentialSameAsService"].forEach((id) =>
  document.getElementById(id).addEventListener("change", showFieldsForChoice),
);
document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("appointmentForm").addEventListener("submit", handleAppointmentSubmit);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
showFieldsForChoice();
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
