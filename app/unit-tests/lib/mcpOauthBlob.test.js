// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { signBlob, verifyBlob } from "@app/lib/mcpOauthBlob.js";

const KEY = "k".repeat(64);
const OTHER_KEY = "o".repeat(64);
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

describe("mcpOauthBlob", () => {
  it("round-trips the fields and strips typ and exp", () => {
    const blob = signBlob({ clientId: "diya-submit-dcr", state: "abc" }, KEY, { typ: "consent", ttlSeconds: 600, now: NOW });
    expect(blob).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyBlob(blob, KEY, "consent", { now: NOW + 1000 })).toEqual({
      ok: true,
      fields: { clientId: "diya-submit-dcr", state: "abc" },
    });
  });

  it("refuses a blob signed with another key", () => {
    const blob = signBlob({ a: 1 }, OTHER_KEY, { typ: "code", ttlSeconds: 60, now: NOW });
    expect(verifyBlob(blob, KEY, "code", { now: NOW })).toEqual({ ok: false, reason: "bad_mac" });
  });

  it("refuses a tampered payload", () => {
    const blob = signBlob({ clientId: "a" }, KEY, { typ: "code", ttlSeconds: 60, now: NOW });
    const [, mac] = blob.split(".");
    const forged = Buffer.from(JSON.stringify({ clientId: "b", typ: "code", exp: NOW / 1000 + 60 })).toString("base64url");
    expect(verifyBlob(`${forged}.${mac}`, KEY, "code", { now: NOW })).toEqual({ ok: false, reason: "bad_mac" });
  });

  it("refuses a tampered or truncated MAC", () => {
    const blob = signBlob({ clientId: "a" }, KEY, { typ: "code", ttlSeconds: 60, now: NOW });
    const [payload, mac] = blob.split(".");
    const flipped = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
    expect(verifyBlob(`${payload}.${flipped}`, KEY, "code", { now: NOW }).reason).toBe("bad_mac");
    expect(verifyBlob(`${payload}.${mac.slice(0, 10)}`, KEY, "code", { now: NOW }).reason).toBe("bad_mac");
  });

  it("refuses the wrong typ", () => {
    const blob = signBlob({ a: 1 }, KEY, { typ: "upstream", ttlSeconds: 60, now: NOW });
    expect(verifyBlob(blob, KEY, "consent", { now: NOW })).toEqual({ ok: false, reason: "wrong_typ" });
  });

  it("refuses an expired blob, including at the exact expiry second", () => {
    const blob = signBlob({ a: 1 }, KEY, { typ: "code", ttlSeconds: 300, now: NOW });
    expect(verifyBlob(blob, KEY, "code", { now: NOW + 299_000 }).ok).toBe(true);
    expect(verifyBlob(blob, KEY, "code", { now: NOW + 300_000 })).toEqual({ ok: false, reason: "expired" });
  });

  it.each([undefined, null, 42, "", "nodot", "a.b.c", "a b.c", "x".repeat(9000)])("refuses malformed input %#", (blob) => {
    expect(verifyBlob(blob, KEY, "code", { now: NOW })).toEqual({ ok: false, reason: "malformed" });
  });

  it("cannot be made to override typ or exp through the fields", () => {
    const blob = signBlob({ typ: "code", exp: 9999999999 }, KEY, { typ: "consent", ttlSeconds: 1, now: NOW });
    expect(verifyBlob(blob, KEY, "code", { now: NOW }).reason).toBe("wrong_typ");
    expect(verifyBlob(blob, KEY, "consent", { now: NOW + 2000 }).reason).toBe("expired");
  });

  it("refuses a short key and a missing typ", () => {
    expect(() => signBlob({}, "short", { typ: "code", ttlSeconds: 60 })).toThrow(/at least 32/);
    expect(() => verifyBlob("a.b", "short", "code")).toThrow(/at least 32/);
    expect(() => signBlob({}, KEY, { ttlSeconds: 60 })).toThrow(/typ/);
    expect(() => signBlob({}, KEY, { typ: "code", ttlSeconds: 0 })).toThrow(/ttlSeconds/);
  });
});
