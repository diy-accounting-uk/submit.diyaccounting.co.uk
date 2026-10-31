// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-07 Simulate the public demo's billing and OAuth
// - **Use when:** the public demo app needs a mock OAuth authorize URL, a mock token exchange, or fake Stripe billing.
// - **Does:** mockAuthUrlGet.js builds a mock OAuth authorize URL at GET /api/v1/mock/authUrl. mockTokenPost.js proxies POST /api/v1/mock/token to the mock server's token endpoint to avoid browser CORS and PNA restrictions. mockBilling.js fakes Stripe checkout, checkout-session lookup and the billing portal, auto-granting a bundle when Stripe is unconfigured.
// - **Run:** `import { apiEndpoint, ingestHandler } from "app/functions/non-lambda-mocks/mockAuthUrlGet.js"`; `import { apiEndpoint } from "app/functions/non-lambda-mocks/mockTokenPost.js"`; `import { apiEndpoint } from "app/functions/non-lambda-mocks/mockBilling.js"`
// - **Entry:** `app/functions/non-lambda-mocks/mockAuthUrlGet.js:ingestHandler`; `app/functions/non-lambda-mocks/mockTokenPost.js:apiEndpoint`; `app/functions/non-lambda-mocks/mockBilling.js:apiEndpoint`
// - **Files:** app/functions/non-lambda-mocks/mockAuthUrlGet.js, app/functions/non-lambda-mocks/mockTokenPost.js, app/functions/non-lambda-mocks/mockBilling.js
// - **Keywords:** public demo, mock billing, mock stripe, mock oauth, cors, pna, bundle auto-grant, non-lambda mocks
// @end-capability

// app/functions/non-lambda-mocks/mockAuthUrlGet.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http500ServerErrorResponse, buildValidationError } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";

const logger = createLogger({ source: "app/functions/non-lambda-mocks/mockAuthUrlGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/mock/authUrl", ingestHandler);
}

export function extractAndValidateParameters(event, errorMessages) {
  const queryParams = event.queryStringParameters || {};
  const { state } = queryParams;

  // Collect validation errors for required fields
  if (!state) errorMessages.push("Missing state query parameter from URL");

  return { state };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  validateEnv(["DIY_SUBMIT_BASE_URL"]);

  const { request } = extractRequest(event);
  const errorMessages = [];

  // Extract and validate parameters
  const { state } = extractAndValidateParameters(event, errorMessages);

  const responseHeaders = {};

  // Validation errors
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // Processing
  try {
    logger.info({ message: "Generating mock authorization URL", state });
    const { authUrl } = buildAuthUrl(state);

    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: { authUrl },
    });
  } catch (error) {
    logger.error({ message: "Error generating mock authorization URL", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export function buildAuthUrl(state) {
  const maybeSlash = process.env.DIY_SUBMIT_BASE_URL?.endsWith("/") ? "" : "/";
  const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithMockCallback.html`;
  // Support configurable mock OAuth2 base URL (default: Docker mock-oauth2-server)
  const mockBase = process.env.TEST_MOCK_OAUTH2_BASE || "http://localhost:8080";
  const scope = "openid somescope";

  const authUrl =
    `${mockBase}/oauth/authorize?` +
    "response_type=code" +
    "&client_id=debugger" +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}` +
    "&identity_provider=MockOAuth2Server";

  return { authUrl };
}
