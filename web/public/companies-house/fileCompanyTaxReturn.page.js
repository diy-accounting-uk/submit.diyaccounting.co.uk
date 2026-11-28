// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// File Company Tax Return: companyView -> formView -> previewView -> resultView. The customer
// types the figures (or a book fills them through the "Fill from your records" card); the form
// checks them as they are entered and works the tax out beside them. The Government Gateway user
// ID and password are read from the page when the return is submitted, sent once and held nowhere
// else.

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
const siteText = (id, english, values) =>
  window.siteText
    ? window.siteText(id, english, values)
    : english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));

import {
  ACCOUNTS_REGIMES,
  ACCOUNTS_REGIME_QUESTION,
  ACCOUNTS_TEXT_FIELDS,
  BALANCE_SHEET_FIELDS,
  CT600_BOX_ROWS,
  COMPUTATION_LINES,
  CT600_FORM_FIELDS,
  DONATIONS_PAID_FIELD,
  FIRST_PERIOD_START_FIELD,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_FIELDS,
  LOAN_ROW_FIELDS,
  MICRO_BALANCE_SHEET_FIELDS,
  MICRO_PROFIT_AND_LOSS_FIELDS,
  MICRO_STATEMENT_FIELD,
  PAGE_QUESTION_FIELDS,
  PROFIT_AND_LOSS_FIELDS,
  REPAYMENT_ROW_FIELDS,
  SEND_TO_HMRC_ONLY_HINT,
  SECTIONS,
  STATEMENT_FIELDS,
  accountsFromValues,
  balanceSheetId,
  PER_PERIOD_FIELD_IDS,
  PER_PERIOD_LOAN_QUESTION_IDS,
  LONG_PERIOD_DONATIONS_LABEL,
  boxChangeTarget,
  lineChangeTarget,
  longPeriodOf,
  periodFieldId,
  secondPeriodField,
  SECOND_PERIOD_SUFFIX,
  ct600RequestFromValues,
  figuresFromValues,
  applyFormEntries,
  financialYearOf,
  formProblems,
  loanId,
  loanRowNumbers,
  microId,
  noteId,
  noteSheetCell,
  parsePounds,
  profitAndLossId,
  regimeOf,
  repaymentId,
  repaymentRowNumbers,
  reviewAnswers,
  targetOfModelProblem,
} from "../lib/ct600-fields.js";
import { applyComparativesRule, companyFromProfile } from "../lib/first-accounts.js";
import { hasRegisterEntry, labelWithReference, noteOf, sourceDisclosure } from "../lib/field-detail.js";
import { ct600RecordHtml } from "../lib/filing-record.js";
import { addSectionVideos } from "../lib/section-video.js";
import { classifyFilingFailure, showFailureDetail } from "../lib/filing-failure.js";
import { noTokensText } from "../lib/accounts-filing-failure.js";
import { longDateText, returnDueDate, taxDueDate } from "../lib/long-period.js";
import { SECTION_413_URL, followedTerms } from "../lib/advance-terms.js";
import {
  carryForwardEntries,
  lastFiledReturn,
  lastYearOfFiledAccounts,
  lastYearOfRegisterAccounts,
  priorYearEntries,
} from "../lib/ct600-carry-forward.js";
import {
  KEEP_DAYS_CHOICES,
  deleteAllDrafts,
  deleteDraft,
  draftSaver,
  keepDays,
  loadDraft,
  saveDraft,
  setKeepDays,
} from "../lib/form-draft.js";
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

const RETURN_TO_REVIEW = siteText("ch.ct.return-to-review", "Return to the review");
const PREVIEW_THE_RETURN = siteText("ch.ct.preview-the-return", "Preview the return");
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
// accounts go to Companies House before the amended return; attachedAccounts is true when a return
// filed with HMRC alone is amended to correct the accounts it carries. revision names the accounts already
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

// The note under a field's label, and under it the disclosure of the spreadsheet cells. A second
// period's column repeats neither the link nor the disclosure's pictures, so it carries the hint only.
function hintOf(field) {
  if (!hasRegisterEntry(field))
    return create("p", { id: `${field.id}-hint`, class: "hint", ...(field.hint ? {} : { hidden: "" }) }, field.hint ?? "");
  if (field.id.endsWith(SECOND_PERIOD_SUFFIX)) return create("p", { id: `${field.id}-hint`, class: "hint" }, field.hint ?? "");
  const fragment = document.createDocumentFragment();
  fragment.append(noteOf(field), sourceDisclosure(field));
  return fragment;
}

function labelOf(field) {
  return hasRegisterEntry(field) ? labelWithReference(field) : field.label;
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
    create("label", { for: field.id }, labelOf(field)),
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
  return create(
    "div",
    { class: "form-group" },
    create("p", { id: field.id, class: "field-label", tabindex: "-1" }, labelOf(field)),
    hintOf(field),
    errorHost(field.id),
    radio("no", siteText("ch.ct.no", "No"), field.default !== "yes"),
    radio("yes", siteText("ch.ct.yes", "Yes"), field.default === "yes"),
  );
}

function datesGroup(field) {
  const dateField = (id, text) =>
    create("div", { class: "form-group" }, create("label", { for: id }, text), inputFor({ id, type: "date", target: field.id }));
  return create(
    "div",
    { "class": "form-group", "id": field.id, "role": "group", "aria-labelledby": `${field.id}-label`, "tabindex": "-1" },
    create("p", { id: `${field.id}-label`, class: "field-label" }, labelOf(field)),
    hintOf(field),
    errorHost(field.id),
    dateField("periodStart", siteText("ch.ct.period-start", "Period start")),
    dateField("periodEnd", siteText("ch.ct.period-end", "Period end")),
  );
}

function checkboxGroup(field, target = field.id) {
  const { id } = field;
  const registered = hasRegisterEntry(field);
  return create(
    "div",
    { class: "form-group" },
    errorHost(target),
    choiceRow(
      create("input", {
        "type": "checkbox",
        id,
        "name": id,
        "data-error-target": target,
        ...(registered ? { "aria-describedby": `${id}-hint` } : {}),
      }),
      create("label", { for: id }, labelOf(field)),
    ),
    ...(registered ? [hintOf(field)] : []),
  );
}

function fieldGroup(field) {
  if (field.type === "choice") return choiceGroup(field);
  if (field.type === "dates") return datesGroup(field);
  if (field.type === "checkbox") return checkboxGroup(field);
  return textGroup(field);
}

// --- The second accounting period of a long period of account -----------------------------------
// Each per-period field sits beside a second column that shows only when the period of account is
// longer than 12 months. The first column keeps the field's own id; the second adds the suffix Ap2.

const PERIOD_HINT_FIELDS = new Set(["annualInvestmentAllowance", "mainPoolAllowances"]);

function returnTag(group, part) {
  const label = group.querySelector("label, p.field-label");
  label?.append(create("span", { class: "long-only", hidden: "" }, siteText("ch.ct.return-tag", " (return {part})", { part })));
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
// A cell with a start holds it as its value and its default, so a fill from a book or the register
// counts it as holding no figure of its own.
function ledgerCell(column, cell, describedBy) {
  const input = inputFor({ id: cell.id, type: "whole-pounds" });
  const field = input.querySelector("input");
  if (describedBy) field.setAttribute("aria-describedby", describedBy);
  else field.removeAttribute("aria-describedby");
  if (cell.start !== undefined) {
    field.setAttribute("value", cell.start);
    field.value = cell.start;
  }
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
    create("th", { scope: "col" }, caption ? visuallyHidden(siteText("ch.ct.column-line", "Line")) : siteText("ch.ct.column-line", "Line")),
    ...columns.map((column) =>
      create("th", { scope: "col", class: ["ledger__figure", column.className].filter(Boolean).join(" ") }, column.title),
    ),
  );
  // A line's note and disclosure sit in a full-width row under it, so the row heading a screen
  // reader announces with each figure stays the label alone; the note describes the figures.
  const body = rows.flatMap((row) => [
    create(
      "tr",
      {},
      create("th", { scope: "row" }, row.label, ...row.cells.map((cell) => errorHost(cell.id))),
      ...columns.map((column, index) => ledgerCell(column, row.cells[index], row.noteId)),
    ),
    ...(row.detail
      ? [create("tr", { class: "ledger__detail" }, create("td", { colspan: String(columns.length + 1) }, ...row.detail))]
      : []),
  ]);
  return create(
    "table",
    { class: ["ledger", className].filter(Boolean).join(" ") },
    ...(caption ? [create("caption", {}, caption)] : []),
    create("thead", {}, head),
    create("tbody", {}, ...body),
  );
}

const YEAR_COLUMNS = [
  { key: "current", title: siteText("ch.ct.this-year-title", "This year"), when: siteText("ch.ct.this-year", "this year") },
  {
    key: "prior",
    title: siteText("ch.ct.last-year-title", "Last year"),
    when: siteText("ch.ct.last-year", "last year"),
    className: "ledger__prior",
  },
];

// An accounts line's row heading: its label led by its reference, its note and its disclosure.
function lineDetail(line, id) {
  return { label: labelWithReference(line), detail: [noteOf(line, id), sourceDisclosure(line, { id })], noteId: `${id}-hint` };
}

function yearLedger(fields, idOf) {
  return ledger({
    className: "ledger--years ledger--one-year",
    columns: YEAR_COLUMNS,
    rows: fields.map((line) => ({
      ...lineDetail(line, idOf("current", line.id)),
      cells: YEAR_COLUMNS.map(({ key, when }) => ({
        id: idOf(key, line.id),
        label: siteText("ch.ct.cell-label", "{label}, {when}", { label: line.label, when }),
        start: "0",
      })),
    })),
  });
}

// The note's six movements as two columns, cost and depreciation, in three rows.
const NOTE_COLUMNS = [{ title: siteText("ch.ct.note-cost", "Cost") }, { title: siteText("ch.ct.note-depreciation", "Depreciation") }];
const NOTE_ROWS = [
  [siteText("ch.ct.note-at-start", "At the start of the period"), "costAtStart", "depreciationAtStart"],
  [siteText("ch.ct.note-added", "Added in the period"), "additions", "depreciationCharge"],
  [siteText("ch.ct.note-disposals", "Taken out on disposals"), "disposals", "depreciationOnDisposals"],
];

function noteLedger(assetClass) {
  const { id: className, label: title } = assetClass;
  const cellLabelOf = (field) => `${title}: ${FIXED_ASSET_FIELDS.find(({ id: candidate }) => candidate === field).label}`;
  const id = `note${className}`;
  return create(
    "div",
    { class: "note-class" },
    ledger({
      caption: labelWithReference(assetClass),
      columns: NOTE_COLUMNS,
      rows: NOTE_ROWS.map(([label, ...fields]) => ({
        label,
        cells: fields.map((field) => ({ id: noteId(className, field), label: cellLabelOf(field) })),
      })),
    }),
    noteOf(assetClass, id),
    sourceDisclosure(assetClass, {
      id,
      rows: FIXED_ASSET_FIELDS.map((field) => ({ title: field.label, value: noteSheetCell(className, field.id) })),
    }),
  );
}

function accountsTextGroup(field) {
  const { id, type } = field;
  if (type === "textarea") {
    return create(
      "div",
      { class: "form-group" },
      create("label", { for: id }, labelOf(field)),
      hintOf(field),
      errorHost(id),
      create("textarea", { id, "name": id, "rows": "3", "data-error-target": id, "aria-describedby": `${id}-hint` }),
    );
  }
  const group = textGroup(field);
  if (id === "directorsAdvanceTerms") {
    group
      .querySelector(`#${id}-hint`)
      .replaceChildren(
        siteText(
          "ch.ct.advance-terms-hint",
          "This is a common arrangement. Change it to the terms the company and the director agreed: the interest rate, any security, and when the advance is repaid. ",
        ),
        create("a", { href: SECTION_413_URL, target: "_blank", rel: "noopener" }, siteText("ch.ct.advance-terms-link", "Section 413")),
        siteText("ch.ct.advance-terms-needs", " needs all three."),
      );
  }
  if (id === "averageEmployees") {
    const input = group.querySelector("input");
    input.setAttribute("value", "0");
    input.value = "0";
  }
  return group;
}

const DONATIONS_FIELD = CT600_FORM_FIELDS.find((field) => field.id === "donations");
const QUESTION = Object.fromEntries(PAGE_QUESTION_FIELDS.map((field) => [field.id, field]));
const LOAN_FIELD = Object.fromEntries(LOAN_ROW_FIELDS.map((field) => [field.id, field]));
const REPAYMENT_FIELD = Object.fromEntries(REPAYMENT_ROW_FIELDS.map((field) => [field.id, field]));
const SEND_TO_BOTH_HINT = siteText(
  "ch.ct.send-both-hint",
  "To file at both, Companies House gets the accounts first. When it accepts them, the Company Tax Return goes to HMRC with the same figures.",
);

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
    create("h3", {}, siteText("ch.ct.where-accounts-go", "Where the accounts go")),
    create(
      "div",
      { class: "form-group" },
      create("p", { id: "sendTo", class: "field-label", tabindex: "-1" }, labelOf(QUESTION.sendTo)),
      hintOf(QUESTION.sendTo),
      errorHost("sendTo"),
      radio("sendToHmrc", "hmrc", siteText("ch.ct.send-to-hmrc", "To HMRC with the Company Tax Return"), true),
      radio("sendToBoth", "both", siteText("ch.ct.send-to-both", "To Companies House and to HMRC with the Company Tax Return"), false),
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

// A revision of the accounts has its own catalogue activity. The amend panel offers to amend the
// accounts only when that activity is shown to this person in this environment. A catalogue or
// environment that cannot be read leaves the offer off.
async function readRevisedAccountsOffered() {
  try {
    const service = await import("/lib/services/catalog-service.js");
    const viewerSettings = await import("/lib/services/viewer-settings.js");
    const [text, environmentName, viewer] = await Promise.all([
      service.fetchCatalogText(),
      service.fetchCurrentEnvironmentName(),
      viewerSettings.fetchViewer(),
    ]);
    return service.isRevisedAccountsOffered(service.parseCatalogueText(text), environmentName, viewer);
  } catch (error) {
    console.warn("Amending the accounts is off because the catalogue could not be read:", error);
    return false;
  }
}

let revisedAccountsOffered = false;
readRevisedAccountsOffered().then((offered) => {
  revisedAccountsOffered = offered;
  if (offered && element("amendPanel").style.display === "block") showAmendPanel();
});

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
    create("p", { id: "companiesHouseCopy", class: "field-label", tabindex: "-1" }, labelOf(QUESTION.companiesHouseCopy)),
    hintOf(QUESTION.companiesHouseCopy),
    errorHost("companiesHouseCopy"),
    radio("copyFull", "full", siteText("ch.ct.full-accounts", "Full accounts"), true),
    radio("copyFilleted", "filleted", siteText("ch.ct.filleted-accounts", "Filleted accounts"), false),
  );
}

function companiesHouseMicroNote() {
  return create(
    "p",
    { id: "companiesHouseMicroNote", class: "hint", hidden: "" },
    siteText(
      "ch.ct.micro-note",
      "Companies House receives the micro-entity balance sheet and notes. The profit and loss account goes to HMRC only.",
    ),
  );
}

// Which accounts the return carries. The card picks the regime from the size of the company in the book.
function regimeGroup() {
  return create(
    "div",
    { class: "form-group" },
    create("p", { id: "accountsRegime", class: "field-label", tabindex: "-1" }, labelOf(ACCOUNTS_REGIME_QUESTION)),
    hintOf(ACCOUNTS_REGIME_QUESTION),
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
    rows: fields.map((line) => ({
      ...lineDetail(line, microId("current", line.id)),
      cells: YEAR_COLUMNS.map(({ key, when }) => ({
        id: microId(key, line.id),
        label: siteText("ch.ct.cell-label", "{label}, {when}", { label: line.label, when }),
        start: "0",
      })),
    })),
  });
}

function accountsSection() {
  return [
    create(
      "p",
      { class: "hint" },
      siteText(
        "ch.ct.accounts-intro",
        "HMRC takes the full accounts with the return, so they are part of this form. Enter whole pounds, for example 600 or 1,200.",
      ),
    ),
    regimeGroup(),
    companiesHouseCopyGroup(),
    companiesHouseMicroNote(),
    checkboxGroup(QUESTION.includeComparatives),
    create("p", { "id": "firstAccountsLine", "class": "hint", "aria-live": "polite" }),
    forRegime(
      "small",
      create("h4", {}, siteText("ch.ct.profit-and-loss", "Profit and loss account")),
      yearLedger(PROFIT_AND_LOSS_FIELDS, profitAndLossId),
      create("h4", {}, siteText("ch.ct.balance-sheet", "Balance sheet")),
      yearLedger(BALANCE_SHEET_FIELDS, balanceSheetId),
      create("h4", {}, siteText("ch.ct.fixed-assets-note", "Tangible fixed assets note")),
      checkboxGroup(QUESTION.includeFixedAssetNote),
      create(
        "div",
        { id: "fixedAssetNoteFields", style: "display: none" },
        ...FIXED_ASSET_CLASSES.map((assetClass) => noteLedger(assetClass)),
      ),
    ),
    forRegime(
      "micro",
      create("h4", {}, siteText("ch.ct.profit-and-loss", "Profit and loss account")),
      create(
        "p",
        { class: "hint" },
        siteText("ch.ct.micro-profit-hint", "Profit before tax and the profit for the year are worked out from these lines."),
      ),
      microLedger(MICRO_PROFIT_AND_LOSS_FIELDS, "ledger--years ledger--one-year"),
      create("h4", {}, siteText("ch.ct.balance-sheet", "Balance sheet")),
      create(
        "p",
        { class: "hint" },
        siteText(
          "ch.ct.micro-balance-hint",
          "Micro-entity accounts show last year's balance sheet beside this year's, unless they are the company's first accounts.",
        ),
      ),
      microLedger(MICRO_BALANCE_SHEET_FIELDS, "ledger--micro-balance-sheet"),
    ),
    create("h4", {}, siteText("ch.ct.about-accounts", "About the accounts")),
    ...ACCOUNTS_TEXT_FIELDS.map((field) => (field.smallOnly ? forRegime("small", accountsTextGroup(field)) : accountsTextGroup(field))),
  ];
}

function workedTaxPanel() {
  return create(
    "section",
    { "id": WORKED_TAX_ID, "class": "worked-tax", "aria-labelledby": "workedTaxHeading", "tabindex": "-1" },
    create("h3", { id: "workedTaxHeading" }, siteText("ch.ct.worked-heading", "Tax worked out from your answers")),
    create(
      "p",
      { class: "hint" },
      siteText("ch.ct.worked-hint", "These boxes are worked out and cannot be typed. Each shows the rule that gives it."),
    ),
    errorHost(WORKED_TAX_ID),
    create(
      "p",
      { id: "workedTaxEmpty", class: "hint" },
      siteText("ch.ct.worked-empty", "Fill in the period and the accounts and the tax appears here."),
    ),
    create("dl", { id: "workedTaxRows", class: "worked-tax__list" }),
    create("div", { id: "workedTaxSteps" }),
    create("div", { id: "workedTaxLong", class: "worked-tax__returns", hidden: "" }),
  );
}

// The capital allowance boxes in the order of the CT600, grouped by the class of asset they claim for.
const ALLOWANCE_CLASSES = [
  {
    title: siteText("ch.ct.class-aia", "Annual investment allowance"),
    ids: ["annualInvestmentAllowance", "annualInvestmentAllowanceOutsideTrade"],
  },
  { title: siteText("ch.ct.class-main-pool", "Main pool"), ids: ["mainPoolAllowances", "mainPoolBalancingCharges"] },
  { title: siteText("ch.ct.class-full-expensing", "Full expensing"), ids: ["fullExpensingAllowances", "fullExpensingBalancingCharges"] },
  {
    title: siteText("ch.ct.class-special-rate", "Special rate allowance"),
    ids: ["specialRateAllowances", "specialRateBalancingCharges", "specialRateAllowanceExpenditure"],
  },
  {
    title: siteText("ch.ct.class-special-rate-pool", "Special rate pool"),
    ids: ["specialRatePoolAllowances", "specialRatePoolAnnualInvestmentAllowance", "specialRatePoolBalancingCharges"],
  },
  {
    title: siteText("ch.ct.class-first-year", "First year allowance and other plant"),
    ids: ["firstYearAllowanceExpenditure", "otherMachineryAndPlantExpenditure"],
  },
];

// Each class folds under its name with its boxes side by side where the width allows, and the whole
// section folds too: most companies claim none of them.
function allowanceClasses(fields) {
  const byId = new Map(
    fields.map((group, index) => [CT600_FORM_FIELDS.filter((field) => field.section === "allowances")[index].id, group]),
  );
  const grouped = ALLOWANCE_CLASSES.map(({ title, ids }, index) =>
    fold(`foldAllowanceClass${index + 1}`, title, [create("div", { class: "allowance-grid" }, ...ids.map((id) => byId.get(id)))], {
      heading: "h4",
    }),
  );
  const ungrouped = [...byId].filter(([id]) => !ALLOWANCE_CLASSES.some(({ ids }) => ids.includes(id))).map(([, group]) => group);
  return [fold("foldAllowances", SECTION_TITLE.allowances, [...grouped, ...ungrouped])];
}

// --- Folds: a block most returns leave at 0, closed until it holds an answer ----------------------

const SECTION_TITLE = Object.fromEntries(SECTIONS.map(({ id, title }) => [id, title]));
const TRADING_LOSS_IDS = [
  "lossesBroughtForward",
  "lossAgainstTotalProfits",
  "lossesBroughtForwardAgainstTotalProfits",
  "lossCarriedBack",
  "priorPeriodChargeableProfits",
  "lossOutsideUk",
];
const OTHER_INCOME_IDS = ["frankedInvestmentIncome"];

// A fold's summary reads "<title>, All 0" to a screen reader; a fold named as a heading (an allowance
// class) keeps its title as that heading, so heading navigation still finds it.
function fold(id, title, children, { heading } = {}) {
  const titleNode = create(heading ?? "span", { class: "form-fold__title" }, title);
  return create(
    "details",
    { id, "class": "form-fold", "data-fold": "" },
    create("summary", {}, titleNode, create("span", { class: "visually-hidden" }, ","), " ", create("span", { class: "form-fold__count" })),
    ...children,
  );
}

// An answer other than the box's start: a figure other than 0 however it is written ("0.00", "£0"),
// text other than its start, or a choice or tick changed.
function answered(control) {
  if (control.disabled) return false;
  if (control.type === "radio" || control.type === "checkbox") return control.checked !== control.defaultChecked;
  const value = control.value.trim();
  if (value === "" || value === control.defaultValue) return false;
  const amount = parsePounds(value);
  return amount === null || amount !== 0;
}

// Each fold says "All 0" or how many of its boxes hold an answer, and opens itself when that count
// grows (a value typed, a book or a file filling it, saved answers restored into it), and stays open
// while one of its boxes shows a problem. A fold the reader closed stays closed until one of those happens.
function updateFolds() {
  const shown = new Set(state.problems.filter((problem) => state.touched.has(problem.target)).map((problem) => problem.target));
  for (const details of element("formSections").querySelectorAll("details[data-fold]")) {
    const showsProblem = [...details.querySelectorAll("[data-error-target]")].some((control) => shown.has(control.dataset.errorTarget));
    if (showsProblem) details.open = true;
    const targets = new Set(
      [...details.querySelectorAll("input[data-error-target], select[data-error-target]")]
        .filter((control) => !control.closest("[hidden]") && answered(control))
        .map((control) => control.dataset.errorTarget),
    );
    const count = targets.size;
    let countText = siteText("ch.ct.fold-none", "All 0");
    if (count === 1) countText = siteText("ch.ct.fold-one", "1 answered");
    if (count > 1) countText = siteText("ch.ct.fold-many", "{count} answered", { count });
    details.querySelector(".form-fold__count").textContent = countText;
    if (count > Number(details.dataset.count ?? 0)) details.open = true;
    details.dataset.count = String(count);
  }
}

function openFoldsAround(node) {
  for (let fold = node?.closest("details"); fold; fold = fold.parentElement?.closest("details")) fold.open = true;
}

// --- Loans to participators: rows the customer adds and removes -------------------------------
// Each accounting period of a long period of account has its own set of rows. Part 2's ids carry the
// suffix Ap2.

const loanRows = { 1: 1, 2: 1 };
const repaymentRows = { 1: 1, 2: 1 };
const PARTS = [1, 2];

function removeButton(kind, row, part, label) {
  return create(
    "button",
    { "type": "button", "class": "secondary-button", "data-remove": kind, "data-row": String(row), "data-part": String(part) },
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
    textGroup({ ...LOAN_FIELD.Name, id: loanId("Name", row, part), type: "text", maxlength: 56 }),
    textGroup({ ...LOAN_FIELD.Amount, id: loanId("Amount", row, part), type: "whole-pounds" }),
    create(
      "div",
      { "class": "loan-row__lent", "data-loan-lent": String(row), "hidden": "" },
      textGroup({ ...LOAN_FIELD.Lent, id: loanId("Lent", row, part), type: "whole-pounds" }),
    ),
    textGroup({ ...LOAN_FIELD.Rate, id: loanId("Rate", row, part), type: "text", inputmode: "decimal" }),
    removeButton("loan", row, part, siteText("ch.ct.remove-loan", "Remove this loan")),
  );
  registerTargets(group);
  return group;
}

function repaymentRow(row, part) {
  const nameId = repaymentId("Name", row, part);
  const select = create("select", { "id": nameId, "name": nameId, "data-error-target": nameId, "aria-describedby": `${nameId}-hint` });
  const group = create(
    "div",
    { "class": "loan-row", "data-repayment-row": String(row), "data-part": String(part) },
    create(
      "div",
      { class: "form-group" },
      create("label", { for: nameId }, labelOf(REPAYMENT_FIELD.Name)),
      hintOf({ ...REPAYMENT_FIELD.Name, id: nameId }),
      errorHost(nameId),
      select,
    ),
    textGroup({ ...REPAYMENT_FIELD.Date, id: repaymentId("Date", row, part), type: "date" }),
    textGroup({ ...REPAYMENT_FIELD.Repaid, id: repaymentId("Repaid", row, part), type: "whole-pounds" }),
    textGroup({ ...REPAYMENT_FIELD.Released, id: repaymentId("Released", row, part), type: "whole-pounds" }),
    removeButton("repayment", row, part, siteText("ch.ct.remove-repayment", "Remove this repayment")),
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
      create("h4", {}, siteText("ch.ct.loans-owed", "Loans still owed at the end of the period")),
      create("div", { id: id("loanRows") }),
      create(
        "button",
        { "type": "button", "id": id("addLoanBtn"), "class": "secondary-button add-row-button", "data-part": String(part) },
        siteText("ch.ct.add-participator", "Add another participator"),
      ),
      releasedBeforeEnd,
      repaidSince,
      create(
        "div",
        { id: id("repaymentsDetail"), hidden: "" },
        create("h4", {}, siteText("ch.ct.repayments-heading", "Repayments, releases and write-offs since the period end")),
        create(
          "p",
          { class: "hint" },
          siteText(
            "ch.ct.repayments-hint",
            "Enter what was repaid up to today. You claim relief on later repayments from HMRC after they are made.",
          ),
        ),
        create("div", { id: id("repaymentRows") }),
        create(
          "button",
          { "type": "button", "id": id("addRepaymentBtn"), "class": "secondary-button add-row-button", "data-part": String(part) },
          siteText("ch.ct.add-repayment", "Add another repayment"),
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
      create("h4", { id: "loansPart2Heading" }, siteText("ch.ct.loans-part-2", "Return 2 of 2: the second accounting period")),
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
        create("option", { value: "" }, siteText("ch.ct.choose-participator", "Choose a participator")),
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
  const group = choiceGroup({ ...QUESTION.firstPeriodStart, id: FIRST_PERIOD_START_FIELD, default: "yes" });
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
    const ids = CT600_FORM_FIELDS.filter((field) => field.section === "reliefs").map((field) => field.id);
    const groupOf = (id) => fields[ids.indexOf(id)];
    const open = ids.filter((id) => !TRADING_LOSS_IDS.includes(id) && !OTHER_INCOME_IDS.includes(id));
    return [
      ...open.map(groupOf),
      donationsPaid,
      fold("foldTradingLosses", siteText("ch.ct.fold-trading-losses", "Trading losses"), TRADING_LOSS_IDS.map(groupOf)),
      fold("foldOtherIncome", siteText("ch.ct.fold-other-income", "Other income"), OTHER_INCOME_IDS.map(groupOf)),
    ];
  }
  if (sectionId === "payments") {
    const ids = CT600_FORM_FIELDS.filter((field) => field.section === "payments").map((field) => field.id);
    const own = fields[ids.indexOf("ownCorporationTax")];
    return [
      ...fields.filter((group) => group !== own),
      fold("foldOwnWorking", siteText("ch.ct.fold-own-working", "Your own working (optional)"), [own]),
    ];
  }
  if (sectionId === "accounts") return accountsSection();
  if (sectionId === "declaration") {
    return [
      ...fields.slice(0, 2),
      create("h4", {}, siteText("ch.ct.statements", "Statements")),
      ...STATEMENT_FIELDS.slice(0, 3).map((field) => checkboxGroup(field)),
      forRegime("small", checkboxGroup(STATEMENT_FIELDS[3])),
      forRegime("micro", checkboxGroup(MICRO_STATEMENT_FIELD)),
      create("h4", {}, siteText("ch.ct.declaration", "Declaration")),
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
  addSectionVideos(document);
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

// Accounts show last year's figures unless they are the company's first, which the company's
// profile and the period start show. The box follows that rule, the line under it says which, and
// the micro-entity balance sheet leaves out last year's column for first accounts.
function applyFirstAccountsRule() {
  const first = applyComparativesRule({
    box: element("includeComparatives"),
    line: element("firstAccountsLine"),
    company,
    periodStart: element("periodStart").value,
  });
  element("formSections").querySelector(".ledger--micro-balance-sheet").classList.toggle("ledger--one-year", first);
}

function toggleSections() {
  applyFirstAccountsRule();
  const oneYear = !element("includeComparatives").checked;
  for (const table of element("formSections").querySelectorAll(".ledger--years")) table.classList.toggle("ledger--one-year", oneYear);
  element("fixedAssetNoteFields").style.display = element("includeFixedAssetNote").checked ? "block" : "none";
}

// --- Answers saved in this browser ------------------------------------------------------------

const DRAFT_JOURNEY = "ct600";

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function signedInSub() {
  try {
    return JSON.parse(localStorage.getItem("userInfo") ?? "null")?.sub ?? null;
  } catch {
    return null;
  }
}

function draftScope() {
  return { journey: DRAFT_JOURNEY, sub: signedInSub(), companyNumber: company?.companyNumber };
}

// Saved one second after the last change, while the return is still being prepared.
function saveAnswers() {
  const storage = browserStorage();
  if (!storage || !company || sending.taxReturnSent) return;
  const values = readValues();
  saveDraft(storage, { ...draftScope(), period: { periodStart: values.periodStart, periodEnd: values.periodEnd }, values });
}

const answersSaver = draftSaver(saveAnswers);

// The filing is accepted: the saved answers have done their work.
function forgetSavedAnswers() {
  answersSaver.cancel();
  const storage = browserStorage();
  if (storage) deleteDraft(storage, draftScope());
}

function savedAtText(iso) {
  const saved = new Date(iso);
  const pad = (number) => String(number).padStart(2, "0");
  const day = `${saved.getFullYear()}-${pad(saved.getMonth() + 1)}-${pad(saved.getDate())}`;
  return siteText("ch.ct.draft-saved-at", "{date} at {time}", {
    date: longDateText(day),
    time: `${pad(saved.getHours())}:${pad(saved.getMinutes())}`,
  });
}

function draftPeriodText(period) {
  if (!period?.periodStart || !period?.periodEnd) return siteText("ch.ct.draft-no-period", "with no period entered yet");
  return siteText("ch.ct.draft-period", "for the period {start} to {end}", {
    start: longDateText(period.periodStart),
    end: longDateText(period.periodEnd),
  });
}

function restoreNotice(storage, record) {
  const restore = create(
    "button",
    { type: "button", id: "draftRestoreBtn", class: "btn" },
    siteText("ch.ct.draft-restore", "Restore my answers"),
  );
  const discard = create(
    "button",
    { type: "button", id: "draftDiscardBtn", class: "secondary-button" },
    siteText("ch.ct.draft-discard", "Start again"),
  );
  restore.addEventListener("click", () => {
    fillValues(record.values);
    setDefaults();
    refresh();
    element("draftRestore").remove();
    window.showStatus(siteText("ch.ct.draft-restored", "Your saved answers are back in the form."), "info");
  });
  discard.addEventListener("click", () => {
    deleteDraft(storage, draftScope());
    element("draftRestore").remove();
  });
  return create(
    "section",
    { "id": "draftRestore", "class": "form-section", "aria-labelledby": "draftRestoreHeading" },
    create("h3", { id: "draftRestoreHeading" }, siteText("ch.ct.draft-heading", "Answers saved in this browser")),
    create(
      "p",
      {},
      siteText("ch.ct.draft-found", "This browser holds answers for this company {period}, saved on {saved}.", {
        period: draftPeriodText(record.period),
        saved: savedAtText(record.savedAt),
      }),
    ),
    create("div", { class: "button-row" }, restore, " ", discard),
  );
}

function keepChoice(storage) {
  const select = create("select", { "id": "draftKeepDays", "aria-describedby": "draftKeepDays-hint" });
  const chosen = keepDays(storage);
  for (const days of KEEP_DAYS_CHOICES) {
    const option = create(
      "option",
      { value: String(days) },
      days === 0 ? siteText("ch.ct.draft-keep-none", "Do not keep") : siteText("ch.ct.draft-keep-days", "{days} days", { days }),
    );
    if (days === chosen) option.selected = true;
    select.append(option);
  }
  const deleted = create("p", { "id": "draftDeleted", "class": "hint", "aria-live": "polite" });
  select.addEventListener("change", () => {
    const days = Number(select.value);
    setKeepDays(storage, days, { sub: signedInSub() });
    deleted.textContent = days === 0 ? siteText("ch.ct.draft-none-kept", "Your answers are not kept in this browser.") : "";
    if (days === 0) element("draftRestore")?.remove();
  });
  const deleteAll = create(
    "button",
    { type: "button", id: "draftDeleteAllBtn", class: "secondary-button" },
    siteText("ch.ct.draft-delete-all", "Delete my saved answers"),
  );
  deleteAll.addEventListener("click", () => {
    answersSaver.cancel();
    deleteAllDrafts(storage, signedInSub());
    element("draftRestore")?.remove();
    deleted.textContent = siteText("ch.ct.draft-deleted", "Your saved answers are deleted from this browser.");
  });
  return create(
    "div",
    { class: "form-group", id: "draftKeep" },
    create("label", { for: "draftKeepDays" }, siteText("ch.ct.draft-keep-label", "Keep my answers in this browser for")),
    create(
      "p",
      { id: "draftKeepDays-hint", class: "hint" },
      siteText(
        "ch.ct.draft-keep-hint",
        "Your answers are saved as you type, so a closed tab or a new sign-in loses nothing. They are kept only in this browser, never on our servers, and anyone who uses this browser could see them. On a shared computer, choose Do not keep.",
      ),
    ),
    select,
    " ",
    deleteAll,
    deleted,
  );
}

// After the company lookup: the choice of how long answers are kept, and the answers saved for
// this company, if there are any.
function renderDraftPanel() {
  const host = element("draftPanel");
  const storage = browserStorage();
  if (!storage || !company || !signedInSub()) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  const record = loadDraft(storage, draftScope());
  host.replaceChildren(...(record ? [restoreNotice(storage, record)] : []), keepChoice(storage));
  host.hidden = false;
}

// --- Starting from last year's return ----------------------------------------------------------

function dayText(isoDate) {
  return isoDate ? longDateText(String(isoDate).slice(0, 10)) : "";
}

// The losses last year's return carried forward, worked again from the answers it kept: the last
// return of a long period of account carries them. Null with the reason when they are not known.
async function lossesCarriedForwardFrom(record) {
  const values = record.formRequest?.values;
  const filedCompany = record.formRequest?.company;
  if (!values || !filedCompany) return { losses: null, why: "no-answers" };
  try {
    await ensureTaxData(values.periodStart, values.periodEnd);
    const figures = withoutOwnWorking(figuresFromValues(values, filedCompany, undefined));
    const input = { ...figures, ...placeholdersFor(figures) };
    const derived = figures.accountingPeriods
      ? state.bundle.deriveLongPeriodReturns(input, taxDataByYear(), { today: today() }).at(-1)
      : state.bundle.deriveCt600FromFigures(input, taxDataByYear(), { today: today() });
    return { losses: derived.losses?.totalCarriedForward ?? 0 };
  } catch (error) {
    console.warn("Last year's losses carried forward could not be worked again:", error);
    return { losses: null, why: "not-worked" };
  }
}

// Last year's accounts: those filed with the return, or the company's last accounts on the register
// when they are for the same period. Null when neither holds them.
async function lastYearAccountsFor(record, periodEnd) {
  if (record.filed?.accountsIxbrl) {
    const mapped = state.bundle.mapIxbrlAccounts(record.filed.accountsIxbrl, { regime: "any" });
    return { accounts: lastYearOfFiledAccounts(mapped), source: "filed" };
  }
  const response = await window.fetchWithIdToken(
    `/api/v1/companies-house/company/${encodeURIComponent(company.companyNumber)}/last-accounts`,
    {},
  );
  if (!response.ok) return null;
  const answer = await response.json();
  if (answer.outcome !== "mapped" || answer.set?.madeUpDate !== periodEnd) return null;
  return { accounts: lastYearOfRegisterAccounts(answer.accounts), source: "register" };
}

async function startFromLastYear(listed) {
  const panel = element("lastYearPanel");
  const button = element("lastYearStartBtn");
  button.disabled = true;
  try {
    const response = await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(listed.name)}`, {});
    if (!response.ok) throw new Error(`the return could not be read (${response.status})`);
    const record = { ...(await response.json()), periodEnd: listed.periodEnd };
    await ensureBundle();
    const { losses: lossesCarriedForward, why } = await lossesCarriedForwardFrom(record);
    const lastYear = await lastYearAccountsFor(record, listed.periodEnd);
    applyFormEntries([...carryForwardEntries(record, { lossesCarriedForward }), ...(lastYear ? priorYearEntries(lastYear.accounts) : [])]);
    setDefaults();
    refresh();
    const said = [
      siteText(
        "ch.ct.last-year-started",
        "Started from your Company Tax Return for {start} to {end}: the period after it, box 326, the trade name, the declarant and the statements as last year, and last year's chargeable profits. Type this year's figures.",
        { start: dayText(listed.periodStart), end: dayText(listed.periodEnd) },
      ),
      why === "no-answers"
        ? siteText("ch.ct.last-year-no-losses", "That return kept no answers to work its losses from, so box 160 is left for you.")
        : why === "not-worked"
          ? siteText(
              "ch.ct.last-year-losses-not-worked",
              "Its losses could not be worked again from the answers it kept, so box 160 is left for you.",
            )
          : siteText("ch.ct.last-year-losses", "Box 160 is the losses it carried forward."),
      lastYear?.source === "filed"
        ? siteText("ch.ct.last-year-accounts-filed", "Last year's accounts figures are those filed with that return.")
        : lastYear?.source === "register"
          ? siteText(
              "ch.ct.last-year-accounts-register",
              "Last year's accounts figures are the company's accounts on the Companies House register.",
            )
          : siteText(
              "ch.ct.last-year-accounts-none",
              "Neither that return nor the register holds last year's accounts, so their column is left at 0.",
            ),
    ];
    panel.replaceChildren(create("p", { id: "lastYearStarted" }, said.join(" ")));
  } catch (error) {
    button.disabled = false;
    window.showStatus(
      siteText("ch.ct.last-year-failed", "Could not start from last year's return: {reason}.", {
        reason: String(error.message).replace(/\.$/, ""),
      }),
      "error",
    );
  }
}

// After the company lookup: when Submit filed the company's last Company Tax Return, the form can
// start from it.
async function offerLastYear() {
  const panel = element("lastYearPanel");
  panel.hidden = true;
  panel.replaceChildren();
  const url = agentClient?.clientId ? `/api/v1/hmrc/receipt?clientId=${encodeURIComponent(agentClient.clientId)}` : "/api/v1/hmrc/receipt";
  const response = await window.fetchWithIdToken(url, {}).catch(() => null);
  if (!response?.ok) return;
  const listed = lastFiledReturn((await response.json()).receipts, company?.companyNumber);
  if (!listed) return;
  const button = create(
    "button",
    { type: "button", id: "lastYearStartBtn", class: "btn" },
    siteText("ch.ct.last-year-start", "Start from last year's return"),
  );
  button.addEventListener("click", () => startFromLastYear(listed));
  panel.replaceChildren(
    create(
      "p",
      {},
      siteText(
        "ch.ct.last-year-offer",
        "Submit filed this company's Company Tax Return for {start} to {end}. This year's return can start from it.",
        {
          start: dayText(listed.periodStart),
          end: dayText(listed.periodEnd),
        },
      ),
    ),
    button,
  );
  panel.hidden = false;
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

// The terms of an advance to a director: a common arrangement while the advance has an amount and
// the field is empty, until the customer types in it. The amount owed at the end is worked out for
// micro-entity accounts and is the balance sheet's amount owed by directors for small company ones.
function followAdvanceTerms(values) {
  const whole = (id) =>
    Number(
      String(values[id] ?? "")
        .replaceAll(",", "")
        .replace("£", "")
        .trim() || 0,
    );
  const atEnd =
    regimeOf(values) === "micro"
      ? whole("directorsAdvanceAtStart") + whole("directorsAdvanceMade") - whole("directorsAdvanceRepaid")
      : whole(balanceSheetId("current", "amountsOwedByDirectors"));
  const next = followedTerms({
    terms: values.directorsAdvanceTerms,
    amounts: [values.directorsAdvanceAtStart, values.directorsAdvanceMade, String(atEnd)],
    typed: state.edited.has("directorsAdvanceTerms"),
  });
  if (next !== null) element("directorsAdvanceTerms").value = next;
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
  followAdvanceTerms(values);
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
    message: isSecondColumnTarget(target)
      ? siteText("ch.ct.return-of-2-message", "Return {part} of 2: {message}", { part, message: problem.message })
      : problem.message,
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

// A loan or repayment row's field of the given return (1 or 2), such as loanName1 or repaymentAmount2Ap2.
function isLoanRowFieldOf(target, part) {
  const match = /^(loan|repayment)[A-Z][A-Za-z]*\d+(Ap2)?$/.exec(target);
  return Boolean(match) && Boolean(match[2]) === (part === 2);
}

// The model checks the loan rows too, and its problems show at the loans question, which is touched as soon as
// Yes is chosen. Where the form has a problem at one of that return's row fields, the row field carries it and
// shows it once the field is left or the form is sent, so the model's copy at the question is left out.
function isCoveredByLoanRowField(problem, formProblemList) {
  const part = [1, 2].find((candidate) => problem.target === periodFieldId("loansMade", candidate));
  return part !== undefined && formProblemList.some((formProblem) => isLoanRowFieldOf(formProblem.target, part));
}

// One problem per target: the form's own checks first, then the model's, in the order the form shows them.
function evaluate(values) {
  const merged = new Map();
  const ownProblems = formProblems(values);
  const fromModel = modelProblems(values).filter((problem) => !isCoveredByLoanRowField(problem, ownProblems));
  for (const problem of [...ownProblems, ...fromModel]) {
    if (!merged.has(problem.target)) merged.set(problem.target, problem);
  }
  return [...merged.values()].sort((a, b) => orderOfTarget(a.target) - orderOfTarget(b.target));
}

function workedValue(box, value) {
  if (box === 340 || box === 390) return `${value}%`;
  if (box === 329) return siteText("ch.ct.yes", "Yes");
  if (box === 330 || box === 380) return String(value);
  return `£${formatPounds(value)}`;
}

const RATE_SOURCE_TEXT = {
  "tax-data": siteText("ch.ct.rate-tax-data", "from the tax data for the tax year of the loan"),
  "online-rules": siteText("ch.ct.rate-online-rules", "the rate HMRC's online rules accept"),
  "customer-entered": siteText("ch.ct.rate-customer", "the rate you entered"),
};

function percentText(rate) {
  return `${Number((rate * 100).toFixed(2))}%`;
}

// The supplementary page CT600A boxes the tax is worked from, and the rate each loan uses.
function loansWorkedRows(page) {
  const row = workedRow;
  const rows = [
    row(
      siteText("ch.ct.a15", "Box A15: total of the loans still owed"),
      `£${formatPounds(page.totalLoans)}`,
      siteText("ch.ct.a15-rule", "The loans you entered"),
    ),
    row(
      siteText("ch.ct.a20", "Box A20: tax on the loans"),
      `£${formatPounds(page.taxChargeable)}`,
      siteText("ch.ct.a20-rule", "Each loan at its section 455 rate, to the penny"),
    ),
  ];
  if (page.partTwo) {
    rows.push(
      row(
        siteText("ch.ct.a45", "Box A45: relief for loans repaid within nine months"),
        `£${formatPounds(page.partTwo.relief)}`,
        siteText("ch.ct.a45-rule", "The amount repaid, released or written off, at the rate of the loan"),
      ),
    );
  }
  if (page.partThree) {
    rows.push(
      row(
        siteText("ch.ct.a70", "Box A70: relief for later repayments"),
        `£${formatPounds(page.partThree.relief)}`,
        siteText("ch.ct.a70-rule", "Relief that is already due"),
      ),
    );
  }
  rows.push(
    row(
      siteText("ch.ct.a80", "Box A80: tax payable on loans to participators"),
      `£${formatPounds(page.taxPayable)}`,
      siteText("ch.ct.a80-rule", "Carried to box 480"),
      "workedLoanTax",
    ),
  );
  for (const loan of page.rates) {
    for (const part of loan.parts) {
      rows.push(
        row(
          loan.parts.length > 1
            ? siteText("ch.ct.loan-rate-from", "Section 455 rate for {name} (lent from {from})", { name: loan.name, from: part.from })
            : siteText("ch.ct.loan-rate-for", "Section 455 rate for {name}", { name: loan.name }),
          percentText(part.rate),
          RATE_SOURCE_TEXT[part.source],
          undefined,
        ),
      );
    }
  }
  for (const warning of page.warnings) {
    rows.push(
      create(
        "div",
        { "class": "worked-tax__row", "role": "note", "data-warning": "" },
        create("dt", {}, siteText("ch.ct.warning", "Warning")),
        create("dd", {}, warning),
      ),
    );
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

// The boxes a reader checks first stay in view; every other row folds under "How these are worked out".
const KEY_WORKED_BOXES = new Set(["155", "315", "440", "600"]);

function workedSteps(items, openKey) {
  const key = items.filter((item) => KEY_WORKED_BOXES.has(item.dataset.box) || "warning" in item.dataset);
  const steps = items.filter((item) => !key.includes(item));
  // The panel is built again on each change; the fold itself is kept, so a reader opening it is
  // not undone by a change that lands between pressing and releasing the button.
  const details =
    document.querySelector(`details[data-steps="${openKey}"]`) ??
    create(
      "details",
      { "class": "worked-tax__steps", "data-steps": openKey },
      create("summary", {}, siteText("ch.ct.worked-steps", "How these are worked out")),
      create("dl", { class: "worked-tax__list" }),
    );
  details.querySelector("dl").replaceChildren(...steps);
  return { key, details };
}

// The rows of one return: its adjusted profit, each worked box, the loans page, and the loss carried forward or back.
function workedItems(derived) {
  const items = [
    workedRow(
      siteText("ch.ct.worked-adjusted", "Adjusted profit or loss in the computation"),
      `£${formatPounds(derived.computationLines.adjustedProfit)}`,
      siteText(
        "ch.ct.worked-adjusted-rule",
        "Profit per the accounts, less bank interest, plus depreciation, amortisation, entertaining and donations, less capital allowances. A loss shows in brackets.",
      ),
    ),
  ];
  for (const row of CT600_BOX_ROWS.filter(
    (candidate) => candidate.kind === "worked" && candidate.box in derived.boxes && candidate.box > 145,
  )) {
    const item = workedRow(
      siteText("ch.ct.box-label", "Box {box}: {label}", { box: row.box, label: row.label }),
      workedValue(row.box, derived.boxes[row.box]),
      row.rule,
    );
    item.dataset.box = String(row.box);
    items.push(item);
  }
  if (derived.ct600a) items.push(...loansWorkedRows(derived.ct600a));
  if (derived.losses.totalCarriedForward > 0) {
    items.push(
      workedRow(
        siteText("ch.ct.losses-carried", "Trading losses carried forward"),
        `£${formatPounds(derived.losses.totalCarriedForward)}`,
        siteText("ch.ct.losses-carried-rule", "The loss of this period and the losses brought forward that no claim uses"),
        "workedCarriedForward",
      ),
    );
  }
  if (derived.carryBack) {
    items.push(
      workedRow(
        siteText("ch.ct.carry-back", "Corporation Tax repayable on the carry-back claim"),
        `£${formatPounds(derived.carryBack.taxRepayable)}`,
        siteText(
          "ch.ct.carry-back-rule",
          "Claimed against the period {start} to {end}. That return carries the loss in box 275 with box 280 ticked.",
          { start: derived.carryBack.priorPeriodStart, end: derived.carryBack.priorPeriodEnd },
        ),
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
// One return's column: its key boxes in view, its other rows under "How these are worked out".
function longColumnRows(index, items) {
  const { key, details } = workedSteps(items, `return${index + 1}`);
  return [create("dl", { class: "worked-tax__list" }, ...key), details];
}

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
          siteText("ch.ct.limits", "Limits for the financial year {year}", { year }),
          siteText("ch.ct.limits-value", "£{small} and £{upper}", {
            small: formatPounds(Math.round(rates.small_profits_limit * scale * 100) / 100),
            upper: formatPounds(Math.round(rates.main_rate_limit * scale * 100) / 100),
          }),
          siteText(
            "ch.ct.limits-rule",
            "The small profits limit and the upper limit, scaled to the {days} days of this accounting period",
            {
              days: period.days,
            },
          ),
        ),
      ];
    });
    return create(
      "section",
      { "class": "worked-tax__return", "aria-labelledby": `workedReturn${index + 1}Heading` },
      create(
        "h4",
        { id: `workedReturn${index + 1}Heading` },
        siteText("ch.ct.return-range", "Return {part} of 2: {start} to {end}", {
          part: index + 1,
          start: longDateText(period.periodStart),
          end: longDateText(period.periodEnd),
        }),
      ),
      ...longColumnRows(index, [
        workedRow(
          siteText("ch.ct.days", "Days in this accounting period"),
          siteText("ch.ct.days-value", "{days} of {whole} days", { days: period.days, whole: wholeDays }),
          siteText(
            "ch.ct.days-rule",
            "Turnover, bank interest and the adjusted profit are shared by days: {percent}% of the period of account.",
            {
              percent: Math.round(proportion * 10000) / 100,
            },
          ),
        ),
        ...workedItems(derived),
        ...limits,
        workedRow(
          siteText("ch.ct.tax-due", "Tax due"),
          longDateText(taxDueDate(period.periodEnd)),
          siteText("ch.ct.tax-due-rule", "The day after nine months from the end of this accounting period"),
        ),
        workedRow(
          siteText("ch.ct.return-due", "Return due"),
          longDateText(returnDueDate(periods.periods[1].periodEnd)),
          siteText("ch.ct.return-due-rule", "Both returns are due 12 months after the period of account ends"),
        ),
      ]),
    );
  });
  holder.replaceChildren(...columns);
  holder.hidden = false;
  element("workedTaxRows").hidden = true;
}

// The worked tax panel shows the tax the return works out, so the person's own working is left out
// of what it derives: the review and the filing still compare the two and refuse a disagreement.
function withoutOwnWorking(figures) {
  const { ownCorporationTax: _own, ...rest } = figures;
  if (!rest.accountingPeriods) return rest;
  return {
    ...rest,
    accountingPeriods: rest.accountingPeriods.map(({ ownCorporationTax: _periodOwn, ...period }) => period),
  };
}

function renderWorkedTax(values) {
  const rows = element("workedTaxRows");
  element("workedTaxLong").hidden = true;
  rows.hidden = false;
  if (!state.bundle) {
    rows.replaceChildren();
    element("workedTaxSteps").replaceChildren();
    return;
  }
  const figures = withoutOwnWorking(figuresFromValues(values, company ?? { companyName: "", companyNumber: "" }, state.workingSheet));
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
    element("workedTaxSteps").replaceChildren();
    return;
  }
  element("workedTaxEmpty").style.display = "none";
  if (figures.accountingPeriods) {
    longPeriodWorkedTax(values, derived, periods);
    rows.replaceChildren();
    element("workedTaxSteps").replaceChildren();
    return;
  }
  const { key, details } = workedSteps(workedItems(derived), "single");
  rows.replaceChildren(...key);
  if (details.parentElement !== element("workedTaxSteps")) element("workedTaxSteps").replaceChildren(details);
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
    create(
      "p",
      { id: `${target}-error`, class: "error-message" },
      create("span", { class: "visually-hidden" }, siteText("ch.ct.error-prefix", "Error: ")),
      message,
    ),
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
  openFoldsAround(node);
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
    create("h2", { class: "error-summary__title" }, siteText("ch.ct.problem", "There is a problem")),
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
  return siteText("ch.ct.range", "{start} to {end}", { start: longDateText(period.periodStart), end: longDateText(period.periodEnd) });
}

function longPeriodPanelContent(long) {
  const [first, second] = long.periods;
  return [
    create("h3", { id: "longPeriodHeading" }, siteText("ch.ct.long-heading", "This period of account files as two returns")),
    paragraph(
      siteText(
        "ch.ct.long-intro",
        "A Company Tax Return covers at most 12 months, so HMRC takes these {days} days as two accounting periods. Both returns carry the same accounts.",
        { days: long.days },
      ),
    ),
    create(
      "ul",
      {},
      create(
        "li",
        {},
        paragraph(
          { strong: siteText("ch.ct.return-1-of-2", "Return 1 of 2: ") },
          siteText("ch.ct.range-days", "{range} ({days} days)", { range: periodRangeText(first), days: first.days }),
        ),
      ),
      create(
        "li",
        {},
        paragraph(
          { strong: siteText("ch.ct.return-2-of-2", "Return 2 of 2: ") },
          siteText("ch.ct.range-days", "{range} ({days} days)", { range: periodRangeText(second), days: second.days }),
        ),
      ),
    ),
    paragraph(
      siteText(
        "ch.ct.long-order",
        "You send return 1 first. HMRC must accept it before you send return 2. The two returns cost one token between them.",
      ),
    ),
    create(
      "p",
      {},
      siteText("ch.ct.long-tell-hmrc", "Before the original filing date, tell HMRC the company's new accounting period dates. "),
      create(
        "a",
        { href: TAX_ACCOUNTING_PERIOD_GUIDE, target: "_blank", rel: "noopener" },
        siteText("ch.ct.long-guide-link", "How to update the dates on GOV.UK"),
      ),
      siteText("ch.ct.long-guide-after", "."),
    ),
    ...(state.workingSheet
      ? [
          paragraph(
            siteText(
              "ch.ct.long-book",
              "The book covers 12 months, so its own tax working is not checked against a longer period. Type the figures for the whole period of account.",
            ),
          ),
        ]
      : []),
  ];
}

// The text that follows a hint when the period is long: each column's allowance limit and main pool rate.
function periodHintText(id, period) {
  if (id === "annualInvestmentAllowance") {
    const maximum = Math.floor(state.bundle.annualInvestmentAllowanceMaximum(period.periodStart, period.periodEnd));
    return siteText("ch.ct.aia-most", " The most for {range} is £{amount}.", {
      range: periodRangeText(period),
      amount: maximum.toLocaleString("en-GB"),
    });
  }
  const data = taxDataByYear();
  const years = new Map();
  for (let day = period.periodStart; day <= period.periodEnd; day = addDay(day))
    years.set(financialYearOf(day), (years.get(financialYearOf(day)) ?? 0) + 1);
  const rates = [...years].map(([year, days]) => ({ year, days, rate: data[year]?.capital_allowances?.writing_down_allowance_main }));
  if (rates.some(({ rate }) => rate === undefined)) return "";
  const distinct = [...new Set(rates.map(({ rate }) => rate))];
  if (distinct.length === 1)
    return siteText("ch.ct.main-pool-rate", " The main pool rate for this period is {rate}.", { rate: percentText(distinct[0]) });
  const days = rates.reduce((total, { days: count }) => total + count, 0);
  const hybrid = rates.reduce((total, { days: count, rate }) => total + rate * count, 0) / days;
  return siteText(
    "ch.ct.main-pool-hybrid",
    " The period spans a change of the main pool rate ({rates}), so the rate is a hybrid of {rate}.",
    {
      rates: distinct.map(percentText).join(siteText("ch.ct.then", " then ")),
      rate: percentText(hybrid),
    },
  );
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
  element("firstPeriodStart").textContent = labelOf(
    long
      ? {
          ...QUESTION.firstPeriodStart,
          label: siteText("ch.ct.first-period-start-on", "Does the first accounting period start on {date}?", {
            date: longDateText(values.periodStart),
          }),
        }
      : QUESTION.firstPeriodStart,
  );
  const donations = form.querySelector('label[for="donations"]');
  if (donations) donations.textContent = labelOf(showing ? { ...DONATIONS_FIELD, label: LONG_PERIOD_DONATIONS_LABEL } : DONATIONS_FIELD);
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
  updateFolds();
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
  if (control.id === "periodStart") toggleSections();
  setDefaults();
  refresh();
  answersSaver.schedule();
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
  answersSaver.schedule();
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
  // A signed-out visitor has no practice; asking the API without a session only earns a 401.
  const idToken = localStorage.getItem("cognitoIdToken");
  if (!idToken) return;
  try {
    const response = await fetch("/api/v1/practice/clients", { headers: { Authorization: `Bearer ${idToken}` } });
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
    clientRadio("", siteText("ch.ct.own-company", "My own company"), !agentClient),
    ...choices.map((choice) => clientRadio(choice.clientId, choice.label, agentClient?.clientId === choice.clientId)),
  );
}

function chooseClient(clientId) {
  agentClient = practiceClients.find((client) => client.clientId === clientId) ?? null;
  const stop = agentClient ? clientFilingStop(agentClient) : null;
  const stopNode = element("clientStop");
  stopNode.style.display = stop ? "block" : "none";
  stopNode.replaceChildren(
    ...(stop ? [stop, " ", create("a", { href: "../practice.html" }, siteText("ch.ct.open-practice", "Open Practice clients")), "."] : []),
  );
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
    ? siteText(
        "ch.ct.gateway-agent",
        "Sign in with the practice's own agent Government Gateway user ID and password, with Corporation Tax enrolled.",
      )
    : siteText(
        "ch.ct.gateway-company",
        "Sign in with the Government Gateway user ID and password for the company's Corporation Tax enrolment.",
      );
  refresh();
}

function renderAgentAuthorisation() {
  element("agentAuthorisedHost").replaceChildren(
    checkboxGroup({
      id: "agentAuthorised",
      label: siteText(
        "ch.ct.agent-authorised",
        "The company has authorised this practice to act for it for Corporation Tax (form 64-8 or online), and has approved this return.",
      ),
    }),
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
  if (!element("practiceName").value.trim()) return siteText("ch.ct.enter-practice", "Enter the practice name for HMRC's records.");
  if (!element("agentAuthorised").checked)
    return siteText(
      "ch.ct.confirm-authorised",
      "Confirm that the company has authorised the practice for Corporation Tax and has approved this return.",
    );
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
    company = { ...companyFromProfile(profile), registeredOffice: profile.registeredOffice };
    element("formCompanyName").textContent = company.companyName;
    element("formCompanyNumber").textContent = company.companyNumber;
    toggleSections();
    showView("formView");
    await ensureBundle();
    applyClientToForm();
    renderDraftPanel();
    window.booksImport.showFilingsFor(company.companyNumber, agentClient?.clientId);
    await offerLastYear();
  } catch (error) {
    const { showCompanyLookupFailure } = await import("../lib/company-lookup-failure.js");
    showCompanyLookupFailure(window.showStatus, error, companyNumber);
  } finally {
    window.hideLoading();
  }
}

function changeLink(fieldId, label) {
  const link = create("a", { "href": `#${fieldId}`, "class": "review-change", "data-field": fieldId }, siteText("ch.ct.change", "Change"));
  link.append(visuallyHidden(` ${label}`));
  return link;
}

function companyChangeLink() {
  const link = create("a", { "href": "#company", "class": "review-change", "data-field": "company" }, siteText("ch.ct.change", "Change"));
  link.append(visuallyHidden(siteText("ch.ct.change-company", " company")));
  return link;
}

// The answers under the accounts' statements are the notes to those accounts, so they carry a caption as the statements do.
function answersTable(rows, caption = null) {
  const body = rows.map((row) => {
    const tr = tableRow(row.reference ?? "", row.label, row.value, changeLink(row.id, row.label));
    tr.children[0].classList.add("review-table__box-cell");
    tr.id = `review-row-${row.id}`;
    tr.tabIndex = -1;
    return tr;
  });
  return create(
    "table",
    { class: `results-table review-table review-table--boxes review-table--answers${caption ? " review-table--notes" : ""}` },
    ...(caption ? [create("caption", {}, caption)] : []),
    create("colgroup", {}, ...["box", "question", "answer", "change"].map((name) => create("col", { class: `review-table__${name}` }))),
    create(
      "thead",
      {},
      create(
        "tr",
        {},
        ...[
          siteText("ch.ct.column-box", "Box"),
          siteText("ch.ct.column-question", "Question"),
          siteText("ch.ct.column-answer", "Answer"),
          siteText("ch.ct.change", "Change"),
        ].map((text) => create("th", { scope: "col" }, text)),
      ),
    ),
    create("tbody", {}, ...body),
  );
}

const ABSENT_FIGURE = "—";
const NOT_GIVEN_TEXT = siteText("ch.ct600.not-given", "Not given");

const ACCOUNTS_NOTES_TITLE = siteText("ch.ct.accounts-notes", "Notes to the accounts");

const LEDGER_TITLES = {
  profitAndLoss: siteText("ch.ct.profit-and-loss", "Profit and loss account"),
  balanceSheet: siteText("ch.ct.balance-sheet", "Balance sheet"),
};

// One statement of the accounts as the form lays it out: a row per line, a column per year, each
// figure with its own Change link. A line with no figure shows "—"; a year with no figures has no column.
function ledgerReviewTable(table, rows) {
  const years = YEAR_COLUMNS.filter(({ key }) => rows.some((row) => row.ledger.year === key));
  const lines = [...new Map(rows.map((row) => [row.ledger.line, row.ledger.lineLabel])).entries()];
  const body = lines.map(([line, lineLabel]) =>
    create(
      "tr",
      {},
      create("th", { scope: "row" }, lineLabel),
      ...years.map(({ key, title }) => {
        const row = rows.find((candidate) => candidate.ledger.line === line && candidate.ledger.year === key);
        if (!row) return create("td", { "class": "amount review-table__figure", "data-column": title }, ABSENT_FIGURE);
        const typed = row.value !== NOT_GIVEN_TEXT;
        const cell = create(
          "td",
          { "id": `review-row-${row.id}`, "tabindex": "-1", "class": "amount review-table__figure", "data-column": title },
          create("span", {}, typed ? row.value : ABSENT_FIGURE),
          " ",
          changeLink(row.id, row.label),
        );
        return cell;
      }),
    ),
  );
  return create(
    "table",
    { "class": "results-table review-table review-table--ledger", "data-ledger": table },
    create("caption", {}, LEDGER_TITLES[table]),
    create(
      "thead",
      {},
      create(
        "tr",
        {},
        create("th", { scope: "col" }, siteText("ch.ct.column-line", "Line")),
        ...years.map(({ title }) => create("th", { scope: "col", class: "amount" }, title)),
      ),
    ),
    create("tbody", {}, ...body),
  );
}

function answersAfter(ledgers, answers) {
  return ledgers.size > 0 ? answersTable(answers, ACCOUNTS_NOTES_TITLE) : answersTable(answers);
}

// A review section: its answers with their box, and the accounts' figures as their statements.
function reviewTable(id, title, rows) {
  const parts = [];
  let answers = [];
  const ledgers = new Map();
  for (const row of rows) {
    if (!row.ledger) {
      answers.push(row);
      continue;
    }
    if (answers.length > 0) parts.push(answersAfter(ledgers, answers));
    answers = [];
    if (!ledgers.has(row.ledger.table)) {
      ledgers.set(row.ledger.table, []);
      parts.push(row.ledger.table);
    }
    ledgers.get(row.ledger.table).push(row);
  }
  if (answers.length > 0) parts.push(answersAfter(ledgers, answers));
  return create(
    "section",
    { id: `review-${id}` },
    create("h4", {}, title),
    ...parts.map((part) => (typeof part === "string" ? ledgerReviewTable(part, ledgers.get(part)) : part)),
  );
}

function renderAnswers(values) {
  element("reviewAnswers").replaceChildren(...reviewAnswers(values).map(({ id, title, rows }) => reviewTable(id, title, rows)));
}

function companiesHouseCopyText(values) {
  if (regimeOf(values) === "micro")
    return siteText("ch.ct.ch-gets-micro", "The micro-entity balance sheet and notes. The profit and loss account goes to HMRC only.");
  if (copyOf(values) === "filleted") {
    return siteText(
      "ch.ct.ch-gets-filleted",
      "Filleted accounts. The profit and loss account and the directors' report are left out of the copy on the public register.",
    );
  }
  return siteText(
    "ch.ct.ch-gets-full",
    "The full accounts, including the profit and loss account and the directors' report. Companies House publishes them.",
  );
}

function renderSendTo(values) {
  const both = sendToOf(values) === "both";
  const rows = [
    {
      id: "sendTo",
      label: siteText("ch.ct.sending-to", "Sending the accounts to"),
      value: both
        ? siteText("ch.ct.sending-both", "Companies House first, then HMRC with the Company Tax Return")
        : siteText("ch.ct.sending-hmrc", "HMRC with the Company Tax Return"),
    },
  ];
  if (both) {
    rows.push(
      {
        id: regimeOf(values) === "small" ? "companiesHouseCopy" : "sendTo",
        label: siteText("ch.ct.ch-receives", "What Companies House receives"),
        value: companiesHouseCopyText(values),
      },
      {
        id: "sendTo",
        label: siteText("ch.ct.hmrc-receives", "What HMRC receives"),
        value: siteText("ch.ct.hmrc-receives-value", "The full accounts, with the Company Tax Return"),
      },
    );
  }
  const table = reviewTable("sendTo", siteText("ch.ct.where-accounts-go", "Where the accounts go"), rows);
  // The review rows share one id scheme, so a second row for the same answer carries a distinct id.
  const [, , hmrcRow] = table.querySelectorAll("tbody tr");
  if (hmrcRow) hmrcRow.id = "review-row-hmrcAccounts";
  element("reviewSendTo").replaceChildren(table);
}

function sortBoxes(keys) {
  return [...keys].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || String(a).localeCompare(String(b)));
}

// The nodes of record markup that filing-record.js built, escaping every value it holds.
function recordNodes(html) {
  return [...new DOMParser().parseFromString(html, "text/html").body.childNodes];
}

// The CT600 boxes as the filed copy shows them, each row with a Change link to the question that gives it.
function ct600ReviewRecord(boxes, values, part, idSuffix, tableId) {
  return ct600RecordHtml({
    boxes,
    utr: values.utr,
    companyName: boxes[1] ?? company?.companyName,
    companyNumber: boxes[2] ?? company?.companyNumber,
    title: siteText("ch.ct.review-record-title", "Company Tax Return (CT600)"),
    subtitle: siteText("ch.ct.record-period", "Period covered by the return {start} to {end}", {
      start: boxes[30] ? longDateText(boxes[30]) : "",
      end: boxes[35] ? longDateText(boxes[35]) : "",
    }),
    tableId,
    rowId: (box) => `review-box-${box}${idSuffix}`,
    changeCellHtml: (box, label) => {
      const target = boxChangeTarget(String(box), values, part);
      const link = target ? changeLink(target, siteText("ch.ct.change-box", "box {box}, {label}", { box, label })) : companyChangeLink();
      return `<td class="change">${link.outerHTML}</td>`;
    },
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
  element("ct600Record").replaceChildren(...recordNodes(ct600ReviewRecord(preview.boxes, values, 1, "", "ct600Table")));
  element("computationsTable")
    .querySelector("tbody")
    .replaceChildren(...computationTableRows(preview.computationLines, values, 1, ""));
  element("previewIxbrl").textContent = preview.computationsIxbrl;
}

function reviewTables(index) {
  const boxes = create("div", { class: "customer-copy-sheet" }, create("div", { class: "submission-record" }));
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
        create("th", { scope: "col" }, siteText("ch.ct.column-line", "Line")),
        create("th", { scope: "col", class: "amount" }, "£"),
        create("th", { scope: "col" }, siteText("ch.ct.change", "Change")),
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
    boxes.firstChild.replaceChildren(...recordNodes(ct600ReviewRecord(part.boxes, values, part.part, suffix, `ct600Table${part.part}`)));
    computations.querySelector("tbody").replaceChildren(
      ...computationTableRows(part.computationLines, values, part.part, suffix, {
        adjustedProfitBeforeAccountingPeriodAdjustments: siteText(
          "ch.ct.line-long-adjusted",
          "Adjusted profit for the {days} days of the period of account",
          { days: periodDays },
        ),
        timeApportionment: siteText("ch.ct.line-long-apportionment", "Time apportionment: {days} of {whole} days", {
          days,
          whole: periodDays,
        }),
      }),
    );
    return create(
      "section",
      { "id": `review-return-${part.part}`, "class": "return-review", "aria-labelledby": `reviewReturn${part.part}Heading` },
      create(
        "h3",
        { id: `reviewReturn${part.part}Heading` },
        siteText("ch.ct.return-of-2-range", "Return {part} of 2: {range}", { part: part.part, range: periodRangeText(part) }),
      ),
      create(
        "p",
        { class: "hint" },
        siteText("ch.ct.long-due", "Tax is due on {tax}. The return is due on {return}.", {
          tax: longDateText(part.taxDueDate),
          return: longDateText(part.returnDueDate),
        }),
      ),
      create("h4", {}, siteText("ch.ct.boxes-return", "CT600 boxes, return {part}", { part: part.part })),
      boxes,
      create("h4", {}, siteText("ch.ct.computations-return", "Computations, return {part}", { part: part.part })),
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
    window.narrateStage(siteText("ct.narrate-checking", "Checking your answers..."));
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
    window.showStatus(error.message || siteText("ch.ct.preview-failed", "Failed to preview the Company Tax Return."), "error");
    showFilingFailure(error, "preview");
  } finally {
    window.hideLoading();
  }
}

// --- Saying what a long running submission is doing --------------------------------------------

function narrateSendingReturn() {
  window.narrateStage(
    sending.mode === "both" && sending.companiesHouse?.statusCode === "ACCEPT"
      ? siteText("ct.narrate-accounts-then-return", "Companies House has the accounts; sending the return to HMRC...")
      : siteText("ct.narrate-sending-return", "Sending the return to HMRC..."),
  );
}

// --- What a failure left behind ----------------------------------------------------------------

// Where the answers are now: saved in this browser until a day, not saved by the person's choice,
// or only in the form.
function answersWhereText() {
  const storage = browserStorage();
  const record = storage && company ? loadDraft(storage, draftScope()) : null;
  if (record?.expiresAt) {
    return siteText("ct.failure-answers-saved", "Your answers are still in this form and saved in this browser until {date}.", {
      date: longDateText(record.expiresAt.slice(0, 10)),
    });
  }
  if (storage && keepDays(storage) === 0) {
    return siteText(
      "ct.failure-answers-not-saved",
      "Your answers are still in this form. They are not saved in this browser: you chose not to keep them.",
    );
  }
  return siteText("ct.failure-answers-in-form", "Your answers are still in this form.");
}

// What was sent and what was not, at the stage the failure came: the preview sends nothing; a joint
// filing says which part reached which service; HMRC's part gives the server's own words.
function sentText(stage, error) {
  if (stage === "preview") {
    return siteText("ct.failure-sent-preview", "Nothing was sent to HMRC or Companies House. The review is built before anything is sent.");
  }
  const parts = [];
  const accounts = sending.companiesHouse;
  if (sending.mode === "both") {
    if (!accounts) {
      parts.push(siteText("ct.failure-sent-ch-none", "The accounts did not reach Companies House, and the return was not sent to HMRC."));
    } else if (accounts.statusCode === "ACCEPT") {
      parts.push(
        siteText("ct.failure-sent-ch-accepted", "Companies House accepted the accounts (submission {number}).", {
          number: accounts.submissionNumber,
        }),
      );
    } else {
      parts.push(
        siteText("ct.failure-sent-ch-held", "Companies House has the accounts (submission {number}) and has not decided on them.", {
          number: accounts.submissionNumber,
        }),
      );
    }
  }
  if (stage === "hmrc") parts.push(error.message || siteText("ch.ct.hmrc-file-failed", "Failed to file with HMRC."));
  return parts.join(" ");
}

function showFilingFailure(error, stage) {
  const service = stage === "companiesHouse" ? "companiesHouse" : "hmrc";
  showFailureDetail(document, {
    sent: sentText(stage, error),
    answers: answersWhereText(),
    failure: classifyFilingFailure(error, { service }),
  });
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
    create(
      "ul",
      {},
      ...entries.map((entry) =>
        create("li", {}, siteText("ch.ct.error-line", "Error {number}: {text}", { number: entry.number, text: entry.text })),
      ),
    ),
    create(
      "p",
      {},
      siteText("ch.ct.check-errors", "Check the answers these errors name, change them in the review, and send the return again."),
    ),
  );
}

function waitSeconds(seconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(seconds, 1) * 1000));
}

// HMRC's status of a return, in the word a sentence about the return reads it as. A return HMRC has
// not settled reads as waiting, as the polls treat it, until HMRC answers ACCEPT or REJECT.
function returnStatusWord(statusCode) {
  if (statusCode === "ACCEPT") return siteText("ch.ct.status-accept", "accepted");
  if (statusCode === "REJECT") return siteText("ch.ct.status-reject", "rejected");
  return siteText("ch.ct.status-pending", "waiting to be checked");
}

async function pollUntilSettled(correlationId, firstWaitSeconds, extraHeaders) {
  window.narrateStage(siteText("ct.narrate-waiting-hmrc", "Waiting for HMRC's answer..."));
  let waitFor = firstWaitSeconds;
  let result;
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await waitSeconds(waitFor);
    result = await window.pollCtReturn(correlationId, extraHeaders, previewRequest?.clientId);
    if (result.statusCode === "ACCEPT" || result.statusCode === "REJECT") return result;
    element("returnResult").replaceChildren(
      paragraph(
        siteText("ch.ct.return-word", "Return "),
        { strong: correlationId },
        siteText("ch.ct.is", " is "),
        { strong: returnStatusWord(result.statusCode) },
        siteText("ch.ct.checking-again", ". Checking again..."),
      ),
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
  showStartAgain(false);
  if (outcome.statusCode === "ACCEPT") {
    setOutcome("ok");
    element("returnResult").replaceChildren(
      outcomeTitle(
        sending.amendment
          ? siteText("ch.ct.hmrc-accepted-amended", "HMRC accepted the amended Company Tax Return")
          : siteText("ch.ct.hmrc-accepted", "HMRC accepted the Company Tax Return"),
      ),
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
      create("p", {}, siteText("ch.ct.keep-irmark", "Keep the IRmark. It is HMRC's record of exactly what you sent.")),
      create(
        "p",
        { id: "receiptProof" },
        siteText(
          "ch.ct.receipt-proof",
          "The receipt below is the company's proof that it filed this return. Keep it with the company's records.",
        ),
      ),
    );
    element("returnIrmark").style.display = "block";
    sending.taxReturnAccepted = true;
    showStartAgain(true);
    if (sending.mode === "both") renderCompaniesHouse();
    if (!sending.companiesHouse || companiesHouseAccepted()) {
      forgetJoint();
      forgetSavedAnswers();
    } else persistJoint();
    await renderReturnRecord(outcome);
    showAmendPanel();
    return;
  }
  if (outcome.statusCode === "REJECT") {
    setOutcome("error");
    element("returnResult").replaceChildren(
      outcomeTitle(
        sending.amendment
          ? siteText("ch.ct.hmrc-rejected-amended", "HMRC rejected the amended Company Tax Return")
          : siteText("ch.ct.hmrc-rejected", "HMRC rejected the Company Tax Return"),
      ),
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
      siteText("ch.ct.not-settled", "HMRC has not settled the return yet. Return "),
      { strong: outcome.correlationId },
      siteText("ch.ct.is-still", " is still "),
      { strong: returnStatusWord(outcome.statusCode) },
      siteText("ch.ct.full-stop", "."),
    ),
  );
}

// --- Sending: Companies House first, then HMRC ------------------------------------------------

function companiesHouseAccepted() {
  return sending.companiesHouse?.statusCode === "ACCEPT";
}

// Start a new filing is offered once the filing has nothing waiting: while Companies House has not
// decided the accounts, a new filing for the same company and period could file them twice, so the
// page names the submission that waits instead.
function showStartAgain(ready) {
  const button = element("startAgainBtn");
  const waiting = Boolean(sending.companiesHouse) && !["ACCEPT", "REJECT"].includes(sending.companiesHouse.statusCode);
  button.style.display = ready && !waiting ? "inline-block" : "none";
  let note = document.getElementById("startAgainPendingNote");
  if (!(ready && waiting)) {
    if (note) note.hidden = true;
    return;
  }
  if (!note) {
    note = create("p", { id: "startAgainPendingNote", class: "hint" });
    button.before(note);
  }
  note.hidden = false;
  note.textContent = siteText(
    "ch.ct.start-again-pending",
    "Companies House has not decided the accounts yet (submission {number}). A new filing for this company and period waits until it does, so the accounts are not filed twice.",
    { number: sending.companiesHouse.submissionNumber },
  );
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

const GATEWAY_STORED_ONCE = siteText("ch.ct.gateway-stored-once", "They are sent once with this return and never stored.");

function configureSendStep() {
  const accountsFirst = accountsStillToSend();
  const amending = Boolean(sending.amendment);
  const sendsToHmrc = amending
    ? siteText("ch.ct.send-amended-heading", "Send the amended return to HMRC")
    : siteText("ch.ct.send-hmrc-heading", "Send to HMRC");
  element("sendStepHeading").textContent = accountsFirst
    ? amending
      ? siteText("ch.ct.send-revised-heading", "Send the revised accounts to Companies House and the amended return to HMRC")
      : siteText("ch.ct.send-both-heading", "Send to Companies House and HMRC")
    : sendsToHmrc;
  const order = element("sendStepOrder");
  order.style.display = sending.mode === "both" ? "block" : "none";
  order.textContent = accountsFirst
    ? siteText("ch.ct.order-first", "Companies House gets the accounts first. When it accepts them, the Company Tax Return goes to HMRC.")
    : siteText("ch.ct.order-left", "Companies House accepted the accounts. The Company Tax Return is the one filing left to send.");
  element("companyAuthCodeGroup").style.display = accountsFirst ? "block" : "none";
  element("revisionGroup").style.display = accountsFirst && sending.amendment?.accounts ? "block" : "none";
  element("submitReturnBtn").textContent = accountsFirst
    ? amending
      ? siteText("ch.ct.button-revised", "Send the revised accounts, then the amended return")
      : siteText("ch.ct.button-both", "Send to Companies House, then HMRC")
    : amending
      ? siteText("ch.ct.button-amended", "Submit the amended return to HMRC")
      : siteText("ch.ct.button-hmrc", "Submit to HMRC");
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
    const returns = sending.longPeriod
      ? queue.length === 2
        ? siteText("ch.ct.cost-two-returns", "the two returns")
        : siteText("ch.ct.cost-return-of-2", "return {part} of 2", { part: queue[0] })
      : siteText("ch.ct.cost-the-return", "the return");
    return {
      cost,
      lead:
        cost === 1
          ? siteText("ch.ct.cost-accounts-one", "The accounts and {returns} cost {cost} token.", { returns, cost })
          : siteText("ch.ct.cost-accounts", "The accounts and {returns} cost {cost} tokens.", { returns, cost }),
    };
  }
  if (cost === 0) return { cost, lead: siteText("ch.ct.cost-none", "Return 2 of 2 costs no token. Return 1 used the token for both.") };
  if (queue.length === 2) return { cost, lead: siteText("ch.ct.cost-two", "The two returns cost 1 token between them.") };
  return { cost, lead: siteText("ch.ct.cost-one", "This return costs 1 token.") };
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
// The refusal for no token left, in the page's language, naming what was not sent: the accounts alone,
// the accounts and the return when the accounts go first, or the return.
function noTokensSentence(error) {
  if (error.service === "companiesHouse") {
    return sending.mode === "both"
      ? siteText(
          "ch.ct.no-tokens-none",
          "No tokens remaining. Your token allowance has been used, so nothing was sent to Companies House. Nothing was sent to HMRC either. Tokens refresh at the start of the next period. Visit the Bundles page for more options.",
        )
      : noTokensText();
  }
  return siteText(
    "ch.ct.no-tokens-hmrc",
    "No tokens remaining. Your token allowance has been used, so nothing was sent to HMRC. Tokens refresh at the start of the next period. Visit the Bundles page for more options.",
  );
}

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
  const order = accountsFirst ? siteText("ch.ct.order-accounts-then", "the accounts, then ") : "";
  const returnWord = amending ? siteText("ch.ct.the-amended-return", "the amended return") : siteText("ch.ct.return-lower", "return");
  const leftWord = amending ? siteText("ch.ct.the-amended-return-start", "The amended return") : siteText("ch.ct.return-start", "Return");
  note.textContent =
    queue.length === 2
      ? siteText(
          "ch.ct.long-send-both",
          "You send {order}{word} 1 of 2, then {word} 2 of 2. Each waits for the one before to be accepted. You type the Government Gateway user ID and password once for both.",
          { order, word: returnWord },
        )
      : siteText("ch.ct.long-send-left", "{word} {part} of 2 is the one left to send. You type the Government Gateway password again.", {
          word: leftWord,
          part: queue[0] ?? 2,
        });
  element("gatewayStored").textContent =
    queue.length === 2
      ? siteText("ch.ct.gateway-stored-each", "They are sent with each of the two returns and never stored.")
      : GATEWAY_STORED_ONCE;
  if (queue.length === 0) return;
  const heading = amending ? siteText("ch.ct.amended-return", "amended return") : siteText("ch.ct.return-lower", "return");
  if (!accountsFirst) {
    element("sendStepHeading").textContent =
      queue.length === 2
        ? amending
          ? siteText("ch.ct.send-amended-returns", "Send the amended returns to HMRC")
          : siteText("ch.ct.send-two-returns", "Send two returns to HMRC")
        : siteText("ch.ct.send-return-of-2", "Send {word} {part} of 2 to HMRC", {
            word: amending ? siteText("ch.ct.the-amended-return", "the amended return") : siteText("ch.ct.return-lower", "return"),
            part: queue[0],
          });
    element("submitReturnBtn").textContent =
      queue.length === 2
        ? siteText("ch.ct.submit-both-of-2", "Submit {word} 1 of 2, then {word} 2 of 2", { word: heading })
        : siteText("ch.ct.submit-one-of-2", "Submit {word} {part} of 2 to HMRC", { word: heading, part: queue[0] });
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
        siteText(
          "ch.ct.accounts-locked",
          "Filed at Companies House on {date}, submission {number}. The accounts cannot change here. Change the tax answers only.",
          { date: todayText(), number: submissionNumber },
        ),
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
  applyFirstAccountsRule();
  element("accountsLockNote")?.remove();
  element("section-accounts")
    .querySelector("h3")
    .after(
      create(
        "p",
        { id: "accountsLockNote", class: "hint", role: "status" },
        siteText(
          "ch.ct.accounts-revising",
          "You are revising the accounts filed at Companies House. Change the figures and the date the directors approve the revised accounts.",
        ),
      ),
    );
}

function todayText() {
  return longDateText(today());
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
    (part) =>
      sending.amendment.accounts ||
      sending.amendment.attachedAccounts ||
      boxesDiffer(filedLongBoxes[part - 1], preview.returns[part - 1].boxes),
  );
  if (changed.length === 0) {
    window.showStatus(
      siteText(
        "ch.ct.nothing-to-amend",
        "Neither return changes with these answers, so there is nothing to amend. Change an answer and preview again.",
      ),
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
  element("amendAccountsBtn").style.display = accepted && sending.mode === "both" && revisedAccountsOffered ? "inline-block" : "none";
  element("amendAttachedAccountsBtn").style.display = accepted && sending.mode === "hmrc" ? "inline-block" : "none";
  element("amendBothHint").hidden = sending.mode === "hmrc";
  element("amendHmrcHint").hidden = sending.mode !== "hmrc";
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

// Every amendment reopens the form for the tax answers and sends an amended return. Amending the
// accounts also reopens the accounts and sends them to Companies House first as revised accounts.
// Amending the accounts attached to a return filed with HMRC alone reopens the accounts and sends
// them with the amended return only.
function startAmendment({ accounts, attachedAccounts = false }) {
  companiesHousePollWindow++;
  hideAmendPanel();
  sending.amendment = { accounts, attachedAccounts, done: [] };
  sending.taxReturnSent = false;
  sending.taxReturnAccepted = false;
  if (sending.longPeriod) {
    sending.longPeriod = { filingId: sending.longPeriod.filingId, parts: [null, null] };
    longErrors = [null, null];
    unlockFirstReturn();
  }
  if (accounts) {
    sending.revision = { originalDateOfApproval: element("directorDateApproved").value, nonCompliance: "", amendments: "" };
    sending.companiesHouse = null;
    unlockAccounts();
  }
  if (attachedAccounts) noteAttachedAccountsOpen();
  if (sending.longPeriod) lockPeriodDates();
  element("revisionNonCompliance").value = "";
  element("revisionAmendments").value = "";
  element("returnResult").replaceChildren();
  element("returnRecord").replaceChildren();
  element("returnIrmark").style.display = "none";
  showStartAgain(false);
  element("jointProgress").style.display = "none";
  setOutcome();
  persistJoint();
  window.hideStatus();
  showView("formView");
  if (attachedAccounts) element("section-accounts").scrollIntoView({ block: "start" });
}

function noteAttachedAccountsOpen() {
  element("accountsLockNote")?.remove();
  element("section-accounts")
    .querySelector("h3")
    .after(
      create(
        "p",
        { id: "accountsLockNote", class: "hint", role: "status" },
        siteText(
          "ch.ct.accounts-attached-correcting",
          "You are correcting the accounts attached to the return. HMRC gets them with the amended return; Companies House gets nothing.",
        ),
      ),
    );
}

// The two statements revised accounts make about the original accounts: one problem for each left empty.
function revisionProblems() {
  const problems = [];
  const nonCompliance = element("revisionNonCompliance");
  if (!nonCompliance.value.trim()) {
    problems.push({ input: nonCompliance, message: siteText("ch.ct.say-non-compliance", "Say what was wrong with the original accounts") });
  }
  const amendments = element("revisionAmendments");
  if (!amendments.value.trim()) {
    problems.push({ input: amendments, message: siteText("ch.ct.say-amendments", "Say what the revised accounts change") });
  }
  return problems;
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
    window.showStatus(error.message || siteText("ch.ct.resume-failed", "Failed to resume the filing."), "error");
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
    if (!sending.companiesHouse || companiesHouseAccepted()) forgetSavedAnswers();
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
          siteText("ch.ct.see-copy", "See your copy"),
        )
      : "";
    outcome.replaceChildren(
      outcomeTitle(
        sending.amendment?.accounts
          ? siteText("ch.ct.ch-accepted-revised", "Companies House accepted the revised accounts")
          : siteText("ch.ct.ch-accepted", "Companies House accepted the accounts"),
      ),
      paragraph(siteText("ch.ct.submission", "Submission "), { strong: submissionNumber }, siteText("ch.ct.full-stop-space", ". ")),
      ...(copyLink ? [copyLink] : []),
      ...(sending.taxReturnAccepted
        ? [
            create(
              "p",
              { id: "jointAccepted" },
              sending.longPeriod
                ? sending.amendment
                  ? siteText(
                      "ch.ct.joint-long-amended",
                      "The accounts and both amended Company Tax Returns are accepted. Your receipts show them as one filing: ",
                    )
                  : siteText(
                      "ch.ct.joint-long",
                      "The accounts and both Company Tax Returns are accepted. Your receipts show them as one filing: ",
                    )
                : sending.amendment
                  ? siteText(
                      "ch.ct.joint-amended",
                      "Both amended filings are accepted. Your receipts show them under the filing they amend: ",
                    )
                  : siteText("ch.ct.joint", "Both filings are accepted. Your receipts show them as one filing: "),
              create("a", { href: "../hmrc/receipt/receipts.html" }, siteText("ch.ct.your-receipts", "Your receipts")),
              siteText("ch.ct.full-stop", "."),
            ),
          ]
        : []),
    );
    return;
  }
  if (statusCode === "REJECT") {
    const notReceived = window.companiesHouseRejections.notReceivedHeadline(sending.companiesHouse);
    outcome.className = "outcome outcome--error";
    outcome.replaceChildren(
      outcomeTitle(
        notReceived?.title ||
          (sending.amendment?.accounts
            ? siteText("ch.ct.ch-rejected-revised", "Companies House rejected the revised accounts")
            : siteText("ch.ct.ch-rejected", "Companies House rejected the accounts")),
      ),
      paragraph(siteText("ch.ct.submission", "Submission "), { strong: submissionNumber }, siteText("ch.ct.full-stop", ".")),
    );
    errors.style.display = "block";
    errors.replaceChildren(
      create("ul", {}, ...(rejections ?? []).map((entry) => create("li", {}, window.companiesHouseRejections.rejectionText(entry)))),
      create(
        "p",
        {},
        siteText(
          "ch.ct.check-accounts",
          "Check the accounts, change them in the review, and send again. The Company Tax Return has not been sent.",
        ),
      ),
    );
    return;
  }
  outcome.className = "outcome";
  const word = window.companiesHouseGatewayPoll.statusWord(statusCode);
  outcome.replaceChildren(
    word === null
      ? paragraph(
          siteText("ch.ct.ch-not-settled-alone", "Companies House has not settled the accounts yet."),
          " ",
          window.companiesHouseGatewayPoll.unknownStatusText(submissionNumber, statusCode),
        )
      : paragraph(
          siteText("ch.ct.ch-not-settled", "Companies House has not settled the accounts yet. Submission "),
          { strong: submissionNumber },
          siteText("ch.ct.is", " is "),
          { strong: word },
          siteText("ch.ct.full-stop", "."),
        ),
    ...(sending.taxReturnSent
      ? []
      : [
          paragraph(
            siteText(
              "ch.ct.send-now-or-wait",
              "You can send the Company Tax Return now, or wait for Companies House. If Companies House then rejects the accounts, a changed figure needs an amended return.",
            ),
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
  showStartAgain(false);
  setOutcome();
  showView("resultView");
}

// Poll Companies House for one window. True once it accepts; otherwise the page says where the accounts stand.
// Only the newest poll window may write the result, so an older window cannot overwrite it or send the return twice.
async function waitForCompaniesHouse(headers) {
  window.narrateStage(siteText("ct.narrate-waiting-ch", "Waiting for Companies House's answer..."));
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
  if (statusCode === "ACCEPT" && sending.taxReturnAccepted) {
    forgetJoint();
    forgetSavedAnswers();
  } else persistJoint();
  if (statusCode === "REJECT") element("tryAgainBtn").style.display = "inline-block";
  if (sending.taxReturnAccepted) showStartAgain(true);
  return statusCode === "ACCEPT";
}

async function sendAccountsToCompaniesHouse(headers, companyAuthCode) {
  window.narrateStage(siteText("ct.narrate-sending-accounts", "Sending the accounts to Companies House..."));
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
  return siteText("ch.ct.ch-file-failed", "{text} Nothing was filed. Check the answers and send again.", {
    text: text || siteText("ch.accounts.file-failed", "Failed to file the accounts with Companies House."),
  });
}

function readGatewayCredentials() {
  const gatewayUserId = element("gatewayUserId").value.trim();
  const gatewayPassword = element("gatewayPassword").value;
  if (gatewayUserId && gatewayPassword) return { gatewayUserId, gatewayPassword };
  showView("previewView");
  window.showStatus(siteText("ch.ct.enter-gateway", "Enter the Government Gateway user ID and password."), "error");
  return null;
}

async function sendCompanyTaxReturn(headers) {
  const credentials = readGatewayCredentials();
  if (!credentials) return;
  narrateSendingReturn();
  const submission = await window.submitCtReturn(taxReturnRequest(credentials.gatewayUserId, credentials.gatewayPassword), headers);
  element("gatewayPassword").value = "";
  sending.taxReturnSent = true;
  if (sending.mode === "both") renderCompaniesHouse();
  persistJoint();
  setOutcome();
  element("returnResult").replaceChildren(
    paragraph(
      siteText("ch.ct.return-word", "Return "),
      { strong: submission.correlationId },
      siteText("ch.ct.gateway-waiting", " accepted by the gateway. Waiting for HMRC..."),
    ),
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
  narrateSendingReturn();
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
  if (finished && (!sending.companiesHouse || companiesHouseAccepted())) {
    forgetJoint();
    forgetSavedAnswers();
  } else persistJoint();
  if (parts[0]?.statusCode === "ACCEPT" && !sending.amendment && !finished) lockFirstReturn();
  if (finished) showAmendPanel();
  return outcome.statusCode === "ACCEPT";
}

function returnTitle(part) {
  return siteText("ch.ct.return-title", "Company Tax Return {part} of 2", { part });
}

function renderLongOutcome() {
  const parts = sending.longPeriod.parts;
  element("returnErrors").replaceChildren();
  element("returnIrmark").replaceChildren();
  const blocks = [];
  const irmarks = [];
  const errors = [];
  for (const part of [1, 2]) {
    const entry = parts[part - 1];
    if (!entry) continue;
    if (entry.statusCode === "ACCEPT") {
      blocks.push(
        outcomeTitle(
          sending.amendment
            ? siteText("ch.ct.hmrc-accepted-amended-part", "HMRC accepted the amended {title}", { title: returnTitle(part) })
            : siteText("ch.ct.hmrc-accepted-part", "HMRC accepted the {title}", { title: returnTitle(part) }),
        ),
      );
      irmarks.push(
        create("p", {}, siteText("ch.ct.irmark-part", "Return {part} of 2 IRmark: ", { part }), create("code", {}, entry.irmark)),
      );
    } else if (entry.statusCode === "REJECT") {
      blocks.push(
        outcomeTitle(
          sending.amendment
            ? siteText("ch.ct.hmrc-rejected-amended-part", "HMRC rejected the amended {title}", { title: returnTitle(part) })
            : siteText("ch.ct.hmrc-rejected-part", "HMRC rejected the {title}", { title: returnTitle(part) }),
        ),
      );
      const outcome = longErrors[part - 1];
      const entries = [...(outcome?.errors ?? []), ...(outcome?.businessErrors ?? [])];
      errors.push(
        create("p", { role: "alert" }, siteText("ch.ct.part-not-accepted", "Return {part} of 2 was not accepted.", { part })),
        create(
          "ul",
          {},
          ...entries.map((item) =>
            create("li", {}, siteText("ch.ct.error-line", "Error {number}: {text}", { number: item.number, text: item.text })),
          ),
        ),
        create(
          "p",
          {},
          siteText(
            "ch.ct.check-errors-part",
            "Check the answers these errors name, change them in the review, and send return {part} of 2 again.",
            {
              part,
            },
          ),
        ),
      );
    } else {
      blocks.push(
        paragraph(
          siteText("ch.ct.return-part-word", "Return {part} of 2 ", { part }),
          { strong: entry.correlationId },
          siteText("ch.ct.is", " is "),
          { strong: returnStatusWord(entry.statusCode) },
          siteText("ch.ct.checking-again", ". Checking again..."),
        ),
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
      create("p", {}, siteText("ch.ct.keep-irmarks", "Keep the IRmarks. They are HMRC's record of exactly what you sent.")),
      create(
        "p",
        { id: "receiptProof" },
        siteText(
          "ch.ct.receipts-proof",
          "The receipts below are the company's proof that it filed these returns. Keep them with the company's records.",
        ),
      ),
    );
    element("returnIrmark").style.display = "block";
  } else {
    element("returnIrmark").style.display = "none";
  }
  showStartAgain(longQueue().length === 0 && anyAccepted);
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

const FIRST_RETURN_LOCK_NOTE = siteText(
  "ch.ct.first-return-locked",
  "Return 1 is filed with HMRC. Send return 2 first, then amend return 1 from its receipt.",
);

function lockFirstReturn() {
  for (const control of firstColumnControls()) control.disabled = true;
  element("booksImport").hidden = true;
  element("firstReturnLockNote")?.remove();
  element("formSections").prepend(create("p", { id: "firstReturnLockNote", class: "hint", role: "status" }, FIRST_RETURN_LOCK_NOTE));
}

function unlockFirstReturn() {
  for (const control of firstColumnControls()) control.disabled = false;
  applyFirstAccountsRule();
  element("firstReturnLockNote")?.remove();
}

function companyAuthCodeProblem() {
  const input = element("companyAuthCode");
  const length = input.value.trim().length;
  if (length >= COMPANY_AUTH_CODE_LENGTH.min && length <= COMPANY_AUTH_CODE_LENGTH.max) return null;
  return { input, message: siteText("ch.accounts.enter-auth-code", "Enter the 6 to 8 character company authentication code") };
}

async function runSend(send) {
  // Without a pass the routes refuse the filing, so send nothing. Until the accounts are sent the
  // first send is to Companies House.
  if ((await window.EntitlementStatus?.activityBundleHeld()) === false) {
    window.EntitlementStatus.showPassNeeded(accountsStillToSend() ? "companiesHouse" : "hmrc");
    return;
  }
  hideAmendPanel();
  window.showLoading();
  window.hideStatus();
  let failed = false;
  try {
    await send();
  } catch (error) {
    failed = true;
    console.error("Filing failed:", error);
    if (error.reason === "tokens_exhausted") {
      const accountsFiled = sending.companiesHouse?.statusCode === "ACCEPT";
      showTokensExhausted(
        accountsFiled
          ? siteText("ch.ct.accounts-filed-then", "The accounts are filed with Companies House. {message}", {
              message: noTokensSentence(error),
            })
          : noTokensSentence(error),
      );
      return;
    }
    if (window.EntitlementStatus?.isBundleRefusal(error)) {
      window.EntitlementStatus.showPassNeeded(error.service === "companiesHouse" || accountsStillToSend() ? "companiesHouse" : "hmrc");
      return;
    }
    if (error.status === 409) showView("previewView");
    window.showStatus(error.message || siteText("ch.ct.hmrc-file-failed", "Failed to file with HMRC."), "error");
    const stage = error.service ?? (sending.mode === "both" && !sending.companiesHouse ? "companiesHouse" : "hmrc");
    showFilingFailure(error, stage);
    if (stage === "hmrc" && error.status !== 409) showReturnNotSent();
  } finally {
    window.hideLoading();
  }
  // The result says what happened to each part; it comes to the top of the window, clear of the message bubble.
  if (failed && currentView === "resultView") element("resultView").scrollIntoView({ block: "start" });
}

// A joint filing whose Company Tax Return never reached HMRC: the result says so under HMRC, beside what
// Companies House did with the accounts, and offers the way to send the return.
function showReturnNotSent() {
  if (sending.mode !== "both" || !sending.companiesHouse || sending.taxReturnSent || sending.longPeriod) return;
  const accepted = companiesHouseAccepted();
  setOutcome("error");
  element("returnResult").replaceChildren(
    outcomeTitle(siteText("ch.ct.return-not-sent", "The Company Tax Return was not sent to HMRC")),
    paragraph(
      accepted
        ? siteText(
            "ch.ct.return-not-sent-ch-accepted",
            "Companies House has the accounts, so they are not sent again. Check the return and send it to HMRC.",
          )
        : siteText(
            "ch.ct.return-not-sent-ch-held",
            "Companies House has the accounts and has not decided on them. Send the return now, or wait for Companies House.",
          ),
    ),
  );
  element("tryAgainBtn").style.display = accepted ? "inline-block" : "none";
}

async function handleSubmitReturn() {
  if (!element("gatewayUserId").value.trim() || !element("gatewayPassword").value) {
    window.showStatus(siteText("ch.ct.enter-gateway", "Enter the Government Gateway user ID and password."), "error");
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
      const problems = revisionProblems();
      if (problems.length) {
        window.formErrors.showFormErrors(problems);
        return;
      }
      sending.revision = {
        ...sending.revision,
        nonCompliance: element("revisionNonCompliance").value.trim(),
        amendments: element("revisionAmendments").value.trim(),
      };
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
          if (window.EntitlementStatus?.isBundleRefusal(error)) throw error;
          if (error.reason === "tokens_exhausted") {
            showTokensExhausted(noTokensSentence(error));
            return;
          }
          showView("previewView");
          window.showStatus(companiesHouseErrorText(error), "error");
          showFilingFailure(error, "companiesHouse");
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
  element("revisionNonCompliance").value = "";
  element("revisionAmendments").value = "";
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
      siteText(
        "ch.ct.refuse-one-receipt",
        "Only one of the two returns of this filing has an accepted receipt. Send the other return first, then amend from its receipt.",
      ),
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
      refuseAmendment(
        siteText("ch.ct.refuse-load", "We could not load that receipt, so there is nothing to amend. Open it again from your receipts."),
      );
      return;
    }
    const receipt = await res.json();
    if (!AMENDABLE_KINDS.has(receipt?.kind)) {
      refuseAmendment(
        siteText(
          "ch.ct.refuse-kind",
          "That receipt is not an accounts or Company Tax Return filing, so it cannot be amended. Open the filing from your receipts.",
        ),
      );
      return;
    }
    if (receipt.statusCode !== "ACCEPT") {
      refuseAmendment(
        siteText("ch.ct.refuse-not-accepted", "That filing was not accepted, so there is nothing to amend. File it again from the start."),
      );
      return;
    }
    if (!receipt.formRequest?.company || !receipt.formRequest.values) {
      refuseAmendment(
        siteText(
          "ch.ct.refuse-old",
          "This filing was made before amending from a receipt was possible, so its answers were not kept. File the amended return from the start.",
        ),
      );
      return;
    }
    if (receipt.jointFilingId && !(await jointFilingOffered)) {
      refuseAmendment(
        siteText(
          "ch.ct.refuse-joint",
          "Filing the accounts and the Company Tax Return together is not available here, so this joint filing cannot be amended.",
        ),
      );
      return;
    }
    if (receipt.kind === "companies-house-accounts" && !receipt.jointFilingId) {
      const cause = siteText(
        "ch.ct.refuse-accounts-alone",
        "These accounts were filed on their own, so they are revised on the accounts form, not with a Company Tax Return.",
      );
      const failure = new Error(cause);
      failure.failure = {
        cause,
        next: {
          label: siteText("ch.ct.amend-accounts-alone", "Open these accounts, then choose Amend"),
          href: `filings.html?receipt=${encodeURIComponent(receiptName)}`,
        },
      };
      window.showFailure(failure, siteText("ch.ct.refuse-accounts-alone-title", "These accounts cannot be amended here"));
      return;
    }
    if (receipt.longPeriod && !(await loadFiledLongReturns(receipt))) return;
    // The register says whether the filed accounts were the company's first; the receipt does not.
    const profile = await window.getCompanyProfile(receipt.formRequest.company.companyNumber);
    const { dateOfCreation, accountsLastPeriodStart } = companyFromProfile(profile);
    company = { ...receipt.formRequest.company, dateOfCreation, accountsLastPeriodStart };
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
    refuseAmendment(error.message || siteText("ch.ct.amend-load-failed", "Failed to load the filing to amend."));
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
element("amendAttachedAccountsBtn").addEventListener("click", () => startAmendment({ accounts: false, attachedAccounts: true }));
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
