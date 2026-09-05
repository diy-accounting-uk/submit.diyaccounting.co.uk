// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getStripeClient } from "../../lib/stripeClient.js";

const logger = createLogger({ source: "app/functions/billing/billingCheckoutSessionGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/billing/checkout-session/:id", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

/**
 * Retrieve a Stripe Checkout Session, trying the live client then the test-mode client.
 * A session id is only ever valid in the mode it was created in, so the wrong client
 * raises a "resource_missing" error, which is treated as not found rather than a failure.
 */
async function retrieveCheckoutSession(sessionId) {
  for (const test of [false, true]) {
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
    const hashedSub = hashSub(userSub);

    const session = await retrieveCheckoutSession(sessionId);
    if (!session || session.metadata?.hashedSub !== hashedSub) {
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
