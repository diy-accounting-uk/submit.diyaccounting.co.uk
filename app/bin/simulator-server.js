#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/bin/simulator-server.js
// Merged Express server for the public simulator
// Combines http-simulator (mock HMRC API) with static file serving and hardcoded demo user

import path from "path";
import fs from "fs";
import express from "express";
import { fileURLToPath } from "url";
import { createApp as createHttpSimulatorApp } from "../http-simulator/server.js";
import { reset as resetState } from "../http-simulator/state/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create the simulator Express app
 * Combines mock HMRC API, static files, and demo user session
 * @returns {express.Application}
 */
export function createSimulatorServer() {
  const app = express();

  // Disable X-Powered-By header (security)
  app.disable("x-powered-by");

  // No logging - simulator goal is zero footprint
  // No morgan, no console.log in production mode

  // Parse request bodies
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // CORS for iframe embedding
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Allow embedding from parent domain
    const allowedOrigins = [
      "https://submit.diyaccounting.co.uk",
      "https://ci-submit.diyaccounting.co.uk",
      "http://localhost:3000",
      "http://localhost:8080",
    ];
    if (origin && allowedOrigins.some((o) => origin.startsWith(o.replace(/:\d+$/, "")))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,HEAD,OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();
    next();
  });

  // Security headers - allow iframe embedding from same site
  app.use((req, res, next) => {
    // Allow framing from submit.diyaccounting.co.uk for simulator.html
    res.setHeader(
      "Content-Security-Policy",
      "frame-ancestors 'self' https://submit.diyaccounting.co.uk https://*.submit.diyaccounting.co.uk http://localhost:*",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Inject hardcoded demo user session
  // The simulator always has a logged-in user with demo credentials
  app.use((req, res, next) => {
    req.user = {
      sub: "demo-user-12345",
      email: "demo@simulator.diyaccounting.co.uk",
      name: "Demo User",
      given_name: "Demo",
    };
    next();
  });

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "simulator", mode: "demo" });
  });

  // Serve virtual submit.env for the client
  // Simulator-specific environment configuration
  app.get("/submit.env", (req, res) => {
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || `http://localhost:${process.env.PORT || 8080}/`;
    const lines = [
      `COGNITO_CLIENT_ID=simulator`,
      `COGNITO_BASE_URI=${baseUrl}`,
      `HMRC_CLIENT_ID=simulator`,
      `HMRC_BASE_URI=${baseUrl}`,
      `HMRC_SANDBOX_CLIENT_ID=simulator`,
      `HMRC_SANDBOX_BASE_URI=${baseUrl}`,
      `DIY_SUBMIT_BASE_URL=${baseUrl}`,
      `SIMULATOR_MODE=true`,
    ];
    res.setHeader("Content-Type", "text/plain");
    res.send(lines.join("\n") + "\n");
  });

  // In-memory bundle store (no DynamoDB)
  const bundles = new Map();
  // Pre-populate with a demo bundle that grants all activities
  // qualifiers.sandbox drives developer tools (wrench icon) and HMRC sandbox routing
  bundles.set("demo-user-12345", [
    { bundleId: "default", expiry: null, allocated: true, qualifiers: { sandbox: true } },
    {
      bundleId: "day-guest",
      expiry: "2099-12-31",
      allocated: true,
      qualifiers: { sandbox: true },
      tokensGranted: 3,
      tokensRemaining: 3,
      tokensConsumed: 0,
      tokenEvents: [],
    },
    { bundleId: "hmrc-vat-sandbox", expiry: "2099-12-31", allocated: true, qualifiers: { sandbox: true } },
  ]);

  // In-memory pass store (no DynamoDB)
  const passes = new Map();

  // Simple passphrase generator for simulator
  const simWords = ["alpha", "beta", "gamma", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];
  function generateSimPassphrase() {
    const pick = () => simWords[Math.floor(Math.random() * simWords.length)]; // eslint-disable-line sonarjs/pseudo-random -- simulator only, not security-sensitive
    return `${pick()}-${pick()}-${pick()}-${pick()}`;
  }

  // Known bundle allocations (mirrors submit.catalogue.toml)
  const bundleAllocations = {
    "day-guest": "on-request",
    "resident-pro": "on-pass-on-subscription",
    "invited-guest": "on-email-match",
    "resident-guest": "on-email-match",
    "resident-pro-comp": "on-email-match",
  };

  // Known bundle token grants (mirrors submit.catalogue.toml)
  const bundleTokenGrants = {
    "day-guest": 3,
    "resident-pro": 100,
    "invited-guest": 3,
    "resident-guest": 3,
    "resident-pro-comp": 100,
  };

  // POST /api/v1/pass/admin - Create a test pass
  app.post("/api/v1/pass/admin", (req, res) => {
    const { passTypeId, bundleId, validityPeriod, maxUses = 1, testPass, createdBy } = req.body;
    if (!bundleId) return res.status(400).json({ error: "bundleId required" });

    const code = generateSimPassphrase();
    const now = new Date();
    const validFrom = now.toISOString();
    let validUntil = null;
    if (validityPeriod) {
      const match = validityPeriod.match(/P(\d+)([DMY])/);
      if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2];
        const end = new Date(now);
        if (unit === "D") end.setDate(end.getDate() + amount);
        else if (unit === "M") end.setMonth(end.getMonth() + amount);
        else if (unit === "Y") end.setFullYear(end.getFullYear() + amount);
        validUntil = end.toISOString();
      }
    }

    const pass = {
      code,
      bundleId,
      passTypeId: passTypeId || bundleId,
      testPass: !!testPass,
      validFrom,
      validUntil,
      maxUses,
      useCount: 0,
      createdBy: createdBy || "simulator",
    };
    passes.set(code, pass);

    res.json({
      code,
      bundleId,
      passTypeId: pass.passTypeId,
      testPass: pass.testPass,
      validFrom,
      validUntil,
      maxUses,
    });
  });

  // GET /api/v1/pass - Check pass validity (public, no auth)
  app.get("/api/v1/pass", (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).json({ valid: false, reason: "code_required" });

    const pass = passes.get(code);
    if (!pass) return res.json({ valid: false, reason: "not_found" });
    if (pass.useCount >= pass.maxUses) return res.json({ valid: false, reason: "exhausted" });
    if (pass.validUntil && new Date() > new Date(pass.validUntil)) return res.json({ valid: false, reason: "expired" });

    return res.json({ valid: true, bundleId: pass.bundleId, usesRemaining: pass.maxUses - pass.useCount });
  });

  // POST /api/v1/pass - Redeem pass (authenticated)
  app.post("/api/v1/pass", (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ redeemed: false, reason: "code_required" });

    const pass = passes.get(code);
    if (!pass) return res.json({ redeemed: false, reason: "not_found" });
    if (pass.useCount >= pass.maxUses) return res.json({ redeemed: false, reason: "exhausted" });
    if (pass.validUntil && new Date() > new Date(pass.validUntil)) return res.json({ redeemed: false, reason: "expired" });

    // Check allocation type — on-pass-on-subscription requires checkout, not direct grant
    const allocation = bundleAllocations[pass.bundleId] || "on-request";
    if (allocation === "on-pass-on-subscription") {
      return res.json({ redeemed: false, valid: true, bundleId: pass.bundleId, requiresSubscription: true });
    }

    // Grant the bundle directly
    pass.useCount++;
    const userBundles = bundles.get(req.user.sub) || [];
    const existing = userBundles.find((b) => b.bundleId === pass.bundleId);
    if (existing) {
      // Re-grant: reset tokens
      const tg = bundleTokenGrants[pass.bundleId];
      if (tg !== undefined) {
        existing.tokensGranted = tg;
        existing.tokensRemaining = tg;
        existing.tokensConsumed = 0;
        existing.tokenEvents = [];
      }
      existing.allocated = true;
      existing.qualifiers = pass.testPass ? { sandbox: true } : {};
    } else {
      const tg = bundleTokenGrants[pass.bundleId];
      const newBundle = {
        bundleId: pass.bundleId,
        expiry: pass.validUntil || "2099-12-31",
        allocated: true,
        qualifiers: pass.testPass ? { sandbox: true } : {},
      };
      if (tg !== undefined) {
        newBundle.tokensGranted = tg;
        newBundle.tokensRemaining = tg;
        newBundle.tokensConsumed = 0;
        newBundle.tokenEvents = [];
      }
      userBundles.push(newBundle);
      bundles.set(req.user.sub, userBundles);
    }

    return res.json({
      redeemed: true,
      bundleId: pass.bundleId,
      expiry: pass.validUntil || "2099-12-31",
      grantStatus: "granted",
    });
  });

  // Bundle API endpoints (mock implementation)
  app.get("/api/v1/bundle", (req, res) => {
    const userBundles = bundles.get(req.user.sub) || [];
    res.json({ bundles: userBundles });
  });

  app.post("/api/v1/bundle", (req, res) => {
    const { bundleId } = req.body;
    if (!bundleId) {
      return res.status(400).json({ error: "bundleId required" });
    }
    const userBundles = bundles.get(req.user.sub) || [];
    if (!userBundles.some((b) => b.bundleId === bundleId)) {
      const tg = bundleTokenGrants[bundleId];
      const newBundle = { bundleId, expiry: "2099-12-31", allocated: true, qualifiers: { sandbox: true } };
      if (tg !== undefined) {
        newBundle.tokensGranted = tg;
        newBundle.tokensRemaining = tg;
        newBundle.tokensConsumed = 0;
        newBundle.tokenEvents = [];
      }
      userBundles.push(newBundle);
      bundles.set(req.user.sub, userBundles);
    }
    res.status(201).json({ bundleId, status: "granted" });
  });

  // DELETE /api/v1/bundle (no bundleId) — removeAll clears all bundles
  app.delete("/api/v1/bundle", (req, res) => {
    if (req.body?.removeAll) {
      bundles.set(req.user.sub, []);
      return res.status(204).end();
    }
    return res.status(400).json({ error: "removeAll or bundleId required" });
  });

  app.delete("/api/v1/bundle/:bundleId", (req, res) => {
    const { bundleId } = req.params;
    const userBundles = bundles.get(req.user.sub) || [];
    const filtered = userBundles.filter((b) => b.bundleId !== bundleId);
    bundles.set(req.user.sub, filtered);
    res.status(204).end();
  });

  // Mock billing endpoints — fakes Stripe like the simulator fakes OAuth
  app.post("/api/v1/billing/checkout-session", (req, res) => {
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || `http://localhost:${process.env.PORT || 8080}/`;
    const bundleId = req.body?.bundleId || "resident-pro";
    const sessionId = `sim_cs_${Date.now()}`;
    const checkoutUrl = `${baseUrl}simulator/checkout?session=${sessionId}&bundleId=${bundleId}`;
    res.json({ data: { checkoutUrl } });
  });

  app.get("/simulator/checkout", (req, res) => {
    const { bundleId = "resident-pro" } = req.query;
    // Auto-complete checkout: grant the bundle and redirect to success
    const userBundles = bundles.get(req.user.sub) || [];
    const existing = userBundles.find((b) => b.bundleId === bundleId);
    const tg = bundleTokenGrants[bundleId] || 100;
    if (existing) {
      // Update existing bundle with subscription fields
      existing.allocated = true;
      existing.stripeSubscriptionId = `sim_sub_${Date.now()}`;
      existing.stripeCustomerId = `sim_cus_${Date.now()}`;
      existing.tokensGranted = tg;
      existing.tokensRemaining = tg;
      existing.tokensConsumed = 0;
      existing.tokenEvents = [];
      existing.qualifiers = { sandbox: true, stripeTestMode: true };
    } else {
      userBundles.push({
        bundleId,
        expiry: "2099-12-31",
        allocated: true,
        stripeSubscriptionId: `sim_sub_${Date.now()}`,
        stripeCustomerId: `sim_cus_${Date.now()}`,
        tokensGranted: tg,
        tokensRemaining: tg,
        tokensConsumed: 0,
        tokenEvents: [],
        qualifiers: { sandbox: true, stripeTestMode: true },
      });
      bundles.set(req.user.sub, userBundles);
    }
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || `http://localhost:${process.env.PORT || 8080}/`;
    res.redirect(`${baseUrl}bundles.html?checkout=success`);
  });

  app.get("/api/v1/billing/portal", (req, res) => {
    const baseUrl = process.env.DIY_SUBMIT_BASE_URL || `http://localhost:${process.env.PORT || 8080}/`;
    res.json({ data: { portalUrl: `${baseUrl}bundles.html` } });
  });

  // In-memory receipts store
  const receipts = new Map();

  // Receipt API endpoints (mock implementation)
  app.get("/api/v1/hmrc/receipt", (req, res) => {
    const userReceipts = receipts.get(req.user.sub) || [];
    res.json({ receipts: userReceipts });
  });

  app.get("/api/v1/hmrc/receipt/:receiptId", (req, res) => {
    const { receiptId } = req.params;
    const userReceipts = receipts.get(req.user.sub) || [];
    const receipt = userReceipts.find((r) => r.receiptId === receiptId);
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
    }
    res.json(receipt);
  });

  // Mock auth URL endpoint - returns simulator OAuth URL
  app.get("/api/v1/auth/url", (req, res) => {
    const { redirectUri, account } = req.query;
    const authUrl = `/oauth/authorize?response_type=code&client_id=simulator&redirect_uri=${encodeURIComponent(redirectUri || "/")}&scope=read:vat+write:vat&state=simulator-state&autoGrant=true`;
    res.json({ url: authUrl, account: account || "sandbox" });
  });

  // Mock token endpoint - always returns success for simulator
  app.post("/api/v1/hmrc/token", (req, res) => {
    res.json({
      access_token: "simulator-access-token-" + Date.now(),
      refresh_token: "simulator-refresh-token-" + Date.now(),
      expires_in: 14400,
      token_type: "bearer",
      scope: "read:vat write:vat",
    });
  });

  // VAT submission endpoint (wraps http-simulator and stores receipt)
  app.post("/api/v1/hmrc/vat/return", (req, res) => {
    const {
      vrn,
      periodKey,
      vatDueSales,
      vatDueAcquisitions,
      totalVatDue,
      vatReclaimedCurrPeriod,
      netVatDue,
      totalValueSalesExVAT,
      totalValuePurchasesExVAT,
      totalValueGoodsSuppliedExVAT,
      totalAcquisitionsExVAT,
      finalised,
    } = req.body;

    // Forward to http-simulator VAT returns endpoint
    const mockReq = {
      params: { vrn },
      body: {
        periodKey,
        vatDueSales,
        vatDueAcquisitions,
        totalVatDue,
        vatReclaimedCurrPeriod,
        netVatDue,
        totalValueSalesExVAT,
        totalValuePurchasesExVAT,
        totalValueGoodsSuppliedExVAT,
        totalAcquisitionsExVAT,
        finalised,
      },
      headers: req.headers,
    };

    // Create mock response to capture data
    const mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: function (key, value) {
        this.headers[key] = value;
      },
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: (data) => {
        // Store receipt and consume token if successful
        if (mockRes.statusCode === 201 && data.formBundleNumber) {
          const receiptId = `receipt-${Date.now()}`;
          const userReceipts = receipts.get(req.user.sub) || [];
          userReceipts.push({
            receiptId,
            formBundleNumber: data.formBundleNumber,
            processingDate: data.processingDate,
            chargeRefNumber: data.chargeRefNumber,
            paymentIndicator: data.paymentIndicator,
            vrn,
            periodKey,
            createdAt: new Date().toISOString(),
          });
          receipts.set(req.user.sub, userReceipts);

          // Consume a token from the first bundle with remaining tokens
          const userBundles = bundles.get(req.user.sub) || [];
          const tokenBundle = userBundles.find((b) => b.allocated && b.tokensRemaining > 0);
          if (tokenBundle) {
            tokenBundle.tokensRemaining--;
            tokenBundle.tokensConsumed = (tokenBundle.tokensConsumed || 0) + 1;
            if (!tokenBundle.tokenEvents) tokenBundle.tokenEvents = [];
            tokenBundle.tokenEvents.push({
              activity: "submit-vat",
              timestamp: new Date().toISOString(),
              tokensUsed: 1,
            });
          }
        }
        // Forward response
        Object.entries(mockRes.headers).forEach(([k, v]) => res.setHeader(k, v));
        res.status(mockRes.statusCode).json(data);
      },
    };

    // Import and call the VAT returns route handler directly
    import("../http-simulator/routes/vat-returns.js")
      .then(({ apiEndpoint }) => {
        // Create a mini express app to handle this single request
        const miniApp = express();
        miniApp.use(express.json());
        apiEndpoint(miniApp);

        // Find the POST handler
        const postHandler = miniApp._router.stack.find(
          (layer) => layer.route && layer.route.path === "/organisations/vat/:vrn/returns" && layer.route.methods.post,
        );

        if (postHandler) {
          return postHandler.route.stack[0].handle(mockReq, mockRes, () => {});
        } else {
          return res.status(500).json({ error: "VAT return handler not found" });
        }
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  });

  // VAT obligations endpoint
  app.get("/api/v1/hmrc/vat/obligation", (req, res) => {
    const { status: statusFilter } = req.query;

    // Import and call the obligations handler
    import("../http-simulator/scenarios/obligations.js")
      .then(({ getObligationsForScenario }) => {
        const result = getObligationsForScenario(null); // No test scenario

        if (result.status) {
          return res.status(result.status).json(result.body);
        }

        let obligations = result.obligations;
        if (statusFilter) {
          obligations = obligations.filter((o) => o.status === statusFilter);
        }

        return res.json({ obligations });
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  });

  // VAT return GET endpoint
  app.get("/api/v1/hmrc/vat/return", (req, res) => {
    const { vrn, periodKey } = req.query;

    import("../http-simulator/state/store.js")
      .then(({ getReturn }) => {
        const storedReturn = getReturn(vrn, periodKey);
        if (storedReturn) {
          return res.json(storedReturn);
        }

        // Return default test data
        return res.json({
          periodKey,
          vatDueSales: 1000,
          vatDueAcquisitions: 0,
          totalVatDue: 1000,
          vatReclaimedCurrPeriod: 0,
          netVatDue: 1000,
          totalValueSalesExVAT: 0,
          totalValuePurchasesExVAT: 0,
          totalValueGoodsSuppliedExVAT: 0,
          totalAcquisitionsExVAT: 0,
        });
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  });

  // Mount http-simulator routes for mock HMRC OAuth endpoints
  const httpSimulatorApp = createHttpSimulatorApp();
  app.use(httpSimulatorApp);

  // Determine which static files to serve
  // Use public-simulator if it exists (built), otherwise fall back to public
  const simulatorPublicPath = path.join(__dirname, "../../web/public-simulator");
  const regularPublicPath = path.join(__dirname, "../../web/public");

  // Check if simulator build exists
  const staticPath = fs.existsSync(simulatorPublicPath) ? simulatorPublicPath : regularPublicPath;

  // Serve static files
  app.use(express.static(staticPath, { dotfiles: "allow" }));

  // SPA fallback - serve index.html for unmatched routes
  app.get("*", (req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  return app;
}

// Reset in-memory state
resetState();

// Start server if run directly
const __thisFile = fileURLToPath(import.meta.url);
const __argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
const __runDirect = __thisFile === __argv1;

if (__runDirect) {
  const port = process.env.PORT || 8080;
  const app = createSimulatorServer();

  app.listen(port, () => {
    console.log(`[simulator-server] Listening on http://localhost:${port}`);
    console.log(`[simulator-server] Demo mode - no real data is submitted`);
  });
}
