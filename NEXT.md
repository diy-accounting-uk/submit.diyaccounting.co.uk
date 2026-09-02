# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-112b1ce, the only app stack set standing.** Each extra
`prod-*-app-*` set left after a merge costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

- [ ] **Confirm a `purchase` event lands.** GA4 still shows "No stream data detected"
  for `purchase` property-wide — expected while no paid flow has completed since
  collection was restored (2026-08-31), but confirm rather than assume once the
  funnel has run a few days (GA4 property 523400333, or BigQuery
  `analytics_523400333`).
- [ ] **compliance and stack-drift schedule revival — weekly cron proof remains.** Both
  revival runs are green (compliance 10/10 checks; stack-drift "all in sync" with three
  stacks correctly filtered as `DRIFTED_BENIGN` on its first noise-filtered run).
  `verify-backups`' daily cron proved itself: after missing its 06:00 slot on
  2026-08-31 it self-fired at 13:17 UTC the same day (normal GitHub schedule drift) and
  passed. Claude Code: confirm the Monday 2026-09-07 06:00 UTC crons fire on their own
  before closing; watch `codeql` on 2026-09-06 and revive the same way if it misses
  again.
- [ ] **Manual `certbot renew` in the week of 2026-11-29** (run
  `aws sso login --sso-session diyaccounting` first; command in `_developers/SETUP.md`).
  The weekly launchd renew agent is wired, but both AWS profiles it needs are SSO-backed
  and cannot refresh unattended, so the run that matters needs a live session.
- [ ] **(B43) Cost optimisation, `PLAN_COST_OPTIMISATION.md`: steady-state prod
  $253.01 → $64.77/month before VAT once 43.1–43.4 land.** Provisioned concurrency stays
  by operator decision. Each item is a PR; every merge to main is a prod deploy, so the
  four merge as one batch.
  - [ ] **(B43.1) Exclude `GetRecords` from CloudTrail DynamoDB data events.** Advanced
    event selector in `ObservabilityStack.java`; no detector reads it. $171.99 → $6.75,
    saves $165.24. Effort S.
  - [ ] **(B43.2) One durable Cognito test user instead of one per run.** Rotate its
    password in `scripts/enable-cognito-native-test.js` and `disable-…`. $9.80 → $0.80,
    saves $9.00. Effort S/M.
  - [ ] **(B43.3) One composite alarm per stack instead of per function.** The
    alternative named in `PLAN_ALARM_CONSOLIDATION.md`; 26 → 8 composites, 151 standard
    stay. $28.10 → $19.10, saves $9.00. Effort M.
  - [ ] **(B43.4) Drop `deployment-name` from the behaviour-test metric dimensions** so
    the `prod-submit.diyaccounting.co.uk` namespace stops growing 13 series per deploy.
    $10.35 → $5.35, saves about $5.00. Effort S.
- [ ] **Merge the `invoice.paid` fix once the operator says when.** Live Stripe
  invoices on API version `2026-01-28.clover` carry the subscription id at
  `parent.subscription_details.subscription`, not `invoice.subscription`, so every
  real renewal currently skips token refresh. Fix is on a PR awaiting a merge
  decision, held because each code merge to main is a full prod deployment.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
