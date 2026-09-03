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

**Prod runs deployment prod-6f1779b, the only app stack set standing.** Each extra
`prod-*-app-*` set left after a merge costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board is sequenced in three blocks. Block 1 is the Claude Code batch in flight since
2026-09-03 on PR #107. Block 2 is the operator batch, briefed for Claude Cowork in
`_developers/COWORK_BRIEF_OPERATOR_BATCH.md`. Block 3 is everything the first two blocks
unblock.

### Block 1 — Claude Code batch (in flight)

All tracks integrate on the single remote branch `claude/board-batch-1`; the coordinator merges
each track's commits into it as they land, pushes in batches, and opens the PR once the branch
is deploying. Each track runs in its own worktree under `.claude/worktrees/`. Design waves run
on Opus and write to the session scratchpad; coding runs on Sonnet or Haiku from those designs.

| Track | Model | Items, in order | Worktree / status |
|---|---|---|---|
| A funnel | Sonnet | G1, G2a | merged 50481414; code complete, awaiting the branch deploy |
| B vat-reads | Sonnet design, then Sonnet | B32.1, B32.2, B32.3 | merged 8a62c21e with the harness fix a9916f45 and the DataStack ordering fix a4b1af86; environment deploy 33775958480 and app deploy 33780222884 succeeded; ci-lane fixes merged c5a82aa9 (wait helper, no-data 404 as empty result, sandbox return fallback, penalties assertion); stale-banner fix merged, push deploy 33792440197 green including submitVatBehaviour-ci; obligations verify race fixed (true count 20); payments and penalties verify steps still lack the same default wait; sandbox-lane run 33794898032: view-return fallback and penalties assertion fixed; remainder: the NOT_FOUND scenario does not exist for liabilities or payments in the HMRC spec (sandbox answers 400) and the handlers map an HMRC 400 to a 500, fix in flight. HMRC's token endpoint also gave the test-pass job a 403, unrelated to the branch |
| C1 catalogue | Sonnet | B12a, B12b | merged 3662f33e, test fix merged; code complete, awaiting the branch deploy |
| C2 hygiene | Sonnet | B40e, B40a | merged 9a35e78d with both sandbox-obligations fixes; code complete, awaiting the branch deploy |
| D1 accessibility scans | Sonnet | B27d, B27b.1 | merged c608583f; code complete, awaiting the branch deploy |
| D2 accessibility review | Sonnet | B27b.2, B27b.3 | merged 3ada9169; code complete, awaiting the branch deploy |
| F itsa-test-user | Sonnet | B10a.1 | merged 061ec001; code complete, awaiting the branch deploy |
| G alarm-audit | Haiku | B30a | merged 5fc9f883; audit written |
| H privacy-fixes | Sonnet | B27c.3, B27c.4 | merged 9e75260d; code complete, awaiting the branch deploy |
| I pipeline-cuts | Sonnet design | B32a.2 | done: findings merged 5067f44d; the operator keeps the shared concurrency group |

### Block 2 — Operator batch (brief: `_developers/COWORK_BRIEF_OPERATOR_BATCH.md`)

Browser and account work a workflow cannot do, plus the decisions that unblock Tier 2. Each
item's steps, URLs and hand-back are in the brief so Claude Cowork can drive the browser. Hand
results back by pasting them into a Claude Code session or appending to the workspace
`INBOX.md`. Merging Block 1's PRs as they open is also operator-only and unblocks Block 3.

- [ ] **O1 / G2b. Create a ci GA4 property with its own BigQuery export.** In GA4 admin create a
  property for `ci.submit.diyaccounting.co.uk`, add a web data stream, link it to BigQuery
  project `diyaccounting-ga4` (daily export, `europe-west2`, its own dataset), and put the
  measurement id in the `ci` GitHub Environment as a `SUBMIT_GA4_MEASUREMENT_ID` variable
  (prod gets `G-T81V5NL5MB`). **Source**: none. **Owner**: Operator.
- [ ] **O2 / B12c. Create the Stripe prices for `resident-itsa`** (test and live, £0.99/month
  recurring) and hand the two price ids to Claude Code, which puts them in `.env.ci` and
  `.env.prod` by PR; confirm the day pass numbers (3 tokens, 100 concurrent) or give new ones
  for B12a. **Source**: BACKLOG 12. **Owner**: Operator.
- [ ] **O3 / B27c.2. Renew the company's ICO registration.** Registration ZB070902 (the
  certificate PDF in the repo root) expired 2026-05-23 and `privacy.html` still publishes it
  as current, so this is an active gap, not a check. Pay the fee for DIY Accounting Limited
  (06846849) and hand the new number and expiry to Claude Code for
  `_developers/ICO_CHECKLIST.md` and `privacy.html`. **Source**: BACKLOG 27c; Track E finding
  2026-09-03. **Owner**: Operator.
- [ ] **O4 / B11a.2. Obtain the ITSA recognition questionnaire from HMRC SDST** if it is not on
  the hub (the VAT ones arrived by email; see `_developers/hmrc/hmrc_questionnaire_*`) and
  drop it into `_developers/hmrc/`. In the same contact ask whether a production-credential
  window for new ITSA quarterly-update products opens for 2027-28: HMRC's pages say the
  2026-27 window is closed to new products
  (`_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`; vendor contact
  makingtaxdigital-softwarevendors@hmrc.gov.uk). The answer decides whether backlog rows 10
  and 11 keep their April 2027 target. **Source**: BACKLOG 11a. **Owner**: Operator.
- [ ] **O5 / B10a.2. Subscribe the sandbox application to the ITSA APIs and mint an ITSA test
  user.** In the HMRC developer hub, subscribe the sandbox app (`HMRC_SANDBOX_CLIENT_ID` in
  `.env.ci`) to Business Details (MTD) and Self Employment Business (MTD). Then, once B10a.1
  has deployed from the batch PR, run the `create-hmrc-test-user` workflow with `mtd-vat,mtd-income-tax`
  and keep the credentials artifact (NINO, user id, password). **Source**: BACKLOG 10a.
  **Owner**: Operator. The subscription step is ready now; the workflow run waits on B10a.1.
- [ ] **O6 / B34a. Decide the Companies House shape**: whether the read-only company lookup
  ships on its own first, and whether to apply for filing accreditation now. Either answer
  turns backlog row 34 into dispatchable items. **Source**: BACKLOG 34; issue #15. **Owner**:
  Operator.
- [ ] **O7 / B40d.1. Pick the mode-naming target**: keep `sandbox`/`live` for HMRC and give the
  Stripe test flag its own name (recommended, smallest change), or rename the modes to
  `synthetic` and rename the monitoring vocabulary. Turns backlog row 40d into a Sonnet item.
  **Source**: BACKLOG 40d; issue #12. **Owner**: Operator.
- [ ] **O8 / B43a. GCP billing tidy-up**: confirm the budget alert on the billing account that
  holds the GA4 export is armed, and confirm the stray auto-created project
  `valued-context-507200-m9` is empty and delete it. **Source**: BACKLOG 43. **Owner**:
  Operator.
- [ ] **O9 / B47. Watch the revived schedules fire on their own**: `codeql` on 2026-09-06 and
  the weekly `compliance` and `stack-drift` crons on Monday 2026-09-07 06:00 UTC. If one
  misses, revive it the same way as on 2026-08-31 and tell Claude Code. **Source**: BACKLOG 47.
  **Owner**: Operator.
- [ ] **O10 / B17a. Re-record and publish the demo videos** on
  https://www.youtube.com/@DIYAccountingSubmit, capturing the main site rather than the
  simulator. **Source**: BACKLOG 17a; `PLAN_DEMO_VIDEOS.md`. **Owner**: Operator (Claude Code
  excluded by directive 2026-08-26).

### Block 3 — opens as Blocks 1 and 2 land

- [ ] **G2c. Plumb the measurement id through `submit.env` and assert a `purchase` row in ci.**
  After O1: replace the hardcoded `G-T81V5NL5MB` in `web/public/lib/analytics.js` with a
  value read from `submit.env` (generated by `deploy.yml`/`deploy-app.yml` from the
  environment variable), pass `GA4_BIGQUERY_DATASET_ID` for ci into
  `app/functions/analytics/ga4EventExportPull.js`'s environment, and extend
  `paymentBehaviour-ci` (or a post-run step in `synthetic-test.yml`) to query the ci dataset
  for a `purchase` event with the run's transaction id. Two facts from Track A shape this:
  behaviour-test browsers stub `gtag.js` and `/g/collect` unless
  `DIY_SUBMIT_ALLOW_REAL_ANALYTICS=true`, and Playwright's headless shell reports
  `HeadlessChrome` in the User-Agent Client Hints, which GA4's bot filter excludes, so the
  ci assertion run needs a browser that does not (Playwright `channel: "chromium"` new
  headless or `chrome`); prove the hit lands in DebugView before wiring the BigQuery check.
  **Source**: none. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O1 and the batch PR #107 deploying.
- [ ] **G3. Confirm a real `purchase` lands in prod** once G1 and G2c ship: the next live
  checkout should appear in `diyaccounting-ga4.analytics_523400333.events_*`
  (`bq --project_id=diyaccounting-ga4 --location=europe-west2`). No event of that name has
  ever reached the export. **Source**: none. **Owner**: Claude Code (read-only query).
  **Model**: Haiku. Blocked on G1, G2c and a live sale.
- [ ] **B10a.3. Make one read-only ITSA sandbox call through our own OAuth and fraud headers.**
  Allow `read:self-assessment` in `web/public/lib/auth-url-builder.js` and the scope
  validation in `app/functions/hmrc/hmrcTokenPost.js` (unit tests exist for scope
  rejection); log in on the proxy variant as the O5 test user; call
  `GET /individuals/business/details/{nino}/list` on `HMRC_SANDBOX_BASE_URI` with the token
  and `app/lib/buildFraudHeaders.js` headers. Write `_developers/hmrc/ITSA_SPIKE.md`:
  the raw response, whether the existing application and headers were accepted, and which of
  `_developers/backlog/self-employed-api-operations.md`'s assumptions held. This is the gate
  for B10. **Source**: BACKLOG 10a; issue #16; `_developers/backlog/self-employed-api-operations.md`.
  **Owner**: Claude Code. **Model**: Opus. Blocked on O5.
- [ ] **B30b. Cut the alarms and canary runs the audit shows are dead weight.** From B30a:
  drop or merge check types that never fire in CDK (`Lambda.java`), fold the five
  `AsyncApiLambda` alarm triples into their stack composite (`PLAN_ALARM_CONSOLIDATION.md`
  open item 2, one alert for stuck queue plus broken worker), and set the canary interval and
  synthetic cron so they do not both cover the same 4-hour window. Keep every alarm the
  routing rule or a runbook reads. CDK tests updated; `./mvnw clean verify`. The audit
  (`_developers/ALARM_AUDIT_2026-09.md`) found 141 of 146 alarms never fired in 90 days and the
  five that did are detection or analytics alarms with open issues. **Source**: BACKLOG 30;
  `PLAN_ALARM_CONSOLIDATION.md`. **Owner**: Claude Code. **Model**: Opus.
- [ ] **B40f. Make the Express dev server answer uncaught handler errors as JSON.** When
  `getAsyncRequest` threw `ResourceNotFoundException` locally, `app/bin/server.js` returned
  Express's default HTML 500 page and the page failed on `Unexpected token '<'`; the API rule
  is JSON always, and the deployed Lambdas already answer through `httpResponseHelper.js`. Add
  a JSON error handler to the dev server and a system test that a throwing route returns a
  JSON 500. **Source**: repo find 2026-09-03 fixing B32. **Owner**: Claude Code. **Model**:
  Haiku.
- [ ] **B12c remainder. Put the `resident-itsa` price ids into `.env.ci` and `.env.prod`** by
  PR once O2 hands them over. **Source**: BACKLOG 12. **Owner**: Claude Code. **Model**: Haiku.
  Blocked on O2.
- [ ] **B27c.2 remainder. Record the new ICO registration number and expiry in
  `_developers/ICO_CHECKLIST.md` and `web/public/privacy.html`** once O3 hands them over.
  **Source**: BACKLOG 27c. **Owner**: Claude Code. **Model**: Haiku. Blocked on O3.

Backlog Tier 2 rows 10 and 11 become dispatchable once B10a.3 exists and O4 answers the
production-window question; rows 34 and
40d once O6 and O7 are answered.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
