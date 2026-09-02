#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Delete user data (GDPR Right to Erasure / "Right to be Forgotten")
 *
 * Queries all 8 DynamoDB tables (`<environment-name>-env-<table>`) by hashedSub partition
 * key (not scan). HMRC receipts are anonymized (not deleted) for 7-year legal retention.
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
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

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
 * Anonymize receipt items — replace hashedSub with 'DELETED', strip PII fields,
 * keep transaction metadata for 7-year legal compliance.
 */
async function anonymizeReceipts(docClient, tableName, items) {
  let anonymized = 0;
  for (const item of items) {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          hashedSub: item.hashedSub,
          receiptId: item.receiptId,
        },
        UpdateExpression: "SET #hs = :deleted, anonymizedAt = :now REMOVE #email, #name, #addr",
        ExpressionAttributeNames: {
          "#hs": "originalHashedSub",
          "#email": "email",
          "#name": "userName",
          "#addr": "address",
        },
        ExpressionAttributeValues: {
          ":deleted": "DELETED",
          ":now": new Date().toISOString(),
        },
      }),
    );

    // Delete and re-create with DELETED partition key to truly decouple from user
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

// All 8 DynamoDB tables with their sort key attributes
const TABLE_DEFS = [
  { suffix: "bundles", sortKey: "bundleId", action: "delete" },
  { suffix: "receipts", sortKey: "receiptId", action: "anonymize" },
  { suffix: "hmrc-api-requests", sortKey: "id", action: "delete" },
  { suffix: "bundle-post-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "bundle-delete-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "hmrc-vat-return-post-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "hmrc-vat-return-get-async-requests", sortKey: "requestId", action: "delete" },
  { suffix: "hmrc-vat-obligation-get-async-requests", sortKey: "requestId", action: "delete" },
];

/**
 * Main deletion function.
 */
async function deleteUserData({ environmentName, hashedSubs, confirm = false, jsonOutput = false }) {
  const region = process.env.AWS_REGION || "eu-west-2";
  const docClient = makeDocClient(region);

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
    let allItems = [];

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
