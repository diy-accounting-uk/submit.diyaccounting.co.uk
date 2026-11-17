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

Answers of 2026-11-17: the set carries all 53 rows that can ride in it; the set branch passes every
local gate, the proxy lane among them, before the push.

## Status

defined 2026-11-17. The operator's `/iterate` is the approval.

## The goal

The laptop and the Claude subscriptions are paid for; a ci set in AWS is billed for every hour it
stands. The set does all the work it can locally, in as many waves as it needs, then pays for one
ci deployment (destroyed after its proofs) and one prod deployment (the outgoing set destroyed) in
each repository. More local waves are cheap. A second push is expensive.

## The set

| Repository | Rows | Pull requests | Branch pushed |
| --- | ---: | ---: | --- |
| submit | 52 | 1 | `claude/ridge-set` |
| spreadsheets | 1 | 1 | `claude/ridge-set` |

- Left out, for the next set: **DASH45**. Its review reads prod's dashboard after DASH36 to DASH44
  are live.
- Beside the set, with no pull request: **OS16d** (a note in the private repository).
- Not machine-only, so not candidates: OS24d, OOS44, OMKT8 and the 11 blocked rows.

## Waves: submit

Wave 1 branches from `origin/main`; each later wave branches from the tip of the wave before it.
Wave branches are `claude/ridge-w01` to `claude/ridge-w10`; a batch branch is
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

State: pending.

### Wave 2: the home page, the articles' template, the 404 page

| Batch | Rows, in order | Model | Owns |
| --- | --- | --- | --- |
| home | WEB2, WEB9, WEB10, WEB8, WEB11, WEB16 | Sonnet, 2 agents | bundles, pass, home, sign-in page, status notice |
| articles-a | WEB1, WEB17, WEB18 | Sonnet | capture scripts, `build-filing-pages.mjs`, four scene files |
| edge | WEB3 | Opus | `EdgeStack.java` default behaviour, the edge function |
| dash-b | DASH40, DASH41, DASH42 | Sonnet, Opus, Sonnet | retention, actor classes, hourly views |

`articles-a` also makes WEB11's one-line change in `scripts/build-filing-pages.mjs` (the literal
"3 submissions", line 98) as its own commit, because that file is its own in this wave.

State: pending.

### Wave 3: help, the guide, the sources

| Batch | Rows, in order | Model | Owns |
| --- | --- | --- | --- |
| help | WEB12, WEB13, WEB14, WEB24 | Sonnet, 2 agents | `faqs.toml`, help page, support form, legal pages |
| guide | WEB19, WEB26 | Sonnet, 3 agents | the other scene files, `guide.page.js` |
| sources | WEB20 | Sonnet | `tax-sources.mjs`, the 50 source files |
| dash-c | DASH43, DASH44 | Opus | stored data graph, retention graph |

State: pending.

### Wave 4: the last English copy

| Batch | Rows, in order | Model | Owns |
| --- | --- | --- | --- |
| articles-c | WEB21, WEB22, WEB25, WEB27 | Sonnet, 2 agents | generators, calendar, page titles, the merged spreadsheets page |

State: pending.

### Waves 5 to 9: Welsh, after every English string is final

| Wave | Batch | Rows | Model |
| --- | --- | --- | --- |
| 5 | welsh-chrome | LANG9 | Opus |
| 6 | welsh-vat | LANG10a | Opus |
| 6 | marketing | MKT8 | Opus |
| 7 | welsh-itsa | LANG10b | Opus, 2 agents |
| 8 | welsh-ch | LANG11a | Opus |
| 9 | welsh-accounts | LANG11b | Opus |

MKT8 owns `web/marketing/` only. It follows LANG9 because LANG9 puts the language option in the
header of every page that MKT8 photographs.

State: wave 5 pending; wave 6 pending; wave 7 pending; wave 8 pending; wave 9 pending.

### Wave 10: the look wave

No row of its own: it is the retake that the definition of done asks of every row that changes
what a person sees, done once.

1. Record each scene script that records on the simulator lane (`npm run video:record -- <id>
   simulator`), with WEB1's fixes, and cut the guide frames (`npm run video:walkthrough`).
2. Take the site screenshots and build the marketing screens (`npm run marketing:build -- screens`).
3. `visual-review` on the screenshots in light and dark, at 390 and 1280 wide, in English and Welsh.
4. The `ui-ux-pro-max` review of the guide's screenshots.
5. Fix each fail on the wave branch, or write it to `NEXT.md` as a row with its screenshots.

State: pending.

## Waves: spreadsheets

| Wave | Batch | Rows | Model | Owns |
| --- | --- | --- | --- | --- |
| 1 | links | SL2 | Sonnet | the "Submit VAT MTD" links and their three writers |

It builds beside submit's wave 1, in `../spreadsheets.diyaccounting.co.uk`, by that repository's
rules (`orient-spreadsheets` first). State: pending.

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
2. Read the `selfDestructDelayHours` input of `.github/workflows/deploy.yml` (default 4) and
   `.github/actions/claim-ci-slot/` before the push. The ci proofs below must finish inside the
   delay; have each proof's command ready before the push.
3. Push `claude/ridge-set` once. Open one pull request; its body lists the rows by wave and says
   what each turned out to be. `/watch`.
4. The ci proof list, against the one ci set: WEB2 (a day pass's expiry), WEB3 (the 404 page, the
   redirect, the API's JSON), WEB8 (sign-in returns to the chosen activity), WEB14 (the support
   issue), MCP2 (Claude's and ChatGPT's connectors sign in), DASH40 (an item's TTL), LANG10a and
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
9 adds the Welsh rows; wave 10 adds the retake. The waves after the pushed one start the next set,
rebased on the new `main`.
