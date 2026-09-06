// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/data/dynamoDbBundleRepository.js

import { createLogger } from "../lib/logger.js";
import { hashSub, hashSubWithVersion, getSaltVersion, getPreviousVersions } from "../services/subHasher.js";
import { getDynamoDbDocClient } from "../lib/dynamoDbClient.js";
import { calculateOneMonthTtl } from "../lib/dateUtils.js";

const logger = createLogger({ source: "app/data/dynamoDbBundleRepository.js" });

function getTableName() {
  const tableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;
  return tableName || "";
}

export async function putBundle(userId, bundle) {
  logger.info({ message: `putBundle [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Storing bundle", hashedSub, userId, bundle });

    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      ...bundle,
      hashedSub,
      saltVersion: getSaltVersion(),
      createdAt: now.toISOString(),
    };

    // Add expiry with millisecond precision timestamp (ISO format)
    if (bundle.expiry) {
      const expiryDate = new Date(bundle.expiry);
      item.expiry = expiryDate.toISOString();

      // Calculate TTL as 1 month after expiry
      const { ttl, ttl_datestamp } = calculateOneMonthTtl(expiryDate);
      item.ttl = ttl;
      item.ttl_datestamp = ttl_datestamp;
    } else {
      // A bundle with no expiry carries no expiry attribute at all: expiry is a key of the
      // bundleId-expiry-index and DynamoDB rejects an empty string in an index key, and a
      // missing key simply leaves the item out of that sparse index.
      delete item.expiry;
    }

    logger.info({
      message: "Storing bundle in DynamoDB as item",
      hashedSub,
      item,
    });
    await docClient.send(
      new module.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({
      message: "Bundle stored in DynamoDB as item",
      hashedSub,
      item,
    });
  } catch (error) {
    logger.error({
      message: `Error storing bundle in DynamoDB ${error.message}`,
      error,
      userId,
      bundle,
    });
    throw error;
  }
}

export async function putBundleByHashedSub(hashedSub, bundle) {
  logger.info({ message: `putBundleByHashedSub [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const now = new Date();
    const item = {
      ...bundle,
      hashedSub,
      saltVersion: getSaltVersion(),
      createdAt: now.toISOString(),
    };

    if (bundle.expiry) {
      const expiryDate = new Date(bundle.expiry);
      item.expiry = expiryDate.toISOString();
      const { ttl, ttl_datestamp } = calculateOneMonthTtl(expiryDate);
      item.ttl = ttl;
      item.ttl_datestamp = ttl_datestamp;
    } else {
      // A bundle with no expiry carries no expiry attribute at all: expiry is a key of the
      // bundleId-expiry-index and DynamoDB rejects an empty string in an index key, and a
      // missing key simply leaves the item out of that sparse index.
      delete item.expiry;
    }

    logger.info({ message: "Storing bundle in DynamoDB by hashedSub", hashedSub, item });
    await docClient.send(
      new module.PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    logger.info({ message: "Bundle stored in DynamoDB by hashedSub", hashedSub, item });
  } catch (error) {
    logger.error({
      message: `Error storing bundle by hashedSub in DynamoDB ${error.message}`,
      error,
      hashedSub,
      bundle,
    });
    throw error;
  }
}

export async function deleteBundle(userId, bundleId) {
  logger.info({ message: `deleteBundle [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Deleting bundle", hashedSub, userId, bundleId });
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    logger.info({
      message: "Deleting bundle from DynamoDB",
      hashedSub,
      bundleId,
    });
    await docClient.send(
      new module.DeleteCommand({
        TableName: tableName,
        Key: {
          hashedSub,
          bundleId,
        },
      }),
    );

    logger.info({
      message: "Bundle deleted from DynamoDB",
      hashedSub,
      bundleId,
    });
  } catch (error) {
    logger.error({
      message: "Error deleting bundle from DynamoDB",
      error: error.message,
      userId,
      bundleId,
    });
    throw error;
  }
}

export async function deleteAllBundles(userId) {
  logger.info({ message: `deleteAllBundles [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]` });

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Deleting all bundles for user", userId, hashedSub });
    const bundles = await getUserBundles(userId);

    // Delete bundles concurrently for better performance
    logger.info({
      message: "Deleting all bundles from DynamoDB",
      hashedSub,
      count: bundles.length,
    });
    const deleteResults = await Promise.allSettled(
      bundles.map(async (bundleId) => {
        await deleteBundle(userId, bundleId);
      }),
    );

    // Log any failures from individual deletions
    const failures = deleteResults.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn({
        message: "Some bundle deletions failed",
        hashedSub,
        failureCount: failures.length,
        totalCount: bundles.length,
      });
    }

    logger.info({
      message: "All bundles deleted from DynamoDB",
      hashedSub,
      count: bundles.length,
      successCount: bundles.length - failures.length,
    });
  } catch (error) {
    logger.error({
      message: "Error deleting all bundles from DynamoDB",
      error: error.message,
      userId,
    });
    throw error;
  }
}

export async function resetTokens(userId, bundleId, tokensGranted, nextResetAt) {
  logger.info({ message: `resetTokens [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId });

  try {
    const hashedSub = hashSub(userId);
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    await docClient.send(
      new module.UpdateCommand({
        TableName: tableName,
        Key: { hashedSub, bundleId },
        UpdateExpression: "SET tokensConsumed = :zero, tokensGranted = :granted, tokenResetAt = :resetAt, saltVersion = :saltVersion",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":granted": tokensGranted,
          ":resetAt": nextResetAt,
          ":saltVersion": getSaltVersion(),
        },
      }),
    );

    logger.info({ message: "Tokens reset", hashedSub, bundleId, tokensGranted, nextResetAt });
  } catch (error) {
    logger.error({ message: "Error resetting tokens", error: error.message, userId, bundleId });
    throw error;
  }
}

export async function resetTokensByHashedSub(hashedSub, bundleId, tokensGranted, nextResetAt) {
  logger.info({ message: `resetTokensByHashedSub [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    await docClient.send(
      new module.UpdateCommand({
        TableName: tableName,
        Key: { hashedSub, bundleId },
        UpdateExpression: "SET tokensConsumed = :zero, tokensGranted = :granted, tokenResetAt = :resetAt, saltVersion = :saltVersion",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":granted": tokensGranted,
          ":resetAt": nextResetAt,
          ":saltVersion": getSaltVersion(),
        },
      }),
    );

    logger.info({ message: "Tokens reset by hashedSub", hashedSub, bundleId, tokensGranted, nextResetAt });
  } catch (error) {
    logger.error({ message: "Error resetting tokens by hashedSub", error: error.message, hashedSub, bundleId });
    throw error;
  }
}

export async function consumeToken(userId, bundleId, count = 1) {
  logger.info({ message: `consumeToken [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId, count });

  try {
    const hashedSub = hashSub(userId);
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const result = await docClient.send(
      new module.UpdateCommand({
        TableName: tableName,
        Key: { hashedSub, bundleId },
        UpdateExpression: "SET tokensConsumed = if_not_exists(tokensConsumed, :zero) + :inc, saltVersion = :saltVersion",
        ConditionExpression: "attribute_not_exists(tokensConsumed) OR tokensConsumed < tokensGranted",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":inc": count,
          ":saltVersion": getSaltVersion(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    const updated = result.Attributes;
    const tokensRemaining = Math.max(0, (updated.tokensGranted || 0) - (updated.tokensConsumed || 0));
    logger.info({ message: "Token consumed", hashedSub, bundleId, tokensRemaining });
    return { consumed: true, tokensRemaining, bundle: updated };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Token consumption blocked - tokens exhausted", userId, bundleId });
      return { consumed: false, reason: "tokens_exhausted", tokensRemaining: 0 };
    }
    logger.error({ message: "Error consuming token", error: error.message, userId, bundleId });
    throw error;
  }
}

export async function recordTokenEvent(userId, bundleId, event) {
  logger.info({ message: `recordTokenEvent [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId });

  try {
    const hashedSub = hashSub(userId);
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const tokenEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    await docClient.send(
      new module.UpdateCommand({
        TableName: tableName,
        Key: { hashedSub, bundleId },
        UpdateExpression: "SET tokenEvents = list_append(if_not_exists(tokenEvents, :empty), :event), saltVersion = :saltVersion",
        ExpressionAttributeValues: {
          ":empty": [],
          ":event": [tokenEvent],
          ":saltVersion": getSaltVersion(),
        },
      }),
    );

    logger.info({ message: "Token event recorded", hashedSub, bundleId, event: tokenEvent });
  } catch (error) {
    logger.error({ message: "Error recording token event", error: error.message, userId, bundleId });
    throw error;
  }
}

export async function updateBundleSubscriptionFields(hashedSub, bundleId, fields) {
  logger.info({ message: `updateBundleSubscriptionFields [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, bundleId });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const expressions = [];
    const values = {};
    const names = {};

    for (const [key, value] of Object.entries(fields)) {
      const attrName = `#${key}`;
      const attrValue = `:${key}`;
      expressions.push(`${attrName} = ${attrValue}`);
      names[attrName] = key;
      values[attrValue] = value;
    }

    // Always write saltVersion
    expressions.push("#saltVersion = :saltVersion");
    names["#saltVersion"] = "saltVersion";
    values[":saltVersion"] = getSaltVersion();

    await docClient.send(
      new module.UpdateCommand({
        TableName: tableName,
        Key: { hashedSub, bundleId },
        UpdateExpression: "SET " + expressions.join(", "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );

    logger.info({ message: "Bundle subscription fields updated", hashedSub, bundleId, fields });
  } catch (error) {
    logger.error({ message: "Error updating bundle subscription fields", error: error.message, hashedSub, bundleId });
    throw error;
  }
}

export async function countActiveAllocations(bundleId, nowIso) {
  logger.info({ message: `countActiveAllocations [table: ${getTableName()}]`, bundleId });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    let count = 0;
    let lastEvaluatedKey;
    do {
      const response = await docClient.send(
        new module.QueryCommand({
          TableName: tableName,
          IndexName: "bundleId-expiry-index",
          KeyConditionExpression: "bundleId = :bundleId AND expiry > :now",
          ExpressionAttributeValues: { ":bundleId": bundleId, ":now": nowIso },
          Select: "COUNT",
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      count += response.Count || 0;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    logger.info({ message: "Counted active allocations", bundleId, count });
    return count;
  } catch (error) {
    logger.error({ message: "Error counting active allocations", error: error.message, bundleId });
    throw error;
  }
}

export async function getUserBundles(userId) {
  logger.info({ message: `getUserBundles [table: ${process.env.BUNDLE_DYNAMODB_TABLE_NAME}]`, userId });

  try {
    const hashedSub = hashSub(userId);
    logger.info({ message: "Retrieving bundles from DynamoDB", userId, hashedSub });
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const response = await docClient.send(
      new module.QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :hashedSub",
        ExpressionAttributeValues: {
          ":hashedSub": hashedSub,
        },
      }),
    );
    logger.info({ message: "Queried DynamoDB for user bundles", hashedSub, itemCount: response.Count });

    if (response.Items && response.Items.length > 0) {
      logger.info({ message: "Retrieved bundles from DynamoDB", hashedSub, count: response.Items.length });
      return response.Items;
    }

    // Fall back to previous salt versions during migration window
    for (const version of getPreviousVersions()) {
      const oldHash = hashSubWithVersion(userId, version);
      const fallbackResponse = await docClient.send(
        new module.QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "hashedSub = :hashedSub",
          ExpressionAttributeValues: {
            ":hashedSub": oldHash,
          },
        }),
      );
      if (fallbackResponse.Items && fallbackResponse.Items.length > 0) {
        logger.warn({ message: "Found bundles at old salt version", version, hashedSub: oldHash });
        return fallbackResponse.Items;
      }
    }

    logger.info({ message: "No bundles found for user", hashedSub });
    return [];
  } catch (error) {
    logger.error({
      message: `Error retrieving bundles from DynamoDB table ${getTableName()}`,
      error: error.message,
      userId,
    });
    throw error;
  }
}
