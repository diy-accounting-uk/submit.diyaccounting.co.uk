// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/visitorClassifier.test.js

import { describe, test, expect } from "vitest";
import { classifyVisitor, classifyBot } from "@app/lib/visitorClassifier.js";

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

  describe("synthetic (our own automated browsers)", () => {
    test("detects the Playwright suite marker appended to a real Chrome user agent", () => {
      expect(
        classifyVisitor(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 DIYAccountingProbe/1",
        ),
      ).toBe("synthetic");
    });

    test("detects the CloudWatch Synthetics canary user agent", () => {
      expect(classifyVisitor("DIYAccounting-Probe-Monitor/1.0")).toBe("synthetic");
    });

    test("is case-insensitive", () => {
      expect(classifyVisitor("mozilla/5.0 diyaccountingprobe/2")).toBe("synthetic");
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

  describe("classifyBot", () => {
    test("returns none for a standard browser", () => {
      expect(classifyBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")).toBe("none");
    });

    test("returns none for a phone whose model name ends in bot", () => {
      expect(
        classifyBot("Mozilla/5.0 (Linux; Android 12; CUBOT X30 Build/SP1A) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"),
      ).toBe("none");
    });

    test("returns none for the browsers and in-app browsers people use", () => {
      const people = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/437.0.0.36.111;FBDV/iPhone14,2;FBSN/iOS;FBSV/17.0]",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0.665236494 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
      ];
      for (const userAgent of people) expect(classifyBot(userAgent), userAgent).toBe("none");
    });

    test("returns none for a person in a desktop app's embedded browser", () => {
      expect(
        classifyBot(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.289 Electron/25.9.7 Safari/537.36",
        ),
      ).toBe("none");
      expect(
        classifyBot(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Notion/3.14.0 Chrome/124.0.6367.243 Electron/30.4.0 Safari/537.36",
        ),
      ).toBe("none");
    });

    test("returns automated for a headless Electron", () => {
      expect(
        classifyBot(
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.6367.243 Electron/30.4.0 Safari/537.36",
        ),
      ).toBe("automated");
    });

    test("returns automated for a headless browser", () => {
      expect(classifyBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0 Safari/537.36")).toBe("automated");
    });

    test("returns automated for a bot the crawler list does not name", () => {
      expect(classifyBot("Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)")).toBe("automated");
      expect(classifyBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2)")).toBe("automated");
    });

    test("returns automated for an HTTP library", () => {
      expect(classifyBot("python-requests/2.31.0")).toBe("automated");
      expect(classifyBot("curl/8.4.0")).toBe("automated");
    });

    test("returns automated for a page-speed tool", () => {
      expect(classifyBot("Mozilla/5.0 (Linux; Android 11) Chrome/120.0 Mobile Safari/537.36 Chrome-Lighthouse")).toBe("automated");
    });

    test("returns automated for an empty or missing user agent", () => {
      expect(classifyBot("")).toBe("automated");
      expect(classifyBot(undefined)).toBe("automated");
    });

    test("keeps the visitor kinds that classifyVisitor names", () => {
      expect(classifyBot("Mozilla/5.0 ChatGPT-User/1.0")).toBe("ai-agent");
      expect(classifyBot("Googlebot/2.1")).toBe("crawler");
      expect(classifyBot("DIYAccounting-Probe-Monitor/1.0")).toBe("synthetic");
    });
  });
});
