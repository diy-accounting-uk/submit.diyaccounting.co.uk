---
name: dashboard-review
description: Read every tab of the prod operator dashboard (https://submit.diyaccounting.co.uk/operator/dashboard.html) from its snapshot and from the page the operator sees in Chrome, judge every panel and console image, write one report to the private repository with a section per tab, and summarise it in the chat. Invoke when the operator says "review the dashboard", "dashboard review", "what does the dashboard say", or asks how the business is doing by the dashboard's numbers.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-55 Review the operator dashboard
- **Use when:** the operator asks for a review of the operator dashboard, what it says, or how the business is doing by its numbers.
- **Does:** The dashboard-review skill reads the prod snapshot from the analytics lake and every tab of the page in the operator's own Chrome session, including each captured AWS console image. It maps each snapshot section to its tab and panel, and judges each panel for movement, gaps and faults. It writes one report to the private repository, with a section per tab and two lists: improvements to the dashboard, and changes the observations call for as proposed NEXT.md rows. It summarises both lists per tab in the chat.
- **Run:** `/dashboard-review`
- **Entry:** `.claude/skills/dashboard-review/SKILL.md`
- **Files:** .claude/skills/dashboard-review/SKILL.md, app/functions/analytics/operatorSnapshotPublish.js, web/public/operator/dashboard.html, web/public/operator/dashboard.page.js
- **Keywords:** dashboard review, operator dashboard, snapshot review, business review, objectives report, not measured, kpi review, dashboard tabs, console image review, dashboard improvements
- **Related:** DEV-27, DEV-50, OPS-193
@end-capability -->

# dashboard-review

The operator dashboard draws every number from one JSON snapshot. `operatorSnapshotPublish.js`
writes it in prod every six hours (02:15, 08:15, 14:15 and 20:15 UTC) as the last step of the ingestion workflow, to
`s3://prod-env-analytics-lake-972912397388/snapshots/prod/latest.json`.
`GET /api/v1/operator/snapshot` returns the same file to the page, with one extra key:
`console`, the index of the captured AWS console images. The S3 file has no `console` key.
This skill reads the snapshot for the figures and every tab of the page in Chrome for what the
operator sees. The two must agree, and any place they differ is a finding.

The pass is read-only. It writes nothing to AWS, Stripe, the ads accounts or GitHub issues. It
clicks no button on the page that changes state, except a tab button. The "release" control in
the held passes panel changes state, so the pass never clicks it.

## 1. Gather

Run these in one turn, in parallel.

**The snapshot.** It holds aggregates, but the operator and affiliate tables can name people, so it
goes to the scratchpad, never into the public repository.

```bash
aws --profile diya-submit-prod s3 cp s3://prod-env-analytics-lake-972912397388/snapshots/prod/latest.json <scratchpad>/dashboard-snapshot.json
```

When the SSO session is expired, print `aws sso login --sso-session diyaccounting` once, and
take the snapshot from the page instead. Load the dashboard tab and wait until it has finished
loading. Then run this in the tab with the `javascript_tool`. The stored id token may have
expired, so the first run can answer 401 while the page refreshes its token. Run the script once
more after a 401.

```js
const t = localStorage.getItem("cognitoIdToken");
const h = t ? { Authorization: "Bearer " + t } : {};
const snapshot = await (await fetch("/api/v1/operator/snapshot", { headers: h })).json();
const held = await fetch("/api/v1/pass/held", { headers: h });
const heldPasses = held.ok ? ((await held.json()).passes || []).length : null;
const tabs = [...document.querySelectorAll(".dashboard-tab")].map((b) => b.dataset.tabId);
const panels = [...document.querySelectorAll("[data-tab][id]")].map((e) => ({
  id: e.id,
  tabs: e.dataset.tab.split(" "),
  hidden: e.hidden,
}));
({ snapshot, heldPasses, tabs, panels });
```

The script returns four things:

- `snapshot`: the same JSON as the S3 file, plus `console` (see below).
- `heldPasses`: the count of held passes. The held passes panel reads `/api/v1/pass/held`, not the snapshot. The script returns the count only, because each pass names who issued it.
- `tabs`: the tab ids, in the page's order.
- `panels`: each element with a `data-tab` and an id, with the tabs that show it and its `hidden` attribute. The snapshot does not hold this.

`snapshot.console.items` has one entry for each capture id (`prod-lambda-errors`,
`ci-alarms`, `spreadsheets-rum-vitals`). An entry holds `title`, `kind`, `capturedAt` and one of
`imageKey` (a graph), `rows` (a table) or `error`. The image bytes are not in the script's
result. The page loads each one from `/api/v1/operator/console-image?id=<capture id>`, so the
page pass is the only way to see an image. The page is the source of the list of capture items
and of links. Their counts can differ, because one link can show two items (the two Lambda
duration graphs are two items). Count nothing from this skill.

**Map the snapshot to the page.** List the snapshot's top-level keys. Set each one against the
tab and panel that show it, from the table below. Then compare the table with
`web/public/operator/dashboard.html` and `dashboard.page.js`, because both can have changed.

<!-- review-map:start -->
| Snapshot section | Tab | Panel (id or objective slot) |
|---|---|---|
| `dailyCharts` | main | `chartsPanel` |
| `objectives[conversion-to-submission]` | adoption, main | slot `conversion-to-submission`; `visitorsPanel` (main) |
| `objectives[conversion-to-paid]`, `paidSubscribers` | adoption | slot `conversion-to-paid` |
| `objectives[retention]` | adoption | slot `retention` |
| `monthlyMarketingBudget` | adoption | `monthlyMarketingBudgetPanel` |
| `objectives[activity-started-and-completed]` | behaviour | `activitiesPanel` |
| `pageVisitors` | behaviour | `pageVisitorsPanel` |
| `integrations` | integrations | `integrationsSummaryPanel`, `integrationsHmrcPanel`, `integrationsCompaniesHousePanel`, `integrationsStripePanel` |
| `objectives[low-running-cost]`, `costDrivers` | main | slot `low-running-cost` |
| `objectives[compliance]`, `objectives[security]` | main | slots `compliance`, `security` |
| `objectives[company-accounts]` | main | `companyAccountsPanel`, `reservePanel` |
| `operators` | main | `operatorsPanel` |
| `objectives[uptime]`, `objectives[operator-effort]` | ops | slots `uptime`, `operator-effort` |
| `familyAffiliates` | affiliates | `familyAffiliatesPanel` |
| `affiliateGroups` | affiliates | `affiliateGroupsPanel` |
| `console` (API response only) | aws-prod, aws-ci | `awsLinksPanel`, one `console-<link id>` section for each link |
| `generatedAt`, `environment`, `failedObservationCount` | all | the header lines above the tabs |
<!-- review-map:end -->

The held passes panel (`heldPassesPanel`, affiliates tab) has no snapshot section.

Report these as findings for the dashboard:

- A top-level snapshot key, or an `objectives[]` id, that no row of the table or panel shows.
- A panel that no snapshot section feeds, other than the held passes panel.
- A capture id in `snapshot.console.items` that no link of the page shows, or a link whose capture id has no entry (the page shows "Not captured yet").

**The page.** Follow the `claude-in-chrome` rules: call `tabs_context_mcp` first, open a new tab,
and navigate to `https://submit.diyaccounting.co.uk/operator/dashboard.html`. The operator is
signed in already. If the page shows a sign-in prompt or a 403, stop and ask the operator to
sign in. Never type credentials. Wait until the first table has rows (the page fetches the
snapshot after load), then read the tab list from the page: the buttons with `data-tab-id`, in
page order. Do not use a fixed list, so a new tab is read with no change to this skill.

For each tab, in order:

1. Click its button. A panel on a tab that is not open is not on screen, so read a tab only while it is open.
2. Wait for its panels. For the two AWS tabs, wait until every `.console-capture-image` has `naturalWidth > 0`, or has been replaced by a `.console-capture-error` message. The page loads each image after the tab builds.
3. Read the tab's text with the `javascript_tool`. `get_page_text` returns the first `<article>` only and cuts long text at about 1,500 characters, so it is not used. Run a script that reads the `innerText` of each visible panel by panel id, in chunks, so no result is cut.
4. Read each capture image on screen, with its caption. Save a screenshot with `save_to_disk: true` only for an item that a finding cites, so the caption with the capture time is in the shot. Saving one for every panel and item is too slow on the two AWS tabs.

The page remembers the chosen tab in local storage, so the pass ends on the main tab to leave the
page as it began.

**Context.**

- `gh issue list --state open --label alarm --json number,title` gives the open alarms.
- `aws --profile diya-submit-prod ssm get-parameter --name /submit/prod/last-known-good-deployment --query Parameter.Value --output text` gives the live set.
- Read the previous report, the newest file in `../private.diyaccounting.co.uk/operator/dashboard-reviews/`, for the figures to compare against.

## 2. Judge

<!-- review-criteria:start -->
Use the snapshot's own structure. `objectives[]` each hold `observations[]`, with windows
`today`, `previousDay`, `last7`, `last30` (with `trend`) and `last90`. The other top-level
fields are in the table in section 1, and any field added since. Read every key the page renders.

A finding falls in one of two lists. Each row of a list carries a tag for its kind.

- **Dashboard improvements**: a change to the dashboard itself. Examples: a panel that misleads, a graph that cannot be read, a missing or stale figure, a tab that needs a panel, a snapshot section that no panel shows.
- **Changes the observations call for**: a change elsewhere, in product, operations, cost, marketing or security. Write each as a proposed `NEXT.md` row.

| Tag | What it is | List it goes in | Example |
|---|---|---|---|
| fault | A figure is wrong, missing when its source has data, or the page and the snapshot differ | Dashboard improvements | `revenue-net-gbp` null while `revenue-gbp` has a value |
| stale | The snapshot is older than 7 hours (prod publishes every six hours), or a source has stopped | Dashboard improvements | `generatedAt` 9 hours old |
| gap | Something the operator would need that the panel does not show | Dashboard improvements | No cost per paid customer by channel |
| movement | A figure that moved more than 25% between `last30` and the previous 30 days, or against the last report | Changes the observations call for | Paid subscribers 12 to 9 |
| target | A figure on the wrong side of its target, where the observation or the plan names one | Changes the observations call for | AWS cost above `v_cost_vs_target_monthly`'s target |

A fault or a stale source that needs a change in the publisher or the lake goes in the first list
as the dashboard's fix. A movement or a missed target goes in the second list only. A finding is
in exactly one list.

Checks that apply to every review. Each finding names the tab it was read on.

1. **Freshness** (every tab): the age of `generatedAt`, and `failedObservationCount` when present (more than 0 means a query failed; name the observations whose every window is null). Name the tabs that show those observations.
2. **Agreement** (every tab): three figures from each panel, checked between that tab's page text and the snapshot (the rounding and units the page applies are in `dashboard.page.js` `formatValue`).
3. **Not measured** (every tab): every "not measured" or empty cell the page shows, with its reason from the snapshot (a null input, a view not yet deployed, an empty source such as `fx_rates` on ci).
4. **Money** (main, adoption, affiliates): revenue (gross and net), the marketing budget and its inputs, spend so far, AWS cost against target, commissions (earned, held, payable, paid), cash at bank.
5. **Funnel** (adoption, main, behaviour): visitors, then day passes, then HMRC connections, then submissions, then paid conversions, each with its trend.
6. **Alarms** (ops, aws-prod, aws-ci): each open alarm issue set against the panel that should show it (uptime, security, compliance), and against the alarms table of the AWS tabs.
7. **AWS links** (aws-prod, aws-ci): check each link's host and account id. A link on the wrong host or for the wrong account is a fault. Open a link in a new tab only when the operator is signed in to that console, and close each tab after use. A link that lands on an error or an empty console page is a fault.
8. **Hidden panels** (each tab, on its own open tab): a panel that stays `hidden` while its tab is open, and whose snapshot field has data, is a fault. A panel on a tab that is not open is not a finding. The `panels` list from the script gives the `hidden` state of each panel; confirm it on the tab while that tab is open.
9. **Console images** (aws-prod, aws-ci): read each capture image on screen. Read a saved screenshot with the Read tool, as an image. Judge:
   - The capture time in the caption against `generatedAt`: a capture older than 26 hours is stale (the capture runs once a day).
   - Lines that cannot be read against the axis: a flat line at the floor of a graph with large peaks, overlapping lines, a legend of unreadable names.
   - An empty graph: no lines, or "No data". Judge whether the source has data, from the matching metric in the snapshot or the alarm list.
   - A graph for the wrong account or environment: a prod graph on the ci tab, a function name that carries the other environment's prefix.
   - A capture that shows "Capture failed" or "The image did not load", or "Not captured yet".

Each finding cites its evidence: the snapshot key path (`objectives[conversion-to-paid].observations[revenue-gbp].last30.value`), the screenshot file, or the command output.
<!-- review-criteria:end -->

## 3. Write the report

The session that the operator talks to writes the report file from the findings. A sub-agent that
runs this skill cannot write the file with its Write tool, so it returns the findings as text.

Write the report to
`../private.diyaccounting.co.uk/operator/dashboard-reviews/REPORT_DASHBOARD_REVIEW_<YYYY-MM-DD>.md`,
and copy the screenshots beside it under `dashboard-reviews/<YYYY-MM-DD>/`. If a report for
the day exists, add `-2`. Write the document in the plain-prose rules:

1. One line at the top: the snapshot time, the live prod set, and the count of findings in each list for each tab.
2. **Headline figures**: one table of the money and funnel figures, giving this report's value, the last report's value and the change.
3. **Dashboard improvements**: one table. Each row gives the tab, the panel, the tag, the finding, the evidence and the change to make.
4. **Changes the observations call for**: one proposed `NEXT.md` row for each finding, in the shape of the rows in `NEXT.md`: `- [ ] **LABEL. Title.** What to do. **Source**: this review. **Owner**: ... **Model**: ... **Size**: ...`. The label has a prefix that names the area (`DASH`, `COST`, `SEC`, `MKT`, `OPS`). Add the tab and the tag in the text.
5. **Tab by tab**: one short section for each tab, in the page's tab order, each with its screenshots linked, what its panels show, what changed, and the findings that fall on it, by list.

Commit only that file and its screenshot folder in the private repository, then push. Commits
that touch only `.md` and image files go straight to `main` there:

```bash
git -C ../private.diyaccounting.co.uk add operator/dashboard-reviews/
git -C ../private.diyaccounting.co.uk commit -m "Dashboard review <date>: <n> findings"
```

## 4. Summarise in the chat

Shape it as `CLAUDE.md` asks:

- One line first: the snapshot age and the total count in each list.
- Then one line for each tab, in page order: the count in "Dashboard improvements" and the count in "Changes the observations call for".
- Then the faults, the targets missed and the largest movements, one line each with its figure and its tab.
- Then the proposed rows.
- Then the report path.

Keep personal data out of the chat: no email addresses and no customer identifiers.
Affiliates appear by group and count only.

Add a proposed row to `NEXT.md` only when the operator says yes, and then through `/refine`'s
rules. Close the Chrome tabs this pass opened.

## The nightly run

The workflow `dashboard-review-nightly.yml` runs this review each night with no browser of yours.
It reads section 1's map and section 2 between the `review-map` and `review-criteria` markers when it runs.
A change between those markers changes the nightly prompt and its checks.
The unit test of `scripts/dashboard-review-criteria.mjs` fails when a check has no owner, code or model, so assign each new check there.
A new tag needs a row in the tag table and nothing else.
Keep the markers in place.

## When the dashboard changes

A new tab needs no change to this skill, because the page pass reads the tab list from the page.
A new panel or snapshot section needs a row in the table in section 1; the unmapped-key finding
shows when it is missing. Change this skill when a panel needs a check of its own,
such as a new money figure with a target.
