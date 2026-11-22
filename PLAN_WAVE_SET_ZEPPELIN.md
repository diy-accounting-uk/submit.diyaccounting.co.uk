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

approved 2026-11-22 (the operator's `/collab-loop` on the set). building wave 1. The cloud workers build the rows and run the gates (`collab-loop` skill); the laptop lands them.

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
- **Beside**, with no pull request: DUE1, CR1, WDM1, GLS1, LANG13.
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

State: gated 8a4bc7faf. Wave branch `claude/zeppelin-w01` from `main` at 82a4b97b8, worktree `.claude/worktrees/zeppelin-w01`. Landed, in order: AA3 09b1643e5, AA8 3762c1e7e (the source rule gains www.legislation.gov.uk, because no gov.uk page states the 28 day rule), PE1 59e60c2ad and its render cases 585fe4c18, SY1 (the route) 89777f7d0, AA3's fix from epoch's review a1e9f0db8, AA1 42a81d641 (the validator answers valid for the four revised samples), AA2 7a893b201, AA3's preview rule dfd173734 (a Companies House path is decided by its own Companies House service), and its environment wiring 8a4bc7faf (the two render Lambdas gain the gateway test flag; the handlers on no gateway path are allowlisted per file). The generators ran on 7a893b201 and changed no file. Gates: on dfd173734 the content scan, the bundle, `npm test`, the mcp tests, Prettier, Spotless, the ESLint gates, the browser suite (1552 passed, 0 failed) and seven simulator suites (`companyTaxReturn`, `fileMicroEntityAccounts`, `companiesHouse`, `passRedemption`, `generatePassActivity`, `bundle`, `help`) pass, and maven verify failed on the environment wiring test; on 8a4bc7faf, which changes only the Companies House stack's environment, its test and the allowlist, maven verify (556 tests), Spotless and `npm test` pass. The docker build gate is left to the set branch.

### Wave 2

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| lookup | CL1 (the routes, then the page) | Sonnet, 2 agents in a chain | the catalogue; the Companies House lookup Lambdas and `companiesHouseApi.js`; `app/bin/server.js`; `CompaniesHouseNames.java` and its stack; the companies simulator; `companySearch.html` and its page script; the page router; the page scripts of the five forms |
| cases | AA10, then AA11 | Sonnet, then Opus | `scripts/companies-house-test-service-run.js`, the test-service cases fixture, the review scripts; AA11's fixes in the accounts iXBRL services |

State: gated 796f81ac5 (dusk's core gates and six simulator suites, 77bbf8144; anvil's browser gate, 1594 passed). Wave branch `claude/zeppelin-w02` from wave 1's head, worktree `.claude/worktrees/zeppelin-w02`, head 796f81ac5 (with wave 1's gated head merged in; a fix on wave 1 reaches this branch by `git merge claude/zeppelin-w01`). Landed: CL1's routes f20b03a9b, AA10 ede5d3e4f and its review rules f97ceb4c7, SY2's route 663eacae2 (wave 3's row, landed here because the route fixes share its code), CL1's page 03a3ec054, the route fixes from anvil's review ecfc6cdb7 (the filing history reads at most 500 filings and says when there are more) and 83bc30d9c (the document's file is fetched only from an Amazon S3 host over https or the Document API's own address), e32560112 (the public register reads one history page: at most 5 Companies House requests), 1094f6433 (a timed-out fetch logs no query string), 796f81ac5 (the allowlist lines for the four new handlers; maven verify passes with 560 tests). AA11 is done with no code: the judge passes the four revised cases (`target/companies-house-review/2026-11-22-revised/`). Gates on 796f81ac5, running: anvil `gate-browser-796f81a`; dusk `gate-core-796f81a` with the simulator suites `companiesHouse`, `changeRegisteredOffice`, `changeRegisteredEmail`, `fileConfirmationStatement`, `fileMicroEntityAccounts`, `companyTaxReturn`. To send after WL1: the lookup page's notice for a truncated filing history.

### Wave 3

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| amend | AA4 | Sonnet | `web/public/lib/accounts-revision.js`, `filings.page.js`, the micro-entity form and its page script, `filing-record.js`, `fileCompanyTaxReturn.page.js`, `scripts/build-mtd-calendar.mjs`, the capability skeleton, the micro-entity behaviour test and its steps |
| watch | WL1 | Sonnet | the catalogue; `watchList.html` and its page script; `companySearch.page.js`; `app/lib/accountSettings.js` |
| route | SY2 (the route) | Sonnet | the new public Lambda; `companiesHouseApi.js`; `app/bin/server.js`; `CompaniesHouseNames.java`; `EdgeStack.java`; the companies simulator |

State: gated d2abf54eb (bugle's browser gate, 1638 passed, 1755df418; dusk's core gates and four simulator suites, de747e949). Wave branch `claude/zeppelin-w03` from wave 2's head 796f81ac5, worktree `.claude/worktrees/zeppelin-w03`, head d2abf54eb. Landed: WL1 8526a35be, AA4 bcc9086d5, the lookup page's notice for a list past the newest filings d2abf54eb (the first part of bugle's `cl5`), and AA4's balance sheet check 13c95368a (accounts whose capital and reserves differ from the lines under them are refused by the route and the form; the Dockerfile copies the shared module, so the docker gate runs on the set branch). `accounts-revision.js` is capability CH-24; the watch list page is CH-23 and the public register CH-22. Each landed with its own gates passed on its worker; the wave's gates run on d2abf54eb: bugle `gate-browser-d2abf54`, dusk `gate-core-d2abf54`. bugle's browser gate passed on d2abf54eb (1638 passed, 1755df418). cyclone's review of AA4 and its check is in (ac0ef6fe2, one test) and cyclone builds its decisions as `aa4-fix` on that branch, for landing on wave 4: an already revised receipt is not revised again; the accountants' report and the document language carry over from the filed document; an empty original approval date is editable and required; an approval date after today is refused for every accounts filing; a revision names the receipt it revises, the server checks it and the record links to it; the Company Tax Return routes refuse a revision where revised accounts are not enabled; three page fixes. epoch gets the small company form's half of each after AA5 and AA6. Not settled: which date a second revision states as the original approval date (a legal reading of the 2008 regulations). Running from 13c95368a: epoch `aa5` (AA5, then AA6, wave 4).

### Wave 4

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| amend2 | AA5, AA6 | Sonnet | the small company form and its page script, `accounts-revision.js`, `filings.page.js`, `books-import.js`, `scripts/build-mtd-calendar.mjs`, the micro-entity behaviour test |
| copy | AA16 | Sonnet | `web/public/faqs.toml`, `CompaniesHouseNames.java`, the capability text of the accounts route |
| passes | CP1 | Sonnet | the catalogue; the pass handlers and `passService.js`; `bundlePost.js`; the operator's pass page; `bundles.page.js`; `customerEmailTemplates.js`; `app/bin/server.js` |

State: landing. Wave branch `claude/zeppelin-w04` from wave 3's gated head d2abf54eb, worktree `.claude/worktrees/zeppelin-w04`, head afb865dfb. Landed: AA5 0045752dc and AA6 dadf4b4c9 (epoch 359c7f67f), AA16 0eb9624f6 (cyclone 901ccb955, with its correction), CP1 4207c4660 (cyclone's build, anvil's review fix and the follow-ups to 015919b0f: the per-account count in one conditional write; a pass grants only a bundle enabled on-pass or always and not allocated automatically, and the operator bundle only to an operator; `already_held` for a pass on worse terms; durations of at most 100 years; the landing page posts and the server decides; `scripts/generate-pass.js` checks the operator's email). The route count in SubmitApplicationCdkResourceTest is 240; `openapi.json` was merged by git, and dusk's early gate run (`gate-core-4207c46`) says whether the generator changes it. Also landed: the watch list fixes b1fe0b769 (anvil 94cd7790e: an add or a remove of one company applied on the server in one conditional write, the whole-list write removed, every settings write touching only the setting it names, and the route refusing an account without the activity; the settings Lambda gains the table update and query grants and the operator list read) and the AA4 review's fixes 8418678a2 (cyclone fb2da7df7, nine fixes with the review's test). Also landed: the sample accounts bfe8ac635 (epoch fbac6d59c: the small company samples' figures agree with themselves, and `accountsDocumentArithmetic.test.js` checks all 24 built documents; the test-service cases already agreed, so nothing filed changes). Early gates: dusk's core gates and seven simulator suites passed on 4207c4660 with no generator changing a file, and anvil's browser gate passed on 8418678a2 (1682 passed); dusk runs the core gates again on 8418678a2. Also landed: the small company form's half of the revision fixes 9212b25d9 (cyclone db5849c07; the shared code now sits once in `accounts-revision.js` and `approval-date-check.js`; the accounts route's Lambda gains the receipts table's name and read access, which 8418678a2 lacked, so the Java gate fails on 8418678a2 and passes here; the render route's description, CH-07's text and the record's sentence for a set with no comparatives). dusk's core gates on 8418678a2 failed only the environment wiring test, for the receipts table gap that 9212b25d9 closes; on 9212b25d9 every core gate and four simulator suites pass (a9b6efff9), with the accounts route's read scoped to the receipts table and `dynamodb:GetItem`. Also landed: cyclone's `amend3` afb865dfb (60b1c7da5): the three findings below, the two-file fixtures rebuilt from the corrected case, and the status line for every catalogue status. Still to land here: cyclone's `amend4` from its `amend3` branch: the balance sheet's creditor and provision lines come back from the filed document (the books mapping does not read them, so revised accounts opened without them), with a test that every line of both forms carries over; and the look pass of the amend forms. anvil's review of AA5 and AA6 is in (db80e0f6e, no commit) with three findings, decided and built in `amend3`: (1) the accounting policies and the note texts of the filed accounts carry over to a revision on both forms, read from our own filed document in the shared module as the accountants' report is, and the revision section names any note it could not read; today amend mode opens with them empty and a note the customer does not retype is dropped from the revised accounts. (2) The period is the receipt's: the period fields are read-only while revising, the books card refuses a source for another period and fills nothing, and the route refuses a revision whose period differs from the named receipt's. (3) The copy type (full or filleted) stays free, and the page states which copy the original was. Then the wave's gates on the final head. The small company filing with no comparatives is board row AA36. ci proof for CP1: `generate-pass.yml` with pass type operator now reads `{env}/submit/operator-emails` under the deploy role. Known trap: a change to an API description fails `./mvnw clean verify` in OpenApiGeneratorTest until `./mvnw package -DskipTests` regenerates `web/public/docs/api/openapi.json`.

### Wave 5

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| mcp | AA7, AA14 | Sonnet | `mcp/lib/server.js`, `mcp/lib/submit-tools.js`, `mcp/README.md`, `web/public/mcp.html`, `scripts/build-mtd-calendar.mjs`, the hosted MCP behaviour test, `mcp/scripts/accounts-test-service-proof.js` |
| fill | CL2, CL5 | Sonnet, then Opus for CL5's interface rows | the catalogue; the new filed-accounts Lambda; the page scripts of the forms; `companySearch.html` and its page script; `app/bin/server.js`; `CompaniesHouseNames.java` |

State: assembled early. Wave branch `claude/zeppelin-w05` from wave 4's head bfe8ac635, worktree `.claude/worktrees/zeppelin-w05`, head 8552636ce (dusk's follow-ups; before it 4f5290e7b; wave 4 merged in at 9212b25d9 as e19942a41 and at afb865dfb as d9185bb41, the filed accounts fixtures in `.prettierignore` as 811ea46a7, anvil's `w5-fix` as b5c1a07d5, dusk's review fixes as f2b39b54c, and bugle's `look2` as 54b1b45d2 and 4f5290e7b); later commits on wave 4 reach it by `git merge claude/zeppelin-w04`. Landed: AA7 b26d8f262 and AA14 e8ef1856b (anvil e634f828b), CL5 feba30fbc (bugle b2db4cb33), CL2 c25fcd18e (bugle b0f2101d4 with anvil's review fixes 80d26df03: a document nested too deeply or stating another company's number answers unreadable, and the unreadable reason is at most 300 characters). The route count is 242. epoch's gates on c25fcd18e passed all but two (4821eb8e7: the browser suite 1705 passed, `npm test` 13457, the MCP tests 445, four simulator suites): the receipts table wiring test, closed by the merge of wave 4, and Prettier on the four filed accounts fixtures, closed by the ignore line. epoch runs every gate again on 811ea46a7 (`gate-all-811ea46`). The hosted MCP behaviour suite's two sign-in tests, the revised accounts one among them, skip on the simulator: they need ci with Cognito native sign-in, so they are a ci proof for the laptop after the deploy. Also landed: anvil's `cl2-fix2` 4121c25df (620f89204): a filed document is read as a stream that stops at the size limit under one timeout over headers and body; the prior year fills only when the last accounts end the day before the company's next accounting period starts; each signed-in Companies House lookup counts against the account's share of the shared key, 150 calls in five minutes by one atomic counter in the security state table, with a JSON 429 past it, on nine routes; the mapped last accounts are cached by company and filed set for seven days; `CompaniesHouseStack` gives those Lambdas the table's name and their writes. Before this the signed-in lookups had only the WAF's 2,000 requests per address, so one account could use up the key's 600 calls in five minutes; the two public routes already had their own WAF rules and caches. Also landed: anvil's `w5-fix` b5c1a07d5 (5a6311668): signed-in Companies House lookups together stop at 450 of the key's 600 calls in five minutes, beside each account's 150; the prior-year fill uses the profile the page already holds; the MCP accounts tools' revision carries `revisesReceipt` (no MCP tool lists accounts receipts, which is board row MCP3). dusk's review of the server-side fixes that came out of the set's own reviews is in (992670823) with three fixes, landed as f2b39b54c: a route that names an activity the catalogue lacks is refused (it ran unrestricted); a revision's receipt name is bounded at 256 characters; a cached value past its time to live is not served. The pass rule and the rest hold. The points it left are built and landed as 8552636ce (7c7259a32): a body with a watch list change and another setting is refused; the route test for a receipt with no kept document; one hour of cache for an unreadable or too-large outcome; `Retry-After` as the seconds left in the window; a refusal by the budget of all logs the event `CompaniesHouseLookupBudgetRefused`, nine metric filters in `OpsStack` count it, and the alarm `<env>-companies-house-lookup-budget-refused` in `ObservabilityStack` fires on the first one in five minutes, routed as the token charge alarm is (the alarm is in an environment stack, so it arrives with the environment's deploy, and the filters with the application's). dusk runs every gate on 8552636ce (`gate-all-8552636`). Not changed: a revision with no receipt name stays accepted where revised accounts are offered, and a practice revising a client's own filing is refused as not found. Also landed: bugle's `look2` (408260b97) as two commits. 54b1b45d2 stands alone so that it can be reverted alone: the drill-down words each filing as Companies House does, from `filing_history_descriptions.yml` of github.com/companieshouse/api-enumerations at commit 05067abc, vendored as `web/public/lib/company/filing-history-descriptions.js` (1,192 entries, 148 KB) by `scripts/build-filing-history-descriptions.mjs`; that repository has no licence file, and the vendored file carries this repository's own licence header, so whether it ships is the operator's decision. 4f5290e7b: no focus ring on a heading focused by script, the availability table fits at 1280px, plain line names and money in the prior-year notes, the browser tests in the en-GB locale and Europe/London (the suite passed 1745 on bugle's branch), 390px screenshots. Still to land here: bugle's `look3` (a campaign pass's window ends on the London day the operator chose; the race that sometimes shows a synthetic account the production status on the VAT submit page; money in the micro-entity form's net assets line and the balance sheet rule's message); wave 4's `amend4` by `git merge claude/zeppelin-w04`; bugle's `lang12-cl2` branch (the Welsh of the edit links and the fill; GOV.UK's own Welsh for the quotations where it publishes one). Left for the coordinator: the calendar's revised row MCP cell becomes `["production", "micro-entity"]`, then `npm run build:mtd-calendar`; the MCP tools' revision takes `revisesReceipt` now that the route checks it (a task for the worker that lands the last revision fixes). CL2 as built: a new route `GET /api/v1/companies-house/company/{companyNumber}/last-accounts` (a new Lambda of 512 MB that maps the newest filed set on the server with `mapIxbrlAccounts`), on the paths of the two accounts filing activities; `web/public/lib/prior-year-fill.js` (capability CH-25) fills the prior-year column where a field is empty, never in amend mode, names the lines left empty and the other form where the last accounts were of the other type, and says why the form is empty for paper, no iXBRL, too large, unreadable, none and a failed read. It adds two API routes: with CP1's the count is 242 at landing. Laptop step: fetch at least three real filed documents (micro-entity and small company) with ci's Companies House key into `app/unit-tests/fixtures/filed-accounts/` and run `npx vitest run app/unit-tests/services/companiesHouseLastAccounts.test.js`; a document not named in `expected.json` must map to a regime, a dated period and finite figures with net assets equal to capital and reserves. Whether real companies' filed accounts are committed to this public repository as fixtures, or the run stays a laptop proof, is the operator's choice. Built early and held on anvil's branch `claude/anvil-aa7-body-fields` (e634f828b, from wave 2's head f97ceb4c7): AA7 (692b1a6c2, with the body fields fix b8ff6d02b: the tools now send `registeredOffice` and `accountantsReport`) and AA14 (fce0d1c9d: the proof script files the revised case after the original, and enters the code on the codes link). Left for the coordinator when AA4's calendar row is on the branch: the revised row's MCP cell becomes `["production", "micro-entity"]`, then `npm run build:mtd-calendar`. AA14's one test-service run is `AWS_PROFILE=diya-submit-ci MCP_PROOF_TRANSCRIPT=target/accounts-test-service-proof.txt npm run mcp:accounts-test-service-proof` on the laptop (Docker and the ci profile).

### Wave 6: Welsh, after every English string is final

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| welsh | LANG12 | Opus, sub-agents by section of `i18n/cy.toml` | `i18n/cy.toml`, the `*Cy` fields of the catalogue, the Welsh emails, the Welsh accounts text, `scripts/welsh-proof.mjs`, the rebuilt Welsh pages |

State: assembled early. Wave branch `claude/zeppelin-w06` from wave 5's head 8552636ce, worktree `.claude/worktrees/zeppelin-w06`, head 1c8ee2e5a: LANG12 as one commit, which is the Welsh chain's head `claude/anvil-lang12-fix2` 65c7c7092 squashed (through the term bank changes, the pass page fix and the language switch reading the address when used) plus the Welsh of the edit links and the fill (`claude/bugle-lang12-cl2` f745a265c). The Welsh unit test passes (579) and Prettier is clean on the head. Later commits on waves 4 and 5 reach it by `git merge claude/zeppelin-w05`. The findings files are not landed: the latest copies are in `<scratchpad>/welsh-review/` (ch, itsa, site, vat, set, cl2) for the private repository's `WELSH_REVIEW_2026-11-22.md`. Running: anvil `w06-welsh-last` from 1c8ee2e5a (a check of the merge entry by entry against the chain; the Welsh of the entries that neither review covered; `bundles.html` removes `newPass` from the address when it starts). How it was built, on the branches: `claude/bugle-lang12-pass3` (f02a877cb, a chain from wave 4's head 8418678a2 through `lang12-merge` 60702dc75 and `lang12-pass2` ab1897d95): the review of every entry that was in `i18n/cy.toml` when the set began, merged by entry (207 entries changed, none in conflict with the set's rows); `scripts/welsh-proof.mjs` (capability SITE-35; 52 pages and 0 findings on the simulator); `lang="en"` on the three customer reviews of `spreadsheets.html`; the catalogue's Welsh fields (5 changed); the Welsh emails (3 changed, with the soft mutation after "gallwch"); the Welsh accounts text against the FRC 2026 taxonomy's Welsh labels (9 changed, 12 form entries with them); the 194 entries the set added up to 8418678a2 (4 changed); the pass redeemed and subscription started emails in Welsh; the pass page in Welsh (`cy/pass.html`, 66 entries; the language switch keeps the address's query on every page); a pass redeemed in Welsh sends its email in Welsh (`X-Site-Language` on the redeem request); a subscription started from the Welsh site sends its email in Welsh (the language in the Stripe Checkout Session's metadata, "cy" or "en"). `claude/bugle-lang12-cl2` (f745a265c, on `claude/bugle-cl2`): the Welsh of the edit links and the prior-year fill; where GOV.UK publishes a quoted page in Welsh the Welsh page shows GOV.UK's own Welsh sentence and links to the Welsh page (three quotations), and where it does not, the English quotation marked `lang="en"` with a line that says so (seven). The commits named "Welsh review findings (not for landing)" hold `welsh-review/*.md`, which go to the private repository. A local Opus agent checks the term decisions against TermCymru and the Porth Termau and writes `../private.diyaccounting.co.uk/engineering/submit/WELSH_REVIEW_2026-11-22.md`. The chain's head is now anvil's `claude/anvil-lang12-terms` a50947205, on top of `lang12-pass3`: the term bank check applied where the sources agree (reclaim on purchases is adhawlio, 6 entries, as gov.uk/ffurflenni-taw; Retrieve is adalw, 35; download is lawrlwytho, 4; "where to get help" is cymorth, 3). Not changed, for the speaker: reclaim in box 5 (HMRC's own page writes "ei hadennill"), shareholder (Companies House's glossary gives cyfranddeiliad), nominal value. Restored to main's wording, because the FRC taxonomy's Welsh label and TermCymru disagree: accruals and deferred income on the form, and group undertakings in the accounts text. So the site has two words for reclaim and two for shareholder until a speaker decides. anvil's review of the chain's code changes is in (755ba3947) with one fix (7f67ad314: the pass page's summary and dates follow the reader's chosen language, as its sentences do). Held: the switch's link cannot leave the site; the `X-Site-Language` header is only compared with "cy"; the pages call the API on their own origin, so no CORS preflight arises; the Stripe metadata holds "cy" or "en" on the Checkout Session only. anvil builds the finding it left as `lang12-fix2`: the language switch and the language notice read the address when they are used, so a one-time parameter that a page has removed (a Stripe return's `checkout` and `session_id`, a new pass) does not travel to the other language, where it showed the activation message and sent the GA4 purchase event again. Entries added after these branches' bases (anvil's `cl2-fix2`, cyclone's `amend3` and `aa5-half`, the MCP tools' text) get a last pass at assembly. Earlier notes: Started early, landing with this wave: `lang12-proof` (`scripts/welsh-proof.mjs`, built: epoch 01ea721ca; on the simulator it finds two English customer reviews with no `lang` on `cy/spreadsheets.html`), and the review's tranches, stacked on one chain that is the local branch `claude/zeppelin-lang12` (head 012bf4941: the VAT sections, the `ch.` ids, the Income Tax sections, the site sections and the Companies House form sections; every entry that was in `i18n/cy.toml` when the set began is read line by line, about 4,100 entries with about 200 changed). Each tranche's findings are in `welsh-review/<name>.md` on the chain, for the private repository, not for landing. The worker VMs reach gov.uk's Welsh pages and neither term bank, so a laptop agent checks the tranches' term decisions against TermCymru and the Porth Termau. Still to do in this wave: the three English customer reviews on `cy/spreadsheets.html` get `lang` (the English page's blockquotes, or the Welsh build), the catalogue's `*Cy` fields (`passSummaryCy`: "gallwch cyflwyno" lacks the soft mutation), the Welsh emails, the Welsh accounts text, and every key that this set's rows add.

### Wave 7: the look wave

| Batch | Rows | Model | Files the batch owns |
| --- | --- | --- | --- |
| look | AA17, then the set's screenshots and reviews | Sonnet | the revised accounts scene script, `web/public/guide.page.js`, `web/public/videos/publish.json` |

The look batch records AA17's video on the simulator lane and uploads it unlisted. It takes the
guide screenshots (`npm run video:walkthrough`) and the site screenshots, runs `visual-review` on
the pages of CL1, WL1, CP1, AA4, AA5 and CL5 and on PE1's rendered emails, and runs `ui-ux-pro-max`
on the guide's pages.

State: pending. The look pass of the settled pages is done (bugle 474df2b5c, on wave 5's head c25fcd18e): 116 screenshots judged by the `visual-review` skill (drill-down 33, watch list 14, campaign pass 39, prior-year fill 10, help and availability 10, emails 10). Two defects fixed and landed on wave 5 as d0e1285a9: the watch list button for a signed-out reader offers the sign-in, and a pass email states the length of a grant of a year or more. Six fails are with bugle as `look2` from d0e1285a9: filing descriptions from Companies House's own enumeration; no focus ring on a heading focused by script; the availability table fits at 1280px; the fill's "Left empty" list and its money format; the browser tests run in the en-GB locale; 390px screenshots where tests lacked them. The seventh, placeholder data in the fixtures and the simulator, is board row LOOK1. The amend forms and the books card in amend mode get their look pass after `amend3`. Built early and held on epoch's `claude/epoch-aa17` (44425213e, on top of AA5 and AA6): the scene script `videos/amend-company-accounts.json` (run end to end on the simulator, 185 s, no narration), the guide journey in `web/public/lib/guide-journeys.js` (shown where revised accounts are listed), the `publish.json` entry with no video id, 13 walkthrough frames. Left for the laptop: `npm run video:record -- amend-company-accounts simulator` with narration (Polly needs AWS), the unlisted upload by the `video-publish` skill, the id, chapters and `npm run video:walkthrough -- --id amend-company-accounts`, then `AWS_PROFILE=diya-submit-prod npm run video:embed-check`. The pages' wording moves with the AA4 fixes, so the take is recorded after they land.

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

State: gated 5eec67e93. Seven waves landed; the set branch `claude/zeppelin-set` is 5eec67e93, not pushed. `claude/zeppelin-w01` 521494ec6 (AA27), `claude/zeppelin-w02` 57df16bcb (AA26), `claude/zeppelin-w03` a913fcb8d (SY1's page), `claude/zeppelin-w04` 3ce60aa68 (SY2: the Generate option), `claude/zeppelin-w05` 99c4f730a (SY3: the DIYA-GL app's "New book from a company"), `claude/zeppelin-w06` d4d2fe1f8 (the summary book gives back a filed set's figures: the tax of a year with no profit and loss account runs until it settles, the interest payable account is declared, a Format 2 change in stocks is posted once), `claude/zeppelin-w07` 5eec67e93 (the browser tier's two fixes). The first set gate on 99c4f730a passed every tier but the browser tier, which failed 11 of 585 tests. Six counted the DIYA-GL save menu, which AA27 gave one more item for every book kind, "Download as a spreadsheet package (.zip)"; they now check the menu's labels in order. Five were a product break by SY3: the app reads a company from the address when it starts, and the homepage did not load the two scripts that do it, so the homepage showed its empty state in place of the Ltd example; `index.html` now loads them. All 514 `diya-gl-*` browser tests pass on the fix. The set gate, `npm test` (the router), is green on 5eec67e93: gates, 166 unit files, the four LibreOffice products, all 585 browser tests and the infra build, in 46 minutes. A change to the set branch after this needs the gate again. A gate log never goes under `target/`: the infra tier's Maven clean removes it. Open: the Self Employed downloads test checks the diya-gl zip and the JSON only; the package download is checked in the browser for Ltd only. Four gaps of the summary book with more than one fix are board row SB1 (the operator's choices), and Submit's version bump is GLV1. The push waits for the submit set on prod. Worktrees are under `.claude/worktrees/` in that repository.

## Beside

| Row | Runs when | What it leaves |
| --- | --- | --- |
| DUE1, CR1, WDM1, GLS1 | any time | one plan each, at v4 after three review rounds (`PLAN_DUE_LIST_v4.md`, `PLAN_COMPANY_REPORTS_v4.md`, `PLAN_WATCH_DUE_CAMPAIGN_v4.md`, `PLAN_DIYA_GL_STANDARDS_v4.md`). Each round 3 still changed scope, so the operator accepts each v4 or asks for another round, and answers its decisions; then its tasks are boarded. The four rows are under Machine-ask on `NEXT.md`. |
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
