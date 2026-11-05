// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcSendPathFphQueue.test.js
// The header check queue is best effort: a customer's request to HMRC is never delayed or failed by it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

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
vi.mock("@app/data/dynamoDbHmrcApiRequestRepository.js", () => ({ putHmrcApiRequest: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@app/data/dynamoDbIntegrationCallRepository.js", () => ({ putIntegrationCall: vi.fn().mockResolvedValue(undefined) }));

import { sendToHmrc } from "@app/services/hmrcApi.js";
import { resetFraudPreventionHeaderCheckQueueForTest } from "@app/lib/fraudPreventionHeaderCheckQueue.js";

const PRODUCTION_URL = "https://api.service.hmrc.gov.uk/organisations/vat/123456789/obligations";
const SANDBOX_URL = "https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/obligations";
const HEADERS = {
  "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
  "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
  "Gov-Client-Device-ID": "0b5a9a52-4d6b-4a53-9a4b-3d5d9a3f1c11",
  "Gov-Client-Public-IP": "203.0.113.7",
  "Gov-Client-Public-IP-Timestamp": "2026-01-01T00:00:00.000Z",
  "Gov-Client-Public-Port": "51234",
  "Gov-Client-Screens": "width=1&height=1&scaling-factor=1&colour-depth=24",
  "Gov-Client-Timezone": "UTC+00:00",
  "Gov-Client-User-IDs": "cognito=abc",
  "Gov-Client-Window-Size": "width=1&height=1",
  "Gov-Vendor-Forwarded": "by=198.51.100.1&for=203.0.113.7",
  "Gov-Vendor-Product-Name": "diy-accounting-submit",
  "Gov-Vendor-Public-IP": "198.51.100.1",
  "Gov-Vendor-Version": "diy-accounting-submit=1.0.0",
};

function okResponse() {
  return { ok: true, status: 200, json: () => Promise.resolve({}), headers: { forEach: () => {} } };
}

describe("sendToHmrc header check queue", () => {
  let mockFetch;
  let consoleSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    resetFraudPreventionHeaderCheckQueueForTest();
    mockFetch = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", mockFetch);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
    process.env.HMRC_SANDBOX_BASE_URI = "https://test-api.service.hmrc.gov.uk";
    process.env.ENVIRONMENT_NAME = "prod";
    process.env.FPH_CHECK_QUEUE_URL = "https://sqs.eu-west-2.amazonaws.com/123456789012/queue";
    sqs.send.mockResolvedValue({});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.FPH_CHECK_QUEUE_URL;
  });

  it("queues the shape of a production request with the API template and no header value", async () => {
    await sendToHmrc(PRODUCTION_URL, { method: "GET", headers: HEADERS });
    await vi.waitFor(() => expect(sqs.send).toHaveBeenCalledTimes(1));
    const { MessageBody } = sqs.send.mock.calls[0][0].input;
    expect(JSON.parse(MessageBody).payload.api).toBe("GET /organisations/vat/{vrn}/obligations");
    expect(MessageBody).not.toContain("203.0.113.7");
    expect(MessageBody).not.toContain("cognito=abc");
  });

  it("queues the shape of a sandbox request once, however many requests share it", async () => {
    await sendToHmrc(SANDBOX_URL, { method: "GET", headers: HEADERS });
    await sendToHmrc(SANDBOX_URL, { method: "GET", headers: HEADERS });
    await vi.waitFor(() => expect(sqs.send).toHaveBeenCalledTimes(1));
  });

  it("queues nothing for a refused request or for a host that is not HMRC", async () => {
    const { "Gov-Client-Connection-Method": _removed, ...withoutMethod } = HEADERS;
    await expect(sendToHmrc(PRODUCTION_URL, { method: "GET", headers: withoutMethod })).rejects.toThrow();
    await sendToHmrc("http://localhost:9000/organisations/vat/123456789/obligations", { method: "GET", headers: HEADERS });
    await Promise.resolve();
    expect(sqs.send).not.toHaveBeenCalled();
  });

  it("returns the HMRC response when the queue never answers", async () => {
    sqs.send.mockReturnValue(new Promise(() => {}));
    const response = await sendToHmrc(PRODUCTION_URL, { method: "GET", headers: HEADERS });
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns the HMRC response when the queue send fails", async () => {
    sqs.send.mockRejectedValue(new Error("queue unavailable"));
    const response = await sendToHmrc(PRODUCTION_URL, { method: "GET", headers: HEADERS });
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(sqs.send).toHaveBeenCalled());
  });

  it("sends the HMRC request when no queue is configured", async () => {
    delete process.env.FPH_CHECK_QUEUE_URL;
    const response = await sendToHmrc(PRODUCTION_URL, { method: "GET", headers: HEADERS });
    expect(response.status).toBe(200);
    expect(sqs.send).not.toHaveBeenCalled();
  });
});
