---
name: ads-advisor
description: Answer Google Ads questions — how the account is doing, what a budget would buy, how to optimise spend — from live data.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# ads-advisor

Answer questions about DIY Accounting Submit's Google Ads account: current performance, what a
daily budget would deliver in clicks, and how to optimise the bidding strategy. Read live data
from the account and live code from `infra/google/ads/` — never guess a number.

## Running the report

Run the performance report for the account's campaigns, ad groups and keywords:

```bash
export AWS_PROFILE=submit-prod
npm run ads:report
```

Default date range is the 28 days ending yesterday. For a specific range:

```bash
npm run ads:report -- --from 2026-08-26 --to 2026-09-22
```

Output is a table on stdout showing impressions, clicks, cost (£), average CPC (£), CTR (%),
conversions and conversion value (£) per campaign, ad group and keyword.

For JSON output (machine-readable), add `--json`:

```bash
npm run ads:report -- --from 2026-08-26 --to 2026-09-22 --json
```

## Reading the report: cost per session and break-even

DIY Accounting's target cost per session is £0.36 (derived from 0.28% session-to-purchase
conversion, £127 lifetime contribution, 30% churn). This is the ceiling above which paid traffic
cannot pay back.

Cost per session is total cost divided by the sessions the ads drove. A paid click lands as
one session, so the report's average CPC is the first estimate; GA4's sessions for the
`google / cpc` source give the exact count when they differ. The last live run (26 August to
22 September 2026) showed £0.06 CPC, well under £0.36, with 0 conversions from 97 clicks,
which is too few to judge the conversion rate.

If the report shows zero conversions and **cost per session exceeds £0.36**, the spend is
unprofitable. Call this out explicitly with the numbers: "Cost per session £N.NN against
break-even £0.36 with zero conversions — cannot pay back."

Metrics to read:

- **CPC**: average cost per click. High CPC (>£0.50) with low CTR (<1.5%) suggests poor
  keyword relevance or bid competition.
- **CTR**: click-through rate. Below 1.5% is weak. Above 3% is strong. CTR drives volume.
- **Conversions**: count of purchases or submissions. Zero conversions with >£5 spent says the
  traffic is not converting to customers.

## Answering "How many clicks for £N a day?"

Use the forecast first when access allows. When the Cloud project lacks Basic access
(DEVELOPER_TOKEN_NOT_APPROVED), fall back to the report and estimate from live performance.

### Forecast: historical metrics and expected clicks

Run the forecast for a keyword list at a proposed daily budget:

```bash
npm run ads:forecast -- --keywords "vat filing software,mtd vat" --budget-gbp 50
```

Or from a file:

```bash
npm run ads:forecast -- --keywords-file keywords.txt --budget-gbp 50
```

Output shows:
- **Historical metrics per keyword**: average monthly searches, competition level, top-of-page
  bid range (£).
- **Forecast at this daily budget**: expected clicks, cost (£), average CPC (£).

**Important**: The forecast returns DEVELOPER_TOKEN_NOT_APPROVED if the Cloud project
`diyaccounting-ga4` does not have Basic access for the Ads API. This is a known blocking
issue (NEXT.md row OB52h). When this happens, report it and fall back to the report for
actual performance data — never guess forecast numbers.

State the match type and any CPC ceiling when quoting the forecast to the operator.

### Fallback: estimate from the report

If forecast is unavailable, use the latest report data:

1. Find the most recent 28-day report.
2. Note the account's **average CPC** and **CTR**.
3. Estimate clicks at a daily budget: `daily_budget / average_cpc`.
4. Example: if average CPC is £0.06 and budget is £50/day, expect ~833 clicks per day.

## Optimising spend: bidding strategy

To change the bidding strategy, edit `infra/google/ads/ads.toml` and run the plan step
(never `--apply` from the skill; the plan runs as CI or agent work).

Strategies supported (by campaign type):

**Performance Max campaigns** accept only:
- `maximize_conversions` (no parameters)
- `maximize_conversion_value` with optional `target_roas` (e.g., 2.5 = £2.50 revenue per £1 spent)

**Search campaigns** accept:
- `manual_cpc` (no parameters; you set bids per keyword)
- `maximize_clicks` with optional `cpc_bid_ceiling_gbp`
- `maximize_conversions` with optional `target_cpa_gbp`
- `maximize_conversion_value` with optional `target_roas`
- `target_cpa` with `target_cpa_gbp`
- `target_roas` with `target_roas`
- `target_impression_share` with `location`, `fraction` and optional `cpc_bid_ceiling_gbp`
- Portfolio strategies by resource name

Example in `ads.toml`:

```toml
[[campaign]]
name = "Campaign #1"
type = "PERFORMANCE_MAX"

[campaign.bidding]
strategy = "maximize_conversions"
target_cpa_gbp = 12.50
```

To propose a change:

1. Edit the `[campaign.bidding]` section in `infra/google/ads/ads.toml`.
2. Run the plan step to see what would change:
   ```bash
   npm run ads:sync
   ```
3. Verify the output shows the intended strategy and parameters.
4. Create a PR with the `ads.toml` change. The plan output and the diff are the proposal.

The skill does not run `--apply` — that is infrastructure work driven by an agent after the plan
shows the change is correct.

## Budget ceiling: the reinvestment rule

DIY Accounting's budget is constrained by reinvestment policy (NEXT.md row B52m):

- **Monthly budget = 20% of trailing 30-day revenue**, with a **floor of £2,000 in reserve**.
- **Per-experiment cap = 10% of the monthly budget** (unless the operator raises it for a named
  experiment).

To estimate the ceiling:

1. Get trailing 30-day revenue from the dashboard or finance.
2. Calculate: `budget = revenue * 0.20`, but hold at least £2,000 in reserve.
3. Calculate: `max_per_experiment = budget * 0.10`.

Example: If trailing revenue is £8,000/month, `budget = £1,600` and `max_per_experiment = £160`.

When proposing spend changes, check this ceiling. If the proposal exceeds it, say so explicitly:
"Proposed spend £N exceeds the 20% reinvestment rule (£2,000 reserve): monthly budget would be £X,
max per experiment £Y."

## When to stop or adjust spend

Stop or reduce spend when any of these hold:

1. **Cost per session exceeds £0.36 with zero conversions**: "Cannot pay back at this cost."
2. **CTR below 1%**: Keywords are not matching user intent. Pause and rewrite.
3. **CPC trending up with conversions flat**: Auction competition rising, ROAS declining.
4. **Monthly budget exceeded**: Halt the experiment until the next month's reinvestment window.
5. **Conversions are too few to judge**: Wait until n ≥ 30 before optimising (rule of thumb).
   Report the sample size and when the test can be evaluated.

## Proof

Every command and flag exists in:
- `npm run ads:report` and its `--from`, `--to`, `--json` flags.
- `npm run ads:forecast` and its `--keywords`, `--keywords-file`, `--budget-gbp` flags.
- `npm run ads:sync` with no `--apply` flag shown to the operator.
- `infra/google/ads/ads.toml` and its `[[campaign]]`, `[campaign.bidding]`, `strategy` and
  parameter fields.
