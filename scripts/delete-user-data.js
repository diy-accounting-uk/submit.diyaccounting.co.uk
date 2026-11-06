#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-40 Delete a customer's data for GDPR erasure
// - **Use when:** a customer has exercised their GDPR right to erasure.
// - **Does:** delete-user-data.js deletes a customer's DynamoDB records, OAuth tokens and audit logs, via the DynamoDB API and Secrets Manager. It reads the ids of the customer's subscription rows from the analytics lake, because the subscriptions table has no hashed-sub key. delete-user-data-by-email.yml resolves an email to its hashed subject through an Athena lookup first; delete-user-data.yml deletes directly by hashed subject. confirm=false runs a dry run.
// - **Run:** `gh workflow run delete-user-data-by-email.yml -f email=<email> -f environment-name=<ci|prod> -f confirm=<true|false>`; `gh workflow run delete-user-data.yml -f hashed-sub=<hash> -f environment-name=<ci|prod> -f confirm=<true|false>`
// - **Entry:** `scripts/delete-user-data.js:main`
// - **Files:** .github/workflows/delete-user-data-by-email.yml, .github/workflows/delete-user-data.yml, scripts/delete-user-data.js, app/unit-tests/scripts/deleteUserData.test.js
// - **Keywords:** gdpr erasure, delete user data, right to be forgotten, hashed sub, athena lookup, dry run
// - **Related:** OPS-41, OPS-49
// @end-capability

/**
 * Delete user data (GDPR Right to Erasure / "Right to be Forgotten")
 *
 * Queries each customer DynamoDB table (`<environment-name>-env-<table>`) by hashedSub partition
 * key (never a scan). HMRC receipts are anonymized (not deleted) for 7-year legal retention.
 * The subscriptions table has no hashedSub key. The ids of the subscription rows come from the
 * analytics lake, and each row is deleted by its key.
 *
 * Usage:
 *   node scripts/delete-user-data.js <environment-name> --user-sub <sub> [--confirm]
 *   node scripts/delete-user-data.js <environment-name> --hashed-sub <hash> [--confirm]
 *
 * Options:
 *   --user-sub <sub>       User sub (will be hashed with all salt versions)
 *   --hashed-sub <hash>    Pre-computed hashed sub (skip salt computation)
 *   --confirm              Execute deletion (default: dry-run)
 *   --json                 Output structured JSON summary
 *
 * Environment variables:
 *   AWS_REGION               AWS region (default: eu-west-2)
 *   USER_SUB_HASH_SALT       Override salt registry JSON (local dev); otherwise the salt is
 *                            read from Secrets Manager for <environment-name>
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { pathToFileURL } from "node:url";

const ANONYMIZED_PARTITION = "DELETED";
const RECEIPT_PERSONAL_FIELDS = ["email", "userName", "address"];
const HASHED_SUB_PATTERN = /^[A-Za-z0-9_-]+$/;
const ATHENA_POLL_MS = 2000;
const ATHENA_TIMEOUT_MS = 5 * 60 * 1000;

// Create DynamoDB Document Client
function makeDocClient(region) {
  const client = new DynamoDBClient({ region: region || "eu-west-2" });
  return DynamoDBDocumentClient.from(client);
}

/**
 * Query a DynamoDB table by hashedSub partition key.
 * Returns all items for the given hashedSub.
 */
async function queryByHashedSub(docClient, tableName, hashedSub) {
  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const response = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :h",
        ExpressionAttributeValues: { ":h": hashedSub },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...(response.Items || []));
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Delete items from a DynamoDB table using composite key (hashedSub + sortKey).
 */
async function deleteItems(docClient, tableName, items, sortKeyAttribute) {
  let deleted = 0;
  for (const item of items) {
    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          hashedSub: item.hashedSub,
          [sortKeyAttribute]: item[sortKeyAttribute],
        },
      }),
    );
    deleted++;
  }
  return deleted;
}

/**
 * Anonymize receipt items. For each receipt, write a copy under the DELETED partition without
 * the personal fields, then delete the original. A failed write stops the delete of that
 * receipt, so a receipt is never lost without its anonymised copy.
 */
export async function anonymizeReceipts(docClient, tableName, items) {
  let anonymized = 0;
  for (const item of items) {
    const copy = { ...item, hashedSub: ANONYMIZED_PARTITION, anonymizedAt: new Date().toISOString() };
    for (const field of RECEIPT_PERSONAL_FIELDS) delete copy[field];

    await docClient.send(new PutCommand({ TableName: tableName, Item: copy }));

    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          hashedSub: item.hashedSub,
          receiptId: item.receiptId,
        },
      }),
    );

    anonymized++;
  }
  return anonymized;
}

/**
 * Read the subscription ids of the given hashed subs from the analytics lake. The lake keeps the
 * hashed sub of every subscription row, and the table has no index on it.
 */
export async function lookupSubscriptionIdsInLake({ environmentName, hashedSubs }) {
  for (const hashedSub of hashedSubs) {
    if (!HASHED_SUB_PATTERN.test(hashedSub)) throw new Error("A hashed sub has a character that the lake query does not accept");
  }
  const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } =
    await import("@aws-sdk/client-athena");
  const athena = new AthenaClient({ region: process.env.AWS_REGION || "eu-west-2" });
  const list = hashedSubs.map((hashedSub) => `'${hashedSub}'`).join(", ");
  const sql = `SELECT subscription_id FROM dynamo_subscriptions WHERE subscription_id IS NOT NULL AND hashed_sub IN (${list})
UNION SELECT subscription_id FROM aliased_dynamo_subscriptions WHERE subscription_id IS NOT NULL AND hashed_sub IN (${list})`;

  const { QueryExecutionId } = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      WorkGroup: `${environmentName}-env-analytics`,
      QueryExecutionContext: { Database: `${environmentName}_env_analytics` },
    }),
  );
  const deadline = Date.now() + ATHENA_TIMEOUT_MS;
  for (;;) {
    const { QueryExecution } = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId }));
    const state = QueryExecution?.Status?.State;
    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") throw new Error(`The lake query ${state}`);
    if (Date.now() > deadline) throw new Error("The lake query timed out");
    await new Promise((resolve) => setTimeout(resolve, ATHENA_POLL_MS));
  }
  const ids = [];
  let token;
  do {
    const page = await athena.send(new GetQueryResultsCommand({ QueryExecutionId, NextToken: token }));
    ids.push(...(page.ResultSet?.Rows ?? []).map((row) => row.Data?.[0]?.VarCharValue));
    token = page.NextToken;
  } while (token);
  return [...new Set(ids.slice(1).filter(Boolean))];
}

/**
 * Delete subscription rows by key. The key is `stripe#<subscription id>`.
 */
export async function deleteSubscriptions(docClient, tableName, subscriptionIds) {
  let deleted = 0;
  for (const subscriptionId of subscriptionIds) {
    await docClient.send(new DeleteCommand({ TableName: tableName, Key: { pk: `stripe#${subscriptionId}` } }));
    deleted++;
  }
  return deleted;
}

/**
 * Compute all hashedSub variants for a user sub using multi-version salt.
 */
async function computeAllHashedSubs(userSub) {
  const { initializeSalt, hashSub, hashSubWithVersion, getPreviousVersions } = await import("../app/services/subHasher.js");
  await initializeSalt();

  const hashes = [hashSub(userSub)]; // current version
  for (const version of getPreviousVersions()) {
    hashes.push(hashSubWithVersion(userSub, version));
  }
  return [...new Set(hashes)]; // deduplicate
}

// DynamoDB tables keyed by hashedSub, with their sort key attributes
export const TABLE_DEFS = [
  { suffix: "bundles", sortKey: "bundleId", action: "delete" },
  { suffix: "receipts", sortKey: "receiptId", action: "anonymize" },
  { suffix: "hmrc-api-requests", sortKey: "id", action: "delete" },
  { suffix: "bundle-post-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "bundle-delete-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "hmrc-vat-return-post-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "hmrc-vat-return-get-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "hmrc-vat-obligation-get-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "activity-charges", sortKey: "chargeKey", action: "delete" },
  { suffix: "practice-clients", sortKey: "clientId", action: "delete" },
];

/**
 * Main deletion function.
 */
export async function deleteUserData({
  environmentName,
  hashedSubs,
  confirm = false,
  jsonOutput = false,
  docClient = makeDocClient(process.env.AWS_REGION || "eu-west-2"),
  lookupSubscriptionIds = lookupSubscriptionIdsInLake,
}) {
  const summary = {
    timestamp: new Date().toISOString(),
    environmentName,
    hashedSubs,
    dryRun: !confirm,
    tables: {},
    totals: { deleted: 0, anonymized: 0, retained: 0 },
  };

  if (!jsonOutput) {
    console.log(`Environment: ${environmentName}`);
    console.log(`Hashed subs: ${hashedSubs.join(", ")}`);
    console.log(`Mode: ${confirm ? "CONFIRMED - will delete" : "DRY RUN"}`);
    console.log("");
  }

  for (const tableDef of TABLE_DEFS) {
    const tableName = `${environmentName}-env-${tableDef.suffix}`;
    const allItems = [];

    // Query for all hashedSub variants
    for (const hashedSub of hashedSubs) {
      const items = await queryByHashedSub(docClient, tableName, hashedSub);
      allItems.push(...items);
    }

    summary.tables[tableDef.suffix] = { found: allItems.length, action: tableDef.action };

    if (!jsonOutput) {
      const actionLabel = tableDef.action === "anonymize" ? "anonymize" : "delete";
      console.log(`  ${tableDef.suffix}: ${allItems.length} item(s) [${actionLabel}]`);
    }

    if (confirm && allItems.length > 0) {
      if (tableDef.action === "anonymize") {
        const count = await anonymizeReceipts(docClient, tableName, allItems);
        summary.tables[tableDef.suffix].processed = count;
        summary.totals.anonymized += count;
      } else {
        const count = await deleteItems(docClient, tableName, allItems, tableDef.sortKey);
        summary.tables[tableDef.suffix].processed = count;
        summary.totals.deleted += count;
      }
    }
  }

  const subscriptionIds = await lookupSubscriptionIds({ environmentName, hashedSubs });
  summary.tables.subscriptions = { found: subscriptionIds.length, action: "delete" };
  if (!jsonOutput) {
    console.log(`  subscriptions: ${subscriptionIds.length} item(s) [delete]`);
  }
  if (confirm && subscriptionIds.length > 0) {
    const count = await deleteSubscriptions(docClient, `${environmentName}-env-subscriptions`, subscriptionIds);
    summary.tables.subscriptions.processed = count;
    summary.totals.deleted += count;
  }

  if (!jsonOutput) {
    console.log("");
    if (!confirm) {
      console.log("DRY RUN - no data was modified. Add --confirm to execute.");
    } else {
      console.log(`Deleted: ${summary.totals.deleted} item(s)`);
      console.log(`Anonymized: ${summary.totals.anonymized} receipt(s)`);
      console.log("Deletion complete.");
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  }

  return summary;
}

// --- CLI ---

function runCli() {
  const args = process.argv.slice(2);

  function getArg(name) {
    const idx = args.indexOf(name);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    return null;
  }

  const environmentName = args[0];
  const userSub = getArg("--user-sub");
  const hashedSub = getArg("--hashed-sub");
  const confirm = args.includes("--confirm");
  const jsonOutput = args.includes("--json");

  if (!environmentName || (!userSub && !hashedSub)) {
    console.error("Usage:");
    console.error("  node scripts/delete-user-data.js <environment-name> --user-sub <sub> [--confirm] [--json]");
    console.error("  node scripts/delete-user-data.js <environment-name> --hashed-sub <hash> [--confirm] [--json]");
    console.error("");
    console.error("WARNING: This is a destructive operation. Run export-user-data.js first as backup!");
    process.exit(1);
  }

  process.env.ENVIRONMENT_NAME = environmentName;

  (async () => {
    try {
      let hashedSubs;
      if (hashedSub) {
        hashedSubs = [hashedSub];
      } else {
        hashedSubs = await computeAllHashedSubs(userSub);
        if (!jsonOutput) {
          console.log(`Computed ${hashedSubs.length} hash variant(s) for user sub`);
        }
      }

      await deleteUserData({ environmentName, hashedSubs, confirm, jsonOutput });
    } catch (error) {
      console.error(`Deletion failed: ${error.message}`);
      if (!jsonOutput) console.error(error.stack);
      process.exit(1);
    }
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
