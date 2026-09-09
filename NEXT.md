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

Nothing. Batch 13 and the spreadsheets behaviour role merged to main on 2026-09-08 (PR #154);
the follow-ups it left are B61, B58, B30q, B60 and B59 below. The operator's standing
instruction: no board item enters "in flight" without their word.

## Ready: Claude Code

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
- [ ] **B58. The SBOM check's KEV match over-matches.** `sbom.yml`'s first run on main
  (34284850847) failed with "37 SBOM component(s) matched CISA's Known Exploited
  Vulnerabilities catalogue": the step compares a package's bare name with a KEV entry's
  product field, and generic names collide, so the workflow fails every push to main.
  Narrow the match in `sbom.yml`'s inline script to entries whose `vendorProject` or `product`
  names an npm package (or drop KEV for the GitHub advisory database `npm audit` already
  consults, which knows package identities), and make a match list the pairs in the summary;
  and give the workflow a path filter (its four runs since the merge were all docs-only pushes to main, all failed).
  Starts on the operator's word. **Source**: B52f, `sbom.yml`. **Owner**: Claude Code.
  **Model**: Haiku.
- [ ] **B61. Prod's environment deploy of the cost panel failed on two prod-only steps.** Main's
  environment deploy after the merge (34284851371) failed twice and rolled `prod-env-AnalyticsStack`
  back to its pre-batch state, so none of batch 13's analytics work is live on prod yet (the
  app deploy succeeded). (a) `cost-CostExportStack` in the management account: the FOCUS
  bucket policy names the reader roles as principals and S3 answers "Invalid principal in
  policy" because `prod-env-cost-focus-copy-role` did not exist yet; grant the two account
  roots as principals with a `Condition` on `aws:PrincipalArn` naming the two role ARNs
  instead. (b) `prod-env-AnalyticsStack`: `AWS::CE::AnomalySubscription` with an SNS
  subscriber needs `Frequency: IMMEDIATE` ("Daily or weekly frequencies only support Email");
  set it in `CostBudgetsAndAnomalyMonitor.java`. Neither runs on ci (the export job is gated
  to prod, ci has no anomaly monitor), so the proof is the environment deploy of main after
  the fix. Starts on the operator's word. **Source**: run 34284851371. **Owner**: Claude
  Code. **Model**: Haiku.
- [ ] **B30q. The three CIS alarms fire on the deploy itself.** Issues #155, #156 and #157
  (`prod-env-cis-s3-bucket-policy-changes`, `-iam-policy-changes`, `-unauthorized-api-calls`) and
  #158 (`-route-table-changes`) opened at 22:28 to 22:42 UTC on 2026-09-08 as main's environment deploy put bucket and IAM
  policies and one call was refused, all by the deploy's own roles. In
  `SecurityDetectionStack.java`, exclude the deploy principals from the three metric filters
  (`$.userIdentity.sessionContext.sessionIssuer.userName` not `github-deploy-role` and not the
  `cdk-hnb659fds-*` bootstrap roles), so the alarms watch for a person or an unknown
  principal, and say which of the fourteen filters need the same exclusion. The three issues
  close as deploy-caused once the tune is on main. Starts on the operator's word. **Source**:
  issues #155 to #158; B52f. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B60. The alarm triage role cannot read alarms.** Every triage run that executed on
  2026-09-08 (#152, #156, #157) failed at `scripts/resolve-alarm-evidence.mjs` with
  `prod-env-alarm-triage-role` "not authorized to perform cloudwatch:DescribeAlarms", before
  Claude Code on Bedrock ran, so the chain has produced no triage and spent nothing since the
  role was scoped. Grant the evidence script's reads (`cloudwatch:DescribeAlarms`,
  `DescribeAlarmHistory`, the Logs Insights start and get calls on the alarm's log groups) to
  the triage role where it is defined (`grep -rn alarm-triage-role infra/main`), and check
  whether alarm #157's `AccessDenied` datapoint was this very denial. Starts on the operator's
  word. **Source**: the alarm-triage runs of 2026-09-08. **Owner**: Claude Code. **Model**:
  Haiku.
- [ ] **B59. The alarm triage runs three times per issue.** `alarm-triage.yml` triggers on
  `issues: [opened, labeled]`, and the opener applies two labels, so every alarm issue starts
  three runs: two cancel or skip each other and one failed on each of #152, #156 and #157.
  Trigger once (`labeled` with `github.event.label.name == 'alarm'` only, or `opened` alone if
  the opener labels in the same call) and read the failed run's log for the triage's own
  fault. Starts on the operator's word. **Source**: the alarm-triage runs of 2026-09-08.
  **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B62. Every ci set leaves its BooksStack standing.** `app/functions/infra/selfDestruct.js`
  deletes the app stacks from a fixed list of `*_STACK_NAME` variables that has no
  `BOOKS_STACK_NAME`, so the self-destruct leaves `<set>-app-BooksStack` behind (ci-clauddf1b's
  stands alone since 21:44 UTC on 2026-09-08, ci-claud87a7's since 10:5x) until `destroy-ci.yml`
  sweeps it, and the sweep spares whichever set is last-known-good. Add the Books stack to the
  self-destruct's order and environment (where the other names are set in the CDK
  SelfDestructStack). `ci-claud87a7-app-ApiStack` also sits DELETE_FAILED since 14:37 UTC on its
  Cognito authorizer ("InternalFailure" from ApiGatewayV2); the sweep's retry step at 02:34 UTC
  on 2026-09-09 is the first chance to see it go, and if it does not, delete with
  `--retain-resources` and say so. Starts on the operator's word. **Source**: the board's
  deployment check, 2026-09-09. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B10.4. ITSA sandbox proof: one quarterly update filed.** Business Details, Obligations
  and the cumulative period-summary POST are on main behind the environments gate
  (`hmrcItsaBusinessDetailsGet.js`, `hmrcItsaObligationsGet.js`,
  `hmrcItsaSelfEmploymentPeriodPost.js`). Create an HMRC sandbox test user with a
  self-employment business through the create-test-user API, run the three against
  test-api.service.hmrc.gov.uk from a ci set with the `Gov-Test-Scenario` values
  `_developers/hmrc/ITSA_SPIKE.md` names, and record the accepted update's response in the
  simulator. Unblocks B11. No ci set stands; one comes from `gh workflow run deploy.yml -f
  environment-name=ci` on main, on the operator's word. **Source**: BACKLOG 10; issues #16,
  #20. **Owner**: Claude Code. **Model**: Sonnet.

- [ ] **B63. Prod's DIYA-GL client and behaviour role for the spreadsheets ci case.** The
  spreadsheets session's operator decision of 2026-09-09: its ci pages test against Submit's
  prod, minting their `spreadsheetsBehaviour` user in the prod pool through
  `prod-env-spreadsheets-behaviour-role`, and toggling native sign-in on the DIYA-GL client
  for the run the way the deploy does. Four changes, all IaC: (1) in `IdentityStack.java`
  `buildBooksUrls`, prod's DIYA-GL client adds the five `ci-spreadsheets.diyaccounting.co.uk`
  callback and logout URLs (books/, bst, ltd, se, taxi) beside the live host's; (2) in
  `SubmitApplication.java`, prod's `booksAllowedOrigins` (and so the billing return list)
  adds `https://ci-spreadsheets.diyaccounting.co.uk`; (3) the spreadsheets behaviour role, ci
  and prod, gains `cognito-idp:DescribeUserPoolClient` and `UpdateUserPoolClient` on the
  pool; (4) `scripts/toggle-cognito-native-auth.js` takes a client selector (`--client books`)
  so their run never touches the app client. The proof is the environment deploy of main;
  one line in `~/.claude/inboxes/spreadsheets.md` as each lands. Starts on the operator's
  word. **Source**: the spreadsheets inbox, 2026-09-09 00:23 and 00:28 UTC. **Owner**: Claude
  Code. **Model**: Sonnet.

## Ready: operator

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

- [ ] **D1. The prod sweep's first scheduled proof.** The 04:11 UTC scheduled deploy of main on
  2026-09-09 (main is four docs commits past ebaeb7de, so it makes a new set) must retire the
  set it replaces (prod-ebaeb7d) in the same run; the board of that day reads the
  destroy-previous job. **Source**: B53c. **Owner**: Claude Code. **Model**:
  Haiku. Blocked on the date.
- [ ] **B11. ITSA phase 2: annual summaries and the final declaration.** The annual submission
  and the final declaration (crystallisation) endpoints, then the recognition application and
  the finder listing, which follow BACKLOG 11a's parked questionnaire. An Opus design pass
  first, since the annual summary carries the whole year's figures and the books import
  (`PLAN_SUBMISSION_MCP.md`) is the natural source. **Source**: BACKLOG 11. **Owner**: Claude
  Code. **Model**: Opus design, then Sonnet. Blocked on B10.4.
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
