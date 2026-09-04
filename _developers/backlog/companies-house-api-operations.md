# Companies House company lookup

## Scope

Add a read-only Companies House lookup to the site: a user searches for a company by name or number,
picks a result, and sees the company profile. The site calls the Companies House public REST API with
an API key held in Secrets Manager. Two Lambdas back it, both synchronous, both behind the API Gateway
JWT authorizer. No filing, no accreditation, no OAuth, no HMRC fraud-prevention headers. The lookup is
free to run and free to use, so it sits on the `default` bundle that every signed-in user already holds.

## Decisions

| Decision | Choice |
| --- | --- |
| Stack | New `CompaniesHouseStack.java` |
| Lambda shape | Synchronous `ApiLambda`, no SQS worker, no async request table |
| Authorizer | JWT (`jwtAuthorizer = true`, `customAuthorizer = false`) |
| Bundle gate | `default` (every signed-in user) |
| Request audit | Logs only, no DynamoDB record |
| Rate-limit handling | Pass 429 and `Retry-After` straight through, no server-side retry |
| Page count | One page holding both the search view and the profile view |

**No DynamoDB audit.** `putHmrcApiRequest` exists because HMRC's approval process needs a record of
every call we make on a user's behalf. Companies House serves public data under our own key, so the
record has no reader. The Lambdas log request and response through `createLogger` and stop there. That
drops a table, a grant and a stack prop.

**No fraud-prevention headers.** `buildFraudHeaders.js`, `validateFraudPreventionHeaders`,
`Gov-Client-*` and `Gov-Vendor-*` are HMRC obligations under the MTD terms of use. Companies House asks
for none of it. Do not import `buildFraudHeaders.js` or `hmrcApi.js` into any Companies House file.

**No `Gov-Test-Scenario` equivalent.** Companies House has no scenario header. The simulator picks its
response from the company number and the search term instead.

## Endpoints

The Lambdas expose two of the four candidate Companies House reads.

| Our route | Companies House call | In scope | Why |
| --- | --- | --- | --- |
| `GET /api/v1/companies-house/search` | `GET /search/companies?q=&items_per_page=&start_index=` | Now | The journey starts here. A user rarely knows their own company number. |
| `GET /api/v1/companies-house/company/{companyNumber}` | `GET /company/{companyNumber}` | Now | The profile is the answer the user came for: name, status, incorporation date, registered office, SIC codes, next accounts due, next confirmation statement due. |
| `GET /api/v1/companies-house/company/{companyNumber}/officers` | `GET /company/{companyNumber}/officers` | Later | A second Lambda, route, page panel, fixture set and test suite for data the profile page can link out to. Add it once the profile page has real users asking for it. |
| `GET /api/v1/companies-house/company/{companyNumber}/filing-history` | `GET /company/{companyNumber}/filing-history` | Later | Same cost as officers, and it is the natural first read to add alongside a filing feature rather than ahead of one. |

Companies House base URI: `https://api.company-information.service.gov.uk`.

Authentication is HTTP Basic. The API key is the username and the password is empty:
`Authorization: Basic ` + base64 of `` `${apiKey}:` ``. There is no separate sandbox key and no test
environment for the read API. CI and prod each hold their own key.

## Files to create

### `app/services/companiesHouseApi.js`

The shared client. Mirrors the shape of `app/services/hmrcApi.js` at about a tenth the size.

- `getCompaniesHouseBaseUrl()` returns `process.env.COMPANIES_HOUSE_BASE_URI`, throwing when blank.
- `resolveApiKey()` returns `process.env.COMPANIES_HOUSE_API_KEY` when set, otherwise fetches
  `process.env.COMPANIES_HOUSE_API_KEY_ARN` from Secrets Manager and caches the value in a module
  variable across warm starts. Copy the lazy-import and cache pattern from
  `retrieveHmrcClientSecret` in `app/functions/hmrc/hmrcTokenPost.js`.
- `buildCompaniesHouseHeaders(apiKey)` returns `Authorization`, `Accept: application/json`, and the
  correlation headers from `context` (`x-request-id`, `traceparent`, `x-correlationid`) the same way
  `hmrcHttpGet` builds them.
- `companiesHouseHttpGet(endpoint, queryParams)` cleans blank query params, builds the URL, calls
  `fetchJsonWithTimeout` from `app/lib/httpFetch.js` with `DEFAULT_TIMEOUTS.SHORT`, logs the request
  and the response status, and returns `{ ok, status, data, headers }`. It writes nothing to DynamoDB.
- `isValidCompanyNumber(value)` uppercases, left-pads a purely numeric value to eight digits with
  zeros, and tests `/^[A-Z0-9]{8}$/`. Export the normalised value alongside the boolean so callers do
  not re-implement the padding. `6846849` becomes `06846849`; `SC123456` and `OC301234` pass unchanged.
- `httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders)` maps upstream status
  to our response: 404 to `http404NotFoundResponse`, 429 to `http429TooManyRequestsResponse` (see
  below), 401 and 403 to `http500ServerErrorResponse` with the message "Companies House rejected our
  API key" because those mean our key is wrong and not the user's request, and everything else
  non-OK to `http500ServerErrorResponse`.

### `app/lib/httpResponseHelper.js` (edit)

Add `http429TooManyRequestsResponse({ request, headers, message, retryAfterSeconds })`. It follows the
existing helpers exactly: merge the correlation headers from `context`, set `Retry-After` when
`retryAfterSeconds` is present, log at `warn`, and return through the private `httpResponse` function.
`Retry-After` is already in the `Access-Control-Expose-Headers` list, so the browser can read it.

### `app/functions/companies-house/companiesHouseSearchGet.js`

Route `GET /api/v1/companies-house/search`.

- `apiEndpoint(app)` registers the GET and a HEAD that returns 200, matching `hmrcReceiptGet.js`.
- `extractAndValidateParameters(event, errorMessages)` reads `q`, `itemsPerPage` and `startIndex` from
  `event.queryStringParameters`. `q` is required and must be 2 to 160 characters after trimming.
  `itemsPerPage` defaults to 20 and clamps to 1..50. `startIndex` defaults to 0 and must be a
  non-negative integer.
- `ingestHandler(event)` calls `validateEnv(["COMPANIES_HOUSE_BASE_URI"])`, `extractRequest(event)`,
  then `enforceBundles(event)` inside a try that returns `http403ForbiddenFromBundleEnforcement` on
  failure. It answers a HEAD with `http200OkResponse` before doing any work, returns
  `buildValidationError` when `errorMessages` is non-empty, then calls the service adaptor.
- `searchCompanies(query, { itemsPerPage, startIndex })` is the service adaptor. It calls
  `companiesHouseHttpGet("/search/companies", { q, items_per_page, start_index })` and returns
  `{ chResponse, results }` where `results` is `{ totalResults, itemsPerPage, startIndex, items }` and
  each item is `{ companyNumber, title, companyStatus, companyType, dateOfCreation, addressSnippet }`
  mapped from the snake_case upstream fields. Mapping here keeps the page free of upstream naming.
- On a non-OK upstream response, return `httpResponseFromCompaniesHouseResponse`.
- After a successful search, call `publishActivityEvent({ event: "company-search-run", summary:
  "Companies House search run", userSub })`.

### `app/functions/companies-house/companiesHouseCompanyGet.js`

Route `GET /api/v1/companies-house/company/{companyNumber}`.

- `apiEndpoint(app)` registers `app.get("/api/v1/companies-house/company/:companyNumber", ...)` and the
  matching HEAD. The Express path parameter name and the API Gateway path parameter name must both be
  `companyNumber`, or the deployed route breaks while the local one works.
- `extractAndValidateParameters` reads `companyNumber` from `event.pathParameters`, normalises it with
  `isValidCompanyNumber`, and pushes "Invalid company number - must be 8 characters" when it fails.
- `getCompanyProfile(companyNumber)` calls `companiesHouseHttpGet(`/company/${companyNumber}`)` and
  maps the response to `{ companyNumber, companyName, companyStatus, companyType, dateOfCreation,
  jurisdiction, registeredOfficeAddress, sicCodes, accountsNextDue, accountsNextPeriodEnd,
  confirmationStatementNextDue, confirmationStatementNextMadeUpTo }`.
- Same bundle enforcement, same error mapping, and
  `publishActivityEvent({ event: "company-profile-viewed", ... })` on success.

### `app/http-simulator/routes/companies-house.js`

Two routes on the simulator app.

- `GET /search/companies` reads `q`, `items_per_page`, `start_index`. It returns 401 with
  `{ code: "UNAUTHORIZED" }` when the `Authorization` header is missing, so the missing-key path is
  testable. It matches `q` case-insensitively against the fixture titles and company numbers, applies
  `start_index` and `items_per_page`, and returns the upstream shape.
- `GET /company/:companyNumber` returns the fixture for a known number, 404 with
  `{ errors: [{ error: "company-profile-not-found", type: "ch:service" }] }` for an unknown one, and
  429 with `Retry-After: 300` for the reserved rate-limit number below.
- Log every call with the `[http-simulator:companies-house]` prefix, matching `vat-penalties.js`.

### `app/http-simulator/scenarios/companies.js`

The fixtures. Three companies, chosen so every branch of the page has data.

| Company number | Name | Status | Purpose |
| --- | --- | --- | --- |
| `06846849` | DIY ACCOUNTING LIMITED | active | The real company. Same number the behaviour test uses against the live API, so the simulator and live journeys assert the same name. |
| `SC000000` | SIMULATOR TEST COMPANY (SCOTLAND) LIMITED | active | Proves the non-numeric company-number prefix path and a Scottish jurisdiction. |
| `00000001` | SIMULATOR DISSOLVED COMPANY LIMITED | dissolved | Drives the non-active status rendering. |

Reserved numbers with no company record:

- `99999999` returns 404.
- `42942942` returns 429 with `Retry-After: 300`.

Each fixture carries the full upstream profile shape: `company_name`, `company_number`,
`company_status`, `type`, `date_of_creation`, `jurisdiction`, `registered_office_address`
(`address_line_1`, `locality`, `postal_code`, `country`), `sic_codes`, `accounts.next_accounts.due_on`,
`accounts.next_accounts.period_end_on`, and `confirmation_statement.next_due`. Give the two simulator
companies dates far in the future so a fixture never expires into a failing assertion. Give
`06846849` its real registered office and SIC codes.

Export `searchCompanies(query, itemsPerPage, startIndex)` and `getCompany(companyNumber)` so the route
file holds no data.

### `infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java`

A new stack, not an addition to `HmrcStack`. `HmrcStackProps` is an HMRC credential surface: base URIs,
client ids and two client secret ARNs, all granted to the Lambdas in that stack. Adding a Companies
House API key ARN to it widens the HMRC Lambdas' IAM surface for no reason, and it puts a lookup
feature on the same deploy job as VAT submission, where a failed synth blocks the paying path. A
separate stack costs seven registration edits, listed below, and each one is mechanical.

Model the stack on `HmrcStack.java`, keeping only what a synchronous read needs.

- `CompaniesHouseStackProps` extends `StackProps` and `SubmitStackProps`, with `baseImageTag()`,
  `companiesHouseBaseUri()`, `companiesHouseApiKeyArn()` and `sharedNames()`. No Cognito pool id, no
  DynamoDB tables.
- Import the bundles table by name for `enforceBundles`:
  `Table.fromTableName(this, "ImportedBundlesTable-%s".formatted(props.deploymentName()),
  props.sharedNames().bundlesTableName)`.
- Build each Lambda with `new ApiLambda(this, ApiLambdaProps.builder()...)`, not `AsyncApiLambda`.
  Set `ingestMemorySize(256)`, leave `ingestProvisionedConcurrency` at its default 0, and take the
  default 28-second timeout.
- Environment map per Lambda: `COMPANIES_HOUSE_BASE_URI`, `BUNDLE_DYNAMODB_TABLE_NAME`,
  `ACTIVITY_BUS_NAME`, `ENVIRONMENT_NAME`, and `COMPANIES_HOUSE_API_KEY_ARN` added only when
  `StringUtils.isNotBlank(props.companiesHouseApiKeyArn())`.
- Grants per Lambda: `bundlesTable.grant(fn, "dynamodb:Query")`,
  `SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName())`, `events:PutEvents` on the
  activity bus ARN, and `secretsmanager:GetSecretValue` on the API key ARN with the `-*` suffix
  appended when it is not already there. Copy the wildcard handling from the HMRC client secret grant
  in `HmrcStack.java`.
- Expose `lambdaFunctionProps` as a `List<AbstractApiLambdaProps>` holding both, the same as
  `HmrcStack`.

### `web/public/companies-house/companySearch.html`

One page, two views. Build it from `web/public/hmrc/vat/vatObligations.html`: same head block, same
header and nav, same footer, same script tags in the same order, minus `hmrc-scope-check.js` and
`test-data-generator.js` which are HMRC-specific. Relative paths are `../` deep, not `../../`.

Search view:

- An input `#companyQuery` with a label, a hint ("Company name or the 8-character company number, for
  example DIY Accounting or 06846849"), and a submit button `#searchBtn`.
- Submit calls `searchCompanies` from the service module, shows `#loadingSpinner` while it runs, and
  renders `#searchResults` as a table with columns Company, Number, Status, Incorporated, Address. Each
  row's company name is a button that opens the profile view.
- Empty results render "No companies matched that search." in `#searchResults`.

Profile view:

- Hidden until a result is chosen or the page loads with `?companyNumber=`.
- A definition list `#companyProfile` showing name, number, status, type, incorporation date,
  jurisdiction, registered office, SIC codes, next accounts due, next confirmation statement due.
- A "New search" button `#newSearchBtn` returning to the search view.
- Selecting a result pushes `?companyNumber=...` with `history.pushState`, and the page reads that
  parameter on load, so a profile URL can be shared and reloaded.

Errors go through the existing `#statusMessagesContainer` and the `widgets/status-messages.js` widget.
A 429 shows "Companies House is rate limiting our lookups. Try again in N seconds." using the
`Retry-After` value from the response, falling back to "in a few minutes" when the header is absent.

### `web/public/lib/services/companies-house-service.js`

Small, and it holds no HMRC concepts. Import `authorizedFetch` from `./api-client.js`.

- `searchCompanies(query, { itemsPerPage = 20, startIndex = 0 } = {})` calls
  `GET /api/v1/companies-house/search`, throws an `Error` carrying `retryAfterSeconds` when the status
  is 429, and returns the parsed body.
- `getCompanyProfile(companyNumber)` calls `GET /api/v1/companies-house/company/{companyNumber}` with
  the same error handling.
- `normaliseCompanyNumber(value)` uppercases and left-pads a numeric value to eight digits, matching
  the server. The page uses it so a user typing `6846849` sees a result rather than a validation error.
- Debounce is the page's job, not the service's: the page fires a search on submit, not on keystroke,
  which keeps us far below the rate limit without a debounce timer.

## Files to edit

| File | Change |
| --- | --- |
| `app/bin/server.js` | Two imports from `../functions/companies-house/`, two `apiEndpoint(app)` calls after `hmrcReceiptGetApiEndpoint(app)`. |
| `app/http-simulator/server.js` | Import and register `companiesHouseEndpoint(app)` after `testUserEndpoint(app)`. |
| `app/lib/httpResponseHelper.js` | Add `http429TooManyRequestsResponse`. |
| `behaviour-tests/helpers/behaviour-helpers.js` | In `runLocalHttpSimulator`, add `process.env.COMPANIES_HOUSE_BASE_URI = result.baseUrl;` alongside the two HMRC assignments. |
| `web/public/submit.catalogue.toml` | One `[[activities]]` block, below. |
| `infra/.../SubmitSharedNames.java` | `companiesHouseStackId`, the name/handler/ARN/alias/path/authorizer fields for both Lambdas, and two `publishedApiLambdas.add(...)` entries. Detail below. |
| `infra/.../SubmitApplication.java` | Two `SubmitApplicationProps` fields, two `envOr` reads, the stack construction, `lambdaFunctions.addAll(this.companiesHouseStack.lambdaFunctionProps)`, and `this.apiStack.addStackDependency(companiesHouseStack)`. |
| `infra/.../stacks/PublishStack.java` | Add `"/companies-house/*"` to `distributionPaths`. |
| `scripts/deploy-app.js` | Add `"/companies-house/*"` to the invalidation path list. |
| `cdk-application/cdk.json` | `"companiesHouseBaseUri": "https://api.company-information.service.gov.uk"` and `"companiesHouseApiKeyArn": ""`. |
| `.env.ci`, `.env.prod` | `COMPANIES_HOUSE_BASE_URI` and `COMPANIES_HOUSE_API_KEY_ARN`. |
| `.env.proxy` | `COMPANIES_HOUSE_BASE_URI=https://api.company-information.service.gov.uk`. The key comes from the gitignored `.env`. |
| `.env.simulator`, `.env.test` | `COMPANIES_HOUSE_BASE_URI=` (blank, filled at runtime) and `COMPANIES_HOUSE_API_KEY=simulator-companies-house-key`. |
| `.github/workflows/deploy-environment.yml` | A "Create secret in AWS from secrets.COMPANIES_HOUSE_API_KEY" step. |
| `.github/workflows/manage-secrets.yml` | Add the secret name to the `SECRETS` array in the check action. |
| `.github/workflows/deploy.yml` | Add the secret to the `validate-secrets` `SECRETS` array, add a `deploy-companies-house` job, add that job to `deploy-api`'s `needs`. |
| `.github/workflows/destroy-ci.yml`, `destroy-prod.yml` | `delete_stack_in_region "${DEPLOYMENT}-app-CompaniesHouseStack" eu-west-2`. |
| `.github/workflows/stack-drift.yml` | Add `"${DEPLOYMENT_NAME}-app-CompaniesHouseStack"` to the stack list. |
| `.github/workflows/synthetic-test.yml` | Add `'companiesHouseBehaviour'` to the `behaviour-test-suite` choice options. |
| `playwright.config.js` | New `companiesHouseBehaviour` project, plus the test file in `allBehaviour`'s `testMatch`. |
| `package.json` | Six npm scripts, below. |

### `SubmitSharedNames.java` detail

Copy the `receiptGet` block, which is the closest synchronous read. For each Lambda declare:

```
this.companiesHouseSearchGetLambdaHttpMethod = HttpMethod.GET;
this.companiesHouseSearchGetLambdaUrlPath = "/api/v1/companies-house/search";
this.companiesHouseSearchGetLambdaJwtAuthorizer = true;
this.companiesHouseSearchGetLambdaCustomAuthorizer = false;
var companiesHouseSearchGetLambdaHandlerName = "companiesHouseSearchGet.ingestHandler";
```

then the dashed name, function name, handler path (`"%s/companies-house/%s".formatted(appLambdaHandlerPrefix, ...)`),
ARN and provisioned-concurrency alias ARN, exactly as `receiptGet` does. Repeat for
`companiesHouseCompanyGet` with `urlPath = "/api/v1/companies-house/company/{companyNumber}"`. Add the
stack id next to `hmrcStackId`:

```
this.companiesHouseStackId = "%s-app-CompaniesHouseStack".formatted(props.deploymentName);
```

Add two `publishedApiLambdas.add(new PublishedLambda(...))` entries so both appear in the generated API
docs, with parameters `q`, `itemsPerPage`, `startIndex` (query) for search and `companyNumber` (path)
for the profile.

### `deploy.yml` job

Copy the `deploy-hmrc` job verbatim, rename it `deploy-companies-house`, set the name to
`'deploy CompaniesHouseStack via deploy-cdk-stack.yml'` and `stackName` to
`${{ needs.names.outputs.deployment-name }}-app-CompaniesHouseStack`. Keep `lookup-cognito: 'true'`,
because the shared names builder still reads it. Add `- deploy-companies-house` to `deploy-api`'s
`needs` list, or the API Gateway routes synth before the Lambdas exist.

## Environment variables and secret names

| Name | Where | Value |
| --- | --- | --- |
| `COMPANIES_HOUSE_BASE_URI` | Lambda env, `.env.*` | `https://api.company-information.service.gov.uk`. Blank in `.env.simulator` and `.env.test`, set to the simulator base URL at runtime. |
| `COMPANIES_HOUSE_API_KEY_ARN` | Lambda env, `.env.ci`, `.env.prod`, `cdk.json` | `arn:aws:secretsmanager:eu-west-2:<account>:secret:<env>/submit/companies-house/api_key` |
| `COMPANIES_HOUSE_API_KEY` | Local only: `.env` (gitignored), `.env.simulator`, `.env.test` | The literal key. When set it wins over the ARN, matching `HMRC_CLIENT_SECRET`. Never set in a deployed environment. |
| Secrets Manager secret | AWS, per environment | `ci/submit/companies-house/api_key`, `prod/submit/companies-house/api_key` |
| GitHub environment secret | `ci` and `prod` environments | `COMPANIES_HOUSE_API_KEY` |

The key travels the same road as `HMRC_SANDBOX_CLIENT_SECRET`. The operator sets the GitHub environment
secret. `deploy-environment.yml` creates or updates the Secrets Manager secret from it.
`.env.<env>` carries the ARN. `deploy.yml` loads that `.env` file through `npx dotenv` when it runs
`cdk deploy`. `SubmitApplication` reads `COMPANIES_HOUSE_API_KEY_ARN` with `envOr` and passes it to
`CompaniesHouseStack`, which sets it as a Lambda environment variable and grants
`secretsmanager:GetSecretValue` on it. At runtime `resolveApiKey()` fetches and caches the value.

The `deploy-environment.yml` step to add, modelled on the `STRIPE_SECRET_KEY` step:

```yaml
- name: Create secret in AWS from secrets.COMPANIES_HOUSE_API_KEY
  run: |
    SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/companies-house/api_key"
    if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region ${{ env.AWS_REGION }} 2>/dev/null; then
      echo "Creating secret $SECRET_NAME"
      aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "${{ secrets.COMPANIES_HOUSE_API_KEY }}" --region ${{ env.AWS_REGION }}
    else
      echo "Secret $SECRET_NAME already exists, updating"
      aws secretsmanager update-secret --secret-id "$SECRET_NAME" --secret-string "${{ secrets.COMPANIES_HOUSE_API_KEY }}" --region ${{ env.AWS_REGION }}
    fi
```

## Catalogue entry

One block in `web/public/submit.catalogue.toml`, placed after the `self-employed` activity. No new
bundle, no bundle edits, no Stripe product.

```toml
[[activities]]
id = "company-lookup"
name = "Company Lookup (Companies House)"
display = "on-entitlement"
bundles = ["default"]
metered = false
paths = ["companies-house/companySearch.html", "^/api/v1/companies-house.*"]
```

`default` is the automatic bundle, so every signed-in user gets the activity and `enforceBundles`
passes for them and throws `MISSING_AUTH_TOKEN` for anyone who is not signed in. That is the smallest
change that ships the feature: the catalogue gains one block and nothing else moves. It is also the
right gate on the merits, because the lookup costs us a free API key and no HMRC token, and it is a
natural way in to the paid VAT and ITSA activities.

To gate it behind payment instead, the operator changes the one `bundles` line. Listing the paid
bundles (`["resident-vat", "resident-itsa", "resident-guest", "resident-pro-comp", "resident-pro"]`)
and switching `display` to `"always-with-upsell"` puts it behind a subscription with an upsell prompt.
Adding a dedicated `resident-company` bundle needs a new `[[bundles]]` block, a Stripe price through
`scripts/stripe-setup.js`, and the bundle id in this line. Neither variant touches any code.

`index.html` needs no edit. It builds the activity buttons from the catalogue at page load, reading
`activity.paths` for the first entry containing `.html`.

## Tests

### Unit, `app/unit-tests/functions/companiesHouseSearchGet.test.js`

Copy the mock scaffolding from `app/unit-tests/functions/hmrcVatPenaltiesGet.test.js`, dropping the SQS
mock. Use `setupFetchMock` from `@app/test-helpers/mockHelpers.js` to stand in for the upstream call.

- returns matching companies for a search term
- maps snake_case upstream fields to camelCase response fields
- rejects a blank search term with 400
- rejects a search term over 160 characters with 400
- clamps items per page to 50
- sends the API key as the basic-auth username with an empty password
- reads the API key from Secrets Manager when only the ARN is set
- prefers the environment variable key over the Secrets Manager ARN
- returns 403 when the caller holds no bundle for the path
- returns 429 with Retry-After when Companies House throttles the key
- returns 500 when Companies House rejects the API key

### Unit, `app/unit-tests/functions/companiesHouseCompanyGet.test.js`

- returns the company profile for a valid company number
- left-pads a short numeric company number to eight digits
- accepts a company number with a jurisdiction prefix
- rejects a malformed company number with 400
- returns 404 when Companies House has no such company
- returns 429 with Retry-After when Companies House throttles the key
- maps the accounts and confirmation statement due dates into the response

### System, `app/system-tests/companiesHouseSimulator.system.test.js`

Model on `app/system-tests/hmrcSimulator.system.test.js`. Start the simulator, point
`COMPANIES_HOUSE_BASE_URI` at it, call the Lambdas' `ingestHandler` directly. No network.

- search returns the fixture company for a name fragment
- search paginates with start index and items per page
- profile returns DIY Accounting Limited for 06846849
- profile returns 404 for an unknown company number
- profile returns 429 with Retry-After for the throttled fixture number
- the simulator rejects a request with no Authorization header

### Browser, `web/browser-tests/companySearch.browser.test.js`

Model on `web/browser-tests/view-vat-return.browser.test.js`, stubbing `fetch`.

- shows the result list after a search
- shows a message when no companies match
- shows the profile panel when a result is selected
- puts the company number in the URL when a result is selected
- opens the profile view directly when the URL carries a company number
- shows a retry message with the wait time when the API reports a rate limit

### Behaviour, `behaviour-tests/companiesHouse.behaviour.test.js`

Model on `behaviour-tests/getVatObligations.behaviour.test.js`, minus every HMRC OAuth step
(`goToHmrcAuth`, `fillInHmrcAuth`, `grantPermissionHmrcAuth`, `submitHmrcAuth`, `acceptCookiesHmrc`),
minus `createHmrcTestUser`, and minus the fraud-header DynamoDB assertions. The journey is: consent to
data collection, go to the home page, log in, confirm the Company Lookup button is present, open it,
search for "DIY Accounting", confirm DIY ACCOUNTING LIMITED appears with number 06846849, open the
profile, confirm the name and an active status render, take a screenshot at each step into
`target/behaviour-test-results/screenshots/companies-house-behaviour-test`.

Put the reusable steps in a new `behaviour-tests/steps/behaviour-companies-house-steps.js`:
`goToCompanySearch`, `fillInCompanySearch`, `submitCompanySearch`, `verifyCompanySearchResults`,
`openCompanyProfile`, `verifyCompanyProfile`.

Company 06846849 is the fixture in both lanes. The simulator serves it from
`app/http-simulator/scenarios/companies.js`; the ci and prod lanes fetch it from the live API. The
assertions check the company name and number, not the incorporation date or the address, so a change
at Companies House does not break the test.

`playwright.config.js` project:

```js
{
  name: "companiesHouseBehaviour",
  testDir: "behaviour-tests",
  testMatch: ["**/companiesHouse.behaviour.test.js"],
  workers: 1,
  outputDir: "./target/behaviour-test-results/",
  timeout: 300_000,
},
```

Add `"**/companiesHouse.behaviour.test.js"` to the `allBehaviour` project's `testMatch` too.

`package.json` scripts, copying the `getVatObligationsBehaviour` block and dropping the
`-proxy-sandbox` variant, which has no meaning without an HMRC sandbox:

- `test:companiesHouseBehaviour`
- `test:companiesHouseBehaviour-proxy`
- `test:companiesHouseBehaviour-proxy-report`
- `test:companiesHouseBehaviour-ci`
- `test:companiesHouseBehaviour-prod`
- `test:companiesHouseBehaviour-simulator`

## Operator steps

The API key registration cannot be automated. A workflow can create the Secrets Manager secret from a
GitHub secret, but only a person can create the Companies House account and generate the key.

1. Sign in at <https://developer.company-information.service.gov.uk/> with a Companies House developer
   account, creating one if needed. The read API is free.
2. Open "Manage applications" and create an application. Give it a name that identifies the
   environment, for example "DIY Accounting Submit (CI)". Choose the live environment; there is no test
   environment for the read API.
3. In that application, create a REST API key ("Create new key" then "REST"). Copy the key. The
   Companies House site shows it again later, but treat it as a secret.
4. Repeat steps 2 and 3 for a second application, "DIY Accounting Submit (Production)", so ci and prod
   hold separate keys and a leak in one does not reach the other.
5. In GitHub, open Settings, Environments, `ci`, and add an environment secret named
   `COMPANIES_HOUSE_API_KEY` holding the ci key. Repeat for the `prod` environment with the prod key.
6. Run the "deploy environment" workflow for `ci`, then for `prod`. It writes each key into
   `<env>/submit/companies-house/api_key` in that environment's Secrets Manager.
7. Confirm with the "manage secrets" workflow, action `check`, for each environment. The new secret
   should report OK with a character count.
8. For local development against the live API, put `COMPANIES_HOUSE_API_KEY=<the ci key>` in the
   gitignored `.env` at the repo root. The simulator and unit tests need no key.

Rate limit: 600 requests per five minutes per key. Exceeding it returns 429 and Companies House may
refuse the key for the following five minutes. One key per environment, and the behaviour tests making
two calls per run, leaves the limit far out of reach.

## Acceptance criteria

1. `npm test` passes, including the two new unit test files and the new system test file.
2. `npm run test:browser` passes, including `companySearch.browser.test.js`.
3. `./mvnw clean verify` passes with `CompaniesHouseStack.java` in the build.
4. `npm run test:companiesHouseBehaviour-simulator` passes with no network access, finding DIY
   ACCOUNTING LIMITED against the simulator fixture.
5. `npm run test:companiesHouseBehaviour-ci` passes against the deployed CI environment, finding DIY
   ACCOUNTING LIMITED, company 06846849, against the live Companies House API.
6. `GET /api/v1/companies-house/search?q=diy` returns JSON, never HTML, for a signed-in user, and 403
   JSON for a request with no token.
7. The Company Lookup button appears on the home page for a signed-in user with no purchased bundle,
   and the page loads without an HMRC OAuth redirect.
8. Grepping `app/functions/companies-house/` and `app/services/companiesHouseApi.js` for `Gov-`,
   `fraud`, `hmrc` and `putHmrcApiRequest` returns nothing.
9. The deployed API Gateway has both routes, and `curl` against the deployed path parameter route
   `/api/v1/companies-house/company/06846849` returns the same body shape as the local Express route.
10. `ci/submit/companies-house/api_key` and `prod/submit/companies-house/api_key` both report OK from
    the "manage secrets" check action, and no key appears in any committed file.
