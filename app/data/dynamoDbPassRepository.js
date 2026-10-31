// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbPassRepository.js

import { createLogger } from "../lib/logger.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

const logger = createLogger({ source: "app/data/dynamoDbPassRepository.js" });

export async function putPass(pass) {
  logger.info({ message: `putPass [table: ${getResourceName("PASSES_DYNAMODB_TABLE_NAME")}]` });

  try {
    const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");

    logger.info({ message: "Storing pass in DynamoDB", passTypeId: pass.passTypeId, bundleId: pass.bundleId });

    await executeDynamoDbCommand(
      (module) =>
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
  logger.info({ message: `getPass [table: ${getResourceName("PASSES_DYNAMODB_TABLE_NAME")}]` });

  try {
    const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");

    const result = await executeDynamoDbCommand(
      (module) =>
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
  logger.info({ message: `redeemPass [table: ${getResourceName("PASSES_DYNAMODB_TABLE_NAME")}]` });

  try {
    const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");

    const result = await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName,
          Key: { pk: `pass#${code}` },
          UpdateExpression: "SET useCount = useCount + :inc, updatedAt = :now",
          ConditionExpression: [
            "attribute_exists(pk)",
            "attribute_not_exists(revokedAt)",
            "(attribute_not_exists(maxUses) OR useCount < maxUses)",
            "(attribute_not_exists(reviewLimit) OR useCount < reviewLimit)",
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
 * Queries the issuedBy-index GSI; the local table in app/bin/dynamodb.js carries the same index.
 */
export async function getPassesByIssuer(issuedBy, { limit = 20 } = {}) {
  logger.info({ message: `getPassesByIssuer [table: ${getResourceName("PASSES_DYNAMODB_TABLE_NAME")}]`, issuedBy, limit });

  try {
    const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");
    const items = [];

    let lastEvaluatedKey;
    do {
      const result = await executeDynamoDbCommand(
        (module) =>
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
  logger.info({ message: `revokePass [table: ${getResourceName("PASSES_DYNAMODB_TABLE_NAME")}]` });

  try {
    const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");

    const result = await executeDynamoDbCommand(
      (module) =>
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

/**
 * Claim the one referral redemption an account may ever make. Returns false when the account has
 * already claimed one.
 */
export async function putReferralClaim(hashedSub, code, now) {
  const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.PutCommand({
          TableName: tableName,
          Item: { pk: `referral#${hashedSub}`, code, claimedAt: now },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      logger.info({ message: "Referral already claimed for this account" });
      return false;
    }
    logger.error({ message: "Error claiming referral in DynamoDB", error: error.message });
    throw error;
  }
}

export async function deleteReferralClaim(hashedSub) {
  const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");
  await executeDynamoDbCommand(
    (module) =>
      new module.DeleteCommand({
        TableName: tableName,
        Key: { pk: `referral#${hashedSub}` },
      }),
  );
}

/**
 * Store the record of one redemption: which pass, which account, who issued it and when.
 */
export async function putRedemption({ code, hashedSub, issuedBy, passTypeId, redeemedAt }) {
  const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");
  await executeDynamoDbCommand(
    (module) =>
      new module.PutCommand({
        TableName: tableName,
        Item: {
          pk: `redemption#${code}#${hashedSub}`,
          code,
          redeemedBy: hashedSub,
          issuedBy,
          passTypeId,
          redeemedAt,
        },
      }),
  );
  logger.info({ message: "Redemption recorded", passTypeId });
}

/**
 * The one referral claim an account holds: the pass code it redeemed, or null.
 */
export async function getReferralClaim(hashedSub) {
  const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");
  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: tableName,
        Key: { pk: `referral#${hashedSub}` },
      }),
  );
  return result.Item || null;
}

/**
 * The record of one redemption, or null.
 */
export async function getRedemption(code, hashedSub) {
  const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");
  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: tableName,
        Key: { pk: `redemption#${code}#${hashedSub}` },
      }),
  );
  return result.Item || null;
}

/**
 * The affiliate item of a referrer (tier and state), or null.
 */
export async function getAffiliate(referrerHash) {
  const tableName = getResourceName("PASSES_DYNAMODB_TABLE_NAME");
  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: tableName,
        Key: { pk: `affiliate#${referrerHash}` },
      }),
  );
  return result.Item || null;
}
