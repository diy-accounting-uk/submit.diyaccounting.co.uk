// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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

const { handler, resolveTableKind, resolveTableName, projectFields, buildRow } =
  await import("../../functions/analytics/dynamoStreamToFirehose.js");
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
    expect(resolveTableKind("ci-env-commissions")).toBe("commissions");
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
      actor: "customer",
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
      actor: "customer",
      acq_utm_source: null,
      acq_utm_medium: null,
      acq_utm_campaign: null,
      acq_utm_content: null,
      acq_utm_term: null,
      acq_gclid: null,
      acq_msclkid: null,
      acq_ref: null,
      acq_landed_at: null,
    });
    expect(Object.values(row)).not.toContain("cus_probe");
    expect(Object.values(row)).not.toContain(999);
  });

  test("bundles: flattens the acquisition map to acq_ columns and drops unknown acquisition keys", () => {
    const image = {
      hashedSub: "hash-3",
      bundleId: "resident-vat",
      acquisition: {
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "vat-brand",
        utmContent: "ad-1",
        utmTerm: "vat software",
        gclid: "g123",
        msclkid: "m456",
        ref: "friend",
        landedAt: "2026-09-01T10:00:00.000Z",
        email: "leak@example.com",
      },
    };
    const row = projectFields("bundles", image, null, "INSERT");
    expect(row).toMatchObject({
      acq_utm_source: "google",
      acq_utm_medium: "cpc",
      acq_utm_campaign: "vat-brand",
      acq_utm_content: "ad-1",
      acq_utm_term: "vat software",
      acq_gclid: "g123",
      acq_msclkid: "m456",
      acq_ref: "friend",
      acq_landed_at: "2026-09-01T10:00:00.000Z",
    });
    expect(Object.values(row)).not.toContain("leak@example.com");
  });

  test("bundles: actor is null when the item carries none", () => {
    const image = {
      hashedSub: "hash-2b",
      bundleId: "resident-pro",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiry: "2026-02-01T00:00:00.000Z",
      ttl: 1800000000,
    };
    const row = projectFields("bundles", image, null, "INSERT");
    expect(row.actor).toBeNull();
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
      actor: null,
    });
    expect(Object.values(row)).not.toContain("cus_probe");
  });

  test("subscriptions: carries the actor stored on the record at checkout", () => {
    const image = {
      pk: "stripe#sub_456",
      hashedSub: "hash-4",
      bundleId: "resident-vat",
      status: "active",
      currentPeriodEnd: "2026-03-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      actor: "test-user",
    };
    const row = projectFields("subscriptions", image, null, "MODIFY");
    expect(row.actor).toBe("test-user");
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
      actor: "customer",
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
      actor: "customer",
      redeemed_by: null,
      redeemed_at: null,
      redemption_code: null,
    });
    expect(Object.values(row)).not.toContain("pass#SECRET-CODE-1");
    expect(Object.values(row)).not.toContain("should never appear");
  });

  test("passes: a redemption item projects the code, the redeemer, the issuer and the pass type", () => {
    const image = {
      pk: "redemption#tiger-happy-mountain-silver#hash-redeemer",
      code: "tiger-happy-mountain-silver",
      redeemedBy: "hash-redeemer",
      issuedBy: "hash-issuer",
      passTypeId: "digital-pass",
      redeemedAt: "2026-01-03T00:00:00.000Z",
    };
    const row = projectFields("passes", image, null, "INSERT");
    expect(row).toMatchObject({
      pass_type_id: "digital-pass",
      issued_by: "hash-issuer",
      redeemed_by: "hash-redeemer",
      redeemed_at: "2026-01-03T00:00:00.000Z",
      redemption_code: "tiger-happy-mountain-silver",
    });
  });

  test("passes: a pass item never projects its code", () => {
    const row = projectFields("passes", { pk: "pass#secret-code", code: "secret-code", passTypeId: "digital-pass" }, null, "INSERT");
    expect(row.redemption_code).toBeNull();
    expect(Object.values(row)).not.toContain("secret-code");
  });

  test("commissions: a ledger line projects its whitelisted fields and nothing else", () => {
    const image = {
      pk: "commission#referrer-hash",
      sk: "line#in_1",
      invoiceId: "in_1",
      chargeId: "ch_1",
      subscriptionId: "sub_1",
      redeemerHash: "redeemer-hash",
      referralCode: "CODE1",
      tier: "customer",
      form: "credit",
      payout: "customer-balance",
      rateBps: 3000,
      grossPence: 1200,
      feePence: 40,
      netPence: 1160,
      amountPence: 348,
      currency: "gbp",
      eligibleMonths: 1,
      lineMonths: 1,
      state: "held",
      holdReasons: ["volume", "card_shared"],
      chargedAt: "2026-10-01T00:00:00.000Z",
      releaseAt: "2026-10-31T00:00:00.000Z",
      livemode: true,
      cardFingerprint: "fp_secret",
      customerCreatedAt: "2026-09-01T00:00:00.000Z",
      redeemedAt: "2026-09-02T00:00:00.000Z",
    };
    const row = projectFields("commissions", image, null, "INSERT");
    expect(row.referrer_hash).toBe("referrer-hash");
    expect(row.line_id).toBe("line#in_1");
    expect(row.amount_pence).toBe(348);
    expect(row.net_pence).toBe(1160);
    expect(row.hold_reasons).toBe("volume,card_shared");
    expect(row.payable_at).toBeNull();
    expect(row.livemode).toBe(true);
    expect(Object.values(row)).not.toContain("fp_secret");
    expect(Object.keys(row)).not.toContain("card_fingerprint");
    expect(Object.keys(row)).not.toContain("redeemed_at");
  });

  test("commissions: a line with no hold reasons projects hold_reasons as null", () => {
    const row = projectFields("commissions", { pk: "commission#r", sk: "line#in_2", holdReasons: [] }, null, "MODIFY");
    expect(row.hold_reasons).toBeNull();
  });

  test.each([
    ["anchor", { pk: "commission#r", sk: "redeemer#x" }],
    ["conversion counter", { pk: "commission#r", sk: "conversions#CODE#2026-10-01", conversions: 2 }],
    ["cap totals", { pk: "commission#r", sk: "totals#credit", creditPence: 100 }],
    ["held pointer", { pk: "held", sk: "2026-10-31T00:00:00.000Z#r#in_1" }],
    ["charge pointer", { pk: "charge#ch_1", sk: "line" }],
    ["card payer", { pk: "card#fp", sk: "payer#h" }],
  ])("commissions: a %s item projects to null", (_name, image) => {
    expect(projectFields("commissions", image, null, "INSERT")).toBeNull();
  });

  test("a REMOVE event projects from OldImage, not NewImage", () => {
    const oldImage = { hashedSub: "hash-old", bundleId: "resident-pro", createdAt: "t1", expiry: "t2", ttl: 1 };
    const newImage = { hashedSub: "hash-new", bundleId: "should-not-be-used" };
    const row = projectFields("bundles", newImage, oldImage, "REMOVE");
    expect(row.hashed_sub).toBe("hash-old");
    expect(row.bundle_id).toBe("resident-pro");
  });

  test("an unrecognised table kind throws rather than passing the image through", () => {
    expect(() => projectFields("hmrc-api-requests", { anything: "here" }, null, "INSERT")).toThrow(/no redaction whitelist/i);
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

describe("buildRow for commissions", () => {
  test("returns null for an item that is not a ledger line", () => {
    const record = streamRecord({
      tableName: "ci-env-commissions",
      eventName: "INSERT",
      sequenceNumber: "1",
      newImage: { pk: marshalledString("held"), sk: marshalledString("2026-10-31T00:00:00.000Z#r#in_1") },
    });
    expect(buildRow("commissions", record)).toBeNull();
  });

  test("returns a stamped row for a ledger line", () => {
    const record = streamRecord({
      tableName: "ci-env-commissions",
      eventName: "INSERT",
      sequenceNumber: "2",
      newImage: {
        pk: marshalledString("commission#r1"),
        sk: marshalledString("line#in_1"),
        amountPence: marshalledNumber(348),
      },
    });
    const row = buildRow("commissions", record);
    expect(row.source_table).toBe("commissions");
    expect(row.referrer_hash).toBe("r1");
    expect(row.amount_pence).toBe(348);
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

  test("commission pointer and anchor items are skipped without a batch failure or a delivery", async () => {
    process.env.STREAM_TARGETS = JSON.stringify({ "ci-env-commissions": "ci-env-stream-commissions" });

    const event = {
      Records: [
        streamRecord({
          tableName: "ci-env-commissions",
          eventName: "INSERT",
          sequenceNumber: "30",
          newImage: { pk: marshalledString("held"), sk: marshalledString("2026-10-31T00:00:00.000Z#r#in_1") },
        }),
        streamRecord({
          tableName: "ci-env-commissions",
          eventName: "INSERT",
          sequenceNumber: "31",
          newImage: { pk: marshalledString("commission#r"), sk: marshalledString("redeemer#x") },
        }),
      ],
    };

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([]);
    expect(mockFirehoseSend).not.toHaveBeenCalled();
  });

  test("a commission ledger line is delivered to the commissions stream", async () => {
    process.env.STREAM_TARGETS = JSON.stringify({ "ci-env-commissions": "ci-env-stream-commissions" });

    const event = {
      Records: [
        streamRecord({
          tableName: "ci-env-commissions",
          eventName: "INSERT",
          sequenceNumber: "32",
          newImage: { pk: marshalledString("commission#r"), sk: marshalledString("line#in_1") },
        }),
      ],
    };

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([]);
    expect(mockFirehoseSend).toHaveBeenCalledTimes(1);
    expect(mockFirehoseSend.mock.calls[0][0].input.DeliveryStreamName).toBe("ci-env-stream-commissions");
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
