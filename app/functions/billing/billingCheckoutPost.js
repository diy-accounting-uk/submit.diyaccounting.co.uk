// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/billing/billingCheckoutPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/billing/billingCheckoutPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/v1/billing/checkout-session", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
/* v8 ignore stop */

/**
 * Resolve the Stripe price ID based on bundleId and sandbox mode.
 * Env var pattern: STRIPE_[TEST_]PRICE_ID_RESIDENT_PRO, STRIPE_[TEST_]PRICE_ID_RESIDENT_VAT, etc.
 */
function resolveStripePriceId(bundleId, isSandbox) {
  const suffix = `_${bundleId.toUpperCase().replace(/-/g, "_")}`;
  const prefix = isSandbox ? "STRIPE_TEST_PRICE_ID" : "STRIPE_PRICE_ID";
  const envVar = `${prefix}${suffix}`;
  const price = process.env[envVar];
  if (price) return price;
  logger.warn({ message: `No ${envVar} configured`, bundleId, isSandbox });
  return undefined;
}

export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Decode JWT to get user identity
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
  const userEmail = decodedToken.email || "";

  if (!userSub) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing user identity",
    });
  }

  try {
    await initializeSalt();
    const hashedSub = hashSub(userSub);

    // Determine sandbox mode: bundle qualifiers are the source of truth (same pattern as billingPortalGet.js)
    const userBundles = await getUserBundles(userSub);
    const hasSandboxBundle = userBundles.some((b) => b.qualifiers?.sandbox === true);

    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
    const isSandbox = hasSandboxBundle || body.sandbox === true || event.headers?.["hmrcaccount"] === "sandbox";
    let sandboxSource = "none";
    if (hasSandboxBundle) sandboxSource = "bundle-qualifier";
    else if (body.sandbox === true) sandboxSource = "request-body";
    else if (event.headers?.["hmrcaccount"] === "sandbox") sandboxSource = "hmrcaccount-header";
    logger.info({ message: "Sandbox mode resolved", isSandbox, sandboxSource });

    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "https://submit.diyaccounting.co.uk/";
    const bundleId = body.bundleId || "resident-pro";
    const priceId = resolveStripePriceId(bundleId, isSandbox);

    if (!priceId) {
      logger.error({ message: "No Stripe price ID configured", bundleId, isSandbox });
      return http500ServerErrorResponse({
        request,
        headers: responseHeaders,
        message: "Payment configuration error",
      });
    }

    const stripe = await getStripeClient({ test: isSandbox });

    logger.info({ message: "Creating checkout session", isSandbox, bundleId, priceId: priceId.substring(0, 20) + "..." });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: userEmail,
      client_reference_id: hashedSub,
      metadata: { hashedSub, bundleId },
      subscription_data: {
        metadata: { hashedSub, bundleId },
      },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}bundles.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}bundles.html?checkout=canceled`,
    });

    logger.info({ message: "Checkout session created", sessionId: session.id, hashedSub, isSandbox });

    await publishActivityEvent({
      event: "checkout-session-created",
      site: "submit",
      summary: `Checkout started: ${maskEmail(userEmail)}`,
      actor: classifyActor(userEmail, decodedToken["cognito:username"] ? "cognito-native" : undefined),
      flow: "user-journey",
      userSub,
    });

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: { checkoutUrl: session.url },
    });
  } catch (error) {
    logger.error({ message: "Failed to create checkout session", error: error.message });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to create checkout session",
    });
  }
}
