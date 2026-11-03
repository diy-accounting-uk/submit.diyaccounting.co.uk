// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockEnforceBundles = vi.fn();
vi.mock("@app/services/bundleManagement.js", async () => {
  const actual = await vi.importActual("@app/services/bundleManagement.js");
  return { ...actual, enforceBundles: (...args) => mockEnforceBundles(...args) };
});

vi.mock("@app/services/subHasher.js", async () => {
  const actual = await vi.importActual("@app/services/subHasher.js");
  return { ...actual, initializeSalt: vi.fn().mockResolvedValue(undefined) };
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

import { ingestHandler } from "@app/functions/analytics/operatorConsoleImageGet.js";
import { BundleAuthorizationError, BundleEntitlementError } from "@app/services/bundleManagement.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const index = {
  generatedAt: "2026-11-02T02:20:00.000Z",
  environment: "test",
  items: {
    "ci-lambda-errors": { id: "ci-lambda-errors", imageKey: "snapshots/test/console/ci/ci-lambda-errors.png" },
    "ci-alarms": { id: "ci-alarms", rows: [] },
  },
};

function eventFor(id) {
  return buildLambdaEvent({ path: "/api/v1/operator/console-image", queryStringParameters: id === undefined ? {} : { id } });
}

function s3Answer(key) {
  if (key.endsWith("index.json")) return { Body: { transformToString: async () => JSON.stringify(index) } };
  if (key === "snapshots/test/console/ci/ci-lambda-errors.png") return { Body: { transformToByteArray: async () => new Uint8Array(PNG) } };
  const error = new Error("missing");
  error.name = "NoSuchKey";
  throw error;
}

describe("operatorConsoleImageGet", () => {
  beforeEach(() => {
    mockEnforceBundles.mockReset();
    mockS3Send.mockReset();
    mockS3Send.mockImplementation(async (command) => s3Answer(command.input.Key));
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-env-analytics-lake";
    process.env.ENVIRONMENT_NAME = "test";
  });

  afterEach(() => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.ENVIRONMENT_NAME;
  });

  test("answers 401 JSON when the caller is signed out", async () => {
    mockEnforceBundles.mockRejectedValueOnce(new BundleAuthorizationError("no token", { code: "UNAUTHORIZED" }));
    const response = await ingestHandler(eventFor("ci-lambda-errors"));
    expect(response.statusCode).toBe(401);
    expect(() => JSON.parse(response.body)).not.toThrow();
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("answers 403 JSON when the caller does not hold the operator bundle", async () => {
    mockEnforceBundles.mockRejectedValueOnce(new BundleEntitlementError("not operator", { code: "BUNDLE_FORBIDDEN" }));
    const response = await ingestHandler(eventFor("ci-lambda-errors"));
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toMatch(/operator pass/);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("answers 400 JSON when no id is given", async () => {
    mockEnforceBundles.mockResolvedValueOnce({ bundleIds: ["operator"] });
    const response = await ingestHandler(eventFor(undefined));
    expect(response.statusCode).toBe(400);
  });

  test("answers 404 JSON for an id that is not in the index and reads no other object", async () => {
    mockEnforceBundles.mockResolvedValueOnce({ bundleIds: ["operator"] });
    const response = await ingestHandler(eventFor("../../latest"));
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).code).toBe("console-image-not-found");
    expect(mockS3Send.mock.calls.map((call) => call[0].input.Key)).toEqual(["snapshots/test/console/index.json"]);
  });

  test("answers 404 JSON for an indexed item that holds a table, not an image", async () => {
    mockEnforceBundles.mockResolvedValueOnce({ bundleIds: ["operator"] });
    const response = await ingestHandler(eventFor("ci-alarms"));
    expect(response.statusCode).toBe(404);
  });

  test("answers 404 JSON when no capture has run yet", async () => {
    mockEnforceBundles.mockResolvedValueOnce({ bundleIds: ["operator"] });
    mockS3Send.mockImplementation(async (command) => {
      const error = new Error("missing");
      error.name = "NoSuchKey";
      throw error;
    });
    const response = await ingestHandler(eventFor("ci-lambda-errors"));
    expect(response.statusCode).toBe(404);
  });

  test("answers the PNG to an operator, private and uncached", async () => {
    mockEnforceBundles.mockResolvedValueOnce({ bundleIds: ["operator"] });
    const response = await ingestHandler(eventFor("ci-lambda-errors"));
    expect(response.statusCode).toBe(200);
    expect(response.isBase64Encoded).toBe(true);
    expect(response.headers["Content-Type"]).toBe("image/png");
    expect(response.headers["Cache-Control"]).toBe("private, no-store");
    expect(Buffer.from(response.body, "base64")).toEqual(PNG);
  });

  test("answers 500 JSON when the lake read fails", async () => {
    mockEnforceBundles.mockResolvedValueOnce({ bundleIds: ["operator"] });
    mockS3Send.mockRejectedValueOnce(new Error("access denied"));
    const response = await ingestHandler(eventFor("ci-lambda-errors"));
    expect(response.statusCode).toBe(500);
  });
});
