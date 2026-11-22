// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Tell Companies House about a new PSC: companyView -> formView -> reviewView -> resultView. The
// reader says which kind of person with significant control is new (an individual, a relevant legal
// entity or an other registrable person), gives the particulars Companies House's PSC01, PSC02 or
// PSC03 asks for, how they control the company, the date they became one and the date the company
// had confirmation of it. A link from the company lookup's PSC view names the company in ?companyNumber=.

const FORM_KIND = "psc-notification";
const INDIVIDUAL = "individual-person-with-significant-control";
const CORPORATE = "corporate-entity-person-with-significant-control";
const FIRST_NOTIFICATION_DATE = "2016-04-06";

let company = null;
let filing = null;

const field = (id) => document.getElementById(id);
const value = (id) => field(id).value.trim();

function showView(name) {
  // A message belongs to the view it was shown on: a refusal fixed on the form is not shown above the review.
  window.hideStatus?.();
  ["companyView", "formView", "reviewView", "resultView"].forEach((id) => {
    field(id).style.display = id === name ? "block" : "none";
  });
}

function showError(text) {
  // One refusal at a time: the answer just refused replaces the one refused before.
  window.hideStatus?.();
  if (window.showStatus) window.showStatus(text, "error");
}

const chosenKind = () => document.querySelector('input[name="pscKind"]:checked').value;

function kindText(kind) {
  if (kind === INDIVIDUAL) return window.siteText("ch.notify-psc.kind-individual", "An individual");
  if (kind === CORPORATE) return window.siteText("ch.notify-psc.kind-corporate", "A relevant legal entity");
  return window.siteText("ch.notify-psc.kind-legal-person", "An other registrable person");
}

// Show the sections the chosen kind and the address choices need.
function showSections() {
  const kind = chosenKind();
  field("individualSection").style.display = kind === INDIVIDUAL ? "block" : "none";
  field("entitySection").style.display = kind === INDIVIDUAL ? "none" : "block";
  field("registerSection").style.display = kind === CORPORATE ? "block" : "none";
  field("serviceAddress").style.display =
    document.querySelector('input[name="serviceChoice"]:checked').value === "other" ? "block" : "none";
  field("homeAddress").style.display = document.querySelector('input[name="homeChoice"]:checked').value === "other" ? "block" : "none";
  field("verifiedSection").style.display = field("verified").checked ? "block" : "none";
  document.querySelectorAll("select[data-other-country]").forEach((select) => {
    field(select.dataset.otherCountry).style.display = select.value === "OTHER" ? "block" : "none";
  });
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(value("companyNumber"));
  showLoading();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber, companyName: profile.companyName };
    field("formCompanyName").textContent = company.companyName;
    field("formCompanyNumber").textContent = company.companyNumber;
    showSections();
    showView("formView");
  } catch (error) {
    console.error("Could not read the company from Companies House:", error);
    showError(window.siteText("ch.notify-psc.lookup-failed", "Could not read this company from Companies House."));
  } finally {
    hideLoading();
  }
}

// The address one group of fields gives, with its empty parts left out.
function addressFrom(prefix) {
  const country = field(`${prefix}Country`).value;
  const address = {
    premise: value(`${prefix}Premise`),
    street: value(`${prefix}Street`),
    thoroughfare: value(`${prefix}Thoroughfare`),
    postTown: value(`${prefix}PostTown`),
    county: value(`${prefix}County`),
    postcode: value(`${prefix}Postcode`),
  };
  if (country === "OTHER") address.otherForeignCountry = value(`${prefix}OtherForeignCountry`);
  else address.country = country;
  return Object.fromEntries(Object.entries(address).filter(([, part]) => part));
}

const addressComplete = (address) => Boolean(address.premise && address.postTown && (address.country || address.otherForeignCountry));

// The ways of holding control the page offers: directly, through a firm and through a trust, each
// with its field suffix and the code suffix the form gives it.
const HOLDINGS = [
  { fields: "", code: "" },
  { fields: "-firm", code: "_AS_FIRM" },
  { fields: "-trust", code: "_AS_TRUST" },
];

// The controls ticked for one way of holding.
function controlsHeld({ fields, code }) {
  const shares = document.querySelector(`input[name="shares${fields}"]:checked`).value;
  const votes = document.querySelector(`input[name="votes${fields}"]:checked`).value;
  return [
    shares && `OWNERSHIPOFSHARES_${shares}${code}`,
    votes && `VOTINGRIGHTS_${votes}${code}`,
    field(`directors${fields}`).checked && `RIGHTTOAPPOINTANDREMOVEDIRECTORS${code}`,
    field(`influence${fields}`).checked && `SIGINFLUENCECONTROL${code}`,
  ].filter(Boolean);
}

const chosenControls = () => HOLDINGS.flatMap(controlsHeld);

// Significant influence or control is chosen beside another control held the same way.
const influenceNotAlone = () =>
  HOLDINGS.some((holding) => {
    const held = controlsHeld(holding);
    return held.includes(`SIGINFLUENCECONTROL${holding.code}`) && held.length > 1;
  });

// The particulars of the chosen kind, as the filing route reads them, and the reason they cannot
// go on in the reader's words, or null.
function particulars(kind) {
  if (kind === INDIVIDUAL) {
    const serviceIsOffice = document.querySelector('input[name="serviceChoice"]:checked').value === "office";
    const homeIsService = document.querySelector('input[name="homeChoice"]:checked').value === "service";
    const fields = {
      pscKind: kind,
      title: value("title"),
      forename: value("forename"),
      otherForenames: value("otherForenames"),
      surname: value("surname"),
      dateOfBirth: field("dateOfBirth").value,
      nationality: value("nationality"),
      countryOfResidence: value("countryOfResidence"),
      serviceAddress: serviceIsOffice ? { sameAsRegisteredOffice: true } : { address: addressFrom("service") },
      residentialAddress: homeIsService ? { sameAsServiceAddress: true } : { address: addressFrom("home") },
    };
    if (field("verified").checked) {
      // PSC01 prints the code in groups; a space, slash or hyphen between them is not part of it.
      fields.personalCode = value("personalCode")
        .toUpperCase()
        .replace(/[\s/-]/g, "");
      if (field("nameMismatchReason").value) fields.nameMismatchReason = field("nameMismatchReason").value;
    }
    let problem = null;
    if (!fields.surname || !fields.dateOfBirth || !fields.nationality || !fields.countryOfResidence) {
      problem = window.siteText(
        "ch.notify-psc.individual-needed",
        "Give the individual's surname, date of birth, nationality and country of residence.",
      );
    } else if (!serviceIsOffice && !addressComplete(fields.serviceAddress.address)) {
      problem = window.siteText(
        "ch.notify-psc.service-needed",
        "Give the service address's building name or number, its post town and its country.",
      );
    } else if (homeIsService && serviceIsOffice) {
      problem = window.siteText(
        "ch.notify-psc.home-not-office",
        "The usual residential address cannot be the service address when the service address is the company's registered office.",
      );
    } else if (!homeIsService && !addressComplete(fields.residentialAddress.address)) {
      problem = window.siteText(
        "ch.notify-psc.home-needed",
        "Give the usual residential address's building name or number, its post town and its country.",
      );
    } else if (field("verified").checked && !/^(?=[A-Z0-9]{11}$)[A-Z]{5,6}\d{5,6}$/.test(fields.personalCode.replace(/-/g, ""))) {
      problem = window.siteText("ch.notify-psc.code-needed", "A Companies House personal code is 11 characters: letters, then numbers.");
    }
    return { fields, problem };
  }
  const fields = {
    pscKind: kind,
    name: value("entityName"),
    address: addressFrom("office"),
    legalForm: value("legalForm"),
    lawGoverned: value("lawGoverned"),
  };
  if (kind === CORPORATE) {
    Object.assign(fields, {
      placeRegistered: value("placeRegistered"),
      countryOrState: value("countryOrState"),
      registrationNumber: value("registrationNumber"),
    });
  }
  let problem = null;
  if (!fields.name || !fields.legalForm || !fields.lawGoverned) {
    problem = window.siteText("ch.notify-psc.entity-needed", "Give the name, the legal form and the governing law.");
  } else if (!addressComplete(fields.address)) {
    problem = window.siteText(
      "ch.notify-psc.office-needed",
      "Give the principal office address's building name or number, its post town and its country.",
    );
  } else if (fields.placeRegistered && !fields.registrationNumber) {
    problem = window.siteText(
      "ch.notify-psc.number-needed",
      "Where you give the register the entity is entered in, give its number in that register too.",
    );
  } else if (fields.placeRegistered && fields.registrationNumber && !fields.countryOrState) {
    problem = window.siteText(
      "ch.notify-psc.country-or-state-needed",
      "Where you give the register the entity is entered in and its number there, give the country or state of that register too.",
    );
  }
  return { fields, problem };
}

function handleNotifySubmit(event) {
  event.preventDefault();
  const kind = chosenKind();
  const { fields, problem } = particulars(kind);
  if (problem) {
    showError(problem);
    return;
  }
  const naturesOfControl = chosenControls();
  if (naturesOfControl.length === 0) {
    showError(window.siteText("ch.notify-psc.control-needed", "Choose at least one way the person controls the company."));
    return;
  }
  if (influenceNotAlone()) {
    showError(
      window.siteText(
        "ch.notify-psc.influence-alone-held",
        "Choose significant influence or control only if none of the other ways in the same section applies.",
      ),
    );
    return;
  }
  if (!window.formErrors.requireFields(["notificationDate", "confirmationDate", "companyAuthCode"])) return;
  const notificationDate = field("notificationDate").value;
  const confirmationDate = field("confirmationDate").value;
  if (notificationDate < FIRST_NOTIFICATION_DATE) {
    showError(
      window.siteText(
        "ch.notify-psc.date-too-early",
        "The date they became a person with significant control cannot be before 6 April 2016.",
      ),
    );
    return;
  }
  if (confirmationDate < notificationDate) {
    showError(
      window.siteText(
        "ch.notify-psc.confirmation-before",
        "The date of confirmation cannot be before the date they became a person with significant control.",
      ),
    );
    return;
  }
  filing = {
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    companyAuthCode: value("companyAuthCode"),
    dateSigned: new Date().toISOString().slice(0, 10),
    ...Object.fromEntries(Object.entries(fields).filter(([, part]) => part !== "")),
    naturesOfControl,
    notificationDate,
    confirmationDate,
  };
  renderReview();
  showView("reviewView");
}

// One nature of control code in the reader's words.
function controlText(code) {
  if (code.endsWith("_AS_FIRM")) {
    return window.siteText("ch.change-psc.as-firm", "{control}, through a firm", { control: controlText(code.slice(0, -8)) });
  }
  if (code.endsWith("_AS_TRUST")) {
    return window.siteText("ch.change-psc.as-trust", "{control}, through a trust", { control: controlText(code.slice(0, -9)) });
  }
  const bandText = {
    "25TO50PERCENT": window.siteText("ch.change-psc.band-25", "more than 25% but not more than 50%"),
    "50TO75PERCENT": window.siteText("ch.change-psc.band-50", "more than 50% but less than 75%"),
    "75TO100PERCENT": window.siteText("ch.change-psc.band-75", "75% or more"),
  };
  if (code.startsWith("OWNERSHIPOFSHARES_"))
    return window.siteText("ch.change-psc.shares", "Shares: {band}", { band: bandText[code.slice(18)] });
  if (code.startsWith("VOTINGRIGHTS_"))
    return window.siteText("ch.change-psc.votes", "Voting rights: {band}", { band: bandText[code.slice(13)] });
  if (code === "RIGHTTOAPPOINTANDREMOVEDIRECTORS") {
    return window.siteText("ch.change-psc.directors", "The right to appoint or remove a majority of the board of directors");
  }
  return window.siteText("ch.change-psc.influence", "Significant influence or control");
}

function addressText(address, prefix) {
  const country = address.otherForeignCountry || field(`${prefix}Country`).querySelector(`option[value="${address.country}"]`).textContent;
  return [address.premise, address.street, address.thoroughfare, address.postTown, address.county, address.postcode, country]
    .filter(Boolean)
    .join(", ");
}

function renderReview() {
  const list = field("reviewList");
  list.replaceChildren();
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  const rows = [
    [window.siteText("ch.notify-psc.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.notify-psc.review-kind", "Kind"), kindText(filing.pscKind)],
  ];
  if (filing.pscKind === INDIVIDUAL) {
    rows.push(
      [
        window.siteText("ch.notify-psc.review-name", "Name"),
        [filing.title, filing.forename, filing.otherForenames, filing.surname].filter(Boolean).join(" "),
      ],
      [window.siteText("ch.notify-psc.review-born", "Date of birth"), formatDate(filing.dateOfBirth)],
      [window.siteText("ch.notify-psc.review-nationality", "Nationality"), filing.nationality],
      [window.siteText("ch.notify-psc.review-residence", "Country or state of residence"), filing.countryOfResidence],
      [
        window.siteText("ch.notify-psc.review-service", "Service address"),
        filing.serviceAddress.sameAsRegisteredOffice
          ? window.siteText("ch.notify-psc.review-office", "The company's registered office")
          : addressText(filing.serviceAddress.address, "service"),
      ],
      [
        window.siteText("ch.notify-psc.review-home", "Usual residential address"),
        filing.residentialAddress.sameAsServiceAddress
          ? window.siteText("ch.notify-psc.review-same", "The same as the service address")
          : addressText(filing.residentialAddress.address, "home"),
      ],
    );
    if (filing.personalCode)
      rows.push([window.siteText("ch.notify-psc.review-code", "Companies House personal code"), filing.personalCode]);
  } else {
    rows.push(
      [window.siteText("ch.notify-psc.review-name", "Name"), filing.name],
      [window.siteText("ch.notify-psc.review-office-address", "Principal office address"), addressText(filing.address, "office")],
      [window.siteText("ch.notify-psc.review-legal-form", "Legal form"), filing.legalForm],
      [window.siteText("ch.notify-psc.review-law", "Governing law"), filing.lawGoverned],
    );
    if (filing.placeRegistered) {
      rows.push([
        window.siteText("ch.notify-psc.review-register", "Register"),
        [filing.placeRegistered, filing.countryOrState, filing.registrationNumber].filter(Boolean).join(", "),
      ]);
    }
  }
  rows.push(
    [window.siteText("ch.notify-psc.review-control", "How they control the company"), filing.naturesOfControl.map(controlText)],
    [window.siteText("ch.notify-psc.review-became", "Became a person with significant control"), formatDate(filing.notificationDate)],
    [window.siteText("ch.notify-psc.review-confirmed", "Date of confirmation"), formatDate(filing.confirmationDate)],
  );
  rows.forEach(([label, text]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (Array.isArray(text)) {
      const items = document.createElement("ul");
      text.forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        items.appendChild(item);
      });
      dd.appendChild(items);
    } else {
      dd.textContent = text;
    }
    list.append(dt, dd);
  });
}

async function handleFile() {
  const scenario = value("govTestScenario");
  const headers = scenario ? { "Gov-Test-Scenario": scenario } : {};
  // The home address and full date of birth are not on the public register: once sent, the page
  // keeps neither, in its review, its inputs or its filing.
  const form = filing;
  filing = null;
  field("reviewList").replaceChildren();
  field("notifyForm").reset();
  showSections();
  showView("resultView");
  showLoading();
  try {
    await window.companiesHouseFormPage.fileAndShowOutcome({ kind: FORM_KIND, form, result: field("filingResult"), headers });
  } finally {
    hideLoading();
  }
}

function startAgain() {
  company = null;
  filing = null;
  field("notifyForm").reset();
  showSections();
  field("filingResult").replaceChildren();
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  field("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

field("companyForm").addEventListener("submit", handleCompanySubmit);
field("notifyForm").addEventListener("submit", handleNotifySubmit);
field("notifyForm").addEventListener("change", showSections);
field("submitFilingBtn").addEventListener("click", handleFile);
field("changeBtn").addEventListener("click", () => showView("formView"));
field("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
