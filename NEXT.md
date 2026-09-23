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

**Prod runs deployment prod-184afec** (PR #335's merge deploy 35846477374, last-known-good since
10:56 UTC on 2026-09-23; that run is destroying the previous prod set).
**ci**: `ci-set1` is last-known-good (PR #335's dispatch 35843310128). No pull request is open.

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

Shared facts for the analytics rows (B52d, B52e, B52l, B52m): the prod Athena database is
`prod_env_analytics` and the workgroup `prod-env-analytics` (eu-west-2, `AWS_PROFILE=submit-prod`);
`OperatorSnapshotPublish.java` passes them to the Lambda as `GLUE_DATABASE_NAME` and
`ATHENA_WORK_GROUP_NAME` (lines 103 to 104).

## In flight

## Machine-only

- [ ] **B30av. A superseded scheduled probe fails its upload job.** The scheduled `probe-test` run
  35821806378 (05:17 UTC, 2026-09-23) found `main`'s deploy 35821860017 gating the apex, so both
  prod suites took the superseded path (`.github/workflows/probe-test.yml`, step "Note … as
  superseded" (line 522)) and ended green with no report, but the `upload-web-test-results` job's
  `if` (line 821) tests `generate-test-reports == 'true'` alone and its "Check downloaded test
  report exists" step (lines 921 to 927) failed with "Downloaded test report not found", so the
  run is red for a suite nothing ran. **Problem**: a scheduled probe run goes red whenever it
  coincides with a `main` deploy, and the red says nothing about prod. **Fixed when**: a scheduled
  `probe-test` run whose suites are superseded ends green with every upload job skipped, shown by
  the next such coincidence. Add `&& needs.behaviour-test.outputs.superseded != 'true'` to that
  job's `if`; the job already `needs: behaviour-test` (line 825), and the "publish cloudwatch
  metric" step uses the same guard (line 760), whose comment explains that the matrix collapses
  `superseded` to one value. Proof: `npx prettier --check` on the file, a js-yaml parse, and the
  next scheduled run that coincides with a `main` deploy ending green. **Source**: run
  35821806378. **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **B30ay. A named ci deployment outside the slot pool cannot prove a signed-in probe.**
  **Problem**: `gh workflow run deploy.yml -f deployment-name=<name>` builds a full set under any
  name (`.github/workflows/deploy.yml` input `deployment-name` (line 63); the pool bypass in the
  `names` job, comment above "Claim a ci slot" (lines 494 to 497)), but only `ci-set1`, `ci-set2`
  and the apex are the ci Cognito client's callback hosts (`SubmitSharedNames.java` lines 1279 to
  1280), so every probe that signs in fails with `redirect_mismatch`; `ci-b79-probe` and
  `ci-b80-probe` cost two runs, about 150 job-minutes, and two sets that stood 12 hours.
  **Fixed when**: the `names` job (line 306) fails in its first step, before any stack job, when
  `needs.params.outputs.github-environment == 'ci'`, `needs.params.outputs.deployment-name` is
  set and is neither `ci-set1` nor `ci-set2`, and `needs.params.outputs.skipTestScenarios` is
  `'false'` (`params` normalises an empty input to `true`, line 206), with a message naming the
  pool. Test only the dispatched input: the skip-deploy path fills `resolved-deployment-name`
  from last-known-good (line 477) and must pass. Proof: `npx prettier --check` and a js-yaml
  parse on the branch; after merge, one dispatch
  `gh workflow run deploy.yml --ref main -f environment-name=ci -f deployment-name=ci-x -f skipTestScenarios=false`
  ending in under two minutes with that message. Shares `deploy.yml` with B30ax (a different
  job); either lands on the other. **Source**: session report yQdSoM, suggestion 4; memory note
  on named ci deploys. **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **AS1a. Coverage thresholds sit one point under the measurement.** **Problem**: AS1 set
  `vitest.config.js`'s `thresholds` (lines 75 to 81) to the floor of one measured run, so the
  first merge that moved a figure by a tenth of a point (functions 86.x to 85.9 when PR #335 took
  `main`) turned the branch's `test` run red for a reason unrelated to its change, costing one CI
  test run and two local coverage runs; c9601a2c lowered functions alone to 85, so the file now
  reads 76/68/85/77. **Fixed when**: each threshold is the measured value on `main` at the time of
  the change minus one whole point, rounded down (re-measured by `npm run test:coverage` on the
  branch after `npm run bundle`), the file carries a one-line comment stating that rule, and a
  merge that moves a figure by under a point leaves `npm run test:coverage` green. **Source**:
  session report yQdSoM, suggestion 6; run 35831691533. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: 1 file.

- [ ] **B52o. Google's Ads API MCP server, evaluated.** Read Google's published MCP server for
  the Ads API (its repository, auth model, whether it is read-only GAQL, its OAuth needs against
  `infra/google/ads/ads.toml` `[secrets]` (line 32): the YouTube OAuth client reused under the
  `adwords` scope with its own refresh token, no manager account and no login-customer-id header
  (line 20)), and write one page under `_developers/` saying whether it adds anything B52g and
  B52h do not, what it would cost to run beside the toml door, and a yes or no; no install.
  Google sunset developer tokens on 2026-09-09, so a server that still asks for one is a no on
  that ground. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **AS15. A dead-code pass with knip.** The assessment's dead-code scan used `ts-prune` on
  a JavaScript tree and reported zero, which is "not analysed". Run `npx knip` once at the root
  (a `knip.json` naming `app/bin/server.js`, the Lambda handlers under `app/functions/**`, the
  `scripts/` and `infra/google/` entry scripts, and the `mcp/` package as entries, so handlers and
  CLIs are not reported as unused), read every finding against the code, and delete what is dead
  in one commit; anything ambiguous becomes a row here with the finding quoted. No CI gate. Proof:
  `npm test` and `npm run linting` green after the deletions. **Source**: the AI-readiness
  assessment of 2026-09-18 (`.assess/assess-report.md` on the `bjcoombs` fork at 45bcc054).
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file plus the deletions.

- [ ] **B84. `/auto-merge` runs a merged PR's new gates on each remaining candidate.** **Problem**:
  PR #334 added the prettier check to `test.yml` and PR #336 added an unformatted file; each was
  green on its own head, and their merges together turned `main`'s `test` run red for 47 minutes
  and cost hotfix PR #338 and two red test runs (about 140 job-minutes). The skill's "Then look at
  the other open PRs" section (`.claude/skills/auto-merge/SKILL.md` line 167, step 1 at line 171)
  checks only that the candidates' changed files do not intersect the merged PR's. **Fixed
  when**: that section also lists the gates the merged PR added or changed in
  `.github/workflows/test.yml` (a new job or step running `prettier`, `eslint`, `spotless`, a
  coverage threshold) and runs each locally on the candidate's tree merged with `origin/main`
  before merging it, reporting `gate <name> red on #<n>` and leaving that PR open with its fix as
  agent work; mirror the step in `.claude/skills/auto-merge-dry-run/SKILL.md` if it restates the
  section. Proof: a dry run over a PR pair built the same way that reports the red gate.
  **Source**: session report yQdSoM, suggestion 3; runs 35837284696 and 35838071472. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: 1 to 2 files.

- [ ] **B72a. Video capture on deploy records only what will be published.** **Problem**:
  `.github/workflows/video-capture-on-deploy.yml` (the `workflow_run` trigger at line 25, the
  "Work out which scene scripts the diff touches" step at line 99) dispatched 14 captures in the
  session, 195 job-minutes over 31 runs, because the batches touched pages that scene scripts
  declare (the practice page, `bundles.html`), and none of those recordings was published:
  publishing is the operator's `npm run video:publish`, run once per release. **Fixed when**: the
  on-deploy path records a scene only when its page changed and `videos/publish.json`'s `videos`
  array has an entry with that scene's `id` (the `videos/<id>.json` basename) and
  `"publish": true`, records each scene at most once a day (read the workflow's own runs of the
  last 24 hours with `gh run list --workflow video-capture-on-deploy.yml` for an artifact
  `video-<id>-*`), and a `main` deploy touching no such page ends the workflow in under a minute
  with "nothing to record"; a dispatch with `head-sha` still records every scene. Proof:
  `npx prettier --check`, a js-yaml parse, `app/unit-tests/videoScenePages.test.js` green, then
  the next `main` deploy of a docs-plus-code batch ending that way. **Source**: session report
  yQdSoM, suggestion 1; BACKLOG 72. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B52g. `ads-report.js`, what the account did.** A read-only script beside
  `infra/google/ads/ads-sync.js` using the credential loader `ads-inventory.js` exports (Secrets
  Manager names in `ads.toml` `[secrets]` (line 32), read with `AWS_PROFILE=submit-prod`; API
  version `[api].version` `v25` (line 40); `googleAds:search` as `ads-inventory.js` line 258 calls
  it) and GAQL over `campaign`, `ad_group` and `keyword_view` with `segments.date` for a date
  range (`--from`, `--to`, default the last 28 days): impressions, clicks, cost, average CPC,
  CTR, conversions, conversion value, per campaign, per ad group and per keyword, as a table on
  stdout and JSON with `--json`. No writes. Unit tests for argument parsing and row shaping in
  `app/unit-tests/scripts/adsReport.test.js`, in the shape of `adsSync.test.js`. Proof: a run
  against customer 8142685080 prints the Performance Max campaign's rows for the range. B52n's
  proof reads this script. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17;
  BACKLOG 52. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B52h. `ads-forecast.js`, what a budget would buy.** A read-only script beside
  `ads-sync.js`, on B52g's credential path, using `KeywordPlanIdeaService`:
  `generateKeywordHistoricalMetrics` for a keyword list (UK, English) giving monthly searches,
  competition and top-of-page bid ranges, and `generateKeywordForecastMetrics` for those keywords
  at a daily budget (`--budget-gbp`) giving expected clicks, impressions, cost and average CPC;
  the keyword list from a file or `--keywords`. Unit tests for parsing and the micros-to-pounds
  shaping beside B52g's. Proof: `--keywords "submit vat return,mtd vat software" --budget-gbp 50`
  prints a forecast. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG
  52. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B30au. The snapshot-publish alarm re-fires on a two-day-old datapoint.**
  `prod-env-operator-snapshot-publish-errors` opened issue #337 (now closed) at 03:16 UTC on
  2026-09-23 on "1 datapoint [2.0 (21/09/26 03:16:00)]" and returned to OK two minutes later; the
  Lambda's `Errors` metric has no datapoint after 2026-09-21 03:00 UTC and the 22 and 23 September
  publishes logged `failedObservations: 0`. The same re-evaluation opened #292 on 2026-09-17 for
  the 15 September errors. Cause: `OperatorSnapshotPublish.java`'s `errorsAlarm` (lines 208 to
  217) builds the alarm on a 24-hour period with one evaluation period, so CloudWatch
  re-evaluates the daily bucket at its edge two days on. Change the period to one hour (the
  nightly runs once at 03:17 UTC, so an hourly `Errors` sum of 1 or more fires within the hour and
  clears the next) and the `alarmDescription` to match; `OperatorSnapshotPublishTest.java`'s
  alarm `objectLike` (lines 101 to 106) asserts the name and metric only, so add `"Period", 3600`.
  **Problem**: one night's errors open a second alarm issue two days later and a triage run reads
  it as a recurring failure. **Fixed when**: the alarm's period is one hour in the synthesised
  template and no issue opens for a day with zero `Errors` datapoints, shown over the seven
  nights after the deploy. Proof: `./mvnw -q test -Dtest=OperatorSnapshotPublishTest`; format
  only the two files (`spotless:apply` reformats others). **Source**: alarm history 2026-09-17 and
  2026-09-23. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B30at. The sweep destroys a slot set a deploy is using.** PR #334's push deploy set
  `/submit/ci/last-known-good-deployment` to `ci-set2` at 18:23 UTC when its stacks succeeded
  (its probes then failed), which made `ci-set1` a non-LKG set older than
  `SELF_DESTRUCT_SWEEP_MIN_AGE_HOURS` (8, `.github/workflows/destroy-ci.yml` line 73);
  `destroy-ci.yml` run 35766864248, started by that deploy's completion, deleted `ci-set1`'s
  stacks at 19:25 while PR #333's deploy 35773445604 had claimed the slot at 19:23 and was
  updating them ("the stack disappeared while we were deploying it", then
  `ERR_NAME_NOT_RESOLVED` on every probe). The sweep's `wait-for-ci-deploys` step (line 682)
  waits only for runs older than itself. In the sweep's selection step (keep list at line 395,
  age check at line 491), before listing a set for destruction, read `/submit/ci/slots/<slot>`
  (the record `.github/actions/claim-ci-slot/` writes; `slot-for-ref.mjs` reads it) and skip a
  set whose claim names a run still `in_progress` or `queued` (`gh run view <id> --json status`),
  logging the skip. **Problem**: a deploy that has claimed a slot can lose its stacks to the sweep
  started by another deploy's completion, and every probe of that run then fails for a reason
  unrelated to the branch. **Fixed when**: a sweep dispatched with `-f sweep-for-stacks=true`
  while a branch deploy holds a slot logs the skip and leaves the set standing, and no deploy in
  the following week fails with "the stack disappeared while we were deploying it". Proof on the
  branch: `npx prettier --check`, a js-yaml parse, and the claim-ci-slot unit tests if the read
  goes through a new `.mjs`. Shares `destroy-ci.yml` with B30ax; land this first, in the same
  agent. **Source**: runs 35766864248 and 35773445604; BACKLOG 30; session report yQdSoM.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B30ax. The sweep runs only when a set is old enough to sweep.** **Problem**:
  `destroy-ci.yml` runs on every `deploy.yml` completion as cover for GitHub dropping the cron's
  slots (the `workflow_run` trigger, lines 43 to 46), and each run assumes two roles, lists two
  regions and Route 53, and usually destroys nothing: 65 runs and 315 job-minutes in the session,
  about 250 of them on runs that deleted no set. **Fixed when**: a final `deploy.yml` job on ci
  runs (after the web-test jobs, `if: always()` on ci, holding the ci role the stack jobs use)
  lists the `-app-SelfDestructStack` stacks and calls `destroy-ci.yml` through its existing
  `workflow_call` inputs (`sweep-for-stacks: true`) only when one is older than
  `SELF_DESTRUCT_SWEEP_MIN_AGE_HOURS` (8) and is not the last-known-good set, and the
  `workflow_run` trigger goes (the `schedule` and `delete` triggers stay); proof is a day of
  deploys in which every `destroy-ci` run deletes at least one set, and a set past its age still
  gone within an hour of the next deploy. Shares `destroy-ci.yml` with B30at (land B30at first,
  same agent) and `deploy.yml` with B30ay. **Source**: session report yQdSoM, suggestion 2.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B52e. Donations on the revenue panel: the charges before 22 September.**
  `infra/stripe/stripe.toml` (lines 53 to 58) writes `payment_intent_data.metadata.bundleId` onto
  the spreadsheets site's donation Payment Links, and `v_revenue_daily` groups by
  `coalesce(bundle_id, 'unknown')`. Live data (query of 2026-09-23 over `prod_env_analytics`):
  2026-09-22 shows `donation-10` with 2 charges, so new donations now group; every earlier day in
  September is `unknown` (£45, £20, £10 and £0.99 charges), because Stripe copies the metadata to
  the charge as a snapshot at creation. Read those charges from Stripe live, read-only (the key
  lookup `infra/stripe/stripe-sync.js` uses): for each, whether it came from a Payment Link
  (`payment_link` on its Checkout Session) or from a submit checkout (the £0.99 charges look like
  day passes, which would mean submit's own checkout charges also lack a `bundleId`), then fix the
  layer that loses it: the revenue ingestion (`scripts/finance/stripe-stage.js` or the ingestion
  Lambda) resolving the bundle from the Payment Link or the Checkout Session when the charge has
  none, or the submit checkout writing `bundleId` onto its PaymentIntent. PayPal donations join
  through F1b once OF1 lands. Proof: the view queried again shows no `unknown` row whose source is
  known. **Source**: BACKLOG 66; `PLAN_ONE_STOP_DASHBOARD.md` D2. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **F2a. Stripe charges and payouts into diya-gl lines.** `mcp/lib/finance/stripe-lines.js`
  over F1c's staged files (`/Users/antony/projects/diy-accounting-limited/staging/2025-2026/stripe/`
  for March and `…/staging/2026-2027/stripe/` for April to August, one
  `<yyyy-mm-dd>-stripe-balance-transactions.json` (a JSON array of raw Stripe balance
  transactions) and one `-stripe-payouts.json` per month): a charge as a `sales` `receipt` line
  plus a `purchases` fee line, gross income and fees never netted, a payout as a `bank` line that
  must match the bank BAC line; lines validated with `validateLines` from the diya-gl package's
  `diya-gl-schema.js`, on the pattern of `mcp/lib/finance/bank-lines.js` and its
  `mcp/test/bank-lines.test.js` (a unit test over a recorded sample, figures redacted to round
  numbers). The mapping is the table in `../PLAN_FINANCE_AUTOMATION.md` "Target format" (line
  170); `../REPORT_FINANCE_SOURCES_2025-26.md` found that `Creditcardaccount.xlsx` holds the
  Stripe payout totals. `npm ci` in `mcp/` in a fresh worktree. F2d reads this output.
  **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~2 files.

- [ ] **B85. The removal block overrides an agent worktree's lock.** **Problem**: `git worktree
  remove --force` refuses a worktree an agent locked ("cannot remove a locked working tree"), so
  the operator's pasted block stops part-way and the rest of it, the branch deletions included,
  never runs; 5 of the session's 15 removal pastes failed this way. **Fixed when**: every place
  that tells a session how to write the block says to use `git worktree remove --force --force`
  for each `agent-*` worktree and to chain the lines with `;` so one failure does not stop the
  rest: `.claude/skills/board/SKILL.md` (line 180 onward), `.claude/skills/do-next/SKILL.md`
  (line 225) and `.claude/skills/clean/SKILL.md` (line 100, which writes a single `--force`); and
  a pasted block removes every listed worktree and branch in one run. **Source**: session report
  yQdSoM, suggestion 9. **Owner**: Claude Code. **Model**: Haiku. **Size**: 3 files.

- [ ] **B52f3. The gateway's web vitals on the observability dashboard.** `ObservabilityStack.java`
  graphs submit's LCP, CLS and INP (lines 351, 359, 600) and, in row 1b (line 632), the
  spreadsheets site's through the us-east-1 OAM sink (account `064390746177`, monitor
  `spreadsheets-web` / `ci-spreadsheets-web`). Add row 1c on the same pattern for the gateway:
  account `283165661847`, monitor `gateway-web` in prod and `ci-gateway-web` in ci (the names
  B52f1 creates); empty until B52f1's link lands, as row 1b's comment says of its own. Proof:
  the stack's Java test class asserting the three metric names for the gateway monitor, and the
  batch's `./mvnw clean verify`. **Source**: BACKLOG 62; `PLAN_ONE_STOP_DASHBOARD.md` D3.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B52f2. GA4 cross-domain linking on the spreadsheets site** (repository
  `../spreadsheets.diyaccounting.co.uk`, its own branch and PR). Submit's
  `web/public/lib/analytics.js` configures `gtag("config", …, { linker: { domains:
  GA4_LINKER_DOMAINS } })` (lines 27 and 87) over the three hosts;
  `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js`
  has no linker. Add the same list and config there, with a case in that repository's analytics
  browser test. The key events are already code (`infra/google/ga4/analytics.toml` line 30).
  **Source**: BACKLOG 62; `PLAN_ONE_STOP_DASHBOARD.md` D3. **Owner**: Claude Code. **Model**:
  Haiku. **Size**: ~2 files.

- [ ] **B52k. Bidding strategy as code, every one the API offers.** `infra/google/ads/ads.toml`'s
  `[[campaign]]` gains a `[campaign.bidding]` table mapped one to one onto the Google Ads API's
  campaign bidding fields, so any strategy the API accepts is declarable: `manual_cpc`
  (`enhanced_cpc`), `maximize_clicks` (`target_spend` with optional `cpc_bid_ceiling_gbp`),
  `maximize_conversions` (optional `target_cpa_gbp`), `maximize_conversion_value` (optional
  `target_roas`), `target_cpa`, `target_roas`, `target_impression_share` (`location`,
  `fraction`, `cpc_bid_ceiling_gbp`), and a portfolio strategy by `bidding_strategy` resource
  name. `ads-sync.js` plans and applies it through `campaigns:mutate` with the field mask for the
  strategy chosen, refusing a strategy the campaign's channel type cannot take (Performance Max
  accepts only the two maximise-conversion forms) with the reason in the plan. Money fields in
  pounds in the toml, micros on the wire. Unit tests for the mapping and the refusals in
  `app/unit-tests/scripts/adsSync.test.js`'s shape; the header comment (lines 14 to 16) updated
  (it says the script never creates a conversion action or a campaign; B52n changes the second).
  Shares `ads-sync.js`, `ads.toml` and `adsSync.test.js` with B52n: one agent, this row first.
  **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B52n. A Search campaign as code.** `ads-sync.js` refuses to create a campaign today (its
  header, lines 14 to 16: a declared campaign the account lacks fails the run), because the one
  campaign is Performance Max, whose asset groups need uploaded images and headlines the toml does
  not carry. A Search campaign needs none of that: extend `ads.toml` with a `[[campaign]]` of
  `type = "SEARCH"` carrying `[[campaign.ad_group]]` (name, keywords with match type, and one
  responsive search ad's headlines, descriptions and final URL, the submit home page), and let
  `ads-sync.js` create and update campaign, budget, ad groups, keywords and the ad through their
  `mutate` calls, paused by default so a merge never spends until `status = "ENABLED"` is
  declared. Performance Max stays read-and-adjust only. Lands on B52k in the same agent. Proof: a
  plan run shows the creation, an apply on a paused campaign leaves £0 spent, and B52g's report
  lists it. **Source**: operator 2026-09-22; `PLAN_ONE_STOP_DASHBOARD.md` D17; BACKLOG 52.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B52d. The visitors panel.** `app/functions/analytics/operatorSnapshotPublish.js` already
  reads `v_visitors_by_kind_daily` into the snapshot as three observations, `sessions-human`
  (line 173), `sessions-bot` (line 185) and `sessions-synthetic` (line 195);
  `web/public/operator/dashboard.html` shows nothing from them. Add a visitors panel (human, bot,
  synthetic per day, the last 30 days) in the shape the page's other panels use, reading those
  observations, with a case in the page's unit test. Proof: the panel renders from a snapshot
  fixture carrying the three kinds. **Source**: BACKLOG 67; `PLAN_ONE_STOP_DASHBOARD.md` D4.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B52f1. The gateway's RUM monitor and GA4 linker** (repository `../www.diyaccounting.co.uk`,
  its own branch and PR). `GatewayStack.java` has no RUM (its CSP comments, lines 81 and 168).
  Add, on `../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/stacks/SpreadsheetsStack.java`'s
  pattern (identity pool and guest role from line 405, `CfnAppMonitor` at line 429 with
  telemetries `performance`, `errors`, `http`, which carry LCP, CLS and INP, the
  `lib/rum-config.js` deployment at line 444, the OAM `CfnLink` to submit's us-east-1 sink at line
  464): a monitor named `gateway-web` (prod) or `ci-gateway-web` in us-east-1, the CSP opened to
  the RUM and Cognito identity endpoints, the RUM loader on the pages, and the GA4 linker in
  `../www.diyaccounting.co.uk/web/www.diyaccounting.co.uk/public/lib/analytics.js` as in B52f2.
  Proof: that repository's `./mvnw clean verify` and its browser tests. B52f3 reads this monitor.
  **Source**: BACKLOG 62; `PLAN_ONE_STOP_DASHBOARD.md` D3. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: ~4 files.

- [ ] **AS18. One assistant guide, aligned with CLAUDE.md.** Junie is no longer used: delete
  `.junie/guidelines.md` and `_developers/Junie.md`, and the "Other AI assistants" lines in
  `CLAUDE.md` (line 58) that name them. Then read `.github/copilot-instructions.md` against
  `CLAUDE.md` and the tree, and correct every statement in it that CLAUDE.md or the code
  contradicts (the assessment found the Multi-Site section of CLAUDE.md false and expects more).
  Shares `CLAUDE.md` with B83 (its Quick Reference). Proof: every backticked path in both files
  exists in a fresh clone. **Source**: the AI-readiness assessment of 2026-09-18
  (`.assess/assess-report.md` on the `bjcoombs` fork at 45bcc054), opportunity list; operator
  2026-09-22. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~4 files.

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
  (areas, capabilities, file outlines; grep the heading to find the implementation); shares
  `CLAUDE.md` with AS18. Rebuilt by the same method when the operator asks. **Source**: operator
  2026-09-22. **Owner**: Claude Code. **Model**: Haiku for the walk, Sonnet for the report.
  **Size**: ~2 files plus the batch outputs.

## Machine-ask

## Human-driven

- [ ] **OICO. Update the ICO registration.** With the "Practice licence: client data" section of
  `_developers/ICO_CHECKLIST.md` (line 68; registration ZB070902, whose scope row at line 83 is
  `Pending`), sign in to the ICO's registration portal and update DIY Accounting Limited's entry
  to cover the practice licence's client data; note the date in that row. PU-7n waits on this
  alone. **Source**: operator 2026-09-22. **Owner**: Operator. **Model**: none. **Size**: 0 files.

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

- [ ] **F1b. PayPal's six months staged.** Run `scripts/finance/paypal-stage.js` (the credential
  read from Secrets Manager `prod/submit/paypal/client_id` and `prod/submit/paypal/client_secret`
  with `AWS_PROFILE=submit-prod`) for each month from March to August 2026, writing
  `../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json`. F2g reads the output.
  Blocked on OF1. **Source**: `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 0 files.

- [ ] **F2g. PayPal transactions into diya-gl lines.** `mcp/lib/finance/paypal-lines.js` over
  F1b's staged files, on F2a's pattern: settled transactions only, holds and their reversals
  excluded (the March 2026 holds case as a test), a receipt as `sales`, a bill payment as
  `purchases` matched to the mailbox invoice, posted to the PayPal wallet's cash account
  (`Cashaccount.xlsx` is that ledger, per `../REPORT_FINANCE_SOURCES_2025-26.md`) so the bank
  sees only the withdrawals; validated with `validateLines`; a unit test over a recorded page.
  Blocked on F1b. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B11.T10. ITSA phase 2: the testing evidence inside the window.** Within the 14 days before
  the day O11 names, re-run `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the
  command in `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` "The command", lines 66 to 80, output
  under `../itsa-sandbox/<tax-year>/`) and update the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28, today
  "2026-09-21 (`5f2ff46a`)") with the run dates and commit. Blocked on O11's day. **Source**:
  BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code. **Model**: Haiku. **Size**:
  ~1 file.

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
  `scripts/analytics-pull.sh`, one CSV per view in `app/functions/analytics/rawExportPublish.js`'s
  `VIEW_NAMES` (line 21)): per-block correlations, the block models fitted (linear cost from
  `v_cost_daily`, log-linear funnels from `v_login_to_submission_funnel` and `v_ga4_funnel_daily`,
  Hill curves for spend), levers ranked by effect per unit cost, and the next experiment proposed
  with its predicted effect and interval as a row ready for `experiments.toml`; Bayesian
  optimisation for the continuous knobs and a Thompson-sampling bandit for allocations once
  experiments exist. The model design as a section under `PLAN_ONE_STOP_DASHBOARD.md` D16 first,
  then the notebook, then one line per objective on `web/public/operator/dashboard.html`. Blocked
  until three months of nightly export exist under `exports/prod/`: first written 2026-09-08, so
  the gate is 2026-12-09, checked with `aws --profile submit-prod s3 ls
  s3://prod-env-analytics-lake-<account>/exports/prod/`. **Source**: BACKLOG 52l;
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

- [ ] **F2d. DIYA's book, assembled and verified.** The lines from F2a (Stripe), F2g (PayPal),
  `mcp/lib/finance/bank-lines.js` over F1d's statements and `mcp/lib/finance/mail-invoices.js`,
  plus `mcp/lib/finance/book-from-workbook.js`'s `book.toml` for 1 March to 31 August 2026,
  validated with `validateBook` and `validateLines` from the diya-gl package, written under
  `../staging/2026-2027/book/` (private); March 2026 matched line for line against the completed
  2025-26 workbook (the control), every month's bank closing balance equal to the statement's,
  gross income and fees separate, no hold posted, each check a line in
  `../staging/2026-2027/book/VERIFICATION.md`. Blocked on F1d, F2a and F2g.
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
  block (line 208: `enable = "on-pass"`, `hidden = true`, `allocation = "on-pass-on-subscription"`,
  one monthly price of 999) flips to `enable = "always"`, `hidden = false`,
  `allocation = "on-subscription"` with the two prices on its prices table, then
  `stripe-catalogue-sync` test and live for the price ids into `.env.ci` and `.env.prod`
  (machine-ask for the live run); a practice page nav link is added to
  `web/public/widgets/page-chrome.js` (it has none today); the four ci probes that reach
  `resident-pro` through a pass are updated in the same change; the DIYA-GL page
  (`../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/index.html`, whose tier list at
  line 73 shows `resident` at £39 a year alone) gains a `resident-pro` line at £199 a year, in
  that repository's own PR. Blocked on OICO (the register must cover the client data before the
  tier is sold). **Source**: `PLAN_PRICE_UPDATE.md` §(d); operator 2026-09-22. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~9 files.

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

