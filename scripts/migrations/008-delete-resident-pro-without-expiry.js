// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/migrations/008-delete-resident-pro-without-expiry.js
// Post-deploy migration: deletes the resident-pro rows on prod that carry no expiry and so are
// absent from the sparse bundleId-expiry-index. Their keys are listed in
// 008-resident-pro-without-expiry.keys.json, produced by 008-resident-pro-without-expiry.sql run
// on the prod analytics lake (workgroup prod-env-analytics, database prod_env_analytics). The
// delete is conditional on the row still having no expiry, so a row that has since been
// renewed or resubscribed is left alone. Other environments hold no such rows and are skipped.
// Honours MIGRATION_DRY_RUN=true: counts the keys, reads each row, writes nothing.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const phase = "post-deploy";
export const description = "Delete the prod resident-pro rows with no expiry, by the keys from the lake query";

const KEYS_FILE = join(dirname(fileURLToPath(import.meta.url)), "008-resident-pro-without-expiry.keys.json");

async function getDocClient() {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = await import("@aws-sdk/lib-dynamodb");

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });
  const docClient = DynamoDBDocumentClient.from(client);
  return { docClient, GetCommand, DeleteCommand };
}

export async function up({ envName, tableName }) {
  if (envName !== "prod") {
    console.log(`    Skipped: the keys are prod rows and this is ${envName}`);
    return;
  }

  const dryRun = process.env.MIGRATION_DRY_RUN === "true";
  const { docClient, GetCommand, DeleteCommand } = await getDocClient();
  const bundlesTable = tableName || process.env.BUNDLE_DYNAMODB_TABLE_NAME || `${envName}-env-bundles`;
  const { bundleId, hashedSubs } = JSON.parse(await readFile(KEYS_FILE, "utf-8"));

  console.log(`    ${hashedSubs.length} ${bundleId} key(s) from the lake query...${dryRun ? " (dry run)" : ""}`);

  const counts = { deleted: 0, absent: 0, hasExpiry: 0 };
  for (const hashedSub of hashedSubs) {
    const key = { hashedSub, bundleId };
    const { Item } = await docClient.send(new GetCommand({ TableName: bundlesTable, Key: key }));
    if (!Item) {
      counts.absent++;
      continue;
    }
    if (Item.expiry) {
      counts.hasExpiry++;
      continue;
    }
    if (dryRun) {
      counts.deleted++;
      continue;
    }
    try {
      await docClient.send(new DeleteCommand({ TableName: bundlesTable, Key: key, ConditionExpression: "attribute_not_exists(expiry)" }));
      counts.deleted++;
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
      counts.hasExpiry++;
    }
  }

  const verb = dryRun ? "[DRY RUN] would delete" : "deleted";
  console.log(
    `    ${bundlesTable}: ${verb} ${counts.deleted}, ${counts.absent} already absent, ${counts.hasExpiry} now carry an expiry and were left`,
  );
}
