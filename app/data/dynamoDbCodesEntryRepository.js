// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCodesEntryRepository.js
//
// Companies House codes entries, held in the {env}-env-mcp-sessions table under the key
// "codes:<entryId>". An entry is minted by a tool call (pending), filled once by the user on the
// codes page (filled, the codes sealed) and deleted when a filing route takes it. It expires
// ten minutes after it is minted, whatever state it is in.

import { randomUUID } from "node:crypto";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";

const ENTRY_LIFETIME = { minutes: 10 };

function tableName() {
  return getResourceName("MCP_SESSIONS_DYNAMODB_TABLE_NAME", true);
}

function keyFor(entryId) {
  return { sessionId: `codes:${entryId}` };
}

function isConditionFailure(error) {
  return error?.name === "ConditionalCheckFailedException";
}

/**
 * @param {{hashedSub: string, kind: "accounts"|"confirmation-statement"|"confirmation-statement-data", companyNumber: string, directors?: {forename: string, surname: string}[]}} entry
 * @returns {Promise<{entryId: string, state: "pending", ttl: number}>}
 */
export async function createCodesEntry({ hashedSub, kind, companyNumber, directors = [] }) {
  const entryId = randomUUID();
  const ttl = calculateTtl(new Date(), ENTRY_LIFETIME).ttl;
  const item = { ...keyFor(entryId), hashedSub, kind, companyNumber, directors, state: "pending", ttl };
  await executeDynamoDbCommand((module) => new module.PutCommand({ TableName: tableName(), Item: item }));
  return { entryId, state: "pending", ttl };
}

/**
 * Reads an entry without its sealed codes. An expired entry answers null.
 * @param {string} entryId
 * @returns {Promise<{entryId: string, hashedSub: string, kind: string, companyNumber: string, directors: object[], state: string, ttl: number}|null>}
 */
export async function getCodesEntry(entryId) {
  const result = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: tableName(), Key: keyFor(entryId), ConsistentRead: true }),
  );
  const item = result?.Item;
  if (!item || item.ttl <= Math.floor(Date.now() / 1000)) return null;
  const visible = { ...item };
  delete visible.sealed;
  delete visible.sessionId;
  return { entryId, ...visible };
}

/**
 * Stores the sealed codes on a pending entry. A second fill, an expired entry or an unknown id
 * answers false and changes nothing.
 * @param {string} entryId
 * @param {string} sealed
 * @returns {Promise<boolean>}
 */
export async function fillCodesEntry(entryId, sealed) {
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName(),
          Key: keyFor(entryId),
          UpdateExpression: "SET sealed = :sealed, #state = :filled",
          ConditionExpression: "attribute_exists(sessionId) AND #state = :pending AND #ttl > :now",
          ExpressionAttributeNames: { "#state": "state", "#ttl": "ttl" },
          ExpressionAttributeValues: {
            ":sealed": sealed,
            ":filled": "filled",
            ":pending": "pending",
            ":now": Math.floor(Date.now() / 1000),
          },
        }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

/**
 * Deletes a filled entry and returns what it held. An entry that is pending, expired, unknown or
 * owned by another user answers null and stays as it was.
 * @param {string} entryId
 * @param {string} hashedSub - the caller's hashed sub
 * @returns {Promise<{kind: string, companyNumber: string, directors: object[], sealed: string}|null>}
 */
export async function takeCodesEntry(entryId, hashedSub) {
  try {
    const result = await executeDynamoDbCommand(
      (module) =>
        new module.DeleteCommand({
          TableName: tableName(),
          Key: keyFor(entryId),
          ConditionExpression: "hashedSub = :hashedSub AND #state = :filled AND #ttl > :now",
          ExpressionAttributeNames: { "#state": "state", "#ttl": "ttl" },
          ExpressionAttributeValues: { ":hashedSub": hashedSub, ":filled": "filled", ":now": Math.floor(Date.now() / 1000) },
          ReturnValues: "ALL_OLD",
        }),
    );
    const { kind, companyNumber, directors, sealed } = result.Attributes;
    return { kind, companyNumber, directors, sealed };
  } catch (error) {
    if (isConditionFailure(error)) return null;
    throw error;
  }
}
