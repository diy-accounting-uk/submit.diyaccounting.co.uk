<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: wave set `ridge`

A tracking document. Each row's brief is on `NEXT.md`; this file says which rows are in the set,
which wave and batch builds each, and what state each wave is in. The method is the `wave-set`
skill (`.claude/skills/wave-set/SKILL.md`), section "How a set is delivered".

## Operator assertions (verbatim, 2026-11-17)

> Please review all the open tasks on the board and create a wave set list (new PLAN_*.md doc listing tasks that may be in other plans or just NEXT.md, this is a tracking doc to build the wave sets) of the largest set of changes that we can fit into 1 PR per repository. Once defined and approved I shall use the /iterate task to deliver these tasks and I want to to as much locally before any push or ci deployment, this can be done in multiple waves of many batches or related changes being handed to sub-agents each working on a sepereate worktree and worktree branch which are then combined into a wave branch and fully tested as much as we can locally before being parked and then we'd create a new wave branch off the tip of the previous wave branch and assemble and other wave of batches merging back into the wave branch. Then when all the wave branches are assembled for the whole PLAN of waves we should locally combine these into a wave set branch which will also be tested and pushed when tests are passing and we'll need all the tests we can run locally passing (we shall retain the wave branches so that if the wave set branch is a mess we can try pushing smaller combinations of wave branches. NEXT.md will need annotating to show which tasks belong to the wave set and they should name that wave set.

> The goal here is to use local compute and claude LLM usage which is already paid for (owned equipment, paid subs) while the laptop is otherwise unused to the max while avoiding AWS costs from running a ci environment continually and doing lots of prod deploys and then we'll ideally see the cost of 1 large ci deployment, torn down after usage and 1 prod deployment with the outgoing prod torn down.

> I only want /wave-set to consider tasks already on the board.

Answers of 2026-11-17: the set carries every row that can ride in it (53 when it was defined); the
set branch passes every local gate, the proxy lane among them, before the push. OS18b (the fix for
OpenAI's rejection of the ChatGPT plugin) joined the same day by the operator's answer: it rides in
the set, with no deployment of its own.

## Status

approved 2026-11-17 (the operator's `/iterate`). Waves 1 to 6 gated; `claude/ridge-set` at 2c6a1c081 (two gate fixes: the HMRC error-scenario steps wait for the page's error; the proxy lane's price ids and Companies House keys), its set gate running.

## The goal

The laptop and the Claude subscriptions are paid for; a ci set in AWS is billed for every hour it
stands. The set does all the work it can locally, in as many waves as it needs, then pays for one
ci deployment (destroyed after its proofs) and one prod deployment (the outgoing set destroyed) in
each repository. More local waves are cheap. A second push is expensive.

## The set

| Repository | Rows | Pull requests | Branch pushed |
| --- | ---: | ---: | --- |
| submit | 53 | 1 | `claude/ridge-set` |
| spreadsheets | 1 | 1 | `claude/ridge-set` |

- Left out, for the next set: **DASH45**. Its review reads prod's dashboard after DASH36 to DASH44
  are live.
- Beside the set, with no pull request: **OS16d** (a note in the private repository).
- Not machine-only, so not candidates: OS24d, OOS44 and the 12 blocked rows.

## Waves: submit

Wave 1 branches from `origin/main`; each later wave branches from the tip of the wave before it.
Wave branches are `claude/ridge-w01` to `claude/ridge-w06`; a batch branch is
`claude/ridge-w<nn>-<batch>`. No wave or batch branch is pushed.

### Wave 1: the heads

| Batch | Rows, in order | Model | Owns |
| --- | --- | --- | --- |
| chrome | FONT1, NAV1, WEB5, WEB6 | Sonnet, 2 agents | header, fonts, navigation, sign-in words in scripts |
| dash-a | DASH34, DASH35, DASH36, DASH37, DASH38, DASH39 | Sonnet, 2 agents | snapshot publisher, charts, views |
| waf | WAF3, WAF1, WAF2 | Sonnet | `EdgeStack.java` rules, `compliance.yml`, triage |
| pages | WEB7, WEB15, WEB23 | Sonnet, 2 agents | gate text on pages, `about.html`, video pages |
| ops | WEB4, SD1, OS24e | Sonnet | `submit.js` consent, `stack-drift.yml`, register |
| mcp | MCP2 | Opus | `mcpHttp.js`, `mcp/server.json` |

State: gated 0d8730ca8 (batch-check: every gate PASS after two fixes; 9 simulator suites pass). Extra commits on the wave: the OpenAPI generator reproduces the committed spec; HMRC SQS payloads carry the caller's email (DASH39); the header reserves the wrapped navigation's height (WEB5).

### Wave 2: the home page, the articles' template, the 404 page

| Batch | Rows, in order | Model | Owns |
| --- | --- | --- | --- |
| home | WEB2, WEB9, WEB10, WEB8, WEB11, WEB16 | Sonnet, 2 agents | bundles, pass, home, sign-in page, status notice |
| articles-a | WEB1, WEB17, WEB18 | Sonnet | capture scripts, `build-filing-pages.mjs`, four scene files |
| edge | WEB3 | Opus | `EdgeStack.java` default behaviour, the edge function |
| dash-b | DASH40, DASH41, DASH42 | Sonnet, Opus, Sonnet | retention, actor classes, hourly views |
| mcp-b | OS18b | Opus | the tools' answers, the plugin package, the MCP part of `privacy.html` |

`articles-a` also makes WEB11's one-line change in `scripts/build-filing-pages.mjs` (the literal
"3 submissions", line 98) as its own commit, because that file is its own in this wave.

`AUTH` rides in wave 2 by the operator's answer (2026-11-17): a customer's expired sign-in with no refresh token showed her as signed in while every call returned 401; the fix (64fe014c4) clears such a session before any page script runs and sends a user action to sign in with `next=`. Its ci proof: an expired id token with no refresh token in localStorage, then `bundles.html` shows "Not signed in" and Subscribe opens `auth/login.html?next=%2Fbundles.html`.

State: gated 9a3d9d872 (batch-check: every gate PASS after the fixes below, docker after freeing Docker's disk; 15 simulator suites pass; auth, submitVat and companiesHouse again on the tip). Fixes on the wave: the dashboard test's sign-in link carries next= (WEB8); the pages that load auth-status.js load page-chrome.js (AUTH).

### Wave 3: help, the guide, the sources

| Batch | Rows, in order | Model | Owns |
| --- | --- | --- | --- |
| help | WEB12, WEB13, WEB14, WEB24 | Sonnet, 2 agents | `faqs.toml`, help page, support form, legal pages |
| guide | WEB19, WEB26 | Sonnet, 3 agents | the other scene files, `guide.page.js` |
| sources | WEB20 | Sonnet | `tax-sources.mjs`, the 50 source files |
| dash-c | DASH43, DASH44 | Opus | stored data graph, retention graph |

State: gated 4b52926ec (batch-check: every gate PASS; 7 simulator suites pass after the compliance test took WEB24's sentence-case headings). Fixes on the wave: the filing pages ask for the 480px picture (WEB26); terms, accessibility and privacy name support@ for a person's requests (WEB24).

### Wave 4: the last English copy

| Batch | Rows, in order | Model | Owns |
| --- | --- | --- | --- |
| articles-c | WEB21, WEB22, WEB25, WEB27 | Sonnet, 2 agents | generators, calendar, page titles, the merged spreadsheets page |

State: gated 705cc9fd9. batch-check ran on the cloud worker anvil (submit-cloud-anvil, `.collab/w04-gate.md`): every gate PASS but one browser test that still expected the VAT form's title before WEB27, fixed in 705cc9fd9; Maven verify 346 s there against 776 s here; the docker gate passed on the laptop (the cloud VM's proxy certificate breaks `npm ci` inside the image). 6 simulator suites pass locally.

### Wave 5: Welsh, after every English string is final

One wave, one gate (operator, 2026-11-17: waves 5 to 9 collapsed into one). The batches start in
this order:

1. `welsh-chrome` builds LANG9 alone and lands on the wave branch first: the Welsh header, the
   language choice that persists, and the base of `i18n/cy.toml`.
2. From that tip, three batches run at once:

| Batch | Rows, in order | Model | Owns |
| --- | --- | --- | --- |
| welsh-vat-itsa | LANG10a, then LANG10b | Opus, 3 agents | VAT, receipts and HMRC Assist pages, then the 26 Income Tax pages |
| welsh-ch | LANG11a, then LANG11b | Opus, 2 agents | the Companies House pages, then the Welsh accounts filing |
| marketing | MKT8 | Opus | `web/marketing/` only |

LANG10b follows the rules LANG10a sets, and LANG11b follows LANG11a's research file, so each pair is
a chain on one worktree. MKT8 follows LANG9 because LANG9 puts the language option in the header of
every page that MKT8 photographs. Each batch adds its keys to `i18n/cy.toml` in its own section; a
conflict there is resolved by keeping both sides' keys, and `npm run build:welsh` writes the `cy/`
pages after the last batch lands.

CW1 (the AWS credential handoff) leaves the set and ships on its own pull request as soon as it is built (operator, 2026-11-18); CW2 (the relay) and CP1 (the cloud profile) stay in wave 5. Wave 6's scene work (VID1 to VID5) runs on the cloud workers before the wave 5 gate (operator, 2026-11-18).

State: gated a885bac1a. Cloud worker epoch: maven verify 541 tests (397 s), npm test 12,439 (127 s), mcp 426, browser tests 1,399 of 1,400 with 2 workers (562 s), prettier, both ESLint ratchets, ESLint on added files. Laptop: docker, the content scan, 21 simulator suites (compliance, companiesHouse, fileMicroEntityAccounts, postVatReturn rerun on the tip). CW1 left the set: merged in #836.

### Wave 6: the look wave

No row of its own: it is the retake that the definition of done asks of every row that changes
what a person sees, done once.

1. Record each scene script that records on the simulator lane (`npm run video:record -- <id>
   simulator`), with WEB1's fixes, and cut the guide frames (`npm run video:walkthrough`).
2. Take the site screenshots and build the marketing screens (`npm run marketing:build -- screens`).
3. `visual-review` on the screenshots in light and dark, at 390 and 1280 wide, in English and Welsh.
4. The `ui-ux-pro-max` review of the guide's screenshots.
5. Fix each fail on the wave branch, or write it to `NEXT.md` as a row with its screenshots.

State: gated 300ef3e21. Cloud worker epoch on e6bad32f3: npm test 12,727, mcp 426, browser tests 1,442 of 1,459 (the 16 ctReturnTokenCost failures were the empty approval date, fixed in 300ef3e21 and rerun: 73 passed), prettier, both ESLint ratchets, the 8 generators clean; maven verify and spotless on d36a88ef1 (no Java change since). Laptop: docker, the content scan, 17 simulator suites (companyTaxReturn rerun on the settled tip), the header tests.

## Waves: spreadsheets

| Wave | Batch | Rows | Model | Owns |
| --- | --- | --- | --- | --- |
| 1 | links | SL2 | Sonnet | the "Submit VAT MTD" links and their three writers |

It builds beside submit's wave 1, in `../spreadsheets.diyaccounting.co.uk`, by that repository's
rules (`orient-spreadsheets` first). State: gated 4727bd7eb (npm test: unit and gates pass; the browser files SL2 reaches pass 66 of 66, the other 532 pass).

## Gates

**Each wave branch**, after its last batch lands:

1. The generators the wave touched, then `git status --short` shows nothing (`npm run
   build:static-content`, `build:filing-pages`, `build:mtd-calendar`, `build:rates-page`,
   `build:welsh`, `marketing:build`, `capabilities:generate`, `scripts:table`).
2. `scripts/batch-check.sh claude/ridge-w<nn>` in one background command: the content scan, the
   bundle, `./mvnw clean verify`, `npm test` (with the Docker system tests), the mcp tests, the
   browser tests, Prettier, Spotless, the ESLint ratchets, the Docker build when touched.
3. The simulator behaviour suites that the wave's rows reach (`npm run
   test:<suite>Behaviour-simulator`), one at a time under `/tmp/submit-simulator.lock`.
4. An Athena type proof on ci for each new or changed view (read-only; no deployment).

Set branch: `claude/ridge-set` at 300ef3e21 (wave 6's gated tip, so its batch-check is wave 6's gate). The 42 simulator suites run split across cloud workers anvil, bugle, cyclone and dusk (`claude/<codename>-set-sim`); the 37 proxy suites run on the laptop in series (log in the session scratchpad).

**The set branch `claude/ridge-set`**, before the push:

1. `scripts/batch-check.sh claude/ridge-set`.
2. All 42 simulator behaviour suites, in series.
3. The 38 proxy behaviour suites against HMRC's sandbox and the Companies House test services
   (`npm run test:<suite>Behaviour-proxy`; Docker; secrets through `scripts/proxy-secrets.sh`, so
   inside an SSO window). The Welsh journeys of LANG10a, LANG10b and LANG11a run here once each.
4. The machine probe of `CLAUDE.md` ("Reading machine load") before any timing is trusted; the
   gates stay serial.

**Spreadsheets**: `npm test` (the router) on the set branch; the pre-push hook runs the scoped
suite at the push.

## The push: submit

1. Check both SSO profiles, then read the ci slots (`aws --profile diya-submit-ci ssm
   get-parameters-by-path --path /submit/ci/slots`).
2. Set the life of the ci set before the push. `.github/workflows/deploy.yml` has two defaults for
   `selfDestructDelayHours` (4 at line 176, 2 at line 238), so a push-triggered set lasts 2 to 4
   hours, and its slot claim lasts the delay plus one hour (`claim-ci-slot.mjs`, line 179). The
   deploy takes about 45 minutes and the proof list below about 2 hours. Start the set with
   `gh workflow run deploy.yml --ref claude/ridge-set -f selfDestructDelayHours=6` straight after
   the push, with no `deployment-name` so the run claims `ci-set1` or `ci-set2` (a named set
   cannot sign in), and cancel the push-triggered `deploy.yml` run in its first minute: one deploy
   per head. Confirm the slot in the run's `names` job. Have each proof's command ready first.
3. Push `claude/ridge-set` once. Open one pull request; its body lists the rows by wave and says
   what each turned out to be. `/watch`.
4. The ci proof list, against the one ci set: WEB2 (a day pass's expiry), WEB3 (the 404 page, the
   redirect, the API's JSON), WEB8 (sign-in returns to the chosen activity), WEB14 (the support
   issue), MCP2 (Claude's and ChatGPT's connectors sign in), OS18b (each tool's field list as the
   demo user), DASH40 (an item's TTL), LANG10a and
   LANG10b (a Welsh VAT return and a Welsh quarterly update to the sandbox), LANG11a (a Welsh
   journey on the test gateway). Branch dispatches: `stack-drift.yml` for SD1, `alarm-replay.yml`
   for WAF2, `compliance.yml` against prod for WAF1.
5. A candidate fix goes to the standing ci set by a lean deploy (`fast-deploy`), is proven there,
   and then rides one fix push. The ci set self-destructs; `destroy-ci.yml` sweeps what is left.
6. `/auto-merge` (with `--merge`). `main`'s deploy is the one prod deploy; `deploy-finish.yml`
   destroys the outgoing prod set.
7. The prod proof list: each row's own "Proof on prod", by label, in wave order. WAF3, WAF1, WAF2
   and the DASH rows have their proof on prod only.

## The push: spreadsheets

After WEB4 is live on prod (SL2 follows it): push `claude/ridge-set` there with SSH keepalives,
one pull request, `/watch`, `/auto-merge`, and SL2's proof on prod.

## After the deploy

- `video-capture-on-deploy.yml` records the scripts that need prod. Their frames are static files
  under `web/public/videos/`: a lean deploy of the web assets to prod, then a push straight to
  `main`. The unlisted uploads wait for the operator to watch them.
- DASH45 can start. `/board` moves it.
- The wave and batch worktrees and branches go: print the removal block for the operator.

## When the set branch fails

The waves are a chain, so a smaller push is a prefix of it. Push the tip of the last wave whose
gates passed and whose rows need nothing from a later wave: wave 4 carries every English row; wave
5 adds the Welsh rows; wave 6 adds the retake. The waves after the pushed one start the next set,
rebased on the new `main`.
