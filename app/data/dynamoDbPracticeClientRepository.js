// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbPracticeClientRepository.js
//
// The practice's client list: partition key is the practice's hashed sub, sort key is the
// client's ULID. No index reads clientId on its own, so a client is reachable only through the
// practice that owns it.

import { createLogger } from "../lib/logger.js";
import { hashSub } from "../services/subHasher.js";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";
import crypto from "crypto";

const logger = createLogger({ source: "app/data/dynamoDbPracticeClientRepository.js" });

// PU-7a's table is keyed by the practice's hashed sub and a client id, with no index reading
// clientId alone. A practice-level attribute (the HMRC agent reference number) has no client to
// key on, so it lives in a sentinel row in the same table under this reserved clientId - never a
// value a generated ULID can collide with, since a ULID never contains "#".
const PROFILE_CLIENT_ID = "practice#profile";

// Crockford base32: no I, L, O, U, so a client id is never misread as a different one when
// transcribed by hand.
const ULID_ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTimePart(timeMs) {
  let remaining = timeMs;
  let encoded = "";
  for (let i = 0; i < 10; i++) {
    encoded = ULID_ENCODING[remaining % 32] + encoded;
    remaining = Math.floor(remaining / 32);
  }
  return encoded;
}

function encodeRandomPart() {
  const bytes = crypto.randomBytes(16);
  let encoded = "";
  for (let i = 0; i < 16; i++) {
    encoded += ULID_ENCODING[bytes[i] % 32];
  }
  return encoded;
}

/**
 * Issues a new client id. A ULID, so ids sort by creation time without a separate createdAt
 * index, but nothing here reads that ordering: it is a caller-facing property, not a lookup path.
 *
 * @returns {string}
 */
export function generateClientId() {
  return encodeTimePart(Date.now()) + encodeRandomPart();
}

/**
 * Creates a new client row for a practice. The identifiers a filing needs (VRN, NINO, UTR,
 * company number) are stored as given; format validation is the caller's responsibility. The
 * authorisation state per HMRC service starts empty, since no invitation has been sent yet.
 *
 * @param {string} practiceSub - the practice's raw Cognito sub
 * @param {object} params
 * @param {string} params.displayName
 * @param {string} [params.vrn]
 * @param {string} [params.nino]
 * @param {string} [params.utr]
 * @param {string} [params.companyNumber]
 * @returns {Promise<object>} the stored client row
 */
export async function createClient(practiceSub, { displayName, vrn, nino, utr, companyNumber }) {
  const hashedSub = hashSub(practiceSub);
  const tableName = getResourceName("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
  logger.info({ message: `createClient [table: ${tableName}]`, hashedSub });

  const clientId = generateClientId();
  const now = new Date().toISOString();
  const item = {
    hashedSub,
    clientId,
    displayName,
    identifiers: {
      vrn: vrn ?? null,
      nino: nino ?? null,
      utr: utr ?? null,
      companyNumber: companyNumber ?? null,
    },
    authorisations: {},
    createdAt: now,
    archivedAt: null,
  };

  await executeDynamoDbCommand(
    (module) =>
      new module.PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(clientId)",
      }),
  );

  logger.info({ message: "Client created", hashedSub, clientId });
  return item;
}

/**
 * Reads one client row, scoped to the given practice. A client id that belongs to another
 * practice, or does not exist, reads as not found: the caller's own hashed sub is always the
 * partition key, never a value taken from the request.
 *
 * @param {string} practiceSub - the practice's raw Cognito sub
 * @param {string} clientId
 * @returns {Promise<object|null>}
 */
export async function getClient(practiceSub, clientId) {
  const hashedSub = hashSub(practiceSub);
  const tableName = getResourceName("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
  logger.info({ message: `getClient [table: ${tableName}]`, hashedSub, clientId });

  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: tableName,
        Key: { hashedSub, clientId },
      }),
  );

  return result.Item || null;
}

/**
 * Lists a practice's clients. Archived clients are excluded by default, since the practice page
 * and the batch tools only ever want the active list; pass includeArchived to see everything.
 *
 * @param {string} practiceSub - the practice's raw Cognito sub
 * @param {object} [options]
 * @param {boolean} [options.includeArchived=false]
 * @returns {Promise<object[]>}
 */
export async function listClients(practiceSub, { includeArchived = false } = {}) {
  const hashedSub = hashSub(practiceSub);
  const tableName = getResourceName("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
  logger.info({ message: `listClients [table: ${tableName}]`, hashedSub });

  const response = await executeDynamoDbCommand(
    (module) =>
      new module.QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "hashedSub = :hashedSub",
        ExpressionAttributeValues: {
          ":hashedSub": hashedSub,
        },
      }),
  );

  const items = (response.Items || []).filter((item) => item.clientId !== PROFILE_CLIENT_ID);
  logger.info({ message: "Queried DynamoDB for practice clients", hashedSub, itemCount: items.length });

  return includeArchived ? items : items.filter((item) => !item.archivedAt);
}

/**
 * Archives a client: sets archivedAt rather than deleting the row, so the client list and its
 * book sets survive a lapse and reappear on resubscribe. Archiving a client id that does not
 * belong to this practice, or does not exist, throws rather than silently succeeding.
 *
 * @param {string} practiceSub - the practice's raw Cognito sub
 * @param {string} clientId
 * @returns {Promise<object>} the updated client row
 * @throws {Error} with `name === "ConditionalCheckFailedException"` when the client is not found
 */
export async function archiveClient(practiceSub, clientId) {
  const hashedSub = hashSub(practiceSub);
  const tableName = getResourceName("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
  logger.info({ message: `archiveClient [table: ${tableName}]`, hashedSub, clientId });

  const now = new Date().toISOString();
  const result = await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: tableName,
        Key: { hashedSub, clientId },
        UpdateExpression: "SET archivedAt = :archivedAt",
        ConditionExpression: "attribute_exists(clientId)",
        ExpressionAttributeValues: { ":archivedAt": now },
        ReturnValues: "ALL_NEW",
      }),
  );

  logger.info({ message: "Client archived", hashedSub, clientId });
  return result.Attributes;
}

/**
 * Reads the practice's HMRC agent reference number (ARN) from its profile row. Returns null when
 * the practice has never set one.
 *
 * @param {string} practiceSub - the practice's raw Cognito sub
 * @returns {Promise<string|null>}
 */
export async function getPracticeArn(practiceSub) {
  const hashedSub = hashSub(practiceSub);
  const tableName = getResourceName("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
  logger.info({ message: `getPracticeArn [table: ${tableName}]`, hashedSub });

  const result = await executeDynamoDbCommand(
    (module) =>
      new module.GetCommand({
        TableName: tableName,
        Key: { hashedSub, clientId: PROFILE_CLIENT_ID },
      }),
  );

  return result.Item?.arn || null;
}

/**
 * Stores the practice's HMRC agent reference number (ARN) on its profile row, creating the row
 * on first use. No client credential is ever stored alongside it.
 *
 * @param {string} practiceSub - the practice's raw Cognito sub
 * @param {string} arn
 * @returns {Promise<object>} the stored profile row
 */
export async function setPracticeArn(practiceSub, arn) {
  const hashedSub = hashSub(practiceSub);
  const tableName = getResourceName("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
  logger.info({ message: `setPracticeArn [table: ${tableName}]`, hashedSub });

  const now = new Date().toISOString();
  const item = { hashedSub, clientId: PROFILE_CLIENT_ID, arn, updatedAt: now };

  await executeDynamoDbCommand(
    (module) =>
      new module.PutCommand({
        TableName: tableName,
        Item: item,
      }),
  );

  logger.info({ message: "Practice ARN stored", hashedSub });
  return item;
}

/**
 * Writes one HMRC service's authorisation state onto a client row: the ARN is stored on the
 * practice, and per client the service, the invitation id, the last status and when it was read.
 * Refuses when the client does not belong to this practice.
 *
 * @param {string} practiceSub - the practice's raw Cognito sub
 * @param {string} clientId
 * @param {string} service - e.g. "MTD-VAT" or "MTD-IT"
 * @param {object} authorisation - e.g. { status, invitationId }
 * @returns {Promise<object>} the updated client row
 * @throws {Error} with `name === "ConditionalCheckFailedException"` when the client is not found
 */
export async function setClientAuthorisation(practiceSub, clientId, service, authorisation) {
  const hashedSub = hashSub(practiceSub);
  const tableName = getResourceName("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
  logger.info({ message: `setClientAuthorisation [table: ${tableName}]`, hashedSub, clientId, service });

  const checkedAt = new Date().toISOString();
  const result = await executeDynamoDbCommand(
    (module) =>
      new module.UpdateCommand({
        TableName: tableName,
        Key: { hashedSub, clientId },
        UpdateExpression: "SET authorisations.#service = :authorisation",
        ConditionExpression: "attribute_exists(clientId)",
        ExpressionAttributeNames: { "#service": service },
        ExpressionAttributeValues: { ":authorisation": { ...authorisation, checkedAt } },
        ReturnValues: "ALL_NEW",
      }),
  );

  logger.info({ message: "Client authorisation updated", hashedSub, clientId, service });
  return result.Attributes;
}
