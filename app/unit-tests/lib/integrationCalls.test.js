// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/integrationCalls.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { context } from "@app/lib/logger.js";
import { HttpTimeoutError } from "@app/lib/httpFetch.js";
import { putIntegrationCall } from "@app/data/dynamoDbIntegrationCallRepository.js";
import {
  recordedFetch,
  recordIntegrationCall,
  integrationApi,
  integrationApiForGovTalk,
  INTEGRATION_CALL_RECORD_FAILED_METRIC,
} from "@app/lib/integrationCalls.js";

vi.mock("@app/data/dynamoDbIntegrationCallRepository.js", () => ({
  putIntegrationCall: vi.fn().mockResolvedValue(undefined),
}));

const URL_WITH_VRN = "https://api.example/organisations/vat/193054661/returns?from=2026-01-01";
const CALL = { org: "hmrc", target: "live", api: "POST /organisations/vat/{vrn}/returns" };
const INIT = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vatDueSales: 1 }) };

function recordedItem() {
  expect(putIntegrationCall).toHaveBeenCalledTimes(1);
  return putIntegrationCall.mock.calls[0][0];
}

function failedMetricCount(consoleSpy) {
  return consoleSpy.mock.calls.filter(([line]) => String(line).includes(`"${INTEGRATION_CALL_RECORD_FAILED_METRIC}":1`)).length;
}

describe("lib/integrationCalls", () => {
  let consoleSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    putIntegrationCall.mockResolvedValue(undefined);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.AWS_LAMBDA_FUNCTION_NAME = "ci-app-function";
    process.env.DEPLOYMENT_NAME = "ci-unit";
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.useRealTimers();
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  });

  describe("recordedFetch", () => {
    it("writes one record for a response and hands the response to the caller unread", async () => {
      const response = new Response(JSON.stringify({ processingDate: "2026-01-01" }), {
        status: 201,
        headers: { "x-correlationid": "corr-1", "Content-Type": "application/json" },
      });
      const fetchImplementation = vi.fn().mockResolvedValue(response);

      const returned = await context.run(
        new Map([
          ["requestId", "req-1"],
          ["traceparent", "00-abc-def-01"],
        ]),
        () => recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fph: { rules: "pass", rulesFailed: [] }, fetchImplementation }),
      );

      expect(fetchImplementation).toHaveBeenCalledWith(URL_WITH_VRN, INIT);
      expect(returned).toBe(response);
      expect(await returned.json()).toEqual({ processingDate: "2026-01-01" });

      const item = recordedItem();
      expect(item.pk).toMatch(/^call#hmrc#\d{4}-\d{2}-\d{2}$/);
      expect(item.sk).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z#[0-9a-f]{8}$/);
      expect(item.sk.startsWith(item.startedAt)).toBe(true);
      expect(item).toMatchObject({
        recordType: "call",
        org: "hmrc",
        target: "live",
        api: CALL.api,
        method: "POST",
        outcome: "response",
        status: 201,
        statusLabel: "201",
        providerRequestId: "corr-1",
        requestId: "req-1",
        traceparent: "00-abc-def-01",
        function: "ci-app-function",
        deployment: "ci-unit",
        fph: { rules: "pass", rulesFailed: [] },
      });
      expect(item.durationMs).toBeGreaterThanOrEqual(0);
      expect(item.raw.responseBody).toEqual({ processingDate: "string" });
      expect(item.raw.requestBody).toEqual({ vatDueSales: "number" });
    });

    it("sets the record to expire 90 days after the call", async () => {
      vi.useFakeTimers({ now: new Date("2026-11-04T10:15:30.123Z"), toFake: ["Date"] });

      await recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: async () => new Response("{}") });

      const item = recordedItem();
      expect(item.pk).toBe("call#hmrc#2026-11-04");
      expect(item.ttl).toBe(Math.floor(Date.parse("2026-11-04T10:15:30.123Z") / 1000) + 90 * 86400);
    });

    it("uses global fetch when no implementation is given", async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", mockFetch);

      await recordedFetch(URL_WITH_VRN, INIT, CALL);

      expect(mockFetch).toHaveBeenCalledWith(URL_WITH_VRN, INIT);
      vi.unstubAllGlobals();
    });

    it("holds no VRN from the URL in any field", async () => {
      await recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: async () => new Response("{}") });

      expect(JSON.stringify(recordedItem())).not.toContain("193054661");
    });

    it.each([
      ["an abort", Object.assign(new Error("aborted"), { name: "AbortError" })],
      ["a signal timeout", Object.assign(new Error("timed out"), { name: "TimeoutError" })],
      ["an HTTP timeout", new HttpTimeoutError("timed out")],
    ])("records %s as a timeout and rethrows the same error", async (_name, error) => {
      await expect(recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: () => Promise.reject(error) })).rejects.toBe(error);

      expect(recordedItem()).toMatchObject({ outcome: "timeout", statusLabel: "timeout" });
      expect(recordedItem().status).toBeUndefined();
    });

    it("records a network error and rethrows the same error", async () => {
      const error = new TypeError("fetch failed");

      await expect(recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: () => Promise.reject(error) })).rejects.toBe(error);

      expect(recordedItem()).toMatchObject({ outcome: "network-error", statusLabel: "network-error" });
    });

    it("reads a gateway error number from an HTTP 200 into appCode", async () => {
      const reply = "<GovTalkMessage><GovTalkErrors><Error><Number>1046</Number></Error></GovTalkErrors></GovTalkMessage>";

      await recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: async () => new Response(reply) });

      expect(recordedItem()).toMatchObject({ status: 200, statusLabel: "200", appCode: "1046" });
    });

    it("records a response that cannot be cloned, without a body skeleton", async () => {
      const response = { status: 204, headers: { forEach: () => {} } };

      await expect(recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: async () => response })).resolves.toBe(response);

      expect(recordedItem()).toMatchObject({ status: 204 });
      expect(recordedItem().raw.responseBody).toBeUndefined();
    });

    it("returns the response when the record write fails, and counts the failure", async () => {
      putIntegrationCall.mockRejectedValue(new Error("table missing"));
      const response = new Response("{}", { status: 200 });

      await expect(recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: async () => response })).resolves.toBe(response);

      expect(failedMetricCount(consoleSpy)).toBe(1);
    });

    it("rethrows the send error when the record write also fails", async () => {
      putIntegrationCall.mockRejectedValue(new Error("table missing"));
      const error = new TypeError("fetch failed");

      await expect(recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: () => Promise.reject(error) })).rejects.toBe(error);

      expect(failedMetricCount(consoleSpy)).toBe(1);
    });

    it("stops waiting for a slow record write after one second", async () => {
      vi.useFakeTimers();
      putIntegrationCall.mockReturnValue(new Promise(() => {}));
      const response = { status: 200, headers: {} };

      const sent = recordedFetch(URL_WITH_VRN, INIT, { ...CALL, fetchImplementation: async () => response });
      await vi.advanceTimersByTimeAsync(1000);

      await expect(sent).resolves.toBe(response);
      expect(failedMetricCount(consoleSpy)).toBe(1);
    });
  });

  describe("recordIntegrationCall", () => {
    it("writes a refusal with no status", async () => {
      await recordIntegrationCall({ ...CALL, url: URL_WITH_VRN, method: "POST", startedAt: new Date(), durationMs: 0, outcome: "refused" });

      expect(recordedItem()).toMatchObject({ outcome: "refused", statusLabel: "refused", durationMs: 0 });
      expect(recordedItem().status).toBeUndefined();
    });

    it("does not throw when the record cannot be built", async () => {
      await expect(recordIntegrationCall({ ...CALL, url: URL_WITH_VRN, startedAt: null })).resolves.toBeUndefined();

      expect(putIntegrationCall).not.toHaveBeenCalled();
      expect(failedMetricCount(consoleSpy)).toBe(1);
    });
  });

  describe("integrationApi", () => {
    it("drops the query string and templates the path", () => {
      expect(integrationApi("GET", URL_WITH_VRN)).toBe("GET /organisations/vat/{vrn}/returns");
    });

    it("does not throw for an unparsable URL", () => {
      expect(integrationApi("GET", "not a url")).toBe("GET {unparsable}");
    });
  });

  describe("integrationApiForGovTalk", () => {
    it("names the message class", () => {
      expect(integrationApiForGovTalk("TE", "<Class>HMRC-CT-CT600</Class>")).toBe("TE HMRC-CT-CT600");
    });

    it("names an unknown class when the message has none", () => {
      expect(integrationApiForGovTalk("XMLGW", "<Other/>")).toBe("XMLGW unknown");
    });
  });
});
