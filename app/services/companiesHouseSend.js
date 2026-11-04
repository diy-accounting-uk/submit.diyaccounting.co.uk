// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseSend.js
// The one send path to Companies House. Each request to the REST API, the filing API, the identity
// service and the XML Gateway leaves through here, and each attempt writes one outbound call record.

import { fetchWithTimeout, normalizeHeaders } from "../lib/httpFetch.js";
import { integrationApi, integrationApiForGovTalk, recordedFetch } from "../lib/integrationCalls.js";

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

async function sendRecorded(url, init, timeoutMs, { api, target }) {
  const startedAt = Date.now();
  const response = await recordedFetch(url, init, {
    org: "companies-house",
    target,
    api,
    fetchImplementation: async (sendUrl, sendInit) => (await fetchWithTimeout(sendUrl, sendInit, timeoutMs)).response,
  });
  return { response, duration: Date.now() - startedAt };
}

/**
 * Send a request to Companies House and read a JSON body. The result has the shape of
 * fetchJsonWithTimeout.
 * @param {string} url
 * @param {Object} init - fetch options
 * @param {number} timeoutMs
 * @param {Object} [options]
 * @param {string} [options.api] - The template of the call, when the URL path would not template well
 */
export async function sendJsonToCompaniesHouse(url, init, timeoutMs, { api } = {}) {
  const { response, duration } = await sendRecorded(url, init, timeoutMs, {
    api: api ?? integrationApi(init.method || "GET", url),
    target: companiesHouseCallTarget(url),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data, headers: normalizeHeaders(response.headers), duration, response };
}

/**
 * Send a GovTalk message to the XML Gateway and read the XML text. The result has the shape of
 * fetchTextWithTimeout. The gateway can answer HTTP 200 with an error inside the envelope, and the
 * record keeps that error number.
 * @param {string} url
 * @param {Object} init - fetch options, with the XML text as the body
 * @param {number} timeoutMs
 */
export async function sendXmlToCompaniesHouse(url, init, timeoutMs) {
  const { response, duration } = await sendRecorded(url, init, timeoutMs, {
    api: integrationApiForGovTalk("XMLGW", init.body),
    target: companiesHouseCallTarget(url, { xml: init.body }),
  });
  const data = await response.text();
  return { ok: response.ok, status: response.status, data, headers: normalizeHeaders(response.headers), duration, response };
}
