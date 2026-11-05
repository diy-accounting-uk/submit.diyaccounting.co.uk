// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/fraudPreventionHeaderCheckQueue.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sqs = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send(command) {
      return sqs.send(command);
    }
  },
  SendMessageCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  enqueueFraudPreventionHeaderCheck,
  resetFraudPreventionHeaderCheckQueueForTest,
} from "@app/lib/fraudPreventionHeaderCheckQueue.js";

const HEADERS = {
  "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
  "Gov-Client-Public-IP": "203.0.113.77",
  "Gov-Client-User-IDs": "cognito=customer-sub-abc",
  "Gov-Client-Device-ID": "0b5a9a52-4d6b-4a53-9a4b-3d5d9a3f1c11",
};
const API = "GET /organisations/vat/{vrn}/obligations";
const DAY_ONE = new Date("2026-11-05T10:00:00.000Z");
const DAY_TWO = new Date("2026-11-06T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  resetFraudPreventionHeaderCheckQueueForTest();
  process.env.FPH_CHECK_QUEUE_URL = "https://sqs.eu-west-2.amazonaws.com/123456789012/queue";
  sqs.send.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.FPH_CHECK_QUEUE_URL;
});

describe("enqueueFraudPreventionHeaderCheck", () => {
  it("sends one message for a new shape, with the shape and no header value", async () => {
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: HEADERS, now: DAY_ONE });
    expect(sqs.send).toHaveBeenCalledTimes(1);
    const { QueueUrl, MessageBody } = sqs.send.mock.calls[0][0].input;
    expect(QueueUrl).toBe(process.env.FPH_CHECK_QUEUE_URL);
    const body = JSON.parse(MessageBody);
    expect(body).toMatchObject({ userId: "fph-check", requestId: body.payload.shapeHash });
    expect(body.payload).toMatchObject({ api: API, firstSeenAt: DAY_ONE.toISOString() });
    expect(body.payload.shape.connectionMethod).toBe("WEB_APP_VIA_SERVER");
    for (const fragment of ["203.0.113.77", "customer-sub-abc", "0b5a9a52"]) {
      expect(MessageBody).not.toContain(fragment);
    }
  });

  it("sends nothing more for the same shape on the same day, whatever the values", async () => {
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: HEADERS, now: DAY_ONE });
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: { ...HEADERS, "Gov-Client-Public-IP": "198.51.100.5" }, now: DAY_ONE });
    expect(sqs.send).toHaveBeenCalledTimes(1);
  });

  it("sends again for the same shape on the next day", async () => {
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: HEADERS, now: DAY_ONE });
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: HEADERS, now: DAY_TWO });
    expect(sqs.send).toHaveBeenCalledTimes(2);
  });

  it("sends for a different shape", async () => {
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: HEADERS, now: DAY_ONE });
    const { "Gov-Client-Device-ID": _removed, ...other } = HEADERS;
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: other, now: DAY_ONE });
    expect(sqs.send).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when no queue is configured or the request has no connection method", async () => {
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: {}, now: DAY_ONE });
    delete process.env.FPH_CHECK_QUEUE_URL;
    await enqueueFraudPreventionHeaderCheck({ api: API, headers: HEADERS, now: DAY_ONE });
    expect(sqs.send).not.toHaveBeenCalled();
  });

  it("does not throw when the send fails", async () => {
    sqs.send.mockRejectedValue(new Error("queue unavailable"));
    await expect(enqueueFraudPreventionHeaderCheck({ api: API, headers: HEADERS, now: DAY_ONE })).resolves.toBeUndefined();
  });
});
