# PLAN: The submission MCP

Status: open, drafted 2026-09-07. No code written. Backlog row 51.

An MCP server for DIY Accounting Submit. It takes a customer's books, works out the figures a
filing needs with the diya-gl library from the spreadsheets repository, and drives the two
submissions this service already makes: the VAT return to HMRC and the micro-entity accounts to
Companies House. It runs on the three surfaces in the operator's notebook sketch of 2026-09-07:
the npm package (CLI and local web), the Docker image (the same), and the hosted MCP behind a
chat or the cloud web page. Books load and save through the filesystem or the DIYA cloud, as
`.xlsx`, `books.zip` or `books.diya-gl`.

## User assertions (verbatim)

> one for a submission MCP that will use a published library (forthcoming) from ../spreadsheets*
> to do the spreadsheet extraction and diya-gl calcs

From the notebook page (2026-09-07): `npm - cli / local web`, `docker - cli / local web`,
`mcp - chat / cloud web`, `calc`, `update diya-gl -> submit`, load/save via FS or DIYA (paid,
Google auth), `.xlsx / books.zip / books.diya-gl`.

## Where we stand

**The library exists and is not yet published.** `@diy-accounting-uk/diya-gl` lives at
`../spreadsheets.diyaccounting.co.uk/diya-gl/` (version 1.0.0) with five bin commands:
`diya-gl`, `diya-gl-recalc`, `diya-gl-read-workbook`, `diya-gl-write-workbook`,
`diya-gl-mcp`. The publish workflow `publish-diya-gl.yml` runs on a `diya-gl-v*` tag, packs,
smoke-tests and publishes with provenance. It fails loudly without the `NPM_TOKEN` secret,
which is that repo's board row H7, an operator step. Nothing else blocks publication.

**The library already does the extraction and the calculations this plan needs.**
`app/lib/books-interchange.js` reads a customer's upload by content (workbook, package zip,
diya-gl zip, JSON) into a book and lines, with no LibreOffice or Excel anywhere.
`app/lib/calculators/ltd.js` computes from that book the trial balance, the monthly and
published P&L, the published balance sheet (`buildPublishedBalanceSheet`), the opening
balance sheet, the VAT returns (`buildVatReturns`), corporation tax and the CT600. The
roundtrip fidelity programme proved in CI that reading an Excel-generated package back through
this path gives the same figures as the JavaScript engine. The Ltd product's CLI, MCP and web
wave is landed on that repo's main.

**The spreadsheets repo already ships an MCP server** at `app/lib/mcp/` with four tools:
`extract_book`, `report`, `edit_lines`, `save_workbook`. It is stdio JSON-RPC over a
hand-rolled transport, one book per session. It knows nothing about HMRC or Companies House.
This plan does not duplicate it; the submission MCP calls the same library functions and adds
the filing tools.

**On the Submit side there is no MCP code.** Two designs exist in `_developers/` and disagree
on authentication and hosting: `_developers/archive/PLAN_MCP_SERVER.md` (a thin HTTP client
over the deployed REST API, sign-in by pasting a code from a callback page, hosting deferred)
and `_developers/archive/PLAN_ISSUE_648_mcp_server.md` (an OAuth device-code flow with a
personal API token table). `web/public/mcp.html` is a coming-soon page. Neither design is on
the board. This plan supersedes both.

**The two submissions take flat figures today.** `hmrcVatReturnPost.js` wants the nine boxes
in the request body. `companiesHouseAccountsPost.js` wants the seven FRS 105 balance sheet
lines for the current and prior year and checks they add up. The CSV contract in
`_developers/CSV_VAT_RETURN_CONTRACT.md` has a reader (`app/lib/vatReturnCsv.js`) and no
import endpoint (backlog row 16). Nothing in `app/` opens a diya-gl book; the DIYA-GL storage API
(`PLAN_DIYA_GL_STORAGE.md`, live on prod since PR #150) stores the zip opaquely and returns it
base64-encoded from `GET /api/v1/books/{bookId}/versions/{version}`.

**Realistic test data exists.** The BrickWork Pro Ltd example
(`../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/books/assets/examples/brickwork-pro/ltd-vat/`)
is a VAT-registered, CIS-registered company with a year of sales, purchases, bank, payroll and
journal lines for 2025-04-01 to 2026-03-31. It passes the engine's checks. The operator named
it to Companies House on 2026-09-07 as the source of the test filings.

## Decisions

1. **The engine is imported, never copied.** The submission MCP depends on the published
   `@diy-accounting-uk/diya-gl` at a pinned version. Until H7 lands, development runs against
   a `file:` dependency on the sibling checkout, and the Submit CI installs from the registry,
   so the first merge waits for the tag. No calculation logic lives in this repository.
2. **The MCP computes; the storage API still stores.** `PLAN_DIYA_GL_STORAGE.md` decided that
   the storage Lambdas do storage only. That stands. The submission MCP is a separate process
   (the npm CLI, the Docker image, or its own Lambda) that opens a book with the library and
   computes in Node. No LibreOffice anywhere, as before.
3. **One MCP implementation, two transports.** The server is written once over the MCP SDK's
   transport abstraction: stdio for the npm and Docker surfaces, streamable HTTP for the hosted
   surface. Tools, schemas and the library calls are the same code.
4. **Hosted authentication is OAuth against the existing Cognito user pool.** The hosted MCP
   is an OAuth resource server in the MCP authorization sense; Cognito's hosted UI is the
   authorization server, with a third app client beside the web and books clients and a JWT
   authoriser scoped to that client's audience, the pattern D10 set for books. The stdio
   surfaces get the same token through the device-code grant. This replaces both earlier
   designs: the paste-a-code page and the personal token table are dropped. **Alternative the
   operator may prefer**: keep the personal API token table from the archived design for
   CLI users who never open a browser. It costs a table and a revocation UI; the device-code
   grant costs nothing new.
5. **HMRC and Companies House credentials never enter the MCP session as text.** HMRC's OAuth
   grant stays a browser step the tool returns a link for, and the token lands in the same
   per-user store the site uses. The company authentication code for the accounts filing is
   passed on the one call that needs it and is not stored, as `PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md`
   already requires.
6. **The figures are derived, shown, and confirmed before anything is filed.** A submit tool
   takes the figures the derive tool returned, not a book, so the model and the user see and
   approve the nine boxes or the seven lines before the call that reaches HMRC or Companies
   House. Submitting straight from a book is not a tool.

## The tools

| Tool | Does | Library call | Submit call |
|---|---|---|---|
| `open_book` | Loads a book from a path, from bytes, or from the DIYA cloud by book id; reports product, entity, period, checks | `readBookSource`, `buildFileReportDocument` | `GET /api/v1/books/{id}/versions/latest` |
| `save_book` | Writes the session's book to the filesystem or the DIYA cloud in any of the four formats | `writeDiyaGlZip`, `savePackageZip`, `saveWorkbook` | `PUT /api/v1/books/{id}` |
| `list_vat_obligations` | The open and fulfilled obligations for the book's VRN | none | `GET /api/v1/hmrc/vat/obligation` |
| `derive_vat_return` | The nine boxes for one obligation, from the book's VAT return for the period whose dates match; says which lines fed each box | `buildVatReturns` | none |
| `submit_vat_return` | Files nine boxes the user has confirmed; returns the receipt | none | `POST /api/v1/hmrc/vat/return` |
| `get_vat_receipt` | A stored receipt | none | `GET /api/v1/hmrc/receipt/{name}` |
| `derive_micro_entity_accounts` | The seven FRS 105 lines for the current year from the published balance sheet and for the prior year from the opening balance sheet, plus the employee count and period dates; refuses when capital and reserves does not equal net assets | `buildPublishedBalanceSheet`, the opening balance sheet reads | none |
| `preview_micro_entity_accounts` | The rendered iXBRL for confirmed figures, with the public validator's verdict when asked | none | `POST /api/v1/companies-house/accounts/preview` |
| `submit_micro_entity_accounts` | Files confirmed figures with the company authentication code; returns the submission number | none | `POST /api/v1/companies-house/accounts` |
| `poll_accounts_submission` | Accepted, rejected with reasons, or pending | none | `GET /api/v1/companies-house/accounts/{submissionNumber}` |

The four diya-gl tools (`extract_book`, `report`, `edit_lines`, `save_workbook`) stay in the
diya-gl package's own server. A chat that needs to correct a line before filing runs both
servers; the hosted surface can proxy the four through the same process later if that proves
awkward. Decide that after the first real use, not before.

## Sequence

Each row is a `claude/mcp-<n>-<topic>` branch and PR. Rows 1 to 3 need no credentials and no
published package beyond a `file:` dependency, so they can start now; the first merge waits
for H7.

| Row | What | Waits on | Owner, model |
|---|---|---|---|
| M1 | The package skeleton at `mcp/`: the SDK, stdio transport, `open_book`, `save_book` over the filesystem, `derive_vat_return`, `derive_micro_entity_accounts`; unit tests over the BrickWork Pro Ltd example and the Precision Code Ltd example; the seven derived lines for BrickWork Pro passed through `buildMicroEntityAccounts` and the public validator script | a `file:` dependency on the sibling `diya-gl/` | Claude Code, Opus for the derivation mapping, Sonnet for the rest |
| M2 | The Submit-facing tools over the deployed REST API with a bearer token from the environment, against the simulator lane first: obligations, VAT submit, receipt, accounts preview, submit and poll | M1 | Claude Code, Sonnet |
| M3 | The third Cognito app client, its JWT authoriser and the device-code grant; `open_book` and `save_book` over the DIYA cloud routes | M1; the books client pattern in `PLAN_DIYA_GL_STORAGE.md` | Claude Code, Sonnet; the CDK change through the usual deploy |
| M4 | The hosted transport: a Lambda with streamable HTTP behind API Gateway on the existing domain, the resource-server metadata, and the OAuth flow end to end from a chat client | M3 | Claude Code, Opus design then Sonnet |
| M5 | Distribution: `npm publish` from this repo on a tag, the Docker image on GHCR, `web/public/mcp.html` rewritten as the real instructions | M2; H7 on the spreadsheets board for the dependency | Claude Code, Haiku |
| M6 | The Companies House proof: BrickWork Pro's derived accounts filed to the XML Gateway test service through the MCP | M2; NEXT.md O16 and B34.6b | Claude Code, Sonnet |
| M7 | The VAT proof: a derived return filed through the MCP against HMRC's sandbox with the existing test user | M2 | Claude Code, Sonnet |

## Verification

- The seven lines `derive_micro_entity_accounts` returns for BrickWork Pro equal the published
  balance sheet the books page shows for the same example, and the prior-year lines equal its
  opening balance sheet.
- `derive_vat_return` for each of the example's four VAT periods equals the `vat-returns` view
  on the books page, box by box.
- A generated set of accounts from derived figures gets `RESULT: valid` from the Companies
  House validator (`npm run validate:accounts-ixbrl` accepts a file path).
- The behaviour suites `fileMicroEntityAccountsBehaviour` and `submitVatBehaviour` are
  unchanged: the MCP calls the same endpoints, so their coverage is the endpoints' coverage.
- No credential appears in a tool result, a log line or a saved book.

## Dependencies outside this repository

| Dependency | Where | State |
|---|---|---|
| `NPM_TOKEN` secret, then the `diya-gl-v1.0.0` tag | spreadsheets board H7, operator | Ready to start; nothing else blocks publication |
| The published package's API surface staying as `books-interchange.js` and `calculators/ltd.js` expose it today | spreadsheets repo | Landed; pin the version |
| The `vat-returns` view's period boundaries matching HMRC obligation dates | spreadsheets engine (`buildVatReturns`); straddling periods are a named horizon in that repo's Ltd plan | Open on that side |
| Test presenter credentials from Companies House | NEXT.md O16, operator | Requested 2026-09-05; details sent 2026-09-07 |
| An MCP client to run the hosted flow end to end | Claude Desktop or Claude Code on the operator's machine | Available |

## Distance

Three of the four things the notebook asks for exist: the extraction, the calculations, and a
working MCP over them, all in the spreadsheets repo. The submissions exist as endpoints. What
is missing is the bridge, rows M1 to M4: the mapping from a book to the nine boxes and the
seven lines, the Submit-facing tools, and one authentication design. M1 and M2 are days of
work on the simulator lane and can start before the package is on the registry. The hosted
surface (M4) is the only part with a real design question, and decision 4 answers it unless
the operator wants the alternative.

## Related

- `../PLAN_FINANCE_AUTOMATION.md` phase 2 wants an MCP that writes a populated package from
  staged sources. That is `save_book` plus the diya-gl package's `edit_lines`; the parsers it
  needs are that plan's backlog rows, not this plan's.
- `PLAN_ONE_STOP_DASHBOARD.md` shows the company's own P&L and balance sheet by running the
  same derivation over the company's own book.
- `PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md`, `PLAN_DIYA_GL_STORAGE.md`,
  `_developers/CSV_VAT_RETURN_CONTRACT.md`.
