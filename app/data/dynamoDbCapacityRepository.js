// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCapacityRepository.js

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand } from "../lib/dynamoDbClient.js";

const logger = createLogger({ source: "app/data/dynamoDbCapacityRepository.js" });

function getTableName() {
  const tableName = process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME;
  return tableName || "";
}

export async function incrementCounter(bundleId, cap) {
  logger.info({ message: `incrementCounter [table: ${getTableName()}]`, bundleId, cap });

  const tableName = getTableName();

  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { bundleId },
          UpdateExpression: "SET activeCount = if_not_exists(activeCount, :zero) + :inc",
          ConditionExpression: "(attribute_not_exists(activeCount) AND :cap > :zero) OR activeCount < :cap",
          ExpressionAttributeValues: { ":inc": 1, ":zero": 0, ":cap": cap },
        }),
    );
    logger.info({ message: "Counter incremented", bundleId });
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Cap reached, counter not incremented", bundleId, cap });
      return false;
    }
    logger.error({ message: "Error incrementing counter", error: error.message, bundleId });
    throw error;
  }
}

export async function decrementCounter(bundleId) {
  logger.info({ message: `decrementCounter [table: ${getTableName()}]`, bundleId });

  const tableName = getTableName();

  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { bundleId },
          UpdateExpression: "SET activeCount = activeCount - :dec",
          ConditionExpression: "attribute_exists(activeCount) AND activeCount > :zero",
          ExpressionAttributeValues: { ":dec": 1, ":zero": 0 },
        }),
    );
    logger.info({ message: "Counter decremented", bundleId });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Counter already at zero, skipping decrement", bundleId });
      return;
    }
    logger.error({ message: "Error decrementing counter", error: error.message, bundleId });
    throw error;
  }
}

export async function getCounter(bundleId) {
  logger.info({ message: `getCounter [table: ${getTableName()}]`, bundleId });

  const tableName = getTableName();

  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: tableName,
        Key: { bundleId },
      }),
  );

  return result.Item || null;
}

export async function getCounters(bundleIds) {
  if (!bundleIds || bundleIds.length === 0) return {};

  logger.info({ message: `getCounters [table: ${getTableName()}]`, count: bundleIds.length });

  const tableName = getTableName();

  const result = await executeDynamoDbCommand(
    (module) =>
      new module.BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: bundleIds.map((bundleId) => ({ bundleId })),
          },
        },
      }),
  );

  const items = (result.Responses && result.Responses[tableName]) || [];
  const counters = {};
  for (const item of items) {
    counters[item.bundleId] = item;
  }
  return counters;
}

export async function putCounter(bundleId, activeCount) {
  logger.info({ message: `putCounter [table: ${getTableName()}]`, bundleId, activeCount });

  const tableName = getTableName();

  await executeDynamoDbCommand(
    (module) =>
      new module.PutCommand({
        TableName: tableName,
        Item: {
          bundleId,
          activeCount,
          reconciledAt: new Date().toISOString(),
        },
      }),
  );

  logger.info({ message: "Counter written", bundleId, activeCount });
}
