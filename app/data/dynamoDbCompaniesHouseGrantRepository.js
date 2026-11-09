// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/dynamoDbCompaniesHouseGrantRepository.js
//
// Companies House grants, held in the {env}-env-mcp-sessions table under the key
// "ch-grant:<grantId>". A grant is written once, already granted, when Submit has exchanged the
// authorisation code of a browser sign-in. It holds the sealed access token only and the company
// its scope names. It expires with the access token, so nothing refreshes it.

import { randomUUID } from "node:crypto";
import { executeDynamoDbCommand, getResourceName } from "../lib/dynamoDbClient.js";

function tableName() {
  return getResourceName("MCP_SESSIONS_DYNAMODB_TABLE_NAME", true);
}

function keyFor(grantId) {
  return { sessionId: `ch-grant:${grantId}` };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Writes a granted grant. The seal is built from the new grant id, which authenticates it.
 * @param {{hashedSub: string, scope: string|null, companyNumber: string|null, accessExpiresAt: number, seal: (grantId: string) => Promise<string>}} granted
 * @returns {Promise<{grantId: string, ttl: number}>}
 */
export async function createCompaniesHouseGrant({ hashedSub, scope, companyNumber, accessExpiresAt, seal }) {
  const grantId = randomUUID();
  const item = {
    ...keyFor(grantId),
    hashedSub,
    scope: scope ?? null,
    companyNumber: companyNumber ?? null,
    sealed: await seal(grantId),
    accessExpiresAt,
    ttl: accessExpiresAt,
  };
  await executeDynamoDbCommand(
    (module) => new module.PutCommand({ TableName: tableName(), Item: item, ConditionExpression: "attribute_not_exists(sessionId)" }),
  );
  return { grantId, ttl: accessExpiresAt };
}

/**
 * Reads a grant, sealed token included. An expired grant answers null.
 * @param {string} grantId
 * @returns {Promise<{grantId: string, hashedSub: string, scope: string|null, companyNumber: string|null, sealed: string, accessExpiresAt: number, ttl: number}|null>}
 */
export async function getCompaniesHouseGrant(grantId) {
  const result = await executeDynamoDbCommand(
    (module) => new module.GetCommand({ TableName: tableName(), Key: keyFor(grantId), ConsistentRead: true }),
  );
  const item = result?.Item;
  if (!item || item.ttl <= nowSeconds()) return null;
  const grant = { ...item };
  delete grant.sessionId;
  return { grantId, ...grant };
}
