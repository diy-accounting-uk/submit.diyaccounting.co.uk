// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/visitor-kind.test.js

import { describe, it, expect, afterEach, vi } from "vitest";

import { classifyVisitorKind } from "../public/lib/utils/visitor-kind.js";

describe("classifyVisitorKind", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifies a plain browser as human", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });

    expect(classifyVisitorKind()).toBe("human");
  });

  it("classifies a search crawler as bot", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });

    expect(classifyVisitorKind()).toBe("bot");
  });

  it("classifies an AI agent as bot", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 ChatGPT-User/1.0" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });

    expect(classifyVisitorKind()).toBe("bot");
  });

  it("classifies the CloudWatch Synthetics canaries as bot", () => {
    vi.stubGlobal("navigator", { userAgent: "DIYAccounting-Probe-Monitor/1.0" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });

    expect(classifyVisitorKind()).toBe("bot");
  });

  it("classifies a behaviour-test session as synthetic", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) HeadlessChrome/120.0" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn((key) => (key === "requestIdPrefix" ? "test_" : null)) });

    expect(classifyVisitorKind()).toBe("synthetic");
  });

  it("classifies a browser flagged by the operator bundle as operator", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });
    vi.stubGlobal("localStorage", { getItem: vi.fn((key) => (key === "visitorKind.operator" ? "1" : null)) });

    expect(classifyVisitorKind()).toBe("operator");
  });

  it("prefers synthetic and bot over operator", () => {
    const flagged = { getItem: vi.fn((key) => (key === "visitorKind.operator" ? "1" : null)) };
    vi.stubGlobal("localStorage", flagged);
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 HeadlessChrome/120.0" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn((key) => (key === "requestIdPrefix" ? "test_" : null)) });
    expect(classifyVisitorKind()).toBe("synthetic");

    vi.stubGlobal("navigator", { userAgent: "Googlebot/2.1" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });
    expect(classifyVisitorKind()).toBe("bot");
  });

  it("falls back to human when localStorage throws", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 AppleWebKit/605.1.15" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    });

    expect(classifyVisitorKind()).toBe("human");
  });

  it("prefers bot over synthetic when both markers are present", () => {
    vi.stubGlobal("navigator", { userAgent: "DIYAccounting-Probe-Monitor/1.0" });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn((key) => (key === "requestIdPrefix" ? "test_" : null)) });

    expect(classifyVisitorKind()).toBe("bot");
  });

  it("falls back to human when navigator is unavailable", () => {
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null) });

    expect(classifyVisitorKind()).toBe("human");
  });

  it("falls back to human when sessionStorage throws", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0" });
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    });

    expect(classifyVisitorKind()).toBe("human");
  });
});
