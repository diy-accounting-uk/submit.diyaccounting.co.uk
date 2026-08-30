// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/hmrc/hmrcTokenPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildTokenExchangeResponse,
  buildValidationError,
  http200OkResponse,
  extractUserFromAuthorizerContext,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { getUserSub } from "../../lib/jwtHelper.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcTokenPost.js" });

let secretsClient = null;
let cachedHmrcClientSecret;

// Lazy initialization of SecretsManagerClient
async function getSecretsClient() {
  if (!secretsClient) {
    const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
    secretsClient = new SecretsManagerClient();
  }
  return secretsClient;
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/hmrc/token", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
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

  // Extract HMRC account (sandbox/live) from header hmrcAccount
  const hmrcAccountHeader = getHeader(event.headers, "hmrcAccount") || "";
  const hmrcAccount = hmrcAccountHeader.toLowerCase();
  if (hmrcAccount && hmrcAccount !== "sandbox" && hmrcAccount !== "live") {
    errorMessages.push("Invalid hmrcAccount header. Must be either 'sandbox' or 'live' if provided.");
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
  // Ensure HMRC OAuth token exchange audit is associated with the authenticated web user's sub
  // Try Authorization header, then authorizer context, then custom x-user-sub header (case-insensitive)
  let userSub = getUserSub(event);
  if (!userSub) userSub = extractUserFromAuthorizerContext(event)?.sub || null;
  if (!userSub) {
    userSub = getHeader(event.headers, "x-user-sub") || null;
  }
  await publishActivityEvent({
    event: "hmrc-token-exchanged",
    summary: "HMRC token exchanged",
    userSub,
  });
  return buildTokenExchangeResponse(request, tokenResponse.url, tokenResponse.body, userSub);
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
// Prepares the URL and body for a token exchange request, but does not execute the exchange itself
export async function prepareTokenExchangeRequest(code, hmrcAccount) {
  const secretArn = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_SECRET_ARN : process.env.HMRC_CLIENT_SECRET_ARN;
  const overrideSecret = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_SECRET : process.env.HMRC_CLIENT_SECRET;
  const clientSecret = await retrieveHmrcClientSecret(overrideSecret, secretArn);
  const hmrcBaseUri = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  const hmrcClientId = hmrcAccount === "sandbox" ? process.env.HMRC_SANDBOX_CLIENT_ID : process.env.HMRC_CLIENT_ID;
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

async function retrieveHmrcClientSecret(overrideSecret, secretArn) {
  logger.info("Retrieving HMRC client secret from arn " + secretArn);
  if (overrideSecret) {
    cachedHmrcClientSecret = overrideSecret;
    logger.info(`Secret retrieved from override and cached`);
  } else if (!cachedHmrcClientSecret) {
    const client = await getSecretsClient();
    const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const data = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    cachedHmrcClientSecret = data.SecretString;
    logger.info(`Secret retrieved from Secrets Manager with Arn ${secretArn} and cached`);
  }
  return cachedHmrcClientSecret;
}
