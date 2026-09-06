// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/data/dynamoDbPassRepository.js

import { createLogger } from "../lib/logger.js";
import { getDynamoDbDocClient } from "../lib/dynamoDbClient.js";

const logger = createLogger({ source: "app/data/dynamoDbPassRepository.js" });

function getTableName() {
  const tableName = process.env.PASSES_DYNAMODB_TABLE_NAME;
  return tableName || "";
}

export async function putPass(pass) {
  logger.info({ message: `putPass [table: ${getTableName()}]` });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    logger.info({ message: "Storing pass in DynamoDB", passTypeId: pass.passTypeId, bundleId: pass.bundleId });

    await docClient.send(
      new module.PutCommand({
        TableName: tableName,
        Item: pass,
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );

    logger.info({ message: "Pass stored in DynamoDB", pk: pass.pk });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.warn({ message: "Pass code collision, pk already exists", pk: pass.pk });
      throw new Error("Pass code collision");
    }
    logger.error({ message: "Error storing pass in DynamoDB", error: error.message });
    throw error;
  }
}

export async function getPass(code) {
  logger.info({ message: `getPass [table: ${getTableName()}]` });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const result = await docClient.send(
      new module.GetCommand({
        TableName: tableName,
        Key: { pk: `pass#${code}` },
      }),
    );

    logger.info({ message: "Retrieved pass from DynamoDB", found: !!result.Item });
    return result.Item || null;
  } catch (error) {
    logger.error({ message: "Error retrieving pass from DynamoDB", error: error.message });
    throw error;
  }
}

export async function redeemPass(code, now) {
  logger.info({ message: `redeemPass [table: ${getTableName()}]` });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const result = await docClient.send(
      new module.UpdateCommand({
        TableName: tableName,
        Key: { pk: `pass#${code}` },
        UpdateExpression: "SET useCount = useCount + :inc, updatedAt = :now",
        ConditionExpression: [
          "attribute_exists(pk)",
          "attribute_not_exists(revokedAt)",
          "useCount < maxUses",
          "validFrom <= :now",
          "(attribute_not_exists(validUntil) OR validUntil >= :now)",
        ].join(" AND "),
        ExpressionAttributeValues: {
          ":inc": 1,
          ":now": now,
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    logger.info({ message: "Pass redeemed in DynamoDB", pk: `pass#${code}` });
    return result.Attributes;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Pass redemption condition failed", code });
      return null;
    }
    logger.error({ message: "Error redeeming pass in DynamoDB", error: error.message });
    throw error;
  }
}

/**
 * Query passes issued by a specific user.
 * Uses issuedBy-index GSI in production; falls back to scan+filter for local dev.
 */
export async function getPassesByIssuer(issuedBy, { limit = 20 } = {}) {
  logger.info({ message: `getPassesByIssuer [table: ${getTableName()}]`, issuedBy, limit });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();
    const items = [];

    let lastEvaluatedKey;
    do {
      const result = await docClient.send(
        new module.QueryCommand({
          TableName: tableName,
          IndexName: "issuedBy-index",
          KeyConditionExpression: "issuedBy = :ib",
          ExpressionAttributeValues: { ":ib": issuedBy },
          ScanIndexForward: false, // newest first
          Limit: limit,
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      items.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey && items.length < limit);

    logger.info({ message: "Retrieved passes by issuer", count: items.length });
    return { items: items.slice(0, limit) };
  } catch (error) {
    logger.error({ message: "Error querying passes by issuer", error: error.message });
    throw error;
  }
}

export async function revokePass(code, now) {
  logger.info({ message: `revokePass [table: ${getTableName()}]` });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    const result = await docClient.send(
      new module.UpdateCommand({
        TableName: tableName,
        Key: { pk: `pass#${code}` },
        UpdateExpression: "SET revokedAt = :now, updatedAt = :now",
        ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(revokedAt)",
        ExpressionAttributeValues: {
          ":now": now,
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    logger.info({ message: "Pass revoked in DynamoDB", pk: `pass#${code}` });
    return result.Attributes;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Pass revocation condition failed (not found or already revoked)", code });
      return null;
    }
    logger.error({ message: "Error revoking pass in DynamoDB", error: error.message });
    throw error;
  }
}
