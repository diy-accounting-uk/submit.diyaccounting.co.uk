// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/catalogue-names.test.js

import { describe, it, expect, beforeAll } from "vitest";

const catalogue = {
  bundles: [
    { id: "day-guest", name: "Day pass" },
    { id: "resident", name: "Resident" },
  ],
  activities: [{ id: "generate-pass-digital", name: "Generate Digital Pass" }],
};

describe("catalogue-names", () => {
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/catalogue-names.js");
  });

  it("names a bundle and an activity from the catalogue", () => {
    expect(window.catalogueNames.bundleName(catalogue, "day-guest")).toBe("Day pass");
    expect(window.catalogueNames.activityName(catalogue, "generate-pass-digital")).toBe("Generate Digital Pass");
  });

  it("keeps an id the catalogue does not hold", () => {
    expect(window.catalogueNames.bundleName(catalogue, "retired-bundle")).toBe("retired-bundle");
    expect(window.catalogueNames.activityName(catalogue, "retired-activity")).toBe("retired-activity");
  });

  it("keeps the id when no catalogue loaded", () => {
    expect(window.catalogueNames.bundleName(null, "day-guest")).toBe("day-guest");
    expect(window.catalogueNames.activityName(null, "submit-vat")).toBe("submit-vat");
  });
});
