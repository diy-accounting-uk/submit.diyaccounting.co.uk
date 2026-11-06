#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-195 Clear test records out of the customer tables
// - **Use when:** the customer tables hold old test records, and the counts must show the active users and subscribers.
// - **Does:** data-clearout.js exports passes, subscriptions, bundles, receipts and commissions with ExportTableToPointInTime, so it sends no Scan. classifyRows gives each row a keep or a delete. A delete needs positive proof of a test record, and any keep rule wins. A plan writes nothing to a table and prints counts only. An apply deletes by key with a condition, removes the ttl from real passes with no end date, and cancels the test-mode Stripe subscriptions of the deleted rows.
// - **Run:** `gh workflow run data-clearout.yml -f environment-name=<ci|prod> -f mode=plan`; `gh workflow run data-clearout.yml -f environment-name=<ci|prod> -f mode=apply -f plan-run-id=<run id> -f confirmation=<value the plan prints>`
// - **Entry:** `scripts/data-clearout.js:runClearout`; `scripts/data-clearout.js:classifyRows`
// - **Files:** .github/workflows/data-clearout.yml, scripts/data-clearout.js, app/unit-tests/scripts/dataClearout.test.js
// - **Keywords:** data clearout, clear-out, test records, retention, point-in-time export, export not scan, delete by key, cancel test subscriptions, stale passes
// - **Related:** OPS-169, OPS-40, OPS-50
// @end-capability

// scripts/data-clearout.js
//
// This tool deletes rows from customer tables, so the rule is strict: a row stays unless it has
// positive proof of a test record, and any keep rule wins over any proof. An unknown value or an
// empty actor is never proof.
//
// The keys come from one point-in-time export per table. An export reads the PITR backup, so this
// tool sends no Scan and no GetItem. A plan run writes the export and its list of actions to the
// results bucket, and an apply run reads them again, so an apply can only do what a plan counted.
// Each delete has a condition that the row has not changed since the export.
//
// An apply reads the Stripe lists and the Cognito users again. A row that a fresh read now keeps
// stays, and a delete that the plan did not count stops the run.
//
// The clear-out runs after the salt sweep. A test user's hash is read under the current salt
// version only, and an apply stops if a known user still has a row under an earlier version.
//
// This log is public: nothing here prints a hash, a key, a code, a sub, an email or a Stripe id.
//
// Usage:
//   ENVIRONMENT_NAME=ci COGNITO_USER_POOL_ID=<id> GITHUB_RUN_ID=<id> node scripts/data-clearout.js \
//     [--mode plan|apply] [--plan-run-id <id>] [--confirmation <value>]

import { basename } from "node:path";
import { gunzipSync } from "node:zlib";
import { DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { classifyActor } from "../app/lib/activityAlert.js";
import { loadOperators } from "../app/lib/operators.js";
import { HASH_PATTERN, buildIdentityMap, createContext, hashValue, mapLimit, rewriteHashes } from "./salt-rotate.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WRITE_CONCURRENCY = 8;
const EXPORT_POLL_MS = 30 * 1000;
const EXPORT_TIMEOUT_MS = 90 * 60 * 1000;
const RESULTS_PREFIX = "data1-clearout";
const TEST_ACTORS = new Set(["test-user", "probe"]);
const REAL_ACTORS = new Set(["customer", "operator"]);
const OPEN_STRIPE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
const RECEIPT_ID_DATE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z/;

export const TEST_RECORD_MINIMUM_AGE_DAYS = 2;
export const SUBSCRIPTION_MINIMUM_AGE_DAYS = 7;

/** The tables that the tool exports. `guard` names the attributes that prove a row has not changed. */
export const TABLES = {
  passes: { keys: ["pk"], guard: ["updatedAt", "useCount", "revokedAt", "ttl", "issuedBy"] },
  subscriptions: { keys: ["pk"], guard: ["updatedAt", "status", "hashedSub"] },
  bundles: {
    keys: ["hashedSub", "bundleId"],
    guard: ["createdAt", "updatedAt", "expiry", "ttl", "subscriptionStatus", "stripeSubscriptionId", "tokensConsumed", "saltVersion"],
  },
  receipts: { keys: ["hashedSub", "receiptId"], guard: ["createdAt", "actor", "ttl", "saltVersion"] },
  commissions: { keys: ["pk", "sk"], guard: [] },
};

export function parseArgs(argv) {
  const opts = { mode: "plan", planRunId: "", confirmation: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") opts.mode = argv[++i];
    else if (argv[i] === "--plan-run-id") opts.planRunId = argv[++i] ?? "";
    else if (argv[i] === "--confirmation") opts.confirmation = argv[++i] ?? "";
    else throw new Error(`Unknown argument "${argv[i]}"`);
  }
  if (!["plan", "apply"].includes(opts.mode)) throw new Error(`Unknown mode "${opts.mode}"`);
  return opts;
}

/** The value that the operator types for an apply on prod. It names the environment and the plan. */
export function expectedConfirmation(envName, planRunId) {
  return `delete-${envName}-${planRunId}`;
}

/** An apply needs its plan in every environment. On prod it also needs the typed confirmation. */
export function assertApplyAllowed(envName, { mode, planRunId, confirmation }) {
  if (mode !== "apply") return;
  if (!/^\d+$/.test(planRunId ?? "")) throw new Error("An apply needs the run id of its plan run");
  if (envName === "prod" && confirmation !== expectedConfirmation(envName, planRunId)) {
    throw new Error("An apply on prod needs the confirmation value that its plan printed");
  }
}

function ageRule(dateText, minimumDays, now) {
  const time = Date.parse(dateText);
  if (Number.isNaN(time)) return "no-date";
  return Date.parse(now) - time > minimumDays * DAY_MS ? null : "too-recent";
}

function isTestActor(row) {
  return TEST_ACTORS.has(row.actor);
}

function isRealActor(row) {
  return REAL_ACTORS.has(row.actor);
}

/** The proof that a receipt is a sandbox filing. A stored customer or operator actor stops any proof. */
function receiptProof(row, facts) {
  if (isRealActor(row) || row.synthetic === false) return null;
  if (isTestActor(row)) return "test-actor";
  if (!row.actor && facts.testHashes.has(row.hashedSub)) return "test-account";
  return null;
}

function passProof(row, facts) {
  if (row.testPass === true) return "test-pass";
  if (isTestActor(row)) return "test-actor";
  if (facts.testHashes.has(row.issuedBy)) return "test-only-issuer";
  return null;
}

function subscriptionProof(row, id, facts) {
  if (facts.testSubscriptionIds.has(id)) return "stripe-test-mode";
  if (row.livemode === false) return "row-test-mode";
  if (isTestActor(row)) return "test-actor";
  if (facts.testHashes.has(row.hashedSub)) return "test-account";
  return null;
}

function bundleProof(row, facts) {
  if (row.qualifiers?.synthetic === true || row.qualifiers?.stripeTestMode === true) return "test-qualifier";
  if (facts.testSubscriptionIds.has(row.stripeSubscriptionId)) return "stripe-test-mode";
  if (isTestActor(row)) return "test-actor";
  if (facts.testHashes.has(row.hashedSub)) return "test-account";
  return null;
}

/** The keep rule that a row's owner meets, or null. Any hash reads as its current version here. */
function ownerKeepRule(hash, facts) {
  if (!hash) return null;
  const owner = facts.canonical(hash);
  if (facts.liveOwners.has(owner)) return "live-stripe-owner";
  if (facts.commissionHashes.has(owner)) return "commission-owner";
  if (facts.realHashes.has(owner)) return "real-account";
  if (facts.filerHashes.has(owner)) return "filed-return-owner";
  return null;
}

function stripeKeepRule(subscriptionId, customerId, facts) {
  if (facts.liveSubscriptionIds.has(subscriptionId)) return "live-stripe-id";
  if (facts.liveCustomerIds.has(customerId)) return "live-stripe-customer";
  if (facts.commissionSubscriptionIds.has(subscriptionId)) return "commission-subscription";
  return null;
}

function realActorRule(row) {
  return isRealActor(row) ? "real-actor" : null;
}

export function classifySubscription(row, facts, now) {
  if (!String(row.pk).startsWith("stripe#")) return { action: "keep", rule: "not-a-subscription-item" };
  const id = row.pk.slice("stripe#".length);
  const keepRule = stripeKeepRule(id, row.stripeCustomerId, facts) ?? realActorRule(row) ?? ownerKeepRule(row.hashedSub, facts);
  if (keepRule) return { action: "keep", rule: keepRule };
  const proof = subscriptionProof(row, id, facts);
  if (!proof) return { action: "keep", rule: "no-proof" };
  const tooNew = ageRule(row.createdAt, SUBSCRIPTION_MINIMUM_AGE_DAYS, now);
  if (tooNew) return { action: "keep", rule: tooNew };
  return { action: "delete", rule: proof, subscriptionId: id };
}

function passKeepRule(row, code, facts) {
  if (facts.customerRedeemedCodes.has(code)) return "redeemed-by-customer";
  if (facts.commissionCodes.has(code)) return "commission-code";
  if (facts.heldCodes.has(code)) return "held-for-review";
  if (row.restrictedToEmailHash) return "restricted-to-a-person";
  return realActorRule(row) ?? ownerKeepRule(row.issuedBy, facts);
}

/** True for a real pass that stays usable with no end date, so the 13-month ttl must not reach it. */
function hasTtlThatWouldDeleteAUsablePass(row) {
  if (row.ttl === undefined || row.validUntil || row.revokedAt) return false;
  return row.maxUses === undefined || (row.useCount ?? 0) < row.maxUses;
}

export function classifyPass(row, facts, now) {
  if (!String(row.pk).startsWith("pass#")) return { action: "keep", rule: "not-a-pass-item" };
  const code = row.code ?? row.pk.slice("pass#".length);
  const proof = passProof(row, facts);
  if (!proof && hasTtlThatWouldDeleteAUsablePass(row)) return { action: "remove-ttl", rule: "real-pass-no-end-date" };
  const keepRule = passKeepRule(row, code, facts);
  if (keepRule) return { action: "keep", rule: keepRule };
  if (!proof) return { action: "keep", rule: row.ttl * 1000 < Date.parse(now) ? "no-proof-past-ttl" : "no-proof" };
  const tooNew = ageRule(row.createdAt, TEST_RECORD_MINIMUM_AGE_DAYS, now);
  if (tooNew) return { action: "keep", rule: tooNew };
  return { action: "delete", rule: proof };
}

export function classifyBundle(row, facts, now) {
  if (String(row.hashedSub).startsWith("system#")) return { action: "keep", rule: "system-row" };
  if (String(row.bundleId).startsWith("#")) return { action: "keep", rule: "account-settings" };
  if (row.ttl !== undefined) return { action: "keep", rule: "has-ttl" };
  const expiry = Date.parse(row.expiry);
  if (Number.isNaN(expiry)) return { action: "keep", rule: "no-expiry" };
  if (expiry >= Date.parse(now)) return { action: "keep", rule: "in-date" };
  const keepRule =
    stripeKeepRule(row.stripeSubscriptionId, row.stripeCustomerId, facts) ?? realActorRule(row) ?? ownerKeepRule(row.hashedSub, facts);
  if (keepRule) return { action: "keep", rule: keepRule };
  const proof = bundleProof(row, facts);
  if (!proof) return { action: "keep", rule: "no-proof" };
  return { action: "delete", rule: proof };
}

export function classifyReceipt(row, facts, now) {
  const keepRule = realActorRule(row) ?? ownerKeepRule(row.hashedSub, facts);
  if (keepRule) return { action: "keep", rule: keepRule };
  const proof = receiptProof(row, facts);
  if (!proof) return { action: "keep", rule: "no-proof" };
  const filedAt = row.createdAt ?? RECEIPT_ID_DATE.exec(row.receiptId ?? "")?.[0];
  const tooNew = ageRule(filedAt, TEST_RECORD_MINIMUM_AGE_DAYS, now);
  if (tooNew) return { action: "keep", rule: tooNew };
  return { action: "delete", rule: proof };
}

const CLASSIFIERS = {
  passes: classifyPass,
  subscriptions: classifySubscription,
  bundles: classifyBundle,
  receipts: classifyReceipt,
};

function assertStripeList(subscriptions, livemode, label) {
  if (subscriptions.some((subscription) => subscription.livemode !== livemode)) {
    throw new Error(`The Stripe ${label} list holds a subscription of the other mode`);
  }
}

function classifyUsers(registry, users, operatorEmails) {
  const salt = registry.versions[registry.current];
  const operators = new Set(operatorEmails.map((email) => email.trim().toLowerCase()));
  const testHashes = new Set();
  const realHashes = new Set();
  for (const { sub, email } of users) {
    const isOperator = operators.has(email?.trim().toLowerCase());
    const proven = !isOperator && TEST_ACTORS.has(classifyActor(email));
    (proven ? testHashes : realHashes).add(hashValue(salt, sub));
  }
  return { testHashes, realHashes };
}

function readCommissionLinks(rows, canonical) {
  const links = { commissionHashes: new Set(), commissionCodes: new Set(), commissionSubscriptionIds: new Set() };
  for (const row of rows) {
    const text = JSON.stringify(row);
    for (const hash of text.match(HASH_PATTERN) ?? []) links.commissionHashes.add(canonical(hash));
    for (const id of text.match(/\bsub_[A-Za-z0-9]+/g) ?? []) links.commissionSubscriptionIds.add(id);
    if (row.referralCode) links.commissionCodes.add(row.referralCode);
    const conversion = /^conversions#(.+)#[^#]+$/.exec(row.sk ?? "");
    if (conversion) links.commissionCodes.add(conversion[1]);
  }
  return links;
}

function readPassLinks(rows, facts, canonical) {
  const links = { customerRedeemedCodes: new Set(), heldCodes: new Set(), affiliateHashes: new Set() };
  const addRedemption = (hash, code) => {
    if (code && !facts.testHashes.has(hash)) links.customerRedeemedCodes.add(code);
  };
  for (const row of rows) {
    const [kind, first] = String(row.pk).split("#");
    if (kind === "redemption") addRedemption(row.redeemedBy, row.code);
    else if (kind === "referral") addRedemption(first, row.code);
    else if (kind === "held") links.heldCodes.add(row.code);
    else if (kind === "affiliate" || kind === "family") links.affiliateHashes.add(canonical(first));
    else if (kind === "familyemail") links.affiliateHashes.add(canonical(row.hashedSub));
  }
  return links;
}

/**
 * Reads every source into the sets that the rules use. An empty live list stops the run, because
 * that list is what keeps the paying customers.
 *
 * @param {{rows: object, registry: object, users: object[], operatorEmails: string[], liveSubscriptions: object[], testSubscriptions: object[]}} sources
 */
export function buildFacts({ rows, registry, users, operatorEmails, liveSubscriptions, testSubscriptions }) {
  if (users.length === 0) throw new Error("Cognito returned no users, so no hash can be read");
  if (liveSubscriptions.length === 0) throw new Error("The Stripe live list is empty, so no live subscription can be kept");
  assertStripeList(liveSubscriptions, true, "live");
  assertStripeList(testSubscriptions, false, "test");

  const identityMap = buildIdentityMap(registry, users);
  const canonical = (hash) => identityMap.hashMap.get(hash) ?? hash;
  const { testHashes, realHashes } = classifyUsers(registry, users, operatorEmails);

  const liveSubscriptionIds = new Set(liveSubscriptions.map(({ id }) => id));
  const liveCustomerIds = new Set(liveSubscriptions.map(({ customer }) => customer?.id ?? customer).filter(Boolean));
  const liveOwners = new Set(
    liveSubscriptions
      .map(({ metadata }) => metadata?.hashedSub)
      .filter(Boolean)
      .map(canonical),
  );
  for (const { pk, hashedSub, stripeCustomerId } of rows.subscriptions) {
    const linked = liveSubscriptionIds.has(String(pk).slice("stripe#".length)) || liveCustomerIds.has(stripeCustomerId);
    if (linked && hashedSub) liveOwners.add(canonical(hashedSub));
  }

  const facts = {
    identityMap,
    canonical,
    testHashes,
    realHashes,
    liveSubscriptionIds,
    liveCustomerIds,
    liveOwners,
    testSubscriptionIds: new Set(testSubscriptions.map(({ id }) => id)),
    openTestSubscriptionIds: new Set(testSubscriptions.filter(({ status }) => OPEN_STRIPE_STATUSES.has(status)).map(({ id }) => id)),
  };

  const commissionLinks = readCommissionLinks(rows.commissions, canonical);
  const passLinks = readPassLinks(rows.passes, facts, canonical);
  facts.commissionCodes = commissionLinks.commissionCodes;
  facts.commissionSubscriptionIds = commissionLinks.commissionSubscriptionIds;
  facts.commissionHashes = new Set([...commissionLinks.commissionHashes, ...passLinks.affiliateHashes]);
  facts.customerRedeemedCodes = passLinks.customerRedeemedCodes;
  facts.heldCodes = passLinks.heldCodes;

  // A mislabelled receipt of a test account stays, but it does not make that account a filer.
  facts.filerHashes = new Set(
    rows.receipts.filter((row) => !receiptProof(row, facts) && !testHashes.has(row.hashedSub)).map((row) => canonical(row.hashedSub)),
  );
  return facts;
}

function keyOf(table, row) {
  return Object.fromEntries(TABLES[table].keys.map((name) => [name, row[name]]));
}

function guardOf(table, row) {
  return Object.fromEntries(TABLES[table].guard.map((name) => [name, row[name]]));
}

export function actionId({ table, action, key }) {
  return `${table}|${action}|${JSON.stringify(key)}`;
}

function actorLabel(actor) {
  if (!actor) return "empty";
  return TEST_ACTORS.has(actor) || REAL_ACTORS.has(actor) || actor === "system" ? actor : "other";
}

function countReceiptActors(rows) {
  const counts = {};
  for (const { actor } of rows) {
    const label = actorLabel(actor);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

/**
 * Applies the rules to every row of every table that can lose a row.
 *
 * @returns {{counts: object, actions: object[], cancels: string[], receiptActors: object}}
 */
export function classifyRows(rows, facts, now) {
  const counts = {};
  const actions = [];
  const cancels = [];
  for (const [table, classify] of Object.entries(CLASSIFIERS)) {
    counts[table] = { "rows": rows[table].length, "delete": 0, "remove-ttl": 0, "keep": 0, "rules": {} };
    for (const row of rows[table]) {
      const { action, rule, subscriptionId } = classify(row, facts, now);
      counts[table][action] += 1;
      const label = `${action}: ${rule}`;
      counts[table].rules[label] = (counts[table].rules[label] ?? 0) + 1;
      if (action !== "keep") actions.push({ table, action, key: keyOf(table, row), guard: guardOf(table, row) });
      if (subscriptionId && facts.openTestSubscriptionIds.has(subscriptionId)) cancels.push(subscriptionId);
    }
  }
  return { counts, actions, cancels, receiptActors: countReceiptActors(rows.receipts) };
}

/** The rows that a known user still holds under an earlier salt version. A sweep moves these. */
export function countRowsUnderEarlierVersion(rows, identityMap) {
  let count = 0;
  for (const tableRows of Object.values(rows)) {
    for (const { pk, sk, hashedSub, issuedBy, redeemedBy } of tableRows) {
      const text = [pk, sk, hashedSub, issuedBy, redeemedBy].filter(Boolean).join(" ");
      if (rewriteHashes(text, identityMap).rewritten !== text) count += 1;
    }
  }
  return count;
}

/** The condition that a row is still as the export showed it. */
export function unchangedCondition(key, guard) {
  const parts = [`attribute_exists(#k)`];
  const names = { "#k": Object.keys(key)[0] };
  const values = {};
  Object.entries(guard).forEach(([name, value], index) => {
    names[`#g${index}`] = name;
    if (value === undefined) {
      parts.push(`attribute_not_exists(#g${index})`);
    } else if (value === null) {
      parts.push(`attribute_type(#g${index}, :nullType)`);
      values[":nullType"] = "NULL";
    } else {
      parts.push(`#g${index} = :g${index}`);
      values[`:g${index}`] = value;
    }
  });
  return {
    ConditionExpression: parts.join(" AND "),
    ExpressionAttributeNames: names,
    ...(Object.keys(values).length > 0 && { ExpressionAttributeValues: values }),
  };
}

async function applyAction(context, { table, action, key, guard }) {
  const TableName = `${context.envName}-env-${table}`;
  const condition = unchangedCondition(key, guard);
  if (action === "delete") {
    await context.doc.send(new DeleteCommand({ TableName, Key: key, ...condition }));
    return;
  }
  await context.doc.send(
    new UpdateCommand({
      TableName,
      Key: key,
      UpdateExpression: "REMOVE #ttl, #ttlDatestamp",
      ...condition,
      ExpressionAttributeNames: { ...condition.ExpressionAttributeNames, "#ttl": "ttl", "#ttlDatestamp": "ttl_datestamp" },
    }),
  );
}

function tally(report, table, outcome) {
  report[table] ??= {};
  report[table][outcome] = (report[table][outcome] ?? 0) + 1;
}

async function applyActions(context, actions, report) {
  await mapLimit(actions, WRITE_CONCURRENCY, async (entry) => {
    try {
      await applyAction(context, entry);
      tally(report, entry.table, entry.action);
    } catch (error) {
      if (error?.name !== "ConditionalCheckFailedException") throw error;
      tally(report, entry.table, "changed since export, left alone");
    }
  });
}

/**
 * Cancels after the deletes. The webhook then finds no row and returns, so it does not change the
 * row or lapse a book. A second apply cancels what a stop left open.
 */
async function cancelTestSubscriptions(context, cancels, report) {
  await mapLimit(cancels, WRITE_CONCURRENCY, async (id) => {
    try {
      await context.cancelTestSubscription(id);
      tally(report, "stripe test mode", "cancelled");
    } catch {
      tally(report, "stripe test mode", "failed");
    }
  });
}

function assertPlanMatches(plan, envName, registry) {
  if (plan.envName !== envName) throw new Error("That plan run belongs to another environment");
  if (plan.saltVersion !== registry.current) throw new Error("The salt version has changed since that plan. Run a new plan");
}

function assertWithinPlan(actions, plan) {
  const planned = new Set(plan.actionIds);
  const unplanned = actions.filter((entry) => !planned.has(actionId(entry)));
  if (unplanned.length > 0) throw new Error(`${unplanned.length} actions are not in the plan. Run a new plan`);
}

function printReport(context, { counts, cancels, receiptActors }, earlierRows) {
  context.log(`Rows under an earlier salt version: ${earlierRows}`);
  for (const [table, { rules, ...totals }] of Object.entries(counts)) {
    context.log(`${table}: ${JSON.stringify(totals)}`);
    for (const label of Object.keys(rules).sort()) context.log(`  ${label}: ${rules[label]}`);
  }
  context.log(`receipts by actor: ${JSON.stringify(receiptActors)}`);
  context.log(`Test-mode Stripe subscriptions to cancel: ${cancels.length}`);
}

/**
 * Runs one plan or apply.
 *
 * @param {object} context - doc, s3, dynamo, envName, resultsBucket, tableArn, listUsers, readRegistry,
 *   listOperatorEmails, listLiveSubscriptions, listTestSubscriptions, cancelTestSubscription, now, sleep, log
 * @param {{mode: "plan"|"apply", planRunId?: string, confirmation?: string, runId?: string}} options
 * @returns {Promise<{result: object, report: object}>}
 */
export async function runClearout(context, options) {
  const { mode, planRunId, runId } = options;
  assertApplyAllowed(context.envName, options);

  const registry = await context.readRegistry();
  if (registry.rotation) throw new Error("A salt rotation is in flight. Finish it and its sweep first");
  const plan = mode === "apply" ? await readPlan(context, planRunId) : null;
  if (plan) assertPlanMatches(plan, context.envName, registry);
  if (!plan && !/^\d+$/.test(runId ?? "")) throw new Error("GITHUB_RUN_ID is required, because the plan files carry it");

  const users = await context.listUsers();
  const operatorEmails = await context.listOperatorEmails();
  const liveSubscriptions = await context.listLiveSubscriptions();
  const testSubscriptions = await context.listTestSubscriptions();

  context.log(`Environment: ${context.envName}`);
  context.log(`Mode: ${mode}`);
  context.log(`Current salt version: ${registry.current}`);
  context.log(`Cognito users: ${users.length}`);
  context.log(`Stripe subscriptions: ${liveSubscriptions.length} live, ${testSubscriptions.length} test`);

  const exportRecords = plan ? plan.exports : await exportTables(context, runId);
  const rows = {};
  for (const record of exportRecords) rows[record.table] = await readExportRows(context, record);

  const now = plan ? plan.ranAt : context.now();
  const facts = buildFacts({ rows, registry, users, operatorEmails, liveSubscriptions, testSubscriptions });
  const result = classifyRows(rows, facts, now);
  const earlierRows = countRowsUnderEarlierVersion(rows, facts.identityMap);
  printReport(context, result, earlierRows);

  if (!plan) {
    await writePlan(context, runId, {
      envName: context.envName,
      saltVersion: registry.current,
      ranAt: now,
      exports: exportRecords,
      actionIds: result.actions.map(actionId),
    });
    context.log("Plan only. No table or Stripe write made.");
    context.log(`To apply: mode=apply, plan-run-id=${runId}, confirmation=${expectedConfirmation(context.envName, runId)}`);
    return { result, report: {} };
  }

  if (earlierRows > 0) throw new Error("A known user still has rows under an earlier salt version. Run the sweep first");
  assertWithinPlan(result.actions, plan);

  context.log(`Restore point, just before this apply: ${context.now()}`);
  const report = {};
  await applyActions(context, result.actions, report);
  await cancelTestSubscriptions(context, result.cancels, report);
  for (const [table, outcomes] of Object.entries(report)) context.log(`Outcome, ${table}: ${JSON.stringify(outcomes)}`);
  if (report["stripe test mode"]?.failed > 0) throw new Error("Some test-mode cancels failed. Run the same apply again");
  return { result, report };
}

function planKey(runId) {
  return `${RESULTS_PREFIX}/${runId}/plan.json`;
}

async function writePlan(context, runId, plan) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await context.s3.send(
    new PutObjectCommand({
      Bucket: context.resultsBucket,
      Key: planKey(runId),
      Body: JSON.stringify(plan),
      ContentType: "application/json",
    }),
  );
}

async function readObject(context, key) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const response = await context.s3.send(new GetObjectCommand({ Bucket: context.resultsBucket, Key: key }));
  return Buffer.from(await response.Body.transformToByteArray());
}

async function readPlan(context, planRunId) {
  try {
    return JSON.parse((await readObject(context, planKey(planRunId))).toString("utf-8"));
  } catch (error) {
    if (error.name === "NoSuchKey") throw new Error("That plan run has no plan file. Run a new plan", { cause: error });
    throw error;
  }
}

async function waitForExport(context, exportArn) {
  const { DescribeExportCommand } = await import("@aws-sdk/client-dynamodb");
  const deadline = Date.parse(context.now()) + EXPORT_TIMEOUT_MS;
  for (;;) {
    const { ExportDescription: description } = await context.dynamo.send(new DescribeExportCommand({ ExportArn: exportArn }));
    if (description.ExportStatus === "COMPLETED") return description;
    if (description.ExportStatus === "FAILED") throw new Error("A table export failed");
    if (Date.parse(context.now()) > deadline) throw new Error("A table export timed out");
    await context.sleep(EXPORT_POLL_MS);
  }
}

/** Starts one export per table. The client token makes a repeat call return the same export. */
export async function exportTables(context, runId) {
  const { ExportTableToPointInTimeCommand } = await import("@aws-sdk/client-dynamodb");
  return Promise.all(
    Object.keys(TABLES).map(async (table) => {
      const prefix = `${RESULTS_PREFIX}/${runId}/export/${table}`;
      const { ExportDescription: started } = await context.dynamo.send(
        new ExportTableToPointInTimeCommand({
          TableArn: context.tableArn(table),
          S3Bucket: context.resultsBucket,
          S3Prefix: prefix,
          S3SseAlgorithm: "AES256",
          ExportFormat: "DYNAMODB_JSON",
          ExportType: "FULL_EXPORT",
          ClientToken: `${runId}-${table}`,
        }),
      );
      const finished = await waitForExport(context, started.ExportArn);
      context.log(`Exported ${table}: ${finished.ItemCount} items`);
      const [exportFolder] = /AWSDynamoDB\/[^/]+/.exec(finished.ExportManifest);
      return { table, exportRoot: `${prefix}/${exportFolder}`, itemCount: finished.ItemCount };
    }),
  );
}

export function parseExportLines(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => unmarshall(JSON.parse(line).Item));
}

/** Reads every data file of one export, and stops if the row count differs from the export's. */
export async function readExportRows(context, { table, exportRoot, itemCount }) {
  const lines = (await readObject(context, `${exportRoot}/manifest-files.json`)).toString("utf-8").split("\n").filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const compressed = await readObject(context, `${exportRoot}/data/${basename(JSON.parse(line).dataFileS3Key)}`);
    rows.push(...parseExportLines(gunzipSync(compressed).toString("utf-8")));
  }
  if (rows.length !== itemCount) throw new Error(`The ${table} export holds ${rows.length} rows, where it reports ${itemCount}`);
  return rows;
}

export function assertStripeKeyMode(key, mode) {
  if (!key?.startsWith(`sk_${mode}_`) && !key?.startsWith(`rk_${mode}_`)) {
    throw new Error(`The Stripe ${mode} secret does not hold a ${mode} key`);
  }
}

async function listSubscriptions(stripe) {
  const subscriptions = [];
  for await (const subscription of stripe.subscriptions.list({ status: "all", limit: 100 })) subscriptions.push(subscription);
  return subscriptions;
}

/** Cancels one subscription in test mode. A subscription that Stripe says is live stays untouched. */
export async function cancelInTestMode(stripe, id) {
  const subscription = await stripe.subscriptions.retrieve(id);
  if (subscription.livemode !== false) throw new Error("Stripe reports a live subscription. It was not cancelled");
  await stripe.subscriptions.cancel(id);
}

async function createClearoutContext(envName) {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const { default: Stripe } = await import("stripe");

  const region = process.env.AWS_REGION || "eu-west-2";
  const { Account: account } = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
  const secrets = new SecretsManagerClient({ region });
  const readStripeClient = async (secretLeaf, mode) => {
    const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: `${envName}/submit/stripe/${secretLeaf}` }));
    assertStripeKeyMode(SecretString, mode);
    return new Stripe(SecretString, { maxNetworkRetries: 5 });
  };
  const liveStripe = await readStripeClient("secret_key", "live");
  const testStripe = await readStripeClient("test_secret_key", "test");

  return {
    ...(await createContext(envName)),
    dynamo: new DynamoDBClient({ region }),
    resultsBucket: `${envName}-env-analytics-results-${account}`,
    tableArn: (table) => `arn:aws:dynamodb:${region}:${account}:table/${envName}-env-${table}`,
    listOperatorEmails: () => loadOperators(),
    listLiveSubscriptions: () => listSubscriptions(liveStripe),
    listTestSubscriptions: () => listSubscriptions(testStripe),
    cancelTestSubscription: (id) => cancelInTestMode(testStripe, id),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME is required (e.g., 'ci' or 'prod')");
  assertApplyAllowed(envName, options);
  await runClearout(await createClearoutContext(envName), { ...options, runId: process.env.GITHUB_RUN_ID });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
