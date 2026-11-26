#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CT-LBL5 Screenshots of the workbook cells behind the CT600 form
// - **Use when:** the CT600 table in ct600-fields.js names a new or moved workbook cell, or the published package changed, and the page's "In DIY Accounting's spreadsheets" disclosure needs its pictures.
// - **Does:** ct600-source-shots.mjs reads the published package's Financialaccounts.xlsx with the diya-gl workbook reader, checks that each single cell's row (or its label cell's row) holds the entry's workbookLabel, draws the rows around the cell as a grid with the sheet's own column letters, row numbers and labels, marks the cell, takes a PNG with Playwright and writes a WebP with ffmpeg-static to web/public/images/ct600-sources/<sheet>-<cell>.webp. It fails on a label that is missing.
// - **Run:** `npm run ct600:source-shots`; `npm run ct600:source-shots -- --package <package directory>`
// - **Entry:** `scripts/ct600-source-shots.mjs`
// - **Files:** scripts/ct600-source-shots.mjs, web/public/lib/ct600-source-cells.js, web/public/lib/ct600-fields.js, web/unit-tests/ct600SourceCells.test.js, web/public/images/ct600-sources/
// - **Keywords:** ct600, workbook cell, screenshot, source, label check, webp, spreadsheets disclosure
// - **Related:** OPS-139
// @end-capability

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { resolveFfmpegBinary } from "./lib/video/encode.js";
import { namedCells, cellsOfReference, sourceImageName, allSources } from "../web/public/lib/ct600-source-cells.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const READER_PATH = path.join(repositoryRoot, "node_modules/@diy-accounting-uk/diya-gl/dist/app/lib/xlsx-reader.js");
export const DEFAULT_PACKAGE_DIRECTORY =
  "/Users/antony/projects/diy-accounting-limited/spreadsheets.diyaccounting.co.uk/packages/GB Accounts Company 2026-03-31 (Mar26) Excel 2007";
export const OUTPUT_DIRECTORY = path.join(repositoryRoot, "web/public/images/ct600-sources");

const ROWS_ABOVE = 3;
const ROWS_BELOW = 3;
const LAST_COLUMN_INDEX = 52; // BA
const MAX_COLUMNS = 9;
const IMAGE_WIDTH = 980;
const WEBP_QUALITY = 82;

export function columnLetters(index) {
  let letters = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function columnIndex(letters) {
  let n = 0;
  for (const character of letters) n = n * 26 + (character.charCodeAt(0) - 64);
  return n - 1;
}

export function splitCell(cell) {
  const match = /^([A-Z]+)(\d+)$/.exec(cell);
  return { column: columnIndex(match[1]), row: Number(match[2]) };
}

function normalise(text) {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase();
}

// A label ending in an ellipsis stands for the start of a longer sentence in the workbook.
export function labelFoundIn(label, cellTexts) {
  const wanted = normalise(label.replace(/\s*…$/, ""));
  return cellTexts.some((text) => text !== null && text !== undefined && normalise(text).includes(wanted));
}

function showValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return String(Math.round(value * 10000) / 10000);
  const text = String(value);
  if (/^-?\d+\.\d{5,}$/.test(text)) return String(Math.round(Number(text) * 10000) / 10000);
  return text.length > 70 ? `${text.slice(0, 67)}...` : text;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The cell references to read on one sheet: the rows around each named cell, the label cell's row, all columns.
export function readsFor(cells) {
  const reads = {};
  for (const { sheet, cell, uses } of cells) {
    const rows = new Set();
    const { row } = splitCell(cell);
    for (let r = Math.max(1, row - ROWS_ABOVE); r <= row + ROWS_BELOW; r += 1) rows.add(r);
    for (const use of uses) if (use.labelCell) rows.add(splitCell(cellsOfReference(use.labelCell)[0].cell).row);
    reads[sheet] = reads[sheet] || new Set();
    for (const r of rows) for (let c = 0; c <= LAST_COLUMN_INDEX; c += 1) reads[sheet].add(`${columnLetters(c)}${r}`);
  }
  return Object.fromEntries(Object.entries(reads).map(([sheet, refs]) => [sheet, [...refs]]));
}

export function rowTexts(values, sheet, row) {
  const texts = [];
  for (let c = 0; c <= LAST_COLUMN_INDEX; c += 1) texts.push(values[sheet]?.[`${columnLetters(c)}${row}`]);
  return texts;
}

// Fails with one message per cell whose row does not hold its label.
export function labelFailures(cells, values) {
  const failures = [];
  for (const { file, sheet, cell, uses } of cells) {
    for (const use of uses) {
      if (use.isSum || !use.workbookLabel) continue;
      const labelRow = use.labelCell ? splitCell(cellsOfReference(use.labelCell)[0].cell).row : splitCell(cell).row;
      if (!labelFoundIn(use.workbookLabel, rowTexts(values, sheet, labelRow))) {
        failures.push(`${file}!${sheet}!${cell}: row ${labelRow} holds no "${use.workbookLabel}"`);
      }
    }
  }
  return failures;
}

export function gridHtml(values, { sheet, cell }) {
  const target = splitCell(cell);
  const firstRow = Math.max(1, target.row - ROWS_ABOVE);
  const rows = [];
  for (let r = firstRow; r <= target.row + ROWS_BELOW; r += 1) rows.push(r);
  const used = new Set([target.column]);
  for (const r of rows) {
    for (let c = 0; c <= LAST_COLUMN_INDEX; c += 1) {
      if (showValue(values[sheet]?.[`${columnLetters(c)}${r}`]) !== "") used.add(c);
    }
  }
  let columns = [...used].sort((a, b) => a - b);
  if (columns.length > MAX_COLUMNS) {
    const nearest = columns
      .filter((c) => c !== target.column)
      .sort((a, b) => Math.abs(a - target.column) - Math.abs(b - target.column))
      .slice(0, MAX_COLUMNS - 1);
    columns = [target.column, ...nearest].sort((a, b) => a - b);
  }
  const head = columns.map((c) => `<th>${columnLetters(c)}</th>`).join("");
  const body = rows
    .map((r) => {
      const cells = columns
        .map((c) => {
          const reference = `${columnLetters(c)}${r}`;
          const marked = c === target.column && r === target.row;
          return `<td class="${marked ? "marked" : ""}">${escapeHtml(showValue(values[sheet]?.[reference]))}</td>`;
        })
        .join("");
      return `<tr><th class="row">${r}</th>${cells}</tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:#fff;font:14px/1.35 Arial,Helvetica,sans-serif;color:#1d1d1b;width:${IMAGE_WIDTH - 32}px}
.sheet{font-weight:700;margin:0 0 8px}
table{border-collapse:collapse;width:100%;table-layout:auto}
th,td{border:1px solid #c9ccd1;padding:5px 8px;text-align:left;vertical-align:top;word-break:break-word}
th{background:#eef0f3;font-weight:700;text-align:center}
th.row{width:36px}
td.marked{background:#fff3b0;outline:3px solid #d4351c;outline-offset:-3px;font-weight:700}
</style></head><body><p class="sheet">${escapeHtml(sheet)}, cell ${escapeHtml(cell)}</p><table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

function convertToWebp(ffmpeg, pngPath, webpPath) {
  const result = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", pngPath, "-c:v", "libwebp", "-quality", String(WEBP_QUALITY), webpPath], {
    encoding: "utf8",
  });
  if (result.status !== 0 || !fs.existsSync(webpPath)) throw new Error(`ffmpeg failed for ${webpPath}: ${result.stderr}`);
}

export async function shootSourceCells({ packageDirectory = DEFAULT_PACKAGE_DIRECTORY, outputDirectory = OUTPUT_DIRECTORY } = {}) {
  const { readMultiFileXlsxCellValues } = await import(pathToFileURL(READER_PATH).href);
  const cells = namedCells();
  const workbooks = [...new Set(cells.map((c) => c.file))];
  if (workbooks.length !== 1) throw new Error(`Expected one workbook, the table names ${workbooks.join(", ")}`);
  const [workbook] = workbooks;
  const values = await readMultiFileXlsxCellValues(packageDirectory, workbook, readsFor(cells));
  const failures = labelFailures(cells, values);
  if (failures.length) throw new Error(`Label check failed for ${failures.length} cell(s):\n${failures.join("\n")}`);

  fs.mkdirSync(outputDirectory, { recursive: true });
  const ffmpeg = resolveFfmpegBinary();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ct600-source-shots-"));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: IMAGE_WIDTH, height: 100 } });
    for (const record of cells) {
      await page.setContent(gridHtml(values, record));
      const pngPath = path.join(scratch, "shot.png");
      await page.screenshot({ path: pngPath, fullPage: true });
      convertToWebp(ffmpeg, pngPath, path.join(outputDirectory, sourceImageName(record)));
    }
  } finally {
    await browser.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return { count: cells.length, entries: allSources().length };
}

function optionOf(name, argv) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageDirectory = optionOf("--package", process.argv.slice(2)) || DEFAULT_PACKAGE_DIRECTORY;
  shootSourceCells({ packageDirectory })
    .then(({ count }) => console.log(`Wrote ${count} images to ${path.relative(repositoryRoot, OUTPUT_DIRECTORY)}`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
