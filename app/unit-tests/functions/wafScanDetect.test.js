// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/wafScanDetect.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "zlib";

const mockPublishActivityEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
}));

import { handler, decodeSubscriptionPayload, parseWafLogRecord, groupByClientIp } from "@app/functions/security/wafScanDetect.js";

function wafLogRecord(overrides = {}) {
  return {
    timestamp: 1700000000000,
    terminatingRuleId: "SensitivePathScan",
    action: "BLOCK",
    httpRequest: {
      clientIp: "203.0.113.9",
      country: "US",
      uri: "/.env",
      httpMethod: "GET",
      requestId: "req-1",
    },
    ...overrides,
  };
}

function subscriptionPayload(records) {
  const decoded = {
    messageType: "DATA_MESSAGE",
    owner: "111111111111",
    logGroup: "aws-waf-logs-ci-app",
    logStream: "stream-1",
    subscriptionFilters: ["ci-app-WafScanDetectSubscription"],
    logEvents: records.map((record, index) => ({
      id: `event-${index}`,
      timestamp: 1700000000000,
      message: JSON.stringify(record),
    })),
  };
  return gzipSync(Buffer.from(JSON.stringify(decoded), "utf8")).toString("base64");
}

describe("functions/security/wafScanDetect", () => {
  beforeEach(() => {
    mockPublishActivityEvent.mockClear();
    process.env.DEPLOYMENT_NAME = "ci-test";
  });

  describe("decodeSubscriptionPayload", () => {
    test("gunzips and parses the base64 CloudWatch Logs payload", () => {
      const data = subscriptionPayload([wafLogRecord()]);
      const decoded = decodeSubscriptionPayload(data);
      expect(decoded.logEvents).toHaveLength(1);
      expect(JSON.parse(decoded.logEvents[0].message).terminatingRuleId).toBe("SensitivePathScan");
    });
  });

  describe("parseWafLogRecord", () => {
    test("extracts method, uri, ip, country and the enclosing timestamp for a SensitivePathScan block", () => {
      const parsed = parseWafLogRecord(JSON.stringify(wafLogRecord()), 1700000000000);
      expect(parsed).toEqual({
        terminatingRuleId: "SensitivePathScan",
        method: "GET",
        uri: "/.env",
        clientIp: "203.0.113.9",
        country: "US",
        requestId: "req-1",
        timestamp: 1700000000000,
      });
    });

    test("returns null for a record terminated by a different rule", () => {
      const parsed = parseWafLogRecord(JSON.stringify(wafLogRecord({ terminatingRuleId: "RateLimitRule" })));
      expect(parsed).toBeNull();
    });

    test("returns null for an unparsable message", () => {
      expect(parseWafLogRecord("not json")).toBeNull();
    });
  });

  describe("groupByClientIp", () => {
    test("groups repeated hits to the same path from one IP into one entry", () => {
      const records = [
        parseWafLogRecord(JSON.stringify(wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, uri: "/.env" } })), 1000),
        parseWafLogRecord(JSON.stringify(wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, uri: "/.env" } })), 2000),
        parseWafLogRecord(JSON.stringify(wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, uri: "/.git/config" } })), 3000),
      ];
      const groups = groupByClientIp(records);
      expect(groups).toHaveLength(1);
      expect(groups[0].uris.sort()).toEqual(["/.env", "/.git/config"]);
    });

    test("spans first and last timestamp across every hit for an IP, not just the de-duplicated paths", () => {
      const records = [
        parseWafLogRecord(JSON.stringify(wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, uri: "/.env" } })), 1000),
        parseWafLogRecord(JSON.stringify(wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, uri: "/.env" } })), 5000),
      ];
      const groups = groupByClientIp(records);
      expect(groups[0].firstTimestamp).toBe(1000);
      expect(groups[0].lastTimestamp).toBe(5000);
    });

    test("keeps separate IPs as separate groups, in first-seen order", () => {
      const records = [
        parseWafLogRecord(JSON.stringify(wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, clientIp: "198.51.100.4" } })), 1000),
        parseWafLogRecord(JSON.stringify(wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, clientIp: "203.0.113.9" } })), 1000),
      ];
      const groups = groupByClientIp(records);
      expect(groups.map((g) => g.clientIp)).toEqual(["198.51.100.4", "203.0.113.9"]);
    });
  });

  describe("handler", () => {
    test("publishes one ActivityEvent for one blocked record", async () => {
      const data = subscriptionPayload([wafLogRecord()]);
      const result = await handler({ awslogs: { data } });

      expect(result.published).toBe(1);
      expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
    });

    test("the event carries the client IP, the path count and the deployment name", async () => {
      const data = subscriptionPayload([wafLogRecord()]);
      await handler({ awslogs: { data } });

      const call = mockPublishActivityEvent.mock.calls[0][0];
      expect(call.detail.clientIp).toBe("203.0.113.9");
      expect(call.detail.uris).toEqual(["/.env"]);
      expect(call.detail.uriCount).toBe(1);
      expect(call.detail.deployment).toBe("ci-test");
      expect(call.summary).toBe("Scan blocked: 1 sensitive path from 203.0.113.9 (US) on ci-test");
    });

    test("one IP scanning many paths in one batch produces one event naming the count", async () => {
      const data = subscriptionPayload([
        wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, uri: "/.env" } }),
        wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, uri: "/.git/config" } }),
        wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, uri: "/.aws/credentials" } }),
      ]);
      await handler({ awslogs: { data } });

      expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
      const call = mockPublishActivityEvent.mock.calls[0][0];
      expect(call.detail.uriCount).toBe(3);
      expect(call.summary).toBe("Scan blocked: 3 sensitive paths from 203.0.113.9 (US) on ci-test");
    });

    test("two records for the same IP and URI still produce one event", async () => {
      const data = subscriptionPayload([wafLogRecord(), wafLogRecord()]);
      await handler({ awslogs: { data } });

      expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
    });

    test("a record whose terminatingRuleId is not SensitivePathScan produces none", async () => {
      const data = subscriptionPayload([wafLogRecord({ terminatingRuleId: "RateLimitRule" })]);
      await handler({ awslogs: { data } });

      expect(mockPublishActivityEvent).not.toHaveBeenCalled();
    });

    test("the event is published with flow: operational", async () => {
      const data = subscriptionPayload([wafLogRecord()]);
      await handler({ awslogs: { data } });

      expect(mockPublishActivityEvent.mock.calls[0][0].flow).toBe("operational");
    });

    test("different IPs hitting the same path each produce their own event", async () => {
      const data = subscriptionPayload([
        wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, clientIp: "203.0.113.9" } }),
        wafLogRecord({ httpRequest: { ...wafLogRecord().httpRequest, clientIp: "198.51.100.4" } }),
      ]);
      await handler({ awslogs: { data } });

      expect(mockPublishActivityEvent).toHaveBeenCalledTimes(2);
    });
  });
});
