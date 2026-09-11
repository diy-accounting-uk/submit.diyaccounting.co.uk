// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbSubscriptionRepository.js

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

const logger = createLogger({ source: "app/data/dynamoDbSubscriptionRepository.js" });

export async function putSubscription(subscription) {
  logger.info({ message: `putSubscription [table: ${getResourceName("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME")}]` });

  const tableName = getResourceName("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME");

  await executeDynamoDbCommand(
    (module) =>
      new module.PutCommand({
        TableName: tableName,
        Item: {
          ...subscription,
          updatedAt: new Date().toISOString(),
        },
      }),
  );

  logger.info({ message: "Subscription stored", pk: subscription.pk });
}

export async function getSubscription(pk) {
  logger.info({ message: `getSubscription [table: ${getResourceName("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME")}]`, pk });

  const tableName = getResourceName("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME");

  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: tableName,
        Key: { pk },
      }),
  );

  return result.Item || null;
}

export async function updateSubscription(pk, updates) {
  logger.info({ message: `updateSubscription [table: ${getResourceName("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME")}]`, pk });

  const tableName = getResourceName("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME");

  const expressions = [];
  const values = {};
  const names = {};

  for (const [key, value] of Object.entries(updates)) {
    const attrName = `#${key}`;
    const attrValue = `:${key}`;
    expressions.push(`${attrName} = ${attrValue}`);
    names[attrName] = key;
    values[attrValue] = value;
  }

  expressions.push("#updatedAt = :updatedAt");
  names["#updatedAt"] = "updatedAt";
  values[":updatedAt"] = new Date().toISOString();

  await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: tableName,
        Key: { pk },
        UpdateExpression: "SET " + expressions.join(", "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
  );

  logger.info({ message: "Subscription updated", pk });
}
