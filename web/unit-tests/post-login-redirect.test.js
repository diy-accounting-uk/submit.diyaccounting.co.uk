// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/post-login-redirect.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("post-login-redirect", () => {
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/post-login-redirect.js");
  });

  it("returns a stored root path unchanged, with its query", () => {
    expect(window.postLoginRedirectTarget("/bundles.html?pass=prowl-ranch-shark-storm")).toBe("/bundles.html?pass=prowl-ranch-shark-storm");
    expect(window.postLoginRedirectTarget("/operator/dashboard.html")).toBe("/operator/dashboard.html");
  });

  it("never yields a path that starts with two slashes", () => {
    expect(window.postLoginRedirectTarget("/bundles.html")).not.toMatch(/^\/\//);
  });

  it("sends a protocol-relative, absolute or relative value to the home page", () => {
    expect(window.postLoginRedirectTarget("//evil.example/x")).toBe("/");
    expect(window.postLoginRedirectTarget("/\\evil.example")).toBe("/");
    expect(window.postLoginRedirectTarget("https://evil.example/")).toBe("/");
    expect(window.postLoginRedirectTarget("bundles.html")).toBe("/");
    expect(window.postLoginRedirectTarget(null)).toBe("/");
  });
});
