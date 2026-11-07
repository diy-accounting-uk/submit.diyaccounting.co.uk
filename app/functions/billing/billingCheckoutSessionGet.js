// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-25 Retrieve a Stripe checkout session's status
// - **Use when:** a page after checkout must know whether a session id succeeded.
// - **Does:** The billingCheckoutSessionGet.js ingestHandler retrieves a Checkout session by id. The id prefix picks the client: `cs_test_` reads with the test-mode client only and `cs_live_` with the live client only, so a probe's test session costs no live 404. An id with neither prefix tries the live client, then the test-mode client.
// - **Run:** `GET /api/v1/billing/checkout/:id`
// - **Entry:** `app/functions/billing/billingCheckoutSessionGet.js:ingestHandler`
// - **Files:** app/functions/billing/billingCheckoutSessionGet.js, app/unit-tests/functions/billingCheckoutSessionGet.test.js
// - **Keywords:** stripe, checkout session, session status, live mode, test mode
// - **Related:** BILL-24
// @end-capability

// app/functions/billing/billingCheckoutSessionGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { initializeSalt, isHashOfSub } from "../../services/subHasher.js";
import { getStripeClient } from "../../lib/stripeClient.js";

const logger = createLogger({ source: "app/functions/billing/billingCheckoutSessionGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/billing/checkout/:id", ingestHandler);
}
/* v8 ignore stop */

/**
 * Retrieve a Stripe Checkout Session. The id prefix names the mode that created it, so
 * `cs_test_` uses the test client only and `cs_live_` the live client only. An id with neither
 * prefix tries the live client then the test client. A "resource_missing" error is treated as
 * not found rather than a failure.
 */
function clientModesFor(sessionId) {
  if (sessionId.startsWith("cs_test_")) return [true];
  if (sessionId.startsWith("cs_live_")) return [false];
  return [false, true];
}

async function retrieveCheckoutSession(sessionId) {
  for (const test of clientModesFor(sessionId)) {
    const stripe = await getStripeClient({ test });
    try {
      return await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      if (error?.code !== "resource_missing") {
        throw error;
      }
    }
  }
  return null;
}

export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch {
    return http401UnauthorizedResponse({
      request,
      headers: responseHeaders,
      message: "Authentication required",
    });
  }

  const userSub = decodedToken.sub;
  if (!userSub) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing user identity",
    });
  }

  const sessionId = event.pathParameters?.id;
  if (!sessionId) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing checkout session id",
    });
  }

  try {
    await initializeSalt();

    const session = await retrieveCheckoutSession(sessionId);
    if (!session || !isHashOfSub(userSub, session.metadata?.hashedSub)) {
      return http404NotFoundResponse({
        request,
        headers: responseHeaders,
        message: "Checkout session not found",
      });
    }

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        amountTotal: session.amount_total,
        currency: session.currency,
        bundleId: session.metadata?.bundleId,
      },
    });
  } catch (error) {
    logger.error({ message: "Failed to retrieve checkout session", error: error.message });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to retrieve checkout session",
    });
  }
}
