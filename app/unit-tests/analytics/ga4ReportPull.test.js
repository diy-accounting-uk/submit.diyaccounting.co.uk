// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { gunzipSync } from "zlib";

const mockRunReport = vi.fn();
vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: class {
    constructor(options) {
      this.options = options;
    }
    runReport(...args) {
      return mockRunReport(...args);
    }
  },
}));

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockSecretsManagerSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsManagerSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  handler,
  defaultTargetDate,
  formatGa4Date,
  rowToRecord,
  toNdjsonGzip,
} from "@app/functions/analytics/ga4ReportPull.js";

function emptyReport() {
  return [{ rows: [] }];
}

describe("ga4ReportPull", () => {
  beforeEach(() => {
    mockRunReport.mockReset();
    mockRunReport.mockResolvedValue(emptyReport());
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});
    mockSecretsManagerSend.mockReset();

    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake-bucket";
    process.env.GA4_PROPERTY_ID = "523400333";
    process.env.GA4_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "svc@example.com",
      private_key: "test-key",
    });
  });

  afterEach(() => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.GA4_PROPERTY_ID;
    delete process.env.GA4_SERVICE_ACCOUNT_JSON;
    delete process.env.GA4_SERVICE_ACCOUNT_ARN;
    vi.restoreAllMocks();
  });

  describe("defaultTargetDate", () => {
    test("returns yesterday in UTC as YYYY-MM-DD", () => {
      const now = new Date();
      const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
        .toISOString()
        .slice(0, 10);

      expect(defaultTargetDate()).toBe(expected);
    });
  });

  describe("formatGa4Date", () => {
    test("converts YYYYMMDD into YYYY-MM-DD", () => {
      expect(formatGa4Date("20260820")).toBe("2026-08-20");
    });
  });

  describe("rowToRecord", () => {
    test("casts metric strings to numbers and formats the date dimension", () => {
      const row = {
        dimensionValues: [{ value: "20260820" }, { value: "GB" }],
        metricValues: [{ value: "42" }, { value: "3.5" }],
      };

      const record = rowToRecord(row, ["date", "country"], ["sessions", "averageSessionDuration"]);

      expect(record).toEqual({
        date: "2026-08-20",
        country: "GB",
        sessions: 42,
        averageSessionDuration: 3.5,
      });
    });

    test("leaves a non-date dimension as a plain string", () => {
      const row = { dimensionValues: [{ value: "/pricing" }], metricValues: [{ value: "7" }] };

      const record = rowToRecord(row, ["pagePath"], ["screenPageViews"]);

      expect(record.pagePath).toBe("/pricing");
      expect(record.screenPageViews).toBe(7);
    });
  });

  describe("toNdjsonGzip", () => {
    test("produces gzip whose decompressed body is one JSON object per line", () => {
      const buffer = toNdjsonGzip([{ a: 1 }, { b: 2 }]);
      const text = gunzipSync(buffer).toString("utf8");
      const lines = text.trimEnd().split("\n");

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual({ a: 1 });
      expect(JSON.parse(lines[1])).toEqual({ b: 2 });
    });

    test("an empty record list still gzips to a valid, empty body", () => {
      const buffer = toNdjsonGzip([]);
      expect(gunzipSync(buffer).toString("utf8")).toBe("");
    });
  });

  describe("handler", () => {
    test("uses yesterday by default and writes three date-partitioned reports", async () => {
      const result = await handler();

      expect(result.date).toBe(defaultTargetDate());
      expect(mockS3Send).toHaveBeenCalledTimes(3);

      const keys = mockS3Send.mock.calls.map((call) => call[0].input.Key);
      expect(keys).toEqual([
        `curated/ga4/report=traffic/dt=${result.date}/traffic.json.gz`,
        `curated/ga4/report=pages/dt=${result.date}/pages.json.gz`,
        `curated/ga4/report=events/dt=${result.date}/events.json.gz`,
      ]);
      for (const call of mockS3Send.mock.calls) {
        expect(call[0].input.Bucket).toBe("test-lake-bucket");
      }
    });

    test("an explicit date in the event overrides the default and sets the GA4 date range", async () => {
      const result = await handler({ date: "2026-08-20" });

      expect(result.date).toBe("2026-08-20");
      for (const call of mockRunReport.mock.calls) {
        expect(call[0].dateRanges).toEqual([{ startDate: "2026-08-20", endDate: "2026-08-20" }]);
      }

      const keys = mockS3Send.mock.calls.map((call) => call[0].input.Key);
      expect(keys).toEqual([
        "curated/ga4/report=traffic/dt=2026-08-20/traffic.json.gz",
        "curated/ga4/report=pages/dt=2026-08-20/pages.json.gz",
        "curated/ga4/report=events/dt=2026-08-20/events.json.gz",
      ]);
    });

    test("requests the configured property id, and each report's own dimensions and metrics", async () => {
      await handler({ date: "2026-08-20" });

      expect(mockRunReport).toHaveBeenCalledTimes(3);
      const [trafficCall, pagesCall, eventsCall] = mockRunReport.mock.calls.map((call) => call[0]);

      expect(trafficCall.property).toBe("properties/523400333");
      expect(trafficCall.dimensions).toEqual([
        { name: "date" },
        { name: "country" },
        { name: "sessionDefaultChannelGroup" },
      ]);
      expect(trafficCall.metrics).toEqual([
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "engagedSessions" },
        { name: "averageSessionDuration" },
      ]);

      expect(pagesCall.property).toBe("properties/523400333");
      expect(pagesCall.dimensions).toEqual([{ name: "date" }, { name: "pagePath" }, { name: "hostName" }]);
      expect(pagesCall.metrics).toEqual([{ name: "screenPageViews" }, { name: "activeUsers" }]);

      expect(eventsCall.dimensions).toEqual([{ name: "date" }, { name: "eventName" }]);
      expect(eventsCall.metrics).toEqual([{ name: "eventCount" }, { name: "activeUsers" }, { name: "eventValue" }]);
    });

    test("string metric values from the GA4 API become numbers in the written record", async () => {
      mockRunReport.mockImplementation(async (request) => {
        if (!request.dimensions.some((d) => d.name === "sessionDefaultChannelGroup")) {
          return emptyReport();
        }
        return [
          {
            rows: [
              {
                dimensionValues: [{ value: "20260820" }, { value: "GB" }, { value: "Direct" }],
                metricValues: [
                  { value: "12" },
                  { value: "10" },
                  { value: "3" },
                  { value: "9" },
                  { value: "45.5" },
                ],
              },
            ],
          },
        ];
      });

      await handler({ date: "2026-08-20" });

      const trafficCall = mockS3Send.mock.calls.find((call) => call[0].input.Key.includes("report=traffic/"));
      const body = gunzipSync(trafficCall[0].input.Body).toString("utf8");
      const row = JSON.parse(body.trimEnd());

      expect(row).toEqual({
        date: "2026-08-20",
        country: "GB",
        sessionDefaultChannelGroup: "Direct",
        sessions: 12,
        activeUsers: 10,
        newUsers: 3,
        engagedSessions: 9,
        averageSessionDuration: 45.5,
      });
    });

    test("throws when the lake bucket name is not configured", async () => {
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
    });

    test("throws when the property id is not configured", async () => {
      delete process.env.GA4_PROPERTY_ID;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/GA4_PROPERTY_ID/);
    });

    test("throws without writing any object when no service-account credential is configured", async () => {
      delete process.env.GA4_SERVICE_ACCOUNT_JSON;

      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(
        /GA4_SERVICE_ACCOUNT_JSON|GA4_SERVICE_ACCOUNT_ARN/,
      );
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    test("resolves the service-account credential from Secrets Manager when only the ARN is set", async () => {
      delete process.env.GA4_SERVICE_ACCOUNT_JSON;
      process.env.GA4_SERVICE_ACCOUNT_ARN =
        "arn:aws:secretsmanager:eu-west-2:111111111111:secret:ci/submit/ga4/service_account";
      mockSecretsManagerSend.mockResolvedValue({
        SecretString: JSON.stringify({ client_email: "svc@example.com", private_key: "test-key" }),
      });

      const result = await handler({ date: "2026-08-20" });

      expect(result.date).toBe("2026-08-20");
      expect(mockSecretsManagerSend).toHaveBeenCalledTimes(1);
      expect(mockSecretsManagerSend.mock.calls[0][0].input.SecretId).toBe(process.env.GA4_SERVICE_ACCOUNT_ARN);
    });
  });
});
