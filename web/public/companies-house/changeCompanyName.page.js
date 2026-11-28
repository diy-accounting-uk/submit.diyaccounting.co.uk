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
// What the filer pays this site for each service, before the filing is sent: the change-company-name
// activity's [[activities.prices]] amounts in submit.catalogue.toml (Companies House's fee and the
// card charge). Keep both in step with those rows.
const PRICE = { standard: "£24.69", sameDay: "£104.12" };
// The non-secret parts of a filing a return from the Stripe checkout resumes: the company, the new
// name, the resolution date and the service. The authentication code and the letter are never stored,
// so the reader gives them again.
const CHECKOUT_RESUME_KEY = "companiesHouseChangeOfNameResume";

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
  // One refusal at a time: the answer just refused replaces the one refused before.
  window.hideStatus?.();
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

// The letter the reader chose, and the words of a choice as the page shows them.
function letterKind() {
  return document.querySelector('input[name="letterKind"]:checked').value;
}

function letterKindText(value) {
  const choice = document.querySelector(`input[name="letterKind"][value="${value}"]`);
  return document.querySelector(`label[for="${choice.id}"]`).textContent.trim().replace(/\s+/g, " ");
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
  const lettered = document.getElementById("needsLetter").checked && letterKind() === "same-as-no-objection";
  if (holder && !lettered) {
    document.getElementById("needsLetter").checked = true;
    document.querySelector('input[name="letterKind"][value="same-as-no-objection"]').checked = true;
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
        kind: letterKind(),
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
      ? window.siteText("ch.name.service-same-day-paid", "Same-day service: Companies House's fee £{fee}, you pay {price}", {
          fee: FEE.sameDay,
          price: PRICE.sameDay,
        })
      : window.siteText("ch.name.service-standard-paid", "Standard service: Companies House's fee £{fee}, you pay {price}", {
          fee: FEE.standard,
          price: PRICE.standard,
        }),
  ]);
  rows.push([
    window.siteText("ch.name.review-letter", "Supporting letter"),
    filing.letter
      ? window.siteText("ch.name.letter-summary", "{kind}: {file}", {
          kind: letterKindText(filing.letter.kind),
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
  // Without a pass the route refuses the filing, so send nothing and keep the answers on the page.
  if ((await window.EntitlementStatus?.activityBundleHeld()) === false) {
    window.EntitlementStatus.showPassNeeded("companiesHouse");
    return;
  }
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
    await window.companiesHouseFormPage.fileAndShowOutcome({
      kind: FORM_KIND,
      form,
      result: document.getElementById("filingResult"),
      headers,
      onPaymentRequired: (due) => startCheckout(due, form),
      onSettled: async (outcome) => {
        if (outcome.statusCode === "ACCEPT") await showRegisterNow();
      },
    });
  } finally {
    hideLoading();
  }
}

// Opens the Stripe checkout for the fee of the service the filing asks for. The checkout is a full
// page navigation, so the filing's non-secret parts go into session storage for the return.
async function startCheckout(due, form) {
  const result = document.getElementById("filingResult");
  try {
    const response = await window.fetchWithIdToken("/api/v1/billing/activity-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activityId: due.activityId,
        subjectKey: due.subjectKey,
        priceKey: due.priceKey,
        returnTo: `${window.location.origin}${window.location.pathname}`,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.checkoutUrl) throw new Error(body.message || `status ${response.status}`);
    sessionStorage.setItem(
      CHECKOUT_RESUME_KEY,
      JSON.stringify({
        companyNumber: form.companyNumber,
        proposedName: form.proposedName,
        meetingDate: form.meetingDate || "",
        sameDay: form.sameDay === true,
      }),
    );
    result.replaceChildren(window.siteText("ch.name.paying", "Taking you to pay the fee before the filing is sent..."));
    window.location.href = body.checkoutUrl;
  } catch (error) {
    console.error("Could not start the payment for the change of name:", error);
    const p = document.createElement("p");
    p.className = "error-message";
    p.textContent = window.siteText("ch.name.payment-failed", "Could not start the payment: {reason}", { reason: error.message });
    result.replaceChildren(p);
  }
}

// A return from the Stripe checkout lands here as a fresh page load: it looks the company up again
// and puts back the new name, the date and the service, for the reader to give the code (and the
// letter, where the name needs one) and file.
async function resumeAfterCheckout() {
  const params = new URLSearchParams(window.location.search);
  const checkoutResult = params.get("checkout");
  if (!checkoutResult) return;
  const url = new URL(window.location);
  url.searchParams.delete("checkout");
  url.searchParams.delete("session_id");
  window.history.replaceState({}, "", url);
  const saved = sessionStorage.getItem(CHECKOUT_RESUME_KEY);
  sessionStorage.removeItem(CHECKOUT_RESUME_KEY);
  if (checkoutResult !== "success") {
    showError(window.siteText("ch.name.payment-not-completed", "The payment was not completed. Nothing was filed."));
    return;
  }
  if (!saved) return;
  const resumed = JSON.parse(saved);
  document.getElementById("companyNumber").value = resumed.companyNumber;
  await handleCompanySubmit(new Event("submit"));
  if (!company) return;
  document.getElementById("proposedName").value = resumed.proposedName;
  document.getElementById("meetingDate").value = resumed.meetingDate;
  document.getElementById("sameDay").checked = resumed.sameDay;
  if (window.showStatus) {
    window.showStatus(
      window.siteText(
        "ch.name.payment-received",
        "Payment received for this change of name. Give the company authentication code again, and the letter if the name needs one, then file.",
      ),
      "success",
    );
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
if (window.__submitReady__) {
  resumeAfterCheckout();
} else {
  document.addEventListener("submit-ready", resumeAfterCheckout, { once: true });
}
