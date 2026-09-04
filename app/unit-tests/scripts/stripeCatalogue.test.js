// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/stripeCatalogue.test.js

import { describe, test, expect } from "vitest";

import { buildStripeProductsFromCatalog } from "../../../scripts/lib/stripeCatalogue.js";
import { loadCatalogFromRoot } from "../../services/productCatalog.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("buildStripeProductsFromCatalog", () => {
  const catalog = loadCatalogFromRoot();

  test("returns the three Stripe-priced products with the correct amounts", () => {
    const products = buildStripeProductsFromCatalog(catalog);
    const byBundleId = Object.fromEntries(products.map((p) => [p.bundleId, p]));

    expect(products).toHaveLength(3);
    expect(byBundleId["resident-pro"]).toMatchObject({ name: "Resident Pro", priceAmount: 999, currency: "gbp", interval: "month" });
    expect(byBundleId["resident-vat"]).toMatchObject({ name: "Resident VAT", priceAmount: 99, currency: "gbp", interval: "month" });
    expect(byBundleId["resident-itsa"]).toMatchObject({ name: "Resident ITSA", priceAmount: 99, currency: "gbp", interval: "month" });
  });

  test("skips a bundle without Stripe price fields", () => {
    const catalogWithGap = {
      bundles: [
        { id: "default", name: "Default", allocation: "automatic" },
        { id: "resident-vat", name: "Resident VAT", description: "VAT", allocation: "on-subscription", stripePriceAmount: 99, stripeCurrency: "gbp", stripeInterval: "month" },
      ],
    };
    const products = buildStripeProductsFromCatalog(catalogWithGap);
    expect(products.map((p) => p.bundleId)).toEqual(["resident-vat"]);
  });

  test("filters to a single bundle when bundleId is given", () => {
    const products = buildStripeProductsFromCatalog(catalog, { bundleId: "resident-pro" });
    expect(products.map((p) => p.bundleId)).toEqual(["resident-pro"]);
  });

  test("returns an empty list when the requested bundle has no Stripe price fields", () => {
    const products = buildStripeProductsFromCatalog(catalog, { bundleId: "default" });
    expect(products).toEqual([]);
  });

  test("returns an empty list when the requested bundle does not exist", () => {
    const products = buildStripeProductsFromCatalog(catalog, { bundleId: "no-such-bundle" });
    expect(products).toEqual([]);
  });
});
