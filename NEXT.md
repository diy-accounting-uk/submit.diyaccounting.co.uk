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

**Prod runs deployment prod-cfb43ee (main's deploy of the PR #141 merge, run 34038618085);
the deploy retired prod-3778d47 and no spare stands.** A main deploy retires the previous set itself; a `prod-*-app-*` set
left standing by anything else costs $46.88/month until named to `destroy-prod.yml`
(`_developers/archive/PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

Batch 9 merged as PR #146 at 22:03 UTC on 2026-09-06. Main's deploy (run 34062870619) and
environment deploy (run 34062870544) are running; the next batch starts from main as
`claude/b10-board` when its first track lands.

- [ ] **B30o. Prove the triage chain on prod.** The pipeline fix is on main: relabelling #138
  `triage` at 22:03 UTC (run 34062903265) installed dependencies and ran the evidence resolver,
  which stopped the job with "No alarm named prod-0967fab-app-account-stack-health was found
  in eu-west-2", the right answer for a retired set and the reason #138 could not serve as the
  proof. Next: `scripts/resolve-alarm-evidence.mjs` treats a missing deployment-scoped alarm
  as evidence (the set is gone; say so, with the issue body's window and the log-group prefix)
  and exits 0 so the triage runs, then the next live alarm issue labelled `triage` is the
  proof. Verified when that run posts the guardrail's anonymised comment. **Source**: BACKLOG
  30; issue #18. **Owner**: Claude Code. **Model**: Sonnet for the resolver, then the operator
  labels.
- [ ] **D1** is on main (PR #146): main's environment deploy replaces each table's PITR
  resource with the `Provider`-backed one on prod (ci passed at 20:44). Verified when run
  34062870544 completes and the next deploy that adds a table passes first time.
- [ ] **A1. Stop the release, false positive, alarm, issue, triage, close cycle on
  auto-destructing sets.** `PLAN_ALARM_TEARDOWN.md` and its build are on main (PR #146): a
  teardown writes `/submit/<env>/alarm-silence/<deployment>` as its first action (self-destruct
  Lambda, `destroy-ci.yml`, `destroy-prod.yml`, and so the main deploy's prod retire) and the
  GitHub-issue and Telegram routers drop a silenced deployment's events; the marker lasts two
  hours and never beyond twelve from its first write. Main's deploy retires prod-cfb43ee
  through that path. Verified when the retire and the next ci self-destruct each pass without
  an alarm issue or Telegram message naming the set, and
  `aws ssm get-parameter --name /submit/prod/alarm-silence/cfb43ee` shows the marker.
  **Source**: operator, 2026-09-06. **Owner**: Claude Code. **Model**: Sonnet.

## Ready: Claude Code

- [ ] **B10.5. The ITSA dashboard page.** Both sandbox suites passed on ci (Obligations run
  34058209190, quarterly update run 34060737800 after the body fix in PR #146), so row 10's
  three endpoints are proven. The catalogue names `hmrc/itsa/dashboard.html` and the page does
  not exist: build it as the entry point that links Business Details, Obligations and the
  quarterly update, in the pattern of the VAT pages. **Source**: BACKLOG 10; issues #16, #20.
  **Owner**: Claude Code. **Model**: Sonnet.

## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **B17a.5. Publish the videos** on https://www.youtube.com/@DIYAccountingSubmit. Two are
  ready as recorded: `video-view-obligations-prod` (run 33952515598) and
  `video-submit-return-prod` (run 33953044775); the operator accepted the sandbox banner and
  the 2017 sandbox periods on 2026-09-06. `video-view-return-prod` was re-recorded as run 34058244686 after batch 9 (d0f6316e) stopped
  the off-camera submit leaving developer mode on: its stills are clean and
  `check-video-timings.js` passes, and `videos/PUBLISH.md` names the new run. The re-recorded
  mp4 was sent to the operator on 2026-09-06 for review. `videos/PUBLISH.md`. Batch 9 (58b9fa7c) also carries `videos/publish.json` with the three
  videos' titles, descriptions, tags and captions, and `scripts/youtube-upload.js`, which
  uploads them as unlisted after a one-time OAuth consent and writes each video id back so a
  re-run is idempotent. Operator steps in `videos/PUBLISH.md`: download the artifacts, create
  a Desktop-app OAuth client in the Google Cloud console with the YouTube Data API enabled,
  export its id and secret, `npm run video:publish`, review, then
  `npm run video:publish -- --public`. **Source**: BACKLOG 17a. **Owner**: Claude Code for the
  re-record, then Operator.
- [ ] **O11. Companies House filing: the developer-hub and ci steps.** The developer hub keys
  an application to one Companies House environment, sandbox ("test application") or
  production ("live application"). The hub holds three: "DIY Accounting Submit - test"
  (sandbox) and the live "- ci" and "- prod", whose API keys serve the read-only lookup, which
  reads real company data from both environments. Filing on ci runs against the sandbox, so
  its OAuth client belongs on the test application, shared by local, proxy and ci; prod's
  filing client goes on the live "- prod" application when the gate lifts (B34.5). On the test
  application at
  developer.company-information.service.gov.uk/manage-applications: create a key of type OAuth
  web client (or open the one that exists) and register the three sandbox redirect URIs from
  `PLAN_COMPANIES_HOUSE_REST_FILING.md`'s operator steps (localhost:3000, local.submit:3443,
  ci-submit, each ending `/companies-house/filingCallback.html`); put its client id as the
  `COMPANIES_HOUSE_CLIENT_ID` variable and its secret as the `COMPANIES_HOUSE_CLIENT_SECRET`
  secret on the GitHub `ci` environment (done 2026-09-06: key "submit filing", three redirect
  URIs, id in `.env.ci`, secret on ci, and `ci/submit/companies-house/client_secret` in AWS
  since main's environment deploy of the PR #139 merge). Remaining: on a ci set (ci-claud9501 stands
  from 2026-09-06 20:05 UTC until its self-destruct or the 02:34 sweep; a branch push or a
  `deploy.yml` dispatch for ci makes another), open the two
  filing activities on the ci site and take one change through the sandbox with your own
  Companies House sandbox sign-in. No credentials go into GitHub for this: Companies House filings need
  a person to authorise them, so an automated ci run would need a robot account with an
  authenticator secret, which is not wanted. **Source**: BACKLOG 34; issue #15. **Owner**:
  Operator.

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

- [ ] **B34.5. Lift the gate on the Companies House filings for prod.** After O11 and the
  operator's examination on ci: an OAuth web client key on the existing live application
  "DIY Accounting Submit - prod" (the one whose API key serves prod's lookup) with the prod
  redirect URI
  `https://submit.diyaccounting.co.uk/companies-house/filingCallback.html`, its client id in
  `.env.prod` and its secret as `COMPANIES_HOUSE_CLIENT_SECRET` on the GitHub `prod`
  environment (operator steps, briefed when they come due); then `prod` joins the two filing
  activities' `environments` in `web/public/submit.catalogue.toml`, `deploy.yml` runs the two
  filing suites against prod, and the pricing question in `PLAN_COMPANIES_HOUSE_REST_FILING.md`
  Q1 gets its answer before the activities leave the free `default` bundle. **Source**: BACKLOG
  34; issue #15. **Owner**: Claude Code, with the operator's hub and secret steps. **Model**:
  Sonnet. Blocked on O11 and the operator's look at the filings on ci.
- [ ] **B34.6. Companies House accounts filing through the XML Gateway.** FRS 105 micro-entity
  accounts as iXBRL in an XML envelope against the test presenter credentials: an Opus design
  pass (envelope, presenter authentication, the accounts spec, where the iXBRL comes from,
  simulator routes) then a Sonnet build, with the presenter code reaching the build as a
  GitHub environment secret. **Source**: BACKLOG 34b; issue #15. **Owner**: Claude Code.
  **Model**: Opus design, then Sonnet. Blocked on O16.
- [ ] **G3. Confirm a real `purchase` lands in prod**: the next live
  checkout should appear in `diyaccounting-ga4.analytics_523400333.events_*`
  (`bq --project_id=diyaccounting-ga4 --location=europe-west2`). No event of that name has
  ever reached the export. **Source**: none. **Owner**: Claude Code (read-only query).
  **Model**: Haiku. Blocked on a live sale.
## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
