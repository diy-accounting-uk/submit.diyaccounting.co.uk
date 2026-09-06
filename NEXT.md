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

Batch 10 is PR #147 (`claude/b10-board`: the triage resolver, the prod filing gate, the ITSA
dashboard, the catalogue-paths test and the YouTube upload on gcloud credentials). Main's prod
deploy from the PR #146 merge (run 34062870619) is finishing its retire of prod-cfb43ee.

- [ ] **B30o. Prove the triage chain on prod.** Relabelling #138 `triage` at 22:03 UTC on
  2026-09-06 (run 34062903265) ran the fixed job as far as the evidence resolver, which stopped
  it with "No alarm named prod-0967fab-app-account-stack-health was found", because the set was
  retired and because the script never asked CloudWatch for composite alarms, so every
  `-stack-health` alarm looked missing. PR #147 fixes both: a missing alarm becomes evidence
  (`alarmFound: false`, the deployment's log-group prefix, the window, a note) and the triage
  runs on. After the merge, the operator labels the next open alarm issue `triage` (any set, live
  or retired). Verified when that run posts the guardrail's anonymised comment. **Source**:
  BACKLOG 30; issue #18. **Owner**: Claude Code, then the operator labels.
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
- [ ] **B34.6a. Companies House accounts filing through the XML Gateway, everything that
  needs no credentials.** Design pass in the accounts-filing design agent's worktree, branch
  `claude/ltd-accounts-design` (Opus): `PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md` from the public
  schemas on xmlgw.companieshouse.gov.uk (GovTalk envelope, form submission, accounts document)
  and the FRC's FRS 105 taxonomy, covering the iXBRL generator for micro-entity accounts with
  offline validation, the envelope and presenter authentication, the submit-then-poll flow, a
  simulator route that validates against the schemas and returns the documented responses, the
  page and activity, and a Sonnet build brief. The build follows in the next wave and its
  behaviour suite runs in the simulator lane. **Source**: BACKLOG 34b; issue #15. **Owner**:
  Claude Code. **Model**: Opus design, then Sonnet.
- [ ] **G6. What was the `purchase` event on submitVat.html at 16:47 UTC on 2026-09-03?**
  The GA4 export holds it with item "VAT Return" and transaction id 096059144348, seventeen
  minutes after Stripe took a £0.99 subscription payment (pi_3UBdVHCD0Ld2ukzI0mcS9QU3). Read-only
  lookup in the event-lookup agent's worktree (Sonnet), the way
  `.claude/skills/vat-submission-failure-alarm-user-lookup` works: was it a live customer's VAT
  submission, did HMRC accept it, and is it the same customer as the subscription; report
  without personal data. **Source**: operator, 2026-09-07. **Owner**: Claude Code.
- [ ] **A1. Stop the release, false positive, alarm, issue, triage, close cycle on
  auto-destructing sets.** On main (PR #146). First real check passed: main's deploy retiring
  prod-cfb43ee wrote `/submit/prod/alarm-silence/cfb43ee` at 22:52 UTC on 2026-09-06 and no
  alarm issue or Telegram message named the set. Verified when the next ci self-destruct
  passes the same way (ci-claud9501, on its schedule or the 02:34 sweep). **Source**: operator,
  2026-09-06. **Owner**: Claude Code.

## Ready: Claude Code

- [ ] **G4. GA4 `purchase` events carry the money.** Both purchases in the export (the £45
  Company package on the spreadsheets site, pi_3UBX5pCD0Ld2ukzI0ASK1VDj, and the £0.99 submit
  subscription, pi_3UBdVHCD0Ld2ukzI0mcS9QU3, both 2026-09-03) reached GA4 with revenue 0. Send
  `value` and `currency` (and the item price) on every `purchase` from both sites, from the
  Stripe session or price the page already knows, so GA4 reports income. Unit tests on the
  event builders. **Source**: operator, 2026-09-07. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **G5. One event per thing: a VAT submission is not a purchase.** submitVat.html sends
  GA4 `purchase` with item "VAT Return" when a return is filed, which is a submission, not a
  payment. Define the events: `purchase` only for a Stripe checkout or subscription (bundle
  name, value, currency), a distinct event for a filed VAT return, and check whether the
  subscription checkout on the submit site sends `purchase` at all (the export shows none
  for the £0.99 subscription's success page). Land the events in `web/public/lib/analytics.js`
  and wherever the pages call it, with unit tests. **Source**: operator, 2026-09-07. **Owner**:
  Claude Code. **Model**: Sonnet.
- [ ] **G7. Streaming export for the GA4 property.** The property has daily export only
  (`events_YYYYMMDD`, no intraday table), so an event shows in BigQuery the next day. Turn on
  streaming export on the BigQuery link with `scripts/ga4-property-sync.js` (the service
  account holds admin; dry run first, then apply), so events land in `events_intraday_*` within
  minutes. **Source**: operator, 2026-09-07. **Owner**: Claude Code. **Model**: Sonnet.


## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O20. Decide the price of the two Companies House filing activities.** They sit on the
  free `default` bundle. `PLAN_COMPANIES_HOUSE_REST_FILING.md` Q1 lists the options: leave them
  free (Companies House charges nothing for either filing), a new `resident-company` bundle with
  its own Stripe product, or fold them into `resident-pro`. Tell Claude Code the answer; the
  catalogue and Stripe changes follow. **Source**: BACKLOG 34; issue #15. **Owner**: Operator.
- [ ] **B17a.5. Publish the videos** on https://www.youtube.com/@DIYAccountingSubmit. All
  three recordings are ready and downloaded to the paths `videos/publish.json` names
  (view-obligations run 33952515598, submit-return run 33953044775, view-return run
  34058244686). Batch 10 (15f18373) makes `scripts/youtube-upload.js` use gcloud's
  Application Default Credentials, and the YouTube Data API is enabled on `diyaccounting-ga4`
  (2026-09-06). The one step only the channel owner can do: `gcloud auth application-default
  login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/youtube.upload,https://www.googleapis.com/auth/youtube.force-ssl`
  in a terminal, approve in the browser, then tell Claude Code, which runs
  `npm run video:publish -- --check`, the unlisted upload, and `--public` after the operator's
  look. **Source**: BACKLOG 17a. **Owner**: Operator for the consent, then Claude Code.

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
