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
  ["companyView", "formView", "reviewView", "resultView"].forEach((id) => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}

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
    company = { companyNumber, companyName: profile.companyName };
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

function chosenMethod() {
  return document.querySelector('input[name="method"]:checked').value;
}

function updateMethod() {
  document.getElementById("meetingDateGroup").style.display = chosenMethod() === "resolution" ? "block" : "none";
}

function updateLetter() {
  document.getElementById("letterGroup").style.display = document.getElementById("needsLetter").checked ? "block" : "none";
}

function labelText(inputId) {
  return document.querySelector(`label[for="${inputId}"]`).textContent.trim().replace(/\s+/g, " ");
}

function optionText(selectId, value) {
  return document.querySelector(`#${selectId} option[value="${value}"]`).textContent.trim().replace(/\s+/g, " ");
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
  if (proposedName.length < 3 || proposedName.length > 160) {
    showError(window.siteText("ch.name.name-length", "The new name must be 3 to 160 characters."));
    return;
  }
  if (proposedName === company.companyName.trim().toUpperCase()) {
    showError(window.siteText("ch.name.same-name", "The new name is the name the company already has."));
    return;
  }
  const method = chosenMethod();
  const today = new Date().toISOString().slice(0, 10);
  const meetingDate = method === "resolution" ? document.getElementById("meetingDate").value : "";
  if (method === "resolution" && !meetingDate) {
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
  showView("reviewView");
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  const rows = [
    [window.siteText("ch.name.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [window.siteText("ch.name.review-new-name", "New company name"), filing.form.proposedName],
    [
      window.siteText("ch.name.review-method", "How the company changed its name"),
      labelText(filing.method === "resolution" ? "method-resolution" : "method-articles"),
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
  filing = null;
  document.getElementById("changeForm").reset();
  updateMethod();
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
document.querySelectorAll('input[name="method"]').forEach((input) => input.addEventListener("change", updateMethod));
document.getElementById("needsLetter").addEventListener("change", updateLetter);
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
