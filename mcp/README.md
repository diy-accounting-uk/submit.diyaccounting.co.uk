<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability MCP-14 Document the submission MCP's plan and tool reference
- **Use when:** starting work on the submission MCP: what is built, planned, and how to run it.
- **Does:** ../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_SUBMISSION_MCP.md is the plan of record for the submission MCP: milestones, book-to-filing field mappings and open rows. mcp/README.md is the package's short reference: how to run it, test it, and its tools at time of writing.
- **Run:** `npm --prefix mcp install`; `npm --prefix mcp test`
- **Entry:** `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_SUBMISSION_MCP.md`; `mcp/README.md`
- **Files:** ../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_SUBMISSION_MCP.md, mcp/README.md
- **Keywords:** plan submission mcp, mcp readme, milestones, field mappings, plan of record
- **Related:** MCP-01
@end-capability -->

# @diy-accounting-uk/diya-submit

The submission MCP for DIY Accounting Submit (`../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_SUBMISSION_MCP.md`). It opens a customer's
books with the published `@diy-accounting-uk/diya-gl` engine, derives the figures a filing
needs, and drives the VAT return and the micro-entity accounts through this service's
endpoints. This package is the skeleton: the server, the stdio transport and the two book
tools. The derivation and filing tools are the plan's later rows.

## Run

```
npm --prefix mcp install
node mcp/bin/diya-submit-mcp.js
```

Point an MCP client at that command with no arguments. The server is `mcp/lib/server.js`; the
stdio entry point only connects it to stdin and stdout, so the hosted transport connects the
same server to a different one.

## Hosted

The same server runs behind the site at `/mcp`, for chat clients that connect by URL. Add
`https://submit.diyaccounting.co.uk/mcp` as a custom connector in Claude (web, Desktop, mobile or
Cowork), or in Claude Code:

```
claude mcp add --transport http diya-submit https://submit.diyaccounting.co.uk/mcp
```

The client finds the sign-in through `/.well-known/oauth-protected-resource/mcp`, registers itself, and
the user signs in with their Submit account. The ci form of the URL is
`https://ci-submit.diyaccounting.co.uk/mcp`. The hosted tool set is `HOSTED_TOOL_NAMES` in
`lib/hosted-tools.js`: `open_book` reads the DIYA cloud only. The sign-in pair, the filesystem tools,
the practice tools that still take an HMRC token, and `run_for_clients` are not registered.

## Tools

| Tool | Does |
|---|---|
| `open_book` | Loads a book from a path: a directory of `book.toml` + `lines.jsonl`, or one file the engine reads (a workbook, a package zip, a diya-gl zip, a diya-gl JSON file). Answers the product, entity, period, line count and the book checks summary. |
| `save_book` | Writes the session's book to a path as `diya-gl-dir`, `diya-gl-zip`, `json`, `xlsx` or `zip`. The last two compose the product's workbook from the site's templates. |
| `derive_itsa_quarterly_update` | One period of HMRC's Self Employment Business API from a self-employed book: the period's own figures in a tax year filed as dated period summaries, the running total from 6 April in a year filed as cumulative period summaries (2025-26 on). `periodEndDate` picks the period; `quarterlyPeriodType` is `standard` or `calendar`. A field the book cannot source is omitted, never sent as zero. |
| `derive_itsa_annual_submission` | The year's allowances and adjustments for the annual submission, restricted to the fields HMRC accepts for that tax year (`sa103-mtd-mapping.json`'s `api.years`). With `path`, also written as the JSON file the site's annual submission page imports. |
| `request_hmrc_authorisation` | HMRC's sign-in link for this session. `services` is `vat` (the default) and `itsa`; `hmrcAccount` is `live` (the default) or `synthetic`. Answers `url`, `expiresAt`, `scope`, `hmrcAccount`. The user grants access on HMRC's pages; Submit keeps HMRC's tokens and renews the access token for the rest of the session. No token reaches the chat. |
| `list_vat_obligations` | VAT obligations for `vrn` (or `clientId`), filtered by `from`, `to`, `status`. Uses the session's HMRC authorisation; optional `hmrcAccount` (the authorisation's own by default), `govTestScenario`. |
| `submit_vat_return` | Files the seven confirmed boxes (`vatDueSales`, `vatDueAcquisitions`, `vatReclaimedCurrPeriod`, `totalValueSalesExVAT`, `totalValuePurchasesExVAT`, `totalValueGoodsSuppliedExVAT`, `totalAcquisitionsExVAT`) for `periodStart` to `periodEnd`, for `vatNumber` or `clientId`. Uses the session's HMRC authorisation. Answers `receipt`, `periodKey`, `receiptId`. |
| `get_vat_receipt` | A stored receipt by `name` (`<receiptId>.json`); optional `clientId`. |
| `render_micro_entity_accounts_sandbox` | The rendered micro-entity iXBRL for confirmed figures, without reaching the Companies House gateway. Inputs: `companyNumber`, `companyName`, `periodStart`, `periodEnd`, `balanceSheet`, `averageEmployees`, `director`, `statementsAccepted`. |
| `render_small_company_accounts_sandbox` | The rendered small-company (FRS 102 section 1A) iXBRL for confirmed figures, without reaching the gateway. Inputs: `companyNumber`, `companyName`, `periodStart`, `periodEnd`, `averageEmployees`, `director`, `statementsAccepted` (four small-company statements) and `smallCompany` (`filleted`, `principalActivity`, `accountingPolicies`, `directors`, `balanceSheet`, `profitAndLoss`, `fixedAssetNote`). |
| `request_companies_house_codes` | A link where the user types the Companies House codes instead of the chat. `kind` is `accounts`, `confirmation-statement` (with `directors` in filing order) or `confirmation-statement-data`; answers `entryId`, `url`, `expiresAt`. The entry lasts ten minutes and one filing call uses it up. With `clientIds` (no `companyNumber`) the page asks for one code per practice client and each client's filing call, including through `run_for_clients`, takes only its own. |
| `submit_micro_entity_accounts_sandbox` | Files the same figures with the codes the user typed on that link, named by `codesEntryId`; answers `submissionNumber`. |
| `submit_small_company_accounts_sandbox` | Files the small-company figures with the codes named by `codesEntryId`, for `companyNumber` or `clientId`; answers `submissionNumber`. Poll it with `poll_submission` kind `accounts`. |
| `poll_submission` | The outcome of a Companies House filing, `kind` `accounts` or `confirmation-statement`, for a `submissionNumber`: `PENDING`, `ACCEPT` (with `receiptId`) or `REJECT` (with `rejections`). |

The filing tools call the deployed REST API at `DIYA_SUBMIT_BASE_URL` with the MCP's own sign-in bearer (`sign_in`), and poll a 202 answer to its terminal status. They validate required inputs before any request.

One book per session, in memory. `open_book` replaces it. The two ITSA tools live in `lib/itsa-tools.js`
and register through `registerItsaTools(server, session)`.

## Test

```
npm --prefix mcp test
npm --prefix mcp run test:system
```

`test:system` starts `npm run start:simulator` from the repository root, grants a bundle, starts an HMRC grant with `request_hmrc_authorisation` and completes it as the callback page would, then runs `list_vat_obligations`, `submit_vat_return` and `get_vat_receipt` against it, using whichever open obligation the simulator answers. `npm run test:mcpHmrcGrantBehaviour-simulator` (from the repository root) walks the same grant through HMRC's consent pages in a browser. The design is in `../../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_MCP.md`.

The tests open the BrickWork Pro Ltd and Precision Code Ltd example books under `test/fixtures/`
(copies of the spreadsheets repository's `examples/`) and round-trip each through the three
formats that need no template; the ITSA tests open the BrickWork Pro self-employed VAT book
(`examples/brickwork-pro/se-vat`) and check the quarterly running totals and the annual field set
by tax year.
