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

**Prod runs deployment prod-00c5690 (main's deploy of the PR #146 merge, run 34062870619);
the deploy is retiring prod-cfb43ee and no spare stands.** A main deploy retires the previous set itself; a `prod-*-app-*` set
left standing by anything else costs $46.88/month until named to `destroy-prod.yml`
(`_developers/archive/PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

Batch 10 merged as PR #147 at 00:03 UTC on 2026-09-07; main's deploy (run 34068609812) and
environment deploy (run 34068609757) are running. Batch 11 is `claude/b11-board` (local): the
accounts filing and the video publish `--public` fix.

- [ ] **B30o. Prove the triage chain on prod.** The resolver fix merged in PR #147 (a missing
  alarm is evidence; composite alarms are listed). Relabelling the closed #138 `triage` at
  00:04 UTC on 2026-09-07 (run 34068635237) stopped at the day guard: more than three triage
  runs executed in the previous 24 hours. The guard clears after 12:01 UTC on 2026-09-07; then
  the operator labels any alarm issue `triage` (#138 serves, closed or not). Verified when that
  run posts the guardrail's anonymised comment. **Source**: BACKLOG 30; issue #18. **Owner**:
  Operator labels, Claude Code reads the run.
- [ ] **B34.5. Lift the gate on the Companies House filings for prod** is on batch 10 (PR #147,
  8d61de38): the prod client id, the secret ARN and the live filing and identity URIs in
  `.env.prod`, and `prod` in the two filing activities' `environments`; the filing suites stay
  ci-only. Verified when main's deploy after the merge shows the two activities on
  submit.diyaccounting.co.uk and one filing goes through with the operator's own Companies
  House sign-in. **Source**: BACKLOG 34; issue #15. **Owner**: Claude Code, then the operator.
- [ ] **B10.5. The ITSA dashboard page** is on batch 10 (PR #147, 7d94dab8):
  `web/public/hmrc/itsa/dashboard.html` links Business Details, Obligations and the quarterly
  update, and the Self Assessment activity opens it first; six browser tests, plus a unit test
  that every page the catalogue names exists. Verified when main's deploy after the merge
  shows it on ci. **Source**: BACKLOG 10; issues #16, #20. **Owner**: Claude Code.
- [ ] **G7. Streaming export for the GA4 property.** In the GA4 streaming agent's worktree,
  branch `claude/ops-ga4-streaming` (Sonnet): `scripts/ga4-bigquery-link-export.js` lists and
  patches property 523400333's BigQuery link through the Admin API with the analytics
  service account, dry run then `--streaming true`. Verified when the link reads
  `streamingExportEnabled: true` and the first `events_intraday_*` table appears. **Source**:
  operator, 2026-09-07. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B34.6a. Companies House accounts filing through the XML Gateway, everything that
  needs no credentials.** `PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md` is on main. The app half
  (three Lambdas, CDK, the ci-only activity and page, the behaviour suite; c07c4690) is merged
  on batch 11 with two placeholder service modules; the core half (simulator gateway route,
  iXBRL generator, GovTalk envelope module) is in the accounts-core agent's worktree, branch
  `claude/ltd-accounts-core`. After the merge: the async-requests table the plan left out
  (`putAsyncRequest` runs with no table today), the simulator-lane suite, and the public
  validator. Verified when `npm run test:fileMicroEntityAccountsBehaviour-simulator` passes on
  the batch and the validator accepts a generated file. **Source**: BACKLOG 34b; issue #15.
  **Owner**: Claude Code. **Model**: Sonnet.

## Ready: Claude Code

Nothing.

## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O20. Decide the price of the two Companies House filing activities.** They sit on the
  free `default` bundle. `PLAN_COMPANIES_HOUSE_REST_FILING.md` Q1 lists the options: leave them
  free (Companies House charges nothing for either filing), a new `resident-company` bundle with
  its own Stripe product, or fold them into `resident-pro`. Tell Claude Code the answer; the
  catalogue and Stripe changes follow. **Source**: BACKLOG 34; issue #15. **Owner**: Operator.

## Blocked: operator

- [ ] **O16 / B34b. Chase Companies House for the XML Gateway test presenter credentials on
  2026-09-21.** The presenter account exists (ID E0000052288, code in the operator's
  credentials store); the test presenter credentials and the accounts specification were
  requested from xml@companieshouse.gov.uk on 2026-09-05. When they arrive, put the code on the
  GitHub environments as a secret and tell Claude Code, which starts B34.6. **Source**: BACKLOG
  34b; issue #15. **Owner**: Operator. Date-gated: chase on 2026-09-21.
- [ ] **O17 / B34.7. Automated Companies House sandbox sign-in for the filing suites.** Batch
  9 (6957651c) carries the suites' sandbox sign-in with the authenticator step, off by default:
  `deploy.yml` and `probe-test.yml` run the two filing suites only when the dispatch input
  `runCompaniesHouseSandboxFiling` is `true`, and the run fails fast naming any of the four ci
  environment values that is empty. Companies House has no create-test-user API, so the
  operator registers a throwaway account on
  identity-sandbox.company-information.service.gov.uk with an authenticator second factor and
  puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its email)
  and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET` (the
  authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's REST key,
  for creating the run's test company). Then, against a standing ci set:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`
  and the same for `changeRegisteredEmailBehaviour`; the first run's screenshots guide any
  selector fix. **Source**: BACKLOG 34; issue #15. **Owner**: Operator registers and sets the
  values, then Claude Code runs and fixes. **Model**: Sonnet. Blocked on the four values.
- [ ] **O9 / B47. Watch the revived weekly `compliance` and `stack-drift` crons fire on their
  own** on Monday 2026-09-07 06:00 UTC (`codeql` fired on its schedule on 2026-09-06, run
  34022009649). If one misses, revive it the same way as on 2026-08-31 and tell Claude Code.
  **Source**: BACKLOG 47. **Owner**: Operator. Date-gated: 2026-09-07.

## Blocked: Claude Code

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** After B34.6a and O16:
  submit the FRS 105 accounts to the XML Gateway test service with the test presenter
  credentials (a GitHub environment secret), read the real acknowledgement and poll responses,
  correct the envelope and iXBRL where the sandbox's own validation differs from the public
  schemas, and record HMRC-style test data in the simulator from what the sandbox returned.
  **Source**: BACKLOG 34b; issue #15. **Owner**: Claude Code. **Model**: Sonnet. Blocked on
  O16 and B34.6a.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
