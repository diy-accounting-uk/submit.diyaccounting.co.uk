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

Batch 13 gathers on `claude/b13-board` (local, from main at 5c28d639); one push and one PR when
its tracks are merged and green, and that push's ci set serves B10.4, O22 and O27. Nothing is
pushed to a branch while its deploy runs.

| Items | Agent | Model | Worktree |
|---|---|---|---|
| B52f (security panels: findings, lifecycle, SBOM, CIS metric filters, WAF, rotation) | security | Sonnet | `agent-ae70b2f1c409d5755` |
| B52g (the operator page, the snapshot Lambda, the `operator` bundle, `experiments.toml`) | page | Sonnet | `agent-acfb9c2c058707764` |
| B52h, B52j, B52k (export and index, retention and operator effort, compliance) | analytics | Sonnet | `agent-a7d9918957582319f` |
| B50a (ci's DIYA-GL client keeps native sign-in on when the toggle disables it; applied to the ci pool) | on the batch | Haiku | — |
| B56 (the two remaining CodeQL redirect alerts: the return URL is built from the allow-list origin) | on the batch | Haiku | — |

## Ready, unblocking others

- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34;
  issue #15. **Owner**: Operator. **Model**: none.
- [ ] **O25. Say yes to the FOCUS cost export from the management account.** The cost panel
  needs an AWS Data Exports FOCUS 1.2 export from account 887764105431 into the analytics
  lake, a write in the management account with a small monthly charge for the export bucket.
  A yes here, and whether it goes in `root.diyaccounting.co.uk`'s CDK or this repo's
  environment deploy through the management-account role. Unblocks B52e. **Source**: BACKLOG
  52; plan row D7. **Owner**: Operator. **Model**: none.
- [ ] **O27. Examine the three VAT read pages on ci.** Liabilities, payments and penalties are
  on main, ci only, on every bundle. Open them on a standing ci set, read each against the
  HMRC figures the sandbox returns, and say what reads wrong or that they can go to prod.
  Unblocks B17b. **Source**: BACKLOG 17b; issue #19. **Owner**: Operator. **Model**: none.
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
- [ ] **B52e. Cost panel.** The FOCUS 1.2 Data Export O25 approves, into the lake; the
  budgets and the anomaly monitor from `_developers/archive/PLAN_COST_INSTRUMENTATION.md`;
  cost per submission as the unit figure. **Source**: BACKLOG 52; plan row D7. **Owner**:
  Claude Code. **Model**: Sonnet. Blocked on O25.
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
