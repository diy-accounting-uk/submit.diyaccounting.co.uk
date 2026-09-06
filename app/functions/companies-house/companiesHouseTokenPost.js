// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/companies-house/companiesHouseTokenPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http500ServerErrorResponse,
  extractUserFromAuthorizerContext,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { getUserSub } from "../../lib/jwtHelper.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { fetchJsonWithTimeout, DEFAULT_TIMEOUTS } from "../../lib/httpFetch.js";
import { getIdentityBaseUrl, resolveClientSecret } from "../../services/companiesHouseFilingApi.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseTokenPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/companies-house/token", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
  app.head("/api/v1/companies-house/token", async (httpRequest, httpResponse) => {
    httpResponse.status(200).send();
  });
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event);
  const { code } = parsedBody || {};

  if (!code) errorMessages.push("Missing code from event body");

  return { code };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_IDENTITY_BASE_URI", "COMPANIES_HOUSE_CLIENT_ID", "DIY_SUBMIT_BASE_URL"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: {},
    });
  }

  const errorMessages = [];
  const { code } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  logger.info({ message: "Exchanging authorization code for Companies House access token" });
  let chResponse;
  try {
    chResponse = await exchangeCompaniesHouseToken(code);
  } catch (error) {
    logger.error({ message: "Companies House token exchange request failed", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House token exchange failed",
      error: { detail: error.message },
    });
  }

  if (!chResponse.ok) {
    logger.error({
      message: "Companies House token exchange rejected",
      responseCode: chResponse.status,
      responseBody: chResponse.data,
    });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House token exchange failed",
      error: { companiesHouseResponseCode: chResponse.status, responseBody: chResponse.data },
    });
  }

  // Associate the Companies House OAuth token exchange audit with the authenticated web user's
  // sub, the same fallback order hmrcTokenPost uses: Authorization header, authorizer context,
  // then the x-user-sub header.
  let userSub = getUserSub(event);
  if (!userSub) userSub = extractUserFromAuthorizerContext(event)?.sub || null;
  if (!userSub) {
    userSub = getHeader(event.headers, "x-user-sub") || null;
  }
  await publishActivityEvent({
    event: "companies-house-token-exchanged",
    summary: "Companies House token exchanged",
    userSub,
  });

  // Never return the refresh token: nothing in the browser consumes it, and holding it there
  // would put a long-lived credential where none is needed.
  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      accessToken: chResponse.data.access_token,
      expiresIn: chResponse.data.expires_in,
      tokenType: chResponse.data.token_type,
      scope: chResponse.data.scope,
    },
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing
// HTTP request/response.
export async function exchangeCompaniesHouseToken(code) {
  const clientSecret = await resolveClientSecret();
  const identityBaseUri = getIdentityBaseUrl();
  const clientId = process.env.COMPANIES_HOUSE_CLIENT_ID;
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}companies-house/filingCallback.html`;
  const url = `${identityBaseUri}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  }).toString();

  logger.info({ message: `Request to POST ${url}`, url });
  const result = await fetchJsonWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body,
    },
    DEFAULT_TIMEOUTS.SHORT,
  );
  logger.info({ message: `Response from POST ${url}`, url, status: result.status });
  return result;
}
