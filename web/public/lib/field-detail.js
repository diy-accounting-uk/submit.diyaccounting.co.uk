// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/field-detail.js
// What a form field says about itself: its label led by its reference ("Box 155", "Balance sheet
// item C"), its note with a link to the source of its term, and the "In DIY Accounting's
// spreadsheets" disclosure, which names the workbook cells that hold the figure and shows a picture
// of each. The fields come from ct600-fields.js, where each carries its register entry.

import { boxRow, guideUrl } from "./ct600-fields.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

function create(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

export const SOURCE_IMAGE_DIRECTORY = "/images/ct600-sources";

// The reference of a field with no box, from the register's code: the first code it names.
const REFERENCE_PATTERNS = [
  [/^CT600A (A\d+)/, ([, box]) => siteText("field.reference-ct600a", "CT600A {box}", { box })],
  [/μ?BS1 ([A-Z][A-Z.\d]*)/, ([, item]) => siteText("field.reference-balance-sheet", "Balance sheet item {item}", { item })],
  [/μ?PL1? (\w+)/, ([, item]) => siteText("field.reference-profit-and-loss", "Profit and loss item {item}", { item })],
  [/\bR, note (\d+)/, ([, note]) => siteText("field.reference-balance-sheet-note", "Balance sheet note {note}", { note })],
  [/^CA (\d+[A-Z]?)/, ([, section]) => siteText("field.reference-companies-act", "Companies Act section {section}", { section })],
  [/^R(\d+)/, ([, paragraph]) => siteText("field.reference-regulations", "Schedule 1 paragraph {paragraph}", { paragraph })],
  [/^Computations?\b/, () => siteText("field.reference-computations", "Computations")],
  [/^Notes$/, () => siteText("field.reference-notes", "Notes to the accounts")],
  [/^Declaration$/, () => siteText("field.reference-declaration", "Declaration")],
  [/^Accounts and computations$/, () => siteText("field.reference-accounts-and-computations", "Accounts and computations")],
  [/\b[Bb]oxes (\d+ (?:and|or) \d+)/, ([, boxes]) => siteText("field.reference-boxes", "Boxes {boxes}", { boxes })],
  [/\b[Bb]ox (\d+ or \d+|\d+)/, ([, box]) => siteText("field.reference-box", "Box {box}", { box })],
];

/** The reference that leads a field's label: its box, or the item, section or page the register names. */
export function referenceText(field) {
  if (field.box !== undefined) return siteText("field.reference-box", "Box {box}", { box: field.box });
  for (const [pattern, text] of REFERENCE_PATTERNS) {
    const match = pattern.exec(field.reference ?? "");
    if (match) return text(match);
  }
  throw new Error(`No reference text for ${field.id}: ${field.reference}`);
}

/** The label led by its reference; a label that already names its box number, in either language, keeps its words. */
export function labelWithReference(field) {
  if (field.box !== undefined && new RegExp(`(^|\\D)${field.box}(\\D|$)`).test(field.label)) return field.label;
  return siteText("field.reference-label", "{reference}: {label}", { reference: referenceText(field), label: field.label });
}

const COMPANIES_ACT = /^https:\/\/www\.legislation\.gov\.uk\/ukpga\/2006\/46\/section\/(\w+)$/;
const REGULATIONS = /^https:\/\/www\.legislation\.gov\.uk\/uksi\/2008\/409\/schedule\/1\/(?:paragraph\/(\d+)|part\/1)$/;

/** Where a field's term comes from: the guide at the box's anchor, or the field's termSource. */
export function sourceLinkOf(field) {
  if (field.box !== undefined) {
    const anchor = boxRow(field.box)?.anchor;
    return anchor ? { href: guideUrl(anchor), text: siteText("ch.ct.guide-link", "Company Tax Return guide") } : null;
  }
  const href = field.termSource;
  if (!href) return null;
  if (href.startsWith("https://www.gov.uk/guidance/the-company-tax-return-guide")) {
    return { href, text: siteText("ch.ct.guide-link", "Company Tax Return guide") };
  }
  if (href.startsWith("https://www.gov.uk/guidance/supplementary-pages-ct600a")) {
    return { href, text: siteText("field.source-ct600a-guide", "CT600A guide") };
  }
  if (href.startsWith("https://www.gov.uk/government/publications/life-of-a-company-annual-requirements")) {
    return { href, text: siteText("field.source-life-of-a-company", "Life of a company: accounts") };
  }
  const section = COMPANIES_ACT.exec(href);
  if (section)
    return { href, text: siteText("field.source-companies-act", "Companies Act 2006, section {section}", { section: section[1] }) };
  const regulations = REGULATIONS.exec(href);
  if (regulations) {
    return {
      href,
      text: regulations[1]
        ? siteText("field.source-regulations-paragraph", "The accounts regulations, Schedule 1, paragraph {paragraph}", {
            paragraph: regulations[1],
          })
        : siteText("field.source-regulations", "The accounts regulations, Schedule 1"),
    };
  }
  throw new Error(`No link text for ${field.id}: ${href}`);
}

/** The note under a label: the hint, then the link to the term's source, marked as English for a Welsh reader. */
export function noteOf(field, id = field.id) {
  const note = create("p", { id: `${id}-hint`, class: "hint" }, field.hint ?? "");
  const link = sourceLinkOf(field);
  if (!field.hint && !link) note.hidden = true;
  if (link) {
    // The sources are in English only, so a Welsh reader is told before following the link.
    const inEnglish = globalThis.siteLanguage?.chrome?.() === "cy" ? [" ", create("span", { class: "lang-mark" }, "(yn Saesneg)")] : [];
    note.append(field.hint ? " " : "", create("a", { href: link.href, target: "_blank", rel: "noopener" }, link.text), ...inEnglish, ".");
  }
  return note;
}

/**
 * The cells of a sheetCell: `File.xlsx!Sheet!F16+F44-E43`, or cells on other sheets each with its
 * own file and sheet. Each cell carries its sign.
 */
export function parseSheetCells(value) {
  const cells = [];
  let file;
  let sheet;
  for (const [, sign, reference] of String(value).matchAll(/([+-]?)([^+-]+)/g)) {
    const parts = reference.split("!");
    if (parts.length === 3) [file, sheet] = parts;
    else if (parts.length !== 1 || !sheet) throw new Error(`Not a sheetCell: ${value}`);
    cells.push({ sign: sign || "+", file, sheet, cell: parts.at(-1) });
  }
  return cells;
}

/** A cell's picture, cut from the published workbook. */
export function sourceImagePath({ sheet, cell }) {
  return `${SOURCE_IMAGE_DIRECTORY}/${sheet}-${cell}.webp`;
}

function cellsText(cells) {
  const oneSheet = new Set(cells.map(({ sheet }) => sheet)).size === 1;
  return cells
    .map(({ sign, sheet, cell }, index) => {
      const name = oneSheet ? cell : `${sheet}!${cell}`;
      if (index === 0) return sign === "-" ? `− ${name}` : name;
      return `${sign === "-" ? "−" : "+"} ${name}`;
    })
    .join(" ");
}

function term(list, title, ...value) {
  list.append(create("dt", {}, title), create("dd", {}, ...value));
}

/** The rows a disclosure lists by default: this year's cells and last year's. */
function sourceRowsOf(source) {
  return [
    source.thisYear && { title: siteText("field.source-this-year", "This year"), value: source.thisYear },
    source.lastYear && { title: siteText("field.source-last-year", "Last year"), value: source.lastYear },
  ].filter(Boolean);
}

/**
 * The closed "In DIY Accounting's spreadsheets" disclosure: the file, the sheet and the cells for
 * each year, the sum when there is one, the workbook's label, the difference note and a picture of
 * each cell.
 * @param {object} field - a field with its register entry
 * @param {{id?: string, rows?: Array<{title: string, value: string}>}} [options]
 */
export function sourceDisclosure(field, { id = field.id, rows } = {}) {
  const source = field.source ?? (field.box !== undefined ? boxRow(field.box)?.source : undefined);
  const details = create("details", { "class": "field-source", "id": `${id}-source`, "data-source-of": field.id });
  details.append(create("summary", {}, siteText("field.source-summary", "In DIY Accounting's spreadsheets")));
  if (!source) {
    details.append(create("p", {}, siteText("field.source-none", "The spreadsheets have no cell for this.")));
    return details;
  }
  const listed = (rows ?? sourceRowsOf(source)).map((row) => ({ ...row, cells: parseSheetCells(row.value) }));
  const all = listed.flatMap(({ cells }) => cells);
  const list = create("dl", { class: "field-source__cells" });
  if (all.length) {
    term(list, siteText("field.source-file", "File"), [...new Set(all.map(({ file }) => file))].join(", "));
    term(list, siteText("field.source-sheet", "Sheet"), [...new Set(all.map(({ sheet }) => sheet))].join(", "));
  }
  for (const row of listed) {
    const text = cellsText(row.cells);
    term(list, row.title, row.cells.length > 1 ? siteText("field.source-sum", "{cells} (worked from these cells)", { cells: text }) : text);
  }
  if (source.workbookLabel) {
    const labelCell = source.labelCell ? parseSheetCells(source.labelCell)[0] : null;
    term(
      list,
      siteText("field.source-workbook-label", "The spreadsheet's label"),
      labelCell
        ? siteText("field.source-workbook-label-in", "{label} (in {cell})", { label: source.workbookLabel, cell: labelCell.cell })
        : source.workbookLabel,
    );
  }
  details.append(list);
  if (source.differenceNote) details.append(create("p", { class: "field-source__note" }, source.differenceNote));
  const pictured = new Set();
  for (const cell of all) {
    const path = sourceImagePath(cell);
    if (pictured.has(path)) continue;
    pictured.add(path);
    details.append(
      create("img", {
        src: path,
        alt: siteText("field.source-image-alt", "The {sheet} sheet at cell {cell}", { sheet: cell.sheet, cell: cell.cell }),
        loading: "lazy",
        class: "field-source__image",
      }),
    );
  }
  return details;
}

/** Whether a field carries a register entry to disclose. */
export function hasRegisterEntry(field) {
  return field.box !== undefined || field.reference !== undefined;
}
