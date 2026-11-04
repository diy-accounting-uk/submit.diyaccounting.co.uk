// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-164 Record an outbound call to HMRC, Companies House or Stripe
// - **Use when:** code sends a request to an outside organisation and the operator must see the call, its duration and its status.
// - **Does:** integrationCalls.js writes one masked record for each attempt to the integration calls table, for a response, a timeout, a network error or a refusal. recordedFetch wraps a fetch; recordIntegrationCall takes a finished attempt from a client that does not use fetch. companiesHouseSend.js is the one send path to Companies House, and the Stripe SDK sends through stripeRecordingHttpClient.js, so each attempt to either leaves a record. A failed write logs a warning and counts IntegrationCallRecordFailed, and the caller's request is not affected.
// - **Run:** `import { recordedFetch } from "app/lib/integrationCalls.js"`
// - **Entry:** `app/lib/integrationCalls.js:recordedFetch`; `app/lib/integrationCalls.js:recordIntegrationCall`; `app/data/dynamoDbIntegrationCallRepository.js:putIntegrationCall`
// - **Files:** app/lib/integrationCalls.js, app/data/dynamoDbIntegrationCallRepository.js, app/services/companiesHouseSend.js, app/lib/stripeRecordingHttpClient.js, app/unit-tests/lib/integrationCalls.test.js, app/unit-tests/lib/stripeRecordingHttpClient.test.js, app/unit-tests/services/companiesHouseSend.test.js, app/unit-tests/services/companiesHouseSendPathBypass.test.js
// - **Keywords:** outbound call record, integration calls, api request log, duration, status code, send point
// - **Related:** OPS-81, HMRC-29
// @end-capability

// app/lib/integrationCalls.js

import { randomBytes } from "node:crypto";
import { createLogger, context } from "./logger.js";
import { emitMetric } from "./emfMetrics.js";
import { calculateTtl, TTL_PRESETS } from "./dateUtils.js";
import { govTalkSummary, integrationPathTemplate, maskIntegrationRaw } from "./dataMasking.js";
import { normalizeHeaders } from "./httpFetch.js";
import { putIntegrationCall } from "../data/dynamoDbIntegrationCallRepository.js";

const logger = createLogger({ source: "app/lib/integrationCalls.js" });

export const INTEGRATION_CALLS_METRICS_NAMESPACE = "Submit/IntegrationCalls";
export const INTEGRATION_CALL_RECORD_FAILED_METRIC = "IntegrationCallRecordFailed";

// A Lambda freezes after it answers, so the record is awaited, and this limit bounds what that
// wait adds to the customer's call.
const RECORD_STEP_LIMIT_MS = 1000;
const TIMEOUT_ERROR_NAMES = ["AbortError", "TimeoutError", "HttpTimeoutError"];

function withinRecordStepLimit(work) {
  let timer;
  const limit = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Not finished within ${RECORD_STEP_LIMIT_MS} ms`)), RECORD_STEP_LIMIT_MS);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * The api field of a record for a call that has a URL path.
 * @param {string} method
 * @param {string} url
 * @returns {string} For example POST /organisations/vat/{vrn}/returns
 */
export function integrationApi(method, url) {
  try {
    return `${method} ${integrationPathTemplate(new URL(url).pathname)}`;
  } catch {
    return `${method} {unparsable}`;
  }
}

/**
 * The api field of a record for a GovTalk call, where one URL serves every message class.
 * @param {string} prefix - XMLGW or TE
 * @param {string} xml
 * @returns {string} For example TE HMRC-CT-CT600
 */
export function integrationApiForGovTalk(prefix, xml) {
  return `${prefix} ${govTalkSummary(xml).messageClass ?? "unknown"}`;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function providerRequestIdOf(responseHeaders) {
  const headers = Object.fromEntries(Object.entries(normalizeHeaders(responseHeaders)).map(([name, value]) => [name.toLowerCase(), value]));
  const id = headers["request-id"] ?? headers["x-correlationid"];
  return typeof id === "string" && /^[\w.-]{1,100}$/.test(id) ? id : undefined;
}

function buildItem({ org, target, api, url, method, startedAt, durationMs, outcome, status, fph, ...exchange }) {
  const startedAtIso = startedAt.toISOString();
  const raw = maskIntegrationRaw({ method, host: hostOf(url), api, status, ...exchange });
  return {
    pk: `call#${org}#${startedAtIso.slice(0, 10)}`,
    sk: `${startedAtIso}#${randomBytes(4).toString("hex")}`,
    recordType: "call",
    org,
    target,
    api,
    method,
    startedAt: startedAtIso,
    durationMs,
    outcome,
    status,
    statusLabel: outcome === "response" ? String(status) : outcome,
    appCode: raw.responseBody?.errorNumber,
    providerRequestId: providerRequestIdOf(exchange.responseHeaders),
    requestId: context.get("requestId"),
    traceparent: context.get("traceparent"),
    function: process.env.AWS_LAMBDA_FUNCTION_NAME,
    deployment: process.env.DEPLOYMENT_NAME,
    fph,
    raw,
    ttl: calculateTtl(startedAt, TTL_PRESETS.NINETY_DAYS).ttl,
  };
}

/**
 * Write the record of one finished attempt. This function does not throw, and it waits for the
 * write for at most one second.
 *
 * @param {Object} call
 * @param {string} call.org - hmrc, companies-house or stripe
 * @param {string} call.target - live or test
 * @param {string} call.api - The template of the call
 * @param {string} call.url
 * @param {string} call.method
 * @param {Date} call.startedAt
 * @param {number} call.durationMs - Time until the response headers, or until the failure
 * @param {string} call.outcome - response, timeout, network-error or refused
 * @param {number} [call.status]
 * @param {Object} [call.fph] - The fraud prevention header result, on an HMRC API call
 * @param {Headers|Object} [call.requestHeaders]
 * @param {*} [call.requestBody]
 * @param {Headers|Object} [call.responseHeaders]
 * @param {*} [call.responseBody]
 * @returns {Promise<void>}
 */
export async function recordIntegrationCall(call) {
  try {
    await withinRecordStepLimit(putIntegrationCall(buildItem(call)));
  } catch (error) {
    logger.warn({ message: "Outbound call record not written", org: call.org, api: call.api, error: error.message });
    emitMetric({
      namespace: INTEGRATION_CALLS_METRICS_NAMESPACE,
      metricName: INTEGRATION_CALL_RECORD_FAILED_METRIC,
      dimensions: { Environment: process.env.ENVIRONMENT_NAME || "unknown" },
    });
  }
}

// The caller reads the response itself, so the record reads a clone. A response that has no body
// to read leaves the record without a body skeleton.
async function responseBodyOf(response) {
  try {
    return await withinRecordStepLimit(response.clone().text());
  } catch {
    return undefined;
  }
}

/**
 * Send a request and record the attempt. A response, a timeout and a network error all leave a
 * record. The response or the error reaches the caller unchanged.
 *
 * @param {string} url
 * @param {Object} [init] - fetch options
 * @param {Object} call
 * @param {string} call.org - hmrc, companies-house or stripe
 * @param {string} call.target - live or test
 * @param {string} call.api - The template of the call
 * @param {Object} [call.fph] - The fraud prevention header result, on an HMRC API call
 * @param {function(string, Object): Promise<Response>} [call.fetchImplementation] - The send, when it is not plain fetch
 * @returns {Promise<Response>}
 */
export async function recordedFetch(url, init = {}, { org, target, api, fph, fetchImplementation = (...args) => fetch(...args) }) {
  const startedAt = new Date();
  const attempt = {
    org,
    target,
    api,
    fph,
    url,
    method: init.method || "GET",
    startedAt,
    requestHeaders: init.headers,
    requestBody: init.body,
  };
  let response;
  try {
    response = await fetchImplementation(url, init);
  } catch (error) {
    await recordIntegrationCall({
      ...attempt,
      durationMs: Date.now() - startedAt.getTime(),
      outcome: TIMEOUT_ERROR_NAMES.includes(error?.name) ? "timeout" : "network-error",
    });
    throw error;
  }
  const durationMs = Date.now() - startedAt.getTime();
  await recordIntegrationCall({
    ...attempt,
    durationMs,
    outcome: "response",
    status: response.status,
    responseHeaders: response.headers,
    responseBody: await responseBodyOf(response),
  });
  return response;
}
