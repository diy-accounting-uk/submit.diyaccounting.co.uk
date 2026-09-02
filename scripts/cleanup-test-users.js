#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Clean up Cognito native test users and their associated data.
 *
 * Scans Cognito for native test users, deletes their data from all DynamoDB tables, then
 * deletes the Cognito users. Durable test users (synthetic-*@test.diyaccounting.co.uk) keep
 * their identity: only their data is purged, so reusing them costs no new monthly active user.
 *
 * Usage:
 *   node scripts/cleanup-test-users.js <environment-name> <deployment-name> [--confirm] [--json]
 *
 * Environment variables:
 *   AWS_REGION               AWS region (default: eu-west-2)
 *   ENVIRONMENT_NAME         For Secrets Manager salt lookup
 *   USER_SUB_HASH_SALT       Override salt registry JSON (local dev)
 */

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { CognitoIdentityProviderClient, ListUsersCommand, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { execFileSync } from "child_process";

const EPHEMERAL_EMAIL_PATTERN = /^test-.*@test\.diyaccounting\.co\.uk$/;
const DURABLE_EMAIL_PATTERN = /^synthetic-.*@test\.diyaccounting\.co\.uk$/;
const SKIP_IF_TOUCHED_WITHIN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get Cognito User Pool ID from CloudFormation stack outputs.
 */
async function getUserPoolId(environmentName) {
  const stackName = `${environmentName}-env-IdentityStack`;
  const cfnClient = new CloudFormationClient({});

  const response = await cfnClient.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = response.Stacks?.[0];
  if (!stack) throw new Error(`Stack ${stackName} not found`);

  const output = stack.Outputs?.find((o) => o.OutputKey === "UserPoolId");
  if (!output?.OutputValue) throw new Error(`UserPoolId output not found in stack ${stackName}`);

  return output.OutputValue;
}

/**
 * List all Cognito native test users, flagging the durable ones.
 */
async function listTestUsers(userPoolId) {
  const cognitoClient = new CognitoIdentityProviderClient({});
  const users = [];

  for (const [prefix, pattern, durable] of [
    ["test-", EPHEMERAL_EMAIL_PATTERN, false],
    ["synthetic-", DURABLE_EMAIL_PATTERN, true],
  ]) {
    let paginationToken;

    do {
      const response = await cognitoClient.send(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          Filter: `email ^= "${prefix}"`,
          PaginationToken: paginationToken,
        }),
      );

      for (const user of response.Users || []) {
        const email = user.Attributes?.find((a) => a.Name === "email")?.Value;
        if (email && pattern.test(email)) {
          const sub = user.Attributes?.find((a) => a.Name === "sub")?.Value;
          users.push({
            username: user.Username,
            email,
            sub,
            durable,
            // A durable user is as old as its first run, so its last change is what says
            // whether a test is using it right now.
            touchedAt: user.UserLastModifiedDate || user.UserCreateDate,
          });
        }
      }

      paginationToken = response.PaginationToken;
    } while (paginationToken);
  }

  return users;
}

/**
 * Delete a Cognito user (idempotent — ignores UserNotFoundException).
 */
async function deleteCognitoUser(userPoolId, username) {
  const cognitoClient = new CognitoIdentityProviderClient({});
  try {
    await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
    return true;
  } catch (error) {
    if (error.name === "UserNotFoundException") return false;
    throw error;
  }
}

// --- CLI ---

const args = process.argv.slice(2);
const environmentName = args[0];
const deploymentName = args[1];
const confirm = args.includes("--confirm");
const jsonOutput = args.includes("--json");

if (!environmentName || !deploymentName) {
  console.error("Usage: node scripts/cleanup-test-users.js <environment-name> <deployment-name> [--confirm] [--json]");
  process.exit(1);
}

// Set ENVIRONMENT_NAME for subHasher salt initialization
process.env.ENVIRONMENT_NAME = process.env.ENVIRONMENT_NAME || environmentName;

(async () => {
  try {
    const userPoolId = await getUserPoolId(environmentName);
    if (!jsonOutput) console.log(`User Pool ID: ${userPoolId}`);

    const testUsers = await listTestUsers(userPoolId);
    if (!jsonOutput) console.log(`Found ${testUsers.length} test user(s)`);

    const now = Date.now();
    const summary = { found: testUsers.length, skipped: 0, purged: 0, deleted: 0, errors: 0, users: [] };

    for (const user of testUsers) {
      // Skip users touched in the last hour (might be in use by a running test)
      if (user.touchedAt && now - new Date(user.touchedAt).getTime() < SKIP_IF_TOUCHED_WITHIN_MS) {
        if (!jsonOutput)
          console.log(`  SKIP ${user.email} (touched ${Math.round((now - new Date(user.touchedAt).getTime()) / 60000)}m ago)`);
        summary.skipped++;
        summary.users.push({ email: user.email, action: "skipped", reason: "too recent" });
        continue;
      }

      const verb = user.durable ? "PURGE DATA FOR" : "DELETE";
      if (!jsonOutput) console.log(`  ${confirm ? verb : `WOULD ${verb}`} ${user.email} (sub: ${user.sub})`);

      if (confirm) {
        try {
          // Delete user data from DynamoDB via delete-user-data.js
          execFileSync("node", ["scripts/delete-user-data.js", deploymentName, "--user-sub", user.sub, "--confirm", "--json"], {
            stdio: "pipe",
            env: { ...process.env },
          });

          if (user.durable) {
            summary.purged++;
            summary.users.push({ email: user.email, action: "data-purged" });
          } else {
            await deleteCognitoUser(userPoolId, user.username);
            summary.deleted++;
            summary.users.push({ email: user.email, action: "deleted" });
          }
        } catch (error) {
          if (!jsonOutput) console.error(`    ERROR: ${error.message}`);
          summary.errors++;
          summary.users.push({ email: user.email, action: "error", error: error.message });
        }
      }
    }

    if (jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log("");
      if (!confirm) {
        console.log(`DRY RUN: Would act on ${testUsers.length - summary.skipped} user(s), skip ${summary.skipped}`);
        console.log("Add --confirm to execute.");
      } else {
        console.log(`Deleted: ${summary.deleted}, Data purged: ${summary.purged}, Skipped: ${summary.skipped}, Errors: ${summary.errors}`);
      }
    }
  } catch (error) {
    console.error(`Cleanup failed: ${error.message}`);
    if (!jsonOutput) console.error(error.stack);
    process.exit(1);
  }
})();
