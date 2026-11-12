// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/listings-register.mjs
// Reads the listing register and the copy pack from web/marketing/marketing.toml, and the price
// text of a bundle from web/public/submit.catalogue.toml. The marketing build and the listings
// check both read through this module, so the register has one reader.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const TOML = require("@iarna/toml");

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MARKETING_TOML = path.join(REPO_ROOT, "web", "marketing", "marketing.toml");
export const CATALOGUE_TOML = path.join(REPO_ROOT, "web", "public", "submit.catalogue.toml");

export const LISTING_STATES = ["planned", "submitted", "live"];
export const SHORT_DESCRIPTION_MAX = 160;
export const LONG_DESCRIPTION_MAX = 500;

const sterling = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const INTERVAL_SUFFIX = { year: "/yr", month: "/mo" };

/**
 * The price text of a bundle as the bundles page prints it: the annual price first, then the monthly
 * one, for example "£9.99/yr / £0.99/mo". Throws when the catalogue has no such bundle or no price.
 */
export function catalogPriceText(bundleId, catalogue = TOML.parse(fs.readFileSync(CATALOGUE_TOML, "utf8"))) {
  const bundle = catalogue.bundles.find((b) => b.id === bundleId);
  if (!bundle) throw new Error(`the catalogue has no bundle ${bundleId}`);
  const prices = Array.isArray(bundle.prices) ? bundle.prices : [];
  if (prices.length === 0) throw new Error(`the catalogue bundle ${bundleId} has no price`);
  const annual = prices.find((p) => p.interval === "year") || prices.find((p) => p.default) || prices[0];
  const monthly = prices.find((p) => p !== annual && p.interval === "month") || prices.find((p) => p !== annual);
  return [annual, monthly]
    .filter(Boolean)
    .map((p) => `${sterling.format(p.amount / 100)}${INTERVAL_SUFFIX[p.interval] ?? `/${p.interval}`}`)
    .join(" / ");
}

/**
 * The listing register with the copy pack: `{ groups, products, listings }`. A product's descriptions
 * carry the catalogue price text where its template holds {price}, and `priceText` is that text
 * (empty for a product with no catalogue bundle).
 */
export function readListings(options = {}) {
  const marketing = options.marketing ?? TOML.parse(fs.readFileSync(MARKETING_TOML, "utf8"));
  const catalogue = options.catalogue ?? TOML.parse(fs.readFileSync(CATALOGUE_TOML, "utf8"));
  const products = (marketing.listingProduct ?? []).map((product) => {
    const priceText = product.priceBundle ? catalogPriceText(product.priceBundle, catalogue) : "";
    return {
      ...product,
      priceText,
      description160: product.description160.replaceAll("{price}", priceText),
      description500: product.description500.replaceAll("{price}", priceText),
    };
  });
  return {
    groups: JSON.parse(JSON.stringify(marketing.listingGroup ?? [])),
    products,
    listings: JSON.parse(JSON.stringify(marketing.listing ?? [])),
  };
}

/** The problems in the register, one sentence each; an empty list means the register is sound. */
export function listingProblems(register) {
  const problems = [];
  const productIds = new Set(register.products.map((p) => p.id));
  const groupIds = new Set(register.groups.map((g) => g.id));
  const seen = { id: new Set(), utmSource: new Set() };
  for (const product of register.products) {
    if (product.description160.length > SHORT_DESCRIPTION_MAX)
      problems.push(`product ${product.id}: the short description is over ${SHORT_DESCRIPTION_MAX} characters`);
    if (product.description500.length > LONG_DESCRIPTION_MAX)
      problems.push(`product ${product.id}: the long description is over ${LONG_DESCRIPTION_MAX} characters`);
    if (product.priceBundle && !product.priceText)
      problems.push(`product ${product.id}: the catalogue gives no price text for ${product.priceBundle}`);
  }
  const catalogPrices = register.products.filter((p) => p.priceText).map((p) => p.priceText);
  for (const listing of register.listings) {
    const name = `listing ${listing.id}`;
    for (const field of ["id", "place", "group", "state", "utmSource"]) if (!listing[field]) problems.push(`${name}: ${field} is empty`);
    if (seen.id.has(listing.id)) problems.push(`${name}: the id is used twice`);
    if (seen.utmSource.has(listing.utmSource)) problems.push(`${name}: utmSource ${listing.utmSource} is used twice`);
    seen.id.add(listing.id);
    seen.utmSource.add(listing.utmSource);
    if (!groupIds.has(listing.group)) problems.push(`${name}: group ${listing.group} is not a listing group`);
    if (!LISTING_STATES.includes(listing.state))
      problems.push(`${name}: state ${listing.state} is not one of ${LISTING_STATES.join(", ")}`);
    if (listing.date && !/^\d{4}-\d{2}-\d{2}$/.test(listing.date)) problems.push(`${name}: date ${listing.date} is not YYYY-MM-DD`);
    if (listing.state === "submitted" && !listing.date) problems.push(`${name}: a submitted listing records its date`);
    if (listing.url && !/^https:\/\//.test(listing.url)) problems.push(`${name}: url is not an https URL`);
    for (const id of listing.products ?? []) if (!productIds.has(id)) problems.push(`${name}: product ${id} is not in the copy pack`);
    if (listing.priceText && !catalogPrices.includes(listing.priceText)) {
      problems.push(
        `${name}: recorded price text "${listing.priceText}" differs from the catalogue (${[...new Set(catalogPrices)].join("; ")})`,
      );
    }
  }
  return problems;
}

/** The `live` listings that carry a URL, as the review line of a result page reads them. */
export function liveListings(register = readListings()) {
  return register.listings.filter((listing) => listing.state === "live" && listing.url);
}
