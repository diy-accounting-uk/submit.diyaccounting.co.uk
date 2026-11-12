// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcCtReturnRequest.js
// Validates a Company Tax Return request (the accounts figures and the CT600 figures a book export
// or the form supplies, plus the facts typed on the page) and builds the three documents the
// Transaction Engine takes: the CT600 IRenvelope with the full accounts (FRS 102 section 1A for a
// small company, FRS 105 with a profit and loss account for a micro-entity) and the
// computations attached as iXBRL. The boxes and computation lines are worked here, from the figures. Shared by the preview and the submit Lambdas.

import { parseRequestBody } from "../lib/httpResponseHelper.js";
import { readAmended, readLongPeriod } from "./jointFiling.js";
import { isValidIsoDate } from "../lib/hmrcValidation.js";
import { extractAndValidateAccountsParameters, buildAccountsIxbrl } from "../functions/companies-house/companiesHouseAccountsPost.js";
import { buildCt600IrEnvelope, ltdTaxDataForPeriodEnd } from "./ct600Xml.js";
import { Ct600RefusedError, addDays, addMonths, deriveCt600FromFigures, validateCt600Figures } from "./ct600Figures.js";
import { accountingPeriodsOf, deriveLongPeriodReturns } from "./ct600LongPeriod.js";
import { buildCtComputations } from "./ctComputationsIxbrl.js";
import { MICRO_PROFIT_AND_LOSS_LINES, microProfitAndLossProblems } from "./microEntityAccountsIxbrl.js";

const MAX_GATEWAY_CREDENTIAL_LENGTH = 128;

// The figures the customer or a book supplies. The company name and number, the UTR, the
// declarant and the profit and loss account come from the rest of the request.
const FIGURES_FIELDS = [
  "periodStart",
  "periodEnd",
  "companyType",
  "associatedCompanies",
  "nonTradingLoanRelationshipCredits",
  "depreciation",
  "amortisation",
  "entertaining",
  "annualInvestmentAllowance",
  "mainPoolAllowances",
  "mainPoolBalancingCharges",
  "fullExpensingAllowances",
  "fullExpensingBalancingCharges",
  "specialRateAllowances",
  "specialRateBalancingCharges",
  "specialRatePoolAllowances",
  "specialRatePoolAnnualInvestmentAllowance",
  "specialRatePoolBalancingCharges",
  "annualInvestmentAllowanceOutsideTrade",
  "firstYearAllowanceExpenditure",
  "specialRateAllowanceExpenditure",
  "otherMachineryAndPlantExpenditure",
  "lossesBroughtForward",
  "lossOutsideUk",
  "lossAgainstTotalProfits",
  "lossesBroughtForwardAgainstTotalProfits",
  "lossCarriedBack",
  "priorPeriodChargeableProfits",
  "donations",
  "directorsLoanOverdrawn",
  "directorsLoanOpeningOverdrawn",
  "loansToParticipators",
  "frankedInvestmentIncome",
  "incomeTaxDeducted",
  "taxAlreadyPaid",
  "ownCorporationTax",
  "workingSheet",
];

// Fields the rest of the request already validates under their own names.
const REQUEST_VALIDATED_FIELDS = new Set(["utr", "companyName", "companyNumber", "declarantName", "declarantStatus"]);

const LONG_PERIOD_FIRST_DAY_MESSAGE =
  "Submit files a long period when the first accounting period starts on the first day of the accounts.";

// The periods of a long period of account, or undefined with the reason in errorMessages when the
// request's dates cannot be one.
function longPeriodAccountingPeriods(figures, errorMessages) {
  try {
    const periods = accountingPeriodsOf(figures.periodStart, figures.periodEnd);
    if (periods.length === 1) {
      errorMessages.push("longPeriod and figures.accountingPeriods are for a period of account longer than 12 months");
      return undefined;
    }
    return periods;
  } catch (error) {
    if (!(error instanceof Ct600RefusedError)) throw error;
    errorMessages.push(error.message);
    return undefined;
  }
}

function readFigures(figures, { accounts, utr, declarant, longPeriod, longPeriodSent, requireLongPeriod }, errorMessages) {
  if (!figures || typeof figures !== "object" || Array.isArray(figures)) {
    errorMessages.push("Missing figures - the CT600 figures from the book export or the form");
    return undefined;
  }
  const checked = {};
  for (const field of FIGURES_FIELDS) {
    if (figures[field] !== undefined) checked[field] = figures[field];
  }
  const stitched = {
    ...checked,
    companyName: accounts.companyName,
    companyNumber: accounts.companyNumber,
    utr,
    declarantName: declarant.name,
    declarantStatus: declarant.status,
    profitAndLoss: accounts.profitAndLoss,
  };
  const working = figures.workingSheet;
  if (working !== undefined && !(Number.isFinite(working?.tradingProfit) && Number.isFinite(working?.corporationTax))) {
    errorMessages.push("figures.workingSheet needs a numeric tradingProfit and corporationTax");
    return stitched;
  }
  const isLongPeriod = longPeriod !== undefined || figures.accountingPeriods !== undefined;
  if (!isLongPeriod) {
    if (!accounts.profitAndLoss) return stitched;
    for (const problem of validateCt600Figures(stitched)) {
      if (!REQUEST_VALIDATED_FIELDS.has(problem.field)) errorMessages.push(problem.message);
    }
    return stitched;
  }

  if (!longPeriodSent && requireLongPeriod) {
    errorMessages.push(
      "Missing longPeriod - a period of account longer than 12 months files as two returns: send longPeriod.filingId and longPeriod.part",
    );
  }
  if (figures.accountingPeriods === undefined) {
    errorMessages.push("Missing figures.accountingPeriods - the figures of the two accounting periods of a long period of account");
    return stitched;
  }
  const periods = longPeriodAccountingPeriods(stitched, errorMessages);
  if (!periods) return stitched;
  if (accounts.periodStart && accounts.periodStart !== stitched.periodStart) errorMessages.push(LONG_PERIOD_FIRST_DAY_MESSAGE);
  const longFigures = { ...stitched, accountingPeriods: figures.accountingPeriods };
  if (!accounts.profitAndLoss) return longFigures;
  // The first accounting period is checked as a return of its own; deriveLongPeriodReturns checks
  // both when the documents are built.
  const firstPeriodFigures = figures.accountingPeriods[0];
  const firstReturnFigures = {
    ...stitched,
    ...(firstPeriodFigures && typeof firstPeriodFigures === "object" ? firstPeriodFigures : {}),
    ...periods[0],
  };
  for (const problem of validateCt600Figures(firstReturnFigures)) {
    if (!REQUEST_VALIDATED_FIELDS.has(problem.field)) errorMessages.push(problem.message);
  }
  return longFigures;
}

function readMicroProfitAndLossYear(values, label, errorMessages) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    errorMessages.push(`Missing ${label} - the micro-entity profit and loss account`);
    return undefined;
  }
  const year = {};
  for (const line of MICRO_PROFIT_AND_LOSS_LINES) {
    if (!Number.isFinite(values[line])) errorMessages.push(`Invalid or missing ${label}.${line}`);
    year[line] = values[line];
  }
  if (MICRO_PROFIT_AND_LOSS_LINES.every((line) => Number.isFinite(year[line]))) {
    for (const problem of microProfitAndLossProblems(year)) errorMessages.push(`${label}: ${problem}`);
  }
  return year;
}

// A micro-entity request carries the profit and loss account beside its balance sheet, because the
// Companies House copy of micro accounts omits it and HMRC takes it with the return.
function attachMicroProfitAndLoss(accounts, profitAndLoss, errorMessages) {
  if (accounts.dormant) errorMessages.push("A dormant company files no Company Tax Return profit and loss account: dormant must be false");
  const current = readMicroProfitAndLossYear(profitAndLoss?.currentYear, "profitAndLoss.currentYear", errorMessages);
  const prior = profitAndLoss?.priorYear
    ? readMicroProfitAndLossYear(profitAndLoss.priorYear, "profitAndLoss.priorYear", errorMessages)
    : undefined;
  accounts.profitAndLoss = { current, ...(prior ? { prior } : {}) };
}

function validCredential(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_GATEWAY_CREDENTIAL_LENGTH;
}

function readReviewedBoxes(reviewedBoxes, required, errorMessages) {
  if (reviewedBoxes === undefined && !required) return undefined;
  if (!reviewedBoxes || typeof reviewedBoxes !== "object" || Array.isArray(reviewedBoxes)) {
    errorMessages.push("Missing reviewedBoxes - the boxes the customer reviewed, box number to value");
    return undefined;
  }
  for (const [box, value] of Object.entries(reviewedBoxes)) {
    if (!/^\d{1,4}[A-Z]?$/.test(box) || !(typeof value === "number" ? Number.isFinite(value) : typeof value === "string")) {
      errorMessages.push(`Invalid reviewedBoxes entry for box ${box}`);
    }
  }
  return reviewedBoxes;
}

/**
 * The box numbers whose value differs between the boxes the customer reviewed and the boxes the
 * server worked from the same request, in ascending order.
 * @param {object} reviewedBoxes
 * @param {object} workedBoxes
 * @returns {string[]}
 */
export function boxesThatDiffer(reviewedBoxes, workedBoxes) {
  const all = new Set([...Object.keys(reviewedBoxes), ...Object.keys(workedBoxes)]);
  return [...all].filter((box) => reviewedBoxes[box] !== workedBoxes[box]).sort((a, b) => Number(a) - Number(b));
}

/**
 * Extract and validate a Company Tax Return request. Validation messages are appended to
 * errorMessages; the returned object is only usable when none were added.
 *
 * @param {object} event - the Lambda event
 * @param {string[]} errorMessages
 * @param {object} [options]
 * @param {boolean} [options.requireGatewayCredentials] - true for the submit, false for the preview
 * @param {boolean} [options.requireReviewedBoxes] - true for the submit, false for the preview
 * @param {boolean} [options.requireLongPeriod] - true for the submit, false for the preview: a period of account longer than 12 months names its filing and part
 * @param {{clientId: string, identifiers: {companyNumber: string, utr: string}}} [options.client] - the practice's client row, for a client-scoped request
 */
export function extractAndValidateCtReturnParameters(
  event,
  errorMessages,
  { requireGatewayCredentials = true, requireReviewedBoxes = true, requireLongPeriod = true, client } = {},
) {
  const body = parseRequestBody(event) || {};
  const clientId = client?.clientId;
  const accounts = extractAndValidateAccountsParameters(event, errorMessages, { requireCompanyAuthCode: false, clientId });
  // A client request takes the company number and the UTR from the client row, never from the body.
  if (client) accounts.companyNumber = client.identifiers?.companyNumber;
  if (accounts.regime === "micro-entity") {
    attachMicroProfitAndLoss(accounts, body.profitAndLoss, errorMessages);
  } else if (accounts.filleted) {
    errorMessages.push("smallCompany.filleted must be false: HMRC takes the full accounts");
  }

  const typedUtr = typeof body.utr === "string" ? body.utr.trim() : "";
  const utr = client ? String(client.identifiers?.utr ?? "").trim() : typedUtr;
  if (!/^\d{10}$/.test(utr))
    errorMessages.push(
      client ? "The client has no valid UTR - add the company's UTR on Practice clients" : "Invalid utr - must be 10 digits",
    );
  if (client && !accounts.companyNumber) errorMessages.push("The client has no company number - add it on Practice clients");

  let agent;
  if (client) {
    const practiceName = typeof body.agent?.practiceName === "string" ? body.agent.practiceName.trim() : "";
    if (!practiceName) errorMessages.push("Missing agent.practiceName - the practice's name for HMRC's records");
    if (body.agent?.authorisationConfirmed !== true) {
      errorMessages.push("The practice must confirm that the company has authorised it for Corporation Tax and approved this return");
    }
    agent = { reference: clientId, practiceName };
  }

  const tradeName = typeof body.tradeName === "string" ? body.tradeName.trim() : "";
  if (!tradeName) errorMessages.push("Missing tradeName");

  const declarantName = typeof body.declarant?.name === "string" ? body.declarant.name.trim() : "";
  const declarantStatus = typeof body.declarant?.status === "string" ? body.declarant.status.trim() : "";
  if (declarantName.length < 2) errorMessages.push("Missing declarant.name");
  if (declarantStatus.length < 2) errorMessages.push("Missing declarant.status");

  if (body.declarationAccepted !== true) errorMessages.push("The declarant must accept the declaration");

  const longPeriod = readLongPeriod(body, errorMessages);
  const figures = readFigures(
    body.figures,
    {
      accounts,
      utr,
      declarant: { name: declarantName, status: declarantStatus },
      longPeriod,
      longPeriodSent: body.longPeriod !== undefined && body.longPeriod !== null,
      requireLongPeriod,
    },
    errorMessages,
  );
  if (figures && accounts.periodStart && accounts.periodEnd && isValidIsoDate(figures.periodStart) && isValidIsoDate(figures.periodEnd)) {
    if (accounts.periodEnd < figures.periodStart || accounts.periodStart > figures.periodEnd) {
      errorMessages.push("The accounts period does not overlap the return period");
    }
  }

  let gatewayUserId;
  let gatewayPassword;
  if (requireGatewayCredentials) {
    gatewayUserId = typeof body.gatewayUserId === "string" ? body.gatewayUserId.trim() : "";
    gatewayPassword = body.gatewayPassword;
    if (!validCredential(gatewayUserId)) errorMessages.push("Invalid gatewayUserId");
    if (!validCredential(gatewayPassword)) errorMessages.push("Invalid gatewayPassword");
  }

  const reviewedBoxes = readReviewedBoxes(body.reviewedBoxes, requireReviewedBoxes, errorMessages);
  const amended = readAmended(body, errorMessages);

  return {
    amended,
    longPeriod,
    accounts,
    utr,
    tradeName,
    declarant: { name: declarantName, status: declarantStatus },
    figures,
    reviewedBoxes,
    agent,
    gatewayUserId,
    gatewayPassword,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function documentsOf({ accounts, utr, tradeName, figures, amended, agent }, derived, accountsIxbrl) {
  const { boxes, ct600a, computationLines, losses, carryBack, worked, periodStart, periodEnd, periodOfAccount } = derived;
  const computationsIxbrl = buildCtComputations({
    companyName: accounts.companyName,
    companyNumber: accounts.companyNumber,
    utr,
    periodStart,
    periodEnd,
    ...(periodOfAccount ? { periodOfAccount } : {}),
    tradeName,
    lines: computationLines,
    losses,
    carryBack,
    tradeOutsideUk: figures.lossOutsideUk === true,
  });
  const irEnvelopeXml = buildCt600IrEnvelope({ boxes, ct600a, accountsIxbrl, computationsIxbrl, amended, agent });
  return {
    irEnvelopeXml,
    accountsIxbrl,
    computationsIxbrl,
    boxes,
    ct600a,
    computationLines,
    losses,
    carryBack,
    worked,
    periodStart,
    periodEnd,
  };
}

// Tax is due the day after nine months from the end of the accounting period (TMA 1970 s59D(1)): a
// period that ends on the last day of a month is due on the first day of the tenth month after it.
function taxDueDate(periodEnd) {
  const endsOnMonthEnd = addDays(periodEnd, 1).endsWith("-01");
  return endsOnMonthEnd ? addMonths(addDays(periodEnd, 1), 9) : addDays(addMonths(periodEnd, 9), 1);
}

// Both returns of a long period of account file 12 months after the period of account ends
// (FA 1998 Sch 18 para 14(1)(b)).
function returnDueDate(periodOfAccountEnd) {
  return addMonths(periodOfAccountEnd, 12);
}

/**
 * Build the two returns of a long period of account, in order, each with its CT600 IRenvelope, its
 * computations, its boxes and its two due dates. Both carry the same accounts iXBRL, built once.
 * @param {ReturnType<typeof extractAndValidateCtReturnParameters>} request - a request with figures.accountingPeriods
 * @returns {Array<ReturnType<typeof buildCtReturnDocuments> & {part: 1|2, periodStart: string, periodEnd: string, taxDueDate: string, returnDueDate: string}>}
 */
export function buildLongPeriodReturnDocuments(request) {
  const { figures, accounts } = request;
  const [first] = accountingPeriodsOf(figures.periodStart, figures.periodEnd);
  const taxData = { ...ltdTaxDataForPeriodEnd(first.periodEnd), ...ltdTaxDataForPeriodEnd(figures.periodEnd) };
  const accountsIxbrl = buildAccountsIxbrl(accounts);
  return deriveLongPeriodReturns(figures, taxData, { today: todayIso() }).map((derived, index) => ({
    part: index + 1,
    ...documentsOf(request, derived, accountsIxbrl),
    taxDueDate: taxDueDate(derived.periodEnd),
    returnDueDate: returnDueDate(figures.periodEnd),
  }));
}

/**
 * Build the CT600 IRenvelope and the two attachments for a validated request. The server works
 * every box and computation line from the figures, so the return, the accounts and the
 * computations name the same company, UTR and declarant. An amended request builds the return
 * with ReturnType="amended", which replaces the return HMRC holds for the period. A request of a
 * long period of account builds both returns, because the second one's carry-back reaches the
 * first, and answers the part the request names.
 * @param {ReturnType<typeof extractAndValidateCtReturnParameters>} request
 * @returns {{irEnvelopeXml: string, accountsIxbrl: string, computationsIxbrl: string, boxes: object, ct600a: object|undefined, computationLines: object, losses: object, carryBack: object|undefined, worked: object, periodStart: string, periodEnd: string}}
 */
export function buildCtReturnDocuments(request) {
  if (request.longPeriod) return buildLongPeriodReturnDocuments(request)[request.longPeriod.part - 1];
  const { figures, accounts } = request;
  const derived = deriveCt600FromFigures(figures, ltdTaxDataForPeriodEnd(figures.periodEnd), { today: todayIso() });
  return documentsOf(request, derived, buildAccountsIxbrl(accounts));
}
