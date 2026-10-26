// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// A step target with `frame` is looked up inside the iframe that selector names.

import { describe, test, expect, vi } from "vitest";

import { resolveTarget } from "../../../scripts/lib/video/actions.js";

function fakePage() {
  const inner = {
    locator: vi.fn(() => ({ first: () => "inner-locator" })),
    getByRole: vi.fn(() => ({ first: () => "inner-role" })),
    getByText: vi.fn(() => ({ first: () => "inner-text" })),
  };
  return {
    inner,
    frameLocator: vi.fn(() => inner),
    locator: vi.fn(() => ({ first: () => "page-locator" })),
  };
}

describe("resolveTarget with a frame", () => {
  test("a selector is looked up inside the named iframe", () => {
    const page = fakePage();
    expect(resolveTarget(page, { frame: "#browserStep", selector: "button.go" })).toBe("inner-locator");
    expect(page.frameLocator).toHaveBeenCalledWith("#browserStep");
    expect(page.inner.locator).toHaveBeenCalledWith("button.go");
    expect(page.locator).not.toHaveBeenCalled();
  });

  test("a role and name are looked up inside the named iframe", () => {
    const page = fakePage();
    expect(resolveTarget(page, { frame: "#browserStep", role: "button", name: "Continue" })).toBe("inner-role");
    expect(page.inner.getByRole).toHaveBeenCalledWith("button", { name: "Continue" });
  });

  test("text is looked up inside the named iframe", () => {
    const page = fakePage();
    expect(resolveTarget(page, { frame: "#browserStep", text: "Grant" })).toBe("inner-text");
  });

  test("a target without a frame still uses the page", () => {
    const page = fakePage();
    expect(resolveTarget(page, "#x")).toBe("page-locator");
    expect(page.frameLocator).not.toHaveBeenCalled();
  });
});
