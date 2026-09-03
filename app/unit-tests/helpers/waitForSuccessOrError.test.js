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

// Returns the entries for call N (1-based), clamped to the last entry once the sequence is
// exhausted so a test only needs to describe the polls where the state actually changes.
function atCall(sequence, callNumber) {
  return sequence[Math.min(callNumber, sequence.length) - 1];
}

// A fake Playwright Page. `locator(selector)` returns an object whose `.all()` resolves to the
// matches configured for that selector, and whose `.isVisible()` / `.innerText()` cover the
// single-match callers (success selector, status container).
//
// `errorMatchesSequence` lets a test vary what's visible from one call to the next: call #1 is
// the baseline snapshot taken before the wait loop starts, and each call after that is one poll
// — so `[[], [errA]]` models an error banner that wasn't there when the wait began but appears
// on the first poll. `successVisibleSequence` does the same for the success selector.
function makeFakePage({ errorMatchesSequence = [[]], successVisibleSequence = [false], statusText = "" } = {}) {
  let errorCallCount = 0;
  let successCallCount = 0;
  return {
    locator: vi.fn((selector) => {
      if (selector === "#statusMessagesContainer .status-message.status-error") {
        return {
          all: vi.fn().mockImplementation(() => {
            errorCallCount++;
            return Promise.resolve(atCall(errorMatchesSequence, errorCallCount));
          }),
        };
      }
      if (selector === "#statusMessagesContainer") {
        return makeLocator({ visible: true, text: statusText });
      }
      if (selector === "#loadingSpinner") {
        return makeLocator({ visible: false, text: "" });
      }
      // Success selector
      return {
        isVisible: vi.fn().mockImplementation(() => {
          successCallCount++;
          return Promise.resolve(atCall(successVisibleSequence, successCallCount));
        }),
      };
    }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  };
}

describe("waitForSuccessOrError", () => {
  test("fails fast when two new error banners appear after the wait begins", async () => {
    const page = makeFakePage({
      errorMatchesSequence: [
        [],
        [makeLocator({ visible: true, text: "Failed to load data" }), makeLocator({ visible: true, text: "Request failed" })],
      ],
    });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).rejects.toThrow(/FAIL FAST/);
  });

  test("fails fast when a single new error banner appears after the wait begins", async () => {
    const page = makeFakePage({
      errorMatchesSequence: [[], [makeLocator({ visible: true, text: "Request failed" })]],
    });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).rejects.toThrow(/FAIL FAST/);
  });

  test("resolves when the success selector is visible and no error banner is visible", async () => {
    const page = makeFakePage({ errorMatchesSequence: [[]], successVisibleSequence: [true] });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).resolves.toBeUndefined();
  });

  test("ignores error elements matched but not visible", async () => {
    const page = makeFakePage({
      errorMatchesSequence: [[makeLocator({ visible: false, text: "Failed to load data" })]],
      successVisibleSequence: [true],
    });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).resolves.toBeUndefined();
  });

  test("a pre-existing error banner does not fail the wait when the success element appears", async () => {
    // The same error banner is visible from before the wait starts through to success —
    // e.g. a stale banner from an earlier, already-abandoned attempt that the page never
    // cleared. It must not fail a wait for a fresh attempt that goes on to succeed.
    const staleError = () => makeLocator({ visible: true, text: "Failed to retrieve return: Not found for the specified query" });
    const page = makeFakePage({
      errorMatchesSequence: [[staleError()], [staleError()]],
      successVisibleSequence: [false, true],
    });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).resolves.toBeUndefined();
  });

  test("a new error banner after the wait starts still fails fast even with a pre-existing one present", async () => {
    // One error banner was already up when the wait began (and stays up); a second, different
    // one appears on the next poll — that second one must still fail fast.
    const staleError = () => makeLocator({ visible: true, text: "Failed to retrieve return: Not found for the specified query" });
    const newError = () => makeLocator({ visible: true, text: "Access token expired. Please try again." });
    const page = makeFakePage({
      errorMatchesSequence: [[staleError()], [staleError(), newError()]],
    });

    await expect(waitForSuccessOrError(page, { successSelector: "#result", pollIntervalMs: 1 })).rejects.toThrow(/FAIL FAST/);
  });
});
