// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/ctReturnFixture.js
// Builds a Company Tax Return request body from a diya-gl Company book fixture: the accounts
// figures, the CT600 boxes and the computation lines a book export supplies, plus the facts the
// page asks the user to type.

import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { deriveSmallCompanyAccounts } from "../services/smallCompanyAccounts.js";
import { deriveCompanyTaxReturn } from "../services/ct600Xml.js";

export const FIXTURE_BOOK_DIRECTORY = "fixtures/diya-gl/precision-code-ltd";
export const FIXTURE_UTR = "8596148860";

/**
 * The figures a book export supplies: the accounts, the CT600 boxes and the computation lines.
 * @param {object} [options]
 * @param {string} [options.bookDirectory]
 * @returns {Promise<object>}
 */
export async function buildCtReturnExportFromBook({ bookDirectory = FIXTURE_BOOK_DIRECTORY } = {}) {
  const { book, lines } = loadDiyaGlData(bookDirectory);
  const session = { book, lines };
  const accounts = await deriveSmallCompanyAccounts(session);
  const directorName = accounts.directorName || "A Director";
  const { boxes, computationLines, periodStart, periodEnd } = await deriveCompanyTaxReturn(session, {
    companyName: accounts.companyName,
    companyNumber: accounts.companyNumber,
    utr: FIXTURE_UTR,
    companyType: 0,
    declarantName: directorName,
    declarantStatus: "Director",
  });
  const tradeName = book.entityInformation?.organizationDescription || accounts.companyName;
  return {
    companyNumber: accounts.companyNumber,
    companyName: accounts.companyName,
    periodStart: accounts.periodStart,
    periodEnd: accounts.periodEnd,
    averageEmployees: accounts.averageNumberOfEmployees,
    director: { name: directorName, dateApproved: periodEnd },
    tradeName,
    smallCompany: {
      principalActivity: tradeName,
      accountingPolicies: "The accounts are prepared under FRS 102 section 1A.",
      directors: accounts.directors.length > 0 ? accounts.directors : [directorName],
      balanceSheet: accounts.balanceSheet,
      profitAndLoss: { currentYear: accounts.profitAndLoss.currentYear },
      fixedAssetNote: accounts.fixedAssetNote,
    },
    boxes: { ...boxes, 30: periodStart, 35: periodEnd },
    computationLines,
  };
}

/**
 * A complete request body: the book export plus the facts the page asks the user to type.
 * @param {object} [options]
 * @param {string} [options.bookDirectory]
 * @param {string} [options.utr]
 * @returns {Promise<object>} the request body, without Government Gateway credentials
 */
export async function buildCtReturnBodyFromBook({ bookDirectory = FIXTURE_BOOK_DIRECTORY, utr = FIXTURE_UTR } = {}) {
  const exported = await buildCtReturnExportFromBook({ bookDirectory });
  return {
    ...exported,
    statementsAccepted: {
      section477Exemption: true,
      membersNotRequiredAudit: true,
      directorsResponsibilities: true,
      smallCompaniesRegime: true,
    },
    utr,
    declarant: { name: exported.director.name, status: "Director" },
    directorsLoanOverdrawn: false,
    declarationAccepted: true,
  };
}
