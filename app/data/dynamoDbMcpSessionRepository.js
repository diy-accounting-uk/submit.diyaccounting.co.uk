// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbMcpSessionRepository.js
//
// Repository for the {env}-env-mcp-sessions table: one item per Mcp-Session-Id, keyed by
// sessionId, holding the owner's hashedSub and the pointer to the cloud book the session has
// open. Every write refreshes a 24-hour ttl.

import { randomUUID } from "node:crypto";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";

const SESSION_LIFETIME = { hours: 24 };

function tableName() {
  return getResourceName("MCP_SESSIONS_DYNAMODB_TABLE_NAME", true);
}

function newTtl() {
  return calculateTtl(new Date(), SESSION_LIFETIME).ttl;
}

/**
 * Creates a session for a user with no cloud book open.
 *
 * @param {string} hashedSub - the owner's hashed sub
 * @returns {Promise<{sessionId: string, hashedSub: string, cloud: null, ttl: number}>}
 */
export async function createMcpSession(hashedSub) {
  const item = { sessionId: randomUUID(), hashedSub, cloud: null, ttl: newTtl() };
  await executeDynamoDbCommand((module) => new module.PutCommand({ TableName: tableName(), Item: item }));
  return item;
}

/**
 * Reads a session. An item whose ttl has passed answers null even if DynamoDB has not yet
 * removed it.
 *
 * @param {string} sessionId
 * @returns {Promise<{sessionId: string, hashedSub: string, cloud: Object|null, ttl: number}|null>}
 */
export async function getMcpSession(sessionId) {
  const result = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: tableName(), Key: { sessionId }, ConsistentRead: true }),
  );
  const item = result?.Item;
  if (!item) return null;
  if (item.ttl <= Math.floor(Date.now() / 1000)) return null;
  return item;
}

/**
 * Stores the cloud book pointer the session has open and refreshes the ttl.
 *
 * @param {string} sessionId
 * @param {{bookId: string, clientId: string|null, etag: string}|null} cloud
 * @returns {Promise<void>}
 */
export async function updateMcpSessionCloud(sessionId, cloud) {
  await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: tableName(),
        Key: { sessionId },
        UpdateExpression: "SET cloud = :cloud, #ttl = :ttl",
        ConditionExpression: "attribute_exists(sessionId)",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ":cloud": cloud, ":ttl": newTtl() },
      }),
  );
}

/**
 * Deletes a session.
 *
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function deleteMcpSession(sessionId) {
  await executeDynamoDbCommand((module) => new module.DeleteCommand({ TableName: tableName(), Key: { sessionId } }));
}
