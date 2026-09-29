// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { gunzipSync } from "zlib";

const mockGetQueryResults = vi.fn();
const mockCreateQueryJob = vi.fn();
const mockTableExists = vi.fn();

const mockBigQueryOptions = [];
vi.mock("@google-cloud/bigquery", () => ({
  BigQuery: class {
    constructor(options) {
      this.options = options;
      mockBigQueryOptions.push(options);
    }
    createQueryJob(...args) {
      return mockCreateQueryJob(...args);
    }
    dataset() {
      return { table: (name) => ({ exists: () => mockTableExists(name) }) };
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

import { handler, defaultTargetDate, toNdjsonGzip, hourlyTargetDates, buildHourlyQuery } from "../../functions/analytics/ga4DailyPull.js";

const TABLES = ["sessions_by_host_source_daily", "funnel_steps_daily", "key_events_daily", "downloads_by_product_daily"];

const FEDERATION_ENV = {
  GOOGLE_WIF_AUDIENCE:
    "//iam.googleapis.com/projects/958354756046/locations/global/workloadIdentityPools/submit-federation/providers/aws-prod",
  GA4_SERVICE_ACCOUNT_EMAIL: "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com",
  AWS_REGION: "eu-west-2",
  AWS_ACCESS_KEY_ID: "ASIAEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_SESSION_TOKEN: "session",
};

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
    mockTableExists.mockReset();
    mockTableExists.mockResolvedValue([false]);
    process.env.GA4_BIGQUERY_DATASET_ID = "analytics_523400333";

    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake-bucket";
    process.env.GA4_BIGQUERY_PROJECT_ID = "diyaccounting-ga4";
    process.env.GA4_BIGQUERY_LOCATION = "europe-west2";
    Object.assign(process.env, FEDERATION_ENV);
  });

  afterEach(() => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.GA4_BIGQUERY_PROJECT_ID;
    delete process.env.GA4_BIGQUERY_LOCATION;
    delete process.env.GA4_BIGQUERY_DATASET_ID;
    for (const name of Object.keys(FEDERATION_ENV)) {
      delete process.env[name];
    }
    vi.restoreAllMocks();
  });

  describe("defaultTargetDate", () => {
    test("returns D-2 in UTC as YYYY-MM-DD", () => {
      const now = new Date();
      const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2)).toISOString().slice(0, 10);

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

    test("builds the BigQuery client from the Lambda's execution role", async () => {
      await handler({ date: "2026-08-20" });

      // getBigQueryClient() caches its client across calls, so a client built by an earlier
      // test in this file may still be the one in use; every option this module has ever built
      // a client from is federated, so any recorded entry proves the point.
      expect(mockBigQueryOptions.length).toBeGreaterThan(0);
      for (const options of mockBigQueryOptions) {
        expect(options.credentials).toBeUndefined();
        expect(options.authClient).toBeDefined();
      }
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

    test("throws without querying when the federation settings are not configured", async () => {
      delete process.env.GOOGLE_WIF_AUDIENCE;

      await expect(handler({ date: "2026-08-20" })).rejects.toThrow(/GOOGLE_WIF_AUDIENCE/);
      expect(mockCreateQueryJob).not.toHaveBeenCalled();
      expect(mockS3Send).not.toHaveBeenCalled();
    });
  });
  describe("hourly mode", () => {
    const putKeys = () => mockS3Send.mock.calls.map(([command]) => command.input.Key);
    const putBody = (key) => {
      const call = mockS3Send.mock.calls.find(([command]) => command.input.Key === key);
      return gunzipSync(call[0].input.Body).toString("utf8");
    };

    test("hourlyTargetDates lists today and the two days before it in UTC, newest first", () => {
      expect(hourlyTargetDates(new Date("2026-09-29T00:10:00Z"))).toEqual(["2026-09-29", "2026-09-28", "2026-09-27"]);
    });

    test("prefers the daily table over the intraday one and bounds the query to that single table", async () => {
      mockTableExists.mockImplementation(async (name) => [name.startsWith("events_2")]);
      stubJob([{ hour: "2026-09-28T07:00:00Z", visitor_kind: "human", sessions: 4, users: 3 }]);

      const result = await handler({ mode: "hourly" });

      const [today] = hourlyTargetDates();
      expect(result.sourceTables[today]).toBe(`events_${today.replaceAll("-", "")}`);
      expect(mockCreateQueryJob).toHaveBeenCalledTimes(3);
      for (const [{ query }] of mockCreateQueryJob.mock.calls) {
        expect(query).toMatch(/FROM `diyaccounting-ga4\.analytics_523400333\.events_\d{8}`/);
        expect(query).not.toContain("*");
      }
    });

    test("writes one object per day under the hourly prefix with the rows as NDJSON", async () => {
      mockTableExists.mockImplementation(async (name) => [name.startsWith("events_intraday_")]);
      const row = { hour: "2026-09-29T07:00:00Z", visitor_kind: "human", sessions: 4, users: 3 };
      stubJob([row]);

      const result = await handler({ mode: "hourly" });

      const dates = hourlyTargetDates();
      expect(putKeys()).toEqual(dates.map((date) => `curated/ga4_hourly/sessions_by_hour_kind/dt=${date}/data.json.gz`));
      expect(JSON.parse(putBody(result.keys[dates[0]]).trim())).toEqual(row);
      expect(mockCreateQueryJob.mock.calls[0][0].query).toContain("events_intraday_");
    });

    test("a property with no export tables gets empty objects and no query, never an error", async () => {
      const result = await handler({ mode: "hourly" });

      expect(mockCreateQueryJob).not.toHaveBeenCalled();
      expect(Object.values(result.counts)).toEqual([0, 0, 0]);
      expect(mockS3Send).toHaveBeenCalledTimes(3);
      expect(putBody(putKeys()[0])).toBe("");
    });

    test("throws when the GA4 dataset id is not configured", async () => {
      delete process.env.GA4_BIGQUERY_DATASET_ID;
      await expect(handler({ mode: "hourly" })).rejects.toThrow(/GA4_BIGQUERY_DATASET_ID/);
    });

    test("buildHourlyQuery counts distinct session_start sessions by hour and visitor_kind", () => {
      const query = buildHourlyQuery("p", "d", "events_intraday_20260929");

      expect(query).toContain("FROM `p.d.events_intraday_20260929`");
      expect(query).toContain("event_name = 'session_start'");
      expect(query).toContain("key = 'visitor_kind'");
      expect(query).toContain("GROUP BY 1, 2");
    });
  });
});
