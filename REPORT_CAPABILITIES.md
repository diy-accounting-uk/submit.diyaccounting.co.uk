<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Repository Capabilities

Built 2026-09-23 from commit `174fd295`.

## Contents

- [Customer-facing site and accounts](#customer-facing-site-and-accounts)
- [HMRC filing (VAT, ITSA)](#hmrc-filing-vat-itsa)
- [Companies House filing](#companies-house-filing)
- [Billing and entitlements](#billing-and-entitlements)
- [Operations and CI](#operations-and-ci)
- [Analytics and finance](#analytics-and-finance)
- [MCP and tools](#mcp-and-tools)
- [Developer workflow](#developer-workflow)

## Customer-facing site and accounts

### Authenticate Customers via Cognito
Login pages build the Cognito hosted-UI authorization URL (`auth-url-builder.js`'s `buildCognitoAuthUrl`, also used for HMRC and Companies House OAuth) and redirect there; the Cognito and mock callback pages complete the exchange by posting the returned code to `cognitoTokenPost.js` (`POST /api/v1/cognito/token`), which also handles refresh-token exchanges. `auth-service.js` tracks token expiry and calls that endpoint to refresh the session, and the `auth-status.js` widget renders logged-in/out state, the token balance, and sends a beacon plus clears local/session storage on logout before redirecting to Cognito's own logout endpoint. A Cognito Pre Token Generation trigger (`preTokenGeneration/index.js`) adds a `custom:mfa_method` claim to a user's tokens when they have TOTP MFA set up, since Cognito does not otherwise expose that on native auth. `IdentityStack.java` provisions the Cognito User Pool, its app clients (main, books, mcp) and the Google identity provider that back this flow.
Files: web/public/auth/login.html, web/public/auth/loginWithCognitoCallback.html, web/public/auth/loginWithMockCallback.html, web/public/auth/login-mock-addon.js, web/public/auth/signed-out.html, web/public/widgets/auth-status.js, web/public/lib/auth-url-builder.js, web/public/lib/services/auth-service.js, web/public/lib/utils/jwt-utils.js, app/functions/auth/cognitoTokenPost.js, app/functions/auth/preTokenGeneration/index.js, infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/IdentityStackTest.java, app/system-tests/cognitoAuth.system.test.js, app/unit-tests/functions/cognitoTokenPost.test.js, app/unit-tests/functions/preTokenGeneration.test.js, behaviour-tests/auth.behaviour.test.js, behaviour-tests/helpers/hosted-ui-navigation.js, behaviour-tests/steps/behaviour-login-steps.js, web/unit-tests/hosted-ui-navigation.test.js, web/unit-tests/auth-url-generation.test.js, web/unit-tests/auth-logout-beacon.test.js

### Verify JWTs at the API Gateway
`customAuthorizer.js` is an API Gateway HTTP API Lambda authorizer, not Lambda@Edge: it verifies the caller's Cognito access token signature with `aws-jwt-verify`, runs a mid-session country-change check that can force a global sign-out, and reads MFA context off a companion ID token for the fraud-prevention headers built elsewhere. `jwtHelper.js` only decodes a JWT payload without checking its signature, used by already-authorized Lambda functions to read the caller's `sub`. `AuthStack.java` deploys both the authorizer Lambda and the Cognito token-exchange Lambda.
Files: app/functions/auth/customAuthorizer.js, app/lib/jwtHelper.js, infra/main/java/co/uk/diyaccounting/submit/stacks/AuthStack.java, app/system-tests/customAuthorizer.system.test.js, app/unit-tests/functions/customAuthorizer.test.js

### Capture Feedback Interest
`interestPost.js` (`POST /api/v1/interest`) publishes a "feedback engagement" notification to an SNS topic when a signed-in user clicks the join button on the homepage, keyed on the email from the JWT authorizer context; it does not calculate or charge any interest.
Files: app/functions/account/interestPost.js, app/unit-tests/functions/interestPost.test.js

### Track Visits via Session Beacon
`sessionBeaconPost.js` (`POST /api/v1/session/beacon`) classifies the visitor (human/crawler/AI agent) from the user agent and publishes a "new-session" or "logout" activity event, dropping crawler traffic. `session-beacon.js` fires the session-start beacon once per browser session; the logout beacon is sent by `auth-status.js`'s `sendLogoutBeacon`.
Files: app/functions/account/sessionBeaconPost.js, web/public/lib/session-beacon.js, app/unit-tests/functions/sessionBeaconPost.test.js

### Submit Support Tickets
`supportTicketPost.js` (`POST /api/v1/support/ticket`, no authorizer) opens a GitHub issue via a GitHub App installation token, capping each IP to 3 submissions per minute through the DynamoDB security-state table, and marks the issue as unverified since anyone can post to it. `support-api.js` is the browser counterpart: `submitSupportTicket` calls that endpoint, and `getGitHubIssueUrl`/`openGitHubIssue` offer a direct GitHub link as a fallback.
Files: app/functions/support/supportTicketPost.js, web/public/lib/support-api.js, app/unit-tests/functions/supportTicketPost.test.js, app/unit-tests/supportIssueFormCategories.test.js

### Adapt Lambda Handlers to Express Routes
`httpServerToLambdaAdaptor.js` converts an Express request into the same Lambda event shape API Gateway would produce (headers, synthesized `cloudfront-viewer-address`, decoded bearer JWT under `requestContext.authorizer.lambda`) and converts the Lambda-style result back into an Express response; `registerLambdaRoute` is the one-line helper every `apiEndpoint(app)` function uses to wire a route through it.
Files: app/lib/httpServerToLambdaAdaptor.js, app/unit-tests/httpServerToLambdaAdaptor.test.js

### Format HTTP Responses and Errors
`httpResponseHelper.js` builds the Lambda-style response objects (`http200OkResponse`, `http400BadRequestResponse`, etc.) with correlation headers merged in; `jsonErrorHandler.js` is the Express error-handling middleware that turns an uncaught throw or rejection into a JSON 500 response with the same correlation headers, instead of Express's default HTML error page.
Files: app/lib/httpResponseHelper.js, app/lib/jsonErrorHandler.js, app/unit-tests/lib/jsonErrorHandler.test.js

### Bootstrap the App Server
`app/bin/server.js` is the Express dev/local server: it registers every Lambda-style endpoint through the adaptor, serves HTTPS locally, sets the CSP header, serves the simulator build under `/sim/`, and wires mock OAuth/billing routes when running without real Cognito or Stripe. `app/bin/main.js` is an unrelated CLI stub that only logs its argv. `app/index.js` is empty (a comment only); nothing initializes there.
Files: app/index.js, app/bin/server.js, app/bin/main.js, app/unit-tests/bin/server.test.js, app/unit-tests/main.test.js

### Track and Poll Async API Requests
`dynamoDbAsyncRequestRepository.js` stores async request state (pending/processing/completed/failed) with a 1-hour TTL; `asyncApiServices.js` runs the processing (locally in dev, or via a queue) and returns a 202 for a caller to poll. `api-client.js` is the browser side: `authorizedFetch`/`fetchWithIdToken` attach the Cognito token, retry once after a forced token refresh on a 401, surface a 403 as a "you may need a bundle" message, and `executeAsyncRequestPolling` polls a 202 response with a backing-off delay until it resolves or times out.
Files: app/data/dynamoDbAsyncRequestRepository.js, app/services/asyncApiServices.js, web/public/lib/services/api-client.js, app/unit-tests/data/dynamoDbAsyncRequestRepository.test.js, app/unit-tests/services/asyncApiServices.test.js, app/system-tests/asyncRequestPersistence.system.test.js, web/unit-tests/fetch-polling.test.js

### Serve General Site Pages
Static informational pages: the homepage, about, accessibility statement, guide, help/FAQs, privacy, terms and usage (token consumption history) pages. `faqs.toml` holds the FAQ entries; `faq-search.js` does bigram fuzzy matching over them and `help-page.js` is the help page's controller (search, accordion, and the support-ticket modal that calls `support-api.js`). `IMPLEMENTATION.html` under `images/favicon/` is a reference snippet of the favicon `<link>` tags, not a served page.
Files: web/public/index.html, web/public/about.html, web/public/accessibility.html, web/public/guide.html, web/public/help.html, web/public/privacy.html, web/public/terms.html, web/public/usage.html, web/public/faqs.toml, web/public/lib/faq-search.js, web/public/lib/help-page.js, web/public/images/favicon/IMPLEMENTATION.html, behaviour-tests/help.behaviour.test.js, web/browser-tests/privacy-notice.browser.test.js, web/unit-tests/seo-validation.test.js

### Promote Sibling Products and Partners
Cross-sell pages outside the VAT-filing product itself: company background (`diy-accounting-limited.html`), the DIY Accounting Spreadsheets product (`diy-accounting-spreadsheets.html` and `spreadsheets.html`), and a PolicyBee business-insurance affiliate page (`policybee.html`).
Files: web/public/diy-accounting-limited.html, web/public/diy-accounting-spreadsheets.html, web/public/policybee.html, web/public/spreadsheets.html

### Warm Backend Routes via Prefetch Scripts
Each `prefetch-*-head.js` script issues a single `HEAD` request from the page's `<head>` (catalog, HMRC receipt, HMRC receipt name, HMRC token, mock auth URL) to warm the target Lambda/route before the page's own script needs the real response; none of them fetch or cache the response body.
Files: web/public/prefetch/prefetch-catalog-head.js, web/public/prefetch/prefetch-hmrc-receipt-head.js, web/public/prefetch/prefetch-hmrc-receipt-name-head.js, web/public/prefetch/prefetch-hmrc-token-head.js, web/public/prefetch/prefetch-mock-authurl-head.js

### Render Page Chrome and Widgets
`page-chrome.js` builds the shared header (icons, auth section), main nav and footer around each page's own static `<h1>`, leaving a fallback link in place until it has run so a script failure never strands the page. `loading-spinner.js`, `status-messages.js` and `view-source-link.js` are smaller widgets (spinner show/hide, a status-message container, and a footer link to the running commit on GitHub); `dom-utils.js` holds the underlying `showStatus`/`hideStatus` DOM helpers. `developer-mode.js` adds a header toggle, visible only to users with a synthetic test bundle, that overlays request-id/trace/deployment info.
Files: web/public/widgets/page-chrome.js, web/public/widgets/loading-spinner.js, web/public/widgets/status-messages.js, web/public/widgets/view-source-link.js, web/public/lib/utils/dom-utils.js, web/public/developer-mode.js, web/browser-tests/navigation.browser.test.js, web/browser-tests/mobileLayout.browser.test.js

### Show and Persist Cookie Consent
A consent banner (`#consent-banner`) shown on first visit gates GA4's `analytics_storage` consent (denied by default), and the visitor's accept/decline choice persists across page loads; the implementing script (`lib/analytics.js`) sits outside this file set, but the browser test in this set drives the real static site end to end against it.
Files: web/browser-tests/cookieConsent.browser.test.js

### Configure the Frontend via TOML and Env Libraries
`env-loader.js` fetches `/submit.env` at runtime and parses its `KEY=VALUE` lines into `window.envReady` (not from HTML meta tags). `feature-flags.js` fetches and caches `/submit.features.toml` and exposes `isFeatureEnabled(id)`. `request-cache.js` is an in-memory, promise-deduplicated GET cache with TTL and ETag revalidation. `toml-parser.js` is the minimal TOML parser both of the above rely on. `storage-utils.js` wraps `localStorage`/`sessionStorage` access so a quota or privacy error never throws into a caller.
Files: web/public/lib/env-loader.js, web/public/lib/feature-flags.js, web/public/lib/request-cache.js, web/public/lib/toml-parser.js, web/public/lib/utils/storage-utils.js, web/public/submit.features.toml

### Trace and Secure Client Requests
`correlation-utils.js` generates and stores a W3C `traceparent` and an `x-request-id` per session, and installs a `window.fetch` wrapper that stamps both onto same-origin requests. `crypto-utils.js` supplies the underlying random values (`generateRandomState`, `randomHex`, `sha256Hex`), used both for that tracing and for the OAuth `state` parameter in the login flow.
Files: web/public/lib/utils/correlation-utils.js, web/public/lib/utils/crypto-utils.js

### Bootstrap the Frontend Module Bundle
`submit.js` is the site's single entry point: it imports every utils/services/widgets module and assigns them onto `window` for scripts that still call them as globals.
Files: web/public/submit.js, web/unit-tests/submit.helpers.test.js

### Generate QR Codes
`qrcode.min.js` is a vendored third-party QR-code renderer (MIT-licensed, node-qrcode), used by the pass-generation pages outside this area to render a scannable code.
Files: web/public/lib/qrcode.min.js

### Map the Site Structure
`SITE_MAP.md` diagrams the page layout (header, main nav, footer) and where each page fits in it, for anyone adding or moving a page.
Files: _developers/SITE_MAP.md

### Document Business Governance and Positioning
Licensing (`LICENSING.md`: PolyForm Internal Use License plus the hosted-service grant), trademark usage (`TRADEMARKS.md`), product strategy (`STRATEGY.md`), a UK MTD-market competitor survey (`REPORT_COMPETITOR_ANALYSIS.md`) and HMRC/advertising-standards marketing copy rules (`MARKETING_GUIDANCE.md`).
Files: LICENSING.md, TRADEMARKS.md, STRATEGY.md, REPORT_COMPETITOR_ANALYSIS.md, _developers/MARKETING_GUIDANCE.md

### Log Growth Experiments
`experiments.toml` is a log of growth experiments (id, objective, hypothesis, lever, metric, start/end dates, result) that the operator dashboard draws as annotations on its metrics; it carries no API credentials or sync configuration.
Files: experiments.toml

## HMRC filing (VAT, ITSA)

### Submit a VAT return
`hmrcVatReturnPost.js`'s `ingestHandler` resolves the HMRC period key from the obligations API for the dates the customer entered, builds the 9-box (or legacy single-field) return body, and posts it to HMRC's VAT API through the async SQS worker pattern (`submitVat`, `workerHandler`). It records a receipt in DynamoDB, publishes activity events, enforces bundle/token entitlements, and blocks a resubmission of an already-filed period. `submitVat.html` is the form; the system, behaviour and frontend tests exercise the full journey across VAT schemes and 9-box validation.
Files: app/functions/hmrc/hmrcVatReturnPost.js, app/unit-tests/functions/hmrcVatReturnPost.test.js, app/unit-tests/functions/hmrcVatReturnPost.activity.test.js, app/unit-tests/functions/hmrcVatReturnPost.worker.test.js, app/system-tests/hmrcVatJourney.system.test.js, app/system-tests/hmrcVatScenarios.system.test.js, app/system-tests/vatValidation.test.js, behaviour-tests/postVatReturn.behaviour.test.js, behaviour-tests/postVatReturnFraudPreventionHeaders.behaviour.test.js, behaviour-tests/vatSchemes.behaviour.test.js, behaviour-tests/vatValidation.behaviour.test.js, behaviour-tests/submitVat.behaviour.test.js, behaviour-tests/steps/behaviour-hmrc-vat-steps.js, web/public/hmrc/vat/submitVat.html, web/unit-tests/vatFlow.frontend.test.js, web/public/prefetch/prefetch-hmrc-vat-return-head.js

### Retrieve a submitted VAT return
`hmrcVatReturnGet.js` calls HMRC's VAT API to read back a return already filed for a period key. `viewVatReturn.html` displays it to the customer, including a status-clear case with no outstanding issues.
Files: app/functions/hmrc/hmrcVatReturnGet.js, app/unit-tests/functions/hmrcVatReturnGet.test.js, behaviour-tests/getVatReturn.behaviour.test.js, web/public/hmrc/vat/viewVatReturn.html, web/browser-tests/view-vat-return.browser.test.js, web/browser-tests/viewVatReturn.statusClear.browser.test.js, web/public/prefetch/prefetch-hmrc-vat-return-get-head.js

### Retrieve VAT obligations
`hmrcVatObligationGet.js`'s `getVatObligations` lists open and fulfilled VAT filing periods from HMRC for a date range; `hmrcVatReturnPost.js` also calls it directly to resolve a period key. `vatObligations.html` shows due dates and status, including the 403 case from an expired or invalid HMRC token.
Files: app/functions/hmrc/hmrcVatObligationGet.js, app/unit-tests/functions/hmrcVatObligationGet.test.js, app/system-tests/hmrcVatObligationJourney.system.test.js, behaviour-tests/getVatObligations.behaviour.test.js, web/public/hmrc/vat/vatObligations.html, web/browser-tests/vatObligations.error403.browser.test.js, web/public/prefetch/prefetch-hmrc-vat-obligation-head.js

### Retrieve VAT liabilities
`hmrcVatLiabilitiesGet.js` calls HMRC's VAT Liabilities API for the amount owed or refunded over a date range; `vatLiabilities.html` displays the figures.
Files: app/functions/hmrc/hmrcVatLiabilitiesGet.js, app/unit-tests/functions/hmrcVatLiabilitiesGet.test.js, behaviour-tests/getVatLiabilities.behaviour.test.js, web/public/hmrc/vat/vatLiabilities.html

### Retrieve VAT payments
`hmrcVatPaymentsGet.js` calls HMRC's VAT Payments API to list payments HMRC has recorded against the VAT account for a date range; `vatPayments.html` displays them.
Files: app/functions/hmrc/hmrcVatPaymentsGet.js, app/unit-tests/functions/hmrcVatPaymentsGet.test.js, behaviour-tests/getVatPayments.behaviour.test.js, web/public/hmrc/vat/vatPayments.html

### Retrieve VAT penalties
`hmrcVatPenaltiesGet.js` calls HMRC's VAT Penalties API for penalties applied to the VAT account; `vatPenalties.html` displays them.
Files: app/functions/hmrc/hmrcVatPenaltiesGet.js, app/unit-tests/functions/hmrcVatPenaltiesGet.test.js, behaviour-tests/getVatPenalties.behaviour.test.js, web/public/hmrc/vat/vatPenalties.html

### Build and validate 9-box VAT return data
`vatReturnTypes.js` holds the HMRC 9-box field configuration, calculates Box 3 (`totalVatDue`) and Box 5 (`netVatDue`) from the boxes the customer enters, validates monetary and whole-number fields, and builds the HMRC-shaped request body from either the 9-box or the legacy single-field (`vatDue`) form. `hmrcVatReturnPost.js` is its only caller.
Files: app/lib/vatReturnTypes.js, app/unit-tests/lib/vatReturnTypes.test.js

### Parse VAT returns from a bulk CSV file
`vatReturnCsv.js` parses a CSV file against the `_developers/CSV_VAT_RETURN_CONTRACT.md` contract into an array of 9-box VAT return objects (the same field names `vatReturnTypes.js` builds for HMRC submission, plus `vrn`/`periodStart`/`periodEnd`), throwing a `VatReturnCsvError` with a named `reason` for each rejected row.
Files: app/lib/vatReturnCsv.js, app/unit-tests/lib/vatReturnCsv.test.js, _developers/CSV_VAT_RETURN_CONTRACT.md

### Retrieve ITSA business details
`hmrcItsaBusinessDetailsGet.js` calls HMRC's Business Details API to list a taxpayer's self-employment and UK property businesses by NINO. `dashboard.html` is the entry point that runs this lookup to build a business picker before routing into the rest of the ITSA journey; `businessDetails.html` shows the details directly.
Files: app/functions/hmrc/hmrcItsaBusinessDetailsGet.js, app/unit-tests/functions/hmrcItsaBusinessDetailsGet.test.js, web/public/hmrc/itsa/businessDetails.html, web/public/hmrc/itsa/dashboard.html, web/browser-tests/itsaDashboard.browser.test.js, web/browser-tests/businessDetails.browser.test.js, web/browser-tests/usageItsaYearCost.browser.test.js, behaviour-tests/itsaBusinessDetails.behaviour.test.js

### Retrieve ITSA obligations
`hmrcItsaObligationsGet.js` calls HMRC's Obligations API to list ITSA filing obligations (quarterly updates, annual submission, final declaration) for a business; `obligations.html` displays due dates and status.
Files: app/functions/hmrc/hmrcItsaObligationsGet.js, app/unit-tests/functions/hmrcItsaObligationsGet.test.js, web/public/hmrc/itsa/obligations.html, web/browser-tests/obligations.browser.test.js, behaviour-tests/itsaObligations.behaviour.test.js

### Retrieve ITSA status
`hmrcItsaStatusGet.js` calls HMRC's ITSA Status API to check whether a taxpayer is enrolled in Making Tax Digital for the given tax year. No dedicated page consumes it in this file set.
Files: app/functions/hmrc/hmrcItsaStatusGet.js, app/unit-tests/functions/hmrcItsaStatusGet.test.js

### Submit and manage self-employment periodic updates
Four Lambdas (`hmrcItsaSelfEmploymentPeriodPost/Get/Put/PeriodsGet.js`) create, read, amend and list quarterly (or, from tax year 2025-26, cumulative) self-employment income and expense updates against HMRC's Self Employment Business API. `web/public/lib/itsaSubmissionModel.js` mirrors `resolveItsaSubmissionModel` from `hmrcValidation.js` on the client so a period page picks dated-quarter or cumulative-total behaviour before the request reaches the handler. Four pages (entry, amend, view, list) drive the journey, and the http-simulator route mirrors the same behaviour for local development.
Files: app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js, app/functions/hmrc/hmrcItsaSelfEmploymentPeriodGet.js, app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPut.js, app/functions/hmrc/hmrcItsaSelfEmploymentPeriodsGet.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPost.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPost.activity.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodGet.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPut.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPut.activity.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodsGet.test.js, app/unit-tests/http-simulator/routes/itsa-self-employment-period.test.js, web/public/hmrc/itsa/selfEmploymentPeriod.html, web/public/hmrc/itsa/selfEmploymentPeriodAmend.html, web/public/hmrc/itsa/selfEmploymentPeriodView.html, web/public/hmrc/itsa/selfEmploymentPeriods.html, web/browser-tests/selfEmploymentPeriod.browser.test.js, web/browser-tests/itsaCumulativeModel.browser.test.js, behaviour-tests/itsaSelfEmploymentPeriod.behaviour.test.js, web/public/lib/itsaSubmissionModel.js

### Submit and manage the self-employment annual summary
`hmrcItsaSelfEmploymentAnnualGet.js` and `hmrcItsaSelfEmploymentAnnualPut.js` read and submit the year-end self-employment annual summary (allowances, adjustments) to HMRC. `annualSubmission.html` loads and edits it, including importing figures from a prior year.
Files: app/functions/hmrc/hmrcItsaSelfEmploymentAnnualGet.js, app/functions/hmrc/hmrcItsaSelfEmploymentAnnualPut.js, app/unit-tests/functions/hmrcItsaSelfEmploymentAnnualGet.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentAnnualPut.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentAnnualPut.activity.test.js, web/public/hmrc/itsa/annualSubmission.html, web/browser-tests/annualSubmission.browser.test.js, web/browser-tests/annualSubmission.import.browser.test.js, behaviour-tests/itsaAnnualSubmission.behaviour.test.js

### Submit and manage UK property periodic updates
Four Lambdas (`hmrcItsaUkPropertyPeriodPost/Get/Put/PeriodsGet.js`) create, read, amend and list periodic UK property (rental) income and expense updates against HMRC's UK Property Business API, sharing the dated/cumulative model split with the self-employment periods. Four pages (entry, amend, view, list) drive the journey.
Files: app/functions/hmrc/hmrcItsaUkPropertyPeriodPost.js, app/functions/hmrc/hmrcItsaUkPropertyPeriodGet.js, app/functions/hmrc/hmrcItsaUkPropertyPeriodPut.js, app/functions/hmrc/hmrcItsaUkPropertyPeriodsGet.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodPost.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodPost.activity.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodGet.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodPut.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodPut.activity.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodsGet.test.js, web/public/hmrc/itsa/ukPropertyPeriod.html, web/public/hmrc/itsa/ukPropertyPeriodAmend.html, web/public/hmrc/itsa/ukPropertyPeriodView.html, web/public/hmrc/itsa/ukPropertyPeriods.html, behaviour-tests/itsaUkPropertyPeriod.behaviour.test.js

### Submit and manage the UK property annual summary
`hmrcItsaUkPropertyAnnualGet.js` and `hmrcItsaUkPropertyAnnualPut.js` read and submit the year-end UK property annual summary to HMRC. `ukPropertyAnnualSubmission.html` loads and edits it.
Files: app/functions/hmrc/hmrcItsaUkPropertyAnnualGet.js, app/functions/hmrc/hmrcItsaUkPropertyAnnualPut.js, app/unit-tests/functions/hmrcItsaUkPropertyAnnualGet.test.js, app/unit-tests/functions/hmrcItsaUkPropertyAnnualPut.test.js, app/unit-tests/functions/hmrcItsaUkPropertyAnnualPut.activity.test.js, web/public/hmrc/itsa/ukPropertyAnnualSubmission.html, behaviour-tests/itsaUkPropertyAnnualSubmission.behaviour.test.js

### Trigger and adjust the Business Source Adjustable Summary
`hmrcItsaBsasTriggerPost.js` triggers HMRC's year-end Business Source Adjustable Summary calculation for either income type via `typeOfBusiness`; `hmrcItsaBsasSelfEmploymentGet.js`/`hmrcItsaBsasSelfEmploymentAdjustPost.js` and `hmrcItsaBsasUkPropertyGet.js`/`hmrcItsaBsasUkPropertyAdjustPost.js` read and adjust the resulting figures per income type. `adjustments.html` (self-employment) and `ukPropertyAdjustments.html` (UK property) trigger the summary, show HMRC's calculated figures, and submit an adjustment.
Files: app/functions/hmrc/hmrcItsaBsasTriggerPost.js, app/functions/hmrc/hmrcItsaBsasSelfEmploymentGet.js, app/functions/hmrc/hmrcItsaBsasSelfEmploymentAdjustPost.js, app/functions/hmrc/hmrcItsaBsasUkPropertyGet.js, app/functions/hmrc/hmrcItsaBsasUkPropertyAdjustPost.js, app/unit-tests/functions/hmrcItsaBsasTriggerPost.test.js, app/unit-tests/functions/hmrcItsaBsasSelfEmploymentGet.test.js, app/unit-tests/functions/hmrcItsaBsasSelfEmploymentAdjustPost.test.js, app/unit-tests/functions/hmrcItsaBsasUkPropertyGet.test.js, app/unit-tests/functions/hmrcItsaBsasUkPropertyAdjustPost.test.js, web/public/hmrc/itsa/adjustments.html, web/public/hmrc/itsa/ukPropertyAdjustments.html, web/browser-tests/adjustments.browser.test.js

### Manage ITSA losses and claims
`hmrcItsaLossesAndClaimsGet/Put/Delete.js` read, submit and delete losses and relief claims against HMRC's Losses and Claims API. `lossesAndClaims.html` loads existing entries and edits them.
Files: app/functions/hmrc/hmrcItsaLossesAndClaimsGet.js, app/functions/hmrc/hmrcItsaLossesAndClaimsPut.js, app/functions/hmrc/hmrcItsaLossesAndClaimsDelete.js, app/unit-tests/functions/hmrcItsaLossesAndClaims.test.js, app/unit-tests/functions/hmrcItsaLossesAndClaimsPut.activity.test.js, app/unit-tests/functions/hmrcItsaLossesAndClaimsDelete.activity.test.js, web/public/hmrc/itsa/lossesAndClaims.html, web/browser-tests/itsaLossesAndClaims.browser.test.js, behaviour-tests/itsaLossesAndClaims.behaviour.test.js

### Manage ITSA tax liability adjustments
`hmrcItsaTaxLiabilityAdjustmentsGet/Put/Delete.js` read, submit and delete manual adjustments to a taxpayer's calculated tax liability. `taxLiabilityAdjustments.html` is the form.
Files: app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsGet.js, app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsPut.js, app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsDelete.js, app/unit-tests/functions/hmrcItsaTaxLiabilityAdjustments.test.js, app/unit-tests/functions/hmrcItsaTaxLiabilityAdjustmentsPut.activity.test.js, app/unit-tests/functions/hmrcItsaTaxLiabilityAdjustmentsDelete.activity.test.js, web/public/hmrc/itsa/taxLiabilityAdjustments.html

### Calculate ITSA tax liability
`hmrcItsaCalculationTriggerPost.js` triggers HMRC's tax calculation for a tax year; `hmrcItsaCalculationGet.js` retrieves the result. `taxCalculation.html` runs the calculation and shows income, relief and liability.
Files: app/functions/hmrc/hmrcItsaCalculationTriggerPost.js, app/functions/hmrc/hmrcItsaCalculationGet.js, app/unit-tests/functions/hmrcItsaCalculationTriggerPost.test.js, app/unit-tests/functions/hmrcItsaCalculationGet.test.js, web/public/hmrc/itsa/taxCalculation.html, web/browser-tests/taxCalculation.browser.test.js

### Retrieve ITSA crystallisation obligations
`hmrcItsaCrystallisationObligationsGet.js` calls HMRC's Obligations API filtered to the final-declaration ("crystallisation") obligation for a tax year. No dedicated page consumes it in this file set; it is documented in the OpenAPI spec only.
Files: app/functions/hmrc/hmrcItsaCrystallisationObligationsGet.js, app/unit-tests/functions/hmrcItsaCrystallisationObligationsGet.test.js

### Submit the ITSA final declaration
`hmrcItsaFinalDeclarationPost.js` submits the taxpayer's final declaration for a tax year to HMRC, the last step that crystallises their ITSA liability. `finalDeclaration.html` carries the legal declaration checkboxes and confirmation.
Files: app/functions/hmrc/hmrcItsaFinalDeclarationPost.js, app/unit-tests/functions/hmrcItsaFinalDeclarationPost.test.js, app/unit-tests/functions/hmrcItsaFinalDeclarationPost.activity.test.js, web/public/hmrc/itsa/finalDeclaration.html, web/browser-tests/finalDeclaration.browser.test.js, behaviour-tests/itsaFinalDeclaration.behaviour.test.js

### Store and retrieve HMRC submission receipts
`hmrcReceiptGet.js` lists or fetches a customer's stored HMRC receipts (VAT and ITSA) by name/key, backed by `dynamoDbReceiptRepository.js`'s DynamoDB get/scan/put. `receipts.html` is the customer-facing receipts page.
Files: app/functions/hmrc/hmrcReceiptGet.js, app/unit-tests/functions/hmrcReceiptGet.test.js, app/data/dynamoDbReceiptRepository.js, app/unit-tests/data/dynamoDbReceiptRepository.test.js, app/system-tests/dynamoDbReceiptStore.system.test.js, web/public/hmrc/receipt/receipts.html, behaviour-tests/steps/behaviour-hmrc-receipts-steps.js

### Exchange an HMRC OAuth authorisation code for an access token
`hmrcTokenPost.js` exchanges an OAuth authorisation code for an HMRC access token via `exchangeCodeForToken`, reading the application's client secret from Secrets Manager. `submitVatCallback.html` is the redirect landing page HMRC sends the customer back to after granting permission; `hmrc-scope-check.js` checks client-side whether the token's granted scope covers the page the customer is on.
Files: app/functions/hmrc/hmrcTokenPost.js, app/unit-tests/functions/hmrcTokenPost.test.js, app/system-tests/hmrcAuth.system.test.js, web/public/activities/submitVatCallback.html, web/browser-tests/submitVatCallback.browser.test.js, web/public/lib/hmrc-scope-check.js, behaviour-tests/steps/behaviour-hmrc-steps.js

### Verify HMRC agent authorisation for a client
`hmrcAgentAuthorisation.js` calls HMRC's Agent Authorisation API to check that a practice's own access token carries a delegated relationship with a named client for a given service, such as `MTD-VAT`, so a practice can act for a client without storing the client's own credentials.
Files: app/lib/hmrcAgentAuthorisation.js, app/unit-tests/lib/hmrcAgentAuthorisation.test.js

### Build HMRC fraud-prevention headers
`buildFraudHeaders.js` constructs the `Gov-Client-*`/`Gov-Vendor-*` headers HMRC's fraud-prevention specification requires on every API call (device id, detected vendor public IP via `checkip.amazonaws.com`, product name/version, hashed subject), caching the vendor IP per Lambda cold start.
Files: app/lib/buildFraudHeaders.js, app/unit-tests/lib/buildFraudHeaders.test.js

### Monitor HMRC fraud-prevention header compliance
`fraudPreventionHeaderReport.js` parses HMRC's monthly fraud-prevention header feedback email (correct headers, advisories, errors, or zero traffic) for a reported month. `scripts/fraud-header-email-check.js` reads that email from the mail mirror, runs the parser, and alerts an operational Telegram chat when a month needs review. `scripts/compliance-fraud-headers-rows.js` turns the resulting monthly decision records into rows for a compliance dashboard.
Files: app/lib/fraudPreventionHeaderReport.js, app/unit-tests/lib/fraudPreventionHeaderReport.test.js, scripts/fraud-header-email-check.js, app/unit-tests/scripts/fraudHeaderEmailCheck.test.js, scripts/compliance-fraud-headers-rows.js, app/unit-tests/scripts/complianceFraudHeadersRows.test.js, hmrc-fraud-prevention.md

### Validate HMRC identifiers, dates and amounts
`hmrcValidation.js` validates VRNs, NINOs, UTRs, period keys, ISO dates, tax years and VAT monetary/whole amounts; resolves whether a tax year uses the dated or cumulative ITSA submission model; masks IP addresses and device ids for logging; and maps an HMRC error code to a user-facing message.
Files: app/lib/hmrcValidation.js, app/unit-tests/lib/hmrcValidation.test.js

### Format and match HMRC obligations
`obligationFormatter.js` formats a raw HMRC obligation for display without exposing its period key to the user (an HMRC requirement), matches an obligation to the date range a customer entered (`findObligationByDateRange`), and derives synthetic period keys for sandbox testing where HMRC's obligations don't line up with the dates a tester enters.
Files: app/lib/obligationFormatter.js, app/unit-tests/lib/obligationFormatter.test.js

### Call the HMRC API
`app/services/hmrcApi.js` is the server-side HTTP client every Lambda handler uses: it builds HMRC request headers and base URLs, validates the access token, issues `hmrcHttpGet/Post/Put/Delete`, and classifies HMRC error responses into the application's own 401/403/404/500 responses. `web/public/lib/services/hmrc-service.js` is its browser-side counterpart, wrapping every HMRC endpoint (VAT return, obligations, business details, self-employment, BSAS, UK property, calculation, final declaration, losses and claims, tax liability adjustments) behind one `authorizedFetch`-based client the pages call.
Files: app/services/hmrcApi.js, app/unit-tests/services/hmrcApi.test.js, web/public/lib/services/hmrc-service.js, web/unit-tests/hmrc-service.test.js

### Persist async HMRC API request state
`dynamoDbHmrcApiRequestRepository.js` is the DynamoDB repository (get/scan/put/update) behind the async request/poll pattern `hmrcApi.js` and the write-side Lambdas use for long-running HMRC calls.
Files: app/data/dynamoDbHmrcApiRequestRepository.js, app/unit-tests/data/dynamoDbHmrcApiRequestStore.test.js

### Wire HMRC Lambda handlers into CDK stacks
`HmrcStack.java` and `HmrcItsaStack.java` declare the CDK Lambda constructs (function, props, log group) for every HMRC Lambda handler above: `HmrcStack` covers the VAT endpoints, the token exchange, receipts, and most of the self-employment/BSAS/calculation/final-declaration ITSA surface; `HmrcItsaStack` covers UK property periods/annual/BSAS, losses and claims, and tax liability adjustments.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcItsaStack.java, app/unit-tests/hmrcFunctionsCdkRegistration.test.js

### Register and verify HMRC Developer Hub application config
`infra/hmrc/hmrc.toml` declares the two HMRC Developer Hub applications (sandbox, production) as code: client ids, hosts, redirect URIs and the API subscriptions each needs. `hmrc-assert.js` checks those subscriptions are still live by probing each one and treating a 403 `RESOURCE_FORBIDDEN` as a build failure rather than a customer-facing outage.
Files: infra/hmrc/hmrc.toml, infra/hmrc/hmrc-assert.js, app/unit-tests/scripts/hmrcAssert.test.js

### Drive HMRC's sandbox authorisation flow for test scripts
`hmrcAuthorizationCode.js` drives HMRC's sandbox `/oauth/authorize` sign-in page with Playwright to obtain a user-restricted authorisation code, since HMRC's user-restricted APIs have no headless token route. Shared by the ITSA sandbox scripts and the behaviour suites.
Files: scripts/lib/hmrcAuthorizationCode.js

### File a full ITSA tax year against the HMRC sandbox
`itsa-sandbox-year.js` files a whole ITSA tax year against HMRC's sandbox for one test user: an annual submission, a triggered and adjusted BSAS, a calculation and a final declaration for the self-employment business, plus quarterly updates for both businesses, resetting the sandbox's stateful test data via a checkpoint between runs.
Files: scripts/itsa-sandbox-year.js, app/unit-tests/scripts/itsa-sandbox-year.test.js

### Spike-test the ITSA sandbox OAuth and business-details flow
`itsa-sandbox-spike.js` is a standalone harness (not part of any test suite) proving that the application's HMRC sandbox registration, OAuth redirect and fraud-prevention headers get a `read:self-assessment`-scoped Business Details read through.
Files: scripts/itsa-sandbox-spike.js

### Provide behaviour-test step helpers for ITSA and VAT journeys
`behaviour-hmrc-itsa-steps.js` exports 46 Playwright step helpers (init/fill/submit/verify) spanning business details, obligations, self-employment and UK property periods, both annual summaries, calculation, final declaration and losses and claims, shared across the ITSA behaviour test suite.
Files: behaviour-tests/steps/behaviour-hmrc-itsa-steps.js

### Plan the HMRC MTD VAT and ITSA rollout
`.github/agents/mtd-vat-roadmap.agent.md` defines an agent that plans the path to HMRC production approval for VAT submission. `PLAN_ITSA_PHASE_2.md` is the operator-approved plan for the ITSA annual submission, BSAS, calculation and final declaration build.
Files: .github/agents/mtd-vat-roadmap.agent.md, PLAN_ITSA_PHASE_2.md

## Companies House filing

### Exchange a Companies House OAuth token

`companiesHouseTokenPost.js` exchanges an OAuth authorization code for a Companies House access token and returns it to the caller (`accessToken`, `expiresIn`, `tokenType`); it does not persist the token server side, and it publishes an activity event on success or failure. `filingCallback.html` is the redirect landing page: it reads the authorization code from the URL, posts it to this Lambda, and stores the resulting access token, its expiry and the requested scope in `sessionStorage` for the rest of the filing journey; it carries no filing reference. `web/public/lib/auth-url-builder.js` (Customer-facing site area) rebuilds the redirect URI at runtime rather than storing it.

Files: app/functions/companies-house/companiesHouseTokenPost.js, app/unit-tests/functions/companiesHouseTokenPost.test.js, web/public/companies-house/filingCallback.html, web/browser-tests/filingCallback.browser.test.js

### Verify the Companies House OAuth app configuration

`infra/companies-house/companies-house.toml` records the two hub applications (one per environment) created by hand on the Companies House developer hub, since the hub publishes no application-management API. `infra/companies-house/companies-house-assert.js` proves the recorded client id/redirect pair still authorises without a 400, that the REST API key answers a public-data call, and that the client id matches the deployed `.env`; it is read-only, since there is nothing for it to apply.

Files: infra/companies-house/companies-house.toml, infra/companies-house/companies-house-assert.js, app/unit-tests/scripts/companiesHouseAssert.test.js

### Search the Companies House register

`companiesHouseSearchGet.js` searches Companies House for companies matching a query term, validates pagination parameters, and returns paginated JSON via `companiesHouseHttpGet()`. `companySearch.html` is the typeahead search page; `companies-house-service.js` is its client-side service (`searchCompanies`, `getCompanyProfile`).

Files: app/functions/companies-house/companiesHouseSearchGet.js, app/unit-tests/functions/companiesHouseSearchGet.test.js, web/public/companies-house/companySearch.html, web/public/lib/services/companies-house-service.js, web/browser-tests/companySearch.browser.test.js, behaviour-tests/companiesHouse.behaviour.test.js, behaviour-tests/steps/behaviour-companies-house-steps.js

### Fetch a company profile

`companiesHouseCompanyGet.js` fetches a single company's details via `getCompanyProfile()`, enforces the caller's bundle entitlement, and returns the profile as JSON.

Files: app/functions/companies-house/companiesHouseCompanyGet.js, app/unit-tests/functions/companiesHouseCompanyGet.test.js, app/services/companiesHouseApi.js

### File a change of registered office address

`companiesHouseRegisteredOfficeAddressGet.js` retrieves the current registered office address; `companiesHouseRegisteredOfficeAddressPost.js` validates a new address, builds the XML submission, and files it via `putRegisteredOfficeAddress()`. `changeRegisteredOffice.html` is the form page.

Files: app/functions/companies-house/companiesHouseRegisteredOfficeAddressGet.js, app/functions/companies-house/companiesHouseRegisteredOfficeAddressPost.js, app/unit-tests/functions/companiesHouseRegisteredOfficeAddressGet.test.js, app/unit-tests/functions/companiesHouseRegisteredOfficeAddressPost.test.js, web/public/companies-house/changeRegisteredOffice.html, web/browser-tests/changeRegisteredOffice.browser.test.js, behaviour-tests/changeRegisteredOffice.behaviour.test.js

### File a change of registered email address

`companiesHouseRegisteredEmailEligibilityGet.js` checks whether a company is eligible for email registration; `companiesHouseRegisteredEmailAddressPost.js` validates and files a new registered email address via `putRegisteredEmailAddress()`. `changeRegisteredEmail.html` is the form page.

Files: app/functions/companies-house/companiesHouseRegisteredEmailEligibilityGet.js, app/functions/companies-house/companiesHouseRegisteredEmailAddressPost.js, app/unit-tests/functions/companiesHouseRegisteredEmailEligibilityGet.test.js, app/unit-tests/functions/companiesHouseRegisteredEmailAddressPost.test.js, web/public/companies-house/changeRegisteredEmail.html, behaviour-tests/changeRegisteredEmail.behaviour.test.js, behaviour-tests/steps/behaviour-companies-house-accounts-steps.js

### Preview micro-entity accounts before filing

`companiesHouseAccountsPreviewPost.js` renders the FRS 105 micro-entity iXBRL from the balance sheet the user entered, using `buildMicroEntityAccounts()`, so the page can show it before anything reaches the Companies House XML Gateway; it never calls the gateway.

Files: app/functions/companies-house/companiesHouseAccountsPreviewPost.js, app/unit-tests/functions/companiesHouseAccountsPreviewPost.test.js

### File micro-entity accounts to Companies House

`companiesHouseAccountsPost.js` accepts the entered accounts data, builds the XML submission via `buildAccountsSubmissionRequest()`, submits it to the Companies House XML Gateway via `postToGateway()`, and stores the async request in DynamoDB. `companiesHouseAccountsGet.js` polls that stored request for the filing's status, caching results via the async-request repository. `microEntityAccountsIxbrl.js` builds the iXBRL document (`buildMicroEntityAccounts`, `buildContexts`, `formatMonetary`); `companiesHouseXmlGateway.js` is the current XML Gateway client, formatting and posting the envelope (`buildAccountsSubmission`, `buildStatusRequest`, `hashPresenterCredential`). `fileMicroEntityAccounts.html` is the guided filing form (turnover under £316k); `companies-house-filing-service.js` is its client-side service. `PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md` records the feature's goals, phases and verification criteria.

Files: app/functions/companies-house/companiesHouseAccountsPost.js, app/functions/companies-house/companiesHouseAccountsGet.js, app/unit-tests/functions/companiesHouseAccountsPost.test.js, app/unit-tests/functions/companiesHouseAccountsGet.test.js, app/services/microEntityAccountsIxbrl.js, app/unit-tests/services/microEntityAccountsIxbrl.test.js, app/services/companiesHouseXmlGateway.js, app/unit-tests/services/companiesHouseXmlGateway.test.js, web/public/companies-house/fileMicroEntityAccounts.html, web/public/lib/services/companies-house-filing-service.js, behaviour-tests/companiesHouse/fileMicroEntityAccounts.behaviour.test.js, behaviour-tests/steps/behaviour-companies-house-filing-steps.js, app/unit-tests/http-simulator/routes/companies-house-xmlgw.test.js, app/system-tests/companiesHouseFilingSimulator.system.test.js, app/system-tests/companiesHouseSimulator.system.test.js, PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md

### Query and submit document transactions

`companiesHouseTransactionGet.js`, `companiesHouseTransactionPost.js` and `companiesHouseTransactionPut.js` retrieve, submit and update a company document transaction against the Companies House filing API, each calling `companiesHouseFilingRequest(method, path, { accessToken, body })` from `companiesHouseFilingApi.js` with its own HTTP method ("GET"/"POST"/"PUT") — one shared request function, not separate per-verb clients. `companiesHouseFilingApi.js` also resolves the filing/identity base URLs and the presenter client secret this group uses (`getFilingBaseUrl`, `getIdentityBaseUrl`, `resolveClientSecret`); it is distinct from `companiesHouseApi.js`, whose `companiesHouseHttpGet()` is the separate API-key-based client used for search and company-profile lookups.

Files: app/functions/companies-house/companiesHouseTransactionGet.js, app/functions/companies-house/companiesHouseTransactionPost.js, app/functions/companies-house/companiesHouseTransactionPut.js, app/unit-tests/functions/companiesHouseTransactionGet.test.js, app/unit-tests/functions/companiesHouseTransactionPost.test.js, app/unit-tests/functions/companiesHouseTransactionPut.test.js, app/services/companiesHouseFilingApi.js, app/unit-tests/services/companiesHouseFilingApi.test.js

### Fetch HTTP with a timeout

`app/lib/httpFetch.js` wraps the native `fetch` with a configurable timeout, used by the Companies House API/filing/XML Gateway services for every outbound call.

Files: app/lib/httpFetch.js

### Parse XML safely

`app/lib/xmlDom.js` wraps the `xmldom` library with guards against XXE and billion-laughs attacks, used to build and read the XML Gateway's GovTalk envelopes.

Files: app/lib/xmlDom.js

### Generate synthetic test companies

`scripts/companies-house-test-company.js` generates a synthetic test company (company number, name, address) for exercising the Companies House integration without a real entity, for use against the http-simulator and behaviour tests.

Files: scripts/companies-house-test-company.js

### Map the FRC iXBRL taxonomy and validate accounts

`scripts/generate-frc-taxonomy-concepts.js` is a one-off script that fetches the FRS 102 entry-point schema (and the modules it imports) from the FRC's own taxonomy site, extracts the flat list of element names it declares, and writes it to the checked-in fixture `fixtures/frc-taxonomy/frs-102-2026-concepts.json`. `loadFrcTaxonomyConcepts()` in `microEntityAccountsIxbrl.js` loads and caches that checked-in concept-name list, which the iXBRL generator checks every concept it emits against; neither step links general-ledger codes to FRC concepts. `scripts/validate-accounts-ixbrl.js` posts a generated micro-entity iXBRL document to Companies House's public XBRL test validator over the network and prints the result; it runs on demand, not as part of the test suite.

Files: scripts/generate-frc-taxonomy-concepts.js, scripts/validate-accounts-ixbrl.js

### Provision the Companies House CDK stack

`CompaniesHouseStack.java` creates all thirteen Companies House Lambda functions (search, company profile, OAuth token, the three transaction verbs, registered office get/post, registered email eligibility/post, accounts preview/post/get) as `ApiLambda` origins and wires their API Gateway routes.

Files: infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStackTest.java

## Billing and entitlements

### Grant a bundle to a user
`app/functions/account/bundlePost.js` (`grantBundle`/`ingestHandler`) checks the requested bundle against the catalogue's qualifiers, enforces its capacity cap via an atomic DynamoDB counter, deletes and re-grants any existing allocation, and writes the new bundle record. Requests run through an async SQS/DynamoDB polling path (`asyncApiServices`) so a slow grant does not time out the caller. `scripts/add-bundle.sh` writes a bundle record directly to DynamoDB for a given hashed sub as an ops shortcut, bypassing the API.
Files: app/functions/account/bundlePost.js, app/unit-tests/functions/bundlePost.handler.test.js, app/system-tests/bundlePost.system.test.js, app/system-tests/accountBundles.system.test.js, app/system-tests/bundleManagement.journeys.system.test.js, app/system-tests/dynamoDbBundleStore.system.test.js, app/data/dynamoDbBundleRepository.js, app/unit-tests/data/dynamoDbBundleRepository.putBundle.test.js, scripts/add-bundle.sh, behaviour-tests/bundles.behaviour.test.js, behaviour-tests/steps/behaviour-bundle-steps.js, web/browser-tests/bundles.filtering.browser.test.js, web/browser-tests/bundles.mobileSubscription.browser.test.js, web/browser-tests/bundles.restrictedPass.browser.test.js, web/browser-tests/bundles.subscription.browser.test.js, web/public/bundles.html, web/public/lib/bundle-cache.js, web/unit-tests/bundle-cache.test.js, web/public/prefetch/prefetch-bundle-head.js

### List a user's bundles and token balance
`app/functions/account/bundleGet.js` (`retrieveUserBundles`) returns the caller's allocated bundles plus the unallocated catalogue bundles, lazily refreshes any bundle whose token window has elapsed, folds in the non-stored `operator` bundle for listed operator emails, and reports remaining capacity per bundle. It also runs a per-minute burst counter on the caller's hashed sub and raises an activity alert past a fixed threshold. `app/data/dynamoDbCapacityRepository.js` is the DynamoDB counter table this and `bundlePost.js` read/write for per-bundle capacity.
Files: app/functions/account/bundleGet.js, app/unit-tests/functions/bundleGet.handler.test.js, app/system-tests/bundleCapacity.system.test.js, app/data/dynamoDbCapacityRepository.js

### Delete a bundle
`app/functions/account/bundleDelete.js` removes one bundle from a user's allocation via `services/bundleManagement.js`'s `updateUserBundles`, over the same async SQS/DynamoDB path `bundlePost.js` uses.
Files: app/functions/account/bundleDelete.js, app/unit-tests/functions/bundleDelete.handler.test.js

### Enforce bundle entitlement on a request
`app/services/bundleManagement.js`'s `enforceBundles` matches the caller's request path against the catalogue's activities, computes the bundles that activity requires, and throws `BundleEntitlementError`/`BundleAuthorizationError` unless the caller holds one of them (automatic bundles, an operator match from `app/lib/operators.js`, or a stored allocation). A client-scoped request additionally requires the practice's own active `resident-pro` subscription. The same module's `addBundles`/`removeBundles`/`updateUserBundles` are the shared bundle-list mutators `bundleDelete.js` and the pass-redemption path call.
Files: app/services/bundleManagement.js, app/unit-tests/services/bundleManagement.test.js, app/system-tests/bundleManagement.system.test.js, app/lib/operators.js, app/unit-tests/lib/operators.test.js

### Reconcile bundle capacity counters
`app/functions/account/bundleCapacityReconcile.js` is an hourly scheduled Lambda that recounts active (non-expired) allocations per capped bundle via `countActiveAllocations` and overwrites the capacity counter table, correcting any drift the increment/decrement counters accumulate.
Files: app/functions/account/bundleCapacityReconcile.js, app/unit-tests/functions/bundleCapacityReconcile.test.js, app/system-tests/bundleCapacityReconcile.system.test.js, app/unit-tests/data/dynamoDbBundleRepository.countActiveAllocations.test.js

### Generate a token-charged pass (digital or physical)
`app/functions/account/passGeneratePost.js` charges a caller's tokens via `tokenEnforcement.consumeTokenForActivity` for `generate-pass-digital`/`generate-pass-physical`, then creates a pass through `passService.createPass`. `app/lib/qrCodeGenerator.js` renders the pass's redemption URL as a QR code data URL for the digital/physical pass pages.
Files: app/functions/account/passGeneratePost.js, app/unit-tests/functions/passGeneratePost.test.js, web/public/passes/generate-digital.html, web/public/passes/generate-physical.html, behaviour-tests/generatePassActivity.behaviour.test.js, behaviour-tests/steps/behaviour-pass-generation-steps.js, app/lib/qrCodeGenerator.js, app/unit-tests/lib/qrCodeGenerator.test.js, docs/QR_CODE_GENERATION.md, app/system-tests/qrCodeGeneration.system.test.js

### Admin-issue a pass
`app/functions/account/passAdminPost.js` creates a pass directly via `passService.createPass` for any catalogue pass type and bundle, with no token charge, for operator/admin use (validity, max uses, email restriction and notes all caller-supplied).
Files: app/functions/account/passAdminPost.js

### Check a pass's validity
`app/functions/account/passGet.js` calls `passService.checkPass` to report whether a code is valid (and, for an email-restricted pass with no email supplied, that it is valid but email-restricted) without incrementing its use count. Runs before login, from a pass link landing on a page.
Files: app/functions/account/passGet.js

### List a user's issued passes
`app/functions/account/passMyPassesGet.js` returns up to 50 passes the caller's hashed sub has issued, via `dynamoDbPassRepository.getPassesByIssuer`, mapped to a public-safe shape.
Files: app/functions/account/passMyPassesGet.js, app/unit-tests/functions/passMyPassesGet.test.js, app/unit-tests/data/dynamoDbPassRepository.getPassesByIssuer.test.js

### Redeem a pass
`app/functions/account/passPost.js` redeems a code via `passService.redeemPass`, then grants the pass's bundle through `bundlePost.js`'s `grantBundle` (skipping the capacity cap, since a pass already gates supply). A bundle marked `on-pass-on-subscription` reports as valid but not yet redeemed, requiring a Stripe subscription first. `app/services/passService.js` builds and validates pass records (four-word passphrase codes from `app/lib/passphrase.js`, optional email-restriction hashed with `app/lib/emailHash.js`), atomically incrementing `useCount` on redemption. `web/public/widgets/pass-redeemer.js` auto-redeems a `?pass=` query parameter on any page it is included on, so a pass link can point straight at an activity page.
Files: app/functions/account/passPost.js, app/unit-tests/functions/passPost.test.js, app/system-tests/passRedemption.system.test.js, behaviour-tests/passRedemption.behaviour.test.js, web/browser-tests/passRedeemer.browser.test.js, web/public/widgets/pass-redeemer.js, app/services/passService.js, app/unit-tests/services/passService.test.js, app/unit-tests/services/passServiceEmailHashRotation.test.js, app/unit-tests/services/passServiceEmailHashSecret.test.js, app/lib/passphrase.js, app/unit-tests/lib/passphrase.test.js, app/lib/emailHash.js, app/unit-tests/lib/emailHash.test.js, app/data/dynamoDbPassRepository.js, infra/main/resources/analytics/views/v_pass_redemptions_daily.sql, PASSES.md, submit.passes.toml

### Generate admin passes from the command line or a workflow
`.github/workflows/generate-pass.yml` is a manually-dispatched (also scheduled and callable) workflow that reads a pass type's defaults from `submit.passes.toml`, runs `scripts/generate-pass-with-qr.js` to create one or more passes with PNG/SVG QR codes as a downloadable artifact, and optionally provisions an HMRC sandbox or Cognito test user alongside them. `scripts/generate-pass.js` is the local CLI equivalent with no QR output, run against assumed AWS credentials.
Files: .github/workflows/generate-pass.yml, scripts/generate-pass.js, scripts/generate-pass-with-qr.js

### Invite a client to authorise agent access
`app/functions/practice/practiceClientAuthorisationInvitePost.js` creates an HMRC agent-authorisation invitation (`hmrcAgentAuthorisation.createInvitation`) for a practice's client and one HMRC service (MTD-VAT or MTD-IT), storing the invitation id on the client record.
Files: app/functions/practice/practiceClientAuthorisationInvitePost.js, app/unit-tests/functions/practiceClientAuthorisationInvitePost.test.js

### Check a client's authorisation status
`app/functions/practice/practiceClientAuthorisationGet.js` re-reads a pending invitation's status from HMRC, or, once no invitation is pending, checks HMRC's relationships endpoint for an existing authority, and caches the resulting status on the client record.
Files: app/functions/practice/practiceClientAuthorisationGet.js, app/unit-tests/functions/practiceClientAuthorisationGet.test.js

### Cancel a pending client authorisation invite
`app/functions/practice/practiceClientAuthorisationInviteDelete.js` cancels a client's pending HMRC invitation; it never touches an already-accepted relationship, only an invitation still held on the client row.
Files: app/functions/practice/practiceClientAuthorisationInviteDelete.js, app/unit-tests/functions/practiceClientAuthorisationInviteDelete.test.js

### Move a book to a client
`app/functions/practice/practiceClientBookMovePost.js` transfers one of a practice's own diya-gl books to a named client's book set via `s3DiyaGlRepository.moveBookToClient`, refusing a book that is already under a client or a destination that already exists.
Files: app/functions/practice/practiceClientBookMovePost.js, app/unit-tests/functions/practiceClientBookMovePost.test.js

### Manage practice clients
`app/functions/practice/practiceClientsPost.js`, `practiceClientGet.js`, `practiceClientDelete.js` and `practiceClientsListGet.js` create, read, archive-delete and list a practice's clients against `app/data/dynamoDbPracticeClientRepository.js`. `web/public/practice.js` renders the client roster with HMRC authorisation status (MTD-VAT/ITSA) and invitation controls on `web/public/practice.html`.
Files: app/functions/practice/practiceClientsPost.js, app/functions/practice/practiceClientGet.js, app/functions/practice/practiceClientDelete.js, app/functions/practice/practiceClientsListGet.js, app/unit-tests/functions/practiceClientsPost.test.js, app/unit-tests/functions/practiceClientGet.test.js, app/unit-tests/functions/practiceClientDelete.test.js, app/unit-tests/functions/practiceClientsListGet.test.js, app/data/dynamoDbPracticeClientRepository.js, app/unit-tests/data/dynamoDbPracticeClientRepository.test.js, web/public/practice.html, web/public/practice.js, web/browser-tests/practice.browser.test.js, behaviour-tests/practiceLicence.behaviour.test.js

### Upload a diya-gl book
`app/functions/diyaGl/diyaGlPut.js` validates a ledger package (product id, provenance fields, and via `app/lib/zipMembers.js`'s `isDiyaGlPackage` that the upload is a well-formed zip carrying the expected members), checks the caller's retention entitlement, and writes the book and its metadata to S3 with versioning. `app/lib/diyaGlCors.js` supplies the CORS headers this and the other diya-gl endpoints answer with.
Files: app/functions/diyaGl/diyaGlPut.js, app/unit-tests/functions/diyaGlPut.test.js, app/lib/zipMembers.js, app/unit-tests/lib/zipMembers.test.js, app/lib/diyaGlCors.js, app/unit-tests/functions/diyaGlCorsHeaders.test.js

### Delete a diya-gl book
`app/functions/diyaGl/diyaGlDelete.js` deletes a ledger book from S3 via `deleteBook`, after authorisation and ownership checks.
Files: app/functions/diyaGl/diyaGlDelete.js, app/unit-tests/functions/diyaGlDelete.test.js

### List a user's diya-gl books
`app/functions/diyaGl/diyaGlListGet.js` lists the authenticated user's ledger books from S3, paginated.
Files: app/functions/diyaGl/diyaGlListGet.js, app/unit-tests/functions/diyaGlListGet.test.js

### Fetch a versioned diya-gl book
`app/functions/diyaGl/diyaGlVersionGet.js` retrieves a specific stored version of a ledger book from S3.
Files: app/functions/diyaGl/diyaGlVersionGet.js, app/unit-tests/functions/diyaGlVersionGet.test.js

### Sweep lapsed diya-gl books
`app/functions/diyaGl/diyaGlLapseSweep.js` is a daily scheduled Lambda that finds subscribers whose resident bundle lapsed more than a grace period ago (`listLapsedBundleOwners`) and deletes their resident-tier books from S3; a sandbox-tier book is left to the bucket's own lifecycle rule.
Files: app/functions/diyaGl/diyaGlLapseSweep.js, app/unit-tests/functions/diyaGlLapseSweep.test.js, behaviour-tests/diyaGlSubscription.behaviour.test.js, behaviour-tests/steps/behaviour-diya-gl-subscription-steps.js

### Check diya-gl retention entitlement
`app/services/diyaGlEntitlement.js`'s `entitlementFor` decides whether a caller's books get the `resident` (never lapsed while active) or `sandbox` retention tier, from an active unexpired `resident` bundle for the caller's own books, or the practice's own active `resident-pro` subscription plus a matching client row for a client-scoped request.
Files: app/services/diyaGlEntitlement.js, app/unit-tests/services/diyaGlEntitlement.test.js, behaviour-tests/diyaGlStorage.behaviour.test.js, app/system-tests/diyaGlStorage.system.test.js

### Store diya-gl books in S3
`app/data/s3DiyaGlRepository.js` is the S3 repository behind every diya-gl endpoint: book/version keys, metadata read/write, listing, tagging, visibility rules and the cross-client `moveBookToClient` used by the practice book-move endpoint.
Files: app/data/s3DiyaGlRepository.js, app/unit-tests/data/s3DiyaGlRepository.test.js, _developers/RUNBOOK_DIYA_GL_BUCKET_CUTOVER.md

### Create a Stripe checkout session
`app/functions/billing/billingCheckoutPost.js` resolves the caller's requested bundle and interval (annual/monthly) to a Stripe price id from the catalogue, then creates a Stripe Checkout session carrying the caller's hashed sub and bundle id as metadata, so `billingWebhookPost.js` can grant the bundle once payment completes. `app/functions/billing/billingReturnUrl.js`'s `resolveAllowedReturnTo` validates the post-checkout return URL against an allow-list. `app/lib/stripeClient.js` is the shared Stripe SDK client (live/test) every billing Lambda uses; `app/test-support/stripeSimulator.js` stands in for Stripe in local/simulator testing.
Files: app/functions/billing/billingCheckoutPost.js, app/unit-tests/functions/billingCheckoutPost.test.js, app/system-tests/billingCheckout.system.test.js, behaviour-tests/payment.behaviour.test.js, app/lib/stripeClient.js, app/test-support/stripeSimulator.js, app/functions/billing/billingReturnUrl.js

### Retrieve a Stripe checkout session's status
`app/functions/billing/billingCheckoutSessionGet.js` retrieves a Checkout session by id, trying the live Stripe client then the test-mode client (a session id is only valid in the mode it was created in).
Files: app/functions/billing/billingCheckoutSessionGet.js, app/unit-tests/functions/billingCheckoutSessionGet.test.js

### Open the Stripe customer billing portal
`app/functions/billing/billingPortalGet.js` creates a Stripe billing-portal session for the caller's Stripe customer id (read from their stored bundle) and redirects to it, using the same allow-listed return URL as checkout.
Files: app/functions/billing/billingPortalGet.js, app/unit-tests/functions/billingPortalGet.test.js

### Recover an abandoned checkout
`app/functions/billing/billingRecoverPost.js` is a stub: it always returns HTTP 501 "Not implemented".
Files: app/functions/billing/billingRecoverPost.js

### Process Stripe webhook events
`app/functions/billing/billingWebhookPost.js` verifies the Stripe signature (separate test/live secrets from Secrets Manager) and handles: `checkout.session.completed` (grants the bundle and stores a subscription record), `invoice.paid` (resets the bundle's token count for the new period), `customer.subscription.updated` (syncs status and cancel-at-period-end, raising a cancellation-scheduled alert), `customer.subscription.deleted` (marks the subscription cancelled), `invoice.payment_failed` (marks the bundle `past_due`), `charge.refunded` (audit-log activity event only, no state change) and `charge.dispute.created`/`charge.dispute.closed` (flags the subscription disputed and auto-accepts the dispute, since contesting a sub-£10/month charge costs more in fees than the charge itself). Every other event type is logged and ignored. `app/data/dynamoDbSubscriptionRepository.js` stores the subscription audit record the webhook reads and updates. `scripts/stripe-cancel-subscription.js` and its `.github/workflows/stripe-cancel-subscription.yml` wrapper cancel a live subscription for customer account closure, outside this webhook's own event-driven flow. `scripts/stripe-trigger-lifecycle.sh` fires real Stripe CLI test events against this endpoint to exercise it end to end.

No PayPal webhook handler exists in this repository — see "Assert the PayPal donate button configuration" below.
Files: app/functions/billing/billingWebhookPost.js, app/unit-tests/functions/billingWebhookPost.test.js, app/data/dynamoDbSubscriptionRepository.js, app/system-tests/billingInfrastructure.system.test.js, .github/workflows/stripe-cancel-subscription.yml, scripts/stripe-cancel-subscription.js, scripts/stripe-trigger-lifecycle.sh

### Assert the PayPal donate button configuration
`infra/paypal/paypal-assert.js` is not a webhook handler: it reads `infra/paypal/paypal.toml`'s classic hosted Donate button id and checks it, by live HTTP request, against the rendered spreadsheets.diyaccounting.co.uk donate page and PayPal's own donate link — declare-and-verify, because PayPal's REST API has no resource for a classic hosted button. The button itself belongs to the spreadsheets site, not this app.
Files: infra/paypal/paypal-assert.js, infra/paypal/paypal.toml, app/unit-tests/scripts/paypalAssert.test.js

### Sync the Stripe product/price catalogue
`infra/stripe/stripe-sync.js` plans, then (with `--apply`) creates, a Stripe product and recurring price per on-subscription bundle in `web/public/submit.catalogue.toml`, plus the webhook endpoints `infra/stripe/stripe.toml` declares; account API keys are read from Secrets Manager, never an environment variable. `infra/stripe/lib/stripeCatalogue.js` parses the bundle catalogue into Stripe product definitions for this sync.
Files: infra/stripe/stripe-sync.js, infra/stripe/lib/stripeCatalogue.js, infra/stripe/stripe.toml, app/unit-tests/scripts/stripeSync.test.js

### Configure Stripe account policies
`scripts/stripe-configure-policies.js` sets Stripe account-level policies for a no-quibble, customer-first approach: a weekly payout schedule with minimum delay, plus the dispute auto-accept stance `billingWebhookPost.js` implements.
Files: scripts/stripe-configure-policies.js

### Provision Stripe secrets
`scripts/stripe-setup-secrets.sh` creates or updates Stripe API keys and webhook signing secrets in AWS Secrets Manager for the ci and prod environments.
Files: scripts/stripe-setup-secrets.sh

### Migrate the hashed-sub salt
`scripts/migrations/003-rotate-salt-to-passphrase.js` is a post-deploy migration that generates a new 8-word passphrase salt (v2) for hashing user subs, re-keys every hashed-sub-keyed DynamoDB item from the old salt to the new one, and updates the salt canary; the new passphrase is printed for the operator to record physically.
Files: scripts/migrations/003-rotate-salt-to-passphrase.js

### Backfill the Stripe test-mode qualifier
`scripts/migrations/004-backfill-stripe-test-mode.js` is a pre-deploy, idempotent migration that copies `qualifiers.sandbox` to a new `qualifiers.stripeTestMode` field on every bundle a Stripe subscription created, honouring a `MIGRATION_DRY_RUN` flag.
Files: scripts/migrations/004-backfill-stripe-test-mode.js, app/unit-tests/migrations/004-backfill-stripe-test-mode.test.js

### Enforce and consume activity tokens
`app/services/tokenEnforcement.js` gates a token-costed activity in two steps: `hasTokensForActivity` checks a qualifying bundle has enough tokens before an HMRC call is made (so a rejected submission never costs a token), and `chargeTokenOnSuccess`/`consumeTokenForActivity` atomically decrements the count once HMRC confirms success. A bundle carrying the `unlimited` sentinel (the resident-pro practice licence) is exempt from counting. `web/public/widgets/submission-cost.js` shows the activity's token price and the account's remaining balance before the customer submits, without itself blocking submission on a slow or failed balance read.
Files: app/services/tokenEnforcement.js, app/unit-tests/services/tokenEnforcement.test.js, app/unit-tests/services/tokenEnforcement.consumption.test.js, app/system-tests/tokenConsumption.system.test.js, behaviour-tests/tokenEnforcement.behaviour.test.js, web/public/widgets/submission-cost.js, web/browser-tests/submissionCost.browser.test.js, app/unit-tests/data/dynamoDbBundleRepository.tokenEvent.test.js

### Prefetch and retry a Cognito token refresh
The frontend's `fetchWithIdToken`/`ensureSession` helpers (built into `submit.bundle.js`, exercised by the tests here) call `cognitoTokenPost.js`'s `refresh_token` grant automatically on a 401 and retry the original request; `web/public/prefetch/prefetch-cognito-token-head.js` and `prefetch-mock-token-head.js` start that exchange early in page load (real and simulator/local-dev variants respectively) to shorten the visible wait. The endpoint itself is covered under Customer-facing site and accounts' Cognito authentication capability.
Files: web/unit-tests/token-refresh.test.js, behaviour-tests/tokenRefresh.behaviour.test.js, web/public/prefetch/prefetch-cognito-token-head.js, web/public/prefetch/prefetch-mock-token-head.js

### Load and query the product/activity catalogue
`app/services/productCatalog.js` parses `web/public/submit.catalogue.toml` and answers which bundles an activity requires, which activities a bundle unlocks, per-environment listing restrictions, capped bundle ids, and a bundle's Stripe prices by interval. `web/public/lib/services/catalog-service.js` is the browser-side equivalent (`bundlesForActivity`, `activitiesForBundle`, `isActivityAvailable`). `web/public/widgets/entitlement-status.js` reads both the catalogue and the caller's bundles to show, in the page header, whether the current page's activity is unlocked. `app/system-tests/helpers/catalogueValues.js` supplies shared catalogue test fixtures for the system-test tier.
Files: app/services/productCatalog.js, app/unit-tests/services/productCatalog.test.js, app/system-tests/productCatalog.system.test.js, web/public/lib/services/catalog-service.js, web/unit-tests/catalog-service.test.js, web/unit-tests/catalog-paths.test.js, web/public/submit.catalogue.toml, web/public/widgets/entitlement-status.js, app/system-tests/helpers/catalogueValues.js

### CDK: account stack
`infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` wires the Lambdas behind bundle get/post/delete, the pass endpoints (get/post/admin/generate/my-passes), the practice-client endpoints (CRUD, authorisation invite/get/delete), the operator snapshot, and the bundle-capacity-reconcile schedule, into API Gateway routes with their DynamoDB table grants.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/AccountStackTest.java

### CDK: billing app stack
`infra/main/java/co/uk/diyaccounting/submit/stacks/BillingStack.java` wires the per-deployment billing Lambdas — checkout create, checkout-session get, portal get, and the recover stub — with their Stripe secret and DynamoDB access.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/BillingStack.java

### CDK: billing webhook stack
`infra/main/java/co/uk/diyaccounting/submit/stacks/BillingWebhookStack.java` is a separate, environment-level stack (never torn down, so Stripe webhook deliveries always succeed even while application stacks are destroyed) that runs the webhook Lambda behind its own API Gateway domain, with zero provisioned concurrency since Stripe's own retry covers a cold start.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/BillingWebhookStack.java

### CDK: diya-gl stack
`infra/main/java/co/uk/diyaccounting/submit/stacks/DiyaGlStack.java` wires the diya-gl list/version/put/delete Lambdas, the practice client book-move Lambda, and the lapse-sweep schedule, with their S3 bucket and DynamoDB grants.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/DiyaGlStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/DiyaGlStackTest.java

### Parse ISO 8601 durations for bundle and pass expiry
`app/lib/dateUtils.js` provides the ISO 8601 duration parsing (`parseIsoDurationToDate`) that bundle grants, pass validity periods and token-reset windows all use to compute an expiry from a catalogue-declared duration, plus TTL calculation for pass DynamoDB records and a per-minute timestamp bucket for the bundle-read burst detector.
Files: app/lib/dateUtils.js

### Build the frontend test bundle
`scripts/bundle-for-tests.js` concatenates the frontend's ES modules into one `submit.bundle.js` file so unit and browser tests can load it without a module bundler; unrelated to product/subscription bundles despite the shared name.
Files: scripts/bundle-for-tests.js

### Document the price-update project
`PLAN_PRICE_UPDATE.md` and `REPORT_PRICE_UPDATE_REVIEW.md` record the plan and review for the pricing/bundle-catalogue update project this area's billing and entitlement code implements.
Files: PLAN_PRICE_UPDATE.md, REPORT_PRICE_UPDATE_REVIEW.md

## Operations and CI

### Claim, release and track a CI deployment slot
Claims one of a fixed pool of `ci-set<N>` deployment names so a branch lands on an HMRC/Companies House/Cognito-registered host, keyed by `github.ref` so a redeploy of the same branch wins its own slot back; `claim-ci-slot.mjs` claims, `release-ci-slot.mjs` frees the slot the moment `deploy.yml` finishes pass or fail, `slot-claim-active.mjs` lets `destroy-ci.yml` check a candidate set is not mid-deploy before tearing it down, and `slot-for-ref.mjs` finds which slot a deleted branch held so the branch-delete trigger can retire it.
Files: .github/actions/claim-ci-slot/action.yml, .github/actions/claim-ci-slot/claim-ci-slot.mjs, .github/actions/claim-ci-slot/release-ci-slot.mjs, .github/actions/claim-ci-slot/slot-claim-active.mjs, .github/actions/claim-ci-slot/slot-for-ref.mjs, app/unit-tests/actions/releaseCiSlot.test.js, app/unit-tests/actions/slotClaimActive.test.js, app/unit-tests/actions/slotForRef.test.js

### Queue CI branch deploys in creation order
`wait-for-ci-deploys.mjs` polls the GitHub API for older, still-running `deploy.yml`/`deploy-app.yml`/`destroy-ci.yml`/`video-capture.yml` runs on non-main branches and blocks until they finish, or, in its alternative mode, waits for any unfinished run of those workflows resolved to the same environment, so concurrent CI branch deploys don't race the same slot or table.
Files: .github/actions/wait-for-ci-deploys/action.yml, .github/actions/wait-for-ci-deploys/wait-for-ci-deploys.mjs

### Gate probes on the main apex deploy
`wait-for-main-deploy.mjs` polls for `deploy.yml` runs in progress or queued on `main` for up to 40 minutes and reports whether one is still gating, so probe tests never navigate against an apex that's mid-move.
Files: .github/actions/wait-for-main-deploy/action.yml, .github/actions/wait-for-main-deploy/wait-for-main-deploy.mjs, app/unit-tests/actions/waitForMainDeploy.test.js

### Cancel superseded push-triggered deploys
When `workflow_dispatch` runs `deploy.yml` against an explicit `deployment-name` (a redeploy), `cancel-superseded-push-deploy.mjs` finds and cancels any push-triggered `deploy.yml` run on the same commit that has not yet started stack deployment, so the two runs never deploy the same stacks in parallel.
Files: .github/actions/cancel-superseded-push-deploy/action.yml, .github/actions/cancel-superseded-push-deploy/cancel-superseded-push-deploy.mjs

### Derive environment and deployment names from a branch
`get-names` computes the environment name (`ci` or `prod`), the deployment name (a hash of the branch name, or an explicit override), and the resulting domain URLs, so every workflow step downstream names the same stacks and hosts consistently.
Files: .github/actions/get-names/action.yml

### Look up AWS resources by domain convention
`lookup-resources` queries AWS for the Cognito User Pool, API Gateway and CloudFront resources that belong to a deployment purely from its deterministic domain name (for example `ci-<subdomain>.<domain>`), so a caller needs no stored resource IDs.
Files: .github/actions/lookup-resources/action.yml

### Record DORA and probe metrics to the analytics lake
`dora-row` writes one JSON row to the S3 analytics bucket per deploy or probe run, feeding the DORA and probe panels on the one-stop dashboard.
Files: .github/actions/dora-row/action.yml

### Redact and gate unattended-agent output before publishing
`publish-filter` runs `redact-triage-output.mjs`'s `DENY_PATTERNS`/`redact` over an unattended triage agent's text and, together with AWS Bedrock guardrails, blocks anything that fails before it reaches a GitHub issue or PR comment; `extractFinalAssistantText` and `maxTurnsNote` pull the reportable text out of the agent's `--output-format json` transcript.
Files: .github/actions/publish-filter/action.yml, scripts/redact-triage-output.mjs, app/unit-tests/scripts/redactTriageOutput.test.js

### Run alarm and support triage with a Claude agent
`run-triage-agent` executes `claude -p` against Bedrock (Haiku, with Sonnet escalation for complex cases) and writes its JSON result to a file for the caller to judge; `alarm-triage.yml` dispatches it from an `[ALARM]` issue and `support-triage.yml` from a support issue, never failing the job on the model's own verdict.
Files: .github/actions/run-triage-agent/action.yml, .github/workflows/alarm-triage.yml, .github/workflows/support-triage.yml, app/unit-tests/supportTriageWorkflow.test.js

### Kill-switch to stop unattended agent workflows
Reads the `/submit/<env>/agents/kill-switch` SSM parameter and fails the calling job when it is set, so one dispatch of `agent-kill-switch.yml` (which sets the parameter) halts every unattended agent path (alarm-triage, support-triage) in that environment.
Files: .github/actions/agent-kill-switch/action.yml, .github/workflows/agent-kill-switch.yml

### Enforce daily run budgets for agent paths
`agent-run-budget` counts successful runs of a named workflow/job/step in the last 24 hours and reports an over-budget status and count, so an unattended agent path cannot run away with unbounded dispatch cost.
Files: .github/actions/agent-run-budget/action.yml

### Update Route53/CloudFront origins for a domain
`set-origins` atomically updates the Route53 ALIAS records and CloudFront distribution aliases for an apex or environment domain to point at a chosen origin — branch-based, the holding page, or the last-known-good deployment.
Files: .github/actions/set-origins/action.yml, .github/workflows/set-origins.yml

### Promote a CI deployment to the CI apex
`promote-ci-apex.yml` moves `ci-submit.diyaccounting.co.uk` to point at a named `ci-set<N>` whose probes have passed, moving CloudFront and the API Gateway custom domain in sequence under a non-cancellable concurrency group so the two never disagree mid-promotion; `deploy.yml` dispatches it automatically, and it is also safe to run by hand.
Files: .github/workflows/promote-ci-apex.yml

### Define specialized Claude Code sub-agent personas
Eight `.agent.md` personas scope a sub-agent to one area of this repository — AWS CDK Java patterns, Playwright behaviour testing, refactoring/code-quality guardianship, Stripe subscriptions, HMRC MTD API integration, security/compliance hardening, repository summarization, and TODO/tech-debt discovery — so a dispatched agent inherits the right domain knowledge without re-deriving it.
Files: .github/agents/aws-cdk-java-specialist.agent.md, .github/agents/behavior-test-master.agent.md, .github/agents/clean-code-guardian.agent.md, .github/agents/entitlement-subscription-specialist.agent.md, .github/agents/hmrc-api-expert.agent.md, .github/agents/security-hardener.agent.md, .github/agents/summarize-repository.agent.md, .github/agents/todo-inator.agent.md

### Enforce commit identity allowlist
`identity-guard.yml` checks, on every PR, that all commit authors' email addresses appear in `allowed-commit-identities.yml`, rejecting commits from unrecognised identities.
Files: .github/allowed-commit-identities.yml, .github/workflows/identity-guard.yml

### Verify commit signatures on pull requests
A required status check that reads each commit's `commit.verification` field from the GitHub API and fails the PR if any commit is unsigned.
Files: .github/workflows/verify-commit-signatures.yml

### Run CodeQL security scanning
`codeql.yml` runs CodeQL against `main` on its schedule, using `codeql-config.yml` to exclude test code, mock infrastructure and other non-production files from the scan.
Files: .github/codeql/codeql-config.yml, .github/workflows/codeql.yml

### Configure GitHub Copilot review and workspace setup
`copilot-instructions.md` steers Copilot's PR review agent toward this repository's architecture and npm scripts; `copilot-setup-steps.yml` runs the equivalent setup steps for a Copilot coding-agent workspace.
Files: .github/copilot-instructions.md, .github/workflows/copilot-setup-steps.yml

### Configure Dependabot dependency updates
Declares which package managers, schedules and grouping strategy Dependabot uses to raise dependency-update PRs.
Files: .github/dependabot.yml

### Structure GitHub issues, PRs and funding links
The support issue template collects a structured category and an `origin:human` label for routing; the PR template captures origin (human, attended/unattended agent, machine, external), a summary, and issue-closing checkboxes; `FUNDING.yml` lists the GitHub Sponsors/PayPal donation links shown on the repository sidebar.
Files: .github/FUNDING.yml, .github/ISSUE_TEMPLATE/support.yml, .github/PULL_REQUEST_TEMPLATE.md

### Dispatch agentic-lib board, backlog and PR agents
Three workflows call into the shared agentic-lib library: `agentic-lib-board.yml` renders the `/board` open-work board with optional write-back to `NEXT.md`, `agentic-lib-code.yml` runs `/do-next` over `NEXT.md` under a time budget, and `agentic-lib-pr.yml` runs an agent that implements a change described in an issue or PR.
Files: .github/workflows/agentic-lib-board.yml, .github/workflows/agentic-lib-code.yml, .github/workflows/agentic-lib-pr.yml

### Auto-close resolved alarm issues
`close-alarm-issue-when-ok.mjs` checks whether an `[ALARM]` issue's CloudWatch alarm has returned to OK and closes the issue if so; `alarm-remedy-close.yml` runs it on a schedule over every open alarm issue.
Files: .github/workflows/alarm-remedy-close.yml, scripts/close-alarm-issue-when-ok.mjs, app/unit-tests/scripts/closeAlarmIssueWhenOk.test.js

### Check HTTPS certificate expiry
Scheduled workflow that checks ACM and Let's Encrypt certificates for the domains this repository serves and alerts before they expire.
Files: .github/workflows/certificate-check.yml

### Clean up expired test users
Scheduled workflow that deletes or rotates Cognito test-user credentials once their lane's expiry window has passed.
Files: .github/workflows/cleanup-test-users.yml

### Run the weekly compliance-test check
`compliance.yml` runs on a Monday schedule (and on demand) against a chosen environment, driven by the standing commitments declared in `compliance.toml` (each with an owner, a due/expiry/review date and a status the one-stop dashboard's compliance panel reads).
Files: .github/workflows/compliance.yml, compliance.toml

### Create an HMRC sandbox test user
Manually-triggered workflow that calls HMRC's sandbox `create-test-user` API to mint a fresh MTD test user.
Files: .github/workflows/create-hmrc-test-user.yml

### Delete a customer's data for GDPR erasure
`delete-user-data.js` deletes a customer's DynamoDB records, OAuth tokens and audit logs via the DynamoDB API and Secrets Manager; the two workflows trigger it manually by email address (via an Athena lookup to resolve the hashed subject first) or directly by hashed subject.
Files: .github/workflows/delete-user-data-by-email.yml, .github/workflows/delete-user-data.yml, scripts/delete-user-data.js

### Run the full deployment pipeline and move the prod apex
`deploy.yml` is the main pipeline triggered by a push to `main`: it synths CDK, runs tests, deploys infrastructure and app code, validates the result, and, once validation passes, atomically moves the prod apex domain from the old deployment to the new one.
Files: .github/workflows/deploy.yml

### Lean-deploy app code to Lambda and S3
`deploy-app.yml` (and the `scripts/deploy-app.js` it can also run locally) skips a full CDK deploy: it builds and pushes the ARM64 Docker image to ECR, updates every Lambda function's code, publishes a version and moves the `pc` alias, syncs web assets to S3 with RUM injection, and invalidates CloudFront — roughly 3–5 minutes against 15–25 for a full CDK deploy, at the cost of CloudFormation drift the next full deploy reconciles.
Files: .github/workflows/deploy-app.yml, scripts/deploy-app.js

### Deploy a single CDK stack on demand
Manually-triggered workflow that runs CDK synth and deploy for one named stack in a chosen environment, without going through the full pipeline.
Files: .github/workflows/deploy-cdk-stack.yml

### Deploy environment stacks and populate secrets
`deploy-environment.yml` synths and deploys the environment-level CDK stacks (`ObservabilityStack`, `DataStack`, and the rest) and its `create-secrets` job writes the environment's GitHub Environment secret values into AWS Secrets Manager, tagged via `put-secret-with-rotation-tag.sh`; the unit test proves the workflow's own path-filter list.
Files: .github/workflows/deploy-environment.yml, app/unit-tests/deployEnvironmentWorkflowPaths.test.js

### Auto-destroy stale CI deployments
`SelfDestructStack` schedules an EventBridge rule that invokes `selfDestruct.js`'s `ingestHandler` to delete a CI deployment's CloudFormation stacks, in dependency order, and clean up the S3 buckets and other resources CloudFormation won't; `destroy-ci.yml` runs the sweep on a schedule but skips a slot a deploy still has claimed (via the claim-ci-slot check), and `keepalive.yml` resets a live deployment's `CreationTime` so its self-destruct timer doesn't fire under it.
Files: .github/workflows/destroy-ci.yml, .github/workflows/keepalive.yml, infra/main/java/co/uk/diyaccounting/submit/stacks/SelfDestructStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/SelfDestructStackTest.java, app/functions/infra/selfDestruct.js, app/system-tests/selfDestruct.system.test.js, app/unit-tests/functions/selfDestruct.test.js

### Destroy a named prod deployment on demand
Manually-triggered workflow that tears down a named prod deployment's stacks once its data can be disposed of.
Files: .github/workflows/destroy-prod.yml

### Rotate stored email-address hashes
`email-hash-rotate.js` decrypts every stored email hash in DynamoDB with the old encryption key and re-encrypts it with a new one via a batch scan/update, using `EmailHashSecretHelper` (the CDK-side Secrets-Manager-backed encrypt/decrypt helper); `email-hash-rotate.yml` runs it as a workflow.
Files: .github/workflows/email-hash-rotate.yml, scripts/email-hash-rotate.js, infra/main/java/co/uk/diyaccounting/submit/utils/EmailHashSecretHelper.java

### Export a customer's GDPR subject-access data
`export-user-data.js` compiles a customer's personal data — DynamoDB records, S3 receipts, Athena-queried activity and email records — into one GDPR subject-access package; `export-user-data.yml` runs it manually by email.
Files: .github/workflows/export-user-data.yml, scripts/export-user-data.js

### Check fraud-prevention header record freshness
A laptop-only launchd agent writes HMRC's monthly fraud-prevention-header compliance record to a file this branch must commit; because GitHub Actions cannot reach the private mail mirror that record is generated from, this workflow only checks that the current month's record landed on the branch, turning a silent local failure into a red CI run.
Files: .github/workflows/fraud-header-check.yml

### Apply Google Cloud / GA4 infrastructure
`google-apply.yml` runs the `infra/google/**` scripts in dependency order — API enablement, workload identity, IAM roles, billing, GA4, the GA4-in-BigQuery dataset, then the OAuth client check — each in plan mode on a pull request and apply mode on a push to `main` or a manual dispatch with `apply: true`.
Files: .github/workflows/google-apply.yml

### Verify third-party console configuration against declared state
`infra-apply.yml` runs one read-only verification step per third-party provider that publishes no management API of its own — Companies House, HMRC, Stripe, PayPal, Telegram — asserting live state against the file each provider's `infra/**` directory declares; its `github-sync` step plans (never applies) this repository's own GitHub settings from `infra/github/github.toml` (merge settings, Actions permissions, Dependabot, the `main` ruleset, and secret/variable names) via `gh api`, with the actual `--apply` run by a person holding `ADMIN_TOKEN`; `telegram-assert.js` performs the equivalent check for the Telegram bot declared in `infra/telegram/telegram.toml`, confirming `getMe`/`getChat` resolve and no webhook is set.
Files: .github/workflows/infra-apply.yml, infra/github/github-sync.js, infra/github/github.toml, infra/telegram/telegram-assert.js, infra/telegram/telegram.toml, app/unit-tests/scripts/telegramAssert.test.js, app/unit-tests/scripts/githubSync.test.js, app/unit-tests/scripts/githubSync.test.js

### Serialize workflow jobs that rotate a lane's test user
`laneUserWorkflowConcurrency.test.js` parses every workflow file and checks that each job invoking `ensure-cognito-test-user.js` for a behaviour-test lane declares a job-level concurrency group named for that environment and lane, without `cancel-in-progress` — two such jobs racing the same durable Cognito user (a deploy's probe and a scheduled probe, say) would otherwise leave one mid-test with its bundle purged out from under it.
Files: app/unit-tests/laneUserWorkflowConcurrency.test.js

### Enforce workflow-to-workflow permission grants
`check-workflow-permissions.mjs` statically re-derives GitHub's own reusable-workflow permission check — that every `permissions:` scope a called workflow's jobs use was granted by the caller — with a line-based reader rather than a YAML parser, catching what `actionlint` does not and what otherwise only fails at run start with no per-job log.
Files: scripts/check-workflow-permissions.mjs, app/unit-tests/scripts/checkWorkflowPermissions.test.js

### Validate GitHub Actions workflow files
`validate-workflows.sh` parses every `.github/workflows/*.yml` and checks syntax, required environment variables and deployment-safety conventions.
Files: scripts/validate-workflows.sh

### Verify a triage draft-PR stays in scope
`verify-draft-pr-scope.mjs` decides whether a triage-generated draft PR may be marked ready for review: every file it touches must be one of the alarm family's own remedy row paths (`loadRemedyRow`/`touchesOnlyAllowedPaths`), failing closed on an empty diff, an unknown family, or a family whose remedy isn't `draft-pr`, so only the narrow fixes a remedy row names in advance ever leave draft.
Files: scripts/verify-draft-pr-scope.mjs, app/unit-tests/scripts/verifyDraftPrScope.test.js

### Manage AWS Secrets Manager entries and rotation tags
`manage-secrets.yml` lists, checks, backs up and restores secrets (including the user-sub-hash salt) for an environment; `put-secret-with-rotation-tag.sh` writes or updates a secret and stamps a `rotated-at` tag only when the value it's about to write differs, since every environment deploy otherwise rewrites every secret and Secrets Manager's own `LastChangedDate` would read as "last deploy" rather than "last rotation"; `secrets-rotation.toml` records which console each secret's value comes from and the last rotation date a person confirmed.
Files: .github/workflows/manage-secrets.yml, scripts/put-secret-with-rotation-tag.sh, secrets-rotation.toml

### Hash and rotate the subject-ID salt
`subHasher.js` computes salted HMAC hashes of Cognito subject IDs for analytics/fraud-header anonymization, backed by `SubHashSaltHelper` on the CDK side; `put-salt-secret-resource-policy.sh` reasserts the salt secret's resource policy on every environment deploy (allow the account, deny any role ARN outside the `<env>-*-app-*` / `<env>-env-*` pattern, since the secret exists before any per-deployment Lambda role does); `backup-salts.sh` and `restore-salt.sh` export and re-apply the salt for disaster recovery; migrations 001 and 002 converted the stored salt from a raw string to a versioned JSON registry and backfilled `saltVersion` onto existing DynamoDB items.
Files: app/services/subHasher.js, app/unit-tests/services/subHasher.test.js, infra/main/java/co/uk/diyaccounting/submit/utils/SubHashSaltHelper.java, scripts/put-salt-secret-resource-policy.sh, scripts/backup-salts.sh, scripts/aws-accounts/restore-salt.sh, scripts/migrations/001-convert-salt-to-registry.js, scripts/migrations/002-backfill-salt-version-v1.js

### Run DynamoDB data migrations
`runner.js` is an EF-Migrations-style runner: numbered scripts in `scripts/migrations/` each export an `up()` and a `phase` (`pre-deploy`/`post-deploy`), applied migrations are tracked in the bundles table, and `run-migrations.yml` invokes it manually; migrations 005 and 006 together rename bundle records' `qualifiers.sandbox` field to `qualifiers.synthetic` across a deploy boundary — 005 copies the value forward pre-deploy while old code still reads the old field, 006 backfills any stragglers and drops the old field post-deploy — both idempotent and honouring `MIGRATION_DRY_RUN`.
Files: scripts/migrations/runner.js, scripts/migrations/005-copy-sandbox-qualifier-to-synthetic.js, scripts/migrations/006-drop-sandbox-qualifier.js, app/unit-tests/migrations/005-copy-sandbox-qualifier-to-synthetic.test.js, app/unit-tests/migrations/006-drop-sandbox-qualifier.test.js, app/unit-tests/migrations/runner.test.js, .github/workflows/run-migrations.yml

### Generate a software bill of materials
Workflow that generates an SBOM for the application and publishes it.
Files: .github/workflows/sbom.yml

### Run a Claude security review on push
Triggers a Claude session to review changed code for security issues on push.
Files: .github/workflows/security-review.yml

### Detect CloudFormation drift
Scheduled workflow that runs CloudFormation drift detection across the deployed stacks to surface manual changes made outside CDK.
Files: .github/workflows/stack-drift.yml

### Run the automated test suite in CI
Workflow triggered on push and PR that runs the unit, system, browser and behaviour test tiers.
Files: .github/workflows/test.yml

### Verify backup health daily
Checks PITR status, the local backup vault, and backup/copy job outcomes, including the cross-account copy to the backup account.
Files: .github/workflows/verify-backups.yml

### Raise an issue from a probe-test failure
Triggered when the main deploy's probe tests fail; opens a `[PROBE]` issue carrying the failure detail.
Files: .github/workflows/probe-failure-issue.yml

### Run probe tests against deployed environments
End-to-end probe tests that exercise a live `ci` or `prod` deployment to confirm it is working after a deploy.
Files: .github/workflows/probe-test.yml

### Request and renew the holding-page certificate
Requests an ACM certificate for the holding-page domain, or renews the existing one.
Files: .github/workflows/request-holding-cert.yml

### Drill and test PITR database restoration
`restore-dynamodb-pitr.sh` restores a DynamoDB table to a point-in-time or target table; `restore-drill.yml` runs the drill on a schedule to prove the procedure still works, `restore-test.yml` runs a restore from PITR or the cross-account backup on demand, and `_developers/RESTORE_DRILL.md` documents the procedure both follow.
Files: .github/workflows/restore-drill.yml, .github/workflows/restore-test.yml, scripts/restore-dynamodb-pitr.sh, _developers/RESTORE_DRILL.md

### Publish build artifacts and documentation
Workflow that publishes build artifacts (npm packages, Docker images) and generated documentation to their destinations.
Files: .github/workflows/publish.yml

### Auto-record demo videos on prod deploy
`video-capture-on-deploy.yml` runs after `deploy.yml` and dispatches `video-capture.yml` to re-record the scene videos for whichever pages changed; `video-capture.yml` itself records one scene script (`videos/*.json`) against a running deployment via `site-video-capture.js`.
Files: .github/workflows/video-capture-on-deploy.yml, .github/workflows/video-capture.yml

### Verify YouTube channel consistency weekly
Weekly check that the stored YouTube refresh token and channel state are still valid, run as `github-actions[bot]`.
Files: .github/workflows/youtube-check.yml

### Document multi-account AWS architecture
Describes the six-account structure (management, gateway, spreadsheets, submit-ci, submit-prod, submit-backup) and the security/isolation rationale behind it.
Files: AWS_ARCHITECTURE.md

### Track and analyze AWS spending
Documents cost-tracking methodology, monthly spend and cost-optimization strategies.
Files: AWS_COSTS.md

### Guide GitHub repository configuration
Setup instructions for branch protection, OIDC trust, required status checks and webhooks.
Files: GITHUB_SETUP.md

### Report accessibility penetration testing
Findings from an accessibility penetration test of the deployed site.
Files: REPORT_ACCESSIBILITY_PENETRATION.md

### Report identity audit findings
Findings from an audit of the repository's commit-identity and signing controls.
Files: REPORT_IDENTITY_AUDIT.md

### Runbook information-security operations
Operational runbook for information-security incidents and controls, including the cross-account user hold `force-logout-all-users.sh` implements section 6.6 of.
Files: RUNBOOK_INFORMATION_SECURITY.md

### Document security policy and disclosure
Security policy and vulnerability-disclosure procedure for the repository.
Files: SECURITY.md

### Design CI branch deploys off the apex
Architecture document for deploying feature branches to CI hosts without touching the prod apex.
Files: _developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md

### Guide ICO/GDPR compliance
Checklist against UK GDPR/ICO requirements for this service.
Files: _developers/ICO_CHECKLIST.md

### Provision and assume roles for test-user provisioning
`provision-user.mjs` creates a Cognito test user with generated credentials for local or CI use; `provision-user.sh` wraps it with freshly generated `TEST_AUTH_USERNAME`/`TEST_AUTH_PASSWORD`, after `aws-assume-user-provisioning-role.sh` assumes the external user-provisioning role.
Files: app/bin/provision-user.mjs, app/system-tests/provisionUser.system.test.js, scripts/provision-user.sh, scripts/aws-assume-user-provisioning-role.sh

### Assume and clear local AWS deployment credentials
`aws-assume-submit-deployment-role.sh` assumes the `submit-deployment-role` into the current shell's `AWS_*` variables for local deploy/debug work; `aws-unset-iam-session.sh` clears them again afterwards.
Files: scripts/aws-assume-submit-deployment-role.sh, scripts/aws-unset-iam-session.sh

### Query and persist per-consumer security-state records
`dynamoDbSecurityStateRepository.js` is the repository for the `{env}-env-security-state` table's three short-TTL item shapes: `rate#` bundle-endpoint burst counters, `supportticket#` rate limiting, and `geo#` mid-session country state used by the data-theft detection Lambdas.
Files: app/data/dynamoDbSecurityStateRepository.js, app/unit-tests/data/dynamoDbSecurityStateRepository.test.js

### Serve CloudFront custom error pages
`errorPageHandler.js` is the CloudFront@Edge viewer-request handler that renders the right static page for each HTTP error status via `errorPageHtml.js`; the `web/public/errors/*.html` pages are the served output and `error-page.js` is the web component that displays error-page detail in the app shell.
Files: app/functions/edge/errorPageHandler.js, app/functions/edge/errorPageHtml.js, app/unit-tests/edge/errorPageHandler.test.js, web/public/errors/403.html, web/public/errors/404.html, web/public/errors/404-error-distribution.html, web/public/errors/404-error-origin.html, web/public/errors/500.html, web/public/errors/502.html, web/public/errors/503.html, web/public/errors/504.html, web/public/widgets/error-page.js

### Enable DynamoDB point-in-time recovery on deploy
`ensurePitr.mjs` is a CloudFormation custom resource that calls `DescribeTable`/`UpdateContinuousBackups` to turn on PITR for a table, idempotently, at deploy time.
Files: app/functions/infra/ensurePitr.mjs, app/unit-tests/functions/ensurePitr.test.js

### Forward operational activity events to Telegram
`activityTelegramForwarder.js` routes EventBridge activity events to the right Telegram group, formatting the message and resolving chat routing per event type.
Files: app/functions/ops/activityTelegramForwarder.js, app/unit-tests/functions/activityTelegramForwarder.test.js

### Create GitHub issues from CloudWatch alarms
`alarmToGithubIssue.js` is the EventBridge target Lambda for `aws.cloudwatch` Alarm State Change events: it opens a `[ALARM]` GitHub issue keyed on the alarm's family (the alarm name with its deployment slug removed, via `alarmName.js`) so every deployment of the same check shares one rolling issue, or comments on the existing one; `dynamoDbAlarmIssueLockRepository.js` claims each state-change transition with a conditional put so two deployments that receive the same transition don't both raise an issue.
Files: app/functions/ops/alarmToGithubIssue.js, app/unit-tests/functions/alarmToGithubIssue.test.js, app/data/dynamoDbAlarmIssueLockRepository.js, app/lib/alarmName.js, app/unit-tests/lib/alarmName.test.js

### Forward Bedrock budget alerts
Relays AWS Bedrock cost and token-limit alerts to the operations channel.
Files: app/functions/ops/bedrockBudgetAlertForward.js, app/unit-tests/functions/bedrockBudgetAlertForward.test.js

### Detect 404 scan-rate attacks
`scanRate404Detect.js` runs every five minutes over the `cloudfront_requests` Glue table (CloudFront access logs) looking for one client IP raising more than a configured threshold of 404s in a minute against one distribution; `ScanDetectionStack` owns the Lambda and its EventBridge schedule, reading access logs rather than CloudTrail (it creates no VPC Flow Logs).
Files: app/functions/security/scanRate404Detect.js, app/unit-tests/functions/scanRate404Detect.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/ScanDetectionStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ScanDetectionStackTest.java

### Detect WAF-blocked scan attacks
`wafScanDetect.js` is subscribed to the WAF access-log group's blocks-only CloudWatch Logs subscription filter (wired in `EdgeStack`): each invocation decodes a gzipped batch of log records and turns every request the `SensitivePathScan` WAF rule blocked into an ops Telegram alert; `verify-waf-false-positives.sh` audits CloudFront access logs for requests WAF blocked and flags likely false positives.
Files: app/functions/security/wafScanDetect.js, app/unit-tests/functions/wafScanDetect.test.js, scripts/verify-waf-false-positives.sh

### Run nightly Security Lake analysis
`securityLakeNightly.js` analyzes the previous day's AWS Security Lake data for threats and suspicious patterns; `SecurityLakeStack` and `SecurityLakeTables` provision the Security Lake sources and Glue/Athena tables it reads.
Files: app/functions/security/securityLakeNightly.js, app/unit-tests/functions/security/securityLakeNightly.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/security/SecurityLakeStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/security/SecurityLakeTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/security/SecurityLakeStackTest.java

### Gather alarm evidence for investigation
`alarmEvidence.js` is a pure mapping from a CloudWatch alarm to the log groups, X-Ray filters, DynamoDB tables and console links an operator needs, via an ordered rule list with unconditional fallbacks so every alarm resolves to something; `alarmWindow.js` turns an alarm state-change event into the absolute time window those evidence queries should use, with a margin that floors at five minutes and caps at one hour to cover CloudWatch/log delivery lag without burying the signal; `resolve-alarm-evidence.mjs` is the CLI that runs this from an alarm.
Files: app/lib/alarmEvidence.js, app/unit-tests/lib/alarmEvidence.test.js, app/lib/alarmWindow.js, app/unit-tests/lib/alarmWindow.test.js, scripts/resolve-alarm-evidence.mjs, app/unit-tests/scripts/resolveAlarmEvidence.test.js

### Silence alarms during deployment teardown
`alarmSilence.js` reads an SSM parameter a deployment's teardown writes before it deletes anything, and the alarm-to-GitHub-issue and Telegram-forwarder routers drop any ALARM state change for a silenced deployment; `silence-deployment-alarms.mjs` is the CLI that arms and clears the silence around a deployment window.
Files: app/lib/alarmSilence.js, app/unit-tests/lib/alarmSilence.test.js, scripts/silence-deployment-alarms.mjs

### Verify an alarm issue's claimed transition against CloudWatch history
`verify-alarm-origin.mjs` re-reads `cloudwatch describe-alarm-history` to confirm the alarm an issue names transitioned to ALARM inside the window the issue body claims; it fails closed (a missing name, an unparseable window, an AWS error, or no matching transition all return `verified: false`), and `alarm-triage.yml` exits non-zero on an unverified result so triage never runs on an unproven claim.
Files: scripts/verify-alarm-origin.mjs, app/unit-tests/scripts/verifyAlarmOrigin.test.js

### Track an alarm family's daily remedy budget
`remedy-budget-remaining.mjs` counts how many `remedy:*` labels an alarm family has already had applied today against its `budgetPerDay` (declared per family, tested via `alarmRemedies.test.js`), so `alarm-triage.yml` stops auto-remediating (dispatching a workflow, marking a draft PR ready) once a family's daily budget is spent; fails closed toward giving budget back, never toward denying it.
Files: scripts/remedy-budget-remaining.mjs, app/unit-tests/scripts/remedyBudgetRemaining.test.js, app/unit-tests/data/alarmRemedies.test.js

### Build AWS console deep links for operators
`consoleLinks.js` generates direct URLs into the AWS console (CloudWatch logs, alarms, X-Ray) so an operator investigating an alert can jump straight to the relevant resource.
Files: app/lib/consoleLinks.js, app/unit-tests/lib/consoleLinks.test.js

### Mask and redact sensitive data from logs
`dataMasking.js` redacts PII and secret values from log output and other text before it is written or shared.
Files: app/lib/dataMasking.js, app/unit-tests/lib/dataMasking.test.js

### Provide a shared DynamoDB client
`dynamoDbClient.js` centralizes AWS SDK DynamoDB client construction and configuration, and resource-name resolution, for every repository/Lambda that talks to DynamoDB.
Files: app/lib/dynamoDbClient.js

### Emit CloudWatch EMF metrics
`emfMetrics.js` formats and writes structured metrics in Embedded Metric Format so CloudWatch extracts them from Lambda log lines without a separate PutMetricData call.
Files: app/lib/emfMetrics.js, app/unit-tests/lib/emfMetrics.test.js

### Validate required environment variables at Lambda startup
`env.js` checks that the environment variables a Lambda needs are set before it starts handling events, failing fast rather than partway through a request.
Files: app/lib/env.js

### Obtain and use GitHub App / API tokens
`githubAppToken.js` mints short-lived GitHub App installation tokens for API access; `gitHubHelpers.js` provides the higher-level helpers (creating issues, comments, releases) built on top of them.
Files: app/lib/githubAppToken.js, app/lib/gitHubHelpers.js, app/unit-tests/lib/gitHubHelpers.test.js, app/unit-tests/lib/githubAppToken.test.js

### Provide structured, PII-redacting logging
`logger.js` creates a Pino logger that writes structured JSON to CloudWatch, redacting PII fields (proved by `loggerPiiRedaction.test.js`) before a line is emitted.
Files: app/lib/logger.js, app/unit-tests/lib/loggerPiiRedaction.test.js

### Process SQS message batches in Lambda workers
`sqsWorkerHelper.js` orchestrates a Lambda's SQS-triggered batch processing, including per-record error handling so one bad message doesn't fail the whole batch.
Files: app/lib/sqsWorkerHelper.js

### Orchestrate demo-video recording journeys
`capture-demo-videos.js` and `site-video-capture.js` drive Playwright through a scene script (`videos/*.json`) end to end; `journey.js` stands up the local services and mints the HMRC sandbox test user a logged-in scene needs, `behaviourSteps.js` bridges into the same step functions the behaviour tests use (via `appAliasHook.js`'s `@app/*` resolution), `actions.js` dispatches each scene step to a Playwright locator and drives the on-screen overlay cue, `waitPhase.js` brackets a step's real network wait for the timer pill, `pacing.js` is the pure pacing arithmetic (group pauses, wait compression), and `values.js` resolves `{{...}}` placeholders (VAT number, NINO, dates) so nothing is hard-coded against HMRC's rolling test-data windows.
Files: scripts/capture-demo-videos.js, scripts/site-video-capture.js, scripts/lib/video/capture.js, scripts/lib/video/journey.js, scripts/lib/video/behaviourSteps.js, scripts/lib/video/appAliasHook.js, scripts/lib/video/actions.js, scripts/lib/video/waitPhase.js, scripts/lib/video/pacing.js, scripts/lib/video/values.js, app/unit-tests/video/journey.test.js, app/unit-tests/video/pacing.test.js, app/unit-tests/video/waitPhase.test.js, app/unit-tests/video/values.test.js, behaviour-tests/captureDemo.behaviour.test.js

### Overlay pointer and caption cues on captured video
`overlay-runtime.js` is a self-contained in-page script (no imports, no bundler) installed via `page.addInitScript` so the pointer/trail/caption/timer overlay survives every navigation in the tour; `overlay.js` is the Node-side wrapper that reads it as text and installs it.
Files: scripts/lib/video/overlay.js, scripts/lib/video/overlay-runtime.js

### Encode captured video frames and generate captions
`encode.js` builds the ffmpeg concat-demuxer manifest from the frame ledger `capture.js` writes and shells out to `ffmpeg` (via `ffmpeg-static`) to produce the constant-fps H.264 output; `captions.js` generates the WebVTT and transcript from the same step record, so the SC 1.2.1 text alternative always matches the video that was built; `playwright-video-reporter.js` copies a Playwright test's recorded video to a stable path for downstream tooling.
Files: scripts/lib/video/encode.js, scripts/lib/video/captions.js, app/unit-tests/video/encode.test.js, app/unit-tests/video/captions.test.js, scripts/playwright-video-reporter.js

### Validate video scene scripts and timing
`scriptSchema.js` is a hand-rolled validator for a scene script against `videos/scene-script.schema.json`, throwing on any bad path rather than skipping it; `checks.js` runs the acceptance checks (timings match config, timer markers, typing cadence) against a recorded timeline; `check-video-timings.js` runs those checks from the CLI; `video-scenes-to-record.mjs` diffs git to find which scene files changed, and `video-scripts-for-changed-files.mjs` finds which scene scripts reference a given set of changed code files, so only the affected scenes are re-recorded.
Files: scripts/lib/video/scriptSchema.js, scripts/lib/video/checks.js, scripts/check-video-timings.js, scripts/video-scenes-to-record.mjs, scripts/video-scripts-for-changed-files.mjs, app/unit-tests/video/scriptSchema.test.js, app/unit-tests/video/checks.test.js, app/unit-tests/video/scenesToRecord.test.js, app/unit-tests/scripts/videoScriptsForChangedFiles.test.js, app/unit-tests/videoScenePages.test.js

### Redact secrets from video artefacts
`secrets.js` scans every text artefact a recording produces — captions, `.vtt`, transcript, timeline, overlay event log — for the real credentials a logged-in scene typed, and treats a hit as a hard failure rather than a post-hoc redaction, since none of it may reach the shipped video.
Files: scripts/lib/video/secrets.js, app/unit-tests/video/secrets.test.js

### Publish demo videos to YouTube
`youtube-upload.js` uploads a local video file to YouTube (unlisted or public), reading title/description/tags/caption file per video from `videos/publish.json` (documented in `videos/PUBLISH.md`) and using `selectPendingUploads` to skip ones already published; `copy-videos-manifest.js` keeps the video manifest in sync between source and destination directories.
Files: scripts/youtube-upload.js, app/unit-tests/scripts/youtubeUpload.test.js, scripts/copy-videos-manifest.js, videos/PUBLISH.md, web/unit-tests/videos-manifest.test.js

### Play demo videos on the public site
`videos.html` is the public page listing the recorded product demos; the browser test proves playback controls (play, pause, fullscreen, captions).
Files: web/public/videos.html, web/browser-tests/videos.browser.test.js

### Serve the root-domain holding page
Static HTML page served at the `diyaccounting.co.uk` root that redirects visitors to the `submit` subdomain.
Files: web/holding/index.html

### Generate WCAG accessibility compliance rows
`compliance-accessibility-rows.js` parses WCAG 2.2 manual review results into rows for the board/compliance dashboard; `wcag22-manual-review.js` compiles the manual testing results (keyboard nav, screen reader, contrast) that feed it.
Files: scripts/compliance-accessibility-rows.js, app/unit-tests/scripts/complianceAccessibilityRows.test.js, scripts/wcag22-manual-review.js

### Scan pages for accessibility violations
`axe-quickscan.mjs` injects axe-core into Playwright-driven pages from the CDN allowlist and runs it (a workaround for a broken local `npx axe` CLI); `text-spacing-test.js` checks WCAG 1.4.12 text-spacing compliance (line height, paragraph/letter/word spacing) across the same page set.
Files: scripts/axe-quickscan.mjs, scripts/text-spacing-test.js

### Compile the compliance audit report
`generate-compliance-report.js` aggregates WCAG, fraud-header and VAT-logic test results into a pass/fail compliance report with evidence links; the behaviour test proves the HMRC MTD privacy-and-terms compliance journey.
Files: scripts/generate-compliance-report.js, behaviour-tests/compliance.behaviour.test.js

### Bootstrap the CDK toolkit across AWS accounts
`bootstrap-cdk.sh` bootstraps the CDK toolkit stack in one account, or every account (`all`), with cross-account trust relationships to a nominated trust account.
Files: infra/aws-accounts/bootstrap-cdk.sh

### Bootstrap the AWS Organization structure
`bootstrap-organization.sh` verifies the AWS Organization's structure, creates organizational units, and documents current state; it assumes the organization itself was already created in the console.
Files: infra/aws-accounts/bootstrap-organization.sh

### Create or invite AWS member accounts
`create-member-account.sh` creates or invites a member account into the organization, moves it between OUs, and reports status, via `create`/`invite`/`move`/`status` subcommands.
Files: infra/aws-accounts/create-member-account.sh

### Set up cross-account backup IAM roles
`setup-backup-roles.sh` creates the backup vault in the backup account and configures the cross-account IAM permissions that let source accounts back up into it.
Files: infra/aws-accounts/setup-backup-roles.sh

### Set up GitHub OIDC deployment roles
`setup-oidc-roles.sh` creates the OIDC identity provider and the GitHub Actions deployment role for one environment/account pair.
Files: infra/aws-accounts/setup-oidc-roles.sh

### Verify the multi-account AWS setup
`verify-setup.sh` runs a battery of checks confirming the multi-account structure (OIDC roles, backup roles, organization units) is complete and functional.
Files: infra/aws-accounts/verify-setup.sh

### Copy production data to the backup account for migration
`backup-prod-for-migration.sh` copies production DynamoDB tables into the backup account ahead of an account migration.
Files: scripts/aws-accounts/backup-prod-for-migration.sh

### Bootstrap a new AWS account for CDK prerequisites
`bootstrap-account.sh` creates the IAM roles and S3 buckets a fresh AWS account needs before CDK can deploy into it.
Files: scripts/aws-accounts/bootstrap-account.sh

### Replicate secrets across AWS accounts
`copy-secrets-to-account.sh` copies Secrets Manager entries from a source account to a deployment account during a migration.
Files: scripts/aws-accounts/copy-secrets-to-account.sh

### List production Secrets Manager entries
`list-prod-secrets.sh` enumerates the Secrets Manager entries present in the production environment.
Files: scripts/aws-accounts/list-prod-secrets.sh

### Backfill TTL on existing DynamoDB records
`set-ttl-on-existing-records.sh` sets the time-to-live attribute on DynamoDB items (HMRC receipts, old logs) that predate the table's TTL configuration, so they age out automatically.
Files: scripts/aws-accounts/set-ttl-on-existing-records.sh

### Disaster-recovery restore into a new prod account
`dr-restore-from-backup-account.sh` restores a new prod AWS account from the backup account's vault as a full disaster-recovery drill; `restore-tables-from-backup.sh` restores individual DynamoDB tables from the cross-account AWS Backup vault.
Files: scripts/dr-restore-from-backup-account.sh, scripts/aws-accounts/restore-tables-from-backup.sh

### Force logout all users during a security incident
`force-logout-all-users.sh` calls Cognito's admin global-sign-out for every user in an environment's user pool as part of the cross-account hold in `RUNBOOK_INFORMATION_SECURITY.md` section 6.6, noting that refresh tokens die immediately but an already-issued access token can stay valid up to an hour.
Files: scripts/force-logout-all-users.sh

### Provision cross-account backup vaults and plans
`BackupStack` creates the AWS Backup vaults, backup plans and SNS notifications in the primary account; `CrossAccountBackupVaultStack` creates the vault in the separate backup account and grants it restore permissions; `BackupAccountAccessStack` creates the cross-account IAM roles the backup account uses to restore into the primary account; `SubmitBackupAccount` is the CDK app entrypoint that synthesizes the backup-account stacks; `setup-s3-replication.sh` configures S3 cross-account replication for backup exports; `diff-templates.mjs` diffs this stack's Java CDK synth against a parallel TypeScript rewrite of the same stack, stripping the boilerplate that differs for reasons unrelated to which language wrote it.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/BackupStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/CrossAccountBackupVaultStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/BackupAccountAccessStack.java, infra/test/java/co/uk/diyaccounting/submit/BackupStackCdkResourceTest.java, infra/main/java/co/uk/diyaccounting/submit/SubmitBackupAccount.java, infra/test/java/co/uk/diyaccounting/submit/SubmitBackupAccountCdkResourceTest.java, .github/workflows/setup-backup-account.yml, scripts/setup-s3-replication.sh, cdk-typescript/scripts/diff-templates.mjs

### Provision the API Gateway stack
`ApiStack` creates the API Gateway with Lambda integrations for the account, VAT, HMRC and billing endpoints.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/ApiStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ApiStackTest.java

### Provision the DynamoDB and S3 data stack
`DataStack` creates the application's DynamoDB tables (bundles, passes, clients, operators) and S3 buckets with encryption, PITR and TTL policies.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/DataStackTest.java

### Provision ECR image repositories
`EcrStack` creates the ECR repositories and image lifecycle policies the Lambda Docker images are pushed to.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/EcrStack.java

### Provision the Edge/CloudFront stack
`EdgeStack` creates the CloudFront distributions, edge Lambdas (including `wafScanDetect`'s subscription to the WAF log group), caching policies and custom behaviors for the web app and API.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java

### Provision the holding-page stack
`HoldingStack` serves the submit service's holding page from its own CloudFront distribution, tagged `OriginFor=<holding fqdn>` so a failover can retarget the live aliases onto it.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/HoldingStack.java

### Provision the Observability stack
`ObservabilityStack` creates the account's CloudTrail (DynamoDB data events), the account-singleton GuardDuty detector and Security Hub, the SNS topic security findings route through, and the CloudWatch dashboards/alarms/log groups the other stacks attach to; `MetricFilterLogGroupCdkResourceTest` proves the shared metric-filter-backed log group construct it uses.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ObservabilityStackTest.java, infra/test/java/co/uk/diyaccounting/submit/MetricFilterLogGroupCdkResourceTest.java

### Provision the Observability stack in us-east-1
`ObservabilityUE1Stack` creates the CloudWatch resources that must live in `us-east-1` for global services (CloudFront metrics/alarms).
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityUE1Stack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ObservabilityUE1StackTest.java

### Provision the Ops stack
`OpsStack` creates the operational Lambdas and the SNS alert topic and health canary backing deployment sweeps, user-management and health-check tasks.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/OpsStackTest.java

### Provision the Publish stack
`PublishStack` creates the S3 bucket deployment and CloudFront invalidation for the main website's web assets, importing the CloudFront distribution by attributes rather than owning it.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/PublishStack.java

### Provision the Security Baseline stack
`SecurityBaselineStack` is an account-singleton compliance baseline: it creates the AWS Config configuration recorder Security Hub's standards subscriptions need, and subscribes the account to the CIS AWS Foundations Benchmark v5.0.0 standard (replacing v1.2.0) — Security Hub itself is created in `ObservabilityStack`, this stack only depends on it existing first; synthesized only when `securityServicesEnabled` is true.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityBaselineStack.java

### Provision the Security Detection stack
`SecurityDetectionStack` creates environment-level CloudWatch alarms for scan detection and data-theft detection, built on the CloudTrail DynamoDB data events `ObservabilityStack` already collects; it imports (rather than creates) that stack's CloudTrail log group and security-findings SNS topic by naming convention, so it can be deployed and destroyed independently.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStackTest.java

### Wire the CDK application entrypoints per account
`SubmitApplication` and `SubmitEnvironment` are the CDK app entrypoints that decide which stacks synthesize for which account/environment combination, against the shared `SubmitStackProps` contract (env name, deployment name, resource prefix, CloudTrail flag, shared names) every stack implements.
Files: infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java, infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java, infra/main/java/co/uk/diyaccounting/submit/stacks/SubmitStackProps.java, infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java, infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java, infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentUE1CdkResourceTest.java

### Define shared Lambda CDK constructs
`Lambda`/`LambdaProps` and their `AbstractLambdaProps`/`AbstractApiLambdaProps` base wrap the common CDK wiring (function, alias, health alarm) every Lambda-backed stack reuses; `ApiLambda`/`ApiLambdaProps` and `AsyncApiLambda`/`AsyncApiLambdaProps` specialize it for synchronous and async API integrations, and `EdgeLambdaConstruct`/`EdgeLambdaProps` for CloudFront@Edge functions.
Files: infra/main/java/co/uk/diyaccounting/submit/constructs/AbstractApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AbstractLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/ApiLambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/ApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AsyncApiLambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AsyncApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaConstruct.java, infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/Lambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/LambdaProps.java

### Name and tag CDK resources consistently
`SubmitSharedNames`, `LambdaNames`/`LambdaNameProps` and `ResourceNameUtils` derive consistent, IAM-safe (max 64 char) AWS resource names from a domain/deployment identifier; `CostAllocationTags` applies cost-allocation tags across every stack; `RetentionDaysConverter` maps an integer day count onto the CloudWatch Logs `RetentionDays` enum.
Files: infra/main/java/co/uk/diyaccounting/submit/CostAllocationTags.java, infra/main/java/co/uk/diyaccounting/submit/LambdaNameProps.java, infra/main/java/co/uk/diyaccounting/submit/LambdaNames.java, infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java, infra/main/java/co/uk/diyaccounting/submit/utils/ResourceNameUtils.java, infra/test/java/co/uk/diyaccounting/submit/utils/ResourceNameUtilsTest.java, infra/main/java/co/uk/diyaccounting/submit/utils/RetentionDaysConverter.java, infra/test/java/co/uk/diyaccounting/submit/utils/RetentionDaysConverterTest.java

### Provide config-composition helpers for CDK code
`Kind` is a set of tiny, static, null-tolerant helpers (order-preserving maps, explicit merge, no double-brace hacks) that make Java CDK config code read like JS/Node config, documented in `KIND.md`; `KindCdk` builds on it for CDK-specific concerns (environment setup, CloudFormation outputs, `AwsCustomResource` provider management); `PopulatedMap` extends `HashMap` to throw on any blank key or value.
Files: infra/main/java/co/uk/diyaccounting/submit/utils/Kind.java, infra/main/java/co/uk/diyaccounting/submit/utils/KindCdk.java, infra/main/java/co/uk/diyaccounting/submit/utils/KIND.md, infra/main/java/co/uk/diyaccounting/submit/utils/PopulatedMap.java, infra/test/java/co/uk/diyaccounting/submit/utils/KindTest.java, infra/test/java/co/uk/diyaccounting/submit/utils/KindCdkTest.java

### Upsert Route53 alias records via custom resource
`Route53AliasUpsert` provides an idempotent UPSERT of a Route53 alias record pointing at a CloudFront distribution, implemented as an `AwsCustomResource` since CDK's L2 constructs don't expose one.
Files: infra/main/java/co/uk/diyaccounting/submit/utils/Route53AliasUpsert.java

### Generate S3 lifecycle rules for storage tiering
`S3` generates CloudFormation S3 `LifecycleRule` configurations for intelligent tiering (Infrequent Access after 30 days, Glacier after 90) and object expiration.
Files: infra/main/java/co/uk/diyaccounting/submit/utils/S3.java, infra/test/java/co/uk/diyaccounting/submit/utils/S3Test.java

### Configure Lambda/CDK application logging
Log4j2 YAML configuration defining log appenders, patterns and retention for the Java CDK application's own logging (main and test resources).
Files: infra/main/resources/log4j2.yml, infra/test/resources/log4j2.yml

### Track runtime and dependency lifecycle
`lifecycle.toml` tracks Lambda/Synthetics runtime versions, dependencies and certificates approaching end-of-life, with the action taken recorded against each.
Files: lifecycle.toml

### Monitor GitHub Actions CI from the command line
`watch-ci.sh` polls the GitHub API to watch a CI workflow run until it completes, tailing logs and reporting failures to the console.
Files: scripts/watch-ci.sh

### Look up domains and CloudFront distributions by convention
`list-domains.sh` lists every `ci-`/`prod-` DNS record under the `submit` subdomain from Route53; `lookup-cloudfront-distribution.sh` prints the live CloudFront distribution ID serving an origin domain, preferring the `EdgeStack` stack output and falling back to the `OriginFor` tag, confirming every candidate against `get-distribution` since the tag index can lag a deletion.
Files: scripts/list-domains.sh, scripts/lookup-cloudfront-distribution.sh

### Retrieve CloudFormation stack outputs
`stack-output.js` queries a named CloudFormation stack and extracts its output values (URLs, table names, ARNs) for scripts and tests to consume.
Files: scripts/stack-output.js

### Export Cognito users for reporting or backup
`export-cognito-users.sh` lists every user in a Cognito user pool and exports their attributes (email, sub, status) to CSV or JSON.
Files: scripts/export-cognito-users.sh

## Analytics and finance

### Publish activity events to the EventBridge bus
`publishActivityEvent`/`publishActivityFailureEvent` in `app/lib/activityAlert.js` send structured events (event name, site, summary, actor class, flow, hashed sub, client id) to the `ACTIVITY_BUS_NAME` EventBridge bus, fire-and-forget for every caller across the app. `ActivityStack.java` provisions that bus (`activityBus`) and a rule that forwards every event to a Telegram-forwarding Lambda.
Files: app/lib/activityAlert.js, app/unit-tests/lib/activityAlert.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/ActivityStack.java

### Transform activity events into lake rows
`activityEventTransform.js` is the Kinesis Firehose transformation Lambda for the activity-event delivery stream: it flattens each EventBridge envelope into one flat JSON row per line (event_id, event_ts, actor, flow, outcome, hashed_sub, and so on), converting timestamps to the space-separated form the Parquet OpenX deserializer needs. A record that fails to parse comes back `ProcessingFailed` so Firehose routes it to the error prefix instead of dropping it.
Files: app/functions/analytics/activityEventTransform.js, app/unit-tests/analytics/activityEventTransform.test.js

### Transform alarm state changes into lake rows
`alarmStateChangeTransform.js` is the Firehose transformation Lambda for the alarm-state-change delivery stream, flattening each CloudWatch Alarm State Change EventBridge envelope (alarm name, family, deployment slug, state, previous state, reason, threshold) into one row per line. `AlarmStateChangeDelivery.java` provisions the EventBridge rule on the default bus (matching the `{env}-` alarm prefix), the Firehose delivery stream and the Glue table it writes into.
Files: app/functions/analytics/alarmStateChangeTransform.js, app/unit-tests/analytics/alarmStateChangeTransform.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AlarmStateChangeDelivery.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/AlarmStateChangeDeliveryTest.java

### Stream DynamoDB table changes into the lake
`dynamoStreamToFirehose.js` is one Lambda serving four DynamoDB Streams event source mappings (receipts, bundles, subscriptions, passes). Each record is redacted through a per-table field whitelist (`projectReceipt`/`projectBundle`/`projectSubscription`/`projectPass`) and forwarded via Firehose `PutRecordBatch` to that table's own delivery stream; a record that fails to project or deliver comes back as a `batchItemFailure` by sequence number. `TableChangeDelivery.java` provisions the consumer Lambda, one delivery stream and one Glue table per source table.
Files: app/functions/analytics/dynamoStreamToFirehose.js, app/unit-tests/analytics/dynamoStreamToFirehose.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/TableChangeDelivery.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/TableChangeDeliveryTest.java

### Create or replace Athena business views via custom resource
`createView.mjs` is a CDK custom-resource handler pair (`onEvent`/`isComplete`) that submits a view's `CREATE OR REPLACE VIEW` to Athena and polls `GetQueryExecution` to a terminal state before CloudFormation reports success, so a bad view definition fails the stack instead of leaving the view silently absent. `BusinessViews.java` wires one Provider-backed `CustomResource` (plus a `CfnNamedQuery`) per SQL file under `infra/main/resources/analytics/views` for the operator-facing business views.
Files: app/functions/analytics/createView.mjs, app/unit-tests/analytics/createView.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViews.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViewsTest.java

### Run Glue Data Quality checks
`dataQualityRun.js` registers any S3 partitions missing from the Glue catalog (year/month/day, or a single `dt` scheme for dora_runs) and starts one Glue Data Quality ruleset evaluation run per configured target table (activity_events, alarm_state_changes, dora_runs); it does not wait for the run to finish, since Glue publishes its own pass/fail CloudWatch metric. `DataQuality.java` provisions the ruleset(s), the CloudWatch alarm on the failed-rules metric, the evaluation IAM role and the runner Lambda.
Files: app/functions/analytics/dataQualityRun.js, app/unit-tests/analytics/dataQualityRun.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/DataQuality.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/DataQualityTest.java

### Pull GA4 daily BigQuery aggregate tables into the lake
`ga4DailyPull.js` copies one D-2 day of each of BigQuery's four one-stop-dashboard aggregate tables (sessions_by_host_source_daily, funnel_steps_daily, key_events_daily, downloads_by_product_daily), which are maintained by scheduled queries declared in `infra/google/gcp/bigquery.toml`, into the lake as gzipped NDJSON. `Ga4DailyTables.java` provisions the matching Glue tables with `dt` partition projection.
Files: app/functions/analytics/ga4DailyPull.js, app/unit-tests/analytics/ga4DailyPull.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4DailyTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4DailyTablesTest.java

### Pull GA4 Data API reports and BigQuery event export into the lake
`ga4ReportPull.js` pulls the previous day's three GA4 Data API reports (traffic, pages, events) via `BetaAnalyticsDataClient` and writes them as gzipped NDJSON. `ga4EventExportPull.js` pulls one D-2 day of GA4's raw BigQuery event export (one row per event with a session id, for building funnels the aggregated reports cannot); both authenticate through workload identity federation. `Ga4Tables.java` provisions `ga4_traffic`/`ga4_pages`/`ga4_events` (from the Data API pull) and `ga4_bq_events` (from the event export).
Files: app/functions/analytics/ga4ReportPull.js, app/unit-tests/analytics/ga4ReportPull.test.js, app/functions/analytics/ga4EventExportPull.js, app/unit-tests/analytics/ga4EventExportPull.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4Tables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4TablesTest.java, app/unit-tests/ga4BigQueryDatasetIdEnvFiles.test.js

### Pull GitHub operator-effort data into the lake
`operatorEffortPull.js` pulls one UTC day of GitHub Actions runs, repo-wide issue timeline events and commits through the REST API (using a GitHub App installation token), tagging each commit `has_claude_coauthor` from its "Co-Authored-By: Claude" trailer rather than author identity, and writes them as NDJSON under `curated/operator/`. `OperatorEffortTables.java` provisions the three Glue tables (`github_workflow_runs`, `github_issue_events`, `github_commits`) behind `v_operator_interventions_daily`.
Files: app/functions/analytics/operatorEffortPull.js, app/unit-tests/analytics/operatorEffortPull.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/OperatorEffortTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/OperatorEffortTablesTest.java

### Publish the nightly operator dashboard snapshot
`operatorSnapshotPublish.js` reads the analytics views behind the eight one-stop objectives and writes one JSON snapshot per environment (trailing 30/90-day windows, value, trend, deep link) to `s3://<lake>/snapshots/<env>/latest.json`; the dashboard's API route never queries Athena directly. `OperatorSnapshotPublish.java` provisions the Lambda and its own EventBridge rule/schedule inside `AnalyticsStack`.
Files: app/functions/analytics/operatorSnapshotPublish.js, app/unit-tests/analytics/operatorSnapshotPublish.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/OperatorSnapshotPublish.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/OperatorSnapshotPublishTest.java

### Serve the operator dashboard snapshot via the API
`operatorSnapshotGet.js` is the `GET /api/v1/operator/snapshot` Lambda: it enforces the operator bundle entitlement, reads `snapshots/<env>/latest.json` from the lake and returns it, answering 404 when the nightly job has not run yet.
Files: app/functions/analytics/operatorSnapshotGet.js, app/unit-tests/analytics/operatorSnapshotGet.test.js

### Publish the nightly raw export for indexing
`rawExportPublish.js` writes one CSV per Athena business view and one JSON per one-stop-dashboard objective to `s3://<lake>/exports/<env>/<date>/`, so every dashboard figure is readable without loading the page. `scripts/analytics-pull.sh` does a one-way `aws s3 sync --delete` of that exports prefix down to the workspace's `analytics/<env>/` tree for the corpus index. `RawExport.java` provisions the publishing Lambda.
Files: app/functions/analytics/rawExportPublish.js, app/unit-tests/analytics/rawExportPublish.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/RawExport.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/RawExportTest.java, scripts/analytics-pull.sh

### Copy the AWS FOCUS cost export into the analytics lake
`costFocusCopy/index.js` is a standalone zip Lambda that lists FOCUS 1.2 Parquet objects modified in the last 48 hours in the management account's cost export bucket and cross-account `CopyObject`s them into this account's own lake at `curated/cost/focus/dt=<today>/`, independent of the main nightly Step Functions chain. `CostFocusIngestion.java` provisions that Lambda and its own EventBridge Scheduler schedule; `CostFocusTables.java` provisions the Glue table over the copied Parquet (cost-allocation tags kept as one map column).
Files: app/functions/analytics/costFocusCopy/index.js, app/unit-tests/analytics/costFocusCopy.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CostFocusIngestion.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CostFocusIngestionTest.java, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CostFocusTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CostFocusTablesTest.java

### Publish nightly business metrics to CloudWatch
`analyticsMetricsPublish.js` runs one Athena query per entry in `METRIC_DEFINITIONS` (active users, submissions, revenue, HMRC failures, bundle operations, cost, DORA runs, probe pass rate, and more) against the prior day's data, and publishes each result as a CloudWatch custom metric (`PutMetricData`, batched at 20) in the fixed `Submit/Analytics` namespace; a query failure throws and stops the whole run rather than publishing a false zero. Three metrics (Ga4Purchases, StripePaidCharges, ActivityActivations) read two days back instead of one so all three compare the same day. `AnalyticsDashboard.java` provisions this Lambda and the CloudWatch dashboard that reads its metrics.
Files: app/functions/analytics/analyticsMetricsPublish.js, app/unit-tests/analytics/analyticsMetricsPublish.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AnalyticsDashboard.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/AnalyticsDashboardTest.java

### Orchestrate the nightly ingestion workflow
`NightlyIngestionWorkflow.java` builds one Step Functions state machine, started by one EventBridge Scheduler schedule: a `Parallel` branch runs five independent ingestion jobs (Stripe reconciliation, GA4 report pull, GA4 event export pull, GA4 daily aggregate pull, operator effort pull), then the data quality run, then the metrics publish, then the raw export publish; there is no `Catch`, so any failure stops the chain rather than publishing a false zero. `IngestionStack.java` owns the scheduling pattern and registers each job's Lambda-errors alarm. `scripts/verify-analytics-pipeline.sh` publishes one probe activity event end to end (EventBridge to Firehose to S3 to Athena); `scripts/verify-ingestion-jobs.sh` checks seven days of row counts per ingestion source (activity events, DynamoDB table changes, Stripe reconciliation, GA4 traffic, CloudFront access logs), distinguishing a missing partition from an empty one.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflow.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflowTest.java, infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/IngestionStackTest.java, scripts/verify-ingestion-jobs.sh, scripts/verify-analytics-pipeline.sh

### Federate Lambda credentials to Google Cloud
`googleWorkloadIdentity.js` lets an analytics Lambda reach Google Cloud with no stored key: it builds a `google-auth-library` `AwsClient` whose `AwsSecurityCredentialsSupplier` reads the Lambda's own execution-role environment variables, presented to Google's STS (through the pool/provider declared in `infra/google/gcp/identity.toml`) to obtain a token that impersonates the GA4 service account.
Files: app/lib/googleWorkloadIdentity.js, app/unit-tests/lib/googleWorkloadIdentity.test.js

### Classify visitor kind as human, bot or synthetic
`app/lib/visitorClassifier.js` classifies a User-Agent server-side as human/ai-agent/crawler. `web/public/lib/utils/visitor-kind.js` is the RUM client's browser-side equivalent, classifying a session as human/bot/synthetic from the same user-agent substrings plus the `requestIdPrefix` sessionStorage marker behaviour tests set, so RUM and GA4 tag a session identically.
Files: app/lib/visitorClassifier.js, app/unit-tests/lib/visitorClassifier.test.js, web/public/lib/utils/visitor-kind.js, web/unit-tests/visitor-kind.test.js, web/unit-tests/rum-visitor-kind.test.js

### Load GA4 (gtag) analytics on site pages
`web/public/lib/analytics.js` loads `gtag.js` with the environment's measurement id read from `/submit.env`, defaults consent to denied and reapplies a returning visitor's saved localStorage consent, links the three diyaccounting.co.uk hosts as one cross-domain session, and sets a `visitor_kind` user property from its own inline copy of the bot/synthetic classification rule (kept in step with `visitor-kind.js` by its test).
Files: web/public/lib/analytics.js, web/unit-tests/analytics.test.js

### Configure and gate CloudWatch RUM
The RUM client reads its app monitor id, region, identity pool and guest role from page `<meta>` tags injected at deploy time, only sends telemetry once `consent.rum` (or the legacy `consent.analytics`) is granted, and `rum-placeholders.system.test.js` confirms the `${RUM_...}` placeholders exist in source HTML before deployment substitutes them.
Files: web/unit-tests/rum-config.test.js, web/unit-tests/rum-consent.test.js, app/system-tests/rum-placeholders.system.test.js

### Render the operator objectives dashboard
`web/public/operator/dashboard.html` is the operator-only page (behind the operator bundle entitlement) that renders the eight one-stop objectives' trailing-30/90-day observations, trend and deep links from `operatorSnapshotGet.js`, plus an activity list of the account's entitled bundles. `PLAN_ONE_STOP_DASHBOARD.md` is the plan this dashboard implements.
Files: web/public/operator/dashboard.html, web/browser-tests/operatorDashboard.browser.test.js, web/browser-tests/operatorDashboardActivity.browser.test.js, PLAN_ONE_STOP_DASHBOARD.md

### Provision the analytics lake, Glue database and Athena workgroup
`AnalyticsStack.java` is the environment-scoped stack (outlives any one deployment) that owns the activity-event delivery stream, the lake's S3 buckets, the Glue catalog database and the Athena workgroup every other analytics construct in this repository queries or writes into.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/AnalyticsStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/AnalyticsStackTest.java

### Catalogue CloudFront access logs for Athena
`CloudFrontAccessLogs.java` is environment-scoped, unlike the per-deployment app stacks it serves: it holds the Glue table and lake-bucket policy that let Athena query the Parquet objects CloudWatch Logs v2 delivery writes. Each deployment's own EdgeStack creates the delivery subscription that points at this table.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CloudFrontAccessLogs.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CloudFrontAccessLogsTest.java

### Catalogue compliance findings for the dashboard
`ComplianceTables.java` provisions two Glue tables the compliance panel reads: `compliance_accessibility` (one row per page per tool per WCAG standard, from the pa11y/axe runs in `compliance.yml`) and `compliance_fraud_headers` (one row per month, from `scripts/fraud-header-email-check.js`'s output), both written by a GitHub Actions workflow step rather than a Lambda.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/ComplianceTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/ComplianceTablesTest.java

### Alert on cost budget and anomaly thresholds
`CostBudgetsAndAnomalyMonitor.java` provisions a monthly AWS Budget for the account and, in prod only, a Cost Anomaly Detection monitor; both notify through SNS (the only channel AWS Budgets and Cost Anomaly Detection support) into the same environment-level Telegram-forwarder Lambda `ActivityStack` owns.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CostBudgetsAndAnomalyMonitor.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CostBudgetsAndAnomalyMonitorTest.java

### Export AWS billing data in FOCUS format
`SubmitCostReporting.java` is a fourth, standalone CDK app deployed into the management account (887764105431), separate from the environment/application apps because it runs under different credentials. `CostExportStack.java` is the stack it deploys: the S3 bucket the export lands in and the `AWS::BCMDataExports::Export` resource itself (FOCUS 1.2 Parquet), with a bucket policy naming each deployment account's cost-copy role by ARN.
Files: infra/main/java/co/uk/diyaccounting/submit/SubmitCostReporting.java, infra/test/java/co/uk/diyaccounting/submit/SubmitCostReportingTest.java, infra/main/java/co/uk/diyaccounting/submit/stacks/CostExportStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/CostExportStackTest.java

### Catalogue workflow, probe and agent run data
`WorkflowRunTables.java` provisions three Glue tables over data the `dora-row` composite action writes from GitHub Actions: `dora_runs` (every deploy/destroy run), `probe_runs` (every probe suite in `probe-test.yml`) and `agent_runs` (every unattended agent workflow run), each with `dt` partition projection.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/WorkflowRunTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/WorkflowRunTablesTest.java

### Reconcile Stripe payments into the lake
`stripeReconcile.js` pulls the previous day's Stripe balance transactions, charges and a full subscription snapshot, hashes customer ids with the shared salt so a lake row never carries a raw Stripe identifier, and writes gzipped NDJSON under `curated/stripe/`. `StripeReconciliationTables.java` provisions the three Glue tables (`stripe_balance_transactions`, `stripe_charges`, `stripe_subscriptions`) behind the revenue and subscription views.
Files: app/functions/analytics/stripeReconcile.js, app/unit-tests/analytics/stripeReconcile.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/StripeReconciliationTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/StripeReconciliationTablesTest.java

### SQL views: activity and traffic
Seven Athena views answer traffic and activity questions over `activity_events_all` (which unions the JSON- and Parquet-era event tables into one queryable shape): daily active users, daily HMRC authentications and bundle grants/deletions, GA4 sessions by country and by traffic source/channel, sessions split by visitor kind (human/bot/synthetic), and GA4 funnel-step counts by distinct session.
Files: infra/main/resources/analytics/views/activity_events_all.sql, infra/main/resources/analytics/views/v_active_users_daily.sql, infra/main/resources/analytics/views/v_business_activity_daily.sql, infra/main/resources/analytics/views/v_traffic_by_country_daily.sql, infra/main/resources/analytics/views/v_traffic_sources_daily.sql, infra/main/resources/analytics/views/v_visitors_by_kind_daily.sql, infra/main/resources/analytics/views/v_ga4_funnel_daily.sql

### SQL views: revenue and subscription
Five Athena views answer money questions: daily Stripe revenue by product; subscription renewals and cancellations read off the subscriptions change log; a daily reconciliation of GA4, Stripe and activity-event purchase counts to surface where the webhook path or GA4 consent diverges; and passes issued versus redeemed by pass type.
Files: infra/main/resources/analytics/views/v_revenue_daily.sql, infra/main/resources/analytics/views/v_subscription_renewals_daily.sql, infra/main/resources/analytics/views/v_subscription_cancellations_daily.sql, infra/main/resources/analytics/views/v_purchase_reconciliation_daily.sql, infra/main/resources/analytics/views/v_pass_redemptions_daily.sql

### SQL views: submission and compliance
Seven Athena views: VAT/ITSA/Companies House completions by outcome and by activity; HMRC failures by class; how long an active or new customer takes to reach a submission; quarter-on-quarter repeat filers read off the DynamoDB receipts change log; and the compliance objective's headline, summing open accessibility and fraud-header findings by day.
Files: infra/main/resources/analytics/views/v_submissions_daily.sql, infra/main/resources/analytics/views/v_submissions_by_activity_daily.sql, infra/main/resources/analytics/views/v_hmrc_failures_by_class.sql, infra/main/resources/analytics/views/v_login_to_submission_funnel.sql, infra/main/resources/analytics/views/v_signup_to_first_submission.sql, infra/main/resources/analytics/views/v_returning_submitters_quarterly.sql, infra/main/resources/analytics/views/v_compliance_status.sql

### SQL views: cost
Three Athena views over the FOCUS cost export: billed cost by AWS service and by the DeploymentName/Stack cost-allocation tags each day; that day's cost divided by that day's completions across every activity; and each month's spend compared against a fixed $64.77 steady-state target.
Files: infra/main/resources/analytics/views/v_cost_daily.sql, infra/main/resources/analytics/views/v_cost_per_submission_daily.sql, infra/main/resources/analytics/views/v_cost_vs_target_monthly.sql

### SQL views: DORA and operations
Five Athena views: deploy/destroy run counts, success rate and lead time; unattended agent workflow runs plus the share that led to a merged PR or a closed issue; probe suite pass rate and remaining error budget; alarms fired/cleared by family; and operator interventions (hand-dispatched runs, issue comments, commits with no Claude Code co-author trailer).
Files: infra/main/resources/analytics/views/v_agent_runs_daily.sql, infra/main/resources/analytics/views/v_alarm_state_changes_daily.sql, infra/main/resources/analytics/views/v_availability_sli_daily.sql, infra/main/resources/analytics/views/v_dora_runs_daily.sql, infra/main/resources/analytics/views/v_operator_interventions_daily.sql

### Sync the Google Ads account's tagging, goals, campaigns and bidding
`ads-sync.js` diffs `infra/google/ads/ads.toml`'s declared account auto-tagging flag, conversion-goal biddability, and each declared campaign's status/budget/bidding strategy against the live Google Ads account, applying the difference with `--apply`. A declared Search campaign the account lacks is created outright (budget, campaign, ad groups, keywords, one responsive search ad); it never creates a conversion action, a conversion goal or a Performance Max campaign — those fail the plan if missing live.
Files: infra/google/ads/ads-sync.js, app/unit-tests/scripts/adsSync.test.js, infra/google/ads/ads.toml

### Read the Google Ads account inventory
`ads-inventory.js` is a read-only snapshot of the account named in `ads.toml`: the customer record, its conversion actions and default conversion goals, its campaigns and asset groups, and the GA4 side of the Ads link. It writes nothing and is the shared query/auth layer `ads-sync.js`, `ads-report.js` and `ads-forecast.js` build on.
Files: infra/google/ads/ads-inventory.js, app/unit-tests/scripts/adsInventory.test.js, _developers/ADS_MCP_EVALUATION.md

### Report Google Ads campaign performance
`ads-report.js` is a read-only performance report (impressions, clicks, cost, average CPC, CTR, conversions, conversion value) per campaign, ad group and keyword over a date range, 28 days ending yesterday by default.
Files: infra/google/ads/ads-report.js, app/unit-tests/scripts/adsReport.test.js

### Forecast Google Ads keyword performance
`ads-forecast.js` is a read-only keyword forecast for a given keyword list: historical monthly searches/competition/bid range plus expected clicks, cost and average CPC over a hypothetical 30-day Search campaign at a given daily budget (UK/English targeting, maximize-clicks bidding). It never creates or spends against a live campaign.
Files: infra/google/ads/ads-forecast.js, app/unit-tests/scripts/adsForecast.test.js

### Sync GA4 properties, streams, key events and the BigQuery link
`ga4-sync.js` makes every GA4 property declared in `infra/google/ga4/analytics.toml` (the shared cross-site property plus one per-environment property) match: it finds or creates each property, its data streams, enhanced-measurement settings, key events and BigQuery link, then writes the designated stream's measurement id onto the matching GitHub Environment's `SUBMIT_GA4_MEASUREMENT_ID` variable.
Files: infra/google/ga4/ga4-sync.js, app/unit-tests/scripts/ga4Sync.test.js, infra/google/ga4/analytics.toml

### Sync GA4-in-BigQuery scheduled queries
`ga4-bigquery-sync.js` makes the live `ga4_daily` BigQuery dataset and its Data Transfer scheduled queries match `infra/google/gcp/bigquery.toml`: each declared query becomes one `scheduled_query` transfer config that writes one day of GA4's BigQuery `events_*` export into one write-truncated, partitioned destination table. The four SQL files are each one query's text.
Files: infra/google/ga4/ga4-bigquery-sync.js, app/unit-tests/scripts/ga4BigQuerySync.test.js, infra/google/gcp/bigquery.toml, infra/google/gcp/bigquery/downloads_by_product_daily.sql, infra/google/gcp/bigquery/funnel_steps_daily.sql, infra/google/gcp/bigquery/key_events_daily.sql, infra/google/gcp/bigquery/sessions_by_host_source_daily.sql

### Enable required Google Cloud APIs
`gcp-enable-apis.js` idempotently enables every service listed in `infra/google/gcp/project.toml`'s `[apis].services` on the GA4 project, run first in `google-apply.yml` so a fresh project needs no console click.
Files: infra/google/gcp/gcp-enable-apis.js, app/unit-tests/scripts/gcpEnableApis.test.js

### Assert the GCP billing budget and a stray project's emptiness
`gcp-billing-assert.js` finds or creates a budget on the billing account holding `diyaccounting-ga4` with the alert thresholds declared in `project.toml`'s `[budget]` table (reusing an existing hand-created budget rather than duplicating it), and checks that the auto-created stray project `valued-context-507200-m9` is empty before it is deleted.
Files: infra/google/gcp/gcp-billing-assert.js, app/unit-tests/scripts/gcp-billing-assert.test.js

### Sync GCP workload identity federation and org policy
`gcp-identity-sync.js` makes the workload identity pool, its providers, the service account's `roles/iam.workloadIdentityUser` bindings and every declared org policy match `infra/google/gcp/identity.toml`, diffing live IAM/Org Policy API state and applying the difference. `--write-cred-configs` writes the external-account credential configuration files `app/lib/googleWorkloadIdentity.js`'s Lambdas build at runtime.
Files: infra/google/gcp/gcp-identity-sync.js, app/unit-tests/scripts/gcpIdentitySync.test.js, infra/google/gcp/identity.toml

### Read the Google Cloud and GA4 inventory
`google-inventory.js` is a read-only snapshot of the GA4 project's enabled services and IAM policy, the billing account's budgets, every GA4 account/property (streams, key events, BigQuery links), the analytics service account's keys, the project's IAP brand, and the BigQuery datasets and data transfer configs, used to check a toml file or a script's plan against reality.
Files: infra/google/gcp/google-inventory.js, app/unit-tests/scripts/googleInventory.test.js

### Assert Google OAuth client configuration
`google-oauth-assert.js` checks `infra/google/gcp/oauth.toml`'s two declared OAuth clients against everything a live API can confirm: each client's Auth Platform brand, the sign-in client id against Cognito's own copy, the YouTube client id against its Secrets Manager secret, and the scopes granted to the YouTube client's stored refresh token. It never writes anything.
Files: infra/google/gcp/google-oauth-assert.js, app/unit-tests/scripts/googleOauthAssert.test.js, infra/google/gcp/oauth.toml

### Apply GA4 and GCP IAM role bindings
`google-roles-apply.js` reads `infra/google/gcp/project.toml`, lists live GA4 Analytics Admin access bindings and GCP Resource Manager IAM bindings for the principals the file names, diffs and applies the difference. It only ever touches a binding for a principal/account-or-project pair the file names; removing an entry stops managing a grant without revoking it.
Files: infra/google/gcp/google-roles-apply.js, app/unit-tests/scripts/googleRolesApply.test.js, infra/google/gcp/project.toml

### Configure the YouTube channel as code
`infra/google/gcp/youtube.toml` declares the YouTube channel `scripts/youtube-upload.js` uploads to, resolved by handle through the YouTube Data API rather than a recorded channel id.
Files: infra/google/gcp/youtube.toml

### Authenticate Google Cloud scripts via federated credentials
`infra/google/lib/googleAuth.js` is the shared helper every `infra/google` script builds a `GoogleAuth` client from: it asserts `GOOGLE_APPLICATION_CREDENTIALS` is set (left behind by `google-github-actions/auth`'s OIDC exchange) and wraps it with the requested scopes, needing no service-account key.
Files: infra/google/lib/googleAuth.js, app/unit-tests/scripts/googleAuth.test.js

### Stage PayPal transactions for accounts reconciliation
`paypal-stage.js` pulls one month's PayPal Transaction Search API results (raw objects, `transaction_status` kept) and writes them to the workspace's staging tree, reading its OAuth client id/secret from Secrets Manager only, never an environment variable.
Files: scripts/finance/paypal-stage.js, app/unit-tests/scripts/finance/paypalStage.test.js

### Stage Stripe transactions for accounts reconciliation
`stripe-stage.js` pulls one month's Stripe balance transactions and payouts (gross, fee and net kept separate; nothing is netted here) and writes them to the workspace's staging tree, reading the live secret key from `infra/stripe/stripe.toml`'s Secrets Manager entry.
Files: scripts/finance/stripe-stage.js, app/unit-tests/scripts/finance/stripeStage.test.js

### Resolve finance staging directory paths
`staging-paths.js` resolves the shared `../staging/<year-end>/<source>/` path outside the repository (via `git rev-parse --git-common-dir`, so every worktree stages into the same tree) and labels a month by UK accounting year-end. Shared by `paypal-stage.js` and `stripe-stage.js`.
Files: scripts/finance/lib/staging-paths.js, app/unit-tests/scripts/finance/stagingPaths.test.js

## MCP and tools

### Expose the submission MCP server and tools
`createServer()` in `mcp/lib/server.js` builds an `McpServer` (`@modelcontextprotocol/sdk`), registers every tool in its `TOOLS` table (open_book, save_book, derive_vat_return, derive_micro_entity_accounts, list_vat_obligations, submit_vat_return, get_vat_receipt, preview/submit/poll micro-entity accounts, move_book_to_client, list/add_client, invite_client, client_authorisation_status, run_for_clients) plus the two ITSA tools from `registerItsaTools`, against one in-memory session. `mcp/bin/diya-submit-mcp.js` connects that server to stdio for a normal MCP client, or, given `--all-clients <tool>`, runs `runForClients` once and prints one result line per practice client instead of starting a server. `mcp/vitest.config.js` is the package's test-runner config.
Files: mcp/lib/server.js, mcp/bin/diya-submit-mcp.js, mcp/vitest.config.js

### Authenticate MCP sessions via Cognito
`signIn()` and `accessToken()` in `mcp/lib/auth.js` implement the MCP's own stdio sign-in: an OAuth authorization-code-with-PKCE flow against the Cognito hosted UI, catching the redirect on a loopback listener (port 49152-49159), exchanging the code at the token endpoint, and caching the refresh and id tokens under `~/.config/diya-submit/credentials.json` (mode 600). `accessToken()` refreshes the cached id token silently once it nears expiry. This session is separate from any HMRC or Companies House credential, which the submission tools take as call arguments instead.
Files: mcp/lib/auth.js, mcp/test/auth.test.js

### Load and save diya-gl books via MCP
`openBook`/`saveBook` in `mcp/lib/book-tools.js` are the two book tools: `open_book` loads a diya-gl book from a directory (`book.toml` + `lines.jsonl`) or any file the `@diy-accounting-uk/diya-gl` engine reads (workbook, package zip, diya-gl zip, diya-gl JSON), or, with `cloud: true`, from DIY Accounting Submit's own book-storage API using `auth.js`'s token; `save_book` writes the session's book back in one of five formats (`diya-gl-dir`, `diya-gl-zip`, `json`, `xlsx`, `zip`) or to that same cloud API. Every calculation and byte on disk comes from the published diya-gl package; this module owns only the one-book-per-session state and the filesystem/cloud plumbing.
Files: mcp/lib/book-tools.js, mcp/test/book-tools.test.js, mcp/test/fixtures/brickwork-pro-ltd-vat/book.toml, mcp/test/fixtures/precision-code-ltd-full/book.toml

### Derive micro-entity accounts figures for Companies House filing
`deriveMicroEntityAccounts` in `mcp/lib/accounts-tools.js` produces the seven FRS 105 balance-sheet lines a Companies House accounts filing needs: the current year from the diya-gl engine's published balance sheet (`PubBalSht`) and the prior year from the book's opening balance, each checked for internal balance before rounding to whole pounds so capital and reserves still equals net assets. It reads only the session's already-loaded book; no HMRC or Companies House call is made here.
Files: mcp/lib/accounts-tools.js, mcp/test/accounts-tools.test.js

### Derive VAT figures via MCP tools
`deriveVatReturn` in `mcp/lib/vat-tools.js` computes the nine HMRC VAT-return boxes for one obligation quarter from the session's loaded diya-gl book: it reads the engine's own calculated `Vatreturns.xlsx!Vatinterface` sheet (via `calculatedResultsFor`) for the quarter ending `periodEnd`, applies the engine's single 20% VAT rate, and cross-checks the sheet's totals against the actual sales/purchases journal lines that should have produced them, throwing if they disagree. It also returns every journal line that contributed to boxes 1, 4, 6 and 7. This is a pure derivation over an already-loaded book; it makes no HMRC call and does not itself submit anything.
Files: mcp/lib/vat-tools.js, mcp/test/vat-tools.test.js

### Derive ITSA quarterly and annual submission figures
`deriveItsaQuarterlyUpdate` and `deriveItsaAnnualSubmission` in `mcp/lib/itsa-tools.js`, registered via `registerItsaTools`, answer HMRC's Self Employment Business API from a loaded self-employed (`se`) book: the quarterly tool returns one period's own figures (or a running cumulative total for tax years HMRC files as cumulative period summaries, 2025-26 on), and the annual tool returns the year's allowances and adjustments, optionally written to disk as the JSON the site's annual-submission import reads. Both call the published diya-gl package's `se-derivations` module and then restrict the result to the field set `sa103-mtd-mapping.json` says HMRC accepts for that tax year, omitting any field the book cannot source rather than sending it as zero.
Files: mcp/lib/itsa-tools.js, mcp/test/itsa-tools.test.js, mcp/test/fixtures/brickwork-pro-se-vat/book.toml

### File VAT returns and accounts through the deployed API
`mcp/lib/submit-tools.js`'s `callSubmitApi` is the shared HTTP layer (session bearer token, HMRC/custom-authoriser headers, async 202-then-poll handling) behind `list_vat_obligations`, `submit_vat_return`, `get_vat_receipt`, `preview_micro_entity_accounts`, `submit_micro_entity_accounts` and `poll_accounts_submission`: these call DIY Accounting Submit's own deployed REST API to fetch HMRC VAT obligations, file a VAT return, fetch a stored receipt, preview or file FRS 105 accounts through the Companies House XML Gateway, and poll a filing's outcome. `practice-tools.js` reuses this same `callSubmitApi`/`requireField` layer rather than a second HTTP client.
Files: mcp/lib/submit-tools.js, mcp/test/submit-tools.test.js

### Manage practice clients and HMRC agent authorisation
`mcp/lib/practice-tools.js` covers a practice's client operations against the deployed API: `listClients`/`addClient` maintain the client list, `inviteClient`/`clientAuthorisationStatus` drive the HMRC Agent Authorisation invitation flow per client and service, and `moveBookToClient` moves one of the practice's own books into a client's book set via a dedicated move route. All but `moveBookToClient` share `submit-tools.js`'s `callSubmitApi`.
Files: mcp/lib/practice-tools.js, mcp/test/practice-tools.test.js

### Run a client-scoped tool across every practice client
`runForClients` in `mcp/lib/batch-tools.js` runs one allow-listed, client-scoped tool (the four submission tools plus open_book/save_book) once per client in the practice's own list, merging each client's id into the call's arguments and collecting one result row per client; one client's failure is recorded in its own row rather than aborting the rest. This backs both the `run_for_clients` MCP tool and the CLI's `--all-clients` mode.
Files: mcp/lib/batch-tools.js, mcp/test/batch-tools.test.js

### Import a NatWest bank statement into diya-gl lines
`bankLinesFromCsv`/`closingBalance` in `mcp/lib/finance/bank-lines.js` parse a NatWest current-account CSV export (`Date,Type,Description,Value,Balance,...`) into validated diya-gl bank lines, one per statement transaction, with no filtering or netting. Direction is encoded in `diya-gl:bankCode` (debtor-receipt vs creditor-payment) from the sign of the statement's Value column, since the Type column alone does not say which way the money moved.
Files: mcp/lib/finance/bank-lines.js, mcp/test/bank-lines.test.js

### Seed a book from a Company package workbook set
`bookFromWorkbookSet` in `mcp/lib/finance/book-from-workbook.js` builds a diya-gl `book.toml` (entity information, chart of accounts, opening balances, debtors, creditors, fixed assets, dividends and members) from a finished trading year's complete Company package workbook set (`Financialaccounts.xlsx`, `Fixedassets.xlsx`, `Companysecretary.xlsx` and the Sales/Purchases/bank workbooks), reading every figure through the published diya-gl engine's own multi-file extractors and validating the result against the published v2 book schema. `toToml` serialises the resulting book back to TOML text.
Files: mcp/lib/finance/book-from-workbook.js, mcp/test/book-from-workbook.test.js

### Read invoices from the local mail index
`invoiceLinesForPeriod` in `mcp/lib/finance/mail-invoices.js` stages supplier invoices into diya-gl purchases lines by shelling out to the `corpus` CLI (`index/.venv/bin/corpus`, configured by `index/corpus.toml`), a **local, already-built mailbox index/mirror** of `mail-antony`, not the live Gmail API: it runs `corpus search --source mail-antony` for each configured supplier within a date range, fetches each hit's extracted text with `corpus doc`, extracts a total amount and currency from the email body or PDF-attachment text (handling AWS's, Google's and PayPal/receipt-style total layouts), and turns each recognisable hit into one purchases/invoice line. It stages nothing to disk itself and never reads a `.eml` file or calls Gmail directly.
Files: mcp/lib/finance/mail-invoices.js, mcp/test/mail-invoices.test.js

### Import Stripe transaction and payout lines
`mcp/lib/finance/stripe-lines.js` turns staged Stripe balance-transaction and payout data into validated diya-gl lines: `stripeLinesFromTransactions` posts a charge's gross amount to sales and its processing fee to purchases separately (never netted), a refund or dispute as a sales credit note, and a standalone fee (for example a Billing usage charge) as its own purchases line; `stripePayoutLines` posts each payout as a bank line dated to its arrival date, for reconciliation against the NatWest statement's matching BAC credit; `reconcileStripeMonth` checks that a staged month's charges minus fees minus refunds equals its payouts plus balance change. All Stripe data is taken as already-fetched objects passed in by the caller; this module makes no Stripe API call itself.
Files: mcp/lib/finance/stripe-lines.js, mcp/test/stripe-lines.test.js

### Document the submission MCP's plan and tool reference
`PLAN_SUBMISSION_MCP.md` is the plan of record for the submission MCP (milestones, the book-to-filing field mappings, open rows); `mcp/README.md` is the package's own short reference, listing the four tools implemented at time of writing (open_book, save_book, the two ITSA derivations) and how to run and test the package.
Files: PLAN_SUBMISSION_MCP.md, mcp/README.md

### Disclaim an MCP server on the marketing site
`web/public/mcp.html` is a static page on the public site that explains what MCP is in general terms and then states DIY Accounting Submit does **not** have an MCP server ("We looked into building one and decided not to"), pointing visitors instead to the web app or the REST API. It carries no functionality of its own and is not wired to the `mcp/` package described by the other capabilities in this area; the two are unrelated beyond sharing the letters "MCP".
Files: web/public/mcp.html

## Developer workflow

### Run the HTTP simulator server
`startSimulator()` (`app/http-simulator/index.js`) and `createApp()` (`app/http-simulator/server.js`) start an Express app that registers every simulator route in a fixed order and answers `/health`. `app/bin/simulator-server.js` runs a merged variant that mounts the same routes alongside static file serving and a hardcoded demo user for the public simulator. `app/http-simulator/state/store.js` holds the in-memory maps (submitted returns, authorization codes, tokens) shared across routes and reset between tests.
Files: app/http-simulator/index.js, app/http-simulator/server.js, app/http-simulator/state/store.js, app/bin/simulator-server.js, app/system-tests/hmrcSimulator.system.test.js, app/system-tests/runLocalHttpServer.system.test.js, app/system-tests/runLocalOAuth2Server.system.test.js, app/system-tests/runLocalDynamoDb.system.test.js

### Simulate local app OAuth
`app/http-simulator/routes/local-oauth.js` replaces the Docker `mock-oauth2-server`: an interactive login form at `GET /oauth/authorize` for `client_id=debugger`, `POST /default/token` issuing unsigned JWTs, plus a debugger page and `/.well-known/openid-configuration` discovery document.
Files: app/http-simulator/routes/local-oauth.js

### Simulate HMRC OAuth
`app/http-simulator/routes/hmrc-oauth.js` reproduces HMRC's four-step grant flow (permission page, sign-in choice, credentials form, grant-permission) at `GET`/`POST /oauth/authorize`, an auto-grant shortcut for system tests, and `POST /oauth/token` issuing mock access/refresh tokens for authorization_code, refresh_token and client_credentials grants.
Files: app/http-simulator/routes/hmrc-oauth.js

### Simulate Companies House identity and filing
`app/http-simulator/routes/companies-house-oauth.js` mimics the single Companies House sign-in-and-permission screen at `/oauth2/authorise` and `/oauth2/token` (registered after hmrc-oauth.js since "authorise"/"authorize" never collide). `app/http-simulator/routes/companies-house.js` serves the API-key read endpoints (`/search/companies`, `/company/{number}`, registered-office-address, registered-email-address eligibility) and the OAuth-authorised transaction lifecycle (open/get/close a transaction, attach registered-office-address and registered-email-address resources). `app/http-simulator/routes/companies-house-xmlgw.js` answers the XML Gateway's single `POST /v1-0/xmlgw/Gateway` endpoint for both `Accounts` submissions and `GetSubmissionStatus` polls, building GovTalk envelope XML responses. Scenario data for these three route files lives in `app/http-simulator/scenarios/companies.js`, `accounts-filing.js`, `business-details.js` and `filings.js`.
Files: app/http-simulator/routes/companies-house-oauth.js, app/http-simulator/routes/companies-house.js, app/http-simulator/routes/companies-house-xmlgw.js, app/http-simulator/scenarios/companies.js, app/http-simulator/scenarios/accounts-filing.js, app/http-simulator/scenarios/business-details.js, app/http-simulator/scenarios/filings.js, app/unit-tests/http-simulator/scenarios/accounts-filing.test.js

### Simulate HMRC VAT MTD API
`app/http-simulator/routes/vat-returns.js` handles `POST`/`GET /organisations/vat/{vrn}/returns`, validating the 9-box body and its calculated totals via `validateVatReturnBody` before storing a return and returning a mock receipt (`formBundleNumber`, `chargeRefNumber`). Companion route files answer VAT obligations, liabilities, payments and penalties. Each route consults a matching scenario module (`app/http-simulator/scenarios/returns.js`, `obligations.js`, `liabilities.js`, `payments.js`, `penalties.js`) that maps the `Gov-Test-Scenario` header to canned or error responses.
Files: app/http-simulator/routes/vat-returns.js, app/http-simulator/routes/vat-obligations.js, app/http-simulator/routes/vat-liabilities.js, app/http-simulator/routes/vat-payments.js, app/http-simulator/routes/vat-penalties.js, app/http-simulator/scenarios/returns.js, app/http-simulator/scenarios/obligations.js, app/http-simulator/scenarios/liabilities.js, app/http-simulator/scenarios/payments.js, app/http-simulator/scenarios/penalties.js, app/unit-tests/http-simulator/scenarios/liabilities.test.js, app/unit-tests/http-simulator/scenarios/obligations.test.js, app/unit-tests/http-simulator/scenarios/payments.test.js, app/unit-tests/http-simulator/scenarios/penalties.test.js

### Simulate HMRC ITSA MTD API
Eighteen route files under `app/http-simulator/routes/itsa-*.js` answer the Making Tax Digital for Income Tax Self Assessment endpoints business details, obligations, self-employment periods (period/periods/period-detail/cumulative/annual), UK property periods (the same five shapes), crystallisation obligations, status, BSAS, calculations, losses and claims, and tax-liability adjustments. Each has a matching `app/http-simulator/scenarios/itsa-*.js` module supplying its `Gov-Test-Scenario`-driven fixture data, registered together in `app/http-simulator/server.js`.
Files: app/http-simulator/routes/itsa-business-details.js, app/http-simulator/routes/itsa-obligations.js, app/http-simulator/routes/itsa-self-employment-period.js, app/http-simulator/routes/itsa-self-employment-periods.js, app/http-simulator/routes/itsa-self-employment-period-detail.js, app/http-simulator/routes/itsa-self-employment-cumulative.js, app/http-simulator/routes/itsa-self-employment-annual.js, app/http-simulator/routes/itsa-uk-property-period.js, app/http-simulator/routes/itsa-uk-property-period-detail.js, app/http-simulator/routes/itsa-uk-property-cumulative.js, app/http-simulator/routes/itsa-uk-property-periods.js, app/http-simulator/routes/itsa-uk-property-annual.js, app/http-simulator/routes/itsa-crystallisation-obligations.js, app/http-simulator/routes/itsa-status.js, app/http-simulator/routes/itsa-bsas.js, app/http-simulator/routes/itsa-calculations.js, app/http-simulator/routes/itsa-losses-and-claims.js, app/http-simulator/routes/itsa-tax-liability-adjustments.js, app/http-simulator/scenarios/itsa-obligations.js, app/http-simulator/scenarios/itsa-self-employment-period.js, app/http-simulator/scenarios/itsa-self-employment-periods.js, app/http-simulator/scenarios/itsa-self-employment-period-detail.js, app/http-simulator/scenarios/itsa-self-employment-cumulative.js, app/http-simulator/scenarios/itsa-self-employment-annual.js, app/http-simulator/scenarios/itsa-uk-property-period.js, app/http-simulator/scenarios/itsa-uk-property-period-detail.js, app/http-simulator/scenarios/itsa-uk-property-cumulative.js, app/http-simulator/scenarios/itsa-uk-property-periods.js, app/http-simulator/scenarios/itsa-uk-property-annual.js, app/http-simulator/scenarios/itsa-crystallisation-obligations.js, app/http-simulator/scenarios/itsa-status.js, app/http-simulator/scenarios/itsa-bsas.js, app/http-simulator/scenarios/itsa-calculations.js, app/http-simulator/scenarios/itsa-losses-and-claims.js, app/http-simulator/scenarios/itsa-tax-liability-adjustments.js

### Simulate HMRC Agent Authorisation and fraud-prevention headers
`app/http-simulator/routes/agent-authorisation.js` implements `POST /agents/{arn}/invitations`, `GET`/`DELETE .../invitations/{id}` and `GET /agents/{arn}/relationships`, tracking invitation status in memory and treating a fixed set of client IDs as pre-authorised. `app/http-simulator/routes/fraud-headers.js` answers `GET /test/fraud-prevention-headers/validate`, checking the request's headers against HMRC's required and optional `Gov-Client-*`/`Gov-Vendor-*` list and returning `VALID`, `VALID_WITH_WARNINGS` or `INVALID`.
Files: app/http-simulator/routes/agent-authorisation.js, app/http-simulator/routes/fraud-headers.js

### Simulate HMRC test-user provisioning and serve simulator API docs
`app/http-simulator/routes/test-user.js` answers `POST /create-test-user/organisations` with a randomly generated VRN, user ID, password, group identifier and (for `mtd-income-tax`) a NINO. `app/http-simulator/routes/openapi.js` serves an index page describing the simulator's endpoints, raw OpenAPI specs from `_developers/reference/` at `/openapi/{spec}`, and a Swagger UI at `/docs/{spec}`.
Files: app/http-simulator/routes/test-user.js, app/http-simulator/routes/openapi.js

### Simulate the public demo app's billing and OAuth mocks
`app/functions/non-lambda-mocks/mockAuthUrlGet.js` builds a mock OAuth authorize URL pointing at the local mock server (`GET /api/v1/mock/authUrl`). `mockTokenPost.js` proxies `POST /api/v1/mock/token` to that mock server's token endpoint to dodge browser CORS/PNA restrictions. `mockBilling.js` fakes Stripe checkout, checkout-session lookup and the billing portal, auto-granting a bundle via `putBundle` when Stripe is unconfigured.
Files: app/functions/non-lambda-mocks/mockAuthUrlGet.js, app/functions/non-lambda-mocks/mockTokenPost.js, app/functions/non-lambda-mocks/mockBilling.js

### Deploy the public demo simulator
`infra/main/java/co/uk/diyaccounting/submit/stacks/SimulatorStack.java` deploys the public read-only demo as a Lambda behind a Function URL and CloudFront, with no production secrets and in-memory state that resets on cold start, at `{env}-simulator.submit.diyaccounting.co.uk`. `scripts/build-simulator.js` copies `web/public` to `web/public-simulator`, injecting a demo banner, `noindex` meta tags and a storage-namespace proxy that prefixes localStorage/sessionStorage keys so the iframe doesn't collide with the parent page. `scripts/simulator-lambda-server.mjs` is the dependency-free Node HTTP server (Lambda Web Adapter target) that serves the built static files and mock HMRC endpoints in that deployment.
Files: infra/main/java/co/uk/diyaccounting/submit/stacks/SimulatorStack.java, scripts/build-simulator.js, scripts/simulator-lambda-server.mjs

### Practice the VAT journey in the browser-embedded simulator
`web/public/simulator.html` is the standalone practice interface for the VAT submission flow (no live HMRC calls). `web/public/widgets/simulator-bridge.js` is injected into the simulator page to relay `postMessage` commands (highlight, click, fill) from a parent window across the iframe boundary. `web/public/widgets/simulator-journeys.js`'s `SimulatorJourney` class drives scripted click-through demos inside the iframe, using direct DOM access when same-origin and the bridge when cross-origin. `web/public/lib/test-data-generator.js` generates placeholder VRNs, NINOs and period keys for these demos.
Files: web/public/simulator.html, web/public/widgets/simulator-bridge.js, web/public/widgets/simulator-journeys.js, web/public/lib/test-data-generator.js, web/unit-tests/test-data-generator.test.js

### Prove the browser client's shared status-stack and fetch/auth logic
Playwright component/DOM tests exercise the status-stack state machine, core browser-side fetch/auth logic, the test-data-link page and the simulator's iframe/journey controls. The ITSA business-details and VAT-obligations page tests live with HMRC filing, not here.
Files: web/browser-tests/chromium.client.status-stack.test.js, web/browser-tests/chromium.client.test.js, web/browser-tests/test-data-link.browser.test.js, behaviour-tests/simulator.behaviour.test.js

### Generate the OpenAPI spec from CDK route definitions
`infra/main/java/co/uk/diyaccounting/submit/swagger/OpenApiGenerator.java` introspects `SubmitSharedNames` to discover API Gateway routes, methods and paths from the CDK code and emits an OpenAPI 3.0.3 document, avoiding hand-maintained endpoint lists.
Files: infra/main/java/co/uk/diyaccounting/submit/swagger/OpenApiGenerator.java, infra/main/java/co/uk/diyaccounting/submit/swagger/CHANGES.md, infra/test/java/co/uk/diyaccounting/submit/swagger/OpenApiGeneratorTest.java

### Run Claude Code skills for the delivery cycle
`.claude/skills/*/SKILL.md` define the repository's slash commands: `/board` renders open work; `/do-next` dispatches `NEXT.md` as worktree sub-agents onto one batch branch and PR; `/refine` validates and prepares board rows before a wave; `/iterate` runs board → do-next → watch → auto-merge unattended; `/watch` polls GitHub CI and reacts to failures; `/auto-merge` and `/auto-merge-dry-run` gate and execute PR merges; `/clean` removes stale deployments, branches and worktrees; `/cool-down` and `/wake` pause and resume the cycle; `/session-report` writes a measured session report; `/plain-prose` holds the writing-style rules; `/stripe-catalogue-sync`, `/site-video-capture`, `/video-publish` and `/vat-submission-failure-alarm-user-lookup` are single-purpose operational skills.
Files: .claude/skills/board/SKILL.md, .claude/skills/do-next/SKILL.md, .claude/skills/refine/SKILL.md, .claude/skills/iterate/SKILL.md, .claude/skills/watch/SKILL.md, .claude/skills/auto-merge/SKILL.md, .claude/skills/auto-merge-dry-run/SKILL.md, .claude/skills/clean/SKILL.md, .claude/skills/cool-down/SKILL.md, .claude/skills/wake/SKILL.md, .claude/skills/session-report/SKILL.md, .claude/skills/plain-prose/SKILL.md, .claude/skills/stripe-catalogue-sync/SKILL.md, .claude/skills/site-video-capture/SKILL.md, .claude/skills/video-publish/SKILL.md, .claude/skills/vat-submission-failure-alarm-user-lookup/SKILL.md

### Enforce Claude Code conventions via rules and hooks
`.claude/rules/lambda-functions.md`, `cdk-infrastructure.md` and `testing.md` document the handler/stack/test-naming patterns Claude sessions follow when writing Lambda, CDK or test code. `.claude/hooks/guard-main-push.sh` is a PreToolUse hook that inspects a `git push` command's target branch and diff against `origin/main`, denying the push unless every changed file is Markdown or the push already went through a PR. `.claude/commands/add-references.md` is a slash command that adds inline citation references to spreadsheets-site articles, sourced from GOV.UK pages via `references.toml`.
Files: .claude/rules/lambda-functions.md, .claude/rules/cdk-infrastructure.md, .claude/rules/testing.md, .claude/hooks/guard-main-push.sh, .claude/commands/add-references.md

### Maintain the specialist agent prompt library
`prompts/*.md` are reusable prompt files for specialist AI agent roles and one-off analyses: an AWS CDK Java specialist, a Playwright/E2E behaviour-test master, a clean-code guardian, an entitlement/subscription specialist, an HMRC MTD API expert, a security reviewer, alarm and support-ticket triage prompts, CI variants of `/board` and `/do-next`, and prompts for pruning focus, increasing consistency, abstracting to libraries, improving test coverage, expanding capabilities, updating FAQ/help pages, clearing TODOs, and selecting or authoring a new prompt.
Files: prompts/abstract-libraries.md, prompts/alarm-triage.md, prompts/auto-select.md, prompts/aws-cdk-java-specialist.md, prompts/behavior-test-master.md, prompts/board-ci.md, prompts/clean-code-guardian.md, prompts/create-new-prompt.md, prompts/do-next-ci.md, prompts/entitlement-subscription-specialist.md, prompts/expand-capabilities.md, prompts/hmrc-api-expert.md, prompts/improve-test-coverage.md, prompts/increase-consistency.md, prompts/prune-focus.md, prompts/security-review.md, prompts/support-triage.md, prompts/todo-inator.md, prompts/update-faqs-help-and-guide.md

### Start the proxy and simulator local dev environments
`scripts/start-proxy.sh` starts dynalite, the Docker mock-oauth2-server and the web server together (native HTTPS on `local.submit.diyaccounting.co.uk`), tearing all three down on exit. `scripts/start-simulator.sh` builds the simulator static files then starts dynalite and the HTTP simulator on ephemeral ports (logged and tailed) with no Docker dependency. `app/bin/dynamodb.js`'s `startDynamoDB()` launches that dynalite server and ensures every DynamoDB table the app needs (bundles, HMRC API requests, receipts, practice clients, passes, capacity counter, per-endpoint async-request tables) exists before use. `scripts/static-server.mjs` serves `web/public` on an ephemeral port for local accessibility scans (pa11y/axe/lighthouse). `scripts/pick-free-port.js` resolves a free TCP port and injects it into env vars before launching a given command, so concurrent behaviour-test runs bind different ports.
Files: scripts/start-proxy.sh, scripts/start-simulator.sh, app/bin/dynamodb.js, scripts/static-server.mjs, scripts/pick-free-port.js

### Fetch and publish proxy-variant secrets
`scripts/proxy-secrets.sh` fetches the proxy variant's HMRC and Stripe secrets from AWS Secrets Manager and execs a given command with them set in its environment, after checking the AWS SSO session is live. `scripts/local-tls-publish.sh` is a certbot deploy-hook that publishes a renewed `local.submit.diyaccounting.co.uk` certificate to Secrets Manager so CI reads the same certificate as the developer's browser.
Files: scripts/proxy-secrets.sh, scripts/local-tls-publish.sh

### Manage the durable Cognito test-user lifecycle
`scripts/ensure-cognito-test-user.js` creates (if missing) and rotates the password, TOTP device and DynamoDB data for one test lane's durable Cognito user, so parallel lanes never invalidate each other's credentials. `scripts/toggle-cognito-native-auth.js` adds or removes `COGNITO` from one or both user-pool clients' `SupportedIdentityProviders`, switching the Hosted UI between native email/password and federated-only login. `scripts/enable-cognito-native-test.js` and `scripts/disable-cognito-native-test.js` wrap that toggle for local fast-turnaround testing: enable rotates the `local` lane's user and writes `cognito-native-test-credentials.json`; disable restores federated-only login and deletes the credentials file. `scripts/cleanup-test-users.js` scans Cognito for native test users, purges their DynamoDB data across every table, then deletes the Cognito users (durable synthetic users keep their identity; only their data is purged). `scripts/create-hmrc-test-user.js` provisions a durable HMRC Sandbox test organisation with MTD credentials. `scripts/totp-code.js` generates a 6-digit TOTP code from a base32 secret (argument, env var or the saved credentials file) for MFA entry during test automation.
Files: scripts/ensure-cognito-test-user.js, scripts/toggle-cognito-native-auth.js, scripts/enable-cognito-native-test.js, scripts/disable-cognito-native-test.js, scripts/cleanup-test-users.js, scripts/create-hmrc-test-user.js, scripts/totp-code.js, app/unit-tests/scripts/create-hmrc-test-user.test.js, app/unit-tests/scripts/ensure-cognito-test-user.test.js, app/unit-tests/scripts/toggle-cognito-native-auth.test.js

### Export and embed DynamoDB test state in reports
`scripts/export-dynamodb-for-test-users.js` exports bundles, receipts and HMRC API request records for named test users to JSON Lines files. `scripts/export-test-dynamodb.sh` exports whole test-environment DynamoDB tables to JSON by PK/SK for analysis or cross-environment transfer. `scripts/generate-test-reports.js` reads a behaviour run's `testContext.json` and `hmrc-api-requests.jsonl` files and writes `test-report-<name>.json` plus a reports index. `scripts/inject-dynamodb-into-test-report.js` embeds a DynamoDB export into that report HTML for audit trail and post-mortem review. `scripts/publish-web-test-local.sh` copies a local behaviour test's report and results into `web/public/tests/` under a named target test. `app/test-helpers/dynamodbExporter.js`'s `exportDynamoDBDataForUsers` is the shared export routine both scripts and behaviour helpers call.
Files: scripts/export-dynamodb-for-test-users.js, scripts/export-test-dynamodb.sh, scripts/generate-test-reports.js, scripts/inject-dynamodb-into-test-report.js, scripts/publish-web-test-local.sh, app/test-helpers/dynamodbExporter.js, app/unit-tests/web/test-report-web-test-local.test.js, app/unit-tests/web/trackedTestReportsAuthorizationMasking.test.js

### Provide shared unit/system-test fixtures
`app/test-helpers/eventBuilders.js` builds Lambda API Gateway events, ID tokens and authorizer contexts. `cloudFrontEventBuilders.js` builds CloudFront origin-response/404/500 events. `mockHelpers.js` sets up `fetch` mocks and canned HMRC success/error responses. `dynamoDbMock.js` and `primableMockServer.js` (`startHmrcMockServer`) provide further test-double infrastructure. `app/unit-tests/lib/govClientTestHeader.js` supplies the constant `Gov-Client-*` anti-fraud header values used across tests.
Files: app/test-helpers/eventBuilders.js, app/test-helpers/cloudFrontEventBuilders.js, app/test-helpers/mockHelpers.js, app/test-helpers/dynamoDbMock.js, app/test-helpers/primableMockServer.js, app/unit-tests/lib/govClientTestHeader.js, app/unit-tests/test-helpers/eventBuilders.test.js, app/unit-tests/test-helpers/mockHelpers.test.js, app/unit-tests/helpers/waitForSuccessOrError.test.js

### Provide shared behaviour-test fixtures and steps
`behaviour-tests/helpers/behaviour-helpers.js` starts and manages the local DynamoDB, HTTP server and `stripe listen` background processes a behaviour run needs. `dynamodb-assertions.js` and `dynamodb-export.js` read and assert against exported DynamoDB tables (finding HMRC API request records by URL/method). `figures-helper.js` selects and captions key screenshots for documentation. `fileHelper.js` manages per-run marker files (user-sub, traceparent, hashed-user-sub). `ga4PurchaseQuery.js` queries BigQuery for GA4 purchase events. `gotoWithRetries.js` retries Playwright navigation past transient errors. `playwrightTestForCapture.js` and `playwrightTestWithout.js` are Playwright `test` fixture variants, the latter blocking analytics requests. `serverHelper.js` checks whether a target server is already running. `waitForSuccessOrError.js` polls the page for a success or error condition to appear. `behaviour-tests/steps/behaviour-steps.js` wraps common page interactions as named `test.step` blocks with screenshot attachments.
Files: behaviour-tests/helpers/behaviour-helpers.js, behaviour-tests/helpers/dynamodb-assertions.js, behaviour-tests/helpers/dynamodb-export.js, behaviour-tests/helpers/figures-helper.js, behaviour-tests/helpers/fileHelper.js, behaviour-tests/helpers/ga4PurchaseQuery.js, behaviour-tests/helpers/gotoWithRetries.js, behaviour-tests/helpers/playwrightTestForCapture.js, behaviour-tests/helpers/playwrightTestWithout.js, behaviour-tests/helpers/serverHelper.js, behaviour-tests/helpers/waitForSuccessOrError.js, behaviour-tests/steps/behaviour-steps.js

### Check SPDX licence headers
`app/unit-tests/licenceHeaders.test.js` walks every comment-capable tracked file (excluding generated exports, generated test-report output and Crown-copyright/third-party material) and asserts each carries the PolyForm Internal Use SPDX identifier and the company copyright line. `scripts/add-spdx-headers.js` adds the matching JS or Java header block to files that are missing one.
Files: app/unit-tests/licenceHeaders.test.js, scripts/add-spdx-headers.js

### Clean and update local build state
`scripts/clean.sh` removes build output, coverage, CDK synth output and `node_modules`, then rebuilds the Maven compile and reinstalls npm packages. `scripts/deep-clean.sh` runs `clean.sh` then also clears `build`/`dist`, reinstalls and runs the full npm test suite. `scripts/clean-node.sh` resets only the Node dependency state (`node_modules`, `package-lock.json`, npm cache). `scripts/update.sh` and `scripts/update-java.sh` refresh npm and Maven dependencies to their latest allowed versions. `scripts/check-commit-identities.sh` fails a PR when a commit author's email is not on `.github/allowed-commit-identities.yml`'s allow-list. `scripts/create-favicon.sh` converts an image to `.ico`/`.png` favicon variants via ImageMagick. `scripts/export-files.sh` writes the repository's tracked file listing to `repository-contents.txt` for architecture reporting.
Files: scripts/clean.sh, scripts/deep-clean.sh, scripts/clean-node.sh, scripts/update.sh, scripts/update-java.sh, scripts/check-commit-identities.sh, scripts/create-favicon.sh, scripts/export-files.sh

### Verify module wiring and repository shape
`app/unit-tests/module-index.test.js` confirms every module the app exports is reachable from its index. `app/unit-tests/nextShape.test.js` checks the structure of `NEXT.md`'s board rows.
Files: app/unit-tests/module-index.test.js, app/unit-tests/nextShape.test.js

### Configure the test and lint toolchains
`vitest.config.js` sets the Vitest environment, coverage thresholds and test-discovery patterns for `app/unit-tests` and `web/unit-tests`. `playwright.config.js` configures the browser and behaviour-test runs. `eslint.config.js` and `eslint.security.config.js` configure the repository's lint and security-lint rule sets.
Files: vitest.config.js, playwright.config.js, eslint.config.js, eslint.security.config.js

### Document developer setup and repository conventions
`README.md` is the repository's entry point describing the VAT submission app, setup and key features. `CLAUDE.md` carries the project's Claude Code conventions (git workflow, testing, deployment, code quality). `_developers/SETUP.md` is the local development environment setup guide. `NEXT.md` is the live open-work board; `BACKLOG.md` holds future work outside the current plan cycle; `PLAN_REPOSITORY_AUTOMATION.md` tracks the repository-automation plan's goals and verification criteria. `REPORT_REPOSITORY_CONTENTS.md`, `REPORT_GIT_CONFIG.md` and the dated `REPORT_SESSION_*.md` files are generated architecture and session reports.
Files: README.md, CLAUDE.md, _developers/SETUP.md, NEXT.md, BACKLOG.md, PLAN_REPOSITORY_AUTOMATION.md, REPORT_REPOSITORY_CONTENTS.md, REPORT_GIT_CONFIG.md, REPORT_SESSION_uOKRjk_2026-09-22.md, REPORT_SESSION_yQdSoM_2026-09-23.md

## Method

This report comes from a per-file walk of the repository, not from memory.

**File selection.** `git ls-files` filtered to `.js`, `.mjs`, `.java`, `.yml`, `.toml`, `.sh`, `.html`, `.sql` and `.md`, excluding `reference/`, `web/public/tests/`, `web/public/docs/`, `web/public-simulator/` and `_developers/hmrc/`. That gave 1,295 tracked files.

**Extraction.** The file list was split into 13 batches, balanced by line count. One Haiku agent per batch read every file in its batch, one at a time, and wrote one JSON line per file to `target/capabilities/batch-01.jsonl` through `batch-13.jsonl`: `{"file", "capabilities": [{"name", "outline"}]}`.

**Grouping and verification.** One Sonnet pass loaded all 13 batches, assigned each file to one of the eight areas above by directory and filename, then worked through each area: normalising every capability name to a verb-noun phrase; merging a Lambda handler with its unit test, its CDK wiring, its web page and its behaviour test into one capability rather than several; and checking every top-level outline against the actual source file it describes, rewriting any outline the Haiku pass got wrong, generic, or hedged with "or other", "various", "e.g." or "and/or". A fixed list of known-doubtful files (the WAF/404 scan-detection stack, the analytics metrics publisher, the MCP finance tools, the payment webhook handler, the Google Ads/GA4 sync scripts, the AWS account-management scripts) got mandatory re-verification regardless of how their Haiku outline read.

**Coverage.** Every one of the 1,295 walked files appears in exactly one capability's `Files:` line; none were dropped or invented.

**To rebuild:** regenerate the per-file walk into `target/capabilities/` (13 Haiku batches, file selection as above), then repeat the per-area grouping and verification pass and reassemble.
