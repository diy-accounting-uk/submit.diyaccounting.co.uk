// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/session-beacon.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const scriptContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/session-beacon.js"), "utf-8");

describe("web/public/lib/session-beacon.js", () => {
  let sentRequests;
  let documentListeners;

  function acceptBanner() {
    global.localStorage.getItem = vi.fn((key) => (key === "consent.analytics" ? "granted" : storedAttribution(key)));
    for (const listener of documentListeners["consent-granted"] || []) listener();
  }
  let storedAttribution = () => null;

  beforeEach(() => {
    sentRequests = [];
    documentListeners = {};
    storedAttribution = () => null;
    global.document = {
      addEventListener: vi.fn((name, listener) => {
        (documentListeners[name] ||= []).push(listener);
      }),
    };

    global.sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };

    global.localStorage = { getItem: vi.fn(() => null) };

    global.window = { location: { pathname: "/index.html" } };

    global.XMLHttpRequest = class {
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn((body) => sentRequests.push(body));
    };
  });

  describe("before consent", () => {
    it("sends nothing and leaves the session flag unset", () => {
      eval(scriptContent);

      expect(sentRequests).toHaveLength(0);
      expect(global.sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it("sends nothing after the visitor declines", () => {
      eval(scriptContent);
      global.localStorage.getItem = vi.fn((key) => (key === "consent.analytics" ? "declined" : null));
      for (const listener of documentListeners["consent-declined"] || []) listener();

      expect(sentRequests).toHaveLength(0);
      expect(global.sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it("sends once when the visitor accepts", () => {
      eval(scriptContent);
      acceptBanner();

      expect(global.sessionStorage.setItem).toHaveBeenCalledWith("__diy_session__", "1");
      expect(sentRequests).toHaveLength(1);
    });
  });

  describe("after consent", () => {
    beforeEach(() => {
      global.localStorage.getItem = vi.fn((key) => (key === "consent.analytics" ? "granted" : storedAttribution(key)));
    });

    it("fires once per browser session", () => {
      eval(scriptContent);

      expect(global.sessionStorage.setItem).toHaveBeenCalledWith("__diy_session__", "1");
      expect(sentRequests).toHaveLength(1);
    });

    it("skips firing when a session beacon has already fired", () => {
      global.sessionStorage.getItem = vi.fn(() => "1");

      eval(scriptContent);

      expect(sentRequests).toHaveLength(0);
    });

    it("sends the page with no attribution fields when none are stored", () => {
      eval(scriptContent);

      expect(JSON.parse(sentRequests[0])).toEqual({ page: "/index.html" });
    });

    it("carries the stored landing attribution fields alongside the page", () => {
      storedAttribution = (key) =>
        key === "attribution.landing"
          ? JSON.stringify({ utmSource: "google", gclid: "abc123", landedAt: "2026-01-01T00:00:00.000Z" })
          : null;
      global.localStorage.getItem = vi.fn((key) => (key === "consent.analytics" ? "granted" : storedAttribution(key)));

      eval(scriptContent);

      expect(JSON.parse(sentRequests[0])).toEqual({
        page: "/index.html",
        utmSource: "google",
        gclid: "abc123",
        landedAt: "2026-01-01T00:00:00.000Z",
      });
    });

    it("sends just the page when the stored attribution is not valid JSON", () => {
      global.localStorage.getItem = vi.fn((key) =>
        key === "consent.analytics" ? "granted" : key === "attribution.landing" ? "not-json" : null,
      );

      eval(scriptContent);

      expect(JSON.parse(sentRequests[0])).toEqual({ page: "/index.html" });
    });
  });
});
