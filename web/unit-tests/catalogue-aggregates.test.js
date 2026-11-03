// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import {
  resolveAggregateBundles,
  includedBundleIds,
  bundleIdsIncluding,
  aggregateBundleErrors,
} from "../public/lib/services/catalogue-aggregates.js";
import { loadCatalogFromRoot } from "../../app/services/productCatalog.js";

const catalog = {
  bundles: [
    { id: "a" },
    { id: "b" },
    { id: "pro", includes: ["a", "b"] },
    { id: "agent", includes: ["pro"] },
    { id: "comp", includes: ["agent"] },
  ],
  activities: [{ id: "x", bundles: ["a"] }, { id: "y", bundles: ["b", "a"] }, { id: "z", bundles: ["agent"] }, { id: "none" }],
};

describe("catalogue-aggregates", () => {
  it("resolves aggregates transitively in catalogue order after the declared list", () => {
    const resolved = resolveAggregateBundles(catalog);
    const byId = Object.fromEntries(resolved.activities.map((a) => [a.id, a.bundles]));
    expect(byId.x).toEqual(["a", "pro", "agent", "comp"]);
    expect(byId.y).toEqual(["b", "a", "pro", "agent", "comp"]);
    expect(byId.z).toEqual(["agent", "comp"]);
    expect(byId.none).toBeUndefined();
  });

  it("is idempotent and leaves its input and the bundles unchanged", () => {
    const before = JSON.stringify(catalog);
    const once = resolveAggregateBundles(catalog);
    expect(JSON.stringify(catalog)).toBe(before);
    expect(resolveAggregateBundles(once)).toEqual(once);
    expect(once.bundles).toEqual(catalog.bundles);
  });

  it("gives a catalogue with no includes the same lists", () => {
    const plain = { bundles: [{ id: "a" }], activities: [{ id: "x", bundles: ["a"] }] };
    expect(resolveAggregateBundles(plain).activities).toEqual(plain.activities);
  });

  it("lists the transitive parts of a bundle without the bundle", () => {
    expect(includedBundleIds(catalog, "comp")).toEqual(["agent", "pro", "a", "b"]);
    expect(includedBundleIds(catalog, "a")).toEqual([]);
    expect(includedBundleIds(catalog, "missing")).toEqual([]);
  });

  it("lists a bundle and every bundle that includes it", () => {
    expect(bundleIdsIncluding(catalog, "a")).toEqual(["a", "pro", "agent", "comp"]);
    expect(bundleIdsIncluding(catalog, "comp")).toEqual(["comp"]);
  });

  it("ignores an unknown id and reports it", () => {
    const bad = { bundles: [{ id: "w", includes: ["ghost"] }], activities: [{ id: "x", bundles: ["w"] }] };
    expect(resolveAggregateBundles(bad).activities[0].bundles).toEqual(["w"]);
    expect(aggregateBundleErrors(bad)).toEqual(["bundle w includes unknown bundle ghost"]);
  });

  it("reports a bundle that includes itself and still resolves", () => {
    const bad = { bundles: [{ id: "s", includes: ["s"] }], activities: [{ id: "x", bundles: ["s"] }] };
    expect(resolveAggregateBundles(bad).activities[0].bundles).toEqual(["s"]);
    expect(aggregateBundleErrors(bad)).toEqual(["bundle s includes itself"]);
  });

  it("stops a cycle and reports each bundle in it", () => {
    const bad = {
      bundles: [
        { id: "p", includes: ["q"] },
        { id: "q", includes: ["p"] },
      ],
      activities: [{ id: "x", bundles: ["p"] }],
    };
    expect(resolveAggregateBundles(bad).activities[0].bundles).toEqual(["p", "q"]);
    expect(includedBundleIds(bad, "p")).toEqual(["q"]);
    expect(aggregateBundleErrors(bad)).toEqual(["bundle p is part of an includes cycle", "bundle q is part of an includes cycle"]);
  });

  it("reports an aggregate listed in an environment where a part is not", () => {
    const bad = {
      bundles: [
        { id: "part", listedInEnvironments: ["ci"] },
        { id: "whole", includes: ["part"], listedInEnvironments: ["ci", "prod"] },
        { id: "everywhere", includes: ["part"] },
        { id: "fine", includes: ["part"], listedInEnvironments: ["ci"] },
      ],
      activities: [],
    };
    expect(aggregateBundleErrors(bad)).toEqual([
      "bundle whole is listed in prod where its part part is not listed",
      "bundle everywhere is listed in every environment where its part part is not listed",
    ]);
  });

  it("accepts a part that is listed everywhere", () => {
    const ok = {
      bundles: [{ id: "part" }, { id: "whole", includes: ["part"], listedInEnvironments: ["ci"] }],
      activities: [],
    };
    expect(aggregateBundleErrors(ok)).toEqual([]);
  });

  it("finds no error in the real catalogue", () => {
    expect(aggregateBundleErrors(loadCatalogFromRoot())).toEqual([]);
  });
});
