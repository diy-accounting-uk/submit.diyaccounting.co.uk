// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/fraudPreventionHeaderRules.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkFraudPreventionHeaderRules } from "@app/lib/fraudPreventionHeaderRules.js";
import { buildFraudHeaders, detectVendorPublicIp, _resetForTesting } from "@app/lib/buildFraudHeaders.js";

const BROWSER_HEADERS = {
  "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
  "Gov-Client-Public-IP-Timestamp": "2026-11-04T10:15:30.123Z",
  "Gov-Client-Screens": "width=1920&height=1080&colour-depth=24&scaling-factor=1.25",
  "Gov-Client-Timezone": "UTC+00:00",
  "Gov-Client-Window-Size": "width=1280&height=720",
};

async function realHeaders(connectionClientId) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("203.0.113.9\n") }));
  await detectVendorPublicIp();
  const event = {
    headers: {
      "x-forwarded-for": "198.51.100.23",
      "cloudfront-viewer-address": "198.51.100.23:51234",
      "x-device-id": "0b5a9a52-4d6b-4a53-9a4b-3d5d9a3f1c11",
      ...BROWSER_HEADERS,
    },
    requestContext: {
      authorizer: {
        lambda: {
          sub: "user-abc",
          mfa_method: "TOTP",
          mfa_federated: "false",
          auth_time: "1700000000",
          client_id: connectionClientId,
        },
      },
    },
  };
  return buildFraudHeaders(event).govClientHeaders;
}

describe("checkFraudPreventionHeaderRules", () => {
  let good;

  beforeEach(async () => {
    _resetForTesting();
    good = await realHeaders();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the headers buildFraudHeaders builds with the browser headers", () => {
    expect(good["Gov-Client-Multi-Factor"]).toContain("type=TOTP");
    expect(checkFraudPreventionHeaderRules(good, "WEB_APP_VIA_SERVER")).toEqual([]);
  });

  it("passes the same headers under the desktop rule set", () => {
    expect(checkFraudPreventionHeaderRules(good, "DESKTOP_APP_VIA_SERVER")).toEqual([]);
  });

  it("passes a Headers object and mixed-case names", () => {
    const lower = Object.fromEntries(Object.entries(good).map(([k, v]) => [k.toLowerCase(), v]));
    expect(checkFraudPreventionHeaderRules(new Headers(lower), "WEB_APP_VIA_SERVER")).toEqual([]);
  });

  it("passes IPv6 addresses with an encoded forwarded chain", () => {
    const headers = {
      ...good,
      "Gov-Client-Public-IP": "2001:db8:85a3::8a2e:370:7334",
      "Gov-Vendor-Forwarded": "by=203.0.113.9&for=2001%3Adb8%3A85a3%3A%3A8a2e%3A370%3A7334",
    };
    expect(checkFraudPreventionHeaderRules(headers, "WEB_APP_VIA_SERVER")).toEqual([]);
  });

  it("ignores an absent header", () => {
    const { "Gov-Client-Device-ID": _omitted, ...rest } = good;
    expect(checkFraudPreventionHeaderRules(rest, "WEB_APP_VIA_SERVER")).toEqual([]);
  });

  const cases = [
    ["placeholder", { "Gov-Client-Timezone": "undefined" }, "Gov-Client-Timezone:placeholder"],
    ["us-ascii", { "Gov-Client-Browser-JS-User-Agent": "Mozilla café" }, "Gov-Client-Browser-JS-User-Agent:us-ascii"],
    ["percent-encoding", { "Gov-Client-User-IDs": "cognito=a b" }, "Gov-Client-User-IDs:percent-encoding"],
    ["empty-value", { "Gov-Client-User-IDs": "cognito=" }, "Gov-Client-User-IDs:empty-value"],
    ["empty-list-value", { "Gov-Vendor-Version": "a=1,,b=2" }, "Gov-Vendor-Version:empty-list-value"],
    ["client public", { "Gov-Client-Public-IP": "192.168.1.5" }, "Gov-Client-Public-IP:public"],
    ["vendor public", { "Gov-Vendor-Public-IP": "10.0.0.4" }, "Gov-Vendor-Public-IP:public"],
    [
      "differs-from-client",
      { "Gov-Vendor-Public-IP": "198.51.100.23", "Gov-Vendor-Forwarded": "by=198.51.100.23&for=198.51.100.23" },
      "Gov-Vendor-Public-IP:differs-from-client",
    ],
    ["ip timestamp", { "Gov-Client-Public-IP-Timestamp": "2026-11-04T10:15:30Z" }, "Gov-Client-Public-IP-Timestamp:timestamp"],
    ["port range", { "Gov-Client-Public-Port": "70000" }, "Gov-Client-Public-Port:range"],
    ["server port", { "Gov-Client-Public-Port": "443" }, "Gov-Client-Public-Port:server-port"],
    ["uuid", { "Gov-Client-Device-ID": "device-1" }, "Gov-Client-Device-ID:uuid"],
    [
      "multi-factor type",
      { "Gov-Client-Multi-Factor": "type=SMS&timestamp=2026-11-04T10%3A15Z&unique-reference=abc" },
      "Gov-Client-Multi-Factor:type",
    ],
    [
      "multi-factor timestamp",
      { "Gov-Client-Multi-Factor": "type=TOTP&timestamp=yesterday&unique-reference=abc" },
      "Gov-Client-Multi-Factor:timestamp",
    ],
    [
      "multi-factor reference",
      { "Gov-Client-Multi-Factor": "type=TOTP&timestamp=2026-11-04T10%3A15Z&unique-reference=" },
      "Gov-Client-Multi-Factor:empty-value",
    ],
    ["screens", { "Gov-Client-Screens": "width=0&height=1080&colour-depth=24&scaling-factor=1" }, "Gov-Client-Screens:dimensions"],
    ["window size", { "Gov-Client-Window-Size": "width=12.5&height=720" }, "Gov-Client-Window-Size:dimensions"],
    ["timezone", { "Gov-Client-Timezone": "GMT+1" }, "Gov-Client-Timezone:timezone"],
    ["first hop by", { "Gov-Vendor-Forwarded": "by=203.0.113.77&for=198.51.100.23" }, "Gov-Vendor-Forwarded:first-hop-by"],
    ["first hop for", { "Gov-Vendor-Forwarded": "by=203.0.113.9&for=198.51.100.99" }, "Gov-Vendor-Forwarded:first-hop-for"],
  ];

  it.each(cases)("fails %s", (_name, override, ruleId) => {
    expect(checkFraudPreventionHeaderRules({ ...good, ...override }, "WEB_APP_VIA_SERVER")).toContain(ruleId);
  });

  it("checks the desktop-only headers under the desktop rule set", () => {
    const desktop = {
      ...good,
      "Gov-Client-Local-IPs": "192.168.1.5,fe80%3A%3A1",
      "Gov-Client-Local-IPs-Timestamp": "2026-11-04T10:15:30.123Z",
      "Gov-Client-MAC-Addresses": "aa%3Abb%3Acc%3Add%3Aee%3Aff",
      "Gov-Client-User-Agent": "os-family=macOS&os-version=15.1&device-manufacturer=Apple&device-model=MacBook%20Pro",
    };
    expect(checkFraudPreventionHeaderRules(desktop, "DESKTOP_APP_VIA_SERVER")).toEqual([]);
    const bad = { ...desktop, "Gov-Client-Local-IPs-Timestamp": "2026-11-04T10:15Z", "Gov-Client-MAC-Addresses": "aa:bb" };
    expect(checkFraudPreventionHeaderRules(bad, "DESKTOP_APP_VIA_SERVER")).toEqual([
      "Gov-Client-MAC-Addresses:percent-encoding",
      "Gov-Client-Local-IPs-Timestamp:timestamp",
    ]);
  });

  it("returns rule ids that hold no header value", () => {
    const ids = checkFraudPreventionHeaderRules({ ...good, "Gov-Client-Device-ID": "secret-device-value" }, "WEB_APP_VIA_SERVER");
    expect(JSON.stringify(ids)).not.toContain("secret-device-value");
  });
});
