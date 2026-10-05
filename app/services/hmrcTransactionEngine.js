// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcTransactionEngine.js
// Builds and sends GovTalk messages for HMRC's Transaction Engine (the Document Submission
// Protocol): the CT600 submission request with its IRmark, the poll and the delete request, and
// reads the acknowledgement, response and error messages it answers with. Separate from
// companiesHouseXmlGateway.js because the two gateways differ in envelope version, credentials
// (clear text here, MD5 there) and the IRmark, which only HMRC requires.

import { createHash, randomBytes } from "node:crypto";
import { createLogger } from "../lib/logger.js";
import { fetchTextWithTimeout, DEFAULT_TIMEOUTS } from "../lib/httpFetch.js";
import { parseXmlDocument, firstElementText, firstElement, allElements, escapeXmlText } from "../lib/xmlDom.js";
import { parseXmlTree, canonicaliseElement, childElement, localName } from "../lib/xmlCanonical.js";

const logger = createLogger({ source: "app/services/hmrcTransactionEngine.js" });

export const CT600_CLASS = "HMRC-CT-CT600";
export const CT600_TEST_IN_LIVE_CLASS = "HMRC-CT-CT600-TIL";

export const TRANSACTION_ENGINE_LIVE_SUBMISSION_URL = "https://transaction-engine.tax.service.gov.uk/submission";
export const TRANSACTION_ENGINE_TEST_SUBMISSION_URL = "https://test-transaction-engine.tax.service.gov.uk/submission";
export const TPVS_CT600_URL = "https://www.tpvs.hmrc.gov.uk/HMRC/CT600";

// eslint-disable-next-line sonarjs/no-clear-text-protocols -- XML namespace, compared byte for byte, not fetched
const GOVTALK_ENVELOPE_NAMESPACE = "http://www.govtalk.gov.uk/CM/envelope";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function isIrmarkElement(element) {
  return (
    localName(element.name) === "IRmark" &&
    element.parent &&
    localName(element.parent.name) === "IRheader" &&
    element.parent.parent &&
    localName(element.parent.parent.name) === "IRenvelope"
  );
}

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/**
 * The IRmark of a GovTalk message: SHA-1 over the canonical form (C14N 1.0, inclusive, without
 * comments) of its Body, with the namespaces GovTalkMessage declares carried onto Body and
 * Body/IRenvelope/IRheader/IRmark left out, per HMRC's IRmark step-by-step guide.
 * @param {string} govTalkMessageXml
 * @returns {{base64: string, base32: string}} base64 goes in the message, base32 is shown to the user
 */
export function computeIrmark(govTalkMessageXml) {
  const root = parseXmlTree(govTalkMessageXml);
  if (localName(root.name) !== "GovTalkMessage") throw new Error(`The root element is ${root.name}, not GovTalkMessage`);
  const body = childElement(root, "Body");
  if (!body) throw new Error("The GovTalk message has no Body to compute an IRmark over");
  // SHA-1 is the IRmark protocol's own required digest, not a security control this code chooses.
  // eslint-disable-next-line sonarjs/hashing
  const digest = createHash("sha1")
    .update(canonicaliseElement(body, { exclude: isIrmarkElement }), "utf8")
    .digest();
  return { base64: digest.toString("base64"), base32: base32(digest) };
}

/**
 * Fill the message's IRmark element with the IRmark computed over it.
 * @param {string} govTalkMessageXml - carrying exactly one <IRmark Type="generic">…</IRmark>
 * @returns {{xml: string, irmark: {base64: string, base32: string}}}
 */
export function withIrmark(govTalkMessageXml) {
  const pattern = /<IRmark Type="generic">[^<]*<\/IRmark>/g;
  const matches = govTalkMessageXml.match(pattern) || [];
  if (matches.length !== 1) throw new Error(`Expected one <IRmark Type="generic"> element, found ${matches.length}`);
  const irmark = computeIrmark(govTalkMessageXml);
  return { xml: govTalkMessageXml.replace(pattern, `<IRmark Type="generic">${irmark.base64}</IRmark>`), irmark };
}

/**
 * A Transaction Engine TransactionID: upper-case hex, at most 32 characters.
 * @returns {string}
 */
export function newTransactionId() {
  return randomBytes(16).toString("hex").toUpperCase();
}

/**
 * Build a CT600 SUBMISSION_REQUEST and fill in its IRmark.
 *
 * @param {object} input
 * @param {string} input.senderId - the Government Gateway user ID (ETS: the SDS team's test user)
 * @param {string} input.password - sent in clear inside TLS, as the protocol requires
 * @param {string} input.utr - the company's 10-digit Unique Taxpayer Reference
 * @param {string} input.vendorId - the 4-digit vendor ID SDST issues
 * @param {string} input.productName
 * @param {string} input.productVersion
 * @param {string} input.irEnvelopeXml - the IRenvelope element, from ct600Xml.js, with an empty IRmark
 * @param {boolean} input.gatewayTest - true for the External Test Service
 * @param {boolean} [input.testInLive] - validate on live without filing
 * @param {string} [input.transactionId]
 * @param {string} [input.timestamp] - ETS and TPVS only: an xsd:dateTime that stands in for the service clock
 * @returns {{xml: string, irmark: {base64: string, base32: string}, transactionId: string}}
 */
export function buildCt600SubmissionRequest({
  senderId,
  password,
  utr,
  vendorId,
  productName,
  productVersion,
  irEnvelopeXml,
  gatewayTest,
  testInLive = false,
  transactionId = newTransactionId(),
  timestamp,
}) {
  if (!/^\d{10}$/.test(utr)) throw new Error("The UTR must be 10 digits");
  if (!/^\d{4}$/.test(vendorId)) throw new Error("The vendor ID must be the 4 digits SDST issues");
  if (!/^[0-9A-F]{1,32}$/.test(transactionId)) throw new Error("The TransactionID must be upper-case hex, at most 32 characters");
  if (gatewayTest && testInLive) throw new Error("Test in live goes to the live service, which takes no GatewayTest");
  if (!senderId || !password) throw new Error("The Government Gateway user ID and password are required");

  const messageClass = testInLive ? CT600_TEST_IN_LIVE_CLASS : CT600_CLASS;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="${GOVTALK_ENVELOPE_NAMESPACE}"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>${messageClass}</Class><Qualifier>request</Qualifier><Function>submit</Function><TransactionID>${transactionId}</TransactionID><CorrelationID></CorrelationID><Transformation>XML</Transformation>${gatewayTest ? "<GatewayTest>1</GatewayTest>" : ""}</MessageDetails><SenderDetails><IDAuthentication><SenderID>${escapeXmlText(senderId)}</SenderID><Authentication><Method>clear</Method><Role>principal</Role><Value>${escapeXmlText(password)}</Value></Authentication></IDAuthentication></SenderDetails></Header><GovTalkDetails><Keys><Key Type="UTR">${utr}</Key></Keys><TargetDetails><Organisation>HMRC</Organisation></TargetDetails><ChannelRouting><Channel><URI>${vendorId}</URI><Product>${escapeXmlText(productName)}</Product><Version>${escapeXmlText(productVersion)}</Version></Channel>${timestamp ? `<Timestamp>${timestamp}</Timestamp>` : ""}</ChannelRouting></GovTalkDetails><Body>${irEnvelopeXml}</Body></GovTalkMessage>
`;
  const { xml: signed, irmark } = withIrmark(xml);
  return { xml: signed, irmark, transactionId };
}

/**
 * Build a SUBMISSION_POLL for a submission the Transaction Engine acknowledged.
 * @param {object} input
 * @param {string} input.correlationId - from the acknowledgement
 * @param {boolean} input.gatewayTest
 * @param {string} [input.messageClass]
 * @returns {string}
 */
export function buildPollRequest({ correlationId, gatewayTest, messageClass = CT600_CLASS }) {
  return buildFollowOnMessage({ correlationId, gatewayTest, messageClass, qualifier: "poll", messageFunction: "submit" });
}

/**
 * Build a DELETE_REQUEST, sent once a final response has been read, so the Transaction Engine
 * drops its copy.
 * @param {object} input
 * @param {string} input.correlationId
 * @param {boolean} input.gatewayTest
 * @param {string} [input.messageClass]
 * @returns {string}
 */
export function buildDeleteRequest({ correlationId, gatewayTest, messageClass = CT600_CLASS }) {
  return buildFollowOnMessage({ correlationId, gatewayTest, messageClass, qualifier: "request", messageFunction: "delete" });
}

function buildFollowOnMessage({ correlationId, gatewayTest, messageClass, qualifier, messageFunction }) {
  if (!/^[0-9A-F]{1,32}$/.test(correlationId || ""))
    throw new Error("The CorrelationID must be the upper-case hex the acknowledgement returned");
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="${GOVTALK_ENVELOPE_NAMESPACE}"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>${messageClass}</Class><Qualifier>${qualifier}</Qualifier><Function>${messageFunction}</Function><CorrelationID>${correlationId}</CorrelationID><Transformation>XML</Transformation>${gatewayTest ? "<GatewayTest>1</GatewayTest>" : ""}</MessageDetails></Header><GovTalkDetails><Keys/></GovTalkDetails><Body/></GovTalkMessage>
`;
}

/**
 * Read a Transaction Engine message: an acknowledgement (poll again later), a response (the final
 * answer), or an error (GovTalkErrors, from the gateway or from HMRC's back end).
 * @param {string} xml
 * @returns {{
 *   qualifier: string|undefined,
 *   messageFunction: string|undefined,
 *   messageClass: string|undefined,
 *   correlationId: string|undefined,
 *   responseEndPoint: string|undefined,
 *   pollIntervalSeconds: number|undefined,
 *   errors: {raisedBy: string|undefined, number: string|undefined, type: string|undefined, text: string, location: string|undefined}[],
 *   businessErrors: {number: string|undefined, type: string|undefined, text: string, location: string|undefined}[],
 *   irmarkReceipt: string|undefined,
 *   successMessage: string|undefined,
 * }}
 */
export function parseTransactionEngineResponse(xml) {
  const document = parseXmlDocument(xml.replace(/^\s*<\?xml[^?]*\?>/, ""));
  const responseEndPointElement = firstElement(document, "ResponseEndPoint");
  const pollInterval = responseEndPointElement?.getAttribute("PollInterval");
  const errorsElement = firstElement(document, "GovTalkErrors");
  const errors = errorsElement
    ? allElements(errorsElement, "Error").map((error) => ({
        raisedBy: firstElementText(error, "RaisedBy"),
        number: firstElementText(error, "Number"),
        type: firstElementText(error, "Type"),
        text: allElements(error, "Text")
          .map((text) => text.textContent)
          .join(" ")
          .trim(),
        location: firstElementText(error, "Location"),
      }))
    : [];
  const bodyElement = firstElement(document, "Body");
  const businessErrors = bodyElement
    ? allElements(bodyElement, "Error").map((error) => ({
        number: firstElementText(error, "Number"),
        type: firstElementText(error, "Type"),
        text: allElements(error, "Text")
          .map((text) => text.textContent)
          .join(" ")
          .trim(),
        location: firstElementText(error, "Location"),
      }))
    : [];
  const digestValue = bodyElement
    ? Array.from(bodyElement.getElementsByTagName("*")).find((element) => element.localName === "DigestValue")
    : undefined;
  return {
    qualifier: firstElementText(document, "Qualifier"),
    messageFunction: firstElementText(document, "Function"),
    messageClass: firstElementText(document, "Class"),
    correlationId: firstElementText(document, "CorrelationID") || undefined,
    responseEndPoint: responseEndPointElement?.textContent || undefined,
    pollIntervalSeconds: pollInterval ? Number(pollInterval) : undefined,
    errors,
    businessErrors,
    irmarkReceipt: digestValue?.textContent,
    successMessage: bodyElement ? firstElementText(bodyElement, "Message") : undefined,
  };
}

/**
 * The Transaction Engine submission URL: HMRC_TRANSACTION_ENGINE_URL when set (the simulator),
 * otherwise the External Test Service for a test message and the live service for any other.
 * @param {object} input
 * @param {boolean} input.gatewayTest
 * @returns {string}
 */
export function getTransactionEngineSubmissionUrl({ gatewayTest }) {
  if (process.env.HMRC_TRANSACTION_ENGINE_URL) return process.env.HMRC_TRANSACTION_ENGINE_URL;
  return gatewayTest ? TRANSACTION_ENGINE_TEST_SUBMISSION_URL : TRANSACTION_ENGINE_LIVE_SUBMISSION_URL;
}

/**
 * POST a GovTalk message and return the raw text response. The message is never logged: a
 * submission request carries the customer's Government Gateway password.
 * @param {string} url
 * @param {string} xml
 * @returns {Promise<{ok: boolean, status: number, data: string, headers: object, duration: number}>}
 */
export async function postToTransactionEngine(url, xml) {
  logger.info({ message: `POST ${url}`, url });
  const result = await fetchTextWithTimeout(
    url,
    { method: "POST", headers: { "Content-Type": "text/xml; charset=UTF-8" }, body: xml },
    DEFAULT_TIMEOUTS.LONG,
  );
  logger.info({ message: `Response from POST ${url}`, url, status: result.status });
  return result;
}
