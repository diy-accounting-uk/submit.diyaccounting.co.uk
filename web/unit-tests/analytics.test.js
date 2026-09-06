// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/unit-tests/analytics.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

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
});
