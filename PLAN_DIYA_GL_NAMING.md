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

Class 4 is one shared list: 16 identifiers once both sides are merged. See below.

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
| `BooksApiBaseUrl` (CFN output) | `BooksStack.java` | none by name | `DiyaGlApiBaseUrl` |
| `BooksUserPoolClientId` (CFN output) | `BooksStack` outputs, `IdentityStack.java` | named exactly in a comment, `web/spreadsheets.diyaccounting.co.uk/public/books/cloud-config.js:9` | `DiyaGlUserPoolClientId` |
| Cognito client name `-books-client` / `{env}-env-books-client` | `IdentityStack.java`, `.github/actions/lookup-resources/action.yml` | toggled from this side per `NEXT.md`'s LP-24 row | `-diya-gl-client` |
| `--client books` flag | `scripts/toggle-cognito-native-auth.js` | `NEXT.md` LP-24 documents calling the script this way | `--client diya-gl` |
| SSM parameter `/submit/{env}/spreadsheets-books-app-client-id` | `IdentityStack.java`, `SubmitApplication.java` | none by name | `/submit/{env}/spreadsheets-diya-gl-app-client-id` |
| `cdk.json` key `booksUserPoolClientId` | `cdk-application/cdk.json` | none by name | `diyaGlUserPoolClientId` |
| `booksBucketName` / `booksBucketArn`, S3 bucket `{prefix}-books-{account}` | `DataStack.java`, `SubmitSharedNames.java`, `BackupStack.java`, its test | none by name | `diyaGlBucketName` / `diyaGlBucketArn`, bucket `{prefix}-diya-gl-{account}` |
| `booksStackId` field | `SubmitSharedNames.java` | none by name | `diyaGlStackId` |
| `BOOKS_STACK_NAME` (Lambda env var) | `SelfDestructStack.java`, `selfDestruct.js`, its test | none by name | `DIYA_GL_STACK_NAME` |
| `COGNITO_BOOKS_CLIENT_ID` (workflow env var) | `deploy.yml`, `destroy-ci.yml`, `destroy-prod.yml`, `deploy-cdk-stack.yml`, `probe-test.yml`, `SubmitApplicationCdkResourceTest.java` | none by name | `COGNITO_DIYA_GL_CLIENT_ID` |
| GH Action output `cognito-books-client-id` / `BOOKS_CLIENT_NAME` | `.github/actions/lookup-resources/action.yml` | none by name | `cognito-diya-gl-client-id` / `DIYA_GL_CLIENT_NAME` |
| Workflow job `deploy-books` | `deploy.yml` | none by name | `deploy-diya-gl` |
| Response headers policy `{prefix}-books-whp` | `EdgeStack.java` | none by name | `{prefix}-diya-gl-whp` |
| API routes `/api/v1/books`, `/api/v1/books/{bookId}`, `/api/v1/books/{bookId}/versions/{version}` | `EdgeStack.java`, `SubmitApplication.java`, `openapi.json`, `submit.catalogue.toml`, `app/functions/books/*`, `s3BooksRepository.js` | `public/books/cloud.js` hardcodes calls to all four paths at lines 805, 842, 881, 974 | `/api/v1/diya-gl` paths, confirmed shared interface both sides |

## Rows

Model tiers: Haiku for class 1 prose sweeps; Sonnet for classes 2 and 3; Opus to design class 4,
then Sonnet to carry out that design.

### Spreadsheets (this repository's board)

| Id | Class | Model | Precursors | Files |
|---|---|---|---|---|
| NM-2 | 1, prose | Haiku | none | the 16 files in the spreadsheets class 1 table above, plus the 46 test files' titles |
| NM-3 | 2, public paths | Sonnet | none | `public/books/**`, `public/download.html`, `app/bin/build-diya-gl-spec.js`, `app/lib/app-resources.js`, `redirects.toml`, the CloudFront function |
| NM-4 | 3, same-repo code | Sonnet | none | `app/lib/books-engine.js`, `app/lib/books-interchange.js`, `scripts/build-books-bundle.mjs`, the 46 test filenames, `public/download.html`'s DOM ids, `public/books/books-events.js`, `public/books/books.css`, and the `"diya-gl-books"` format-string special case (needs a version bump and a back-compat reader) |
| NM-5 | 4, cross-repo | Opus (design), then Sonnet | NM-S3 | `public/books/cloud.js`, `PLAN_DIYA_GL_CLOUD_PAGE.md`, `NEXT.md`'s LP-24 row, against the shared class-4 table above |

### Submit (Submit's NEXT.md)

| Id | Class | Model | Precursors | Files |
|---|---|---|---|---|
| NM-S1 | 1, prose | Haiku | none | `PLAN_ITSA_PHASE_2.md`, `PLAN_DIYA_GL_STORAGE.md`, `PLAN_SUBMISSION_MCP.md`, `PLAN_ONE_STOP_DASHBOARD.md`, `NEXT.md`, `email.txt`, `app/functions/billing/billingReturnUrl.js` |
| NM-S2 | 3, same-repo code | Sonnet | none | `app/data/s3BooksRepository.js`, `app/functions/books/`, `app/lib/booksCors.js`, `app/services/booksEntitlement.js`, `app/system-tests/booksStorage.system.test.js`, the unit tests, `behaviour-tests/books.behaviour.test.js`, `package.json`, `playwright.config.js` |
| NM-S3 | 4, cross-repo | Opus (design), then Sonnet | NM-5 | `BooksStack.java`, `EdgeStack.java`, `IdentityStack.java`, `DataStack.java`, `BackupStack.java`, `SelfDestructStack.java`, `SubmitSharedNames.java`, `SubmitApplication.java`, `cdk.json`, the workflow YAMLs, `lookup-resources/action.yml`, `openapi.json`, `submit.catalogue.toml`, against the shared class-4 table above |

The Submit rows (NM-S1 to NM-S3) are blocked on busy: the Submit repository takes no board item
into flight until the operator lifts the pause.

This plan is read by both repositories' sessions. The spreadsheets board carries NM-2 to NM-5;
Submit's `NEXT.md` carries NM-S1 to NM-S3. Landings are reported through
`~/.claude/inboxes/spreadsheets.md` and `~/.claude/inboxes/submit.md`.
