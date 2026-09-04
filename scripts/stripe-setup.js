#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/stripe-setup.js
//
// Idempotent Stripe setup script. Creates products, prices and webhook endpoints from
// the bundle catalogue (web/public/submit.catalogue.toml). Requires STRIPE_SECRET_KEY.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js
//
// Options:
//   --dry-run       Search and list only; print what exists and what would be
//                   created, without writing anything to Stripe.
//   --products-only Skip the webhook endpoints, only sync products and prices.
//   --bundle <id>   Limit to a single bundle id.

import Stripe from "stripe";
import { fileURLToPath } from "node:url";

import { loadCatalogFromRoot } from "../app/services/productCatalog.js";
import { buildStripeProductsFromCatalog } from "./lib/stripeCatalogue.js";

export function parseArgs(argv) {
  const opts = { dryRun: false, productsOnly: false, bundleId: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--products-only":
        opts.productsOnly = true;
        break;
      case "--bundle":
        opts.bundleId = argv[++i];
        if (!opts.bundleId) throw new Error("--bundle requires a bundle id");
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function findOrCreateProduct(stripe, bundleId, name, description, dryRun) {
  const products = await stripe.products.search({
    query: `metadata["bundleId"]:"${bundleId}"`,
  });

  if (products.data.length > 0) {
    console.log(`Product already exists for ${bundleId}:`, products.data[0].id);
    return products.data[0];
  }

  if (dryRun) {
    console.log(`[dry-run] Would create product for ${bundleId}: ${name}`);
    return { id: "(dry-run, not created)" };
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: { bundleId },
  });
  console.log(`Created product for ${bundleId}:`, product.id);
  return product;
}

async function findOrCreatePrice(stripe, productId, bundleId, unitAmount, currency, interval, dryRun) {
  if (dryRun && productId === "(dry-run, not created)") {
    console.log(`[dry-run] Would create price for ${bundleId}: ${unitAmount} ${currency}/${interval}`);
    return { id: "(dry-run, not created)" };
  }

  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "recurring",
  });

  const existing = prices.data.find((p) => p.unit_amount === unitAmount && p.currency === currency && p.recurring?.interval === interval);
  if (existing) {
    console.log(`Price already exists for ${bundleId}:`, existing.id);
    return existing;
  }

  if (dryRun) {
    console.log(`[dry-run] Would create price for ${bundleId}: ${unitAmount} ${currency}/${interval}`);
    return { id: "(dry-run, not created)" };
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency,
    recurring: { interval },
    metadata: { bundleId },
  });
  console.log(`Created price for ${bundleId}:`, price.id);
  return price;
}

const DESIRED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
];

async function findOrCreateWebhook(stripe, url, description, dryRun) {
  const webhooks = await stripe.webhookEndpoints.list();
  const existing = webhooks.data.find((w) => w.url === url);
  if (existing) {
    // Re-enable disabled endpoints (Stripe auto-disables after sustained delivery failures)
    const needsEnable = existing.status === "disabled";
    // Check if enabled_events need updating
    const currentEvents = [...(existing.enabled_events || [])].sort();
    const desiredEvents = [...DESIRED_EVENTS].sort();
    const needsEventUpdate = currentEvents.length !== desiredEvents.length || currentEvents.some((e, i) => e !== desiredEvents[i]);

    if (needsEnable || needsEventUpdate) {
      if (dryRun) {
        console.log(`[dry-run] Webhook exists for ${url}: ${existing.id} — would update${needsEnable ? " (re-enable)" : ""}`);
        return existing;
      }
      const updates = { enabled_events: DESIRED_EVENTS };
      if (needsEnable) updates.disabled = false;
      console.log(`Webhook exists for ${url}: ${existing.id} — updating${needsEnable ? " (re-enabling)" : ""}`);
      if (needsEventUpdate) {
        console.log(`  Current events: [${currentEvents.join(", ")}]`);
        console.log(`  Desired events: [${desiredEvents.join(", ")}]`);
      }
      const updated = await stripe.webhookEndpoints.update(existing.id, updates);
      console.log(`  Updated successfully — status: ${updated.status}`);
      return updated;
    }

    console.log(`Webhook already exists for ${url}:`, existing.id, `(status: ${existing.status}, events up to date)`);
    return existing;
  }

  if (dryRun) {
    console.log(`[dry-run] Would create webhook for ${url}`);
    return { id: "(dry-run, not created)", secret: undefined };
  }

  const webhook = await stripe.webhookEndpoints.create({
    url,
    enabled_events: DESIRED_EVENTS,
    description,
  });
  console.log(`Created webhook for ${url}:`, webhook.id);
  console.log(`  Webhook signing secret:`, webhook.secret);
  return webhook;
}

export async function main() {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY environment variable is required");
    process.exit(1);
    return;
  }

  const opts = parseArgs(process.argv.slice(2));
  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const catalog = loadCatalogFromRoot();
  const PRODUCTS = buildStripeProductsFromCatalog(catalog, { bundleId: opts.bundleId });

  if (opts.bundleId && PRODUCTS.length === 0) {
    console.error(`No on-subscription bundle "${opts.bundleId}" with Stripe price fields found in the catalogue`);
    process.exit(1);
    return;
  }

  console.log(`Setting up Stripe resources${opts.dryRun ? " (dry run)" : ""}...\n`);

  // Create products and prices for each bundle
  const results = [];
  for (const p of PRODUCTS) {
    const product = await findOrCreateProduct(stripe, p.bundleId, p.name, p.description, opts.dryRun);
    const price = await findOrCreatePrice(stripe, product.id, p.bundleId, p.priceAmount, p.currency, p.interval, opts.dryRun);
    results.push({ ...p, productId: product.id, priceId: price.id });
  }

  let ciWebhook;
  let prodWebhook;
  if (!opts.productsOnly) {
    // CI webhook — env-level endpoint, always available even when app stacks are torn down.
    ciWebhook = await findOrCreateWebhook(
      stripe,
      "https://ci-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook",
      "CI environment webhook (env-level, persistent)",
      opts.dryRun,
    );

    // Prod webhook — env-level endpoint, independent of app deployments.
    prodWebhook = await findOrCreateWebhook(
      stripe,
      "https://prod-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook",
      "Production environment webhook (env-level, persistent)",
      opts.dryRun,
    );
  }

  const mode = STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE" : "TEST";
  const secretEnvName = mode === "TEST" ? "STRIPE_TEST_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET";
  const priceEnvPrefix = mode === "TEST" ? "STRIPE_TEST_PRICE_ID" : "STRIPE_PRICE_ID";
  console.log(`\n=== Stripe Setup Complete (${mode} mode${opts.dryRun ? ", dry run" : ""}) ===`);
  console.log("\nProducts & Prices:");
  for (const r of results) {
    const suffix = `_${r.bundleId.toUpperCase().replace(/-/g, "_")}`;
    console.log(`  ${r.name} (${r.bundleId}):`);
    console.log(`    Product ID: ${r.productId}`);
    console.log(`    Price ID:   ${r.priceId} (£${(r.priceAmount / 100).toFixed(2)}/${r.interval})`);
    console.log(`    Env var:    ${priceEnvPrefix}${suffix}=${r.priceId}`);
  }
  if (!opts.productsOnly) {
    console.log(`CI Webhook (${mode}):`);
    console.log("  ID:", ciWebhook.id);
    console.log("  Secret:", ciWebhook.secret || "(already exists — retrieve from Stripe Dashboard)");
    console.log(`Prod Webhook (${mode}):`);
    console.log("  ID:", prodWebhook.id);
    console.log("  Secret:", prodWebhook.secret || "(already exists — retrieve from Stripe Dashboard)");
    console.log(`\nStore webhook secrets as ${secretEnvName} per environment:`);
    console.log(`  Proxy: set ${secretEnvName} in .env (gitignored)`);
    console.log(`  CI:    set ${secretEnvName} in GitHub Environment "ci"`);
    console.log(`  Prod:  set ${secretEnvName} in GitHub Environment "prod"`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Setup failed:", err.message);
    process.exit(1);
  });
}
