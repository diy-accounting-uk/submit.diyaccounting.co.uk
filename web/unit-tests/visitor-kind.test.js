// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
