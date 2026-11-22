// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Tell Companies House where the company keeps its records: companyView -> formView -> reviewView ->
// resultView. One page files three notices. The address of the inspection location is the SailAddress
// form; records moved to it, or back to the registered office, are the RecordChangeOfLocation form.
// A link from the company lookup names the notice in ?change=.

const CHANGES = {
  "sail": { kind: "sail-address" },
  "to-sail": { kind: "record-location", destination: "sail" },
  "to-office": { kind: "record-location", destination: "registered-office" },
};

// The countries an inspection location may be in, by where the company is registered. England and
// Wales are one part of the United Kingdom, so a Welsh company's location may be in either.
const COUNTRIES_BY_JURISDICTION = {
  "england-wales": ["GB-ENG", "GB-WLS"],
  "wales": ["GB-ENG", "GB-WLS"],
  "scotland": ["GB-SCT"],
  "northern-ireland": ["GB-NIR"],
};

// The address fields, by the name the filing route reads each under.
const ADDRESS_INPUTS = {
  premise: "sailPremise",
  street: "sailStreet",
  thoroughfare: "sailThoroughfare",
  postTown: "sailPostTown",
  county: "sailCounty",
  postcode: "sailPostcode",
  careOfName: "sailCareOf",
  poBox: "sailPoBox",
};

let company = null;
let filing = null;

// The records, in the words and the order of form AD03's list, each under the gateway's code for it. Copies of
// charge instruments have one code for a company registered in Scotland and one for any other.
function recordLabels() {
  const charges = company && company.jurisdiction === "scotland" ? "CHARGESC" : "CHARGEEWNI";
  return [
    ["MEMBER", window.siteText("ch.records.record-members", "Register of members")],
    ["DIRCONTRACT", window.siteText("ch.records.record-service-contracts", "Directors’ service contracts")],
    ["DIRINDEM", window.siteText("ch.records.record-indemnities", "Directors’ indemnities")],
    ["RESMEET", window.siteText("ch.records.record-resolutions", "Records of resolutions etc.")],
    ["OWNSHRPURCH", window.siteText("ch.records.record-own-shares", "Contracts relating to purchase of own shares")],
    [
      "OWNSHRCAP",
      window.siteText(
        "ch.records.record-capital",
        "Documents relating to redemption or purchase of own share out of capital by private company",
      ),
    ],
    ["DEB", window.siteText("ch.records.record-debentures", "Register of debenture holders")],
    [
      "INVEST",
      window.siteText(
        "ch.records.record-investigation",
        "Report to members of outcome of investigation by public company into interests in its shares",
      ),
    ],
    ["INTEREST", window.siteText("ch.records.record-interests", "Register of interests in shares disclosed to public company")],
    [charges, window.siteText("ch.records.record-charges", "Copies of instruments creating and amending charges")],
  ];
}

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

function chosenChange() {
  return document.querySelector('input[name="change"]:checked').value;
}

function renderRecordChoices() {
  const holder = document.getElementById("recordChoices");
  holder.replaceChildren();
  recordLabels().forEach(([code, label]) => {
    const choice = document.createElement("div");
    choice.className = "choice";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "record";
    input.id = `record-${code}`;
    input.value = code;
    const text = document.createElement("label");
    text.htmlFor = input.id;
    text.textContent = label;
    choice.append(input, text);
    holder.appendChild(choice);
  });
}

function renderCountries() {
  const allowed = COUNTRIES_BY_JURISDICTION[company.jurisdiction];
  const select = document.getElementById("sailCountry");
  Array.from(select.options).forEach((option) => {
    option.hidden = Boolean(allowed) && !allowed.includes(option.value);
    option.disabled = option.hidden;
  });
  if (allowed && !allowed.includes(select.value)) select.value = allowed[0];
}

// Shows the fields the chosen notice has and hides the rest.
function syncChange() {
  const change = chosenChange();
  const removing = change === "to-office" && document.getElementById("removeSail").checked;
  document.getElementById("addressFields").style.display = change === "sail" ? "block" : "none";
  document.getElementById("recordFields").style.display = change === "sail" ? "none" : "block";
  document.getElementById("removeSailChoice").style.display = change === "to-office" ? "block" : "none";
  document.getElementById("recordChoices").style.display = removing ? "none" : "block";
  document.getElementById("records-hint").style.display = removing ? "none" : "block";
  document.getElementById("recordsLegend").textContent =
    change === "to-office"
      ? window.siteText("ch.records.legend-office", "Records now kept at the registered office")
      : window.siteText("ch.records.legend-sail", "Records now kept at the inspection location");
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  showLoading();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber, companyName: profile.companyName, jurisdiction: profile.jurisdiction };
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    const asked = new URLSearchParams(window.location.search).get("change");
    if (CHANGES[asked]) document.getElementById(`change-${asked}`).checked = true;
    renderRecordChoices();
    renderCountries();
    syncChange();
    showView("formView");
  } catch (error) {
    console.error("Could not read the company from Companies House:", error);
    showError(window.siteText("ch.records.lookup-failed", "Could not read this company from Companies House."));
  } finally {
    hideLoading();
  }
}

function addressOf() {
  const address = { country: document.getElementById("sailCountry").value };
  Object.entries(ADDRESS_INPUTS).forEach(([field, id]) => {
    const value = document.getElementById(id).value.trim();
    if (value) address[field] = value;
  });
  return address;
}

// The notice's own fields, as its filing route reads them, or null after saying what is missing.
function changeFields(change) {
  if (change === "sail") {
    if (!window.formErrors.requireFields(["sailPremise", "sailPostTown"])) return null;
    return { address: addressOf() };
  }
  const { destination } = CHANGES[change];
  if (change === "to-office" && document.getElementById("removeSail").checked) return { destination, removeSailAddress: true };
  const records = Array.from(document.querySelectorAll('#recordChoices input[name="record"]:checked')).map((input) => input.value);
  if (records.length === 0) {
    showError(window.siteText("ch.records.choose-record", "Tick at least one record that has moved."));
    return null;
  }
  return { destination, records };
}

function handleRecordsSubmit(event) {
  event.preventDefault();
  const change = chosenChange();
  const fields = changeFields(change);
  if (!fields) return;
  if (!window.formErrors.requireFields(["companyAuthCode"])) return;
  filing = {
    change,
    kind: CHANGES[change].kind,
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: document.getElementById("companyAuthCode").value.trim(),
      dateSigned: new Date().toISOString().slice(0, 10),
      ...fields,
    },
  };
  renderReview();
  showView("reviewView");
}

function changeText(change) {
  if (change === "sail") return window.siteText("ch.records.review-sail", "The address of the inspection location (form AD02)");
  if (change === "to-sail")
    return window.siteText("ch.records.review-to-sail", "Records are now kept at the inspection location (form AD03)");
  return window.siteText("ch.records.review-to-office", "Records are now kept at the registered office (form AD04)");
}

function reviewRows() {
  const rows = [
    [window.siteText("ch.records.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.records.review-notice", "Notice"), changeText(filing.change)],
  ];
  const { address, records, removeSailAddress } = filing.form;
  if (address) {
    const country = document.querySelector(`#sailCountry option[value="${address.country}"]`).textContent;
    const parts = ["careOfName", "poBox", "premise", "street", "thoroughfare", "postTown", "county"].map((field) => address[field]);
    rows.push([
      window.siteText("ch.records.review-address", "Inspection location"),
      [...parts, country, address.postcode].filter(Boolean).join(", "),
    ]);
  } else if (removeSailAddress) {
    rows.push([
      window.siteText("ch.records.review-records", "Records"),
      window.siteText(
        "ch.records.review-all-back",
        "Every record is back at the registered office, and the inspection location comes off the register",
      ),
    ]);
  } else {
    const labels = new Map(recordLabels());
    rows.push([window.siteText("ch.records.review-records", "Records"), records.map((code) => labels.get(code)).join("; ")]);
  }
  return rows;
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  reviewRows().forEach(([label, value]) => {
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
      kind: filing.kind,
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
  document.getElementById("recordsForm").reset();
  document.getElementById("filingResult").replaceChildren();
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("recordsForm").addEventListener("submit", handleRecordsSubmit);
document.querySelectorAll('input[name="change"]').forEach((input) => input.addEventListener("change", syncChange));
document.getElementById("removeSail").addEventListener("change", syncChange);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
