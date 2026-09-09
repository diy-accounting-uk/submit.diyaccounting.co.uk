// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const mockS3Send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send(command) {
      return mockS3Send(command);
    }
  }
  class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  }
  class CopyObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { S3Client, ListObjectsV2Command, CopyObjectCommand };
});

const { S3Client } = await import("@aws-sdk/client-s3");
const fakeS3Client = new S3Client();

const { handler, readConfig, listRecentExportObjects, todayPartition } = await import(
  "../../functions/analytics/costFocusCopy/index.js"
);

const ENV_KEYS = ["FOCUS_EXPORT_BUCKET_NAME", "FOCUS_EXPORT_S3_PREFIX", "ANALYTICS_LAKE_BUCKET_NAME", "COST_FOCUS_CURATED_PREFIX"];

function setEnv(overrides = {}) {
  const values = {
    FOCUS_EXPORT_BUCKET_NAME: "diy-accounting-cost-focus-887764105431",
    FOCUS_EXPORT_S3_PREFIX: "focus",
    ANALYTICS_LAKE_BUCKET_NAME: "prod-env-analytics-lake-972912397388",
    COST_FOCUS_CURATED_PREFIX: "curated/cost/focus",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("costFocusCopy", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    setEnv();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  describe("readConfig", () => {
    test("reads the source and destination configuration", () => {
      expect(readConfig()).toEqual({
        sourceBucket: "diy-accounting-cost-focus-887764105431",
        sourcePrefix: "focus",
        destinationBucket: "prod-env-analytics-lake-972912397388",
        destinationPrefix: "curated/cost/focus",
      });
    });

    test("throws when the source bucket is missing", () => {
      setEnv({ FOCUS_EXPORT_BUCKET_NAME: undefined });
      expect(() => readConfig()).toThrow(/sourceBucket/);
    });

    test("throws when the destination bucket is missing", () => {
      setEnv({ ANALYTICS_LAKE_BUCKET_NAME: undefined });
      expect(() => readConfig()).toThrow(/destinationBucket/);
    });
  });

  describe("listRecentExportObjects", () => {
    test("keeps only recent parquet objects under the export prefix", async () => {
      const now = new Date("2026-09-08T02:15:00Z");
      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: "focus/data/BILLING_PERIOD=2026-09/one.parquet", LastModified: new Date("2026-09-08T01:00:00Z") },
          { Key: "focus/data/BILLING_PERIOD=2026-09/manifest.json", LastModified: new Date("2026-09-08T01:00:00Z") },
          { Key: "focus/data/BILLING_PERIOD=2026-08/old.parquet", LastModified: new Date("2026-08-01T00:00:00Z") },
        ],
      });

      const objects = await listRecentExportObjects(fakeS3Client, readConfig(), now);

      expect(objects).toEqual([{ key: "focus/data/BILLING_PERIOD=2026-09/one.parquet", basename: "one.parquet" }]);
    });

    test("pages through a truncated listing", async () => {
      const now = new Date("2026-09-08T02:15:00Z");
      mockS3Send
        .mockResolvedValueOnce({
          Contents: [{ Key: "focus/data/a.parquet", LastModified: now }],
          NextContinuationToken: "token-1",
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: "focus/data/b.parquet", LastModified: now }],
        });

      const objects = await listRecentExportObjects(fakeS3Client, readConfig(), now);

      expect(objects.map((o) => o.basename)).toEqual(["a.parquet", "b.parquet"]);
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });

  describe("todayPartition", () => {
    test("formats as yyyy-MM-dd in UTC", () => {
      expect(todayPartition(new Date("2026-09-08T23:59:00Z"))).toBe("2026-09-08");
    });
  });

  describe("handler", () => {
    test("copies each recent object into the day's curated partition", async () => {
      mockS3Send
        .mockResolvedValueOnce({
          Contents: [{ Key: "focus/data/one.parquet", LastModified: new Date() }],
        })
        .mockResolvedValueOnce({});

      const result = await handler({ now: "2026-09-08T02:15:00Z" });

      expect(result).toEqual({ copied: 1, partition: "2026-09-08" });
      const copyCall = mockS3Send.mock.calls[1][0];
      expect(copyCall.input).toEqual({
        Bucket: "prod-env-analytics-lake-972912397388",
        Key: "curated/cost/focus/dt=2026-09-08/one.parquet",
        CopySource: "/diy-accounting-cost-focus-887764105431/focus/data/one.parquet",
      });
    });

    test("copies nothing when the export has no recent objects", async () => {
      mockS3Send.mockResolvedValueOnce({ Contents: [] });

      const result = await handler({ now: "2026-09-08T02:15:00Z" });

      expect(result).toEqual({ copied: 0, partition: "2026-09-08" });
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });
  });
});
