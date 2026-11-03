// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { base64UrlEncode, generateCodeVerifier, computeCodeChallenge } from "../public/lib/utils/crypto-utils.js";

describe("PKCE helpers", () => {
  it("computes the RFC 7636 appendix B S256 challenge", async () => {
    const challenge = await computeCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");

    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("generates a 43 character base64url verifier", () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("generates a different verifier each time", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });

  it("encodes bytes as unpadded base64url", () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 254]))).toBe("-__-");
    expect(base64UrlEncode(new Uint8Array([1]))).toBe("AQ");
  });
});
