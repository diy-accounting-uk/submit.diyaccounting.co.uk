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
// The annual card also accepts the derived-figures JSON the diya-submit MCP tool
// derive_itsa_annual_submission writes.
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
  const PERIOD_PROBE_END = "1900-01-01";
  const MAX_UNMAPPED_SHOWN = 12;

  let bundlePromise = null;
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
    Object.entries(period.periodDisallowableExpenses || {}).forEach(([name, value]) => {
      if (typeof value === "number" && value !== 0) lacking.push(`${name} (disallowable) ${poundsText(value)}`);
    });
    return lacking;
  }

  // Every itemised expense field takes the book's figure, or its starting value when the book
  // has none, and the total-expenses field is cleared because HMRC takes one or the other.
  function fillExpenseFields(periodExpenses) {
    const { ITEMISED_FIELDS, CONSOLIDATED_FIELD } = window.selfEmploymentExpenses;
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
    const filledExpenses = fillExpenseFields(period.periodExpenses);
    const lacking = figuresTheFormLacks(period);
    const lackingText = lacking.length ? ` The form has no field for these figures from the book: ${namedList(lacking)}.` : "";
    return `Filled ${2 + filledExpenses} figures from ${fileName} for the period ending ${periodEnd}. Check them, then submit.${lackingText}`;
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

  const FILLERS = {
    "vat": { fill: fillVat, applyHandoff: applyVatHandoff, watched: ["periodStart", "periodEnd"] },
    "itsa-quarterly": { fill: fillItsaQuarterly, applyHandoff: applyQuarterlyHandoff, watched: ["taxYear", "periodEndDate"] },
    "itsa-annual": { fill: fillItsaAnnual, applyHandoff: applyAnnualHandoff, watched: [] },
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
        "only the figures you file are sent.",
    );
    const dropZone = element("div", { "id": "booksImportDrop", "class": "books-import-drop", "aria-describedby": "booksImportHint" });
    const chooseButton = element("button", { type: "button", id: "booksImportChoose", class: "secondary-button" }, "Choose a file");
    const dropText = element("span", {}, "Drop a book here");
    dropZone.append(dropText, chooseButton);
    const fileInput = element("input", {
      type: "file",
      id: "booksImportFile",
      name: "booksImportFile",
      accept: ACCEPTED_FILES,
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
      const bundle = await loadBundle();
      return { source: await bundle.readBookSource(bytes, file.name) };
    }

    async function handleFile(file) {
      if (!file || working) return;
      working = true;
      loaded = null;
      say(`Reading ${file.name}...`);
      try {
        const read = await readFile(file);
        if (read.figures) {
          say(applyAnnualFigures(read.figures, file.name, options));
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

    chooseButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => handleFile(fileInput.files && fileInput.files[0]));
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
    dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer && event.dataTransfer.files[0]));

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
