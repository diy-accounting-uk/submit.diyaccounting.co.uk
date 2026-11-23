// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-132 Enable DynamoDB PITR on deploy
// - **Use when:** a DynamoDB table needs point-in-time recovery turned on idempotently as part of a stack deploy.
// - **Does:** ensurePitr.mjs is a CloudFormation custom resource that calls DescribeTable and UpdateContinuousBackups to turn on PITR for a table, idempotently, at deploy time. With Wait "TableActive" it instead waits until a new table without PITR is ACTIVE, so its TTL, index and stream calls do not reach a CREATING table.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/infra/ensurePitr.mjs:onEvent`; `app/functions/infra/ensurePitr.mjs:isComplete`
// - **Files:** app/functions/infra/ensurePitr.mjs, app/unit-tests/functions/ensurePitr.test.js
// - **Keywords:** pitr, point-in-time recovery, dynamodb backup, custom resource, continuous backups, table active, creating
// - **Related:** OPS-113
// @end-capability

// app/functions/infra/ensurePitr.mjs
//
// Custom resource handler pair for a CDK Provider that turns on DynamoDB point-in-time recovery.
//
// CreateTable's default backups take a short but unpredictable time to finish enabling on a brand
// new table. Calling UpdateContinuousBackups before that finishes fails with
// ContinuousBackupsUnavailableException ("Backups are being enabled for the table"). onEvent makes
// one immediate attempt (fast path for tables whose backups are already ready) and swallows that
// one exception; isComplete then polls DescribeContinuousBackups, retrying the update once
// ContinuousBackupsStatus turns ENABLED, until PointInTimeRecoveryStatus itself reports ENABLED.
//
// A resource with the property Wait "TableActive" is the wait of a table without PITR: onEvent
// changes nothing and isComplete polls DescribeTable until TableStatus is ACTIVE.

import {
  DynamoDBClient,
  UpdateContinuousBackupsCommand,
  DescribeContinuousBackupsCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

const TABLE_ACTIVE_WAIT = "TableActive";

let dynamoDbClient = null;

function getDynamoDbClient() {
  if (!dynamoDbClient) {
    dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return dynamoDbClient;
}

function physicalResourceIdFor(tableName) {
  return `${tableName}-pitr`;
}

async function enablePointInTimeRecovery(tableName) {
  const client = getDynamoDbClient();
  try {
    await client.send(
      new UpdateContinuousBackupsCommand({
        TableName: tableName,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      }),
    );
  } catch (error) {
    if (error.name !== "ContinuousBackupsUnavailableException") {
      throw error;
    }
  }
}

export async function onEvent(event) {
  const tableName = event.ResourceProperties.TableName;
  const waitsForActive = event.ResourceProperties.Wait === TABLE_ACTIVE_WAIT;

  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: event.PhysicalResourceId || (waitsForActive ? `${tableName}-active` : physicalResourceIdFor(tableName)) };
  }

  if (waitsForActive) {
    return { PhysicalResourceId: `${tableName}-active`, Data: { TableName: tableName } };
  }

  await enablePointInTimeRecovery(tableName);

  return { PhysicalResourceId: physicalResourceIdFor(tableName), Data: { TableName: tableName } };
}

export async function isComplete(event) {
  const tableName = event.ResourceProperties.TableName;

  if (event.RequestType === "Delete") {
    return { IsComplete: true };
  }

  const client = getDynamoDbClient();
  if (event.ResourceProperties.Wait === TABLE_ACTIVE_WAIT) {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return { IsComplete: Table?.TableStatus === "ACTIVE" };
  }

  const { ContinuousBackupsDescription } = await client.send(new DescribeContinuousBackupsCommand({ TableName: tableName }));

  const pointInTimeRecoveryStatus = ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus;
  if (pointInTimeRecoveryStatus === "ENABLED") {
    return { IsComplete: true };
  }

  if (ContinuousBackupsDescription?.ContinuousBackupsStatus === "ENABLED") {
    // Backups have finished enabling since the last attempt (onEvent's, or a previous poll's) and
    // PITR is still off, so DynamoDB will now accept the update - retry it.
    await enablePointInTimeRecovery(tableName);
  }

  return { IsComplete: false };
}
