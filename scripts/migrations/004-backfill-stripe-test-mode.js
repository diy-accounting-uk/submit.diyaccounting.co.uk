// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-41 Backfill the Stripe test-mode qualifier
// - **Use when:** bundles created by a Stripe subscription need their own stripeTestMode qualifier separated from sandbox.
// - **Does:** The 004-backfill-stripe-test-mode.js pre-deploy migration copies qualifiers.sandbox to a new qualifiers.stripeTestMode field. It applies this to every bundle a Stripe subscription created, is idempotent, and honours a MIGRATION_DRY_RUN flag.
// - **Run:** `ENVIRONMENT_NAME=<ci|prod> node scripts/migrations/runner.js --phase pre-deploy`; `MIGRATION_DRY_RUN=true ENVIRONMENT_NAME=<ci|prod> node scripts/migrations/runner.js --phase pre-deploy`; `gh workflow run run-migrations.yml -f environment-name=<ci|prod> -f phase=pre-deploy`
// - **Entry:** `scripts/migrations/004-backfill-stripe-test-mode.js`; `scripts/migrations/runner.js`
// - **Files:** scripts/migrations/004-backfill-stripe-test-mode.js, app/unit-tests/migrations/004-backfill-stripe-test-mode.test.js
// - **Keywords:** migration, stripe test mode, backfill, qualifier, sandbox, dry run, pre-deploy
// - **Related:** BILL-40
// @end-capability

// scripts/migrations/004-backfill-stripe-test-mode.js
// Pre-deploy migration: gives the Stripe test-mode flag its own qualifier.
// Copies qualifiers.sandbox to qualifiers.stripeTestMode on every bundle a Stripe
// subscription created. A record with no stripeSubscriptionId was never a subscription,
// so the billing portal never reads it and this migration leaves it alone.
// Idempotent: skips items that already have qualifiers.stripeTestMode.
// Honours MIGRATION_DRY_RUN=true: counts matches and logs the first ten keys, writes nothing.

export const phase = "pre-deploy";
export const description = "Backfill qualifiers.stripeTestMode from qualifiers.sandbox on Stripe subscription bundles";

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
          "attribute_exists(stripeSubscriptionId) AND attribute_exists(qualifiers.sandbox) AND attribute_not_exists(qualifiers.stripeTestMode) AND NOT begins_with(hashedSub, :system)",
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
          UpdateExpression: "SET qualifiers.stripeTestMode = :v",
          ExpressionAttributeValues: { ":v": item.qualifiers.sandbox },
          ConditionExpression: "attribute_not_exists(qualifiers.stripeTestMode)",
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
