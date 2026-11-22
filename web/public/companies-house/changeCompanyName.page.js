// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Change the company name: companyView -> formView -> reviewView -> resultView. The reader gives the
// new name, how the company changed it, the date of the resolution, whether to ask for the same-day
// service and, where the name needs one, a letter as a PDF, which travels with the form and is held
// only in this page until it is sent. After Companies House accepts the filing the page reads the
// profile again and shows the name the register holds.

const FORM_KIND = "change-of-name";
const MAX_LETTER_BYTES = 3000000;
// Companies House's fee by software, in pounds.
const FEE = { standard: 20, sameDay: 85 };

let company = null;
let filing = null;

function showView(name) {
  // A message belongs to the view it was shown on: a refusal fixed on the form is not shown above the review.
  window.hideStatus?.();
  ["companyView", "formView", "reviewView", "resultView"].forEach((id) => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}

// The refusals the route names by id, in the reader's words.
const NAME_MESSAGES = {
  "ch.name.name-characters": () =>
    window.siteText(
      "ch.name.name-characters",
      "The new name must be 3 to 160 characters, using only letters, numbers, spaces and the punctuation Companies House allows in a company name.",
    ),
};
window.companiesHouseFormPage.registerMessages(NAME_MESSAGES);

function showError(text) {
  if (window.showStatus) window.showStatus(text, "error");
}

const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  showLoading();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = {
      companyNumber,
      companyName: profile.companyName,
      registeredInWales: window.companiesHouseCompanyName.isRegisteredInWales(profile.jurisdiction),
    };
    document.getElementById("walesNote").style.display = company.registeredInWales ? "block" : "none";
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    showView("formView");
  } catch (error) {
    console.error("Could not read the company:", error);
    showError(window.siteText("ch.name.lookup-failed", "Could not read this company from Companies House."));
  } finally {
    hideLoading();
  }
}

function updateLetter() {
  document.getElementById("letterGroup").style.display = document.getElementById("needsLetter").checked ? "block" : "none";
}

function optionText(selectId, value) {
  return document.querySelector(`#${selectId} option[value="${value}"]`).textContent.trim().replace(/\s+/g, " ");
}

// The register's search for each proposed name, made once per name: the lookup counts in the
// account's share of Companies House calls.
const sameNameLookups = new Map();

/**
 * Another company the register lists with the proposed name, or null. A search that fails finds none,
 * so the filing is not held up by it.
 * @param {string} proposedName
 */
function companyWithSameName(proposedName) {
  if (!sameNameLookups.has(proposedName)) {
    sameNameLookups.set(
      proposedName,
      window
        .searchCompanies(proposedName, { itemsPerPage: 20 })
        .then(
          (answer) =>
            (answer.items || []).find(
              (item) =>
                item.companyNumber !== company.companyNumber &&
                window.companiesHouseCompanyName.sameAsKey(item.title) === window.companiesHouseCompanyName.sameAsKey(proposedName),
            ) || null,
        )
        .catch((error) => {
          console.warn("Could not look the new name up on the register:", error);
          return null;
        }),
    );
  }
  return sameNameLookups.get(proposedName);
}

// The letter's bytes as base64, read in the page. Rejects for a file that is not a PDF or is too large.
async function readLetter(file) {
  if (file.size > MAX_LETTER_BYTES) throw new Error("too-large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") throw new Error("not-pdf");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function handleChangeSubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["proposedName", "companyAuthCode"])) return;
  const proposedName = document.getElementById("proposedName").value.trim().replace(/\s+/g, " ").toUpperCase();
  if (!window.companiesHouseCompanyName.isValidProposedCompanyName(proposedName)) {
    showError(NAME_MESSAGES["ch.name.name-characters"]());
    return;
  }
  if (proposedName === company.companyName.trim().toUpperCase()) {
    showError(window.siteText("ch.name.same-name", "The new name is the name the company already has."));
    return;
  }
  const holder = await companyWithSameName(proposedName);
  const lettered = document.getElementById("needsLetter").checked && document.getElementById("letterKind").value === "same-as-no-objection";
  if (holder && !lettered) {
    document.getElementById("needsLetter").checked = true;
    document.getElementById("letterKind").value = "same-as-no-objection";
    updateLetter();
    showError(
      window.siteText(
        "ch.name.same-as",
        "Companies House lists {name} ({number}) with this name. A company can take a name another company holds only with that company's written confirmation that it has no objection: attach that letter, or choose another name.",
        { name: holder.title, number: holder.companyNumber },
      ),
    );
    return;
  }
  // The only way this site files a change of name: GOV.UK files changes by special resolution only.
  const method = "resolution";
  const today = window.companiesHouseFormPage.todayInLondon();
  const meetingDate = document.getElementById("meetingDate").value;
  if (!meetingDate) {
    showError(window.siteText("ch.name.meeting-date-missing", "Give the date the resolution was passed."));
    return;
  }
  if (meetingDate > today) {
    showError(window.siteText("ch.name.meeting-date-future", "The date the resolution was passed cannot be in the future."));
    return;
  }
  let letter = null;
  if (document.getElementById("needsLetter").checked) {
    const file = document.getElementById("letterFile").files[0];
    if (!file) {
      showError(window.siteText("ch.name.letter-missing", "Choose the letter, as a PDF."));
      return;
    }
    try {
      letter = {
        kind: document.getElementById("letterKind").value,
        fileName: file.name,
        size: file.size,
        contentBase64: await readLetter(file),
      };
    } catch (error) {
      showError(
        error.message === "too-large"
          ? window.siteText("ch.name.letter-too-large", "The letter is larger than 3 MB.")
          : window.siteText("ch.name.letter-not-pdf", "The letter is not a PDF."),
      );
      return;
    }
  }
  if (!document.getElementById("noticeGiven").checked) {
    showError(window.siteText("ch.name.notice-missing", "Confirm that notice of the change of name has been given."));
    return;
  }
  const sameDay = document.getElementById("sameDay").checked;
  filing = {
    method,
    letter,
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: document.getElementById("companyAuthCode").value.trim(),
      dateSigned: today,
      method,
      proposedName,
      ...(meetingDate ? { meetingDate } : {}),
      sameDay,
      noticeGiven: true,
      ...(letter ? { supportingDocument: { kind: letter.kind, contentBase64: letter.contentBase64 } } : {}),
    },
  };
  renderReview();
  showNameEndingWarning();
  showView("reviewView");
}

// A name that ends in none of the words a limited company's name usually ends in is filed as given,
// with a warning: Companies House says "usually", and it decides.
function showNameEndingWarning() {
  const warning = document.getElementById("nameEndingWarning");
  const usual = window.companiesHouseCompanyName.hasUsualLimitedEnding(filing.form.proposedName, company);
  warning.textContent = usual
    ? ""
    : company.registeredInWales
      ? window.siteText(
          "ch.name.ending-warning-wales",
          "The new name does not end in LIMITED, LTD, CYFYNGEDIG or CYF. A private limited company's name usually must. Check it before you file.",
        )
      : window.siteText(
          "ch.name.ending-warning",
          "The new name does not end in LIMITED or LTD. A private limited company's name usually must. Check it before you file.",
        );
  warning.style.display = usual ? "none" : "block";
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const rows = [
    [window.siteText("ch.name.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.name.review-new-name", "New company name"), filing.form.proposedName],
    [
      window.siteText("ch.name.review-method", "How the company changed its name"),
      window.siteText("ch.name.method-resolution", "By a special resolution"),
    ],
  ];
  if (filing.form.meetingDate) {
    rows.push([window.siteText("ch.name.review-meeting-date", "Date the resolution was passed"), formatDate(filing.form.meetingDate)]);
  }
  rows.push([
    window.siteText("ch.name.review-service", "Service and Companies House's fee"),
    filing.form.sameDay
      ? window.siteText("ch.name.service-same-day", "Same-day service, £{fee}", { fee: FEE.sameDay })
      : window.siteText("ch.name.service-standard", "Standard service, £{fee}", { fee: FEE.standard }),
  ]);
  rows.push([
    window.siteText("ch.name.review-letter", "Supporting letter"),
    filing.letter
      ? window.siteText("ch.name.letter-summary", "{kind}: {file}", {
          kind: optionText("letterKind", filing.letter.kind),
          file: filing.letter.fileName,
        })
      : window.siteText("ch.name.no-letter", "None"),
  ]);
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  });
}

// After an accepted change, the name the register holds now, read again from the profile.
async function showRegisterNow() {
  const note = document.getElementById("registerNow");
  const companyLink = document.createElement("a");
  companyLink.href = `companySearch.html?companyNumber=${encodeURIComponent(company.companyNumber)}`;
  companyLink.textContent = window.siteText("ch.name.see-company", "See the company on the register");
  let text;
  try {
    const profile = await window.getCompanyProfile(company.companyNumber);
    text =
      (profile.companyName || "").trim().toUpperCase() === filing.form.proposedName
        ? window.siteText("ch.name.register-now", "The register now shows the company as {name}.", { name: profile.companyName })
        : window.siteText(
            "ch.name.register-not-yet",
            "The register still shows the company as {name}. The name changes when Companies House registers it, so look at the company again later.",
            { name: profile.companyName },
          );
  } catch (error) {
    console.error("Could not read the company profile after the change:", error);
    text = window.siteText("ch.name.register-unread", "Could not read the register again to show the new name.");
  }
  note.replaceChildren(text, " ", companyLink);
  note.style.display = "block";
}

async function handleFile() {
  const scenario = document.getElementById("govTestScenario").value.trim();
  const headers = scenario ? { "Gov-Test-Scenario": scenario } : {};
  document.getElementById("registerNow").style.display = "none";
  // The letter and the authentication code go into the filing and stay nowhere on the page.
  const form = filing.form;
  filing = { method: filing.method, form: { companyNumber: form.companyNumber, proposedName: form.proposedName } };
  document.getElementById("letterFile").value = "";
  document.getElementById("companyAuthCode").value = "";
  showView("resultView");
  showLoading();
  try {
    const outcome = await window.companiesHouseFormPage.fileAndShowOutcome({
      kind: FORM_KIND,
      form,
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
  filing = null;
  document.getElementById("changeForm").reset();
  updateLetter();
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
document.getElementById("needsLetter").addEventListener("change", updateLetter);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
