// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/stripe/lib/stripeCatalogue.js
//
// Pure mapping from the bundle catalogue (web/public/submit.catalogue.toml) to the
// PRODUCTS list infra/stripe/stripe-sync.js sends to Stripe. Kept separate from the script
// so it can be unit-tested without a Stripe client.

import { getBundlePrices, getActivityPrices } from "../../../app/services/productCatalog.js";

// One entry per (catalogue item, price) pair, for either a bundle's `[[bundles.prices]]`
// table or an activity's `[[activities.prices]]` table - shared shape, `getPrices` picks
// which. An item with no Stripe price rows is skipped.
function stripeProductEntries(items, getPrices, bundleId) {
  return items
    .filter((item) => (bundleId ? item.id === bundleId : true))
    .flatMap((item) => {
      const prices = getPrices(item);
      return prices.map((price) => ({
        bundleId: item.id,
        name: item.name,
        description: item.description,
        priceAmount: price.amount,
        currency: price.currency,
        interval: price.interval,
        multiPrice: prices.length > 1,
      }));
    });
}

// Build the PRODUCTS list from a parsed catalogue (productCatalog.js's parseCatalog /
// loadCatalogFromRoot output): one entry per (bundle, price) pair plus one per (activity,
// price) pair, so a bundle or activity with a `prices` table of two intervals yields two
// entries sharing its id - one Stripe product, one price each. When bundleId is given, only
// that bundle's or activity's price(s) are returned (empty array if it has no Stripe prices
// or does not exist). multiPrice tells the caller whether this item's env var row needs the
// interval in its name (see stripe-sync.js's computeEnvUpdates); an activity price carries
// `interval = "submission"` marking a one-off charge rather than a subscription period.
export function buildStripeProductsFromCatalog(catalog, { bundleId } = {}) {
  return [
    ...stripeProductEntries(catalog?.bundles ?? [], getBundlePrices, bundleId),
    ...stripeProductEntries(catalog?.activities ?? [], getActivityPrices, bundleId),
  ];
}
