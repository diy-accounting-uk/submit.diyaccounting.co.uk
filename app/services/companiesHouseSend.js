// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseSend.js
// The one send path to Companies House. Each request to the REST API, the filing API, the identity
// service and the XML Gateway leaves through here, and each attempt writes one outbound call record.

import { fetchTextWithTimeout, fetchWithTimeout, normalizeHeaders } from "../lib/httpFetch.js";
import { callActorClass, integrationApi, integrationApiForGovTalk, recordedFetch } from "../lib/integrationCalls.js";

const GATEWAY_TEST_FLAG = /<GatewayTest>\s*1\s*<\/GatewayTest>/;

function isSandboxHost(url) {
  try {
    return new URL(url).hostname.includes("sandbox");
  } catch {
    return false;
  }
}

/**
 * The target field of a record: test for a sandbox host or a GovTalk message with the gateway
 * test flag, and live for everything else.
 * @param {string} url
 * @param {{xml?: string}} [message] - The GovTalk message, when the call is to the XML Gateway
 * @returns {"live"|"test"}
 */
export function companiesHouseCallTarget(url, { xml } = {}) {
  if (xml !== undefined) return GATEWAY_TEST_FLAG.test(xml) ? "test" : "live";
  return isSandboxHost(url) ? "test" : "live";
}

// The send that waits for the headers only; the caller reads the body.
const sendWithin = (timeoutMs) => async (sendUrl, sendInit) => (await fetchWithTimeout(sendUrl, sendInit, timeoutMs)).response;

async function sendRecorded(url, init, send, { api, target }) {
  const startedAt = Date.now();
  const response = await recordedFetch(url, init, {
    org: "companies-house",
    target,
    api,
    actor: callActorClass(),
    fetchImplementation: send,
  });
  return { response, duration: Date.now() - startedAt };
}

/**
 * Send a request to Companies House and read a JSON body into `data`.
 * @param {string} url
 * @param {Object} init - fetch options
 * @param {number} timeoutMs
 * @param {Object} [options]
 * @param {string} [options.api] - The template of the call, when the URL path would not template well
 */
export async function sendJsonToCompaniesHouse(url, init, timeoutMs, { api } = {}) {
  const { response, duration } = await sendRecorded(url, init, sendWithin(timeoutMs), {
    api: api ?? integrationApi(init.method || "GET", url),
    target: companiesHouseCallTarget(url),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data, headers: normalizeHeaders(response.headers), duration, response };
}

/**
 * Send a request to Companies House and read the body as text into `data`, for a document rather
 * than a JSON answer. The timeout covers the whole body, and the read stops once the body passes
 * maxBytes: tooLarge is then true and data empty. The record of the call reads the body as read here.
 * @param {string} url
 * @param {Object} init - fetch options
 * @param {number} timeoutMs - the time allowed for the headers and the whole body
 * @param {Object} options
 * @param {number} options.maxBytes - the most bytes of body read
 * @param {string} [options.api] - The template of the call, when the URL path would not template well
 * @throws {HttpTimeoutError} If the headers or the body do not arrive in time
 */
export async function sendTextToCompaniesHouse(url, init, timeoutMs, { api, maxBytes }) {
  let tooLarge = false;
  // The body is read here, within the timeout and the limit, and the record reads the body as read.
  const sendReadingBody = async (sendUrl, sendInit) => {
    const read = await fetchTextWithTimeout(sendUrl, sendInit, timeoutMs, { maxBytes });
    tooLarge = read.tooLarge;
    const { status, statusText, headers } = read.response;
    return new Response(read.text || null, { status, statusText, headers });
  };
  const { response, duration } = await sendRecorded(url, init, sendReadingBody, {
    api: api ?? integrationApi(init.method || "GET", url),
    target: companiesHouseCallTarget(url),
  });
  const data = await response.text();
  return { ok: response.ok, status: response.status, data, tooLarge, headers: normalizeHeaders(response.headers), duration, response };
}

/**
 * Send a GovTalk message to the XML Gateway and read the XML text into `data`. The gateway can
 * answer HTTP 200 with an error inside the envelope, and the record keeps that error number.
 * @param {string} url
 * @param {Object} init - fetch options, with the XML text as the body
 * @param {number} timeoutMs
 */
export async function sendXmlToCompaniesHouse(url, init, timeoutMs) {
  const { response, duration } = await sendRecorded(url, init, sendWithin(timeoutMs), {
    api: integrationApiForGovTalk("XMLGW", init.body),
    target: companiesHouseCallTarget(url, { xml: init.body }),
  });
  const data = await response.text();
  return { ok: response.ok, status: response.status, data, headers: normalizeHeaders(response.headers), duration, response };
}
