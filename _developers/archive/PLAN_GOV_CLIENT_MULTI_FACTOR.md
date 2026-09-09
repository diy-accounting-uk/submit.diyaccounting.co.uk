<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Fix Gov-Client-Multi-Factor Header Missing from HMRC Requests — COMPLETE

## User Assertions (non-negotiable)

- `Gov-Client-Multi-Factor` MUST be set in all HMRC API requests from CI/prod
- Behaviour tests MUST fail if any mandatory FPH header is missing
- All headers in `essentialFraudPreventionHeaders` must be asserted against in tests
- The MFA header must carry genuine values from the authentication flow
- `unique-reference` must be stable across API calls (same user + same factor = same reference)

## Evidence

### DynamoDB scan: zero MFA headers from CI tests

791 HMRC VAT requests since 2026-02-22 — **zero** have `Gov-Client-Multi-Factor`. All 15 other
Gov-* headers present on every request. Checked via `aws --profile submit-ci dynamodb scan` on
`ci-env-hmrc-api-requests` table.

### CI test run browser console (run 22462538116, 2026-02-26T21:52:18Z)

```
[BROWSER CONSOLE log]: No MFA detected. amr: [] federated: false auth_time: [UTR]
```

Cognito returns `amr: []` in the ID token even after successful TOTP challenge completion.
The frontend checks `amr` for MFA indicators → finds nothing → removes `mfaMetadata` from
sessionStorage → `Gov-Client-Multi-Factor` header never generated.

### Manual Google login DOES produce the header

User login with `antonyccartwright@gmail.com` via Google federated auth on CI
(traceparent `00-a570e5d616ec6d053c65d86852e6bd7d-90d047013cd5d85b-01`):

7 DynamoDB records found under that trace:
- 1 OAuth token exchange (no Gov headers — expected)
- 3 VAT API calls — all have `Gov-Client-Multi-Factor: type=OTHER&timestamp=2026-02-26T23:29:07.000Z&unique-reference=efd39606-4b2d-451e-b953-c4440b715403`
- 3 FPH validation calls (`/test/fraud-prevention-headers/validate`) — same MFA header

The `isFederatedLogin && authTime` branch at `loginWithCognitoCallback.html:252` works correctly
for Google federated auth. The `identities` claim triggers it, and `auth_time` provides the
real timestamp.

### FPH validation checkbox never ticked by CI tests

`runFraudPreventionHeaderValidation` is controlled by `isSandboxMode()` which checks
`HMRC_ACCOUNT=sandbox`. This is only set in `.env.simulator` and `.env` (local proxy) —
**NOT** in `.env.ci` or `.env.prod`. So CI tests never tick the checkbox and never call
HMRC's `/test/fraud-prevention-headers/validate` endpoint.

Exception: `postVatReturnFraudPreventionHeaders.behaviour.test.js` hardcodes it to `true`.

### `unique-reference` uses random UUID (HMRC non-compliant)

Both callback pages use `crypto.randomUUID()` — a fresh random value every login. HMRC spec says:

> "unique-reference identifies a single factor. Use the same hashing function consistently so that
> this can be recognised across API calls."

The user's manual login produced `unique-reference=efd39606-4b2d-451e-b953-c4440b715403` — this
will be different on next login. HMRC expects the same value for the same user's MFA factor.

### `assertEssentialFraudPreventionHeadersPresent()` defined but never called

Function exists at `dynamodb-assertions.js:223` with 8 mandatory headers including
`gov-client-multi-factor`. No test calls it. Tests call `assertFraudPreventionHeaders()` which
checks HMRC's validation feedback endpoint, not individual request headers in DynamoDB.

## Root Causes

### 1. Cognito doesn't populate `amr` for native auth TOTP

The TOTP challenge completes successfully but the ID token has `amr: []`. The frontend MFA
detection at `loginWithCognitoCallback.html:239` checks `amr` → finds nothing → header never set.

Google federated login works because it uses the `isFederatedLogin && authTime` fallback branch
(line 252) which doesn't rely on `amr`.

### 2. `unique-reference` is random per login

`crypto.randomUUID()` at lines 248/259 in the Cognito callback and lines 186/196 in the mock
callback. Must be replaced with a stable hash.

### 3. No test guards

`assertEssentialFraudPreventionHeadersPresent()` is dead code. The simulator treats
`gov-client-multi-factor` as optional. CI tests don't tick the FPH validation checkbox.

## HMRC Spec Reference

Source: [Web App via Server — Fraud Prevention](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/web-app-via-server/)

| Field | Requirement | Example |
|-------|-------------|---------|
| `type` | `TOTP`, `AUTH_CODE`, or `OTHER` | `type=TOTP` |
| `timestamp` | UTC, minimum `yyyy-MM-ddThh:mmZ`, must include `T`, 24h format | `timestamp=2026-02-26T21:52Z` |
| `unique-reference` | Identifies a single factor. Consistent hash across API calls. Not the secret. Percent-encoded. | `unique-reference=fc4b5fd6...` |

Multiple factors comma-separated. All keys and values percent-encoded (not separators).

## Implementation Steps

### Step 1: Fix `unique-reference` to Use Stable Hash — DONE

- In both callback pages, replace `crypto.randomUUID()` with:
  ```javascript
  // Stable hash: same user + same factor = same reference across all API calls
  const encoder = new TextEncoder();
  const data = encoder.encode(idTokenPayload.sub + ":" + mfaType);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const uniqueReference = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  ```
- `sub` is an opaque UUID — no PII exposure. Same sub + same factor type = same reference.
- Files: `loginWithCognitoCallback.html`, `loginWithMockCallback.html`

### Step 2: Move `gov-client-multi-factor` to Required in Simulator — DONE

- File: `app/http-simulator/routes/fraud-headers.js`
- Move `"gov-client-multi-factor"` from `optionalHeaders` (line 31) to `requiredHeaders` (line 15)
- This ensures proxy/simulator tests fail if the header is missing

### Step 3: Wire Up Essential Header Assertions in Tests — DONE

- In each behaviour test that reads HMRC API requests from DynamoDB:
  - Call `assertEssentialFraudPreventionHeadersPresent()` on each VAT API request (not OAuth token requests)
  - Import the function from `dynamodb-assertions.js`
- Tests that need the assertion:
  - `submitVat.behaviour.test.js` — calls `assertFraudPreventionHeaders` at line 718
  - `postVatReturn.behaviour.test.js` — calls at line 489
  - `getVatObligations.behaviour.test.js` — calls at line 733
  - `getVatReturn.behaviour.test.js` — calls at line 420
  - `postVatReturnFraudPreventionHeaders.behaviour.test.js` — calls at line 547

### Step 4: Add Pre Token Generation Lambda Trigger — DONE

**Problem**: `amr` is a reserved Cognito claim — it CANNOT be added/modified via Pre Token Generation
trigger. The original plan of injecting `amr: ["pwd", "otp"]` will not work.

**Solution**: Inject a custom claim `custom:mfa_method` with value `"TOTP"` when the user has TOTP
configured. The Lambda uses `AdminGetUser` to check the user's MFA setting since Cognito doesn't
pass `cognito:preferred_mfa_setting` to the trigger event.

- Created `app/functions/auth/preTokenGeneration/index.js` (CommonJS, standalone asset-bundled Lambda)
- Created `app/unit-tests/functions/preTokenGeneration.test.js`
- Added CDK construct in `IdentityStack.java`:
  - Node.js 22 Lambda via `Code.fromAsset("../app/functions/auth/preTokenGeneration")`
  - IAM policy granting `cognito-idp:AdminGetUser` (wildcard ARN to avoid circular dependency)
  - Attached as Pre Token Generation trigger on the UserPool
- Updated `web/public/auth/loginWithCognitoCallback.html` with new MFA detection branch:
  1. Check `amr` claims → if MFA indicators → type from amr
  2. **NEW**: Check `custom:mfa_method === "TOTP"` → type TOTP (Cognito native auth)
  3. Check `isFederatedLogin && authTime` → type OTHER (Google etc.)
  4. Else → no MFA detected

### Step 5: Enable DynamoDB Assertions in CI — DONE

**Problem**: `.env.ci` had `TEST_DYNAMODB=off`, which caused ALL DynamoDB assertions to be skipped
in CI. Tests passed even though `Gov-Client-Multi-Factor` was missing because the assertions
checking for it never ran.

- Changed `.env.ci` `TEST_DYNAMODB=off` → `TEST_DYNAMODB=useExisting`
- Fixed `behaviour-tests/helpers/dynamodb-export.js` to conditionally use dummy credentials (local
  dynalite) vs default AWS SDK credential chain (real AWS DynamoDB in CI)

### Step 6: Filter DynamoDB Assertions by Test User — DONE

**Problem**: With `TEST_DYNAMODB=useExisting`, the DynamoDB export dumps ALL historical records from
the table (from ALL previous test runs). `assertFraudPreventionHeaders` iterated ALL `/validate`
records and failed on old ones that had `MISSING_HEADER` warnings for `gov-client-multi-factor`
(from before the MFA fix), even though the current test's request had the header.

- Added `filterByUserSub` parameter to `assertFraudPreventionHeaders` in `dynamodb-assertions.js`
- Function is now `async` — initializes salt lazily, hashes `userSub`, filters records by `hashedSub`
- Falls back gracefully (no filtering) if salt initialization fails
- Updated all 5 behaviour test callers to pass `userSub` and `await` the call

### Step 7: Verify Proxy Tests Still Pass — DONE

- `npm test` — 949 passed
- `npm run test:submitVatBehaviour-proxy` — 1 passed (1.9m)
- Filtering log confirmed: `Filtering fraud prevention header records by hashedSub for current test user`

### Step 8: Deploy and Verify CI — PARTIAL (deployment expired)

- Pushed `assertmfa` branch (2026-02-27)
- **Run 22496165436** (2026-02-27T17:36Z, `ci-assertmfa` — now expired, self-destructed after 2h):
  - Infrastructure deployed successfully (including PreTokenGeneration Lambda)
  - MFA header confirmed present in DynamoDB (see evidence below)
  - 9 of 11 CI behaviour tests passed. 2 failed:
    - `submitVatBehaviour-ci` and `postVatReturnFraudPreventionHeadersBehaviour-ci` both failed at
      `assertConsistentHashedSub` with `Expected OAuth requests to have a single hashedSub, but found 148`
    - Root cause: `assertConsistentHashedSub` was missed in Step 6 user-filtering fix — reads ALL
      historical records from shared DynamoDB table (148 different users' OAuth requests)
    - `assertFraudPreventionHeaders` (Step 6 fix) worked correctly — filtered by userSub as intended

#### DynamoDB Evidence from Run 22496165436

Traced the submitVatBehaviour-ci test via workflow artifact `traceparent.txt`:
- Traceparent: `00-899d08f8bbe9e24d82d4a1f13e92eef3-bfe9fce0bb3c77c0-01`
- User sub: `c6524294-b061-7063-d7e1-3964d7d3bbab`
- Hashed sub: `2db342cd8be0c8c4533c813e36cb73dc8f89e57569a061ebe62fe44070a51144`

DynamoDB scan of `ci-env-hmrc-api-requests` for this traceparent found **21 records**:
- 2x `POST /oauth/token`
- 8x `GET /obligations` (open)
- 2x `GET /obligations` (fulfilled)
- 1x `POST /vat/.../returns` (VAT return submission)
- 1x `GET /vat/.../returns/18A1` (view return)
- 7x `GET /test/fraud-prevention-headers/validate`

**`Gov-Client-Multi-Factor` IS present** on the VAT return POST:
```
type=TOTP&timestamp=2026-02-27T17%3A40%3A44.000Z&unique-reference=9bbf7ce8582da76a33341510c30be6d09683272bfca8b6155af4655534724a6e
```

All 15 other Gov-* headers also present. The MFA implementation is fully functional.
The test failure was purely the unfiltered `assertConsistentHashedSub` assertion.

### Step 9: Fix `assertConsistentHashedSub` Filtering — DONE

- `assertConsistentHashedSub` now `async`, accepts `filterByUserSub` in options
- When filtering: hashes userSub, filters authenticated requests to current user, skips OAuth
  uniqueness check (OAuth pre-auth hashedSub differs from post-auth)
- All 5 callers updated to pass `{ filterByUserSub: userSub }` and `await`
- `npm test` — 949 passed
- `npm run test:submitVatBehaviour-proxy` — 1 passed (1.9m), filtering log:
  `Filtering by hashedSub ...: 13 authenticated requests (of 15 total, 2 OAuth)`
- Committed `5a1b6f27` and pushed to `assertmfa` branch
- Push test run 22500632262: all 27 simulator jobs passed (code is sound)

### Step 10: Verify CI with Filtered Assertions — DONE

- Previous `ci-assertmfa` deployment (run 22496165436) self-destructed after 2 hours
- **Run 22501672507** (2026-02-27, `assertmfa` branch redeployment): **All 16 CI behaviour tests passed**
  - `submitVatBehaviour-ci` — PASSED (4m35s)
  - `postVatReturnFraudPreventionHeadersBehaviour-ci` — PASSED (2m54s)
  - All other 14 CI behaviour tests also passed
  - No skipped scenario tests

## Files Modified

| File | Change |
|------|--------|
| `web/public/auth/loginWithCognitoCallback.html` | Stable SHA-256 unique-reference + `custom:mfa_method` detection branch |
| `web/public/auth/loginWithMockCallback.html` | Stable SHA-256 unique-reference |
| `app/http-simulator/routes/fraud-headers.js` | Move `gov-client-multi-factor` to `requiredHeaders` |
| `behaviour-tests/helpers/dynamodb-assertions.js` | `assertFraudPreventionHeaders` + `assertConsistentHashedSub` now async with `filterByUserSub`; imports `hashSub`/`initializeSalt` |
| `behaviour-tests/helpers/dynamodb-export.js` | Conditional credentials: dummy for local dynalite, default SDK chain for real AWS |
| `behaviour-tests/submitVat.behaviour.test.js` | Call `assertEssentialFraudPreventionHeadersPresent()` + pass `userSub` to filter |
| `behaviour-tests/postVatReturn.behaviour.test.js` | Same |
| `behaviour-tests/getVatObligations.behaviour.test.js` | Same |
| `behaviour-tests/getVatReturn.behaviour.test.js` | Same |
| `behaviour-tests/postVatReturnFraudPreventionHeaders.behaviour.test.js` | Same |
| `app/functions/auth/preTokenGeneration/index.js` | **NEW** — Pre Token Generation Lambda (CommonJS, AdminGetUser) |
| `app/unit-tests/functions/preTokenGeneration.test.js` | **NEW** — Unit tests for trigger |
| `infra/.../IdentityStack.java` | Lambda function + Pre Token Generation trigger + IAM policy |
| `.env.ci` | `TEST_DYNAMODB=useExisting` (was `off`) |

## Verification

1. `npm test` — 949 passed (unit tests) ✅
2. `./mvnw clean verify` — CDK builds ✅
3. `npm run test:submitVatBehaviour-proxy` — proxy tests pass with MFA header ✅
4. Push test run 22500632262: all 27 simulator jobs passed ✅
5. DynamoDB evidence: all 21 records from run 22496165436 traceparent confirm header present ✅
6. CI deployment run 22501672507: all 16 CI behaviour tests passed ✅
7. **Prod deployment run 22510198070: all prod behaviour tests passed** ✅

### Prod Validation (2026-02-28)

DynamoDB scan of `prod-env-hmrc-api-requests` for test run traceparents (01:20–01:30 UTC, run 22510198070)
found 44 records across 5 trace IDs. All VAT API requests include `Gov-Client-Multi-Factor`:

```
Gov-Client-Multi-Factor: type=TOTP&timestamp=2026-02-28T01%3A23%3A03.000Z&unique-reference=e7e105cfaa0d1375cb5aab03fdb990900062f946fbe1b27e9f7acc6dbb07dbcc
```

HMRC fraud prevention header validation response:
```
"All headers required for your connection method have been supplied and all appear to be valid"
```
- 0 warnings, 0 errors
- All 16 Gov-* headers present including `Gov-Client-Multi-Factor`

**This plan is COMPLETE.** All user assertions satisfied:
- `Gov-Client-Multi-Factor` present in all HMRC API requests from CI and prod ✅
- Behaviour tests fail if mandatory FPH headers are missing (DynamoDB assertions enabled) ✅
- `assertEssentialFraudPreventionHeadersPresent` called in all 5 behaviour tests ✅
- MFA header carries genuine TOTP values from the authentication flow ✅
- `unique-reference` is stable (SHA-256 hash of `sub:mfaType`) ✅
