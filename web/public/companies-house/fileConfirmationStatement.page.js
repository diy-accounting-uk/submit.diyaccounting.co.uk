// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// File confirmation statement: companyView -> authView -> reviewView -> previewView ->
// resultView. No Companies House OAuth token: the filing goes through the XML Gateway with
// the operator's presenter credentials, so only the Cognito id token is needed to reach the
// API. Both the company authentication code and every director's personal code live only in
// this page's own variables - never in localStorage or sessionStorage - and are sent again on
// submit, the same rule the micro-entity accounts page follows for its own authentication code.

// Matches the activity id file-confirmation-statement carries in submit.catalogue.toml, and
// its [[activities.prices]] amount - keep both in step with that row if the price changes.
const CONFIRMATION_STATEMENT_ACTIVITY_ID = "file-confirmation-statement";
const CONFIRMATION_STATEMENT_FEE_DISPLAY = "£61.35";
// Non-secret: the company number a checkout redirect is resumed for. The company
// authentication code and every director's personal code are never written here - see the
// note above - so a return from checkout re-collects them through the normal authView step.
const CHECKOUT_RESUME_KEY = "companiesHouseConfirmationStatementResumeCompanyNumber";

// Companies House shows a personal code grouped with hyphens for readability but the XML
// Gateway takes 11 characters with none - a pasted code needs its hyphens stripped before
// the length or format check runs. A real code is 5 or 6 uppercase letters followed by 6 or
// 5 digits (e.g. CWMPS832223); the same check runs server side (companiesHouseApi.js's
// isValidCompaniesHousePersonalCode); it exists here too so a wrongly formatted code (e.g.
// letters and digits interleaved) is caught before a submit round trip.
const PERSONAL_CODE_PATTERN = /^(?=[A-Z0-9]{11}$)[A-Z]{5,6}\d{5,6}$/;

function normalisePersonalCode(rawValue) {
  return (rawValue || "").trim().toUpperCase().replace(/-/g, "");
}

function isValidPersonalCode(rawValue) {
  return PERSONAL_CODE_PATTERN.test(normalisePersonalCode(rawValue));
}

let company = null;
let companyAuthCode = "";
let filingData = null;
let originalSicCodes = [];
let originalStatementOfCapital = null;
let originalShareholdings = [];
let originalRegisteredEmailAddress = "";
let currentDirectors = [];
let currentOfficers = [];
let currentPscs = [];
let shareClassRowCount = 0;
let shareholdingRowCount = 0;

function views() {
  return {
    companyView: document.getElementById("companyView"),
    authView: document.getElementById("authView"),
    reviewView: document.getElementById("reviewView"),
    previewView: document.getElementById("previewView"),
    resultView: document.getElementById("resultView"),
  };
}

function showView(name) {
  const all = views();
  Object.keys(all).forEach((key) => {
    all[key].style.display = key === name ? "block" : "none";
  });
}

function element(tag, attributes = {}, ...children) {
  const created = document.createElement(tag);
  Object.entries(attributes).forEach(([name, value]) => created.setAttribute(name, value));
  created.append(...children);
  return created;
}

function textInput(id, value, extraAttributes = {}) {
  return element("input", { type: "text", id, value: value || "", ...extraAttributes });
}

function textOrDash(value) {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

function slugLabel(slug) {
  const words = String(slug).replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function slugOrDash(slug) {
  return slug === undefined || slug === null || slug === "" ? "-" : slugLabel(slug);
}

function officerDisplayName(officer) {
  if (officer.type === "corporate") {
    return officer.corporateName || officer.name || "";
  }
  return officer.name || [officer.forename, officer.surname].filter(Boolean).join(" ");
}

function tableRow(...cellTexts) {
  return element("tr", {}, ...cellTexts.map((text) => element("td", {}, text)));
}

function renderPublicOfficers(officers) {
  const body = document.getElementById("publicOfficersBody");
  body.replaceChildren(
    ...(officers || [])
      .filter((officer) => !officer.resignedOn)
      .map((officer) =>
        tableRow(
          officerDisplayName(officer),
          slugOrDash(officer.officerRole),
          textOrDash(officer.appointedOn),
          officer.identityVerificationDetails ? "Verified" : "Not verified",
        ),
      ),
  );
}

function renderPublicPscs(pscs) {
  const body = document.getElementById("publicPscsBody");
  body.replaceChildren(
    ...(pscs || [])
      .filter((psc) => !psc.ceasedOn)
      .map((psc) =>
        tableRow(textOrDash(psc.name), textOrDash((psc.naturesOfControl || []).map(slugLabel).join(", ")), textOrDash(psc.notifiedOn)),
      ),
  );
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  if (!companyNumber) {
    showStatus("Please enter a company number.", "error");
    return;
  }
  await lookUpCompany(companyNumber);
}

async function lookUpCompany(companyNumber) {
  showLoading();
  hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    if (profile.companyStatus !== "active" || profile.companyType !== "ltd") {
      showStatus("Only an active private company limited by shares can file a confirmation statement here.", "error");
      return;
    }

    const [officersResult, pscsResult] = await Promise.all([window.getOfficers(companyNumber), window.getPscs(companyNumber)]);

    company = profile;
    // Current officers' identity_verification_details, sent with the statement so the
    // builder can pick ConfirmationAndVerificationStatement-v1-0 or ConfirmationStatement-v1-3.
    currentOfficers = (officersResult.officers || []).filter((officer) => !officer.resignedOn);
    currentPscs = (pscsResult.pscs || []).filter((psc) => !psc.ceasedOn);
    document.getElementById("authCompanyName").textContent = company.companyName;
    document.getElementById("authCompanyNumber").textContent = company.companyNumber;
    document.getElementById("authNextDue").textContent = textOrDash(company.confirmationStatementNextDue);
    document.getElementById("authNextMadeUpTo").textContent = textOrDash(company.confirmationStatementNextMadeUpTo);
    renderPublicOfficers(officersResult.officers);
    renderPublicPscs(pscsResult.pscs);
    showView("authView");
  } catch (error) {
    console.error("Failed to look up the company:", error);
    showStatus(error.message || "Failed to look up the company.", "error");
  } finally {
    hideLoading();
  }
}

function buildShareClassRow(index, share = {}) {
  return element(
    "fieldset",
    { "class": "form-group", "data-share-class-row": index },
    element("legend", {}, `Share class ${index + 1}`),
    element("label", { for: `shareClass-${index}` }, "Share class"),
    textInput(`shareClass-${index}`, share.shareClass),
    element("label", { for: `prescribedParticulars-${index}` }, "Prescribed particulars"),
    textInput(`prescribedParticulars-${index}`, share.prescribedParticulars),
    element("label", { for: `numShares-${index}` }, "Number of shares"),
    element("input", { type: "number", id: `numShares-${index}`, step: "1", min: "0", value: share.numShares || "" }),
    element("label", { for: `aggregateNominalValue-${index}` }, "Aggregate nominal value"),
    element("p", { id: `aggregateNominalValue-${index}-money-hint`, class: "hint" }, "For example, 600 or 1,200.50"),
    element(
      "div",
      { class: "input-prefix" },
      element("span", { "class": "prefix", "data-share-currency-prefix": "", "style": "display: none" }),
      textInput(`aggregateNominalValue-${index}`, share.aggregateNominalValue, {
        "aria-describedby": `aggregateNominalValue-${index}-money-hint`,
        "inputmode": "decimal",
        "data-money": "pounds-and-pence",
        "data-money-min": "0",
      }),
    ),
    element("button", { type: "button", class: "btn-small remove-share-class-row" }, "Remove"),
  );
}

function syncShareCurrencyPrefixes() {
  const shareCurrency = document.getElementById("shareCurrency").value.trim();
  document.querySelectorAll("[data-share-currency-prefix]").forEach((prefix) => {
    prefix.textContent = shareCurrency;
    prefix.style.display = shareCurrency ? "" : "none";
  });
}

function addShareClassRow(share = {}) {
  const container = document.getElementById("shareClassesContainer");
  const index = shareClassRowCount++;
  container.append(buildShareClassRow(index, share));
  container.querySelector(`[data-share-class-row="${index}"] .remove-share-class-row`).addEventListener("click", (event) => {
    event.target.closest("[data-share-class-row]").remove();
  });
  syncShareCurrencyPrefixes();
}

const MAX_JOINT_HOLDERS_PER_SHAREHOLDING = 10;

function buildJointHolderRow(holdingIndex, shareholderIndex, shareholder = {}) {
  const address = shareholder.address || {};
  const suffix = `${holdingIndex}-${shareholderIndex}`;
  const fieldRows = [
    ["holderSurname", "Shareholder surname", shareholder.surname],
    ["holderForename", "Shareholder forename", shareholder.forename],
    ["holderAmalgamatedName", "Or amalgamated name (used instead of surname/forename)", shareholder.amalgamatedName],
    ["holderPremise", "Premise", address.premise],
    ["holderStreet", "Street", address.street],
    ["holderPostTown", "Post town", address.postTown],
    ["holderPostcode", "Postcode", address.postcode],
    ["holderCountry", "Country", address.country],
  ].flatMap(([idPrefix, labelText, value]) => [
    element("label", { for: `${idPrefix}-${suffix}` }, labelText),
    textInput(`${idPrefix}-${suffix}`, value),
  ]);
  return element(
    "fieldset",
    { "class": "form-group", "data-shareholder-row": suffix },
    element("legend", {}, `Joint holder ${shareholderIndex + 1}`),
    ...fieldRows,
    element(
      "button",
      { "type": "button", "class": "btn-small remove-joint-holder-row", "data-holding-index": holdingIndex },
      "Remove joint holder",
    ),
  );
}

function buildShareholdingRow(index, holding = {}) {
  const shareholders = holding.shareholders && holding.shareholders.length > 0 ? holding.shareholders : [{}];
  return element(
    "fieldset",
    { "class": "form-group", "data-shareholding-row": index },
    element("legend", {}, `Shareholding ${index + 1}`),
    element("label", { for: `holdingShareClass-${index}` }, "Share class"),
    textInput(`holdingShareClass-${index}`, holding.shareClass),
    element("label", { for: `holdingNumberHeld-${index}` }, "Number held"),
    element("input", { type: "number", id: `holdingNumberHeld-${index}`, step: "1", min: "0", value: holding.numberHeld || "" }),
    element(
      "p",
      { class: "hint" },
      `A holding held jointly carries every joint holder below, up to ${MAX_JOINT_HOLDERS_PER_SHAREHOLDING}.`,
    ),
    element(
      "div",
      { "class": "joint-holders-container", "data-holding-index": index },
      ...shareholders.map((shareholder, shareholderIndex) => buildJointHolderRow(index, shareholderIndex, shareholder)),
    ),
    element("button", { "type": "button", "class": "btn-small add-joint-holder-row", "data-holding-index": index }, "Add joint holder"),
    element("button", { type: "button", class: "btn-small remove-shareholding-row" }, "Remove shareholding"),
  );
}

function addShareholdingRow(holding = {}) {
  const container = document.getElementById("shareholdingsContainer");
  const index = shareholdingRowCount++;
  container.append(buildShareholdingRow(index, holding));
  container.querySelector(`[data-shareholding-row="${index}"] .remove-shareholding-row`).addEventListener("click", (event) => {
    event.target.closest("[data-shareholding-row]").remove();
  });
}

function buildDirectorRow(index, director) {
  return element(
    "fieldset",
    { "class": "form-group", "data-director-row": index },
    element("legend", {}, `${director.forename || ""} ${director.surname || ""} (${director.dob || "no date of birth on record"})`),
    element("label", { for: `directorOtherForenames-${index}` }, "Other forenames"),
    element(
      "p",
      { class: "hint" },
      "Every middle name on the register. Companies House matches the director by the full name - leaving one out rejects the filing.",
    ),
    textInput(`directorOtherForenames-${index}`, director.otherForenames, { spellcheck: "false" }),
    element("label", { for: `directorPersonalCode-${index}` }, "Companies House personal code"),
    textInput(`directorPersonalCode-${index}`, "", { maxlength: "13", spellcheck: "false" }),
    element("label", { for: `directorNameMismatchReason-${index}` }, "Name mismatch reason"),
    element("p", { class: "hint" }, "Only when the name this director verified under differs from the register name above."),
    textInput(`directorNameMismatchReason-${index}`, "", { spellcheck: "false" }),
  );
}

function renderDirectorRows(directors) {
  currentDirectors = directors;
  const container = document.getElementById("directorRowsContainer");
  container.replaceChildren(...directors.map((director, index) => buildDirectorRow(index, director)));
}

function renderShareClasses(shares) {
  document.getElementById("shareClassesContainer").replaceChildren();
  shareClassRowCount = 0;
  (shares || []).forEach((share) => addShareClassRow(share));
}

function renderShareholdings(shareholdings) {
  document.getElementById("shareholdingsContainer").replaceChildren();
  shareholdingRowCount = 0;
  (shareholdings || []).forEach((holding) => addShareholdingRow(holding));
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const enteredCode = document.getElementById("companyAuthCode").value.trim();
  if (enteredCode.length < 6 || enteredCode.length > 8) {
    showStatus("Enter the 6 to 8 character company authentication code.", "error");
    return;
  }
  const madeUpDate = company.confirmationStatementNextMadeUpTo;
  if (!madeUpDate) {
    showStatus("Companies House has not published a next confirmation statement date for this company.", "error");
    return;
  }

  showLoading();
  hideStatus();
  try {
    filingData = await window.getConfirmationStatementFilingData(company.companyNumber, {
      companyAuthCode: enteredCode,
      madeUpDate,
    });
    companyAuthCode = enteredCode;

    originalSicCodes = filingData.sicCodes || [];
    originalStatementOfCapital = filingData.statementOfCapital || null;
    originalShareholdings = filingData.shareholdings || [];
    originalRegisteredEmailAddress = filingData.registeredEmailAddress || "";

    document.getElementById("reviewDate").value = company.confirmationStatementNextMadeUpTo;
    document.getElementById("reviewDate").max = new Date().toISOString().slice(0, 10);
    document.getElementById("sicCodes").value = originalSicCodes.join(", ");
    document.getElementById("registeredEmailAddress").value = originalRegisteredEmailAddress;
    document.getElementById("totalAmountUnpaid").value = originalStatementOfCapital?.totalAmountUnpaid || "";
    document.getElementById("totalNumberOfIssuedShares").value = originalStatementOfCapital?.totalNumberOfIssuedShares || "";
    document.getElementById("shareCurrency").value = originalStatementOfCapital?.shareCurrency || "";
    document.getElementById("totalAggregateNominalValue").value = originalStatementOfCapital?.totalAggregateNominalValue || "";
    renderShareClasses(originalStatementOfCapital?.shares || []);
    syncShareCurrencyPrefixes();
    renderShareholdings(originalShareholdings);

    const currentDirectorOfficers = (filingData.officers || []).filter(
      (officer) => officer.role === "director" && !officer.resignationDate,
    );
    renderDirectorRows(currentDirectorOfficers);

    const feePaid = filingData.paymentPeriodPaid === true;
    document.getElementById("feeMessage").textContent = feePaid
      ? "No fee: this payment period is already paid."
      : "A fee applies for this payment period - the amount is shown before you submit.";

    showView("reviewView");
  } catch (error) {
    console.error("Failed to read the confirmation statement filing data:", error);
    showStatus(error.message || "Failed to read the confirmation statement filing data.", "error");
  } finally {
    hideLoading();
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readShareClasses() {
  return Array.from(document.querySelectorAll("[data-share-class-row]")).map((row) => {
    const index = row.getAttribute("data-share-class-row");
    return {
      shareClass: document.getElementById(`shareClass-${index}`).value.trim(),
      prescribedParticulars: document.getElementById(`prescribedParticulars-${index}`).value.trim(),
      numShares: Number(document.getElementById(`numShares-${index}`).value || 0),
      aggregateNominalValue: window.parseMoneyInput(document.getElementById(`aggregateNominalValue-${index}`).value) ?? 0,
    };
  });
}

function readStatementOfCapital() {
  const totalAmountUnpaid = document.getElementById("totalAmountUnpaid").value;
  const totalNumberOfIssuedShares = document.getElementById("totalNumberOfIssuedShares").value;
  const shareCurrency = document.getElementById("shareCurrency").value.trim();
  const totalAggregateNominalValue = document.getElementById("totalAggregateNominalValue").value;
  const shares = readShareClasses();
  if (!totalNumberOfIssuedShares && !shareCurrency && shares.length === 0) {
    return null;
  }
  return {
    totalAmountUnpaid: window.parseMoneyInput(totalAmountUnpaid) ?? 0,
    totalNumberOfIssuedShares: Number(totalNumberOfIssuedShares || 0),
    shareCurrency,
    totalAggregateNominalValue: window.parseMoneyInput(totalAggregateNominalValue) ?? 0,
    shares,
  };
}

function readJointHolders(holdingIndex) {
  return Array.from(document.querySelectorAll(`.joint-holders-container[data-holding-index="${holdingIndex}"] [data-shareholder-row]`)).map(
    (row) => {
      const suffix = row.getAttribute("data-shareholder-row");
      const amalgamatedName = document.getElementById(`holderAmalgamatedName-${suffix}`).value.trim();
      const surname = document.getElementById(`holderSurname-${suffix}`).value.trim();
      const forename = document.getElementById(`holderForename-${suffix}`).value.trim();
      const address = {
        premise: document.getElementById(`holderPremise-${suffix}`).value.trim(),
        street: document.getElementById(`holderStreet-${suffix}`).value.trim(),
        postTown: document.getElementById(`holderPostTown-${suffix}`).value.trim(),
        postcode: document.getElementById(`holderPostcode-${suffix}`).value.trim(),
        country: document.getElementById(`holderCountry-${suffix}`).value.trim(),
      };
      return amalgamatedName ? { amalgamatedName, address } : { surname, forename, address };
    },
  );
}

function readShareholdings() {
  return Array.from(document.querySelectorAll("[data-shareholding-row]")).map((row) => {
    const index = row.getAttribute("data-shareholding-row");
    return {
      shareClass: document.getElementById(`holdingShareClass-${index}`).value.trim(),
      numberHeld: Number(document.getElementById(`holdingNumberHeld-${index}`).value || 0),
      shareholders: readJointHolders(index),
    };
  });
}

function readDirectors() {
  return currentDirectors.map((director, index) => ({
    forename: director.forename,
    otherForenames: document.getElementById(`directorOtherForenames-${index}`).value.trim(),
    surname: director.surname,
    dob: director.dob,
    personalCode: normalisePersonalCode(document.getElementById(`directorPersonalCode-${index}`).value),
    nameMismatchReason: document.getElementById(`directorNameMismatchReason-${index}`).value.trim() || undefined,
  }));
}

function buildStatementPayload() {
  const sicCodes = document
    .getElementById("sicCodes")
    .value.split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  const statementOfCapital = readStatementOfCapital();
  const shareholdings = readShareholdings();
  const registeredEmailAddress = document.getElementById("registeredEmailAddress").value.trim();

  const payload = {
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    dateSigned: new Date().toISOString().slice(0, 10),
    reviewDate: document.getElementById("reviewDate").value,
    lawfulPurposeStatementAccepted: document.getElementById("lawfulPurposeStatement").checked,
    stateConfirmationAccepted: document.getElementById("stateConfirmation").checked,
    directors: readDirectors(),
    officers: currentOfficers.map((officer) => ({ identityVerificationDetails: officer.identityVerificationDetails })),
  };

  if (!deepEqual(sicCodes, originalSicCodes)) {
    payload.sicCodes = sicCodes;
  }
  if (!deepEqual(statementOfCapital, originalStatementOfCapital)) {
    payload.statementOfCapital = statementOfCapital;
  }
  if (!deepEqual(shareholdings, originalShareholdings)) {
    payload.shareholdings = shareholdings;
  }
  if (registeredEmailAddress && registeredEmailAddress !== originalRegisteredEmailAddress) {
    payload.registeredEmailAddress = registeredEmailAddress;
  }

  return payload;
}

function validateReviewForm(payload) {
  if (!payload.reviewDate) {
    showStatus("Enter the confirmation statement date.", "error");
    return false;
  }
  if (!payload.lawfulPurposeStatementAccepted) {
    showStatus("The lawful purpose statement must be accepted before previewing.", "error");
    return false;
  }
  if (!payload.stateConfirmationAccepted) {
    showStatus("The statement of confirmation must be accepted before previewing.", "error");
    return false;
  }
  if (payload.directors.length === 0) {
    showStatus("At least one current director's verification statement is required.", "error");
    return false;
  }
  const blankRow = payload.directors.find((director) => !isValidPersonalCode(director.personalCode) || !director.otherForenames);
  if (blankRow) {
    showStatus(
      `${blankRow.forename || ""} ${blankRow.surname || ""} must verify their identity with Companies House, and this statement needs their other forenames and their 11-character personal code (letters and digits) before it can be submitted.`,
      "error",
    );
    return false;
  }
  return true;
}

async function handleReviewFormSubmit(event) {
  event.preventDefault();
  const moneyProblem = window.moneyInputProblem();
  if (moneyProblem) {
    showStatus(moneyProblem, "error");
    return;
  }
  const payload = buildStatementPayload();
  if (!validateReviewForm(payload)) {
    return;
  }

  showLoading();
  hideStatus();
  try {
    const preview = await window.previewConfirmationStatement(payload);
    document.getElementById("previewXml").textContent = preview.confirmationStatementXml;

    // filingData.paymentPeriodPaid only reflects Companies House's own PaymentPeriodsRequest
    // answer at the time the register data was read - the 402 handled in handleSubmitFiling
    // is the actual gate, re-checked fresh at submit time.
    const feeDue = filingData?.paymentPeriodPaid !== true;
    const previewFeeMessage = document.getElementById("previewFeeMessage");
    previewFeeMessage.style.display = feeDue ? "block" : "none";
    previewFeeMessage.textContent = feeDue
      ? `${CONFIRMATION_STATEMENT_FEE_DISPLAY} will be charged before this is submitted to Companies House.`
      : "";
    document.getElementById("submitFilingBtn").textContent = feeDue ? "Pay and submit" : "Submit to Companies House";

    showView("previewView");
  } catch (error) {
    console.error("Failed to render the confirmation statement preview:", error);
    showStatus(error.message || "Failed to render the confirmation statement preview.", "error");
  } finally {
    hideLoading();
  }
}

// A GovTalkErrors block (error.body.errors) means the gateway never accepted the envelope,
// so it carries plain words a customer can read, not the gateway's own technical Text - the
// caught error's own message is the fallback when there is no GovTalkErrors block to read.
function describeSubmissionError(error, fallback) {
  const govTalkErrors = error?.body?.errors;
  if (Array.isArray(govTalkErrors) && govTalkErrors.length > 0) {
    return window.describeGovTalkErrors(govTalkErrors).join(" ");
  }
  return error?.message || fallback;
}

function renderRejections(rejections) {
  const container = document.getElementById("rejections");
  if (!rejections || rejections.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.replaceChildren(...rejections.map((entry) => element("p", {}, `${entry.rejectCode}: ${entry.description}`)));
}

// A director and a PSC are separate Companies House registers with no shared identifier, so
// a director's own name is matched against each PSC's name: the surname and at least one
// other name word (a forename or one of the other forenames) must both appear in the PSC's
// name text. Good enough to flag the common case (the same natural person holds both roles)
// without claiming certainty a human filer should still check.
function namesLikelyMatchPsc(pscName, director) {
  const pscTokens = String(pscName || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const surname = String(director.surname || "").toLowerCase();
  if (!surname || !pscTokens.includes(surname)) {
    return false;
  }
  const otherNameTokens = [director.forename, director.otherForenames].filter(Boolean).join(" ").toLowerCase().split(/\s+/).filter(Boolean);
  return otherNameTokens.some((token) => pscTokens.includes(token));
}

function directorPscMatches() {
  return currentDirectors
    .map((director, index) => ({
      director,
      index,
      psc: currentPscs.find((psc) => psc.kind === "individual-person-with-significant-control" && namesLikelyMatchPsc(psc.name, director)),
    }))
    .filter((entry) => entry.psc);
}

function renderPscFollowUp() {
  const container = document.getElementById("pscFollowUp");
  const matches = directorPscMatches();
  if (matches.length === 0) {
    container.style.display = "none";
    container.replaceChildren();
    return;
  }
  container.style.display = "block";
  const heading = document.createElement("h3");
  heading.textContent = "PSC verification";
  const explanation = document.createElement("p");
  explanation.textContent =
    "Companies House verifies a person with significant control separately from the confirmation " +
    "statement, through a PSC verification statement filed after this one, inside the window starting the day after the " +
    "review date. Enter each person's own PSC personal code below to file theirs now.";
  container.replaceChildren(heading, explanation, ...matches.map((match) => buildPscFollowUpRow(match, matches)));
}

function buildPscFollowUpRow({ director, index, psc }, matches) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "form-group";
  fieldset.dataset.pscFollowUpRow = String(index);
  const legend = document.createElement("legend");
  legend.textContent = [director.forename, director.surname].filter(Boolean).join(" ") || psc.name;
  const label = document.createElement("label");
  label.htmlFor = `pscPersonalCode-${index}`;
  label.textContent = "PSC personal code";
  const input = document.createElement("input");
  input.type = "text";
  input.id = `pscPersonalCode-${index}`;
  input.maxLength = 11;
  input.spellcheck = false;
  const buttonGroup = document.createElement("div");
  buttonGroup.className = "button-group";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.dataset.pscVerifyIndex = String(index);
  button.textContent = "Submit PSC verification statement";
  button.addEventListener("click", () => handlePscVerificationSubmit(index, matches));
  buttonGroup.append(button);
  const result = document.createElement("div");
  result.id = `pscVerifyResult-${index}`;
  fieldset.append(legend, label, input, buttonGroup, result);
  return fieldset;
}

// Each part is plain text or { strong: text }; built with text nodes so nothing is parsed as HTML.
function buildParagraph(parts, className) {
  const paragraph = document.createElement("p");
  if (className) {
    paragraph.className = className;
  }
  for (const part of parts) {
    if (typeof part === "string") {
      paragraph.append(part);
    } else {
      const strong = document.createElement("strong");
      strong.textContent = String(part.strong ?? "");
      paragraph.append(strong);
    }
  }
  return paragraph;
}

async function pollPscVerificationUntilSettled(submissionNumber) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await window.pollPscVerificationStatement(submissionNumber);
    if (result.statusCode === "ACCEPT" || result.statusCode === "REJECT") {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return window.pollPscVerificationStatement(submissionNumber);
}

async function handlePscVerificationSubmit(index, matches) {
  const entry = matches.find((candidate) => candidate.index === index);
  if (!entry) {
    return;
  }
  const resultContainer = document.getElementById(`pscVerifyResult-${index}`);
  const personalCode = normalisePersonalCode(document.getElementById(`pscPersonalCode-${index}`).value);
  if (!isValidPersonalCode(personalCode)) {
    resultContainer.replaceChildren(
      buildParagraph(["The PSC personal code must be the 11-character Companies House personal code, letters and digits."], "error"),
    );
    return;
  }
  showLoading();
  try {
    const { director, psc } = entry;
    const payload = {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode,
      dateSigned: new Date().toISOString().slice(0, 10),
      title: director.title,
      forename: director.forename,
      otherForenames: director.otherForenames,
      surname: director.surname,
      dobMonth: psc.dateOfBirth?.month,
      dobYear: psc.dateOfBirth?.year,
      personalCode,
    };
    const submission = await window.submitPscVerificationStatement(payload);
    resultContainer.replaceChildren(
      buildParagraph(["Submission ", { strong: submission.submissionNumber }, " accepted by the gateway. Waiting for Companies House..."]),
    );
    const outcome = await pollPscVerificationUntilSettled(submission.submissionNumber);
    resultContainer.replaceChildren(
      buildParagraph(["Submission ", { strong: outcome.submissionNumber }, " was ", { strong: outcome.statusCode }, "."]),
      ...(outcome.rejections || []).map((rejection) => buildParagraph([`${rejection.rejectCode}: ${rejection.description}`])),
    );
  } catch (error) {
    console.error("PSC verification statement filing failed:", error);
    resultContainer.replaceChildren(
      buildParagraph([describeSubmissionError(error, "Failed to file the PSC verification statement.")], "error"),
    );
  } finally {
    hideLoading();
  }
}

function showSubmissionProgress(lead, submissionNumber, middle, statusCode, tail) {
  document
    .getElementById("filingResult")
    .replaceChildren(element("p", {}, lead, element("strong", {}, submissionNumber), middle, element("strong", {}, statusCode), tail));
}

async function pollUntilSettled(submissionNumber, extraHeaders = {}) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await window.pollConfirmationStatement(submissionNumber, extraHeaders);
    if (result.statusCode === "ACCEPT" || result.statusCode === "REJECT") {
      return result;
    }
    showSubmissionProgress("Submission ", submissionNumber, " is ", result.statusCode, ". Checking again...");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return window.pollConfirmationStatement(submissionNumber, extraHeaders);
}

async function handleSubmitFiling() {
  showLoading();
  hideStatus();
  let payload;
  try {
    payload = { ...buildStatementPayload(), companyAuthCode };
    const govTestScenario = document.getElementById("govTestScenario").value.trim();
    const govTestScenarioHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    const submission = await window.submitConfirmationStatement(payload, govTestScenarioHeaders);
    document
      .getElementById("filingResult")
      .replaceChildren(
        element(
          "p",
          {},
          "Submission ",
          element("strong", {}, submission.submissionNumber),
          ` accepted by the gateway at ${submission.gatewayTimestamp}. Waiting for Companies House...`,
        ),
      );
    showView("resultView");

    const outcome = await pollUntilSettled(submission.submissionNumber, govTestScenarioHeaders);
    showSubmissionProgress("Submission ", outcome.submissionNumber, " was ", outcome.statusCode, ".");
    renderRejections(outcome.rejections);
    if (outcome.statusCode === "ACCEPT") {
      renderPscFollowUp();
    }
    document.getElementById("startAgainBtn").style.display = "inline-block";
  } catch (error) {
    // A fresh 402 from the submit route (the payment period is unpaid and no activity
    // charge has been paid for this company/reviewDate) sends the customer to Stripe
    // Checkout instead of showing an error - this is the live gate, independent of
    // filingData.paymentPeriodPaid, which can be stale by the time the customer submits.
    if (error.status === 402 && payload) {
      await startActivityCheckout(payload.companyNumber, payload.reviewDate);
      return;
    }
    console.error("Companies House confirmation statement filing failed:", error);
    showStatus(describeSubmissionError(error, "Failed to file the confirmation statement with Companies House."), "error");
  } finally {
    hideLoading();
  }
}

// Opens a Stripe Checkout Session for this one filing's fee. Checkout is a full top-level
// redirect, so it clears every in-memory variable this page holds - the company
// authentication code and the directors' personal codes are never written to storage to
// survive that round trip, so the return (see resumeAfterActivityCheckout below) re-collects
// them through the normal authView step rather than resuming mid-form.
async function startActivityCheckout(companyNumber, reviewDate) {
  showLoading();
  try {
    const subjectKey = `${companyNumber}:${reviewDate}`;
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    const response = await window.fetchWithIdToken("/api/v1/billing/activity-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityId: CONFIRMATION_STATEMENT_ACTIVITY_ID, subjectKey, returnTo }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.checkoutUrl) {
      showStatus(`Failed to start payment: ${body.message || body.error || "Unknown error"}`, "error");
      return;
    }
    sessionStorage.setItem(CHECKOUT_RESUME_KEY, companyNumber);
    window.location.href = body.checkoutUrl;
  } catch (error) {
    console.error("Failed to start the confirmation statement payment:", error);
    showStatus(error.message || "Failed to start payment.", "error");
  } finally {
    hideLoading();
  }
}

async function resumeAfterActivityCheckout(companyNumber) {
  await lookUpCompany(companyNumber);
  if (company) {
    showStatus("Payment received for this filing. Enter the company authentication code to finish it.", "success");
  }
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);

function startAgain() {
  company = null;
  companyAuthCode = "";
  filingData = null;
  currentDirectors = [];
  currentOfficers = [];
  currentPscs = [];
  document.getElementById("companyForm").reset();
  document.getElementById("authForm").reset();
  document.getElementById("reviewForm").reset();
  document.getElementById("directorRowsContainer").replaceChildren();
  document.getElementById("shareClassesContainer").replaceChildren();
  document.getElementById("shareholdingsContainer").replaceChildren();
  document.getElementById("rejections").style.display = "none";
  document.getElementById("pscFollowUp").style.display = "none";
  document.getElementById("startAgainBtn").style.display = "none";
  document.getElementById("previewFeeMessage").style.display = "none";
  document.getElementById("submitFilingBtn").textContent = "Submit to Companies House";
  hideStatus();
  showView("companyView");
}

// A Stripe Checkout redirect is a full top-level navigation, so it lands back here as a
// fresh page load - resume the journey from the checkout query params rather than any
// in-memory state, which this reload has already lost. Waits for submit.js (the module
// script that defines window.getCompanyProfile and friends) the same way
// changeRegisteredEmail.html's resumePendingFilingIfReady does, since a plain script runs
// before a type="module" script has finished.
function resumeAfterCheckoutIfReady() {
  const params = new URLSearchParams(window.location.search);
  const checkoutResult = params.get("checkout");
  if (!checkoutResult) return;

  const url = new URL(window.location);
  url.searchParams.delete("checkout");
  url.searchParams.delete("session_id");
  window.history.replaceState({}, "", url);

  if (checkoutResult !== "success") {
    showStatus("Payment was not completed. Choose Pay and submit again when ready.", "warning");
    return;
  }

  const pendingCompanyNumber = sessionStorage.getItem(CHECKOUT_RESUME_KEY);
  sessionStorage.removeItem(CHECKOUT_RESUME_KEY);
  if (pendingCompanyNumber) {
    resumeAfterActivityCheckout(pendingCompanyNumber);
  }
}

if (window.__submitReady__) {
  resumeAfterCheckoutIfReady();
} else {
  document.addEventListener("submit-ready", resumeAfterCheckoutIfReady, { once: true });
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("authForm").addEventListener("submit", handleAuthSubmit);
document.getElementById("reviewForm").addEventListener("submit", handleReviewFormSubmit);
document.getElementById("addShareClassBtn").addEventListener("click", () => addShareClassRow());
document.getElementById("addShareholdingBtn").addEventListener("click", () => addShareholdingRow());
document.getElementById("shareholdingsContainer").addEventListener("click", (event) => {
  if (event.target.classList.contains("add-joint-holder-row")) {
    const holdingIndex = Number.parseInt(event.target.getAttribute("data-holding-index"), 10);
    if (!Number.isInteger(holdingIndex)) return;
    const jointHoldersContainer = document.querySelector(`.joint-holders-container[data-holding-index="${holdingIndex}"]`);
    const nextShareholderIndex = jointHoldersContainer.querySelectorAll("[data-shareholder-row]").length;
    if (nextShareholderIndex >= MAX_JOINT_HOLDERS_PER_SHAREHOLDING) {
      showStatus(`A shareholding may carry at most ${MAX_JOINT_HOLDERS_PER_SHAREHOLDING} joint holders.`, "error");
      return;
    }
    jointHoldersContainer.append(buildJointHolderRow(holdingIndex, nextShareholderIndex));
  }
  if (event.target.classList.contains("remove-joint-holder-row")) {
    event.target.closest("[data-shareholder-row]").remove();
  }
});
document.getElementById("shareCurrency").addEventListener("input", syncShareCurrencyPrefixes);
document.getElementById("backToReviewBtn").addEventListener("click", () => showView("reviewView"));
document.getElementById("submitFilingBtn").addEventListener("click", handleSubmitFiling);
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
document.getElementById("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});
