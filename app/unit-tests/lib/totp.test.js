// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { Secret, TOTP } from "otpauth";
import { base32Decode, totpCode } from "@app/lib/totp.js";

// RFC 6238 appendix B: the SHA-1 secret "12345678901234567890"; the six digit codes are the last
// six digits of the published eight digit codes.
const RFC_SECRET = Secret.fromUTF8("12345678901234567890").base32;

describe("totp", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("gives the RFC 6238 code at %i seconds", (seconds, expected) => {
    expect(totpCode(RFC_SECRET, { now: seconds * 1000 })).toBe(expected);
  });

  it("agrees with otpauth for a random secret across windows", () => {
    const secret = new Secret({ size: 20 }).base32;
    const reference = new TOTP({ secret, digits: 6, period: 30, algorithm: "SHA1" });
    for (const now of [0, 29_999, 30_000, 1_700_000_000_000, 1_700_000_029_999]) {
      expect(totpCode(secret, { now })).toBe(reference.generate({ timestamp: now }));
    }
  });

  it("gives the next window's code with a step offset of one", () => {
    expect(totpCode(RFC_SECRET, { now: 59_000, stepOffset: 1 })).toBe(totpCode(RFC_SECRET, { now: 60_000 }));
  });

  it("decodes lower case, spaces and padding", () => {
    expect(base32Decode("gezd gnbv====").toString()).toBe("12345");
  });

  it("refuses text that is not base32", () => {
    expect(() => base32Decode("not base32!")).toThrow("not base32");
    expect(() => base32Decode("")).toThrow("empty");
  });
});
