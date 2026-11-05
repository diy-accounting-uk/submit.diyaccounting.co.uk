// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/hostedClientAddress.test.js

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  firstPublicIp,
  forwardedIpsOf,
  readHostedClientAddress,
  signHostedClientAddress,
  viewerPortOf,
} from "@app/lib/hostedClientAddress.js";
import { _clearSalt, _setTestSalt } from "@app/services/subHasher.js";

const ADDRESS = { ip: "2001:db8::7", port: "50100", collectedAt: "2026-11-04T10:15:30.123Z" };

describe("hostedClientAddress", () => {
  beforeEach(() => {
    _setTestSalt("hosted-client-test-salt");
  });

  afterEach(() => {
    _clearSalt();
  });

  it("reads back an address signed for the same user", () => {
    const value = signHostedClientAddress({ sub: "user-1", ...ADDRESS });
    expect(readHostedClientAddress(value, "user-1")).toEqual(ADDRESS);
  });

  it("refuses an address signed for another user", () => {
    const value = signHostedClientAddress({ sub: "user-1", ...ADDRESS });
    expect(readHostedClientAddress(value, "user-2")).toBeNull();
  });

  it("refuses an address changed after signing", () => {
    const value = signHostedClientAddress({ sub: "user-1", ...ADDRESS });
    expect(readHostedClientAddress(value.replace("50100", "50101"), "user-1")).toBeNull();
  });

  it("refuses an absent or malformed value", () => {
    expect(readHostedClientAddress(null, "user-1")).toBeNull();
    expect(readHostedClientAddress("198.51.100.7,50100", "user-1")).toBeNull();
    expect(readHostedClientAddress("%E0%A4%A,50100,2026-11-04T10:15:30.123Z,sig", "user-1")).toBeNull();
    expect(readHostedClientAddress("198.51.100.7,50100,2026-11-04T10:15:30.123Z,short", "user-1")).toBeNull();
  });

  it("finds the first public address in a forwarded list", () => {
    expect(firstPublicIp(forwardedIpsOf("10.0.0.1, 198.51.100.7, 203.0.113.1"))).toBe("198.51.100.7");
    expect(firstPublicIp(forwardedIpsOf(null))).toBeUndefined();
  });

  it("reads the port of an IPv4 and an IPv6 viewer address", () => {
    expect(viewerPortOf("198.51.100.7:50100")).toBe("50100");
    expect(viewerPortOf("[2001:db8::7]:50100")).toBe("50100");
    expect(viewerPortOf(null)).toBeUndefined();
  });
});
