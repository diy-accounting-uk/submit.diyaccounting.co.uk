// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/mcp/mcpOauth.js
// The MCP OAuth facade: protected resource and authorization server metadata, DCR, a consent
// step, and a code and refresh relay to Cognito. State travels in signed blobs; nothing is stored.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger, context } from "../../lib/logger.js";
import {
  http200OkResponse,
  http201CreatedResponse,
  http400BadRequestResponse,
  http404NotFoundResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { fetchWithTimeout } from "../../lib/httpFetch.js";
import { buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { signBlob, verifyBlob } from "../../lib/mcpOauthBlob.js";
import {
  DCR_CLIENT_ID,
  acceptClient,
  buildRegistrationResponse,
  isCimdClientId,
  isLoopbackRedirectUri,
} from "../../lib/mcpOauthClients.js";

const logger = createLogger({ source: "app/functions/mcp/mcpOauth.js" });

export const SCOPES = ["openid", "email", "profile"];
const CONSENT_TTL_SECONDS = 600;
const UPSTREAM_TTL_SECONDS = 600;
const CODE_TTL_SECONDS = 300;
const UPSTREAM_TIMEOUT_MS = 6000;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_PARAM_LENGTH = 2048;
const PKCE_VALUE = /^[A-Za-z0-9\-._~]{43,128}$/;
const OAUTH_ERROR_CODE = /^[a-z_]{1,64}$/;
const CONSENT_COOKIE = "__Host-mcp_consent";
const METADATA_CACHE_CONTROL = "max-age=300";
const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
// Chrome applies form-action to the redirect that answers a form POST, so the consent form's
// answer, a redirect to the upstream authorize endpoint, needs that origin listed.
function pageHeaders() {
  const upstreamOrigin = new URL(process.env.MCP_UPSTREAM_AUTHORIZE_URL).origin;
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${upstreamOrigin}; frame-ancestors 'none'`,
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };
}

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
let blobKeyPromise = null;

/**
 * The blob key, read once per container: `MCP_OAUTH_BLOB_KEY` on local lanes, otherwise the
 * Secrets Manager secret named by `MCP_OAUTH_BLOB_KEY_SECRET_ARN`.
 */
export function loadBlobKey() {
  if (!blobKeyPromise) {
    blobKeyPromise = (async () => {
      if (process.env.MCP_OAUTH_BLOB_KEY) return process.env.MCP_OAUTH_BLOB_KEY;
      validateEnv(["MCP_OAUTH_BLOB_KEY_SECRET_ARN"]);
      const result = await smClient.send(new GetSecretValueCommand({ SecretId: process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN }));
      if (!result.SecretString) throw new Error("MCP OAuth blob key secret has no SecretString");
      return result.SecretString;
    })().catch((error) => {
      blobKeyPromise = null;
      throw error;
    });
  }
  return blobKeyPromise;
}

export function resetBlobKeyCache() {
  blobKeyPromise = null;
}

// ---------------------------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------------------------

function publicHosts() {
  return (process.env.MCP_PUBLIC_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function requestPath(event) {
  return event.rawPath || event.path || event.requestContext?.http?.path || "";
}

function requestMethod(event) {
  return (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
}

function decodedBody(event) {
  if (event.body === undefined || event.body === null) return "";
  const body = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : String(event.body);
  return body;
}

/**
 * Parse a query string or form body into single-valued parameters. A repeated parameter is refused,
 * as RFC 6749 section 3.1 requires.
 *
 * @returns {{ok: true, params: Record<string,string>} | {ok: false, description: string}}
 */
function parseSingleValued(raw) {
  const params = {};
  for (const [name, value] of new URLSearchParams(raw)) {
    if (Object.hasOwn(params, name)) return { ok: false, description: `Parameter ${name} is repeated` };
    if (value.length > MAX_PARAM_LENGTH) return { ok: false, description: `Parameter ${name} is too long` };
    params[name] = value;
  }
  return { ok: true, params };
}

function queryParams(event) {
  if (typeof event.rawQueryString === "string") return parseSingleValued(event.rawQueryString);
  return parseSingleValued(new URLSearchParams(event.queryStringParameters || {}).toString());
}

function formParams(event) {
  const contentType = getHeader(event.headers, "content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return { ok: false, description: "Body must be application/x-www-form-urlencoded" };
  }
  const body = decodedBody(event);
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return { ok: false, description: "Body too large" };
  return parseSingleValued(body);
}

function readCookie(event, name) {
  const pairs = Array.isArray(event.cookies) ? [...event.cookies] : [];
  const header = getHeader(event.headers, "cookie");
  if (header) pairs.push(...header.split(";"));
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index > 0 && pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }
  return null;
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * `resource` matches when its scheme and host, lower-cased, and its path, without a trailing
 * slash, equal the deployment's `/mcp` URL.
 */
export function resourceMatches(resource, host) {
  if (typeof resource !== "string" || !resource) return false;
  let url;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }
  if (url.search || url.hash || url.username || url.password) return false;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  return `${url.protocol}//${url.host}${path}` === `https://${host}/mcp`;
}

export function cutScope(scope) {
  const requested = new Set(typeof scope === "string" ? scope.split(" ").filter(Boolean) : []);
  const kept = SCOPES.filter((s) => requested.has(s));
  return (kept.length ? kept : SCOPES).join(" ");
}

function redirectHost(redirectUri) {
  try {
    return new URL(redirectUri).host;
  } catch {
    return undefined;
  }
}

function logOutcome(fields) {
  logger.info({ message: "MCP OAuth facade outcome", ...fields });
}

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

function oauthError(request, error, description, headers = {}) {
  return http400BadRequestResponse({
    request,
    headers: { ...NO_STORE, ...headers },
    message: description,
    error: { error, error_description: description },
  });
}

function methodNotAllowed(allow) {
  return {
    statusCode: 405,
    headers: { "Content-Type": "application/json", "Allow": allow },
    body: JSON.stringify({ error: "invalid_request", error_description: "Method not allowed" }),
  };
}

function redirect(location, headers = {}) {
  return { statusCode: 302, headers: { "Location": location, "Cache-Control": "no-store", ...headers }, body: "" };
}

function redirectToClient(redirectUri, params) {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, value);
  }
  return redirect(url.toString());
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const PAGE_STYLE =
  "body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a}" +
  "button{font-size:1rem;padding:.6rem 1.4rem;border:0;border-radius:.3rem;background:#1a5fb4;color:#fff;cursor:pointer}";

function htmlPage(statusCode, title, bodyHtml, headers = {}) {
  return {
    statusCode,
    headers: { ...pageHeaders(), ...headers },
    body:
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head><body>${bodyHtml}</body></html>`,
  };
}

function errorPage(description) {
  return htmlPage(
    400,
    "Sign-in request refused",
    `<h1>Sign-in request refused</h1><p>${escapeHtml(description)}</p><p>Close this window and try again from Claude.</p>`,
  );
}

function consentPage({ redirectUri, consentBlob, cookieNonce }) {
  const host = redirectHost(redirectUri);
  const loopbackLine = isLoopbackRedirectUri(redirectUri) ? "<p>The answer goes to a program on this computer.</p>" : "";
  return htmlPage(
    200,
    "Allow access to DIY Accounting Submit",
    `<h1>Allow access</h1>` +
      `<p>Claude (<strong>${escapeHtml(host)}</strong>) is asking to use DIY Accounting Submit as you.</p>` +
      loopbackLine +
      `<form method="post" action="/mcp/oauth/authorize">` +
      `<input type="hidden" name="consent" value="${escapeHtml(consentBlob)}">` +
      `<button type="submit">Continue</button></form>`,
    { "Set-Cookie": `${CONSENT_COOKIE}=${cookieNonce}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${CONSENT_TTL_SECONDS}` },
  );
}

// ---------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------

export function protectedResourceMetadata(host) {
  return {
    resource: `https://${host}/mcp`,
    authorization_servers: [`https://${host}`],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "DIY Accounting Submit",
  };
}

export function authorizationServerMetadata(host) {
  const base = `https://${host}`;
  return {
    issuer: base,
    authorization_endpoint: `${base}/mcp/oauth/authorize`,
    token_endpoint: `${base}/mcp/oauth/token`,
    registration_endpoint: `${base}/mcp/oauth/register`,
    revocation_endpoint: `${base}/mcp/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: SCOPES,
  };
}

function handleRegister({ event, request }) {
  const body = decodedBody(event);
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return oauthError(request, "invalid_client_metadata", "Body too large");
  let metadata;
  try {
    metadata = JSON.parse(body || "null");
  } catch {
    return oauthError(request, "invalid_client_metadata", "Body must be JSON");
  }
  const result = buildRegistrationResponse(metadata);
  if (!result.ok) {
    logOutcome({ endpoint: "register", outcome: result.error });
    return oauthError(request, result.error, result.description);
  }
  logOutcome({ endpoint: "register", outcome: "registered", redirectHosts: result.body.redirect_uris.map(redirectHost) });
  return http201CreatedResponse({ request, headers: { ...NO_STORE }, data: result.body });
}

async function handleAuthorizeGet({ event, host }) {
  const parsed = queryParams(event);
  if (!parsed.ok) return errorPage(parsed.description);
  const p = parsed.params;
  const clientId = p.client_id;
  const redirectUri = p.redirect_uri;

  const accepted = await acceptClient({ clientId, redirectUri });
  if (!accepted.ok) {
    logOutcome({ endpoint: "authorize", clientId, redirectHost: redirectHost(redirectUri), outcome: accepted.reason });
    return errorPage("This application or its return address is not recognised.");
  }

  const state = p.state;
  const refuse = (error, description) => {
    logOutcome({ endpoint: "authorize", clientId, redirectHost: redirectHost(redirectUri), outcome: error });
    return redirectToClient(redirectUri, { error, error_description: description, state, iss: `https://${host}` });
  };
  if (p.response_type !== "code") return refuse("unsupported_response_type", "response_type must be code");
  if (!p.code_challenge || !PKCE_VALUE.test(p.code_challenge)) return refuse("invalid_request", "code_challenge is required");
  if (p.code_challenge_method !== "S256") return refuse("invalid_request", "code_challenge_method must be S256");
  if (!resourceMatches(p.resource, host)) return refuse("invalid_target", "resource must name this server's /mcp URL");

  const key = await loadBlobKey();
  const cookieNonce = randomBytes(24).toString("base64url");
  const consentBlob = signBlob(
    {
      clientId,
      redirectUri,
      state: state ?? null,
      codeChallenge: p.code_challenge,
      scope: cutScope(p.scope),
      resource: `https://${host}/mcp`,
      nonce: cookieNonce,
    },
    key,
    { typ: "consent", ttlSeconds: CONSENT_TTL_SECONDS },
  );
  logOutcome({ endpoint: "authorize", clientId, redirectHost: redirectHost(redirectUri), outcome: "consent_shown", kind: accepted.kind });
  return consentPage({ redirectUri, consentBlob, cookieNonce });
}

async function handleAuthorizePost({ event, host }) {
  const parsed = formParams(event);
  if (!parsed.ok) return errorPage(parsed.description);
  const key = await loadBlobKey();
  const verified = verifyBlob(parsed.params.consent, key, "consent");
  if (!verified.ok) {
    logOutcome({ endpoint: "authorize_consent", outcome: `consent_${verified.reason}` });
    return errorPage("This sign-in request has expired or is not valid.");
  }
  const { nonce, ...fields } = verified.fields;
  if (!constantTimeEqual(readCookie(event, CONSENT_COOKIE), nonce)) {
    logOutcome({ endpoint: "authorize_consent", clientId: fields.clientId, outcome: "consent_cookie_mismatch" });
    return errorPage("This sign-in request was not started in this browser.");
  }
  const upstreamBlob = signBlob(fields, key, { typ: "upstream", ttlSeconds: UPSTREAM_TTL_SECONDS });
  const url = new URL(process.env.MCP_UPSTREAM_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.MCP_UPSTREAM_CLIENT_ID);
  url.searchParams.set("redirect_uri", `https://${host}/mcp/oauth/callback`);
  url.searchParams.set("code_challenge", fields.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", fields.scope);
  url.searchParams.set("state", upstreamBlob);
  logOutcome({
    endpoint: "authorize_consent",
    clientId: fields.clientId,
    redirectHost: redirectHost(fields.redirectUri),
    outcome: "to_upstream",
  });
  return redirect(url.toString(), {
    "Set-Cookie": `${CONSENT_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
  });
}

async function handleCallback({ event, host }) {
  const parsed = queryParams(event);
  if (!parsed.ok) return errorPage(parsed.description);
  const p = parsed.params;
  const key = await loadBlobKey();
  const verified = verifyBlob(p.state, key, "upstream");
  if (!verified.ok) {
    logOutcome({ endpoint: "callback", outcome: `upstream_${verified.reason}` });
    return errorPage("This sign-in request has expired or is not valid.");
  }
  const { clientId, redirectUri, state, scope } = verified.fields;
  const iss = `https://${host}`;
  if (p.error) {
    const error = OAUTH_ERROR_CODE.test(p.error) ? p.error : "server_error";
    logOutcome({ endpoint: "callback", clientId, redirectHost: redirectHost(redirectUri), outcome: `upstream_error_${error}` });
    return redirectToClient(redirectUri, { error, state, iss });
  }
  if (!p.code) {
    logOutcome({ endpoint: "callback", clientId, redirectHost: redirectHost(redirectUri), outcome: "upstream_no_code" });
    return redirectToClient(redirectUri, { error: "server_error", state, iss });
  }
  const codeBlob = signBlob({ code: p.code, clientId, redirectUri, scope }, key, { typ: "code", ttlSeconds: CODE_TTL_SECONDS });
  logOutcome({ endpoint: "callback", clientId, redirectHost: redirectHost(redirectUri), outcome: "code_relayed" });
  return redirectToClient(redirectUri, { code: codeBlob, state, iss });
}

async function postUpstream(url, form) {
  const { response } = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams(form).toString(),
    },
    UPSTREAM_TIMEOUT_MS,
  );
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, ok: response.ok, body };
}

function tokenSuccess(request, upstreamBody, scope) {
  const data = {
    access_token: upstreamBody.access_token,
    token_type: "Bearer",
    expires_in: upstreamBody.expires_in,
  };
  if (upstreamBody.refresh_token) data.refresh_token = upstreamBody.refresh_token;
  if (scope) data.scope = scope;
  return http200OkResponse({ request, headers: { ...NO_STORE }, data });
}

async function exchangeUpstream({ request, form, scope, logFields }) {
  let upstream;
  try {
    upstream = await postUpstream(process.env.MCP_UPSTREAM_TOKEN_URL, form);
  } catch (error) {
    logOutcome({ ...logFields, outcome: "upstream_unreachable", errorName: error?.name });
    return oauthError(request, "invalid_grant", "The grant could not be exchanged");
  }
  if (!upstream.ok || typeof upstream.body?.access_token !== "string") {
    const upstreamError =
      typeof upstream.body?.error === "string" && OAUTH_ERROR_CODE.test(upstream.body.error) ? upstream.body.error : "unknown";
    logOutcome({ ...logFields, outcome: "upstream_refused", upstreamStatus: upstream.status, upstreamError });
    return oauthError(request, "invalid_grant", "The grant is invalid, expired or revoked");
  }
  logOutcome({ ...logFields, outcome: "tokens_issued" });
  return tokenSuccess(request, upstream.body, scope);
}

async function handleToken({ event, request, host }) {
  const parsed = formParams(event);
  if (!parsed.ok) return oauthError(request, "invalid_request", parsed.description);
  const p = parsed.params;
  if (p.resource !== undefined && !resourceMatches(p.resource, host)) {
    logOutcome({ endpoint: "token", clientId: p.client_id, outcome: "invalid_target" });
    return oauthError(request, "invalid_target", "resource must name this server's /mcp URL");
  }

  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.client_id || !p.redirect_uri)
      return oauthError(request, "invalid_request", "code, client_id and redirect_uri are required");
    if (!p.code_verifier || !PKCE_VALUE.test(p.code_verifier)) return oauthError(request, "invalid_request", "code_verifier is required");
    const key = await loadBlobKey();
    const verified = verifyBlob(p.code, key, "code");
    if (!verified.ok) {
      logOutcome({ endpoint: "token", clientId: p.client_id, outcome: `code_${verified.reason}` });
      return oauthError(request, "invalid_grant", "The code is invalid or expired");
    }
    const { code, clientId, redirectUri, scope } = verified.fields;
    if (!constantTimeEqual(clientId, p.client_id) || !constantTimeEqual(redirectUri, p.redirect_uri)) {
      logOutcome({ endpoint: "token", clientId: p.client_id, outcome: "code_client_mismatch" });
      return oauthError(request, "invalid_grant", "The code was not issued to this client and redirect URI");
    }
    return exchangeUpstream({
      request,
      scope,
      form: {
        grant_type: "authorization_code",
        client_id: process.env.MCP_UPSTREAM_CLIENT_ID,
        code,
        redirect_uri: `https://${host}/mcp/oauth/callback`,
        code_verifier: p.code_verifier,
      },
      logFields: { endpoint: "token", grantType: "authorization_code", clientId, redirectHost: redirectHost(redirectUri) },
    });
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oauthError(request, "invalid_request", "refresh_token is required");
    if (!p.client_id || (p.client_id !== DCR_CLIENT_ID && !isCimdClientId(p.client_id))) {
      logOutcome({ endpoint: "token", outcome: "invalid_client" });
      return oauthError(request, "invalid_client", "client_id is not recognised");
    }
    return exchangeUpstream({
      request,
      scope: undefined,
      form: { grant_type: "refresh_token", client_id: process.env.MCP_UPSTREAM_CLIENT_ID, refresh_token: p.refresh_token },
      logFields: { endpoint: "token", grantType: "refresh_token", clientId: p.client_id },
    });
  }

  logOutcome({ endpoint: "token", clientId: p.client_id, outcome: "unsupported_grant_type" });
  return oauthError(request, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
}

async function handleRevoke({ event, request }) {
  const parsed = formParams(event);
  if (!parsed.ok) return oauthError(request, "invalid_request", parsed.description);
  if (!parsed.params.token) return oauthError(request, "invalid_request", "token is required");
  try {
    const upstream = await postUpstream(process.env.MCP_UPSTREAM_REVOKE_URL, {
      token: parsed.params.token,
      client_id: process.env.MCP_UPSTREAM_CLIENT_ID,
    });
    logOutcome({ endpoint: "revoke", clientId: parsed.params.client_id, outcome: "forwarded", upstreamStatus: upstream.status });
  } catch (error) {
    logOutcome({ endpoint: "revoke", clientId: parsed.params.client_id, outcome: "upstream_unreachable", errorName: error?.name });
  }
  return http200OkResponse({ request, headers: { ...NO_STORE }, data: {} });
}

const ROUTES = {
  "/.well-known/oauth-protected-resource": { GET: ({ request, host }) => metadataResponse(request, protectedResourceMetadata(host)) },
  "/.well-known/oauth-protected-resource/mcp": { GET: ({ request, host }) => metadataResponse(request, protectedResourceMetadata(host)) },
  "/.well-known/oauth-authorization-server": { GET: ({ request, host }) => metadataResponse(request, authorizationServerMetadata(host)) },
  "/mcp/oauth/register": { POST: handleRegister },
  "/mcp/oauth/authorize": { GET: handleAuthorizeGet, POST: handleAuthorizePost },
  "/mcp/oauth/callback": { GET: handleCallback },
  "/mcp/oauth/token": { POST: handleToken },
  "/mcp/oauth/revoke": { POST: handleRevoke },
};

function withJsonContentType(result) {
  if (!result.body) return result;
  if (Object.keys(result.headers || {}).some((name) => name.toLowerCase() === "content-type")) return result;
  return { ...result, headers: { ...result.headers, "Content-Type": "application/json" } };
}

function metadataResponse(request, data) {
  return http200OkResponse({ request, headers: { "Cache-Control": METADATA_CACHE_CONTROL }, data });
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  context.enterWith(new Map([["requestId", event?.requestContext?.requestId || randomBytes(8).toString("hex")]]));
  validateEnv([
    "MCP_PUBLIC_HOSTS",
    "MCP_UPSTREAM_AUTHORIZE_URL",
    "MCP_UPSTREAM_TOKEN_URL",
    "MCP_UPSTREAM_REVOKE_URL",
    "MCP_UPSTREAM_CLIENT_ID",
  ]);

  const path = requestPath(event).replace(/(.)\/$/, "$1");
  const method = requestMethod(event);
  const host = (getHeader(event.headers, "host") || "").toLowerCase();
  const request = new URL(`https://${publicHosts().includes(host) ? host : "unknown-host"}${path}`);

  if (!publicHosts().includes(host)) {
    logOutcome({ endpoint: path, outcome: "unknown_host" });
    return withJsonContentType(oauthError(request, "invalid_request", "Unknown host"));
  }

  const route = ROUTES[path];
  if (!route) return withJsonContentType(http404NotFoundResponse({ request, headers: {}, message: "Not found" }));
  const handler = route[method];
  if (!handler) return methodNotAllowed(Object.keys(route).join(", "));

  try {
    return withJsonContentType(await handler({ event, request, host }));
  } catch (error) {
    logger.error({ message: "MCP OAuth facade failed", endpoint: path, errorName: error?.name, errorMessage: error?.message });
    return withJsonContentType(http500ServerErrorResponse({ request, headers: { ...NO_STORE }, message: "server_error" }));
  }
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request
/* v8 ignore start */
export function apiEndpoint(app) {
  const handle = async (httpRequest, httpResponse) => {
    const event = buildLambdaEventFromHttpRequest(httpRequest);
    event.rawPath = httpRequest.path;
    event.rawQueryString = httpRequest.originalUrl?.split("?")[1] || "";
    const contentType = (httpRequest.get("content-type") || "").toLowerCase();
    if (contentType.startsWith("application/x-www-form-urlencoded") && httpRequest.body && typeof httpRequest.body === "object") {
      event.body = new URLSearchParams(httpRequest.body).toString();
    }
    const result = await ingestHandler(event);
    if (result.headers) httpResponse.set(result.headers);
    return httpResponse.status(result.statusCode).send(result.body || "");
  };
  app.get("/.well-known/oauth-protected-resource", handle);
  app.get("/.well-known/oauth-protected-resource/mcp", handle);
  app.get("/.well-known/oauth-authorization-server", handle);
  app.all("/mcp/oauth/:action", handle);
}
/* v8 ignore stop */
