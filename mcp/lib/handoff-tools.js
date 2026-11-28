// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-24 Hand the VAT, accounts and Company Tax Return figures to the browser to file
// - **Use when:** an assistant has derived a VAT return, a company's micro-entity or small company accounts or a Company Tax Return, and the user must check and file it on the Submit page.
// - **Does:** prepareVatReturn, prepareMicroEntityAccounts, prepareSmallCompanyAccounts and prepareCompanyTaxReturn in mcp/lib/handoff-tools.js derive the figures again from the loaded book and build the link to the form with them in the URL fragment as "#books=<base64url JSON>", after a query that names the assistant as the campaign source ("?utm_source=<client kind>&utm_medium=mcp"). They file nothing and call no service; the fragment never reaches a server.
// - **Run:** no command; see Does and Entry
// - **Entry:** `mcp/lib/handoff-tools.js:prepareVatReturn`; `mcp/lib/handoff-tools.js:prepareMicroEntityAccounts`; `mcp/lib/handoff-tools.js:prepareSmallCompanyAccounts`; `mcp/lib/handoff-tools.js:prepareCompanyTaxReturn`; `mcp/lib/handoff-tools.js:handoffLink`
// - **Files:** mcp/lib/handoff-tools.js, mcp/test/handoff-tools.test.js, web/public/widgets/books-import.js
// - **Keywords:** prepare_vat_return, prepare_micro_entity_accounts, prepare_small_company_accounts, prepare_company_tax_return, hand off, books fragment, form link, file in the browser
// - **Related:** MCP-05
// @end-capability

// handoff-tools.js -- prepare_vat_return, prepare_micro_entity_accounts, prepare_small_company_accounts
// and prepare_company_tax_return: the links that open each form with the figures filled in. The page
// decodes the fragment in web/public/lib/auth-url-builder.js and fills the form in
// web/public/widgets/books-import.js; this module writes what those two read.

import { basename } from "node:path";

import { packageVersion } from "@diy-accounting-uk/diya-gl/dist/app/lib/package-version.js";

import { deriveCompanyTaxReturn, deriveMicroEntityAccounts, deriveSmallCompanyAccounts } from "./accounts-tools.js";
import { deriveVatReturn } from "./vat-tools.js";

const VAT_FORM_PATH = "/hmrc/vat/submitVat.html";
const MICRO_ENTITY_ACCOUNTS_FORM_PATH = "/companies-house/fileMicroEntityAccounts.html";
const SMALL_COMPANY_ACCOUNTS_FORM_PATH = "/companies-house/fileSmallCompanyAccounts.html";
const COMPANY_TAX_RETURN_FORM_PATH = "/companies-house/fileCompanyTaxReturn.html";

// The seven figures the form takes. The page computes boxes 3 and 5 itself.
const VAT_FIGURE_NAMES = [
  "vatDueSales",
  "vatDueAcquisitions",
  "vatReclaimedCurrPeriod",
  "totalValueSalesExVAT",
  "totalValuePurchasesExVAT",
  "totalValueGoodsSuppliedExVAT",
  "totalAcquisitionsExVAT",
];

// The link goes to a person, so it carries the public address of the environment, the one the
// customer signs in on. DIYA_SUBMIT_BASE_URL is the deployment's own host, which the tools call.
function publicBaseUrl() {
  const value = process.env.DIY_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIY_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

/**
 * The link to a form that carries a handoff in its fragment. The query names the assistant as the
 * campaign source, so the page's landing capture and the account's acquisition record say which
 * assistant sent the person.
 * @param {string} formPath - the form's path on the site
 * @param {{kind: string, sourceFileName: string, packageVersion: string, period: Object, figures: Object}} handoff
 * @param {string} client - the assistant's kind, from client-kind.js
 * @returns {string}
 */
export function handoffLink(formPath, handoff, client) {
  const encoded = Buffer.from(JSON.stringify(handoff), "utf8").toString("base64url");
  const campaign = `?utm_source=${encodeURIComponent(client)}&utm_medium=mcp`;
  return `${publicBaseUrl()}${formPath}${campaign}#books=${encoded}`;
}

// The name the page shows for where the figures came from: the opened file, or the business.
function sourceNameOf(session) {
  return session.sourcePath ? basename(session.sourcePath) : session.book.entityInformation?.organizationDescription || "book";
}

// What the person does with the link: the plugin files nothing, so the return is filed in the browser.
export const VAT_FILING_SENTENCE =
  "Open this link, check the figures on the page, tick the declaration and file the return there in your browser. Nothing has been filed.";

/**
 * prepare_vat_return: derives the return for the quarter ending on periodEnd from the session's
 * loaded book, the way derive_vat_return does, and answers the link that opens the VAT form with
 * those figures. Deriving here, in place of taking figures as arguments, means the link can only
 * carry what derive_vat_return answers for the same period.
 * @param {Object} session
 * @param {{periodEnd: string, periodStart?: string, periodKey?: string}} params
 */
export async function prepareVatReturn(session, params = {}) {
  const derived = await deriveVatReturn(session, params);
  const figures = {};
  for (const name of VAT_FIGURE_NAMES) {
    const value = derived.hmrc?.[name];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`The derived return carries no number for ${name}`);
    figures[name] = value;
  }
  const period = { periodStart: derived.periodStart, periodEnd: derived.periodEnd };
  const link = handoffLink(
    VAT_FORM_PATH,
    { kind: "vat", sourceFileName: sourceNameOf(session), packageVersion: await packageVersion(), period, figures },
    session.client,
  );
  return {
    link,
    period,
    figures,
    instruction: VAT_FILING_SENTENCE,
  };
}

// What the person does with an accounts link: the page asks for the company first, then fills.
export const ACCOUNTS_FILING_SENTENCE =
  "Open this link, look up the company, check the figures on the page, add what it asks for and file the accounts there in your browser. Nothing has been filed.";

export const COMPANY_TAX_RETURN_FILING_SENTENCE =
  "Open this link, look up the company, check the figures on the page, fill the rest of the return and file it there in your browser. Nothing has been filed.";

// What each accounts form fills from the derivation; the derivation's working and notes stay out of the link.
const MICRO_ENTITY_FIGURE_NAMES = [
  "companyNumber",
  "companyName",
  "periodStart",
  "periodEnd",
  "averageNumberOfEmployees",
  "directorName",
  "dormant",
  "profitAndLoss",
  "balanceSheet",
];
const SMALL_COMPANY_FIGURE_NAMES = [
  "companyNumber",
  "companyName",
  "periodStart",
  "periodEnd",
  "averageNumberOfEmployees",
  "directors",
  "directorName",
  "profitAndLoss",
  "profitAndLossFormat2",
  "balanceSheet",
  "fixedAssetNote",
];

function pick(accounts, names) {
  return Object.fromEntries(names.filter((name) => accounts[name] !== undefined).map((name) => [name, accounts[name]]));
}

async function accountsHandoff(session, { kind, formPath, accounts, names }) {
  const figures = pick(accounts, names);
  const period = { periodStart: accounts.periodStart, periodEnd: accounts.periodEnd };
  const link = handoffLink(
    formPath,
    { kind, sourceFileName: sourceNameOf(session), packageVersion: await packageVersion(), period, figures },
    session.client,
  );
  return { link, period, companyNumber: accounts.companyNumber, instruction: ACCOUNTS_FILING_SENTENCE };
}

/**
 * prepare_micro_entity_accounts: derives the micro-entity accounts from the session's loaded book,
 * as derive_micro_entity_accounts does, and answers the link that opens the micro-entity accounts
 * form with those figures.
 * @param {Object} session
 */
export async function prepareMicroEntityAccounts(session) {
  const accounts = await deriveMicroEntityAccounts(session);
  return accountsHandoff(session, {
    kind: "micro-entity-accounts",
    formPath: MICRO_ENTITY_ACCOUNTS_FORM_PATH,
    accounts,
    names: MICRO_ENTITY_FIGURE_NAMES,
  });
}

/**
 * prepare_small_company_accounts: derives the small company accounts from the session's loaded
 * book, as derive_small_company_accounts does, and answers the link that opens the small company
 * accounts form with those figures.
 * @param {Object} session
 */
export async function prepareSmallCompanyAccounts(session) {
  const accounts = await deriveSmallCompanyAccounts(session);
  return accountsHandoff(session, {
    kind: "small-company-accounts",
    formPath: SMALL_COMPANY_ACCOUNTS_FORM_PATH,
    accounts,
    names: SMALL_COMPANY_FIGURE_NAMES,
  });
}

/**
 * prepare_company_tax_return: derives the Company Tax Return figures from the session's loaded
 * book, as derive_company_tax_return does, and answers the link that opens the Company Tax Return
 * form with them. The figures are the profit and loss account and the computation; the person
 * fills the balance sheet and the rest of the return on the page.
 * @param {Object} session
 */
export async function prepareCompanyTaxReturn(session) {
  const handoff = await deriveCompanyTaxReturn(session, {});
  const link = handoffLink(COMPANY_TAX_RETURN_FORM_PATH, handoff, session.client);
  return { link, period: handoff.period, instruction: COMPANY_TAX_RETURN_FILING_SENTENCE };
}
