// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbHmrcGrantRepository.js
//
// HMRC grants started by an MCP tool, held in the {env}-env-mcp-sessions table under the key
// "hmrc-grant:<grantId>". A grant is requested (pending, ten minutes), claimed by the one
// callback that carries its state (exchanging), then granted with the HMRC tokens sealed. A
// granted item lives for 24 hours; the access token inside it is refreshed as it nears its own
// expiry. A browser sign-in is written already granted, with origin "web".

import { randomUUID } from "node:crypto";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import { calculateTtl } from "../lib/dateUtils.js";

const PENDING_LIFETIME = { minutes: 10 };
const GRANTED_LIFETIME = { hours: 24 };
const REFRESH_CLAIM_SECONDS = 30;

function tableName() {
  return getResourceName("MCP_SESSIONS_DYNAMODB_TABLE_NAME", true);
}

function keyFor(grantId) {
  return { sessionId: `hmrc-grant:${grantId}` };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function isConditionFailure(error) {
  return error?.name === "ConditionalCheckFailedException";
}

/**
 * @param {{hashedSub: string, hmrcAccount: "synthetic"|"live", scope: string, stateHash: string}} grant
 * @returns {Promise<{grantId: string, state: "pending", ttl: number}>}
 */
export async function createHmrcGrant({ hashedSub, hmrcAccount, scope, stateHash }) {
  const grantId = randomUUID();
  const ttl = calculateTtl(new Date(), PENDING_LIFETIME).ttl;
  const item = { ...keyFor(grantId), hashedSub, hmrcAccount, scope, stateHash, state: "pending", ttl };
  await executeDynamoDbCommand((module) => new module.PutCommand({ TableName: tableName(), Item: item }));
  return { grantId, state: "pending", ttl };
}

/**
 * Reads a grant, sealed tokens included. An expired grant answers null.
 * @param {string} grantId
 * @returns {Promise<{grantId: string, hashedSub: string, hmrcAccount: string, scope: string, stateHash: string, state: string, sealed?: string, accessExpiresAt?: number, ttl: number}|null>}
 */
export async function getHmrcGrant(grantId) {
  const result = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: tableName(), Key: keyFor(grantId), ConsistentRead: true }),
  );
  const item = result?.Item;
  if (!item || item.ttl <= nowSeconds()) return null;
  const grant = { ...item };
  delete grant.sessionId;
  return { grantId, ...grant };
}

/**
 * Moves a pending grant to exchanging. Only one caller wins; a second claim, an expired grant or
 * an unknown id answers false.
 * @param {string} grantId
 * @returns {Promise<boolean>}
 */
export async function claimHmrcGrant(grantId) {
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName(),
          Key: keyFor(grantId),
          UpdateExpression: "SET #state = :exchanging",
          ConditionExpression: "attribute_exists(sessionId) AND #state = :pending AND #ttl > :now",
          ExpressionAttributeNames: { "#state": "state", "#ttl": "ttl" },
          ExpressionAttributeValues: { ":exchanging": "exchanging", ":pending": "pending", ":now": nowSeconds() },
        }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

/**
 * Stores the sealed tokens on a claimed grant and starts its 24 hours.
 * @param {string} grantId
 * @param {{sealed: string, accessExpiresAt: number, scope: string}} granted
 * @returns {Promise<void>}
 */
export async function completeHmrcGrant(grantId, { sealed, accessExpiresAt, scope }) {
  await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: tableName(),
        Key: keyFor(grantId),
        UpdateExpression: "SET sealed = :sealed, accessExpiresAt = :accessExpiresAt, #scope = :scope, #state = :granted, #ttl = :ttl",
        ConditionExpression: "attribute_exists(sessionId) AND #state = :exchanging",
        ExpressionAttributeNames: { "#state": "state", "#ttl": "ttl", "#scope": "scope" },
        ExpressionAttributeValues: {
          ":sealed": sealed,
          ":accessExpiresAt": accessExpiresAt,
          ":scope": scope,
          ":granted": "granted",
          ":exchanging": "exchanging",
          ":ttl": calculateTtl(new Date(), GRANTED_LIFETIME).ttl,
        },
      }),
  );
}

/**
 * Takes the right to refresh a granted grant's tokens for 30 seconds. HMRC accepts a refresh
 * token once, so one caller refreshes; the claim holds only while the access token expiry is the
 * one the caller read and no earlier claim is still running.
 * @param {string} grantId
 * @param {number} seenAccessExpiresAt - the accessExpiresAt the caller read
 * @returns {Promise<boolean>} true when this caller holds the refresh
 */
export async function claimHmrcGrantRefresh(grantId, seenAccessExpiresAt) {
  const now = nowSeconds();
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName(),
          Key: keyFor(grantId),
          UpdateExpression: "SET refreshingUntil = :until",
          ConditionExpression:
            "attribute_exists(sessionId) AND #state = :granted AND accessExpiresAt = :seen AND (attribute_not_exists(refreshingUntil) OR refreshingUntil < :now)",
          ExpressionAttributeNames: { "#state": "state" },
          ExpressionAttributeValues: {
            ":until": now + REFRESH_CLAIM_SECONDS,
            ":granted": "granted",
            ":seen": seenAccessExpiresAt,
            ":now": now,
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
 * Replaces the sealed tokens of a granted grant after a refresh and releases the refresh claim.
 * The grant's ttl is unchanged. A grant deleted in the meantime answers false.
 * @param {string} grantId
 * @param {{sealed: string, accessExpiresAt: number}} refreshed
 * @returns {Promise<boolean>}
 */
export async function refreshHmrcGrant(grantId, { sealed, accessExpiresAt }) {
  try {
    await executeDynamoDbCommand(
      (module) =>
        new module.UpdateCommand({
          TableName: tableName(),
          Key: keyFor(grantId),
          UpdateExpression: "SET sealed = :sealed, accessExpiresAt = :accessExpiresAt REMOVE refreshingUntil",
          ConditionExpression: "attribute_exists(sessionId) AND #state = :granted",
          ExpressionAttributeNames: { "#state": "state" },
          ExpressionAttributeValues: { ":sealed": sealed, ":accessExpiresAt": accessExpiresAt, ":granted": "granted" },
        }),
    );
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

/**
 * Writes a grant that is already granted: a browser sign-in whose code Submit has exchanged. The
 * seal is built from the new grant id, which authenticates it.
 * @param {{hashedSub: string, hmrcAccount: "synthetic"|"live", scope: string, accessExpiresAt: number, seal: (grantId: string) => Promise<string>}} granted
 * @returns {Promise<{grantId: string, ttl: number}>}
 */
export async function createGrantedHmrcGrant({ hashedSub, hmrcAccount, scope, accessExpiresAt, seal }) {
  const grantId = randomUUID();
  const ttl = calculateTtl(new Date(), GRANTED_LIFETIME).ttl;
  const item = {
    ...keyFor(grantId),
    hashedSub,
    hmrcAccount,
    scope,
    state: "granted",
    origin: "web",
    sealed: await seal(grantId),
    accessExpiresAt,
    ttl,
  };
  await executeDynamoDbCommand(
    (module) => new module.PutCommand({ TableName: tableName(), Item: item, ConditionExpression: "attribute_not_exists(sessionId)" }),
  );
  return { grantId, ttl };
}

/**
 * Deletes a grant.
 * @param {string} grantId
 * @returns {Promise<void>}
 */
export async function deleteHmrcGrant(grantId) {
  await executeDynamoDbCommand((module) => new module.DeleteCommand({ TableName: tableName(), Key: keyFor(grantId) }));
}
