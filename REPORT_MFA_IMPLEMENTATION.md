# MFA Implementation Summary

**Date**: 2026-02-27 (updated from 2026-02-26, originally 2026-01-06)
**Status**: IMPLEMENTED AND VERIFIED — all 16 CI behaviour tests passed (run 22501672507)
**Branches**: `mfatotp` (PR #724), `assertmfa` (assertion fixes + PreTokenGeneration Lambda)
**Plans**: `PLAN_COGNITO_TOTP_MFA.md`, `PLAN_GOV_CLIENT_MULTI_FACTOR.md`

---

## What Was Implemented

### Two MFA Paths

| Auth Method | MFA Source | Detection Mechanism | `Gov-Client-Multi-Factor` type |
|-------------|-----------|---------------------|-------------------------------|
| Google (federated) | Google 2FA | `identities` claim + `auth_time` | `type=OTHER` |
| Cognito native (test users) | TOTP enrollment | `custom:mfa_method` claim (via PreTokenGeneration Lambda) | `type=TOTP` |

**Note**: Cognito does NOT populate `amr` claims for native TOTP auth. The original approach of reading
`amr` was replaced with a Pre Token Generation Lambda that injects `custom:mfa_method=TOTP` by checking
the user's MFA configuration via `AdminGetUser`.

### CDK Infrastructure

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java` (lines 168-174)

Cognito User Pool configured with optional TOTP MFA:
```java
.mfa(Mfa.OPTIONAL)
.mfaSecondFactor(MfaSecondFactor.builder()
    .otp(true)  // TOTP via authenticator apps
    .sms(false) // No SMS MFA (no phone numbers collected)
    .build())
```

`OPTIONAL` means only users who enroll a TOTP device are challenged. Google-federated users are unaffected — federated auth bypasses Cognito MFA entirely.

### Frontend — MFA Detection and Type Mapping

**Files**:
- `web/public/auth/loginWithCognitoCallback.html` (lines 228-267)
- `web/public/auth/loginWithMockCallback.html` (lines 168-204)

After OAuth login, the callback page detects MFA via three branches (in priority order):

1. **`amr` claims** — if `amr` contains MFA indicators (`mfa`, `swk`, `hwk`, `otp`), map accordingly
2. **`custom:mfa_method`** — if claim equals `"TOTP"`, set `type=TOTP` (Cognito native auth path)
3. **Federated login with `auth_time`** — if `identities` claim present, set `type=OTHER` (Google etc.)

The `unique-reference` uses a stable SHA-256 hash of `sub + ":" + mfaType` (not random UUID):

```javascript
// Branch 2: Cognito native TOTP (custom claim from PreTokenGeneration Lambda)
if (idTokenPayload["custom:mfa_method"] === "TOTP") {
  const mfaType = "TOTP";
  const encoder = new TextEncoder();
  const data = encoder.encode(idTokenPayload.sub + ":" + mfaType);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const uniqueReference = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const mfaMetadata = {
    type: mfaType,
    timestamp: new Date(authTime * 1000).toISOString(),
    uniqueReference: uniqueReference,
  };
  sessionStorage.setItem("mfaMetadata", JSON.stringify(mfaMetadata));
}
```

### Frontend — MFA Header Generation

**File**: `web/public/lib/services/hmrc-service.js` (lines 176-186, 228-229)

When making HMRC API calls:
```javascript
let govClientMultiFactorHeader;
try {
  const mfaMetadata = sessionStorage.getItem("mfaMetadata");
  if (mfaMetadata) {
    const mfa = JSON.parse(mfaMetadata);
    govClientMultiFactorHeader = `type=${mfa.type}&timestamp=${encodeURIComponent(mfa.timestamp)}&unique-reference=${encodeURIComponent(mfa.uniqueReference)}`;
  }
} catch (err) {
  console.warn("Failed to read MFA metadata from sessionStorage:", err);
}

// Later:
if (govClientMultiFactorHeader) {
  headers["Gov-Client-Multi-Factor"] = govClientMultiFactorHeader;
}
```

### Backend — Header Pass-Through

**File**: `app/lib/buildFraudHeaders.js` (line 191)

`Gov-Client-Multi-Factor` is in the client header pass-through list. No backend changes needed — the header flows from browser → Lambda → HMRC.

### Test User TOTP Enrollment

**File**: `scripts/create-cognito-test-user.js` (lines 108-206)

After creating a user and setting the password, the script enrolls TOTP:
1. Authenticates user → gets access token
2. `AssociateSoftwareToken` → gets base32 TOTP secret
3. Generates TOTP code using `otpauth` library
4. `VerifySoftwareToken` → confirms enrollment
5. `AdminSetUserMFAPreference` → makes TOTP required for subsequent logins
6. Outputs `TOTP_SECRET=<base32>` and writes to `GITHUB_OUTPUT`

### Enable Script — TOTP Secret Passthrough

**File**: `scripts/enable-cognito-native-test.js` (lines 59-120)

Captures `TOTP_SECRET` from the create script output and saves in `cognito-native-test-credentials.json`:
```json
{
  "environment": "ci",
  "username": "test-xxx@test.diyaccounting.co.uk",
  "password": "TestXxx!Aa1#",
  "totpSecret": "JBSWY3DPEHPK3PXP...",
  "createdAt": "2026-02-26T..."
}
```

### Behaviour Tests — TOTP Challenge Handler

**File**: `behaviour-tests/steps/behaviour-login-steps.js` (lines 247-313)

`handleTotpChallenge(page, totpSecret, screenshotPath)`:
1. Waits for TOTP code input field on Cognito Hosted UI
2. Generates TOTP code from secret using `otpauth`
3. Types code using keyboard input (matches existing Cognito form handling pattern)
4. Submits the challenge form
5. Waits for redirect to callback URL

Called from `loginWithCognitoOrMockAuth()` (lines 56-61) when `TEST_AUTH_TOTP_SECRET` env var is set.

### TOTP Code Helper

**File**: `scripts/totp-code.js` — `npm run test:totpCode`

Generates TOTP codes locally from a secret:
```bash
npm run test:totpCode -- JBSWY3DPEHPK3PXP
# or
oathtool --totp --base32 JBSWY3DPEHPK3PXP
```

Reads from: CLI argument, `TEST_AUTH_TOTP_SECRET` env var, or `cognito-native-test-credentials.json`.

### GitHub Actions Workflows

| Workflow | Change |
|----------|--------|
| `probe-test.yml` | `test-auth-totp-secret` input/output/passthrough + `TEST_AUTH_TOTP_SECRET` env |
| `deploy-app.yml` | `TEST_AUTH_TOTP_SECRET` env on behaviour test step |
| `generate-pass.yml` | TOTP secret + `oathtool` command in job summary |

---

## End-to-End Flow

```
1. Test user created with TOTP enrolled (create-cognito-test-user.js)
   ↓
2. User authenticates via Cognito Hosted UI (email/password)
   ↓
3. Cognito presents TOTP challenge page (because TOTP is preferred MFA)
   ↓
4. Playwright generates TOTP code from secret and submits (handleTotpChallenge)
   ↓
5. Cognito validates TOTP → Pre Token Generation Lambda fires
   → AdminGetUser detects TOTP MFA → injects custom:mfa_method=TOTP into ID token
   ↓
6. loginWithCognitoCallback.html detects custom:mfa_method=TOTP → stores type=TOTP
   with stable SHA-256 unique-reference (sub + ":" + mfaType)
   ↓
7. User submits VAT return
   ↓
8. hmrc-service.js reads sessionStorage → generates header:
   Gov-Client-Multi-Factor: type=TOTP&timestamp=2026-02-27T17:40:44.000Z&unique-reference=9bbf7ce8...
   ↓
9. Header sent to Lambda (buildFraudHeaders.js passes through to HMRC)
   ↓
10. HMRC validates fraud prevention headers ✅
```

---

## HMRC Compliance

### Header Format
Complies with HMRC specification:
```
Gov-Client-Multi-Factor: type=<TYPE>&timestamp=<ISO8601>&unique-reference=<UUID>
```

### Type Values Used
- `TOTP` — Cognito native auth users with enrolled TOTP device
- `OTHER` — Google-federated users with Google 2FA

### Unique Reference
Stable SHA-256 hash of `sub + ":" + mfaType`. Same user + same MFA type = same reference across all
API calls and logins. HMRC compliant — identifies a single factor consistently.

### Omission Policy
Header omitted only when no MFA detected (e.g., Google without 2FA). Once this deployment is live, all test and production users will have MFA.

### `intentionallyNotSuppliedHeaders`
Now empty `[]` — all FPH headers are expected to be present.

---

## Testing

### Local Validation — PASSED
```bash
npm test              # 949 tests passed
./mvnw clean verify   # BUILD SUCCESS (CDK compiles with Mfa/MfaSecondFactor + PreTokenGeneration Lambda)
```

### Proxy Mode — PASSED
Mock OAuth server includes `amr: ["mfa", "pwd"]` claims → `type=OTHER` header generated automatically.
`npm run test:submitVatBehaviour-proxy` — 1 passed (1.9m)

### CI Deployment — VERIFIED

**Run 22496165436** (2026-02-27T17:36Z, `ci-assertmfa` — expired after 2h):
- Infrastructure deployed successfully (including PreTokenGeneration Lambda)
- MFA header confirmed present in DynamoDB (see evidence below)
- 9 of 11 CI behaviour tests passed; 2 failed at `assertConsistentHashedSub` (fixed in Step 9)

**Run 22501672507** (2026-02-27, `ci-assertmfa` redeployment — includes Step 9 fix):
- All 16 CI behaviour tests passed
- `submitVatBehaviour-ci` (4m35s) and `postVatReturnFraudPreventionHeadersBehaviour-ci` (2m54s) both passed
- No skipped scenario tests — all ran successfully

### DynamoDB Evidence (Run 22496165436)

Traceparent: `00-899d08f8bbe9e24d82d4a1f13e92eef3-bfe9fce0bb3c77c0-01`
User sub: `c6524294-b061-7063-d7e1-3964d7d3bbab`

21 HMRC API requests found in `ci-env-hmrc-api-requests` table:

| Type | Count | `Gov-Client-Multi-Factor` |
|------|-------|--------------------------|
| `POST /oauth/token` | 2 | N/A (no Gov headers on OAuth) |
| `GET /obligations` | 10 | Present |
| `POST /vat/.../returns` | 1 | `type=TOTP&timestamp=2026-02-27T17%3A40%3A44.000Z&unique-reference=9bbf7ce8...` |
| `GET /vat/.../returns/18A1` | 1 | Present |
| `GET /test/fraud-prevention-headers/validate` | 7 | Present |

All 15 other Gov-* headers also present on every authenticated request.

### CI/Prod (Cognito Native Auth)
```bash
export AWS_PROFILE=submit-ci
npm run test:enableCognitoNative    # Creates TOTP-enrolled user
# Use the printed credentials:
TEST_AUTH_USERNAME='...' TEST_AUTH_PASSWORD='...' TEST_AUTH_TOTP_SECRET='...' npm run test:submitVatBehaviour-ci
npm run test:disableCognitoNative   # Clean up
```

---

## Files Changed

### Original MFA Implementation (branch `mfatotp`, PR #724)

| File | Purpose |
|------|---------|
| `infra/.../IdentityStack.java` | CDK: optional TOTP MFA on User Pool |
| `web/public/auth/loginWithCognitoCallback.html` | Detect MFA via `amr`/`custom:mfa_method`/federated, stable SHA-256 unique-reference |
| `web/public/auth/loginWithMockCallback.html` | Same MFA type mapping + stable unique-reference for mock auth |
| `web/public/lib/services/hmrc-service.js` | Generate `Gov-Client-Multi-Factor` from sessionStorage |
| `app/lib/buildFraudHeaders.js` | Pass-through `Gov-Client-Multi-Factor` to HMRC |
| `scripts/create-cognito-test-user.js` | TOTP enrollment during test user creation |
| `scripts/enable-cognito-native-test.js` | Capture/save TOTP secret |
| `scripts/totp-code.js` | TOTP code generator helper |
| `behaviour-tests/steps/behaviour-login-steps.js` | TOTP challenge handler for Playwright |
| `.github/workflows/probe-test.yml` | TOTP secret passthrough |
| `.github/workflows/deploy-app.yml` | TOTP secret env var |
| `.github/workflows/generate-pass.yml` | TOTP secret in job summary |
| `package.json` | `otpauth` v9.5.0 + `test:totpCode` script |

### Assertion Fixes (branch `assertmfa`)

| File | Purpose |
|------|---------|
| `app/functions/auth/preTokenGeneration/index.js` | **NEW** — Pre Token Generation Lambda: injects `custom:mfa_method=TOTP` |
| `app/unit-tests/functions/preTokenGeneration.test.js` | **NEW** — Unit tests for PreTokenGeneration trigger |
| `infra/.../IdentityStack.java` | Lambda function + Pre Token Generation trigger + IAM policy |
| `app/http-simulator/routes/fraud-headers.js` | Move `gov-client-multi-factor` to required headers |
| `behaviour-tests/helpers/dynamodb-assertions.js` | `assertFraudPreventionHeaders` + `assertConsistentHashedSub` filter by userSub |
| `behaviour-tests/helpers/dynamodb-export.js` | Conditional credentials: dummy for dynalite, SDK chain for real AWS |
| `behaviour-tests/submitVat.behaviour.test.js` | `assertEssentialFraudPreventionHeadersPresent()` + userSub filtering |
| `behaviour-tests/postVatReturn.behaviour.test.js` | Same |
| `behaviour-tests/getVatObligations.behaviour.test.js` | Same |
| `behaviour-tests/getVatReturn.behaviour.test.js` | Same |
| `behaviour-tests/postVatReturnFraudPreventionHeaders.behaviour.test.js` | Same |
| `.env.ci` | `TEST_DYNAMODB=useExisting` (was `off`) |

---

## Open Items

### Cognito Hosted UI TOTP Selectors — RESOLVED
The TOTP challenge page selectors work correctly in CI. Verified in run 22496165436 — TOTP challenge
detected, code submitted, authentication successful.

### CI Test Assertions — VERIFIED (Run 22501672507)
The `assertConsistentHashedSub` fix (commit `5a1b6f27` on `assertmfa`) verified in run 22501672507.
All 16 CI behaviour tests passed. Both previously-failing tests now pass with user-filtered assertions.

---

## References

- **Plans**: `PLAN_COGNITO_TOTP_MFA.md`, `PLAN_GOV_CLIENT_MULTI_FACTOR.md`
- **PR**: #724 — Original MFA changes on `mfatotp` branch
- **Branch**: `assertmfa` — PreTokenGeneration Lambda + assertion fixes + DynamoDB filtering
- **CI Evidence**: Run 22496165436 artifacts — `submitVatBehaviour-artifacts/traceparent.txt`
- **DynamoDB**: `ci-env-hmrc-api-requests` — traceparent `899d08f8bbe9e24d82d4a1f13e92eef3`
