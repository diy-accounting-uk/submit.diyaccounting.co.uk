#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Polls the Companies House XML Gateway for a submission's status and writes the exact HTTP
 * exchange to disk, so a rejection can be handed to the Companies House XML team with the real
 * request and response rather than a summary. Builds the GetSubmissionStatus envelope with
 * companiesHouseXmlGateway.js's own resolvePresenterCredentials and buildStatusRequest, and sends
 * it with the same postToGateway every Lambda uses - this script duplicates neither the envelope
 * nor the presenter authentication value.
 *
 * Writes four files per call, named from a timestamp and the submission number (or company
 * number, when polling every submission for a company):
 *   <label>-request.raw.txt      - request line, headers, body, unmasked
 *   <label>-request.masked.txt   - the same, with credential field values masked
 *   <label>-response.raw.txt     - status line, headers, body, unmasked
 *   <label>-response.masked.txt  - the same, with credential field values masked
 *
 * Masking replaces only a non-empty credential field's value with "***"; an empty value (for
 * example an empty <Value/> the gateway sometimes echoes back) is left visibly empty rather than
 * masked over, so the masked copy still shows that the field came back blank.
 *
 * Usage:
 *   node scripts/companies-house-xmlgw-poll.js <submissionNumber> --out-dir <dir>
 *   node scripts/companies-house-xmlgw-poll.js --out-dir <dir>
 *     (no submission number - polls every submission for
 *      COMPANIES_HOUSE_XMLGW_POLL_COMPANY_NUMBER)
 *
 * --out-dir is required and must resolve outside this repository, so a captured exchange -
 * which carries a hashed presenter credential even when masked - is never a file git could pick
 * up.
 *
 * Environment variables:
 *   COMPANIES_HOUSE_PRESENTER_ID / _ARN      - resolved by resolvePresenterCredentials()
 *   COMPANIES_HOUSE_PRESENTER_CODE / _ARN    - resolved by resolvePresenterCredentials()
 *   COMPANIES_HOUSE_XMLGW_URI                - defaults to the real gateway (getXmlGatewayUri())
 *   COMPANIES_HOUSE_GATEWAY_TEST             - "true" sets GatewayTest in the envelope, the same
 *                                               flag the submit Lambdas set for the test service
 *   COMPANIES_HOUSE_XMLGW_POLL_COMPANY_NUMBER - required when <submissionNumber> is omitted
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolvePresenterCredentials,
  buildStatusRequest,
  postToGateway,
  getXmlGatewayUri,
} from "../app/services/companiesHouseXmlGateway.js";

// Element names whose inner text is a presenter credential: the plaintext presenter id a
// GetSubmissionStatus request body carries, and the hashed sender id every envelope's Header
// carries (request and response alike, the response echoing the request's SenderDetails).
// Matches the fields companiesHouseXmlGateway.js's own redactPresenterCredentials names, minus
// its always-mask-to-"***" behaviour, which hides whether an echoed value was empty.
const CREDENTIAL_ELEMENT_NAMES = ["PresenterID", "SenderID"];

function maskElement(xml, elementName) {
  const pattern = new RegExp(`(<${elementName}>)([^<]*)(</${elementName}>)`, "g");
  return xml.replace(pattern, (match, open, value, close) => (value.length > 0 ? `${open}***${close}` : match));
}

// Authentication/Value is the hashed presenter authentication code, nested inside
// SenderDetails/IDAuthentication/Authentication rather than a top-level element, so it needs its
// own pattern rather than maskElement's flat one.
function maskAuthenticationValue(xml) {
  return xml.replace(/(<Authentication>[\s\S]*?<Value>)([^<]*)(<\/Value>[\s\S]*?<\/Authentication>)/g, (match, open, value, close) =>
    value.length > 0 ? `${open}***${close}` : match,
  );
}

/**
 * Mask the presenter id, sender id and authentication value in a GovTalk envelope (request or
 * response), leaving an empty field's value visibly empty rather than replacing it with "***".
 * @param {string} xml
 * @returns {string}
 */
export function maskCredentials(xml) {
  if (typeof xml !== "string") {
    return xml;
  }
  let masked = xml;
  for (const elementName of CREDENTIAL_ELEMENT_NAMES) {
    masked = maskElement(masked, elementName);
  }
  return maskAuthenticationValue(masked);
}

/**
 * Mask an Authorization header's value, when one is present and non-empty. The XML Gateway
 * carries its credential in the envelope body, not a header, but this keeps the written headers
 * safe to hand over even if a future call adds one.
 * @param {object} headers
 * @returns {object}
 */
export function maskHeaders(headers) {
  const masked = {};
  for (const [key, value] of Object.entries(headers || {})) {
    masked[key] = /^authorization$/i.test(key) && value ? "***" : value;
  }
  return masked;
}

function formatHeaders(headers) {
  return Object.entries(headers || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

/**
 * Render one HTTP message (a request or a response) as request-line-or-status-line, headers,
 * blank line, body - the shape an operator can paste straight into a bug report.
 * @param {string} startLine
 * @param {object} headers
 * @param {string} body
 * @returns {string}
 */
export function formatHttpMessage(startLine, headers, body) {
  const headerBlock = formatHeaders(headers);
  return `${startLine}\n${headerBlock}${headerBlock ? "\n" : ""}\n${body ?? ""}`;
}

/**
 * Refuse an output directory that resolves inside this repository (the main checkout, not a
 * worktree of it - matching scripts/itsa-sandbox-year.js's own resolveDefaultOutDir), so a
 * captured exchange is never a file git could pick up.
 * @param {string} outDir
 * @param {string} repoRoot
 */
export function assertOutsideRepository(outDir, repoRoot) {
  const resolvedOutDir = resolve(outDir);
  const resolvedRepoRoot = resolve(repoRoot);
  const rel = relative(resolvedRepoRoot, resolvedOutDir);
  const isInside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (isInside) {
    throw new Error(`--out-dir must resolve outside the repository (${resolvedRepoRoot}); got ${resolvedOutDir}`);
  }
}

/**
 * The repository root: the git common dir points to .git in the main checkout even when running
 * from a worktree (scripts/itsa-sandbox-year.js's resolveDefaultOutDir relies on the same fact),
 * so its parent is the repository root. Exported so scripts/companies-house-test-service-run.js
 * can reuse this instead of re-deriving it.
 * @returns {string}
 */
export function resolveRepoRoot() {
  const gitCommonDir = execSync("git rev-parse --git-common-dir", { cwd: process.cwd(), encoding: "utf8" }).trim();
  return dirname(resolve(process.cwd(), gitCommonDir));
}

function parseArgs(argv) {
  const args = { submissionNumber: undefined, outDir: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out-dir") {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (!arg.startsWith("--") && args.submissionNumber === undefined) {
      args.submissionNumber = arg;
    }
  }
  return args;
}

function labelFor(submissionNumber, companyNumber) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${submissionNumber || `company-${companyNumber}`}`;
}

function writeRequestFiles(outDir, label, { method, url, headers, body }) {
  const startLine = `${method} ${url} HTTP/1.1`;
  writeFileSync(`${outDir}/${label}-request.raw.txt`, formatHttpMessage(startLine, headers, body));
  writeFileSync(`${outDir}/${label}-request.masked.txt`, formatHttpMessage(startLine, maskHeaders(headers), maskCredentials(body)));
}

function writeResponseFiles(outDir, label, { status, statusText, headers, body }) {
  const startLine = `HTTP/1.1 ${status}${statusText ? ` ${statusText}` : ""}`;
  writeFileSync(`${outDir}/${label}-response.raw.txt`, formatHttpMessage(startLine, headers, body));
  writeFileSync(`${outDir}/${label}-response.masked.txt`, formatHttpMessage(startLine, maskHeaders(headers), maskCredentials(body)));
}

async function main() {
  const { submissionNumber, outDir } = parseArgs(process.argv.slice(2));
  if (!outDir) {
    console.error("Usage: node scripts/companies-house-xmlgw-poll.js [<submissionNumber>] --out-dir <dir>");
    process.exitCode = 1;
    return;
  }

  let companyNumber;
  if (!submissionNumber) {
    companyNumber = process.env.COMPANIES_HOUSE_XMLGW_POLL_COMPANY_NUMBER;
    if (!companyNumber) {
      console.error("No submission number given: set COMPANIES_HOUSE_XMLGW_POLL_COMPANY_NUMBER to poll every submission for a company.");
      process.exitCode = 1;
      return;
    }
  }

  assertOutsideRepository(outDir, resolveRepoRoot());
  mkdirSync(outDir, { recursive: true });

  const { presenterId, presenterCode } = await resolvePresenterCredentials();
  const gatewayTest = process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
  const requestBody = buildStatusRequest({ presenterId, presenterCode, submissionNumber, companyNumber, gatewayTest });
  const url = getXmlGatewayUri();
  const requestHeaders = { "Content-Type": "text/xml" };
  const label = labelFor(submissionNumber, companyNumber);

  writeRequestFiles(outDir, label, { method: "POST", url, headers: requestHeaders, body: requestBody });
  console.log(`[companies-house-xmlgw-poll] wrote ${outDir}/${label}-request.raw.txt and -request.masked.txt`);

  const result = await postToGateway(requestBody, {});

  writeResponseFiles(outDir, label, {
    status: result.status,
    statusText: result.response?.statusText,
    headers: result.headers,
    body: result.data,
  });
  console.log(`[companies-house-xmlgw-poll] wrote ${outDir}/${label}-response.raw.txt and -response.masked.txt`);
  console.log(`[companies-house-xmlgw-poll] response status: ${result.status}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[companies-house-xmlgw-poll] failed: ${error.message}`);
    process.exitCode = 1;
  });
}
