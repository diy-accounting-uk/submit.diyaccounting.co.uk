<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Analytics Export Analysis — 2026-09-11

## Execution Details

**State machine execution**
- ARN: `arn:aws:states:eu-west-2:972912397388:execution:prod-env-analytics-nightly:0d6aa4b5-a4d8-4337-be9e-b10cbc035be1`
- Status: SUCCEEDED
- Start: 2026-09-12T02:15:16 UTC (03:15:16 BST)
- Stop: 2026-09-12T02:20:28 UTC (03:20:28 BST)
- Duration: 5 minutes 12 seconds

**Nightly run context**
This is the first successful export from the `prod-env-analytics-nightly` state machine. The two prior failures on 2026-09-10 and 2026-09-11 were due to missing IAM permissions and incomplete analytics view definitions. Both issues were resolved by 02:15 UTC on 2026-09-12.

## File Inventory

**Location**: `s3://prod-env-analytics-lake-972912397388/exports/prod/2026-09-11/`

**Count**: 21 CSVs + 8 JSONs = 29 files (expected)

### CSV Files (21)

1. v_active_users_daily.csv
2. v_alarm_state_changes_daily.csv
3. v_availability_sli_daily.csv
4. v_business_activity_daily.csv
5. v_compliance_status.csv
6. v_dora_runs_daily.csv
7. v_ga4_funnel_daily.csv
8. v_hmrc_failures_by_class.csv
9. v_login_to_submission_funnel.csv
10. v_operator_interventions_daily.csv
11. v_pass_redemptions_daily.csv
12. v_purchase_reconciliation_daily.csv
13. v_returning_submitters_quarterly.csv
14. v_revenue_daily.csv
15. v_signup_to_first_submission.csv
16. v_submissions_by_activity_daily.csv
17. v_submissions_daily.csv
18. v_subscription_cancellations_daily.csv
19. v_subscription_renewals_daily.csv
20. v_traffic_by_country_daily.csv
21. v_traffic_sources_daily.csv

### JSON Files (8)

1. compliance.json
2. conversion-to-paid.json
3. conversion-to-submission.json
4. low-running-cost.json
5. operator-effort.json
6. retention.json
7. security.json
8. uptime.json

## Always-Empty Fields Summary

### Empty CSV Files

**v_compliance_status.csv**
- Headers: day, area, detail, open_findings
- Data rows: 0
- All fields empty across all rows (no rows present)

**v_subscription_renewals_daily.csv**
- Headers: day, bundle_id, renewals
- Data rows: 0
- All fields empty across all rows (no rows present)

### Empty Fields in Populated Files

**All JSON files** — Field `target` is empty (0/1) in all eight objective JSON files:
- compliance.json
- conversion-to-paid.json
- conversion-to-submission.json
- low-running-cost.json
- operator-effort.json
- retention.json
- security.json
- uptime.json

**Sparse fields**:
- operator-effort.json: `supportingMetrics[1].rows[1].median_lead_time_seconds` (0/1)
- operator-effort.json: `supportingMetrics[1].rows[4].median_lead_time_seconds` (0/1)
- retention.json: `supportingMetrics[2].rows[1].median_lead_time_seconds` (0/1)
- retention.json: `supportingMetrics[2].rows[4].median_lead_time_seconds` (0/1)

## Field Analysis by File

### CSV Files

#### v_active_users_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| active_users | 13 | 13 |
| day | 13 | 13 |
| events | 13 | 13 |

#### v_alarm_state_changes_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| alarms_in_family | 109 | 109 |
| day | 109 | 109 |
| env | 109 | 109 |
| family | 109 | 109 |
| last_change_ts | 109 | 109 |
| times_cleared | 109 | 109 |
| times_fired | 109 | 109 |

#### v_availability_sli_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| budget_remaining_runs | 48 | 48 |
| budget_runs | 48 | 48 |
| day | 48 | 48 |
| failed_runs | 48 | 48 |
| pass_rate | 48 | 48 |
| passes | 48 | 48 |
| runs | 48 | 48 |
| suite | 48 | 48 |

#### v_business_activity_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| activity | 22 | 22 |
| day | 22 | 22 |
| operations | 22 | 22 |

#### v_compliance_status.csv

No data rows. File contains headers only.

#### v_dora_runs_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| day | 6 | 6 |
| environment | 6 | 6 |
| failure_rate | 6 | 6 |
| median_duration_seconds | 6 | 6 |
| median_lead_time_seconds | 4 | 6 |
| runs | 6 | 6 |
| successes | 6 | 6 |
| workflow | 6 | 6 |

#### v_ga4_funnel_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| checkouts | 11 | 11 |
| day | 11 | 11 |
| logins | 11 | 11 |
| purchases | 11 | 11 |
| sessions | 11 | 11 |

#### v_hmrc_failures_by_class.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| day | 2 | 2 |
| failure_class | 2 | 2 |
| failures | 2 | 2 |
| hmrc_status | 2 | 2 |

#### v_login_to_submission_funnel.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| cohort_day | 13 | 13 |
| conversion | 13 | 13 |
| logged_in | 13 | 13 |
| submitted_within_7d | 13 | 13 |

#### v_operator_interventions_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| day | 7 | 7 |
| interventions | 7 | 7 |
| kind | 7 | 7 |

#### v_pass_redemptions_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| day | 56 | 56 |
| pass_type_id | 56 | 56 |
| passes_issued | 56 | 56 |
| passes_redeemed | 56 | 56 |

#### v_purchase_reconciliation_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| activity_activations | 11 | 11 |
| activity_minus_stripe | 11 | 11 |
| day | 11 | 11 |
| ga4_minus_stripe | 11 | 11 |
| ga4_purchases | 11 | 11 |
| stripe_paid_charges | 11 | 11 |

#### v_returning_submitters_quarterly.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| quarter | 1 | 1 |
| returning_submitters | 1 | 1 |
| submitters | 1 | 1 |

#### v_revenue_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| charges | 5 | 5 |
| day | 5 | 5 |
| product | 5 | 5 |
| revenue_gbp | 5 | 5 |

#### v_signup_to_first_submission.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| median_hours_to_first_submission | 3 | 11 |
| new_accounts | 11 | 11 |
| signup_day | 10 | 11 |
| submitted | 11 | 11 |

#### v_submissions_by_activity_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| activity | 6 | 6 |
| completions | 6 | 6 |
| customers | 6 | 6 |
| day | 6 | 6 |
| outcome | 6 | 6 |

#### v_submissions_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| day | 6 | 6 |
| outcome | 6 | 6 |
| submissions | 6 | 6 |
| submitters | 6 | 6 |

#### v_subscription_cancellations_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| bundle_id | 14 | 14 |
| cancellations | 14 | 14 |
| day | 14 | 14 |

#### v_subscription_renewals_daily.csv

No data rows. File contains headers only.

#### v_traffic_by_country_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| ai_agent_sessions | 16 | 16 |
| country | 16 | 16 |
| day | 16 | 16 |
| human_sessions | 16 | 16 |
| sessions | 16 | 16 |

#### v_traffic_sources_daily.csv

| Field | Non-Empty | Total Rows |
|-------|-----------|-----------|
| channel | 43 | 43 |
| day | 43 | 43 |
| engaged_sessions | 43 | 43 |
| engagement_rate | 43 | 43 |
| new_users | 43 | 43 |
| sessions | 43 | 43 |

### JSON Files

#### compliance.json

- Single object structure with nested arrays
- Fields: objective, levers[0-5], target, supportingMetrics[0]
- Always-empty field: **target** (0/1)

#### conversion-to-paid.json

- Single object with nested supportingMetrics array (5 items: revenue, passes, reconciliation, subscriptions, churn)
- Always-empty field: **target** (0/1)
- All supportingMetrics populated

#### conversion-to-submission.json

- Single object with nested supportingMetrics array (3 items: funnel, HMRC failures, activity)
- Always-empty field: **target** (0/1)
- All supportingMetrics populated

#### low-running-cost.json

- Single object with levers[0-4] only
- Always-empty field: **target** (0/1)
- No supportingMetrics

#### operator-effort.json

- Single object with nested supportingMetrics array (2 items: interventions, DORA runs)
- Always-empty field: **target** (0/1)
- Sparse field: median_lead_time_seconds empty in rows[1] and rows[4] of supportingMetrics[1]

#### retention.json

- Single object with nested supportingMetrics array (3 items: returning submitters, renewals, cancellations)
- Always-empty field: **target** (0/1)
- Sparse field: median_lead_time_seconds empty in some rows

#### security.json

- Single object with levers[0-5] only
- Always-empty field: **target** (0/1)
- No supportingMetrics

#### uptime.json

- Single object with nested supportingMetrics array (2 items: availability SLI, alarm state changes)
- No target field listed (populated or empty unclear from structure)
- All supportingMetrics populated
