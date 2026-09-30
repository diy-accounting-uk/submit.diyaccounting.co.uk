// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/overlay.test.js
//
// svcCall is the one path every overlay call takes down into the page (caption, headline,
// chapter, click, ...). A step's own action, or its predecessor's, can navigate while a call is
// still in flight, and Playwright's evaluate then throws "Execution context was destroyed"
// against the document being torn down — seen for real on view-obligations' authorise step,
// which redirects to HMRC's own page mid-scene.

import { describe, test, expect, vi } from "vitest";
import { svcCall } from "../../../scripts/lib/video/overlay.js";

function fakePage(evaluateImpl) {
  return {
    evaluate: vi.fn(evaluateImpl),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
  };
}

describe("svcCall", () => {
  test("returns the evaluate result on a normal call, with no retry", async () => {
    const page = fakePage(() => "ok");
    await expect(svcCall(page, "chapter", "text")).resolves.toBe("ok");
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.waitForLoadState).not.toHaveBeenCalled();
  });

  test("on a destroyed execution context, waits for load state then retries once", async () => {
    let calls = 0;
    const page = fakePage(() => {
      calls += 1;
      if (calls === 1) throw new Error("Execution context was destroyed");
      return "ok after retry";
    });
    await expect(svcCall(page, "chapter", "text")).resolves.toBe("ok after retry");
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(page.waitForLoadState).toHaveBeenCalledTimes(1);
    expect(page.waitForLoadState).toHaveBeenCalledWith("domcontentloaded");
  });

  test("waits for load state before the retry evaluate, not after", async () => {
    const order = [];
    const page = {
      evaluate: vi
        .fn()
        .mockImplementationOnce(() => {
          order.push("evaluate-1");
          throw new Error("Execution context was destroyed");
        })
        .mockImplementationOnce(() => {
          order.push("evaluate-2");
          return "ok";
        }),
      waitForLoadState: vi.fn().mockImplementation(() => {
        order.push("waitForLoadState");
        return Promise.resolve();
      }),
    };
    await svcCall(page, "chapter", "text");
    expect(order).toEqual(["evaluate-1", "waitForLoadState", "evaluate-2"]);
  });

  test("propagates any other error immediately, with no retry", async () => {
    const page = fakePage(() => {
      throw new Error("element not found");
    });
    await expect(svcCall(page, "chapter", "text")).rejects.toThrow("element not found");
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.waitForLoadState).not.toHaveBeenCalled();
  });

  test("propagates the retry's own failure rather than retrying again", async () => {
    const page = fakePage(() => {
      throw new Error("Execution context was destroyed");
    });
    await expect(svcCall(page, "chapter", "text")).rejects.toThrow("Execution context was destroyed");
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(page.waitForLoadState).toHaveBeenCalledTimes(1);
  });
});
