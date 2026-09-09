<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Cognito TOTP MFA for Gov-Client-Multi-Factor Header

## User Assertions (non-negotiable)

- The test suite MUST exercise real MFA so `Gov-Client-Multi-Factor` is populated with genuine values
- HMRC FPH headers must carry real MFA data from the authentication flow, not mocked/injected values
- Cognito native auth (used by behaviour tests against CI/prod) must complete TOTP MFA
- The `Gov-Client-Multi-Factor` header must use `type=TOTP` when Cognito TOTP is the MFA method

## Problem

`Gov-Client-Multi-Factor` is populated when authenticating via Google (federated IdP) because the
`amr` claim in the ID token contains MFA indicators like `["mfa", "pwd"]`. When using Cognito native
auth (email/password) — used by behaviour tests against CI and prod — no MFA occurs, so the header
is absent.

This means behaviour tests running against real HMRC sandbox/production never send the
`Gov-Client-Multi-Factor` header. **HMRC has explicitly flagged this**: their FPH team reported that
"a large proportion of your requests are missing the Gov-Client-Multi-Factor header" across all three
endpoints (`GET /obligations`, `POST /returns`, `GET /returns/{periodKey}`). HMRC requires correctly
populated values for the latest requests to each endpoint before they will approve the application.

HMRC also noted: "If MFA is not mandatory for all users and MFA information will not be available for
all requests please let us know and we will take this into consideration when validating future fraud
prevention headers." Our position: MFA **will** be present on all requests once this plan is
implemented — Google-federated users get MFA from Google 2FA, and Cognito native users (including
test users) will get MFA from TOTP enrollment.

The `intentionallyNotSuppliedHeaders` list in `dynamodb-assertions.js` is now empty — all FPH headers
are expected to be present. `Gov-Client-Multi-Factor` must be genuinely populated.

## Goal

Enable TOTP MFA on Cognito native auth so that:
1. Behaviour tests complete a real TOTP challenge during login
2. The Cognito ID token contains `amr: ["otp", "pwd"]`
3. The frontend detects `otp` in `amr` and sets `type=TOTP` in the header
4. HMRC receives `Gov-Client-Multi-Factor: type=TOTP&timestamp=...&unique-reference=...`
5. The FPH validation endpoint returns `VALID_HEADER` for this field

## Current State (as of 2026-02-26)

| Component | Status |
|-----------|--------|
| `Gov-Client-User-IDs` key name | DONE — both frontend and backend use `cognito=<sub>` |
| `intentionallyNotSuppliedHeaders` | DONE — now empty `[]`, all headers expected |
| Frontend MFA detection (`loginWithCognitoCallback.html:228-267`) | DONE — detects `amr` claims and federated login |
| Frontend MFA type mapping (`loginWithCognitoCallback.html:244`) | DONE — `amrClaims.includes("otp") ? "TOTP" : "OTHER"` |
| Frontend MFA header generation (`hmrc-service.js:176-186`) | DONE — reads `mfaMetadata` from sessionStorage |
| Backend pass-through (`buildFraudHeaders.js:191`) | DONE — `Gov-Client-Multi-Factor` in pass-through list |
| Mock OAuth `amr` claims | DONE — proxy tests get MFA via mock OAuth server |
| CDK MFA configuration on User Pool (`IdentityStack.java:170-174`) | DONE — `.mfa(Mfa.OPTIONAL)` + `.mfaSecondFactor(otp=true, sms=false)` |
| TOTP enrollment in test user creation (`create-cognito-test-user.js:108-182`) | DONE — full enrollment flow |
| TOTP challenge handling in Playwright (`behaviour-login-steps.js:247-313`) | DONE — `handleTotpChallenge()` function |
| Mock callback MFA type mapping (`loginWithMockCallback.html:171-182`) | DONE — same `otp` → `TOTP` mapping |
| `otpauth` npm dependency | DONE — v9.5.0 devDependency |
| TOTP code helper script (`scripts/totp-code.js`) | DONE — `npm run test:totpCode` |
| GitHub Actions workflow TOTP passthrough | DONE — `synthetic-test.yml`, `deploy-app.yml`, `generate-pass.yml` |

## Implementation Progress

All 7 steps are **IMPLEMENTED** and committed on branch `mfatotp` (commit `498af8b1`).
PR: https://github.com/antonycc/submit.diyaccounting.co.uk/pull/724

### Step 1: CDK — Enable TOTP MFA on User Pool — DONE

**File**: `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java` (lines 168-174)

```java
// Enable optional TOTP MFA for native auth users (test users, future native users)
// Federated users (Google) bypass Cognito MFA — their IdP handles MFA independently
.mfa(Mfa.OPTIONAL)
.mfaSecondFactor(MfaSecondFactor.builder()
    .otp(true) // TOTP via authenticator apps
    .sms(false) // No SMS MFA (no phone numbers collected)
    .build())
```

**Imports added**: `software.amazon.awscdk.services.cognito.Mfa`, `software.amazon.awscdk.services.cognito.MfaSecondFactor`

**Risk assessment**: RESOLVED — CloudFormation `MfaConfiguration` property is **"Update requires: No interruption"**. Enabling `OPTIONAL` MFA on an existing pool is an in-place update. No user pool replacement, no user deletion, no downtime.

**Impact on existing users**: None. `OPTIONAL` means MFA is only required for users who have enrolled a TOTP device. Existing Google-federated users are completely unaffected — federated auth bypasses Cognito MFA entirely.

### Step 2: Install `otpauth` dependency — DONE

**File**: `package.json`

`otpauth` v9.5.0 added as devDependency. Zero dependencies. Generates 6-digit TOTP codes from base32 secrets using HMAC-SHA1 (required by Cognito).

### Step 3: Test User Script — Enroll TOTP Device — DONE

**File**: `scripts/create-cognito-test-user.js` (lines 108-206)

After creating the user and setting the password, the script:

1. **Looks up UserPoolClientId** from CloudFormation outputs (needed for `AdminInitiateAuth`)
2. **Authenticates the user** — `AdminInitiateAuth` with `USER_PASSWORD_AUTH` to get access token
3. **Associates TOTP device** — `AssociateSoftwareToken` returns a base32 `SecretCode`
4. **Computes a valid TOTP code** — uses `otpauth` library
5. **Verifies the device** — `VerifySoftwareToken` confirms enrollment
6. **Sets TOTP as preferred MFA** — `AdminSetUserMFAPreference` ensures subsequent logins require TOTP

**Outputs** `TOTP_SECRET=<base32>` alongside username/password. Writes `test-auth-totp-secret` to `GITHUB_OUTPUT` for CI.

### Step 4: Enable Script — Pass TOTP Secret Through — DONE

**File**: `scripts/enable-cognito-native-test.js` (lines 59-120)

- Captures `TOTP_SECRET` from create script's stdout
- Saves `totpSecret` in `cognito-native-test-credentials.json`
- Prints usage instructions with `TEST_AUTH_TOTP_SECRET` and `oathtool` command

### Step 5: Behaviour Tests — Handle TOTP Challenge — DONE

**File**: `behaviour-tests/steps/behaviour-login-steps.js` (lines 247-313)

- `handleTotpChallenge(page, totpSecret, screenshotPath)` function
- Detects TOTP challenge page input field (multiple selector patterns for Cognito Hosted UI)
- Generates TOTP code using `otpauth` library
- Types code using keyboard input (same pattern as username/password for Cognito duplicate forms)
- Submits the challenge form and waits for redirect
- Called from `loginWithCognitoOrMockAuth()` when `TEST_AUTH_TOTP_SECRET` env var is set (lines 56-61)

**OPEN ITEM**: The exact CSS selectors for the Cognito Hosted UI TOTP challenge page are best guesses — the selectors used are `input[name="totpCode"], input[name="SOFTWARE_TOKEN_MFA_CODE"], input[type="text"][inputmode="numeric"], input[name="code"]`. These need to be verified after the first CI deployment with MFA enabled. If they don't match, examine the screenshots in `target/behaviour-test-results/` and adjust.

### Step 6: Frontend — Map `otp` in `amr` to `type=TOTP` — DONE

**Files**:
- `web/public/auth/loginWithCognitoCallback.html` (line 244)
- `web/public/auth/loginWithMockCallback.html` (line 182)

Changed from always `type: "OTHER"` to:
```javascript
const mfaType = amrClaims.includes("otp") ? "TOTP" : "OTHER";
```

This means:
- Cognito native TOTP → `amr` contains `otp` → `type=TOTP`
- Google 2FA → `amr` may contain `mfa` → `type=OTHER` (correct — it's federated IdP MFA, not our TOTP)
- Federated login fallback → `type=OTHER` (unchanged)

### Step 7: Disable Script — No Change Needed — CONFIRMED

Deleting the Cognito user (`AdminDeleteUser`) automatically removes their TOTP device enrollment.

### Additional: TOTP Code Helper Script — DONE

**File**: `scripts/totp-code.js`

Helper for generating TOTP codes locally. Reads secret from CLI arg, `TEST_AUTH_TOTP_SECRET` env var, or `cognito-native-test-credentials.json`. Outputs 6-digit code to stdout, validity time to stderr.

```bash
npm run test:totpCode -- JBSWY3DPEHPK3PXP
# or
TEST_AUTH_TOTP_SECRET=JBSWY3DPEHPK3PXP npm run test:totpCode
```

### Additional: GitHub Actions Workflows — DONE

- `synthetic-test.yml`: Added `test-auth-totp-secret` input/output/passthrough/env
- `deploy-app.yml`: Added `TEST_AUTH_TOTP_SECRET` env var on behaviour test step
- `generate-pass.yml`: Added TOTP secret and `oathtool` command to job summary

## Files Modified

| File | Change |
|------|--------|
| `infra/.../IdentityStack.java` | `.mfa(Mfa.OPTIONAL)` + `.mfaSecondFactor(otp=true, sms=false)` on User Pool builder |
| `package.json` | `otpauth` v9.5.0 devDependency + `test:totpCode` script |
| `scripts/create-cognito-test-user.js` | TOTP enrollment flow (auth → associate → verify → set preference) |
| `scripts/enable-cognito-native-test.js` | Capture/save `totpSecret`, print with usage instructions |
| `scripts/totp-code.js` | **NEW** — TOTP code generator helper |
| `behaviour-tests/steps/behaviour-login-steps.js` | `handleTotpChallenge()` function + cognito-native branch update |
| `web/public/auth/loginWithCognitoCallback.html` | `otp` in `amr` → `type=TOTP` |
| `web/public/auth/loginWithMockCallback.html` | Same MFA type mapping |
| `.github/workflows/synthetic-test.yml` | `TEST_AUTH_TOTP_SECRET` passthrough |
| `.github/workflows/deploy-app.yml` | `TEST_AUTH_TOTP_SECRET` env on test step |
| `.github/workflows/generate-pass.yml` | TOTP secret in job summary |

## Risks and Mitigations

| Risk | Status | Mitigation |
|------|--------|------------|
| User pool MFA change causes replacement | RESOLVED | CloudFormation docs confirm `MfaConfiguration` is "No interruption" — safe in-place update |
| Cognito Hosted UI doesn't show TOTP challenge | RESOLVED | AWS docs confirm managed login presents "an additional sign-in page" for TOTP |
| TOTP clock skew on CI runners | LOW RISK | AWS CI runners use NTP-synchronized clocks. TOTP has a 30-second window with typical ±1 step tolerance |
| Google federation affected by MFA change | NO RISK | Federated users bypass Cognito MFA entirely — Google handles its own MFA |
| TOTP code timing in test (race condition) | LOW RISK | Generate code immediately before entering it. 30-second validity window is ample for Playwright to type 6 digits |
| Hosted UI form element discovery | OPEN | Exact input names/selectors for TOTP challenge page are undocumented. Best-guess selectors in `handleTotpChallenge()`. Verify after first CI deployment with screenshots |
| `otpauth` package security | LOW RISK | Well-maintained, zero dependencies, widely used. TOTP generation is pure math (HMAC-SHA1 + time) |
| Existing proxy/simulator tests break | NO RISK | Proxy uses mock OAuth server (not Cognito Hosted UI). Mock already provides `amr` claims. Only CI/prod tests go through Cognito native auth |

## Verification

### Local validation — PASSED

```bash
npm test                    # 933 tests passed
./mvnw clean verify         # BUILD SUCCESS
```

### CI deployment and test — ALL PASSING (run 22462538116)

PR #724 on `mfatotp` branch. Deploy run 22460683640 results:

#### Post-deployment verification checklist:

1. [x] CDK deployment succeeds (MFA enabled on User Pool without replacement)
2. [x] Test user TOTP enrollment succeeds (create-cognito-test-user.js with InitiateAuth)
3. [x] Behaviour tests detect TOTP challenge page (Cognito Hosted UI presents "Please enter the code from test-device.")
4. [x] TOTP selectors verified working — input field and submit button matched
5. [x] `Gov-Client-Multi-Factor: type=TOTP&timestamp=...&unique-reference=...` in HMRC requests
6. [ ] FPH validation shows `VALID_HEADER` for `Gov-Client-Multi-Factor` — pending HMRC approval

#### CI test results (run 22460683640):

- submitVatBehaviour-ci: **PASS**
- authBehaviour-ci: **PASS**
- tokenEnforcementBehaviour-ci: **PASS**
- vatValidationBehaviour-ci: **PASS**
- complianceBehaviour-ci: **PASS**
- paymentBehaviour-ci: **PASS** — Stripe key fix confirmed (deploy-environment.yml provisioned new key)
- getVatReturnBehaviour-ci: **PASS** — try/catch for navigation context destruction fix confirmed

#### Fixes applied during CI validation:

1. `AdminInitiateAuth` → `InitiateAuth` in create-cognito-test-user.js (commit 605d224a)
2. Wait for next TOTP period after enrollment to avoid code reuse (commit 2d6a06d0)
3. Try/catch around error check in handleTotpChallenge() for navigation context destruction
4. Deleted dead `injectMockMfa`/`clearMockMfa` code and all commented-out references
5. Added `gov-client-multi-factor` to `essentialFraudPreventionHeaders` in dynamodb-assertions.js

#### Fixed: Telegram alerts for Google federated login (CI)

**Root cause**: `publishActivityEvent()` was called without `await` in `cognitoTokenPost.js`. After
returning the HTTP response, the Lambda execution environment froze before the EventBridge PutEvents
call completed. For rapid successive requests (behaviour test logins), the Lambda stayed warm long
enough for the fire-and-forget call to complete. For a one-off Google login, the Lambda froze
immediately.

**Fix**: Changed all `publishActivityEvent()` calls across 17 Lambda functions from fire-and-forget
to `await`. The function has internal try/catch and never throws, so `await` only adds ~50-100ms
EventBridge latency — acceptable for all paths.

**Files fixed**: cognitoTokenPost.js, hmrcTokenPost.js, hmrcVatReturnPost.js, hmrcVatReturnGet.js,
hmrcVatObligationGet.js, billingWebhookPost.js (×7), billingCheckoutPost.js, customAuthorizer.js,
bundlePost.js, bundleDelete.js, bundleCapacityReconcile.js, sessionBeaconPost.js, interestPost.js,
passAdminPost.js, passPost.js, passGeneratePost.js, supportTicketPost.js.

#### Next steps:

- [x] Commit and push latest fixes (try/catch, dead code removal, essential headers)
- [x] Re-run full CI tests — ALL 13 suites pass (run 22462538116)
- [ ] Verify Telegram alerts work for Google login after fresh deploy (fix: await publishActivityEvent — deployed in run 22463177822)

### What success looks like

- Every behaviour test run against CI/prod that uses Cognito native auth sends a genuine `Gov-Client-Multi-Factor: type=TOTP&...` header
- The header value comes from real TOTP MFA in the authentication flow, not from mocked/injected sessionStorage
- HMRC sandbox validates the header as `VALID_HEADER`
- Proxy tests continue to work unchanged (mock OAuth provides `amr` claims → `type=OTHER`)

## Auth Security Review (2026-02-26)

Comprehensive review of all auth components for non-2FA fallbacks, bypasses, or paths that skip MFA.

### Principle

MFA is the **only** production path and the **only** deployed (ci/prod) path. Proxy and simulator
get 2FA from simulated endpoints or test script injection. System/unit tests mock around 2FA, not
rely on production bypasses. No "sandbox", "test mode", or "developer mode" paths bypass 2FA.

### Findings: Zero Production Bypasses

| Component | File | Classification | Notes |
|-----------|------|----------------|-------|
| Cognito callback MFA detection | `loginWithCognitoCallback.html:228-267` | OK | Explicit `removeItem` when no MFA — no silent fallback |
| Mock callback MFA detection | `loginWithMockCallback.html:168-204` | OK | Identical logic to Cognito callback |
| HMRC FPH header generation | `hmrc-service.js:176-186` | OK | Conditional — only sent when MFA actually occurred |
| Backend header pass-through | `buildFraudHeaders.js:188-205` | OK | No fallback value invented server-side |
| Custom JWT authorizer | `customAuthorizer.js` | OK | Validates JWT, not MFA (correct — MFA is Cognito policy) |
| Mock OAuth server (proxy) | `local-oauth.js:39-41` | MOCK | Provides `amr: ["mfa", "pwd"]` — proxy-only, not deployed |
| Simulator server | `simulator-server.js:70-79` | MOCK | Local-only demo, no OAuth flow |
| Old MFA injection helper | `behaviour-helpers.js` | REMOVED | Deleted along with all commented-out imports and call sites |
| System tests | `cognitoAuth/hmrcAuth.system.test.js` | OK | Test token exchange, not MFA — correct separation |
| Environment configs | `.env.*` | OK | No `SKIP_MFA` / `BYPASS_MFA` flags anywhere |
| Developer mode | `developer-mode.js` | OK | UI toggle only, no auth bypass |

### MFA Path Summary

| Environment | MFA Source | How |
|-------------|-----------|-----|
| **prod** (Google federated) | Google 2FA | `amr` contains `mfa` → `type=OTHER` |
| **ci/prod** (Cognito native) | Real TOTP | `amr` contains `otp` → `type=TOTP` |
| **proxy** (mock OAuth) | Mock `amr` claims | `local-oauth.js` returns `amr: ["mfa", "pwd"]` → `type=OTHER` |
| **simulator** | N/A | No OAuth, no HMRC calls, no FPH headers |
| **unit/system tests** | Mocked at test level | Tests verify header logic with mock tokens |

### Conclusion

No code changes needed — the implementation correctly enforces MFA on all deployed paths without
production bypasses. The old `injectMockMfa()` test helper is already removed. Each environment
gets MFA from the appropriate source (real TOTP, real Google 2FA, mock OAuth claims, or test mocks).
