// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { gunzipSync } from "zlib";

const mockGetQueryResults = vi.fn();
const mockCreateQueryJob = vi.fn();

vi.mock("@google-cloud/bigquery", () => ({
  BigQuery: class {
    constructor(options) {
      this.options = options;
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

import { handler, defaultTargetDate, toNdjsonGzip } from "../../functions/analytics/ga4DailyPull.js";

const TABLES = ["sessions_by_host_source_daily", "funnel_steps_daily", "key_events_daily", "downloads_by_product_daily"];

function stubJob(rows) {
  mockGetQueryResults.mockResolvedValue([rows]);
  mockCreateQueryJob.mockResolvedValue([{ getQueryResults: mockGetQueryResults }]);
}

describe("ga4DailyPull", () => {
  beforeEach(() => {
    mockGetQueryResults.mockReset();
    mockCreateQueryJob.mockReset();
    stubJob([]);
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});
    mockSecretsManagerSend.mockReset();

    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake-bucket";
    process.env.GA4_BIGQUERY_PROJECT_ID = "diyaccounting-ga4";
    process.env.GA4_BIGQUERY_LOCATION = "europe-west2";
    process.env.GA4_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "svc@example.com",
      private_key: "test-key",
    });
  });

  afterEach(() => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.GA4_BIGQUERY_PROJECT_ID;
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
    test("uses D-2 by default and pulls every one of the four tables", async () => {
      const result = await handler();

      expect(result.date).toBe(defaultTargetDate());
      expect(mockCreateQueryJob).toHaveBeenCalledTimes(4);
      expect(Object.keys(result.keys).sort()).toEqual([...TABLES].sort());
    });

    test("an explicit date in the event overrides D-2", async () => {
      const result = await handler({ date: "2026-08-20" });

      expect(result.date).toBe("2026-08-20");
      expect(result.keys.funnel_steps_daily).toBe("curated/ga4_daily/funnel_steps_daily/dt=2026-08-20/data.json.gz");
    });

    test("queries the ga4_daily dataset and the target day for every table", async () => {
      await handler({ date: "2026-08-20" });

      const queries = mockCreateQueryJob.mock.calls.map(([options]) => options.query);
      for (const tableName of TABLES) {
        expect(queries.some((query) => query.includes(`ga4_daily.${tableName}`))).toBe(true);
      }
      expect(queries.every((query) => query.includes("2026-08-20"))).toBe(true);
    });

    test("the query job is created with the configured location", async () => {
      await handler({ date: "2026-08-20" });

      expect(mockCreateQueryJob).toHaveBeenCalledTimes(4);
      for (const [options] of mockCreateQueryJob.mock.calls) {
        expect(options.location).toBe("europe-west2");
      }
    });

    test("writes one gzipped object per table under its own curated prefix", async () => {
      stubJob([{ day: "2026-08-20", hostname: "submit.diyaccounting.co.uk", sessions: 3, users: 2 }]);

      await handler({ date: "2026-08-20" });

      expect(mockS3Send).toHaveBeenCalledTimes(4);
      const keys = mockS3Send.mock.calls.map((call) => call[0].input.Key).sort();
      expect(keys).toEqual(TABLES.map((tableName) => `curated/ga4_daily/${tableName}/dt=2026-08-20/data.json.gz`).sort());

      const call = mockS3Send.mock.calls[0];
      expect(call[0].input.Bucket).toBe("test-lake-bucket");
      expect(call[0].input.ContentEncoding).toBe("gzip");
      const body = gunzipSync(call[0].input.Body).toString("utf8");
      expect(JSON.parse(body.trimEnd())).toEqual({
        day: "2026-08-20",
        hostname: "submit.diyaccounting.co.uk",
        sessions: 3,
        users: 2,
      });
    });

    test("throws when the lake bucket name is not configured", async () => {
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
      expect(mockCreateQueryJob).not.toHaveBeenCalled();
    });

    test("throws when the BigQuery project id is not configured", async () => {
      delete process.env.GA4_BIGQUERY_PROJECT_ID;
      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/GA4_BIGQUERY_PROJECT_ID/);
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
      expect(mockCreateQueryJob).not.toHaveBeenCalled();
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
