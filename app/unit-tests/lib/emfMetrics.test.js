// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/lib/emfMetrics.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import { emitMetric } from "@app/lib/emfMetrics.js";

describe("lib/emfMetrics", () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function emittedPayload() {
    return JSON.parse(logSpy.mock.calls[0][0]);
  }

  test("emits an EMF line CloudWatch can extract the metric from", () => {
    emitMetric({ namespace: "Submit/Business", metricName: "VatSubmissionSuccess", dimensions: { Actor: "customer" } });

    const payload = emittedPayload();
    expect(payload._aws.CloudWatchMetrics).toEqual([
      {
        Namespace: "Submit/Business",
        Dimensions: [["Actor"]],
        Metrics: [{ Name: "VatSubmissionSuccess", Unit: "Count" }],
      },
    ]);
    expect(payload.Actor).toBe("customer");
    expect(payload.VatSubmissionSuccess).toBe(1);
    expect(typeof payload._aws.Timestamp).toBe("number");
  });

  test("uses the supplied value and unit", () => {
    emitMetric({ namespace: "Submit/Business", metricName: "VatSubmissionFailure", value: 3, unit: "None" });

    const payload = emittedPayload();
    expect(payload.VatSubmissionFailure).toBe(3);
    expect(payload._aws.CloudWatchMetrics[0].Metrics[0].Unit).toBe("None");
  });

  test("drops dimensions with no value", () => {
    emitMetric({
      namespace: "Submit/Business",
      metricName: "VatSubmissionFailure",
      dimensions: { Actor: "customer", Reason: undefined },
    });

    const payload = emittedPayload();
    expect(payload._aws.CloudWatchMetrics[0].Dimensions).toEqual([["Actor"]]);
    expect(payload).not.toHaveProperty("Reason");
  });

  test("emits a dimensionless metric when no dimensions are given", () => {
    emitMetric({ namespace: "Submit/Business", metricName: "VatSubmissionSuccess" });

    expect(emittedPayload()._aws.CloudWatchMetrics[0].Dimensions).toEqual([[]]);
  });

  test("never throws when the value cannot be serialised", () => {
    const circular = {};
    circular.self = circular;

    expect(() => emitMetric({ namespace: "Submit/Business", metricName: "VatSubmissionSuccess", value: circular })).not.toThrow();
  });
});
