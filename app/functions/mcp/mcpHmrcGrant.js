// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-21 Start an HMRC grant from the MCP
// - **Use when:** a VAT (or later Income Tax) tool call through the MCP needs an HMRC access token, or the grant, its callback branch, its seal or its refresh needs tracing.
// - **Does:** request_hmrc_authorisation posts to `/api/v1/mcp/hmrc-grants` and answers HMRC's authorisation link, whose state is `mcp.<grantId>.<secret>`; the grant id stays on the MCP session. HMRC returns the user to activities/submitVatCallback.html, which sees the `mcp.` state and posts the code and state to `/api/v1/mcp/hmrc-grants/callback` (no sign-in in that browser). mcpHmrcGrant.js checks the state's hash, lets one callback claim the grant, exchanges the code, and seals the access and refresh tokens with AES-256-GCM under a key derived from the MCP blob key (`hmrc-grant` purpose in codesSeal.js). The grant item lives in the mcp-sessions table under `hmrc-grant:<grantId>`: ten minutes pending, 24 hours granted. `GET /api/v1/mcp/hmrc-grants/{grantId}` answers the access token to the owner only and uses HMRC's refresh_token grant when it is within five minutes of expiry. The hosted endpoint copies the grant id to and from the session item. No route or tool answers a token to the chat.
// - **Run:** `npm run test:mcpHmrcGrantBehaviour-simulator` walks the whole grant on the simulator lane; `npm --prefix mcp run test:system` starts a grant and files a return against the simulator.
// - **Entry:** `app/functions/mcp/mcpHmrcGrant.js`; `app/data/dynamoDbHmrcGrantRepository.js`; `mcp/lib/submit-tools.js:requestHmrcAuthorisation`; `mcp/lib/submit-tools.js:hmrcAccessTokenFor`
// - **Files:** app/functions/mcp/mcpHmrcGrant.js, app/data/dynamoDbHmrcGrantRepository.js, app/data/dynamoDbMcpSessionRepository.js, app/lib/codesSeal.js, app/functions/hmrc/hmrcTokenPost.js, app/functions/mcp/mcpHttp.js, web/public/activities/submitVatCallback.page.js, mcp/lib/submit-tools.js, mcp/lib/server.js, mcp/lib/hosted-tools.js, infra/main/java/co/uk/diyaccounting/submit/stacks/McpStack.java, behaviour-tests/mcpHmrcGrant.behaviour.test.js, app/unit-tests/functions/mcpHmrcGrant.test.js, mcp/test/hmrc-grant.test.js, ../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_MCP.md
// - **Keywords:** hmrc grant, request_hmrc_authorisation, mcp hmrc token, hmrc oauth mcp, hmrc-grants, mcp state, hmrc refresh token, submitVatCallback
// - **Related:** MCP-07, MCP-18, MCP-20
// @end-capability

// app/functions/mcp/mcpHmrcGrant.js
// The HMRC grant an MCP tool starts. A tool call requests a grant (POST, signed in) and gets
// HMRC's authorisation link, whose state is "mcp.<grantId>.<secret>". HMRC sends the user back to
// the web callback page, which posts the code and state to the callback route (public: the state
// is the capability). The route exchanges the code and seals the tokens. The MCP reads the access
// token back by the grant id (GET, signed in, owner only), refreshed when it nears its expiry.
// No route answers a token to anyone but the grant's owner.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  parseRequestBody,
  http200OkResponse,
  http201CreatedResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
  http502BadGatewayResponse,
  performTokenExchange,
  buildUpstreamRejectionResponse,
  safeHostname,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import {
  createHmrcGrant,
  getHmrcGrant,
  claimHmrcGrant,
  completeHmrcGrant,
  refreshHmrcGrant,
  deleteHmrcGrant,
} from "../../data/dynamoDbHmrcGrantRepository.js";
import { sealFor, openFor, HMRC_GRANT_PURPOSE } from "../../lib/codesSeal.js";
import { prepareTokenExchangeRequest, prepareTokenRefreshRequest } from "../hmrc/hmrcTokenPost.js";

const logger = createLogger({ source: "app/functions/mcp/mcpHmrcGrant.js" });

const GRANTS_PATH = "/api/v1/mcp/hmrc-grants";
const CALLBACK_PATH = `${GRANTS_PATH}/callback`;
const CALLBACK_PAGE_PATH = "activities/submitVatCallback.html";
const SCOPES_BY_SERVICE = {
  vat: ["read:vat", "write:vat"],
  itsa: ["read:self-assessment", "write:self-assessment"],
  agent: ["read:sent-invitations", "write:sent-invitations", "write:cancel-invitations", "read:check-relationship"],
};
const HMRC_ACCOUNTS = ["synthetic", "live"];
const STATE_PREFIX = "mcp";
const GRANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFRESH_MARGIN_SECONDS = 300;
const EXPIRED_MESSAGE = "This HMRC authorisation has expired or does not exist. Call request_hmrc_authorisation again.";

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", GRANTS_PATH, ingestHandler);
  registerLambdaRoute(app, "post", CALLBACK_PATH, ingestHandler);
  registerLambdaRoute(app, "get", `${GRANTS_PATH}/:grantId`, ingestHandler);
}
/* v8 ignore stop */

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sameHash(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function authoriseUrl({ hmrcAccount, scope, state }) {
  const synthetic = hmrcAccount === "synthetic";
  const base = (synthetic ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI).replace(/\/$/, "");
  const clientId = synthetic ? process.env.HMRC_SANDBOX_CLIENT_ID : process.env.HMRC_CLIENT_ID;
  const redirectUri = new URL(CALLBACK_PAGE_PATH, process.env.DIY_SUBMIT_BASE_URL).toString();
  const query = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope, state });
  return `${base}/oauth/authorize?${query.toString()}`;
}

function parseState(state) {
  const [prefix, grantId, secret, ...rest] = String(state ?? "").split(".");
  if (prefix !== STATE_PREFIX || !GRANT_ID.test(grantId ?? "") || !secret || rest.length > 0) return null;
  return { grantId, secret };
}

async function requestGrant(event, request, responseHeaders) {
  const user = extractUserFromAuthorizerContext(event);
  if (!user) return http401UnauthorizedResponse({ request, headers: responseHeaders, message: "Authentication required" });

  const body = parseRequestBody(event) || {};
  const services = body.services === undefined ? ["vat"] : body.services;
  const hmrcAccount = body.hmrcAccount === undefined ? "live" : body.hmrcAccount;
  const errorMessages = [];
  if (!Array.isArray(services) || services.length === 0 || !services.every((service) => SCOPES_BY_SERVICE[service])) {
    errorMessages.push(`services must list one or more of ${Object.keys(SCOPES_BY_SERVICE).join(", ")}`);
  }
  if (!HMRC_ACCOUNTS.includes(hmrcAccount)) errorMessages.push(`hmrcAccount must be one of ${HMRC_ACCOUNTS.join(", ")}`);
  if (errorMessages.length > 0) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: errorMessages.join("; "),
      error: { errors: errorMessages },
    });
  }

  const scope = [...new Set(services.flatMap((service) => SCOPES_BY_SERVICE[service]))].join(" ");
  const secret = randomBytes(32).toString("base64url");
  await initializeSalt();
  const grant = await createHmrcGrant({ hashedSub: hashSub(user.sub), hmrcAccount, scope, stateHash: sha256Hex(secret) });
  const state = `${STATE_PREFIX}.${grant.grantId}.${secret}`;
  return http201CreatedResponse({
    request,
    headers: responseHeaders,
    data: {
      grantId: grant.grantId,
      url: authoriseUrl({ hmrcAccount, scope, state }),
      expiresAt: new Date(grant.ttl * 1000).toISOString(),
      scope,
      hmrcAccount,
    },
  });
}

async function callback(event, request, responseHeaders) {
  const body = parseRequestBody(event) || {};
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const parsed = parseState(body.state);
  if (!code || !parsed) {
    return http400BadRequestResponse({ request, headers: responseHeaders, message: "code and an MCP state are required", error: {} });
  }

  const grant = await getHmrcGrant(parsed.grantId);
  if (!grant || !sameHash(grant.stateHash, sha256Hex(parsed.secret))) {
    return http404NotFoundResponse({
      request,
      headers: responseHeaders,
      message: "This HMRC link has expired or does not exist",
      error: {},
    });
  }
  if (!(await claimHmrcGrant(parsed.grantId))) {
    return http409ConflictResponse({ request, headers: responseHeaders, message: "This HMRC link was already used", error: {} });
  }

  await initializeSalt();
  const exchangeRequest = await prepareTokenExchangeRequest(code, grant.hmrcAccount);
  const exchanged = await exchangeOrFail(request, responseHeaders, exchangeRequest, parsed.grantId);
  if (exchanged.failure) {
    await deleteHmrcGrant(parsed.grantId);
    return exchanged.failure;
  }

  const { accessToken, responseBody } = exchanged;
  await completeHmrcGrant(parsed.grantId, {
    sealed: await sealFor(HMRC_GRANT_PURPOSE, { accessToken, refreshToken: responseBody.refresh_token ?? null }, parsed.grantId),
    accessExpiresAt: nowSeconds() + Number(responseBody.expires_in ?? 0),
    scope: responseBody.scope || grant.scope,
  });
  logger.info({ message: "MCP HMRC grant completed", grantId: parsed.grantId, hmrcAccount: grant.hmrcAccount });
  return http200OkResponse({ request, headers: responseHeaders, data: { state: "granted" } });
}

// The token request is audited under the grant, since the callback carries no signed-in user.
async function exchangeOrFail(request, responseHeaders, { url, body }, grantId) {
  let result;
  try {
    result = await performTokenExchange(url, body, `mcp-hmrc-grant:${grantId}`);
  } catch (error) {
    logger.error({ message: "HMRC token request failed", error: error.message });
    return {
      failure: http502BadGatewayResponse({
        request,
        headers: responseHeaders,
        message: "Unable to reach the upstream token endpoint",
        error: { upstream: safeHostname(url) },
      }),
    };
  }
  if (!result.response.ok || !result.accessToken) {
    return {
      failure: buildUpstreamRejectionResponse({
        request,
        upstreamHost: safeHostname(url),
        responseStatus: result.response.ok ? 502 : result.response.status,
        responseBody: result.responseBody,
        headers: responseHeaders,
      }),
    };
  }
  return result;
}

async function read(event, grantId, request, responseHeaders) {
  const user = extractUserFromAuthorizerContext(event);
  if (!user) return http401UnauthorizedResponse({ request, headers: responseHeaders, message: "Authentication required" });
  await initializeSalt();
  const grant = await getHmrcGrant(grantId);
  if (!grant || grant.hashedSub !== hashSub(user.sub)) {
    return http404NotFoundResponse({ request, headers: responseHeaders, message: EXPIRED_MESSAGE, error: {} });
  }
  if (grant.state !== "granted") {
    return http200OkResponse({ request, headers: responseHeaders, data: { status: "pending", hmrcAccount: grant.hmrcAccount } });
  }

  let tokens = await openFor(HMRC_GRANT_PURPOSE, grant.sealed, grantId);
  let accessExpiresAt = grant.accessExpiresAt;
  if (accessExpiresAt - REFRESH_MARGIN_SECONDS <= nowSeconds()) {
    if (!tokens.refreshToken) {
      return http404NotFoundResponse({ request, headers: responseHeaders, message: EXPIRED_MESSAGE, error: {} });
    }
    const refreshRequest = await prepareTokenRefreshRequest(tokens.refreshToken, grant.hmrcAccount);
    const refreshed = await exchangeOrFail(request, responseHeaders, refreshRequest, grantId);
    if (refreshed.failure) {
      await deleteHmrcGrant(grantId);
      return http404NotFoundResponse({ request, headers: responseHeaders, message: EXPIRED_MESSAGE, error: {} });
    }
    tokens = { accessToken: refreshed.accessToken, refreshToken: refreshed.responseBody.refresh_token ?? tokens.refreshToken };
    accessExpiresAt = nowSeconds() + Number(refreshed.responseBody.expires_in ?? 0);
    await refreshHmrcGrant(grantId, { sealed: await sealFor(HMRC_GRANT_PURPOSE, tokens, grantId), accessExpiresAt });
  }
  return http200OkResponse({
    request,
    headers: responseHeaders,
    data: {
      status: "granted",
      accessToken: tokens.accessToken,
      expiresAt: new Date(accessExpiresAt * 1000).toISOString(),
      scope: grant.scope,
      hmrcAccount: grant.hmrcAccount,
    },
  });
}

export async function ingestHandler(event) {
  validateEnv([
    "MCP_SESSIONS_DYNAMODB_TABLE_NAME",
    "DIY_SUBMIT_BASE_URL",
    "HMRC_BASE_URI",
    "HMRC_CLIENT_ID",
    "HMRC_SANDBOX_BASE_URI",
    "HMRC_SANDBOX_CLIENT_ID",
  ]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const method = event?.requestContext?.http?.method;
  const path = event?.requestContext?.http?.path ?? event?.path ?? "";
  const grantId = event?.pathParameters?.grantId;

  try {
    if (method === "POST" && path.endsWith(CALLBACK_PATH)) return await callback(event, request, responseHeaders);
    if (method === "POST" && !grantId) return await requestGrant(event, request, responseHeaders);
    if (method === "GET" && grantId) {
      if (!GRANT_ID.test(grantId)) {
        return http404NotFoundResponse({ request, headers: responseHeaders, message: EXPIRED_MESSAGE, error: {} });
      }
      return await read(event, grantId, request, responseHeaders);
    }
    return http404NotFoundResponse({ request, headers: responseHeaders, message: "Not found", error: {} });
  } catch (error) {
    logger.error({ message: "HMRC grant request failed", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({ request, headers: responseHeaders, message: "Internal server error", error: {} });
  }
}
