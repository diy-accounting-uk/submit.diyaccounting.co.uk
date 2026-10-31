// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-18 Serve the submission MCP over HTTP behind CloudFront
// - **Use when:** a chat client must reach the submission MCP at `/mcp` with OAuth, or the routes, stack, edge behaviours or rate rules behind that endpoint need tracing.
// - **Does:** mcpHttp.js answers `/mcp` through handleMcpRequest in mcp/lib/http.js, with sessions in the mcp-sessions DynamoDB table; a session item also keeps the id of the session's HMRC grant (MCP-21). mcpOauth.js serves the OAuth metadata documents under `/.well-known/oauth-*` and the authorization facade under `/mcp/oauth/*` in front of Cognito. McpStack.java creates both Lambdas, the codes entry Lambda (MCP-20) and the HMRC grant Lambda (MCP-21); deploy.yml's deploy-mcp job deploys it before deploy-api. EdgeStack.java sends `/mcp`, `/mcp/*` and `/.well-known/oauth-*` to the API Gateway origin with caching off and every viewer header forwarded, and counts those paths in a WAF rate rule keyed on the Authorization header instead of the per-IP rule.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/mcp/mcpHttp.js`; `app/functions/mcp/mcpOauth.js`; `infra/main/java/co/uk/diyaccounting/submit/stacks/McpStack.java`
// - **Files:** app/functions/mcp/mcpHttp.js, app/functions/mcp/mcpOauth.js, mcp/lib/http.js, app/data/dynamoDbMcpSessionRepository.js, infra/main/java/co/uk/diyaccounting/submit/stacks/McpStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java, .github/workflows/deploy.yml
// - **Keywords:** hosted mcp, mcp http, streamable http, oauth facade, well-known, protected resource, mcp session, mcp rate limit, McpStack, deploy-mcp
// - **Related:** MCP-01, MCP-02
// @end-capability

// app/functions/mcp/mcpHttp.js
// The hosted MCP endpoint. Verifies the Cognito access token, keeps the MCP session in DynamoDB
// because Lambda keeps no process state between containers, and hands each request to the
// stateless streamable-HTTP transport in mcp/lib/http.js.

import { JwtVerifier } from "aws-jwt-verify";
import { createLogger } from "../../lib/logger.js";
import { getHeader } from "../../lib/httpResponseHelper.js";
import { buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import {
  createMcpSession,
  deleteMcpSession,
  getMcpSession,
  updateMcpSessionCloud,
  updateMcpSessionHmrcGrant,
} from "../../data/dynamoDbMcpSessionRepository.js";
import { handleMcpRequest } from "../../../mcp/lib/http.js";
import { hostedToolNames } from "../../../mcp/lib/hosted-tools.js";
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

  if (stored) session.hmrcGrant = stored.hmrcGrant ?? null;

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

  const response = await handleMcpRequest(buildRequest(event, host, httpMethod, bodyText), {
    session,
    toolNames: hostedToolNames(process.env.ENVIRONMENT_NAME),
  });
  const result = await mapResponse(response, extraHeaders);

  if (stored && session.cloud && !samePointer(session.cloud, stored.cloud)) {
    rememberBook(pointerKey(hashedSub, session.cloud), session);
    await updateMcpSessionCloud(stored.sessionId, session.cloud);
  }
  if (stored && (session.hmrcGrant?.grantId ?? null) !== (stored.hmrcGrant?.grantId ?? null)) {
    await updateMcpSessionHmrcGrant(stored.sessionId, session.hmrcGrant);
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
