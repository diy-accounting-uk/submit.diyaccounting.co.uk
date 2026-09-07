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

**Prod runs deployment prod-c980ac9 (main's deploy of the PR #150 merge, run 34099969706);
the deploy retired prod-2324fdd and no spare stands.** A main deploy retires the previous set itself; a `prod-*-app-*` set
left standing by anything else costs $46.88/month until named to `destroy-prod.yml`
(`_developers/archive/PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

PRs #148 (the accounts filing), #149 (the books Cognito client) and #150 (the books storage
API) are merged and deployed; prod carries the first BooksStack. No batch branch is open; the
next starts from main as `claude/b12-board`.

- [ ] **B30o. Prove the triage chain on prod.** The resolver fix merged in PR #147 (a missing
  alarm is evidence; composite alarms are listed). Relabelling the closed #138 `triage` at
  00:04 UTC on 2026-09-07 (run 34068635237) stopped at the day guard: more than three triage
  runs executed in the previous 24 hours. The guard clears after 12:01 UTC on 2026-09-07; then
  the operator labels any alarm issue `triage` (#138 serves, closed or not). Verified when that
  run posts the guardrail's anonymised comment. **Source**: BACKLOG 30; issue #18. **Owner**:
  Operator labels, Claude Code reads the run.
## Ready: Claude Code

- [ ] **B47a. Why the Monday 06:00 UTC schedules do not fire.** `compliance.yml` and
  `stack-drift.yml` both carry `cron: '0 6 * * 1'`; neither ran on 2026-09-07 (checked at 09:00
  UTC), the second miss after the 2026-08-31 revival, and `codeql.yml`'s Sunday schedule did
  fire on 2026-09-06. Both were dispatched by hand at 09:0x UTC on 2026-09-07 instead. Find the
  cause from GitHub's rules for scheduled workflows (the workflow must be on the default
  branch, schedules are dropped after 60 days without activity, high-load delays, a disabled
  workflow state visible with `gh workflow view <name>` and the Actions API's `state`), and
  compare the two files' histories with `codeql.yml`'s; fix what is found (a re-enable through
  the API, or a change to the files) and record how a future miss is detected (the
  `keepalive.yml` workflow may already exist for this; read it). **Source**: BACKLOG 47.
  **Owner**: Claude Code. **Model**: Sonnet.

- [ ] **B50. Add the books app client to the native-auth toggle.** The spreadsheets session
  asked on 2026-09-07 (inbox): `scripts/toggle-cognito-native-auth.js` reads only the
  `UserPoolClientId` output of the identity stack, so the spreadsheets ci behaviour case
  cannot sign in to the books pages without Google. Read the `BooksUserPoolClientId` output
  as well and apply the same `COGNITO` provider change to that client on enable and disable
  (the credentials file stays one file); one-line reply to the spreadsheets inbox when it is
  on main. **Source**: BACKLOG 50; spreadsheets board H16. **Owner**: Claude Code. **Model**: Sonnet.

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
  **Owner**: Operator.
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
## Blocked: Claude Code

- [ ] **D2. prod-env-IdentityStack drift: the Hosted UI user-pool client is MODIFIED.** The
  hand-dispatched `stack-drift` run 34103728614 (2026-09-07 09:03 UTC) found every other prod
  stack in sync or benign and `prodenvUserPoolClient` (AWS::Cognito::UserPoolClient) modified;
  the log does not carry the property. Read it with
  `aws --profile submit-prod cloudformation describe-stack-resource-drifts --stack-name
  prod-env-IdentityStack --query "StackResourceDrifts[?StackResourceDriftStatus=='MODIFIED'].PropertyDifferences"`.
  If it is `SupportedIdentityProviders` carrying `COGNITO`, a probe or video run turned native
  auth on and its cleanup did not run: the fix is `npm run test:disableCognitoNative -- prod`
  (a prod Cognito write, the operator's yes first) and making the workflows' disable step run
  even when the tests fail (`skip-native-auth-disable` is only for debugging). If it is
  anything else, say what and propose the fix. Issue #43 stays open until the next
  scheduled drift run is green. **Source**: issue #43; stack-drift run of 2026-09-07.
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on `aws sso login --sso-session
  diyaccounting`.
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
