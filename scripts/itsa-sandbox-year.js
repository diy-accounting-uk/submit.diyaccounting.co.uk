#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Files a whole ITSA tax year against the HMRC sandbox with one test user, for a self-employment
 * business and a UK property business: an annual submission, a triggered and adjusted business
 * source adjustable summary, an intent-to-finalise calculation and a final declaration, all
 * against the self-employment business, plus a quarterly update for each business every quarter.
 *
 * `resolveItsaSubmissionModel` (`app/lib/hmrcValidation.js`) decides how the quarterly updates
 * are filed, the same way the production handlers decide it: a year up to 2024-25 POSTs four
 * dated periods to the self-employment business; a year from 2025-26 PUTs four running totals to
 * each business's cumulative resource. The annual submission, adjustable summary and calculation
 * calls take the same shape either way, so they carry no branch of their own.
 *
 * The dated model's quarterly period dates are the four standard quarters HMRC's Self Employment
 * Business 5.0 spec publishes for every tax year (6 April to 5 July, and so on), not obligations
 * read back from HMRC. `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`'s run record explains why: the
 * sandbox's Obligations API (`obligations-api`, `retrieve_income_tax_income_expenditure.yaml`)
 * has no `STATEFUL` scenario and its `DYNAMIC` scenario only answers for three fixed example
 * businessIds, so it never reflects a business this script's test-support calls create. The
 * adjustable summary's accounting period is derived from the same four standard quarters.
 *
 * Uses `mtd-sa-test-support-api/1.0` to create both businesses and set the ITSA status for the
 * chosen tax year, and its vendor-state checkpoint endpoints to reset the test user's stateful
 * sandbox data between runs: the first run wipes everything and saves a clean checkpoint, every
 * later run restores that checkpoint before creating fresh businesses.
 *
 * This drives the sandbox directly, the way scripts/itsa-sandbox-spike.js drove Business
 * Details - it does not call this application's own deployed API. The request-body builders
 * it imports (buildSelfEmploymentPeriodRequestBody, buildAnnualSubmissionRequestBody,
 * buildBsasTriggerRequestBody, buildBsasAdjustRequestBody) are the same pure functions the
 * production Lambda handlers use, so a body this script sends is a body the shipped code would
 * also have sent.
 *
 * Usage:
 *   scripts/proxy-secrets.sh node scripts/itsa-sandbox-year.js
 *
 * Environment:
 *   HMRC_SANDBOX_BASE_URI          sandbox API base (from .env.proxy)
 *   HMRC_SANDBOX_CLIENT_ID         sandbox application client id (from .env.proxy)
 *   HMRC_SANDBOX_CLIENT_SECRET     sandbox application client secret (from proxy-secrets.sh)
 *   DIY_SUBMIT_BASE_URL            base for the registered redirect uri (from .env.proxy)
 *   ITSA_SANDBOX_TEST_USER_FILE    path to the sandbox test user JSON (userId, password, nino)
 *   ITSA_SANDBOX_TAX_YEAR          tax year to file, e.g. "2023-24" or "2025-26" -
 *                                  resolveItsaSubmissionModel decides which quarterly filing
 *                                  model it uses
 *   ITSA_SANDBOX_OUT_DIR           directory for the transcript, screenshots and the
 *                                  restore checkpoint id (default "../itsa-sandbox/<tax-year>/" relative
 *                                  to workspace root, outside the repository)
 *   ITSA_SANDBOX_SCOPE             OAuth scope to request (default
 *                                  "read:self-assessment write:self-assessment")
 *   ITSA_SANDBOX_HEADFUL           set to "true" to watch the browser
 *   ITSA_SANDBOX_COGNITO_PASSWORD  current password of the durable Cognito test lane's user
 *                                  this script signs in as to build a real
 *                                  Gov-Client-Multi-Factor header - see scripts/
 *                                  ensure-cognito-test-user.js for how that lane's password and
 *                                  TOTP device are issued
 *   ITSA_SANDBOX_COGNITO_ENVIRONMENT  environment whose IdentityStack and Secrets Manager TOTP
 *                                  secret to use (default "ci")
 *   ITSA_SANDBOX_COGNITO_LANE      the durable test lane to sign in as (default "local", the
 *                                  lane scripts/enable-cognito-native-test.js also rotates for
 *                                  local/manual testing)
 *
 * Nothing here prints or writes a token, a password or a client secret.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { buildFraudHeaders, detectVendorPublicIp } from "../app/lib/buildFraudHeaders.js";
import { decodeJwtNoVerify } from "../app/lib/jwtHelper.js";
import { initializeSalt } from "../app/services/subHasher.js";
import { buildHmrcHeaders } from "../app/services/hmrcApi.js";
import { logInAndAnswerChallenge, durableTestUserEmail, totpSecretName } from "./ensure-cognito-test-user.js";
import { getAuthorizationCode, buildAuthorizeUrl } from "./lib/hmrcAuthorizationCode.js";
import { prepareTokenExchangeRequest } from "../app/functions/hmrc/hmrcTokenPost.js";
import { resolveItsaSubmissionModel } from "../app/lib/hmrcValidation.js";
import { buildSelfEmploymentPeriodRequestBody } from "../app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js";
import {
  buildUkPropertyPeriodRequestBody,
  buildUkPropertyCumulativeRequestBody,
} from "../app/functions/hmrc/hmrcItsaUkPropertyPeriodPost.js";
import { buildAnnualSubmissionRequestBody } from "../app/functions/hmrc/hmrcItsaSelfEmploymentAnnualPut.js";
import { buildUkPropertyAnnualRequestBody } from "../app/functions/hmrc/hmrcItsaUkPropertyAnnualPut.js";
import { buildBsasTriggerRequestBody } from "../app/functions/hmrc/hmrcItsaBsasTriggerPost.js";
import { buildBsasAdjustRequestBody } from "../app/functions/hmrc/hmrcItsaBsasSelfEmploymentAdjustPost.js";
import { buildBsasUkPropertyAdjustRequestBody } from "../app/functions/hmrc/hmrcItsaBsasUkPropertyAdjustPost.js";
import { buildLossesAndClaimsRequestBody, LossesAndClaimsValidationError } from "../app/functions/hmrc/hmrcItsaLossesAndClaimsPut.js";
import { buildTaxLiabilityAdjustmentsRequestBody } from "../app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsPut.js";

// Individual Calculations 8.0: recommended minimum wait between the trigger's 202 and the
// first retrieve attempt, and how many times to retry while HMRC still answers 404.
const CALCULATION_MIN_WAIT_MS = 5000;
const CALCULATION_RETRIEVE_MAX_ATTEMPTS = 5;
const CALCULATION_RETRIEVE_RETRY_DELAY_MS = 3000;

// The Business Source Adjustable Summary retrieve endpoint answers not-found with no
// Gov-Test-Scenario header, even for a genuinely stateful sandbox business. SELF_EMPLOYMENT_PROFIT
// makes it answer HMRC's canned self-employment example instead.
const BSAS_RETRIEVE_SCENARIO = "SELF_EMPLOYMENT_PROFIT";

// The UK property equivalent of BSAS_RETRIEVE_SCENARIO, from the same scenario table.
const BSAS_UK_PROPERTY_RETRIEVE_SCENARIO = "UK_PROPERTY_PROFIT";

// Business Details and ITSA status answer a static canned example with no Gov-Test-Scenario
// header, not the business or status this script just created through the test-support API.
// STATEFUL reads the test-support state back instead - documented for Business Details in
// _developers/hmrc/ITSA_SPIKE.md, and confirmed here for ITSA status too.
const STATEFUL_SCENARIO = "STATEFUL";

// Self Employment Business 5.0's period-create default (no Gov-Test-Scenario header) simulates
// success without persisting anything a later stateful read could see. STATEFUL performs a
// stateful create, per the same endpoint's scenario table.
const PERIOD_STATEFUL_SCENARIO = "STATEFUL";

// HMRC's sandbox throttles this application's requests (429 MESSAGE_THROTTLED_OUT) well
// within what a single run of this script needs to send. Retried with a fixed backoff, or
// Retry-After when HMRC sends one, rather than failing the run on a rate limit that is not a
// rejection of anything this script sent.
const THROTTLE_MAX_ATTEMPTS = 8;
const THROTTLE_RETRY_DELAY_MS = 20000;

// Individual Calculations 8.0's calculation-retrieve has no STATEFUL scenario - its
// Gov-Test-Scenario table is a fixed list of named canned examples plus DYNAMIC, which the
// spec says makes the response's date fields track the requested tax year.
const CALCULATION_RETRIEVE_SCENARIO = "DYNAMIC";

const transcript = [];

function resolveDefaultOutDir(taxYear) {
  // Resolve to ../itsa-sandbox/<tax-year>/ relative to workspace root (outside the repository).
  // Get the git common dir (which points to .git in the main checkout even when running from
  // a worktree), then resolve to its parent (the repository root), then to the workspace root.
  const gitCommonDir = execSync("git rev-parse --git-common-dir", { cwd: process.cwd(), encoding: "utf8" }).trim();
  const repoRoot = dirname(gitCommonDir);
  return resolve(repoRoot, "..", "itsa-sandbox", taxYear);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(step, detail) {
  transcript.push({ step, at: new Date().toISOString(), ...detail });
  console.log(`[itsa-sandbox-year] ${step}`);
}

function maskNino(nino) {
  return `${"*".repeat(Math.max(0, nino.length - 2))}${nino.slice(-2)}`;
}

function maskUrl(url, nino) {
  return nino ? url.split(nino).join(maskNino(nino)) : url;
}

function headersToObject(headers) {
  if (!headers) return {};
  const out = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

// Authorization carries the token, so the transcript keeps only its shape.
function redactRequestHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => (key.toLowerCase() === "authorization" ? [key, "Bearer <redacted>"] : [key, value])),
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/**
 * Pick the checkpoint id out of a checkpoint-create response. HMRC's resolved OpenAPI
 * document for mtd-sa-test-support-api/1.0 does not publish a schema for this response, so
 * this tries every field name a checkpoint id could plausibly carry and fails loudly, with
 * the raw body, when none of them are present - the first real sandbox run is what tells us
 * which one HMRC actually uses.
 * @param {Object} body - the parsed JSON body of a checkpoint-create response
 * @returns {string}
 */
export function extractCheckpointId(body) {
  const candidate = body?.checkpointId || body?.id || body?.checkpoint?.id || body?.checkpoint?.checkpointId;
  if (!candidate || typeof candidate !== "string") {
    throw new Error(
      `Checkpoint create response did not carry a recognisable id. Raw body: ${JSON.stringify(body)}. ` +
        `Inspect this shape against HMRC's actual response and add the right field name to extractCheckpointId.`,
    );
  }
  return candidate;
}

/**
 * The four standard quarterly periods HMRC's Self Employment Business 5.0 spec publishes for
 * every tax year, under "Standard quarterly period dates": 6 April to 5 July, 6 July to
 * 5 October, 6 October to 5 January, 6 January to 5 April. Used instead of an obligations read
 * because the sandbox's Obligations API does not reflect a test-support-created business - see
 * `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`.
 * @param {string} taxYear - e.g. "2023-24"
 * @returns {Array<{periodStartDate: string, periodEndDate: string}>}
 */
export function buildStandardQuarterlyPeriods(taxYear) {
  const startYear = Number(taxYear.slice(0, 4));
  const endYear = startYear + 1;
  return [
    { periodStartDate: `${startYear}-04-06`, periodEndDate: `${startYear}-07-05` },
    { periodStartDate: `${startYear}-07-06`, periodEndDate: `${startYear}-10-05` },
    { periodStartDate: `${startYear}-10-06`, periodEndDate: `${endYear}-01-05` },
    { periodStartDate: `${endYear}-01-06`, periodEndDate: `${endYear}-04-05` },
  ];
}

/**
 * The four cumulative reporting periods of a tax year on the cumulative submission model: each
 * one runs from the tax year's start to the end of one of the four standard quarters, since a
 * cumulative period summary always reports the running total from the start of the tax year, not
 * each quarter's own span.
 * @param {string} taxYear - e.g. "2025-26"
 * @returns {Array<{fromDate: string, toDate: string}>}
 */
export function buildCumulativeQuarterlyPeriods(taxYear) {
  const quarters = buildStandardQuarterlyPeriods(taxYear);
  const yearStart = quarters[0].periodStartDate;
  return quarters.map((quarter) => ({ fromDate: yearStart, toDate: quarter.periodEndDate }));
}

/**
 * The running total a self-employment cumulative period summary reports at the end of one
 * quarter: the sum of this script's own quarterly test figures (`buildQuarterlyTestFigures`)
 * from the first quarter through this one, inclusive.
 * @param {number} quarterIndex - 0-based position of this period among the year's four
 * @returns {{income: Object, expenses: Object}}
 */
export function buildCumulativeSelfEmploymentTestFigures(quarterIndex) {
  let turnover = 0;
  let other = 0;
  let consolidatedExpenses = 0;
  for (let index = 0; index <= quarterIndex; index += 1) {
    const figures = buildQuarterlyTestFigures(index);
    turnover += figures.periodIncome.turnover;
    other += figures.periodIncome.other;
    consolidatedExpenses += figures.periodExpenses.consolidatedExpenses;
  }
  return { income: { turnover, other }, expenses: { consolidatedExpenses } };
}

/**
 * The running total a UK property cumulative period summary reports at the end of one quarter.
 * Property Business v6.0's cumulative income model has its own field names (`periodAmount`, not
 * `turnover` - Self Employment Business's field), so this cannot reuse
 * buildCumulativeSelfEmploymentTestFigures's income shape, though it reuses the same growing
 * turnover figures from buildQuarterlyTestFigures as the source amount.
 * @param {number} quarterIndex - 0-based position of this period among the year's four
 * @returns {{income: Object, expenses: Object}}
 */
export function buildCumulativePropertyTestFigures(quarterIndex) {
  let periodAmount = 0;
  let consolidatedExpenses = 0;
  for (let index = 0; index <= quarterIndex; index += 1) {
    const figures = buildQuarterlyTestFigures(index);
    periodAmount += figures.periodIncome.turnover;
    consolidatedExpenses += figures.periodExpenses.consolidatedExpenses;
  }
  return { income: { periodAmount }, expenses: { consolidatedExpenses } };
}

/**
 * Derive the accounting period a Business Source Adjustable Summary trigger needs from a set
 * of periods - the earliest periodStartDate to the latest periodEndDate.
 * @param {Array<{periodStartDate: string, periodEndDate: string}>} periods
 * @returns {{accountingPeriodStartDate: string, accountingPeriodEndDate: string}}
 */
export function deriveAccountingPeriodFromPeriods(periods) {
  if (!periods || periods.length === 0) {
    throw new Error("Cannot derive an accounting period from an empty period list");
  }
  const starts = periods.map((period) => period.periodStartDate).sort();
  const ends = periods.map((period) => period.periodEndDate).sort();
  return { accountingPeriodStartDate: starts[0], accountingPeriodEndDate: ends[ends.length - 1] };
}

/**
 * Test figures for one quarterly self-employment period update. These are this script's own
 * fixture data, not anything read from HMRC - only the period dates come from an obligation.
 * consolidatedExpenses is used on its own (never alongside the itemised expense fields), so a
 * quarter never trips HMRC's BOTH_EXPENSES_SUPPLIED rule.
 * @param {number} quarterIndex - 0-based position of this period among the year's open periods
 * @returns {{periodIncome: Object, periodExpenses: Object}}
 */
export function buildQuarterlyTestFigures(quarterIndex) {
  return {
    periodIncome: { turnover: 4000 + quarterIndex * 250, other: 0 },
    periodExpenses: { consolidatedExpenses: 900 + quarterIndex * 50 },
  };
}

/**
 * Individual Losses 7.0 and Individuals Tax Liability Adjustments 1.0 both hard-code 2026-27 as
 * the earliest tax year they support - `TaxYear.ending(2027)` and `TaxYear.fromMtd("2026-27")`
 * in HMRC's own source. A year before that answers 400 RULE_TAX_YEAR_NOT_SUPPORTED on the first
 * write, regardless of quarterly filing model, so the loss claim and tax liability adjustment
 * sequence only runs for a tax year this returns true for.
 * @param {string} taxYear - e.g. "2023-24"
 * @returns {boolean}
 */
export function isLossesAndAdjustmentsSupportedTaxYear(taxYear) {
  return Number(taxYear.slice(0, 4)) >= 2026;
}

/**
 * Whether the calculation retrieved after the intent-to-finalise trigger carries both
 * businesses this run created, read from the "calculation-retrieve-income-sources" transcript
 * entry's own `businessIncomeSources`. HMRC's canned DYNAMIC calculation is known to answer
 * fixture-only business ids rather than a run's own, so this records the gap rather than
 * asserting on it.
 * @param {Array<Object>} transcript
 * @param {string} businessId
 * @param {string} propertyBusinessId
 * @returns {boolean}
 */
export function bothBusinessesInCalculationIncomeSources(transcript, businessId, propertyBusinessId) {
  const entry = transcript.find((item) => item.step === "calculation-retrieve-income-sources");
  const businessIncomeSources = entry?.businessIncomeSources;
  const ids = Array.isArray(businessIncomeSources) ? businessIncomeSources.map((source) => source?.businessId) : [];
  return ids.includes(businessId) && ids.includes(propertyBusinessId);
}

// The write steps `evaluateSuspendTemporalValidationsHeaderOnWrites` checks - every PUT this
// script sends to the losses or tax liability adjustments APIs, including the one it expects
// HMRC to reject.
const LOSSES_AND_ADJUSTMENTS_WRITE_STEPS = [
  "self-employment-loss-claim-put",
  "tax-liability-adjustments-put",
  "uk-property-loss-claim-put",
  "property-carry-back-rejected",
];

/**
 * Whether the self-employment loss claim, the tax liability adjustment, and - on the
 * cumulative model - the UK property loss claim and its carry-back refusal all read back what
 * this run wrote. "skipped" when the loss claim and adjustment sequence did not run at all,
 * because the tax year is below Individual Losses 7.0's supported minimum.
 * @param {Array<Object>} transcript
 * @returns {boolean|"skipped"}
 */
export function evaluateLossClaimsReadBack(transcript) {
  const selfEmploymentGet = transcript.find((entry) => entry.step === "self-employment-loss-claim-get");
  if (!selfEmploymentGet) return "skipped";

  const taxLiabilityGet = transcript.find((entry) => entry.step === "tax-liability-adjustments-get");
  const propertyGet = transcript.find((entry) => entry.step === "uk-property-loss-claim-get");
  const propertyCarryBackRejected = transcript.find((entry) => entry.step === "property-carry-back-rejected");

  const selfEmploymentOk = Boolean(selfEmploymentGet.responseBody?.claims?.carryBack);
  const taxLiabilityOk = Boolean(taxLiabilityGet?.responseBody?.carryBackLossesDecrease);
  const propertyOk = !propertyGet || (Boolean(propertyGet.responseBody?.claims?.carryForward) && propertyCarryBackRejected?.status === 400);

  return selfEmploymentOk && taxLiabilityOk && propertyOk;
}

/**
 * Whether every losses-and-adjustments write this run sent carried the
 * `suspend-temporal-validations` header - the kebab-case name HMRC's header spec documents,
 * which `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`'s run record found both production handlers
 * were sending under the wrong (camelCase field) name before that fix. "skipped" when none of
 * `LOSSES_AND_ADJUSTMENTS_WRITE_STEPS` ran.
 * @param {Array<Object>} transcript
 * @returns {boolean|"skipped"}
 */
export function evaluateSuspendTemporalValidationsHeaderOnWrites(transcript) {
  const writes = transcript.filter((entry) => LOSSES_AND_ADJUSTMENTS_WRITE_STEPS.includes(entry.step));
  if (writes.length === 0) return "skipped";
  return writes.every((entry) => entry.requestHeaders?.["suspend-temporal-validations"] === "true");
}

/**
 * Whether a fraud prevention header validator response counts as clean: no errors and no
 * warnings at all. This run signs in through Cognito with TOTP and builds
 * Gov-Client-Multi-Factor from that sign-in's own ID token, the way a live customer's request
 * does, so nothing this script sends is exempt from HMRC's validator.
 * @param {Object} validationBody - the parsed body of a GET .../fraud-prevention-headers/validate call
 * @returns {boolean}
 */
export function isFraudHeaderValidationClean(validationBody) {
  const errors = validationBody?.errors || [];
  if (errors.length > 0) return false;
  return validationBody?.code === "VALID_HEADERS";
}

/** The test-support "create a business" request body for one self-employment business. */
export function buildTestBusinessRequestBody() {
  return {
    typeOfBusiness: "self-employment",
    tradingType: "Other business",
    tradingName: "ITSA Sandbox Year Test Trade",
    businessAddressLineOne: "1 Test Street",
    businessAddressPostcode: "AA1 1AA",
    businessAddressCountryCode: "GB",
  };
}

/**
 * The test-support "create a business" request body for one UK property business. HMRC rejects
 * a property business carrying a business address - `RULE_UNEXPECTED_BUSINESS_ADDRESS` - because
 * that field is self-employment-only, the same way tradingType and tradingName are.
 */
export function buildTestPropertyBusinessRequestBody() {
  return {
    typeOfBusiness: "uk-property",
  };
}

/**
 * The test-support "create or amend ITSA status" request body. "MTD Mandated" with
 * "Sign up - return available" is this script's own choice of test data - see
 * _developers/hmrc/ITSA_PHASE_2_SANDBOX.md for how to change it.
 */
export function buildItsaStatusRequestBody() {
  return {
    itsaStatusDetails: [
      {
        status: "MTD Mandated",
        statusReason: "Sign up - return available",
        submittedOn: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Drive the sandbox authorisation pages until the browser is sent to the redirect uri, and
 * return the authorisation code from that redirect. Copied from scripts/itsa-sandbox-spike.js,
 * which proved this flow against the same HMRC sandbox application.
 */

/**
 * Headers a browser would send us, which buildFraudHeaders turns into Gov-Client-* values.
 * requestContext.authorizer.lambda carries a real Cognito sign-in's claims, the same flat shape
 * customAuthorizer.js puts there for a live request, so buildServerMultiFactorHeader builds
 * Gov-Client-Multi-Factor from it exactly as it would for a customer.
 * @param {string} clientPublicIp
 * @param {{sub: string, mfa_method?: string, auth_time?: string}} cognitoAuthorizerContext
 */
function buildSyntheticEvent(clientPublicIp, cognitoAuthorizerContext) {
  return {
    headers: {
      "x-forwarded-for": clientPublicIp,
      "cloudfront-viewer-address": `${clientPublicIp}:51234`,
      "x-device-id": randomUUID(),
      "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) itsa-sandbox-year",
      "Gov-Client-Public-IP-Timestamp": new Date().toISOString(),
      "Gov-Client-Screens": "width=1512&height=982&colour-depth=30&scaling-factor=2",
      "Gov-Client-Timezone": "UTC+00:00",
      "Gov-Client-Window-Size": "width=1512&height=857",
    },
    requestContext: { authorizer: { lambda: cognitoAuthorizerContext } },
  };
}

/**
 * Turn a Cognito ID token into the flat authorizer context buildServerMultiFactorHeader reads:
 * sub, mfa_method (from the custom:mfa_method claim the Pre Token Generation trigger sets for a
 * TOTP sign-in) and auth_time. Not verified - this script already trusts the token because it
 * just received it directly from Cognito's own InitiateAuth/RespondToAuthChallenge response, the
 * same trust boundary customAuthorizer.js's cryptographic verification exists to establish for a
 * token arriving over the network instead.
 * @param {string} idToken
 * @returns {{sub: string, mfa_method?: string, auth_time?: string}}
 */
export function buildCognitoAuthorizerContext(idToken) {
  const payload = decodeJwtNoVerify(idToken);
  if (!payload?.sub) {
    throw new Error("Cognito ID token did not decode to a payload with a sub claim");
  }
  return {
    sub: payload.sub,
    mfa_method: payload["custom:mfa_method"],
    auth_time: payload.auth_time !== undefined ? String(payload.auth_time) : undefined,
  };
}

/**
 * Sign the durable Cognito test lane's user in with its stored TOTP device and return the ID
 * token, so this run's Gov-Client-Multi-Factor header comes from a real sign-in the way a live
 * customer's does. Only signs in - never creates, deletes or rotates the user, so a lane with no
 * enrolled device or no stored secret throws rather than fixing itself up.
 * @param {{environment: string, lane: string, password: string}} params
 * @returns {Promise<string>} the ID token
 */
async function signInCognitoTestLane({ environment, lane, password }) {
  const stackName = `${environment}-env-IdentityStack`;
  const stack = (await new CloudFormationClient({}).send(new DescribeStacksCommand({ StackName: stackName }))).Stacks?.[0];
  const userPoolClientId = stack?.Outputs?.find((output) => output.OutputKey === "UserPoolClientId")?.OutputValue;
  if (!userPoolClientId) {
    throw new Error(`No UserPoolClientId output on stack ${stackName}`);
  }

  const testEmail = durableTestUserEmail(lane);
  const secretName = totpSecretName(environment, lane);
  const loginResult = await logInAndAnswerChallenge(new CognitoIdentityProviderClient({}), new SecretsManagerClient({}), {
    userPoolClientId,
    testEmail,
    testPassword: password,
    secretName,
  });

  if (loginResult.needsRecreate) {
    throw new Error(
      `Cognito test lane "${lane}" in ${environment} has no stored TOTP secret at ${secretName} to answer its ` +
        `SOFTWARE_TOKEN_MFA challenge with, and this script only signs in - it does not create, delete or ` +
        `rotate the durable test user ${testEmail}.`,
    );
  }
  if (!loginResult.idToken) {
    throw new Error(`Cognito sign-in for ${testEmail} returned no ID token`);
  }
  return loginResult.idToken;
}

/**
 * Call one HMRC endpoint, record the request and response in the transcript, and throw with
 * the full response body when the status is not one this call expected - no silent fallback,
 * no retry that masks a real rejection. The one retry this makes is on HMRC's own sandbox
 * rate limit (429 MESSAGE_THROTTLED_OUT), which this run hits repeatedly regardless of pacing
 * - never on a real rejection status.
 * @param {Object} params
 * @param {string} params.step - transcript label
 * @param {"GET"|"POST"|"PUT"|"DELETE"} params.method
 * @param {string} params.url
 * @param {Object} params.headers
 * @param {Object} [params.body] - sent as JSON when present
 * @param {number[]} params.okStatuses - the status codes this call treats as success
 * @param {string} [params.nino] - masked out of the recorded url when present
 * @returns {Promise<{status: number, body: any, headers: Headers}>}
 */
async function callHmrc({ step, method, url, headers, body, okStatuses, nino }) {
  for (let attempt = 1; attempt <= THROTTLE_MAX_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const durationMs = Date.now() - startedAt;
    const rawBody = await response.text();
    const parsedBody = (() => {
      if (!rawBody) return {};
      try {
        return JSON.parse(rawBody);
      } catch {
        return rawBody;
      }
    })();

    if (response.status === 429 && attempt < THROTTLE_MAX_ATTEMPTS) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : THROTTLE_RETRY_DELAY_MS;
      record(`${step}-throttled`, { attempt, waitMs, responseBody: parsedBody });
      await sleep(waitMs);
      continue;
    }

    const ok = okStatuses.includes(response.status);
    record(step, {
      method,
      url: maskUrl(url, nino),
      status: response.status,
      ok,
      durationMs,
      requestHeaders: redactRequestHeaders(headers),
      requestBody: body ?? null,
      responseHeaders: headersToObject(response.headers),
      responseBody: parsedBody,
    });

    if (ok) {
      return { status: response.status, body: parsedBody, headers: response.headers };
    }

    throw new Error(
      `${step} expected one of [${okStatuses.join(", ")}] but ${method} ${maskUrl(url, nino)} answered ${response.status}: ${JSON.stringify(parsedBody)}`,
    );
  }

  throw new Error(`${step} was still throttled (429) after ${THROTTLE_MAX_ATTEMPTS} attempts`);
}

async function main() {
  dotenv.config({ path: ".env.proxy", override: false });

  const sandboxBase = requireEnv("HMRC_SANDBOX_BASE_URI").replace(/\/$/, "");
  const clientId = requireEnv("HMRC_SANDBOX_CLIENT_ID");
  requireEnv("HMRC_SANDBOX_CLIENT_SECRET");
  const appBaseUrl = requireEnv("DIY_SUBMIT_BASE_URL").replace(/\/$/, "");
  const redirectUri = `${appBaseUrl}/activities/submitVatCallback.html`;
  const taxYear = requireEnv("ITSA_SANDBOX_TAX_YEAR");
  if (!/^\d{4}-\d{2}$/.test(taxYear)) {
    throw new Error(`ITSA_SANDBOX_TAX_YEAR must look like "2023-24", got "${taxYear}"`);
  }
  const scope = process.env.ITSA_SANDBOX_SCOPE || "read:self-assessment write:self-assessment";
  const cognitoPassword = requireEnv("ITSA_SANDBOX_COGNITO_PASSWORD");
  const cognitoEnvironment = process.env.ITSA_SANDBOX_COGNITO_ENVIRONMENT || "ci";
  const cognitoLane = process.env.ITSA_SANDBOX_COGNITO_LANE || "local";
  const outDir = process.env.ITSA_SANDBOX_OUT_DIR || resolveDefaultOutDir(taxYear);
  mkdirSync(outDir, { recursive: true });
  const checkpointFile = `${outDir}/checkpoint-id.txt`;

  const testUser = JSON.parse(readFileSync(requireEnv("ITSA_SANDBOX_TEST_USER_FILE"), "utf8"));
  const nino = testUser.nino;
  if (!nino) throw new Error("Test user file has no nino");

  // Phase 1: authorise and exchange the code for an access token, the way itsa-sandbox-spike.js does.
  const state = randomUUID();
  const authorizeUrl = buildAuthorizeUrl({ sandboxBase, clientId, redirectUri, scope, state });

  record("authorize", { scope, redirectUri, clientIdSuffix: clientId.slice(-4), nino: maskNino(nino), taxYear });

  const { code, visited } = await getAuthorizationCode({
    authorizeUrl,
    redirectUri,
    userId: testUser.userId,
    password: testUser.password,
    outDir,
    headful: process.env.ITSA_SANDBOX_HEADFUL === "true",
    label: "itsa-sandbox-year",
  });
  record("authorization-code-received", { pagesVisited: visited, codeLength: code.length });

  const { url: tokenUrl, body: tokenBody } = await prepareTokenExchangeRequest(code, "synthetic");
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/vnd.hmrc.1.0+json" },
    body: JSON.stringify(tokenBody),
  });
  const tokenJson = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenJson.access_token) {
    record("token-exchange-failed", { status: tokenResponse.status, body: tokenJson });
    throw new Error(`Token exchange failed with ${tokenResponse.status}`);
  }
  record("token-exchange", { status: tokenResponse.status, grantedScope: tokenJson.scope, expiresIn: tokenJson.expires_in });
  const accessToken = tokenJson.access_token;

  // Phase 2: build the same fraud prevention headers a real request would carry, once, and
  // reuse them for every call in this run - the validator call at the end checks this exact set.
  // Signing in through Cognito first means Gov-Client-Multi-Factor comes from a real ID token's
  // claims, the way buildServerMultiFactorHeader builds it for a live customer's request.
  const idToken = await signInCognitoTestLane({ environment: cognitoEnvironment, lane: cognitoLane, password: cognitoPassword });
  const cognitoAuthorizerContext = buildCognitoAuthorizerContext(idToken);
  record("cognito-sign-in", { lane: cognitoLane, sub: cognitoAuthorizerContext.sub, mfaMethod: cognitoAuthorizerContext.mfa_method });

  const vendorPublicIp = await detectVendorPublicIp();
  process.env.USER_SUB_HASH_SALT = JSON.stringify({ current: "itsa-sandbox-year", versions: { "itsa-sandbox-year": randomUUID() } });
  await initializeSalt();
  const { govClientHeaders } = buildFraudHeaders(buildSyntheticEvent(vendorPublicIp, cognitoAuthorizerContext), {
    bundleIds: ["resident"],
  });
  record("fraud-headers", { headerNames: Object.keys(govClientHeaders).sort() });

  const hmrcHeaders = (apiVersion, testScenario) =>
    buildHmrcHeaders(accessToken, govClientHeaders, testScenario, randomUUID(), undefined, randomUUID(), apiVersion);

  // Phase 3: reset the test user's stateful sandbox data and get both businesses ready to file
  // against. The checkpoint-create call answers 404 MATCHING_RESOURCE_NOT_FOUND against a NINO
  // with no test-support data yet, so a checkpoint can only be taken after the businesses and
  // ITSA status exist, not before. First run ever: wipe everything, create both businesses and
  // the status, then checkpoint that as the baseline. Every later run: restore that checkpoint,
  // which brings back the same businesses with everything filed against them since undone,
  // rather than creating them again.
  let checkpointId = null;
  let businessId = null;
  let propertyBusinessId = null;
  let checkpointState = null;
  try {
    checkpointState = JSON.parse(readFileSync(checkpointFile, "utf8"));
  } catch {
    checkpointState = null;
  }

  if (checkpointState?.checkpointId && checkpointState?.businessId && checkpointState?.propertyBusinessId) {
    await callHmrc({
      step: "vendor-state-restore",
      method: "POST",
      url: `${sandboxBase}/individuals/self-assessment-test-support/vendor-state/checkpoints/${checkpointState.checkpointId}/restore`,
      headers: hmrcHeaders("1.0"),
      okStatuses: [200, 201, 204],
      nino,
    });
    checkpointId = checkpointState.checkpointId;
    businessId = checkpointState.businessId;
    propertyBusinessId = checkpointState.propertyBusinessId;
    record("vendor-state-restored", { checkpointId, businessId, propertyBusinessId });
  } else {
    await callHmrc({
      step: "vendor-state-delete",
      method: "DELETE",
      url: `${sandboxBase}/individuals/self-assessment-test-support/vendor-state?nino=${nino}`,
      headers: hmrcHeaders("1.0"),
      okStatuses: [204, 404],
      nino,
    });

    const businessCreated = await callHmrc({
      step: "test-support-create-business",
      method: "POST",
      url: `${sandboxBase}/individuals/self-assessment-test-support/business/${nino}`,
      headers: hmrcHeaders("1.0"),
      body: buildTestBusinessRequestBody(),
      okStatuses: [200, 201],
      nino,
    });
    businessId = businessCreated.body.businessId;
    if (!businessId) throw new Error(`Create business response carried no businessId: ${JSON.stringify(businessCreated.body)}`);

    const propertyBusinessCreated = await callHmrc({
      step: "test-support-create-property-business",
      method: "POST",
      url: `${sandboxBase}/individuals/self-assessment-test-support/business/${nino}`,
      headers: hmrcHeaders("1.0"),
      body: buildTestPropertyBusinessRequestBody(),
      okStatuses: [200, 201],
      nino,
    });
    propertyBusinessId = propertyBusinessCreated.body.businessId;
    if (!propertyBusinessId) {
      throw new Error(`Create property business response carried no businessId: ${JSON.stringify(propertyBusinessCreated.body)}`);
    }

    await callHmrc({
      step: "test-support-set-itsa-status",
      method: "POST",
      url: `${sandboxBase}/individuals/self-assessment-test-support/itsa-status/${nino}/${taxYear}`,
      headers: hmrcHeaders("1.0"),
      body: buildItsaStatusRequestBody(),
      okStatuses: [200, 204],
      nino,
    });

    const created = await callHmrc({
      step: "vendor-state-checkpoint-create",
      method: "POST",
      url: `${sandboxBase}/individuals/self-assessment-test-support/vendor-state/checkpoints?nino=${nino}`,
      headers: hmrcHeaders("1.0"),
      okStatuses: [200, 201],
      nino,
    });
    checkpointId = extractCheckpointId(created.body);
    writeFileSync(checkpointFile, JSON.stringify({ checkpointId, businessId, propertyBusinessId }));
    record("vendor-state-checkpoint-saved", { checkpointId, businessId, propertyBusinessId, checkpointFile });
  }

  await callHmrc({
    step: "business-details-list",
    method: "GET",
    url: `${sandboxBase}/individuals/business/details/${nino}/list`,
    headers: hmrcHeaders("2.0", STATEFUL_SCENARIO),
    okStatuses: [200],
    nino,
  });

  await callHmrc({
    step: "itsa-status",
    method: "GET",
    url: `${sandboxBase}/individuals/person/itsa-status/${nino}/${taxYear}`,
    headers: hmrcHeaders("2.0", STATEFUL_SCENARIO),
    okStatuses: [200],
    nino,
  });

  // Phase 5: file a quarterly update for the self-employment business, and, on the cumulative
  // model, for the property business too. The dated model (2024-25 and earlier) POSTs a new
  // dated period each quarter, against the four standard quarterly periods - see
  // buildStandardQuarterlyPeriods's doc comment for why these are not read from obligations. It
  // has no property leg yet: a property business exists (Phase 3) but is not filed against
  // under this model. The cumulative model (2025-26 and later) PUTs a running total to each
  // business's cumulative resource four times, once per standard quarter's end date - see
  // buildCumulativeQuarterlyPeriods's doc comment. Gov-Test-Scenario: STATEFUL makes every
  // create or amend persist, so the later BSAS and calculation calls that check what has been
  // filed can see it.
  const submissionModel = resolveItsaSubmissionModel(taxYear);

  if (submissionModel === "dated") {
    const quarterlyPeriods = buildStandardQuarterlyPeriods(taxYear);

    for (const [index, period] of quarterlyPeriods.entries()) {
      const figures = buildQuarterlyTestFigures(index);
      const requestBody = buildSelfEmploymentPeriodRequestBody({
        periodStartDate: period.periodStartDate,
        periodEndDate: period.periodEndDate,
        periodIncome: figures.periodIncome,
        periodExpenses: figures.periodExpenses,
      });
      await callHmrc({
        step: `quarterly-period-${index + 1}`,
        method: "POST",
        url: `${sandboxBase}/individuals/business/self-employment/${nino}/${businessId}/period`,
        headers: hmrcHeaders("5.0", PERIOD_STATEFUL_SCENARIO),
        body: requestBody,
        okStatuses: [200, 201],
        nino,
      });
    }
  } else {
    const cumulativePeriods = buildCumulativeQuarterlyPeriods(taxYear);

    for (const [index, period] of cumulativePeriods.entries()) {
      const selfEmploymentFigures = buildCumulativeSelfEmploymentTestFigures(index);
      const selfEmploymentBody = buildSelfEmploymentPeriodRequestBody({
        periodStartDate: period.fromDate,
        periodEndDate: period.toDate,
        periodIncome: selfEmploymentFigures.income,
        periodExpenses: selfEmploymentFigures.expenses,
      });
      await callHmrc({
        step: `self-employment-cumulative-period-${index + 1}`,
        method: "PUT",
        url: `${sandboxBase}/individuals/business/self-employment/${nino}/${businessId}/cumulative/${taxYear}`,
        headers: hmrcHeaders("5.0", PERIOD_STATEFUL_SCENARIO),
        body: selfEmploymentBody,
        okStatuses: [204],
        nino,
      });

      const propertyFigures = buildCumulativePropertyTestFigures(index);
      const propertyBody = buildUkPropertyCumulativeRequestBody({
        fromDate: period.fromDate,
        toDate: period.toDate,
        income: propertyFigures.income,
        expenses: propertyFigures.expenses,
      });
      await callHmrc({
        step: `uk-property-cumulative-period-${index + 1}`,
        method: "PUT",
        url: `${sandboxBase}/individuals/business/property/uk/${nino}/${propertyBusinessId}/cumulative/${taxYear}`,
        headers: hmrcHeaders("6.0", PERIOD_STATEFUL_SCENARIO),
        body: propertyBody,
        okStatuses: [204],
        nino,
      });
    }
  }

  // Phase 6: the annual submission.
  await callHmrc({
    step: "annual-submission",
    method: "PUT",
    url: `${sandboxBase}/individuals/business/self-employment/${nino}/${businessId}/annual/${taxYear}`,
    headers: hmrcHeaders("5.0"),
    body: buildAnnualSubmissionRequestBody({ allowances: { tradingIncomeAllowance: 1000 } }),
    okStatuses: [204],
    nino,
  });

  // Phase 7: the business source adjustable summary - trigger, retrieve, adjust. Scoped to a
  // tax year, not to a quarterly filing model, so its accounting period always spans the same
  // four standard quarters this tax year has, whichever model filed them - see
  // buildStandardQuarterlyPeriods's doc comment.
  const { accountingPeriodStartDate, accountingPeriodEndDate } = deriveAccountingPeriodFromPeriods(buildStandardQuarterlyPeriods(taxYear));

  const bsasTrigger = await callHmrc({
    step: "bsas-trigger",
    method: "POST",
    url: `${sandboxBase}/individuals/self-assessment/adjustable-summary/${nino}/trigger`,
    headers: hmrcHeaders("7.0"),
    body: buildBsasTriggerRequestBody({
      accountingPeriodStartDate,
      accountingPeriodEndDate,
      businessId,
      typeOfBusiness: "self-employment",
    }),
    okStatuses: [200],
    nino,
  });
  const calculationId = bsasTrigger.body.calculationId;
  if (!calculationId) throw new Error(`BSAS trigger response carried no calculationId: ${JSON.stringify(bsasTrigger.body)}`);

  await callHmrc({
    step: "bsas-retrieve",
    method: "GET",
    url: `${sandboxBase}/individuals/self-assessment/adjustable-summary/${nino}/self-employment/${calculationId}/${taxYear}`,
    headers: hmrcHeaders("7.0", BSAS_RETRIEVE_SCENARIO),
    okStatuses: [200],
    nino,
  });

  // HMRC's resolved OpenAPI for this call carries two request schemas, chosen by tax year:
  // zeroAdjustments only exists on the "For TY 2024-25 and after" schema, on top of the same
  // income/expenses/additions fields the earlier schema has. This always sends a real
  // adjustment, which both schemas accept.
  await callHmrc({
    step: "bsas-adjust",
    method: "POST",
    url: `${sandboxBase}/individuals/self-assessment/adjustable-summary/${nino}/self-employment/${calculationId}/adjust/${taxYear}`,
    headers: hmrcHeaders("7.0"),
    body: buildBsasAdjustRequestBody({ income: { other: 1 } }),
    okStatuses: [200, 204],
    nino,
  });

  // Phase 7b: the property leg - proves the mixed customer (a sole trade and a property
  // business in the same year) end to end, the way Phase 6-7 just did for the sole trade alone.
  // The dated model has no quarterly filing against the property business earlier (Phase 5
  // files only the self-employment business under that model), so its four period updates
  // happen here. The cumulative model already filed the property business's running totals in
  // Phase 5, so only the annual submission and the adjustable summary sequence remain - and
  // those apply to a property business regardless of which quarterly model filed it.
  if (submissionModel === "dated") {
    const propertyQuarterlyPeriods = buildStandardQuarterlyPeriods(taxYear);

    for (const [index, period] of propertyQuarterlyPeriods.entries()) {
      const figures = buildQuarterlyTestFigures(index);
      const requestBody = buildUkPropertyPeriodRequestBody({
        fromDate: period.periodStartDate,
        toDate: period.periodEndDate,
        ukNonFhlProperty: {
          income: { periodAmount: figures.periodIncome.turnover },
          expenses: { consolidatedExpenses: figures.periodExpenses.consolidatedExpenses },
        },
      });
      await callHmrc({
        step: `uk-property-period-${index + 1}`,
        method: "POST",
        url: `${sandboxBase}/individuals/business/property/uk/${nino}/${propertyBusinessId}/period/${taxYear}`,
        headers: hmrcHeaders("6.0", PERIOD_STATEFUL_SCENARIO),
        body: requestBody,
        okStatuses: [200, 201],
        nino,
      });
    }
  }

  await callHmrc({
    step: "uk-property-annual-submission",
    method: "PUT",
    url: `${sandboxBase}/individuals/business/property/uk/${nino}/${propertyBusinessId}/annual/${taxYear}`,
    headers: hmrcHeaders("6.0"),
    body: buildUkPropertyAnnualRequestBody({ allowances: { propertyIncomeAllowance: 1000 } }),
    // Unlike the self-employment annual submission (always 204), the sandbox answers this call
    // with 200 and an empty body.
    okStatuses: [200, 204],
    nino,
  });

  const propertyBsasTrigger = await callHmrc({
    step: "uk-property-bsas-trigger",
    method: "POST",
    url: `${sandboxBase}/individuals/self-assessment/adjustable-summary/${nino}/trigger`,
    headers: hmrcHeaders("7.0"),
    body: buildBsasTriggerRequestBody({
      accountingPeriodStartDate,
      accountingPeriodEndDate,
      businessId: propertyBusinessId,
      typeOfBusiness: "uk-property",
    }),
    okStatuses: [200],
    nino,
  });
  const propertyCalculationId = propertyBsasTrigger.body.calculationId;
  if (!propertyCalculationId) {
    throw new Error(`UK property BSAS trigger response carried no calculationId: ${JSON.stringify(propertyBsasTrigger.body)}`);
  }

  await callHmrc({
    step: "uk-property-bsas-retrieve",
    method: "GET",
    url: `${sandboxBase}/individuals/self-assessment/adjustable-summary/${nino}/uk-property/${propertyCalculationId}/${taxYear}`,
    headers: hmrcHeaders("7.0", BSAS_UK_PROPERTY_RETRIEVE_SCENARIO),
    okStatuses: [200],
    nino,
  });

  await callHmrc({
    step: "uk-property-bsas-adjust",
    method: "POST",
    url: `${sandboxBase}/individuals/self-assessment/adjustable-summary/${nino}/uk-property/${propertyCalculationId}/adjust/${taxYear}`,
    headers: hmrcHeaders("7.0"),
    body: buildBsasUkPropertyAdjustRequestBody({ income: { totalRentsReceived: 1 } }),
    okStatuses: [200, 204],
    nino,
  });

  // Headers for the two year-end endpoints below: suspend-temporal-validations lets a sandbox
  // year that has not really ended through HMRC's own check that a tax year is over - the
  // header name is kebab-case on the wire, per Individual Losses 7.0 and Individuals Tax
  // Liability Adjustments 1.0's own header specs.
  const suspendTemporalValidationsHeaders = (apiVersion, testScenario) => ({
    ...hmrcHeaders(apiVersion, testScenario),
    "suspend-temporal-validations": "true",
  });

  // Phase 7c/7d: a loss claim and a tax liability adjustment on the self-employment business,
  // and - on the cumulative model - a loss claim on the property business and the sandbox's own
  // rejection of a carry-back claim against it. Individual Losses 7.0 and Individuals Tax
  // Liability Adjustments 1.0 both refuse a tax year before 2026-27 with
  // 400 RULE_TAX_YEAR_NOT_SUPPORTED on the very first write, so this whole sequence is skipped
  // below that year rather than sent to fail.
  if (isLossesAndAdjustmentsSupportedTaxYear(taxYear)) {
    // The order HMRC's own guides require: a carry-forward and a carry-back claim together with
    // the brought-forward loss they draw on, then the matching carryBackLossesDecrease. The
    // sandbox's canned calculation does not reflect either write (the same DYNAMIC gap the
    // calculation-retrieve check above already warns about), so the read-backs are the proof.
    await callHmrc({
      step: "self-employment-loss-claim-put",
      method: "PUT",
      url: `${sandboxBase}/individuals/losses/${nino}/businesses/${businessId}/loss-claims/${taxYear}`,
      headers: suspendTemporalValidationsHeaders("7.0", STATEFUL_SCENARIO),
      body: buildLossesAndClaimsRequestBody({
        typeOfBusiness: "self-employment",
        losses: { broughtForwardLosses: 500 },
        claims: { carryForward: { currentYearLosses: 250 }, carryBack: { previousYearGeneralIncome: 100 } },
      }),
      okStatuses: [200, 204],
      nino,
    });

    const selfEmploymentLossClaimGet = await callHmrc({
      step: "self-employment-loss-claim-get",
      method: "GET",
      url: `${sandboxBase}/individuals/losses/${nino}/businesses/${businessId}/loss-claims/${taxYear}`,
      headers: hmrcHeaders("7.0", STATEFUL_SCENARIO),
      okStatuses: [200],
      nino,
    });
    if (!selfEmploymentLossClaimGet.body?.claims?.carryBack) {
      throw new Error(
        `Self-employment loss claim read-back carried no claims.carryBack: ${JSON.stringify(selfEmploymentLossClaimGet.body)}`,
      );
    }

    await callHmrc({
      step: "tax-liability-adjustments-put",
      method: "PUT",
      url: `${sandboxBase}/individuals/tax-liability/adjustments/${nino}/${taxYear}`,
      headers: suspendTemporalValidationsHeaders("1.0", STATEFUL_SCENARIO),
      body: buildTaxLiabilityAdjustmentsRequestBody({ carryBackLossesDecrease: { incomeTax: 20 } }),
      okStatuses: [200, 204],
      nino,
    });

    await callHmrc({
      step: "tax-liability-adjustments-get",
      method: "GET",
      url: `${sandboxBase}/individuals/tax-liability/adjustments/${nino}/${taxYear}`,
      headers: hmrcHeaders("1.0", STATEFUL_SCENARIO),
      okStatuses: [200],
      nino,
    });

    // On the cumulative model only: proving both this repository's local refusal
    // (buildLossesAndClaimsRequestBody throws before any call is made) and HMRC's own rejection
    // of the same claim type for a property income source.
    if (submissionModel === "cumulative") {
      await callHmrc({
        step: "uk-property-loss-claim-put",
        method: "PUT",
        url: `${sandboxBase}/individuals/losses/${nino}/businesses/${propertyBusinessId}/loss-claims/${taxYear}`,
        headers: suspendTemporalValidationsHeaders("7.0", STATEFUL_SCENARIO),
        body: buildLossesAndClaimsRequestBody({
          typeOfBusiness: "uk-property",
          claims: { carryForward: { currentYearLosses: 300 } },
        }),
        okStatuses: [200, 204],
        nino,
      });

      const propertyLossClaimGet = await callHmrc({
        step: "uk-property-loss-claim-get",
        method: "GET",
        url: `${sandboxBase}/individuals/losses/${nino}/businesses/${propertyBusinessId}/loss-claims/${taxYear}`,
        headers: hmrcHeaders("7.0", STATEFUL_SCENARIO),
        okStatuses: [200],
        nino,
      });
      if (!propertyLossClaimGet.body?.claims?.carryForward) {
        throw new Error(`UK property loss claim read-back carried no claims.carryForward: ${JSON.stringify(propertyLossClaimGet.body)}`);
      }

      let propertyCarryBackLocalRefusal = null;
      try {
        buildLossesAndClaimsRequestBody({
          typeOfBusiness: "uk-property",
          claims: { carryBack: { previousYearGeneralIncome: 100 } },
        });
      } catch (error) {
        propertyCarryBackLocalRefusal = error;
      }
      if (
        !(propertyCarryBackLocalRefusal instanceof LossesAndClaimsValidationError) ||
        propertyCarryBackLocalRefusal.code !== "CARRY_BACK_CLAIM"
      ) {
        throw new Error(
          `Expected buildLossesAndClaimsRequestBody to refuse a property carry-back claim locally with CARRY_BACK_CLAIM, got: ${propertyCarryBackLocalRefusal}`,
        );
      }
      record("property-carry-back-refused-locally", {
        code: propertyCarryBackLocalRefusal.code,
        message: propertyCarryBackLocalRefusal.message,
      });

      // The raw body this repository's own local refusal never lets reach HMRC in production -
      // sent here deliberately, against Gov-Test-Scenario: CARRY_BACK_CLAIM, to record the
      // sandbox's own rejection of the same claim type.
      await callHmrc({
        step: "property-carry-back-rejected",
        method: "PUT",
        url: `${sandboxBase}/individuals/losses/${nino}/businesses/${propertyBusinessId}/loss-claims/${taxYear}`,
        headers: suspendTemporalValidationsHeaders("7.0", "CARRY_BACK_CLAIM"),
        body: { claims: { carryBack: { previousYearGeneralIncome: 100 } } },
        okStatuses: [400],
        nino,
      });
    }
  } else {
    record("losses-and-adjustments-skipped", { taxYear });
  }

  // Phase 8: trigger the intent-to-finalise calculation, wait, and poll until it is ready. No
  // crystallisation-obligations read first - the same obligations-api gap that rules out
  // reading quarterly obligations (see buildStandardQuarterlyPeriods's doc comment) applies to
  // this endpoint too, since both key off a business the test-support API created.
  const calcTrigger = await callHmrc({
    step: "calculation-trigger",
    method: "POST",
    url: `${sandboxBase}/individuals/calculations/${nino}/self-assessment/${taxYear}/trigger/intent-to-finalise`,
    headers: hmrcHeaders("8.0"),
    body: {},
    okStatuses: [202],
    nino,
  });
  const finalCalculationId = calcTrigger.body.calculationId;
  if (!finalCalculationId) throw new Error(`Calculation trigger response carried no calculationId: ${JSON.stringify(calcTrigger.body)}`);

  await sleep(CALCULATION_MIN_WAIT_MS);

  // Polls through callHmrc, not a raw fetch, so a 429 MESSAGE_THROTTLED_OUT here gets the same
  // backoff-and-retry every other call in this script gets, rather than aborting the run - a
  // defect this run's own sandbox rate limit exposed. 404 is an expected per-attempt answer
  // (HMRC still calculating), so it is one of this call's own okStatuses, not a thrown error.
  let calculation = null;
  for (let attempt = 1; attempt <= CALCULATION_RETRIEVE_MAX_ATTEMPTS; attempt += 1) {
    const response = await callHmrc({
      step: "calculation-retrieve-attempt",
      method: "GET",
      url: `${sandboxBase}/individuals/calculations/${nino}/self-assessment/${taxYear}/${finalCalculationId}`,
      headers: hmrcHeaders("8.0", CALCULATION_RETRIEVE_SCENARIO),
      okStatuses: [200, 404],
      nino,
    });
    if (response.status === 200) {
      calculation = response.body;
      break;
    }
    if (attempt < CALCULATION_RETRIEVE_MAX_ATTEMPTS) await sleep(CALCULATION_RETRIEVE_RETRY_DELAY_MS);
  }
  if (!calculation) {
    throw new Error(`Calculation ${finalCalculationId} still not ready after ${CALCULATION_RETRIEVE_MAX_ATTEMPTS} attempts`);
  }
  record("calculation-retrieve", { metadata: calculation.metadata });
  // HMRC's sandbox answers every calculation-retrieve, however triggered, with
  // metadata.calculationType "final-declaration" - confirmed against both no
  // Gov-Test-Scenario header and DYNAMIC, on a calculation this run itself triggered as
  // intent-to-finalise. Not a script defect: there is no scenario in Individual Calculations
  // 8.0's table that reflects a trigger's own calculationType back. Warn and carry on to the
  // final declaration call, which is what this script exists to exercise.
  if (calculation.metadata?.calculationType !== "intent-to-finalise") {
    console.warn(
      `[itsa-sandbox-year] Calculation ${finalCalculationId} has metadata.calculationType "${calculation.metadata?.calculationType}", not "intent-to-finalise" - a confirmed sandbox gap, not a script defect. Continuing to final declaration.`,
    );
  }

  // Whether the calculation's own income sources carry both businesses this run created and
  // filed against - the proof the mixed customer (a sole trade and a property business in one
  // year) reaches the calculation, not just the filing endpoints. HMRC's canned DYNAMIC
  // calculation is known to answer fixture-only business ids rather than this run's own, so a
  // miss here is recorded and warned about, not treated as a script failure.
  const businessIncomeSources = calculation.inputs?.incomeSources?.businessIncomeSources;
  record("calculation-retrieve-income-sources", { businessIncomeSources });

  // Phase 9: the final declaration - the proof this script exists to produce.
  await callHmrc({
    step: "final-declaration",
    method: "POST",
    url: `${sandboxBase}/individuals/calculations/${nino}/self-assessment/${taxYear}/${finalCalculationId}/final-declaration`,
    headers: hmrcHeaders("8.0"),
    body: {},
    okStatuses: [204],
    nino,
  });

  // Phase 10: the fraud header validator, called with the exact header set every call above used.
  const validation = await fetch(`${sandboxBase}/test/fraud-prevention-headers/validate`, {
    method: "GET",
    headers: { Accept: "application/vnd.hmrc.1.0+json", Authorization: `Bearer ${accessToken}`, ...govClientHeaders },
  });
  const validationBody = await validation.json().catch(() => ({}));
  record("fraud-header-validator", { status: validation.status, code: validationBody.code, body: validationBody });

  const outFile = `${outDir}/itsa-sandbox-year-transcript.json`;
  writeFileSync(
    outFile,
    JSON.stringify({ taxYear, nino: maskNino(nino), businessId, propertyBusinessId, checkpointId, transcript }, null, 2),
  );

  const finalDeclarationOk = transcript.find((entry) => entry.step === "final-declaration")?.status === 204;
  const validatorOk = validation.ok && isFraudHeaderValidationClean(validationBody);
  const bothBusinessesOk = bothBusinessesInCalculationIncomeSources(transcript, businessId, propertyBusinessId);
  const lossClaimsReadBackOk = evaluateLossClaimsReadBack(transcript);
  const suspendTemporalValidationsOk = evaluateSuspendTemporalValidationsHeaderOnWrites(transcript);
  const skippedLabel = "skipped (tax year before 2026-27)";

  console.log(`[itsa-sandbox-year] transcript written to ${outFile}`);
  console.log(`[itsa-sandbox-year] final declaration 204: ${finalDeclarationOk}`);
  console.log(`[itsa-sandbox-year] fraud header validator clean: ${validatorOk} (code=${validationBody.code})`);
  console.log(`[itsa-sandbox-year] both businesses in calculation income sources: ${bothBusinessesOk}`);
  console.log(`[itsa-sandbox-year] loss claims read back: ${lossClaimsReadBackOk === "skipped" ? skippedLabel : lossClaimsReadBackOk}`);
  console.log(
    `[itsa-sandbox-year] suspend-temporal-validations on every losses and adjustments write: ${
      suspendTemporalValidationsOk === "skipped" ? skippedLabel : suspendTemporalValidationsOk
    }`,
  );

  if (!finalDeclarationOk || !validatorOk || lossClaimsReadBackOk === false || suspendTemporalValidationsOk === false) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[itsa-sandbox-year] failed: ${error.message}`);
    try {
      const taxYear = process.env.ITSA_SANDBOX_TAX_YEAR || "unknown";
      const outDir = process.env.ITSA_SANDBOX_OUT_DIR || resolveDefaultOutDir(taxYear);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        `${outDir}/itsa-sandbox-year-transcript.json`,
        JSON.stringify({ failed: true, error: error.message, transcript }, null, 2),
      );
      console.error(`[itsa-sandbox-year] partial transcript written to ${outDir}/itsa-sandbox-year-transcript.json`);
    } catch (writeError) {
      console.error(`[itsa-sandbox-year] could not write partial transcript: ${writeError.message}`);
    }
    process.exitCode = 1;
  });
}
