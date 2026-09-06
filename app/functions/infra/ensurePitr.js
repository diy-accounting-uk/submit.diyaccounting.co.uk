// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/infra/ensurePitr.js
//
// Custom resource handler pair for a CDK Provider that turns on DynamoDB point-in-time recovery.
//
// CreateTable's default backups take a short but unpredictable time to finish enabling on a brand
// new table. Calling UpdateContinuousBackups before that finishes fails with
// ContinuousBackupsUnavailableException ("Backups are being enabled for the table"). onEvent makes
// one immediate attempt (fast path for tables whose backups are already ready) and swallows that
// one exception; isComplete then polls DescribeContinuousBackups, retrying the update once
// ContinuousBackupsStatus turns ENABLED, until PointInTimeRecoveryStatus itself reports ENABLED.

import { DynamoDBClient, UpdateContinuousBackupsCommand, DescribeContinuousBackupsCommand } from "@aws-sdk/client-dynamodb";

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

  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: event.PhysicalResourceId || physicalResourceIdFor(tableName) };
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
