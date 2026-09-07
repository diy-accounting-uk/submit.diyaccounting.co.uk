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

**Prod runs deployment prod-4463ec1 (main's deploy of the PR #147 merge, run 34068609812);
the deploy retired prod-00c5690 and no spare stands.** A main deploy retires the previous set itself; a `prod-*-app-*` set
left standing by anything else costs $46.88/month until named to `destroy-prod.yml`
(`_developers/archive/PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

Batches 11 (PR #148, the accounts filing) and the spreadsheets session's PR #149 (a second
Cognito app client for the books pages) merged within a minute of each other at 05:57 UTC on
2026-09-07. Their deploys collided in the concurrency group: the #149 environment deploy (run
34088738808) runs first, the cancelled #148 environment deploy (run 34088798974, which adds
the accounts async-requests table) is re-run after it, then the #148 prod deploy (run
34088799182). The spreadsheets session's ci deploys of `claude/books-storage-api` share this
repo's ci account; its failed run 34074004794 is diagnosed in the shared inbox.

- [ ] **B30o. Prove the triage chain on prod.** The resolver fix merged in PR #147 (a missing
  alarm is evidence; composite alarms are listed). Relabelling the closed #138 `triage` at
  00:04 UTC on 2026-09-07 (run 34068635237) stopped at the day guard: more than three triage
  runs executed in the previous 24 hours. The guard clears after 12:01 UTC on 2026-09-07; then
  the operator labels any alarm issue `triage` (#138 serves, closed or not). Verified when that
  run posts the guardrail's anonymised comment. **Source**: BACKLOG 30; issue #18. **Owner**:
  Operator labels, Claude Code reads the run.
## Ready: Claude Code

Nothing.

## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O22. Preview one set of micro-entity accounts on ci.** The accounts filing activity
  (`file-micro-entity-accounts`, ci only) is on main since PR #148: open it on a standing ci
  set (any branch push or `gh workflow run deploy.yml -f environment-name=ci` from main makes
  one), fill the FRS 105 balance sheet with round figures and use Preview, which renders the
  iXBRL without calling Companies House; then Submit, which goes to the simulator gateway on
  ci and shows the acknowledgement and poll. Say what reads wrong; the operator's eye on the
  form and the rendered accounts is the check no test gives. **Source**: BACKLOG 34b; issue
  #15. **Owner**: Operator.
- [ ] **O21. File one registered-office or registered-email change on prod.** Both activities
  are live on submit.diyaccounting.co.uk since prod-4463ec1 (2026-09-07 00:5x UTC), free on the
  `default` bundle, with the live Companies House filing client. A real filing changes a real
  company's register, so this is the operator's own company and sign-in. Tell Claude Code how
  it went; a receipt or an error message is enough. **Source**: BACKLOG 34; issue #15.
  **Owner**: Operator.

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

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof and the price.** After
  B34.6a and O16: submit the FRS 105 accounts to the XML Gateway test service with the test
  presenter credentials (a GitHub environment secret), read the real acknowledgement and poll
  responses, correct the envelope and iXBRL where the sandbox's own validation differs from
  the public schemas, and record what the sandbox returned in the simulator. With it, the
  `resident-company` bundle: the operator decided on 2026-09-07 that the two register filings
  stay free on `default` and limited-company work is priced when accounts filing lands, so
  this item adds the bundle to the catalogue with accounts filing in it (a Stripe product and
  price through `stripe-catalogue-sync`, the price the operator's). **Source**: BACKLOG 34b;
  issue #15. **Owner**: Claude Code, price from the operator. **Model**: Sonnet. Blocked on
  O16 and B34.6a.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
