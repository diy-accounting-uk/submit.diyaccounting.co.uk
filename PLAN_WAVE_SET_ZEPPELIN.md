<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: wave set `zeppelin`

A tracking document. It lists the rows of the set and their state. Each row's brief is its row on
`NEXT.md` (and, for an AA row, its brief in `PLAN_AMENDED_ACCOUNTS.md` section 5.2). The `wave-set`
skill, section "How a set is delivered", says how `/iterate` builds it.

## Operator assertions (verbatim, 2026-11-22)

> /wave-set

> Largest: ready rows and their chains (Recommended)

> All simulator, proxy for the rows reached (Recommended)

## Status

defined 2026-11-22. The operator's `/iterate` on this set is its approval.

## The goal

Use what is paid for (the laptop, the Claude subscriptions) and spend as little as possible on what
is billed by use. The set does all its work locally, in as many waves as it needs. Then it pays for
one ci deployment and one prod deployment for submit, and one pull request run and one prod deploy
for spreadsheets.

## The set

- **submit**: 22 rows in one pull request: AA3, AA8, AA1, AA2, PE1, SY1 (the route), CL1, AA10,
  AA11, AA4, WL1, SY2 (the route), AA5, AA6, AA16, CP1, AA7, AA14, CL2, CL5, LANG12, AA17.
- **spreadsheets**: 5 rows in one pull request: AA27, AA26, SY1 (the page), SY2 (the engine and the
  page), SY3.
- **Beside**, with no pull request: AA9, AA25, DUE1, CR1, WDM1, GLS1, LANG13, DON1a, U2.
- **Left out, because the input needs this set live first**: AA12 (its workflow runs AA10's cases
  from `main`), AA13 (after AA12), AA28 and CL3 (AA27 on the DIYA-GL prod site), AA30 (AA26's npm
  publish), MA1 (the features on prod).
- **Left out, because a person or a third party comes first**: every other row of `## Blocked`.

The amended accounts rows (AA1 to AA17) reach prod hidden: AA3 makes prod refuse a revision until
AA18.

## Waves: submit

Branches: `claude/zeppelin-w01` to `claude/zeppelin-w07`, batches `claude/zeppelin-w<nn>-<batch>`,
the set branch `claude/zeppelin-set`. Rows of a batch run in the order given, one commit each.

Two rules hold in every wave. `i18n/cy.toml`: each batch adds its keys in its own section; a
conflict keeps both sides' keys, and `npm run build:welsh` writes the pages at assembly.
`web/public/submit.catalogue.toml` and the tests that list activities have one owner in a wave, in
this order across the waves: rule, lookup, watch, passes, fill, welsh.

### Wave 1

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| rule | AA3, AA8, AA1, AA2 | Sonnet, 2 agents in a chain | the catalogue and the activity-list tests; `ctClientScope.js`; the accounts post and render handlers; `catalog-service.js`; `fileCompanyTaxReturn.html` and its page script; `jointFiling.js`; the accounts iXBRL services; the gateway simulator's accounts route and scenario; `scripts/build-mtd-calendar.mjs` and the tax source |
| email | PE1 | Sonnet | `customerEmailTemplates.js`, `customerEmailRequest.js`, `passGeneratePost.js`, `passAdminPost.js`, their tests |
| edge | SY1 (the route) | Sonnet | `companiesHousePublicDeadlinesGet.js`, `EdgeStack.java`, `EdgeStackTest.java` |

State: pending.

### Wave 2

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| lookup | CL1 (the routes, then the page) | Sonnet, 2 agents in a chain | the catalogue; the Companies House lookup Lambdas and `companiesHouseApi.js`; `app/bin/server.js`; `CompaniesHouseNames.java` and its stack; the companies simulator; `companySearch.html` and its page script; the page router; the page scripts of the five forms |
| cases | AA10, then AA11 | Sonnet, then Opus | `scripts/companies-house-test-service-run.js`, the test-service cases fixture, the review scripts; AA11's fixes in the accounts iXBRL services |

State: pending.

### Wave 3

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| amend | AA4 | Sonnet | `web/public/lib/accounts-revision.js`, `filings.page.js`, the micro-entity form and its page script, `filing-record.js`, `fileCompanyTaxReturn.page.js`, `scripts/build-mtd-calendar.mjs`, the capability skeleton, the micro-entity behaviour test and its steps |
| watch | WL1 | Sonnet | the catalogue; `watchList.html` and its page script; `companySearch.page.js`; `app/lib/accountSettings.js` |
| route | SY2 (the route) | Sonnet | the new public Lambda; `companiesHouseApi.js`; `app/bin/server.js`; `CompaniesHouseNames.java`; `EdgeStack.java`; the companies simulator |

State: pending.

### Wave 4

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| amend2 | AA5, AA6 | Sonnet | the small company form and its page script, `accounts-revision.js`, `filings.page.js`, `books-import.js`, `scripts/build-mtd-calendar.mjs`, the micro-entity behaviour test |
| copy | AA16 | Sonnet | `web/public/faqs.toml`, `CompaniesHouseNames.java`, the capability text of the accounts route |
| passes | CP1 | Sonnet | the catalogue; the pass handlers and `passService.js`; `bundlePost.js`; the operator's pass page; `bundles.page.js`; `customerEmailTemplates.js`; `app/bin/server.js` |

State: pending.

### Wave 5

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| mcp | AA7, AA14 | Sonnet | `mcp/lib/server.js`, `mcp/lib/submit-tools.js`, `mcp/README.md`, `web/public/mcp.html`, `scripts/build-mtd-calendar.mjs`, the hosted MCP behaviour test, `mcp/scripts/accounts-test-service-proof.js` |
| fill | CL2, CL5 | Sonnet, then Opus for CL5's interface rows | the catalogue; the new filed-accounts Lambda; the page scripts of the forms; `companySearch.html` and its page script; `app/bin/server.js`; `CompaniesHouseNames.java` |

State: pending.

### Wave 6: Welsh, after every English string is final

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| welsh | LANG12 | Opus, sub-agents by section of `i18n/cy.toml` | `i18n/cy.toml`, the `*Cy` fields of the catalogue, the Welsh emails, the Welsh accounts text, `scripts/welsh-proof.mjs`, the rebuilt Welsh pages |

State: pending.

### Wave 7: the look wave

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| look | AA17, then the set's screenshots and reviews | Sonnet | the revised accounts scene script, `web/public/guide.page.js`, `web/public/videos/publish.json` |

The look batch records AA17's video on the simulator lane and uploads it unlisted. It takes the
guide screenshots (`npm run video:walkthrough`) and the site screenshots, runs `visual-review` on
the pages of CL1, WL1, CP1, AA4, AA5 and CL5 and on PE1's rendered emails, and runs `ui-ux-pro-max`
on the guide's pages.

State: pending.

## Waves: spreadsheets

The same branch names in `../spreadsheets.diyaccounting.co.uk`. Each worktree comes from that
repository's `scripts/worktree-add.sh`.

| Wave | Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- | --- |
| 1 | app | AA27 | Sonnet | `web/diya-gl.co.uk/public/shell.js`, `save.js`, `data.js`, their browser tests |
| 2 | book | AA26 | Sonnet | `app/lib/diya-gl-register-book.js`, the engine's export list, the MCP tools, the diya-gl documentation, their tests |
| 3 | lookup | SY1 (the page) | Sonnet | `download.html`, `lib/download-page.js`, a browser test |
| 4 | generate | SY2 (the engine and the page) | Sonnet | `scripts/build-diya-gl-bundle.mjs`, `lib/download-page.js`, the round trip test |
| 5 | newbook | SY3 | Sonnet | `web/diya-gl.co.uk/public/shell.js`, the Ltd product's new book form, a browser test |

AA26 starts when AA25's design is in `PLAN_AMENDED_ACCOUNTS.md`. State: pending.

## Beside

| Row | Runs when | What it leaves |
| --- | --- | --- |
| AA9 | first, because the reply takes the longest | the draft for the XML team, in the private repository |
| AA25 | before spreadsheets wave 2 | the design section in `PLAN_AMENDED_ACCOUNTS.md` |
| DUE1, CR1, WDM1, GLS1 | any time | one `PLAN_*.md` each, then `/plan-review-loop` |
| DON1a | any time | the thank-you template, in the private repository |
| U2 | any time; it uses no branch of the set | the rehearsal patch and its record, in the private repository |
| LANG13 | after wave 6, where a criterion judges the Welsh | the listings and awards file, in the private repository |

## Gates

**Each submit wave branch**, after its last batch lands:

1. The generators that the wave touched, then `git status --short` shows nothing (`npm run
   build:static-content`, `build:filing-pages`, `build:mtd-calendar`, `build:welsh`,
   `marketing:build`, `capabilities:generate`, `scripts:table`; `./mvnw clean verify` writes
   `web/public/docs/api/openapi.json`).
2. `scripts/batch-check.sh claude/zeppelin-w<nn>` in one background command.
3. The simulator behaviour suites that the wave's rows reach, one at a time under
   `/tmp/submit-simulator.lock`: of `bundle`, `help`, `passRedemption`, `generatePassActivity`,
   `companiesHouse`, `changeRegisteredOffice`, `changeRegisteredEmail`, `fileMicroEntityAccounts`,
   `fileConfirmationStatement`, `companyTaxReturn` and `mcpHosted`.

**The set branch `claude/zeppelin-set`**, before the push:

1. `scripts/batch-check.sh claude/zeppelin-set`.
2. All 42 simulator behaviour suites, in series.
3. The proxy suites that the rows reach, in series, inside an SSO window (Docker; secrets through
   `scripts/proxy-secrets.sh`): `bundle`, `help`, `passRedemption`, `generatePassActivity`,
   `companiesHouse`, `changeRegisteredOffice`, `changeRegisteredEmail`, `fileMicroEntityAccounts`,
   `fileConfirmationStatement`.
4. AA14's proof: `npm run mcp:accounts-test-service-proof` under the profile `diya-submit-ci`. It
   files one submission on the Companies House test service (approved by the operator, 2026-11-22).
5. AA11's judge passes the four revised cases.
6. The machine probe of `CLAUDE.md` ("Reading machine load") before any timing is trusted; the
   gates stay serial.

**Spreadsheets**: on each wave branch, the tests that the wave's rows reach, with
`VITEST_MAX_WORKERS=2`. On the set branch, `npm test` (the router). The pre-push hook runs the
scoped suite at the push, and `test.yml` on the pull request runs the browser and LibreOffice
tiers.

## The push: submit

1. Check both SSO profiles, then read the ci slots (`aws --profile diya-submit-ci ssm
   get-parameters-by-path --path /submit/ci/slots`).
2. Push `claude/zeppelin-set` once. Start the ci set with a life that covers the proof list
   (`gh workflow run deploy.yml --ref claude/zeppelin-set -f selfDestructDelayHours=6`, with no
   `deployment-name`, so the run claims `ci-set1` or `ci-set2`), and cancel the push-triggered
   `deploy.yml` run in its first minute: one deploy per head.
3. Open one pull request; its body lists the rows by wave. `/watch`.
4. The ci proof list, against the one ci set:
   - SY1: two requests for one company with two `Origin` headers, each answered with its own
     origin; the second from the cache.
   - SY2: the public route answers a filed set's document and the officers, with the CORS header.
   - CL1: each drill-down address opens from a cold load; an unknown number shows the page's own
     not-found state; an API error is JSON.
   - WL1: add, list, remove and open, signed in.
   - CP1: a pass made on the operator's page; a second redemption by one account is refused.
   - PE1: the generated-pass email as received.
   - AA4, AA5: an amend journey to the test gateway's answer.
   - LANG12: the Welsh proof (`scripts/welsh-proof.mjs`) against the ci set.
5. A candidate fix goes to the standing ci set by a lean deploy (`fast-deploy`), is proven there,
   and then rides one fix push.
6. `/auto-merge` (with `--merge`). `main`'s deploy is the one prod deploy; `deploy-finish.yml`
   destroys the outgoing prod set.
7. The prod proof list: AA3 (the revised accounts activity is not listed, and no amend link shows);
   AA8 (the calendar states the 28 day rule); CL1 (the drill-down of a real company); WL1; CP1 (the
   operator's page opens; the operator makes the passes); SY1 and SY2 (the two `curl` proofs);
   LANG12 (the Welsh proof on prod, between the Cognito native enable and disable).

## The push: spreadsheets

After the submit set is live on prod (SY1's and SY2's pages call prod's Submit): push
`claude/zeppelin-set` there with SSH keepalives, so that the pre-push hook runs its scoped suite;
open one pull request; watch its `test.yml`; merge through that repository's
`auto-merge`. Its prod deploy puts AA27 on the DIYA-GL prod site and starts AA26's npm publish.

## After the deploy

- AA12, then AA13: the four test-service filings from `main` (approved), then the review request
  draft.
- AA30, then CL3: after AA26's npm publish and AA27 on the DIYA-GL prod site.
- AA28: after AA27 on the DIYA-GL prod site.
- OAA3: the operator watches AA17's unlisted video.
- MA1: after CL1, WL1 and the due list's first build task are on prod.

## When the set branch fails

Push a prefix: the tip of the last wave whose gates passed and whose rows need nothing from the
waves after it. Wave 1 alone is a valid prefix (AA3 lands with AA1). Wave 6 (Welsh) and wave 7
(look) can each be left for the next set. The waves after the pushed one start the next set,
rebased on the new `main`.
