// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { loadCatalogFromRoot, bundlesForActivity, activitiesForBundle } from "../services/productCatalog.js";

describe("System: web/public/submit.catalogue.toml", () => {
  const catalog = loadCatalogFromRoot();

  it("should load version and key sections", () => {
    expect(catalog.version).toBe("1.1.0");
    expect(Array.isArray(catalog.bundles)).toBe(true);
    expect(Array.isArray(catalog.activities)).toBe(true);
  });
});
