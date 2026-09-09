<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

> Archived 2026-09-07. Superseded by `PLAN_SUBMISSION_MCP.md`, which keeps the thin-client idea over the REST API and replaces the paste-a-code sign-in with OAuth against the Cognito pool.

# Plan: MCP Server for DIY Accounting Submit

## Source Documents

- `_developers/backlog/MCP Server Implementation Guide for DIY Accounting _ Claude.mhtml`
- `_developers/backlog/European VAT reform and API requirements 2026-2027 _ Claude.mhtml`

## Review Notes

### Review of MCP Server Implementation Guide

The guide was produced by Claude Desktop without full repository access. While the overall architecture is sound, several corrections and improvements are needed:

**What the guide gets right:**
- Core principle of reusing existing functionality via a thin layer
- MCP protocol over stdio with Docker container packaging
- Tool schema definitions for VAT operations
- Session management pattern

**What needs correcting:**
1. **Handler imports are wrong.** The guide references `handler` as the export name, but the actual codebase uses `ingestHandler` (see `app/functions/hmrc/hmrcVatReturnPost.js:222`, `app/functions/hmrc/hmrcVatObligationGet.js:124`, etc.)
2. **File naming is wrong.** The guide references `submit-hmrc-vat-return-post.js` but actual files use camelCase: `hmrcVatReturnPost.js`, `hmrcVatObligationGet.js`, `hmrcReceiptGet.js`, `bundleGet.js`
3. **Separate Dockerfile proposed.** The guide creates `mcp-server/Dockerfile` but the user wants a single Dockerfile. The existing `Dockerfile` already packages the `app/` directory and can be extended with an MCP build target.
4. **Session storage abstraction is over-engineered.** `BrowserStorage.js` adds no value. The MCP server only needs in-memory state (stdio) or DynamoDB-backed state (hosted).
5. **Direct Lambda handler invocation is wrong.** The guide proposes importing Lambda handlers directly via `mcpToLambdaAdaptor.js`. The correct approach is to make the MCP server a **thin HTTP client** that calls the existing deployed REST API. This keeps secrets (HMRC `client_secret` via Secrets Manager), configuration, and DynamoDB access behind the existing API layer.
6. **Auth flow needs adjustment.** The guide proposes direct Cognito OIDC. The actual codebase has two separate OAuth flows: Cognito/Google for user identity and HMRC OAuth for VAT API access. Both require browser interaction. The MCP server must orchestrate these flows by generating auth URLs and exchanging codes via the existing API endpoints.
7. **Async handlers not properly addressed.** VAT return submission uses SQS async pattern via `workerHandler`. The MCP server doesn't need to handle this - the existing API already handles the async polling pattern (HTTP 202 with polling). The MCP client replicates the same polling pattern as `api-client.js:executeAsyncRequestPolling`.
8. **Token usage/pricing is aspirational.** The bundle system exists but there's no per-call token metering. The MCP plan should focus on the bundle entitlement check, not a token counter.

### Review of European VAT Reform Document

This is a research conversation establishing the strategic context:

**Key takeaways for the plan:**
- ViDA (VAT in the Digital Age) creates demand for e-invoicing APIs across the EU
- Peppol is the delivery network; EN 16931 is the format standard
- Netherlands (B2G already mandatory, B2B considering) and Belgium (B2B mandatory Jan 2026) are initial targets
- The MCP server is positioned as a foundation for future EU expansion

**Integration with MCP plan:**
- Tool naming should use namespaces (e.g., `hmrc_*` prefix) to leave room for `peppol_*` or `vida_*` tools later
- Session state should support multiple provider tokens (HMRC sandbox, HMRC production, future Peppol)

---

## Design Principles

1. **Thin client**: The MCP server makes HTTP requests to the existing deployed REST API. It does NOT import Lambda handlers, access DynamoDB, or use AWS SDK.
2. **Secrets stay behind APIs**: HMRC `client_secret` is fetched from Secrets Manager by `hmrcTokenPost.js` server-side. The MCP server never sees it.
3. **Configuration from deployment**: The MCP server fetches client-side configuration from `/submit.env` on startup, just like the web client does. Only the API base URL is required as an environment variable.
4. **Session state mirrors browser**: In-memory Map replicates `localStorage` (Cognito tokens) and `sessionStorage` (HMRC tokens, submission state).
5. **Browser-based auth**: Both Cognito/Google login and HMRC OAuth require the user to visit a URL in their browser. The MCP server orchestrates the flow but does not handle credentials directly.
6. **Two hosting models**: Docker stdio for local use (Claude Desktop/Code), Hosted HTTP for remote clients.

---

## Architecture

### High-Level Design

```
MCP Client (Claude Desktop / Claude Code / any MCP client)
    |
    |  Model 1: stdio (Docker)     Model 2: Streamable HTTP (deployed)
    |  ========================    ====================================
    |  MCP Protocol over stdin/    MCP Protocol over HTTPS
    |  stdout (Docker container)   (Lambda + Function URL)
    |                              |
    +----------+-------------------+
               |
        mcp/server.js                <-- MCP protocol handler
        mcp/api-client.js            <-- HTTP client for REST API
        mcp/session.js               <-- Session state (in-memory or DynamoDB)
        mcp/auth.js                  <-- Auth URL generation, code exchange
        mcp/tools/*.js               <-- Tool definitions
               |
               | HTTPS (fetch)
               v
        Existing Deployed API
        https://{env}-submit.diyaccounting.co.uk/api/v1/*
               |
               +-- /api/v1/cognito/token     (Cognito code exchange, refresh)
               +-- /api/v1/hmrc/token        (HMRC code exchange, holds client_secret)
               +-- /api/v1/hmrc/vat/obligation  (VAT obligations)
               +-- /api/v1/hmrc/vat/return      (VAT return submit/retrieve)
               +-- /api/v1/hmrc/receipt         (Submission receipts)
               +-- /api/v1/bundle               (Bundle entitlements)
               +-- /submit.env                  (Client configuration)
```

### What Gets Built vs Reused

**REUSE (existing deployed API, no modifications except redirect_uri support):**
- `POST /api/v1/cognito/token` - Cognito auth code exchange and token refresh
- `POST /api/v1/hmrc/token` - HMRC auth code exchange (server-side, holds `client_secret`)
- `GET /api/v1/hmrc/vat/obligation` - VAT obligations retrieval
- `POST /api/v1/hmrc/vat/return` - VAT return submission (async with polling)
- `GET /api/v1/hmrc/vat/return` - VAT return retrieval
- `GET /api/v1/hmrc/receipt` - Receipt retrieval
- `GET /api/v1/bundle` - Bundle/entitlement check
- `GET /submit.env` - Client-side environment configuration

**SMALL API MODIFICATION (required for MCP auth flow):**
- `app/functions/auth/cognitoTokenPost.js` - Accept optional `redirect_uri` in request body (currently hardcoded to `loginWithCognitoCallback.html`, MCP needs `mcpCallback.html`)
- `app/functions/hmrc/hmrcTokenPost.js` - Accept optional `redirect_uri` in request body (currently hardcoded to `submitVatCallback.html`, MCP needs `mcpCallback.html`)

**NEW (to be created):**
- `mcp/server.js` - MCP server entry point (stdio + HTTP transport)
- `mcp/api-client.js` - HTTP client wrapping `fetch()` for the deployed API
- `mcp/session.js` - Session state management
- `mcp/auth.js` - Auth URL generation and code exchange
- `mcp/tools/*.js` - MCP tool definitions
- `web/public/auth/mcpCallback.html` - Static page that displays auth code for user to copy
- Dockerfile `mcp` target
- `.env.mcp` - MCP environment configuration

---

## Hosting Model 1: Docker stdio (Local)

### How It Works

The MCP server runs as a Docker container on the user's machine. Claude Desktop or Claude Code spawns it as a subprocess, communicating via stdin/stdout using the MCP stdio transport.

```
Claude Desktop/Code  <--stdio-->  Docker Container (mcp server)  --HTTPS-->  Deployed API
```

### Session State

In-memory `Map`. Single user, single session. State is lost when the container exits.

### Authentication Flow

Since the MCP server runs locally inside Docker and cannot receive HTTP callbacks, it uses a **manual code exchange** flow:

**Step 1: Cognito/Google Login**
1. User invokes the `auth_login` tool (or Claude recognises auth is needed and calls it)
2. MCP server generates the Cognito hosted UI authorization URL:
   - Uses config from `/submit.env` (fetched on startup)
   - Sets `redirect_uri` to `https://{base}/auth/mcpCallback.html`
   - Generates random `state` parameter for CSRF protection
3. MCP server returns the URL to Claude with instructions: _"Please visit this URL in your browser to sign in"_
4. User visits URL, authenticates with Google (or email/password)
5. Browser redirects to `https://{base}/auth/mcpCallback.html?code=AUTH_CODE&state=STATE`
6. The `mcpCallback.html` page displays the authorization code for the user to copy
7. User provides the code to Claude (e.g., "the code is abc123")
8. Claude calls the `auth_cognito_callback` tool with the code
9. MCP server exchanges the code via `POST /api/v1/cognito/token` (passing `redirect_uri` in the request body so the server-side handler uses the correct callback URL)
10. MCP server stores Cognito tokens in session state

**Step 2: HMRC OAuth** (when HMRC operations are needed)
1. User invokes an HMRC tool (e.g., `hmrc_get_obligations`)
2. MCP server checks session - no HMRC access token
3. MCP server generates the HMRC authorization URL:
   - Uses `HMRC_BASE_URI` or `HMRC_SANDBOX_BASE_URI` from config
   - Sets `redirect_uri` to `https://{base}/auth/mcpCallback.html`
   - Sets `scope` to `read:vat` (or `write:vat read:vat` for submissions)
4. Returns URL to Claude: _"HMRC authorization required. Please visit this URL"_
5. User visits URL, authenticates with HMRC Government Gateway
6. Browser redirects to `mcpCallback.html?code=HMRC_CODE&state=STATE`
7. User provides the code to Claude
8. Claude calls `auth_hmrc_callback` tool with the code
9. MCP server exchanges via `POST /api/v1/hmrc/token` (which holds the `client_secret` server-side)
10. MCP server stores HMRC access token in session state
11. MCP server retries the original HMRC operation

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "diy-accounting": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "DIY_SUBMIT_API_BASE_URL=https://submit.diyaccounting.co.uk",
        "ghcr.io/antonycc/diy-accounting-mcp:latest"
      ]
    }
  }
}
```

### Claude Code Configuration

```json
{
  "mcpServers": {
    "diy-accounting": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "DIY_SUBMIT_API_BASE_URL=https://submit.diyaccounting.co.uk",
        "ghcr.io/antonycc/diy-accounting-mcp:latest"
      ]
    }
  }
}
```

Or with npx (no Docker):
```json
{
  "mcpServers": {
    "diy-accounting": {
      "command": "npx",
      "args": ["-y", "@diy-accounting/mcp-server"],
      "env": {
        "DIY_SUBMIT_API_BASE_URL": "https://submit.diyaccounting.co.uk"
      }
    }
  }
}
```

---

## Hosting Model 2: Hosted HTTP (Remote)

### How It Works

The MCP server is deployed as a Lambda function with a Function URL, served via CloudFront. MCP clients connect over HTTPS using the Streamable HTTP transport.

```
Any MCP Client  --HTTPS/SSE-->  CloudFront --> Lambda Function URL --> MCP Server  --HTTPS-->  Deployed API
```

This follows the same pattern as the simulator (`SimulatorStack.java`): Lambda + Function URL + CloudFront + Route53.

### Session State

DynamoDB table (`{env}-mcp-sessions`). Each MCP session gets a unique session ID. Tokens and state are persisted between requests. Sessions expire via TTL.

### Authentication Flow

The hosted MCP server has its own callback endpoint, so the flow is smoother:

**Step 1: Cognito/Google Login**
1. MCP client calls `auth_login` tool
2. MCP server generates Cognito hosted UI URL with `redirect_uri` pointing to the MCP server's own callback path: `https://mcp.submit.diyaccounting.co.uk/auth/callback?provider=cognito&session={sessionId}`
3. Returns URL to the MCP client
4. User visits URL in browser, authenticates
5. Browser redirects to MCP server callback endpoint
6. MCP server exchanges code via `POST /api/v1/cognito/token`
7. Stores tokens in DynamoDB session
8. Shows user a "You can close this tab" page
9. Next MCP tool call finds the session authenticated

**Step 2: HMRC OAuth** (same pattern)
1. MCP server generates HMRC auth URL with redirect to MCP callback
2. User authenticates with HMRC in browser
3. Browser redirects to MCP callback, code exchanged via API
4. HMRC token stored in session

### MCP Server URL

```
https://mcp.submit.diyaccounting.co.uk/mcp
```

### CDK Stack

New `McpStack.java` following the `SimulatorStack.java` pattern:
- Lambda function running `mcp/server.js` with Lambda Web Adapter
- Function URL (BUFFERED mode)
- CloudFront distribution
- Route53 record: `mcp.submit.diyaccounting.co.uk`
- DynamoDB table for session state

### Client Configuration

```json
{
  "mcpServers": {
    "diy-accounting": {
      "url": "https://mcp.submit.diyaccounting.co.uk/mcp",
      "transport": "streamable-http"
    }
  }
}
```

---

## Implementation

### 1. API Client (`mcp/api-client.js`)

HTTP client that calls the deployed REST API. Mirrors the web client's `api-client.js` (`web/public/lib/services/api-client.js`) patterns: `X-Authorization` header for Cognito, `Authorization` header for HMRC, async polling for 202 responses.

```javascript
// mcp/api-client.js
const DEFAULT_POLL_INTERVAL_MS = 2000;
const MAX_POLL_TIME_MS = 120_000;

export class ApiClient {
  constructor(baseUrl, session) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.session = session;
  }

  // Fetch environment config from deployed website (mirrors web client's submit.env)
  async fetchConfig() {
    const response = await fetch(`${this.baseUrl}/submit.env`);
    const text = await response.text();
    const config = {};
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match) config[match[1]] = match[2];
    }
    return config;
  }

  // Authorized request with Cognito access token (mirrors authorizedFetch)
  async authorizedFetch(path, options = {}) {
    const cognitoAccessToken = this.session.get("cognitoAccessToken");
    if (!cognitoAccessToken) {
      throw new AuthRequiredError("cognito", "Cognito login required");
    }

    const headers = {
      "Content-Type": "application/json",
      "X-Authorization": `Bearer ${cognitoAccessToken}`,
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    // Handle 401 - try token refresh
    if (response.status === 401) {
      const refreshed = await this.refreshCognitoToken();
      if (refreshed) {
        headers["X-Authorization"] = `Bearer ${this.session.get("cognitoAccessToken")}`;
        return fetch(`${this.baseUrl}${path}`, { ...options, headers });
      }
      throw new AuthRequiredError("cognito", "Session expired, re-login required");
    }

    // Handle 202 - async polling (mirrors executeAsyncRequestPolling)
    if (response.status === 202) {
      return this.pollForCompletion(path, options, headers);
    }

    return response;
  }

  // HMRC-authenticated request (mirrors submitVat.html pattern)
  async hmrcFetch(path, options = {}) {
    const hmrcAccessToken = this.session.get("hmrcAccessToken");
    if (!hmrcAccessToken) {
      throw new AuthRequiredError("hmrc", "HMRC authorization required");
    }

    const hmrcAccount = this.session.get("hmrcAccount") || "live";
    const fraudHeaders = this.collectFraudPreventionHeaders();
    return this.authorizedFetch(path, {
      ...options,
      headers: {
        ...fraudHeaders,
        ...options.headers,
        Authorization: `Bearer ${hmrcAccessToken}`,
        hmrcAccount,
      },
    });
  }

  // Collect fraud prevention headers available in Node.js environment
  // Browser-specific headers (Screens, Window-Size) are omitted - buildFraudHeaders.js handles this
  collectFraudPreventionHeaders() {
    const headers = {};
    const offset = -new Date().getTimezoneOffset();
    const hrs = Math.floor(Math.abs(offset) / 60);
    const mins = Math.abs(offset) % 60;
    const sign = offset >= 0 ? "+" : "-";
    headers["Gov-Client-Timezone"] =
      `UTC${sign}${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    if (!this.session.get("deviceId")) this.session.set("deviceId", crypto.randomUUID());
    headers["Gov-Client-Device-ID"] = this.session.get("deviceId");
    const userInfo = this.session.get("userInfo");
    if (userInfo) {
      const { sub } = JSON.parse(userInfo);
      headers["Gov-Client-User-IDs"] = `mcp=${encodeURIComponent(sub)}`;
    }
    const mfa = this.session.get("mfaMetadata");
    if (mfa) headers["Gov-Client-Multi-Factor"] = mfa;
    headers["Gov-Client-Browser-JS-User-Agent"] = "diy-accounting-mcp/1.0.0";
    return headers;
  }

  // Token refresh via existing API (mirrors auth-service.js:ensureSession)
  async refreshCognitoToken() {
    const refreshToken = this.session.get("cognitoRefreshToken");
    if (!refreshToken) return false;

    const response = await fetch(`${this.baseUrl}/api/v1/cognito/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });

    if (!response.ok) return false;

    const tokens = await response.json();
    this.session.set("cognitoAccessToken", tokens.accessToken);
    this.session.set("cognitoIdToken", tokens.idToken);
    if (tokens.refreshToken) this.session.set("cognitoRefreshToken", tokens.refreshToken);
    return true;
  }

  // Async request polling (mirrors api-client.js:executeAsyncRequestPolling)
  async pollForCompletion(path, options, headers) {
    const startTime = Date.now();
    let interval = DEFAULT_POLL_INTERVAL_MS;

    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
      if (response.status !== 202) return response;
      interval = Math.min(interval * 1.5, 8000);
    }

    throw new Error(`Request timed out after ${MAX_POLL_TIME_MS / 1000}s`);
  }
}

export class AuthRequiredError extends Error {
  constructor(provider, message) {
    super(message);
    this.provider = provider; // "cognito" or "hmrc"
  }
}
```

### 2. Session State (`mcp/session.js`)

Mirrors browser `localStorage` / `sessionStorage` patterns.

```javascript
// mcp/session.js

// In-memory session for stdio model
export class MemorySession {
  constructor() {
    this.store = new Map();
  }
  get(key) { return this.store.get(key) ?? null; }
  set(key, value) { this.store.set(key, value); }
  delete(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
  isAuthenticated() { return !!this.get("cognitoAccessToken"); }
  hasHmrcToken() { return !!this.get("hmrcAccessToken"); }
}

// DynamoDB-backed session for hosted model
export class DynamoSession {
  constructor(tableName, sessionId) {
    this.tableName = tableName;
    this.sessionId = sessionId;
    this.cache = new Map(); // Local cache, flushed to DynamoDB
  }
  // ... DynamoDB get/set operations via AWS SDK
  // TTL-based expiry for session cleanup
}
```

**Session keys** (matching browser storage):

| Key | Source | Purpose |
|-----|--------|---------|
| `cognitoAccessToken` | `localStorage` | Cognito access token for API auth |
| `cognitoIdToken` | `localStorage` | Cognito ID token (user identity) |
| `cognitoRefreshToken` | `localStorage` | Token refresh grant |
| `userInfo` | `localStorage` | User metadata (sub, email, name) |
| `hmrcAccessToken` | `sessionStorage` | HMRC access token (short-lived) |
| `hmrcAccount` | `sessionStorage` | `"sandbox"` or `"live"` |
| `mfaMetadata` | `sessionStorage` | MFA metadata if available |

### 3. Auth Flow (`mcp/auth.js`)

Generates OAuth authorization URLs and exchanges codes via the existing API.

```javascript
// mcp/auth.js

export class AuthHelper {
  constructor(apiClient, session, config) {
    this.apiClient = apiClient;
    this.session = session;
    this.config = config; // From /submit.env
  }

  // Generate Cognito hosted UI URL (mirrors auth-url-builder.js:buildCognitoAuthUrl)
  getCognitoLoginUrl() {
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    this.session.set("cognito_oauth_state", state);
    this.session.set("cognito_oauth_nonce", nonce);

    const baseUrl = this.config.DIY_SUBMIT_BASE_URL.replace(/\/$/, "");
    const redirectUri = `${baseUrl}/auth/mcpCallback.html`;
    this.session.set("cognito_redirect_uri", redirectUri);

    return (
      `${this.config.COGNITO_BASE_URI.replace(/\/$/, "")}/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(this.config.COGNITO_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("openid profile email")}` +
      `&state=${encodeURIComponent(state)}` +
      `&nonce=${encodeURIComponent(nonce)}`
    );
  }

  // Exchange Cognito auth code via existing API
  async exchangeCognitoCode(code) {
    const redirectUri = this.session.get("cognito_redirect_uri");

    const response = await fetch(
      `${this.apiClient.baseUrl}/api/v1/cognito/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri, // Must match the URL used in authorization request
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Cognito token exchange failed: ${error.message || response.status}`);
    }

    const tokens = await response.json();
    this.session.set("cognitoAccessToken", tokens.accessToken);
    this.session.set("cognitoIdToken", tokens.idToken);
    this.session.set("cognitoRefreshToken", tokens.refreshToken);

    // Decode ID token for user info (no verification needed - API already validated)
    const payload = JSON.parse(atob(tokens.idToken.split(".")[1]));
    this.session.set("userInfo", JSON.stringify({
      sub: payload.sub,
      email: payload.email,
      given_name: payload.given_name,
      family_name: payload.family_name,
    }));

    return { authenticated: true, email: payload.email };
  }

  // Generate HMRC OAuth URL (mirrors auth-url-builder.js:buildHmrcAuthUrl)
  getHmrcLoginUrl(account = "live", scope = "read:vat write:vat") {
    const state = crypto.randomUUID();
    this.session.set("hmrc_oauth_state", state);
    this.session.set("hmrcAccount", account);

    const sandbox = account.toLowerCase() === "sandbox";
    const base = sandbox ? this.config.HMRC_SANDBOX_BASE_URI : this.config.HMRC_BASE_URI;
    const clientId = sandbox ? this.config.HMRC_SANDBOX_CLIENT_ID : this.config.HMRC_CLIENT_ID;

    const baseUrl = this.config.DIY_SUBMIT_BASE_URL.replace(/\/$/, "");
    const redirectUri = `${baseUrl}/auth/mcpCallback.html`;
    this.session.set("hmrc_redirect_uri", redirectUri);

    return (
      `${base.replace(/\/$/, "")}/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`
    );
  }

  // Exchange HMRC auth code via existing API (server-side holds client_secret)
  async exchangeHmrcCode(code) {
    const redirectUri = this.session.get("hmrc_redirect_uri");
    const hmrcAccount = this.session.get("hmrcAccount") || "live";
    const idToken = this.session.get("cognitoIdToken");

    const response = await fetch(
      `${this.apiClient.baseUrl}/api/v1/hmrc/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          hmrcAccount,
          // ID token for audit trail (mirrors submitVatCallback.html)
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`HMRC token exchange failed: ${error.message || response.status}`);
    }

    const tokens = await response.json();
    this.session.set("hmrcAccessToken", tokens.accessToken);

    return { authenticated: true, account: hmrcAccount };
  }
}
```

### 4. MCP Tool Definitions (`mcp/tools/`)

Tools use `hmrc_` prefix to leave namespace room for future `peppol_*` or `vida_*` tools. Auth tools use `auth_` prefix.

```javascript
// mcp/tools/index.js
export { authLoginTool } from "./authLogin.js";
export { authCognitoCallbackTool } from "./authCognitoCallback.js";
export { authHmrcCallbackTool } from "./authHmrcCallback.js";
export { authStatusTool } from "./authStatus.js";
export { hmrcGetObligationsTool } from "./hmrcGetObligations.js";
export { hmrcSubmitVatReturnTool } from "./hmrcSubmitVatReturn.js";
export { hmrcGetVatReturnTool } from "./hmrcGetVatReturn.js";
export { hmrcGetReceiptsTool } from "./hmrcGetReceipts.js";
export { accountGetBundlesTool } from "./accountGetBundles.js";
```

**Auth tools:**

```javascript
// mcp/tools/authLogin.js
export const authLoginTool = {
  name: "auth_login",
  description:
    "Start authentication. Returns a URL the user must visit in their browser to sign in " +
    "with Google or email/password. After signing in, the user will see an authorization code " +
    "to provide back via auth_cognito_callback.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};
```

```javascript
// mcp/tools/authCognitoCallback.js
export const authCognitoCallbackTool = {
  name: "auth_cognito_callback",
  description:
    "Complete Cognito/Google authentication by providing the authorization code " +
    "from the browser callback page.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Authorization code from the callback page" },
    },
    required: ["code"],
  },
};
```

```javascript
// mcp/tools/authHmrcCallback.js
export const authHmrcCallbackTool = {
  name: "auth_hmrc_callback",
  description:
    "Complete HMRC authentication by providing the authorization code " +
    "from the browser callback page. Required before using HMRC VAT tools.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Authorization code from the HMRC callback page" },
    },
    required: ["code"],
  },
};
```

```javascript
// mcp/tools/authStatus.js
export const authStatusTool = {
  name: "auth_status",
  description: "Check current authentication status. Shows whether Cognito and HMRC tokens are present.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};
```

**HMRC tools:**

```javascript
// mcp/tools/hmrcGetObligations.js
export const hmrcGetObligationsTool = {
  name: "hmrc_get_obligations",
  description:
    "Retrieve VAT obligations from HMRC. Returns periods with status (O=Open, F=Fulfilled). " +
    "Requires HMRC authorization - if not authenticated, will return an auth URL to visit.",
  inputSchema: {
    type: "object",
    properties: {
      vrn: { type: "string", description: "VAT Registration Number" },
      from: { type: "string", description: "Start date YYYY-MM-DD" },
      to: { type: "string", description: "End date YYYY-MM-DD" },
      status: { type: "string", enum: ["O", "F"], description: "Filter by status" },
      hmrcAccount: { type: "string", enum: ["sandbox", "live"], description: "HMRC environment (default: live)" },
    },
    required: ["vrn", "from", "to"],
  },
};
```

```javascript
// mcp/tools/hmrcSubmitVatReturn.js
export const hmrcSubmitVatReturnTool = {
  name: "hmrc_submit_vat_return",
  description:
    "Submit a VAT return to HMRC. This is an async operation - the server will poll until " +
    "the submission completes. Requires HMRC authorization with write:vat scope. " +
    "IMPORTANT: Before calling this tool, you MUST display the following legal declaration " +
    "to the user and obtain their explicit confirmation: 'When you submit this VAT " +
    "information you are making a legal declaration that the information is true and " +
    "complete. A false declaration can result in prosecution.' Set declaration_confirmed " +
    "to true only after the user has explicitly confirmed.",
  inputSchema: {
    type: "object",
    properties: {
      declaration_confirmed: {
        type: "boolean",
        description: "Must be true. Confirms the user has seen and accepted the legal declaration.",
      },
      vrn: { type: "string", description: "VAT Registration Number" },
      periodKey: { type: "string", description: "VAT period key from obligations" },
      vatDueSales: { type: "number", minimum: 0 },
      vatDueAcquisitions: { type: "number", minimum: 0 },
      totalVatDue: { type: "number", minimum: 0 },
      vatReclaimedCurrPeriod: { type: "number", minimum: 0 },
      netVatDue: { type: "number", minimum: 0 },
      totalValueSalesExVAT: { type: "integer", minimum: 0 },
      totalValuePurchasesExVAT: { type: "integer", minimum: 0 },
      totalValueGoodsSuppliedExVAT: { type: "integer", minimum: 0 },
      totalAcquisitionsExVAT: { type: "integer", minimum: 0 },
      finalised: { type: "boolean", default: true },
      hmrcAccount: { type: "string", enum: ["sandbox", "live"], description: "HMRC environment (default: live)" },
    },
    required: [
      "declaration_confirmed", "vrn", "periodKey", "vatDueSales", "vatDueAcquisitions",
      "totalVatDue", "vatReclaimedCurrPeriod", "netVatDue", "totalValueSalesExVAT",
      "totalValuePurchasesExVAT", "totalValueGoodsSuppliedExVAT", "totalAcquisitionsExVAT",
    ],
  },
};
```

```javascript
// mcp/tools/hmrcGetVatReturn.js
export const hmrcGetVatReturnTool = {
  name: "hmrc_get_vat_return",
  description: "Retrieve a previously submitted VAT return from HMRC.",
  inputSchema: {
    type: "object",
    properties: {
      vrn: { type: "string", description: "VAT Registration Number" },
      periodKey: { type: "string", description: "VAT period key" },
      hmrcAccount: { type: "string", enum: ["sandbox", "live"], description: "HMRC environment (default: live)" },
    },
    required: ["vrn", "periodKey"],
  },
};
```

```javascript
// mcp/tools/hmrcGetReceipts.js
export const hmrcGetReceiptsTool = {
  name: "hmrc_get_receipts",
  description: "Retrieve submission receipts for a VRN.",
  inputSchema: {
    type: "object",
    properties: {
      vrn: { type: "string", description: "VAT Registration Number" },
      hmrcAccount: { type: "string", enum: ["sandbox", "live"], description: "HMRC environment (default: live)" },
    },
    required: ["vrn"],
  },
};
```

```javascript
// mcp/tools/accountGetBundles.js
export const accountGetBundlesTool = {
  name: "account_get_bundles",
  description: "Check the user's bundle entitlements (service access/credits).",
  inputSchema: {
    type: "object",
    properties: {},
  },
};
```

### 5. MCP Server Entry Point (`mcp/server.js`)

```javascript
// mcp/server.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApiClient, AuthRequiredError } from "./api-client.js";
import { MemorySession } from "./session.js";
import { AuthHelper } from "./auth.js";
import * as tools from "./tools/index.js";

const API_BASE_URL = process.env.DIY_SUBMIT_API_BASE_URL || "https://submit.diyaccounting.co.uk";

const session = new MemorySession();
const apiClient = new ApiClient(API_BASE_URL, session);
let authHelper;

// Tool name -> handler function
const TOOL_HANDLERS = {
  // Auth tools
  auth_login: async () => {
    const url = authHelper.getCognitoLoginUrl();
    return { url, message: "Visit this URL in your browser to sign in. After authenticating, you will see an authorization code. Provide that code using the auth_cognito_callback tool." };
  },

  auth_cognito_callback: async ({ code }) => {
    return authHelper.exchangeCognitoCode(code);
  },

  auth_hmrc_callback: async ({ code }) => {
    return authHelper.exchangeHmrcCode(code);
  },

  auth_status: async () => {
    return {
      cognitoAuthenticated: session.isAuthenticated(),
      hmrcAuthenticated: session.hasHmrcToken(),
      hmrcAccount: session.get("hmrcAccount"),
      userEmail: session.get("userInfo") ? JSON.parse(session.get("userInfo")).email : null,
    };
  },

  // HMRC tools - call deployed API via HTTP
  hmrc_get_obligations: async (params) => {
    if (params.hmrcAccount) session.set("hmrcAccount", params.hmrcAccount);
    const query = new URLSearchParams({ vrn: params.vrn, from: params.from, to: params.to });
    if (params.status) query.set("status", params.status);
    const response = await apiClient.hmrcFetch(`/api/v1/hmrc/vat/obligation?${query}`);
    return response.json();
  },

  hmrc_submit_vat_return: async (params) => {
    // HMRC Q10 compliance: enforce legal declaration before submission
    if (!params.declaration_confirmed) {
      return {
        error: "declaration_required",
        declaration_text: "When you submit this VAT information you are making a legal " +
          "declaration that the information is true and complete. A false declaration " +
          "can result in prosecution.",
        message: "The user must explicitly confirm this declaration before submission. " +
          "Call this tool again with declaration_confirmed: true after obtaining confirmation.",
      };
    }
    if (params.hmrcAccount) session.set("hmrcAccount", params.hmrcAccount);
    const { vrn, hmrcAccount, declaration_confirmed, ...vatData } = params;
    const response = await apiClient.hmrcFetch("/api/v1/hmrc/vat/return", {
      method: "POST",
      body: JSON.stringify({ vrn, ...vatData, accessToken: session.get("hmrcAccessToken") }),
    });
    return response.json();
  },

  hmrc_get_vat_return: async (params) => {
    if (params.hmrcAccount) session.set("hmrcAccount", params.hmrcAccount);
    const query = new URLSearchParams({ vrn: params.vrn, periodKey: params.periodKey });
    const response = await apiClient.hmrcFetch(`/api/v1/hmrc/vat/return?${query}`);
    return response.json();
  },

  hmrc_get_receipts: async (params) => {
    if (params.hmrcAccount) session.set("hmrcAccount", params.hmrcAccount);
    const query = new URLSearchParams({ vrn: params.vrn });
    const response = await apiClient.hmrcFetch(`/api/v1/hmrc/receipt?${query}`);
    return response.json();
  },

  account_get_bundles: async () => {
    const response = await apiClient.authorizedFetch("/api/v1/bundle");
    return response.json();
  },
};

const allTools = Object.values(tools);

const server = new Server(
  { name: "diy-accounting-submit", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler("tools/list", async () => ({
  tools: allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: params } = request.params;
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }

  try {
    const result = await handler(params || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    // If auth is required, return the auth URL instead of an error
    if (error instanceof AuthRequiredError) {
      if (error.provider === "cognito") {
        const url = authHelper.getCognitoLoginUrl();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "authentication_required",
              provider: "cognito",
              url,
              message: "Visit this URL to sign in, then provide the code via auth_cognito_callback",
            }, null, 2),
          }],
          isError: true,
        };
      }
      if (error.provider === "hmrc") {
        const account = session.get("hmrcAccount") || "live";
        const url = authHelper.getHmrcLoginUrl(account);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "authentication_required",
              provider: "hmrc",
              url,
              message: "Visit this URL to authorize HMRC access, then provide the code via auth_hmrc_callback",
            }, null, 2),
          }],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  // Fetch config from deployed website on startup
  const config = await apiClient.fetchConfig();
  authHelper = new AuthHelper(apiClient, session, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr (stdout is reserved for MCP protocol)
  process.stderr.write("MCP server started\n");
}

main().catch((error) => {
  process.stderr.write(`MCP server startup error: ${error.message}\n`);
  process.exit(1);
});
```

### 6. MCP Callback Page (`web/public/auth/mcpCallback.html`)

Static page that displays the authorization code for the user to copy. Does NOT auto-exchange the code (unlike `loginWithCognitoCallback.html`).

```html
<!-- web/public/auth/mcpCallback.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Authorization Code - DIY Accounting</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 80px auto; padding: 0 20px; text-align: center; }
    .code-box { background: #f5f5f5; border: 2px solid #333; border-radius: 8px; padding: 20px; margin: 20px 0; font-family: monospace; font-size: 1.2em; word-break: break-all; user-select: all; cursor: pointer; }
    .instructions { color: #666; margin: 20px 0; }
    .copied { color: #28a745; font-weight: bold; display: none; }
    .error { color: #dc3545; }
  </style>
</head>
<body>
  <h1>Authorization Complete</h1>
  <div id="success">
    <p class="instructions">Copy this code and provide it to Claude:</p>
    <div class="code-box" id="codeBox" onclick="copyCode()"></div>
    <p class="copied" id="copiedMsg">Copied to clipboard!</p>
    <p class="instructions">You can close this tab after copying the code.</p>
  </div>
  <div id="error" style="display:none">
    <p class="error" id="errorMsg"></p>
  </div>
  <script>
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      document.getElementById("success").style.display = "none";
      document.getElementById("error").style.display = "block";
      document.getElementById("errorMsg").textContent = `Authentication failed: ${error}`;
    } else if (code) {
      document.getElementById("codeBox").textContent = code;
    } else {
      document.getElementById("success").style.display = "none";
      document.getElementById("error").style.display = "block";
      document.getElementById("errorMsg").textContent = "No authorization code found.";
    }

    function copyCode() {
      navigator.clipboard.writeText(code).then(() => {
        document.getElementById("copiedMsg").style.display = "block";
      });
    }
  </script>
</body>
</html>
```

### 7. Required API Modifications

Two small changes to existing Lambda handlers to support MCP's `redirect_uri`:

**`app/functions/auth/cognitoTokenPost.js`** - Accept optional `redirect_uri` in request body:
```javascript
// In exchangeCodeForToken():
// Current (line 95):
const redirectUri = `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithCognitoCallback.html`;

// Changed to:
const redirectUri = body.redirect_uri
  || `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}auth/loginWithCognitoCallback.html`;
```

**`app/functions/hmrc/hmrcTokenPost.js`** - Accept optional `redirect_uri` in request body:
```javascript
// In the token exchange (line 132):
// Current:
redirect_uri: `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`,

// Changed to:
redirect_uri: body.redirect_uri
  || `${process.env.DIY_SUBMIT_BASE_URL}${maybeSlash}activities/submitVatCallback.html`,
```

**Cognito User Pool Client** - Register `mcpCallback.html` as allowed callback URL:
- Add `https://submit.diyaccounting.co.uk/auth/mcpCallback.html` to Cognito User Pool Client's allowed callback URLs
- Add `https://submit.diyaccounting.co.uk/auth/mcpCallback.html` for production

**HMRC Application** - Register `mcpCallback.html` as allowed redirect URI:
- Add the MCP callback URL to the HMRC Developer Hub application's redirect URIs

### 8. Single Dockerfile (extend existing)

```dockerfile
# === Lambda target (existing, unchanged) ===
FROM public.ecr.aws/lambda/nodejs:22 AS builder
COPY package.json package-lock.json ./
COPY web/public/submit.catalogue.toml web/public/submit.catalogue.toml
RUN npm ci --omit=dev --ignore-scripts

FROM public.ecr.aws/lambda/nodejs:22 AS lambda
COPY --from=builder /var/task/node_modules ./node_modules
COPY --from=builder /var/task/package.json ./package.json
COPY --from=builder /var/task/web/public/submit.catalogue.toml ./web/public/submit.catalogue.toml
COPY app/lib app/lib
COPY app/functions app/functions
COPY app/data app/data
COPY app/services app/services

# === MCP server target (NEW - thin HTTP client, no app/ code needed) ===
FROM node:22-slim AS mcp
WORKDIR /mcp
COPY mcp/package.json mcp/package-lock.json ./
RUN npm ci --omit=dev
COPY mcp/ ./
# stdio: the entrypoint reads from stdin and writes to stdout
ENTRYPOINT ["node", "server.js"]
```

The `mcp/` directory has its own `package.json` with minimal dependencies:

```json
{
  "name": "@diy-accounting/mcp-server",
  "version": "1.0.0",
  "type": "module",
  "description": "MCP server for DIY Accounting Submit - UK VAT MTD via Claude",
  "main": "server.js",
  "bin": { "diy-accounting-mcp": "server.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

Build commands:
```bash
# Lambda (existing)
docker build --target lambda -t submit-lambda .

# MCP server (new)
docker build --target mcp -t diy-accounting-mcp .
```

### 9. Environment Configuration (`.env.mcp`)

The MCP server needs only one environment variable. All other configuration is fetched at startup from the deployed website's `/submit.env` endpoint.

```bash
# .env.mcp
DIY_SUBMIT_API_BASE_URL=https://submit.diyaccounting.co.uk
```

For production:
```bash
DIY_SUBMIT_API_BASE_URL=https://submit.diyaccounting.co.uk
```

### 10. npm Scripts

```json
{
  "start:mcp": "node mcp/server.js",
  "test:mcp": "vitest run mcp/",
  "docker:build:mcp": "docker build --target mcp -t diy-accounting-mcp .",
  "docker:run:mcp": "docker run -i --rm -e DIY_SUBMIT_API_BASE_URL=https://submit.diyaccounting.co.uk diy-accounting-mcp"
}
```

---

## Testing Strategy

### Unit Tests (`mcp/tests/`)

| Test File | Scope |
|-----------|-------|
| `api-client.test.js` | HTTP client, header construction, polling, token refresh |
| `auth.test.js` | URL generation, code exchange, session state updates |
| `session.test.js` | MemorySession get/set/clear |
| `tools/*.test.js` | Tool schema validation |

### Integration Tests (`mcp/tests/integration/`)

| Test File | Scope |
|-----------|-------|
| `server.test.js` | Full MCP tool call flow with mocked HTTP responses |
| `auth-flow.test.js` | Login → callback → authenticated request chain |
| `error-handling.test.js` | Auth required errors, 401 refresh, 403 bundle check |

### npm Commands

```bash
npm run test:mcp              # All MCP tests
npm test                      # Existing tests (must still pass)
```

---

## Rollout Strategy

### Phase 1: Foundation
- Create `mcp/` directory with `api-client.js`, `session.js`, `auth.js`, `server.js`
- Create MCP tool definition files in `mcp/tools/`
- Create `web/public/auth/mcpCallback.html`
- Apply `redirect_uri` changes to `cognitoTokenPost.js` and `hmrcTokenPost.js`
- Add `mcp` target to `Dockerfile`
- Create `mcp/package.json` with MCP SDK dependency
- Add npm scripts
- Create unit tests
- Verify all existing tests still pass

### Phase 2: Auth Registration & Local Testing
- Register `mcpCallback.html` as allowed callback URL in Cognito User Pool Client
- Register MCP callback URL with HMRC Developer Hub application
- Test stdio model locally with Claude Desktop against HMRC sandbox
- Create integration tests
- Test token refresh and re-authentication flows

### Phase 3: Docker Publishing
- Add GitHub Actions workflow to build and publish MCP Docker image to GitHub Packages
- Add MCP tests to existing test workflow
- Publish to `ghcr.io/antonycc/diy-accounting-mcp`
- Update `web/public/mcp/index.html` with setup instructions

### Phase 4: Hosted HTTP Model
- Create `McpStack.java` CDK stack (Lambda + Function URL + CloudFront)
- Implement `DynamoSession` for persistent session state
- Add Streamable HTTP transport alongside stdio
- Add auth callback HTTP endpoints for hosted model
- Deploy to `mcp.submit.diyaccounting.co.uk`

### Phase 5: Alpha Testing
- Test with 3-5 technical users against HMRC sandbox
- Iterate on error messages and tool descriptions
- Test both stdio and hosted HTTP models

### Phase 6: Public Launch
- Publish Docker image to GitHub Packages (public)
- Optionally publish to npm as `@diy-accounting/mcp-server`
- Update MCP page with setup instructions for both hosting models
- Marketing: "File UK VAT returns via Claude - the first HMRC MTD service with MCP integration"

---

## Future: EU ViDA / Peppol Extension

The MCP tool namespace (`hmrc_*`) is designed to accommodate future tools:

| Namespace | Purpose | Timeline |
|-----------|---------|----------|
| `hmrc_*` | UK VAT MTD operations | Now |
| `peppol_*` | Peppol e-invoicing (NL, BE) | 2027+ |
| `vida_*` | EU ViDA digital reporting | 2030+ |

Future providers would follow the same thin-client pattern: MCP tools that call deployed REST APIs. Each provider would have its own OAuth flow (if applicable) and session tokens.

---

## HMRC Compliance & Approval Strategy

### Position: No Separate Approval Required

The MCP server is an additional user interface to the already-approved web application. All HMRC-facing operations (API calls, fraud prevention headers, OAuth token exchange, audit logging) are handled by the same approved backend infrastructure. The MCP server adds zero new HMRC API integration.

### Requirement-by-Requirement Analysis

#### Fraud Prevention Headers (Spec v3.3)

**Connection Method**: Remains `WEB_APP_VIA_SERVER`. The MCP server is a web service client calling the existing REST API, which calls HMRC. From HMRC's perspective, requests originate from the same approved server with the same `Gov-Vendor-Product-Name` and `Gov-Vendor-Version`.

**Header reuse**: `buildFraudHeaders.js` (unchanged) constructs all vendor headers server-side. Client headers are passed through if present, skipped if absent. The MCP client sends headers it can collect:

| Header | Browser (current) | MCP Client | Strategy |
|---|---|---|---|
| `Gov-Client-Connection-Method` | N/A (set server-side) | N/A (set server-side) | Same: `WEB_APP_VIA_SERVER` |
| `Gov-Client-User-IDs` | `browser={sub}` | `mcp={sub}` | Same user from same Cognito pool |
| `Gov-Client-Device-ID` | `crypto.randomUUID()` | `crypto.randomUUID()` | Same approach |
| `Gov-Client-Timezone` | JS `Intl` API | Node.js `Intl` API | Same approach |
| `Gov-Client-Public-IP` | WebRTC/services | X-Forwarded-For (server) | Server extracts from request |
| `Gov-Client-Multi-Factor` | Session MFA metadata | Session MFA metadata (from Cognito `amr` claim) | Same source |
| `Gov-Client-Screens` | `window.screen` | Not available | Omitted (optional for `WEB_APP_VIA_SERVER`) |
| `Gov-Client-Window-Size` | `window.innerWidth/Height` | Not available | Omitted (optional) |
| `Gov-Client-Browser-JS-User-Agent` | `navigator.userAgent` | MCP server version string | Different but valid |
| `Gov-Vendor-*` headers | Built server-side | Built server-side | Identical |

`buildFraudHeaders.js` already handles missing optional headers gracefully. No code changes required.

**MCP client header collection** (`mcp/api-client.js`):

```javascript
function collectFraudPreventionHeaders(session) {
  const headers = {};

  // Timezone - Node.js Intl API (same approach as browser)
  const offset = -new Date().getTimezoneOffset();
  const hrs = Math.floor(Math.abs(offset) / 60);
  const mins = Math.abs(offset) % 60;
  const sign = offset >= 0 ? "+" : "-";
  headers["Gov-Client-Timezone"] =
    `UTC${sign}${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;

  // Device ID - persistent per session
  if (!session.get("deviceId")) session.set("deviceId", crypto.randomUUID());
  headers["Gov-Client-Device-ID"] = session.get("deviceId");

  // User IDs - from Cognito auth
  const userInfo = session.get("userInfo");
  if (userInfo) {
    const { sub } = JSON.parse(userInfo);
    headers["Gov-Client-User-IDs"] = `mcp=${encodeURIComponent(sub)}`;
  }

  // MFA metadata if available (from Cognito token amr claim)
  const mfa = session.get("mfaMetadata");
  if (mfa) headers["Gov-Client-Multi-Factor"] = mfa;

  // Browser-specific headers NOT sent (not applicable to MCP):
  // Gov-Client-Screens, Gov-Client-Window-Size
  // buildFraudHeaders.js handles missing headers gracefully

  // User agent - identify as MCP client
  headers["Gov-Client-Browser-JS-User-Agent"] = `diy-accounting-mcp/1.0.0`;

  return headers;
}
```

#### Legal Declaration (Q10) - Enforced at Two Levels

**Level 1 - Tool description** instructs the AI to present HMRC's exact declaration text and obtain confirmation:

```javascript
description:
  "Submit a VAT return to HMRC. IMPORTANT: Before calling this tool, you MUST " +
  "display the following legal declaration to the user and obtain their explicit " +
  "confirmation: 'When you submit this VAT information you are making a legal " +
  "declaration that the information is true and complete. A false declaration " +
  "can result in prosecution.' Set declaration_confirmed to true only after " +
  "the user has explicitly confirmed."
```

**Level 2 - Server-side validation** rejects submissions without confirmation:

```javascript
if (!params.declaration_confirmed) {
  return {
    error: "declaration_required",
    declaration_text: "When you submit this VAT information you are making a legal " +
      "declaration that the information is true and complete. A false declaration " +
      "can result in prosecution.",
    message: "The user must confirm this declaration before submission.",
  };
}
```

This cannot be bypassed. Even if an AI client ignores the tool description, the server rejects the call.

**Example chatbot UX** (compliant submission flow):

```
User: "Submit my Q2 VAT return: sales VAT £2,400, reclaimed £800,
       sales ex-VAT £12,000, purchases ex-VAT £4,000"

Claude:
  VAT Return for 1 Apr 2025 - 30 Jun 2025
  ─────────────────────────────────────────
  Box 1 - VAT due on sales:              £2,400.00
  Box 2 - VAT due on acquisitions:           £0.00
  Box 3 - Total VAT due:                 £2,400.00
  Box 4 - VAT reclaimed:                   £800.00
  Box 5 - Net VAT due:                   £1,600.00
  Box 6 - Total sales ex-VAT:             £12,000
  Box 7 - Total purchases ex-VAT:          £4,000
  Box 8 - Total goods supplied ex-VAT:          £0
  Box 9 - Total acquisitions ex-VAT:            £0

  LEGAL DECLARATION:
  When you submit this VAT information you are making a legal
  declaration that the information is true and complete. A false
  declaration can result in prosecution.

  Do you confirm this declaration and wish to submit?

User: "Yes, I confirm"

Claude: [calls hmrc_submit_vat_return with declaration_confirmed: true]

  VAT Return Submitted Successfully
  Processing Date: 2025-08-01T14:22:55Z
  Form Bundle Number: 470659706727
```

#### Period Key Visibility (Q9) - Same as Web

The MCP tool receives period keys from the obligations API and uses them internally. The user sees human-readable dates. The tool description uses `periodKey` as a parameter name, but the AI assistant will populate it from the obligations response - the user never sees or types period key codes.

#### Accessibility (Q16) - WCAG Scope

WCAG 2.1 Level AA applies to "web content" (per W3C definition). The MCP protocol is machine-to-machine communication, not web content. The user interface is provided by the MCP client (Claude Desktop/Code), which has its own accessibility features:
- Screen reader support
- Keyboard navigation
- High-contrast text output
- Configurable font sizes

The one piece of web content introduced by MCP (`auth/mcpCallback.html`) meets WCAG AA with semantic HTML, high-contrast styling, keyboard-accessible copy button, and screen-reader-compatible instructions.

#### Box 5 / Boxes 6-9 Validation (Q7, Q8) - Server-Side

Validation is enforced by the existing API handlers. The MCP tool schema also enforces it:
- Box 5: `minimum: 0` in JSON schema
- Boxes 6-9: `type: "integer"` in JSON schema

Both client-side (schema) and server-side (handler validation) enforcement.

#### GDPR / Data Protection (Q15) - Same Infrastructure

- Same Cognito user pool (same identity)
- Same DynamoDB audit trail
- Same 7-year receipt retention
- Same HMRC token handling (server-side, Secrets Manager)
- No additional PII collected by MCP server

### Summary Statement for HMRC

> DIY Accounting Submit's MCP server is an additional user interface to our already-approved web application (connection method: WEB_APP_VIA_SERVER). It is architecturally equivalent to a mobile app calling our existing API - all HMRC-facing operations (API calls, fraud prevention headers, OAuth token exchange, audit logging) are handled by the same approved backend infrastructure. The MCP server introduces zero new HMRC API calls. The legal declaration is enforced server-side and cannot be bypassed. All fraud prevention headers are constructed by the same `buildFraudHeaders.js` code that was validated during our approval process. We consider this to be a new client interface to the same recognised software, not a separate software product.

---

## Security Considerations

1. **HMRC `client_secret` never leaves the API backend.** The MCP server sends the auth code to `/api/v1/hmrc/token`, which exchanges it server-side using Secrets Manager.
2. **Cognito client is public.** The `COGNITO_CLIENT_ID` is a public client ID (same as what the browser uses). No secret is needed.
3. **HMRC client IDs are public.** They are used in the browser-visible authorization URL.
4. **Auth codes are one-time-use.** The `mcpCallback.html` page displays but does not exchange the code, avoiding race conditions.
5. **State parameters prevent CSRF.** Both Cognito and HMRC auth flows use random state parameters validated on callback.
6. **No AWS credentials in MCP container.** The MCP server is a pure HTTP client. No AWS SDK, no IAM roles, no Secrets Manager access.
7. **Token refresh uses existing API.** The `cognitoTokenPost.js` handler handles refresh token grants without needing the client secret (public Cognito client).
8. **`redirect_uri` validation.** The `redirect_uri` parameter in the token exchange must match one of the pre-registered callback URLs in Cognito and HMRC. The API handlers should validate it against an allowlist.

---

## Implementation Checklist

### MCP Server (new code)
- [ ] Create `mcp/package.json` with `@modelcontextprotocol/sdk` dependency
- [ ] Create `mcp/server.js` - MCP server entry point
- [ ] Create `mcp/api-client.js` - HTTP client for deployed API
- [ ] Create `mcp/session.js` - Session state (MemorySession)
- [ ] Create `mcp/auth.js` - Auth URL generation and code exchange
- [ ] Create `mcp/tools/authLogin.js`
- [ ] Create `mcp/tools/authCognitoCallback.js`
- [ ] Create `mcp/tools/authHmrcCallback.js`
- [ ] Create `mcp/tools/authStatus.js`
- [ ] Create `mcp/tools/hmrcGetObligations.js`
- [ ] Create `mcp/tools/hmrcSubmitVatReturn.js`
- [ ] Create `mcp/tools/hmrcGetVatReturn.js`
- [ ] Create `mcp/tools/hmrcGetReceipts.js`
- [ ] Create `mcp/tools/accountGetBundles.js`
- [ ] Create `mcp/tools/index.js`
- [ ] Create unit tests in `mcp/tests/`
- [ ] Create integration tests in `mcp/tests/integration/`

### Web/API modifications
- [ ] Create `web/public/auth/mcpCallback.html`
- [ ] Modify `app/functions/auth/cognitoTokenPost.js` - accept `redirect_uri` in body
- [ ] Modify `app/functions/hmrc/hmrcTokenPost.js` - accept `redirect_uri` in body
- [ ] Add `redirect_uri` allowlist validation in both handlers

### Infrastructure
- [ ] Add `mcp` target to `Dockerfile`
- [ ] Create `.env.mcp`
- [ ] Add npm scripts: `start:mcp`, `test:mcp`, `docker:build:mcp`, `docker:run:mcp`
- [ ] Register `mcpCallback.html` in Cognito User Pool Client callback URLs
- [ ] Register MCP callback URL with HMRC Developer Hub

### CI/CD
- [ ] Add GitHub Actions workflow to build and publish MCP Docker image
- [ ] Add MCP tests to existing test workflow

### Hosted HTTP model (Phase 4)
- [ ] Create `McpStack.java` CDK stack
- [ ] Implement `DynamoSession` with DynamoDB
- [ ] Add Streamable HTTP transport to `server.js`
- [ ] Add auth callback HTTP endpoints
- [ ] Deploy to `mcp.submit.diyaccounting.co.uk`

### Documentation
- [ ] Update `web/public/mcp/index.html` with setup instructions
- [ ] Verify all existing tests still pass (`npm test`, `./mvnw clean verify`)
