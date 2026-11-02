#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/commission-ci-clock-spike.js
//
// One checkout for one customer on a Stripe Test Clock, through the deployed ci API.
//   start   ensures the spike lane, creates a clock, asks the checkout route for a session on it and
//           prints the Stripe Checkout URL. Open the URL and pay with 4242 4242 4242 4242.
//   verify  waits for the subscription record, prints its actor and status, and deletes the clock.
// The answer to "does Checkout take a customer on a Test Clock" is whether `start` prints a URL and
// the page takes the card. The answer to "does the webhook see a test-user" is the printed actor.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CLOCK_NAME_PREFIX,
  getSubscriptionRecord,
  getTestStripe,
  openSessions,
  pollUntil,
} from "../behaviour-tests/helpers/commissionCi.js";

const LANE = "commission-spike";
const STATE_FILE = "target/commission-ci-clock-spike.json";

async function start() {
  const baseUrl = process.env.DIY_SUBMIT_BASE_URL;
  if (!baseUrl) throw new Error("DIY_SUBMIT_BASE_URL is not set");
  const stripe = await getTestStripe();
  const { [LANE]: session } = await openSessions({ baseUrl, lanes: [LANE] });
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `${CLOCK_NAME_PREFIX}spike-${Date.now()}`,
  });
  const checkoutUrl = await session.startCheckout({ testClockId: clock.id });
  fs.mkdirSync("target", { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ clockId: clock.id, email: session.email }));
  console.log(`Clock ${clock.id}. Open and pay with 4242 4242 4242 4242, any future expiry, any CVC:\n${checkoutUrl}`);
  console.log("Then run: node scripts/commission-ci-clock-spike.js verify");
}

async function verify() {
  const stripe = await getTestStripe();
  const { clockId } = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  const subscription = await pollUntil("a subscription on the clock", async () => {
    for await (const found of stripe.subscriptions.list({ test_clock: clockId, status: "all", limit: 1 })) return found;
    return null;
  });
  const record = await pollUntil("the subscription record", () => getSubscriptionRecord(subscription.id));
  console.log(`Subscription ${subscription.id}: status ${subscription.status}, actor ${record.actor}, record status ${record.status}`);
  await stripe.testHelpers.testClocks.del(clockId);
  console.log(`Deleted clock ${clockId}`);
  if (record.actor !== "test-user") throw new Error(`Expected actor test-user, got ${record.actor}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const run = command === "start" ? start : command === "verify" ? verify : null;
  if (!run) {
    console.error("Usage: node scripts/commission-ci-clock-spike.js start|verify");
    process.exit(1);
  }
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
