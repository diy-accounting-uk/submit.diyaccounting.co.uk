# PLAN: Targeted Library Opportunities

Survey of the `submit.diyaccounting.co.uk` codebase for places where a small, focused library
could offload complexity or reduce repeated code. Not a framework recommendation. Each item
stands on its own and can be adopted or ignored independently.

---

## 1. HTTP Response Helper Boilerplate (internal refactor, no library) — done

**What**: `app/lib/httpResponseHelper.js` contains 7 nearly identical exported functions
(`http200OkResponse`, `http400BadRequestResponse`, `http401UnauthorizedResponse`, etc.). Each
one repeats the same 4-line block that merges correlation headers from `context`:

```js
const merged = { ...(headers || {}) };
if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
```

This same block appears 7 times in that file. The private `httpResponse()` function at the
bottom already re-does this check. So each response is merging these headers twice.

**Recommendation**: Pure refactor. Extract the header-merge into a single helper called from
each exported function, or better yet, remove the per-function merge entirely since
`httpResponse()` already handles it. No library needed.

**Estimated savings**: ~28 lines of duplicated code eliminated; reduced chance of drift between
the seven functions.

**Risk**: None. All seven functions are covered by existing tests.

---

## 2. SQS Worker Handler Boilerplate (internal refactor, no library) — partly done

`isRetryableError()` is extracted to `app/lib/sqsWorkerHelper.js` and imported by the three
hmrc handlers, removing the identical copy in each. The remaining part of this item — a shared
`processSqsRecords()` wrapping steps 1-5 and 7 — is not done: `bundlePost.js`/`bundleDelete.js`
always rethrow on error while the hmrc handlers classify retryable vs terminal, so a shared
wrapper needs a real per-caller policy, and `hmrcVatReturnPost.js` (the live VAT submission
path) has no direct `workerHandler` unit test to catch a wrong merge. That part needs its own
pass with handler-specific tests in place first.

**What**: Five Lambda files implement the same `workerHandler(event)` pattern with near-identical
boilerplate:

- `app/functions/account/bundlePost.js` (workerHandler, lines 263-313)
- `app/functions/account/bundleDelete.js` (workerHandler, lines 199-249)
- `app/functions/hmrc/hmrcVatObligationGet.js` (workerHandler, lines 330-450)
- `app/functions/hmrc/hmrcVatReturnGet.js` (workerHandler, lines 393-509)
- `app/functions/hmrc/hmrcVatReturnPost.js` (workerHandler, lines 579-725)

Every worker does:
1. `await initializeSalt()`
2. `validateEnv([...])`
3. For each record: parse `record.body`, extract `userId`/`requestId`/`traceparent`/`correlationId`
4. Guard: if `!userId || !requestId` continue with error log
5. Initialize AsyncLocalStorage context
6. Call the actual processor
7. Handle retryable vs terminal errors with the same `isRetryableError()` function (copy-pasted identically in 3 files)

The `isRetryableError()` function is defined identically in 3 separate files.

**Recommendation**: Extract a shared `processSqsRecords(event, processor, options)` function
into `app/lib/sqsWorkerHelper.js`. The function would handle steps 1-5 and 7, calling the
supplied processor for step 6. Extract `isRetryableError()` to a shared location.

**Estimated savings**: ~60-80 lines per worker handler (300-400 lines total across 5 files).

**Risk**: Low. The pattern is extremely consistent across all five files.

---

## 3. `serializeResponseHeaders()` Duplication (internal refactor, no library) — done

**What**: The function `serializeResponseHeaders(headers)` that normalizes `Headers` objects into
plain objects with lowercase keys is defined identically in two files:

- `app/functions/hmrc/hmrcVatObligationGet.js` (lines 49-61)
- `app/functions/hmrc/hmrcVatReturnGet.js` (lines 51-63)

A slightly different inline version also appears in `hmrcVatReturnPost.js` (lines 488-496 and
640-656).

**Recommendation**: Move to `app/lib/httpResponseHelper.js` or a shared utility module.

**Estimated savings**: ~30 lines.

**Risk**: None.

---

## 4. ISO Duration Parsing Duplication (internal refactor, no library) — done

**What**: Two files contain nearly identical ISO 8601 duration parsers:

- `app/functions/account/bundleGet.js`: `addDurationSimple()` (lines 220-229)
- `app/functions/account/bundlePost.js`: `parseIsoDurationToDate()` (lines 56-72)

Both parse `PnYnMnD` patterns. The `bundlePost.js` version has more error handling; the
`bundleGet.js` version is a silent subset.

**Recommendation**: Extract to `app/lib/dateUtils.js` (which already exists and handles TTL
calculations). This keeps date logic centralized.

Alternative: The npm package `tinyduration` (~2KB, zero deps) parses full ISO 8601 durations
including time components (`PT1H30M`). But the current code only needs `PnYnMnD`, so a shared
function is simpler.

**Estimated savings**: ~20 lines, plus a single source of truth.

**Risk**: None.

---

## 5. DynamoDB Repository Boilerplate (internal refactor, no library) — done

**What**: All 7 repository files in `app/data/` follow an identical pattern:

```js
import { getDynamoDbDocClient } from "../lib/dynamoDbClient.js";

function getTableName() {
  const tableName = process.env.SOME_TABLE_NAME;
  return tableName || "";
}

export async function doSomething(...) {
  const { docClient, module } = await getDynamoDbDocClient();
  const tableName = getTableName();
  await docClient.send(new module.PutCommand({ TableName: tableName, Item: ... }));
}
```

The `getTableName()` pattern appears in 6 files. The `getDynamoDbDocClient()` destructure
appears 26 times across 9 files. The `executeDynamoDbCommand()` helper already exists in
`dynamoDbClient.js` (lines 69-73) but is not used by any repository file.

**Recommendation**: Migrate repositories to use the existing `executeDynamoDbCommand()` helper.
It already abstracts the `getDynamoDbDocClient` + `send` pattern. Each call site would go from:

```js
const { docClient, module } = await getDynamoDbDocClient();
await docClient.send(new module.PutCommand({ TableName: tableName, Item: item }));
```

to:

```js
await executeDynamoDbCommand((mod) => new mod.PutCommand({ TableName: tableName, Item: item }));
```

Saving one line per call (26 call sites = 26 lines) and removing the need to destructure in
every function.

**Estimated savings**: ~52 lines (26 sites x 2 lines each), plus cleaner imports.

**Risk**: Low. `executeDynamoDbCommand` is already defined and tested.

---

## 6. Express `apiEndpoint` Registration Pattern (internal refactor, no library)

**What**: Every Lambda handler file exports an `apiEndpoint(app)` function that registers routes
with this pattern:

```js
export function apiEndpoint(app) {
  app.post("/api/v1/foo", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
}
```

This 3-line body is identical in 35+ route registrations across 20 handler files. The
imports of `buildLambdaEventFromHttpRequest` and `buildHttpResponseFromLambdaResult` also
repeat in every file.

`app/bin/server.js` then imports 19 separate `apiEndpoint` functions and calls each one.

**Recommendation**: Create a `registerLambdaRoute(app, method, path, handler)` helper in
`httpServerToLambdaAdaptor.js`:

```js
export function registerLambdaRoute(app, method, path, handler) {
  app[method](path, async (httpReq, httpRes) => {
    const event = buildLambdaEventFromHttpRequest(httpReq);
    const result = await handler(event);
    return buildHttpResponseFromLambdaResult(result, httpRes);
  });
}
```

Each handler file would export a route definition instead of calling Express directly. This
would remove the need for every handler to import the adaptor module and wrap the same 3 lines.

**Estimated savings**: ~70 lines across handler files, plus simplified server.js registration.

**Risk**: Low. Purely mechanical transformation.

---

## 7. HTML Header/Navigation Duplication (client-side widget approach)

**What**: 32 HTML files in `web/public/` contain an identical header block (~25 lines each)
and footer block (~16 lines each). When the nav changes, all files must be updated.

The only per-page variations are:
- Which nav link gets `class="active"` (based on current page)
- The `<h1>` title (most pages use "DIY Accounting Submit", a few differ)
- The `<p class="subtitle">` text

**Constraint**: The site must work by cloning the repo, opening `index.html` in an IDE, and
seeing working navigation in a browser — no build step required.

**Approach: Client-side widget (follows existing pattern)**

The codebase already uses IIFE widgets (`widgets/auth-status.js`, `widgets/entitlement-status.js`)
that query the DOM and populate/update elements on page load. The header's auth section is
*already* JS-dependent — `auth-status.js` overwrites the login status and token balance.

Create `widgets/page-chrome.js` as an IIFE widget that:
1. Reads `data-title` and `data-subtitle` attributes from `<header>`
2. Injects the full header HTML (home/info icons, auth section, h1, subtitle, main nav)
3. Injects the full footer HTML (links, copyright, localStorage container)
4. Sets `class="active"` on the nav link matching `window.location.pathname`
5. Self-initializes on DOMContentLoaded (same as existing widgets)

**Each HTML file would go from:**

```html
<header>
  <div class="header-nav">
    <div class="header-left">
      <a href="index.html" title="Home" class="home-link">
        <svg class="home-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      </a>
      <a href="about.html" title="About & Help" class="info-link">
        <svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 ..." />
        </svg>
      </a>
    </div>
    <div class="auth-section">
      <span class="entitlement-status">Activity: unrestricted</span>
      <span class="login-status">Not logged in</span>
      <a href="auth/login.html" class="login-link">Log in</a>
    </div>
  </div>
  <h1>DIY Accounting Submit</h1>
  <p class="subtitle">Submit UK VAT returns to HMRC under MTD</p>
  <nav class="main-nav" aria-label="Main navigation">
    <a href="index.html" class="active">Activities</a>
    <a href="hmrc/receipt/receipts.html">Receipts</a>
    <a href="bundles.html">Bundles</a>
    <a href="spreadsheets.html">Spreadsheets</a>
  </nav>
</header>
<!-- ...25 lines of footer... -->
```

**To:**

```html
<header data-title="DIY Accounting Submit"
        data-subtitle="Submit UK VAT returns to HMRC under MTD"></header>
<footer></footer>
<script src="widgets/page-chrome.js"></script>
```

**What happens without JS (file:// with JS disabled):** Empty header/footer — but this is
already the case for auth status, token balance, and entitlement display which are JS-populated.
A `<noscript>` tag inside `<header>` could provide a minimal fallback link to the home page.

**What happens with JS on file:// protocol:** Works. The HTML is embedded in the JS file (not
fetched via `fetch()`), so there are no CORS issues on `file://`. This is the same approach
used by `auth-status.js` which embeds its HTML strings inline.

**Estimated savings**: ~800 lines of HTML across 32 files, single source of truth for nav.

**Tradeoff**: Brief flash before JS populates header/footer. Mitigated by loading
`page-chrome.js` as the first `<script>` (synchronous, not `defer` or `async`). The header
renders before the browser even starts on `<main>`. The existing `auth-status.js` already
causes this kind of JS-first-render for the auth section with no visible flash.

**Risk**: Low. Follows the exact same IIFE widget pattern already proven across 6 widgets.
Pa11y and Playwright tests run with JS enabled so they will see the populated header.

**Not recommended**: Build-time includes (`posthtml-include`, SSI scripts) — these break the
"clone and click" workflow that makes this repo pleasant to work with.

---

## 8. JWT Decode Without Verification (already fine)

**What**: `app/lib/jwtHelper.js` hand-rolls JWT base64url decoding in `decodeJwtNoVerify()`.
The function `getUserSub()` duplicates the same decode logic inline (lines 49-62).

The project already depends on `aws-jwt-verify` (for the custom authorizer in production),
which does full JWT verification. The `decodeJwtNoVerify` function is deliberately used for
cases where verification is not needed (extracting claims from already-verified tokens
downstream).

**Recommendation**: No library needed. The inline duplication in `getUserSub()` should be
refactored to call `decodeJwtNoVerify()` instead of re-implementing the decode. That is a
2-line fix, not a library adoption.

**Estimated savings**: ~15 lines from deduplication within the file.

**Risk**: None.

---

## 9. Logging: Already Using Pino (no change recommended)

**What**: The codebase already uses `pino` for structured logging with PII redaction
(`app/lib/logger.js`). The implementation is well-structured with two redaction layers,
AsyncLocalStorage context propagation, and configurable output destinations.

**Assessment**: This is one area where a library is already being used well. No additional
library would improve this. The `createLogger({ source })` pattern is clean and consistently
applied across all files.

**Recommendation**: No change.

---

## 10. Environment Validation: Already Using Zod (partial adoption)

**What**: The project has two parallel env validation systems:

1. `app/lib/env.js` - `validateEnv(requiredVars)` - Simple string-array check, used by all
   Lambda handlers (22+ call sites)
2. `app/lib/envSchema.js` - Zod-based schema validation with types - Defined but appears unused
   in production code

The Zod schemas (`commonEnvSchema`, `hmrcOAuthSchema`, `cognitoSchema`) are defined but never
called by any Lambda handler.

**Recommendation**: Either adopt the Zod schemas and delete the simple `validateEnv`, or delete
`envSchema.js` if it was speculative. The dual system adds confusion. Given that `zod` is
already a production dependency (used for other validation), the Zod approach is reasonable.
However, `validateEnv(["FOO", "BAR"])` is genuinely simpler for the common case of "these env
vars must exist". The Zod schemas add type coercion and defaults that may not be needed.

**Honest assessment**: The simple `validateEnv` is probably the right choice for this codebase.
Consider removing `envSchema.js` unless there is a concrete plan to use typed env schemas.

---

## 11. `getTableName()` Pattern in Every Repository (internal refactor)

**What**: Six repository files define an identical pattern:

```js
function getTableName() {
  const tableName = process.env.SOME_TABLE_NAME;
  return tableName || "";
}
```

This is called in every function in the repository, sometimes multiple times.

**Recommendation**: Pass the table name to a repository factory, or resolve it once at module
load. This is a code smell (repeating env lookups) but not a library opportunity. A simple
refactor to set `const TABLE_NAME = process.env.SOME_TABLE_NAME` at module scope would suffice.

**Estimated savings**: ~6 functions eliminated, cleaner call sites.

**Risk**: Low. The env var is always set before these functions run.

---

## 12. `publishActivityEvent(...).catch(() => {})` Pattern

**What**: 14 Lambda handler files call `publishActivityEvent({...}).catch(() => {})` as a
fire-and-forget operation. The `.catch(() => {})` is repeated every time.

**Recommendation**: Add a `fireAndForget` wrapper or make `publishActivityEvent` itself swallow
errors by default (with an option to throw). This is internal refactoring, not a library
opportunity.

```js
export function publishActivityEventBestEffort(payload) {
  return publishActivityEvent(payload).catch(() => {});
}
```

**Estimated savings**: ~14 lines of `.catch(() => {})` calls, plus protection against forgetting
the catch on new call sites.

**Risk**: None.

---

## 13. Fetch with Timeout Pattern (consider: no library)

**What**: Multiple files implement fetch-with-timeout using AbortController:

```js
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 25000);
try {
  response = await fetch(url, { ...options, signal: controller.signal });
} finally {
  clearTimeout(timeoutId);
}
```

This appears in:
- `app/lib/httpResponseHelper.js` (performTokenExchange, lines 335-343)
- `app/lib/buildFraudHeaders.js` (detectVendorPublicIp, lines 41-43)
- Various test helpers

**Recommendation**: Extract a `fetchWithTimeout(url, options, timeoutMs)` utility into
`app/lib/httpFetch.js` (which already exists but may not have this wrapper).

The npm package `ky` (~3.5KB) provides this out of the box with retry logic, but it adds
abstraction that this codebase deliberately avoids. A 10-line utility function is more
appropriate here.

**Estimated savings**: ~15 lines, plus consistency.

**Risk**: None.

---

## 14. `vi.mock("@aws-sdk/...")` DynamoDB Mock Pattern in Tests

**What**: Every test file that touches DynamoDB repeats:

```js
vi.mock("@aws-sdk/lib-dynamodb", () => mockLibDynamoDb);
vi.mock("@aws-sdk/client-dynamodb", () => mockClientDynamoDb);
```

The mock definitions in `app/test-helpers/dynamoDbMock.js` are well-structured, but the
`vi.mock()` calls must be at the top level of each test file (Vitest requirement for
hoisting). This cannot be extracted into a helper function.

**Recommendation**: No change. This is a Vitest constraint, not something a library can fix.
The existing `dynamoDbMock.js` shared module already provides the best possible abstraction.

---

## 15. Lambda Handler Structure: `initializeSalt` + `validateEnv` + `extractRequest`

**What**: Nearly every Lambda handler starts with:

```js
await initializeSalt();
validateEnv([...]);
const { request, requestId, traceparent, correlationId } = extractRequest(event);
```

This 3-line preamble appears in 15+ handler files. For handlers with async processing, it
continues with `getAsyncRequest`, `initiateProcessing`, `wait`, `check`, and `respond` calls
from `asyncApiServices` - another ~30 lines of identical scaffolding.

**Recommendation**: This is the biggest internal refactoring opportunity. A
`createHandlerPipeline({ requiredEnvVars, processor })` function could encapsulate:
- Salt initialization
- Env validation
- Request extraction
- HEAD request short-circuit
- Async processing flow (initiate/wait/check/respond)
- Error handling (RequestFailedError catch)

However, this approaches "framework territory" which the project philosophy explicitly avoids.
Each handler has enough variation in its error-mapping, validation, and response construction
that a generic pipeline would need many escape hatches.

**Honest assessment**: The repetition is real (~30-40 lines per handler x 15 handlers = ~500
lines), but the handlers are readable precisely because they are explicit. A pipeline
abstraction would reduce lines but increase cognitive load for understanding what actually
happens in each handler. **Leave this as-is.**

---

## Summary: Recommendations Ranked by Value

### High value, zero dependency (internal refactoring):

| # | What | Lines saved | Files touched |
|---|------|-------------|---------------|
| 2 | SQS Worker boilerplate extraction | ~350 | 5 handlers + 1 new |
| 1 | HTTP Response header merge dedup | ~28 | 1 file |
| 6 | `registerLambdaRoute` helper | ~70 | 20 handlers + adaptor |
| 5 | Use existing `executeDynamoDbCommand` | ~52 | 9 files |
| 3 | `serializeResponseHeaders` dedup | ~30 | 3 files |
| 4 | ISO duration parser dedup | ~20 | 2 files + dateUtils |
| 8 | `getUserSub` JWT decode dedup | ~15 | 1 file |
| 12 | `publishActivityEvent` best-effort | ~14 | 14 files + activityAlert |
| 13 | `fetchWithTimeout` utility | ~15 | 2-3 files |
| 11 | `getTableName()` simplification | ~18 | 6 files |

### Worth considering, minor build change:

| # | What | Lines saved | Dependency |
|---|------|-------------|------------|
| 7 | HTML partial includes | ~800 | Build script or `posthtml-include` |

### No action recommended:

| # | What | Reason |
|---|------|--------|
| 9 | Logging | Pino already well-used |
| 10 | Env validation | Simple approach is better here; consider deleting unused envSchema.js |
| 14 | Test DynamoDB mocks | Vitest constraint; existing pattern is optimal |
| 15 | Handler pipeline | Too close to a framework; explicitness is valuable |

---

## Note on Library Philosophy

This survey found that the codebase mostly does not need external libraries. The repetition
is overwhelmingly addressable by extracting shared functions within the existing codebase. The
project already uses the right targeted libraries where they matter:
- `pino` for structured logging
- `zod` for schema validation
- `aws-jwt-verify` for Cognito token verification
- `uuid` for ID generation
- `dotenv` for env file loading

The biggest wins are all internal refactoring, not library adoption. That is a sign of a
healthy, low-dependency codebase.
