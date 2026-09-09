// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/mockTokenPost.js

import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/non-lambda-mocks/mockTokenPost.js" });

export function apiEndpoint(app) {
  // Proxy to local mock OAuth2 server token endpoint to avoid browser PNA/CORS
  app.post("/api/v1/mock/token", async (req, res) => {
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(req.body || {})) {
        if (Array.isArray(value)) {
          for (const v of value) params.append(key, v);
        } else if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }

      // Support configurable mock OAuth2 base URL (default: Docker mock-oauth2-server)
      const mockBase = process.env.TEST_MOCK_OAUTH2_BASE || "http://localhost:8080";
      const resp = await fetch(`${mockBase}/default/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const contentType = resp.headers.get("content-type") || "application/json";
      const text = await resp.text();
      res.status(resp.status).set("content-type", contentType).send(text);
    } catch (e) {
      logger.error(`Mock token proxy error: ${e?.stack || e}`);
      res.status(500).json({ message: "Mock token proxy failed", error: String(e) });
    }
  });
}
