// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/bundle-listing.js
// The one description of the bundles an environment lists: which they are, what each costs and how
// many tokens each gives. The deploy writes it into bundles.html (scripts/publish-content.mjs) and
// the help page's price answer (scripts/build-static-content.mjs, lib/help-page.js, llms-full.txt),
// and the Bundles page's cards (bundles.page.js) use the token sentence. No imports and no DOM,
// so Node and the browser load the same file.

const BUNDLE_PRICES_PLACEHOLDER = "{{bundle-prices}}";

function isListedInEnvironment(bundle, environmentName) {
  const listed = bundle?.listedInEnvironments;
  if (!Array.isArray(listed) || listed.length === 0) return true;
  return typeof environmentName === "string" && listed.includes(environmentName);
}

/** The bundles the Bundles page lists to a visitor with no pass and no preview setting in an environment. */
export function listedBundles(catalog, environmentName) {
  return (catalog.bundles ?? [])
    .filter((bundle) => bundle.allocation && bundle.allocation !== "automatic")
    .filter((bundle) => bundle.enable !== "never")
    .filter((bundle) => !bundle.hidden)
    .filter((bundle) => isListedInEnvironment(bundle, environmentName))
    .sort((a, b) => (a.allocation === "on-request") - (b.allocation === "on-request"));
}

function formatPounds(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

function priceRows(bundle) {
  return (Array.isArray(bundle.prices) ? bundle.prices : []).filter(
    (price) => Number.isFinite(price.amount) && typeof price.currency === "string" && typeof price.interval === "string",
  );
}

// "£9.99 a year or £0.99 a month", the default price first; empty for a free bundle.
function priceWords(bundle) {
  const prices = priceRows(bundle);
  const ordered = [...prices.filter((price) => price.default === true), ...prices.filter((price) => price.default !== true)];
  const words = { year: "a year", month: "a month" };
  const perInterval = (interval) => words[interval] ?? "each " + interval;
  return ordered.map((price) => formatPounds(price.amount) + " " + perInterval(price.interval)).join(" or ");
}

export function priceSentence(bundle) {
  const words = priceWords(bundle);
  return words ? `${words}.` : "Free.";
}

const DURATION_WORDS = { P1D: "24 hours", P7D: "7 days", P1M: "a month", P1Y: "a year" };

// What a bundle gives in tokens: "3 tokens for 24 hours", "100 tokens each month", "no limit on tokens"; empty when the catalogue names none.
function tokenWords(bundle) {
  const granted = bundle.tokensGranted;
  if (granted === "unlimited") return "no limit on tokens";
  if (typeof granted !== "number") return "";
  const count = `${granted} token${granted === 1 ? "" : "s"}`;
  if (bundle.tokenRefreshInterval) {
    const period = DURATION_WORDS[bundle.tokenRefreshInterval]?.replace(/^an? /, "") ?? "period";
    return `${count} each ${period}`;
  }
  const lasts = DURATION_WORDS[bundle.timeout];
  return lasts ? `${count} for ${lasts}` : count;
}

/** The token allowance as one sentence: "3 tokens for 24 hours."; empty when the catalogue names none. */
export function tokenSentence(bundle) {
  const words = tokenWords(bundle);
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}.` : "";
}

/** The sentence that says what a bundle lets you do; the catalogue description without its price when no summary is set. */
export function bundleSummary(bundle) {
  const summary = typeof bundle.passSummary === "string" ? bundle.passSummary.trim() : "";
  if (summary) return `You can ${summary}.`;
  const description = bundle.description ?? "";
  const priceStart = description.indexOf(". £");
  return priceStart === -1 ? description : description.slice(0, priceStart + 1);
}

/** One Markdown list item for a bundle: its name, its price and its tokens, then what it lets you do. */
export function bundlePriceLine(bundle) {
  const price = priceWords(bundle);
  const tokens = tokenWords(bundle);
  const verb = bundle.tokensGranted === "unlimited" ? "has" : "gives";
  const cost = price ? `costs ${price}` : "is free";
  const clause = tokens ? `${cost} and ${verb} ${tokens}` : cost;
  return `- **${bundle.name}** ${clause}. ${bundleSummary(bundle)}`.trimEnd();
}

/** The Markdown list of the bundles an environment lists, for the help answer on prices. */
export function bundlePriceList(catalog, environmentName) {
  return listedBundles(catalog, environmentName).map(bundlePriceLine).join("\n");
}

/** The FAQ entry with the price list in place of its placeholder; an entry without the placeholder is unchanged. */
export function fillBundlePrices(faq, priceList) {
  return faq.answer.includes(BUNDLE_PRICES_PLACEHOLDER)
    ? { ...faq, answer: faq.answer.replace(BUNDLE_PRICES_PLACEHOLDER, priceList) }
    : faq;
}
