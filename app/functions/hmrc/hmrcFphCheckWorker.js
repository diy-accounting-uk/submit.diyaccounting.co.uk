// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability HMRC-43 Check a header shape with HMRC's validator using synthetic values
// - **Use when:** the structure of the fraud prevention headers that the service sends must be checked against HMRC's own validator, without any customer value reaching HMRC.
// - **Does:** hmrcFphCheckWorker.js is the SQS consumer for the queue that HMRC-42 fills. For each shape it builds a synthetic header set with HMRC-41, sends one GET to the sandbox validate endpoint under a client credentials token, and writes one result item for the shape and day. It skips a shape that already has a result that day. A pass has code VALID_HEADERS, a warn POTENTIALLY_INVALID_HEADERS and a fail INVALID_HEADERS; a fail counts the HmrcFphCheckFailed metric. A sandbox error or timeout writes no item, so SQS retries and then the dead letter queue raises its alarm.
// - **Run:** no command; the worker runs on the hmrc-fph-check queue
// - **Entry:** `app/functions/hmrc/hmrcFphCheckWorker.js:workerHandler`; `app/functions/hmrc/hmrcFphCheckWorker.js:checkShape`
// - **Files:** app/functions/hmrc/hmrcFphCheckWorker.js, app/unit-tests/functions/hmrcFphCheckWorker.test.js, app/data/dynamoDbIntegrationCallRepository.js, infra/main/java/co/uk/diyaccounting/submit/constructs/QueueWorkerLambda.java, infra/main/java/co/uk/diyaccounting/submit/utils/FphCheckAccess.java
// - **Keywords:** fraud prevention headers, hmrc validator, test-api, client credentials, synthetic request, header check result, dead letter queue
// - **Related:** HMRC-41, HMRC-42, HMRC-29
// @end-capability

// app/functions/hmrc/hmrcFphCheckWorker.js

import dns from "node:dns/promises";
import { createLogger } from "../../lib/logger.js";
import { processSqsRecords } from "../../lib/sqsWorkerHelper.js";
import { emitMetric } from "../../lib/emfMetrics.js";
import { readSecret, refreshAfterAuthFailure } from "../../lib/cachedSecret.js";
import { fetchWithTimeout } from "../../lib/httpFetch.js";
import { recordedFetch } from "../../lib/integrationCalls.js";
import { calculateTtl, TTL_PRESETS } from "../../lib/dateUtils.js";
import { detectVendorPublicIp } from "../../lib/buildFraudHeaders.js";
import { PACKAGE_NAME, PRODUCT_VERSION } from "../../lib/productVersion.js";
import { FRAUD_PREVENTION_SPEC_VERSION } from "../../lib/fraudPreventionHeaderRules.js";
import { syntheticFraudPreventionHeaders } from "../../lib/fraudPreventionHeaderShape.js";
import { getFphCheckResult, putFphCheckResultOnce } from "../../data/dynamoDbIntegrationCallRepository.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcFphCheckWorker.js" });

export const HMRC_FPH_CHECK_FAILED_METRIC = "HmrcFphCheckFailed";
const METRICS_NAMESPACE = "Submit/HmrcSend";
const VALIDATE_PATH = "/test/fraud-prevention-headers/validate";
const VALIDATE_API = `GET ${VALIDATE_PATH}`;
const REQUEST_LIMIT_MS = 20000;
const TOKEN_MARGIN_MS = 60000;
const CONNECTION_METHODS = new Set(["WEB_APP_VIA_SERVER", "DESKTOP_APP_VIA_SERVER", "OTHER_VIA_SERVER"]);

const RESULT_BY_HMRC_CODE = {
  VALID_HEADERS: "pass",
  POTENTIALLY_INVALID_HEADERS: "warn",
  INVALID_HEADERS: "fail",
};

let cachedToken;

function sandboxClientSecretSource() {
  return { override: process.env.HMRC_SANDBOX_CLIENT_SECRET, arn: process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN };
}

async function requestToken(clientSecret) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.HMRC_SANDBOX_CLIENT_ID,
    client_secret: clientSecret,
  });
  const { response } = await fetchWithTimeout(
    `${process.env.HMRC_SANDBOX_BASE_URI}/oauth/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
    REQUEST_LIMIT_MS,
  );
  const responseBody = await response.json().catch(() => ({}));
  return { response, responseBody };
}

/**
 * A client credentials token for the sandbox application, kept while it is valid.
 * A rolled client secret is read again once.
 * @param {number} [nowMs]
 * @returns {Promise<string>}
 */
export async function sandboxAccessToken(nowMs = Date.now()) {
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_MARGIN_MS > nowMs) return cachedToken.value;
  const { override, arn } = sandboxClientSecretSource();
  let clientSecret = override || (await readSecret(arn));
  let { response, responseBody } = await requestToken(clientSecret);
  if (!response.ok && responseBody?.error === "invalid_client" && !override) {
    const refreshed = await refreshAfterAuthFailure(arn, clientSecret);
    if (refreshed) {
      clientSecret = refreshed;
      ({ response, responseBody } = await requestToken(clientSecret));
    }
  }
  if (!response.ok || !responseBody?.access_token) {
    throw new Error(`HMRC sandbox token request failed with status ${response.status}`);
  }
  cachedToken = { value: responseBody.access_token, expiresAtMs: nowMs + Number(responseBody.expires_in ?? 0) * 1000 };
  return cachedToken.value;
}

/** Forget the cached token. For tests. */
export function resetSandboxAccessTokenForTest() {
  cachedToken = undefined;
}

async function resolveClientAddress() {
  const host = new URL(process.env.DIY_SUBMIT_BASE_URL).hostname;
  const [address] = await dns.resolve4(host);
  if (!address) throw new Error(`No IPv4 address for ${host}`);
  return address;
}

function describeIssues(issues) {
  return (Array.isArray(issues) ? issues : []).map((issue) => ({
    code: String(issue?.code ?? ""),
    message: String(issue?.message ?? "").slice(0, 500),
    headers: Array.isArray(issue?.headers) ? issue.headers.map(String).slice(0, 30) : [],
  }));
}

/**
 * The result of one validate answer.
 * @param {number} status - The HTTP status
 * @param {object} body - The parsed answer
 * @returns {{result: string, hmrcCode: string, specVersion: string, errors: object[], warnings: object[]}}
 * @throws {Error} When HMRC did not give a verdict, so the message is tried again
 */
export function resultOfValidateAnswer(status, body) {
  const result = status === 200 ? RESULT_BY_HMRC_CODE[body?.code] : undefined;
  if (!result) throw new Error(`HMRC validate gave no verdict: status ${status}, code ${body?.code ?? "none"}`);
  const specVersion = String(body.specVersion ?? "");
  const warnings = describeIssues(body.warnings);
  if (specVersion !== FRAUD_PREVENTION_SPEC_VERSION) {
    warnings.push({
      code: "SPEC_VERSION_CHANGED",
      message: `HMRC validator reports specification ${specVersion || "none"}; the rules follow ${FRAUD_PREVENTION_SPEC_VERSION}`,
      headers: [],
    });
  }
  return {
    result: result === "pass" && specVersion !== FRAUD_PREVENTION_SPEC_VERSION ? "warn" : result,
    hmrcCode: body.code,
    specVersion,
    errors: describeIssues(body.errors),
    warnings,
  };
}

function validShape(shape) {
  return Boolean(shape && CONNECTION_METHODS.has(shape.connectionMethod) && shape.headers && typeof shape.headers === "object");
}

/**
 * Check one shape with HMRC's validator, unless it has a result today.
 * @param {{shapeHash: string, api: string, shape: object}} message
 * @param {Date} [now]
 * @returns {Promise<{skipped: boolean, result?: string}>}
 */
export async function checkShape({ shapeHash, api, shape }, now = new Date()) {
  if (!shapeHash || !validShape(shape)) throw new Error("Header check message has no valid shape");
  const pk = `fph#${now.toISOString().slice(0, 10)}`;
  if (await getFphCheckResult(pk, shapeHash)) {
    logger.info({ message: "Header shape already checked today", shapeHash });
    return { skipped: true };
  }

  const [vendorPublicIp, clientPublicIp, accessToken] = await Promise.all([
    detectVendorPublicIp(),
    resolveClientAddress(),
    sandboxAccessToken(now.getTime()),
  ]);
  if (!vendorPublicIp) throw new Error("The vendor public IP address is not known");
  const synthetic = syntheticFraudPreventionHeaders(shape, {
    now,
    vendorPublicIp,
    clientPublicIp,
    productName: PACKAGE_NAME,
    productVersion: PRODUCT_VERSION,
  });

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_LIMIT_MS);
  let response;
  let body;
  try {
    response = await recordedFetch(
      `${process.env.HMRC_SANDBOX_BASE_URI}${VALIDATE_PATH}`,
      {
        method: "GET",
        headers: { Accept: "application/vnd.hmrc.1.0+json", Authorization: `Bearer ${accessToken}`, ...synthetic },
        signal: controller.signal,
      },
      { org: "hmrc", target: "test", api: VALIDATE_API },
    );
    body = await response.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
  const durationMs = Date.now() - startedAt;
  const verdict = resultOfValidateAnswer(response.status, body);

  const written = await putFphCheckResultOnce({
    pk,
    sk: shapeHash,
    recordType: "fph-check",
    checkedAt: now.toISOString(),
    shapeHash,
    connectionMethod: shape.connectionMethod,
    api,
    ...verdict,
    durationMs,
    deployment: process.env.DEPLOYMENT_NAME,
    ttl: calculateTtl(now, TTL_PRESETS.NINETY_DAYS).ttl,
  });
  if (written && verdict.result === "fail") {
    emitMetric({
      namespace: METRICS_NAMESPACE,
      metricName: HMRC_FPH_CHECK_FAILED_METRIC,
      dimensions: { Environment: process.env.ENVIRONMENT_NAME || "unknown" },
    });
    logger.warn({
      message: "HMRC validator rejected a header shape",
      shapeHash,
      connectionMethod: shape.connectionMethod,
      errors: verdict.errors,
    });
  }
  return { skipped: false, result: verdict.result };
}

// SQS worker Lambda handler. The queue retries a message that gets no verdict and then moves it to
// the dead letter queue.
export async function workerHandler(event) {
  return processSqsRecords(event, {
    requiredEnv: ["HMRC_SANDBOX_BASE_URI", "HMRC_SANDBOX_CLIENT_ID", "INTEGRATION_CALLS_DYNAMODB_TABLE_NAME", "DIY_SUBMIT_BASE_URL"],
    logger,
    errorPolicy: "rethrow",
    processRecord: async (payload) => {
      await checkShape(payload);
    },
  });
}
