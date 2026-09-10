<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: DIYA-GL naming, "books" is not a product

A read-and-report sweep of both repositories for "books" used as a product, feature, page,
client or import name. No source file changes here — this plan turns every wrong usage into a
machine row that a later session picks up.

## The operator's rule

The products are the packages: "the Basic Sole Trader package", "the self-employed package",
"the taxi package", "the limited company package" (also BST, SE, Taxi, Ltd).

DIYA-GL is the format and the engine. A "book" is one DIYA-GL file set (`book.toml` plus
`lines.jsonl`); "a book" or "the book" as that data noun is correct and stays.

Wrong: "books" as the name of a product, feature, page, client or import. Worked example, from
`PLAN_ITSA_PHASE_2.md`: the section title "The books import" and the phrase "derivations for
self-employed books" are wrong; they should read "The DIYA-GL import" and "derivations for the
self-employed package". Likewise "the books pages" means "the DIYA-GL pages", "the books client"
means "the DIYA-GL client", "the books origins" means "the DIYA-GL origins".

Route paths, environment variable names, stack names and config keys (the storage API's routes,
`BooksStack`, `BOOKS_ALLOWED_ORIGINS` and the like) are code identifiers, not product names —
they sort into class 4 below. Prose that calls the API or its pages "books" as a product is
still class 1.

## Counts

| Repository | Class 1 (prose) | Class 2 (public paths) | Class 3 (same-repo code) | Class 4 (cross-repo) | Class 5 (correct, count only) |
|---|---|---|---|---|---|
| spreadsheets | ~563 (43 docs/comments/page-copy + ~520 test titles across 46 files) | ~15 references, ~40 served files under `public/books/` | 2 core modules, 1 build script + npm script, 46 test filenames, 4 DOM ids, 2 further modules, 1 format-string special case | 3 identifiers referenced from this side (deduped into the shared table below) | ~1100+, not enumerated |
| submit | ~36 | — (none found; submit has no public static site) | 13 files/directories, ~20 identifiers | ~15 identifiers, 27 files (deduped into the shared table below) | ~60-70, not enumerated |

Class 4 is one shared list. The sweep found 16 identifiers; reading the deployed code and the live
accounts for the class 4 design found four more, so 20. See below.

## Spreadsheets — class 1, prose (docs, comments, page copy)

| File | Count | Current | Proposed |
|---|---|---|---|
| `_developers/archive/PLAN_DIYA_GL_SE_CLI_MCP_WEB.md` | 2 | "the books page", "the books specs" | "the DIYA-GL pages", "the DIYA-GL specs" |
| `_developers/archive/PLAN_DIYA_GL_TAXI_CLI_MCP_WEB.md` | 1 | "the books page" | "the DIYA-GL pages" |
| `_developers/archive/PLAN_DIYA_GL_LTD_CLI_MCP_WEB.md` | 2 | "the books page", "DIYA-GL books page loads" | "the DIYA-GL pages", "the DIYA-GL page loads" |
| `_developers/archive/PLAN_DIYA_GL_BST_CLI_MCP_WEB.md` | 3 | "the books page" (x2), "Books tab" | "the DIYA-GL pages", "DIYA-GL tab" |
| `PLAN_DIYA_GL_CLOUD_PAGE.md` | 6 | "the books client" (x5) and its open-question note | "the DIYA-GL client" |
| `PLAN_DIYA_GL_LAUNCH.md` | 1 | "the books pages" | "the DIYA-GL pages" |
| `PLAN_LICENSING_UPLIFT.md` | 8 | "the books pages" / "the books bundle" (lines 75, 188, 235, 349, 350, 443, 541, 581) | "the DIYA-GL pages" / "the DIYA-GL bundle" |
| `LICENSING.md` | 2 | "the books bundle" | "the DIYA-GL bundle" |
| `NOTICE` | 3 | "the books bundle" | "the DIYA-GL bundle" |
| `.github/workflows/deploy.yml`, `test.yml` | 2 | step name "Build books engine bundle" | "Build DIYA-GL engine bundle" |
| `app/bin/build-diya-gl-spec.js` (writes `public/diya-gl.html`) | 7 | "Self Employed books fill…", "Limited Company books fill/file a CT600", 4 link labels "Basic Sole Trader books" etc. | package-name phrasing, e.g. "the self-employed package fills…", "the limited company package files a CT600" |
| `public/diya-gl.html` | (generated) | duplicate of the above | fix at source in `build-diya-gl-spec.js`, not by hand |
| `public/download.html` | 4 | h2 "View your books in DIYA-GL", "editable books", "View Taxi Driver books", "View Limited Company books" | "View your DIYA-GL data", "an editable DIYA-GL page", package-name phrasing |
| `diya-gl/README.md` | 1 | "the books page uses" | "the DIYA-GL pages use" |
| `diya-gl/bin/diya-gl-write-workbook.js` | 1 | comment "the books page uses" | "the DIYA-GL pages use" |
| 46 test files (`app/test/books-*.test.js`, `web/browser-tests/books-*.browser.test.js`, `web/unit-tests/books-*.test.js`) | ~520 | `describe`/`it` titles saying "the books page…" | same titles with "DIYA-GL" in place of "books"; string-only, no code change (filenames themselves are class 3, listed there) |

## Spreadsheets — class 2, public URLs and paths

| File / path | Count | Note |
|---|---|---|
| `public/books/**` (whole tree, ~40 served files: `bst.html`, `se.html`, `ltd.html`, `taxi.html`, probes, `manifest.webmanifest`, `sw.js`, `assets/`, `engine/`) | the `/books/*` namespace | not in `sitemap.xml` (0 hits) — no sitemap update needed; a rename needs `redirects.toml` and CloudFront function entries for every old path |
| `public/download.html` | 4 | `href="books/bst.html"` etc. |
| `app/bin/build-diya-gl-spec.js` → `public/diya-gl.html` | 4 | same 4 hrefs, generated |
| `app/lib/app-resources.js:36` | 1 | `DEFAULT_TEMPLATE_SOURCE = ".../books/assets/"` |
| `public/books/manifest.webmanifest` | 3 | `start_url`, `scope`, icon path under `/books/` |
| `public/books/sw.js` | 2 | filename comment plus `"/books/"` scope in the fetch handler |

## Spreadsheets — class 3, same-repo code identifiers

| Identifier | Count | Cost |
|---|---|---|
| `app/lib/books-engine.js` | 8 importers | rename plus every importer plus the `scripts/build-books-bundle.mjs` entry-point reference |
| `app/lib/books-interchange.js` | 23 importers | the widest same-repo blast radius found |
| `scripts/build-books-bundle.mjs` + npm script `build:books-bundle` | 24 referencing files, incl. both workflow YAMLs, `.gitignore`, `.prettierignore` | script rename, npm script key rename, CI step commands |
| 46 test filenames (`app/test/books-{interchange,page-upload,product-manifest,shell-money-format}.test.js`, `app/test/taxi-books-manifest.test.js`, 39 `web/browser-tests/books-*.browser.test.js`, `web/unit-tests/books-{cloud-pkce,events}.test.js`) | 46 files | filename rename plus `playwright.config.js` globs plus any CI file-list references |
| `public/download.html` DOM ids `books-bst-link`, `books-se-link`, `books-taxi-link`, `books-ltd-link` | 4 | id rename plus any test selectors against them |
| `public/books/books-events.js`, `public/books/books.css` | 2 modules | rename plus `shell.js`/HTML `<link>`/`<script>` references |
| `"diya-gl-books"` / `"diya-gl-books/1"` format string (`JSON_FORMAT` in `books-interchange.js`, `FORMAT_VERSION` in `provenance-data.js` and `build-provenance-data.mjs`) | 39 occurrences across `app/data/releases.json`, `examples/parity/*/report.json`, `public/schema/diya-gl-book-v2.schema.json`, `public/books/sw.js` cache prefix, `public/diya-gl.html`, `PLAN_DIYA_GL_LAUNCH.md`, 8 test files | already contradicts the operator's own rule (should read `"diya-gl"`/`"diya-gl/1"`); already stamped into checked-in generated files and, per `cloud.js`, into documents users may have saved — a rename needs a version bump and a back-compat reader, not a plain find-and-replace |

## Submit — class 1, prose

| File | Count | Current | Proposed |
|---|---|---|---|
| `PLAN_ITSA_PHASE_2.md` | 5 | "The books import" (section title), "the books import" (x2 body), "the books-to-submission path" (T9 title), a cross-repo mention of `app/lib/books-interchange.js` | "The DIYA-GL import", "the DIYA-GL-to-submission path"; the file mention tracks the spreadsheets-side rename |
| `PLAN_DIYA_GL_STORAGE.md` | ~12 | "the books routes", "the books client (id)", "books path", "the books JWT authoriser", "the books page" | "the DIYA-GL routes/client/path/authoriser/page" |
| `PLAN_SUBMISSION_MCP.md` | ~10 | "the books client(s)", "the books page", "on the books page, box by box" | "the DIYA-GL client(s)/page" |
| `PLAN_ONE_STOP_DASHBOARD.md` | 3 | "the CSV and books import" (x2), "books events" | "the DIYA-GL import", "DIYA-GL page events" |
| `NEXT.md` | 4 | "the prod books bucket", "the S3 books bucket", "the books-to-submission path" | "the DIYA-GL book bucket", "the DIYA-GL-to-submission path" |
| `email.txt` | 1 | live URL `https://spreadsheets.diyaccounting.co.uk/books/ltd.html` in a sent-mail quote | a public-path reference, not a text edit — tracks the spreadsheets-side redirect |
| `app/functions/billing/billingReturnUrl.js` | 1 | comment "the comma-separated allow-list BooksStack builds for" | tracks the class-4 stack rename below |

## Submit — class 3, same-repo code identifiers

| File / directory | Proposal |
|---|---|
| `app/data/s3BooksRepository.js` | `s3DiyaGlRepository.js` |
| `app/functions/books/` (`booksDelete.js`, `booksListGet.js`, `booksPut.js`, `booksVersionGet.js`) | `app/functions/diyaGl/` with matching filenames |
| `app/lib/booksCors.js` | `diyaGlCors.js` |
| `app/services/booksEntitlement.js` | `diyaGlEntitlement.js` |
| `app/system-tests/booksStorage.system.test.js` | `diyaGlStorage.system.test.js` |
| `app/unit-tests/functions/books{Delete,ListGet,Put,VersionGet}.test.js` | renamed alongside their source files |
| `app/unit-tests/services/booksEntitlement.test.js` | `diyaGlEntitlement.test.js` |
| `behaviour-tests/books.behaviour.test.js` | `diyaGlStorage.behaviour.test.js` |
| `package.json` | npm scripts `test:booksBehaviour*` → `test:diyaGlBehaviour*` |
| `playwright.config.js` | project name `"booksBehaviour"`, `testMatch` glob → `diyaGlBehaviour` |

Every one of these needs its importers and CI references updated in the same change.

## Class 4 — cross-repository and deployed identifiers (one list, both sides)

| Identifier | Where in submit | Where in spreadsheets | Proposed |
|---|---|---|---|
| `BooksStack` (CDK stack class, `BooksStackTest.java`) | `infra/main` and `infra/test` Java; the literal stack name `${DEPLOYMENT}-app-BooksStack` in `deploy.yml`, `destroy-ci.yml`, `destroy-prod.yml`, `stack-drift.yml` | named in prose, `PLAN_DIYA_GL_LAUNCH.md` ("BooksStack already checks...") | `DiyaGlStack` |
| `BOOKS_ALLOWED_ORIGINS` | `BooksStack.java`, `EdgeStack.java` comment, `booksCors.js`, 4 test files | none by name; the value gates spreadsheets' own calls | `DIYA_GL_ALLOWED_ORIGINS` |
| `BooksApiBaseUrl` (CFN output) | `BooksStack.java`, asserted in `BooksStackTest.java` | none by name | `DiyaGlApiBaseUrl`. No machine reads this output. |
| `BooksUserPoolClientId` (CFN output) | `IdentityStack.java:331` only, not `BooksStack`. Read by `scripts/toggle-cognito-native-auth.js:176` and by `probe-test.yml:414` through `scripts/stack-output.js` | named exactly in a comment, `web/spreadsheets.diyaccounting.co.uk/public/books/cloud-config.js:9` | `DiyaGlUserPoolClientId` |
| Cognito client name `-books-client` / `{env}-env-books-client` | `IdentityStack.java`, `.github/actions/lookup-resources/action.yml` | toggled from this side per `NEXT.md`'s LP-24 row | `-diya-gl-client` |
| `--client books` flag | `scripts/toggle-cognito-native-auth.js` | `NEXT.md` LP-24 documents calling the script this way | `--client diya-gl` |
| SSM parameter `/submit/{env}/spreadsheets-books-app-client-id` | written by `IdentityStack.java:301`, asserted in `IdentityStackTest.java:165`, named in a `SubmitApplication.java:474` error message and in `SubmitApplicationCdkResourceTest.java:432` | named in `PLAN_DIYA_GL_CLOUD_PAGE.md` prose. No workflow or script in either repository reads it. | `/submit/{env}/spreadsheets-diya-gl-app-client-id` |
| `cdk.json` key `booksUserPoolClientId` | `cdk-application/cdk.json` | none by name | `diyaGlUserPoolClientId` |
| `booksBucketName` / `booksBucketArn`, S3 bucket `{env}-env-books-{account}`, CFN output `BooksBucketName` | the bucket is built in `DataStack.java:646` (an env stack, not `BooksStack`); the name in `SubmitSharedNames.java:1105`; the backup selection ARN in `BackupStack.java:306`; `BooksStack.java` builds its IAM patterns from the name | none by name | `diyaGlBucketName` / `diyaGlBucketArn`, bucket `{env}-env-diya-gl-{account}`, output `DiyaGlBucketName` |
| `booksStackId` field | `SubmitSharedNames.java` | none by name | `diyaGlStackId` |
| `BOOKS_STACK_NAME` (Lambda env var) | `SelfDestructStack.java`, `selfDestruct.js`, its test | none by name | `DIYA_GL_STACK_NAME` |
| `COGNITO_BOOKS_CLIENT_ID` (workflow env var) | `deploy.yml`, `destroy-ci.yml`, `destroy-prod.yml`, `deploy-cdk-stack.yml`, `probe-test.yml`, `SubmitApplicationCdkResourceTest.java` | none by name | `COGNITO_DIYA_GL_CLIENT_ID` |
| GH Action output `cognito-books-client-id` / `BOOKS_CLIENT_NAME` | `.github/actions/lookup-resources/action.yml` | none by name | `cognito-diya-gl-client-id` / `DIYA_GL_CLIENT_NAME` |
| Workflow job `deploy-books` | `deploy.yml` | none by name | `deploy-diya-gl` |
| Response headers policy `{prefix}-books-whp` | `EdgeStack.java` | none by name | `{prefix}-diya-gl-whp` |
| API routes `/api/v1/books`, `/api/v1/books/{bookId}`, `/api/v1/books/{bookId}/versions/{version}` | the path strings in `SubmitSharedNames.java` (3086, 3108, 3134, 3155), not `SubmitApplication.java`; the CloudFront behaviour `/api/v1/books/*` in `EdgeStack.java:922`; the Express registrations in `app/functions/books/*.js`; the licensing pattern `^/api/v1/books.*` in `web/public/submit.catalogue.toml:411`; `web/public/docs/api/openapi.json`, which `OpenApiGenerator.java` writes from `SubmitSharedNames` | `public/books/cloud.js` hardcodes calls to all four paths at lines 805, 842, 881, 974 | `/api/v1/diya-gl` paths, confirmed shared interface both sides. `s3BooksRepository.js`'s `users/{hash}/books/{bookId}/` is an S3 key prefix, not a route: that is the data noun and it stays. |
| Lambda function names `{deployment}-app-books-{list-get,version-get,put,delete}` and their handler paths `app/functions/books/books*.ingestHandler` | derived in `SubmitSharedNames.java` (3089-3096, 3111-3119, 3137-3144, 3158-3167) by `ResourceNameUtils.convertCamelCaseToDashSeparated`, so the module basename is the function name | none by name | `{deployment}-app-diya-gl-{list-get,version-get,put,delete}`, handlers `app/functions/diyaGl/diyaGl*.ingestHandler` |
| Cognito callback and logout URLs `https://{host}/books/`, `/books/{bst,se,taxi,ltd}.html` | `IdentityStack.java:459-472` (`BOOKS_PAGE_NAMES`, `buildBooksUrls`) | the pages themselves, `web/spreadsheets.diyaccounting.co.uk/public/books/**` | follows whatever path NM-3 moves the pages to; Cognito matches each URL exactly, so both sets are listed across the move |
| Lambda env vars `BOOKS_BUCKET_NAME`, `BOOKS_MAX_BYTES`, `BOOKS_MAX_PER_USER`, `BOOKS_VERSIONS_KEPT`, `BOOKS_ENTITLEMENT_ENFORCED`, `BOOKS_BUNDLE_ID` | set in `BooksStack.java` (112-114, 196-205), read in `s3BooksRepository.js`, `booksPut.js`, `booksEntitlement.js`, `booksCors.js` and their tests | none | the `DIYA_GL_` forms |
| Composite alarm `{deployment}-app-books-stack-health` | the `"books"` short name passed to `Lambda.stackHealthAlarm` in `BooksStack.java:294` | none | `{deployment}-app-diya-gl-stack-health` |

## Decision: the format stamp

Decided by the operator on 2026-09-09: the DIYA-GL file format stamp `"diya-gl-books"` /
`"diya-gl-books/1"` becomes `"diya-gl"` / `"diya-gl/1"`. The writer emits the new stamp; the reader
accepts both the new stamp and the two old ones, so every file saved so far still opens; the
generated provenance data and the checked-in `examples/parity/*/report.json` follow at the next
generate run. This lands in NM-4 (spreadsheets); nothing in Submit reads the stamp.

## Decision: the API route prefixes

Decided by the operator on 2026-09-10: both `/api/v1/books/*` and `/api/v1/diya-gl/*` are served
permanently. The old prefix is never retired, and the spreadsheets repository's `cloud.js` keeps
calling `/api/v1/books` — it does not need to change, now or later. The route path is a code
identifier customers never see. Retiring it bought only tidiness, and the cross-repo sequencing it
needed cost more than that tidiness was worth. Serving both permanently removes the sequencing
surface between the two repositories entirely.

## Class 4 design: order, windows and the bucket

Read from the code and from the live accounts on 2026-09-09. Four facts settle almost everything.

**App stacks are per deployment set, not per environment.** `.github/actions/get-names` builds a
deployment name of `prod-<sha7>` or `ci-<branch><hash>`, and `SubmitSharedNames` builds every app
resource name from it. Prod today runs `prod-15f3483-app-BooksStack`, the four Lambdas
`prod-15f3483-app-books-{list-get,version-get,put,delete}` and the headers policy
`prod-15f3483-app-books-whp`. A deploy of a new commit builds a complete new set beside the live
one, proves it, cuts traffic over and retires the old set. So renaming anything held in an app
stack never replaces a live resource. The next set is simply built with the new names. There is no
window, no migration and nothing to copy.

**`BooksStack` holds no state.** `list-stack-resources` on `prod-15f3483-app-BooksStack` returns 37
resources: four Lambda functions, four roles, four policies, four aliases, four versions, four log
groups, four metric filters, eight alarms, one composite alarm and the CDK metadata. No bucket, no
table, no parameter, no queue. Replacing it costs that set's four log groups, and the rotation
already pays that cost on every deploy. The S3 bucket is in `DataStack`; the Cognito client and the
SSM parameter are in `IdentityStack`; the API routes and the JWT authoriser are in `ApiStack`; the
CloudFront behaviour and the headers policy are in `EdgeStack`.

**Env stacks do update in place.** `{env}-env-IdentityStack`, `{env}-env-DataStack` and
`{env}-env-BackupStack` are one per environment. Every identifier that needs care lives in one of
those three, plus the route paths, which are an interface the spreadsheets pages call.

**The prod bucket is empty.** `list-object-versions` on `prod-env-books-972912397388` returns no
versions and no delete markers. `ci-env-books-367191799875` holds only behaviour-run test objects.

### The classes of change

- **set** — an app-stack identifier. The next deployment set is built with the new name. No window.
- **in-place** — an env-stack property that updates without replacing its resource, or an
  identifier no other repository or deployed resource reads.
- **dual** — both names live at once for a stated window, then the old one goes.
- **permanent** — both names are served forever. There is no retirement step.
- **replace** — the resource is deleted and recreated. Only the S3 bucket is in this class.

### Every identifier, its class and its row

| Identifier | New name | Who else consumes it | Class | Row |
|---|---|---|---|---|
| `BooksStack`, `booksStackId`, `BooksStackTest.java` | `DiyaGlStack`, `diyaGlStackId`, `DiyaGlStackTest.java` | nobody | set | S3b |
| Lambda names `{deployment}-app-books-*` and handlers `app/functions/books/books*.ingestHandler` | `-diya-gl-*`, `app/functions/diyaGl/diyaGl*.ingestHandler` | nobody | set | S3b |
| `BOOKS_ALLOWED_ORIGINS` | `DIYA_GL_ALLOWED_ORIGINS` | nobody; the value is a list of spreadsheets origins and does not change | set | S3b |
| `BOOKS_BUCKET_NAME`, `BOOKS_MAX_BYTES`, `BOOKS_MAX_PER_USER`, `BOOKS_VERSIONS_KEPT`, `BOOKS_ENTITLEMENT_ENFORCED`, `BOOKS_BUNDLE_ID` | the `DIYA_GL_` forms | nobody | set | S3b |
| `BOOKS_STACK_NAME` | `DIYA_GL_STACK_NAME` | `selfDestruct.js`, in the same image as the stack that sets it | set | S3b |
| CFN outputs `BooksApiBaseUrl`, `Books{ListGet,VersionGet,Put,Delete}LambdaArn` | the `DiyaGl` forms | nobody | set | S3b |
| Response headers policy `{deployment}-app-books-whp` | `-diya-gl-whp` | nobody | set | S3b |
| Composite alarm `{deployment}-app-books-stack-health` | `-diya-gl-stack-health` | nobody | set | S3b |
| `cdk.json` key `booksUserPoolClientId` | `diyaGlUserPoolClientId` | nobody | in-place | S3b |
| `COGNITO_BOOKS_CLIENT_ID` | `COGNITO_DIYA_GL_CLIENT_ID` | five workflows in this repository, all changed in the same commit | in-place | S3b |
| lookup-resources output `cognito-books-client-id`, shell var `BOOKS_CLIENT_NAME` | `cognito-diya-gl-client-id`, `DIYA_GL_CLIENT_NAME` | four workflows in this repository | in-place | S3b |
| Workflow job `deploy-books` | `deploy-diya-gl` | `deploy-api`'s `needs:`, same file | in-place | S3b |
| Literal `${DEPLOYMENT}-app-BooksStack` in `deploy.yml`, `destroy-ci.yml`, `destroy-prod.yml`, `stack-drift.yml` | `-app-DiyaGlStack` | the sets already deployed under the old name | dual | S3b adds, S3e removes |
| Cognito client display name `{env}-env-books-client` | `{env}-env-diya-gl-client` | `lookup-resources/action.yml` finds the client by this exact name | in-place | S3c |
| CFN output `BooksUserPoolClientId` | `DiyaGlUserPoolClientId` | `toggle-cognito-native-auth.js`, `probe-test.yml` via `stack-output.js` | dual | S3c adds, S3d removes |
| SSM parameter `/submit/{env}/spreadsheets-books-app-client-id` | `spreadsheets-diya-gl-app-client-id` | no workflow or script in either repository | in-place | S3c |
| `--client books` flag | `--client diya-gl` | the spreadsheets ci run, once their LP-24 lands | dual | S3c adds, S3d removes |
| Routes `/api/v1/books`, `/api/v1/books/{bookId}`, `/api/v1/books/{bookId}/versions/{version}` | the `diya-gl` forms, added beside the `books` forms | `cloud.js` on the spreadsheets site, including copies held by installed service workers | permanent | S3d |
| Cognito callback and logout URLs under `/books/` on the spreadsheets hosts | whatever path their NM-3 moves the pages to | the pages themselves | dual | S3d |
| S3 bucket `{env}-env-books-{account}`, `booksBucketName`, `booksBucketArn`, output `BooksBucketName` | `{env}-env-diya-gl-{account}` and the `diyaGl` forms | `BackupStack`'s selection ARN | replace | S3e |

The S3 key prefix `users/{hash}/books/{bookId}/` in `s3BooksRepository.js`, and the matching IAM
patterns `arn:aws:s3:::{bucket}/users/*/books/*`, are the data noun. They stay.

### The order, and why this one

**S3b, then S3c, then S3d, then S3e.**

S3b first because nothing outside this repository can see any of it. Every identifier in it is
either an app-stack name that the next deployment set simply carries, or a workflow-internal name
changed in the same commit as its only reader. It lands on a ci set, is proved there, and reaches
prod through one deploy of main. Doing it first also shrinks S3c and S3d down to only the parts
that need another party.

S3c second because it is the env-stack half of the client story, and every name it introduces has
to exist in a deployed stack before anything reads it. It is one `deploy-environment` run per
environment. It is deliberately before S3d so the spreadsheets side makes a single change and a
single deploy covering both the flag and the paths, rather than two.

S3d third because it is the only row whose old names are held by software this repository does not
deploy. It closes the two windows S3c opened as well.

S3e last because it is the one row that touches stored data, and the only row that can legitimately
stop. If a re-check finds objects in the prod bucket, S3e stops and the copy sequence below runs
instead, and nothing else waits on it. S3e also drops the `BooksStack` line from the destroy and
drift workflows, once no deployment set carries a stack of that name.

### The dual windows

Each window is named by the deploy that closes it, not by a duration.

**The `BooksStack` literal in `destroy-ci.yml`, `destroy-prod.yml` and `stack-drift.yml`.** Both
names are listed. Both helpers already skip a stack that does not exist (`delete_stack_in_region`
resolves `DOES_NOT_EXIST` and returns; `detect_drift` prints `SKIPPED (stack not found)`), so the
extra line costs one describe call. Our side switches first, in S3b's own commit. The old line goes
in S3e, and what proves it unused is
`aws cloudformation list-stacks --query "StackSummaries[?ends_with(StackName,'-app-BooksStack')]"`
returning nothing in ci and in prod.

**The CFN output `BooksUserPoolClientId`.** `IdentityStack` emits both keys from S3c. The stack side
switches first: S3c's env deploy has to complete before `toggle-cognito-native-auth.js` and
`probe-test.yml` move to the new key, or a run between the two reads a key its stack does not have.
The old key goes in S3d. What proves it unused is that no file in this repository names
`BooksUserPoolClientId`, which is a grep, since both readers are ours.

**The `--client books` flag.** `toggle-cognito-native-auth.js` accepts `books` and `diya-gl` as the
same value from S3c. The spreadsheets ci run switches to `--client diya-gl`. The `books` spelling
goes in S3d. What proves it unused is that the spreadsheets workflow file names `diya-gl`. Their
LP-24 row, which adds the only call site, is in flight and has not landed: if it lands after S3c it
should be written as `--client diya-gl` from the start and this window never opens.

**The API routes.** All four paths are served under both prefixes from S3d's first deploy. Both
prefixes stay served forever. See "Decision: the API route prefixes" above.

**The Cognito callback and logout URLs.** Cognito matches each URL exactly, so both the `/books/`
set and the new set are listed in `buildBooksUrls` while the spreadsheets pages move. Their side
switches last here, because a URL has to be registered before a page can redirect to it. The old
set goes once their pages no longer live under `/books/` and their redirects are in place. This is
the one window driven by their NM-3 rather than by anything else in this table.

### The mechanism for serving both route paths

`ApiStack.createRouteForLambda` builds one route per `AbstractApiLambdaProps` entry and keys its
construct ids off method plus path, so a second entry for the same function with a different
`urlPath` produces a second route on the same integration with no id collision. S3d serves both
prefixes permanently by giving the DIYA-GL stack's `lambdaFunctionProps` eight entries instead of
four, the extra four differing only in `urlPath`. `EdgeStack` gains a second, permanent CloudFront
behaviour `/api/v1/diya-gl/*` on the same policies. `submit.catalogue.toml`'s licensing pattern is
`^/api/v1/(books|diya-gl).*`. `openapi.json` is generated by `OpenApiGenerator` from
`SubmitSharedNames`, so it follows on the next `mvnw` run and is never hand-edited.

### The bucket: renamed

The bucket is renamed to `{env}-env-diya-gl-{account}`, in S3e, with no data copy.

`bucketName` is a replacement property on `AWS::S3::Bucket`, so `DataStack`'s update creates the new
bucket and deletes the old one, and the old one's objects go with it because `DataStack.java:646`
sets `removalPolicy(DESTROY)` and `autoDeleteObjects(true)`. That is safe here because prod holds
nothing: `aws --profile submit-prod s3api list-object-versions --bucket prod-env-books-972912397388`
returns an empty result, no current versions and no delete markers. The paid DIYA-GL storage tier
has no stored data yet. The ci bucket holds only objects that behaviour runs create and delete.

Everything else follows the CDK code in the same commit: the lifecycle rules
(`abort-incomplete-uploads`, `expire-noncurrent-versions` at 30 days), versioning, SSL enforcement
and the public-access block are properties of the new bucket, and `BackupStack.java:306` builds its
backup selection ARN from `sharedNames.booksBucketName`, so the AWS Backup selection follows the
rename with no separate step. The DIYA-GL stack builds its four IAM patterns from the same name.

S3e's sequence:

1. Re-run `list-object-versions` against the prod bucket. If it returns anything at all, stop the
   row and report, and run the copy sequence below instead.
2. Rename `booksBucketName` in `SubmitSharedNames.java`, the construct id and output in
   `DataStack.java`, the ARN variable in `BackupStack.java`, and the props and IAM patterns in the
   DIYA-GL stack, with their tests.
3. Deploy the environment stacks to ci. Run the renamed DIYA-GL behaviour project against ci and
   confirm a save, a list, a version read and a delete against the new bucket.
4. Confirm the ci backup selection lists the new bucket ARN:
   `aws --profile submit-ci backup get-backup-selection`.
5. Deploy to prod and repeat the backup-selection check there.
6. Delete the `${DEPLOYMENT}-app-BooksStack` lines from `destroy-ci.yml`, `destroy-prod.yml` and
   `stack-drift.yml` once no set of that name remains.

If step 1 finds objects, the row instead becomes: add the new bucket to `DataStack` beside the old
one; `aws s3 sync` the old bucket to the new; add the new bucket ARN to the backup selection beside
the old one; point the DIYA-GL Lambdas at the new bucket and deploy a set; verify a list and a
version read return the copied objects; take one on-demand backup of the new bucket and confirm the
recovery point; then remove the old bucket from `DataStack`, which empties and deletes it.

### What the spreadsheets repository has to do, and when

Two cut-over points. Each waits for a deploy of ours, not for a merge. `cloud.js` keeps calling
`/api/v1/books` — the routes are permanent, so there is nothing to change there.

1. **After S3c reaches prod**: if their LP-24 step exists by then, change
   `toggle-cognito-native-auth.js ... --client books` to `--client diya-gl`. If LP-24 has not landed
   yet, write it as `--client diya-gl` from the start and there is nothing to change later.
2. **Around their own NM-3**, whenever they run it: tell us the new page paths before they deploy
   them, so `IdentityStack.buildBooksUrls` can register both sets of callback and logout URLs first.
   Cognito rejects a redirect to a URL it does not hold, so their pages cannot move ahead of our env
   deploy.

Two things they do not need to do. The Cognito client id does not change: S3c keeps the CDK
construct id `{env}-env-BooksUserPoolClient` and changes only the client's display name, which is a
no-interruption property, so prod stays `1c8hjrjp5g5ipm8o47t6qkks4r` and the hardcoded value in
`cloud-config.js` keeps working. Renaming that construct id would replace the client, mint a new id,
break every live session and need a coordinated release on both sides for no functional gain; it
stays as it is until someone wants to pay that, and a CloudFormation resource import is the path if
they do. And `BOOKS_ALLOWED_ORIGINS` becoming `DIYA_GL_ALLOWED_ORIGINS` changes only our variable
name: the origins it lists are unchanged, and an origin carries no path, so their page moves do not
touch it.

### Where the row boundary sits between NM-S2 and S3b

`SubmitSharedNames` derives each Lambda's function name from its handler's module basename through
`ResourceNameUtils.convertCamelCaseToDashSeparated`, so `booksListGet.ingestHandler` becomes
`{deployment}-app-books-list-get`. Renaming the four modules under `app/functions/books/` therefore
renames four deployed Lambdas and forces edits to `SubmitSharedNames.java` and the DIYA-GL stack.
So NM-S2 leaves `app/functions/books/` and its four unit tests alone, and S3b moves them with the
infra that names them. NM-S2 keeps `s3BooksRepository.js`, `booksCors.js`, `booksEntitlement.js`,
the system and behaviour tests, the npm scripts and the Playwright project, none of which any infra
file names.

## Rows

Model tiers: Haiku for class 1 prose sweeps; Sonnet for classes 2 and 3; Opus to design class 4,
then Sonnet to carry out that design.

### Spreadsheets (this repository's board)

| Id | Class | Model | Precursors | Files |
|---|---|---|---|---|
| NM-2 | 1, prose | Haiku | none | the 16 files in the spreadsheets class 1 table above, plus the 46 test files' titles |
| NM-3 | 2, public paths | Sonnet | none | `public/books/**`, `public/download.html`, `app/bin/build-diya-gl-spec.js`, `app/lib/app-resources.js`, `redirects.toml`, the CloudFront function |
| NM-4 | 3, same-repo code | Sonnet | none | `app/lib/books-engine.js`, `app/lib/books-interchange.js`, `scripts/build-books-bundle.mjs`, the 46 test filenames, `public/download.html`'s DOM ids, `public/books/books-events.js`, `public/books/books.css`, and the `"diya-gl-books"` format-string special case (needs a version bump and a back-compat reader) |
| NM-5 | 4, cross-repo | Opus (design), then Sonnet | NM-S3 | `PLAN_DIYA_GL_CLOUD_PAGE.md`, `NEXT.md`'s LP-24 row, against the shared class-4 table above |

### Submit (Submit's NEXT.md)

| Id | Class | Model | Precursors | Files |
|---|---|---|---|---|
| NM-S1 | 1, prose | Haiku | none | `PLAN_ITSA_PHASE_2.md`, `PLAN_DIYA_GL_STORAGE.md`, `PLAN_SUBMISSION_MCP.md`, `PLAN_ONE_STOP_DASHBOARD.md`, `NEXT.md`, `email.txt`, `app/functions/billing/billingReturnUrl.js` |
| NM-S2 | 3, same-repo code | Sonnet | none | `app/data/s3BooksRepository.js`, `app/lib/booksCors.js`, `app/services/booksEntitlement.js`, `app/system-tests/booksStorage.system.test.js`, the unit tests for those, `behaviour-tests/books.behaviour.test.js`, `package.json`, `playwright.config.js`. Not `app/functions/books/`: its module basenames are the deployed Lambda names, so those four modules and their unit tests move in S3b |
| NM-S3 | 4, cross-repo | Sonnet, per the class 4 design above | NM-5 | splits into S3b to S3e. S3b: `BooksStack.java`, `SubmitSharedNames.java`, `SubmitApplication.java`, `SelfDestructStack.java`, `EdgeStack.java`'s headers policy, `cdk-application/cdk.json`, the workflow YAMLs, `lookup-resources/action.yml`, `app/functions/books/`. S3c: `IdentityStack.java`, `scripts/toggle-cognito-native-auth.js`, `probe-test.yml`. S3d: the route paths in `SubmitSharedNames.java`, `EdgeStack.java`, `app/functions/diyaGl/*`, `submit.catalogue.toml`, `openapi.json`, plus `IdentityStack.buildBooksUrls`. S3e: `DataStack.java`, `BackupStack.java`, `SubmitSharedNames.java` |

The Submit rows (NM-S1 to NM-S3) are blocked on busy: the Submit repository takes no board item
into flight until the operator lifts the pause.

This plan is read by both repositories' sessions. The spreadsheets board carries NM-2 to NM-5;
Submit's `NEXT.md` carries NM-S1 to NM-S3. Landings are reported through
`~/.claude/inboxes/spreadsheets.md` and `~/.claude/inboxes/submit.md`.
