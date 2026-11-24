<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: The hosted MCP launched on prod

## Operator assertions (verbatim)

> "The changes I want are: The FSB offer chain, the donators offer chain, the CT in prod chain." (operator, 2026-11-24)

The operator asked to keep only those three chains and the defects on `NEXT.md`. This plan holds the tasks that left it.

Recorded in MCP1's row: the operator approved the launch on 2026-11-22, each tool going on prod's connector when its journey is live on prod; the listings go ahead with the VAT tool set (operator, 2026-11-12); source operator, 2026-10-30.

## Goal

Prod's hosted MCP connector offers each filing tool as its journey goes live, with the harness behind an operator-only activity and the listings current.

**Status**: 1 open task (MCP1), tracked here, not on `NEXT.md`.

## Facts the tasks share

The harness page `web/public/mcp-harness.html` loads scripts from `web/public/mcp-harness/<name>.json` (`?script=<name>`); its call endpoint `/api/v1/dev/mcp-harness/call` exists on the local Express server only (`app/bin/server.js`), so a harness proof runs locally (MCP1). The hosted MCP tools read the session's HMRC grant through `hmrcGrantFor` in `mcp/lib/submit-tools.js` (line 167) (MCP1). Prod's hosted connector has six tools, `prepare_vat_return` among them (`PROD_HOSTED_TOOL_NAMES` in `mcp/lib/hosted-tools.js`). The availability facts: `web/public/mtd-calendar.html` is generated. Its availability table is `AVAILABILITY` in `scripts/build-mtd-calendar.mjs` (line 128) and its dates come from `.claude/skills/tax-sources/sources`, so a change edits those and runs `npm run build:mtd-calendar`.

## Tasks

| Label | Class | State | Blocked by | Unblocks | Repository |
| --- | --- | --- | --- | --- | --- |
| MCP1 | machine-only | blocked | UH1, UH3 (`PLAN_ITSA_APPROVAL.md`), UH7 (`PLAN_HMRC_CT_APPROVAL.md`) | nothing | submit |

Model, size and repository are in each entry. "Blocked by" lists the tasks and events not yet done.

## Briefs

### MCP1. The hosted MCP launched on prod: every tool, the harness, and the listing

Prod's hosted tools are `PROD_HOSTED_TOOL_NAMES` in `mcp/lib/hosted-tools.js` (line 68): the books tools, `derive_vat_return`, `prepare_vat_return` and the stored VAT receipts. `web/public/mcp-harness.html` is behind the page guard. MCP1 widens both and launches the MCP: each tool beyond VAT enabled on prod as the journey it files goes live (Income Tax, `PLAN_ITSA_APPROVAL.md` UH3; practice, UH1; CT600, `PLAN_HMRC_CT_APPROVAL.md` UH7), the harness on prod behind an operator-only activity, each tool's entry back on `web/public/mcp.html`, which lists only prod's six tools, the accounts and confirmation statement tools renamed from `*_sandbox` now that RL2d lists them on prod's MCP page, and each of those tools added to the connector's directory listings as it goes live (the listings themselves go ahead with the VAT tool set, operator 2026-11-12: `PLAN_ORGANIC_SEARCH.md` rows OOS17 and OOS18); the availability table and dates on `web/public/mtd-calendar.html` change in the same change. Blocked on: UH1 (`PLAN_ITSA_APPROVAL.md`), UH3 (`PLAN_ITSA_APPROVAL.md`) and UH7 (`PLAN_HMRC_CT_APPROVAL.md`, on `NEXT.md`) for the tools. The operator approved the launch on 2026-11-22: each tool goes on prod's connector when its journey is live on prod. **Source**: operator, 2026-10-30. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files. **Class**: machine-only. **State**: blocked. **Blocked by**: UH1, UH3 (`PLAN_ITSA_APPROVAL.md`), UH7 (`PLAN_HMRC_CT_APPROVAL.md`). **Unblocks**: nothing.

