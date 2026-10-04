<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the diya-gl MCP reads every detail of the book, and packages open with current figures

Changes in `../spreadsheets.diyaccounting.co.uk`, asked for through the spreadsheets inbox by
`chat-with-diya-gl` (2026-10-02, 2026-10-03) and `submit` (2026-10-02). The MCP server is
`app/lib/mcp/diya-gl-tools.js` (the `TOOLS` map is what `tools/list` advertises) behind
`app/lib/mcp/server.js`, shipped as `diya-gl/bin/diya-gl-mcp.js` in the npm package. Agents read
the published version's tool list, so each tool's `description` names the questions it answers.

Status: DG1 to DG4 open.

## Operator assertions (verbatim)

> the mcp should facilitate access to every detail of the accounts and it should advertise this availability

(operator decision, 2026-10-03, relayed by `chat-with-diya-gl`)

## Items

### DG1. Read tools over the loaded book

Today four tools (`extract_book`, `report`, `edit_lines`, `save_workbook`) and nothing reads the
book's detail, so "Who is my best customer?" gets "the books don't name customers". Add, each
reading the session's book (with the same optional `book`/`lines` bypass the others take):

1. `lines`: filter by journal, `accountMainID`, posting-date range, text on `detailComment` and
   `lineItemComment`, `documentReference`; group by customer (`detailComment`), account or month
   with count and sum; a `top` cap; totals in pence.
2. `chart`: the chart of accounts for the book's product (id, name, group, the report section it
   feeds).
3. `book`: book.toml's profile (product, period, trade, tax settings, bank accounts, journals
   present).
4. `checks`: every book check with its verdict and the offending entryNumbers.

Proof: `app/test/diya-gl-mcp.test.js` covers each tool through `tools/list` and `tools/call`; the
`diya-gl/smoke.sh` run lists eight tools.

### DG2. `report` attributes entryNumbers on every product

`report`'s `entryNumbers` option attributes Basic Sole Trader and Taxi Driver books only
(`app/lib/entry-attribution.js`, `app/lib/report-serializer.js`). Extend the attribution to Self
Employed and Limited Company so every figure carries its contributing entryNumbers, and drop the
"Attributed today" sentence from the tool description.

### DG3. `setLineReference` edit

An edit that sets one line's `documentReference`: `setLineReference { entryNumber,
documentReference }` in `app/lib/diya-gl-edits.js`, after `changeLineDetail`'s pattern (every
other field and the line's position unchanged; unknown entryNumber throws), added to `EDITS` in
`diya-gl-tools.js`. Today the fix is `removeLine` plus `addSaleLine`, which renumbers the entry.

### DG4. Packages open with current figures in LibreOffice

LibreOffice (desktop 26.2 and Collabora CODE) ignores `fullCalcOnLoad` on xlsx and shows each
formula cell's cached `<v>`. The generated Basic Sole Trader Apr27 package's Profit & Loss sheet
opens headed "TOTAL 2025-26" with months Apr-25 to Mar-26; `soffice --convert-to csv` on the
workbook reproduces it. `app/lib/generator.js` (`withFullCalcOnLoad`, `setFullCalcOnLoad`) and
`app/lib/product-workbook.js` set the flag and leave the template's cached values in place.

Two ways to fix it:

- (a) Drop `<v>` from every formula cell the generator writes out (keep `<f>`; leave the
  `t` attribute consistent). LibreOffice and Excel compute cells with no cached result on open.
  File previews that do not calculate (Quick Look, mail previews) show blanks.
- (b) Write fresh cached values: recalculate in LibreOffice at generate time and copy the
  results into `<v>`. Previews show figures; the generate step depends on LibreOffice.

Start with (a) unless the operator chooses (b). Link caches in multi-file packages are filled from
the calculator's figures already and stay. Proof: a test that converts the generated Apr27 BST
workbook with `soffice --convert-to csv` and finds "TOTAL 2026-27" and Apr-26; the same over one
SE and one Ltd package; `npm test`.
