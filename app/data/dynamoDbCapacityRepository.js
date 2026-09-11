// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCapacityRepository.js

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

const logger = createLogger({ source: "app/data/dynamoDbCapacityRepository.js" });

export async function incrementCounter(bundleId, cap) {
  logger.info({ message: `incrementCounter [table: ${getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME")}]`, bundleId, cap });

  const tableName = getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME");

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
  logger.info({ message: `decrementCounter [table: ${getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME")}]`, bundleId });

  const tableName = getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME");

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
  logger.info({ message: `getCounter [table: ${getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME")}]`, bundleId });

  const tableName = getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME");

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

  logger.info({ message: `getCounters [table: ${getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME")}]`, count: bundleIds.length });

  const tableName = getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME");

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
  logger.info({ message: `putCounter [table: ${getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME")}]`, bundleId, activeCount });

  const tableName = getResourceName("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME");

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
