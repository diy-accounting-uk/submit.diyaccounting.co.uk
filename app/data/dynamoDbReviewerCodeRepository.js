// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbReviewerCodeRepository.js
//
// The tokens of the demo reviewer sign-in, held in the {env}-env-mcp-sessions table under the key
// "reviewer-code:<id>" until the token route takes them. The tokens arrive sealed. An item lives
// five minutes, and taking it deletes it, so a code redeems once.

import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";

const CODE_LIFETIME = { minutes: 5 };

function tableName() {
  return getResourceName("MCP_SESSIONS_DYNAMODB_TABLE_NAME", true);
}

export function reviewerCodeKey(reviewerCodeId) {
  return `reviewer-code:${reviewerCodeId}`;
}

/**
 * @param {string} reviewerCodeId
 * @param {string} sealed - the sealed tokens, bound to reviewerCodeKey(reviewerCodeId)
 * @returns {Promise<void>}
 */
export async function putReviewerCode(reviewerCodeId, sealed) {
  const item = { sessionId: reviewerCodeKey(reviewerCodeId), sealed, ttl: calculateTtl(new Date(), CODE_LIFETIME).ttl };
  await executeDynamoDbCommand((module) => new module.PutCommand({ TableName: tableName(), Item: item }));
}

/**
 * Deletes the item and answers its sealed tokens. A missing or expired item answers null.
 * @param {string} reviewerCodeId
 * @returns {Promise<string|null>}
 */
export async function takeReviewerCode(reviewerCodeId) {
  const result = await executeDynamoDbCommand(
    (module) =>
      new module.DeleteCommand({
        TableName: tableName(),
        Key: { sessionId: reviewerCodeKey(reviewerCodeId) },
        ReturnValues: "ALL_OLD",
      }),
  );
  const item = result?.Attributes;
  if (!item || item.ttl <= Math.floor(Date.now() / 1000)) return null;
  return item.sealed;
}
