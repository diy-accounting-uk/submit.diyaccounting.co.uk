// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/migrations/009-delete-resident-pro-empty-expiry.js
// Post-deploy migration: deletes the resident-pro rows on prod whose expiry attribute is present
// but empty (an empty string or a NULL-typed value), or absent. Such rows are absent from the sparse
// bundleId-expiry-index. At run time it runs 008-resident-pro-without-expiry.sql on the prod
// analytics lake (workgroup prod-env-analytics, database prod_env_analytics) and reads the keys
// from the result, so no key list is committed.
// The delete is conditional on the expiry still being absent or empty, so a row that has since been
// renewed or resubscribed is left alone. Other environments hold no such rows and are skipped.
// Honours MIGRATION_DRY_RUN=true: runs the query, reads each row, writes nothing. The dry run and
// the real run share one test (hasEmptyExpiry), so the dry run count is the real run count.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const phase = "post-deploy";
export const description = "Delete the prod resident-pro rows with an empty or absent expiry, by the keys from the lake query";

const QUERY_FILE = join(dirname(fileURLToPath(import.meta.url)), "008-resident-pro-without-expiry.sql");
const BUNDLE_ID = "resident-pro";
const WORKGROUP = "prod-env-analytics";
const DATABASE = "prod_env_analytics";
const QUERY_POLL_MS = 2000;
const QUERY_TIMEOUT_MS = 5 * 60 * 1000;

const EMPTY_EXPIRY_CONDITION = "attribute_not_exists(expiry) OR attribute_type(expiry, :nullType) OR expiry = :empty";

export function hasEmptyExpiry(item) {
  return item.expiry === undefined || item.expiry === null || item.expiry === "";
}

async function getDocClient() {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = await import("@aws-sdk/lib-dynamodb");

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });
  const docClient = DynamoDBDocumentClient.from(client);
  return { docClient, GetCommand, DeleteCommand };
}

async function getAthenaClient() {
  const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } =
    await import("@aws-sdk/client-athena");
  const athena = new AthenaClient({ region: process.env.AWS_REGION || "eu-west-2" });
  return { athena, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand };
}

async function hashedSubsFromLake() {
  const { athena, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = await getAthenaClient();
  const started = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: await readFile(QUERY_FILE, "utf-8"),
      WorkGroup: WORKGROUP,
      QueryExecutionContext: { Database: DATABASE },
    }),
  );
  const queryExecutionId = started.QueryExecutionId;
  const deadline = Date.now() + QUERY_TIMEOUT_MS;
  for (;;) {
    const { QueryExecution } = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }));
    const state = QueryExecution?.Status?.State;
    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`Athena query ${queryExecutionId} ${state}: ${QueryExecution?.Status?.StateChangeReason ?? ""}`);
    }
    if (Date.now() > deadline) throw new Error(`Athena query ${queryExecutionId} timed out`);
    await new Promise((resolve) => setTimeout(resolve, QUERY_POLL_MS));
  }

  const rows = [];
  let nextToken;
  do {
    const page = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId, NextToken: nextToken }));
    rows.push(...(page.ResultSet?.Rows ?? []));
    nextToken = page.NextToken;
  } while (nextToken);

  const hashedSubs = rows.slice(1).map((row) => row.Data?.[0]?.VarCharValue);
  if (hashedSubs.some((hashedSub) => !hashedSub)) throw new Error(`Athena query ${queryExecutionId} returned a row with no hashed_sub`);
  console.log(`    Athena query ${queryExecutionId} returned ${hashedSubs.length} key(s)`);
  return hashedSubs;
}

export async function up({ envName, tableName }) {
  if (envName !== "prod") {
    console.log(`    Skipped: the keys are prod rows and this is ${envName}`);
    return;
  }

  const dryRun = process.env.MIGRATION_DRY_RUN === "true";
  const { docClient, GetCommand, DeleteCommand } = await getDocClient();
  const bundlesTable = tableName || process.env.BUNDLE_DYNAMODB_TABLE_NAME || `${envName}-env-bundles`;
  const bundleId = BUNDLE_ID;
  const hashedSubs = await hashedSubsFromLake();

  console.log(`    ${hashedSubs.length} ${bundleId} key(s) from the lake query${dryRun ? " (dry run)" : ""}`);

  const counts = { deleted: 0, absent: 0, hasExpiry: 0 };
  for (const hashedSub of hashedSubs) {
    const key = { hashedSub, bundleId };
    const { Item } = await docClient.send(new GetCommand({ TableName: bundlesTable, Key: key }));
    if (!Item) {
      counts.absent++;
      continue;
    }
    if (!hasEmptyExpiry(Item)) {
      counts.hasExpiry++;
      continue;
    }
    if (dryRun) {
      counts.deleted++;
      continue;
    }
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: bundlesTable,
          Key: key,
          ConditionExpression: EMPTY_EXPIRY_CONDITION,
          ExpressionAttributeValues: { ":nullType": "NULL", ":empty": "" },
        }),
      );
      counts.deleted++;
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
      counts.hasExpiry++;
    }
  }

  const verb = dryRun ? "[DRY RUN] would delete" : "deleted";
  console.log(
    `    ${bundlesTable}: ${verb} ${counts.deleted}, ${counts.absent} already absent, ${counts.hasExpiry} carry an expiry and were left`,
  );
}
