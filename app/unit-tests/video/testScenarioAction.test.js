// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/testScenarioAction.test.js
//
// The testScenario action sets the hidden Gov-Test-Scenario select so HMRC's sandbox answers a
// VAT read with sample data. It runs a function in the page, so the page here is a stand-in that
// runs that function against a small fake document.

import { describe, test, expect, vi } from "vitest";
import { executeAction, SceneStepError } from "../../../scripts/lib/video/actions.js";

function fakeSelect(optionValues) {
  return {
    value: "",
    options: optionValues.map((value) => ({ value })),
    dispatched: [],
    dispatchEvent(event) {
      this.dispatched.push(event.type);
    },
  };
}

function pageWithSelect(select) {
  return {
    evaluate: vi.fn(async (fn, arg) => {
      globalThis.document = { querySelector: (selector) => (selector === "#testScenario" ? select : null) };
      try {
        return fn(arg);
      } finally {
        delete globalThis.document;
      }
    }),
    screenshot: vi.fn().mockResolvedValue(undefined),
  };
}

const ctx = { sceneId: "payments-form", stepIndex: 5, stillsDir: "target/videos/test-stills" };

describe("testScenario action", () => {
  test("sets the select's value and announces the change", async () => {
    const select = fakeSelect(["", "SINGLE_PAYMENT", "MULTIPLE_PAYMENTS_2018_19"]);
    const result = await executeAction(pageWithSelect(select), { action: "testScenario", value: "MULTIPLE_PAYMENTS_2018_19" }, ctx);
    expect(select.value).toBe("MULTIPLE_PAYMENTS_2018_19");
    expect(select.dispatched).toEqual(["change"]);
    expect(result).toEqual({ waitMs: 0, rect: null });
  });

  test("fails naming the option when the page does not offer it", async () => {
    const select = fakeSelect(["", "SINGLE_PAYMENT"]);
    await expect(executeAction(pageWithSelect(select), { action: "testScenario", value: "RENAMED_SCENARIO" }, ctx)).rejects.toThrow(
      /no option "RENAMED_SCENARIO"/,
    );
    expect(select.value).toBe("");
  });

  test("fails with a SceneStepError when the page has no select", async () => {
    const page = pageWithSelect(null);
    await expect(executeAction(page, { action: "testScenario", value: "SINGLE_PAYMENT" }, ctx)).rejects.toBeInstanceOf(SceneStepError);
  });
});
