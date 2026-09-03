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
    return http401UnauthorizedResponse({
      request,
      headers: responseHeaders,
      message: "Missing user identity",
    });
  }

  const sessionId = event.pathParameters?.id;
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Invalid checkout session id",
    });
  }

  try {
    await initializeSalt();
    const hashedSub = hashSub(userSub);

    // The session id carries its own Stripe mode, so the right key is knowable without a lookup.
    const isSandbox = sessionId.startsWith("cs_test_");
    const stripe = await getStripeClient({ test: isSandbox });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session?.metadata?.hashedSub !== hashedSub) {
      logger.warn({ message: "Checkout session does not belong to the caller", sessionId });
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
        bundleId: session.metadata.bundleId,
      },
    });
  } catch (error) {
    logger.error({ message: "Failed to retrieve checkout session", sessionId, error: error.message });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to retrieve checkout session",
    });
  }
}
