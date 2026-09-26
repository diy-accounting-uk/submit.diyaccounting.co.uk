// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/operatorSnapshotPublish.js
//
// Nightly (prod) or weekly (ci) job that reads the analytics views behind the one-stop
// objectives dashboard and writes one JSON snapshot per environment: the trailing 30 and 90
// days for each of the eight objectives' observations, each carrying its value, its trend
// against the prior comparable period, and a deep link to where the operator can see more.
// An hourly "activity-only" run (prod only) refreshes just the activities objective's Last 1
// hour/1 day/7 days columns in between, patching them onto that snapshot rather than rebuilding
// it — see handler()'s mode branch. The API route (operatorSnapshotGet.js) only ever reads what
// this Lambda writes; it never queries Athena itself, so the dashboard stays fast even while a
// query here is slow.

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
import { readLatestSnapshot } from "./operatorSnapshotGet.js";

const logger = createLogger({ source: "app/functions/analytics/operatorSnapshotPublish.js" });

// The one objective an "activity-only" run refreshes: see handler()'s mode branch.
const ACTIVITY_OBJECTIVE_ID = "activity-started-and-completed";

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
      // v_activity_started_daily groups by whole calendar day, which cannot answer a trailing
      // 1-hour or 1-day window accurately (see v_activity_started_hourly.sql), so the fast
      // columns read from the hourly view instead, in the same query shape.
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
 * per month and v_returning_submitters_quarterly one row per quarter. buildWindowedSql's
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
        dailySeries: true,
        deepLink: (ctx) => buildGa4ReportsLink(ctx.ga4PropertyId),
      },
      {
        id: "sessions-bot",
        label: "Sessions, bot visitors",
        unit: "count",
        view: "v_visitors_by_kind_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        where: "visitor_kind = 'bot'",
        dailySeries: true,
        deepLink: (ctx) => buildGa4ReportsLink(ctx.ga4PropertyId),
      },
      {
        id: "sessions-synthetic",
        label: "Sessions, synthetic visitors",
        unit: "count",
        view: "v_visitors_by_kind_daily",
        dayColumn: "day",
        valueExpr: "sessions",
        aggregation: "sum",
        where: "visitor_kind = 'synthetic'",
        dailySeries: true,
        deepLink: (ctx) => buildGa4ReportsLink(ctx.ga4PropertyId),
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
    ],
  },
  {
    id: "low-running-cost",
    name: "Low running cost",
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
        id: "cost-per-completion-usd",
        label: "Cost per completion",
        unit: "usd",
        view: "v_cost_per_submission_daily",
        dayColumn: "day",
        valueExpr: "cost_per_completion_usd",
        aggregation: "avg",
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
        id: "returning-submitters",
        label: "Returning submitters",
        unit: "count",
        view: "v_returning_submitters_quarterly",
        dayColumn: "quarter",
        valueExpr: "returning_submitters",
        aggregation: "sum",
        deepLink: (ctx) => buildCloudWatchDashboardLink(ctx.region, `${ctx.envName}-env-analytics`),
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

export function parseResultSet(resultSet) {
  const rows = resultSet?.Rows ?? [];
  if (rows.length === 0) return [];

  const header = rows[0].Data.map((cell) => cell.VarCharValue);
  return rows.slice(1).map((row) => {
    const record = {};
    header.forEach((columnName, index) => {
      record[columnName] = row.Data?.[index]?.VarCharValue ?? null;
    });
    return record;
  });
}

export async function runAthenaQuery({ workGroup, database, sql }) {
  const athenaClient = getAthenaClient();

  const { QueryExecutionId } = await athenaClient.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: { Database: database },
      WorkGroup: workGroup,
    }),
  );

  await pollUntilTerminal(athenaClient, QueryExecutionId);

  const { ResultSet } = await athenaClient.send(new GetQueryResultsCommand({ QueryExecutionId }));
  return parseResultSet(ResultSet);
}

/**
 * One query per observation, computing the trailing 30 and 90 day figures and their
 * immediately preceding comparable periods (the 30 or 90 days before that) in a single pass,
 * so a day with no rows for a window reads as SQL NULL rather than a false zero.
 *
 * @param {{view: string, dayColumn: string, valueExpr: string, aggregation: string, where?: string}} observation
 * @returns {string}
 */
export function buildWindowedSql({ view, dayColumn, valueExpr, aggregation, where }) {
  const whereClause = where ? `\nWHERE  ${where}` : "";
  return (
    `SELECT ${aggregation}(CASE WHEN ${dayColumn} > date_add('day', -30, current_date) THEN ${valueExpr} END) AS last_30,\n` +
    `       ${aggregation}(CASE WHEN ${dayColumn} > date_add('day', -60, current_date) AND ${dayColumn} <= date_add('day', -30, current_date) THEN ${valueExpr} END) AS prev_30,\n` +
    `       ${aggregation}(CASE WHEN ${dayColumn} > date_add('day', -90, current_date) THEN ${valueExpr} END) AS last_90,\n` +
    `       ${aggregation}(CASE WHEN ${dayColumn} > date_add('day', -180, current_date) AND ${dayColumn} <= date_add('day', -90, current_date) THEN ${valueExpr} END) AS prev_90\n` +
    `FROM   ${view}${whereClause}`
  );
}

/**
 * One row per day for the trailing 30 days, for an observation flagged `dailySeries: true`.
 * The windowed query above answers a single total for the period; the operator dashboard's
 * Visitors panel needs the day-by-day breakdown instead, so this runs as a second query
 * alongside it for those observations only.
 *
 * @param {{view: string, dayColumn: string, valueExpr: string, aggregation: string, where?: string}} observation
 * @returns {string}
 */
export function buildDailySeriesSql({ view, dayColumn, valueExpr, aggregation, where }) {
  const conditions = [`${dayColumn} > date_add('day', -30, current_date)`];
  if (where) conditions.push(where);
  return (
    `SELECT ${dayColumn} AS day,\n` +
    `       ${aggregation}(${valueExpr}) AS value\n` +
    `FROM   ${view}\n` +
    `WHERE  ${conditions.join(" AND ")}\n` +
    `GROUP BY ${dayColumn}\n` +
    `ORDER BY ${dayColumn}`
  );
}

/**
 * The three fast, no-trend columns on the operator dashboard's Activities table (Last 1 hour,
 * Last 1 day, Last 7 days), computed against an hourly-grain view rather than
 * buildWindowedSql's `dayColumn`: a column truncated to a whole calendar day always reads as
 * "today" or "not today" against an hour-old cutoff, never a genuine trailing hour.
 *
 * @param {{fastWindowView: string, fastWindowColumn: string, valueExpr: string, aggregation: string, where?: string}} observation
 * @returns {string}
 */
export function buildActivityFastWindowSql({ fastWindowView, fastWindowColumn, valueExpr, aggregation, where }) {
  const whereClause = where ? `\nWHERE  ${where}` : "";
  return (
    `SELECT ${aggregation}(CASE WHEN ${fastWindowColumn} > date_add('hour', -1, current_timestamp) THEN ${valueExpr} END) AS last_1h,\n` +
    `       ${aggregation}(CASE WHEN ${fastWindowColumn} > date_add('day', -1, current_timestamp) THEN ${valueExpr} END) AS last_1d,\n` +
    `       ${aggregation}(CASE WHEN ${fastWindowColumn} > date_add('day', -7, current_timestamp) THEN ${valueExpr} END) AS last_7d\n` +
    `FROM   ${fastWindowView}${whereClause}`
  );
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function toDailySeries(rows) {
  return (rows || []).map((row) => ({ day: row.day, value: toNumberOrNull(row.value) }));
}

export function toActivityFastWindows(row) {
  return {
    last1h: { value: toNumberOrNull(row?.last_1h) },
    last1d: { value: toNumberOrNull(row?.last_1d) },
    last7d: { value: toNumberOrNull(row?.last_7d) },
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

export function toObservationWindows(row) {
  const last30 = toNumberOrNull(row?.last_30);
  const prev30 = toNumberOrNull(row?.prev_30);
  const last90 = toNumberOrNull(row?.last_90);
  const prev90 = toNumberOrNull(row?.prev_90);
  return {
    last30: { value: last30, trend: computeTrend(last30, prev30) },
    last90: { value: last90, trend: computeTrend(last90, prev90) },
  };
}

const nullObservationWindows = { last30: { value: null, trend: null }, last90: { value: null, trend: null } };

/**
 * Runs every observation's query and assembles the snapshot document, organised by objective.
 *
 * A single observation's Athena query failing (e.g. a Glue table that does not exist) answers
 * null for that observation rather than failing the whole snapshot, so one broken table does not
 * stop the other objectives publishing. Each failure is logged at warn level and counted in the
 * returned snapshot's failedObservationCount, so the caller can still surface it.
 *
 * `objectiveIds`, when given, builds only those objectives instead of every one in
 * OBJECTIVE_DEFINITIONS — the activity-only run's way of refreshing just the activities
 * objective without re-running the other seven.
 *
 * `fastWindowOnly` skips the 30/90-day buildWindowedSql query entirely (and dailySeries with
 * it) and answers only each observation's `id` plus its last1h/last1d/last7d fields, for an
 * observation that carries a `fastWindowView` (only the activity objective's observations do).
 * The result is a patch to merge onto an existing snapshot with mergeActivityFastWindows, not a
 * standalone snapshot: it carries no label, unit or deepLink, and every non-activity objective
 * comes back with a full observation list but no queries actually run for it (see
 * OBJECTIVE_DEFINITIONS filtering above) unless objectiveIds also names it.
 *
 * @param {{workGroup: string, database: string, context: object, objectiveIds?: string[], fastWindowOnly?: boolean}} params
 * @returns {Promise<object>}
 */
// Each observation is one or two Athena queries of a few seconds each; run in series, the
// activities objective's per-activity pairs took the run past the Lambda's timeout.
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

export async function buildSnapshot({ workGroup, database, context, objectiveIds, fastWindowOnly = false }) {
  const objectiveDefinitions = objectiveIds
    ? OBJECTIVE_DEFINITIONS.filter((objective) => objectiveIds.includes(objective.id))
    : OBJECTIVE_DEFINITIONS;

  const objectives = [];
  let failedObservationCount = 0;
  for (const objective of objectiveDefinitions) {
    const observations = await mapInOrderWithConcurrency(objective.observations, OBSERVATION_QUERY_CONCURRENCY, async (observation) => {
      let windows = nullObservationWindows;
      let dailySeries = [];
      let fastWindows = {};
      try {
        if (!fastWindowOnly) {
          const sql = buildWindowedSql(observation);
          const rows = await runAthenaQuery({ workGroup, database, sql });
          windows = toObservationWindows(rows[0]);

          if (observation.dailySeries) {
            const dailySql = buildDailySeriesSql(observation);
            const dailyRows = await runAthenaQuery({ workGroup, database, sql: dailySql });
            dailySeries = toDailySeries(dailyRows);
          }
        }

        if (observation.fastWindowView) {
          const fastSql = buildActivityFastWindowSql(observation);
          const fastRows = await runAthenaQuery({ workGroup, database, sql: fastSql });
          fastWindows = toActivityFastWindows(fastRows[0]);
        }
      } catch (error) {
        failedObservationCount += 1;
        logger.warn({
          message: "Observation query failed, publishing null for it",
          observationId: observation.id,
          view: observation.view,
          error: error.message,
        });
      }

      if (fastWindowOnly) {
        return { id: observation.id, ...fastWindows };
      }
      const observationResult = {
        id: observation.id,
        label: observation.label,
        unit: observation.unit,
        last30: windows.last30,
        last90: windows.last90,
        deepLink: observation.deepLink(context),
        ...fastWindows,
      };
      if (observation.dailySeries) {
        observationResult.dailySeries = dailySeries;
      }
      return observationResult;
    });
    objectives.push({ id: objective.id, name: objective.name, observations });
  }

  return {
    generatedAt: new Date().toISOString(),
    environment: context.envName,
    objectives,
    failedObservationCount,
  };
}

/**
 * Patches an existing snapshot's activity objective with a fastWindowOnly-built patch,
 * overlaying only the patched observations' last1h/last1d/last7d fields and leaving every
 * other field on every other observation — and every other objective entirely — untouched.
 * This is what lets the hourly activity-only run refresh three columns without blanking the
 * other seven objectives, which only the nightly full run recomputes.
 *
 * @param {object} existingSnapshot - the snapshot read back from snapshots/<env>/latest.json
 * @param {object} patchSnapshot - buildSnapshot's result with objectiveIds: [ACTIVITY_OBJECTIVE_ID], fastWindowOnly: true
 * @returns {object}
 */
export function mergeActivityFastWindows(existingSnapshot, patchSnapshot) {
  const patchObjective = patchSnapshot.objectives.find((objective) => objective.id === ACTIVITY_OBJECTIVE_ID);
  const patchById = new Map((patchObjective?.observations ?? []).map((patch) => [patch.id, patch]));

  const objectives = (existingSnapshot.objectives ?? []).map((objective) => {
    if (objective.id !== ACTIVITY_OBJECTIVE_ID) return objective;
    return {
      ...objective,
      observations: objective.observations.map((observation) => {
        const patch = patchById.get(observation.id);
        if (!patch) return observation;
        return { ...observation, last1h: patch.last1h, last1d: patch.last1d, last7d: patch.last7d };
      }),
    };
  });

  return {
    ...existingSnapshot,
    generatedAt: patchSnapshot.generatedAt,
    objectives,
    failedObservationCount: patchSnapshot.failedObservationCount,
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
 * `event.mode` picks what this invocation refreshes: "full" rebuilds every objective the way
 * this Lambda always has (the nightly and weekly schedules); "activity-only" runs only the
 * activities objective's fast-window queries and patches them onto the existing snapshot (the
 * hourly schedule). There is no default: a schedule that forgot to set it is a configuration
 * bug, not a case to guess at.
 */
export async function handler(event) {
  const envName = process.env.ENVIRONMENT_NAME;
  const workGroup = process.env.ATHENA_WORK_GROUP_NAME;
  const database = process.env.GLUE_DATABASE_NAME;
  const lakeBucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME environment variable is required");
  if (!workGroup) throw new Error("ATHENA_WORK_GROUP_NAME environment variable is required");
  if (!database) throw new Error("GLUE_DATABASE_NAME environment variable is required");
  if (!lakeBucket) throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");

  const mode = event?.mode;
  if (mode !== "full" && mode !== "activity-only") {
    throw new Error(`event.mode must be "full" or "activity-only", got: ${JSON.stringify(mode)}`);
  }

  const context = {
    envName,
    region: process.env.AWS_REGION || "eu-west-2",
    athenaWorkGroupName: workGroup,
    githubRepo: process.env.GITHUB_REPO || "diy-accounting-uk/submit.diyaccounting.co.uk",
    ga4PropertyId: process.env.GA4_PROPERTY_ID || null,
  };

  let snapshot;
  if (mode === "full") {
    snapshot = await buildSnapshot({ workGroup, database, context });
  } else {
    const existing = await readLatestSnapshot();
    if (!existing) {
      throw new Error("No existing snapshot to patch in activity-only mode; the full run has not published one yet");
    }
    const patch = await buildSnapshot({
      workGroup,
      database,
      context,
      objectiveIds: [ACTIVITY_OBJECTIVE_ID],
      fastWindowOnly: true,
    });
    snapshot = mergeActivityFastWindows(existing, patch);
  }
  await writeSnapshot({ bucket: lakeBucket, envName, snapshot });

  logger.info({
    message: "Operator snapshot published",
    environment: envName,
    mode,
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
