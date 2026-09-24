// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/stripeSync.test.js

import { describe, test, expect } from "vitest";

import { buildStripeProductsFromCatalog } from "../../../infra/stripe/lib/stripeCatalogue.js";
import {
  parseArgs,
  parseConfig,
  planEndpoints,
  planPaymentLinks,
  rewriteEnvLines,
  computeEnvUpdates,
} from "../../../infra/stripe/stripe-sync.js";
import { loadCatalogFromRoot } from "../../services/productCatalog.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("buildStripeProductsFromCatalog", () => {
  const catalog = loadCatalogFromRoot();

  test("returns the six Stripe prices with the correct amounts, resident and resident-pro each carrying two", () => {
    const products = buildStripeProductsFromCatalog(catalog);
    const byBundleId = Object.fromEntries(products.filter((p) => p.bundleId === "resident-vat").map((p) => [p.bundleId, p]));
    const residentPrices = products.filter((p) => p.bundleId === "resident");
    const residentProPrices = products.filter((p) => p.bundleId === "resident-pro");
    const confirmationStatementPrices = products.filter((p) => p.bundleId === "file-confirmation-statement");

    expect(products).toHaveLength(6);
    expect(byBundleId["resident-vat"]).toMatchObject({
      name: "Resident VAT",
      priceAmount: 99,
      currency: "gbp",
      interval: "month",
      multiPrice: false,
    });

    expect(residentPrices).toHaveLength(2);
    expect(residentPrices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Resident", priceAmount: 3900, currency: "gbp", interval: "year", multiPrice: true }),
        expect.objectContaining({ name: "Resident", priceAmount: 399, currency: "gbp", interval: "month", multiPrice: true }),
      ]),
    );

    expect(residentProPrices).toHaveLength(2);
    expect(residentProPrices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Resident Pro", priceAmount: 19900, currency: "gbp", interval: "year", multiPrice: true }),
        expect.objectContaining({ name: "Resident Pro", priceAmount: 1999, currency: "gbp", interval: "month", multiPrice: true }),
      ]),
    );

    expect(confirmationStatementPrices).toHaveLength(1);
    expect(confirmationStatementPrices[0]).toMatchObject({
      name: "File Confirmation Statement (Companies House)",
      priceAmount: 6135,
      currency: "gbp",
      interval: "submission",
      multiPrice: false,
    });
  });

  test("skips a bundle without Stripe price fields", () => {
    const catalogWithGap = {
      bundles: [
        { id: "default", name: "Default", allocation: "automatic" },
        {
          id: "resident-vat",
          name: "Resident VAT",
          description: "VAT",
          allocation: "on-subscription",
          prices: [{ interval: "month", amount: 99, currency: "gbp", default: true }],
        },
      ],
    };
    const products = buildStripeProductsFromCatalog(catalogWithGap);
    expect(products.map((p) => p.bundleId)).toEqual(["resident-vat"]);
  });

  test("filters to a single bundle when bundleId is given", () => {
    const products = buildStripeProductsFromCatalog(catalog, { bundleId: "resident-vat" });
    expect(products.map((p) => p.bundleId)).toEqual(["resident-vat"]);
  });

  test("filters to a single activity's one-off price when bundleId names an activity id", () => {
    const products = buildStripeProductsFromCatalog(catalog, { bundleId: "file-confirmation-statement" });
    expect(products).toEqual([
      expect.objectContaining({ bundleId: "file-confirmation-statement", priceAmount: 6135, interval: "submission", multiPrice: false }),
    ]);
  });

  test.each(["resident", "resident-pro"])("filters to %s's two prices when bundleId names a multi-price bundle", (bundleId) => {
    const products = buildStripeProductsFromCatalog(catalog, { bundleId });
    expect(products.map((p) => p.interval).sort()).toEqual(["month", "year"]);
    expect(products.every((p) => p.bundleId === bundleId && p.multiPrice === true)).toBe(true);
  });

  test("returns an empty list when the requested bundle has no Stripe price fields", () => {
    const products = buildStripeProductsFromCatalog(catalog, { bundleId: "default" });
    expect(products).toEqual([]);
  });

  test("returns an empty list when the requested bundle does not exist", () => {
    const products = buildStripeProductsFromCatalog(catalog, { bundleId: "no-such-bundle" });
    expect(products).toEqual([]);
  });
});

describe("parseArgs", () => {
  test("requires --environment", () => {
    expect(() => parseArgs(["--mode", "test"])).toThrow(/--environment/);
  });

  test("requires --mode", () => {
    expect(() => parseArgs(["--environment", "ci"])).toThrow(/--mode/);
  });

  test("rejects an environment that isn't ci or prod", () => {
    expect(() => parseArgs(["--environment", "staging", "--mode", "test"])).toThrow(/ci.*prod/);
  });

  test("rejects a mode that isn't test or live", () => {
    expect(() => parseArgs(["--environment", "ci", "--mode", "staging"])).toThrow(/test.*live/);
  });

  test("reads every flag", () => {
    expect(
      parseArgs([
        "--environment",
        "ci",
        "--mode",
        "test",
        "--apply",
        "--products-only",
        "--payment-links-only",
        "--bundle",
        "resident-vat",
      ]),
    ).toEqual({
      environment: "ci",
      mode: "test",
      apply: true,
      productsOnly: true,
      paymentLinksOnly: true,
      bundleId: "resident-vat",
    });
  });

  test("defaults apply, productsOnly, paymentLinksOnly and bundleId", () => {
    expect(parseArgs(["--environment", "prod", "--mode", "live"])).toEqual({
      environment: "prod",
      mode: "live",
      apply: false,
      productsOnly: false,
      paymentLinksOnly: false,
      bundleId: undefined,
    });
  });

  test("throws on an unknown flag", () => {
    expect(() => parseArgs(["--environment", "ci", "--mode", "test", "--dry-run"])).toThrow(/Unknown argument/);
  });
});

const SAMPLE_TOML = `
[[endpoint]]
environment = "ci"
url = "https://ci-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook"
modes = ["test"]

  [endpoint.secret.test]
  github_secret = "STRIPE_TEST_WEBHOOK_SECRET"
  aws_secret = "ci/submit/stripe/test_webhook_secret"

[[endpoint]]
environment = "prod"
url = "https://prod-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook"
modes = ["test", "live"]

  [endpoint.secret.test]
  github_secret = "STRIPE_TEST_WEBHOOK_SECRET"
  aws_secret = "prod/submit/stripe/test_webhook_secret"

  [endpoint.secret.live]
  github_secret = "STRIPE_WEBHOOK_SECRET"
  aws_secret = "prod/submit/stripe/webhook_secret"

[[payment_link]]
bundle_id = "donation-10"
url = "https://buy.stripe.com/aaa"

[[payment_link]]
bundle_id = "donation-20"
url = "https://buy.stripe.com/bbb"

[events]
enabled = ["checkout.session.completed", "invoice.paid"]

[keys.ci]
test = "ci/submit/stripe/test_secret_key"

[keys.prod]
test = "prod/submit/stripe/test_secret_key"
live = "prod/submit/stripe/secret_key"
`;

describe("parseConfig", () => {
  test("reads both endpoints, the event list and the keys", () => {
    const config = parseConfig(SAMPLE_TOML);
    expect(config.endpoints).toHaveLength(2);
    expect(config.endpoints[0]).toEqual({
      environment: "ci",
      url: "https://ci-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook",
      modes: ["test"],
      secrets: { test: { githubSecret: "STRIPE_TEST_WEBHOOK_SECRET", awsSecret: "ci/submit/stripe/test_webhook_secret" } },
    });
    expect(config.endpoints[1].secrets).toEqual({
      test: { githubSecret: "STRIPE_TEST_WEBHOOK_SECRET", awsSecret: "prod/submit/stripe/test_webhook_secret" },
      live: { githubSecret: "STRIPE_WEBHOOK_SECRET", awsSecret: "prod/submit/stripe/webhook_secret" },
    });
    expect(config.paymentLinks).toEqual([
      { bundleId: "donation-10", url: "https://buy.stripe.com/aaa" },
      { bundleId: "donation-20", url: "https://buy.stripe.com/bbb" },
    ]);
    expect(config.events).toEqual(["checkout.session.completed", "invoice.paid"]);
    expect(config.keys).toEqual({
      ci: { test: "ci/submit/stripe/test_secret_key" },
      prod: { test: "prod/submit/stripe/test_secret_key", live: "prod/submit/stripe/secret_key" },
    });
  });

  test("throws when there are no [[endpoint]] entries", () => {
    expect(() => parseConfig('[events]\nenabled = ["x"]\n[keys.ci]\ntest="t"\n[keys.prod]\ntest="t"\nlive="l"\n')).toThrow(/endpoint/);
  });

  test("throws when an endpoint's mode has no matching secret table", () => {
    const toml = `
[[endpoint]]
environment = "ci"
url = "https://x"
modes = ["test"]
[events]
enabled = ["x"]
[keys.ci]
test = "t"
[keys.prod]
test = "t"
live = "l"
`;
    expect(() => parseConfig(toml)).toThrow(/secret/);
  });

  test("throws when [events].enabled is empty", () => {
    const toml = `
[[endpoint]]
environment = "ci"
url = "https://x"
modes = ["test"]
  [endpoint.secret.test]
  github_secret = "G"
  aws_secret = "A"
[keys.ci]
test = "t"
[keys.prod]
test = "t"
live = "l"
`;
    expect(() => parseConfig(toml)).toThrow(/events/);
  });

  test("defaults paymentLinks to an empty list when stripe.toml has none", () => {
    const toml = `
[[endpoint]]
environment = "ci"
url = "https://x"
modes = ["test"]
  [endpoint.secret.test]
  github_secret = "G"
  aws_secret = "A"
[events]
enabled = ["x"]
[keys.ci]
test = "t"
[keys.prod]
test = "t"
live = "l"
`;
    expect(parseConfig(toml).paymentLinks).toEqual([]);
  });

  test("throws when a payment_link entry is missing url or bundle_id", () => {
    const toml = `
[[endpoint]]
environment = "ci"
url = "https://x"
modes = ["test"]
  [endpoint.secret.test]
  github_secret = "G"
  aws_secret = "A"
[[payment_link]]
bundle_id = "donation-10"
[events]
enabled = ["x"]
[keys.ci]
test = "t"
[keys.prod]
test = "t"
live = "l"
`;
    expect(() => parseConfig(toml)).toThrow(/payment_link/);
  });

  test("throws when a key is missing", () => {
    const toml = `
[[endpoint]]
environment = "ci"
url = "https://x"
modes = ["test"]
  [endpoint.secret.test]
  github_secret = "G"
  aws_secret = "A"
[events]
enabled = ["x"]
[keys.ci]
test = "t"
`;
    expect(() => parseConfig(toml)).toThrow(/keys/);
  });
});

describe("planEndpoints", () => {
  const { endpoints, events } = parseConfig(SAMPLE_TOML);

  test("plans a create when the endpoint has no live webhook yet", () => {
    const plans = planEndpoints(endpoints, "test", [], events);
    expect(plans).toEqual([
      { environment: "ci", url: endpoints[0].url, secret: endpoints[0].secrets.test, action: "create" },
      { environment: "prod", url: endpoints[1].url, secret: endpoints[1].secrets.test, action: "create" },
    ]);
  });

  test("only plans endpoints that run in the given mode", () => {
    const plans = planEndpoints(endpoints, "live", [], events);
    expect(plans).toEqual([{ environment: "prod", url: endpoints[1].url, secret: endpoints[1].secrets.live, action: "create" }]);
  });

  test("plans a noop when the live webhook already matches", () => {
    const existing = [{ id: "we_1", url: endpoints[0].url, status: "enabled", enabled_events: [...events] }];
    const plans = planEndpoints(endpoints, "test", existing, events);
    expect(plans[0]).toMatchObject({ action: "noop", id: "we_1" });
  });

  test("plans an update when the events list has drifted", () => {
    const existing = [{ id: "we_1", url: endpoints[0].url, status: "enabled", enabled_events: ["checkout.session.completed"] }];
    const plans = planEndpoints(endpoints, "test", existing, events);
    expect(plans[0]).toMatchObject({ action: "update", id: "we_1", eventsChanged: true, needsEnable: false });
  });

  test("plans an update to re-enable a disabled webhook even with matching events", () => {
    const existing = [{ id: "we_1", url: endpoints[0].url, status: "disabled", enabled_events: [...events] }];
    const plans = planEndpoints(endpoints, "test", existing, events);
    expect(plans[0]).toMatchObject({ action: "update", id: "we_1", eventsChanged: false, needsEnable: true });
  });
});

describe("planPaymentLinks", () => {
  const { paymentLinks } = parseConfig(SAMPLE_TOML);

  test("plans an update when the live link has no bundleId metadata yet", () => {
    const live = [{ id: "plink_1", url: paymentLinks[0].url, payment_intent_data: { metadata: {} } }];
    const plans = planPaymentLinks({ paymentLinks }, live);
    expect(plans[0]).toEqual({ bundleId: "donation-10", url: paymentLinks[0].url, action: "update", id: "plink_1" });
  });

  test("plans an update when the live link's bundleId differs", () => {
    const live = [{ id: "plink_1", url: paymentLinks[0].url, payment_intent_data: { metadata: { bundleId: "donation-old" } } }];
    const plans = planPaymentLinks({ paymentLinks }, live);
    expect(plans[0]).toMatchObject({ action: "update", id: "plink_1" });
  });

  test("plans a noop when the live link's bundleId already matches", () => {
    const live = [{ id: "plink_1", url: paymentLinks[0].url, payment_intent_data: { metadata: { bundleId: "donation-10" } } }];
    const plans = planPaymentLinks({ paymentLinks }, live);
    expect(plans[0]).toEqual({ bundleId: "donation-10", url: paymentLinks[0].url, action: "noop", id: "plink_1" });
  });

  test("reports a declared link the account doesn't have as missing", () => {
    const plans = planPaymentLinks({ paymentLinks }, []);
    expect(plans).toEqual([
      { bundleId: "donation-10", url: paymentLinks[0].url, action: "missing" },
      { bundleId: "donation-20", url: paymentLinks[1].url, action: "missing" },
    ]);
  });

  test("plans every declared link independently", () => {
    const live = [
      { id: "plink_1", url: paymentLinks[0].url, payment_intent_data: { metadata: { bundleId: "donation-10" } } },
      { id: "plink_2", url: paymentLinks[1].url, payment_intent_data: { metadata: {} } },
    ];
    const plans = planPaymentLinks({ paymentLinks }, live);
    expect(plans.map((p) => p.action)).toEqual(["noop", "update"]);
  });
});

describe("rewriteEnvLines", () => {
  test("replaces the value on a line whose key matches", () => {
    const lines = ["FOO=1", "STRIPE_PRICE_ID_RESIDENT_VAT=price_old", "BAR=2"];
    expect(rewriteEnvLines(lines, { STRIPE_PRICE_ID_RESIDENT_VAT: "price_new" })).toEqual([
      "FOO=1",
      "STRIPE_PRICE_ID_RESIDENT_VAT=price_new",
      "BAR=2",
    ]);
  });

  test("appends a new line for a key that isn't present", () => {
    const lines = ["FOO=1"];
    expect(rewriteEnvLines(lines, { STRIPE_PRICE_ID_NEW_BUNDLE: "price_new" })).toEqual(["FOO=1", "STRIPE_PRICE_ID_NEW_BUNDLE=price_new"]);
  });

  test("leaves unrelated lines untouched, in order", () => {
    const lines = ["# comment", "FOO=1", "", "BAR=2"];
    expect(rewriteEnvLines(lines, { BAR: "3" })).toEqual(["# comment", "FOO=1", "", "BAR=3"]);
  });

  test("applies several updates in one pass", () => {
    const lines = ["A=1", "B=2"];
    expect(rewriteEnvLines(lines, { A: "10", C: "30" })).toEqual(["A=10", "B=2", "C=30"]);
  });
});

describe("computeEnvUpdates", () => {
  test("a test-mode price lands in both env files' test rows, and .env.ci's live-named row too", () => {
    const updates = computeEnvUpdates("test", [{ bundleId: "resident-vat", priceId: "price_test_1" }]);
    expect(updates[".env.ci"]).toEqual({
      STRIPE_TEST_PRICE_ID_RESIDENT_VAT: "price_test_1",
      STRIPE_PRICE_ID_RESIDENT_VAT: "price_test_1",
    });
    expect(updates[".env.prod"]).toEqual({ STRIPE_TEST_PRICE_ID_RESIDENT_VAT: "price_test_1" });
  });

  test("a live-mode price lands only in .env.prod's live-named row", () => {
    const updates = computeEnvUpdates("live", [{ bundleId: "resident-vat", priceId: "price_live_1" }]);
    expect(updates[".env.ci"]).toEqual({});
    expect(updates[".env.prod"]).toEqual({ STRIPE_PRICE_ID_RESIDENT_VAT: "price_live_1" });
  });

  test("a result carrying an interval gets the interval in its row name", () => {
    const updates = computeEnvUpdates("test", [
      { bundleId: "resident", priceId: "price_annual_1", interval: "year" },
      { bundleId: "resident", priceId: "price_monthly_1", interval: "month" },
    ]);
    expect(updates[".env.ci"]).toEqual({
      STRIPE_TEST_PRICE_ID_RESIDENT_YEAR: "price_annual_1",
      STRIPE_PRICE_ID_RESIDENT_YEAR: "price_annual_1",
      STRIPE_TEST_PRICE_ID_RESIDENT_MONTH: "price_monthly_1",
      STRIPE_PRICE_ID_RESIDENT_MONTH: "price_monthly_1",
    });
  });
});
