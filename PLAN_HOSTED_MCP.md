<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: The hosted MCP launched on prod

## Operator assertions (verbatim)

> "The changes I want are: The FSB offer chain, the donators offer chain, the CT in prod chain." (operator, 2026-11-24)

The operator asked to keep only those three chains and the defects on `NEXT.md`. This plan holds the tasks that left it.

> "yes" (operator, 2026-11-28, to MCP7 and MCP8: the connector gives the assistant HMRC and Companies House rules and rates with their sources, help from the Submit guide and the diya-gl knowledge base, and the DIYA-GL book format, through read-only tools.)

> "Yes" (operator, 2026-11-28, to MCP5 and MCP6: a cloud book started from the Companies House register, and links to the filled-in accounts and CT600 forms, so that a chat assistant can take a limited company from the register to its accounts and Company Tax Return.)

> "Yes" (operator, 2026-11-28, to: add diya-gl's bookkeeping tools to Submit's hosted connector, read tools first after ODSC1, then a design for write tools with cloud save and undo, then its build; one connector for the customer, with diya-gl's local stdio server kept for books on disk.)

Recorded in MCP1's row: the operator approved the launch on 2026-11-22, each tool going on prod's connector when its journey is live on prod; the listings go ahead with the VAT tool set (operator, 2026-11-12); source operator, 2026-10-30.

## Goal

Prod's hosted MCP connector offers each filing tool as its journey goes live, with the harness behind an operator-only activity and the listings current.

**Status**: 8 open tasks (MCP1, MCP2, MCP4 to MCP9), each boarded on `NEXT.md` with this plan's section as its brief (operator, 2026-11-28).

## Facts the tasks share

`hostedToolNames` (`mcp/lib/hosted-tools.js` line 95) serves `PROD_HOSTED_TOOL_NAMES` on prod and to the reviewer group, and `HOSTED_TOOL_NAMES` everywhere else. MCP2 and MCP4 to MCP8 register their tools in `HOSTED_TOOL_NAMES` only and merge to `main` with prod's scanned tool set unchanged; MCP9 moves them onto prod after OpenAI approves 0.1.7 (ODSC1). A page or route these tasks add is linked from no prod page until MCP9. The harness page `web/public/mcp-harness.html` loads scripts from `web/public/mcp-harness/<name>.json` (`?script=<name>`); its call endpoint `/api/v1/dev/mcp-harness/call` exists on the local Express server only (`app/bin/server.js`), so a harness proof runs locally (MCP1). The hosted MCP tools read the session's HMRC grant through `hmrcGrantFor` in `mcp/lib/submit-tools.js` (line 167) (MCP1). Prod's hosted connector has eleven tools, `prepare_vat_return` and `derive_company_tax_return` among them (`PROD_HOSTED_TOOL_NAMES` in `mcp/lib/hosted-tools.js`, line 70). The availability facts: `web/public/mtd-calendar.html` is generated. Its availability table is `AVAILABILITY` in `scripts/build-mtd-calendar.mjs` (line 128) and its dates come from `.claude/skills/tax-sources/sources`, so a change edits those and runs `npm run build:mtd-calendar`.

## Tasks

| Label | Class | State | Blocked by | Unblocks | Repository |
| --- | --- | --- | --- | --- | --- |
| MCP1 | machine-only | blocked | UH1, UH3 (`PLAN_ITSA_APPROVAL.md`) | nothing | submit |
| MCP2 | machine-only | ready | nothing | MCP4, MCP6, MCP9 | submit |
| MCP4 | machine-only | ready (after MCP2, same worker) | nothing | MCP5, MCP9 | submit |
| MCP5 | machine-only | ready (after MCP4, same worker) | nothing | MCP9 | submit |
| MCP6 | machine-only | ready | nothing | MCP9 | submit |
| MCP7 | machine-only | ready | nothing | MCP9 | submit |
| MCP8 | machine-only | ready | nothing | MCP9 | submit |
| MCP9 | machine-only | blocked | ODSC1 (`NEXT.md`); MCP2, MCP4 to MCP8 proved on ci | nothing | submit |

Model, size and repository are in each entry. "Blocked by" lists the tasks and events not yet done.

## Briefs

### MCP1. The hosted MCP launched on prod: every tool, the harness, and the listing

Prod's hosted tools are `PROD_HOSTED_TOOL_NAMES` in `mcp/lib/hosted-tools.js` (line 70): the book tools, the VAT, accounts and Company Tax Return derivations, `prepare_vat_return`, `company_filing_deadlines` and the stored receipts. `web/public/mcp-harness.html` is behind the page guard. MCP1 widens both and launches the MCP: each tool beyond VAT enabled on prod as the journey it files goes live (Income Tax, `PLAN_ITSA_APPROVAL.md` UH3; practice, UH1; the CT600 journey is live on prod, and its derivation tool is on prod's connector), the harness on prod behind an operator-only activity, each tool's entry back on `web/public/mcp.html`, which lists only prod's tools, the accounts and confirmation statement tools renamed from `*_sandbox` now that RL2d lists them on prod's MCP page, and each of those tools added to the connector's directory listings as it goes live (the listings themselves go ahead with the VAT tool set, operator 2026-11-12: `PLAN_ORGANIC_SEARCH.md` rows OOS17 and OOS18); the availability table and dates on `web/public/mtd-calendar.html` change in the same change. Blocked on: UH1 and UH3 (`PLAN_ITSA_APPROVAL.md`) for the tools. The operator approved the launch on 2026-11-22: each tool goes on prod's connector when its journey is live on prod. **Source**: operator, 2026-10-30. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files. **Class**: machine-only. **State**: blocked. **Blocked by**: UH1, UH3 (`PLAN_ITSA_APPROVAL.md`). **Unblocks**: nothing.

### MCP2. diya-gl's read tools on the hosted connector

Add diya-gl's read tools `report`, `trial_balance`, `checks`, `lines`, `chart` and `book` (`TOOLS` in `../spreadsheets.diyaccounting.co.uk/app/lib/mcp/diya-gl-tools.js`) to the hosted connector, each against the session's book that `open_book` loads (`mcp/lib/book-tools.js` `openBook`, the cloud branch at line 181). Submit's `mcp/` already depends on `@diy-accounting-uk/diya-gl` (1.2.99, `mcp/package.json` line 37), so the engine is in process. Register them in `mcp/lib/server.js`, add them to `HOSTED_TOOL_NAMES` (`mcp/lib/hosted-tools.js`, line 24) with the `READS` annotation, and update `mcp/test/hosted-tools.test.js` (prod's set unchanged) and `mcp/test/plugin.test.js` (the skill calls exactly prod's tools). Wording: "your records", "DIYA-GL book", never "your books". Register in `HOSTED_TOOL_NAMES` only; MCP9 moves the tools onto prod after OpenAI approves 0.1.7 (ODSC1), because OpenAI scans prod's tool set every day. The ChatGPT listing text changes only by a new ZIP and review: the subtitle can then claim bookkeeping (the "accounting software" search of 2026-11-28 shows Nella Finance AI and Vibooks with "bookkeeping" in their subtitles, and DIY Accounting Submit absent). Gates: `npm ci` then `npm test` in `mcp/`. **Model**: Sonnet. **Size**: ~5 files.

### MCP4. Build: diya-gl's write tools on the hosted connector, with a save and an undo

The store is the DIYA cloud book only (operator, 2026-11-28). The design below is the brief (written by the design task on 2026-11-28 from `origin/main` 0e58c1ebb). Two choices it left are decided: the tools that create a new cloud book (`new_book`, `new_book_from_register`, `roll_forward`) take a new `ADDS_OUTSIDE` annotation, `annotations(false, false, true)` beside `ADDS` in `mcp/lib/tool-annotations.js`, because they add a book and change none; and the Submit web client reaches the cloud book routes by joining `cloudBookAudience` (`infra/main/java/co/uk/diyaccounting/submit/stacks/ApiRoutes.java` line 89), because those routes authorise by `sub` and a books token still never reaches the VAT routes. Register in `HOSTED_TOOL_NAMES` only and link the page from no prod page; MCP9 moves the tools onto prod with a new plugin version and its review. **Model**: Sonnet. **Size**: ~16 files.

Base: `origin/main` 0e58c1ebb. Engine: `@diy-accounting-uk/diya-gl` 1.2.99 (`mcp/package.json` line 37, root
`package.json` line 412). Every figure below comes from a command run on this branch; the scripts are under
"Measurements".

#### 1. What the hosted server has to work around

1. The hosted Lambda keeps no book in memory between calls. `app/functions/mcp/mcpHttp.js` stores the
   session's cloud pointer `{bookId, clientId, etag}` (lines 307, 324 to 329) and reopens the book from it on
   every request (`loadStoredBook`, line 191, with a warm cache keyed `sub:bookId:etag`, line 168). An edit
   kept only in `session.book` is therefore lost on the next call. **Every hosted write saves before it
   answers**, and the pointer then carries the new etag, which `mcpHttp.js` already persists (lines 324 to
   329). `mcpHttp.js` needs no change.
2. The store is the DIYA cloud book (operator decision). `saveCloudBook` (`mcp/lib/book-tools.js` line 296)
   sends `if-match` with the session's etag; `diyaGlPut.js` refuses a stale etag with 412 `etag-mismatch`
   (lines 320 to 345), so a write never overwrites a change made meanwhile on the spreadsheets site.
3. Every PUT is a new version. `diyaGlPut.js` keeps `DIYA_GL_VERSIONS_KEPT` = 30 versions
   (`DiyaGlStack.java` line 262; trimming at `diyaGlPut.js` lines 171 to 176), and
   `GET /api/v1/books/{bookId}/versions/{version}` (`diyaGlVersionGet.js` line 41) reads any kept version.
   Undo is built on those two: no new storage.
4. diya-gl's own tools (`TOOLS` in
   `node_modules/@diy-accounting-uk/diya-gl/dist/app/lib/mcp/diya-gl-tools.js`, line 412) answer the whole
   book and lines (`edit_lines` returns `book`, `lines`, `linesJsonl` and the full report). A 736-line year
   is 207,522 bytes of lines JSON alone. The hosted tools answer a summary, `movedFigures` and the checks,
   never the lines; `lines` and `report` (MCP2's read tools) give detail on request.

#### 2. The tools

All six are `HOSTED_OVERRIDES` entries in `mcp/lib/hosted-tools.js`, each calling diya-gl's own handler and
then the cloud save; no engine code is copied. A new `undo_book_change` is added. "Summary" below is
`{bookId, version, product, entity, period: {start, end}, lineCount, bookChecks, failedChecks}`: the
`summarise` shape of `book-tools.js` line 118 plus `bookId` and `version`.

| Tool | Input | What it does | Output | Annotation |
| --- | --- | --- | --- | --- |
| `edit_lines` | `edits`: 1 to 50 of `{edit, params}`, `edit` one of diya-gl's 16 named edits (`addSaleLine`, `addPurchaseLine`, `addBankLine`, `addPayrollLine`, `changeLineAmount`, `removeLine`, `changeLinePostingDate`, `changeLineAccount`, `changeLineBankAccount`, `changeLineDetail`, `changeLineQuantity`, `setLineReference`, `changePayrollLine`, `setDividend`, `setMembers`, `setCharges`) | Requires an open cloud book (`session.cloud`). Runs diya-gl's `edit_lines` handler on an explicit `{book, lines}` copy, saves the result as the next version with `if-match`, and only then replaces the session's book | Summary, `previousVersion`, `movedFigures` (diya-gl's `diffFigures` output) | `CHANGES_OUTSIDE` |
| `new_book` | `product` (bst, taxi, se, ltd), `businessName`, `yearEnd` (YYYY-MM-DD), `vatRegistered?`, `clientId?` | diya-gl's `new_book`, then a PUT under a new `crypto.randomUUID()` bookId (the route's `BOOK_ID_PATTERN` is a v4 UUID, `s3DiyaGlRepository.js` line 27) with no `if-match` | Summary (version 1, lineCount 0) | `ADDS_OUTSIDE` (new) |
| `new_book_from_register` | `companyNumber`, `periodEnd?`, `clientId?` | Reads `GET /api/v1/public/company-register?number=` (`companiesHousePublicRegisterGet.js`, CH-22: profile, officers and the last filed iXBRL in the builder's names), reads the iXBRL with `readBookSource` for `lastAccounts` as `web/public/lib/company-books.js` `companyBooks` (line 71) does, calls diya-gl's `buildBookFromRegister`, saves a new book | Summary, `differences` | `ADDS_OUTSIDE` |
| `roll_forward` | `clientId?` | From the open cloud book: diya-gl's `roll_forward`, saved as a **new** bookId; last year's book is left as it was | Summary of the new book, `priorBookId`, `rollChecks` failures only | `ADDS_OUTSIDE` |
| `undo_book_change` | `toVersion?` (default: the version before the latest) | Reads the open book's metadata (`listBookMetadata`, `book-tools.js` line 141, gives `versions`), reads `toVersion` through the version route, PUTs its zip as the next version with `if-match` the latest etag. Undo is itself a version, so a second undo undoes the undo | Summary, `restoredVersion`, `previousVersion`, `movedFigures` between the two | `CHANGES_OUTSIDE` |
| `extract_book` | `clientId?` | Changes nothing. Answers the Submit page where the person uploads a spreadsheet, a package zip, a DIYA-GL zip or a book as JSON | `{uploadLink, instruction}` | `READS` |
| `save_workbook` | `format?` (xlsx, zip, diya-gl-zip, json; default xlsx, refused by name for a multi-workbook product as diya-gl does) | Changes nothing. Answers the Submit page link for the open book's current version | `{downloadLink, format, version, instruction}` | `READS` |

Annotations, against the plan's blanket `CHANGES_OUTSIDE`:

- `edit_lines` and `undo_book_change` replace the book's current version: `CHANGES_OUTSIDE`
  (`readOnlyHint` false, `destructiveHint` true, `openWorldHint` true). OpenAI: "Being able to undo an action
  does not, by itself, justify setting `destructiveHint` to `false`."
  (https://developers.openai.com/apps-sdk/app-submission-guidelines)
- The three tools that create a book replace nothing, so `destructiveHint` true would be a wrong annotation.
  Add `ADDS_OUTSIDE = annotations(false, false, true)` to `mcp/lib/tool-annotations.js`. The coordinator
  decides between this and the plan's `CHANGES_OUTSIDE` for all five.
- The comment on `CHANGES_OUTSIDE` (`tool-annotations.js` line 15, "Files, invites or hands out an
  authorisation at HMRC or Companies House") widens to "or changes the person's DIYA-GL book in their DIY
  Accounting Submit account".

A save that fails leaves the session on the version it had. A 412 answers: "The DIYA-GL book changed in your
account since it was opened. Open it again with open_book and make the change again." A 403
`book-limit-reached` (`DIYA_GL_MAX_PER_USER` = 20) answers that the account holds 20 DIYA-GL books and one
must be deleted on the spreadsheets site first. A 413 answers the size limit (section 3).

`save_book` stays off the hosted set (`NOT_HOSTED` in `mcp/test/hosted-tools.test.js` line 13), because
every hosted write saves.

#### 3. Size: a year of lines against the limits

The store refuses a zip over `DIYA_GL_MAX_BYTES` = 2,097,152 bytes (`DiyaGlStack.java` line 260,
`diyaGlPut.js` line 255). Measured with `writeDiyaGlZip` (book, lines, report, bookchecks: the bytes
`saveCloudBook` sends):

| Book | Lines | Lines JSON bytes | Stored zip bytes |
| --- | --- | --- | --- |
| `mcp/test/fixtures/precision-code-ltd-full` (a full company year) | 736 | 207,522 | 57,435 |
| the same lines repeated 20 times | 14,720 | 4,170,953 | 312,363 |
| the same, every amount and text field randomised (worst case) | 14,720 | 4,422,457 | 982,546 |

Worst case is about 62 zip bytes a line above a fixed 70 KB, so the cap holds about 32,000 lines; a
company year of 736 lines uses 3% of it. A tool call that would pass the cap answers the 413 before any
other step. The per-call limit is the edit count (50 edits a call), so one AI turn cannot add a year at
once.

Downloads are larger: the Company package zip of the 736-line year is 3,247,521 bytes (13 workbooks, the
largest `Purchases.xlsx` 958,807) and took 21.6 s to compose; the Self Employed package of 162 lines is
1,800,594 bytes. As base64 that is 4.3 MB against Lambda's 6 MB response limit, so the download route
writes the file to S3 and answers a presigned link (section 5).

#### 4. Undo and the version window

- Each write tool call is one version; a batch of 50 edits is one version, so one undo takes back the whole
  batch.
- 30 versions are kept. Thirty single-edit calls push out the version before them; `undo_book_change`
  refuses a `toVersion` no longer kept, naming the oldest kept.
- Each version records what made it. `validatePutBody` (`diyaGlPut.js` line 114) gains an optional
  `change: {tool, editCount?, restoredVersion?}` (tool one of the seven names here or `import`, numbers
  bounded), stored on the version entry (`versions.push`, line 171) and in the activity detail. The undo
  tool answers the list `[{version, createdAt, tool, editCount}]` in its error when `toVersion` is wrong, so
  the assistant can name what each version did.
- Sandbox retention (`SANDBOX_RETENTION_MS`, `expiresAt` in `attemptWrite`) is unchanged: the versions
  expire with the book.

#### 5. Upload and download on the Submit site

The Submit web client's token is not accepted on the cloud book routes: the books authoriser's audience is
the books client and the MCP client (`infra/main/java/co/uk/diyaccounting/submit/stacks/ApiRoutes.java`
lines 87 to 93). Two ways to reach them from a Submit page:

1. **Recommended**: add `userPoolClientId` to `cloudBookAudience` (line 89). The routes authorise by `sub`
   (`resolveOwnerPrefix`), so a Submit token reaches the same person's DIYA-GL books and nothing else; the
   comment's rule that a books token never reaches the VAT routes stands.
2. Proxy every book call through a new route on the main authoriser. More code, the same reach.

The page is `web/public/records.html` ("Your records"), with its Welsh twin under `web/public/cy/`:

- **Upload** (`extract_book`'s link, `records.html#upload`, with `?clientId=` for a practice client): a drop
  zone reads the file in the browser with the books bundle's `readBookSource` (already exported,
  `scripts/build-books-bundle.mjs` line 237), builds the DIYA-GL zip, and PUTs it under a new bookId with
  `change: {tool: "import"}`. The file never leaves the browser; only the DIYA-GL zip is stored. The bundle
  adds the exports `writeDiyaGlZip` and the report builder; MCP4 measures the bundle's growth from
  1,673,502 bytes. The PUT path is already the one large-body path the WAF lets through
  (`OversizedBodyOutsideBookWrite`, `EdgeStack.java` line 1598), so the edge needs no change.
- **Download** (`save_workbook`'s link, `records.html?bookId=&version=&format=`): the page calls a new
  `GET /api/v1/books/{bookId}/versions/{version}/download?format=` (`app/functions/diyaGl/diyaGlDownloadGet.js`,
  books authoriser). For `diya-gl-zip` it presigns the stored version itself. For `json`, `xlsx` and `zip`
  it reads the version, builds the file with diya-gl's `writeBookJson`, `saveWorkbook` or `savePackageZip`
  (the app already depends on diya-gl), writes it under `downloads/<ownerPrefix>/<uuid>` in the DIYA-GL
  bucket with a one-day lifecycle rule, and answers `{url, filename}`, presigned for 5 minutes. Lambda:
  2,048 MB, 60 s timeout (the 13-workbook compose took 21.6 s here).
- The page also lists each DIYA-GL book's versions with what made each one (section 4), so a person can see
  and undo an AI change without the assistant.

#### 6. Activity events and the actor

- Every save goes through `diyaGlPut.js`, which publishes `book-saved` (line 369) with `appClient` "mcp"
  for the connector's token and "submit" for the page, and the actor from the token's email
  (`resolveActorClass`, `app/lib/activityAlert.js` line 148: the reviewer and synthetic users are
  `@test.diyaccounting.co.uk`, so `test-user`). `detail` gains `change` (section 4), so the lake tells an AI
  edit, an undo and an import apart without a new event name.
- The download route publishes `book-downloaded` with `{product, format, version}`.
- No event carries a line, an amount or a business name.

#### 7. Review risk

- **OpenAI.** The plan records that OpenAI scans the connector's tool set daily and that 0.1.7 is in review
  (MCP2, ODSC1). The guidelines say "Use `false` for external-state changes, persisting artifacts" for
  `readOnlyHint`, "Side effects should never be hidden or implicit", and that annotations must be set "to
  the appropriate" values (https://developers.openai.com/apps-sdk/app-submission-guidelines). The page says
  nothing about changing tools after approval. Risk: write tools on prod's set while a version is in review
  change what was reviewed. **Land MCP4 on prod only after ODSC1 approves and MCP2 is live, and ship it with
  a new plugin version, ZIP and review**, whose test prompts include an edit, an undo and a refusal.
- **Claude's directory.** "Every tool includes a `title` and the applicable `readOnlyHint` or
  `destructiveHint`." The portal groups tools "by whether their annotations declare them read-only or
  write" and asks whether the connector "reads data, writes data, or both"
  (https://claude.com/docs/connectors/building/submission). The listing's use cases change from read to
  read and write; that page names no re-review rule.
- The links: Claude asks the user to confirm "before the link opens" for a link to another destination
  (same page). The upload and download links are on submit.diyaccounting.co.uk, the same domain as
  `prepare_vat_return`'s link.
- `prod-tool-answers.test.js` line 519 asserts every prod tool is read-only and not destructive; it changes
  to name the five writing tools.

#### 8. The prod instructions' sentences

`PROD_HOSTED_INSTRUCTIONS` (`mcp/lib/hosted-tools.js` line 102). Replace "This connector reads and works out
figures:" with "This connector works out figures and keeps the person's records:", and insert after the
sentence about stored receipts:

> It keeps a DIYA-GL book too: it starts a new book, starts a company's next book from the Companies House
> register, rolls a book on to its next year, and adds, changes or removes lines. Each change is saved in
> the person's DIY Accounting Submit account as a new version of the book. Before a change, say what will
> change; after it, show the figures that moved. When the person says a change was wrong, call
> undo_book_change. To bring in a spreadsheet, call extract_book and give the person its link to upload the
> file on the DIY Accounting Submit website. To get the book as a spreadsheet, call save_workbook and give
> the person its link.

"No tool files a return or accounts, or pays HMRC or anyone else." stays.

#### 9. Customer wording (CLAUDE.md "Customer wording")

Titles: "Change lines in a DIYA-GL book" (`edit_lines`), "Start a new DIYA-GL book" (`new_book`), "Start a
company's DIYA-GL book from Companies House" (`new_book_from_register`), "Start next year's DIYA-GL book"
(`roll_forward`), "Undo the last change to a DIYA-GL book" (`undo_book_change`), "Upload a spreadsheet as a
DIYA-GL book" (`extract_book`), "Download a DIYA-GL book as a spreadsheet" (`save_workbook`). Descriptions
say "your records", "DIYA-GL book" on first use, "spreadsheet", "workbook" or "package zip" for files, and
never "your books". The page is "Your records". `tool-descriptions.test.js` line 68 enforces the book rule.

#### 10. MCP4's brief

Build the design above. **Model**: Sonnet. **Size**: about 16 files. Lands on prod after ODSC1 approves
and MCP2 is live (section 7). Gates: `npm ci` then `npm test` in `mcp/`; `npm test`; `./mvnw clean verify`;
`npx playwright test` for the records page's browser test.

| File | Change |
| --- | --- |
| `mcp/lib/tool-annotations.js` line 15 | Widen `CHANGES_OUTSIDE`'s comment; add `ADDS_OUTSIDE` |
| `mcp/lib/book-tools.js` | `saveCloudBook` (line 296) takes an optional `change` and a new-book flag (no `if-match`); new `readCloudVersion(session, {bookId, clientId, version})` over the version route; `newCloudBookId()` |
| `mcp/lib/hosted-write-tools.js` (new) | The seven overrides of section 2, each `{title, annotations, description, inputSchema, handler}`, calling diya-gl's `TOOLS[name].handler` with an explicit `{book, lines}` and then the save; the error texts of section 2 |
| `mcp/lib/hosted-tools.js` lines 24, 126 | Add the seven names to `HOSTED_TOOL_NAMES` only; spread the write overrides into `HOSTED_OVERRIDES`; the header comment. `PROD_HOSTED_TOOL_NAMES` and section 8's instruction sentences are MCP9's |
| `mcp/lib/server.js` line 1026 | `known` also takes diya-gl's write tools by name, so `createServer` finds the names the overrides replace |
| `app/functions/diyaGl/diyaGlPut.js` lines 114, 171, 369 | Accept and validate `change`; store it on the version; add it to the activity detail |
| `app/functions/diyaGl/diyaGlDownloadGet.js` (new) | The download route of section 5 |
| `app/data/s3DiyaGlRepository.js` | `putDownload` and `presignVersion` / `presignDownload` |
| `infra/main/java/.../stacks/DiyaGlStack.java` after line 309 | The download Lambda (2,048 MB, 60 s), its route on the books authoriser, read on versions and write on `downloads/`, the bucket's one-day lifecycle rule on `downloads/` |
| `infra/main/java/.../stacks/ApiRoutes.java` line 89 | `userPoolClientId` joins `cloudBookAudience` |
| `scripts/build-books-bundle.mjs` line 249 | Export `writeDiyaGlZip` and the report builder; `npm run bundle:books` |
| `web/public/records.html`, `web/public/records.page.js` (new), `web/public/cy/records.html` | The page of section 5; Welsh strings in a headed section at the end of `i18n/cy.toml`, then `npm run build:welsh` |
| `web/public/mcp.html` | The seven tools' entries |
| `plugins/diya-submit-chatgpt/plugin.json`, `README.md`; `plugins/diya-submit/` skill | New version, release notes, test prompts with an edit and an undo |

Tests (each fails without its change):

- `mcp/test/hosted-write-tools.test.js` (new), with `fetch` stubbed as `book-tools.test.js` does:
  `edit_lines` PUTs once with the session's etag as `if-match` and answers `movedFigures` and no `lines`;
  a 412 leaves `session.book` and `session.cloud` as they were; `new_book` PUTs a v4 bookId with no
  `if-match`; `roll_forward` PUTs a new bookId and never the open one; `undo_book_change` GETs the version
  before the latest and PUTs its bytes with `if-match` the latest etag; a `toVersion` no longer kept is
  refused naming the oldest kept; `extract_book` and `save_workbook` make no PUT and answer a link on
  `DIYA_SUBMIT_BASE_URL`.
- `mcp/test/hosted-tools.test.js`: the override list (line 23) and input schemas; prod's set and
  instructions.
- `mcp/test/prod-tool-answers.test.js` line 519: the write tools' annotations and answer shapes.
- `mcp/test/tool-descriptions.test.js` and `mcp/test/fixtures/golden-prompts.json`: direct and indirect
  prompts for the new tools.
- `mcp/test/server-json.test.js` line 50 and `mcp/test/plugin.test.js`: prod's set.
- `app/unit-tests/functions/diyaGlPut.test.js`: `change` stored on the version and in the event; a bad
  `change` is a 400.
- `app/unit-tests/functions/diyaGlDownloadGet.test.js` (new): each format, another owner's book refused,
  the presigned URL's expiry.
- `app/unit-tests/functions/mcpHttp.test.js`: after a hosted write the stored pointer carries the new etag
  (no code change expected; the test pins it).
- `web/browser-tests/records.browser.test.js` (new): upload a fixture workbook, see the new DIYA-GL book and
  its version list; the download link.
- The CDK synth test for the new Lambda and route.

#### Measurements

Size of the stored zip (`writeDiyaGlZip` with report and bookchecks), lines repeated and, second run,
every numeric field and every text field randomised: a node script over
`mcp/node_modules/@diy-accounting-uk/diya-gl/dist/app/lib` (`loadDiyaGlData`, `writeDiyaGlZip`,
`buildFileReportDocument`, `runBookChecks`). Workbook and package sizes: `saveWorkbookFiles` and
`savePackageZip` over the two fixtures.

### MCP5. A cloud book started from the Companies House register

A hosted tool starts the DIYA cloud book of a limited company's next accounting period from the register: it reads the company profile, the officers, the statement of capital with the shareholdings and the last filed accounts by company number through Submit's own Companies House reads (`app/functions/companies-house/companiesHouseCompanyGet.js`, `companiesHouseOfficersGet.js`, `companiesHouseFilingHistoryGet.js`, `companiesHousePublicRegisterGet.js`; the same path as `company_filing_deadlines` in `mcp/lib/server.js`), then runs diya-gl's `new_book_from_register` on the server (its input: profile, `officers`, holdings, `capitalDate`, `lastAccounts` from the filed iXBRL, optional `periodEnd`) and saves the result as a new cloud book by MCP4's save. With the filed accounts the opening balance sheet equals the filed closing one. The tool is `CHANGES_OUTSIDE` (it creates a cloud book); it registers on prod's connector with the accounts tools. Tests: a recorded register fixture for a micro-entity and a small company, the book's opening balances against the filed accounts, the officers and holdings in the book. **Model**: Sonnet. **Size**: ~5 files.

### MCP6. Links to the filled-in accounts and CT600 forms

`prepare_micro_entity_accounts`, `prepare_small_company_accounts` and `prepare_company_tax_return` follow `prepare_vat_return` (`mcp/lib/handoff-tools.js`, `vatHandoffLink`): each derives the figures again from the open book and gives the link to its form with the figures in the URL fragment (`#books=<base64url JSON>`, read by `web/public/lib/auth-url-builder.js` line 122), and files nothing. The forms are `web/public/companies-house/fileMicroEntityAccounts.html`, `fileSmallCompanyAccounts.html` and `fileCompanyTaxReturn.html` (and their Welsh pages); each page fills its fields from the fragment as the VAT form does, and the person checks, enters the authentication code or Government Gateway credentials, and files. Each tool registers in `HOSTED_TOOL_NAMES` only; MCP9 puts it on prod's connector (both journeys are live on prod), with its sentence in the prod instructions ("Open this link, check the figures ... Nothing has been filed."). Tests: `mcp/test/` for each link's fragment, a browser case per form that opens a link and finds the fields filled, `mcp/test/hosted-tools.test.js` and `mcp/test/plugin.test.js`. **Model**: Sonnet. **Size**: ~8 files.

### MCP7. Rules and rates with their sources

A READS tool `look_up_rule` takes a term or a fact id ("annual investment allowance", "section 455 rate", "accounts due 9 months") and answers the value, the gov.uk quote, the URL and the date it was read. The quotes, URLs and fact ids are the source files in `.claude/skills/tax-sources/sources/` (58 files today; `scripts/tax-sources.mjs` `loadSources` reads them, and a unit test fails a source older than 30 days); the values are those `scripts/build-rates-page.mjs` takes from the diya-gl engine's tax data (`ENGINE_DATA_DIR`, with `RATES_FACT_IDS` in `scripts/rates-fact-ids.mjs`) and from `scripts/build-mtd-calendar.mjs`. Build one generated JSON for the `mcp/` package from the same inputs (a script beside the two builders, run by them, so the three cannot disagree), and match a term against the fact ids and the source titles. Each derivation's answer (`derive_vat_return`, `derive_micro_entity_accounts`, `derive_small_company_accounts`, `derive_company_tax_return` in `mcp/lib/server.js`) gains the source link of each rate or rule it used (for example marginal relief and the section 455 rate in the Company Tax Return). The prod instructions add: give the rule with its source, quote it and do not advise; for a person's own case, send them to HMRC or Companies House. Register in `HOSTED_TOOL_NAMES` only (`mcp/lib/hosted-tools.js`); MCP9 moves it onto prod. Tests: the JSON against the sources (every fact id has a source and a value), a term search, a derivation answer with its links, `mcp/test/hosted-tools.test.js`, `mcp/test/plugin.test.js`. **Model**: Sonnet. **Size**: ~6 files.

### MCP8. Help from the Submit guide and the diya-gl knowledge base, and the DIYA-GL book format

A READS tool `find_help` searches the Submit guide (`web/public/guide.html` sections, `mcp.html`, `rates.html`, `mtd-calendar.html`) and the diya-gl knowledge base (253 articles in `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/articles`, keywords in `app/data/knowledge-base-search.toml`, the published `knowledge-base.toml` beside `knowledge-base.html`; `buildKnowledgeBase` in `app/lib/knowledge-base.js`), and answers titles, a two-line summary and the public URL of each match. Read the knowledge base from its published file or the diya-gl package, not from the sibling checkout, so the hosted build needs no second repository; if neither ships it, a diya-gl release that ships `knowledge-base.toml` comes first. A READS tool `book_format` answers the DIYA-GL book format (book.toml and lines.jsonl, from `diya-gl/README.md` in the package) and the CT600 box map (`app/data/filing/ct600-v3.toml`), so the assistant knows the shape before MCP4's `edit_lines`. Wording: "your records", "DIYA-GL book", never "your books". Register in `HOSTED_TOOL_NAMES` only; MCP9 moves them onto prod. Tests: a search that finds a guide section and an article, the book format answer, `mcp/test/hosted-tools.test.js`, `mcp/test/plugin.test.js`. **Model**: Sonnet. **Size**: ~5 files.

### MCP9. The new hosted tools onto prod's connector and the listings

The brief is MCP9's row on `NEXT.md`. **Model**: Sonnet. **Size**: ~6 files.
