<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# @diy-accounting-uk/diya-submit

The submission MCP for DIY Accounting Submit (`PLAN_SUBMISSION_MCP.md`). It opens a customer's
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

## Tools

| Tool | Does |
|---|---|
| `open_book` | Loads a book from a path: a directory of `book.toml` + `lines.jsonl`, or one file the engine reads (a workbook, a package zip, a diya-gl zip, a diya-gl JSON file). Answers the product, entity, period, line count and the book checks summary. |
| `save_book` | Writes the session's book to a path as `diya-gl-dir`, `diya-gl-zip`, `json`, `xlsx` or `zip`. The last two compose the product's workbook from the site's templates. |

One book per session, in memory. `open_book` replaces it.

## Test

```
npm --prefix mcp test
```

The tests open the BrickWork Pro Ltd and Precision Code Ltd example books under `test/fixtures/`
(copies of the spreadsheets repository's `examples/`) and round-trip each through the three
formats that need no template.
