<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Raw export field counts

Export date: 2026-09-12 (state machine execution 0d6aa4b5-a4d8-4337-be9e-b10cbc035be1)

Production analytics lake bucket: `s3://prod-env-analytics-lake-972912397388/exports/prod/`

## CSV files (21 total)

### v_active_users_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 14 | 14 |
| active_users | 14 | 14 |
| events | 14 | 14 |

### v_alarm_state_changes_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 130 | 130 |
| family | 130 | 130 |
| env | 130 | 130 |
| times_fired | 130 | 130 |
| times_cleared | 130 | 130 |
| alarms_in_family | 130 | 130 |
| last_change_ts | 130 | 130 |

### v_availability_sli_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 60 | 60 |
| suite | 60 | 60 |
| runs | 60 | 60 |
| passes | 60 | 60 |
| pass_rate | 60 | 60 |
| failed_runs | 60 | 60 |
| budget_runs | 60 | 60 |
| budget_remaining_runs | 60 | 60 |

### v_business_activity_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 24 | 24 |
| activity | 24 | 24 |
| operations | 24 | 24 |

### v_compliance_status

Empty. 0 rows.

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 0 | 0 |
| area | 0 | 0 |
| detail | 0 | 0 |
| open_findings | 0 | 0 |

### v_dora_runs_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 8 | 8 |
| workflow | 8 | 8 |
| environment | 8 | 8 |
| runs | 8 | 8 |
| successes | 8 | 8 |
| median_duration_seconds | 8 | 8 |
| median_lead_time_seconds | 5 | 8 |
| failure_rate | 8 | 8 |

### v_ga4_funnel_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 12 | 12 |
| sessions | 12 | 12 |
| logins | 12 | 12 |
| checkouts | 12 | 12 |
| purchases | 12 | 12 |

### v_hmrc_failures_by_class

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 2 | 2 |
| failure_class | 2 | 2 |
| hmrc_status | 2 | 2 |
| failures | 2 | 2 |

### v_login_to_submission_funnel

| Field | Non-empty | Total |
|-------|-----------|-------|
| cohort_day | 14 | 14 |
| logged_in | 14 | 14 |
| submitted_within_7d | 14 | 14 |
| conversion | 14 | 14 |

### v_operator_interventions_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 8 | 8 |
| kind | 8 | 8 |
| interventions | 8 | 8 |

### v_pass_redemptions_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 60 | 60 |
| pass_type_id | 60 | 60 |
| passes_issued | 60 | 60 |
| passes_redeemed | 60 | 60 |

### v_purchase_reconciliation_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 12 | 12 |
| ga4_purchases | 12 | 12 |
| stripe_paid_charges | 12 | 12 |
| activity_activations | 12 | 12 |
| ga4_minus_stripe | 12 | 12 |
| activity_minus_stripe | 12 | 12 |

### v_returning_submitters_quarterly

| Field | Non-empty | Total |
|-------|-----------|-------|
| quarter | 1 | 1 |
| submitters | 1 | 1 |
| returning_submitters | 1 | 1 |

### v_revenue_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 5 | 5 |
| product | 5 | 5 |
| charges | 5 | 5 |
| revenue_gbp | 5 | 5 |

### v_signup_to_first_submission

| Field | Non-empty | Total |
|-------|-----------|-------|
| signup_day | 10 | 11 |
| new_accounts | 11 | 11 |
| submitted | 11 | 11 |
| median_hours_to_first_submission | 3 | 11 |

### v_submissions_by_activity_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 6 | 6 |
| activity | 6 | 6 |
| outcome | 6 | 6 |
| completions | 6 | 6 |
| customers | 6 | 6 |

### v_submissions_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 6 | 6 |
| outcome | 6 | 6 |
| submissions | 6 | 6 |
| submitters | 6 | 6 |

### v_subscription_cancellations_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 15 | 15 |
| bundle_id | 15 | 15 |
| cancellations | 15 | 15 |

### v_subscription_renewals_daily

Empty. 0 rows.

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 0 | 0 |
| bundle_id | 0 | 0 |
| renewals | 0 | 0 |

### v_traffic_by_country_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 20 | 20 |
| country | 20 | 20 |
| sessions | 20 | 20 |
| human_sessions | 20 | 20 |
| ai_agent_sessions | 20 | 20 |

### v_traffic_sources_daily

| Field | Non-empty | Total |
|-------|-----------|-------|
| day | 46 | 46 |
| channel | 46 | 46 |
| sessions | 46 | 46 |
| new_users | 46 | 46 |
| engaged_sessions | 46 | 46 |
| engagement_rate | 46 | 46 |

## JSON files (8 total)

All eight JSON files present with valid structure. Each contains: objective name, target (null), supportingMetrics array, levers array, openExperiments array.

- compliance.json: supportingMetrics references v_compliance_status (empty rows)
- conversion-to-paid.json: supportingMetrics populate from v_revenue_daily and v_pass_redemptions_daily
- conversion-to-submission.json: supportingMetrics populate from v_login_to_submission_funnel
- low-running-cost.json: supportingMetrics empty, levers populated
- operator-effort.json: supportingMetrics populate from v_operator_interventions_daily
- retention.json: supportingMetrics reference v_returning_submitters_quarterly, v_subscription_renewals_daily (empty), v_subscription_cancellations_daily
- security.json: supportingMetrics empty, levers populated
- uptime.json: supportingMetrics populate from v_availability_sli_daily and others

## Always-empty fields (entire tables with 0 rows)

Two tables emit no data:

- **v_compliance_status**: All fields empty (0 rows). Referenced by compliance.json objective. Feed is empty, not the view: `compliance_accessibility` and `compliance_fraud_headers` hold 0 rows each in Athena. The writer, `compliance-lake` in `.github/workflows/compliance.yml`, was added 2026-09-08 but only runs on the Monday 06:06 UTC schedule; it had not fired since being added as of the 2026-09-12 and 2026-09-13 exports. First data lands after the 2026-09-14 run.
- **v_subscription_renewals_daily**: All fields empty (0 rows). Referenced by retention.json objective. The first renewal falls due 2026-10-02.

## Sparse fields (non-empty < total rows)

Three fields have partial data:

- **v_dora_runs_daily.median_lead_time_seconds**: 5 non-empty of 8 rows. Expected: `deploy.yml` sets `lead_time_seconds` to null when a run's commit has no merged PR (`merged_at` empty — direct pushes, workflow_dispatch runs), so a workflow/environment group made up entirely of such runs has no lead time to take a median of. No fix.
- **v_signup_to_first_submission.signup_day**: 10 non-empty of 11 rows. One of 322 accounts has a bundle grant with `granted_at` null. The normal grant path (`app/data/dynamoDbBundleRepository.js` lines 27 and 86) always sets `createdAt`, so this is a single off-path row, not a systemic gap. No fix.
- **v_signup_to_first_submission.median_hours_to_first_submission**: 3 non-empty of 11 rows. Expected: null exactly where `submitted = 0` for that cohort day (checked directly — every null row has 0 submissions); most of the 11 signup-day cohorts are from the last two weeks and haven't converted yet. No fix.

## 2026-09-13 nightly status

The 2026-09-13 02:15 UTC nightly completed successfully at 03:20 UTC. Execution ID: 0d6aa607-24d8-4337-be9e-b10cbc035be1. Status: SUCCEEDED. All 29 files (21 CSVs + 8 JSONs) published.
