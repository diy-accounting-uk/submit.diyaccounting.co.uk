// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/billing/billingPortalGet.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/functions/billing/billingPortalGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.get("/api/v1/billing/portal", async (httpRequest, httpResponse) => {
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

  try {
    await initializeSalt();
    const bundles = await getUserBundles(userSub);

    // Find a bundle with a Stripe customer ID
    const subscriptionBundle = bundles.find((b) => b.stripeCustomerId);
    if (!subscriptionBundle) {
      return http404NotFoundResponse({
        request,
        headers: responseHeaders,
        message: "No active subscription found",
      });
    }

    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "https://submit.diyaccounting.co.uk/";
    const isStripeTestMode = subscriptionBundle.qualifiers?.stripeTestMode === true;
    const stripe = await getStripeClient({ test: isStripeTestMode });

    const session = await stripe.billingPortal.sessions.create({
      customer: subscriptionBundle.stripeCustomerId,
      return_url: `${baseUrl}bundles.html`,
    });

    logger.info({ message: "Billing portal session created", hashedSub: hashSub(userSub) });

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: { portalUrl: session.url },
    });
  } catch (error) {
    logger.error({ message: "Failed to create billing portal session", error: error.message });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to create billing portal session",
    });
  }
}
