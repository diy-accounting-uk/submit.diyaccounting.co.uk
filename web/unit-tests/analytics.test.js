// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/unit-tests/analytics.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "@iarna/toml";

import { classifyVisitorKind } from "../public/lib/utils/visitor-kind.js";

const scriptContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/analytics.js"), "utf-8");

// Flushes the microtask queue so the script's fetch().then() chain settles before assertions run.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("web/public/lib/analytics.js", () => {
  let headScripts;
  let dataLayerPushes;
  let fetchResponseText;

  beforeEach(() => {
    headScripts = [];
    dataLayerPushes = [];
    fetchResponseText = "GA4_MEASUREMENT_ID=G-TESTMEASURE\n";

    global.localStorage = {
      getItem: vi.fn(() => null),
    };

    global.sessionStorage = {
      getItem: vi.fn(() => null),
    };

    // Node defines a getter-only global.navigator; vi.stubGlobal replaces it safely for the test.
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15" });

    global.document = {
      head: {
        appendChild: vi.fn((el) => headScripts.push(el)),
      },
      createElement: vi.fn(() => ({ async: false, src: "" })),
    };

    // The script assigns to bare `dataLayer` (relying on `window === globalThis`, true in a
    // real browser); aliasing window to the Node global reproduces that for eval'd script scope.
    global.window = global;
    delete global.dataLayer;
    delete global.gtag;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(fetchResponseText),
      }),
    );

    global.console = { ...console, warn: vi.fn() };
  });

  it("loads gtag.js and configures it with the id read from /submit.env", async () => {
    eval(scriptContent);
    // Capture dataLayer pushes made after the eval, via the global gtag/dataLayer the script defines.
    dataLayerPushes = global.dataLayer;

    await flushPromises();

    expect(global.fetch).toHaveBeenCalledWith("/submit.env", { cache: "no-store" });
    expect(headScripts).toHaveLength(1);
    expect(headScripts[0].src).toBe("https://www.googletagmanager.com/gtag/js?id=G-TESTMEASURE");
    expect(dataLayerPushes.some((args) => args[0] === "config" && args[1] === "G-TESTMEASURE")).toBe(true);
  });

  it("does not load gtag.js when the measurement id is blank", async () => {
    fetchResponseText = "GA4_MEASUREMENT_ID=\n";

    eval(scriptContent);
    dataLayerPushes = global.dataLayer;

    await flushPromises();

    expect(headScripts).toHaveLength(0);
    expect(dataLayerPushes.some((args) => args[0] === "config")).toBe(false);
  });

  it("configures the GA4 linker for the three shared-property hosts", async () => {
    eval(scriptContent);
    dataLayerPushes = global.dataLayer;

    await flushPromises();

    const configCall = dataLayerPushes.find((args) => args[0] === "config" && args[1] === "G-TESTMEASURE");
    expect(configCall[2]).toEqual({
      linker: { domains: ["diyaccounting.co.uk", "spreadsheets.diyaccounting.co.uk", "submit.diyaccounting.co.uk"] },
    });
  });

  it("tags a plain visit as human", () => {
    eval(scriptContent);
    dataLayerPushes = global.dataLayer;

    expect(dataLayerPushes.some((args) => args[0] === "set" && args[1] === "user_properties" && args[2].visitor_kind === "human")).toBe(
      true,
    );
  });

  it("tags a behaviour-test visit as synthetic", () => {
    global.sessionStorage.getItem = vi.fn((key) => (key === "requestIdPrefix" ? "test_" : null));

    eval(scriptContent);
    dataLayerPushes = global.dataLayer;

    expect(
      dataLayerPushes.some((args) => args[0] === "set" && args[1] === "user_properties" && args[2].visitor_kind === "synthetic"),
    ).toBe(true);
  });

  it("tags a canary visit as bot", () => {
    global.navigator.userAgent = "DIYAccounting-Probe-Monitor/1.0";

    eval(scriptContent);
    dataLayerPushes = global.dataLayer;

    expect(dataLayerPushes.some((args) => args[0] === "set" && args[1] === "user_properties" && args[2].visitor_kind === "bot")).toBe(
      true,
    );
  });

  it("keeps its bot user-agent list in step with lib/utils/visitor-kind.js", () => {
    const match = scriptContent.match(/const GA4_BOT_USER_AGENT_PATTERNS = \[([\s\S]*?)];/);
    expect(match).not.toBeNull();
    const inlinePatterns = match[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => JSON.parse(entry));

    vi.stubGlobal("navigator", { userAgent: "diyaccounting-probe-monitor/1.0" });
    global.sessionStorage = { getItem: () => null };
    expect(inlinePatterns).toContain("diyaccounting-probe-monitor");
    expect(classifyVisitorKind()).toBe("bot");
  });

  it("keeps its linker domains in step with google-analytics.toml's streams", () => {
    const toml = parseToml(fs.readFileSync(path.join(process.cwd(), "google-analytics.toml"), "utf-8"));
    const tomlHosts = Object.values(toml.streams).map((stream) => new URL(stream.url).host);

    const match = scriptContent.match(/const GA4_LINKER_DOMAINS = \[([\s\S]*?)];/);
    expect(match).not.toBeNull();
    const inlineDomains = match[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => JSON.parse(entry));

    expect(inlineDomains.sort()).toEqual(tomlHosts.sort());
  });
});
