// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/scanRate404Detect.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  ListObjectsV2Command: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  PutParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockPublishActivityEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
}));

const mockRunAthenaQuery = vi.fn();
vi.mock("@app/functions/analytics/analyticsMetricsPublish.js", () => ({
  runAthenaQuery: (...args) => mockRunAthenaQuery(...args),
}));

import {
  handler,
  discoverDistributionIds,
  readHighWaterMark,
  datesInWindow,
  buildQuery,
  highWaterMarkParameterName,
} from "@app/functions/security/scanRate404Detect.js";

function commonPrefixesResponse(ids, { truncated = false } = {}) {
  return {
    CommonPrefixes: ids.map((id) => ({ Prefix: `raw/cloudfront/distributionid=${id}/` })),
    IsTruncated: truncated,
  };
}

describe("functions/security/scanRate404Detect", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    mockSsmSend.mockReset();
    mockPublishActivityEvent.mockClear();
    mockRunAthenaQuery.mockReset();
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "ci-env-analytics-lake-111111111111";
    process.env.ATHENA_WORK_GROUP_NAME = "ci-env-analytics";
    process.env.GLUE_DATABASE_NAME = "ci_env_analytics";
    delete process.env.SCAN_DETECTION_404_PER_MINUTE;
  });

  describe("highWaterMarkParameterName", () => {
    test("is scoped to the environment", () => {
      expect(highWaterMarkParameterName()).toBe("/ci/submit/scan-detection/last-evaluated-minute");
    });
  });

  describe("discoverDistributionIds", () => {
    test("parses distribution ids out of distributionid= common prefixes", async () => {
      mockS3Send.mockResolvedValueOnce(commonPrefixesResponse(["EDFXAMPLE1", "EDFXAMPLE2"]));

      const ids = await discoverDistributionIds({ bucket: "lake-bucket" });

      expect(ids).toEqual(["EDFXAMPLE1", "EDFXAMPLE2"]);
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    test("pages through a truncated listing", async () => {
      mockS3Send
        .mockResolvedValueOnce({ ...commonPrefixesResponse(["EDFXAMPLE1"], { truncated: true }), NextContinuationToken: "tok" })
        .mockResolvedValueOnce(commonPrefixesResponse(["EDFXAMPLE2"]));

      const ids = await discoverDistributionIds({ bucket: "lake-bucket" });

      expect(ids).toEqual(["EDFXAMPLE1", "EDFXAMPLE2"]);
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });

  describe("readHighWaterMark", () => {
    test("returns the stored value", async () => {
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } });
      expect(await readHighWaterMark()).toBe("2026-08-31T10:00");
    });

    test("returns null when the parameter does not exist yet", async () => {
      const err = new Error("not found");
      err.name = "ParameterNotFound";
      mockSsmSend.mockRejectedValueOnce(err);
      expect(await readHighWaterMark()).toBeNull();
    });

    test("rethrows any other SSM error", async () => {
      mockSsmSend.mockRejectedValueOnce(new Error("access denied"));
      await expect(readHighWaterMark()).rejects.toThrow("access denied");
    });
  });

  describe("datesInWindow", () => {
    test("returns one date for a window inside one day", () => {
      const dates = datesInWindow(new Date("2026-08-31T10:00:00Z"), new Date("2026-08-31T10:05:00Z"));
      expect(dates).toEqual(["2026-08-31"]);
    });

    test("returns two dates for a window crossing UTC midnight", () => {
      const dates = datesInWindow(new Date("2026-08-31T23:57:00Z"), new Date("2026-09-01T00:02:00Z"));
      expect(dates).toEqual(["2026-08-31", "2026-09-01"]);
    });
  });

  describe("buildQuery", () => {
    test("keeps date and time double-quoted and excludes the probe user agent", () => {
      const sql = buildQuery({
        distributionIds: ["EDFXAMPLE1"],
        dateStr: "2026-08-31",
        startExclusive: new Date("2026-08-31T10:00:00Z"),
        endInclusive: new Date("2026-08-31T10:05:00Z"),
        threshold: 20,
      });

      expect(sql).toContain('"date"');
      expect(sql).toContain('"time"');
      expect(sql).toContain("NOT LIKE '%DIYAccountingProbe%'");
      expect(sql).toContain("year  = 2026 AND month = 8 AND day = 31");
      expect(sql).toContain("HAVING   count(*) > 20");
    });
  });

  describe("handler", () => {
    test("a first run with no stored parameter starts ten minutes back", async () => {
      mockS3Send.mockResolvedValueOnce(commonPrefixesResponse(["EDFXAMPLE1"]));
      mockSsmSend.mockResolvedValueOnce({ Parameter: undefined }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValueOnce([]);

      await handler({ now: "2026-08-31T10:20:00Z" });

      const sql = mockRunAthenaQuery.mock.calls[0][0].sql;
      // now - 5min lag = 10:15; minus 10min lookback = 10:05
      expect(sql).toContain("10:05'");
      expect(sql).toContain("10:15'");
    });

    test("the query window starts at the stored high-water mark and ends five minutes back", async () => {
      mockS3Send.mockResolvedValueOnce(commonPrefixesResponse(["EDFXAMPLE1"]));
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValueOnce([]);

      await handler({ now: "2026-08-31T10:20:00Z" });

      const sql = mockRunAthenaQuery.mock.calls[0][0].sql;
      expect(sql).toContain("10:00'");
      expect(sql).toContain("10:15'");
    });

    test("a window spanning midnight produces one query per date", async () => {
      mockS3Send.mockResolvedValueOnce(commonPrefixesResponse(["EDFXAMPLE1"]));
      mockSsmSend
        .mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T23:50" } })
        .mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValue([]);

      await handler({ now: "2026-09-01T00:10:00Z" });

      expect(mockRunAthenaQuery).toHaveBeenCalledTimes(2);
    });

    test("each returned row produces one ActivityEvent carrying the IP, the count and the distribution id", async () => {
      mockS3Send.mockResolvedValueOnce(commonPrefixesResponse(["EDFXAMPLE1"]));
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValueOnce([
        { distribution_id: "EDFXAMPLE1", c_ip: "203.0.113.9", minute: "2026-08-31T10:03", hits: "27" },
      ]);

      await handler({ now: "2026-08-31T10:20:00Z" });

      expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
      const call = mockPublishActivityEvent.mock.calls[0][0];
      expect(call.detail.clientIp).toBe("203.0.113.9");
      expect(call.detail.hits).toBe(27);
      expect(call.detail.distributionId).toBe("EDFXAMPLE1");
      expect(call.flow).toBe("operational");
    });

    test("the high-water mark advances only after publishing succeeds", async () => {
      mockS3Send.mockResolvedValueOnce(commonPrefixesResponse(["EDFXAMPLE1"]));
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValueOnce([
        { distribution_id: "EDFXAMPLE1", c_ip: "203.0.113.9", minute: "2026-08-31T10:03", hits: "27" },
      ]);

      await handler({ now: "2026-08-31T10:20:00Z" });

      expect(mockSsmSend).toHaveBeenCalledTimes(2);
      const putCall = mockSsmSend.mock.calls[1][0];
      expect(putCall.input.Value).toBe("2026-08-31T10:15");
    });

    test("a publish failure leaves the stored mark unchanged", async () => {
      mockS3Send.mockResolvedValueOnce(commonPrefixesResponse(["EDFXAMPLE1"]));
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } });
      mockRunAthenaQuery.mockResolvedValueOnce([
        { distribution_id: "EDFXAMPLE1", c_ip: "203.0.113.9", minute: "2026-08-31T10:03", hits: "27" },
      ]);
      mockPublishActivityEvent.mockRejectedValueOnce(new Error("EventBridge unavailable"));

      await expect(handler({ now: "2026-08-31T10:20:00Z" })).rejects.toThrow("EventBridge unavailable");

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
    });
  });
});
