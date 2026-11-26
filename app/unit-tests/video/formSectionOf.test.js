// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The page section that holds a step's target, read before the step runs.

import { describe, test, expect, vi } from "vitest";

import { formSectionOf } from "../../../scripts/lib/video/actions.js";

function fakeLocator(count, sectionId) {
  return {
    count: vi.fn(async () => count),
    evaluate: vi.fn(async (read) => read({ closest: () => (sectionId ? { id: sectionId } : null) })),
  };
}

function fakePage(locator) {
  return {
    locator: vi.fn(() => ({ first: () => locator })),
    getByRole: vi.fn(() => ({ first: () => locator })),
    getByText: vi.fn(() => ({ first: () => locator })),
  };
}

describe("formSectionOf", () => {
  test("names the section of a selector target", async () => {
    const locator = fakeLocator(1, "section-allowances");
    const page = fakePage(locator);
    expect(await formSectionOf(page, "#allowances")).toBe("section-allowances");
    expect(page.locator).toHaveBeenCalledWith("#allowances");
  });

  test("names the section of a role, text or selector object target", async () => {
    const locator = fakeLocator(1, "section-company");
    const page = fakePage(locator);
    expect(await formSectionOf(page, { role: "button", name: "Look up" })).toBe("section-company");
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Look up" });
    expect(await formSectionOf(page, { text: "Company number" })).toBe("section-company");
    expect(await formSectionOf(page, { selector: "#companyNumber" })).toBe("section-company");
  });

  test("gives none for a target outside any section", async () => {
    expect(await formSectionOf(fakePage(fakeLocator(1, null)), "#header")).toBeNull();
  });

  test("gives none for a target not on the page, counting it rather than waiting for it", async () => {
    const locator = fakeLocator(0, "section-allowances");
    expect(await formSectionOf(fakePage(locator), "#notYet")).toBeNull();
    expect(locator.count).toHaveBeenCalledTimes(1);
    expect(locator.evaluate).not.toHaveBeenCalled();
  });

  test("gives none for a step with no target", async () => {
    const page = fakePage(fakeLocator(1, "section-allowances"));
    expect(await formSectionOf(page, undefined)).toBeNull();
    expect(page.locator).not.toHaveBeenCalled();
  });

  test("refuses a target shape resolveTarget does not know", async () => {
    await expect(formSectionOf(fakePage(fakeLocator(1, "x")), { label: "Name" })).rejects.toThrow(/unrecognised target shape/);
  });
});
