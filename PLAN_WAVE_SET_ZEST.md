<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: wave set `zest`

This plan tracks the rows of the set and their state. Each row's brief is its row on `NEXT.md`.
The `wave-set` skill, section "How a set is delivered", says how the set is built. The
`collab-loop` skill says where each step runs: the cloud workers build and gate, and the laptop
lands, signs and proves.

## Operator assertions (verbatim, 2026-11-24)

> AL35 salt alarm, CT41 loans crash, BK1 statement readers

> The changes I want are: The FSB offer chain, the donators offer chain, the CT in prod chain.

> Build a new wave set from the board tasks you can include

> All simulator, proxy for rows reached (Recommended)

## Status

defined 2026-11-24; approved 2026-11-24 (the operator's `/collab-loop` for zest); wave 1 landed; wave 2 building.

## The goal

Do all the work that can be done locally and on the cloud workers, in as many waves as it needs.
Then pay for one ci deployment, destroyed after its proofs, and one prod deployment, which destroys
the outgoing prod set. More waves cost nothing. A second push costs a ci set.

## The set

- **submit: 12 rows.** CT38, TS1, AA37, LOOK4, VAT51, DASH53, AL33, SEED1, the `--til` code of
  CT40, and AL35, CT41 and BK1 (joined by the operator's answer, 2026-11-24).
- **spreadsheets: 0 rows.**
- **Beside the set (no pull request):**
  - VID22: a capture dispatch on prod and the publish. It can run at any time.
  - CQ93: the decision, written in the private file. It is a security finding, so it stays on the
    laptop. A code change that it decides becomes a new row (the row says so).
  - CT40's run: the operator types the Government Gateway credentials, after CT39's book exists.
    It uses the `--til` code of wave 1 from that wave's worktree, or from `main` after the merge.
- **Left out:**
  - OOS44 and DON1 are human-driven (test 4).
  - OCT8 needs CT38 live on prod (test 1), and it is the operator's own filing.
  - OCT9 is the operator's decision, after OCT8.
  - UH7 waits on OCT9 (test 1).

## Waves

### Wave 1: the defects, CT40's code and CT38's design

| Batch | Rows | Model | Files the batch owns |
|---|---|---|---|
| ts1 | TS1 | Sonnet | `.claude/skills/tax-sources/sources/*.json` (the seven), the generated `web/public/mtd-calendar.html` and rates page, the Welsh pages built from them |
| aa37 | AA37 | Sonnet | `app/services/smallCompanyAccountsIxbrl.js`, `accountsIxbrlCommon.js`, `smallCompanyAccountsFromResults.js`, `web/public/lib/accounts-revision.js`, the accounts fixtures |
| look4 | LOOK4 | Sonnet | `web/public/companies-house/fileConfirmationStatement.page.js`, its browser test, `web/public/videos/file-confirmation-statement/` |
| vat51 | VAT51 | Sonnet | `web/public/hmrc/vat/viewVatReturn.page.js`, `web/browser-tests/submitVatStatus.browser.test.js` |
| dash53 | DASH53 | Sonnet | the actor rule (`app/lib/httpResponseHelper.js`, `app/lib/activityAlert.js`) and the receipt writer it finds, with their unit tests |
| ops | AL33, then SEED1 | Sonnet | `infra/main/java/co/uk/diyaccounting/submit/constructs/Lambda.java` and its test; `.github/workflows/mcp-reviewer-seed.yml`, `scripts/ensure-mcp-reviewer-user.js` |
| ct40 | CT40 (the `--til` code) | Sonnet | `scripts/hmrc-tpvs-ct600.js` and its unit test |
| al35 | AL35 | Sonnet | `scripts/delete-user-data.js` or the salt read's metric filter, and their tests |
| ct41 | CT41 | Sonnet | `app/services/ct600Figures.js` and its unit test |
| bk1 | BK1 | Sonnet | `mcp/lib/finance/bank-lines.js`, `mcp/lib/finance/paypal-statement-lines.js`, `app/services/paypalTransactions.js`, their tests |
| ct38-design | CT38 (the design) | Opus | no source file; the design goes to `docs-out/` on the worker's branch |

- **AA37** starts from the held build `refs/remotes/cloud-pebble/claude/pebble-aa37` (1c67bcef0),
  rebased on `main`. Its Companies House review and judge run on the worker, which holds the
  Accounts Data Product zip.
- **DASH53** reads code and `gh run list`. A lake read on ci uses the worker's one-hour ci
  credentials. It never scans a table.
- **CT38's design:** a worker never edits a plan. The laptop copies the design into
  `PLAN_HMRC_CT_APPROVAL.md` Designs on `main`, then wave 2 builds from it.
- No two batches share a source file. TS1 writes the generated calendar; CT38 changes its
  generator in wave 2 and runs it again.

State: landed at f27fb84df (2026-11-24): TS1 daed109d0, CT40 6f933c1d4, LOOK4 0f8323989, DASH53 966c554ac, VAT51 c998cb513, AL33 d48d75c64, SEED1 8982edb95, AA37 f27fb84df; CT38's design is in `PLAN_HMRC_CT_APPROVAL.md` (052d77cc1). Gates: lint passed on 8982edb95 (jasper); unit (dusk), browser (flint) and the VAT and confirmation statement simulator suites (garnet) run on 8982edb95; unit on f27fb84df (bugle) covers AA37, whose browser tests and accounts simulator suite passed on its own branch. The docker build is left to the ci deploy: no Dockerfile changed.

### Wave 2: CT38's build

| Batch | Rows | Model | Files the batch owns |
|---|---|---|---|
| ct38 | CT38 | Sonnet | `web/public/submit.catalogue.toml`, `app/lib/previewFeatures.js`, `app/services/bundleManagement.js`, `app/services/ctClientScope.js`, `app/lib/accountSettings.js`, `web/public/settings.page.js`, `web/public/lib/services/viewer-settings.js`, `web/public/lib/services/catalog-service.js`, `web/public/widgets/entitlement-status.js`, `web/public/companies-house/fileCompanyTaxReturn.html`, `web/public/hmrc/receipt/receipts.page.js`, `web/public/lib/filing-result-record.js`, `i18n/cy.toml`, `scripts/build-mtd-calendar.mjs`, the generated pages, the tests |

CT38 is about 24 files. It is a chain of two agents on one worktree: the design of wave 1 (Opus),
then the build (Sonnet). The build runs `npm run build:welsh` and `npm run build:mtd-calendar` on
top of wave 1, so the calendar holds both TS1's dates and CT38's availability rows.

State: building ahead of wave 1's gate: cyclone builds CT38 from `claude/zest-w01` at daed109d0; it takes wave 1's later commits as one commit before it lands.

### Wave 3: the look wave

| Batch | Rows | Model | Files the batch owns |
|---|---|---|---|
| look | CT38's screenshots and reviews | Sonnet | the CT600 guide screenshots (`npm run video:walkthrough` for the CT600 journey) |

The batch runs `visual-review` on the CT600 page with the live banner and with the unavailable
panel, and `ui-ux-pro-max` on the CT600 guide screenshots. LOOK4 takes its own panels in wave 1.

State: pending.

## Gates

**On each wave branch**, split across the cloud workers on the wave's tip:

- `gate-unit`: `npm run bundle`, `npm test`, `cd mcp && npm test`.
- `gate-java`: `./mvnw clean verify` (wave 1 for AL33; wave 2 only if an env changes).
- `gate-browser`: `npm run test:browser`.
- `gate-lint`: Prettier, Spotless, the two ESLint ratchets, ESLint on added files.
- `gate-sim`: the simulator suites the wave's rows reach, one at a time:
  - wave 1: VAT, confirmation statement, micro-entity and small company accounts;
  - wave 2: `companyTaxReturnBehaviour-simulator`.
- The docker build runs on the laptop (`scripts/batch-check.sh`'s docker gate, 29 s).

**On the set branch, before the push** (the operator's choice, 2026-11-24):

- every gate above on the set's tip;
- all 42 simulator suites, split across every free worker;
- the proxy suites that the rows reach (CT600, VAT, confirmation statement, accounts), run by
  workers with one-hour ci credentials.

## The push

1. Assemble `claude/zest-set` from the tip of wave 3, and gate it as above.
2. Read the ci slots, push `claude/zest-set` once, and open one pull request that lists the rows
   by wave. Hand it to `/watch`.
3. Run the ci proofs inside the ci set's self-destruct delay:
   - **CT38:** the CT600 page on ci still files to the test services; `companyTaxReturnBehaviour-ci`
     passes.
   - **TS1:** the calendar and rates pages on ci show the new words and dates.
   - **AL33:** the log metric filter of the ci set has the new pattern (read with
     `aws logs describe-metric-filters`).
   - **VAT51:** `submitVatBehaviour-ci` passes.
   - **LOOK4:** the confirmation statement page on ci shows the particulars as a textarea.
   - **AA37:** the micro-entity and small company accounts suites pass on ci.
   - **SEED1:** a dispatch of `mcp-reviewer-seed.yml` with `environment=ci` from the set branch
     passes.
4. `/auto-merge` with `--merge`. `main`'s deploy is the one prod deploy.
5. Run the prod proofs:
   - **CT38:** the test user, who is not an operator, sees the unavailable panel on the CT600 page,
     and the CT routes refuse it. The operator's own check is OCT8.
   - **AL33:** `prod-app-hmrc-stack-health` stays OK after the deploy's probes (issue #862).
   - **TS1:** the prod calendar and rates pages show the new words and dates.
   - **DASH53:** receipts that the probes write after the deploy carry the actor `test-user` and a
     TTL (a lake read, no scan).

## After the deploy

- OCT8: the operator files DIY Accounting Limited's accounts and CT600 on prod (needs CT38 live,
  CT39 and CT40).
- OCT9, then UH7.

## When the set branch fails

Push a prefix: the tip of the last wave whose gates passed and whose rows need nothing from the
waves after it. Wave 1 stands alone. Waves 2 and 3 then start the next set, rebased on the new
`main`.
