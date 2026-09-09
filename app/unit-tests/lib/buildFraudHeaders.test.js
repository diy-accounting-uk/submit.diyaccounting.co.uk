// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/buildFraudHeaders.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { buildFraudHeaders, detectVendorPublicIp, _resetForTesting } from "../../lib/buildFraudHeaders.js";
import { _setTestSalt, _clearSalt, hashSub } from "../../services/subHasher.js";

// Read package info for test assertions (strip scope if present)
const { name: rawPackageName, version: packageVersion } = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url)));
const packageName = rawPackageName.startsWith("@") ? rawPackageName.split("/")[1] : rawPackageName;

describe("buildFraudHeaders", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return govClientHeaders and govClientErrorMessages", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const result = buildFraudHeaders(event);

    expect(result).toHaveProperty("govClientHeaders");
    expect(result).toHaveProperty("govClientErrorMessages");
    expect(Array.isArray(result.govClientErrorMessages)).toBe(true);
  });

  it("should extract public client IP from x-forwarded-for", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1, 10.0.0.5, 203.0.113.6",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    // Should use first public IP (198.51.100.1), not private IP (10.0.0.5)
    expect(headers["Gov-Client-Public-IP"]).toBe("198.51.100.1");
  });

  it("should exclude private IP ranges", () => {
    const privateIpEvent = {
      headers: {
        "x-forwarded-for": "10.1.2.3, 192.168.1.1, 172.16.0.5",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(privateIpEvent);

    // Should not have client IP since all are private
    expect(headers["Gov-Client-Public-IP"]).toBeUndefined();
  });

  it("should include vendor product name and version from environment", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Vendor-Product-Name"]).toBe(packageName);
    expect(headers["Gov-Vendor-Version"]).toBe(`${packageName}=${packageVersion}`);
  });

  it("should set connection method to WEB_APP_VIA_SERVER", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
  });

  it("should extract user ID from custom Lambda authorizer context", () => {
    // Matches the actual format from customAuthorizer.js generateAllowPolicy():
    // context: { sub, username, email, ... } placed at authorizer.lambda by API Gateway
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {
        authorizer: {
          lambda: {
            sub: "cognito-user-abc123",
            username: "testuser",
            email: "test@example.com",
          },
        },
      },
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-User-IDs"]).toBe("cognito=cognito-user-abc123");
  });

  it("should include Gov-Vendor-License-IDs with hashed bundleIds when salt initialized", () => {
    _setTestSalt("test-salt");
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event, { bundleIds: ["day-guest"] });
    expect(headers["Gov-Vendor-License-IDs"]).toBe(`diyaccounting=${encodeURIComponent(hashSub("day-guest"))}`);
    _clearSalt();
  });

  it("should join multiple hashed bundleIds in Gov-Vendor-License-IDs", () => {
    _setTestSalt("test-salt");
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event, { bundleIds: ["day-guest", "resident-pro"] });
    const expected = `diyaccounting=${encodeURIComponent(hashSub("day-guest"))}&diyaccounting=${encodeURIComponent(hashSub("resident-pro"))}`;
    expect(headers["Gov-Vendor-License-IDs"]).toBe(expected);
    _clearSalt();
  });

  it("should omit Gov-Vendor-License-IDs when no bundleIds provided", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);
    expect(headers["Gov-Vendor-License-IDs"]).toBeUndefined();
  });

  it("should omit Gov-Client-User-IDs when not authenticated", () => {
    const event = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    // No fallback to "anonymous" - header is omitted when no user sub available
    expect(headers["Gov-Client-User-IDs"]).toBeUndefined();
  });

  it("should pass through client-side headers", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0...",
        "Gov-Client-Timezone": "Europe/London",
        "Gov-Client-Window-Size": "1920x1080",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Browser-JS-User-Agent"]).toBe("Mozilla/5.0...");
    expect(headers["Gov-Client-Timezone"]).toBe("Europe/London");
    expect(headers["Gov-Client-Window-Size"]).toBe("1920x1080");
  });

  it("should handle missing x-forwarded-for gracefully", () => {
    const event = {
      headers: {},
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    // Should still include connection method
    expect(headers["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
    // Gov-Client-Public-IP should be omitted (not falsified)
    expect(headers["Gov-Client-Public-IP"]).toBeUndefined();
  });

  it("should use device ID from x-device-id header", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "x-device-id": "device-uuid-12345",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Device-ID"]).toBe("device-uuid-12345");
  });

  it("should omit Gov-Vendor-Public-IP when vendor IP not detected", () => {
    // Without calling detectVendorPublicIp(), cachedVendorPublicIp is null
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    // Gov-Vendor-Public-IP must NOT fall back to client IP
    expect(headers["Gov-Vendor-Public-IP"]).toBeUndefined();
    expect(headers["Gov-Vendor-Forwarded"]).toBeUndefined();
  });

  it("should use detected vendor IP for Gov-Vendor-Public-IP after detectVendorPublicIp()", async () => {
    // Mock fetch to return a known IP
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("203.0.113.50\n"),
      }),
    );

    await detectVendorPublicIp();

    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Vendor-Public-IP"]).toBe("203.0.113.50");
    expect(headers["Gov-Vendor-Forwarded"]).toEqual("by=203.0.113.50&for=198.51.100.1");
  });

  it("should build vendor forwarded chain using vendor IP (not client IP)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("203.0.113.50\n"),
      }),
    );

    await detectVendorPublicIp();

    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1, 203.0.113.5",
      },
      requestContext: {
        authorizer: { lambda: { sub: "user123" } },
      },
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    const forwarded = headers["Gov-Vendor-Forwarded"];
    expect(forwarded).toEqual("by=203.0.113.50&for=198.51.100.1,by=203.0.113.50&for=203.0.113.5");
  });

  it("should cache vendor IP detection and not call fetch again", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("203.0.113.50\n"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const ip1 = await detectVendorPublicIp();
    const ip2 = await detectVendorPublicIp();

    expect(ip1).toBe("203.0.113.50");
    expect(ip2).toBe("203.0.113.50");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should handle vendor IP detection failure gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const ip = await detectVendorPublicIp();

    expect(ip).toBeNull();
  });
});

describe("Gov-Client-Public-Port from CloudFront-Viewer-Address", () => {
  it("should extract port from IPv4 CloudFront-Viewer-Address", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "CloudFront-Viewer-Address": "198.51.100.1:54321",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Public-Port"]).toBe("54321");
  });

  it("should extract port from IPv6 CloudFront-Viewer-Address", () => {
    const event = {
      headers: {
        "x-forwarded-for": "2001:db8::1",
        "CloudFront-Viewer-Address": "[2001:db8::1]:54321",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Public-Port"]).toBe("54321");
  });

  it("should omit Gov-Client-Public-Port when CloudFront-Viewer-Address is absent", () => {
    const event = {
      headers: {
        "x-forwarded-for": "198.51.100.1",
      },
      requestContext: {},
    };

    const { govClientHeaders: headers } = buildFraudHeaders(event);

    expect(headers["Gov-Client-Public-Port"]).toBeUndefined();
  });
});
