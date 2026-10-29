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
 * With --micro the attachment is the book's company filing as a micro-entity: FRS 105 accounts with
 * the profit and loss account the return carries.
 *
 * With --amended the return is an amended return (ReturnType="amended") and the attached accounts
 * are revised accounts that replace the original accounts.
 *
 * Usage: node scripts/hmrc-tpvs-ct600.js [--book <dir>] [--out <dir>] [--utr <10 digits>] [--prior <file>] [--micro] [--amended]
 *   --book defaults to fixtures/diya-gl/precision-code-ltd; --out to target/hmrc-tpvs;
 *   --utr to 8596148860, the UTR HMRC's own CT600 samples use; --prior names a JSON file of the
 *   prior year's profit and loss lines, which the accounts then show as the comparative column
 *   (a book publishes none).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { deriveSmallCompanyAccounts } from "../app/services/smallCompanyAccounts.js";
import { buildSmallCompanyAccounts } from "../app/services/smallCompanyAccountsIxbrl.js";
import { buildMicroEntityAccounts } from "../app/services/microEntityAccountsIxbrl.js";
import { deriveMicroEntityAccounts, microProfitAndLossYear } from "../app/services/microEntityAccounts.js";
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
const micro = process.argv.includes("--micro");
const amended = process.argv.includes("--amended");
// The book holds no registered office; the TPVS fixture company takes a labelled test address unless one is given.
const registeredOffice = {
  addressLine1: argument("--registered-office-line1", "1 Test Street (TPVS test address)"),
  cityOrTown: argument("--registered-office-town", "London"),
  postalCode: argument("--registered-office-postcode", "EC1A 1AA"),
};
const priorFile = argument("--prior", undefined);
const priorYearProfitAndLoss = priorFile ? JSON.parse(readFileSync(priorFile, "utf8")) : undefined;

const { book, lines } = loadDiyaGlData(bookDirectory);
const session = { book, lines };
const accounts = await deriveSmallCompanyAccounts(session, { priorYearProfitAndLoss });
const directorName = accounts.directorName || "A Director";
const company = {
  companyName: accounts.companyName,
  companyNumber: accounts.companyNumber,
  utr,
  companyType: 0,
  declarantName: directorName,
  declarantStatus: "Director",
};
const { boxes, computationLines, losses, carryBack, periodStart, periodEnd, figures } = await deriveCompanyTaxReturn(session, company, {
  priorYearProfitAndLoss,
});

const depreciation = figures.depreciation ?? 0;
const revision = amended
  ? {
      originalDateOfApproval: periodEnd,
      differences: "The tax charge in the profit and loss account is restated to match the amended return.",
    }
  : undefined;
const microAccounts = micro ? await deriveMicroEntityAccounts(session) : undefined;
const accountsIxbrl = micro
  ? buildMicroEntityAccounts({
      companyNumber: accounts.companyNumber,
      companyName: accounts.companyName,
      registeredOffice,
      periodStart: accounts.periodStart,
      periodEnd: accounts.periodEnd,
      priorBalanceSheetDate: accounts.priorBalanceSheetDate,
      averageNumberOfEmployees: accounts.averageNumberOfEmployees,
      directorName,
      dateOfApproval: periodEnd,
      ...(revision ? { revision } : {}),
      balanceSheet: { current: microAccounts.balanceSheet.currentYear, prior: microAccounts.balanceSheet.priorYear },
      profitAndLoss: { current: microProfitAndLossYear(accounts.profitAndLoss.currentYear, depreciation) },
    })
  : buildSmallCompanyAccounts({
      companyNumber: accounts.companyNumber,
      companyName: accounts.companyName,
      registeredOffice,
      periodStart: accounts.periodStart,
      periodEnd: accounts.periodEnd,
      priorBalanceSheetDate: accounts.priorBalanceSheetDate,
      averageNumberOfEmployees: accounts.averageNumberOfEmployees,
      principalActivity: book.entityInformation?.organizationDescription || "Trading",
      accountingPolicies: "The accounts are prepared under FRS 102 section 1A.",
      directors: accounts.directors.length > 0 ? accounts.directors : [directorName],
      directorName,
      dateOfApproval: periodEnd,
      ...(revision ? { revision } : {}),
      balanceSheet: { current: accounts.balanceSheet.currentYear, prior: accounts.balanceSheet.priorYear },
      profitAndLoss: {
        current: accounts.profitAndLoss.currentYear,
        ...(accounts.profitAndLoss.priorYear ? { prior: accounts.profitAndLoss.priorYear } : {}),
      },
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
  losses,
  carryBack,
  tradeOutsideUk: figures.lossOutsideUk === true,
});
const irEnvelopeXml = buildCt600IrEnvelope({ boxes, accountsIxbrl, computationsIxbrl, amended });
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
const outputPrefix = amended ? "ct600-amended" : "ct600";
writeFileSync(join(outputDirectory, `${outputPrefix}-submission.xml`), xml);
const result = await postToTransactionEngine(TPVS_CT600_URL, xml);
writeFileSync(join(outputDirectory, `${outputPrefix}-tpvs-response.xml`), result.data);
if (result.status !== 200) {
  console.error(
    `TPVS answered HTTP ${result.status}; an Akamai "Access Denied" page has followed bursts of posts, and a retry a minute later has passed`,
  );
  process.exit(1);
}
const response = parseTransactionEngineResponse(result.data);
console.log(JSON.stringify({ httpStatus: result.status, irmark, boxes, response }, null, 2));
if (response.qualifier !== "response" || response.errors.length > 0) process.exit(1);
