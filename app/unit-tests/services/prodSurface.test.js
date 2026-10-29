// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { loadCatalogFromRoot, isActivityListedInEnvironment, isBundleListedInEnvironment } from "../../services/productCatalog.js";

const catalog = loadCatalogFromRoot();
const activity = (id) => catalog.activities.find((candidate) => candidate.id === id);
const bundle = (id) => catalog.bundles.find((candidate) => candidate.id === id);

describe("what the catalogue lists in each environment", () => {
  test.each(["practice", "diya-gl-storage", "self-employed", "file-confirmation-statement", "vat-assist-check"])(
    "%s is listed in ci and not in prod",
    (id) => {
      expect(isActivityListedInEnvironment(activity(id), "ci")).toBe(true);
      expect(isActivityListedInEnvironment(activity(id), "prod")).toBe(false);
    },
  );

  test("the MCP harness is not listed in prod", () => {
    expect(isActivityListedInEnvironment(activity("mcp-harness"), "prod")).toBe(false);
  });

  test.each(["practice", "diya-gl-storage"])("%s is listed in the simulator", (id) => {
    expect(isActivityListedInEnvironment(activity(id), "simulator")).toBe(true);
  });

  test.each(["submit-vat", "vat-obligations", "vat-liabilities", "company-lookup", "generate-pass-digital"])(
    "%s stays listed in prod",
    (id) => {
      expect(isActivityListedInEnvironment(activity(id), "prod")).toBe(true);
    },
  );

  test.each(["resident", "resident-pro"])("the %s bundle is listed in ci and not in prod", (id) => {
    expect(isBundleListedInEnvironment(bundle(id), "ci")).toBe(true);
    expect(isBundleListedInEnvironment(bundle(id), "prod")).toBe(false);
  });

  test("the other subscription bundles stay listed in prod", () => {
    expect(isBundleListedInEnvironment(bundle("resident-vat"), "prod")).toBe(true);
    expect(isBundleListedInEnvironment(bundle("day-guest"), "prod")).toBe(true);
  });
});
