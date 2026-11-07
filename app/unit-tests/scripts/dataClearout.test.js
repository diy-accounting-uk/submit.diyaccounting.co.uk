// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/dataClearout.test.js

import { describe, test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { marshall } from "@aws-sdk/util-dynamodb";
import {
  SUBSCRIPTION_MINIMUM_AGE_DAYS,
  TABLES,
  actionId,
  assertApplyAllowed,
  assertStripeKeyMode,
  buildFacts,
  cancelInTestMode,
  classifyBundle,
  classifyPass,
  classifyReceipt,
  classifyRows,
  classifySubscription,
  countRowsUnderEarlierVersion,
  expectedConfirmation,
  exportTables,
  parseArgs,
  parseExportLines,
  readExportRows,
  runClearout,
  unchangedCondition,
} from "../../../scripts/data-clearout.js";
import { hashValue } from "../../../scripts/salt-rotate.js";

const NOW = "2026-11-10T12:00:00.000Z";
const OLD = "2026-10-01T12:00:00.000Z";
const RECENT = "2026-11-10T00:00:00.000Z";
const PAST_TTL = Math.floor(Date.parse("2026-11-01T00:00:00Z") / 1000);
const FUTURE_TTL = Math.floor(Date.parse("2027-11-01T00:00:00Z") / 1000);
const PAST_EXPIRY = "2026-09-01T00:00:00.000Z";

const registry = { current: "v3", versions: { v2: "old-salt", v3: "new-salt" } };
const users = [
  { sub: "sub-test", email: "synthetic-ci@test.diyaccounting.co.uk" },
  { sub: "sub-probe", email: "probe-one@example.com" },
  { sub: "sub-customer", email: "someone@example.com" },
  { sub: "sub-operator", email: "boss@test.diyaccounting.co.uk" },
  { sub: "sub-no-email" },
];
const operatorEmails = ["boss@test.diyaccounting.co.uk"];
const current = (sub) => hashValue(registry.versions.v3, sub);
const earlier = (sub) => hashValue(registry.versions.v2, sub);
const TEST_HASH = current("sub-test");
const CUSTOMER_HASH = current("sub-customer");
const OPERATOR_HASH = current("sub-operator");
const UNKNOWN_HASH = hashValue("salt-of-a-deleted-user", "gone");
const LIVE_OWNER_HASH = hashValue("salt-of-a-deleted-user", "live-owner");
const FILER_HASH = hashValue("salt-of-a-deleted-user", "filer");
const COMMISSION_HASH = hashValue("salt-of-a-deleted-user", "referrer");

const liveSubscriptions = [
  { id: "sub_live1", customer: "cus_live1", status: "active", livemode: true, metadata: { hashedSub: LIVE_OWNER_HASH } },
];
const testSubscriptions = [
  { id: "sub_test1", customer: "cus_test1", status: "active", livemode: false },
  { id: "sub_testcancelled", customer: "cus_test2", status: "canceled", livemode: false },
];

function emptyRows() {
  return { passes: [], subscriptions: [], bundles: [], receipts: [], commissions: [] };
}

function factsFor(rows = {}) {
  return buildFacts({
    rows: { ...emptyRows(), ...rows },
    registry,
    users,
    operatorEmails,
    liveSubscriptions,
    testSubscriptions,
  });
}

const baseFactRows = {
  receipts: [{ hashedSub: FILER_HASH, receiptId: `${OLD}-1`, createdAt: OLD }],
  commissions: [
    {
      pk: `commission#${COMMISSION_HASH}`,
      sk: "line#in_1",
      subscriptionId: "sub_commission1",
      referralCode: "code-with-commission",
    },
    { pk: `commission#${COMMISSION_HASH}`, sk: "conversions#code-with-conversion#2026-10-01" },
  ],
  passes: [
    { pk: `redemption#code-redeemed#${CUSTOMER_HASH}`, code: "code-redeemed", redeemedBy: CUSTOMER_HASH },
    { pk: `redemption#code-unknown-redeemer#${UNKNOWN_HASH}`, code: "code-unknown-redeemer", redeemedBy: UNKNOWN_HASH },
    { pk: `redemption#code-test-redeemed#${TEST_HASH}`, code: "code-test-redeemed", redeemedBy: TEST_HASH },
    { pk: `referral#${CUSTOMER_HASH}`, code: "code-referred" },
    { pk: "held#code-held", code: "code-held" },
  ],
};
const facts = factsFor(baseFactRows);

const testPass = (overrides = {}) => ({
  pk: "pass#code-plain",
  code: "code-plain",
  testPass: true,
  validUntil: OLD,
  ttl: PAST_TTL,
  createdAt: OLD,
  ...overrides,
});
const realPass = (overrides = {}) => ({
  pk: "pass#code-real",
  code: "code-real",
  validUntil: "2027-01-01T00:00:00.000Z",
  createdAt: OLD,
  ...overrides,
});
const testSubscription = (overrides = {}) => ({ pk: "stripe#sub_test1", hashedSub: UNKNOWN_HASH, createdAt: OLD, ...overrides });
const testBundle = (overrides = {}) => ({
  hashedSub: UNKNOWN_HASH,
  bundleId: "resident-vat",
  expiry: PAST_EXPIRY,
  qualifiers: { synthetic: true },
  ...overrides,
});
const testReceipt = (overrides = {}) => ({
  hashedSub: UNKNOWN_HASH,
  receiptId: `${OLD}-2`,
  createdAt: OLD,
  actor: "test-user",
  ...overrides,
});

describe("parseArgs", () => {
  test("defaults to plan", () => {
    expect(parseArgs([]).mode).toBe("plan");
  });

  test("reads the apply inputs", () => {
    expect(parseArgs(["--mode", "apply", "--plan-run-id", "12", "--confirmation", "x"])).toEqual({
      mode: "apply",
      planRunId: "12",
      confirmation: "x",
    });
  });

  test("refuses an unknown mode and an unknown argument", () => {
    expect(() => parseArgs(["--mode", "delete"])).toThrow("Unknown mode");
    expect(() => parseArgs(["--force"])).toThrow("Unknown argument");
  });
});

describe("assertApplyAllowed", () => {
  const confirmation = expectedConfirmation("prod", "123");

  test("a plan needs no input", () => {
    expect(() => assertApplyAllowed("prod", { mode: "plan", planRunId: "", confirmation: "" })).not.toThrow();
  });

  test("an apply on prod with no plan run id is refused", () => {
    expect(() => assertApplyAllowed("prod", { mode: "apply", planRunId: "", confirmation })).toThrow("run id");
  });

  test("an apply on prod with no confirmation is refused", () => {
    expect(() => assertApplyAllowed("prod", { mode: "apply", planRunId: "123", confirmation: "" })).toThrow("confirmation");
  });

  test("an apply on prod with the confirmation of another plan is refused", () => {
    expect(() =>
      assertApplyAllowed("prod", { mode: "apply", planRunId: "123", confirmation: expectedConfirmation("prod", "124") }),
    ).toThrow("confirmation");
  });

  test("an apply on prod with both inputs goes ahead", () => {
    expect(() => assertApplyAllowed("prod", { mode: "apply", planRunId: "123", confirmation })).not.toThrow();
  });

  test("an apply on ci needs a plan run id and no confirmation", () => {
    expect(() => assertApplyAllowed("ci", { mode: "apply", planRunId: "", confirmation: "" })).toThrow("run id");
    expect(() => assertApplyAllowed("ci", { mode: "apply", planRunId: "123", confirmation: "" })).not.toThrow();
  });

  test("a plan run id that is not a number is refused", () => {
    expect(() => assertApplyAllowed("ci", { mode: "apply", planRunId: "../other", confirmation: "" })).toThrow("run id");
  });
});

describe("delete rules name their proof", () => {
  test.each([
    ["testPass", testPass(), "test-pass"],
    ["test-user actor", testPass({ testPass: undefined, actor: "test-user" }), "test-actor"],
    ["probe actor", testPass({ testPass: undefined, actor: "probe" }), "test-actor"],
    ["test-only issuer", testPass({ testPass: undefined, issuedBy: TEST_HASH }), "test-only-issuer"],
  ])("a pass with %s", (_name, row, rule) => {
    expect(classifyPass(row, facts, NOW)).toEqual({ action: "delete", rule });
  });

  test.each([
    ["an id in Stripe test mode", testSubscription(), "stripe-test-mode"],
    ["a row marked test mode", testSubscription({ pk: "stripe#sub_other", livemode: false }), "row-test-mode"],
    ["a test actor", testSubscription({ pk: "stripe#sub_other", actor: "probe" }), "test-actor"],
    ["a test account", testSubscription({ pk: "stripe#sub_other", hashedSub: TEST_HASH }), "test-account"],
  ])("a subscription with %s", (_name, row, rule) => {
    expect(classifySubscription(row, facts, NOW)).toMatchObject({ action: "delete", rule });
  });

  test.each([
    ["a synthetic qualifier", testBundle(), "test-qualifier"],
    ["a Stripe test mode qualifier", testBundle({ qualifiers: { stripeTestMode: true } }), "test-qualifier"],
    ["a Stripe test mode id", testBundle({ qualifiers: undefined, stripeSubscriptionId: "sub_test1" }), "stripe-test-mode"],
    ["a test actor", testBundle({ qualifiers: undefined, actor: "test-user" }), "test-actor"],
    ["a test account", testBundle({ qualifiers: undefined, hashedSub: TEST_HASH }), "test-account"],
  ])("an expired bundle with no ttl and %s", (_name, row, rule) => {
    expect(classifyBundle(row, facts, NOW)).toEqual({ action: "delete", rule });
  });

  test.each([
    ["a test-user actor", testReceipt(), "test-actor"],
    ["a probe actor", testReceipt({ actor: "probe" }), "test-actor"],
    ["an empty actor on a test account", testReceipt({ actor: undefined, hashedSub: TEST_HASH }), "test-account"],
  ])("a receipt with %s", (_name, row, rule) => {
    expect(classifyReceipt(row, facts, NOW)).toEqual({ action: "delete", rule });
  });

  test("a receipt with no createdAt takes its date from its id", () => {
    expect(classifyReceipt(testReceipt({ createdAt: undefined }), facts, NOW).action).toBe("delete");
  });
});

describe("a protected pass with a past ttl", () => {
  test("loses the ttl, so the table's TTL cannot delete it", () => {
    expect(classifyPass(realPass({ actor: "customer", validUntil: OLD, ttl: PAST_TTL }), facts, NOW)).toEqual({
      action: "remove-ttl",
      rule: "protected-real-actor",
    });
  });

  test("keeps a ttl that has not passed", () => {
    expect(classifyPass(realPass({ actor: "customer", validUntil: OLD, ttl: FUTURE_TTL }), facts, NOW).action).toBe("keep");
  });
});

describe("an expired bundle that no Stripe record stands behind", () => {
  test("goes, even for a real account", () => {
    expect(classifyBundle(testBundle({ hashedSub: CUSTOMER_HASH, qualifiers: undefined }), facts, NOW)).toEqual({
      action: "delete",
      rule: "expired-no-stripe-owner",
    });
  });

  test("stays while its owner filed a return", () => {
    expect(classifyBundle(testBundle({ hashedSub: FILER_HASH, qualifiers: undefined }), facts, NOW).action).toBe("keep");
  });
});

describe("an unknown or empty actor is never proof", () => {
  test.each([undefined, null, "", "system", "someone-else"])("actor %s", (actor) => {
    expect(classifyPass(realPass({ actor }), facts, NOW)).toEqual({ action: "keep", rule: "no-proof" });
    expect(classifySubscription(testSubscription({ pk: "stripe#sub_unknown", actor }), facts, NOW)).toEqual({
      action: "keep",
      rule: "no-proof",
    });
    expect(classifyBundle(testBundle({ qualifiers: undefined, actor, stripeCustomerId: "cus_unknown" }), facts, NOW)).toEqual({
      action: "keep",
      rule: "no-proof",
    });
    expect(classifyReceipt(testReceipt({ actor }), facts, NOW)).toEqual({ action: "keep", rule: "no-proof" });
  });

  test("a past ttl is not proof, and its own rule counts the row", () => {
    expect(classifyPass(realPass({ validUntil: OLD, ttl: PAST_TTL }), facts, NOW)).toEqual({ action: "keep", rule: "no-proof-past-ttl" });
  });

  test("a synthetic flag with no test actor is not proof", () => {
    expect(classifyReceipt(testReceipt({ actor: undefined, synthetic: true }), facts, NOW).action).toBe("keep");
  });

  test("a hash that no user holds is not proof", () => {
    expect(classifyPass(realPass({ issuedBy: UNKNOWN_HASH }), facts, NOW).action).toBe("keep");
  });

  test("a user with no email is not a test user", () => {
    expect(facts.testHashes.has(current("sub-no-email"))).toBe(false);
    expect(facts.realHashes.has(current("sub-no-email"))).toBe(true);
  });
});

describe("age limits", () => {
  test("a test record inside its age limit stays", () => {
    expect(classifyPass(testPass({ createdAt: RECENT }), facts, NOW)).toEqual({ action: "keep", rule: "too-recent" });
    expect(classifyReceipt(testReceipt({ createdAt: RECENT }), facts, NOW)).toEqual({ action: "keep", rule: "too-recent" });
  });

  test("a subscription stays for its own, longer age limit", () => {
    const sixDaysOld = new Date(Date.parse(NOW) - (SUBSCRIPTION_MINIMUM_AGE_DAYS - 1) * 86400000).toISOString();
    expect(classifySubscription(testSubscription({ createdAt: sixDaysOld }), facts, NOW)).toEqual({ action: "keep", rule: "too-recent" });
  });

  test("a row with no date stays", () => {
    expect(classifyPass(testPass({ createdAt: undefined }), facts, NOW)).toEqual({ action: "keep", rule: "no-date" });
    expect(classifySubscription(testSubscription({ createdAt: undefined }), facts, NOW)).toEqual({ action: "keep", rule: "no-date" });
    expect(classifyReceipt(testReceipt({ createdAt: undefined, receiptId: "plain" }), facts, NOW)).toEqual({
      action: "keep",
      rule: "no-date",
    });
  });
});

describe("keep rules, each on a row that has a delete proof, so keep wins", () => {
  test.each([
    ["a customer redeemed it", { code: "code-redeemed", pk: "pass#code-redeemed" }, "redeemed-by-customer"],
    ["an unknown account redeemed it", { code: "code-unknown-redeemer", pk: "pass#code-unknown-redeemer" }, "redeemed-by-customer"],
    ["a customer holds a referral claim on it", { code: "code-referred", pk: "pass#code-referred" }, "redeemed-by-customer"],
    ["a commission line names it", { code: "code-with-commission", pk: "pass#code-with-commission" }, "commission-code"],
    ["a commission conversion names it", { code: "code-with-conversion", pk: "pass#code-with-conversion" }, "commission-code"],
    ["a held pointer names it", { code: "code-held", pk: "pass#code-held" }, "held-for-review"],
    ["it is restricted to a person", { restrictedToEmailHash: "abc" }, "restricted-to-a-person"],
    ["its actor is customer", { actor: "customer" }, "real-actor"],
    ["its actor is operator", { actor: "operator" }, "real-actor"],
    ["an operator issued it", { issuedBy: OPERATOR_HASH }, "real-account"],
    ["a customer issued it", { issuedBy: CUSTOMER_HASH }, "real-account"],
    ["a live subscriber issued it", { issuedBy: LIVE_OWNER_HASH }, "live-stripe-owner"],
    ["a filer issued it", { issuedBy: FILER_HASH }, "filed-return-owner"],
    ["a commission referrer issued it", { issuedBy: COMMISSION_HASH }, "commission-owner"],
  ])("a test pass stays when %s", (_name, overrides, rule) => {
    expect(classifyPass(testPass({ ttl: FUTURE_TTL, ...overrides }), facts, NOW)).toEqual({ action: "keep", rule });
  });

  test("a test pass that only a test user redeemed goes", () => {
    expect(classifyPass(testPass({ code: "code-test-redeemed", pk: "pass#code-test-redeemed" }), facts, NOW).action).toBe("delete");
  });

  test.each([
    ["its id is live in Stripe", { pk: "stripe#sub_live1", actor: "test-user" }, "live-stripe-id"],
    ["its customer is live in Stripe", { stripeCustomerId: "cus_live1" }, "live-stripe-customer"],
    ["a commission names it", { pk: "stripe#sub_commission1", actor: "test-user" }, "commission-subscription"],
    ["its actor is customer", { actor: "customer" }, "real-actor"],
    ["its owner has a live subscription", { hashedSub: LIVE_OWNER_HASH }, "live-stripe-owner"],
    ["its owner filed a return", { hashedSub: FILER_HASH }, "filed-return-owner"],
    ["its owner earns commission", { hashedSub: COMMISSION_HASH }, "commission-owner"],
    ["its owner is a customer", { hashedSub: CUSTOMER_HASH }, "real-account"],
  ])("a test subscription stays when %s", (_name, overrides, rule) => {
    expect(classifySubscription(testSubscription(overrides), facts, NOW)).toEqual({ action: "keep", rule });
  });

  test.each([
    ["it is a system row", { hashedSub: "system#canary", bundleId: "salt-health-check" }, "system-row"],
    ["it holds account settings", { bundleId: "#account-settings" }, "account-settings"],
    ["it has a ttl", { ttl: PAST_TTL }, "has-ttl"],
    ["it has no expiry", { expiry: undefined }, "no-expiry"],
    ["it has not expired", { expiry: "2027-01-01T00:00:00.000Z" }, "in-date"],
    ["its subscription is live", { stripeSubscriptionId: "sub_live1" }, "live-stripe-id"],
    ["its customer is live", { stripeCustomerId: "cus_live1" }, "live-stripe-customer"],
    ["a commission names its subscription", { stripeSubscriptionId: "sub_commission1" }, "commission-subscription"],
    ["its actor is customer", { actor: "customer" }, "real-actor"],
    ["its owner has a live subscription", { hashedSub: LIVE_OWNER_HASH }, "live-stripe-owner"],
    ["its owner filed a return", { hashedSub: FILER_HASH }, "filed-return-owner"],
    ["its owner earns commission", { hashedSub: COMMISSION_HASH }, "commission-owner"],
    ["its owner is a customer and it has a Stripe id", { hashedSub: CUSTOMER_HASH, stripeCustomerId: "cus_unknown" }, "real-account"],
  ])("a test bundle stays when %s", (_name, overrides, rule) => {
    expect(classifyBundle(testBundle(overrides), facts, NOW)).toEqual({ action: "keep", rule });
  });

  test.each([
    ["its actor is customer, on a test account", { actor: "customer", hashedSub: TEST_HASH }, "real-actor"],
    ["its actor is operator", { actor: "operator" }, "real-actor"],
    ["its owner is a customer", { hashedSub: CUSTOMER_HASH }, "real-account"],
    ["its owner has a live subscription", { hashedSub: LIVE_OWNER_HASH }, "live-stripe-owner"],
    ["its owner filed another return", { hashedSub: FILER_HASH }, "filed-return-owner"],
    ["its owner earns commission", { hashedSub: COMMISSION_HASH }, "commission-owner"],
  ])("a test receipt stays when %s", (_name, overrides, rule) => {
    expect(classifyReceipt(testReceipt(overrides), facts, NOW)).toEqual({ action: "keep", rule });
  });

  test("a receipt that says it is not synthetic stays", () => {
    expect(classifyReceipt(testReceipt({ synthetic: false }), facts, NOW)).toEqual({ action: "keep", rule: "no-proof" });
  });

  test("a receipt with an empty actor and no test account stays", () => {
    expect(classifyReceipt(testReceipt({ actor: undefined }), facts, NOW)).toEqual({ action: "keep", rule: "no-proof" });
  });

  test("items of other kinds in the passes table stay", () => {
    for (const pk of [`redemption#code#${TEST_HASH}`, `referral#${TEST_HASH}`, `affiliate#${TEST_HASH}`, "held#code", "figures#code"]) {
      expect(classifyPass({ pk, testPass: true, createdAt: OLD }, facts, NOW)).toEqual({ action: "keep", rule: "not-a-pass-item" });
    }
  });

  test("an affiliate's test pass stays", () => {
    const affiliate = factsFor({ passes: [{ pk: `affiliate#${UNKNOWN_HASH}` }] });
    expect(classifyPass(testPass({ issuedBy: UNKNOWN_HASH }), affiliate, NOW)).toEqual({ action: "keep", rule: "commission-owner" });
  });

  test("a subscription row links its owner to the live list", () => {
    const linked = factsFor({ subscriptions: [{ pk: "stripe#sub_live1", hashedSub: UNKNOWN_HASH }] });
    expect(classifyBundle(testBundle({ hashedSub: UNKNOWN_HASH }), linked, NOW)).toEqual({ action: "keep", rule: "live-stripe-owner" });
  });

  test("an owner's earlier hash still finds the keep rule", () => {
    const linked = factsFor({ subscriptions: [{ pk: "stripe#sub_live1", hashedSub: earlier("sub-test") }] });
    expect(classifyBundle(testBundle({ hashedSub: TEST_HASH }), linked, NOW)).toEqual({ action: "keep", rule: "live-stripe-owner" });
  });

  test("a mislabelled receipt of a test account does not make the account a filer", () => {
    const labelled = factsFor({ receipts: [testReceipt({ actor: "customer", hashedSub: TEST_HASH })] });
    expect(labelled.filerHashes.has(TEST_HASH)).toBe(false);
    expect(classifyPass(testPass({ testPass: undefined, issuedBy: TEST_HASH }), labelled, NOW).action).toBe("delete");
  });
});

describe("real passes with no end date", () => {
  const undated = (overrides = {}) => realPass({ validUntil: undefined, ttl: FUTURE_TTL, useCount: 0, ...overrides });

  test("lose their ttl", () => {
    expect(classifyPass(undated(), facts, NOW)).toEqual({ action: "remove-ttl", rule: "real-pass-no-end-date" });
    expect(classifyPass(undated({ maxUses: 5, useCount: 4 }), facts, NOW).action).toBe("remove-ttl");
  });

  test("keep it when they are used up or revoked, or when they carry test proof", () => {
    expect(classifyPass(undated({ maxUses: 1, useCount: 1 }), facts, NOW).action).toBe("keep");
    expect(classifyPass(undated({ revokedAt: OLD }), facts, NOW).action).toBe("keep");
    expect(classifyPass(undated({ testPass: true }), facts, NOW).action).toBe("delete");
  });

  test("a pass with a validUntil keeps its ttl", () => {
    expect(classifyPass(realPass({ ttl: FUTURE_TTL }), facts, NOW)).toEqual({ action: "keep", rule: "no-proof" });
  });
});

describe("hashes read under the current salt version", () => {
  test("a test user's earlier hash is not proof", () => {
    expect(classifyPass(realPass({ issuedBy: earlier("sub-test") }), facts, NOW).action).toBe("keep");
  });

  test("an operator on the test domain is not a test user", () => {
    expect(facts.testHashes.has(OPERATOR_HASH)).toBe(false);
    expect(facts.realHashes.has(OPERATOR_HASH)).toBe(true);
  });

  test("a probe user is a test user", () => {
    expect(facts.testHashes.has(current("sub-probe"))).toBe(true);
  });

  test("rows under an earlier version are counted, and the current ones are not", () => {
    const rows = {
      ...emptyRows(),
      bundles: [{ hashedSub: earlier("sub-customer") }, { hashedSub: CUSTOMER_HASH }, { hashedSub: UNKNOWN_HASH }],
    };
    expect(countRowsUnderEarlierVersion(rows, facts.identityMap)).toBe(1);
  });
});

describe("buildFacts refuses a source that cannot prove anything", () => {
  const sources = { rows: emptyRows(), registry, users, operatorEmails, liveSubscriptions, testSubscriptions };

  test("an empty live list stops the run", () => {
    expect(() => buildFacts({ ...sources, liveSubscriptions: [] })).toThrow("live list is empty");
  });

  test("an empty user list stops the run", () => {
    expect(() => buildFacts({ ...sources, users: [] })).toThrow("no users");
  });

  test("a list of the wrong Stripe mode stops the run", () => {
    expect(() => buildFacts({ ...sources, liveSubscriptions: testSubscriptions })).toThrow("other mode");
    expect(() => buildFacts({ ...sources, testSubscriptions: liveSubscriptions })).toThrow("other mode");
  });
});

describe("Stripe guards", () => {
  test("the key must match its mode", () => {
    expect(() => assertStripeKeyMode("sk_live_x", "live")).not.toThrow();
    expect(() => assertStripeKeyMode("rk_test_x", "test")).not.toThrow();
    expect(() => assertStripeKeyMode("sk_live_x", "test")).toThrow("does not hold a test key");
    expect(() => assertStripeKeyMode(undefined, "live")).toThrow("does not hold a live key");
  });

  test("a cancel never reaches a live subscription", async () => {
    const stripe = { subscriptions: { retrieve: vi.fn(async () => ({ livemode: true })), cancel: vi.fn() } };
    await expect(cancelInTestMode(stripe, "sub_x")).rejects.toThrow("live subscription");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  test("a cancel reaches a test-mode subscription", async () => {
    const stripe = { subscriptions: { retrieve: vi.fn(async () => ({ livemode: false })), cancel: vi.fn() } };
    await cancelInTestMode(stripe, "sub_x");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_x");
  });
});

describe("classifyRows", () => {
  test("counts every row and cancels only the open test subscriptions of deleted rows", () => {
    const rows = {
      ...emptyRows(),
      passes: [testPass(), realPass()],
      subscriptions: [
        testSubscription(),
        testSubscription({ pk: "stripe#sub_testcancelled" }),
        testSubscription({ pk: "stripe#sub_live1", hashedSub: LIVE_OWNER_HASH }),
      ],
    };
    const result = classifyRows(rows, factsFor(rows), NOW);
    expect(result.counts.passes).toMatchObject({ rows: 2, delete: 1, keep: 1 });
    expect(result.counts.subscriptions).toMatchObject({ rows: 3, delete: 2, keep: 1 });
    expect(result.cancels).toEqual(["sub_test1"]);
    expect(result.actions.map(({ key }) => key.pk)).toEqual(["pass#code-plain", "stripe#sub_test1", "stripe#sub_testcancelled"]);
  });

  test("never acts on the commissions table", () => {
    expect(TABLES.commissions.guard).toEqual([]);
    const rows = { ...emptyRows(), commissions: [{ pk: "commission#x", sk: "line#1", actor: "test-user" }] };
    expect(classifyRows(rows, factsFor(rows), NOW).actions).toEqual([]);
  });

  test("counts receipts by actor", () => {
    const rows = { ...emptyRows(), receipts: [testReceipt(), testReceipt({ actor: undefined }), testReceipt({ actor: "weird" })] };
    expect(classifyRows(rows, factsFor(rows), NOW).receiptActors).toEqual({ "test-user": 1, "empty": 1, "other": 1 });
  });
});

describe("unchangedCondition", () => {
  test("names each guard, and treats an absent and a null attribute apart", () => {
    const condition = unchangedCondition({ pk: "x" }, { updatedAt: OLD, revokedAt: undefined, canceledAt: null });
    expect(condition.ConditionExpression).toBe(
      "attribute_exists(#k) AND #g0 = :g0 AND attribute_not_exists(#g1) AND attribute_type(#g2, :nullType)",
    );
    expect(condition.ExpressionAttributeNames).toEqual({ "#k": "pk", "#g0": "updatedAt", "#g1": "revokedAt", "#g2": "canceledAt" });
    expect(condition.ExpressionAttributeValues).toEqual({ ":g0": OLD, ":nullType": "NULL" });
  });
});

function conditionFailure() {
  return Object.assign(new Error("condition"), { name: "ConditionalCheckFailedException" });
}

const seededRows = () => ({
  ...emptyRows(),
  passes: [testPass(), realPass({ pk: "pass#code-undated", code: "code-undated", validUntil: undefined, ttl: FUTURE_TTL, updatedAt: OLD })],
  subscriptions: [
    testSubscription({ updatedAt: OLD }),
    testSubscription({ pk: "stripe#sub_live1", hashedSub: LIVE_OWNER_HASH, updatedAt: OLD }),
  ],
  bundles: [testBundle()],
  receipts: [testReceipt(), { hashedSub: FILER_HASH, receiptId: `${OLD}-3`, createdAt: OLD }],
});

/** A context with a fake S3 that holds the exports, and a doc client that records each write. */
function createFakeContext({ envName = "ci", rows = seededRows(), ...overrides } = {}) {
  const objects = new Map();
  const commands = [];
  const events = [];
  const logs = [];
  const exportRoot = (table) => `data1-clearout/100/export/${table}/AWSDynamoDB/1-a`;
  for (const [table, tableRows] of Object.entries(rows)) {
    objects.set(
      `${exportRoot(table)}/manifest-files.json`,
      Buffer.from(JSON.stringify({ dataFileS3Key: `AWSDynamoDB/1-a/data/${table}.json.gz` })),
    );
    const lines = tableRows.map((row) => JSON.stringify({ Item: marshall(row, { removeUndefinedValues: true }) })).join("\n");
    objects.set(`${exportRoot(table)}/data/${table}.json.gz`, gzipSync(lines));
  }
  const context = {
    envName,
    resultsBucket: "results",
    tableArn: (table) => `arn:table/${table}`,
    now: () => NOW,
    sleep: async () => {},
    log: (line) => logs.push(line),
    readRegistry: vi.fn(async () => registry),
    listUsers: async () => users,
    listOperatorEmails: async () => operatorEmails,
    listLiveSubscriptions: async () => liveSubscriptions,
    listTestSubscriptions: async () => testSubscriptions,
    cancelTestSubscription: vi.fn(async () => events.push("cancel")),
    doc: {
      send: vi.fn(async (command) => {
        commands.push(command);
        events.push(command.constructor.name);
      }),
    },
    dynamo: {
      send: vi.fn(async (command) => {
        const table = command.input.S3Prefix?.split("/").at(-1) ?? command.input.ExportArn;
        return {
          ExportDescription: {
            ExportArn: table,
            ExportStatus: "COMPLETED",
            ExportManifest: `data1-clearout/100/export/${table}/AWSDynamoDB/1-a/manifest-summary.json`,
            ItemCount: rows[table].length,
          },
        };
      }),
    },
    s3: {
      send: vi.fn(async (command) => {
        if (command.input.Body !== undefined) {
          objects.set(command.input.Key, Buffer.from(command.input.Body));
          return {};
        }
        const body = objects.get(command.input.Key);
        if (!body) throw Object.assign(new Error("no key"), { name: "NoSuchKey" });
        return { Body: { transformToByteArray: async () => body } };
      }),
    },
    ...overrides,
  };
  return { context, commands, events, logs, objects };
}

async function planThenApplyContext(options) {
  const fake = createFakeContext(options);
  await runClearout(fake.context, { mode: "plan", runId: "100" });
  fake.logs.length = 0;
  return fake;
}

const applyOptions = { mode: "apply", planRunId: "100", confirmation: "" };

describe("runClearout plan", () => {
  test("writes nothing to a table or to Stripe", async () => {
    const { context, commands } = createFakeContext();
    await runClearout(context, { mode: "plan", runId: "100" });
    expect(commands).toEqual([]);
    expect(context.cancelTestSubscription).not.toHaveBeenCalled();
  });

  test("prints counts only", async () => {
    const { context, logs } = createFakeContext();
    await runClearout(context, { mode: "plan", runId: "100" });
    const log = logs.join("\n");
    expect(log).toContain("passes:");
    expect(log).not.toMatch(/[0-9a-f]{64}/);
    expect(log).not.toMatch(/code-|sub_|cus_|@|pass#|stripe#/);
  });

  test("prints the confirmation that an apply needs", async () => {
    const { context, logs } = createFakeContext({ envName: "prod" });
    await runClearout(context, { mode: "plan", runId: "100" });
    expect(logs.join("\n")).toContain(expectedConfirmation("prod", "100"));
  });

  test("stops while a salt rotation is in flight", async () => {
    const { context } = createFakeContext({ readRegistry: async () => ({ ...registry, rotation: { state: "cutover" } }) });
    await expect(runClearout(context, { mode: "plan", runId: "100" })).rejects.toThrow("rotation is in flight");
  });

  test("needs a run id for its files", async () => {
    const { context } = createFakeContext();
    await expect(runClearout(context, { mode: "plan" })).rejects.toThrow("GITHUB_RUN_ID");
  });
});

describe("runClearout apply", () => {
  test("is refused on prod before it reads anything", async () => {
    const { context } = createFakeContext({ envName: "prod" });
    await expect(runClearout(context, { mode: "apply", planRunId: "100", confirmation: "" })).rejects.toThrow("confirmation");
    await expect(runClearout(context, { mode: "apply", planRunId: "", confirmation: "x" })).rejects.toThrow("run id");
    expect(context.readRegistry).not.toHaveBeenCalled();
  });

  test("goes ahead on prod with the run id and the confirmation", async () => {
    const { context, commands } = await planThenApplyContext({ envName: "prod" });
    await runClearout(context, { ...applyOptions, confirmation: expectedConfirmation("prod", "100") });
    expect(commands.length).toBeGreaterThan(0);
  });

  test("deletes by key with a condition, and leaves the other rows alone", async () => {
    const { context, commands } = await planThenApplyContext();
    await runClearout(context, applyOptions);
    const deletes = commands.filter((command) => command.constructor.name === "DeleteCommand").map(({ input }) => input);
    expect(deletes.map(({ TableName, Key }) => [TableName, Key.pk ?? Key.receiptId ?? Key.bundleId])).toEqual([
      ["ci-env-passes", "pass#code-plain"],
      ["ci-env-subscriptions", "stripe#sub_test1"],
      ["ci-env-bundles", "resident-vat"],
      ["ci-env-receipts", `${OLD}-2`],
    ]);
    for (const input of deletes) expect(input.ConditionExpression).toContain("attribute_exists(#k)");
    const subscriptionDelete = deletes[1];
    expect(subscriptionDelete.ExpressionAttributeValues).toMatchObject({ ":g0": OLD });
  });

  test("sends only DeleteItem and UpdateItem commands", async () => {
    const { context, commands } = await planThenApplyContext();
    await runClearout(context, applyOptions);
    expect([...new Set(commands.map((command) => command.constructor.name))].sort()).toEqual(["DeleteCommand", "UpdateCommand"]);
  });

  test("removes the ttl from a real pass with no end date", async () => {
    const { context, commands } = await planThenApplyContext();
    await runClearout(context, applyOptions);
    const [update] = commands.filter((command) => command.constructor.name === "UpdateCommand").map(({ input }) => input);
    expect(update.Key).toEqual({ pk: "pass#code-undated" });
    expect(update.UpdateExpression).toBe("REMOVE #ttl, #ttlDatestamp");
    expect(update.ConditionExpression).toContain("attribute_exists(#k)");
  });

  test("cancels after the deletes, so the webhook finds no row", async () => {
    const { context, events } = await planThenApplyContext();
    await runClearout(context, applyOptions);
    expect(context.cancelTestSubscription).toHaveBeenCalledTimes(1);
    expect(context.cancelTestSubscription).toHaveBeenCalledWith("sub_test1");
    expect(events.at(-1)).toBe("cancel");
  });

  test("never cancels a live subscription", async () => {
    const { context } = await planThenApplyContext();
    await runClearout(context, applyOptions);
    expect(context.cancelTestSubscription).not.toHaveBeenCalledWith("sub_live1");
  });

  test("leaves a row alone when it changed since the export", async () => {
    const { context, logs } = await planThenApplyContext();
    context.doc.send = vi.fn(async () => {
      throw conditionFailure();
    });
    const { report } = await runClearout(context, applyOptions);
    expect(report.passes["changed since export, left alone"]).toBe(2);
    expect(logs.join("\n")).toContain("changed since export");
  });

  test("stops on any other write error", async () => {
    const { context } = await planThenApplyContext();
    context.doc.send = vi.fn(async () => {
      throw Object.assign(new Error("denied"), { name: "AccessDeniedException" });
    });
    await expect(runClearout(context, applyOptions)).rejects.toThrow("denied");
  });

  test("reports failed cancels, so the same apply can run again", async () => {
    const { context } = await planThenApplyContext();
    context.cancelTestSubscription = vi.fn(async () => {
      throw new Error("No such subscription: sub_test1");
    });
    await expect(runClearout(context, applyOptions)).rejects.toThrow("Run the same apply again");
  });

  test("a row that is live at the apply stays, though the plan counted it", async () => {
    const { context, commands } = await planThenApplyContext();
    context.listLiveSubscriptions = async () => [
      ...liveSubscriptions,
      { id: "sub_test1", customer: "cus_test1", status: "active", livemode: true },
    ];
    context.listTestSubscriptions = async () => [];
    await runClearout(context, applyOptions);
    expect(commands.map(({ input }) => input.Key.pk)).not.toContain("stripe#sub_test1");
    expect(context.cancelTestSubscription).not.toHaveBeenCalled();
  });

  test("stops when it finds an action that the plan did not count", async () => {
    const { context, commands } = await planThenApplyContext();
    const record = { table: "passes", action: "delete", key: { pk: "pass#code-plain" } };
    const planKey = "data1-clearout/100/plan.json";
    const plan = JSON.parse(
      (await context.s3.send({ input: { Key: planKey } }).then(({ Body }) => Body.transformToByteArray())).toString(),
    );
    plan.actionIds = plan.actionIds.filter((id) => id !== actionId(record));
    await context.s3.send({ input: { Key: planKey, Body: JSON.stringify(plan) } });
    await expect(runClearout(context, applyOptions)).rejects.toThrow("not in the plan");
    expect(commands).toEqual([]);
  });

  test("stops when the salt version has changed since the plan", async () => {
    const { context, commands } = await planThenApplyContext();
    context.readRegistry = async () => ({ current: "v4", versions: { ...registry.versions, v4: "newer" } });
    await expect(runClearout(context, applyOptions)).rejects.toThrow("salt version has changed");
    expect(commands).toEqual([]);
  });

  test("stops when the plan belongs to another environment", async () => {
    const { context, commands } = await planThenApplyContext();
    context.envName = "prod";
    await expect(runClearout(context, { ...applyOptions, confirmation: expectedConfirmation("prod", "100") })).rejects.toThrow(
      "another environment",
    );
    expect(commands).toEqual([]);
  });

  test("stops when the plan run has no plan file", async () => {
    const { context } = createFakeContext();
    await expect(runClearout(context, applyOptions)).rejects.toThrow("no plan file");
  });

  test("stops when a known user still has a row under an earlier version", async () => {
    const rows = seededRows();
    rows.bundles.push({ hashedSub: earlier("sub-customer"), bundleId: "day-guest", ttl: FUTURE_TTL });
    const { context, commands } = await planThenApplyContext({ rows });
    await expect(runClearout(context, applyOptions)).rejects.toThrow("Run the sweep first");
    expect(commands).toEqual([]);
  });

  test("uses the time of the plan, so a row does not age into a delete", async () => {
    const { context, commands } = await planThenApplyContext();
    context.now = () => "2027-06-01T00:00:00.000Z";
    await runClearout(context, applyOptions);
    expect(commands.length).toBeGreaterThan(0);
  });
});

describe("exports", () => {
  test("one point-in-time export for each table, into the results bucket", async () => {
    const { context } = createFakeContext();
    const records = await exportTables(context, "100");
    expect(records.map(({ table }) => table)).toEqual(["passes", "subscriptions", "bundles", "receipts", "commissions"]);
    const started = context.dynamo.send.mock.calls.map(([command]) => command).filter((command) => command.input.TableArn);
    expect(started.map((command) => command.constructor.name)).toEqual(Array(5).fill("ExportTableToPointInTimeCommand"));
    expect(started[0].input).toMatchObject({
      TableArn: "arn:table/passes",
      S3Bucket: "results",
      S3Prefix: "data1-clearout/100/export/passes",
      ExportFormat: "DYNAMODB_JSON",
    });
  });

  test("the export files read back as rows", async () => {
    const { context } = createFakeContext();
    const rows = await readExportRows(context, {
      table: "passes",
      exportRoot: "data1-clearout/100/export/passes/AWSDynamoDB/1-a",
      itemCount: 2,
    });
    expect(rows[0].pk).toBe("pass#code-plain");
    expect(rows[0].ttl).toBe(PAST_TTL);
  });

  test("a row count that differs from the export's stops the run", async () => {
    const { context } = createFakeContext();
    await expect(
      readExportRows(context, { table: "passes", exportRoot: "data1-clearout/100/export/passes/AWSDynamoDB/1-a", itemCount: 3 }),
    ).rejects.toThrow("holds 2 rows");
  });

  test("parseExportLines reads DynamoDB JSON", () => {
    expect(parseExportLines('{"Item":{"pk":{"S":"x"},"useCount":{"N":"2"}}}\n')).toEqual([{ pk: "x", useCount: 2 }]);
  });

  test("the script sends no Scan and no GetItem", () => {
    const source = readFileSync(new URL("../../../scripts/data-clearout.js", import.meta.url), "utf-8");
    expect(source).not.toMatch(/ScanCommand|GetCommand|GetItemCommand|BatchGet|QueryCommand/);
  });
});

describe("workflow", () => {
  const workflow = readFileSync(new URL("../../../.github/workflows/data-clearout.yml", import.meta.url), "utf-8");

  test("is dispatch only", () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^ {2}(schedule|push|pull_request|workflow_call):/m);
  });

  test("defaults to plan on ci", () => {
    expect(workflow).toMatch(/environment-name:[\s\S]*?default: 'ci'/);
    expect(workflow).toMatch(/mode:[\s\S]*?default: 'plan'/);
  });

  test("cannot overlap a salt rotation", () => {
    expect(workflow).toContain("group: salt-rotate-${{ inputs.environment-name }}");
    expect(readFileSync(new URL("../../../.github/workflows/salt-rotate.yml", import.meta.url), "utf-8")).toContain(
      "group: salt-rotate-${{ inputs.environment-name }}",
    );
  });
});
