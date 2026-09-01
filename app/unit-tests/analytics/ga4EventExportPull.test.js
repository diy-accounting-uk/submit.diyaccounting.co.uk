// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { gunzipSync } from "zlib";

const mockTableExists = vi.fn();
const mockGetQueryResults = vi.fn();
const mockCreateQueryJob = vi.fn();

vi.mock("@google-cloud/bigquery", () => ({
  BigQuery: class {
    constructor(options) {
      this.options = options;
    }
    dataset(datasetId) {
      return {
        table: (tableName) => ({
          exists: (...args) => mockTableExists(datasetId, tableName, ...args),
        }),
      };
    }
    createQueryJob(...args) {
      return mockCreateQueryJob(...args);
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

import { handler, defaultTargetDate, toTableDateSuffix, toNdjsonGzip } from "@app/functions/analytics/ga4EventExportPull.js";

function stubJob(rows) {
  mockGetQueryResults.mockResolvedValue([rows]);
  mockCreateQueryJob.mockResolvedValue([{ getQueryResults: mockGetQueryResults }]);
}

describe("ga4EventExportPull", () => {
  beforeEach(() => {
    mockTableExists.mockReset();
    mockTableExists.mockResolvedValue([true]);
    mockGetQueryResults.mockReset();
    mockCreateQueryJob.mockReset();
    stubJob([]);
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});
    mockSecretsManagerSend.mockReset();

    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake-bucket";
    process.env.GA4_BIGQUERY_PROJECT_ID = "diyaccounting-ga4";
    process.env.GA4_BIGQUERY_DATASET_ID = "analytics_523400333";
    process.env.GA4_BIGQUERY_LOCATION = "europe-west2";
    process.env.GA4_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "svc@example.com",
      private_key: "test-key",
    });
  });

  afterEach(() => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.GA4_BIGQUERY_PROJECT_ID;
    delete process.env.GA4_BIGQUERY_DATASET_ID;
    delete process.env.GA4_BIGQUERY_LOCATION;
    delete process.env.GA4_SERVICE_ACCOUNT_JSON;
    delete process.env.GA4_SERVICE_ACCOUNT_ARN;
    vi.restoreAllMocks();
  });

  describe("defaultTargetDate", () => {
    test("returns D-2 in UTC as YYYY-MM-DD", () => {
      const now = new Date();
      const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2))
        .toISOString()
        .slice(0, 10);

      expect(defaultTargetDate()).toBe(expected);
    });
  });

  describe("toTableDateSuffix", () => {
    test("converts YYYY-MM-DD into YYYYMMDD", () => {
      expect(toTableDateSuffix("2026-08-20")).toBe("20260820");
    });

    test("rejects a date that is not eight digits once dashes are stripped", () => {
      expect(() => toTableDateSuffix("2026-8-20")).toThrow(/Invalid target date/);
      expect(() => toTableDateSuffix("not-a-date")).toThrow(/Invalid target date/);
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
  });

  describe("handler", () => {
    test("uses D-2 by default and targets that day's export table", async () => {
      const result = await handler();

      expect(result.date).toBe(defaultTargetDate());
      expect(mockTableExists).toHaveBeenCalledTimes(1);
      const [, tableName] = mockTableExists.mock.calls[0];
      expect(tableName).toBe(`events_${toTableDateSuffix(result.date)}`);
    });

    test("an explicit date in the event overrides D-2", async () => {
      const result = await handler({ date: "2026-08-20" });

      expect(result.date).toBe("2026-08-20");
      const [, tableName] = mockTableExists.mock.calls[0];
      expect(tableName).toBe("events_20260820");
      expect(result.key).toBe("curated/ga4_bq/events/dt=2026-08-20/events.json.gz");
    });

    test("a date that is not eight digits throws before any query is built", async () => {
      await expect(handler({ date: "2026-8-20" })).rejects.toThrow(/Invalid target date/);
      expect(mockTableExists).not.toHaveBeenCalled();
      expect(mockCreateQueryJob).not.toHaveBeenCalled();
    });

    test("a missing table throws, and no object is written", async () => {
      mockTableExists.mockResolvedValue([false]);

      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/does not exist/);
      expect(mockCreateQueryJob).not.toHaveBeenCalled();
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    test("the query job is created with the configured location", async () => {
      await handler({ date: "2026-08-20" });

      expect(mockCreateQueryJob).toHaveBeenCalledTimes(1);
      const [options] = mockCreateQueryJob.mock.calls[0];
      expect(options.location).toBe("europe-west2");
      expect(options.query).toContain("events_20260820");
    });

    test("the query selects user_pseudo_id but never user_id", async () => {
      await handler({ date: "2026-08-20" });

      const [options] = mockCreateQueryJob.mock.calls[0];
      expect(options.query).toMatch(/user_pseudo_id/);
      expect(options.query).not.toMatch(/\buser_id\b/);
    });

    test("metric values come back as numbers, not strings, and are written unchanged", async () => {
      stubJob([
        {
          event_ts: "2026-08-20T10:00:00Z",
          event_name: "purchase",
          user_pseudo_id: "abc123",
          ga_session_id: 1755680000,
          ga_session_number: 3,
          engagement_time_msec: 4200,
          event_value: 19.99,
          currency: "GBP",
        },
      ]);

      const result = await handler({ date: "2026-08-20" });

      expect(result.count).toBe(1);
      const call = mockS3Send.mock.calls[0];
      const body = gunzipSync(call[0].input.Body).toString("utf8");
      const row = JSON.parse(body.trimEnd());

      expect(row.ga_session_id).toBe(1755680000);
      expect(typeof row.ga_session_id).toBe("number");
      expect(row.event_value).toBe(19.99);
      expect(typeof row.event_value).toBe("number");
      expect("user_id" in row).toBe(false);
    });

    test("the written body is gzip, and every line parses as one JSON object", async () => {
      stubJob([
        { event_name: "session_start", user_pseudo_id: "a" },
        { event_name: "purchase", user_pseudo_id: "b" },
      ]);

      await handler({ date: "2026-08-20" });

      const call = mockS3Send.mock.calls[0];
      expect(call[0].input.Bucket).toBe("test-lake-bucket");
      expect(call[0].input.ContentEncoding).toBe("gzip");

      const body = gunzipSync(call[0].input.Body).toString("utf8");
      const lines = body.trimEnd().split("\n");
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    test("throws when the lake bucket name is not configured", async () => {
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
    });

    test("throws when the BigQuery project id is not configured", async () => {
      delete process.env.GA4_BIGQUERY_PROJECT_ID;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/GA4_BIGQUERY_PROJECT_ID/);
    });

    test("throws when the BigQuery dataset id is not configured", async () => {
      delete process.env.GA4_BIGQUERY_DATASET_ID;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/GA4_BIGQUERY_DATASET_ID/);
    });

    test("throws when the BigQuery location is not configured", async () => {
      delete process.env.GA4_BIGQUERY_LOCATION;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/GA4_BIGQUERY_LOCATION/);
    });

    test("throws without querying when no service-account credential is configured", async () => {
      delete process.env.GA4_SERVICE_ACCOUNT_JSON;

      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(
        /GA4_SERVICE_ACCOUNT_JSON|GA4_SERVICE_ACCOUNT_ARN/,
      );
      expect(mockTableExists).not.toHaveBeenCalled();
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
