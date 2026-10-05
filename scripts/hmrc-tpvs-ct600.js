#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Builds a complete CT600 submission (the return, the computations iXBRL and the FRS 102 accounts
 * iXBRL, with its IRmark) from a diya-gl Company book and posts it to HMRC's Third Party
 * Validation Service, which validates the body against the CT schema, the business rules, the
 * iXBRL and the IRmark and needs no credentials. Writes the submission and the response to the
 * output directory and exits non-zero unless TPVS answers a success response.
 *
 * Usage: node scripts/hmrc-tpvs-ct600.js [--book <dir>] [--out <dir>] [--utr <10 digits>]
 *   --book defaults to fixtures/diya-gl/precision-code-ltd; --out to target/hmrc-tpvs;
 *   --utr to 8596148860, the UTR HMRC's own CT600 samples use.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { deriveSmallCompanyAccounts } from "../app/services/smallCompanyAccounts.js";
import { buildSmallCompanyAccounts } from "../app/services/smallCompanyAccountsIxbrl.js";
import { deriveCompanyTaxReturn, buildCt600IrEnvelope } from "../app/services/ct600Xml.js";
import { buildCtComputations } from "../app/services/ctComputationsIxbrl.js";
import {
  buildCt600SubmissionRequest,
  parseTransactionEngineResponse,
  postToTransactionEngine,
  TPVS_CT600_URL,
} from "../app/services/hmrcTransactionEngine.js";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const bookDirectory = argument("--book", "fixtures/diya-gl/precision-code-ltd");
const outputDirectory = argument("--out", "target/hmrc-tpvs");
const utr = argument("--utr", "8596148860");

const { book, lines } = loadDiyaGlData(bookDirectory);
const session = { book, lines };
const accounts = await deriveSmallCompanyAccounts(session);
const directorName = accounts.directorName || "A Director";
const company = {
  companyName: accounts.companyName,
  companyNumber: accounts.companyNumber,
  utr,
  companyType: 0,
  declarantName: directorName,
  declarantStatus: "Director",
};
const { boxes, computationLines, periodStart, periodEnd } = await deriveCompanyTaxReturn(session, company);

const accountsIxbrl = buildSmallCompanyAccounts({
  companyNumber: accounts.companyNumber,
  companyName: accounts.companyName,
  periodStart: accounts.periodStart,
  periodEnd: accounts.periodEnd,
  priorBalanceSheetDate: accounts.priorBalanceSheetDate,
  averageNumberOfEmployees: accounts.averageNumberOfEmployees,
  principalActivity: book.entityInformation?.organizationDescription || "Trading",
  accountingPolicies: "The accounts are prepared under FRS 102 section 1A.",
  directors: accounts.directors.length > 0 ? accounts.directors : [directorName],
  directorName,
  dateOfApproval: periodEnd,
  balanceSheet: { current: accounts.balanceSheet.currentYear, prior: accounts.balanceSheet.priorYear },
  profitAndLoss: { current: accounts.profitAndLoss.currentYear },
  fixedAssetNote: accounts.fixedAssetNote,
});
const computationsIxbrl = buildCtComputations({
  companyName: company.companyName,
  companyNumber: company.companyNumber,
  utr,
  periodStart,
  periodEnd,
  tradeName: book.entityInformation?.organizationDescription || company.companyName,
  lines: computationLines,
});
const irEnvelopeXml = buildCt600IrEnvelope({ boxes, accountsIxbrl, computationsIxbrl });
const { xml, irmark } = buildCt600SubmissionRequest({
  senderId: "tpvs",
  password: "tpvs",
  utr,
  vendorId: "1000",
  productName: "DIY Accounting Submit",
  productVersion: "1.0",
  irEnvelopeXml,
  gatewayTest: true,
});

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "ct600-submission.xml"), xml);
const result = await postToTransactionEngine(TPVS_CT600_URL, xml);
writeFileSync(join(outputDirectory, "tpvs-response.xml"), result.data);
if (result.status !== 200) {
  console.error(
    `TPVS answered HTTP ${result.status}; an Akamai "Access Denied" page has followed bursts of posts, and a retry a minute later has passed`,
  );
  process.exit(1);
}
const response = parseTransactionEngineResponse(result.data);
console.log(JSON.stringify({ httpStatus: result.status, irmark, boxes, response }, null, 2));
if (response.qualifier !== "response" || response.errors.length > 0) process.exit(1);
