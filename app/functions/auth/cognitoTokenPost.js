// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/auth/cognitoTokenPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, buildTokenExchangeResponse, buildValidationError, http200OkResponse } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/auth/cognitoTokenPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/cognito/token", ingestHandler);
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

  return result;
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
