<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Companies House approval and prod launch

The approval steps with Companies House (and HMRC's Corporation Tax test service) and the prod
launches that follow them. The build these launches release, and the test-service proofs they wait
on (B34.6c, CS-A3, CS-13b), are in `PLAN_COMPANIES_HOUSE.md`, whose dependency graph shows the
whole chain; its "Software authorisation: assumed criteria" table is CS-A4's checklist.

## User assertions

> Please pull these tasks out of the board (if present) and out of PLAN_COMPANIES_HOUSE.md and into a new PLAN_COMPANIES_HOUSE_APPROVAL.md: B34c (Accounts on prod: stack values, own filing, catalogue), CS-11b (Confirmation statement customer launch on prod) ... O34c, CS-A4, OCH1 ... O34g (operator, 2026-10-04)

## XML team verdict on the software testing (their email of 2026-10-23 10:15 UTC)

| Form | Verdict |
|---|---|
| Confirmation statement | Approved |
| PSC verification statement (VS01) | Approved |
| Micro-entity accounts | Failed: "missing significant data", and information in the header and footer that should not appear |

They review the accounts again after 4 new accounts test submissions, given with their submission numbers. Go-live asks (the live package references, the presenter's live clearance) wait until every test passes (operator, 2026-10-24).

## Board

The rows below are this plan's open work, in board order. `NEXT.md` carries none of them; this
section is their board.

| Id | What | Files | Model | Blocked by |
|---|---|---|---|---|
| O34g | Register with HMRC's SDST for the CT test services; set the ETS sender ID, password and vendor ID on GitHub's `ci` environment | 0 | none | none |
| O34c | Ask the XML team to clear the credit-account presenter for live accounts filing and issue the live package reference; set the live presenter id, code and package reference on GitHub's `prod` environment | 0 | none | — (the ask is in B34's email) |
| B34c | `CompaniesHouseStack.java` sets the prod gateway values; one accounts filing on the prod lane for the operator's own company, polled to a terminal state; `prod` added to the activity's `environments` and `resident`'s listing | ~5 | Sonnet | O34c |
| CS-A4 | Claude Code assembles the evidence pack from a `companies-house-test-service.yml` run inside 14 days; the operator sends it to `xml@companieshouse.gov.uk` (the live package reference is OCS1, asked for once every test passes) | 0 | Sonnet | — (in flight: the pack from run 38029097822 rides on B34's email) |
| CS-11b | Customer prod launch: `prod` on the confirmation statement activity's `environments`, the live Stripe price for the £61.35 fee, prod gateway values and the live package reference, the operator's own proof filing first, `compliance.toml` rows | ~7 | Sonnet | CS-A4, CS-11a |
| OCH1 | Companies House sandbox user for the opt-in ci REST suites, created by a session under `antony+ch-sandbox@diyaccounting.co.uk` (NEXT.md OCH1) | 0 | Sonnet | none |
| OCH1k | A sandbox Test API client key from the Developer Hub, set as `COMPANIES_HOUSE_SANDBOX_API_KEY` on ci (NEXT.md OCH1k) | 0 | none | none |

### Human-driven

- [ ] **O34g. HMRC Corporation Tax test-service credentials.** The registration email went to SDST on 2026-10-23 at 22:07 (`../private.diyaccounting.co.uk/hmrc/ct/EMAIL_SDST_CT600_REGISTRATION.md`); when SDST answers, set the test-service (ETS) sender id, password and the 4-digit vendor id as secrets on GitHub's `ci` environment, named as `PLAN_COMPANIES_HOUSE.md`'s design section lists them. Unblocks B34g2 (B34g1 proves against the credential-free payload validator first). **Source**: `PLAN_COMPANIES_HOUSE.md` design. **Owner**: Operator. **Model**: none. **Size**: 0 files.

### Blocked

- [ ] **O34c. Companies House clears the presenter for live accounts filing.** The ask is section B of email 3 (`../private.diyaccounting.co.uk/companies-house/correspondence/DRAFT_EMAIL_XMLGW_LIVE_PERMISSION.md`, NEXT.md OCS1), sent only if the XML team's answer to the retest request does not already clear it. BACKLOG 34c steps 2 and 3, ask the XML team (`xml@companieshouse.gov.uk`) to clear the new presenter that holds the credit account (its id in `../private.diyaccounting.co.uk/operator/NEXT_OPERATOR_RUNBOOK.md` task A; it authenticates on the live gateway since 2026-09-26) for the live service and issue the live package reference (the test one is 0012); then set the live presenter id, presenter code and `COMPANIES_HOUSE_PACKAGE_REFERENCE` on GitHub's `prod` environment (Settings, Environments, prod), which `deploy-environment.yml` carries into Secrets Manager. The XML team answered on 2026-10-23: the accounts testing failed (the document is missing data and prints its header and footer); clearance waits on 4 new accounts submissions (NEXT.md AX1 to AX4). **Source**: BACKLOG 34c. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **B34c. Companies House accounts filing launched on prod.** BACKLOG 34c steps 4 to 6: `CompaniesHouseStack.java` sets the prod values (`COMPANIES_HOUSE_GATEWAY_TEST=false`, the live package reference) instead of leaving them unset; one filing on the prod lane for a company the operator controls, polled to a terminal state; `prod` added to `file-micro-entity-accounts`' `environments` and `resident`'s listing in `web/public/submit.catalogue.toml`, with the activity page and the accounts video no longer calling it a sandbox preview. Blocked on O34c. **Source**: BACKLOG 34c. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **CS-A4. Software authorisation: send the evidence.** Claude Code assembles the pack from a `companies-house-test-service.yml` run inside the last 14 days, against `PLAN_COMPANIES_HOUSE.md`'s criteria table: product and forms, one line per case with its submission number and outcome, the run link, the page's axe result (`scripts/axe-quickscan.mjs`), a declaration screenshot, contact. It drafts the email at the workspace root. The operator sends it to `xml@companieshouse.gov.uk` from their own address. The live package reference for the confirmation statement is NEXT.md OCS1, asked for once every test passes. Every statement case settled on its first poll under the replacement presenter (run 38029097822, 2026-10-10); the pack is `../private.diyaccounting.co.uk/companies-house/xmlgw-evidence/SOFTWARE_AUTHORISATION_PACK_2026-10-10.md` and the XML team approved the confirmation statement and PSC verification statement testing on 2026-10-23. The live package reference for them is NEXT.md OCS1, asked for once every test passes. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code (the pack), Operator (the send). **Model**: Sonnet. **Size**: 0 files.

- [ ] **CS-11b. Confirmation statement's customer prod launch.** Submit's confirmation statement runs on the test service only; DIY Accounting Limited's 2026 statement (made up to 21 September, accepted 24 September) went through Companies House WebFiling. CS-11b takes the activity to prod, the operator's own proof filing first, then customers. `file-confirmation-statement` already lists `bundles = ["resident", "resident-pro"]`, so no operator-only gate is needed — add `prod` to its `environments` (`web/public/submit.catalogue.toml` lines 449 to 457, `environments` at 457; the VS01 activity too, when CS-13a adds one), and a live Stripe price alongside the existing one for the £61.35 fee. Prove it first: the prod gateway values and the live package reference from CS-A4, then one fee-free operator proof filing (a second statement for 06846849 in the 2026-27 payment period, its fee waived by CS-11a's company list; the operator approved it; it moves the next review date to about a year after the filing day) before the listing goes live. Then `compliance.toml` rows for the credit account and the authorisation. Shares BACKLOG 34c steps 3 and 4 with the accounts launch. Blocked on CS-A4. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

## Context: the accounts launch to prod

- **Accounts filing, the launch to prod (was 34c).** Companies House accounts filing: the launch to prod. (2) Companies House clears the presenter for the live service and issues the live package reference (test is 0012), the operator's email exchange; (3) the live presenter id and code and `COMPANIES_HOUSE_PACKAGE_REFERENCE` go on the GitHub `prod` environment and reach Secrets Manager through `deploy-environment.yml`; (4) `CompaniesHouseStack.java` sets the prod values (`COMPANIES_HOUSE_GATEWAY_TEST=false`, the live reference) instead of leaving them unset; (5) one filing on the prod lane for a company the operator controls, its status polled to a terminal state; (6) `prod` added to `file-micro-entity-accounts`' `environments` and `resident-ltd`'s `listedInEnvironments` in `web/public/submit.catalogue.toml` (a two-line change), with the activity page and the accounts video no longer calling it a sandbox preview. Step 2 is the operator's; 3 is theirs to set; 4 to 6 are Claude Code's.
