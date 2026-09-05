// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/migrations/006-drop-sandbox-qualifier.js
// Post-deploy migration: closes the tail left by 005. Picks up any qualifiers.sandbox
// writes the old code made between 005 running and the deploy landing, then removes
// the old field. qualifiers.synthetic is only set if it isn't already there, so a value
// 005 or the new code already wrote is never overwritten.
// Honours MIGRATION_DRY_RUN=true: counts matches and logs the first ten keys, writes nothing.

export const phase = "post-deploy";
export const description = "Backfill qualifiers.synthetic from qualifiers.sandbox and drop qualifiers.sandbox";

async function getDocClient() {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = await import("@aws-sdk/lib-dynamodb");

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });
  const docClient = DynamoDBDocumentClient.from(client);
  return { docClient, ScanCommand, UpdateCommand };
}

export async function up({ envName, tableName }) {
  const dryRun = process.env.MIGRATION_DRY_RUN === "true";
  const { docClient, ScanCommand, UpdateCommand } = await getDocClient();
  const bundlesTable = tableName || process.env.BUNDLE_DYNAMODB_TABLE_NAME || `${envName}-env-bundles`;

  console.log(`    Scanning ${bundlesTable}...${dryRun ? " (dry run)" : ""}`);

  let matched = 0;
  let updated = 0;
  const sampleKeys = [];
  let lastKey = undefined;

  do {
    const response = await docClient.send(
      new ScanCommand({
        TableName: bundlesTable,
        FilterExpression: "attribute_exists(qualifiers.sandbox) AND NOT begins_with(hashedSub, :system)",
        ExpressionAttributeValues: { ":system": "system#" },
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of response.Items || []) {
      matched++;
      const key = { hashedSub: item.hashedSub, bundleId: item.bundleId };
      if (sampleKeys.length < 10) sampleKeys.push(key);

      if (dryRun) continue;

      await docClient.send(
        new UpdateCommand({
          TableName: bundlesTable,
          Key: key,
          UpdateExpression: "SET qualifiers.synthetic = if_not_exists(qualifiers.synthetic, :v) REMOVE qualifiers.sandbox",
          ExpressionAttributeValues: { ":v": item.qualifiers.sandbox },
          ConditionExpression: "attribute_exists(qualifiers.sandbox)",
        }),
      );
      updated++;
    }

    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  if (dryRun) {
    console.log(`    [DRY RUN] ${matched} item(s) matched, none written`);
    console.log(`    [DRY RUN] First ${sampleKeys.length} key(s): ${JSON.stringify(sampleKeys)}`);
  } else {
    console.log(`    ${bundlesTable}: ${updated} item(s) updated (${matched} matched)`);
  }
}
