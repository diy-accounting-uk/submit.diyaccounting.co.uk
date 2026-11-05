// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/fraudPreventionHeaderShape.test.js

import { describe, it, expect } from "vitest";
import { fraudPreventionHeaderShape, syntheticFraudPreventionHeaders, SHAPE_HEADER_NAMES } from "@app/lib/fraudPreventionHeaderShape.js";
import { checkFraudPreventionHeaderRules } from "@app/lib/fraudPreventionHeaderRules.js";

const WEB = {
  "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
  "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0 (Customer Machine 4711)",
  "Gov-Client-Device-ID": "0b5a9a52-4d6b-4a53-9a4b-3d5d9a3f1c11",
  "Gov-Client-Multi-Factor": "type=TOTP&timestamp=2026-01-01T00%3A00%3A00Z&unique-reference=customer-ref-9",
  "Gov-Client-Public-IP": "203.0.113.77",
  "Gov-Client-Public-IP-Timestamp": "2026-01-01T00:00:00.000Z",
  "Gov-Client-Public-Port": "40123",
  "Gov-Client-Screens": "width=2560&height=1440&scaling-factor=2&colour-depth=30",
  "Gov-Client-Timezone": "UTC+01:00",
  "Gov-Client-User-IDs": "cognito=customer-sub-abc",
  "Gov-Client-Window-Size": "width=999&height=777",
  "Gov-Vendor-Forwarded": "by=198.51.100.9&for=203.0.113.77",
  "Gov-Vendor-Product-Name": "diy-accounting-submit",
  "Gov-Vendor-Public-IP": "198.51.100.9",
  "Gov-Vendor-Version": "diy-accounting-submit=0.0.1",
};

const CONTEXT = {
  now: new Date("2026-11-05T10:00:00.123Z"),
  vendorPublicIp: "198.51.100.20",
  clientPublicIp: "198.51.100.30",
  productName: "diy-accounting-submit",
  productVersion: "9.9.9",
};

describe("fraudPreventionHeaderShape", () => {
  it("holds no value from the request", () => {
    const { shape } = fraudPreventionHeaderShape(WEB);
    const text = JSON.stringify(shape);
    for (const [name, value] of Object.entries(WEB)) {
      if (["Gov-Client-Connection-Method", "Gov-Vendor-Product-Name", "Gov-Vendor-Version"].includes(name)) continue;
      expect(text).not.toContain(value);
    }
    for (const fragment of ["203.0.113.77", "customer-sub-abc", "customer-ref-9", "Customer Machine", "40123", "2560", "0b5a9a52"]) {
      expect(text).not.toContain(fragment);
    }
  });

  it("describes each value by its class and each structure by its key names", () => {
    const { shape } = fraudPreventionHeaderShape(WEB);
    expect(shape.connectionMethod).toBe("WEB_APP_VIA_SERVER");
    expect(shape.headers["Gov-Client-Public-IP"]).toBe("ipv4");
    expect(shape.headers["Gov-Client-Device-ID"]).toBe("uuid");
    expect(shape.headers["Gov-Client-Public-IP-Timestamp"]).toBe("timestamp");
    expect(shape.headers["Gov-Client-Timezone"]).toBe("utc-offset");
    expect(shape.headers["Gov-Client-User-IDs"]).toBe("keys:cognito");
    expect(shape.headers["Gov-Client-Screens"]).toBe("keys:width,height,scaling-factor,colour-depth");
    expect(shape.headers["Gov-Vendor-Forwarded"]).toBe("keys:by,for");
    expect(shape.multiFactorType).toBe("TOTP");
  });

  it("gives two requests with different values the same hash", () => {
    const other = {
      ...WEB,
      "Gov-Client-Public-IP": "198.51.100.200",
      "Gov-Client-Device-ID": "11111111-2222-4333-8444-555555555555",
      "Gov-Client-Public-Port": "50999",
    };
    expect(fraudPreventionHeaderShape(other).shapeHash).toBe(fraudPreventionHeaderShape(WEB).shapeHash);
  });

  it("gives a different hash when a header is missing, a key differs or the connection method differs", () => {
    const base = fraudPreventionHeaderShape(WEB).shapeHash;
    const { "Gov-Client-Timezone": _removed, ...withoutTimezone } = WEB;
    expect(fraudPreventionHeaderShape(withoutTimezone).shapeHash).not.toBe(base);
    expect(fraudPreventionHeaderShape({ ...WEB, "Gov-Client-User-IDs": "cognito=a&other=b" }).shapeHash).not.toBe(base);
    expect(fraudPreventionHeaderShape({ ...WEB, "Gov-Client-Connection-Method": "OTHER_VIA_SERVER" }).shapeHash).not.toBe(base);
  });

  it("gives the same hash for any header name casing", () => {
    const lowerCased = Object.fromEntries(Object.entries(WEB).map(([name, value]) => [name.toLowerCase(), value]));
    expect(fraudPreventionHeaderShape(lowerCased).shapeHash).toBe(fraudPreventionHeaderShape(WEB).shapeHash);
  });

  it("returns null for a request with no known connection method", () => {
    expect(fraudPreventionHeaderShape({})).toBeNull();
    expect(fraudPreventionHeaderShape({ "Gov-Client-Connection-Method": "SOMETHING" })).toBeNull();
  });

  it("replaces a key name that could carry a customer value", () => {
    const { shape } = fraudPreventionHeaderShape({ ...WEB, "Gov-Client-User-IDs": "Jane.Doe@example.com=x" });
    expect(shape.headers["Gov-Client-User-IDs"]).toBe("keys:?");
  });

  it("ignores a header that is not a fraud prevention header", () => {
    const { shape } = fraudPreventionHeaderShape({ ...WEB, "Gov-Test-Scenario": "x", "x-request-id": "r" });
    expect(Object.keys(shape.headers).every((name) => SHAPE_HEADER_NAMES.includes(name))).toBe(true);
  });
});

describe("syntheticFraudPreventionHeaders", () => {
  it("holds no value from the request the shape came from", () => {
    const { shape } = fraudPreventionHeaderShape(WEB);
    const text = JSON.stringify(syntheticFraudPreventionHeaders(shape, CONTEXT));
    for (const fragment of [
      "203.0.113.77",
      "198.51.100.9",
      "customer-sub-abc",
      "customer-ref-9",
      "Customer Machine",
      "40123",
      "2560",
      "0b5a9a52",
      "0.0.1",
    ]) {
      expect(text).not.toContain(fragment);
    }
  });

  it("has the headers and keys of the shape and breaks no format rule", () => {
    const { shape } = fraudPreventionHeaderShape(WEB);
    const synthetic = syntheticFraudPreventionHeaders(shape, CONTEXT);
    expect(Object.keys(synthetic).sort()).toEqual(Object.keys(WEB).sort());
    expect(checkFraudPreventionHeaderRules(synthetic, "WEB_APP_VIA_SERVER")).toEqual([]);
    expect(fraudPreventionHeaderShape(synthetic).shapeHash).toBe(fraudPreventionHeaderShape(WEB).shapeHash);
  });

  it("uses the time and the two addresses the caller gives", () => {
    const { shape } = fraudPreventionHeaderShape(WEB);
    const synthetic = syntheticFraudPreventionHeaders(shape, CONTEXT);
    expect(synthetic["Gov-Client-Public-IP-Timestamp"]).toBe("2026-11-05T10:00:00.123Z");
    expect(synthetic["Gov-Client-Public-IP"]).toBe("198.51.100.30");
    expect(synthetic["Gov-Vendor-Public-IP"]).toBe("198.51.100.20");
    expect(synthetic["Gov-Vendor-Forwarded"]).toBe("by=198.51.100.20&for=198.51.100.30");
    expect(synthetic["Gov-Vendor-Version"]).toBe("diy-accounting-submit=9.9.9");
    expect(synthetic["Gov-Client-Multi-Factor"]).toContain("type=TOTP");
  });

  it("builds a desktop shape with its device headers", () => {
    const desktop = {
      "Gov-Client-Connection-Method": "DESKTOP_APP_VIA_SERVER",
      "Gov-Client-Device-ID": "0b5a9a52-4d6b-4a53-9a4b-3d5d9a3f1c11",
      "Gov-Client-Local-IPs": "192.168.1.20",
      "Gov-Client-Local-IPs-Timestamp": "2026-01-01T00:00:00.000Z",
      "Gov-Client-MAC-Addresses": "aa%3Abb%3Acc%3Add%3Aee%3Aff",
      "Gov-Client-User-Agent": "os-family=macOS&os-version=14.1&device-manufacturer=Apple&device-model=Mac",
    };
    const { shape } = fraudPreventionHeaderShape(desktop);
    const synthetic = syntheticFraudPreventionHeaders(shape, CONTEXT);
    expect(JSON.stringify(synthetic)).not.toContain("192.168.1.20");
    expect(JSON.stringify(synthetic)).not.toContain("aa%3Abb");
    expect(checkFraudPreventionHeaderRules(synthetic, "DESKTOP_APP_VIA_SERVER")).toEqual([]);
  });

  it("drops a header whose key list is not made of plain key names", () => {
    const synthetic = syntheticFraudPreventionHeaders(
      { connectionMethod: "WEB_APP_VIA_SERVER", headers: { "Gov-Client-User-IDs": "keys:a b,c" }, multiFactorType: "NOPE" },
      CONTEXT,
    );
    expect(synthetic["Gov-Client-User-IDs"]).toBeUndefined();
  });
});
