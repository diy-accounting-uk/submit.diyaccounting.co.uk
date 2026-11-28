<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: The hosted MCP launched on prod

## Operator assertions (verbatim)

> "The changes I want are: The FSB offer chain, the donators offer chain, the CT in prod chain." (operator, 2026-11-24)

The operator asked to keep only those three chains and the defects on `NEXT.md`. This plan holds the tasks that left it.

> "Yes" (operator, 2026-11-28, to MCP5 and MCP6: a cloud book started from the Companies House register, and links to the filled-in accounts and CT600 forms, so that a chat assistant can take a limited company from the register to its accounts and Company Tax Return.)

> "Yes" (operator, 2026-11-28, to: add diya-gl's bookkeeping tools to Submit's hosted connector, read tools first after ODSC1, then a design for write tools with cloud save and undo, then its build; one connector for the customer, with diya-gl's local stdio server kept for books on disk.)

Recorded in MCP1's row: the operator approved the launch on 2026-11-22, each tool going on prod's connector when its journey is live on prod; the listings go ahead with the VAT tool set (operator, 2026-11-12); source operator, 2026-10-30.

## Goal

Prod's hosted MCP connector offers each filing tool as its journey goes live, with the harness behind an operator-only activity and the listings current.

**Status**: 6 open tasks (MCP1 to MCP6), tracked here, not on `NEXT.md`.

## Facts the tasks share

The harness page `web/public/mcp-harness.html` loads scripts from `web/public/mcp-harness/<name>.json` (`?script=<name>`); its call endpoint `/api/v1/dev/mcp-harness/call` exists on the local Express server only (`app/bin/server.js`), so a harness proof runs locally (MCP1). The hosted MCP tools read the session's HMRC grant through `hmrcGrantFor` in `mcp/lib/submit-tools.js` (line 167) (MCP1). Prod's hosted connector has eleven tools, `prepare_vat_return` and `derive_company_tax_return` among them (`PROD_HOSTED_TOOL_NAMES` in `mcp/lib/hosted-tools.js`, line 70). The availability facts: `web/public/mtd-calendar.html` is generated. Its availability table is `AVAILABILITY` in `scripts/build-mtd-calendar.mjs` (line 128) and its dates come from `.claude/skills/tax-sources/sources`, so a change edits those and runs `npm run build:mtd-calendar`.

## Tasks

| Label | Class | State | Blocked by | Unblocks | Repository |
| --- | --- | --- | --- | --- | --- |
| MCP1 | machine-only | blocked | UH1, UH3 (`PLAN_ITSA_APPROVAL.md`) | nothing | submit |
| MCP2 | machine-only | blocked | ODSC1 (`NEXT.md`) | nothing | submit |
| MCP3 | machine-only | ready | nothing | MCP4 | submit |
| MCP4 | machine-only | blocked | MCP3, MCP2 | MCP5 | submit |
| MCP5 | machine-only | blocked | MCP4 | nothing | submit |
| MCP6 | machine-only | blocked | MCP2 | nothing | submit |

Model, size and repository are in each entry. "Blocked by" lists the tasks and events not yet done.

## Briefs

### MCP1. The hosted MCP launched on prod: every tool, the harness, and the listing

Prod's hosted tools are `PROD_HOSTED_TOOL_NAMES` in `mcp/lib/hosted-tools.js` (line 70): the book tools, the VAT, accounts and Company Tax Return derivations, `prepare_vat_return`, `company_filing_deadlines` and the stored receipts. `web/public/mcp-harness.html` is behind the page guard. MCP1 widens both and launches the MCP: each tool beyond VAT enabled on prod as the journey it files goes live (Income Tax, `PLAN_ITSA_APPROVAL.md` UH3; practice, UH1; the CT600 journey is live on prod, and its derivation tool is on prod's connector), the harness on prod behind an operator-only activity, each tool's entry back on `web/public/mcp.html`, which lists only prod's tools, the accounts and confirmation statement tools renamed from `*_sandbox` now that RL2d lists them on prod's MCP page, and each of those tools added to the connector's directory listings as it goes live (the listings themselves go ahead with the VAT tool set, operator 2026-11-12: `PLAN_ORGANIC_SEARCH.md` rows OOS17 and OOS18); the availability table and dates on `web/public/mtd-calendar.html` change in the same change. Blocked on: UH1 and UH3 (`PLAN_ITSA_APPROVAL.md`) for the tools. The operator approved the launch on 2026-11-22: each tool goes on prod's connector when its journey is live on prod. **Source**: operator, 2026-10-30. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files. **Class**: machine-only. **State**: blocked. **Blocked by**: UH1, UH3 (`PLAN_ITSA_APPROVAL.md`). **Unblocks**: nothing.

### MCP2. diya-gl's read tools on the hosted connector

Add diya-gl's read tools `report`, `trial_balance`, `checks`, `lines`, `chart` and `book` (`TOOLS` in `../spreadsheets.diyaccounting.co.uk/app/lib/mcp/diya-gl-tools.js`) to the hosted connector, each against the session's book that `open_book` loads (`mcp/lib/book-tools.js` `openBook`, the cloud branch at line 181). Submit's `mcp/` already depends on `@diy-accounting-uk/diya-gl` (1.2.99, `mcp/package.json` line 37), so the engine is in process. Register them in `mcp/lib/server.js`, add them to `HOSTED_TOOL_NAMES` and `PROD_HOSTED_TOOL_NAMES` (`mcp/lib/hosted-tools.js`, lines 24 and 71) with the `READS` annotation, add the prod instructions' sentence for them, and update `mcp/test/hosted-tools.test.js` (prod's set and instructions) and `mcp/test/plugin.test.js` (the skill calls exactly prod's tools). Wording: "your records", "DIYA-GL book", never "your books". Land after OpenAI approves 0.1.7 (ODSC1), because OpenAI scans the connector's tool set every day and a change mid-review risks the review. The ChatGPT listing text changes only by a new ZIP and review: the subtitle can then claim bookkeeping (the "accounting software" search of 2026-11-28 shows Nella Finance AI and Vibooks with "bookkeeping" in their subtitles, and DIY Accounting Submit absent). Gates: `npm ci` then `npm test` in `mcp/`. **Model**: Sonnet. **Size**: ~5 files.

### MCP3. Design: diya-gl's write tools on the hosted connector, with a save and an undo

Design how `edit_lines`, `new_book`, `new_book_from_register`, `roll_forward`, `extract_book` and `save_workbook` work on the hosted connector, where the server has no disk the caller reaches (`mcp/lib/hosted-tools.js` line 21). The store is the DIYA cloud book only (operator, 2026-11-28): `save_book` with `cloud: true` and its `if-match` etag (`mcp/lib/book-tools.js` line 55); each write keeps the previous version so that a wrong AI edit can be undone, with an undo tool; the tool annotation is `CHANGES_OUTSIDE`. `extract_book` becomes an import into a cloud book from a file the person uploads on the Submit site, and `save_workbook` a download link from the Submit site. Name: the size limit against a year's lines, the review risk at OpenAI and at Claude's directory, the actor and activity events, and the prod instructions' sentences. Write the design into this section as the brief of MCP4, with its files and tests. **Model**: Opus. **Size**: 1 file.

### MCP4. Build: diya-gl's write tools on the hosted connector

Build MCP3's design. The brief is MCP3's output in this plan. **Model**: Sonnet. **Size**: from MCP3.

### MCP5. A cloud book started from the Companies House register

A hosted tool starts the DIYA cloud book of a limited company's next accounting period from the register: it reads the company profile, the officers, the statement of capital with the shareholdings and the last filed accounts by company number through Submit's own Companies House reads (`app/functions/companies-house/companiesHouseCompanyGet.js`, `companiesHouseOfficersGet.js`, `companiesHouseFilingHistoryGet.js`, `companiesHousePublicRegisterGet.js`; the same path as `company_filing_deadlines` in `mcp/lib/server.js`), then runs diya-gl's `new_book_from_register` on the server (its input: profile, `officers`, holdings, `capitalDate`, `lastAccounts` from the filed iXBRL, optional `periodEnd`) and saves the result as a new cloud book by MCP4's save. With the filed accounts the opening balance sheet equals the filed closing one. The tool is `CHANGES_OUTSIDE` (it creates a cloud book); it registers on prod's connector with the accounts tools. Tests: a recorded register fixture for a micro-entity and a small company, the book's opening balances against the filed accounts, the officers and holdings in the book. **Model**: Sonnet. **Size**: ~5 files.

### MCP6. Links to the filled-in accounts and CT600 forms

`prepare_micro_entity_accounts`, `prepare_small_company_accounts` and `prepare_company_tax_return` follow `prepare_vat_return` (`mcp/lib/handoff-tools.js`, `vatHandoffLink`): each derives the figures again from the open book and gives the link to its form with the figures in the URL fragment (`#books=<base64url JSON>`, read by `web/public/lib/auth-url-builder.js` line 122), and files nothing. The forms are `web/public/companies-house/fileMicroEntityAccounts.html`, `fileSmallCompanyAccounts.html` and `fileCompanyTaxReturn.html` (and their Welsh pages); each page fills its fields from the fragment as the VAT form does, and the person checks, enters the authentication code or Government Gateway credentials, and files. Each tool goes on prod's connector when its journey is live on prod (MCP1's rule), with its sentence in the prod instructions ("Open this link, check the figures ... Nothing has been filed."). Tests: `mcp/test/` for each link's fragment, a browser case per form that opens a link and finds the fields filled, `mcp/test/hosted-tools.test.js` and `mcp/test/plugin.test.js`. **Model**: Sonnet. **Size**: ~8 files.

