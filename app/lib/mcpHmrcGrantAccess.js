// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpHmrcGrantAccess.js
// Opens an MCP session's HMRC grant inside Submit. The sealed tokens stay in the mcp-sessions
// table; this module checks the grant belongs to the signed-in user, opens the seal, refreshes
// the access token when it nears its expiry, and hands the token to the Lambda that calls HMRC.
// No response leaves Submit with a token in it.

import { createLogger } from "./logger.js";
import { extractUserFromAuthorizerContext, performTokenExchange, getHeader, MCP_HMRC_GRANT_HEADER } from "./httpResponseHelper.js";
import { initializeSalt, hashSub } from "../services/subHasher.js";
import { getHmrcGrant, refreshHmrcGrant, deleteHmrcGrant } from "../data/dynamoDbHmrcGrantRepository.js";
import { sealFor, openFor, HMRC_GRANT_PURPOSE } from "./codesSeal.js";
import { prepareTokenRefreshRequest } from "../functions/hmrc/hmrcTokenPost.js";

const logger = createLogger({ source: "app/lib/mcpHmrcGrantAccess.js" });

export const GRANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFRESH_MARGIN_SECONDS = 300;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// HMRC's refresh_token grant. A refused or unreachable refresh deletes the grant, so the user
// authorises again; a failure before the request leaves it in place.
async function refreshTokens(grantId, grant, tokens) {
  const { url, body } = await prepareTokenRefreshRequest(tokens.refreshToken, grant.hmrcAccount);
  let result;
  try {
    result = await performTokenExchange(url, body, `mcp-hmrc-grant:${grantId}`, { org: "hmrc" });
  } catch (error) {
    logger.error({ message: "HMRC token refresh failed", grantId, error: error.message });
    return null;
  }
  if (!result.response.ok || !result.accessToken) return null;
  return {
    tokens: { accessToken: result.accessToken, refreshToken: result.responseBody.refresh_token ?? tokens.refreshToken },
    accessExpiresAt: nowSeconds() + Number(result.responseBody.expires_in ?? 0),
  };
}

/**
 * The state of one grant for the signed-in user, with its access token when granted.
 * @param {string} grantId
 * @param {string} userSub - the signed-in user's sub; the grant must belong to it
 * @returns {Promise<{status: "missing"|"forbidden"}
 *   | {status: "pending", hmrcAccount: string}
 *   | {status: "granted", accessToken: string, accessExpiresAt: number, scope: string, hmrcAccount: string}>}
 */
export async function openGrantFor(grantId, userSub) {
  await initializeSalt();
  const grant = await getHmrcGrant(grantId);
  if (!grant) return { status: "missing" };
  if (grant.hashedSub !== hashSub(userSub)) return { status: "forbidden" };
  if (grant.state !== "granted") return { status: "pending", hmrcAccount: grant.hmrcAccount };

  let tokens = await openFor(HMRC_GRANT_PURPOSE, grant.sealed, grantId);
  let accessExpiresAt = grant.accessExpiresAt;
  if (accessExpiresAt - REFRESH_MARGIN_SECONDS <= nowSeconds()) {
    const refreshed = tokens.refreshToken ? await refreshTokens(grantId, grant, tokens) : null;
    if (!refreshed) {
      await deleteHmrcGrant(grantId);
      return { status: "missing" };
    }
    ({ tokens, accessExpiresAt } = refreshed);
    await refreshHmrcGrant(grantId, { sealed: await sealFor(HMRC_GRANT_PURPOSE, tokens, grantId), accessExpiresAt });
  }
  return { status: "granted", accessToken: tokens.accessToken, accessExpiresAt, scope: grant.scope, hmrcAccount: grant.hmrcAccount };
}

/**
 * The HMRC access token of the grant a request names in its x-mcp-hmrc-grant header, or null
 * when the request names none, the grant is not the signed-in user's, is not granted yet or has
 * expired, or the request's hmrcAccount header names the other HMRC account.
 * @param {Object} event - the Lambda event
 * @returns {Promise<string|null>}
 */
export async function grantAccessTokenFromEvent(event) {
  const grantId = getHeader(event.headers, MCP_HMRC_GRANT_HEADER);
  if (!grantId) return null;
  const user = extractUserFromAuthorizerContext(event);
  if (!user || !GRANT_ID_PATTERN.test(grantId)) return null;
  const grant = await openGrantFor(grantId, user.sub);
  if (grant.status !== "granted") {
    logger.warn({ message: "MCP HMRC grant not usable", grantId, status: grant.status });
    return null;
  }
  const requestedAccount = String(getHeader(event.headers, "hmrcAccount") || "").toLowerCase();
  if (requestedAccount && requestedAccount !== grant.hmrcAccount) {
    logger.warn({ message: "MCP HMRC grant is for the other HMRC account", grantId, hmrcAccount: grant.hmrcAccount });
    return null;
  }
  return grant.accessToken;
}
