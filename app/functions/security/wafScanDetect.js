// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/security/wafScanDetect.js
//
// Subscribed to the WAF access log group's blocks-only CloudWatch Logs subscription filter
// (EdgeStack.java). Each invocation carries one gzipped, base64-encoded batch of log records;
// this handler turns every record blocked by the SensitivePathScan rule into one ActivityEvent,
// so a sensitive-path scan (/.env, /wp-admin, and the rest of the regex pattern set) reaches the
// ops Telegram chat within the delay AWS WAF's own log delivery adds.

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
 * @returns {{terminatingRuleId: string, method: string, uri: string, clientIp: string, country: string, requestId: string}|null}
 */
export function parseWafLogRecord(message) {
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
  };
}

/**
 * De-duplicate parsed records by client IP plus URI, so a scanner hitting many paths in one
 * batch produces one event per path, not one per record. Order is preserved: the first record
 * seen for a given (clientIp, uri) pair is the one reported.
 *
 * @param {ReturnType<typeof parseWafLogRecord>[]} records
 * @returns {ReturnType<typeof parseWafLogRecord>[]}
 */
export function dedupeByIpAndUri(records) {
  const seen = new Set();
  const deduped = [];
  for (const record of records) {
    const key = `${record.clientIp}#${record.uri}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }
  return deduped;
}

/**
 * Decode the subscription filter payload, keep only SensitivePathScan blocks, de-duplicate by
 * (clientIp, uri), and publish one ActivityEvent per unique hit.
 *
 * @param {{awslogs: {data: string}}} event
 * @returns {Promise<{published: number}>}
 */
export async function handler(event) {
  const deployment = process.env.DEPLOYMENT_NAME ?? process.env.ENVIRONMENT_NAME ?? "unknown";

  const payload = decodeSubscriptionPayload(event.awslogs.data);
  const parsed = (payload.logEvents ?? [])
    .map((logEvent) => parseWafLogRecord(logEvent.message))
    .filter((record) => record !== null);
  const deduped = dedupeByIpAndUri(parsed);

  for (const record of deduped) {
    await publishActivityEvent({
      event: "scan-detected",
      flow: "operational",
      summary: `Scan blocked: ${record.method} ${record.uri} from ${record.clientIp} (${record.country}) on ${deployment}`,
      detail: {
        rule: record.terminatingRuleId,
        uri: record.uri,
        clientIp: record.clientIp,
        country: record.country,
        deployment,
        requestId: record.requestId,
      },
    });
  }

  logger.info({ message: "WAF scan-detect run complete", recordsSeen: parsed.length, published: deduped.length });

  return { published: deduped.length };
}
