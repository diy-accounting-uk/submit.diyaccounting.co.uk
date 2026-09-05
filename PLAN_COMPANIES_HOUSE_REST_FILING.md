# PLAN: Companies House REST filing (registered office and registered email address)

> Backlog item B34.3a. Source issue #15, split tracker in
> `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md`.
> Accounts filing through the XML Gateway is a separate item (B34.3b) and is out of scope here.

## Operator assertions (verbatim)

- "Companies House REST filing: registered office address changes and registered email address
  changes."
- "The Companies House REST filing API covers transactions, registered office address, registered
  email address and insolvency, not accounts."
- "Build those two changes as OAuth user-authorised filings against
  `https://api-sandbox.company-information.service.gov.uk` with the 'DIY Accounting Submit - test'
  developer-hub application the operator created (an OAuth client with a client id and secret, not
  an API key)."
- "Every new activity here must carry `environments = ["local", "proxy", "ci"]`."

## What we are building

Two filings a signed-in user can make for a company they control:

1. Change the registered office address (the AD01 form).
2. Change the registered email address.

Both go through the same three-step shape that Companies House calls a transaction. You open a
transaction against a company number, put one resource inside it, then close it. Closing submits
the filing. Companies House then processes it and reports a filing status on the transaction.

Both filings need an OAuth access token that the end user granted, scoped to that company number.
An API key will not work. The guide is explicit: where an API spec defines scopes, basic
authorisation with an API key is rejected.

The read-only lookup already in this repo stays as it is. It uses the API key and the public data
API. The filing work adds a second credential (an OAuth client) alongside it, and reuses the
lookup's Lambda shape, its stack, its page conventions and its simulator route file.

## What the sandbox proves, and what it does not

Companies House runs three sandbox hosts:

| Purpose | Sandbox host | Live host |
|---|---|---|
| API (filing and public data) | `api-sandbox.company-information.service.gov.uk` | `api.company-information.service.gov.uk` |
| Identity (OAuth) | `identity-sandbox.company-information.service.gov.uk` | `identity.company-information.service.gov.uk` |
| Test data generator | `test-data-sandbox.company-information.service.gov.uk` | none |

The test data generator creates a company on demand. `POST /test-data/company` with the API key in
an `api_key` header returns `company_number`, `company_uri` and `auth_code`. The `auth_code` is the
company authentication code the user types on the Companies House sign-in screen when a requested
scope names that company. `DELETE /test-data/company/{companyNumber}` with `{"auth_code": "..."}`
removes it.

So the sandbox proves the whole journey end to end: create a company, authorise it, open a
transaction, put the resource in, close it, read the filing status back. That is enough to build
and test both filings without touching a real company.

Two things the sandbox does not settle. It does not exercise the live register, so the first live
filing is still a supervised event. It also does not prove the payment path, because neither of
these two filings costs anything. If a transaction close ever answers `202` with an
`X-Payment-Required` header, that is a signal we filed something chargeable by mistake, and we
treat it as an error.

Scope strings always use the **live** domain even when you point at the sandbox. The identity
guide states this directly. Do not build sandbox hostnames into scope strings.

## Journey 1: change the registered office address

1. The user opens the Change Registered Office Address page and enters or picks a company number.
   The existing company search page already resolves a name to a number, so the page accepts a
   number and offers a link to search.
2. The page reads the current address from the public register:
   `GET /api/v1/companies-house/company/{companyNumber}/registered-office-address`. That answer
   carries an `etag`. The page shows the current address and keeps the etag.
3. The user fills in the new address and ticks the statement that the new address is an
   appropriate address under section 86(2) of the Companies Act 2006.
4. The page checks for a usable Companies House access token in `sessionStorage`. If there is
   none, or the stored scope does not cover this company and this resource, or the token has
   expired, the page saves the form and redirects to Companies House to authorise.
5. Companies House signs the user in and asks for the company authentication code, because the
   requested scope names a company number. The user grants permission and comes back to our
   callback page with a `code`.
6. The callback page checks `state`, exchanges the code through
   `POST /api/v1/companies-house/token`, stores the access token, the granted scope and the expiry,
   and returns to the form page.
7. The form page opens a transaction: `POST /api/v1/companies-house/transaction` with the company
   number and a description. It gets a transaction id back.
8. The form page adds the resource:
   `POST /api/v1/companies-house/transaction/{transactionId}/registered-office-address` with the
   address fields, the statement flag and `reference_etag` set to the etag from step 2.
9. The form page closes the transaction:
   `PUT /api/v1/companies-house/transaction/{transactionId}` with `{"status": "closed"}`.
   A `204` means Companies House accepted the submission.
10. The page then polls `GET /api/v1/companies-house/transaction/{transactionId}` and shows each
    entry in `filings`: its `status` (`accepted`, `processing` or `rejected`), its `description`,
    and any `reject_reasons`.

If step 9 answers `422`, the body carries a `validationStatus` with `is_valid: false` and an
`errors` array. The page lists those errors against the form fields, using each error's `location`
(a JSON path) to point at the field. The transaction stays open, so the user can correct the form
and try again with the same transaction id.

## Journey 2: change the registered email address

Same shape, with two differences.

Before anything else the page checks eligibility:
`GET /api/v1/companies-house/company/{companyNumber}/registered-email-address/eligibility`.
The answer is one `eligibility_status_code` from this set:

- `COMPANY_VALID_FOR_SERVICE`: carry on.
- `INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS`: the company has no registered email address yet.
  This API changes an existing address, it does not set the first one. Stop and say so.
- `INVALID_COMPANY_STATUS`: stop and say the company's status blocks the change.
- `INVALID_COMPANY_TYPE`: stop and say the company type is not covered.
- `COMPANY_NOT_FOUND`: stop and say the company number is not on the register.

There is no `reference_etag` on this resource. The body is just the new email address and the
statement flag for section 88A(2).

## OAuth design

### Endpoints

| Purpose | Sandbox | Live |
|---|---|---|
| Authorise | `https://identity-sandbox.company-information.service.gov.uk/oauth2/authorise` | `https://identity.company-information.service.gov.uk/oauth2/authorise` |
| Token | `https://identity-sandbox.company-information.service.gov.uk/oauth2/token` | `https://identity.company-information.service.gov.uk/oauth2/token` |
| Verify | `.../oauth2/verify` | `.../oauth2/verify` |
| User profile | `.../user/profile` | `.../user/profile` |

Note the British spelling of `authorise` in the path.

### The authorise redirect

`GET /oauth2/authorise` with these query parameters:

| Parameter | Required | Value we send |
|---|---|---|
| `response_type` | yes | `code` |
| `client_id` | yes | `COMPANIES_HOUSE_CLIENT_ID` from `submit.env` |
| `redirect_uri` | yes | `{DIY_SUBMIT_BASE_URL}companies-house/filingCallback.html` |
| `scope` | no, but we always send it | space delimited, see below |
| `state` | yes | a fresh random value, also written to `sessionStorage` |

Two optional parameters exist and we do not use them: `reauthenticate` forces a fresh sign-in, and
`hint` pre-fills the email field.

### Scopes

Scope strings are the full live resource URL with the permission appended after a dot. Substitute
the real company number for `{company_number}`.

| Filing | Scopes requested |
|---|---|
| Registered office address | `https://identity.company-information.service.gov.uk/user/profile.read` and `https://api.company-information.service.gov.uk/company/{company_number}/registered-office-address.update` |
| Registered email address | `https://identity.company-information.service.gov.uk/user/profile.read` and `https://api.company-information.service.gov.uk/company/{company_number}/registered-email-address.update` |

Creating a transaction needs `user/profile.read`. The transaction model says the company number on
a transaction only works when the access token already carries a matching company-permission
scope, so both scopes go in one authorise request.

Because a requested scope names a company number, Companies House asks the user for that company's
authentication code during sign-in. That is the "authorise the company" step from the user's point
of view. We do not handle the auth code ourselves and must never ask for it.

### State handling

Mirror the HMRC pages exactly. Before redirecting, the page generates a random state, writes it to
`sessionStorage` under `ch_oauth_state`, and writes the pending form and the return path under
`companiesHousePendingFiling` and `currentActivity`. The callback page compares the returned
`state` with the stored one, refuses to continue on a mismatch, and clears the key on success.

### Token exchange

`POST /oauth2/token` as `application/x-www-form-urlencoded`:

| Field | Value |
|---|---|
| `grant_type` | `authorization_code` |
| `code` | the code from the callback |
| `client_id` | the OAuth client id |
| `client_secret` | from Secrets Manager |
| `redirect_uri` | the same redirect URI used in the authorise request |

The response is JSON:

```json
{
  "access_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "refresh_token": "..."
}
```

`refresh_token` only comes back on the `authorization_code` grant.

### Where tokens live

Mirror the HMRC pattern. The token never rests on our servers. The token Lambda exchanges the code
and hands the result straight back to the browser. The browser holds it in `sessionStorage` for the
tab's lifetime:

| Key | Contents |
|---|---|
| `companiesHouseAccessToken` | the access token |
| `companiesHouseTokenScope` | the granted scope string, so a page can tell whether the token covers this company and this resource |
| `companiesHouseTokenExpiresAt` | `Date.now() + expires_in * 1000` |
| `ch_oauth_state` | the state value, removed once checked |
| `companiesHousePendingFiling` | the form the user filled in before the redirect |

The browser does not store the refresh token, and no Lambda persists one. The HMRC flow does the
same: `hmrcTokenPost.js` returns a refresh token in its response and no page keeps it. When the
Companies House token expires, or its scope does not match the company the user picked, the page
starts the authorise redirect again. That is one round trip and it keeps a long-lived credential
out of the browser and out of our database.

`companiesHouseTokenScope` decides reuse. A token granted for company `06846849` and
`registered-office-address.update` is not reusable for a different company or for the email filing.
The check is a plain string comparison against the scope string the page is about to request.

## Operator-owned steps

These are yours. Nothing in the build can do them.

1. **Register the redirect URIs on the developer-hub application.** Open
   <https://developer.company-information.service.gov.uk/manage-applications>, open the
   "DIY Accounting Submit - test" application, and add every redirect URI we will use. Companies
   House rejects an authorise request whose `redirect_uri` is not registered, and the token
   exchange must send the identical string.
   - `http://localhost:3000/companies-house/filingCallback.html` (local and simulator lanes)
   - `https://local.submit.diyaccounting.co.uk:3443/companies-house/filingCallback.html` (proxy)
   - `https://ci-submit.diyaccounting.co.uk/companies-house/filingCallback.html` (ci)
   - `https://submit.diyaccounting.co.uk/companies-house/filingCallback.html` (prod, add it when
     the ci-only gate lifts)
2. **Put the OAuth client id and secret on the GitHub `ci` environment** as
   `COMPANIES_HOUSE_CLIENT_ID` (a variable is fine, it reaches the browser anyway) and
   `COMPANIES_HOUSE_CLIENT_SECRET` (a secret). Do the same on `prod` when the gate lifts.
3. **Hold a Companies House user account** for the sandbox that the behaviour tests can sign in
   as. The behaviour test signs in as a person on the Companies House screens; there is no
   client-credentials shortcut.
4. **Decide whether a separate sandbox OAuth client is needed for prod.** The developer hub keys an
   application to one environment. If "DIY Accounting Submit - test" is sandbox-only, a live
   filing needs a second application with its own client id and secret.

## The Lambdas

All under `app/functions/companies-house/`, following `{feature}{Method}.js`. All routes answer
JSON, always, including on error. Each one calls `enforceBundles(event)` first and maps its
failures with the existing `http403ForbiddenFromBundleEnforcement`.

Seven of the eight need the user's Companies House access token. The browser sends it as
`Authorization: Bearer <token>` and sends the Cognito access token as `X-Authorization`. That means
those routes use the custom authorizer, exactly like the HMRC VAT routes
(`jwtAuthorizer = false`, `customAuthorizer = true`). The two routes that read the public register
with the API key keep the lookup's setting (`jwtAuthorizer = true`, `customAuthorizer = false`) and
the browser calls them with `fetchWithIdToken`.

### 1. `companiesHouseTokenPost.js`

- Route: `POST /api/v1/companies-house/token`
- Authorizers: both false, matching `hmrcTokenPost`. The route is reached before any Companies
  House token exists.
- Request body: `{ "code": "..." }`
- Calls: `POST {COMPANIES_HOUSE_IDENTITY_BASE_URI}/oauth2/token` with the form fields above.
- Response 200: `{ "accessToken", "expiresIn", "tokenType", "scope" }`. Do not return the refresh
  token. Nothing consumes it and returning it puts a long-lived credential in the browser for no
  reason.
- Errors: missing `code` gives 400 through `buildValidationError`. A non-2xx from Companies House
  gives 500 with the upstream status and body under `error`.
- Publishes activity event `companies-house-token-exchanged`.
- IAM: read `COMPANIES_HOUSE_CLIENT_SECRET_ARN` from Secrets Manager, query the bundles table, put
  events on the activity bus, read the sub-hash salt.

The client secret is cached in module scope across warm starts, the way
`companiesHouseApi.resolveApiKey` caches the API key.

### 2. `companiesHouseTransactionPost.js`

- Route: `POST /api/v1/companies-house/transaction`
- Request body: `{ "companyNumber": "06846849", "description": "Change of registered office address", "reference": "..." }`. `reference` is optional.
- Validation: `companyNumber` through the existing `isValidCompanyNumber`. `description` must be
  present and at most 200 characters.
- Calls: `POST {COMPANIES_HOUSE_FILING_BASE_URI}/transactions` with
  `{"company_number": ..., "description": ..., "reference": ...}` and
  `Authorization: Bearer <user token>`.
- Response 201: `{ "transactionId", "status", "companyNumber", "companyName", "links" }` mapped
  from `id`, `status`, `company_number`, `company_name`, `links`.
- Errors: 401 from Companies House becomes our 401 with code `COMPANIES_HOUSE_UNAUTHORIZED`,
  because a 401 here means the user's token expired or lacks the company scope, and the page must
  re-authorise. Every other non-2xx becomes 500 carrying the upstream status and body.
- Publishes `companies-house-transaction-opened`.

### 3. `companiesHouseTransactionGet.js`

- Route: `GET /api/v1/companies-house/transaction/{transactionId}`
- Calls: `GET {filing base}/transactions/{transaction_id}`.
- Response 200: `{ "transactionId", "status", "companyNumber", "companyName", "createdAt", "closedAt", "filings": [ { "id", "type", "description", "status", "rejectReasons", "processedAt" } ] }`.
  `filings` on the wire is an object keyed by submission id, so map its values into an array and
  carry the key as `id`.
- Errors: 401 as above, 404 becomes our 404, everything else 500.

### 4. `companiesHouseTransactionPut.js`

- Route: `PUT /api/v1/companies-house/transaction/{transactionId}`
- Request body: `{ "status": "closed" }`. Reject any other status with 400. This route exists to
  close a transaction and nothing else.
- Calls: `PUT {filing base}/transactions/{transaction_id}` with `{"status": "closed"}`.
- Responses to map:
  - `204` becomes our 200 with `{ "transactionId", "status": "closed" }`.
  - `422` becomes our 422 with `{ "isValid": false, "errors": [ { "type", "error", "locationType", "location", "errorValues" } ] }`, mapped from the upstream `validationStatus`. This is the
    normal way a bad filing comes back, so it must reach the page intact.
  - `202` with an `X-Payment-Required` header becomes our 500 with message "This filing needs a
    payment, which this service does not support". Neither of our two filings is chargeable, so a
    202 means we built the wrong transaction.
  - `403` becomes our 409 with message "The transaction is already closed".
  - `401` becomes our 401 with `COMPANIES_HOUSE_UNAUTHORIZED`.
- Publishes `companies-house-filing-submitted`.

### 5. `companiesHouseRegisteredOfficeAddressGet.js`

- Route: `GET /api/v1/companies-house/company/{companyNumber}/registered-office-address`
- Authorizers: `jwtAuthorizer = true`, `customAuthorizer = false`. It reads the public register
  with the API key, so it needs no Companies House user token.
- Calls: `companiesHouseHttpGet("/company/{companyNumber}/registered-office-address")`, reusing the
  existing API-key client without change.
- Response 200: `{ "etag", "premises", "addressLine1", "addressLine2", "locality", "region", "postalCode", "country" }`.
- Errors: reuse `httpResponseFromCompaniesHouseResponse`.

The `etag` is the point of this route. The address change resource needs `reference_etag` set to
the current register etag, and Companies House rejects the filing if the register moved underneath
us.

### 6. `companiesHouseRegisteredOfficeAddressPost.js`

- Route: `POST /api/v1/companies-house/transaction/{transactionId}/registered-office-address`
- Request body:

```json
{
  "premises": "13",
  "addressLine1": "Bedford Road",
  "addressLine2": "",
  "locality": "Leeds",
  "region": "West Yorkshire",
  "postalCode": "LS12 3AB",
  "country": "England",
  "acceptAppropriateOfficeAddressStatement": true,
  "referenceEtag": "..."
}
```

- Validation, all of it server side:
  - `premises`, `addressLine1`, `locality`, `country`, `postalCode` and `referenceEtag` are
    required. Postcode became mandatory for this filing on 15 September 2025.
  - `country` must be one of `England`, `Wales`, `Scotland`, `Northern Ireland`, `Great Britain`,
    `United Kingdom`, `Not specified`.
  - `acceptAppropriateOfficeAddressStatement` must be exactly `true`. A missing or false value is a
    400 saying the user must accept the section 86(2) statement.
- Calls: `POST {filing base}/transactions/{transaction_id}/registered-office-address` with the
  snake_case body: `premises`, `address_line_1`, `address_line_2`, `locality`, `region`,
  `postal_code`, `country`, `accept_appropriate_office_address_statement`, `reference_etag`.
- Response 201 becomes our 201 with the camelCase resource plus `links`.
- Errors: `400` becomes our 400 carrying the upstream `errors` array. `409` becomes our 409 with
  "This transaction already holds a registered office address change". `403` becomes our 409 with
  "The transaction is closed". `401` becomes our 401 with `COMPANIES_HOUSE_UNAUTHORIZED`.

### 7. `companiesHouseRegisteredEmailEligibilityGet.js`

- Route: `GET /api/v1/companies-house/company/{companyNumber}/registered-email-address/eligibility`
- Authorizers: `jwtAuthorizer = false`, `customAuthorizer = true`. The spec puts OAuth scopes on
  this endpoint, so it needs the user's token.
- Calls: `GET {filing base}/registered-email-address/company/{company_number}/eligibility`.
- Response 200: `{ "eligibilityStatusCode": "COMPANY_VALID_FOR_SERVICE" }`.
- Errors: 401, 404 and 400 map as above.

### 8. `companiesHouseRegisteredEmailAddressPost.js`

- Route: `POST /api/v1/companies-house/transaction/{transactionId}/registered-email-address`
- Request body:

```json
{
  "registeredEmailAddress": "filings@example.co.uk",
  "acceptAppropriateEmailAddressStatement": true
}
```

- Validation: the address must be present and match a simple `x@y.z` shape.
  `acceptAppropriateEmailAddressStatement` must be exactly `true`, otherwise 400 saying the user
  must accept the section 88A(2) statement.
- Calls: `POST {filing base}/transactions/{transaction_id}/registered-email-address` with
  `{"registered_email_address": ..., "accept_appropriate_email_address_statement": true}`.
- Response 201 becomes our 201 with `{ "registeredEmailAddress", "acceptAppropriateEmailAddressStatement", "etag", "kind", "createdAt", "links" }`, read out of the upstream `data` object.
- Errors: `403` here has two meanings, the transaction is closed or the company has no registered
  email address yet. Map it to our 409 and pass the upstream body through under `error`, so the
  page can tell the user which it was.

### Shared service module

Add `app/services/companiesHouseFilingApi.js` next to the existing `companiesHouseApi.js`. It holds
what only the filing side needs and imports nothing from the HMRC client:

- `getFilingBaseUrl()` and `getIdentityBaseUrl()`, both throwing on a blank environment variable,
  matching `getCompaniesHouseBaseUrl`.
- `resolveClientSecret()`, caching the Secrets Manager value across warm starts.
- `extractCompaniesHouseAccessTokenFromLambdaEvent(event)`, reading `Authorization: Bearer`.
- `companiesHouseFilingRequest(method, path, { accessToken, body })`, building the bearer headers,
  carrying the request id, traceparent and correlation id the way `buildCompaniesHouseHeaders`
  does, and calling `fetchJsonWithTimeout` with `DEFAULT_TIMEOUTS.SHORT`.
- `httpResponseFromFilingResponse(request, chResponse, responseHeaders)`, the error mapping table
  above in one place.

`companiesHouseApi.js` keeps the API-key client unchanged and the two new API-key routes reuse it.
There is one implementation of each concern. The filing module does not re-implement bearer
handling that the read module already has, and the read module does not learn about OAuth.

## CDK

### `CompaniesHouseStack.java`

The stack goes from two Lambdas to ten. Everything else about it stays: one stack, no async
worker, no DynamoDB table of its own.

- Add `String companiesHouseFilingBaseUri()`, `String companiesHouseIdentityBaseUri()`,
  `String companiesHouseClientId()` and `String companiesHouseClientSecretArn()` to
  `CompaniesHouseStackProps`.
- Add eight `ApiLambda` constructions in the shape the two existing ones use. Keep
  `ingestMemorySize(256)`. Leave `ingestProvisionedConcurrency` at its default of 0, so the new
  Lambdas add no standing cost.
- Environment per Lambda:
  - All ten keep `BUNDLE_DYNAMODB_TABLE_NAME`, `ACTIVITY_BUS_NAME` and `ENVIRONMENT_NAME`.
  - The two API-key routes (search, company profile) and the new registered office address read
    keep `COMPANIES_HOUSE_BASE_URI` and `COMPANIES_HOUSE_API_KEY_ARN`.
  - The six filing routes get `COMPANIES_HOUSE_FILING_BASE_URI`.
  - The token route also gets `COMPANIES_HOUSE_IDENTITY_BASE_URI`, `COMPANIES_HOUSE_CLIENT_ID`,
    `COMPANIES_HOUSE_CLIENT_SECRET_ARN` and `DIY_SUBMIT_BASE_URL` (it rebuilds the redirect URI the
    same way `hmrcTokenPost` does).
- Extend `grantCompaniesHouseLambdaAccess` with a second overload, or add a boolean, so only the
  token Lambda gets `secretsmanager:GetSecretValue` on the client secret ARN. Follow the existing
  wildcard suffix rule: append `-*` when the ARN does not already end in it. Do not widen the API
  key grant to the filing Lambdas and do not give the client secret to anything but the token
  Lambda.
- Add all ten `ApiLambda`s to the `Lambda.stackHealthAlarm` list.
- Add a `cfnOutput` per new Lambda ARN, matching the two that exist.

### `SubmitSharedNames.java`

Add the same block of fields the two lookup routes have, for each of the eight new routes: ingest
handler, function name, ARN, provisioned concurrency alias ARN, HTTP method, URL path, and the two
authorizer booleans. Register each one as a `PublishedLambda` so it lands in the generated API docs,
with parameters described the way the two lookup routes describe theirs.

Paths and authorizers:

| Path | Method | jwt | custom |
|---|---|---|---|
| `/api/v1/companies-house/token` | POST | false | false |
| `/api/v1/companies-house/transaction` | POST | false | true |
| `/api/v1/companies-house/transaction/{transactionId}` | GET | false | true |
| `/api/v1/companies-house/transaction/{transactionId}` | PUT | false | true |
| `/api/v1/companies-house/company/{companyNumber}/registered-office-address` | GET | true | false |
| `/api/v1/companies-house/transaction/{transactionId}/registered-office-address` | POST | false | true |
| `/api/v1/companies-house/company/{companyNumber}/registered-email-address/eligibility` | GET | false | true |
| `/api/v1/companies-house/transaction/{transactionId}/registered-email-address` | POST | false | true |

### `SubmitApplication.java`

Read the four new values with `envOr`, the way `companiesHouseBaseUri` and
`companiesHouseApiKeyArn` are read, backed by new fields in the `cdk.json` app props. Pass them
into the stack builder. Pass an empty string when an ARN is absent, matching the existing line.

### CDK assertion tests

Extend `CompaniesHouseStackTest.java`:

- `stackWiresTenLambdas` replaces `stackWiresExactlyTheTwoLookupLambdas`. Assert
  `resourceCountIs("AWS::Lambda::Function", 10)`.
- `tokenLambdaReadsTheClientSecret`: synth with a client secret ARN and assert the token Lambda's
  role policy carries `secretsmanager:GetSecretValue` on that ARN plus `-*`.
- `filingLambdasCannotReadTheClientSecret`: assert no other Lambda's role policy names the client
  secret ARN.
- `filingLambdasCarryTheFilingBaseUri`: assert each filing Lambda's environment holds
  `COMPANIES_HOUSE_FILING_BASE_URI` and does not hold `COMPANIES_HOUSE_API_KEY_ARN`.
- `blankClientSecretArnLeavesTheVariableUnset`: mirror the existing blank-ARN test.

Run `./mvnw clean verify` before calling the CDK work done.

## Web

### Pages

Two new pages under `web/public/companies-house/`, plus one callback page:

| File | Purpose |
|---|---|
| `changeRegisteredOffice.html` | The address change journey, all steps on one page |
| `changeRegisteredEmail.html` | The email change journey |
| `filingCallback.html` | The OAuth callback, shared by both |

Build each page from `companySearch.html`: same head block, same RUM placeholders, same header with
`entitlement-status`, `auth-status`, `status-messages` and `loading-spinner` widgets, same
`#mainContent` and `#statusMessagesContainer` structure. Build `filingCallback.html` from
`activities/submitVatCallback.html`, which already has the state check, the token exchange and the
return-to-activity handling. Change the storage keys, the endpoint and the state key. Keep the
behaviour identical, including staying on the page when the exchange fails so the error stays
visible.

Each filing page has four views the script shows one at a time, with stable ids the behaviour tests
can target:

- `#companyView`: company number entry, and for the email page the eligibility answer.
- `#formView`: the current values, the new values, the statement checkbox.
- `#reviewView`: what is about to be filed, and the submit button.
- `#resultView`: the transaction id, the filing status and any reject reasons or validation errors.

Element ids to fix now, because the behaviour steps depend on them:
`#companyNumber`, `#companyLookupBtn`, `#premises`, `#addressLine1`, `#addressLine2`, `#locality`,
`#region`, `#postalCode`, `#country`, `#acceptOfficeStatement`, `#registeredEmailAddress`,
`#acceptEmailStatement`, `#continueBtn`, `#submitFilingBtn`, `#filingResult`,
`#validationErrors`.

### `web/public/lib/services/companies-house-filing-service.js`

A new module beside `companies-house-service.js`, in the same style: small, no HMRC concepts,
exported functions plus the window assignments at the bottom.

- `getRegisteredOfficeAddress(companyNumber)`: `fetchWithIdToken`, API-key route.
- `getRegisteredEmailEligibility(companyNumber)`: `authorizedFetch` with the Companies House
  bearer token.
- `openTransaction(companyNumber, description)`
- `putRegisteredOfficeAddress(transactionId, address)`
- `putRegisteredEmailAddress(transactionId, email)`
- `closeTransaction(transactionId)`
- `getTransaction(transactionId)`
- `hasUsableToken(scopeString)`: true when `companiesHouseAccessToken` exists,
  `companiesHouseTokenExpiresAt` is in the future, and `companiesHouseTokenScope` equals the scope
  string the page needs.
- `clearToken()`: removes the three token keys.

The five bearer-token calls pass `Authorization: Bearer ${sessionStorage.getItem("companiesHouseAccessToken")}` in `init.headers` and let `authorizedFetch`
add `X-Authorization`. That is exactly how `web/public/hmrc/vat/*.html` calls the HMRC routes.

### `web/public/lib/auth-url-builder.js`

Add `buildCompaniesHouseAuthUrl(state, scope)` beside `buildHmrcAuthUrl`. It reads
`COMPANIES_HOUSE_IDENTITY_BASE_URI`, `COMPANIES_HOUSE_CLIENT_ID` and `DIY_SUBMIT_BASE_URL` from
`window.envReady`, and builds
`{identity}/oauth2/authorise?response_type=code&client_id=...&redirect_uri={base}companies-house/filingCallback.html&scope=...&state=...`.
Add a `companiesHouseScope(companyNumber, resource)` helper in the filing service that returns the
two-scope string, so the scope is built in one place and the page never concatenates URLs.

### `submit.env`

Three new keys, written by every generator that writes this file:
`scripts/deploy-app.js`, `.github/workflows/deploy-app.yml`, `.github/workflows/deploy.yml`, and
the checked-in placeholder `web/public/submit.env`.

```
COMPANIES_HOUSE_CLIENT_ID=...
COMPANIES_HOUSE_IDENTITY_BASE_URI=https://identity-sandbox.company-information.service.gov.uk
COMPANIES_HOUSE_FILING_BASE_URI=https://api-sandbox.company-information.service.gov.uk
```

### Catalogue

Two new activities in `web/public/submit.catalogue.toml`. Both carry the `environments` gate the
parallel track adds, using the exact names that track chose.

```toml
[[activities]]
id = "change-registered-office"
name = "Change Registered Office Address (Companies House)"
display = "on-entitlement"
bundles = ["default"]
metered = false
environments = ["local", "proxy", "ci"]
paths = [
  "companies-house/changeRegisteredOffice.html",
  "^/api/v1/companies-house/transaction.*",
  "^/api/v1/companies-house/company/[^/]+/registered-office-address$",
  "^/api/v1/companies-house/token$",
]

[[activities]]
id = "change-registered-email"
name = "Change Registered Email Address (Companies House)"
display = "on-entitlement"
bundles = ["default"]
metered = false
environments = ["local", "proxy", "ci"]
paths = [
  "companies-house/changeRegisteredEmail.html",
  "^/api/v1/companies-house/transaction.*",
  "^/api/v1/companies-house/company/[^/]+/registered-email-address/eligibility$",
  "^/api/v1/companies-house/token$",
]
```

The two activities share the transaction and token paths on purpose. `enforceBundles` finds the
required bundles for a path and passes when the user holds any of them, and both activities sit on
`default`, so a shared path is unambiguous.

Both start on the `default` bundle, which every signed-in user already holds. The `environments`
gate is what keeps them off prod until the operator has tried them on ci. That is a deliberately
cheap starting point: no new bundle, no Stripe product, no pricing decision blocking the build.
Pricing is an open question below, to settle when the gate lifts.

### Other web wiring

- `scripts/bundle-for-tests.js`: add `lib/services/companies-house-filing-service.js` to the list.
- `scripts/deploy-app.js` and `PublishStack.java`: the CloudFront invalidation lists already carry
  `/companies-house/*`, so the new pages need no change there. The `submit.env` entry is already in
  both lists.
- `app/bin/server.js`: import and call the eight new `apiEndpoint` functions beside the two that
  exist.

## Simulator

Extend `app/http-simulator/routes/companies-house.js` and add
`app/http-simulator/routes/companies-house-oauth.js`. Register the new route file in
`app/http-simulator/server.js` beside the existing one.

### `companies-house-oauth.js`

Model it on `hmrc-oauth.js`, and keep it much smaller. Companies House shows one sign-in screen and
one permission screen, not the four-step HMRC journey.

- `GET /oauth2/authorise`: reject `response_type` other than `code` with a 400 JSON body. When
  `autoGrant=true` or `COMPANIES_HOUSE_AUTO_GRANT=true`, mint a code, store it with
  `storeAuthorizationCode` under `type: "companies-house"`, and redirect to `redirect_uri` with
  `code` and `state`. Otherwise render a permission page with `#companyAuthCode`, `#userId`,
  `#password` and a `#givePermission` submit button, so a behaviour test can walk it like a person.
  The page shows the requested scopes so a test can assert the company number reached the scope.
- `POST /oauth2/authorise`: consume the form, mint the code, redirect.
- `POST /oauth2/token`: `authorization_code` consumes the stored code and answers
  `{ access_token, refresh_token, expires_in: 3600, token_type: "Bearer" }`. `refresh_token` answers
  a fresh access token. Anything else answers 400 `unsupported_grant_type`.

The simulator route must not collide with the existing HMRC `/oauth2/authorize` handler. HMRC uses
the American spelling `authorize` and Companies House uses `authorise`, so the two paths differ and
both can live on the same simulator port. Register the Companies House route after the HMRC one and
add a comment naming the spelling difference, because it is the only thing keeping them apart.

### Filing routes in `companies-house.js`

Hold state in a new `app/http-simulator/scenarios/filings.js` module: a `Map` of transaction id to
transaction, and a `Map` of company number to registered office address and registered email
address. Seed it with the company `companies.js` already serves, so the lookup fixture and the
filing fixture agree.

Routes to add, each rejecting a request with no `Authorization: Bearer` header with a 401
`{"errors":[{"error":"invalid-authorization-header","type":"ch:service"}]}`:

| Route | Behaviour |
|---|---|
| `POST /transactions` | Mint an id, store `{status: "open", company_number, description, links}`, answer 201 with the transaction |
| `GET /transactions/:id` | Answer 200 with the stored transaction, 404 when unknown |
| `PUT /transactions/:id` | With `status: "closed"`, run the stored resource through the validation rules and answer 204 or the 422 validation body; answer 403 when already closed |
| `POST /transactions/:id/registered-office-address` | 201 with the resource, 409 when one already exists, 400 when a required field is missing |
| `POST /transactions/:id/registered-email-address` | 201 with the `data` wrapper, 409 when one already exists |
| `GET /company/:companyNumber/registered-office-address` | 200 with the address and a stable `etag` |
| `GET /registered-email-address/company/:companyNumber/eligibility` | 200 with `COMPANY_VALID_FOR_SERVICE` by default |

Give the simulator two deliberate unhappy paths, because the behaviour tests should cover them:

- Company number `00000422` answers `422` on close, with an `errors` array naming
  `$.postal_code`. That proves the validation-error rendering.
- Company number `00000001` answers `INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS` on the eligibility
  route. That proves the eligibility stop.

Closing a transaction sets `status: "closed"`, `closed_at`, and a `filings` object with one entry
whose `status` starts at `processing`. A second `GET` on the same transaction flips it to
`accepted`, so the polling path gets exercised without a timer.

## Environment variables

| Variable | `.env.test` / `.env.simulator` | `.env.proxy` | `.env.ci` | `.env.prod` |
|---|---|---|---|---|
| `COMPANIES_HOUSE_FILING_BASE_URI` | blank, filled at simulator start | `https://api-sandbox.company-information.service.gov.uk` | `https://api-sandbox.company-information.service.gov.uk` | blank until the gate lifts |
| `COMPANIES_HOUSE_IDENTITY_BASE_URI` | blank, filled at simulator start | `https://identity-sandbox.company-information.service.gov.uk` | `https://identity-sandbox.company-information.service.gov.uk` | blank until the gate lifts |
| `COMPANIES_HOUSE_CLIENT_ID` | `simulator-companies-house-client` | from `.env` | from the GitHub `ci` environment | later |
| `COMPANIES_HOUSE_CLIENT_SECRET` | `mock-simulator-client-secret` | from `.env` | unset, the ARN is used | later |
| `COMPANIES_HOUSE_CLIENT_SECRET_ARN` | blank | blank | `arn:aws:secretsmanager:eu-west-2:367191799875:secret:ci/submit/companies-house/client_secret` | `arn:aws:secretsmanager:eu-west-2:972912397388:secret:prod/submit/companies-house/client_secret` |

`COMPANIES_HOUSE_BASE_URI` keeps its current live value everywhere. The read-only lookup is on the
live public data API and stays there.

The simulator lane fills the two blank base URIs at start, the way `runLocalHttpSimulator` already
does for `HMRC_BASE_URI` and `COMPANIES_HOUSE_BASE_URI`. Add the two new names to that list.

### Secrets

Add one step to `.github/workflows/deploy-environment.yml`, copying the
`COMPANIES_HOUSE_API_KEY` step exactly:

```yaml
- name: Create secret in AWS from secrets.COMPANIES_HOUSE_CLIENT_SECRET
  run: |
    SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/companies-house/client_secret"
    if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region ${{ env.AWS_REGION }} 2>/dev/null; then
      aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "${{ secrets.COMPANIES_HOUSE_CLIENT_SECRET }}" --region ${{ env.AWS_REGION }}
    else
      aws secretsmanager update-secret --secret-id "$SECRET_NAME" --secret-string "${{ secrets.COMPANIES_HOUSE_CLIENT_SECRET }}" --region ${{ env.AWS_REGION }}
    fi
```

`COMPANIES_HOUSE_CLIENT_ID` is not a secret. It reaches the browser in `submit.env`. Put it on the
GitHub environment as a variable and read it in the `submit.env` generation steps.

## Tests

### Unit tests

One file per Lambda under `app/unit-tests/functions/`, built from
`companiesHouseCompanyGet.test.js`: the same DynamoDB and EventBridge mocks, `setupTestEnv`,
`setupFetchMock`, `parseResponseBody`.

Each file covers, at minimum:

- The happy path: the correct upstream URL, method, headers and body, and the mapped response.
- Every validation rule, one test each. For the address Lambda that means a test per required
  field, a test for a country outside the enum, and a test for the unticked statement.
- Every upstream status the Lambda maps: 401, 403, 404, 409, 422 and 500 where the table above
  lists them. Assert the status and the response body shape, and assert the body is JSON.
- Bundle enforcement: a `BundleAuthorizationError` gives 401 and a `BundleEntitlementError` gives
  403.
- A `HEAD` request gives 200 with an empty object, matching the existing routes.

For `companiesHouseTransactionPut.js` add a test that a 202 with `X-Payment-Required` becomes a
500 with the payment message, and a test that the 422 body's `errors` array survives the mapping
with `location` intact.

For `companiesHouseTokenPost.js` add a test that the response does not carry a refresh token.

Add `app/unit-tests/services/companiesHouseFilingApi.test.js` covering `getFilingBaseUrl` and
`getIdentityBaseUrl` throwing on blank, the bearer header shape, and the error mapping table.

Add `app/system-tests/companiesHouseFilingSimulator.system.test.js` beside the existing
`companiesHouseSimulator.system.test.js`, driving the simulator routes over HTTP.

Add a browser test `web/browser-tests/changeRegisteredOffice.browser.test.js` beside
`companySearch.browser.test.js` for the form validation and the view switching.

### Behaviour tests

Two new files in the existing style:

- `behaviour-tests/changeRegisteredOffice.behaviour.test.js`
- `behaviour-tests/changeRegisteredEmail.behaviour.test.js`

One steps file: `behaviour-tests/steps/behaviour-companies-house-filing-steps.js`, in the shape of
`behaviour-companies-house-steps.js`. Every step is a `test.step` with a screenshot before and
after, and uses `loggedClick` and `loggedFill`.

Steps to write:

`goToChangeRegisteredOffice`, `enterCompanyNumber`, `verifyCurrentAddressShown`,
`fillInNewAddress`, `acceptOfficeAddressStatement`, `authoriseWithCompaniesHouse`,
`submitFiling`, `verifyFilingAccepted`, `verifyValidationErrorShown`,
`goToChangeRegisteredEmail`, `verifyEligibilityAccepted`, `verifyEligibilityRejected`,
`fillInNewRegisteredEmail`, `acceptEmailAddressStatement`.

The address journey runs three scenarios:

1. The happy path through to `#filingResult` showing an accepted filing.
2. The validation path, using the simulator's `00000422` company, asserting `#validationErrors`
   names the postcode field.
3. The re-authorise path: clear `companiesHouseAccessToken` mid-journey and assert the page goes
   back through the Companies House screens rather than failing.

The email journey runs two: the happy path, and the `00000001` company answering
`INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS` with the page stopping and saying why.

The `beforeAll` block copies `companiesHouse.behaviour.test.js` exactly: `runLocalDynamoDb`,
`runLocalOAuth2Server`, `runLocalHttpServer`, the same env var reads, `test.setTimeout(300_000)`.

Add both suites to `package.json` as `test:changeRegisteredOfficeBehaviour-{simulator,proxy,ci}` and
`test:changeRegisteredEmailBehaviour-{simulator,proxy,ci}`, following the existing script naming and
keeping the `2>&1 | tee <projectName>.log` tail.

### What a ci run needs

- `COMPANIES_HOUSE_CLIENT_ID` as a GitHub Environment variable on `ci`.
- `COMPANIES_HOUSE_CLIENT_SECRET` as a GitHub Environment secret on `ci`.
- The ci redirect URI registered on the developer-hub application.
- A test company created in the sandbox with the test data generator, and its `auth_code`.
- A Companies House sandbox user account whose credentials the behaviour test can use, supplied the
  way `TEST_AUTH_USERNAME` and `TEST_AUTH_PASSWORD` already are.

Write `scripts/companies-house-test-company.js` to create and delete a sandbox company with the
test data generator, so a ci run can make a fresh one and clean up. It takes the API key from the
environment, prints the company number and auth code as JSON, and takes a `--delete` flag. Keep it
out of the deploy path; it is a developer and ci helper, run on demand.

The ci lane does not need a live filing. Everything the suites assert happens in the sandbox.

## Sequencing: three tracks

Each track owns its files outright. No two tracks write the same file. Land them in order, because
each depends on what came before.

### Track 1: auth plumbing (Sonnet)

Owns:

- `app/services/companiesHouseFilingApi.js` (new)
- `app/functions/companies-house/companiesHouseTokenPost.js` (new)
- `app/unit-tests/services/companiesHouseFilingApi.test.js` (new)
- `app/unit-tests/functions/companiesHouseTokenPost.test.js` (new)
- `app/http-simulator/routes/companies-house-oauth.js` (new)
- `app/http-simulator/server.js`
- `app/bin/server.js`
- `web/public/lib/auth-url-builder.js`
- `web/public/companies-house/filingCallback.html` (new)
- `web/public/submit.env`
- `.env.test`, `.env.simulator`, `.env.proxy`, `.env.ci`, `.env.prod`
- `.github/workflows/deploy-environment.yml`, `deploy-app.yml`, `deploy.yml`
- `scripts/deploy-app.js`
- `infra/main/java/.../SubmitSharedNames.java` (the token route only)
- `infra/main/java/.../SubmitApplication.java`
- `infra/main/java/.../stacks/CompaniesHouseStack.java` (the token Lambda and the four new props)
- `infra/test/java/.../stacks/CompaniesHouseStackTest.java`
- `cdk.json`

Must pass: `npm run test:unit`, `npm run test:system`, `./mvnw clean verify`.

### Track 2: filings (Sonnet)

Starts after track 1 merges, because it imports `companiesHouseFilingApi.js` and needs the shared
names pattern in place.

Owns:

- The seven remaining Lambdas under `app/functions/companies-house/`
- Their seven unit test files under `app/unit-tests/functions/`
- The filing routes added to `app/http-simulator/routes/companies-house.js`
- `app/http-simulator/scenarios/filings.js` (new)
- `app/system-tests/companiesHouseFilingSimulator.system.test.js` (new)
- `scripts/companies-house-test-company.js` (new)
- `infra/main/java/.../SubmitSharedNames.java` (the seven remaining routes)
- `infra/main/java/.../stacks/CompaniesHouseStack.java` (the seven remaining Lambdas)
- `infra/test/java/.../stacks/CompaniesHouseStackTest.java` (the remaining assertions)

Four files appear in both track lists: `app/bin/server.js`, `SubmitSharedNames.java`,
`CompaniesHouseStack.java` and `CompaniesHouseStackTest.java`. Track 1 adds the token route to each
of them and stops there. Track 2 adds the other seven. Ownership moves from track 1 to track 2 at
the merge boundary, so the two tracks never hold the same file at the same time. Land track 1 and
rebase track 2 on it before track 2 starts.

Must pass: `npm run test:unit`, `npm run test:system`, `./mvnw clean verify`.

### Track 3: web and simulator journeys (Sonnet)

Starts after track 2 merges.

Owns:

- `web/public/companies-house/changeRegisteredOffice.html` (new)
- `web/public/companies-house/changeRegisteredEmail.html` (new)
- `web/public/lib/services/companies-house-filing-service.js` (new)
- `web/public/submit.catalogue.toml`
- `web/browser-tests/changeRegisteredOffice.browser.test.js` (new)
- `behaviour-tests/changeRegisteredOffice.behaviour.test.js` (new)
- `behaviour-tests/changeRegisteredEmail.behaviour.test.js` (new)
- `behaviour-tests/steps/behaviour-companies-house-filing-steps.js` (new)
- `scripts/bundle-for-tests.js`
- `package.json` (the new test scripts)

Track 3 shares `web/public/submit.catalogue.toml` with the `environments` gate track. Land the
gate first, then track 3 adds its two activities with the field already understood by
`catalog-service.js` and `bundleManagement.js`. If the gate has not landed when track 3 starts,
track 3 still writes the `environments` key, and the readers ignore it until the gate lands.

Must pass: `npm run test:unit`, `npm run test:browser`,
`npm run test:changeRegisteredOfficeBehaviour-simulator`,
`npm run test:changeRegisteredEmailBehaviour-simulator`. Then the ci variants once the operator has
registered the ci redirect URI and put the client secret on the `ci` environment.

## Open questions

**Q1. Pricing when the ci-only gate lifts.** The plan puts both activities on the `default` bundle
so nothing blocks the build. When the operator has tried them on ci, three options:

- Leave them on `default` and free. Simplest, and it makes the limited-company story visible to
  every user at no cost to us. Companies House charges nothing for either filing.
- Move them to a new `resident-company` bundle with its own Stripe product. Highest revenue, most
  work: a new bundle, a Stripe product and price, and catalogue changes.
- Fold them into `resident-pro`. No new Stripe work, and it gives the existing top bundle a reason
  to exist for limited companies.

**Q2. One OAuth application or two.** The developer hub keys an application to an environment. If
"DIY Accounting Submit - test" is sandbox-only, prod needs a second application with its own client
id, secret and redirect URI, and the CDK needs a second secret ARN. The alternative is one
application covering both, with `COMPANIES_HOUSE_FILING_BASE_URI` alone deciding the target. The
operator can settle this by opening the application on the developer hub and reading what it says
about environments. Until then the plan carries one client id and one secret per environment, which
works either way.

**Q3. Do we want the insolvency resources.** The same filing API covers insolvency across 25
endpoints. Nothing in the backlog asks for it and no customer has. It is named here so a later
session knows the surface exists and does not rediscover it.

## Documentation used

Every fact in this plan came from one of these. The scope strings, field names and status codes are
quoted from the OpenAPI specifications rather than the rendered pages, because the rendered pages
are index pages with the detail behind further links.

| What | URL |
|---|---|
| Spec index | <https://developer-specs.company-information.service.gov.uk/> |
| Filing API reference | <https://developer-specs.company-information.service.gov.uk/manipulate-company-data-api-filing/reference> |
| Filing API OpenAPI, scope strings and paths | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/spec/filings-public.json> |
| Transactions operations | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/spec/transactions.json> |
| Transaction model, status enum, filings and reject reasons | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/models/transactions.json> |
| Registered office address operations and the postcode note | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/spec/companyAddress.json> |
| Registered office address model, required fields, country enum, `reference_etag` | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/models/registeredOfficeAddress.json> |
| Registered email address operations and eligibility | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/spec/registeredEmailAddress.json> |
| Registered email address model and required fields | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/models/registeredEmailAddress.json> |
| Validation status, error shape, eligibility status codes | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/models/errors.json> |
| Identity service reference | <https://developer-specs.company-information.service.gov.uk/companies-house-identity-service/reference> |
| Identity OpenAPI: authorise and token parameters, access token response | <https://developer-specs.company-information.service.gov.uk/account.ch.gov.uk-specifications/swagger-2.0/identity-public.json> |
| OAuth server-side web app guide: company auth code, refresh grant, scopes always use the live domain | <https://developer-specs.company-information.service.gov.uk/companies-house-identity-service/guides/ServerWeb> |
| Sandbox test data generator, create and delete a test company | <https://developer-specs.company-information.service.gov.uk/api.ch.gov.uk-specifications/swagger-2.0/spec/test-data-generator-public.json> |
| Public data API registered office address read | <https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/registered-office-address/registered-office-address> |
| Authorisation guide, API key basic auth | <https://developer-specs.company-information.service.gov.uk/guides/authorisation> |
| Rate limiting: 600 requests per five minutes, 429 when exceeded | <https://developer-specs.company-information.service.gov.uk/guides/rateLimiting> |
| Developer guidelines, key handling | <https://developer-specs.company-information.service.gov.uk/guides/developerGuidelines> |
| Manage applications, where the operator registers redirect URIs | <https://developer.company-information.service.gov.uk/manage-applications> |

The rate limit is 600 requests per five minutes across the application, shared with the read-only
lookup. A single filing journey costs at most six calls, so the limit is not a design constraint
today. The existing `httpResponseFromCompaniesHouseResponse` already maps 429 with `Retry-After`,
and the filing error mapper does the same.
