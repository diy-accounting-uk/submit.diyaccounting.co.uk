// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/journey.test.js

import { describe, test, expect, vi, afterEach } from "vitest";
import { resolveHmrcTestUser, credentialFieldMaskInitScript } from "../../../scripts/lib/video/journey.js";

const baseEnv = {
  TEST_HMRC_USERNAME: "user123456789",
  TEST_HMRC_PASSWORD: "correcthorsebatterystaple",
  TEST_HMRC_VAT_NUMBER: "193054661",
};

describe("resolveHmrcTestUser", () => {
  test("defaults hmrcServices to mtd-vat when the script names none, and resolves no nino", async () => {
    const user = await resolveHmrcTestUser(baseEnv);
    expect(user.vatNumber).toBe("193054661");
    expect(user.nino).toBeUndefined();
  });

  test("resolves TEST_HMRC_NINO when the script's hmrcServices asks for mtd-income-tax", async () => {
    const env = { ...baseEnv, TEST_HMRC_NINO: "AB123456C" };
    const user = await resolveHmrcTestUser(env, ["mtd-vat", "mtd-income-tax"]);
    expect(user.nino).toBe("AB123456C");
  });

  test("ignores TEST_HMRC_NINO when the script never asked for mtd-income-tax", async () => {
    const env = { ...baseEnv, TEST_HMRC_NINO: "AB123456C" };
    const user = await resolveHmrcTestUser(env, ["mtd-vat"]);
    expect(user.nino).toBeUndefined();
  });

  test("refuses to resolve when the script asks for mtd-income-tax but TEST_HMRC_NINO is missing", async () => {
    await expect(resolveHmrcTestUser(baseEnv, ["mtd-vat", "mtd-income-tax"])).rejects.toThrow(/TEST_HMRC_NINO/);
  });
});

// credentialFieldMaskInitScript runs as a Playwright addInitScript body, at the very start of a
// new document — sometimes before document.documentElement exists. A fake document,
// MutationObserver and requestAnimationFrame stand in for the browser globals it reads
// ambiently (an addInitScript body cannot take them as real parameters).
describe("credentialFieldMaskInitScript", () => {
  afterEach(() => {
    delete globalThis.document;
    delete globalThis.MutationObserver;
    delete globalThis.requestAnimationFrame;
  });

  function fakeDocument(documentElement) {
    return { documentElement, addEventListener: vi.fn(), querySelectorAll: vi.fn().mockReturnValue([]) };
  }

  test("observes document.documentElement immediately when it already exists", () => {
    globalThis.document = fakeDocument({});
    const observe = vi.fn();
    globalThis.MutationObserver = class {
      constructor() {
        this.observe = observe;
      }
    };
    globalThis.requestAnimationFrame = vi.fn();

    credentialFieldMaskInitScript({ selectors: "input" });

    expect(observe).toHaveBeenCalledWith(globalThis.document.documentElement, { childList: true, subtree: true });
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
  });

  test("retries on the next animation frame, with no throw, until documentElement exists", () => {
    const doc = fakeDocument(null);
    globalThis.document = doc;
    const observe = vi.fn();
    globalThis.MutationObserver = class {
      constructor() {
        this.observe = observe;
      }
    };
    const frames = [];
    globalThis.requestAnimationFrame = vi.fn((cb) => frames.push(cb));

    expect(() => credentialFieldMaskInitScript({ selectors: "input" })).not.toThrow();
    expect(observe).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    doc.documentElement = {};
    frames.shift()();

    expect(observe).toHaveBeenCalledWith(doc.documentElement, { childList: true, subtree: true });
  });
});
