// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/stripeCatalogue.js
//
// Pure mapping from the bundle catalogue (web/public/submit.catalogue.toml) to the
// PRODUCTS list scripts/stripe-setup.js sends to Stripe. Kept separate from the script
// so it can be unit-tested without a Stripe client.

// Build the PRODUCTS list from a parsed catalogue (productCatalog.js's parseCatalog /
// loadCatalogFromRoot output). Only bundles carrying all three Stripe price fields
// (stripePriceAmount, stripeCurrency, stripeInterval) are included; a bundle missing any
// of them is skipped. When bundleId is given, only that bundle is returned (empty array
// if it has no Stripe price fields or does not exist).
export function buildStripeProductsFromCatalog(catalog, { bundleId } = {}) {
  const bundles = catalog?.bundles ?? [];
  return bundles
    .filter((b) => (bundleId ? b.id === bundleId : true))
    .filter((b) => Number.isFinite(b.stripePriceAmount) && typeof b.stripeCurrency === "string" && typeof b.stripeInterval === "string")
    .map((b) => ({
      bundleId: b.id,
      name: b.name,
      description: b.description,
      priceAmount: b.stripePriceAmount,
      currency: b.stripeCurrency,
      interval: b.stripeInterval,
    }));
}
