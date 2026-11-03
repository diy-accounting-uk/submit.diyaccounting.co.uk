// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/migrations/007-resident-to-resident-pro.js
// Post-deploy migration: the resident bundle is folded into resident-pro. Every resident row is
// written again as resident-pro with 100 tokens and the resident row is deleted. An account that
// already holds resident-pro keeps the later expiry. A resident-pro row still carrying the
// unlimited grant of the old practice licence then gets 100 tokens, because the practice licence
// moved to resident-tax-agent. Rows are found through the bundleId-expiry-index (KEYS_ONLY,
// sparse on expiry), never by a table scan.
// Honours MIGRATION_DRY_RUN=true: counts matches and logs the first ten keys, writes nothing.

export const phase = "post-deploy";
export const description = "Move resident rows to resident-pro and give resident-pro the 100-token monthly grant";

const OLD_BUNDLE_ID = "resident";
const NEW_BUNDLE_ID = "resident-pro";
const INDEX_NAME = "bundleId-expiry-index";
const TOKENS_GRANTED = 100;

async function getDocClient() {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } =
    await import("@aws-sdk/lib-dynamodb");

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });
  const docClient = DynamoDBDocumentClient.from(client);
  return { docClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand };
}

function oneMonthOn() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

async function keysForBundle({ docClient, QueryCommand }, tableName, bundleId) {
  const keys = [];
  let lastKey;
  do {
    const response = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: INDEX_NAME,
        KeyConditionExpression: "bundleId = :bundleId",
        ExpressionAttributeValues: { ":bundleId": bundleId },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of response.Items || []) keys.push({ hashedSub: item.hashedSub, bundleId: item.bundleId });
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  return keys;
}

async function moveResidentRow(client, tableName, key) {
  const { docClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand } = client;
  const { Item: old } = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  if (!old) return "gone";

  const newKey = { hashedSub: key.hashedSub, bundleId: NEW_BUNDLE_ID };
  const { Item: existing } = await docClient.send(new GetCommand({ TableName: tableName, Key: newKey }));

  if (!existing) {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...old,
          bundleId: NEW_BUNDLE_ID,
          tokensGranted: TOKENS_GRANTED,
          tokensConsumed: 0,
          tokenResetAt: oneMonthOn(),
        },
      }),
    );
    return "moved";
  }

  if (old.expiry && (!existing.expiry || old.expiry > existing.expiry)) {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: newKey,
        UpdateExpression: "SET expiry = :expiry, #ttl = :ttl, ttl_datestamp = :ttlDatestamp",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ":expiry": old.expiry, ":ttl": old.ttl, ":ttlDatestamp": old.ttl_datestamp },
      }),
    );
  }
  return "merged";
}

export async function up({ envName, tableName }) {
  const dryRun = process.env.MIGRATION_DRY_RUN === "true";
  const client = await getDocClient();
  const { docClient, GetCommand, UpdateCommand, DeleteCommand } = client;
  const bundlesTable = tableName || process.env.BUNDLE_DYNAMODB_TABLE_NAME || `${envName}-env-bundles`;

  console.log(`    Querying ${INDEX_NAME} on ${bundlesTable}...${dryRun ? " (dry run)" : ""}`);

  const residentKeys = await keysForBundle(client, bundlesTable, OLD_BUNDLE_ID);

  if (dryRun) {
    console.log(`    [DRY RUN] ${residentKeys.length} ${OLD_BUNDLE_ID} row(s) would move to ${NEW_BUNDLE_ID}`);
    console.log(`    [DRY RUN] First ${Math.min(10, residentKeys.length)} key(s): ${JSON.stringify(residentKeys.slice(0, 10))}`);
  } else {
    const outcomes = { moved: 0, merged: 0, gone: 0 };
    for (const key of residentKeys) {
      const outcome = await moveResidentRow(client, bundlesTable, key);
      outcomes[outcome]++;
      if (outcome !== "gone") await docClient.send(new DeleteCommand({ TableName: bundlesTable, Key: key }));
    }
    console.log(
      `    ${bundlesTable}: ${outcomes.moved} moved, ${outcomes.merged} merged into an existing ${NEW_BUNDLE_ID} row, ${outcomes.gone} already gone`,
    );
  }

  const proKeys = await keysForBundle(client, bundlesTable, NEW_BUNDLE_ID);
  let unlimited = 0;
  for (const key of proKeys) {
    const { Item } = await docClient.send(new GetCommand({ TableName: bundlesTable, Key: key }));
    if (Item?.tokensGranted !== "unlimited") continue;
    unlimited++;
    if (dryRun) continue;
    await docClient.send(
      new UpdateCommand({
        TableName: bundlesTable,
        Key: key,
        UpdateExpression: "SET tokensGranted = :granted, tokensConsumed = :zero, tokenResetAt = :resetAt",
        ConditionExpression: "tokensGranted = :unlimited",
        ExpressionAttributeValues: { ":granted": TOKENS_GRANTED, ":zero": 0, ":resetAt": oneMonthOn(), ":unlimited": "unlimited" },
      }),
    );
  }
  console.log(
    `    ${dryRun ? "[DRY RUN] " : ""}${unlimited} ${NEW_BUNDLE_ID} row(s) with an unlimited grant${dryRun ? "" : " set to 100 tokens"}`,
  );
}
