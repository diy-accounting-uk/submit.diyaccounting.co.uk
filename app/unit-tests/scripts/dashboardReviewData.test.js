// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

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

const mockGetHeldPasses = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getHeldPasses: (...args) => mockGetHeldPasses(...args),
}));

import { readReviewData, snapshotAnswer } from "../../../scripts/dashboard-review-data.mjs";

const SNAPSHOT = { generatedAt: "2026-11-03T02:15:00.000Z", environment: "prod", objectives: [] };
const INDEX = {
  generatedAt: "2026-11-03T02:20:00.000Z",
  items: {
    "prod-lambda-errors": { id: "prod-lambda-errors", imageKey: "snapshots/prod/console/prod/prod-lambda-errors.png" },
    "prod-alarms": { id: "prod-alarms", kind: "alarms", rows: [] },
  },
};
const PNG = Uint8Array.from([137, 80, 78, 71]);

function s3Error(name) {
  const error = new Error(name);
  error.name = name;
  return error;
}

const textBody = (value) => ({ Body: { transformToString: async () => JSON.stringify(value) } });

function serve(objects) {
  mockS3Send.mockImplementation(async (command) => {
    const answer = objects[command.input.Key];
    if (answer instanceof Error) throw answer;
    if (answer === undefined) throw s3Error("NoSuchKey");
    return answer;
  });
}

describe("dashboard review data", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    mockGetHeldPasses.mockReset();
    mockGetHeldPasses.mockResolvedValue({
      items: [
        {
          code: "tiger-happy-mountain-silver",
          passIssuedBy: "9f2c",
          useCount: 3,
          reviewLimit: 1000,
          createdAt: "2026-10-30T09:15:00.000Z",
        },
      ],
    });
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake";
    process.env.ENVIRONMENT_NAME = "prod";
  });

  afterEach(() => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.ENVIRONMENT_NAME;
  });

  test("returns the snapshot, the index, each image and the held passes", async () => {
    serve({
      "snapshots/prod/latest.json": textBody(SNAPSHOT),
      "snapshots/prod/console/index.json": textBody(INDEX),
      "snapshots/prod/console/prod/prod-lambda-errors.png": { Body: { transformToByteArray: async () => PNG } },
    });
    const data = await readReviewData();
    expect(data.snapshot).toEqual(SNAPSHOT);
    expect(data.consoleIndex).toEqual(INDEX);
    expect([...data.images.keys()]).toEqual(["prod-lambda-errors"]);
    expect(Buffer.isBuffer(data.images.get("prod-lambda-errors"))).toBe(true);
    expect(data.heldPasses).toEqual([
      { code: "tiger-happy-mountain-silver", issuedBy: "9f2c", useCount: 3, reviewLimit: 1000, heldAt: "2026-10-30T09:15:00.000Z" },
    ]);
  });

  test("the answer for the page adds console to the snapshot", async () => {
    expect(snapshotAnswer({ snapshot: SNAPSHOT, consoleIndex: INDEX })).toEqual({ ...SNAPSHOT, console: INDEX });
    expect(snapshotAnswer({ snapshot: SNAPSHOT, consoleIndex: null })).toEqual(SNAPSHOT);
    expect(snapshotAnswer({ snapshot: null, consoleIndex: INDEX })).toBeNull();
  });

  test("NoSuchKey on the snapshot gives null and reads nothing else from the lake", async () => {
    serve({});
    const data = await readReviewData();
    expect(data.snapshot).toBeNull();
    expect(data.consoleIndex).toBeNull();
    expect(data.images.size).toBe(0);
  });

  test("AccessDenied on the snapshot gives null", async () => {
    serve({ "snapshots/prod/latest.json": s3Error("AccessDenied") });
    expect((await readReviewData()).snapshot).toBeNull();
  });

  test("AccessDenied and NoSuchKey on an image give null for that image", async () => {
    const index = {
      items: {
        a: { id: "a", imageKey: "snapshots/prod/console/prod/a.png" },
        b: { id: "b", imageKey: "snapshots/prod/console/prod/b.png" },
      },
    };
    serve({
      "snapshots/prod/latest.json": textBody(SNAPSHOT),
      "snapshots/prod/console/index.json": textBody(index),
      "snapshots/prod/console/prod/a.png": s3Error("AccessDenied"),
    });
    const data = await readReviewData();
    expect(data.images.get("a")).toBeNull();
    expect(data.images.get("b")).toBeNull();
  });

  test("any other read error is thrown", async () => {
    serve({ "snapshots/prod/latest.json": s3Error("InternalError") });
    await expect(readReviewData()).rejects.toThrow("InternalError");
  });
});
