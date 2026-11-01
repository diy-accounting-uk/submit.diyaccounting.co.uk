// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/commissionJourneys.system.test.js

// One journey per referrer kind, from a signed invoice.paid webhook to the payout, on dynalite and the Stripe simulator:
// the webhook handler accrues the lines, releaseCommissions runs at a chosen clock, and the payout handlers pay what is payable.

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Stripe from "stripe";
import { dotenvConfigIfNotBlank } from "../lib/env.js";
import { startStripeSimulator } from "../test-support/stripeSimulator.js";
import { emulateTransactions } from "../test-support/dynaliteTransactions.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const WEBHOOK_SECRET = "whsec_commission_journeys";
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_STARTS = [Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1), Date.UTC(2026, 2, 1), Date.UTC(2026, 3, 1), Date.UTC(2026, 4, 1)];
const seconds = (ms) => ms / 1000;
const chargedAtOf = (monthIndex) => MONTH_STARTS[monthIndex] + 3600 * 1000;
const NET_PENCE = 1000;

let stopDynalite;
let simulatorServer;
let stripeState;
let endpoint;
let tableCounter = 0;
let ids;

let webhook;
let repo;
let passes;
let bundles;
let subscriptions;
let release;
let creditPayout;
let cashPayout;

beforeAll(async () => {
  const { default: dynalite } = await import("dynalite");
  const dynamodbModule = await import("../bin/dynamodb.js");

  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve(server.address())));
  });
  stopDynalite = async () => {
    try {
      server.close();
    } catch {}
  };
  endpoint = `http://127.0.0.1:${address.port}`;

  stripeState = { accounts: {}, transfers: [], invoices: {}, customers: {} };
  simulatorServer = await startStripeSimulator(0, { state: stripeState });

  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.BUNDLE_DYNAMODB_TABLE_NAME = "bundles-system-test-commission";
  process.env.PASSES_DYNAMODB_TABLE_NAME = "passes-system-test-commission";
  process.env.SUBSCRIPTIONS_DYNAMODB_TABLE_NAME = "subscriptions-system-test-commission";
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-commission-journeys"}}';
  process.env.STRIPE_SECRET_KEY = "sk_test_commission_journeys";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${simulatorServer.address().port}`;
  delete process.env.ACTIVITY_BUS_NAME;

  await dynamodbModule.ensureBundleTableExists(process.env.BUNDLE_DYNAMODB_TABLE_NAME, endpoint);
  await dynamodbModule.ensurePassesTableExists(process.env.PASSES_DYNAMODB_TABLE_NAME, endpoint);
  await dynamodbModule.ensureSubscriptionsTableExists(process.env.SUBSCRIPTIONS_DYNAMODB_TABLE_NAME, endpoint);

  await emulateTransactions();

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  webhook = await import("../functions/billing/billingWebhookPost.js");
  repo = await import("../data/dynamoDbCommissionRepository.js");
  passes = await import("../data/dynamoDbPassRepository.js");
  bundles = await import("../data/dynamoDbBundleRepository.js");
  subscriptions = await import("../data/dynamoDbSubscriptionRepository.js");
  release = await import("../functions/account/commissionRelease.js");
  creditPayout = await import("../functions/account/commissionCreditPayout.js");
  cashPayout = await import("../functions/account/commissionCashPayout.js");
});

afterAll(async () => {
  await stopDynalite?.();
  if (simulatorServer) await new Promise((resolve) => simulatorServer.close(resolve));
});

// Each journey gets its own commissions table, so a release run sees only that journey's held lines.
beforeEach(async () => {
  tableCounter += 1;
  process.env.COMMISSIONS_DYNAMODB_TABLE_NAME = `commissions-system-test-${tableCounter}`;
  const { ensureCommissionsTableExists } = await import("../bin/dynamodb.js");
  await ensureCommissionsTableExists(process.env.COMMISSIONS_DYNAMODB_TABLE_NAME, endpoint);
  ids = {
    referrer: `referrer-${tableCounter}`,
    redeemer: `redeemer-${tableCounter}`,
    code: `CODE${tableCounter}`,
    subscription: `sub_${tableCounter}`,
    referrerCustomer: `cus_referrer_${tableCounter}`,
    redeemerCustomer: `cus_redeemer_${tableCounter}`,
  };
});

async function seedAccounts() {
  const now = "2025-12-01T00:00:00.000Z";
  await bundles.putBundleByHashedSub(ids.referrer, {
    bundleId: "resident",
    stripeCustomerId: ids.referrerCustomer,
    stripeSubscriptionId: `sub_referrer_${tableCounter}`,
    subscriptionStatus: "active",
  });
  await bundles.putBundleByHashedSub(ids.redeemer, {
    bundleId: "resident",
    stripeCustomerId: ids.redeemerCustomer,
    stripeSubscriptionId: ids.subscription,
    subscriptionStatus: "active",
  });
  await subscriptions.putSubscription({
    pk: `stripe#${ids.subscription}`,
    hashedSub: ids.redeemer,
    bundleId: "resident",
    status: "active",
    actor: "customer",
  });
  await passes.putReferralClaim(ids.redeemer, ids.code, now);
  await passes.putRedemption({ code: ids.code, hashedSub: ids.redeemer, issuedBy: ids.referrer, passTypeId: "referral", redeemedAt: now });
}

function invoiceFor(monthIndex) {
  const n = monthIndex + 1;
  return {
    id: `in_${tableCounter}_${n}`,
    livemode: true,
    customer: { id: ids.redeemerCustomer, created: seconds(MONTH_STARTS[0]) + 100 },
    parent: { subscription_details: { subscription: ids.subscription } },
    charge: {
      id: `ch_${tableCounter}_${n}`,
      amount: 1200,
      created: seconds(chargedAtOf(monthIndex)),
      refunded: false,
      amount_refunded: 0,
      disputed: false,
      payment_method_details: { card: { fingerprint: `fp_${tableCounter}` } },
      balance_transaction: { net: NET_PENCE, fee: 200, currency: "gbp" },
    },
    lines: {
      data: [{ type: "subscription", period: { start: seconds(MONTH_STARTS[monthIndex]), end: seconds(MONTH_STARTS[monthIndex + 1]) } }],
    },
  };
}

async function sendWebhook(type, object) {
  const payload = JSON.stringify({ id: `evt_${type}_${object.id}`, object: "event", type, livemode: true, data: { object } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const result = await webhook.ingestHandler({
    headers: { "stripe-signature": signature },
    body: payload,
    requestContext: { http: { method: "POST", path: "/api/v1/billing/webhook" } },
  });
  expect(result.statusCode).toBe(200);
}

async function payInvoice(monthIndex) {
  const invoice = invoiceFor(monthIndex);
  stripeState.invoices[invoice.id] = invoice;
  await sendWebhook("invoice.paid", invoice);
}

const lineOf = (monthIndex) => repo.getLine(ids.referrer, `in_${tableCounter}_${monthIndex + 1}`);
const totalsItem = (sk) => repo.getLineByKey(repo.commissionPk(ids.referrer), sk);

async function releaseDate(monthIndexes) {
  const lines = await Promise.all(monthIndexes.map((index) => lineOf(index)));
  return new Date(Math.max(...lines.map((line) => new Date(line.releaseAt).getTime())));
}

const shape = (line) => ({
  state: line.state,
  tier: line.tier,
  form: line.form,
  amountPence: line.amountPence,
  holdReasons: line.holdReasons,
});

describe("commission journeys on dynalite and the Stripe simulator", () => {
  test("J1 customer credit: three renewals earn credit that pays onto the referrer's Stripe balance", async () => {
    await seedAccounts();
    for (const month of [0, 1, 2, 3]) await payInvoice(month);

    expect(await lineOf(3)).toBeNull();
    const heldLines = await Promise.all([0, 1, 2].map(lineOf));
    expect(heldLines.map(shape)).toEqual(
      Array(3).fill({ state: "held", tier: "customer", form: "credit", amountPence: 330, holdReasons: [] }),
    );
    expect(heldLines.map((line) => line.releaseAt)).toEqual(
      [0, 1, 2].map((index) => new Date(chargedAtOf(index) + 30 * DAY_MS).toISOString()),
    );

    const beforeHoldEnds = new Date(new Date(heldLines[0].releaseAt).getTime() - 1);
    expect(await release.releaseCommissions(beforeHoldEnds)).toEqual({ evaluated: 0, released: 0, held: 0, stale: 0 });
    expect(await repo.queryPayablePointers(repo.PAYABLE_CREDIT_PARTITION)).toEqual([]);

    expect(await release.releaseCommissions(await releaseDate([0, 1, 2]))).toEqual({ evaluated: 3, released: 3, held: 0, stale: 0 });
    const payableLines = await Promise.all([0, 1, 2].map(lineOf));
    expect(payableLines.map((line) => line.state)).toEqual(["payable", "payable", "payable"]);
    expect(await repo.queryPayablePointers(repo.PAYABLE_CREDIT_PARTITION)).toHaveLength(3);
    expect(await totalsItem("totals#credit")).toMatchObject({ creditPence: 990 });

    expect(await creditPayout.handler()).toMatchObject({ status: "ran", considered: 3, paid: 3, failed: 0, noCustomer: 0 });
    expect(stripeState.customers[ids.referrerCustomer].balance).toBe(-990);
    const paidLines = await Promise.all([0, 1, 2].map(lineOf));
    expect(paidLines.map((line) => line.state)).toEqual(["paid", "paid", "paid"]);
    expect(paidLines.every((line) => Boolean(line.balanceTransactionId))).toBe(true);
    expect(await repo.queryPayablePointers(repo.PAYABLE_CREDIT_PARTITION)).toEqual([]);

    expect(await creditPayout.handler()).toMatchObject({ considered: 0, paid: 0 });
    expect(stripeState.customers[ids.referrerCustomer].balance).toBe(-990);
    expect(await cashPayout.handler()).toEqual({ status: "off" });
  });

  test("J2 family: the first month is held as not approved until the referrer is approved, and then needs a hand payment", async () => {
    await seedAccounts();
    await passes.putFamilyAffiliate({ hashedSub: ids.referrer, emailKey: `family-key-${tableCounter}`, now: "2025-11-01T00:00:00.000Z" });
    for (const month of [0, 1, 2]) await payInvoice(month);

    expect(await lineOf(1)).toBeNull();
    expect(await lineOf(2)).toBeNull();
    const accrued = await lineOf(0);
    expect(shape(accrued)).toEqual({ state: "held", tier: "family", form: "cash", amountPence: 1000, holdReasons: [] });
    expect(accrued.releaseAt).toBe(new Date(chargedAtOf(0) + 60 * DAY_MS).toISOString());

    const due = await releaseDate([0]);
    expect(await release.releaseCommissions(due)).toEqual({ evaluated: 1, released: 0, held: 1, stale: 0 });
    expect(shape(await lineOf(0))).toMatchObject({ state: "held", holdReasons: ["affiliate_not_approved"] });
    expect(await repo.queryDueHeldPointers(due.toISOString())).toHaveLength(1);
    expect(await totalsItem(`totals#taxyear#2025-26`)).toBeNull();

    await passes.putAffiliate({ referrerHash: ids.referrer, tier: "casual", state: "approved", now: due.toISOString() });
    expect(await release.releaseCommissions(due)).toEqual({ evaluated: 1, released: 1, held: 0, stale: 0 });
    const payable = await lineOf(0);
    expect(payable).toMatchObject({ state: "payable", amountPence: 1000, tier: "family", payableTaxYear: "2025-26" });
    expect(await totalsItem("totals#taxyear#2025-26")).toMatchObject({ cashPence: 1000 });
    expect(await totalsItem(`totals#month#${payable.payableMonth}`)).toBeNull();

    expect(await repo.queryPayablePointers(repo.PAYABLE_CREDIT_PARTITION)).toEqual([]);
    expect(await repo.queryPayablePointers(repo.PAYABLE_CONNECT_PARTITION)).toEqual([]);
    expect(await creditPayout.handler()).toMatchObject({ considered: 0 });
    expect(await cashPayout.handler()).toEqual({ status: "off" });
    expect((await lineOf(0)).state).toBe("payable");
    expect(stripeState.transfers).toEqual([]);
  });

  test("J3 affiliate applied, not approved: the first invoice fixes the customer tier and approval later does not change it", async () => {
    await seedAccounts();
    await passes.putAffiliate({ referrerHash: ids.referrer, tier: "casual", state: "applied", now: "2025-11-01T00:00:00.000Z" });
    await payInvoice(0);
    await passes.putAffiliate({ referrerHash: ids.referrer, tier: "casual", state: "approved", now: "2026-01-15T00:00:00.000Z" });
    await payInvoice(1);
    await payInvoice(2);

    const lines = await Promise.all([0, 1, 2].map(lineOf));
    expect(lines.map(shape)).toEqual(Array(3).fill({ state: "held", tier: "customer", form: "credit", amountPence: 330, holdReasons: [] }));

    expect(await release.releaseCommissions(await releaseDate([0, 1, 2]))).toEqual({ evaluated: 3, released: 3, held: 0, stale: 0 });
    expect(await totalsItem("totals#credit")).toMatchObject({ creditPence: 990 });
    expect(await repo.queryPayablePointers(repo.PAYABLE_CONNECT_PARTITION)).toEqual([]);

    expect(await creditPayout.handler()).toMatchObject({ considered: 3, paid: 3, failed: 0 });
    expect(stripeState.customers[ids.referrerCustomer].balance).toBe(-990);
    expect((await Promise.all([0, 1, 2].map(lineOf))).map((line) => line.state)).toEqual(["paid", "paid", "paid"]);
    expect(await cashPayout.handler()).toEqual({ status: "off" });
  });

  test("J4 affiliate approved casual: cash lines wait 120 days, count in the month and tax-year totals, and stay payable while cash payout is off", async () => {
    await seedAccounts();
    await passes.putAffiliate({ referrerHash: ids.referrer, tier: "casual", state: "approved", now: "2025-11-01T00:00:00.000Z" });
    for (const month of [0, 1, 2, 3]) await payInvoice(month);

    expect(await lineOf(3)).toBeNull();
    const heldLines = await Promise.all([0, 1, 2].map(lineOf));
    expect(heldLines.map(shape)).toEqual(Array(3).fill({ state: "held", tier: "casual", form: "cash", amountPence: 330, holdReasons: [] }));
    expect(heldLines.map((line) => line.releaseAt)).toEqual(
      [0, 1, 2].map((index) => new Date(chargedAtOf(index) + 120 * DAY_MS).toISOString()),
    );

    const beforeHoldEnds = new Date(new Date(heldLines[0].releaseAt).getTime() - 1);
    expect(await release.releaseCommissions(beforeHoldEnds)).toEqual({ evaluated: 0, released: 0, held: 0, stale: 0 });

    const due = await releaseDate([0, 1, 2]);
    expect(await release.releaseCommissions(due)).toEqual({ evaluated: 3, released: 3, held: 0, stale: 0 });
    const payableLines = await Promise.all([0, 1, 2].map(lineOf));
    expect(payableLines.map((line) => line.state)).toEqual(["payable", "payable", "payable"]);
    const { payableMonth, payableTaxYear } = payableLines[0];
    expect(payableMonth).toBe(due.toISOString().slice(0, 7));
    expect(await totalsItem(`totals#month#${payableMonth}`)).toMatchObject({ cashPence: 990 });
    expect(await totalsItem(`totals#taxyear#${payableTaxYear}`)).toMatchObject({ cashPence: 990 });
    expect(await totalsItem("totals#credit")).toBeNull();

    expect(await repo.queryPayablePointers(repo.PAYABLE_CONNECT_PARTITION)).toHaveLength(3);
    expect(await repo.queryPayablePointers(repo.PAYABLE_CREDIT_PARTITION)).toEqual([]);
    expect(await creditPayout.handler()).toMatchObject({ considered: 0, paid: 0 });
    expect(await cashPayout.handler()).toEqual({ status: "off" });
    expect((await Promise.all([0, 1, 2].map(lineOf))).map((line) => line.state)).toEqual(["payable", "payable", "payable"]);
    expect(await repo.queryPayablePointers(repo.PAYABLE_CONNECT_PARTITION)).toHaveLength(3);
    expect(stripeState.transfers).toEqual([]);
  });
});
