// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/activityEventTransform.js
//
// Firehose transformation for the activity-event delivery stream.
//
// EventBridge hands Firehose a whole envelope with no trailing newline, and Athena's JSON
// SerDe needs one JSON object per line. Flattening the detail into named columns here keeps
// the SerDe simple and gives the Parquet schema somewhere to grow from.

import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/analytics/activityEventTransform.js" });

/**
 * Reformat an ISO-8601 timestamp as "yyyy-MM-dd HH:mm:ss.SSS".
 *
 * The Parquet destination's OpenX deserializer only recognises a timestamp column in this
 * space-separated form, not ISO-8601 with a trailing "T" and "Z". A record with this field
 * left in ISO-8601 form delivers nothing but an error record once format conversion is on.
 *
 * @param {string|undefined} isoTimestamp
 * @returns {string|null}
 */
export function toParquetTimestamp(isoTimestamp) {
  if (!isoTimestamp) return null;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
  );
}

/**
 * Flatten one EventBridge envelope into the row shape the Glue table declares.
 *
 * @param {Object} envelope - Decoded EventBridge event
 * @returns {Object} one flat row
 */
export function flattenEnvelope(envelope) {
  const detail = envelope.detail ?? {};
  return {
    event_id: envelope.id ?? null,
    event_ts: toParquetTimestamp(detail.timestamp),
    ingest_ts: toParquetTimestamp(envelope.time),
    event: detail.event ?? null,
    site: detail.site ?? null,
    summary: detail.summary ?? null,
    actor: detail.actor ?? null,
    flow: detail.flow ?? null,
    outcome: detail.outcome ?? null,
    failure: detail.failure ?? null,
    request_id: detail.requestId ?? null,
    hashed_sub: detail.hashedSub ?? null,
    bundle_id: detail.bundleId ?? null,
    pass_type_id: detail.passTypeId ?? null,
    subscription_id: detail.subscriptionId ?? null,
    visitor_type: detail.visitorType ?? null,
    country: detail.country ?? null,
    page: detail.page ?? null,
    hmrc_status: detail.hmrcStatus ?? null,
    env: process.env.ENVIRONMENT_NAME ?? null,
    detail_json: JSON.stringify(detail),
  };
}

/**
 * Firehose transformation handler.
 *
 * A record that will not parse comes back as ProcessingFailed so Firehose writes it to the
 * error prefix. Dropping it would lose the event with no trace anywhere.
 *
 * @param {Object} event - {records: [{recordId, data}]}
 * @returns {Promise<Object>} {records: [{recordId, result, data}]}
 */
export async function handler(event) {
  const records = (event?.records ?? []).map((record) => {
    try {
      const decoded = Buffer.from(record.data, "base64").toString("utf8");
      const envelope = JSON.parse(decoded);
      const row = JSON.stringify(flattenEnvelope(envelope)) + "\n";
      return {
        recordId: record.recordId,
        result: "Ok",
        data: Buffer.from(row, "utf8").toString("base64"),
      };
    } catch (err) {
      logger.warn({
        message: "Activity event record could not be transformed",
        recordId: record?.recordId,
        error: err.message,
      });
      return { recordId: record?.recordId, result: "ProcessingFailed" };
    }
  });

  const failed = records.filter((r) => r.result === "ProcessingFailed").length;
  logger.info({ message: "Transformed activity event records", count: records.length, failed });

  return { records };
}
