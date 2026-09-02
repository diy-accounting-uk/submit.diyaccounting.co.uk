#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Export all data for a specific user (GDPR Right of Access / Data Portability)
 *
 * Queries all 8 DynamoDB tables (`<environment-name>-env-<table>`) by hashedSub partition key.
 * Output is in JSON format suitable for providing to the user.
 *
 * Usage:
 *   node scripts/export-user-data.js <environment-name> --user-sub <sub>
 *   node scripts/export-user-data.js <environment-name> --hashed-sub <hash>
 *
 * Environment variables:
 *   AWS_REGION             AWS region (default: eu-west-2)
 *   USER_SUB_HASH_SALT     Override salt registry JSON (local dev); otherwise the salt is
 *                          read from Secrets Manager for <environment-name>
 *   OUTPUT_DIR             Output directory for export file (default: current directory)
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import path from "path";

// Create DynamoDB Document Client
function makeDocClient(region) {
  const client = new DynamoDBClient({ region: region || "eu-west-2" });
  return DynamoDBDocumentClient.from(client);
}

/**
 * Query a DynamoDB table by hashedSub partition key.
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
 * Compute all hashedSub variants for a user sub using multi-version salt.
 */
async function computeAllHashedSubs(userSub) {
  const { initializeSalt, hashSub, hashSubWithVersion, getPreviousVersions } = await import("../app/services/subHasher.js");
  await initializeSalt();

  const hashes = [hashSub(userSub)]; // current version
  for (const version of getPreviousVersions()) {
    hashes.push(hashSubWithVersion(userSub, version));
  }
  return [...new Set(hashes)];
}

// All 8 DynamoDB tables with their suffixes
const TABLE_SUFFIXES = [
  "bundles",
  "receipts",
  "hmrc-api-requests",
  "bundle-post-async-requests",
  "bundle-delete-async-requests",
  "hmrc-vat-return-post-async-requests",
  "hmrc-vat-return-get-async-requests",
  "hmrc-vat-obligation-get-async-requests",
];

/**
 * Export user data from all tables.
 */
async function exportUserData(environmentName, hashedSubs) {
  const region = process.env.AWS_REGION || "eu-west-2";
  const docClient = makeDocClient(region);

  console.log(`Environment: ${environmentName}`);
  console.log(`Hashed subs: ${hashedSubs.join(", ")}`);
  console.log(`Region: ${region}`);
  console.log("");

  const userData = {
    exportDate: new Date().toISOString(),
    hashedSubs,
    environment: environmentName,
    data: {},
  };

  let totalItems = 0;

  for (const suffix of TABLE_SUFFIXES) {
    const tableName = `${environmentName}-env-${suffix}`;
    let allItems = [];

    for (const hashedSub of hashedSubs) {
      const items = await queryByHashedSub(docClient, tableName, hashedSub);
      allItems.push(...items);
    }

    const camelKey = suffix.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    userData.data[camelKey] = allItems;
    totalItems += allItems.length;
    console.log(`  ${suffix}: ${allItems.length} item(s)`);
  }

  // Write to file
  const outputDir = process.env.OUTPUT_DIR || ".";
  const outputFile = path.join(outputDir, `user-data-export-${Date.now()}.json`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, JSON.stringify(userData, null, 2));
  console.log("");
  console.log(`Export complete: ${outputFile}`);
  console.log(`Total items: ${totalItems}`);

  return outputFile;
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

if (!environmentName || (!userSub && !hashedSub)) {
  console.error("Usage:");
  console.error("  node scripts/export-user-data.js <environment-name> --user-sub <sub>");
  console.error("  node scripts/export-user-data.js <environment-name> --hashed-sub <hash>");
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
      console.log(`Computed ${hashedSubs.length} hash variant(s) for user sub`);
    }

    const file = await exportUserData(environmentName, hashedSubs);
    console.log("");
    console.log("Export successful");
    console.log(`File: ${file}`);
  } catch (error) {
    console.error(`Export failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
})();
