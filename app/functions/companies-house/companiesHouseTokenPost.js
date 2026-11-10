// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-01 Exchange a Companies House OAuth token
// - **Use when:** a filing journey has an authorization code and needs an access token for the session.
// - **Does:** companiesHouseTokenPost.js exchanges an OAuth authorization code for a Companies House access token. It seals the access token into a grant in the sessions table, bound to the user and to the company the requested scope names, and returns the grant id, the expiry and the token type. The refresh token is dropped.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/companies-house/companiesHouseTokenPost.js:ingestHandler`; `web/public/companies-house/filingCallback.html`
// - **Files:** app/functions/companies-house/companiesHouseTokenPost.js, app/unit-tests/functions/companiesHouseTokenPost.test.js, web/public/companies-house/filingCallback.html, web/browser-tests/filingCallback.browser.test.js
// - **Keywords:** oauth, token exchange, authorization code, companies house, filing callback, session storage, access token, identity
// - **Related:** CH-02, CH-09
// @end-capability

// app/functions/companies-house/companiesHouseTokenPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http401UnauthorizedResponse,
  http502BadGatewayResponse,
  buildUpstreamRejectionResponse,
  safeHostname,
  extractUserFromAuthorizerContext,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { publishActivityEvent, publishActivityFailureEvent } from "../../lib/activityAlert.js";
import { DEFAULT_TIMEOUTS } from "../../lib/httpFetch.js";
import { sendJsonToCompaniesHouse } from "../../services/companiesHouseSend.js";
import { getIdentityBaseUrl, resolveClientSecret } from "../../services/companiesHouseFilingApi.js";
import { refreshAfterAuthFailure } from "../../lib/cachedSecret.js";
import { createCompaniesHouseGrant } from "../../data/dynamoDbCompaniesHouseGrantRepository.js";
import { sealFor, COMPANIES_HOUSE_GRANT_PURPOSE } from "../../lib/codesSeal.js";
import { companyNumberFromScope } from "../../lib/companiesHouseGrantAccess.js";

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
  const { code, scope } = parsedBody || {};

  if (!code) errorMessages.push("Missing code from event body");
  if (scope !== undefined && (typeof scope !== "string" || !companyNumberFromScope(scope))) {
    errorMessages.push("The scope must name a company as /company/<number>/");
  }

  return { code, scope };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv([
    "COMPANIES_HOUSE_IDENTITY_BASE_URI",
    "COMPANIES_HOUSE_CLIENT_ID",
    "DIY_SUBMIT_BASE_URL",
    "MCP_SESSIONS_DYNAMODB_TABLE_NAME",
  ]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: {},
    });
  }

  // The route sits behind the JWT authorizer, so the caller's sub comes from its context.
  const userSub = extractUserFromAuthorizerContext(event)?.sub || null;
  if (!userSub) {
    return http401UnauthorizedResponse({ request, headers: { ...responseHeaders }, message: "Authentication required" });
  }

  const errorMessages = [];
  const { code, scope } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
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

  // The access token stays on the server, sealed against the grant id. The refresh token is
  // dropped: a filing takes minutes and the access token lasts an hour. The Companies House
  // token response has no scope field, so the grant records the scope the page requested.
  const expiresIn = Number(chResponse.data.expires_in ?? 0);
  const { grantId } = await createCompaniesHouseGrant({
    hashedSub: hashSub(userSub),
    scope: scope ?? null,
    companyNumber: companyNumberFromScope(scope),
    accessExpiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    seal: (id) => sealFor(COMPANIES_HOUSE_GRANT_PURPOSE, { accessToken: chResponse.data.access_token }, id),
  });
  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      accessToken: grantId,
      companiesHouseGrantId: grantId,
      expiresIn: chResponse.data.expires_in,
      tokenType: chResponse.data.token_type,
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
  const send = async (secret) => {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: secret,
      redirect_uri: redirectUri,
    }).toString();
    logger.info({ message: `Request to POST ${url}`, url });
    const response = await sendJsonToCompaniesHouse(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body,
      },
      DEFAULT_TIMEOUTS.SHORT,
      { api: "POST /oauth2/token" },
    );
    logger.info({ message: `Response from POST ${url}`, url, status: response.status });
    return response;
  };

  const result = await send(clientSecret);
  if (result.status === 401 && !process.env.COMPANIES_HOUSE_CLIENT_SECRET) {
    // A 401 means the client secret was rolled. One forced read of the secret, and one more
    // request, only when the secret now holds another value.
    const refreshedSecret = await refreshAfterAuthFailure(process.env.COMPANIES_HOUSE_CLIENT_SECRET_ARN, clientSecret);
    if (refreshedSecret) return send(refreshedSecret);
  }
  return result;
}
