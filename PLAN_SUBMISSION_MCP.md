<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: The submission MCP

Status: open, drafted 2026-09-07. M1 is on main (M1a, PR #226; M1b and M1c, PR #232); M2 is on main (PR #469); M5's workflow, staging and page are on main (PR #471), its first tag waits on OM5; M4 and M6 to M8 are rows
on `NEXT.md` (boarded 2026-10-03); M3 uses the authorization code grant with PKCE on a loopback
redirect, because Cognito has no device-code grant.

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
on authentication and hosting: `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_MCP_SERVER.md` (a thin HTTP client
over the deployed REST API, sign-in by pasting a code from a callback page, hosting deferred)
and `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_ISSUE_648_mcp_server.md` (an OAuth device-code flow with a
personal API token table). `web/public/mcp.html` is a coming-soon page. Neither design is on
the board. This plan supersedes both.

**The two submissions take flat figures today.** `hmrcVatReturnPost.js` wants the nine boxes
in the request body. `companiesHouseAccountsPost.js` wants the seven FRS 105 balance sheet
lines for the current and prior year and checks they add up. The CSV contract in
`_developers/CSV_VAT_RETURN_CONTRACT.md` has a reader (`app/lib/vatReturnCsv.js`) and no
import endpoint (backlog row 16). Nothing in `app/` opens a diya-gl book; the DIYA-GL storage API
(`../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_DIYA_GL_STORAGE.md`, live on prod since PR #150) stores the zip opaquely and returns it
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
2. **The MCP computes; the storage API still stores.** `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_DIYA_GL_STORAGE.md` decided that
   the storage Lambdas do storage only. That stands. The submission MCP is a separate process
   (the npm CLI, the Docker image, or its own Lambda) that opens a book with the library and
   computes in Node. No LibreOffice anywhere, as before.
3. **One MCP implementation, two transports.** The server is written once over the MCP SDK's
   transport abstraction: stdio for the npm and Docker surfaces, streamable HTTP for the hosted
   surface. Tools, schemas and the library calls are the same code.
4. **Hosted authentication is OAuth against the existing Cognito user pool.** The hosted MCP
   is an OAuth resource server in the MCP authorization sense; Cognito's hosted UI is the
   authorization server, with a third app client beside the web and DIYA-GL clients and a JWT
   authoriser scoped to that client's audience, the pattern D10 set for DIYA-GL. The stdio
   surfaces get the same token through the device-code grant. This replaces both earlier
   designs: the paste-a-code page and the personal token table are dropped. **Alternative the
   operator may prefer**: keep the personal API token table from the archived design for
   CLI users who never open a browser. It costs a table and a revocation UI; the device-code
   grant costs nothing new.
5. **HMRC and Companies House credentials never enter the MCP session as text.** HMRC's OAuth
   grant stays a browser step the tool returns a link for, and the token lands in the same
   per-user store the site uses. The company authentication code for the accounts filing is
   passed on the one call that needs it and is not stored, as `PLAN_COMPANIES_HOUSE.md`
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

## From a book to the nine VAT boxes (M1b)

The Ltd engine (`calculators/ltd.js`, `buildVatReturns`) already computes every return the
package's `Vatreturns.xlsx` carries. `derive_vat_return` reads those results and adds the
period matching, the HMRC field names, the rounding and the line attribution; it computes no
VAT of its own.

**What the engine does.** `Vatreturns.xlsx!Vatinterface` holds one row per VAT period end in
date order: rows 4 and 5 are the two month ends before the accounting year, rows 6 to 17 the
twelve month ends in it, rows 18 to 20 the three after it. A row's D/F columns are the sales
net and output VAT of that month, H/J the purchases net and input VAT, and E/G/I/K the sum of
that row and the two above it, which is the quarter a return covers. `VATQtr1` to `VATQtr5`
are the five forms the package ships, filled for the quarters ending 3, 6, 9, 12 and 15
months after the first accounting month; they read the same interface row the tool reads.

| Box | HMRC field | Interface column | Fed by |
|---|---|---|---|
| 1 VAT due on sales | `vatDueSales` | G (three-row sum of F) | Every `sales` journal line whose `accountMainID` is one of the seven sales codes (4000 to 4006), dated in the quarter; VAT is gross × 20 ÷ 120. Plus any line carrying `diya-gl:vatPeriodEnd` whose period end is one of the quarter's three rows |
| 2 VAT due on acquisitions | `vatDueAcquisitions` | none | Nil: the form never computes it |
| 3 Total VAT due | `totalVatDue` | | Box 1 + box 2 |
| 4 VAT reclaimed | `vatReclaimedCurrPeriod` | K (three-row sum of J) | Every `purchases` journal line whose `accountMainID` is one of the 23 purchase codes (5000 to 5900), the same way |
| 5 Net VAT | `netVatDue` | | Box 3 − box 4 |
| 6 Sales ex VAT | `totalValueSalesExVAT` | E (three-row sum of D) | The net (gross − VAT) of the box 1 lines; a flat-rate book adds box 1 back (column M), which the Ltd engine never sets |
| 7 Purchases ex VAT | `totalValuePurchasesExVAT` | I (three-row sum of H) | The net of the box 4 lines |
| 8 Goods supplied to EU | `totalValueGoodsSuppliedExVAT` | none | Nil |
| 9 Acquisitions from EU | `totalAcquisitionsExVAT` | none | Nil |

Rules the engine applies, which the tool inherits and states in its answer:

- **One rate on every journal line.** The Ltd calculator takes 20% off every sales and
  purchases journal line (`VAT_RATE`), and reads neither the line's `taxCode` and `taxRate`
  nor the book's `[tax.vat]` table. A book whose entity is not `diya-gl:vatRegistered = true`
  gets a rate of 0 and every box nil; the tool refuses such a book instead of answering zeros.
- **Journals only.** Bank, payroll and general journal lines feed no box: VAT is accounted
  for on invoice, from the two day books. A sales or purchases line on an account outside
  the two code maps is not on any month tab and so not in any box.
- **A period is a quarter ending on a month end the interface carries.** The tool takes the
  obligation's `periodEnd`, finds its row, and answers that row's quarter; a `periodStart`
  that is not the first day of the month two months before is refused. Rows 4 and 5 carry no
  quarter sum, so the earliest period a book answers ends with its first accounting month.
  Monthly and annual obligations are a horizon.
- **CIS deductions change no box.** They move between debtors, creditors and the CIS
  liability, not the VAT figures.
- **Rounding is HMRC's.** Boxes 1 to 5 to the penny, boxes 6 to 9 to whole pounds, and box 5
  recomputed from the rounded boxes 3 and 4 so HMRC's own check holds.
- **Standard accrual scheme only.** Cash accounting and the flat-rate scheme are horizons;
  the interface's M column is where a flat-rate percentage would go.

**What the tool adds.** The attribution lists every line behind boxes 1, 4, 6 and 7 with the
gross, VAT and net it contributed, bucketed by the line's own posting month (or its
`diya-gl:vatPeriodEnd` for a straddling line), and refuses when those contributions do not
reconcile to the penny with the interface row, so a book with a line dated outside its
accounting year cannot answer a return that silently omits it.

## From a book to the seven FRS 105 lines (M1c)

The Ltd engine already builds both balance sheets the accounts need: `PubBalSht`, the
published balance sheet at the year end, from the trial balance's closing column, and
`OpenAccounts`, the opening balance sheet, from the book's opening journal
(`buildOpeningBalance`). `derive_micro_entity_accounts` reads the first for the current year
and the opening figures for the prior year, rounds them the way Companies House takes them, and
refuses when either sheet does not balance. It computes no balance of its own.

| Line | Filing field | Current year, from `PubBalSht` | Prior year, from the opening balance |
|---|---|---|---|
| Fixed assets | `fixedAssets` | F6: the five asset classes' cost less accumulated depreciation after the year's additions, disposals and charge (trial balance EJ6 to EJ17) | opening cost less opening depreciation (`OpenAccounts` E13) |
| Current assets | `currentAssets` | E13 = stock E10 (EJ19) + trade debtors E11 (EJ20) + cash at bank and in hand E12 (EJ22 to EJ26: current, savings, credit card, cash, transfers in transit) | stock + trade debtors + the bank and cash balances + long-term debtors (E15 + E16 + E18) |
| Creditors due within one year | `creditorsWithinOneYear` | E20 = trade creditors E16 (EJ28 to EJ31: trade creditors, net wages, deductions, dividends due) + corporation tax E17 (EJ35) + taxation and social security E18 (EJ32 to EJ34: CIS, VAT, PAYE) | trade creditors + net wages due + wage deductions due + dividends due + corporation tax + CIS, VAT and PAYE due (E20 + E24 + E26) |
| Creditors due after one year | `creditorsAfterOneYear` | F31 = directors' loan E29 (EJ39) + long-term creditors E30 (EJ40) | directors' loan + long-term creditors (E30) |
| Called up share capital | `calledUpShareCapital` | F36 (EJ42) | share capital (E33) |
| Profit and loss account | `profitAndLossAccount` | F39 − F36: the revenue reserve (EJ43, retained earnings brought forward plus the year's retained profit) and the capital reserve (EJ44) | retained earnings + capital reserves (E34) |
| Capital and reserves | `capitalAndReserves` | F39, shareholders' funds | share capital + retained earnings + capital reserves |

Rules the tool applies:

- **Both sheets must balance before anything is answered.** The published sheet's own net
  assets, F33 (total assets less current liabilities F26 less creditors after one year F31),
  must equal shareholders' funds F39; the opening sheet's accuracy check E37 must be nil. A
  difference is refused with its size. A long-term debtor (EJ37) sits on no published line and
  is the usual cause.
- **Whole pounds, and the identity survives the rounding.** Companies House and
  `companiesHouseAccountsPost.js` take integers and check that capital and reserves equals
  net assets exactly. The tool rounds fixed assets, current assets, the two creditors lines and
  share capital, then derives capital and reserves from those four and the profit and loss
  account from that less share capital, so the check holds; the profit and loss account can
  sit up to £2 from the sheet's own figure.
- **A capital reserve folds into the profit and loss account.** The seven-line set has no
  other reserve line; the answer names the amount folded when it is not nil.
- **The rest comes from the book's own tables.** Period dates from `documentInfo`; the prior
  balance sheet date is the day before the period starts; the company number and name from
  `entityInformation`; the director from the first entry of the `directors` table; the
  average number of employees is the count of the `employees` table, which the user confirms
  before filing.
- **The figures, not the document.** The tool answers the figures the filing endpoint takes
  (`balanceSheet.currentYear` and `priorYear`). Rendering the iXBRL and running the public
  validator are `preview_micro_entity_accounts` (M2); the unit test passes BrickWork Pro's
  derived lines through `buildMicroEntityAccounts` to prove the shape.

## The hosted surface (M4)

A chat client (Claude on the web, Desktop, mobile, Cowork, or Claude Code) adds
`https://submit.diyaccounting.co.uk/mcp` as a custom connector, signs in through the
existing prod Cognito pool, and calls the same tools the stdio server registers. One Lambda
serves MCP streamable HTTP at `/mcp`; a second Lambda serves the OAuth metadata and a thin
authorization-server facade in front of Cognito. Both sit behind the existing HTTP API and the
existing CloudFront distribution. ci deployments get the same on their own hosts.

### Sources

| What | URL |
|---|---|
| MCP authorization (2025-11-25) | https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization |
| MCP transports, streamable HTTP | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| Claude connector authentication | https://claude.com/docs/connectors/building/authentication |
| Cognito authorize endpoint (`resource`) | https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html |
| Cognito resource indicators (managed login only) | https://aws.amazon.com/about-aws/whats-new/2025/10/amazon-cognito-resource-indicators-protection-oauth-2-0-resources |
| Cognito refresh token rotation | https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html |
| HMRC OTHER_VIA_SERVER headers | https://developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/other-via-server/ |

### What a chat client requires

From the two specifications and Claude's connector page:

- An unauthenticated request to `/mcp` answers **401** with
  `WWW-Authenticate: Bearer resource_metadata="<PRM URL>", scope="openid email profile"`.
  Claude ignores the header on any other status.
- The protected resource metadata (RFC 9728) has `resource` equal to the URL the user typed,
  path included, and lists the issuer first in `authorization_servers`; Claude uses only the
  first entry.
- The issuer serves RFC 8414 or OIDC discovery metadata that includes
  `code_challenge_methods_supported: ["S256"]`. A spec-following client refuses to proceed
  without it.
- Client registration: Claude uses CIMD when the metadata says
  `client_id_metadata_document_supported: true` and lists `none` in
  `token_endpoint_auth_methods_supported`; otherwise it falls back to DCR
  (`registration_endpoint`). A user can also paste a client id in the connector dialog.
- Redirect URIs: `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`,
  and for Claude Code a loopback `http://localhost:<any port>/callback` or
  `http://127.0.0.1:<any port>/callback`, matched with the port ignored.
- The client sends `resource` (RFC 8707) on the authorize and token requests, PKCE S256 on every
  authorize, and a form-urlencoded body to the token endpoint. Discovery, registration and token
  endpoints answer within 10 seconds, refresh within 30. A dead refresh token answers
  `invalid_grant`. Public-client refresh tokens rotate.
- The MCP server validates every token was issued for it, never forwards a token it was not
  issued, and validates `Origin` when present (403 when not allowed).
- Anthropic's traffic comes from `160.79.104.0/21`.

### Why a facade in front of Cognito

The prod pool's own discovery document
(`https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_Geo7Efbet/.well-known/openid-configuration`,
issuer on `cognito-idp`, endpoints on `prod-auth.diyaccounting.co.uk`) has no
`code_challenge_methods_supported`, no `registration_endpoint`, no CIMD flag, and lists only
`client_secret_basic` and `client_secret_post` as token auth methods. The pool domain runs the
classic hosted UI (`ManagedLoginVersion` 1), so Cognito's `resource` binding, which needs managed
login, is not available, and Cognito matches callback URLs exactly, so a loopback redirect on an
arbitrary port cannot be registered. Pointing `authorization_servers` straight at Cognito fails
on each of those counts.

The facade is the authorization server the chat client sees. It owns discovery, client
acceptance, consent and the `resource` check, and delegates sign-in and token issue to Cognito
with the existing MCP app client (SSM `/submit/<env>/mcp-app-client-id`, prod
`5gpesn0rvb5vidtupcrgakq6tg`). Access tokens stay Cognito access tokens, so every existing API
authoriser that accepts the MCP client accepts them unchanged.

### Endpoints

All on the deployment's own host (prod `submit.diyaccounting.co.uk`; ci the env and slot hosts).

| Path | Methods | Lambda | Does |
|---|---|---|---|
| `/mcp` | POST, GET, DELETE | `mcpHttp` | MCP streamable HTTP; GET answers 405; DELETE ends the session |
| `/.well-known/oauth-protected-resource/mcp` | GET | `mcpOauth` | Protected resource metadata |
| `/.well-known/oauth-protected-resource` | GET | `mcpOauth` | The same document, for clients that probe the root |
| `/.well-known/oauth-authorization-server` | GET | `mcpOauth` | Facade authorization server metadata |
| `/mcp/oauth/register` | POST | `mcpOauth` | DCR (RFC 7591) |
| `/mcp/oauth/authorize` | GET, POST | `mcpOauth` | GET validates and shows consent; POST continues to Cognito |
| `/mcp/oauth/callback` | GET | `mcpOauth` | Cognito's redirect target; relays the code to the client |
| `/mcp/oauth/token` | POST | `mcpOauth` | Code and refresh exchange, proxied to Cognito |
| `/mcp/oauth/revoke` | POST | `mcpOauth` | Refresh token revocation, proxied to Cognito |

Routes on the HTTP API: `ANY /mcp`, `GET /.well-known/oauth-protected-resource`,
`GET /.well-known/oauth-protected-resource/mcp`, `GET /.well-known/oauth-authorization-server`,
`ANY /mcp/oauth/{action}`. None has an API Gateway authoriser: the JWT authoriser answers a
missing token with a 401 that carries no `resource_metadata`, which Claude cannot follow, so
`mcpHttp` verifies the token itself.

### The metadata documents

`HOST` is the request's `Host` when it is in `MCP_PUBLIC_HOSTS`; any other host answers 400.

Protected resource metadata:

```json
{
  "resource": "https://HOST/mcp",
  "authorization_servers": ["https://HOST"],
  "scopes_supported": ["openid", "email", "profile"],
  "bearer_methods_supported": ["header"],
  "resource_name": "DIY Accounting Submit"
}
```

Authorization server metadata (issuer has no path, so clients find it at the root well-known):

```json
{
  "issuer": "https://HOST",
  "authorization_endpoint": "https://HOST/mcp/oauth/authorize",
  "token_endpoint": "https://HOST/mcp/oauth/token",
  "registration_endpoint": "https://HOST/mcp/oauth/register",
  "revocation_endpoint": "https://HOST/mcp/oauth/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "revocation_endpoint_auth_methods_supported": ["none"],
  "client_id_metadata_document_supported": true,
  "scopes_supported": ["openid", "email", "profile"]
}
```

`offline_access` is left out of both on purpose: Claude appends it when the metadata lists it,
and Cognito answers `invalid_scope` for a scope it does not know. Cognito issues a refresh token on every
code grant anyway. Both documents answer `Cache-Control: max-age=300`.

### The facade's flows

**Signed blobs.** The facade keeps no table. It carries state in HMAC-SHA256 blobs,
`base64url(json) + "." + base64url(mac)`, keyed by a secret from Secrets Manager
(`<env>/submit/mcp/oauth-blob-key`, read once per container). Every blob has `typ`, `exp`, and
is refused on a bad MAC, a wrong `typ` or a past `exp`. Three kinds:

| `typ` | Carries | Lifetime | Where it travels |
|---|---|---|---|
| `consent` | `clientId`, `redirectUri`, `state`, `codeChallenge`, `scope`, `resource` | 10 min | The consent form's hidden field |
| `upstream` | the same fields | 10 min | Cognito's `state` parameter |
| `code` | Cognito's code, `clientId`, `redirectUri` | 5 min | The `code` the client receives |

**Accepting a client.** A `client_id` is one of two forms:

- An HTTPS URL on `claude.ai` or `claude.com` (CIMD). The facade fetches it (3 s timeout, no
  redirects, 64 KB cap, cached per container for its `Cache-Control` max-age up to an hour),
  checks the document's `client_id` equals the URL, and requires the request's `redirect_uri`
  to be in the document's `redirect_uris`. Hosts outside the two are refused before any fetch,
  which closes the SSRF path the spec warns about.
- `diya-submit-dcr`, the one id `/mcp/oauth/register` returns. Registration answers 201 with
  `{client_id, client_id_issued_at, redirect_uris, grant_types, response_types,
  token_endpoint_auth_method: "none"}` when every `redirect_uri` passes the allowlist below, and
  400 `invalid_redirect_uri` otherwise. Nothing is stored; the allowlist is checked again on
  every authorize.

Either way the `redirect_uri` must also pass the facade's allowlist: exactly
`https://claude.ai/api/mcp/auth_callback` or `https://claude.com/api/mcp/auth_callback`, or a
loopback `http://localhost:<port><path>` or `http://127.0.0.1:<port><path>` with any port.

**Authorize, GET.** Requires `response_type=code`, an accepted `client_id` and `redirect_uri`,
`code_challenge` with `code_challenge_method=S256`, and `resource` equal to `https://HOST/mcp`
(compared with a lower-cased scheme and host, trailing slash ignored). `scope` is cut to
`openid email profile`; an empty result uses all three. A failure before the redirect URI is
trusted answers a 400 HTML page; after, a 302 to the redirect URI with `error` and the client's
`state`. On success it answers a consent page: "Claude (`<redirect host>`) is asking to use DIY
Accounting Submit as you", the redirect URI's host in bold, an extra line when the redirect is
loopback ("a program on this computer"), and one Continue button that POSTs the `consent` blob
back. The page sends `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
form-action 'self'; frame-ancestors 'none'` and `X-Frame-Options: DENY`. The consent step is
what the spec's confused-deputy rule requires of a facade that forwards many clients through one
upstream client id.

**Authorize, POST.** Verifies the `consent` blob and 302s to
`https://<cognito domain>/oauth2/authorize` with `response_type=code`, Cognito's MCP client id,
`redirect_uri=https://HOST/mcp/oauth/callback`, the client's `code_challenge` and
`code_challenge_method=S256`, the cut scope, and `state` set to the `upstream` blob. `resource`
is not forwarded: the classic hosted UI has no use for it, and the facade has already checked it.

**Callback.** Verifies the `upstream` blob from `state`. On a Cognito `error`, 302s it to the
client's redirect URI with the client's `state`. Otherwise 302s to the client's redirect URI
with `code` set to a `code` blob wrapping Cognito's code, and the client's `state`.

**Token, `authorization_code`.** Body is form-urlencoded (base64-decoded first when API Gateway
marks it so). Verifies the `code` blob, requires its `clientId` and `redirectUri` to equal the
request's `client_id` and `redirect_uri`, requires `resource` (when sent) to equal
`https://HOST/mcp`, then POSTs to Cognito's `/oauth2/token` with `grant_type=authorization_code`,
Cognito's MCP client id, Cognito's code, `redirect_uri=https://HOST/mcp/oauth/callback` and the
client's `code_verifier`. Cognito checks PKCE and single use. The answer to the client is
`{access_token, token_type: "Bearer", expires_in, refresh_token, scope}`; the `id_token` is
dropped, because its `iss` is Cognito's and would fail an OIDC client's check against the
facade's issuer.

**Token, `refresh_token`.** Forwards `refresh_token` with Cognito's MCP client id. With refresh
token rotation on the Cognito client, Cognito returns a new refresh token and the facade passes
it through. Cognito's `invalid_grant` passes through as `invalid_grant` with status 400; any
other Cognito failure answers 400 `invalid_grant` too, since the client's only recovery is a new
sign-in either way.

**Revoke.** Forwards `token` to Cognito's `/oauth2/revoke` with the MCP client id; answers 200
whatever Cognito says, per RFC 7009.

Every facade response is JSON except the consent and error pages and the 302s. The facade logs
client id, redirect host and outcome; never a code, token, verifier or blob.

### Token validation at `/mcp`

`mcpHttp` verifies the bearer with `aws-jwt-verify`, the library and settings
`app/functions/auth/customAuthorizer.js` uses, through its generic `JwtVerifier` so the issuer
comes from configuration: `issuer` = `MCP_TOKEN_ISSUER`, `jwksUri` = `MCP_TOKEN_JWKS_URI`,
`audience: null`, and a `customJwtCheck` requiring `token_use === "access"` and
`client_id === MCP_TOKEN_CLIENT_ID`. Deployed, those are the pool's issuer, its JWKS and the MCP
client id. Cognito access tokens carry no `aud` from the classic hosted UI; `client_id` names a
client only this surface and the stdio server use, which is the check the spec's "otherwise
verify that they are the intended recipient" allows. The verifier is created once per container
and exported so the system test can `cacheJwks` a local key pair.

The customAuthorizer's mid-session country check is not run here: the viewer country on `/mcp`
is Anthropic's egress, not the user's, and a mismatch triggers a global sign-out. The downstream
API calls the Lambda makes come from AWS London, and the custom authoriser checks those as it
does for every caller.

A missing, malformed, expired or wrong-client token answers 401 with
`WWW-Authenticate: Bearer resource_metadata="https://HOST/.well-known/oauth-protected-resource/mcp", scope="openid email profile"`
and, for a token that was present, `error="invalid_token"`. The body is a JSON-RPC error with no
`id`.

**Forwarding the token.** The Lambda calls this service's own `/api/v1/*` routes with the same
Cognito access token, as the stdio server does. The token was issued by this service's own
authorization server for the MCP client, which those routes already accept; the spec's
passthrough rule is about upstream services with their own authorization servers, which this is
not.

### The MCP Lambda

**Transport.** `mcp/lib/http.js` exports `handleMcpRequest(request, { session, toolNames })`
returning a `Response`. Per request it builds a fresh `McpServer` (`createServer`) and a
`WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` 1.30.0 with
`sessionIdGenerator: undefined` (stateless) and `enableJsonResponse: true`, connects them, and
returns `transport.handleRequest(request)`. JSON responses only: API Gateway buffers, so SSE
gains nothing, and every tool answers inside one request. The SDK checks `Accept`,
`MCP-Protocol-Version` (400 on an unsupported one) and answers 202 to notifications.

**Sessions.** The SDK's own stateful mode keeps sessions in process memory, which Lambda does not
keep between containers. The Lambda keeps them itself:

- On a POST whose body is an `initialize` request, it creates a session id
  (`crypto.randomUUID()`), writes `{sessionId, hashedSub, cloud: null, ttl}` to
  `<env>-env-mcp-sessions`, and adds `Mcp-Session-Id` to the response.
- Every other POST requires `Mcp-Session-Id`: missing answers 400; unknown, expired, or owned by
  another `hashedSub` answers 404, which tells the client to initialize again.
- DELETE deletes the item and answers 204.
- The session item holds only the cloud book pointer `{bookId, clientId, etag}` that
  `open_book` sets. Before a tool that needs a loaded book, the Lambda reloads that book through
  `restoreCloudBook(session, pointer)` (book-tools.js), with a per-container cache keyed
  `hashedSub:bookId:etag`. After the call, a changed pointer is written back. `ttl` is 24 hours,
  refreshed on each write.

Table: partition key `sessionId` (string), TTL attribute `ttl`, on-demand, PITR on, in
`DataStack.java` beside the async request tables, named `<env>-env-mcp-sessions`
(`SubmitSharedNames.mcpSessionsTableName`).

**Credentials.** The tools read the session bearer from `auth.js` today. They change to read it
from the session: `createSession({ credentials })`, where `credentials` is
`{ accessToken: () => Promise<string>, idToken: () => Promise<string|null> }`. stdio passes
`storedCredentials` (auth.js's existing file-backed pair, which becomes the default); the Lambda
passes the request's bearer and `idToken: async () => null`. `callSubmitApi(session, path,
options)` takes the session first and sends `X-Id-Token` only when `idToken()` answers one.
`book-tools.js`, `practice-tools.js` and `batch-tools.js` pass the session through. The session
also carries `pollBudgetMs` (stdio unbounded as today, hosted 20 000), which `pollUntilSettled`
stops at with an error naming the poll URL, so a tool call ends inside the API Gateway's 30 s.

**The hosted tool set.** `mcp/lib/hosted-tools.js` exports `HOSTED_TOOL_NAMES` and two
overrides; `createServer(session, { toolNames, overrides })` registers only those names, with the
overrides replacing a tool's description, schema and handler. `registerItsaTools` becomes an
`ITSA_TOOLS` map like `TOOLS` so the filter covers it.

| Hosted | Tool | Note |
|---|---|---|
| yes | `open_book` | Override: cloud only, schema `{bookId, clientId?}` |
| yes | `derive_vat_return`, `derive_micro_entity_accounts`, `derive_small_company_accounts` | Unchanged |
| yes | `derive_itsa_quarterly_update` | Unchanged |
| yes | `derive_itsa_annual_submission` | Override: no `path` |
| yes | `get_vat_receipt` | Reads a stored receipt; no HMRC call |
| yes | `preview_micro_entity_accounts`, `submit_micro_entity_accounts`, `poll_accounts_submission` | The company code passes on the one call, as decision 5 allows |
| yes | `get_confirmation_statement_data`, `preview_confirmation_statement`, `submit_confirmation_statement`, `poll_confirmation_statement` | Same |
| yes | `list_clients`, `add_client`, `move_book_to_client` | Unchanged |
| no | `sign_in`, `sign_out` | The connector owns sign-in |
| no | `save_book`, `write_finance_package` | Filesystem; no edit tool on this server changes a cloud book |
| no | `list_vat_obligations`, `submit_vat_return`, `invite_client`, `client_authorisation_status` | Reach HMRC; see the horizon below |
| no | `run_for_clients` | A fan-out over every client does not fit one 30 s request |

**The Lambda handler.** `app/functions/mcp/mcpHttp.js`, `ingestHandler(event)`:

1. `Origin` present and not in `MCP_ALLOWED_ORIGINS` (`https://claude.ai`, `https://claude.com`
   and the deployment's own base URL): 403.
2. GET: 405 with `Allow: POST, DELETE`.
3. Verify the bearer (above): 401 on failure.
4. Resolve the session (above).
5. Build a `Request` from the event (`https://HOST/mcp`, method, headers, body decoded from
   base64 when marked), call `handleMcpRequest`, map the `Response` to
   `{statusCode, headers, body}`, add `Mcp-Session-Id` on initialize.
6. Write the session pointer back when it changed.

It imports the transport through `mcp/lib/http.js` only, so the SDK resolves from
`mcp/node_modules`. Environment: `DIYA_SUBMIT_BASE_URL` (the deployment's base URL, for the
tools' own API calls), `MCP_TOKEN_ISSUER`, `MCP_TOKEN_JWKS_URI`, `MCP_TOKEN_CLIENT_ID`,
`MCP_PUBLIC_HOSTS`, `MCP_ALLOWED_ORIGINS`, `MCP_SESSIONS_DYNAMODB_TABLE_NAME`, and the salt
access `hashSub` needs. 1024 MB (the diya-gl engine and happy-dom), timeout 28 s (the
`AbstractLambdaProps` default), reserved concurrency 10.

**The OAuth Lambda.** `app/functions/mcp/mcpOauth.js`, `ingestHandler(event)`, dispatches on
the path (and `{action}`). Helpers: `app/lib/mcpOauthBlob.js` (sign and verify),
`app/lib/mcpOauthClients.js` (CIMD fetch, DCR answer, the redirect allowlist). Environment:
`MCP_PUBLIC_HOSTS`, `MCP_UPSTREAM_AUTHORIZE_URL`, `MCP_UPSTREAM_TOKEN_URL`,
`MCP_UPSTREAM_REVOKE_URL`, `MCP_UPSTREAM_CLIENT_ID`, `MCP_OAUTH_BLOB_KEY_SECRET_ARN`. Deployed,
the upstream URLs are the Cognito custom domain's `/oauth2/*` endpoints. 256 MB, timeout 8 s.

### CDK changes

| File | Change |
|---|---|
| `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java` | MCP client: add `https://<host>/mcp/oauth/callback` for every host `buildAuthHosts` returns, beside the loopback URLs; refresh token rotation on (`CfnUserPoolClient` override `RefreshTokenRotation {Feature: ENABLED, RetryGracePeriodSeconds: 10}`), with explicit auth flows that leave out `ALLOW_REFRESH_TOKEN_AUTH`, which rotation requires; the `<env>/submit/mcp/oauth-blob-key` secret (`generateSecretString`, 64 chars) and its ARN in SSM `/submit/<env>/mcp-oauth-blob-key-arn` |
| `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java` | `<env>-env-mcp-sessions` table, TTL via `ensureTimeToLive` |
| `infra/main/java/co/uk/diyaccounting/submit/stacks/McpStack.java` (new) | Two `ApiLambda`s on the `DiyaGlStack` pattern: `mcpHttp` (`ANY /mcp`) and `mcpOauth` (`GET /.well-known/oauth-authorization-server` as the primary route; the two protected-resource paths and `ANY /mcp/oauth/{action}` added with a copy-with-new-path helper like `DiyaGlStack.onSecondPublishedPath`, extended to take a method). Grants: sessions table read/write to `mcpHttp`, the salt via `SubHashSaltHelper`, `secretsmanager:GetSecretValue` on the blob key to `mcpOauth` |
| `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | `mcpStackId`, the two handlers' names, ARNs, alias ARNs, methods and paths, `mcpSessionsTableName` |
| `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java` | Build `McpStack` with the MCP client id (`COGNITO_MCP_CLIENT_ID`), the pool id and Cognito domain; add its `lambdaFunctionProps` to `routesStackLambdaFunctions`; `apiRoutesStack.addStackDependency(mcpStack)` |
| `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java` | Behaviours `/mcp`, `/mcp/*` and `/.well-known/oauth-*` with `createBehaviorOptionsForApiGateway(apiGatewayUrl, diyaGlApiResponseHeadersPolicy, fraudPreventionHeadersPolicy)`, the same as `/api/v1/*`; no `errorResponses` anywhere (the distribution-level rule stands). WAF: the 2000-per-5-minutes per-IP rate rule gets a scope-down that leaves out paths starting `/mcp` and `/.well-known/oauth-`, and a new rate rule for those paths aggregates on the `Authorization` header (custom key), because every Claude user arrives from the same `/21` |
| `Dockerfile` | Builder stage also runs `npm ci --omit=dev --ignore-scripts` in `mcp/`; final stage copies `mcp/package.json`, `mcp/lib` and `mcp/node_modules` |
| `.github/workflows/deploy.yml`, `destroy-ci.yml`, `destroy-prod.yml`, `stack-drift.yml`, `scripts/ci/select-jobs.mjs` | `McpStack` wherever `DiyaGlStack` appears; `deploy-api` needs `deploy-mcp` |

The `/mcp` POST bodies stay under the WAF's 8 KB body rule (`OversizedBodyOutsideBookWrite`);
`open_book` takes an id, never bytes.

### Express parity and environment files

- `app/functions/mcp/mcpHttp.js` and `mcpOauth.js` each export `apiEndpoint(app)`, registered in
  `app/bin/server.js` before the static middleware. `/mcp` uses its own small adaptor that sends
  the handler's body verbatim (the shared `buildHttpResponseFromLambdaResult` JSON-parses it and
  turns a 202's empty body into `{}`). `/mcp/oauth/token`, `/mcp/oauth/revoke` and the consent
  POST rebuild the form body as `new URLSearchParams(req.body).toString()` into `event.body`,
  because the server's global `express.urlencoded` has already parsed it. The `.well-known`
  routes register as GET.
- `.env.proxy` and `.env.simulator` point `MCP_TOKEN_*` and `MCP_UPSTREAM_*` at the local mock
  OAuth2 server's `mcp` issuer (`http://localhost:8080/mcp`); `mock-oauth2-config.json` gains a
  token callback for `issuerId: "mcp"` whose claims carry `token_use: "access"` and
  `client_id: "mcp-local"`. `.env.ci` and `.env.prod` leave them to the CDK, which sets them on
  the Lambda. `.env.test` sets fixed values the unit tests use.

### Tests

| Tier | File | Covers |
|---|---|---|
| Unit (mcp) | `mcp/test/http.test.js` | `handleMcpRequest`: initialize, `tools/list` names equal `HOSTED_TOOL_NAMES`, a `tools/call` of `derive_vat_return` on a session restored from the BrickWork Pro fixture, 202 for a notification, 400 for a bad `MCP-Protocol-Version` |
| Unit (mcp) | `mcp/test/hosted-tools.test.js` | The set and both overrides; `open_book` refuses without `bookId` |
| Unit (mcp) | `submit-tools.test.js`, `practice-tools.test.js`, `book-tools.test.js` | The session's credentials reach the request headers; no `X-Id-Token` when `idToken()` answers null; the poll budget stops |
| Unit | `app/unit-tests/functions/mcpHttp.test.js` | 401 with the exact `WWW-Authenticate` when the token is missing, expired, or another client's; 403 on a bad `Origin`; 405 on GET; session create, 400 without the header, 404 for another user's session, DELETE |
| Unit | `app/unit-tests/functions/mcpOauth.test.js` | Both metadata documents byte for byte; DCR allow and refuse; CIMD host refusal before fetch, mismatch refusal; authorize refusals (no PKCE, `plain`, wrong `resource`, unknown redirect); consent page headers; callback relay with the client's `state`; token exchange forwards the verifier and Cognito's redirect URI, rejects a code blob for another client or redirect, drops `id_token`; `invalid_grant` passthrough; no secret in any log line |
| Unit | `app/unit-tests/lib/mcpOauthBlob.test.js` | Round trip; tampered MAC, wrong `typ`, expiry |
| System | `app/system-tests/mcpHosted.system.test.js` | The Express server on the simulator lane, an SDK `Client` with `StreamableHTTPClientTransport` and a token signed by a key the test caches into the verifier: initialize, `tools/list`, `open_book` against the local DIYA-GL storage, `derive_micro_entity_accounts` |
| CDK | `infra/test/java/.../stacks/McpStackTest.java`, `IdentityStackTest.java`, `EdgeStackTest.java`, `DataStackTest.java` | The routes and that none has an authoriser; the callback URLs and rotation; the three behaviours and no error responses; the WAF scope-down; the table and TTL |
| Behaviour | `behaviour-tests/mcpHosted.behaviour.test.js` (`npm run test:mcpHostedBehaviour-ci`) | The whole chat-client flow on a ci slot host: POST `/mcp` without a token, follow the 401 to the PRM and the facade metadata, register, open the authorize URL in Playwright with a loopback redirect, Continue, sign in as the lane's native test user with TOTP, catch the redirect with `page.route`, exchange the code, refresh once, then `tools/list` and `derive_vat_return` over the BrickWork Pro book saved to the user's cloud. `scripts/toggle-cognito-native-auth.js` adds `COGNITO` to the MCP client too |

### Build steps

Each step is one sub-agent and one squash commit; the order is the dependency order. Steps 1, 2
and 4 can run at once.

| # | Step | Files | Model |
|---|---|---|---|
| 1 | Session credentials and poll budget: `createSession({credentials})`, `storedCredentials`, `callSubmitApi(session, …)`, `restoreCloudBook` | `mcp/lib/auth.js`, `mcp/lib/book-tools.js`, `mcp/lib/submit-tools.js`, `mcp/lib/practice-tools.js`, `mcp/lib/batch-tools.js`, `mcp/test/submit-tools.test.js`, `mcp/test/practice-tools.test.js`, `mcp/test/book-tools.test.js` (8) | Sonnet |
| 2 | OAuth facade Lambda and helpers, with Express routes | `app/functions/mcp/mcpOauth.js`, `app/lib/mcpOauthBlob.js`, `app/lib/mcpOauthClients.js`, `app/unit-tests/functions/mcpOauth.test.js`, `app/unit-tests/lib/mcpOauthBlob.test.js` (5) | Opus |
| 3 | Hosted tool set and the HTTP transport (after 1) | `mcp/lib/itsa-tools.js`, `mcp/lib/server.js`, `mcp/lib/hosted-tools.js`, `mcp/lib/http.js`, `mcp/test/hosted-tools.test.js`, `mcp/test/http.test.js` (6) | Sonnet |
| 4 | Sessions table and identity changes | `IdentityStack.java`, `DataStack.java`, `SubmitSharedNames.java` (table name, secret SSM name), `IdentityStackTest.java`, `DataStackTest.java` (5) | Sonnet |
| 5 | MCP Lambda handler and session repository (after 3) | `app/functions/mcp/mcpHttp.js`, `app/data/dynamoDbMcpSessionRepository.js`, `app/unit-tests/functions/mcpHttp.test.js` (3) | Sonnet |
| 6 | Express parity, environment files, system test (after 2 and 5) | `app/bin/server.js`, `.env.proxy`, `.env.simulator`, `.env.test`, `mock-oauth2-config.json`, `app/system-tests/mcpHosted.system.test.js` (6) | Sonnet |
| 7 | McpStack, wiring and image (after 4 and 5); also the facade blob-key secret and its name in `SubmitSharedNames.java`, which step 4 left out | `McpStack.java`, `SubmitSharedNames.java`, `SubmitApplication.java`, `McpStackTest.java`, `Dockerfile` (5) | Sonnet |
| 8 | Edge and workflows (after 7) | `EdgeStack.java`, `EdgeStackTest.java`, `.github/workflows/deploy.yml`, `destroy-ci.yml`, `destroy-prod.yml`, `stack-drift.yml`, `scripts/ci/select-jobs.mjs`, `REPORT_CAPABILITIES.md` (8) | Sonnet |
| 9 | Behaviour test and the public page (after a ci deploy of 8) | `behaviour-tests/mcpHosted.behaviour.test.js`, `playwright.config.js`, `package.json`, `scripts/toggle-cognito-native-auth.js`, `web/public/mcp.html`, `mcp/README.md` (6) | Sonnet |

What step 2 settled that steps 6, 7 and 9 build on:

- The consent POST requires the `__Host-mcp_consent` cookie the GET set (`Secure; HttpOnly;
  SameSite=Strict`), so a cross-site POST of a consent blob cannot skip the click. The system
  test keeps cookies between GET and POST; a browser does that on its own.
- `MCP_OAUTH_BLOB_KEY` (a raw key of 32 or more characters) is read before
  `MCP_OAUTH_BLOB_KEY_SECRET_ARN`. Step 6 sets the raw key in `.env.proxy`, `.env.simulator` and
  `.env.test`; step 7 sets only the ARN.
- `apiEndpoint(app)` is in `mcpOauth.js` already, form-body rebuild and verbatim body included;
  step 6 calls it from `server.js` and leaves `mcpOauth.js` alone.
- The issuer and every endpoint are `https://HOST`, and a host outside `MCP_PUBLIC_HOSTS` gets 400.
  A plain-http local lane sets `MCP_PUBLIC_HOSTS` to its host and still advertises https URLs, so
  the simulator system test calls the handlers directly or runs over HTTPS.
- A refresh needs `client_id` to be `diya-submit-dcr` or a well-formed claude.ai or claude.com
  CIMD URL (format only). The code grant returns the scope cut at authorize; a refresh omits it.
- Upstream Cognito token and revoke calls time out at 6 s, inside the 8 s Lambda timeout.

Done when step 9 passes on a ci slot host and the operator has added
`https://submit.diyaccounting.co.uk/mcp` as a custom connector in Claude and run
`derive_micro_entity_accounts` on a cloud book; that run is the M8 hosted recording.

### Horizons

- **HMRC tools on the hosted surface.** Three pieces are open: the HMRC grant as a link the tool
  returns with the token kept server-side (decision 5), a fraud-prevention header profile for a
  chat client reaching HMRC through two sets of servers (HMRC's `OTHER_VIA_SERVER` asks for 17
  headers, several of which describe a device this surface never sees, so the profile wants
  HMRC's agreement), and a Cognito client id distinct from the stdio one so
  `buildFraudHeaders.js` can tell the two apart. Until then those four tools stay off the hosted
  list.
- **Audience binding.** Moving the pool domain to managed login (version 2) makes Cognito honour
  `resource` and set `aud`; the facade then forwards `resource` and the verifier adds an `aud`
  check.
- **Anthropic-held credentials** (`oauth_anthropic_creds`) give the hosted Claude apps a stable
  client without CIMD, if a directory listing wants one.

## Sequence

Each row is a `claude/mcp-<n>-<topic>` branch and PR. Rows 1 to 3 need no credentials and no
published package beyond a `file:` dependency, so they can start now; the first merge waits
for H7.

| Row | What | Waits on | Owner, model |
|---|---|---|---|
| M1 | The package skeleton at `mcp/`: the SDK, stdio transport, `open_book`, `save_book` over the filesystem, `derive_vat_return`, `derive_micro_entity_accounts`; unit tests over the BrickWork Pro Ltd example and the Precision Code Ltd example; the seven derived lines for BrickWork Pro passed through `buildMicroEntityAccounts` and the public validator script | a `file:` dependency on the sibling `diya-gl/` | Claude Code, Opus for the derivation mapping, Sonnet for the rest M1 runs as three `NEXT.md` rows since 2026-09-15: M1a the skeleton, transport and the two book tools; M1b `derive_vat_return`; M1c `derive_micro_entity_accounts`. |
| M2 | The Submit-facing tools over the deployed REST API with a bearer token from the environment, against the simulator lane first: obligations, VAT submit, receipt, accounts preview, submit and poll | M1 | Claude Code, Sonnet |
| M3 (on main) | The third Cognito app client, its JWT authoriser and the authorization code grant with PKCE on a loopback redirect; `open_book` and `save_book` over the DIYA cloud routes | M1; the DIYA-GL client pattern in `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_DIYA_GL_STORAGE.md` | Claude Code, Sonnet; the CDK change through the usual deploy |
| M4 | The hosted transport: a Lambda with streamable HTTP behind API Gateway on the existing domain, the resource-server metadata, and the OAuth flow end to end from a chat client; design and build steps in "The hosted surface (M4)" above | M3 | Claude Code, Sonnet (step 2 Opus) |
| M5 | Distribution: `npm publish` from this repo on a tag, the Docker image on GHCR, `web/public/mcp.html` rewritten as the real instructions | M2; H7 on the spreadsheets board for the dependency | Claude Code, Haiku |
| M6 | The Companies House proof: BrickWork Pro's derived accounts filed to the XML Gateway test service through the MCP | M2; NEXT.md B34.6c | Claude Code, Sonnet |
| M7 | The VAT proof: a derived return filed through the MCP against HMRC's sandbox with the existing test user | M2 | Claude Code, Sonnet |
| M8 | A video for the npm CLI, a video for the Docker image, and a video for the hosted MCP, published as each surface ships | M4 for the hosted video; M5 for the npm and Docker videos | Claude Code, Haiku |

## Videos

A video for each surface, published as that surface ships: the npm CLI, the Docker image, and
the hosted MCP in a chat client.

The npm CLI and the Docker image run the same stdio server, so both videos are captured through
the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)'s web UI, driven by a
scripted tool call against the BrickWork Pro Ltd example, the way MCP2 captures the diya-gl
server. The hosted MCP has no scriptable client yet, so its video is a manual recording in a
chat client such as Claude Desktop.

Each video is added to `videos/publish.json` and appears on `videos.html` and on `mcp.html`'s
submission MCP section once its surface ships.

## Verification

- The seven lines `derive_micro_entity_accounts` returns for BrickWork Pro equal the published
  balance sheet the DIYA-GL page shows for the same example, and the prior-year lines equal its
  opening balance sheet.
- `derive_vat_return` for each of the example's four VAT periods equals the `vat-returns` view
  on the DIYA-GL page, box by box.
- A generated set of accounts from derived figures gets `RESULT: valid` from the Companies
  House validator (`npm run validate:accounts-ixbrl` accepts a file path).
- The behaviour suites `fileMicroEntityAccountsBehaviour` and `submitVatBehaviour` are
  unchanged: the MCP calls the same endpoints, so their coverage is the endpoints' coverage.
- No credential appears in a tool result, a log line or a saved book.
- A video for each shipped surface (npm CLI, Docker, hosted MCP) is live on `videos.html` and on
  `mcp.html`.

## Dependencies outside this repository

| Dependency | Where | State |
|---|---|---|
| `NPM_TOKEN` secret, then the `diya-gl-v1.0.0` tag | spreadsheets board H7, operator | Ready to start; nothing else blocks publication |
| The published package's API surface staying as `books-interchange.js` and `calculators/ltd.js` expose it today | spreadsheets repo | Landed; pin the version |
| The `vat-returns` view's period boundaries matching HMRC obligation dates | spreadsheets engine (`buildVatReturns`); straddling periods are a named horizon in that repo's Ltd plan | Open on that side |
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

- `../private.diyaccounting.co.uk/finance/PLAN_FINANCE_AUTOMATION.md` phase 2 wants an MCP that writes a populated package from
  staged sources. That is `save_book` plus the diya-gl package's `edit_lines`; the parsers it
  needs are that plan's backlog rows, not this plan's.
- `PLAN_ONE_STOP_DASHBOARD.md` shows the company's own P&L and balance sheet by running the
  same derivation over the company's own book.
- `PLAN_COMPANIES_HOUSE.md`, `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_DIYA_GL_STORAGE.md`,
  `_developers/CSV_VAT_RETURN_CONTRACT.md`.
