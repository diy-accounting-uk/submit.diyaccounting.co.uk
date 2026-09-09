// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/companies-house-oauth.js
// Replaces the Companies House identity service for tests.
// Handles: GET /oauth2/authorise (permission page), POST /oauth2/authorise (grant), POST /oauth2/token
//
// Companies House shows one sign-in-and-permission screen, not HMRC's four-step journey, so this
// route is much smaller than hmrc-oauth.js. It registers after hmrc-oauth.js in server.js: HMRC
// uses the American spelling "authorize" and Companies House uses the British "authorise", so the
// two paths never collide on the same simulator port - that spelling difference is the only thing
// keeping them apart.

import { randomUUID } from "crypto";
import { storeAuthorizationCode, consumeAuthorizationCode } from "../state/store.js";

const COMMON_STYLES = `
    body { font-family: Arial, sans-serif; margin: 40px; background: #f8f8f8; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #0b0c0c; font-size: 24px; margin-bottom: 20px; }
    .info { background: #f0f4f5; padding: 15px; border-left: 4px solid #1d70b8; margin-bottom: 20px; }
    button[type="submit"], input[type="submit"] {
      background: #00703c; color: white; border: none; padding: 15px 30px;
      font-size: 18px; cursor: pointer; border-radius: 4px;
    }
    .scope-list { background: #fff; padding: 15px; border: 1px solid #b1b4b6; margin-bottom: 20px; }
    .scope-item { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .scope-item:last-child { border-bottom: none; }
    input[type="text"], input[type="password"] {
      width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box;
      border: 2px solid #0b0c0c; font-size: 16px;
    }
    label { display: block; font-weight: bold; margin-top: 15px; }
`;

/**
 * Generates the Companies House sign-in-and-permission page. Shows the requested scopes so a
 * behaviour test can assert the company number reached the scope, and asks for the company
 * authentication code the same way the real sign-in screen does when a requested scope names a
 * company.
 */
function generatePermissionPage(clientId, redirectUri, scope, state) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Sign in - Companies House Simulator</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="container">
    <h1>Sign in to Companies House</h1>
    <div class="info">
      <strong>HTTP Simulator</strong><br>
      This page simulates the Companies House identity service sign-in and permission screen.
    </div>
    <p>DIY Accounting Submit is requesting permission to:</p>
    <div class="scope-list">
      <div class="scope-item"><strong>Scope:</strong> ${scope || ""}</div>
    </div>
    <form method="POST" action="/oauth2/authorise">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state || ""}">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="scope" value="${scope || ""}">
      <label for="userId">Email address</label>
      <input type="text" id="userId" name="userId" required>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required>
      <label for="companyAuthCode">Company authentication code</label>
      <input type="text" id="companyAuthCode" name="companyAuthCode" required>
      <br><br>
      <input type="submit" id="givePermission" name="action" value="Continue">
    </form>
  </div>
</body>
</html>`;
}

function autoGrantRedirect(res, clientId, redirectUri, scope, state) {
  const code = randomUUID().replace(/-/g, "");

  storeAuthorizationCode(code, {
    type: "companies-house",
    clientId,
    redirectUri,
    scope,
    state,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  console.log(`[http-simulator:companies-house-oauth] Auto-granting, redirecting to ${redirectUrl.toString()}`);
  res.redirect(302, redirectUrl.toString());
}

export function apiEndpoint(app) {
  // GET /oauth2/authorise - Companies House sign-in and permission page
  // Use autoGrant=true query param to skip the sign-in form (for system tests)
  app.get("/oauth2/authorise", (req, res) => {
    const { response_type, client_id, redirect_uri, scope, state, autoGrant } = req.query;

    console.log(`[http-simulator:companies-house-oauth] GET /oauth2/authorise for client_id=${client_id}, autoGrant=${autoGrant}`);

    if (response_type !== "code") {
      return res.status(400).json({
        error: "unsupported_response_type",
        error_description: "Only response_type=code is supported",
      });
    }

    if (autoGrant === "true" || process.env.COMPANIES_HOUSE_AUTO_GRANT === "true") {
      return autoGrantRedirect(res, client_id, redirect_uri, scope, state);
    }

    const html = generatePermissionPage(client_id, redirect_uri, scope, state);
    res.type("text/html").send(html);
  });

  // POST /oauth2/authorise - Process the sign-in and permission form
  app.post("/oauth2/authorise", (req, res) => {
    const { redirect_uri, state, client_id, scope } = req.body;

    console.log(`[http-simulator:companies-house-oauth] POST /oauth2/authorise for client_id=${client_id}`);

    const code = randomUUID().replace(/-/g, "");
    storeAuthorizationCode(code, {
      type: "companies-house",
      clientId: client_id,
      redirectUri: redirect_uri,
      scope,
      state,
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    console.log(`[http-simulator:companies-house-oauth] Granting access, redirecting to ${redirectUrl.toString()}`);
    res.redirect(302, redirectUrl.toString());
  });

  // POST /oauth2/token - Companies House token exchange
  app.post("/oauth2/token", (req, res) => {
    const { grant_type, code, refresh_token } = req.body;

    console.log(`[http-simulator:companies-house-oauth] POST /oauth2/token grant_type=${grant_type}`);

    if (grant_type === "authorization_code") {
      const codeData = consumeAuthorizationCode(code);
      if (!codeData) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired authorization code",
        });
      }

      return res.json({
        access_token: `mock-companies-house-access-token-${randomUUID()}`,
        refresh_token: `mock-companies-house-refresh-token-${randomUUID()}`,
        expires_in: 3600,
        token_type: "Bearer",
        scope: codeData.scope || "",
      });
    }

    if (grant_type === "refresh_token") {
      if (!refresh_token) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Missing refresh_token",
        });
      }
      return res.json({
        access_token: `mock-companies-house-access-token-${randomUUID()}`,
        expires_in: 3600,
        token_type: "Bearer",
      });
    }

    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Supported grant types: authorization_code, refresh_token",
    });
  });
}
