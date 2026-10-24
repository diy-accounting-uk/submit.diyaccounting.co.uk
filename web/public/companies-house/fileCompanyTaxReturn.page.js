// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// File Company Tax Return: companyView -> formView -> previewView -> resultView. The customer
// types the figures (or a book fills them through the "Fill from your books" card); the form
// checks them as they are entered and works the tax out beside them. The Government Gateway user
// ID and password are read from the page when the return is submitted, sent once and held nowhere
// else.

import {
  ACCOUNTS_TEXT_FIELDS,
  BALANCE_SHEET_FIELDS,
  COMPUTATIONS_GUIDE_ANCHOR,
  CT600_BOX_ROWS,
  CT600_FORM_FIELDS,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_FIELDS,
  PROFIT_AND_LOSS_FIELDS,
  SECTIONS,
  STATEMENT_FIELDS,
  TEXT_BOXES,
  accountsFormEntries,
  accountsFromValues,
  applyFormEntries,
  balanceSheetId,
  boxRow,
  ct600RequestFromValues,
  figuresFromValues,
  financialYearOf,
  formProblems,
  guideUrl,
  noteId,
  profitAndLossId,
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

let company = null;
let previewRequest = null;

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

function showView(name) {
  for (const id of ["companyView", "formView", "previewView", "resultView"]) {
    element(id).style.display = id === name ? "block" : "none";
  }
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

function amountCell(row, text, style) {
  const cell = row.lastElementChild;
  cell.textContent = text;
  cell.style.textAlign = "right";
  cell.style.whiteSpace = "nowrap";
  if (style === "subtotal" || style === "total") cell.style.borderTop = "1px solid currentColor";
  if (style === "total") {
    cell.style.borderBottom = "3px double currentColor";
    cell.style.fontWeight = "bold";
  }
  return row;
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
  return create("div", { class: "input-prefix" }, create("span", { class: "prefix" }, "£"), input);
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

const CONTROL_STYLE = "width: auto; flex: none; margin: 0.25rem 0 0";
const CHOICE_LABEL_STYLE = "display: block; margin: 0; font-weight: normal";
const CHOICE_ROW_STYLE = "display: flex; align-items: flex-start; gap: 0.6rem; margin-bottom: 0.5rem";

function choiceRow(input, label) {
  return create("div", { style: CHOICE_ROW_STYLE }, input, label);
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
        "style": CONTROL_STYLE,
        ...(checked ? { checked: "" } : {}),
      }),
      create("label", { for: `${field.id}${value === "no" ? "No" : "Yes"}`, style: CHOICE_LABEL_STYLE }, text),
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
    choiceRow(
      create("input", { "type": "checkbox", id, "name": id, "data-error-target": target, "style": CONTROL_STYLE }),
      create("label", { for: id, style: CHOICE_LABEL_STYLE }, label),
    ),
  );
}

function fieldGroup(field) {
  if (field.type === "choice") return choiceGroup(field);
  if (field.type === "dates") return datesGroup(field);
  if (field.type === "checkbox") return checkboxGroup(field.id, field.label);
  return textGroup(field);
}

function amountGroup(id, label) {
  return textGroup({ id, label, type: "whole-pounds", hint: "" });
}

function accountsYear(prefix) {
  return [
    create("h4", {}, "Profit and loss account"),
    ...PROFIT_AND_LOSS_FIELDS.map(([field, label]) => amountGroup(profitAndLossId(prefix, field), label)),
    create("h4", {}, "Balance sheet"),
    ...BALANCE_SHEET_FIELDS.map(([field, label]) => amountGroup(balanceSheetId(prefix, field), label)),
  ];
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

function accountsSection() {
  const note = FIXED_ASSET_CLASSES.map(([className, title]) =>
    create("div", {}, create("h4", {}, title), ...FIXED_ASSET_FIELDS.map(([field, label]) => amountGroup(noteId(className, field), label))),
  );
  return [
    create(
      "p",
      { class: "hint" },
      "HMRC takes the full accounts with the return, so they are part of this form. Enter whole pounds, for example 600 or 1,200.",
    ),
    create("h4", {}, "Current year"),
    ...accountsYear("current"),
    checkboxGroup("includeComparatives", "Include last year's figures"),
    create("div", { id: "comparativeFields", style: "display: none" }, create("h4", {}, "Prior year"), ...accountsYear("prior")),
    checkboxGroup("includeFixedAssetNote", "Include the tangible fixed assets note"),
    create("div", { id: "fixedAssetNoteFields", style: "display: none" }, ...note),
    ...ACCOUNTS_TEXT_FIELDS.map(accountsTextGroup),
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
      ...STATEMENT_FIELDS.map(({ id, label }) => checkboxGroup(id, label)),
      create("h4", {}, "Declaration"),
      ...fields.slice(2),
    ];
  }
  return fields;
}

function renderForm() {
  const sections = [];
  for (const { id, title } of SECTIONS) {
    sections.push(create("section", { id: `section-${id}`, style: "margin-top: 2rem" }, create("h3", {}, title), ...sectionBody(id)));
    if (id === "reliefs") sections.push(workedTaxPanel());
  }
  element("formSections").replaceChildren(...sections);
  state.targets = new Set([...element("formSections").querySelectorAll("[data-error-target]")].map((node) => node.dataset.errorTarget));
  state.targets.add(WORKED_TAX_ID);
  state.touched = new Set();
  state.edited = new Set();
  state.workingSheet = undefined;
  setDefaults();
  refresh();
}

function toggleSections() {
  element("comparativeFields").style.display = element("includeComparatives").checked ? "block" : "none";
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
  if (element("includeFixedAssetNote").checked) {
    const charge = accountsFromValues(readValues()).smallCompany.fixedAssetNote;
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

function showSummary(problems) {
  element(SUMMARY_ID)?.remove();
  const list = create("ul", { class: "error-summary__list" });
  for (const problem of problems) {
    const link = create("a", { href: `#${problem.target}` }, problem.message);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      focusTarget(problem.target);
    });
    list.append(create("li", {}, link));
  }
  const summary = create(
    "div",
    { id: SUMMARY_ID, class: "error-summary", role: "alert", tabindex: "-1" },
    create("h2", { class: "error-summary__title" }, "There is a problem"),
    list,
  );
  element("returnForm").prepend(summary);
  summary.focus();
}

function refresh() {
  if (!element("formSections").firstChild) return;
  const values = readValues();
  state.problems = evaluate(values);
  renderWorkedTax(values);
  showTouchedErrors();
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

function guideLink(text, anchor) {
  const link = document.createElement("a");
  link.href = guideUrl(anchor);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = text;
  return link;
}

function renderReview(preview) {
  const boxRows = Object.keys(preview.boxes)
    .map(Number)
    .sort((a, b) => a - b)
    .map((box) => {
      const row = tableRow(box, guideLink(boxRow(box).label, boxRow(box).anchor), preview.boxes[box]);
      if (box === 340 || box === 390) return tableRow(box, guideLink(boxRow(box).label, boxRow(box).anchor), `${preview.boxes[box]}%`);
      if (box === 329) return tableRow(box, guideLink(boxRow(box).label, boxRow(box).anchor), "Yes");
      if (TEXT_BOXES.has(box)) return row;
      return amountCell(row, formatPounds(preview.boxes[box]));
    });
  element("ct600Table")
    .querySelector("tbody")
    .replaceChildren(...boxRows);
  const lineRows = COMPUTATION_LINES.map(({ field, meaning, deduction, style }) =>
    amountCell(
      tableRow(guideLink(meaning, COMPUTATIONS_GUIDE_ANCHOR), ""),
      formatPounds(preview.computationLines[field], deduction),
      style,
    ),
  );
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
    showView("previewView");
  } catch (error) {
    console.error("Failed to preview the Company Tax Return:", error);
    window.showStatus(error.message || "Failed to preview the Company Tax Return.", "error");
  } finally {
    window.hideLoading();
  }
}

function renderErrors(outcome) {
  const container = element("returnErrors");
  const entries = [...(outcome.errors ?? []), ...(outcome.businessErrors ?? [])];
  if (entries.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  container.replaceChildren(...entries.map((entry) => paragraph(`${entry.number}: ${entry.text}`)));
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

function showOutcome(outcome) {
  element("returnErrors").style.display = "none";
  element("returnIrmark").style.display = "none";
  element("tryAgainBtn").style.display = "none";
  element("startAgainBtn").style.display = "none";
  if (outcome.statusCode === "ACCEPT") {
    element("returnResult").replaceChildren(paragraph("HMRC ", { strong: "ACCEPTED" }, " the Company Tax Return."));
    element("returnIrmark").replaceChildren(paragraph("IRmark: ", { strong: outcome.irmark }));
    element("returnIrmark").style.display = "block";
    element("startAgainBtn").style.display = "inline-block";
    return;
  }
  if (outcome.statusCode === "REJECT") {
    element("returnResult").replaceChildren(paragraph("HMRC ", { strong: "REJECTED" }, " the Company Tax Return."));
    renderErrors(outcome);
    element("tryAgainBtn").style.display = "inline-block";
    return;
  }
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
    const submission = await window.submitCtReturn({ ...previewRequest, gatewayUserId, gatewayPassword }, scenarioHeaders);
    element("gatewayPassword").value = "";
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
element("backToFormBtn").addEventListener("click", () => showView("formView"));
element("submitReturnBtn").addEventListener("click", handleSubmitReturn);
element("tryAgainBtn").addEventListener("click", () => showView("previewView"));
element("startAgainBtn").addEventListener("click", startAgain);
element("changeCompanyLink").addEventListener("click", (event) => {
  event.preventDefault();
  showView("companyView");
});
