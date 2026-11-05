// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcFphCheckWorker.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const repository = vi.hoisted(() => ({
  getFphCheckResult: vi.fn(),
  putFphCheckResultOnce: vi.fn(),
}));
const http = vi.hoisted(() => ({ fetchWithTimeout: vi.fn(), recordedFetch: vi.fn() }));
const secret = vi.hoisted(() => ({ readSecret: vi.fn(), refreshAfterAuthFailure: vi.fn() }));
const dnsMock = vi.hoisted(() => ({ resolve4: vi.fn() }));
const metrics = vi.hoisted(() => ({ emitMetric: vi.fn() }));

vi.mock("@app/data/dynamoDbIntegrationCallRepository.js", () => repository);
vi.mock("@app/lib/httpFetch.js", () => ({ fetchWithTimeout: http.fetchWithTimeout }));
vi.mock("@app/lib/integrationCalls.js", () => ({ recordedFetch: http.recordedFetch }));
vi.mock("@app/lib/cachedSecret.js", () => secret);
vi.mock("@app/lib/emfMetrics.js", () => metrics);
vi.mock("@app/lib/buildFraudHeaders.js", () => ({ detectVendorPublicIp: vi.fn().mockResolvedValue("198.51.100.20") }));
vi.mock("@app/services/subHasher.js", () => ({ initializeSalt: vi.fn().mockResolvedValue(undefined) }));
vi.mock("node:dns/promises", () => ({ default: dnsMock }));

import {
  checkShape,
  resultOfValidateAnswer,
  sandboxAccessToken,
  resetSandboxAccessTokenForTest,
  workerHandler,
} from "@app/functions/hmrc/hmrcFphCheckWorker.js";
import { fraudPreventionHeaderShape } from "@app/lib/fraudPreventionHeaderShape.js";
import { validateFraudHeaders } from "@app/http-simulator/routes/fraud-headers.js";

const CUSTOMER_HEADERS = {
  "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
  "Gov-Client-Device-ID": "0b5a9a52-4d6b-4a53-9a4b-3d5d9a3f1c11",
  "Gov-Client-Public-IP": "203.0.113.77",
  "Gov-Client-Public-IP-Timestamp": "2026-01-01T00:00:00.000Z",
  "Gov-Client-Public-Port": "40123",
  "Gov-Client-User-IDs": "cognito=customer-sub-abc",
  "Gov-Vendor-Public-IP": "198.51.100.9",
  "Gov-Vendor-Forwarded": "by=198.51.100.9&for=203.0.113.77",
};
const { shapeHash, shape } = fraudPreventionHeaderShape(CUSTOMER_HEADERS);
const MESSAGE = { shapeHash, api: "POST /organisations/vat/{vrn}/returns", shape };
const NOW = new Date("2026-11-05T10:00:00.000Z");

function stubToken() {
  http.fetchWithTimeout.mockResolvedValue({
    response: { ok: true, status: 200, json: async () => ({ access_token: "token-1", expires_in: 14400 }) },
  });
}

function stubValidate(status, body) {
  http.recordedFetch.mockResolvedValue({ status, json: async () => body });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSandboxAccessTokenForTest();
  process.env.HMRC_SANDBOX_BASE_URI = "https://test-api.service.hmrc.gov.uk";
  process.env.HMRC_SANDBOX_CLIENT_ID = "client-id";
  process.env.HMRC_SANDBOX_CLIENT_SECRET = "client-secret";
  process.env.INTEGRATION_CALLS_DYNAMODB_TABLE_NAME = "table";
  process.env.DIY_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
  process.env.ENVIRONMENT_NAME = "test";
  repository.getFphCheckResult.mockResolvedValue(undefined);
  repository.putFphCheckResultOnce.mockResolvedValue(true);
  dnsMock.resolve4.mockResolvedValue(["198.51.100.30"]);
  stubToken();
});

afterEach(() => {
  delete process.env.HMRC_SANDBOX_CLIENT_SECRET;
});

describe("resultOfValidateAnswer", () => {
  it("maps VALID_HEADERS to pass", () => {
    expect(resultOfValidateAnswer(200, { specVersion: "3.3", code: "VALID_HEADERS" })).toMatchObject({
      result: "pass",
      hmrcCode: "VALID_HEADERS",
    });
  });

  it("maps POTENTIALLY_INVALID_HEADERS to warn and keeps the warnings", () => {
    const answer = resultOfValidateAnswer(200, {
      specVersion: "3.3",
      code: "POTENTIALLY_INVALID_HEADERS",
      warnings: [{ code: "MISSING_HEADER", message: "Header required", headers: ["gov-vendor-license-ids"] }],
    });
    expect(answer.result).toBe("warn");
    expect(answer.warnings).toEqual([{ code: "MISSING_HEADER", message: "Header required", headers: ["gov-vendor-license-ids"] }]);
  });

  it("maps INVALID_HEADERS to fail and keeps the errors", () => {
    const answer = resultOfValidateAnswer(200, {
      specVersion: "3.3",
      code: "INVALID_HEADERS",
      errors: [{ code: "INVALID_HEADER", message: "bad", headers: ["gov-client-device-id"] }],
    });
    expect(answer.result).toBe("fail");
    expect(answer.errors[0].headers).toEqual(["gov-client-device-id"]);
  });

  it("shows a changed specVersion as warn", () => {
    const answer = resultOfValidateAnswer(200, { specVersion: "4.0", code: "VALID_HEADERS" });
    expect(answer.result).toBe("warn");
    expect(answer.warnings.map((warning) => warning.code)).toContain("SPEC_VERSION_CHANGED");
  });

  it("gives no verdict for a sandbox error or an unknown code", () => {
    expect(() => resultOfValidateAnswer(503, {})).toThrow(/no verdict/);
    expect(() => resultOfValidateAnswer(200, { code: "SOMETHING_NEW" })).toThrow(/no verdict/);
  });
});

describe("checkShape", () => {
  it("writes a pass item for the shape and day", async () => {
    stubValidate(200, { specVersion: "3.3", code: "VALID_HEADERS" });
    await expect(checkShape(MESSAGE, NOW)).resolves.toEqual({ skipped: false, result: "pass" });
    expect(repository.putFphCheckResultOnce).toHaveBeenCalledTimes(1);
    const item = repository.putFphCheckResultOnce.mock.calls[0][0];
    expect(item).toMatchObject({
      pk: "fph#2026-11-05",
      sk: shapeHash,
      recordType: "fph-check",
      shapeHash,
      connectionMethod: "WEB_APP_VIA_SERVER",
      api: MESSAGE.api,
      result: "pass",
      hmrcCode: "VALID_HEADERS",
      specVersion: "3.3",
    });
    expect(item.ttl).toBeGreaterThan(0);
    expect(metrics.emitMetric).not.toHaveBeenCalled();
  });

  it("sends a synthetic set to the sandbox validator and none of the customer's values", async () => {
    stubValidate(200, { specVersion: "3.3", code: "VALID_HEADERS" });
    await checkShape(MESSAGE, NOW);
    const [url, init, call] = http.recordedFetch.mock.calls[0];
    expect(url).toBe("https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(call).toMatchObject({ org: "hmrc", target: "test", api: "GET /test/fraud-prevention-headers/validate" });
    const sent = JSON.stringify(init.headers);
    for (const fragment of ["203.0.113.77", "customer-sub-abc", "0b5a9a52", "40123", "198.51.100.9"]) {
      expect(sent).not.toContain(fragment);
    }
    expect(init.headers["Gov-Client-Public-IP"]).toBe("198.51.100.30");
    expect(init.headers["Gov-Vendor-Public-IP"]).toBe("198.51.100.20");
    expect(init.headers["Gov-Client-Public-IP-Timestamp"]).toBe("2026-11-05T10:00:00.000Z");
  });

  it("records a warn without a metric", async () => {
    stubValidate(200, { specVersion: "3.3", code: "POTENTIALLY_INVALID_HEADERS", warnings: [] });
    await expect(checkShape(MESSAGE, NOW)).resolves.toMatchObject({ result: "warn" });
    expect(metrics.emitMetric).not.toHaveBeenCalled();
  });

  it("records a fail and counts HmrcFphCheckFailed", async () => {
    stubValidate(200, {
      specVersion: "3.3",
      code: "INVALID_HEADERS",
      errors: [{ code: "INVALID_HEADER", message: "bad", headers: ["gov-client-device-id"] }],
    });
    await expect(checkShape(MESSAGE, NOW)).resolves.toMatchObject({ result: "fail" });
    expect(metrics.emitMetric).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "Submit/HmrcSend", metricName: "HmrcFphCheckFailed", dimensions: { Environment: "test" } }),
    );
  });

  it("counts a fail once when another consumer wrote the item first", async () => {
    stubValidate(200, { specVersion: "3.3", code: "INVALID_HEADERS" });
    repository.putFphCheckResultOnce.mockResolvedValue(false);
    await checkShape(MESSAGE, NOW);
    expect(metrics.emitMetric).not.toHaveBeenCalled();
  });

  it("makes no second call for a shape that has a result today", async () => {
    repository.getFphCheckResult.mockResolvedValue({ pk: "fph#2026-11-05", sk: shapeHash });
    await expect(checkShape(MESSAGE, NOW)).resolves.toEqual({ skipped: true });
    expect(http.recordedFetch).not.toHaveBeenCalled();
    expect(http.fetchWithTimeout).not.toHaveBeenCalled();
    expect(repository.putFphCheckResultOnce).not.toHaveBeenCalled();
  });

  it("writes no item and throws for a sandbox error, so the queue retries", async () => {
    stubValidate(503, { message: "unavailable" });
    await expect(checkShape(MESSAGE, NOW)).rejects.toThrow(/no verdict/);
    expect(repository.putFphCheckResultOnce).not.toHaveBeenCalled();
  });

  it("writes no item and throws when the validator times out", async () => {
    http.recordedFetch.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expect(checkShape(MESSAGE, NOW)).rejects.toThrow(/aborted/);
    expect(repository.putFphCheckResultOnce).not.toHaveBeenCalled();
  });

  it("throws for a message with no valid shape", async () => {
    await expect(checkShape({ shapeHash: "x", api: "GET /x", shape: { connectionMethod: "NOPE", headers: {} } }, NOW)).rejects.toThrow(
      /valid shape/,
    );
    await expect(checkShape({ api: "GET /x" }, NOW)).rejects.toThrow(/valid shape/);
  });
});

describe("checkShape against the simulator's validator", () => {
  function answerFromSimulator() {
    http.recordedFetch.mockImplementation(async (_url, init) => ({ status: 200, json: async () => validateFraudHeaders(init.headers) }));
  }

  const WEB_SHAPE_HEADERS = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0",
    "Gov-Client-Device-ID": "0b5a9a52-4d6b-4a53-9a4b-3d5d9a3f1c11",
    "Gov-Client-Multi-Factor": "type=TOTP&timestamp=2026-01-01T00%3A00%3A00Z&unique-reference=x",
    "Gov-Client-Public-IP": "203.0.113.7",
    "Gov-Client-Public-IP-Timestamp": "2026-01-01T00:00:00.000Z",
    "Gov-Client-Public-Port": "51234",
    "Gov-Client-Screens": "width=1&height=1&scaling-factor=1&colour-depth=24",
    "Gov-Client-Timezone": "UTC+00:00",
    "Gov-Client-User-IDs": "cognito=abc",
    "Gov-Client-Window-Size": "width=1&height=1",
    "Gov-Vendor-Forwarded": "by=198.51.100.1&for=203.0.113.7",
    "Gov-Vendor-License-IDs": "diyaccounting=abc",
    "Gov-Vendor-Product-Name": "diy-accounting-submit",
    "Gov-Vendor-Public-IP": "198.51.100.1",
    "Gov-Vendor-Version": "diy-accounting-submit=1.0.0",
  };

  it("passes a complete web shape", async () => {
    answerFromSimulator();
    const described = fraudPreventionHeaderShape(WEB_SHAPE_HEADERS);
    await expect(checkShape({ shapeHash: described.shapeHash, api: "GET /x", shape: described.shape }, NOW)).resolves.toEqual({
      skipped: false,
      result: "pass",
    });
    expect(metrics.emitMetric).not.toHaveBeenCalled();
  });

  it("fails a shape that lacks a required header and counts HmrcFphCheckFailed", async () => {
    answerFromSimulator();
    const { "Gov-Client-Device-ID": _removed, ...incomplete } = WEB_SHAPE_HEADERS;
    const described = fraudPreventionHeaderShape(incomplete);
    await expect(checkShape({ shapeHash: described.shapeHash, api: "GET /x", shape: described.shape }, NOW)).resolves.toEqual({
      skipped: false,
      result: "fail",
    });
    const item = repository.putFphCheckResultOnce.mock.calls[0][0];
    expect(item).toMatchObject({ hmrcCode: "INVALID_HEADERS", result: "fail" });
    expect(item.errors[0].headers).toEqual(["gov-client-device-id"]);
    expect(metrics.emitMetric).toHaveBeenCalledWith(expect.objectContaining({ metricName: "HmrcFphCheckFailed" }));
  });
});

describe("sandboxAccessToken", () => {
  it("asks for client credentials once and keeps the token while it is valid", async () => {
    await expect(sandboxAccessToken(1_000)).resolves.toBe("token-1");
    await expect(sandboxAccessToken(2_000)).resolves.toBe("token-1");
    expect(http.fetchWithTimeout).toHaveBeenCalledTimes(1);
    const [url, init] = http.fetchWithTimeout.mock.calls[0];
    expect(url).toBe("https://test-api.service.hmrc.gov.uk/oauth/token");
    expect(init.body.get("grant_type")).toBe("client_credentials");
  });

  it("asks again after the token expires", async () => {
    await sandboxAccessToken(1_000);
    await sandboxAccessToken(1_000 + 14_400_000);
    expect(http.fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("throws when HMRC refuses the client credentials", async () => {
    http.fetchWithTimeout.mockResolvedValue({ response: { ok: false, status: 401, json: async () => ({ error: "invalid_client" }) } });
    await expect(sandboxAccessToken(1_000)).rejects.toThrow(/status 401/);
  });

  it("reads a rolled client secret from Secrets Manager once and tries again", async () => {
    delete process.env.HMRC_SANDBOX_CLIENT_SECRET;
    process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN = "arn:secret";
    secret.readSecret.mockResolvedValue("old");
    secret.refreshAfterAuthFailure.mockResolvedValue("new");
    http.fetchWithTimeout
      .mockResolvedValueOnce({ response: { ok: false, status: 401, json: async () => ({ error: "invalid_client" }) } })
      .mockResolvedValueOnce({ response: { ok: true, status: 200, json: async () => ({ access_token: "token-2", expires_in: 14400 }) } });
    await expect(sandboxAccessToken(1_000)).resolves.toBe("token-2");
    expect(http.fetchWithTimeout.mock.calls[1][1].body.get("client_secret")).toBe("new");
    delete process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN;
  });
});

describe("workerHandler", () => {
  it("checks the shape in each queue record", async () => {
    stubValidate(200, { specVersion: "3.3", code: "VALID_HEADERS" });
    const body = JSON.stringify({ userId: "fph-check", requestId: shapeHash, payload: MESSAGE });
    await workerHandler({ Records: [{ messageId: "m1", body }] });
    expect(repository.putFphCheckResultOnce).toHaveBeenCalledTimes(1);
  });

  it("rethrows a failed check, so the queue retries and then moves the message to the dead letter queue", async () => {
    stubValidate(503, {});
    const body = JSON.stringify({ userId: "fph-check", requestId: shapeHash, payload: MESSAGE });
    await expect(workerHandler({ Records: [{ messageId: "m1", body }] })).rejects.toThrow(/no verdict/);
  });
});
