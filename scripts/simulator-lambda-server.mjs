// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/simulator-lambda-server.mjs
// Standalone HTTP server for Lambda Web Adapter deployment.
// Uses only Node.js built-in modules (no Express, no npm dependencies).
// Serves static files and mock HMRC API endpoints for the simulator demo.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "8080", 10);
const BASE_URL = process.env.DIY_SUBMIT_BASE_URL || `http://localhost:${PORT}/`;

// MIME type map for static file serving
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// In-memory state
const bundles = new Map();
const receipts = new Map();
const submittedReturns = new Map();

// Pre-populate demo bundles
bundles.set("demo-user-12345", [
  { bundleId: "default", expiry: null },
  { bundleId: "test", expiry: "2099-12-31" },
  { bundleId: "hmrc-vat-synthetic", expiry: "2099-12-31" },
]);

// Default obligations (with randomized period keys)
function generateRandomPeriodKey() {
  const year = String(17 + Math.floor(Math.random() * 10)).padStart(2, "0");
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const suffix = Math.random() < 0.5 ? String(Math.floor(Math.random() * 10)) : String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${year}${letter}${suffix}`;
}

function generateDefaultObligations() {
  return [
    {
      periodKey: generateRandomPeriodKey(),
      start: "2017-01-01",
      end: "2017-03-31",
      due: "2017-05-07",
      status: "F",
      received: "2017-05-06",
    },
    {
      periodKey: generateRandomPeriodKey(),
      start: "2017-04-01",
      end: "2017-06-30",
      due: "2017-08-07",
      status: "O",
    },
  ];
}

// Parse URL-encoded body
function parseUrlEncoded(str) {
  const params = {};
  for (const pair of str.split("&")) {
    const [key, ...rest] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(rest.join("="));
  }
  return params;
}

// Read request body
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// Send JSON response
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// Send text response
function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

// Add common headers (CORS, security)
function addCommonHeaders(req, res) {
  const origin = req.headers.origin;
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
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://submit.diyaccounting.co.uk https://*.submit.diyaccounting.co.uk http://localhost:*",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

// Parse JSON body
async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Try URL-encoded
    return parseUrlEncoded(raw);
  }
}

// Serve static file
async function serveStatic(req, res, urlPath) {
  // Prevent directory traversal
  const safePath = urlPath.replace(/\.\./g, "").replace(/\/\//g, "/");
  let filePath = join(__dirname, safePath);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    // If path doesn't exist as directory, try as file
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length,
      "Cache-Control": "public, max-age=300",
    });
    res.end(content);
  } catch {
    // API paths must never get SPA fallback - return JSON 404
    if (safePath.startsWith("/api/")) {
      return sendJson(res, 404, { error: "Not found", path: safePath });
    }
    // SPA fallback - serve index.html for HTML-like requests
    if (!extname(safePath) || extname(safePath) === ".html") {
      try {
        const indexContent = await readFile(join(__dirname, "index.html"));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": indexContent.length,
        });
        res.end(indexContent);
        return;
      } catch {
        // Fall through to 404
      }
    }
    sendJson(res, 404, { error: "Not found" });
  }
}

// Route handler
async function handleRequest(req, res) {
  addCommonHeaders(req, res);

  // Handle OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // --- API Routes ---

  // Health check
  if (path === "/health" && req.method === "GET") {
    return sendJson(res, 200, { status: "ok", service: "simulator", mode: "demo" });
  }

  // Environment config
  if (path === "/submit.env" && req.method === "GET") {
    const lines = [
      `COGNITO_CLIENT_ID=simulator`,
      `COGNITO_BASE_URI=${BASE_URL}`,
      `HMRC_CLIENT_ID=simulator`,
      `HMRC_BASE_URI=${BASE_URL}`,
      `HMRC_SANDBOX_CLIENT_ID=simulator`,
      `HMRC_SANDBOX_BASE_URI=${BASE_URL}`,
      `DIY_SUBMIT_BASE_URL=${BASE_URL}`,
      `SIMULATOR_MODE=true`,
    ];
    return sendText(res, 200, lines.join("\n") + "\n");
  }

  // Bundle API
  if (path === "/api/v1/bundle" && req.method === "GET") {
    const userBundles = bundles.get("demo-user-12345") || [];
    return sendJson(res, 200, { bundles: userBundles });
  }

  if (path === "/api/v1/bundle" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const { bundleId } = body;
    if (!bundleId) return sendJson(res, 400, { error: "bundleId required" });
    const userBundles = bundles.get("demo-user-12345") || [];
    if (!userBundles.some((b) => b.bundleId === bundleId)) {
      userBundles.push({ bundleId, expiry: "2099-12-31" });
      bundles.set("demo-user-12345", userBundles);
    }
    return sendJson(res, 201, { bundleId, status: "granted" });
  }

  if (path.startsWith("/api/v1/bundle/") && req.method === "DELETE") {
    const bundleId = path.split("/").pop();
    const userBundles = bundles.get("demo-user-12345") || [];
    bundles.set(
      "demo-user-12345",
      userBundles.filter((b) => b.bundleId !== bundleId),
    );
    res.writeHead(204);
    return res.end();
  }

  // Receipt API
  if (path === "/api/v1/hmrc/receipt" && req.method === "GET") {
    const userReceipts = receipts.get("demo-user-12345") || [];
    return sendJson(res, 200, { receipts: userReceipts });
  }

  if (path.startsWith("/api/v1/hmrc/receipt/") && req.method === "GET") {
    const receiptId = path.split("/").pop();
    const userReceipts = receipts.get("demo-user-12345") || [];
    const receipt = userReceipts.find((r) => r.receiptId === receiptId);
    if (!receipt) return sendJson(res, 404, { error: "Receipt not found" });
    return sendJson(res, 200, receipt);
  }

  // Auth URL
  if (path === "/api/v1/auth/url" && req.method === "GET") {
    const redirectUri = url.searchParams.get("redirectUri") || "/";
    const account = url.searchParams.get("account") || "synthetic";
    const authUrl = `/oauth/authorize?response_type=code&client_id=simulator&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:vat+write:vat&state=simulator-state&autoGrant=true`;
    return sendJson(res, 200, { url: authUrl, account });
  }

  // Token exchange
  if (path === "/api/v1/hmrc/token" && req.method === "POST") {
    return sendJson(res, 200, {
      access_token: "simulator-access-token-" + Date.now(),
      refresh_token: "simulator-refresh-token-" + Date.now(),
      expires_in: 14400,
      token_type: "bearer",
      scope: "read:vat write:vat",
    });
  }

  // VAT return POST (submit)
  if (path === "/api/v1/hmrc/vat/return" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const formBundleNumber = String(Math.floor(Math.random() * 9000000000) + 1000000000);
    const processingDate = new Date().toISOString();
    const chargeRefNumber = `XD${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`;

    // Store receipt
    const receiptId = `receipt-${Date.now()}`;
    const userReceipts = receipts.get("demo-user-12345") || [];
    userReceipts.push({
      receiptId,
      formBundleNumber,
      processingDate,
      chargeRefNumber,
      paymentIndicator: "DD",
      vrn: body.vrn,
      periodKey: body.periodKey,
      createdAt: new Date().toISOString(),
    });
    receipts.set("demo-user-12345", userReceipts);

    // Store return
    if (body.vrn && body.periodKey) {
      submittedReturns.set(`${body.vrn}:${body.periodKey}`, body);
    }

    res.setHeader("Receipt-ID", randomUUID());
    res.setHeader("X-CorrelationId", randomUUID());
    return sendJson(res, 201, {
      processingDate,
      paymentIndicator: "DD",
      formBundleNumber,
      chargeRefNumber,
    });
  }

  // VAT return GET (view)
  if (path === "/api/v1/hmrc/vat/return" && req.method === "GET") {
    const vrn = url.searchParams.get("vrn");
    const periodKey = url.searchParams.get("periodKey");
    const stored = submittedReturns.get(`${vrn}:${periodKey}`);
    if (stored) return sendJson(res, 200, stored);
    return sendJson(res, 200, {
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
  }

  // VAT obligations
  if (path === "/api/v1/hmrc/vat/obligation" && req.method === "GET") {
    const statusFilter = url.searchParams.get("status");
    let obligations = generateDefaultObligations();
    if (statusFilter) {
      obligations = obligations.filter((o) => o.status === statusFilter);
    }
    return sendJson(res, 200, { obligations });
  }

  // OAuth authorize (auto-grant for simulator)
  if (path === "/oauth/authorize" && req.method === "GET") {
    const redirectUri = url.searchParams.get("redirect_uri") || "/";
    const state = url.searchParams.get("state") || "";
    const code = "simulator-auth-code-" + Date.now();
    const separator = redirectUri.includes("?") ? "&" : "?";
    const location = `${redirectUri}${separator}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    res.writeHead(302, { Location: location });
    return res.end();
  }

  // OAuth token exchange
  if ((path === "/oauth/token" || path === "/default/token") && req.method === "POST") {
    return sendJson(res, 200, {
      access_token: "simulator-access-token-" + Date.now(),
      refresh_token: "simulator-refresh-token-" + Date.now(),
      expires_in: 14400,
      token_type: "bearer",
      scope: "read:vat write:vat",
    });
  }

  // Cognito-like token endpoint
  if (path === "/oauth2/token" && req.method === "POST") {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "demo-user-12345",
        email: "demo@simulator.diyaccounting.co.uk",
        name: "Demo User",
        given_name: "Demo",
      }),
    ).toString("base64url");
    return sendJson(res, 200, {
      access_token: `${header}.${payload}.`,
      id_token: `${header}.${payload}.`,
      refresh_token: "simulator-refresh-" + Date.now(),
      expires_in: 3600,
      token_type: "Bearer",
    });
  }

  // Test user creation (HMRC sandbox)
  if (path === "/create-test-user/organisations" && req.method === "POST") {
    return sendJson(res, 201, {
      userId: randomUUID(),
      password: "simulator-password",
      vrn: String(Math.floor(Math.random() * 900000000) + 100000000),
      organisationDetails: { name: "Simulator Org", address: { line1: "1 Demo Street" } },
    });
  }

  // Fraud header validation
  if (path === "/test/fraud-prevention-headers/validate" && req.method === "GET") {
    return sendJson(res, 200, { code: "VALID", errors: [], warnings: [] });
  }

  // HMRC VAT returns (direct HMRC-style paths)
  const vatReturnMatch = path.match(/^\/organisations\/vat\/(\d+)\/returns$/);
  if (vatReturnMatch && req.method === "POST") {
    const vrn = vatReturnMatch[1];
    const body = await parseJsonBody(req);
    const formBundleNumber = String(Math.floor(Math.random() * 9000000000) + 1000000000);
    const processingDate = new Date().toISOString();
    const chargeRefNumber = `XD${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`;
    if (body.periodKey) {
      submittedReturns.set(`${vrn}:${body.periodKey}`, { vrn, ...body });
    }
    res.setHeader("Receipt-ID", randomUUID());
    res.setHeader("X-CorrelationId", randomUUID());
    return sendJson(res, 201, {
      processingDate,
      paymentIndicator: "DD",
      formBundleNumber,
      chargeRefNumber,
    });
  }

  // HMRC VAT obligations (direct HMRC-style path)
  const vatObligationsMatch = path.match(/^\/organisations\/vat\/(\d+)\/obligations$/);
  if (vatObligationsMatch && req.method === "GET") {
    const statusFilter = url.searchParams.get("status");
    let obligations = generateDefaultObligations();
    if (statusFilter) {
      obligations = obligations.filter((o) => o.status === statusFilter);
    }
    return sendJson(res, 200, { obligations });
  }

  // HMRC VAT return GET (direct HMRC-style path)
  const vatReturnGetMatch = path.match(/^\/organisations\/vat\/(\d+)\/returns\/(.+)$/);
  if (vatReturnGetMatch && req.method === "GET") {
    const vrn = vatReturnGetMatch[1];
    const periodKey = vatReturnGetMatch[2];
    const stored = submittedReturns.get(`${vrn}:${periodKey}`);
    if (stored) return sendJson(res, 200, stored);
    return sendJson(res, 200, {
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
  }

  // --- Static file serving (fallback) ---
  await serveStatic(req, res, path);
}

// Create and start server
const server = createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error("Request error:", err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    }
  }
});

server.listen(PORT, () => {
  console.log(`[simulator-lambda] Listening on port ${PORT}`);
  console.log(`[simulator-lambda] Base URL: ${BASE_URL}`);
});
