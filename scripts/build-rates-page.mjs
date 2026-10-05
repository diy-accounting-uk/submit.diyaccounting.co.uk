// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Builds the Rates and allowances page, its data module and the copies of the engine tax modules.
// Usage: node scripts/build-rates-page.mjs   (npm run build:rates-page)
// Every fact needs at least one source file listing its id; the build throws otherwise.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import toml from "@iarna/toml";
import prettier from "prettier";
import { loadSources, escapeHtml, sourceQuoteHtml } from "./tax-sources.mjs";
import { RATES_FACT_IDS, TAX_YEAR_COLUMNS, FINANCIAL_YEAR_COLUMNS } from "./rates-fact-ids.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ENGINE_PACKAGE_DIR = join(ROOT, "node_modules", "@diy-accounting-uk", "diya-gl");
export const ENGINE_TAX_SOURCE_DIR = join(ENGINE_PACKAGE_DIR, "dist", "app", "lib", "tax");
export const ENGINE_DATA_DIR = join(ENGINE_PACKAGE_DIR, "dist", "app", "data");
export const ENGINE_TAX_TARGET_DIR = join(ROOT, "web", "public", "lib", "diya-gl", "tax");
export const ENGINE_MODULES = ["income-tax.js", "national-insurance.js", "corporation-tax.js", "capital-allowances.js", "mileage.js"];
export const PAGE_PATH = join(ROOT, "web", "public", "rates.html");
export const DATA_PATH = join(ROOT, "web", "public", "lib", "rates", "rates-data.js");

export const TAX_YEARS = TAX_YEAR_COLUMNS;
export const FINANCIAL_YEARS = FINANCIAL_YEAR_COLUMNS.map((slug) => Number(slug.slice(2)));

const SELF_EMPLOYED_TABLE_KEYS = ["income_tax", "national_insurance", "capital_allowances", "mileage", "vat"];
const LIMITED_COMPANY_TABLE_KEYS = ["corporation_tax", "corporation_tax_previous_financial_year", "capital_allowances", "mileage", "vat"];

export const RATE_TABLES = [
  {
    id: "income-tax",
    caption: "Income tax",
    period: "tax-year",
    group: "self-employed",
    rows: [
      { label: "Personal Allowance", fact: "income-tax-personal-allowance", engine: "income_tax.personal_allowance", format: "gbp" },
      {
        label: "Income limit for Personal Allowance",
        fact: "income-tax-personal-allowance-income-limit",
        engine: "income_tax.personal_allowance_taper_threshold",
        format: "gbp",
      },
      { label: "Basic rate", fact: "income-tax-basic-rate", engine: "income_tax.basic_rate", format: "percent" },
      { label: "Basic rate band", fact: "income-tax-basic-rate-band", engine: "income_tax.basic_band_end", format: "gbp" },
      { label: "Higher rate", fact: "income-tax-higher-rate", engine: "income_tax.higher_rate", format: "percent" },
      {
        label: "Additional rate threshold",
        fact: "income-tax-additional-rate-threshold",
        engine: "income_tax.higher_band_end",
        format: "gbp",
      },
      { label: "Additional rate", fact: "income-tax-additional-rate", engine: "income_tax.additional_rate", format: "percent" },
    ],
  },
  {
    id: "national-insurance",
    caption: "National Insurance",
    period: "tax-year",
    group: "self-employed",
    rows: [
      {
        label: "Class 4 lower profits limit",
        fact: "ni-class4-lower-profits-limit",
        engine: "national_insurance.class4_lower_limit",
        format: "gbp",
      },
      {
        label: "Class 4 upper profits limit",
        fact: "ni-class4-upper-profits-limit",
        engine: "national_insurance.class4_upper_limit",
        format: "gbp",
      },
      { label: "Class 4 main rate", fact: "ni-class4-main-rate", engine: "national_insurance.class4_lower_rate", format: "percent" },
      {
        label: "Class 4 additional rate",
        fact: "ni-class4-additional-rate",
        engine: "national_insurance.class4_upper_rate",
        format: "percent",
      },
      {
        label: "Class 2 weekly rate (voluntary)",
        fact: "ni-class2-weekly-rate",
        engine: "national_insurance.class2_weekly_rate",
        format: "gbp",
      },
      {
        label: "Class 2 small profits threshold",
        fact: "ni-class2-small-profits-threshold",
        engine: "national_insurance.class2_small_profits_threshold",
        format: "gbp",
      },
    ],
  },
  {
    id: "capital-allowances",
    caption: "Capital allowances",
    period: "tax-year",
    group: "self-employed",
    rows: [
      {
        label: "Annual Investment Allowance limit",
        fact: "capital-allowances-aia-limit",
        value: 1000000,
        display: "£1 million",
        format: "gbp",
        sourcedKey: "aiaLimit",
      },
      {
        label: "Main pool writing down allowance",
        fact: "capital-allowances-main-rate",
        engine: "capital_allowances.writing_down_allowance",
        format: "percent",
      },
      {
        label: "Special rate pool writing down allowance",
        fact: "capital-allowances-special-rate",
        engine: "capital_allowances.writing_down_allowance_special",
        format: "percent",
      },
    ],
  },
  {
    id: "mileage",
    caption: "Mileage allowances",
    period: "tax-year",
    group: "self-employed",
    rows: [
      {
        label: "Cars and vans, first 10,000 business miles",
        fact: "mileage-car-first-10000",
        engine: "mileage.higher_rate_pence",
        format: "pence",
        evidence: {
          "2025-26":
            "Approved mileage rates from tax year 2011 to 2026 Vehicle type First 10,000 business miles in the tax year Each business mile over 10,000 in the tax year Cars and vans {value}",
          "2026-27":
            "Approved mileage rates from tax year 2026 to 2027 Vehicle type First 10,000 business miles in the tax year Each business mile over 10,000 in the tax year Cars and vans {value}",
        },
      },
      {
        label: "Cars and vans, over 10,000 business miles",
        fact: "mileage-car-over-10000",
        engine: "mileage.lower_rate_pence",
        format: "pence",
      },
      { label: "Business miles at the higher rate", fact: "mileage-car-band-miles", engine: "mileage.higher_rate_limit", format: "miles" },
    ],
  },
  {
    id: "cis",
    caption: "Construction Industry Scheme deductions",
    period: "tax-year",
    group: "self-employed",
    rows: [
      {
        label: "Registered subcontractor",
        fact: "cis-deduction-registered",
        value: 0.2,
        format: "percent",
        sourcedKey: "cisRegisteredRate",
      },
      {
        label: "Subcontractor not registered",
        fact: "cis-deduction-unregistered",
        value: 0.3,
        format: "percent",
        sourcedKey: "cisUnregisteredRate",
      },
      {
        label: "Gross payment status",
        fact: "cis-deduction-gross",
        value: 0,
        display: "No deduction",
        evidence: "the contractor will not take deductions",
        format: "percent",
      },
    ],
  },
  {
    id: "vat",
    caption: "VAT",
    period: "tax-year",
    group: "vat",
    rows: [
      { label: "Registration threshold", fact: "vat-registration-threshold", engine: "vat.registration_threshold", format: "gbp" },
      { label: "Standard rate", fact: "vat-standard-rate", engine: "vat.standard_rate", format: "percent" },
      { label: "Flat Rate Scheme joining limit", fact: "vat-flat-rate-joining-limit", value: 150000, format: "gbp" },
      { label: "Flat Rate Scheme leaving limit", fact: "vat-flat-rate-leaving-limit", value: 230000, format: "gbp" },
      {
        label: "Flat rate for a limited cost business",
        fact: "vat-flat-rate-limited-cost-trader",
        value: 0.165,
        format: "percent",
        sourcedKey: "flatRateLimitedCostTrader",
      },
    ],
  },
  {
    id: "corporation-tax",
    caption: "Corporation Tax",
    period: "financial-year",
    group: "limited-company",
    rows: [
      { label: "Main rate", fact: "corporation-tax-main-rate", engine: "corporation_tax.main_rate", format: "percent" },
      {
        label: "Small profits rate",
        fact: "corporation-tax-small-profits-rate",
        engine: "corporation_tax.small_profits_rate",
        format: "percent",
      },
      { label: "Lower limit", fact: "corporation-tax-lower-limit", engine: "corporation_tax.small_profits_limit", format: "gbp" },
      { label: "Upper limit", fact: "corporation-tax-upper-limit", engine: "corporation_tax.main_rate_limit", format: "gbp" },
      {
        label: "Marginal relief fraction",
        fact: "corporation-tax-marginal-relief-fraction",
        engine: "corporation_tax.marginal_relief_fraction",
        format: "fraction",
      },
    ],
  },
  {
    id: "company-capital-allowances",
    caption: "Capital allowances for companies",
    period: "financial-year",
    group: "limited-company",
    rows: [
      {
        label: "Full expensing, main pool plant and machinery",
        fact: "capital-allowances-full-expensing",
        engine: "capital_allowances.full_expensing_rate",
        format: "percent",
      },
      {
        label: "Annual Investment Allowance limit",
        fact: "capital-allowances-company-aia-limit",
        value: 1000000,
        display: "£1 million",
        format: "gbp",
        sourcedKey: "aiaLimit",
      },
      {
        label: "Main pool writing down allowance",
        fact: "capital-allowances-company-main-rate",
        engine: "capital_allowances.writing_down_allowance_main",
        format: "percent",
      },
      {
        label: "Special rate pool writing down allowance",
        fact: "capital-allowances-company-special-rate",
        engine: "capital_allowances.writing_down_allowance_special",
        format: "percent",
      },
    ],
  },
];

export function columnsOf(table) {
  return table.period === "tax-year" ? TAX_YEARS : FINANCIAL_YEAR_COLUMNS;
}

export function columnHeading(column) {
  return column.startsWith("fy") ? `FY${column.slice(2)}` : column;
}

export function factId(row, column) {
  return `${row.fact}-${column}`;
}

export function allRatesFactIds() {
  return RATE_TABLES.flatMap((table) => table.rows.flatMap((row) => columnsOf(table).map((column) => factId(row, column))));
}

export function formatFactValue(value, format) {
  switch (format) {
    case "gbp":
      return `£${value.toLocaleString("en-GB", Number.isInteger(value) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "percent":
      return `${Number((value * 100).toFixed(2))}%`;
    case "pence":
      return `${Math.round(value * 100)}p`;
    case "miles":
      return value.toLocaleString("en-GB");
    case "fraction": {
      for (let denominator = 1; denominator <= 1000; denominator++) {
        const numerator = value * denominator;
        if (Math.abs(numerator - Math.round(numerator)) < 1e-9) return `${Math.round(numerator)}/${denominator}`;
      }
      throw new Error(`No fraction with a denominator up to 1000 for ${value}`);
    }
    default:
      throw new Error(`Unknown format ${format}`);
  }
}

export function engineFileFor(column) {
  if (column.startsWith("fy")) return `ltd-${column.slice(2)}.toml`;
  const startYear = Number(column.slice(0, 4));
  return `se-${startYear}-${startYear + 1}.toml`;
}

export function readEngineTable(column) {
  return toml.parse(readFileSync(join(ENGINE_DATA_DIR, engineFileFor(column)), "utf8"));
}

function valueAtPath(tables, dottedKey) {
  const value = dottedKey.split(".").reduce((node, key) => node?.[key], tables);
  if (value === undefined) throw new Error(`No engine figure ${dottedKey}`);
  return value;
}

export function rowValue(row, column, tables = readEngineTable(column)) {
  return row.engine ? valueAtPath(tables, row.engine) : row.value;
}

export function displayText(row, column, tables) {
  return row.display ?? formatFactValue(rowValue(row, column, tables), row.format);
}

export function evidenceText(row, column, tables) {
  if (typeof row.evidence === "object") return row.evidence[column].replace("{value}", displayText(row, column, tables));
  return row.evidence ?? displayText(row, column, tables);
}

export function engineVersion() {
  return JSON.parse(readFileSync(join(ENGINE_PACKAGE_DIR, "package.json"), "utf8")).version;
}

export function copyEngineModules() {
  mkdirSync(ENGINE_TAX_TARGET_DIR, { recursive: true });
  for (const name of ENGINE_MODULES) {
    copyFileSync(join(ENGINE_TAX_SOURCE_DIR, name), join(ENGINE_TAX_TARGET_DIR, name));
  }
}

function isoDates(node) {
  if (node instanceof Date) return node.toISOString().slice(0, 10);
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, isoDates(value)]));
  return node;
}

function pickTables(parsed, keys, periodKey) {
  return {
    start: isoDates(parsed[periodKey].start),
    end: isoDates(parsed[periodKey].end),
    ...Object.fromEntries(keys.map((key) => [key, isoDates(parsed[key])])),
  };
}

function sourcedFigures(period) {
  const tables = RATE_TABLES.filter((table) => table.period === period);
  return Object.fromEntries(
    tables.flatMap((table) => table.rows.filter((row) => row.sourcedKey).map((row) => [row.sourcedKey, row.value])),
  );
}

async function formatWith(path, source) {
  const config = (await prettier.resolveConfig(path)) ?? {};
  return prettier.format(source, { ...config, filepath: path });
}

export async function renderRatesData() {
  const selfEmployed = Object.fromEntries(
    TAX_YEARS.map((year) => [year, pickTables(readEngineTable(year), SELF_EMPLOYED_TABLE_KEYS, "tax_year")]),
  );
  const limitedCompany = Object.fromEntries(
    FINANCIAL_YEARS.map((year) => [year, pickTables(readEngineTable(`fy${year}`), LIMITED_COMPANY_TABLE_KEYS, "financial_year")]),
  );
  const sourced = {
    ...Object.fromEntries(TAX_YEARS.map((year) => [year, sourcedFigures("tax-year")])),
    ...Object.fromEntries(FINANCIAL_YEAR_COLUMNS.map((column) => [column, sourcedFigures("financial-year")])),
  };
  const source = `// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited
// Generated by scripts/build-rates-page.mjs from @diy-accounting-uk/diya-gl and the tax-sources files; edit those, not this file.
export const ENGINE_VERSION = ${JSON.stringify(engineVersion())};
export const TAX_YEARS = ${JSON.stringify(TAX_YEARS)};
export const FINANCIAL_YEARS = ${JSON.stringify(FINANCIAL_YEARS)};
export const SELF_EMPLOYED = ${JSON.stringify(selfEmployed)};
export const LIMITED_COMPANY = ${JSON.stringify(limitedCompany)};
export const SOURCED = ${JSON.stringify(sourced)};
`;
  return formatWith(DATA_PATH, source);
}

function ratesSources(sources) {
  const shown = new Set(RATES_FACT_IDS);
  return sources.filter((source) => source.facts.some((id) => shown.has(id)));
}

function tableHtml(table, sources, listedSources) {
  const columns = columnsOf(table);
  const rows = table.rows
    .map((row) => {
      const tables = Object.fromEntries(columns.map((column) => [column, readEngineTable(column)]));
      const cells = columns
        .map((column) => `<td data-fact="${factId(row, column)}">${escapeHtml(displayText(row, column, tables[column]))}</td>`)
        .join("");
      const rowFacts = columns.map((column) => factId(row, column));
      const numbers = [];
      for (const fact of rowFacts) {
        const supporting = sources.filter((source) => source.facts.includes(fact));
        if (supporting.length === 0) throw new Error(`Fact ${fact} has no source file`);
        for (const source of supporting) {
          const number = listedSources.indexOf(source) + 1;
          if (!numbers.includes(number)) numbers.push(number);
        }
      }
      numbers.sort((a, b) => a - b);
      const links = numbers.map((number) => `<a href="#source-${listedSources[number - 1].name}">${number}</a>`).join(", ");
      return `<tr><th scope="row">${escapeHtml(row.label)}</th>${cells}<td class="rate-source">${links}</td></tr>`;
    })
    .join("");
  return (
    `<div class="rates-table-scroll"><table class="rates-table" id="rates-${table.id}">` +
    `<caption>${escapeHtml(table.caption)}</caption>` +
    `<thead><tr><th scope="col">Rate or allowance</th>${columns.map((c) => `<th scope="col">${columnHeading(c)}</th>`).join("")}<th scope="col">Source</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>`
  );
}

const STYLES = `
      .rates-table-scroll {
        overflow-x: auto;
        margin-bottom: var(--spacing-lg);
      }
      .rates-table {
        border-collapse: collapse;
        min-width: 100%;
      }
      .rates-table caption {
        text-align: left;
        font-weight: var(--font-weight-bold);
        margin-bottom: var(--spacing-xs);
      }
      .rates-table th,
      .rates-table td {
        border: 1px solid var(--color-border);
        padding: var(--spacing-xs) var(--spacing-sm);
        text-align: left;
      }
      .rate-sources {
        padding-left: var(--spacing-lg);
        text-align: left;
      }
      .rate-sources li {
        margin-bottom: var(--spacing-md);
      }
      .source-quote {
        margin: var(--spacing-sm) 0 0;
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--color-background);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        font-size: var(--font-size-sm);
        color: var(--color-text-hint);
      }
      .source-quote p {
        margin: 0 0 var(--spacing-xs);
      }
      .source-quote footer {
        overflow-wrap: anywhere;
      }
      .retrieved {
        color: var(--color-text-secondary);
        white-space: nowrap;
      }
      #ratesCalculator [hidden],
      #ratesResults [hidden] {
        display: none;
      }
      .rates-choice label {
        display: inline;
        font-weight: normal;
        margin-right: var(--spacing-md);
      }
      .rates-hint {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--spacing-md);
      }
      #ratesResults dl {
        margin: 0;
      }
      .rates-result {
        display: flex;
        justify-content: space-between;
        gap: var(--spacing-md);
        border-bottom: 1px solid var(--color-border);
        padding: var(--spacing-xs) 0;
      }
      .rates-result dt,
      .rates-result dd {
        margin: 0;
      }
      .rates-result dd {
        font-weight: var(--font-weight-bold);
        text-align: right;
      }`;

function numberField({ id, label, value, step = "any", showFor }) {
  return (
    `<div class="form-group"${showFor ? ` data-show="${showFor}"` : ""}>` +
    `<label for="${id}">${label}</label>` +
    `<input type="number" id="${id}" name="${id}" min="0" step="${step}" value="${value}" inputmode="decimal" />` +
    `</div>`
  );
}

function radioGroup(name, legend, choices, showFor) {
  const items = choices
    .map(
      ([id, value, label], index) =>
        `<input type="radio" id="${id}" name="${name}" value="${value}"${index === 0 ? " checked" : ""} /> <label for="${id}">${label}</label>`,
    )
    .join("");
  return `<fieldset class="form-group rates-choice"${showFor ? ` data-show="${showFor}"` : ""}><legend>${legend}</legend>${items}</fieldset>`;
}

function checkboxField(id, label) {
  return `<div class="form-group rates-choice"><input type="checkbox" id="${id}" name="${id}" /> <label for="${id}">${label}</label></div>`;
}

const RESULT_ROWS = [
  ["ratesOutVatDue", "VAT to pay", "vat"],
  ["ratesOutMileageAllowance", "Mileage allowance", ""],
  ["ratesOutCapitalAllowances", "Capital allowances", ""],
  ["ratesOutTaxableProfit", "Taxable profit", ""],
  ["ratesOutPersonalAllowance", "Personal Allowance after any reduction", "self-employed"],
  ["ratesOutIncomeTax", "Income tax", "self-employed"],
  ["ratesOutClass4", "Class 4 National Insurance", "self-employed"],
  ["ratesOutClass2Voluntary", "Voluntary Class 2 (not in the total)", "self-employed"],
  ["ratesOutTaxAndNi", "Income tax and Class 4 National Insurance", "self-employed"],
  ["ratesOutCisDeducted", "CIS deducted", "cis"],
  ["ratesOutLeftToPay", "Left to pay after CIS", "self-employed cis"],
  ["ratesOutPeriod", "Accounting period", "limited-company"],
  ["ratesOutMarginalRelief", "Marginal relief", "limited-company"],
  ["ratesOutCorporationTax", "Corporation Tax", "limited-company"],
  ["ratesOutProfitAfterTax", "Profit after tax", ""],
];

function calculatorHtml() {
  const latestYear = TAX_YEARS[TAX_YEARS.length - 1];
  const yearEndMin = `${FINANCIAL_YEARS[0]}-04-01`;
  const yearEndMax = `${FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1] + 1}-03-31`;
  const taxYearOptions = TAX_YEARS.map((year) => `<option value="${year}"${year === latestYear ? " selected" : ""}>${year}</option>`).join(
    "",
  );
  const form =
    `<form id="ratesCalculator" novalidate>` +
    radioGroup(
      "ratesBusinessType",
      "Business type",
      [
        ["ratesTypeSelfEmployed", "self-employed", "Self-employed"],
        ["ratesTypeLimitedCompany", "limited-company", "Limited company"],
      ],
      "",
    ) +
    `<div class="form-group" data-show="self-employed"><label for="ratesTaxYear">Tax year</label><select id="ratesTaxYear" name="ratesTaxYear">${taxYearOptions}</select></div>` +
    `<div class="form-group" data-show="limited-company"><label for="ratesYearEnd">Accounting period end (the period is the twelve months before)</label>` +
    `<input type="date" id="ratesYearEnd" name="ratesYearEnd" min="${yearEndMin}" max="${yearEndMax}" value="${yearEndMax}" /></div>` +
    numberField({ id: "ratesIncome", label: "Income for the period (£)", value: 40000 }) +
    numberField({ id: "ratesExpenses", label: "Expenses for the period (£)", value: 5000 }) +
    `<p class="rates-hint">Enter income and expenses excluding VAT. Every expense is taken as standard-rated.</p>` +
    numberField({ id: "ratesMiles", label: "Business miles by car", value: 0 }) +
    numberField({ id: "ratesEquipment", label: "Equipment bought in the period (£)", value: 0 }) +
    numberField({ id: "ratesPoolBroughtForward", label: "Main pool brought forward (£)", value: 0 }) +
    numberField({ id: "ratesPersonalAllowance", label: "Personal Allowance (£)", value: 12570, showFor: "self-employed" }) +
    numberField({ id: "ratesAssociatedCompanies", label: "Associated companies", value: 0, step: "1", showFor: "limited-company" }) +
    checkboxField("ratesVatRegistered", "VAT registered") +
    radioGroup(
      "ratesVatScheme",
      "VAT scheme",
      [
        ["ratesVatStandard", "standard", "Standard"],
        ["ratesVatFlatRate", "flat-rate", "Flat Rate Scheme"],
      ],
      "vat",
    ) +
    numberField({ id: "ratesFlatRatePercent", label: "Flat rate (%)", value: 16.5, step: "0.5", showFor: "flat-rate" }) +
    checkboxField("ratesCis", "Construction Industry Scheme deductions") +
    `<div class="form-group" data-show="cis"><label for="ratesCisStatus">CIS status</label><select id="ratesCisStatus" name="ratesCisStatus">` +
    `<option value="registered">Registered</option><option value="unregistered">Not registered</option><option value="gross">Gross payment status</option></select></div>` +
    numberField({ id: "ratesCisLabour", label: "Labour paid under CIS (£)", value: 40000, showFor: "cis" }) +
    `</form>`;
  const results = RESULT_ROWS.map(
    ([id, label, showFor]) =>
      `<div class="rates-result"${showFor ? ` data-show="${showFor}"` : ""}><dt id="${id}Label">${label}</dt><dd id="${id}"></dd></div>`,
  ).join("");
  const companyRows =
    `<div data-show="limited-company" class="rates-table-scroll"><table class="rates-table" id="ratesOutCtRows"><caption>Corporation Tax by financial year</caption>` +
    `<thead><tr><th scope="col">Financial year</th><th scope="col">Days</th><th scope="col">Profit share</th><th scope="col">Rate</th><th scope="col">Tax before relief</th><th scope="col">Marginal relief</th><th scope="col">Tax</th></tr></thead><tbody></tbody></table></div>`;
  return (
    `<noscript><p>The calculator needs JavaScript. The rate tables below work without it.</p></noscript>` +
    form +
    `<div id="ratesResults" aria-live="polite"><dl>${results}</dl>${companyRows}</div>`
  );
}

function groupTablesHtml(group, sources, listedSources) {
  return RATE_TABLES.filter((table) => table.group === group)
    .map((table) => tableHtml(table, sources, listedSources))
    .join("");
}

export function renderRatesHtml(sources) {
  const listedSources = ratesSources(sources);
  const tables = (group) => groupTablesHtml(group, listedSources, listedSources);
  const sourceItems = listedSources.map((source) => `<li id="source-${source.name}">${sourceQuoteHtml(source)}</li>`).join("");

  return `<!doctype html>
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->
<!-- Generated by scripts/build-rates-page.mjs from .claude/skills/tax-sources/sources and @diy-accounting-uk/diya-gl; edit those, not this file. -->
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <title>Rates and allowances - DIY Accounting Submit</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="UK tax rates and allowances for the self-employed and limited companies, 2025-26 and 2026-27, each linked to its gov.uk source, with a calculator that works out tax, National Insurance and corporation tax."
    />
    <link rel="canonical" href="https://submit.diyaccounting.co.uk/rates.html" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="submit.css" />
    <style>${STYLES}
    </style>
    <!-- CloudWatch RUM configuration placeholders; replace values during deployment -->
    <meta name="rum:appMonitorId" content="\${RUM_APP_MONITOR_ID}" />
    <meta name="rum:region" content="\${AWS_REGION}" />
    <meta name="rum:identityPoolId" content="\${RUM_IDENTITY_POOL_ID}" />
    <meta name="rum:guestRoleArn" content="\${RUM_GUEST_ROLE_ARN}" />
    <script src="./lib/analytics.js"></script>
    <script src="./lib/session-beacon.js"></script>
  </head>
  <body>
    <a href="#mainContent" class="skip-link">Skip to main content</a>
    <header>
      <p class="chrome-fallback"><a href="./">DIY Accounting Submit</a></p>
      <h1>DIY Accounting Submit</h1>
      <p class="subtitle">Rates and allowances: the figures behind your returns</p>
    </header>

    <main id="mainContent">
      <div id="statusMessagesContainer" role="status" aria-live="polite"></div>

      <div class="form-container">
        <h2>Calculator</h2>
        ${calculatorHtml()}
      </div>

      <div class="form-container">
        <h2>Self-employed and sole traders</h2>
        <p>Tax years run from 6 April to 5 April.</p>
        ${tables("self-employed")}
      </div>

      <div class="form-container">
        <h2>VAT</h2>
        ${tables("vat")}
      </div>

      <div class="form-container">
        <h2>Limited companies</h2>
        <p>Financial years run from 1 April to 31 March.</p>
        ${tables("limited-company")}
      </div>

      <div class="form-container">
        <h2>Sources</h2>
        <p>Each entry shows the words from the gov.uk page it comes from and the day we read that page.</p>
        <ol class="rate-sources">${sourceItems}</ol>
      </div>
    </main>

    <footer data-footer="full"></footer>

    <script src="widgets/page-chrome.js"></script>
    <script src="lib/env-loader.js"></script>
    <script type="module" src="./submit.js"></script>
    <script src="./developer-mode.js"></script>
    <script src="./lib/request-cache.js"></script>
    <script src="./lib/toml-parser.js"></script>
    <script src="widgets/status-messages.js"></script>
    <script src="widgets/entitlement-status.js"></script>
    <script src="widgets/auth-status.js"></script>
    <script type="module" src="widgets/view-source-link.js"></script>
    <script type="module" src="./lib/rates/rates-calculator.js"></script>
  </body>
</html>
`;
}

export async function renderRatesPage(sources = loadSources()) {
  return formatWith(PAGE_PATH, renderRatesHtml(sources));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyEngineModules();
  writeFileSync(DATA_PATH, await renderRatesData());
  writeFileSync(PAGE_PATH, await renderRatesPage());
  console.log(`copied ${ENGINE_MODULES.length} engine modules from diya-gl ${engineVersion()}; wrote ${DATA_PATH} and ${PAGE_PATH}`);
}
