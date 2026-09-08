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

**Prod runs deployment prod-5c28d63 (the merge of PR #151, run 34236942090, 2026-09-08 14:14
UTC), which retired prod-c6d0ed3; no spare stands.** A main deploy retires the previous set
itself; a `prod-*-app-*` set left standing by anything else costs $46.88/month until named to
`destroy-prod.yml` (`_developers/archive/PLAN_COST_OPTIMISATION.md`).

The board runs in six sections, in this order: in flight; ready and unblocking other items;
ready; blocked on a machine task; blocked on a human task; blocked on a date. Operator items
are briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## In flight

Batch 13 is PR #153 (`claude/b13-board`, tip e8dd1384, pushed once on 2026-09-08 at 19:0x UTC),
the worktree `.claude/worktrees/b12` (its old directory name). Maven and `npm test` are green on
that tip (2453 tests). The operator's standing instruction of 2026-09-08: no board item enters
"in flight" from here; only a bug that blocks this PR may be worked. What remains, in order:

1. The first run (2026-09-08 19:0x UTC) failed two ways, both fixed in 52a98d50 and pushed
   at 19:5x UTC after every run had completed: the environment deploy's AnalyticsStack rolled
   back on the new AWS Budget's forecast notification (Budgets accepts only `GREATER_THAN`,
   `LESS_THAN` and `EQUAL_TO`), and the deploy's simulator vatSchemes suite lost a screenshot
   to a navigation race after the HMRC sign-in click (the step now waits for the next document
   first; the suite had passed on main's merge deploy). The second run's environment deploy
   (34273259978), test and CodeQL are green; its deploy (34273260002) failed on HmrcStack and
   the suites after it because the ci set from the first run self-destructed underneath it, so
   the operator dispatched a fresh deploy, 34277995271 (third run, 20:59 UTC). That run failed
   on EdgeStack: the previous set's AwsCustomResource provider log group in us-east-1 had been
   recreated by the provider's last log lines after its stack was gone, so the new EdgeStack's
   create hit "already exists"; every suite then failed or was cancelled on a set the operator
   called hosed. Fix 34116c67, pushed at 21:4x UTC on the operator's word without waiting for a
   destroy: `deploy-cdk-stack.yml` deletes a provider log group in either region when no stack
   of that name stands before deploying. That push started only test (34279675154) and CodeQL
   (34279679245), since the workflow it touched is outside `deploy.yml`'s path filter, so the
   fourth deploy was dispatched: 34279784522 (21:5x UTC). A
   failure gets its fix committed on the batch and pushed once the run has completed, never
   while a `deploy environment` or `deploy` run is in progress. A stale ci set (a resource
   CloudFormation records but AWS lacks) is destroyed from the branch ref before the next
   deploy: `gh workflow run destroy-ci.yml --ref claude/b13-board -f deployment-name=<set>
   -f sweep-for-stacks=false`, then `gh workflow run deploy.yml --ref claude/b13-board`.
2. When the deploy and the checks are green, PR #153 is the operator's to merge; that deploy's
   ci set serves B10.4, O22 and O27 for an hour.
3. After the merge: strip every batch-13 item from this file, keep only what remains, and tell
   the spreadsheets session (inbox `~/.claude/inboxes/spreadsheets.md`) that B50a and B57 are
   on main.

The operator's addition of 2026-09-08 21:1x UTC, the one exception to the freeze: **B57**, a
role in each deployment account for the spreadsheets ci behaviour run's test user, as IaC in
`IdentityStack.java` for ci and prod with fixed names
(`arn:aws:iam::367191799875:role/ci-env-spreadsheets-behaviour-role`,
`arn:aws:iam::972912397388:role/prod-env-spreadsheets-behaviour-role`; trust
`token.actions.githubusercontent.com`, sub `repo:diy-accounting-uk/spreadsheets.diyaccounting.co.uk:*`;
Cognito admin calls on the pool, `DescribeStacks` on the identity stack, the test-user script's
DynamoDB purge; output `SpreadsheetsBehaviourRoleArn`). A Sonnet agent builds it in a worktree
(`agent-a87458237abeb2e66`). The operator's instruction of 21:3x UTC: it does not join the
batch; when it lands, create a branch off `claude/b13-board` (`claude/ops-spreadsheets-role`),
cherry-pick the commit there, push that branch once and open its PR against main, so the PR
carries the role plus the whole batch while PR #153 stays as it is. Done: the role is
PR #154 (`claude/ops-spreadsheets-role`, tip 39c89124, pushed 21:5x UTC, base main: it carries
the role plus everything on `claude/b13-board`, so merging it lands both);
its runs: environment deploy 34279820085, deploy 34279821140, test 34279819393. The role leaves out the subject-hash salt read the purge script needs
(another repository's identity reading the salt would also trip the salt-read alarm), so the
spreadsheets run skips the purge; the spreadsheets session has the ARNs and that gap.

| Items | Agent | Model | Worktree |
|---|---|---|---|
| B52f (security panels: the nightly security lake Lambda, lifecycle check and alarm, `sbom.yml`, the fourteen CIS metric filters, WAF blocks, the rotation record) | on the batch | Sonnet | — |
| B52g (the operator page, the snapshot Lambda, the `operator` bundle, `experiments.toml`; five of eight objectives fill as their sources land) | on the batch | Sonnet | — |
| B52h, B52j, B52k (the raw export and `analytics-pull.sh`, the retention and operator-effort views, the compliance lake and `compliance.toml`) | on the batch | Sonnet | — |
| B50a (ci's DIYA-GL client keeps native sign-in on when the toggle disables it; applied to the ci pool) | on the batch | Haiku | — |
| B56 (the two remaining CodeQL redirect alerts: the return URL is built from the allow-list origin) | on the batch | Haiku | — |
| B52e (the cost panel: `cdk-cost/` deploys the FOCUS 1.2 export in the management account through `root-github-actions-role`, no operator step; the nightly copy, three `v_cost_*` views, four metrics, budgets and the anomaly monitor by SNS to Telegram, the Running cost widgets) | on the batch, wired at cd28dde2 | Sonnet | — |

## Ready, unblocking others

- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34;
  issue #15. **Owner**: Operator. **Model**: none.
- [ ] **O27. Examine the three VAT read pages on ci.** Liabilities, payments and penalties are
  on main, ci only, on every bundle. Open them on a standing ci set, read each against the
  HMRC figures the sandbox returns, and say what reads wrong or that they can go to prod.
  Unblocks B17b. **Source**: BACKLOG 17b; issue #19. **Owner**: Operator. **Model**: none.
- [ ] **B30p. The four HMRC token-exchange 500s of 2026-09-08 06:23 to 06:29 UTC.** Issue #152
  (`prod-c6e18fd-app-api-5xx`, one datapoint) sits on a set that is gone, with its Lambda log
  group; what survives is the API access log (`/aws/apigw/prod-env/access`: four `500` on
  `POST /api/v1/hmrc/token`, request ids DXd9lgMWrPEEMEA=, DXeLThvPLPEEJjg=, DXeffggJLPEEPZw=,
  DXe2mjJArPEEJ0w=, about two minutes apart, one caller retrying; two more `500` at 09:3x UTC
  on prod-c6d0ed3, every other token exchange that day `200`) and the lake's activity events.
  The prod destroy now deletes a retired set's Lambda log groups, which is what removed this
  alarm's evidence; part of the fix is to keep prod log groups (their retention is already
  short) or export the window to the lake before deleting. Follow `vat-submission-failure-alarm-user-lookup`'s method: find the actor's hashed
  subject from the activity events of that window, what `hmrcTokenPost.js` answers 500 for
  (HMRC's token endpoint erroring, or a thrown error before the reply), whether the same actor
  authenticated later, and whether they wrote to support; then say whether a fix or a reply is
  owed. The issue closes when the cause is known. **Source**: issue #152. **Owner**: Claude
  Code. **Model**: Sonnet.
- [ ] **B10.4. ITSA sandbox proof: one quarterly update filed.** Business Details, Obligations
  and the cumulative period-summary POST are on main behind the environments gate
  (`hmrcItsaBusinessDetailsGet.js`, `hmrcItsaObligationsGet.js`,
  `hmrcItsaSelfEmploymentPeriodPost.js`). Create an HMRC sandbox test user with a
  self-employment business through the create-test-user API, run the three against
  test-api.service.hmrc.gov.uk from a ci set with the `Gov-Test-Scenario` values
  `_developers/hmrc/ITSA_SPIKE.md` names, and record the accepted update's response in the
  simulator. Unblocks B11. Runs against the ci set batch 13's push creates. **Source**: BACKLOG 10; issues #16, #20. **Owner**: Claude Code.
  **Model**: Sonnet.

## Ready

- [ ] **O23. Open a Google Ads account for the paid-traffic experiments.** Both earlier Ads
  accounts were cancelled (`google-analytics.toml`); the reinvestment loop (plan row D17) needs
  one with conversion import from GA4 property 523400333's key events, and a reserve floor
  the loop must not spend below. Name the floor to Claude Code with the account id; the first
  test is designed as on-off weeks before any spend. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D17. **Owner**: Operator. **Model**: none.
- [ ] **O22. Preview one set of micro-entity accounts on ci.** The accounts filing activity
  (`file-micro-entity-accounts`, ci only) is on main since PR #148: open it on a standing ci
  set (any branch push or `gh workflow run deploy.yml -f environment-name=ci` from main makes
  one), fill the FRS 105 balance sheet with round figures and use Preview, which renders the
  iXBRL without calling Companies House; then Submit, which goes to the simulator gateway on
  ci and shows the acknowledgement and poll. Say what reads wrong; the operator's eye on the
  form and the rendered accounts is the check no test gives. **Source**: BACKLOG 34b; issue
  #15. **Owner**: Operator. **Model**: none.
- [ ] **O28. Read HMRC's August fraud-prevention-header advisories.** The new monthly check's
  first dry run over the mail mirror found HMRC's 2026-09-02 email reporting August 2026 with
  advisories to review. Open it (from noreply@tax.service.gov.uk, subject "Improve fraud
  prevention headers for DIY Accounting Submit"), read which headers it names, and hand the list
  to Claude Code for the fix in `app/lib/fraudPreventionHeaders.js` or wherever the named header
  is built. **Source**: B22's first run, 2026-09-08. **Owner**: Operator. **Model**: none.
- [ ] **O21. File one registered-office or registered-email change on prod.** Both activities
  are live on submit.diyaccounting.co.uk since prod-4463ec1 (2026-09-07 00:5x UTC), free on the
  `default` bundle, with the live Companies House filing client. A real filing changes a real
  company's register, so this is the operator's own company and sign-in. Tell Claude Code how
  it went; a receipt or an error message is enough. **Source**: BACKLOG 34; issue #15.
  **Owner**: Operator. **Model**: none.
## Blocked on a machine task

- [ ] **B11. ITSA phase 2: annual summaries and the final declaration.** The annual submission
  and the final declaration (crystallisation) endpoints, then the recognition application and
  the finder listing, which follow BACKLOG 11a's parked questionnaire. An Opus design pass
  first, since the annual summary carries the whole year's figures and the books import
  (`PLAN_SUBMISSION_MCP.md`) is the natural source. **Source**: BACKLOG 11. **Owner**: Claude
  Code. **Model**: Opus design, then Sonnet. Blocked on B10.4.
- [ ] **B52l. The optimiser.** A notebook over the raw export: per-block correlations, the
  block models (linear cost, log-linear funnels, Hill saturation for spend), levers ranked by
  effect per unit cost, and the next experiment proposed with its predicted effect and
  interval; Bayesian optimisation for the continuous knobs and a Thompson-sampling bandit for
  allocations once experiments exist. Its one line per objective goes on the page. **Source**:
  BACKLOG 52; plan row D16 and the optimisation section. **Owner**: Claude Code. **Model**:
  Opus for the models, Sonnet for the notebook. Blocked on B52h and three months of export.

## Blocked on a human task

- [ ] **B17b. VAT read-page videos.** After O27: add `prod` to the three activities'
  environments in `web/public/submit.catalogue.toml`, record liabilities, payments and
  penalties one video each in the 17a capture pattern (`videos/*.json`, `auth: "user"`,
  `site-video-capture`), and publish them with `video-publish` beside the others. **Source**:
  BACKLOG 17b; issue #19. **Owner**: Claude Code. **Model**: Sonnet for the capture, Haiku
  for the publish. Blocked on O27.
- [ ] **B34.7. Run and fix the filing suites' sandbox sign-in.** Batch 9 (6957651c) carries
  the suites' sandbox sign-in with the authenticator step, off by default: `deploy.yml` and
  `probe-test.yml` run the two filing suites only when the dispatch input
  `runCompaniesHouseSandboxFiling` is `true`, and the run fails fast naming any of O17's four
  values that is empty. Against a standing ci set:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`
  and the same for `changeRegisteredEmailBehaviour`; the first run's screenshots guide any
  selector fix. **Source**: BACKLOG 34; issue #15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O17.
- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** After O16: submit the
  FRS 105 accounts to the XML Gateway test service with the test presenter credentials (a
  GitHub environment secret), read the real acknowledgement and poll responses, settle the
  `Authority` element question (the worked example carries it, FormSubmission-v2-11 does not),
  correct the envelope and iXBRL where the sandbox's own validation differs from the public
  schemas, record what the sandbox returned in the simulator, then add `prod` to the
  `file-micro-entity-accounts` activity and to `resident-ltd`'s listing. **Source**: BACKLOG
  34b; issue #15. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O16.

## Blocked on a date

- [ ] **O16 / B34b. Activate the XML Gateway test presenter account.** Companies House's XML
  team (Ioan, xml@companieshouse.gov.uk) replied on 2026-09-07: they activate a test account
  once they have the presenter's name, contact name, address, email address and telephone
  number, and then issue the test presenter credentials to use in every test submission; the
  specification they pointed at is the public TIS set the build already follows. Reply with
  the five details (DIY Accounting Limited; Antony Cartwright; the registered office, 37
  Sutherland Avenue, Leeds, LS8 1BY; antony@diyaccounting.co.uk; the telephone number). When
  the credentials arrive, put them on the GitHub `ci` environment as the secrets
  `COMPANIES_HOUSE_PRESENTER_ID` and `COMPANIES_HOUSE_PRESENTER_CODE` and tell Claude Code,
  which starts B34.6b. Chase on 2026-09-21 if silent. **Source**: BACKLOG 34b; issue #15.
  **Owner**: Operator. **Model**: none.
- [ ] **D1. The prod sweep's first scheduled proof.** The 04:11 UTC scheduled deploy of main on
  2026-09-09 must retire the set it replaces (prod-5c28d63) in the same run; the board of that
  day reads the destroy-previous job. **Source**: B53c. **Owner**: Claude Code. **Model**:
  Haiku. Blocked on the date.
- [ ] **D2. The Monday crons' first proof.** `compliance.yml` at 06:06 and `stack-drift.yml` at
  06:36 UTC on 2026-09-14 fire as schedule events; `keepalive.yml`'s staleness step is the
  standing check. **Source**: B47a. **Owner**: Claude Code. **Model**: Haiku. Blocked on the
  date.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
