// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const { send, emitMetric } = vi.hoisted(() => ({ send: vi.fn(), emitMetric: vi.fn() }));

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send = send;
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));
vi.mock("../../lib/emfMetrics.js", () => ({ emitMetric }));

const HEADER = "x-diya-origin-verify";
const httpEvent = (headers = {}) => ({ rawPath: "/api/v1/bundle", requestContext: { http: { method: "GET" } }, headers });
const secretValue = (value) => ({ SecretString: JSON.stringify(value) });

async function loadEntry({ enforce }) {
  vi.resetModules();
  vi.stubEnv("ORIGIN_VERIFY_TARGET_HANDLER", "app/unit-tests/lib/fixtures/originVerifiedTarget.echoHandler");
  vi.stubEnv("ORIGIN_VERIFY_SECRET_NAME", "test/submit/origin/verify");
  vi.stubEnv("ORIGIN_VERIFY_ENFORCE", enforce ? "true" : "false");
  return import("../../lib/originVerifiedEntry.js");
}

describe("originVerifiedEntry", () => {
  beforeEach(() => {
    send.mockReset();
    emitMetric.mockReset();
    send.mockResolvedValue(secretValue({ current: "new-value", previous: "old-value" }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  test("calls the target with the event and the Lambda context", async () => {
    const { ingestHandler } = await loadEntry({ enforce: true });
    const lambdaContext = { awsRequestId: "abc" };
    const result = await ingestHandler(httpEvent({ [HEADER]: "new-value" }), lambdaContext);
    expect(result.statusCode).toBe(200);
    expect(result.lambdaContext).toBe(lambdaContext);
    expect(emitMetric).not.toHaveBeenCalled();
  });

  test("accepts the previous value while a roll is in progress", async () => {
    const { ingestHandler } = await loadEntry({ enforce: true });
    const result = await ingestHandler(httpEvent({ [HEADER]: "old-value" }));
    expect(result.statusCode).toBe(200);
  });

  test("accepts the current value when the secret has no previous value", async () => {
    send.mockResolvedValue(secretValue({ current: "new-value", previous: "" }));
    const { ingestHandler } = await loadEntry({ enforce: true });
    expect((await ingestHandler(httpEvent({ [HEADER]: "new-value" }))).statusCode).toBe(200);
    expect((await ingestHandler(httpEvent({ [HEADER]: "" }))).statusCode).toBe(403);
  });

  test("removes the header before the target sees the event", async () => {
    const { ingestHandler } = await loadEntry({ enforce: true });
    const result = await ingestHandler(httpEvent({ [HEADER]: "new-value", accept: "application/json" }));
    expect(result.event.headers).toEqual({ accept: "application/json" });
  });

  test("passes a request with no header and counts it when the flag is off", async () => {
    const { ingestHandler } = await loadEntry({ enforce: false });
    const result = await ingestHandler(httpEvent());
    expect(result.statusCode).toBe(200);
    expect(emitMetric).toHaveBeenCalledWith({ namespace: "Submit/OriginVerify", metricName: "OriginHeaderMissing" });
  });

  test("passes a request and counts it when the flag is off and the secret does not exist", async () => {
    send.mockRejectedValue(Object.assign(new Error("not found"), { name: "ResourceNotFoundException" }));
    const { ingestHandler } = await loadEntry({ enforce: false });
    const result = await ingestHandler(httpEvent());
    expect(result.statusCode).toBe(200);
    expect(emitMetric).toHaveBeenCalledWith({ namespace: "Submit/OriginVerify", metricName: "OriginSecretUnavailable" });
  });

  test("refuses a request with no header as JSON when the flag is on", async () => {
    const { ingestHandler } = await loadEntry({ enforce: true });
    const result = await ingestHandler(httpEvent());
    expect(result.statusCode).toBe(403);
    expect(result.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(result.body)).toEqual({ message: "Forbidden" });
    expect(emitMetric).toHaveBeenCalledWith({ namespace: "Submit/OriginVerify", metricName: "OriginHeaderMissing" });
  });

  test("refuses a wrong value when the flag is on", async () => {
    const { ingestHandler } = await loadEntry({ enforce: true });
    const result = await ingestHandler(httpEvent({ [HEADER]: "guess" }));
    expect(result.statusCode).toBe(403);
    expect(emitMetric).toHaveBeenCalledWith({ namespace: "Submit/OriginVerify", metricName: "OriginHeaderInvalid" });
  });

  test("refuses every request as JSON when the flag is on and the secret cannot be read", async () => {
    send.mockRejectedValue(new Error("throttled"));
    const { ingestHandler } = await loadEntry({ enforce: true });
    const result = await ingestHandler(httpEvent({ [HEADER]: "new-value" }));
    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ message: "Service unavailable" });
  });

  test("refuses every request when the flag is on and the secret is not valid JSON", async () => {
    send.mockResolvedValue({ SecretString: "new-value" });
    const { ingestHandler } = await loadEntry({ enforce: true });
    expect((await ingestHandler(httpEvent({ [HEADER]: "new-value" }))).statusCode).toBe(503);
  });

  test("keeps the last values when a later read of the secret fails", async () => {
    vi.useFakeTimers();
    const { ingestHandler } = await loadEntry({ enforce: true });
    expect((await ingestHandler(httpEvent({ [HEADER]: "new-value" }))).statusCode).toBe(200);
    send.mockRejectedValue(new Error("throttled"));
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect((await ingestHandler(httpEvent({ [HEADER]: "new-value" }))).statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("reads the secret once in a refresh interval and takes a new value after it", async () => {
    vi.useFakeTimers();
    const { ingestHandler } = await loadEntry({ enforce: true });
    await ingestHandler(httpEvent({ [HEADER]: "new-value" }));
    await ingestHandler(httpEvent({ [HEADER]: "new-value" }));
    expect(send).toHaveBeenCalledTimes(1);
    send.mockResolvedValue(secretValue({ current: "third-value", previous: "new-value" }));
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect((await ingestHandler(httpEvent({ [HEADER]: "third-value" }))).statusCode).toBe(200);
    expect((await ingestHandler(httpEvent({ [HEADER]: "old-value" }))).statusCode).toBe(403);
  });

  test("does not check an event that API Gateway did not send", async () => {
    const { ingestHandler } = await loadEntry({ enforce: true });
    const result = await ingestHandler({ Records: [{ body: "{}" }] });
    expect(result.statusCode).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });
});
