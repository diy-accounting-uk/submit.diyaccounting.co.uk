// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/migrations/005-copy-sandbox-qualifier-to-synthetic.js
// Pre-deploy migration: copies qualifiers.sandbox onto qualifiers.synthetic so the
// deploy can start reading the new field name. Leaves qualifiers.sandbox in place —
// the code running until the deploy lands still reads it.
// Idempotent: skips items that already have qualifiers.synthetic.
// Honours MIGRATION_DRY_RUN=true: counts matches and logs the first ten keys, writes nothing.

export const phase = "pre-deploy";
export const description = "Copy qualifiers.sandbox to qualifiers.synthetic on bundle records";

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
        FilterExpression:
          "attribute_exists(qualifiers.sandbox) AND attribute_not_exists(qualifiers.synthetic) AND NOT begins_with(hashedSub, :system)",
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
          UpdateExpression: "SET qualifiers.synthetic = :v",
          ExpressionAttributeValues: { ":v": item.qualifiers.sandbox },
          ConditionExpression: "attribute_not_exists(qualifiers.synthetic)",
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
