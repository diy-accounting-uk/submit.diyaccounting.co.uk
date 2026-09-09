// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/visitorClassifier.test.js

import { describe, test, expect } from "vitest";
import { classifyVisitor } from "@app/lib/visitorClassifier.js";

describe("lib/visitorClassifier", () => {
  describe("AI agents", () => {
    test("detects ClaudeDesktop", () => {
      expect(classifyVisitor("Mozilla/5.0 ClaudeDesktop/1.0")).toBe("ai-agent");
    });

    test("detects ChatGPT-User", () => {
      expect(classifyVisitor("Mozilla/5.0 ChatGPT-User/1.0")).toBe("ai-agent");
    });

    test("detects Perplexity-User", () => {
      expect(classifyVisitor("Mozilla/5.0 Perplexity-User")).toBe("ai-agent");
    });

    test("detects Google-Extended", () => {
      expect(classifyVisitor("Mozilla/5.0 Google-Extended")).toBe("ai-agent");
    });
  });

  describe("crawlers", () => {
    test("detects Googlebot", () => {
      expect(classifyVisitor("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe("crawler");
    });

    test("detects Bingbot", () => {
      expect(classifyVisitor("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")).toBe("crawler");
    });

    test("detects Applebot", () => {
      expect(classifyVisitor("Mozilla/5.0 Applebot/0.1")).toBe("crawler");
    });

    test("detects DuckDuckBot", () => {
      expect(classifyVisitor("DuckDuckBot/1.0")).toBe("crawler");
    });

    test("detects YandexBot", () => {
      expect(classifyVisitor("Mozilla/5.0 (compatible; YandexBot/3.0)")).toBe("crawler");
    });

    test("detects Baiduspider", () => {
      expect(classifyVisitor("Mozilla/5.0 (compatible; Baiduspider/2.0)")).toBe("crawler");
    });
  });

  describe("standard browsers (human)", () => {
    test("Chrome on Windows", () => {
      expect(classifyVisitor("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")).toBe("human");
    });

    test("Safari on macOS", () => {
      expect(classifyVisitor("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15")).toBe("human");
    });

    test("Firefox on Linux", () => {
      expect(classifyVisitor("Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0")).toBe("human");
    });
  });

  describe("edge cases", () => {
    test("returns 'human' for null", () => {
      expect(classifyVisitor(null)).toBe("human");
    });

    test("returns 'human' for undefined", () => {
      expect(classifyVisitor(undefined)).toBe("human");
    });

    test("returns 'human' for empty string", () => {
      expect(classifyVisitor("")).toBe("human");
    });
  });
});
