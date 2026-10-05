// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/mcpOauthClients.js
// Client acceptance for the MCP OAuth facade: the redirect URI allowlist, the one DCR client id,
// and Client ID Metadata Documents (CIMD) fetched only from claude.ai and claude.com.

export const DCR_CLIENT_ID = "diya-submit-dcr";

const CLAUDE_CALLBACKS = new Set(["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);
const CIMD_HOSTS = new Set(["claude.ai", "claude.com"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const MAX_URI_LENGTH = 2048;
const MAX_REDIRECT_URIS = 10;

const CIMD_FETCH_TIMEOUT_MS = 3000;
const CIMD_MAX_BYTES = 64 * 1024;
const CIMD_MAX_CACHE_SECONDS = 3600;
const CIMD_MAX_CACHE_ENTRIES = 50;

const cimdCache = new Map();

function parseUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URI_LENGTH) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isLoopbackRedirectUri(redirectUri) {
  const url = parseUrl(redirectUri);
  if (!url) return false;
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) && !url.username && !url.password && !url.hash;
}

/**
 * Exactly one of Claude's two callbacks, or a loopback http URI on localhost or 127.0.0.1 with any port.
 */
export function isAllowedRedirectUri(redirectUri) {
  if (typeof redirectUri !== "string") return false;
  if (CLAUDE_CALLBACKS.has(redirectUri)) return true;
  return isLoopbackRedirectUri(redirectUri);
}

/**
 * An HTTPS URL with a path on claude.ai or claude.com, with no port, credentials or fragment.
 */
export function isCimdClientId(clientId) {
  const url = parseUrl(clientId);
  if (!url) return false;
  return (
    url.protocol === "https:" &&
    CIMD_HOSTS.has(url.hostname) &&
    url.port === "" &&
    !url.username &&
    !url.password &&
    !url.hash &&
    url.pathname !== "/" &&
    url.href === clientId
  );
}

const ALLOWED_GRANT_TYPES = new Set(["authorization_code", "refresh_token"]);
const ALLOWED_RESPONSE_TYPES = new Set(["code"]);

/**
 * Dynamic client registration (RFC 7591). Nothing is stored: every registration gets the same
 * client id, and the redirect allowlist is checked again on every authorize.
 *
 * @returns {{ok: true, body: object} | {ok: false, error: string, description: string}}
 */
export function buildRegistrationResponse(metadata, { now } = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { ok: false, error: "invalid_client_metadata", description: "Body must be a JSON object" };
  }
  const redirectUris = metadata.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
    return { ok: false, error: "invalid_redirect_uri", description: "redirect_uris must list between 1 and 10 URIs" };
  }
  if (!redirectUris.every(isAllowedRedirectUri)) {
    return { ok: false, error: "invalid_redirect_uri", description: "A redirect URI is not allowed" };
  }
  if (metadata.grant_types !== undefined) {
    if (!Array.isArray(metadata.grant_types) || !metadata.grant_types.every((g) => ALLOWED_GRANT_TYPES.has(g))) {
      return { ok: false, error: "invalid_client_metadata", description: "Unsupported grant_types" };
    }
  }
  if (metadata.response_types !== undefined) {
    if (!Array.isArray(metadata.response_types) || !metadata.response_types.every((r) => ALLOWED_RESPONSE_TYPES.has(r))) {
      return { ok: false, error: "invalid_client_metadata", description: "Unsupported response_types" };
    }
  }
  return {
    ok: true,
    body: {
      client_id: DCR_CLIENT_ID,
      client_id_issued_at: Math.floor((now ?? Date.now()) / 1000),
      redirect_uris: [...redirectUris],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

function cacheSecondsFrom(cacheControl) {
  if (typeof cacheControl !== "string") return 0;
  if (/(^|,)\s*(no-store|no-cache)\s*(,|$)/i.test(cacheControl)) return 0;
  const match = /(?:^|,)\s*max-age\s*=\s*(\d+)/i.exec(cacheControl);
  if (!match) return 0;
  return Math.min(Number.parseInt(match[1], 10), CIMD_MAX_CACHE_SECONDS);
}

async function readCappedText(response, maxBytes) {
  const declared = Number.parseInt(response.headers?.get?.("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body?.getReader) {
    const text = await response.text();
    return Buffer.byteLength(text, "utf8") > maxBytes ? null : text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Fetch and check a Client ID Metadata Document. Refuses any URL outside claude.ai and claude.com
 * before a request is made.
 *
 * @returns {Promise<{ok: true, document: object} | {ok: false, reason: string}>}
 */
export async function fetchClientMetadataDocument(clientId, { now } = {}) {
  if (!isCimdClientId(clientId)) return { ok: false, reason: "client_id_host_not_allowed" };
  const nowMs = now ?? Date.now();
  const cached = cimdCache.get(clientId);
  if (cached && cached.expiresAt > nowMs) return { ok: true, document: cached.document };
  if (cached) cimdCache.delete(clientId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIMD_FETCH_TIMEOUT_MS);
  let document;
  let cacheSeconds;
  try {
    const response = await fetch(clientId, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status !== 200) return { ok: false, reason: "metadata_fetch_status" };
    const text = await readCappedText(response, CIMD_MAX_BYTES);
    if (text === null) return { ok: false, reason: "metadata_too_large" };
    try {
      document = JSON.parse(text);
    } catch {
      return { ok: false, reason: "metadata_not_json" };
    }
    cacheSeconds = cacheSecondsFrom(response.headers?.get?.("cache-control"));
  } catch {
    return { ok: false, reason: "metadata_fetch_failed" };
  } finally {
    clearTimeout(timer);
  }

  if (!document || typeof document !== "object" || Array.isArray(document)) return { ok: false, reason: "metadata_not_object" };
  if (document.client_id !== clientId) return { ok: false, reason: "metadata_client_id_mismatch" };
  if (!Array.isArray(document.redirect_uris)) return { ok: false, reason: "metadata_redirect_uris_missing" };

  if (cacheSeconds > 0) {
    if (cimdCache.size >= CIMD_MAX_CACHE_ENTRIES) cimdCache.delete(cimdCache.keys().next().value);
    cimdCache.set(clientId, { document, expiresAt: nowMs + cacheSeconds * 1000 });
  }
  return { ok: true, document };
}

export function clearClientMetadataCache() {
  cimdCache.clear();
}

/**
 * Accept a client id and redirect URI pair: the redirect must pass the allowlist, and the client
 * is either the DCR id or a CIMD URL whose document lists the redirect.
 *
 * @returns {Promise<{ok: true, kind: "dcr"|"cimd"} | {ok: false, reason: string}>}
 */
export async function acceptClient({ clientId, redirectUri, now }) {
  if (typeof clientId !== "string" || !clientId) return { ok: false, reason: "client_id_missing" };
  if (typeof redirectUri !== "string" || !redirectUri) return { ok: false, reason: "redirect_uri_missing" };
  if (!isAllowedRedirectUri(redirectUri)) return { ok: false, reason: "redirect_uri_not_allowed" };
  if (clientId === DCR_CLIENT_ID) return { ok: true, kind: "dcr" };
  if (!isCimdClientId(clientId)) return { ok: false, reason: "client_id_unknown" };
  const fetched = await fetchClientMetadataDocument(clientId, { now });
  if (!fetched.ok) return fetched;
  if (!fetched.document.redirect_uris.includes(redirectUri)) return { ok: false, reason: "redirect_uri_not_in_metadata" };
  return { ok: true, kind: "cimd" };
}
