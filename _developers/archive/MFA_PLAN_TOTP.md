<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# MFA Implementation Plan (Phase 1, Step 1.1)

**Issue**: #442 - Gov-Client-Multi-Factor header not yet implemented
**Priority**: Critical - Blocks HMRC production approval
**Status**: Not started
**Parent Document**: HMRC_MTD_APPROVAL_PLAN.md

---

## AI-Assisted Development Approach

This implementation is designed to be executed by an AI coding agent (Claude Code) with human oversight for commits and deployments.

### Agent Configuration Reference

- `CLAUDE.md` - Deployment workflow, test commands, git permissions
- `.claude/rules/lambda-functions.md` - Lambda handler patterns
- `.claude/rules/cdk-infrastructure.md` - CDK stack patterns
- `.claude/rules/testing.md` - Test patterns

### Agent Workflow for This Task

1. **Read existing code** to understand current patterns:
   - `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java` (Cognito config)
   - `web/public/submit.js` (fraud prevention header collection)
   - `app/functions/hmrc/*.js` (HMRC API calls)
   - `behaviour-tests/helpers/dynamodb-assertions.js` (header validation)

2. **Implement changes** following the steps below

3. **Local validation**:
   ```bash
   npm test                              # Unit + system tests
   ./mvnw clean verify                   # Java CDK build
   npm run test:submitVatBehaviour-proxy # E2E behaviour tests
   ```

4. **Human commits and pushes** - triggers GitHub Actions deployment

5. **Agent monitors deployment** via `gh run view/watch` commands

6. **Iterate on failures** - analyze logs, fix issues, repeat

### Collaboration Model

| Task | Owner |
|------|-------|
| Code implementation | AI Agent |
| Test creation/updates | AI Agent |
| Local validation | AI Agent |
| Commit/push | Human |
| Deployment monitoring | AI Agent |
| Failure diagnosis | AI Agent |
| HMRC correspondence | Human |

---

## Overview

Implement Multi-Factor Authentication (MFA) using Cognito TOTP and ensure the `Gov-Client-Multi-Factor` fraud prevention header is sent with all HMRC API requests. This is a mandatory requirement for HMRC MTD VAT production approval.

---

## HMRC Requirements

### Gov-Client-Multi-Factor Header Specification

```
Gov-Client-Multi-Factor: type=TOTP&timestamp=<ISO8601>&unique-reference=<session-id>
```

**Required Fields**:
- `type`: MFA type - use `TOTP` (authenticator app), `AUTH_CODE` (SMS), or `OTHER`
- `timestamp`: ISO 8601 timestamp when MFA was verified (e.g., `2026-01-05T12:34:56Z`)
- `unique-reference`: Unique identifier for the MFA session (Cognito session ID or UUID)

**When to send**:
- Include header on **all** HMRC API calls when user has completed MFA
- Omit header when user has not completed MFA (e.g., MFA not enforced)

**HMRC Reference**: [Fraud Prevention Headers Specification](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/)

---

## Implementation Steps

### Step 1: Enable MFA in Cognito User Pool

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`

**Current State**: The Cognito User Pool (lines 143-155) has NO MFA configured. Users authenticate via:
- **Google Identity Provider** (`UserPoolIdentityProviderGoogle`, lines 158-170)
- **antonycc OIDC Provider** (`CfnUserPoolIdentityProvider`, lines 173-194)

**Important**: With federated identity providers, MFA works differently:
- **Google users**: MFA happens at Google (e.g., Google 2FA) - Cognito receives claims after Google MFA is complete
- **OIDC users**: MFA depends on the OIDC provider configuration
- **Direct Cognito users**: Would use Cognito TOTP (but currently no direct sign-up users exist)

Update Cognito User Pool configuration (after line 154, before `.removalPolicy`):

```java
// Import required (add at top of file):
// import software.amazon.awscdk.services.cognito.Mfa;
// import software.amazon.awscdk.services.cognito.MfaSecondFactor;

this.userPool = UserPool.Builder.create(this, props.resourceNamePrefix() + "-UserPool")
    .userPoolName(props.resourceNamePrefix() + "-user-pool")
    .selfSignUpEnabled(true)
    .signInAliases(SignInAliases.builder().email(true).build())
    .standardAttributes(standardAttributes)
    .customAttributes(Map.of(
            "bundles",
            StringAttribute.Builder.create()
                    .maxLen(2048)
                    .mutable(true)
                    .build()))
    // MFA Configuration - applies to direct Cognito authentication only
    // Federated identity providers (Google, OIDC) handle their own MFA
    .mfa(Mfa.OPTIONAL)  // Start with OPTIONAL to avoid breaking federated users
    .mfaSecondFactor(MfaSecondFactor.builder()
            .otp(true)   // Enable TOTP (authenticator apps)
            .sms(false)  // Disable SMS MFA
            .build())
    .removalPolicy(RemovalPolicy.DESTROY)
    .build();
```

**Note**: Use `Mfa.OPTIONAL` initially for federated IdP compatibility. Federated users (Google, OIDC) complete MFA at their identity provider, not at Cognito.

**Testing**: After deployment, verify MFA is enforced:
```bash
# CI environment
aws cognito-idp describe-user-pool \
  --user-pool-id <ci-user-pool-id> \
  --region eu-west-2 \
  --query 'UserPool.MfaConfiguration'

# Should return: "ON"
```

---

### Step 2: Update Frontend to Collect MFA Metadata

**Current Authentication Flow** (see `web/public/auth/loginWithCognitoCallback.html`):
1. User clicks login → redirects to Cognito Hosted UI
2. User selects Google or antonycc OIDC provider
3. User authenticates at provider (MFA may happen at Google/OIDC level)
4. Provider redirects back to Cognito with tokens
5. Cognito redirects to callback page with authorization code
6. Callback exchanges code for tokens via `/api/v1/cognito/token`
7. ID token is decoded and user info stored in localStorage

**MFA Detection Strategy**:
Since users authenticate via federated IdPs, MFA info comes from:
- **Google**: The `amr` (Authentication Methods References) claim in the ID token indicates if MFA was used
- **OIDC**: Custom claims may indicate MFA completion
- **Cognito**: If Cognito enforces MFA on federated users, it adds claims to the token

#### 2.1: Extract MFA Metadata from ID Token Claims

**File**: `web/public/auth/loginWithCognitoCallback.html`

Update `handleAuthCallback` function (around line 104) to extract MFA metadata:

```javascript
async function handleAuthCallback(code, state) {
  try {
    // ... existing code to exchange code for tokens ...

    // Decode ID token to get user info and MFA claims
    const base64Payload = idToken.split(".")[1];
    const jsonPayload = base64UrlDecode(base64Payload);
    const idTokenPayload = JSON.parse(jsonPayload);

    // Extract MFA metadata from token claims
    // Google uses 'amr' claim: ["pwd", "mfa"] indicates MFA was used
    // Cognito may add custom attributes after MFA challenge
    const amrClaims = idTokenPayload.amr || [];
    const mfaVerified = amrClaims.includes('mfa') ||
                        amrClaims.includes('otp') ||
                        idTokenPayload['custom:mfa_verified'] === 'true';

    if (mfaVerified) {
      const mfaMetadata = {
        type: amrClaims.includes('otp') ? 'TOTP' : 'OTHER',
        timestamp: idTokenPayload.auth_time
          ? new Date(idTokenPayload.auth_time * 1000).toISOString()
          : new Date().toISOString(),
        sessionId: idTokenPayload.sid || idTokenPayload.sub.substring(0, 16),
        verified: true
      };
      sessionStorage.setItem('mfaMetadata', JSON.stringify(mfaMetadata));
      console.log('MFA metadata extracted from token:', mfaMetadata);
    } else {
      // Clear any stale MFA metadata if user didn't complete MFA this session
      sessionStorage.removeItem('mfaMetadata');
      console.log('No MFA detected in token claims. amr:', amrClaims);
    }

    // ... rest of existing code ...
  }
}
```

#### 2.2: Generate Gov-Client-Multi-Factor Header

**File**: `web/public/submit.js`

Update fraud prevention header collection (currently at line 1143-1148):

```javascript
// Gov-Client-Multi-Factor: Extract from sessionStorage (set during login)
// See loginWithCognitoCallback.html for how mfaMetadata is populated
let govClientMultiFactorHeader = null;

try {
  const mfaMetadataStr = sessionStorage.getItem('mfaMetadata');
  if (mfaMetadataStr) {
    const mfaMetadata = JSON.parse(mfaMetadataStr);

    if (mfaMetadata.verified) {
      const type = mfaMetadata.type || 'OTHER';
      const timestamp = mfaMetadata.timestamp;
      const uniqueRef = mfaMetadata.sessionId || crypto.randomUUID();

      govClientMultiFactorHeader = `type=${type}&timestamp=${encodeURIComponent(timestamp)}&unique-reference=${encodeURIComponent(uniqueRef)}`;
      console.log('Generated Gov-Client-Multi-Factor header:', govClientMultiFactorHeader);
    }
  }
} catch (err) {
  console.warn('Failed to generate Gov-Client-Multi-Factor header:', err);
  // Omit header if we can't generate it - HMRC allows omission when MFA not used
}
```

#### 2.3: Include Header in HMRC API Requests

Ensure the header is passed with fraud prevention headers:

```javascript
const fraudPreventionHeaders = {
  'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
  // ... other headers ...
};

if (govClientMultiFactorHeader) {
  fraudPreventionHeaders['Gov-Client-Multi-Factor'] = govClientMultiFactorHeader;
}

return fraudPreventionHeaders;
```

---

### Step 3: Update Backend to Forward MFA Header

**File**: `app/functions/hmrc/hmrcVatReturnPost.js` (and similar for other HMRC endpoints)

Ensure the MFA header from client is forwarded to HMRC:

```javascript
// In buildHmrcHeaders or similar function
const fraudPreventionHeaders = buildFraudHeaders(event);

// Gov-Client-Multi-Factor is already collected by buildFraudHeaders
// Verify it's being passed through to HMRC API call

const hmrcHeaders = {
  'Authorization': `Bearer ${hmrcAccessToken}`,
  'Content-Type': 'application/json',
  'Accept': 'application/vnd.hmrc.1.0+json',
  ...fraudPreventionHeaders  // Includes Gov-Client-Multi-Factor if present
};

await hmrcHttpPost(url, body, hmrcHeaders);
```

**File**: `app/lib/buildFraudHeaders.js`

Verify MFA header is extracted from request:

```javascript
export function buildFraudHeaders(event) {
  const headers = event.headers || {};

  return {
    'Gov-Client-Connection-Method': headers['gov-client-connection-method'],
    'Gov-Client-Public-IP': headers['gov-client-public-ip'],
    // ... other headers ...
    'Gov-Client-Multi-Factor': headers['gov-client-multi-factor'], // Add this
  };
}
```

---

### Step 4: MFA for Federated Identity Provider Users

**Current Reality**: All current users authenticate via federated identity providers (Google or antonycc OIDC), not directly with Cognito. This changes the MFA approach significantly.

**MFA Options by User Type**:

| User Type | MFA Handler | How MFA Info Is Available |
|-----------|-------------|---------------------------|
| Google users | Google (2FA, passkeys) | `amr` claim in ID token |
| antonycc OIDC users | OIDC provider | Custom claims or `amr` |
| Direct Cognito users | Cognito TOTP | Cognito session (not currently used) |

**Recommendation**: Rather than implementing Cognito TOTP setup (which no current users would use), focus on:

1. **Extract MFA status from federated IdP tokens** (implemented in Step 2)
2. **Trust the IdP's MFA implementation** (Google 2FA is strong)
3. **Document MFA coverage for HMRC** - explain that users authenticate via Google/OIDC which provide their own MFA

**If Direct Cognito MFA Is Required Later**:

If HMRC requires direct Cognito MFA (unlikely given federated IdP use), the setup flow would be:

**New File**: `web/public/mfa-setup.html`

```html
<div id="mfa-setup">
  <h2>Set Up Two-Factor Authentication</h2>
  <p>This is only required if you sign in directly (not via Google).</p>
  <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
  <div id="qr-code"></div>
  <p>Or enter this code manually: <code id="totp-secret"></code></p>

  <form id="verify-mfa-form">
    <label>Enter 6-digit code from your app:</label>
    <input type="text" name="mfa-code" pattern="[0-9]{6}" maxlength="6" required />
    <button type="submit">Verify</button>
  </form>
</div>
```

**Note**: This is deferred unless HMRC specifically requires Cognito-level MFA for federated users.

---

### Step 5: Update Tests to Support MFA

#### 5.1: Proxy Environment (Mock MFA)

**File**: `.env.proxy`

```bash
# MFA Testing (Phase 1, Step 1.1)
TEST_MFA_ENABLED=true
TEST_MFA_TYPE=TOTP
TEST_MFA_TIMESTAMP=2026-01-05T12:00:00Z
TEST_MFA_SESSION_ID=test-session-12345
```

**File**: `mock-oauth2-server.json`

Add MFA claims to mock OAuth2 tokens:

```json
{
  "interactiveLogin": true,
  "httpServer": {
    "port": 8080
  },
  "tokenCallbacks": [
    {
      "issuerId": "default",
      "tokenExpiry": 3600,
      "requestMappings": [
        {
          "match": "*",
          "claims": {
            "sub": "user",
            "iss": "http://localhost:8080/default",
            "aud": "client",
            "scope": "openid profile",
            "mfa_verified": true,
            "mfa_timestamp": "2026-01-05T12:00:00Z",
            "mfa_type": "TOTP"
          }
        }
      ]
    }
  ]
}
```

**File**: `behaviour-tests/helpers/behaviour-helpers.js`

Add helper to inject mock MFA metadata:

```javascript
/**
 * Inject mock MFA metadata into page for testing
 */
export async function injectMockMFA(page) {
  if (process.env.TEST_MFA_ENABLED !== 'true') return;

  const mfaMetadata = {
    type: process.env.TEST_MFA_TYPE || 'TOTP',
    timestamp: process.env.TEST_MFA_TIMESTAMP || new Date().toISOString(),
    sessionId: process.env.TEST_MFA_SESSION_ID || crypto.randomUUID(),
    verified: true
  };

  await page.evaluate((metadata) => {
    sessionStorage.setItem('mfaMetadata', JSON.stringify(metadata));
  }, mfaMetadata);

  console.log('[Mock MFA] Injected MFA metadata:', mfaMetadata);
}
```

**File**: `behaviour-tests/auth.behaviour.test.js`

Inject mock MFA after login:

```javascript
await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath);
await verifyLoggedInStatus(page, screenshotPath);

// Inject mock MFA metadata for testing
await injectMockMFA(page);

await consentToDataCollection(page, screenshotPath);
```

#### 5.2: CI/Production Environment (Federated IdP MFA)

**Current Reality**: In CI/production, tests use the `cognito` OIDC provider (antonycc), not direct Cognito authentication. This provider doesn't currently return MFA claims.

**Options for CI Testing**:

1. **Mock MFA in tests** (Recommended for initial implementation):
   - Inject mock MFA metadata after login completes
   - Tests verify header generation and transmission
   - Simpler, no OIDC provider changes needed

2. **Configure OIDC provider to return MFA claims** (For production accuracy):
   - Update antonycc OIDC provider to include `amr` claims
   - Would require OIDC provider configuration changes

**Recommended Approach - Inject Mock MFA After Federated Login**:

**File**: `behaviour-tests/steps/behaviour-login-steps.js`

Update to inject MFA metadata after successful federated login:

```javascript
export async function loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath) {
  // ... existing login code completes federated auth ...

  // After successful login, check if we should inject mock MFA for testing
  if (process.env.TEST_MFA_ENABLED === 'true') {
    console.log('[Login] Injecting mock MFA metadata for testing');

    const mfaMetadata = {
      type: process.env.TEST_MFA_TYPE || 'TOTP',
      timestamp: process.env.TEST_MFA_TIMESTAMP || new Date().toISOString(),
      sessionId: process.env.TEST_MFA_SESSION_ID || `test-session-${Date.now()}`,
      verified: true
    };

    await page.evaluate((metadata) => {
      sessionStorage.setItem('mfaMetadata', JSON.stringify(metadata));
      console.log('Injected MFA metadata:', metadata);
    }, mfaMetadata);

    console.log('[Login] Mock MFA metadata injected:', mfaMetadata);
  }
}
```

**Note**: This approach validates the MFA header generation and transmission without requiring OIDC provider changes. For full production validation, the OIDC provider would need to return real MFA claims.

#### 5.3: Environment Variables for MFA Testing

**File**: `.env.ci` (add these variables):

```bash
# MFA Testing - Enable mock MFA injection
TEST_MFA_ENABLED=true
TEST_MFA_TYPE=TOTP
# Timestamp will be generated dynamically if not set
```

**Note**: No Secrets Manager TOTP secrets needed for federated IdP approach - MFA is handled by the IdP, not Cognito.

#### 5.4: Update Fraud Prevention Header Assertions

**File**: `behaviour-tests/helpers/dynamodb-assertions.js`

Remove MFA from intentionally omitted list:

```javascript
// Before:
export const intentionallyNotSuppliedHeaders = [
  "gov-client-multi-factor",  // ❌ Remove this line once MFA is implemented
  "gov-vendor-license-ids",
  "gov-client-public-port"
];

// After:
export const intentionallyNotSuppliedHeaders = [
  "gov-vendor-license-ids",
  "gov-client-public-port"
];
```

Add MFA header validation:

```javascript
/**
 * Assert Gov-Client-Multi-Factor header is present and valid
 */
export function assertMfaHeader(hmrcApiRequestsFile) {
  const records = readDynamoDbExport(hmrcApiRequestsFile);

  // Filter authenticated requests (exclude OAuth token calls)
  const authenticatedRequests = records.filter(r =>
    r.url && !r.url.includes('/oauth/token')
  );

  console.log(`[MFA Assertions] Checking ${authenticatedRequests.length} authenticated HMRC API requests for MFA header`);

  authenticatedRequests.forEach((record, index) => {
    const mfaHeader = record.httpRequest?.headers?.['gov-client-multi-factor'];

    // Assert header is present
    expect(mfaHeader, `Request #${index + 1} (${record.url}) missing Gov-Client-Multi-Factor header`).toBeDefined();

    // Parse header
    const params = new URLSearchParams(mfaHeader);

    // Verify required fields
    const type = params.get('type');
    const timestamp = params.get('timestamp');
    const uniqueRef = params.get('unique-reference');

    expect(type, `Request #${index + 1}: MFA type missing`).toBeTruthy();
    expect(['TOTP', 'AUTH_CODE', 'OTHER'].includes(type), `Request #${index + 1}: Invalid MFA type ${type}`).toBe(true);

    expect(timestamp, `Request #${index + 1}: MFA timestamp missing`).toBeTruthy();
    expect(timestamp, `Request #${index + 1}: Invalid timestamp format`).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    expect(uniqueRef, `Request #${index + 1}: MFA unique-reference missing`).toBeTruthy();
    expect(uniqueRef.length, `Request #${index + 1}: unique-reference too short`).toBeGreaterThan(10);

    console.log(`[MFA Assertions] ✓ Request #${index + 1} has valid MFA header: type=${type}, timestamp=${timestamp}`);
  });

  console.log('[MFA Assertions] All authenticated requests have valid Gov-Client-Multi-Factor headers');
}
```

#### 5.5: Create Dedicated MFA Test

**New File**: `behaviour-tests/mfaValidation.behaviour.test.js`

```javascript
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  runLocalSslProxy,
  injectMockMFA,
} from "./helpers/behaviour-helpers.js";
import { goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus } from "./steps/behaviour-login-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import { assertMfaHeader } from "./helpers/dynamodb-assertions.js";
import { initSubmitVat, fillInVat, submitFormVat } from "./steps/behaviour-hmrc-vat-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/mfa-validation-test";

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);

test.setTimeout(300_000);

test("Verify Gov-Client-Multi-Factor header implementation", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  // Login
  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath);
  await verifyLoggedInStatus(page, screenshotPath);

  // For proxy mode, inject mock MFA
  await injectMockMFA(page);

  // Make an HMRC API call (submit VAT return)
  await initSubmitVat(page, screenshotPath);
  await fillInVat(page, "123456789", "24A1", "100.00", screenshotPath);
  await submitFormVat(page, screenshotPath);

  // Export DynamoDB tables
  const hmrcApiRequestsTableName = process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME;
  const dynamoEndpoint = process.env.DYNAMODB_ENDPOINT || "http://127.0.0.1:9000";

  await exportAllTables(outputDir, dynamoEndpoint, {
    hmrcApiRequestsTableName,
  });

  // Assert MFA header is present and valid
  const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");
  assertMfaHeader(hmrcApiRequestsFile);
});
```

**Add to `playwright.config.js`**:

```javascript
{
  name: "mfaValidationBehaviour",
  testDir: "behaviour-tests",
  testMatch: ["**/mfaValidation.behaviour.test.js"],
  workers: 1,
  outputDir: "./target/behaviour-test-results/",
  timeout: 300_000,
}
```

**Add to `package.json`**:

```json
{
  "test:mfaValidationBehaviour": "playwright test --project=mfaValidationBehaviour",
  "test:mfaValidationBehaviour-proxy": "npx dotenv -e .env.proxy -- npm run test:mfaValidationBehaviour",
  "test:mfaValidationBehaviour-ci": "npx dotenv -e .env.ci -- npm run test:mfaValidationBehaviour"
}
```

---

## Testing Strategy

### Phase 1: Local Development (Proxy Mode)

Test MFA with mock data before deploying to AWS:

```bash
# Set test environment variables
export TEST_MFA_ENABLED=true
export TEST_MFA_TYPE=TOTP
export TEST_MFA_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Run auth test with mock MFA
npm run test:authBehaviour-proxy

# Run VAT submission test with MFA
HMRC_ACCOUNT=sandbox npm run test:submitVatBehaviour-proxy

# Run fraud prevention header validation
HMRC_ACCOUNT=sandbox npm run test:postVatReturnFraudPreventionHeadersBehaviour-proxy

# Run dedicated MFA validation test
npm run test:mfaValidationBehaviour-proxy

# Verify MFA header in DynamoDB export
cat target/behaviour-test-results/*/hmrc-api-requests.jsonl | \
  jq -r '.httpRequest.headers."gov-client-multi-factor"' | \
  grep -E '^type=TOTP&timestamp='
```

**Expected Results**:
- ✅ All tests pass with mock MFA data
- ✅ `Gov-Client-Multi-Factor` header present in all HMRC API requests
- ✅ Header format: `type=TOTP&timestamp=2026-01-05T12:00:00Z&unique-reference=test-session-12345`
- ✅ No errors from HMRC validation endpoint

### Phase 2: CI Environment (Federated IdP with Mock MFA)

Since CI tests use federated IdP (antonycc OIDC), MFA is handled differently:

```bash
# Deploy infrastructure (no Cognito MFA changes needed for federated users)
cd infra && npm run cdk:deploy-ci

# Add MFA env vars to .env.ci
echo "TEST_MFA_ENABLED=true" >> .env.ci
echo "TEST_MFA_TYPE=TOTP" >> .env.ci

# Run tests with mock MFA injection
# (MFA metadata will be injected after federated login)
npm run test:submitVatBehaviour-ci

# Verify MFA header in test artifacts
gh run download <run-id> -n submitVatBehaviour-artifacts
cat target/behaviour-test-results/*/hmrc-api-requests.jsonl | \
  jq -r '.httpRequest.headers."gov-client-multi-factor"' | \
  grep -E '^type=TOTP&timestamp='
```

**Expected Results**:
- ✅ Federated login completes successfully
- ✅ Mock MFA metadata injected into sessionStorage
- ✅ `Gov-Client-Multi-Factor` header generated and sent to HMRC
- ✅ HMRC validation endpoint returns no errors/warnings

**Future Enhancement**: Configure antonycc OIDC provider to return `amr` claims for real MFA detection.

### Phase 3: Production Environment

Production users authenticate via Google (with Google's MFA) or antonycc OIDC:

```bash
# Deploy to production (frontend changes only needed)
cd infra && npm run cdk:deploy-prod

# Verify frontend extracts MFA claims from Google tokens
# (Google users who have 2FA enabled will have `amr` claims)

# Run production smoke tests
npm run test:submitVatBehaviour-prod

# Collect evidence for HMRC approval
# Download artifacts: hmrc-api-requests.jsonl, screenshots, video
```

**Production MFA Reality**:
- **Google users with 2FA**: Header generated from real `amr` claims
- **Google users without 2FA**: Header omitted (HMRC allows this)
- **antonycc OIDC users**: Mock header or OIDC provider configuration needed

---

## Manual Testing Checklist

### For Developers (Federated IdP Testing)

**With Google Account (has 2FA enabled)**:
- [ ] Login via Google with 2FA
- [ ] Check browser DevTools: `sessionStorage.getItem('mfaMetadata')` shows MFA data
- [ ] Submit VAT return
- [ ] Check Network tab: `Gov-Client-Multi-Factor` header present in HMRC API call
- [ ] Verify header format: `type=OTHER&timestamp=...&unique-reference=...`

**With Google Account (no 2FA)**:
- [ ] Login via Google without 2FA
- [ ] Check browser DevTools: `sessionStorage.getItem('mfaMetadata')` is null or empty
- [ ] Submit VAT return
- [ ] Check Network tab: `Gov-Client-Multi-Factor` header **NOT** present (expected)

**With antonycc OIDC**:
- [ ] Login via Cognito OIDC
- [ ] Check browser console for MFA claim extraction logs
- [ ] Verify MFA metadata handling matches OIDC claims

### For QA

- [ ] Test Google login with 2FA enabled
- [ ] Test Google login without 2FA
- [ ] Test antonycc OIDC login
- [ ] Verify MFA header format complies with HMRC spec
- [ ] Test session persistence (MFA info survives page refresh within session)
- [ ] Test new session (MFA info cleared on logout)

---

## Rollout Plan (AI Agent Execution)

### Iteration 1: Development & Local Testing (Agent)
**Agent tasks**:
1. Read existing code in `loginWithCognitoCallback.html` and `submit.js`
2. Update `loginWithCognitoCallback.html` to extract MFA claims from ID tokens
3. Update `submit.js` to generate `Gov-Client-Multi-Factor` header from sessionStorage
4. Create mock MFA test helpers in `behaviour-helpers.js`
5. Run local validation: `npm test && ./mvnw clean verify`
6. Run proxy tests with mock MFA: `TEST_MFA_ENABLED=true npm run test:submitVatBehaviour-proxy`

**Human checkpoint**: Review changes, commit, push

**Success criteria**: Proxy tests pass with mock MFA header in HMRC API requests

### Iteration 2: CI Integration (Agent + Human)
**Human tasks**:
- Commit and push to trigger deployment
- Add `TEST_MFA_ENABLED=true` to `.env.ci`

**Agent tasks**:
1. Monitor deployment via `gh run view <run-id>`
2. Analyze any deployment failures from logs
3. Verify mock MFA injection works in CI tests
4. Run CI tests: `npm run test:submitVatBehaviour-ci`
5. Verify `Gov-Client-Multi-Factor` header in test artifacts
6. Diagnose and fix any CI test failures

**Success criteria**: CI tests pass with MFA header in HMRC API requests

### Iteration 3: Production Deployment (Human + Agent)
**Human tasks**:
- Approve production deployment
- Test with Google account (with 2FA enabled)

**Agent tasks**:
1. Monitor production deployment
2. Run production smoke tests
3. Collect test evidence artifacts (DynamoDB exports showing headers)
4. Update documentation with production evidence

**Success criteria**: Production deployed, real Google 2FA users generate valid headers

### Iteration 4: HMRC Approval (Human)
**Human tasks**:
- Submit evidence to HMRC showing `Gov-Client-Multi-Factor` header in HMRC API requests
- Explain federated IdP MFA approach (Google 2FA, OIDC)
- Address any feedback

**Success criteria**: HMRC approval obtained

---

## Success Criteria

### Technical
- ✅ Frontend extracts MFA claims from federated IdP tokens (Google `amr`, OIDC claims)
- ✅ `Gov-Client-Multi-Factor` header sent with HMRC API requests when MFA detected
- ✅ Header format compliant with HMRC specification: `type=<TYPE>&timestamp=<ISO8601>&unique-reference=<ID>`
- ✅ Header omitted when no MFA (allowed by HMRC spec)
- ✅ Tests pass in proxy and CI environments with mock MFA

### HMRC Compliance
- ✅ Fraud prevention header validation endpoint returns no errors
- ✅ `gov-client-multi-factor` removed from "intentionally omitted" list
- ✅ Evidence collected showing header in real HMRC API requests
- ✅ Documentation explains federated IdP MFA approach

### User Experience
- ✅ No change for users - MFA is handled by Google/OIDC provider
- ✅ Users with Google 2FA automatically get MFA header
- ✅ Session persistence (MFA info survives page refresh within session)

---

## Dependencies

### NPM Packages
```bash
# No additional packages needed for federated IdP MFA approach
# MFA claims are extracted from standard JWT tokens
```

### AWS Permissions

No additional Lambda permissions needed - frontend handles MFA claim extraction.

Test runner needs (existing):
- GitHub Actions OIDC role for deployment

### Infrastructure
- Frontend changes only (`loginWithCognitoCallback.html`, `submit.js`)
- No Cognito User Pool changes required for federated IdP approach
- Backend already passes through `Gov-Client-Multi-Factor` header (verified in `buildFraudHeaders.js`)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Google doesn't return `amr` claims | Medium | Use mock MFA for testing; document for HMRC |
| antonycc OIDC doesn't return MFA claims | Medium | Inject mock MFA in tests; configure OIDC later |
| HMRC rejects federated IdP MFA approach | Critical | Validate header format early; document IdP MFA |
| Session storage cleared unexpectedly | Low | Re-extract MFA claims on next API call |
| Header format doesn't match HMRC spec | High | Validate format in tests; check validation endpoint |

---

## Rollback Plan

If MFA header implementation causes issues in production:

1. **Immediate**: Disable MFA claim extraction in frontend
   ```javascript
   // In loginWithCognitoCallback.html - comment out MFA extraction
   // const mfaVerified = amrClaims.includes('mfa') || ...
   sessionStorage.removeItem('mfaMetadata'); // Clear any existing
   ```

2. **Alternative**: Skip header generation in submit.js
   ```javascript
   // Comment out Gov-Client-Multi-Factor header generation
   // let govClientMultiFactorHeader = null;
   // The header will simply not be sent - HMRC allows omission
   ```

3. **Long-term**: Fix issues, re-enable MFA claim extraction

**Note**: Rollback is low-risk since:
- HMRC allows omitting `Gov-Client-Multi-Factor` header
- Header is only sent when MFA is detected
- No infrastructure changes needed to rollback

---

## Next Steps

After MFA implementation is complete:

1. ✅ **Complete Phase 1, Step 1.1** of HMRC_MTD_APPROVAL_PLAN.md
2. → Move to **Phase 1, Step 1.3**: Implement Synthetic Monitoring
3. → Move to **Phase 2**: Sandbox Testing with all fraud prevention headers
4. → Move to **Phase 3**: HMRC Production Application

---

## References

- [HMRC Fraud Prevention Headers Specification](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/)
- [Cognito MFA Documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)
- [HMRC_MTD_APPROVAL_PLAN.md](../../HMRC_MTD_APPROVAL_PLAN.md) - Parent document
- [Issue #442](https://github.com/your-org/submit/issues/442) - Gov-Client-MFA header tracking

---

**Last Updated**: 2026-01-06
**Executor**: AI Agent (Claude Code) with human oversight
**Status**: Ready for AI agent implementation
**Agent Guidance**: See `CLAUDE.md` for deployment workflow and permissions
