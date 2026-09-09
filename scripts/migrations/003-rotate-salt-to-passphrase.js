// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/migrations/003-rotate-salt-to-passphrase.js
// Post-deploy migration: Generates an 8-word passphrase salt (v2), adds it to the registry,
// re-keys all items from v1 to v2, and updates the canary.
//
// The passphrase is printed to stdout for the operator to record physically.
// Idempotent: if v2 already exists and is current, re-keying skips already-migrated items.

export const phase = "post-deploy";
export const description = "Rotate salt from v1 (random) to v2 (8-word passphrase) and re-key all items";

async function getDocClient() {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand, ScanCommand } = await import("@aws-sdk/lib-dynamodb");

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });
  const docClient = DynamoDBDocumentClient.from(client);
  return { docClient, QueryCommand, PutCommand, DeleteCommand, ScanCommand };
}

async function rekeyTable(
  docClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
  tableName,
  pkName,
  skName,
  oldSalt,
  newSalt,
  userSubs,
) {
  const crypto = await import("node:crypto");
  let rekeyed = 0;

  for (const sub of userSubs) {
    const oldHash = crypto.createHmac("sha256", oldSalt).update(sub).digest("hex");
    const newHash = crypto.createHmac("sha256", newSalt).update(sub).digest("hex");

    if (oldHash === newHash) continue; // Same salt, skip

    // Query items at old hash
    const response = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: `${pkName} = :pk`,
        ExpressionAttributeValues: { ":pk": oldHash },
      }),
    );

    for (const item of response.Items || []) {
      // Write to new hash
      const newItem = { ...item, [pkName]: newHash, saltVersion: "v2" };
      await docClient.send(new PutCommand({ TableName: tableName, Item: newItem }));

      // Delete from old hash
      const key = { [pkName]: oldHash };
      if (skName) key[skName] = item[skName];
      await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));

      rekeyed++;
    }
  }

  return rekeyed;
}

export async function up({ envName }) {
  const crypto = await import("node:crypto");

  // 1. Generate 8-word passphrase
  const { generatePassphrase } = await import("../../app/lib/passphrase.js");
  const passphrase = generatePassphrase(8);

  console.log();
  console.log("    ╔══════════════════════════════════════════════════════════════╗");
  console.log("    ║  NEW SALT PASSPHRASE — RECORD THIS SECURELY                ║");
  console.log("    ╠══════════════════════════════════════════════════════════════╣");
  console.log(`    ║  ${passphrase.padEnd(60)}║`);
  console.log("    ╠══════════════════════════════════════════════════════════════╣");
  console.log("    ║  1. Print on a card, store in fire safe                     ║");
  console.log("    ║  2. Store in password manager                               ║");
  console.log("    ║  3. DELETE THIS WORKFLOW RUN from Actions history           ║");
  console.log("    ╚══════════════════════════════════════════════════════════════╝");
  console.log();

  // 2. Update salt registry in Secrets Manager
  const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } = await import("@aws-sdk/client-secrets-manager");
  const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  const secretName = `${envName}/submit/user-sub-hash-salt`;

  const secretResponse = await smClient.send(new GetSecretValueCommand({ SecretId: secretName }));
  const registry = JSON.parse(secretResponse.SecretString);

  if (registry.versions.v2 && registry.current === "v2") {
    console.log("    Registry already has v2 as current — checking for un-migrated items");
  } else {
    registry.versions.v2 = passphrase;
    registry.current = "v2";
    await smClient.send(new UpdateSecretCommand({ SecretId: secretName, SecretString: JSON.stringify(registry) }));
    console.log("    Registry updated: added v2, set current=v2");
  }

  const oldSalt = registry.versions.v1;
  const newSalt = registry.versions.v2;

  // 3. Enumerate users from Cognito
  const { CognitoIdentityProviderClient, ListUsersCommand } = await import("@aws-sdk/client-cognito-identity-provider");

  // Get user pool ID from SSM or env
  let userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    try {
      const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
      const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "eu-west-2" });
      const param = await ssmClient.send(new GetParameterCommand({ Name: `/${envName}/submit/cognito-user-pool-id` }));
      userPoolId = param.Parameter.Value;
    } catch {
      console.log("    WARNING: Could not resolve Cognito user pool ID — skipping re-key");
      console.log("    Set COGNITO_USER_POOL_ID env var or ensure SSM parameter exists");
      return;
    }
  }

  const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "eu-west-2" });
  const userSubs = [];
  let paginationToken = undefined;

  do {
    const listResponse = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        PaginationToken: paginationToken,
        Limit: 60,
      }),
    );

    for (const user of listResponse.Users || []) {
      const subAttr = user.Attributes?.find((a) => a.Name === "sub");
      if (subAttr) {
        userSubs.push(subAttr.Value);
      }
    }

    paginationToken = listResponse.PaginationToken;
  } while (paginationToken);

  console.log(`    Found ${userSubs.length} Cognito users to re-key`);

  // 4. Re-key all tables
  const { docClient, QueryCommand, PutCommand, DeleteCommand, ScanCommand } = await getDocClient();

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

  let totalRekeyed = 0;
  for (const [envVar, fallback, pkName, skName] of tables) {
    const tableName = process.env[envVar] || fallback;
    try {
      const count = await rekeyTable(
        docClient,
        QueryCommand,
        PutCommand,
        DeleteCommand,
        ScanCommand,
        tableName,
        pkName,
        skName,
        oldSalt,
        newSalt,
        userSubs,
      );
      console.log(`    ${tableName}: ${count} items re-keyed`);
      totalRekeyed += count;
    } catch (error) {
      if (error.name === "ResourceNotFoundException") {
        console.log(`    ${tableName}: table does not exist, skipping`);
      } else {
        throw error;
      }
    }
  }

  // 5. Update salt health canary
  const bundlesTable = process.env.BUNDLE_DYNAMODB_TABLE_NAME || `${envName}-env-bundles`;
  const canaryInput = "salt-canary-verification-string";
  const expectedHash = crypto.createHmac("sha256", newSalt).update(canaryInput).digest("hex");

  await docClient.send(
    new PutCommand({
      TableName: bundlesTable,
      Item: {
        hashedSub: "system#canary",
        bundleId: "salt-health-check",
        expectedHash,
        canaryInput,
        saltVersion: "v2",
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  console.log(`    Salt health canary updated for v2`);
  console.log(`    Total items re-keyed: ${totalRekeyed}`);
}
