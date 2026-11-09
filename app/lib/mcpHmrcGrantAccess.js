// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpHmrcGrantAccess.js
// Opens an MCP session's HMRC grant inside Submit. The sealed tokens stay in the mcp-sessions
// table; this module checks the grant belongs to the signed-in user, opens the seal, refreshes
// the access token when it nears its expiry, and hands the token to the Lambda that calls HMRC.
// No response leaves Submit with a token in it.

import { createLogger } from "./logger.js";
import { extractUserFromAuthorizerContext, getHeader, MCP_HMRC_GRANT_HEADER } from "./httpResponseHelper.js";
import { initializeSalt, hashSub } from "../services/subHasher.js";
import { getHmrcGrant, claimHmrcGrantRefresh, refreshHmrcGrant, deleteHmrcGrant } from "../data/dynamoDbHmrcGrantRepository.js";
import { sealFor, openFor, HMRC_GRANT_PURPOSE } from "./codesSeal.js";
import { prepareTokenRefreshRequest, performHmrcTokenExchange } from "../functions/hmrc/hmrcTokenPost.js";

const logger = createLogger({ source: "app/lib/mcpHmrcGrantAccess.js" });

export const GRANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFRESH_MARGIN_SECONDS = 1800;
const REFRESH_WAIT_ATTEMPTS = 5;
const REFRESH_WAIT_MILLISECONDS = 400;

/**
 * What a request that names a grant gets in place of a token when the grant does not open. It is
 * truthy, so a handler's missing-token check passes it, and validateHmrcAccessToken refuses it
 * with an unauthorised error.
 */
export const HMRC_GRANT_NOT_USABLE = Object.freeze({ hmrcGrantNotUsable: true });

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// HMRC's refresh_token grant. HMRC refuses a refresh token it has already seen with invalid_grant:
// that grant is finished. Any other failure leaves the grant in place.
async function refreshTokens(grantId, grant, tokens) {
  let result;
  try {
    const { url, body } = await prepareTokenRefreshRequest(tokens.refreshToken, grant.hmrcAccount);
    result = await performHmrcTokenExchange(url, body, `mcp-hmrc-grant:${grantId}`, grant.hmrcAccount);
  } catch (error) {
    logger.error({ message: "HMRC token refresh failed", grantId, error: error.message });
    return { outcome: "failed" };
  }
  if (result.response.ok && result.accessToken) {
    return {
      outcome: "refreshed",
      tokens: { accessToken: result.accessToken, refreshToken: result.responseBody.refresh_token ?? tokens.refreshToken },
      accessExpiresAt: nowSeconds() + Number(result.responseBody.expires_in ?? 0),
    };
  }
  if (result.responseBody?.error === "invalid_grant") return { outcome: "refused" };
  logger.error({ message: "HMRC token refresh answered an error", grantId, status: result.response.status });
  return { outcome: "failed" };
}

function grantedResult(grant, tokens, accessExpiresAt) {
  return {
    status: "granted",
    accessToken: tokens.accessToken,
    accessExpiresAt,
    scope: grant.scope,
    hmrcAccount: grant.hmrcAccount,
    origin: grant.origin,
  };
}

// The access token still has life: use it while a refresh is held up.
function stillValid(accessExpiresAt) {
  return accessExpiresAt > nowSeconds();
}

// Another caller holds the refresh. Wait for its new seal; give up when the token has expired and none arrives.
async function waitForRefresh(grantId, grant, tokens) {
  if (stillValid(grant.accessExpiresAt)) return grantedResult(grant, tokens, grant.accessExpiresAt);
  for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt += 1) {
    await sleep(REFRESH_WAIT_MILLISECONDS);
    const current = await getHmrcGrant(grantId);
    if (!current) return { status: "missing" };
    if (current.accessExpiresAt !== grant.accessExpiresAt) {
      return grantedResult(current, await openFor(HMRC_GRANT_PURPOSE, current.sealed, grantId), current.accessExpiresAt);
    }
  }
  return { status: "unavailable" };
}

/**
 * The state of one grant for the signed-in user, with its access token when granted. A grant
 * near its access token's expiry is refreshed by one caller at a time: HMRC accepts a refresh
 * token once. The grant is deleted only when HMRC refuses its refresh token.
 * @param {string} grantId
 * @param {string} userSub - the signed-in user's sub; the grant must belong to it
 * @returns {Promise<{status: "missing"|"forbidden"|"unavailable"}
 *   | {status: "pending", hmrcAccount: string}
 *   | {status: "granted", accessToken: string, accessExpiresAt: number, scope: string, hmrcAccount: string, origin?: string}>}
 */
export async function openGrantFor(grantId, userSub) {
  await initializeSalt();
  const grant = await getHmrcGrant(grantId);
  if (!grant) return { status: "missing" };
  if (grant.hashedSub !== hashSub(userSub)) return { status: "forbidden" };
  if (grant.state !== "granted") return { status: "pending", hmrcAccount: grant.hmrcAccount };

  const tokens = await openFor(HMRC_GRANT_PURPOSE, grant.sealed, grantId);
  if (grant.accessExpiresAt - REFRESH_MARGIN_SECONDS > nowSeconds()) return grantedResult(grant, tokens, grant.accessExpiresAt);
  if (!tokens.refreshToken) {
    if (stillValid(grant.accessExpiresAt)) return grantedResult(grant, tokens, grant.accessExpiresAt);
    await deleteHmrcGrant(grantId);
    return { status: "missing" };
  }

  if (!(await claimHmrcGrantRefresh(grantId, grant.accessExpiresAt))) return waitForRefresh(grantId, grant, tokens);

  const refreshed = await refreshTokens(grantId, grant, tokens);
  if (refreshed.outcome === "refused") {
    await deleteHmrcGrant(grantId);
    return { status: "missing" };
  }
  if (refreshed.outcome === "failed") {
    return stillValid(grant.accessExpiresAt) ? grantedResult(grant, tokens, grant.accessExpiresAt) : { status: "unavailable" };
  }
  const stored = await refreshHmrcGrant(grantId, {
    sealed: await sealFor(HMRC_GRANT_PURPOSE, refreshed.tokens, grantId),
    accessExpiresAt: refreshed.accessExpiresAt,
  });
  if (!stored) return { status: "missing" };
  return grantedResult(grant, refreshed.tokens, refreshed.accessExpiresAt);
}

/**
 * The id of the grant a request names: the x-mcp-hmrc-grant header, otherwise an Authorization
 * bearer value shaped like a grant id. A raw HMRC token is not shaped like one.
 * @param {Object} event - the Lambda event
 * @returns {string|null}
 */
export function grantIdFromEvent(event) {
  const headerValue = getHeader(event.headers, MCP_HMRC_GRANT_HEADER);
  if (headerValue) return headerValue;
  const authHeader = getHeader(event.headers, "authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const bearer = authHeader.split(" ")[1];
  return GRANT_ID_PATTERN.test(bearer ?? "") ? bearer : null;
}

async function accessTokenOfGrant(event, grantId) {
  const user = extractUserFromAuthorizerContext(event);
  if (!user || !GRANT_ID_PATTERN.test(grantId)) return HMRC_GRANT_NOT_USABLE;
  const grant = await openGrantFor(grantId, user.sub);
  if (grant.status !== "granted") {
    logger.warn({ message: "HMRC grant not usable", grantId, status: grant.status });
    return HMRC_GRANT_NOT_USABLE;
  }
  // A page that sends no hmrcAccount header means the live HMRC account, so a sandbox grant
  // cannot reach the live base URI by leaving the header out.
  const sentAccount = String(getHeader(event.headers, "hmrcAccount") || "").toLowerCase();
  const requestedAccount = grant.origin === "web" ? sentAccount || "live" : sentAccount;
  if (requestedAccount && requestedAccount !== grant.hmrcAccount) {
    logger.warn({ message: "HMRC grant is for the other HMRC account", grantId, hmrcAccount: grant.hmrcAccount });
    return HMRC_GRANT_NOT_USABLE;
  }
  return grant.accessToken;
}

/**
 * The HMRC access token of the grant a request names, HMRC_GRANT_NOT_USABLE when the request
 * names a grant that does not open (not the signed-in user's, not granted yet, expired, or for
 * the other HMRC account), and null when the request names no grant.
 * @param {Object} event - the Lambda event
 * @returns {Promise<string|Object|null>}
 */
export async function grantAccessTokenFromEvent(event) {
  const grantId = grantIdFromEvent(event);
  if (!grantId) return null;
  return accessTokenOfGrant(event, grantId);
}

/**
 * A token value a request carries in its body. A value shaped like a grant id is opened as that
 * grant; any other value is a raw token and is returned unchanged.
 * @param {Object} event - the Lambda event
 * @param {string|undefined} bodyValue
 * @returns {Promise<string|Object|undefined>}
 */
export async function resolveBodyAccessToken(event, bodyValue) {
  if (typeof bodyValue !== "string" || !GRANT_ID_PATTERN.test(bodyValue)) return bodyValue;
  return accessTokenOfGrant(event, bodyValue);
}
