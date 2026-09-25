// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbActivityChargeRepository.js

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

const logger = createLogger({ source: "app/data/dynamoDbActivityChargeRepository.js" });

// One item per (user, activity, subject): hashedSub is the partition key, chargeKey the sort
// key, so a user's charges sit under their own hashedSub without sharing a table with bundles
// or subscriptions, which carry a different item shape.
export function buildChargeKey(activityId, subjectKey) {
  return `charge#${activityId}#${subjectKey}`;
}

// Idempotent: Stripe retries a webhook delivery, and a second checkout.session.completed for
// the same activity/subject must not overwrite the first paid charge (or a later "used" one).
// Returns false, not an error, when the item already exists.
export async function putActivityChargeIfAbsent(hashedSub, chargeKey, charge) {
  const tableName = getResourceName("ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME");
  logger.info({ message: `putActivityChargeIfAbsent [table: ${tableName}]`, hashedSub, chargeKey });

  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.PutCommand({
          TableName: tableName,
          Item: {
            ...charge,
            hashedSub,
            chargeKey,
            createdAt: new Date().toISOString(),
          },
          ConditionExpression: "attribute_not_exists(hashedSub)",
        }),
    );
    logger.info({ message: "Activity charge recorded", hashedSub, chargeKey });
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Activity charge already recorded", hashedSub, chargeKey });
      return false;
    }
    logger.error({ message: "Error recording activity charge", error: error.message, hashedSub, chargeKey });
    throw error;
  }
}

export async function getActivityCharge(hashedSub, chargeKey) {
  const tableName = getResourceName("ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME");

  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: tableName,
        Key: { hashedSub, chargeKey },
      }),
  );

  return result.Item || null;
}

// Conditional: only a charge in "paid" state moves to "used", so a second attempt at the same
// filing (or a retry racing the first) cannot spend an already-used charge a second time.
export async function markActivityChargeUsed(hashedSub, chargeKey) {
  const tableName = getResourceName("ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME");

  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { hashedSub, chargeKey },
          UpdateExpression: "SET #status = :used, usedAt = :usedAt",
          ConditionExpression: "#status = :paid",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":used": "used",
            ":paid": "paid",
            ":usedAt": new Date().toISOString(),
          },
        }),
    );
    logger.info({ message: "Activity charge marked used", hashedSub, chargeKey });
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Activity charge not in paid state, not marked used", hashedSub, chargeKey });
      return false;
    }
    logger.error({ message: "Error marking activity charge used", error: error.message, hashedSub, chargeKey });
    throw error;
  }
}
