// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, beforeEach, afterEach } from "vitest";

import { handler, flattenEnvelope, toParquetTimestamp } from "../../functions/analytics/activityEventTransform.js";

function encode(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value), "utf8").toString("base64");
}

function decode(data) {
  return Buffer.from(data, "base64").toString("utf8");
}

function envelope(detail, overrides = {}) {
  return {
    "version": "0",
    "id": "11111111-2222-3333-4444-555555555555",
    "detail-type": "ActivityEvent",
    "source": "diy.submit",
    "time": "2026-08-28T09:15:00Z",
    detail,
    ...overrides,
  };
}

const loginDetail = {
  event: "login",
  site: "submit",
  summary: "A user logged in",
  actor: "customer",
  flow: "user-journey",
  timestamp: "2026-08-28T09:14:58.123Z",
  requestId: "req-1",
  hashedSub: "abc123",
};

describe("activityEventTransform", () => {
  let originalEnvironmentName;

  beforeEach(() => {
    originalEnvironmentName = process.env.ENVIRONMENT_NAME;
    process.env.ENVIRONMENT_NAME = "ci";
  });

  afterEach(() => {
    if (originalEnvironmentName === undefined) {
      delete process.env.ENVIRONMENT_NAME;
    } else {
      process.env.ENVIRONMENT_NAME = originalEnvironmentName;
    }
  });

  test("emits one newline-terminated JSON object per envelope", async () => {
    const result = await handler({ records: [{ recordId: "r1", data: encode(envelope(loginDetail)) }] });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].recordId).toBe("r1");
    expect(result.records[0].result).toBe("Ok");

    const text = decode(result.records[0].data);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.trimEnd().includes("\n")).toBe(false);

    const row = JSON.parse(text);
    expect(row.event_id).toBe("11111111-2222-3333-4444-555555555555");
    expect(row.event_ts).toBe("2026-08-28 09:14:58.123");
    expect(row.ingest_ts).toBe("2026-08-28 09:15:00.000");
    expect(row.event).toBe("login");
    expect(row.site).toBe("submit");
    expect(row.actor).toBe("customer");
    expect(row.flow).toBe("user-journey");
    expect(row.request_id).toBe("req-1");
    expect(row.hashed_sub).toBe("abc123");
    expect(row.env).toBe("ci");
  });

  test("promotes outcome and failure from a failure event", async () => {
    const detail = {
      ...loginDetail,
      event: "vat-return-submitted",
      outcome: "failure",
      failure: "HMRC rejected the return",
      hmrcStatus: "400",
    };

    const result = await handler({ records: [{ recordId: "r1", data: encode(envelope(detail)) }] });
    const row = JSON.parse(decode(result.records[0].data));

    expect(row.outcome).toBe("failure");
    expect(row.failure).toBe("HMRC rejected the return");
    expect(row.hmrc_status).toBe("400");
  });

  test("leaves unpromoted columns null", async () => {
    const result = await handler({ records: [{ recordId: "r1", data: encode(envelope(loginDetail)) }] });
    const row = JSON.parse(decode(result.records[0].data));

    expect(row.outcome).toBeNull();
    expect(row.failure).toBeNull();
    expect(row.bundle_id).toBeNull();
    expect(row.subscription_id).toBeNull();
    expect(row.country).toBeNull();
  });

  test("round-trips the original detail into detail_json", async () => {
    const detail = { ...loginDetail, somethingNotYetPromoted: { nested: true, count: 3 } };
    const result = await handler({ records: [{ recordId: "r1", data: encode(envelope(detail)) }] });
    const row = JSON.parse(decode(result.records[0].data));

    expect(JSON.parse(row.detail_json)).toEqual(detail);
  });

  test("marks an unparseable record ProcessingFailed", async () => {
    const result = await handler({ records: [{ recordId: "r1", data: encode("this is not json") }] });

    expect(result.records[0].result).toBe("ProcessingFailed");
    expect(result.records[0].recordId).toBe("r1");
    expect(result.records[0].data).toBeUndefined();
  });

  test("keeps good records when one record in the batch fails", async () => {
    const result = await handler({
      records: [
        { recordId: "r1", data: encode(envelope(loginDetail)) },
        { recordId: "r2", data: encode("{ broken") },
        { recordId: "r3", data: encode(envelope(loginDetail)) },
      ],
    });

    expect(result.records.map((r) => r.result)).toEqual(["Ok", "ProcessingFailed", "Ok"]);
  });

  test("returns one record per input record in order", async () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      recordId: `r${i}`,
      data: encode(envelope({ ...loginDetail, summary: `event ${i}` })),
    }));

    const result = await handler({ records });

    expect(result.records).toHaveLength(100);
    expect(result.records.map((r) => r.recordId)).toEqual(records.map((r) => r.recordId));
    expect(result.records.every((r) => r.result === "Ok")).toBe(true);
  });

  test("flattens an envelope with no detail without throwing", () => {
    const row = flattenEnvelope({ id: "e1", time: "2026-08-28T09:15:00Z" });

    expect(row.event_id).toBe("e1");
    expect(row.event).toBeNull();
    expect(row.detail_json).toBe("{}");
  });

  test("emits event_ts and ingest_ts in the space-separated form the Parquet SerDe requires", async () => {
    const result = await handler({ records: [{ recordId: "r1", data: encode(envelope(loginDetail)) }] });
    const row = JSON.parse(decode(result.records[0].data));

    const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
    expect(row.event_ts).toMatch(timestampPattern);
    expect(row.ingest_ts).toMatch(timestampPattern);
  });

  test("toParquetTimestamp reformats ISO-8601 with and without milliseconds", () => {
    expect(toParquetTimestamp("2026-08-28T09:14:58.123Z")).toBe("2026-08-28 09:14:58.123");
    expect(toParquetTimestamp("2026-08-28T09:15:00Z")).toBe("2026-08-28 09:15:00.000");
  });

  test("toParquetTimestamp returns null for missing or unparseable input", () => {
    expect(toParquetTimestamp(undefined)).toBeNull();
    expect(toParquetTimestamp(null)).toBeNull();
    expect(toParquetTimestamp("not a timestamp")).toBeNull();
  });
});
