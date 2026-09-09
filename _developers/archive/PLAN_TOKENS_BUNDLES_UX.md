<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Tokens, Bundles & Passes UX - Phased Delivery Plan

> **Source of truth**: `web/public/submit.catalogue.toml`
> **Previous plans**: `_developers/archive/PLAN_PASSES_V2.md`, `_developers/backlog/PLAN_PASSES_V2-PART-2.md`
> **Branch strategy**: Feature branch deployed to CI environment, validated per phase before merging.

---

## Original Request (Verbatim)

> 1. Investigate and advise if logout should force the user back through Google OIDC auth for Login (it seems to refresh the token without navigating to Google in the UI and I don't know what is the industry standard practice).
> 2. Show token cost on buttons on the activities / home / index.html and use the same behaviour as no entitlement when no tokens for metered activites (for details see the new `metered` attribute in the activities in `web/public/submit.catalogue.toml` and also see the updated token cost (0) of read operations and the special case of metered options which are zero cost.
> 3. Some tests may need updating because the guest bundles now allocate 3 tokens (not 10).
> 4. web/public/submit.catalogue.toml seems to mix up bundle `tokens` and `tokensGranted` please work out which one is used and make a recommendation which to settle on.
> 5. On the home page, show distinct bundle levelName not all bundle names on the annotation when a user does not have the requires bundles for the acitivity (the token cost should be in this same annotation if an impediment), the levelName has been newly added to `web/public/submit.catalogue.toml`.
> 6. Show all bundles without "hidden = false" exhausted or not with an annotation of their "display" requirements are not met (e.g. display = "on-pass") and we'll need to rename those to something like enable = "on-pass" when a user opens the bundles page without a pass for a Day Guest, the button to Add the Day Guest button should be disabled with an annotated explanation, then when the pass 4 words are submitted the button should change this also bleeds into a later ask and set a value on session storage when the pass has been accepted so bundles.html can enable the button, if the user was logged in the process would be add pass 4 words, add bundle, or for not logged in add pass, login, add bundle, Or for using a URL the pass 4 words are pre-populated and accepted (or not) and if accepted and logged in, the action will proceed to request the bundle.
> 7. .github/workflows/generate-pass.yml should generate an annotated qr code showing 4 words email and url and other pass details such as the target bundle, number of allowed usages of the pass. generate-pass.yml should use the underlying JS library to do this generation so that it is re-usable by the main app code and generate-pass.yml should include the QA code in the generate-pass.yml annotated notes (like the URL is now) and the extract downloadable package should include he QR code in it's image format.
> 8 Pass invitations must work while not logged in (access saved to session) where the validated pass results are stored in the browser session (e.g. what bundle it unlocked and who for) so after user logs in the pass can be rendered as enabled to be added.
> 9. When vewing bundles.html, if a bundle as been added it should appear even if the bundle was initially hidden and the bundle buttons (added or not) should state their token allocation and metered buttons their token cost.

---

## Cleaned-Up Task List

| # | Summary | Scope |
|---|---------|-------|
| 1 | **Logout & OIDC re-auth** — Implement Cognito logout endpoint redirect to invalidate session and force Google re-authentication; harden session recovery so logout is always an escape hatch from stale sessions | Frontend + Infra validation |
| 2 | **Token cost on activity buttons** — Show token cost on metered activity buttons on index.html; disable when insufficient tokens (same UX as no-entitlement); handle zero-cost metered activities that are disabled at zero balance | Frontend |
| 3 | **Verify 3-token test data** — Confirm tests are updated for day-guest allocating 3 tokens (was 10) | Tests |
| 4 | **Standardise `tokens` naming** — Rename bundle `tokens` → `tokensGranted` and activity `tokens` → `tokenCost` in TOML, services, and tests to eliminate ambiguity | Rename refactor |
| 5 | **Distinct `levelName` in upsell** — Show deduplicated `levelName` (e.g. "Guest or Pro") instead of all bundle names in activity upsell annotations; include token cost when it is an impediment | Frontend |
| 6 | **Bundle display & pass workflow** — Rename bundle `display` → `enable`; show all non-hidden bundles on bundles.html with annotations for unmet requirements; enable pass-unlocked bundles; store pass validation in sessionStorage; handle logged-in and not-logged-in flows | Frontend + TOML |
| 7 | **Annotated QR codes** — Generate SVG-based annotated QR codes showing pass code, URL, bundle, max uses, email; include in workflow summary and artifact; add image inspection test | Backend lib + workflow |
| 8 | **Pass invitations while not logged in** — Validate passes via public API before login; store validated results in sessionStorage; after login, render the unlocked bundle as enabled | Frontend |
| 9 | **Bundles page: hidden bundles & token info** — Show allocated bundles even if initially hidden; show token allocation on bundle buttons; use catalogue bundle names instead of IDs | Frontend |

---

## Related Repository Files

### Catalogue & Configuration

| File | Relevance |
|------|-----------|
| `web/public/submit.catalogue.toml` | Bundle definitions (`tokens`/`tokensGranted`, `display`/`enable`, `levelName`, `hidden`, `metered`, activity `tokens`/`tokenCost`) |
| `submit.passes.toml` | Pass type definitions (templates for generating passes) |
| `web/public/submit.env` | Client-side environment config (COGNITO_CLIENT_ID, COGNITO_BASE_URI, etc.) — overwritten during deploy |
| `web/public/submit.environment-name.txt` | Runtime environment name for environment-specific bundle filtering |

### Frontend Pages

| File | Relevance |
|------|-----------|
| `web/public/index.html:286-404` | Activity button rendering, display rules, upsell annotations (Tasks 2, 5) |
| `web/public/bundles.html` | Bundle management, pass redemption form, current bundles display (Tasks 6, 8, 9) |
| `web/public/widgets/auth-status.js:176-224` | Logout function, token balance display, sessionStorage cleanup (Tasks 1, 6) |
| `web/public/widgets/entitlement-status.js` | Activity entitlement status in header |
| `web/public/lib/services/auth-service.js` | Token expiry check, session refresh, silent re-auth (Task 1) |
| `web/public/lib/services/api-client.js` | 401 retry with token refresh, 403 handling |
| `web/public/lib/auth-url-builder.js` | Cognito/HMRC OAuth URL construction |

### Backend Services

| File | Relevance |
|------|-----------|
| `app/services/tokenEnforcement.js:30` | Token cost lookup: `activity.tokens` → `activity.tokenCost` (Task 4) |
| `app/services/productCatalog.js` | TOML parsing, bundle/activity lookups |
| `app/services/passService.js` | Pass creation, validation, redemption |
| `app/services/bundleManagement.js` | Bundle enforcement by URL path |

### Backend Lambda Functions

| File | Relevance |
|------|-----------|
| `app/functions/account/bundlePost.js:418` | Token granting with fallback `tokensGranted ?? tokens` (Task 4) |
| `app/functions/account/bundleGet.js` | Bundle API response including `tokensRemaining` |
| `app/functions/account/passGet.js` | Public pass validation endpoint (Tasks 6, 8) |
| `app/functions/account/passPost.js` | Authenticated pass redemption endpoint |
| `app/functions/auth/cognitoTokenPost.js` | Cognito token exchange (Task 1 session recovery) |

### Infrastructure

| File | Relevance |
|------|-----------|
| `infra/main/java/.../stacks/IdentityStack.java:199-206` | Cognito User Pool client config with `logoutUrls` — already registers `https://{envDomainName}/` |
| `.github/workflows/deploy-environment.yml` | Deploys IdentityStack (Cognito) — needed if logout URL config changes |
| `.github/workflows/deploy.yml:1281-1297` | Generates `web/public/submit.env` with `COGNITO_BASE_URI` and `COGNITO_CLIENT_ID` |

### QR Code & Pass Generation

| File | Relevance |
|------|-----------|
| `app/lib/qrCodeGenerator.js` | QR code generation library (Task 7) |
| `scripts/generate-pass-with-qr.js` | GitHub Actions pass generation script (Task 7) |
| `.github/workflows/generate-pass.yml` | Workflow for pass generation and QR codes (Task 7) |
| `app/lib/passphrase.js` | Four-word passphrase generator |

### Test Files

| File | Relevance |
|------|-----------|
| `app/unit-tests/services/tokenEnforcement.test.js` | Token cost and bundle token mocks (Tasks 3, 4) |
| `app/system-tests/tokenConsumption.system.test.js` | Token consumption system tests (Tasks 3, 4) |
| `web/unit-tests/token-refresh.test.js` | Token refresh and 401 retry unit tests (Task 1) |
| `behaviour-tests/auth.behaviour.test.js` | Auth flow E2E (Task 1 — extend) |
| `behaviour-tests/bundles.behaviour.test.js` | Bundle management E2E (Tasks 6, 9) |
| `behaviour-tests/passRedemption.behaviour.test.js` | Pass redemption E2E (Tasks 6, 8) |
| `behaviour-tests/tokenEnforcement.behaviour.test.js` | Token enforcement E2E (Tasks 2, 3) |
| `behaviour-tests/submitVat.behaviour.test.js` | Full VAT submission journey |
| `behaviour-tests/compliance.behaviour.test.js` | Compliance checks |

### Data Layer

| File | Relevance |
|------|-----------|
| `app/data/dynamoDbBundleRepository.js` | Bundle persistence, `tokensGranted`/`tokensConsumed` fields, `consumeToken()` |
| `app/data/dynamoDbPassRepository.js` | Pass CRUD with atomic use count |

---

## Investigation Findings

### Task 1: Logout & OIDC Re-authentication

**Current behaviour** (`web/public/widgets/auth-status.js:176-224`):
- Logout clears `cognitoAccessToken`, `cognitoIdToken`, `cognitoRefreshToken`, `userInfo`, `authState` from localStorage
- Clears HMRC/session data from sessionStorage (`hmrcAccessToken`, `pendingPass`, `postLoginRedirect`, etc.)
- Calls `window.location.reload()` — page reload, no Cognito logout endpoint
- There is **commented-out code** (lines 212-223) for Cognito logout URL redirect that was never enabled

**Why the user gets re-authenticated silently**:
- After `window.location.reload()`, `checkTokenExpiry()` in `auth-service.js:17-86` runs on page load
- The Cognito Hosted UI maintains its own browser session cookie (separate from localStorage tokens)
- Even after clearing local tokens, Cognito's session cookie is still active
- The OAuth redirect to Cognito auto-completes without showing Google because Cognito remembers the user

**Industry standard practice**: **Redirect to the Cognito logout endpoint** after clearing local state. This invalidates the Cognito hosted UI session and forces Google re-authentication on next login.

**Cognito infrastructure check**: `IdentityStack.java:205` already registers the logout URL:
```java
.logoutUrls(List.of("https://" + props.sharedNames().envDomainName + "/"))
```
The `logout_uri` is already configured for each environment. No `deploy-environment.yml` changes needed.

**Client config check**: `window.__env` (loaded from `web/public/submit.env`) provides `COGNITO_BASE_URI` and `COGNITO_CLIENT_ID`. The logout URL is:
```
https://{COGNITO_BASE_URI}/logout?client_id={COGNITO_CLIENT_ID}&logout_uri={origin}/
```

### Task 1 (continued): Session Recovery & Stale Refresh Tokens

**Observed problem**: After a deployment (particularly involving Cognito stack updates), refreshing a session sometimes fails, leaving the user in a broken state that can only be fixed by manually clearing localStorage/sessionStorage.

**Current refresh error handling** (`web/public/lib/services/auth-service.js:122-190`):
- `ensureSession()` posts to `/api/v1/cognito/token` with `grant_type=refresh_token`
- On HTTP error: logs "Failed to refresh access token" and **silently returns the stale access token** (line 179)
- On exception: returns current access token (line 188)
- The stale token is kept in localStorage — subsequent page loads try the same broken refresh

**401 retry handling** (`web/public/lib/services/api-client.js:167-187`):
- On 401 from any API call, forces `ensureSession({ force: true })`
- If refresh fails: shows "Your session has expired. Please log in again." and redirects to `/auth/login.html` after 2000ms
- But login page redirects to Cognito which may auto-complete via the stale session cookie — a loop

**The gap**: When a refresh token becomes invalid (e.g. after a Cognito pool update), the current code:
1. Tries to refresh → fails silently → keeps broken tokens
2. On next API call → 401 → tries to refresh again → fails → redirects to login
3. Login redirects to Cognito → Cognito session cookie auto-logins → same broken tokens cycle

**Recommendation — graduated response to refresh failure**:
1. **First refresh failure**: Delete the stale refresh token from localStorage, attempt a silent re-auth via Cognito session (may succeed if Cognito session is still valid). Log the event.
2. **Second consecutive refresh failure** (or if silent re-auth returns the same invalid tokens): Don't force a full logout (that would be escalating a minor issue), but surface a non-blocking UI hint: "Session issue detected. Try logging out and back in."
3. **Logout must always work as an escape hatch**: Ensure the Cognito logout endpoint redirect is enabled so that a manual logout always clears the Cognito session cookie, breaking any stale-token loop.

**Implementation in `auth-service.js`**:
```javascript
// In ensureSession(), on refresh failure:
if (!response.ok || response.status >= 400) {
  console.warn("Refresh token failed, clearing stale refresh token");
  localStorage.removeItem("cognitoRefreshToken");
  // Don't force logout — let the user continue with the stale access token
  // until it truly expires. On next page load, missing refresh token means
  // checkTokenExpiry will detect expiry and redirect to login normally.
  return currentAccessToken;
}
```

This is deliberately conservative: clear the broken refresh token so the next expiry check redirects to login cleanly, but don't trigger a forced logout for what may be a transient issue.

### Task 3: 3-Token Test Data

**Finding**: All test files have already been updated from 10 to 3 tokens for day-guest:
- `app/unit-tests/services/tokenEnforcement.test.js:24` — `{ id: "day-guest", tokens: 3 }`
- `app/system-tests/tokenConsumption.system.test.js:59` — `bundles: [{ id: "day-guest", tokens: 3 }]`

**Note**: `tokenEnforcement.behaviour.test.js` uses the test bundle (10 tokens), not day-guest. No change needed there.

### Task 4: `tokens` vs `tokensGranted` Analysis

**Current inconsistency in `web/public/submit.catalogue.toml`**:

| Bundle | Field | Value | Purpose |
|--------|-------|-------|---------|
| test | `tokens` | 10 | Initial token allocation |
| day-guest | `tokens` | 3 | Initial token allocation |
| invited-guest | `tokensGranted` | 3 | Initial token allocation |
| resident-guest | `tokensGranted` | 3 | Initial token allocation |
| resident-pro-comp | `tokensGranted` | 100 | Initial token allocation |
| resident-pro | `tokensGranted` | 100 | Initial token allocation |

Both serve the identical purpose. Backend fallback at `bundlePost.js:418`:
```javascript
const tokensGranted = catalogBundle.tokensGranted ?? catalogBundle.tokens ?? undefined;
```

**DynamoDB schema** stores `tokensGranted` and `tokensConsumed`.

**Activity `tokens` field** — different meaning entirely: cost to perform the activity.
Backend at `tokenEnforcement.js:30` already uses the variable name `tokenCost`:
```javascript
const tokenCost = activity.tokens || 0;
```

**Decision**: Standardise on `tokensGranted` for bundles (matches DynamoDB) and `tokenCost` for activities (matches the internal variable name and eliminates ambiguity).

---

## Behaviour Test Impact Analysis

All 14 behaviour test files examined. Below is the impact assessment per task, identifying whether changes hit shared test infrastructure or individual tests.

### Behaviour Test Inventory

| Test File | What It Tests | Key Selectors/Data |
|-----------|--------------|-------------------|
| `auth.behaviour.test.js` | Login, session, user data extraction, logout | Login/logout flow, localStorage, traceparent |
| `bundles.behaviour.test.js` | Bundle management: request, remove, idempotency | `button:has-text('Day Guest')`, `button:has-text('Test')`, `data-remove-bundle-id`, `tokensGranted`, `tokensConsumed` |
| `passRedemption.behaviour.test.js` | Pass create → redeem → verify → exhaust | `#passInput`, `#redeemPassBtn`, `#passStatus`, pass admin API |
| `tokenEnforcement.behaviour.test.js` | Token consumption and exhaustion | `tokensGranted`, `tokensConsumed`, `tokensRemaining`, DynamoDB `consumeToken()`, status messages |
| `submitVat.behaviour.test.js` | Full VAT submission journey | Form fields, receipt display, token count before/after |
| `postVatReturn.behaviour.test.js` | VAT POST with error scenarios | Submit button, HMRC auth, receipt, error messages |
| `getVatObligations.behaviour.test.js` | VAT obligations retrieval | VRN field, date ranges, results display |
| `getVatReturn.behaviour.test.js` | VAT return viewing | VRN field, period key, results |
| `vatValidation.behaviour.test.js` | 9-box form validation | Box fields, HTML5 validation |
| `vatSchemes.behaviour.test.js` | VAT scheme types | 9-box form, scheme data |
| `postVatReturnFraudPreventionHeaders.behaviour.test.js` | HMRC fraud headers | Headers validation, MFA injection |
| `compliance.behaviour.test.js` | Privacy, terms, accessibility content | Footer links, page content assertions |
| `help.behaviour.test.js` | Help system navigation, FAQ, support | Info icon, FAQ selectors, support modal |
| `simulator.behaviour.test.js` | Simulator journey buttons | Iframe, journey controls, status text |

### Shared Test Helpers

| Helper | Used By | Affected By Tasks |
|--------|---------|-------------------|
| `behaviour-helpers.js` | All tests | None directly |
| `behaviour-steps.js` | Most tests | None directly |
| `behaviour-login-steps.js` | Tests requiring login | Task 1 (if logout step changes) |
| `behaviour-bundle-steps.js` | Bundle/VAT tests | Tasks 4, 6, 9 (if bundle button text changes) |
| `behaviour-hmrc-vat-steps.js` | VAT tests | None directly |
| `behaviour-hmrc-steps.js` | HMRC tests | None directly |
| `behaviour-hmrc-receipts-steps.js` | Receipt tests | None directly |

### Impact Per Task

#### Task 1: Logout — `auth.behaviour.test.js`

**Current coverage** (shallow):
- Login → navigate pages → extract user sub → logout → verify logged out
- Does NOT verify Cognito session invalidation
- Does NOT test re-login after logout
- Does NOT test session recovery from stale tokens

**Changes needed**: Extend `auth.behaviour.test.js` with:
```
1. Login
2. Verify logged in
3. Logout (triggers Cognito logout redirect)
4. Verify landed on home page and is NOT logged in
5. Login again (must go through Google OIDC — verifiable in proxy/CI modes)
6. Verify logged in with fresh session
```

**Shared helper impact**: `behaviour-login-steps.js` may need a `clickLogout()` helper if one doesn't exist, and verification that the Cognito redirect completes.

**Note**: The Cognito logout redirect is an HTTP redirect to an external domain. In simulator mode, logout navigates to index.html instead (lines 203-209 in `auth-status.js`). The full logout→re-login cycle can only be tested in proxy or CI mode where real Cognito is running. For simulator mode, verify that logout at least clears tokens and shows logged-out state.

**Other tests affected**: None. No other behaviour test exercises the logout flow.

#### Task 1 (continued): Session Recovery — `auth-service.js`

**Changes needed in `web/unit-tests/token-refresh.test.js`**:
- Add test: refresh failure clears `cognitoRefreshToken` from localStorage
- Add test: after clearing refresh token, next `checkTokenExpiry` with expired token redirects to login
- Existing tests already cover 401 retry and refresh success paths

**No behaviour test changes needed** for session recovery — this is internal error handling.

#### Task 2: Token Cost on Activity Buttons — `submitVat.behaviour.test.js`, `tokenEnforcement.behaviour.test.js`

**Affected selectors**: Activity buttons on index.html currently matched by text like `button:has-text('Submit VAT')`. If button text changes to `Submit VAT (HMRC) (1 token)`, selectors using `:has-text()` with substring matching will still work (Playwright's `has-text` does substring matching). But selectors using exact text match will break.

**Tests to examine**:

| Test | Selector Pattern | Impact |
|------|-----------------|--------|
| `submitVat.behaviour.test.js` | Uses `behaviour-steps.js` for navigation, not direct button selectors on index.html | **Low** — likely navigates by URL, not button text |
| `tokenEnforcement.behaviour.test.js` | Uses `behaviour-steps.js` for navigation | **Low** — same as above |
| `bundles.behaviour.test.js` | Uses `button:has-text('Day Guest')`, `button:has-text('Test')` on bundles.html, not index.html | **None** — bundles page buttons, not activity buttons |

**Check `behaviour-steps.js`**: If it clicks buttons by exact text on index.html, those selectors need updating to account for `(N token)` suffix.

**Shared helper impact**: Examine `behaviour-steps.js` for `clickSubmitVat` or similar navigation functions that go through index.html buttons.

#### Task 4: Naming Rename — Unit/System Tests Only

**Direct changes**:
- `app/unit-tests/services/tokenEnforcement.test.js:24-42` — Rename `tokens:` to `tokenCost:` on activity mocks, `tokens:` to `tokensGranted:` on bundle mocks
- `app/system-tests/tokenConsumption.system.test.js:59-68` — Same renames

**Behaviour test impact**: None. Behaviour tests don't reference TOML field names directly. They use API responses which already return `tokensGranted` and `tokensRemaining`.

**Exception**: `tokenEnforcement.behaviour.test.js` checks `tokensGranted` in API response (already uses the correct name). No change needed.

#### Task 5: levelName in Upsell — No Test Changes

Upsell annotation text ("Requires: Guest or Pro") is not currently asserted in any behaviour test. The annotation appears below disabled buttons on index.html, but no test checks its content.

**Optional**: Add assertion in a behaviour test that the upsell text contains "Guest" or "Pro" rather than full bundle names.

#### Task 6: Bundle Display & Pass Workflow — `bundles.behaviour.test.js`, `passRedemption.behaviour.test.js`

**`bundles.behaviour.test.js`** — **Significant changes needed**:

Current test (lines 125-235):
1. Clears all bundles
2. Ensures "Test" bundle visible as requestable → **Will change**: Test bundle has `enable = "on-pass"`, so it will now appear as disabled with "Requires a pass invitation" annotation
3. Clicks `button:has-text('Test')` to request → **Will break**: Button will be disabled for `on-pass` bundles without a pass
4. Clicks `button:has-text('Day Guest')` to request → **Still works**: Day Guest has `enable = "always"`
5. Verifies `data-remove-bundle-id="test"` appears → Needs pass redemption first

**Required test flow changes**:
```
1. Navigate to bundles page
2. Verify "Test" bundle visible but disabled with "Requires a pass invitation"
3. Verify "Day Guest" bundle visible and enabled
4. Verify "Day Guest" button shows token allocation "(3 tokens)"
5. Request "Day Guest" → verify granted
6. Enter a test pass code → verify "Test" bundle becomes enabled
7. Request "Test" → verify granted
8. Verify current bundles shows both with names (not IDs) and token info
```

**`passRedemption.behaviour.test.js`** — **Moderate changes needed**:

Current test (lines 115-249):
1. Logs in, navigates to bundles
2. Verifies "test" bundle NOT visible as requestable → **Will change**: Now visible but disabled
3. Creates pass via admin API
4. Enters pass code, clicks redeem → **Still works** but now the flow is: validate pass → bundle button enables → click button
5. Verifies bundle granted

**Required test flow changes**:
```
1. Navigate to bundles page
2. Verify "Test" bundle visible but disabled
3. Create pass via admin API
4. Enter pass code in form
5. Verify "Test" bundle button becomes enabled
6. Click enabled "Test" button to request bundle
7. Verify bundle granted
```

**Shared helper `behaviour-bundle-steps.js`**: May need updates if `ensureTestBundle()` or `ensureDayGuestBundle()` directly click buttons by text that now includes token allocation counts.

#### Tasks 8: Pass While Not Logged In — `passRedemption.behaviour.test.js`

**New test scenario** to add:
```
1. Navigate to bundles.html?pass=<valid-code> (NOT logged in)
2. Verify pass is validated via GET /api/v1/pass (public endpoint)
3. Verify "Test" bundle button shows as enabled with "Log in to add" annotation
4. Click login
5. After login, verify auto-redirected back to bundles page
6. Verify pass auto-redeemed and bundle granted
```

This tests the sessionStorage persistence of `passValidation` across login.

#### Task 9: Hidden Bundles & Token Info — `bundles.behaviour.test.js`

**Changes needed**:
- After granting a pass-based bundle (which is normally hidden), verify it appears in "Your Current Bundles" section
- Verify the current bundles display shows bundle `name` from catalogue (e.g. "Test") not raw `bundleId` ("test")
- Verify token allocation info is displayed: "N tokens remaining"

### Behaviour Tests NOT Affected

These tests don't interact with the changed pages/flows and need no changes:

| Test | Why Unaffected |
|------|---------------|
| `compliance.behaviour.test.js` | Checks page content (privacy, terms, accessibility), not bundle/token UI |
| `help.behaviour.test.js` | Tests help system, FAQ, support modal — no overlap |
| `getVatObligations.behaviour.test.js` | Tests HMRC obligations API and display — no bundle/token UI |
| `getVatReturn.behaviour.test.js` | Tests VAT return viewing — no bundle/token UI |
| `vatValidation.behaviour.test.js` | Tests 9-box form validation — no bundle/token UI |
| `vatSchemes.behaviour.test.js` | Tests VAT scheme types — no bundle/token UI |
| `postVatReturnFraudPreventionHeaders.behaviour.test.js` | Tests HMRC fraud headers — no bundle/token UI |
| `simulator.behaviour.test.js` | Tests simulator iframe journeys — uses demo data with hardcoded bundles, doesn't read catalogue |

**Note on `submitVat.behaviour.test.js` and `postVatReturn.behaviour.test.js`**: These navigate through the full VAT flow including visiting index.html and bundles. If navigation uses button text matching on index.html (e.g. "Submit VAT"), the added `(1 token)` suffix could break selectors. Check `behaviour-steps.js` and `behaviour-hmrc-vat-steps.js` for how navigation to the VAT form is done — if it uses `page.goto()` with a URL rather than clicking a button, no changes needed.

---

## Compliance Test Impact Analysis

### Test Infrastructure

| Tool | What It Tests | Configuration | Requires Deployment |
|------|--------------|---------------|-------------------|
| **Pa11y** | WCAG 2.1 AA accessibility | `.pa11yci.{proxy,ci,prod}.json` — tests 28 pages | Yes (over-the-wire) |
| **axe-core** | WCAG 2.1/2.2 AA accessibility | CLI with `--tags wcag2a,wcag2aa,...` | Yes (over-the-wire) |
| **Lighthouse** | Performance & accessibility | Chrome DevTools protocol | Yes (over-the-wire) |
| **Text spacing** | WCAG 1.4.12 text spacing | `scripts/text-spacing-test.js` — tests 28 pages | Yes (over-the-wire) |
| **ESLint security** | Static code analysis | `eslint.security.config.js` | No (static) |
| **npm audit** | Dependency vulnerabilities | `package-lock.json` | No (static) |
| **retire.js** | Known vulnerable libraries | `.retireignore.json` | No (static) |
| **OWASP ZAP** | Penetration testing | `.zap-rules.tsv` — 88 rules | Yes (over-the-wire) |

### Impact Per Task

#### Task 1: Cognito Logout Redirect

**Pa11y/axe/Lighthouse**: No impact — these test page accessibility, not auth flows.

**OWASP ZAP**: No new attack surface. The logout redirect is to Cognito's own endpoint. ZAP baseline scans crawl from the home page and won't follow the logout redirect naturally.

**Requires deployment**: **Yes**. The Cognito logout redirect targets `https://{env}-auth.submit.diyaccounting.co.uk/logout`. This needs a live Cognito instance to verify:
1. The redirect URL is accepted by Cognito (registered in `logoutUrls`)
2. The Cognito session is actually invalidated
3. The `logout_uri` redirect back to `https://{env}-submit.diyaccounting.co.uk/` works

**Does NOT require `deploy-environment.yml`**: The logout URL `https://{envDomainName}/` is already registered in `IdentityStack.java:205`. No Cognito client config change needed.

**Deployment sequence**: `deploy.yml` (application stacks only) → behaviour test (`auth.behaviour.test.js`) against CI.

#### Task 2: Token Cost on Buttons

**Pa11y/axe**: The new `(N token)` text on buttons is plain text — no accessibility issues expected. Disabled buttons with `disabled` attribute already handled. However, verify that:
- Disabled buttons have sufficient colour contrast (current disabled style: `background-color: #ccc; color: #666`)
- Annotations below buttons are readable

**OWASP ZAP**: No new inputs or endpoints.

**Requires deployment**: Yes for Pa11y/axe — they test the deployed page. Static ESLint is sufficient for code review.

#### Task 5: levelName in Upsell

**Pa11y/axe**: No impact — text content change only, no structural changes.

#### Task 6: Bundle Display Changes

**Pa11y/axe**: New disabled bundle buttons and annotation text need accessibility verification:
- Disabled buttons must have `aria-disabled` or HTML `disabled` attribute
- Annotation text ("Requires a pass invitation") must be associated with the button via `aria-describedby` or adjacent text
- Colour contrast of annotation text must meet WCAG AA

**OWASP ZAP**: The new public GET `/api/v1/pass?code=...` call from the frontend is already an existing public endpoint — no new attack surface.

**Requires deployment**: Yes — Pa11y tests `bundles.html` at the deployed URL.

#### Task 7: QR Codes

**Pa11y/axe**: No impact — QR codes are generated server-side for the GitHub Actions workflow, not displayed on the website.

**ESLint security**: New code in `qrCodeGenerator.js` should pass security linting (no user input injection in SVG generation).

**Requires deployment**: Not for compliance. But requires running `generate-pass.yml` workflow to verify.

#### Task 9: Bundles Page Token Info

**Pa11y/axe**: Token allocation text on bundle buttons needs contrast verification. Same as Task 6 considerations.

### Compliance Test Schedule

| Phase | Static Tests (Pre-Deploy) | Over-the-Wire Tests (Post-Deploy) |
|-------|--------------------------|----------------------------------|
| 1 | `npm run penetration:eslint` | None needed (rename only) |
| 2 | `npm run penetration:eslint` | `npm run accessibility:pa11y-ci`, `npm run accessibility:axe-ci` (index.html button changes) |
| 3 | `npm run penetration:eslint` | `npm run accessibility:pa11y-ci`, `npm run accessibility:axe-ci` (bundles.html layout changes), `npm run penetration:zap-ci` (verify no new XSS from annotations) |
| 4 | `npm run penetration:eslint` | None needed (server-side only) |

---

## Phased Delivery

### Phase 1: Naming Standardisation (Tasks 3, 4) — COMPLETED

Foundation rename that all subsequent phases depend on.

**Completed**: commit `bd602827` on branch `cleanup`. All 706 unit/system tests pass.

Additional change not in original plan: `app/functions/account/bundleGet.js:172` also had `?? catBundle.tokens` fallback — removed.

#### Changes

**`web/public/submit.catalogue.toml`** — Bundle field rename:
- `tokens = 10` → `tokensGranted = 10` (test bundle, line 24)
- `tokens = 3` → `tokensGranted = 3` (day-guest bundle, line 53)
- Update comments at lines 54-71 to reference `tokensGranted`

**`web/public/submit.catalogue.toml`** — Activity field rename:
- `tokens = 1` → `tokenCost = 1` (submit-vat-sandbox, line 154)
- `tokens = 0` → `tokenCost = 0` (vat-obligations-sandbox, line 171)
- `tokens = 0` → `tokenCost = 0` (view-vat-return-sandbox, line 183)
- `tokens = 1` → `tokenCost = 1` (submit-vat, line 194)
- `tokens = 0` → `tokenCost = 0` (vat-obligations, line 203)
- `tokens = 0` → `tokenCost = 0` (view-vat-return, line 212)
- Update comments at lines 155-163 to reference `tokenCost`

**`web/public/submit.catalogue.toml`** — Bundle `display` → `enable` rename:
- Line 6: `display = "never"` → `enable = "never"` (default)
- Line 14: `display = "on-pass"` → `enable = "on-pass"` (test)
- Line 31: `display = "always"` → `enable = "always"` (day-guest)
- Line 78: `display = "on-pass"` → `enable = "on-pass"` (invited-guest)
- Line 100: `display = "on-pass"` → `enable = "on-pass"` (resident-guest)
- Line 114: `display = "on-pass"` → `enable = "on-pass"` (resident-pro-comp)
- Line 125: `display = "always"` → `enable = "always"` (resident-pro)

Note: Activity-level `display` (e.g. `display = "always-with-upsell"`) is unchanged.

**`app/services/tokenEnforcement.js:30`**: `activity.tokens` → `activity.tokenCost`

**`app/functions/account/bundlePost.js:418`**: Remove fallback `?? catalogBundle.tokens`

**`web/public/bundles.html:415`**: `b["display"]` → `b["enable"]`

**`app/unit-tests/services/tokenEnforcement.test.js`**:
- Lines 24-25: Bundle mocks `tokens:` → `tokensGranted:`
- Lines 30, 36, 42: Activity mocks `tokens:` → `tokenCost:`

**`app/system-tests/tokenConsumption.system.test.js`**:
- Line 59: Bundle mock `tokens:` → `tokensGranted:`
- Lines 63, 68: Activity mocks `tokens:` → `tokenCost:`

#### Behaviour Tests Affected

None. The TOML field rename is internal — all behaviour tests interact via API responses which already use `tokensGranted`.

#### Verification

```bash
npm test                                     # Unit + system tests
npm run test:submitVatBehaviour-simulator     # E2E (all 14 tests)
```

#### Deploy

Push to feature branch → `deploy.yml` deploys to CI → CI tests pass.

---

### Phase 2: Home Page UX & Logout Fix (Tasks 1, 2, 5) — COMPLETED

Activity buttons show token costs and use distinct level names. Logout properly invalidates the Cognito session. Stale refresh tokens are cleared on failure.

**Completed**: commit `dacb0b64` on branch `cleanup`. All 707 unit/system tests pass (1 new test added).

**Compliance verification** (run against CI after Phase 1 deployment `bd602827`):
- ESLint security: 0 errors (7 pre-existing warnings)
- Pa11y: 26/26 URLs passed, 0 errors
- axe WCAG 2.2: 25/25 pages tested, 0 violations
- Compliance behaviour tests: 1/1 passed

Changes implemented:
- `auth-status.js`: Replaced commented-out Cognito logout with working redirect via `window.__env`
- `auth-service.js`: `ensureSession()` now clears `cognitoRefreshToken` from localStorage on refresh failure
- `index.html`: Activity buttons show `(N token/tokens)` for metered activities; disabled with annotation when insufficient tokens or no tokens available; upsell uses distinct `levelName` (e.g. "Guest or Pro") instead of listing all bundle names
- `token-refresh.test.js`: New test verifying refresh failure clears stale refresh token
- Behaviour tests unaffected: Playwright `:has-text()` uses substring matching, so added token text doesn't break existing selectors

#### Changes

**`web/public/widgets/auth-status.js:211-223`** — Cognito logout redirect:

Uncomment the existing code and update to use `window.__env` (already available via `submit.env`):
```javascript
const env = window.__env;
if (env && env.COGNITO_BASE_URI && env.COGNITO_CLIENT_ID) {
  const logoutUrl =
    `${env.COGNITO_BASE_URI.replace(/\/$/, "")}/logout?` +
    `client_id=${env.COGNITO_CLIENT_ID}&` +
    `logout_uri=${encodeURIComponent(window.location.origin + "/")}`;
  window.location.href = logoutUrl;
} else {
  window.location.reload();
}
```

Note: Simulator mode exits before this code (line 205-209), so simulator behaviour is unchanged.

**`web/public/lib/services/auth-service.js:178-180`** — Clear stale refresh token on failure:
```javascript
if (!response.ok || response.status >= 400) {
  console.warn("Refresh token failed, clearing stale refresh token");
  localStorage.removeItem("cognitoRefreshToken");
  return currentAccessToken;
}
```

**`web/public/index.html:286-404`** — Activity button rendering:

1. Fetch token balance from `/api/v1/bundle` to get `tokensRemaining`
2. Build `bundleLevelNameMap` from catalogue `levelName` fields
3. For metered activities: append `(N token(s))` to button text
4. If `tokenCost > 0` and `tokensRemaining < tokenCost`: disable button, annotate "Insufficient tokens"
5. If `tokenCost === 0` and `metered === true` and `tokensRemaining === 0`: disable button, annotate "No tokens available"
6. Use distinct `levelName` in upsell: "Requires: Guest or Pro" (not all 5 bundle names)

#### Behaviour Tests Affected

**`auth.behaviour.test.js`** — **Extend with logout→re-login cycle**:

Current test ends at:
```
login → navigate → extract user sub → logout → verify logged out
```

Extend to:
```
login → navigate → logout → verify logged out → verify NOT silently re-authed
→ login again → verify logged in with fresh session
```

In simulator mode: verify logout navigates to index.html and clears tokens (simulator doesn't use Cognito). In proxy/CI mode: verify the Cognito redirect occurs and re-login requires going through auth provider.

**`submitVat.behaviour.test.js`** — **Check navigation selectors**:

Examine how the test navigates from index.html to the VAT submission form. If it clicks buttons by text on index.html, the `(1 token)` suffix may affect matching. If it uses `page.goto('/hmrc/vat/submitVat.html')`, no change needed.

**`tokenEnforcement.behaviour.test.js`** — **No changes expected**. Uses test bundle (10 tokens), not day-guest. Navigates via URLs not button text. Token consumption mechanics unchanged.

**`web/unit-tests/token-refresh.test.js`** — **Add test**:
- Verify refresh failure removes `cognitoRefreshToken` from localStorage

#### Compliance Tests

**Static**: `npm run penetration:eslint`

**Over-the-wire** (post-deploy):
```bash
npm run accessibility:pa11y-ci-report          # index.html button text changes
npm run accessibility:axe-wcag22-ci-report     # WCAG 2.2 contrast on disabled buttons
```

#### Verification

```bash
npm test                                       # Unit tests + token-refresh tests
npm run test:submitVatBehaviour-simulator       # E2E (simulator — logout = navigate to index)
```

#### Deploy

Push → `deploy.yml` deploys to CI → then:
```bash
npm run test:submitVatBehaviour-ci             # Verify logout redirect against live Cognito
npm run test:authBehaviour-ci                  # Extended auth test against live Cognito
npm run accessibility:pa11y-ci-report          # Accessibility on deployed pages
```

---

### Phase 3: Bundles Page & Pass Flow (Tasks 6, 8, 9) — COMPLETED

Major rework of the bundles page to show all non-hidden bundles with pass workflow.

**Completed**: on branch `cleanup`. All 570 unit tests pass. All 3 simulator behaviour tests pass (submitVat, bundle, passRedemption).

Changes implemented:
- `bundles.html`: Full rework — shows all non-hidden bundles with enable state annotations; on-pass bundles disabled with "Requires a pass invitation" until pass validated; validate-first pass flow (GET then click to POST); token allocation shown on buttons; catalogue names in current bundles; `data-disabled-reason` attribute for structurally-disabled buttons to distinguish from grant-disabled
- `auth-status.js`: Added `sessionStorage.removeItem("passValidation")` in logout cleanup
- `behaviour-bundle-steps.js`: Updated selectors for substring matching (buttons now include token labels)
- `passRedemption.behaviour.test.js`: Updated for validate-first flow — verifies Test bundle visible but disabled, validates pass, then clicks enabled button

#### Changes

**`web/public/bundles.html:412-433`** — Bundle catalogue rendering:

Remove the `enable !== "on-pass"` filter. New logic:
```
For each catalogue bundle (not automatic, not hidden=true, env-filtered):
  If enable = "on-pass" AND no passValidation in sessionStorage for this bundle:
    → Disabled button with annotation "Requires a pass invitation"
  If enable = "on-pass" AND passValidation in sessionStorage matches this bundleId:
    → Enabled button (clicking triggers pass redemption + bundle grant)
  If enable = "always":
    → Enabled button (existing behaviour)
  If enable = "on-subscription":
    → Button with "Subscription required" annotation
  If enable = "never":
    → Hidden
  Already allocated:
    → "Added ✓" (existing behaviour)
```

**`web/public/bundles.html:313-332`** — `cardHtml()` function:
- Show `tokensGranted` from catalogue on bundle buttons: "Request Day Guest (3 tokens)"
- Show disabled state with annotation for bundles requiring a pass

**`web/public/bundles.html:436-486`** — `renderCurrentBundles()`:
- Look up bundle `name` from catalogue instead of raw `bundleId`
- Show all allocated bundles regardless of `hidden` or `enable` flags

**`web/public/bundles.html:579-710`** — Pass validation and sessionStorage:

Enhanced pass flow:
1. User enters pass (form or `?pass=` URL)
2. Call GET `/api/v1/pass?code=...` (public, no auth) to validate
3. If valid: store `passValidation` in sessionStorage, re-render bundle list
4. If logged in: clicking bundle triggers pass redemption + bundle grant
5. If not logged in: annotate "Log in to add this bundle", save `pendingPass`
6. After login: `pendingPass` triggers auto-redemption, clear `passValidation`

**`web/public/widgets/auth-status.js:197`** — Add `sessionStorage.removeItem("passValidation")`

#### Behaviour Tests Affected

**`bundles.behaviour.test.js`** — **Significant rework**:

The current test expects to directly request the "Test" bundle. With `enable = "on-pass"`, the Test bundle will be disabled until a pass is validated. Test must be restructured:

```
1. Navigate to bundles page
2. Verify "Test" bundle visible but disabled (annotation: "Requires a pass invitation")
3. Verify "Day Guest" bundle visible and enabled with "(3 tokens)"
4. Request Day Guest → verify granted
5. Create test pass via admin API
6. Enter pass code in form → verify Test bundle enables
7. Request Test → verify granted
8. Verify current bundles shows both with names and token info
9. Remove Day Guest → verify removed
10. Re-request Day Guest → verify re-granted (idempotency)
```

**`passRedemption.behaviour.test.js`** — **Moderate changes**:

Current test verifies "test" bundle not visible. Now it should verify visible but disabled, then enabled after pass entry.

```
1. Navigate to bundles page
2. Verify "Test" bundle disabled with "Requires a pass invitation"
3. Create pass via admin API
4. Enter pass code → verify Test bundle becomes enabled
5. Click Test bundle button → verify redeemed and granted
6. Verify pass status shows success
7. Test pass exhaustion with second pass attempt
```

**New test scenario in `passRedemption.behaviour.test.js`** — Pass while not logged in:

```
1. Navigate to bundles.html?pass=<valid-code> (NOT logged in)
2. Verify pass validated (status message)
3. Verify Test bundle shows as enabled with "Log in to add" annotation
4. Login
5. Verify redirected back to bundles page
6. Verify bundle auto-granted
```

#### Compliance Tests

**Static**: `npm run penetration:eslint`

**Over-the-wire** (post-deploy):
```bash
npm run accessibility:pa11y-ci-report          # bundles.html layout changes
npm run accessibility:axe-wcag22-ci-report     # Disabled buttons, annotations
npm run penetration:zap-ci                     # Verify no XSS from annotation text
```

#### Verification

```bash
npm test                                       # Unit tests
npm run test:submitVatBehaviour-simulator       # E2E (all tests, focus on bundles + pass)
```

#### Deploy

Push → `deploy.yml` deploys to CI → then:
```bash
npm run test:submitVatBehaviour-ci
npm run accessibility:pa11y-ci-report
npm run accessibility:axe-wcag22-ci-report
```

---

### Phase 4: Annotated QR Codes (Task 7) — COMPLETED

SVG-based annotated QR codes for pass generation.

**Completed**: on branch `cleanup`. All 714 unit tests pass (7 new tests).

Changes implemented:
- `qrCodeGenerator.js`: Added `generateAnnotatedPassQrCodeSvg()` — generates self-contained SVG with embedded QR code and text annotations (pass code, URL, bundle, max uses, validity, email). Includes `escapeXml()` for safe SVG text insertion.
- `qrCodeGenerator.test.js`: 7 new tests for annotated SVG generation (valid SVG structure, annotation content, optional fields, XML escaping, nested SVG for QR, error handling)
- `generate-pass-with-qr.js`: Now generates annotated SVG alongside plain PNG; includes base64 PNG data URI in results for inline summary display
- `generate-pass.yml`: Workflow summary now shows inline QR code images via `<img>` with data URI; artifact includes `*.svg` alongside `*.png`

#### Changes

**`app/lib/qrCodeGenerator.js`** — New functions:
- `generateAnnotatedPassQrCodeSvg({ code, url, bundleName, maxUses, email, validUntil })`: Generate QR as SVG via `QRCode.toString()`, wrap in larger SVG with text annotations
- `generateAnnotatedPassQrCodePng(params)`: Convert annotated SVG to PNG buffer (via `sharp` or similar)

**New test: `app/unit-tests/lib/qrCodeGenerator.test.js`**:
- Annotated SVG contains expected text elements (pass code, URL, bundle name, max uses)
- SVG is valid XML (parse without error)
- PNG buffer starts with PNG magic bytes (`\x89PNG`)
- PNG has expected dimensions

**New test: `app/unit-tests/lib/qrCodeImageInspection.test.js`**:
- QR code within the generated image encodes the correct URL (use `jsqr` to decode)
- Annotated text is present in SVG DOM

**`scripts/generate-pass-with-qr.js`**: Pass metadata (bundle name, max uses, email) to annotated QR generator. Save annotated SVG/PNG to `qr-codes/`.

**`.github/workflows/generate-pass.yml`**:
- Summary: Include QR as inline base64 image `![QR](data:image/png;base64,...)`
- Artifact: Include `qr-codes/*.svg` alongside `*.png`

#### Behaviour Tests Affected

None. QR code generation is server-side/CI-only, not displayed in the web application.

#### Compliance Tests

**Static only**: `npm run penetration:eslint` — verify no injection in SVG string construction.

#### Verification

```bash
npm test                                       # Unit tests including new QR tests
npm run test:submitVatBehaviour-simulator       # E2E (no changes expected)
```

#### Deploy

Push → CI deployment → manually trigger `generate-pass.yml` → verify:
- Annotated QR code visible in workflow summary
- Artifact download includes SVG and annotated PNG
- QR code scans correctly to the pass URL

---

## Files Modified (Summary)

| File | Phase | Changes |
|------|-------|---------|
| `web/public/submit.catalogue.toml` | 1 | Rename bundle `tokens` → `tokensGranted`, activity `tokens` → `tokenCost`, bundle `display` → `enable` |
| `app/services/tokenEnforcement.js` | 1 | `activity.tokens` → `activity.tokenCost` |
| `app/functions/account/bundlePost.js` | 1 | Remove `?? catalogBundle.tokens` fallback |
| `app/unit-tests/services/tokenEnforcement.test.js` | 1 | Rename mock fields |
| `app/system-tests/tokenConsumption.system.test.js` | 1 | Rename mock fields |
| `web/public/bundles.html` | 1, 3 | Phase 1: `display` → `enable` reference. Phase 3: full rework |
| `web/public/index.html` | 2 | Token cost on buttons, level name in upsell |
| `web/public/widgets/auth-status.js` | 2, 3 | Phase 2: Cognito logout redirect. Phase 3: Clear `passValidation` |
| `web/public/lib/services/auth-service.js` | 2 | Clear stale refresh token on failure |
| `behaviour-tests/auth.behaviour.test.js` | 2 | Extend with logout→re-login cycle |
| `web/unit-tests/token-refresh.test.js` | 2 | Test refresh failure clears refresh token |
| `behaviour-tests/bundles.behaviour.test.js` | 3 | Rework for on-pass disabled buttons, token info |
| `behaviour-tests/passRedemption.behaviour.test.js` | 3 | Rework for visible-but-disabled, add not-logged-in test |
| `app/lib/qrCodeGenerator.js` | 4 | Add annotated SVG/PNG generation |
| `app/unit-tests/lib/qrCodeGenerator.test.js` | 4 | New: annotated QR tests |
| `app/unit-tests/lib/qrCodeImageInspection.test.js` | 4 | New: QR decode + PNG validation |
| `scripts/generate-pass-with-qr.js` | 4 | Pass metadata to annotated QR generator |
| `.github/workflows/generate-pass.yml` | 4 | Inline QR in summary, SVG in artifact |

## What Already Exists (Reuse)

| Component | File | Reuse |
|-----------|------|-------|
| QR code generation (data URL, buffer, text) | `app/lib/qrCodeGenerator.js` | Extend with annotated variants |
| Pass details builder | `app/lib/qrCodeGenerator.js:116-138` | Reuse for annotation metadata |
| Pass validation (public, no auth) | `app/functions/account/passGet.js` | Call from frontend for pre-login validation |
| Pass redemption with bundle grant | `app/functions/account/passPost.js` | Existing flow, no changes needed |
| `pendingPass` sessionStorage pattern | `web/public/bundles.html:583,627,694` | Extend with `passValidation` |
| Bundle capacity check | `web/public/bundles.html:318-319` | Reuse `bundleCapacityAvailable` |
| Token balance display | `web/public/widgets/auth-status.js:14-104` | Reuse `tokensRemaining` from bundle API |
| TOML parser | `web/public/lib/toml-parser.js` | Already loaded on both pages |
| Request cache | `web/public/lib/request-cache.js` | Already used for bundle API calls |
| Cognito logout URL config | `IdentityStack.java:205` | Already registered, no infra change needed |
| Client env config (`window.__env`) | `web/public/submit.env` | Already has `COGNITO_BASE_URI` and `COGNITO_CLIENT_ID` |
| Token refresh unit tests | `web/unit-tests/token-refresh.test.js` | Extend with failure case |
