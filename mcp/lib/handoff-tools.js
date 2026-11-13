// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-24 Hand the VAT figures to the browser to file
// - **Use when:** an assistant has derived a VAT return and the user must check, declare and file it on the Submit page.
// - **Does:** prepareVatReturn in mcp/lib/handoff-tools.js derives the return again from the loaded book and builds the link to the VAT form with the seven figures in the URL fragment as "#books=<base64url JSON>". It files nothing and calls no service; the fragment never reaches a server.
// - **Run:** no command; see Does and Entry
// - **Entry:** `mcp/lib/handoff-tools.js:prepareVatReturn`; `mcp/lib/handoff-tools.js:vatHandoffLink`
// - **Files:** mcp/lib/handoff-tools.js, mcp/test/handoff-tools.test.js
// - **Keywords:** prepare_vat_return, hand off, books fragment, vat form link, file in the browser
// - **Related:** MCP-05
// @end-capability

// handoff-tools.js -- prepare_vat_return: the link that opens the VAT form with the figures
// filled in. The page decodes the fragment in web/public/lib/auth-url-builder.js and fills the
// form in web/public/widgets/books-import.js; this module writes what those two read.

import { basename } from "node:path";

import { packageVersion } from "@diy-accounting-uk/diya-gl/dist/app/lib/package-version.js";

import { deriveVatReturn } from "./vat-tools.js";

const VAT_FORM_PATH = "/hmrc/vat/submitVat.html";

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

function baseUrl() {
  const value = process.env.DIYA_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

/**
 * The link to the VAT form that carries a handoff in its fragment.
 * @param {{kind: string, sourceFileName: string, packageVersion: string, period: Object, figures: Object}} handoff
 * @returns {string}
 */
export function vatHandoffLink(handoff) {
  const encoded = Buffer.from(JSON.stringify(handoff), "utf8").toString("base64url");
  return `${baseUrl()}${VAT_FORM_PATH}#books=${encoded}`;
}

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
  const link = vatHandoffLink({
    kind: "vat",
    sourceFileName: session.sourcePath ? basename(session.sourcePath) : session.book.entityInformation?.organizationDescription || "book",
    packageVersion: await packageVersion(),
    period,
    figures,
  });
  return {
    link,
    period,
    figures,
    instruction: "Open this link, check the figures on the page, tick the declaration and file the return there. Nothing has been filed.",
  };
}
