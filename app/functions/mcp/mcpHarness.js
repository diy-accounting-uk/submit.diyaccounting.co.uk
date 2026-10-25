// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/mcp/mcpHarness.js
// The chat harness page's tool endpoint, for the local Express server only (it is never a Lambda
// and never reaches prod). It runs one tool of the submission MCP server per request, in this
// process, signed in as the caller's own bearer or, on the simulator lane, as a fixed test user.

import { createSession } from "../../../mcp/lib/book-tools.js";
import { callHarnessTool, listHarnessTools } from "../../../mcp/lib/harness.js";

const SIMULATOR_USER_SUB = "mcp-harness-user";
const SESSION_HEADER = "x-harness-session";
const sessions = new Map();

function unsignedJwt(sub) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = { sub, email: `${sub}@example.com`, iat: issuedAt, exp: issuedAt + 3600 };
  return [encode({ alg: "none", typ: "JWT" }), encode(claims), ""].join(".");
}

function isProd() {
  return (process.env.ENVIRONMENT_NAME || "").toLowerCase() === "prod";
}

// The simulator user holds the bundles the harness scripts need. day-guest is self-service. A
// practice's client filings need resident-pro, which the simulator's mock checkout grants as it
// completes a subscription.
async function grantSimulatorBundles(origin, bearer) {
  const headers = { "Authorization": `Bearer ${bearer}`, "Content-Type": "application/json" };
  try {
    await fetch(`${origin}/api/v1/bundle`, { method: "POST", headers, body: JSON.stringify({ bundleId: "day-guest" }) });
    const checkout = await fetch(`${origin}/api/v1/billing/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify({ bundleId: "resident-pro" }),
    });
    const { checkoutUrl } = await checkout.json();
    const { pathname, search } = new URL(checkoutUrl);
    await fetch(`${origin}${pathname}${search}`, { redirect: "manual" });
  } catch {
    // The tool call that needs the bundle reports its absence.
  }
}

async function sessionFor(httpRequest) {
  const key = String(httpRequest.get(SESSION_HEADER) || "default");
  // The server's own listening port, never the Host header: the tool calls go back to this process.
  const origin = `http://127.0.0.1:${httpRequest.socket.localPort}`;
  if (!process.env.DIYA_SUBMIT_BASE_URL) process.env.DIYA_SUBMIT_BASE_URL = origin;
  const forwarded = httpRequest.get("authorization");
  const callerBearer = forwarded?.startsWith("Bearer ") ? forwarded.slice("Bearer ".length).trim() : null;
  const cacheKey = `${key}:${callerBearer ?? "simulator"}`;
  if (!sessions.has(cacheKey)) {
    const bearer = callerBearer ?? unsignedJwt(SIMULATOR_USER_SUB);
    const session = createSession({ credentials: { accessToken: async () => bearer, idToken: async () => null }, pollBudgetMs: 20000 });
    sessions.set(cacheKey, session);
    if (!callerBearer) await grantSimulatorBundles(origin, bearer);
  }
  return sessions.get(cacheKey);
}

/**
 * POST /api/v1/dev/mcp-harness/call with {tool, arguments} answers {ok, result}.
 * GET /api/v1/dev/mcp-harness/tools answers the tool list.
 * @param {import("express").Express} app
 */
export function apiEndpoint(app) {
  app.post("/api/v1/dev/mcp-harness/call", async (httpRequest, httpResponse) => {
    if (isProd()) return httpResponse.status(404).json({ message: "Not found" });
    const { tool, arguments: args } = httpRequest.body ?? {};
    if (typeof tool !== "string" || !tool) return httpResponse.status(400).json({ message: "tool is required" });
    try {
      return httpResponse.json(await callHarnessTool(await sessionFor(httpRequest), tool, args ?? {}));
    } catch (error) {
      return httpResponse.status(500).json({ ok: false, result: error.message });
    }
  });
  app.get("/api/v1/dev/mcp-harness/tools", async (httpRequest, httpResponse) => {
    if (isProd()) return httpResponse.status(404).json({ message: "Not found" });
    try {
      return httpResponse.json(await listHarnessTools(await sessionFor(httpRequest)));
    } catch (error) {
      return httpResponse.status(500).json({ message: error.message });
    }
  });
}
