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

  test.each(["file-micro-entity-accounts", "file-small-company-accounts"])("%s is listed in ci and not in prod", (id) => {
    expect(isActivityListedInEnvironment(activity(id), "ci")).toBe(true);
    expect(isActivityListedInEnvironment(activity(id), "prod")).toBe(false);
  });

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

  test("the resident-tax-agent bundle is listed in ci and not in prod", () => {
    expect(isBundleListedInEnvironment(bundle("resident-tax-agent"), "ci")).toBe(true);
    expect(isBundleListedInEnvironment(bundle("resident-tax-agent"), "prod")).toBe(false);
  });

  test("the other subscription bundles stay listed in prod", () => {
    for (const id of ["resident-vat", "resident-ltd", "resident-pro"]) {
      expect(isBundleListedInEnvironment(bundle(id), "prod")).toBe(true);
    }
    expect(isBundleListedInEnvironment(bundle("day-guest"), "prod")).toBe(true);
  });
});
