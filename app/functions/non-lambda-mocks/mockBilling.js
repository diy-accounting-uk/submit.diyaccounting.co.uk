// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/non-lambda-mocks/mockBilling.js
// Mock billing endpoints for simulator environment — fakes Stripe like mock OAuth fakes login.
// When Stripe is not configured (no STRIPE_PRICE_ID_RESIDENT_PRO), these endpoints auto-complete checkout
// by granting the bundle and redirecting to the success URL.

import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/non-lambda-mocks/mockBilling.js" });

export function apiEndpoint(app) {
  // Mock checkout session — returns a local auto-complete URL instead of a Stripe hosted page
  app.post("/api/v1/billing/checkout-session", async (req, res) => {
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "http://localhost:3000/";
    const bundleId = req.body?.bundleId || "resident-pro";
    const sessionId = `cs_test_sim_${Date.now()}`;

    // Extract user sub from auth header so the GET /simulator/checkout can grant the bundle
    // (browser navigation to GET doesn't carry the Authorization header)
    let userSub = "";
    try {
      const { decodeJwtToken } = await import("../../lib/jwtHelper.js");
      const decoded = decodeJwtToken(req.headers);
      userSub = decoded.sub || "";
    } catch {
      logger.warn({ message: "Mock checkout session: could not decode JWT, bundle grant may fail" });
    }

    const params = new URLSearchParams({ session: sessionId, bundleId, ...(userSub && { sub: userSub }) });
    const checkoutUrl = `${baseUrl}simulator/checkout?${params}`;
    logger.info({ message: "Mock checkout session created", sessionId, bundleId, checkoutUrl });
    res.json({ checkoutUrl });
  });

  // Mock checkout completion — grants bundle with subscription fields and redirects to success URL.
  // Matches the shape of bundle records created by billingWebhookPost.js:handleCheckoutComplete()
  // so that "Manage Subscription" buttons render in the simulator.
  app.get("/simulator/checkout", async (req, res) => {
    const { bundleId = "resident-pro", sub: userSub } = req.query;
    logger.info({ message: "Mock checkout auto-completing", bundleId, userSub });

    if (userSub) {
      try {
        const { putBundle } = await import("../../data/dynamoDbBundleRepository.js");
        const { initializeSalt } = await import("../../services/subHasher.js");
        const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");

        await initializeSalt();

        // Look up tokensGranted from the catalog, matching billingWebhookPost.js:getCatalogTokensGranted()
        let tokensGranted = 100;
        try {
          const catalog = loadCatalogFromRoot();
          const catalogBundle = (catalog.bundles || []).find((b) => b.id === bundleId);
          tokensGranted = catalogBundle?.tokensGranted ?? 100;
        } catch {
          // Fall back to 100
        }

        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const bundleRecord = {
          bundleId,
          expiry: periodEnd,
          qualifiers: { sandbox: true },
          tokensGranted,
          tokensConsumed: 0,
          tokenResetAt: periodEnd,
          stripeSubscriptionId: `sim_sub_${Date.now()}`,
          stripeCustomerId: `sim_cus_${Date.now()}`,
          subscriptionStatus: "active",
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        };

        await putBundle(userSub, bundleRecord);
        logger.info({ message: "Mock checkout granted bundle with subscription fields", bundleId, userId: userSub, tokensGranted });
      } catch (error) {
        logger.warn({ message: "Mock checkout: bundle grant failed", error: error.message });
      }
    } else {
      logger.warn({ message: "Mock checkout: no user sub in query, cannot grant bundle" });
    }

    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "http://localhost:3000/";
    const sessionId = req.query.session || "";
    res.redirect(`${baseUrl}bundles.html?checkout=success&session_id=${encodeURIComponent(sessionId)}`);
  });

  // Mock checkout session lookup — the values bundles.html reports as the GA4 purchase
  app.get("/api/v1/billing/checkout-session/:id", (req, res) => {
    res.json({ amountTotal: 999, currency: "gbp", bundleId: req.query.bundleId || "resident-pro" });
  });

  // Mock billing portal — redirects back to bundles page
  app.get("/api/v1/billing/portal", (req, res) => {
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || "http://localhost:3000/";
    logger.info({ message: "Mock billing portal session created" });
    res.json({ portalUrl: `${baseUrl}bundles.html` });
  });

  logger.info({ message: "Mock billing routes registered (Stripe not configured)" });
}
