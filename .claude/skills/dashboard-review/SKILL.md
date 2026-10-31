---
name: dashboard-review
description: Read the whole prod operator dashboard (https://submit.diyaccounting.co.uk/operator/dashboard.html) from its snapshot and from the page the operator sees in Chrome, judge every panel, write one report to the private repository, and summarise it in the chat. Invoke when the operator says "review the dashboard", "dashboard review", "what does the dashboard say", or asks how the business is doing by the dashboard's numbers.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-55 Review the operator dashboard
- **Use when:** the operator asks for a review of the operator dashboard, what it says, or how the business is doing by its numbers.
- **Does:** The dashboard-review skill reads the prod snapshot from the analytics lake and the rendered page in the operator's own Chrome session. It judges each panel for movement, gaps and faults, writes one report to the private repository, and summarises it in the chat with a proposed NEXT.md row per fault.
- **Run:** `/dashboard-review`
- **Entry:** `.claude/skills/dashboard-review/SKILL.md`
- **Files:** .claude/skills/dashboard-review/SKILL.md, app/functions/analytics/operatorSnapshotPublish.js, web/public/operator/dashboard.html, web/public/operator/dashboard.page.js
- **Keywords:** dashboard review, operator dashboard, snapshot review, business review, objectives report, not measured, kpi review
- **Related:** DEV-27, DEV-50
@end-capability -->

# dashboard-review

The operator dashboard draws every number from one JSON snapshot. `operatorSnapshotPublish.js`
writes it hourly in prod as the last step of the ingestion workflow, to
`s3://prod-env-analytics-lake-972912397388/snapshots/prod/latest.json`.
`GET /api/v1/operator/snapshot` returns the same file to the page. This skill reads that file
for the figures and the page in Chrome for what the operator sees. The two must agree, and any
place they differ is a finding.

The pass is read-only. It writes nothing to AWS, Stripe, the ads accounts or GitHub issues. It
clicks no button on the page that changes state; the "release" control in the held passes panel
is one of these.

## 1. Gather

Run these in one turn, in parallel.

**The snapshot.** It holds aggregates, but the operator and affiliate tables can name people, so it
goes to the scratchpad, never into the public repository.

```bash
aws --profile diya-submit-prod s3 cp s3://prod-env-analytics-lake-972912397388/snapshots/prod/latest.json <scratchpad>/dashboard-snapshot.json
```

When the SSO session is expired, print `aws sso login --sso-session diyaccounting` once, and
take the snapshot from the page instead. In the dashboard tab, run this in the page with the
`javascript_tool`:

```js
const t = localStorage.getItem("cognitoIdToken");
const r = await fetch("/api/v1/operator/snapshot", { headers: t ? { Authorization: "Bearer " + t } : {} });
await r.json();
```

**The page.** Follow the `claude-in-chrome` rules: call `tabs_context_mcp` first, open a new tab,
and navigate to `https://submit.diyaccounting.co.uk/operator/dashboard.html`. The operator is
signed in already. If the page shows a sign-in prompt or a 403, stop and ask the operator to
sign in. Never type credentials. Wait until the first table has rows (the page fetches the
snapshot after load), then:

- `get_page_text` once for the whole page.
- One screenshot per panel, scrolling top to bottom, with `save_to_disk: true`. The dashboard
  runs in this order: Visitors, the eight objectives, activities, company accounts, the reserve,
  the marketing budget panel, paid subscribers, the affiliate tables and the AWS links. Read
  `web/public/operator/dashboard.html` for the current order and panel ids. A section that
  stays `hidden` is a finding when its snapshot field has data.

**Context.**

- `gh issue list --state open --label alarm --json number,title` gives the open alarms.
- `aws --profile diya-submit-prod ssm get-parameter --name /submit/prod/last-known-good-deployment --query Parameter.Value --output text` gives the live set.
- Read the previous report, the newest file in `../private.diyaccounting.co.uk/operator/dashboard-reviews/`, for the figures to compare against.

## 2. Judge

Use the snapshot's own structure. `objectives[]` each hold `observations[]`, with windows
`today`, `previousDay`, `last7`, `last30` (with `trend`) and `last90`. The other top-level
fields are `dailyCharts`, `costDrivers`, `paidSubscribers`, the marketing budget field and any
field added since. List the top-level keys first, and read every key the page renders.

For each panel, record one line per finding, each in one of these classes:

| Class | What it is | Example |
|---|---|---|
| fault | A figure is wrong, missing when its source has data, or the page and the snapshot differ | `revenue-net-gbp` null while `revenue-gbp` has a value |
| stale | The snapshot is older than 2 hours (prod publishes hourly), or a source has stopped (a 0 or null where the previous report had a value) | `generatedAt` 9 hours old |
| movement | A figure that moved more than 25% between `last30` and the previous 30 days, or against the last report | Paid subscribers 12 → 9 |
| target | A figure on the wrong side of its target, where the observation or the plan names one | AWS cost above `v_cost_vs_target_monthly`'s target |
| gap | Something the operator would need that the panel does not show | No cost per paid customer by channel |

Checks that apply to every review:

1. **Freshness**: the age of `generatedAt`, and `failedObservationCount` when present (more than 0 means a query failed; name the observations whose every window is null).
2. **Agreement**: three figures from each panel, checked between the page text and the snapshot (the rounding and units the page applies are in `dashboard.page.js` `formatValue`).
3. **Not measured**: every "not measured" or empty cell the page shows, with its reason from the snapshot (a null input, a view not yet deployed, an empty source such as `fx_rates` on ci).
4. **Money**: revenue (gross and net), the marketing budget and its inputs, spend so far, AWS cost against target, commissions (earned, held, payable, paid), cash at bank.
5. **Funnel**: visitors, then day passes, then HMRC connections, then submissions, then paid conversions, each with its trend.
6. **Alarms**: each open alarm issue set against the panel that should show it (uptime, security, compliance).
7. **AWS links**: open one link of each kind in a new tab. A link that lands on an error, an empty console page or the wrong account is a fault. Close each tab after use.

Each finding cites its evidence: the snapshot key path (`objectives[conversion-to-paid].observations[revenue-gbp].last30.value`), the screenshot file, or the command output.

## 3. Write the report

Write the report to
`../private.diyaccounting.co.uk/operator/dashboard-reviews/REPORT_DASHBOARD_REVIEW_<YYYY-MM-DD>.md`,
and copy the panel screenshots beside it under `dashboard-reviews/<YYYY-MM-DD>/`. If a report for
the day exists, add `-2`. Write the document in the plain-prose rules:

1. One line at the top: the snapshot time, the live prod set, and the count of findings per class.
2. **Headline figures**: one table of the money and funnel figures, giving this report's value, the last report's value and the change.
3. **Findings**: one table per class (fault, then stale, target, movement, gap). Each row gives the panel, the finding, the evidence and the action.
4. **Panel by panel**: one short section per panel, with its screenshot linked, what it shows, and what changed.
5. **Proposed rows**: one line per fault or gap that needs code, as a NEXT.md row draft (label, file, model, size).

Commit only that file and its screenshot folder in the private repository, then push. Commits
that touch only `.md` and image files go straight to `main` there:

```bash
git -C ../private.diyaccounting.co.uk add operator/dashboard-reviews/
git -C ../private.diyaccounting.co.uk commit -m "Dashboard review <date>: <n> findings"
```

## 4. Summarise in the chat

Shape it as `CLAUDE.md` asks:

- One line first: the snapshot age and the count of findings per class.
- Then the faults, then the targets missed and the largest movements, one line each with its figure.
- Then the proposed rows.
- Then the report path.

Keep personal data out of the chat: no email addresses and no customer identifiers.
Affiliates appear by group and count only.

Add a proposed row to `NEXT.md` only when the operator says yes, and then through `/refine`'s
rules. Close the Chrome tabs this pass opened.

## When the dashboard changes

A new panel or snapshot field needs no change to this skill if it is a top-level key the page
renders, because step 2 reads every key. Change this skill when a panel needs a check of its own,
such as a new money figure with a target.
