// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockEnforceBundles = vi.fn();

vi.mock("@app/services/bundleManagement.js", async () => {
  const actual = await vi.importActual("@app/services/bundleManagement.js");
  return {
    ...actual,
    enforceBundles: (...args) => mockEnforceBundles(...args),
  };
});

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  GetObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { ingestHandler, readLatestSnapshot, http403ForbiddenFromBundleEnforcement } from "@app/functions/analytics/operatorSnapshotGet.js";
import { BundleAuthorizationError, BundleEntitlementError } from "@app/services/bundleManagement.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";

function bodyOf(response) {
  return JSON.parse(response.body);
}

function s3BodyOf(snapshot) {
  return { transformToString: async () => JSON.stringify(snapshot) };
}

describe("operatorSnapshotGet", () => {
  beforeEach(() => {
    mockEnforceBundles.mockReset();
    mockS3Send.mockReset();
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-env-analytics-lake";
    process.env.ENVIRONMENT_NAME = "test";
  });

  afterEach(() => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.ENVIRONMENT_NAME;
    vi.restoreAllMocks();
  });

  describe("readLatestSnapshot", () => {
    test("requires its environment variables", async () => {
      delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
      await expect(readLatestSnapshot()).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
    });

    test("reads and parses the latest.json object for the environment", async () => {
      const snapshot = { generatedAt: "2026-09-08T03:15:00.000Z", environment: "test", objectives: [] };
      mockS3Send.mockResolvedValueOnce({ Body: s3BodyOf(snapshot) });

      const result = await readLatestSnapshot();

      expect(result).toEqual(snapshot);
      expect(mockS3Send.mock.calls[0][0].input).toEqual({
        Bucket: "test-env-analytics-lake",
        Key: "snapshots/test/latest.json",
      });
    });

    test("returns null when the nightly job has not written a snapshot yet", async () => {
      const error = new Error("not found");
      error.name = "NoSuchKey";
      mockS3Send.mockRejectedValueOnce(error);

      await expect(readLatestSnapshot()).resolves.toBeNull();
    });

    test("propagates any other S3 error", async () => {
      mockS3Send.mockRejectedValueOnce(new Error("access denied"));
      await expect(readLatestSnapshot()).rejects.toThrow(/access denied/);
    });
  });

  describe("http403ForbiddenFromBundleEnforcement", () => {
    test("maps a BundleAuthorizationError to 401", () => {
      const error = new BundleAuthorizationError("bad token", { code: "UNAUTHORIZED" });
      const response = http403ForbiddenFromBundleEnforcement(error, { requestId: "r1" });
      expect(response.statusCode).toBe(401);
    });

    test("maps a BundleEntitlementError to 403", () => {
      const error = new BundleEntitlementError("no bundle", { code: "BUNDLE_ENTITLEMENT_REQUIRED" });
      const response = http403ForbiddenFromBundleEnforcement(error, { requestId: "r1" });
      expect(response.statusCode).toBe(403);
    });

    test("maps any other error to 500", () => {
      const response = http403ForbiddenFromBundleEnforcement(new Error("boom"), { requestId: "r1" });
      expect(response.statusCode).toBe(500);
    });
  });

  describe("ingestHandler", () => {
    test("returns 403 when the caller does not hold the operator bundle", async () => {
      mockEnforceBundles.mockRejectedValueOnce(
        new BundleEntitlementError("Forbidden: Activity requires operator bundle", { code: "BUNDLE_FORBIDDEN" }),
      );

      const response = await ingestHandler(buildLambdaEvent({ path: "/api/v1/operator/snapshot" }));

      expect(response.statusCode).toBe(403);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    test("returns 404 when no snapshot has been published yet", async () => {
      mockEnforceBundles.mockResolvedValueOnce({ userSub: "operator-sub", bundleIds: ["operator"] });
      const error = new Error("not found");
      error.name = "NoSuchKey";
      mockS3Send.mockRejectedValueOnce(error);

      const response = await ingestHandler(buildLambdaEvent({ path: "/api/v1/operator/snapshot" }));

      expect(response.statusCode).toBe(404);
      expect(bodyOf(response).code).toBe("snapshot-not-found");
    });

    test("returns the snapshot for an entitled operator", async () => {
      mockEnforceBundles.mockResolvedValueOnce({ userSub: "operator-sub", bundleIds: ["operator"] });
      const snapshot = { generatedAt: "2026-09-08T03:15:00.000Z", environment: "test", objectives: [{ id: "uptime" }] };
      mockS3Send.mockResolvedValueOnce({ Body: s3BodyOf(snapshot) });

      const response = await ingestHandler(buildLambdaEvent({ path: "/api/v1/operator/snapshot" }));

      expect(response.statusCode).toBe(200);
      expect(bodyOf(response)).toEqual(snapshot);
    });

    test("returns 500 when the snapshot read fails", async () => {
      mockEnforceBundles.mockResolvedValueOnce({ userSub: "operator-sub", bundleIds: ["operator"] });
      mockS3Send.mockRejectedValueOnce(new Error("access denied"));

      const response = await ingestHandler(buildLambdaEvent({ path: "/api/v1/operator/snapshot" }));

      expect(response.statusCode).toBe(500);
    });
  });
});
