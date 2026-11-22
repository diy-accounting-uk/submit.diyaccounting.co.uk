// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

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

// The two headers the status poll (a GET) carries the own presenter in.
function ownPresenterHeaders() {
  return ownPresenter ? { "X-Presenter-Id": ownPresenter.id, "X-Presenter-Code": ownPresenter.code } : {};
}

function readOwnPresenterInputs() {
  if (!document.getElementById("useOwnPresenter").checked) return { presenter: null };
  const idInput = document.getElementById("ownPresenterId");
  const codeInput = document.getElementById("ownPresenterCode");
  const id = idInput.value.trim();
  const code = codeInput.value.trim();
  const problems = [];
  if (!id) problems.push({ input: idInput, message: window.siteText("ch.accounts.enter-presenter-id", "Enter your presenter id") });
  if (!code)
    problems.push({
      input: codeInput,
      message: window.siteText("ch.accounts.enter-presenter-code", "Enter your presenter authentication code"),
    });
  return problems.length > 0 ? { problems } : { presenter: { id, code } };
}

function syncOwnPresenterFields() {
  document.getElementById("ownPresenterFields").hidden = !document.getElementById("useOwnPresenter").checked;
}

function normalisePersonalCode(rawValue) {
  return (rawValue || "").trim().toUpperCase().replace(/-/g, "");
}

function isValidPersonalCode(rawValue) {
  return PERSONAL_CODE_PATTERN.test(normalisePersonalCode(rawValue));
}

let company = null;
let companyAuthCode = "";
// The customer's own Companies House presenter, when they file under it: {id, code} or null.
// Held in this variable only, like the company authentication code: never written to storage.
let ownPresenter = null;
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

function feeMessageText(feePaid) {
  if (feePaid) return window.siteText("ch.cs.fee-paid", "No fee: this payment period is already paid.");
  return ownPresenter
    ? window.siteText(
        "ch.cs.fee-own-presenter",
        "Companies House charges its fee to the credit account behind your presenter. Submit takes no fee of its own.",
      )
    : window.siteText("ch.cs.fee-applies", "A fee applies for this payment period - the amount is shown before you submit.");
}

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
          textOrDash(window.companiesHouseLabels.formatCompanyDate(officer.appointedOn)),
          officer.identityVerificationDetails
            ? window.siteText("ch.cs.verified", "Verified")
            : window.siteText("ch.cs.not-verified", "Not verified"),
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
        tableRow(
          textOrDash(psc.name),
          textOrDash((psc.naturesOfControl || []).map(slugLabel).join(", ")),
          textOrDash(window.companiesHouseLabels.formatCompanyDate(psc.notifiedOn)),
        ),
      ),
  );
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  await lookUpCompany(companyNumber);
}

async function lookUpCompany(companyNumber) {
  showLoading();
  hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    if (profile.companyStatus !== "active" || profile.companyType !== "ltd") {
      showStatus(
        window.siteText(
          "ch.cs.only-active-ltd",
          "Only an active private company limited by shares can file a confirmation statement here.",
        ),
        "error",
      );
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
    document.getElementById("authNextDue").textContent = textOrDash(
      window.companiesHouseLabels.formatCompanyDate(company.confirmationStatementNextDue),
    );
    document.getElementById("authNextMadeUpTo").textContent = textOrDash(
      window.companiesHouseLabels.formatCompanyDate(company.confirmationStatementNextMadeUpTo),
    );
    renderPublicOfficers(officersResult.officers);
    renderPublicPscs(pscsResult.pscs);
    showView("authView");
  } catch (error) {
    console.error("Failed to look up the company:", error);
    showStatus(error.message || window.siteText("ch.accounts.lookup-failed", "Failed to look up the company."), "error");
  } finally {
    hideLoading();
  }
}

function buildShareClassRow(index, share = {}) {
  return element(
    "fieldset",
    { "class": "form-group", "data-share-class-row": index },
    element("legend", {}, window.siteText("ch.cs.share-class-n", "Share class {n}", { n: index + 1 })),
    element("label", { for: `shareClass-${index}` }, window.siteText("ch.cs.share-class", "Share class")),
    textInput(`shareClass-${index}`, share.shareClass),
    element("label", { for: `prescribedParticulars-${index}` }, window.siteText("ch.cs.prescribed-particulars", "Prescribed particulars")),
    textInput(`prescribedParticulars-${index}`, share.prescribedParticulars),
    element("label", { for: `numShares-${index}` }, window.siteText("ch.cs.number-of-shares", "Number of shares")),
    element("input", { type: "number", id: `numShares-${index}`, step: "1", min: "0", value: share.numShares || "" }),
    element(
      "label",
      { for: `aggregateNominalValue-${index}` },
      window.siteText("ch.cs.aggregate-nominal-value", "Aggregate nominal value"),
    ),
    element(
      "p",
      { id: `aggregateNominalValue-${index}-money-hint`, class: "hint" },
      window.siteText("ch.cs.money-example", "For example, 600 or 1,200.50"),
    ),
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
    element("button", { type: "button", class: "btn-small remove-share-class-row" }, window.siteText("ch.cs.remove", "Remove")),
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
const MAX_TRANSFERS_PER_SHAREHOLDING = 200;

function buildTransferRow(holdingIndex, transferIndex, transfer = {}) {
  const suffix = `${holdingIndex}-${transferIndex}`;
  return element(
    "div",
    { "class": "form-group", "data-transfer-row": suffix },
    element(
      "label",
      { for: `transferDate-${suffix}` },
      window.siteText("ch.cs.transfer-date", "Transfer {n} date", { n: transferIndex + 1 }),
    ),
    element("input", { type: "date", id: `transferDate-${suffix}`, value: transfer.dateOfTransfer || "" }),
    element(
      "label",
      { for: `transferShares-${suffix}` },
      window.siteText("ch.cs.transfer-shares", "Transfer {n} number of shares", { n: transferIndex + 1 }),
    ),
    element("input", {
      type: "number",
      id: `transferShares-${suffix}`,
      step: "any",
      min: "0",
      value: transfer.numberSharesTransferred || "",
    }),
    element(
      "button",
      { "type": "button", "class": "btn-small remove-transfer-row", "data-holding-index": holdingIndex },
      window.siteText("ch.cs.remove-transfer", "Remove transfer"),
    ),
  );
}

function buildJointHolderRow(holdingIndex, shareholderIndex, shareholder = {}) {
  const address = shareholder.address || {};
  const suffix = `${holdingIndex}-${shareholderIndex}`;
  const fieldRows = [
    ["holderSurname", window.siteText("ch.cs.holder-surname", "Shareholder surname"), shareholder.surname],
    ["holderForename", window.siteText("ch.cs.holder-forename", "Shareholder forename"), shareholder.forename],
    [
      "holderAmalgamatedName",
      window.siteText("ch.cs.holder-amalgamated", "Or amalgamated name (used instead of surname/forename)"),
      shareholder.amalgamatedName,
    ],
    ["holderPremise", window.siteText("ch.cs.holder-premise", "Premise"), address.premise],
    ["holderStreet", window.siteText("ch.cs.holder-street", "Street"), address.street],
    ["holderThoroughfare", window.siteText("ch.cs.holder-thoroughfare", "Thoroughfare"), address.thoroughfare],
    ["holderPostTown", window.siteText("ch.cs.holder-post-town", "Post town"), address.postTown],
    ["holderCounty", window.siteText("ch.address.county", "County"), address.county],
    ["holderPostcode", window.siteText("ch.address.postcode", "Postcode"), address.postcode],
    ["holderCountry", window.siteText("ch.address.country", "Country"), address.country],
  ].flatMap(([idPrefix, labelText, value]) => [
    element("label", { for: `${idPrefix}-${suffix}` }, labelText),
    textInput(`${idPrefix}-${suffix}`, value),
  ]);
  return element(
    "fieldset",
    { "class": "form-group", "data-shareholder-row": suffix },
    element("legend", {}, window.siteText("ch.cs.joint-holder-n", "Joint holder {n}", { n: shareholderIndex + 1 })),
    ...fieldRows,
    element(
      "button",
      { "type": "button", "class": "btn-small remove-joint-holder-row", "data-holding-index": holdingIndex },
      window.siteText("ch.cs.remove-joint-holder", "Remove joint holder"),
    ),
  );
}

function buildShareholdingRow(index, holding = {}) {
  const shareholders = holding.shareholders && holding.shareholders.length > 0 ? holding.shareholders : [{}];
  return element(
    "fieldset",
    { "class": "form-group", "data-shareholding-row": index },
    element("legend", {}, window.siteText("ch.cs.shareholding-n", "Shareholding {n}", { n: index + 1 })),
    element("label", { for: `holdingShareClass-${index}` }, window.siteText("ch.cs.share-class", "Share class")),
    textInput(`holdingShareClass-${index}`, holding.shareClass),
    element("label", { for: `holdingNumberHeld-${index}` }, window.siteText("ch.cs.number-held", "Number held")),
    element("input", { type: "number", id: `holdingNumberHeld-${index}`, step: "1", min: "0", value: holding.numberHeld || "" }),
    element(
      "p",
      { class: "hint" },
      window.siteText("ch.cs.joint-hint", "A holding held jointly carries every joint holder below, up to {max}.", {
        max: MAX_JOINT_HOLDERS_PER_SHAREHOLDING,
      }),
    ),
    element("h4", {}, window.siteText("ch.cs.share-transfers", "Share transfers")),
    element(
      "p",
      { class: "hint" },
      window.siteText(
        "ch.cs.transfers-hint",
        "Each transfer of shares since the last statement: its date and the number of shares, up to {max}.",
        {
          max: MAX_TRANSFERS_PER_SHAREHOLDING,
        },
      ),
    ),
    element(
      "div",
      { "class": "transfers-container", "data-holding-index": index },
      ...(holding.transfers || []).map((transfer, transferIndex) => buildTransferRow(index, transferIndex, transfer)),
    ),
    element(
      "button",
      { "type": "button", "class": "btn-small add-transfer-row", "data-holding-index": index },
      window.siteText("ch.cs.add-transfer", "Add transfer"),
    ),
    element(
      "div",
      { "class": "joint-holders-container", "data-holding-index": index },
      ...shareholders.map((shareholder, shareholderIndex) => buildJointHolderRow(index, shareholderIndex, shareholder)),
    ),
    element(
      "button",
      { "type": "button", "class": "btn-small add-joint-holder-row", "data-holding-index": index },
      window.siteText("ch.cs.add-joint-holder", "Add joint holder"),
    ),
    element(
      "button",
      { type: "button", class: "btn-small remove-shareholding-row" },
      window.siteText("ch.cs.remove-shareholding", "Remove shareholding"),
    ),
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
    element(
      "legend",
      {},
      `${director.forename || ""} ${director.surname || ""} (${director.dob || window.siteText("ch.cs.no-dob", "no date of birth on record")})`,
    ),
    element("label", { for: `directorOtherForenames-${index}` }, window.siteText("ch.cs.other-forenames", "Other forenames")),
    element(
      "p",
      { class: "hint" },
      window.siteText(
        "ch.cs.other-forenames-hint",
        "Every middle name on the register. Companies House matches the director by the full name - leaving one out rejects the filing.",
      ),
    ),
    textInput(`directorOtherForenames-${index}`, director.otherForenames, { spellcheck: "false" }),
    element("label", { for: `directorPersonalCode-${index}` }, window.siteText("ch.cs.personal-code", "Companies House personal code")),
    textInput(`directorPersonalCode-${index}`, "", { maxlength: "13", spellcheck: "false" }),
    element("label", { for: `directorNameMismatchReason-${index}` }, window.siteText("ch.cs.mismatch-reason", "Name mismatch reason")),
    element(
      "p",
      { class: "hint" },
      window.siteText("ch.cs.mismatch-hint", "Only when the name this director verified under differs from the register name above."),
    ),
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
  const codeInput = document.getElementById("companyAuthCode");
  const enteredCode = codeInput.value.trim();
  if (enteredCode.length < 6 || enteredCode.length > 8) {
    window.formErrors.showFormErrors([
      {
        input: codeInput,
        message: window.siteText("ch.accounts.enter-auth-code", "Enter the 6 to 8 character company authentication code"),
      },
    ]);
    return;
  }
  const ownPresenterInputs = readOwnPresenterInputs();
  if (ownPresenterInputs.problems) {
    window.formErrors.showFormErrors(ownPresenterInputs.problems);
    return;
  }
  window.formErrors.clearFormErrors();
  const madeUpDate = company.confirmationStatementNextMadeUpTo;
  if (!madeUpDate) {
    showStatus(
      window.siteText("ch.cs.no-next-date", "Companies House has not published a next confirmation statement date for this company."),
      "error",
    );
    return;
  }

  showLoading();
  hideStatus();
  try {
    filingData = await window.getConfirmationStatementFilingData(company.companyNumber, {
      companyAuthCode: enteredCode,
      madeUpDate,
      ownPresenter: ownPresenterInputs.presenter ?? undefined,
    });
    companyAuthCode = enteredCode;
    ownPresenter = ownPresenterInputs.presenter;

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
    document.getElementById("feeMessage").textContent = feeMessageText(feePaid);

    showView("reviewView");
  } catch (error) {
    console.error("Failed to read the confirmation statement filing data:", error);
    if (error.status === 400 && error.body?.reason === "invalid-company-authentication-code") {
      window.formErrors.showFormErrors([{ input: codeInput, message: error.message }]);
      return;
    }
    showStatus(error.message || window.siteText("ch.cs.read-failed", "Failed to read the confirmation statement filing data."), "error");
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
        thoroughfare: document.getElementById(`holderThoroughfare-${suffix}`).value.trim(),
        postTown: document.getElementById(`holderPostTown-${suffix}`).value.trim(),
        county: document.getElementById(`holderCounty-${suffix}`).value.trim(),
        postcode: document.getElementById(`holderPostcode-${suffix}`).value.trim(),
        country: document.getElementById(`holderCountry-${suffix}`).value.trim(),
      };
      return amalgamatedName ? { amalgamatedName, address } : { surname, forename, address };
    },
  );
}

function readTransfers(holdingIndex) {
  return Array.from(document.querySelectorAll(`.transfers-container[data-holding-index="${holdingIndex}"] [data-transfer-row]`)).map(
    (row) => {
      const suffix = row.getAttribute("data-transfer-row");
      return {
        dateOfTransfer: document.getElementById(`transferDate-${suffix}`).value,
        numberSharesTransferred: Number(document.getElementById(`transferShares-${suffix}`).value || 0),
      };
    },
  );
}

function readShareholdings() {
  return Array.from(document.querySelectorAll("[data-shareholding-row]")).map((row) => {
    const index = row.getAttribute("data-shareholding-row");
    const transfers = readTransfers(index);
    return {
      shareClass: document.getElementById(`holdingShareClass-${index}`).value.trim(),
      numberHeld: Number(document.getElementById(`holdingNumberHeld-${index}`).value || 0),
      ...(transfers.length > 0 ? { transfers } : {}),
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
    shareholdings,
  };

  if (!deepEqual(sicCodes, originalSicCodes)) {
    payload.sicCodes = sicCodes;
  }
  if (!deepEqual(statementOfCapital, originalStatementOfCapital)) {
    payload.statementOfCapital = statementOfCapital;
  }
  if (registeredEmailAddress && registeredEmailAddress !== originalRegisteredEmailAddress) {
    payload.registeredEmailAddress = registeredEmailAddress;
  }

  return payload;
}

function validateReviewForm(payload) {
  if (!payload.reviewDate) {
    showStatus(window.siteText("ch.cs.enter-date", "Enter the confirmation statement date."), "error");
    return false;
  }
  if (!payload.lawfulPurposeStatementAccepted) {
    showStatus(window.siteText("ch.cs.lawful-required", "The lawful purpose statement must be accepted before previewing."), "error");
    return false;
  }
  if (!payload.stateConfirmationAccepted) {
    showStatus(
      window.siteText("ch.cs.confirmation-required", "The statement of confirmation must be accepted before previewing."),
      "error",
    );
    return false;
  }
  if (payload.directors.length === 0) {
    showStatus(window.siteText("ch.cs.director-required", "At least one current director's verification statement is required."), "error");
    return false;
  }
  const blankRow = payload.directors.find((director) => !isValidPersonalCode(director.personalCode) || !director.otherForenames);
  if (blankRow) {
    showStatus(
      window.siteText(
        "ch.cs.director-blank",
        "{name} must verify their identity with Companies House, and this statement needs their other forenames and their 11-character personal code (letters and digits) before it can be submitted.",
        { name: `${blankRow.forename || ""} ${blankRow.surname || ""}`.trim() },
      ),
      "error",
    );
    return false;
  }
  return true;
}

function longDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return window.companiesHouseLabels.formatCompanyDate(isoDate);
}

function describeShareholder(shareholder) {
  const name = shareholder.amalgamatedName || [shareholder.forename, shareholder.surname].filter(Boolean).join(" ");
  const address = shareholder.address || {};
  const addressLine = [
    address.premise,
    address.street,
    address.thoroughfare,
    address.postTown,
    address.county,
    address.postcode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
  return addressLine ? `${name} (${addressLine})` : name;
}

function renderPreviewSummary(payload) {
  const rows = [
    [window.siteText("ch.search.column-company", "Company"), `${payload.companyName} (${payload.companyNumber})`],
    [window.siteText("ch.cs.summary-date", "Confirmation statement date"), longDate(payload.reviewDate)],
    [window.siteText("ch.cs.summary-lawful", "Lawful purpose statement"), window.siteText("ch.cs.accepted", "Accepted")],
    [window.siteText("ch.cs.summary-confirmation", "Statement of confirmation"), window.siteText("ch.cs.accepted", "Accepted")],
    [
      window.siteText("ch.cs.summary-directors", "Directors verifying their identity"),
      payload.directors.map((d) => [d.forename, d.otherForenames, d.surname].filter(Boolean).join(" ")).join(", "),
    ],
  ];
  if (payload.sicCodes) rows.push([window.siteText("ch.cs.summary-sic", "Nature of business (SIC codes)"), payload.sicCodes.join(", ")]);
  if (payload.registeredEmailAddress)
    rows.push([window.siteText("ch.cs.summary-email", "Registered email address"), payload.registeredEmailAddress]);
  if (payload.statementOfCapital)
    rows.push([
      window.siteText("ch.cs.summary-capital", "Statement of capital"),
      window.siteText("ch.cs.changed", "Changed from the register"),
    ]);
  if (payload.shareholdings) {
    rows.push([
      window.siteText("ch.cs.summary-shareholders", "Shareholders"),
      window.siteText("ch.cs.changed", "Changed from the register"),
    ]);
    payload.shareholdings.forEach((holding, index) => {
      const holders = (holding.shareholders || []).map(describeShareholder).join("; ");
      const holdersSuffix = holders ? ": " + holders : "";
      rows.push([
        window.siteText("ch.cs.shareholding-n", "Shareholding {n}", { n: index + 1 }),
        window.siteText("ch.cs.holding-summary", "{kind}, {number} held", {
          kind: holding.shareClass,
          number: holding.numberHeld,
        }) + holdersSuffix,
      ]);
      (holding.transfers || []).forEach((transfer, transferIndex) => {
        rows.push([
          window.siteText("ch.cs.transfer-label", "Shareholding {n} transfer {m}", { n: index + 1, m: transferIndex + 1 }),
          window.siteText("ch.cs.transfer-summary", "{number} shares on {date}", {
            number: transfer.numberSharesTransferred,
            date: longDate(transfer.dateOfTransfer),
          }),
        ]);
      });
    });
  }
  const summary = document.getElementById("previewSummary");
  summary.replaceChildren();
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    summary.append(term, detail);
  }
}

async function handleReviewFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!window.formErrors.requireFormFields(form)) return;
  if (window.formErrors.reportMoneyProblems(form)) return;
  const confirmed = window.formErrors.requireChecked({
    lawfulPurposeStatement: window.siteText("ch.cs.confirm-lawful", "Confirm the lawful purpose statement"),
    stateConfirmation: window.siteText("ch.cs.confirm-confirmation", "Confirm the statement of confirmation"),
  });
  if (!confirmed) return;
  const payload = buildStatementPayload();
  if (!validateReviewForm(payload)) {
    return;
  }

  showLoading();
  hideStatus();
  try {
    const preview = await window.renderConfirmationStatement(payload);
    document.getElementById("previewXml").textContent = preview.confirmationStatementXml;
    renderPreviewSummary(payload);

    // filingData.paymentPeriodPaid only reflects Companies House's own PaymentPeriodsRequest
    // answer at the time the register data was read - the 402 handled in handleSubmitFiling
    // is the actual gate, re-checked fresh at submit time.
    const feeDue = filingData?.paymentPeriodPaid !== true;
    const submitFee = feeDue && !ownPresenter;
    const previewFeeMessage = document.getElementById("previewFeeMessage");
    previewFeeMessage.style.display = feeDue ? "block" : "none";
    previewFeeMessage.textContent = submitFee
      ? window.siteText("ch.cs.fee-charged", "{fee} will be charged before this is submitted to Companies House.", {
          fee: CONFIRMATION_STATEMENT_FEE_DISPLAY,
        })
      : feeMessageText(!feeDue);
    document.getElementById("submitFilingBtn").textContent = submitFee
      ? window.siteText("ch.cs.pay-and-submit", "Pay and submit")
      : window.siteText("ch.cs.submit", "Submit to Companies House");

    showView("previewView");
  } catch (error) {
    console.error("Failed to render the confirmation statement preview:", error);
    showStatus(error.message || window.siteText("ch.cs.preview-failed", "Failed to render the confirmation statement preview."), "error");
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
  container.className = "outcome outcome--error";
  container.replaceChildren(...rejections.map((entry) => element("p", {}, window.companiesHouseRejections.rejectionText(entry))));
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
  heading.textContent = window.siteText("ch.cs.psc-heading", "PSC verification");
  const explanation = document.createElement("p");
  explanation.textContent = window.siteText(
    "ch.cs.psc-explanation",
    "Companies House verifies a person with significant control separately from the confirmation statement, through a PSC verification statement filed after this one, inside the window starting the day after the review date. Enter each person's own PSC personal code below to file theirs now.",
  );
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
  label.textContent = window.siteText("ch.cs.psc-code", "PSC personal code");
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
  button.textContent = window.siteText("ch.cs.psc-submit", "Submit PSC verification statement");
  button.addEventListener("click", () => handlePscVerificationSubmit(index, matches));
  buttonGroup.append(button);
  const result = document.createElement("div");
  result.id = `pscVerifyResult-${index}`;
  fieldset.append(legend, label, input, buttonGroup, result);
  return fieldset;
}

// The parts of a text with {name} places, for buildParagraph: each place holds its value in bold.
function valueParts(text, values) {
  return text
    .split(/\{([a-z]+)\}/)
    .map((part, index) => (index % 2 === 1 ? { strong: values[part] } : part))
    .filter((part) => part !== "");
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

function pollPscVerificationUntilSettled(submission) {
  return window.companiesHouseGatewayPoll.pollGatewayUntilSettled({
    submissionNumber: submission.submissionNumber,
    pollIntervalSeconds: submission.pollInterval,
    poll: () => window.pollPscVerificationStatement(submission.submissionNumber, ownPresenterHeaders()),
  });
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
      buildParagraph(
        [
          window.siteText(
            "ch.cs.psc-code-invalid",
            "The PSC personal code must be the 11-character Companies House personal code, letters and digits.",
          ),
        ],
        "error",
      ),
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
    const submission = await window.submitPscVerificationStatement(ownPresenter ? { ...payload, ownPresenter } : payload);
    resultContainer.replaceChildren(
      buildParagraph(
        valueParts(
          window.siteText("ch.cs.psc-gateway-accepted", "Submission {number} accepted by the gateway. Waiting for Companies House..."),
          {
            number: submission.submissionNumber,
          },
        ),
      ),
    );
    const outcome = await pollPscVerificationUntilSettled(submission);
    if (!window.companiesHouseGatewayPoll.isSettled(outcome)) {
      // A PSC row has no Check again, so its note never offers one.
      resultContainer.replaceChildren(buildParagraph([window.companiesHouseGatewayPoll.pendingNote({ ...submission, pollInterval: 0 })]));
      return;
    }
    resultContainer.replaceChildren(
      buildParagraph(
        valueParts(window.siteText("ch.small.outcome", "Submission {number} was {status}."), {
          number: outcome.submissionNumber,
          status: window.companiesHouseGatewayPoll.statusWord(outcome.statusCode),
        }),
      ),
      ...(outcome.rejections || []).map((rejection) => buildParagraph([window.companiesHouseRejections.rejectionText(rejection)])),
    );
  } catch (error) {
    console.error("PSC verification statement filing failed:", error);
    resultContainer.replaceChildren(
      buildParagraph(
        [describeSubmissionError(error, window.siteText("ch.cs.psc-failed", "Failed to file the PSC verification statement."))],
        "error",
      ),
    );
  } finally {
    hideLoading();
  }
}

// The result line from a text with {name} places: each place holds its value in bold.
function showSubmissionProgress(text, values) {
  const parts = text.split(/\{([a-z]+)\}/).map((part, index) => (index % 2 === 1 ? element("strong", {}, String(values[part])) : part));
  document.getElementById("filingResult").replaceChildren(element("p", {}, ...parts.filter((part) => part !== "")));
}

function pollUntilSettled(submission, extraHeaders) {
  const { submissionNumber } = submission;
  return window.companiesHouseGatewayPoll.pollGatewayUntilSettled({
    submissionNumber,
    pollIntervalSeconds: submission.pollInterval,
    poll: () => window.pollConfirmationStatement(submissionNumber, extraHeaders),
    onPending: (result) =>
      showSubmissionProgress(window.siteText("ch.accounts.checking", "Submission {number} is {status}. Checking again..."), {
        number: submissionNumber,
        status: window.companiesHouseGatewayPoll.statusWord(result.statusCode),
      }),
  });
}

// Polls for the outcome and shows it with the filing record. Pending after the last poll, the page
// says so and offers Check again.
async function checkOutcome(submission, headers, payload) {
  const checkAgain = document.getElementById("checkAgainBtn");
  checkAgain.style.display = "none";
  checkAgain.onclick = null;
  const outcome = await pollUntilSettled(submission, headers);
  const result = document.getElementById("filingResult");
  if (!window.companiesHouseGatewayPoll.isSettled(outcome)) {
    result.replaceChildren(element("p", {}, window.companiesHouseGatewayPoll.pendingNote(submission)));
    result.className = "outcome";
    if (!window.companiesHouseGatewayPoll.mayCheckAgain(submission)) return;
    checkAgain.onclick = () =>
      checkOutcome(submission, headers, payload).catch((error) => {
        console.error("Companies House confirmation statement status check failed:", error);
        showStatus(error.message, "error");
      });
    checkAgain.style.display = "inline-block";
    return;
  }
  const notReceived = window.companiesHouseRejections.notReceivedHeadline(outcome);
  if (notReceived) {
    showSubmissionProgress(`${notReceived.title} ${notReceived.detail}`, {});
  } else {
    showSubmissionProgress(window.siteText("ch.small.outcome", "Submission {number} was {status}."), {
      number: outcome.submissionNumber,
      status: window.companiesHouseGatewayPoll.statusWord(outcome.statusCode),
    });
  }
  result.className = outcome.statusCode === "ACCEPT" ? "outcome outcome--ok" : "outcome outcome--error";
  renderRejections(outcome.rejections);
  await renderFilingRecord(payload, outcome);
  if (outcome.statusCode === "ACCEPT") {
    renderPscFollowUp();
  }
}

function confirmedOfficers() {
  return currentOfficers.map((officer) => ({
    name: textOrDash(officerDisplayName(officer)),
    role: slugOrDash(officer.officerRole),
    verification: officer.identityVerificationDetails
      ? window.siteText("ch.cs.identity-verified", "Identity verified")
      : window.siteText("ch.cs.identity-not-verified", "Identity not verified"),
  }));
}

function confirmedPscs() {
  return currentPscs.map((psc) => ({
    name: textOrDash(psc.name),
    control: textOrDash((psc.naturesOfControl || []).map(slugLabel).join(", ")),
    notifiedOn: textOrDash(window.companiesHouseLabels.formatCompanyDate(psc.notifiedOn)),
  }));
}

async function renderFilingRecord(payload, outcome) {
  const { confirmationStatementCopyHtml, todayText } = await import("../lib/filing-result-record.js");
  const html = confirmationStatementCopyHtml({
    company,
    payload,
    officers: confirmedOfficers(),
    pscs: confirmedPscs(),
    outcome,
    dateText: todayText(),
  });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.getElementById("filingRecord").replaceChildren(...parsed.body.childNodes);
}

// The reader's language choice goes with a filing, so the receipt email of an accepted filing is in it.
function languageHeaders() {
  return window.siteLanguage && window.siteLanguage.current() === "cy" ? { "X-Site-Language": "cy" } : {};
}

async function handleSubmitFiling() {
  showLoading();
  hideStatus();
  let payload;
  try {
    payload = { ...buildStatementPayload(), companyAuthCode };
    const govTestScenario = document.getElementById("govTestScenario").value.trim();
    const govTestScenarioHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    // The own presenter rides in the submit request alone. The record rendered afterwards is built from payload,
    // so it is kept off payload and sent separately.
    const submission = await window.submitConfirmationStatement(ownPresenter ? { ...payload, ownPresenter } : payload, {
      ...govTestScenarioHeaders,
      ...languageHeaders(),
    });
    showSubmissionProgress(
      window.siteText(
        "ch.accounts.gateway-accepted",
        "Submission {number} accepted by the gateway at {time}. Waiting for Companies House...",
      ),
      { number: submission.submissionNumber, time: submission.gatewayTimestamp },
    );
    showView("resultView");

    await checkOutcome(submission, { ...govTestScenarioHeaders, ...ownPresenterHeaders() }, payload);
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
    showStatus(
      describeSubmissionError(
        error,
        window.siteText("ch.cs.file-failed", "Failed to file the confirmation statement with Companies House."),
      ),
      "error",
    );
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
      showStatus(
        window.siteText("ch.cs.payment-failed-reason", "Failed to start payment: {reason}", {
          reason: body.message || body.error || window.siteText("ch.cs.unknown-error", "Unknown error"),
        }),
        "error",
      );
      return;
    }
    sessionStorage.setItem(CHECKOUT_RESUME_KEY, companyNumber);
    window.location.href = body.checkoutUrl;
  } catch (error) {
    console.error("Failed to start the confirmation statement payment:", error);
    showStatus(error.message || window.siteText("ch.cs.payment-failed", "Failed to start payment."), "error");
  } finally {
    hideLoading();
  }
}

async function resumeAfterActivityCheckout(companyNumber) {
  await lookUpCompany(companyNumber);
  if (company) {
    showStatus(
      window.siteText("ch.cs.payment-received", "Payment received for this filing. Enter the company authentication code to finish it."),
      "success",
    );
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
  ownPresenter = null;
  filingData = null;
  currentDirectors = [];
  currentOfficers = [];
  currentPscs = [];
  document.getElementById("companyForm").reset();
  document.getElementById("authForm").reset();
  syncOwnPresenterFields();
  document.getElementById("reviewForm").reset();
  document.getElementById("directorRowsContainer").replaceChildren();
  document.getElementById("shareClassesContainer").replaceChildren();
  document.getElementById("shareholdingsContainer").replaceChildren();
  document.getElementById("rejections").style.display = "none";
  document.getElementById("filingRecord").replaceChildren();
  document.getElementById("pscFollowUp").style.display = "none";
  document.getElementById("startAgainBtn").style.display = "none";
  document.getElementById("checkAgainBtn").style.display = "none";
  document.getElementById("previewFeeMessage").style.display = "none";
  document.getElementById("submitFilingBtn").textContent = window.siteText("ch.cs.submit", "Submit to Companies House");
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
    showStatus(
      window.siteText("ch.cs.payment-not-completed", "Payment was not completed. Choose Pay and submit again when ready."),
      "warning",
    );
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
document.getElementById("useOwnPresenter").addEventListener("change", syncOwnPresenterFields);
document.getElementById("reviewForm").addEventListener("submit", handleReviewFormSubmit);
document.getElementById("addShareClassBtn").addEventListener("click", () => addShareClassRow());
document.getElementById("addShareholdingBtn").addEventListener("click", () => addShareholdingRow());
document.getElementById("shareholdingsContainer").addEventListener("click", (event) => {
  if (event.target.classList.contains("add-transfer-row")) {
    const holdingIndex = event.target.getAttribute("data-holding-index");
    const transfersContainer = document.querySelector(`.transfers-container[data-holding-index="${holdingIndex}"]`);
    const nextTransferIndex = transfersContainer.querySelectorAll("[data-transfer-row]").length;
    if (nextTransferIndex >= MAX_TRANSFERS_PER_SHAREHOLDING) {
      showStatus(
        window.siteText("ch.cs.max-transfers", "A shareholding may carry at most {max} transfers.", {
          max: MAX_TRANSFERS_PER_SHAREHOLDING,
        }),
        "error",
      );
      return;
    }
    transfersContainer.append(buildTransferRow(holdingIndex, nextTransferIndex));
  }
  if (event.target.classList.contains("remove-transfer-row")) {
    event.target.closest("[data-transfer-row]").remove();
  }
  if (event.target.classList.contains("add-joint-holder-row")) {
    const holdingIndex = Number.parseInt(event.target.getAttribute("data-holding-index"), 10);
    if (!Number.isInteger(holdingIndex)) return;
    const jointHoldersContainer = document.querySelector(`.joint-holders-container[data-holding-index="${holdingIndex}"]`);
    const nextShareholderIndex = jointHoldersContainer.querySelectorAll("[data-shareholder-row]").length;
    if (nextShareholderIndex >= MAX_JOINT_HOLDERS_PER_SHAREHOLDING) {
      showStatus(
        window.siteText("ch.cs.max-joint-holders", "A shareholding may carry at most {max} joint holders.", {
          max: MAX_JOINT_HOLDERS_PER_SHAREHOLDING,
        }),
        "error",
      );
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
