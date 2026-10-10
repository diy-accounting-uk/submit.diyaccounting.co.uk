// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/mcp/mcpHttp.js
// The hosted MCP endpoint. Verifies the Cognito access token, keeps the MCP session in DynamoDB
// because Lambda keeps no process state between containers, and hands each request to the
// stateless streamable-HTTP transport in mcp/lib/http.js.

import { JwtVerifier } from "aws-jwt-verify";
import { createLogger } from "../../lib/logger.js";
import { getHeader } from "../../lib/httpResponseHelper.js";
import { buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { createMcpSession, deleteMcpSession, getMcpSession, updateMcpSessionCloud } from "../../data/dynamoDbMcpSessionRepository.js";
import { handleMcpRequest } from "../../../mcp/lib/http.js";
import { createSession, restoreCloudBook } from "../../../mcp/lib/book-tools.js";

const logger = createLogger({ source: "app/functions/mcp/mcpHttp.js" });

const HOSTED_POLL_BUDGET_MS = 20000;
const RESTORED_BOOK_CACHE_LIMIT = 8;
const SESSION_HEADER = "Mcp-Session-Id";
const BEARER_SCOPE = "openid email profile";

let tokenVerifier = null;
const restoredBooks = new Map();

/**
 * The bearer verifier, created once per container. Exported so a system test can cacheJwks a
 * local key pair into it.
 */
export function getTokenVerifier() {
  if (!tokenVerifier) {
    const clientId = process.env.MCP_TOKEN_CLIENT_ID;
    tokenVerifier = JwtVerifier.create({
      issuer: process.env.MCP_TOKEN_ISSUER,
      jwksUri: process.env.MCP_TOKEN_JWKS_URI,
      audience: null,
      customJwtCheck: ({ payload }) => {
        if (payload.token_use !== "access") throw new Error("token_use is not access");
        if (payload.client_id !== clientId) throw new Error("token was issued to another client");
      },
    });
  }
  return tokenVerifier;
}

function listFromEnv(name) {
  return (process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function jsonRpcError(statusCode, message, headers = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }),
  };
}

function unauthorized(host, tokenWasPresent) {
  const challenge =
    `Bearer resource_metadata="https://${host}/.well-known/oauth-protected-resource/mcp", scope="${BEARER_SCOPE}"` +
    (tokenWasPresent ? ', error="invalid_token"' : "");
  return jsonRpcError(401, "Unauthorized", { "WWW-Authenticate": challenge });
}

function method(event) {
  return (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
}

function decodedBody(event) {
  if (event.body === undefined || event.body === null) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : String(event.body);
}

function isInitialize(bodyText) {
  try {
    const message = JSON.parse(bodyText);
    return !Array.isArray(message) && message?.method === "initialize";
  } catch {
    return false;
  }
}

function buildRequest(event, host, httpMethod, bodyText) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers || {})) {
    if (value !== undefined && value !== null && name.toLowerCase() !== "host") headers.set(name, String(value));
  }
  const hasBody = httpMethod !== "GET" && httpMethod !== "HEAD";
  return new Request(`https://${host}/mcp`, { method: httpMethod, headers, body: hasBody ? bodyText : undefined });
}

function pointerKey(hashedSub, pointer) {
  return `${hashedSub}:${pointer.bookId}:${pointer.etag}`;
}

function samePointer(a, b) {
  if (!a || !b) return a === b;
  return a.bookId === b.bookId && (a.clientId ?? null) === (b.clientId ?? null) && a.etag === b.etag;
}

function rememberBook(key, session) {
  restoredBooks.delete(key);
  restoredBooks.set(key, {
    book: session.book,
    lines: session.lines,
    product: session.product,
    sourcePath: session.sourcePath,
    cloud: session.cloud,
  });
  while (restoredBooks.size > RESTORED_BOOK_CACHE_LIMIT) {
    restoredBooks.delete(restoredBooks.keys().next().value);
  }
}

async function loadStoredBook(session, hashedSub, pointer) {
  const key = pointerKey(hashedSub, pointer);
  const cached = restoredBooks.get(key);
  if (cached) {
    Object.assign(session, cached);
    return;
  }
  await restoreCloudBook(session, pointer);
  rememberBook(key, session);
}

async function mapResponse(response, extraHeaders) {
  const headers = { ...Object.fromEntries(response.headers), ...extraHeaders };
  return { statusCode: response.status, headers, body: await response.text() };
}

export async function ingestHandler(event) {
  const httpMethod = method(event);
  const host = (getHeader(event.headers, "host") || "").toLowerCase();
  const publicHosts = listFromEnv("MCP_PUBLIC_HOSTS").map((h) => h.toLowerCase());
  if (!publicHosts.includes(host)) return jsonRpcError(403, "Unknown host");

  const origin = getHeader(event.headers, "origin");
  if (origin && !listFromEnv("MCP_ALLOWED_ORIGINS").includes(origin)) return jsonRpcError(403, "Origin not allowed");

  if (httpMethod === "GET") return jsonRpcError(405, "Method not allowed", { Allow: "POST, DELETE" });
  if (httpMethod !== "POST" && httpMethod !== "DELETE") {
    return jsonRpcError(405, "Method not allowed", { Allow: "POST, DELETE" });
  }

  const authorization = getHeader(event.headers, "authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : null;
  if (!token) return unauthorized(host, Boolean(authorization));

  let sub;
  try {
    ({ sub } = await getTokenVerifier().verify(token));
  } catch (error) {
    logger.warn({ message: "MCP bearer rejected", reason: error.message });
    return unauthorized(host, true);
  }

  await initializeSalt();
  const hashedSub = hashSub(sub);

  const bodyText = decodedBody(event);
  const startsSession = httpMethod === "POST" && isInitialize(bodyText);

  let stored = null;
  if (!startsSession) {
    const sessionId = getHeader(event.headers, SESSION_HEADER);
    if (!sessionId) return jsonRpcError(400, `${SESSION_HEADER} header is required`);
    stored = await getMcpSession(sessionId);
    if (!stored || stored.hashedSub !== hashedSub) return jsonRpcError(404, "Session not found");
  }

  if (httpMethod === "DELETE") {
    await deleteMcpSession(stored.sessionId);
    return { statusCode: 204, headers: {}, body: "" };
  }

  const session = createSession({
    credentials: { accessToken: async () => token, idToken: async () => null },
    pollBudgetMs: HOSTED_POLL_BUDGET_MS,
  });

  let extraHeaders = {};
  if (startsSession) {
    const created = await createMcpSession(hashedSub);
    extraHeaders = { [SESSION_HEADER]: created.sessionId };
  } else if (stored.cloud && isToolCall(bodyText)) {
    try {
      await loadStoredBook(session, hashedSub, stored.cloud);
    } catch (error) {
      logger.warn({ message: "MCP session book could not be restored", sessionId: stored.sessionId, reason: error.message });
      return jsonRpcError(500, "The session's book could not be reopened");
    }
  }

  const response = await handleMcpRequest(buildRequest(event, host, httpMethod, bodyText), { session });
  const result = await mapResponse(response, extraHeaders);

  if (stored && session.cloud && !samePointer(session.cloud, stored.cloud)) {
    rememberBook(pointerKey(hashedSub, session.cloud), session);
    await updateMcpSessionCloud(stored.sessionId, session.cloud);
  }
  return result;
}

function isToolCall(bodyText) {
  try {
    const message = JSON.parse(bodyText);
    return !Array.isArray(message) && message?.method === "tools/call";
  } catch {
    return false;
  }
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request. The
// body goes out verbatim: the shared response builder would JSON-parse it and turn a 202's empty
// body into {}.
/* v8 ignore start */
export function apiEndpoint(app) {
  const handle = async (httpRequest, httpResponse) => {
    const event = buildLambdaEventFromHttpRequest(httpRequest);
    event.httpMethod = httpRequest.method;
    event.body = httpRequest.body === undefined || httpRequest.method === "GET" ? "" : JSON.stringify(httpRequest.body);
    const result = await ingestHandler(event);
    if (result.headers) httpResponse.set(result.headers);
    return httpResponse.status(result.statusCode).send(result.body || "");
  };
  app.post("/mcp", handle);
  app.delete("/mcp", handle);
  app.get("/mcp", handle);
}
/* v8 ignore stop */
