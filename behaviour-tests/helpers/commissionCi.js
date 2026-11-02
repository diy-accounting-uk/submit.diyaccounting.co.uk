// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/commissionCi.js
//
// The parts of the commission journeys on ci that are not browser steps: the lanes and their
// cards, sign-in without a browser, Stripe Test Clocks, ledger reads, the release invoke and the
// cleanup. The behaviour test and the one-off scripts under scripts/ import these.

import { spawn } from "node:child_process";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import Stripe from "stripe";
import { durableTestUserEmail, logInAndAnswerChallenge, totpSecretName } from "../../scripts/ensure-cognito-test-user.js";
import { hashSub, initializeSalt } from "../../app/services/subHasher.js";

export const ENVIRONMENT_NAME = "ci";
export const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-2";
export const CLOCK_NAME_PREFIX = "commission-ci-";
export const TOKEN_MAX_AGE_MS = 50 * 60 * 1000;
export const POLL_INTERVAL_MS = 2000;
export const POLL_LIMIT_MS = 180_000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Card numbers reserved for this suite. No other lane may type them. */
export const LANES = {
  "commission-operator": { role: "operator", cardNumber: null },
  "commission-j1-referrer": { role: "R1, the J1 referrer", cardNumber: "5555555555554444" },
  "commission-j1-redeemer-a": { role: "J1a: renewals, refund", cardNumber: "4000056655665556" },
  "commission-j1-redeemer-b": { role: "J1b: dispute", cardNumber: "4000000000000259" },
  "commission-j1-redeemer-c": { role: "J1c: pays with R1's card", cardNumber: "5555555555554444" },
  "commission-j2-family": { role: "R2, the J2 family referrer", cardNumber: "2223003122003222" },
  "commission-j2-redeemer-a": { role: "J2a: cancel at day 10", cardNumber: "5105105105105100" },
  "commission-j2-redeemer-b": { role: "J2b: month 2 earns nothing", cardNumber: "4000008260000000" },
  "commission-affiliate": { role: "RA, the J3 and J4 referrer with Connect", cardNumber: "5200828282828210" },
  "commission-j3-redeemer": { role: "J3a: customer tier, late cancel", cardNumber: "4000058260000005" },
  "commission-j4-redeemer": { role: "J4a: casual tier", cardNumber: "4000000400000008" },
};

export const LANE_NAMES = Object.keys(LANES);
export const REFERRER_LANES = ["commission-j1-referrer", "commission-j2-family", "commission-affiliate"];
export const REDEEMER_LANES = [
  "commission-j1-redeemer-a",
  "commission-j1-redeemer-b",
  "commission-j1-redeemer-c",
  "commission-j2-redeemer-a",
  "commission-j2-redeemer-b",
  "commission-j3-redeemer",
  "commission-j4-redeemer",
];

export const laneEmail = durableTestUserEmail;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Call `read` every interval until it returns a truthy value, and return that value. */
export async function pollUntil(what, read, { limitMs = POLL_LIMIT_MS, intervalMs = POLL_INTERVAL_MS } = {}) {
  const deadline = Date.now() + limitMs;
  let last;
  for (;;) {
    last = await read();
    if (last) return last;
    if (Date.now() >= deadline) throw new Error(`Timed out after ${limitMs} ms waiting for ${what}`);
    await sleep(intervalMs);
  }
}

/** The pence a commission line must hold, from the line's own fields. */
export function expectedAmountPence(line) {
  return Math.floor((line.netPence * line.rateBps * line.eligibleMonths) / (10000 * line.lineMonths));
}

export function clockName(runId, group) {
  return `${CLOCK_NAME_PREFIX}${runId}-${group}`;
}

/** Read the credentials the ensure script prints. The `export` lines carry quotes; these lines do not. */
export function parseEnsureOutput(stdout) {
  const read = (name) => new RegExp(`^${name}=(\\S+)\\s*$`, "m").exec(stdout)?.[1];
  const username = read("TEST_AUTH_USERNAME");
  const password = read("TEST_AUTH_PASSWORD");
  const totpSecret = read("TOTP_SECRET");
  if (!username || !password || !totpSecret) {
    throw new Error("The ensure script printed no TEST_AUTH_USERNAME, TEST_AUTH_PASSWORD and TOTP_SECRET lines");
  }
  return { username, password, totpSecret };
}

/** The ISO instant one second either side of a line's release time. */
export const secondBefore = (iso) => new Date(new Date(iso).getTime() - 1000).toISOString();
export const secondAfter = (iso) => new Date(new Date(iso).getTime() + 1000).toISOString();

export function latestIso(...isos) {
  return new Date(Math.max(...isos.map((iso) => new Date(iso).getTime()))).toISOString();
}

export function unwrap(body) {
  return body && typeof body === "object" && "data" in body && body.data !== undefined ? body.data : body;
}

// ---------------------------------------------------------------------------------------------
// AWS and Stripe clients
// ---------------------------------------------------------------------------------------------

let cachedStripe = null;

export async function getTestStripe() {
  if (cachedStripe) return cachedStripe;
  const secrets = new SecretsManagerClient({ region: REGION });
  const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: `${ENVIRONMENT_NAME}/submit/stripe/test_secret_key` }));
  if (!SecretString) throw new Error("The Stripe test secret key is empty");
  cachedStripe = new Stripe(SecretString.trim());
  return cachedStripe;
}

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  commissions: `${ENVIRONMENT_NAME}-env-commissions`,
  passes: `${ENVIRONMENT_NAME}-env-passes`,
  subscriptions: `${ENVIRONMENT_NAME}-env-subscriptions`,
};

export async function prepareHashing() {
  process.env.ENVIRONMENT_NAME = ENVIRONMENT_NAME;
  await initializeSalt();
}

export const hashOfSub = (sub) => hashSub(sub);

async function identityStackOutputs() {
  const cfn = new CloudFormationClient({ region: REGION });
  const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: `${ENVIRONMENT_NAME}-env-IdentityStack` }));
  const outputs = Object.fromEntries((Stacks?.[0]?.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]));
  if (!outputs.UserPoolId || !outputs.UserPoolClientId) throw new Error("IdentityStack has no UserPoolId or UserPoolClientId output");
  return { userPoolId: outputs.UserPoolId, userPoolClientId: outputs.UserPoolClientId };
}

// ---------------------------------------------------------------------------------------------
// Users and sign-in
// ---------------------------------------------------------------------------------------------

/** Run the ensure script for one lane without GITHUB_OUTPUT, and return its credentials. */
export function ensureLane(lane) {
  const env = { ...process.env };
  delete env.GITHUB_OUTPUT;
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/ensure-cognito-test-user.js", ENVIRONMENT_NAME, lane], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`ensure-cognito-test-user ${lane} exited ${code}: ${stderr || stdout}`.slice(0, 2000)));
      try {
        resolve(parseEnsureOutput(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function subOfIdToken(idToken) {
  return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")).sub;
}

/** Ensure every lane at once, then sign each in. Returns a session per lane. */
export async function openSessions({ baseUrl, lanes = LANE_NAMES }) {
  await prepareHashing();
  const [credentials, identity] = await Promise.all([Promise.all(lanes.map((lane) => ensureLane(lane))), identityStackOutputs()]);
  const sessions = {};
  for (const [index, lane] of lanes.entries()) {
    const session = new Session({ baseUrl, lane, credentials: credentials[index], identity });
    await session.signIn();
    sessions[lane] = session;
  }
  return sessions;
}

export class Session {
  constructor({ baseUrl, lane, credentials, identity }) {
    this.baseUrl = baseUrl;
    this.lane = lane;
    this.email = credentials.username;
    this.password = credentials.password;
    this.identity = identity;
    this.idToken = null;
    this.signedInAt = 0;
    this.sub = null;
    this.hash = null;
  }

  async signIn() {
    const cognito = new CognitoIdentityProviderClient({ region: REGION });
    const secrets = new SecretsManagerClient({ region: REGION });
    const result = await logInAndAnswerChallenge(cognito, secrets, {
      userPoolClientId: this.identity.userPoolClientId,
      testEmail: this.email,
      testPassword: this.password,
      secretName: totpSecretName(ENVIRONMENT_NAME, this.lane),
    });
    if (result.needsRecreate || !result.idToken) throw new Error(`Sign-in for ${this.lane} returned no ID token`);
    this.idToken = result.idToken;
    this.signedInAt = Date.now();
    this.sub = subOfIdToken(this.idToken);
    this.hash = hashOfSub(this.sub);
  }

  async token() {
    if (Date.now() - this.signedInAt > TOKEN_MAX_AGE_MS) await this.signIn();
    return this.idToken;
  }

  /** Call the API as this user. Returns { status, body } with the body unwrapped from its data envelope. */
  async api(method, path, body) {
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: { "Authorization": `Bearer ${await this.token()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    return { status: response.status, body: unwrap(parsed), raw: parsed };
  }

  /** Call the API and throw on any status outside 2xx. */
  async apiOk(method, path, body) {
    const result = await this.api(method, path, body);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`${this.lane} ${method} ${path} returned ${result.status}: ${JSON.stringify(result.raw)}`.slice(0, 1500));
    }
    return result.body;
  }

  async startCheckout({ testClockId } = {}) {
    const body = await this.apiOk("POST", "/api/v1/billing/checkout", {
      bundleId: "resident-vat",
      interval: "monthly",
      ...(testClockId ? { testClockId } : {}),
    });
    if (!body?.checkoutUrl) throw new Error(`${this.lane} checkout returned no checkoutUrl: ${JSON.stringify(body)}`);
    return body.checkoutUrl;
  }

  async bundle(bundleId = "resident-vat") {
    const body = await this.apiOk("GET", "/api/v1/bundle");
    return (body?.bundles ?? []).find((bundle) => bundle.bundleId === bundleId && bundle.allocated !== false) ?? null;
  }

  async generatePass() {
    const body = await this.apiOk("POST", "/api/v1/pass/generate", { passTypeId: "digital-pass" });
    if (!body?.code) throw new Error(`${this.lane} pass generation returned no code: ${JSON.stringify(body)}`);
    return body.code;
  }

  async redeemPass(code) {
    return this.apiOk("POST", "/api/v1/pass", { code });
  }
}

// ---------------------------------------------------------------------------------------------
// Ledger and table reads
// ---------------------------------------------------------------------------------------------

async function queryAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await documentClient.send(new QueryCommand({ ...params, ExclusiveStartKey }));
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/** Every line of one redeemer under one referrer, oldest period first. A Query on one partition. */
export async function queryLines(referrerHash, redeemerHash) {
  const items = await queryAll({
    TableName: TABLES.commissions,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": `commission#${referrerHash}`, ":prefix": "line#" },
  });
  return items
    .filter((item) => item.redeemerHash === redeemerHash && !String(item.sk).endsWith("#reversal"))
    .sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)));
}

export async function waitForLines(what, referrerHash, redeemerHash, predicate, options) {
  return pollUntil(
    what,
    async () => {
      const lines = await queryLines(referrerHash, redeemerHash);
      return predicate(lines) ? lines : null;
    },
    options,
  );
}

export async function getSubscriptionRecord(subscriptionId) {
  const { Item } = await documentClient.send(new GetCommand({ TableName: TABLES.subscriptions, Key: { pk: `stripe#${subscriptionId}` } }));
  return Item ?? null;
}

export async function getCommissionItem(pk, sk) {
  const { Item } = await documentClient.send(new GetCommand({ TableName: TABLES.commissions, Key: { pk, sk } }));
  return Item ?? null;
}

export async function getReferralClaim(redeemerHash) {
  const { Item } = await documentClient.send(new GetCommand({ TableName: TABLES.passes, Key: { pk: `referral#${redeemerHash}` } }));
  return Item ?? null;
}

export async function waitForSubscriptionStatus(subscriptionId, status, options) {
  return pollUntil(
    `subscription ${subscriptionId} to be ${status}`,
    async () => {
      const record = await getSubscriptionRecord(subscriptionId);
      return record?.status === status ? record : null;
    },
    options,
  );
}

// ---------------------------------------------------------------------------------------------
// Test Clocks
// ---------------------------------------------------------------------------------------------

export async function createClock(stripe, { name, frozenTimeSeconds }) {
  return stripe.testHelpers.testClocks.create({ frozen_time: frozenTimeSeconds, name });
}

/** Advance a clock and wait until Stripe has finished processing the events. */
export async function advanceClock(stripe, clockId, frozenTimeSeconds) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: frozenTimeSeconds });
  return pollUntil(
    `clock ${clockId} to be ready`,
    async () => {
      const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
      return clock.status === "ready" ? clock : null;
    },
    { limitMs: 300_000, intervalMs: 3000 },
  );
}

// ---------------------------------------------------------------------------------------------
// The release
// ---------------------------------------------------------------------------------------------

const lambdaClient = new LambdaClient({ region: REGION });

export async function invokeLambda(functionName, payload) {
  const result = await lambdaClient.send(new InvokeCommand({ FunctionName: functionName, Payload: Buffer.from(JSON.stringify(payload)) }));
  const text = result.Payload ? Buffer.from(result.Payload).toString("utf8") : "";
  if (result.FunctionError) throw new Error(`${functionName} failed (${result.FunctionError}): ${text}`.slice(0, 1500));
  return text ? JSON.parse(text) : null;
}

/** Invoke the release at an as-of date and check the echo, so a deployment with the old handler fails at once. */
export async function runRelease(deploymentName, asOfIso) {
  const result = await invokeLambda(`${deploymentName}-app-commission-release`, { asOf: asOfIso });
  if (result?.asOf !== new Date(asOfIso).toISOString()) {
    throw new Error(`The release answered asOf ${result?.asOf} for ${asOfIso}: the deployment does not run this branch's handler`);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------------------------

async function cardFingerprintsOf(stripe, customerParams) {
  const fingerprints = new Set();
  for await (const customer of stripe.customers.list({ limit: 100, ...customerParams })) {
    for await (const method of stripe.paymentMethods.list({ customer: customer.id, type: "card", limit: 100 })) {
      if (method.card?.fingerprint) fingerprints.add(method.card.fingerprint);
    }
  }
  return fingerprints;
}

async function deleteKeys(tableName, keys) {
  for (let index = 0; index < keys.length; index += 25) {
    const chunk = keys.slice(index, index + 25);
    let requests = chunk.map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; requests.length > 0 && attempt < 8; attempt += 1) {
      const result = await documentClient.send(new BatchWriteCommand({ RequestItems: { [tableName]: requests } }));
      requests = result.UnprocessedItems?.[tableName] ?? [];
      if (requests.length > 0) await sleep(250 * (attempt + 1));
    }
    if (requests.length > 0) throw new Error(`Could not delete ${requests.length} items from ${tableName}`);
  }
}

/** The sub of each lane's existing Cognito user, or null before the user exists. */
async function lookupLaneSubs() {
  const { userPoolId } = await identityStackOutputs();
  const cognito = new CognitoIdentityProviderClient({ region: REGION });
  const subs = {};
  for (const lane of LANE_NAMES) {
    try {
      const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: laneEmail(lane) }));
      subs[lane] = user.UserAttributes?.find((attribute) => attribute.Name === "sub")?.Value ?? null;
    } catch (error) {
      if (error.name !== "UserNotFoundException") throw error;
      subs[lane] = null;
    }
  }
  return subs;
}

/**
 * Clear what a run leaves behind. Stripe first, in an order that stops a late subscription
 * deletion from recreating a purged bundle; then DynamoDB, by key only. A caller that wants a
 * lane's bundles purged runs the ensure script after this returns.
 */
export async function cleanup({ log = console.log } = {}) {
  await prepareHashing();
  const stripe = await getTestStripe();

  // Card fingerprints first: the customers that hold them go in the Stripe part.
  const fingerprints = new Set();
  const clocks = [];
  for await (const clock of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    if (String(clock.name ?? "").startsWith(CLOCK_NAME_PREFIX)) clocks.push(clock);
  }
  for (const clock of clocks) {
    for (const fingerprint of await cardFingerprintsOf(stripe, { test_clock: clock.id })) fingerprints.add(fingerprint);
  }
  for (const lane of REFERRER_LANES) {
    for (const fingerprint of await cardFingerprintsOf(stripe, { email: laneEmail(lane) })) fingerprints.add(fingerprint);
  }

  // 1. Test clocks: deleting one deletes its customers and cancels their subscriptions.
  for (const clock of clocks) {
    await stripe.testHelpers.testClocks.del(clock.id);
    log(`Deleted test clock ${clock.id} (${clock.name})`);
  }

  // 2. Referrer customers (clock customers are not listed): note their subscriptions, then delete.
  const referrerSubscriptionIds = [];
  for (const lane of REFERRER_LANES) {
    for await (const customer of stripe.customers.list({ email: laneEmail(lane), limit: 100 })) {
      for await (const subscription of stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })) {
        referrerSubscriptionIds.push(subscription.id);
      }
      await stripe.customers.del(customer.id);
      log(`Deleted customer ${customer.id} (${lane})`);
    }
  }

  // 3. Wait until the webhook has recorded each referrer subscription as canceled.
  for (const subscriptionId of referrerSubscriptionIds) {
    await pollUntil(
      `subscription ${subscriptionId} to be canceled`,
      async () => {
        const record = await getSubscriptionRecord(subscriptionId);
        return !record || record.status === "canceled";
      },
      { limitMs: 120_000 },
    );
  }

  // 4. The commission partitions of the three referrers, then the pointers and card records.
  const subs = await lookupLaneSubs();
  const hashes = Object.fromEntries(Object.entries(subs).map(([lane, sub]) => [lane, sub ? hashOfSub(sub) : null]));
  const allHashes = Object.values(hashes).filter(Boolean);
  const commissionKeys = [];
  for (const lane of REFERRER_LANES) {
    const referrerHash = hashes[lane];
    if (!referrerHash) continue;
    const items = await queryAll({
      TableName: TABLES.commissions,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `commission#${referrerHash}` },
    });
    for (const item of items) {
      commissionKeys.push({ pk: item.pk, sk: item.sk });
      if (String(item.sk).startsWith("line#")) {
        if (item.chargeId) commissionKeys.push({ pk: `charge#${item.chargeId}`, sk: "line" });
        if (item.cardFingerprint) fingerprints.add(item.cardFingerprint);
        commissionKeys.push({ pk: "held", sk: `${item.releaseAt}#${referrerHash}#${item.invoiceId}` });
        for (const partition of ["payable", "payable#connect"]) commissionKeys.push({ pk: partition, sk: `${referrerHash}#${item.sk}` });
      }
    }
  }
  for (const fingerprint of fingerprints) {
    for (const hash of allHashes) commissionKeys.push({ pk: `card#${fingerprint}`, sk: `payer#${hash}` });
  }
  await deleteKeys(TABLES.commissions, commissionKeys);
  log(`Deleted ${commissionKeys.length} commission keys`);

  // 5. Passes table: the redeemers' claims and R2's family marker; RA's affiliate item stays.
  const passKeys = REDEEMER_LANES.filter((lane) => hashes[lane]).map((lane) => ({ pk: `referral#${hashes[lane]}` }));
  if (hashes["commission-j2-family"]) passKeys.push({ pk: `affiliate#${hashes["commission-j2-family"]}` });
  await deleteKeys(TABLES.passes, passKeys);
  log(`Deleted ${passKeys.length} passes keys`);
}
