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

**Prod runs deployment prod-78e3e55** (PR #322's merge; its deploy run is destroying the previous
set). **ci**: `ci-set1` is last-known-good. No open pull request.

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

## Machine-only

- [ ] **B49.24. `PLAN_EVERYTHING_AS_CODE.md`'s Google Ads section reads the current access route.**
  Its "Google Ads, concretely" section (the paragraph beginning "Access needs three things") and the
  Google Ads line of its provider table (line 370), work item 16's "authenticate with the developer
  token and the manager's refresh token" (line 624) and the "Google Ads residue" paragraph under
  "What stays manual" (line 713) still describe the developer token, the manager account and
  `login-customer-id`, a route Google replaced on 2026-09-09 with an access level on the Cloud
  project that issued the OAuth credentials. Rewrite all four places to what
  `infra/google/ads/ads.toml`'s header comment, `ads-inventory.js` and `ads-sync.js` do: one client
  customer id (`8142685080`, `[account]`), the Cloud project `diyaccounting-ga4` (`[project]`) whose
  "Google Ads API Overview" page grants the access level, the refresh token from
  `prod/submit/google/ads/refresh_token`, no developer token, no manager link. The residue paragraph
  keeps the payments profile and the first OAuth consent. Docs only; may go straight to `main`. **Source**: BACKLOG 49b; `PLAN_EVERYTHING_AS_CODE.md` items 16 and 17.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B43a. The scheduled prod deploy skips a head that is already live.** `deploy.yml`'s
  `11 4 * * *` schedule on `main` creates a full prod set, deploys it and destroys the previous one
  even when the head only changed `.md` files (prod-a15fe51 from a15fe519 on 2026-09-21). In the
  `names` job (line 306), which already reads `/submit/prod/last-known-good-deployment` with AWS
  credentials (line 343), on `github.event_name == 'schedule'`: the prod name is
  `prod-${GITHUB_SHA::7}` (`.github/actions/get-names/action.yml` line 96), so the live head is
  the name's suffix; set an output `live-head-is-current` when `git merge-base --is-ancestor` puts
  HEAD at that short sha or when `git diff --name-only <live head>..HEAD` matches none of the
  `push:` `paths:` list (line 104). `skip-deploy-check` (line 632) reads that output beside
  `needs.params.outputs.skipDeploy`, so the ~10 `needs: skip-deploy-check` stack jobs need no
  change. B43b adds a second input to the same check; land them in one PR or the second rebases.
  Proof: the first `11 4 * * *` run after merge on an unchanged head ends at the check with no
  stack job, quoted in the PR.
  **Source**: BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **PU-6. Practice licence design.** Clients under one sign-in, per-client book sets, agent
  authorisation, batch through the MCP server and the CLI: `PLAN_PRICE_UPDATE.md` §(d) expanded into
  a design and a build task list for PU-7. **Source**: `PLAN_PRICE_UPDATE.md` PU-6. **Owner**: Claude
  Code. **Model**: Opus. **Size**: ~1 file.


- [ ] **IT-1. `iterate` runs the batch proofs one after the other.** `npm test` and `./mvnw clean
  verify` ran concurrently on the b69 batch on 2026-09-21 and five vitest files hit the 5,000 ms
  timeout at load average 107, costing ~25 minutes and a re-run. `.claude/skills/iterate/SKILL.md`'s
  "Once per batch before its first push" bullet (lines 89 to 91) says "in the background, both";
  make it say serially, `./mvnw clean verify` first, then `npm test`. Same file as IT-2; one agent
  takes both. **Source**:
  `REPORT_SESSION_uOKRjk_2026-09-22.md` suggestion 4. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~1 file.

- [ ] **B30ap. The suites' artifact upload never reddens a passing run.** Two of `test.yml`'s
  "Upload artifacts" steps (`actions/upload-artifact`; 44 uses across the workflows) failed with
  `FinalizeArtifact: (403) Forbidden` on 2026-09-21 after both suites had passed, reddening run
  35655350071 and costing a rerun and an operator paste. Give every behaviour-suite upload step
  `continue-on-error: true`, or wrap it in a retry step, so a passed suite stays green when
  GitHub's artifact service does not. The 22 steps in `test.yml` are the `Upload artifacts` steps
  with `if: ${{ !cancelled() }}` at lines 635 to 1355; `probe-test.yml` has two more. **Source**:
  `REPORT_SESSION_uOKRjk_2026-09-22.md` suggestion 6. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~1 file.

- [ ] **B58a. `security-review.yml`'s assign job assigns the Copilot agent.** Run 35598208062
  (the Monday schedule, 2026-09-21) created issue #318 and its `assign-copilot` job printed
  "Assigned issue #318 to copilot-swe-agent", yet the issue has no assignee and its timeline
  carries only the four label events, no `assigned` event: the `replaceActorsForAssignable`
  mutation on the agent App token returns without error and assigns nothing (the job's own
  comment at line 208 called the App route unproven). While #318 stays open the first job's
  `skip_if_open_security_issues` check creates nothing on later Mondays, so the review is paused
  behind it; #318 stays open by the operator's decision until the assignment works. In the job:
  read the mutation's returned `assignees` and fail the job when the login is absent; print
  `suggestedActors` so the log shows whether the App sees `copilot-swe-agent` at all; if the App
  cannot assign it, use the workflow's `GITHUB_TOKEN` (`issues: write`) for that one mutation, or
  say which token can. Add a `workflow_dispatch` input `issue_number` that runs only the assign
  job against an existing issue. Proof: a dispatch naming 318 leaves #318 assigned to
  `copilot-swe-agent`, the `assigned` event on its timeline. **Source**: issue #318; BACKLOG 58.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B52.D3. The spreadsheets site's web-vitals alarms.** The spreadsheets account's
  `AWS::Oam::Link` is attached to both sinks (label `spreadsheets` on
  `arn:aws:oam:us-east-1:972912397388:sink/8f40e076-e9ab-445b-8fc2-68557456b63d` and on
  `arn:aws:oam:us-east-1:367191799875:sink/95055e90-9811-47c0-98db-171adcfbec90`, checked
  2026-09-21), so the three p75 alarms (LCP 4000ms, INP 500ms, CLS 0.25) go in
  `ObservabilityUE1Stack.java` beside the sink (line 338), in the shape of the submit RUM alarms in
  the same stack, on the linked account's `AWS/RUM` metrics with the spreadsheets app monitor's
  name as the dimension (`aws --profile spreadsheets rum list-app-monitors --region us-east-1`),
  with a case in the stack's test. Proof: `./mvnw clean verify` and, after
  `deploy-environment.yml`, the three alarms in `OK` or `INSUFFICIENT_DATA` on prod. **Source**:
  BACKLOG 62; `PLAN_ONE_STOP_DASHBOARD.md` D3. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~2 files.

- [ ] **B69a. `finalMessageOnly` cuts at the first heading.** `scripts/redact-triage-output.mjs`'s
  `finalMessageOnly` drops leaked reasoning only when a `---` thematic break precedes the answer;
  support-triage's comment on issue #100 kept one sentence of reasoning above its first `## `
  heading. When no break is present and the text carries a `## ` heading after some prose, cut to
  the first heading; text with neither passes through as today. The function is
  `finalMessageOnly` at lines 89 to 93 (`text.split(/\n+-{3,}\n+/)`), with its rationale comment
  above it to extend. Cases in `app/unit-tests/scripts/redactTriageOutput.test.js`. **Source**: BACKLOG 69. **Owner**: Claude
  Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **PU-15. `PLAN_PRICE_UPDATE.md` carries the review's corrections.** Three edits from
  `REPORT_PRICE_UPDATE_REVIEW.md` §2: (7) a cost-per-session ceiling in "Why" and in
  `PLAN_ONE_STOP_DASHBOARD.md` D17: at 0.28% session-to-purchase and £127 lifetime contribution
  (annual, 30% churn) the breakeven cost per session is £0.36, and a £2 click costs £714 per
  subscriber; (9) PU-8 points at
  `../spreadsheets.diyaccounting.co.uk/_developers/archive/PLAN_DIYA_GL_HOME.md` DG-6 and DG-2b
  instead of duplicating them,
  and PU-4 leaves PU-5's precursors, since the tier lifts without the sandbox change; (10) assertion
  2's fee share on £39 reads 2.0% (0.785/39), not 2.3%. Docs only; may go straight to `main`.
  **Source**: `REPORT_PRICE_UPDATE_REVIEW.md` §2 rows 7, 9, 10; operator 2026-09-21. **Owner**:
  Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **PU-12. `v_subscription_renewals_daily` counts the real renewal path.** The view has 0
  rows though a renewal happened on 2026-09-06 (`subscription-renewed`, subscription e74e1d41): its
  `current_period_end` comparison misses the webhook's path. The SQL is
  `infra/main/resources/analytics/views/v_subscription_renewals_daily.sql` (`BusinessViews.java`
  only lists the view; `rawExportPublish.js`'s `VIEW_NAMES` is kept in step by hand): it reads
  `dynamo_subscriptions`, the DynamoDB-stream projection in
  `app/functions/analytics/dynamoStreamToFirehose.js` `projectSubscription` (`current_period_end`
  from the image's `currentPeriodEnd`, `change_type` from the stream event name), and counts a
  `MODIFY` whose `current_period_end` moved past the previous row's. The webhook's `invoice.paid`
  handler (`billingWebhookPost.js` lines 199 to 221) writes `currentPeriodEnd` through
  `updateSubscription`, and writes `null` when the Stripe retrieve fails. First query subscription
  `e74e1d41`'s rows in Athena (database `prod_env_analytics`, workgroup `prod-env-analytics`,
  read-only) to see which: a null period end, an unchanged one, or no MODIFY row. Then fix the
  writer or the view, and test in `BusinessViewsTest.java` or `billingWebhookPost.test.js` as the
  cause dictates. Proof: the export for 2026-09-06 shows that renewal. Shares the tables and the
  Athena names with PU-10, PU-11 and PU-13. **Source**: `REPORT_PRICE_UPDATE_REVIEW.md`
  §2 row 4(c); operator 2026-09-21. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **IT-2. Analysis agents start from the board's current commit.** The price-review agent
  branched from 95fe276c and reported the PU rows missing from `NEXT.md` after ee02df17 had added
  them. The brief shape in `.claude/skills/iterate/SKILL.md` (the worktree sentence at line 66)
  and `do-next/SKILL.md` (line 83) gains one line: a worktree for an analysis or review agent is
  created from `origin/main` after a fetch, and the brief names that commit. Same file as IT-1;
  one agent takes both. **Source**: `REPORT_SESSION_uOKRjk_2026-09-22.md` suggestion 7.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B11.T7c. Sandbox transcripts live outside the worktree.** `scripts/itsa-sandbox-year.js`
  defaults `ITSA_SANDBOX_OUT_DIR` to `./target/itsa-sandbox-year` (lines 534 and 1149), so the three
  2026-09-21 runs' transcripts went with the worktree that held them and B11.T7b.7 ran all three
  years again (~11 minutes, ~100k tokens). Default to a path under the workspace root beside
  `../analytics/` (`../itsa-sandbox/<tax-year>/`), say so in `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`
  (the default is named at lines 78 to 79, 129 and 148, and the script's own header at line 50),
  and keep the checkpoint file (`checkpoint-id.txt`) there too so a re-run restores it. B11.T10
  re-runs this script; its brief names the same doc. **Source**:
  `REPORT_SESSION_uOKRjk_2026-09-22.md` suggestion 5. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~2 files.

- [ ] **B43b. A `package.json` scripts-only edit does not deploy.** `package.json` is in
  `deploy.yml`'s `push:` `paths:`, so #319's one new npm script deployed a ci set (142 job-minutes,
  a 4-hour set). A `paths:` filter cannot see inside the file; add a first job that diffs
  `package.json` against the previous head and sets an output when anything but `scripts` changed
  (dependencies, engines, `bundle` inputs), and gate the stack jobs on it through
  `skip-deploy-check` (line 632), the job B43a also extends; scheduled and dispatched runs
  unaffected. Land with B43a in one PR or rebase on it. **Source**:
  `REPORT_SESSION_uOKRjk_2026-09-22.md` suggestion 3; BACKLOG 43. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: ~2 files.

- [ ] **B30af.7. Every behaviour suite's Cognito callback host is in `IdentityStack`'s list.**
  a7e22a95 dropped the spreadsheets hosts from the DIYA-GL client while `diyaGlSubscription` still
  built its callback on `ci-spreadsheets…/diya-gl/ltd.html`, and the deploy learned it from a
  `redirect_mismatch` probe (155 job-minutes). The suites' hosts come from the workflows, not
  from code: `probe-test.yml` lines 530 and 578 set `DIYA_GL_BASE_URL` to `https://ci.diya-gl.co.uk/`
  or `https://diya-gl.co.uk/`, and `diyaGlSubscription.behaviour.test.js` line 67 appends
  `ltd.html`; the Submit suites sign in on the deployment's own base URL, whose callback
  `buildCallbackUrls` (`IdentityStack.java` line 463) derives from `publicDomainName` and
  `envDomainName`. A JS test cannot read a CDK synth, so the test is a case in
  `IdentityStackTest.java`: read `probe-test.yml` with a regex for the two `DIYA_GL_BASE_URL`
  hosts and assert each host plus `ltd.html` is in the books client's `CallbackURLs` for ci and
  for prod, beside the existing books-client cases (lines 110 to 170). B30af.5 P3 adds slot hosts
  to the same lists; whichever lands second extends the case. **Source**: `REPORT_SESSION_uOKRjk_2026-09-22.md`
  suggestion 2; the design, P3. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **PU-10. Every Stripe charge carries its `bundle_id`.** `stripe_charges.bundle_id` is null on
  every charge, so `v_revenue_daily` reports every product as `unknown` and mixes £165 of
  spreadsheets donations with £3.96 of subscriptions (export 2026-09-20). The checkout is
  `mode: "subscription"` (`app/functions/billing/billingCheckoutPost.js` line 119), where Stripe
  refuses `payment_intent_data`, and it already sets `subscription_data.metadata.bundleId` (line
  123), so `stripe_subscriptions.bundle_id` is populated while the invoice's charge carries no
  metadata. `sanitizeCharge` (`app/functions/analytics/stripeReconcile.js` line 116) keeps
  `invoice` and reads `charge.metadata.bundleId`, which only the donation payment links set
  (B52.D2). Resolve a subscription charge's bundle through its invoice's subscription: expand
  `data.invoice` on the charge list (or retrieve the invoice), take `invoice.subscription`, and
  look it up in the subscriptions already fetched in the same run, falling back to the charge
  metadata. `StripeReconciliationTables.java` keeps the column. Unit test in
  `app/unit-tests/analytics/` for both paths. Proof: the next export's `v_revenue_daily` names each
  product. Shares the tables and the Athena names with PU-11, PU-12 and PU-13. **Source**: `REPORT_PRICE_UPDATE_REVIEW.md` §2 row 4(a);
  operator 2026-09-21. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-11. `v_subscription_cancellations_daily` leaves the probes out.** The view counts 312
  cancelled `resident-vat` subscriptions in 24 days from the probe lanes (`dynamo_subscriptions`
  carries no actor, though its projection in `dynamoStreamToFirehose.js` `projectSubscription`
  carries `hashed_sub`), so churn, the metric annual billing is meant to move, is unreadable. Give
  the subscription record an actor at write (`app/functions/billing/billingWebhookPost.js`, the
  webhook derives `actor` from its `test` flag today, line 226) and project it, or filter the view
  on the synthetic users' hashed subs; the SQL is
  `infra/main/resources/analytics/views/v_subscription_cancellations_daily.sql`, listed in
  `BusinessViews.java` and tested in `BusinessViewsTest.java`. PU-13 settles how an actor is
  derived; take its rule. Proof: the view's next export shows the human count only. **Source**:
  `REPORT_PRICE_UPDATE_REVIEW.md` §2 row 4(b); operator 2026-09-21. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: ~3 files.

- [ ] **PU-4. The 35-day sandbox.** Put-route expiry in `app/functions/diyaGl/diyaGlPut.js`
  (`SANDBOX_RETENTION_MS`, 24 hours, line 137, applied at line 176), the `expire-sandbox` lifecycle
  rule in `DataStack.java` (lines 928 to 932, tag `retention=sandbox`, 2 days, noncurrent 1 day)
  and the `sandbox_expired_seen` event contract, which the spreadsheets repository's
  `web/unit-tests/diya-gl-events.test.js` pins; `app/unit-tests/functions/diyaGlPut.test.js` and
  `DataStackTest.java`. Per `PLAN_PRICE_UPDATE.md` §(e). **Source**: `PLAN_PRICE_UPDATE.md`
  PU-4. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **PU-13. Actor tagging tells customers from probes on every event.** `checkout-session-created`
  is written as `test-user` for real customers (all three September checkouts, the two paying ones
  included), and the probe lanes 4b100a90 and 35a4fc02 carry `login` as `test-user` but
  `bundle-granted`, `vat-return-submitted` (11 of September's 13) and `hmrc-token-exchanged` as
  `customer`, so every customer-actor view (`v_active_users_daily`, `v_login_to_submission_funnel`,
  `v_submissions_daily`, `v_purchase_reconciliation_daily`) counts probes and conversion-to-submission
  reads 4 submitters where 2 are human. `app/lib/activityAlert.js`'s `resolveActorClass` (line 101)
  derives the class from the `test_` request id prefix alone, which only the browser session sets
  (`SYNTHETIC_SESSION_STORAGE_VALUE`, `submit.bundle.js`); the same file's `classifyActor` (line
  161) already reads `@test.diyaccounting.co.uk` as `test-user`, and the request context carries
  `userSub` (line 52). Derive the class inside `resolveActorClass` from the signed-in user, so its
  15 callers (`app/functions/hmrc/*`, `bundleGet.js`, the two Companies House accounts handlers)
  change nothing: the user's email where the authorizer claims carry it, else the hashed sub against
  the synthetic lane users (`synthetic-<lane>@test.diyaccounting.co.uk`); the billing webhook
  (`billingWebhookPost.js` line 226) sets `actor` from its `test` flag and takes the same rule from
  the subscription record's `hashedSub`. Unit tests in `app/unit-tests/lib/activityAlert.test.js`
  per event class. PU-11 takes the rule for the subscription record. Proof: an Athena count of September's
  `vat-return-submitted` by actor reads 2 `customer`. **Source**: `REPORT_PRICE_UPDATE_REVIEW.md` §2
  row 5; operator 2026-09-21. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **B46b. The seven open CodeQL alerts, and no bearer token in a committed test report.**
  Three fixes and one dismissal on GitHub's code-scanning list: #60 (critical) `app/lib/hmrcValidation.js:125`
  slices a tax-year request parameter Express may deliver as an array; the function already calls
  `isValidTaxYear` at line 122, which returns false for a non-string (line 94), so the throw at
  line 123 fires first and CodeQL's flow analysis cannot see it. Add an inline
  `typeof taxYear !== "string"` throw before the slice so the alert closes on the next scan. #62 to #65 (high)
  `app/functions/infra/selfDestruct.js:318, 326, 344, 353` `console.log` a stack name derived from
  `process.env`; route those four lines through the structured logger, or dismiss each as a false
  positive naming the value as a CloudFormation stack name. #66 (medium) `mcp/lib/itsa-tools.js:152`
  assigns `node[part]` along a dotted path without refusing `__proto__`, `constructor` and
  `prototype`; refuse them. #68 (high warning) `infra/google/gcp/gcp-billing-assert.js:432` tests a
  service-name list with `includes("compute.googleapis.com")`, which CodeQL reads as a URL host
  check; dismiss as a false positive with that reason (`gh api -X PATCH
  repos/diy-accounting-uk/submit.diyaccounting.co.uk/code-scanning/alerts/68 -f state=dismissed
  -f dismissed_reason=false_positive`, approved by the operator on 2026-09-21). The 13 generic
  secret alerts were closed by the operator the same day; eleven pointed at earlier revisions of
  `web/public/tests/test-report-web-test-local.json`, whose `Authorization` values are
  `***MASKED***` today. So that it stays so: a unit test under `app/unit-tests/` that reads every
  tracked `web/public/tests/**/*.json` and fails on an `Authorization` value that is not the mask.
  Proof: `npm test` green, the code-scanning list shows 0 open, and the test fails when a bearer
  value is planted in a report. **Source**: BACKLOG 46; the repository's code-scanning and
  secret-scanning pages. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **PU-1. The `resident` bundle.** Catalogue entry in `web/public/submit.catalogue.toml` with
  the activity lists, the three folded bundles (`resident-itsa` line 137, `resident-ltd` line 159,
  `resident-diya-gl` line 181; `resident-vat` at line 113 stays open per assertion 1) set
  `hidden = true`, `app/services/diyaGlEntitlement.js`'s `DEFAULT_DIYA_GL_BUNDLE_ID` (line 16) and
  its bundle list, its tests, `PASSES.md`. PU-2 adds the `prices` table to the same catalogue
  entries. Per
  `PLAN_PRICE_UPDATE.md` §(a). **Source**: `PLAN_PRICE_UPDATE.md` PU-1. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~5 files.

- [ ] **B46a. Lint `infra/google/`.** `eslint.config.js`'s global `ignores` (line 147) carries
  `scripts/` and `infra/google/`, so the 11 scripts under `infra/google/` carry findings nothing lints:
  `npx eslint infra/google --no-ignore` reports 33 problems in 6 files, 16 of them
  `prettier/prettier` (`--fix` clears them) and 17 sonarjs and security rules
  (`duplicates-in-character-class` 4, `no-os-command-from-path` 3, `super-linear-regex` 2,
  `no-nested-conditional` 2, `no-nested-template-literals` 2, `detect-possible-timing-attacks` 1,
  dead store and unused variable 3). Remove `infra/google/` from the ignore list, fix each finding
  or suppress it on its line with the reason, and leave `scripts/` as it is. B49.24 edits only
  `PLAN_EVERYTHING_AS_CODE.md`; no file overlap. Proof: `npm run linting` clean and `npm test`
  green. **Source**: BACKLOG 46. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~9 files.

- [ ] **B30af.5. Branch deploys leave the ci apex: P3 to P5.** P1 (the slot pool) is on `main`: a
  ci branch deploy claims `ci-set1` to `ci-set4` through SSM in `deploy.yml`'s `names` job. What is
  left, per `_developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md`: **P3**, `IdentityStack.java`'s
  `buildCallbackUrls`/`buildLogoutUrls` add every slot host for non-prod (`https://ci-set<N>…/` and
  `/auth/loginWithCognitoCallback.html`; `/` and `/auth/signed-out.html`), with an
  `IdentityStackTest.java` case asserting the submit client's `CallbackURLs`/`LogoutURLs` the way
  the diya-gl cases do (lines 110 to 170), deployed by `deploy-environment.yml`; the builders are
  at `IdentityStack.java` lines 463 and 474 and read `publicDomainName`/`envDomainName` today.
  B30af.7 adds a case to the same test class. **P4**, `SubmitSharedNames.java` sets
  non-prod `publicDomainName = deploymentDomainName`, and `deploy.yml`'s `DIY_SUBMIT_APEX_URL` and
  `verify-api`'s `APEX_URL` take `needs.names.outputs.public-url` (`deploy.yml` lines 1755 and
  1957; `SubmitSharedNames.java` sets `publicDomainName` at lines 1181 to 1183). **P5**,
  `set-origins` (line 1790) and `rollback-origins` (line 2983) gate to prod, a new
  `.github/workflows/promote-ci-apex.yml` (concurrency group `promote-ci-apex`, no cancel) is
  dispatched after `set-last-known-good-deployment`, the `needs: set-origins` edges (54 mentions)
  repoint for ci, and probe-test's three `wait-for-main-deploy` steps drop for ci. P3 is
  self-contained and can land first in the PR's first commit; P4 and P5 rewire the deploy's
  ordering and rollback, which is why the model is Opus. **Source**: the design, P3 to P5.
  **Owner**: Claude Code. **Model**: Opus. N = 2: on
  2026-09-21 HMRC's sandbox application took `ci-set1` and `ci-set2` and reached its five-URI cap
  (the prod apex, ci apex and local keep the other three; `prod-submit` went), Companies House took
  the same two, and the §3 curl answers 303 and 302 for both hosts and 400 for `ci-set3`. So P3
  lists two slot hosts, and `.github/actions/claim-ci-slot/action.yml`'s `slot-count` default (line
  26) drops from 4 to 2 in the same PR. **Size**: ~9 files.

## Machine-ask

- [ ] **B11.T10. ITSA phase 2: the send.** The operator names the day; Claude Code re-runs
  `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the commands in
  `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` lines 69 to 79; B11.T7c moves its output directory)
  inside the 14 days before it and updates the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28); the
  operator sends `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` and
  `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code re-runs; the
  operator names the day and sends. **Model**: Haiku. **Size**: ~1 file.

## Human-driven

## Blocked

- [ ] **B30ao. `prod-env-operator-snapshot-publish-errors`: the visitor-kind view's day type.**
  On `main` since PR #315 (27df5cb1). Alarm issue #313 was the snapshot's three
  visitor-kind observations failing `TYPE_MISMATCH: Cannot apply operator: varchar < date`, because
  `v_visitors_by_kind_daily` read the table's string `day`; it now reads `dt AS day`. Proof: the
  03:1x UTC snapshot run on 2026-09-22 publishes with no failing observation; then close #313
  quoting it. Blocked on that run. **Source**: issue #313; BACKLOG 30. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~0 files.

- [ ] **B34.7. Run and fix the filing suites' sandbox sign-in.** `deploy.yml` and `probe-test.yml`
  run the two filing suites only when the dispatch input `runCompaniesHouseSandboxFiling` is
  `true`, and probe-test's guard step fails fast naming any of O17's four values that is empty.
  Against a standing ci set, once O17 clears:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`;
  then the same for `changeRegisteredEmailBehaviour`. The suite navigates the ci apex, which is the
  registered redirect, so this runs before P4 moves the probes to the set's own host. The fix lands
  in `behaviour-tests/steps/behaviour-companies-house-filing-steps.js`, whose
  `authoriseWithCompaniesHouse` selectors (`#userId`, `#password`, `#companyAuthCode`,
  `#givePermission`) are the simulator's own OAuth page and whose authenticator-challenge selectors
  are a stated guess; the first run's screenshots under `target/` show the real One Login and
  permission pages. **Source**: BACKLOG 34. **Owner**: Claude Code. **Model**: Sonnet. Blocked on
  O17. **Size**: ~1 file.

- [ ] **PU-14. An `experiments.toml` row for the price change.** Objective `conversion-to-paid`,
  lever price, metric purchases per human session, start at PU-5's deploy, so the £39 shape is
  measured against the 99p rate. Blocked on PU-5. **Source**: `REPORT_PRICE_UPDATE_REVIEW.md` §2 row
  6; operator 2026-09-21. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** Submission 000004 (test
  presenter, company 06846849, package reference 0012) was acknowledged with no errors by the XML
  Gateway test service; every `GetSubmissionStatus` poll for it answers 9999 "No presenter ID
  supplied", with the body's `PresenterID` plaintext and hashed, and the body is plaintext on
  `main`. The blocker is the email BACKLOG 34d describes, which has not been sent: the last message
  on the `xml@companieshouse.gov.uk` thread is the operator's of 2026-09-11. Claude Code drafts it,
  the operator sends, and it asks whether 000004 was accepted and whether status lookups are
  enabled for this presenter. When the answer comes and lookups are enabled: poll 000004 through
  `GET /api/v1/companies-house/accounts/000004` on a standing ci set, and pin the returned
  `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs.
  **Source**: BACKLOG 34b, 34d. **Owner**: Claude Code; the operator sends 34d's email. **Model**:
  Sonnet. Blocked on that answer. **Size**: ~2 files.

- [ ] **PU-5. The DIYA-GL tier on prod.** `SubmitApplication.java` line 484 sets
  `.residentTierEnabled(!"prod".equals(envName))`, which `DiyaGlStack.java` (lines 140 and 241)
  passes as `DIYA_GL_RESIDENT_TIER` and `app/services/diyaGlEntitlement.js` line 40 reads; make
  it true for prod, and add `prod` to `resident`'s environments in the catalogue. Blocked on PU-3. **Source**:
  `PLAN_PRICE_UPDATE.md` PU-5. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

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
  lever with the operator's reserve floor; paid traffic and article boosts as `experiments.toml`
  rows with on-off or geographic controls; GA4 conversion import from the Ads account. Blocked on
  three events: B52l's fitted models, which the return-per-pound figure comes from; the cost panel
  carrying revenue (BACKLOG 43, from 2026-10-02, the first monthly renewal); and the operator
  naming the reinvestment fraction and the reserve floor. The Google Ads account exists as code
  (`infra/google/ads/ads.toml`: customer `8142685080`, four conversion actions imported from GA4
  events, one Performance Max campaign), so no token step remains; the cost-per-session ceiling
  PU-15 writes into D17 is the starting bid ceiling.
  **Source**: BACKLOG 52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code, with the
  operator's fraction and floor. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-9. Retire the three folded bundles.** `resident-diya-gl`, `resident-itsa` and
  `resident-ltd` leave `submit.catalogue.toml`, `.env.ci` and `.env.prod` once Stripe live shows no
  subscription on their prices. Blocked on PU-5. **Source**: `PLAN_PRICE_UPDATE.md` PU-9.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~3 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** The company's diya-gl book,
  derived nightly and rendered above the eight objectives beside the last set filed at Companies
  House. Shape: a nightly Lambda beside `app/functions/analytics/` calling `mcp/lib/accounts-tools.js`
  `derive_micro_entity_accounts` over the cloud book, writing JSON lines to `curated/finance/` with
  a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in
  `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in
  `web/public/operator/dashboard.html`. Blocked on `../PLAN_FINANCE_AUTOMATION.md` phases 1 and 2
  (open, drafted 2026-08-31, no code): the unblock event is a `book.toml` with validated diya-gl
  lines for DIYA saved to the DIYA cloud. Also blocked on `PLAN_SUBMISSION_MCP.md` M3, the third
  Cognito app client with the device-code grant and `open_book`/`save_book` over the cloud routes;
  M1c is on main (PR #232). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **PU-2. Two prices per bundle.** Catalogue `prices` table, `infra/stripe/stripe-sync.js` per
  price, `app/functions/billing/billingCheckoutPost.js` checkout by interval, `web/public/bundles.html`
  annual first, `app/services/productCatalog.js` (`stripePriceAmount`/`stripeInterval` per bundle,
  line 62), tests. Per `PLAN_PRICE_UPDATE.md` §(b). Blocked on
  PU-1. **Source**: `PLAN_PRICE_UPDATE.md` PU-2. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~8 files.

- [ ] **PU-7. Practice licence build.** Per PU-6's design and its task list. Blocked on PU-6.
  **Source**: `PLAN_PRICE_UPDATE.md` PU-7. **Owner**: Claude Code. **Model**: per the design.
  **Size**: per the design.

- [ ] **PU-3. Stripe test then live.** The `resident` product with both prices through
  `stripe-catalogue-sync`, test then live; the price ids into `.env.ci` and `.env.prod`. Blocked on
  PU-2. **Source**: `PLAN_PRICE_UPDATE.md` PU-3. **Owner**: Claude Code; the live key is the
  operator's. **Model**: Haiku. **Size**: ~2 files.

- [ ] **O17. A sandbox sign-in for the filing suites, and four ci values.** The sandbox has no
  registration page and no create-user API; its sign-in is reached only through
  `identity-sandbox.company-information.service.gov.uk/oauth2/authorise` with the "- test" client
  and the registered ci apex redirect, which offers GOV.UK One Login or a Companies House email
  sign-in. The blocker: `find-and-update-sandbox.company-information.service.gov.uk` answers no
  connection (re-checked 2026-09-19; `identity-sandbox/user/register` redirects to
  `/there-is-a-problem`), so the One Login route cannot complete. Retry that host; if it is still
  dead after a day, post the host, URL and time on the Companies House developer forum
  <https://forum.aws.chdev.org/>. When it answers: create a One Login with a plus-address and an
  authenticator app, capturing the base32 secret, sign in once through the sandbox chooser, and set
  on the GitHub `ci` environment the variable `TEST_COMPANIES_HOUSE_USER_ID` and the secrets
  `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET` and
  `COMPANIES_HOUSE_SANDBOX_API_KEY` (the "- test" REST key); none of the four is set today.
  Unblocks B34.7. **Source**: BACKLOG 34. **Owner**: Operator. **Model**: none.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

