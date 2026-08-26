// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/emfMetrics.js

/**
 * Emit a CloudWatch metric as an embedded-metric-format log line.
 *
 * CloudWatch Logs extracts the metric from the log line, so nothing here calls
 * the CloudWatch API and nothing here can slow down or fail a request.
 *
 * @param {Object} params
 * @param {string} params.namespace - CloudWatch namespace (e.g. "Submit/Business")
 * @param {string} params.metricName - Metric name (e.g. "VatSubmissionSuccess")
 * @param {Object} [params.dimensions] - Dimension name/value pairs
 * @param {number} [params.value] - Metric value, defaults to 1
 * @param {string} [params.unit] - CloudWatch unit, defaults to "Count"
 */
export function emitMetric({ namespace, metricName, dimensions = {}, value = 1, unit = "Count" }) {
  try {
    const dimensionNames = Object.keys(dimensions).filter((name) => dimensions[name] !== undefined && dimensions[name] !== null);
    const dimensionValues = {};
    for (const name of dimensionNames) {
      dimensionValues[name] = String(dimensions[name]);
    }

    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: namespace,
              Dimensions: dimensionNames.length > 0 ? [dimensionNames] : [[]],
              Metrics: [{ Name: metricName, Unit: unit }],
            },
          ],
        },
        ...dimensionValues,
        [metricName]: value,
      }),
    );
  } catch {
    // EMF emission is best-effort
  }
}
