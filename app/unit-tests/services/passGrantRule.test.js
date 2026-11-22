// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/passGrantRule.test.js

import { describe, test, expect } from "vitest";
import { passMayGrantBundle, passGrantsOnlyToOperators } from "@app/services/passGrantRule.js";
import { loadCatalogFromRoot, loadPassTypesFromRoot } from "@app/services/productCatalog.js";

const catalog = loadCatalogFromRoot();
const bundleOf = (id) => catalog.bundles.find((bundle) => bundle.id === id);

describe("which bundles a pass may grant", () => {
  test.each(loadPassTypesFromRoot().passTypes.map((passType) => [passType.id, passType.bundleId]))(
    "the %s pass type's bundle %s may be granted by a pass",
    (_passTypeId, bundleId) => {
      expect(passMayGrantBundle(bundleOf(bundleId))).toBe(true);
    },
  );

  test("a bundle whose enable is never, or whose allocation is automatic, may not be granted by a pass", () => {
    expect(passMayGrantBundle(bundleOf("default"))).toBe(false);
    expect(passMayGrantBundle({ id: "x", enable: "on-pass", allocation: "automatic" })).toBe(false);
    expect(passMayGrantBundle({ id: "x", enable: "never", allocation: "on-pass" })).toBe(false);
    expect(passMayGrantBundle(undefined)).toBe(false);
  });

  test("only the operator bundle is granted to operators alone", () => {
    expect(catalog.bundles.filter((bundle) => passGrantsOnlyToOperators(bundle.id)).map((bundle) => bundle.id)).toEqual(["operator"]);
  });
});
