// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-support/stripeSimulator.js

import express from "express";

/**
 * Lightweight Express server implementing minimal Stripe API for local testing.
 * Returns realistic Stripe object shapes with metadata passthrough.
 *
 * `state.accounts` maps a Connect account id to fields that replace the default account read;
 * `state.transfers` collects the transfers created, each with the idempotency key it came with.
 */
export function createStripeSimulator({ state = { accounts: {}, transfers: [] } } = {}) {
  const app = express();
  app.locals.stripeState = state;
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

  // POST /v1/accounts
  app.post("/v1/accounts", (req, res) => {
    res.json({
      id: "acct_test_" + Date.now(),
      object: "account",
      country: req.body.country || "GB",
      details_submitted: false,
      capabilities: { transfers: "inactive" },
      metadata: req.body.metadata || {},
    });
  });

  // GET /v1/accounts/:id
  app.get("/v1/accounts/:id", (req, res) => {
    res.json({
      id: req.params.id,
      object: "account",
      country: "GB",
      details_submitted: true,
      capabilities: { transfers: "active" },
      metadata: {},
      ...(state.accounts?.[req.params.id] || {}),
    });
  });

  // POST /v1/transfers (a repeated idempotency key answers the first transfer, or 400 when the parameters differ)
  app.post("/v1/transfers", (req, res) => {
    const idempotencyKey = req.get("Idempotency-Key") || null;
    const params = {
      amount: Number(req.body.amount),
      currency: req.body.currency,
      destination: req.body.destination,
      transfer_group: req.body.transfer_group || null,
    };
    const earlier = idempotencyKey ? state.transfers.find((transfer) => transfer.idempotencyKey === idempotencyKey) : null;
    if (earlier) {
      const same = Object.entries(params).every(([name, value]) => earlier.transfer[name] === value);
      if (!same) {
        res.status(400).json({
          error: { type: "idempotency_error", message: "Keys for idempotent requests can only be used with the same parameters" },
        });
        return;
      }
      res.json(earlier.transfer);
      return;
    }
    const transfer = {
      id: `tr_test_${state.transfers.length + 1}`,
      object: "transfer",
      ...params,
      created: Math.floor(Date.now() / 1000),
      metadata: req.body.metadata || {},
    };
    state.transfers.push({ idempotencyKey, transfer });
    res.json(transfer);
  });

  // GET /v1/transfers
  app.get("/v1/transfers", (req, res) => {
    const data = state.transfers
      .map(({ transfer }) => transfer)
      .filter((transfer) => !req.query.destination || transfer.destination === req.query.destination)
      .filter((transfer) => !req.query.transfer_group || transfer.transfer_group === req.query.transfer_group);
    res.json({ object: "list", data, has_more: false });
  });

  // POST /v1/account_links
  app.post("/v1/account_links", (req, res) => {
    res.json({
      object: "account_link",
      url: "https://connect.stripe.com/setup/e/" + (req.body.account || "acct_test_000"),
      created: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
  });

  return app;
}

/**
 * Start the Stripe simulator on the given port.
 * @param {number} port
 * @param {{ state?: { accounts: object, transfers: Array } }} options
 * @returns {Promise<import('http').Server>}
 */
export function startStripeSimulator(port = 12111, options = {}) {
  const app = createStripeSimulator(options);
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Stripe simulator listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}
