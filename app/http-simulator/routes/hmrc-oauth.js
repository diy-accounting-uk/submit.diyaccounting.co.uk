// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/hmrc-oauth.js
// Replaces HMRC OAuth flow for tests
// Handles: GET /oauth/authorize (permission page), POST /oauth/authorize (multi-step grant), POST /oauth/token
// Implements the full multi-step HMRC OAuth flow:
// 1. Permission page with "Continue" button
// 2. Sign-in choice page with "Sign in to the HMRC online service" button
// 3. Credentials form with #userId and #password fields
// 4. Grant permission page with #givePermission button
// 5. Redirect back to callback with authorization code

import { randomUUID } from "crypto";
import { storeAuthorizationCode, consumeAuthorizationCode } from "../state/store.js";

// HMRC sandbox client ID
const HMRC_CLIENT_ID = "uqMHA6RsDGGa7h8EG2VqfqAmv4tV";

const COMMON_STYLES = `
    body { font-family: Arial, sans-serif; margin: 40px; background: #f8f8f8; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #0b0c0c; font-size: 24px; margin-bottom: 20px; }
    .info { background: #f0f4f5; padding: 15px; border-left: 4px solid #1d70b8; margin-bottom: 20px; }
    button[type="submit"], input[type="submit"] {
      background: #00703c; color: white; border: none; padding: 15px 30px;
      font-size: 18px; cursor: pointer; border-radius: 4px;
    }
    button[type="submit"]:hover, input[type="submit"]:hover { background: #005a30; }
    .cancel-link { display: inline-block; margin-left: 20px; color: #1d70b8; }
    input[type="text"], input[type="password"] {
      width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box;
      border: 2px solid #0b0c0c; font-size: 16px;
    }
    label { display: block; font-weight: bold; margin-top: 15px; }
`;

/**
 * Step 1: Generate the HMRC permission page HTML
 * This mimics the HMRC grant authorization page with "Continue" button
 */
function generatePermissionPage(clientId, redirectUri, scope, state) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Grant Authority - HMRC Simulator</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    ${COMMON_STYLES}
    #appNameParagraph { font-size: 18px; font-weight: bold; color: #0b0c0c; margin-bottom: 15px; }
    .scope-list { background: #fff; padding: 15px; border: 1px solid #b1b4b6; margin-bottom: 20px; }
    .scope-item { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .scope-item:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Grant Authority</h1>
    <div class="info">
      <strong>HTTP Simulator</strong><br>
      This page simulates the HMRC OAuth grant authorization flow.
    </div>
    <p id="appNameParagraph">DIY Accounting Submit</p>
    <p>is requesting permission to access your VAT information.</p>
    <div class="scope-list">
      <div class="scope-item"><strong>Scope:</strong> ${scope || "read:vat write:vat"}</div>
      <div class="scope-item">Submit VAT returns on your behalf</div>
      <div class="scope-item">View your VAT obligations</div>
    </div>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state || ""}">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="scope" value="${scope || ""}">
      <input type="hidden" name="step" value="sign-in-choice">
      <button type="submit" name="action" value="continue">Continue</button>
      <a href="${redirectUri}?error=access_denied&error_description=User+denied+access" class="cancel-link">Cancel</a>
    </form>
  </div>
</body>
</html>`;
}

/**
 * Step 2: Generate the sign-in choice page
 * Shows "Sign in to the HMRC online service" button
 */
function generateSignInChoicePage(clientId, redirectUri, scope, state) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Sign in - HMRC Simulator</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>Sign in</h1>
    <div class="info">
      <strong>HTTP Simulator</strong><br>
      This page simulates the HMRC sign-in choice page.
    </div>
    <p>You need to sign in to continue.</p>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state || ""}">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="scope" value="${scope || ""}">
      <input type="hidden" name="step" value="credentials">
      <button type="submit" name="action" value="sign-in">Sign in to the HMRC online service</button>
    </form>
  </div>
</body>
</html>`;
}

/**
 * Step 3: Generate the credentials form page
 * Shows #userId and #password fields
 */
function generateCredentialsPage(clientId, redirectUri, scope, state) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Enter your credentials - HMRC Simulator</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>Enter your credentials</h1>
    <div class="info">
      <strong>HTTP Simulator</strong><br>
      This page simulates the HMRC credentials form.
    </div>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state || ""}">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="scope" value="${scope || ""}">
      <input type="hidden" name="step" value="grant-permission">
      <label for="userId">User ID</label>
      <input type="text" id="userId" name="userId" required>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required>
      <br><br>
      <button type="submit" name="action" value="sign-in">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

/**
 * Step 4: Generate the grant permission page
 * Shows #givePermission button
 */
function generateGrantPermissionPage(clientId, redirectUri, scope, state) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Grant permission - HMRC Simulator</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>Grant permission</h1>
    <div class="info">
      <strong>HTTP Simulator</strong><br>
      This page simulates the HMRC grant permission page.
    </div>
    <p>DIY Accounting Submit is requesting permission to:</p>
    <ul>
      <li>View your VAT information</li>
      <li>Submit VAT returns on your behalf</li>
    </ul>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state || ""}">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="scope" value="${scope || ""}">
      <input type="hidden" name="step" value="complete">
      <input type="submit" id="givePermission" name="action" value="Grant permission">
    </form>
  </div>
</body>
</html>`;
}

/**
 * Auto-grant helper for system tests
 * Generates code and redirects immediately without multi-step flow
 */
function autoGrantRedirect(res, clientId, redirectUri, scope, state) {
  const code = randomUUID().replace(/-/g, "");

  storeAuthorizationCode(code, {
    type: "hmrc",
    clientId: clientId,
    redirectUri: redirectUri,
    scope: scope,
    state,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  console.log(`[http-simulator:hmrc-oauth] Auto-granting, redirecting to ${redirectUrl.toString()}`);
  res.redirect(302, redirectUrl.toString());
}

export function apiEndpoint(app) {
  // GET /oauth/authorize - Show permission page for HMRC OAuth
  // This shows a grant authorization page like HMRC does
  // Use autoGrant=true query param to skip multi-step flow (for system tests)
  app.get("/oauth/authorize", (req, res, next) => {
    const { response_type, client_id, redirect_uri, scope, state, autoGrant } = req.query;

    // Only handle HMRC OAuth (client_id starts with uqMHA or is HMRC-like)
    // Local OAuth (client_id=debugger) is handled by local-oauth.js
    if (client_id === "debugger") {
      return next();
    }

    console.log(`[http-simulator:hmrc-oauth] GET /oauth/authorize for client_id=${client_id}, autoGrant=${autoGrant}`);

    if (response_type !== "code") {
      return res.status(400).json({
        error: "unsupported_response_type",
        error_description: "Only response_type=code is supported",
      });
    }

    // Auto-grant mode - skip multi-step flow.
    // Triggered by ?autoGrant=true query param (system tests) or HMRC_AUTO_GRANT env var (simulator journeys).
    if (autoGrant === "true" || process.env.HMRC_AUTO_GRANT === "true") {
      return autoGrantRedirect(res, client_id, redirect_uri, scope, state);
    }

    // Show permission page instead of auto-granting
    const html = generatePermissionPage(client_id, redirect_uri, scope, state);
    res.type("text/html").send(html);
  });

  // POST /oauth/authorize - Process HMRC grant authorization (multi-step)
  app.post("/oauth/authorize", (req, res, next) => {
    const { redirect_uri, state, client_id, scope, step } = req.body;

    // Only handle HMRC OAuth (not debugger client)
    if (client_id === "debugger") {
      return next();
    }

    console.log(`[http-simulator:hmrc-oauth] POST /oauth/authorize for client_id=${client_id}, step=${step}`);

    // Multi-step flow based on step parameter
    switch (step) {
      case "sign-in-choice":
        // Step 1 complete -> Show step 2: Sign-in choice page
        console.log(`[http-simulator:hmrc-oauth] Showing sign-in choice page`);
        return res.type("text/html").send(generateSignInChoicePage(client_id, redirect_uri, scope, state));

      case "credentials":
        // Step 2 complete -> Show step 3: Credentials form
        console.log(`[http-simulator:hmrc-oauth] Showing credentials page`);
        return res.type("text/html").send(generateCredentialsPage(client_id, redirect_uri, scope, state));

      case "grant-permission":
        // Step 3 complete -> Show step 4: Grant permission page
        console.log(`[http-simulator:hmrc-oauth] Showing grant permission page`);
        return res.type("text/html").send(generateGrantPermissionPage(client_id, redirect_uri, scope, state));

      case "complete":
        // Step 4 complete -> Generate code and redirect
        console.log(`[http-simulator:hmrc-oauth] Grant permission complete, generating code`);
        break;

      default:
        // Legacy flow or first step - show sign-in choice (for backwards compatibility)
        console.log(`[http-simulator:hmrc-oauth] Unknown step '${step}', showing sign-in choice page`);
        return res.type("text/html").send(generateSignInChoicePage(client_id, redirect_uri, scope, state));
    }

    // Generate authorization code for HMRC OAuth
    const code = randomUUID().replace(/-/g, "");

    // Store code with associated data
    storeAuthorizationCode(code, {
      type: "hmrc",
      clientId: client_id,
      redirectUri: redirect_uri,
      scope: scope,
      state,
    });

    // Redirect to callback with code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    console.log(`[http-simulator:hmrc-oauth] Granting access, redirecting to ${redirectUrl.toString()}`);
    res.redirect(302, redirectUrl.toString());
  });

  // POST /oauth/token - HMRC token exchange
  app.post("/oauth/token", (req, res) => {
    const { grant_type, code, client_id, client_secret, redirect_uri, refresh_token } = req.body;

    console.log(`[http-simulator:hmrc-oauth] POST /oauth/token grant_type=${grant_type}`);

    if (grant_type === "authorization_code") {
      // Consume the authorization code
      const codeData = consumeAuthorizationCode(code);
      if (!codeData) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired authorization code",
        });
      }

      // Generate mock HMRC tokens
      const accessToken = `mock-hmrc-access-token-${randomUUID()}`;
      const refreshToken = `mock-hmrc-refresh-token-${randomUUID()}`;

      return res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 14400,
        scope: codeData.scope || "write:vat read:vat",
        token_type: "bearer",
      });
    }

    if (grant_type === "refresh_token") {
      // Generate new tokens for refresh
      const accessToken = `mock-hmrc-access-token-${randomUUID()}`;
      const newRefreshToken = `mock-hmrc-refresh-token-${randomUUID()}`;

      return res.json({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: 14400,
        scope: "write:vat read:vat",
        token_type: "bearer",
      });
    }

    if (grant_type === "client_credentials") {
      // Client credentials flow (used for create-test-user API)
      const accessToken = `mock-hmrc-client-token-${randomUUID()}`;

      return res.json({
        access_token: accessToken,
        expires_in: 14400,
        scope: "write:vat read:vat",
        token_type: "bearer",
      });
    }

    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Supported grant types: authorization_code, refresh_token, client_credentials",
    });
  });
}
