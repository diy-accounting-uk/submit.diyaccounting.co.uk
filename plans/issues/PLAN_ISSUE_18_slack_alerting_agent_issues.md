# PLAN: Issue #18 (pre-migration #572) — Telegram alerting extensions + agent-raised GitHub issues

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/18
> Original body: (empty) — title "Alerting and monitoring in Slack with issue notifications and agents raising and assigning issues"
> **Scope decision 2026-04-22 (Q18.1): no Slack. Keep Telegram as the existing channel; deliver the "agents raising GitHub issues" feature directly via SNS→Lambda→GitHub API, no chat platform in the middle.**
> Existing plans:
> - `_developers/archive/PLAN_TELEGRAM_ALERTING.md` (existing channel — keep)
> - `_developers/backlog/ALARM_VALIDATION_STRATEGY.md` (1905 lines — what we alarm on)
> - `_developers/backlog/SLACK_INTEGRATION_PLAN.md` (281 lines — **shelved**; can reopen if Slack reappears later)

## Elaboration

The title mentioned Slack, but per 2026-04-22 decision (Q18.1) Slack is out of scope for now. What remains from the issue's intent:

1. ~~**Slack as an alerting channel**~~ — **dropped.** Telegram stays as the primary alert channel.
2. ~~**Issue notifications in Slack**~~ — **dropped** (was going to be zero-code via the official GitHub Slack app).
3. **Agents raising and assigning GitHub issues** — **kept.** When an alarm/anomaly fires, a Lambda opens a GitHub issue with a triage label and optionally assigns it. No chat platform in the middle; SNS → Lambda → GitHub API. Complements the existing Telegram pings (humans get a heads-up on Telegram; the durable record is the issue).

Optional extras worth considering alongside:
- **Telegram message with link to the auto-raised issue** — the existing Telegram forwarder already receives activity events; when `gitHubIssueRaiser` creates an issue, emit `issue.auto_raised` to the activity bus so Telegram posts a one-line pointer.
- **Close loop on issue close** — when an auto-raised issue is closed on GitHub, optionally post a Telegram confirmation.

## Likely source files to change

- New `app/functions/ops/gitHubIssueRaiser.js` — Lambda that consumes SNS alarm messages, opens a GitHub issue with a `triage` label, optionally assigns per a routing rule (e.g. payment alarms → @antonycc, bundle alarms → @antonycc, probe alarms → unassigned), and comments on a duplicate detection link. **Emits `issue.auto_raised` to the activity bus** so Telegram picks it up.
- `app/functions/ops/activityTelegramForwarder.js` — extend event-kind map with `issue.auto_raised` (one-line message with a link to the issue).
- `infra/main/java/.../stacks/OpsStack.java` — wire `gitHubIssueRaiser` into SNS.
- `infra/main/java/.../stacks/AlertingStack.java` (if it exists, else embed in OpsStack) — centralise SNS topics; ensure alarms publish to a single `alarms` topic that fans out to both Telegram (via the existing forwarder subscription) and gitHubIssueRaiser.
- Secrets: a GitHub App private key stored in Secrets Manager (preferred over PAT per Q18.2 recommendation).
- `_developers/backlog/SLACK_INTEGRATION_PLAN.md` — mark as shelved; reference this plan as the replacement direction.

## Likely tests to change/add

- Unit test `app/unit-tests/functions/gitHubIssueRaiser.test.js` — issue body templating + duplicate detection (don't raise a second issue if an open one with the same title exists in the last 24h).
- System test: trigger a test SNS message, assert the GitHub REST mock was called once with the expected body.
- Do NOT test against the real GitHub API in unit/system tier.
- Behaviour: manually confirm one real alarm → one real Telegram ping + one real GitHub issue in the `antonycc/submit.diyaccounting.co.uk` repo.

## Likely docs to change

- `_developers/backlog/SLACK_INTEGRATION_PLAN.md` — mark shelved with a pointer to this plan.
- `_developers/backlog/ALARM_VALIDATION_STRATEGY.md` — add the "what raises a GitHub issue vs what only pings Telegram" matrix.
- `_developers/archive/PLAN_TELEGRAM_ALERTING.md` — update with the new `issue.auto_raised` event kind.
- New `RUNBOOK_OPS_ALERTS.md` at project root — per-alarm response cheatsheet including which alarm raises an auto-issue.

## Acceptance criteria

1. A CloudWatch alarm firing publishes to the `alarms` SNS topic, which fans out to: Telegram (via existing forwarder), GitHub issue (for pre-tagged "raise-issue" alarms only).
2. Telegram posts include alarm name, severity, timestamp, link to CloudWatch, link to the auto-raised issue (if any), link to the runbook row.
3. GitHub issue body includes the same info plus the CloudWatch query that produced it, labels `triage` + `auto-raised`, and assignee per routing rule (defaulting to the on-call login).
4. Duplicate protection: a second alarm of the same name within 24 h comments on the existing open issue instead of opening a new one.
5. GitHub App (not PAT) used to raise issues; private key in Secrets Manager.
6. Closing an auto-raised issue emits a `issue.auto_resolved` event visible in Telegram (optional — nice-to-have).

## Implementation approach

**Recommended — three Lambdas, one topic, one human runbook.**

1. Set up the Slack app + webhook (Incoming Webhooks app or a proper Slack bot).
2. Install the official **GitHub for Slack** app in the Slack workspace; configure `#dev-notifications` channel to receive issue/PR events from this repo. (Covers feature 2 — zero custom code.)
3. Build `slackForwarder.js` for activity events → Slack.
4. Build `gitHubIssueRaiser.js` for alarms → GitHub issues, preferably as a **GitHub App** (richer permissions, revocable) not a PAT. Store app private key in Secrets Manager.
5. Alarm routing: a DynamoDB table or simple hardcoded map in the Lambda decides "this alarm raises an issue" vs "Slack only".

### Alternative A — just use SNS → Slack without the GitHub issue raiser
Defer the agent-raising-issues feature. Fastest path to "Slack alerting" but leaves the "agents raise issues" request unmet.

### Alternative B — GitHub Actions workflow_dispatch fired by SNS
Instead of a Lambda calling the GitHub API, have CloudWatch alarms trigger a `workflow_dispatch` via an AWS Lambda → GitHub API → Actions, and the Action opens the issue. Cleaner separation of concerns, but adds 20–40 s latency.

## Questions (for QUESTIONS.md)

- ~~Q18.1: Slack workspace~~ — **answered 2026-04-22: no Slack, keep Telegram only.**
- Q18.2: GitHub PAT vs GitHub App for the issue-raiser? (Recommendation: App — revocable, scoped, no human account dependency.)
- Q18.3: Routing rules for which alarms auto-raise issues — draft the initial matrix and confirm which assignee(s) should own which alarms.
- ~~Q18.4: Retire Telegram~~ — **moot: Telegram is the channel.**

## Good fit for Copilot?

Partial. The Slack + GitHub-issue Lambdas are bounded and scriptable — good for Copilot. The routing rules and runbook are opinionated — human.
