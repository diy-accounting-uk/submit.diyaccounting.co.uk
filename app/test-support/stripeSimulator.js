// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-support/stripeSimulator.js

import express from "express";

/**
 * Lightweight Express server implementing minimal Stripe API for local testing.
 * Returns realistic Stripe object shapes with metadata passthrough.
 */
export function createStripeSimulator() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // POST /v1/checkout/sessions
  app.post("/v1/checkout/sessions", (req, res) => {
    const sessionId = "cs_test_" + Date.now();
    res.json({
      id: sessionId,
      object: "checkout.session",
      url: "https://checkout.stripe.com/pay/" + sessionId,
      status: "open",
      mode: req.body.mode || "subscription",
      customer_email: req.body.customer_email || null,
      metadata: req.body.metadata || {},
    });
  });

  // GET /v1/subscriptions/:id
  app.get("/v1/subscriptions/:id", (req, res) => {
    res.json({
      id: req.params.id,
      object: "subscription",
      status: "active",
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      items: {
        data: [
          {
            id: "si_test_" + Date.now(),
            price: { id: "price_test_001", unit_amount: 999, currency: "gbp" },
          },
        ],
      },
      metadata: {},
    });
  });

  // GET /v1/subscriptions
  app.get("/v1/subscriptions", (req, res) => {
    res.json({
      object: "list",
      data: [],
      has_more: false,
    });
  });

  // POST /v1/billing_portal/sessions
  app.post("/v1/billing_portal/sessions", (req, res) => {
    const portalId = "bps_test_" + Date.now();
    res.json({
      id: portalId,
      object: "billing_portal.session",
      url: "https://billing.stripe.com/session/" + portalId,
      customer: req.body.customer || "cus_test_000",
    });
  });

  return app;
}

/**
 * Start the Stripe simulator on the given port.
 * @param {number} port
 * @returns {Promise<import('http').Server>}
 */
export function startStripeSimulator(port = 12111) {
  const app = createStripeSimulator();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Stripe simulator listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}
