<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Production Hardening Implementation Plan

## Overview

This plan covers two major changes for public launch:
1. **Mock OAuth Removal**: Ensure mock-oauth2-server is not accessible in AWS environments (ci, prod)
2. **CloudFront Error Pages**: Custom error pages with proper layout, auth status, and API exclusion

---

## Part 1: Mock OAuth Removal

### Current State Analysis

| Component | File | Current Behavior | Risk Level |
|-----------|------|------------------|------------|
| Login button | `web/public/auth/login.html:52-61` | Hardcoded mock button visible | HIGH |
| Mock callback page | `web/public/auth/loginWithMockCallback.html` | Deployed to S3 | MEDIUM |
| Mock login JS | `web/public/auth/login.html:134-159` | Always included | HIGH |
| Express mock routes | `app/bin/server.js:126-127` | Always registered | LOW (local only) |
| S3 deployment | `PublishStack.java` whitelist includes `/auth/*` | Deploys all auth files | MEDIUM |

### Security Assessment

**Already Secure:**
- JWT authorizer (`customAuthorizer.js`) uses `CognitoJwtVerifier` - rejects unsigned mock tokens
- Mock API routes (`/api/v1/mock/*`) are Express-only, not in API Gateway CDK
- `TEST_AUTH_PROVIDER` is not exposed via `/submit.env`

**Needs Remediation:**
- Mock login button visible to customers
- Mock callback page deployed to S3
- Links to mock auth flow in production HTML

---

### Implementation Tasks

#### Task 1.1: Extract Mock Login Button to Addon File

**Create:** `web/public/auth/login-mock-addon.js`
```javascript
// Mock OAuth login addon - only loaded in proxy/simulator environments
(function() {
  'use strict';

  const container = document.getElementById('mock-auth-container');
  if (!container) return;

  // Inject the mock login button
  container.innerHTML = `
    <button id="loginWithMockOAuth2" class="login-button mock-button">
      <img src="https://raw.githubusercontent.com/navikt/mock-oauth2-server/refs/heads/master/docs/img/logo.svg"
           alt="Mock OAuth2 Server Logo"
           class="provider-logo">
      Continue with mock-oauth2-server
    </button>
  `;

  // Add click handler
  document.getElementById('loginWithMockOAuth2').addEventListener('click', loginWithMockOAuth2);

  async function loginWithMockOAuth2() {
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem("authState", state);

    try {
      const response = await fetch(`/api/v1/mock/authUrl?state=${state}`);
      if (!response.ok) {
        throw new Error(`Failed to get auth URL: ${response.status}`);
      }
      const authResponse = await response.json();
      window.location.href = authResponse.authUrl;
    } catch (error) {
      console.error('Mock OAuth2 login failed:', error);
      alert('Mock OAuth2 server not available. Ensure npm run auth or npm run simulator is running.');
    }
  }
})();
```

#### Task 1.2: Modify Login Page for Production

**Edit:** `web/public/auth/login.html`

1. **Remove** mock button HTML (lines 52-61)
2. **Replace with** placeholder container:
```html
<!-- Mock auth button injected by login-mock-addon.js in dev environments only -->
<div id="mock-auth-container"></div>
```
3. **Remove** mock login JavaScript function (lines 134-159)
4. **Add** script include before closing `</body>`:
```html
<script src="./login-mock-addon.js"></script>
```

#### Task 1.3: Conditionally Inject Mock Addon in Express Server

**Edit:** `app/bin/server.js`

Add script injection endpoint (before static file serving):
```javascript
// Conditionally serve mock auth addon script based on environment
app.get('/auth/login-mock-addon.js', (req, res) => {
  const authProvider = process.env.TEST_AUTH_PROVIDER;

  if (authProvider === 'mock') {
    res.sendFile(path.join(__dirname, '../../web/public/auth/login-mock-addon.js'));
  } else {
    res.setHeader('Content-Type', 'application/javascript');
    res.send('// Mock auth not available in this environment');
  }
});
```

Wrap mock route registration:
```javascript
// Only register mock OAuth routes in mock auth environments
if (process.env.TEST_AUTH_PROVIDER === 'mock') {
  mockAuthUrlGetApiEndpoint(app);
  mockTokenPostApiEndpoint(app);
  console.log('Mock OAuth routes registered (TEST_AUTH_PROVIDER=mock)');
}
```

#### Task 1.4: Exclude Mock Files from S3 Deployment

**Edit:** `infra/main/java/co/uk/diyaccounting/submit/stacks/PublishStack.java`

Change the distribution paths from:
```java
"/auth/*",
```

To explicit includes:
```java
"/auth/login.html",
"/auth/loginWithCognitoCallback.html",
// Explicitly exclude: loginWithMockCallback.html, login-mock-addon.js
```

---

## Part 2: CloudFront Custom Error Pages

### Requirements

1. **Preserve HTTP status code** (404, 500, 502, 503, 504)
2. **Browser shows requested URL** (not redirect)
3. **Same layout as home page** with logged-in status
4. **Exclude API routes** (`/api/v1/*`) - APIs return JSON errors
5. **Handle both 4xx and 5xx errors**

### Solution: Lambda@Edge Origin-Response (Following Existing Patterns)

The Lambda@Edge function follows the same patterns as existing Lambda functions:
- Handler code lives in `app/functions/edge/`
- Unit tests use vitest in `app/unit-tests/edge/`
- CloudFront event builders follow the `eventBuilders.js` pattern
- CDK uses a new `EdgeLambda` construct (similar to `Lambda.java`)

**Architecture:**
```
Request → CloudFront → Origin (S3 or API Gateway)
                           ↓
                    Origin Response
                           ↓
              Lambda@Edge (origin-response)
                           ↓
              Check: Is this an error for a non-API path?
                           ↓
                    YES: Inject custom error HTML
                    NO: Pass through original response
```

---

### Implementation Tasks

#### Task 2.1: Create CloudFront Event Builders for Tests

**Create:** `app/test-helpers/cloudFrontEventBuilders.js`

```javascript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/test-helpers/cloudFrontEventBuilders.js
// Event builders for Lambda@Edge CloudFront events

/**
 * Build a CloudFront origin-response event
 */
export function buildCloudFrontOriginResponseEvent({
  uri = "/some-page.html",
  status = "200",
  statusDescription = "OK",
  headers = {},
  body = "",
  method = "GET",
} = {}) {
  return {
    Records: [
      {
        cf: {
          config: {
            distributionId: "EXAMPLE",
            distributionDomainName: "d123.cloudfront.net",
            eventType: "origin-response",
            requestId: "test-request-id",
          },
          request: {
            uri,
            method,
            headers: {
              host: [{ key: "Host", value: "example.com" }],
            },
          },
          response: {
            status: String(status),
            statusDescription,
            headers: {
              "content-type": [{ key: "Content-Type", value: "text/html" }],
              ...headers,
            },
            body,
          },
        },
      },
    ],
  };
}

export function build404Event(uri = "/missing-page.html") {
  return buildCloudFrontOriginResponseEvent({
    uri,
    status: "404",
    statusDescription: "Not Found",
  });
}

export function build500Event(uri = "/error-page.html") {
  return buildCloudFrontOriginResponseEvent({
    uri,
    status: "500",
    statusDescription: "Internal Server Error",
  });
}

export function buildApiErrorEvent(status = "404") {
  return buildCloudFrontOriginResponseEvent({
    uri: "/api/v1/some-endpoint",
    status,
    statusDescription: status === "404" ? "Not Found" : "Error",
    body: JSON.stringify({ message: "Not Found" }),
    headers: {
      "content-type": [{ key: "Content-Type", value: "application/json" }],
    },
  });
}
```

#### Task 2.2: Create Error Page HTML Generator

**Create:** `app/functions/edge/errorPageHtml.js`

Separating HTML generation allows for easier testing and maintenance.

```javascript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/edge/errorPageHtml.js
// Error page HTML generation - separated for unit testing

const ERROR_MESSAGES = {
  403: { title: "Forbidden", message: "You do not have permission to access this resource." },
  404: { title: "Not Found", message: "The page you requested could not be found." },
  500: { title: "Server Error", message: "An unexpected error occurred. Please try again later." },
  502: { title: "Bad Gateway", message: "The server received an invalid response." },
  503: { title: "Service Unavailable", message: "The service is temporarily unavailable." },
  504: { title: "Gateway Timeout", message: "The server took too long to respond." },
};

export function generateErrorHtml(statusCode, requestedUri = "") {
  const errorInfo = ERROR_MESSAGES[statusCode] || {
    title: "Error",
    message: "An error occurred while processing your request.",
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DIY Accounting Submit - ${statusCode} ${errorInfo.title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/submit.css">
</head>
<body>
  <header>
    <div class="header-nav">
      <div class="hamburger-menu">
        <button class="hamburger-btn" onclick="toggleMenu()">☰</button>
        <div class="menu-dropdown" id="menuDropdown">
          <a href="/index.html">Home</a>
          <a href="/account/bundles.html">Bundles</a>
          <a href="/hmrc/receipt/receipts.html">Receipts</a>
          <a href="/guide/index.html">User Guide</a>
          <a href="/about.html">About</a>
        </div>
      </div>
      <div class="auth-section">
        <span class="entitlement-status">Activity: unrestricted</span>
        <span class="login-status" id="loginStatus">Not logged in</span>
        <a href="/auth/login.html" class="login-link" id="loginLink">Log in</a>
      </div>
    </div>
    <h1>DIY Accounting Submit</h1>
    <p class="subtitle">${statusCode} ${errorInfo.title}</p>
  </header>

  <main id="mainContent">
    <div class="form-container" style="text-align: center; padding: 2em;">
      <div class="error-content">
        <h2>${errorInfo.title}</h2>
        <p>${errorInfo.message}</p>
        <p class="requested-url">Requested URL: <code id="requestedUrl">${requestedUri}</code></p>
      </div>
      <div class="navigation-container" style="margin-top: 2em;">
        <button type="button" class="btn" onclick="window.location.href='/'">Return to Home</button>
      </div>
    </div>
  </main>

  <footer>
    <div class="footer-content">
      <div class="footer-left">
        <a href="/about.html">About</a>
        <a href="/privacy.html">Privacy</a>
        <a href="/terms.html">Terms</a>
      </div>
      <div class="footer-center">
        <p>&copy; 2025-2026 DIY Accounting Limited</p>
      </div>
      <div class="footer-right"></div>
    </div>
  </footer>

  <script src="/widgets/hamburger-menu.js"></script>
  <script>
    if (!document.getElementById('requestedUrl').textContent) {
      document.getElementById('requestedUrl').textContent = window.location.href;
    }
    (function() {
      const idToken = localStorage.getItem('cognitoIdToken');
      const userInfo = localStorage.getItem('userInfo');
      const loginStatus = document.getElementById('loginStatus');
      const loginLink = document.getElementById('loginLink');
      if (idToken && userInfo) {
        try {
          const user = JSON.parse(userInfo);
          loginStatus.textContent = user.email || 'Logged in';
          loginLink.textContent = 'Log out';
          loginLink.href = '#';
          loginLink.onclick = function(e) {
            e.preventDefault();
            localStorage.removeItem('cognitoIdToken');
            localStorage.removeItem('cognitoAccessToken');
            localStorage.removeItem('cognitoRefreshToken');
            localStorage.removeItem('userInfo');
            window.location.reload();
          };
        } catch (e) {}
      }
    })();
  </script>
</body>
</html>`;
}
```

#### Task 2.3: Create Lambda@Edge Handler

**Create:** `app/functions/edge/errorPageHandler.js`

```javascript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/edge/errorPageHandler.js
// Lambda@Edge origin-response handler for custom error pages

import { generateErrorHtml } from "./errorPageHtml.js";

/**
 * Lambda@Edge origin-response handler
 * @param {CloudFrontResponseEvent} event - CloudFront origin-response event
 * @returns {CloudFrontResponse} - Modified or original response
 */
export async function handler(event) {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;
  const uri = request.uri;
  const status = parseInt(response.status, 10);

  // Only handle errors (4xx and 5xx)
  if (status < 400) {
    return response;
  }

  // Exclude API routes - let them return their JSON errors
  if (uri.startsWith("/api/")) {
    return response;
  }

  // Generate custom error page HTML
  const errorHtml = generateErrorHtml(status, uri);

  // Replace response body with custom error page
  response.body = errorHtml;
  response.bodyEncoding = "text";

  // Set content-type to HTML
  response.headers["content-type"] = [
    { key: "Content-Type", value: "text/html; charset=UTF-8" },
  ];

  // Remove content-length as body has changed
  delete response.headers["content-length"];

  // Status code is preserved (key requirement!)
  return response;
}
```

#### Task 2.4: Create Unit Tests

**Create:** `app/unit-tests/edge/errorPageHandler.test.js`

```javascript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect } from "vitest";
import { handler } from "@app/functions/edge/errorPageHandler.js";
import {
  buildCloudFrontOriginResponseEvent,
  build404Event,
  build500Event,
  buildApiErrorEvent,
} from "@app/test-helpers/cloudFrontEventBuilders.js";

describe("errorPageHandler", () => {
  describe("passes through non-error responses", () => {
    test("200 OK response passes through unchanged", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/index.html",
        status: "200",
      });
      const result = await handler(event);
      expect(result.status).toBe("200");
      expect(result.body).toBe("");
    });

    test("301 redirect passes through unchanged", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/old-page",
        status: "301",
        statusDescription: "Moved Permanently",
      });
      const result = await handler(event);
      expect(result.status).toBe("301");
    });
  });

  describe("handles static file errors with custom page", () => {
    test("404 for HTML page returns custom error page", async () => {
      const event = build404Event("/missing-page.html");
      const result = await handler(event);
      expect(result.status).toBe("404");
      expect(result.body).toContain("<!DOCTYPE html>");
      expect(result.body).toContain("404 Not Found");
      expect(result.body).toContain("/missing-page.html");
      expect(result.headers["content-type"][0].value).toBe("text/html; charset=UTF-8");
    });

    test("500 server error returns custom error page", async () => {
      const event = build500Event("/some-page.html");
      const result = await handler(event);
      expect(result.status).toBe("500");
      expect(result.body).toContain("Server Error");
    });

    test("403 forbidden returns custom error page", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/protected.html",
        status: "403",
        statusDescription: "Forbidden",
      });
      const result = await handler(event);
      expect(result.status).toBe("403");
      expect(result.body).toContain("Forbidden");
    });
  });

  describe("excludes API routes", () => {
    test("API 404 passes through with original JSON body", async () => {
      const event = buildApiErrorEvent("404");
      const originalBody = event.Records[0].cf.response.body;
      const result = await handler(event);
      expect(result.status).toBe("404");
      expect(result.body).toBe(originalBody);
      expect(result.headers["content-type"][0].value).toBe("application/json");
    });

    test("API 500 passes through unchanged", async () => {
      const event = buildApiErrorEvent("500");
      const result = await handler(event);
      expect(result.status).toBe("500");
      expect(result.body).not.toContain("<!DOCTYPE html>");
    });
  });

  describe("error page content", () => {
    test("includes navigation menu", async () => {
      const event = build404Event();
      const result = await handler(event);
      expect(result.body).toContain("hamburger-menu");
      expect(result.body).toContain("/index.html");
    });

    test("includes auth status section", async () => {
      const event = build404Event();
      const result = await handler(event);
      expect(result.body).toContain("auth-section");
      expect(result.body).toContain("loginStatus");
    });

    test("includes return home button", async () => {
      const event = build404Event();
      const result = await handler(event);
      expect(result.body).toContain("Return to Home");
    });
  });
});
```

#### Task 2.5: Create EdgeLambda CDK Construct

**Create:** `infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaProps.java`

```java
/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.lambda.Runtime;

@Value.Immutable
public interface EdgeLambdaProps {
    String idPrefix();
    String functionName();
    String handler();
    String assetPath();

    @Value.Default
    default Runtime runtime() {
        return Runtime.NODEJS_20_X;
    }

    @Value.Default
    default int memorySize() {
        return 128;
    }

    @Value.Default
    default Duration timeout() {
        return Duration.seconds(5);
    }

    @Value.Default
    default String description() {
        return "";
    }

    static ImmutableEdgeLambdaProps.Builder builder() {
        return ImmutableEdgeLambdaProps.builder();
    }
}
```

**Create:** `infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambda.java`

```java
/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import java.util.List;
import software.amazon.awscdk.services.cloudfront.experimental.EdgeFunction;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.IVersion;
import software.constructs.Construct;

public class EdgeLambda {

    public final EdgeFunction function;
    public final IVersion currentVersion;

    public EdgeLambda(final Construct scope, EdgeLambdaProps props) {
        Role edgeLambdaRole = Role.Builder.create(scope, props.idPrefix() + "-Role")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")))
                .build();

        edgeLambdaRole.getAssumeRolePolicy().addStatements(
                PolicyStatement.Builder.create()
                        .principals(List.of(new ServicePrincipal("edgelambda.amazonaws.com")))
                        .actions(List.of("sts:AssumeRole"))
                        .build());

        this.function = EdgeFunction.Builder.create(scope, props.idPrefix() + "-Fn")
                .functionName(props.functionName())
                .runtime(props.runtime())
                .handler(props.handler())
                .code(Code.fromAsset(props.assetPath()))
                .memorySize(props.memorySize())
                .timeout(props.timeout())
                .description(props.description())
                .role(edgeLambdaRole)
                .build();

        this.currentVersion = this.function.getCurrentVersion();

        infof("Created EdgeLambda %s with handler %s from asset %s",
                props.functionName(), props.handler(), props.assetPath());
    }
}
```

#### Task 2.6: Integrate Lambda@Edge into EdgeStack

**Edit:** `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java`

Add imports and create the EdgeLambda, then add it to the default behavior with `edgeLambdas()`.

---

## Part 3: Security Review

### JWT Security Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `customAuthorizer.js` | SECURE | Uses `CognitoJwtVerifier` with signature validation |
| `decodeJwtNoVerify()` | SAFE | Only called after API Gateway JWT validation |
| Bundle endpoints | PROTECTED | `jwtAuthorizer=true` enforced at API Gateway |
| HMRC endpoints | PROTECTED | `customAuthorizer=true` with signature verification |
| OAuth callbacks | INTENTIONALLY OPEN | `cognitoTokenPost`, `hmrcTokenPost` - by design |

### Potential Attack Vectors (All Mitigated)

1. **Mock JWT injection**: CognitoJwtVerifier rejects `alg: none` tokens
2. **Direct Lambda invocation**: Requires IAM permissions, not publicly accessible
3. **API Gateway bypass**: Not possible - only CloudFront routes to API Gateway
4. **Mock route access in prod**: Express routes don't exist in AWS deployment

---

## Implementation Order

### Phase 1: Lambda@Edge Error Pages (Do First - Infrastructure)
1. Task 2.1: Create CloudFront event builders
2. Task 2.2: Create error page HTML generator
3. Task 2.3: Create Lambda@Edge handler
4. Task 2.4: Create unit tests
5. Task 2.5: Create EdgeLambda CDK construct
6. Task 2.6: Integrate into EdgeStack

### Phase 2: Mock OAuth Removal (Do Second - UI/Config)
1. Task 1.1: Create `login-mock-addon.js`
2. Task 1.2: Modify `login.html`
3. Task 1.3: Update `server.js` for conditional routes
4. Task 1.4: Update S3 deployment whitelist

### Phase 3: Verify
1. Run `npm test` for unit tests
2. Run `./mvnw clean verify` for CDK build
3. Run behaviour tests

---

## Files Summary

### New Files (Lambda@Edge)
- `app/test-helpers/cloudFrontEventBuilders.js`
- `app/functions/edge/errorPageHtml.js`
- `app/functions/edge/errorPageHandler.js`
- `app/unit-tests/edge/errorPageHandler.test.js`
- `infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaProps.java`
- `infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambda.java`

### New Files (Mock OAuth Removal)
- `web/public/auth/login-mock-addon.js`

### Modified Files
- `web/public/auth/login.html` - Remove mock button, add container
- `app/bin/server.js` - Conditional mock routes, addon serving
- `infra/.../PublishStack.java` - Explicit auth file list
- `infra/.../EdgeStack.java` - Add Lambda@Edge to default behavior

### Files to NOT Deploy to S3
- `web/public/auth/loginWithMockCallback.html`
- `web/public/auth/login-mock-addon.js`
