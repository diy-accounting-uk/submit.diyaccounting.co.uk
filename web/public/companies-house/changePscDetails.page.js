// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Tell Companies House a PSC's details have changed: companyView -> formView -> reviewView ->
// resultView. The reader chooses one of the register's current PSCs, then gives how they now
// control the company (the register's present natures of control are ticked to start from), their
// new address, or both. A link from the company lookup's PSC view names the PSC in ?pscName=.

const FORM_KIND = "psc-change-details";
// The register's kinds of PSC this form names, as the PSC route answers them.
const INDIVIDUAL = "individual-person-with-significant-control";
const CHANGE_KINDS = [INDIVIDUAL, "corporate-entity-person-with-significant-control", "legal-person-person-with-significant-control"];

// The register's nature of control words and the form's codes for them: each right, then the band
// (for shares and votes), then how it is held (directly, through a trust, through a firm).
const RIGHTS = {
  "ownership-of-shares": "OWNERSHIPOFSHARES",
  "voting-rights": "VOTINGRIGHTS",
  "right-to-appoint-and-remove-directors": "RIGHTTOAPPOINTANDREMOVEDIRECTORS",
  "significant-influence-or-control": "SIGINFLUENCECONTROL",
};
const BANDS = { "25-to-50-percent": "25TO50PERCENT", "50-to-75-percent": "50TO75PERCENT", "75-to-100-percent": "75TO100PERCENT" };
const HOLDINGS = { "": "", "-as-trust": "_AS_TRUST", "-as-firm": "_AS_FIRM" };

/** The form's code for one of the register's nature of control words, or null for one the form has not. */
function natureOfControlCode(registerWords) {
  for (const [right, rightCode] of Object.entries(RIGHTS)) {
    if (!registerWords.startsWith(right)) continue;
    let rest = registerWords.slice(right.length);
    let band = "";
    if (rightCode === "OWNERSHIPOFSHARES" || rightCode === "VOTINGRIGHTS") {
      const bandWords = Object.keys(BANDS).find((words) => rest.startsWith(`-${words}`));
      if (!bandWords) return null;
      band = `_${BANDS[bandWords]}`;
      rest = rest.slice(bandWords.length + 1);
    }
    return rest in HOLDINGS ? `${rightCode}${band}${HOLDINGS[rest]}` : null;
  }
  return null;
}

const isDirect = (code) => !code.endsWith("_AS_TRUST") && !code.endsWith("_AS_FIRM");

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
  if (window.showStatus) window.showStatus(text, "error");
}

// A current PSC this form can name: one the register lists as not ceased, of a kind the form has,
// with the particulars the form needs (an individual's surname, an entity's name).
function nameable(psc) {
  if (psc.ceasedOn || !CHANGE_KINDS.includes(psc.kind)) return false;
  return psc.kind === INDIVIDUAL ? Boolean(psc.nameElements?.surname) : Boolean(psc.name);
}

function kindText(kind) {
  return kind === INDIVIDUAL
    ? window.siteText("ch.change-psc.kind-individual", "Individual")
    : window.siteText("ch.change-psc.kind-entity", "Legal entity or other registrable person");
}

function chosenPsc() {
  const chosen = document.querySelector('#pscChoices input[name="psc"]:checked');
  return chosen ? pscs[Number(chosen.value)] : null;
}

// The controls held through a trust or a firm, which the page does not offer: kept as the register holds them.
function heldOtherwise(psc) {
  return (psc?.naturesOfControl || []).map(natureOfControlCode).filter((code) => code && !isDirect(code));
}

// Tick the chosen PSC's present direct controls, name the ones held otherwise, and word the address for its kind.
function showChosenPsc() {
  const psc = chosenPsc();
  const codes = (psc?.naturesOfControl || []).map(natureOfControlCode).filter(Boolean);
  const band = (right) => codes.find((code) => code.startsWith(`${right}_`) && isDirect(code))?.slice(right.length + 1) || "";
  document.querySelector(`input[name="shares"][value="${band("OWNERSHIPOFSHARES")}"]`).checked = true;
  document.querySelector(`input[name="votes"][value="${band("VOTINGRIGHTS")}"]`).checked = true;
  document.getElementById("directors").checked = codes.includes("RIGHTTOAPPOINTANDREMOVEDIRECTORS");
  document.getElementById("influence").checked = codes.includes("SIGINFLUENCECONTROL");
  const other = heldOtherwise(psc);
  const note = document.getElementById("heldOther");
  note.style.display = other.length ? "block" : "none";
  note.textContent = other.length
    ? window.siteText("ch.change-psc.held-other", "Also kept as the register holds them: {controls}.", {
        controls: other.map(controlText).join("; "),
      })
    : "";
  document.getElementById("addressLegend").textContent =
    psc && psc.kind !== INDIVIDUAL
      ? window.siteText("ch.change-psc.address-entity", "The new principal office address")
      : window.siteText("ch.change-psc.address-individual", "The new service address");
  showSections();
}

// A PSC as the page names it: with its month and year of birth when another current PSC has its name,
// so two people of one name are told apart.
function pscLabel(psc) {
  const namesake = pscs.filter(nameable).some((other) => other !== psc && other.name === psc.name);
  const born = psc.dateOfBirth;
  if (!namesake || psc.kind !== INDIVIDUAL || !born?.month || !born?.year) return `${psc.name} (${kindText(psc.kind)})`;
  const monthAndYear = window.companiesHouseLabels
    .formatCompanyDate(`${born.year}-${String(born.month).padStart(2, "0")}-01`)
    .replace(/^1 /, "");
  return window.siteText("ch.change-psc.psc-born", "{name}, born {born} ({kind})", {
    name: psc.name,
    born: monthAndYear,
    kind: kindText(psc.kind),
  });
}

function renderPscChoices(chosenName) {
  const holder = document.getElementById("pscChoices");
  holder.replaceChildren();
  const current = pscs.filter(nameable);
  // A link names the PSC by name; a name two current PSCs share chooses neither, and the reader chooses.
  const named = chosenName ? current.filter((psc) => psc.name === chosenName) : [];
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
    input.addEventListener("change", showChosenPsc);
    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = pscLabel(psc);
    choice.append(input, label);
    holder.appendChild(choice);
  });
  showChosenPsc();
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
      window.siteText(
        "ch.change-psc.lookup-failed",
        "Could not read this company's persons with significant control from Companies House.",
      ),
    );
  } finally {
    hideLoading();
  }
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

// The natures of control the reader gave, followed by those held otherwise, which are kept.
function chosenControls(psc) {
  const shares = document.querySelector('input[name="shares"]:checked').value;
  const votes = document.querySelector('input[name="votes"]:checked').value;
  return [
    shares && `OWNERSHIPOFSHARES_${shares}`,
    votes && `VOTINGRIGHTS_${votes}`,
    document.getElementById("directors").checked && "RIGHTTOAPPOINTANDREMOVEDIRECTORS",
    document.getElementById("influence").checked && "SIGINFLUENCECONTROL",
    ...heldOtherwise(psc),
  ].filter(Boolean);
}

// The address inputs of the service or principal office address, and of the residential address.
const ADDRESS_INPUTS = {
  address: {
    premise: "premise",
    street: "street",
    thoroughfare: "thoroughfare",
    postTown: "postTown",
    county: "county",
    postcode: "postcode",
    country: "country",
    other: "otherForeignCountry",
  },
  residence: {
    premise: "resPremise",
    street: "resStreet",
    thoroughfare: "resThoroughfare",
    postTown: "resPostTown",
    county: "resCounty",
    postcode: "resPostcode",
    country: "resCountry",
    other: "resOtherForeignCountry",
  },
};

const inputValue = (id) => document.getElementById(id).value.trim();
const isChecked = (id) => document.getElementById(id).checked;

function chosenAddress(inputs) {
  const address = {};
  ["premise", "street", "thoroughfare", "postTown", "county", "postcode"].forEach((part) => {
    address[part] = inputValue(inputs[part]);
  });
  const country = document.getElementById(inputs.country).value;
  if (country === "OTHER") address.otherForeignCountry = inputValue(inputs.other);
  else address.country = country;
  return Object.fromEntries(Object.entries(address).filter(([, part]) => part));
}

const addressComplete = (address) => Boolean(address.premise && address.postTown && (address.country || address.otherForeignCountry));

// What the reader ticked as changed: each a section of the form, offered for some kinds of PSC.
const CHANGES = [
  { box: "changeControl", section: "controlSection" },
  { box: "changeAddress", section: "addressSection" },
  { box: "changeName", section: "nameSection" },
  { box: "changeResidence", section: "residenceSection", individualOnly: true },
  { box: "changeNationality", section: "nationalitySection", individualOnly: true },
  { box: "changeCountryOfResidence", section: "countryOfResidenceSection", individualOnly: true },
  { box: "changeLegal", section: "legalSection", entityOnly: true },
];

function offeredFor(change, psc) {
  const individual = !psc || psc.kind === INDIVIDUAL;
  return !(change.individualOnly && !individual) && !(change.entityOnly && individual);
}

const ticked = (psc) => new Set(CHANGES.filter((change) => offeredFor(change, psc) && isChecked(change.box)).map((change) => change.box));

function chosenName(psc) {
  if (psc.kind !== INDIVIDUAL) return inputValue("newEntityName");
  const name = {
    title: inputValue("newTitle"),
    forename: inputValue("newForename"),
    otherForenames: inputValue("newOtherForenames"),
    surname: inputValue("newSurname"),
  };
  return Object.fromEntries(Object.entries(name).filter(([, part]) => part));
}

function chosenIdentification(psc) {
  const fields = [
    "legalForm",
    "lawGoverned",
    ...(psc.kind === "corporate-entity-person-with-significant-control" ? ["placeRegistered", "registrationNumber", "countryOrState"] : []),
  ];
  return Object.fromEntries(fields.map((field) => [field, inputValue(field)]).filter(([, part]) => part));
}

const chosenResidence = () => (isChecked("sameAsService") ? { sameAsServiceAddress: true } : chosenAddress(ADDRESS_INPUTS.residence));

// The form's change fields for what was ticked.
function chosenChanges(psc, boxes) {
  return {
    ...(boxes.has("changeControl") ? { naturesOfControl: chosenControls(psc) } : {}),
    ...(boxes.has("changeAddress") ? { address: chosenAddress(ADDRESS_INPUTS.address) } : {}),
    ...(boxes.has("changeName") ? { newName: chosenName(psc) } : {}),
    ...(boxes.has("changeResidence") ? { residentialAddress: chosenResidence() } : {}),
    ...(boxes.has("changeNationality") ? { nationality: inputValue("newNationality") } : {}),
    ...(boxes.has("changeCountryOfResidence") ? { countryOfResidence: inputValue("newCountryOfResidence") } : {}),
    ...(boxes.has("changeLegal") ? { identification: chosenIdentification(psc) } : {}),
  };
}

function controlProblem(psc) {
  const direct = chosenControls(psc).filter(isDirect);
  if (direct.length === 0 && heldOtherwise(psc).length === 0) {
    return window.siteText("ch.change-psc.control-needed", "Choose at least one way the person controls the company.");
  }
  if (direct.includes("SIGINFLUENCECONTROL") && direct.length > 1) {
    return window.siteText(
      "ch.change-psc.influence-alone",
      "Choose significant influence or control only if none of the other ways applies.",
    );
  }
  return null;
}

function legalProblem(identification) {
  if (!identification.legalForm || !identification.lawGoverned) {
    return window.siteText("ch.change-psc.legal-needed", "Give the legal form and the governing law.");
  }
  if (identification.placeRegistered && !identification.registrationNumber) {
    return window.siteText("ch.change-psc.registration-needed", "Give the registration number in the register named.");
  }
  return null;
}

// The reason the changes cannot be filed, in the reader's words, or null.
function changeProblem(psc, boxes, changes) {
  if (boxes.has("changeControl")) {
    const problem = controlProblem(psc);
    if (problem) return problem;
  }
  if (changes.address && !addressComplete(changes.address)) {
    return window.siteText(
      "ch.change-psc.address-needed",
      "Give the new address's building name or number, its post town and its country.",
    );
  }
  if (changes.newName !== undefined && (psc.kind === INDIVIDUAL ? !changes.newName.surname : !changes.newName)) {
    return window.siteText("ch.change-psc.name-needed", "Give the new name.");
  }
  if (changes.residentialAddress && !changes.residentialAddress.sameAsServiceAddress && !addressComplete(changes.residentialAddress)) {
    return window.siteText(
      "ch.change-psc.residence-needed",
      "Give the new usual residential address's building name or number, its post town and its country.",
    );
  }
  if (changes.nationality === "") return window.siteText("ch.change-psc.nationality-needed", "Give the new nationality.");
  if (changes.countryOfResidence === "")
    return window.siteText("ch.change-psc.residence-country-needed", "Give the new country or state of residence.");
  return changes.identification ? legalProblem(changes.identification) : null;
}

function handleChangeSubmit(event) {
  event.preventDefault();
  const psc = chosenPsc();
  if (!psc) {
    showError(window.siteText("ch.change-psc.choose-psc", "Choose the person with significant control whose details have changed."));
    return;
  }
  const boxes = ticked(psc);
  if (boxes.size === 0) {
    showError(window.siteText("ch.change-psc.choose-change", "Choose what has changed."));
    return;
  }
  const changes = chosenChanges(psc, boxes);
  const problem = changeProblem(psc, boxes, changes);
  if (problem) {
    showError(problem);
    return;
  }
  if (!window.formErrors.requireFields(["dateOfChange", "confirmationDate", "companyAuthCode"])) return;
  const dateOfChange = document.getElementById("dateOfChange").value;
  const confirmationDate = document.getElementById("confirmationDate").value;
  const today = window.companiesHouseLabels.todayInTheUnitedKingdom();
  if (dateOfChange > today) {
    showError(window.siteText("ch.change-psc.change-after-today", "The date of change cannot be after today."));
    return;
  }
  if (confirmationDate > today) {
    showError(window.siteText("ch.change-psc.confirmation-after-today", "The date of confirmation cannot be after today."));
    return;
  }
  if (confirmationDate < dateOfChange) {
    showError(window.siteText("ch.change-psc.confirmation-before", "The date of confirmation cannot be before the date of change."));
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
      ...changes,
      dateOfChange,
      confirmationDate,
    },
  };
  renderReview();
  showView("reviewView");
}

// One nature of control code in the reader's words.
function controlText(code) {
  const holding = code.endsWith("_AS_TRUST") ? "_AS_TRUST" : code.endsWith("_AS_FIRM") ? "_AS_FIRM" : "";
  const base = code.slice(0, code.length - holding.length);
  const bandText = {
    "25TO50PERCENT": window.siteText("ch.change-psc.band-25", "more than 25% but not more than 50%"),
    "50TO75PERCENT": window.siteText("ch.change-psc.band-50", "more than 50% but less than 75%"),
    "75TO100PERCENT": window.siteText("ch.change-psc.band-75", "75% or more"),
  };
  let text;
  if (base.startsWith("OWNERSHIPOFSHARES_")) {
    text = window.siteText("ch.change-psc.shares", "Shares: {band}", { band: bandText[base.slice(18)] });
  } else if (base.startsWith("VOTINGRIGHTS_")) {
    text = window.siteText("ch.change-psc.votes", "Voting rights: {band}", { band: bandText[base.slice(13)] });
  } else if (base === "RIGHTTOAPPOINTANDREMOVEDIRECTORS") {
    text = window.siteText("ch.change-psc.directors", "The right to appoint or remove a majority of the board of directors");
  } else {
    text = window.siteText("ch.change-psc.influence", "Significant influence or control");
  }
  if (holding === "_AS_TRUST") return window.siteText("ch.change-psc.as-trust", "{control}, through a trust", { control: text });
  if (holding === "_AS_FIRM") return window.siteText("ch.change-psc.as-firm", "{control}, through a firm", { control: text });
  return text;
}

function countryText(address) {
  if (address.otherForeignCountry) return address.otherForeignCountry;
  return document.querySelector(`#country option[value="${address.country}"]`).textContent;
}

const addressText = (address) =>
  [address.premise, address.street, address.thoroughfare, address.postTown, address.county, address.postcode, countryText(address)]
    .filter(Boolean)
    .join(", ");

const legendText = (sectionId) => document.querySelector(`#${sectionId} legend`).textContent.trim();

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  const { form } = filing;
  const rows = [
    [window.siteText("ch.change-psc.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.change-psc.review-psc", "Person with significant control"), pscLabel(filing.psc)],
  ];
  if (form.naturesOfControl) {
    rows.push([window.siteText("ch.change-psc.review-control", "How they control the company"), form.naturesOfControl.map(controlText)]);
  }
  if (form.address) rows.push([document.getElementById("addressLegend").textContent, addressText(form.address)]);
  if (form.newName !== undefined) {
    const name = form.newName;
    const nameText =
      typeof name === "string" ? name : [name.title, name.forename, name.otherForenames, name.surname].filter(Boolean).join(" ");
    rows.push([legendText("nameSection"), nameText]);
  }
  if (form.residentialAddress) {
    const residence = form.residentialAddress;
    rows.push([
      legendText("residenceSection"),
      residence.sameAsServiceAddress ? document.querySelector('label[for="sameAsService"]').textContent.trim() : addressText(residence),
    ]);
  }
  if (form.nationality) rows.push([legendText("nationalitySection"), form.nationality]);
  if (form.countryOfResidence) rows.push([legendText("countryOfResidenceSection"), form.countryOfResidence]);
  if (form.identification) {
    const id = form.identification;
    const parts = [
      [document.querySelector('label[for="legalForm"]').textContent, id.legalForm],
      [document.querySelector('label[for="lawGoverned"]').textContent, id.lawGoverned],
      [document.querySelector('label[for="placeRegistered"]').textContent, id.placeRegistered],
      [document.querySelector('label[for="countryOrState"]').textContent, id.countryOrState],
      [document.querySelector('label[for="registrationNumber"]').textContent, id.registrationNumber],
    ];
    // A field's label without its "(optional)".
    const shortLabel = (label) => {
      const text = label.trim();
      const cut = text.lastIndexOf(" (");
      return text.endsWith(")") && cut > 0 ? text.slice(0, cut) : text;
    };
    rows.push([legendText("legalSection"), parts.filter(([, value]) => value).map(([label, value]) => `${shortLabel(label)}: ${value}`)]);
  }
  rows.push(
    [window.siteText("ch.change-psc.review-changed", "Date of change"), formatDate(form.dateOfChange)],
    [window.siteText("ch.change-psc.review-confirmed", "Date of confirmation"), formatDate(form.confirmationDate)],
  );
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (Array.isArray(value)) {
      const items = document.createElement("ul");
      value.forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        items.appendChild(item);
      });
      dd.appendChild(items);
    } else {
      dd.textContent = value;
    }
    list.append(dt, dd);
  });
}

// The usual residential address is on no page once it is sent: the review and its inputs are cleared.
function forgetResidence() {
  document.getElementById("reviewList").replaceChildren();
  Object.values(ADDRESS_INPUTS.residence).forEach((id) => {
    const input = document.getElementById(id);
    input.value = input.tagName === "SELECT" ? "GBR" : "";
  });
  document.getElementById("sameAsService").checked = false;
}

async function handleFile() {
  const scenario = document.getElementById("govTestScenario").value.trim();
  const headers = scenario ? { "Gov-Test-Scenario": scenario } : {};
  const form = filing.form;
  filing = null;
  forgetResidence();
  showView("resultView");
  showLoading();
  try {
    await window.companiesHouseFormPage.fileAndShowOutcome({
      kind: FORM_KIND,
      form,
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
  document.getElementById("changeForm").reset();
  showSections();
  document.getElementById("filingResult").replaceChildren();
  showView("companyView");
}

// Show the changes offered for the chosen PSC's kind, the section of each one ticked, and the parts
// within a section that depend on the kind or on another answer.
function showSections() {
  const psc = chosenPsc();
  const show = (id, shown) => {
    document.getElementById(id).style.display = shown ? "block" : "none";
  };
  document.querySelectorAll("[data-for]").forEach((choice) => {
    const forIndividual = choice.dataset.for === "individual";
    choice.style.display = !psc || (psc.kind === INDIVIDUAL) === forIndividual ? "" : "none";
  });
  CHANGES.forEach((change) => show(change.section, offeredFor(change, psc) && isChecked(change.box)));
  show("individualName", !psc || psc.kind === INDIVIDUAL);
  show("entityName", Boolean(psc) && psc.kind !== INDIVIDUAL);
  show("registerFields", psc?.kind === "corporate-entity-person-with-significant-control");
  show("residenceFields", !isChecked("sameAsService"));
  show("otherCountryGroup", document.getElementById("country").value === "OTHER");
  show("resOtherCountryGroup", document.getElementById("resCountry").value === "OTHER");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("changeForm").addEventListener("submit", handleChangeSubmit);
document.getElementById("changeForm").addEventListener("change", showSections);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
