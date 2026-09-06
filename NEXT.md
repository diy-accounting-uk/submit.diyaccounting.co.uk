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

**Prod runs deployment prod-3778d47 (main's deploy of the PR #139 merge, run 34028434127,
green through every suite; its last job is destroying prod-6c85118). prod-0967fab is the one
spare: a main deploy's sweep keeps any set younger than eight hours and removes one older
spare per run, so the daily scheduled deploy clears it.** A main deploy retires the previous set itself; a `prod-*-app-*` set
left standing by anything else costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

**Freeze in force since 10:30 UTC on 2026-09-06** (see Discipline below): no push to origin and
no workflow dispatch until the operator lifts it in their own words. Local work continues and
fixes are proposed in the reply. What that leaves in motion:

- The automated sandbox sign-in for the filing suites (local branch
  `claude/companies-house-filing-ci-sandbox`, ef091559) is parked: it needs a robot Companies
  House account with an authenticator secret, which the operator does not want. The branch
  stays local, unmerged, in case that changes.
- Batch 6 (PR #139: the bundle-expiry fix, the triage day guard, the index custom-resource
  fix and the ci client id) merged at 10:48 UTC. Main's environment deploy (run 34028434110)
  is green and created the ci filing secret; main's deploy (run 34028434127) passed every
  suite, including the two that prove the bundle-expiry fix, and is destroying prod-6c85118 as
  its last job. The operator lifts the freeze when that job is green.
- Batch 7 is `claude/b7-board` (worktree `.claude/worktrees/b7-board`), seeded with the OpenAPI
  regeneration that adds the seven Companies House filing routes (f35ade31). The local
  tracks below land on it as they finish; it is pushed once, after the freeze lifts.

Batch 7 tracks, dispatched to worktrees at 11:10 UTC on 2026-09-06, each merged into
`claude/b7-board` by the coordinator when its tests are green:

- [ ] **B10.2 / B10.3. ITSA Obligations, then the quarterly update filing (SE Business).**
  Two commits in the B10.1 pattern (Lambda, simulator, page, catalogue entry behind the
  `environments` gate, CDK wiring, simulator behaviour suite, OpenAPI), paths from
  `_developers/hmrc/ITSA_SPIKE.md`. **Source**: BACKLOG 10; issues #16, #20. **Owner**: Claude
  Code. **Model**: Sonnet.
- [ ] **B33a. One leaf CDK stack in TypeScript, synth diffed against the Java template.**
  `cdk-typescript/` with a synth and diff script, report in
  `_developers/CDK_TYPESCRIPT_SPIKE.md`; no deploy. **Source**: BACKLOG 33a. **Owner**: Claude
  Code. **Model**: Sonnet.
- [ ] **B40b. Work `_developers/backlog/PLAN_REDUCE.md` top to bottom**, one commit per item,
  plan file updated in each. **Source**: BACKLOG 40b. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B21a / B23a. Support mail analysis** in `_developers/SUPPORT_MAIL_ANALYSIS_2026-09.md`:
  six months of support threads classified with the template-reply share, and a 50-thread
  sample across the archive with the first ten article topics; no personal data in the
  document. **Source**: BACKLOG 21a, 23a. **Owner**: Claude Code. **Model**: Sonnet.

Batches 4 (PR #136), 5 (PR #137) and 6 (PR #139) are merged. The items below are code complete
on main and each names the event that verifies it.

- [ ] **B30n. Triage anonymises rather than blocks, and opens a draft PR when it can name the
  change.** Operator decision 2026-09-06, reversing the dispatch choices: the Bedrock guardrail's
  PII action becomes ANONYMIZE (the triage input is HMRC's and CloudWatch's, not ours to
  control, so a blocked comment helps nobody), the workflow posts the guardrail's anonymised
  output, and the draft-PR path from `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md` Part 6.2 ships with
  `contents: write` and `pull-requests: write`. **Source**: BACKLOG 30; issue #18. **Owner**:
  Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-5` (0fa136da): every guardrail entity and
  regex is ANONYMIZE, the workflow posts `outputs[0].text` with a one-line note when the
  guardrail intervened, and a fenced diff in the posted comment becomes branch
  `claude/triage-<issue>` and a draft PR when it applies cleanly. The first ci run posted
  Bedrock's 404 as if it were triage, so the redaction script now fails the run on a result
  carrying `is_error`, and nothing is posted. Verified through B30o's proof run.
- [ ] **B43b. ci self-destruct leaves the Companies House stack behind.** The self-destruct
  Lambda's deletion list (`SelfDestructStack.java` environment, `app/functions/infra/
  selfDestruct.js`) predates `CompaniesHouseStack`, so every ci set leaves
  `ci-<slug>-app-CompaniesHouseStack` standing, and `destroy-ci.yml`'s sweep only discovers
  deployments by their public, published and last-known-good names, so the orphans are
  invisible to it. Three stand now: ci-claudff66, ci-claudf375, ci-claud063e (two Lambdas,
  aliases, alarms and log groups each). Fix both lists, with unit and CDK tests. **Source**:
  board render 2026-09-06; BACKLOG 43. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-5` (3e8fe230): the Lambda deletes the
  Companies House stack after the HMRC stack, pinned by `SelfDestructStackTest`, and the sweep
  scans eu-west-2 for `ci-*-app-` prefixes it would otherwise not see. ci-claudff66 also has an
  `ApiStack` in DELETE_FAILED (its Cognito authorizer is still referenced by the Companies
  House routes), so that set needs the Companies House stack deleted first and the ApiStack
  deleted again. On the operator's yes of 2026-09-06 the three Companies House stacks were
  deleted and ci-claudff66's ApiStack delete was requested again. ci shows no
  orphan stack now; verified when ci-claudf107, the next set, goes whole at its self-destruct
  time of 11:53 UTC on 2026-09-06.
- [ ] **B32.4 remainder. The probe upload step fails for the three read suites.** The renamed
  `probe-test.yml` fired on its own at 22:22 UTC on 2026-09-05 (run 33995729733) with all five
  scheduled suites, and every suite passed, so the schedule is verified. The three "upload web
  test results" jobs for `getVatLiabilitiesBehaviour`, `getVatPaymentsBehaviour` and
  `getVatPenaltiesBehaviour` then failed: the publish step in `probe-test.yml` copies
  `web/public/tests/test-reports/web-test/html-report/` to S3 and that directory does not exist
  for those suites, so the scheduled run reports failure and counts against
  `prod-env-github-probe-failed`. Make the step upload the HTML report only when the suite
  produced one, or carry the report through the artifact the same way the two older suites do.
  Verified when the next scheduled run is green end to end. **Source**: BACKLOG 32; issue #19.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-4` (58051590, aa57a597). The cause was the
  four newer suites' `testId` lacking the `Behaviour` suffix, so the publish script looked for
  the html-report under the wrong directory; the ids now equal the suite names. The scheduled
  prod matrix drops the three read suites and `deploy.yml` runs the gated suites only on ci.
  Verified when the first scheduled probe run after the PR merges is green end to end.
- [ ] **B30k. ci alarms stop opening GitHub issues.** Every ci alarm issue of 2026-09-05
  (#128, #129, #131) was test churn on a ci set that self-destructs within hours, and ci alarms
  already reach Telegram through the same rule. In `OpsStack.java` the
  `<deployment>-app-alarm-state-change` rule targets both the Telegram forwarder and
  `alarmToGithubIssue`; add the issue Lambda as a target only when `props.envName()` is
  `prod` (the Telegram target stays for both), and pin it with a CDK test that a ci synth has
  one target and a prod synth two. **Source**: BACKLOG 30; operator decision 2026-09-05.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-4` (fe4eff98): the issue Lambda is a rule
  target only when the environment is `prod`, pinned by `OpsStackTest` (one target on ci, two on
  prod). Verified when the next ci alarm reaches Telegram and opens no issue.
- [ ] **B30j. Stop the hourly bundle-capacity reconcile scanning the bundles table.**
  CloudTrail for 2026-09-05 shows `prod-env-dynamodb-customer-table-scan` (#95) re-entering
  ALARM every hour at about :35 past, and each one is
  `app/functions/account/bundleCapacityReconcile.js` running `Scan` on `prod-env-bundles` on
  its `rate(1 hour)` schedule (AccountStack); the deployment role's scans stopped with B30e
  and the last of them was migration 006 at 20:05 UTC. The scan detector exempts no caller by
  design, because app code should never scan a customer table; the detector is right and the
  job is wrong. Design pass: count bundle
  take-up without a scan (a sparse GSI on `bundleId` queried per catalogue bundle, or a counter
  item the grant and expiry paths maintain), then rebuild the reconcile on it; CDK test on the
  index or the counter, unit test on the reconcile. The operator closed #95 on 2026-09-05;
  the next hourly scan opens a fresh family issue, which is the one to close when this lands.
  Verified when `prod-env-dynamodb-customer-table-scan` stays in OK across a day. **Source**:
  BACKLOG 30; CloudTrail lookup 2026-09-05. **Owner**: Claude Code. **Model**: Opus design,
  then Sonnet.
  **Track**: `PLAN_BUNDLE_CAPACITY_RECONCILE.md` is on `claude/board-batch-4` (bd6d402e): a
  sparse GSI `bundleId-expiry-index` queried once per capped bundle, no counter, no backfill,
  the schedule stays hourly. Code complete on `claude/board-batch-4` (6ebea8ee, 6dca64bb,
  a13db2db, ce25b350): the index, the reconcile's per-bundle count query, the Scan grant gone,
  `restore-test.yml` reading `ItemCount` instead of scanning the source table, and the pass
  repository's scan fallback removed. The index and the new reconcile land in one deploy; a
  reconcile run against a still-building index throws and the next hourly run succeeds.
  Verified when `prod-env-dynamodb-customer-table-scan` stays OK for a day after the merge.
  On prod the new reconcile ran hourly from 07:15 UTC on 2026-09-06 and threw "the table does
  not have the specified index" until the environment deploy created the index at 09:15 (that
  is #138); the 10:15 run is the first with the index in place, and the scan alarm has been OK
  since 07:01.
  **Remainder, a prod regression since the index landed at 09:15 UTC:** the grant path
  (`bundlePost.js` `grantBundle`) builds a bundle with `expiry: ""` for bundles with no
  timeout, and the repository spread that into the item, so DynamoDB now rejects every grant
  of a non-expiring bundle: "The AttributeValue for a key attribute cannot contain an empty
  string value. IndexName: bundleId-expiry-index, IndexKey: expiry". Main's deploy of
  prod-6c85118 (run 34023929108) failed its `tokenEnforcementBehaviour-prod` and
  `generatePassActivityBehaviour-prod` suites on it, and `prod-6c85118-app-pass-post` logged
  the rejection. Fixed on main (091924dd: a bundle with no expiry is stored without the attribute;
  unit test). #140 is the `prod-6c85118-app-api-5xx` those rejections raised at 09:52;
  main's deploy of the merge (run 34028434127) passed both suites.
- [ ] **B34.3a. Companies House REST filing: registered office and registered email changes.**
  The REST filing API covers transactions, registered office address, registered email address
  and insolvency, not accounts. Build those two changes as OAuth user-authorised filings against
  `api-sandbox.company-information.service.gov.uk` with the "DIY Accounting Submit - test"
  developer-hub application the operator created (an OAuth client, no key). **Source**: BACKLOG
  34; issue #15; Cowork research 2026-09-05. **Owner**: Claude Code. **Model**: Opus design, then
  Sonnet.
  **Track**: `PLAN_COMPANIES_HOUSE_REST_FILING.md` is on `claude/board-batch-4` (ca7a800a):
  eight Lambdas, tokens in the browser session like HMRC's, both activities free on `default`
  behind the environments gate, three sequential Sonnet tracks. Track 1 (auth plumbing) is
  merged (a88c2459: token exchange Lambda with the client secret scoped to it alone, callback
  page, simulator OAuth routes, env and CDK plumbing; `COMPANIES_HOUSE_CLIENT_ID` is blank in
  `.env.ci` and `.env.prod` until the operator fills it). Track 2 is merged (1a8356a2,
  98cd2bec: the seven filing Lambdas, simulator scenarios and system test; the four
  registered-office and registered-email Lambdas carry shorter deployed names to fit AWS's
  64-character cap, URL paths unchanged). Track 3 is merged (d7470848, 223cf553: the two
  filing pages, the service module, both activities on `default` behind the gate, browser and
  behaviour suites green on the simulator; the in-browser TOML parser reads one-line arrays
  only, so catalogue arrays stay on one line). The two suites run on the simulator only;
  against the real sandbox a person has to sign in with a second factor, so the sandbox proof
  is the operator's own click-through on ci (O11). Verified by that click-through.
- [ ] **B30i. Alarm triage: Claude Code headless in Actions, on Bedrock.** `alarm-triage.yml`
  runs on `issues: opened` for issues labelled `alarm` and on the `triage` label, reads the
  alarm from the issue body, derives the evidence with B30h's mapping, and runs Claude Code on
  Bedrock (`eu.anthropic.claude-sonnet-4-5-20250929-v1:0`, `--max-turns 12`, plan mode, a
  read-only tool allow-list) behind a three-runs-a-day guard, `concurrency: alarm-triage` and a
  timeout. Its one write is an issue comment, after a regex deny-list and a Bedrock guardrail
  that blocks PII; no PR permissions. The read-only triage role, the guardrail and a daily USD 5
  Bedrock budget whose action attaches a Bedrock deny live in the Observability stacks. Design
  in `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md` Parts 6 to 8. **Source**: BACKLOG 30; issue #18;
  operator decision 2026-09-05. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-4` (0501fc94, a28ab599); the workflow is a
  quiet no-op until `SUBMIT_ALARM_TRIAGE_ROLE_ARN` is set on the environment. Remainder: the
  budget action's subscriber, `<env>-env-bedrock-budget-alerts` in `ObservabilityUE1Stack`, has
  no reader yet (B30m). The `triage` label exists; the role variable and the proof run are
  B30o; the anonymise and draft-PR reversal is B30n. Verified through B30o.
- [ ] **G2c. Plumb the measurement id through `submit.env` and assert a `purchase` row in ci.**
  Replace the hardcoded `G-T81V5NL5MB` in `web/public/lib/analytics.js` with a value read from
  `submit.env` (generated by `deploy.yml`/`deploy-app.yml` from the environment variable), pass
  `GA4_BIGQUERY_DATASET_ID` for ci into `app/functions/analytics/ga4EventExportPull.js`'s
  environment, and extend `paymentBehaviour-ci` (or a post-run step in `probe-test.yml`)
  to query the ci dataset for a `purchase` event with the run's transaction id. Behaviour-test
  browsers stub `gtag.js` and `/g/collect` unless `DIY_SUBMIT_ALLOW_REAL_ANALYTICS=true`, and
  Playwright's headless shell reports `HeadlessChrome`, which GA4's bot filter excludes, so the
  assertion run needs a browser that does not. The ci property exists: 552917343, measurement
  id `G-DV0SDVEZWC`, dataset `analytics_552917343`; the sync's dry run does not find the
  BigQuery link it created, which the track fixes in `scripts/ga4-property-sync.js`.
  **Source**: none. **Owner**: Claude Code. **Model**: Sonnet.
  **Track**: code complete on `claude/board-batch-5` (a8304e49, e7d69754). `analytics.js` reads
  `GA4_MEASUREMENT_ID` from `submit.env`; the environment file wins where it is set (prod pins
  `G-T81V5NL5MB`) and the `SUBMIT_GA4_MEASUREMENT_ID` variable fills it otherwise (ci). The ci
  export dataset is `analytics_552917343`. The daily export lags about a day, so the payment
  suite on ci fires a real purchase event and asserts BigQuery for an earlier run's Stripe
  transaction (26 hours to 4 days old), skipping when none exists. Two fixes rode along: the
  sync read `bigQueryLinks` where the API says `bigqueryLinks`, and the content security policy
  allowed only `www.google-analytics.com` while GA4 collects on regional subdomains. Verified
  when a ci probe run after the merge finds a purchase row.
## Ready: Claude Code

- [ ] **B30p. One Telegram forwarder per environment, not per deployment.** Every deployment's
  `OpsStack` creates `<deployment>-app-activity-telegram` on the shared activity bus, so while
  two prod sets stand (the normal state between a main deploy and the daily sweep) every ops
  message reaches Telegram twice; the operator's screenshot of 2026-09-06 shows each alarm,
  stack event and the budget test doubled. Move the rule and the forwarder Lambda
  (`infra/main/java/.../stacks/OpsStack.java`, `activityTelegramForwarder.js`) to an
  environment stack so one rule reads the bus per environment, or gate the rule on the
  deployment being the last known good; CDK test that a synth of two deployments yields one
  forwarder. **Source**: BACKLOG 30; board render 2026-09-06. **Owner**: Claude Code.
  **Model**: Sonnet.


## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O12. Close #140 now and #138 after the 11:15 UTC reconcile run.** #140
  `prod-app-api-5xx` on prod-6c85118 was the bundle-grant rejection in B30j's remainder, and
  main's deploy of the PR #139 merge passed the suites that hit it. #138
  `prod-app-account-stack-health` on prod-0967fab was the reconcile erroring hourly between
  its deploy at 06:13 and the index's arrival at 09:15 on 2026-09-06; the 10:15 run was clean
  on both prod sets and both alarms have been OK since, so it closes once the 11:15 run is
  clean too. **Source**: board render 2026-09-06. **Owner**: Operator.
- [ ] **B17a.5. Publish the videos** on https://www.youtube.com/@DIYAccountingSubmit with
  titles and descriptions drafted from the captions. The prod recordings are workflow
  artifacts, each with mp4, vtt, transcript and stills and 30-day retention:
  `video-view-obligations-prod` on run 33952515598, `video-submit-return-prod` on run
  33953044775, and `video-view-return-prod` on run 34017736028 (the return on screen is the one
  filed off camera, Box 6 at £5,000). The ITSA Business Details recording is ci-only until the
  activity leaves the gate: `video-itsa-business-details-ci` on run 34002898819. **Source**:
  BACKLOG 17a. **Owner**: Operator (an upload via the YouTube Data API can follow once the
  pattern settles).
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
  since main's environment deploy of the PR #139 merge). Remaining: on a standing ci set
  (ci-claudf107 until 11:53 UTC on 2026-09-06, or the next push's), open the two filing
  activities on the ci site and take one change through the sandbox with your own Companies
  House sandbox sign-in. No credentials go into GitHub for this: Companies House filings need
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
- [ ] **O17 / B34.7. Automated Companies House sandbox sign-in for the filing suites, only if
  wanted.** Companies House has no HMRC-style create-test-user API: its test data generator
  makes companies only, and a sandbox user is a real account on
  identity-sandbox.company-information.service.gov.uk with an authenticator second factor. An
  automated ci run of the two filing suites therefore needs a throwaway sandbox account the
  operator registers, with its email as `TEST_COMPANIES_HOUSE_USER_ID`, its password as
  `TEST_COMPANIES_HOUSE_PASSWORD` and its authenticator secret as
  `TEST_COMPANIES_HOUSE_TOTP_SECRET` on the ci GitHub environment, plus the test application's
  REST key as `COMPANIES_HOUSE_SANDBOX_API_KEY` for creating the run's test company. The parked
  local branch `claude/companies-house-filing-ci-sandbox` (ef091559) has everything except the
  TOTP step, which Claude Code adds the way the Cognito lane computes its code. Claude Code
  asks before starting. **Source**: BACKLOG 34; issue #15. **Owner**: Operator decides, then
  Claude Code. **Model**: Sonnet. Blocked on the operator wanting it.
- [ ] **O9 / B47. Watch the revived weekly `compliance` and `stack-drift` crons fire on their
  own** on Monday 2026-09-07 06:00 UTC (`codeql` fired on its schedule on 2026-09-06, run
  34022009649). If one misses, revive it the same way as on 2026-08-31 and tell Claude Code.
  **Source**: BACKLOG 47. **Owner**: Operator. Date-gated: 2026-09-07.

## Blocked: Claude Code

- [ ] **B30o. Set `SUBMIT_ALARM_TRIAGE_ROLE_ARN` on prod and prove the triage chain.** ci is
  done: the variable points at `ci-env-alarm-triage-role`, and adding the `triage` label to
  #134 ran the whole chain (run 34016641016: role assumed, guardrail read, comment posted).
  The model call answered 404 until the Anthropic use-case form was submitted through
  `bedrock put-use-case-for-model-access` in both accounts on 2026-09-06. The re-run
  (34024132783) stopped at the day guard, which counted every workflow run including the ones
  the guard or the role check had stopped; on main (6db5a181, merged in PR #139 at 10:48 UTC on
  2026-09-06) the guard counts only runs whose `run-triage` job executed. Re-labelling #134
  with `triage` dispatches the workflow, so it waits for the freeze to lift. Prod's
  variable is set (`prod-env-alarm-triage-role` exists since run 34023929068 deployed the
  observability stacks). **Source**: BACKLOG 30; issue #18. **Owner**: Claude Code. **Model**:
  Fable (coordinator). Blocked on the freeze lift.
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
- [ ] **G3. Confirm a real `purchase` lands in prod** once G1 and G2c ship: the next live
  checkout should appear in `diyaccounting-ga4.analytics_523400333.events_*`
  (`bq --project_id=diyaccounting-ga4 --location=europe-west2`). No event of that name has
  ever reached the export. **Source**: none. **Owner**: Claude Code (read-only query).
  **Model**: Haiku. Blocked on G1, G2c and a live sale.
## Discipline

- **Freeze, 2026-09-06 10:30 UTC, operator's words:** "We need a freeze now you are creating
  noise with the deploys. Do not push to origin or run a github workflow until the freeze is
  lifted. You may work locally if you see a job fail but propose the fixes to me until the
  freeze is lifted." While it stands: no `git push`, no `gh workflow run`, no `gh pr create`,
  nothing that reaches GitHub Actions or AWS state; local commits, worktree tracks, reading
  logs and drafting are fine, and a failed job gets a proposed fix in the reply. It lifts only
  when the operator says so in their own words.
- **Why the freeze:** a push per landed track turned one batch into six ci deploys and several
  environment deploys in a morning, each able to open alarm issues and cancel each other
  through the deploy concurrency group. Outside a freeze, push once per batch of landed
  tracks, and prefer one dispatch that proves several things over several dispatches.
