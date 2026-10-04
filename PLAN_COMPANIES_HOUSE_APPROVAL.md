<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Companies House approval and prod launch

The approval steps with Companies House (and HMRC's Corporation Tax test service) and the prod
launches that follow them. The build these launches release, and the test-service proofs they wait
on (B34.6c, CS-A3, CS-13b), are in `PLAN_COMPANIES_HOUSE.md`, whose dependency graph shows the
whole chain; its "Software authorisation: assumed criteria" table is CS-A4's checklist.

## User assertions

> Please pull these tasks out of the board (if present) and out of PLAN_COMPANIES_HOUSE.md and into a new PLAN_COMPANIES_HOUSE_APPROVAL.md: B34c (Accounts on prod: stack values, own filing, catalogue), CS-11b (Confirmation statement customer launch on prod) ... O34c, CS-A4, OCH1 ... O34g (operator, 2026-10-04)

## Board

The rows below are this plan's open work, in board order. `NEXT.md` carries none of them; this
section is their board.

| Id | What | Files | Model | Blocked by |
|---|---|---|---|---|
| O34g | Register with HMRC's SDST for the CT test services; set the ETS sender ID, password and vendor ID on GitHub's `ci` environment | 0 | none | none |
| O34c | Ask the XML team to clear the credit-account presenter for live accounts filing and issue the live package reference; set the live presenter id, code and package reference on GitHub's `prod` environment | 0 | none | B34.6c |
| B34c | `CompaniesHouseStack.java` sets the prod gateway values; one accounts filing on the prod lane for the operator's own company, polled to a terminal state; `prod` added to the activity's `environments` and `resident`'s listing | ~5 | Sonnet | B34.6c, O34c |
| CS-A4 | Claude Code assembles the evidence pack from a `companies-house-test-service.yml` run inside 14 days; the operator sends it to `xml@companieshouse.gov.uk` and asks for the live package reference for the confirmation statement | 0 | Sonnet | CS-A3, Companies House IT |
| CS-11b | Customer prod launch: `prod` on the confirmation statement activity's `environments`, the live Stripe price for the £61.35 fee, prod gateway values and the live package reference, the operator's own proof filing first, `compliance.toml` rows | ~7 | Sonnet | CS-A4, CS-11a |
| OCH1 | Companies House sandbox user for the opt-in ci REST suites | 0 | none | the sandbox identity site being up |

### Human-driven

- [ ] **O34g. HMRC Corporation Tax test-service credentials.** Register with HMRC's Software Developers Support Team for the Corporation Tax online test services, then set the test-service (ETS) sender id, password and the 4-digit vendor id as secrets on GitHub's `ci` environment, named as `PLAN_COMPANIES_HOUSE.md`'s design section lists them. Unblocks B34g2 (B34g1 proves against the credential-free payload validator first). **Source**: `PLAN_COMPANIES_HOUSE.md` design. **Owner**: Operator. **Model**: none. **Size**: 0 files.

### Blocked

- [ ] **O34c. Companies House clears the presenter for live accounts filing.** BACKLOG 34c steps 2 and 3, after B34.6c's sandbox proof: ask the XML team (`xml@companieshouse.gov.uk`) to clear the new presenter that holds the credit account (its id in `../private.diyaccounting.co.uk/operator/NEXT_OPERATOR_RUNBOOK.md` task A; it authenticates on the live gateway since 2026-09-26) for the live service and issue the live package reference (the test one is 0012); then set the live presenter id, presenter code and `COMPANIES_HOUSE_PACKAGE_REFERENCE` on GitHub's `prod` environment (Settings, Environments, prod), which `deploy-environment.yml` carries into Secrets Manager. Blocked on B34.6c. **Source**: BACKLOG 34c. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **B34c. Companies House accounts filing launched on prod.** BACKLOG 34c steps 4 to 6: `CompaniesHouseStack.java` sets the prod values (`COMPANIES_HOUSE_GATEWAY_TEST=false`, the live package reference) instead of leaving them unset; one filing on the prod lane for a company the operator controls, polled to a terminal state; `prod` added to `file-micro-entity-accounts`' `environments` and `resident`'s listing in `web/public/submit.catalogue.toml`, with the activity page and the accounts video no longer calling it a sandbox preview. Blocked on B34.6c and O34c. **Source**: BACKLOG 34c. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **CS-A4. Software authorisation: send the evidence.** Claude Code assembles the pack from a `companies-house-test-service.yml` run inside the last 14 days, against `PLAN_COMPANIES_HOUSE.md`'s criteria table: product and forms, one line per case with its submission number and outcome, the run link, the page's axe result (`scripts/axe-quickscan.mjs`), a declaration screenshot, contact. It drafts the email at the workspace root. The operator sends it to `xml@companieshouse.gov.uk` from their own address and asks for the live package reference for the confirmation statement (or confirmation that the accounts reference from O34c covers it), then sets it on GitHub's `prod` environment. Every case needs a terminal `ACCEPT` or `REJECT`, which `GetSubmissionStatus` cannot return while it answers 9999 (B34.6c's blocker). Blocked on CS-A3 and on Companies House IT repairing the test presenter. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code (the pack), Operator (the send). **Model**: Sonnet. **Size**: 0 files.

- [ ] **CS-11b. Confirmation statement's customer prod launch.** DIY Accounting Limited already files its own statements through Submit under its credit-account presenter; CS-11b takes the same activity to customers on prod. `file-confirmation-statement` already lists `bundles = ["resident", "resident-pro"]`, so no operator-only gate is needed — add `prod` to its `environments` (`web/public/submit.catalogue.toml` lines 449 to 457, `environments` at 457; the VS01 activity too, when CS-13a adds one), and a live Stripe price alongside the existing one for the £61.35 fee. Prove it first: the prod gateway values and the live package reference from CS-A4, then one fee-free operator proof filing (a second statement for 06846849 in the 2026-27 payment period, its fee waived by CS-11a's company list; the operator approved it; it moves the next review date to about a year after the filing day) before the listing goes live. Then `compliance.toml` rows for the credit account and the authorisation. Shares BACKLOG 34c steps 3 and 4 with the accounts launch. Blocked on CS-A4. **Source**: `PLAN_COMPANIES_HOUSE.md`. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

- [ ] **OCH1. Companies House sandbox user.** A Companies House sandbox user for the opt-in ci filing suites (`runCompaniesHouseSandboxFiling=true` in `deploy.yml` and `probe-test.yml`, which sign in on `https://identity-sandbox.company-information.service.gov.uk`). When the sandbox identity site is up: create a throwaway account (own email, password, authenticator; keep the base32 key); on GitHub's `ci` environment set variable `TEST_COMPANIES_HOUSE_USER_ID` and secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`, `COMPANIES_HOUSE_SANDBOX_API_KEY`. Nothing on NEXT.md waits on it: the Companies House videos record on the simulator and the suites are off by default. **Source**: Run 36340607940; `PLAN_COMPANIES_HOUSE.md` OCH1. **Effort**: S. **Value**: Trust. Re-proves the two REST filings against Companies House's sandbox from ci. Operator.

## Context: the accounts launch to prod

- **Accounts filing, the launch to prod (was 34c).** Companies House accounts filing: the launch to prod. After 34b's sandbox proof (B34.6c): (1) Companies House's XML team confirms submission 000004's outcome and that `GetSubmissionStatus` works for test presenter 00000000000, and a poll returns a status; (2) Companies House clears the presenter for the live service and issues the live package reference (test is 0012), the operator's email exchange; (3) the live presenter id and code and `COMPANIES_HOUSE_PACKAGE_REFERENCE` go on the GitHub `prod` environment and reach Secrets Manager through `deploy-environment.yml`; (4) `CompaniesHouseStack.java` sets the prod values (`COMPANIES_HOUSE_GATEWAY_TEST=false`, the live reference) instead of leaving them unset; (5) one filing on the prod lane for a company the operator controls, its status polled to a terminal state; (6) `prod` added to `file-micro-entity-accounts`' `environments` and `resident-ltd`'s `listedInEnvironments` in `web/public/submit.catalogue.toml` (a two-line change), with the activity page and the accounts video no longer calling it a sandbox preview. Steps 1 and 2 are the operator's; 3 is theirs to set; 4 to 6 are Claude Code's.
