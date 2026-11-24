// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Input checks and the submit, poll and delete exchange for scripts/hmrc-tpvs-ct600.js --ets, which
// files a CT600 with HMRC's External Test Service under the SDST test credentials, and for --til,
// which sends it to the live service as a test-in-live message that files nothing.

import {
  buildDeleteRequest,
  buildPollRequest,
  CT600_CLASS,
  CT600_TEST_IN_LIVE_CLASS,
  parseTransactionEngineResponse,
  postToTransactionEngine,
  redactGatewayCredentials,
  TRANSACTION_ENGINE_LIVE_SUBMISSION_URL,
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
 * Post a built submission to a Transaction Engine, poll the acknowledgement until a final response
 * or an error, then delete. The poll and the delete carry the submission's class, and GatewayTest
 * only when the service is the External Test Service. Every message is appended to the transcript
 * with credentials blanked.
 * @param {object} input
 * @param {string} input.submissionXml - the built request, with credentials
 * @param {string} input.submissionUrl
 * @param {boolean} input.gatewayTest
 * @param {string} input.messageClass
 * @param {string} input.serviceName - names the service in an error
 * @param {number} [input.timeoutMs] - overall limit across the polls
 * @param {number} [input.maxPollIntervalSeconds] - cap on the wait between polls
 * @param {(url: string, xml: string) => Promise<{status: number, data: string}>} [input.post]
 * @param {(milliseconds: number) => Promise<void>} [input.wait]
 * @returns {Promise<{transcript: {label: string, xml: string}[], final: object|undefined, ok: boolean}>}
 */
async function runTransactionEngineExchange({
  submissionXml,
  submissionUrl,
  gatewayTest,
  messageClass,
  serviceName,
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
    if (result.status !== 200) throw new Error(`${serviceName} answered HTTP ${result.status} to the ${label}`);
    return parseTransactionEngineResponse(result.data);
  };

  let parsed = await send("submit", submissionUrl, submissionXml);
  const correlationId = parsed.correlationId;
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  while (parsed.qualifier === "acknowledgement" && parsed.errors.length === 0) {
    if (Date.now() >= deadline) throw new Error(`No final ${serviceName} response within ${timeoutMs} ms`);
    const seconds = Math.min(parsed.pollIntervalSeconds ?? 10, maxPollIntervalSeconds);
    await wait(seconds * 1000);
    pollCount += 1;
    const pollUrl = parsed.responseEndPoint || submissionUrl;
    parsed = await send(`poll-${pollCount}`, pollUrl, buildPollRequest({ correlationId, gatewayTest, messageClass }));
  }
  const ok = parsed.qualifier === "response" && parsed.errors.length === 0;
  if (correlationId) {
    await send("delete", submissionUrl, buildDeleteRequest({ correlationId, gatewayTest, messageClass })).catch((error) =>
      record("delete-error", error.message),
    );
  }
  return { transcript, final: parsed, ok };
}

/**
 * File a built submission with ETS: post, poll to a final response or an error, then delete.
 * @param {object} input - runTransactionEngineExchange's input without the service fields
 * @returns {Promise<{transcript: {label: string, xml: string}[], final: object|undefined, ok: boolean}>}
 */
export async function runEtsExchange(input) {
  return runTransactionEngineExchange({
    ...input,
    submissionUrl: TRANSACTION_ENGINE_TEST_SUBMISSION_URL,
    gatewayTest: true,
    messageClass: CT600_CLASS,
    serviceName: "ETS",
  });
}

/**
 * Send a built test-in-live submission to HMRC's live Transaction Engine, which checks it against
 * the live rules and the company's records and files nothing: post, poll and delete, each with the
 * class HMRC-CT-CT600-TIL and no GatewayTest. A submission of another class, or one that carries
 * GatewayTest, is refused before anything is sent.
 * @param {object} input - runTransactionEngineExchange's input without the service fields
 * @returns {Promise<{transcript: {label: string, xml: string}[], final: object|undefined, ok: boolean}>}
 */
export async function runTestInLiveExchange(input) {
  if (!input.submissionXml.includes(`<Class>${CT600_TEST_IN_LIVE_CLASS}</Class>`))
    throw new Error(`A test-in-live submission carries the class ${CT600_TEST_IN_LIVE_CLASS}; nothing was sent to HMRC`);
  if (input.submissionXml.includes("<GatewayTest>"))
    throw new Error("A test-in-live submission goes to the live service, which takes no GatewayTest; nothing was sent to HMRC");
  return runTransactionEngineExchange({
    ...input,
    submissionUrl: TRANSACTION_ENGINE_LIVE_SUBMISSION_URL,
    gatewayTest: false,
    messageClass: CT600_TEST_IN_LIVE_CLASS,
    serviceName: "The live Transaction Engine",
  });
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
