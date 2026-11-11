// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Input checks and the submit, poll and delete exchange for scripts/hmrc-tpvs-ct600.js --ets, which
// files a CT600 with HMRC's External Test Service under the SDST test credentials.

import {
  buildDeleteRequest,
  buildPollRequest,
  parseTransactionEngineResponse,
  postToTransactionEngine,
  redactGatewayCredentials,
  TRANSACTION_ENGINE_TEST_SUBMISSION_URL,
} from "../../app/services/hmrcTransactionEngine.js";

export const ETS_VARIABLES = ["HMRC_CT_ETS_SENDER_ID", "HMRC_CT_ETS_PASSWORD", "HMRC_CT_ETS_UTR", "HMRC_CT_VENDOR_ID"];

/**
 * Read the ETS inputs from the environment and name every one that is missing or malformed.
 * @param {Record<string, string|undefined>} env
 * @returns {{senderId: string, password: string, utr: string, vendorId: string}}
 */
export function readEtsInputs(env) {
  const missing = ETS_VARIABLES.filter((name) => !env[name] || env[name].trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `The ETS mode needs ${missing.join(", ")} in the environment; ${missing.length === 1 ? "it is" : "they are"} missing or empty.`,
    );
  }
  const utr = env.HMRC_CT_ETS_UTR.trim();
  const vendorId = env.HMRC_CT_VENDOR_ID.trim();
  const malformed = [];
  if (!/^\d{10}$/.test(utr)) malformed.push("HMRC_CT_ETS_UTR must be 10 digits");
  if (!/^\d{4}$/.test(vendorId)) malformed.push("HMRC_CT_VENDOR_ID must be 4 digits");
  if (malformed.length > 0) throw new Error(`The ETS mode cannot start: ${malformed.join("; ")}.`);
  return { senderId: env.HMRC_CT_ETS_SENDER_ID, password: env.HMRC_CT_ETS_PASSWORD, utr, vendorId };
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Post a built submission to ETS, poll the acknowledgement until a final response or an error,
 * then delete. Every message is appended to the transcript with credentials blanked.
 * @param {object} input
 * @param {string} input.submissionXml - the built request, with credentials
 * @param {number} [input.timeoutMs] - overall limit across the polls
 * @param {number} [input.maxPollIntervalSeconds] - cap on the wait between polls
 * @param {(url: string, xml: string) => Promise<{status: number, data: string}>} [input.post]
 * @param {(milliseconds: number) => Promise<void>} [input.wait]
 * @returns {Promise<{transcript: {label: string, xml: string}[], final: object|undefined, ok: boolean}>}
 */
export async function runEtsExchange({
  submissionXml,
  timeoutMs = 10 * 60 * 1000,
  maxPollIntervalSeconds = 60,
  post = postToTransactionEngine,
  wait = sleep,
}) {
  const transcript = [];
  const record = (label, xml) => transcript.push({ label, xml: redactGatewayCredentials(xml) });
  const send = async (label, url, xml) => {
    record(`${label}-request`, xml);
    const result = await post(url, xml);
    record(`${label}-response`, result.data);
    if (result.status !== 200) throw new Error(`ETS answered HTTP ${result.status} to the ${label}`);
    return parseTransactionEngineResponse(result.data);
  };

  let parsed = await send("submit", TRANSACTION_ENGINE_TEST_SUBMISSION_URL, submissionXml);
  const correlationId = parsed.correlationId;
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  while (parsed.qualifier === "acknowledgement" && parsed.errors.length === 0) {
    if (Date.now() >= deadline) throw new Error(`No final ETS response within ${timeoutMs} ms`);
    const seconds = Math.min(parsed.pollIntervalSeconds ?? 10, maxPollIntervalSeconds);
    await wait(seconds * 1000);
    pollCount += 1;
    const pollUrl = parsed.responseEndPoint || TRANSACTION_ENGINE_TEST_SUBMISSION_URL;
    parsed = await send(`poll-${pollCount}`, pollUrl, buildPollRequest({ correlationId, gatewayTest: true }));
  }
  const ok = parsed.qualifier === "response" && parsed.errors.length === 0;
  if (correlationId) {
    await send("delete", TRANSACTION_ENGINE_TEST_SUBMISSION_URL, buildDeleteRequest({ correlationId, gatewayTest: true })).catch((error) =>
      record("delete-error", error.message),
    );
  }
  return { transcript, final: parsed, ok };
}

/**
 * Change the IRmark in a built submission after it was computed, so HMRC cannot match it.
 * @param {string} xml
 * @returns {string}
 */
export function tamperIrmark(xml) {
  const pattern = /(<IRmark Type="generic">)([^<]*)(<\/IRmark>)/;
  if (!pattern.test(xml)) throw new Error("The submission carries no IRmark to change");
  return xml.replace(pattern, (_, open, value, close) => `${open}${value.startsWith("A") ? "B" : "A"}${value.slice(1)}${close}`);
}

/**
 * Whether the tampered-IRmark case passed: HMRC answered business error 2021 and the delete went through.
 * @param {{final?: object, transcript: {label: string}[]}} result - from runEtsExchange
 * @returns {boolean}
 */
export function tamperCasePassed({ final, transcript }) {
  const numbers = [...(final?.errors ?? []), ...(final?.businessErrors ?? [])].map((error) => error.number);
  const deleted =
    transcript.some((entry) => entry.label === "delete-response") && !transcript.some((entry) => entry.label === "delete-error");
  return numbers.includes("2021") && deleted;
}
