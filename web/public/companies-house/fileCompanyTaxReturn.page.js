// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// File Company Tax Return: companyView -> formView -> previewView -> resultView. The customer
// types the figures (or a book fills them through the "Fill from your books" card); the form
// checks them as they are entered and works the tax out beside them. The Government Gateway user
// ID and password are read from the page when the return is submitted, sent once and held nowhere
// else.

import {
  ACCOUNTS_REGIMES,
  ACCOUNTS_TEXT_FIELDS,
  BALANCE_SHEET_FIELDS,
  CT600_BOX_ROWS,
  CT600_FORM_FIELDS,
  DONATIONS_PAID_FIELD,
  FIRST_PERIOD_START_FIELD,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_FIELDS,
  MICRO_BALANCE_SHEET_FIELDS,
  MICRO_PROFIT_AND_LOSS_FIELDS,
  MICRO_STATEMENT_FIELD,
  PROFIT_AND_LOSS_FIELDS,
  SECTIONS,
  STATEMENT_FIELDS,
  TEXT_BOXES,
  accountsFromValues,
  balanceSheetId,
  PER_PERIOD_FIELD_IDS,
  PER_PERIOD_LOAN_QUESTION_IDS,
  LONG_PERIOD_DONATIONS_LABEL,
  boxChangeTarget,
  boxRow,
  lineChangeTarget,
  longPeriodOf,
  periodFieldId,
  secondPeriodField,
  ct600RequestFromValues,
  figuresFromValues,
  financialYearOf,
  formProblems,
  guideUrl,
  loanId,
  loanRowNumbers,
  microId,
  noteId,
  profitAndLossId,
  regimeOf,
  repaymentId,
  repaymentRowNumbers,
  reviewAnswers,
  targetOfModelProblem,
} from "../lib/ct600-fields.js";
import { longDateText, returnDueDate, taxDueDate } from "../lib/long-period.js";
import {
  DEFAULT_AGENT_STATUS,
  agentRequestFields,
  clientChoices,
  clientFilingStop,
  rememberPracticeName,
  rememberedPracticeName,
} from "../lib/ct600-agent.js";

const JOINT_STORAGE_KEY = "jointFiling";
const MAX_POLLS = 60;
const MAX_COMPANIES_HOUSE_POLLS = 8;
const COMPANY_AUTH_CODE_LENGTH = { min: 6, max: 8 };
const WORKED_TAX_ID = "workedTax";
const SUMMARY_ID = "ct600-error-summary";
const PLACEHOLDER_UTR = "0000000000";
const PLACEHOLDER_TEXT = "Placeholder";

// Each computation line in the order HMRC's computation prints it: a deduction shows in
// brackets, a subtotal has a rule above it and the total a double rule below it.
const COMPUTATION_LINES = [
  { field: "profitLossPerAccounts", meaning: "Profit or loss per the accounts" },
  { field: "nonTradingLoanRelationshipCredits", meaning: "Less: non-trading loan relationship credits", deduction: true },
  { field: "depreciation", meaning: "Add: depreciation" },
  { field: "amortisation", meaning: "Add: amortisation" },
  { field: "entertaining", meaning: "Add: entertaining" },
  { field: "donations", meaning: "Add: donations" },
  { field: "adjustedProfitBeforeAccountingPeriodAdjustments", meaning: "Adjusted profit before the time apportionment", style: "subtotal" },
  { field: "timeApportionment", meaning: "Time apportionment", deduction: false },
  { field: "adjustedProfitBeforeCapitalAllowances", meaning: "Adjusted profit before capital allowances", style: "subtotal" },
  { field: "totalCapitalAllowances", meaning: "Less: total capital allowances", deduction: true },
  { field: "adjustedProfit", meaning: "Adjusted profit", style: "total" },
];

const RETURN_TO_REVIEW = "Return to the review";
const PREVIEW_THE_RETURN = "Preview the return";
const VIEW_HASH = { companyView: "company", formView: "form", previewView: "review", resultView: "result" };

let company = null;
let previewRequest = null;
let reviewedValues = null;
let reviewedPreview = null;
let currentView = "companyView";
let reviewReached = false;
let changing = null;
let companiesHousePollWindow = 0;
// The practice's clients, once the clients call answers 200, and the one the return is for. A practice
// filing for a client signs as its agent; with no client the return is the company's own.
let practiceClients = null;
let agentClient = null;

// What the customer chose to send and how far each filing has got. companiesHouse holds the
// accounts submission once it is sent; its statusCode is PENDING, PARKED, ACCEPT or REJECT.
// amendment is set while the customer amends an accepted filing: accounts is true when revised
// accounts go to Companies House before the amended return. revision names the accounts already
// filed that the revised accounts replace; both requests carry it once it is set.
const sending = {
  mode: "hmrc",
  copy: "full",
  jointFilingId: null,
  companiesHouse: null,
  taxReturnSent: false,
  taxReturnAccepted: false,
  amendment: null,
  revision: null,
  // A period of account over 12 months: the filing id both returns share and what each return has reached.
  longPeriod: null,
};

// The boxes each accepted return was filed with, and the errors HMRC gave each return, for a long period of account.
let filedLongBoxes = [null, null];
let longErrors = [null, null];

// bundle and taxData fill in once the books bundle has loaded; touched holds the error targets whose
// field the customer has left; edited holds the ids the customer typed in, so a default stops following.
const state = {
  bundle: null,
  bundlePromise: null,
  taxData: {},
  touched: new Set(),
  edited: new Set(),
  workingSheet: undefined,
  problems: [],
};

function element(id) {
  return document.getElementById(id);
}

function showView(name, { push = true } = {}) {
  for (const id of Object.keys(VIEW_HASH)) {
    element(id).style.display = id === name ? "block" : "none";
  }
  if (push && name !== currentView) history.pushState({ view: name }, "", `#${VIEW_HASH[name]}`);
  currentView = name;
}

// The browser's Back and Forward move between the views the customer has been to. A view whose
// content does not exist yet falls back to the form, or to the company lookup before a company.
function viewForHistory(hash) {
  const name = Object.keys(VIEW_HASH).find((id) => `#${VIEW_HASH[id]}` === hash) ?? "companyView";
  if (name === "companyView" || company) {
    if (name === "previewView" && !previewRequest) return "formView";
    if (name === "resultView") return element("returnResult").firstChild ? "resultView" : "formView";
    return name;
  }
  return "companyView";
}

function create(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function paragraph(...parts) {
  const node = document.createElement("p");
  for (const part of parts) {
    if (typeof part === "string") {
      node.append(part);
    } else {
      const strong = document.createElement("strong");
      strong.textContent = String(part.strong);
      node.append(strong);
    }
  }
  return node;
}

function visuallyHidden(text) {
  return create("span", { class: "visually-hidden" }, text);
}

function tableRow(...cells) {
  const row = document.createElement("tr");
  for (const cell of cells) {
    const td = document.createElement("td");
    if (cell instanceof Node) {
      td.append(cell);
    } else {
      td.textContent = String(cell);
    }
    row.append(td);
  }
  return row;
}

// An amount as printed accounts show it: thousands separators, pence only when there are any,
// and brackets around a deduction or a negative amount (but not both).
function formatPounds(value, deduction = false) {
  const amount = Number(value);
  const digits = Number.isInteger(amount) ? 0 : 2;
  const text = Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return amount !== 0 && deduction !== amount < 0 ? `(${text})` : text;
}

function amountCell(cell, text, style) {
  cell.textContent = text;
  cell.classList.add("amount");
  if (style) cell.classList.add(`amount--${style}`);
}

// --- The form -------------------------------------------------------------------------------

function guideAnchorOf(field) {
  return field.box ? boxRow(field.box)?.anchor : undefined;
}

function hintOf(field) {
  const hint = create("p", { id: `${field.id}-hint`, class: "hint" }, field.hint ?? "");
  const anchor = guideAnchorOf(field);
  if (!field.hint && !anchor) hint.hidden = true;
  if (anchor) {
    const link = create("a", { href: guideUrl(anchor), target: "_blank", rel: "noopener" }, "Company Tax Return guide");
    hint.append(field.hint ? " " : "", link, ".");
  }
  return hint;
}

function inputFor(field) {
  const money = field.type === "whole-pounds" || field.type === "pounds-and-pence";
  const attributes = {
    "type": field.type === "date" ? "date" : "text",
    "id": field.id,
    "name": field.id,
    "data-error-target": field.target ?? field.id,
    "aria-describedby": `${field.id}-hint`,
  };
  if (money) attributes.inputmode = "decimal";
  if (field.type === "count") attributes.inputmode = "numeric";
  if (field.inputmode) attributes.inputmode = field.inputmode;
  if (field.maxlength) attributes.maxlength = String(field.maxlength);
  if (field.spellcheck === false) attributes.spellcheck = "false";
  const input = create("input", attributes);
  if (field.default !== undefined) input.value = field.default;
  if (!money) return input;
  return create(
    "div",
    { class: "input-prefix input-prefix--amount" },
    create("span", { "class": "prefix", "aria-hidden": "true" }, "£"),
    input,
  );
}

function errorHost(target) {
  return create("div", { id: `${target}-errors` });
}

function textGroup(field) {
  return create(
    "div",
    { class: "form-group" },
    create("label", { for: field.id }, field.label),
    hintOf(field),
    errorHost(field.id),
    inputFor(field),
  );
}

function choiceRow(input, label) {
  return create("div", { class: "choice" }, input, label);
}

function choiceGroup(field) {
  const radio = (value, text, checked) =>
    choiceRow(
      create("input", {
        "type": "radio",
        "id": `${field.id}${value === "no" ? "No" : "Yes"}`,
        "name": field.id,
        value,
        "data-error-target": field.id,
        "aria-describedby": `${field.id}-hint`,
        ...(checked ? { checked: "" } : {}),
      }),
      create("label", { for: `${field.id}${value === "no" ? "No" : "Yes"}` }, text),
    );
  const hint = field.hint ? hintOf(field) : create("p", { id: `${field.id}-hint`, class: "hint" });
  return create(
    "div",
    { class: "form-group" },
    create("p", { id: field.id, class: "field-label", tabindex: "-1" }, field.label),
    hint,
    errorHost(field.id),
    radio("no", "No", field.default !== "yes"),
    radio("yes", "Yes", field.default === "yes"),
  );
}

function datesGroup(field) {
  const dateField = (id, text) =>
    create("div", { class: "form-group" }, create("label", { for: id }, text), inputFor({ id, type: "date", target: field.id }));
  return create(
    "div",
    { "class": "form-group", "id": field.id, "role": "group", "aria-labelledby": `${field.id}-label`, "tabindex": "-1" },
    create("p", { id: `${field.id}-label`, class: "field-label" }, field.label),
    hintOf(field),
    errorHost(field.id),
    dateField("periodStart", "Period start"),
    dateField("periodEnd", "Period end"),
  );
}

function checkboxGroup(id, label, target = id) {
  return create(
    "div",
    { class: "form-group" },
    errorHost(target),
    choiceRow(create("input", { "type": "checkbox", id, "name": id, "data-error-target": target }), create("label", { for: id }, label)),
  );
}

function fieldGroup(field) {
  if (field.type === "choice") return choiceGroup(field);
  if (field.type === "dates") return datesGroup(field);
  if (field.type === "checkbox") return checkboxGroup(field.id, field.label);
  return textGroup(field);
}

// --- The second accounting period of a long period of account -----------------------------------
// Each per-period field sits beside a second column that shows only when the period of account is
// longer than 12 months. The first column keeps the field's own id; the second adds the suffix Ap2.

const PERIOD_HINT_FIELDS = new Set(["annualInvestmentAllowance", "mainPoolAllowances"]);

function returnTag(group, part) {
  const label = group.querySelector("label, p.field-label");
  label?.append(create("span", { class: "long-only", hidden: "" }, ` (return ${part})`));
}

function withPeriodHint(group, id, part) {
  if (!PERIOD_HINT_FIELDS.has(id)) return;
  group.querySelector(".hint")?.append(create("span", { "class": "period-hint", "data-period-hint": `${id}:${part}` }));
}

// A field and its second column: the first group is the field's own, the second is hidden until the period is long.
function periodPair(field, firstGroup, secondGroup) {
  returnTag(firstGroup, 1);
  withPeriodHint(firstGroup, field.id, 1);
  withPeriodHint(secondGroup, field.id, 2);
  secondGroup.classList.add("period-pair__second");
  secondGroup.hidden = true;
  return create("div", { class: "period-pair" }, firstGroup, secondGroup);
}

function pairedFieldGroup(field) {
  return periodPair(field, fieldGroup(field), fieldGroup(secondPeriodField(field)));
}

// A ledger: one row per line of the accounts, one column per year or movement. Every input
// carries its full name in a hidden label, so a screen reader hears "Turnover, last year".
function ledgerCell(column, cell) {
  const input = inputFor({ id: cell.id, type: "whole-pounds" });
  input.querySelector("input").removeAttribute("aria-describedby");
  return create(
    "td",
    { "class": ["ledger__figure", column.className].filter(Boolean).join(" "), "data-column": column.title },
    create("label", { for: cell.id, class: "visually-hidden" }, cell.label),
    input,
  );
}

function ledger({ caption, columns, rows, className }) {
  const head = create(
    "tr",
    {},
    create("th", { scope: "col" }, caption ? visuallyHidden("Line") : "Line"),
    ...columns.map((column) =>
      create("th", { scope: "col", class: ["ledger__figure", column.className].filter(Boolean).join(" ") }, column.title),
    ),
  );
  const body = rows.map((row) =>
    create(
      "tr",
      {},
      create("th", { scope: "row" }, row.label, ...row.cells.map((cell) => errorHost(cell.id))),
      ...columns.map((column, index) => ledgerCell(column, row.cells[index])),
    ),
  );
  return create(
    "table",
    { class: ["ledger", className].filter(Boolean).join(" ") },
    ...(caption ? [create("caption", {}, caption)] : []),
    create("thead", {}, head),
    create("tbody", {}, ...body),
  );
}

const YEAR_COLUMNS = [
  { key: "current", title: "This year", when: "this year" },
  { key: "prior", title: "Last year", when: "last year", className: "ledger__prior" },
];

function yearLedger(fields, idOf) {
  return ledger({
    className: "ledger--years ledger--one-year",
    columns: YEAR_COLUMNS,
    rows: fields.map(([field, label]) => ({
      label,
      cells: YEAR_COLUMNS.map(({ key, when }) => ({ id: idOf(key, field), label: `${label}, ${when}` })),
    })),
  });
}

// The note's six movements as two columns, cost and depreciation, in three rows.
const NOTE_COLUMNS = [{ title: "Cost" }, { title: "Depreciation" }];
const NOTE_ROWS = [
  ["At the start of the period", "costAtStart", "depreciationAtStart"],
  ["Added in the period", "additions", "depreciationCharge"],
  ["Taken out on disposals", "disposals", "depreciationOnDisposals"],
];

function noteLedger(className, title) {
  const labelOf = (field) => `${title}: ${FIXED_ASSET_FIELDS.find(([candidate]) => candidate === field)[1]}`;
  return ledger({
    caption: title,
    columns: NOTE_COLUMNS,
    rows: NOTE_ROWS.map(([label, ...fields]) => ({
      label,
      cells: fields.map((field) => ({ id: noteId(className, field), label: labelOf(field) })),
    })),
  });
}

function accountsTextGroup({ id, label, type }) {
  if (type === "textarea") {
    return create(
      "div",
      { class: "form-group" },
      create("label", { for: id }, label),
      errorHost(id),
      create("textarea", { id, "name": id, "rows": "3", "data-error-target": id }),
    );
  }
  return textGroup({ id, label, type, hint: "" });
}

const SEND_TO_HMRC_ONLY_HINT = "The accounts go to HMRC with the Company Tax Return.";
const SEND_TO_BOTH_HINT =
  "To file at both, Companies House gets the accounts first. When it accepts them, the Company Tax Return goes to HMRC with the same figures.";

// Where the accounts go: HMRC with the return, or Companies House first and then HMRC. The joint
// choice stays hidden and disabled until the catalogue says it is offered in this environment.
function sendToSection() {
  const radio = (id, value, text, checked) =>
    choiceRow(
      create("input", {
        "type": "radio",
        id,
        "name": "sendTo",
        value,
        "data-error-target": "sendTo",
        "aria-describedby": "sendTo-hint",
        ...(checked ? { checked: "" } : {}),
      }),
      create("label", { for: id }, text),
    );
  return create(
    "section",
    { id: "section-sendTo", class: "form-section" },
    create("h3", {}, "Where the accounts go"),
    create(
      "div",
      { class: "form-group" },
      create("p", { id: "sendTo", class: "field-label", tabindex: "-1" }, "Where are you sending these accounts?"),
      create("p", { id: "sendTo-hint", class: "hint" }, SEND_TO_HMRC_ONLY_HINT),
      errorHost("sendTo"),
      radio("sendToHmrc", "hmrc", "To HMRC with the Company Tax Return", true),
      radio("sendToBoth", "both", "To Companies House and to HMRC with the Company Tax Return", false),
    ),
  );
}

// The joint filing has its own catalogue activity. The page offers the choice only when that
// activity is shown to this person in this environment, and refuses to amend a joint filing
// otherwise. A catalogue or environment that cannot be read leaves the choice off.
async function readJointFilingOffered() {
  try {
    const service = await import("/lib/services/catalog-service.js");
    const viewerSettings = await import("/lib/services/viewer-settings.js");
    const [text, environmentName, viewer] = await Promise.all([
      service.fetchCatalogText(),
      service.fetchCurrentEnvironmentName(),
      viewerSettings.fetchViewer(),
    ]);
    return service.isJointFilingOffered(service.parseCatalogueText(text), environmentName, viewer);
  } catch (error) {
    console.warn("The joint filing choice is off because the catalogue could not be read:", error);
    return false;
  }
}

const jointFilingOffered = readJointFilingOffered();

async function applyJointFilingOffer() {
  const offered = await jointFilingOffered;
  const both = element("sendToBoth");
  both.disabled = Boolean(agentClient) || !offered;
  both.closest(".choice").hidden = !offered;
  element("sendTo-hint").textContent = offered ? SEND_TO_BOTH_HINT : SEND_TO_HMRC_ONLY_HINT;
  if (!offered && both.checked) {
    element("sendToHmrc").checked = true;
    applyRegime();
  }
}

// Companies House can take the accounts in full or filleted; HMRC always takes the full accounts.
function companiesHouseCopyGroup() {
  const radio = (id, value, text, checked) =>
    choiceRow(
      create("input", {
        "type": "radio",
        id,
        "name": "companiesHouseCopy",
        value,
        "data-error-target": "companiesHouseCopy",
        "aria-describedby": "companiesHouseCopy-hint",
        ...(checked ? { checked: "" } : {}),
      }),
      create("label", { for: id }, text),
    );
  return create(
    "div",
    { id: "companiesHouseCopyGroup", class: "form-group", hidden: "" },
    create("p", { id: "companiesHouseCopy", class: "field-label", tabindex: "-1" }, "Which copy goes to Companies House?"),
    create(
      "p",
      { id: "companiesHouseCopy-hint", class: "hint" },
      "Companies House publishes what it receives. Filleted accounts leave the profit and loss account and the directors' report out of the public copy. HMRC gets the full accounts either way.",
    ),
    errorHost("companiesHouseCopy"),
    radio("copyFull", "full", "Full accounts", true),
    radio("copyFilleted", "filleted", "Filleted accounts", false),
  );
}

function companiesHouseMicroNote() {
  return create(
    "p",
    { id: "companiesHouseMicroNote", class: "hint", hidden: "" },
    "Companies House receives the micro-entity balance sheet and notes. The profit and loss account goes to HMRC only.",
  );
}

// Which accounts the return carries. The card picks the regime from the size of the company in the book.
function regimeGroup() {
  return create(
    "div",
    { class: "form-group" },
    create("p", { id: "accountsRegime", class: "field-label", tabindex: "-1" }, "Which accounts does the company prepare?"),
    create(
      "p",
      { id: "accountsRegime-hint", class: "hint" },
      "A micro-entity meets two of these: turnover up to £1 million, a balance sheet total up to £500,000, and 10 employees or fewer. A book picks this for you.",
    ),
    errorHost("accountsRegime"),
    ...ACCOUNTS_REGIMES.map(({ value, id, label }) =>
      choiceRow(
        create("input", {
          "type": "radio",
          id,
          "name": "accountsRegime",
          value,
          "data-error-target": "accountsRegime",
          "aria-describedby": "accountsRegime-hint",
          ...(value === "small" ? { checked: "" } : {}),
        }),
        create("label", { for: id }, label),
      ),
    ),
  );
}

function forRegime(regime, ...children) {
  return create("div", { "data-regime": regime }, ...children);
}

function microLedger(fields, className) {
  return ledger({
    className,
    columns: YEAR_COLUMNS,
    rows: fields.map(([field, label]) => ({
      label,
      cells: YEAR_COLUMNS.map(({ key, when }) => ({ id: microId(key, field), label: `${label}, ${when}` })),
    })),
  });
}

function accountsSection() {
  return [
    create(
      "p",
      { class: "hint" },
      "HMRC takes the full accounts with the return, so they are part of this form. Enter whole pounds, for example 600 or 1,200.",
    ),
    regimeGroup(),
    companiesHouseCopyGroup(),
    companiesHouseMicroNote(),
    checkboxGroup("includeComparatives", "Include last year's figures"),
    forRegime(
      "small",
      create("h4", {}, "Profit and loss account"),
      yearLedger(PROFIT_AND_LOSS_FIELDS, profitAndLossId),
      create("h4", {}, "Balance sheet"),
      yearLedger(BALANCE_SHEET_FIELDS, balanceSheetId),
      create("h4", {}, "Tangible fixed assets note"),
      checkboxGroup("includeFixedAssetNote", "Include the tangible fixed assets note"),
      create(
        "div",
        { id: "fixedAssetNoteFields", style: "display: none" },
        ...FIXED_ASSET_CLASSES.map(([className, title]) => noteLedger(className, title)),
      ),
    ),
    forRegime(
      "micro",
      create("h4", {}, "Profit and loss account"),
      create("p", { class: "hint" }, "Profit before tax and the profit for the year are worked out from these lines."),
      microLedger(MICRO_PROFIT_AND_LOSS_FIELDS, "ledger--years ledger--one-year"),
      create("h4", {}, "Balance sheet"),
      create("p", { class: "hint" }, "Micro-entity accounts always show last year's balance sheet beside this year's."),
      microLedger(MICRO_BALANCE_SHEET_FIELDS),
    ),
    create("h4", {}, "About the accounts"),
    ...ACCOUNTS_TEXT_FIELDS.map((field) => (field.smallOnly ? forRegime("small", accountsTextGroup(field)) : accountsTextGroup(field))),
  ];
}

function workedTaxPanel() {
  return create(
    "section",
    { "id": WORKED_TAX_ID, "class": "worked-tax", "aria-labelledby": "workedTaxHeading", "tabindex": "-1" },
    create("h3", { id: "workedTaxHeading" }, "Tax worked out from your answers"),
    create("p", { class: "hint" }, "These boxes are worked out and cannot be typed. Each shows the rule that gives it."),
    errorHost(WORKED_TAX_ID),
    create("p", { id: "workedTaxEmpty", class: "hint" }, "Fill in the period and the accounts and the tax appears here."),
    create("dl", { id: "workedTaxRows", class: "worked-tax__list" }),
    create("div", { id: "workedTaxLong", class: "worked-tax__returns", hidden: "" }),
  );
}

// The capital allowance boxes in the order of the CT600, grouped by the class of asset they claim for.
const ALLOWANCE_CLASSES = [
  { title: "Annual investment allowance", ids: ["annualInvestmentAllowance", "annualInvestmentAllowanceOutsideTrade"] },
  { title: "Main pool", ids: ["mainPoolAllowances", "mainPoolBalancingCharges"] },
  { title: "Full expensing", ids: ["fullExpensingAllowances", "fullExpensingBalancingCharges"] },
  {
    title: "Special rate allowance",
    ids: ["specialRateAllowances", "specialRateBalancingCharges", "specialRateAllowanceExpenditure"],
  },
  {
    title: "Special rate pool",
    ids: ["specialRatePoolAllowances", "specialRatePoolAnnualInvestmentAllowance", "specialRatePoolBalancingCharges"],
  },
  { title: "First year allowance and other plant", ids: ["firstYearAllowanceExpenditure", "otherMachineryAndPlantExpenditure"] },
];

// Each class gets a heading and its boxes side by side where the width allows, so the section reads as six groups.
function allowanceClasses(fields) {
  const byId = new Map(
    fields.map((group, index) => [CT600_FORM_FIELDS.filter((field) => field.section === "allowances")[index].id, group]),
  );
  const grouped = ALLOWANCE_CLASSES.flatMap(({ title, ids }) => [
    create("h4", {}, title),
    create("div", { class: "allowance-grid" }, ...ids.map((id) => byId.get(id))),
  ]);
  const ungrouped = [...byId].filter(([id]) => !ALLOWANCE_CLASSES.some(({ ids }) => ids.includes(id))).map(([, group]) => group);
  return [...grouped, ...ungrouped];
}

// --- Loans to participators: rows the customer adds and removes -------------------------------
// Each accounting period of a long period of account has its own set of rows. Part 2's ids carry the
// suffix Ap2.

const loanRows = { 1: 1, 2: 1 };
const repaymentRows = { 1: 1, 2: 1 };
const PARTS = [1, 2];

function moneyGroup(id, label, hint) {
  return textGroup({ id, label, type: "whole-pounds", hint });
}

function removeButton(kind, row, part, label) {
  return create(
    "button",
    { "type": "button", "class": "secondary", "data-remove": kind, "data-row": String(row), "data-part": String(part) },
    label,
  );
}

function registerTargets(group) {
  for (const node of group.querySelectorAll("[data-error-target]")) state.targets?.add(node.dataset.errorTarget);
}

function loanRow(row, part) {
  const group = create(
    "div",
    { "class": "loan-row", "data-loan-row": String(row), "data-part": String(part) },
    textGroup({ id: loanId("Name", row, part), label: "Name of participator or associate", type: "text", maxlength: 56 }),
    moneyGroup(loanId("Amount", row, part), "Amount still owed at the end of the period", "For example, £12,000"),
    create(
      "div",
      { "class": "loan-row__lent", "data-loan-lent": String(row), "hidden": "" },
      moneyGroup(
        loanId("Lent", row, part),
        "Of this, the amount lent on or after the rate change",
        "Leave it empty when none was lent after the change",
      ),
    ),
    textGroup({
      id: loanId("Rate", row, part),
      label: "Section 455 rate for this loan, if you want to use another (%)",
      type: "text",
      hint: "Leave it empty to use the rate shown with the worked tax. A rate you enter is not checked against the tax data.",
      inputmode: "decimal",
    }),
    removeButton("loan", row, part, "Remove this loan"),
  );
  registerTargets(group);
  return group;
}

function repaymentRow(row, part) {
  const nameId = repaymentId("Name", row, part);
  const select = create("select", { "id": nameId, "name": nameId, "data-error-target": nameId });
  const group = create(
    "div",
    { "class": "loan-row", "data-repayment-row": String(row), "data-part": String(part) },
    create("div", { class: "form-group" }, create("label", { for: nameId }, "Participator"), errorHost(nameId), select),
    textGroup({ id: repaymentId("Date", row, part), label: "Date", type: "date" }),
    moneyGroup(repaymentId("Repaid", row, part), "Amount repaid", "Leave it empty when none was repaid"),
    moneyGroup(
      repaymentId("Released", row, part),
      "Amount released or written off",
      "Leave it empty when none was released or written off",
    ),
    removeButton("repayment", row, part, "Remove this repayment"),
  );
  registerTargets(group);
  return group;
}

function addLoanRow(part = 1) {
  const row = loanRows[part]++;
  element(periodFieldId("loanRows", part)).append(loanRow(row, part));
  syncRepaymentNames();
  return row;
}

function addRepaymentRow(part = 1) {
  const row = repaymentRows[part]++;
  element(periodFieldId("repaymentRows", part)).append(repaymentRow(row, part));
  syncRepaymentNames();
  return row;
}

// The three questions of one set of loans, for one accounting period.
function loansPartBody(part, questions) {
  const [loansMade, releasedBeforeEnd, repaidSince] = questions;
  const id = (name) => periodFieldId(name, part);
  return [
    loansMade,
    ...(part === 1 ? [create("p", { id: "loansBookNote", class: "hint", hidden: "" })] : []),
    create(
      "div",
      { id: id("loansDetail"), hidden: "" },
      create("h4", {}, "Loans still owed at the end of the period"),
      create("div", { id: id("loanRows") }),
      create(
        "button",
        { "type": "button", "id": id("addLoanBtn"), "class": "secondary", "data-part": String(part) },
        "Add another participator",
      ),
      releasedBeforeEnd,
      repaidSince,
      create(
        "div",
        { id: id("repaymentsDetail"), hidden: "" },
        create("h4", {}, "Repayments, releases and write-offs since the period end"),
        create(
          "p",
          { class: "hint" },
          "Enter what was repaid up to today. You claim relief on later repayments from HMRC after they are made.",
        ),
        create("div", { id: id("repaymentRows") }),
        create(
          "button",
          { "type": "button", "id": id("addRepaymentBtn"), "class": "secondary", "data-part": String(part) },
          "Add another repayment",
        ),
      ),
    ),
  ];
}

function loansSection(fields) {
  const first = fields.map(fieldGroup);
  for (const group of first) returnTag(group, 1);
  const second = fields.map((field) => fieldGroup({ ...secondPeriodField(field), focus: `${periodFieldId(field.id, 2)}No` }));
  return [
    ...loansPartBody(1, first),
    create(
      "div",
      { id: "loansPart2", hidden: "" },
      create("h4", { id: "loansPart2Heading" }, "Return 2 of 2: the second accounting period"),
      ...loansPartBody(2, second),
    ),
  ];
}

// Each repayment names one of the participators in the loans above it.
function syncRepaymentNames() {
  for (const part of PARTS) {
    const names = [...element(periodFieldId("loanRows", part)).querySelectorAll('input[id^="loanName"]')]
      .map((input) => input.value.trim())
      .filter(Boolean);
    for (const select of element(periodFieldId("repaymentRows", part)).querySelectorAll("select")) {
      const chosen = select.value;
      select.replaceChildren(
        create("option", { value: "" }, "Choose a participator"),
        ...[...new Set(names)].map((name) => create("option", { value: name }, name)),
      );
      select.value = names.includes(chosen) ? chosen : "";
    }
  }
}

// Whether an accounting period crosses a date at which the section 455 rate changes decides if each loan asks for the part lent after it.
function showLoanDetail(values) {
  const long = longPeriodOf(values);
  for (const part of PARTS) {
    const asked = values[periodFieldId("loansMade", part)] === "yes" && (part === 1 || Boolean(long));
    const repaid = values[periodFieldId("repaidSince", part)] === "yes";
    element(periodFieldId("loansDetail", part)).hidden = !asked;
    if (asked && loanRowNumbers(values, part).length === 0) addLoanRow(part);
    element(periodFieldId("repaymentsDetail", part)).hidden = !(asked && repaid);
    if (asked && repaid && repaymentRowNumbers(values, part).length === 0) addRepaymentRow(part);
    const period = long ? long.periods[part - 1] : { periodStart: values.periodStart, periodEnd: values.periodEnd };
    let crosses = false;
    if (state.bundle && period.periodStart && period.periodEnd) {
      try {
        crosses = Boolean(state.bundle.section455RateChangeDate(period.periodStart, period.periodEnd, taxDataByYear()));
      } catch {
        crosses = false;
      }
    }
    for (const node of element(periodFieldId("loanRows", part)).querySelectorAll("[data-loan-lent]")) node.hidden = !crosses;
  }
}

function removeRow(kind, row, part) {
  const selector = kind === "loan" ? `[data-loan-row="${row}"]` : `[data-repayment-row="${row}"]`;
  element(periodFieldId(kind === "loan" ? "loanRows" : "repaymentRows", part))
    .querySelector(selector)
    ?.remove();
  syncRepaymentNames();
  refresh();
}

function handleLoanButton(event) {
  const button = event.target.closest?.("button");
  if (!button) return;
  const part = Number(button.dataset.part ?? 1);
  if (button.id === periodFieldId("addLoanBtn", part)) addLoanRow(part);
  else if (button.id === periodFieldId("addRepaymentBtn", part)) addRepaymentRow(part);
  else if (button.dataset.remove) removeRow(button.dataset.remove, button.dataset.row, part);
  else return;
  refresh();
}

// A book fill names rows that do not exist yet: make the rows its entries need.
function growRowsFor(entries) {
  const ids = new Set(entries.map(([id]) => id));
  for (const part of PARTS) {
    for (let row = 1; row <= 999; row += 1) {
      if (!ids.has(loanId("Name", row, part))) break;
      if (!element(periodFieldId("loanRows", part)).querySelector(`[data-loan-row="${row}"]`)) {
        loanRows[part] = row;
        addLoanRow(part);
      }
    }
  }
}

function periodStartQuestion() {
  const group = choiceGroup({
    id: FIRST_PERIOD_START_FIELD,
    label: "Does the first accounting period start on the first day of the accounts?",
    hint: "Answer Yes when the company's accounting period began on the first day of these accounts. Submit files a long period only from there.",
    default: "yes",
  });
  group.id = "firstPeriodStartGroup";
  group.hidden = true;
  return group;
}

function longPeriodPanel() {
  return create("div", { id: "longPeriodPanel", class: "long-period-panel", role: "status", hidden: "" });
}

function fieldGroupsOf(sectionId) {
  return CT600_FORM_FIELDS.filter((field) => field.section === sectionId).map((field) =>
    PER_PERIOD_FIELD_IDS.includes(field.id) ? pairedFieldGroup(field) : fieldGroup(field),
  );
}

function sectionBody(sectionId) {
  const fields = fieldGroupsOf(sectionId);
  if (sectionId === "period") return [...fields, longPeriodPanel(), periodStartQuestion()];
  if (sectionId === "allowances") return allowanceClasses(fields);
  if (sectionId === "loans") return loansSection(CT600_FORM_FIELDS.filter((field) => field.section === "loans"));
  if (sectionId === "reliefs") {
    const donationsPaid = pairedFieldGroup(DONATIONS_PAID_FIELD);
    donationsPaid.id = "donationsPaidGroup";
    donationsPaid.hidden = true;
    return [...fields, donationsPaid];
  }
  if (sectionId === "accounts") return accountsSection();
  if (sectionId === "declaration") {
    return [
      ...fields.slice(0, 2),
      create("h4", {}, "Statements"),
      ...STATEMENT_FIELDS.slice(0, 3).map(({ id, label }) => checkboxGroup(id, label)),
      forRegime("small", checkboxGroup(STATEMENT_FIELDS[3].id, STATEMENT_FIELDS[3].label)),
      forRegime("micro", checkboxGroup(MICRO_STATEMENT_FIELD.id, MICRO_STATEMENT_FIELD.label)),
      create("h4", {}, "Declaration"),
      ...fields.slice(2),
    ];
  }
  return fields;
}

function renderForm() {
  const sections = [sendToSection()];
  for (const { id, title } of SECTIONS) {
    sections.push(create("section", { id: `section-${id}`, class: "form-section" }, create("h3", {}, title), ...sectionBody(id)));
    if (id === "reliefs") sections.push(workedTaxPanel());
  }
  for (const part of PARTS) {
    loanRows[part] = 1;
    repaymentRows[part] = 1;
  }
  element("formSections").replaceChildren(...sections);
  state.targets = new Set([...element("formSections").querySelectorAll("[data-error-target]")].map((node) => node.dataset.errorTarget));
  state.targets.add(WORKED_TAX_ID);
  state.touched = new Set();
  state.edited = new Set();
  state.workingSheet = undefined;
  applyRegime();
  setDefaults();
  refresh();
}

// The form shows the fields of the regime it holds; the other regime's answers stay in place.
function applyRegime() {
  const values = readValues();
  const regime = regimeOf(values);
  for (const node of element("formSections").querySelectorAll("[data-regime]")) node.hidden = node.dataset.regime !== regime;
  const both = sendToOf(values) === "both";
  element("companiesHouseCopyGroup").hidden = !(both && regime === "small");
  element("companiesHouseMicroNote").hidden = !(both && regime === "micro");
}

function sendToOf(values) {
  return values.sendTo === "both" ? "both" : "hmrc";
}

function copyOf(values) {
  return values.companiesHouseCopy === "filleted" && regimeOf(values) === "small" ? "filleted" : "full";
}

function toggleSections() {
  const oneYear = !element("includeComparatives").checked;
  for (const table of element("formSections").querySelectorAll(".ledger--years")) table.classList.toggle("ledger--one-year", oneYear);
  element("fixedAssetNoteFields").style.display = element("includeFixedAssetNote").checked ? "block" : "none";
}

// --- Reading the form -----------------------------------------------------------------------

function readValues() {
  const values = {};
  for (const control of element("returnForm").querySelectorAll("input, textarea, select")) {
    if (control.type === "radio") {
      if (control.checked) values[control.name] = control.value;
    } else if (control.type === "checkbox") {
      values[control.id] = control.checked;
    } else {
      values[control.id] = control.value;
    }
  }
  return values;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text ?? "") && !Number.isNaN(Date.parse(text));
}

// Defaults follow what they come from until the customer types in them.
function setDefaults() {
  const follow = (id, text) => {
    if (!state.edited.has(id)) element(id).value = text;
  };
  const interest = Number(element("currentInterestReceivable").value.replaceAll(",", "").replace("£", ""));
  follow("nonTradingLoanRelationshipCredits", Number.isFinite(interest) && interest > 0 ? String(interest) : "0");
  follow("tradeName", element("principalActivity").value.trim());
  const values = readValues();
  if (regimeOf(values) === "micro") {
    follow("depreciation", element(microId("current", "depreciation")).value.trim() || "0");
    return;
  }
  if (element("includeFixedAssetNote").checked) {
    const charge = accountsFromValues(values).smallCompany.fixedAssetNote;
    const total = Object.values(charge ?? {}).reduce((sum, figures) => sum + figures.depreciationCharge, 0);
    follow("depreciation", String(total));
  }
}

// --- Checking and working the tax -----------------------------------------------------------

async function ensureBundle() {
  if (!state.bundlePromise) {
    state.bundlePromise = import("../lib/books-bundle.js").then((bundle) => {
      state.bundle = bundle;
      return bundle;
    });
    state.bundlePromise.catch((error) => {
      console.error("Failed to load the books bundle:", error);
      state.bundlePromise = null;
    });
  }
  return state.bundlePromise;
}

// The financial years the period covers and the one before the last: a loan lent in the earlier tax year is charged at that year's rate.
async function ensureTaxData(periodStart, periodEnd) {
  if (!isIsoDate(periodEnd) || !state.bundle) return;
  const lastYear = financialYearOf(periodEnd);
  const firstYear = Math.min(lastYear - 1, isIsoDate(periodStart) ? financialYearOf(periodStart) : lastYear - 1);
  const years = Array.from({ length: Math.max(lastYear - firstYear + 1, 0) }, (_, index) => firstYear + index);
  const missing = years.filter((year) => !(year in state.taxData));
  if (missing.length === 0) return;
  for (const year of missing) state.taxData[year] = null;
  await Promise.all(
    missing.map(async (year) => {
      try {
        state.taxData[year] = await state.bundle.ltdTaxData(year);
      } catch (error) {
        console.error(`No tax data for the financial year ${year}:`, error);
      }
    }),
  );
  refresh();
}

function taxDataByYear() {
  return Object.fromEntries(Object.entries(state.taxData).filter(([, data]) => data));
}

// The company's name and number come from the lookup, so the form has no field for them.
const WHOLE_PERIOD_PROBLEM_FIELDS = ["companyName", "companyNumber"];

function modelProblem(problem, part = 1) {
  if (WHOLE_PERIOD_PROBLEM_FIELDS.includes(problem.field)) return null;
  const target = targetOfModelProblem(problem.field, state.targets);
  const partTarget = part === 2 && isSecondColumnTarget(target) ? periodFieldId(target, 2) : target;
  return {
    target: state.targets.has(partTarget) ? partTarget : target,
    message: isSecondColumnTarget(target) ? `Return ${part} of 2: ${problem.message}` : problem.message,
    refusal: problem.refusal,
  };
}

function isSecondColumnTarget(target) {
  return PER_PERIOD_FIELD_IDS.includes(target) || PER_PERIOD_LOAN_QUESTION_IDS.includes(target) || target === DONATIONS_PAID_FIELD.id;
}

// A long period of account is checked as the two returns it files: each accounting period's own figures,
// then the tax of both worked together, because return 2's loss can reach return 1.
function longPeriodModelProblems(figures) {
  const options = { today: today(), taxDataByYear: taxDataByYear() };
  let split;
  try {
    split = state.bundle.splitLongPeriodFigures(figures);
  } catch (error) {
    if (error.field === undefined) throw error;
    return [modelProblem({ field: error.field, message: error.message, refusal: true })];
  }
  const [first, second] = split;
  const problems = [
    ...state.bundle.validateCt600Figures(first, options).map((problem) => modelProblem(problem, 1)),
    ...state.bundle.validateCt600Figures(second, { today: options.today }).map((problem) => modelProblem(problem, 2)),
  ].filter(Boolean);
  if (problems.length > 0) return problems;
  try {
    state.bundle.deriveLongPeriodReturns(figures, options.taxDataByYear, { today: options.today });
  } catch (error) {
    if (error.field === undefined) throw error;
    let part = 2;
    try {
      state.bundle.deriveCt600FromFigures(first, options.taxDataByYear, { today: options.today });
    } catch {
      part = 1;
    }
    problems.push(modelProblem({ field: error.field, message: error.message, refusal: true }, part));
  }
  return problems;
}

function modelProblems(values) {
  if (!state.bundle) return [];
  const figures = figuresFromValues(values, company ?? { companyName: "", companyNumber: "" }, state.workingSheet);
  if (figures.accountingPeriods) return longPeriodModelProblems(figures);
  return state.bundle
    .validateCt600Figures(figures, { today: today(), taxDataByYear: taxDataByYear() })
    .map((problem) => modelProblem(problem))
    .filter(Boolean);
}

function orderOfTarget(target) {
  const nodes = [...element("formSections").querySelectorAll("[id]")];
  const index = nodes.findIndex((node) => node.id === target);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

// One problem per target: the form's own checks first, then the model's, in the order the form shows them.
function evaluate(values) {
  const merged = new Map();
  for (const problem of [...formProblems(values), ...modelProblems(values)]) {
    if (!merged.has(problem.target)) merged.set(problem.target, problem);
  }
  return [...merged.values()].sort((a, b) => orderOfTarget(a.target) - orderOfTarget(b.target));
}

function workedValue(box, value) {
  if (box === 340 || box === 390) return `${value}%`;
  if (box === 329) return "Yes";
  if (box === 330 || box === 380) return String(value);
  return `£${formatPounds(value)}`;
}

const RATE_SOURCE_TEXT = {
  "tax-data": "from the tax data for the tax year of the loan",
  "online-rules": "the rate HMRC's online rules accept",
  "customer-entered": "the rate you entered",
};

function percentText(rate) {
  return `${Number((rate * 100).toFixed(2))}%`;
}

// The supplementary page CT600A boxes the tax is worked from, and the rate each loan uses.
function loansWorkedRows(page) {
  const row = workedRow;
  const rows = [
    row("Box A15: total of the loans still owed", `£${formatPounds(page.totalLoans)}`, "The loans you entered"),
    row("Box A20: tax on the loans", `£${formatPounds(page.taxChargeable)}`, "Each loan at its section 455 rate, to the penny"),
  ];
  if (page.partTwo) {
    rows.push(
      row(
        "Box A45: relief for loans repaid within nine months",
        `£${formatPounds(page.partTwo.relief)}`,
        "The amount repaid, released or written off, at the rate of the loan",
      ),
    );
  }
  if (page.partThree) {
    rows.push(row("Box A70: relief for later repayments", `£${formatPounds(page.partThree.relief)}`, "Relief that is already due"));
  }
  rows.push(
    row("Box A80: tax payable on loans to participators", `£${formatPounds(page.taxPayable)}`, "Carried to box 480", "workedLoanTax"),
  );
  for (const loan of page.rates) {
    for (const part of loan.parts) {
      rows.push(
        row(
          loan.parts.length > 1 ? `Section 455 rate for ${loan.name} (lent from ${part.from})` : `Section 455 rate for ${loan.name}`,
          percentText(part.rate),
          RATE_SOURCE_TEXT[part.source],
          undefined,
        ),
      );
    }
  }
  for (const warning of page.warnings) {
    rows.push(create("div", { class: "worked-tax__row", role: "note" }, create("dt", {}, "Warning"), create("dd", {}, warning)));
  }
  return rows;
}

function workedRow(term, value, hint, id) {
  return create(
    "div",
    { class: "worked-tax__row", ...(id ? { id } : {}) },
    create("dt", {}, term),
    create("dd", {}, value),
    ...(hint ? [create("dd", { class: "hint" }, hint)] : []),
  );
}

// The rows of one return: its adjusted profit, each worked box, the loans page, and the loss carried forward or back.
function workedItems(derived) {
  const items = [
    workedRow(
      "Adjusted profit or loss in the computation",
      `£${formatPounds(derived.computationLines.adjustedProfit)}`,
      "Profit per the accounts, less bank interest, plus depreciation, amortisation, entertaining and donations, less capital allowances. A loss shows in brackets.",
    ),
  ];
  for (const row of CT600_BOX_ROWS.filter(
    (candidate) => candidate.kind === "worked" && candidate.box in derived.boxes && candidate.box > 145,
  )) {
    items.push(workedRow(`Box ${row.box}: ${row.label}`, workedValue(row.box, derived.boxes[row.box]), row.rule));
  }
  if (derived.ct600a) items.push(...loansWorkedRows(derived.ct600a));
  if (derived.losses.totalCarriedForward > 0) {
    items.push(
      workedRow(
        "Trading losses carried forward",
        `£${formatPounds(derived.losses.totalCarriedForward)}`,
        "The loss of this period and the losses brought forward that no claim uses",
        "workedCarriedForward",
      ),
    );
  }
  if (derived.carryBack) {
    items.push(
      workedRow(
        "Corporation Tax repayable on the carry-back claim",
        `£${formatPounds(derived.carryBack.taxRepayable)}`,
        `Claimed against the period ${derived.carryBack.priorPeriodStart} to ${derived.carryBack.priorPeriodEnd}. That return carries the loss in box 275 with box 280 ticked.`,
        "workedCarryBack",
      ),
    );
  }
  return items;
}

function placeholdersFor(figures) {
  return {
    utr: figures.utr || PLACEHOLDER_UTR,
    companyName: figures.companyName || PLACEHOLDER_TEXT,
    companyNumber: figures.companyNumber || "00000000",
    declarantName: figures.declarantName || PLACEHOLDER_TEXT,
    declarantStatus: figures.declarantStatus || PLACEHOLDER_TEXT,
  };
}

// Both returns side by side: the days and the split, the limits of each period, and the dates tax and the returns fall due.
function longPeriodWorkedTax(values, derivedReturns, periods) {
  const holder = element("workedTaxLong");
  const wholeDays = periods.days;
  const columns = derivedReturns.map((derived, index) => {
    const period = periods.periods[index];
    const proportion = period.days / wholeDays;
    const years = new Map();
    for (const year of [financialYearOf(period.periodStart), financialYearOf(period.periodEnd)]) years.set(year, taxDataByYear()[year]);
    const limits = [...years].flatMap(([year, data]) => {
      const rates = data?.corporation_tax;
      if (!rates?.small_profits_limit) return [];
      const yearDays = Math.round((Date.UTC(year + 1, 3, 1) - Date.UTC(year, 3, 1)) / 86_400_000);
      const scale = period.days / Math.max(yearDays, period.days);
      return [
        workedRow(
          `Limits for the financial year ${year}`,
          `£${formatPounds(Math.round(rates.small_profits_limit * scale * 100) / 100)} and £${formatPounds(Math.round(rates.main_rate_limit * scale * 100) / 100)}`,
          `The small profits limit and the upper limit, scaled to the ${period.days} days of this accounting period`,
        ),
      ];
    });
    return create(
      "section",
      { "class": "worked-tax__return", "aria-labelledby": `workedReturn${index + 1}Heading` },
      create(
        "h4",
        { id: `workedReturn${index + 1}Heading` },
        `Return ${index + 1} of 2: ${longDateText(period.periodStart)} to ${longDateText(period.periodEnd)}`,
      ),
      create(
        "dl",
        { class: "worked-tax__list" },
        workedRow(
          "Days in this accounting period",
          `${period.days} of ${wholeDays} days`,
          `Turnover, bank interest and the adjusted profit are shared by days: ${Math.round(proportion * 10000) / 100}% of the period of account.`,
        ),
        ...workedItems(derived),
        ...limits,
        workedRow(
          "Tax due",
          longDateText(taxDueDate(period.periodEnd)),
          "The day after nine months from the end of this accounting period",
        ),
        workedRow(
          "Return due",
          longDateText(returnDueDate(periods.periods[1].periodEnd)),
          "Both returns are due 12 months after the period of account ends",
        ),
      ),
    );
  });
  holder.replaceChildren(...columns);
  holder.hidden = false;
  element("workedTaxRows").hidden = true;
}

function renderWorkedTax(values) {
  const rows = element("workedTaxRows");
  element("workedTaxLong").hidden = true;
  rows.hidden = false;
  if (!state.bundle) {
    rows.replaceChildren();
    return;
  }
  const figures = figuresFromValues(values, company ?? { companyName: "", companyNumber: "" }, state.workingSheet);
  const placeholders = placeholdersFor(figures);
  const periods = longPeriodOf(values);
  let derived;
  try {
    derived = figures.accountingPeriods
      ? state.bundle.deriveLongPeriodReturns({ ...figures, ...placeholders }, taxDataByYear(), { today: today() })
      : state.bundle.deriveCt600FromFigures({ ...figures, ...placeholders }, taxDataByYear(), { today: today() });
  } catch {
    element("workedTaxEmpty").style.display = "block";
    rows.replaceChildren();
    return;
  }
  element("workedTaxEmpty").style.display = "none";
  if (figures.accountingPeriods) {
    longPeriodWorkedTax(values, derived, periods);
    rows.replaceChildren();
    return;
  }
  rows.replaceChildren(...workedItems(derived));
}

// --- Showing problems -----------------------------------------------------------------------

function clearError(target) {
  const host = element(`${target}-errors`);
  if (host) host.replaceChildren();
  for (const control of document.querySelectorAll(`[data-error-target="${target}"]`)) {
    control.removeAttribute("aria-invalid");
    control.classList.remove("input--error");
    const describedBy = (control.getAttribute("aria-describedby") ?? "").split(" ").filter((id) => id && id !== `${target}-error`);
    control.setAttribute("aria-describedby", describedBy.join(" "));
  }
}

function showError(problem) {
  const { target, message } = problem;
  clearError(target);
  const host = element(`${target}-errors`);
  if (!host) return;
  host.append(
    create("p", { id: `${target}-error`, class: "error-message" }, create("span", { class: "visually-hidden" }, "Error: "), message),
  );
  const controls = [...document.querySelectorAll(`[data-error-target="${target}"]`)];
  if (target === WORKED_TAX_ID) controls.push(element(WORKED_TAX_ID));
  for (const control of controls) {
    control.setAttribute("aria-invalid", "true");
    control.classList.add("input--error");
    const describedBy = (control.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    control.setAttribute("aria-describedby", [...describedBy, `${target}-error`].join(" "));
  }
}

function showTouchedErrors() {
  const shown = new Set(state.problems.filter((problem) => state.touched.has(problem.target)).map((problem) => problem.target));
  for (const target of state.targets) if (!shown.has(target)) clearError(target);
  for (const problem of state.problems) if (shown.has(problem.target)) showError(problem);
}

function focusTarget(target) {
  const field = CT600_FORM_FIELDS.find((candidate) => candidate.id === target);
  const node = element(field?.focus ?? target);
  node?.focus();
  node?.scrollIntoView?.({ block: "center" });
}

function summaryItems(problems) {
  return problems.map((problem) => {
    const link = create("a", { href: `#${problem.target}` }, problem.message);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      focusTarget(problem.target);
    });
    return create("li", {}, link);
  });
}

function showSummary(problems) {
  element(SUMMARY_ID)?.remove();
  const list = create("ul", { class: "error-summary__list" }, ...summaryItems(problems));
  const summary = create(
    "div",
    { id: SUMMARY_ID, class: "error-summary", role: "alert", tabindex: "-1" },
    create("h2", { class: "error-summary__title" }, "There is a problem"),
    list,
  );
  element("returnForm").prepend(summary);
  summary.focus();
}

// A summary on screen follows the answers: it lists what is still wrong and goes when nothing is.
function updateSummary() {
  const summary = element(SUMMARY_ID);
  if (!summary) return;
  if (state.problems.length === 0) summary.remove();
  else summary.querySelector(".error-summary__list").replaceChildren(...summaryItems(state.problems));
}

const TAX_ACCOUNTING_PERIOD_GUIDE = "https://www.gov.uk/corporation-tax-accounting-period";

function periodRangeText(period) {
  return `${longDateText(period.periodStart)} to ${longDateText(period.periodEnd)}`;
}

function longPeriodPanelContent(long) {
  const [first, second] = long.periods;
  return [
    create("h3", { id: "longPeriodHeading" }, "This period of account files as two returns"),
    paragraph(
      `A Company Tax Return covers at most 12 months, so HMRC takes these ${long.days} days as two accounting periods. Both returns carry the same accounts.`,
    ),
    create(
      "ul",
      {},
      create("li", {}, paragraph({ strong: "Return 1 of 2: " }, `${periodRangeText(first)} (${first.days} days)`)),
      create("li", {}, paragraph({ strong: "Return 2 of 2: " }, `${periodRangeText(second)} (${second.days} days)`)),
    ),
    paragraph("You send return 1 first. HMRC must accept it before you send return 2. The two returns cost one token between them."),
    create(
      "p",
      {},
      "Before the original filing date, tell HMRC the company's new accounting period dates. ",
      create("a", { href: TAX_ACCOUNTING_PERIOD_GUIDE, target: "_blank", rel: "noopener" }, "How to update the dates on GOV.UK"),
      ".",
    ),
    ...(state.workingSheet
      ? [
          paragraph(
            "The book covers 12 months, so its own tax working is not checked against a longer period. Type the figures for the whole period of account.",
          ),
        ]
      : []),
  ];
}

// The text that follows a hint when the period is long: each column's allowance limit and main pool rate.
function periodHintText(id, period) {
  if (id === "annualInvestmentAllowance") {
    const maximum = Math.floor(state.bundle.annualInvestmentAllowanceMaximum(period.periodStart, period.periodEnd));
    return ` The most for ${periodRangeText(period)} is £${maximum.toLocaleString("en-GB")}.`;
  }
  const data = taxDataByYear();
  const years = new Map();
  for (let day = period.periodStart; day <= period.periodEnd; day = addDay(day))
    years.set(financialYearOf(day), (years.get(financialYearOf(day)) ?? 0) + 1);
  const rates = [...years].map(([year, days]) => ({ year, days, rate: data[year]?.capital_allowances?.writing_down_allowance_main }));
  if (rates.some(({ rate }) => rate === undefined)) return "";
  const distinct = [...new Set(rates.map(({ rate }) => rate))];
  if (distinct.length === 1) return ` The main pool rate for this period is ${percentText(distinct[0])}.`;
  const days = rates.reduce((total, { days: count }) => total + count, 0);
  const hybrid = rates.reduce((total, { days: count, rate }) => total + rate * count, 0) / days;
  return ` The period spans a change of the main pool rate (${distinct.map(percentText).join(" then ")}), so the rate is a hybrid of ${percentText(hybrid)}.`;
}

function addDay(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// A period of account over 12 months shows its panel, the second column of each per-period field, the donations paid and the second set of loans.
function updateLongPeriod(values) {
  const long = longPeriodOf(values);
  const form = element("returnForm");
  const showing = Boolean(long);
  form.classList.toggle("long-period", showing);
  for (const node of form.querySelectorAll(".period-pair__second, #donationsPaidGroup, #loansPart2, #firstPeriodStartGroup")) {
    node.hidden = !showing;
  }
  for (const node of form.querySelectorAll(".long-only")) node.hidden = !showing;
  const panel = element("longPeriodPanel");
  const panelShown = Boolean(long) && !long.tooLong;
  panel.hidden = !panelShown;
  // The panel is a live region, so it changes only when what it says changes.
  const panelKey = panelShown ? `${values.periodStart}|${values.periodEnd}|${Boolean(state.workingSheet)}` : "";
  if (panel.dataset.key !== panelKey) {
    panel.dataset.key = panelKey;
    panel.replaceChildren(...(panelShown ? longPeriodPanelContent(long) : []));
  }
  element("firstPeriodStart").textContent = long
    ? `Does the first accounting period start on ${longDateText(values.periodStart)}?`
    : "Does the first accounting period start on the first day of the accounts?";
  const donations = form.querySelector('label[for="donations"]');
  if (donations)
    donations.textContent = showing ? LONG_PERIOD_DONATIONS_LABEL : CT600_FORM_FIELDS.find((field) => field.id === "donations").label;
  if (long && state.bundle) {
    for (const node of form.querySelectorAll("[data-period-hint]")) {
      const [id, part] = node.dataset.periodHint.split(":");
      node.textContent = periodHintText(id, long.periods[Number(part) - 1]);
    }
  } else {
    for (const node of form.querySelectorAll("[data-period-hint]")) node.textContent = "";
  }
}

function refresh() {
  if (!element("formSections").firstChild) return;
  const values = readValues();
  updateLongPeriod(values);
  showLoanDetail(values);
  state.problems = evaluate(values);
  renderWorkedTax(values);
  showTouchedErrors();
  updateSummary();
  ensureTaxData(values.periodStart, values.periodEnd);
}

function targetOf(control) {
  return control?.dataset?.errorTarget;
}

function markTouched(control) {
  const target = targetOf(control);
  if (!target) return false;
  state.touched.add(target);
  return true;
}

function handleFormInput(event) {
  const control = event.target;
  if (control.id) state.edited.add(control.id);
  if (control.id?.startsWith("loanName")) syncRepaymentNames();
  setDefaults();
  refresh();
}

function handleFormLeave(event) {
  if (markTouched(event.target)) refresh();
}

function handleFormChange(event) {
  if (event.target.id === "includeComparatives" || event.target.id === "includeFixedAssetNote") toggleSections();
  if (event.target.name === "accountsRegime" || event.target.name === "sendTo") applyRegime();
  if (["loansMade", "repaidSince"].includes(event.target.name)) showLoanDetail(readValues());
  if (markTouched(event.target)) {
    setDefaults();
    refresh();
  }
}

// --- The company and the card -------------------------------------------

function mountBooksCard() {
  window.booksImport.mount(element("booksImport"), {
    kind: "ct600",
    clientId: () => agentClient?.clientId,
    onFilled: (workingSheet) => {
      state.workingSheet = workingSheet;
      refresh();
    },
  });
}

// --- Filing for a client as its agent ------------------------------------

async function loadPracticeClients() {
  if (practiceClients) return;
  try {
    const idToken = localStorage.getItem("cognitoIdToken");
    const response = await fetch("/api/v1/practice/clients", idToken ? { headers: { Authorization: `Bearer ${idToken}` } } : {});
    if (!response.ok) return;
    const body = await response.json();
    if (!Array.isArray(body.clients)) return;
    practiceClients = body.clients;
  } catch (error) {
    console.warn("The practice clients could not be read; the return is the company's own:", error);
    return;
  }
  renderClientChoice();
}

function clientRadio(value, label, checked) {
  return create(
    "div",
    { class: "choice" },
    create("input", {
      type: "radio",
      name: "clientChoice",
      id: `clientChoice-${value || "own"}`,
      value,
      ...(checked ? { checked: "" } : {}),
    }),
    create("label", { for: `clientChoice-${value || "own"}` }, label),
  );
}

function renderClientChoice() {
  const choices = clientChoices(practiceClients);
  element("clientChoice").style.display = choices.length > 0 ? "block" : "none";
  element("clientChoiceOptions").replaceChildren(
    clientRadio("", "My own company", !agentClient),
    ...choices.map((choice) => clientRadio(choice.clientId, choice.label, agentClient?.clientId === choice.clientId)),
  );
}

function chooseClient(clientId) {
  agentClient = practiceClients.find((client) => client.clientId === clientId) ?? null;
  const stop = agentClient ? clientFilingStop(agentClient) : null;
  const stopNode = element("clientStop");
  stopNode.style.display = stop ? "block" : "none";
  stopNode.replaceChildren(...(stop ? [stop, " ", create("a", { href: "../practice.html" }, "Open Practice clients"), "."] : []));
  element("practiceNameGroup").style.display = agentClient ? "block" : "none";
  if (agentClient && !element("practiceName").value) element("practiceName").value = rememberedPracticeName();
  const companyNumber = element("companyNumber");
  companyNumber.readOnly = Boolean(agentClient);
  companyNumber.value = agentClient?.identifiers?.companyNumber ?? "";
  element("companyLookupBtn").disabled = Boolean(stop);
  window.booksImport.showSavedBooksFor(agentClient?.clientId);
}

// The form for a client: the UTR comes from the client row, the declaration status starts as Agent,
// the company's authorisation is confirmed, and the accounts go to HMRC only.
function applyClientToForm() {
  const filingAsAgent = Boolean(agentClient);
  element("agentSection").style.display = filingAsAgent ? "block" : "none";
  const utr = element("utr");
  utr.readOnly = filingAsAgent;
  if (filingAsAgent) utr.value = agentClient.identifiers.utr;
  const status = element("declarantStatus");
  if (filingAsAgent && !state.edited.has("declarantStatus")) status.value = DEFAULT_AGENT_STATUS;
  if (!filingAsAgent && status.value === DEFAULT_AGENT_STATUS) status.value = "Director";
  if (filingAsAgent) {
    element("sendToHmrc").checked = true;
    applyRegime();
  }
  applyJointFilingOffer();
  element("gatewayWhose").textContent = filingAsAgent
    ? "Sign in with the practice's own agent Government Gateway user ID and password, with Corporation Tax enrolled."
    : "Sign in with the Government Gateway user ID and password for the company's Corporation Tax enrolment.";
  refresh();
}

function renderAgentAuthorisation() {
  element("agentAuthorisedHost").replaceChildren(
    checkboxGroup(
      "agentAuthorised",
      "The company has authorised this practice to act for it for Corporation Tax (form 64-8 or online), and has approved this return.",
    ),
  );
}

function agentFields() {
  return agentRequestFields(agentClient, {
    practiceName: element("practiceName").value,
    authorisationConfirmed: element("agentAuthorised")?.checked === true,
  });
}

function agentProblem() {
  if (!agentClient) return null;
  if (!element("practiceName").value.trim()) return "Enter the practice name for HMRC's records.";
  if (!element("agentAuthorised").checked)
    return "Confirm that the company has authorised the practice for Corporation Tax and has approved this return.";
  return null;
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber"])) return;
  if (agentClient) rememberPracticeName(element("practiceName").value.trim());
  const companyNumber = window.normaliseCompanyNumber(element("companyNumber").value);

  window.showLoading();
  window.hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber: profile.companyNumber, companyName: profile.companyName, registeredOffice: profile.registeredOffice };
    element("formCompanyName").textContent = company.companyName;
    element("formCompanyNumber").textContent = company.companyNumber;
    showView("formView");
    await ensureBundle();
    applyClientToForm();
  } catch (error) {
    console.error("Failed to look up the company:", error);
    window.showStatus(error.message || "Failed to look up the company.", "error");
  } finally {
    window.hideLoading();
  }
}

function changeLink(fieldId, label) {
  const link = create("a", { "href": `#${fieldId}`, "class": "review-change", "data-field": fieldId }, "Change");
  link.append(visuallyHidden(` ${label}`));
  return link;
}

function companyChangeLink() {
  const link = create("a", { "href": "#company", "class": "review-change", "data-field": "company" }, "Change");
  link.append(visuallyHidden(" company"));
  return link;
}

function reviewTable(id, title, rows) {
  const body = rows.map((row) => {
    const tr = tableRow(row.label, row.value, changeLink(row.id, row.label));
    tr.id = `review-row-${row.id}`;
    tr.tabIndex = -1;
    return tr;
  });
  return create(
    "section",
    { id: `review-${id}` },
    create("h4", {}, title),
    create(
      "table",
      { class: "results-table review-table" },
      create("colgroup", {}, ...["question", "answer", "change"].map((name) => create("col", { class: `review-table__${name}` }))),
      create("thead", {}, create("tr", {}, ...["Question", "Answer", "Change"].map((text) => create("th", { scope: "col" }, text)))),
      create("tbody", {}, ...body),
    ),
  );
}

function renderAnswers(values) {
  element("reviewAnswers").replaceChildren(...reviewAnswers(values).map(({ id, title, rows }) => reviewTable(id, title, rows)));
}

function companiesHouseCopyText(values) {
  if (regimeOf(values) === "micro") return "The micro-entity balance sheet and notes. The profit and loss account goes to HMRC only.";
  if (copyOf(values) === "filleted") {
    return "Filleted accounts. The profit and loss account and the directors' report are left out of the copy on the public register.";
  }
  return "The full accounts, including the profit and loss account and the directors' report. Companies House publishes them.";
}

function renderSendTo(values) {
  const both = sendToOf(values) === "both";
  const rows = [
    {
      id: "sendTo",
      label: "Sending the accounts to",
      value: both ? "Companies House first, then HMRC with the Company Tax Return" : "HMRC with the Company Tax Return",
    },
  ];
  if (both) {
    rows.push(
      {
        id: regimeOf(values) === "small" ? "companiesHouseCopy" : "sendTo",
        label: "What Companies House receives",
        value: companiesHouseCopyText(values),
      },
      { id: "sendTo", label: "What HMRC receives", value: "The full accounts, with the Company Tax Return" },
    );
  }
  const table = reviewTable("sendTo", "Where the accounts go", rows);
  // The review rows share one id scheme, so a second row for the same answer carries a distinct id.
  const [, , hmrcRow] = table.querySelectorAll("tbody tr");
  if (hmrcRow) hmrcRow.id = "review-row-hmrcAccounts";
  element("reviewSendTo").replaceChildren(table);
}

function sortBoxes(keys) {
  return [...keys].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || String(a).localeCompare(String(b)));
}

function boxTableRows(boxes, values, part, idSuffix) {
  return sortBoxes(Object.keys(boxes)).map((box) => {
    const label = boxRow(box).label;
    const target = boxChangeTarget(box, values, part);
    const change = target ? changeLink(target, `box ${box}, ${label}`) : companyChangeLink();
    const row = tableRow(box, label, "", change);
    if (box === "340" || box === "390") amountCell(row.children[2], `${boxes[box]}%`);
    else if (box === "329") row.children[2].textContent = "Yes";
    else if (TEXT_BOXES.has(Number(box)) || TEXT_BOXES.has(box)) row.children[2].textContent = boxes[box];
    else amountCell(row.children[2], formatPounds(boxes[box]));
    row.children[2].classList.add("review-table__value-cell");
    row.id = `review-box-${box}${idSuffix}`;
    return row;
  });
}

function computationTableRows(lines, values, part, idSuffix, lineLabels = {}) {
  return COMPUTATION_LINES.filter(({ field }) => lines[field] !== undefined || !LONG_ONLY_LINES.has(field)).map(
    ({ field, meaning, deduction, style }) => {
      const label = lineLabels[field] ?? meaning;
      const row = tableRow(label, "", changeLink(lineChangeTarget(field, values, part), label));
      amountCell(row.children[1], formatPounds(lines[field], deduction), style);
      row.id = `review-line-${field}${idSuffix}`;
      return row;
    },
  );
}

function renderReview(preview) {
  const values = readValues();
  renderSendTo(values);
  renderAnswers(values);
  const long = Array.isArray(preview.returns);
  element("singleReview").hidden = long;
  element("longReviews").hidden = !long;
  element("longReviews").replaceChildren();
  if (long) {
    renderLongReviews(preview, values);
    element("previewIxbrl").textContent = preview.returns.map((part) => part.computationsIxbrl).join("\n");
    return;
  }
  element("ct600Table")
    .querySelector("tbody")
    .replaceChildren(...boxTableRows(preview.boxes, values, 1, ""));
  element("computationsTable")
    .querySelector("tbody")
    .replaceChildren(...computationTableRows(preview.computationLines, values, 1, ""));
  element("previewIxbrl").textContent = preview.computationsIxbrl;
}

function reviewTables(index) {
  const boxes = create(
    "table",
    { id: `ct600Table${index}`, class: "results-table review-table review-table--boxes" },
    create(
      "colgroup",
      {},
      create("col", { class: "review-table__box" }),
      create("col"),
      create("col", { class: "review-table__value" }),
      create("col", { class: "review-table__change" }),
    ),
    create(
      "thead",
      {},
      create(
        "tr",
        {},
        create("th", { scope: "col" }, "Box"),
        create("th", { scope: "col" }, "Meaning"),
        create("th", { scope: "col", class: "amount" }, "Value (amounts in £)"),
        create("th", { scope: "col" }, "Change"),
      ),
    ),
    create("tbody"),
  );
  const computations = create(
    "table",
    { id: `computationsTable${index}`, class: "results-table review-table" },
    create(
      "colgroup",
      {},
      create("col"),
      create("col", { class: "review-table__value" }),
      create("col", { class: "review-table__change" }),
    ),
    create(
      "thead",
      {},
      create(
        "tr",
        {},
        create("th", { scope: "col" }, "Line"),
        create("th", { scope: "col", class: "amount" }, "£"),
        create("th", { scope: "col" }, "Change"),
      ),
    ),
    create("tbody"),
  );
  return { boxes, computations };
}

// The computation lines only a long period of account has.
const LONG_ONLY_LINES = new Set(["adjustedProfitBeforeAccountingPeriodAdjustments", "timeApportionment"]);

function renderLongReviews(preview, values) {
  const periodDays = longPeriodOf(values).days;
  const sections = preview.returns.map((part, position) => {
    const suffix = position === 0 ? "" : "Ap2";
    const days = longPeriodOf(values).periods[position].days;
    const { boxes, computations } = reviewTables(part.part);
    boxes.querySelector("tbody").replaceChildren(...boxTableRows(part.boxes, values, part.part, suffix));
    computations.querySelector("tbody").replaceChildren(
      ...computationTableRows(part.computationLines, values, part.part, suffix, {
        adjustedProfitBeforeAccountingPeriodAdjustments: `Adjusted profit for the ${periodDays} days of the period of account`,
        timeApportionment: `Time apportionment: ${days} of ${periodDays} days`,
      }),
    );
    return create(
      "section",
      { "id": `review-return-${part.part}`, "class": "return-review", "aria-labelledby": `reviewReturn${part.part}Heading` },
      create("h3", { id: `reviewReturn${part.part}Heading` }, `Return ${part.part} of 2: ${periodRangeText(part)}`),
      create(
        "p",
        { class: "hint" },
        `Tax is due on ${longDateText(part.taxDueDate)}. The return is due on ${longDateText(part.returnDueDate)}.`,
      ),
      create("h4", {}, `CT600 boxes, return ${part.part}`),
      boxes,
      create("h4", {}, `Computations, return ${part.part}`),
      computations,
    );
  });
  element("longReviews").replaceChildren(...sections);
}

async function handleReturnFormSubmit(event) {
  event.preventDefault();
  element(SUMMARY_ID)?.remove();
  window.showLoading();
  window.hideStatus();
  try {
    await ensureBundle();
    for (const target of state.targets) state.touched.add(target);
    refresh();
    if (state.problems.length > 0) {
      showSummary(state.problems);
      return;
    }
    const values = readValues();
    const problem = agentProblem();
    if (problem) {
      window.showStatus(problem, "error");
      return;
    }
    previewRequest = { ...ct600RequestFromValues(values, company, state.workingSheet), ...agentFields() };
    reviewedValues = values;
    const preview = await window.previewCtReturn(previewRequest);
    if (Array.isArray(preview.returns) && !chooseAmendedReturns(preview)) return;
    renderReview(preview);
    reviewedPreview = preview;
    reviewReached = true;
    chooseSending(values);
    configureSendStep();
    element("previewBtn").textContent = RETURN_TO_REVIEW;
    showView("previewView");
    if (changing) {
      focusReviewRow(changing);
      changing = null;
    }
  } catch (error) {
    console.error("Failed to preview the Company Tax Return:", error);
    window.showStatus(error.message || "Failed to preview the Company Tax Return.", "error");
  } finally {
    window.hideLoading();
  }
}

function focusReviewRow(fieldId) {
  const row = element(`review-row-${fieldId}`);
  if (!row) return;
  row.focus();
  row.scrollIntoView?.({ block: "center" });
}

// A Change link opens the form with every answer kept and puts focus on the answer it names.
function handleChangeClick(event) {
  const link = event.target.closest?.("a.review-change");
  if (!link) return;
  event.preventDefault();
  const fieldId = link.dataset.field;
  if (fieldId === "company") {
    showView("companyView");
    return;
  }
  changing = fieldId;
  showView("formView");
  focusTarget(fieldId);
}

function renderErrors(outcome) {
  const container = element("returnErrors");
  const entries = [...(outcome.errors ?? []), ...(outcome.businessErrors ?? [])];
  if (entries.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.replaceChildren(
    ...(outcome.message ? [create("p", { role: "alert" }, outcome.message)] : []),
    create("ul", {}, ...entries.map((entry) => create("li", {}, `Error ${entry.number}: ${entry.text}`))),
    create("p", {}, "Check the answers these errors name, change them in the review, and send the return again."),
  );
}

function waitSeconds(seconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(seconds, 1) * 1000));
}

async function pollUntilSettled(correlationId, firstWaitSeconds, extraHeaders) {
  let waitFor = firstWaitSeconds;
  let result;
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await waitSeconds(waitFor);
    result = await window.pollCtReturn(correlationId, extraHeaders, previewRequest?.clientId);
    if (result.statusCode === "ACCEPT" || result.statusCode === "REJECT") return result;
    element("returnResult").replaceChildren(
      paragraph("Return ", { strong: correlationId }, " is ", { strong: result.statusCode }, ". Checking again..."),
    );
    waitFor = result.pollIntervalSeconds;
  }
  return result;
}

function setOutcome(kind) {
  element("returnOutcome").className = kind ? `outcome outcome--${kind}` : "outcome";
}

// The HMRC heading and its box stay out of sight until the return has something to say.
function showHmrcOutcomeWhenFilled() {
  const hasResult = Boolean(element("returnResult").firstChild);
  element("returnOutcome").style.display = hasResult ? "" : "none";
  element("hmrcHeading").style.display = hasResult ? "" : "none";
}

new MutationObserver(showHmrcOutcomeWhenFilled).observe(element("returnResult"), { childList: true });
showHmrcOutcomeWhenFilled();

function outcomeTitle(text) {
  return create("h3", { class: "outcome__title" }, text);
}

async function renderReturnRecord(outcome) {
  const { ctResultCopyHtml, todayText } = await import("../lib/filing-result-record.js");
  const html = ctResultCopyHtml({
    company,
    utr: previewRequest.utr,
    boxes: reviewedPreview.boxes,
    computation: COMPUTATION_LINES.map(({ field, meaning, deduction, style }) => ({
      label: meaning,
      value: reviewedPreview.computationLines[field],
      deduction,
      style,
    })),
    outcome,
    dateText: todayText(),
  });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  element("returnRecord").replaceChildren(...parsed.body.childNodes);
}

async function showOutcome(outcome) {
  element("returnRecord").replaceChildren();
  element("returnErrors").style.display = "none";
  element("returnIrmark").style.display = "none";
  element("tryAgainBtn").style.display = "none";
  element("startAgainBtn").style.display = "none";
  if (outcome.statusCode === "ACCEPT") {
    setOutcome("ok");
    element("returnResult").replaceChildren(
      outcomeTitle(sending.amendment ? "HMRC accepted the amended Company Tax Return" : "HMRC accepted the Company Tax Return"),
    );
    const { IRMARK_MISMATCH_WARNING } = await import("../lib/filing-result-record.js");
    element("returnIrmark").replaceChildren(
      create("p", {}, "IRmark: ", create("code", {}, outcome.irmark)),
      ...(outcome.irmarkReceiptMismatch
        ? [
            create(
              "div",
              { id: "irmarkMismatchWarning", class: "status-message status-warning", role: "alert" },
              create("div", { class: "status-message-content" }, IRMARK_MISMATCH_WARNING),
            ),
          ]
        : []),
      create("p", {}, "Keep the IRmark. It is HMRC's record of exactly what you sent."),
      create(
        "p",
        { id: "receiptProof" },
        "The receipt below is the company's proof that it filed this return. Keep it with the company's records.",
      ),
    );
    element("returnIrmark").style.display = "block";
    element("startAgainBtn").style.display = "inline-block";
    sending.taxReturnAccepted = true;
    if (sending.mode === "both") renderCompaniesHouse();
    if (!sending.companiesHouse || companiesHouseAccepted()) forgetJoint();
    else persistJoint();
    await renderReturnRecord(outcome);
    showAmendPanel();
    return;
  }
  if (outcome.statusCode === "REJECT") {
    setOutcome("error");
    element("returnResult").replaceChildren(
      outcomeTitle(sending.amendment ? "HMRC rejected the amended Company Tax Return" : "HMRC rejected the Company Tax Return"),
    );
    renderErrors(outcome);
    element("tryAgainBtn").style.display = "inline-block";
    sending.taxReturnSent = false;
    persistJoint();
    return;
  }
  setOutcome();
  element("returnResult").replaceChildren(
    paragraph(
      "HMRC has not settled the return yet. Return ",
      { strong: outcome.correlationId },
      " is still ",
      { strong: outcome.statusCode },
      ".",
    ),
  );
}

// --- Sending: Companies House first, then HMRC ------------------------------------------------

function companiesHouseAccepted() {
  return sending.companiesHouse?.statusCode === "ACCEPT";
}

// The review opens one joint filing: both sends carry its id. Once the accounts are with Companies House
// the choice is fixed, so a later review keeps it. A period of account over 12 months names its two
// returns with one filing id, which is the joint filing id when the accounts go to Companies House.
function chooseSending(values) {
  if (!sending.companiesHouse) {
    sending.mode = sendToOf(values);
    sending.copy = copyOf(values);
  }
  if (longPeriodOf(values)) {
    const filingId = sending.longPeriod?.filingId ?? sending.jointFilingId ?? crypto.randomUUID();
    sending.longPeriod = { filingId, parts: sending.longPeriod?.parts ?? [null, null] };
    sending.jointFilingId = sending.mode === "both" ? filingId : null;
    return;
  }
  sending.longPeriod = null;
  if (!sending.companiesHouse) sending.jointFilingId = sending.mode === "both" ? (sending.jointFilingId ?? crypto.randomUUID()) : null;
}

// The accounts still need sending when none went yet or Companies House rejected the last send.
function accountsStillToSend() {
  return sending.mode === "both" && (!sending.companiesHouse || sending.companiesHouse.statusCode === "REJECT");
}

const GATEWAY_STORED_ONCE = "They are sent once with this return and never stored.";

function configureSendStep() {
  const accountsFirst = accountsStillToSend();
  const amending = Boolean(sending.amendment);
  const sendsToHmrc = amending ? "Send the amended return to HMRC" : "Send to HMRC";
  element("sendStepHeading").textContent = accountsFirst
    ? amending
      ? "Send the revised accounts to Companies House and the amended return to HMRC"
      : "Send to Companies House and HMRC"
    : sendsToHmrc;
  const order = element("sendStepOrder");
  order.style.display = sending.mode === "both" ? "block" : "none";
  order.textContent = accountsFirst
    ? "Companies House gets the accounts first. When it accepts them, the Company Tax Return goes to HMRC."
    : "Companies House accepted the accounts. The Company Tax Return is the one filing left to send.";
  element("companyAuthCodeGroup").style.display = accountsFirst ? "block" : "none";
  element("revisionGroup").style.display = accountsFirst && sending.amendment?.accounts ? "block" : "none";
  element("submitReturnBtn").textContent = accountsFirst
    ? amending
      ? "Send the revised accounts, then the amended return"
      : "Send to Companies House, then HMRC"
    : amending
      ? "Submit the amended return to HMRC"
      : "Submit to HMRC";
  configureLongSendStep({ accountsFirst, amending });
  showSendCost(accountsFirst);
}

// The tokens the send step will charge and the sentence that says what for. The accounts cost one
// token when they are still to send. The returns cost one token together: return 1 takes it and
// return 2 takes none, so a send that leaves only return 2 costs nothing.
function sendCostOf(accountsFirst) {
  const queue = longQueue();
  const returnsCost = sending.longPeriod && !queue.includes(1) ? 0 : 1;
  const cost = (accountsFirst ? 1 : 0) + returnsCost;
  if (accountsFirst) {
    const returns = sending.longPeriod ? (queue.length === 2 ? "the two returns" : `return ${queue[0]} of 2`) : "the return";
    return { cost, lead: `The accounts and ${returns} cost ${cost} ${cost === 1 ? "token" : "tokens"}.` };
  }
  if (cost === 0) return { cost, lead: "Return 2 of 2 costs no token. Return 1 used the token for both." };
  if (queue.length === 2) return { cost, lead: "The two returns cost 1 token between them." };
  return { cost, lead: "This return costs 1 token." };
}

function showSendCost(accountsFirst) {
  const container = element("submissionCost");
  const { cost, lead } = sendCostOf(accountsFirst);
  container.dataset.tokenCost = String(cost);
  container.dataset.costLead = lead;
  window.SubmissionCost?.refresh();
}

// A refusal for no token left: the balance on the page is out of date, and the send step is where
// the customer can see what is left.
function showTokensExhausted(message) {
  showView("previewView");
  window.hideStatus();
  window.showStatus(message, "error");
  window.dispatchEvent(new CustomEvent("bundle-changed"));
  element("statusMessagesContainer").scrollIntoView({ block: "start" });
}

// Two returns go one after the other: the accounts when they go to Companies House, then return 1, then return 2.
function configureLongSendStep({ accountsFirst, amending }) {
  const note = element("longSendOrder");
  const queue = longQueue();
  note.style.display = sending.longPeriod ? "block" : "none";
  element("gatewayStored").textContent = GATEWAY_STORED_ONCE;
  if (!sending.longPeriod) return;
  const amended = amending ? "amended " : "";
  const order = accountsFirst ? "the accounts, then " : "";
  const returnWord = amending ? "the amended return" : "return";
  const leftWord = amending ? "The amended return" : "Return";
  note.textContent =
    queue.length === 2
      ? `You send ${order}${returnWord} 1 of 2, then ${returnWord} 2 of 2. Each waits for the one before to be accepted. You type the Government Gateway user ID and password once for both.`
      : `${leftWord} ${queue[0] ?? 2} of 2 is the one left to send. You type the Government Gateway password again.`;
  element("gatewayStored").textContent =
    queue.length === 2 ? "They are sent with each of the two returns and never stored." : GATEWAY_STORED_ONCE;
  if (queue.length === 0) return;
  const heading = amending ? "amended return" : "return";
  if (!accountsFirst) {
    element("sendStepHeading").textContent =
      queue.length === 2
        ? `Send ${amending ? "the amended returns" : "two returns"} to HMRC`
        : `Send ${amending ? "the amended return" : "return"} ${queue[0]} of 2 to HMRC`;
    element("submitReturnBtn").textContent =
      queue.length === 2 ? `Submit ${heading} 1 of 2, then ${heading} 2 of 2` : `Submit ${heading} ${queue[0]} of 2 to HMRC`;
  }
}

// The returns still to send, in order: both, or return 2 once return 1 is accepted. An amendment sends only the returns whose boxes change.
function longQueue() {
  if (!sending.longPeriod) return [];
  if (sending.amendment?.parts) return sending.amendment.parts.filter((part) => !sending.amendment.done.includes(part));
  return [1, 2].filter((part) => sending.longPeriod.parts[part - 1]?.statusCode !== "ACCEPT");
}

function scenarioHeaders() {
  const scenario = element("govTestScenario").value.trim();
  return scenario ? { "Gov-Test-Scenario": scenario } : {};
}

function companiesHouseRequest(companyAuthCode) {
  const smallCompany = previewRequest.smallCompany
    ? { smallCompany: { ...previewRequest.smallCompany, filleted: sending.copy === "filleted" } }
    : {};
  return {
    ...previewRequest,
    ...smallCompany,
    companyAuthCode,
    formValues: reviewedValues,
    jointFilingId: sending.jointFilingId,
    ...(sending.revision ? { revision: sending.revision } : {}),
  };
}

function taxReturnRequest(gatewayUserId, gatewayPassword, part) {
  return {
    ...previewRequest,
    reviewedBoxes: part ? reviewedPreview.returns[part - 1].boxes : reviewedPreview.boxes,
    ...(part ? { longPeriod: { filingId: sending.longPeriod.filingId, part } } : {}),
    formValues: reviewedValues,
    gatewayUserId,
    gatewayPassword,
    ...(sending.jointFilingId ? { jointFilingId: sending.jointFilingId } : {}),
    ...(sending.revision ? { revision: sending.revision } : {}),
    ...(sending.amendment ? { amended: true } : {}),
  };
}

// The accounts are with Companies House, so the figures they came from cannot change here. The tax answers can.
function accountsControls() {
  return [
    ...element("section-accounts").querySelectorAll("input, textarea"),
    ...[...STATEMENT_FIELDS.map(({ id }) => id), MICRO_STATEMENT_FIELD.id, "periodStart", "periodEnd"].map(element),
    ...document.querySelectorAll('input[name="sendTo"], input[name="companiesHouseCopy"]'),
  ];
}

function lockAccounts() {
  for (const control of accountsControls()) control.disabled = true;
  element("booksImport").hidden = true;
  element("accountsLockNote")?.remove();
  const { submissionNumber } = sending.companiesHouse;
  element("section-accounts")
    .querySelector("h3")
    .after(
      create(
        "p",
        { id: "accountsLockNote", class: "hint", role: "status" },
        `Filed at Companies House on ${todayText()}, submission ${submissionNumber}. The accounts cannot change here. Change the tax answers only.`,
      ),
    );
}

// Amending the accounts reopens them: the figures and the approval date change, and the revised
// accounts replace the ones Companies House holds.
// The dates HMRC holds for each accounting period stay as filed when a return is amended.
function lockPeriodDates() {
  for (const control of element("returnForm").querySelectorAll('#periodStart, #periodEnd, input[name="firstPeriodStart"]')) {
    control.disabled = true;
  }
}

function unlockAccounts() {
  for (const control of accountsControls()) control.disabled = false;
  element("accountsLockNote")?.remove();
  element("section-accounts")
    .querySelector("h3")
    .after(
      create(
        "p",
        { id: "accountsLockNote", class: "hint", role: "status" },
        "You are revising the accounts filed at Companies House. Change the figures and the date the directors approve the revised accounts.",
      ),
    );
}

function todayText() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// --- Amending an accepted filing -------------------------------------------------------------

function boxesDiffer(filed, current) {
  const keys = new Set([...Object.keys(filed ?? {}), ...Object.keys(current ?? {})]);
  return [...keys].some((key) => String(filed?.[key]) !== String(current?.[key]));
}

// An amendment of a long period sends ReturnType="amended" only for a return whose boxes differ from the
// ones HMRC holds. Amending the accounts changes the accounts both returns carry, so it amends both.
function chooseAmendedReturns(preview) {
  if (!sending.amendment || !sending.longPeriod) return true;
  const changed = [1, 2].filter(
    (part) => sending.amendment.accounts || boxesDiffer(filedLongBoxes[part - 1], preview.returns[part - 1].boxes),
  );
  if (changed.length === 0) {
    window.showStatus(
      "Neither return changes with these answers, so there is nothing to amend. Change an answer and preview again.",
      "error",
    );
    return false;
  }
  sending.amendment.parts = changed;
  sending.amendment.done = [];
  return true;
}

// The return is accepted, and so are the accounts when they went too: the customer can amend.
function showAmendPanel() {
  const accepted = sending.taxReturnAccepted && (sending.mode === "hmrc" || companiesHouseAccepted());
  element("amendPanel").style.display = accepted ? "block" : "none";
  element("amendAccountsBtn").style.display = accepted && sending.mode === "both" ? "inline-block" : "none";
  const firstReturnChanged =
    Boolean(sending.longPeriod) &&
    !sending.amendment &&
    Boolean(reviewedPreview?.returns) &&
    boxesDiffer(filedLongBoxes[0], reviewedPreview.returns[0].boxes);
  element("amendLongNote").hidden = !(accepted && firstReturnChanged);
}

function hideAmendPanel() {
  element("amendPanel").style.display = "none";
}

// Both amendments reopen the form for the tax answers and send an amended return. Amending the
// accounts also reopens the accounts and sends them to Companies House first as revised accounts.
function startAmendment({ accounts }) {
  companiesHousePollWindow++;
  hideAmendPanel();
  sending.amendment = { accounts, done: [] };
  sending.taxReturnSent = false;
  sending.taxReturnAccepted = false;
  if (sending.longPeriod) {
    sending.longPeriod = { filingId: sending.longPeriod.filingId, parts: [null, null] };
    longErrors = [null, null];
    unlockFirstReturn();
  }
  if (accounts) {
    sending.revision = { originalDateOfApproval: element("directorDateApproved").value, differences: "" };
    sending.companiesHouse = null;
    unlockAccounts();
  }
  if (sending.longPeriod) lockPeriodDates();
  element("revisionDifferences").value = "";
  element("returnResult").replaceChildren();
  element("returnRecord").replaceChildren();
  element("returnIrmark").style.display = "none";
  element("startAgainBtn").style.display = "none";
  element("jointProgress").style.display = "none";
  setOutcome();
  persistJoint();
  window.hideStatus();
  showView("formView");
}

function revisionDifferencesProblem() {
  const input = element("revisionDifferences");
  if (input.value.trim()) return null;
  return { input, message: "Say what the revised accounts change" };
}

// What a reload needs of the two returns: which each has reached, never a code or a password.
function savedSending() {
  if (!sending.longPeriod) return sending;
  const parts = sending.longPeriod.parts.map((entry) =>
    entry ? { correlationId: entry.correlationId, statusCode: entry.statusCode, irmark: entry.irmark, receiptId: entry.receiptId } : null,
  );
  return { ...sending, longPeriod: { filingId: sending.longPeriod.filingId, parts } };
}

function persistJoint() {
  try {
    sessionStorage.setItem(JOINT_STORAGE_KEY, JSON.stringify({ company, values: readValues(), sending: savedSending() }));
  } catch {
    // Storage can be unavailable; the filing carries on without a resume point.
  }
}

function forgetJoint() {
  try {
    sessionStorage.removeItem(JOINT_STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
}

function readSavedJoint() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(JOINT_STORAGE_KEY));
    const sent = saved?.sending?.companiesHouse || saved?.sending?.longPeriod?.parts?.some(Boolean);
    return saved?.company && saved.values && sent ? saved : null;
  } catch {
    return null;
  }
}

function fillValues(values) {
  for (const part of PARTS) {
    const missingRow = (numbers, container, attribute) =>
      numbers.find((row) => !element(container).querySelector(`[${attribute}="${row}"]`));
    for (let missing = missingRow(loanRowNumbers(values, part), periodFieldId("loanRows", part), "data-loan-row"); missing;) {
      loanRows[part] = missing;
      addLoanRow(part);
      missing = missingRow(loanRowNumbers(values, part), periodFieldId("loanRows", part), "data-loan-row");
    }
    for (
      let missing = missingRow(repaymentRowNumbers(values, part), periodFieldId("repaymentRows", part), "data-repayment-row");
      missing;
    ) {
      repaymentRows[part] = missing;
      addRepaymentRow(part);
      missing = missingRow(repaymentRowNumbers(values, part), periodFieldId("repaymentRows", part), "data-repayment-row");
    }
  }
  for (const control of element("returnForm").querySelectorAll("input, textarea")) {
    if (control.type === "radio") {
      control.checked = values[control.name] === control.value;
    } else if (control.type === "checkbox") {
      control.checked = Boolean(values[control.id]);
    } else if (typeof values[control.id] === "string") {
      control.value = values[control.id];
      state.edited.add(control.id);
    }
  }
  syncRepaymentNames();
  for (const select of element("returnForm").querySelectorAll("select")) {
    if (typeof values[select.id] === "string") select.value = values[select.id];
  }
  toggleSections();
  applyRegime();
  showLoanDetail(readValues());
}

// A reload mid-filing: refill the form, rebuild the review and show where the two filings stand.
// The saved entry holds no codes and no password, so the customer types those again.
async function resumeJoint() {
  const saved = readSavedJoint();
  if (!saved) return;
  window.showLoading();
  try {
    company = saved.company;
    Object.assign(sending, saved.sending);
    element("formCompanyName").textContent = company.companyName;
    element("formCompanyNumber").textContent = company.companyNumber;
    fillValues(saved.values);
    await ensureBundle();
    refresh();
    previewRequest = ct600RequestFromValues(saved.values, company, state.workingSheet);
    reviewedValues = saved.values;
    reviewedPreview = await window.previewCtReturn(previewRequest);
    renderReview(reviewedPreview);
    reviewReached = true;
    element("previewBtn").textContent = RETURN_TO_REVIEW;
    if (companiesHouseAccepted()) lockAccounts();
    configureSendStep();
    if (sending.longPeriod && (sending.mode === "hmrc" || companiesHouseAccepted())) {
      await resumeLongReturns();
      return;
    }
    if (companiesHouseAccepted()) {
      showView("previewView", { push: false });
      return;
    }
    showJointResult();
    renderCompaniesHouse();
    if (sending.companiesHouse.statusCode === "REJECT") element("tryAgainBtn").style.display = "inline-block";
  } catch (error) {
    console.error("Failed to resume the filing:", error);
    window.showStatus(error.message || "Failed to resume the filing.", "error");
    showView("formView", { push: false });
  } finally {
    window.hideLoading();
  }
}

// A reload between the two sends: show where each return stands, poll one that is still with HMRC, and
// offer the next send. The saved entry holds no password, so the customer types it again.
async function resumeLongReturns() {
  const parts = sending.longPeriod.parts;
  parts.forEach((entry, index) => {
    if (entry?.statusCode === "ACCEPT") filedLongBoxes[index] = reviewedPreview.returns[index].boxes;
  });
  if (parts[0]?.statusCode === "ACCEPT" && !sending.amendment) lockFirstReturn();
  showJointResult();
  if (sending.mode === "both") renderCompaniesHouse();
  renderLongOutcome();
  const pending = [1, 2].find((part) => parts[part - 1] && !["ACCEPT", "REJECT"].includes(parts[part - 1].statusCode));
  if (pending) {
    const outcome = await pollUntilSettled(parts[pending - 1].correlationId, 1, scenarioHeaders());
    if (!(await settleLongReturn(pending, outcome))) return;
  }
  if (parts.some((entry) => entry?.statusCode === "REJECT")) {
    element("tryAgainBtn").style.display = "inline-block";
    return;
  }
  if (longQueue().length === 0) {
    sending.taxReturnAccepted = true;
    await renderLongRecords();
    showAmendPanel();
    return;
  }
  showView("previewView", { push: false });
}

function renderCompaniesHouse() {
  const { statusCode, submissionNumber, rejections, receiptId } = sending.companiesHouse;
  const outcome = element("companiesHouseOutcome");
  const errors = element("companiesHouseErrors");
  errors.style.display = "none";
  element("sendCtNowBtn").style.display = "none";
  element("waitForCompaniesHouseBtn").style.display = "none";
  element("jointProgress").style.display = "block";
  if (statusCode === "ACCEPT") {
    outcome.className = "outcome outcome--ok";
    const copyLink = receiptId
      ? create(
          "a",
          { href: "filings.html?receipt=" + encodeURIComponent(receiptId + ".json"), id: "companiesHouseCopyLink" },
          "See your copy",
        )
      : "";
    outcome.replaceChildren(
      outcomeTitle(sending.amendment?.accounts ? "Companies House accepted the revised accounts" : "Companies House accepted the accounts"),
      paragraph("Submission ", { strong: submissionNumber }, ". "),
      ...(copyLink ? [copyLink] : []),
      ...(sending.taxReturnAccepted
        ? [
            create(
              "p",
              { id: "jointAccepted" },
              sending.longPeriod
                ? `The accounts and ${sending.amendment ? "both amended Company Tax Returns are" : "both Company Tax Returns are"} accepted. Your receipts show them as one filing: `
                : sending.amendment
                  ? "Both amended filings are accepted. Your receipts show them under the filing they amend: "
                  : "Both filings are accepted. Your receipts show them as one filing: ",
              create("a", { href: "../hmrc/receipt/receipts.html" }, "Your receipts"),
              ".",
            ),
          ]
        : []),
    );
    return;
  }
  if (statusCode === "REJECT") {
    outcome.className = "outcome outcome--error";
    outcome.replaceChildren(
      outcomeTitle(sending.amendment?.accounts ? "Companies House rejected the revised accounts" : "Companies House rejected the accounts"),
      paragraph("Submission ", { strong: submissionNumber }, "."),
    );
    errors.style.display = "block";
    errors.replaceChildren(
      create("ul", {}, ...(rejections ?? []).map((entry) => create("li", {}, `${entry.rejectCode}: ${entry.description}`))),
      create("p", {}, "Check the accounts, change them in the review, and send again. The Company Tax Return has not been sent."),
    );
    return;
  }
  outcome.className = "outcome";
  outcome.replaceChildren(
    paragraph(
      "Companies House has not settled the accounts yet. Submission ",
      { strong: submissionNumber },
      " is ",
      { strong: statusCode },
      ".",
    ),
    ...(sending.taxReturnSent
      ? []
      : [
          paragraph(
            "You can send the Company Tax Return now, or wait for Companies House. If Companies House then rejects the accounts, a changed figure needs an amended return.",
          ),
        ]),
  );
  if (!sending.taxReturnSent) element("sendCtNowBtn").style.display = "inline-block";
  element("waitForCompaniesHouseBtn").style.display = "inline-block";
}

function showJointResult() {
  element("returnResult").replaceChildren();
  element("returnRecord").replaceChildren();
  element("returnErrors").style.display = "none";
  element("returnIrmark").style.display = "none";
  element("tryAgainBtn").style.display = "none";
  element("startAgainBtn").style.display = "none";
  setOutcome();
  showView("resultView");
}

// Poll Companies House for one window. True once it accepts; otherwise the page says where the accounts stand.
// Only the newest poll window may write the result, so an older window cannot overwrite it or send the return twice.
async function waitForCompaniesHouse(headers) {
  const pollWindow = ++companiesHousePollWindow;
  const { submissionNumber, pollIntervalSeconds } = sending.companiesHouse;
  for (let attempt = 0; attempt < MAX_COMPANIES_HOUSE_POLLS; attempt++) {
    await waitSeconds(pollIntervalSeconds);
    if (pollWindow !== companiesHousePollWindow) return false;
    const result = await window.pollMicroEntityAccounts(submissionNumber, headers);
    if (pollWindow !== companiesHousePollWindow) return false;
    sending.companiesHouse = { ...sending.companiesHouse, ...result };
    if (result.statusCode === "ACCEPT" || result.statusCode === "REJECT") break;
  }
  const { statusCode } = sending.companiesHouse;
  renderCompaniesHouse();
  if (statusCode === "ACCEPT") {
    lockAccounts();
    configureSendStep();
  }
  if (statusCode === "ACCEPT" && sending.taxReturnAccepted) forgetJoint();
  else persistJoint();
  if (statusCode === "REJECT") element("tryAgainBtn").style.display = "inline-block";
  return statusCode === "ACCEPT";
}

async function sendAccountsToCompaniesHouse(headers, companyAuthCode) {
  const submission = await window.submitMicroEntityAccounts(companiesHouseRequest(companyAuthCode), headers);
  element("companyAuthCode").value = "";
  sending.companiesHouse = {
    submissionNumber: submission.submissionNumber,
    statusCode: "PENDING",
    pollIntervalSeconds: submission.pollInterval ?? 1,
  };
  sending.taxReturnSent = false;
  persistJoint();
  showJointResult();
  renderCompaniesHouse();
  return waitForCompaniesHouse(headers);
}

function companiesHouseErrorText(error) {
  const gatewayErrors = error.body?.error?.errors;
  const text = gatewayErrors?.length ? window.describeGovTalkErrors(gatewayErrors).join(" ") : error.message;
  return `${text || "Failed to file the accounts with Companies House."} Nothing was filed. Check the answers and send again.`;
}

function readGatewayCredentials() {
  const gatewayUserId = element("gatewayUserId").value.trim();
  const gatewayPassword = element("gatewayPassword").value;
  if (gatewayUserId && gatewayPassword) return { gatewayUserId, gatewayPassword };
  showView("previewView");
  window.showStatus("Enter the Government Gateway user ID and password.", "error");
  return null;
}

async function sendCompanyTaxReturn(headers) {
  const credentials = readGatewayCredentials();
  if (!credentials) return;
  const submission = await window.submitCtReturn(taxReturnRequest(credentials.gatewayUserId, credentials.gatewayPassword), headers);
  element("gatewayPassword").value = "";
  sending.taxReturnSent = true;
  if (sending.mode === "both") renderCompaniesHouse();
  persistJoint();
  setOutcome();
  element("returnResult").replaceChildren(
    paragraph("Return ", { strong: submission.correlationId }, " accepted by the gateway. Waiting for HMRC..."),
  );
  element("returnErrors").style.display = "none";
  element("returnIrmark").style.display = "none";
  element("tryAgainBtn").style.display = "none";
  showView("resultView");
  const outcome = await pollUntilSettled(submission.correlationId, submission.pollIntervalSeconds, headers);
  await showOutcome(outcome);
}

// --- Sending the two returns of a long period of account --------------------------------------

function sendTaxReturns(headers) {
  return sending.longPeriod ? sendLongReturns(headers) : sendCompanyTaxReturn(headers);
}

// The Government Gateway user ID and password are read once and held in this call only. They cover both
// sends and are gone when it ends, whether the returns were accepted, rejected or never sent.
async function sendLongReturns(headers) {
  const credentials = readGatewayCredentials();
  if (!credentials) return;
  for (const part of longQueue()) {
    const accepted = await sendLongReturn(part, headers, credentials);
    if (!accepted) return;
  }
}

async function sendLongReturn(part, headers, credentials) {
  const submission = await window.submitCtReturn(taxReturnRequest(credentials.gatewayUserId, credentials.gatewayPassword, part), headers);
  element("gatewayPassword").value = "";
  sending.taxReturnSent = true;
  sending.longPeriod.parts[part - 1] = { correlationId: submission.correlationId, statusCode: "PENDING", irmark: submission.irmark };
  longErrors[part - 1] = null;
  if (sending.mode === "both") renderCompaniesHouse();
  persistJoint();
  renderLongOutcome();
  element("tryAgainBtn").style.display = "none";
  showView("resultView");
  const outcome = await pollUntilSettled(submission.correlationId, submission.pollIntervalSeconds, headers);
  return settleLongReturn(part, outcome);
}

async function settleLongReturn(part, outcome) {
  const parts = sending.longPeriod.parts;
  parts[part - 1] = { ...outcome, statusCode: outcome.statusCode };
  if (outcome.statusCode === "ACCEPT") {
    filedLongBoxes[part - 1] = reviewedPreview.returns[part - 1].boxes;
    sending.amendment?.done.push(part);
    longErrors[part - 1] = null;
  } else if (outcome.statusCode === "REJECT") {
    longErrors[part - 1] = outcome;
    sending.taxReturnSent = false;
  }
  const finished = outcome.statusCode === "ACCEPT" && longQueue().length === 0;
  sending.taxReturnAccepted = finished;
  renderLongOutcome();
  if (outcome.statusCode === "REJECT") element("tryAgainBtn").style.display = "inline-block";
  if (outcome.statusCode === "ACCEPT") await renderLongRecords();
  if (sending.mode === "both") renderCompaniesHouse();
  if (finished && (!sending.companiesHouse || companiesHouseAccepted())) forgetJoint();
  else persistJoint();
  if (parts[0]?.statusCode === "ACCEPT" && !sending.amendment && !finished) lockFirstReturn();
  if (finished) showAmendPanel();
  return outcome.statusCode === "ACCEPT";
}

function returnTitle(part) {
  return `Company Tax Return ${part} of 2`;
}

function renderLongOutcome() {
  const parts = sending.longPeriod.parts;
  const amended = sending.amendment ? "amended " : "";
  element("returnErrors").replaceChildren();
  element("returnIrmark").replaceChildren();
  const blocks = [];
  const irmarks = [];
  const errors = [];
  for (const part of [1, 2]) {
    const entry = parts[part - 1];
    if (!entry) continue;
    if (entry.statusCode === "ACCEPT") {
      blocks.push(outcomeTitle(`HMRC accepted the ${amended}${returnTitle(part)}`));
      irmarks.push(create("p", {}, `Return ${part} of 2 IRmark: `, create("code", {}, entry.irmark)));
    } else if (entry.statusCode === "REJECT") {
      blocks.push(outcomeTitle(`HMRC rejected the ${amended}${returnTitle(part)}`));
      const outcome = longErrors[part - 1];
      const entries = [...(outcome?.errors ?? []), ...(outcome?.businessErrors ?? [])];
      errors.push(
        create("p", { role: "alert" }, `Return ${part} of 2 was not accepted.`),
        create("ul", {}, ...entries.map((item) => create("li", {}, `Error ${item.number}: ${item.text}`))),
        create("p", {}, `Check the answers these errors name, change them in the review, and send return ${part} of 2 again.`),
      );
    } else {
      blocks.push(
        paragraph(`Return ${part} of 2 `, { strong: entry.correlationId }, " is ", { strong: entry.statusCode }, ". Checking again..."),
      );
    }
  }
  element("returnResult").replaceChildren(...blocks);
  const anyRejected = parts.some((entry) => entry?.statusCode === "REJECT");
  const anyAccepted = parts.some((entry) => entry?.statusCode === "ACCEPT");
  setOutcome(anyRejected ? "error" : anyAccepted && longQueue().length === 0 ? "ok" : undefined);
  if (errors.length > 0) {
    element("returnErrors").replaceChildren(...errors);
    element("returnErrors").style.display = "block";
  } else {
    element("returnErrors").style.display = "none";
  }
  if (irmarks.length > 0) {
    element("returnIrmark").replaceChildren(
      ...irmarks,
      create("p", {}, "Keep the IRmarks. They are HMRC's record of exactly what you sent."),
      create(
        "p",
        { id: "receiptProof" },
        "The receipts below are the company's proof that it filed these returns. Keep them with the company's records.",
      ),
    );
    element("returnIrmark").style.display = "block";
  } else {
    element("returnIrmark").style.display = "none";
  }
  element("startAgainBtn").style.display = longQueue().length === 0 && anyAccepted ? "inline-block" : "none";
}

async function renderLongRecords() {
  const { ctResultCopyHtml, todayText: dateText } = await import("../lib/filing-result-record.js");
  const records = [];
  for (const part of [1, 2]) {
    const entry = sending.longPeriod.parts[part - 1];
    if (entry?.statusCode !== "ACCEPT" || !reviewedPreview?.returns) continue;
    const filed = reviewedPreview.returns[part - 1];
    const html = ctResultCopyHtml({
      company,
      utr: previewRequest.utr,
      boxes: filed.boxes,
      computation: COMPUTATION_LINES.filter(({ field }) => filed.computationLines[field] !== undefined).map(
        ({ field, meaning, deduction, style }) => ({
          label: meaning,
          value: filed.computationLines[field],
          deduction,
          style,
        }),
      ),
      outcome: entry,
      dateText: dateText(),
      longPeriod: { part, parts: 2 },
    });
    records.push(...new DOMParser().parseFromString(html, "text/html").body.childNodes);
  }
  element("returnRecord").replaceChildren(...records);
}

// Return 1 is filed with HMRC, so the accounts, the 15-month figures and the first column no longer change here.
const LOCKED_LONG_FIELDS = [
  "periodStart",
  "periodEnd",
  FIRST_PERIOD_START_FIELD,
  "nonTradingLoanRelationshipCredits",
  "depreciation",
  "amortisation",
  "entertaining",
  "donations",
  "lossOutsideUk",
  "lossesBroughtForward",
  "priorPeriodChargeableProfits",
  "tradeName",
  "sendTo",
];

function firstColumnControls() {
  const firstColumnIds = new Set([...PER_PERIOD_FIELD_IDS, DONATIONS_PAID_FIELD.id, ...PER_PERIOD_LOAN_QUESTION_IDS]);
  const named = [...element("returnForm").querySelectorAll("input, select, button")].filter((control) => {
    const id = control.name || control.id;
    if (control.closest("[data-part]")?.dataset.part === "1" || control.dataset.part === "1") return true;
    return firstColumnIds.has(id) || LOCKED_LONG_FIELDS.includes(id);
  });
  return [...named, ...accountsControls()];
}

const FIRST_RETURN_LOCK_NOTE = "Return 1 is filed with HMRC. Send return 2 first, then amend return 1 from its receipt.";

function lockFirstReturn() {
  for (const control of firstColumnControls()) control.disabled = true;
  element("booksImport").hidden = true;
  element("firstReturnLockNote")?.remove();
  element("formSections").prepend(create("p", { id: "firstReturnLockNote", class: "hint", role: "status" }, FIRST_RETURN_LOCK_NOTE));
}

function unlockFirstReturn() {
  for (const control of firstColumnControls()) control.disabled = false;
  element("firstReturnLockNote")?.remove();
}

function companyAuthCodeProblem() {
  const input = element("companyAuthCode");
  const length = input.value.trim().length;
  if (length >= COMPANY_AUTH_CODE_LENGTH.min && length <= COMPANY_AUTH_CODE_LENGTH.max) return null;
  return { input, message: "Enter the 6 to 8 character company authentication code" };
}

async function runSend(send) {
  hideAmendPanel();
  window.showLoading();
  window.hideStatus();
  try {
    await send();
  } catch (error) {
    console.error("Filing failed:", error);
    if (error.reason === "tokens_exhausted") {
      const accountsFiled = sending.companiesHouse?.statusCode === "ACCEPT";
      showTokensExhausted(accountsFiled ? `The accounts are filed with Companies House. ${error.message}` : error.message);
      return;
    }
    if (error.status === 409) showView("previewView");
    window.showStatus(error.message || "Failed to file with HMRC.", "error");
  } finally {
    window.hideLoading();
  }
}

async function handleSubmitReturn() {
  if (!element("gatewayUserId").value.trim() || !element("gatewayPassword").value) {
    window.showStatus("Enter the Government Gateway user ID and password.", "error");
    return;
  }
  const accountsFirst = accountsStillToSend();
  if (accountsFirst) {
    const problem = companyAuthCodeProblem();
    if (problem) {
      window.formErrors.showFormErrors([problem]);
      return;
    }
    window.formErrors.clearFormErrors();
    if (sending.amendment?.accounts) {
      const differencesProblem = revisionDifferencesProblem();
      if (differencesProblem) {
        window.formErrors.showFormErrors([differencesProblem]);
        return;
      }
      sending.revision = { ...sending.revision, differences: element("revisionDifferences").value.trim() };
    }
  }
  await runSend(async () => {
    const headers = scenarioHeaders();
    if (accountsFirst) {
      let accepted;
      try {
        accepted = await sendAccountsToCompaniesHouse(headers, element("companyAuthCode").value.trim());
      } catch (error) {
        // The accounts never reached Companies House, so nothing is filed and the review stays open.
        if (!sending.companiesHouse) {
          if (error.reason === "tokens_exhausted") {
            showTokensExhausted(error.message);
            return;
          }
          showView("previewView");
          window.showStatus(companiesHouseErrorText(error), "error");
          return;
        }
        throw error;
      }
      if (!accepted) return;
    }
    await sendTaxReturns(headers);
  });
}

// Companies House has not settled the accounts, so the customer sends the Company Tax Return now.
async function handleSendCtNow() {
  await runSend(() => sendTaxReturns(scenarioHeaders()));
}

// Keep asking Companies House. A return not yet sent follows once the accounts are accepted.
async function handleWaitForCompaniesHouse() {
  await runSend(async () => {
    const headers = scenarioHeaders();
    const accepted = await waitForCompaniesHouse(headers);
    if (accepted && !sending.taxReturnSent) await sendTaxReturns(headers);
  });
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  element("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

function startAgain() {
  companiesHousePollWindow++;
  company = null;
  previewRequest = null;
  reviewedValues = null;
  reviewedPreview = null;
  reviewReached = false;
  changing = null;
  Object.assign(sending, {
    mode: "hmrc",
    copy: "full",
    jointFilingId: null,
    companiesHouse: null,
    taxReturnSent: false,
    taxReturnAccepted: false,
    amendment: null,
    revision: null,
    longPeriod: null,
  });
  filedLongBoxes = [null, null];
  longErrors = [null, null];
  forgetJoint();
  hideAmendPanel();
  agentClient = null;
  element("revisionDifferences").value = "";
  element("jointProgress").style.display = "none";
  element("booksImport").hidden = false;
  element("companyAuthCode").value = "";
  configureSendStep();
  element("previewBtn").textContent = PREVIEW_THE_RETURN;
  element("returnResult").replaceChildren();
  element("returnRecord").replaceChildren();
  element("companyForm").reset();
  element("companyNumber").readOnly = false;
  element("companyLookupBtn").disabled = false;
  element("gatewayUserId").value = "";
  element("gatewayPassword").value = "";
  element(SUMMARY_ID)?.remove();
  renderForm();
  renderAgentAuthorisation();
  applyClientToForm();
  if (practiceClients) {
    chooseClient("");
    renderClientChoice();
  }
  mountBooksCard();
  window.hideStatus();
  showView("companyView");
}

// --- Amending from a receipt ---------------------------------------------------------------

const AMENDABLE_KINDS = new Set(["company-tax-return", "companies-house-accounts"]);

function refuseAmendment(text) {
  window.showStatus(text, "error");
}

// An amendment of a long period compares each return with the boxes HMRC holds for it, so it reads the
// latest accepted receipt of both returns of the filing.
async function loadFiledLongReturns(receipt) {
  const list = await window.fetchWithIdToken("/api/v1/hmrc/receipt", {});
  const { receipts = [] } = list.ok ? await list.json() : {};
  const filed = [null, null];
  for (const part of [1, 2]) {
    const entry = receipts.find(
      (candidate) =>
        candidate.kind === "company-tax-return" &&
        candidate.longPeriod?.filingId === receipt.longPeriod.filingId &&
        candidate.longPeriod.part === part,
    );
    const detail = entry ? await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(entry.name)}`, {}) : null;
    filed[part - 1] = detail?.ok ? ((await detail.json()).filed?.boxes ?? null) : null;
  }
  if (!filed[0] || !filed[1]) {
    refuseAmendment(
      "Only one of the two returns of this filing has an accepted receipt. Send the other return first, then amend from its receipt.",
    );
    return false;
  }
  filedLongBoxes = filed;
  return true;
}

// The receipt holds the answers the filing was made from. The form refills from them, the amended
// return (and the revised accounts when the filing included accounts) goes under the original
// jointFilingId, and the customer types the authentication code and the Gateway password again.
async function loadAmendment(receiptName) {
  window.showLoading();
  window.hideStatus();
  try {
    const res = await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(receiptName)}`, {});
    if (!res.ok) {
      refuseAmendment("We could not load that receipt, so there is nothing to amend. Open it again from your receipts.");
      return;
    }
    const receipt = await res.json();
    if (!AMENDABLE_KINDS.has(receipt?.kind)) {
      refuseAmendment(
        "That receipt is not an accounts or Company Tax Return filing, so it cannot be amended. Open the filing from your receipts.",
      );
      return;
    }
    if (receipt.statusCode !== "ACCEPT") {
      refuseAmendment("That filing was not accepted, so there is nothing to amend. File it again from the start.");
      return;
    }
    if (!receipt.formRequest?.company || !receipt.formRequest.values) {
      refuseAmendment(
        "This filing was made before amending from a receipt was possible, so its answers were not kept. File the amended return from the start.",
      );
      return;
    }
    if (receipt.jointFilingId && !(await jointFilingOffered)) {
      refuseAmendment(
        "Filing the accounts and the Company Tax Return together is not available here, so this joint filing cannot be amended.",
      );
      return;
    }
    if (receipt.kind === "companies-house-accounts" && !receipt.jointFilingId) {
      refuseAmendment(
        "These accounts were filed on their own. Amend the Company Tax Return filed with them, or file revised accounts from the start.",
      );
      return;
    }
    if (receipt.longPeriod && !(await loadFiledLongReturns(receipt))) return;
    company = receipt.formRequest.company;
    element("formCompanyName").textContent = company.companyName;
    element("formCompanyNumber").textContent = company.companyNumber;
    fillValues(receipt.formRequest.values);
    await ensureBundle();
    refresh();
    Object.assign(sending, {
      mode: receipt.jointFilingId ? "both" : "hmrc",
      copy: copyOf(receipt.formRequest.values),
      jointFilingId: receipt.jointFilingId ?? null,
      longPeriod: receipt.longPeriod ? { filingId: receipt.longPeriod.filingId, parts: [null, null] } : null,
    });
    startAmendment({ accounts: Boolean(receipt.jointFilingId) });
  } catch (error) {
    console.error("Failed to load the filing to amend:", error);
    refuseAmendment(error.message || "Failed to load the filing to amend.");
  } finally {
    window.hideLoading();
  }
}

renderForm();
applyJointFilingOffer();
renderAgentAuthorisation();
mountBooksCard();
loadPracticeClients();
document.addEventListener("submit-ready", loadPracticeClients, { once: true });
element("clientChoiceOptions").addEventListener("change", (event) => chooseClient(event.target.value));
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);

const returnForm = element("returnForm");
returnForm.addEventListener("input", handleFormInput);
returnForm.addEventListener("click", handleLoanButton);
returnForm.addEventListener("entriesapplying", (event) => growRowsFor(event.detail.entries));
returnForm.addEventListener("change", handleFormChange);
returnForm.addEventListener("focusout", handleFormLeave);
element("companyForm").addEventListener("submit", handleCompanySubmit);
returnForm.addEventListener("submit", handleReturnFormSubmit);
element("previewView").addEventListener("click", handleChangeClick);
window.addEventListener("popstate", () => showView(viewForHistory(location.hash), { push: false }));
history.replaceState({ view: currentView }, "", `#${VIEW_HASH[currentView]}`);
element("backToFormBtn").addEventListener("click", () => showView("formView"));
element("submitReturnBtn").addEventListener("click", handleSubmitReturn);
element("tryAgainBtn").addEventListener("click", () => {
  configureSendStep();
  showView("previewView");
});
element("sendCtNowBtn").addEventListener("click", handleSendCtNow);
element("waitForCompaniesHouseBtn").addEventListener("click", handleWaitForCompaniesHouse);
element("startAgainBtn").addEventListener("click", startAgain);
element("amendAccountsBtn").addEventListener("click", () => startAmendment({ accounts: true }));
element("amendReturnBtn").addEventListener("click", () => startAmendment({ accounts: false }));
element("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});

const amendReceiptName = new URLSearchParams(window.location.search).get("amend");
if (!amendReceiptName) {
  resumeJoint();
} else if (window.__submitReady__) {
  loadAmendment(amendReceiptName);
} else {
  document.addEventListener("submit-ready", () => loadAmendment(amendReceiptName), { once: true });
}
