// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/unit-tests/rum-visitor-kind.test.js
// Confirms the RUM client tags its session with the same visitor_kind rule the GA4 client
// uses, once consent is granted and the RUM config is present.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const submitJsPath = path.join(process.cwd(), "web/public/submit.bundle.js");
const scriptContent = fs.readFileSync(submitJsPath, "utf-8");

function setUpRum({ userAgent, requestIdPrefix } = {}) {
  const metaTags = {
    "rum:appMonitorId": "test-monitor-123",
    "rum:region": "eu-west-2",
    "rum:identityPoolId": "eu-west-2:pool-456",
    "rum:guestRoleArn": "arn:aws:iam::123456789:role/TestRole",
  };

  global.localStorage = {
    getItem: vi.fn((key) => (key === "consent.rum" ? "granted" : null)),
    setItem: vi.fn(),
  };

  global.sessionStorage = {
    getItem: vi.fn((key) => (key === "requestIdPrefix" ? (requestIdPrefix ?? null) : null)),
  };

  // Node defines a getter-only global.navigator; vi.stubGlobal replaces it safely for the test.
  vi.stubGlobal("navigator", { userAgent: userAgent ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15" });

  const mockElement = () => ({
    appendChild: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    style: {},
    onclick: null,
    addEventListener: vi.fn(),
    innerHTML: "",
  });

  global.document = {
    readyState: "complete",
    querySelector: vi.fn((selector) => {
      const match = selector.match(/meta\[name="(.+?)"\]/);
      return match && metaTags[match[1]] ? { content: metaTags[match[1]] } : null;
    }),
    querySelectorAll: vi.fn(() => []),
    getElementById: vi.fn(() => mockElement()),
    createElement: vi.fn(() => mockElement()),
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
    head: { appendChild: vi.fn() },
  };

  global.window = {
    sessionStorage: global.sessionStorage,
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    location: { href: "http://localhost:3000", origin: "http://localhost:3000", search: "" },
    crypto: {
      getRandomValues: (arr) => arr,
      randomUUID: () => "test-uuid",
      subtle: { digest: vi.fn(async () => new ArrayBuffer(32)) },
    },
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
  };

  global.fetch = vi.fn();

  try {
    eval(scriptContent);
  } catch {
    // Some initialization code may fail in this minimal DOM mock; the RUM queue is what matters.
  }
}

describe("RUM visitor_kind session attribute", () => {
  it("tags a plain visit as human", () => {
    setUpRum();

    const attributesCall = global.window.AwsRumClient.q.find((entry) => entry.c === "addSessionAttributes");
    expect(attributesCall.p).toEqual({ visitor_kind: "human" });
  });

  it("tags a behaviour-test visit as synthetic", () => {
    setUpRum({ requestIdPrefix: "test_" });

    const attributesCall = global.window.AwsRumClient.q.find((entry) => entry.c === "addSessionAttributes");
    expect(attributesCall.p).toEqual({ visitor_kind: "synthetic" });
  });

  it("tags a canary visit as bot", () => {
    setUpRum({ userAgent: "DIYAccounting-Probe-Monitor/1.0" });

    const attributesCall = global.window.AwsRumClient.q.find((entry) => entry.c === "addSessionAttributes");
    expect(attributesCall.p).toEqual({ visitor_kind: "bot" });
  });
});
