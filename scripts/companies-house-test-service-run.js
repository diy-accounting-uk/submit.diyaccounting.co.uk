#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Runs a fixed list of Companies House XML Gateway test-service cases end to end - a
 * CompanyDataRequest, a PaymentPeriodsRequest, several confirmation statement variants (a
 * no-change statement, a SIC change, one with Shareholdings, a registered email change) and the
 * negative cases the assumed software-authorisation criteria ask for (a blank director code, a
 * wrong company authentication code) - and writes an evidence log a human can hand to Companies
 * House's XML team or fold into the CS-A4 evidence pack.
 *
 * Builds every envelope from companiesHouseXmlGateway.js's own exports
 * (buildCompanyDataRequest, buildPaymentPeriodsRequest, buildConfirmationStatementSubmission,
 * buildStatusRequest, parseGatewayResponse, allocateSubmissionNumber, redactPresenterCredentials,
 * postToGateway) and companiesHouseConfirmationStatementXml.js's buildConfirmationStatementBody -
 * this script duplicates neither the envelope logic nor the confirmation statement body builder.
 * Reuses companies-house-xmlgw-poll.js's own out-of-repository check (assertOutsideRepository,
 * resolveRepoRoot) rather than re-deriving it.
 *
 * A confirmation statement case is submitted once and then polled, honouring the PollInterval
 * the gateway's own acknowledgement (or a later poll response) announces, until the gateway
 * answers a terminal StatusCode (ACCEPT or REJECT) or a GovTalkErrors block. The test service
 * currently answers GetSubmissionStatus with GovTalkErrors 9999 "No presenter ID supplied" for
 * every poll (B34.6c's blocker) - that is recorded as the case's observed outcome, not thrown as
 * a crash, so one broken poll never stops the rest of the run. A CompanyDataRequest or
 * PaymentPeriodsRequest is free and synchronous: it is never polled.
 *
 * Usage:
 *   node scripts/companies-house-test-service-run.js --cases <fixture.json> --out-dir <dir> [--case <name>]
 *
 * --out-dir is required and must resolve outside this repository (assertOutsideRepository), so
 * an evidence log carrying redacted gateway exchanges is never a file git could pick up.
 * --case runs a single named case from the fixture instead of the whole list.
 *
 * A case may carry an optional `govTestScenario`, sent as the Gov-Test-Scenario header on every
 * gateway call the case makes; the real gateway ignores headers it does not know (postToGateway's
 * own doc comment), and the fixture this run ships with never sets it - only the unit tests do,
 * against the simulator, to reach its ACCEPT/REJECT scenarios deterministically.
 *
 * Environment variables (as companiesHouseXmlGateway.js's own resolvePresenterCredentials and
 * getXmlGatewayUri read them):
 *   COMPANIES_HOUSE_PRESENTER_ID / _ARN
 *   COMPANIES_HOUSE_PRESENTER_CODE / _ARN
 *   COMPANIES_HOUSE_XMLGW_URI                          - defaults to the real gateway
 *   COMPANIES_HOUSE_GATEWAY_TEST                        - "true" sets GatewayTest in the envelope
 *   COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME  - allocateSubmissionNumber's counter table
 *
 * Exits non-zero when any case's observed outcome does not match its fixture's expectedOutcome.
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildCompanyDataRequest,
  buildPaymentPeriodsRequest,
  buildConfirmationStatementSubmission,
  buildStatusRequest,
  parseGatewayResponse,
  resolvePresenterCredentials,
  allocateSubmissionNumber,
  redactPresenterCredentials,
  postToGateway,
} from "../app/services/companiesHouseXmlGateway.js";
import {
  buildConfirmationStatementBody,
  selectConfirmationStatementSchema,
} from "../app/services/companiesHouseConfirmationStatementXml.js";
import { assertOutsideRepository, resolveRepoRoot } from "./companies-house-xmlgw-poll.js";

// Bounds on the confirmation statement poll loop, so a case that never reaches a terminal state
// (and never returns a GovTalkErrors block either) cannot hang the run forever.
const DEFAULT_POLL_INTERVAL_MS = 2000;
const MIN_POLL_INTERVAL_MS = 1000;
const MAX_POLL_INTERVAL_MS = 30000;
const MAX_POLL_ATTEMPTS = 30;
const MAX_POLL_WALL_CLOCK_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * Whether a synchronous read (CompanyDataRequest or PaymentPeriodsRequest) succeeded or the
 * gateway answered a GovTalkErrors block.
 * @param {ReturnType<typeof parseGatewayResponse>} parsed
 * @returns {{status: "OK"|"GOVTALK_ERROR", errors?: Array}}
 */
export function decideSyncOutcome(parsed) {
  if (parsed.errors && parsed.errors.length > 0) {
    return { status: "GOVTALK_ERROR", errors: parsed.errors };
  }
  return { status: "OK" };
}

/**
 * One step of a confirmation statement poll loop: terminal when the gateway answers a
 * GovTalkErrors block (any number, 9999 included) or a Status with StatusCode ACCEPT or REJECT;
 * otherwise PENDING or PARKED, and the loop continues.
 * @param {ReturnType<typeof parseGatewayResponse>} parsed
 * @param {string} submissionNumber
 * @returns {{terminal: boolean, status: string, errors?: Array, rejections?: Array}}
 */
export function decidePollStep(parsed, submissionNumber) {
  if (parsed.errors && parsed.errors.length > 0) {
    return { terminal: true, status: "GOVTALK_ERROR", errors: parsed.errors };
  }
  const match = (parsed.statuses || []).find((status) => status.submissionNumber === submissionNumber) || parsed.statuses?.[0];
  if (!match) {
    return { terminal: true, status: "NO_STATUS" };
  }
  if (match.statusCode === "ACCEPT" || match.statusCode === "REJECT") {
    return { terminal: true, status: match.statusCode, rejections: match.rejections || [] };
  }
  return { terminal: false, status: match.statusCode, rejections: match.rejections || [] };
}

/**
 * How long to wait before the next poll: the gateway's own announced PollInterval (seconds) when
 * present and positive, clamped to a sane range, else the previous delay, else the default.
 * @param {ReturnType<typeof parseGatewayResponse>} parsed
 * @param {number} previousDelayMs
 * @returns {number}
 */
export function nextPollDelayMs(parsed, previousDelayMs) {
  if (Number.isFinite(parsed.pollInterval) && parsed.pollInterval > 0) {
    return Math.min(Math.max(parsed.pollInterval * 1000, MIN_POLL_INTERVAL_MS), MAX_POLL_INTERVAL_MS);
  }
  return previousDelayMs ?? DEFAULT_POLL_INTERVAL_MS;
}

/**
 * Whether a case's observed outcome matches its fixture's expected one. A loose, top-level
 * status comparison only - the evidence log carries the full detail for a human to check the
 * reject codes and error numbers themselves.
 * @param {{status: string}} expectedOutcome
 * @param {string} observedStatus
 * @returns {boolean}
 */
export function evaluateOutcome(expectedOutcome, observedStatus) {
  return expectedOutcome?.status === observedStatus;
}

/**
 * Deliberately blank the first director's CompaniesHousePersonalCode in an already-built
 * confirmation statement body, for the harness's own negative case (Q3: what does the gateway
 * answer for a statement whose director carries no code). buildConfirmationStatementBody()
 * itself refuses to build this - correctly, for a real filing - so the harness corrupts a validly
 * built body afterwards rather than reimplementing the builder without that guard.
 * @param {string} statementXml
 * @returns {string}
 */
export function blankFirstDirectorPersonalCode(statementXml) {
  return statementXml.replace(
    /<CompaniesHousePersonalCode>[^<]*<\/CompaniesHousePersonalCode>/,
    "<CompaniesHousePersonalCode></CompaniesHousePersonalCode>",
  );
}

function nowIso() {
  return new Date().toISOString();
}

function redactExchange(label, requestXml, response) {
  return {
    label,
    requestXml: redactPresenterCredentials(requestXml),
    responseStatus: response.status,
    responseXml: redactPresenterCredentials(response.data),
    at: nowIso(),
  };
}

async function sendEnvelope({ label, xml, exchanges, govTestScenario }) {
  const extraHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
  const response = await postToGateway(xml, extraHeaders);
  exchanges.push(redactExchange(label, xml, response));
  return { response, parsed: parseGatewayResponse(response.data) };
}

/**
 * Run one synchronous case (CompanyDataRequest or PaymentPeriodsRequest): a single request, no
 * polling.
 * @returns {Promise<object>} the case's evidence log entry, without `pass` (the caller adds it)
 */
async function runSyncCase(caseDef, { presenterId, presenterCode, gatewayTest }) {
  const exchanges = [];
  const transactionId = String(Date.now());
  const requestXml =
    caseDef.type === "companyDataRequest"
      ? buildCompanyDataRequest({
          presenterId,
          presenterCode,
          companyNumber: caseDef.companyNumber,
          companyAuthenticationCode: caseDef.companyAuthenticationCode,
          madeUpDate: caseDef.madeUpDate,
          transactionId,
          gatewayTest,
        })
      : buildPaymentPeriodsRequest({
          presenterId,
          presenterCode,
          companyNumber: caseDef.companyNumber,
          companyAuthenticationCode: caseDef.companyAuthenticationCode,
          transactionId,
          gatewayTest,
        });

  const submittedAt = nowIso();
  const { parsed } = await sendEnvelope({ label: "request", xml: requestXml, exchanges, govTestScenario: caseDef.govTestScenario });
  const outcome = decideSyncOutcome(parsed);

  return {
    case: caseDef.name,
    type: caseDef.type,
    requestClass: caseDef.type === "companyDataRequest" ? "CompanyDataRequest" : "PaymentPeriodsRequest",
    transactionIds: [transactionId],
    timestamps: { submittedAt, terminalAt: nowIso() },
    observedStatus: outcome.status,
    errors: outcome.errors || [],
    rejections: [],
    exchanges,
  };
}

/**
 * Run one confirmation statement case: allocate a submission number, submit, and - unless the
 * submission itself answered a GovTalkErrors block - poll to a terminal state.
 */
async function runConfirmationStatementCase(caseDef, { presenterId, presenterCode, gatewayTest, sleepFn = sleep }) {
  const exchanges = [];
  const transactionIds = [];
  const submissionNumber = await allocateSubmissionNumber();

  const statement = caseDef.statement || {};
  const schema = selectConfirmationStatementSchema(statement.officers);
  let statementXml = buildConfirmationStatementBody(statement);
  if (caseDef.corruptFirstDirectorPersonalCode) {
    statementXml = blankFirstDirectorPersonalCode(statementXml);
  }

  const submitTransactionId = String(Date.now());
  transactionIds.push(submitTransactionId);
  const submitXml = buildConfirmationStatementSubmission({
    presenterId,
    presenterCode,
    companyNumber: caseDef.companyNumber,
    companyName: caseDef.companyName,
    companyAuthenticationCode: caseDef.companyAuthenticationCode,
    submissionNumber,
    dateSigned: statement.reviewDate,
    statementXml,
    formIdentifier: schema.rootElement,
    transactionId: submitTransactionId,
    gatewayTest,
  });

  const submittedAt = nowIso();
  const { parsed: submitParsed } = await sendEnvelope({
    label: "submit",
    xml: submitXml,
    exchanges,
    govTestScenario: caseDef.govTestScenario,
  });

  // A submission the gateway rejects outright (a GovTalkErrors block on the acknowledgement
  // itself) is already terminal; an ordinary acknowledgement carries no Status block yet, so it
  // always needs at least one poll - decidePollStep only applies to an actual poll response.
  let terminal =
    submitParsed.errors && submitParsed.errors.length > 0
      ? { terminal: true, status: "GOVTALK_ERROR", errors: submitParsed.errors }
      : { terminal: false, status: "PENDING" };

  let delayMs = nextPollDelayMs(submitParsed, DEFAULT_POLL_INTERVAL_MS);
  const pollStartedAt = Date.now();
  let attempts = 0;

  while (!terminal.terminal) {
    attempts += 1;
    if (attempts > MAX_POLL_ATTEMPTS || Date.now() - pollStartedAt > MAX_POLL_WALL_CLOCK_MS) {
      terminal = { terminal: true, status: "POLL_TIMEOUT" };
      break;
    }

    await sleepFn(delayMs);

    const pollTransactionId = String(Date.now());
    transactionIds.push(pollTransactionId);
    const pollXml = buildStatusRequest({ presenterId, presenterCode, submissionNumber, transactionId: pollTransactionId, gatewayTest });
    const { parsed: pollParsed } = await sendEnvelope({
      label: `poll-${attempts}`,
      xml: pollXml,
      exchanges,
      govTestScenario: caseDef.govTestScenario,
    });

    terminal = decidePollStep(pollParsed, submissionNumber);
    delayMs = nextPollDelayMs(pollParsed, delayMs);
  }

  return {
    case: caseDef.name,
    type: caseDef.type,
    requestClass: schema.rootElement,
    submissionNumber,
    transactionIds,
    timestamps: { submittedAt, terminalAt: nowIso() },
    observedStatus: terminal.status,
    errors: terminal.errors || [],
    rejections: terminal.rejections || [],
    exchanges,
  };
}

async function runCase(caseDef, context) {
  const entry =
    caseDef.type === "confirmationStatement" ? await runConfirmationStatementCase(caseDef, context) : await runSyncCase(caseDef, context);

  return {
    ...entry,
    expectedStatus: caseDef.expectedOutcome?.status,
    expectedPinned: Boolean(caseDef.expectedOutcome?.pinned),
    note: caseDef.expectedOutcome?.note,
    pass: evaluateOutcome(caseDef.expectedOutcome, entry.observedStatus),
  };
}

function buildSummaryMarkdown(entries) {
  const rows = entries.map(
    (entry) =>
      `| ${entry.case} | ${entry.observedStatus} | ${entry.expectedStatus}${entry.expectedPinned ? "" : " (unpinned)"} | ${entry.pass ? "pass" : "FAIL"} | ${entry.submissionNumber || ""} |`,
  );
  return ["| Case | Observed | Expected | Result | Submission number |", "|---|---|---|---|---|", ...rows].join("\n");
}

function parseArgs(argv) {
  const args = { casesPath: undefined, outDir: undefined, caseName: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--cases") {
      args.casesPath = argv[i + 1];
      i += 1;
    } else if (arg === "--out-dir") {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (arg === "--case") {
      args.caseName = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

/**
 * Run every case in a fixture (or just the one named by --case), write the evidence log and a
 * markdown summary to --out-dir, and return whether every case matched its expected outcome.
 * @param {object[]} cases
 * @param {string} outDir
 * @param {{caseName?: string, sleepFn?: Function}} [options] - sleepFn overrides the real
 *   between-poll wait; tests use it to prove the announced PollInterval was honoured without a
 *   real-time wait
 * @returns {Promise<{entries: object[], allPass: boolean}>}
 */
export async function runCases(cases, outDir, { caseName, sleepFn } = {}) {
  const selected = caseName ? cases.filter((caseDef) => caseDef.name === caseName) : cases;
  if (caseName && selected.length === 0) {
    throw new Error(`No case named "${caseName}" in the fixture`);
  }

  const { presenterId, presenterCode } = await resolvePresenterCredentials();
  const gatewayTest = process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
  const context = { presenterId, presenterCode, gatewayTest, sleepFn };

  // Cases run one at a time, not concurrently: allocateSubmissionNumber()'s atomic counter and
  // the gateway's own increasing-transaction-id rule (criterion 3) both depend on that ordering,
  // not on the loop's own speed.
  const entries = [];
  for (const caseDef of selected) {
    console.log(`[companies-house-test-service-run] running case "${caseDef.name}"`);
    const entry = await runCase(caseDef, context);
    entries.push(entry);
    console.log(
      `[companies-house-test-service-run] case "${caseDef.name}": observed ${entry.observedStatus}, expected ${entry.expectedStatus}, ${entry.pass ? "pass" : "FAIL"}`,
    );
  }

  writeFileSync(`${outDir}/evidence-log.json`, JSON.stringify(entries, null, 2));
  writeFileSync(`${outDir}/summary.md`, buildSummaryMarkdown(entries));

  return { entries, allPass: entries.every((entry) => entry.pass) };
}

async function main() {
  const { casesPath, outDir, caseName } = parseArgs(process.argv.slice(2));
  if (!casesPath || !outDir) {
    console.error("Usage: node scripts/companies-house-test-service-run.js --cases <fixture.json> --out-dir <dir> [--case <name>]");
    process.exitCode = 1;
    return;
  }

  assertOutsideRepository(outDir, resolveRepoRoot());
  mkdirSync(outDir, { recursive: true });

  const cases = JSON.parse(readFileSync(casesPath, "utf8"));
  const { allPass } = await runCases(cases, outDir, { caseName });

  if (!allPass) {
    console.error("[companies-house-test-service-run] one or more cases missed their expected outcome");
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[companies-house-test-service-run] failed: ${error.message}`);
    process.exitCode = 1;
  });
}
