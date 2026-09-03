// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/server.js
// Express server for the HTTP simulator

import express from "express";
import { apiEndpoint as localOAuthEndpoint } from "./routes/local-oauth.js";
import { apiEndpoint as hmrcOAuthEndpoint } from "./routes/hmrc-oauth.js";
import { apiEndpoint as vatReturnsEndpoint } from "./routes/vat-returns.js";
import { apiEndpoint as vatObligationsEndpoint } from "./routes/vat-obligations.js";
import { apiEndpoint as vatLiabilitiesEndpoint } from "./routes/vat-liabilities.js";
import { apiEndpoint as fraudHeadersEndpoint } from "./routes/fraud-headers.js";
import { apiEndpoint as testUserEndpoint } from "./routes/test-user.js";
import { apiEndpoint as openapiEndpoint } from "./routes/openapi.js";

/**
 * Create the Express app with all simulator routes
 * @returns {express.Application}
 */
export function createApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware for browser requests
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    console.log(`[http-simulator] ${req.method} ${req.url}`);
    next();
  });

  // Register route handlers
  // Order matters: more specific routes should come first

  // OAuth routes (handles both local OAuth and HMRC OAuth based on client_id)
  localOAuthEndpoint(app);
  hmrcOAuthEndpoint(app);

  // HMRC VAT API routes
  vatReturnsEndpoint(app);
  vatObligationsEndpoint(app);
  vatLiabilitiesEndpoint(app);
  fraudHeadersEndpoint(app);
  testUserEndpoint(app);

  // OpenAPI spec serving
  openapiEndpoint(app);

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "http-simulator" });
  });

  // 404 handler
  app.use((req, res) => {
    console.log(`[http-simulator] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.url}`,
    });
  });

  return app;
}

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.TEST_HTTP_SIMULATOR_PORT || 9000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`[http-simulator] Server listening on http://localhost:${port}`);
  });
}
