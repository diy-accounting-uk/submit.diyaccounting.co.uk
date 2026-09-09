<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

## Goals

- **Support all VAT API operations** – add back‑end handlers for retrieving obligations, viewing submitted returns, retrieving liabilities, payments and penalties:contentReference[oaicite:17]{index=17}.
- **Design dedicated pages** – create user‑friendly pages for obligations, view return, liabilities, payments and penalties.  Pages must include forms for input and display results in tables, respecting entitlements and providing clear error feedback.
- **Test all HMRC scenarios** – allow passing `Gov‑Test‑Scenario` headers so that developers can simulate sandbox scenarios like “none met”, “one met” or “two met” obligations:contentReference[oaicite:18]{index=18}.
- **Leverage client generation** – consider generating a client from the OpenAPI specification using `openapi-generator-cli` to ensure parameter names and response types match HMRC’s API.
- **Maintain existing submission flow** – preserve `submitVat.js` functionality and tests:contentReference[oaicite:19]{index=19}.

## Current state

Only `submitVat.js` exists for submitting returns.  There are no endpoints or pages for retrieving obligations or other VAT data.  The product catalogue defines `vat-obligations-sandbox`, `vat-obligations`, `submit-vat-sandbox` and `submit-vat` activities:contentReference[oaicite:20]{index=20}, and the backlog calls for guarding them:contentReference[oaicite:21]{index=21}.  HMRC’s VAT API documentation lists all required operations and test scenarios:contentReference[oaicite:22]{index=22}:contentReference[oaicite:23]{index=23}.

## Implementation plan

### Back‑end functions

1. **getVatObligations.js** – Extract `vrn`, optional `from`, `to`, `status` and `Gov-Test-Scenario`.  Build a GET request to `/organisations/vat/{vrn}/obligations`.  In stubbed mode (controlled by `TEST_VAT_OBLIGATIONS`), return static JSON.  Otherwise call HMRC, adding the necessary fraud‑prevention headers and the `Gov-Test-Scenario` header.  Return the list of obligations.
2. **getVatReturn.js** – Accept `vrn` and `periodKey`.  Call `/organisations/vat/{vrn}/returns/{periodKey}` and return the response.  If HMRC returns 404, propagate it.  In stubbed mode, read from `TEST_VAT_RETURN`.
3. **getVatLiability.js** – Accept `vrn` and optional `taxYear`.  Call `/organisations/vat/{vrn}/liabilities`.  Map the response into a simplified array of liabilities.
4. **getVatPayment.js** – Accept `vrn` and optional filters (start, end).  Call `/organisations/vat/{vrn}/payments` and return payments.
5. **getVatPenalties.js** – Accept `vrn` and optional period.  Call `/organisations/vat/{vrn}/penalties`.  Support `Gov‑Test‑Scenario` to simulate penalty scenarios.
6. **Common utilities** – Factor out request construction, including base URI selection (`HMRC_BASE_URI`), adding the access token from Cognito, and attaching fraud‑prevention headers.  Use environment variables for timeouts.
7. **Routing** – Register each handler under `/api/vat/…` in `server.js`, guarded by `requireActivity('vat-obligations')` or `requireActivity('submit-vat')` as appropriate.  Update CDK to create the corresponding `Function` and `FunctionUrl` resources.
8. **Stubbed environment variables** – Add `TEST_VAT_OBLIGATIONS`, `…VAT_RETURN`, `…VAT_LIABILITY` etc.  Provide sample JSON in `app/test/stubs/vat/*.json`.

### Front‑end pages

1. **vatObligations.html** – Provide a form to Enter VAT registration number and optional date range/status.  Include a dropdown for `Gov‑Test‑Scenario` (only displayed when running against the sandbox).  On submit, call `/api/v1/hmrc/vat/obligation` and display a table: columns for `periodKey`, `start`, `end`, `due`, `status`.  Provide links to view or submit returns for each obligation.
2. **viewVatReturn.html** – Accept query parameters `vrn` and `periodKey`.  Fetch `/api/v1/hmrc/vat/return/{periodKey}` and render fields like `vatDueSales`, `totalVatDue`.  Provide a back link to obligations.
3. **vatLiability.html**, **vatPayment.html**, **vatPenalties.html** – Each page should accept relevant parameters, call the corresponding API and display results.  Include notes when no data is returned.
4. **Entitlements integration** – Only show VAT pages when the user has the correct bundle.  Use `isActivityAllowed` at page load and redirect unauthorized users to the bundles page.

### Libraries and tooling

- **OpenAPI client generation:** Run `npx openapi-generator-cli generate -i hmrc-md-vat-api-1.0.yaml -g typescript-fetch -o app/lib/hmrcVat`.  Import the generated functions (e.g. `import { VatApi } from './lib/hmrcVat'`) in your handlers.
- **HTTP client:** If not generating a client, adopt `axios`.  Set up an instance with base URL and interceptors for headers.
- **Validation:** Use `ajv` to validate inputs (VRN length, date format) and HMRC responses against schemas from the OpenAPI spec.

## Testing & iteration strategy

1. **Stubbed mode:** Provide stubbed responses via environment variables for obligations, returns, liabilities, payments and penalties.  Use the HMRC spec examples for realistic data.
2. **Unit tests:** Write Jest tests for each handler.  Use `nock` to mock HMRC endpoints.  Assert that handlers build the correct URLs, send `Gov-Test-Scenario` headers, and handle various error conditions.
3. **Integration tests:** Use `supertest` with the Express app.  Test entitlements gating (403 when lacking `default` bundle for obligations or `guest` for returns).  Test error propagation (e.g. invalid VRN triggers 400).
4. **Playwright tests:** Extend existing e2e tests to include the new pages.  Fill out forms, submit, and verify table contents.  Test with different `Gov-Test-Scenario` values like `QUARTERLY_NONE_MET` and `QUARTERLY_ONE_MET`:contentReference[oaicite:24]{index=24}.  Validate error messages for invalid dates.
5. **Sandbox verification:** Deploy to a staging environment with HMRC sandbox credentials.  Use the Create Test User API to generate VRNs and test each endpoint.  Compare responses to the stubbed data; update stubs if HMRC modifies sample responses.
6. **Regression cycles:** After each endpoint is added, run the full test suite.  Ensure existing VAT submission tests remain green.  Use `cdk diff` to verify that infrastructure changes only affect intended resources.

## HMRC context & roll‑out

HMRC’s VAT API allows developers to retrieve obligations, submit and view returns, and retrieve liabilities, payments and penalties:contentReference[oaicite:25]{index=25}.  The sandbox environment supports scenario testing via the `Gov-Test-Scenario` header:contentReference[oaicite:26]{index=26}.  Building comprehensive support now ensures the DIY Accounting platform will remain compatible as HMRC’s MTD roll‑out expands and new features (e.g. penalty payments) become mandatory.

## Progress Update (2025-10-31)

### ✅ Completed

1. **OAuth Integration for VAT Obligations and View Return**
   - Updated `vatObligations.html` with full OAuth flow
   - Updated `viewVatReturn.html` with full OAuth flow
   - Both pages now check for `hmrcAccessToken` in sessionStorage
   - Both pages redirect to HMRC OAuth with `read:vat` scope if no token exists
   - Both pages restore form state and continue operations after OAuth callback

2. deleted

3. **Gov-Client Headers Helper**
   - Added `getGovClientHeaders()` function to submit.js
   - Builds all required HMRC fraud-prevention headers from browser environment
   - Used by both obligations and view return pages
   - Includes IP detection, user agent, device ID, timezone, screen info, etc.

4. **UI Consistency**
   - Added hamburger menu to both pages for navigation
   - Added auth-status widget showing login state
   - Added proper navigation buttons (Home, My Receipts)
   - Consistent styling with submitVat.html

5. **Testing**
   - Added 5 new unit tests for dynamic scope parameter
   - All 158 unit tests passing
   - All 28 integration tests passing
   - Tests cover:
     - Default scope behavior
     - Custom scope (read:vat, write:vat)
     - Invalid scope rejection
     - Scope combinations

### 🚧 In Progress / Future Work

1. **Entitlements Gating**
   - Apply `requireActivity()` middleware to obligations and view-return endpoints
   - Check bundle access using `bundlesForActivity()` on page load
   - Redirect unauthorized users to bundles page

2. **Common Gov-Client Headers Helper (Backend)**
   - Create `app/lib/buildGovClientHeaders.js` - Done.

3. **Environment Variables for Stubbed Data**
   - `TEST_VAT_OBLIGATIONS` already implemented
   - `TEST_VAT_RETURN` already implemented
   - Add: `TEST_VAT_LIABILITY`, `TEST_VAT_PAYMENT`, `TEST_VAT_PENALTY`

4. **Behaviour (Playwright) Tests**
   - End-to-end test for obligations journey
   - End-to-end test for view return journey
   - Test OAuth redirection flow
   - Test form state restoration after OAuth

5. **Error Handling Improvements**
   - Enhance 401 detection to trigger automatic re-authentication
   - Better error messages for HMRC API failures
   - User-friendly feedback for network issues

### Implementation Notes

- The pattern from `submitVat.html` was successfully replicated for obligations and view return
- OAuth state is stored in `sessionStorage` as `oauth_state`
- Request parameters are stored in `localStorage` as `pendingObligationsRequest` or `pendingReturnRequest`
- Current activity is tracked in `localStorage.currentActivity` for proper redirect after OAuth
- Access tokens are stored in `sessionStorage.hmrcAccessToken` (not localStorage to avoid security issues)

### Files Modified

- `web/public/submit.js` - Added `getGovClientHeaders()` helper
- `web/public/activities/vatObligations.html` - Complete OAuth integration
- `web/public/activities/viewVatReturn.html` - Complete OAuth integration
- `app/unit-tests/authUrlHandler.test.js` - Added 5 new tests

### Test Results

- Unit tests: 158/158 passing ✅
- Integration tests: 28/28 passing ✅
- All changes maintain backward compatibility
- No breaking changes to existing functionality
