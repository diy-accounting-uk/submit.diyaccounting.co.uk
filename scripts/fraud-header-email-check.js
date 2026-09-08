#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/fraud-header-email-check.js
//
// Reads HMRC's monthly fraud prevention header report out of the gyb mail mirror at the
// workspace root, parses it with app/lib/fraudPreventionHeaderReport.js, and alerts the
// operational Telegram chat through the shared activity bus when the month needs a look:
// advisories, errors, zero traffic, or the report never turned up.
//
// Usage:
//   node scripts/fraud-header-email-check.js [--dry-run] [--mail-dir PATH] [--now ISO-DATE]
//
//   --dry-run       Print the decision and the would-be activity event; write no JSON record
//                    and publish no activity event.
//   --mail-dir PATH  Override the gyb mirror directory (defaults to ../mail next to this repo).
//   --now ISO-DATE   Treat this as the current time instead of the real clock (for replaying a
//                    past month).
//
// The check runs monthly, reporting on the previous calendar month. A launchd agent
// (scripts/co.uk.diyaccounting.submit.fraud-header-check.plist) runs it on the 5th and the
// 12th, so a first run before the 10th that finds nothing yet is normal and raises no alert;
// a second run past the 10th that still finds nothing is itself the alert.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFraudPreventionHeaderReport } from "../app/lib/fraudPreventionHeaderReport.js";
import { publishActivityEvent } from "../app/lib/activityAlert.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

const FRAUD_PREVENTION_FROM = "noreply@tax.service.gov.uk";
const FRAUD_PREVENTION_SUBJECT = "fraud prevention headers for diy accounting submit";
const REPORT_DUE_DAY = 10;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Default location of the gyb mail mirror: the workspace root's `mail/` directory, sitting next
 * to this repository. MAIL_MIRROR_DIR overrides it for a different checkout layout.
 *
 * @returns {string}
 */
export function resolveMailMirrorDir() {
  if (process.env.MAIL_MIRROR_DIR) return process.env.MAIL_MIRROR_DIR;
  return path.join(projectRoot, "..", "mail");
}

/**
 * Parse one tab-separated row of mail/INDEX.tsv (date, mailbox, from, to, subject, attachments,
 * path). Returns null for the header row or a blank line.
 *
 * @param {string} line
 * @returns {{date: string, mailbox: string, from: string, to: string, subject: string, attachments: string, path: string}|null}
 */
export function parseIndexLine(line) {
  if (!line || line.startsWith("date\t")) return null;
  const fields = line.split("\t");
  if (fields.length < 7) return null;
  const [date, mailbox, from, to, subject, attachments, filePath] = fields;
  return { date, mailbox, from, to, subject, attachments, path: filePath };
}

/**
 * Read and parse every row of a mail/INDEX.tsv file.
 *
 * @param {string} indexPath
 * @returns {Array<ReturnType<typeof parseIndexLine>>}
 */
export function readIndexRows(indexPath) {
  const text = readFileSync(indexPath, "utf8");
  return text
    .split(/\r?\n/)
    .map(parseIndexLine)
    .filter((row) => row !== null);
}

/**
 * True when an INDEX.tsv row is one of HMRC's fraud prevention header report emails for this
 * application (any of the three subject variants: correct, advisories, or zero traffic).
 *
 * @param {ReturnType<typeof parseIndexLine>} row
 * @returns {boolean}
 */
export function isFraudPreventionHeaderRow(row) {
  return row.from.toLowerCase().includes(FRAUD_PREVENTION_FROM) && row.subject.toLowerCase().includes(FRAUD_PREVENTION_SUBJECT);
}

/**
 * Pick the newest row from a list of INDEX.tsv rows, by the date column. Returns null for an
 * empty list.
 *
 * @param {Array<ReturnType<typeof parseIndexLine>>} rows
 * @returns {ReturnType<typeof parseIndexLine>|null}
 */
export function findLatestRow(rows) {
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) => (new Date(row.date) > new Date(latest.date) ? row : latest));
}

/**
 * Decode a quoted-printable body into text. Soft line breaks (a trailing "=" before the line
 * ending) are removed first; each "=XX" hex escape then decodes as one byte, so the result is
 * reassembled as UTF-8 rather than character-by-character, which is what a Gmail-exported
 * quoted-printable body needs for its non-ASCII punctuation.
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeQuotedPrintable(text) {
  const stripped = text.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(stripped.slice(i + 1, i + 3))) {
      bytes.push(parseInt(stripped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(stripped.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/**
 * Unfold RFC 2822 header continuation lines (a line starting with whitespace continues the
 * previous header) and split the result into a lower-cased header name to value map.
 *
 * @param {string} headerBlock
 * @returns {Record<string, string>}
 */
function parseMimeHeaders(headerBlock) {
  const lines = headerBlock.split(/\r?\n/);
  const unfolded = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += " " + line.trim();
    } else if (line.trim() !== "") {
      unfolded.push(line);
    }
  }
  const headers = {};
  for (const line of unfolded) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    headers[line.slice(0, colonIndex).trim().toLowerCase()] = line.slice(colonIndex + 1).trim();
  }
  return headers;
}

/**
 * Split a MIME message (or one MIME part) into its headers and body, on the first blank line.
 * A part with no blank line at all (malformed, or a boundary's closing "--" tail) comes back
 * with an empty body.
 *
 * @param {string} raw
 * @returns {{headers: Record<string, string>, body: string}}
 */
function splitMimeMessage(raw) {
  const crlfIndex = raw.indexOf("\r\n\r\n");
  const lfIndex = raw.indexOf("\n\n");
  let boundaryIndex = -1;
  let separatorLength = 0;
  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex <= lfIndex)) {
    boundaryIndex = crlfIndex;
    separatorLength = 4;
  } else if (lfIndex !== -1) {
    boundaryIndex = lfIndex;
    separatorLength = 2;
  }
  if (boundaryIndex === -1) return { headers: parseMimeHeaders(raw), body: "" };
  return {
    headers: parseMimeHeaders(raw.slice(0, boundaryIndex)),
    body: raw.slice(boundaryIndex + separatorLength),
  };
}

function extractBoundary(contentType) {
  const match = contentType.match(/boundary="?([^";]+)"?/i);
  return match ? match[1] : null;
}

/**
 * Walk a MIME message (or nested multipart part) and return the decoded text of the first
 * text/plain part found, skipping any text/html alternative. Returns null when no text/plain
 * part exists anywhere in the message.
 *
 * @param {string} raw
 * @returns {string|null}
 */
export function extractTextPlainBody(raw) {
  const { headers, body } = splitMimeMessage(raw);
  const contentType = headers["content-type"] || "text/plain";

  if (/^multipart\//i.test(contentType)) {
    const boundary = extractBoundary(contentType);
    if (!boundary) return null;
    const delimiter = `--${boundary}`;
    const parts = body.split(delimiter).slice(1, -1);
    for (const rawPart of parts) {
      const part = rawPart.replace(/^\r?\n/, "");
      const found = extractTextPlainBody(part);
      if (found) return found;
    }
    return null;
  }

  if (/^text\/plain/i.test(contentType)) {
    const encoding = (headers["content-transfer-encoding"] || "7bit").toLowerCase();
    if (encoding === "quoted-printable") return decodeQuotedPrintable(body);
    if (encoding === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    return body;
  }

  return null;
}

/**
 * The report month this check expects to find: the calendar month before `now`, in both the
 * "August 2026" form the parser returns and a "2026-08" sort key for the result file name.
 *
 * @param {Date} now
 * @returns {{label: string, key: string}}
 */
export function computeExpectedReportMonth(now) {
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  firstOfThisMonth.setUTCMonth(firstOfThisMonth.getUTCMonth() - 1);
  const year = firstOfThisMonth.getUTCFullYear();
  const month = firstOfThisMonth.getUTCMonth();
  return {
    label: `${MONTH_NAMES[month]} ${year}`,
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
  };
}

/**
 * Classify an already-parsed fraud prevention header report into one of the four outcomes the
 * email itself can carry.
 *
 * @param {ReturnType<typeof parseFraudPreventionHeaderReport>} parsed
 * @returns {"errors"|"advisories"|"zero-traffic"|"correct"}
 */
export function classifyParsedReport(parsed) {
  if (parsed.errors.length > 0) return "errors";
  if (parsed.advisories.length > 0) return "advisories";
  if (parsed.trafficCount === 0) return "zero-traffic";
  return "correct";
}

/**
 * Decide the month's status. `latestEmail` is `{row, parsed}` for the newest fraud prevention
 * header email whose parsed month matches the expected month, or null when no such email
 * exists yet (either none has arrived, or the newest one found is still reporting an earlier
 * month). A missing report is only an alert once the month is past the 10th; before that it is
 * simply not due yet.
 *
 * @param {{latestEmail: {row: object, parsed: object}|null, expectedMonth: {label: string, key: string}, now: Date}} params
 * @returns {{status: string, needsAction: boolean, month: string, trafficCount: number|null, advisories: string[], errors: string[], emailDate: string|null, subject: string|null}}
 */
export function resolveDecision({ latestEmail, expectedMonth, now }) {
  if (!latestEmail) {
    const isOverdue = now.getUTCDate() > REPORT_DUE_DAY;
    return {
      status: isOverdue ? "missing" : "pending",
      needsAction: isOverdue,
      month: expectedMonth.label,
      trafficCount: null,
      advisories: [],
      errors: [],
      emailDate: null,
      subject: null,
    };
  }

  const { row, parsed } = latestEmail;
  return {
    status: classifyParsedReport(parsed),
    needsAction: parsed.needsAction,
    month: parsed.month,
    trafficCount: parsed.trafficCount,
    advisories: parsed.advisories,
    errors: parsed.errors,
    emailDate: row.date,
    subject: row.subject,
  };
}

/**
 * Run the full check against a mail mirror: find the newest fraud prevention header email,
 * parse it if its month matches what's expected, and decide the outcome.
 *
 * @param {{mailDir: string, now: Date}} params
 * @returns {{decision: ReturnType<typeof resolveDecision>, expectedMonth: {label: string, key: string}}}
 */
export function checkFraudPreventionHeaders({ mailDir, now }) {
  const expectedMonth = computeExpectedReportMonth(now);
  const indexPath = path.join(mailDir, "INDEX.tsv");

  const rows = existsSync(indexPath) ? readIndexRows(indexPath).filter(isFraudPreventionHeaderRow) : [];
  const newestRow = findLatestRow(rows);

  let latestEmail = null;
  if (newestRow) {
    const emlPath = path.join(mailDir, newestRow.path);
    const raw = readFileSync(emlPath, "utf8");
    const text = extractTextPlainBody(raw);
    if (!text) {
      throw new Error(`fraud-header-email-check: no text/plain body found in ${emlPath}`);
    }
    const parsed = parseFraudPreventionHeaderReport(text);
    if (parsed.month === expectedMonth.label) {
      latestEmail = { row: newestRow, parsed };
    }
  }

  return { decision: resolveDecision({ latestEmail, expectedMonth, now }), expectedMonth };
}

/**
 * Build the lines an operator would read to see why the month needs attention: the parser's own
 * advisory/error sentences, or a plain statement for zero traffic or a missing report.
 *
 * @param {ReturnType<typeof resolveDecision>} decision
 * @returns {string[]}
 */
export function buildAlertLines(decision) {
  if (decision.status === "missing") {
    return [`No fraud prevention header email has arrived for ${decision.month} yet.`];
  }
  if (decision.status === "zero-traffic") {
    return [`DIY Accounting Submit sent no requests in ${decision.month}.`];
  }
  return [...decision.errors, ...decision.advisories];
}

/**
 * Build the publishActivityEvent payload for a month that needs a look.
 *
 * @param {ReturnType<typeof resolveDecision>} decision
 * @returns {{event: string, flow: string, summary: string, detail: object}}
 */
export function buildAlertPayload(decision) {
  const lines = buildAlertLines(decision);
  return {
    event: "fraud-prevention-header-report",
    flow: "operational",
    summary: `Fraud prevention headers for ${decision.month}: ${decision.status}`,
    detail: {
      month: decision.month,
      status: decision.status,
      trafficCount: decision.trafficCount,
      advisories: decision.advisories,
      errors: decision.errors,
      lines,
    },
  };
}

/**
 * Build the JSON record written for the compliance panel to read later.
 *
 * @param {{decision: ReturnType<typeof resolveDecision>, expectedMonth: {label: string, key: string}, checkedAt: string}} params
 * @returns {object}
 */
export function buildRecord({ decision, expectedMonth, checkedAt }) {
  return {
    month: decision.month,
    status: decision.status,
    checkedAt,
    emailDate: decision.emailDate,
    subject: decision.subject,
    trafficCount: decision.trafficCount,
    advisories: decision.advisories,
    errors: decision.errors,
    needsAction: decision.needsAction,
  };
}

/**
 * Directory the JSON result record is written into. FRAUD_HEADER_RESULT_DIR overrides it, so a
 * test run never writes into the repository's own data/ directory.
 *
 * @returns {string}
 */
function resolveResultDir() {
  return process.env.FRAUD_HEADER_RESULT_DIR || path.join(projectRoot, "data", "compliance", "fraud-prevention-headers");
}

export function resultPath(expectedMonth) {
  return path.join(resolveResultDir(), `${expectedMonth.key}.json`);
}

export function parseArgs(argv) {
  const opts = { dryRun: false, mailDir: undefined, now: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--mail-dir":
        opts.mailDir = argv[++i];
        break;
      case "--now":
        opts.now = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const mailDir = opts.mailDir || resolveMailMirrorDir();
  const now = opts.now ? new Date(opts.now) : new Date();

  const { decision, expectedMonth } = checkFraudPreventionHeaders({ mailDir, now });

  if (decision.status === "pending") {
    console.log(`fraud-header-email-check: no ${expectedMonth.label} report yet; not due until the ${REPORT_DUE_DAY}th.`);
    return decision;
  }

  const record = buildRecord({ decision, expectedMonth, checkedAt: now.toISOString() });
  const needsAlert = decision.status !== "correct";
  const alertPayload = needsAlert ? buildAlertPayload(decision) : null;

  if (opts.dryRun) {
    console.log(`fraud-header-email-check: ${expectedMonth.label} is ${decision.status}`);
    console.log(JSON.stringify(record, null, 2));
    if (alertPayload) {
      console.log("[dry-run] would publish activity event:");
      console.log(JSON.stringify(alertPayload, null, 2));
    }
    return decision;
  }

  const outPath = resultPath(expectedMonth);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
  console.log(`fraud-header-email-check: wrote ${outPath}`);

  if (alertPayload) {
    await publishActivityEvent(alertPayload);
    console.log(`fraud-header-email-check: published activity event for ${expectedMonth.label} (${decision.status})`);
  }

  return decision;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
