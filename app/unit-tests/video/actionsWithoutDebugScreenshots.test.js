// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/actionsWithoutDebugScreenshots.test.js
//
// withoutDebugScreenshots wraps the page handed to a behaviour step function during a capture:
// every behaviour step's own debug screenshot names a `path` and is never read by the capture,
// and taking one races the running CDP screencast session on the same target — the direct cause
// of a capture hanging on a page.screenshot() call that never resolves.

import { describe, test, expect, vi } from "vitest";
import { withoutDebugScreenshots } from "../../../scripts/lib/video/actions.js";

function fakePage() {
  const page = {
    screenshot: vi.fn().mockResolvedValue(Buffer.from("real-bytes")),
    locator: vi.fn().mockReturnValue("a-locator"),
    url() {
      // Relies on `this` being the real page instance, the way a class method using a private
      // field would — a proxy that lost the receiver here would throw instead of returning.
      return this.ownUrl;
    },
  };
  page.ownUrl = "https://example.test/";
  return page;
}

describe("withoutDebugScreenshots", () => {
  test("no-ops a screenshot call that names a path", async () => {
    const page = fakePage();
    const wrapped = withoutDebugScreenshots(page);
    await expect(wrapped.screenshot({ path: "target/behaviour-test-results/x.png" })).resolves.toBeUndefined();
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  test("still takes a real screenshot when no path is given", async () => {
    const page = fakePage();
    const wrapped = withoutDebugScreenshots(page);
    await expect(wrapped.screenshot({ type: "jpeg" })).resolves.toEqual(Buffer.from("real-bytes"));
    expect(page.screenshot).toHaveBeenCalledWith({ type: "jpeg" });
  });

  test("forwards every other method to the real page, bound to it", () => {
    const page = fakePage();
    const wrapped = withoutDebugScreenshots(page);
    expect(wrapped.locator("#foo")).toBe("a-locator");
    expect(page.locator).toHaveBeenCalledWith("#foo");
    // Calling a method off the wrapper must still resolve `this` against the real page.
    expect(wrapped.url()).toBe("https://example.test/");
  });
});
