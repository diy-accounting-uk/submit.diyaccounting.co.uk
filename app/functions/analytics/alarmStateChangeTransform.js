// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/alarmStateChangeTransform.js
//
// Firehose transformation for the alarm-state-change delivery stream: AlarmToLakeRule in
// AnalyticsStack sends every CloudWatch Alarm State Change event on the default bus (matching
// the {env}- alarm name prefix) here.
//
// EventBridge hands Firehose the whole envelope with no trailing newline and ISO-8601
// timestamps; Athena's JSON SerDe needs one JSON object per line and the Parquet destination's
// OpenX deserializer needs a space-separated timestamp, so this reuses activityEventTransform's
// toParquetTimestamp. The field extraction reuses resolveAlarmDetail from alarmToGithubIssue.js
// and the family/deployment-slug parsing from alarmName.js, so the issue chain and the lake read
// one definition of what an alarm name means.

import { createLogger } from "../../lib/logger.js";
import { resolveAlarmDetail } from "../ops/alarmToGithubIssue.js";
import { alarmFamilyKey, alarmDeploymentSlug } from "../../lib/alarmName.js";
import { toParquetTimestamp } from "./activityEventTransform.js";

const logger = createLogger({ source: "app/functions/analytics/alarmStateChangeTransform.js" });

/**
 * Flatten one CloudWatch Alarm State Change envelope into the row shape the Glue
 * alarm_state_changes table declares.
 *
 * @param {Object} envelope - Decoded EventBridge event
 * @returns {Object} one flat row
 */
export function flattenEnvelope(envelope) {
  const alarm = resolveAlarmDetail(envelope);
  return {
    event_id: envelope.id ?? null,
    event_ts: toParquetTimestamp(alarm.timestamp),
    ingest_ts: toParquetTimestamp(envelope.time),
    alarm_name: alarm.alarmName,
    alarm_arn: alarm.alarmArn ?? null,
    family: alarmFamilyKey(alarm.alarmName),
    deployment_slug: alarmDeploymentSlug(alarm.alarmName),
    state: alarm.state,
    previous_state: alarm.previousState,
    reason: alarm.reason,
    region: alarm.region,
    namespace: alarm.namespace,
    metric_name: alarm.metricName,
    period_seconds: alarm.periodSeconds,
    threshold: alarm.reasonData?.threshold ?? null,
    env: process.env.ENVIRONMENT_NAME ?? null,
    detail_json: JSON.stringify(envelope.detail ?? {}),
  };
}

/**
 * Firehose transformation handler.
 *
 * A record that will not parse comes back as ProcessingFailed so Firehose writes it to the
 * error prefix. Dropping it would lose the alarm transition with no trace anywhere.
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
        message: "Alarm state change record could not be transformed",
        recordId: record?.recordId,
        error: err.message,
      });
      return { recordId: record?.recordId, result: "ProcessingFailed" };
    }
  });

  const failed = records.filter((r) => r.result === "ProcessingFailed").length;
  logger.info({ message: "Transformed alarm state change records", count: records.length, failed });

  return { records };
}
