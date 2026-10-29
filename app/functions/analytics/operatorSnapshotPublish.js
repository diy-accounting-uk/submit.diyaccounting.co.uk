// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/operatorSnapshotPublish.js
//
// Hourly (prod) or weekly (ci) job, run as the last step of the ingestion state machine, that
// reads the analytics views behind the one-stop objectives dashboard and writes one JSON
// snapshot per environment: for each observation of the eight objectives, Today (since midnight
// UK time), Previous day, Last 7 days, Last 30 days with its trend against the 30 days before,
// Last 90 days, and a deep link to where the operator can see more. The API route
// (operatorSnapshotGet.js) only ever reads what this Lambda writes; it never queries Athena
// itself, so the dashboard stays fast even while a query here is slow.

import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";
import {
  buildCloudWatchDashboardLink,
  buildCloudWatchAlarmsOverviewLink,
  buildAthenaSavedQueryLink,
  buildGithubActionsWorkflowLink,
  buildGa4ReportsLink,
} from "../../lib/consoleLinks.js";
import { loadCatalogFromRoot, isActivityListedInEnvironment } from "../../services/productCatalog.js";

const logger = createLogger({ source: "app/functions/analytics/operatorSnapshotPublish.js" });

// The AWS accounts of the organisation, by the name the estate gives each, keyed as v_cost_daily's
// sub_account_id carries them.
export const AWS_ACCOUNT_NAMES_BY_ID = {
  "972912397388": "submit-prod",
  "367191799875": "submit-ci",
  "064390746177": "spreadsheets",
  "887764105431": "management",
  "914216784828": "backup",
  "283165661847": "gateway",
};
const AWS_ACCOUNT_IDS_BY_NAME = Object.fromEntries(Object.entries(AWS_ACCOUNT_NAMES_BY_ID).map(([id, name]) => [name, id]));

// The share of trailing 30-day income the operator dashboard offers as the paid-traffic budget.
export const REINVESTMENT_FRACTION = 0.2;

// The four donation Payment Links' bundle ids (infra/stripe/stripe.toml). v_revenue_daily
// labels each Stripe charge with its bundle id; PayPal donations are separate rows.
const STRIPE_DONATION_PRODUCT_FILTER = "product IN ('donation-10', 'donation-20', 'donation-45', 'donation-custom')";
// The PayPal pull labels a donation receipt donation-paypal (see paypalDonationsPull.js).
const PAYPAL_DONATION_PRODUCT_FILTER = "product = 'donation-paypal'";

/**
 * One started and one completed observation per prod-listed catalogue activity
 * (web/public/submit.catalogue.toml), generated here rather than hand-listed so a new prod
 * listing joins the operator dashboard's activities table (renderActivities in dashboard.html)
 * with no change to this file. The pair share their activity id as an "id::started"/
 * "id::completed" suffix, which is how the page pairs them back into one table row.
 *
 * @returns {Array<object>} observation definitions, two per prod-listed activity
 */
function buildActivityObservations() {
  const catalog = loadCatalogFromRoot();
  const activities = (catalog.activities || []).filter((activity) => isActivityListedInEnvironment(activity, "prod"));
  return activities.flatMap((activity) => [
    {
      id: `${activity.id}::started`,
      label: `${activity.name} — started`,
      unit: "count",
      view: "v_activity_started_daily",
      dayColumn: "day",
      valueExpr: "starts",
      aggregation: "sum",
      where: `activity = '${activity.id}'`,
      reportDataSince: true,
      // v_activity_started_daily groups by whole calendar day, which cannot answer Today
      // since UK midnight accurately (see v_activity_started_hourly.sql), so Today, Previous
      // day and Last 7 days read from the hourly view instead, in the same query shape.
      fastWindowView: "v_activity_started_hourly",
      fastWindowColumn: "hour",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
    {
      id: `${activity.id}::completed`,
      label: `${activity.name} — completed`,
      unit: "count",
      view: "v_submissions_by_activity_daily",
      dayColumn: "day",
      valueExpr: "completions",
      aggregation: "sum",
      where: `activity = '${activity.id}'`,
      reportDataSince: true,
      fastWindowView: "v_submissions_by_activity_hourly",
      fastWindowColumn: "hour",
      deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
    },
  ]);
}

/**
 * Every observation names a view under infra/main/resources/analytics/views (security's
 * observations name a raw Glue table instead: no view sits over the security lake yet, so they
 * read security_hub_findings, guardduty_findings and github_alerts directly), the column it
 * reads, how to aggregate it across a window (sum for a count, avg for a ratio), and the deep
 * link the page shows beside it.
 *
 * Two views carry a coarser grain than the daily views: v_cost_vs_target_monthly is one row
 * per month and v_returning_submitters_quarterly one row per quarter. buildWindowedBatchSql's
 * trailing 30/90-day windows still run against their date column (the month or quarter start),
 * so a window mostly captures at most the one or two period-starts that fall inside it rather
 * than a true daily trend — read a null there as "no period closed in this window", not zero.
 */
export const OBJECTIVE_DEFINITIONS = [
  {
    id: "uptime",
    name: "Uptime",
    observations: [
      {
        id: "probe-pass-rate",
        label: "Probe pass rate",
        unit: "ratio",
        view: "v_availability_sli_daily",
        dayColumn: "day",
        valueExpr: "pass_rate",
        aggregation: "avg",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-operations`),
      },
      {
        id: "error-budget-remaining-runs",
        label: "Error budget remaining",
        unit: "runs",
        view: "v_availability_sli_daily",
        dayColumn: "day",
        valueExpr: "budget_remaining_runs",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-operations`),
      },
      {
        id: "alarms-fired",
        label: "Alarms fired",
        unit: "count",
        view: "v_alarm_state_changes_daily",
        dayColumn: "day",
        valueExpr: "times_fired",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchAlarmsOverviewLink(ctx.region),
      },
      {
        id: "deploy-frequency",
        label: "Deploy frequency",
        unit: "count",
        view: "v_dora_runs_daily",
        dayColumn: "day",
        valueExpr: "runs",
        aggregation: "sum",
        where: "workflow = 'deploy'",
        deepLink: (ctx) => buildGithubActionsWorkflowLink(ctx.githubRepo, "deploy.yml"),
      },
      {
        id: "deploy-failure-rate",
        label: "Deploy failure rate",
        unit: "ratio",
        view: "v_dora_runs_daily",
        dayColumn: "day",
        valueExpr: "failure_rate",
        aggregation: "avg",
        where: "workflow = 'deploy'",
        deepLink: (ctx) => buildGithubActionsWorkflowLink(ctx.githubRepo, "deploy.yml"),
      },
      {
        id: "hmrc-submission-failures",
        label: "HMRC submission failures",
        description: "VAT returns that customers sent to HMRC and that failed, counted from the activity events.",
        unit: "count",
        view: "v_submission_failure_rate_daily",
        dayColumn: "day",
        valueExpr: "failures",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "hmrc-submission-failure-rate",
        label: "HMRC submission failure rate",
        description: "The share of VAT returns sent to HMRC that failed, averaged over the days. A day with no submissions has no rate.",
        unit: "ratio",
        view: "v_submission_failure_rate_daily",
        dayColumn: "day",
        valueExpr: "failure_rate",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "agent-posted-rate",
        label: "Agent runs that posted a result",
        unit: "ratio",
        view: "v_agent_runs_daily",
        dayColumn: "day",
        valueExpr: "posted_rate",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "agent-pr-accepted-rate",
        label: "Agent pull requests accepted",
        unit: "ratio",
        view: "v_agent_runs_daily",
        dayColumn: "day",
        valueExpr: "pr_accepted_rate",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "agent-median-hours-to-close",
        label: "Agent answer to close, median hours",
        unit: "hours",
        view: "v_agent_runs_daily",
        dayColumn: "day",
        valueExpr: "median_hours_to_close",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
    ],
  },
  {
    id: "conversion-to-submission",
    name: "Conversion to submission",
    observations: [
      {
        id: "login-to-submission-conversion",
        label: "Login-to-submission conversion",
        unit: "ratio",
        view: "v_login_to_submission_funnel",
        dayColumn: "cohort_day",
        valueExpr: "conversion",
        aggregation: "avg",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
      },
      {
        id: "completions-by-activity",
        label: "Completions, all activities",
        unit: "count",
        view: "v_submissions_by_activity_daily",
        dayColumn: "day",
        valueExpr: "completions",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "new-accounts",
        label: "New accounts",
        unit: "count",
        view: "v_signup_to_first_submission",
        dayColumn: "signup_day",
        valueExpr: "new_accounts",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "spreadsheets-downloads",
        label: "Spreadsheet downloads",
        description:
          "Downloads of a spreadsheet from the spreadsheets site, from the GA4 download events, added over the days. The first step of the path to a first filing. GA4 reports whole days two days late.",
        unit: "count",
        view: "v_spreadsheets_downloads_daily",
        dayColumn: "day",
        valueExpr: "downloads",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "sessions-from-spreadsheets",
        label: "Submit sessions from the spreadsheets site",
        description:
          "Sessions on the Submit site whose source is the spreadsheets site, from GA4, added over the days. Counts visitors who accepted analytics.",
        unit: "count",
        view: "v_submit_referrals_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        where: "origin = 'spreadsheets'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "sessions-from-www",
        label: "Submit sessions from the gateway site",
        description:
          "Sessions on the Submit site whose source is the gateway site (www.diyaccounting.co.uk), from GA4, added over the days. Counts visitors who accepted analytics.",
        unit: "count",
        view: "v_submit_referrals_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        where: "origin = 'www'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "active-customers-daily",
        label: "Active customers, per day",
        description: "Distinct signed-in customers who made a call on a day, all app clients together, averaged over the days.",
        unit: "count",
        view: "v_active_customers_7d_daily",
        dayColumn: "day",
        valueExpr: "active_users_1d",
        aggregation: "avg",
        where: "app_client = 'all'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "active-customers-7d",
        label: "Active customers, per 7 days",
        description:
          "Distinct signed-in customers who made a call in the 7 days to each day, all app clients together, averaged over the days. Each customer counts once however many days they came.",
        unit: "count",
        view: "v_active_customers_7d_daily",
        dayColumn: "day",
        valueExpr: "active_users_7d",
        aggregation: "avg",
        where: "app_client = 'all'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "new-accounts-submitted",
        label: "New accounts that submitted",
        description:
          "Of the accounts opened in the window, the ones that have made a submission since, added over the days. A recent account may not have submitted yet.",
        unit: "count",
        view: "v_signup_to_first_submission",
        dayColumn: "signup_day",
        valueExpr: "submitted",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "new-accounts-submitted-share",
        label: "New accounts that submitted, share",
        description:
          "The accounts opened in the window that have submitted, as a share of all the accounts opened in it. A recent account may not have submitted yet.",
        unit: "ratio",
        view: "v_signup_to_first_submission",
        dayColumn: "signup_day",
        valueExpr: "submitted",
        aggregation: "ratio",
        denominatorExpr: "new_accounts",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "median-hours-to-first-submission",
        label: "Median hours to first submission",
        description:
          "For the accounts opened each day, the median hours from opening to the first submission, averaged over the days. A day with no submitting account has no figure.",
        unit: "hours",
        view: "v_signup_to_first_submission",
        dayColumn: "signup_day",
        valueExpr: "median_hours_to_first_submission",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "submission-failure-rate",
        label: "VAT submissions that failed",
        description: "The share of VAT returns sent to HMRC that failed, averaged over the days. A day with no submissions has no rate.",
        unit: "ratio",
        view: "v_submission_failure_rate_daily",
        dayColumn: "day",
        valueExpr: "failure_rate",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "sessions-by-channel",
        label: "Sessions, all channels",
        unit: "count",
        view: "v_traffic_sources_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        deepLink: (ctx) => buildGa4ReportsLink(ctx.ga4PropertyId),
      },
      {
        id: "sessions-human",
        label: "Sessions, human visitors",
        unit: "count",
        view: "v_visitors_by_kind_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        where: "visitor_kind = 'human'",
        fastWindowView: "v_visitors_by_kind_hourly",
        fastWindowColumn: "hour",
        deepLink: (ctx) => buildGa4ReportsLink(ctx.ga4PropertyId),
      },
      {
        id: "sessions-operator",
        label: "Sessions, operator visitors",
        unit: "count",
        view: "v_visitors_by_kind_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        where: "visitor_kind = 'operator'",
        fastWindowView: "v_visitors_by_kind_hourly",
        fastWindowColumn: "hour",
        deepLink: (ctx) => buildGa4ReportsLink(ctx.ga4PropertyId),
      },
      {
        id: "sessions-authenticated",
        label: "Sessions, authenticated users",
        unit: "count",
        view: "v_visitors_by_kind_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        where: "visitor_kind = 'authenticated'",
        fastWindowView: "v_visitors_by_kind_hourly",
        fastWindowColumn: "hour",
        deepLink: (ctx) => buildGa4ReportsLink(ctx.ga4PropertyId),
      },
      {
        id: "sessions-bot",
        label: "Visitors, bot",
        unit: "count",
        view: "v_visitors_cloudfront_daily",
        dayColumn: "day",
        valueExpr: "visitors",
        aggregation: "sum",
        where: "visitor_kind = 'bot'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "sessions-synthetic",
        label: "Visitors, synthetic",
        unit: "count",
        view: "v_visitors_cloudfront_daily",
        dayColumn: "day",
        valueExpr: "visitors",
        aggregation: "sum",
        where: "visitor_kind = 'synthetic'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
    ],
  },
  {
    id: "conversion-to-paid",
    name: "Conversion to paid",
    observations: [
      {
        id: "revenue-gbp",
        label: "Revenue",
        unit: "gbp",
        view: "v_revenue_daily",
        dayColumn: "day",
        valueExpr: "revenue_gbp",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
      },
      {
        id: "revenue-donations-gbp",
        label: "Revenue, Stripe donations (Payment Links)",
        unit: "gbp",
        view: "v_revenue_daily",
        dayColumn: "day",
        valueExpr: "revenue_gbp",
        aggregation: "sum",
        where: STRIPE_DONATION_PRODUCT_FILTER,
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "donations-count",
        label: "Stripe donations, charges",
        unit: "count",
        view: "v_revenue_daily",
        dayColumn: "day",
        valueExpr: "charges",
        aggregation: "sum",
        where: STRIPE_DONATION_PRODUCT_FILTER,
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "revenue-paypal-donations-gbp",
        label: "Revenue, PayPal donations",
        unit: "gbp",
        view: "v_revenue_daily",
        dayColumn: "day",
        valueExpr: "revenue_gbp",
        aggregation: "sum",
        where: PAYPAL_DONATION_PRODUCT_FILTER,
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "paypal-donations-count",
        label: "PayPal donations, charges",
        unit: "count",
        view: "v_revenue_daily",
        dayColumn: "day",
        valueExpr: "charges",
        aggregation: "sum",
        where: PAYPAL_DONATION_PRODUCT_FILTER,
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "revenue-subscriptions-gbp",
        label: "Revenue, subscriptions",
        unit: "gbp",
        view: "v_revenue_daily",
        dayColumn: "day",
        valueExpr: "revenue_gbp",
        aggregation: "sum",
        where: `product NOT LIKE 'donation-%' AND product NOT LIKE 'paypal-%'`,
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "passes-issued",
        label: "Passes issued",
        unit: "count",
        view: "v_pass_redemptions_daily",
        dayColumn: "day",
        valueExpr: "passes_issued",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "passes-redeemed",
        label: "Passes redeemed",
        unit: "count",
        view: "v_pass_redemptions_daily",
        dayColumn: "day",
        valueExpr: "passes_redeemed",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "paid-landings",
        label: "Paid landings, Google (gclid)",
        description: "Page requests that arrived with a Google Ads click id (gclid), added over the days.",
        unit: "count",
        view: "v_paid_landings_daily",
        dayColumn: "day",
        valueExpr: "paid_landings",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ads-cost-gbp",
        label: "Google Ads cost",
        unit: "gbp",
        view: "v_ads_cost_daily",
        dayColumn: "day",
        valueExpr: "cost_gbp",
        aggregation: "sum",
        where: "platform = 'google'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ads-cost-per-paid-landing-gbp",
        label: "Google Ads cost per paid landing",
        unit: "gbp",
        view: "v_ads_cost_per_paid_landing_daily",
        dayColumn: "day",
        valueExpr: "cost_per_paid_landing_gbp",
        aggregation: "avg",
        where: "platform = 'google'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "contribution-gbp",
        label: "Contribution",
        description:
          "Revenue less the AWS bill in pounds less Ads cost (Google and Microsoft), added over the days. The AWS bill is in dollars and is converted at the European Central Bank rate of each day.",
        unit: "gbp",
        view: "v_contribution_daily",
        dayColumn: "day",
        valueExpr: "contribution_gbp",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ads-impressions",
        label: "Google Ads impressions",
        description: "Times a Google Ads advertisement was shown, added over the days.",
        unit: "count",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "impressions",
        aggregation: "sum",
        where: "platform = 'google'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ads-clicks",
        label: "Google Ads clicks",
        description: "Clicks on Google Ads advertisements, added over the days.",
        unit: "count",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "clicks",
        aggregation: "sum",
        where: "platform = 'google'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ads-ctr",
        label: "Google Ads click-through rate",
        description: "Clicks divided by impressions for the day, averaged over the days. A day with no impressions has no rate.",
        unit: "ratio",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "ctr",
        aggregation: "avg",
        where: "platform = 'google'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ads-cost-per-click-gbp",
        label: "Google Ads cost per click",
        description: "The day's Google Ads cost divided by the day's clicks, averaged over the days. A day with no clicks has no figure.",
        unit: "gbp",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "cost_per_click_gbp",
        aggregation: "avg",
        where: "platform = 'google'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ms-ads-cost-gbp",
        label: "Microsoft Ads cost",
        description: "Microsoft Advertising spend in pounds, added over the days.",
        unit: "gbp",
        view: "v_ads_cost_daily",
        dayColumn: "day",
        valueExpr: "cost_gbp",
        aggregation: "sum",
        where: "platform = 'microsoft'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ms-ads-impressions",
        label: "Microsoft Ads impressions",
        description: "Times a Microsoft Advertising advertisement was shown, added over the days.",
        unit: "count",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "impressions",
        aggregation: "sum",
        where: "platform = 'microsoft'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ms-ads-clicks",
        label: "Microsoft Ads clicks",
        description: "Clicks on Microsoft Advertising advertisements, added over the days.",
        unit: "count",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "clicks",
        aggregation: "sum",
        where: "platform = 'microsoft'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ms-ads-ctr",
        label: "Microsoft Ads click-through rate",
        description: "Clicks divided by impressions for the day, averaged over the days. A day with no impressions has no rate.",
        unit: "ratio",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "ctr",
        aggregation: "avg",
        where: "platform = 'microsoft'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ms-ads-cost-per-click-gbp",
        label: "Microsoft Ads cost per click",
        description:
          "The day's Microsoft Advertising cost divided by the day's clicks, averaged over the days. A day with no clicks has no figure.",
        unit: "gbp",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "cost_per_click_gbp",
        aggregation: "avg",
        where: "platform = 'microsoft'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ms-paid-landings",
        label: "Paid landings, Microsoft (msclkid)",
        description: "Page requests that arrived with a Microsoft Advertising click id (msclkid), added over the days.",
        unit: "count",
        view: "v_paid_landings_daily",
        dayColumn: "day",
        valueExpr: "msclkid_landings",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ms-ads-cost-per-paid-landing-gbp",
        label: "Microsoft Ads cost per paid landing",
        description:
          "The day's Microsoft Advertising cost divided by the day's msclkid landings, averaged over the days. A day with no landing has no figure.",
        unit: "gbp",
        view: "v_ads_cost_per_paid_landing_daily",
        dayColumn: "day",
        valueExpr: "cost_per_paid_landing_gbp",
        aggregation: "avg",
        where: "platform = 'microsoft'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "ms-ads-conversions",
        label: "Microsoft Ads conversions",
        description: "Conversions Microsoft Advertising counts, added over the days.",
        unit: "count",
        view: "v_ads_performance_daily",
        dayColumn: "day",
        valueExpr: "conversions",
        aggregation: "sum",
        where: "platform = 'microsoft'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "charges-without-activation",
        label: "Charges with no activation",
        description:
          "Days' Stripe paid charges that have no subscription-activated event, added over the days. Above zero means a customer paid and may have no bundle.",
        unit: "count",
        view: "v_purchase_reconciliation_daily",
        dayColumn: "day",
        valueExpr: "greatest(-activity_minus_stripe, 0)",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
    ],
  },
  {
    id: "low-running-cost",
    name: "AWS costs",
    observations: [
      {
        id: "monthly-cost-usd",
        label: "Monthly cost",
        unit: "usd",
        view: "v_cost_vs_target_monthly",
        dayColumn: "month",
        valueExpr: "billed_cost_usd",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "cost-variance-vs-target-usd",
        label: "Cost vs $64.77 target",
        unit: "usd",
        view: "v_cost_vs_target_monthly",
        dayColumn: "month",
        valueExpr: "variance_usd",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "bedrock-cost-per-posted-run-usd",
        label: "Bedrock cost per agent run that posted",
        description:
          "The day's Claude on Bedrock cost divided by the agent runs that posted a result that day, averaged over the days. The cost export lands a day or two late.",
        unit: "usd",
        view: "v_agent_cost_daily",
        dayColumn: "day",
        valueExpr: "cost_per_posted_run_usd",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "bedrock-cost-per-accepted-pr-usd",
        label: "Bedrock cost per accepted agent pull request",
        description:
          "The day's Claude on Bedrock cost divided by the agent pull requests a person merged that day, averaged over the days.",
        unit: "usd",
        view: "v_agent_cost_daily",
        dayColumn: "day",
        valueExpr: "cost_per_accepted_pr_usd",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "cost-per-completion-usd",
        label: "Cost per completion",
        unit: "usd",
        view: "v_cost_per_submission_daily",
        dayColumn: "day",
        valueExpr: "cost_per_completion_usd",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "cost-submit-prod-usd",
        label: "Cost in submit-prod",
        unit: "usd",
        view: "v_cost_daily",
        dayColumn: "day",
        valueExpr: "billed_cost_usd",
        aggregation: "sum",
        where: `sub_account_id = '${AWS_ACCOUNT_IDS_BY_NAME["submit-prod"]}'`,
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "cost-submit-ci-usd",
        label: "Cost in submit-ci",
        unit: "usd",
        view: "v_cost_daily",
        dayColumn: "day",
        valueExpr: "billed_cost_usd",
        aggregation: "sum",
        where: `sub_account_id = '${AWS_ACCOUNT_IDS_BY_NAME["submit-ci"]}'`,
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "cost-other-accounts-usd",
        label: "Cost in the other accounts",
        unit: "usd",
        view: "v_cost_daily",
        dayColumn: "day",
        valueExpr: "billed_cost_usd",
        aggregation: "sum",
        where: `sub_account_id NOT IN ('${AWS_ACCOUNT_IDS_BY_NAME["submit-prod"]}', '${AWS_ACCOUNT_IDS_BY_NAME["submit-ci"]}')`,
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "cost-bedrock-usd",
        label: "Claude on Bedrock, all models",
        unit: "usd",
        view: "v_cost_daily",
        dayColumn: "day",
        valueExpr: "billed_cost_usd",
        aggregation: "sum",
        where: "service_name LIKE '%Bedrock%'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "cost-cloudwatch-usd",
        label: "CloudWatch",
        unit: "usd",
        view: "v_cost_daily",
        dayColumn: "day",
        valueExpr: "billed_cost_usd",
        aggregation: "sum",
        where: "service_name LIKE '%CloudWatch%'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "cost-cloudfront-usd",
        label: "CloudFront",
        unit: "usd",
        view: "v_cost_daily",
        dayColumn: "day",
        valueExpr: "billed_cost_usd",
        aggregation: "sum",
        where: "service_name LIKE '%CloudFront%'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
    ],
  },
  {
    id: "security",
    name: "Security",
    observations: [
      // security_hub_findings and guardduty_findings write one row per active finding each
      // day, plus a zero_findings heartbeat row with no finding_id on a day with none; the
      // finding_id filter excludes that heartbeat so a quiet day counts as zero, not one.
      {
        id: "security-hub-open-findings",
        label: "Security Hub open findings",
        unit: "count",
        view: "security_hub_findings",
        dayColumn: "dt",
        valueExpr: "1",
        aggregation: "count",
        where: "finding_id IS NOT NULL",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "security-hub-critical-findings",
        label: "Security Hub critical findings",
        unit: "count",
        view: "security_hub_findings",
        dayColumn: "dt",
        valueExpr: "1",
        aggregation: "count",
        where: "finding_id IS NOT NULL AND severity_label = 'CRITICAL'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "guardduty-open-findings",
        label: "GuardDuty open findings",
        unit: "count",
        view: "guardduty_findings",
        dayColumn: "dt",
        valueExpr: "1",
        aggregation: "count",
        where: "finding_id IS NOT NULL",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "github-open-alerts",
        label: "GitHub open alerts",
        unit: "count",
        view: "github_alerts",
        dayColumn: "dt",
        valueExpr: "count",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
    ],
  },
  {
    id: "retention",
    name: "Retention",
    observations: [
      {
        id: "submitters-90d",
        label: "Submitters, 90 days to the latest day",
        unit: "count",
        view: "v_returning_submitters_rolling_daily",
        dayColumn: "day",
        valueExpr: "submitters_90d",
        aggregation: "latest",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
      },
      {
        id: "returning-submitters",
        label: "Returning submitters, 90 days to the latest day",
        unit: "count",
        view: "v_returning_submitters_rolling_daily",
        dayColumn: "day",
        valueExpr: "returning_submitters_90d",
        aggregation: "latest",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
      },
      {
        id: "retention-active-customers-7d",
        label: "Active customers, per 7 days",
        description:
          "Distinct signed-in customers who made a call in the 7 days to each day, all app clients together, averaged over the days. The base the retained submitters come from.",
        unit: "count",
        view: "v_active_customers_7d_daily",
        dayColumn: "day",
        valueExpr: "active_users_7d",
        aggregation: "avg",
        where: "app_client = 'all'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "retention-new-accounts",
        label: "New accounts",
        description: "Accounts opened, added over the days.",
        unit: "count",
        view: "v_signup_to_first_submission",
        dayColumn: "signup_day",
        valueExpr: "new_accounts",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "retention-new-accounts-submitted-share",
        label: "New accounts that submitted, share",
        description:
          "The accounts opened in the window that have submitted, as a share of all the accounts opened in it. A recent account may not have submitted yet.",
        unit: "ratio",
        view: "v_signup_to_first_submission",
        dayColumn: "signup_day",
        valueExpr: "submitted",
        aggregation: "ratio",
        denominatorExpr: "new_accounts",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "retention-passes-issued",
        label: "Passes issued",
        unit: "count",
        view: "v_pass_redemptions_daily",
        dayColumn: "day",
        valueExpr: "passes_issued",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "subscription-renewals",
        label: "Subscription renewals",
        unit: "count",
        view: "v_subscription_renewals_daily",
        dayColumn: "day",
        valueExpr: "renewals",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
      },
      {
        id: "subscription-cancellations",
        label: "Subscription cancellations",
        unit: "count",
        view: "v_subscription_cancellations_daily",
        dayColumn: "day",
        valueExpr: "cancellations",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
      },
    ],
  },
  {
    id: "operator-effort",
    name: "Operator effort",
    observations: [
      {
        id: "agent-cost-per-posted-run-usd",
        label: "Agent cost per run that posted",
        description: "The day's Claude on Bedrock cost divided by the agent runs that posted a result that day, averaged over the days.",
        unit: "usd",
        view: "v_agent_cost_daily",
        dayColumn: "day",
        valueExpr: "cost_per_posted_run_usd",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "agent-cost-per-accepted-pr-usd",
        label: "Agent cost per accepted pull request",
        description:
          "The day's Claude on Bedrock cost divided by the agent pull requests a person merged that day, averaged over the days.",
        unit: "usd",
        view: "v_agent_cost_daily",
        dayColumn: "day",
        valueExpr: "cost_per_accepted_pr_usd",
        aggregation: "avg",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "operator-interventions-total",
        label: "Operator interventions, all kinds",
        unit: "count",
        view: "v_operator_interventions_daily",
        dayColumn: "day",
        valueExpr: "interventions",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "operator-manual-dispatches",
        label: "Hand-dispatched workflow runs",
        unit: "count",
        view: "v_operator_interventions_daily",
        dayColumn: "day",
        valueExpr: "interventions",
        aggregation: "sum",
        where: "kind = 'manual-dispatch'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "operator-authored-commits",
        label: "Operator-authored commits",
        unit: "count",
        view: "v_operator_interventions_daily",
        dayColumn: "day",
        valueExpr: "interventions",
        aggregation: "sum",
        where: "kind = 'commit'",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
    ],
  },
  {
    id: "compliance",
    name: "Compliance",
    observations: [
      {
        id: "accessibility-open-findings",
        label: "Accessibility open findings",
        unit: "count",
        view: "v_compliance_status",
        dayColumn: "day",
        valueExpr: "open_findings",
        aggregation: "sum",
        where: "area = 'accessibility'",
        deepLink: (ctx) => buildGithubActionsWorkflowLink(ctx.githubRepo, "compliance.yml"),
      },
      {
        id: "fraud-header-open-findings",
        label: "Fraud-prevention header months needing action",
        unit: "count",
        view: "v_compliance_status",
        dayColumn: "day",
        valueExpr: "open_findings",
        aggregation: "sum",
        where: "area = 'fraud-prevention-headers'",
        deepLink: (ctx) => buildGithubActionsWorkflowLink(ctx.githubRepo, "fraud-header-check.yml"),
      },
    ],
  },
  {
    // Not one of the page's eight objectives (OBJECTIVE_ORDER in dashboard.html): the company
    // accounts panel reads this objective's observations directly and renders its own block
    // above them, rather than the generic trend table renderObjective builds for the eight.
    // The company_accounts table (CompanyBookTables.java) carries no rows until the company's
    // book is named, so every query here returns SQL NULL rather than failing - "max" over zero
    // matching rows is a null aggregate, not an empty result set - and the panel reads that as
    // nothing to show yet.
    id: "company-accounts",
    name: "Company accounts",
    observations: [
      {
        id: "company-cash-at-bank",
        label: "Cash at bank",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "cashatbank",
        aggregation: "latest",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-turnover",
        label: "Turnover",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.profitandloss.turnover",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-costs",
        label: "Costs",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.profitandloss.costs",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-profit",
        label: "Profit",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.profitandloss.profit",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-fixed-assets",
        label: "Fixed assets",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.balancesheet.currentyear.fixedassets",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-current-assets",
        label: "Current assets",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.balancesheet.currentyear.currentassets",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-creditors-within-one-year",
        label: "Creditors: within one year",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.balancesheet.currentyear.creditorswithinoneyear",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-creditors-after-one-year",
        label: "Creditors: after one year",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.balancesheet.currentyear.creditorsafteroneyear",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-called-up-share-capital",
        label: "Called up share capital",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.balancesheet.currentyear.calledupsharecapital",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-profit-and-loss-account",
        label: "Profit and loss account",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.balancesheet.currentyear.profitandlossaccount",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-capital-and-reserves",
        label: "Capital and reserves",
        unit: "gbp",
        view: "company_accounts",
        dayColumn: "dt",
        valueExpr: "accounts.balancesheet.currentyear.capitalandreserves",
        aggregation: "max",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-contribution-gbp",
        label: "Contribution",
        description:
          "Revenue less the AWS bill in pounds less Ads cost (Google and Microsoft), added over the days. The AWS bill is in dollars and is converted at the European Central Bank rate of each day.",
        unit: "gbp",
        view: "v_contribution_daily",
        dayColumn: "day",
        valueExpr: "contribution_gbp",
        aggregation: "sum",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-net-monthly-burn-gbp",
        label: "Net monthly burn",
        description:
          "The period's costs less its turnover in the latest company book, spread over the months of the accounting period. Zero or below means the book made a profit.",
        unit: "gbp",
        view: "v_company_runway",
        dayColumn: "dt",
        valueExpr: "net_monthly_burn_gbp",
        aggregation: "latest",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
      {
        id: "company-runway-months",
        label: "Runway",
        description:
          "Cash at bank less creditors due within one year, divided by the net monthly burn, in months. Not shown while the book makes a profit.",
        unit: "months",
        view: "v_company_runway",
        dayColumn: "dt",
        valueExpr: "runway_months",
        aggregation: "latest",
        deepLink: (ctx) => buildAthenaSavedQueryLink(ctx.region, ctx.athenaWorkGroupName),
      },
    ],
  },
  {
    // Not one of the page's eight objectives (OBJECTIVE_ORDER in dashboard.html), the same way
    // company-accounts sits outside them above: renderActivities reads this objective's
    // observations into its own started/completed table instead of the generic trend table.
    id: "activity-started-and-completed",
    name: "Activity started and completed",
    observations: buildActivityObservations(),
  },
];

// Which way a figure should move for the business: "up" when a rise is good, "down" when a
// fall is good. An observation not listed has no preferred direction and its trend is not
// coloured. Every activity's started and completed pair counts as "up".
const BETTER_UP_IDS = [
  "probe-pass-rate",
  "error-budget-remaining-runs",
  "deploy-frequency",
  "agent-posted-rate",
  "agent-pr-accepted-rate",
  "login-to-submission-conversion",
  "completions-by-activity",
  "new-accounts",
  "sessions-by-channel",
  "sessions-human",
  "revenue-gbp",
  "revenue-donations-gbp",
  "donations-count",
  "revenue-paypal-donations-gbp",
  "paypal-donations-count",
  "revenue-subscriptions-gbp",
  "passes-issued",
  "passes-redeemed",
  "paid-landings",
  "submitters-90d",
  "returning-submitters",
  "retention-passes-issued",
  "subscription-renewals",
  "company-turnover",
  "company-profit",
  "contribution-gbp",
  "company-contribution-gbp",
  "company-runway-months",
  "ads-impressions",
  "ads-clicks",
  "ads-ctr",
  "ms-ads-impressions",
  "ms-ads-clicks",
  "ms-ads-ctr",
  "ms-ads-conversions",
  "spreadsheets-downloads",
  "sessions-from-spreadsheets",
  "sessions-from-www",
  "active-customers-daily",
  "active-customers-7d",
  "new-accounts-submitted",
  "new-accounts-submitted-share",
  "retention-active-customers-7d",
  "retention-new-accounts",
  "retention-new-accounts-submitted-share",
];
const BETTER_DOWN_IDS = [
  "alarms-fired",
  "hmrc-submission-failures",
  "hmrc-submission-failure-rate",
  "submission-failure-rate",
  "bedrock-cost-per-posted-run-usd",
  "bedrock-cost-per-accepted-pr-usd",
  "agent-cost-per-posted-run-usd",
  "agent-cost-per-accepted-pr-usd",
  "deploy-failure-rate",
  "agent-median-hours-to-close",
  "monthly-cost-usd",
  "cost-variance-vs-target-usd",
  "cost-per-completion-usd",
  "cost-submit-prod-usd",
  "cost-submit-ci-usd",
  "cost-other-accounts-usd",
  "cost-bedrock-usd",
  "cost-cloudwatch-usd",
  "cost-cloudfront-usd",
  "ads-cost-gbp",
  "ads-cost-per-paid-landing-gbp",
  "security-hub-open-findings",
  "security-hub-critical-findings",
  "guardduty-open-findings",
  "github-open-alerts",
  "subscription-cancellations",
  "operator-interventions-total",
  "operator-manual-dispatches",
  "operator-authored-commits",
  "accessibility-open-findings",
  "fraud-header-open-findings",
  "company-costs",
  "company-net-monthly-burn-gbp",
  "ads-cost-per-click-gbp",
  "ms-ads-cost-gbp",
  "ms-ads-cost-per-click-gbp",
  "ms-ads-cost-per-paid-landing-gbp",
  "charges-without-activation",
  "median-hours-to-first-submission",
];

export function betterDirection(observationId) {
  if (observationId.includes("::") || BETTER_UP_IDS.includes(observationId)) return "up";
  if (BETTER_DOWN_IDS.includes(observationId)) return "down";
  return null;
}

const PERIOD_NAME_BY_DAY_COLUMN = { month: "months", quarter: "quarters" };

// How a window's figure is built from the days, months or quarters inside it.
export function measureDescription(observation) {
  const periods = PERIOD_NAME_BY_DAY_COLUMN[observation.dayColumn] ?? "days";
  if (observation.aggregation === "sum") return `total of the ${periods}`;
  if (observation.aggregation === "avg") return `average of the ${periods}`;
  if (observation.aggregation === "ratio") return `total of ${observation.valueExpr} over total of ${observation.denominatorExpr}`;
  if (observation.aggregation === "max") return "highest in the window";
  if (observation.aggregation === "latest") return "latest day in the window";
  return "count of rows";
}

// What each objective measures (its SLI), the target where one is set, and what moves it.
export const OBJECTIVE_GUIDANCE = {
  "uptime": {
    sli: "Share of synthetic probe runs that pass.",
    levers: "Fix the failing probe, add capacity to the slow dependency, roll back a bad deploy.",
  },
  "conversion-to-submission": {
    sli: "Share of signed-in visitors who go on to submit.",
    levers: "Sign-in friction, the first screen after sign-in, guide and video content, search and ad landing pages.",
  },
  "conversion-to-paid": {
    sli: "Revenue and paid conversions from donations, subscriptions and passes, and the Google and Microsoft Ads spend and paid landings that lead to them.",
    levers: "Price, the bundle page, the donation prompt after a submission, pass campaigns, the ads daily budget.",
  },
  "low-running-cost": {
    sli: "AWS spend per month, per account, per service and per completed submission.",
    target: "AWS spend of $64.77 a month.",
    levers: "Retire idle stacks, shorten log retention, cut provisioned concurrency.",
  },
  "security": {
    sli: "Open findings in Security Hub, GuardDuty and GitHub.",
    levers: "Patch the dependency or fix the configuration each finding names.",
  },
  "retention": {
    sli: "Customers who submit again, renew, or cancel.",
    levers: "Reminders before each deadline, renewal prompts, cancellation follow-up.",
  },
  "operator-effort": {
    sli: "Hand-run workflows and operator-authored commits.",
    levers: "Automate the repeated hand-run workflow; move the commit to a sub-agent.",
  },
  "compliance": {
    sli: "Open accessibility and fraud-prevention header findings.",
    levers: "Fix the finding the compliance workflow reports.",
  },
};

let cachedAthenaClient = null;
let cachedS3Client = null;

function getAthenaClient() {
  if (!cachedAthenaClient) {
    cachedAthenaClient = new AthenaClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedAthenaClient;
}

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Athena polling and result parsing, duplicated from analyticsMetricsPublish.js rather than
// imported: that module's query shape is one metric for one day, this one is a windowed
// trend for one observation, and the two are free to diverge without either dragging the
// other's tests along.
export async function pollUntilTerminal(athenaClient, queryExecutionId) {
  const maxAttempts = Number(process.env.ATHENA_POLL_MAX_ATTEMPTS || 90);
  const intervalMs = Number(process.env.ATHENA_POLL_INTERVAL_MS || 1000);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { QueryExecution } = await athenaClient.send(new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }));
    const state = QueryExecution?.Status?.State;

    if (state === "SUCCEEDED") return;
    if (state === "FAILED" || state === "CANCELLED") {
      const reason = QueryExecution?.Status?.StateChangeReason || "no reason given";
      throw new Error(`Athena query ${queryExecutionId} ${state}: ${reason}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`Athena query ${queryExecutionId} did not reach a terminal state after ${maxAttempts} polls`);
}

function recordOf(header, row) {
  const record = {};
  header.forEach((columnName, index) => {
    record[columnName] = row.Data?.[index]?.VarCharValue ?? null;
  });
  return record;
}

export function parseResultSet(resultSet) {
  const rows = resultSet?.Rows ?? [];
  if (rows.length === 0) return [];

  const header = rows[0].Data.map((cell) => cell.VarCharValue);
  return rows.slice(1).map((row) => recordOf(header, row));
}

// Athena returns up to 1000 rows a page and only the first page carries the header row.
async function readAllResultPages(athenaClient, queryExecutionId) {
  const first = await athenaClient.send(new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId }));
  const records = parseResultSet(first.ResultSet);
  const header = (first.ResultSet?.Rows?.[0]?.Data ?? []).map((cell) => cell.VarCharValue);
  let nextToken = first.NextToken;
  while (nextToken) {
    const page = await athenaClient.send(new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId, NextToken: nextToken }));
    records.push(...(page.ResultSet?.Rows ?? []).map((row) => recordOf(header, row)));
    nextToken = page.NextToken;
  }
  return records;
}

// Athena marks HIVE_S3_THROTTLING as not retryable, but it is S3 refusing the listing rate of
// the moment, so the same query started again after a pause normally succeeds.
function isS3Throttling(error) {
  return error.message.includes("HIVE_S3_THROTTLING");
}

// GENERIC_INTERNAL_ERROR is Athena failing on its own side, not a SQL error, and the same query
// started again normally succeeds. SQL errors such as SYNTAX_ERROR are not matched here.
function isAthenaInternalError(error) {
  return error.message.includes("FAILED: GENERIC_INTERNAL_ERROR");
}

export async function runAthenaQuery({ workGroup, database, sql }) {
  const athenaClient = getAthenaClient();
  const maxThrottleRetries = Number(process.env.ATHENA_THROTTLE_MAX_RETRIES || 2);
  const throttleBackoffMs = Number(process.env.ATHENA_THROTTLE_BACKOFF_MS || 10000);
  const maxInternalErrorRetries = 1;
  let throttleRetries = 0;
  let internalErrorRetries = 0;

  for (;;) {
    const { QueryExecutionId } = await athenaClient.send(
      new StartQueryExecutionCommand({
        QueryString: sql,
        QueryExecutionContext: { Database: database },
        WorkGroup: workGroup,
      }),
    );

    try {
      await pollUntilTerminal(athenaClient, QueryExecutionId);
    } catch (error) {
      if (throttleRetries < maxThrottleRetries && isS3Throttling(error)) {
        logger.warn({
          message: "Athena query throttled by S3, starting it again",
          queryExecutionId: QueryExecutionId,
          retry: throttleRetries + 1,
        });
        await sleep(throttleBackoffMs * 2 ** throttleRetries);
        throttleRetries += 1;
        continue;
      }
      if (internalErrorRetries < maxInternalErrorRetries && isAthenaInternalError(error)) {
        logger.warn({
          message: "Athena query failed with its own internal error, starting it again",
          queryExecutionId: QueryExecutionId,
          retry: internalErrorRetries + 1,
        });
        internalErrorRetries += 1;
        continue;
      }
      throw error;
    }

    return readAllResultPages(athenaClient, QueryExecutionId);
  }
}

// The UK calendar date now, and the instants the UK day boundaries fall on, as Athena
// evaluates them. Athena's session zone is UTC, so the hourly views' timestamps are UTC.
const UK_TODAY = "CAST(current_timestamp AT TIME ZONE 'Europe/London' AS date)";
const UK_MIDNIGHT_TODAY =
  "CAST(with_timezone(date_trunc('day', CAST(current_timestamp AT TIME ZONE 'Europe/London' AS timestamp)), 'Europe/London') AT TIME ZONE 'UTC' AS timestamp)";
const UK_MIDNIGHT_YESTERDAY =
  "CAST(with_timezone(date_trunc('day', CAST(current_timestamp AT TIME ZONE 'Europe/London' AS timestamp)) - interval '1' day, 'Europe/London') AT TIME ZONE 'UTC' AS timestamp)";

// Windows every day-grain observation gets. Today and Previous day are the UK calendar days.
const WINDOWED_COLUMNS = [
  ["today", (day) => `${day} >= ${UK_TODAY}`],
  ["prev_1", (day) => `${day} = date_add('day', -1, ${UK_TODAY})`],
  ["last_7", (day) => `${day} > date_add('day', -7, current_date)`],
  ["last_30", (day) => `${day} > date_add('day', -30, current_date)`],
  ["prev_30", (day) => `${day} > date_add('day', -60, current_date) AND ${day} <= date_add('day', -30, current_date)`],
  ["last_90", (day) => `${day} > date_add('day', -90, current_date)`],
  ["prev_90", (day) => `${day} > date_add('day', -180, current_date) AND ${day} <= date_add('day', -90, current_date)`],
];

// The windows an hourly-grain view answers: Today since UK midnight, Previous day, Last 7 days.
const FAST_WINDOW_COLUMNS = [
  ["today", (hour) => `${hour} >= ${UK_MIDNIGHT_TODAY}`],
  ["prev_1", (hour) => `${hour} >= ${UK_MIDNIGHT_YESTERDAY} AND ${hour} < ${UK_MIDNIGHT_TODAY}`],
  ["last_7", (hour) => `${hour} > date_add('day', -7, current_timestamp)`],
];

// Views whose sources report whole days (the FOCUS cost export, Google Ads, GA4's daily export,
// Stripe and PayPal reconciliation, the operator effort pulls, security findings, the company
// book, rolling retention). Their Today is the latest reading, never a count of zero for a day
// the source has not reported yet; the reading's own day goes in `today_as_of`.
export const LATEST_READING_VIEWS = new Set([
  "v_dora_runs_daily",
  "v_agent_runs_daily",
  "v_traffic_sources_daily",
  "v_visitors_by_kind_daily",
  "v_visitors_cloudfront_daily",
  "v_revenue_daily",
  "v_paid_landings_daily",
  "v_ads_cost_daily",
  "v_ads_cost_per_paid_landing_daily",
  "v_cost_per_submission_daily",
  "v_cost_daily",
  "v_cost_by_resource_daily",
  "v_agent_cost_daily",
  "security_hub_findings",
  "guardduty_findings",
  "github_alerts",
  "v_returning_submitters_rolling_daily",
  "v_subscription_renewals_daily",
  "v_subscription_cancellations_daily",
  "v_operator_interventions_daily",
  "v_compliance_status",
  "company_accounts",
  "v_company_runway",
  "v_contribution_daily",
  "v_ads_performance_daily",
  "v_spreadsheets_downloads_daily",
  "v_submit_referrals_daily",
]);

// A view with one row per month or quarter has no Today or Previous day.
function isPeriodicDayColumn(dayColumn) {
  return dayColumn in PERIOD_NAME_BY_DAY_COLUMN;
}

// Observation `i` of a batch reads its figures from the columns named o<i>_<column>.
function observationColumnPrefix(index) {
  return `o${index}_`;
}

function caseFilter(where) {
  return where ? ` AND (${where})` : "";
}

/**
 * Every window of every observation that reads one view through one day column, in one query:
 * observation `i` gets the columns `o<i>_today`, `o<i>_prev_1`, `o<i>_last_7`, `o<i>_last_30`,
 * `o<i>_prev_30`, `o<i>_last_90` and `o<i>_prev_90`, and its `where` moves into its own CASE
 * conditions. A window with no rows reads as SQL NULL rather than a false zero.
 *
 * A view in LATEST_READING_VIEWS reports whole days, so its `o<i>_today` is the value on the
 * newest day up to today and `o<i>_today_as_of` is that day. A view with one row per month or
 * quarter has no Today or Previous day, so those columns are left out.
 *
 * An observation with aggregation "ratio" divides the window's total of `valueExpr` by its total
 * of `denominatorExpr`, so a share is weighted by the days' sizes rather than averaged.
 *
 * `reportDataSince` adds `o<i>_data_since`, the earliest day the view holds rows for that
 * observation, so a window longer than the data reads as "since <day>" on the page rather than
 * as a full window.
 *
 * Each query lists every partition prefix its view's tables project and reads their objects, so
 * every run makes one query per view rather than one per observation.
 *
 * @param {{view: string, dayColumn: string, observations: Array<{valueExpr: string, denominatorExpr?: string, aggregation: string, where?: string, reportDataSince?: boolean}>}} group
 * @returns {string}
 */
export function buildWindowedBatchSql({ view, dayColumn, observations }) {
  const latestReading = LATEST_READING_VIEWS.has(view);
  const periodic = isPeriodicDayColumn(dayColumn);
  const columns = observations.flatMap(({ valueExpr, denominatorExpr, aggregation, where, reportDataSince }, index) => {
    const prefix = observationColumnPrefix(index);
    const filter = caseFilter(where);
    // "latest" reads the value on the newest day inside the window, for a balance that a
    // sum, average or highest-day figure would misstate; a whole-day source's Today reads its
    // newest day up to today the same way.
    const windowColumns = WINDOWED_COLUMNS.filter(([alias]) => !(periodic && (alias === "today" || alias === "prev_1"))).map(
      ([alias, condition]) => {
        const newestDay = latestReading && alias === "today";
        if (aggregation === "latest" || newestDay) {
          const window = newestDay ? `${dayColumn} <= ${UK_TODAY}` : condition(dayColumn);
          return `max_by(${valueExpr}, ${dayColumn}) FILTER (WHERE ${window}${filter}) AS ${prefix}${alias}`;
        }
        if (aggregation === "ratio") {
          const inWindow = `CASE WHEN ${condition(dayColumn)}${filter}`;
          return `cast(sum(${inWindow} THEN ${valueExpr} END) AS double) / nullif(sum(${inWindow} THEN ${denominatorExpr} END), 0) AS ${prefix}${alias}`;
        }
        return `${aggregation}(CASE WHEN ${condition(dayColumn)}${filter} THEN ${valueExpr} END) AS ${prefix}${alias}`;
      },
    );
    if (latestReading && !periodic) {
      windowColumns.push(`cast(max(${dayColumn}) FILTER (WHERE ${dayColumn} <= ${UK_TODAY}${filter}) AS varchar) AS ${prefix}today_as_of`);
    }
    // The view's earliest day, whatever the observation's filter: a window that ends on or after
    // it was covered by the source, so an empty window there is a measured zero.
    windowColumns.push(`cast(min(${dayColumn}) AS varchar) AS ${prefix}first_day`);
    if (reportDataSince) {
      const earliest = where ? `min(CASE WHEN ${where} THEN ${dayColumn} END)` : `min(${dayColumn})`;
      windowColumns.push(`cast(${earliest} AS varchar) AS ${prefix}data_since`);
    }
    return windowColumns;
  });
  return `SELECT ${columns.join(",\n       ")}\nFROM   ${view}`;
}

/**
 * Today (since UK midnight), Previous day and Last 7 days for the observations whose events
 * have an hourly-grain view, computed against that view rather than buildWindowedBatchSql's
 * `dayColumn`: a day-grain column cannot answer a window that starts at UK midnight when the
 * day's rows are grouped by UTC or by a source's own day.
 *
 * One query answers every observation that reads the same hourly view: observation `i` gets
 * the columns `o<i>_today`, `o<i>_prev_1` and `o<i>_last_7`, and its `where` moves into its own
 * CASE conditions. Each query lists and reads every object of the view's 8 days of partitions,
 * so one query per observation (16 activities each way) read the same objects 16 times over.
 *
 * @param {{fastWindowView: string, fastWindowColumn: string, observations: Array<{valueExpr: string, aggregation: string, where?: string}>}} group
 * @returns {string}
 */
export function buildFastWindowBatchSql({ fastWindowView, fastWindowColumn, observations }) {
  const columns = observations.flatMap(({ valueExpr, aggregation, where }, index) => {
    const filter = caseFilter(where);
    return [
      ...FAST_WINDOW_COLUMNS.map(
        ([alias, condition]) =>
          `${aggregation}(CASE WHEN ${condition(fastWindowColumn)}${filter} THEN ${valueExpr} END) AS ${observationColumnPrefix(index)}${alias}`,
      ),
      `cast(min(${fastWindowColumn}) AS varchar) AS ${observationColumnPrefix(index)}first_hour`,
    ];
  });
  return `SELECT ${columns.join(",\n       ")}\nFROM   ${fastWindowView}`;
}

// The row's o<index>_* columns, renamed to the unprefixed names toObservationWindows and
// toActivityFastWindows read. A query that answered no row gives undefined.
function observationRow(rows, index) {
  if (!rows[0]) return undefined;
  const prefix = observationColumnPrefix(index);
  return Object.fromEntries(
    Object.entries(rows[0])
      .filter(([column]) => column.startsWith(prefix))
      .map(([column, value]) => [column.slice(prefix.length), value]),
  );
}

/**
 * Groups the observations by `groupKey`, runs one `buildSql` query per group, and reads each
 * observation's own columns back through `toResult`. A failed query fails every observation
 * of its group: their ids go into `failedIds` and they get no result.
 *
 * @returns {Promise<{resultsById: Map<string, object>, failedIds: Set<string>}>}
 */
async function runObservationBatches({ workGroup, database, observations, groupKey, buildSql, toResult, failureMessage }) {
  const groups = new Map();
  for (const observation of observations) {
    const key = groupKey(observation);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(observation);
  }

  const resultsById = new Map();
  const failedIds = new Set();
  await mapInOrderWithConcurrency([...groups.values()], OBSERVATION_QUERY_CONCURRENCY, async (groupObservations) => {
    const sql = buildSql(groupObservations);
    try {
      const rows = await runAthenaQuery({ workGroup, database, sql });
      groupObservations.forEach((observation, index) =>
        resultsById.set(observation.id, toResult(observationRow(rows, index), observation)),
      );
    } catch (error) {
      for (const observation of groupObservations) failedIds.add(observation.id);
      logger.warn({
        message: failureMessage,
        query: sql.slice(sql.lastIndexOf("FROM")),
        observationIds: groupObservations.map((observation) => observation.id),
        error: error.message,
      });
    }
  });
  return { resultsById, failedIds };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

// A fast window with no events reads zero once the hourly view holds any rows at all; a view
// with no rows (a property with no streaming export) reports nothing, which stays null.
export function toActivityFastWindows(row) {
  const reported = row?.first_hour !== null && row?.first_hour !== undefined;
  const fastValue = (value) => toNumberOrNull(value) ?? (reported ? 0 : null);
  return {
    today: { value: fastValue(row?.today) },
    previousDay: { value: fastValue(row?.prev_1) },
    last7: { value: fastValue(row?.last_7) },
  };
}

/**
 * A window's trend against the prior comparable window, as a fraction (0.1 is a 10% rise).
 * Null whenever either side is missing or the prior period was zero, rather than a divide
 * that reads as an infinite or undefined rise.
 */
export function computeTrend(current, previous) {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

// A window whose prior comparable period held nothing has no percentage to show, but a
// non-zero count against an empty prior period is new activity, which the page labels "new".
function newInWindowFlag(current, previous) {
  return current !== null && current > 0 && (previous === null || previous === 0) ? { isNew: true } : {};
}

const WINDOW_END_DAYS_BACK = { today: 0, prev_1: 1, last_7: 0, last_30: 0, prev_30: 30, last_90: 0, prev_90: 90 };

const ukDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

// A window the source covered but that held no rows: a sum is a measured zero; an average has
// no figure to give but is flagged noEvents so the page says "none" rather than "not measured".
// A window that ends before the source's first day stays null.
function readWindow(row, column, aggregation, today) {
  const value = toNumberOrNull(row?.[column]);
  if (value !== null || !row?.first_day) return { value };
  const windowEnd = new Date(today);
  windowEnd.setUTCDate(windowEnd.getUTCDate() - WINDOW_END_DAYS_BACK[column]);
  const windowEndDay = column === "today" || column === "prev_1" ? ukDayFormat.format(windowEnd) : windowEnd.toISOString().slice(0, 10);
  if (row.first_day.slice(0, 10) > windowEndDay) return { value };
  if (aggregation === "sum") return { value: 0 };
  return aggregation === "avg" || aggregation === "ratio" ? { value, noEvents: true } : { value };
}

// Today for a source that reports whole days is its latest reading, whatever day that was: no
// reading is "not measured", never a zero, and the reading's own day travels with the figure.
function readLatestToday(row) {
  const value = toNumberOrNull(row?.today);
  return value === null ? { value: null } : { value, ...(row?.today_as_of ? { asOf: row.today_as_of.slice(0, 10) } : {}) };
}

export function toObservationWindows(row, aggregation, today = new Date(), { latestReading = false, periodic = false } = {}) {
  const current30 = readWindow(row, "last_30", aggregation, today);
  const previous30 = readWindow(row, "prev_30", aggregation, today);
  const current90 = readWindow(row, "last_90", aggregation, today);
  const previous90 = readWindow(row, "prev_90", aggregation, today);
  const [last30, prev30, last90, prev90] = [current30, previous30, current90, previous90].map((window) => window.value);
  const dayWindow = latestReading ? readLatestToday(row) : readWindow(row, "today", aggregation, today);
  const windows = {
    today: periodic ? { value: null, notApplicable: true } : dayWindow,
    previousDay: periodic ? { value: null, notApplicable: true } : readWindow(row, "prev_1", aggregation, today),
    last7: readWindow(row, "last_7", aggregation, today),
    last30: {
      value: last30,
      trend: computeTrend(last30, prev30),
      ...newInWindowFlag(last30, prev30),
      ...(current30.noEvents ? { noEvents: true } : {}),
    },
    last90: {
      value: last90,
      trend: computeTrend(last90, prev90),
      ...newInWindowFlag(last90, prev90),
      ...(current90.noEvents ? { noEvents: true } : {}),
    },
  };
  if (row?.data_since) windows.dataSince = row.data_since;
  return windows;
}

const nullObservationWindows = {
  today: { value: null },
  previousDay: { value: null },
  last7: { value: null },
  last30: { value: null, trend: null },
  last90: { value: null, trend: null },
};

/**
 * The reinvestment loop's figures: trailing 30-day income (the revenue-gbp observation's
 * last30 window) and the budget that income gives at REINVESTMENT_FRACTION. Both are null
 * while the revenue query has no figure, so the page shows no budget rather than a false zero.
 *
 * @param {Array<{id: string, observations: Array<object>}>} objectives
 * @returns {{fraction: number, trailing30IncomeGbp: number|null, budgetGbp: number|null}}
 */
export function buildReinvestment(objectives) {
  const revenue = objectives.flatMap((objective) => objective.observations).find((observation) => observation.id === "revenue-gbp");
  const trailing30IncomeGbp = revenue?.last30?.value ?? null;
  const budgetGbp = trailing30IncomeGbp === null ? null : trailing30IncomeGbp * REINVESTMENT_FRACTION;
  return { fraction: REINVESTMENT_FRACTION, trailing30IncomeGbp, budgetGbp };
}

/**
 * Runs the observations' queries and assembles the snapshot document, organised by objective.
 * Observations that read the same view share one query (buildWindowedBatchSql), and those that
 * read the same hourly view share one fast-window query (buildFastWindowBatchSql).
 *
 * A failed query (e.g. a Glue table that does not exist) answers null for the observations of
 * its view rather than failing the whole snapshot, so one broken table does not stop the other
 * objectives publishing. Each failure is logged at warn level, and every observation it covers
 * is counted in the returned snapshot's failedObservationCount, so the caller can still surface it.
 *
 * @param {{workGroup: string, database: string, context: object}} params
 * @returns {Promise<object>}
 */
// Each query takes a few seconds; run in series, the run went past the Lambda's timeout.
const OBSERVATION_QUERY_CONCURRENCY = 5;

export async function mapInOrderWithConcurrency(items, concurrency, mapItem) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapItem(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function buildSnapshot({ workGroup, database, context }) {
  const allObservations = OBJECTIVE_DEFINITIONS.flatMap((objective) => objective.observations);

  const [fast, windowed] = await Promise.all([
    runObservationBatches({
      workGroup,
      database,
      observations: allObservations.filter((observation) => observation.fastWindowView),
      groupKey: (observation) => `${observation.fastWindowView}|${observation.fastWindowColumn}`,
      buildSql: (observations) =>
        buildFastWindowBatchSql({
          fastWindowView: observations[0].fastWindowView,
          fastWindowColumn: observations[0].fastWindowColumn,
          observations,
        }),
      toResult: toActivityFastWindows,
      failureMessage: "Fast-window query failed, publishing no fast windows for its observations",
    }),
    runObservationBatches({
      workGroup,
      database,
      observations: allObservations,
      groupKey: (observation) => `${observation.view}|${observation.dayColumn}`,
      buildSql: (observations) => buildWindowedBatchSql({ view: observations[0].view, dayColumn: observations[0].dayColumn, observations }),
      toResult: (row, observation) =>
        toObservationWindows(row, observation.aggregation, new Date(), {
          latestReading: LATEST_READING_VIEWS.has(observation.view),
          periodic: isPeriodicDayColumn(observation.dayColumn),
        }),
      failureMessage: "Windowed query failed, publishing null for its observations",
    }),
  ]);
  const failedIds = new Set([...fast.failedIds, ...windowed.failedIds]);

  const objectives = OBJECTIVE_DEFINITIONS.map((objective) => {
    const observations = objective.observations.map((observation) => {
      const windows = windowed.resultsById.get(observation.id) ?? nullObservationWindows;
      const observationResult = {
        id: observation.id,
        label: observation.label,
        ...(observation.description ? { description: observation.description } : {}),
        unit: observation.unit,
        today: windows.today,
        previousDay: windows.previousDay,
        last7: windows.last7,
        last30: windows.last30,
        last90: windows.last90,
        deepLink: observation.deepLink(context),
        source: observation.view,
        measure: measureDescription(observation),
        better: betterDirection(observation.id),
        ...(fast.resultsById.get(observation.id) ?? {}),
      };
      if (windows.dataSince) {
        observationResult.dataSince = windows.dataSince;
      }
      return observationResult;
    });
    return { id: objective.id, name: objective.name, ...OBJECTIVE_GUIDANCE[objective.id], observations };
  });

  return {
    generatedAt: new Date().toISOString(),
    environment: context.envName,
    objectives,
    reinvestment: buildReinvestment(objectives),
    failedObservationCount: failedIds.size,
  };
}

// ---------------------------------------------------------------------------------------------
// Daily charts: one chart per objective the dashboard draws over the last 90 days, one point per
// day, a line per component and (where the parts add up) a total line. Each chart mode runs one
// query that answers long-form rows: day, component, value. Retention reads
// v_returning_submitters_rolling_daily because its quarterly source has no daily grain: the
// daily measure is the customers who submitted in the 90 days up to each day.
// ---------------------------------------------------------------------------------------------

export const DAILY_CHART_DAYS = 90;

export const HOURLY_CHART_HOURS = 168;

const dailyWindowFilter = (dayColumn) => `${dayColumn} > date_add('day', -${DAILY_CHART_DAYS}, current_date)`;
const hourlyWindowFilter = (hourColumn) =>
  `${hourColumn} > date_add('hour', -${HOURLY_CHART_HOURS}, date_trunc('hour', cast(current_timestamp AS timestamp)))`;

const VISITOR_KIND_LABELS = {
  "operator": "Operator",
  "authenticated": "Authenticated user",
  "human": "Human",
  "synthetic": "Synthetic",
  "bot": "Bot",
  "(unclassified)": "Unclassified",
};

const VISITOR_KIND_DESCRIPTIONS = {
  operator: "Google Analytics sessions of the operator, flagged once the operator bundle has loaded in the browser.",
  authenticated: "Google Analytics sessions of signed-in users who are not operators.",
  human: "Google Analytics sessions of visitors who are not signed in and are not flagged as a bot, an operator or a test.",
  synthetic:
    "Distinct visitors from the behaviour tests each day, counted from the CloudFront access log by their DIYAccountingProbe user agent.",
  bot: "Distinct visitors each day whose user agent matches a known crawler, AI agent or the probe monitor, counted from the CloudFront access log.",
};

function activityLabels() {
  const catalog = loadCatalogFromRoot();
  return Object.fromEntries((catalog.activities || []).map((activity) => [activity.id, activity.name]));
}

function longFormSql({ dayExpression, componentExpression, valueExpression, view, dayColumn, where }) {
  const conditions = [dailyWindowFilter(dayColumn), ...(where ? [where] : [])].join(" AND ");
  return (
    `SELECT cast(${dayExpression} AS varchar) AS day, ${componentExpression} AS component, ` +
    `cast(sum(${valueExpression}) AS double) AS value\n` +
    `FROM   ${view}\nWHERE  ${conditions}\nGROUP  BY 1, 2`
  );
}

// One query over an hourly view for the 168 hours to now. The hour comes back as an ISO key in the
// "day" column so buildChartSeries reads it like a daily row.
function hourlyLongFormSql({ componentExpression, valueExpression, view, where }) {
  const conditions = [hourlyWindowFilter("hour"), ...(where ? [where] : [])].join(" AND ");
  return (
    `SELECT date_format(hour, '%Y-%m-%dT%H:00:00Z') AS day, ${componentExpression} AS component, ` +
    `cast(sum(${valueExpression}) AS double) AS value\n` +
    `FROM   ${view}\nWHERE  ${conditions}\nGROUP  BY 1, 2`
  );
}

const STRIPE_DONATION_COMPONENT_CASE =
  `CASE WHEN ${STRIPE_DONATION_PRODUCT_FILTER} THEN 'stripe-donations' ` +
  `WHEN ${PAYPAL_DONATION_PRODUCT_FILTER} THEN 'paypal-donations' ` +
  `WHEN product LIKE 'paypal-%' THEN 'paypal-other' ELSE 'subscriptions' END`;

// The v_contribution_daily column behind each line of the Contribution chart mode, in drawing order.
const CONTRIBUTION_COLUMNS = {
  "revenue": "revenue_gbp",
  "aws-cost": "aws_cost_gbp",
  "ads-cost": "ads_cost_gbp",
  "contribution": "contribution_gbp",
};

// A campaign line carries its platform, so a Google and a Microsoft campaign never share a line.
const CAMPAIGN_COMPONENT = `CASE platform WHEN 'microsoft' THEN 'Microsoft: ' ELSE 'Google: ' END || campaign_name`;

const PLATFORM_LABELS = { google: "Google", microsoft: "Microsoft" };

const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;

/**
 * The line under the Retention graph that lets the graph's submitters be checked against the
 * Submit VAT (HMRC) completions in the activities table: the same window's distinct submitters
 * and completions from the activity events, customers apart from operators and test accounts, beside the
 * graph's own Submitters line on its latest day (read from receipts).
 *
 * @param {{rows: Array<{actor_group: string, submissions: string, submitters: string}>, series: Array<{id: string, values: number[]}>, days: number}} params
 * @returns {string}
 */
export function vatSubmissionReconciliationText({ rows, series, days }) {
  const group = (name) => rows.find((row) => row.actor_group === name) ?? { submissions: "0", submitters: "0" };
  const customer = group("customer");
  const operator = group("operator");
  const test = group("test");
  const receiptSubmitters = series.find((line) => line.id === "submitters-90d")?.values.at(-1) ?? 0;
  return (
    `Last ${days} days, customers: ${plural(customer.submitters, "distinct submitter", "distinct submitters")} in the activity events ` +
    `made ${plural(customer.submissions, "Submit VAT (HMRC) completion", "Submit VAT (HMRC) completions")}; ` +
    `the Submitters line reads ${receiptSubmitters} on its latest day, counted from receipts. ` +
    `Operators apart: ${plural(operator.submitters, "account", "accounts")} made ${plural(operator.submissions, "completion", "completions")}. ` +
    `Test accounts apart: ${plural(test.submitters, "account", "accounts")} made ${plural(test.submissions, "completion", "completions")}. ` +
    `Completions include failed attempts.`
  );
}

/**
 * The charts the dashboard draws. A mode is one set of lines; a chart with two modes (activities:
 * started and completed) shows one at a time. `total` names the sum-of-components line, or is
 * null where the components are steps or measures that do not add up. `maxComponents` folds the
 * smallest components into "Other".
 */
export function buildDailyChartDefinitions() {
  const labels = activityLabels();
  return [
    {
      id: "activity-started-and-completed",
      objectiveId: "activity-started-and-completed",
      title: "Activity started and completed",
      unit: "count",
      note: "Days are UTC. Started counts people opening an activity; Completed counts activities that reached their end. Only activities listed on prod appear.",
      modes: [
        {
          id: "started",
          label: "Started",
          total: "All activities",
          totalDescription: "Starts of every activity added together.",
          labelOf: (id) => labels[id] ?? id,
          descriptionOf: (id) => `Times ${labels[id] ?? id} was started in a day.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "activity",
            valueExpression: "starts",
            view: "v_activity_started_daily",
            dayColumn: "day",
          }),
          hourlySql: hourlyLongFormSql({
            componentExpression: "activity",
            valueExpression: "starts",
            view: "v_activity_started_hourly",
          }),
        },
        {
          id: "completed",
          label: "Completed",
          total: "All activities",
          totalDescription: "Completions of every activity added together.",
          labelOf: (id) => labels[id] ?? id,
          descriptionOf: (id) => `Times ${labels[id] ?? id} was completed in a day.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "activity",
            valueExpression: "completions",
            view: "v_submissions_by_activity_daily",
            dayColumn: "day",
          }),
          hourlySql: hourlyLongFormSql({
            componentExpression: "activity",
            valueExpression: "completions",
            view: "v_submissions_by_activity_hourly",
          }),
        },
      ],
    },
    {
      id: "hmrc-failures",
      objectiveId: "uptime",
      title: "HMRC submission failures",
      unit: "count",
      note: "VAT returns that failed on their way to HMRC, from the activity events. Days are UTC. Failure rate is a percentage of that day's submissions.",
      modes: [
        {
          id: "class",
          label: "By failure class",
          total: "All failures",
          totalDescription: "Failures of every class added together.",
          maxComponents: 8,
          labelOf: (id) => id,
          descriptionOf: (id) => `VAT submissions that failed with the class ${id}.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "failure_class",
            valueExpression: "failures",
            view: "v_hmrc_failures_by_class",
            dayColumn: "day",
          }),
        },
        {
          id: "status",
          label: "By HMRC status",
          total: "All failures",
          totalDescription: "Failures of every HMRC status added together.",
          maxComponents: 8,
          labelOf: (id) => (id === "none" ? "No HMRC status" : `HMRC ${id}`),
          descriptionOf: (id) =>
            id === "none" ? "Failures that never reached HMRC, so carry no status." : `VAT submissions HMRC answered with status ${id}.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "hmrc_status",
            valueExpression: "failures",
            view: "v_hmrc_failures_by_class",
            dayColumn: "day",
          }),
        },
        {
          id: "rate",
          label: "Failure rate",
          total: null,
          labelOf: () => "Failure rate, %",
          descriptionOf: () => "Share of the day's VAT submissions that failed, as a percentage. A day with no submissions has no point.",
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "'failure-rate'",
            valueExpression: "failure_rate * 100",
            view: "v_submission_failure_rate_daily",
            dayColumn: "day",
            where: "failure_rate IS NOT NULL",
          }),
        },
      ],
    },
    {
      id: "conversion-to-submission",
      objectiveId: "conversion-to-submission",
      title: "Conversion to submission",
      unit: "count",
      note: "Steps, left to right: spreadsheet downloads, Submit sessions that came from the spreadsheets and gateway sites, human sessions, customers active that day, those who submitted within 7 days. Google Analytics reports whole days two days late. The last few days have not had their 7 days yet. Active customers shows each app client's customers per day and over 7 days.",
      modes: [
        {
          id: "funnel",
          label: "Funnel",
          total: null,
          descriptionOf: (id) =>
            ({
              "spreadsheet-downloads": "Spreadsheets downloaded from the spreadsheets site, from the GA4 download events.",
              "sessions-from-spreadsheets": "Sessions on the Submit site whose source is the spreadsheets site, from Google Analytics.",
              "sessions-from-www":
                "Sessions on the Submit site whose source is the gateway site (www.diyaccounting.co.uk), from Google Analytics.",
              "human-sessions": "Sessions of visitors classed as human, from Google Analytics; counts visitors who accepted analytics.",
              "active-customers": "Customers who signed in on the day.",
              "submitted-within-7-days": "Of those who signed in on the day, the customers who made a submission within 7 days.",
            })[id],
          componentOrder: [
            "spreadsheet-downloads",
            "sessions-from-spreadsheets",
            "sessions-from-www",
            "human-sessions",
            "active-customers",
            "submitted-within-7-days",
          ],
          labelOf: (id) =>
            ({
              "spreadsheet-downloads": "Spreadsheet downloads",
              "sessions-from-spreadsheets": "Submit sessions from the spreadsheets site",
              "sessions-from-www": "Submit sessions from the gateway site",
              "human-sessions": "Human sessions",
              "active-customers": "Active customers",
              "submitted-within-7-days": "Submitted within 7 days",
            })[id] ?? id,
          sql:
            `SELECT cast(day AS varchar) AS day, 'spreadsheet-downloads' AS component, cast(sum(downloads) AS double) AS value\n` +
            `FROM   v_spreadsheets_downloads_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), 'sessions-from-' || origin, cast(sum(sessions) AS double)\n` +
            `FROM   v_submit_referrals_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), 'human-sessions', cast(sum(sessions) AS double)\n` +
            `FROM   v_visitors_by_kind_daily\nWHERE  ${dailyWindowFilter("day")} AND visitor_kind = 'human'\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(cohort_day AS varchar), 'active-customers', cast(sum(logged_in) AS double)\n` +
            `FROM   v_login_to_submission_funnel\nWHERE  ${dailyWindowFilter("cohort_day")}\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(cohort_day AS varchar), 'submitted-within-7-days', cast(sum(submitted_within_7d) AS double)\n` +
            `FROM   v_login_to_submission_funnel\nWHERE  ${dailyWindowFilter("cohort_day")}\nGROUP  BY 1`,
        },
        {
          id: "active-customers",
          label: "Active customers by app client",
          total: null,
          labelOf: (id) => (id === "all" ? "All clients" : id),
          descriptionOf: (id) =>
            id === "all"
              ? "Distinct signed-in customers who made a call on the day, all app clients together."
              : `Distinct signed-in customers who made a call on the day through the ${id} app client.`,
          sql:
            `SELECT cast(day AS varchar) AS day, app_client AS component, cast(sum(active_users_1d) AS double) AS value\n` +
            `FROM   v_active_customers_7d_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2`,
        },
        {
          id: "active-customers-7d",
          label: "Active customers over 7 days",
          total: null,
          labelOf: (id) => (id === "all" ? "All clients" : id),
          descriptionOf: (id) =>
            id === "all"
              ? "Distinct signed-in customers who made a call in the 7 days to the day, all app clients together."
              : `Distinct signed-in customers who made a call in the 7 days to the day through the ${id} app client.`,
          sql:
            `SELECT cast(day AS varchar) AS day, app_client AS component, cast(sum(active_users_7d) AS double) AS value\n` +
            `FROM   v_active_customers_7d_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2`,
        },
      ],
    },
    {
      id: "conversion-to-paid",
      objectiveId: "conversion-to-paid",
      title: "Conversion to paid",
      unit: "gbp",
      note: "Revenue per day in pounds, by where the money came from; Passes issued is a count of passes per day. Each day is a UTC day.",
      modes: [
        {
          id: "revenue",
          label: "Revenue",
          total: "All revenue",
          totalDescription: "Revenue from every source added together, in pounds.",
          descriptionOf: (id) =>
            ({
              "subscriptions": "Stripe charges for bundles and subscriptions.",
              "stripe-donations": "Stripe charges from the four donation Payment Links.",
              "paypal-donations": "PayPal donation receipts.",
              "paypal-other": "PayPal receipts that are not donations.",
            })[id],
          labelOf: (id) =>
            ({
              "subscriptions": "Subscriptions",
              "stripe-donations": "Stripe donations",
              "paypal-donations": "PayPal donations",
              "paypal-other": "Other PayPal receipts",
            })[id] ?? id,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: STRIPE_DONATION_COMPONENT_CASE,
            valueExpression: "revenue_gbp",
            view: "v_revenue_daily",
            dayColumn: "day",
          }),
        },
        {
          id: "passes",
          label: "Passes issued",
          unit: "count",
          total: null,
          labelOf: () => "Passes issued",
          descriptionOf: () => "Passes issued on the day, of every pass type; a count, not pounds.",
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "'passes-issued'",
            valueExpression: "passes_issued",
            view: "v_pass_redemptions_daily",
            dayColumn: "day",
          }),
        },
        {
          id: "contribution",
          label: "Contribution",
          total: null,
          componentOrder: Object.keys(CONTRIBUTION_COLUMNS),
          labelOf: (id) =>
            ({ "revenue": "Revenue", "aws-cost": "AWS cost", "ads-cost": "Ads cost", "contribution": "Contribution" })[id] ?? id,
          descriptionOf: (id) =>
            ({
              "revenue": "Stripe and PayPal revenue of the day, in pounds.",
              "aws-cost":
                "The day's AWS bill across every account, converted from dollars to pounds at the European Central Bank rate of the day.",
              "ads-cost": "The day's Ads cost on Google and Microsoft together, in pounds.",
              "contribution": "Revenue less AWS cost less Ads cost.",
            })[id],
          sql: Object.entries(CONTRIBUTION_COLUMNS)
            .map(
              ([component, column]) =>
                `SELECT cast(day AS varchar) AS day, '${component}' AS component, cast(${column} AS double) AS value\n` +
                `FROM   v_contribution_daily\nWHERE  ${dailyWindowFilter("day")} AND contribution_gbp IS NOT NULL`,
            )
            .join("\nUNION ALL\n"),
        },
        {
          id: "ads-impressions",
          label: "Ads impressions by campaign",
          unit: "count",
          total: "All campaigns",
          totalDescription: "Impressions of every campaign added together.",
          labelOf: (id) => id,
          descriptionOf: (id) => `Times the ${id} campaign's advertisements were shown in a day.`,
          sql:
            `SELECT cast(day AS varchar) AS day, ${CAMPAIGN_COMPONENT} AS component, cast(sum(impressions) AS double) AS value\n` +
            `FROM   v_ads_cost_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2`,
        },
        {
          id: "ads-clicks",
          label: "Ads clicks by campaign",
          unit: "count",
          total: "All campaigns",
          totalDescription: "Clicks on every campaign added together.",
          maxComponents: 10,
          labelOf: (id) => id,
          descriptionOf: (id) => `Clicks on the ${id} campaign's advertisements in a day.`,
          sql:
            `SELECT cast(day AS varchar) AS day, ${CAMPAIGN_COMPONENT} AS component, cast(sum(clicks) AS double) AS value\n` +
            `FROM   v_ads_cost_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2`,
        },
        {
          id: "ads-ctr",
          label: "Ads click-through rate by campaign",
          unit: "ratio",
          total: null,
          maxComponents: 10,
          labelOf: (id) => id,
          descriptionOf: (id) => `The ${id} campaign's clicks divided by its impressions in a day.`,
          sql:
            `SELECT cast(day AS varchar) AS day, ${CAMPAIGN_COMPONENT} AS component, cast(sum(clicks) AS double) / sum(impressions) AS value\n` +
            `FROM   v_ads_cost_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2\nHAVING sum(impressions) > 0`,
        },
        {
          id: "ads-cpc",
          label: "Ads cost per click by campaign",
          unit: "gbp",
          total: null,
          labelOf: (id) => id,
          descriptionOf: (id) => `The ${id} campaign's cost divided by its clicks in a day, in pounds.`,
          sql:
            `SELECT cast(day AS varchar) AS day, ${CAMPAIGN_COMPONENT} AS component, sum(cost_gbp) / sum(clicks) AS value\n` +
            `FROM   v_ads_cost_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2\nHAVING sum(clicks) > 0`,
        },
        {
          id: "ads-cost",
          label: "Ads cost by platform",
          unit: "gbp",
          total: "All platforms",
          totalDescription: "Google and Microsoft Ads cost added together, in pounds.",
          componentOrder: ["google", "microsoft"],
          labelOf: (id) => PLATFORM_LABELS[id] ?? id,
          descriptionOf: (id) => `The day's ${PLATFORM_LABELS[id] ?? id} Ads cost, in pounds.`,
          sql:
            `SELECT cast(day AS varchar) AS day, platform AS component, cast(sum(cost_gbp) AS double) AS value\n` +
            `FROM   v_ads_cost_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2`,
        },
        {
          id: "ads-paid-landings",
          label: "Paid landings by platform",
          unit: "count",
          total: "All platforms",
          totalDescription: "Landings with a Google or Microsoft click id added together.",
          componentOrder: ["google", "microsoft"],
          labelOf: (id) => PLATFORM_LABELS[id] ?? id,
          descriptionOf: (id) =>
            `Page requests in a day that arrived with a ${id === "microsoft" ? "Microsoft Advertising click id (msclkid)" : "Google Ads click id (gclid)"}.`,
          sql:
            `SELECT cast(day AS varchar) AS day, 'google' AS component, cast(sum(paid_landings) AS double) AS value\n` +
            `FROM   v_paid_landings_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), 'microsoft', cast(sum(msclkid_landings) AS double)\n` +
            `FROM   v_paid_landings_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1`,
        },
        {
          id: "ads-cost-per-paid-landing",
          label: "Cost per paid landing by platform",
          unit: "gbp",
          total: null,
          componentOrder: ["google", "microsoft"],
          labelOf: (id) => PLATFORM_LABELS[id] ?? id,
          descriptionOf: (id) => `The day's ${PLATFORM_LABELS[id] ?? id} Ads cost divided by its paid landings, in pounds.`,
          sql:
            `SELECT cast(day AS varchar) AS day, platform AS component, cast(cost_per_paid_landing_gbp AS double) AS value\n` +
            `FROM   v_ads_cost_per_paid_landing_daily\nWHERE  ${dailyWindowFilter("day")} AND cost_per_paid_landing_gbp IS NOT NULL`,
        },
        {
          id: "ads-conversions",
          label: "Ads conversions by platform",
          unit: "count",
          total: null,
          componentOrder: ["google", "microsoft"],
          labelOf: (id) => PLATFORM_LABELS[id] ?? id,
          descriptionOf: (id) => `Conversions ${PLATFORM_LABELS[id] ?? id} Ads counts in a day. The Google pull does not read conversions.`,
          sql:
            `SELECT cast(day AS varchar) AS day, platform AS component, cast(conversions AS double) AS value\n` +
            `FROM   v_ads_performance_daily\nWHERE  ${dailyWindowFilter("day")} AND conversions IS NOT NULL`,
        },
      ],
    },
    {
      id: "low-running-cost",
      objectiveId: "low-running-cost",
      title: "AWS costs",
      unit: "usd",
      note: "AWS cost across every account in the organisation. Cost shows the 12 largest services and folds the rest into Other.",
      modes: [
        {
          id: "cost",
          label: "Cost",
          total: "All services",
          totalDescription: "Every service in every account added together, in dollars.",
          maxComponents: 12,
          labelOf: (id) => id,
          descriptionOf: (id) => `Dollars billed for ${id} across all accounts.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "service_name",
            valueExpression: "billed_cost_usd",
            view: "v_cost_daily",
            dayColumn: "day",
          }),
        },
        {
          id: "account",
          label: "By account",
          total: "All accounts",
          totalDescription: "Every account added together, in dollars.",
          labelOf: (id) => AWS_ACCOUNT_NAMES_BY_ID[id] ?? id,
          descriptionOf: (id) => `Dollars billed in the ${AWS_ACCOUNT_NAMES_BY_ID[id] ?? "unnamed"} account (${id}).`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "sub_account_id",
            valueExpression: "billed_cost_usd",
            view: "v_cost_daily",
            dayColumn: "day",
          }),
        },
        {
          id: "deployment",
          label: "By deployment",
          total: "All deployments",
          totalDescription: "Every deployment added together, in dollars.",
          maxComponents: 12,
          labelOf: (id) => id,
          descriptionOf: (id) =>
            id === "untagged"
              ? "Dollars billed for charges with no deployment tag."
              : `Dollars billed for resources tagged with deployment ${id}.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "deployment",
            valueExpression: "billed_cost_usd",
            view: "v_cost_daily",
            dayColumn: "day",
          }),
        },
        {
          id: "charge",
          label: "CloudWatch by charge",
          total: "All CloudWatch",
          totalDescription: "Every CloudWatch charge added together, in dollars.",
          maxComponents: 10,
          labelOf: (id) => id,
          descriptionOf: (id) => `Dollars billed for the CloudWatch charge "${id}" across all accounts.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "charge_description",
            valueExpression: "billed_cost_usd",
            view: "v_cost_by_resource_daily",
            dayColumn: "day",
            where: "service_name LIKE '%CloudWatch%'",
          }),
        },
        {
          id: "agent",
          label: "Bedrock per agent result",
          total: null,
          componentOrder: ["cost-per-posted-run", "cost-per-accepted-pr"],
          labelOf: (id) =>
            ({ "cost-per-posted-run": "Per run that posted", "cost-per-accepted-pr": "Per accepted pull request" })[id] ?? id,
          descriptionOf: (id) =>
            ({
              "cost-per-posted-run": "The day's Claude on Bedrock cost divided by the agent runs that posted a result that day.",
              "cost-per-accepted-pr": "The day's Claude on Bedrock cost divided by the agent pull requests a person merged that day.",
            })[id],
          sql:
            `SELECT cast(day AS varchar) AS day, 'cost-per-posted-run' AS component, cast(sum(cost_per_posted_run_usd) AS double) AS value\n` +
            `FROM   v_agent_cost_daily\nWHERE  ${dailyWindowFilter("day")} AND cost_per_posted_run_usd IS NOT NULL\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), 'cost-per-accepted-pr', cast(sum(cost_per_accepted_pr_usd) AS double)\n` +
            `FROM   v_agent_cost_daily\nWHERE  ${dailyWindowFilter("day")} AND cost_per_accepted_pr_usd IS NOT NULL\nGROUP  BY 1`,
        },
      ],
    },
    {
      id: "retention",
      objectiveId: "retention",
      title: "Retention",
      unit: "count",
      note: "The 90-day windows roll: each day counts the customers who submitted in the 90 days up to it, so a figure falls when a submission leaves the window. A returning submitter also submitted in the 90 days before that; the table above reads the same line on its latest day. Active customers over 7 days and New accounts are the bases the submitters come from. Passes issued are a count per day.",
      reconciliation: {
        sql:
          `SELECT actor_group, cast(sum(submissions) AS varchar) AS submissions, cast(count(DISTINCT hashed_sub) AS varchar) AS submitters\n` +
          `FROM   v_vat_submissions_by_actor_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1`,
        text: vatSubmissionReconciliationText,
      },
      modes: [
        {
          id: "retention",
          label: "Retention",
          total: null,
          descriptionOf: (id) =>
            ({
              "submitters-90d": "Distinct customers with a VAT submission in the 90 days up to the day.",
              "returning-submitters-90d": "Of those, the customers who also submitted in the 90 days before that.",
              "renewals": "Subscriptions renewed on the day.",
              "cancellations": "Subscriptions cancelled on the day.",
              "passes-issued": "Passes issued on the day, of every pass type.",
              "active-customers-7d": "Distinct signed-in customers who made a call in the 7 days to the day.",
              "new-accounts": "Accounts opened on the day, test and operator accounts apart.",
            })[id],
          componentOrder: [
            "active-customers-7d",
            "new-accounts",
            "submitters-90d",
            "returning-submitters-90d",
            "renewals",
            "cancellations",
            "passes-issued",
          ],
          labelOf: (id) =>
            ({
              "passes-issued": "Passes issued",
              "submitters-90d": "Submitters, 90 days to this day",
              "returning-submitters-90d": "Returning submitters, 90 days to this day",
              "renewals": "Subscription renewals",
              "cancellations": "Subscription cancellations",
              "active-customers-7d": "Active customers, 7 days to this day",
              "new-accounts": "New accounts",
            })[id] ?? id,
          sql:
            `SELECT cast(day AS varchar) AS day, 'active-customers-7d' AS component, cast(sum(active_users_7d) AS double) AS value\n` +
            `FROM   v_active_customers_7d_daily\nWHERE  ${dailyWindowFilter("day")} AND app_client = 'all'\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(signup_day AS varchar), 'new-accounts', cast(sum(new_accounts) AS double)\n` +
            `FROM   v_signup_to_first_submission\nWHERE  ${dailyWindowFilter("signup_day")}\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar) AS day, 'submitters-90d' AS component, cast(sum(submitters_90d) AS double) AS value\n` +
            `FROM   v_returning_submitters_rolling_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), 'returning-submitters-90d', cast(sum(returning_submitters_90d) AS double)\n` +
            `FROM   v_returning_submitters_rolling_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), 'renewals', cast(sum(renewals) AS double)\n` +
            `FROM   v_subscription_renewals_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), 'cancellations', cast(sum(cancellations) AS double)\n` +
            `FROM   v_subscription_cancellations_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), 'passes-issued', cast(sum(passes_issued) AS double)\n` +
            `FROM   v_pass_redemptions_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1`,
        },
      ],
    },
    {
      id: "visitors",
      objectiveId: "conversion-to-submission",
      title: "Visitors",
      unit: "count",
      note: "Operator, authenticated user and human count Google Analytics sessions, so only visitors who accepted analytics. Synthetic and bot count distinct visitors each day from the CloudFront access log, which Google Analytics cannot see; a visitor is a salted hash of the client address that changes every day, so one visitor is counted once a day and never followed across days. By landing page counts the Google Analytics sessions that began on each page; By country counts the activity events' new sessions, with AI agents apart.",
      modes: [
        {
          id: "sessions",
          label: "Visitors",
          total: null,
          componentOrder: ["operator", "authenticated", "human", "synthetic", "bot"],
          hourlyComponentOrder: ["operator", "authenticated", "human"],
          labelOf: (id) => VISITOR_KIND_LABELS[id] ?? id,
          descriptionOf: (id) => VISITOR_KIND_DESCRIPTIONS[id],
          hourlySql: hourlyLongFormSql({
            componentExpression: "visitor_kind",
            valueExpression: "sessions",
            view: "v_visitors_by_kind_hourly",
            where: "visitor_kind IN ('operator', 'authenticated', 'human')",
          }),
          sql:
            `SELECT cast(day AS varchar) AS day, visitor_kind AS component, cast(sum(sessions) AS double) AS value\n` +
            `FROM   v_visitors_by_kind_daily\nWHERE  ${dailyWindowFilter("day")} AND visitor_kind IN ('operator', 'authenticated', 'human')\nGROUP  BY 1, 2\n` +
            `UNION ALL\n` +
            `SELECT cast(day AS varchar), visitor_kind, cast(sum(visitors) AS double)\n` +
            `FROM   v_visitors_cloudfront_daily\nWHERE  ${dailyWindowFilter("day")}\nGROUP  BY 1, 2`,
        },
        {
          id: "landing-page",
          label: "By landing page",
          total: "All landing pages",
          totalDescription: "Sessions of every landing page added together.",
          maxComponents: 10,
          labelOf: (id) => id,
          descriptionOf: (id) => `Google Analytics sessions that began on ${id}.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "landing_page",
            valueExpression: "sessions",
            view: "v_ga4_landing_pages_daily",
            dayColumn: "day",
          }),
        },
        {
          id: "landing-page-sign-in",
          label: "Sign-in rate by landing page",
          unit: "ratio",
          total: null,
          labelOf: (id) => id,
          descriptionOf: (id) =>
            `The share of sessions that began on ${id} and went on to sign in. The ten landing pages with most sessions in the window.`,
          sql:
            `SELECT cast(day AS varchar) AS day, landing_page AS component, cast(sum(sign_ins) AS double) / sum(sessions) AS value\n` +
            `FROM   v_ga4_landing_pages_daily\nWHERE  ${dailyWindowFilter("day")} AND landing_page IN (\n` +
            `  SELECT landing_page FROM v_ga4_landing_pages_daily WHERE ${dailyWindowFilter("day")}\n` +
            `  GROUP BY 1 ORDER BY sum(sessions) DESC LIMIT 10)\nGROUP  BY 1, 2\nHAVING sum(sessions) > 0`,
        },
        {
          id: "country",
          label: "By country",
          total: "All countries",
          totalDescription: "Sessions of every country added together, AI agents apart.",
          maxComponents: 10,
          labelOf: (id) => id,
          descriptionOf: (id) => `Sessions from ${id} that are not AI agents, from the activity events.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "country",
            valueExpression: "human_sessions",
            view: "v_traffic_by_country_daily",
            dayColumn: "day",
          }),
        },
        {
          id: "ai-agent-country",
          label: "AI agents by country",
          total: "All AI-agent sessions",
          totalDescription: "Sessions by AI agents from every country added together.",
          maxComponents: 10,
          labelOf: (id) => id,
          descriptionOf: (id) => `Sessions by AI agents from ${id}, from the activity events.`,
          sql: longFormSql({
            dayExpression: "day",
            componentExpression: "country",
            valueExpression: "ai_agent_sessions",
            view: "v_traffic_by_country_daily",
            dayColumn: "day",
          }),
        },
      ],
    },
  ];
}

/**
 * The last `count` UTC calendar days ending on `endDay` (an ISO date), oldest first. Athena's
 * current_date is UTC, so these are the days its `day > date_add('day', -90, current_date)`
 * filter returns.
 */
export function dailyChartDays(endDay, count = DAILY_CHART_DAYS) {
  const end = new Date(`${endDay}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (count - 1 - index));
    return day.toISOString().slice(0, 10);
  });
}

/**
 * The last `count` UTC hours ending on the hour that contains `now`, oldest first, as ISO keys
 * like `2026-09-08T14:00:00Z`: the hours the hourly charts' `hour > now_hour - 168 hours` filter returns.
 */
export function hourlyChartHours(now, count = HOURLY_CHART_HOURS) {
  const end = new Date(now);
  end.setUTCMinutes(0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const hour = new Date(end.getTime() - (count - 1 - index) * 3600000);
    return hour.toISOString().slice(0, 13) + ":00:00Z";
  });
}

/**
 * Turns long-form rows (day, component, value) into one series per component with a value for
 * every day (zero where the query returned nothing), ordered by `componentOrder` or by the
 * window total, largest first; optionally folds the smallest into "Other"; and adds the total
 * line when the mode names one.
 */
export function buildChartSeries({ days, rows, mode }) {
  const dayIndex = new Map(days.map((day, index) => [day, index]));
  const valuesByComponent = new Map();
  for (const row of rows) {
    const index = dayIndex.get(row.day);
    if (index === undefined || row.component === null || row.component === undefined) continue;
    if (!valuesByComponent.has(row.component)) valuesByComponent.set(row.component, new Array(days.length).fill(0));
    valuesByComponent.get(row.component)[index] += Number(row.value ?? 0);
  }

  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const describe = (id) => (mode.descriptionOf ? { description: mode.descriptionOf(id) } : {});
  let components = [...valuesByComponent.entries()].map(([id, values]) => ({ id, label: mode.labelOf(id), ...describe(id), values }));
  if (mode.componentOrder) {
    components = mode.componentOrder.map(
      (id) =>
        components.find((component) => component.id === id) ?? {
          id,
          label: mode.labelOf(id),
          ...describe(id),
          values: new Array(days.length).fill(0),
        },
    );
  } else {
    components.sort((a, b) => sum(b.values) - sum(a.values) || a.label.localeCompare(b.label));
  }
  if (mode.maxComponents && components.length > mode.maxComponents) {
    const kept = components.slice(0, mode.maxComponents);
    const folded = components.slice(mode.maxComponents);
    kept.push({
      id: "other",
      label: "Other",
      description: `The ${folded.length} smaller lines added together.`,
      values: days.map((_, index) => sum(folded.map((component) => component.values[index]))),
    });
    components = kept;
  }

  const series = components.map((component) => ({ ...component, values: component.values.map((value) => Math.round(value * 100) / 100) }));
  if (mode.total) {
    series.unshift({
      id: "total",
      label: mode.total,
      ...(mode.totalDescription ? { description: mode.totalDescription } : {}),
      isTotal: true,
      values: days.map((_, index) => Math.round(sum(components.map((component) => component.values[index])) * 100) / 100),
    });
  }
  return series;
}

/**
 * Runs each chart mode's query and assembles the daily charts for the snapshot. A mode whose
 * query fails leaves its chart out and is returned in `failedChartIds`, so one missing view does
 * not stop the other charts publishing.
 *
 * @returns {Promise<{dailyCharts: {days: string[], hours: string[], charts: object[]}, failedChartIds: string[]}>}
 */
export async function buildDailyCharts({ workGroup, database, endDay = new Date().toISOString().slice(0, 10), now = new Date() }) {
  const days = dailyChartDays(endDay);
  const hours = hourlyChartHours(now);
  const definitions = buildDailyChartDefinitions();
  const failedChartIds = new Set();

  const modeResults = await mapInOrderWithConcurrency(
    definitions.flatMap((definition) => definition.modes.map((mode) => ({ definition, mode }))),
    OBSERVATION_QUERY_CONCURRENCY,
    async ({ definition, mode }) => {
      try {
        const rows = await runAthenaQuery({ workGroup, database, sql: mode.sql });
        let hourly = null;
        if (mode.hourlySql) {
          try {
            const hourlyRows = await runAthenaQuery({ workGroup, database, sql: mode.hourlySql });
            hourly = {
              series: buildChartSeries({
                days: hours,
                rows: hourlyRows,
                mode: { ...mode, componentOrder: mode.hourlyComponentOrder ?? mode.componentOrder },
              }),
            };
          } catch (error) {
            failedChartIds.add(`${definition.id}-hourly`);
            logger.warn({
              message: "Hourly chart query failed, publishing the chart without its hourly series",
              chartId: definition.id,
              mode: mode.id,
              error: error.message,
            });
          }
        }
        return {
          chartId: definition.id,
          mode: {
            id: mode.id,
            label: mode.label,
            ...(mode.unit ? { unit: mode.unit } : {}),
            series: buildChartSeries({ days, rows, mode }),
            ...(hourly ? { hourly } : {}),
          },
        };
      } catch (error) {
        failedChartIds.add(definition.id);
        logger.warn({
          message: "Daily chart query failed, publishing no chart for it",
          chartId: definition.id,
          mode: mode.id,
          error: error.message,
        });
        return null;
      }
    },
  );

  const charts = definitions
    .filter((definition) => !failedChartIds.has(definition.id))
    .map(({ id, objectiveId, title, unit, note }) => ({
      id,
      objectiveId,
      title,
      unit,
      ...(note ? { note } : {}),
      modes: modeResults.filter((result) => result && result.chartId === id).map((result) => result.mode),
    }));

  // A reconciliation query that fails leaves its chart without the line and still counts as a failure.
  for (const chart of charts) {
    const { reconciliation } = definitions.find((definition) => definition.id === chart.id);
    if (!reconciliation) continue;
    try {
      const rows = await runAthenaQuery({ workGroup, database, sql: reconciliation.sql });
      const series = chart.modes.flatMap((mode) => mode.series);
      chart.reconciliation = reconciliation.text({ rows, series, days: days.length });
    } catch (error) {
      failedChartIds.add(`${chart.id}-reconciliation`);
      logger.warn({
        message: "Chart reconciliation query failed, publishing no reconciliation line",
        chartId: chart.id,
        error: error.message,
      });
    }
  }
  return { dailyCharts: { days, hours, charts }, failedChartIds: [...failedChartIds] };
}

export const COST_DRIVER_DAYS = 30;
export const COST_DRIVER_COUNT = 10;

// The log group, alarm or canary an ARN names, without the partition, service, region and
// account: "arn:aws:logs:eu-west-2:123:log-group:/aws/x" reads "log-group:/aws/x". A value that
// is not an ARN is returned as it is.
export function shortResourceName(resourceId) {
  const parts = String(resourceId).split(":");
  return parts[0] === "arn" && parts.length > 5 ? parts.slice(5).join(":") : resourceId;
}

/**
 * The most expensive CloudWatch charges over the last COST_DRIVER_DAYS days, each a resource (a
 * log group, an alarm, a canary) and the charge on it, across every account in the organisation.
 * The FOCUS export names no resource for some charges, which group under "(no resource)".
 *
 * @returns {Promise<{days: number, rows: Array<{charge: string, resource: string, resourceId: string, costUsd: number}>}>}
 */
export async function buildCostDrivers({ workGroup, database }) {
  const rows = await runAthenaQuery({
    workGroup,
    database,
    sql:
      `SELECT charge_description, resource_id, cast(sum(billed_cost_usd) AS double) AS cost_usd\n` +
      `FROM   v_cost_by_resource_daily\n` +
      `WHERE  day > date_add('day', -${COST_DRIVER_DAYS}, current_date) AND service_name LIKE '%CloudWatch%'\n` +
      `GROUP  BY 1, 2\nORDER  BY 3 DESC\nLIMIT  ${COST_DRIVER_COUNT}`,
  });
  return {
    days: COST_DRIVER_DAYS,
    rows: rows.map((row) => ({
      charge: row.charge_description,
      resource: shortResourceName(row.resource_id),
      resourceId: row.resource_id,
      costUsd: Number(row.cost_usd),
    })),
  };
}

/**
 * The paying subscribers of the latest month with a charge, each row an acquisition
 * channel and bundle with its active subscribers, monthly recurring revenue and annualised
 * recurring revenue, and the three figures added over every row. A subscriber with no recorded
 * channel reads "unknown". The totals add the rows, so a customer paying for two bundles counts
 * once in each.
 *
 * @returns {Promise<{month: string|null, rows: Array<{source: string, bundleId: string, subscribers: number, mrrGbp: number, arrGbp: number}>, totals: {subscribers: number, mrrGbp: number, arrGbp: number}}>}
 */
export async function buildPaidSubscribers({ workGroup, database }) {
  const rows = await runAthenaQuery({
    workGroup,
    database,
    sql:
      `SELECT cast(month AS varchar) AS month, source, bundle_id, cast(active_subscribers AS double) AS subscribers,\n` +
      `       cast(mrr_gbp AS double) AS mrr_gbp, cast(arr_gbp AS double) AS arr_gbp\n` +
      `FROM   v_paid_subscribers_by_channel\n` +
      `WHERE  month = (SELECT max(month) FROM v_paid_subscribers_by_channel)\nORDER  BY mrr_gbp DESC, source, bundle_id`,
  });
  const entries = rows.map((row) => ({
    source: row.source,
    bundleId: row.bundle_id,
    subscribers: Number(row.subscribers),
    mrrGbp: Number(row.mrr_gbp),
    arrGbp: Number(row.arr_gbp),
  }));
  const total = (key) => entries.reduce((sum, entry) => sum + entry[key], 0);
  return {
    month: rows[0]?.month ?? null,
    rows: entries,
    totals: { subscribers: total("subscribers"), mrrGbp: total("mrrGbp"), arrGbp: total("arrGbp") },
  };
}

/**
 * Writes the snapshot to its latest pointer and a dated copy alongside it, so the page always
 * reads the same key while a historical run stays available under its own date.
 *
 * @param {{bucket: string, envName: string, snapshot: object}} params
 */
export async function writeSnapshot({ bucket, envName, snapshot }) {
  const s3Client = getS3Client();
  const body = JSON.stringify(snapshot, null, 2);
  const date = snapshot.generatedAt.slice(0, 10);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `snapshots/${envName}/latest.json`,
      Body: body,
      ContentType: "application/json",
    }),
  );
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `snapshots/${envName}/${date}.json`,
      Body: body,
      ContentType: "application/json",
    }),
  );
}

/**
 * Rebuilds every objective and publishes the snapshot. The ingestion state machine runs it as
 * its last step, so the daily sources have landed before it reads.
 */
export async function handler() {
  const envName = process.env.ENVIRONMENT_NAME;
  const workGroup = process.env.ATHENA_WORK_GROUP_NAME;
  const database = process.env.GLUE_DATABASE_NAME;
  const lakeBucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME environment variable is required");
  if (!workGroup) throw new Error("ATHENA_WORK_GROUP_NAME environment variable is required");
  if (!database) throw new Error("GLUE_DATABASE_NAME environment variable is required");
  if (!lakeBucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");

  const context = {
    envName,
    region: process.env.AWS_REGION || "eu-west-2",
    athenaWorkGroupName: workGroup,
    githubRepo: process.env.GITHUB_REPO || "diy-accounting-uk/submit.diyaccounting.co.uk",
    ga4PropertyId: process.env.GA4_PROPERTY_ID || null,
  };

  const built = await buildSnapshot({ workGroup, database, context });
  const { dailyCharts, failedChartIds } = await buildDailyCharts({ workGroup, database });
  let costDrivers = null;
  let failedCostDrivers = 0;
  try {
    costDrivers = await buildCostDrivers({ workGroup, database });
  } catch (error) {
    failedCostDrivers = 1;
    logger.warn({ message: "Cost drivers query failed, publishing none", error: error.message });
  }
  let paidSubscribers = null;
  let failedPaidSubscribers = 0;
  try {
    paidSubscribers = await buildPaidSubscribers({ workGroup, database });
  } catch (error) {
    failedPaidSubscribers = 1;
    logger.warn({ message: "Paid subscribers query failed, publishing none", error: error.message });
  }
  const snapshot = {
    ...built,
    dailyCharts,
    ...(costDrivers ? { costDrivers } : {}),
    ...(paidSubscribers ? { paidSubscribers } : {}),
    failedObservationCount: built.failedObservationCount + failedChartIds.length + failedCostDrivers + failedPaidSubscribers,
  };
  await writeSnapshot({ bucket: lakeBucket, envName, snapshot });

  logger.info({
    message: "Operator snapshot published",
    environment: envName,
    objectives: snapshot.objectives.length,
    failedObservations: snapshot.failedObservationCount,
  });

  // The snapshot is already published at this point, with a null for every observation whose
  // query failed. Throwing here, after that write, is what still counts as a Lambda invocation
  // error - the errorsAlarm (OperatorSnapshotPublish.java) reads the function's own Errors
  // metric, so this is what keeps a broken table visible without re-blocking the rest of the
  // snapshot on it.
  if (snapshot.failedObservationCount > 0) {
    throw new Error(`Operator snapshot published with ${snapshot.failedObservationCount} observation(s) failing their Athena query`);
  }

  return { environment: envName, objectives: snapshot.objectives.length };
}
