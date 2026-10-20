// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcCtReturnRequest.js
// Validates a Company Tax Return request (the accounts figures, the CT600 boxes and the
// computation lines a book export supplies, plus the facts typed on the page) and builds the three
// documents the Transaction Engine takes: the CT600 IRenvelope with the full FRS 102 accounts and
// the computations attached as iXBRL. Shared by the preview and the submit Lambdas.

import { parseRequestBody } from "../lib/httpResponseHelper.js";
import { isValidIsoDate } from "../lib/hmrcValidation.js";
import { extractAndValidateAccountsParameters, buildAccountsIxbrl } from "../functions/companies-house/companiesHouseAccountsPost.js";
import { buildCt600IrEnvelope } from "./ct600Xml.js";
import { buildCtComputations } from "./ctComputationsIxbrl.js";

export const REQUIRED_CT600_BOXES = [30, 35, 145, 315, 440, 475, 510, 525, 528, 600];

const COMPUTATION_LINE_FIELDS = [
  "profitLossPerAccounts",
  "nonTradingLoanRelationshipCredits",
  "depreciation",
  "amortisation",
  "entertaining",
  "adjustedProfitBeforeCapitalAllowances",
  "totalCapitalAllowances",
  "adjustedProfit",
];

const MAX_GATEWAY_CREDENTIAL_LENGTH = 128;

function readBoxes(boxes, errorMessages) {
  if (!boxes || typeof boxes !== "object" || Array.isArray(boxes)) {
    errorMessages.push("Missing boxes - the CT600 boxes from the book export");
    return undefined;
  }
  const checked = {};
  for (const [key, value] of Object.entries(boxes)) {
    if (!/^\d{1,4}$/.test(key)) {
      errorMessages.push(`Invalid box number ${key}`);
      continue;
    }
    if (typeof value === "number" ? !Number.isFinite(value) : typeof value !== "string" || value === "") {
      errorMessages.push(`Invalid value for box ${key}`);
      continue;
    }
    checked[Number(key)] = value;
  }
  for (const box of REQUIRED_CT600_BOXES) {
    if (checked[box] === undefined) errorMessages.push(`Missing box ${box}`);
  }
  for (const box of [30, 35]) {
    if (checked[box] !== undefined && !isValidIsoDate(checked[box])) errorMessages.push(`Box ${box} must be YYYY-MM-DD`);
  }
  return checked;
}

function readComputationLines(lines, errorMessages) {
  if (!lines || typeof lines !== "object" || Array.isArray(lines)) {
    errorMessages.push("Missing computationLines - the computation lines from the book export");
    return undefined;
  }
  const checked = {};
  for (const field of COMPUTATION_LINE_FIELDS) {
    if (!Number.isFinite(lines[field])) errorMessages.push(`Invalid or missing computationLines.${field}`);
    checked[field] = lines[field];
  }
  return checked;
}

function validCredential(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_GATEWAY_CREDENTIAL_LENGTH;
}

/**
 * Extract and validate a Company Tax Return request. Validation messages are appended to
 * errorMessages; the returned object is only usable when none were added.
 *
 * @param {object} event - the Lambda event
 * @param {string[]} errorMessages
 * @param {object} [options]
 * @param {boolean} [options.requireGatewayCredentials] - true for the submit, false for the preview
 */
export function extractAndValidateCtReturnParameters(event, errorMessages, { requireGatewayCredentials = true } = {}) {
  const body = parseRequestBody(event) || {};
  const accounts = extractAndValidateAccountsParameters(event, errorMessages, { requireCompanyAuthCode: false });
  if (accounts.regime !== "small-company") {
    errorMessages.push("The Company Tax Return carries FRS 102 section 1A accounts: smallCompany is required");
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

  const boxes = readBoxes(body.boxes, errorMessages);
  const computationLines = readComputationLines(body.computationLines, errorMessages);

  if (boxes && computationLines) {
    const adjustedProfit = Math.max(computationLines.adjustedProfit, 0);
    if ((boxes[155] ?? 0) !== adjustedProfit) {
      errorMessages.push(`Box 155 (${boxes[155] ?? 0}) must equal the computation's adjusted profit (${adjustedProfit})`);
    }
  }
  if (boxes && accounts.periodStart && accounts.periodEnd && isValidIsoDate(boxes[30]) && isValidIsoDate(boxes[35])) {
    if (accounts.periodEnd < boxes[30] || accounts.periodStart > boxes[35]) {
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

  return {
    accounts,
    utr,
    tradeName,
    declarant: { name: declarantName, status: declarantStatus },
    boxes,
    computationLines,
    gatewayUserId,
    gatewayPassword,
  };
}

/**
 * Build the CT600 IRenvelope and the two attachments for a validated request. The typed company
 * facts overwrite the book export's, so the return, the accounts and the computations name the
 * same company, UTR and declarant.
 * @param {ReturnType<typeof extractAndValidateCtReturnParameters>} request
 * @returns {{irEnvelopeXml: string, accountsIxbrl: string, computationsIxbrl: string, boxes: object}}
 */
export function buildCtReturnDocuments({ accounts, utr, tradeName, declarant, boxes, computationLines }) {
  const returnBoxes = {
    ...boxes,
    1: accounts.companyName,
    2: accounts.companyNumber,
    3: utr,
    4: 0,
    975: declarant.name,
    985: declarant.status,
  };
  const accountsIxbrl = buildAccountsIxbrl(accounts);
  const computationsIxbrl = buildCtComputations({
    companyName: accounts.companyName,
    companyNumber: accounts.companyNumber,
    utr,
    periodStart: returnBoxes[30],
    periodEnd: returnBoxes[35],
    tradeName,
    lines: computationLines,
  });
  const irEnvelopeXml = buildCt600IrEnvelope({ boxes: returnBoxes, accountsIxbrl, computationsIxbrl });
  return { irEnvelopeXml, accountsIxbrl, computationsIxbrl, boxes: returnBoxes };
}
