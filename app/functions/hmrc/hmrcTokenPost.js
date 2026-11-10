// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability HMRC-23 Exchange an HMRC OAuth code for a token
// - **Use when:** an OAuth authorisation code from HMRC must become an access token.
// - **Does:** hmrcTokenPost.js's ingestHandler calls prepareTokenExchangeRequest to build the token request, then exchangeOrFail executes it and the handler seals HMRC's tokens into a web grant in the mcp-sessions table (createGrantedHmrcGrant). It answers the grant id as `accessToken` and `hmrcGrantId` with the expiry and scope, and never a token. It reads the application's client secret from Secrets Manager.
// - **Run:** `POST /api/v1/hmrc/token`
// - **Entry:** `app/functions/hmrc/hmrcTokenPost.js:ingestHandler`; `app/functions/hmrc/hmrcTokenPost.js:prepareTokenExchangeRequest`
// - **Files:** app/functions/hmrc/hmrcTokenPost.js, app/unit-tests/functions/hmrcTokenPost.test.js, app/system-tests/hmrcAuth.system.test.js, web/public/activities/submitVatCallback.html, web/browser-tests/submitVatCallback.browser.test.js, web/public/lib/hmrc-scope-check.js, behaviour-tests/steps/behaviour-hmrc-steps.js, app/data/dynamoDbHmrcGrantRepository.js
// - **Keywords:** oauth, authorisation code, access token, hmrc token exchange, client secret, secrets manager
// - **Related:** HMRC-33, MCP-21
// @end-capability

// app/functions/hmrc/hmrcTokenPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  performTokenExchange,
  buildValidationError,
  buildUpstreamRejectionResponse,
  http200OkResponse,
  http401UnauthorizedResponse,
  http502BadGatewayResponse,
  extractUserFromAuthorizerContext,
  getHeader,
  safeHostname,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { readSecret, refreshAfterAuthFailure } from "../../lib/cachedSecret.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { createGrantedHmrcGrant } from "../../data/dynamoDbHmrcGrantRepository.js";
import { sealFor, HMRC_GRANT_PURPOSE } from "../../lib/codesSeal.js";
import { publishActivityEvent, publishActivityFailureEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcTokenPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/hmrc/token", ingestHandler);
  app.head("/api/v1/hmrc/token", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { code } = parsedBody || {};

  // Collect validation errors for required fields
  if (!code) errorMessages.push("Missing code from event body");

  // Extract HMRC account (synthetic/live) from header hmrcAccount
  const hmrcAccountHeader = getHeader(event.headers, "hmrcAccount") || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "synthetic" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'synthetic' or 'live' if provided.");
  }

  return { code, hmrcAccount };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  // Allow local/dev override via HMRC_CLIENT_SECRET. Only require ARN if override is not supplied.
  const required = [
    "HMRC_BASE_URI",
    "HMRC_CLIENT_ID",
    "HMRC_SANDBOX_BASE_URI",
    "HMRC_SANDBOX_CLIENT_ID",
    "DIY_SUBMIT_BASE_URL",
    "BUNDLE_DYNAMODB_TABLE_NAME",
    "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
    "MCP_SESSIONS_DYNAMODB_TABLE_NAME",
  ];
  // if (!process.env.HMRC_CLIENT_SECRET) required.push("HMRC_CLIENT_SECRET_ARN");
  // if (!process.env.HMRC_SANDBOX_CLIENT_SECRET) required.push("HMRC_SANDBOX_CLIENT_SECRET_ARN");
  validateEnv(required);

  const { request } = extractRequest(event);
  const errorMessages = [];

  // If HEAD request, return 200 OK immediately
  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  }

  // The route sits behind the JWT authorizer, so the caller's sub comes from its context.
  // It also reads the email claim into context, which resolveActorClass() below needs to
  // tell this customer from a probe calling the endpoint directly.
  const userSub = extractUserFromAuthorizerContext(event)?.sub || null;
  if (!userSub) {
    return http401UnauthorizedResponse({ request, headers: {}, message: "Authentication required" });
  }

  // Extract and validate parameters
  const { code, hmrcAccount } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = {};

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  logger.info({ message: "Exchanging authorization code for HMRC access token" });
  const tokenResponse = await prepareTokenExchangeRequest(code, hmrcAccount);
  const exchanged = await exchangeOrFail(request, responseHeaders, tokenResponse, userSub, hmrcAccount);

  if (exchanged.failure) {
    const responseBody = JSON.parse(exchanged.failure.body);
    await publishActivityFailureEvent({
      event: "hmrc-token-exchange-failed",
      summary: "HMRC token exchange failed",
      failure: responseBody.error || "hmrc-upstream-error",
      userSub,
      detail: { hmrcStatus: responseBody.responseCode ?? exchanged.failure.statusCode },
    });
    return exchanged.failure;
  }

  // Publish after HMRC's reply, not before, so the event records what actually happened.
  await publishActivityEvent({
    event: "hmrc-token-exchanged",
    summary: "HMRC token exchanged",
    userSub,
  });

  const { accessToken, responseBody } = exchanged;
  const grantAccount = hmrcAccount === "synthetic" ? "synthetic" : "live";
  const expiresIn = Number(responseBody.expires_in ?? 0);
  const { grantId } = await createGrantedHmrcGrant({
    hashedSub: hashSub(userSub),
    hmrcAccount: grantAccount,
    scope: responseBody.scope ?? "",
    accessExpiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    seal: (id) => sealFor(HMRC_GRANT_PURPOSE, { accessToken, refreshToken: responseBody.refresh_token ?? null }, id),
  });
  logger.info({ message: "HMRC token exchanged and sealed into a grant", grantId, hmrcAccount: grantAccount, scope: responseBody.scope });
  return http200OkResponse({
    request,
    data: {
      accessToken: grantId,
      hmrcGrantId: grantId,
      expiresIn: responseBody.expires_in,
      tokenType: responseBody.token_type,
      scope: responseBody.scope,
      hmrcAccount: grantAccount,
    },
  });
}

/**
 * Runs HMRC's token request for a grant. Answers HMRC's reply with the access token, or a
 * `failure` response when HMRC is unreachable or rejects the request.
 * @param {object} request
 * @param {object} responseHeaders
 * @param {{url: string, body: object}} exchangeRequest
 * @param {string} auditFor - the audit key the request is recorded under
 * @param {string} hmrcAccount - "synthetic" or "live"
 */
export async function exchangeOrFail(request, responseHeaders, { url, body }, auditFor, hmrcAccount) {
  let result;
  try {
    result = await performHmrcTokenExchange(url, body, auditFor, hmrcAccount);
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

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
// Prepares the URL and body for a token exchange request, but does not execute the exchange itself
export async function prepareTokenExchangeRequest(code, hmrcAccount) {
  const secretArn = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN : process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_CLIENT_SECRET : process.env.HMRC_CLIENT_SECRET;
  const clientSecret = await retrieveHmrcClientSecret(hmrcAccount === "synthetic" ? "synthetic" : "live", overrideSecret, secretArn);
  const hmrcBaseUri = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcClientId = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_CLIENT_ID : process.env.HMRC_CLIENT_ID;
  const url = `${hmrcBaseUri}/oauth/token`;
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const body = {
    grant_type: "authorization_code",
    client_id: hmrcClientId,
    client_secret: clientSecret,
    redirect_uri: `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`,
    code,
  };

  return { url, body };
}

// Prepares the URL and body for HMRC's refresh_token grant, with the same client credentials as the code exchange.
export async function prepareTokenRefreshRequest(refreshToken, hmrcAccount) {
  const secretArn = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN : process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_CLIENT_SECRET : process.env.HMRC_CLIENT_SECRET;
  const clientSecret = await retrieveHmrcClientSecret(hmrcAccount === "synthetic" ? "synthetic" : "live", overrideSecret, secretArn);
  const hmrcBaseUri = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcClientId = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_CLIENT_ID : process.env.HMRC_CLIENT_ID;
  return {
    url: `${hmrcBaseUri}/oauth/token`,
    body: { grant_type: "refresh_token", client_id: hmrcClientId, client_secret: clientSecret, refresh_token: refreshToken },
  };
}

async function retrieveHmrcClientSecret(account, overrideSecret, secretArn) {
  logger.info({ message: "Retrieving HMRC client secret", account });
  if (overrideSecret) return overrideSecret;
  return readSecret(secretArn);
}

/**
 * The client secret a rejected token request should try again with, or null when there is none.
 * HMRC answers a rolled client secret with 401 invalid_client. One forced read of the secret
 * gives the new value, only when the secret now holds another one.
 * @param {string} hmrcAccount - "synthetic" or "live"
 * @param {string} usedSecret - the client secret the rejected request carried
 * @returns {Promise<string|null>}
 */
export async function refreshedHmrcClientSecret(hmrcAccount, usedSecret) {
  const overrideSecret = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_CLIENT_SECRET : process.env.HMRC_CLIENT_SECRET;
  if (overrideSecret) return null;
  const secretArn = hmrcAccount === "synthetic" ? process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN : process.env.HMRC_CLIENT_SECRET_ARN;
  return refreshAfterAuthFailure(secretArn, usedSecret);
}

/**
 * performTokenExchange for a request that prepareTokenExchangeRequest or prepareTokenRefreshRequest built.
 * A rejection for the client credentials runs the request once more with a refreshed client secret.
 */
export async function performHmrcTokenExchange(url, body, auditForUserSub, hmrcAccount) {
  const result = await performTokenExchange(url, body, auditForUserSub, { org: "hmrc" });
  if (result.response.ok || result.responseBody?.error !== "invalid_client") return result;
  const refreshedSecret = await refreshedHmrcClientSecret(hmrcAccount, body.client_secret);
  if (!refreshedSecret) return result;
  return performTokenExchange(url, { ...body, client_secret: refreshedSecret }, auditForUserSub, { org: "hmrc" });
}
