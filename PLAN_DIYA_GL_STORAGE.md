# PLAN: the diya-gl book storage API

The spreadsheets site's books pages hold a year of accounts in a 15 KB zip and recalculate it in the
browser. The paid tier stores that zip for a signed-in user. This is the Submit side: one S3 bucket
per environment, four routes on the existing HTTP API, a metadata sidecar per book, and an
entitlement hook the billing row fills in later. The launch plan is
`spreadsheets.diyaccounting.co.uk/PLAN_DIYA_GL_LAUNCH.md`, row LP-16; build this after LP-15 lands
the books app client on the shared pool.

## 1. Assertions and decisions this rests on

From the operator's launch assertions (`PLAN_DIYA_GL_LAUNCH.md`, "User assertions"):

> the commerciual offering is a 99p/month spreadsheets subscription which is storage of their
> diya-gl zip, a profile and a cognito user (social federated auth via google) using the same
> cognito client as the submit account but through the additional spreadsheets

Decided already (operator, 2026-09-04, and section 5c): one Cognito user pool, Submit's, on the Plus
tier with Google federation; Submit's hosted sign-in page redirecting back to the spreadsheets site,
nothing moves; computation stays in the browser, so Lambda does storage, listing and metadata only
and no LibreOffice runs anywhere; 99p a month, recorded by Submit's billing webhook against the
Cognito subject; zip-in-S3 in the submit account with a metadata sidecar for optimistic concurrency
(`_developers/PLAN_DIYA_CLOUD.md` §2.3, §2.4, §4); last-writer-wins with a version stamp, one writer
per book, a conflict shown rather than merged.

Decided here, so the builder decides nothing:

| # | Decision | Why |
|---|---|---|
| D7 | The bucket lives in the env-level `DataStack`; the Lambdas in a new app-level `BooksStack`. | Books outlive a deployment, as receipts and bundles do. Handlers are rebuilt per deployment. |
| D8 | The user prefix is the hashed sub, not the raw Cognito sub. | Every other user-scoped store in this repo keys on `hashSub()`. Keeps the raw sub out of S3 keys and access logs. |
| D9 | Bodies are JSON with the zip base64-encoded, not raw binary. | No binary media types to configure; matches every other route in the repo. A 15 KB zip is 20 KB of base64. |
| D10 | The books routes get their own JWT authoriser, scoped to the books client id. | A books token must not reach the VAT or Companies House routes. |
| D11 | Preflight is an unauthenticated `OPTIONS` route per books path, answered by the same handler. | Leaves the other routes' behaviour untouched, unlike API-wide CORS. |
| D12 | An unentitled put returns 403 with `code: "subscription-required"`. | `http403ForbiddenResponse` already exists and intermediaries treat 403 predictably. 402 was the alternative. |
| D13 | Reads and deletes stay open to any signed-in user; only the put is gated. | A lapsed subscriber must still be able to get their books out. |
| D14 | There is no free storage quota. Storage is the paid tier. | Section 5a's free face is the offline runner and the packages. |

## 2. Storage layout

### 2.1 The bucket
One per environment, in that environment's submit account (submit-ci 367191799875, submit-prod
972912397388), created in `DataStack`.

| Property | Value |
|---|---|
| Name | `sharedNames.booksBucketName` = `"%s-books-%s".formatted(envResourceNamePrefix, awsAccount)`, e.g. `ci-env-books-367191799875` |
| Security | `BucketEncryption.S3_MANAGED`, `BlockPublicAccess.BLOCK_ALL`, `enforceSsl(true)` |
| Versioning | on: AWS Backup for S3 needs it, and it covers a bad metadata write |
| Removal policy | `DESTROY` with `autoDeleteObjects(true)`, per the workspace teardown rule |
| Lifecycle | abort incomplete uploads after 1 day; expire noncurrent versions after 30 days; current objects never expire |
| Backup | `BackupStack` adds `BackupResource.fromArn(bucketArn)` to the critical-resources selection, so the daily and monthly rules cover it and copy to the backup account |

### 2.2 Keys
```
users/{hashedSub}/books/{bookId}/metadata.json
users/{hashedSub}/books/{bookId}/v{n}.zip
```

`hashedSub` is `hashSub(claims.sub)` from `app/services/subHasher.js`, after `initializeSalt()`.
`bookId` is a UUID v4 the page generates on first save; the API rejects anything not matching
`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, which also closes path
traversal. `n` is the version number. Reads fall back through previous salt versions the way
`getUserBundles` does: the current prefix first, then `hashSubWithVersion(sub, v)` per
`getPreviousVersions()` entry. Writes always use the current version; a salt rotation is a prefix
copy in a runbook.

### 2.3 metadata.json
One object per book. The server owns every field marked "server"; the client supplies the rest on
each put and the server validates types and lengths.

| Field | Type | Owner | Notes |
|---|---|---|---|
| `formatVersion`, `bookId` | number, string | server | `1` (the sidecar's own schema version) and the path's bookId |
| `product`, `title` | string | client | one of `bst`, `se`, `taxi`, `ltd`; a title of 1 to 120 characters after trimming |
| `latestVersion` | integer | server | ≥ 1, never decreases |
| `latestETag`, `latestSize` | string, integer | server | the S3 ETag of `v{latestVersion}.zip` with quotes stripped, and its decoded byte count |
| `versions` | array | server | oldest first, at most 30 entries of `{version, etag, size, createdAt}` |
| `createdAt`, `updatedAt` | string | server | ISO 8601, the first set on the first put, the second on every put |
| `periodCoveredStart`, `periodCoveredEnd` | string or null | client | ISO dates from the book's `documentInfo` |
| `provenance` | object | client | `{formatVersion, engineVersion, taxDataHash, templateHash, reconciledCommit}`, each a string or null, each at most 200 characters. LP-1's five stamps. |
| `entitlementAtPut` | object | server | `{allowed, reason, bundleId, checkedAt}` as `entitlementFor` returned it |

Version numbering: integers from 1, one higher on each accepted put, never reused, never reordered.
A zip object is written once and never overwritten. When `versions` would exceed 30, the put deletes
the oldest zip object and drops its entry; `latestVersion` keeps climbing.

Quotas: a decoded zip over 2 MB is 413 `book-too-large`; a 21st book is 403 `book-limit-reached`; a
31st version prunes the oldest without an error.

## 3. The four routes

All four sit on the existing HTTP API under `/api/v1/books`, behind the books JWT authoriser
(section 5.3). The caller sends `Authorization: Bearer <idToken>`, as every other page here does.
The authoriser's audience is the books app client id, so only that client's tokens are accepted; the
handler reads `sub` from `event.requestContext.authorizer.jwt.claims` via
`extractUserFromAuthorizerContext`.

| # | Method | Path | Handler | Success |
|---|---|---|---|---|
| R1 | GET | `/api/v1/books` | `booksListGet.ingestHandler` | 200 `{"books": [metadata, …]}` |
| R2 | GET | `/api/v1/books/{bookId}/versions/{version}` | `booksVersionGet.ingestHandler` | 200 `{"metadata": {…}, "version": n, "etag": "…", "zipBase64": "…"}` |
| R3 | PUT | `/api/v1/books/{bookId}` | `booksPut.ingestHandler` | 200 `{"metadata": {…}}` with an `ETag` response header |
| R4 | DELETE | `/api/v1/books/{bookId}` | `booksDelete.ingestHandler` | 200 `{"bookId": "…", "deletedObjects": n}` |

`{version}` is `latest` or a positive integer.

R3's request body:

```json
{ "title": "…", "product": "ltd", "periodCoveredStart": "2025-04-01",
  "periodCoveredEnd": "2026-03-31", "provenance": { … }, "zipBase64": "UEsDBBQ…" }
```

### 3.1 Concurrency
| Case | `If-Match` | Result |
|---|---|---|
| Book does not exist | absent | version 1 created |
| Book exists | matches `latestETag` | new version written |
| Either | anything else, including `*` and absent-on-an-existing-book | 412 `etag-mismatch`, body carries `latestETag` and `latestVersion` |

Conditional S3 writes stop a race interleaving. 1. `GetObject` metadata.json, keeping its own S3
ETag as `metaETag`. 2. Compare the request's `If-Match` against `metadata.latestETag`; a mismatch
ends in 412. 3. `PutObject` the new zip at `v{n+1}.zip` with `IfNoneMatch: "*"`. 4. `PutObject`
metadata.json with `IfMatch: metaETag`, or `IfNoneMatch: "*"` on a first put. A 412 from step 3 or 4
means another writer got there first: go back to step 1, once, then answer 409 `write-conflict`.

### 3.2 Status codes and the error body
Errors use the repo's existing shape, `{"message": "…", "code": "…"}`, from
`app/lib/httpResponseHelper.js`. Two helpers are new: `http412PreconditionFailedResponse` and
`http413PayloadTooLargeResponse`, written to match the ones beside them.

| Status | Code | When |
|---|---|---|
| 400 | `invalid-book-id`, `invalid-request` | the path's bookId is not a UUID v4; a missing or malformed body field; a version that is neither `latest` nor a positive integer |
| 401 | `unauthenticated` | no claims on the event (the authoriser normally rejects first) |
| 403 | `subscription-required`, `book-limit-reached` | `entitlementFor` said no; the caller has 20 books and this put would create a 21st |
| 404 | `book-not-found`, `version-not-found` | no metadata.json under the caller's own prefix; a version above `latestVersion` or already pruned |
| 409 | `write-conflict` | both conditional-write retries lost |
| 412 | `etag-mismatch` | section 3.1 |
| 413 | `book-too-large` | decoded zip over 2 MB |
| 422 | `not-a-diya-gl-package` | the zip's member names fail section 6.2 |
| 500 | `storage-error` | anything else, logged with the S3 error name |

Every key derives from the caller's own hashed sub, so another user's bookId simply is not there. A
cross-user read is a 404, never a 403, and the tests assert it.

### 3.3 Headers
Responses carry `ETag: "<latestETag>"` on R2 and R3. `httpResponse()` already sets the correlation
headers and `Access-Control-Expose-Headers`; extend that constant to
`x-request-id,x-correlationid,Location,Retry-After,ETag`. Each handler sets
`Access-Control-Allow-Origin` by matching the request's `Origin` against the comma-separated
`BOOKS_ALLOWED_ORIGINS` env var, echoing the match and adding `Vary: Origin`; no match means no CORS
header at all. An `OPTIONS` request returns 204 with `Access-Control-Allow-Methods`,
`Access-Control-Allow-Headers` (`authorization, content-type, if-match, x-request-id,
x-correlationid`), `Access-Control-Expose-Headers` and `Access-Control-Max-Age: 600`.

## 4. The entitlement hook

`app/services/booksEntitlement.js`:

```js
export async function entitlementFor(sub)
// -> { allowed: boolean,
//      reason: "not-enforced" | "active-subscription" | "no-subscription" | "expired",
//      bundleId: string | null, expiry: string | null, checkedAt: string }
```

1. If `process.env.BOOKS_ENTITLEMENT_ENFORCED !== "true"`, return allowed, with the reason
   `not-enforced`. That is the stub: everyone passes until LP-18 flips the variable.
2. Otherwise `await initializeSalt()`, then `getUserBundles(sub)` from
   `app/data/dynamoDbBundleRepository.js`. That reads the env bundles table `{env}-env-bundles`, the
   row `billingWebhookPost.js` writes through `putBundleByHashedSub` on
   `checkout.session.completed`.
3. A bundle whose `bundleId` equals `process.env.BOOKS_BUNDLE_ID` (default `resident-books`, beside
   `resident-vat` and `resident-itsa` in `web/public/submit.catalogue.toml`) with
   `subscriptionStatus === "active"` and `Date.parse(expiry) > Date.now()` is allowed, with the
   reason `active-subscription`. A match whose expiry has passed is `expired`; no match is
   `no-subscription`. Both are `allowed: false`, which `booksPut` turns into 403
   `subscription-required`.

Only `booksPut` calls it (D13). The result is stored on the book as `entitlementAtPut`, so a support
question about a book has its answer on the object.

## 5. CDK

### 5.1 DataStack — the bucket
Add `public IBucket booksBucket;` and build it with `Bucket.Builder.create`, following
`AnalyticsStack`'s lake bucket, with section 2.1's properties, and output `BooksBucketName`.
`SubmitSharedNames` gains `public String booksBucketName`; `BackupStack` imports the bucket by name
into the critical-resources selection.

### 5.2 BooksStack — the Lambdas
New file `infra/main/java/co/uk/diyaccounting/submit/stacks/BooksStack.java`, stack id
`sharedNames.booksStackId` = `"%s-app-BooksStack".formatted(deploymentName)`. Modelled line for line
on `BillingStack`: an immutable `BooksStackProps` with the standard `SubmitStackProps` members plus
`baseImageTag()`, `booksBucketName()` and `booksAllowedOrigins()`; four `ApiLambda` constructs; a
public `List<AbstractApiLambdaProps> lambdaFunctionProps`; `Lambda.stackHealthAlarm(this,
resourceNamePrefix, "books", …)`; a `cfnOutput` per function ARN.

All four get `BOOKS_BUCKET_NAME`, `ENVIRONMENT_NAME`, and `BOOKS_ALLOWED_ORIGINS` (ci:
`https://ci-spreadsheets.diyaccounting.co.uk,http://localhost:3000`; prod:
`https://spreadsheets.diyaccounting.co.uk`). The put function also gets `BOOKS_MAX_BYTES=2097152`,
`BOOKS_MAX_PER_USER=20`, `BOOKS_VERSIONS_KEPT=30`, `BOOKS_ENTITLEMENT_ENFORCED=false`,
`BOOKS_BUNDLE_ID=resident-books` and `BUNDLE_DYNAMODB_TABLE_NAME`.

IAM per function, on the bucket only. No function gets the bucket root or `s3:*`.

| Function | Grants |
|---|---|
| list | `s3:ListBucket` on the bucket; `s3:GetObject` on `<bucket>/users/*/books/*/metadata.json` |
| version get | `s3:GetObject` on `<bucket>/users/*/books/*` |
| put | `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `<bucket>/users/*/books/*`; `s3:ListBucket` on the bucket; `bundlesTable.grant(fn, "dynamodb:Query")` |
| delete | `s3:ListBucket` on the bucket; `s3:DeleteObject` on `<bucket>/users/*/books/*` |

All four also get `SubHashSaltHelper.grantSaltAccess(fn, region, account, envName)`. Log retention
and alarms come free from the `Lambda` construct: a `/aws/lambda/<fn>` log group at
`RetentionDays.THREE_DAYS` with `RemovalPolicy.DESTROY`, an errors alarm, a log-errors metric filter
and alarm, all fanned into the stack health composite `OpsStack` routes.

### 5.3 ApiStack — routes and the second authoriser
`AbstractApiLambdaProps` gains `booksJwtAuthorizer()` and `optionsPreflightRoute()`, both
`@Value.Default` false so no existing caller changes. `ApiStackProps` gains
`booksUserPoolClientId()`, and `ApiStack` builds a second `HttpJwtAuthorizer`, id
`resourceNamePrefix + "-BooksCognitoAuthorizer"`, same issuer, with
`jwtAudience(List.of(props.booksUserPoolClientId()))`. `createRouteForLambda` picks it when
`booksJwtAuthorizer()` is true, ahead of the existing jwt branch, and when `optionsPreflightRoute()`
is true also creates an `OPTIONS` route on the same path with the same integration and no
authoriser, alongside the auto-HEAD route it already makes.

`SubmitSharedNames` gains the eight fields per route the billing routes already have plus a
`PublishedLambda` entry each, so `web/public/docs/api/openapi.json` regenerates on `./mvnw clean
verify`. `SubmitApplication` constructs `BooksStack` after `BillingStack`, adds
`booksStack.lambdaFunctionProps` to `lambdaFunctions`, calls
`apiStack.addStackDependency(booksStack)`, and reads the client id with
`envOr("COGNITO_BOOKS_CLIENT_ID", appProps.booksUserPoolClientId, …)`.

### 5.4 EdgeStack — CloudFront
The books page calls `https://submit.diyaccounting.co.uk/api/v1/books/…` (ci:
`https://ci-submit.diyaccounting.co.uk/…`), reaching the API through CloudFront's `/api/v1/*`
behaviour. That behaviour's response headers policy sets `Access-Control-Allow-Origin: *`, allows
only GET, HEAD and OPTIONS, exposes nothing and sets `originOverride(true)`, so it would stamp over
the handler's headers and break both the PUT preflight and the client's read of `ETag`. Add a
`booksApiResponseHeadersPolicy` carrying the same security headers with no `corsBehavior`, and
register it on `additionalBehaviors.put("/api/v1/books/*", …)` with the same origin, origin request
policy, `AllowedMethods.ALLOW_ALL` and `CachePolicy.CACHING_DISABLED`. CloudFront prefers the more
specific pattern, so `/api/v1/*` is unaffected.

### 5.5 Outputs and workflows
`BooksStack` outputs `BooksApiBaseUrl` = `sharedNames.publicBaseUrl + "api/v1/books"`, which is what
LP-17 needs on the spreadsheets side; the bucket name comes out of `DataStack`. Four workflows name
app stacks explicitly and need the new one: `deploy.yml` (a `deploy-books` job cloned from
`deploy-billing`, needed by `deploy-api`), `destroy-ci.yml` and `destroy-prod.yml`
(`delete_stack_in_region "${DEPLOYMENT}-app-BooksStack" eu-west-2`), and `stack-drift.yml`.
`SelfDestructStack` finds stacks by deployment prefix and needs no change.

## 6. The Lambda handlers

Runtime and bundling follow every other handler: an ARM64 Docker image from the shared env ECR
repository, `cmd` set to `app/functions/books/<name>.ingestHandler`, 1024 MB, 28 s, provisioned
concurrency 0. Each file exports `ingestHandler(event)` and an `apiEndpoint(app)` calling
`registerLambdaRoute`, so the local simulator serves it.

### 6.1 Files
`app/functions/books/booksListGet.js` (R1), `booksVersionGet.js` (R2), `booksPut.js` (R3) and
`booksDelete.js` (R4), over `app/data/s3BooksRepository.js` (the store), `app/lib/zipMembers.js`
(the zip reader) and `app/services/booksEntitlement.js` (section 4).

### 6.2 `app/lib/zipMembers.js`
`listZipMemberNames(buffer)` returns the member names without unzipping anything. Scan back from the
end over at most 65557 bytes for the end-of-central-directory signature `0x06054b50`, read the entry
count and the central directory offset, then walk that many central directory headers
(`0x02014b50`), each giving a name length, extra length, comment length and the name. A missing
signature or a short header throws a typed `NotAZipError`. `isDiyaGlPackage(names)` is true when the
set holds `book.toml`, `lines.jsonl` and `report.json` and every name is in `{book.toml,
lines.jsonl, report.json, bookchecks.json, overtyped.json}`, the exact set `writeDiyaGlZip` produces
in the spreadsheets repo (`app/lib/books-interchange.js`). No directories, no nesting.

### 6.3 `app/data/s3BooksRepository.js`
One `S3Client` per container, created lazily. Exports `bookPrefix`, `metadataKey`, `versionKey`,
`readMetadata` (returning `{metadata, metaETag}` or null), `writeMetadata({…, ifMatch |
ifNoneMatch})`, `putVersion({…, n, bytes})` returning the S3 ETag, `getVersion`, `listBooks`,
`deleteBook`, `normaliseETag` (strips the quotes and any `-N` multipart suffix), and
`resolveOwnerPrefix(sub)`, which holds section 2.2's salt fallback.

### 6.4 Handler steps
Every handler opens the same way: `extractRequest(event)`; on `OPTIONS`, return the 204 preflight;
`extractUserFromAuthorizerContext(event)` or 401; `await initializeSalt()`;
`resolveOwnerPrefix(sub)`. Then, numbered from 5:

**booksListGet** — 5. `listBooks` reads every `metadata.json` under the prefix (one `ListObjectsV2`
with delimiter `/`, then a `GetObject` per book, at most 20). 6. Sort by `updatedAt` descending. 7.
200 with `{books}`. An unreadable metadata.json is logged and skipped.

**booksVersionGet** — 5. Validate `bookId`, else 400. 6. `readMetadata`, else 404 `book-not-found`.
7. Resolve `latest` to `metadata.latestVersion`, else parse a positive integer, else 400. 8.
`getVersion`; `NoSuchKey` is 404 `version-not-found`. 9. 200 with the metadata, the version, its
ETag and `zipBase64`, plus the `ETag` header.
**booksPut** — 5. Validate `bookId`, else 400. 6. `parseRequestBody`; validate `title`, `product`,
the two dates, `provenance` and `zipBase64`, else 400 `invalid-request`. 7. Decode the base64; over
`BOOKS_MAX_BYTES` is 413. 8. `listZipMemberNames` then `isDiyaGlPackage`; a throw or a false is 422
`not-a-diya-gl-package`. 9. `entitlementFor(sub)`; not allowed is 403 `subscription-required`. 10.
`readMetadata`. 11. When absent and the caller already has 20 books, 403 `book-limit-reached`. 12.
Apply the section 3.1 table to `If-Match`; a mismatch is 412 carrying `latestETag` and
`latestVersion`. 13. Conditional writes, steps 3 and 4 of section 3.1. 14. Prune beyond
`BOOKS_VERSIONS_KEPT`. 15. 200 with the metadata and the `ETag` header.
**booksDelete** — 5. Validate `bookId`, else 400. 6. `readMetadata`, else 404. 7. `ListObjectsV2`
the prefix and `DeleteObjects` the lot, in pages of 1000. 8. 200 with `{bookId, deletedObjects}`.

### 6.5 Unit tests
One file per handler under `app/unit-tests/functions/`, plus `app/unit-tests/lib/zipMembers.test.js`
and `app/unit-tests/services/booksEntitlement.test.js`. Mock `@aws-sdk/client-s3` the way
`app/unit-tests/analytics/dataQualityRun.test.js` does, build events with `buildEventWithToken` /
`makeIdToken` from `app/test-helpers/eventBuilders.js`, and set `process.env.USER_SUB_HASH_SALT` to
the test registry as the billing tests do.

| Test | Given | Expect |
|---|---|---|
| `booksListGet` returns an empty list, then books newest first, and rejects an unauthenticated call | no objects; two metadata objects with different `updatedAt`; no authorizer claims | 200 `{books: []}`; 200 with the later one first; 401 |
| `booksVersionGet` resolves `latest`, and 404s an unknown book, another user's book and a pruned version | `latestVersion: 3`; no metadata; metadata under a different hashed sub; version 1 with `versions` starting at 5 | reads `v3.zip` with the `ETag` header; 404 `book-not-found`; 404 not 403; 404 `version-not-found` |
| `booksPut` creates version 1, then writes the next version | no metadata and no `If-Match`; then `latestVersion: 2, latestETag: "abc"` with `If-Match: "abc"` | 200 writing `v1.zip` with `createdAt` set; 200 writing `v3.zip` with `latestVersion: 3` |
| `booksPut` 412s on a stale, missing or premature `If-Match` | `latestETag: "abc"` with `If-Match: "stale"`; existing book with no header; new book with a header | 412 `etag-mismatch` each time, the first carrying `latestETag: "abc"` |
| `booksPut` 413s an oversized zip, and 422s a bad one | `zipBase64` decoding to 2 MB + 1; members `book.toml` and `report.json` only; random bytes | 413 `book-too-large` with no S3 write; 422 `not-a-diya-gl-package` twice |
| `booksPut` gates on entitlement and on the book limit | enforced with no bundle; the stub off; 20 prefixes listed with a new bookId | 403 `subscription-required` with no S3 write; 200 with `entitlementAtPut.reason: "not-enforced"`; 403 `book-limit-reached` |
| `booksPut` prunes beyond 30 versions, retries a metadata race once, then gives up | `versions` already 30 long; first write 412 then success; both writes 412 | oldest zip deleted with `versions` still 30 and `latestVersion` climbing; 200; 409 `write-conflict` |
| `booksPut` 400s a bookId that is not a UUID | `../../other` | 400 `invalid-book-id`, no S3 call |
| `booksDelete` removes every object, and 404s an unknown book | 4 objects under the prefix; no metadata | 200 `deletedObjects: 4`; 404 |
| preflight is answered without a token, and only for a listed origin | `OPTIONS` with an allow-listed `Origin` and no auth header; then `Origin: https://evil.example` | 204 echoing the origin; 204 with no `Access-Control-Allow-Origin` |
| `zipMembers` reads a real diya-gl zip and throws on truncated bytes | a fixture zip under `fixtures/books/`; its first 40 bytes | the five member names; `NotAZipError` |
| `booksEntitlement` reads an active and an expired bundle | `resident-books` active with a future expiry; the same expired | `"active-subscription"`; `allowed: false, reason: "expired"` |

## 7. Verification ladder

1. `npm run test:app-unit` while working; `npm test` (unit plus system) before any push.
2. `./mvnw clean verify` — CDK synth, the Java stack tests, and the OpenAPI regeneration that picks
   up the four `PublishedLambda` entries.
3. A system test `app/system-tests/booksStorage.system.test.js` drives all four handlers against the
   local HTTP server with a mocked S3: create, read `latest`, put with the returned ETag, put again
   with the stale ETag for a 412, delete.
4. A behaviour probe `behaviour-tests/books.behaviour.test.js`, project `booksBehaviour`, run as
   `npm run test:booksBehaviour-ci`. It signs in through the hosted UI on the existing
   `cognito-native` path (`loginWithCognitoOrMockAuth` in
   `behaviour-tests/steps/behaviour-login-steps.js`, the same `TEST_AUTH_USERNAME`,
   `TEST_AUTH_PASSWORD` and `TEST_AUTH_TOTP_SECRET` the other suites use, wrapped in
   `scripts/enable-cognito-native-test.js`), reads the stored id token, then calls the four routes
   with `fetch` from inside the page so the browser enforces CORS. It asserts a create, a `latest`
   read whose bytes match, a 412 on a stale ETag and a delete. Before LP-15, run it on the current
   client id.
5. Deploy: one PR on `claude/books-storage-api` against Submit's main, merged by the operator
   (launch-plan row H9), then `deploy.yml` applies `DataStack`, then `BooksStack`, `ApiStack` and
   `EdgeStack`. Run the behaviour probe against ci before prod.

## 8. Build order

Each step is one commit with its own acceptance check.

| # | Step | Files | Accepted when |
|---|---|---|---|
| 1 ✅ | The bucket and its name | `SubmitSharedNames.java`, `DataStack.java`, `BackupStack.java`, `infra/test/.../stacks/DataStackTest.java`, `infra/test/.../BackupStackCdkResourceTest.java` | `./mvnw clean verify` synthesises a versioned, encrypted, DESTROY bucket and the backup selection names it |
| 2 ✅ | The zip reader and the store | `app/lib/zipMembers.js` and its test, a fixture zip under `fixtures/books/`, `app/data/s3BooksRepository.js` | the fixture's five members are read; truncated bytes throw |
| 3 | The entitlement stub | `app/services/booksEntitlement.js`, its test | both enforced and unenforced paths pass |
| 4 | The two read handlers | `booksListGet.js`, `booksVersionGet.js`, their tests, the two new response helpers | `npm run test:app-unit` green, every read case in section 6.5 |
| 5 | The write handlers | `booksPut.js`, `booksDelete.js`, their tests | every write case in section 6.5, including 412, 413, 422, 403 and the cross-user 404 |
| 6 | The route names | `SubmitSharedNames.java` — eight fields and a `PublishedLambda` per route | `./mvnw clean verify` regenerates `web/public/docs/api/openapi.json` with the four paths |
| 7 | The stack | `BooksStack.java`, `SubmitApplication.java`, `infra/test/.../stacks/BooksStackTest.java` | synth shows four functions with the env vars and the prefix-scoped IAM of section 5.2 |
| 8 | The authoriser and the routes | `AbstractApiLambdaProps.java`, `ApiStack.java`, its test | synth shows a second JWT authoriser on the books client id and an unauthenticated OPTIONS route per books path |
| 9 | CloudFront | `EdgeStack.java`, its test | synth shows an `/api/v1/books/*` behaviour with a policy carrying no CORS override |
| 10 | The system test | `app/system-tests/booksStorage.system.test.js` | `npm test` green |
| 11 | The workflows | `deploy.yml`, `destroy-ci.yml`, `destroy-prod.yml`, `stack-drift.yml` | the yaml lints and `deploy-api` waits on `deploy-books` |
| 12 | The behaviour probe | `behaviour-tests/books.behaviour.test.js`, `playwright.config.js`, `package.json` | passes against ci after the deploy |

## 9. Open questions for the operator

**The Payment Link and the subscriber key.** Section 5c decided a Stripe Payment Link carrying the
Cognito subject as `client_reference_id`. `billingWebhookPost.js` reads
`session.metadata?.hashedSub || session.client_reference_id` and writes the bundle under that value
as the hashed sub, while
`getUserBundles(sub)` looks the row up under `hashSub(sub)`. A raw subject therefore lands a row
nobody reads, and every subscriber looks unentitled. Two ways out, both for LP-18: route the
subscribe button through the existing `POST /api/v1/billing/checkout` so the server sets
`metadata.hashedSub` and the Payment Link goes away, or add a small route returning the caller's own
hashed sub for the page to pass. The first reuses working code, the second keeps the one-click link
the launch plan priced. LP-16 works either way: `entitlementFor` only asks `getUserBundles(sub)`.

**The client-id lookup picks the first client.** `.github/actions/lookup-resources/action.yml`
resolves the app client with `UserPoolClients[0].ClientId`. With LP-15's second client on the pool
that ordering is undefined, so a deploy could hand `COGNITO_CLIENT_ID` the books client and break
the existing routes' authoriser. The query must select by `ClientName` (`{env}-env-client`,
`{env}-env-books-client`) and export `COGNITO_BOOKS_CLIENT_ID` alongside. It sits in LP-15's files,
so whichever row lands first should carry it.
