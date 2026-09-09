// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/alarmWindow.js
//
// Turns a CloudWatch alarm state change event into the absolute time window
// its evidence links should query. Pure: no AWS calls, no I/O.
//
// CloudWatch evaluates a period a minute or two after it closes, and a
// Lambda's own log lines reach CloudWatch Logs seconds to a minute after
// they are written, so every window carries a margin either side. The
// margin is a tenth of the alarm's own window, floored at five minutes and
// capped at one hour: the floor covers the two lags above; the cap stops a
// long-period alarm (the slowest configured today evaluates over 26 hours)
// opening a margin so wide it buries the signal in a day of unrelated log
// lines.

const CLOUDWATCH_ZERO_OFFSET = /\+0000$/;

/**
 * CloudWatch renders its own UTC timestamps as "+0000" rather than "Z", a
 * form `Date.parse` rejects in some runtimes because it has no colon
 * separating hours and minutes. Normalising the zero offset to "Z" first
 * makes every timestamp this module receives parse the same way.
 */
function parseTimestampMs(value) {
  return new Date(value.replace(CLOUDWATCH_ZERO_OFFSET, "Z")).getTime();
}

export function resolveAlarmWindow({ reasonData, timestamp, periodSeconds }) {
  const fallbackPeriodSeconds =
    typeof periodSeconds === "number" && periodSeconds > 0 ? periodSeconds : 300;
  const resolvedPeriodSeconds =
    reasonData && typeof reasonData.period === "number" && reasonData.period > 0
      ? reasonData.period
      : fallbackPeriodSeconds;

  const datapoints = Array.isArray(reasonData?.evaluatedDatapoints) ? reasonData.evaluatedDatapoints : [];
  const evaluatedPeriods = datapoints.length > 0 ? datapoints.length : 1;

  const windowSeconds = resolvedPeriodSeconds * evaluatedPeriods;
  const marginSeconds = Math.min(3600, Math.max(300, Math.round(0.1 * windowSeconds)));

  const timestampMs = parseTimestampMs(timestamp);

  const datapointTimestampsMs = datapoints
    .map((datapoint) => datapoint && datapoint.timestamp)
    .filter((value) => typeof value === "string" && value.length > 0)
    .map(parseTimestampMs);

  const startMs =
    datapointTimestampsMs.length > 0
      ? Math.min(...datapointTimestampsMs) - marginSeconds * 1000
      : timestampMs - windowSeconds * 1000 - marginSeconds * 1000;

  const queryDateMs =
    reasonData && typeof reasonData.queryDate === "string" && reasonData.queryDate.length > 0
      ? parseTimestampMs(reasonData.queryDate)
      : timestampMs;
  const endMs = queryDateMs + marginSeconds * 1000;

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    periodSeconds: resolvedPeriodSeconds,
    evaluatedPeriods,
    marginSeconds,
  };
}
