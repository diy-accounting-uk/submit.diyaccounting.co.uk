// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-22 Source and publish sourced tax facts
// - **Use when:** a page states a tax date, threshold or rate and each figure needs a gov.uk source, or a source has passed 30 days old.
// - **Does:** The tax-sources skill keeps one JSON file per gov.uk source (url, retrieved date, verbatim quote, fact ids) and says how to refresh one or all. verify-tax-sources.mjs fetches each page and fails when a quote is missing. build-mtd-calendar.mjs renders web/public/mtd-calendar.html from those files and throws when a fact has no source. build-rates-page.mjs renders web/public/rates.html (rate tables per tax year and financial year, each cell sourced) and the rates-data.js module, and copies five diya-gl tax modules into web/public/lib/diya-gl/tax/. rates-calculator.js and rates-compute.js run the tax, National Insurance, VAT, CIS and corporation tax calculator in the browser over those modules. The unit tests fail on an unsourced fact, a source older than 30 days, a committed page that differs from the render, or an engine figure that differs from its quoted gov.uk figure.
// - **Run:** `node scripts/verify-tax-sources.mjs [name]`; `npm run build:mtd-calendar`; `npm run build:rates-page`; `npx vitest run web/unit-tests/mtdCalendar.test.js web/unit-tests/ratesPage.test.js web/unit-tests/ratesCompute.test.js`
// - **Entry:** `scripts/build-mtd-calendar.mjs:renderMtdCalendar`; `scripts/tax-sources.mjs:quoteAppearsIn`; `scripts/build-rates-page.mjs:renderRatesPage`; `web/public/lib/rates/rates-compute.js:computeSelfEmployed`
// - **Files:** .claude/skills/tax-sources/SKILL.md, .claude/skills/tax-sources/sources/, scripts/build-mtd-calendar.mjs, scripts/verify-tax-sources.mjs, scripts/tax-sources.mjs, scripts/rates-fact-ids.mjs, scripts/build-rates-page.mjs, web/public/mtd-calendar.html, web/public/rates.html, web/public/lib/rates/, web/public/lib/diya-gl/tax/, web/unit-tests/mtdCalendar.test.js, web/unit-tests/ratesPage.test.js, web/unit-tests/ratesCompute.test.js, web/unit-tests/taxSources.test.js
// - **Keywords:** tax sources, gov.uk, mtd calendar, thresholds, deadlines, quote, retrieved, rates, sourced facts, rates and allowances, calculator, corporation tax, national insurance, income tax, mileage, cis
// - **Related:** SITE-10, SITE-12
// @end-capability

// Renders web/public/mtd-calendar.html from the tax-sources source files.
// Usage: node scripts/build-mtd-calendar.mjs   (npm run build:mtd-calendar)
// Every fact below needs at least one source file listing its id; the build throws otherwise.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { loadSources, formatIsoDate, escapeHtml, sourceQuoteHtml } from "./tax-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PAGE_PATH = join(ROOT, "web", "public", "mtd-calendar.html");

export const DATED_FACTS = [
  {
    id: "ch-identity-verification-2025-11",
    date: "2025-11-18",
    title: "Companies House: director and PSC identity verification",
    text: "Identity verification is a legal requirement for directors and for people with significant control (PSCs). A director gives the personal code with the company's next confirmation statement. A PSC verifies and gives the personal code within a 14 day period that depends on the PSC's situation.",
  },
  {
    id: "vat-mtd-all-registered-2022-04",
    date: "2022-04-01",
    title: "VAT: every VAT-registered business",
    text: "All VAT-registered businesses use Making Tax Digital for VAT, whatever their turnover. Your first VAT period starting on or after 1 April 2022 is the first one under the rule.",
  },
  {
    id: "itsa-mtd-over-50k-2026-04",
    date: "2026-04-06",
    title: "Income Tax: qualifying income over £50,000",
    text: "Sole traders and landlords with qualifying income over £50,000 in the 2024 to 2025 tax year use Making Tax Digital for Income Tax.",
  },
  {
    id: "itsa-mtd-over-30k-2027-04",
    date: "2027-04-06",
    title: "Income Tax: qualifying income over £30,000",
    text: "The rule reaches qualifying income over £30,000 in the 2025 to 2026 tax year.",
  },
  {
    id: "itsa-mtd-over-20k-2028-04",
    date: "2028-04-06",
    title: "Income Tax: qualifying income over £20,000",
    text: "The rule reaches qualifying income over £20,000 in the 2026 to 2027 tax year.",
  },
];

export const QUARTERLY_FACT = {
  id: "itsa-quarterly-update-deadlines",
  title: "Income Tax quarterly updates",
  text: "Send an update for each quarter by its deadline. These are the standard update periods.",
  rows: [
    ["6 April to 5 July", "7 August"],
    ["6 April to 5 October", "7 November"],
    ["6 April to 5 January", "7 February"],
    ["6 April to 5 April", "7 May, in the following tax year"],
  ],
};

export const FINAL_DECLARATION_FACT = {
  id: "itsa-final-declaration-deadline",
  title: "Income Tax final declaration",
  text: "Submit your tax return by 31 January following the end of the tax year. You can submit it earlier.",
};

export const COMPANY_YEARLY_FACTS = [
  {
    id: "ch-confirmation-statement-12-months",
    title: "Companies House confirmation statement",
    text: "File at least one confirmation statement every 12 months, even if nothing has changed.",
    optional: "You can file early. You do not have to wait for the current review period to end.",
  },
  {
    id: "ch-accounts-9-months",
    title: "Companies House annual accounts",
    text: "File the annual accounts with Companies House 9 months after the end of the company's financial year.",
    optional: "You can file the accounts and the Company Tax Return together or separately.",
  },
  {
    id: "ct600-12-months",
    title: "Company Tax Return (CT600)",
    text: "File the Company Tax Return with HMRC 12 months after the end of the accounting period it covers.",
  },
  {
    id: "ct-payment-9-months-1-day",
    title: "Corporation Tax payment",
    text: "Pay Corporation Tax 9 months and 1 day after the end of the accounting period, when taxable profits are up to £1.5 million.",
  },
];

// status is one of production, sandbox, preview or "not offered". A cell is [status, note?].
export const CHANNELS = ["Web form", "diya-gl book drop", "Spreadsheets drop", "iXBRL drop", "MCP", "API"];
const NOT_OFFERED = ["not offered"];
export const AVAILABILITY = [
  {
    filing: "HMRC VAT return",
    web: "hmrc/vat/submitVat.html",
    activity: "submit-vat",
    video: "XUt2gdYxR1g",
    cells: [
      ["production"],
      ["production"],
      ["production"],
      NOT_OFFERED,
      ["production", "local server; the hosted connector derives figures only"],
      NOT_OFFERED,
    ],
  },
  {
    filing: "HMRC Income Tax (MTD)",
    web: "hmrc/itsa/dashboard.html",
    activity: "self-employed",
    video: "H1LRSZG984Q",
    cells: [
      ["sandbox", "self-employment, UK and foreign property"],
      ["sandbox"],
      ["sandbox"],
      NOT_OFFERED,
      ["sandbox", "figures only"],
      NOT_OFFERED,
    ],
  },
  {
    filing: "HMRC Company Tax Return (CT600)",
    web: "companies-house/fileCompanyTaxReturn.html",
    activity: "file-company-tax-return",
    video: "ZoUTlFPvUes",
    cells: [["preview"], ["preview", "book export file"], NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, NOT_OFFERED],
  },
  {
    filing: "HMRC Assist check on a VAT return",
    web: "hmrc/vat/submitVat.html",
    activity: "vat-assist-check",
    video: "cyOZsF9qe28",
    cells: [["preview"], NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, NOT_OFFERED],
  },
  {
    filing: "Companies House accounts (micro-entity, small company, dormant)",
    web: "companies-house/fileMicroEntityAccounts.html",
    activity: "file-micro-entity-accounts",
    otherActivities: ["file-small-company-accounts"],
    video: "yPSpvLKrTJU",
    cells: [["sandbox"], NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, ["sandbox", "micro-entity"], NOT_OFFERED],
  },
  {
    filing: "Companies House confirmation statement",
    web: "companies-house/fileConfirmationStatement.html",
    activity: "file-confirmation-statement",
    video: "P0aG_mLfhZI",
    cells: [["sandbox"], NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, ["sandbox"], NOT_OFFERED],
  },
  {
    filing: "Companies House PSC verification statement",
    activity: "file-psc-verification-statement",
    video: "zyo32coCwso",
    cells: [["sandbox"], NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, NOT_OFFERED],
  },
  {
    filing: "Companies House registered office and registered email",
    web: "companies-house/changeRegisteredOffice.html",
    activity: "change-registered-office",
    video: "sN_FhTnAqF4",
    cells: [["production"], NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, NOT_OFFERED],
  },
  {
    filing: "Accounts at Companies House and CT600 at HMRC together",
    web: "companies-house/fileCompanyTaxReturn.html",
    activity: "file-company-tax-return",
    cells: [["preview"], ["preview", "book export file"], NOT_OFFERED, NOT_OFFERED, NOT_OFFERED, NOT_OFFERED],
  },
];

// The status of an activity in the table's web form column, or undefined when no row shows it.
export function availabilityStatus(activity) {
  const row = AVAILABILITY.find((r) => r.activity === activity || (r.otherActivities ?? []).includes(activity));
  return row?.cells[0][0];
}

const COMPANIES = ["owner-managed-company", "property-company", "small-company"];
export const BUSINESS_TYPES = [
  { id: "sole-trader", group: "Self-employed", label: "Sole trader" },
  { id: "taxi-private-hire-driver", group: "Self-employed", label: "Taxi and private hire driver" },
  { id: "partnership", group: "Self-employed", label: "Partnership" },
  { id: "landlord", group: "Self-employed", label: "Landlord" },
  { id: "sole-trader-employees", group: "Self-employed", label: "Sole trader with employees" },
  { id: "owner-managed-company", group: "Limited company", label: "Owner-managed company with one director" },
  { id: "property-company", group: "Limited company", label: "Property company" },
  { id: "small-company", group: "Limited company", label: "Small company" },
];

// The business types each calendar section applies to; "all" means every type that is VAT registered.
export const RELEVANT_FOR = {
  "vat-mtd-all-registered-2022-04": "all",
  "itsa-mtd-over-50k-2026-04": ["sole-trader", "taxi-private-hire-driver", "landlord", "sole-trader-employees"],
  "itsa-mtd-over-30k-2027-04": ["sole-trader", "taxi-private-hire-driver", "landlord", "sole-trader-employees"],
  "itsa-mtd-over-20k-2028-04": ["sole-trader", "taxi-private-hire-driver", "landlord", "sole-trader-employees"],
  "itsa-quarterly-update-deadlines": ["sole-trader", "taxi-private-hire-driver", "landlord", "sole-trader-employees"],
  "itsa-final-declaration-deadline": ["sole-trader", "taxi-private-hire-driver", "landlord", "sole-trader-employees"],
  "itsa-mtd-partnerships-date-unset": ["partnership"],
  "ch-identity-verification-2025-11": COMPANIES,
  "ch-confirmation-statement-12-months": COMPANIES,
  "ch-accounts-9-months": COMPANIES,
  "ct600-12-months": COMPANIES,
  "ct-payment-9-months-1-day": COMPANIES,
};

const LINK = (href, text) => ({ href, text });
const NO_VAT = [LINK("#vat-mtd-all-registered-2022-04", "No VAT dates")];
const VAT = [LINK("#vat-mtd-all-registered-2022-04", "VAT returns")];
const ITSA_DATES = [
  LINK("#itsa-mtd-over-50k-2026-04", "Dates by income"),
  LINK("#itsa-quarterly-update-deadlines", "Quarterly updates"),
  LINK("#itsa-final-declaration-deadline", "Final declaration"),
];
const NONE = [{ text: "Not applicable" }];
const SELF_EMPLOYED_ROW = [NO_VAT, VAT, ITSA_DATES, NONE, NONE];
const COMPANY_ROW = [
  NO_VAT,
  VAT,
  [{ text: "Not in this rule" }],
  [
    LINK("#ch-confirmation-statement-12-months", "Confirmation statement"),
    LINK("#ch-identity-verification-2025-11", "Identity verification"),
  ],
  [
    LINK("#ch-accounts-9-months", "Annual accounts"),
    LINK("#ct600-12-months", "Company Tax Return"),
    LINK("#ct-payment-9-months-1-day", "Corporation Tax payment"),
  ],
];
export const BUSINESS_COLUMNS = [
  "Not VAT registered",
  "VAT registered",
  "Income Tax (MTD)",
  "Companies House filings",
  "Companies House accounts",
];
export const BUSINESS_CELLS = {
  "sole-trader": SELF_EMPLOYED_ROW,
  "taxi-private-hire-driver": SELF_EMPLOYED_ROW,
  "partnership": [NO_VAT, VAT, [LINK("#itsa-mtd-partnerships-date-unset", "No date yet")], NONE, NONE],
  "landlord": SELF_EMPLOYED_ROW,
  "sole-trader-employees": SELF_EMPLOYED_ROW,
  "owner-managed-company": COMPANY_ROW,
  "property-company": COMPANY_ROW,
  "small-company": COMPANY_ROW,
};

export const UNDATED_FACTS = [
  {
    id: "itsa-mtd-partnerships-date-unset",
    title: "Income Tax: partnerships",
    text: "Partnerships will use Making Tax Digital for Income Tax. HMRC has not yet set the date.",
  },
];

export function allFactIds() {
  return [...DATED_FACTS, QUARTERLY_FACT, FINAL_DECLARATION_FACT, ...COMPANY_YEARLY_FACTS, ...UNDATED_FACTS].map((f) => f.id);
}

function relevantHtml(factId) {
  const rule = RELEVANT_FOR[factId];
  if (!rule) return "";
  const names =
    rule === "all"
      ? "every business type in the table, once it is VAT registered"
      : BUSINESS_TYPES.filter((t) => rule.includes(t.id))
          .map((t) => t.label)
          .join(", ");
  return `<p class="relevant-for"><strong>Relevant for:</strong> ${escapeHtml(names)}.</p>`;
}

function businessTypesHtml() {
  const cell = (items) => items.map((i) => (i.href ? `<a href="${i.href}">${escapeHtml(i.text)}</a>` : escapeHtml(i.text))).join("<br />");
  const groups = [...new Set(BUSINESS_TYPES.map((t) => t.group))];
  const body = groups
    .map(
      (g) =>
        `<tbody><tr><th scope="rowgroup" colspan="${BUSINESS_COLUMNS.length + 1}">${g}</th></tr>` +
        BUSINESS_TYPES.filter((t) => t.group === g)
          .map(
            (t) =>
              `<tr><th scope="row">${escapeHtml(t.label)}</th>${BUSINESS_CELLS[t.id].map((c, i) => `<td data-label="${BUSINESS_COLUMNS[i]}">${cell(c)}</td>`).join("")}</tr>`,
          )
          .join("") +
        `</tbody>`,
    )
    .join("");
  return (
    `<div class="form-container" id="business-types"><h2>Which dates apply to your business</h2>` +
    `<p>Find your business type, then follow the link in each column to its dates. Making Tax Digital for Income Tax covers sole traders and landlords registered for Self Assessment, so a limited company is outside it. Partnerships have no date yet. A taxi or private hire driver, and a sole trader with employees, follow the sole trader rules.</p>` +
    `<div class="table-scroll"><table class="deadline-table stacked-table"><caption class="calendar-date">Business type against what applies</caption>` +
    `<thead><tr><th scope="col">Business type</th>${BUSINESS_COLUMNS.map((c) => `<th scope="col">${c}</th>`).join("")}</tr></thead>${body}</table></div></div>`
  );
}

function cellHtml([status, note]) {
  return escapeHtml(status) + (note ? ` <span class="calendar-date">${escapeHtml(note)}</span>` : "");
}

export function availabilityClass(status) {
  return `avail-${status.replace(" ", "-")}`;
}

function availabilityHtml() {
  const rows = AVAILABILITY.map((row) => {
    const links = [
      row.web ? `<a href="${row.web}" data-activity="${row.activity}">Web form</a>` : "",
      `<a href="guide.html">Guide</a>`,
      row.video ? `<a href="https://www.youtube.com/watch?v=${row.video}" rel="noopener">Video</a>` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const mcp = row.cells[4][0] === "not offered" ? "" : ` <a href="mcp.html">MCP</a>`;
    return (
      `<tr><th scope="row">${escapeHtml(row.filing)}</th>` +
      row.cells.map((c, i) => `<td class="${availabilityClass(c[0])}" data-label="${CHANNELS[i]}">${cellHtml(c)}</td>`).join("") +
      `<td data-label="Docs and video">${links}${mcp ? "," + mcp : ""}</td></tr>`
    );
  }).join("");
  return (
    `<div class="form-container" id="availability"><h2>What you can file, and how</h2>` +
    `<p>Production means you can use it for real. Sandbox means it runs against a test service and files nothing real. Preview means it runs on our simulator only.</p>` +
    `<!-- A change to what a business can file, or through which channel, or whether a feature is production, sandbox or preview, updates this table in the same change. -->` +
    `<div class="table-scroll"><table class="deadline-table stacked-table availability-table"><caption class="calendar-date">Availability by filing and channel</caption>` +
    `<thead><tr><th scope="col">Filing</th>${CHANNELS.map((c) => `<th scope="col">${c}</th>`).join("")}<th scope="col">Docs and video</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div></div>`
  );
}

function sourcesHtml(factId, sources) {
  const supporting = sources.filter((s) => s.facts.includes(factId));
  if (supporting.length === 0) throw new Error(`Fact ${factId} has no source file`);
  return supporting.map(sourceQuoteHtml).join("");
}

function entryHtml(fact, sources, heading, extraHtml = "") {
  return (
    `<li class="calendar-entry" id="${fact.id}">` +
    `<h3>${heading}</h3>` +
    `<p>${escapeHtml(fact.text)}</p>` +
    relevantHtml(fact.id) +
    (fact.optional ? `<p><strong>Optional:</strong> ${escapeHtml(fact.optional)}</p>` : "") +
    extraHtml +
    sourcesHtml(fact.id, sources) +
    `</li>`
  );
}

export function renderCalendarHtml(sources) {
  const dated = [...DATED_FACTS]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((f) => entryHtml(f, sources, `<span class="calendar-date">${formatIsoDate(f.date)}</span>${escapeHtml(f.title)}`))
    .join("");
  const deadlineTable =
    `<table class="deadline-table"><caption class="calendar-date">Standard update periods and deadlines</caption>` +
    `<thead><tr><th scope="col">Update period</th><th scope="col">Deadline</th></tr></thead><tbody>` +
    QUARTERLY_FACT.rows.map(([period, deadline]) => `<tr><td>${period}</td><td>${deadline}</td></tr>`).join("") +
    `</tbody></table>`;
  const yearly =
    entryHtml(QUARTERLY_FACT, sources, escapeHtml(QUARTERLY_FACT.title), deadlineTable) +
    entryHtml(FINAL_DECLARATION_FACT, sources, escapeHtml(FINAL_DECLARATION_FACT.title)) +
    COMPANY_YEARLY_FACTS.map((f) => entryHtml(f, sources, escapeHtml(f.title))).join("");
  const undated = UNDATED_FACTS.map((f) => entryHtml(f, sources, escapeHtml(f.title))).join("");

  return `<!doctype html>
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->
<!-- Generated by scripts/build-mtd-calendar.mjs from .claude/skills/tax-sources/sources; edit those, not this file. -->
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <title>MTD calendar - DIY Accounting Submit</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="What you can file and how, and when Making Tax Digital applies: VAT from April 2022, Income Tax from April 2026 by income level, quarterly updates, the final declaration and the Companies House and Corporation Tax dates. Each date links to its gov.uk source."
    />
    <link rel="canonical" href="https://submit.diyaccounting.co.uk/mtd-calendar.html" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="submit.css" />
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
      <h1>MTD calendar</h1>
      <p class="subtitle">MTD calendar: when Making Tax Digital applies to you</p>
    </header>

    <main id="mainContent">
      <div id="statusMessagesContainer" role="status" aria-live="polite"></div>

      ${businessTypesHtml()}

      ${availabilityHtml()}

      <div class="form-container">
        <h2>Dates</h2>
        <p>Each entry shows the words from the gov.uk page it comes from and the day we read that page.</p>
        <ol class="calendar">${dated}</ol>
      </div>

      <div class="form-container">
        <h2>Every year</h2>
        <ol class="calendar">${yearly}</ol>
      </div>

      <div class="form-container">
        <h2>No date yet</h2>
        <ol class="calendar">${undated}</ol>
      </div>
    </main>

    <footer></footer>

    <script src="widgets/page-chrome.js"></script>
    <script src="lib/env-loader.js"></script>
    <script type="module" src="./submit.js"></script>
    <script src="./developer-mode.js"></script>
    <script src="./lib/request-cache.js"></script>
    <script src="./lib/toml-parser.js"></script>
    <script src="widgets/entitlement-status.js"></script>
    <script src="widgets/auth-status.js"></script>
    <script type="module" src="widgets/view-source-link.js"></script>
    <script src="mtd-calendar.page.js"></script>
  </body>
</html>
`;
}

export async function renderMtdCalendar(sources = loadSources()) {
  const config = (await prettier.resolveConfig(PAGE_PATH)) ?? {};
  return prettier.format(renderCalendarHtml(sources), { ...config, filepath: PAGE_PATH });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(PAGE_PATH, await renderMtdCalendar());
  console.log(`wrote ${PAGE_PATH}`);
}
