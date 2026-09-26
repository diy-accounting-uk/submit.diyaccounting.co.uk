// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/security/wafScanDetect.js
//
// Subscribed to the WAF access log group's blocks-only CloudWatch Logs subscription filter
// (EdgeStack.java). Each invocation carries one gzipped, base64-encoded batch of log records;
// this handler turns every record blocked by the SensitivePathScan rule into ActivityEvents, one
// per source IP in the batch summarising every distinct path it hit, so a sensitive-path scan
// (/.env, /wp-admin, and the rest of the regex pattern set) reaches the ops Telegram chat as one
// message per source per batch instead of one per path.
//
// This groups only within one invocation's own batch of log records: the Lambda holds no state
// between invocations, so a scan whose requests land in separate CloudWatch Logs deliveries (the
// subscription filter can split a fast burst across a few deliveries a few seconds apart) still
// produces one message per delivery. Collapsing those into one message per real-world burst needs
// a store that survives between invocations (e.g. a DynamoDB item per clientIp with a short TTL,
// incremented per delivery) plus a decision on when a burst has ended enough to flush a summary;
// neither exists here today.

import { gunzipSync } from "zlib";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/security/wafScanDetect.js" });

const SENSITIVE_PATH_RULE_ID = "SensitivePathScan";

/**
 * Decode one CloudWatch Logs subscription filter payload into its log events.
 *
 * @param {string} base64GzipData - `event.awslogs.data`
 * @returns {{logEvents: {id: string, timestamp: number, message: string}[]}}
 */
export function decodeSubscriptionPayload(base64GzipData) {
  const json = gunzipSync(Buffer.from(base64GzipData, "base64")).toString("utf8");
  return JSON.parse(json);
}

/**
 * Parse one WAF log record and keep only the fields this detector needs. Returns null for a
 * record this rule did not terminate, so a caller can filter with a plain truthiness check.
 *
 * @param {string} message - one `logEvents[].message`, a JSON-encoded WAF log record
 * @param {number} [timestamp] - the enclosing `logEvents[].timestamp` (epoch ms), carried through
 *   so a caller can size the batch's own time span; absent from the WAF record itself
 * @returns {{terminatingRuleId: string, method: string, uri: string, clientIp: string, country: string, requestId: string, timestamp: number|null}|null}
 */
export function parseWafLogRecord(message, timestamp = null) {
  let record;
  try {
    record = JSON.parse(message);
  } catch (err) {
    logger.warn({ message: "Could not parse WAF log record", error: err.message });
    return null;
  }

  if (record.terminatingRuleId !== SENSITIVE_PATH_RULE_ID) return null;

  const httpRequest = record.httpRequest ?? {};
  return {
    terminatingRuleId: record.terminatingRuleId,
    method: httpRequest.httpMethod ?? "UNKNOWN",
    uri: httpRequest.uri ?? "",
    clientIp: httpRequest.clientIp ?? "unknown",
    country: httpRequest.country ?? "??",
    requestId: httpRequest.requestId ?? null,
    timestamp,
  };
}

/**
 * Group parsed records by client IP, so a scanner hitting many paths from one address in one
 * batch produces one summary instead of one message per path. Each group's `uris` de-duplicates
 * repeated hits to the same path; `firstTimestamp`/`lastTimestamp` span every hit seen for that
 * IP (not just the de-duplicated ones), so the summary's duration reflects the whole batch.
 * Order is preserved: the first client IP seen is the first group returned.
 *
 * @param {ReturnType<typeof parseWafLogRecord>[]} records
 * @returns {{clientIp: string, country: string, uris: string[], firstTimestamp: number|null, lastTimestamp: number|null}[]}
 */
export function groupByClientIp(records) {
  const order = [];
  const groups = new Map();

  for (const record of records) {
    let group = groups.get(record.clientIp);
    if (!group) {
      group = { clientIp: record.clientIp, country: record.country, uris: new Set(), firstTimestamp: null, lastTimestamp: null };
      groups.set(record.clientIp, group);
      order.push(record.clientIp);
    }
    group.uris.add(record.uri);
    if (typeof record.timestamp === "number") {
      if (group.firstTimestamp === null || record.timestamp < group.firstTimestamp) group.firstTimestamp = record.timestamp;
      if (group.lastTimestamp === null || record.timestamp > group.lastTimestamp) group.lastTimestamp = record.timestamp;
    }
  }

  return order.map((clientIp) => {
    const group = groups.get(clientIp);
    return {
      clientIp,
      country: group.country,
      uris: Array.from(group.uris),
      firstTimestamp: group.firstTimestamp,
      lastTimestamp: group.lastTimestamp,
    };
  });
}

/**
 * Render a group's batch span as "in Ns", or "" when the batch carried only one timestamp (or
 * none), so a single-hit summary doesn't claim a zero-second duration.
 *
 * @param {{firstTimestamp: number|null, lastTimestamp: number|null}} group
 * @returns {string}
 */
function durationSuffix(group) {
  if (group.firstTimestamp === null || group.lastTimestamp === null) return "";
  const seconds = Math.round((group.lastTimestamp - group.firstTimestamp) / 1000);
  if (seconds <= 0) return "";
  return ` in ${seconds}s`;
}

/**
 * Decode the subscription filter payload, keep only SensitivePathScan blocks, group by client
 * IP, and publish one ActivityEvent per source address summarising every distinct path it hit in
 * this batch. See the module comment for why this groups within one batch, not one real-world
 * burst.
 *
 * @param {{awslogs: {data: string}}} event
 * @returns {Promise<{published: number}>}
 */
export async function handler(event) {
  const deployment = process.env.DEPLOYMENT_NAME ?? process.env.ENVIRONMENT_NAME ?? "unknown";

  const payload = decodeSubscriptionPayload(event.awslogs.data);
  const parsed = (payload.logEvents ?? [])
    .map((logEvent) => parseWafLogRecord(logEvent.message, logEvent.timestamp))
    .filter((record) => record !== null);
  const groups = groupByClientIp(parsed);

  for (const group of groups) {
    const pathWord = group.uris.length === 1 ? "path" : "paths";
    await publishActivityEvent({
      event: "scan-detected",
      flow: "operational",
      summary: `Scan blocked: ${group.uris.length} sensitive ${pathWord} from ${group.clientIp} (${group.country}) on ${deployment}${durationSuffix(group)}`,
      detail: {
        rule: SENSITIVE_PATH_RULE_ID,
        clientIp: group.clientIp,
        country: group.country,
        deployment,
        uriCount: group.uris.length,
        uris: group.uris,
      },
    });
  }

  logger.info({ message: "WAF scan-detect run complete", recordsSeen: parsed.length, published: groups.length });

  return { published: groups.length };
}
