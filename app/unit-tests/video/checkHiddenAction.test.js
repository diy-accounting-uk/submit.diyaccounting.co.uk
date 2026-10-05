// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/checkHiddenAction.test.js
//
// The checkHidden action ticks a checkbox kept in the developer section without showing the
// panel. It runs a function in the page, so the page here is a stand-in that runs that function
// against a small fake document.

import { describe, test, expect, vi } from "vitest";
import { executeAction, SceneStepError } from "../../../scripts/lib/video/actions.js";

function fakeCheckbox() {
  return {
    checked: false,
    dispatched: [],
    dispatchEvent(event) {
      this.dispatched.push(event.type);
    },
  };
}

function pageWithCheckbox(checkbox) {
  return {
    evaluate: vi.fn(async (fn, arg) => {
      globalThis.document = { querySelector: (selector) => (selector === "#allowSyntheticObligations" ? checkbox : null) };
      try {
        return fn(arg);
      } finally {
        delete globalThis.document;
      }
    }),
    screenshot: vi.fn().mockResolvedValue(undefined),
  };
}

const ctx = { sceneId: "submit-form", stepIndex: 3, stillsDir: "target/videos/test-stills" };

describe("checkHidden action", () => {
  test("ticks the box and announces the change", async () => {
    const checkbox = fakeCheckbox();
    const result = await executeAction(pageWithCheckbox(checkbox), { action: "checkHidden", target: "#allowSyntheticObligations" }, ctx);
    expect(checkbox.checked).toBe(true);
    expect(checkbox.dispatched).toEqual(["change"]);
    expect(result).toEqual({ waitMs: 0, rect: null });
  });

  test("fails with a SceneStepError when the page has no such box", async () => {
    const page = pageWithCheckbox(null);
    await expect(executeAction(page, { action: "checkHidden", target: "#allowSyntheticObligations" }, ctx)).rejects.toBeInstanceOf(
      SceneStepError,
    );
  });
});
