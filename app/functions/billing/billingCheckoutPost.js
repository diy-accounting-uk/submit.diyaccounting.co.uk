// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/billing/billingCheckoutPost.js

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";
import { resolveAllowedReturnTo } from "./billingReturnUrl.js";
import {
  loadCatalogFromRoot,
  getCatalogBundleById,
  isBundleListedInEnvironment,
  getBundlePrices,
  getBundlePriceForInterval,
} from "../../services/productCatalog.js";

const logger = createLogger({ source: "app/functions/billing/billingCheckoutPost.js" });

// A checkout request names an interval as "annual" or "monthly"; the catalogue's prices
// use Stripe's own interval names ("year", "month"). Annual is the default billing interval.
const CHECKOUT_INTERVALS = { annual: "year", monthly: "month" };

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/billing/checkout", ingestHandler);
}
/* v8 ignore stop */

/**
 * Resolve the Stripe price ID for a bundle and checkout interval.
 * Env var pattern: STRIPE_[TEST_]PRICE_ID_RESIDENT_VAT for a bundle with a single price,
 * STRIPE_[TEST_]PRICE_ID_RESIDENT_YEAR / _RESIDENT_MONTH for a bundle carrying more than one.
 */
function resolveStripePriceId(bundle, stripeInterval, isSynthetic) {
  const price = getBundlePriceForInterval(bundle, stripeInterval);
  if (!price) {
    logger.warn({ message: "Bundle has no Stripe price for the requested interval", bundleId: bundle.id, stripeInterval });
    return undefined;
  }
  const bundleSuffix = bundle.id.toUpperCase().replace(/-/g, "_");
  const suffix = getBundlePrices(bundle).length > 1 ? `_${bundleSuffix}_${price.interval.toUpperCase()}` : `_${bundleSuffix}`;
  const prefix = isSynthetic ? "STRIPE_TEST_PRICE_ID" : "STRIPE_PRICE_ID";
  const envVar = `${prefix}${suffix}`;
  const priceId = process.env[envVar];
  if (priceId) return priceId;
  logger.warn({ message: `No ${envVar} configured`, bundleId: bundle.id, stripeInterval: price.interval, isSynthetic });
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

    // Determine synthetic mode: bundle qualifiers are the source of truth (same pattern as billingPortalGet.js)
    const userBundles = await getUserBundles(userSub);
    const hasSyntheticBundle = userBundles.some((b) => b.qualifiers?.synthetic === true);

    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
    const isSynthetic = hasSyntheticBundle || body.synthetic === true || event.headers?.["hmrcaccount"] === "synthetic";
    let syntheticSource = "none";
    if (hasSyntheticBundle) syntheticSource = "bundle-qualifier";
    else if (body.synthetic === true) syntheticSource = "request-body";
    else if (event.headers?.["hmrcaccount"] === "synthetic") syntheticSource = "hmrcaccount-header";
    logger.info({ message: "Synthetic mode resolved", isSynthetic, syntheticSource });

    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "https://submit.diyaccounting.co.uk/";
    const bundleId = body.bundleId || "resident-pro";
    const catalog = loadCatalogFromRoot();
    const bundle = getCatalogBundleById(catalog, bundleId);
    if (!bundle || !isBundleListedInEnvironment(bundle, process.env.ENVIRONMENT_NAME)) {
      logger.warn({ message: "Bundle not listed in environment", bundleId, environmentName: process.env.ENVIRONMENT_NAME });
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "bundle-not-listed",
        error: { code: "bundle-not-listed" },
      });
    }

    const checkoutInterval = body.interval || "annual";
    const stripeInterval = CHECKOUT_INTERVALS[checkoutInterval];
    if (!stripeInterval) {
      logger.warn({ message: "Unrecognised checkout interval", bundleId, checkoutInterval });
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "invalid-interval",
        error: { code: "invalid-interval" },
      });
    }

    const priceId = resolveStripePriceId(bundle, stripeInterval, isSynthetic);
    const returnTo = resolveAllowedReturnTo(body.returnTo);

    if (!priceId) {
      logger.error({ message: "No Stripe price ID configured", bundleId, isSynthetic });
      return http500ServerErrorResponse({
        request,
        headers: responseHeaders,
        message: "Payment configuration error",
      });
    }

    const stripe = await getStripeClient({ test: isSynthetic });

    logger.info({ message: "Creating checkout session", isSynthetic, bundleId, priceId: priceId.substring(0, 20) + "..." });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: userEmail,
      client_reference_id: hashedSub,
      metadata: { hashedSub, bundleId },
      subscription_data: {
        metadata: { hashedSub, bundleId },
      },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: returnTo
        ? `${returnTo}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        : `${baseUrl}bundles.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnTo ? `${returnTo}?checkout=canceled` : `${baseUrl}bundles.html?checkout=canceled`,
    });

    logger.info({ message: "Checkout session created", sessionId: session.id, hashedSub, isSynthetic });

    await publishActivityEvent({
      event: "checkout-session-created",
      site: "submit",
      summary: `Checkout started: ${maskEmail(userEmail)}`,
      actor: classifyActor(userEmail),
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
