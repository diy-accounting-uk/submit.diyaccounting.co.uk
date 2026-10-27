// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/books-import.js
// The "Fill from your books" card: a drop zone and a file dialog that read a DIYA-GL book in
// the browser (a DIYA-GL zip, a spreadsheets workbook or package zip, or a book as JSON) and fill
// the filing form on the page from the figures the book derives for the period the form names.
// The book never leaves the browser; only what the customer files reaches the server.
//
// Pages mount the card with window.booksImport.mount(container, { kind, ... }):
//   kind "vat"            fills the nine VAT boxes for the period end on the form
//   kind "itsa-quarterly" fills the period summary fields for the period end on the form
//   kind "itsa-annual"    fills allowances and adjustments through the page's own hooks:
//                         { taxYear: () => string, fill: (figures) => { imported, unmapped } }
//   kind "uk-property-period"  fills the rental income and expense fields for the period dates on the form
//   kind "uk-property-annual"  fills the adjustments and the itemised allowances through the page's own
//                         hooks: { taxYear: () => string, fill: (figures) => { imported, unmapped } }.
//                         The elections and the landlord facts stay with the customer.
//   kind "ct600"          fills the Company Tax Return form (period, computation figures, capital
//                         allowances, reliefs and the accounts section, small and micro-entity, with
//                         the regime the company's size gives) from a Company book; the
//                         page's hook { onFilled: (workingSheet) => void } receives the book's own
//                         trading profit and Corporation Tax for the page's check. It also accepts
//                         the figures JSON the diya-submit MCP tool derive_company_tax_return writes.
//   kind "micro-entity-accounts"  fills the period, the seven balance-sheet lines for both years, the
//                         average number of employees and the director from a Company book, and ticks the
//                         dormant box when the book shows no turnover, no costs and no change in reserves
//   kind "small-company-accounts"  fills the period, the current year's profit and loss account and
//                         balance sheet, the fixed asset note, the employees and the directors from a
//                         Company book; the book holds no prior year profit and loss, so the prior year stays blank
// The two accounts kinds and the ct600 kind also read an iXBRL accounts document (.xhtml, .html or .xml)
// in the browser: the figures it tags fill the same form fields, and the status line names the taxonomy
// it read and the facts the form has no field for. A document for another company, or for the other
// regime on an accounts page, fills nothing. The ct600 kind takes either regime from the document, fills
// the accounts section and sets the depreciation added back to the fixed asset note's charge, and also
// refuses a document whose period differs from the period the form already holds.
//
// The annual card also accepts the derived-figures JSON the diya-submit MCP tool
// derive_itsa_annual_submission writes.
//
// Where the page's environment carries a Google Drive client id and Picker key, a "Choose from
// Google Drive" button sits beside the file dialog. It opens the customer's own Drive in the
// Google Picker and reads the chosen file the way a dropped one is read.
//
// The reader and the three derivations load from lib/books-bundle.js on the first file, not on
// page load.
//
// A DIYA-GL page can also send figures it derived itself. They arrive in the URL fragment as
// "#books=<base64url JSON>"; lib/auth-url-builder.js keeps the decoded text in sessionStorage
// through sign-in, and mounting the card fills the form from it and drops the stored copy. The JSON:
//   { kind, sourceFileName, packageVersion, period, figures }
//   kind "vat"             period { periodStart, periodEnd }
//                          figures { vatDueSales, vatDueAcquisitions, vatReclaimedCurrPeriod,
//                                    totalValueSalesExVAT, totalValuePurchasesExVAT,
//                                    totalValueGoodsSuppliedExVAT, totalAcquisitionsExVAT }
//   kind "itsa-quarterly"  period { taxYear, periodStartDate, periodEndDate }
//                          figures { periodIncome, periodExpenses, periodDisallowableExpenses }
//   kind "itsa-annual"     period { taxYear }, figures { allowances, adjustments }

(function () {
  "use strict";

  const ACCEPTED_FILES = ".zip,.xlsx,.xls,.json,application/zip,application/json";
  const ACCEPTED_ACCOUNTS_FILES = `${ACCEPTED_FILES},.xhtml,.html,.htm,.xml,application/xhtml+xml,text/html,text/xml,application/xml`;
  const IXBRL_FILE_NAME = /\.(xhtml|html|htm|xml)$/i;
  const ZIP_FILE_NAME = /\.zip$/i;
  const PERIOD_PROBE_END = "1900-01-01";
  const MAX_UNMAPPED_SHOWN = 12;

  let bundlePromise = null;
  let drivePickerPromise = null;
  let mountedCard = null;

  function loadBundle() {
    if (!bundlePromise) {
      bundlePromise = import("../lib/books-bundle.js").catch((error) => {
        bundlePromise = null;
        throw error;
      });
    }
    return bundlePromise;
  }

  function loadDrivePicker() {
    if (!drivePickerPromise) {
      drivePickerPromise = import("../lib/google-drive-picker.js").catch((error) => {
        drivePickerPromise = null;
        throw error;
      });
    }
    return drivePickerPromise;
  }

  // An answer for the customer, as opposed to a fault in the code: shown as the status line.
  class Refusal extends Error {}

  // A file the card cannot use, shown as "Could not import <file>: <reason>."
  class FileProblem extends Error {}

  function fieldValue(id) {
    const element = document.getElementById(id);
    return element ? element.value.trim() : "";
  }

  function figureText(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  function setField(id, text) {
    const element = document.getElementById(id);
    if (!element) return false;
    element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function plural(count, singular) {
    return `${count} ${singular}${count === 1 ? "" : "s"}`;
  }

  function withoutFinalStop(text) {
    let end = String(text).length;
    while (end > 0 && /[.\s]/.test(text[end - 1])) end -= 1;
    return String(text).slice(0, end);
  }

  function poundsText(value) {
    return `£${figureText(value)}`;
  }

  function namedList(names) {
    const shown = names.slice(0, MAX_UNMAPPED_SHOWN).join(", ");
    return names.length > MAX_UNMAPPED_SHOWN ? `${shown} and ${names.length - MAX_UNMAPPED_SHOWN} more` : shown;
  }

  function coveredSentence(covered) {
    return covered ? " This book covers " + covered + "." : "";
  }

  // The periods a company book answers, in the words of the package's own refusal for an end date
  // the book does not carry. Empty when the book cannot say, for example because it is not VAT
  // registered.
  async function vatPeriodsCovered(bundle, book, lines) {
    try {
      await bundle.deriveVatReturn(book, lines, { periodEnd: PERIOD_PROBE_END });
    } catch (error) {
      const match = /it answers (periods ending .*)$/.exec(error.message);
      return match ? match[1] : "";
    }
    return "";
  }

  // Boxes 3 and 5 are computed by the page from the boxes it is given.
  const VAT_BOX_FIELDS = [
    "vatDueSales",
    "vatDueAcquisitions",
    "vatReclaimedCurrPeriod",
    "totalValueSalesExVAT",
    "totalValuePurchasesExVAT",
    "totalValueGoodsSuppliedExVAT",
    "totalAcquisitionsExVAT",
  ];

  async function fillVat({ bundle, source, fileName }) {
    const periodEnd = fieldValue("periodEnd");
    const periodStart = fieldValue("periodStart");
    if (!periodEnd) {
      const covered = await vatPeriodsCovered(bundle, source.book, source.lines);
      throw new Refusal(`Choose the VAT period first and the boxes fill from ${fileName}.${coveredSentence(covered)}`);
    }
    let derived;
    try {
      derived = await bundle.deriveVatReturn(source.book, source.lines, { periodEnd, ...(periodStart ? { periodStart } : {}) });
    } catch (error) {
      const covered = error.message.includes("it answers periods ending") ? "" : await vatPeriodsCovered(bundle, source.book, source.lines);
      throw new Refusal(`${withoutFinalStop(error.message)}. Nothing filled.${coveredSentence(covered)}`);
    }
    VAT_BOX_FIELDS.forEach((id) => setField(id, figureText(derived.hmrc[id])));
    if (!periodStart) setField("periodStart", derived.periodStart);
    const vatNumberField = document.getElementById("vatNumber");
    if (vatNumberField && !vatNumberField.value.trim() && /^\d{9}$/.test(derived.vatRegistrationNumber || "")) {
      setField("vatNumber", derived.vatRegistrationNumber);
    }
    return `Filled the nine boxes from ${fileName} for the period ${derived.periodStart} to ${derived.periodEnd}. Check them, then submit.`;
  }

  function figuresTheFormLacks(period) {
    const itemisedIds = window.selfEmploymentExpenses.ITEMISED_FIELDS.map((field) => field.id);
    const lacking = [];
    Object.entries(period.periodExpenses || {}).forEach(([name, value]) => {
      if (!itemisedIds.includes(name) && typeof value === "number" && value !== 0) lacking.push(`${name} ${poundsText(value)}`);
    });
    const disallowableIds = window.selfEmploymentExpenses.DISALLOWABLE_IDS;
    Object.entries(period.periodDisallowableExpenses || {}).forEach(([name, value]) => {
      if (!disallowableIds.includes(name) && typeof value === "number" && value !== 0) lacking.push(`${name} ${poundsText(value)}`);
    });
    return lacking;
  }

  // Every itemised expense field takes the book's figure, or its starting value when the book
  // has none, and the total-expenses field is cleared because HMRC takes one or the other.
  // Each disallowable field takes the book's figure or is cleared.
  function fillExpenseFields(periodExpenses, periodDisallowableExpenses) {
    const { ITEMISED_FIELDS, CONSOLIDATED_FIELD, DISALLOWABLE_IDS } = window.selfEmploymentExpenses;
    let filled = 0;
    setField(CONSOLIDATED_FIELD, "");
    ITEMISED_FIELDS.forEach(({ id }) => {
      const figure = periodExpenses?.[id];
      const alwaysSent = id === "costOfGoods" || id === "otherExpenses";
      if (typeof figure === "number") {
        setField(id, figureText(figure));
        filled += 1;
      } else {
        setField(id, alwaysSent ? "0" : "");
        if (alwaysSent) filled += 1;
      }
    });
    DISALLOWABLE_IDS.forEach((id) => {
      const figure = periodDisallowableExpenses?.[id];
      if (typeof figure === "number") {
        setField(id, figureText(figure));
        filled += 1;
      } else {
        setField(id, "");
      }
    });
    window.selfEmploymentExpenses.revealFilledSections();
    return filled;
  }

  async function fillItsaQuarterly({ bundle, source, fileName }) {
    const derived = await bundle.deriveItsaQuarterlyUpdate(source.book, source.lines, {});
    const formTaxYear = fieldValue("taxYear");
    if (formTaxYear && formTaxYear !== derived.taxYear) {
      throw new Refusal(`${fileName} is for ${derived.taxYear}; this form is for ${formTaxYear}. Nothing filled.`);
    }
    const periodEnds = derived.periods.map((period) => period.periodDates.periodEndDate);
    const periodEnd = fieldValue("periodEndDate");
    if (!periodEnd) {
      throw new Refusal(
        `Enter the period end date and the figures fill from ${fileName}. This book's periods end on ${periodEnds.join(", ")}.`,
      );
    }
    const period = derived.periods.find((candidate) => candidate.periodDates.periodEndDate === periodEnd);
    if (!period) {
      throw new Refusal(`No period in ${fileName} ends on ${periodEnd}. Its periods end on ${periodEnds.join(", ")}. Nothing filled.`);
    }
    if (!formTaxYear) setField("taxYear", derived.taxYear);
    if (!fieldValue("periodStartDate")) setField("periodStartDate", period.periodDates.periodStartDate);
    return applyQuarterlyFigures(period, fileName, periodEnd);
  }

  function applyQuarterlyFigures(period, fileName, periodEnd) {
    setField("turnover", figureText(period.periodIncome?.turnover ?? 0));
    setField("otherIncome", figureText(period.periodIncome?.other ?? 0));
    const filledExpenses = fillExpenseFields(period.periodExpenses, period.periodDisallowableExpenses);
    const lacking = figuresTheFormLacks(period);
    const lackingText = lacking.length ? ` The form has no field for these figures from the book: ${namedList(lacking)}.` : "";
    return `Filled ${2 + filledExpenses} figures from ${fileName} for the period ending ${periodEnd}. Check them, then submit.${lackingText}`;
  }

  const UK_PROPERTY_PERIOD_FIELDS = {
    "income.periodAmount": "periodAmount",
    "income.otherIncome": "otherIncome",
    "expenses.repairsAndMaintenance": "repairsAndMaintenance",
    "expenses.other": "otherExpenses",
  };

  function derivedFigureEntries(derived) {
    return Object.entries({ income: derived.income, expenses: derived.expenses }).flatMap(([group, figures]) =>
      Object.entries(figures || {}).map(([name, value]) => [`${group}.${name}`, value]),
    );
  }

  async function fillUkPropertyPeriod({ bundle, source, fileName }) {
    const periodStartDate = fieldValue("fromDate");
    const periodEndDate = fieldValue("toDate");
    if (!periodStartDate || !periodEndDate) {
      throw new Refusal(`Enter the period start and end dates and the figures fill from ${fileName}.`);
    }
    let derived;
    try {
      derived = await bundle.deriveUkPropertyPeriod(source.book, source.lines, { periodStartDate, periodEndDate });
    } catch (error) {
      throw new Refusal(`${withoutFinalStop(error.message)}. Nothing filled.`);
    }
    const entries = derivedFigureEntries(derived);
    const figures = new Map(entries);
    let filled = 0;
    Object.entries(UK_PROPERTY_PERIOD_FIELDS).forEach(([name, id]) => {
      const figure = figures.get(name);
      if (typeof figure === "number") {
        setField(id, figureText(figure));
        filled += 1;
      } else {
        setField(id, "");
      }
    });
    const lacking = entries
      .filter(([name, value]) => !(name in UK_PROPERTY_PERIOD_FIELDS) && typeof value === "number")
      .map(([name, value]) => `${name} ${poundsText(value)}`);
    const lackingText = lacking.length ? ` The form has no field for these figures from the book: ${namedList(lacking)}.` : "";
    const warningText = derived.warnings.map((warning) => ` ${upperFirst(withoutFinalStop(warning))}.`).join("");
    return `Filled ${plural(filled, "figure")} from ${fileName} for the period ${periodStartDate} to ${periodEndDate}. Check them, then submit.${lackingText}${warningText}`;
  }

  async function fillUkPropertyAnnual({ bundle, source, fileName, hooks }) {
    const taxYear = hooks.taxYear();
    if (!taxYear) throw new Refusal(`Load the annual submission for a tax year and the figures fill from ${fileName}.`);
    let derived;
    try {
      derived = await bundle.deriveUkPropertyAnnual(source.book, source.lines, { taxYear });
    } catch (error) {
      throw new Refusal(`${withoutFinalStop(error.message)}. Nothing imported.`);
    }
    const figures = { taxYear: derived.taxYear, allowances: derived.allowances, adjustments: derived.adjustments };
    if (Object.keys(figures.allowances).length === 0 && Object.keys(figures.adjustments).length === 0) {
      throw new Refusal(`${fileName} carries no allowances and no adjustments for ${derived.taxYear}. Nothing imported.`);
    }
    return applyAnnualFigures(figures, fileName, hooks);
  }

  // The derived-figures file is derive_itsa_annual_submission's answer: { taxYear, allowances,
  // adjustments, omitted, warnings }. Only allowances and adjustments reach the form.
  function parseDerivedFigures(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new FileProblem("the file is not JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new FileProblem("the file does not hold an object");
    if (typeof parsed.taxYear !== "string") throw new FileProblem("the file names no taxYear");
    const allowances = parsed.allowances && typeof parsed.allowances === "object" ? parsed.allowances : {};
    const adjustments = parsed.adjustments && typeof parsed.adjustments === "object" ? parsed.adjustments : {};
    if (Object.keys(allowances).length === 0 && Object.keys(adjustments).length === 0) {
      throw new FileProblem("the file carries no allowances and no adjustments");
    }
    return { taxYear: parsed.taxYear, allowances, adjustments };
  }

  function applyAnnualFigures(figures, fileName, hooks) {
    const formTaxYear = hooks.taxYear();
    if (formTaxYear && figures.taxYear !== formTaxYear) {
      throw new Refusal(`${fileName} is for ${figures.taxYear}; this form is for ${formTaxYear}. Nothing imported.`);
    }
    const { imported, unmapped } = hooks.fill(figures);
    const left = unmapped.length ? " Some fields were not on this form." : "";
    return `Imported ${plural(imported, "figure")} from ${fileName} for ${figures.taxYear}.${left}`;
  }

  async function fillItsaAnnual({ bundle, source, fileName, hooks }) {
    const derived = await bundle.deriveItsaAnnualSubmission(source.book, source.lines, {});
    const figures = { taxYear: derived.taxYear, allowances: derived.allowances || {}, adjustments: derived.adjustments || {} };
    if (Object.keys(figures.allowances).length === 0 && Object.keys(figures.adjustments).length === 0) {
      throw new Refusal(`${fileName} carries no allowances and no adjustments for ${derived.taxYear}. Nothing imported.`);
    }
    return applyAnnualFigures(figures, fileName, hooks);
  }

  async function fillCt600({ bundle, source, fileName, hooks }) {
    if (source.ixbrl) return fillCt600FromIxbrl({ bundle, source, fileName, hooks });
    let figures;
    let accounts;
    let microAccounts;
    try {
      figures = await bundle.ct600FiguresFromBook(source.book, source.lines);
      accounts = await bundle.smallCompanyAccountsFromBook(source.book, source.lines);
      microAccounts = await bundle.microEntityAccountsFromBook(source.book, source.lines);
    } catch (error) {
      throw new Refusal(`${withoutFinalStop(error.message)}. Nothing filled.`);
    }
    const { formEntriesFromBook, applyFormEntries } = await import("../lib/ct600-fields.js");
    const filled = applyFormEntries(formEntriesFromBook(figures, accounts, microAccounts));
    hooks.onFilled(figures.workingSheet);
    return `Filled ${plural(filled, "field")} from ${fileName} for the period ${figures.periodStart} to ${figures.periodEnd}. Check them, add the UTR, the statements and the declaration, then preview.`;
  }

  // The figures file is derive_company_tax_return's answer: { kind: "ct600", sourceFileName, packageVersion, period, figures }.
  async function applyCt600Figures(parsed, fileName, hooks) {
    if (!isPlainObject(parsed.figures) || !parsed.figures.periodStart || !parsed.figures.periodEnd) {
      throw new Refusal(`${fileName} names no period in its figures. Nothing filled.`);
    }
    const { formEntriesFromFigures, applyFormEntries } = await import("../lib/ct600-fields.js");
    const filled = applyFormEntries(formEntriesFromFigures(parsed.figures));
    hooks.onFilled(parsed.figures.workingSheet);
    return `Filled ${plural(filled, "field")} from ${fileName} for the period ${parsed.figures.periodStart} to ${parsed.figures.periodEnd}. The file carries the profit and loss account only: fill the balance sheet and the rest of the accounts, then preview.`;
  }

  // Both accounts pages name the company the customer looked up. A book for another company fills nothing.
  function refuseOtherCompany(accounts, fileName) {
    const formNumber = (document.getElementById("formCompanyNumber")?.textContent || "").trim().toUpperCase();
    const bookNumber = String(accounts.companyNumber || "")
      .trim()
      .toUpperCase();
    if (formNumber && bookNumber && formNumber !== bookNumber) {
      throw new Refusal(`${fileName} is for company ${bookNumber}; this form is for company ${formNumber}. Nothing filled.`);
    }
  }

  function setChecked(id, checked) {
    const box = document.getElementById(id);
    if (!box || box.checked === checked) return;
    box.checked = checked;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function upperFirst(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Sets "<prefix><Field>" for each figure and returns how many fields it set.
  function setFigures(prefix, figures, names) {
    let filled = 0;
    names.forEach((name) => {
      if (typeof figures[name] === "number" && setField(prefix + upperFirst(name), figureText(figures[name]))) filled += 1;
    });
    return filled;
  }

  const MICRO_BALANCE_SHEET_LINES = [
    "fixedAssets",
    "currentAssets",
    "creditorsWithinOneYear",
    "creditorsAfterOneYear",
    "calledUpShareCapital",
    "profitAndLossAccount",
    "capitalAndReserves",
  ];

  function showsNoActivity(accounts) {
    const { turnover, costs, profit } = accounts.profitAndLoss;
    const { currentYear, priorYear } = accounts.balanceSheet;
    return turnover === 0 && costs === 0 && profit === 0 && currentYear.profitAndLossAccount === priorYear.profitAndLossAccount;
  }

  function taxonomyText(suite) {
    const family = String(suite.family || "").replace("-", " ");
    const year = suite.date ? suite.date.slice(0, 4) : "";
    return [family, year && `${year} taxonomy`].filter(Boolean).join(" ");
  }

  // Reads an iXBRL accounts document for the regime the page takes. A document for another company or
  // another regime, or one the reader cannot read, fills nothing.
  // Several files, or a zip of them, are read as one set; one file is read on its own.
  async function mapIxbrlForPage(bundle, input, regime, expectedPeriod = {}) {
    const formNumber = (document.getElementById("formCompanyNumber")?.textContent || "").trim();
    const expect = { regime, ...(formNumber ? { companyNumber: formNumber } : {}), ...expectedPeriod };
    try {
      if (Array.isArray(input)) return (await bundle.readBookSources(input, { expect })).accounts;
      return bundle.mapIxbrlAccounts(input, expect);
    } catch (error) {
      if (Array.isArray(input)) throw refusedSet(error);
      throw new Refusal(`${withoutFinalStop(error.message)}. Nothing filled.`);
    }
  }

  // A set that cannot be read shows one failure message (title, cause, next step) and the card's status line.
  function refusedSet(error) {
    const cause = `${withoutFinalStop(error.message)}.`;
    if (typeof window.showFailure === "function") {
      const failure = new Error(cause);
      failure.failure = {
        cause,
        next: { label: "Choose the files again", href: window.location.pathname },
      };
      window.showFailure(failure, "Could not read the accounts files");
    }
    return new Refusal(`${cause} Nothing filled.`);
  }

  function ixbrlLeftOutText(mapped, formTakesProfitAndLoss) {
    const names = [...new Set(mapped.unmapped.map((fact) => fact.concept))];
    if (mapped.profitAndLoss && !formTakesProfitAndLoss) names.unshift("the profit and loss account");
    const notes = mapped.notes.map((note) => ` ${withoutFinalStop(note)}.`).join("");
    const leftOut = names.length > 0 ? ` The document also holds ${namedList(names)}, which this form has no field for.` : "";
    return notes + leftOut;
  }

  function ixbrlStatus(filled, fileName, mapped, advice, formTakesProfitAndLoss) {
    return (
      `Filled ${plural(filled, "field")} from ${fileName} (${taxonomyText(mapped.suite)}) for the period ${mapped.period.start} to ${mapped.period.end}.` +
      `${ixbrlLeftOutText(mapped, formTakesProfitAndLoss)} ${advice}`
    );
  }

  function takesIxbrl(kind) {
    return kind === "micro-entity-accounts" || kind === "small-company-accounts" || kind === "ct600";
  }

  // The CT600 form takes either regime from the document, and holds a period only once the customer or an earlier file has set it.
  async function fillCt600FromIxbrl({ bundle, source, fileName, hooks }) {
    const expectedPeriod = {};
    const heldStart = (document.getElementById("periodStart")?.value || "").trim();
    const heldEnd = (document.getElementById("periodEnd")?.value || "").trim();
    if (heldStart) expectedPeriod.periodStart = heldStart;
    if (heldEnd) expectedPeriod.periodEnd = heldEnd;
    const mapped = await mapIxbrlForPage(bundle, source.ixbrl, "any", expectedPeriod);
    const { formEntriesFromIxbrl, applyFormEntries } = await import("../lib/ct600-fields.js");
    const filled = applyFormEntries(formEntriesFromIxbrl(mapped));
    hooks.onFilled(undefined);
    return ixbrlStatus(
      filled,
      fileName,
      mapped,
      "Check the figures, add the UTR, the statements and the declaration, then preview.",
      mapped.regime === "small",
    );
  }

  const TRADING_STATUS_OPTION = { EntityHasNeverTraded: "neverTraded", EntityNoLongerTradingButTradedInPast: "noLongerTrading" };
  const SHARE_CLASS_OPTION = {
    OrdinaryShareClass1: "ordinaryShares",
    PreferenceShareClass1: "preferenceShares",
    DeferredShareClass1: "deferredShares",
    OtherShareClass1: "otherShares",
  };

  async function fillMicroEntityAccountsFromIxbrl({ bundle, source, fileName }) {
    const mapped = await mapIxbrlForPage(bundle, source.ixbrl, "micro");
    let filled = 0;
    setField("periodStart", mapped.period.start);
    setField("periodEnd", mapped.period.end);
    filled += 2;
    filled += setFigures("current", mapped.balanceSheet.currentYear, MICRO_BALANCE_SHEET_LINES);
    filled += setFigures("prior", mapped.balanceSheet.priorYear, MICRO_BALANCE_SHEET_LINES);
    if (typeof mapped.averageEmployees === "number") {
      setField("averageEmployees", String(mapped.averageEmployees));
      filled += 1;
    }
    const directorName = mapped.signer || mapped.directors[0];
    if (directorName) {
      setField("directorName", directorName);
      filled += 1;
    }
    setChecked("dormant", mapped.dormant);
    let advice = "Check them, add the date approved and the statements, then preview.";
    if (mapped.dormant) {
      const status = TRADING_STATUS_OPTION[mapped.tradingStatus];
      const shareClass = SHARE_CLASS_OPTION[mapped.shareNote?.shareClass];
      if (status) setField("dormantTradingStatus", status);
      if (shareClass) setField("shareClass", shareClass);
      if (typeof mapped.shareNote?.nominalValue === "number") setField("nominalValue", figureText(mapped.shareNote.nominalValue));
      advice = `The document is for a dormant company, so the dormant box is ticked: confirm the trading history, share class and nominal value. ${advice}`;
    }
    return ixbrlStatus(filled, fileName, mapped, advice, false);
  }

  async function fillMicroEntityAccounts({ bundle, source, fileName }) {
    if (source.ixbrl) return fillMicroEntityAccountsFromIxbrl({ bundle, source, fileName });
    let accounts;
    try {
      accounts = await bundle.microEntityAccountsFromBook(source.book, source.lines);
    } catch (error) {
      throw new Refusal(`${withoutFinalStop(error.message)}. Nothing filled.`);
    }
    refuseOtherCompany(accounts, fileName);
    let filled = 0;
    setField("periodStart", accounts.periodStart);
    setField("periodEnd", accounts.periodEnd);
    filled += 2;
    filled += setFigures("current", accounts.balanceSheet.currentYear, MICRO_BALANCE_SHEET_LINES);
    filled += setFigures("prior", accounts.balanceSheet.priorYear, MICRO_BALANCE_SHEET_LINES);
    setField("averageEmployees", String(accounts.averageNumberOfEmployees));
    filled += 1;
    if (accounts.directorName) {
      setField("directorName", accounts.directorName);
      filled += 1;
    }
    const dormant = showsNoActivity(accounts);
    if (dormant) setChecked("dormant", true);
    const dormantText = dormant
      ? " The book shows no turnover, no costs and no change in reserves, so the dormant box is ticked: confirm the company was dormant, then choose its trading history, share class and nominal value."
      : "";
    return `Filled ${plural(filled, "field")} from ${fileName} for the period ${accounts.periodStart} to ${accounts.periodEnd}. Check them, add the date approved and the statements, then preview.${dormantText}`;
  }

  const SMALL_PROFIT_AND_LOSS_LINES = {
    1: ["turnover", "costOfSales", "administrativeExpenses", "interestReceivable", "tax"],
    2: [
      "turnover",
      "changeInStocks",
      "ownWorkCapitalised",
      "otherOperatingIncome",
      "rawMaterialsConsumables",
      "otherExternalCharges",
      "staffCosts",
      "depreciation",
      "otherOperatingExpenses",
      "interestReceivable",
      "interestPayable",
      "tax",
    ],
  };

  function chosenProfitAndLossFormat() {
    return document.getElementById("profitAndLossFormat2")?.checked ? 2 : 1;
  }
  const SMALL_BALANCE_SHEET_LINES = [
    "fixedAssets",
    "stocks",
    "debtors",
    "cashAtBank",
    "tradeCreditors",
    "corporationTax",
    "otherCreditors",
    "creditorsAfterOneYear",
    "calledUpShareCapital",
    "profitAndLossAccount",
  ];
  const FIXED_ASSET_NOTE_LINES = [
    "costAtStart",
    "additions",
    "disposals",
    "depreciationAtStart",
    "depreciationCharge",
    "depreciationOnDisposals",
  ];

  async function fillSmallCompanyAccountsFromIxbrl({ bundle, source, fileName }) {
    const mapped = await mapIxbrlForPage(bundle, source.ixbrl, "small");
    const { currentYear, priorYear } = mapped.balanceSheet;
    let filled = 0;
    setField("periodStart", mapped.period.start);
    setField("periodEnd", mapped.period.end);
    filled += 2;
    setChecked(mapped.filleted ? "copyFilleted" : "copyFull", true);
    const profitAndLossFormat = mapped.profitAndLoss?.format === 2 ? 2 : 1;
    setChecked(profitAndLossFormat === 2 ? "profitAndLossFormat2" : "profitAndLossFormat1", true);
    if (mapped.profitAndLoss) {
      filled += setFigures("current", mapped.profitAndLoss.currentYear, SMALL_PROFIT_AND_LOSS_LINES[profitAndLossFormat]);
    }
    filled += setFigures("current", currentYear, SMALL_BALANCE_SHEET_LINES);
    const hasPrior = Object.keys(priorYear).length > 0;
    if (hasPrior) {
      setChecked("includeComparatives", true);
      filled += setFigures("prior", priorYear, SMALL_BALANCE_SHEET_LINES);
      if (mapped.profitAndLoss && !mapped.filleted)
        filled += setFigures("prior", mapped.profitAndLoss.priorYear, SMALL_PROFIT_AND_LOSS_LINES[profitAndLossFormat]);
    }
    const noteClasses = Object.entries(mapped.fixedAssetNote || {});
    if (noteClasses.length > 0) {
      setChecked("includeFixedAssetNote", true);
      noteClasses.forEach(([className, figures]) => {
        filled += setFigures("note" + upperFirst(className), figures, FIXED_ASSET_NOTE_LINES);
      });
    }
    if (typeof mapped.averageEmployees === "number") {
      setField("averageEmployees", String(mapped.averageEmployees));
      filled += 1;
    }
    if (mapped.principalActivity) {
      setField("principalActivity", mapped.principalActivity);
      filled += 1;
    }
    if (mapped.directors.length > 0) {
      setField("directors", mapped.directors.join("\n"));
      filled += 1;
    }
    if (mapped.signer) {
      setField("directorName", mapped.signer);
      filled += 1;
    }
    return ixbrlStatus(
      filled,
      fileName,
      mapped,
      "Check the figures, add the accounting policies, the date approved and the statements, then preview.",
      true,
    );
  }

  async function fillSmallCompanyAccounts({ bundle, source, fileName }) {
    if (source.ixbrl) return fillSmallCompanyAccountsFromIxbrl({ bundle, source, fileName });
    let accounts;
    try {
      accounts = await bundle.smallCompanyAccountsFromBook(source.book, source.lines);
    } catch (error) {
      throw new Refusal(`${withoutFinalStop(error.message)}. Nothing filled.`);
    }
    refuseOtherCompany(accounts, fileName);
    let filled = 0;
    setField("periodStart", accounts.periodStart);
    setField("periodEnd", accounts.periodEnd);
    filled += 2;
    const profitAndLossFormat = chosenProfitAndLossFormat();
    const bookProfitAndLoss = profitAndLossFormat === 2 ? accounts.profitAndLossFormat2 : accounts.profitAndLoss;
    filled += setFigures("current", bookProfitAndLoss.currentYear, SMALL_PROFIT_AND_LOSS_LINES[profitAndLossFormat]);
    filled += setFigures("current", accounts.balanceSheet.currentYear, SMALL_BALANCE_SHEET_LINES);
    const noteClasses = Object.entries(accounts.fixedAssetNote || {});
    if (noteClasses.length > 0) {
      setChecked("includeFixedAssetNote", true);
      noteClasses.forEach(([className, figures]) => {
        filled += setFigures("note" + upperFirst(className), figures, FIXED_ASSET_NOTE_LINES);
      });
    }
    setField("averageEmployees", String(accounts.averageNumberOfEmployees));
    filled += 1;
    if (accounts.directors.length > 0) {
      setField("directors", accounts.directors.join("\n"));
      filled += 1;
    }
    if (accounts.directorName) {
      setField("directorName", accounts.directorName);
      filled += 1;
    }
    return `Filled ${plural(filled, "field")} from ${fileName} for the period ${accounts.periodStart} to ${accounts.periodEnd}. The book holds no prior year profit and loss account, so the prior year is yours to add. Check the figures, add the principal activity, the accounting policies, the date approved and the statements, then preview.`;
  }

  const HANDOFF_KEY = "booksHandoff";
  const MAX_HANDOFF_TEXT = 200;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const TAX_YEAR = /^\d{4}-\d{2}$/;
  const FIGURE_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

  class HandoffProblem extends Error {}

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function requireText(value, label) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_HANDOFF_TEXT) {
      throw new HandoffProblem(`${label} is missing or not text`);
    }
    return value;
  }

  function requireDate(value, label) {
    const text = requireText(value, label);
    if (!ISO_DATE.test(text) || Number.isNaN(Date.parse(text))) throw new HandoffProblem(`${label} is not a date`);
    return text;
  }

  function requireTaxYear(value, label) {
    const text = requireText(value, label);
    if (!TAX_YEAR.test(text)) throw new HandoffProblem(`${label} is not a tax year like 2025-26`);
    return text;
  }

  // Copies the numbers of a figures object. isKnownName decides which names the form can take.
  function requireFigures(value, label, isKnownName) {
    if (!isPlainObject(value)) throw new HandoffProblem(`${label} is missing`);
    const copy = {};
    Object.entries(value).forEach(([name, figure]) => {
      if (!isKnownName(name)) throw new HandoffProblem(`${label} names ${JSON.stringify(name.slice(0, 40))}, which the form does not have`);
      if (typeof figure !== "number" || !Number.isFinite(figure)) throw new HandoffProblem(`${label} ${name} is not a number`);
      copy[name] = figure;
    });
    return copy;
  }

  function parseVatHandoff(period, figures) {
    const periodStart = requireDate(period.periodStart, "the period start");
    const periodEnd = requireDate(period.periodEnd, "the period end");
    const boxes = requireFigures(figures, "the VAT figures", (name) => VAT_BOX_FIELDS.includes(name));
    VAT_BOX_FIELDS.forEach((name) => {
      if (!(name in boxes)) throw new HandoffProblem(`the VAT figures carry no ${name}`);
    });
    return { period: { periodStart, periodEnd }, figures: boxes };
  }

  function parseQuarterlyHandoff(period, figures) {
    const { ITEMISED_FIELDS } = window.selfEmploymentExpenses;
    const itemisedIds = ITEMISED_FIELDS.map((field) => field.id);
    if (!isPlainObject(figures)) throw new HandoffProblem("the quarterly figures are missing");
    return {
      period: {
        taxYear: requireTaxYear(period.taxYear, "the tax year"),
        periodStartDate: requireDate(period.periodStartDate, "the period start date"),
        periodEndDate: requireDate(period.periodEndDate, "the period end date"),
      },
      figures: {
        periodIncome: requireFigures(figures.periodIncome, "the income figures", (name) => name === "turnover" || name === "other"),
        periodExpenses: requireFigures(figures.periodExpenses, "the expense figures", (name) => itemisedIds.includes(name)),
        periodDisallowableExpenses: requireFigures(figures.periodDisallowableExpenses ?? {}, "the disallowable expense figures", (name) =>
          /^[a-z][A-Za-z]*Disallowable$/.test(name),
        ),
      },
    };
  }

  function parseAnnualHandoff(period, figures) {
    if (!isPlainObject(figures)) throw new HandoffProblem("the annual figures are missing");
    return {
      period: { taxYear: requireTaxYear(period.taxYear, "the tax year") },
      figures: {
        allowances: requireFigures(figures.allowances ?? {}, "the allowances", (name) => FIGURE_NAME.test(name)),
        adjustments: requireFigures(figures.adjustments ?? {}, "the adjustments", (name) => FIGURE_NAME.test(name)),
      },
    };
  }

  const HANDOFF_PARSERS = { "vat": parseVatHandoff, "itsa-quarterly": parseQuarterlyHandoff, "itsa-annual": parseAnnualHandoff };

  // The figures a DIYA-GL page sent, validated: known kind, dates and tax years in their forms,
  // only numbers, only names the form has. Throws a HandoffProblem naming the first fault.
  function parseHandoff(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new HandoffProblem("the figures are not JSON");
    }
    if (!isPlainObject(parsed)) throw new HandoffProblem("the figures are not an object");
    const parser = HANDOFF_PARSERS[parsed.kind];
    if (!parser)
      throw new HandoffProblem(`the kind of filing ${JSON.stringify(String(parsed.kind).slice(0, 40))} is not one this site fills`);
    if (!isPlainObject(parsed.period)) throw new HandoffProblem("the period is missing");
    return {
      kind: parsed.kind,
      sourceFileName: requireText(parsed.sourceFileName, "the source file name"),
      packageVersion: requireText(parsed.packageVersion, "the package version"),
      ...parser(parsed.period, parsed.figures),
    };
  }

  function applyVatHandoff(handoff) {
    VAT_BOX_FIELDS.forEach((id) => setField(id, figureText(handoff.figures[id])));
    setField("periodStart", handoff.period.periodStart);
    setField("periodEnd", handoff.period.periodEnd);
    return `Filled the nine boxes from ${handoff.sourceFileName} for the period ${handoff.period.periodStart} to ${handoff.period.periodEnd}. Check them, then submit.`;
  }

  function applyQuarterlyHandoff(handoff) {
    const { taxYear, periodStartDate, periodEndDate } = handoff.period;
    setField("taxYear", taxYear);
    setField("periodStartDate", periodStartDate);
    setField("periodEndDate", periodEndDate);
    return applyQuarterlyFigures(handoff.figures, handoff.sourceFileName, periodEndDate);
  }

  function applyAnnualHandoff(handoff, hooks) {
    const formTaxYear = hooks.taxYear();
    if (formTaxYear !== handoff.period.taxYear) {
      throw new Refusal(`${handoff.sourceFileName} is for ${handoff.period.taxYear}; this form is for ${formTaxYear}. Nothing imported.`);
    }
    return applyAnnualFigures({ taxYear: handoff.period.taxYear, ...handoff.figures }, handoff.sourceFileName, hooks);
  }

  // JSON that is the figures file and not a book: null when it is anything else, so the book reader answers.
  function parseCt600Figures(text) {
    try {
      const parsed = JSON.parse(text);
      return isPlainObject(parsed) && parsed.kind === "ct600" ? parsed : null;
    } catch {
      return null;
    }
  }

  const FILLERS = {
    "vat": { fill: fillVat, applyHandoff: applyVatHandoff, watched: ["periodStart", "periodEnd"] },
    "itsa-quarterly": { fill: fillItsaQuarterly, applyHandoff: applyQuarterlyHandoff, watched: ["taxYear", "periodEndDate"] },
    "itsa-annual": { fill: fillItsaAnnual, applyHandoff: applyAnnualHandoff, watched: [] },
    "uk-property-period": { fill: fillUkPropertyPeriod, watched: ["fromDate", "toDate"] },
    "uk-property-annual": { fill: fillUkPropertyAnnual, watched: [] },
    "ct600": { fill: fillCt600, watched: [] },
    "micro-entity-accounts": { fill: fillMicroEntityAccounts, watched: [] },
    "small-company-accounts": { fill: fillSmallCompanyAccounts, watched: [] },
  };

  function element(tag, attributes = {}, text = "") {
    const created = document.createElement(tag);
    Object.entries(attributes).forEach(([name, value]) => created.setAttribute(name, value));
    if (text) created.textContent = text;
    return created;
  }

  function mount(container, options) {
    const { kind } = options;
    const filler = FILLERS[kind];
    if (!container || !filler) throw new Error(`booksImport.mount: unknown kind ${kind}`);

    const heading = element("h2", { id: "booksImportHeading" }, "Fill from your books");
    const hint = element(
      "p",
      { id: "booksImportHint", class: "hint" },
      "Drop your DIYA-GL book, spreadsheets workbook or package zip here, or choose a file. It is read in this browser and never uploaded; " +
        "only the figures you file are sent." +
        (takesIxbrl(kind)
        ? " An iXBRL accounts document (.xhtml) fills the same form. A set of iXBRL documents fills it too: choose all its files together, or one zip."
        : ""),
    );
    const dropZone = element("div", { "id": "booksImportDrop", "class": "books-import-drop", "aria-describedby": "booksImportHint" });
    const chooseButton = element("button", { type: "button", id: "booksImportChoose", class: "secondary-button" }, "Choose a file");
    const dropText = element("span", {}, "Drop a book here");
    dropZone.append(dropText, chooseButton);
    const fileInput = element("input", {
      type: "file",
      id: "booksImportFile",
      name: "booksImportFile",
      accept: takesIxbrl(kind) ? ACCEPTED_ACCOUNTS_FILES : ACCEPTED_FILES,
      ...(takesIxbrl(kind) ? { multiple: "" } : {}),
      class: "books-import-file",
      tabindex: "-1",
      hidden: "",
    });
    const statusLine = element("p", {
      "id": "booksImportStatus",
      "class": "hint books-import-status",
      "role": "status",
      "aria-live": "polite",
    });
    const section = element("section", { "class": "books-import", "aria-labelledby": "booksImportHeading" });
    section.append(heading, hint, dropZone, fileInput, statusLine);
    container.replaceChildren(section);

    let loaded = null;
    let working = false;

    function say(text) {
      statusLine.textContent = text;
    }

    async function fillFromLoaded() {
      const bundle = await loadBundle();
      return filler.fill({ bundle, source: loaded.source, fileName: loaded.fileName, hooks: options });
    }

    async function refill() {
      if (!loaded || working) return;
      working = true;
      try {
        say(await fillFromLoaded());
      } catch (error) {
        say(error instanceof Refusal ? error.message : `Could not fill from ${loaded.fileName}: ${withoutFinalStop(error.message)}.`);
      } finally {
        working = false;
      }
    }

    // Several files, or one zip, of iXBRL documents are one set. The reader refuses a set that mixes
    // companies, periods or facts, and the refusal shows as one failure message.
    async function readSet(bundle, files) {
      const documents = await Promise.all(files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
      let read;
      try {
        read = await bundle.readBookSources(documents);
      } catch (error) {
        if (error && error.name === "IxbrlError") throw refusedSet(error);
        throw error;
      }
      return read.accounts ? { source: { ixbrl: documents } } : { source: read };
    }

    async function readFile(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const startsLikeJson = bytes[0] === 0x7b || /\.json$/i.test(file.name);
      if (kind === "itsa-annual" && startsLikeJson) {
        const text = new TextDecoder().decode(bytes);
        let document;
        try {
          document = JSON.parse(text);
        } catch {
          throw new FileProblem("the file is not JSON");
        }
        if (!document || typeof document !== "object" || Array.isArray(document) || !("book" in document)) {
          return { figures: parseDerivedFigures(text) };
        }
      }
      if (kind === "ct600" && startsLikeJson) {
        const parsed = parseCt600Figures(new TextDecoder().decode(bytes));
        if (parsed) return { ct600Figures: parsed };
      }
      const bundle = await loadBundle();
      if (takesIxbrl(kind) && IXBRL_FILE_NAME.test(file.name)) {
        return { source: { ixbrl: bytes } };
      }
      if (takesIxbrl(kind) && ZIP_FILE_NAME.test(file.name)) return readSet(bundle, [file]);
      return { source: await bundle.readBookSource(bytes, file.name) };
    }

    async function readFiles(files) {
      if (files.length === 1) return readFile(files[0]);
      if (!takesIxbrl(kind)) throw new FileProblem("this page reads one book at a time; drop one file");
      return readSet(await loadBundle(), files);
    }

    function namesOf(files) {
      return files.length <= 3 ? files.map((file) => file.name).join(", ") : `${files.length} files`;
    }

    async function handleFiles(fileList) {
      const files = Array.from(fileList || []);
      if (files.length === 0 || working) return;
      const file = { name: namesOf(files) };
      working = true;
      loaded = null;
      say(`Reading ${file.name}...`);
      try {
        const read = await readFiles(files);
        if (read.figures) {
          say(applyAnnualFigures(read.figures, file.name, options));
        } else if (read.ct600Figures) {
          say(await applyCt600Figures(read.ct600Figures, file.name, options));
        } else {
          loaded = { source: read.source, fileName: file.name };
          say(await fillFromLoaded());
        }
      } catch (error) {
        say(error instanceof Refusal ? error.message : `Could not import ${file.name}: ${withoutFinalStop(error.message)}.`);
      } finally {
        working = false;
        fileInput.value = "";
      }
    }

    // Figures a DIYA-GL page sent: kept through sign-in in sessionStorage, filled once the
    // customer is signed in, and dropped from storage once used or refused.
    function applyPendingHandoff() {
      const stored = sessionStorage.getItem(HANDOFF_KEY);
      if (!stored) return;
      let handoff;
      try {
        const keptFragment = JSON.parse(stored);
        if (keptFragment.problem) throw new HandoffProblem(keptFragment.problem);
        handoff = parseHandoff(keptFragment.text);
      } catch (error) {
        if (!(error instanceof HandoffProblem)) throw error;
        sessionStorage.removeItem(HANDOFF_KEY);
        say(`The figures sent from your books could not be used: ${error.message}. Nothing filled.`);
        return;
      }
      if (handoff.kind !== kind) return;
      if (!localStorage.getItem("cognitoIdToken")) {
        say(`Sign in and the figures from ${handoff.sourceFileName} fill this form.`);
        return;
      }
      if (kind === "itsa-annual" && !options.taxYear()) {
        say(`Load the annual submission for ${handoff.period.taxYear} and the figures from ${handoff.sourceFileName} fill the form.`);
        return;
      }
      try {
        say(filler.applyHandoff(handoff, options));
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        say(error.message);
      } finally {
        sessionStorage.removeItem(HANDOFF_KEY);
      }
    }
    mountedCard = { applyPendingHandoff };
    applyPendingHandoff();

    // The Drive button exists only where the page's environment carries the Drive configuration.
    async function offerDrive() {
      if (!window.envReady) return;
      let driveConfig;
      let drivePicker;
      try {
        const env = await window.envReady;
        drivePicker = await loadDrivePicker();
        driveConfig = drivePicker.driveConfig(env);
      } catch {
        return;
      }
      if (!driveConfig) return;
      const driveButton = element(
        "button",
        { type: "button", id: "booksImportDrive", class: "secondary-button" },
        "Choose from Google Drive",
      );
      dropZone.append(driveButton);
      let choosing = false;
      driveButton.addEventListener("pointerenter", () => drivePicker.preload());
      driveButton.addEventListener("focus", () => drivePicker.preload());
      driveButton.addEventListener("click", async () => {
        if (choosing || working) return;
        choosing = true;
        driveButton.disabled = true;
        say("Waiting for Google Drive...");
        try {
          const token = await drivePicker.connect(driveConfig);
          const picked = await drivePicker.pick(driveConfig, token);
          if (!picked) {
            say("");
            return;
          }
          if (picked.mimeType === drivePicker.GOOGLE_SHEET_MIME_TYPE) {
            say(
              `Could not import ${picked.name}: it is a Google Sheet. Choose the DIYA-GL book, the spreadsheets workbook (.xlsx) or the package zip instead.`,
            );
            return;
          }
          say(`Reading ${picked.name}...`);
          await handleFiles([await drivePicker.download(picked, token)]);
        } catch (error) {
          say(`Could not open Google Drive: ${withoutFinalStop(error.message)}.`);
        } finally {
          choosing = false;
          driveButton.disabled = false;
        }
      });
    }
    offerDrive();

    chooseButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => handleFiles(fileInput.files));
    ["dragenter", "dragover"].forEach((name) =>
      dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        dropZone.classList.add("books-import-drop--over");
      }),
    );
    ["dragleave", "drop"].forEach((name) =>
      dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        dropZone.classList.remove("books-import-drop--over");
      }),
    );
    dropZone.addEventListener("drop", (event) => handleFiles(event.dataTransfer && event.dataTransfer.files));

    filler.watched.forEach((id) => {
      const watchedField = document.getElementById(id);
      if (!watchedField) return;
      watchedField.addEventListener("change", refill);
      watchedField.addEventListener("input", refill);
    });
  }

  // The annual page calls this once its tax year has loaded, so figures that waited fill then.
  function applyPendingHandoff() {
    if (mountedCard) mountedCard.applyPendingHandoff();
  }

  window.booksImport = { mount, parseHandoff, applyPendingHandoff };
})();
