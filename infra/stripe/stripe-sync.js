#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/stripe/stripe-sync.js
//
// Plans, then optionally applies, the Stripe side of subscriptions: a product and a recurring
// price per on-subscription bundle in web/public/submit.catalogue.toml, and the webhook
// endpoints infra/stripe/stripe.toml declares. Plans by default; --apply makes the changes.
//
// Usage:
//   node infra/stripe/stripe-sync.js --environment ci --mode test
//   node infra/stripe/stripe-sync.js --environment ci --mode test --apply
//   node infra/stripe/stripe-sync.js --environment prod --mode live --apply --products-only
//   node infra/stripe/stripe-sync.js --environment ci --mode test --apply --bundle resident-vat
//
// Options:
//   --environment <ci|prod>   Required. Which AWS account to read the key from.
//   --mode <test|live>        Required. Which Stripe account API key to use.
//   --apply                   Make the changes; without it, report only.
//   --products-only           Skip the webhook endpoints and payment links, sync products and prices only.
//   --payment-links-only      Skip products, prices and webhook endpoints, sync payment links only.
//   --bundle <id>             Limit to a single bundle id.
//
// Credentials: the account API key is read from Secrets Manager at the name
// infra/stripe/stripe.toml's [keys.<environment>] table records for this mode - never from
// an environment variable, so a key can never leak into a shell history or a workflow log.
// Each AWS account only ever holds the key(s) infra-apply.yml's matrix needs from it: ci
// holds the test key, prod holds both. A newly created webhook endpoint's signing secret is
// written straight into Secrets Manager through scripts/put-secret-with-rotation-tag.sh; it
// is never printed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import Stripe from "stripe";
import TOML from "@iarna/toml";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { loadCatalogFromRoot } from "../../app/services/productCatalog.js";
import { buildStripeProductsFromCatalog } from "./lib/stripeCatalogue.js";

export const CONFIG_PATH = "infra/stripe/stripe.toml";
const ENV_FILES = [".env.ci", ".env.prod"];

/**
 * Parse CLI args. Unknown flags throw rather than being silently ignored.
 *
 * @param {string[]} argv - process.argv.slice(2)
 */
export function parseArgs(argv) {
  const opts = { environment: null, mode: null, apply: false, productsOnly: false, paymentLinksOnly: false, bundleId: undefined };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--environment":
        opts.environment = argv[++i];
        if (opts.environment !== "ci" && opts.environment !== "prod") {
          throw new Error(`--environment must be "ci" or "prod", got "${opts.environment}"`);
        }
        break;
      case "--mode":
        opts.mode = argv[++i];
        if (opts.mode !== "test" && opts.mode !== "live") {
          throw new Error(`--mode must be "test" or "live", got "${opts.mode}"`);
        }
        break;
      case "--apply":
        opts.apply = true;
        break;
      case "--products-only":
        opts.productsOnly = true;
        break;
      case "--payment-links-only":
        opts.paymentLinksOnly = true;
        break;
      case "--bundle":
        opts.bundleId = argv[++i];
        if (!opts.bundleId) throw new Error("--bundle requires a bundle id");
        break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!opts.environment) {
    throw new Error("--environment <ci|prod> is required");
  }
  if (!opts.mode) {
    throw new Error("--mode <test|live> is required");
  }
  return opts;
}

function normalizeEndpoint(entry) {
  if (!entry.environment || !entry.url || !Array.isArray(entry.modes) || entry.modes.length === 0) {
    throw new Error(`[[endpoint]] entry is missing environment, url or modes: ${JSON.stringify(entry)}`);
  }
  const secrets = {};
  for (const mode of entry.modes) {
    const secretEntry = entry.secret?.[mode];
    if (!secretEntry?.github_secret || !secretEntry?.aws_secret) {
      throw new Error(`endpoint ${entry.url} declares mode "${mode}" but no [endpoint.secret.${mode}] with github_secret and aws_secret`);
    }
    secrets[mode] = { githubSecret: secretEntry.github_secret, awsSecret: secretEntry.aws_secret };
  }
  return { environment: entry.environment, url: entry.url, modes: entry.modes, secrets };
}

function normalizePaymentLink(entry) {
  if (!entry.url || !entry.bundle_id) {
    throw new Error(`[[payment_link]] entry is missing url or bundle_id: ${JSON.stringify(entry)}`);
  }
  return { url: entry.url, bundleId: entry.bundle_id };
}

/**
 * Parse infra/stripe/stripe.toml's endpoints, payment links, event list and per-account key
 * secret names.
 *
 * @param {string} tomlString
 * @returns {{endpoints: object[], paymentLinks: Array<{bundleId: string, url: string}>, events: string[], keys: {ci: {test: string}, prod: {test: string, live: string}}}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const endpoints = (parsed.endpoint ?? []).map(normalizeEndpoint);
  if (endpoints.length === 0) {
    throw new Error("stripe.toml has no [[endpoint]] entries");
  }
  const paymentLinks = (parsed.payment_link ?? []).map(normalizePaymentLink);
  const events = parsed.events?.enabled ?? [];
  if (events.length === 0) {
    throw new Error("stripe.toml has no [events].enabled list");
  }
  const keys = { ci: { ...(parsed.keys?.ci ?? {}) }, prod: { ...(parsed.keys?.prod ?? {}) } };
  if (!keys.ci.test || !keys.prod.test || !keys.prod.live) {
    throw new Error("stripe.toml must declare [keys.ci].test, [keys.prod].test and [keys.prod].live");
  }
  return { endpoints, paymentLinks, events, keys };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Decide what to do about one webhook endpoint already found (or not) in a `mode`'s live
 * endpoint list: create it, update its events/enabled state, or leave it alone. Pure - the
 * live list is passed in, never fetched here.
 *
 * @param {{url: string, existingWebhooksForMode: Array<{id:string,url:string,status:string,enabled_events?:string[]}>, desiredEvents: string[]}} params
 */
export function planWebhookAction({ url, existingWebhooksForMode, desiredEvents }) {
  const existing = existingWebhooksForMode.find((w) => w.url === url);
  if (!existing) {
    return { action: "create" };
  }

  const currentEvents = [...(existing.enabled_events || [])].sort();
  const sortedDesired = [...desiredEvents].sort();
  const eventsChanged = currentEvents.length !== sortedDesired.length || currentEvents.some((e, i) => e !== sortedDesired[i]);
  const needsEnable = existing.status === "disabled";

  if (eventsChanged || needsEnable) {
    return { action: "update", id: existing.id, eventsChanged, needsEnable };
  }
  return { action: "noop", id: existing.id };
}

/**
 * Plan every endpoint that runs in `mode`, against that mode's live webhook endpoint list.
 *
 * @param {object[]} endpoints - stripe.toml's parsed [[endpoint]] entries
 * @param {string} mode - "test" or "live"
 * @param {Array<{id:string,url:string,status:string,enabled_events?:string[]}>} existingWebhooksForMode
 * @param {string[]} desiredEvents
 * @returns {Array<{environment: string, url: string, action: string, id?: string, eventsChanged?: boolean, needsEnable?: boolean}>}
 */
export function planEndpoints(endpoints, mode, existingWebhooksForMode, desiredEvents) {
  return endpoints
    .filter((endpoint) => endpoint.modes.includes(mode))
    .map((endpoint) => ({
      environment: endpoint.environment,
      url: endpoint.url,
      secret: endpoint.secrets[mode],
      ...planWebhookAction({ url: endpoint.url, existingWebhooksForMode, desiredEvents }),
    }));
}

/**
 * Plan what to change about each declared payment link's payment_intent_data.metadata.bundleId,
 * against the account's live payment link list. Pure - the live list is passed in, never
 * fetched here. A declared link the account doesn't have is reported, not created: a Payment
 * Link is a checkout page an operator builds by hand, stripe-sync only labels one that exists.
 *
 * @param {{paymentLinks: Array<{bundleId: string, url: string}>}} config
 * @param {Array<{id: string, url: string, payment_intent_data?: {metadata?: Record<string,string>}}>} live
 * @returns {Array<{bundleId: string, url: string, action: "missing"|"noop"|"update", id?: string}>}
 */
export function planPaymentLinks(config, live) {
  return config.paymentLinks.map(({ bundleId, url }) => {
    const existing = live.find((pl) => pl.url === url);
    if (!existing) {
      return { bundleId, url, action: "missing" };
    }
    const currentBundleId = existing.payment_intent_data?.metadata?.bundleId;
    if (currentBundleId === bundleId) {
      return { bundleId, url, action: "noop", id: existing.id };
    }
    return { bundleId, url, action: "update", id: existing.id };
  });
}

/**
 * Merge {KEY: value} updates into an env file's lines: replace the value on a line whose key
 * matches, in place, and append a new "KEY=value" line for any update whose key was not
 * already present. Unrelated lines pass through untouched, in their original order.
 *
 * @param {string[]} lines
 * @param {Record<string,string>} updates
 * @returns {string[]}
 */
export function rewriteEnvLines(lines, updates) {
  const remaining = new Map(Object.entries(updates));
  const result = lines.map((line) => {
    const match = /^(\w+)=/.exec(line);
    if (match && remaining.has(match[1])) {
      const key = match[1];
      const value = remaining.get(key);
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  for (const [key, value] of remaining) {
    result.push(`${key}=${value}`);
  }
  return result;
}

/**
 * Which env files get which STRIPE_(TEST_)PRICE_ID_<BUNDLE>[_<INTERVAL>] line for a
 * completed price creation, matching .claude/skills/stripe-catalogue-sync/SKILL.md's step
 * 4: ci only ever runs in test mode, so a test-mode price lands in both .env.ci's test and
 * live-named rows; a live-mode price lands only in .env.prod's live-named row. A result
 * carrying `interval` (a bundle with more than one Stripe price) gets the interval in its
 * row name; a single-price bundle keeps the bundle-only name its existing subscribers'
 * rows already use.
 *
 * @param {"test"|"live"} mode
 * @param {Array<{bundleId: string, priceId: string, interval?: string}>} results
 * @returns {Record<string, Record<string,string>>}
 */
export function computeEnvUpdates(mode, results) {
  const updates = { ".env.ci": {}, ".env.prod": {} };
  for (const { bundleId, priceId, interval } of results) {
    const bundleSuffix = bundleId.toUpperCase().replace(/-/g, "_");
    const suffix = interval ? `_${bundleSuffix}_${interval.toUpperCase()}` : `_${bundleSuffix}`;
    if (mode === "test") {
      updates[".env.ci"][`STRIPE_TEST_PRICE_ID${suffix}`] = priceId;
      updates[".env.ci"][`STRIPE_PRICE_ID${suffix}`] = priceId;
      updates[".env.prod"][`STRIPE_TEST_PRICE_ID${suffix}`] = priceId;
    } else {
      updates[".env.prod"][`STRIPE_PRICE_ID${suffix}`] = priceId;
    }
  }
  return updates;
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network). ---

async function getSecretValue(secretId) {
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return SecretString;
}

function putSecretWithRotationTag(secretName, secretValue) {
  execFileSync(path.join(process.cwd(), "scripts/put-secret-with-rotation-tag.sh"), [secretName, secretValue], { stdio: "inherit" });
}

async function findOrCreateProduct(stripe, bundleId, name, description, apply) {
  const products = await stripe.products.search({ query: `metadata["bundleId"]:"${bundleId}"` });

  if (products.data.length > 0) {
    console.log(`  product ${bundleId}: exists (${products.data[0].id})`);
    return products.data[0];
  }

  console.log(`  product ${bundleId}: ${apply ? "creating" : "would create"} "${name}"`);
  if (!apply) {
    return { id: "(plan, not created)" };
  }
  const product = await stripe.products.create({ name, description, metadata: { bundleId } });
  console.log(`    created ${product.id}`);
  return product;
}

// A price with interval = "submission" is a one-off per-filing charge, not a subscription:
// it lists and creates as a Stripe "one_time" price with no recurring block, rather than
// "recurring" on the named interval.
async function findOrCreatePrice(stripe, productId, bundleId, unitAmount, currency, interval, apply) {
  const isOneOff = interval === "submission";
  const label = isOneOff ? `${unitAmount} ${currency} one-off` : `${unitAmount} ${currency}/${interval}`;

  if (productId === "(plan, not created)") {
    console.log(`  price ${bundleId}: would create ${label}`);
    return { id: "(plan, not created)" };
  }

  const prices = await stripe.prices.list({ product: productId, active: true, type: isOneOff ? "one_time" : "recurring" });
  const existing = prices.data.find(
    (p) => p.unit_amount === unitAmount && p.currency === currency && (isOneOff ? !p.recurring : p.recurring?.interval === interval),
  );
  if (existing) {
    console.log(`  price ${bundleId}: exists (${existing.id})`);
    return existing;
  }

  console.log(`  price ${bundleId}: ${apply ? "creating" : "would create"} ${label}`);
  if (!apply) {
    return { id: "(plan, not created)" };
  }
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency,
    ...(isOneOff ? {} : { recurring: { interval } }),
    metadata: { bundleId },
  });
  console.log(`    created ${price.id}`);
  return price;
}

async function syncProducts(stripe, opts) {
  const catalog = loadCatalogFromRoot();
  const products = buildStripeProductsFromCatalog(catalog, { bundleId: opts.bundleId });
  if (opts.bundleId && products.length === 0) {
    throw new Error(`No on-subscription bundle "${opts.bundleId}" with Stripe price fields found in the catalogue`);
  }

  console.log(`\n=== products and prices (${opts.mode}) ===`);
  const results = [];
  const productsByBundleId = new Map();
  for (const p of products) {
    let product = productsByBundleId.get(p.bundleId);
    if (!product) {
      product = await findOrCreateProduct(stripe, p.bundleId, p.name, p.description, opts.apply);
      productsByBundleId.set(p.bundleId, product);
    }
    const price = await findOrCreatePrice(stripe, product.id, p.bundleId, p.priceAmount, p.currency, p.interval, opts.apply);
    if (price.id !== "(plan, not created)") {
      results.push({ bundleId: p.bundleId, priceId: price.id, interval: p.multiPrice ? p.interval : undefined });
    }
  }
  return results;
}

async function applyEnvUpdates(mode, results) {
  const updates = computeEnvUpdates(mode, results);
  for (const envFile of ENV_FILES) {
    const fileUpdates = updates[envFile];
    if (!fileUpdates || Object.keys(fileUpdates).length === 0) continue;
    const filePath = path.join(process.cwd(), envFile);
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    const rewritten = rewriteEnvLines(lines, fileUpdates);
    fs.writeFileSync(filePath, rewritten.join("\n"));
    console.log(`  wrote ${Object.keys(fileUpdates).length} price id(s) to ${envFile}`);
  }
}

async function syncEndpoints(stripe, config, opts) {
  console.log(`\n=== webhook endpoints (${opts.mode}) ===`);
  const existingWebhooksForMode = (await stripe.webhookEndpoints.list()).data;
  const plans = planEndpoints(config.endpoints, opts.mode, existingWebhooksForMode, config.events);

  for (const plan of plans) {
    if (plan.action === "noop") {
      console.log(`  ${plan.environment} (${plan.url}): up to date (${plan.id})`);
      continue;
    }
    if (plan.action === "create") {
      console.log(`  ${plan.environment} (${plan.url}): ${opts.apply ? "creating" : "would create"}`);
      if (!opts.apply) continue;
      const created = await stripe.webhookEndpoints.create({
        url: plan.url,
        enabled_events: config.events,
        description: `${plan.environment} environment webhook`,
      });
      console.log(`    created ${created.id}`);
      putSecretWithRotationTag(plan.secret.awsSecret, created.secret);
      console.log(`    signing secret written to ${plan.secret.awsSecret}`);
      continue;
    }
    // action === "update"
    console.log(
      `  ${plan.environment} (${plan.url}): ${opts.apply ? "updating" : "would update"} (${plan.id})${plan.needsEnable ? " re-enable" : ""}${plan.eventsChanged ? " events" : ""}`,
    );
    if (!opts.apply) continue;
    const updateBody = { enabled_events: config.events };
    if (plan.needsEnable) updateBody.disabled = false;
    await stripe.webhookEndpoints.update(plan.id, updateBody);
    console.log(`    updated ${plan.id}`);
  }
}

async function syncPaymentLinks(stripe, config, opts) {
  console.log(`\n=== payment links (${opts.mode}) ===`);
  if (config.paymentLinks.length === 0) {
    console.log("  stripe.toml has no [[payment_link]] entries");
    return;
  }
  const live = (await stripe.paymentLinks.list({ limit: 100 })).data;
  const plans = planPaymentLinks(config, live);

  for (const plan of plans) {
    if (plan.action === "missing") {
      console.log(`  ${plan.bundleId} (${plan.url}): not found in this account`);
      continue;
    }
    if (plan.action === "noop") {
      console.log(`  ${plan.bundleId} (${plan.url}): up to date (${plan.id})`);
      continue;
    }
    console.log(`  ${plan.bundleId} (${plan.url}): ${opts.apply ? "updating" : "would update"} (${plan.id})`);
    if (!opts.apply) continue;
    await stripe.paymentLinks.update(plan.id, { payment_intent_data: { metadata: { bundleId: plan.bundleId } } });
    console.log(`    updated ${plan.id}`);
  }
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = loadConfigFromRoot();

  console.log(`Stripe sync: ${opts.apply ? "APPLY" : "PLAN"} (${opts.environment}, ${opts.mode} mode)`);

  const secretName = config.keys[opts.environment]?.[opts.mode];
  if (!secretName) {
    throw new Error(`stripe.toml has no [keys.${opts.environment}].${opts.mode}`);
  }
  const secretKey = await getSecretValue(secretName);
  const stripe = new Stripe(secretKey);

  if (opts.paymentLinksOnly) {
    await syncPaymentLinks(stripe, config, opts);
    console.log(`\n${opts.apply ? "Applied." : "Plan complete. Re-run with --apply to make these changes."}`);
    return;
  }

  const results = await syncProducts(stripe, opts);
  if (opts.apply && results.length > 0) {
    await applyEnvUpdates(opts.mode, results);
  }

  if (!opts.productsOnly) {
    await syncEndpoints(stripe, config, opts);
    await syncPaymentLinks(stripe, config, opts);
  }

  console.log(`\n${opts.apply ? "Applied." : "Plan complete. Re-run with --apply to make these changes."}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("stripe-sync failed:", err.message);
    process.exit(1);
  });
}
