// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-19 File a Corporation Tax test scenario to TPVS or ETS
// - **Use when:** HMRC's Software Developers Support Team sends Corporation Tax test scenarios whose figures must be filed by the product's own builder to TPVS or ETS and the XML sent back, or a case must show which CT600 content the product refuses.
// - **Does:** reads one scenario file holding the typed figures the typed-entry page posts, builds the return through the same request validation and builders the hmrcCtReturnPost Lambda uses, sends it to TPVS or with --ets to ETS, and writes request.xml (credentials masked), each response and result.json under the output folder. A scenario the product refuses writes refused.json with the field and message and exits 2. A scenario with longPeriod.part files one of the two returns of a period of account longer than 12 months (long-period-part-1.json and long-period-part-2.json).
// - **Run:** `node scripts/hmrc-tpvs-ct600.js --scenario fixtures/ct-scenarios/marginal-relief-small.json --out target/ct-scenarios`
// - **Entry:** `scripts/hmrc-tpvs-ct600.js`; `scripts/lib/ctScenarioCommand.js:runScenarioCommand`
// - **Files:** scripts/hmrc-tpvs-ct600.js, scripts/lib/ctScenario.js, scripts/lib/ctScenarioCommand.js, scripts/lib/etsCt600.js, fixtures/ct-scenarios/marginal-relief-small.json, fixtures/ct-scenarios/micro-entity-loss.json, fixtures/ct-scenarios/long-period-part-1.json, fixtures/ct-scenarios/long-period-part-2.json, app/unit-tests/scripts/ctScenario.test.js
// - **Keywords:** scenario, SDST, TPVS, ETS, CT600, corporation tax, test pack, refused, irmark, new applicant
// - **Related:** CH-15
// @end-capability

// Reads a Corporation Tax test scenario and files it for scripts/hmrc-tpvs-ct600.js --scenario.
// The scenario holds the request body the typed-entry page posts to hmrcCtReturnPost. The return is
// built by the same product code the Lambda calls, then sent to TPVS or, with ets, to ETS.
// The scenario file format is documented in fixtures/ct-scenarios/marginal-relief-small.json. A
// request with longPeriod { filingId, part: 1 | 2 } and figures.accountingPeriods files one of the two
// returns of a period of account longer than 12 months (fixtures/ct-scenarios/long-period-part-1.json).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT_VERSION } from "../../app/lib/productVersion.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments } from "../../app/services/hmrcCtReturnRequest.js";
import { Ct600RefusedError } from "../../app/services/ct600Figures.js";
import {
  assertCtMessageWithinLimit,
  buildCt600SubmissionRequest,
  parseTransactionEngineResponse,
  postToTransactionEngine,
  redactGatewayCredentials,
  TPVS_CT600_URL,
} from "../../app/services/hmrcTransactionEngine.js";
import { runEtsExchange } from "./etsCt600.js";

export const REFUSED_EXIT_CODE = 2;
const FORBIDDEN_REQUEST_FIELDS = ["utr", "gatewayUserId", "gatewayPassword", "reviewedBoxes"];
const PRODUCT_NAME = "DIY Accounting Submit";
const DEFAULT_AGENT_REFERENCE = "SCENARIO-AGENT";

/**
 * Read and check a scenario file.
 * @param {string} file
 * @returns {{name: string, description?: string, sender: "company"|"agent", request: object}}
 */
export function readScenario(file) {
  let scenario;
  try {
    scenario = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`The scenario file ${file} cannot be read as JSON: ${error.message}`);
  }
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario))
    throw new Error(`The scenario file ${file} must hold a JSON object`);
  if (typeof scenario.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(scenario.name)) {
    throw new Error("The scenario name must be lower-case letters, digits and hyphens, because it names the output folder");
  }
  const sender = scenario.sender ?? "company";
  if (sender !== "company" && sender !== "agent") throw new Error('The scenario sender must be "company" or "agent"');
  if (!scenario.request || typeof scenario.request !== "object" || Array.isArray(scenario.request)) {
    throw new Error("The scenario needs a request object: the body the typed-entry page posts");
  }
  const forbidden = FORBIDDEN_REQUEST_FIELDS.filter((field) => field in scenario.request);
  if (forbidden.length > 0) {
    throw new Error(`The scenario request must not hold ${forbidden.join(", ")}; the runner supplies the UTR and works the reviewed boxes`);
  }
  if (sender === "agent" && !scenario.request.agent?.practiceName) {
    throw new Error("An agent scenario needs request.agent.practiceName");
  }
  return { name: scenario.name, description: scenario.description, sender, request: scenario.request };
}

/**
 * Build the return for a scenario through the product's own request validation and builders.
 * @param {object} input
 * @param {ReturnType<typeof readScenario>} input.scenario
 * @param {string} input.utr
 * @param {string} input.senderId
 * @param {string} input.password
 * @param {string} input.vendorId
 * @returns {{refused: {field: string, message: string}} | {xml: string, irmark: string, boxes: object, transactionId: string}}
 */
export function buildScenarioSubmission({ scenario, utr, senderId, password, vendorId }) {
  const body = { ...scenario.request, utr };
  const errors = [];
  let client;
  if (scenario.sender === "agent") {
    const clientId = scenario.request.agent.reference || DEFAULT_AGENT_REFERENCE;
    client = { clientId, identifiers: { utr, companyNumber: scenario.request.companyNumber } };
  }
  const request = extractAndValidateCtReturnParameters({ body: JSON.stringify(body) }, errors, {
    requireGatewayCredentials: false,
    requireReviewedBoxes: false,
    client,
  });
  if (errors.length === 0 && !request.accounts.registeredOffice?.addressLine1) {
    errors.push("Missing registeredOffice - the scenario must carry it because the runner does not look it up");
  }
  if (errors.length > 0) return { refused: { field: "request", message: errors.join("; ") } };

  let documents;
  try {
    documents = buildCtReturnDocuments(request);
  } catch (error) {
    if (error instanceof Ct600RefusedError) return { refused: { field: error.field ?? "figures", message: error.message } };
    return { refused: { field: "documents", message: `${error.name}: ${error.message}` } };
  }
  const { xml, irmark, transactionId } = buildCt600SubmissionRequest({
    senderId,
    password,
    utr,
    vendorId,
    productName: PRODUCT_NAME,
    productVersion: PRODUCT_VERSION,
    irEnvelopeXml: documents.irEnvelopeXml,
    gatewayTest: true,
  });
  try {
    assertCtMessageWithinLimit(xml);
  } catch (error) {
    return { refused: { field: "message", message: error.message } };
  }
  return { xml, irmark: irmark.base32, boxes: documents.boxes, transactionId };
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function withoutValue(boxes, secret) {
  return Object.fromEntries(Object.entries(boxes).map(([box, value]) => [box, value === secret ? "***" : value]));
}

function errorsOf(parsed) {
  return [...parsed.errors, ...parsed.businessErrors];
}

/**
 * File one scenario and write its folder: request.xml, each response, result.json, and refused.json
 * when the product refuses the scenario.
 * @param {object} input
 * @param {ReturnType<typeof readScenario>} input.scenario
 * @param {string} input.outDirectory
 * @param {string} input.utr
 * @param {{senderId: string, password: string, vendorId: string}} [input.ets] - set to file with ETS
 * @param {(url: string, xml: string) => Promise<{status: number, data: string}>} [input.post]
 * @param {(milliseconds: number) => Promise<void>} [input.wait]
 * @returns {Promise<{exitCode: number, result: object}>}
 */
export async function runScenario({ scenario, outDirectory, utr, ets, post = postToTransactionEngine, wait }) {
  const directory = join(outDirectory, scenario.name);
  mkdirSync(directory, { recursive: true });
  const service = ets ? "ets" : "tpvs";
  const built = buildScenarioSubmission({
    scenario,
    utr,
    senderId: ets ? ets.senderId : "tpvs",
    password: ets ? ets.password : "tpvs",
    vendorId: ets ? ets.vendorId : "1000",
  });
  if (built.refused) {
    writeJson(join(directory, "refused.json"), { scenario: scenario.name, ...built.refused });
    return { exitCode: REFUSED_EXIT_CODE, result: { scenario: scenario.name, service, outcome: "refused", ...built.refused } };
  }
  writeFileSync(join(directory, "request.xml"), redactGatewayCredentials(built.xml));

  const result = { scenario: scenario.name, service, irmark: built.irmark, boxes: withoutValue(built.boxes, utr) };
  if (ets) {
    const exchange = await runEtsExchange({ submissionXml: built.xml, post, ...(wait ? { wait } : {}) });
    exchange.transcript.forEach(({ label, xml }, index) =>
      writeFileSync(join(directory, `ets-${String(index + 1).padStart(2, "0")}-${label}.xml`), xml),
    );
    result.outcome = exchange.ok ? "accepted" : "rejected";
    result.correlationId = exchange.final?.correlationId;
    result.errors = exchange.final ? errorsOf(exchange.final) : [];
  } else {
    const response = await post(TPVS_CT600_URL, built.xml);
    writeFileSync(join(directory, "response.xml"), response.data);
    result.httpStatus = response.status;
    if (response.status === 200) {
      const parsed = parseTransactionEngineResponse(response.data);
      result.correlationId = parsed.correlationId;
      result.errors = errorsOf(parsed);
      result.outcome = parsed.qualifier === "response" && result.errors.length === 0 ? "accepted" : "rejected";
    } else {
      result.outcome = "rejected";
      result.errors = [{ text: `TPVS answered HTTP ${response.status}` }];
    }
  }
  writeJson(join(directory, "result.json"), result);
  return { exitCode: result.outcome === "accepted" ? 0 : 1, result };
}
