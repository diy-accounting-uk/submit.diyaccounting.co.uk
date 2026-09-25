// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// auth.js -- the submission MCP's own stdio sign-in: authorization code with PKCE on a loopback
// redirect, the flow every CLI uses. signIn() opens the pool's hosted UI with a code challenge,
// catches the code on the first free port of the loopback listener's range (IdentityStack.java's
// mcpUserPoolClient, ports 49152 to 49159), exchanges it at the token endpoint, and keeps the
// refresh token under ~/.config/diya-submit/ mode 600. accessToken() hands out the cached id
// token, refreshing it silently (no browser) once it is close to expiry. Neither function stores
// an HMRC or Companies House credential; those are a
// different tool's own session state (submit-tools.js), never this one's.
//
// Configuration comes from the environment: DIYA_SUBMIT_AUTH_DOMAIN (the pool's hosted UI
// domain, e.g. https://ci-auth.diyaccounting.co.uk) and DIYA_SUBMIT_MCP_CLIENT_ID (the MCP's own
// app client, IdentityStack.java's mcpUserPoolClient).

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_PORT_FIRST = 49152;
const LOOPBACK_PORT_LAST = 49159;
const CALLBACK_PATH = "/callback";
const SCOPES = "email openid profile";

// Refresh this long before the cached id token's own expiry, so a call that starts just before
// it lapses does not race the clock.
const REFRESH_SKEW_MS = 60_000;

function authDomain() {
  const value = process.env.DIYA_SUBMIT_AUTH_DOMAIN;
  if (!value) throw new Error("DIYA_SUBMIT_AUTH_DOMAIN is not set");
  return value.replace(/\/$/, "");
}

function clientId() {
  const value = process.env.DIYA_SUBMIT_MCP_CLIENT_ID;
  if (!value) throw new Error("DIYA_SUBMIT_MCP_CLIENT_ID is not set");
  return value;
}

function baseUrl() {
  const value = process.env.DIYA_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

// Overridable for tests only; production never sets DIYA_SUBMIT_CONFIG_DIR and always keeps the
// credentials under the user's own config directory.
function credentialsDir() {
  return process.env.DIYA_SUBMIT_CONFIG_DIR || join(homedir(), ".config", "diya-submit");
}

function credentialsPath() {
  return join(credentialsDir(), "credentials.json");
}

function readCredentials() {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeCredentials(credentials) {
  const dir = credentialsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = credentialsPath();
  writeFileSync(path, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  // writeFileSync's mode is still subject to the process umask, so set it again explicitly: the
  // refresh token inside must never be group- or world-readable.
  chmodSync(dir, 0o700);
  chmodSync(path, 0o600);
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function newCodeVerifier() {
  return base64url(randomBytes(32));
}

function codeChallengeFor(verifier) {
  return base64url(createHash("sha256").update(verifier).digest());
}

// The command that opens a URL in the operator's default browser, one per platform: darwin's own
// opener, Windows' shell built-in (which needs an empty-title argument before the URL so `start`
// does not read the URL itself as a window title), and the freedesktop opener everywhere else.
const BROWSER_LAUNCH_COMMANDS = {
  darwin: (url) => ({ command: "open", args: [url] }),
  win32: (url) => ({ command: "cmd", args: ["/c", "start", '""', url] }),
};

function openInBrowser(url) {
  const forPlatform = BROWSER_LAUNCH_COMMANDS[process.platform] || ((u) => ({ command: "xdg-open", args: [u] }));
  const { command, args } = forPlatform(url);
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // The caller always prints the URL too; a launch failure (e.g. a headless machine) is not
    // fatal, the operator opens the printed link themselves.
  }
}

/**
 * Binds the first free port in the loopback range, starting from LOOPBACK_PORT_FIRST (or the port
 * passed in, for a retry). This listener answers exactly one request in its whole life, so
 * keep-alive only risks a socket a later signIn() on the same port could inherit stale; disabled
 * outright rather than reasoned about.
 * @returns {Promise<{server: import("node:http").Server, port: number}>}
 */
function bindLoopbackServer(port = LOOPBACK_PORT_FIRST) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.keepAliveTimeout = 0;
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE" && port < LOOPBACK_PORT_LAST) {
        resolve(bindLoopbackServer(port + 1));
      } else {
        reject(err);
      }
    });
    server.once("listening", () => resolve({ server, port }));
    server.listen(port, LOOPBACK_HOST);
  });
}

/**
 * The html response the loopback listener sends the browser once, whichever way the hosted UI's
 * callback answered.
 */
function respondToCallback(res, error) {
  res.writeHead(200, { "Content-Type": "text/html", "Connection": "close" });
  const message = error ? `Sign-in failed: ${error}. You can close this window.` : "Signed in. You can close this window.";
  res.end(`<p>${message}</p>`);
}

function settledCodeFrom({ error, code, state, expectedState }) {
  if (error) throw new Error(`The hosted UI reported an error: ${error}`);
  if (state !== expectedState) throw new Error("The hosted UI's callback state did not match; sign-in was refused");
  if (!code) throw new Error("The hosted UI's callback carried no authorization code");
  return code;
}

/**
 * Resolves once the hosted UI's callback request arrives on this server (or rejects on a state
 * mismatch or an error the hosted UI reports), then closes the server: it answers exactly one
 * request.
 * @param {import("node:http").Server} server
 * @param {number} port
 * @param {string} expectedState
 * @returns {Promise<string>}
 */
function waitForCallback(server, port, expectedState) {
  return new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url, `http://${LOOPBACK_HOST}:${port}`);
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      respondToCallback(res, error);
      server.close();
      try {
        resolve(settledCodeFrom({ error, code, state, expectedState }));
      } catch (settleError) {
        reject(settleError);
      }
    });
  });
}

/**
 * Binds the first free port in the loopback range and answers with the bound redirect URI plus a
 * function that waits for the hosted UI's callback request on that same server.
 * @returns {Promise<{redirectUri: string, waitForCode: (expectedState: string) => Promise<string>}>}
 */
async function startLoopbackServer() {
  const { server, port } = await bindLoopbackServer();
  const redirectUri = `http://${LOOPBACK_HOST}:${port}${CALLBACK_PATH}`;
  return { redirectUri, waitForCode: (expectedState) => waitForCallback(server, port, expectedState) };
}

async function requestToken(params) {
  const response = await fetch(`${authDomain()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error_description || body?.error || `The token endpoint answered HTTP ${response.status}`);
  }
  return body;
}

function storeTokens(tokens, previousRefreshToken) {
  const refreshToken = tokens.refresh_token || previousRefreshToken;
  // Cognito issues the id and access tokens together with the same lifetime, so one
  // expires_in covers both.
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  const credentials = {
    refreshToken,
    idToken: tokens.id_token,
    idTokenExpiresAt: expiresAt,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: expiresAt,
  };
  writeCredentials(credentials);
  return credentials;
}

/**
 * signIn: opens the pool's hosted UI in the operator's browser with a PKCE code challenge, waits
 * on the loopback listener for the authorization code, exchanges it, and stores the refresh token.
 * A no-argument, interactive, one-time step; accessToken() is what every other tool call uses
 * afterwards.
 * @returns {Promise<{signedIn: true}>}
 */
export async function signIn() {
  const verifier = newCodeVerifier();
  const challenge = codeChallengeFor(verifier);
  const state = base64url(randomBytes(16));

  const { redirectUri, waitForCode } = await startLoopbackServer();

  const authorizeUrl = new URL(`${authDomain()}/oauth2/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId());
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);

  console.error(`Opening the hosted UI to sign in. If it does not open, visit:\n${authorizeUrl.toString()}`);
  openInBrowser(authorizeUrl.toString());

  const code = await waitForCode(state);
  const tokens = await requestToken({
    grant_type: "authorization_code",
    client_id: clientId(),
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  storeTokens(tokens);
  return { signedIn: true };
}

/**
 * Reads the stored credentials, refreshing them (a silent, no-browser token-endpoint call)
 * whenever the requested token has less than REFRESH_SKEW_MS left, or none is cached yet.
 * @param {"idToken"|"accessToken"} tokenField
 * @param {"idTokenExpiresAt"|"accessTokenExpiresAt"} expiresAtField
 * @returns {Promise<string>}
 */
async function cachedOrRefreshed(tokenField, expiresAtField) {
  const credentials = readCredentials();
  if (!credentials?.refreshToken) {
    throw new Error("Not signed in to DIY Accounting Submit. Run signIn() first.");
  }
  if (credentials[tokenField] && credentials[expiresAtField] > Date.now() + REFRESH_SKEW_MS) {
    return credentials[tokenField];
  }
  const tokens = await requestToken({
    grant_type: "refresh_token",
    client_id: clientId(),
    refresh_token: credentials.refreshToken,
  });
  const updated = storeTokens(tokens, credentials.refreshToken);
  return updated[tokenField];
}

/**
 * idToken: the id token book-tools.js sends on for the cloud book routes (their native JWT
 * authoriser accepts either an access token's client_id or an id token's aud claim). Answers
 * the cached one while it still has more than REFRESH_SKEW_MS left, otherwise refreshes first.
 * @returns {Promise<string>}
 */
export async function idToken() {
  return cachedOrRefreshed("idToken", "idTokenExpiresAt");
}

/**
 * accessToken: the MCP's own Cognito access token, for the custom Lambda authoriser's
 * X-Authorization header (submit-tools.js's HMRC and Companies House calls) and for the plain
 * Authorization header the sign-out route's all-clients JWT authoriser reads. Answers the
 * cached one while it still has more than REFRESH_SKEW_MS left, otherwise refreshes first.
 * @returns {Promise<string>}
 */
export async function accessToken() {
  return cachedOrRefreshed("accessToken", "accessTokenExpiresAt");
}

/**
 * signOut: revokes the refresh token at Cognito, tells the authenticated sign-out route to
 * publish "logout" and delete the session item, then deletes the local credentials file.
 * Best-effort on the network calls -- a revoke or sign-out failure (offline, an already-expired
 * token) still leaves the local credentials gone, since the whole point is that this machine no
 * longer holds a usable session.
 * @returns {Promise<{signedOut: true}>}
 */
export async function signOut() {
  const credentials = readCredentials();

  if (credentials?.refreshToken) {
    try {
      await fetch(`${authDomain()}/oauth2/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: credentials.refreshToken, client_id: clientId() }).toString(),
      });
    } catch (error) {
      console.error(`Revoking the refresh token failed (continuing sign-out): ${error.message}`);
    }
  }

  if (credentials?.accessToken) {
    try {
      await fetch(`${baseUrl()}/api/v1/session/sign-out`, {
        method: "POST",
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
    } catch (error) {
      console.error(`Calling the sign-out route failed (continuing sign-out): ${error.message}`);
    }
  }

  const path = credentialsPath();
  if (existsSync(path)) unlinkSync(path);

  return { signedOut: true };
}
