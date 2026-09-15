// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// itsa-tools.js -- the two ITSA derivations over the session's loaded book:
// derive_itsa_quarterly_update answers one period of HMRC's Self Employment
// Business API (a period's own figures in a tax year filed as dated period
// summaries, a running total from 6 April in a year filed as cumulative
// period summaries), and derive_itsa_annual_submission answers the year's
// allowances and adjustments. Both call the published diya-gl package's own
// se-derivations (the same module the spreadsheets site reconciles its SE
// package against) and add no arithmetic of their own beyond summing quarters.
//
// The field set HMRC accepts changes by tax year (sa103-mtd-mapping.json's
// api.years: allowances gone from 2025-26, an adjustment gone from 2026-27,
// two test-only additions), and every answer here is filtered to the year's
// live fields on this side, whatever the derivation itself does. A field the
// template cannot source is omitted, never sent as a zero.

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

import {
  buildSelfEmploymentAnnualSubmission,
  buildSelfEmploymentQuarterlyUpdates,
} from "@diy-accounting-uk/diya-gl/dist/app/lib/calculators/se-derivations.js";
import { loadTaxDataForBook, productOf } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { z } from "zod";

const require = createRequire(import.meta.url);
const MAPPING = require("@diy-accounting-uk/diya-gl/dist/app/data/hmrc/sa103-mtd-mapping.json");

export const QUARTERLY_PERIOD_TYPES = ["standard", "calendar"];

const TAX_YEAR_LABEL = /^(\d{4})-(\d{2})$/;

function requireSelfEmployedBook(session) {
  if (!session.book || !session.lines) {
    throw new Error("No book is loaded. Call open_book first.");
  }
  const product = productOf(session.book);
  if (product !== "se") {
    throw new Error(`The loaded book is a "${product}" book; the ITSA derivations read a self-employed (se) book`);
  }
}

// "2025-26" names the package's se-2025-2026.toml; a label the mapping's
// api.years does not carry is refused before any figure is derived, because
// the field set for that year is unknown.
function taxYearFileNameFor(label) {
  const match = TAX_YEAR_LABEL.exec(label ?? "");
  if (!match) throw new Error(`taxYear must look like 2025-26, not "${label}"`);
  const start = Number(match[1]);
  const end = start + 1;
  if (String(end).slice(-2) !== match[2]) throw new Error(`taxYear "${label}" does not name two consecutive years`);
  return `se-${start}-${end}`;
}

async function taxDataFor(book, taxYear) {
  const options = taxYear ? { taxYearName: taxYearFileNameFor(taxYear) } : {};
  const taxData = await loadTaxDataForBook(book, options);
  const label = taxData?.tax_year?.label;
  if (!label) throw new Error("the tax year file declares no tax_year.label");
  if (!MAPPING.api.years[label]) {
    throw new Error(`sa103-mtd-mapping.json carries no api.years entry for tax year "${label}"`);
  }
  return taxData;
}

function fieldsOf(entry) {
  return entry.field.split("|").map((field) => field.trim());
}

function boxesOnRoute(route) {
  return MAPPING.boxes.filter((entry) => entry.form === "SA103F" && entry.route === route && entry.field);
}

/**
 * The quarterly field slots HMRC's period summary carries, from the mapping:
 * every quarterly-route field (a box shared by two fields counts both) plus
 * the consolidated-expenses election the box 31 caveat names. The mapping
 * varies none of these by tax year; the year decides the shape, not the set.
 * @returns {string[]}
 */
export function quarterlyFieldSlots() {
  const slots = new Set();
  for (const entry of boxesOnRoute("quarterly")) for (const field of fieldsOf(entry)) slots.add(field);
  slots.add("periodExpenses.consolidatedExpenses");
  return [...slots].sort();
}

// A fieldsAdded entry that carries a status (the 2026-27 additions, behind
// HMRC test flags) is not live; a plain string is live from that year on.
function addedFieldsOf(yearEntry) {
  return (yearEntry.fieldsAdded || []).filter((added) => typeof added === "string");
}

/**
 * The annual field slots HMRC's schema accepts for one tax year: every
 * annual-route field in the mapping, less those api.years says are gone by
 * that year, less those added only in a later year, less the test-only
 * additions.
 * @param {string} taxYear - a label such as "2025-26"
 * @returns {string[]}
 */
export function annualFieldSlotsForTaxYear(taxYear) {
  const years = MAPPING.api.years;
  const order = Object.keys(years);
  const index = order.indexOf(taxYear);
  if (index === -1) throw new Error(`sa103-mtd-mapping.json carries no api.years entry for tax year "${taxYear}"`);
  const unavailable = new Set();
  for (let i = index + 1; i < order.length; i++) for (const added of addedFieldsOf(years[order[i]])) unavailable.add(added);
  for (let i = 0; i <= index; i++) for (const gone of years[order[i]].fieldsGone || []) unavailable.add(gone);
  for (const year of order) {
    for (const added of years[year].fieldsAdded || []) {
      if (typeof added !== "string") unavailable.add(added.field);
    }
  }
  const slots = new Set();
  for (const entry of boxesOnRoute("annual")) for (const field of fieldsOf(entry)) slots.add(field);
  return [...slots].filter((field) => !unavailable.has(field)).sort();
}

function readPath(target, path) {
  let node = target;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, part)) return undefined;
    node = node[part];
  }
  return node;
}

function writePath(target, path, value) {
  const parts = path.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!Object.hasOwn(node, parts[i]) || node[parts[i]] === null || typeof node[parts[i]] !== "object") node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

// Rebuilds a payload from the slots the year accepts, in the mapping's own
// order, so a field the derivation never set stays absent and a field the
// year no longer accepts is dropped. Answers the payload and the slots left
// out of it.
function restrictToSlots(payload, slots) {
  const kept = {};
  const omitted = [];
  for (const slot of slots) {
    const value = readPath(payload, slot);
    if (value === undefined) omitted.push(slot);
    else writePath(kept, slot, value);
  }
  return { kept, omitted };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function sumPeriods(periods, slots) {
  const total = {};
  for (const slot of slots) {
    let sum = null;
    for (const period of periods) {
      const value = readPath(period, slot);
      if (typeof value === "number") sum = (sum ?? 0) + value;
    }
    if (sum !== null) writePath(total, slot, round2(sum));
  }
  return total;
}

function periodLabel(period) {
  return `${period.periodDates.periodStartDate} to ${period.periodDates.periodEndDate}`;
}

/**
 * derive_itsa_quarterly_update: one period of the Self Employment Business
 * API from the loaded book. In a tax year HMRC files as dated period
 * summaries (2023-24, 2024-25) the answer is that period's own figures; in a
 * year filed as cumulative period summaries (2025-26 on) the answer is the
 * running total from the year's first period through the one named. The
 * period is picked by periodEndDate among the year's four; with no
 * periodEndDate every period is answered.
 * @param {Object} session
 * @param {{periodEndDate?: string, quarterlyPeriodType?: string, taxYear?: string}} params
 */
export async function deriveItsaQuarterlyUpdate(session, { periodEndDate, quarterlyPeriodType, taxYear } = {}) {
  requireSelfEmployedBook(session);
  const { book, lines } = session;
  const taxData = await taxDataFor(book, taxYear);
  const label = taxData.tax_year.label;
  const shape = MAPPING.api.years[label].quarterly;
  const periodType = quarterlyPeriodType || "standard";
  if (!QUARTERLY_PERIOD_TYPES.includes(periodType)) {
    throw new Error(`quarterlyPeriodType must be one of ${QUARTERLY_PERIOD_TYPES.join(", ")}, not "${periodType}"`);
  }

  const derived = buildSelfEmploymentQuarterlyUpdates(book, lines, taxData, { quarterlyPeriodType: periodType });
  const slots = quarterlyFieldSlots();
  const periods = derived.periods;

  let wanted = periods;
  if (periodEndDate) {
    const index = periods.findIndex((period) => period.periodDates.periodEndDate === periodEndDate);
    if (index === -1) {
      throw new Error(
        `No ${periodType} period of ${label} ends on ${periodEndDate}; the periods end on ${periods.map((p) => p.periodDates.periodEndDate).join(", ")}`,
      );
    }
    wanted = [periods[index]];
  }

  const answers = wanted.map((period) => {
    const index = periods.indexOf(period);
    const covered = shape === "cumulative-period-summary" ? periods.slice(0, index + 1) : [period];
    const figures = shape === "cumulative-period-summary" ? sumPeriods(covered, slots) : period;
    const { kept, omitted } = restrictToSlots(figures, slots);
    return {
      periodDates: {
        periodStartDate: covered[0].periodDates.periodStartDate,
        periodEndDate: period.periodDates.periodEndDate,
      },
      ...kept,
      omitted,
      covers: covered.map(periodLabel),
    };
  });

  return {
    taxYear: label,
    shape,
    quarterlyPeriodType: periodType,
    fieldSlots: slots,
    periods: answers,
    warnings: derived.warnings,
  };
}

/**
 * derive_itsa_annual_submission: the year's allowances and adjustments from
 * the loaded book, restricted to the fields HMRC's schema accepts for that
 * tax year. With a path, the answer is also written there as JSON, the file
 * hmrc/itsa/annualSubmission.html's "Import from a book" control reads.
 * @param {Object} session
 * @param {{taxYear?: string, path?: string}} params
 */
export async function deriveItsaAnnualSubmission(session, { taxYear, path } = {}) {
  requireSelfEmployedBook(session);
  const { book, lines } = session;
  const taxData = await taxDataFor(book, taxYear);
  const label = taxData.tax_year.label;
  const slots = annualFieldSlotsForTaxYear(label);

  const derived = buildSelfEmploymentAnnualSubmission(book, lines, taxData);
  const { kept, omitted } = restrictToSlots(derived, slots);

  const answer = {
    taxYear: label,
    fieldSlots: slots,
    ...kept,
    omitted,
    warnings: derived.warnings,
  };

  if (path) {
    const resolved = resolvePath(path);
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, JSON.stringify(answer, null, 2) + "\n");
    answer.path = resolved;
  }
  return answer;
}

/**
 * The ITSA tools keyed by MCP name, in the shape server.js's TOOLS table
 * uses, so registerItsaTools can add them to any server the same way.
 */
export const ITSA_TOOLS = {
  derive_itsa_quarterly_update: {
    description:
      "One period of HMRC's Self Employment Business API from the loaded self-employed book: the period's own figures " +
      "in a tax year filed as dated period summaries, a running total from 6 April in a year filed as cumulative period " +
      "summaries (2025-26 on). Picks the period by periodEndDate among the year's four (standard quarters by default); " +
      "with no periodEndDate answers every period. A field the book cannot source is omitted, never sent as zero.",
    inputSchema: {
      periodEndDate: z.string().optional().describe("The period's end date, YYYY-MM-DD, as HMRC's obligation names it"),
      quarterlyPeriodType: z.enum(QUARTERLY_PERIOD_TYPES).optional().describe("standard (6 April quarters, the default) or calendar"),
      taxYear: z.string().optional().describe("Override the tax year the book's dates imply, as 2025-26"),
    },
    handler: deriveItsaQuarterlyUpdate,
  },
  derive_itsa_annual_submission: {
    description:
      "The year's allowances and adjustments for HMRC's Self Employment Business API annual submission from the loaded " +
      "self-employed book, restricted to the fields HMRC accepts for that tax year. With a path, also writes the answer " +
      "as the JSON file hmrc/itsa/annualSubmission.html imports.",
    inputSchema: {
      taxYear: z.string().optional().describe("Override the tax year the book's dates imply, as 2025-26"),
      path: z.string().optional().describe("Where to write the answer as JSON for the annual submission page's import"),
    },
    handler: deriveItsaAnnualSubmission,
  },
};

function asToolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function asToolError(err) {
  return { isError: true, content: [{ type: "text", text: err?.message ?? String(err) }] };
}

/**
 * Registers the two ITSA tools on an McpServer against one session.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {Object} session
 */
export function registerItsaTools(server, session) {
  for (const [name, tool] of Object.entries(ITSA_TOOLS)) {
    server.registerTool(name, { description: tool.description, inputSchema: tool.inputSchema }, async (params) => {
      try {
        return asToolResult(await tool.handler(session, params));
      } catch (err) {
        return asToolError(err);
      }
    });
  }
  return server;
}
