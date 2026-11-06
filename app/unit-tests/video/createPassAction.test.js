// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/createPassAction.test.js
//
// The createPass action creates a pass without redeeming it and keeps its code as {{passCode}},
// so a later type step can enter it in the pass box. The page here is a stand-in that returns the
// admin API's answer to the bundle step function.

import { describe, test, expect, vi } from "vitest";
import { executeAction, SceneStepError } from "../../../scripts/lib/video/actions.js";
import { substituteValues } from "../../../scripts/lib/video/values.js";

function pageAnswering(result) {
  return { evaluate: vi.fn().mockResolvedValue(result), screenshot: vi.fn().mockResolvedValue(undefined) };
}

function contextWith(values) {
  return { sceneId: "make-pass", stepIndex: 1, stillsDir: "target/videos/test-stills", values, waitPhase: (fn) => fn() };
}

describe("createPass action", () => {
  test("keeps the new pass code as the passCode value", async () => {
    const values = {};
    const page = pageAnswering({ ok: true, code: "alpha-bravo-charlie-delta" });
    const result = await executeAction(page, { action: "createPass", bundle: "Day pass", testPass: true }, contextWith(values));
    expect(values.passCode).toBe("alpha-bravo-charlie-delta");
    expect(substituteValues("{{passCode}}", values)).toBe("alpha-bravo-charlie-delta");
    expect(page.evaluate.mock.calls[0][1]).toEqual({ bid: "day-guest", isTestPass: true });
    expect(result.rect).toBeNull();
  });

  test("fails with a SceneStepError when the pass was not created", async () => {
    const values = {};
    const page = pageAnswering({ ok: false, error: "No auth token" });
    await expect(executeAction(page, { action: "createPass", bundle: "Day pass" }, contextWith(values))).rejects.toBeInstanceOf(
      SceneStepError,
    );
    expect(values.passCode).toBeUndefined();
  });
});
