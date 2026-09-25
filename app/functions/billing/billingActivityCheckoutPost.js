// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/billing/billingActivityCheckoutPost.js
//
// A general per-filing charge, not confirmation-statement specific: opens a Stripe Checkout
// Session in `payment` mode (a one-off charge, unlike billingCheckoutPost.js's `subscription`
// mode) for an activity carrying an `[[activities.prices]]` row with `interval = "submission"`.
// The session metadata carries the activity id and a caller-supplied subject key (for the
// confirmation statement, the company number and review date joined into one string) so
// billingWebhookPost.js can record the paid charge against that exact filing on
// checkout.session.completed.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { hasPaidCharge } from "../../services/activityCharges.js";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";
import { resolveAllowedReturnTo } from "./billingReturnUrl.js";
import { loadCatalogFromRoot, getActivityPrices, isActivityListedInEnvironment } from "../../services/productCatalog.js";

const logger = createLogger({ source: "app/functions/billing/billingActivityCheckoutPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/billing/activity-checkout", ingestHandler);
}
/* v8 ignore stop */

/**
 * Resolve the Stripe price ID for an activity's per-filing charge. Env var pattern:
 * STRIPE_[TEST_]PRICE_ID_FILE_CONFIRMATION_STATEMENT for an activity with a single price,
 * same suffix rule as resolveStripePriceId in billingCheckoutPost.js.
 */
function resolveActivityStripePriceId(activity, isSynthetic) {
  const prices = getActivityPrices(activity);
  const price = prices.find((p) => p.default) || prices[0];
  if (!price) {
    logger.warn({ message: "Activity has no Stripe price", activityId: activity.id });
    return undefined;
  }
  const activitySuffix = activity.id.toUpperCase().replace(/-/g, "_");
  const suffix = prices.length > 1 ? `_${activitySuffix}_${price.interval.toUpperCase()}` : `_${activitySuffix}`;
  const prefix = isSynthetic ? "STRIPE_TEST_PRICE_ID" : "STRIPE_PRICE_ID";
  const envVar = `${prefix}${suffix}`;
  const priceId = process.env[envVar];
  if (priceId) return priceId;
  logger.warn({ message: `No ${envVar} configured`, activityId: activity.id, isSynthetic });
  return undefined;
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

    const userBundles = await getUserBundles(userSub);
    const hasSyntheticBundle = userBundles.some((b) => b.qualifiers?.synthetic === true);

    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
    const isSynthetic = hasSyntheticBundle || body.synthetic === true || event.headers?.["hmrcaccount"] === "synthetic";

    const activityId = body.activityId;
    const subjectKey = body.subjectKey;

    if (!activityId || typeof activityId !== "string") {
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "Missing activity id",
        error: { code: "missing-activity-id" },
      });
    }
    if (!subjectKey || typeof subjectKey !== "string") {
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "Missing subject key",
        error: { code: "missing-subject-key" },
      });
    }

    const catalog = loadCatalogFromRoot();
    const activity = (catalog?.activities || []).find((a) => a.id === activityId);
    if (!activity || !isActivityListedInEnvironment(activity, process.env.ENVIRONMENT_NAME)) {
      logger.warn({ message: "Activity not listed in environment", activityId, environmentName: process.env.ENVIRONMENT_NAME });
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "activity-not-listed",
        error: { code: "activity-not-listed" },
      });
    }

    if (getActivityPrices(activity).length === 0) {
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "activity-not-payable",
        error: { code: "activity-not-payable" },
      });
    }

    if (await hasPaidCharge(userSub, activityId, subjectKey)) {
      return http409ConflictResponse({
        request,
        headers: responseHeaders,
        message: "already-paid",
        error: { code: "already-paid" },
      });
    }

    const priceId = resolveActivityStripePriceId(activity, isSynthetic);
    const returnTo = resolveAllowedReturnTo(body.returnTo);
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "https://submit.diyaccounting.co.uk/";

    if (!priceId) {
      logger.error({ message: "No Stripe price ID configured", activityId, isSynthetic });
      return http500ServerErrorResponse({
        request,
        headers: responseHeaders,
        message: "Payment configuration error",
      });
    }

    const stripe = await getStripeClient({ test: isSynthetic });

    logger.info({ message: "Creating activity checkout session", isSynthetic, activityId, priceId: priceId.substring(0, 20) + "..." });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: userEmail,
      client_reference_id: hashedSub,
      metadata: { hashedSub, activityId, subjectKey },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: returnTo
        ? `${returnTo}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        : `${baseUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnTo ? `${returnTo}?checkout=canceled` : `${baseUrl}?checkout=canceled`,
    });

    logger.info({ message: "Activity checkout session created", sessionId: session.id, hashedSub, activityId, isSynthetic });

    await publishActivityEvent({
      event: "activity-checkout-session-created",
      site: "submit",
      summary: `Activity checkout started: ${activityId} for ${maskEmail(userEmail)}`,
      actor: classifyActor(userEmail),
      flow: "user-journey",
      userSub,
      detail: { activityId },
    });

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: { checkoutUrl: session.url },
    });
  } catch (error) {
    logger.error({ message: "Failed to create activity checkout session", error: error.message });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to create checkout session",
    });
  }
}
