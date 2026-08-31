#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/stripe-setup.js
//
// Idempotent Stripe setup script. Creates products, prices, webhook endpoints,
// and customer portal configuration. Requires STRIPE_SECRET_KEY env var.
//
// Usage: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js

import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY environment variable is required");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

const PRODUCTS = [
  {
    bundleId: "resident-pro",
    name: "Resident Pro",
    description: "Monthly subscription for DIY Accounting Submit - unlimited VAT returns and pass generation",
    priceAmount: 999, // £9.99
    currency: "gbp",
    interval: "month",
  },
  {
    bundleId: "resident-vat",
    name: "Resident VAT",
    description: "Monthly subscription for DIY Accounting Submit - VAT returns",
    priceAmount: 99, // £0.99
    currency: "gbp",
    interval: "month",
  },
];

async function findOrCreateProduct(bundleId, name, description) {
  const products = await stripe.products.search({
    query: `metadata["bundleId"]:"${bundleId}"`,
  });

  if (products.data.length > 0) {
    console.log(`Product already exists for ${bundleId}:`, products.data[0].id);
    return products.data[0];
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: { bundleId },
  });
  console.log(`Created product for ${bundleId}:`, product.id);
  return product;
}

async function findOrCreatePrice(productId, bundleId, unitAmount, currency, interval) {
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

async function findOrCreateWebhook(url, description) {
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

  const webhook = await stripe.webhookEndpoints.create({
    url,
    enabled_events: DESIRED_EVENTS,
    description,
  });
  console.log(`Created webhook for ${url}:`, webhook.id);
  console.log(`  Webhook signing secret:`, webhook.secret);
  return webhook;
}

async function main() {
  console.log("Setting up Stripe resources...\n");

  // Create products and prices for each bundle
  const results = [];
  for (const p of PRODUCTS) {
    const product = await findOrCreateProduct(p.bundleId, p.name, p.description);
    const price = await findOrCreatePrice(product.id, p.bundleId, p.priceAmount, p.currency, p.interval);
    results.push({ ...p, productId: product.id, priceId: price.id });
  }

  // CI webhook — env-level endpoint, always available even when app stacks are torn down.
  const ciWebhook = await findOrCreateWebhook(
    "https://ci-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook",
    "CI environment webhook (env-level, persistent)",
  );

  // Prod webhook — env-level endpoint, independent of app deployments.
  const prodWebhook = await findOrCreateWebhook(
    "https://prod-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook",
    "Production environment webhook (env-level, persistent)",
  );

  const mode = STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE" : "TEST";
  const secretEnvName = mode === "TEST" ? "STRIPE_TEST_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET";
  const priceEnvPrefix = mode === "TEST" ? "STRIPE_TEST_PRICE_ID" : "STRIPE_PRICE_ID";
  console.log(`\n=== Stripe Setup Complete (${mode} mode) ===`);
  console.log("\nProducts & Prices:");
  for (const r of results) {
    const suffix = `_${r.bundleId.toUpperCase().replace(/-/g, "_")}`;
    console.log(`  ${r.name} (${r.bundleId}):`);
    console.log(`    Product ID: ${r.productId}`);
    console.log(`    Price ID:   ${r.priceId} (£${(r.priceAmount / 100).toFixed(2)}/${r.interval})`);
    console.log(`    Env var:    ${priceEnvPrefix}${suffix}=${r.priceId}`);
  }
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

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
