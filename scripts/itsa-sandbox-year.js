#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Files a whole ITSA tax year against the HMRC sandbox with one test user: four quarterly
 * self-employment updates, an annual submission, a triggered and adjusted business source
 * adjustable summary, an intent-to-finalise calculation, and a final declaration.
 *
 * Every date and period key this script sends is one HMRC handed back on an earlier call in
 * the same run - the quarterly period dates come from the open obligations HMRC returns for
 * the business this script creates, and the adjustable summary's accounting period comes from
 * those same obligations once they are fulfilled. Nothing here guesses at a period boundary.
 *
 * Uses `mtd-sa-test-support-api/1.0` to create the self-employment business and set the ITSA
 * status for the chosen tax year, and its vendor-state checkpoint endpoints to reset the test
 * user's stateful sandbox data between runs: the first run wipes everything and saves a clean
 * checkpoint, every later run restores that checkpoint before creating a fresh business.
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
 *   ITSA_SANDBOX_TAX_YEAR          tax year to file, e.g. "2023-24" - must be 2024-25 or
 *                                  earlier, the last tax year the period-summary endpoint
 *                                  this script uses will still accept
 *   ITSA_SANDBOX_OUT_DIR           directory for the transcript, screenshots and the
 *                                  restore checkpoint id (default "./target/itsa-sandbox-year")
 *   ITSA_SANDBOX_SCOPE             OAuth scope to request (default
 *                                  "read:self-assessment write:self-assessment")
 *   ITSA_SANDBOX_HEADFUL           set to "true" to watch the browser
 *
 * Nothing here prints or writes a token, a password or a client secret.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { buildFraudHeaders, detectVendorPublicIp } from "../app/lib/buildFraudHeaders.js";
import { initializeSalt } from "../app/services/subHasher.js";
import { buildHmrcHeaders } from "../app/services/hmrcApi.js";
import { getAuthorizationCode, buildAuthorizeUrl } from "./lib/hmrcAuthorizationCode.js";
import { prepareTokenExchangeRequest } from "../app/functions/hmrc/hmrcTokenPost.js";
import { buildSelfEmploymentPeriodRequestBody } from "../app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js";
import { buildAnnualSubmissionRequestBody } from "../app/functions/hmrc/hmrcItsaSelfEmploymentAnnualPut.js";
import { buildBsasTriggerRequestBody } from "../app/functions/hmrc/hmrcItsaBsasTriggerPost.js";
import { buildBsasAdjustRequestBody } from "../app/functions/hmrc/hmrcItsaBsasSelfEmploymentAdjustPost.js";

// Individual Calculations 8.0: recommended minimum wait between the trigger's 202 and the
// first retrieve attempt, and how many times to retry while HMRC still answers 404.
const CALCULATION_MIN_WAIT_MS = 5000;
const CALCULATION_RETRIEVE_MAX_ATTEMPTS = 5;
const CALCULATION_RETRIEVE_RETRY_DELAY_MS = 3000;

// The Business Source Adjustable Summary retrieve endpoint answers not-found with no
// Gov-Test-Scenario header, even for a genuinely stateful sandbox business - documented in
// PLAN_ITSA_PHASE_2.md's BSAS section. SELF_EMPLOYMENT_PROFIT is the scenario named there.
const BSAS_RETRIEVE_SCENARIO = "SELF_EMPLOYMENT_PROFIT";

// _developers/hmrc/ITSA_SPIKE.md's own sandbox run recorded exactly one validator warning that
// a synthetic test user can never clear: gov-client-multi-factor, because the sandbox sign-in
// page takes a user id and a password with no second factor. That is what "clean" means for
// this test user - a live customer signs in through Cognito with TOTP and carries the header.
const KNOWN_ACCEPTABLE_WARNING_HEADERS = ["gov-client-multi-factor"];

const transcript = [];

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
 * Sort an obligations response down to one business's open obligation periods, each carrying
 * the periodStartDate and periodEndDate HMRC wants a quarterly update filed against. Never
 * invents a period: an empty result means the business has no open obligations, which is a
 * reason to stop, not a reason to guess a period key.
 * @param {Object} obligationsResponseBody - the parsed body of a GET .../income-and-expenditure call
 * @param {string} businessId
 * @returns {Array<{periodStartDate: string, periodEndDate: string, dueDate: string, status: string}>}
 */
export function selectOpenObligationPeriods(obligationsResponseBody, businessId) {
  const businessObligations = (obligationsResponseBody?.obligations || []).find((entry) => entry.businessId === businessId);
  const openPeriods = (businessObligations?.obligationDetails || []).filter((period) => period.status === "open");
  if (openPeriods.length === 0) {
    throw new Error(
      `No open income-and-expenditure obligations for business ${businessId}. HMRC returned: ${JSON.stringify(obligationsResponseBody)}`,
    );
  }
  return [...openPeriods].sort((a, b) => a.periodStartDate.localeCompare(b.periodStartDate));
}

/**
 * Derive the accounting period a Business Source Adjustable Summary trigger needs from a set
 * of obligation periods HMRC has already returned - the earliest periodStartDate to the
 * latest periodEndDate. Never computes a date range from the tax year string itself.
 * @param {Array<{periodStartDate: string, periodEndDate: string}>} periods
 * @returns {{accountingPeriodStartDate: string, accountingPeriodEndDate: string}}
 */
export function deriveAccountingPeriodFromObligationPeriods(periods) {
  if (!periods || periods.length === 0) {
    throw new Error("Cannot derive an accounting period from an empty obligation period list");
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
 * Whether a fraud prevention header validator response counts as clean for a sandbox test
 * user. "Clean" here matches what _developers/hmrc/ITSA_SPIKE.md's earlier sandbox run
 * established, not a literal VALID_HEADERS code: no errors, and every warning names only
 * headers a synthetic sign-in can never supply (currently just gov-client-multi-factor).
 * @param {Object} validationBody - the parsed body of a GET .../fraud-prevention-headers/validate call
 * @returns {boolean}
 */
export function isFraudHeaderValidationClean(validationBody) {
  const errors = validationBody?.errors || [];
  if (errors.length > 0) return false;
  if (validationBody?.code === "VALID_HEADERS") return true;
  if (validationBody?.code !== "POTENTIALLY_INVALID_HEADERS") return false;
  const warnings = validationBody?.warnings || [];
  return warnings.every((warning) =>
    (warning.headers || []).every((header) => KNOWN_ACCEPTABLE_WARNING_HEADERS.includes(String(header).toLowerCase())),
  );
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
 * The test-support "create or amend ITSA status" request body. "MTD Mandated" with
 * "Sign up - return available" is this script's own choice of test data (PLAN_ITSA_PHASE_2.md
 * does not prescribe one) - see the runbook for how to change it.
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

/** Headers a browser would send us, which buildFraudHeaders turns into Gov-Client-* values. */
function buildSyntheticEvent(clientPublicIp) {
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
    requestContext: { authorizer: { lambda: { sub: `itsa-sandbox-year-${randomUUID()}` } } },
  };
}

/**
 * Call one HMRC endpoint, record the request and response in the transcript, and throw with
 * the full response body when the status is not one this call expected - no silent fallback,
 * no retry that masks a real rejection.
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

  if (!ok) {
    throw new Error(
      `${step} expected one of [${okStatuses.join(", ")}] but ${method} ${maskUrl(url, nino)} answered ${response.status}: ${JSON.stringify(parsedBody)}`,
    );
  }

  return { status: response.status, body: parsedBody, headers: response.headers };
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
  const outDir = process.env.ITSA_SANDBOX_OUT_DIR || "./target/itsa-sandbox-year";
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
  const vendorPublicIp = await detectVendorPublicIp();
  process.env.USER_SUB_HASH_SALT = JSON.stringify({ current: "itsa-sandbox-year", versions: { "itsa-sandbox-year": randomUUID() } });
  await initializeSalt();
  const { govClientHeaders } = buildFraudHeaders(buildSyntheticEvent(vendorPublicIp), { bundleIds: ["resident-itsa"] });
  record("fraud-headers", { headerNames: Object.keys(govClientHeaders).sort() });

  const hmrcHeaders = (apiVersion, testScenario) =>
    buildHmrcHeaders(accessToken, govClientHeaders, testScenario, randomUUID(), undefined, randomUUID(), apiVersion);

  // Phase 3: reset the test user's stateful sandbox data and get a business ready to file
  // against. The checkpoint-create call answers 404 MATCHING_RESOURCE_NOT_FOUND against a NINO
  // with no test-support data yet, so a checkpoint can only be taken after the business and
  // ITSA status exist, not before. First run ever: wipe everything, create the business and
  // status, then checkpoint that as the baseline. Every later run: restore that checkpoint,
  // which brings back the same business with everything filed against it since undone, rather
  // than creating a second business.
  let checkpointId = null;
  let businessId = null;
  let checkpointState = null;
  try {
    checkpointState = JSON.parse(readFileSync(checkpointFile, "utf8"));
  } catch {
    checkpointState = null;
  }

  if (checkpointState?.checkpointId && checkpointState?.businessId) {
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
    record("vendor-state-restored", { checkpointId, businessId });
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
    writeFileSync(checkpointFile, JSON.stringify({ checkpointId, businessId }));
    record("vendor-state-checkpoint-saved", { checkpointId, businessId, checkpointFile });
  }

  await callHmrc({
    step: "business-details-list",
    method: "GET",
    url: `${sandboxBase}/individuals/business/details/${nino}/list`,
    headers: hmrcHeaders("2.0"),
    okStatuses: [200],
    nino,
  });

  await callHmrc({
    step: "itsa-status",
    method: "GET",
    url: `${sandboxBase}/individuals/person/itsa-status/${nino}/${taxYear}`,
    headers: hmrcHeaders("2.0"),
    okStatuses: [200],
    nino,
  });

  // Phase 5: read the open obligations HMRC generated for this business and file a quarterly
  // update against each one - never against a date range this script invented.
  const openObligationsResponse = await callHmrc({
    step: "obligations-open",
    method: "GET",
    url: `${sandboxBase}/obligations/details/${nino}/income-and-expenditure?typeOfBusiness=self-employment&businessId=${businessId}&status=open`,
    headers: hmrcHeaders("3.0"),
    okStatuses: [200],
    nino,
  });
  const openPeriods = selectOpenObligationPeriods(openObligationsResponse.body, businessId);
  if (openPeriods.length !== 4) {
    console.warn(
      `[itsa-sandbox-year] Expected four open obligations for tax year ${taxYear}, HMRC returned ${openPeriods.length}. Continuing with what HMRC returned.`,
    );
  }

  for (const [index, period] of openPeriods.entries()) {
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
      headers: hmrcHeaders("5.0"),
      body: requestBody,
      okStatuses: [200, 201],
      nino,
    });
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

  // Phase 7: the business source adjustable summary - trigger, retrieve, adjust. The
  // accounting period comes from the obligations HMRC has now fulfilled, not from a computed
  // tax-year boundary.
  const fulfilledObligationsResponse = await callHmrc({
    step: "obligations-fulfilled",
    method: "GET",
    url: `${sandboxBase}/obligations/details/${nino}/income-and-expenditure?typeOfBusiness=self-employment&businessId=${businessId}`,
    headers: hmrcHeaders("3.0"),
    okStatuses: [200],
    nino,
  });
  const allPeriods = (fulfilledObligationsResponse.body?.obligations || []).find((entry) => entry.businessId === businessId)
    ?.obligationDetails || [];
  const { accountingPeriodStartDate, accountingPeriodEndDate } = deriveAccountingPeriodFromObligationPeriods(allPeriods);

  const bsasTrigger = await callHmrc({
    step: "bsas-trigger",
    method: "POST",
    url: `${sandboxBase}/individuals/self-assessment/adjustable-summary/${nino}/trigger`,
    headers: hmrcHeaders("7.0"),
    body: buildBsasTriggerRequestBody({ accountingPeriodStartDate, accountingPeriodEndDate, businessId }),
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

  await callHmrc({
    step: "bsas-adjust",
    method: "POST",
    url: `${sandboxBase}/individuals/self-assessment/adjustable-summary/${nino}/self-employment/${calculationId}/adjust/${taxYear}`,
    headers: hmrcHeaders("7.0"),
    body: buildBsasAdjustRequestBody({ zeroAdjustments: true }),
    okStatuses: [200, 204],
    nino,
  });

  // Phase 8: the crystallisation obligation, read for the transcript and to confirm one is open
  // before triggering the calculation that files against it.
  await callHmrc({
    step: "crystallisation-obligations",
    method: "GET",
    url: `${sandboxBase}/obligations/details/${nino}/crystallisation?taxYear=${taxYear}&status=open`,
    headers: hmrcHeaders("3.0"),
    okStatuses: [200],
    nino,
  });

  // Phase 9: trigger the intent-to-finalise calculation, wait, and poll until it is ready.
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

  let calculation = null;
  for (let attempt = 1; attempt <= CALCULATION_RETRIEVE_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(
      `${sandboxBase}/individuals/calculations/${nino}/self-assessment/${taxYear}/${finalCalculationId}`,
      { method: "GET", headers: hmrcHeaders("8.0") },
    );
    const body = await response.json().catch(() => ({}));
    record("calculation-retrieve-attempt", { attempt, status: response.status, url: maskUrl(response.url, nino) });
    if (response.status === 200) {
      calculation = body;
      break;
    }
    if (response.status !== 404) {
      throw new Error(`calculation-retrieve answered ${response.status} on attempt ${attempt}: ${JSON.stringify(body)}`);
    }
    if (attempt < CALCULATION_RETRIEVE_MAX_ATTEMPTS) await sleep(CALCULATION_RETRIEVE_RETRY_DELAY_MS);
  }
  if (!calculation) {
    throw new Error(`Calculation ${finalCalculationId} still not ready after ${CALCULATION_RETRIEVE_MAX_ATTEMPTS} attempts`);
  }
  record("calculation-retrieve", { calculationType: calculation.metadata?.calculationType });
  if (calculation.metadata?.calculationType !== "intent-to-finalise") {
    throw new Error(
      `Calculation ${finalCalculationId} has metadata.calculationType "${calculation.metadata?.calculationType}", expected "intent-to-finalise"`,
    );
  }

  // Phase 10: the final declaration - the proof this script exists to produce.
  await callHmrc({
    step: "final-declaration",
    method: "POST",
    url: `${sandboxBase}/individuals/calculations/${nino}/self-assessment/${taxYear}/${finalCalculationId}/final-declaration`,
    headers: hmrcHeaders("8.0"),
    body: {},
    okStatuses: [204],
    nino,
  });

  // Phase 11: the fraud header validator, called with the exact header set every call above used.
  const validation = await fetch(`${sandboxBase}/test/fraud-prevention-headers/validate`, {
    method: "GET",
    headers: { Accept: "application/vnd.hmrc.1.0+json", Authorization: `Bearer ${accessToken}`, ...govClientHeaders },
  });
  const validationBody = await validation.json().catch(() => ({}));
  record("fraud-header-validator", { status: validation.status, code: validationBody.code, body: validationBody });

  const outFile = `${outDir}/itsa-sandbox-year-transcript.json`;
  writeFileSync(outFile, JSON.stringify({ taxYear, nino: maskNino(nino), businessId, checkpointId, transcript }, null, 2));

  const finalDeclarationOk = transcript.find((entry) => entry.step === "final-declaration")?.status === 204;
  const validatorOk = validation.ok && isFraudHeaderValidationClean(validationBody);
  console.log(`[itsa-sandbox-year] transcript written to ${outFile}`);
  console.log(`[itsa-sandbox-year] final declaration 204: ${finalDeclarationOk}`);
  console.log(`[itsa-sandbox-year] fraud header validator clean: ${validatorOk} (code=${validationBody.code})`);
  if (!finalDeclarationOk || !validatorOk) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[itsa-sandbox-year] failed: ${error.message}`);
    try {
      const outDir = process.env.ITSA_SANDBOX_OUT_DIR || "./target/itsa-sandbox-year";
      mkdirSync(outDir, { recursive: true });
      writeFileSync(`${outDir}/itsa-sandbox-year-transcript.json`, JSON.stringify({ failed: true, error: error.message, transcript }, null, 2));
      console.error(`[itsa-sandbox-year] partial transcript written to ${outDir}/itsa-sandbox-year-transcript.json`);
    } catch (writeError) {
      console.error(`[itsa-sandbox-year] could not write partial transcript: ${writeError.message}`);
    }
    process.exitCode = 1;
  });
}
