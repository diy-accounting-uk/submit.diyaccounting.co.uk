// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/primableMockServer.js
// Lightweight primable HTTP server for system tests to intercept HMRC HTTP calls

import http from "http";
import { URL } from "url";

/**
 * Start a primable mock HTTP server.
 *
 * Returns an object with:
 *  - baseUrl: the base URL to direct traffic to (e.g., HMRC_BASE_URI)
 *  - prime(matcher, responder): add a matcher/responder for requests
 *      - matcher: function({ method, path, rawBody, search }), string or RegExp
 *      - responder: async function({ method, url, rawBody, headers }) => { status, headers, body }
 *  - stop(): stop the server
 *
 * Includes a default responder for POST /oauth/token that returns a deterministic token
 * based on the provided authorization code (in x-www-form-urlencoded body).
 */
export function startHmrcMockServer() {
  const primed = [];

  function prime(matcher, responder) {
    primed.push({ matcher, responder });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || "GET";
      const urlObj = new URL(req.url, "http://localhost");

      // Read body (support JSON and form submissions)
      const chunks = [];
      await new Promise((resolve) => {
        req.on("data", (c) => chunks.push(c));
        req.on("end", resolve);
      });
      const rawBody = Buffer.concat(chunks).toString("utf8");

      // Find first matching primed responder
      const match = primed.find(({ matcher }) => {
        if (typeof matcher === "function") return matcher({ method, path: urlObj.pathname, rawBody, search: urlObj.search });
        if (matcher instanceof RegExp) return matcher.test(`${method} ${urlObj.pathname}`) || matcher.test(urlObj.pathname);
        return matcher === `${method} ${urlObj.pathname}` || matcher === urlObj.pathname;
      });

      if (match) {
        const result = await match.responder({ method, url: urlObj, rawBody, headers: req.headers });
        const status = result?.statusCode || result?.status || 200;
        const headers = { "content-type": "application/json", ...(result?.headers || {}) };
        const body = result?.body ?? {};
        res.writeHead(status, headers);
        res.end(typeof body === "string" ? body : JSON.stringify(body));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Not primed", path: urlObj.pathname }));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Mock server error", error: String(err) }));
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => {
      if (err) return reject(err);
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      // Default priming for POST /oauth/token
      prime(
        (req) => req.method === "POST" && req.path === "/oauth/token",
        ({ rawBody }) => {
          const params = new URLSearchParams(rawBody || "");
          const code = params.get("code") || "unknown-code";
          const token = `mock-token-${code}`;
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: {
              access_token: token,
              token_type: "Bearer",
              expires_in: 3600,
              refresh_token: `mock-refresh-${code}`,
              id_token: `mock-id-${code}`,
              scope: "write:vat read:vat",
            },
          };
        },
      );

      resolve({
        baseUrl,
        prime,
        stop: async () => {
          try {
            server.close();
          } catch (err) {
            console.warn("Failed to close mock server:", err.message, err.stack);
          }
        },
      });
    });
  });
}
