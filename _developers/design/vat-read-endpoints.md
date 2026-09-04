# Track B design — VAT liabilities, payments, penalties read endpoints

Source of truth for naming: `NEXT.md` items B32.1/B32.2/B32.3 (issue #19,
`_developers/backlog/vat-api-operations.md`). Those items name the Lambda files and stub env
vars explicitly — this design follows them exactly, even where a name is not perfectly
consistent with `hmrcVatObligationGet.js`'s own (singular) naming:

| Endpoint | Lambda file | Stub env var | HMRC path |
|---|---|---|---|
| Liabilities | `hmrcVatLiabilitiesGet.js` | `TEST_VAT_LIABILITY` | `GET /organisations/vat/{vrn}/liabilities` |
| Payments | `hmrcVatPaymentsGet.js` | `TEST_VAT_PAYMENTS` | `GET /organisations/vat/{vrn}/payments` |
| Penalties | `hmrcVatPenaltiesGet.js` | `TEST_VAT_PENALTIES` | `GET /organisations/vat/{vrn}/penalties` |

Build in this order — liabilities first, it sets the pattern; payments is nearly identical;
penalties differs the most (no from/to, deeply nested response). Do each end to end (Lambda →
simulator → CDK → page → tests → workflow entries) before starting the next, so `npm test` and
`./mvnw clean verify` stay green between them.

**This is one track of a concurrent multi-track batch on this repo** (see `NEXT.md`). Other
tracks touch some of the same shared files this design also touches:
`SubmitSharedNames.java`, `HmrcStack.java`, `DataStack.java`, `submit.catalogue.toml`,
`app/bin/server.js`, `app/bin/dynamodb.js`, `playwright.config.js`, `package.json`, and the
workflow YAMLs. Expect merge conflicts when landing on the shared integration branch
(`claude/board-batch-1`) — re-read each file immediately before editing, don't assume your last
read is current, and re-derive any count (e.g. the CDK `Custom::AWS` resource count below) from
the file as it stands at merge time rather than trusting a number computed earlier.

---

## 1. HMRC API reference (from `_developers/reference/hmrc-mtd-vat-api-1.0.yaml`, VAT (MTD) 1.0)

All three endpoints live in the same "VAT (MTD)" API as obligations/returns — same base URLs
(sandbox `https://test-api.service.hmrc.gov.uk`, prod `https://api.service.hmrc.gov.uk`), same
OAuth scope `read:vat`. **Penalties decision: no separate "VAT Penalties" API exists to call —
`/organisations/vat/{vrn}/penalties` is a third GET endpoint inside the same VAT (MTD) 1.0 spec
this repo already has queried locally**, alongside obligations/liabilities/payments. Confirmed
by reading the spec file itself (`info.title: VAT (MTD)`, `info.version: "1.0"`) rather than by
web search — the file was already in the repo.

### Retrieve VAT liabilities — `GET /organisations/vat/{vrn}/liabilities`

- Query params: `from` (required), `to` (required) — both `YYYY-MM-DD`. Minimum `from` is
  2017-12-01; `to` cannot exceed today; range must be 365 days or less.
- `Gov-Test-Scenario` header (sandbox only): `SINGLE_LIABILITY` (dates 2017-01-02..2017-02-02),
  `MULTIPLE_LIABILITIES` (2017-04-05..2017-12-21), `SINGLE_LIABILITY_2018_19`
  (2018-01-02..2018-02-02), `MULTIPLE_LIABILITIES_2018_19` (2018-04-05..2018-12-21),
  `INSOLVENT_TRADER`. Default (no header): no data found.
- 200 response: `{ "liabilities": [ { "taxPeriod": {"from","to"}, "type", "originalAmount",
  "outstandingAmount", "due" } ] }`. `type` is a free-text charge type (e.g. `"VAT ..."`,
  max 30 chars — HMRC's own example literally truncates it). `originalAmount`/
  `outstandingAmount` are 2dp monetary numbers; `due` is `YYYY-MM-DD`.
- Errors: 400 `VRN_INVALID` / `DATE_FROM_INVALID` / `DATE_TO_INVALID` / `DATE_RANGE_INVALID`;
  404 `NOT_FOUND`; 403 `CLIENT_OR_AGENT_NOT_AUTHORISED` / `RULE_INSOLVENT_TRADER`.

### Retrieve VAT payments — `GET /organisations/vat/{vrn}/payments`

- Same query params and constraints as liabilities (`from`/`to` required, same date rules,
  365-day max range).
- `Gov-Test-Scenario`: `SINGLE_PAYMENT` (2017-01-02..2017-02-02), `MULTIPLE_PAYMENTS`
  (2017-02-27..2017-12-21), `SINGLE_PAYMENT_2018_19` (2018-01-02..2018-02-02),
  `MULTIPLE_PAYMENTS_2018_19` (2018-02-27..2018-12-21), `INSOLVENT_TRADER`. Default: no data.
- 200 response: `{ "payments": [ { "amount", "received" } ] }` — just two fields per payment.
  `amount` 2dp monetary number, `received` is `YYYY-MM-DD` (optional — a payment not yet
  received may omit it).
- Errors: same shape as liabilities (`VRN_INVALID`, `DATE_FROM_INVALID`, `DATE_TO_INVALID`,
  `DATE_RANGE_INVALID`, `NOT_FOUND`, `CLIENT_OR_AGENT_NOT_AUTHORISED`,
  `RULE_INSOLVENT_TRADER`).

### Retrieve VAT penalties — `GET /organisations/vat/{vrn}/penalties`

- **No `from`/`to` query params at all** — HMRC always returns the trailing 24 months. Only
  `vrn` (path) and `Gov-Test-Scenario` (header, sandbox only).
- `Gov-Test-Scenario`: `DEFAULT` (multiple penalties in last 2 years), `NO_PENALTIES`,
  `LATE_SUBMISSION` (single), `LATE_PAYMENT` (single), `MULTIPLE_PENALTIES` (one of each),
  `MULTIPLE_LATE_PAYMENT_PENALTIES`, `MULTIPLE_LATE_SUBMISSION_PENALTIES`,
  `MULTIPLE_INACTIVE_LATE_SUBMISSION_PENALTIES`, `THRESHOLD_LATE_SUBMISSION_PENALTIES`,
  `CHARGE_LATE_SUBMISSION_PENALTIES`.
- 200 response is a nested object, not a flat array:
  ```
  {
    "totalisations": { lateSubmissionPenaltyTotalValue, penalisedPrincipalTotal,
                        latePaymentPenaltyPostedTotal, latePaymentPenaltyEstimateTotal },
    "lateSubmissionPenalty": {
      "summary": { activePenaltyPoints, inactivePenaltyPoints, periodOfComplianceAchievement,
                   regimeThreshold, penaltyChargeAmount },
      "details": [ { penaltyNumber, penaltyOrder, penaltyCategory (point|charge|threshold),
                      penaltyStatus (active|inactive), penaltyCreationDate, penaltyExpiryDate,
                      expiryReason?, communicationsDate?, lateSubmissions?[],
                      appealInformation?[], chargeReference?, chargeAmount?,
                      chargeOutstandingAmount?, chargeDueDate? } ]
    },
    "latePaymentPenalty": {
      "details": [ { principalChargeReference, penaltyCategory (LPP1|LPP2),
                      penaltyStatus (accruing|posted), penaltyAmountAccruing,
                      penaltyAmountPosted, penaltyAmountPaid?, penaltyAmountOutstanding?,
                      principalChargeBillingFrom, principalChargeBillingTo,
                      principalChargeDueDate, principalChargeDocNumber,
                      principalChargeLatestClearing?, penaltyChargeReference?,
                      penaltyChargeDueDate?, appealInformation?[], timeToPay?[] } ]
    }
  }
  ```
- Errors: 400 `VRN_INVALID` only (no date params to be invalid); 404 `NOT_FOUND`; 403
  `CLIENT_OR_AGENT_NOT_AUTHORISED` / `RULE_INSOLVENT_TRADER`.

---

## 2. The obligations pattern — every file that participates

Traced from `app/functions/hmrc/hmrcVatObligationGet.js` outward. File paths are relative to
the repo root.

1. **`app/functions/hmrc/hmrcVatObligationGet.js`** — the Lambda. Exports `apiEndpoint(app)`
   (Express registration, dev server only), `extractAndValidateParameters`, `ingestHandler`
   (API Gateway entry — bundle enforcement, fraud headers, async initiation), `workerHandler`
   (SQS consumer that does the real HMRC call and persists the result), and
   `getVatObligations` (the actual HMRC call — builds `/organisations/vat/{vrn}/obligations`,
   simulates `SUBMIT_HMRC_API_HTTP_500`/`503`/`SLOW_10S` test scenarios inline, calls
   `hmrcHttpGet` from `app/services/hmrcApi.js`, publishes a `vat-obligations-queried` activity
   event with the **hashed** sub via `publishActivityEvent`). Uses `enforceBundles` from
   `app/services/bundleManagement.js` for entitlement gating, `validateFraudPreventionHeaders`/
   `buildHmrcHeaders`/`hmrcHttpGet` from `app/services/hmrcApi.js`, `isValidVrn`/
   `isValidIsoDate`/`isValidDateRange` from `app/lib/hmrcValidation.js`,
   `asyncApiServices.{initiateProcessing,wait,check,complete,error}` and
   `getAsyncRequest` from `app/data/dynamoDbAsyncRequestRepository.js` for the async
   ingest/worker split (SQS-backed, DynamoDB-tracked, 25s max synchronous wait —
   `MAX_WAIT_MS = 25000`).
   - `validateEnv([...])` requires `HMRC_BASE_URI`, `HMRC_SANDBOX_BASE_URI`,
     `BUNDLE_DYNAMODB_TABLE_NAME`, `HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME`,
     `HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME`, `SQS_QUEUE_URL` — each new endpoint
     needs its own async-table env var name in this list.
   - Query params handled: `vrn` (required), `from`/`to` (**optional**, defaulted to
     1 Jan of current year → today when absent), `status` (`O`/`F`), `Gov-Test-Scenario`,
     `hmrcAccount` header (`sandbox`/`live`), `runFraudPreventionHeaderValidation`.
2. **`app/bin/server.js`** line 21 (import) and line 224 (`hmrcVatObligationGetApiEndpoint(app)`)
   — registers the Express route for local/proxy dev.
3. **`app/bin/dynamodb.js`** lines 343-346 — reads
   `HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME` and calls
   `ensureAsyncRequestsTableExists(name, endpoint)` when running the local dynalite server
   directly (`node app/bin/dynamodb.js`).
4. **`app/http-simulator/routes/vat-obligations.js`** — Express route for the HMRC sandbox
   simulator: `GET /organisations/vat/:vrn/obligations`. Validates VRN/date format itself
   (its own `INVALID_DATE_FROM`/`INVALID_DATE_TO` codes — see §4 "trap" below), reads
   `Gov-Test-Scenario` from `req.headers["gov-test-scenario"]`, delegates to
   `getObligationsForScenario` in the scenarios file, applies status filtering and any
   `delayMs` (slow-scenario) itself, sets `x-correlationid` on the response.
5. **`app/http-simulator/scenarios/obligations.js`** — the Gov-Test-Scenario data table:
   `scenarioObligations` (18+ named scenarios), `errorScenarios` (`NOT_FOUND`,
   `INSOLVENT_TRADER`, `VRN_INVALID`, `INVALID_DATE_FROM`, `INVALID_DATE_TO`,
   `DATE_RANGE_TOO_LARGE`, `SUBMIT_API_HTTP_500`, `SUBMIT_HMRC_API_HTTP_500`),
   `slowScenarios` (`SUBMIT_HMRC_API_HTTP_SLOW_10S`), `randomizePeriodKeys` (HMRC period keys
   "cannot be calculated, only validated" — tests must never hardcode one), exported
   `getObligationsForScenario(scenario)`.
6. **`app/http-simulator/server.js`** lines 11 and 50 — imports and registers
   `vatObligationsEndpoint(app)` into the simulator's Express app (order matters comment:
   "more specific routes first", though none of these three new routes collide with anything).
7. **`.env.ci` / `.env.proxy` / `.env.test` / `.env.simulator` / `.env.prod`** — each carries
   `HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME=` (table name value in test/proxy/
   simulator, blank in ci/prod — CI/prod get theirs from CDK) and `TEST_VAT_OBLIGATIONS=`
   (a JSON blob default, `{}` in proxy/simulator/prod, a real two-obligation example in
   `.env.test`). **`TEST_VAT_OBLIGATIONS` is consumed only by the two `*.system.test.js`
   files** (`hmrcVatObligationJourney.system.test.js`,
   `hmrcVatScenarios.system.test.js`) via a primed local HMRC mock server — it is not read by
   the Lambda, the simulator, or the page. The `.env.*` values are just defaults; every test
   that uses it overrides `process.env.TEST_VAT_OBLIGATIONS` itself before calling the handler.
8. **Infra — `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`** lines
   86, 238-251, 544-545, 813-856: the async table name field, the ingest/worker Lambda
   function-name/handler/ARN/provisioned-concurrency-alias fields, the SQS queue/DLQ name
   fields, the HTTP method/URL path/authorizer booleans, and the `publishedApiLambdas.add(new
   PublishedLambda(...))` call that feeds the OpenAPI generator — operation id
   `"getVatObligations"`, description, and the `ApiParameter` list (`vrn`, `from`, `to`,
   `status`, `Gov-Test-Scenario`, `runFraudPreventionHeaderValidation`).
9. **`infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java`** lines 34, 194-208,
   303-308: declares `public ITable hmrcVatObligationGetAsyncRequestsTable`, creates it via
   `ensureTable(this, id, tableName, "hashedSub", "requestId")` (`ensureTable` is 2
   `Custom::AWS` resources: `EnsureTable` create-table call + `EnsurePITR` continuous-backups
   call), enables TTL via `ensureTimeToLive(this, id, tableName, "ttl")` (1 more `Custom::AWS`
   resource), and adds two `CfnOutput`s for the table name/ARN.
10. **`infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java`** lines 46-48
    (fields), 139-143 (`Table.fromTableName` import of the DataStack table), 341-414 (the full
    `AsyncApiLambda` construction block — env map, `AsyncApiLambdaProps.builder()` with every
    ingest/worker/queue/DLQ/provisioned-concurrency name from `SubmitSharedNames`, `.environment
    (vatObligationLambdaEnv)`, then `vatObligationLambdaEnv.put("SQS_QUEUE_URL", ...queue.
    getQueueUrl())` after construction because the queue doesn't exist until the construct
    runs, then `this.lambdaFunctionProps.add(...)`, then a `.forEach` over
    `[ingestLambda, workerLambda]` granting `bundlesTable.grant(fn, "dynamodb:Query")`,
    `hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem")`, the async table's
    `GetItem`/`UpdateItem`, `SubHashSaltHelper.grantSaltAccess(...)`, and an
    `events:PutEvents` policy statement scoped to `activityBusArn`).
11. **`infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java`**
    line 92: `Template.fromStack(env.dataStack).resourceCountIs("Custom::AWS", 42)` — the
    single blast-radius assertion this feature bumps (see §5).
12. **`infra/test/java/co/uk/diyaccounting/submit/stacks/DataStackTest.java`** —
    `excludedTablesGetNoStreamUpdate()` (~line 88) lists every async-request table (and a few
    others) that must **not** get a DynamoDB stream; the new async tables belong in that list
    alongside `hmrcVatObligationGetAsyncRequestsTable`.
13. **`web/public/hmrc/vat/vatObligations.html`** — the page. Static form (VRN + optional
    from/to/status + a developer-only test-scenario `<select>` populated from every scenario
    name in `obligations.js`, gated behind `sessionStorage.showDeveloperOptions`), inline
    `<script>` (no ES module, no `hmrc-service.js` — see §4 "trap"): builds query params,
    calls `getGovClientHeaders()` (global from `hmrc-scope-check.js`/inline elsewhere — actually
    from `web/public/lib/services/hmrc-service.js`, exposed on `window`), checks
    `window.hmrcScopeCheck.isTokenSufficient()`, if insufficient redirects to HMRC OAuth via
    `window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount)` after stashing the
    pending request in `sessionStorage.pendingObligationsRequest`, otherwise calls
    `window.authorizedFetch('/api/v1/hmrc/vat/obligation?...', {...})` directly. On OAuth
    return, `handleOAuthCallback()` → `continueObligationsRetrieval()` replays the stashed
    request. `displayObligations(obligations)` builds an HTML table string and injects it into
    `#obligationsTable`; empty state is `'<p class="no-data">No obligations found for the
    specified criteria.</p>'`. Table columns: **VAT Period** (formatted date range, not the
    period key — HMRC requirement: never show period keys to users), **Due Date**, **Status**
    (Open/Fulfilled), **Received**, **Actions** (View Return / Submit Return button per row).
    There is **no dedicated "back" link** — only the header's home icon (`../../`) and footer
    links (`tests/index.html`, `../../docs/api/index.html`).
14. **`web/public/lib/services/hmrc-service.js`** — has `getGovClientHeaders`/`getClientIP`/
    IP-detection helpers and `submitVat` (used by the return-submission page), but **no
    obligations-fetching function**. The obligations page does not call this module for its
    GET call — it builds the fetch inline. Do not add a `getVatLiabilities`/etc. export here;
    follow the page's own inline pattern.
15. **`web/public/submit.catalogue.toml`** activity `id = "vat-obligations"` (and, separately,
    `id = "view-vat-return"`) — see §4 "trap" on the shared `^/api/v1/hmrc/vat.*` path regex.
16. **`app/services/bundleManagement.js`** `findRequiredBundleIdsForUrlPath` — unions bundle
    requirements from every catalogue activity whose `paths` match the request path; no code
    change needed here, only new catalogue entries.
17. **`web/public/index.html`** lines ~470-500 — builds the homepage activity button list
    dynamically from `catalog.activities`, using `activity.name` as the button label and the
    first `.html`-containing entry in `activity.paths` as the link. **No static homepage edit
    needed** — a correct catalogue entry is sufficient.
18. **`infra/main/java/co/uk/diyaccounting/submit/swagger/OpenApiGenerator.java`** — generates
    `web/public/docs/api/openapi.json` from `SubmitSharedNames.publishedApiLambdas` via the
    `exec-maven-plugin` `generate-swagger-docs` execution bound to Maven's `package` phase
    (`pom.xml` ~line 400, args `${baseUrl} ${project.version} ${project.basedir}/web/public/
    docs/api`). **Do not hand-edit `openapi.json`** — it regenerates on `./mvnw clean verify`
    (verify runs package). Both `web/public/docs/api/openapi.json` and
    `web/public-simulator/docs/api/openapi.json` exist; the simulator copy is built from
    `web/public` — never edit it directly (repo-wide rule).
19. **`behaviour-tests/getVatObligations.behaviour.test.js`** (731 lines) — one Playwright
    test, full journey: creates/reuses an HMRC sandbox test user if credentials aren't
    supplied, logs in, ensures a `day-guest` bundle, walks the obligations form, does the full
    HMRC OAuth dance via `behaviour-hmrc-steps.js` helpers, verifies results, then (in sandbox
    mode) re-runs against a battery of named `Gov-Test-Scenario` values. Uses page-object step
    functions from `behaviour-tests/steps/behaviour-hmrc-vat-steps.js`:
    `initVatObligations` (click the catalogue button, wait for `#vatObligationsForm`),
    `fillInVatObligations` (fills `#vrn`/`#fromDate`/`#toDate`/`#status`, optionally uses the
    sandbox "add test data" link, optionally opens the developer section to pick
    `#testScenario` and check `#runFraudPreventionHeaderValidation`), `submitVatObligationsForm`
    (clicks `#retrieveBtn`, races the click against `waitForURL` because it may trigger an
    OAuth redirect), `verifyVatObligationsResults`. Screenshots at every step to
    `target/behaviour-test-results/screenshots/...`.
20. **`package.json`** lines 104-110 — six script variants:
    `test:getVatObligationsBehaviour` (bare `playwright test --project=...`, tees to
    `getVatObligationsBehaviour.log`), `-proxy`, `-proxy-report` (also runs
    `test-report`/`publish-web-test-local.sh`), `-proxy-sandbox` (`HMRC_ACCOUNT=sandbox`),
    `-ci`, `-prod`, `-simulator` — each just wraps the bare script with `npx dotenv -e
    .env.<variant>` and its own log file name.
21. **`playwright.config.js`** — a `getVatObligationsBehaviour` project (`testMatch:
    ["**/getVatObligations.behaviour.test.js"]`, `workers: 1`, 300s timeout), and the test file
    is also listed in the `allBehaviour` project's `testMatch` array.
22. **`.github/workflows/synthetic-test.yml`** line 38 — `getVatObligationsBehaviour` as one
    `behaviour-test-suite` dropdown option (`workflow_dispatch` and `workflow_call` inputs).
23. **`.github/workflows/deploy.yml`** lines 1905-1930 — job `web-test-obligation-sandbox`
    calling `synthetic-test.yml` with `behaviour-test-suite: 'getVatObligationsBehaviour'`
    after deploy; and line 2136 — the job is listed in `disable-native-auth`'s `needs:` array
    so native Cognito auth doesn't get disabled until this job (and all its siblings) finish.
24. **`.github/workflows/test.yml`** lines 629-662 — job
    `behaviour-test-simulator-get-vat-obligations` runs
    `npm run test:getVatObligationsBehaviour-simulator` in CI against the http-simulator (no
    real HMRC sandbox call), uploads `target/behaviour-test-results/` as an artifact. Nothing
    downstream depends on this job's name.
25. **`_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md`** — the HMRC production-access
    application document. Line 98 lists obligations in the "API Endpoints Implemented" table;
    lines 104-106 currently read **"Not Implemented (not required for MVP): View VAT
    Liabilities, View VAT Payments"**; lines 466-491 have a `### VAT Obligations GET` section
    with the real response JSON shape. B32.3 explicitly calls this file out for updating.
26. **`web/public/guide.html`** — a step-by-step user guide; `id="obligations"` section (line
    207) is "Step 1: Check Your VAT Obligations" with a screenshot and a numbered how-to list.
    B32.3 calls this out too, for sections covering all three new pages.

Files that look related but are **not** part of this pattern, don't touch them:
- `app/lib/obligationFormatter.js` — used by `hmrcVatReturnGet.js`/`hmrcVatReturnPost.js` (the
  submission flow's own period-matching), not by the obligations GET handler or page. The
  page has its own inline `formatDate`/`formatDateRange`.
- `web/public/prefetch/prefetch-hmrc-vat-obligation-head.js` — referenced from
  `vatObligations.html` but the `<script>` tag is commented out. Dead weight; skip it for the
  new pages rather than propagating a disabled feature.
- No unit test file exists for `app/http-simulator/routes/vat-obligations.js` itself (only for
  `scenarios/obligations.js`) — don't feel obliged to invent route-level unit tests where the
  existing pattern has none.

---

## 3. File-by-file checklist — Liabilities (build this one first, in full)

### Lambda: `app/functions/hmrc/hmrcVatLiabilitiesGet.js`

Copy `app/functions/hmrc/hmrcVatObligationGet.js` in full and change:
- Header comment path, logger `source`.
- `validateEnv([...])`: replace
  `HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME` with
  `HMRC_VAT_LIABILITIES_GET_ASYNC_REQUESTS_TABLE_NAME` in both `ingestHandler` and
  `workerHandler`.
- `asyncRequestsTableName = process.env.HMRC_VAT_LIABILITIES_GET_ASYNC_REQUESTS_TABLE_NAME`
  (both places).
- `extractAndValidateParameters`: drop `status` entirely (not an HMRC param for this
  endpoint). Keep `from`/`to` defaulting to current-calendar-year-to-today **as a UX
  convenience** — HMRC marks both `required: true`, but defaulting keeps this page's UX
  consistent with obligations/payments rather than forcing the user to always fill dates in;
  the defaulted values still satisfy HMRC's validation (real dates, from ≤ to) so nothing
  breaks. This is a deliberate divergence from the literal spec requiredness, not an oversight
  — flag it in the PR description so a reviewer doesn't "fix" it back to hard-required.
  Keep `isValidVrn`/`isValidIsoDate`/`isValidDateRange` reuse as-is.
- `getVatLiabilities(...)` (rename from `getVatObligations`): `hmrcRequestUrl =
  '/organisations/vat/${vrn}/liabilities'`; `hmrcQueryParams = { from, to }` (no `status`);
  keep the `SUBMIT_HMRC_API_HTTP_500`/`503`/`SLOW_10S` simulated-failure branches verbatim —
  they're this app's own test scenarios, not HMRC's; `publishActivityEvent({ event:
  "vat-liabilities-queried", summary: "VAT liabilities queried", userSub: auditForUserSub })`;
  return `{ hmrcResponse, liabilities: hmrcResponse.data, hmrcRequestUrl }` (rename the
  `obligations` field throughout the file to `liabilities`).
- `payload`/processor/worker: drop `status` from the payload object; everything else
  (requestId, traceparent, correlationId, waitTimeMs plumbing, async initiate/wait/check/
  complete/error calls) is unchanged structurally — same 25s `MAX_WAIT_MS`.
- `apiEndpoint(app)`: route `/api/v1/hmrc/vat/liability` (GET and HEAD).

### `app/bin/server.js`

Add `import { apiEndpoint as hmrcVatLiabilitiesGetApiEndpoint } from
"../functions/hmrc/hmrcVatLiabilitiesGet.js";` near the other HMRC imports (~line 21), and
`hmrcVatLiabilitiesGetApiEndpoint(app);` next to `hmrcVatObligationGetApiEndpoint(app);`
(~line 224).

### `app/bin/dynamodb.js`

In the `if (import.meta.url === ...)` block (~line 343), add the same three-line pattern:
```js
const hmrcVatLiabilitiesGetAsyncRequestsTableName = process.env.HMRC_VAT_LIABILITIES_GET_ASYNC_REQUESTS_TABLE_NAME;
if (hmrcVatLiabilitiesGetAsyncRequestsTableName) {
  await ensureAsyncRequestsTableExists(hmrcVatLiabilitiesGetAsyncRequestsTableName, endpoint);
}
```

### Simulator route: `app/http-simulator/routes/vat-liabilities.js`

Copy `app/http-simulator/routes/vat-obligations.js`. Change:
- Route: `app.get("/organisations/vat/:vrn/liabilities", ...)`.
- Keep `isValidVrn`/`isValidDate` local helpers as-is.
- Drop the `status` query param and the status-filter step in the response-sender — liabilities
  has no status filter.
- `sendLiabilitiesResponse(res, result)`: `res.json({ liabilities: result.liabilities })`.
- Reuse the real HMRC error codes from §1 (`VRN_INVALID`, `DATE_FROM_INVALID`,
  `DATE_TO_INVALID`) for the 400s here, **not** obligations' invented `INVALID_DATE_FROM`/
  `INVALID_DATE_TO` — see §6 trap #1. `VRN_INVALID` message text can match obligations'
  wording since that one already happens to agree with HMRC's.

### Simulator scenarios: `app/http-simulator/scenarios/liabilities.js`

Copy the shape of `app/http-simulator/scenarios/obligations.js` minus the period-key helpers
(liabilities have no period key). Structure:
- `scenarioLiabilities` keyed by the real Gov-Test-Scenario names from §1:
  `SINGLE_LIABILITY`, `MULTIPLE_LIABILITIES`, `SINGLE_LIABILITY_2018_19`,
  `MULTIPLE_LIABILITIES_2018_19`. Each value an array of liability objects (see stub JSON
  below).
- `errorScenarios`: `INSOLVENT_TRADER` (403 `RULE_INSOLVENT_TRADER`), `NOT_FOUND` (404),
  `VRN_INVALID` (400), `DATE_FROM_INVALID` (400), `DATE_TO_INVALID` (400),
  `DATE_RANGE_INVALID` (400) — plus this app's own `SUBMIT_API_HTTP_500`/
  `SUBMIT_HMRC_API_HTTP_500` for consistency with every other GET endpoint's dev/test tooling.
- `getLiabilitiesForScenario(scenario)`: default (no scenario) returns **an empty list**
  (`{ liabilities: [] }`) — HMRC's own default behaviour for this endpoint is "no associated
  data found", unlike obligations' default (which fabricates a plausible pair). Match HMRC
  here rather than obligations' friendlier default, since a claim to have found data by
  default would be wrong for this endpoint specifically.

### `app/http-simulator/server.js`

Add `import { apiEndpoint as vatLiabilitiesEndpoint } from "./routes/vat-liabilities.js";` and
`vatLiabilitiesEndpoint(app);` next to the obligations registration.

### `.env.ci` / `.env.proxy` / `.env.test` / `.env.simulator` / `.env.prod`

Add two lines to each, mirroring the obligations pattern exactly (blank table name in ci/prod,
real table name in test/proxy/simulator; `TEST_VAT_LIABILITY` blank/`{}` in ci/proxy/
simulator/prod, a real example only in `.env.test`):
```
HMRC_VAT_LIABILITIES_GET_ASYNC_REQUESTS_TABLE_NAME=test-hmrc-vat-liabilities-get-async-requests-table   # blank in .env.ci / .env.prod
TEST_VAT_LIABILITY={"source":"stub","liabilities":[{"taxPeriod":{"from":"2024-01-01","to":"2024-03-31"},"type":"VAT Return Debit Charge","originalAmount":1000.00,"outstandingAmount":250.00,"due":"2024-05-07"}]}   # {} in .env.proxy/.env.simulator/.env.prod, blank in .env.ci
```
(Note the env var is `TEST_VAT_LIABILITY`, singular, per NEXT.md B32.1 — not
`TEST_VAT_LIABILITIES`. It is consumed only by a system test if one is added; it is not
read by the Lambda, simulator, or page. Adding it to `.env.*` now is for parity/future use,
matching how `TEST_VAT_OBLIGATIONS` exists in every `.env.*` file today.)

### Infra: `SubmitSharedNames.java`

Add a full field block mirroring lines 238-251 (rename `Obligation`→`Liabilities`), and a full
construction block mirroring lines 813-856:
```java
this.hmrcVatLiabilitiesGetLambdaHttpMethod = HttpMethod.GET;
this.hmrcVatLiabilitiesGetLambdaUrlPath = "/api/v1/hmrc/vat/liability";
this.hmrcVatLiabilitiesGetLambdaJwtAuthorizer = false;
this.hmrcVatLiabilitiesGetLambdaCustomAuthorizer = true;
var hmrcVatLiabilitiesGetLambdaHandlerName = "hmrcVatLiabilitiesGet.ingestHandler";
var hmrcVatLiabilitiesGetLambdaWorkerHandlerName = "hmrcVatLiabilitiesGet.workerHandler";
// ... same dashed-name / function-name / handler / arn / provisioned-concurrency-alias /
// queue-name / dlq-name derivations as the obligations block, substituting Liabilities.
publishedApiLambdas.add(new PublishedLambda(
    this.hmrcVatLiabilitiesGetLambdaHttpMethod,
    this.hmrcVatLiabilitiesGetLambdaUrlPath,
    "Get VAT liabilities from HMRC",
    "Retrieves VAT liabilities from HMRC for the authenticated user",
    "getVatLiabilities",
    List.of(
        new ApiParameter("vrn", "query", true, "VAT registration number (9 digits)"),
        new ApiParameter("from", "query", false, "From date in YYYY-MM-DD format"),
        new ApiParameter("to", "query", false, "To date in YYYY-MM-DD format"),
        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
        new ApiParameter("runFraudPreventionHeaderValidation", "query", false,
            "When true, validates HMRC Fraud Prevention Headers"))));
```
Also add `public String hmrcVatLiabilitiesGetAsyncRequestsTableName;` near line 86, set near
line 544:
```java
this.hmrcVatLiabilitiesGetAsyncRequestsTableName =
        "%s-hmrc-vat-liabilities-get-async-requests".formatted(this.envResourceNamePrefix);
```

### Infra: `DataStack.java`

Field `public ITable hmrcVatLiabilitiesGetAsyncRequestsTable;`; construction block mirroring
lines 194-208 (`ensureTable(this, id, tableName, "hashedSub", "requestId")` +
`ensureTimeToLive(this, id, tableName, "ttl")`); two `CfnOutput`s mirroring lines 303-308.

### Infra: `HmrcStack.java`

Field block mirroring lines 46-48. In the constructor: a `Table.fromTableName(...)` lookup
mirroring lines 139-143; a full env-map + `AsyncApiLambda` construction block mirroring lines
341-414 (rename `vatObligationLambdaEnv`→`vatLiabilitiesLambdaEnv`, table env var
`HMRC_VAT_LIABILITIES_GET_ASYNC_REQUESTS_TABLE_NAME`, all the `hmrcVatLiabilitiesGet*` shared-
name getters). The `.forEach` grant block is identical in shape (bundle `Query`, HMRC-requests-
table `PutItem`, own async table `GetItem`+`UpdateItem`, salt access, EventBridge `PutEvents`).

### Infra tests

- `SubmitEnvironmentCdkResourceTest.java` line 92 — bump `resourceCountIs("Custom::AWS", 42)`.
  See §5 for the exact math and the caveat about re-deriving it at merge time.
- `DataStackTest.java` `excludedTablesGetNoStreamUpdate()` — add
  `dataStack.hmrcVatLiabilitiesGetAsyncRequestsTable.getTableName(),` to the array.

### Page: `web/public/hmrc/vat/vatLiabilities.html`

Copy `vatObligations.html` in full. Changes:
- `<title>VAT Liabilities - DIY Accounting Submit</title>`, `<h1>VAT Liabilities</h1>`,
  subtitle "Retrieve VAT liabilities from HMRC".
- Form id `vatLiabilitiesForm`; keep the VRN field verbatim; keep from/to date fields (now
  effectively required by HMRC, but keep them defaulted client-side too, matching the Lambda
  decision above — don't mark them `required` in the HTML since the server defaults absent
  values); **drop the status `<select>`** (no such filter on this endpoint).
- Developer test-scenario `<select>` options: `SINGLE_LIABILITY`, `MULTIPLE_LIABILITIES`,
  `SINGLE_LIABILITY_2018_19`, `MULTIPLE_LIABILITIES_2018_19`, `INSOLVENT_TRADER`, `NOT_FOUND`,
  `SUBMIT_API_HTTP_500`, `SUBMIT_HMRC_API_HTTP_500`, `SUBMIT_HMRC_API_HTTP_503`,
  `SUBMIT_HMRC_API_HTTP_SLOW_10S` (drop every obligations-specific quarterly/monthly option).
- Results table id `liabilitiesTable`; empty state `'<p class="no-data">No liabilities found
  for the specified criteria.</p>'`. Columns: **Period** (formatted `taxPeriod.from`–
  `taxPeriod.to` date range, same `formatDateRange` helper), **Type** (raw `type` string,
  escaped), **Original Amount** (`originalAmount`, formatted as currency — reuse/extend the
  page's `escapeHtml`; add a small `formatCurrency(n) => n == null ? "-" :
  `£${Number(n).toFixed(2)}`` helper since obligations has no monetary column to copy from),
  **Outstanding Amount** (`outstandingAmount`, same currency formatting — highlight 0/blank as
  "Paid" for readability, since HMRC allows `outstandingAmount` to be absent when fully paid),
  **Due Date** (`due`, `formatDate`). **No Actions column** — liabilities are read-only
  information, there's nothing to submit or view per-row (unlike obligations, which links to
  submit/view-return).
- `continueLiabilitiesRetrieval`/`handleFormSubmission` equivalents: same OAuth-scope-check →
  redirect-or-fetch structure, POST/GET target `/api/v1/hmrc/vat/liability?...`,
  `sessionStorage.pendingLiabilitiesRequest` (rename from `pendingObligationsRequest`;
  `cancelRequest()`'s cleanup list gains this key), same 401-handling, same
  `x-wait-time-ms: "0"` header on the fetch.
- `displayLiabilities(liabilities)` replaces `displayObligations`; no `viewReturn`/
  `submitReturn` row-action functions needed (no Actions column).

### Catalogue: `web/public/submit.catalogue.toml`

New `[[activities]]` block, placed near `vat-obligations`/`view-vat-return`:
```toml
[[activities]]
id = "vat-liabilities"
name = "VAT Liabilities (HMRC)"
display = "always-with-upsell"
bundles = ["day-guest", "invited-guest", "resident-vat", "resident-guest", "resident-pro-comp", "resident-pro"]
tokenCost = 0
metered = true
paths = ["hmrc/vat/vatLiabilities.html", "^/api/v1/hmrc/vat.*"]
hmrcScopesRequired = ["read:vat"]
```
Same bundle list, `tokenCost`/`metered`/`hmrcScopesRequired` as obligations — no stated reason
to gate liabilities more tightly. See §6 trap #2 about the shared `^/api/v1/hmrc/vat.*` regex
before assuming this line does anything endpoint-specific.

### Unit tests: `app/unit-tests/functions/hmrcVatLiabilitiesGet.test.js`

Copy `app/unit-tests/functions/hmrcVatObligationGet.test.js` structurally (same SQS/DynamoDB/
EventBridge mocks at the top — those are generic to the async-Lambda pattern, not obligations-
specific). Rename the imported handler and adjust:
- `"HEAD request returns 200 OK"` — unchanged shape.
- `"returns 400 when VAT registration number is missing"` — unchanged shape.
- `"returns 200 with liabilities list on success"` — mock HMRC response
  `{ liabilities: [{ taxPeriod: {from,to}, type, originalAmount, outstandingAmount, due }] }`.
- `"publishes the vat-liabilities-queried event with the hashed sub, never the raw sub"` —
  same assertion pattern, new event name.
- `"returns 500 on HMRC API error"`, `"returns 400 for invalid VAT registration number
  format"`, `"returns 400 for invalid date format"` — unchanged shape (dates still validated
  the same way even though defaulted).
- `"returns 403 JSON when the authenticated user holds no bundle entitled to VAT
  liabilities"` / `"allows the request through once the user holds a bundle entitled..."` —
  unchanged shape, new copy.
- `"returns 202 when x-wait-time-ms=0 (async initiation)"` /
  `"returns 200 when processing completes synchronously..."` — unchanged shape.
- `describe("hmrcVatLiabilitiesGet worker")` / `"successfully processes SQS message..."` —
  unchanged shape.
- Drop nothing else; there is no unit test for the simulator route file to mirror (see §2).
  Do add one for `app/unit-tests/http-simulator/scenarios/liabilities.test.js` mirroring
  `obligations.test.js`'s `getObligationsForScenario` tests (rename to
  `getLiabilitiesForScenario`; drop the period-key format tests, liabilities have none).

### Behaviour test: `behaviour-tests/getVatLiabilities.behaviour.test.js`

Copy `getVatObligations.behaviour.test.js`. Same skeleton (env var reads, `beforeAll`/
`afterAll` server/dynamo/oauth2 bootstrap, HMRC test-user creation, login, bundle, HMRC OAuth,
sandbox-mode scenario sweep). Add step functions to
`behaviour-tests/steps/behaviour-hmrc-vat-steps.js` mirroring `initVatObligations`/
`fillInVatObligations`/`submitVatObligationsForm`/`verifyVatObligationsResults`:
`initVatLiabilities` (click `"VAT Liabilities (HMRC)"`, wait for `#vatLiabilitiesForm`),
`fillInVatLiabilities` (fill `#vrn`/`#fromDate`/`#toDate`, no status field, same developer-
section handling for `#testScenario`/`#runFraudPreventionHeaderValidation`),
`submitVatLiabilitiesForm` (click `#retrieveBtn`, same OAuth-redirect race),
`verifyVatLiabilitiesResults` (assert `#liabilitiesTable` populated or the empty-state text).

### Workflow / script wiring

- `package.json`: six `test:getVatLiabilitiesBehaviour*` scripts mirroring lines 104-110
  (rename `getVatObligations`→`getVatLiabilities` throughout, new log file names).
- `playwright.config.js`: new `getVatLiabilitiesBehaviour` project entry; add the test file to
  `allBehaviour`'s `testMatch` array too.
- `.github/workflows/synthetic-test.yml`: add `'getVatLiabilitiesBehaviour'` to the
  `behaviour-test-suite` dropdown options (both `workflow_dispatch.inputs` and
  `workflow_call.inputs`).
- `.github/workflows/deploy.yml`: new job `web-test-liability-sandbox` mirroring
  `web-test-obligation-sandbox` (lines 1905-1930) — same `needs:`, same `uses:
  ./.github/workflows/synthetic-test.yml`, `behaviour-test-suite: 'getVatLiabilitiesBehaviour'`.
  Add its job id to `disable-native-auth`'s `needs:` array (~line 2136).
- `.github/workflows/test.yml`: new job `behaviour-test-simulator-get-vat-liabilities`
  mirroring lines 629-662 (`npm run test:getVatLiabilitiesBehaviour-simulator`).

### Docs

- `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md`: add a row to the "API Endpoints
  Implemented" table (line ~98): `| Retrieve VAT Liabilities | GET
  /organisations/vat/{vrn}/liabilities | Implemented | hmrcVatLiabilitiesGet.js |`; remove
  "View VAT Liabilities" from the "Not Implemented" list (~line 105 — leave "View VAT
  Payments" there until B32.2 lands, or land the whole doc edit once when the track finishes,
  whichever is cleaner given they're adjacent lines); add a `### VAT Liabilities GET` section
  mirroring `### VAT Obligations GET` (~line 466) with the real example response from §1. Do
  **not** touch Appendix D (test-run evidence) — that only updates from an actual test run.
- `web/public/guide.html`: add a step section for liabilities, modelled on
  `id="obligations"` (~line 207): a short paragraph, a screenshot placeholder (or omit the
  `<img>` if no screenshot exists yet — don't fabricate one), a numbered how-to list linking to
  `hmrc/vat/vatLiabilities.html`. `help.html` currently lists no individual activity pages at
  all — no change needed there unless a natural FAQ entry presents itself.

---

## 4. Deltas for Payments (B32.2) — do this after liabilities lands

Payments is structurally identical to liabilities (same required `from`/`to`, same date-range
rules, same error codes, same "no status field" page shape). Differences only:

- Lambda: `app/functions/hmrc/hmrcVatPaymentsGet.js`, `getVatPayments(...)`,
  `HMRC_VAT_PAYMENTS_GET_ASYNC_REQUESTS_TABLE_NAME`, HMRC path
  `/organisations/vat/${vrn}/payments`, app route `/api/v1/hmrc/vat/payment`, activity event
  `vat-payments-queried`, return field `payments` (not `liabilities`).
- Response shape is much flatter than liabilities: `{ payments: [{ amount, received }] }` —
  only two fields per item, `received` may be absent (payment pending). No `type`/`due`/
  `taxPeriod` columns.
- Simulator: `app/http-simulator/routes/vat-payments.js`,
  `app/http-simulator/scenarios/payments.js` — scenario names `SINGLE_PAYMENT`,
  `MULTIPLE_PAYMENTS`, `SINGLE_PAYMENT_2018_19`, `MULTIPLE_PAYMENTS_2018_19`,
  `INSOLVENT_TRADER`; same error codes as liabilities (`VRN_INVALID`, `DATE_FROM_INVALID`,
  `DATE_TO_INVALID`, `DATE_RANGE_INVALID`, `NOT_FOUND`). Default scenario (no header): empty
  list, matching HMRC's real default, same reasoning as liabilities.
- Env: `TEST_VAT_PAYMENTS` (plural, per NEXT.md B32.2 — matches `payments` field, unlike the
  liabilities var which stayed singular). Example:
  `{"source":"stub","payments":[{"amount":1000.00,"received":"2024-05-06"}]}`.
- CDK: same three-file, four-block pattern (`SubmitSharedNames.java` fields + construction +
  `publishedApiLambdas` entry with operation id `"getVatPayments"` and the same `vrn`/`from`/
  `to`/`Gov-Test-Scenario`/`runFraudPreventionHeaderValidation` `ApiParameter` list;
  `DataStack.java` table + TTL + outputs; `HmrcStack.java` lookup + `AsyncApiLambda` block +
  grants). Bumps `Custom::AWS` by another 3 (see §5) and adds another row to
  `DataStackTest.excludedTablesGetNoStreamUpdate()`.
- Page: `web/public/hmrc/vat/vatPayments.html`, form id `vatPaymentsForm`, results table id
  `paymentsTable`, empty state `"No payments found for the specified criteria."`. Columns:
  **Amount** (currency-formatted), **Received** (formatted date, or "Pending" when absent —
  don't render a bare "-" for a payment that just hasn't landed yet, it reads as an error
  state rather than "not yet received"). No Actions column, same as liabilities.
- Catalogue id `vat-payments`, name `"VAT Payments (HMRC)"`, same bundle list, paths
  `["hmrc/vat/vatPayments.html", "^/api/v1/hmrc/vat.*"]`.
- Tests: `hmrcVatPaymentsGet.test.js`, `payments.test.js` (simulator scenarios),
  `getVatPayments.behaviour.test.js`, `initVatPayments`/`fillInVatPayments`/
  `submitVatPaymentsForm`/`verifyVatPaymentsResults` step functions.
- Workflow wiring: same six-script/project/dropdown/two-jobs pattern as liabilities, renamed.
- Docs: remove "View VAT Payments" from the approval doc's "Not Implemented" list (should now
  be empty — consider deleting the "Not Implemented" sub-heading entirely rather than leaving
  an empty list); add a `### VAT Payments GET` example section; add a guide.html step section.

---

## 5. Deltas for Penalties (B32.3) — do this last, most divergent from the pattern

- Lambda: `app/functions/hmrc/hmrcVatPenaltiesGet.js`, `getVatPenalties(...)`,
  `HMRC_VAT_PENALTIES_GET_ASYNC_REQUESTS_TABLE_NAME`, HMRC path
  `/organisations/vat/${vrn}/penalties`, app route `/api/v1/hmrc/vat/penalty`, activity event
  `vat-penalties-queried`.
- **`extractAndValidateParameters` drops `from`/`to`/`status` entirely** — only `vrn`,
  `Gov-Test-Scenario`, `hmrcAccount`, `runFraudPreventionHeaderValidation`. No date validation
  code at all for this handler (don't import `isValidIsoDate`/`isValidDateRange` — only
  `isValidVrn`). `hmrcQueryParams = {}` on the `hmrcHttpGet` call (no query string at all).
- Return field: HMRC's response has no single wrapper array — it's the whole object
  (`totalisations`/`lateSubmissionPenalty`/`latePaymentPenalty`) at the top level. Return
  `{ hmrcResponse, penalties: hmrcResponse.data, hmrcRequestUrl }` — call the field `penalties`
  in this app's own response envelope for consistency with `obligations`/`liabilities`/
  `payments` even though HMRC's own JSON has no `penalties` key; the page destructures
  `result.penalties` the same way the others destructure `result.obligations`/etc.
- Simulator: `app/http-simulator/routes/vat-penalties.js` — `GET
  /organisations/vat/:vrn/penalties`, **no from/to query params to validate**.
  `app/http-simulator/scenarios/penalties.js` — scenario names from §1 (`DEFAULT`,
  `NO_PENALTIES`, `LATE_SUBMISSION`, `LATE_PAYMENT`, `MULTIPLE_PENALTIES`,
  `MULTIPLE_LATE_PAYMENT_PENALTIES`, `MULTIPLE_LATE_SUBMISSION_PENALTIES`,
  `MULTIPLE_INACTIVE_LATE_SUBMISSION_PENALTIES`, `THRESHOLD_LATE_SUBMISSION_PENALTIES`,
  `CHARGE_LATE_SUBMISSION_PENALTIES`) plus error scenarios `VRN_INVALID`/`NOT_FOUND`/
  `INSOLVENT_TRADER` (no date-error codes — there are no dates). Default (no scenario header):
  return the `NO_PENALTIES` shape (`{ totalisations: {all zeros}, lateSubmissionPenalty:
  {summary: {activePenaltyPoints:0, inactivePenaltyPoints:0,
  periodOfComplianceAchievement:"9999-12-31", regimeThreshold:6, penaltyChargeAmount:0},
  details: []}, latePaymentPenalty: {details: []} }`) — HMRC's own `DEFAULT` scenario has
  data, but an app-level "no scenario supplied" default returning an empty/zeroed shape is the
  safer choice for a page a developer might hit accidentally without picking a scenario, and
  matches the spirit of liabilities/payments' "no data by default" choice above. State this
  explicitly as a choice in the PR description since it diverges from HMRC's own `DEFAULT`
  label, to avoid a reviewer assuming a bug.
- Env: `TEST_VAT_PENALTIES` (plural, per NEXT.md B32.3). Example — keep it minimal, one late
  submission point:
  ```json
  {"source":"stub","penalties":{"totalisations":{"lateSubmissionPenaltyTotalValue":0,"penalisedPrincipalTotal":0,"latePaymentPenaltyPostedTotal":0,"latePaymentPenaltyEstimateTotal":0},"lateSubmissionPenalty":{"summary":{"activePenaltyPoints":1,"inactivePenaltyPoints":0,"periodOfComplianceAchievement":"2025-04-01","regimeThreshold":4,"penaltyChargeAmount":0},"details":[{"penaltyNumber":"12345678901234","penaltyOrder":"01","penaltyCategory":"point","penaltyStatus":"active","penaltyCreationDate":"2024-07-01","penaltyExpiryDate":"2026-07-01"}]},"latePaymentPenalty":{"details":[]}}}
  ```
- CDK: same three-file pattern as before; `publishedApiLambdas` `ApiParameter` list for this
  one is just `vrn`, `Gov-Test-Scenario`, `runFraudPreventionHeaderValidation` — **no `from`/
  `to`/`status`**. Bumps `Custom::AWS` by another 3; another row in
  `DataStackTest.excludedTablesGetNoStreamUpdate()`.
- Page: `web/public/hmrc/vat/vatPenalties.html`. Form has **no from/to fields at all** — just
  VRN and the developer test-scenario section. Results are two sub-tables plus a summary, not
  one flat table (the response has no natural single-row-per-item shape):
  - A summary block above the tables: active/inactive penalty points, the compliance date, the
    regime threshold, and the four `totalisations` monetary figures — rendered as a small
    definition list or a 2-column key/value table, not a `<table>` with per-row Actions.
  - **Late Submission Penalties** table (from `lateSubmissionPenalty.details`): columns
    Category (point/charge/threshold), Status (Active/Inactive), Created, Expires, Charge
    Amount (blank when absent). Empty state when `details` is empty:
    `"No late submission penalties in the last 24 months."`
  - **Late Payment Penalties** table (from `latePaymentPenalty.details`): columns Charge
    Reference, Category (LPP1/LPP2), Status (Accruing/Posted), Period (from
    `principalChargeBillingFrom`–`principalChargeBillingTo`), Penalty Amount (posted, or
    accruing if not yet posted), Due Date. Empty state:
    `"No late payment penalties in the last 24 months."`
  - Overall empty state (no penalties in either category, i.e. `NO_PENALTIES`-shaped response):
    a single `"No penalties found for the last 24 months."` message in place of both tables
    (check this first, before rendering two separately-empty tables — two "no data" messages
    stacked reads worse than one).
  - No Actions column anywhere — same reasoning as liabilities/payments, this is read-only
    information.
- Catalogue id `vat-penalties`, name `"VAT Penalties (HMRC)"`, same bundle list, paths
  `["hmrc/vat/vatPenalties.html", "^/api/v1/hmrc/vat.*"]`.
- Tests: `hmrcVatPenaltiesGet.test.js` (same async/HEAD/bundle/500 test shapes as the other two,
  minus any date-validation test since there's nothing to validate), `penalties.test.js`
  (simulator scenarios — no period-key tests), `getVatPenalties.behaviour.test.js`,
  `initVatPenalties`/`fillInVatPenalties` (no from/to fill, just VRN + optional scenario)/
  `submitVatPenaltiesForm`/`verifyVatPenaltiesResults` (assert the summary block and both
  sub-tables, or the single overall-empty message).
- Workflow wiring: same six-script/project/dropdown/two-jobs pattern, renamed.
- Docs: `HMRC_MTD_API_APPROVAL_SUBMISSION.md` — add the penalties row to the endpoints table
  (there was never a "Not Implemented — View VAT Penalties" line to remove, since MVP scope
  never listed it; just add the "Implemented" row and a `### VAT Penalties GET` example
  section using the stub JSON above). `guide.html` — a third step section. This item is also
  the one B32.3 names as the point to update both `guide.html`/`help.html` "listing all
  three" — by the time this lands, liabilities and payments guide sections should already
  exist from B32.1/B32.2, so this step is really "add the third section and, if the guide has
  an intro paragraph listing what it covers, add penalties to that sentence too."

---

## 6. Traps found in the obligations pattern — don't propagate them unexamined

1. **The http-simulator invents its own error codes that don't match the real HMRC codes.**
   `app/http-simulator/routes/vat-obligations.js` returns `INVALID_DATE_FROM`/
   `INVALID_DATE_TO` for bad dates; the real VAT (MTD) API (confirmed in the spec file used for
   this design) uses `DATE_FROM_INVALID`/`DATE_TO_INVALID`/`DATE_RANGE_INVALID`. This is
   almost certainly a pre-existing mismatch specific to obligations' simulator, not a
   deliberate choice — the `errorScenarios` table in `obligations.js` even has a
   `DATE_RANGE_TOO_LARGE` entry that's dead code (nothing in the route ever checks range size
   or emits that scenario key). Liabilities/payments/penalties are new code with no legacy
   behaviour to preserve, so §3/§4/§5 above specify the **real** HMRC codes throughout. Don't
   copy obligations' route-level codes for the new endpoints, and don't feel obliged to fix
   obligations' — that's a separate, pre-existing inconsistency outside this track's scope.

2. **The catalogue's `^/api/v1/hmrc/vat.*` path regex is a blanket match, not per-endpoint.**
   Both `vat-obligations` and `view-vat-return` activities already list the identical regex
   `^/api/v1/hmrc/vat.*` as one of their two `paths` entries. `findRequiredBundleIdsForUrlPath`
   in `app/services/bundleManagement.js` **unions** bundle requirements from every activity
   whose `paths` match — it does not stop at the first match. So a request to
   `/api/v1/hmrc/vat/obligation` today is already gated by the union of `vat-obligations`'s
   AND `view-vat-return`'s bundle lists (currently identical, so it's invisible). Adding
   `vat-liabilities`/`vat-payments`/`vat-penalties` activities each carrying the same blanket
   regex means **every** VAT-read API call from now on unions bundle requirements across five
   activities, not one. This is harmless as long as all five keep the same bundle list (as
   specified above) — but it means the per-activity `paths` entry for the API route is
   largely decorative for bundle-gating purposes; the `.html` page path is what actually does
   distinct work (gating the page itself and driving `hmrc-scope-check.js`'s OAuth-scope
   lookup, which matches on the **page** path, not the API path). If a future requirement
   needs e.g. penalties gated behind a higher-tier bundle than obligations, the blanket regex
   must be narrowed to each endpoint's own literal path first (e.g.
   `^/api/v1/hmrc/vat/penalty.*`) or the union will silently grant access via the other
   activities' broader match. Not a blocker for this track since all bundle lists here are
   identical, but worth a one-line PR note so it isn't mistaken for working per-endpoint
   gating.

3. **`vatObligations.html` doesn't use `hmrc-service.js`.** The coordinator's brief mentioned
   "web/public/lib/services/hmrc-service.js functions" as part of the pattern to trace — in
   fact this module has no obligations-fetching function at all; the page builds its fetch
   inline. Don't add `getVatLiabilities`/`getVatPayments`/`getVatPenalties` exports to
   `hmrc-service.js` expecting the page to import them — follow the page's own established
   inline-fetch structure instead (§3 above does this).

4. **No dedicated "back" link exists on the obligations page.** The coordinator's brief asked
   to trace OAuth scope/table/empty-state/"back link" — there is no back link, only the
   header's home icon and footer links. The new pages should match that (no invented back
   link), not add one that isn't part of the pattern.

5. **`TEST_VAT_OBLIGATIONS`-style env vars are system-test-only, and the pattern's naming
   isn't internally consistent already.** `TEST_VAT_OBLIGATIONS` is plural (matches the
   `obligations` field) but `TEST_VAT_RETURN` (the sibling env var for the return-GET
   endpoint) is singular. The names this design uses (`TEST_VAT_LIABILITY` singular,
   `TEST_VAT_PAYMENTS`/`TEST_VAT_PENALTIES` plural) come directly from NEXT.md's B32.1/B32.2/
   B32.3 wording, preserving that same inconsistency rather than "fixing" it — changing them
   would diverge from the task's own naming without being asked to.

---

## 7. CDK `Custom::AWS` resource-count math

`ensureTable(...)` creates 2 `Custom::AWS` resources per call (`<id>-EnsureTable` +
`<id>-EnsurePITR`, see `KindCdk.java` lines 328-421). `ensureTimeToLive(...)` creates 1 more
(`<id>-EnsureTTL`, `KindCdk.java` lines 518-547). Each of the three new async-request tables
gets exactly one `ensureTable` + one `ensureTimeToLive` call in `DataStack.java`, so each new
table adds **3** `Custom::AWS` resources. Three new tables (liabilities, payments, penalties) =
**+9** total.

`SubmitEnvironmentCdkResourceTest.java` line 92 currently asserts
`resourceCountIs("Custom::AWS", 42)` (baseline measured against `DataStack.java` as read for
this design: 13 `ensureTable` calls × 2, 9 `ensureTimeToLive` calls × 1, plus GSI/stream custom
resources elsewhere in the file — the exact current total should be re-confirmed by running the
test rather than trusted from this document, both because other concurrent tracks may touch
`DataStack.java` before this lands, and because the arithmetic above accounts only for the
table/TTL resources this feature adds, not the pre-existing baseline). **Do not hardcode 51.**
After adding all three tables, run:
```
./mvnw -pl infra test -Dtest=SubmitEnvironmentCdkResourceTest#dataStackHasExpectedCustomResourceCount
```
(or the equivalent single-test invocation for whichever method name wraps that assertion — grep
the file at implementation time), read the actual failure diff CDK's assertion library prints
(`resourceCountIs` failures list the actual count), and set the assertion to that number. If it
isn't `<current baseline> + 9`, stop and work out why before changing the number — that would
mean either a table's `ensureTable`/`ensureTimeToLive` call was missed, or something unrelated
changed the baseline.

---

## 8. Files the coder will create or touch — full list

**Create** (× 3, one set per endpoint — liabilities/payments/penalties):
- `app/functions/hmrc/hmrcVat{Liabilities,Payments,Penalties}Get.js`
- `app/http-simulator/routes/vat-{liabilities,payments,penalties}.js`
- `app/http-simulator/scenarios/{liabilities,payments,penalties}.js`
- `web/public/hmrc/vat/vat{Liabilities,Payments,Penalties}.html`
- `app/unit-tests/functions/hmrcVat{Liabilities,Payments,Penalties}Get.test.js`
- `app/unit-tests/http-simulator/scenarios/{liabilities,payments,penalties}.test.js`
- `behaviour-tests/getVat{Liabilities,Payments,Penalties}.behaviour.test.js`

**Edit** (once each, accumulating all three endpoints' changes; some may already be mid-edit by
sibling tracks — re-read before editing):
- `app/bin/server.js`
- `app/bin/dynamodb.js`
- `app/http-simulator/server.js`
- `behaviour-tests/steps/behaviour-hmrc-vat-steps.js` (12 new step functions total)
- `.env.ci`, `.env.proxy`, `.env.test`, `.env.simulator`, `.env.prod` (2 lines × 3 endpoints
  each)
- `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`
- `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java`
- `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java`
- `infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java`
- `infra/test/java/co/uk/diyaccounting/submit/stacks/DataStackTest.java`
- `web/public/submit.catalogue.toml`
- `package.json`
- `playwright.config.js`
- `.github/workflows/synthetic-test.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/test.yml`
- `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md`
- `web/public/guide.html`

**Generated, don't hand-edit**: `web/public/docs/api/openapi.json` (regenerates from
`SubmitSharedNames.java` on `./mvnw clean verify`); `web/public-simulator/**` (built from
`web/public/**`).

**Do not touch**: `app/lib/obligationFormatter.js`,
`web/public/prefetch/prefetch-hmrc-vat-obligation-head.js`,
`web/public/lib/services/hmrc-service.js` (no new exports needed there).
