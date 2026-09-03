// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/helpers/waitForSuccessOrError.test.js
// Unit tests for the behaviour-test polling helper

import { describe, test, expect, vi } from "vitest";
import { waitForSuccessOrError } from "../../../behaviour-tests/helpers/waitForSuccessOrError.js";

function makeLocator({ visible = false, text = "" } = {}) {
  return {
    isVisible: vi.fn().mockResolvedValue(visible),
    innerText: vi.fn().mockResolvedValue(text),
  };
}

// A fake Playwright Page. `locator(selector)` returns an object whose `.all()`
// resolves to the matches configured for that selector, and whose `.isVisible()`
// / `.innerText()` cover the single-match callers (success selector, status container).
function makeFakePage({ errorMatches = [], successVisible = false, statusText = "" } = {}) {
  const successLocator = makeLocator({ visible: successVisible, text: statusText });
  return {
    locator: vi.fn((selector) => {
      if (selector === "#statusMessagesContainer .status-message.status-error") {
        return {
          all: vi.fn().mockResolvedValue(errorMatches),
          isVisible: vi.fn().mockResolvedValue(errorMatches.some((m) => m.visible)),
          innerText: vi.fn().mockResolvedValue(errorMatches[0]?.text ?? ""),
        };
      }
      if (selector === "#statusMessagesContainer") {
        return makeLocator({ visible: true, text: statusText });
      }
      if (selector === "#loadingSpinner") {
        return makeLocator({ visible: false, text: "" });
      }
      return successLocator;
    }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  };
}

describe("waitForSuccessOrError", () => {
  test("fails fast when two error banners are visible at once", async () => {
    const page = makeFakePage({
      errorMatches: [makeLocator({ visible: true, text: "Failed to load data" }), makeLocator({ visible: true, text: "Request failed" })],
    });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).rejects.toThrow(/FAIL FAST/);
  });

  test("fails fast when a single error banner is visible", async () => {
    const page = makeFakePage({
      errorMatches: [makeLocator({ visible: true, text: "Request failed" })],
    });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).rejects.toThrow(/FAIL FAST/);
  });

  test("resolves when the success selector is visible and no error banner is visible", async () => {
    const page = makeFakePage({ errorMatches: [], successVisible: true });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).resolves.toBeUndefined();
  });

  test("ignores error elements matched but not visible", async () => {
    const page = makeFakePage({
      errorMatches: [makeLocator({ visible: false, text: "Failed to load data" })],
      successVisible: true,
    });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).resolves.toBeUndefined();
  });
});
