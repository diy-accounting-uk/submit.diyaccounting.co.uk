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
  BOX_SOURCE_FIELD,
  COMPUTATION_SOURCE_FIELD,
  BALANCE_SHEET_FIELDS,
  CT600_BOX_ROWS,
  CT600_FORM_FIELDS,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_FIELDS,
  MICRO_BALANCE_SHEET_FIELDS,
  MICRO_PROFIT_AND_LOSS_FIELDS,
  MICRO_STATEMENT_FIELD,
  PROFIT_AND_LOSS_FIELDS,
  SECTIONS,
  STATEMENT_FIELDS,
  TEXT_BOXES,
  accountsFormEntries,
  accountsFromValues,
  applyFormEntries,
  balanceSheetId,
  boxRow,
  changeTargetFor,
  ct600RequestFromValues,
  figuresFromValues,
  financialYearOf,
  formProblems,
  guideUrl,
  microId,
  noteId,
  profitAndLossId,
  regimeOf,
  reviewAnswers,
  targetOfModelProblem,
} from "../lib/ct600-fields.js";

const FILED_ACCOUNTS_STORAGE_KEY = "filedSmallCompanyAccounts";
const MAX_POLLS = 60;
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
  { field: "adjustedProfitBeforeCapitalAllowances", meaning: "Adjusted profit before capital allowances", style: "subtotal" },
  { field: "totalCapitalAllowances", meaning: "Less: total capital allowances", deduction: true },
  { field: "adjustedProfit", meaning: "Adjusted profit", style: "total" },
];

const RETURN_TO_REVIEW = "Return to the review";
const PREVIEW_THE_RETURN = "Preview the return";
const VIEW_HASH = { companyView: "company", formView: "form", previewView: "review", resultView: "result" };

let company = null;
let previewRequest = null;
let reviewedPreview = null;
let currentView = "companyView";
let reviewReached = false;
let changing = null;

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
    radio("no", "No", true),
    radio("yes", "Yes", false),
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
  );
}

function sectionBody(sectionId) {
  const fields = CT600_FORM_FIELDS.filter((field) => field.section === sectionId).map(fieldGroup);
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
  const sections = [];
  for (const { id, title } of SECTIONS) {
    sections.push(create("section", { id: `section-${id}`, class: "form-section" }, create("h3", {}, title), ...sectionBody(id)));
    if (id === "reliefs") sections.push(workedTaxPanel());
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
  const regime = regimeOf(readValues());
  for (const node of element("formSections").querySelectorAll("[data-regime]")) node.hidden = node.dataset.regime !== regime;
}

function toggleSections() {
  const oneYear = !element("includeComparatives").checked;
  for (const table of element("formSections").querySelectorAll(".ledger--years")) table.classList.toggle("ledger--one-year", oneYear);
  element("fixedAssetNoteFields").style.display = element("includeFixedAssetNote").checked ? "block" : "none";
}

// --- Reading the form -----------------------------------------------------------------------

function readValues() {
  const values = {};
  for (const control of element("returnForm").querySelectorAll("input, textarea")) {
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

async function ensureTaxData(periodEnd) {
  if (!isIsoDate(periodEnd) || !state.bundle) return;
  const financialYear = financialYearOf(periodEnd);
  if (financialYear in state.taxData) return;
  state.taxData[financialYear] = null;
  try {
    state.taxData[financialYear] = await state.bundle.ltdTaxData(financialYear);
  } catch (error) {
    console.error(`No tax data for the financial year ${financialYear}:`, error);
  }
  refresh();
}

function taxDataByYear() {
  return Object.fromEntries(Object.entries(state.taxData).filter(([, data]) => data));
}

function modelProblems(values) {
  if (!state.bundle) return [];
  const figures = figuresFromValues(values, company ?? { companyName: "", companyNumber: "" }, state.workingSheet);
  const problems = state.bundle.validateCt600Figures(figures, { today: today(), taxDataByYear: taxDataByYear() });
  return problems
    .filter((problem) => !["companyName", "companyNumber"].includes(problem.field))
    .map((problem) => ({
      target: targetOfModelProblem(problem.field, state.targets),
      message: problem.message,
      refusal: problem.refusal,
    }));
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

function renderWorkedTax(values) {
  const rows = element("workedTaxRows");
  if (!state.bundle) {
    rows.replaceChildren();
    return;
  }
  const figures = figuresFromValues(values, company ?? { companyName: "", companyNumber: "" }, state.workingSheet);
  const placeholders = {
    utr: figures.utr || PLACEHOLDER_UTR,
    companyName: figures.companyName || PLACEHOLDER_TEXT,
    companyNumber: figures.companyNumber || "00000000",
    declarantName: figures.declarantName || PLACEHOLDER_TEXT,
    declarantStatus: figures.declarantStatus || PLACEHOLDER_TEXT,
  };
  let derived;
  try {
    derived = state.bundle.deriveCt600FromFigures({ ...figures, ...placeholders }, taxDataByYear());
  } catch {
    element("workedTaxEmpty").style.display = "block";
    rows.replaceChildren();
    return;
  }
  element("workedTaxEmpty").style.display = "none";
  const items = [
    create(
      "div",
      { class: "worked-tax__row" },
      create("dt", {}, "Adjusted profit in the computation"),
      create("dd", {}, `£${formatPounds(derived.computationLines.adjustedProfit)}`),
      create(
        "dd",
        { class: "hint" },
        "Profit per the accounts, less bank interest, plus depreciation, amortisation and entertaining, less capital allowances",
      ),
    ),
  ];
  for (const row of CT600_BOX_ROWS.filter(
    (candidate) => candidate.kind === "worked" && candidate.box in derived.boxes && candidate.box > 145,
  )) {
    items.push(
      create(
        "div",
        { class: "worked-tax__row" },
        create("dt", {}, `Box ${row.box}: ${row.label}`),
        create("dd", {}, workedValue(row.box, derived.boxes[row.box])),
        create("dd", { class: "hint" }, row.rule),
      ),
    );
  }
  rows.replaceChildren(...items);
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

function refresh() {
  if (!element("formSections").firstChild) return;
  const values = readValues();
  state.problems = evaluate(values);
  renderWorkedTax(values);
  showTouchedErrors();
  updateSummary();
  ensureTaxData(values.periodEnd);
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
  setDefaults();
  refresh();
}

function handleFormLeave(event) {
  if (markTouched(event.target)) refresh();
}

function handleFormChange(event) {
  if (event.target.id === "includeComparatives" || event.target.id === "includeFixedAssetNote") toggleSections();
  if (event.target.name === "accountsRegime") applyRegime();
  if (markTouched(event.target)) {
    setDefaults();
    refresh();
  }
}

// --- The company, the filed accounts and the card -------------------------------------------

function readFiledAccounts() {
  try {
    const stored = sessionStorage.getItem(FILED_ACCOUNTS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function offerFiledAccounts() {
  const filed = readFiledAccounts();
  if (!filed) return;
  element("filedAccountsCompany").textContent = `${filed.companyName} (${filed.companyNumber})`;
  element("filedAccountsOffer").style.display = "block";
}

function useFiledAccounts() {
  const filed = readFiledAccounts();
  if (!filed) return;
  const filledCount = applyFormEntries(accountsFormEntries(filed));
  window.showStatus(`Filled ${filledCount} fields from the accounts Companies House accepted. Check them.`, "info");
}

function mountBooksCard() {
  window.booksImport.mount(element("booksImport"), {
    kind: "ct600",
    onFilled: (workingSheet) => {
      state.workingSheet = workingSheet;
      refresh();
    },
  });
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  const companyNumber = window.normaliseCompanyNumber(element("companyNumber").value);
  if (!companyNumber) {
    window.showStatus("Please enter a company number.", "error");
    return;
  }

  window.showLoading();
  window.hideStatus();
  try {
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber: profile.companyNumber, companyName: profile.companyName };
    element("formCompanyName").textContent = company.companyName;
    element("formCompanyNumber").textContent = company.companyNumber;
    showView("formView");
    await ensureBundle();
    refresh();
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

function renderAnswers(values) {
  const tables = reviewAnswers(values).map(({ id, title, rows }) => {
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
  });
  element("reviewAnswers").replaceChildren(...tables);
}

function renderReview(preview) {
  const values = readValues();
  renderAnswers(values);
  const boxRows = Object.keys(preview.boxes)
    .map(Number)
    .sort((a, b) => a - b)
    .map((box) => {
      const label = boxRow(box).label;
      const source = BOX_SOURCE_FIELD[box];
      const change = source ? changeLink(changeTargetFor(source, values), `box ${box}, ${label}`) : companyChangeLink();
      const row = tableRow(box, label, "", change);
      if (box === 340 || box === 390) amountCell(row.children[2], `${preview.boxes[box]}%`);
      else if (box === 329) row.children[2].textContent = "Yes";
      else if (TEXT_BOXES.has(box)) row.children[2].textContent = preview.boxes[box];
      else amountCell(row.children[2], formatPounds(preview.boxes[box]));
      row.children[2].classList.add("review-table__value-cell");
      row.id = `review-box-${box}`;
      return row;
    });
  element("ct600Table")
    .querySelector("tbody")
    .replaceChildren(...boxRows);
  const lineRows = COMPUTATION_LINES.map(({ field, meaning, deduction, style }) => {
    const row = tableRow(meaning, "", changeLink(changeTargetFor(COMPUTATION_SOURCE_FIELD[field], values), meaning));
    amountCell(row.children[1], formatPounds(preview.computationLines[field], deduction), style);
    row.id = `review-line-${field}`;
    return row;
  });
  element("computationsTable")
    .querySelector("tbody")
    .replaceChildren(...lineRows);
  element("previewIxbrl").textContent = preview.computationsIxbrl;
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
    previewRequest = ct600RequestFromValues(readValues(), company, state.workingSheet);
    const preview = await window.previewCtReturn(previewRequest);
    renderReview(preview);
    reviewedPreview = preview;
    reviewReached = true;
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
    result = await window.pollCtReturn(correlationId, extraHeaders);
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

function outcomeTitle(text) {
  return create("h3", { class: "outcome__title" }, text);
}

function showOutcome(outcome) {
  element("returnErrors").style.display = "none";
  element("returnIrmark").style.display = "none";
  element("tryAgainBtn").style.display = "none";
  element("startAgainBtn").style.display = "none";
  if (outcome.statusCode === "ACCEPT") {
    setOutcome("ok");
    element("returnResult").replaceChildren(outcomeTitle("HMRC accepted the Company Tax Return"));
    element("returnIrmark").replaceChildren(
      create("p", {}, "IRmark: ", create("code", {}, outcome.irmark)),
      create("p", {}, "Keep the IRmark. It is HMRC's record of exactly what you sent."),
    );
    element("returnIrmark").style.display = "block";
    element("startAgainBtn").style.display = "inline-block";
    return;
  }
  if (outcome.statusCode === "REJECT") {
    setOutcome("error");
    element("returnResult").replaceChildren(outcomeTitle("HMRC rejected the Company Tax Return"));
    renderErrors(outcome);
    element("tryAgainBtn").style.display = "inline-block";
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

async function handleSubmitReturn() {
  const gatewayUserId = element("gatewayUserId").value.trim();
  const gatewayPassword = element("gatewayPassword").value;
  if (!gatewayUserId || !gatewayPassword) {
    window.showStatus("Enter the Government Gateway user ID and password.", "error");
    return;
  }

  window.showLoading();
  window.hideStatus();
  try {
    const scenario = element("govTestScenario").value.trim();
    const scenarioHeaders = scenario ? { "Gov-Test-Scenario": scenario } : {};
    const submission = await window.submitCtReturn(
      { ...previewRequest, reviewedBoxes: reviewedPreview.boxes, gatewayUserId, gatewayPassword },
      scenarioHeaders,
    );
    element("gatewayPassword").value = "";
    setOutcome();
    element("returnResult").replaceChildren(
      paragraph("Return ", { strong: submission.correlationId }, " accepted by the gateway. Waiting for HMRC..."),
    );
    element("returnErrors").style.display = "none";
    element("returnIrmark").style.display = "none";
    element("tryAgainBtn").style.display = "none";
    showView("resultView");
    const outcome = await pollUntilSettled(submission.correlationId, submission.pollIntervalSeconds, scenarioHeaders);
    showOutcome(outcome);
  } catch (error) {
    console.error("Company Tax Return submission failed:", error);
    if (error.status === 409) showView("previewView");
    window.showStatus(error.message || "Failed to file the Company Tax Return with HMRC.", "error");
  } finally {
    window.hideLoading();
  }
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  element("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

function startAgain() {
  company = null;
  previewRequest = null;
  reviewedPreview = null;
  reviewReached = false;
  changing = null;
  element("previewBtn").textContent = PREVIEW_THE_RETURN;
  element("returnResult").replaceChildren();
  element("companyForm").reset();
  element("gatewayUserId").value = "";
  element("gatewayPassword").value = "";
  element(SUMMARY_ID)?.remove();
  renderForm();
  mountBooksCard();
  window.hideStatus();
  showView("companyView");
}

renderForm();
mountBooksCard();
offerFiledAccounts();
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);

const returnForm = element("returnForm");
returnForm.addEventListener("input", handleFormInput);
returnForm.addEventListener("change", handleFormChange);
returnForm.addEventListener("focusout", handleFormLeave);
element("companyForm").addEventListener("submit", handleCompanySubmit);
returnForm.addEventListener("submit", handleReturnFormSubmit);
element("useFiledAccountsBtn").addEventListener("click", useFiledAccounts);
element("previewView").addEventListener("click", handleChangeClick);
window.addEventListener("popstate", () => showView(viewForHistory(location.hash), { push: false }));
history.replaceState({ view: currentView }, "", `#${VIEW_HASH[currentView]}`);
element("backToFormBtn").addEventListener("click", () => showView("formView"));
element("submitReturnBtn").addEventListener("click", handleSubmitReturn);
element("tryAgainBtn").addEventListener("click", () => showView("previewView"));
element("startAgainBtn").addEventListener("click", startAgain);
element("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});
