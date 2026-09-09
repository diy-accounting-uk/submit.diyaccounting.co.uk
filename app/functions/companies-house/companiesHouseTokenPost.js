// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseTokenPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http502BadGatewayResponse,
  buildUpstreamRejectionResponse,
  safeHostname,
  extractUserFromAuthorizerContext,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { getUserSub } from "../../lib/jwtHelper.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent, publishActivityFailureEvent } from "../../lib/activityAlert.js";
import { fetchJsonWithTimeout, DEFAULT_TIMEOUTS } from "../../lib/httpFetch.js";
import { getIdentityBaseUrl, resolveClientSecret } from "../../services/companiesHouseFilingApi.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseTokenPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/token", ingestHandler);
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

  // Associate the Companies House OAuth token exchange audit with the authenticated web user's
  // sub, the same fallback order hmrcTokenPost uses: Authorization header, authorizer context,
  // then the x-user-sub header.
  let userSub = getUserSub(event);
  if (!userSub) userSub = extractUserFromAuthorizerContext(event)?.sub || null;
  if (!userSub) {
    userSub = getHeader(event.headers, "x-user-sub") || null;
  }

  const upstreamHost = safeHostname(getIdentityBaseUrl());

  logger.info({ message: "Exchanging authorization code for Companies House access token" });
  let chResponse;
  try {
    chResponse = await exchangeCompaniesHouseToken(code);
  } catch (error) {
    logger.error({ message: "Companies House token exchange request failed", error: error.message, stack: error.stack });
    const unreachable = http502BadGatewayResponse({
      request,
      headers: { ...responseHeaders },
      message: "Unable to reach the Companies House token endpoint",
      error: { upstream: upstreamHost },
    });
    await publishActivityFailureEvent({
      event: "companies-house-token-exchange-failed",
      summary: "Companies House token exchange failed",
      failure: "companies-house-upstream-error",
      userSub,
      detail: { companiesHouseStatus: unreachable.statusCode },
    });
    return unreachable;
  }

  if (!chResponse.ok) {
    // A 4xx here is Companies House rejecting the caller's authorisation code or consent,
    // not a failure of ours; a 5xx is Companies House's own outage. Publish the failure
    // after Companies House's reply, not before, so the event records what actually happened.
    const rejection = buildUpstreamRejectionResponse({
      request,
      upstreamHost,
      responseStatus: chResponse.status,
      responseBody: chResponse.data,
      headers: { ...responseHeaders },
    });
    const responseBody = JSON.parse(rejection.body);
    await publishActivityFailureEvent({
      event: "companies-house-token-exchange-failed",
      summary: "Companies House token exchange failed",
      failure: responseBody.error || "companies-house-upstream-error",
      userSub,
      detail: { companiesHouseStatus: responseBody.responseCode ?? rejection.statusCode },
    });
    return rejection;
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
