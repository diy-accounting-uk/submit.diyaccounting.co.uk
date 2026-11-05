#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-168 Roll the MCP blob key without breaking sealed data
// - **Use when:** the key that signs MCP OAuth blobs and seals MCP codes and HMRC grants must change, on a schedule or after exposure.
// - **Does:** mcp-blob-key-rotate.js reads one environment's `{env}/submit/mcp/oauth-blob-key` secret as a registry, a raw value counting as version v1. It adds a random key as the next version, makes it current and keeps every earlier version, so blobs and sealed values made before the roll still open. It plans by default and writes only with --apply. It never prints a key.
// - **Proves:** with --prove-refresh (ci only) it shows a deployed warm Lambda recover from a stale key cache. It signs in the durable `mcpBlobKeyProof` test user, creates an MCP HMRC grant through the API and places a value sealed under the current version, and reads the grant so the Lambda loads the key registry. It rolls the key, waits past the ten second floor on a forced secret read, places a value sealed under the new version and reads the grant again inside the cache life. It then looks in the Lambda's log group for the `Sealed value did not open under the cached keys, keys read again` line with `keysChanged` true, and deletes the grant item. It fails when the second read is not 200 or the line is absent.
// - **Run:** `gh workflow run mcp-blob-key-rotate.yml -f environment-name=<ci|prod> -f apply=<true|false>`; `gh workflow run mcp-blob-key-rotate.yml -f environment-name=ci -f prove-refresh=true`
// - **Entry:** `scripts/mcp-blob-key-rotate.js:main`; `scripts/mcp-blob-key-rotate.js:proveRefresh`; `app/lib/mcpBlobKey.js:parseBlobKeyRegistry`; `app/lib/codesSeal.js:openFor`
// - **Files:** .github/workflows/mcp-blob-key-rotate.yml, scripts/mcp-blob-key-rotate.js, app/lib/mcpBlobKey.js, app/lib/mcpOauthBlob.js, app/lib/codesSeal.js, scripts/ensure-cognito-test-user.js, app/unit-tests/scripts/mcpBlobKeyRotate.test.js, app/unit-tests/lib/mcpBlobKey.test.js
// - **Keywords:** mcp blob key, key roll, key registry, key version, sealed grant, oauth blob, rotation schedule, refresh proof, warm container, stale key cache
// - **Related:** OPS-43, OPS-45, OPS-165
// @end-capability

// scripts/mcp-blob-key-rotate.js
//
// Adds a new version to one environment's MCP blob key registry and makes it current, keeping
// every earlier version. app/lib/mcpBlobKey.js reads the stored value as a registry, a raw value
// as version v1. Blobs and sealed values name the version that made them, so a roll needs no
// re-sealing pass. Remove an old version by hand only after the longest-lived value made under it
// has ended.
//
// Run this only after a deploy that holds the registry reader. A reader from before that deploy
// takes the JSON value for the key.
//
// mcp-blob-key-rotate.yml runs this per environment: plan by default, --apply to write. Never
// prints a key.
//
// --prove-refresh rolls the key (it implies --apply) between two reads of an MCP HMRC grant on a
// deployed ci Lambda, and checks the Lambda's log for the forced key read. It refuses any
// environment but ci. The grant is a real item in the sessions table, created through the API for
// a test user and removed at the end; its sealed value holds no real token.
//
// Usage:
//   ENVIRONMENT_NAME=ci node scripts/mcp-blob-key-rotate.js [--apply]
//   ENVIRONMENT_NAME=ci SUBMIT_BASE_URL=https://ci-submit.diyaccounting.co.uk PROOF_AUTH_PASSWORD=... \
//     node scripts/mcp-blob-key-rotate.js --prove-refresh

import crypto from "node:crypto";
import { parseBlobKeyRegistry } from "../app/lib/mcpBlobKey.js";
import { sealFor, HMRC_GRANT_PURPOSE, KEY_REFRESH_LOG_MESSAGE } from "../app/lib/codesSeal.js";
import { FORCE_REFRESH_MIN_MS, SECRET_TTL_MS } from "../app/lib/cachedSecret.js";

const SECRET_NAME_SUFFIX = "submit/mcp/oauth-blob-key";
const PROOF_LANE = "mcpBlobKeyProof";
const GRANTS_PATH = "/api/v1/mcp/hmrc-grants";
const GRANT_FUNCTION_NAME_PATTERN = "mcp-hmrc-grant-ingest-handler";
const FAR_FUTURE_SECONDS = 4_000_000_000;
const EVIDENCE_POLLS = 12;
const EVIDENCE_POLL_MS = 10_000;

export function parseArgs(argv) {
  const opts = { apply: false, proveRefresh: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--prove-refresh") {
      opts.proveRefresh = true;
      opts.apply = true;
    } else if (arg === "--help") {
      console.log("Usage: ENVIRONMENT_NAME=ci|prod node scripts/mcp-blob-key-rotate.js [--apply | --prove-refresh]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  return opts;
}

export function assertProofAllowed(envName) {
  if (envName !== "ci") throw new Error(`--prove-refresh runs on ci only, not on "${envName}"`);
}

/**
 * Read the stored value as a registry and work out the next version label. A raw value is
 * version v1. The next label is one past the highest existing number.
 *
 * @param {string} raw - The secret's current string
 * @returns {{ registry: {current: string, versions: object}, nextVersion: string }}
 */
export function planNextVersion(raw) {
  const registry = parseBlobKeyRegistry(raw);
  const highest = Math.max(...Object.keys(registry.versions).map((label) => Number(label.slice(1))));
  return { registry, nextVersion: `v${highest + 1}` };
}

/**
 * Build the rotated registry: the new version added, made current, every earlier version kept.
 */
export function buildRotatedRegistry(registry, nextVersion, newKey) {
  return { current: nextVersion, versions: { ...registry.versions, [nextVersion]: newKey } };
}

async function writeRotatedRegistry(client, commands, secretName, rotated) {
  await client.send(new commands.UpdateSecretCommand({ SecretId: secretName, SecretString: JSON.stringify(rotated) }));
  await client.send(
    new commands.TagResourceCommand({
      SecretId: secretName,
      Tags: [{ Key: "rotated-at", Value: new Date().toISOString().slice(0, 10) }],
    }),
  );
}

/**
 * The refresh proof, as a sequence over injected steps. The first grant read makes the Lambda
 * load the key registry. The roll then adds a version. A value sealed under that version is read
 * after the forced-read floor and inside the cache life, so the Lambda's cached registry does not
 * hold the version: the first open fails, the keys are read again and the second open passes.
 *
 * @param {object} steps
 * @param {() => Promise<string>} steps.createGrant - creates a grant through the API, answers its id
 * @param {(grantId: string) => Promise<string>} steps.seal - seals a value for the grant under the current version
 * @param {(grantId: string, sealed: string) => Promise<void>} steps.place - stores the sealed value on the grant, granted
 * @param {(grantId: string) => Promise<{status: number}>} steps.read - reads the grant through the API
 * @param {() => Promise<void>} steps.roll - adds and activates a key version
 * @param {(sinceMs: number, expected: {sealedVersion: string, cachedCurrent: string}) => Promise<object|null>} steps.findEvidence
 * @param {(grantId: string) => Promise<void>} steps.remove - deletes the grant item
 * @param {(ms: number) => Promise<void>} steps.sleep
 * @param {() => number} steps.now - epoch milliseconds
 * @returns {Promise<{grantId: string, cachedCurrent: string, sealedVersion: string, evidence: object}>}
 */
export async function proveRefresh(steps) {
  const grantId = await steps.createGrant();
  try {
    const sealedBefore = await steps.seal(grantId);
    await steps.place(grantId, sealedBefore);
    const first = await steps.read(grantId);
    if (first.status !== 200) throw new Error(`The first grant read answered ${first.status}, expected 200`);
    const loadedAt = steps.now();
    const cachedCurrent = sealedBefore.split(".")[0];

    await steps.roll();

    const floorWait = FORCE_REFRESH_MIN_MS + 2000 - (steps.now() - loadedAt);
    if (floorWait > 0) await steps.sleep(floorWait);
    if (steps.now() - loadedAt >= SECRET_TTL_MS - 30_000) {
      throw new Error("The key cache would have expired before the second read; run the proof again");
    }

    const sealedAfter = await steps.seal(grantId);
    const sealedVersion = sealedAfter.split(".")[0];
    if (sealedVersion === cachedCurrent) throw new Error(`The roll left the current version at ${cachedCurrent}`);
    await steps.place(grantId, sealedAfter);
    const sinceMs = steps.now() - 5000;
    const second = await steps.read(grantId);
    if (second.status !== 200) throw new Error(`The second grant read answered ${second.status}, expected 200`);

    const evidence = await steps.findEvidence(sinceMs, { sealedVersion, cachedCurrent });
    if (!evidence) {
      throw new Error(
        `No "${KEY_REFRESH_LOG_MESSAGE}" line for ${HMRC_GRANT_PURPOSE} (${cachedCurrent} to ${sealedVersion}) in the Lambda log. ` +
          "The second read may have reached another container; run the proof again.",
      );
    }
    return { grantId, cachedCurrent, sealedVersion, evidence };
  } finally {
    await steps.remove(grantId);
  }
}

async function liveProofSteps({ envName, secretName, secretsClient, commands, registryRef }) {
  const baseUrl = (process.env.SUBMIT_BASE_URL ?? "").replace(/\/$/, "");
  const password = process.env.PROOF_AUTH_PASSWORD;
  if (!baseUrl || !password) throw new Error("SUBMIT_BASE_URL and PROOF_AUTH_PASSWORD are required for --prove-refresh");

  const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
  const { CognitoIdentityProviderClient } = await import("@aws-sdk/client-cognito-identity-provider");
  const { DynamoDBClient, UpdateItemCommand, DeleteItemCommand } = await import("@aws-sdk/client-dynamodb");
  const { CloudWatchLogsClient, DescribeLogGroupsCommand, FilterLogEventsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
  const { logInAndAnswerChallenge, durableTestUserEmail, totpSecretName } = await import("./ensure-cognito-test-user.js");

  const stack = (await new CloudFormationClient({}).send(new DescribeStacksCommand({ StackName: `${envName}-env-IdentityStack` })))
    .Stacks?.[0];
  const userPoolClientId = stack?.Outputs?.find((output) => output.OutputKey === "UserPoolClientId")?.OutputValue;
  if (!userPoolClientId) throw new Error(`No UserPoolClientId output on ${envName}-env-IdentityStack`);
  const signedIn = await logInAndAnswerChallenge(new CognitoIdentityProviderClient({}), secretsClient, {
    userPoolClientId,
    testEmail: durableTestUserEmail(PROOF_LANE),
    testPassword: password,
    secretName: totpSecretName(envName, PROOF_LANE),
  });
  if (!signedIn.accessToken) throw new Error("The proof user did not sign in");

  const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "eu-west-2" });
  const logs = new CloudWatchLogsClient({ region: process.env.AWS_REGION || "eu-west-2" });
  const tableName = `${envName}-env-mcp-sessions`;
  const itemKey = (grantId) => ({ sessionId: { S: `hmrc-grant:${grantId}` } });
  const api = async (method, path, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${signedIn.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };

  return {
    createGrant: async () => {
      const created = await api("POST", GRANTS_PATH, { services: ["vat"], hmrcAccount: "synthetic" });
      if (created.status !== 201 || !created.body?.data?.grantId) throw new Error(`Creating the grant answered ${created.status}`);
      return created.body.data.grantId;
    },
    seal: (grantId) => {
      process.env.MCP_OAUTH_BLOB_KEY = JSON.stringify(registryRef.current);
      return sealFor(HMRC_GRANT_PURPOSE, { accessToken: "proof-not-a-token", refreshToken: null }, grantId);
    },
    place: async (grantId, sealed) => {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: itemKey(grantId),
          UpdateExpression: "SET sealed = :sealed, accessExpiresAt = :expires, #state = :granted",
          ExpressionAttributeNames: { "#state": "state" },
          ExpressionAttributeValues: {
            ":sealed": { S: sealed },
            ":expires": { N: String(FAR_FUTURE_SECONDS) },
            ":granted": { S: "granted" },
          },
          ConditionExpression: "attribute_exists(sessionId)",
        }),
      );
    },
    read: (grantId) => api("GET", `${GRANTS_PATH}/${grantId}`),
    roll: async () => {
      const { nextVersion, registry } = planNextVersion(JSON.stringify(registryRef.current));
      const rotated = buildRotatedRegistry(registry, nextVersion, crypto.randomBytes(48).toString("base64url"));
      await writeRotatedRegistry(registryRef.client, commands, secretName, rotated);
      registryRef.current = rotated;
      console.log(`Rolled. Current version is now ${nextVersion}.`);
    },
    findEvidence: async (sinceMs, expected) => {
      const groups = [];
      let nextToken;
      do {
        const page = await logs.send(new DescribeLogGroupsCommand({ logGroupNamePattern: GRANT_FUNCTION_NAME_PATTERN, nextToken }));
        groups.push(...(page.logGroups ?? []).map((group) => group.logGroupName));
        nextToken = page.nextToken;
      } while (nextToken);
      for (let poll = 0; poll < EVIDENCE_POLLS; poll += 1) {
        for (const logGroupName of groups) {
          const found = await logs.send(
            new FilterLogEventsCommand({ logGroupName, startTime: sinceMs, filterPattern: `"${KEY_REFRESH_LOG_MESSAGE}"` }),
          );
          for (const event of found.events ?? []) {
            const line = parseLogLine(event.message);
            if (isRefreshEvidence(line, expected)) return { logGroupName, ...line };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, EVIDENCE_POLL_MS));
      }
      return null;
    },
    remove: async (grantId) => {
      await dynamo.send(new DeleteItemCommand({ TableName: tableName, Key: itemKey(grantId) }));
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
}

export function parseLogLine(message) {
  try {
    return JSON.parse(message);
  } catch {
    return null;
  }
}

export function isRefreshEvidence(line, { sealedVersion, cachedCurrent }) {
  return (
    line?.message === KEY_REFRESH_LOG_MESSAGE &&
    line.purpose === HMRC_GRANT_PURPOSE &&
    line.sealedVersion === sealedVersion &&
    line.cachedCurrent === cachedCurrent &&
    line.keysChanged === true
  );
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME is required (e.g., 'ci' or 'prod')");
  if (opts.proveRefresh) assertProofAllowed(envName);
  const secretName = `${envName}/${SECRET_NAME_SUFFIX}`;

  const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand, TagResourceCommand } =
    await import("@aws-sdk/client-secrets-manager");
  const commands = { UpdateSecretCommand, TagResourceCommand };
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

  const current = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  const { registry, nextVersion } = planNextVersion(current.SecretString);
  const wasRaw = !current.SecretString.startsWith("{");

  console.log(`Secret: ${secretName}`);
  console.log(`Stored as: ${wasRaw ? "a raw value, read as v1" : "a registry"}`);
  console.log(`Current version: ${registry.current}`);
  console.log(`Versions kept: [${Object.keys(registry.versions).join(", ")}]`);
  console.log(`New version: ${nextVersion} (${opts.apply ? "writing" : "plan only"})`);

  if (!opts.apply) {
    console.log("Plan only. No write made. Run again with --apply to roll the key.");
    return;
  }

  if (opts.proveRefresh) {
    const registryRef = { current: registry, client };
    const steps = await liveProofSteps({ envName, secretName, secretsClient: client, commands, registryRef });
    const proof = await proveRefresh(steps);
    console.log(
      `Proved on ${proof.evidence.logGroupName}: a value sealed under ${proof.sealedVersion} opened in a container that held ${proof.cachedCurrent}.`,
    );
    console.log(`Log line: ${KEY_REFRESH_LOG_MESSAGE} (purpose ${HMRC_GRANT_PURPOSE}, keysChanged true).`);
    return;
  }

  const newKey = crypto.randomBytes(48).toString("base64url");
  const rotated = buildRotatedRegistry(registry, nextVersion, newKey);

  await writeRotatedRegistry(client, commands, secretName, rotated);

  console.log(`Rolled. Current version is now ${nextVersion}. Earlier versions stay in the registry`);
  console.log("so blobs and sealed values made under them still open.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
