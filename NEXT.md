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

**Prod runs deployment prod-ebaeb7d (the merge of PR #154, run 34284851786, 2026-09-08 22:14
UTC), which retired prod-5c28d63; no spare stands.** A main deploy retires the previous set
itself; a `prod-*-app-*` set left standing by anything else costs $46.88/month until named to
`destroy-prod.yml` (`_developers/archive/PLAN_COST_OPTIMISATION.md`).

The board runs in four sections, in this order: in flight; ready, Claude Code; ready, operator;
blocked (either owner, the blocker named). Within a section, items run by backlog tier, an
alarm or a pipeline failure counting as tier 1, then the untiered. Operator items
are briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## In flight

Batch 14 is PR #159 (`claude/b14-board`, last push 2026-09-09 04:5x UTC): B63, B60, B62, B58,
B59, B61, B30q, B30p and B10.4's proof, all green locally (`npm test` 2461, `./mvnw clean
verify` 202) and on the branch's ci deploy (34309224550). The ITSA sandbox proof stands: the
three suites passed against test-api.service.hmrc.gov.uk from `ci-claudf739` (probe runs
34302356322, 34311301074, 34311302938), one quarterly update accepted. The board of the merge
reads main's environment deploy for B61's two prod-only steps and the CIS filters. Issue #152's
cause is known (two customers with a stale HMRC authorisation code, the handler answering 500;
neither wrote in or returned), so it and #155 to #158 are the operator's to close once the PR
is on main. B11's T1 is on `claude/b15-board` and its T2 runs there now.

## Ready: Claude Code

- [ ] **B64. The repository's schedules have stopped firing.** No `schedule` event has
  started a run since 23:01 UTC on 2026-09-08 (a probe test); `destroy-ci.yml`'s 02:34 and
  04:34 slots, `deploy.yml`'s 04:11, and the 03:51, 04:00 and 04:23 crons all missed on
  2026-09-09 as of 04:35 UTC, and destroy-ci's last scheduled run was 13:01 the day before, so
  `ci-claud87a7-app-ApiStack` (DELETE_FAILED since 14:37 UTC on 2026-09-08 on its Cognito
  authorizer, "InternalFailure" from ApiGatewayV2) and the two orphaned BooksStacks
  (`ci-claud87a7`, `ci-clauddf1b`) still stand. Read the workflow's schedule runs
  (`gh run list --event schedule --limit 40`) against GitHub's known delay and the
  `keepalive.yml` staleness check (last run 2026-09-05), say whether the crons are stale the
  way B47a's were or GitHub is lagging, and dispatch nothing: the operator runs
  `gh workflow run destroy-ci.yml` for the leftovers, and if the ApiStack stays
  DELETE_FAILED after the sweep's retry step, say what `--retain-resources` it needs.
  **Source**: the board's deployment check, 2026-09-09. **Owner**: Claude Code. **Model**:
  Haiku.
- [ ] **B11. ITSA phase 2: annual summaries and the final declaration.** The design is
  `PLAN_ITSA_PHASE_2.md` on main: ten tracks, the four endpoint tracks holding the CDK and
  server spine one at a time (T1 the quarterly update's token charge and receipt, then T2 the
  annual submission, T3 the final-declaration obligation and ITSA status, T4 the adjustable
  summary, T5 the calculation and final declaration, T6 the year-end pages, T7 the sandbox
  proof), with T8 the engine derivations in the spreadsheets repository alongside, T9 the
  books-to-submission path after T8 and T6, and T10 the recognition pack after T7. T1 is on
  batch 15 (`claude/b15-board`, on top of batch 14) and T2 runs now; T3 onward start as
  each lands, under the plan's stated assumptions until O30 answers otherwise. **Source**: BACKLOG 11;
  `PLAN_ITSA_PHASE_2.md`. **Owner**: Claude Code. **Model**: Sonnet per track, Opus for T8's
  mapping.
## Ready: operator

- [ ] **O30. Answer the five ITSA phase 2 questions.** `PLAN_ITSA_PHASE_2.md`'s "Open
  questions": whether an annual submission costs a token (the plan assumes not, so a year is
  five tokens), whether the site displays the calculation or signposts HMRC (assumes
  display), which approval stage to apply for first (assumes in-year), whether property income
  is in this phase (assumes not), and whether the sandbox proof uses the phase 1 test user
  plus test-support data (assumes yes). The build proceeds on the assumptions; an answer that
  differs changes T2, T5, T6 or T10 before they start. **Source**: `PLAN_ITSA_PHASE_2.md`.
  **Owner**: Operator. **Model**: none.
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
- [ ] **O22. Preview one set of micro-entity accounts on ci.** The accounts filing activity
  (`file-micro-entity-accounts`, ci only) is on main since PR #148: open it on a standing ci
  set (any branch push or `gh workflow run deploy.yml -f environment-name=ci` from main makes
  one), fill the FRS 105 balance sheet with round figures and use Preview, which renders the
  iXBRL without calling Companies House; then Submit, which goes to the simulator gateway on
  ci and shows the acknowledgement and poll. Say what reads wrong; the operator's eye on the
  form and the rendered accounts is the check no test gives. **Source**: BACKLOG 34b; issue
  #15. **Owner**: Operator. **Model**: none.
- [ ] **O21. File one registered-office or registered-email change on prod.** Both activities
  are live on submit.diyaccounting.co.uk since prod-4463ec1 (2026-09-07 00:5x UTC), free on the
  `default` bundle, with the live Companies House filing client. A real filing changes a real
  company's register, so this is the operator's own company and sign-in. Tell Claude Code how
  it went; a receipt or an error message is enough. **Source**: BACKLOG 34; issue #15.
  **Owner**: Operator. **Model**: none.
- [ ] **O23. Open a Google Ads account for the paid-traffic experiments.** Both earlier Ads
  accounts were cancelled (`google-analytics.toml`); the reinvestment loop (plan row D17) needs
  one with conversion import from GA4 property 523400333's key events, and a reserve floor
  the loop must not spend below. Name the floor to Claude Code with the account id; the first
  test is designed as on-off weeks before any spend. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D17. **Owner**: Operator. **Model**: none.
- [ ] **O28. Read HMRC's August fraud-prevention-header advisories.** The new monthly check's
  first dry run over the mail mirror found HMRC's 2026-09-02 email reporting August 2026 with
  advisories to review. Open it (from noreply@tax.service.gov.uk, subject "Improve fraud
  prevention headers for DIY Accounting Submit"), read which headers it names, and hand the list
  to Claude Code for the fix in `app/lib/fraudPreventionHeaders.js` or wherever the named header
  is built. **Source**: B22's first run, 2026-09-08. **Owner**: Operator. **Model**: none.
- [ ] **O29. Delete the three merged origin branches.** `claude/b12-board`, `claude/b13-board`
  and `claude/ops-spreadsheets-role` are on main with nothing unique. **Source**: none.
  **Owner**: Operator. **Model**: none.

## Blocked

- [ ] **D1. The prod sweep's first scheduled proof.** The 04:11 UTC scheduled deploy of main
  did not fire on 2026-09-09 (nothing on any of this repository's crons has fired since
  23:01 UTC on 2026-09-08, B64), so the proof waits for the next scheduled deploy that runs:
  it must retire the set it replaces (prod-ebaeb7d) in the same run, and the board of that
  day reads the destroy-previous job. **Source**: B53c. **Owner**: Claude Code. **Model**:
  Haiku. Blocked on the schedule firing.
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
- [ ] **B52l. The optimiser.** A notebook over the raw export: per-block correlations, the
  block models (linear cost, log-linear funnels, Hill saturation for spend), levers ranked by
  effect per unit cost, and the next experiment proposed with its predicted effect and
  interval; Bayesian optimisation for the continuous knobs and a Thompson-sampling bandit for
  allocations once experiments exist. Its one line per objective goes on the page. **Source**:
  BACKLOG 52; plan row D16 and the optimisation section. **Owner**: Claude Code. **Model**:
  Opus for the models, Sonnet for the notebook. Blocked on three months of the raw export,
  whose first night is 2026-09-09.
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
