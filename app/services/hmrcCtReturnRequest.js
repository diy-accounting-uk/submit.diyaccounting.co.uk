// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcCtReturnRequest.js
// Validates a Company Tax Return request (the accounts figures and the CT600 figures a book export
// or the form supplies, plus the facts typed on the page) and builds the three documents the
// Transaction Engine takes: the CT600 IRenvelope with the full accounts (FRS 102 section 1A for a
// small company, FRS 105 with a profit and loss account for a micro-entity) and the
// computations attached as iXBRL. The boxes and computation lines are worked here, from the figures. Shared by the preview and the submit Lambdas.

import { parseRequestBody } from "../lib/httpResponseHelper.js";
import { readAmended } from "./jointFiling.js";
import { isValidIsoDate } from "../lib/hmrcValidation.js";
import { extractAndValidateAccountsParameters, buildAccountsIxbrl } from "../functions/companies-house/companiesHouseAccountsPost.js";
import { buildCt600IrEnvelope, ltdTaxDataForPeriodEnd } from "./ct600Xml.js";
import { deriveCt600FromFigures, validateCt600Figures } from "./ct600Figures.js";
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
  "frankedInvestmentIncome",
  "incomeTaxDeducted",
  "taxAlreadyPaid",
  "ownCorporationTax",
  "workingSheet",
];

// Fields the rest of the request already validates under their own names.
const REQUEST_VALIDATED_FIELDS = new Set(["utr", "companyName", "companyNumber", "declarantName", "declarantStatus"]);

function readFigures(figures, { accounts, utr, declarant }, errorMessages) {
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
  if (!accounts.profitAndLoss) return stitched;
  for (const problem of validateCt600Figures(stitched)) {
    if (!REQUEST_VALIDATED_FIELDS.has(problem.field)) errorMessages.push(problem.message);
  }
  return stitched;
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
    if (!/^\d{1,4}$/.test(box) || !(typeof value === "number" ? Number.isFinite(value) : typeof value === "string")) {
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
 */
export function extractAndValidateCtReturnParameters(
  event,
  errorMessages,
  { requireGatewayCredentials = true, requireReviewedBoxes = true } = {},
) {
  const body = parseRequestBody(event) || {};
  const accounts = extractAndValidateAccountsParameters(event, errorMessages, { requireCompanyAuthCode: false });
  if (accounts.regime === "micro-entity") {
    attachMicroProfitAndLoss(accounts, body.profitAndLoss, errorMessages);
  } else if (accounts.filleted) {
    errorMessages.push("smallCompany.filleted must be false: HMRC takes the full accounts");
  }

  const utr = typeof body.utr === "string" ? body.utr.trim() : "";
  if (!/^\d{10}$/.test(utr)) errorMessages.push("Invalid utr - must be 10 digits");

  const tradeName = typeof body.tradeName === "string" ? body.tradeName.trim() : "";
  if (!tradeName) errorMessages.push("Missing tradeName");

  const declarantName = typeof body.declarant?.name === "string" ? body.declarant.name.trim() : "";
  const declarantStatus = typeof body.declarant?.status === "string" ? body.declarant.status.trim() : "";
  if (declarantName.length < 2) errorMessages.push("Missing declarant.name");
  if (declarantStatus.length < 2) errorMessages.push("Missing declarant.status");

  if (body.directorsLoanOverdrawn === true) {
    errorMessages.push(
      "A director's loan account overdrawn at the year end needs supplementary page CT600A, which this return does not carry",
    );
  } else if (body.directorsLoanOverdrawn !== false) {
    errorMessages.push("directorsLoanOverdrawn must be answered true or false");
  }
  if (body.declarationAccepted !== true) errorMessages.push("The declarant must accept the declaration");

  const figures = readFigures(body.figures, { accounts, utr, declarant: { name: declarantName, status: declarantStatus } }, errorMessages);
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
    accounts,
    utr,
    tradeName,
    declarant: { name: declarantName, status: declarantStatus },
    figures,
    reviewedBoxes,
    gatewayUserId,
    gatewayPassword,
  };
}

/**
 * Build the CT600 IRenvelope and the two attachments for a validated request. The server works
 * every box and computation line from the figures, so the return, the accounts and the
 * computations name the same company, UTR and declarant. An amended request builds the return
 * with ReturnType="amended", which replaces the return HMRC holds for the period.
 * @param {ReturnType<typeof extractAndValidateCtReturnParameters>} request
 * @returns {{irEnvelopeXml: string, accountsIxbrl: string, computationsIxbrl: string, boxes: object, computationLines: object, losses: object, carryBack: object|undefined, worked: object}}
 */
export function buildCtReturnDocuments({ accounts, utr, tradeName, figures, amended }) {
  const { boxes, computationLines, losses, carryBack, worked, periodStart, periodEnd } = deriveCt600FromFigures(
    figures,
    ltdTaxDataForPeriodEnd(figures.periodEnd),
  );
  const accountsIxbrl = buildAccountsIxbrl(accounts);
  const computationsIxbrl = buildCtComputations({
    companyName: accounts.companyName,
    companyNumber: accounts.companyNumber,
    utr,
    periodStart,
    periodEnd,
    tradeName,
    lines: computationLines,
    losses,
    carryBack,
    tradeOutsideUk: figures.lossOutsideUk === true,
  });
  const irEnvelopeXml = buildCt600IrEnvelope({ boxes, accountsIxbrl, computationsIxbrl, amended });
  return { irEnvelopeXml, accountsIxbrl, computationsIxbrl, boxes, computationLines, losses, carryBack, worked };
}
