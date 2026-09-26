// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/scanRate404Detect.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
  readHighWaterMark,
  datesInWindow,
  buildQuery,
  highWaterMarkParameterName,
} from "@app/functions/security/scanRate404Detect.js";

/**
 * The Glue table's real column set, read from the same source CloudFrontAccessLogs.java builds
 * the table from, so a future edit that drifts the query away from the table fails here instead
 * of at Athena's COLUMN_NOT_FOUND.
 *
 * @returns {string[]}
 */
function tableColumnsFromJava() {
  const testDir = fileURLToPath(new URL(".", import.meta.url));
  const javaSource = readFileSync(
    `${testDir}/../../../infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CloudFrontAccessLogs.java`,
    "utf8",
  );
  const fieldOrderMatch = /FIELD_ORDER\s*=\s*List\.of\(([\s\S]*?)\);/.exec(javaSource);
  if (!fieldOrderMatch) throw new Error("Could not find FIELD_ORDER in CloudFrontAccessLogs.java");
  return [...fieldOrderMatch[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
}

// Bareword lowercase identifiers in the query template that are not table columns: SQL keywords,
// functions, the table name, and this query's own output aliases.
const NON_COLUMN_IDENTIFIERS = new Set([
  "select",
  "from",
  "where",
  "and",
  "or",
  "group",
  "by",
  "having",
  "count",
  "as",
  "in",
  "not",
  "like",
  "substr",
  "concat",
  "cloudfront_requests",
  "minute",
  "hits",
]);

describe("functions/security/scanRate404Detect", () => {
  beforeEach(() => {
    mockSsmSend.mockReset();
    mockPublishActivityEvent.mockClear();
    mockRunAthenaQuery.mockReset();
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.ATHENA_WORK_GROUP_NAME = "ci-env-analytics";
    process.env.GLUE_DATABASE_NAME = "ci_env_analytics";
    delete process.env.SCAN_DETECTION_404_PER_MINUTE;
  });

  describe("highWaterMarkParameterName", () => {
    test("is scoped to the environment", () => {
      expect(highWaterMarkParameterName()).toBe("/ci/submit/scan-detection/last-evaluated-minute");
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
    const baseParams = {
      dateStr: "2026-08-31",
      startExclusive: new Date("2026-08-31T10:00:00Z"),
      endInclusive: new Date("2026-08-31T10:05:00Z"),
      threshold: 20,
    };

    test("keeps date and time double-quoted, groups by host, and excludes the probe user agent", () => {
      const sql = buildQuery(baseParams);

      expect(sql).toContain('"date"');
      expect(sql).toContain('"time"');
      expect(sql).toContain("cs_host");
      expect(sql).not.toContain("distribution_id");
      expect(sql).toContain("NOT LIKE '%DIYAccountingProbe%'");
      expect(sql).toContain("year  = 2026 AND month = 8 AND day = 31");
      expect(sql).toContain("HAVING   count(*) > 20");
    });

    test("references only columns present in the Glue table plus its date partition keys", () => {
      const sql = buildQuery(baseParams);
      const tableColumns = new Set([...tableColumnsFromJava(), "year", "month", "day"]);

      const identifiers = new Set(
        [...sql.matchAll(/"([a-z_]+)"|\b([a-z][a-z0-9_]*)\b/g)]
          .map((match) => match[1] ?? match[2])
          .filter((identifier) => !NON_COLUMN_IDENTIFIERS.has(identifier)),
      );

      for (const identifier of identifiers) {
        expect(tableColumns.has(identifier), `"${identifier}" is not a cloudfront_requests column or partition key`).toBe(true);
      }
    });
  });

  describe("handler", () => {
    test("a first run with no stored parameter starts ten minutes back", async () => {
      mockSsmSend.mockResolvedValueOnce({ Parameter: undefined }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValueOnce([]);

      await handler({ now: "2026-08-31T10:20:00Z" });

      const sql = mockRunAthenaQuery.mock.calls[0][0].sql;
      // now - 5min lag = 10:15; minus 10min lookback = 10:05
      expect(sql).toContain("10:05'");
      expect(sql).toContain("10:15'");
    });

    test("the query window starts at the stored high-water mark and ends five minutes back", async () => {
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValueOnce([]);

      await handler({ now: "2026-08-31T10:20:00Z" });

      const sql = mockRunAthenaQuery.mock.calls[0][0].sql;
      expect(sql).toContain("10:00'");
      expect(sql).toContain("10:15'");
    });

    test("a window spanning midnight produces one query per date", async () => {
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T23:50" } }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValue([]);

      await handler({ now: "2026-09-01T00:10:00Z" });

      expect(mockRunAthenaQuery).toHaveBeenCalledTimes(2);
    });

    test("each returned row produces one ActivityEvent carrying the IP, the count and the host", async () => {
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValueOnce([
        { cs_host: "ci-set1.submit.diyaccounting.co.uk", c_ip: "203.0.113.9", minute: "2026-08-31T10:03", hits: "27" },
      ]);

      await handler({ now: "2026-08-31T10:20:00Z" });

      expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
      const call = mockPublishActivityEvent.mock.calls[0][0];
      expect(call.detail.clientIp).toBe("203.0.113.9");
      expect(call.detail.hits).toBe(27);
      expect(call.detail.host).toBe("ci-set1.submit.diyaccounting.co.uk");
      expect(call.flow).toBe("operational");
    });

    test("the high-water mark advances only after publishing succeeds", async () => {
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } }).mockResolvedValueOnce({});
      mockRunAthenaQuery.mockResolvedValueOnce([
        { cs_host: "ci-set1.submit.diyaccounting.co.uk", c_ip: "203.0.113.9", minute: "2026-08-31T10:03", hits: "27" },
      ]);

      await handler({ now: "2026-08-31T10:20:00Z" });

      expect(mockSsmSend).toHaveBeenCalledTimes(2);
      const putCall = mockSsmSend.mock.calls[1][0];
      expect(putCall.input.Value).toBe("2026-08-31T10:15");
    });

    test("a publish failure leaves the stored mark unchanged", async () => {
      mockSsmSend.mockResolvedValueOnce({ Parameter: { Value: "2026-08-31T10:00" } });
      mockRunAthenaQuery.mockResolvedValueOnce([
        { cs_host: "ci-set1.submit.diyaccounting.co.uk", c_ip: "203.0.113.9", minute: "2026-08-31T10:03", hits: "27" },
      ]);
      mockPublishActivityEvent.mockRejectedValueOnce(new Error("EventBridge unavailable"));

      await expect(handler({ now: "2026-08-31T10:20:00Z" })).rejects.toThrow("EventBridge unavailable");

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
    });
  });
});
