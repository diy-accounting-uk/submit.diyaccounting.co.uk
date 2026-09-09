#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/stripe-cancel-subscription.js
//
// Cancel a Stripe subscription by ID or customer email.
// Verifies the webhook updated DynamoDB after cancellation (30s timeout).
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-cancel-subscription.js <subscription_id> [options]
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-cancel-subscription.js --by-email <email> [options]
//
// Options:
//   --at-period-end  Cancel at end of billing period (default)
//   --immediate      Cancel immediately
//   --dry-run        Show what would happen without making changes
//   --yes            Skip confirmation prompt
//
// Environment variables:
//   STRIPE_SECRET_KEY                  Stripe secret key (required)
//   SUBSCRIPTIONS_DYNAMODB_TABLE_NAME  DynamoDB subscriptions table (optional, for verification)
//   AWS_REGION                         AWS region (default: eu-west-2)

import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY environment variable is required");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    subscriptionId: null,
    byEmail: null,
    immediate: false,
    dryRun: false,
    yes: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--by-email":
        opts.byEmail = args[++i];
        break;
      case "--immediate":
        opts.immediate = true;
        break;
      case "--at-period-end":
        opts.immediate = false;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--yes":
        opts.yes = true;
        break;
      default:
        if (!args[i].startsWith("--") && !opts.subscriptionId) {
          opts.subscriptionId = args[i];
        } else {
          console.error(`Unknown argument: ${args[i]}`);
          process.exit(1);
        }
    }
  }

  if (!opts.subscriptionId && !opts.byEmail) {
    console.error(
      "Usage: node scripts/stripe-cancel-subscription.js <subscription_id> [--immediate | --at-period-end] [--dry-run] [--yes]",
    );
    console.error(
      "       node scripts/stripe-cancel-subscription.js --by-email <email> [--immediate | --at-period-end] [--dry-run] [--yes]",
    );
    process.exit(1);
  }

  return opts;
}

async function resolveSubscriptionByEmail(email) {
  console.log(`Looking up customer by email: ${email}`);
  const customers = await stripe.customers.list({ email, limit: 10 });

  if (customers.data.length === 0) {
    console.error(`No Stripe customer found with email: ${email}`);
    process.exit(1);
  }

  const allSubscriptions = [];
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 100 });
    for (const sub of subs.data) {
      allSubscriptions.push({ ...sub, customerEmail: email });
    }
  }

  if (allSubscriptions.length === 0) {
    console.error(`No active subscriptions found for email: ${email}`);
    process.exit(1);
  }

  if (allSubscriptions.length === 1) {
    return allSubscriptions[0];
  }

  console.log(`\nMultiple subscriptions found for ${email}:`);
  for (let i = 0; i < allSubscriptions.length; i++) {
    const sub = allSubscriptions[i];
    console.log(`  [${i}] ${sub.id} — ${sub.status} — ${sub.items.data.map((item) => item.price.nickname || item.price.id).join(", ")}`);
  }
  console.error("\nSpecify the subscription ID directly to cancel a specific one.");
  process.exit(1);
}

function formatDate(epochSeconds) {
  return new Date(epochSeconds * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z/, " UTC");
}

function displaySubscription(sub) {
  console.log("\n--- Subscription Details ---");
  console.log(`  ID:                 ${sub.id}`);
  console.log(`  Status:             ${sub.status}`);
  console.log(`  Customer:           ${sub.customer}`);
  console.log(`  Cancel at end:      ${sub.cancel_at_period_end}`);
  console.log(`  Current period end: ${formatDate(sub.current_period_end)}`);
  console.log(`  Created:            ${formatDate(sub.created)}`);
  if (sub.items?.data?.length > 0) {
    for (const item of sub.items.data) {
      const price = item.price;
      console.log(
        `  Plan:               ${price.nickname || price.id} (${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}/${price.recurring?.interval || "?"})`,
      );
    }
  }
  console.log("----------------------------\n");
}

async function confirm(message) {
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function pollDynamoDbVerification(subscriptionId, expectedStatus, timeoutMs = 30000) {
  const tableName = process.env.SUBSCRIPTIONS_DYNAMODB_TABLE_NAME;
  if (!tableName) {
    console.log("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME not set — skipping DynamoDB verification");
    return null;
  }

  let DynamoDBClient, DynamoDBDocumentClient, GetCommand;
  try {
    const dynamodb = await import("@aws-sdk/client-dynamodb");
    const libDynamodb = await import("@aws-sdk/lib-dynamodb");
    DynamoDBClient = dynamodb.DynamoDBClient;
    DynamoDBDocumentClient = libDynamodb.DynamoDBDocumentClient;
    GetCommand = libDynamodb.GetCommand;
  } catch {
    console.log("AWS SDK not available — skipping DynamoDB verification");
    return null;
  }

  const region = process.env.AWS_REGION || "eu-west-2";
  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);
  const pk = `stripe#${subscriptionId}`;

  console.log(`Polling DynamoDB for subscription update (${timeoutMs / 1000}s timeout)...`);
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await docClient.send(new GetCommand({ TableName: tableName, Key: { pk } }));
      const item = result.Item;
      if (item) {
        if (expectedStatus === "cancel_at_period_end" && item.cancelAtPeriodEnd === true) {
          console.log("DynamoDB verification: cancelAtPeriodEnd updated to true");
          return item;
        }
        if (expectedStatus === "canceled" && item.status === "canceled") {
          console.log("DynamoDB verification: status updated to canceled");
          return item;
        }
      }
    } catch (err) {
      console.warn(`DynamoDB poll error: ${err.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  console.warn("DynamoDB verification timed out — webhook may not have arrived yet");
  // Return current state for reporting
  try {
    const result = await docClient.send(new GetCommand({ TableName: tableName, Key: { pk } }));
    return result.Item || null;
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs();

  // Resolve subscription
  let subscription;
  if (opts.byEmail) {
    subscription = await resolveSubscriptionByEmail(opts.byEmail);
  } else {
    try {
      subscription = await stripe.subscriptions.retrieve(opts.subscriptionId);
    } catch (err) {
      console.error(`Failed to retrieve subscription ${opts.subscriptionId}: ${err.message}`);
      process.exit(1);
    }
  }

  displaySubscription(subscription);

  const mode = opts.immediate ? "immediately" : "at period end";
  console.log(`Action: Cancel ${mode}`);

  if (opts.dryRun) {
    console.log("[DRY RUN] No changes made.");
    process.exit(0);
  }

  if (!opts.yes) {
    const proceed = await confirm(`Cancel subscription ${subscription.id} ${mode}?`);
    if (!proceed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // Execute cancellation
  if (opts.immediate) {
    console.log(`Cancelling subscription ${subscription.id} immediately...`);
    const canceled = await stripe.subscriptions.cancel(subscription.id);
    console.log(`Subscription canceled. Status: ${canceled.status}`);

    const dbRecord = await pollDynamoDbVerification(subscription.id, "canceled");
    if (dbRecord) {
      console.log("\n--- DynamoDB Subscription Record ---");
      console.log(`  Status:             ${dbRecord.status}`);
      console.log(`  Cancel at end:      ${dbRecord.cancelAtPeriodEnd}`);
      console.log(`  Updated at:         ${dbRecord.updatedAt}`);
      console.log("------------------------------------");
    }
  } else {
    console.log(`Scheduling cancellation at period end for ${subscription.id}...`);
    const updated = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
    console.log(`Subscription updated. cancel_at_period_end: ${updated.cancel_at_period_end}`);

    const dbRecord = await pollDynamoDbVerification(subscription.id, "cancel_at_period_end");
    if (dbRecord) {
      console.log("\n--- DynamoDB Subscription Record ---");
      console.log(`  Status:             ${dbRecord.status}`);
      console.log(`  Cancel at end:      ${dbRecord.cancelAtPeriodEnd}`);
      console.log(`  Updated at:         ${dbRecord.updatedAt}`);
      console.log("------------------------------------");
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Cancellation failed:", err.message);
  process.exit(1);
});
