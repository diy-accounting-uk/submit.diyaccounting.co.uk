<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. Every item ends with a tag line: **Source** (backlog row, GitHub issue, plan doc, or
none), **Owner** (`Operator` for steps a workflow cannot do, `Claude Code` for steps a sub-agent
runs), and for Claude Code steps the **Model** a sub-agent should use (Fable > Opus > Sonnet >
Haiku; the lowest tier that fits). Anything touching code goes through a `claude/*` branch and
PR; the operator merges.

**Prod runs deployment prod-5086803** (PR #333's merge deploy 35821860017, green at 06:31 UTC).
**ci**: `ci-set1` is last-known-good (PR #334's push deploy 35822161136, green at 06:23 UTC).
PR #336's push deploy 35826770865 is green (07:21 UTC); PR #335's push deploy of ec4b22f5 is in
flight. Open pull
requests: #334 (`claude/b80-board`, head f4770e0c),
#335 (`claude/b81-board`, head 858c8cd3), #336 (`claude/b82-board`, head c450180d).

The board runs in five sections, in this order: **in flight** (a branch, a pull request or a run
in motion, each named in the row), **machine-only**, **machine-ask**, **human-driven**,
**blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `machine-ask` is work a session drives end to end with a human present to authenticate or
approve: a second factor, an SSO login, a command the session's policy denies, a send from the
operator's address, a write to Google or GitHub the operator says go to. `human-driven` is work a
human must navigate themselves: a coding assistant's practical limits, a physical restriction
beyond one authentication (a proctored exam, a signature in person), or policy (a payment mandate,
a filing against the operator's own company, a decision between named alternatives). A row whose
only human step is merging its PR is machine-only; that is the standing workflow, not an action
the row needs. Within a section, items run by the size of the change to committed files, least
first (operator, 2026-09-13); a row that changes nothing committed — a comment, a run, a scan, a
console action — comes before any code. Operator items are briefed in
`../NEXT_OPERATOR_RUNBOOK.md` at the workspace root, one file rewritten in place. Every item
names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or `none` for a human
step.

## In flight

**COOL-DOWN is on since 2026-09-22T19:56:50Z.** No new board rows except a degradation. Agents commit
and stop. One branch is driven green at a time. Lifted only by the operator in their own words.

- [ ] **B82. Wave b82 on `claude/b82-board`, PR #336.** Three commits, head c450180d. Its push deploy 35775043216 failed four
  stacks on `ci-set1` because PR #333's dispatched redeploy, named for the same slot, ran on the
  set at the same time (a dispatch with an explicit slot name bypasses the claim); the rerun on `ci-set1` passed every stack and every
  probe but `diyaGlSubscriptionBehaviour`, which fails on the book limit PR #333's product fix
  removes and this branch does not carry; the branch merged `main` as 71738aa2 and its push deploy 35826770865 passed every stack and
  every probe (07:21 UTC); every workflow on the head is green, so the PR waits for the operator's
  merge or the wake word: B34j
  (a9e2e920, the privacy notice's row for practice client filing, with a browser test) and PU-7e
  (e4302a96 and c450180d: `tokensGranted = "unlimited"` on `resident-pro`, exempt in
  enforcement, the webhook refresh and the bundle read, shown as unlimited on the usage page,
  the header, the submission-cost widget and the dashboard gate, the simulator map to match);
  B34i's ICO wording is on `main`. No pull request yet. **Source**: the rows named. **Owner**:
  Claude Code. **Model**: Sonnet and Haiku. **Size**: ~5 files.

- [ ] **B81. Wave b81 on `claude/b81-board`, PR #335.** PU-7m (a0bd6686: the practice licence
  suite green on the simulator lane, the practice-clients table bootstrapped for the local lanes,
  `resident-pro` granted through checkout so `subscriptionStatus` is set) and AS1 (f3538afa: the
  `**/.claude/**` coverage exclude matched every file inside a worktree under
  `.claude/worktrees/`, so both providers reported nothing; the project config's misplaced
  `pool`/`include` block flattened; thresholds 76/68/86/77 from the measured run). AS7a's strict
  validation is reverted on the branch: the simulator lane runs with `COGNITO_CLIENT_ID`,
  `COGNITO_BASE_URI` and the two HMRC secret ARNs blank by design, so every simulator suite's
  server failed to start in `test` run 35767760731; deploy 35767761916 never won a ci slot (both held, one by
  PR #334's ended run) and was cancelled; the reverts pushed as cd8f56d8, whose `test` run failed the new
  practice licence simulator suite on a missing `mcp/node_modules` (the job never installed the
  MCP package); head 858c8cd3 adds that install and carries B30as (1a9ec71e: a `release-ci-slot`
  job at the end of `deploy.yml` deletes this run's claim unless the set is the ci LKG, with the
  stale rule as backstop). Its `test` run is green; its deploy 35775629294 first failed for want of a ci slot, and its
  rerun claimed `ci-set2` at 23:05 UTC once PR #334's claim went stale: every stack and 12 of the 13
  probes passed, and `diyaGlSubscriptionBehaviour` failed with `book-limit-reached` (job
  106980081292), the defect PR #333's third commit fixes and this branch does not carry. The
  branch merged `main` as ec4b22f5 (clean; lint, 3894 tests and Spotless green on the merged tree)
  and pushed it. Its `test` run 35831691533 failed the coverage gate this branch introduced (AS1):
  functions 85.9% against the 86% threshold, because `main`'s merged code added uncovered
  functions; the fix is c9601a2c (functions 85, the floor of the merged tree's measurement,
  proven by a local coverage run) and is pushed. Its push deploy 35831692141 never won a slot
  (both claims held by PR #334's and PR #336's ended runs, which do not carry this branch's
  `release-ci-slot` job, until they go stale at 10:43 and 11:47 UTC) and was cancelled; the
  dispatched deploy 35836957021 to `ci-set2` (08:24 UTC) is the head's proof. The suite's ci and prod variants need a sandbox agent authorisation the simulator
  shortcut has no equivalent for, so they run only when one exists. **Source**: the rows named.
  **Owner**: Claude Code. **Model**: Sonnet and Haiku. **Size**: ~16 files.
- [ ] **PU-7. Practice licence build.** PU-7a to PU-7l are on `main`. In flight on
  `claude/b81-board` (wave b81): PU-7m, the behaviour test `behaviour-tests/practiceLicence.behaviour.test.js`,
  two clients added through the practice routes, a derive and a submit for each on the simulator
  lane over the MCP's `run_for_clients`, registered in `deploy.yml`, `probe-test.yml` and
  `test.yml`. What follows is PU-7e and PU-7n below. **Source**: `PLAN_PRICE_UPDATE.md` PU-7.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.
- [ ] **B80. Wave b80 on `claude/b80-board`, PR #334.** Three agents: AS8 (the two RUM deployed-environment skips out of the unit runner; AS1's
  coverage commit rejected, the finding on its own row), AS4 and AS7 (the ESLint config cleanup; the strict-mode TODO and warning
  comments), AS6 and AS5 (prettier and Spotless checks in `test.yml`, with the 218 files they reformat; the
  lint job as a baseline ratchet at zero errors). Its `test` run is green on head f4770e0c (the prettier fix), but no deploy has run on that
  head: the last deploy 35761188691 (9b633159) failed, and the two commits since touch no deploy
  path. Its dispatched deploy 35801175335 to `ci-set1` (00:14 UTC) passed every stack and every
  probe but `diyaGlSubscriptionBehaviour`, red with `book-limit-reached` (job 106996738920), the
  defect `main` now fixes (PR #333). The branch merged `main` as 93279af1 (one conflict, the
  `isBookVisible` import) and pushed as 337c3f4e; its push deploy 35822161136 on `ci-set1` passed
  every stack and every probe, and every workflow on the head is green: the PR is mergeable and
  clean, held for the operator's merge or the wake word. **Source**: the
  rows named. **Owner**: Claude Code. **Model**: Sonnet and Haiku. **Size**: ~10 files plus the
  directives.

## Machine-only

- [ ] **B30av. A superseded scheduled probe fails its upload job.** The scheduled `probe-test` run
  35821806378 (05:17 UTC, 2026-09-23) found `main`'s deploy 35821860017 gating the apex, so both
  prod suites took the superseded path (`.github/workflows/probe-test.yml` line 521) and ended
  green with no report, but `upload-web-test-results` (line 818) runs on
  `generate-test-reports == 'true'` alone and its report step (lines 922 to 924) failed with
  "Downloaded test report not found", so the run is red for a suite nothing ran. Add
  `&& needs.behaviour-test.outputs.superseded != 'true'` to that job's `if`, the guard the
  probe-row step already uses (line 759). Proof: `prettier --check` on the file, a js-yaml parse,
  and the next scheduled run that coincides with a `main` deploy ending green. **Source**: run
  35821806378. **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **B30au. The snapshot-publish alarm re-fires on a two-day-old datapoint.**
  `prod-env-operator-snapshot-publish-errors` opened issue #337 at 03:16 UTC on 2026-09-23 on
  "1 datapoint [2.0 (21/09/26 03:16:00)]" and returned to OK two minutes later; the Lambda's
  `Errors` metric has no datapoint after 2026-09-21 03:00 UTC and the 22 and 23 September
  publishes logged `failedObservations: 0`. The same re-evaluation opened #292 on 2026-09-17 for
  the 15 September errors. Cause: `OperatorSnapshotPublish.java` (lines 212 to 217) builds the
  alarm on a 24-hour period with one evaluation period, so CloudWatch re-evaluates the daily
  bucket at its edge two days on. Change the period to one hour (the nightly runs once at 03:17
  UTC, so an hourly `Errors` sum of 1 or more fires within the hour and clears the next);
  `OperatorSnapshotPublishTest.java` (line 101) asserts the name and metric only, so add
  `Period: 3600` to that `objectLike`. Proof: `./mvnw -q test -Dtest=OperatorSnapshotPublishTest`
  and the synthesised alarm's `Period`. **Source**: issue #337; alarm history 2026-09-17 and
  2026-09-23. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B30at. The sweep destroys a slot set a deploy is using.** PR #334's push deploy set
  `/submit/ci/last-known-good-deployment` to `ci-set2` at 18:23 UTC when its stacks succeeded
  (its probes then failed), which made `ci-set1` a non-LKG set older than
  `SELF_DESTRUCT_SWEEP_MIN_AGE_HOURS` (8); `destroy-ci.yml` run 35766864248, started by that
  deploy's completion, deleted `ci-set1`'s stacks at 19:25 while PR #333's deploy 35773445604
  had claimed the slot at 19:23 and was updating them ("the stack disappeared while we were
  deploying it", then `ERR_NAME_NOT_RESOLVED` on every probe). The sweep's `wait-for-ci-deploys`
  step (line 12) waits only for runs older than itself. Before destroying each set, the sweep
  reads `/submit/ci/slots/<slot>` and skips a set whose claim names a run still `in_progress` or
  `queued` (`gh run view`), and the two-slot pool's sets are never swept while claimed. Proof: a
  sweep dispatched with `-f sweep-for-stacks=true` while a branch deploy holds a slot logs the
  skip and leaves the set. **Source**: runs 35766864248 and 35773445604; BACKLOG 30. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B52f. Web vitals on all three sites.** The page-experience panel wants LCP, INP and CLS
  at p75 for submit, spreadsheets and the apex; RUM on submit records LCP and INP. Read the RUM
  app monitor's `telemetries` in `infra/main/java/.../EdgeStack.java` (or wherever
  `AppMonitor` is built) and the client config in `web/public/lib/analytics.js`, and add CLS if
  it is not collected; read `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js`
  and its `site-rum-loader.browser.test.js` for whether spreadsheets has an app monitor of its
  own (its CDK under `../spreadsheets.diyaccounting.co.uk/infra`), and add one if not; the apex
  (`../www.diyaccounting.co.uk`) the same. Then the GA4 side: cross-domain linking across the
  three hosts and the key events, as code through `infra/google/` (backlog 49's tooling; the
  Admin API script there). Three repositories, one PR each, this repository's panel reading the
  three monitors. **Source**: BACKLOG 62; `PLAN_ONE_STOP_DASHBOARD.md` D3. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~6 files across three repositories.

- [ ] **B52g. `ads-report.js`, what the account did.** A read-only script beside
  `infra/google/ads/ads-sync.js` using its credential path (`ads.toml` `[secrets]`, API
  `v25`) and GAQL over `campaign`, `ad_group` and `keyword_view` with `segments.date` for a date
  range (`--from`, `--to`, default the last 28 days): impressions, clicks, cost, average CPC,
  CTR, conversions, conversion value, per campaign, per ad group and per keyword, as a table on
  stdout and JSON with `--json`. No writes. Proof: a run against customer 8142685080 prints the
  Performance Max campaign's rows for the range. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B52h. `ads-forecast.js`, what a budget would buy.** A read-only script using
  `KeywordPlanIdeaService`: `generateKeywordHistoricalMetrics` for a keyword list (UK, English)
  giving monthly searches, competition and top-of-page bid ranges, and
  `generateKeywordForecastMetrics` for those keywords at a daily budget (`--budget-gbp`) giving
  expected clicks, impressions, cost and average CPC; the keyword list from a file or
  `--keywords`. Proof: `--keywords "submit vat return,mtd vat software" --budget-gbp 50` prints a
  forecast. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B52o. Google's Ads API MCP server, evaluated.** Read Google's published MCP server for
  the Ads API (its repository, auth model, whether it is read-only GAQL, its developer-token and
  OAuth needs against `ads.toml` `[secrets]`), and write one page under `_developers/` saying
  whether it adds anything the scripts above do not, what it would cost to run beside the
  toml door, and a yes or no; no install. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: ~1 file.

- [ ] **B52e. Donations on the revenue panel.** `infra/stripe/stripe.toml` (lines 53 to 60)
  says the spreadsheets site's donation Payment Links live in the same Stripe account and carry
  `payment_intent_data.metadata.bundleId`, which `v_revenue_daily` groups by (`coalesce(bundle_id,
  'unknown')`). Prove it on live data: with `AWS_PROFILE=submit-prod`, query the view for the last
  90 days (`aws athena start-query-execution` with the analytics database and workgroup
  `operatorSnapshotPublish.js` names) and read whether donation charges appear under their
  product or under `unknown`; if `unknown`, read a recent donation charge from Stripe live
  (`infra/stripe/stripe-sync.js`'s key lookup, read-only) for whether the metadata is missing on
  the link or dropped in the pull (`scripts/finance/stripe-stage.js` or the revenue ingestion
  Lambda), and fix that layer. PayPal donations join through F1b once OF1 lands. **Source**:
  BACKLOG 66; `PLAN_ONE_STOP_DASHBOARD.md` D2. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~2 files.

- [ ] **B52k. Bidding strategy as code, every one the API offers.** `ads.toml`'s
  `[[campaign]]` gains a `[campaign.bidding]` table mapped one to one onto the Google Ads API's
  campaign bidding fields, so any strategy the API accepts is declarable: `manual_cpc`
  (`enhanced_cpc`), `maximize_clicks` (`target_spend` with optional `cpc_bid_ceiling_gbp`),
  `maximize_conversions` (optional `target_cpa_gbp`), `maximize_conversion_value` (optional
  `target_roas`), `target_cpa`, `target_roas`, `target_impression_share` (`location`,
  `fraction`, `cpc_bid_ceiling_gbp`), and a portfolio strategy by `bidding_strategy` resource
  name. `ads-sync.js` plans and applies it through `campaigns:mutate` with the field mask for the
  strategy chosen, refusing a strategy the campaign's channel type cannot take (Performance Max
  accepts only the two maximise-conversion forms) with the reason in the plan. Money fields in
  pounds in the toml, micros on the wire. Unit tests for the mapping and the refusals in the shape
  `ads-sync.js`'s existing tests use; the header comment updated (it still says the script never
  writes conversion actions, and it does). **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B52n. A Search campaign as code.** `ads-sync.js` refuses to create a campaign today (its
  header: a declared campaign the account lacks fails the run), because the one campaign is
  Performance Max, whose asset groups need uploaded images and headlines the toml does not
  carry. A Search campaign needs none of that: extend `ads.toml` with a `[[campaign]]` of
  `type = "SEARCH"` carrying `[[campaign.ad_group]]` (name, keywords with match type, and one
  responsive search ad's headlines, descriptions and final URL, the submit home page), and let
  `ads-sync.js` create and update campaign, budget, ad groups, keywords and the ad through their
  `mutate` calls, paused by default so a merge never spends until `status = "ENABLED"` is
  declared. Performance Max stays read-and-adjust only. Proof: a plan run shows the creation, an
  apply on a paused campaign leaves £0 spent, and B52g's report lists it. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B52d. The visitors panel.** `operatorSnapshotPublish.js` already reads
  `v_visitors_by_kind_daily` (lines 176 to 191: the `human` and `bot` rows; add `synthetic`) into
  the snapshot; `web/public/operator/dashboard.html` shows nothing from it. Add a visitors panel
  (human, bot, synthetic per day, the last 30 days) in the shape the page's other panels use,
  reading the snapshot's existing fields, with a case in the page's unit test. Proof: the panel
  renders from a snapshot fixture carrying the three kinds. **Source**: BACKLOG 67;
  `PLAN_ONE_STOP_DASHBOARD.md` D4. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **AS15. A dead-code pass with knip.** The assessment's dead-code scan used `ts-prune` on
  a JavaScript tree and reported zero, which is "not analysed". Run `npx knip` once at the root
  (a `knip.json` naming `app/bin/server.js`, the Lambda handlers under `app/functions/**` and the
  `mcp/` package as entries, so handlers are not reported as unused), read every finding against
  the code, and delete what is dead in one commit; anything ambiguous becomes a row here with the
  finding quoted. No CI gate. **Source**: the AI-readiness assessment of 2026-09-18 (`.assess/assess-report.md` on the `bjcoombs` fork at 45bcc054). **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~1 file plus the deletions.

- [ ] **B83. The capabilities audit.** One report, `REPORT_CAPABILITIES.md` at the root, that
  gives an agent the repository's capabilities in one place, the non-obvious ones included (the
  Google Ads and GA4 management under `infra/google/`, the ci slot pool, the practice licence, the
  MCP, the finance pipeline). Method, written into the report's own "Method" section: (1) walk
  every tracked source, workflow, script, config, page and skill file (`git ls-files` over
  `.js|.mjs|.java|.yml|.toml|.sh|.html|.sql|.md`, excluding `reference/`, `web/public/tests/`,
  `web/public/docs/`, `web/public-simulator/` and `_developers/hmrc/`; about 1,400 files) in
  directory-sized batches, each batch one Haiku agent writing one JSON line per file
  `{"file","capabilities":[{"name","outline"}]}` under `target/capabilities/<batch>.jsonl`, where
  an outline is the implementation in one or two sentences with the function or job that
  delivers it; (2) one Sonnet pass over the union that normalises names (one verb-noun phrase
  each), merges duplicates across files, groups them into capabilities and groups the groups
  into areas (customer-facing, HMRC and Companies House filing, billing, operations and CI,
  analytics and finance, MCP and tools, developer workflow), keeping every file's outline as
  the trace beneath its capability; (3) the report: a table of contents with one grep-able
  anchor per area and capability (`## Area`, `### Capability` headings, a one-line `Files:`
  list under each), the Method section, and the date and commit it was built from. Then
  `CLAUDE.md` links the report in its Quick Reference and explains the format in three lines
  (areas, capabilities, file outlines; grep the heading to find the implementation). Rebuilt
  by the same method when the operator asks. **Source**: operator 2026-09-22. **Owner**:
  Claude Code. **Model**: Haiku for the walk, Sonnet for the report. **Size**: ~2 files plus
  the batch outputs.

- [ ] **AS18. One assistant guide, aligned with CLAUDE.md.** Junie is no longer used: delete
  `.junie/guidelines.md` and `_developers/Junie.md`, and the "Other AI assistants" lines in
  `CLAUDE.md` that name them. Then read `.github/copilot-instructions.md` against `CLAUDE.md`
  and the tree, and correct every statement in it that CLAUDE.md or the code contradicts (the
  assessment found the Multi-Site section of CLAUDE.md false and expects more). Proof: every
  backticked path in both files exists in a fresh clone. **Source**: the AI-readiness assessment of 2026-09-18 (`.assess/assess-report.md` on the `bjcoombs` fork at 45bcc054), opportunity
  list; operator 2026-09-22. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~4 files.

## Machine-ask

## Human-driven

- [ ] **OICO. Update the ICO registration.** With the "Practice licence: client data" section of
  `_developers/ICO_CHECKLIST.md` (registration ZB070902), sign in to the ICO's
  registration portal and update DIY Accounting Limited's entry to cover the practice licence's
  client data; note the date in `_developers/ICO_CHECKLIST.md`. **Source**: operator
  2026-09-22. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O34d. Send the XML Gateway email.** Send `../DRAFT_EMAIL_XMLGW_000004.md` from `antony@diyaccounting.co.uk`
  as a reply on the `xml@companieshouse.gov.uk` thread, and paste the answer into B34.6c's row when
  it comes. **Source**: BACKLOG 34d. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **OF1. The PayPal app credentials.** In the PayPal developer dashboard
  (<https://developer.paypal.com/dashboard/applications/live>), create a live REST API app for
  the company account and put its client id and secret on the `prod` GitHub environment as
  `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
  (<https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/settings/environments>); the
  next `deploy-environment.yml` run lands them, and F1b's six-month run follows. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O11. The ITSA send day.** Name the day the recognition email goes, write it into B11.T10's
  row, and on that day send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk`, then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when
  SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**:
  none. **Size**: 0 files.

- [ ] **F1d. NatWest statements to staging.** The operator signs in to NatWest and downloads, for
  each of March to August 2026, the current account `600947-80597386` and the savings account
  `600947-80634672` statements as CSV and PDF into `../staging/2025-2026/bank/` (March) and
  `../staging/2026-2027/bank/` (April to August; both directories exist, with `../staging/README.md`
  naming the layout), named
  `<yyyy-mm-dd>-natwest-<current|savings>-<account>.<csv|pdf>` with the month's last day, the shape
  of the 2025-26 files in the Drive mirror. No automation touches the bank sign-in. **Source**:
  `../PLAN_FINANCE_AUTOMATION.md` route 3. **Owner**: Operator. **Model**: none. **Size**: 24 files
  outside any repository.

## Blocked

- [ ] **B11.T10. ITSA phase 2: the testing evidence inside the window.** Within the 14 days before
  the day O11 names, re-run `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the
  commands in `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` lines 69 to 79; B11.T7c's output directory
  under `../itsa-sandbox/<tax-year>/`) and update the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28) with the
  run dates and commit. Blocked on O11's day. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** When O34d's answer says
  lookups are enabled: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on O34d's answer. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **B52j. The `ads-advisor` skill.** `.claude/skills/ads-advisor/SKILL.md`: how to run B52g
  and B52h, how to read CTR, CPC, conversion rate and cost per session against the funnel's
  break-even cost per session (£0.36, `PLAN_ONE_STOP_DASHBOARD.md` D17) and the reinvestment
  numbers on B52m, how to answer "how many clicks for £N a day" (forecast, then the report for
  what the live campaign does) and "optimise for the same result" (B52k's bidding vocabulary:
  which strategy and parameters, written into `ads.toml` as a PR whose plan shows the change),
  and when to say the spend cannot pay back. Registered in `CLAUDE.md`'s skills list. Blocked on
  B52g, B52h and B52k. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~2 files.

- [ ] **B52l. The optimiser over the raw export.** A notebook over `../analytics/prod/` (pulled by
  `scripts/analytics-pull.sh`, one CSV per view in `rawExportPublish.js`'s `VIEW_NAMES`): per-block
  correlations, the block models fitted (linear cost from `v_cost_daily`, log-linear funnels from
  `v_login_to_submission_funnel` and `v_ga4_funnel_daily`, Hill curves for spend), levers ranked by
  effect per unit cost, and the next experiment proposed with its predicted effect and interval as a
  row ready for `experiments.toml`; Bayesian optimisation for the continuous knobs and a
  Thompson-sampling bandit for allocations once experiments exist. The model design as a section
  under `PLAN_ONE_STOP_DASHBOARD.md` D16 first, then the notebook, then one line per objective on
  `web/public/operator/dashboard.html`. Blocked until three months of nightly export exist under
  `exports/prod/`: first written 2026-09-08, so the gate is 2026-12-09, checked with `aws --profile
  submit-prod s3 ls s3://prod-env-analytics-lake-<account>/exports/prod/`. **Source**: BACKLOG 52l;
  `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus for the models, Sonnet
  for the notebook. **Size**: ~3 files.

- [ ] **B52m. The reinvestment loop.** Trailing income, reserve, budget, return per pound and payback
  as one block on `web/public/operator/dashboard.html`, fed by observations over `v_revenue_daily`
  and `v_cost_vs_target_monthly` in `operatorSnapshotPublish.js`; the reinvestment fraction as a
  lever with the reserve floor (operator, 2026-09-22: the fraction is 20% of trailing income, the
  reserve floor £2,000, one experiment may take at most 10% of the budget unless the operator
  names a larger share for it, and the trailing window is 30 days); paid traffic and article boosts as `experiments.toml` rows with
  on-off or geographic controls; GA4 conversion import from the Ads account, which exists as code
  (`infra/google/ads/ads.toml`: customer `8142685080`, four conversion actions imported from GA4
  events, one Performance Max campaign); the cost-per-session ceiling PU-15 wrote into D17 is the
  starting bid ceiling. Blocked on B52l's fitted models (the return-per-pound figure), the cost
  panel carrying revenue (BACKLOG 43, from 2026-10-02). **Source**: BACKLOG
  52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3
  files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** The company's diya-gl book,
  derived nightly and rendered above the eight objectives beside the last set filed at Companies
  House. Shape: a nightly Lambda beside `app/functions/analytics/` calling `mcp/lib/accounts-tools.js`
  `derive_micro_entity_accounts` over the cloud book, writing JSON lines to `curated/finance/` with
  a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in
  `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in
  `web/public/operator/dashboard.html`. Blocked on OF2 (DIYA's book saved to the DIYA cloud, the last of the F1 and F2 rows). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **F2d. DIYA's book, assembled and verified.** The lines from F2a and F2b plus F2c's
  `book.toml` for 1 March to 31 August 2026, validated with `validateBook` and `validateLines`
  from the diya-gl package, written under `../staging/2026-2027/book/` (private); March 2026 matched
  line for line against the completed 2025-26 workbook (the control), every month's bank closing
  balance equal to the statement's, gross income and fees separate, no hold posted, each check a
  line in `../staging/2026-2027/book/VERIFICATION.md`. Blocked on F1b's run (OF1), F1d, F2a's Stripe and PayPal parsers, F2c and F2f.
  **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2 and its verification. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **F2e. The MCP writes a populated spreadsheets package.** A tool in `mcp/lib/finance/` that
  takes the book and lines and writes a DIY Accounting spreadsheets package, reconciled under the
  spreadsheets repository's existing reconciliation harness rather than a new check; nothing
  automated writes to Google Drive. Blocked on F2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md`
  phase 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-7n. The practice licence launch.** Operator, 2026-09-22: `resident-pro` at £199 a
  year and £19.99 a month, the monthly price shown only on `bundles.html` (the DIYA-GL page shows
  annual prices alone, for `resident` too). `web/public/submit.catalogue.toml`'s `resident-pro`
  values flip to `enable = "always"`, `hidden = false`, `allocation = "on-subscription"` with the
  two prices on its prices table, then `stripe-catalogue-sync` test and live for the price ids
  into `.env.ci` and `.env.prod` (machine-ask for the live run); the practice page's nav link in
  `web/public/widgets/page-chrome.js` appears; the four ci probes that reach `resident-pro`
  through a pass are updated in the same change; `web/public/diya-gl.html` (or the page that
  lists `resident`'s prices) drops the monthly line. Blocked on PU-7m (PR #335), B34j and OICO (the
  register must cover the client data before the tier is sold). **Source**:
  `PLAN_PRICE_UPDATE.md` §(d); operator 2026-09-22. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~9 files.

- [ ] **OF2. DIYA's book saved to the DIYA cloud.** With the operator signed in through B61's
  sign-in, `save_book` writes F2d's verified book to the DIYA cloud, which is B52i's unblock event.
  Blocked on F2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude
  Code; the operator signs in. **Model**: Haiku. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

