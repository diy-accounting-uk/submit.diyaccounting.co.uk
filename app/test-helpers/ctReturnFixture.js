// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/ctReturnFixture.js
// Builds a Company Tax Return request body from a diya-gl Company book fixture: the accounts
// figures, the CT600 figures a book export supplies, plus the facts the
// page asks the user to type.

import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { deriveSmallCompanyAccounts } from "../services/smallCompanyAccounts.js";
import { deriveMicroEntityAccounts, microProfitAndLossYear } from "../services/microEntityAccounts.js";
import { deriveCompanyTaxReturn } from "../services/ct600Xml.js";

export const FIXTURE_BOOK_DIRECTORY = "fixtures/diya-gl/precision-code-ltd";
export const FIXTURE_UTR = "8596148860";
const FIXTURE_REGISTERED_OFFICE = { addressLine1: "1 Test Street", cityOrTown: "London", postalCode: "EC1A 1AA" };

/**
 * The figures a book export supplies: the accounts and the CT600 figures.
 * @param {object} [options]
 * @param {string} [options.bookDirectory]
 * @returns {Promise<object>}
 */
export async function buildCtReturnExportFromBook({ bookDirectory = FIXTURE_BOOK_DIRECTORY } = {}) {
  const { book, lines } = loadDiyaGlData(bookDirectory);
  const session = { book, lines };
  const accounts = await deriveSmallCompanyAccounts(session);
  const directorName = accounts.directorName || "A Director";
  const { figures, periodEnd } = await deriveCompanyTaxReturn(session, {
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
    registeredOffice: FIXTURE_REGISTERED_OFFICE,
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
    figures,
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

/**
 * The same company filing as a micro-entity: its FRS 105 balance sheet from the book, the profit and
 * loss account the Company Tax Return carries, and the micro statements in place of the small ones.
 * @param {object} [options]
 * @param {string} [options.bookDirectory]
 * @param {string} [options.utr]
 * @returns {Promise<object>} the request body, without Government Gateway credentials
 */
export async function buildMicroCtReturnBodyFromBook({ bookDirectory = FIXTURE_BOOK_DIRECTORY, utr = FIXTURE_UTR } = {}) {
  const small = await buildCtReturnBodyFromBook({ bookDirectory, utr });
  const { book, lines } = loadDiyaGlData(bookDirectory);
  const micro = await deriveMicroEntityAccounts({ book, lines });
  const { smallCompany, ...rest } = small;
  const depreciation = small.figures.depreciation ?? 0;
  return {
    ...rest,
    balanceSheet: micro.balanceSheet,
    profitAndLoss: { currentYear: microProfitAndLossYear(smallCompany.profitAndLoss.currentYear, depreciation) },
    statementsAccepted: {
      section477Exemption: true,
      membersNotRequiredAudit: true,
      directorsResponsibilities: true,
      microEntityProvisions: true,
    },
  };
}
