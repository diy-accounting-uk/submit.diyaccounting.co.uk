// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/auth/cognitoTokenPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, buildTokenExchangeResponse, buildValidationError, http200OkResponse } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/auth/cognitoTokenPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/cognito/token", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/cognito/token", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const decoded = Buffer.from(event.body || "", "base64").toString("utf-8");
  const searchParams = new URLSearchParams(decoded);

  const grantType = searchParams.get("grant_type");
  const code = searchParams.get("code");
  const refreshToken = searchParams.get("refresh_token");

  if (!grantType) {
    errorMessages.push("Missing grant_type from event body");
    return {};
  }

  if (grantType === "authorization_code") {
    if (!code) errorMessages.push("Missing code from event body");
    return { grantType, code };
  }

  if (grantType === "refresh_token") {
    if (!refreshToken) errorMessages.push("Missing refresh_token from event body");
    return { grantType, refreshToken };
  }

  errorMessages.push(`Unsupported grant_type: ${grantType}`);
  return {};
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["DIY_SUBMIT_BASE_URL", "COGNITO_CLIENT_ID", "COGNITO_BASE_URI"]);

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

  // Extract and validate parameters
  const { grantType, code, refreshToken } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, {});
  }

  let tokenResponse;

  if (grantType === "authorization_code") {
    logger.info({ message: "Exchanging authorization code for Cognito access token" });
    tokenResponse = await exchangeCodeForToken(code);
  } else if (grantType === "refresh_token") {
    logger.info({ message: "Refreshing Cognito access token" });
    tokenResponse = await exchangeRefreshTokenForToken(refreshToken);
  }

  const result = await buildTokenExchangeResponse(request, tokenResponse.url, tokenResponse.body);

  // Publish activity event after token exchange so we can classify the user from the ID token
  const { email, provider, sub } = extractUserInfoFromResponse(result);
  const actor = classifyActor(email);
  const eventName = grantType === "authorization_code" ? "login" : "token-refresh";
  const label = grantType === "authorization_code" ? "Login" : "Token refresh";
  const providerLabel = provider ? ` via ${provider}` : "";
  const emailLabel = email ? `: ${maskEmail(email)}` : "";
  await publishActivityEvent({
    event: eventName,
    summary: `${label}${providerLabel}${emailLabel}`,
    actor,
    flow: "user-journey",
    userSub: sub || undefined,
  });

  return result;
}

/**
 * Extract email, identity provider and subject from the token exchange response.
 * Decodes the ID token JWT payload (no signature verification needed —
 * Cognito just issued it). Returns { email, provider, sub } or empty strings.
 */
export function extractUserInfoFromResponse(result) {
  try {
    if (result.statusCode !== 200) return { email: "", provider: "", sub: "" };
    const body = JSON.parse(result.body);
    if (!body.idToken) return { email: "", provider: "", sub: "" };
    const payload = JSON.parse(Buffer.from(body.idToken.split(".")[1], "base64url").toString());
    const email = payload.email || "";
    const sub = payload.sub || "";
    // Cognito federated users have an 'identities' claim (JSON string of provider array)
    let provider = "";
    if (payload.identities) {
      const identities = typeof payload.identities === "string" ? JSON.parse(payload.identities) : payload.identities;
      if (Array.isArray(identities) && identities.length > 0) {
        provider = identities[0].providerName || "";
      }
    }
    return { email, provider, sub };
  } catch (err) {
    logger.warn({ message: "Failed to extract user info from token response", error: err.message });
    return { email: "", provider: "", sub: "" };
  }
}

// Service adaptor: authorization_code
export async function exchangeCodeForToken(code) {
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithCognitoCallback.html`;

  const url = `${process.env.COGNITO_BASE_URI}/oauth2/token`;

  return {
    url,
    body: {
      grant_type: "authorization_code",
      client_id: process.env.COGNITO_CLIENT_ID,
      redirect_uri: redirectUri,
      code,
    },
  };
}

// Service adaptor: refresh_token
export async function exchangeRefreshTokenForToken(refreshToken) {
  const url = `${process.env.COGNITO_BASE_URI}/oauth2/token`;

  return {
    url,
    body: {
      grant_type: "refresh_token",
      client_id: process.env.COGNITO_CLIENT_ID,
      refresh_token: refreshToken,
    },
  };
}
