// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/local-oauth.js
// Replaces Docker mock-oauth2-server for local app authentication
// Handles: GET /oauth/authorize, POST /default/token

import { randomUUID } from "crypto";
import { storeAuthorizationCode, consumeAuthorizationCode } from "../state/store.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load mock-oauth2-config.json if available
function loadConfig() {
  try {
    const configPath = path.resolve(process.cwd(), "mock-oauth2-config.json");
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    // Default configuration matching mock-oauth2-server
    return {
      interactiveLogin: true,
      tokenCallbacks: [
        {
          issuerId: "default",
          tokenExpiry: 3600,
          requestMappings: [
            {
              requestParam: "code",
              match: ".*",
              claims: {
                sub: "user",
                email: "user@example.com",
                aud: ["debugger"],
                scope: "openid somescope",
                nonce: "5678",
                amr: ["mfa", "pwd"],
              },
            },
          ],
        },
      ],
    };
  }
}

/**
 * Create a simple unsigned JWT (alg: none)
 * The app uses decodeJwtNoVerify which doesn't verify signatures
 */
function createUnsignedJwt(payload) {
  const header = { alg: "none", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  // Unsigned JWT has empty signature
  return `${headerB64}.${payloadB64}.`;
}

/**
 * Generate interactive login HTML form
 */
function generateLoginForm(redirectUri, state, clientId, scope) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>HTTP Simulator - Mock Login</title>
  <style>
    body { font-family: sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; font-size: 1.5em; }
    input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #0066cc; color: white; border: none; cursor: pointer; font-size: 1em; }
    button:hover { background: #0055aa; }
    .info { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Mock OAuth2 Login</h1>
  <div class="info">
    <strong>HTTP Simulator</strong><br>
    This replaces the Docker mock-oauth2-server.
  </div>
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="redirect_uri" value="${redirectUri}">
    <input type="hidden" name="state" value="${state}">
    <input type="hidden" name="client_id" value="${clientId}">
    <input type="hidden" name="scope" value="${scope}">
    <input type="text" name="username" placeholder="Enter any user/subject" value="user" required autofocus>
    <textarea name="claims" rows="5" placeholder="Optional claims JSON">{"email": "user@example.com"}</textarea>
    <input type="submit" name="submit" value="Sign-in">
  </form>
</body>
</html>`;
}

export function apiEndpoint(app) {
  const config = loadConfig();

  // GET /oauth/authorize - Interactive login form
  // This matches the mock-oauth2-server's authorize endpoint
  app.get("/oauth/authorize", (req, res, next) => {
    const { response_type, client_id, redirect_uri, scope, state } = req.query;

    // Only handle local OAuth (client_id=debugger)
    // HMRC OAuth (client_id=uqMHA...) is handled by hmrc-oauth.js
    if (client_id !== "debugger") {
      return next(); // Let next handler process it
    }

    console.log(`[http-simulator:local-oauth] GET /oauth/authorize for client_id=${client_id}`);

    if (response_type !== "code") {
      return res.status(400).json({
        error: "unsupported_response_type",
        error_description: "Only response_type=code is supported",
      });
    }

    // Return interactive login form
    res.setHeader("Content-Type", "text/html");
    res.send(generateLoginForm(redirect_uri || "", state || "", client_id || "", scope || ""));
  });

  // POST /oauth/authorize - Process login form submission
  app.post("/oauth/authorize", (req, res, next) => {
    const { redirect_uri, state, client_id, username, claims } = req.body;

    // Only handle local OAuth (client_id=debugger)
    if (client_id !== "debugger") {
      return next(); // Let next handler process it
    }

    console.log(`[http-simulator:local-oauth] POST /oauth/authorize for username=${username}`);

    // Parse optional claims
    let parsedClaims = {};
    try {
      if (claims) {
        parsedClaims = JSON.parse(claims);
      }
    } catch {
      // Ignore invalid JSON
    }

    // Generate authorization code
    const code = randomUUID().replace(/-/g, "");

    // Store code with associated data
    storeAuthorizationCode(code, {
      clientId: client_id,
      redirectUri: redirect_uri,
      username: username || "user",
      claims: parsedClaims,
      state,
    });

    // Redirect to callback with code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    console.log(`[http-simulator:local-oauth] Redirecting to ${redirectUrl.toString()}`);
    res.redirect(302, redirectUrl.toString());
  });

  // POST /default/token - Token exchange
  // This matches the mock-oauth2-server's token endpoint
  app.post("/default/token", (req, res) => {
    const { grant_type, code, client_id, redirect_uri } = req.body;

    console.log(`[http-simulator:local-oauth] POST /default/token grant_type=${grant_type}`);

    if (grant_type !== "authorization_code" && grant_type !== "refresh_token") {
      return res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Only authorization_code and refresh_token are supported",
      });
    }

    // Get configuration
    const tokenCallback = config.tokenCallbacks?.[0] || {};
    const tokenExpiry = tokenCallback.tokenExpiry || 3600;
    const defaultClaims = tokenCallback.requestMappings?.[0]?.claims || {};

    // For authorization_code, consume the code
    let codeData = null;
    if (grant_type === "authorization_code") {
      codeData = consumeAuthorizationCode(code);
      if (!codeData) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired authorization code",
        });
      }
    }

    // Build token claims
    const now = Math.floor(Date.now() / 1000);
    const port = req.socket.localPort || 9000;
    const baseUrl = `http://localhost:${port}`;

    const claims = {
      ...defaultClaims,
      sub: codeData?.username || defaultClaims.sub || "user",
      email: codeData?.claims?.email || defaultClaims.email || "user@example.com",
      iss: `${baseUrl}/default`,
      aud: defaultClaims.aud || "debugger",
      iat: now,
      nbf: now,
      exp: now + tokenExpiry,
      jti: randomUUID(),
    };

    // Create tokens
    const accessToken = createUnsignedJwt(claims);
    const idToken = createUnsignedJwt(claims);

    // Return token response matching mock-oauth2-server format
    res.json({
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: tokenExpiry,
      scope: claims.scope || "openid somescope",
    });
  });

  // GET /default/debugger - Debugger page (optional, for compatibility)
  app.get("/default/debugger", (req, res) => {
    res.json({
      message: "HTTP Simulator OAuth2 Debugger",
      endpoints: {
        authorize: "/oauth/authorize",
        token: "/default/token",
      },
    });
  });

  // GET /.well-known/openid-configuration - OIDC discovery document
  app.get("/.well-known/openid-configuration", (req, res) => {
    const port = req.socket.localPort || 9000;
    const baseUrl = `http://localhost:${port}`;

    res.json({
      issuer: `${baseUrl}/default`,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/default/token`,
      jwks_uri: `${baseUrl}/default/jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["none"],
    });
  });
}
