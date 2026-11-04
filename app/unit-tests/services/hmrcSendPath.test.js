// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcSendPath.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { HttpTimeoutError } from "@app/lib/httpFetch.js";
import { putHmrcApiRequest } from "@app/data/dynamoDbHmrcApiRequestRepository.js";
import { putIntegrationCall } from "@app/data/dynamoDbIntegrationCallRepository.js";
import { performTokenExchange } from "@app/lib/httpResponseHelper.js";
import { postToTransactionEngine } from "@app/services/hmrcTransactionEngine.js";
import {
  sendToHmrc,
  hmrcHttpGet,
  hmrcHttpPost,
  validateFraudPreventionHeaders,
  getFraudPreventionHeadersFeedback,
  HmrcTimeoutError,
  HmrcFraudPreventionHeadersMissingError,
  missingFraudPreventionHeaders,
} from "@app/services/hmrcApi.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

vi.mock("@app/data/dynamoDbHmrcApiRequestRepository.js", () => ({
  putHmrcApiRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/data/dynamoDbIntegrationCallRepository.js", () => ({
  putIntegrationCall: vi.fn().mockResolvedValue(undefined),
}));

const PRODUCTION_URL = "https://api.service.hmrc.gov.uk/organisations/vat/123456789/obligations";
const SANDBOX_URL = "https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/obligations";

const FULL_WEB_HEADERS = {
  "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
  "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
  "Gov-Client-Device-ID": "device-1",
  "Gov-Client-Public-IP": "203.0.113.7",
  "Gov-Client-Public-IP-Timestamp": "2026-01-01T00:00:00.000Z",
  "Gov-Client-Public-Port": "443",
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

function metricLines(consoleSpy) {
  return consoleSpy.mock.calls
    .map(([line]) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((line) => line?._aws);
}

function metricCount(consoleSpy, metricName) {
  return metricLines(consoleSpy).filter((line) => metricName in line).length;
}

describe("services/hmrcApi sendToHmrc", () => {
  let mockFetch;
  let consoleSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", mockFetch);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
    process.env.HMRC_SANDBOX_BASE_URI = "https://test-api.service.hmrc.gov.uk";
    process.env.ENVIRONMENT_NAME = "prod";
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("refuses a production request with no connection method and does not call fetch", async () => {
    const headers = { ...FULL_WEB_HEADERS };
    delete headers["Gov-Client-Connection-Method"];

    await expect(sendToHmrc(PRODUCTION_URL, { method: "GET", headers })).rejects.toBeInstanceOf(HmrcFraudPreventionHeadersMissingError);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(metricCount(consoleSpy, "HmrcFraudHeaderViolation")).toBe(1);
  });

  it("refuses a production request with no headers at all", async () => {
    await expect(sendToHmrc(PRODUCTION_URL, { method: "GET" })).rejects.toBeInstanceOf(HmrcFraudPreventionHeadersMissingError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a production request with the full set and counts a send but no violation", async () => {
    await sendToHmrc(PRODUCTION_URL, { method: "GET", headers: FULL_WEB_HEADERS });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(metricCount(consoleSpy, "HmrcSend")).toBe(1);
    expect(metricCount(consoleSpy, "HmrcFraudHeaderViolation")).toBe(0);
    const sendLine = metricLines(consoleSpy).find((line) => "HmrcSend" in line);
    expect(sendLine.Environment).toBe("prod");
    expect(sendLine.HmrcHost).toBe("production");
    expect(sendLine._aws.CloudWatchMetrics[0].Namespace).toBe("Submit/HmrcSend");
  });

  it("sends a production request that lacks one required header and counts a violation", async () => {
    const headers = { ...FULL_WEB_HEADERS };
    delete headers["Gov-Client-Device-ID"];

    await sendToHmrc(PRODUCTION_URL, { method: "POST", headers });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(metricCount(consoleSpy, "HmrcSend")).toBe(1);
    expect(metricCount(consoleSpy, "HmrcFraudHeaderViolation")).toBe(1);
  });

  it("sends a sandbox request with no connection method and counts a violation", async () => {
    await sendToHmrc(SANDBOX_URL, { method: "GET", headers: {} });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(metricCount(consoleSpy, "HmrcFraudHeaderViolation")).toBe(1);
    const sendLine = metricLines(consoleSpy).find((line) => "HmrcSend" in line);
    expect(sendLine.HmrcHost).toBe("sandbox");
  });

  it("matches header names in any case", async () => {
    const lowerCased = Object.fromEntries(Object.entries(FULL_WEB_HEADERS).map(([name, value]) => [name.toLowerCase(), value]));

    await sendToHmrc(PRODUCTION_URL, { method: "GET", headers: lowerCased });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(metricCount(consoleSpy, "HmrcFraudHeaderViolation")).toBe(0);
  });

  it("treats a header whose value is the text undefined as missing", () => {
    const { missing } = missingFraudPreventionHeaders({ ...FULL_WEB_HEADERS, "Gov-Client-Timezone": "undefined" });
    expect(missing).toEqual(["Gov-Client-Timezone"]);
  });

  it("does not require Multi-Factor or License-IDs", () => {
    const { missing } = missingFraudPreventionHeaders(FULL_WEB_HEADERS);
    expect(missing).toEqual([]);
  });

  it("asks a desktop app connection for fewer browser headers than a web app connection", () => {
    const { missing } = missingFraudPreventionHeaders({
      ...FULL_WEB_HEADERS,
      "Gov-Client-Connection-Method": "DESKTOP_APP_VIA_SERVER",
      "Gov-Client-Browser-JS-User-Agent": "",
      "Gov-Client-Screens": "",
    });
    expect(missing).toEqual([]);
  });

  it("sends the OAuth token path without the check or a metric", async () => {
    await sendToHmrc("https://api.service.hmrc.gov.uk/oauth/token", { method: "POST", headers: {} });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(metricLines(consoleSpy)).toHaveLength(0);
  });

  it("sends a request to a simulator host without the check or a metric", async () => {
    await sendToHmrc("http://localhost:9000/organisations/vat/123456789/obligations", { method: "GET", headers: {} });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(metricLines(consoleSpy)).toHaveLength(0);
  });

  it("does not put a VRN, a token or a header value in a metric line or the violation log", async () => {
    const headers = { "Authorization": "Bearer secret-token", "Gov-Client-User-IDs": "cognito=secret-sub" };

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    let everything;
    try {
      await sendToHmrc(SANDBOX_URL, { method: "GET", headers });
      everything = JSON.stringify([consoleSpy.mock.calls, stdoutSpy.mock.calls]);
    } finally {
      stdoutSpy.mockRestore();
    }

    expect(everything).not.toContain("123456789");
    expect(everything).not.toContain("secret-token");
    expect(everything).not.toContain("secret-sub");
    expect(everything).toContain("{vrn}");
  });
});

describe("services/hmrcApi audit and refusal through the HTTP functions", () => {
  let consoleSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.HMRC_BASE_URI = "https://api.service.hmrc.gov.uk";
    process.env.HMRC_SANDBOX_BASE_URI = "https://test-api.service.hmrc.gov.uk";
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("hmrcHttpGet writes an audit row before it throws on a timeout", async () => {
    const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(abort));

    await expect(hmrcHttpGet("/test/endpoint", {}, {}, undefined, "synthetic", {}, "user-sub-1")).rejects.toBeInstanceOf(HmrcTimeoutError);

    expect(putHmrcApiRequest).toHaveBeenCalledTimes(1);
    const [sub, record] = putHmrcApiRequest.mock.calls[0];
    expect(sub).toBe("user-sub-1");
    expect(record.httpResponse.body.name).toBe("AbortError");
  });

  it("hmrcHttpPost writes an audit row before it throws on a timeout", async () => {
    const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(abort));

    await expect(
      hmrcHttpPost("https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/returns", {}, {}, { a: 1 }, "user-sub-2"),
    ).rejects.toBeInstanceOf(HmrcTimeoutError);

    expect(putHmrcApiRequest).toHaveBeenCalledTimes(1);
    expect(putHmrcApiRequest.mock.calls[0][0]).toBe("user-sub-2");
  });

  it("hmrcHttpGet audits a refusal and throws without calling fetch", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      hmrcHttpGet("/organisations/vat/123456789/obligations", {}, {}, undefined, "live", {}, "user-sub-3"),
    ).rejects.toBeInstanceOf(HmrcFraudPreventionHeadersMissingError);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(putHmrcApiRequest).toHaveBeenCalledTimes(1);
    expect(putHmrcApiRequest.mock.calls[0][1].httpResponse.body.name).toBe("HmrcFraudPreventionHeadersMissingError");
  });
});

describe("outbound call records for HMRC", () => {
  const TIMEOUT = Object.assign(new Error("aborted"), { name: "AbortError" });

  function recordedItem() {
    expect(putIntegrationCall).toHaveBeenCalledTimes(1);
    return putIntegrationCall.mock.calls[0][0];
  }

  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HMRC_TRANSACTION_ENGINE_URL;
    mockFetch = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records a production response as live, with no VRN and a passing header result", async () => {
    await sendToHmrc(`${PRODUCTION_URL}?from=2026-01-01`, { method: "GET", headers: FULL_WEB_HEADERS });

    const item = recordedItem();
    expect(item).toMatchObject({
      pk: expect.stringMatching(/^call#hmrc#/),
      org: "hmrc",
      target: "live",
      api: "GET /organisations/vat/{vrn}/obligations",
      outcome: "response",
      status: 200,
      fph: { rules: "pass", rulesFailed: [] },
    });
    expect(JSON.stringify(item)).not.toContain("123456789");
    expect(JSON.stringify(item)).not.toContain("203.0.113.7");
  });

  it("records a sandbox response as test", async () => {
    await sendToHmrc(SANDBOX_URL, { method: "GET", headers: FULL_WEB_HEADERS });

    expect(recordedItem().target).toBe("test");
  });

  it("records a simulator call as test, with no header result", async () => {
    await sendToHmrc("http://localhost:9000/organisations/vat/123456789/obligations", { method: "GET", headers: {} });

    expect(recordedItem().target).toBe("test");
    expect(recordedItem().fph).toBeUndefined();
  });

  it("names each missing header in the header result, and still sends", async () => {
    const headers = { ...FULL_WEB_HEADERS };
    delete headers["Gov-Client-Device-ID"];

    await sendToHmrc(PRODUCTION_URL, { method: "GET", headers });

    expect(recordedItem().fph).toEqual({ rules: "fail", rulesFailed: ["Gov-Client-Device-ID:missing"] });
  });

  it("records a timeout and rethrows it", async () => {
    mockFetch.mockRejectedValue(TIMEOUT);

    await expect(sendToHmrc(PRODUCTION_URL, { method: "GET", headers: FULL_WEB_HEADERS })).rejects.toBe(TIMEOUT);

    expect(recordedItem()).toMatchObject({ outcome: "timeout", statusLabel: "timeout" });
  });

  it("records a network error and rethrows it", async () => {
    const error = new TypeError("fetch failed");
    mockFetch.mockRejectedValue(error);

    await expect(sendToHmrc(PRODUCTION_URL, { method: "GET", headers: FULL_WEB_HEADERS })).rejects.toBe(error);

    expect(recordedItem()).toMatchObject({ outcome: "network-error", statusLabel: "network-error" });
  });

  it("records a refusal and sends nothing", async () => {
    await expect(sendToHmrc(PRODUCTION_URL, { method: "POST", headers: {} })).rejects.toBeInstanceOf(
      HmrcFraudPreventionHeadersMissingError,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    const item = recordedItem();
    expect(item).toMatchObject({ outcome: "refused", statusLabel: "refused", target: "live", method: "POST", durationMs: 0 });
    expect(item.fph).toEqual({ rules: "fail", rulesFailed: ["Gov-Client-Connection-Method:missing"] });
  });

  it("returns HMRC's response when the record write fails", async () => {
    putIntegrationCall.mockRejectedValueOnce(new Error("table missing"));

    const response = await sendToHmrc(PRODUCTION_URL, { method: "GET", headers: FULL_WEB_HEADERS });

    expect(response.status).toBe(200);
  });

  it("still throws the refusal when the record write fails", async () => {
    putIntegrationCall.mockRejectedValueOnce(new Error("table missing"));

    await expect(sendToHmrc(PRODUCTION_URL, { method: "GET", headers: {} })).rejects.toBeInstanceOf(HmrcFraudPreventionHeadersMissingError);
  });

  it("records the header validator with no header result", async () => {
    await validateFraudPreventionHeaders("token", FULL_WEB_HEADERS, "user-sub");

    const item = recordedItem();
    expect(item).toMatchObject({ target: "test", api: "GET /test/fraud-prevention-headers/validate", status: 200 });
    expect(item.fph).toBeUndefined();
  });

  it("records the header feedback call with no header result", async () => {
    await getFraudPreventionHeadersFeedback("vat-mtd", "token", "user-sub");

    const item = recordedItem();
    expect(item).toMatchObject({ target: "test", api: "GET /test/fraud-prevention-headers/vat-mtd/validation-feedback", status: 200 });
    expect(item.fph).toBeUndefined();
  });

  it("records an HMRC token exchange, with no token or secret in the record", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ access_token: "token-value", expires_in: 14400 }), { status: 200 }));

    const { accessToken } = await performTokenExchange(
      "https://api.service.hmrc.gov.uk/oauth/token",
      { grant_type: "authorization_code", code: "code-value", client_secret: "secret-value" },
      "user-sub",
      { org: "hmrc" },
    );

    expect(accessToken).toBe("token-value");
    const item = recordedItem();
    expect(item).toMatchObject({ org: "hmrc", target: "live", api: "POST /oauth/token", status: 200 });
    expect(item.raw.responseBody).toEqual({ access_token: "string", expires_in: "number" });
    for (const value of ["token-value", "code-value", "secret-value"]) expect(JSON.stringify(item)).not.toContain(value);
  });

  it("records a sandbox token exchange as test", async () => {
    await performTokenExchange("https://test-api.service.hmrc.gov.uk/oauth/token", { code: "x" }, "user-sub", { org: "hmrc" });

    expect(recordedItem().target).toBe("test");
  });

  it("writes no record for a token exchange that names no organisation", async () => {
    await performTokenExchange("https://auth.example/oauth2/token", { code: "x" }, "user-sub");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(putIntegrationCall).not.toHaveBeenCalled();
  });

  describe("transaction engine", () => {
    const LIVE_URL = "https://transaction-engine.tax.service.gov.uk/submission";
    const request = (gatewayTest) =>
      `<GovTalkMessage><Header><MessageDetails><Class>HMRC-CT-CT600</Class><TransactionID>TX1</TransactionID>${gatewayTest}</MessageDetails>` +
      `<SenderDetails><IDAuthentication><SenderID>gateway-user</SenderID></IDAuthentication></SenderDetails></Header></GovTalkMessage>`;
    const ERROR_REPLY =
      "<GovTalkMessage><GovTalkDetails><GovTalkErrors><Error><Number>1046</Number></Error></GovTalkErrors></GovTalkDetails></GovTalkMessage>";

    it("records a live message by class, with the error number from an HTTP 200, and returns the body", async () => {
      mockFetch.mockResolvedValue(new Response(ERROR_REPLY, { status: 200 }));

      const result = await postToTransactionEngine(LIVE_URL, request(""));

      expect(result).toMatchObject({ ok: true, status: 200, data: ERROR_REPLY });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      const item = recordedItem();
      expect(item).toMatchObject({ target: "live", api: "TE HMRC-CT-CT600", status: 200, appCode: "1046" });
      expect(item.raw.requestBody).toMatchObject({ messageClass: "HMRC-CT-CT600", transactionId: "TX1" });
      expect(JSON.stringify(item)).not.toContain("gateway-user");
    });

    it("records a GatewayTest message as test", async () => {
      await postToTransactionEngine(LIVE_URL, request("<GatewayTest>1</GatewayTest>"));

      expect(recordedItem().target).toBe("test");
    });

    it("records a simulator call as test", async () => {
      process.env.HMRC_TRANSACTION_ENGINE_URL = "http://localhost:9000/submission";

      await postToTransactionEngine("http://localhost:9000/submission", request(""));

      expect(recordedItem().target).toBe("test");
    });

    it("records a timeout and rethrows the timeout error", async () => {
      mockFetch.mockRejectedValue(TIMEOUT);

      await expect(postToTransactionEngine(LIVE_URL, request(""))).rejects.toBeInstanceOf(HttpTimeoutError);

      expect(recordedItem().outcome).toBe("timeout");
    });
  });
});
