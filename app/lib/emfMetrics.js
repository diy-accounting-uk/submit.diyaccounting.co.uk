// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-83 Emit CloudWatch EMF metrics
// - **Use when:** a Lambda needs to publish a custom CloudWatch metric without a separate PutMetricData API call.
// - **Does:** emfMetrics.js formats and writes structured metrics in Embedded Metric Format. CloudWatch extracts the metrics from the Lambda's own log lines, so emitMetric needs no separate PutMetricData call.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/lib/emfMetrics.js:emitMetric`
// - **Files:** app/lib/emfMetrics.js, app/unit-tests/lib/emfMetrics.test.js
// - **Keywords:** emf, embedded metric format, cloudwatch metrics, putmetricdata, structured logging
// - **Related:** OPS-86
// @end-capability

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
