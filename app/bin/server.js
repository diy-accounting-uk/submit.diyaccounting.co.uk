#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/bin/server.js

import path from "path";
import fs from "fs";
import https from "https";
import express from "express";
import { fileURLToPath } from "url";
import { apiEndpoint as mockAuthUrlGetApiEndpoint } from "../functions/non-lambda-mocks/mockAuthUrlGet.js";
import { apiEndpoint as mockTokenPostApiEndpoint } from "../functions/non-lambda-mocks/mockTokenPost.js";
import { apiEndpoint as mockBillingApiEndpoint } from "../functions/non-lambda-mocks/mockBilling.js";
import { apiEndpoint as bundleGetApiEndpoint } from "../functions/account/bundleGet.js";
import { apiEndpoint as bundlePostApiEndpoint } from "../functions/account/bundlePost.js";
import { apiEndpoint as bundleDeleteApiEndpoint } from "../functions/account/bundleDelete.js";
import { apiEndpoint as hmrcTokenPostApiEndpoint } from "../functions/hmrc/hmrcTokenPost.js";
import { apiEndpoint as hmrcVatReturnPostApiEndpoint } from "../functions/hmrc/hmrcVatReturnPost.js";
import { apiEndpoint as hmrcVatObligationGetApiEndpoint } from "../functions/hmrc/hmrcVatObligationGet.js";
import { apiEndpoint as hmrcVatReturnGetApiEndpoint } from "../functions/hmrc/hmrcVatReturnGet.js";
import { apiEndpoint as hmrcReceiptGetApiEndpoint } from "../functions/hmrc/hmrcReceiptGet.js";
import { apiEndpoint as passGetApiEndpoint } from "../functions/account/passGet.js";
import { apiEndpoint as passPostApiEndpoint } from "../functions/account/passPost.js";
import { apiEndpoint as passAdminPostApiEndpoint } from "../functions/account/passAdminPost.js";
import { apiEndpoint as passGeneratePostApiEndpoint } from "../functions/account/passGeneratePost.js";
import { apiEndpoint as passMyPassesGetApiEndpoint } from "../functions/account/passMyPassesGet.js";
import { apiEndpoint as interestPostApiEndpoint } from "../functions/account/interestPost.js";
import { apiEndpoint as sessionBeaconPostApiEndpoint } from "../functions/account/sessionBeaconPost.js";
import { apiEndpoint as billingCheckoutPostApiEndpoint } from "../functions/billing/billingCheckoutPost.js";
import { apiEndpoint as billingPortalGetApiEndpoint } from "../functions/billing/billingPortalGet.js";
import { apiEndpoint as billingRecoverPostApiEndpoint } from "../functions/billing/billingRecoverPost.js";
import { apiEndpoint as billingWebhookPostApiEndpoint } from "../functions/billing/billingWebhookPost.js";
import { dotenvConfigIfNotBlank, validateEnv } from "../lib/env.js";
import { context, createLogger } from "../lib/logger.js";
import { detectVendorPublicIp } from "../lib/buildFraudHeaders.js";

const logger = createLogger({ source: "app/bin/server.js" });

dotenvConfigIfNotBlank({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Disable X-Powered-By header (security: prevents server fingerprinting)
app.disable("x-powered-by");

// parse bodies
app.use(express.urlencoded({ extended: true }));
app.use(
  express.json({
    verify: (req, _res, buf) => {
      // Preserve raw body for Stripe webhook signature verification.
      // express.json() parses the body into req.body (a JS object), but Stripe's
      // constructEvent() needs the exact raw body string to verify the HMAC signature.
      // JSON.stringify(req.body) may differ from the original (whitespace, key order).
      if (req.url.startsWith("/api/v1/billing/webhook")) {
        req.rawBody = buf.toString();
      }
    },
  }),
);

// HTTP access logging middleware
app.use((req, res, next) => {
  context.run(new Map(), () => {
    next();
  });
});
app.use((req, res, next) => {
  logger.info(`HTTP ${req.method} ${req.url}`);
  next();
});

// Basic CORS middleware (mostly for local tools and OPTIONS where needed)
app.use((req, res, next) => {
  // Allow same-origin (ngrok forwards host), and also enable generic CORS for dev tools
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-wait-time-ms,x-request-id");
  res.setHeader("Access-Control-Expose-Headers", "x-request-id,Location,Retry-After");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,HEAD,OPTIONS");
  // Private Network Access preflight response header if requested by Chromium
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

// Simulate CloudFront headers for fraud prevention in non-proxy environments.
// In proxy/CI/prod, CloudFront and ngrok set X-Forwarded-For and CloudFront-Viewer-Address.
// In simulator mode, the Express server receives direct requests from Playwright on localhost,
// so we inject synthetic values to allow buildFraudHeaders.js to generate all Gov-* headers.
app.use((req, res, next) => {
  if (!req.headers["x-forwarded-for"]) {
    req.headers["x-forwarded-for"] = "203.0.113.1"; // RFC 5737 TEST-NET-3 (documentation IP)
  }
  if (!req.headers["cloudfront-viewer-address"]) {
    const port = req.socket?.remotePort || 12345;
    req.headers["cloudfront-viewer-address"] = `203.0.113.1:${port}`;
  }
  next();
});

// Security headers middleware (fixes ZAP findings)
app.use((req, res, next) => {
  // X-Frame-Options: Prevents clickjacking attacks
  res.setHeader("X-Frame-Options", "DENY");
  // X-Content-Type-Options: Prevents MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Strict-Transport-Security: Enforces HTTPS (1 year, include subdomains)
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Content-Security-Policy: Basic CSP for security
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://client.rum.us-east-1.amazonaws.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com https://www.google-analytics.com https://www.googletagmanager.com; font-src 'self'; connect-src 'self' https://*.hmrc.gov.uk https://*.amazoncognito.com https://dataplane.rum.eu-west-2.amazonaws.com https://cognito-identity.eu-west-2.amazonaws.com https://sts.eu-west-2.amazonaws.com https://*.google-analytics.com https://www.googletagmanager.com; frame-src 'self' https://simulator.submit.diyaccounting.co.uk; frame-ancestors 'none'; form-action 'self'",
  );
  // Cross-Origin-Opener-Policy: Isolates browsing context (Spectre mitigation)
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // Cross-Origin-Embedder-Policy: Requires CORS/CORP for cross-origin resources
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  // Referrer-Policy: Controls how much referrer info is sent
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions-Policy: Restricts browser features
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

// Serve a virtual submit.env file for the client, using the server's own environment variables.
// This ensures that behaviour tests (using ngrok) get the correct BASE_URL.
app.get("/submit.env", (req, res) => {
  const publicVars = [
    "COGNITO_CLIENT_ID",
    "COGNITO_BASE_URI",
    "HMRC_CLIENT_ID",
    "HMRC_BASE_URI",
    "HMRC_SANDBOX_CLIENT_ID",
    "HMRC_SANDBOX_BASE_URI",
    "DIY_SUBMIT_BASE_URL",
  ];

  const lines = publicVars.map((v) => `${v}=${process.env[v] || ""}`);

  res.setHeader("Content-Type", "text/plain");
  res.send(lines.join("\n") + "\n");
});

// Middleware to set short cache TTL for test reports and docs
app.use("/tests", (req, res, next) => {
  // Set short cache control for test reports (60 seconds max-age)
  res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
  next();
});
app.use("/docs", (req, res, next) => {
  // Set short cache control for docs (60 seconds max-age)
  res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
  next();
});

// Conditionally serve mock auth addon script based on environment
// In mock/simulator environments, serve the actual addon file; otherwise return empty script
app.get("/auth/login-mock-addon.js", (req, res) => {
  const authProvider = process.env.TEST_AUTH_PROVIDER;

  if (authProvider === "mock" || authProvider === "simulator") {
    // Serve the actual addon file in mock/simulator environments
    res.sendFile(path.join(__dirname, "../../web/public/auth/login-mock-addon.js"), { dotfiles: "allow" });
  } else {
    // Return empty script for non-mock environments (ci, prod)
    res.setHeader("Content-Type", "application/javascript");
    res.send("// Mock auth not available in this environment\n");
  }
});

app.use(express.static(path.join(__dirname, "../../web/public"), { dotfiles: "allow" }));

// Serve simulator build at /sim/ sub-path for same-origin iframe embedding
// Only available when web/public-simulator/ exists (after npm run build:simulator)
const simulatorPublicPath = path.join(__dirname, "../../web/public-simulator");
if (fs.existsSync(simulatorPublicPath)) {
  // Override security headers for /sim/ routes to allow framing from same origin
  app.use("/sim", (req, res, next) => {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; form-action 'self'",
    );
    next();
  });
  app.use("/sim", express.static(simulatorPublicPath, { dotfiles: "allow" }));
  // SPA fallback for /sim/ routes
  app.get("/sim/{*path}", (req, res) => {
    res.sendFile(path.join(simulatorPublicPath, "index.html"), { dotfiles: "allow" });
  });
}

// Register mock OAuth routes in mock/simulator auth environments
if (process.env.TEST_AUTH_PROVIDER === "mock" || process.env.TEST_AUTH_PROVIDER === "simulator") {
  mockAuthUrlGetApiEndpoint(app);
  mockTokenPostApiEndpoint(app);
  console.log(`Mock OAuth routes registered (TEST_AUTH_PROVIDER=${process.env.TEST_AUTH_PROVIDER})`);
}
// Register mock billing routes when Stripe is not configured (simulator environment)
// Must be registered BEFORE real billing endpoints so Express matches mock routes first
if (!process.env.STRIPE_PRICE_ID_RESIDENT_PRO && !process.env.STRIPE_TEST_PRICE_ID_RESIDENT_PRO) {
  mockBillingApiEndpoint(app);
}
bundleGetApiEndpoint(app);
bundlePostApiEndpoint(app);
bundleDeleteApiEndpoint(app);
hmrcTokenPostApiEndpoint(app);
hmrcVatReturnPostApiEndpoint(app);
hmrcVatObligationGetApiEndpoint(app);
hmrcVatReturnGetApiEndpoint(app);
hmrcReceiptGetApiEndpoint(app);
passGetApiEndpoint(app);
passPostApiEndpoint(app);
passAdminPostApiEndpoint(app);
passGeneratePostApiEndpoint(app);
passMyPassesGetApiEndpoint(app);
interestPostApiEndpoint(app);
sessionBeaconPostApiEndpoint(app);
billingCheckoutPostApiEndpoint(app);
billingPortalGetApiEndpoint(app);
billingRecoverPostApiEndpoint(app);
billingWebhookPostApiEndpoint(app);

// fallback to index.html for SPA routing (if needed)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../../web/public/index.html"), { dotfiles: "allow" });
});

const TEST_SERVER_HTTP_PORT = process.env.TEST_SERVER_HTTP_PORT || 3000;

// Only start the server if this file is being run directly (compare absolute paths) or under test harness
const __thisFile = fileURLToPath(import.meta.url);
const __argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
const __runDirect = __thisFile === __argv1 || String(process.env.TEST_SERVER_HTTP || "") === "run";

if (__runDirect) {
  // TODO: Get rid of this and make it always strict once otherwise stable
  const strict = process.env.STRICT_ENV_VALIDATION === "true";
  try {
    if (strict) {
      validateEnv([
        "DIY_SUBMIT_BASE_URL",
        "COGNITO_CLIENT_ID",
        "COGNITO_BASE_URI",
        "HMRC_BASE_URI",
        "HMRC_SANDBOX_BASE_URI",
        "HMRC_CLIENT_ID",
        "HMRC_CLIENT_SECRET_ARN",
        "HMRC_SANDBOX_CLIENT_ID",
        "HMRC_SANDBOX_CLIENT_SECRET_ARN",
        "RECEIPTS_DYNAMODB_TABLE_NAME",
        "BUNDLE_DYNAMODB_TABLE_NAME",
        "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME",
        "HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME",
        "HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME",
        "HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME",
        "SQS_QUEUE_URL",
      ]);
    } else {
      // In local/dev and behaviour tests, validate only essential vars
      validateEnv(["DIY_SUBMIT_BASE_URL", "HMRC_BASE_URI"]);
    }
  } catch (e) {
    if (strict) {
      throw e;
    } else {
      console.warn(`Non-strict env validation warning: ${e}`);
      logger.warn(`Non-strict env validation warning: ${e}`);
    }
  }
  // Detect vendor public IP at startup (same as Lambda cold start) for Gov-Vendor-Public-IP header
  detectVendorPublicIp()
    .then((ip) => {
      if (ip) {
        logger.info(`Detected vendor public IP for fraud prevention headers: ${ip}`);
      } else {
        logger.warn("Could not detect vendor public IP — Gov-Vendor-Public-IP will be missing");
      }
      return undefined;
    })
    .catch((err) => logger.warn(`Vendor public IP detection failed: ${err.message}`));
  if (process.env.TEST_SERVER_TLS === "run") {
    const certPath = process.env.TEST_SERVER_TLS_CERT;
    const keyPath = process.env.TEST_SERVER_TLS_KEY;
    const httpsPort = process.env.TEST_SERVER_HTTPS_PORT;
    // Throw at startup rather than falling back to HTTP and failing later at the first navigation.
    if (!certPath || !fs.existsSync(certPath)) {
      throw new Error(`TEST_SERVER_TLS=run but TEST_SERVER_TLS_CERT is missing or unreadable: ${certPath}`);
    }
    if (!keyPath || !fs.existsSync(keyPath)) {
      throw new Error(`TEST_SERVER_TLS=run but TEST_SERVER_TLS_KEY is missing or unreadable: ${keyPath}`);
    }
    const options = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
    https.createServer(options, app).listen(httpsPort, () => {
      const message = `Listening at https://local.submit.diyaccounting.co.uk:${httpsPort}`;
      console.log(message);
      logger.info(message);
    });
  } else {
    app.listen(TEST_SERVER_HTTP_PORT, () => {
      const message = `Listening at http://127.0.0.1:${TEST_SERVER_HTTP_PORT}`;
      console.log(message);
      logger.info(message);
    });
  }
}
