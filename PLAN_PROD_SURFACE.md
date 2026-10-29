<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_PROD_SURFACE: what prod offers, and how each hidden feature comes back

## The ask

> "Hide" and for each item we hide (not just this one) a task to the board and to the associated plan to unhide it linking to the preconditions such as prod API keys, approval by the API owner, addition to a bundle, and my approval to enable for live users on prod.

Operator, 2026-10-29, answering ORPT1 on `../private.diyaccounting.co.uk/engineering/submit/REPORT_PROD_SURFACE_2026-10-28.md` section 4. The report holds the evidence, the file and line for each change, and the use figures.

## Decisions (2026-10-29)

| Report row | Item | Decision |
|---|---|---|
| 1 | Practice: nav link, page, `/api/v1/practice/*` | Hide |
| 2 | Resident and Resident Pro bundles | Hide |
| 3 | Non-prod forms (23 ITSA, 4 CH filing, `mcp-harness.html`) | Guard the pages; calendar links plain text on prod |
| 4 | Hosted MCP tools | Narrow to VAT; keep `submit_vat_return` |
| 5 | Static status boxes on practice, bundles, mcp | Build from the catalogue |
| 6 | Passes | Keep |
| 7 | diya-gl storage | Hide |
| 8 | `tests/`, `docs/api/`, `simulator.html`, `mcpCodes.html` | Keep |
| 9 | VAT liabilities, payments, penalties | Keep |

## Tasks

### HIDE1. Hide the non-production surface from prod

Rows 1, 2, 3, 4, 5 and 7, as section 4 of the report says ("What hiding each row takes"). Every hide is an environment rule in the catalogue or code, so a later unhide is the same rule with `prod` added. The server refuses on prod as well as the page: the practice handlers gain `enforceBundles`. Proof: unit tests for each gate, the browser tests for the guard panel, the simulator suites the change reaches, and the look pass on the guarded pages.

### Unhide tasks

Each item comes back on prod only when every precondition holds. The last precondition of each is the operator's approval to enable it for live users on prod. Unhiding is the HIDE1 rule for that item with `prod` added, and the availability table and dates on `web/public/mtd-calendar.html` change in the same change.

- **UH1. Practice.** Preconditions: HMRC production credentials for the Agent Authorisation API on Submit's production application; HMRC's approval of agent use (the API owner); practice sold in a bundle on prod (Resident Pro, UH2); the operator's approval.
- **UH2. Resident, Resident Pro and diya-gl storage.** Preconditions: every filing the bundle describes is live on prod (Income Tax: `PLAN_ITSA_APPROVAL.md`; confirmation statement, PSC verification statement and accounts: `PLAN_COMPANIES_HOUSE_APPROVAL.md` OCS1 and O34c; Company Tax Return: HMRC's CT production approval); the operator's approval.
- **UH3. Income Tax forms.** Preconditions: HMRC's recognition and production credentials for the ITSA APIs (`PLAN_ITSA_APPROVAL.md`); each activity in a bundle sold on prod; the operator's approval.
- **UH4. Companies House and Company Tax Return filing forms.** Preconditions: the Companies House live package reference and presenter credentials on `prod` (OCS1, O34c) for confirmation statements, PSC verification statements and accounts; HMRC's CT production approval for the CT600; each activity in a bundle sold on prod; the operator's approval.
- **UH5. Hosted MCP tools beyond VAT.** Preconditions: the journey each tool files is live on prod (UH1, UH3, UH4); the operator's approval.
- **UH6. `mcp-harness.html`.** Preconditions: an operator-only activity on prod for it; the operator's approval.
