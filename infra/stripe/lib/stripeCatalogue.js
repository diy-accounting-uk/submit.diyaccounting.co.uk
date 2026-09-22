// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/stripe/lib/stripeCatalogue.js
//
// Pure mapping from the bundle catalogue (web/public/submit.catalogue.toml) to the
// PRODUCTS list infra/stripe/stripe-sync.js sends to Stripe. Kept separate from the script
// so it can be unit-tested without a Stripe client.

import { getBundlePrices } from "../../../app/services/productCatalog.js";

// Build the PRODUCTS list from a parsed catalogue (productCatalog.js's parseCatalog /
// loadCatalogFromRoot output). One entry per (bundle, price) pair, so a bundle with a
// `prices` table (two intervals) yields two entries sharing its bundleId - one Stripe
// product, one price each. A bundle with none of getBundlePrices' shapes is skipped.
// When bundleId is given, only that bundle's price(s) are returned (empty array if it has
// no Stripe prices or does not exist). multiPrice tells the caller whether this bundle's
// env var row needs the interval in its name (see stripe-sync.js's computeEnvUpdates).
export function buildStripeProductsFromCatalog(catalog, { bundleId } = {}) {
  const bundles = catalog?.bundles ?? [];
  return bundles
    .filter((b) => (bundleId ? b.id === bundleId : true))
    .flatMap((b) => {
      const prices = getBundlePrices(b);
      return prices.map((price) => ({
        bundleId: b.id,
        name: b.name,
        description: b.description,
        priceAmount: price.amount,
        currency: price.currency,
        interval: price.interval,
        multiPrice: prices.length > 1,
      }));
    });
}
