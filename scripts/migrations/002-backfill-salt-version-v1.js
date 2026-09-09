// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/migrations/002-backfill-salt-version-v1.js
// Post-deploy migration: Adds saltVersion="v1" to all existing DynamoDB items that lack it.
// Also writes a salt health canary item for tampering detection.
// Idempotent: skips items that already have saltVersion.

export const phase = "post-deploy";
export const description = "Backfill saltVersion=v1 on all existing items and write salt health canary";

async function getDocClient() {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } = await import("@aws-sdk/lib-dynamodb");

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });
  const docClient = DynamoDBDocumentClient.from(client);
  return { docClient, ScanCommand, UpdateCommand, PutCommand };
}

async function backfillTable(docClient, ScanCommand, UpdateCommand, tableName, pkName, skName) {
  console.log(`    Scanning ${tableName}...`);
  let updated = 0;
  let scanned = 0;
  let lastKey = undefined;

  do {
    const response = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "attribute_not_exists(saltVersion) AND NOT begins_with(#pk, :system)",
        ExpressionAttributeNames: { "#pk": pkName },
        ExpressionAttributeValues: { ":system": "system#" },
        ExclusiveStartKey: lastKey,
      }),
    );

    scanned += response.ScannedCount || 0;

    for (const item of response.Items || []) {
      const key = { [pkName]: item[pkName] };
      if (skName) {
        key[skName] = item[skName];
      }

      await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: key,
          UpdateExpression: "SET saltVersion = :v",
          ExpressionAttributeValues: { ":v": "v1" },
          ConditionExpression: "attribute_not_exists(saltVersion)",
        }),
      );
      updated++;
    }

    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  console.log(`    ${tableName}: ${updated} items updated (${scanned} scanned)`);
  return updated;
}

export async function up({ envName }) {
  const { docClient, ScanCommand, UpdateCommand, PutCommand } = await getDocClient();

  // Table configs: [envVarName, fallbackTableName, pkName, skName]
  const tables = [
    ["BUNDLE_DYNAMODB_TABLE_NAME", `${envName}-env-bundles`, "hashedSub", "bundleId"],
    ["RECEIPTS_DYNAMODB_TABLE_NAME", `${envName}-env-receipts`, "hashedSub", "receiptId"],
    ["HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", `${envName}-env-hmrc-api-requests`, "hashedSub", "id"],
    ["HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME", `${envName}-env-hmrc-vat-return-post-async-requests`, "hashedSub", "requestId"],
    ["HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME", `${envName}-env-hmrc-vat-return-get-async-requests`, "hashedSub", "requestId"],
    [
      "HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME",
      `${envName}-env-hmrc-vat-obligation-get-async-requests`,
      "hashedSub",
      "requestId",
    ],
  ];

  let totalUpdated = 0;
  for (const [envVar, fallback, pkName, skName] of tables) {
    const tableName = process.env[envVar] || fallback;
    try {
      totalUpdated += await backfillTable(docClient, ScanCommand, UpdateCommand, tableName, pkName, skName);
    } catch (error) {
      // Table might not exist in all environments
      if (error.name === "ResourceNotFoundException") {
        console.log(`    ${tableName}: table does not exist, skipping`);
      } else {
        throw error;
      }
    }
  }

  // Write salt health canary
  const bundlesTable = process.env.BUNDLE_DYNAMODB_TABLE_NAME || `${envName}-env-bundles`;
  const crypto = await import("node:crypto");

  // Read current salt to compute canary hash
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  const secretResponse = await smClient.send(new GetSecretValueCommand({ SecretId: `${envName}/submit/user-sub-hash-salt` }));
  const registry = JSON.parse(secretResponse.SecretString);
  const currentSalt = registry.versions[registry.current];
  const canaryInput = "salt-canary-verification-string";
  const expectedHash = crypto.createHmac("sha256", currentSalt).update(canaryInput).digest("hex");

  await docClient.send(
    new PutCommand({
      TableName: bundlesTable,
      Item: {
        hashedSub: "system#canary",
        bundleId: "salt-health-check",
        expectedHash,
        canaryInput,
        saltVersion: registry.current,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  console.log(`    Salt health canary written (version: ${registry.current})`);

  console.log(`    Total items backfilled: ${totalUpdated}`);
}
