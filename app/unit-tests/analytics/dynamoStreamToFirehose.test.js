// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const mockFirehoseSend = vi.fn();

vi.mock("@aws-sdk/client-firehose", () => {
  class FirehoseClient {
    send(command) {
      return mockFirehoseSend(command);
    }
  }
  class PutRecordBatchCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { FirehoseClient, PutRecordBatchCommand };
});

vi.mock("../../services/subHasher.js", () => ({
  initializeSalt: vi.fn().mockResolvedValue(undefined),
  hashSub: vi.fn((value) => `hashed(${value})`),
}));

const {
  handler,
  resolveTableKind,
  resolveTableName,
  projectFields,
  buildRow,
} = await import("../../functions/analytics/dynamoStreamToFirehose.js");
const { hashSub } = await import("../../services/subHasher.js");

function streamArn(tableName) {
  return `arn:aws:dynamodb:eu-west-2:111111111111:table/${tableName}/stream/2026-01-01T00:00:00.000`;
}

function marshalledString(value) {
  return { S: value };
}

function marshalledNumber(value) {
  return { N: String(value) };
}

function streamRecord({ tableName, eventName, sequenceNumber, newImage, oldImage, approximateCreationDateTime }) {
  return {
    eventName,
    eventSourceARN: streamArn(tableName),
    dynamodb: {
      SequenceNumber: sequenceNumber,
      ApproximateCreationDateTime: approximateCreationDateTime ?? 1798000000,
      ...(newImage ? { NewImage: newImage } : {}),
      ...(oldImage ? { OldImage: oldImage } : {}),
    },
  };
}

describe("resolveTableKind", () => {
  test("matches each known table suffix", () => {
    expect(resolveTableKind("ci-env-receipts")).toBe("receipts");
    expect(resolveTableKind("ci-env-bundles")).toBe("bundles");
    expect(resolveTableKind("ci-env-subscriptions")).toBe("subscriptions");
    expect(resolveTableKind("ci-env-passes")).toBe("passes");
  });

  test("throws rather than passing an unrecognised table through", () => {
    expect(() => resolveTableKind("ci-env-hmrc-api-requests")).toThrow(/no redaction whitelist/i);
  });
});

describe("resolveTableName", () => {
  test("extracts the table name from a DynamoDB Streams event source ARN", () => {
    expect(resolveTableName(streamArn("ci-env-bundles"))).toBe("ci-env-bundles");
  });

  test("throws on an ARN it cannot parse", () => {
    expect(() => resolveTableName("not-an-arn")).toThrow();
  });
});

describe("projectFields whitelists", () => {
  test("receipts: keeps exactly the whitelisted fields and drops a probe field", () => {
    const image = {
      hashedSub: "hash-1",
      receiptId: "2026-01-01T00:00:00.000Z-FB123",
      createdAt: "2026-01-01T00:00:00.000Z",
      actor: "customer",
      receipt: { formBundleNumber: "FB123", processingDate: "2026-01-01T00:00:01.000Z", chargeRefNumber: "CR1" },
      probeField: "should never appear",
    };
    const row = projectFields("receipts", image, null, "INSERT");
    expect(row).toEqual({
      hashed_sub: "hash-1",
      receipt_id: "2026-01-01T00:00:00.000Z-FB123",
      created_at: "2026-01-01T00:00:00.000Z",
      actor: "customer",
      form_bundle_number: "FB123",
      processing_date: "2026-01-01T00:00:01.000Z",
      charge_ref_number: "CR1",
    });
    expect(Object.values(row)).not.toContain("should never appear");
  });

  test("bundles: keeps exactly the whitelisted fields and drops a probe field", () => {
    const image = {
      hashedSub: "hash-2",
      bundleId: "resident-pro",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiry: "2026-02-01T00:00:00.000Z",
      ttl: 1800000000,
      stripeCustomerId: "cus_probe",
      tokensGranted: 999,
    };
    const row = projectFields("bundles", image, null, "MODIFY");
    expect(row).toEqual({
      hashed_sub: "hash-2",
      bundle_id: "resident-pro",
      granted_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-02-01T00:00:00.000Z",
      ttl: 1800000000,
    });
    expect(Object.values(row)).not.toContain("cus_probe");
    expect(Object.values(row)).not.toContain(999);
  });

  test("subscriptions: derives subscription_id from pk and drops the Stripe customer id", () => {
    const image = {
      pk: "stripe#sub_123",
      hashedSub: "hash-3",
      bundleId: "resident-pro",
      status: "active",
      currentPeriodEnd: "2026-02-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      stripeCustomerId: "cus_probe",
    };
    const row = projectFields("subscriptions", image, null, "INSERT");
    expect(row).toEqual({
      hashed_sub: "hash-3",
      bundle_id: "resident-pro",
      subscription_id: "sub_123",
      status: "active",
      current_period_end: "2026-02-01T00:00:00.000Z",
      cancel_at_period_end: false,
    });
    expect(Object.values(row)).not.toContain("cus_probe");
  });

  test("passes: hashes the redemption code pk rather than passing it through raw", () => {
    const image = {
      pk: "pass#SECRET-CODE-1",
      passTypeId: "trial-30d",
      bundleId: "trial",
      issuedBy: "hash-admin",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      useCount: 1,
      revokedAt: null,
      notes: "should never appear",
    };
    const row = projectFields("passes", image, null, "MODIFY");
    expect(row.pass_id).toBe(hashSub("pass#SECRET-CODE-1"));
    expect(row).toEqual({
      pass_id: "hashed(pass#SECRET-CODE-1)",
      pass_type_id: "trial-30d",
      bundle_id: "trial",
      issued_by: "hash-admin",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      use_count: 1,
      revoked_at: null,
    });
    expect(Object.values(row)).not.toContain("pass#SECRET-CODE-1");
    expect(Object.values(row)).not.toContain("should never appear");
  });

  test("a REMOVE event projects from OldImage, not NewImage", () => {
    const oldImage = { hashedSub: "hash-old", bundleId: "resident-pro", createdAt: "t1", expiry: "t2", ttl: 1 };
    const newImage = { hashedSub: "hash-new", bundleId: "should-not-be-used" };
    const row = projectFields("bundles", newImage, oldImage, "REMOVE");
    expect(row.hashed_sub).toBe("hash-old");
    expect(row.bundle_id).toBe("resident-pro");
  });

  test("an unrecognised table kind throws rather than passing the image through", () => {
    expect(() => projectFields("hmrc-api-requests", { anything: "here" }, null, "INSERT")).toThrow(
      /no redaction whitelist/i,
    );
  });

  test("a raw sub never appears in any projected field", () => {
    const rawSub = "auth0|raw-sub-should-never-leak";
    const rows = [
      projectFields("receipts", { hashedSub: "h", receiptId: "r", sub: rawSub }, null, "INSERT"),
      projectFields("bundles", { hashedSub: "h", bundleId: "b", sub: rawSub }, null, "INSERT"),
      projectFields("subscriptions", { pk: "stripe#s", hashedSub: "h", sub: rawSub }, null, "INSERT"),
      projectFields("passes", { pk: "pass#code", issuedBy: "h", sub: rawSub }, null, "INSERT"),
    ];
    for (const row of rows) {
      expect(Object.values(row)).not.toContain(rawSub);
    }
  });
});

describe("buildRow", () => {
  test("formats change_ts as a Parquet-friendly timestamp and stamps change metadata", () => {
    const record = streamRecord({
      tableName: "ci-env-bundles",
      eventName: "INSERT",
      sequenceNumber: "1",
      newImage: {
        hashedSub: marshalledString("hash-1"),
        bundleId: marshalledString("resident-pro"),
        createdAt: marshalledString("2026-01-01T00:00:00.000Z"),
        expiry: marshalledString("2026-02-01T00:00:00.000Z"),
        ttl: marshalledNumber(1800000000),
      },
      approximateCreationDateTime: 1798000000,
    });
    const originalEnv = process.env.ENVIRONMENT_NAME;
    process.env.ENVIRONMENT_NAME = "ci";
    try {
      const row = buildRow("bundles", record);
      expect(row.change_type).toBe("INSERT");
      expect(row.source_table).toBe("bundles");
      expect(row.env).toBe("ci");
      expect(row.change_ts).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
      expect(row.bundle_id).toBe("resident-pro");
    } finally {
      if (originalEnv === undefined) delete process.env.ENVIRONMENT_NAME;
      else process.env.ENVIRONMENT_NAME = originalEnv;
    }
  });
});

describe("handler", () => {
  beforeEach(() => {
    mockFirehoseSend.mockReset();
    mockFirehoseSend.mockResolvedValue({ FailedPutCount: 0, RequestResponses: [] });
  });

  afterEach(() => {
    delete process.env.STREAM_TARGETS;
  });

  test("routes INSERT/MODIFY/REMOVE records to the delivery stream named for their table", async () => {
    process.env.STREAM_TARGETS = JSON.stringify({
      "ci-env-bundles": "ci-env-stream-bundles",
      "ci-env-receipts": "ci-env-stream-receipts",
    });

    const event = {
      Records: [
        streamRecord({
          tableName: "ci-env-bundles",
          eventName: "INSERT",
          sequenceNumber: "1",
          newImage: { hashedSub: marshalledString("h1"), bundleId: marshalledString("b1") },
        }),
        streamRecord({
          tableName: "ci-env-receipts",
          eventName: "REMOVE",
          sequenceNumber: "2",
          oldImage: { hashedSub: marshalledString("h2"), receiptId: marshalledString("r2") },
        }),
      ],
    };

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([]);
    expect(mockFirehoseSend).toHaveBeenCalledTimes(2);
    const deliveryStreamNames = mockFirehoseSend.mock.calls.map((call) => call[0].input.DeliveryStreamName);
    expect(deliveryStreamNames.sort()).toEqual(["ci-env-stream-bundles", "ci-env-stream-receipts"]);
  });

  test("returns batchItemFailures for records Firehose partially rejects", async () => {
    process.env.STREAM_TARGETS = JSON.stringify({ "ci-env-bundles": "ci-env-stream-bundles" });
    mockFirehoseSend.mockResolvedValue({
      FailedPutCount: 1,
      RequestResponses: [{ ErrorCode: "ServiceUnavailable" }, {}],
    });

    const event = {
      Records: [
        streamRecord({
          tableName: "ci-env-bundles",
          eventName: "INSERT",
          sequenceNumber: "10",
          newImage: { hashedSub: marshalledString("h1"), bundleId: marshalledString("b1") },
        }),
        streamRecord({
          tableName: "ci-env-bundles",
          eventName: "INSERT",
          sequenceNumber: "11",
          newImage: { hashedSub: marshalledString("h2"), bundleId: marshalledString("b2") },
        }),
      ],
    };

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "10" }]);
  });

  test("a record for an unconfigured table reports itself as a batch item failure", async () => {
    process.env.STREAM_TARGETS = JSON.stringify({});

    const event = {
      Records: [
        streamRecord({
          tableName: "ci-env-bundles",
          eventName: "INSERT",
          sequenceNumber: "20",
          newImage: { hashedSub: marshalledString("h1"), bundleId: marshalledString("b1") },
        }),
      ],
    };

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "20" }]);
    expect(mockFirehoseSend).not.toHaveBeenCalled();
  });
});
